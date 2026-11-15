import { Check, Copy, Flame, RotateCcw, Share2, ShieldAlert, Trophy, Zap } from 'lucide-react';
import { useState } from 'react';
import { buildBossShareUrl, formatDuration } from '../game/engine';
import type { BossChallenge, KnockoutReport } from '../game/types';

interface KnockoutModalProps {
  report: KnockoutReport;
  callsign: string;
  bossChallenge: BossChallenge | null;
  onPlayAgain: () => void;
  onBackToTitle: () => void;
  onOpenRecords: () => void;
}

export function KnockoutModal({
  report,
  callsign,
  bossChallenge,
  onPlayAgain,
  onBackToTitle,
  onOpenRecords,
}: KnockoutModalProps) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const shareUrl =
    typeof window !== 'undefined'
      ? buildBossShareUrl(
          window.location.origin,
          window.location.pathname,
          report.elapsedMs,
          callsign,
          report.reason,
        )
      : '';

  const handleCopyChallenge = async () => {
    const shareText = `I tracked the moving core for ${report.formattedTime} · ${report.score.toLocaleString()} pts (Longer than ${report.percentile}% of players) before "${report.headline}". Beat my Boss Time: ${shareUrl}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      }
    } catch {
      // Fallback handled by showing copied URL inline
    }
    setCopiedLink(shareUrl);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ko-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#07080C]/85 overflow-y-auto"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#10131A] border border-white/12 shadow-2xl overflow-hidden my-auto">
        {/* Top Verdict Strip */}
        <div className="px-6 pt-5 pb-4 border-b border-white/8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-[#FF4D2E]">
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Knock-Out Autopsy</span>
            </div>
            <h2
              id="ko-title"
              className="mt-1 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white uppercase"
            >
              {report.headline}
            </h2>
          </div>

          <div className="text-right shrink-0">
            <div className="text-xs text-slate-400">Rank Achieved</div>
            <div
              className="font-display text-lg font-bold tracking-wide"
              style={{ color: report.rank.accentHex }}
            >
              {report.rank.title}
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Hero Survival Clock, Score & Viral Percentile */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-white/8">
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Survival Time</div>
              <div
                data-testid="ko-time"
                className="font-mono-tabular text-4xl sm:text-5xl font-bold tracking-tight text-white mt-0.5"
              >
                {report.formattedTime}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs">
                <span data-testid="ko-score" className="font-mono-tabular font-bold text-[#FFB800]">
                  {report.score.toLocaleString()} pts
                </span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="font-mono-tabular font-semibold text-slate-300">
                  Max x{report.maxCombo}
                </span>
                {report.isNewBestScore && (
                  <span className="text-[#00E5A3] font-bold uppercase tracking-wider">
                    High Score
                  </span>
                )}
              </div>
            </div>

            <div className="sm:text-right">
              {report.survivedOneMinute && (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#FFB800] mb-1 mr-3 sm:mr-0 sm:block">
                  <span>1-Minute Club Cleared</span>
                </div>
              )}
              {report.isNewPersonalBest && (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#00E5A3] mb-1">
                  <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>New Personal Best</span>
                </div>
              )}
              <div className="text-sm font-medium text-slate-200 leading-snug max-w-xs">
                {report.percentileSummary}
              </div>
            </div>
          </div>

          {/* Near-Miss Retry Hook */}
          {report.nearMissPrompt && (
            <div
              data-testid="ko-nearmiss"
              className="rounded-xl px-4 py-2.5 bg-[#FFB800]/12 border border-[#FFB800]/35 text-xs sm:text-sm font-semibold text-[#FFE082] flex items-center gap-2"
            >
              <Flame className="w-4 h-4 text-[#FFB800] shrink-0" aria-hidden="true" />
              <span>{report.nearMissPrompt}</span>
            </div>
          )}

          {/* Exact Forensic Cause Box */}
          <div className="rounded-xl bg-[#161A23] border border-white/8 p-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              What Actually Knocked You Out
            </div>
            <p data-testid="ko-forensic" className="text-sm text-slate-100 leading-relaxed">
              {report.forensicDetail}
            </p>
            {report.distractionBlame && (
              <p className="text-xs font-medium text-[#FFB800] flex items-center gap-1.5 pt-1">
                <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{report.distractionBlame}</span>
              </p>
            )}
          </div>

          {/* Boss / Daily Verdict */}
          {report.bossOutcome !== 'none' && bossChallenge && (
            <div
              className={`rounded-xl px-4 py-3 border text-sm font-medium flex items-center justify-between gap-3 ${
                report.bossOutcome === 'won'
                  ? 'bg-[#00E5A3]/10 border-[#00E5A3]/30 text-[#00E5A3]'
                  : 'bg-[#FF3B1D]/10 border-[#FF3B1D]/30 text-[#FF8A75]'
              }`}
            >
              <span>
                {report.bossOutcome === 'won'
                  ? `Boss Defeated: You beat ${bossChallenge.challengerName}'s time`
                  : `Boss Held: Short of ${bossChallenge.challengerName}'s time`}
              </span>
              <span className="font-mono-tabular font-bold shrink-0">
                {report.bossOutcome === 'won' ? '+' : '-'}
                {formatDuration(Math.abs(report.bossDeltaMs))}
              </span>
            </div>
          )}

          {report.dailyCompleted && (
            <div className="rounded-xl px-4 py-3 bg-[#FFB800]/10 border border-[#FFB800]/30 text-sm font-semibold text-[#FFB800] flex items-center justify-between">
              <span>Daily Contract Completed · Streak Extended</span>
              <span className="font-mono-tabular">{report.formattedTime}</span>
            </div>
          )}

          {/* 3 Telemetry Stat Tiles */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-[#161A23] border border-white/6 px-3 py-2.5 flex flex-col justify-between">
              <div className="text-[11px] text-slate-400 whitespace-nowrap">Peak Speed</div>
              <div className="font-mono-tabular text-base sm:text-lg font-bold text-white mt-0.5 whitespace-nowrap">
                {Math.round(report.peakSpeedPx)}px/s
              </div>
            </div>
            <div className="rounded-xl bg-[#161A23] border border-white/6 px-3 py-2.5 flex flex-col justify-between">
              <div className="text-[11px] text-slate-400 whitespace-nowrap">Accuracy</div>
              <div className="font-mono-tabular text-base sm:text-lg font-bold text-white mt-0.5 whitespace-nowrap">
                {Math.round(report.accuracyPct)}%
              </div>
            </div>
            <div className="rounded-xl bg-[#161A23] border border-white/6 px-3 py-2.5 flex flex-col justify-between">
              <div className="text-[11px] text-slate-400 whitespace-nowrap">Saves / Tricks</div>
              <div className="font-mono-tabular text-base sm:text-lg font-bold text-white mt-0.5 whitespace-nowrap">
                {report.clutchSaves} / {report.distractionsSurvived.length}
              </div>
            </div>
          </div>

          {/* Copied Boss Challenge Link Preview */}
          {copiedLink && (
            <div className="rounded-xl bg-[#0D1017] border border-[#00E5A3]/30 px-3.5 py-2.5 text-xs text-slate-200 flex items-center justify-between gap-2">
              <span className="truncate font-mono-tabular text-[#00E5A3]">{copiedLink}</span>
              <span className="inline-flex items-center gap-1 text-[#00E5A3] font-semibold shrink-0">
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                Copied
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-[#FF3B1D] hover:bg-[#FF5236] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Try Again</span>
            </button>

            <button
              type="button"
              onClick={handleCopyChallenge}
              className="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-[#1A202C] hover:bg-[#232B3A] border border-white/12 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              {copiedLink ? (
                <Copy className="w-4 h-4 shrink-0 text-[#00E5A3]" aria-hidden="true" />
              ) : (
                <Share2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span>{copiedLink ? 'Challenge Copied' : 'Challenge a Friend'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <button
              type="button"
              onClick={onOpenRecords}
              className="hover:text-white underline underline-offset-4 py-1 cursor-pointer"
            >
              View Records &amp; Daily Streak
            </button>
            <button
              type="button"
              onClick={onBackToTitle}
              className="hover:text-white underline underline-offset-4 py-1 cursor-pointer"
            >
              Change Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
