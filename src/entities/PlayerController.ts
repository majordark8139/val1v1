import * as THREE from 'three';
import { CAMERA_CONFIG, MATCH_CONFIG, TICK_DT } from '../config/Constants';
import { WEAPON_DATA, WeaponId } from '../config/WeaponData';
import { CollisionWorld } from '../physics/CollisionWorld';
import {
  createKinematicState,
  getEyeHeight,
  KinematicInput,
  KinematicState,
  stepKinematics,
} from '../physics/Kinematics';
import { computeCurrentSpreadDeg, computeShotRayDirection } from '../physics/Raycaster';
import { RecoilController } from '../weapons/RecoilController';
import { WeaponSystem } from '../weapons/WeaponSystem';
import {
  BTN_ALT_FIRE,
  BTN_CROUCH,
  BTN_FIRE,
  BTN_JUMP,
  BTN_RELOAD,
  BTN_WALK,
  CmdInputPacket,
  PlayerSnapTuple,
} from '../network/Protocol';

interface PendingInputEntry {
  seq: number;
  input: KinematicInput;
  weaponId: WeaponId;
  isScoped: boolean;
  predX: number;
  predY: number;
  predZ: number;
}

const PENDING_BUFFER_SIZE = 128;

export class PlayerController {
  public playerId: 1 | 2 = 1;
  public state: KinematicState = createKinematicState(0, 1.35, -31.0, Math.PI);
  public prevState: KinematicState = createKinematicState(0, 1.35, -31.0, Math.PI);

  public hp = 100;
  public shield = 0;
  public alive = true;
  public credits: number = MATCH_CONFIG.START_CREDITS;
  public kills = 0;
  public deaths = 0;
  public headshots = 0;
  public totalDamage = 0;
  public lossStreak = 0;

  public readonly weapons = new WeaponSystem();
  public readonly recoil = new RecoilController();

  // Client-side prediction & smooth reconciliation
  public inputSeq = 0;
  private pendingInputs: (PendingInputEntry | null)[] = new Array(PENDING_BUFFER_SIZE).fill(null);
  private smoothCamOffset = new THREE.Vector3();
  private currentVFov: number = CAMERA_CONFIG.DEFAULT_VFOV;
  private lastStepCounter = 0;
  public damageTrauma = 0;

  public resetForRound(
    x: number,
    y: number,
    z: number,
    yaw: number,
    preservePurchased: boolean
  ): void {
    this.state = createKinematicState(x, y, z, yaw);
    this.prevState = createKinematicState(x, y, z, yaw);
    this.hp = 100;
    this.alive = true;
    this.weapons.resetForNewRound(preservePurchased);
    this.recoil.reset();
    this.pendingInputs.fill(null);
    this.smoothCamOffset.set(0, 0, 0);
    this.currentVFov = CAMERA_CONFIG.DEFAULT_VFOV;
    this.lastStepCounter = 0;
    this.damageTrauma = 0;
  }

  public recordPendingInput(
    seq: number,
    input: KinematicInput,
    weaponId: WeaponId,
    isScoped: boolean
  ): void {
    const slot = seq % PENDING_BUFFER_SIZE;
    this.pendingInputs[slot] = {
      seq,
      input: { ...input },
      weaponId,
      isScoped,
      predX: this.state.x,
      predY: this.state.y,
      predZ: this.state.z,
    };
  }

  public reconcileFromServer(
    authTuple: PlayerSnapTuple,
    ackSeq: number,
    world: CollisionWorld
  ): void {
    const [ax, ay, az, avx, avy, avz, , , acrouch, ahp, ashield, , , atag] = authTuple;

    this.hp = ahp;
    this.shield = ashield;
    this.alive = ahp > 0;
    this.state.tagTimer = atag;

    // Find predicted state at ackSeq
    let matched: PendingInputEntry | null = null;
    for (let i = 0; i < PENDING_BUFFER_SIZE; i++) {
      const entry = this.pendingInputs[i];
      if (!entry) continue;
      if (entry.seq === ackSeq) {
        matched = entry;
      }
      if (entry.seq <= ackSeq) {
        this.pendingInputs[i] = null;
      }
    }

    if (!matched) return;

    const errX = ax - matched.predX;
    const errY = ay - matched.predY;
    const errZ = az - matched.predZ;
    const errDist = Math.sqrt(errX * errX + errY * errY + errZ * errZ);

    if (errDist > 0.04) {
      const preX = this.state.x;
      const preY = this.state.y;
      const preZ = this.state.z;

      this.state.x = ax;
      this.state.y = ay;
      this.state.z = az;
      this.state.vx = avx;
      this.state.vy = avy;
      this.state.vz = avz;
      this.state.crouchAlpha = acrouch;

      // Re-simulate remaining unacknowledged inputs in order
      const remaining: PendingInputEntry[] = [];
      for (let i = 0; i < PENDING_BUFFER_SIZE; i++) {
        const entry = this.pendingInputs[i];
        if (entry && entry.seq > ackSeq) {
          remaining.push(entry);
        }
      }
      remaining.sort((a, b) => a.seq - b.seq);

      for (let i = 0; i < remaining.length; i++) {
        const e = remaining[i];
        stepKinematics(
          this.state,
          e.input,
          WEAPON_DATA[e.weaponId],
          e.isScoped,
          world,
          TICK_DT
        );
        e.predX = this.state.x;
        e.predY = this.state.y;
        e.predZ = this.state.z;
      }

      // Smoothly decay visual camera offset over ~50ms
      this.smoothCamOffset.set(
        preX - this.state.x,
        preY - this.state.y,
        preZ - this.state.z
      );
    }
  }

