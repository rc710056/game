import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFisheyeState,
  computeGravityForceOnCore,
  computeGyroSpin,
  computeShakeMagnitude,
  createEmptySensorSnapshot,
  normalizeOrientationToGravity,
  projectFisheyePoint,
} from './sensors';

test('normalizeOrientationToGravity computes normalized tilt vector relative to baseline', () => {
  const flat = normalizeOrientationToGravity(30, 0, 30, 0);
  assert.equal(flat.tiltTotalDeg, 0);
  assert.equal(flat.gravityX, 0);
  assert.equal(flat.gravityY, 0);

  const tilted = normalizeOrientationToGravity(65, 35, 30, 0, 35);
  assert.equal(tilted.gravityX, 1);
  assert.equal(tilted.gravityY, 1);
  assert.ok(tilted.tiltTotalDeg > 49);
});

test('computeShakeMagnitude strips 9.81G when gravity is included', () => {
  const still = computeShakeMagnitude(0, 0, 9.81, true);
  assert.ok(still < 0.01);

  const shaken = computeShakeMagnitude(4, 2, 13.5, true);
  assert.ok(shaken > 4);
});

test('computeGyroSpin combines 3-axis angular velocity cleanly', () => {
  assert.equal(computeGyroSpin(30, 40, 0), 50);
});

test('computeGravityForceOnCore amplifies and reverses during GRAVITY_SHIFT', () => {
  const normal = computeGravityForceOnCore(0.5, -0.5, false, 'classic');
  const flipped = computeGravityForceOnCore(0.5, -0.5, true, 'classic');
  assert.ok(normal.fx > 0);
  assert.ok(flipped.fx < 0);
  assert.ok(Math.abs(flipped.fx) > Math.abs(normal.fx));
});

test('computeFisheyeState scales lens warp and focal offset from phone tilt', () => {
  const sensors = createEmptySensorSnapshot();
  sensors.active = true;
  sensors.tiltTotalDeg = 20;
  sensors.gravityX = 0.65;
  sensors.gravityY = -0.45;

  const idle = computeFisheyeState(sensors, false, 5000, false);
  assert.equal(idle.strength, 0);

  const active = computeFisheyeState(sensors, false, 5000, true);
  assert.ok(active.strength > 0.35);
  assert.ok(active.focalNormX > 0.1);
  assert.ok(active.focalNormY < -0.05);

  const inverted = computeFisheyeState(sensors, true, 5000, true);
  assert.ok(inverted.strength >= active.strength);
  assert.ok(inverted.focalNormX < 0);
});

test('projectFisheyePoint warps radial coordinates cleanly around focal center', () => {
  const same = projectFisheyePoint(200, 150, 500, 400, 600, 0);
  assert.deepEqual(same, { x: 200, y: 150 });

  const warped = projectFisheyePoint(620, 400, 500, 400, 600, 0.45);
  assert.ok(warped.x > 620);
  assert.equal(warped.y, 400);
});
