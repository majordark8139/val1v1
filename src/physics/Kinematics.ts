import { PHYSICS } from '../config/Constants';
import { WeaponSpec } from '../config/WeaponData';
import { MapMaterialKey } from '../map/AscentMidData';
import { CollisionWorld, MoveResult } from './CollisionWorld';

export interface KinematicInput {
  forward: number; // -1, 0, 1
  right: number;   // -1, 0, 1
  yaw: number;     // radians
  jump: boolean;
  crouch: boolean;
  walk: boolean;
}

export interface KinematicState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  crouchAlpha: number;
  isGrounded: boolean;
  isInDeadzone: boolean;
  tagTimer: number;
  stepDistance: number;
  groundMat: MapMaterialKey;
}

const _moveResult: MoveResult = {
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  isGrounded: false,
  groundMat: 'MAT_FLOOR_COURTYARD',
};

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export function createKinematicState(x = 0, y = 0, z = 0, yaw = 0): KinematicState {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    pitch: 0,
    crouchAlpha: 0,
    isGrounded: true,
    isInDeadzone: true,
    tagTimer: 0,
    stepDistance: 0,
    groundMat: 'MAT_FLOOR_COURTYARD',
  };
}

export function applyTaggingSlow(state: KinematicState): void {
  state.tagTimer = PHYSICS.TAGGING_DURATION;
  state.vx *= PHYSICS.TAGGING_SLOW_MULT;
  state.vz *= PHYSICS.TAGGING_SLOW_MULT;
}

export function getEyeHeight(crouchAlpha: number): number {
  return (
    PHYSICS.STAND_EYE_HEIGHT +
    (PHYSICS.CROUCH_EYE_HEIGHT - PHYSICS.STAND_EYE_HEIGHT) * crouchAlpha
  );
}

export function getColliderHeight(crouchAlpha: number): number {
  return (
    PHYSICS.STAND_HEIGHT +
    (PHYSICS.CROUCH_HEIGHT - PHYSICS.STAND_HEIGHT) * crouchAlpha
  );
}