  public buildCmdPacket(
    tick: number,
    input: KinematicInput,
    pitch: number,
    fireHeld: boolean,
    altJust: boolean,
    reloadJust: boolean
  ): CmdInputPacket {
    this.inputSeq++;
    let btn = 0;
    if (input.jump) btn |= BTN_JUMP;
    if (input.crouch) btn |= BTN_CROUCH;
    if (input.walk) btn |= BTN_WALK;
    if (fireHeld) btn |= BTN_FIRE;
    if (altJust) btn |= BTN_ALT_FIRE;
    if (reloadJust) btn |= BTN_RELOAD;

    return {
      t: 'I',
      seq: this.inputSeq,
      tick,
      f: input.forward,
      r: input.right,
      yaw: input.yaw,
      pitch,
      btn,
      wpn: this.weapons.getActiveSpec().id,
    };
  }

  public shouldPlayFootstep(): boolean {
    const stepIndex = Math.floor(this.state.stepDistance / 1.85);
    if (stepIndex > this.lastStepCounter) {
      this.lastStepCounter = stepIndex;
      return true;
    }
    if (this.state.stepDistance < 0.05) {
      this.lastStepCounter = 0;
    }
    return false;
  }

  public getCurrentSpreadDeg(isAltFire = false): number {
    const spec = this.weapons.getActiveSpec();
    const recOut = this.recoil.getOutput(this.state.crouchAlpha > 0.5);
    return computeCurrentSpreadDeg(
      this.state,
      spec,
      this.weapons.isScoped(),
      isAltFire,
      recOut
    );
  }

  public computeBulletRay(
    outOrigin: THREE.Vector3,
    outDir: THREE.Vector3,
    isAltFire = false
  ): void {
    const eyeY = this.state.y + getEyeHeight(this.state.crouchAlpha);
    outOrigin.set(this.state.x, eyeY, this.state.z);
    const spec = this.weapons.getActiveSpec();
    const isCrouch = this.state.crouchAlpha > 0.5;
    const recOut = this.recoil.getOutput(isCrouch);
    const spread = computeCurrentSpreadDeg(
      this.state,
      spec,
      this.weapons.isScoped(),
      isAltFire,
      recOut
    );
    const isADS =
      this.weapons.isScoped() &&
      (spec.id === 'SPECTRE' || spec.id === 'PHANTOM' || spec.id === 'VANDAL');
    computeShotRayDirection(this.state.yaw, this.state.pitch, recOut, spread, outDir, isADS);
  }

  public updateCamera(camera: THREE.PerspectiveCamera, alpha: number, frameTime: number): void {
    // Decay reconciliation offset smoothly (~50ms)
    const decay = Math.exp(-frameTime * 45);
    this.smoothCamOffset.multiplyScalar(decay);

    // Decay trauma
    if (this.damageTrauma > 0) {
      this.damageTrauma = Math.max(0, this.damageTrauma - frameTime * 2.5);
    }

    const ix = this.prevState.x + (this.state.x - this.prevState.x) * alpha + this.smoothCamOffset.x;
    const iy = this.prevState.y + (this.state.y - this.prevState.y) * alpha + this.smoothCamOffset.y;
    const iz = this.prevState.z + (this.state.z - this.prevState.z) * alpha + this.smoothCamOffset.z;
    const icrouch =
      this.prevState.crouchAlpha + (this.state.crouchAlpha - this.prevState.crouchAlpha) * alpha;

    const eyeY = iy + getEyeHeight(icrouch);
    camera.position.set(ix, eyeY, iz);

    const recOut = this.recoil.getOutput(this.state.crouchAlpha > 0.5);
    const shakeMag = this.damageTrauma * this.damageTrauma * 0.035;
    const shakePitch = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag : 0;
    const shakeRoll = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag : 0;

    camera.rotation.set(
      this.state.pitch + recOut.cameraPitchOffsetRad + shakePitch,
      this.state.yaw + recOut.cameraYawOffsetRad,
      shakeRoll,
      'YXZ'
    );

    const targetVFov = this.weapons.getTargetVFov();
    const fovLerp = 1 - Math.exp(-frameTime * 18);
    if (Math.abs(targetVFov - this.currentVFov) > 0.05) {
      this.currentVFov += (targetVFov - this.currentVFov) * fovLerp;
      camera.fov = this.currentVFov;
      camera.updateProjectionMatrix();
    }
  }
}
