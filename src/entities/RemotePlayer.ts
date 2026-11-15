import * as THREE from 'three';
import {
  BOT_DIFFICULTY_PROFILES,
  BotDifficulty,
  MATCH_CONFIG,
  PHYSICS,
  TICK_DT,
} from '../config/Constants';
import { WEAPON_DATA, WeaponId } from '../config/WeaponData';
import { CollisionWorld, WorldRayHit } from '../physics/CollisionWorld';
import {
  createKinematicState,
  getEyeHeight,
  KinematicInput,
  KinematicState,
  stepKinematics,
} from '../physics/Kinematics';
import { HitboxRig, PlayerPose } from './HitboxRig';
import { PlayerSnapTuple } from '../network/Protocol';

export interface RemoteSnapshot {
  tick: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  crouchAlpha: number;
  hp: number;
  shield: number;
  wpn: WeaponId;
  ammo: number;
  tagTimer: number;
}

const SNAP_RING_SIZE = 32;
const INTERP_DELAY_TICKS = 2.0; // 33.3ms

// Tactical waypoints across Ascent Mid for Bot AI (Catwalk, Courtyard, Top Mid, Market)
const BOT_WAYPOINTS_ATTACKER: [number, number][] = [
  [0, -21],
  [-4.5, -14],
  [-9.5, -6],
  [-9.5, 2],
  [2.0, -5.5],
  [5.5, -1.0],
  [0.0, 6.0],
];

const BOT_WAYPOINTS_DEFENDER: [number, number][] = [
  [0, 22],
  [-3.5, 16],
  [2.5, 8],
  [6.5, 6],
  [12.5, 6],
  [1.5, -1.0],
  [-9.5, 4],
];

export class RemotePlayer {
  public playerId: 1 | 2 = 2;
  public readonly rig = new HitboxRig(true);
  public state: KinematicState = createKinematicState(0, 0, 31, 0);

  public hp = 100;
  public shield = 0;
  public alive = true;
  public credits: number = MATCH_CONFIG.START_CREDITS;
  public weaponId: WeaponId = 'CLASSIC';
  public ammo = 12;
  public kills = 0;
  public deaths = 0;
  public lossStreak = 0;

  // Snapshot interpolation ring buffer
  private snapshots: (RemoteSnapshot | null)[] = new Array(SNAP_RING_SIZE).fill(null);
  private snapCount = 0;
  public latestServerTick = 0;
  public lastRenderInterpTick = 0;

  // KO topple transition
  private deathFallTimer = 0;
  private isToppling = false;

  // Footstep tracking
  private lastStepCounter = 0;

  // Offline Bot AI state
  public isBot = false;
  public botDifficulty: BotDifficulty = 'MEDIUM';
  private botPolicy: 'CATWALK' | 'COURTYARD' | 'MARKET' = 'COURTYARD';
  private botWaypointIdx = 0;
  private botStrafeDir = 1;
  private botStrafeTimer = 0;
  private botFireCooldown = 0;
  private botReactionTimer = 0;
  private botBurstCount = 0;
  private botCrouchRoll = false;
  private botSwayPhase = 0;
  private readonly botRayHit: WorldRayHit = {
    hit: false,
    distance: 0,
    x: 0,
    y: 0,
    z: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    mat: null,
  };

  public resetForRound(
    x: number,
    y: number,
    z: number,
    yaw: number,
    isAttacker: boolean,
    roundNum: number,
    aimDuelFree: boolean,
    botDifficulty: BotDifficulty = this.botDifficulty
  ): void {
    this.botDifficulty = botDifficulty;
    this.state = createKinematicState(x, y, z, yaw);
    this.hp = 100;
    this.alive = true;
    this.isToppling = false;
    this.deathFallTimer = 0;
    this.snapshots.fill(null);
    this.snapCount = 0;
    this.lastStepCounter = 0;

    if (this.rig.group) {
      this.rig.group.visible = true;
      this.rig.group.rotation.set(0, yaw, 0, 'YXZ');
    }

    if (this.isBot) {
      const profile = BOT_DIFFICULTY_PROFILES[this.botDifficulty];
      // Bot buys competitively based on credits, aimDuelFree, and difficulty tier
      if (aimDuelFree) {
        if (profile.maxBuyTier === 'SMG') {
          this.weaponId = roundNum % 2 === 0 ? 'SPECTRE' : 'GHOST';
          this.shield = MATCH_CONFIG.LIGHT_SHIELD_AMOUNT;
        } else if (profile.maxBuyTier === 'RIFLE') {
          this.weaponId = roundNum % 2 === 0 ? 'PHANTOM' : 'VANDAL';
          this.shield = MATCH_CONFIG.HEAVY_SHIELD_AMOUNT;
        } else {
          this.weaponId = roundNum % 4 === 0 ? 'OPERATOR' : roundNum % 2 === 0 ? 'PHANTOM' : 'VANDAL';
          this.shield = MATCH_CONFIG.HEAVY_SHIELD_AMOUNT;
        }
      } else {
        this.botBuyLoadout();
      }
      this.ammo = WEAPON_DATA[this.weaponId].magSize;

      // Cycle across 3 distinct tactical movement policies
      const policies: ('CATWALK' | 'COURTYARD' | 'MARKET')[] = ['COURTYARD', 'CATWALK', 'MARKET'];
      this.botPolicy = policies[roundNum % policies.length];
      this.botWaypointIdx = 0;
      this.botFireCooldown = 0.45;
      this.botReactionTimer = profile.reactionSec;
      this.botBurstCount = 0;
      this.botCrouchRoll = false;
      this.botStrafeDir = roundNum % 2 === 0 ? 1 : -1;
      this.botStrafeTimer = 0.9;
      this.botSwayPhase = roundNum * 1.3;
    }

    this.syncRigVisuals(true);
    void isAttacker;
  }

