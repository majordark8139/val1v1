import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_DIFFICULTY_PROFILES, PHYSICS, TICK_DT } from '../config/Constants';
import { applyShieldDamage, computeWeaponDamage, WEAPON_DATA } from '../config/WeaponData';
import { HitboxRig } from '../entities/HitboxRig';
import { RemotePlayer } from '../entities/RemotePlayer';
import { CollisionWorld } from '../physics/CollisionWorld';
import { applyTaggingSlow, createKinematicState, stepKinematics } from '../physics/Kinematics';
import { RecoilController } from '../weapons/RecoilController';

test('Kinematics: Vandal reaches exact 5.40 m/s top speed and stops into deadzone under 10 ticks', () => {
  const world = new CollisionWorld();
  world.setBarriersActive(false);
  const state = createKinematicState(0, 0.0, 0, 0);

  for (let i = 0; i < 60; i++) {
    stepKinematics(
      state,
      { forward: 0, right: 1, yaw: 0, jump: false, crouch: false, walk: false },
      WEAPON_DATA.VANDAL,
      false,
      world,
      TICK_DT
    );
  }
  const topSpeed = Math.hypot(state.vx, state.vz);
  assert.ok(Math.abs(topSpeed - 5.40) <= 0.01, `Expected 5.40 m/s, got ${topSpeed}`);
  assert.equal(state.isInDeadzone, false);

  let ticksToDeadzone = 0;
  for (let i = 1; i <= 20; i++) {
    stepKinematics(
      state,
      { forward: 0, right: 0, yaw: 0, jump: false, crouch: false, walk: false },
      WEAPON_DATA.VANDAL,
      false,
      world,
      TICK_DT
    );
    if (state.isInDeadzone) {
      ticksToDeadzone = i;
      break;
    }
  }
  assert.ok(ticksToDeadzone > 0 && ticksToDeadzone < 10, `Expected < 10 ticks, got ${ticksToDeadzone}`);
});

test('Kinematics: Counter-strafe immediately zeroes horizontal velocity on opposite key tick', () => {
  const world = new CollisionWorld();
  world.setBarriersActive(false);
  const state = createKinematicState(0, 0.0, 0, 0);

  for (let i = 0; i < 30; i++) {
    stepKinematics(
      state,
      { forward: 0, right: 1, yaw: 0, jump: false, crouch: false, walk: false },
      WEAPON_DATA.VANDAL,
      false,
      world,
      TICK_DT
    );
  }
  assert.ok(state.vx > 5.0);

  stepKinematics(
    state,
    { forward: 0, right: -1, yaw: 0, jump: false, crouch: false, walk: false },
    WEAPON_DATA.VANDAL,
    false,
    world,
    TICK_DT
  );
  // Instant zeroing + 1 tick of accel (52 * 1/60 = 0.866 m/s) -> inside deadzone (<= 1.485 m/s)
  const postCounterSpeed = Math.hypot(state.vx, state.vz);
  assert.ok(postCounterSpeed <= 1.0, `Expected <= 1.0 m/s after counter-strafe, got ${postCounterSpeed}`);
  assert.equal(state.isInDeadzone, true);
});

test('Kinematics: Tagging drops velocity by 70% and recovers linearly over 0.75s', () => {
  const world = new CollisionWorld();
  world.setBarriersActive(false);
  const state = createKinematicState(0, 0.0, 0, 0);

  for (let i = 0; i < 30; i++) {
    stepKinematics(
      state,
      { forward: 1, right: 0, yaw: 0, jump: false, crouch: false, walk: false },
      WEAPON_DATA.VANDAL,
      false,
      world,
      TICK_DT
    );
  }
  applyTaggingSlow(state);
  const taggedSpeed = Math.hypot(state.vx, state.vz);
  assert.ok(Math.abs(taggedSpeed - 5.40 * PHYSICS.TAGGING_SLOW_MULT) < 0.05);

  for (let i = 0; i < 45; i++) {
    stepKinematics(
      state,
      { forward: 1, right: 0, yaw: 0, jump: false, crouch: false, walk: false },
      WEAPON_DATA.VANDAL,
      false,
      world,
      TICK_DT
    );
  }
  assert.equal(state.tagTimer, 0);
  const recoveredSpeed = Math.hypot(state.vx, state.vz);
  assert.ok(Math.abs(recoveredSpeed - 5.40) <= 0.02);
});

