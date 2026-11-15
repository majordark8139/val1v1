import { WeaponSpec } from '../config/WeaponData';

const DEG_TO_RAD = Math.PI / 180;
const HOLD_DELAY = 0.08;

export interface RecoilOutput {
  cameraPitchOffsetRad: number;
  cameraYawOffsetRad: number;
  bulletPitchOffsetRad: number;
  bulletYawOffsetRad: number;
  viewmodelRollRad: number;
  recoilSpreadDeg: number;
}

export class RecoilController {
  public recoilIndex = 0;
  public timeSinceLastShot = 10.0;
  public swayDirection = 1;
  public swayShotCounter = 0;
  public swayFlipInterval = 5;

  public currentPitchDeg = 0;
  public currentYawDeg = 0;
  public targetYawDeg = 0;
  public viewmodelRollRad = 0;

  private peakIndexAtDecayStart = 0;
  private peakPitchAtDecayStart = 0;
  private peakYawAtDecayStart = 0;
  private decayInitialized = false;

  public reset(): void {
    this.recoilIndex = 0;
    this.timeSinceLastShot = 10.0;
    this.swayDirection = 1;
    this.swayShotCounter = 0;
    this.swayFlipInterval = 5;
    this.currentPitchDeg = 0;
    this.currentYawDeg = 0;
    this.targetYawDeg = 0;
    this.viewmodelRollRad = 0;
    this.decayInitialized = false;
  }

  public onShotFired(weapon: WeaponSpec, isCrouching: boolean): void {
    this.timeSinceLastShot = 0;
    this.decayInitialized = false;
    this.recoilIndex += 1;

    const crouchScale = isCrouching ? 0.85 : 1.0;

    if (this.recoilIndex <= 2) {
      // Stage 1: Minimal vertical kick (shots 1-2)
      this.currentPitchDeg += weapon.recoilPitchBase * crouchScale;
    } else if (this.recoilIndex <= 7) {
      // Stage 2: Steep deterministic vertical climb (shots 3-7)
      this.currentPitchDeg += weapon.recoilPitchClimb * crouchScale;
      const gentleDrift = (this.recoilIndex % 2 === 0 ? 0.12 : -0.08) * crouchScale;
      this.targetYawDeg += gentleDrift;
    } else {
      // Stage 3: Plateau vertical + horizontal sway oscillation (shots 8+)
      const jitter = Math.sin(this.recoilIndex * 1.9) * 0.15 * crouchScale;
      this.currentPitchDeg = Math.min(
        this.currentPitchDeg + jitter,
        (weapon.recoilPitchBase * 2 + weapon.recoilPitchClimb * 5 + 0.3) * crouchScale
      );

      this.swayShotCounter++;
      if (this.swayShotCounter >= this.swayFlipInterval) {
        this.swayShotCounter = 0;
        this.swayDirection *= -1;
        this.swayFlipInterval = this.swayFlipInterval === 4 ? 6 : 4;
      }

      const maxH = weapon.recoilMaxHorizontal * crouchScale;
      this.targetYawDeg = this.swayDirection * maxH;
    }
  }

  public update(dt: number, weapon: WeaponSpec, isCrouching: boolean): void {
    this.timeSinceLastShot += dt;

    // Smooth yaw toward target sway
    const yawLerp = Math.min(1, dt * 12.0);
    this.currentYawDeg += (this.targetYawDeg - this.currentYawDeg) * yawLerp;

    // Roll tilt cues horizontal sway direction
    const targetRoll =
      this.recoilIndex >= 7
        ? -this.swayDirection * 0.085
        : -this.currentYawDeg * 0.02;
    this.viewmodelRollRad += (targetRoll - this.viewmodelRollRad) * Math.min(1, dt * 14.0);

    // Spray recovery reset timer
    if (this.timeSinceLastShot > HOLD_DELAY && this.recoilIndex > 0) {
      if (!this.decayInitialized) {
        this.peakIndexAtDecayStart = this.recoilIndex;
        this.peakPitchAtDecayStart = this.currentPitchDeg;
        this.peakYawAtDecayStart = this.currentYawDeg;
        this.decayInitialized = true;
      }

      const decayElapsed = this.timeSinceLastShot - HOLD_DELAY;
      const resetTime = weapon.recoilResetTime || 0.35;
      const t = Math.min(1.0, decayElapsed / resetTime);
      const remain = 1.0 - t;

      this.recoilIndex = this.peakIndexAtDecayStart * remain;
      this.currentPitchDeg = this.peakPitchAtDecayStart * remain;
      this.currentYawDeg = this.peakYawAtDecayStart * remain;
      this.targetYawDeg = this.currentYawDeg;

      if (t >= 1.0) {
        this.recoilIndex = 0;
        this.currentPitchDeg = 0;
        this.currentYawDeg = 0;
        this.targetYawDeg = 0;
        this.decayInitialized = false;
      }
    }

    // Clamp pitch
    const maxPitch = (weapon.recoilPitchBase * 2 + weapon.recoilPitchClimb * 5.5) * (isCrouching ? 0.85 : 1.0);
    if (this.currentPitchDeg > Math.max(maxPitch, 8.0)) {
      this.currentPitchDeg = Math.max(maxPitch, 8.0);
    }
  }

  public getOutput(isCrouching: boolean): RecoilOutput {
    const crouchScale = isCrouching ? 0.85 : 1.0;
    // 70% applied to camera view angles, 30% virtual trajectory above crosshair
    const pitchRad = this.currentPitchDeg * DEG_TO_RAD;
    const yawRad = this.currentYawDeg * DEG_TO_RAD;

    const recoilSpreadDeg =
      this.recoilIndex > 1
        ? Math.min(2.2, (this.recoilIndex - 1) * 0.16) * crouchScale
        : 0;

    return {
      cameraPitchOffsetRad: pitchRad * 0.7,
      cameraYawOffsetRad: yawRad * 0.7,
      bulletPitchOffsetRad: pitchRad * 0.3,
      bulletYawOffsetRad: yawRad * 0.3,
      viewmodelRollRad: this.viewmodelRollRad,
      recoilSpreadDeg,
    };
  }
}
