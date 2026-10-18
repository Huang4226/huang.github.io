/**
 * 极简音效：用 WebAudio 现场合成，不引入任何音频文件（保持发布包为零额外素材）。
 * 浏览器要求首次用户手势后才能出声，所以第一次点击时调 unlock()。
 */
export type SoundKind = 'move' | 'capture' | 'check' | 'win';

const STORAGE_KEY = 'srxq.sound';

export class Sound {
  private ctx: AudioContext | null = null;
  enabled: boolean;

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    this.enabled = saved !== 'off';
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off');
    } catch {
      /* 隐私模式下忽略 */
    }
    if (this.enabled) this.unlock();
    return this.enabled;
  }

  play(kind: SoundKind): void {
    if (!this.enabled) return;
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    switch (kind) {
      case 'move':
        this.blip(540, 430, 0.09, 'sine', 0.07);
        break;
      case 'capture':
        this.blip(300, 120, 0.16, 'square', 0.06);
        this.blip(180, 90, 0.2, 'triangle', 0.05, 0.02);
        break;
      case 'check':
        this.blip(760, 760, 0.1, 'triangle', 0.07);
        this.blip(980, 980, 0.12, 'triangle', 0.07, 0.1);
        break;
      case 'win':
        this.blip(520, 520, 0.12, 'sine', 0.07);
        this.blip(660, 660, 0.12, 'sine', 0.07, 0.12);
        this.blip(880, 880, 0.22, 'sine', 0.07, 0.24);
        break;
      default:
        break;
    }
  }

  private blip(
    startFreq: number,
    endFreq: number,
    dur: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}