export function stepKinematics(
  state: KinematicState,
  input: KinematicInput,
  weapon: WeaponSpec,
  isScoped: boolean,
  world: CollisionWorld,
  dt: number
): void {
  // 1. Tagging Recovery
  if (state.tagTimer > 0) {
    state.tagTimer = Math.max(0, state.tagTimer - dt);
  }
  const tagFactor =
    state.tagTimer > 0
      ? PHYSICS.TAGGING_SLOW_MULT +
        (1.0 - PHYSICS.TAGGING_SLOW_MULT) * (1.0 - state.tagTimer / PHYSICS.TAGGING_DURATION)
      : 1.0;

  // Crouch interpolation
  state.crouchAlpha = moveTowards(
    state.crouchAlpha,
    input.crouch ? 1 : 0,
    dt * PHYSICS.CROUCH_TRANSITION_SPEED
  );

  // 2. Target Max Speed Calculation
  const baseMax = isScoped ? weapon.scopedMoveSpeed : weapon.moveSpeed;
  let targetSpeed: number;
  if (input.crouch) {
    targetSpeed = Math.min(baseMax, PHYSICS.SPEED_CROUCH_CAP);
  } else if (input.walk) {
    targetSpeed = Math.min(baseMax, PHYSICS.SPEED_WALK_CAP);
  } else {
    targetSpeed = baseMax;
  }
  targetSpeed *= tagFactor;

  // 3. Wish Direction
  const sinY = Math.sin(input.yaw);
  const cosY = Math.cos(input.yaw);
  const fx = -sinY;
  const fz = -cosY;
  const rx = cosY;
  const rz = -sinY;

  let wishX = fx * input.forward + rx * input.right;
  let wishZ = fz * input.forward + rz * input.right;
  const wishLen = Math.sqrt(wishX * wishX + wishZ * wishZ);
  if (wishLen > 1e-6) {
    wishX /= wishLen;
    wishZ /= wishLen;
  } else {
    wishX = 0;
    wishZ = 0;
  }

  // 4. Counter-Strafing & Steep Deceleration (Grounded Only)
  if (state.isGrounded) {
    let vf = state.vx * fx + state.vz * fz;
    let vr = state.vx * rx + state.vz * rz;

    const wf = wishX * fx + wishZ * fz;
    const wr = wishX * rx + wishZ * rz;

    // Counter-strafe instant axis zeroing
    if (Math.abs(wf) > 0.01 && Math.sign(wf) !== Math.sign(vf) && Math.abs(vf) > 0.01) {
      vf = 0;
    }
    if (Math.abs(wr) > 0.01 && Math.sign(wr) !== Math.sign(vr) && Math.abs(vr) > 0.01) {
      vr = 0;
    }

    state.vx = fx * vf + rx * vr;
    state.vz = fz * vf + rz * vr;

    const currentSpeed = Math.sqrt(state.vx * state.vx + state.vz * state.vz);

    if (wishLen < 1e-6) {
      const drop = PHYSICS.GROUND_DECEL * dt;
      let newSpeed = Math.max(0, currentSpeed - drop);
      if (newSpeed < 0.25) newSpeed = 0;
      if (currentSpeed > 1e-6) {
        const scale = newSpeed / currentSpeed;
        state.vx *= scale;
        state.vz *= scale;
      } else {
        state.vx = 0;
        state.vz = 0;
      }
    } else {
      const targetVx = wishX * targetSpeed;
      const targetVz = wishZ * targetSpeed;
      const diffX = targetVx - state.vx;
      const diffZ = targetVz - state.vz;
      const diffLen = Math.sqrt(diffX * diffX + diffZ * diffZ);
      const maxAccel = PHYSICS.GROUND_ACCEL * dt;
      if (diffLen <= maxAccel) {
        state.vx = targetVx;
        state.vz = targetVz;
      } else if (diffLen > 1e-6) {
        state.vx += (diffX / diffLen) * maxAccel;
        state.vz += (diffZ / diffLen) * maxAccel;
      }
    }

    // Jump impulse
    if (input.jump) {
      state.vy = PHYSICS.JUMP_VELOCITY;
      state.isGrounded = false;
    }
  } else {
    // Air control
    if (wishLen > 1e-6) {
      const targetVx = wishX * targetSpeed;
      const targetVz = wishZ * targetSpeed;
      const diffX = targetVx - state.vx;
      const diffZ = targetVz - state.vz;
      const diffLen = Math.sqrt(diffX * diffX + diffZ * diffZ);
      const maxAir = PHYSICS.AIR_ACCEL * dt;
      if (diffLen <= maxAir) {
        state.vx = targetVx;
        state.vz = targetVz;
      } else if (diffLen > 1e-6) {
        state.vx += (diffX / diffLen) * maxAir;
        state.vz += (diffZ / diffLen) * maxAir;
      }
    }
  }

  // Gravity
  if (!state.isGrounded) {
    state.vy -= PHYSICS.GRAVITY * dt;
  }

  // 6. World Collision & Step-Up Resolution
  const height = getColliderHeight(state.crouchAlpha);
  world.moveAndCollide(
    state.x,
    state.y,
    state.z,
    state.vx,
    state.vy,
    state.vz,
    height,
    state.isGrounded,
    dt,
    _moveResult
  );

  state.x = _moveResult.x;
  state.y = _moveResult.y;
  state.z = _moveResult.z;
  state.vx = _moveResult.vx;
  state.vy = _moveResult.vy;
  state.vz = _moveResult.vz;
  state.isGrounded = _moveResult.isGrounded;
  state.groundMat = _moveResult.groundMat;
  state.yaw = input.yaw;

  // 5. Deadzone Accuracy Flag
  const horizSpeed = Math.sqrt(state.vx * state.vx + state.vz * state.vz);
  const deadzoneThreshold = weapon.moveSpeed * PHYSICS.DEADZONE_RATIO;
  state.isInDeadzone = state.isGrounded && horizSpeed <= deadzoneThreshold;

  // Footstep distance accumulator (only when running above deadzone)
  if (state.isGrounded && !input.walk && !input.crouch && horizSpeed > deadzoneThreshold) {
    state.stepDistance += horizSpeed * dt;
  } else if (!state.isGrounded) {
    state.stepDistance = 0;
  }
}
