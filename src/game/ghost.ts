import type { GhostSample } from './types';

export const GHOST_SAMPLE_INTERVAL_MS = 120;
export const MAX_GHOST_SAMPLES = 900;

export interface GhostReplayState {
  active: boolean;
  x: number;
  y: number;
  finished: boolean;
  fadeAlpha: number;
  targetMs: number;
  trail: Array<{ x: number; y: number }>;
}

export function createGhostSample(
  tMs: number,
  x: number,
  y: number,
  width: number,
  height: number,
): GhostSample {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  return {
    tMs: Math.max(0, Math.round(tMs)),
    nx: roundCoord(clamp01(x / safeW)),
    ny: roundCoord(clamp01(y / safeH)),
  };
}

export function compactGhostPath(
  samples: GhostSample[],
  maxSamples = MAX_GHOST_SAMPLES,
): GhostSample[] {
  if (samples.length <= maxSamples) return samples;
  if (maxSamples < 2) return samples.slice(0, maxSamples);

  const out: GhostSample[] = [];
  const step = (samples.length - 1) / (maxSamples - 1);
  for (let i = 0; i < maxSamples - 1; i++) {
    out.push(samples[Math.round(i * step)]);
  }
  out.push(samples[samples.length - 1]);
  return out;
}

export function sampleGhostPosition(
  path: GhostSample[],
  elapsedMs: number,
  width: number,
  height: number,
): GhostReplayState {
  if (!path || path.length < 2) {
    return {
      active: false,
      x: 0,
      y: 0,
      finished: false,
      fadeAlpha: 0,
      targetMs: 0,
      trail: [],
    };
  }

  const first = path[0];
  const last = path[path.length - 1];
  const targetMs = last.tMs;

  if (elapsedMs >= last.tMs) {
    const overMs = elapsedMs - last.tMs;
    const fadeAlpha = Math.max(0, 1 - overMs / 1400);
    return {
      active: fadeAlpha > 0.02,
      x: last.nx * width,
      y: last.ny * height,
      finished: true,
      fadeAlpha,
      targetMs,
      trail: [],
    };
  }

  const pos = interpolateAtTime(path, Math.max(first.tMs, elapsedMs), width, height);
  const trail: Array<{ x: number; y: number }> = [];
  for (let step = 4; step >= 1; step--) {
    const tTrail = elapsedMs - step * 110;
    if (tTrail >= first.tMs) {
      trail.push(interpolateAtTime(path, tTrail, width, height));
    }
  }

  return {
    active: true,
    x: pos.x,
    y: pos.y,
    finished: false,
    fadeAlpha: 1,
    targetMs,
    trail,
  };
}

function interpolateAtTime(
  path: GhostSample[],
  tMs: number,
  width: number,
  height: number,
): { x: number; y: number } {
  if (tMs <= path[0].tMs) {
    return { x: path[0].nx * width, y: path[0].ny * height };
  }
  const last = path[path.length - 1];
  if (tMs >= last.tMs) {
    return { x: last.nx * width, y: last.ny * height };
  }

  let lo = 0;
  let hi = path.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (path[mid].tMs <= tMs) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = path[lo];
  const b = path[hi];
  const span = Math.max(1, b.tMs - a.tMs);
  const u = Math.max(0, Math.min(1, (tMs - a.tMs) / span));
  return {
    x: (a.nx + (b.nx - a.nx) * u) * width,
    y: (a.ny + (b.ny - a.ny) * u) * height,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function roundCoord(v: number): number {
  return Math.round(v * 10000) / 10000;
}
