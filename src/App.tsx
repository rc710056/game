import {
  Activity,
  Award,
  BatteryWarning,
  Calendar,
  Compass,
  Flame,
  Play,
  Smartphone,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArenaCanvas, type ArenaRenderState } from './components/ArenaCanvas';
import { KnockoutModal } from './components/KnockoutModal';
import { RecordsModal } from './components/RecordsModal';
import {
  createInitialCoreState,
  evaluatePointerOnCore,
  resetCoreForNewRun,
  spawnDistractionClones,
  stepCoreSimulation,
} from './game/arena';
import { enduranceAudio } from './game/audio';
import {
  buildKnockoutReport,
  DISTRACTION_CATALOG,
  formatDuration,
  getComboPulseConfig,
  getDailyContract,
  getEnduranceRank,
  getNextDistractionDelayMs,
  getTodayDateKey,
  parseBossFromSearch,
  selectNextDistraction,
  SLIP_LIMIT_MM,
} from './game/engine';
import {
  createGhostSample,
  GHOST_SAMPLE_INTERVAL_MS,
  sampleGhostPosition,
} from './game/ghost';
import {
  computeGyroSpin,
  computeShakeMagnitude,
  createEmptySensorSnapshot,
  detectMobileSensorState,
  normalizeOrientationToGravity,
  requestAllPhoneSensors,
  type SensorPermissionState,
} from './game/sensors';
import { loadPlayerData, recordRunResult, savePlayerData } from './game/storage';
import type {
  DistractionEvent,
  DistractionType,
  GameMode,
  GamePhase,
  GhostSample,
  HoldSubState,
  KnockoutReason,
  KnockoutReport,
  PhoneSensorSnapshot,
  StoredPlayerData,
} from './game/types';

