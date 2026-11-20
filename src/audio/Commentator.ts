export type CommentaryEvent =
  | 'kickoff'
  | 'goal'
  | 'save'
  | 'post'
  | 'close_shot'
  | 'halftime'
  | 'fulltime';

export interface CommentaryContext {
  teamName?: string;
  scorerName?: string;
  intensity?: number;
}

interface PhraseSpec {
  priority: number;
  pitch: number;
  rate: number;
  syllableCount: number;
  excited: boolean;
  phrases: (ctx?: CommentaryContext) => string[];
}

const PHRASE_BANK: Record<CommentaryEvent, PhraseSpec> = {
  kickoff: {
    priority: 1,
    pitch: 1.05,
    rate: 1.08,
    syllableCount: 7,
    excited: false,
    phrases: () => [
      'Começa a partida! Rola a bola no relvado!',
      'Arranca o encontro! Grande ambiente no estádio!',
      'Apito inicial! Tudo a postos para um grande jogo!',
    ],
  },
  goal: {
    priority: 3,
    pitch: 1.2,
    rate: 1.18,
    syllableCount: 9,
    excited: true,
    phrases: (ctx) => {
      const scorer = ctx?.scorerName?.trim();
      const team = ctx?.teamName?.trim();
      const base = [
        'GOLO! Que grande finalização para o fundo das redes!',
        'É GOLO! Remate indefensável! O estádio vai ao rubro!',
        'GOLO! Fantástico momento de futebol!',
      ];
      if (scorer && team) {
        base.unshift(`GOLO! ${scorer} marca para ${team}!`);
        base.push(`GOLO espetacular de ${scorer}!`);
      } else if (scorer) {
        base.unshift(`GOLO! Marca ${scorer}!`);
      }
      return base;
    },
  },
  save: {
    priority: 1,
    pitch: 1.14,
    rate: 1.15,
    syllableCount: 7,
    excited: true,
    phrases: () => [
      'Grande defesa! Que intervenção fantástica do guarda-redes!',
      'Defesa incrível! Evitou o golo com grandes reflexos!',
      'Enorme defesa! Segura o guarda-redes com categoria!',
    ],
  },
  post: {
    priority: 1,
    pitch: 1.15,
    rate: 1.15,
    syllableCount: 6,
    excited: true,
    phrases: () => [
      'Ao poste! Esteve mesmo quase a entrar!',
      'Na barra! Que susto enorme para a defesa!',
      'Bate no ferro! Faltou muito pouco para o golo!',
    ],
  },
  close_shot: {
    priority: 0,
    pitch: 1.1,
    rate: 1.12,
    syllableCount: 5,
    excited: false,
    phrases: () => [
      'Remate forte à baliza!',
      'Que perigo! Disparo potente!',
      'Tenta o remate de primeira!',
    ],
  },
  halftime: {
    priority: 2,
    pitch: 1.02,
    rate: 1.05,
    syllableCount: 7,
    excited: false,
    phrases: () => [
      'Final da primeira parte! As equipas recolhem aos balneários.',
      'Intervalo no estádio! Grande ritmo até agora.',
    ],
  },
  fulltime: {
    priority: 2,
    pitch: 1.06,
    rate: 1.08,
    syllableCount: 7,
    excited: false,
    phrases: () => [
      'Apito final! Termina a partida no estádio!',
      'Fim do jogo! Grande espetáculo de futebol!',
    ],
  },
};

const COOLDOWN_MS = 2300;

export class Commentator {
  private commentatorEnabled = true;
  private soundEnabled = true;
  private volume = 0.75;
  private lastSpokenAt = -Infinity;
  private lastPriority = -1;
  private lastPhraseByEvent = new Map<CommentaryEvent, string>();
  private commentaryGain: GainNode | null = null;
  private onLineCallback?: (line: string, durationMs: number) => void;

  public setOnLineCallback(cb: (line: string, durationMs: number) => void): void {
    this.onLineCallback = cb;
  }

  public setSettings(soundEnabled: boolean, volume: number, commentatorEnabled: boolean): void {
    this.soundEnabled = soundEnabled;
    this.volume = Math.max(0, Math.min(1, volume));
    this.commentatorEnabled = commentatorEnabled;

    if (!this.soundEnabled || !this.commentatorEnabled) {
      this.cancel();
    }
  }

  public attachAudio(ctx: AudioContext, masterGain: GainNode): void {
    if (this.commentaryGain) {
      try {
        this.commentaryGain.disconnect();
      } catch {
        // ignore
      }
    }
    const gain = ctx.createGain();
    gain.gain.value = 0.85;
    gain.connect(masterGain);
    this.commentaryGain = gain;
  }

