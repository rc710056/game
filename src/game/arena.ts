import {
  BASE_CORE_RADIUS_PX,
  MIN_CORE_RADIUS_PX,
  mmToPx,
  pxToMm,
  SLIP_LIMIT_MM,
} from './engine';
import { computeGravityForceOnCore } from './sensors';
import type {
  DailyContract,
  DistractionEvent,
  DistractionType,
  GameMode,
  KnockoutReason,
  MotionPattern,
  PhoneSensorSnapshot,
} from './types';

export interface CloneOrb {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: string;
  alpha: number;
  phase: 'sync' | 'orbit' | 'split' | 'merge';
  angleOffset: number;
  lifeMs: number;
  maxLifeMs: number;
}

export interface BonusGate {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  lifeMs: number;
  maxLifeMs: number;
  points: number;
}

export interface Afterimage {
  x: number;
  y: number;
  alpha: number;
  dx: number;
}

export interface ArenaBounds {
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface DeadzoneState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  pointerInside: boolean;
  flickerOn: boolean;
  lagHoldMs: number;
  sampleIntervalMs: number;
  visualCoreX: number;
  visualCoreY: number;
  visualElapsedMs: number;
  visualSampleCount: number;
}

export interface CoreState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speedPx: number;
  pattern: MotionPattern;
  hue: string;
  targetAngle: number;
  patternSwitchAtMs: number;
  dashWindupMs: number;
  waypointX: number;
  waypointY: number;
  clones: CloneOrb[];
  nextCloneId: number;
  ambushCooldownMs: number;
  bonusGate: BonusGate | null;
  nextBonusGateAtMs: number;
  afterimages: Afterimage[];
  blinkAlpha: number;
  blurPx: number;
  invertActive: boolean;
  rgbTearActive: boolean;
  gravityInverted: boolean;
  quakeOffsetX: number;
  quakeOffsetY: number;
  deadzone: DeadzoneState;
}

const SIMILAR_HUES = ['#FF4D2E', '#FF6A2B', '#FF2E54', '#FF851B', '#E11D48'];

export function computeArenaBounds(width: number, height: number, radius: number): ArenaBounds {
  const padX = radius + 14;
  const topSafe = Math.max(66, Math.min(92, height * 0.1));
  const bottomSafe = Math.max(24, Math.min(38, height * 0.04));
  return {
    width,
    height,
    minX: padX,
    maxX: Math.max(padX + 20, width - padX),
    minY: topSafe + radius,
    maxY: Math.max(topSafe + radius + 20, height - bottomSafe - radius),
  };
}

export function computeIdleShowcaseBounds(
  width: number,
  height: number,
  radius: number,
): ArenaBounds {
  const full = computeArenaBounds(width, height, radius);
  const centerX = width * 0.5;
  const maxHalfX = Math.min((full.maxX - full.minX) * 0.38, 170);
  const minY = Math.min(full.maxY - 24, Math.max(height * 0.56, 310) + radius * 0.35);
  const maxY = Math.max(minY + 18, full.maxY - 12);
  return {
    width,
    height,
    minX: Math.max(full.minX, centerX - maxHalfX),
    maxX: Math.min(full.maxX, centerX + maxHalfX),
    minY,
    maxY,
  };
}

export function createEmptyDeadzoneState(x: number, y: number, radius = BASE_CORE_RADIUS_PX): DeadzoneState {
  return {
    active: false,
    x,
    y,
    radius: radius * 2.35,
    pointerInside: false,
    flickerOn: false,
    lagHoldMs: 0,
    sampleIntervalMs: 115,
    visualCoreX: x,
    visualCoreY: y,
    visualElapsedMs: 0,
    visualSampleCount: 0,
  };
}

