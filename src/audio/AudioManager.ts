import {
  CommentaryContext,
  CommentaryEvent,
  Commentator,
} from './Commentator';

export type CrowdReactionType =
  | 'pass'
  | 'long_pass'
  | 'cross'
  | 'shot'
  | 'save'
  | 'post'
  | 'goal';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Multi-layered ambient stadium bed
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  private crowdSource: AudioBufferSourceNode | null = null;

  private crowdLowGain: GainNode | null = null;
  private crowdLowSource: AudioBufferSourceNode | null = null;
  private crowdLfo: OscillatorNode | null = null;
  private crowdLfoGain: GainNode | null = null;

  private enabled = true;
  private volume = 0.75;
  private commentatorEnabled = true;

  private lastCrowdReactionAt: Record<CrowdReactionType, number> = {
    pass: -Infinity,
    long_pass: -Infinity,
    cross: -Infinity,
    shot: -Infinity,
    save: -Infinity,
    post: -Infinity,
    goal: -Infinity,
  };

  public readonly commentator = new Commentator();

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.enabled ? this.volume : 0;
      this.masterGain.connect(this.ctx.destination);
      this.commentator.attachAudio(this.ctx, this.masterGain);
      this.startCrowdBed();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setSettings(
    enabled: boolean,
    volume: number,
    commentatorEnabled = this.commentatorEnabled,
  ): void {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    this.commentatorEnabled = commentatorEnabled;

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.enabled ? this.volume : 0,
        this.ctx.currentTime,
        0.04,
      );
    }

    this.commentator.setSettings(this.enabled, this.volume, this.commentatorEnabled);
  }

  public setCommentaryLineCallback(cb: (line: string, durationMs: number) => void): void {
    this.commentator.setOnLineCallback(cb);
  }

  private createCrowdNoiseBuffer(sampleRate: number, seconds: number, warmth: number): AudioBuffer {
    const length = Math.floor(sampleRate * seconds);
    const buffer = this.ctx!.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + warmth * white) / (1 + warmth);
      data[i] = lastOut * 2.6;
    }
    return buffer;
  }

  private startCrowdBed(): void {
    if (!this.ctx || !this.masterGain || this.crowdSource) return;
    const sampleRate = this.ctx.sampleRate;

    // 1. Mid-band stadium murmur (reacts dynamically to passes, shots, saves, goals)
    const midBuffer = this.createCrowdNoiseBuffer(sampleRate, 3.0, 0.035);
    const midSrc = this.ctx.createBufferSource();
    midSrc.buffer = midBuffer;
    midSrc.loop = true;

    const midFilter = this.ctx.createBiquadFilter();
    midFilter.type = 'bandpass';
    midFilter.frequency.value = 540;
    midFilter.Q.value = 0.72;

    const midGain = this.ctx.createGain();
    midGain.gain.value = 0.048;

    midSrc.connect(midFilter);
    midFilter.connect(midGain);
    midGain.connect(this.masterGain);
    midSrc.start();

    // 2. Low stadium bowl rumble for depth
    const lowBuffer = this.createCrowdNoiseBuffer(sampleRate, 2.5, 0.015);
    const lowSrc = this.ctx.createBufferSource();
    lowSrc.buffer = lowBuffer;
    lowSrc.loop = true;

    const lowFilter = this.ctx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = 230;

    const lowGain = this.ctx.createGain();
    lowGain.gain.value = 0.032;

    lowSrc.connect(lowFilter);
    lowFilter.connect(lowGain);
    lowGain.connect(this.masterGain);
    lowSrc.start();

    // 3. Organic slow breathing LFO on mid filter so the crowd feels alive
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.22;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 45;
    lfo.connect(lfoGain);
    lfoGain.connect(midFilter.frequency);
    lfo.start();

    this.crowdSource = midSrc;
    this.crowdFilter = midFilter;
    this.crowdGain = midGain;
    this.crowdLowSource = lowSrc;
    this.crowdLowGain = lowGain;
    this.crowdLfo = lfo;
    this.crowdLfoGain = lfoGain;
  }

  public reactCrowd(type: CrowdReactionType, intensity = 0.65): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.masterGain || !this.crowdGain || !this.crowdFilter) return;

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const minCooldownMs =
      type === 'pass' ? 280 : type === 'long_pass' || type === 'cross' ? 360 : type === 'goal' ? 300 : 380;
    if (nowMs - this.lastCrowdReactionAt[type] < minCooldownMs) {
      return;
    }
    this.lastCrowdReactionAt[type] = nowMs;

    const clamped = Math.max(0.2, Math.min(1, intensity));
    const now = this.ctx.currentTime;

    if (type === 'pass') {
      // Subtle murmur/anticipation ripple on passes
      this.crowdGain.gain.cancelScheduledValues(now);
      this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, now);
      this.crowdGain.gain.linearRampToValueAtTime(0.08 + clamped * 0.02, now + 0.12);
      this.crowdGain.gain.linearRampToValueAtTime(0.048, now + 0.55);

      this.crowdFilter.frequency.cancelScheduledValues(now);
      this.crowdFilter.frequency.setValueAtTime(this.crowdFilter.frequency.value, now);
      this.crowdFilter.frequency.linearRampToValueAtTime(680, now + 0.14);
      this.crowdFilter.frequency.linearRampToValueAtTime(540, now + 0.58);
      return;
    }

    if (type === 'long_pass' || type === 'cross') {
      const peakGain = type === 'cross' ? 0.145 : 0.12;
      const peakFreq = type === 'cross' ? 910 : 820;

      this.crowdGain.gain.cancelScheduledValues(now);
      this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, now);
      this.crowdGain.gain.linearRampToValueAtTime(peakGain, now + 0.22);
      this.crowdGain.gain.linearRampToValueAtTime(0.048, now + 0.95);

      this.crowdFilter.frequency.cancelScheduledValues(now);
      this.crowdFilter.frequency.setValueAtTime(this.crowdFilter.frequency.value, now);
      this.crowdFilter.frequency.linearRampToValueAtTime(peakFreq, now + 0.22);
      this.crowdFilter.frequency.linearRampToValueAtTime(540, now + 0.95);
      return;
    }

    if (type === 'shot') {
      const peakGain = 0.18 + clamped * 0.1;
      this.crowdGain.gain.cancelScheduledValues(now);
      this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, now);
      this.crowdGain.gain.linearRampToValueAtTime(peakGain, now + 0.14);
      this.crowdGain.gain.linearRampToValueAtTime(0.095, now + 0.65);
      this.crowdGain.gain.linearRampToValueAtTime(0.048, now + 1.45);

      this.crowdFilter.frequency.cancelScheduledValues(now);
      this.crowdFilter.frequency.setValueAtTime(this.crowdFilter.frequency.value, now);
      this.crowdFilter.frequency.linearRampToValueAtTime(1080, now + 0.15);
      this.crowdFilter.frequency.linearRampToValueAtTime(540, now + 1.4);

      // Collective "oooooh!" swell on powerful shots
      this.triggerVocalCrowdSwell(460, 860, 420, 0.95, 0.08 + clamped * 0.05);
      return;
    }

    if (type === 'save') {
      this.crowdGain.gain.cancelScheduledValues(now);
      this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, now);
      this.crowdGain.gain.linearRampToValueAtTime(0.24, now + 0.14);
      this.crowdGain.gain.linearRampToValueAtTime(0.11, now + 0.9);
      this.crowdGain.gain.linearRampToValueAtTime(0.048, now + 1.9);

      this.crowdFilter.frequency.cancelScheduledValues(now);
      this.crowdFilter.frequency.setValueAtTime(this.crowdFilter.frequency.value, now);
      this.crowdFilter.frequency.linearRampToValueAtTime(980, now + 0.15);
      this.crowdFilter.frequency.linearRampToValueAtTime(540, now + 1.8);

      this.triggerVocalCrowdSwell(720, 520, 360, 0.85, 0.095);
      this.triggerApplauseBurst(1.15, 0.065);
      return;
    }

    if (type === 'post') {
      this.crowdGain.gain.cancelScheduledValues(now);
      this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, now);
      this.crowdGain.gain.linearRampToValueAtTime(0.25, now + 0.12);
      this.crowdGain.gain.linearRampToValueAtTime(0.048, now + 1.75);

      this.crowdFilter.frequency.cancelScheduledValues(now);
      this.crowdFilter.frequency.setValueAtTime(this.crowdFilter.frequency.value, now);
      this.crowdFilter.frequency.linearRampToValueAtTime(940, now + 0.12);
      this.crowdFilter.frequency.linearRampToValueAtTime(540, now + 1.7);

      // Near-miss collective groan ("aaaaah!")
      this.triggerVocalCrowdSwell(840, 480, 300, 1.1, 0.11);
      return;
    }

    if (type === 'goal') {
      this.crowdGain.gain.cancelScheduledValues(now);
      this.crowdGain.gain.setValueAtTime(Math.max(0.06, this.crowdGain.gain.value), now);
      this.crowdGain.gain.linearRampToValueAtTime(0.36, now + 0.24);
      this.crowdGain.gain.linearRampToValueAtTime(0.22, now + 1.85);
      this.crowdGain.gain.linearRampToValueAtTime(0.048, now + 3.5);

      this.crowdFilter.frequency.cancelScheduledValues(now);
      this.crowdFilter.frequency.setValueAtTime(this.crowdFilter.frequency.value, now);
      this.crowdFilter.frequency.linearRampToValueAtTime(1450, now + 0.25);
      this.crowdFilter.frequency.linearRampToValueAtTime(540, now + 3.4);

      if (this.crowdLowGain) {
        this.crowdLowGain.gain.cancelScheduledValues(now);
        this.crowdLowGain.gain.setValueAtTime(this.crowdLowGain.gain.value, now);
        this.crowdLowGain.gain.linearRampToValueAtTime(0.13, now + 0.25);
        this.crowdLowGain.gain.linearRampToValueAtTime(0.032, now + 3.4);
      }

      this.triggerApplauseBurst(2.1, 0.085);
    }
  }

  private triggerVocalCrowdSwell(
    startFreq: number,
    midFreq: number,
    endFreq: number,
    duration: number,
    peakGain: number,
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const buffer = this.createCrowdNoiseBuffer(this.ctx.sampleRate, duration + 0.1, 0.08);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const formant = this.ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.Q.value = 3.2;
    formant.frequency.setValueAtTime(startFreq, now);
    formant.frequency.linearRampToValueAtTime(midFreq, now + duration * 0.35);
    formant.frequency.linearRampToValueAtTime(endFreq, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + duration * 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(formant);
    formant.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + duration + 0.05);
  }

  private triggerApplauseBurst(duration: number, peakGain: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Rapid stochastic clap modulation envelope
    for (let i = 0; i < length; i++) {
      const t = i / this.ctx.sampleRate;
      const env = Math.sin(Math.min(1, t / 0.15) * (Math.PI / 2)) * (1 - t / duration);
      const clapDensity = 0.45 + 0.55 * Math.abs(Math.sin(t * 48) * Math.cos(t * 31));
      data[i] = (Math.random() * 2 - 1) * env * clapDensity;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1850;
    filter.Q.value = 0.9;

    const gain = this.ctx.createGain();
    gain.gain.value = peakGain;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
  }

  public playCommentary(event: CommentaryEvent, context?: CommentaryContext): string | null {
    if (!this.enabled || !this.commentatorEnabled) return null;
    this.unlock();

    // Gently duck crowd briefly on non-goal commentary for broadcast clarity
    if (this.ctx && this.crowdGain && event !== 'goal') {
      const now = this.ctx.currentTime;
      const cur = this.crowdGain.gain.value;
      this.crowdGain.gain.setTargetAtTime(Math.max(0.032, cur * 0.72), now, 0.08);
      this.crowdGain.gain.setTargetAtTime(0.048, now + 1.35, 0.35);
    }

    return this.commentator.trigger(event, this.ctx, context);
  }

  public cancelCommentary(): void {
    this.commentator.cancel();
  }

  public playKick(power = 0.6): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const baseFreq = 135 + power * 55;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);

    gain.gain.setValueAtTime(0.28 + power * 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playBounce(intensity = 0.4): void {
    if (!this.enabled || intensity < 0.08) return;
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(105, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.07);

    gain.gain.setValueAtTime(Math.min(0.22, intensity * 0.25), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playPostClang(): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const freqs = [440, 685, 1020];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.16 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.46);
    });
  }

  public playTackle(): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const length = Math.floor(this.ctx.sampleRate * 0.18);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.18);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
  }

  public playWhistle(kind: 'short' | 'kickoff' | 'fulltime' = 'short'): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    const blast = (delay: number, dur: number) => {
      if (!this.ctx || !this.masterGain) return;
      const start = this.ctx.currentTime + delay;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(2720, start);
      osc2.frequency.setValueAtTime(2910, start);

      lfo.frequency.setValueAtTime(38, start);
      lfoGain.gain.setValueAtTime(65, start);
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
      gain.gain.setValueAtTime(0.14, start + dur - 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGain);

      osc1.start(start);
      osc2.start(start);
      lfo.start(start);
      osc1.stop(start + dur + 0.02);
      osc2.stop(start + dur + 0.02);
      lfo.stop(start + dur + 0.02);
    };

    if (kind === 'short') {
      blast(0, 0.24);
    } else if (kind === 'kickoff') {
      blast(0, 0.42);
    } else {
      blast(0, 0.24);
      blast(0.32, 0.24);
      blast(0.64, 0.56);
    }
  }

  public playGoalCelebration(): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    this.reactCrowd('goal', 1);

    // Stadium horn chord
    const notes = [220, 277.18, 329.63];
    notes.forEach((freq) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + 0.08);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 950;
      gain.gain.setValueAtTime(0.001, now + 0.08);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + 0.08);
      osc.stop(now + 1.2);
    });
  }

  public playUiClick(): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.05);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public dispose(): void {
    this.commentator.dispose();
    try {
      this.crowdSource?.stop();
    } catch {
      // ignore
    }
    try {
      this.crowdLowSource?.stop();
    } catch {
      // ignore
    }
    try {
      this.crowdLfo?.stop();
    } catch {
      // ignore
    }
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.masterGain = null;
    this.crowdSource = null;
    this.crowdGain = null;
    this.crowdFilter = null;
    this.crowdLowSource = null;
    this.crowdLowGain = null;
    this.crowdLfo = null;
    this.crowdLfoGain = null;
  }
}
