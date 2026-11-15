import { useEffect, useRef } from 'react';
import type { CoreState } from '../game/arena';
import { mmToPx, SLIP_LIMIT_MM } from '../game/engine';
import type { GhostReplayState } from '../game/ghost';
import { computeFisheyeState, projectFisheyePoint } from '../game/sensors';
import type { PhoneSensorSnapshot } from '../game/types';

export interface CanvasPopupEvent {
  text: string;
  color: string;
  x: number;
  y: number;
  trigger: number;
}

export interface ArenaRenderState {
  core: CoreState;
  ghost: GhostReplayState | null;
  sensors?: PhoneSensorSnapshot;
  isHolding: boolean;
  isArmedOrTitle: boolean;
  pointerActive: boolean;
  pointerX: number;
  pointerY: number;
  hoverActive: boolean;
  hoverX: number;
  hoverY: number;
  beatenBossOrPb: boolean;
  fakeVictoryBluff: boolean;
  koFlash: number;
  pulseTrigger: number;
  comboPulseTrigger: number;
  microPulseTrigger: number;
  microPulseStrength: number;
  combo: number;
  elapsedMs: number;
  precisionHeat: number; // 0..1 center bullseye lock gauge
  driftNorm: number;
  popupEvent: CanvasPopupEvent | null;
  missTapEvent: { x: number; y: number; trigger: number } | null;
  onTickFrame: (now: number, dtSec: number) => void;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: string;
}

interface Ripple {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
  lineWidth: number;
}

