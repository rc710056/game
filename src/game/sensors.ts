import type { GameMode, PhoneSensorSnapshot } from './types';

export function createEmptySensorSnapshot(): PhoneSensorSnapshot {
  return {
    active: false,
    tiltXDeg: 0,
    tiltYDeg: 0,
    tiltTotalDeg: 0,
    gravityX: 0,
    gravityY: 0,
    gyroSpinDegPerSec: 0,
    shakeMag: 0,
    source: 'none',
  };
}

/**
 * Converts phone orientation (beta/gamma in degrees) relative to baseline hold pose
 * into normalized gravity pull (-1..1) and total tilt magnitude.
 */
export function normalizeOrientationToGravity(
  beta: number,
  gamma: number,
  baseBeta: number,
  baseGamma: number,
  maxTiltRefDeg = 35,
): {
  tiltXDeg: number;
  tiltYDeg: number;
  tiltTotalDeg: number;
  gravityX: number;
  gravityY: number;
} {
  const dBeta = clamp(beta - baseBeta, -65, 65);
  const dGamma = clamp(gamma - baseGamma, -65, 65);
  const tiltTotalDeg = Math.hypot(dBeta, dGamma);
  const gravityX = clamp(dGamma / maxTiltRefDeg, -1, 1);
  const gravityY = clamp(dBeta / maxTiltRefDeg, -1, 1);
  return {
    tiltXDeg: dGamma,
    tiltYDeg: dBeta,
    tiltTotalDeg,
    gravityX,
    gravityY,
  };
}

/**
 * Computes linear shake magnitude (m/s^2) from accelerometer readings.
 * If gravity-included values are passed (around 9.81 m/s^2 at rest),
 * strips the 9.81G baseline cleanly.
 */
export function computeShakeMagnitude(
  ax: number,
  ay: number,
  az: number,
  includesGravity = false,
): number {
  const mag = Math.hypot(ax, ay, az);
  if (includesGravity) {
    return Math.abs(mag - 9.81);
  }
  return mag;
}

/**
 * Computes total angular rotation rate (deg/s) from gyroscope readings.
 */
export function computeGyroSpin(alphaRate: number, betaRate: number, gammaRate: number): number {
  return Math.hypot(alphaRate, betaRate, gammaRate);
}

/**
 * Computes physical gravity acceleration (px/s^2) applied to the moving orb
 * when phone tilt/gravity sensors are active, or during GRAVITY_SHIFT distraction.
 */
export function computeGravityForceOnCore(
  gravityX: number,
  gravityY: number,
  gravityInverted: boolean,
  mode: GameMode,
): { fx: number; fy: number } {
  const strength = mode === 'chaos' ? 210 : 145;
  const sign = gravityInverted ? -1.35 : 1;
  return {
    fx: gravityX * strength * sign,
    fy: gravityY * strength * sign,
  };
}

export type SensorPermissionState = 'unsupported' | 'prompt' | 'active' | 'denied';

export function detectMobileSensorState(): SensorPermissionState {
  if (typeof window === 'undefined') return 'unsupported';
  const hasMotion = 'DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window;
  if (!hasMotion) return 'unsupported';

  const dme = window.DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  const doe = window.DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };

  if (typeof dme?.requestPermission === 'function' || typeof doe?.requestPermission === 'function') {
    return 'prompt';
  }
  return 'active';
}

export async function requestAllPhoneSensors(): Promise<SensorPermissionState> {
  if (typeof window === 'undefined') return 'unsupported';

  const dme = window.DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  const doe = window.DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };

  try {
    let granted = true;
    if (typeof doe?.requestPermission === 'function') {
      const r1 = await doe.requestPermission();
      if (r1 !== 'granted') granted = false;
    }
    if (typeof dme?.requestPermission === 'function') {
      const r2 = await dme.requestPermission();
      if (r2 !== 'granted') granted = false;
    }
    return granted ? 'active' : 'denied';
  } catch {
    return 'denied';
  }
}

export interface FisheyeState {
  strength: number; // 0..0.65 barrel warp strength
  focalNormX: number; // -0.35..0.35 optical center shift X
  focalNormY: number; // -0.35..0.35 optical center shift Y
}

/**
 * Computes fisheye barrel distortion parameters from live phone tilt/gravity sensors.
 * Slowly intensifies during gravity inversions or larger tilt angles to create vertigo.
 */
export function computeFisheyeState(
  sensors: PhoneSensorSnapshot | null | undefined,
  gravityInverted: boolean,
  elapsedMs: number,
  isHolding: boolean,
): FisheyeState {
  if (!isHolding) {
    return { strength: 0, focalNormX: 0, focalNormY: 0 };
  }

  const swayPhase = elapsedMs * 0.00085;
  const ambientSwell = Math.min(0.1, (elapsedMs / 1000) * 0.0022) + (gravityInverted ? 0.14 : 0);

  if (sensors?.active && (sensors.tiltTotalDeg > 1 || Math.abs(sensors.gravityX) > 0.01 || Math.abs(sensors.gravityY) > 0.01)) {
    const tiltFactor = clamp(sensors.tiltTotalDeg / 32, 0, 1);
    const strength = clamp(0.12 + tiltFactor * 0.46 + (gravityInverted ? 0.12 : 0), 0, 0.65);
    const sign = gravityInverted ? -1 : 1;
    return {
      strength,
      focalNormX: clamp(sensors.gravityX * 0.28 * sign, -0.35, 0.35),
      focalNormY: clamp(sensors.gravityY * 0.28 * sign, -0.35, 0.35),
    };
  }

  return {
    strength: clamp(ambientSwell, 0, 0.32),
    focalNormX: Math.sin(swayPhase) * (gravityInverted ? 0.16 : 0.06),
    focalNormY: Math.cos(swayPhase * 0.8) * (gravityInverted ? 0.16 : 0.06),
  };
}

/**
 * Projects a 2D canvas coordinate through a smooth fisheye barrel lens centered at (cx, cy).
 */
export function projectFisheyePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  maxRadius: number,
  strength: number,
): { x: number; y: number } {
  if (strength <= 0.002 || maxRadius <= 1) {
    return { x: px, y: py };
  }
  const dx = px - cx;
  const dy = py - cy;
  const r = Math.hypot(dx, dy);
  if (r < 0.001) return { x: px, y: py };

  const rn = Math.min(1.35, r / maxRadius);
  const bulge = 1 + strength * (0.55 - rn * rn * 0.42);
  return {
    x: cx + dx * bulge,
    y: cy + dy * bulge,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
