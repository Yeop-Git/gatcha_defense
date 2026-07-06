import { bus } from '../core/events';
import { playSfx } from '../audio/Sfx';
import { CAPTURE_CARD_ID } from '../data/constants';

/**
 * 첫 모험 온보딩 튜토리얼 — 스포트라이트 마스킹 + 애니메이션 코치마크.
 *
 * 원칙:
 *  - 스포트라이트 마스킹: 화면 전체를 어둡게 덮되, 지금 조작할 대상(손패/버튼 등)만 "구멍"으로 밝게 뚫어
 *    시선을 그 조작에 집중시킨다. 오버레이는 pointer-events:none이라 실제 조작은 그대로 가능(논블로킹).
 *  - 애니메이션 강조: 구멍 둘레에 펄스 링 + 흔들리는 손가락 👉 아이콘으로 "여길 이렇게" 를 각인.
 *  - 이벤트 주도: 단계 전환은 게임 버스 이벤트로만(직접 참조 최소화). 대상 위치는 rAF로 매 프레임 추적
 *    (손패가 매 틱 재렌더/리플로우돼도 구멍이 정확히 따라붙는다).
 *  - 1회성: 완료/승리/건너뛰기 시 localStorage에 영속. 타이틀로 나가면 취소하고 다음 새 모험에서 재무장.
 */

const KEY = 'catch-suhoping-tutorial-v2';

/**
 * 코치용 카툰 손 SVG. viewBox 1:1(44×62)로 렌더해 좌표=픽셀 — 손끝(fingertip)이 (19.5, 4).
 * CSS에서 transform-origin을 손끝에 두고 translate(-19.5,-4)로 앵커링하므로,
 * #tut-hand 의 left/top = "손끝이 닿을 화면 지점"이 된다(눌림 scale도 손끝 기준으로 커진다/작아진다).
 */
const HAND_SVG = `<svg viewBox="0 0 44 62" width="44" height="62" aria-hidden="true">
  <g stroke="#6E4327" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" fill="#F6D6A6">
    <rect x="15" y="4" width="9" height="30" rx="4.5"/>
    <rect x="12" y="24" width="26" height="28" rx="12"/>
    <path d="M13 34 q-8 0 -8.5 7 q0 6 8 5.5" fill="#F6D6A6"/>
    <path d="M12 48 h26 v6 a5 5 0 0 1 -5 5 h-16 a5 5 0 0 1 -5 -5 z" fill="#D8A93B"/>
  </g>
</svg>`;

type Step = 'idle' | 'place' | 'startwave' | 'skill' | 'capture' | 'done';
/** 진행 순서 보장용 랭크 — 뒤 단계 이벤트만 전진시킨다(중복/역행 무시). */
const RANK: Record<Step, number> = { idle: 0, place: 1, startwave: 2, skill: 3, capture: 4, done: 5 };

interface StepDef {
  no: string;
  title: string;
  body: string;
  /** 스포트라이트로 뚫을 대상 CSS 선택자. null이면 마스킹 없이 화면 중앙 안내. */
  target: string | null;
  /** 말풍선을 대상 기준 어디에 둘지. */
  place: 'above' | 'below' | 'center';
  /** 손가락 제스처: 'tap'=대상을 톡톡(버튼), 'drag'=대상을 잡아 목적지로 끌기. */
  motion: 'tap' | 'drag';
  /** drag일 때 끌고 갈 목적지. 'field'=전장 중앙, 'enemy'=실제 포획 대상 적. */
  dest?: 'field' | 'enemy';
}

/**
 * 4단계(+한 줄 마무리). 각 단계는 서로 다른 대상을 스포트라이트해 "무엇을 만질지"가 명확하다.
 *  - place    : 배치 셸프의 유닛 카드(튜토리얼에선 자동 배치를 꺼서 실제로 배치가 필요하다)
 *  - startwave: [웨이브 시작] 버튼(#begin-cta)
 *  - skill    : 스킬 카드(포획구 제외) — 드래그 앤 드롭으로 '사용'(공격 스킬만 있는 게 아니라 사용으로 설명)
 *  - capture  : 반짝이는 포획구 카드(.card.pinned) — 구멍이 이 카드로 이동해 단계가 시각적으로 구분된다.
 * target 선택자가 아직 없으면 reposition()이 #card-shelf로 폴백한다.
 */
