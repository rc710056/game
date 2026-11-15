import type {
  BossChallenge,
  DailyContract,
  DistractionDefinition,
  DistractionEvent,
  DistractionType,
  EnduranceRank,
  GameMode,
  KnockoutReason,
  KnockoutReport,
  KnockoutTelemetry,
} from './types';

export const SLIP_LIMIT_MM = 2.2;
export const BASE_CORE_RADIUS_PX = 48;
export const MIN_CORE_RADIUS_PX = 28;

const CSS_PX_PER_INCH = 96;
const MM_PER_INCH = 25.4;

export function pxToMm(px: number, devicePixelRatio = 1): number {
  const effectiveScale = devicePixelRatio >= 2 ? 1.1 : 1.0;
  return (px / CSS_PX_PER_INCH) * MM_PER_INCH * effectiveScale;
}

export function mmToPx(mm: number, devicePixelRatio = 1): number {
  const effectiveScale = devicePixelRatio >= 2 ? 1.1 : 1.0;
  return (mm / (MM_PER_INCH * effectiveScale)) * CSS_PX_PER_INCH;
}

export function formatDuration(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');
  return `${mm}:${ss}.${mmm}`;
}

export function formatHumanDuration(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(2)} seconds`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remSeconds = Math.floor(totalSeconds % 60);
  const minLabel = minutes === 1 ? 'minute' : 'minutes';
  const secLabel = remSeconds === 1 ? 'second' : 'seconds';
  if (remSeconds === 0) {
    return `${minutes} ${minLabel}`;
  }
  return `${minutes} ${minLabel} ${remSeconds} ${secLabel}`;
}

export function calculatePercentile(ms: number): number {
  const sec = Math.max(0, ms / 1000);
  if (sec <= 0.15) return 1;
  const raw = 100 * (1 - Math.exp(-Math.pow(sec / 21, 0.64)));
  return Math.max(1, Math.min(99, Math.round(raw)));
}

const ENDURANCE_RANKS: EnduranceRank[] = [
  { tier: 1, title: 'Jitter Thumb', minMs: 0, nextMs: 10000, accentHex: '#94A3B8' },
  { tier: 2, title: 'Lock Trainee', minMs: 10000, nextMs: 25000, accentHex: '#F59E0B' },
  { tier: 3, title: 'Motion Tracker', minMs: 25000, nextMs: 45000, accentHex: '#FF6B2C' },
  { tier: 4, title: 'Clone Breaker', minMs: 45000, nextMs: 60000, accentHex: '#FF3B1D' },
  { tier: 5, title: '1-Min Survivor', minMs: 60000, nextMs: 120000, accentHex: '#00E5A3' },
  { tier: 6, title: 'Optical Phantom', minMs: 120000, nextMs: 240000, accentHex: '#38BDF8' },
  { tier: 7, title: 'Apex Anchor', minMs: 240000, nextMs: null, accentHex: '#FDE047' },
];

export function getEnduranceRank(ms: number): EnduranceRank {
  for (let i = ENDURANCE_RANKS.length - 1; i >= 0; i--) {
    if (ms >= ENDURANCE_RANKS[i].minMs) {
      return ENDURANCE_RANKS[i];
    }
  }
  return ENDURANCE_RANKS[0];
}

export interface ComboPulseConfig {
  intervalMs: number;
  vibrateDurationMs: number;
  amplitudeScale: number;
}

/**
 * Computes subtle constant micro-vibration pulse timing and tactile duration
 * scaled by the active combo multiplier (1..5) and survival progression.
 */
export function getComboPulseConfig(combo: number, elapsedMs: number): ComboPulseConfig {
  const c = Math.max(1, Math.min(5, Math.round(combo)));
  const baseIntervals = [860, 660, 500, 360, 240];
  const baseDurations = [10, 15, 20, 26, 34];
  const tensionFactor = 1 - Math.min(0.16, (Math.max(0, elapsedMs) / 60000) * 0.16);
  return {
    intervalMs: Math.round(baseIntervals[c - 1] * tensionFactor),
    vibrateDurationMs: baseDurations[c - 1],
    amplitudeScale: Number((0.25 + (c - 1) * 0.1875).toFixed(4)),
  };
}

export function angleToCompass(angleDeg: number): string {
  const dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const index = Math.round(((angleDeg % 360) / 45)) % 8;
  return dirs[index];
}

export const DISTRACTION_CATALOG: DistractionDefinition[] = [
  {
    type: 'SYNC_SPLIT',
    label: 'Sync-Split Clones',
    baitHeadline: 'SYNC LOCKING',
    baitSubtext: 'Track the true core before clones snap apart',
    durationMs: 4200,
    minElapsedMs: 5200,
    vibratePattern: [40, 40, 80],
  },
  {
    type: 'COLOR_MERGE',
    label: 'Color Merge Vortex',
    baitHeadline: 'SPECTRUM MERGE',
    baitSubtext: 'Similar rings colliding — stay locked on origin',
    durationMs: 4600,
    minElapsedMs: 10500,
    vibratePattern: [60, 50, 60],
  },
  {
    type: 'BLINK_STROBE',
    label: 'Blackout Blink',
    baitHeadline: 'OPTIC BLINK',
    baitSubtext: 'Predict core velocity through the blackout',
    durationMs: 3200,
    minElapsedMs: 8500,
    vibratePattern: [30, 90, 30, 90],
  },
  {
    type: 'OPTIC_BLUR',
    label: 'Radial Blur Wave',
    baitHeadline: 'FOCUS HAZE',
    baitSubtext: 'Keep dragging smoothly inside the blurred ring',
    durationMs: 3600,
    minElapsedMs: 14000,
    vibratePattern: [50],
  },
  {
    type: 'RGB_TEAR',
    label: 'RGB Ghost Tear',
    baitHeadline: 'AFTERIMAGE GLITCH',
    baitSubtext: 'Follow the leading edge, not the trail',
    durationMs: 3400,
    minElapsedMs: 16500,
    vibratePattern: [40, 30, 70],
  },
  {
    type: 'GRAVITY_SHIFT',
    label: 'Gravity Inversion',
    baitHeadline: 'GRAVITY REVERSED',
    baitSubtext: 'Counter phone tilt pull as core drifts',
    durationMs: 3800,
    minElapsedMs: 19000,
    vibratePattern: [90, 40, 90],
  },
  {
    type: 'SYSTEM_BAIT_BLUFF',
    label: 'System Alert Bluff',
    baitHeadline: 'LOW BATTERY 2% · DISMISS?',
    baitSubtext: 'Fake alert — lifting thumb breaks lock',
    durationMs: 2900,
    minElapsedMs: 22500,
    vibratePattern: [120, 60, 120],
  },
  {
    type: 'HAPTIC_QUAKE',
    label: 'Seismic Jitter',
    baitHeadline: 'TREMOR WAVE',
    baitSubtext: 'Screen shaking — compensate your drag',
    durationMs: 2800,
    minElapsedMs: 17500,
    vibratePattern: [70, 35, 110, 35, 130, 35, 80],
  },
  {
    type: 'CHROMATIC_INVERT',
    label: 'Polarity Flashbang',
    baitHeadline: 'POLARITY FLIP',
    baitSubtext: 'Contrast inverted — do not flinch',
    durationMs: 2400,
    minElapsedMs: 25000,
    vibratePattern: [45, 45, 45],
  },
  {
    type: 'FAKE_FREEZE',
    label: 'Clock Stall Glitch',
    baitHeadline: 'TIMER STALLED',
    baitSubtext: 'Clock display frozen — keep tracking the circle',
    durationMs: 2100,
    minElapsedMs: 29000,
    vibratePattern: [40],
  },
  {
    type: 'FAKE_VICTORY_BLUFF',
    label: 'Decoy Clear Stamp',
    baitHeadline: 'STAGE CLEARED · LIFT TO SAVE',
    baitSubtext: 'Trap! Lifting now voids your run',
    durationMs: 2500,
    minElapsedMs: 34000,
    vibratePattern: [60, 50, 140],
  },
  {
    type: 'DEADZONE_LAG',
    label: 'Signal Deadzone',
    baitHeadline: 'SIGNAL DEADZONE',
    baitSubtext: 'Visual lag illusion — trust muscle memory',
    durationMs: 3600,
    minElapsedMs: 6800,
    vibratePattern: [25, 65, 25, 65],
  },
];

export function selectNextDistraction(
  elapsedMs: number,
  mode: GameMode,
  recentTypes: DistractionType[],
  rng: () => number = Math.random,
): DistractionEvent | null {
  const gateScale = mode === 'chaos' ? 0.65 : mode === 'daily' ? 0.78 : 1.0;
  const eligible = DISTRACTION_CATALOG.filter((d) => elapsedMs >= d.minElapsedMs * gateScale);
  if (eligible.length === 0) return null;

  const nonRecent = eligible.filter((d) => !recentTypes.slice(-2).includes(d.type));
  const pool = nonRecent.length > 0 ? nonRecent : eligible;
  const picked = pool[Math.floor(rng() * pool.length)];

  return {
    type: picked.type,
    label: picked.label,
    baitHeadline: picked.baitHeadline,
    baitSubtext: picked.baitSubtext,
    startedAtElapsedMs: elapsedMs,
    endsAtElapsedMs: elapsedMs + picked.durationMs,
  };
}

export function getNextDistractionDelayMs(
  elapsedMs: number,
  mode: GameMode,
  rng: () => number = Math.random,
): number {
  const baseMin = mode === 'chaos' ? 1550 : mode === 'daily' ? 2000 : 2400;
  const spread = mode === 'chaos' ? 1400 : mode === 'daily' ? 1700 : 2100;
  const ramp = Math.min(0.55, (elapsedMs / 1000) * 0.008);
  return Math.round((baseMin + rng() * spread) * (1 - ramp));
}

export function getTodayDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DAILY_THEMES: Array<{
  title: string;
  modifierLabel: string;
  modifierCode: DailyContract['modifierCode'];
  targetMs: number;
}> = [
  {
    title: 'Sync-Swarm Gauntlet',
    modifierLabel: 'Frequent clone sync-splits · 45s target',
    modifierCode: 'SYNC_SWARM',
    targetMs: 45000,
  },
  {
    title: 'Optic Blur Trial',
    modifierLabel: 'Heavy blur & blink waves · 50s target',
    modifierCode: 'BLUR_GAUNTLET',
    targetMs: 50000,
  },
  {
    title: 'Shrinking Core Protocol',
    modifierLabel: 'Target circle tightens fast · 40s target',
    modifierCode: 'SHRINKING_CORE',
    targetMs: 40000,
  },
  {
    title: 'One-Minute Endurance',
    modifierLabel: 'Full optical chaos · 60s target',
    modifierCode: 'HIGH_VOLTAGE',
    targetMs: 60000,
  },
];

export function getDailyContract(dateKey: string): DailyContract {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  const theme = DAILY_THEMES[hash % DAILY_THEMES.length];
  return {
    dateKey,
    title: theme.title,
    modifierLabel: theme.modifierLabel,
    modifierCode: theme.modifierCode,
    targetMs: theme.targetMs,
  };
}

export function buildKnockoutReport(telemetry: KnockoutTelemetry): KnockoutReport {
  const formattedTime = formatDuration(telemetry.elapsedMs);
  const humanReadableTime = formatHumanDuration(telemetry.elapsedMs);
  const percentile = calculatePercentile(telemetry.elapsedMs);
  const rank = getEnduranceRank(telemetry.elapsedMs);
  const isNewPersonalBest =
    telemetry.elapsedMs > telemetry.previousBestMs && telemetry.elapsedMs >= 400;
  const isNewBestScore = telemetry.score > telemetry.previousBestScore && telemetry.score > 0;
  const survivedOneMinute = telemetry.elapsedMs >= 60000;

  let bossOutcome: KnockoutReport['bossOutcome'] = 'none';
  let bossDeltaMs = 0;
  if (telemetry.bossChallenge && telemetry.bossChallenge.targetMs > 0) {
    bossDeltaMs = telemetry.elapsedMs - telemetry.bossChallenge.targetMs;
    bossOutcome = bossDeltaMs >= 0 ? 'won' : 'lost';
  }

  const dailyCompleted =
    telemetry.mode === 'daily' &&
    Boolean(telemetry.dailyContract) &&
    telemetry.elapsedMs >= (telemetry.dailyContract?.targetMs ?? Infinity);

  const compass = angleToCompass(telemetry.driftAngleDeg);
  const inputWord = telemetry.inputType === 'touch' ? 'Thumb' : 'Pointer';

  let headline = 'Contact Lost';
  let forensicDetail = `Tracking broke at ${formattedTime}.`;

  switch (telemetry.reason) {
    case 'POINTER_RELEASED':
      headline = `${inputWord} Lifted`;
      forensicDetail = `${inputWord} lifted off the moving core at ${formattedTime} while tracking at ${Math.round(telemetry.coreSpeedAtKo)}px/s.`;
      break;
    case 'FOLLOWED_CLONE':
      headline = 'Baited by Decoy Clone';
      forensicDetail = `Followed a lookalike clone ${telemetry.driftMm.toFixed(1)}mm outside the true core toward ${compass} (${telemetry.driftAngleDeg}°) at ${formattedTime}.`;
      break;
    case 'FELL_BEHIND_CORE':
      headline = 'Outrun by Core';
      forensicDetail = `Lagged ${telemetry.driftMm.toFixed(1)}mm behind the core's ${compass} (${telemetry.driftAngleDeg}°) cut at ${Math.round(telemetry.coreSpeedAtKo)}px/s.`;
      break;
    case 'SLIPPED_2MM':
      headline = 'Slipped Off Core';
      forensicDetail = `Drifted ${telemetry.driftMm.toFixed(2)}mm past the moving core edge toward ${compass} (tolerance: ${SLIP_LIMIT_MM.toFixed(1)}mm).`;
      break;
    case 'TREMOR_OVERLOAD':
      headline = 'Erratic Shake Overload';
      forensicDetail = `Rapid erratic jitter dropped tracking accuracy to ${Math.round(telemetry.accuracyPct)}% at ${formattedTime}.`;
      break;
    case 'TILT_OVERLOAD':
      headline = 'Phone Tilt Exceeded';
      forensicDetail = `Device tilted ${telemetry.tiltDeg.toFixed(1)}° past balance lock while tracking at ${formattedTime}.`;
      break;
    case 'SHAKE_OVERLOAD':
      headline = 'Accelerometer Shake KO';
      forensicDetail = `Sharp physical phone shock (${telemetry.shakeMag.toFixed(1)} m/s²) broke sensor stability at ${formattedTime}.`;
      break;
    case 'GYRO_SPIN_OUT':
      headline = 'Gyroscope Spin-Out';
      forensicDetail = `Rapid wrist twist (${Math.round(telemetry.gyroSpinDegPerSec)}°/s) spun the core out of lock at ${formattedTime}.`;
      break;
    case 'WINDOW_BLUR':
      headline = 'App Backgrounded';
      forensicDetail = `Screen or tab lost focus at ${formattedTime}, interrupting live touch capture.`;
      break;
    case 'MULTI_TOUCH_TRAP':
      headline = 'Multi-Touch Interference';
      forensicDetail = `A second finger touched the screen at ${formattedTime}, breaking single-core lock.`;
      break;
    case 'CONTEXT_MENU_TRAP':
      headline = 'Secondary Click Trap';
      forensicDetail = `Right-click / secondary input disrupted active drag at ${formattedTime}.`;
      break;
  }

  let distractionBlame: string | null = null;
  if (telemetry.lastDistraction) {
    const sinceStartMs = telemetry.elapsedMs - telemetry.lastDistraction.startedAtElapsedMs;
    const withinWindow = telemetry.elapsedMs <= telemetry.lastDistraction.endsAtElapsedMs + 1200;
    if (sinceStartMs >= 0 && withinWindow) {
      distractionBlame = `Knocked out ${(sinceStartMs / 1000).toFixed(2)}s into "${telemetry.lastDistraction.label}".`;
    }
  }

  // Near-miss dopamine hook for retry motivation
  let nearMissPrompt: string | null = null;
  if (!isNewPersonalBest && telemetry.previousBestMs > 0) {
    const diffMs = telemetry.previousBestMs - telemetry.elapsedMs;
    if (diffMs > 0 && diffMs <= 4500) {
      nearMissPrompt = `So close — only ${formatDuration(diffMs)} shy of your Personal Best.`;
    }
  } else if (!survivedOneMinute && telemetry.elapsedMs >= 50000) {
    nearMissPrompt = `Only ${formatDuration(60000 - telemetry.elapsedMs)} away from 1-Minute Survivor.`;
  } else if (rank.nextMs && rank.nextMs - telemetry.elapsedMs <= 3500) {
    nearMissPrompt = `Just ${formatDuration(rank.nextMs - telemetry.elapsedMs)} short of ${getEnduranceRank(rank.nextMs).title}.`;
  }

  const percentileSummary = `You survived ${humanReadableTime}. Longer than ${percentile}% of people who tried.`;

  return {
    reason: telemetry.reason,
    headline,
    forensicDetail,
    distractionBlame,
    nearMissPrompt,
    elapsedMs: telemetry.elapsedMs,
    score: Math.round(telemetry.score),
    maxCombo: telemetry.maxCombo,
    clutchSaves: telemetry.clutchSaves,
    bonusGatesCollected: telemetry.bonusGatesCollected,
    formattedTime,
    humanReadableTime,
    percentile,
    percentileSummary,
    rank,
    isNewPersonalBest,
    isNewBestScore,
    survivedOneMinute,
    bossOutcome,
    bossDeltaMs,
    dailyCompleted,
    driftMm: telemetry.driftMm,
    peakDriftMm: telemetry.peakDriftMm,
    peakSpeedPx: telemetry.peakSpeedPx,
    accuracyPct: telemetry.accuracyPct,
    distractionsSurvived: telemetry.distractionsSurvived,
    mode: telemetry.mode,
  };
}

export function parseBossFromSearch(searchStr: string): BossChallenge | null {
  try {
    const params = new URLSearchParams(searchStr);
    const bossRaw = params.get('boss');
    if (!bossRaw) return null;
    const targetMs = Number(bossRaw);
    if (!Number.isFinite(targetMs) || targetMs < 400) return null;
    const rawName = (params.get('name') || 'CHALLENGER').trim().slice(0, 18);
    const challengerName = rawName.length > 0 ? rawName.toUpperCase() : 'CHALLENGER';
    const causeRaw = params.get('cause') as KnockoutReason | null;
    return {
      targetMs: Math.round(targetMs),
      challengerName,
      challengerCause: causeRaw || undefined,
    };
  } catch {
    return null;
  }
}

export function buildBossShareUrl(
  origin: string,
  pathname: string,
  elapsedMs: number,
  callsign: string,
  cause: KnockoutReason,
): string {
  const url = new URL(pathname || '/', origin);
  url.searchParams.set('boss', String(Math.round(elapsedMs)));
  url.searchParams.set('name', (callsign || 'ANCHOR').trim().slice(0, 18));
  url.searchParams.set('cause', cause);
  return url.toString();
}