test('HitboxRig: Standing vs Crouched OBB raycasts resolve exact HEAD, TORSO, LEGS tiers', () => {
  const rig = new HitboxRig(false);
  rig.updatePose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouchAlpha: 0 }, false);

  const hCranium = rig.raycast(0, 1.85, 5, 0, 0, -1, 20);
  assert.equal(hCranium.hit, true);
  assert.equal(hCranium.tier, 'HEAD');
  assert.equal(hCranium.segmentId, 'HEAD_CRANIUM');

  const hJaw = rig.raycast(0, 1.68, 5, 0, 0, -1, 20);
  assert.equal(hJaw.hit, true);
  assert.equal(hJaw.tier, 'HEAD');
  assert.equal(hJaw.segmentId, 'HEAD_JAW_NECK');

  const hTorso = rig.raycast(0, 1.40, 5, 0, 0, -1, 20);
  assert.equal(hTorso.hit, true);
  assert.equal(hTorso.tier, 'TORSO');

  const hLegs = rig.raycast(0.115, 0.50, 5, 0, 0, -1, 20);
  assert.equal(hLegs.hit, true);
  assert.equal(hLegs.tier, 'LEGS');

  const hLowerLegs = rig.raycast(0, 0.35, 5, 0, 0, -1, 20);
  assert.equal(hLowerLegs.hit, true);
  assert.equal(hLowerLegs.tier, 'LEGS');

  // Crouched: Y=1.85m passes cleanly over crouched head (maxY ~ 1.35m)
  rig.updatePose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouchAlpha: 1 }, false);
  const hMissOverCrouch = rig.raycast(0, 1.85, 5, 0, 0, -1, 20);
  assert.equal(hMissOverCrouch.hit, false);

  const hCrouchHead = rig.raycast(0, 1.24, 5, 0, 0, -1, 20);
  assert.equal(hCrouchHead.hit, true);
  assert.equal(hCrouchHead.tier, 'HEAD');
});

test('WeaponData: Exact competitive damage profiles and 66% shield absorption', () => {
  assert.equal(computeWeaponDamage('VANDAL', 10, 'HEAD'), 160);
  assert.equal(computeWeaponDamage('VANDAL', 25, 'TORSO'), 40);
  assert.equal(computeWeaponDamage('VANDAL', 45, 'LEGS'), 34);

  assert.equal(computeWeaponDamage('PHANTOM', 10, 'HEAD'), 156);
  assert.equal(computeWeaponDamage('PHANTOM', 20, 'HEAD'), 140);
  assert.equal(computeWeaponDamage('PHANTOM', 40, 'HEAD'), 124);

  assert.equal(computeWeaponDamage('SHERIFF', 20, 'HEAD'), 159);
  assert.equal(computeWeaponDamage('SHERIFF', 35, 'HEAD'), 145);

  const afterBody = applyShieldDamage(100, 50, 40);
  assert.equal(afterBody.newShield, 24);
  assert.equal(afterBody.newHp, 86);
  assert.equal(afterBody.killed, false);
});

test('RecoilController: 3-stage climb and linear spray recovery reset', () => {
  const rec = new RecoilController();
  for (let i = 0; i < 8; i++) {
    rec.onShotFired(WEAPON_DATA.VANDAL, false);
  }
  assert.ok(rec.currentPitchDeg > 5.5);

  // Advance past 0.08s hold + 0.38s reset
  for (let i = 0; i < 30; i++) {
    rec.update(1 / 60, WEAPON_DATA.VANDAL, false);
  }
  assert.equal(rec.recoilIndex, 0);
  assert.equal(rec.currentPitchDeg, 0);
});

test('BotDifficulty: Easy and Medium profiles have fairer reaction times, dispersion, and chest aim bias', () => {
  assert.ok(BOT_DIFFICULTY_PROFILES.EASY.reactionSec > BOT_DIFFICULTY_PROFILES.MEDIUM.reactionSec);
  assert.ok(BOT_DIFFICULTY_PROFILES.MEDIUM.reactionSec > BOT_DIFFICULTY_PROFILES.HARD.reactionSec);
  assert.ok(BOT_DIFFICULTY_PROFILES.EASY.aimJitter > BOT_DIFFICULTY_PROFILES.MEDIUM.aimJitter);
  assert.ok(BOT_DIFFICULTY_PROFILES.MEDIUM.aimJitter > BOT_DIFFICULTY_PROFILES.HARD.aimJitter);

  const world = new CollisionWorld();
  world.setBarriersActive(false);
  const bot = new RemotePlayer();
  bot.isBot = true;
  bot.resetForRound(0, 0, 10, 0, false, 1, false, 'EASY');

  let firedEarly = false;
  for (let i = 0; i < 30; i++) {
    bot.stepBotAI(
      { x: 0, y: 0, z: 0, yaw: Math.PI, pitch: 0, crouchAlpha: 0 },
      world,
      true,
      TICK_DT,
      () => {
        firedEarly = true;
      }
    );
  }
  assert.equal(firedEarly, false, 'Easy bot must respect 0.78s reaction delay before firing');
});