export function createInitialCoreState(width: number, height: number): CoreState {
  const showcase = computeIdleShowcaseBounds(width, height, BASE_CORE_RADIUS_PX);
  const cx = (showcase.minX + showcase.maxX) * 0.5;
  const cy = (showcase.minY + showcase.maxY) * 0.5;
  const bounds = computeArenaBounds(width, height, BASE_CORE_RADIUS_PX);
  return {
    x: cx,
    y: cy,
    vx: 26,
    vy: 14,
    radius: BASE_CORE_RADIUS_PX,
    speedPx: 30,
    pattern: 'GLIDE',
    hue: '#FF3B1D',
    targetAngle: 0.45,
    patternSwitchAtMs: 6500,
    dashWindupMs: 0,
    waypointX: bounds.maxX - 10,
    waypointY: bounds.minY + 20,
    clones: [],
    nextCloneId: 1,
    ambushCooldownMs: 9000,
    bonusGate: null,
    nextBonusGateAtMs: 4200,
    afterimages: [],
    blinkAlpha: 0,
    blurPx: 0,
    invertActive: false,
    rgbTearActive: false,
    gravityInverted: false,
    quakeOffsetX: 0,
    quakeOffsetY: 0,
    deadzone: createEmptyDeadzoneState(cx, cy, BASE_CORE_RADIUS_PX),
  };
}

export function resetCoreForNewRun(
  core: CoreState,
  width: number,
  height: number,
  rng: () => number = Math.random,
): void {
  const bounds = computeArenaBounds(width, height, BASE_CORE_RADIUS_PX);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;
  const halfSpanX = Math.max(40, (bounds.maxX - bounds.minX) * 0.5);
  const halfSpanY = Math.max(40, (bounds.maxY - bounds.minY) * 0.5);

  core.x = Math.max(bounds.minX, Math.min(bounds.maxX, core.x));
  core.y = Math.max(bounds.minY, Math.min(bounds.maxY, core.y));
  core.radius = BASE_CORE_RADIUS_PX;
  core.pattern = 'GLIDE';
  core.hue = '#FF3B1D';
  core.patternSwitchAtMs = 6500;
  core.dashWindupMs = 0;

  const goRight = core.x < centerX;
  const goDown = core.y < centerY;
  core.waypointX = Math.max(
    bounds.minX,
    Math.min(bounds.maxX, centerX + (goRight ? 1 : -1) * (0.65 + rng() * 0.3) * halfSpanX),
  );
  core.waypointY = Math.max(
    bounds.minY,
    Math.min(bounds.maxY, centerY + (goDown ? 1 : -1) * (0.65 + rng() * 0.3) * halfSpanY),
  );
  core.targetAngle = Math.atan2(core.waypointY - core.y, core.waypointX - core.x);
  core.vx = Math.cos(core.targetAngle) * 44;
  core.vy = Math.sin(core.targetAngle) * 44;
  core.speedPx = Math.hypot(core.vx, core.vy);

  core.clones = [];
  core.ambushCooldownMs = 9000;
  core.bonusGate = null;
  core.nextBonusGateAtMs = 4200;
  core.afterimages = [];
  core.blinkAlpha = 0;
  core.blurPx = 0;
  core.invertActive = false;
  core.rgbTearActive = false;
  core.gravityInverted = false;
  core.quakeOffsetX = 0;
  core.quakeOffsetY = 0;
  core.deadzone = createEmptyDeadzoneState(core.x, core.y, BASE_CORE_RADIUS_PX);
}

export function isPeriodicDeadzoneActive(elapsedMs: number, mode: GameMode): boolean {
  const startAtMs = mode === 'chaos' ? 4500 : 5800;
  if (elapsedMs < startAtMs) return false;
  const cycleMs = mode === 'chaos' ? 7600 : 9000;
  const activeMs = mode === 'chaos' ? 3500 : 3200;
  const phase = (elapsedMs - startAtMs) % cycleMs;
  return phase < activeMs;
}

