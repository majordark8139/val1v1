import { computeWeaponDamage, applyShieldDamage, WEAPON_DATA } from '../config/WeaponData';
import { HitboxRayHit, HitboxRig, PlayerPose } from '../entities/HitboxRig';
import { CollisionWorld, WorldRayHit } from '../physics/CollisionWorld';
import { getEyeHeight } from '../physics/Kinematics';
import { EvtFirePacket, EvtHitConfirmPacket } from './Protocol';

export interface HistorySample {
  tick: number;
  p1: PlayerPose;
  p2: PlayerPose;
}

export interface PlayerVitality {
  hp: number;
  shield: number;
  alive: boolean;
}

const BUFFER_SIZE = 64;

export class LagCompensator {
  private readonly history: (HistorySample | null)[] = new Array(BUFFER_SIZE).fill(null);
  private readonly tempRig = new HitboxRig(false);
  private readonly worldHit: WorldRayHit = {
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
  private readonly hitboxHit: HitboxRayHit = {
    hit: false,
    segmentId: null,
    tier: null,
    distance: 0,
    hitX: 0,
    hitY: 0,
    hitZ: 0,
  };

  public clear(): void {
    this.history.fill(null);
  }

  public recordTick(tick: number, p1: PlayerPose, p2: PlayerPose): void {
    const slot = tick % BUFFER_SIZE;
    this.history[slot] = {
      tick,
      p1: { ...p1 },
      p2: { ...p2 },
    };
  }

  private samplePoseAtTick(targetTick: number, playerId: 1 | 2): PlayerPose | null {
    const floorTick = Math.floor(targetTick);
    const ceilTick = Math.ceil(targetTick);
    const frac = targetTick - floorTick;

    let sA: HistorySample | null = null;
    let sB: HistorySample | null = null;

    for (let i = 0; i < BUFFER_SIZE; i++) {
      const s = this.history[i];
      if (!s) continue;
      if (s.tick === floorTick) sA = s;
      if (s.tick === ceilTick) sB = s;
    }

    if (!sA && !sB) {
      // Fallback to most recent sample
      let latest: HistorySample | null = null;
      for (let i = 0; i < BUFFER_SIZE; i++) {
        const s = this.history[i];
        if (s && (!latest || s.tick > latest.tick)) latest = s;
      }
      if (!latest) return null;
      return playerId === 1 ? latest.p1 : latest.p2;
    }

    const pA = sA ? (playerId === 1 ? sA.p1 : sA.p2) : (playerId === 1 ? sB!.p1 : sB!.p2);
    const pB = sB ? (playerId === 1 ? sB.p1 : sB.p2) : pA;

    return {
      x: pA.x + (pB.x - pA.x) * frac,
      y: pA.y + (pB.y - pA.y) * frac,
      z: pA.z + (pB.z - pA.z) * frac,
      yaw: pA.yaw + (pB.yaw - pA.yaw) * frac,
      pitch: pA.pitch + (pB.pitch - pA.pitch) * frac,
      crouchAlpha: pA.crouchAlpha + (pB.crouchAlpha - pA.crouchAlpha) * frac,
    };
  }

  public evaluateShot(
    evt: EvtFirePacket,
    currentTick: number,
    world: CollisionWorld,
    victimVitality: PlayerVitality,
    currentVictimPose: PlayerPose
  ): EvtHitConfirmPacket | null {
    if (!victimVitality.alive) return null;

    const victimId: 1 | 2 = evt.shooterId === 1 ? 2 : 1;
    const minAllowedTick = Math.max(0, currentTick - 60);
    const rewindTick = Math.max(minAllowedTick, Math.min(currentTick, evt.renderInterpTick));

    // 1. Anti-cheat sanity check on shooter origin
    const shooterPose = this.samplePoseAtTick(evt.tick, evt.shooterId);
    if (shooterPose) {
      const eyeY = shooterPose.y + getEyeHeight(shooterPose.crouchAlpha);
      const dx = evt.origin[0] - shooterPose.x;
      const dy = evt.origin[1] - eyeY;
      const dz = evt.origin[2] - shooterPose.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 1.25) {
        return null;
      }
    }

    // 2. Rewind victim hitbox to renderInterpTick
    const rewoundPose = this.samplePoseAtTick(rewindTick, victimId) ?? currentVictimPose;
    this.tempRig.updatePose(rewoundPose, false);

    const spec = WEAPON_DATA[evt.wpn];
    const maxDist = spec.id === 'KNIFE' ? (spec.meleeRange ?? 1.85) : 200;

    // 3. Raycast against static world geometry first
    world.raycastWorld(
      evt.origin[0],
      evt.origin[1],
      evt.origin[2],
      evt.dir[0],
      evt.dir[1],
      evt.dir[2],
      maxDist,
      true,
      this.worldHit
    );
    const wallDist = this.worldHit.hit ? this.worldHit.distance : maxDist;

    // 4. Raycast against rewound 9-segment OBB HitboxRig
    this.tempRig.raycast(
      evt.origin[0],
      evt.origin[1],
      evt.origin[2],
      evt.dir[0],
      evt.dir[1],
      evt.dir[2],
      wallDist,
      this.hitboxHit
    );

    // Immediately restore tempRig to current pose
    this.tempRig.updatePose(currentVictimPose, false);

    if (!this.hitboxHit.hit || !this.hitboxHit.tier) {
      return null;
    }

    // Backstab check for Knife
    let isBackstab = false;
    if (evt.wpn === 'KNIFE') {
      const vFwdX = -Math.sin(rewoundPose.yaw);
      const vFwdZ = -Math.cos(rewoundPose.yaw);
      const dot = evt.dir[0] * vFwdX + evt.dir[2] * vFwdZ;
      isBackstab = dot > 0.35;
    }

    const rawDamage = computeWeaponDamage(
      evt.wpn,
      this.hitboxHit.distance,
      this.hitboxHit.tier,
      Boolean(evt.isAlt),
      isBackstab
    );

    const dmgResult = applyShieldDamage(victimVitality.hp, victimVitality.shield, rawDamage);
    victimVitality.hp = dmgResult.newHp;
    victimVitality.shield = dmgResult.newShield;
    if (dmgResult.killed) {
      victimVitality.alive = false;
    }

    return {
      t: 'H',
      attackerId: evt.shooterId,
      victimId,
      tier: this.hitboxHit.tier,
      dmg: rawDamage,
      newHp: dmgResult.newHp,
      newShield: dmgResult.newShield,
      killed: dmgResult.killed,
      wpn: evt.wpn,
      hitPos: [this.hitboxHit.hitX, this.hitboxHit.hitY, this.hitboxHit.hitZ],
    };
  }
}
