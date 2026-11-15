import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeArenaBounds,
  computeIdleShowcaseBounds,
  createInitialCoreState,
  evaluatePointerOnCore,
  getCoreRadiusForElapsed,
  getTargetSpeedForElapsed,
  isPeriodicDeadzoneActive,
  resetCoreForNewRun,
  spawnDistractionClones,
  stepCoreSimulation,
  stepDeadzoneState,
} from './arena';

test('moving core stays within safe arena bounds and sweeps across the full screen', () => {
  const core = createInitialCoreState(390, 844);
  let minSeenX = core.x;
  let maxSeenX = core.x;
  let minSeenY = core.y;
  let maxSeenY = core.y;
  for (let i = 0; i < 450; i++) {
    stepCoreSimulation(core, 0.032, i * 32 + 5000, 390, 844, 'classic', true, null, null, null, () => 0.4);
    const bounds = computeArenaBounds(390, 844, core.radius);
    assert.ok(core.x >= bounds.minX - 1 && core.x <= bounds.maxX + 1);
    assert.ok(core.y >= bounds.minY - 1 && core.y <= bounds.maxY + 1);
    minSeenX = Math.min(minSeenX, core.x);
    maxSeenX = Math.max(maxSeenX, core.x);
    minSeenY = Math.min(minSeenY, core.y);
    maxSeenY = Math.max(maxSeenY, core.y);
  }
  const initialBounds = computeArenaBounds(390, 844, core.radius);
  const availW = initialBounds.maxX - initialBounds.minX;
  const availH = initialBounds.maxY - initialBounds.minY;
  assert.ok(core.speedPx > 50);
  assert.ok(maxSeenX - minSeenX > availW * 0.65, `Expected full-width sweep, got ${maxSeenX - minSeenX} of ${availW}`);
  assert.ok(maxSeenY - minSeenY > availH * 0.6, `Expected full-height sweep, got ${maxSeenY - minSeenY} of ${availH}`);
});

test('idle showcase keeps orb in lower stage clear of Title/CTA header', () => {
  for (const [w, h] of [
    [390, 844],
    [1440, 900],
  ]) {
    const core = createInitialCoreState(w, h);
    const showcase = computeIdleShowcaseBounds(w, h, core.radius);
    assert.ok(showcase.minY >= h * 0.5, `Expected lower-half showcase on ${w}x${h}, got minY=${showcase.minY}`);
    for (let i = 0; i < 120; i++) {
      stepCoreSimulation(core, 0.03, i * 30, w, h, 'classic', false, null);
      assert.ok(core.y >= showcase.minY - 4 && core.y <= showcase.maxY + 4);
    }
  }
});

test('resetCoreForNewRun clears stale run timers while preserving orb position continuity', () => {
  const core = createInitialCoreState(390, 844);
  core.x = 240;
  core.y = 520;
  core.pattern = 'DASH_CUT';
  core.patternSwitchAtMs = 58000;
  core.nextBonusGateAtMs = 62000;
  core.dashWindupMs = 280;
  spawnDistractionClones(core, 'SYNC_SPLIT', 20000, () => 0.2);

  resetCoreForNewRun(core, 390, 844, () => 0.4);
  assert.equal(core.x, 240);
  assert.equal(core.y, 520);
  assert.equal(core.pattern, 'GLIDE');
  assert.equal(core.patternSwitchAtMs, 6500);
  assert.equal(core.nextBonusGateAtMs, 4200);
  assert.equal(core.dashWindupMs, 0);
  assert.equal(core.clones.length, 0);
});

test('target speed increases and core radius shrinks over a 60s run', () => {
  const s5 = getTargetSpeedForElapsed(5000, 'classic');
  const s60 = getTargetSpeedForElapsed(60000, 'classic');
  assert.ok(s60 > s5 * 2);

  const r5 = getCoreRadiusForElapsed(5000, 'chaos');
  const r60 = getCoreRadiusForElapsed(60000, 'chaos');
  assert.ok(r60 < r5);
  assert.ok(r60 >= 28);
});