export function stepDeadzoneState(
  core: CoreState,
  dtSec: number,
  elapsedMs: number,
  mode: GameMode,
  isHolding: boolean,
  activeDistraction: DistractionEvent | null,
  pointerX = core.x,
  pointerY = core.y,
): void {
  const dz = core.deadzone;
  if (!isHolding) {
    dz.active = false;
    dz.x = core.x;
    dz.y = core.y;
    dz.radius = core.radius * 2.35;
    dz.pointerInside = false;
    dz.flickerOn = false;
    dz.lagHoldMs = 0;
    dz.visualCoreX = core.x;
    dz.visualCoreY = core.y;
    dz.visualElapsedMs = elapsedMs;
    return;
  }

  const distractionForced = activeDistraction?.type === 'DEADZONE_LAG';
  const active = distractionForced || isPeriodicDeadzoneActive(elapsedMs, mode);
  if (!active) {
    dz.active = false;
    dz.x = core.x;
    dz.y = core.y;
    dz.radius = core.radius * 2.35;
    dz.pointerInside = false;
    dz.flickerOn = false;
    dz.lagHoldMs = 0;
    dz.visualCoreX = core.x;
    dz.visualCoreY = core.y;
    dz.visualElapsedMs = elapsedMs;
    return;
  }

  const wasActive = dz.active;
  dz.active = true;
  const t = elapsedMs / 1000;
  const driftOrbit = core.radius * 0.48;
  dz.x = core.x + Math.cos(t * 1.45) * driftOrbit;
  dz.y = core.y + Math.sin(t * 1.15) * driftOrbit;
  dz.radius = core.radius * (2.35 + Math.sin(t * 2.4) * 0.28);
  dz.sampleIntervalMs = mode === 'chaos' || distractionForced ? 132 : 112;

  const distPointer = Math.hypot(pointerX - dz.x, pointerY - dz.y);
  dz.pointerInside = distPointer <= dz.radius;

  if (!wasActive) {
    dz.lagHoldMs = 0;
    dz.visualCoreX = core.x;
    dz.visualCoreY = core.y;
    dz.visualElapsedMs = elapsedMs;
    dz.visualSampleCount += 1;
  }

  if (dz.pointerInside || distractionForced) {
    dz.lagHoldMs += dtSec * 1000;
    if (dz.lagHoldMs >= dz.sampleIntervalMs) {
      dz.lagHoldMs %= dz.sampleIntervalMs;
      dz.visualCoreX = core.x;
      dz.visualCoreY = core.y;
      dz.visualElapsedMs = elapsedMs;
      dz.visualSampleCount += 1;
    }
    const flickerPhase = elapsedMs % 240;
    dz.flickerOn = flickerPhase < 82 || dz.lagHoldMs < 32;
  } else {
    dz.lagHoldMs = 0;
    dz.flickerOn = false;
    dz.visualCoreX = core.x;
    dz.visualCoreY = core.y;
    dz.visualElapsedMs = elapsedMs;
  }
}

export function getCoreRadiusForElapsed(
  elapsedMs: number,
  mode: GameMode,
  dailyContract?: DailyContract | null,
): number {
  const sec = elapsedMs / 1000;
  let shrinkRate = 0.22;
  if (mode === 'chaos') shrinkRate = 0.36;
  if (mode === 'daily' && dailyContract?.modifierCode === 'SHRINKING_CORE') shrinkRate = 0.4;
  const r = BASE_CORE_RADIUS_PX - sec * shrinkRate;
  return Math.max(MIN_CORE_RADIUS_PX, Math.round(r));
}

export function getTargetSpeedForElapsed(elapsedMs: number, mode: GameMode): number {
  const sec = elapsedMs / 1000;
  const modeMult = mode === 'chaos' ? 1.24 : mode === 'daily' ? 1.12 : 1.0;
  const base = 58 + Math.min(185, sec * 2.95);
  return Math.round(base * modeMult);
}

export function selectMotionPattern(elapsedMs: number, rng: () => number = Math.random): MotionPattern {
  const sec = elapsedMs / 1000;
  if (sec < 7) return 'GLIDE';
  if (sec < 18) return rng() < 0.55 ? 'LISSAJOUS' : 'ORBIT_WHIP';
  if (sec < 34) {
    const pick = rng();
    if (pick < 0.35) return 'ORBIT_WHIP';
    if (pick < 0.7) return 'SWARM_WEAVE';
    return 'LISSAJOUS';
  }
  const pick = rng();
  if (pick < 0.36) return 'DASH_CUT';
  if (pick < 0.7) return 'SWARM_WEAVE';
  return 'ORBIT_WHIP';
}