  public trigger(
    event: CommentaryEvent,
    ctx: AudioContext | null,
    context?: CommentaryContext,
  ): string | null {
    if (!this.soundEnabled || !this.commentatorEnabled) return null;

    const spec = PHRASE_BANK[event];
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedMs = nowMs - this.lastSpokenAt;

    // Cooldown & priority gating: goals always cut through unless triggered twice in < 450ms
    if (event === 'goal') {
      if (elapsedMs < 450 && this.lastPriority === 3) return null;
    } else if (elapsedMs < COOLDOWN_MS) {
      if (spec.priority <= this.lastPriority) {
        return null;
      }
    }

    const candidates = spec.phrases(context);
    const prev = this.lastPhraseByEvent.get(event);
    const filtered = candidates.length > 1 ? candidates.filter((p) => p !== prev) : candidates;
    const phrase = filtered[Math.floor(Math.random() * filtered.length)] ?? candidates[0];
    this.lastPhraseByEvent.set(event, phrase);
    this.lastSpokenAt = nowMs;
    this.lastPriority = spec.priority;

    const displayDurationMs = event === 'goal' ? 3200 : 2500;
    this.onLineCallback?.(phrase, displayDurationMs);

    // 1. Always play Web Audio API broadcast stinger / vocal formant cadence
    if (ctx && this.commentaryGain) {
      this.playBroadcastAudioCue(ctx, this.commentaryGain, event, spec);
    }

    // 2. Spoken Portuguese commentary via Web Speech API when available
    const spokeViaTts = this.speakPortuguese(phrase, spec);

    // 3. Fallback Web Audio API formant vocal phrase synthesis when SpeechSynthesis is unavailable
    if (!spokeViaTts && ctx && this.commentaryGain) {
      this.playFormantCadence(ctx, this.commentaryGain, spec);
    }

    return phrase;
  }

  public cancel(): void {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore speech synthesis restrictions
    }
  }

  private playBroadcastAudioCue(
    ctx: AudioContext,
    dest: GainNode,
    event: CommentaryEvent,
    spec: PhraseSpec,
  ): void {
    const now = ctx.currentTime;

    // Subtle TV broadcast intercom mic chime
    const notes =
      event === 'goal'
        ? [523.25, 659.25, 783.99]
        : event === 'save' || event === 'post'
          ? [493.88, 659.25]
          : [440, 554.37];

    notes.forEach((freq, i) => {
      const t = now + i * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = spec.excited ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t);

      const peak = event === 'goal' ? 0.085 : 0.055;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.21);
    });
  }

  private playFormantCadence(
    ctx: AudioContext,
    dest: GainNode,
    spec: PhraseSpec,
  ): void {
    const now = ctx.currentTime + 0.08;
    const syllables = spec.syllableCount;
    const step = spec.excited ? 0.13 : 0.15;

    // Vowel formant pairs (F1, F2) to simulate warm Portuguese commentator cadence
    const vowelFormants: Array<[number, number]> = [
      [700, 1220], // a
      [480, 1850], // e
      [520, 920],  // o
      [340, 2100], // i
    ];

    for (let i = 0; i < syllables; i++) {
      const start = now + i * step;
      const dur = i === 0 && spec.excited ? 0.22 : step * 0.82;
      const [f1, f2] = vowelFormants[i % vowelFormants.length];

      const glottal = ctx.createOscillator();
      glottal.type = 'sawtooth';
      const basePitch = spec.excited ? 148 : 122;
      const contour = i === 0 && spec.excited ? 1.22 : 1 - (i / syllables) * 0.14;
      glottal.frequency.setValueAtTime(basePitch * contour, start);
      glottal.frequency.linearRampToValueAtTime(basePitch * contour * 0.92, start + dur);

      const filter1 = ctx.createBiquadFilter();
      filter1.type = 'bandpass';
      filter1.frequency.setValueAtTime(f1, start);
      filter1.Q.value = 5.0;

      const filter2 = ctx.createBiquadFilter();
      filter2.type = 'bandpass';
      filter2.frequency.setValueAtTime(f2, start);
      filter2.Q.value = 6.5;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.001, start);
      amp.gain.linearRampToValueAtTime(spec.excited ? 0.075 : 0.055, start + 0.025);
      amp.gain.exponentialRampToValueAtTime(0.001, start + dur);

      glottal.connect(filter1);
      glottal.connect(filter2);
      filter1.connect(amp);
      filter2.connect(amp);
      amp.connect(dest);

      glottal.start(start);
      glottal.stop(start + dur + 0.02);
    }
  }

  private speakPortuguese(phrase: string, spec: PhraseSpec): boolean {
    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      return false;
    }

    try {
      const synth = window.speechSynthesis;
      const voices = synth.getVoices ? synth.getVoices() : [];
      const ptVoice =
        voices.find((v) => v.lang.toLowerCase() === 'pt-pt') ||
        voices.find((v) => v.lang.toLowerCase().startsWith('pt'));

      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.lang = ptVoice?.lang || 'pt-PT';
      if (ptVoice) {
        utterance.voice = ptVoice;
      }
      utterance.pitch = spec.pitch;
      utterance.rate = spec.rate;
      utterance.volume = Math.max(0.1, Math.min(1, this.volume));

      // Cancel lower-priority speech when a new phrase fires
      synth.cancel();
      synth.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  public dispose(): void {
    this.cancel();
    try {
      this.commentaryGain?.disconnect();
    } catch {
      // ignore
    }
    this.commentaryGain = null;
  }
}