const STEPS: Record<Exclude<Step, 'idle'>, StepDef> = {
  place: {
    no: 'STEP 1 / 4',
    title: '① 원정대 배치',
    target: '#card-shelf .unit-card',
    place: 'above',
    motion: 'drag',
    dest: 'field',
    body: '아래 몬스터 카드를 <b>전장으로 드래그</b>해 배치하세요.',
  },
  startwave: {
    no: 'STEP 2 / 4',
    title: '② 웨이브 시작',
    target: '#begin-cta',
    place: 'above',
    motion: 'tap',
    body: '배치를 마쳤으면 <b>[웨이브 시작]</b>을 눌러 적을 맞이하세요.',
  },
  skill: {
    no: 'STEP 3 / 4',
    title: '③ 스킬 사용',
    target: '#card-shelf .card:not(.pinned)',
    place: 'above',
    motion: 'drag',
    dest: 'field',
    body: '스킬 카드를 <b>전장으로 드래그</b>해 사용하세요 (마나 💧 소모).',
  },
  capture: {
    no: 'STEP 4 / 4',
    title: '④ 적을 포획',
    target: '#card-shelf .card.pinned',
    place: 'above',
    motion: 'drag',
    dest: 'enemy',
    body: '빛나는 포획구를 <b>적에게 드래그</b>하면 원정대로 포획!',
  },
  done: {
    no: '',
    title: '🎉 준비 완료!',
    target: null,
    place: 'center',
    motion: 'tap',
    body: '이제 성을 지켜 <b>스테이지 10</b>까지 나아가세요. 행운을 빕니다!',
  },
};

export class Tutorial {
  private overlay: HTMLElement | null = null;
  private hole: HTMLElement | null = null;
  private ring: HTMLElement | null = null;
  private hand: HTMLElement | null = null;
  private pathEl: SVGElement | null = null;
  private destEl: HTMLElement | null = null;
  private bubble: HTMLElement | null = null;
  private step: Step = 'idle';
  private active = false;
  private curTarget: string | null = null;
  private curPlace: StepDef['place'] = 'center';
  private motion: StepDef['motion'] = 'tap';
  private dest: StepDef['dest'] = undefined;
  private dragStart = 0;
  private raf = 0;
  private offs: Array<() => void> = [];
  /** 포획 단계에서 '실제 포획 대상' 적의 화면 좌표를 돌려주는 콜백(Game이 주입). 없으면 전장 중앙으로 폴백. */
  private enemyAt: (() => { x: number; y: number } | null) | null = null;

  constructor(private root: HTMLElement) {}

  /** 실제 드래그 대상(적) 화면 좌표 공급기 등록 — 손가락 유도를 살아있는 적에게 정확히 겨눈다. */
  setEnemyLocator(fn: () => { x: number; y: number } | null): void {
    this.enemyAt = fn;
  }

  /** 전투 힌트 토스트 중복 방지용 — Game이 조회한다. */
  get isActive(): boolean {
    return this.active;
  }

  private static isDone(): boolean {
    try { return localStorage.getItem(KEY) === 'done'; } catch { return false; }
  }
  private static persistDone(): void {
    try { localStorage.setItem(KEY, 'done'); } catch { /* noop */ }
  }
  /** 설정 '튜토리얼 다시 보기'용 — 완료 플래그 제거(다음 새 모험에서 재생). */
  static clearProgress(): void {
    try { localStorage.removeItem(KEY); } catch { /* noop */ }
  }

