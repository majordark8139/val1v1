import * as THREE from 'three';
import { PHYSICS } from '../config/Constants';
import { WeaponSpec } from '../config/WeaponData';
import { KinematicState } from './Kinematics';
import { RecoilOutput } from '../weapons/RecoilController';

const DEG_TO_RAD = Math.PI / 180;

// Pre-allocated scratch vectors (Zero-GC)
const _baseEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _baseQuat = new THREE.Quaternion();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _rayDir = new THREE.Vector3();

export function computeCurrentSpreadDeg(
  state: KinematicState,
  weapon: WeaponSpec,
  isScoped: boolean,
  isAltFire: boolean,
  recoilOutput: RecoilOutput
): number {
  const crouchMult = state.crouchAlpha > 0.5 ? 0.85 : 1.0;

  let baseDeg = weapon.baseSpread;
  if (weapon.id === 'OPERATOR') {
    baseDeg = isScoped ? 0.0 : weapon.baseSpread;
  } else if (weapon.id === 'CLASSIC' && isAltFire) {
    baseDeg = weapon.altBaseSpread ?? 1.95;
  }

  let moveDeg = 0;
  if (!state.isGrounded) {
    moveDeg = weapon.airSpread;
  } else if (!state.isInDeadzone) {
    const horizSpeed = Math.sqrt(state.vx * state.vx + state.vz * state.vz);
    const deadzone = weapon.moveSpeed * PHYSICS.DEADZONE_RATIO;
    const maxSpd = Math.max(weapon.moveSpeed, deadzone + 0.01);
    const frac = Math.min(1.0, Math.max(0.0, (horizSpeed - deadzone) / (maxSpd - deadzone)));
    moveDeg = frac * weapon.moveSpread;
  }

  return (baseDeg + moveDeg) * crouchMult + recoilOutput.recoilSpreadDeg;
}

export function computeShotRayDirection(
  yaw: number,
  pitch: number,
  recoilOutput: RecoilOutput,
  spreadDeg: number,
  outDir: THREE.Vector3,
  isADS = false
): THREE.Vector3 {
  // When ADS on Rifles/SMGs, camera already includes 100% of recoil; in hip-fire 70% is on camera, 30% is virtual trajectory offset
  const effPitch = isADS
    ? pitch + recoilOutput.cameraPitchOffsetRad + recoilOutput.bulletPitchOffsetRad
    : pitch + recoilOutput.cameraPitchOffsetRad + recoilOutput.bulletPitchOffsetRad;
  const effYaw = yaw + recoilOutput.cameraYawOffsetRad + recoilOutput.bulletYawOffsetRad;

  _baseEuler.set(effPitch, effYaw, 0, 'YXZ');
  _baseQuat.setFromEuler(_baseEuler);

  _forward.set(0, 0, -1).applyQuaternion(_baseQuat);
  _right.set(1, 0, 0).applyQuaternion(_baseQuat);
  _up.set(0, 1, 0).applyQuaternion(_baseQuat);

  if (spreadDeg > 1e-5) {
    const radiusRad = Math.tan(spreadDeg * DEG_TO_RAD);
    const angle = Math.random() * Math.PI * 2;
    const mag = Math.sqrt(Math.random()) * radiusRad;
    const ox = Math.cos(angle) * mag;
    const oy = Math.sin(angle) * mag;
    _rayDir.copy(_forward).addScaledVector(_right, ox).addScaledVector(_up, oy).normalize();
  } else {
    _rayDir.copy(_forward).normalize();
  }

  outDir.copy(_rayDir);
  return outDir;
}