  private botBuyLoadout(): void {
    const profile = BOT_DIFFICULTY_PROFILES[this.botDifficulty];
    if (profile.maxBuyTier !== 'SMG' && this.credits >= 3900) {
      this.weaponId = Math.random() < 0.5 ? 'VANDAL' : 'PHANTOM';
      this.credits -= 2900;
      this.shield = MATCH_CONFIG.HEAVY_SHIELD_AMOUNT;
      this.credits -= 1000;
    } else if (profile.maxBuyTier !== 'SMG' && this.credits >= 2900) {
      this.weaponId = 'VANDAL';
      this.credits -= 2900;
      if (this.credits >= 400) {
        this.shield = MATCH_CONFIG.LIGHT_SHIELD_AMOUNT;
        this.credits -= 400;
      }
    } else if (this.credits >= 2000) {
      this.weaponId = 'SPECTRE';
      this.credits -= 1600;
      this.shield = MATCH_CONFIG.LIGHT_SHIELD_AMOUNT;
      this.credits -= 400;
    } else if (profile.maxBuyTier !== 'SMG' && this.credits >= 800) {
      this.weaponId = 'SHERIFF';
      this.credits -= 800;
    } else if (this.credits >= 500) {
      this.weaponId = 'GHOST';
      this.credits -= 500;
    } else {
      this.weaponId = 'CLASSIC';
    }
  }

  public pushSnapshot(tick: number, tuple: PlayerSnapTuple): void {
    const snap: RemoteSnapshot = {
      tick,
      x: tuple[0],
      y: tuple[1],
      z: tuple[2],
      vx: tuple[3],
      vy: tuple[4],
      vz: tuple[5],
      yaw: tuple[6],
      pitch: tuple[7],
      crouchAlpha: tuple[8],
      hp: tuple[9],
      shield: tuple[10],
      wpn: tuple[11],
      ammo: tuple[12],
      tagTimer: tuple[13],
    };

    this.snapshots[this.snapCount % SNAP_RING_SIZE] = snap;
    this.snapCount++;
    if (tick > this.latestServerTick) {
      this.latestServerTick = tick;
    }
    this.hp = snap.hp;
    this.shield = snap.shield;
    this.weaponId = snap.wpn;
    this.ammo = snap.ammo;
    if (snap.hp <= 0 && this.alive) {
      this.triggerKO();
    }
  }

  public triggerKO(): void {
    this.alive = false;
    this.hp = 0;
    this.isToppling = true;
    this.deathFallTimer = 0;
  }