  /** 새 모험 시작 시 호출 — 아직 완료 전이면 무장(버스 구독). */
  maybeStart(): void {
    if (this.active || Tutorial.isDone()) return;
    this.active = true;
    this.step = 'idle';
    this.offs.push(bus.on('stage:start', () => this.advanceTo('place')));
    // 유닛을 실제로 배치하면 → '웨이브 시작' 안내로.
    this.offs.push(bus.on('unit:placed', () => this.advanceTo('startwave')));
    // 웨이브가 시작되면 → 스킬 사용 안내로.
    this.offs.push(bus.on('wave:start', () => this.advanceTo('skill')));
    // 포획 단계는 '스킬 카드(포획구 제외)를 처음 썼을 때' 넘어간다.
    this.offs.push(bus.on('card:played', (e) => {
      if ((e as { id?: string } | undefined)?.id !== CAPTURE_CARD_ID) this.advanceTo('capture');
    }));
    // 포획을 '한 번' 성공하면 즉시 완료. (웨이브를 통째로 클리어해도 폴백으로 완료.)
    this.offs.push(bus.on('capture:success', () => this.advanceTo('done')));
    this.offs.push(bus.on('wave:clear', () => this.advanceTo('done')));
  }

  /** 현재 단계보다 뒤일 때만 전진(같거나 앞선 이벤트는 무시). */
  private advanceTo(step: Exclude<Step, 'idle'>): void {
    if (!this.active || RANK[step] <= RANK[this.step]) return;
    this.step = step;
    this.render(STEPS[step]);
  }

  private ensureDom(): void {
    if (this.overlay) return;
    this.overlay = document.createElement('div');
    this.overlay.id = 'tut-overlay';
    // 손가락은 이모지 대신 인라인 SVG(카툰 손) — 손끝(fingertip)이 정확히 조작 지점에 닿도록 앵커링.
    // #tut-path: 카드→목적지 점선 화살 궤적, #tut-dest: 목적지 펄스 링(어디에 놓을지 명시).
    this.overlay.innerHTML = `
      <div id="tut-hole"></div>
      <div id="tut-ring"></div>
      <svg id="tut-path" aria-hidden="true"><path d=""/></svg>
      <div id="tut-dest"></div>
      <div id="tut-hand">${HAND_SVG}</div>
      <div id="tut-bubble"></div>`;
    this.root.appendChild(this.overlay);
    this.hole = this.overlay.querySelector('#tut-hole');
    this.ring = this.overlay.querySelector('#tut-ring');
    this.pathEl = this.overlay.querySelector('#tut-path');
    this.destEl = this.overlay.querySelector('#tut-dest');
    this.hand = this.overlay.querySelector('#tut-hand');
    this.bubble = this.overlay.querySelector('#tut-bubble');
  }

  private render(def: StepDef): void {
    this.ensureDom();
    this.curTarget = def.target;
    this.curPlace = def.place;
    this.motion = def.motion;
    this.dest = def.dest;
    this.dragStart = performance.now(); // 제스처 사이클 시작점(손끝이 카드를 잡는 순간)
    this.overlay!.classList.add('on');
    this.overlay!.classList.toggle('spotlight', !!def.target);

    const action =
      def.target === null
        ? '<button class="btn primary" id="tut-ok">시작하기</button>'
        : '<button class="tut-skip" id="tut-skip">튜토리얼 건너뛰기</button>';
    this.bubble!.innerHTML = `
      <div class="tut-step-no">${def.no}</div>
      <div class="tut-title">${def.title}</div>
      <div class="tut-body">${def.body}</div>
      <div class="tut-actions">${action}</div>`;

    const ok = this.bubble!.querySelector('#tut-ok') as HTMLButtonElement | null;
    if (ok) ok.onclick = () => { playSfx('click'); this.finish(true); };
    const skip = this.bubble!.querySelector('#tut-skip') as HTMLButtonElement | null;
    if (skip) skip.onclick = () => { playSfx('click'); this.finish(true); };

    // 등장 애니메이션 재시작(리플로우 강제).
    this.bubble!.classList.remove('pop');
    void this.bubble!.offsetWidth;
    this.bubble!.classList.add('pop');
    playSfx('select');

    // 대상 추적 시작(rAF). 중앙 안내(done)는 추적 불필요.
    this.reposition();
    if (def.target) this.startTracking();
    else this.stopTracking();
  }

