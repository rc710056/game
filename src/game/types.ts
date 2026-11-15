export type GamePhase = 'title' | 'playing' | 'gameover';

export type HoldSubState = 'armed' | 'holding';

export type GameMode = 'classic' | 'chaos' | 'daily';

export type KnockoutReason =
  | 'POINTER_RELEASED'
  | 'FOLLOWED_CLONE'
  | 'FELL_BEHIND_CORE'
  | 'SLIPPED_2MM'
  | 'TREMOR_OVERLOAD'
  | 'TILT_OVERLOAD'
  | 'SHAKE_OVERLOAD'
  | 'GYRO_SPIN_OUT'
  | 'WINDOW_BLUR'
  | 'MULTI_TOUCH_TRAP'
  | 'CONTEXT_MENU_TRAP';

export type DistractionType =
  | 'SYNC_SPLIT'
  | 'COLOR_MERGE'
  | 'BLINK_STROBE'
  | 'OPTIC_BLUR'
  | 'HAPTIC_QUAKE'
  | 'CHROMATIC_INVERT'
  | 'RGB_TEAR'
  | 'GRAVITY_SHIFT'
  | 'SYSTEM_BAIT_BLUFF'
  | 'FAKE_FREEZE'
  | 'FAKE_VICTORY_BLUFF'
  | 'DEADZONE_LAG';

export type MotionPattern = 'GLIDE' | 'LISSAJOUS' | 'ORBIT_WHIP' | 'DASH_CUT' | 'SWARM_WEAVE';

export interface PhoneSensorSnapshot {
  active: boolean;
  tiltXDeg: number; // left/right gamma delta
  tiltYDeg: number; // front/back beta delta
  tiltTotalDeg: number;
  gravityX: number; // normalized -1..1
  gravityY: number; // normalized -1..1
  gyroSpinDegPerSec: number;
  shakeMag: number; // m/s^2 jitter above 1G
  source: 'none' | 'deviceorientation+motion' | 'generic-sensor';
}

export interface DistractionDefinition {
  type: DistractionType;
  label: string;
  baitHeadline: string;
  baitSubtext: string;
  durationMs: number;
  minElapsedMs: number;
  vibratePattern?: number[];
}

export interface DistractionEvent {
  type: DistractionType;
  label: string;
  baitHeadline: string;
  baitSubtext: string;
  startedAtElapsedMs: number;
  endsAtElapsedMs: number;
}

export interface EnduranceRank {
  tier: number;
  title: string;
  minMs: number;
  nextMs: number | null;
  accentHex: string;
}

export interface BossChallenge {
  targetMs: number;
  challengerName: string;
  challengerCause?: KnockoutReason;
}

export interface DailyContract {
  dateKey: string;
  title: string;
  modifierLabel: string;
  modifierCode: 'SHRINKING_CORE' | 'HIGH_VOLTAGE' | 'BLUR_GAUNTLET' | 'SYNC_SWARM';
  targetMs: number;
}

export interface KnockoutTelemetry {
  reason: KnockoutReason;
  elapsedMs: number;
  score: number;
  maxCombo: number;
  clutchSaves: number;
  bonusGatesCollected: number;
  driftMm: number;
  driftAngleDeg: number;
  peakDriftMm: number;
  peakSpeedPx: number;
  accuracyPct: number;
  tiltDeg: number;
  shakeMag: number;
  gyroSpinDegPerSec: number;
  distractionsSurvived: DistractionType[];
  lastDistraction?: DistractionEvent | null;
  coreSpeedAtKo: number;
  mode: GameMode;
  inputType: 'mouse' | 'touch' | 'pen';
  bossChallenge?: BossChallenge | null;
  dailyContract?: DailyContract | null;
  previousBestMs: number;
  previousBestScore: number;
}

export interface KnockoutReport {
  reason: KnockoutReason;
  headline: string;
  forensicDetail: string;
  distractionBlame: string | null;
  nearMissPrompt: string | null;
  elapsedMs: number;
  score: number;
  maxCombo: number;
  clutchSaves: number;
  bonusGatesCollected: number;
  formattedTime: string;
  humanReadableTime: string;
  percentile: number;
  percentileSummary: string;
  rank: EnduranceRank;
  isNewPersonalBest: boolean;
  isNewBestScore: boolean;
  survivedOneMinute: boolean;
  bossOutcome: 'none' | 'won' | 'lost';
  bossDeltaMs: number;
  dailyCompleted: boolean;
  driftMm: number;
  peakDriftMm: number;
  peakSpeedPx: number;
  accuracyPct: number;
  distractionsSurvived: DistractionType[];
  mode: GameMode;
}

export interface RunHistoryEntry {
  id: string;
  timestamp: number;
  elapsedMs: number;
  score: number;
  mode: GameMode;
  reason: KnockoutReason;
  percentile: number;
  tricksCount: number;
  accuracyPct: number;
}

export interface GhostSample {
  tMs: number;
  nx: number;
  ny: number;
}

export interface StoredPlayerData {
  callsign: string;
  personalBestMs: number;
  personalBestPath: GhostSample[];
  bestScore: number;
  xp: number;
  bestByMode: Record<GameMode, number>;
  totalRuns: number;
  totalHoldMs: number;
  history: RunHistoryEntry[];
  streakCount: number;
  bestStreak: number;
  lastDailyDate: string | null;
  completedDailyDates: string[];
  discoveredDistractions: DistractionType[];
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}
