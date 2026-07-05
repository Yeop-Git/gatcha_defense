import { settings } from '../core/Settings';

/**
 * 경량 효과음 — Web Audio API로 즉석 합성(오디오 에셋 0). 오실레이터+게인 엔벨로프.
 * settings.sfx / settings.volume 을 존중. 브라우저 자동재생 정책상 첫 사용자 입력에서 컨텍스트 resume.
 */

type Ctx = AudioContext;
let ctx: Ctx | null = null;

function ac(): Ctx | null {
  if (ctx) return ctx;
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

/** 첫 포인터/키 입력에서 오디오 컨텍스트 잠금 해제(정책 대응). main에서 1회 호출. */
export function initAudioUnlock(): void {
  const resume = (): void => { ac()?.resume(); };
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
}

/** 단일 톤: 주파수 슬라이드 + 지수 감쇠 엔벨로프. */
function tone(opts: { freq: number; to?: number; dur: number; type?: OscillatorType; gain?: number; delay?: number }): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.dur);
  const peak = (opts.gain ?? 0.25) * settings.volume;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.min(0.02, opts.dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

/** 짧은 노이즈 버스트(타격/폭발감). */
function noise(dur: number, gain = 0.2, hp = 800): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain * settings.volume;
  const filt = c.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = hp;
  src.connect(filt);
  filt.connect(g);
  g.connect(c.destination);
  src.start(t0);
}

export type SfxName =
  | 'click' | 'card' | 'attack' | 'hit' | 'capture' | 'captureFail'
  | 'evolve' | 'levelup' | 'gain' | 'lose' | 'win' | 'coin' | 'error'
  | 'wave' | 'leak' | 'select';

/**
 * 효과음 재생. settings.sfx=false면 무음.
 * opts.pitch: 주파수 배율(카드 속성별 살짝 차별화 등). opts.vary: 소폭 랜덤 피치(반복음 단조로움 완화).
 */
export function playSfx(name: SfxName, opts?: { pitch?: number; vary?: number }): void {
  if (!settings.sfx || settings.volume <= 0) return;
  const vary = opts?.vary ? 1 + (Math.random() * 2 - 1) * opts.vary : 1;
  const p = (opts?.pitch ?? 1) * vary;
  // pitch를 적용해 tone을 감싸는 헬퍼 (멜로디성 효과음에만 사용).
  const t = (o: Parameters<typeof tone>[0]): void => tone({ ...o, freq: o.freq * p, to: o.to !== undefined ? o.to * p : undefined });
  switch (name) {
    case 'click': t({ freq: 420, to: 520, dur: 0.06, type: 'triangle', gain: 0.14 }); break;
    case 'select': t({ freq: 620, to: 760, dur: 0.07, type: 'triangle', gain: 0.16 }); break;
    // 카드 시전: 짧은 하강음 + 반짝임. pitch로 속성별 음색 차별화.
    case 'card': t({ freq: 320, to: 210, dur: 0.1, type: 'sawtooth', gain: 0.12 }); t({ freq: 720, dur: 0.08, type: 'triangle', gain: 0.06, delay: 0.02 }); noise(0.05, 0.05, 1200); break;
    case 'attack': t({ freq: 520, to: 900, dur: 0.08, type: 'square', gain: 0.08 }); break;
    case 'hit': noise(0.08, 0.16, 600); t({ freq: 180, to: 90, dur: 0.09, type: 'square', gain: 0.1 }); break;
    case 'capture': t({ freq: 660, to: 990, dur: 0.14, type: 'sine', gain: 0.18 }); t({ freq: 880, to: 1320, dur: 0.18, type: 'sine', gain: 0.12, delay: 0.08 }); break;
    case 'captureFail': t({ freq: 300, to: 140, dur: 0.22, type: 'sawtooth', gain: 0.16 }); break;
    // 진화: 상승 아르페지오 + 낮은 루트음으로 무게감.
    case 'evolve':
      tone({ freq: 131, dur: 0.6, type: 'sine', gain: 0.1 });
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.24, type: 'triangle', gain: 0.15, delay: i * 0.09 }));
      break;
    case 'levelup': [523, 784].forEach((f, i) => tone({ freq: f, to: f * 1.5, dur: 0.16, type: 'triangle', gain: 0.16, delay: i * 0.08 })); break;
    case 'gain': tone({ freq: 700, to: 1050, dur: 0.14, type: 'triangle', gain: 0.16 }); break;
    case 'coin': tone({ freq: 988, dur: 0.06, type: 'square', gain: 0.14 }); tone({ freq: 1319, dur: 0.1, type: 'square', gain: 0.12, delay: 0.06 }); break;
    case 'wave': tone({ freq: 220, to: 330, dur: 0.3, type: 'sawtooth', gain: 0.14 }); break;
    case 'leak': noise(0.18, 0.2, 300); tone({ freq: 140, to: 70, dur: 0.2, type: 'square', gain: 0.14 }); break;
    case 'error': tone({ freq: 200, to: 160, dur: 0.14, type: 'square', gain: 0.14 }); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.18, delay: i * 0.18 })); break;
    // 승리: 팡파르 + 상단 옥타브 반짝임 마무리.
    case 'win':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.28, type: 'triangle', gain: 0.18, delay: i * 0.12 }));
      [1568, 2093].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'sine', gain: 0.1, delay: 0.6 + i * 0.1 }));
      break;
  }
}