  public updateInterpolation(
    estimatedServerTick: number,
    dt: number
  ): { stepFootstep: boolean } {
    this.rig.updateVisualEffects(dt);

    if (!this.alive) {
      if (this.isToppling && this.rig.group) {
        this.deathFallTimer = Math.min(0.35, this.deathFallTimer + dt);
        const p = this.deathFallTimer / 0.35;
        this.rig.group.rotation.x = -p * (Math.PI * 0.48);
        this.rig.group.position.y = this.state.y + p * 0.14;
      }
      return { stepFootstep: false };
    }

    const renderTick = estimatedServerTick - INTERP_DELAY_TICKS;
    this.lastRenderInterpTick = renderTick;

    let sA: RemoteSnapshot | null = null;
    let sB: RemoteSnapshot | null = null;
    let latest: RemoteSnapshot | null = null;

    for (let i = 0; i < SNAP_RING_SIZE; i++) {
      const s = this.snapshots[i];
      if (!s) continue;
      if (!latest || s.tick > latest.tick) latest = s;
      if (s.tick <= renderTick && (!sA || s.tick > sA.tick)) sA = s;
      if (s.tick >= renderTick && (!sB || s.tick < sB.tick)) sB = s;
    }

    if (sA && sB && sB.tick > sA.tick) {
      const t = (renderTick - sA.tick) / (sB.tick - sA.tick);
      this.state.x = sA.x + (sB.x - sA.x) * t;
      this.state.y = sA.y + (sB.y - sA.y) * t;
      this.state.z = sA.z + (sB.z - sA.z) * t;
      this.state.vx = sA.vx + (sB.vx - sA.vx) * t;
      this.state.vy = sA.vy + (sB.vy - sA.vy) * t;
      this.state.vz = sA.vz + (sB.vz - sA.vz) * t;
      this.state.yaw = lerpAngle(sA.yaw, sB.yaw, t);
      this.state.pitch = sA.pitch + (sB.pitch - sA.pitch) * t;
      this.state.crouchAlpha = sA.crouchAlpha + (sB.crouchAlpha - sA.crouchAlpha) * t;
    } else if (latest) {
      this.state.x = latest.x;
      this.state.y = latest.y;
      this.state.z = latest.z;
      this.state.vx = latest.vx;
      this.state.vy = latest.vy;
      this.state.vz = latest.vz;
      this.state.yaw = latest.yaw;
      this.state.pitch = latest.pitch;
      this.state.crouchAlpha = latest.crouchAlpha;
    }

    this.syncRigVisuals(true);

    const horizSpeed = Math.sqrt(this.state.vx * this.state.vx + this.state.vz * this.state.vz);
    const deadzone = WEAPON_DATA[this.weaponId].moveSpeed * PHYSICS.DEADZONE_RATIO;
    if (this.state.isGrounded && horizSpeed > deadzone && this.state.crouchAlpha < 0.3) {
      this.state.stepDistance += horizSpeed * dt;
    }
    const stepIdx = Math.floor(this.state.stepDistance / 1.85);
    let stepFootstep = false;
    if (stepIdx > this.lastStepCounter) {
      this.lastStepCounter = stepIdx;
      stepFootstep = true;
    }

    return { stepFootstep };
  }

  public stepHostRemoteInput(
    input: KinematicInput,
    pitch: number,
    world: CollisionWorld
  ): void {
    if (!this.alive) return;
    this.state.pitch = pitch;
    stepKinematics(this.state, input, WEAPON_DATA[this.weaponId], false, world, TICK_DT);
    this.syncRigVisuals(false);
  }