  private startTracking(): void {
    if (this.raf) return;
    const loop = () => {
      this.reposition();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  private stopTracking(): void {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  /** 대상 요소의 화면 사각형을 읽어 구멍/링/손가락/말풍선을 배치. */
  private reposition(): void {
    if (!this.overlay) return;
    let target = this.curTarget ? (document.querySelector(this.curTarget) as HTMLElement | null) : null;
    let r = target?.getBoundingClientRect();
    // 지정한 카드가 아직 손패에 없거나 크기가 0이면(재드로우·쿨다운 등) 카드 선반으로 폴백 —
    // 구멍이 갑자기 사라지거나 구석에 튀지 않고 항상 조작 영역을 비춘다.
    if (this.curTarget && this.curPlace !== 'center' && (!target || !r || r.width < 8 || r.height < 8)) {
      target = document.querySelector('#card-shelf') as HTMLElement | null;
      r = target?.getBoundingClientRect();
    }
    // 여전히 대상이 없거나(중앙 안내) 크기가 0이면 → 구멍 없이 화면 중앙 안내로 폴백.
    if (!target || !r || this.curPlace === 'center' || r.width < 8 || r.height < 8) {
      this.overlay.classList.remove('spotlight');
      if (this.pathEl) this.pathEl.style.display = 'none';
      if (this.destEl) this.destEl.style.display = 'none';
      if (this.bubble) { this.bubble.style.left = '50%'; this.bubble.style.top = '50%'; this.bubble.style.transform = 'translate(-50%, -50%)'; }
      return;
    }
    this.overlay.classList.add('spotlight');
    const pad = 8;
    const x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, h = r.height + pad * 2;
    if (this.hole) {
      this.hole.style.left = `${x}px`; this.hole.style.top = `${y}px`;
      this.hole.style.width = `${w}px`; this.hole.style.height = `${h}px`;
    }
    if (this.ring) {
      this.ring.style.left = `${x}px`; this.ring.style.top = `${y}px`;
      this.ring.style.width = `${w}px`; this.ring.style.height = `${h}px`;
    }
    // 손가락 제스처: tap(버튼 톡톡) 또는 drag(카드→목적지 끌기). 목적지 링/궤적도 함께 그린다.
    this.updateGesture(r);
    // 말풍선: 대상 위/아래 중 공간이 있는 쪽. 손패는 화면 하단이라 기본 above.
    if (this.bubble) {
      const bw = this.bubble.offsetWidth || 320;
      const bh = this.bubble.offsetHeight || 150;
      let bx = r.left + r.width / 2 - bw / 2;
      bx = Math.max(12, Math.min(bx, window.innerWidth - bw - 12));
      let by = this.curPlace === 'below' ? r.bottom + 22 : y - bh - 22;
      by = Math.max(12, Math.min(by, window.innerHeight - bh - 12));
      this.bubble.style.left = `${bx}px`;
      this.bubble.style.top = `${by}px`;
      this.bubble.style.transform = 'none';
    }
  }

  /** 손끝을 (x, y)에 앵커링하고 눌림 세기(scale)로 배치. transform-origin(손끝)은 CSS가 고정. */
  private placeHand(x: number, y: number, scale: number): void {
    if (!this.hand) return;
    this.hand.style.left = `${x}px`;
    this.hand.style.top = `${y}px`;
    this.hand.style.transform = `translate(-19.5px, -4px) rotate(-8deg) scale(${scale.toFixed(3)})`;
  }

  /** drag 목적지 화면 좌표. enemy면 실제 적, 없으면 전장 중앙으로 폴백. 항상 손패보다 위로 클램프. */
  private resolveDest(src: DOMRect): { x: number; y: number } {
    let d: { x: number; y: number } | null = null;
    if (this.dest === 'enemy' && this.enemyAt) d = this.enemyAt();
    if (!d) {
      const cv = document.querySelector('canvas');
      const cr = cv?.getBoundingClientRect();
      d = cr && cr.width > 8
        ? { x: cr.left + cr.width * 0.5, y: cr.top + cr.height * 0.44 }
        : { x: window.innerWidth * 0.5, y: window.innerHeight * 0.42 };
    }
    const m = 44;
    return {
      x: Math.max(m, Math.min(window.innerWidth - m, d.x)),
      y: Math.max(m, Math.min(src.top - 28, d.y)), // 목적지는 늘 카드(손패) 위쪽
    };
  }

  private easeOut(t: number): number { return 1 - (1 - t) * (1 - t); }
  private easeInOut(t: number): number { return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2; }

  /**
   * 손끝 제스처를 매 프레임 갱신.
   *  - tap : 대상(버튼) 위에서 위아래로 흔들다 살짝 눌러 톡톡.
   *  - drag: [잡기(눌림)] → [목적지로 미끄러짐] → [놓기(들림)] → [사라졌다 카드로 복귀] 를 반복.
   *          동시에 카드→목적지 점선 궤적과 목적지 펄스 링을 그려 "여기서 저기로" 를 각인한다.
   */
  private updateGesture(r: DOMRect): void {
    if (!this.hand) return;
    const now = performance.now();

    if (this.motion === 'tap') {
      if (this.pathEl) this.pathEl.style.display = 'none';
      if (this.destEl) this.destEl.style.display = 'none';
      const p = ((now - this.dragStart) % 1100) / 1100;
      const bob = Math.sin(p * Math.PI * 2) * 6;
      const press = p > 0.44 && p < 0.6 ? 0.86 : 1; // 짧은 탭 눌림
      this.placeHand(r.left + r.width / 2, r.top - 8 + bob, press);
      this.hand.style.opacity = '1';
      return;
    }

    // ── drag ──
    const src = { x: r.left + r.width / 2, y: r.top + r.height * 0.36 };
    const dst = this.resolveDest(r);
    const CYCLE = 2200;
    const p = ((now - this.dragStart) % CYCLE) / CYCLE;

    let hx: number, hy: number, scale: number, op: number;
    if (p < 0.14) {                 // 카드를 잡으며 눌러 내림
      const q = p / 0.14;
      hx = src.x; hy = src.y; scale = 1 - 0.18 * this.easeOut(q); op = Math.min(1, 0.3 + q);
    } else if (p < 0.66) {          // 목적지로 미끄러짐(끌기)
      const e = this.easeInOut((p - 0.14) / 0.52);
      hx = src.x + (dst.x - src.x) * e;
      hy = src.y + (dst.y - src.y) * e;
      scale = 0.82; op = 1;
    } else if (p < 0.82) {          // 목적지에서 놓으며 들어올림
      const q = (p - 0.66) / 0.16;
      hx = dst.x; hy = dst.y; scale = 0.82 + 0.18 * this.easeOut(q); op = 1;
    } else {                        // 사라졌다가 다음 사이클에 카드로 복귀
      hx = dst.x; hy = dst.y; scale = 1; op = 1 - (p - 0.82) / 0.18;
    }
    this.placeHand(hx, hy, scale);
    this.hand.style.opacity = op.toFixed(3);

    // 카드→목적지 아치형 점선 궤적
    if (this.pathEl) {
      this.pathEl.style.display = 'block';
      const midx = (src.x + dst.x) / 2;
      const lift = Math.min(90, Math.hypot(dst.x - src.x, dst.y - src.y) * 0.28);
      const midy = (src.y + dst.y) / 2 - lift;
      (this.pathEl.firstElementChild as SVGPathElement).setAttribute(
        'd', `M ${src.x.toFixed(1)} ${src.y.toFixed(1)} Q ${midx.toFixed(1)} ${midy.toFixed(1)} ${dst.x.toFixed(1)} ${dst.y.toFixed(1)}`,
      );
    }
    // 목적지 펄스 링(어디에 놓을지)
    if (this.destEl) {
      this.destEl.style.display = 'block';
      this.destEl.style.left = `${dst.x}px`;
      this.destEl.style.top = `${dst.y}px`;
    }
  }

  /** 튜토리얼 종료. persist=true면 완료로 기록(재무장 안 함). */
  finish(persist: boolean): void {
    if (!this.active) return;
    this.active = false;
    this.step = 'idle';
    this.stopTracking();
    for (const off of this.offs) off();
    this.offs = [];
    if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    this.hole = this.ring = this.hand = this.bubble = null;
    this.pathEl = this.destEl = null;
    if (persist) Tutorial.persistDone();
  }

  /** 타이틀 이탈 등: 완료로 기록하지 않고 취소 → 다음 새 모험에서 다시 무장. */
  cancel(): void {
    this.finish(false);
  }
}