export function spawnDistractionClones(
  core: CoreState,
  type: DistractionType,
  elapsedMs: number,
  rng: () => number = Math.random,
): void {
  const count = type === 'SYNC_SPLIT' ? (elapsedMs > 30000 ? 5 : 3) : 4;
  const baseHueIdx = Math.floor(rng() * SIMILAR_HUES.length);

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng() * 0.25;
    core.clones.push({
      id: core.nextCloneId++,
      x: core.x,
      y: core.y,
      vx: core.vx,
      vy: core.vy,
      radius: core.radius,
      hue:
        type === 'SYNC_SPLIT'
          ? SIMILAR_HUES[(baseHueIdx + i) % SIMILAR_HUES.length]
          : ['#FFB800', '#FF2E54', '#FF5733', '#FF851B'][i % 4],
      alpha: 0.92,
      phase: type === 'SYNC_SPLIT' ? 'sync' : 'merge',
      angleOffset: angle,
      lifeMs: 0,
      maxLifeMs: type === 'SYNC_SPLIT' ? 3900 : 4200,
    });
  }
}

export interface StepResult {
  collectedBonusPoints: number;
}

export function stepCoreSimulation(
  core: CoreState,
  dtSec: number,
  elapsedMs: number,
  width: number,
  height: number,
  mode: GameMode,
  isHolding: boolean,
  activeDistraction: DistractionEvent | null,
  dailyContract?: DailyContract | null,
  sensors?: PhoneSensorSnapshot | null,
  rng: () => number = Math.random,
  pointerX?: number,
  pointerY?: number,
): StepResult {
  const dt = Math.min(0.05, Math.max(0.001, dtSec));
  const bounds = computeArenaBounds(width, height, core.radius);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const halfSpanX = Math.max(40, (bounds.maxX - bounds.minX) * 0.5);
  const halfSpanY = Math.max(40, (bounds.maxY - bounds.minY) * 0.5);

  if (!isHolding) {
    const showcase = computeIdleShowcaseBounds(width, height, BASE_CORE_RADIUS_PX);
    const sCenterX = (showcase.minX + showcase.maxX) * 0.5;
    const sCenterY = (showcase.minY + showcase.maxY) * 0.5;
    const sHalfX = Math.max(18, (showcase.maxX - showcase.minX) * 0.5);
    const sHalfY = Math.max(12, (showcase.maxY - showcase.minY) * 0.5);
    const t = elapsedMs * 0.00072;
    const targetX = sCenterX + Math.sin(t * 0.95) * sHalfX * 0.78;
    const targetY = sCenterY + Math.sin(t * 1.42) * sHalfY * 0.65;
    const nextX = core.x + (targetX - core.x) * Math.min(1, dt * 2.6);
    const nextY = core.y + (targetY - core.y) * Math.min(1, dt * 2.6);
    core.vx = (nextX - core.x) / dt;
    core.vy = (nextY - core.y) / dt;
    core.x = nextX;
    core.y = nextY;
    core.radius = BASE_CORE_RADIUS_PX;
    core.speedPx = Math.hypot(core.vx, core.vy);
    core.blinkAlpha = 0;
    core.blurPx = 0;
    core.invertActive = false;
    core.rgbTearActive = false;
    core.gravityInverted = false;
    core.quakeOffsetX = 0;
    core.quakeOffsetY = 0;
    core.clones = [];
    core.bonusGate = null;
    core.afterimages = [];
    stepDeadzoneState(core, dt, elapsedMs, mode, false, null, core.x, core.y);
    return { collectedBonusPoints: 0 };
  }

  core.radius = getCoreRadiusForElapsed(elapsedMs, mode, dailyContract);
  const targetSpeed = getTargetSpeedForElapsed(elapsedMs, mode);

  const pickFarWaypoint = () => {
    const goRight = core.x < centerX ? 1 : 0;
    const goDown = core.y < centerY ? 1 : 0;
    const tx = goRight
      ? centerX + (0.62 + rng() * 0.36) * halfSpanX
      : centerX - (0.62 + rng() * 0.36) * halfSpanX;
    const ty = goDown
      ? centerY + (0.62 + rng() * 0.36) * halfSpanY
      : centerY - (0.62 + rng() * 0.36) * halfSpanY;
    core.waypointX = Math.max(bounds.minX, Math.min(bounds.maxX, tx));
    core.waypointY = Math.max(bounds.minY, Math.min(bounds.maxY, ty));
  };

  core.waypointX = Math.max(bounds.minX, Math.min(bounds.maxX, core.waypointX));
  core.waypointY = Math.max(bounds.minY, Math.min(bounds.maxY, core.waypointY));
  if (Math.hypot(core.waypointX - core.x, core.waypointY - core.y) < 38) {
    pickFarWaypoint();
  }

  if (elapsedMs >= core.patternSwitchAtMs) {
    core.pattern = selectMotionPattern(elapsedMs, rng);
    core.patternSwitchAtMs = elapsedMs + 4200 + rng() * 3200;
    if (Math.hypot(core.waypointX - core.x, core.waypointY - core.y) < 95) {
      pickFarWaypoint();
    }
    if (core.pattern === 'DASH_CUT') {
      core.dashWindupMs = 360;
      core.targetAngle = Math.atan2(core.waypointY - core.y, core.waypointX - core.x);
    }
  }

  const t = elapsedMs / 1000;
  const wpDx = core.waypointX - core.x;
  const wpDy = core.waypointY - core.y;
  const wpDist = Math.max(1, Math.hypot(wpDx, wpDy));
  const wpAngle = Math.atan2(wpDy, wpDx);
  let desiredVx = core.vx;
  let desiredVy = core.vy;

  if (core.pattern === 'GLIDE') {
    const curve = Math.sin(t * 1.45) * 0.28;
    desiredVx = Math.cos(wpAngle + curve) * targetSpeed;
    desiredVy = Math.sin(wpAngle + curve) * targetSpeed;
  } else if (core.pattern === 'LISSAJOUS') {
    const curve = Math.sin(t * 2.2) * 0.45;
    desiredVx = Math.cos(wpAngle + curve) * targetSpeed;
    desiredVy = Math.sin(wpAngle + curve) * targetSpeed;
  } else if (core.pattern === 'ORBIT_WHIP') {
    core.targetAngle += dt * (2.5 + Math.min(1.6, t * 0.03));
    const travelVx = (wpDx / wpDist) * targetSpeed * 0.78;
    const travelVy = (wpDy / wpDist) * targetSpeed * 0.78;
    const whipVx = Math.cos(core.targetAngle) * targetSpeed * 0.48;
    const whipVy = Math.sin(core.targetAngle * 1.15) * targetSpeed * 0.48;
    desiredVx = travelVx + whipVx;
    desiredVy = travelVy + whipVy;
  } else if (core.pattern === 'SWARM_WEAVE') {
    const wave = Math.sin(t * 4.2) * 0.65;
    desiredVx = Math.cos(wpAngle + wave) * targetSpeed;
    desiredVy = Math.sin(wpAngle + wave) * targetSpeed;
  } else if (core.pattern === 'DASH_CUT') {
    if (core.dashWindupMs > 0) {
      core.dashWindupMs -= dt * 1000;
      desiredVx = core.vx * 0.92;
      desiredVy = core.vy * 0.92;
      if (core.dashWindupMs <= 0) {
        pickFarWaypoint();
        core.targetAngle = Math.atan2(core.waypointY - core.y, core.waypointX - core.x);
      }
    } else {
      desiredVx = Math.cos(core.targetAngle) * targetSpeed * 1.2;
      desiredVy = Math.sin(core.targetAngle) * targetSpeed * 1.2;
      if (rng() < dt * 0.95) {
        core.dashWindupMs = 340;
      }
    }
  }

  // Apply real phone Gravity/Tilt & Gyroscope spin forces when sensors are active!
  core.gravityInverted = activeDistraction?.type === 'GRAVITY_SHIFT';
  if (sensors?.active) {
    const gForce = computeGravityForceOnCore(
      sensors.gravityX,
      sensors.gravityY,
      core.gravityInverted,
      mode,
    );
    desiredVx += gForce.fx * 0.65;
    desiredVy += gForce.fy * 0.65;

    // Gyroscope wrist twist curves velocity vector subtly
    if (sensors.gyroSpinDegPerSec > 25) {
      const twist = Math.min(1.4, (sensors.gyroSpinDegPerSec - 25) * 0.008);
      const oldVx = desiredVx;
      desiredVx = desiredVx * Math.cos(twist * dt * 3) - desiredVy * Math.sin(twist * dt * 3);
      desiredVy = oldVx * Math.sin(twist * dt * 3) + desiredVy * Math.cos(twist * dt * 3);
    }
  } else if (core.gravityInverted) {
    // Even without mobile tilt, GRAVITY_SHIFT adds a sudden diagonal drift tug
    desiredVx += Math.sin(t * 2.5) * 95;
    desiredVy -= 85;
  }

  const blend = Math.min(1, dt * 6.5);
  core.vx += (desiredVx - core.vx) * blend;
  core.vy += (desiredVy - core.vy) * blend;
  core.x += core.vx * dt;
  core.y += core.vy * dt;

  // Soft bounce inside safe playfield bounds
  if (core.x < bounds.minX) {
    core.x = bounds.minX;
    core.vx = Math.abs(core.vx);
    core.targetAngle = Math.atan2(core.vy, core.vx);
  } else if (core.x > bounds.maxX) {
    core.x = bounds.maxX;
    core.vx = -Math.abs(core.vx);
    core.targetAngle = Math.atan2(core.vy, core.vx);
  }
  if (core.y < bounds.minY) {
    core.y = bounds.minY;
    core.vy = Math.abs(core.vy);
    core.targetAngle = Math.atan2(core.vy, core.vx);
  } else if (core.y > bounds.maxY) {
    core.y = bounds.maxY;
    core.vy = -Math.abs(core.vy);
    core.targetAngle = Math.atan2(core.vy, core.vx);
  }

  core.speedPx = Math.hypot(core.vx, core.vy);

  // Dopamine Bonus Gate Ring spawning & collection
  let collectedBonusPoints = 0;
  if (!core.bonusGate && elapsedMs >= core.nextBonusGateAtMs) {
    const gx = bounds.minX + rng() * (bounds.maxX - bounds.minX);
    const gy = bounds.minY + rng() * (bounds.maxY - bounds.minY);
    core.bonusGate = {
      active: true,
      x: gx,
      y: gy,
      radius: 34,
      lifeMs: 0,
      maxLifeMs: 6500,
      points: 250,
    };
  } else if (core.bonusGate) {
    core.bonusGate.lifeMs += dt * 1000;
    const distGate = Math.hypot(core.x - core.bonusGate.x, core.y - core.bonusGate.y);
    if (distGate <= core.radius + core.bonusGate.radius * 0.72) {
      collectedBonusPoints = core.bonusGate.points;
      core.bonusGate = null;
      core.nextBonusGateAtMs = elapsedMs + 5500 + rng() * 3500;
    } else if (core.bonusGate.lifeMs >= core.bonusGate.maxLifeMs) {
      core.bonusGate = null;
      core.nextBonusGateAtMs = elapsedMs + 4000 + rng() * 3000;
    }
  }

  // Ambient ambush clones
  if (elapsedMs > 14000 && core.clones.length < 2) {
    core.ambushCooldownMs -= dt * 1000;
    if (core.ambushCooldownMs <= 0) {
      core.ambushCooldownMs = Math.max(2200, 5200 - t * 40);
      const a = rng() * Math.PI * 2;
      core.clones.push({
        id: core.nextCloneId++,
        x: core.x,
        y: core.y,
        vx: Math.cos(a) * (135 + rng() * 65),
        vy: Math.sin(a) * (135 + rng() * 65),
        radius: core.radius,
        hue: SIMILAR_HUES[Math.floor(rng() * SIMILAR_HUES.length)],
        alpha: 0.88,
        phase: 'split',
        angleOffset: a,
        lifeMs: 0,
        maxLifeMs: 2600,
      });
    }
  }

  // Update clones with smooth zero-jump orbital bloom and momentum-synced split
  const nextClones: CloneOrb[] = [];
  for (let i = 0; i < core.clones.length; i++) {
    const c = core.clones[i];
    c.lifeMs += dt * 1000;
    if (c.lifeMs >= c.maxLifeMs) continue;

    const prevX = c.x;
    const prevY = c.y;

    if (c.phase === 'sync') {
      const syncDur = 1150;
      if (c.lifeMs < syncDur) {
        const u = c.lifeMs / syncDur;
        const orbitDist = Math.sin(u * Math.PI) * (core.radius * 0.92);
        const spin = c.angleOffset + c.lifeMs * 0.0068;
        c.x = core.x + Math.cos(spin) * orbitDist;
        c.y = core.y + Math.sin(spin) * orbitDist;
        c.vx = (c.x - prevX) / dt;
        c.vy = (c.y - prevY) / dt;
        c.radius = core.radius;
      } else {
        c.phase = 'split';
        const splitAngle = c.angleOffset + syncDur * 0.0068 + (rng() - 0.5) * 0.22;
        const splitSpeed = 165 + Math.min(110, t * 2.1);
        c.vx = core.vx * 0.45 + Math.cos(splitAngle) * splitSpeed;
        c.vy = core.vy * 0.45 + Math.sin(splitAngle) * splitSpeed;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
      }
    } else if (c.phase === 'merge') {
      const mergeDur = 1750;
      if (c.lifeMs < mergeDur) {
        const u = c.lifeMs / mergeDur;
        const spin = c.angleOffset + c.lifeMs * 0.0058;
        const dist = Math.sin(u * Math.PI) * (core.radius * 1.72);
        c.x = core.x + Math.cos(spin) * dist;
        c.y = core.y + Math.sin(spin) * dist;
        c.vx = (c.x - prevX) / dt;
        c.vy = (c.y - prevY) / dt;
        c.radius = core.radius;
      } else {
        c.phase = 'split';
        const burstAngle = c.angleOffset + mergeDur * 0.0058 + Math.PI * 0.35;
        c.vx = core.vx * 0.45 + Math.cos(burstAngle) * 185;
        c.vy = core.vy * 0.45 + Math.sin(burstAngle) * 185;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
      }
    } else {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.x < bounds.minX) {
        c.x = bounds.minX;
        c.vx = Math.abs(c.vx);
      } else if (c.x > bounds.maxX) {
        c.x = bounds.maxX;
        c.vx = -Math.abs(c.vx);
      }
      if (c.y < bounds.minY) {
        c.y = bounds.minY;
        c.vy = Math.abs(c.vy);
      } else if (c.y > bounds.maxY) {
        c.y = bounds.maxY;
        c.vy = -Math.abs(c.vy);
      }
    }

    const fadeIn = Math.min(1, c.lifeMs / 200);
    const fadeTail = c.maxLifeMs - c.lifeMs;
    const fadeOut = fadeTail < 450 ? Math.max(0, fadeTail / 450) : 1;
    c.alpha = 0.88 * Math.min(fadeIn, fadeOut);
    nextClones.push(c);
  }
  core.clones = nextClones;

  // RGB Ghost Tear afterimage trail
  core.rgbTearActive = activeDistraction?.type === 'RGB_TEAR';
  if (core.rgbTearActive) {
    core.afterimages.unshift({
      x: core.x,
      y: core.y,
      alpha: 0.7,
      dx: (rng() - 0.5) * 18,
    });
    if (core.afterimages.length > 6) core.afterimages.pop();
  } else if (core.afterimages.length > 0) {
    core.afterimages = [];
  }

  // Blink strobe
  if (activeDistraction?.type === 'BLINK_STROBE') {
    const localMs = elapsedMs - activeDistraction.startedAtElapsedMs;
    const cycle = localMs % 640;
    core.blinkAlpha = cycle < 250 ? 0.93 : 0.06;
  } else {
    core.blinkAlpha = Math.max(0, core.blinkAlpha - dt * 5);
  }

  // Blur wave
  if (activeDistraction?.type === 'OPTIC_BLUR') {
    const localMs = elapsedMs - activeDistraction.startedAtElapsedMs;
    core.blurPx = 3.2 + Math.sin(localMs * 0.009) * 2.4;
  } else {
    core.blurPx = Math.max(0, core.blurPx - dt * 12);
  }

  core.invertActive = activeDistraction?.type === 'CHROMATIC_INVERT';

  // Quake from distraction or physical phone shake
  const sensorShake = sensors?.active && sensors.shakeMag > 3.5 ? Math.min(8, sensors.shakeMag) : 0;
  if (activeDistraction?.type === 'HAPTIC_QUAKE' || sensorShake > 0) {
    const amp = activeDistraction?.type === 'HAPTIC_QUAKE' ? 9 : sensorShake;
    core.quakeOffsetX = (rng() - 0.5) * amp;
    core.quakeOffsetY = (rng() - 0.5) * amp;
  } else {
    core.quakeOffsetX = 0;
    core.quakeOffsetY = 0;
  }

  if (activeDistraction?.type === 'COLOR_MERGE') {
    const cycle = Math.floor((elapsedMs - activeDistraction.startedAtElapsedMs) / 280) % 3;
    core.hue = ['#FF3B1D', '#FF6A2B', '#FF2E54'][cycle];
  } else {
    core.hue = '#FF3B1D';
  }

  stepDeadzoneState(
    core,
    dt,
    elapsedMs,
    mode,
    true,
    activeDistraction,
    pointerX ?? core.x,
    pointerY ?? core.y,
  );

  return { collectedBonusPoints };
}

