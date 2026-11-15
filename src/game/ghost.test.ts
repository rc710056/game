import test from 'node:test';
import assert from 'node:assert/strict';
import { compactGhostPath, createGhostSample, sampleGhostPosition } from './ghost';

test('createGhostSample normalizes and clamps coordinates', () => {
  const s = createGhostSample(1234.6, 500, 400, 1000, 800);
  assert.equal(s.tMs, 1235);
  assert.equal(s.nx, 0.5);
  assert.equal(s.ny, 0.5);

  const clamped = createGhostSample(100, -50, 1200, 1000, 800);
  assert.equal(clamped.nx, 0);
  assert.equal(clamped.ny, 1);
});

test('sampleGhostPosition interpolates mid-run and fades after PB surpassed', () => {
  const path = [
    createGhostSample(0, 100, 200, 1000, 1000),
    createGhostSample(1000, 900, 600, 1000, 1000),
  ];

  const mid = sampleGhostPosition(path, 500, 1000, 1000);
  assert.equal(mid.active, true);
  assert.equal(mid.finished, false);
  assert.ok(Math.abs(mid.x - 500) < 1);
  assert.ok(Math.abs(mid.y - 400) < 1);

  const justPassed = sampleGhostPosition(path, 1350, 1000, 1000);
  assert.equal(justPassed.active, true);
  assert.equal(justPassed.finished, true);
  assert.ok(justPassed.fadeAlpha > 0 && justPassed.fadeAlpha < 1);

  const longPassed = sampleGhostPosition(path, 3000, 1000, 1000);
  assert.equal(longPassed.active, false);
});

test('compactGhostPath preserves start, end, and cap length', () => {
  const samples = Array.from({ length: 1200 }, (_, i) =>
    createGhostSample(i * 100, i % 1000, (i * 2) % 800, 1000, 800),
  );
  const compacted = compactGhostPath(samples, 500);
  assert.equal(compacted.length, 500);
  assert.deepEqual(compacted[0], samples[0]);
  assert.deepEqual(compacted[499], samples[1199]);
});