export default function App() {
  const [playerData, setPlayerData] = useState<StoredPlayerData>(() => loadPlayerData());
  const [phase, setPhase] = useState<GamePhase>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'playing';
    }
    return 'title';
  });
  const [holdSubState, setHoldSubState] = useState<HoldSubState>('armed');
  const [mode, setMode] = useState<GameMode>('classic');
  const [rankTitle, setRankTitle] = useState(() => getEnduranceRank(0).title);
  const [rankNextMs, setRankNextMs] = useState<number | null>(() => getEnduranceRank(0).nextMs);
  const [beatenBossOrPb, setBeatenBossOrPb] = useState(false);
  const [isInverted, setIsInverted] = useState(false);
  const [activeDistraction, setActiveDistraction] = useState<DistractionEvent | null>(null);
  const [tricksCount, setTricksCount] = useState(0);
  const [milestoneBanner, setMilestoneBanner] = useState<string | null>(null);
  const [koReport, setKoReport] = useState<KnockoutReport | null>(null);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [motionStatus, setMotionStatus] = useState<SensorPermissionState>(() =>
    detectMobileSensorState(),
  );

  const bossChallenge = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return parseBossFromSearch(window.location.search);
  }, []);

  const todayKey = useMemo(() => getTodayDateKey(), []);
  const dailyContract = useMemo(() => getDailyContract(todayKey), [todayKey]);

  // Leaf DOM refs for high-frequency HUD updates without React re-renders
  const gameContainerRef = useRef<HTMLDivElement | null>(null);
  const hudTopBarRef = useRef<HTMLDivElement | null>(null);
  const hudTimerWrapRef = useRef<HTMLDivElement | null>(null);
  const timerTextRef = useRef<HTMLDivElement | null>(null);
  const speedHudRef = useRef<HTMLSpanElement | null>(null);
  const accuracyHudRef = useRef<HTMLSpanElement | null>(null);
  const tiltHudRef = useRef<HTMLSpanElement | null>(null);
  const scoreHudRef = useRef<HTMLSpanElement | null>(null);
  const comboHudRef = useRef<HTMLSpanElement | null>(null);
  const paceFillRef = useRef<HTMLDivElement | null>(null);
  const lastHandledComboPulseRef = useRef(0);
  const wasDeadzoneActiveRef = useRef(false);

  const sensorsRef = useRef<PhoneSensorSnapshot>(createEmptySensorSnapshot());
  const recordedGhostRef = useRef<GhostSample[]>([]);
  const previousBestPathRef = useRef<GhostSample[]>(playerData.personalBestPath);

  const runRef = useRef({
    active: false,
    startTime: 0,
    elapsedMs: 0,
    idleTimeMs: 0,
    pointerId: null as number | null,
    inputType: 'touch' as 'mouse' | 'touch' | 'pen',
    score: 0,
    combo: 1,
    maxCombo: 1,
    clutchSaves: 0,
    bonusGatesCollected: 0,
    wasDangerEdge: false,
    lastClutchAtMs: -5000,
    lastGhostSampleAtMs: 0,
    lastMicroPulseAtMs: 0,
    lastDistractionVibeAtMs: -5000,
    ghostPassedAnnounced: false,
    precisionHeat: 0,
    sweetSpotAnnounced: false,
    popupCounter: 0,
    missTapCounter: 0,
    driftMm: 0,
    peakDriftMm: 0,
    driftAngleDeg: 0,
    peakSpeedPx: 0,
    accuracySamples: 0,
    accuracySum: 0,
    accuracyPct: 100,
    outsideGraceMs: 0,
    distractionsSurvived: [] as DistractionType[],
    activeDistraction: null as DistractionEvent | null,
    lastDistraction: null as DistractionEvent | null,
    nextDistractionAtMs: 4800,
    frozenDisplayMs: null as number | null,
    beatenPb: false,
    beatenBoss: false,
    survivedOneMin: false,
    lastRankTier: 1,
    baseTiltBeta: null as number | null,
    baseTiltGamma: null as number | null,
    currentTiltDeg: 0,
    peakShakeMag: 0,
    peakGyroSpinDeg: 0,
    lastUiTextAt: 0,
  });

  const triggerKnockoutRef = useRef<(reason: KnockoutReason) => void>(() => {});

  const renderStateRef = useRef<ArenaRenderState>({
    core: createInitialCoreState(
      typeof window !== 'undefined' ? window.innerWidth : 1024,
      typeof window !== 'undefined' ? window.innerHeight : 768,
    ),
    ghost: null,
    sensors: sensorsRef.current,
    isHolding: false,
    isArmedOrTitle: true,
    pointerActive: false,
    pointerX: 0,
    pointerY: 0,
    hoverActive: false,
    hoverX: 0,
    hoverY: 0,
    beatenBossOrPb: false,
    fakeVictoryBluff: false,
    koFlash: 0,
    pulseTrigger: 0,
    comboPulseTrigger: 0,
    microPulseTrigger: 0,
    microPulseStrength: 0.25,
    combo: 1,
    elapsedMs: 0,
    precisionHeat: 0,
    driftNorm: 0,
    popupEvent: null,
    missTapEvent: null,
    onTickFrame: () => {},
  });

  useEffect(() => {
    enduranceAudio.setEnabled(playerData.soundEnabled);
  }, [playerData.soundEnabled]);

  useEffect(() => {
    document.body.dataset.state = phase;
    renderStateRef.current.isHolding = phase === 'playing' && holdSubState === 'holding';
    renderStateRef.current.isArmedOrTitle =
      phase === 'title' || (phase === 'playing' && holdSubState === 'armed');
    if (phase === 'playing' && holdSubState === 'armed' && timerTextRef.current) {
      timerTextRef.current.textContent = '00:00.000';
    }
  }, [phase, holdSubState]);

  const triggerKnockout = useCallback(
    (reason: KnockoutReason) => {
      if (!runRef.current.active) return;
      runRef.current.active = false;
      const finalMs = Math.max(0, performance.now() - runRef.current.startTime);
      runRef.current.elapsedMs = finalMs;

      enduranceAudio.playKnockoutBuzzer();
      if (playerData.hapticsEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([170, 45, 220]);
        } catch {
          // Ignore vibrate errors
        }
      }

      if (timerTextRef.current) {
        timerTextRef.current.textContent = formatDuration(finalMs);
      }

      const avgAccuracy =
        runRef.current.accuracySamples > 0
          ? runRef.current.accuracySum / runRef.current.accuracySamples
          : 100;

      const report = buildKnockoutReport({
        reason,
        elapsedMs: finalMs,
        score: runRef.current.score,
        maxCombo: runRef.current.maxCombo,
        clutchSaves: runRef.current.clutchSaves,
        bonusGatesCollected: runRef.current.bonusGatesCollected,
        driftMm: runRef.current.driftMm,
        driftAngleDeg: runRef.current.driftAngleDeg,
        peakDriftMm: runRef.current.peakDriftMm,
        peakSpeedPx: runRef.current.peakSpeedPx,
        accuracyPct: avgAccuracy,
        tiltDeg: runRef.current.currentTiltDeg,
        shakeMag: runRef.current.peakShakeMag,
        gyroSpinDegPerSec: runRef.current.peakGyroSpinDeg,
        distractionsSurvived: [...runRef.current.distractionsSurvived],
        lastDistraction: runRef.current.lastDistraction,
        coreSpeedAtKo: renderStateRef.current.core.speedPx,
        mode,
        inputType: runRef.current.inputType,
        bossChallenge,
        dailyContract: mode === 'daily' ? dailyContract : null,
        previousBestMs: playerData.personalBestMs,
        previousBestScore: playerData.bestScore,
      });

      recordedGhostRef.current.push(
        createGhostSample(
          finalMs,
          renderStateRef.current.core.x,
          renderStateRef.current.core.y,
          window.innerWidth,
          window.innerHeight,
        ),
      );

      const nextStored = recordRunResult(playerData, report, mode, recordedGhostRef.current);
      setPlayerData(nextStored);
      setActiveDistraction(null);
      setMilestoneBanner(null);
      setIsInverted(false);
      setBeatenBossOrPb(false);
      setKoReport(report);
      setHoldSubState('armed');
      setPhase('gameover');

      renderStateRef.current.isHolding = false;
      renderStateRef.current.pointerActive = false;
      renderStateRef.current.ghost = null;
      renderStateRef.current.fakeVictoryBluff = false;
      renderStateRef.current.beatenBossOrPb = false;
      renderStateRef.current.koFlash = 1;
      renderStateRef.current.pulseTrigger += 1;
      wasDeadzoneActiveRef.current = false;
      hudTopBarRef.current?.classList.remove('hud-deadzone-flicker');
      hudTimerWrapRef.current?.classList.remove('hud-deadzone-flicker');
      if (gameContainerRef.current) {
        delete gameContainerRef.current.dataset.deadzoneFlicker;
      }
    },
    [bossChallenge, dailyContract, mode, playerData],
  );

  useEffect(() => {
    triggerKnockoutRef.current = triggerKnockout;
  }, [triggerKnockout]);

  // Bind single-source frame ticker for ArenaCanvas
  useEffect(() => {
    renderStateRef.current.onTickFrame = (now: number, dtSec: number) => {
      const state = renderStateRef.current;
      const run = runRef.current;
      const width = window.innerWidth;
      const height = window.innerHeight;
      state.sensors = sensorsRef.current;

      if (!run.active) {
        run.idleTimeMs += dtSec * 1000;
        state.ghost = null;
        state.elapsedMs = 0;
        state.combo = 1;
        stepCoreSimulation(
          state.core,
          dtSec,
          run.idleTimeMs,
          width,
          height,
          mode,
          false,
          null,
          mode === 'daily' ? dailyContract : null,
          sensorsRef.current,
        );
        return;
      }

      if (state.comboPulseTrigger !== lastHandledComboPulseRef.current) {
        lastHandledComboPulseRef.current = state.comboPulseTrigger;
        const container = gameContainerRef.current;
        if (container) {
          const ampPx = Math.min(7.5, 1.8 + Math.max(1, state.combo - 1) * 1.4);
          container.style.setProperty('--combo-shake-amp', `${ampPx.toFixed(1)}px`);
          container.dataset.comboShake = String(state.comboPulseTrigger);
          container.classList.remove('animate-combo-shake');
          void container.offsetWidth;
          container.classList.add('animate-combo-shake');
        }
      }

      const elapsed = now - run.startTime;
      run.elapsedMs = elapsed;
      state.elapsedMs = elapsed;
      state.combo = run.combo;
      const precisionMult = run.precisionHeat >= 0.98 ? 2 : 1;
      run.score += 25 * run.combo * precisionMult * dtSec;

      const pulseCfg = getComboPulseConfig(run.combo, elapsed);
      if (elapsed - run.lastMicroPulseAtMs >= pulseCfg.intervalMs) {
        run.lastMicroPulseAtMs = elapsed;
        state.microPulseStrength = pulseCfg.amplitudeScale;
        state.microPulseTrigger += 1;
        enduranceAudio.playMicroPulse(run.combo);
        if (
          playerData.hapticsEnabled &&
          elapsed - run.lastDistractionVibeAtMs > 180 &&
          typeof navigator !== 'undefined' &&
          navigator.vibrate
        ) {
          try {
            navigator.vibrate(pulseCfg.vibrateDurationMs);
          } catch {
            // Ignore vibrate errors
          }
        }
      }

      if (elapsed - run.lastGhostSampleAtMs >= GHOST_SAMPLE_INTERVAL_MS) {
        run.lastGhostSampleAtMs = elapsed;
        recordedGhostRef.current.push(
          createGhostSample(elapsed, state.core.x, state.core.y, width, height),
        );
      }

      const ghostState = sampleGhostPosition(previousBestPathRef.current, elapsed, width, height);
      state.ghost = ghostState.active ? ghostState : null;
      if (ghostState.finished && !run.ghostPassedAnnounced) {
        run.ghostPassedAnnounced = true;
        state.popupEvent = {
          text: 'PB GHOST PASSED!',
          color: '#00E5A3',
          x: state.core.x,
          y: state.core.y - state.core.radius - 18,
          trigger: ++run.popupCounter,
        };
      }

      // Distraction end check -> reward player with combo & dopamine popup!
      if (run.activeDistraction && elapsed >= run.activeDistraction.endsAtElapsedMs) {
        if (!run.distractionsSurvived.includes(run.activeDistraction.type)) {
          run.distractionsSurvived.push(run.activeDistraction.type);
          setTricksCount(run.distractionsSurvived.length);
        }
        const prevCombo = run.combo;
        run.combo = Math.min(5, run.combo + 1);
        run.maxCombo = Math.max(run.maxCombo, run.combo);
        if (run.combo > prevCombo) {
          state.combo = run.combo;
          state.comboPulseTrigger += 1;
          state.pulseTrigger += 1;
        }
        const trickPts = 120 * run.combo;
        run.score += trickPts;
        enduranceAudio.playDopamineChime(run.combo);
        state.popupEvent = {
          text: `+${trickPts} · x${run.combo}`,
          color: '#00E5A3',
          x: state.core.x,
          y: state.core.y - state.core.radius - 14,
          trigger: ++run.popupCounter,
        };

        if (run.activeDistraction.type === 'CHROMATIC_INVERT') {
          setIsInverted(false);
        }
        run.activeDistraction = null;
        run.frozenDisplayMs = null;
        state.fakeVictoryBluff = false;
        setActiveDistraction(null);
        run.nextDistractionAtMs = elapsed + getNextDistractionDelayMs(elapsed, mode);
      }

      // Distraction trigger check
      if (!run.activeDistraction && elapsed >= run.nextDistractionAtMs) {
        const nextDist = selectNextDistraction(elapsed, mode, run.distractionsSurvived);
        if (nextDist) {
          run.activeDistraction = nextDist;
          run.lastDistraction = nextDist;
          setActiveDistraction(nextDist);
          state.pulseTrigger += 1;

          if (nextDist.type === 'SYNC_SPLIT' || nextDist.type === 'COLOR_MERGE') {
            spawnDistractionClones(state.core, nextDist.type, elapsed);
          } else if (nextDist.type === 'FAKE_FREEZE') {
            run.frozenDisplayMs = elapsed;
          } else if (nextDist.type === 'FAKE_VICTORY_BLUFF') {
            state.fakeVictoryBluff = true;
          } else if (nextDist.type === 'CHROMATIC_INVERT') {
            setIsInverted(true);
          }

          enduranceAudio.playDistractionCue(nextDist.type);

          const def = DISTRACTION_CATALOG.find((d) => d.type === nextDist.type);
          if (
            def?.vibratePattern &&
            playerData.hapticsEnabled &&
            typeof navigator !== 'undefined' &&
            navigator.vibrate
          ) {
            run.lastDistractionVibeAtMs = elapsed;
            try {
              navigator.vibrate(def.vibratePattern);
            } catch {
              // Ignore
            }
          }
        } else {
          run.nextDistractionAtMs = elapsed + 1600;
        }
      }

      // Step moving core, clones, bonus gates, deadzone & sensor gravity
      const stepRes = stepCoreSimulation(
        state.core,
        dtSec,
        elapsed,
        width,
        height,
        mode,
        true,
        run.activeDistraction,
        mode === 'daily' ? dailyContract : null,
        sensorsRef.current,
        Math.random,
        state.pointerX,
        state.pointerY,
      );

      const dz = state.core.deadzone;
      const dzInZone = dz.active && dz.pointerInside;
      if (dzInZone && !wasDeadzoneActiveRef.current) {
        wasDeadzoneActiveRef.current = true;
        enduranceAudio.playDeadzoneTick();
      } else if (!dzInZone && wasDeadzoneActiveRef.current) {
        wasDeadzoneActiveRef.current = false;
      }
      const flickerNow = dzInZone && dz.flickerOn;
      if (hudTopBarRef.current) {
        hudTopBarRef.current.classList.toggle('hud-deadzone-flicker', flickerNow);
      }
      if (hudTimerWrapRef.current) {
        hudTimerWrapRef.current.classList.toggle('hud-deadzone-flicker', flickerNow);
      }
      if (gameContainerRef.current) {
        gameContainerRef.current.dataset.deadzoneFlicker = flickerNow ? '1' : '0';
      }

      if (stepRes.collectedBonusPoints > 0) {
        const prevCombo = run.combo;
        run.combo = Math.min(5, run.combo + 1);
        run.maxCombo = Math.max(run.maxCombo, run.combo);
        if (run.combo > prevCombo) {
          state.combo = run.combo;
          state.comboPulseTrigger += 1;
          state.pulseTrigger += 1;
        }
        run.bonusGatesCollected += 1;
        const pts = stepRes.collectedBonusPoints * run.combo;
        run.score += pts;
        enduranceAudio.playDopamineChime(run.combo);
        state.popupEvent = {
          text: `GATE +${pts} · x${run.combo}`,
          color: '#FFB800',
          x: state.core.x,
          y: state.core.y - state.core.radius - 16,
          trigger: ++run.popupCounter,
        };
        if (playerData.hapticsEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(22);
          } catch {
            // Ignore
          }
        }
      }

      run.peakSpeedPx = Math.max(run.peakSpeedPx, state.core.speedPx);

      // Evaluate pointer tracking against moving core
      const dpr = window.devicePixelRatio || 1;
      const check = evaluatePointerOnCore(state.pointerX, state.pointerY, state.core, dpr);
      run.driftMm = check.outsideMm;
      run.peakDriftMm = Math.max(run.peakDriftMm, check.outsideMm);
      run.driftAngleDeg = check.angleDeg;

      const centerRatio = Math.max(0, 1 - check.distanceFromCenterPx / (state.core.radius * 1.4));
      const instantAccuracy = Math.round(centerRatio * 100);
      run.accuracySamples += 1;
      run.accuracySum += instantAccuracy;
      run.accuracyPct = run.accuracySum / run.accuracySamples;

      // Precision Lock "Sweet Spot" Overdrive (dead-center thumb tracking rewards 2x passive pts)
      if (check.distanceFromCenterPx <= state.core.radius * 0.42) {
        run.precisionHeat = Math.min(1, run.precisionHeat + dtSec * 0.72);
        if (run.precisionHeat >= 0.98 && !run.sweetSpotAnnounced) {
          run.sweetSpotAnnounced = true;
          enduranceAudio.playDopamineChime(run.combo);
          state.popupEvent = {
            text: 'SWEET SPOT x2',
            color: '#FFE082',
            x: state.core.x,
            y: state.core.y - state.core.radius - 16,
            trigger: ++run.popupCounter,
          };
        }
      } else {
        run.precisionHeat = Math.max(0, run.precisionHeat - dtSec * 0.95);
        if (run.precisionHeat < 0.7) {
          run.sweetSpotAnnounced = false;
        }
      }
      state.precisionHeat = run.precisionHeat;

      state.driftNorm = Math.min(1.5, check.outsideMm / SLIP_LIMIT_MM);

      // Clutch Save detector: pushed to rim danger (>0.72) and pulled back clean (<0.32)
      if (state.driftNorm >= 0.72) {
        run.wasDangerEdge = true;
      } else if (run.wasDangerEdge && state.driftNorm <= 0.32 && check.insideTolerance) {
        run.wasDangerEdge = false;
        if (elapsed - run.lastClutchAtMs > 2500) {
          run.lastClutchAtMs = elapsed;
          run.clutchSaves += 1;
          const savePts = 150 * run.combo;
          run.score += savePts;
          enduranceAudio.playClutchSave();
          state.popupEvent = {
            text: `CLUTCH SAVE +${savePts}`,
            color: '#38BDF8',
            x: state.core.x,
            y: state.core.y - state.core.radius - 14,
            trigger: ++run.popupCounter,
          };
        }
      }

      if (!check.insideTolerance) {
        const farExit =
          check.outsideMm > SLIP_LIMIT_MM + 3.2 || check.suggestedKoReason === 'FOLLOWED_CLONE';
        run.outsideGraceMs += dtSec * 1000;
        if (farExit || run.outsideGraceMs >= 85) {
          triggerKnockoutRef.current(check.suggestedKoReason || 'SLIPPED_2MM');
          return;
        }
      } else {
        run.outsideGraceMs = 0;
      }

      // Rank & milestone checks
      const rankNow = getEnduranceRank(elapsed);
      if (rankNow.tier !== run.lastRankTier) {
        run.lastRankTier = rankNow.tier;
        setRankTitle(rankNow.title);
        setRankNextMs(rankNow.nextMs);
      }

      if (!run.survivedOneMin && elapsed >= 60000) {
        run.survivedOneMin = true;
        state.pulseTrigger += 1;
        enduranceAudio.playMilestoneChime();
        setMilestoneBanner('1-Minute Survivor!');
      } else if (!run.beatenPb && playerData.personalBestMs > 0 && elapsed > playerData.personalBestMs) {
        run.beatenPb = true;
        state.beatenBossOrPb = true;
        state.pulseTrigger += 1;
        enduranceAudio.playMilestoneChime();
        setBeatenBossOrPb(true);
        setMilestoneBanner('New Personal Best!');
      } else if (!run.beatenBoss && bossChallenge && elapsed >= bossChallenge.targetMs) {
        run.beatenBoss = true;
        state.beatenBossOrPb = true;
        state.pulseTrigger += 1;
        enduranceAudio.playMilestoneChime();
        setBeatenBossOrPb(true);
        setMilestoneBanner(`Boss ${bossChallenge.challengerName} Defeated!`);
      }

      enduranceAudio.updateTension(elapsed, run.accuracyPct);

      // Update leaf HUD text nodes cleanly (~20Hz; sample-held during deadzone lag illusion)
      if (now - run.lastUiTextAt >= 48) {
        run.lastUiTextAt = now;
        const dzLagging = state.core.deadzone.active && state.core.deadzone.pointerInside;
        const shownMs =
          run.frozenDisplayMs !== null
            ? run.frozenDisplayMs
            : dzLagging
              ? state.core.deadzone.visualElapsedMs
              : elapsed;
        if (timerTextRef.current) {
          timerTextRef.current.textContent = formatDuration(shownMs);
        }
        if (speedHudRef.current) {
          speedHudRef.current.textContent = `${Math.round(state.core.speedPx)}px/s`;
        }
        if (accuracyHudRef.current) {
          accuracyHudRef.current.textContent = `Lock ${Math.round(run.accuracyPct)}%`;
        }
        if (scoreHudRef.current) {
          scoreHudRef.current.textContent = `${Math.round(run.score).toLocaleString()} pts`;
        }
        if (comboHudRef.current) {
          comboHudRef.current.textContent =
            run.precisionHeat >= 0.98 ? `x${run.combo} · 2xLOCK` : `x${run.combo}`;
        }
        if (paceFillRef.current) {
          const goalMs =
            bossChallenge?.targetMs ||
            (playerData.personalBestMs >= 1000 ? playerData.personalBestMs : 60000);
          const pct = Math.min(100, (shownMs / Math.max(1000, goalMs)) * 100);
          paceFillRef.current.style.width = `${pct.toFixed(1)}%`;
        }
      }
    };
  }, [bossChallenge, dailyContract, mode, playerData.hapticsEnabled, playerData.personalBestMs]);

  const beginHoldOnCore = useCallback(
    (
      inputType: 'mouse' | 'touch' | 'pen',
      pointerId: number,
      clientX: number,
      clientY: number,
    ) => {
      if (runRef.current.active || recordsOpen) return;

      const now = performance.now();
      const initialRank = getEnduranceRank(0);
      previousBestPathRef.current =
        playerData.personalBestMs >= 400 && playerData.personalBestPath.length >= 2
          ? playerData.personalBestPath
          : [];
      recordedGhostRef.current = [
        createGhostSample(
          0,
          renderStateRef.current.core.x,
          renderStateRef.current.core.y,
          window.innerWidth,
          window.innerHeight,
        ),
      ];

      runRef.current = {
        active: true,
        startTime: now,
        elapsedMs: 0,
        idleTimeMs: runRef.current.idleTimeMs,
        pointerId,
        inputType,
        score: 0,
        combo: 1,
        maxCombo: 1,
        clutchSaves: 0,
        bonusGatesCollected: 0,
        wasDangerEdge: false,
        lastClutchAtMs: -5000,
        lastGhostSampleAtMs: 0,
        lastMicroPulseAtMs: 0,
        lastDistractionVibeAtMs: -5000,
        ghostPassedAnnounced: false,
        precisionHeat: 0,
        sweetSpotAnnounced: false,
        popupCounter: 0,
        missTapCounter: runRef.current.missTapCounter,
        driftMm: 0,
        peakDriftMm: 0,
        driftAngleDeg: 0,
        peakSpeedPx: 0,
        accuracySamples: 0,
        accuracySum: 0,
        accuracyPct: 100,
        outsideGraceMs: 0,
        distractionsSurvived: [],
        activeDistraction: null,
        lastDistraction: null,
        nextDistractionAtMs: getNextDistractionDelayMs(0, mode),
        frozenDisplayMs: null,
        beatenPb: playerData.personalBestMs <= 0,
        beatenBoss: !bossChallenge,
        survivedOneMin: false,
        lastRankTier: initialRank.tier,
        baseTiltBeta: null,
        baseTiltGamma: null,
        currentTiltDeg: 0,
        peakShakeMag: 0,
        peakGyroSpinDeg: 0,
        lastUiTextAt: 0,
      };

      const state = renderStateRef.current;
      resetCoreForNewRun(state.core, window.innerWidth, window.innerHeight);
      state.isHolding = true;
      state.isArmedOrTitle = false;
      state.pointerActive = true;
      state.pointerX = clientX;
      state.pointerY = clientY;
      state.hoverActive = false;
      state.ghost = null;
      state.combo = 1;
      state.elapsedMs = 0;
      state.precisionHeat = 0;
      state.microPulseStrength = 0.25;
      state.beatenBossOrPb = false;
      state.fakeVictoryBluff = false;
      state.driftNorm = 0;
      state.popupEvent = null;
      state.pulseTrigger += 1;
      if (paceFillRef.current) paceFillRef.current.style.width = '0%';

      if (timerTextRef.current) timerTextRef.current.textContent = '00:00.000';
      if (speedHudRef.current) speedHudRef.current.textContent = '58px/s';
      if (accuracyHudRef.current) accuracyHudRef.current.textContent = 'Lock 100%';
      if (scoreHudRef.current) scoreHudRef.current.textContent = '0 pts';
      if (comboHudRef.current) comboHudRef.current.textContent = 'x1';

      setRankTitle(initialRank.title);
      setRankNextMs(initialRank.nextMs);
      setBeatenBossOrPb(false);
      setIsInverted(false);
      setActiveDistraction(null);
      setTricksCount(0);
      setMilestoneBanner(null);
      setKoReport(null);
      setPhase('playing');
      setHoldSubState('holding');

      enduranceAudio.playEngageClick();
      enduranceAudio.startDrone();
      if (playerData.hapticsEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(25);
        } catch {
          // Ignore
        }
      }
    },
    [
      bossChallenge,
      mode,
      playerData.hapticsEnabled,
      playerData.personalBestMs,
      playerData.personalBestPath,
      recordsOpen,
    ],
  );

  // Android + iPhone Phone Sensors: DeviceOrientation (gravity/tilt) + DeviceMotion (gyroscope + accelerometer)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      if (runRef.current.baseTiltBeta === null) {
        runRef.current.baseTiltBeta = e.beta;
        runRef.current.baseTiltGamma = e.gamma;
      }
      const norm = normalizeOrientationToGravity(
        e.beta,
        e.gamma,
        runRef.current.baseTiltBeta ?? e.beta,
        runRef.current.baseTiltGamma ?? e.gamma,
      );
      sensorsRef.current.active = true;
      sensorsRef.current.source = 'deviceorientation+motion';
      sensorsRef.current.tiltXDeg = norm.tiltXDeg;
      sensorsRef.current.tiltYDeg = norm.tiltYDeg;
      sensorsRef.current.tiltTotalDeg = norm.tiltTotalDeg;
      sensorsRef.current.gravityX = norm.gravityX;
      sensorsRef.current.gravityY = norm.gravityY;

      if (runRef.current.active) {
        runRef.current.currentTiltDeg = norm.tiltTotalDeg;
        if (tiltHudRef.current) {
          tiltHudRef.current.textContent = `Tilt ${Math.round(norm.tiltTotalDeg)}°`;
        }
        if (mode === 'chaos' && norm.tiltTotalDeg > 28 && runRef.current.elapsedMs > 2800) {
          triggerKnockout('TILT_OVERLOAD');
        }
      }
    };

    const onMotion = (e: DeviceMotionEvent) => {
      let shakeMag = 0;
      if (
        e.acceleration &&
        e.acceleration.x !== null &&
        e.acceleration.y !== null &&
        e.acceleration.z !== null
      ) {
        shakeMag = computeShakeMagnitude(
          e.acceleration.x,
          e.acceleration.y,
          e.acceleration.z,
          false,
        );
      } else if (
        e.accelerationIncludingGravity &&
        e.accelerationIncludingGravity.x !== null &&
        e.accelerationIncludingGravity.y !== null &&
        e.accelerationIncludingGravity.z !== null
      ) {
        shakeMag = computeShakeMagnitude(
          e.accelerationIncludingGravity.x,
          e.accelerationIncludingGravity.y,
          e.accelerationIncludingGravity.z,
          true,
        );
      }

      const gyroSpin =
        e.rotationRate &&
        e.rotationRate.alpha !== null &&
        e.rotationRate.beta !== null &&
        e.rotationRate.gamma !== null
          ? computeGyroSpin(e.rotationRate.alpha, e.rotationRate.beta, e.rotationRate.gamma)
          : 0;

      sensorsRef.current.active = true;
      sensorsRef.current.source = 'deviceorientation+motion';
      sensorsRef.current.shakeMag = sensorsRef.current.shakeMag * 0.65 + shakeMag * 0.35;
      sensorsRef.current.gyroSpinDegPerSec =
        sensorsRef.current.gyroSpinDegPerSec * 0.6 + gyroSpin * 0.4;

      if (runRef.current.active) {
        runRef.current.peakShakeMag = Math.max(runRef.current.peakShakeMag, shakeMag);
        runRef.current.peakGyroSpinDeg = Math.max(runRef.current.peakGyroSpinDeg, gyroSpin);

        if (mode === 'chaos' && runRef.current.elapsedMs > 2800) {
          if (shakeMag > 16) {
            triggerKnockout('SHAKE_OVERLOAD');
          } else if (gyroSpin > 260) {
            triggerKnockout('GYRO_SPIN_OUT');
          }
        }
      }
    };

    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('devicemotion', onMotion);
    };
  }, [mode, triggerKnockout]);

  // Window blur / tab switch guard while actively holding
  useEffect(() => {
    const handleBlur = () => {
      if (runRef.current.active) triggerKnockout('WINDOW_BLUR');
    };
    const handleVisibility = () => {
      if (document.hidden && runRef.current.active) triggerKnockout('WINDOW_BLUR');
    };
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [triggerKnockout]);

  // Keyboard shortcuts for Title / Armed navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (recordsOpen) {
        if (e.key === 'Escape') setRecordsOpen(false);
        return;
      }
      if (phase === 'title' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        setPhase('playing');
        setHoldSubState('armed');
      } else if (phase === 'gameover' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        setKoReport(null);
        setBeatenBossOrPb(false);
        setIsInverted(false);
        setPhase('playing');
        setHoldSubState('armed');
        if (timerTextRef.current) timerTextRef.current.textContent = '00:00.000';
      } else if (phase === 'playing' && holdSubState === 'armed' && e.key === 'Escape') {
        e.preventDefault();
        setPhase('title');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [holdSubState, phase, recordsOpen]);

  // Arena Canvas Pointer Handlers (normalized to canvas bounding rect for 1:1 coordinate sync)
  const getCanvasLocalPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDownArena = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (recordsOpen || phase === 'gameover') return;

    if (e.button !== 0 && e.pointerType === 'mouse') {
      if (runRef.current.active) {
        triggerKnockout('CONTEXT_MENU_TRAP');
      }
      return;
    }

    if (runRef.current.active && runRef.current.pointerId !== e.pointerId) {
      triggerKnockout('MULTI_TOUCH_TRAP');
      return;
    }

    const pt = getCanvasLocalPoint(e);
    const core = renderStateRef.current.core;
    const dist = Math.hypot(pt.x - core.x, pt.y - core.y);
    if (dist > core.radius + 18) {
      renderStateRef.current.pulseTrigger += 1;
      renderStateRef.current.missTapEvent = {
        x: pt.x,
        y: pt.y,
        trigger: ++runRef.current.missTapCounter,
      };
      return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors on synthetic inputs
    }

    const inputType =
      e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse';
    beginHoldOnCore(inputType, e.pointerId, pt.x, pt.y);
  };

  const handlePointerMoveArena = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getCanvasLocalPoint(e);
    if (!runRef.current.active) {
      renderStateRef.current.hoverActive = e.pointerType !== 'touch';
      renderStateRef.current.hoverX = pt.x;
      renderStateRef.current.hoverY = pt.y;
      return;
    }
    if (runRef.current.pointerId !== e.pointerId) return;
    renderStateRef.current.pointerX = pt.x;
    renderStateRef.current.pointerY = pt.y;
  };

  const handlePointerLeaveArena = () => {
    renderStateRef.current.hoverActive = false;
  };

  const handlePointerUpArena = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!runRef.current.active) return;
    if (runRef.current.pointerId !== e.pointerId) return;
    triggerKnockout('POINTER_RELEASED');
  };

  const handlePointerCancelArena = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!runRef.current.active) return;
    if (runRef.current.pointerId !== e.pointerId) return;
    triggerKnockout('POINTER_RELEASED');
  };

  const handleContextMenuArena = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (runRef.current.active) {
      triggerKnockout('CONTEXT_MENU_TRAP');
    }
  };

  const handleRequestMotionSensors = async () => {
    const nextState = await requestAllPhoneSensors();
    setMotionStatus(nextState);
  };

  const toggleSound = () => {
    const next = { ...playerData, soundEnabled: !playerData.soundEnabled };
    setPlayerData(next);
    savePlayerData(next);
  };

  const toggleHaptics = () => {
    const next = { ...playerData, hapticsEnabled: !playerData.hapticsEnabled };
    setPlayerData(next);
    savePlayerData(next);
  };

  const updateCallsign = (name: string) => {
    const next = { ...playerData, callsign: name || 'ANCHOR' };
    setPlayerData(next);
    savePlayerData(next);
  };

  const handlePlayAgain = () => {
    setKoReport(null);
    setBeatenBossOrPb(false);
    setIsInverted(false);
    setPhase('playing');
    setHoldSubState('armed');
    if (timerTextRef.current) timerTextRef.current.textContent = '00:00.000';
  };

  const isHolding = phase === 'playing' && holdSubState === 'holding';

  return (
    <div
      ref={gameContainerRef}
      data-testid="game-container"
      onAnimationEnd={(e) => {
        if (e.animationName === 'comboShake') {
          e.currentTarget.classList.remove('animate-combo-shake');
        }
      }}
      className={`relative w-full h-[100dvh] overflow-hidden select-none flex flex-col justify-between ${
        isInverted ? 'text-slate-900' : 'text-[#E8ECF4]'
      }`}
    >
      {/* Full-Viewport Interactive Moving-Core Canvas */}
      <ArenaCanvas
        renderStateRef={renderStateRef}
        onPointerDownArena={handlePointerDownArena}
        onPointerMoveArena={handlePointerMoveArena}
        onPointerUpArena={handlePointerUpArena}
        onPointerCancelArena={handlePointerCancelArena}
        onPointerLeaveArena={handlePointerLeaveArena}
        onContextMenuArena={handleContextMenuArena}
      />

      {/* Non-blocking System Alert Bait Toast (SYSTEM_BAIT_BLUFF distraction) */}
      {isHolding && activeDistraction?.type === 'SYSTEM_BAIT_BLUFF' && (
        <div
          data-testid="system-bait-banner"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-sm rounded-2xl bg-[#1C212E] border border-red-500/50 shadow-2xl px-4 py-3 flex items-center gap-3 pointer-events-none"
        >
          <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
            <BatteryWarning className="w-5 h-5 text-red-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-xs font-bold text-white uppercase tracking-wide">
              Battery Critically Low · 2%
            </div>
            <div className="text-[11px] text-slate-300 truncate">
              Enable Low Power Mode — trap! Don&apos;t lift thumb
            </div>
          </div>
        </div>
      )}

      {/* Top Perimeter HUD Clusters (Pointer pass-through except interactive buttons) */}
      <div
        ref={hudTopBarRef}
        data-testid="playing-hud-top"
        className="relative z-20 w-full px-4 sm:px-6 pt-3.5 flex items-center justify-between gap-2 sm:gap-4 pointer-events-none"
      >
        <div className="pointer-events-auto min-w-0 flex items-center">
          {isHolding ? (
            <div key="hud-holding" className="flex items-center gap-2 sm:gap-3 text-xs font-medium whitespace-nowrap">
              <span ref={speedHudRef} className="font-mono-tabular font-semibold" />
              <span aria-hidden="true" className="opacity-40">
                ·
              </span>
              <span ref={accuracyHudRef} className="font-mono-tabular" />
              <span ref={tiltHudRef} className="font-mono-tabular hidden sm:inline opacity-75" />
            </div>
          ) : (
            <div key="hud-idle" className="flex items-center gap-2 sm:gap-3 text-xs text-slate-400 whitespace-nowrap">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-200">
                <Award className="w-3.5 h-3.5 text-[#FFB800] shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Best</span>
                <span className="font-mono-tabular">{formatDuration(playerData.personalBestMs)}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-slate-200">
                <Flame className="w-3.5 h-3.5 text-[#FF3B1D] shrink-0" aria-hidden="true" />
                <span className="font-mono-tabular">{playerData.streakCount}d</span>
                <span className="hidden sm:inline">streak</span>
              </span>
              {playerData.bestScore > 0 && (
                <>
                  <span aria-hidden="true" className="hidden sm:inline">·</span>
                  <span className="hidden sm:inline font-mono-tabular font-semibold text-[#FFB800]">
                    {playerData.bestScore.toLocaleString()} pts
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
          {isHolding ? (
            <div
              key="tr-holding"
              className="px-3 py-1.5 rounded-lg bg-[#10131A]/90 border border-white/10 text-xs font-mono-tabular font-semibold text-slate-200 flex items-center gap-2"
            >
              <span ref={scoreHudRef} className="text-[#FFB800] font-bold" />
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span ref={comboHudRef} className="text-[#00E5A3] font-bold" />
              <span aria-hidden="true" className="text-slate-600 hidden sm:inline">·</span>
              <span className="hidden sm:inline-flex items-center gap-1 text-slate-300">
                <Zap className="w-3.5 h-3.5 text-[#FFB800]" aria-hidden="true" />
                <span>{tricksCount}</span>
              </span>
            </div>
          ) : (
            <div key="tr-idle" className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={toggleSound}
                aria-label={playerData.soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
                title={playerData.soundEnabled ? 'Sound On' : 'Sound Off'}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#10131A]/90 hover:bg-[#191F2C] border border-white/10 flex items-center justify-center text-slate-200 transition-colors cursor-pointer"
              >
                {playerData.soundEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-500" />
                )}
              </button>

              <button
                type="button"
                onClick={toggleHaptics}
                aria-label={playerData.hapticsEnabled ? 'Disable vibration haptics' : 'Enable vibration haptics'}
                title={playerData.hapticsEnabled ? 'Vibration On' : 'Vibration Off'}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#10131A]/90 hover:bg-[#191F2C] border border-white/10 flex items-center justify-center text-slate-200 transition-colors cursor-pointer"
              >
                <Smartphone
                  className={`w-4 h-4 ${playerData.hapticsEnabled ? 'text-slate-200' : 'text-slate-500'}`}
                />
              </button>

              <button
                type="button"
                onClick={() => setRecordsOpen(true)}
                aria-label="Open records and daily streak"
                className="min-w-[44px] min-h-[44px] px-2.5 sm:px-3.5 rounded-xl bg-[#10131A]/90 hover:bg-[#191F2C] border border-white/10 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Activity className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#FF3B1D] shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Records</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Upper HUD / Title Lockup */}
      <div className="relative z-20 flex-1 flex flex-col items-center justify-start pt-3 sm:pt-5 px-4 pointer-events-none">
        {bossChallenge && phase !== 'gameover' && (
          <div className="mb-2.5 px-3.5 py-1.5 rounded-xl bg-[#10131A]/95 border border-[#FFB800]/35 flex items-center gap-2 text-xs sm:text-sm">
            <span className="font-semibold text-[#FFB800] uppercase tracking-wider">Boss Target</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="font-semibold text-white">{bossChallenge.challengerName}</span>
            <span className="font-mono-tabular font-bold text-[#FFB800]">
              {formatDuration(bossChallenge.targetMs)}
            </span>
          </div>
        )}

        {phase === 'title' && (
          <div className="text-center max-w-md pointer-events-auto">
            <div className="inline-flex items-center justify-center gap-2 mb-1">
              <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="shrink-0">
                <circle cx="14" cy="14" r="12" stroke="#FF3B1D" strokeWidth="2" strokeDasharray="4 3" />
                <circle cx="14" cy="14" r="6" fill="#FF3B1D" />
              </svg>
              <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight uppercase text-white">
                HoldTheLine
              </h1>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 text-balance">
              Drag inside the moving orb. Hit gold rings for x5 combos, fight gravity tilt &amp; survive to 01:00.
            </p>

            {/* Mode Selector */}
            <div
              role="group"
              aria-label="Game mode"
              className="mt-3 inline-flex items-center gap-1 p-1 rounded-xl bg-[#10131A]/95 border border-white/10"
            >
              <button
                type="button"
                onClick={() => setMode('classic')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'classic' ? 'bg-[#FF3B1D] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Classic
              </button>
              <button
                type="button"
                onClick={() => setMode('chaos')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  mode === 'chaos' ? 'bg-[#FF3B1D] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Compass className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Chaos</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('daily')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  mode === 'daily' ? 'bg-[#FF3B1D] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Daily</span>
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={() => {
                  setPhase('playing');
                  setHoldSubState('armed');
                }}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-[#1A202C] hover:bg-[#242C3D] border border-white/12 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Play className="w-3.5 h-3.5 text-[#FF3B1D]" aria-hidden="true" />
                <span>Arm Arena</span>
              </button>

              {motionStatus === 'prompt' && (
                <button
                  type="button"
                  onClick={handleRequestMotionSensors}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#FFB800]/15 hover:bg-[#FFB800]/25 border border-[#FFB800]/40 text-xs font-semibold text-[#FFE082] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Compass className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Enable Gyro &amp; Tilt</span>
                </button>
              )}

              <span className="text-xs text-slate-400">or hold orb directly</span>
            </div>

            <div className="mt-1.5 h-4 text-[11px] font-medium text-slate-400 truncate max-w-[340px] sm:max-w-md mx-auto">
              {mode === 'daily'
                ? `${dailyContract.title} · ${dailyContract.modifierLabel}`
                : mode === 'chaos'
                  ? 'Faster core + gravity pull + tilt/gyro/shake KO locks'
                  : '1-minute gauntlet · Sync clones, RGB tear & +250 bonus rings'}
            </div>
          </div>
        )}

        {phase === 'playing' && (
          <div ref={hudTimerWrapRef} key="playing-timer-wrap" className="text-center pointer-events-none">
            <div
              ref={timerTextRef}
              data-testid="live-timer"
              className={`font-mono-tabular text-4xl sm:text-6xl font-bold tracking-tight min-h-[1.15em] ${
                beatenBossOrPb
                  ? 'text-[#00E5A3]'
                  : isInverted
                    ? 'text-slate-900'
                    : 'text-white'
              }`}
            />

            {isHolding && (
              <div className="mx-auto mt-1 w-44 sm:w-56 h-[2px] rounded-full bg-white/10 overflow-hidden">
                <div
                  ref={paceFillRef}
                  data-testid="live-pace-fill"
                  className={`h-full transition-none ${
                    beatenBossOrPb ? 'bg-[#00E5A3]' : 'bg-[#FFB800]'
                  }`}
                  style={{ width: '0%' }}
                />
              </div>
            )}

            <div className="mt-1.5 min-h-[1.25rem] flex items-center justify-center">
              {activeDistraction ? (
                <span
                  data-testid="distraction-bait"
                  className={`text-xs font-bold uppercase tracking-wider leading-tight ${
                    activeDistraction.type === 'FAKE_VICTORY_BLUFF'
                      ? 'text-[#00E5A3]'
                      : activeDistraction.type === 'CHROMATIC_INVERT'
                        ? 'text-[#FF3B1D]'
                        : activeDistraction.type === 'GRAVITY_SHIFT'
                          ? 'text-[#38BDF8]'
                          : activeDistraction.type === 'DEADZONE_LAG'
                            ? 'text-[#C4B5FD]'
                            : 'text-[#FFB800]'
                  }`}
                >
                  {activeDistraction.baitHeadline} · {activeDistraction.baitSubtext}
                </span>
              ) : milestoneBanner ? (
                <span className="text-xs font-bold uppercase tracking-wider text-[#00E5A3]">
                  {milestoneBanner}
                </span>
              ) : holdSubState === 'armed' ? (
                <span className="text-xs font-medium text-slate-300">
                  Press &amp; hold directly on the moving orb to start
                </span>
              ) : (
                <span className="text-xs font-medium text-slate-400">
                  {rankTitle} ·{' '}
                  {bossChallenge
                    ? `Boss ${formatDuration(bossChallenge.targetMs)}`
                    : mode === 'daily'
                      ? `Contract ${formatDuration(dailyContract.targetMs)}`
                      : rankNextMs
                        ? `Next rank at ${formatDuration(rankNextMs)}`
                        : 'Apex endurance'}
                </span>
              )}
            </div>

            {holdSubState === 'armed' && (
              <button
                type="button"
                onClick={() => setPhase('title')}
                className="mt-2 pointer-events-auto text-xs text-slate-400 hover:text-white underline underline-offset-4 py-1 cursor-pointer"
              >
                Back to Mode Select
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Safe Margin Hint */}
      <div className="relative z-20 pb-3 px-4 text-center pointer-events-none">
        {phase !== 'gameover' && (
          <p className="text-xs text-slate-500">
            {isHolding
              ? 'Drag with the true orb · Collect gold rings · Counter gravity drift'
              : 'Touch & drag the moving circle · Stay inside its rim · Reach 01:00.000'}
          </p>
        )}
      </div>

      {/* Knock-Out Autopsy Modal */}
      {phase === 'gameover' && koReport && (
        <KnockoutModal
          report={koReport}
          callsign={playerData.callsign}
          bossChallenge={bossChallenge}
          onPlayAgain={handlePlayAgain}
          onBackToTitle={() => {
            setKoReport(null);
            setPhase('title');
            setHoldSubState('armed');
          }}
          onOpenRecords={() => setRecordsOpen(true)}
        />
      )}

      {/* Records & Daily Streak Modal */}
      {recordsOpen && (
        <RecordsModal
          data={playerData}
          onClose={() => setRecordsOpen(false)}
          onUpdateCallsign={updateCallsign}
          onRequestMotionSensors={handleRequestMotionSensors}
          motionStatus={motionStatus}
        />
      )}
    </div>
  );
}