export interface TrackingCheckResult {
  insideTolerance: boolean;
  outsideMm: number;
  distanceFromCenterPx: number;
  angleDeg: number;
  suggestedKoReason: KnockoutReason | null;
}

export function evaluatePointerOnCore(
  pointerX: number,
  pointerY: number,
  core: CoreState,
  dpr = 1,
): TrackingCheckResult {
  const dx = pointerX - core.x;
  const dy = pointerY - core.y;
  const dist = Math.hypot(dx, dy);
  const tolerancePx = core.radius + mmToPx(SLIP_LIMIT_MM, dpr);
  const outsidePx = Math.max(0, dist - core.radius);
  const outsideMm = pxToMm(outsidePx, dpr);
  const angleDeg = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360);

  if (dist <= tolerancePx) {
    return {
      insideTolerance: true,
      outsideMm,
      distanceFromCenterPx: dist,
      angleDeg,
      suggestedKoReason: null,
    };
  }

  for (let i = 0; i < core.clones.length; i++) {
    const clone = core.clones[i];
    if (clone.phase === 'split' && Math.hypot(pointerX - clone.x, pointerY - clone.y) <= clone.radius + 14) {
      return {
        insideTolerance: false,
        outsideMm,
        distanceFromCenterPx: dist,
        angleDeg,
        suggestedKoReason: 'FOLLOWED_CLONE',
      };
    }
  }

  const speed = Math.hypot(core.vx, core.vy);
  if (speed > 105) {
    const dot = (dx * core.vx + dy * core.vy) / (Math.max(1, dist) * speed);
    if (dot < -0.35) {
      return {
        insideTolerance: false,
        outsideMm,
        distanceFromCenterPx: dist,
        angleDeg,
        suggestedKoReason: 'FELL_BEHIND_CORE',
      };
    }
  }

  return {
    insideTolerance: false,
    outsideMm,
    distanceFromCenterPx: dist,
    angleDeg,
    suggestedKoReason: 'SLIPPED_2MM',
  };
}