  public stepBotAI(
    targetPose: PlayerPose,
    world: CollisionWorld,
    canFight: boolean,
    dt: number,
    onBotFire: (
      origin: [number, number, number],
      dir: [number, number, number],
      wpn: WeaponId
    ) => void
  ): { stepFootstep: boolean } {
    this.rig.updateVisualEffects(dt);

    if (!this.alive) {
      if (this.isToppling && this.rig.group) {
        this.deathFallTimer = Math.min(0.35, this.deathFallTimer + dt);
        const p = this.deathFallTimer / 0.35;
        this.rig.group.rotation.x = -p * (Math.PI * 0.48);
        this.rig.group.position.y = this.state.y + p * 0.14;
      }
      return { stepFootstep: false };
    }

    const profile = BOT_DIFFICULTY_PROFILES[this.botDifficulty];
    this.botSwayPhase += dt * 3.1;

    const eyeY = this.state.y + getEyeHeight(this.state.crouchAlpha);
    const targetAimY = targetPose.y + getEyeHeight(targetPose.crouchAlpha) - profile.aimChestOffset;

    const toTargetX = targetPose.x - this.state.x;
    const toTargetY = targetAimY - eyeY;
    const toTargetZ = targetPose.z - this.state.z;
    const distToPlayer = Math.sqrt(
      toTargetX * toTargetX + toTargetY * toTargetY + toTargetZ * toTargetZ
    );

    const dirX = toTargetX / Math.max(0.001, distToPlayer);
    const dirY = toTargetY / Math.max(0.001, distToPlayer);
    const dirZ = toTargetZ / Math.max(0.001, distToPlayer);

    // Line of sight check
    let hasLOS = false;
    if (canFight && distToPlayer > 0.3) {
      world.raycastWorld(
        this.state.x,
        eyeY,
        this.state.z,
        dirX,
        dirY,
        dirZ,
        distToPlayer,
        true,
        this.botRayHit
      );
      hasLOS = !this.botRayHit.hit;
    }

    // Face player when fighting or along movement vector
    const aimYaw = Math.atan2(-dirX, -dirZ);
    const aimPitch = Math.asin(Math.max(-0.9, Math.min(0.9, dirY)));

    let fwd = 0;
    let right = 0;
    let crouch = false;

    if (!canFight) {
      // Wait behind buy barrier
      this.state.yaw = lerpAngle(this.state.yaw, aimYaw, dt * 6);
      this.state.pitch = 0;
    } else if (hasLOS) {
      this.state.yaw = lerpAngle(this.state.yaw, aimYaw, dt * profile.yawLerpRate);
      this.state.pitch = this.state.pitch + (aimPitch - this.state.pitch) * Math.min(1, dt * profile.yawLerpRate);

      this.botReactionTimer = Math.max(0, this.botReactionTimer - dt);
      this.botFireCooldown = Math.max(0, this.botFireCooldown - dt);
      this.botStrafeTimer -= dt;
      if (this.botStrafeTimer <= 0) {
        this.botStrafeDir *= -1;
        this.botStrafeTimer = 0.6 + Math.random() * 0.7;
        this.botCrouchRoll = this.botDifficulty === 'HARD' && Math.random() < 0.25;
      }

      // Counter-strafe stop-and-shoot rhythm
      if (this.botFireCooldown <= 0.1 && this.botReactionTimer <= 0) {
        fwd = 0;
        right = 0;
        crouch = this.botCrouchRoll;
      } else {
        right = this.botStrafeDir;
        if (distToPlayer > 22) fwd = 1;
        else if (distToPlayer < 8) fwd = -1;
      }

      if (this.botReactionTimer <= 0 && this.botFireCooldown <= 0) {
        const spec = WEAPON_DATA[this.weaponId];
        if (this.state.isInDeadzone) {
          // Human-like angular dispersion + gentle tracking sway scaled by difficulty
          const sway = Math.sin(this.botSwayPhase) * (profile.aimJitter * 0.35);
          const aimJitter = profile.aimJitter + this.botBurstCount * (profile.aimJitter * 0.25);
          const jx = (Math.random() - 0.5) * aimJitter + sway;
          const jy = (Math.random() - 0.5) * (aimJitter * 0.75);
          const jz = (Math.random() - 0.5) * aimJitter - sway * 0.5;
          const len = Math.sqrt(
            (dirX + jx) ** 2 + (dirY + jy) ** 2 + (dirZ + jz) ** 2
          );
          onBotFire(
            [this.state.x, eyeY, this.state.z],
            [(dirX + jx) / len, (dirY + jy) / len, (dirZ + jz) / len],
            this.weaponId
          );
          this.botBurstCount++;
          if (this.botBurstCount >= (spec.fireMode === 'AUTO' ? profile.burstLimit : 1)) {
            this.botBurstCount = 0;
            this.botFireCooldown = spec.fireMode === 'BOLT' ? 2.15 : profile.burstCooldown;
          } else {
            this.botFireCooldown = Math.max(0.11, 60 / spec.fireRateRPM);
          }
        }
      }
    } else {
      // Navigate Ascent Mid waypoints based on policy
      this.botReactionTimer = profile.reactionSec;
      this.botBurstCount = 0;
      const waypoints =
        this.botPolicy === 'CATWALK'
          ? BOT_WAYPOINTS_ATTACKER
          : BOT_WAYPOINTS_DEFENDER;
      const wp = waypoints[this.botWaypointIdx % waypoints.length];
      const dx = wp[0] - this.state.x;
      const dz = wp[1] - this.state.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < 1.8) {
        this.botWaypointIdx = (this.botWaypointIdx + 1) % waypoints.length;
      } else {
        const moveYaw = Math.atan2(-dx, -dz);
        this.state.yaw = lerpAngle(this.state.yaw, moveYaw, dt * 10);
        this.state.pitch = 0;
        fwd = 1;
      }
    }

    const input: KinematicInput = {
      forward: fwd,
      right,
      yaw: this.state.yaw,
      jump: false,
      crouch,
      walk: false,
    };

    stepKinematics(this.state, input, WEAPON_DATA[this.weaponId], false, world, dt);
    this.syncRigVisuals(true);

    const stepIdx = Math.floor(this.state.stepDistance / 1.85);
    let stepFootstep = false;
    if (stepIdx > this.lastStepCounter) {
      this.lastStepCounter = stepIdx;
      stepFootstep = true;
    }

    return { stepFootstep };
  }

  public getPose(): PlayerPose {
    return {
      x: this.state.x,
      y: this.state.y,
      z: this.state.z,
      yaw: this.state.yaw,
      pitch: this.state.pitch,
      crouchAlpha: this.state.crouchAlpha,
    };
  }

  public getSnapTuple(): PlayerSnapTuple {
    return [
      this.state.x,
      this.state.y,
      this.state.z,
      this.state.vx,
      this.state.vy,
      this.state.vz,
      this.state.yaw,
      this.state.pitch,
      this.state.crouchAlpha,
      this.hp,
      this.shield,
      this.weaponId,
      this.ammo,
      this.state.tagTimer,
    ];
  }

  public syncRigVisuals(updateMeshes: boolean): void {
    this.rig.updatePose(this.getPose(), updateMeshes);
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
