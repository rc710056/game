import { Calendar, Check, Flame, History, Shield, Sparkles, X } from 'lucide-react';
import { DISTRACTION_CATALOG, formatDuration, getTodayDateKey } from '../game/engine';
import type { SensorPermissionState } from '../game/sensors';
import type { StoredPlayerData } from '../game/types';

interface RecordsModalProps {
  data: StoredPlayerData;
  onClose: () => void;
  onUpdateCallsign: (name: string) => void;
  onRequestMotionSensors: () => void;
  motionStatus: SensorPermissionState;
}

function getLast7Days(todayKey: string): Array<{ dateKey: string; shortLabel: string; isToday: boolean }> {
  const days: Array<{ dateKey: string; shortLabel: string; isToday: boolean }> = [];
  const base = new Date(`${todayKey}T12:00:00`);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const key = getTodayDateKey(d);
    const shortLabel = d.toLocaleDateString('en-US', { weekday: 'narrow' });
    days.push({ dateKey: key, shortLabel, isToday: i === 0 });
  }
  return days;
}

export function RecordsModal({
  data,
  onClose,
  onUpdateCallsign,
  onRequestMotionSensors,
  motionStatus,
}: RecordsModalProps) {
  const todayKey = getTodayDateKey();
  const completedToday = data.completedDailyDates.includes(todayKey);
  const last7Days = getLast7Days(todayKey);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="records-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#07080C]/85"
    >
      <div className="w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl bg-[#10131A] border border-white/12 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 id="records-title" className="font-display text-2xl font-extrabold uppercase text-white">
              Endurance Ledger
            </h2>
            <p className="text-xs text-slate-400">
              Scores, 7-day consistency, phone sensors &amp; {DISTRACTION_CATALOG.length}-trap codex
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close records modal"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[#161A23] hover:bg-[#1E2430] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Player Callsign & Motion Calibration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-[#161A23] border border-white/8 p-4">
              <label htmlFor="callsign-input" className="block text-xs text-slate-400 mb-1.5">
                Challenger Callsign (for Boss Links)
              </label>
              <input
                id="callsign-input"
                type="text"
                maxLength={16}
                value={data.callsign}
                onChange={(e) => onUpdateCallsign(e.target.value.toUpperCase())}
                placeholder="ANCHOR"
                className="w-full h-10 px-3 rounded-lg bg-[#0B0D12] border border-white/12 text-sm font-mono-tabular font-semibold text-white focus:outline-none focus:border-[#FF3B1D]"
              />
            </div>

            <div className="rounded-xl bg-[#161A23] border border-white/8 p-4 flex flex-col justify-between">
              <div className="text-xs text-slate-400">Phone Gyro, Gravity &amp; Shake</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">
                  {motionStatus === 'active'
                    ? 'Active (Tilt + Gyro + Shake)'
                    : motionStatus === 'denied'
                      ? 'Permission Denied'
                      : motionStatus === 'prompt'
                        ? 'iOS Permission Needed'
                        : 'Touch Tracking Active'}
                </span>
                {motionStatus === 'prompt' && (
                  <button
                    type="button"
                    onClick={onRequestMotionSensors}
                    className="px-3 py-1.5 rounded-lg bg-[#FF3B1D] hover:bg-[#FF5236] text-xs font-semibold text-white cursor-pointer"
                  >
                    Enable
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#161A23] border border-white/8 p-3.5">
              <div className="text-xs text-slate-400">Best Time</div>
              <div className="font-mono-tabular text-lg sm:text-xl font-bold text-[#00E5A3] mt-1">
                {formatDuration(data.personalBestMs)}
              </div>
            </div>
            <div className="rounded-xl bg-[#161A23] border border-white/8 p-3.5">
              <div className="text-xs text-slate-400">Best Score</div>
              <div className="font-mono-tabular text-lg sm:text-xl font-bold text-[#FFB800] mt-1">
                {data.bestScore.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl bg-[#161A23] border border-white/8 p-3.5">
              <div className="text-xs text-slate-400 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-[#FF3B1D]" aria-hidden="true" />
                <span>Streak</span>
              </div>
              <div className="font-mono-tabular text-lg sm:text-xl font-bold text-white mt-1">
                {data.streakCount} {data.streakCount === 1 ? 'day' : 'days'}
              </div>
            </div>
            <div className="rounded-xl bg-[#161A23] border border-white/8 p-3.5">
              <div className="text-xs text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#38BDF8]" aria-hidden="true" />
                <span>Total XP</span>
              </div>
              <div className="font-mono-tabular text-lg sm:text-xl font-bold text-white mt-1">
                {data.xp.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Daily Status & 7-Day Consistency Strip */}
          <div className="rounded-xl bg-[#161A23] border border-white/8 p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-[#FFB800] shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-sm font-semibold text-white">7-Day Consistency Lock</div>
                  <div className="text-xs text-slate-400">
                    {completedToday
                      ? 'Today cleared — daily streak is locked.'
                      : 'Complete today’s Daily contract to stamp your streak.'}
                  </div>
                </div>
              </div>
              <span
                className={`text-xs font-bold uppercase tracking-wider shrink-0 ${
                  completedToday ? 'text-[#00E5A3]' : 'text-[#FFB800]'
                }`}
              >
                {completedToday ? 'Cleared' : 'Pending'}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-2 pt-1" data-testid="consistency-strip">
              {last7Days.map((day) => {
                const cleared = data.completedDailyDates.includes(day.dateKey);
                return (
                  <div
                    key={day.dateKey}
                    className={`rounded-lg py-2 flex flex-col items-center justify-center gap-1 border text-xs ${
                      cleared
                        ? 'bg-[#00E5A3]/15 border-[#00E5A3]/40 text-[#00E5A3]'
                        : day.isToday
                          ? 'bg-[#FFB800]/10 border-[#FFB800]/35 text-[#FFB800]'
                          : 'bg-[#0C0E14] border-white/6 text-slate-500'
                    }`}
                  >
                    <span className="font-semibold">{day.shortLabel}</span>
                    {cleared ? (
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-current opacity-45" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Distraction Codex */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Optical &amp; Sensor Trap Codex</span>
              </div>
              <span className="font-mono-tabular text-xs text-slate-400">
                {data.discoveredDistractions.length} / {DISTRACTION_CATALOG.length} survived
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DISTRACTION_CATALOG.map((item) => {
                const seen = data.discoveredDistractions.includes(item.type);
                return (
                  <div
                    key={item.type}
                    className={`rounded-lg px-3 py-2 border text-xs ${
                      seen
                        ? 'bg-[#161A23] border-white/10 text-slate-100'
                        : 'bg-[#0C0E14] border-white/5 text-slate-500'
                    }`}
                  >
                    <div className="font-semibold">{seen ? item.label : 'Undiscovered Trap'}</div>
                    <div className="text-[11px] opacity-75 truncate">
                      {seen ? item.baitSubtext : `Unlocks after ${(item.minElapsedMs / 1000).toFixed(0)}s`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Run History */}
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Recent Runs</span>
            </div>
            {data.history.length === 0 ? (
              <div className="rounded-xl bg-[#161A23] border border-white/6 p-4 text-sm text-slate-400 text-center">
                No completed runs yet. Press and track the moving core to set your first record.
              </div>
            ) : (
              <div className="divide-y divide-white/6 rounded-xl bg-[#161A23] border border-white/8 overflow-hidden">
                {data.history.slice(0, 6).map((run) => (
                  <div key={run.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-mono-tabular text-sm font-bold text-white">
                        {formatDuration(run.elapsedMs)}
                      </span>
                      <span className="text-slate-400 ml-2 capitalize">{run.mode}</span>
                    </div>
                    <div className="text-slate-400 flex items-center gap-2">
                      <span className="font-mono-tabular text-[#FFB800]">
                        {(run.score || 0).toLocaleString()} pts
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{run.accuracyPct}% acc</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{run.tricksCount} tricks</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
