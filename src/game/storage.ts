import { getTodayDateKey } from './engine';
import { compactGhostPath } from './ghost';
import type { DistractionType, GameMode, GhostSample, KnockoutReport, StoredPlayerData } from './types';

const STORAGE_KEY = 'holdtheline_player_v2';

const DEFAULT_DATA: StoredPlayerData = {
  callsign: 'ANCHOR',
  personalBestMs: 0,
  personalBestPath: [],
  bestScore: 0,
  xp: 0,
  bestByMode: {
    classic: 0,
    chaos: 0,
    daily: 0,
  },
  totalRuns: 0,
  totalHoldMs: 0,
  history: [],
  streakCount: 0,
  bestStreak: 0,
  lastDailyDate: null,
  completedDailyDates: [],
  discoveredDistractions: [],
  soundEnabled: true,
  hapticsEnabled: true,
};

export function loadPlayerData(): StoredPlayerData {
  if (typeof window === 'undefined') return { ...DEFAULT_DATA };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DATA };
    const parsed = JSON.parse(raw) as Partial<StoredPlayerData>;
    return {
      ...DEFAULT_DATA,
      ...parsed,
      bestByMode: {
        ...DEFAULT_DATA.bestByMode,
        ...(parsed.bestByMode || {}),
      },
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 15) : [],
      personalBestPath: Array.isArray(parsed.personalBestPath)
        ? parsed.personalBestPath.slice(0, 900)
        : [],
      completedDailyDates: Array.isArray(parsed.completedDailyDates)
        ? parsed.completedDailyDates.slice(-30)
        : [],
      discoveredDistractions: Array.isArray(parsed.discoveredDistractions)
        ? parsed.discoveredDistractions
        : [],
    };
  } catch {
    return { ...DEFAULT_DATA };
  }
}

export function savePlayerData(data: StoredPlayerData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

function isYesterday(prevDateKey: string, todayKey: string): boolean {
  const prev = new Date(`${prevDateKey}T12:00:00`);
  const today = new Date(`${todayKey}T12:00:00`);
  const diffDays = Math.round((today.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

export function recordRunResult(
  current: StoredPlayerData,
  report: KnockoutReport,
  mode: GameMode,
  recordedPath?: GhostSample[],
): StoredPlayerData {
  const todayKey = getTodayDateKey();
  const discoveredSet = new Set<DistractionType>([
    ...current.discoveredDistractions,
    ...report.distractionsSurvived,
  ]);

  let streakCount = current.streakCount;
  let bestStreak = current.bestStreak;
  let lastDailyDate = current.lastDailyDate;
  const completedDailyDates = [...current.completedDailyDates];

  if (report.dailyCompleted && !completedDailyDates.includes(todayKey)) {
    completedDailyDates.push(todayKey);
    if (lastDailyDate && isYesterday(lastDailyDate, todayKey)) {
      streakCount += 1;
    } else if (lastDailyDate !== todayKey) {
      streakCount = 1;
    }
    lastDailyDate = todayKey;
    bestStreak = Math.max(bestStreak, streakCount);
  }

  const nextBestByMode = {
    ...current.bestByMode,
    [mode]: Math.max(current.bestByMode[mode] || 0, report.elapsedMs),
  };

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    elapsedMs: report.elapsedMs,
    score: report.score,
    mode,
    reason: report.reason,
    percentile: report.percentile,
    tricksCount: report.distractionsSurvived.length,
    accuracyPct: Math.round(report.accuracyPct),
  };

  const earnedXp = Math.max(15, Math.round(report.elapsedMs / 400 + report.distractionsSurvived.length * 35 + report.clutchSaves * 25));

  const shouldSavePath =
    Boolean(recordedPath && recordedPath.length >= 2) &&
    (report.isNewPersonalBest || current.personalBestPath.length < 2);

  const updated: StoredPlayerData = {
    ...current,
    personalBestMs: Math.max(current.personalBestMs, report.elapsedMs),
    personalBestPath: shouldSavePath
      ? compactGhostPath(recordedPath!)
      : current.personalBestPath,
    bestScore: Math.max(current.bestScore, report.score),
    xp: current.xp + earnedXp,
    bestByMode: nextBestByMode,
    totalRuns: current.totalRuns + 1,
    totalHoldMs: current.totalHoldMs + report.elapsedMs,
    history: [entry, ...current.history].slice(0, 12),
    streakCount,
    bestStreak,
    lastDailyDate,
    completedDailyDates: completedDailyDates.slice(-30),
    discoveredDistractions: Array.from(discoveredSet),
  };

  savePlayerData(updated);
  return updated;
}
