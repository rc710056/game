import type { DistractionType } from './types';

class EnduranceAudioEngine {
  private ctx: AudioContext | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneSubOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private enabled = true;
  private droneActive = false;

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopDrone();
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public startDrone() {
    const ctx = this.ensureContext();
    if (!ctx || this.droneActive) return;

    try {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.04, now + 0.35);

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(64, now);

      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(32, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, now);

      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      sub.start(now);

      this.droneOsc = osc;
      this.droneSubOsc = sub;
      this.droneGain = gain;
      this.droneActive = true;
    } catch {
      this.droneActive = false;
    }
  }

  public updateTension(elapsedMs: number, accuracyPct: number) {
    if (!this.ctx || !this.droneActive || !this.droneOsc || !this.droneSubOsc || !this.droneGain) {
      return;
    }
    try {
      const now = this.ctx.currentTime;
      const sec = Math.min(90, elapsedMs / 1000);
      const baseFreq = 64 + sec * 0.68 + (100 - accuracyPct) * 0.3;
      this.droneOsc.frequency.setTargetAtTime(baseFreq, now, 0.15);
      this.droneSubOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.15);
      const targetVol = Math.min(0.085, 0.038 + sec * 0.00045);
      this.droneGain.gain.setTargetAtTime(targetVol, now, 0.15);
    } catch {
      // Ignore audio scheduling failures
    }
  }

  public stopDrone() {
    if (!this.ctx || !this.droneActive) return;
    try {
      const now = this.ctx.currentTime;
      if (this.droneGain) {
        this.droneGain.gain.cancelScheduledValues(now);
        this.droneGain.gain.setTargetAtTime(0.0001, now, 0.04);
      }
      const osc = this.droneOsc;
      const sub = this.droneSubOsc;
      setTimeout(() => {
        try {
          osc?.stop();
          sub?.stop();
          osc?.disconnect();
          sub?.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      }, 90);
    } catch {
      // Ignore
    }
    this.droneOsc = null;
    this.droneSubOsc = null;
    this.droneGain = null;
    this.droneActive = false;
  }

  public playEngageClick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.07);
      gain.gain.setValueAtTime(0.085, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Ignore
    }
  }

  public playDistractionCue(type: DistractionType) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'SYNC_SPLIT' || type === 'COLOR_MERGE') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(310, now);
        osc.frequency.exponentialRampToValueAtTime(620, now + 0.16);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.24);
        return;
      }

      if (type === 'FAKE_VICTORY_BLUFF') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(880, now + 0.09);
        gain.gain.setValueAtTime(0.085, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.28);
        return;
      }

      if (type === 'BLINK_STROBE' || type === 'FAKE_FREEZE' || type === 'OPTIC_BLUR') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(88, now + 0.22);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
        return;
      }

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.linearRampToValueAtTime(215, now + 0.06);
      osc.frequency.linearRampToValueAtTime(115, now + 0.14);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } catch {
      // Ignore
    }
  }

  public playDopamineChime(combo = 1) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const root = Math.min(880, 440 * Math.pow(1.09, Math.max(0, combo - 1)));
      [root, root * 1.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);
        gain.gain.setValueAtTime(0.08, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.22);
      });
    } catch {
      // Ignore
    }
  }

  public playClutchSave() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.11);
      gain.gain.setValueAtTime(0.075, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Ignore
    }
  }

  public playDeadzoneTick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.025);
      gain.gain.setValueAtTime(0.022, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.035);
    } catch {
      // Ignore
    }
  }

  public playMicroPulse(combo = 1) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const clamped = Math.max(1, Math.min(5, combo));
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const startFreq = 46 + clamped * 6;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.055);
      const vol = 0.018 + (clamped - 1) * 0.01;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.065);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch {
      // Ignore
    }
  }

  public playMilestoneChime() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.065);
        gain.gain.setValueAtTime(0.075, now + idx * 0.065);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.065 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.065);
        osc.stop(now + idx * 0.065 + 0.3);
      });
    } catch {
      // Ignore
    }
  }

  public playKnockoutBuzzer() {
    this.stopDrone();
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(145, now);
      osc1.frequency.exponentialRampToValueAtTime(72, now + 0.42);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(108, now);
      osc2.frequency.exponentialRampToValueAtTime(54, now + 0.42);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.48);
      osc2.stop(now + 0.48);
    } catch {
      // Ignore
    }
  }
}

export const enduranceAudio = new EnduranceAudioEngine();
