import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PHYSICS, TICK_DT } from '../src/config/Constants.ts';
import { computeWeaponDamage, WEAPON_DATA } from '../src/config/WeaponData.ts';
import { HitboxRig } from '../src/entities/HitboxRig.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { applyTaggingSlow, createKinematicState, stepKinematics } from '../src/physics/Kinematics.ts';

console.log('1. Verifying Kinematics...');
const world = new CollisionWorld();
world.setBarriersActive(false);
const state = createKinematicState(0, 0, 0, 0);

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
assert.ok(Math.abs(topSpeed - 5.40) <= 0.01, `Top speed mismatch: ${topSpeed}`);

let stopTicks = 0;
for (let i = 1; i <= 15; i++) {
  stepKinematics(
    state,
    { forward: 0, right: 0, yaw: 0, jump: false, crouch: false, walk: false },
    WEAPON_DATA.VANDAL,
    false,
    world,
    TICK_DT
  );
  if (state.isInDeadzone) {
    stopTicks = i;
    break;
  }
}
assert.ok(stopTicks > 0 && stopTicks < 10, `Deadzone stop took ${stopTicks} ticks`);

// Counter-strafe
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
stepKinematics(
  state,
  { forward: 0, right: -1, yaw: 0, jump: false, crouch: false, walk: false },
  WEAPON_DATA.VANDAL,
  false,
  world,
  TICK_DT
);
assert.equal(state.isInDeadzone, true, 'Counter-strafe should place player in deadzone immediately');

// Tagging slow + recovery
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
assert.ok(Math.abs(Math.hypot(state.vx, state.vz) - 5.40) <= 0.02);
console.log('   Kinematics checks passed.');

console.log('2. Verifying 9-Segment Compound HitboxRig...');
const rig = new HitboxRig(false);
rig.updatePose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouchAlpha: 0 }, false);
assert.equal(rig.raycast(0, 1.85, 5, 0, 0, -1, 20).tier, 'HEAD');
assert.equal(rig.raycast(0, 1.68, 5, 0, 0, -1, 20).tier, 'HEAD');
assert.equal(rig.raycast(0, 1.40, 5, 0, 0, -1, 20).tier, 'TORSO');
assert.equal(rig.raycast(0.115, 0.50, 5, 0, 0, -1, 20).tier, 'LEGS');

rig.updatePose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouchAlpha: 1 }, false);
assert.equal(rig.raycast(0, 1.85, 5, 0, 0, -1, 20).hit, false);
assert.equal(rig.raycast(0, 1.24, 5, 0, 0, -1, 20).tier, 'HEAD');
console.log('   HitboxRig checks passed.');

console.log('3. Verifying Weapon Damage Profiles...');
assert.equal(computeWeaponDamage('VANDAL', 10, 'HEAD'), 160);
assert.equal(computeWeaponDamage('VANDAL', 25, 'TORSO'), 40);
assert.equal(computeWeaponDamage('VANDAL', 45, 'LEGS'), 34);
assert.equal(computeWeaponDamage('PHANTOM', 10, 'HEAD'), 156);
assert.equal(computeWeaponDamage('PHANTOM', 20, 'HEAD'), 140);
assert.equal(computeWeaponDamage('PHANTOM', 40, 'HEAD'), 124);
assert.equal(computeWeaponDamage('SHERIFF', 20, 'HEAD'), 159);
assert.equal(computeWeaponDamage('SHERIFF', 35, 'HEAD'), 145);
console.log('   Weapon damage checks passed.');

console.log('4. Checking dist/ bundle if built...');
const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  const assetsDir = path.join(distDir, 'assets');
  const files = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
  const jsFiles = files.filter((f) => f.endsWith('.js'));
  assert.ok(jsFiles.length > 0, 'Expected at least one JS bundle in dist/assets');
  let totalGzip = 0;
  for (const f of jsFiles) {
    const buf = fs.readFileSync(path.join(assetsDir, f));
    totalGzip += zlib.gzipSync(buf).byteLength;
  }
  console.log(`   dist/ verified: ${jsFiles.length} JS asset(s), total gzipped ${(totalGzip / 1024).toFixed(1)} KB`);
} else {
  console.log('   dist/ not built yet (run npm run build to generate).');
}
console.log('ALL VERIFICATION CHECKS PASSED!');
