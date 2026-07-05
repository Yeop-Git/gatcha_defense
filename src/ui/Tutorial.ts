import { bus } from '../core/events';
import { playSfx } from '../audio/Sfx';

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

type Step = 'idle' | 'place' | 'defend' | 'capture' | 'done';
/** 진행 순서 보장용 랭크 — 뒤 단계 이벤트만 전진시킨다(중복/역행 무시). */
const RANK: Record<Step, number> = { idle: 0, place: 1, defend: 2, capture: 3, done: 4 };

interface StepDef {
  no: string;
  title: string;
  body: string;
  /** 스포트라이트로 뚫을 대상 CSS 선택자. null이면 마스킹 없이 화면 중앙 안내. */
  target: string | null;
  /** 말풍선을 대상 기준 어디에 둘지. */
  place: 'above' | 'below' | 'center';
}

const STEPS: Record<Exclude<Step, 'idle'>, StepDef> = {
  place: {
    no: 'STEP 1 / 4',
    title: '① 원정대 배치',
    target: '#card-shelf',
    place: 'above',
    body: '아래 <b>몬스터 카드</b>를 <b>전장 위로 드래그</b>해 자리를 잡으세요.<br/>배치를 마치면 <b>[웨이브 시작]</b> 버튼을 눌러 적을 맞이합니다.',
  },
  defend: {
    no: 'STEP 2 / 4',
    title: '② 스킬 카드로 방어',
    target: '#card-shelf',
    place: 'above',
    body: '적이 몰려옵니다! <b>스킬 카드를 탭하거나 전장으로 드래그</b>해 공격하세요.<br/>왼쪽 <b>마나 💧</b>를 소모하며, 시간이 지나면 저절로 회복됩니다.',
  },
  capture: {
    no: 'STEP 3 / 4',
    title: '③ 적을 포획',
    target: '#card-shelf',
    place: 'above',
    body: '빛나는 <b>포획구 카드를 적에게 드래그</b>하면 포획!<br/>포획한 몬스터는 <b>원정대에 합류</b>해 함께 성장합니다.',
  },
  done: {
    no: '',
    title: '🎉 준비 완료!',
    target: null,
    place: 'center',
    body: '속성을 <b>섞어</b> 쓰면 표식이 겹쳐 <b>반응(시너지)</b>이 터집니다 — 예) 젖음💧+화상🔥=증기폭발💨!<br/>레벨업·진화·포획으로 원정대를 키워 <b>스테이지 10 최종보스</b>까지 나아가세요. 행운을 빕니다!',
  },
};

export class Tutorial {
  private overlay: HTMLElement | null = null;
  private hole: HTMLElement | null = null;
  private ring: HTMLElement | null = null;
  private hand: HTMLElement | null = null;
  private bubble: HTMLElement | null = null;
  private step: Step = 'idle';
  private active = false;
  private curTarget: string | null = null;
  private curPlace: StepDef['place'] = 'center';
  private raf = 0;
  private offs: Array<() => void> = [];

  constructor(private root: HTMLElement) {}

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
    this.offs.push(bus.on('wave:start', () => this.advanceTo('defend')));
    this.offs.push(bus.on('card:played', () => this.advanceTo('capture')));
    // 카드를 한 장도 쓰지 않고 웨이브를 넘겨도 완료되도록 wave:clear는 done으로 마무리.
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
    this.overlay.innerHTML = `
      <div id="tut-hole"></div>
      <div id="tut-ring"></div>
      <div id="tut-hand">👆</div>
      <div id="tut-bubble"></div>`;
    this.root.appendChild(this.overlay);
    this.hole = this.overlay.querySelector('#tut-hole');
    this.ring = this.overlay.querySelector('#tut-ring');
    this.hand = this.overlay.querySelector('#tut-hand');
    this.bubble = this.overlay.querySelector('#tut-bubble');
  }

  private render(def: StepDef): void {
    this.ensureDom();
    this.curTarget = def.target;
    this.curPlace = def.place;
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
    const target = this.curTarget ? (document.querySelector(this.curTarget) as HTMLElement | null) : null;
    const r = target?.getBoundingClientRect();
    // 대상이 없거나(중앙 안내) 아직 레이아웃 전이라 크기가 0이면 → 구멍 없이 화면 중앙 안내로 폴백.
    // (게임 루프가 손패를 그리기 전 잠깐, 구멍이 구석에 작게 튀는 현상 방지)
    if (!target || !r || this.curPlace === 'center' || r.width < 8 || r.height < 8) {
      this.overlay.classList.remove('spotlight');
      if (this.bubble) { this.bubble.style.left = '50%'; this.bubble.style.top = '50%'; this.bubble.style.transform = 'translate(-50%, -50%)'; }
      return;
    }
    this.overlay.classList.add('spotlight');
    const pad = 10;
    const x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, h = r.height + pad * 2;
    if (this.hole) {
      this.hole.style.left = `${x}px`; this.hole.style.top = `${y}px`;
      this.hole.style.width = `${w}px`; this.hole.style.height = `${h}px`;
    }
    if (this.ring) {
      this.ring.style.left = `${x}px`; this.ring.style.top = `${y}px`;
      this.ring.style.width = `${w}px`; this.ring.style.height = `${h}px`;
    }
    // 손가락: 대상 위쪽 가운데에서 톡톡.
    if (this.hand) {
      this.hand.style.left = `${r.left + r.width / 2}px`;
      this.hand.style.top = `${y - 6}px`;
    }
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
    if (persist) Tutorial.persistDone();
  }

  /** 타이틀 이탈 등: 완료로 기록하지 않고 취소 → 다음 새 모험에서 다시 무장. */
  cancel(): void {
    this.finish(false);
  }
}