test('SYNC_SPLIT clones start synced near core then separate outward smoothly', () => {
  const core = createInitialCoreState(1000, 800);
  spawnDistractionClones(core, 'SYNC_SPLIT', 15000, () => 0.3);
  assert.ok(core.clones.length >= 3);

  // Frame 1 starts near core without teleporting outward
  stepCoreSimulation(core, 0.016, 15016, 1000, 800, 'classic', true, null, null, null, () => 0.3);
  const startDist = Math.hypot(core.clones[0].x - core.x, core.clones[0].y - core.y);
  assert.ok(startDist < 8, `Expected smooth bloom from center, got ${startDist}`);

  // Advance past 1150ms so clones separate cleanly
  for (let i = 0; i < 75; i++) {
    stepCoreSimulation(core, 0.025, 15200 + i * 25, 1000, 800, 'classic', true, null, null, null, () => 0.3);
  }
  assert.equal(core.clones[0].phase, 'split');
  const farDist = Math.hypot(core.clones[0].x - core.x, core.clones[0].y - core.y);
  assert.ok(farDist > 40);
});

test('evaluatePointerOnCore detects FOLLOWED_CLONE, FELL_BEHIND_CORE, and inside tolerance', () => {
  const core = createInitialCoreState(800, 800);
  core.vx = 180;
  core.vy = 0;

  const inside = evaluatePointerOnCore(core.x + 10, core.y, core, 1);
  assert.equal(inside.insideTolerance, true);
  assert.equal(inside.suggestedKoReason, null);

  // Lagged behind core moving +X
  const behind = evaluatePointerOnCore(core.x - 110, core.y, core, 1);
  assert.equal(behind.insideTolerance, false);
  assert.equal(behind.suggestedKoReason, 'FELL_BEHIND_CORE');

  // Chased a split clone orb
  core.clones.push({
    id: 99,
    x: core.x + 160,
    y: core.y + 40,
    vx: 140,
    vy: 0,
    radius: core.radius,
    hue: '#FF4D2E',
    alpha: 0.9,
    phase: 'split',
    angleOffset: 0,
    lifeMs: 1200,
    maxLifeMs: 3600,
  });
  const baited = evaluatePointerOnCore(core.x + 162, core.y + 40, core, 1);
  assert.equal(baited.insideTolerance, false);
  assert.equal(baited.suggestedKoReason, 'FOLLOWED_CLONE');
});

test('dynamic deadzone activates periodically and creates sample-and-hold visual lag while real core keeps moving', () => {
  assert.equal(isPeriodicDeadzoneActive(3000, 'classic'), false);
  assert.equal(isPeriodicDeadzoneActive(6000, 'classic'), true);
  assert.equal(isPeriodicDeadzoneActive(10500, 'classic'), false);

  const core = createInitialCoreState(390, 844);
  // Enter deadzone at t = 6000ms with pointer inside zone
  stepCoreSimulation(core, 0.016, 6000, 390, 844, 'classic', true, null, null, null, () => 0.4, core.x, core.y);
  assert.equal(core.deadzone.active, true);
  assert.equal(core.deadzone.pointerInside, true);

  const heldX = core.deadzone.visualCoreX;
  const heldY = core.deadzone.visualCoreY;
  const realStartX = core.x;

  // Step 45ms (< 112ms sampleIntervalMs): real core moves smoothly while visualCore stays sample-held
  stepCoreSimulation(core, 0.045, 6045, 390, 844, 'classic', true, null, null, null, () => 0.4, core.x, core.y);
  assert.notEqual(core.x, realStartX);
  assert.equal(core.deadzone.visualCoreX, heldX);
  assert.equal(core.deadzone.visualCoreY, heldY);

  // Step past 112ms sample boundary: visualCore catches up in a discrete stutter step
  stepCoreSimulation(core, 0.045, 6090, 390, 844, 'classic', true, null, null, null, () => 0.4, core.x, core.y);
  stepCoreSimulation(core, 0.045, 6135, 390, 844, 'classic', true, null, null, null, () => 0.4, core.x, core.y);
  assert.ok(core.deadzone.visualSampleCount >= 2);
  assert.equal(core.deadzone.visualCoreX, core.x);

  // Exiting deadzone snaps visualCore back to live core and clears flicker
  stepDeadzoneState(core, 0.016, 10500, 'classic', true, null, core.x, core.y);
  assert.equal(core.deadzone.active, false);
  assert.equal(core.deadzone.flickerOn, false);
  assert.equal(core.deadzone.visualCoreX, core.x);
});