interface FloatingPopup {
  active: boolean;
  text: string;
  color: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

const MAX_PARTICLES = 110;
const MAX_RIPPLES = 18;
const MAX_POPUPS = 10;

interface ArenaCanvasProps {
  renderStateRef: React.MutableRefObject<ArenaRenderState>;
  onPointerDownArena: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMoveArena: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUpArena: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerCancelArena: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerLeaveArena: () => void;
  onContextMenuArena: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

export function ArenaCanvas({
  renderStateRef,
  onPointerDownArena,
  onPointerMoveArena,
  onPointerUpArena,
  onPointerCancelArena,
  onPointerLeaveArena,
  onContextMenuArena,
}: ArenaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 2,
      hue: '#FF3B1D',
    }));

    const ripples: Ripple[] = Array.from({ length: MAX_RIPPLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      maxRadius: 280,
      alpha: 0,
      color: '#FF3B1D',
      lineWidth: 2,
    }));

    const popups: FloatingPopup[] = Array.from({ length: MAX_POPUPS }, () => ({
      active: false,
      text: '',
      color: '#FFB800',
      x: 0,
      y: 0,
      life: 0,
      maxLife: 1.05,
    }));

    let particleCursor = 0;
    let rippleCursor = 0;
    let popupCursor = 0;
    let lastPulseTrigger = renderStateRef.current.pulseTrigger;
    let lastMicroPulseTrigger = renderStateRef.current.microPulseTrigger;
    let lastPopupTrigger = renderStateRef.current.popupEvent?.trigger ?? 0;
    let lastMissTapTrigger = renderStateRef.current.missTapEvent?.trigger ?? 0;
    let wasHolding = renderStateRef.current.isHolding;
    let rippleCooldown = 0;
    let smoothFisheyeStrength = 0;
    let smoothFocalX = 0;
    let smoothFocalY = 0;
    let microPulseEnergy = 0;
    let grabPulse = 0;
    let hoverFocus = 0;
    let lastDeadzoneSampleCount = renderStateRef.current.core.deadzone.visualSampleCount;
    let laggedPointerX = renderStateRef.current.pointerX;
    let laggedPointerY = renderStateRef.current.pointerY;
    const coreTrail: Array<{ x: number; y: number }> = [];
    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      coreTrail.length = 0;
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnRipple = (
      x: number,
      y: number,
      startR: number,
      maxR: number,
      color: string,
      lw = 2,
    ) => {
      const r = ripples[rippleCursor];
      rippleCursor = (rippleCursor + 1) % MAX_RIPPLES;
      r.active = true;
      r.x = x;
      r.y = y;
      r.radius = startR;
      r.maxRadius = maxR;
      r.alpha = 0.65;
      r.color = color;
      r.lineWidth = lw;
    };

    const spawnParticle = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      maxLife: number,
      size: number,
      hue: string,
    ) => {
      const p = particles[particleCursor];
      particleCursor = (particleCursor + 1) % MAX_PARTICLES;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = maxLife;
      p.maxLife = maxLife;
      p.size = size;
      p.hue = hue;
    };

    const spawnPopup = (ev: CanvasPopupEvent) => {
      const pop = popups[popupCursor];
      popupCursor = (popupCursor + 1) % MAX_POPUPS;
      pop.active = true;
      pop.text = ev.text;
      pop.color = ev.color;
      pop.x = Math.max(76, Math.min(width - 76, ev.x));
      pop.y = Math.max(96, ev.y);
      pop.life = 1.05;
      pop.maxLife = 1.05;

      spawnRipple(ev.x, ev.y, 18, 118, ev.color, 2.2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const spd = 75 + Math.random() * 95;
        spawnParticle(ev.x, ev.y, Math.cos(a) * spd, Math.sin(a) * spd, 0.45, 2.2, ev.color);
      }
    };

    const drawCloneOrb = (
      x: number,
      y: number,
      radius: number,
      hue: string,
      alpha: number,
      lifeMs: number,
    ) => {
      const spawnScale = 0.45 + 0.55 * Math.min(1, lifeMs / 220);
      const r = radius * spawnScale;
      if (r <= 2 || alpha <= 0.01) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      const g = ctx.createRadialGradient(x - r * 0.22, y - r * 0.25, r * 0.1, x, y, r);
      g.addColorStop(0, '#FF8A65');
      g.addColorStop(0.62, hue);
      g.addColorStop(1, '#68100A');

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      // Clean single specular perimeter rim (never stacks extra dashed halos)
      ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, r - 0.7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    };

    const drawCoreOrb = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      radius: number,
      hue: string,
      pulsePhase: number,
      tolerancePx: number,
      hoverAmt: number,
      grabAmt: number,
      state: ArenaRenderState,
    ) => {
      ctx.save();

      // Uniform circular engage lock-in pulse (zero oval distortion)
      const uniformScale = 1 - grabAmt * 0.045;
      if (Math.abs(uniformScale - 1) > 0.001) {
        ctx.translate(x, y);
        ctx.scale(uniformScale, uniformScale);
        ctx.translate(-x, -y);
      }

      if (state.isHolding) {
        // 1. Exact 2mm slip-tolerance perimeter ring aligned 1:1 with hitbox physics
        const tolRadius = radius + tolerancePx;
        const tolColor =
          state.driftNorm > 0.82
            ? 'rgba(255, 42, 31, 0.85)'
            : state.driftNorm > 0.55
              ? 'rgba(255, 184, 0, 0.72)'
              : 'rgba(255, 255, 255, 0.16)';
        ctx.strokeStyle = tolColor;
        ctx.lineWidth = state.driftNorm > 0.55 ? 1.8 : 1.1;
        ctx.beginPath();
        ctx.arc(x, y, tolRadius, 0, Math.PI * 2);
        ctx.stroke();

        // 2. Subtle directional heading arc (shows velocity cleanly without squashing into an oval)
        const speed = Math.hypot(vx, vy);
        if (speed > 26) {
          const moveAngle = Math.atan2(vy, vx);
          const arcSpan = Math.min(0.68, 0.28 + speed / 720);
          ctx.strokeStyle =
            state.beatenBossOrPb ? 'rgba(0, 229, 163, 0.65)' : 'rgba(255, 138, 101, 0.65)';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(x, y, radius + 5.5, moveAngle - arcSpan, moveAngle + arcSpan);
          ctx.stroke();
          ctx.lineCap = 'butt';
        }

        // 3. Precision Lock charge arc on exact outer perimeter
        if (state.precisionHeat > 0.03) {
          ctx.strokeStyle = state.precisionHeat >= 0.98 ? '#FFFFFF' : '#FFE082';
          ctx.lineWidth = state.precisionHeat >= 0.98 ? 2.8 : 2.2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(
            x,
            y,
            radius + 2.5,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * Math.min(1, state.precisionHeat),
          );
          ctx.stroke();
          ctx.lineCap = 'butt';
        }
      } else {
        // Idle / Hover / Armed acquisition halo (pure circle, smoothly tightens on hover)
        const breathe = Math.sin(pulsePhase * 0.75) * 2.2;
        const haloR = radius + 10 + breathe * (1 - hoverAmt * 0.7) - hoverAmt * 4.5;
        ctx.strokeStyle =
          hoverAmt > 0.1
            ? `rgba(255, 118, 87, ${(0.42 + hoverAmt * 0.45).toFixed(2)})`
            : 'rgba(255, 59, 29, 0.42)';
        ctx.lineWidth = 1.6 + hoverAmt * 0.8;
        ctx.beginPath();
        ctx.arc(x, y, haloR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 4. Core Sphere Body
      const g = ctx.createRadialGradient(
        x - radius * 0.24,
        y - radius * 0.28,
        radius * 0.08,
        x,
        y,
        radius,
      );
      if (state.fakeVictoryBluff && state.isHolding) {
        g.addColorStop(0, '#34D399');
        g.addColorStop(0.75, '#059669');
        g.addColorStop(1, '#064E3B');
      } else if (state.beatenBossOrPb && state.isHolding) {
        g.addColorStop(0, '#4DF7CB');
        g.addColorStop(0.68, '#00C493');
        g.addColorStop(1, '#035E49');
      } else {
        g.addColorStop(0, '#FF8466');
        g.addColorStop(0.6, hue);
        g.addColorStop(1, '#7A1208');
      }

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Clean outer sphere specular edge
      ctx.strokeStyle =
        state.isHolding && state.precisionHeat >= 0.98
          ? 'rgba(255,255,255,0.92)'
          : hoverAmt > 0.2 && !state.isHolding
            ? 'rgba(255,255,255,0.68)'
            : 'rgba(255,255,255,0.34)';
      ctx.lineWidth = state.isHolding && state.precisionHeat >= 0.98 ? 2 : 1.4;
      ctx.beginPath();
      ctx.arc(x, y, radius - 0.7, 0, Math.PI * 2);
      ctx.stroke();

      // 5. Inner Bullseye Sweet-Spot Ring (exact 0.42*radius hitbox match during hold)
      if (state.isHolding) {
        const bullR = radius * 0.42;
        const inSweetSpot = state.precisionHeat >= 0.98;
        ctx.strokeStyle = inSweetSpot ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.24)';
        ctx.lineWidth = inSweetSpot ? 1.5 : 1;
        ctx.beginPath();
        ctx.arc(x, y, bullR, 0, Math.PI * 2);
        ctx.stroke();

        // Subtle center lock pip
        ctx.fillStyle = inSweetSpot ? '#FFFFFF' : 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!state.isHolding) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 13px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HOLD & TRACK', x, y - 5);
        ctx.fillStyle = 'rgba(255,255,255,0.84)';
        ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('DO NOT LET GO', x, y + 11);
      } else if (state.fakeVictoryBluff) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 12px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LOCKED!', x, y);
      }

      ctx.restore();
    };

    let lastTime = performance.now();
    let rafId = 0;

    const frame = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(0.05, Math.max(0.001, rawDt));

      const state = renderStateRef.current;
      state.onTickFrame(now, dt);

      const core = state.core;
      const pulsePhase = now * 0.006;
      const tolerancePx = mmToPx(SLIP_LIMIT_MM, window.devicePixelRatio || 1);

      if (state.isHolding !== wasHolding) {
        wasHolding = state.isHolding;
        coreTrail.length = 0;
      }

      // Smoothly lerp hover acquisition state (~70ms settle)
      const hoverTarget =
        !state.isHolding &&
        state.hoverActive &&
        Math.hypot(state.hoverX - core.x, state.hoverY - core.y) <= core.radius + 28
          ? 1
          : 0;
      hoverFocus += (hoverTarget - hoverFocus) * Math.min(1, dt * 15);

      // Smoothly lerp fisheye barrel warp & focal point for vertigo feel
      const targetFisheye = computeFisheyeState(
        state.sensors,
        core.gravityInverted,
        state.elapsedMs,
        state.isHolding,
      );
      const lensLerp = Math.min(1, dt * 2.2);
      smoothFisheyeStrength += (targetFisheye.strength - smoothFisheyeStrength) * lensLerp;
      smoothFocalX += (targetFisheye.focalNormX - smoothFocalX) * lensLerp;
      smoothFocalY += (targetFisheye.focalNormY - smoothFocalY) * lensLerp;

      if (state.microPulseTrigger !== lastMicroPulseTrigger) {
        lastMicroPulseTrigger = state.microPulseTrigger;
        microPulseEnergy = Math.max(microPulseEnergy, state.microPulseStrength);
        if (state.isHolding) {
          spawnRipple(
            core.x,
            core.y,
            core.radius + tolerancePx,
            core.radius + tolerancePx + 42 + state.combo * 12,
            state.combo >= 4 ? '#FFB800' : 'rgba(255,59,29,0.55)',
            1.1 + state.combo * 0.2,
          );
        }
      }
      if (microPulseEnergy > 0) {
        microPulseEnergy = Math.max(0, microPulseEnergy - dt * 4.2);
      }

      const dz = core.deadzone;
      const deadzoneLagActive = state.isHolding && dz.active && dz.pointerInside;
      if (!deadzoneLagActive) {
        lastDeadzoneSampleCount = dz.visualSampleCount;
        laggedPointerX = state.pointerX;
        laggedPointerY = state.pointerY;
      } else if (dz.visualSampleCount !== lastDeadzoneSampleCount) {
        lastDeadzoneSampleCount = dz.visualSampleCount;
        laggedPointerX = state.pointerX;
        laggedPointerY = state.pointerY;
      }

      const renderCoreX = deadzoneLagActive ? dz.visualCoreX : core.x;
      const renderCoreY = deadzoneLagActive ? dz.visualCoreY : core.y;
      const renderPointerX = deadzoneLagActive ? laggedPointerX : state.pointerX;
      const renderPointerY = deadzoneLagActive ? laggedPointerY : state.pointerY;

      canvas.dataset.coreX = String(Math.round(core.x));
      canvas.dataset.coreY = String(Math.round(core.y));
      canvas.dataset.coreR = String(Math.round(core.radius));
      canvas.dataset.clones = String(core.clones.length);
      canvas.dataset.bonusActive = core.bonusGate?.active ? '1' : '0';
      canvas.dataset.ghostActive = state.ghost?.active ? '1' : '0';
      canvas.dataset.ghostX = state.ghost?.active ? String(Math.round(state.ghost.x)) : '';
      canvas.dataset.ghostY = state.ghost?.active ? String(Math.round(state.ghost.y)) : '';
      canvas.dataset.fisheye = smoothFisheyeStrength.toFixed(3);
      canvas.dataset.microPulses = String(state.microPulseTrigger);
      canvas.dataset.combo = String(state.combo);
      canvas.dataset.deadzoneActive = dz.active ? '1' : '0';
      canvas.dataset.deadzoneFlicker = dz.flickerOn ? '1' : '0';
      canvas.dataset.deadzoneLagPx = String(
        Math.round(Math.hypot(core.x - renderCoreX, core.y - renderCoreY)),
      );

      if (state.popupEvent && state.popupEvent.trigger !== lastPopupTrigger) {
        lastPopupTrigger = state.popupEvent.trigger;
        spawnPopup(state.popupEvent);
      }

      if (state.missTapEvent && state.missTapEvent.trigger !== lastMissTapTrigger) {
        lastMissTapTrigger = state.missTapEvent.trigger;
        spawnRipple(state.missTapEvent.x, state.missTapEvent.y, 8, 56, '#FFB800', 2);
        spawnPopup({
          text: 'PRESS INSIDE ORB',
          color: '#FFB800',
          x: state.missTapEvent.x,
          y: state.missTapEvent.y - 16,
          trigger: lastMissTapTrigger + 100000,
        });
      }

      if (state.pulseTrigger !== lastPulseTrigger) {
        lastPulseTrigger = state.pulseTrigger;
        if (state.isHolding) {
          grabPulse = 1;
        }
        if (state.koFlash > 0.5) {
          spawnRipple(core.x, core.y, core.radius, Math.max(width, height) * 0.7, '#FF2A1F', 3.5);
          for (let i = 0; i < 32; i++) {
            const a = (i / 32) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
            const spd = 160 + Math.random() * 290;
            spawnParticle(
              core.x + Math.cos(a) * core.radius * 0.5,
              core.y + Math.sin(a) * core.radius * 0.5,
              Math.cos(a) * spd,
              Math.sin(a) * spd,
              0.65 + Math.random() * 0.45,
              2 + Math.random() * 2.5,
              '#FF3B1D',
            );
          }
        } else {
          spawnRipple(
            core.x,
            core.y,
            core.radius + 4,
            Math.max(width, height) * 0.45,
            core.hue,
            2,
          );
        }
      }

      if (grabPulse > 0) {
        grabPulse = Math.max(0, grabPulse - dt * 7.2);
      }

      if (state.isHolding) {
        coreTrail.push({ x: core.x, y: core.y });
        if (coreTrail.length > 16) {
          coreTrail.shift();
        }
        rippleCooldown -= dt;
        if (rippleCooldown <= 0) {
          rippleCooldown = 0.72;
          spawnRipple(
            core.x,
            core.y,
            core.radius + tolerancePx,
            core.radius + tolerancePx + 145,
            core.hue,
            1.2,
          );
        }
        if (Math.random() < 0.28) {
          const a = Math.random() * Math.PI * 2;
          spawnParticle(
            core.x + Math.cos(a) * core.radius,
            core.y + Math.sin(a) * core.radius,
            -core.vx * 0.25 + (Math.random() - 0.5) * 28,
            -core.vy * 0.25 + (Math.random() - 0.5) * 28,
            0.48,
            1.6,
            state.beatenBossOrPb ? '#00E5A3' : '#FFB800',
          );
        }
      }

      if (state.koFlash > 0) {
        state.koFlash = Math.max(0, state.koFlash - dt * 2.3);
      }

      // 1. Base background
      ctx.fillStyle = core.invertActive ? '#EDEFF3' : '#07080C';
      ctx.fillRect(0, 0, width, height);

      const lensCx = width * (0.5 + smoothFocalX);
      const lensCy = height * (0.5 + smoothFocalY);
      const maxLensR = Math.max(120, Math.hypot(width, height) * 0.56);

      // 2. Background Layer (quake & micro-pulse breath apply ONLY to environment so core stays 1:1 locked to pointer)
      ctx.save();
      ctx.translate(core.quakeOffsetX, core.quakeOffsetY);

      if (core.blurPx > 0.25) {
        ctx.filter = `blur(${core.blurPx.toFixed(1)}px)`;
      }

      if (microPulseEnergy > 0.01) {
        const pulseScale = 1 + microPulseEnergy * 0.012;
        ctx.translate(lensCx, lensCy);
        ctx.scale(pulseScale, pulseScale);
        ctx.translate(-lensCx, -lensCy);
      }

      // Tactical grid (curved via fisheye barrel distortion when tilted / warped)
      ctx.strokeStyle = core.invertActive ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.044)';
      ctx.lineWidth = 1;
      const step = 52;
      ctx.beginPath();
      if (smoothFisheyeStrength > 0.012) {
        const segs = 14;
        for (let gx = ((width * 0.5) % step) - step; gx <= width + step; gx += step) {
          const p0 = projectFisheyePoint(gx, -24, lensCx, lensCy, maxLensR, smoothFisheyeStrength);
          ctx.moveTo(p0.x, p0.y);
          for (let s = 1; s <= segs; s++) {
            const py = -24 + ((height + 48) * s) / segs;
            const p = projectFisheyePoint(gx, py, lensCx, lensCy, maxLensR, smoothFisheyeStrength);
            ctx.lineTo(p.x, p.y);
          }
        }
        for (let gy = ((height * 0.5) % step) - step; gy <= height + step; gy += step) {
          const p0 = projectFisheyePoint(-24, gy, lensCx, lensCy, maxLensR, smoothFisheyeStrength);
          ctx.moveTo(p0.x, p0.y);
          for (let s = 1; s <= segs; s++) {
            const px = -24 + ((width + 48) * s) / segs;
            const p = projectFisheyePoint(px, gy, lensCx, lensCy, maxLensR, smoothFisheyeStrength);
            ctx.lineTo(p.x, p.y);
          }
        }
      } else {
        for (let gx = (width * 0.5) % step; gx < width; gx += step) {
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, height);
        }
        for (let gy = (height * 0.5) % step; gy < height; gy += step) {
          ctx.moveTo(0, gy);
          ctx.lineTo(width, gy);
        }
      }
      ctx.stroke();

      // Fisheye vertigo optical glass rim & vignette
      if (smoothFisheyeStrength > 0.025) {
        const outerR = Math.max(width, height) * 0.72;
        const lensVig = ctx.createRadialGradient(
          lensCx,
          lensCy,
          outerR * (0.48 - smoothFisheyeStrength * 0.2),
          lensCx,
          lensCy,
          outerR,
        );
        lensVig.addColorStop(0, 'rgba(7,8,12,0)');
        lensVig.addColorStop(
          0.78,
          `rgba(56,189,248,${(smoothFisheyeStrength * 0.08).toFixed(3)})`,
        );
        lensVig.addColorStop(1, `rgba(2,4,9,${(0.22 + smoothFisheyeStrength * 0.45).toFixed(3)})`);
        ctx.fillStyle = lensVig;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.strokeStyle = core.gravityInverted
          ? `rgba(56,189,248,${(smoothFisheyeStrength * 0.26).toFixed(3)})`
          : `rgba(255,184,0,${(smoothFisheyeStrength * 0.2).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(lensCx, lensCy, Math.min(width, height) * 0.42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Ambient core aura glow
      const aura = ctx.createRadialGradient(
        core.x,
        core.y,
        core.radius * 0.2,
        core.x,
        core.y,
        core.radius * 4.0,
      );
      aura.addColorStop(
        0,
        state.beatenBossOrPb && state.isHolding ? 'rgba(0,229,163,0.16)' : 'rgba(255,59,29,0.15)',
      );
      aura.addColorStop(1, 'rgba(7,8,12,0)');
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, width, height);

      // Pooled ripples
      for (let i = 0; i < MAX_RIPPLES; i++) {
        const r = ripples[i];
        if (!r.active) continue;
        r.radius += dt * 195;
        const prog = r.radius / r.maxRadius;
        r.alpha = Math.max(0, 0.5 * (1 - prog));
        if (prog >= 1) {
          r.active = false;
          continue;
        }
        ctx.save();
        ctx.globalAlpha = r.alpha;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.lineWidth;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Pooled particles
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particles[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / p.maxLife) * 0.78;
        ctx.fillStyle = p.hue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.filter = 'none';
      ctx.restore();

      // 3. Exact-Coordinate Gameplay Layer (zero camera offset mismatch against pointer)
      ctx.save();
      if (core.blurPx > 0.25) {
        ctx.filter = `blur(${core.blurPx.toFixed(1)}px)`;
      }

      // Bonus Focus Ring (+250 Focus Gate) with proximity lock highlight
      if (state.isHolding && core.bonusGate?.active) {
        const gate = core.bonusGate;
        const remainRatio = Math.max(0, 1 - gate.lifeMs / gate.maxLifeMs);
        const distToGate = Math.hypot(core.x - gate.x, core.y - gate.y);
        const nearGate = distToGate < core.radius + gate.radius * 1.9;
        const gatePulse = 1 + Math.sin(pulsePhase * 1.4) * 0.045;
        ctx.save();
        ctx.globalAlpha = remainRatio < 0.25 ? remainRatio * 4 : 0.94;

        ctx.strokeStyle = nearGate ? 'rgba(255, 224, 130, 0.55)' : 'rgba(255, 184, 0, 0.26)';
        ctx.lineWidth = nearGate ? 5 : 3.5;
        ctx.beginPath();
        ctx.arc(gate.x, gate.y, gate.radius * gatePulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#FFB800';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(
          gate.x,
          gate.y,
          gate.radius * gatePulse,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * remainRatio,
        );
        ctx.stroke();
        ctx.lineCap = 'butt';

        ctx.fillStyle = nearGate ? 'rgba(255, 184, 0, 0.22)' : 'rgba(255, 184, 0, 0.12)';
        ctx.beginPath();
        ctx.arc(gate.x, gate.y, gate.radius * 0.78, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFE082';
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${gate.points}`, gate.x, gate.y);
        ctx.restore();
      }

      // Smooth Tapered Core Motion Wake Ribbon (no disjointed circles)
      if (state.isHolding && coreTrail.length > 3) {
        const wakeColor =
          state.beatenBossOrPb
            ? 'rgba(0, 229, 163, 0.22)'
            : state.precisionHeat >= 0.98
              ? 'rgba(255, 224, 130, 0.24)'
              : 'rgba(255, 59, 29, 0.2)';
        const leftPts: Array<{ x: number; y: number }> = [];
        const rightPts: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < coreTrail.length; i++) {
          const p = coreTrail[i];
          const next = coreTrail[Math.min(coreTrail.length - 1, i + 1)];
          const prev = coreTrail[Math.max(0, i - 1)];
          const tx = next.x - prev.x;
          const ty = next.y - prev.y;
          const len = Math.max(0.001, Math.hypot(tx, ty));
          const nx = -ty / len;
          const ny = tx / len;
          const prog = i / (coreTrail.length - 1);
          const halfW = core.radius * 0.56 * prog * prog;
          leftPts.push({ x: p.x + nx * halfW, y: p.y + ny * halfW });
          rightPts.push({ x: p.x - nx * halfW, y: p.y - ny * halfW });
        }

        ctx.save();
        ctx.fillStyle = wakeColor;
        ctx.beginPath();
        ctx.moveTo(leftPts[0].x, leftPts[0].y);
        for (let i = 1; i < leftPts.length; i++) {
          ctx.lineTo(leftPts[i].x, leftPts[i].y);
        }
        for (let i = rightPts.length - 1; i >= 0; i--) {
          ctx.lineTo(rightPts[i].x, rightPts[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // RGB Tear Ghost Afterimages
      if (core.rgbTearActive && core.afterimages.length > 0) {
        for (let i = 0; i < core.afterimages.length; i++) {
          const img = core.afterimages[i];
          const fade = Math.max(0.08, (1 - i / core.afterimages.length) * 0.36);
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.strokeStyle = '#00F0FF';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(img.x + img.dx, img.y - img.dx * 0.35, core.radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = '#FF2E54';
          ctx.beginPath();
          ctx.arc(img.x - img.dx, img.y + img.dx * 0.35, core.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Clone Resonance Ring & Decoy Orbs
      if (core.clones.length > 0) {
        let maxSyncOrbit = 0;
        for (let i = 0; i < core.clones.length; i++) {
          const c = core.clones[i];
          if (c.phase === 'sync' || c.phase === 'merge') {
            maxSyncOrbit = Math.max(maxSyncOrbit, Math.hypot(c.x - core.x, c.y - core.y));
          }
        }
        if (maxSyncOrbit > 6) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 110, 64, 0.2)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(core.x, core.y, maxSyncOrbit, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        for (let i = 0; i < core.clones.length; i++) {
          const c = core.clones[i];
          drawCloneOrb(c.x, c.y, c.radius, c.hue, c.alpha, c.lifeMs);
        }
      }

      // Real-Time Personal Best Ghost Replay
      if (state.isHolding && state.ghost?.active) {
        const ghost = state.ghost;
        const gColor = ghost.finished ? '#00E5A3' : '#38BDF8';
        const gRadius = Math.max(22, core.radius * 0.84);
        ctx.save();
        ctx.globalAlpha = ghost.fadeAlpha * 0.82;

        if (ghost.trail.length > 1) {
          ctx.strokeStyle = ghost.finished ? 'rgba(0, 229, 163, 0.28)' : 'rgba(56, 189, 248, 0.28)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ghost.trail[0].x, ghost.trail[0].y);
          for (let i = 1; i < ghost.trail.length; i++) {
            const xc = (ghost.trail[i - 1].x + ghost.trail[i].x) * 0.5;
            const yc = (ghost.trail[i - 1].y + ghost.trail[i].y) * 0.5;
            ctx.quadraticCurveTo(ghost.trail[i - 1].x, ghost.trail[i - 1].y, xc, yc);
          }
          ctx.lineTo(ghost.x, ghost.y);
          ctx.stroke();
        }

        ctx.fillStyle = ghost.finished ? 'rgba(0, 229, 163, 0.12)' : 'rgba(56, 189, 248, 0.12)';
        ctx.beginPath();
        ctx.arc(ghost.x, ghost.y, gRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = gColor;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(ghost.x, ghost.y, gRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = gColor;
        ctx.beginPath();
        ctx.arc(ghost.x, ghost.y, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = gColor;
        ctx.fillText(ghost.finished ? 'PB PASSED' : 'PB', ghost.x, ghost.y - gRadius - 5);
        ctx.restore();
      }

      // Gravity / Tilt Force Chevrons
      const sensors = state.sensors;
      if (state.isHolding && (core.gravityInverted || (sensors?.active && sensors.tiltTotalDeg > 7))) {
        const gx = sensors?.active ? sensors.gravityX * (core.gravityInverted ? -1 : 1) : 0.45;
        const gy = sensors?.active ? sensors.gravityY * (core.gravityInverted ? -1 : 1) : -0.85;
        const angle = Math.atan2(gy, gx);
        const chevronDist = core.radius + tolerancePx + 12;
        const cx = core.x + Math.cos(angle) * chevronDist;
        const cy = core.y + Math.sin(angle) * chevronDist;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.strokeStyle = core.gravityInverted ? '#38BDF8' : '#FFB800';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-5, -5);
        ctx.lineTo(2, 0);
        ctx.lineTo(-5, 5);
        ctx.moveTo(2, -4);
        ctx.lineTo(8, 0);
        ctx.lineTo(2, 4);
        ctx.stroke();
        ctx.restore();
      }

      // Telegraph dash windup cue
      if (state.isHolding && core.dashWindupMs > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 184, 0, 0.8)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(
          core.x + Math.cos(core.targetAngle) * (core.radius + 4),
          core.y + Math.sin(core.targetAngle) * (core.radius + 4),
        );
        ctx.lineTo(
          core.x + Math.cos(core.targetAngle) * (core.radius + 38),
          core.y + Math.sin(core.targetAngle) * (core.radius + 38),
        );
        ctx.stroke();
        ctx.restore();
      }

      // Dynamic Deadzone Interference Field (visual lag illusion zone around core)
      if (state.isHolding && dz.active) {
        ctx.save();
        const zoneFlicker = dz.flickerOn ? 1 : 0;
        const zoneFill = ctx.createRadialGradient(
          dz.x,
          dz.y,
          dz.radius * 0.2,
          dz.x,
          dz.y,
          dz.radius,
        );
        zoneFill.addColorStop(
          0,
          zoneFlicker ? 'rgba(139, 92, 246, 0.04)' : 'rgba(56, 189, 248, 0.03)',
        );
        zoneFill.addColorStop(
          1,
          zoneFlicker ? 'rgba(139, 92, 246, 0.14)' : 'rgba(56, 189, 248, 0.08)',
        );
        ctx.fillStyle = zoneFill;
        ctx.beginPath();
        ctx.arc(dz.x, dz.y, dz.radius, 0, Math.PI * 2);
        ctx.fill();

        // 4-quadrant rotating radar boundary arcs
        const rot = pulsePhase * 0.35;
        ctx.strokeStyle = zoneFlicker
          ? 'rgba(167, 139, 250, 0.72)'
          : 'rgba(56, 189, 248, 0.42)';
        ctx.lineWidth = zoneFlicker ? 1.8 : 1.3;
        const gap = 0.28;
        for (let q = 0; q < 4; q++) {
          const a0 = rot + q * (Math.PI / 2) + gap * 0.5;
          const a1 = rot + (q + 1) * (Math.PI / 2) - gap * 0.5;
          ctx.beginPath();
          ctx.arc(dz.x, dz.y, dz.radius, a0, a1);
          ctx.stroke();
        }

        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = zoneFlicker ? 'rgba(221, 214, 254, 0.92)' : 'rgba(186, 230, 253, 0.68)';
        ctx.fillText('DEADZONE · LAG ILLUSION', dz.x, dz.y - dz.radius - 6);
        ctx.restore();
      }

      // Real Target Core (sample-held + flickering during deadzone lag illusion)
      ctx.save();
      if (deadzoneLagActive && dz.flickerOn) {
        ctx.globalAlpha = 0.54;
      }
      drawCoreOrb(
        renderCoreX,
        renderCoreY,
        core.vx,
        core.vy,
        core.radius,
        core.hue,
        pulsePhase,
        tolerancePx,
        hoverFocus,
        grabPulse,
        state,
      );

      // Synchronized Optical Contact Anchor (matches deadzone sample-hold so input feels lagged)
      if (state.isHolding && state.pointerActive) {
        const px = renderPointerX;
        const py = renderPointerY;
        const dx = px - renderCoreX;
        const dy = py - renderCoreY;
        const dist = Math.hypot(dx, dy);
        const anchorR = 9;
        const warn = state.driftNorm > 0.65;
        const strokeCol = warn
          ? '#FFB800'
          : deadzoneLagActive && dz.flickerOn
            ? 'rgba(196, 181, 253, 0.72)'
            : 'rgba(255,255,255,0.86)';

        if (dist > anchorR + 4) {
          const ux = dx / dist;
          const uy = dy / dist;
          ctx.strokeStyle = warn ? 'rgba(255, 184, 0, 0.55)' : 'rgba(255, 255, 255, 0.34)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(renderCoreX + ux * 3, renderCoreY + uy * 3);
          ctx.lineTo(px - ux * anchorR, py - uy * anchorR);
          ctx.stroke();
        }

        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(px, py, anchorR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = warn ? '#FFB800' : '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Floating Dopamine Popups
      for (let i = 0; i < MAX_POPUPS; i++) {
        const pop = popups[i];
        if (!pop.active) continue;
        pop.life -= dt;
        if (pop.life <= 0) {
          pop.active = false;
          continue;
        }
        pop.y -= dt * 42;
        const alpha = Math.min(1, pop.life / (pop.maxLife * 0.45));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '700 15px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#07080C';
        ctx.fillText(pop.text, pop.x + 1, pop.y + 1);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, pop.x, pop.y);
        ctx.restore();
      }

      ctx.filter = 'none';
      ctx.restore();

      // 4. Combo Micro-Pulse Screen Edge Tension Border
      if (state.isHolding && microPulseEnergy > 0.02) {
        const edgeAlpha = microPulseEnergy * (0.08 + state.combo * 0.035);
        ctx.strokeStyle =
          state.combo >= 4
            ? `rgba(255, 184, 0, ${edgeAlpha.toFixed(3)})`
            : `rgba(255, 59, 29, ${edgeAlpha.toFixed(3)})`;
        ctx.lineWidth = 4 + state.combo * 1.5;
        ctx.strokeRect(0, 0, width, height);
      }

      // 5. Blackout Blink Strobe
      if (core.blinkAlpha > 0.02) {
        ctx.fillStyle = `rgba(3, 4, 8, ${core.blinkAlpha.toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
      }

      // 6. Knock-Out Flash
      if (state.koFlash > 0.01) {
        ctx.fillStyle = `rgba(255, 42, 31, ${(state.koFlash * 0.34).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [renderStateRef]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="arena-canvas"
      onPointerDown={onPointerDownArena}
      onPointerMove={onPointerMoveArena}
      onPointerUp={onPointerUpArena}
      onPointerCancel={onPointerCancelArena}
      onPointerLeave={onPointerLeaveArena}
      onContextMenu={onContextMenuArena}
      className="fixed inset-0 w-full h-full touch-none select-none z-10 cursor-crosshair"
    />
  );
}
