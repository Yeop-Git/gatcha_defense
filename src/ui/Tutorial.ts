import { bus } from '../core/events';
import { playSfx } from '../audio/Sfx';

/**
 * 첫 모험 온보딩 튜토리얼.
 *
 * 원칙:
 *  - 논블로킹 코치마크: 전투를 멈추지 않고 상단에 안내 말풍선을 띄운다(드래프트/포획 등 기존 모달과 충돌 없음).
 *  - 이벤트 주도: 단계 전환은 게임 버스 이벤트로만 진행한다(직접 참조 최소화 원칙).
 *  - 강조는 body 클래스 + CSS로: 손패(#card-shelf)는 매 틱 재렌더되므로 요소에 클래스를 달면 사라진다.
 *    → 강조는 `body.tut-step-*` 스코프 CSS로 처리해 재렌더에도 유지된다.
 *  - 1회성: 완료/승리/건너뛰기 시 localStorage에 영속. 타이틀로 나가면 취소하고 다음 새 모험에서 다시 무장.
 */

const KEY = 'catch-suhoping-tutorial-v1';

type Step = 'idle' | 'placement' | 'cards' | 'capture' | 'done';
/** 진행 순서 보장용 랭크 — 뒤 단계 이벤트만 전진시킨다(중복/역행 무시). */
const RANK: Record<Step, number> = { idle: 0, placement: 1, cards: 2, capture: 3, done: 4 };

interface StepDef {
  no: string;
  title: string;
  body: string;
}

const STEPS: Record<Exclude<Step, 'idle'>, StepDef> = {
  placement: {
    no: 'STEP 1 / 3',
    title: '① 원정대 배치',
    body: '아래 <b>몬스터 카드를 전장으로 드래그</b>해 자리를 잡으세요.<br/>준비되면 <b>[웨이브 시작]</b> 버튼을 누릅니다.',
  },
  cards: {
    no: 'STEP 2 / 3',
    title: '② 스킬 카드로 방어',
    body: '손패의 <b>스킬 카드를 탭하거나 전장으로 드래그</b>해 적을 공격하세요.<br/>왼쪽 <b>마나 💧</b>를 소모하며, 시간이 지나면 회복됩니다.',
  },
  capture: {
    no: 'STEP 3 / 3',
    title: '③ 적을 포획',
    body: '빛나는 <b>포획구 카드를 적에게 드래그</b>하면 포획!<br/>포획한 몬스터는 원정대에 합류합니다. <span class="tut-dim">보스는 기절했을 때만 잡혀요.</span>',
  },
  done: {
    no: '',
    title: '🎉 준비 완료!',
    body: '이제 스스로 성을 지켜보세요.<br/>레벨업·진화·포획으로 원정대를 키우고 <b>스테이지 10의 최종보스</b>까지 나아가세요. 행운을 빕니다!',
  },
};

export class Tutorial {
  private bubble: HTMLElement | null = null;
  private step: Step = 'idle';
  private active = false;
  private offs: Array<() => void> = [];

  constructor(private root: HTMLElement) {}

  /** 전투 힌트 토스트 중복 방지용 — Game이 조회한다. */
  get isActive(): boolean {
    return this.active;
  }

  private static isDone(): boolean {
    try {
      return localStorage.getItem(KEY) === 'done';
    } catch {
      return false;
    }
  }

  private static persistDone(): void {
    try {
      localStorage.setItem(KEY, 'done');
    } catch {
      /* noop */
    }
  }

  /** 설정 '튜토리얼 다시 보기'용 — 완료 플래그 제거(다음 새 모험에서 재생). */
  static clearProgress(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
  }

  /** 새 모험 시작 시 호출 — 아직 완료 전이면 무장(버스 구독). */
  maybeStart(): void {
    if (this.active || Tutorial.isDone()) return;
    this.active = true;
    this.step = 'idle';
    this.offs.push(bus.on('stage:start', () => this.advanceTo('placement')));
    this.offs.push(bus.on('wave:start', () => this.advanceTo('cards')));
    this.offs.push(bus.on('card:played', () => this.advanceTo('capture')));
    // 카드를 한 장도 쓰지 않고 웨이브를 넘겨도 튜토리얼이 완료되도록 wave:clear는 done으로 마무리.
    this.offs.push(bus.on('wave:clear', () => this.advanceTo('done')));
  }

  /** 현재 단계보다 뒤일 때만 전진(같거나 앞선 이벤트는 무시). */
  private advanceTo(step: Exclude<Step, 'idle'>): void {
    if (!this.active || RANK[step] <= RANK[this.step]) return;
    this.step = step;
    this.render(step);
  }

  private render(step: Exclude<Step, 'idle'>): void {
    // 강조 대상은 body 클래스로 스코프 → 손패 재렌더에도 글로우 유지.
    document.body.classList.add('tut-active');
    document.body.classList.remove('tut-step-placement', 'tut-step-cards', 'tut-step-capture');
    if (step !== 'done') document.body.classList.add(`tut-step-${step}`);

    if (!this.bubble) {
      this.bubble = document.createElement('div');
      this.bubble.id = 'tut-bubble';
      this.root.appendChild(this.bubble);
    }
    const def = STEPS[step];
    const action =
      step === 'done'
        ? '<button class="btn primary" id="tut-ok">확인</button>'
        : '<button class="tut-skip" id="tut-skip">튜토리얼 건너뛰기</button>';
    this.bubble.innerHTML = `
      <div class="tut-step-no">${def.no}</div>
      <div class="tut-title">${def.title}</div>
      <div class="tut-body">${def.body}</div>
      <div class="tut-actions">${action}</div>`;

    const ok = this.bubble.querySelector('#tut-ok') as HTMLButtonElement | null;
    if (ok) ok.onclick = () => { playSfx('click'); this.finish(true); };
    const skip = this.bubble.querySelector('#tut-skip') as HTMLButtonElement | null;
    if (skip) skip.onclick = () => { playSfx('click'); this.finish(true); };

    // 등장 애니메이션 재시작(리플로우 강제).
    this.bubble.classList.remove('pop');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('pop');
    playSfx('select');
  }

  /** 튜토리얼 종료. persist=true면 완료로 기록(재무장 안 함). */
  finish(persist: boolean): void {
    if (!this.active) return;
    this.active = false;
    this.step = 'idle';
    for (const off of this.offs) off();
    this.offs = [];
    document.body.classList.remove('tut-active', 'tut-step-placement', 'tut-step-cards', 'tut-step-capture');
    if (this.bubble) {
      this.bubble.remove();
      this.bubble = null;
    }
    if (persist) Tutorial.persistDone();
  }

  /** 타이틀 이탈 등: 완료로 기록하지 않고 취소 → 다음 새 모험에서 다시 무장. */
  cancel(): void {
    this.finish(false);
  }
}
