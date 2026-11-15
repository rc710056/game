import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBossShareUrl,
  buildKnockoutReport,
  calculatePercentile,
  formatDuration,
  formatHumanDuration,
  getComboPulseConfig,
  getDailyContract,
  getEnduranceRank,
  parseBossFromSearch,
  selectNextDistraction,
} from './engine';

test('formatDuration formats mm:ss.mmm with tabular padding', () => {
  assert.equal(formatDuration(0), '00:00.000');
  assert.equal(formatDuration(43218), '00:43.218');
  assert.equal(formatDuration(60000), '01:00.000');
});

test('formatHumanDuration formats readable survival summaries', () => {
  assert.equal(formatHumanDuration(4321), '4.32 seconds');
  assert.equal(formatHumanDuration(65000), '1 minute 5 seconds');
});

test('calculatePercentile rewards reaching 1 minute strongly', () => {
  const p5 = calculatePercentile(5000);
  const p30 = calculatePercentile(30000);
  const p60 = calculatePercentile(60000);
  assert.ok(p5 < p30);
  assert.ok(p30 < p60);
  assert.ok(p60 >= 85, `Expected >= 85% at 60s, got ${p60}`);
});

test('getEnduranceRank awards 1-Min Survivor at 60s', () => {
  assert.equal(getEnduranceRank(1200).title, 'Jitter Thumb');
  assert.equal(getEnduranceRank(60000).title, '1-Min Survivor');
});

test('selectNextDistraction avoids immediate repeats', () => {
  const early = selectNextDistraction(1000, 'classic', [], () => 0.5);
  assert.equal(early, null);

  const mid = selectNextDistraction(28000, 'classic', ['SYNC_SPLIT', 'BLINK_STROBE'], () => 0.2);
  assert.ok(mid !== null);
  assert.notEqual(mid?.type, 'SYNC_SPLIT');
  assert.notEqual(mid?.type, 'BLINK_STROBE');
});

test('getDailyContract is deterministic per date string', () => {
  const a = getDailyContract('2026-11-14');
  const b = getDailyContract('2026-11-14');
  assert.deepEqual(a, b);
  assert.ok(a.targetMs >= 40000);
});

test('buildKnockoutReport attributes clone bait, near-miss prompt, and 1-minute milestone', () => {
  const report = buildKnockoutReport({
    reason: 'FOLLOWED_CLONE',
    elapsedMs: 61500,
    score: 2450,
    maxCombo: 4,
    clutchSaves: 2,
    bonusGatesCollected: 3,
    driftMm: 5.4,
    driftAngleDeg: 45,
    peakDriftMm: 5.4,
    peakSpeedPx: 215,
    accuracyPct: 89,
    tiltDeg: 1.8,
    shakeMag: 0.4,
    gyroSpinDegPerSec: 12,
    distractionsSurvived: ['SYNC_SPLIT', 'BLINK_STROBE'],
    lastDistraction: {
      type: 'COLOR_MERGE',
      label: 'Color Merge Vortex',
      baitHeadline: 'SPECTRUM MERGE',
      baitSubtext: 'Colliding',
      startedAtElapsedMs: 60200,
      endsAtElapsedMs: 64800,
    },
    coreSpeedAtKo: 210,
    mode: 'classic',
    inputType: 'touch',
    bossChallenge: {
      targetMs: 45000,
      challengerName: 'MAYA',
    },
    previousBestMs: 30000,
    previousBestScore: 1200,
  });

  assert.equal(report.headline, 'Baited by Decoy Clone');
  assert.equal(report.survivedOneMinute, true);
  assert.equal(report.isNewPersonalBest, true);
  assert.equal(report.isNewBestScore, true);
  assert.equal(report.bossOutcome, 'won');
  assert.ok(report.distractionBlame?.includes('1.30s into "Color Merge Vortex"'));
});

test('Boss challenge URL builds and parses cleanly', () => {
  const url = buildBossShareUrl('https://holdtheline.app', '/', 61250, 'ALEX', 'FOLLOWED_CLONE');
  const parsed = parseBossFromSearch(new URL(url).search);
  assert.deepEqual(parsed, {
    targetMs: 61250,
    challengerName: 'ALEX',
    challengerCause: 'FOLLOWED_CLONE',
  });
});

test('getComboPulseConfig speeds up and intensifies micro-vibration with higher combo', () => {
  const c1 = getComboPulseConfig(1, 5000);
  const c3 = getComboPulseConfig(3, 5000);
  const c5 = getComboPulseConfig(5, 5000);
  assert.ok(c1.intervalMs > c3.intervalMs);
  assert.ok(c3.intervalMs > c5.intervalMs);
  assert.ok(c5.vibrateDurationMs > c3.vibrateDurationMs);
  assert.ok(c3.vibrateDurationMs > c1.vibrateDurationMs);
  assert.ok(c5.amplitudeScale > c1.amplitudeScale);
});
