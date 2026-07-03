import { bus } from '../core/events';
import { ELEMENT_ICON, ELEMENT_NAME_KO, MAX_MONSTERS } from '../data/constants';
import type { Element } from '../core/types';
import type { OwnedUnit } from '../core/GameState';
import { unitName, unitBranch, deriveStats } from '../core/GameState';
import { MONSTERS } from '../data/monsters';
import { SYNERGIES } from '../data/synergies';
import { CARD_BY_ID, cardIcon } from '../data/cards';
import { getPortrait } from '../render/Portraits';

export interface HudInfo {
  stageLabel: string;
  baseHp: number; baseHpMax: number;
  mana: number; manaMax: number;
  wave: number; totalWaves: number;
  gold: number;
  enemiesLeft: number;
  phaseLabel: string;
  showBeginWave: boolean;
}

export interface HandCard {
  id: string;
  playable: boolean;
  /** 사용 불가 사유 (비활성 카드 탭 시 안내) */
  reason?: string;
}

const el = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/** 카드/캐릭터 속성 아이콘 (무속성 포함) */
function cardElemIcon(e: string): string {
  if (e === 'normal' || e === 'neutral') return '⚪';
  return (ELEMENT_ICON as Record<string, string>)[e] ?? '⚪';
}

/** 모든 DOM 오버레이 UI 관리. Three.js 안에 UI를 그리지 않는다 (CLAUDE.md 원칙 2). */
export class UI {
  // 콜백 (Game이 할당)
  onStart = () => {};
  onContinue = () => {};
  onBeginWave = () => {};
  /** 카드 포인터다운 → Game이 더블탭(스마트)/드래그(정밀) 판정 */
  onCardGrab = (_id: string, _ev: PointerEvent) => {};
  /** 비활성 카드 탭 → 사유 안내 */
  onCardBlocked = (_reason: string) => {};
  onOpenViewer = () => {};
  onCloseViewer = () => {};
  onViewerSelect = (_uid: string) => {};
  onBranchPick = (_uid: string, _key: string) => {};
  onOpenCodex = () => {};
  onNode = (_kind: string) => {};
  onBuffPick = (_id: string) => {};
  onDraftPick = (_element: string) => {};
  onEventPick = (_id: string) => {};
  onNext = () => {};
  onRestart = () => {};
  onPlacementToggle = (_id: string) => {};
  onEnterBattle = () => {};
  onManage = () => {};
  onManageClose = () => {};
  onManageSelectHolder = (_id: string) => {};
  onManageToggle = (_holderId: string, _cardId: string) => {};

  private root: HTMLElement;
  private hudTop!: HTMLElement;
  private actions!: HTMLElement;
  private shelf!: HTMLElement;
  private bannerLayer!: HTMLElement;
  private toastLayer!: HTMLElement;
  private modalHost!: HTMLElement;
  private title!: HTMLElement;
  private viewerUI!: HTMLElement;
  private beginCta!: HTMLButtonElement;
  private dropZone!: HTMLElement;
  private placementBar!: HTMLElement;
  private lobbyUI!: HTMLElement;
  private manageUI!: HTMLElement;

  // HUD 참조
  private refs: Record<string, HTMLElement> = {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.buildTitle();
    this.buildHUD();
    this.buildShelf();
    this.placementBar = el('div'); this.placementBar.id = 'placement-bar'; this.placementBar.style.display = 'none';
    root.appendChild(this.placementBar);
    this.bannerLayer = el('div'); this.bannerLayer.id = 'banner-layer'; root.appendChild(this.bannerLayer);
    this.toastLayer = el('div'); this.toastLayer.id = 'toast-layer'; root.appendChild(this.toastLayer);
    this.modalHost = el('div'); root.appendChild(this.modalHost);
    this.buildViewer();
    this.buildLobby();
    this.buildManage();

    // 반응형 이벤트
    bus.on('base:damage', () => this.pulseHp());
    bus.on('synergy:fire', ({ name, a, b, discovered }) => this.banner(name, a, b, discovered));
    bus.on('toast', ({ text, kind }) => this.toast(text, kind));
    this.setGameplayVisible(false);
  }

  // ── 타이틀 ──
  private buildTitle(): void {
    this.title = el('div'); this.title.id = 'title-screen';
    this.title.innerHTML = `
      <div class="logo">Monster Keepers</div>
      <div class="sub">수호 몬스터 셋을 드래프트해 키우는 탑뷰 디펜스 로그라이크 — 버린 둘은 타락체 보스로 돌아온다</div>
      <div class="title-btns">
        <button class="btn primary" id="start-btn">새 모험</button>
        <button class="btn" id="continue-btn" style="display:none">이어하기</button>
      </div>
      <div class="tip">스테이지 1·2·3 시작마다 <b>수호 몬스터 3택1 드래프트</b> — 3마리를 뽑아 키운다 (안 뽑은 2종은 후반 타락체 보스로 회귀!)<br/>
      웨이브 사이 <b>몬스터를 슬롯에 배치</b>(자동 공격) · 카드는 <b>전장으로 드래그</b>하거나 <b>더블탭</b>해 스킬·버프 사용 · 성(거점)이 근처 적을 자동 방어</div>`;
    this.root.appendChild(this.title);
    (this.title.querySelector('#start-btn') as HTMLButtonElement).onclick = () => this.onStart();
    (this.title.querySelector('#continue-btn') as HTMLButtonElement).onclick = () => this.onContinue();
  }
  showTitle(canContinue = false): void {
    this.title.classList.remove('hidden');
    (this.title.querySelector('#continue-btn') as HTMLButtonElement).style.display = canContinue ? '' : 'none';
    this.setGameplayVisible(false);
  }
  hideTitle(): void { this.title.classList.add('hidden'); }

  private setGameplayVisible(on: boolean): void {
    this.hudTop.style.display = on ? 'flex' : 'none';
    this.actions.style.display = on ? 'flex' : 'none';
    this.shelf.style.display = on ? 'flex' : 'none';
    if (this.manaBar) this.manaBar.style.display = on ? 'flex' : 'none';
    if (!on) {
      this.placementBar.style.display = 'none';
      if (this.beginCta) this.beginCta.style.display = 'none';
      if (this.dropZone) this.dropZone.className = '';
    }
  }

  // ── HUD ──
  private buildHUD(): void {
    this.hudTop = el('div'); this.hudTop.id = 'hud-top';
    this.hudTop.innerHTML = `
      <div class="gauge panel big" style="padding:8px 14px" title="성(거점) HP — 0이 되면 패배">
        <span class="icon">🏰</span>
        <div class="bar-wrap"><div class="bar hp" id="hp-bar" style="width:100%"></div></div>
        <span class="val" id="hp-val">160</span>
      </div>
      <div class="chip">🌊 <span id="wave-val">웨이브 -</span></div>
      <div class="chip" title="남은 적">👹 <span id="enemy-val">0</span></div>
      <div class="chip">🪙 <span id="gold-val">0</span></div>
      <div class="chip stage-label"><span id="stage-val">스테이지</span></div>`;
    this.root.appendChild(this.hudTop);
    ['hp-bar','hp-val','wave-val','enemy-val','gold-val','stage-val'].forEach((id) => {
      this.refs[id] = this.hudTop.querySelector('#' + id) as HTMLElement;
    });
    this.buildManaBar();

    this.actions = el('div'); this.actions.id = 'hud-actions';
    const viewerBtn = el('button', 'btn', '📖 내 몬스터') as HTMLButtonElement;
    viewerBtn.onclick = () => this.onOpenViewer();
    this.actions.append(viewerBtn);
    this.root.appendChild(this.actions);
    // 하단 중앙 주 CTA (배치 중에만 노출 — 시선이 있는 곳)
    this.beginCta = el('button', 'btn primary', '▶ 웨이브 시작') as HTMLButtonElement;
    this.beginCta.id = 'begin-cta';
    this.beginCta.onclick = () => this.onBeginWave();
    this.beginCta.style.display = 'none';
    this.root.appendChild(this.beginCta);
    // 드래그 드롭 존 오버레이 (놓기/취소 안내)
    this.dropZone = el('div'); this.dropZone.id = 'drop-zone';
    this.root.appendChild(this.dropZone);
  }

  private manaBar!: HTMLElement;
  /** 큰 세로형 마나 바 (하스스톤처럼 왼쪽에 길게). */
  private buildManaBar(): void {
    this.manaBar = el('div'); this.manaBar.id = 'mana-vert';
    this.manaBar.innerHTML = `
      <div class="mv-crystal">🔷</div>
      <div class="mv-track"><div class="mv-fill" id="mana-fill"></div></div>
      <div class="mv-val"><span id="mana-val">10</span>/<span id="mana-max">10</span></div>`;
    this.root.appendChild(this.manaBar);
    this.refs['mana-fill'] = this.manaBar.querySelector('#mana-fill') as HTMLElement;
    this.refs['mana-val'] = this.manaBar.querySelector('#mana-val') as HTMLElement;
    this.refs['mana-max'] = this.manaBar.querySelector('#mana-max') as HTMLElement;
  }

  setHUD(info: HudInfo): void {
    this.setGameplayVisible(true);
    this.refs['hp-bar'].style.width = `${Math.max(0, (info.baseHp / info.baseHpMax) * 100)}%`;
    this.refs['hp-val'].textContent = `${Math.ceil(info.baseHp)}`;
    this.refs['mana-fill'].style.height = `${(info.mana / info.manaMax) * 100}%`;
    this.refs['mana-val'].textContent = `${Math.floor(info.mana)}`;
    this.refs['mana-max'].textContent = `${info.manaMax}`;
    this.refs['wave-val'].textContent = `웨이브 ${info.wave}/${info.totalWaves}`;
    this.refs['enemy-val'].textContent = `${info.enemiesLeft}`;
    this.refs['gold-val'].textContent = `${info.gold}`;
    this.refs['stage-val'].textContent = info.stageLabel;
    this.beginCta.style.display = info.showBeginWave ? 'flex' : 'none';
  }

  private pulseHp(): void {
    const b = this.refs['hp-bar'];
    b.animate([{ filter: 'brightness(2)' }, { filter: 'brightness(1)' }], { duration: 300 });
  }

  // ── 카드 패 ──
  private buildShelf(): void {
    this.shelf = el('div'); this.shelf.id = 'card-shelf';
    this.root.appendChild(this.shelf);
  }

  private handIds: string[] = [];
  private cardEls = new Map<string, HTMLElement>();

  /**
   * 손패 갱신. 카드 구성이 그대로면 **DOM 요소를 유지한 채 상태만 제자리 갱신**한다
   * (매 프레임 리빌드 시 더블클릭이 두 클릭 사이에서 끊기는 문제 방지). 구성이 바뀔 때만 재생성.
   */
  refreshHand(cards: HandCard[]): void {
    const ids = cards.map((c) => c.id);
    const same = ids.length === this.handIds.length && ids.every((id, i) => id === this.handIds[i]);
    if (same && cards.length > 0) {
      for (const c of cards) { const elm = this.cardEls.get(c.id); if (elm) this.updateCardEl(elm, c); }
      return;
    }
    const prev = new Set(this.handIds);
    this.shelf.innerHTML = '';
    this.cardEls.clear();
    let dealIdx = 0;
    for (const c of cards) {
      const card = this.buildCardEl(c);
      if (!card) continue;
      // 새로 드로우된 카드는 딜-인 애니메이션 (재정비 등 드로우 체감)
      if (!prev.has(c.id)) {
        card.classList.add('dealing');
        card.style.animationDelay = `${dealIdx * 0.07}s`;
        dealIdx++;
      }
      this.shelf.appendChild(card);
      this.cardEls.set(c.id, card);
    }
    this.handIds = ids;
    if (cards.length === 0) {
      this.shelf.appendChild(el('div', 'chip', '장착한 카드가 없습니다 (캐릭터 관리에서 편성)'));
    }
  }

  /** 드래그 중 원본 카드를 흐리게(하스스톤식). */
  setCardDragging(id: string, on: boolean): void {
    this.cardEls.get(id)?.classList.toggle('dragging', on);
  }

  /** 단일 탭한 카드 강조 (한 번 더 탭/드래그 안내). null이면 전부 해제. */
  setCardSelected(id: string | null): void {
    this.cardEls.forEach((elm, cid) => elm.classList.toggle('selected', cid === id));
  }

  /** 드래그 중 드롭 존 표시: 'field'(놓기) / 'shelf'(취소) / 'off'. */
  setDropZone(state: 'field' | 'shelf' | 'off'): void {
    this.dropZone.className = state === 'off' ? '' : `on ${state}`;
    this.dropZone.textContent = state === 'field' ? '여기에 놓아 사용' : state === 'shelf' ? '놓으면 취소' : '';
  }

  /** 카드 요소 1개 생성. 리스너는 요소에 항상 고정하고, 사용 가능 여부는 dataset로 판정. */
  private buildCardEl(c: HandCard): HTMLElement | null {
    if (!CARD_BY_ID[c.id]) return null;
    const card = el('div', 'card');
    // 사용: 더블탭(스마트) 또는 전장으로 드래그(정밀). Game이 pointer 흐름에서 둘 다 판정.
    // 비활성 카드는 사유 안내. 요소 identity를 유지하므로 리스너는 1회만 부착.
    card.addEventListener('pointerdown', (e) => {
      if (card.dataset.playable === '1') this.onCardGrab(c.id, e as PointerEvent);
      else if (card.dataset.reason) this.onCardBlocked(card.dataset.reason);
    });
    this.updateCardEl(card, c);
    return card;
  }

  /** 카드 요소 상태를 제자리 갱신 (요소 identity 유지 → 더블클릭 안정). */
  private updateCardEl(card: HTMLElement, c: HandCard): void {
    const def = CARD_BY_ID[c.id];
    // 제자리 갱신이 잦으므로 진행 중인 딜-인/드래그/선택 연출 클래스는 보존
    const keep = `${card.classList.contains('dealing') ? ' dealing' : ''}${card.classList.contains('dragging') ? ' dragging' : ''}${card.classList.contains('selected') ? ' selected' : ''}`;
    card.className = `card el-${def.element}${c.playable ? '' : ' disabled'}${keep}`;
    card.dataset.playable = c.playable ? '1' : '0';
    card.dataset.reason = c.reason ?? '';
    card.innerHTML = `
      <div class="cost">${def.cost}</div>
      <div class="card-elem">${cardElemIcon(def.element)}</div>
      <div class="art">${cardIcon(def)}</div>
      <div class="name">${def.name}</div>
      <div class="desc">${def.text}</div>`;
  }

  setTargeting(on: boolean): void {
    document.body.classList.toggle('targeting', on);
  }

  // ── 배치 바 (웨이브 사이에만 표시) ──
  showPlacement(items: { id: string; name: string; element: string; placed: boolean }[]): void {
    this.placementBar.style.display = 'flex';
    this.placementBar.innerHTML = `<div class="place-hint">🪵 배치: 몬스터를 눌러 슬롯에 놓거나 회수 (성은 거점에서 자동 방어)</div>`;
    const row = el('div', 'place-row');
    for (const it of items) {
      const icon = it.element === 'neutral' ? '🧑' : (ELEMENT_ICON as Record<string, string>)[it.element] ?? '❓';
      const chip = el('div', `place-chip${it.placed ? ' placed' : ''}`,
        `<span class="pc-ico">${icon}</span><span class="pc-name">${it.name}</span><span class="pc-state">${it.placed ? '배치됨' : '대기'}</span>`);
      chip.onclick = () => this.onPlacementToggle(it.id);
      row.appendChild(chip);
    }
    this.placementBar.appendChild(row);
  }

  hidePlacement(): void {
    this.placementBar.style.display = 'none';
  }

  // ── 모달 ──
  private modal(html: string): HTMLElement {
    this.clearModal();
    const overlay = el('div', 'overlay-center');
    const scroll = el('div', 'scroll', html);
    overlay.appendChild(scroll);
    this.modalHost.appendChild(overlay);
    return scroll;
  }
  clearModal(): void { this.modalHost.innerHTML = ''; }

  /** 드래프트: 미보유 3종을 세로 카드로 제시. 3택1. */
  showDraft(elements: Element[]): void {
    const scroll = this.modal(`<h1>수호 몬스터 선택</h1>
      <p>함께 싸울 몬스터를 하나 고르세요.</p>
      <div class="choice-row draft-row"></div>`);
    const row = scroll.querySelector('.choice-row')!;
    for (const elm of elements) {
      const def = MONSTERS[elm];
      const s1 = def.stages[0];
      const card = el('div', `choice draft-card el-${elm}`,
        `<div class="dc-el">${ELEMENT_ICON[elm]} ${ELEMENT_NAME_KO[elm]}</div>
         <div class="dc-ico">${ELEMENT_ICON[elm]}</div>
         <div class="ct">${s1.name}</div>
         <div class="cd">${s1.role}</div>`);
      applyPortrait(card.querySelector('.dc-ico') as HTMLElement, elm, 1);
      card.onclick = () => { this.clearModal(); this.onDraftPick(elm); };
      row.appendChild(card);
    }
  }

  /**
   * 분기 진화 2택1 (§5.6): 3단 도달 시 두 형태 중 하나 선택.
   * 색이 곧 빌드 — 카드에 분기 틴트색을 크게 노출.
   */
  showBranchChoice(data: {
    uid: string; name: string; element: Element;
    branches: { key: string; name: string; role: string; tint: number; signature: string }[];
  }): void {
    const scroll = this.modal(`<h1>분기 진화</h1>
      <p><b>${data.name}</b>이(가) 진화의 기로에 섰습니다. 형태를 선택하세요 — <b>색이 곧 빌드</b>입니다.</p>
      <div class="choice-row branch-row"></div>`);
    const row = scroll.querySelector('.choice-row')!;
    for (const b of data.branches) {
      const hex = `#${b.tint.toString(16).padStart(6, '0')}`;
      const c = el('div', `choice branch-card el-${data.element}`,
        `<div class="bc-swatch" style="background:${hex}"></div>
         <div class="ct">${ELEMENT_ICON[data.element]} ${b.name}</div>
         <div class="cd">${b.role}</div>
         <div class="bc-sig">🃏 시그니처: ${b.signature}</div>`);
      c.onclick = () => { this.clearModal(); this.onBranchPick(data.uid, b.key); };
      row.appendChild(c);
    }
  }

  /** 반응 도감 (§7.3): 발견한 협동기는 이름/설명, 미발견은 ??? + 속성 힌트. */
  showCodex(discovered: string[]): void {
    const scroll = this.modal(`<h1>반응 도감</h1>
      <p>표식 위에 다른 속성이 닿으면 협동기가 터진다. 조합을 실험해 도감을 채우자! (${discovered.length}/${SYNERGIES.length})</p>
      <div class="codex-list"></div>
      <div class="choice-row"><button class="btn primary" id="codex-close">닫기</button></div>`);
    const list = scroll.querySelector('.codex-list')!;
    for (const s of SYNERGIES) {
      const found = discovered.includes(s.id);
      const item = el('div', `codex-item${found ? ' found' : ''}`,
        found
          ? `<span class="cx-els">${ELEMENT_ICON[s.a]}✦${ELEMENT_ICON[s.b]}</span><span class="cx-name">${s.name}</span><span class="cx-desc">${s.desc}</span>`
          : `<span class="cx-els">${ELEMENT_ICON[s.a]}✦${ELEMENT_ICON[s.b]}</span><span class="cx-name">???</span><span class="cx-desc">${ELEMENT_NAME_KO[s.a]}과(와) ${ELEMENT_NAME_KO[s.b]}의 조합…</span>`);
      list.appendChild(item);
    }
    (scroll.querySelector('#codex-close') as HTMLButtonElement).onclick = () => this.clearModal();
  }

  showStageClear(stageLabel: string, rewards: string[]): void {
    const scroll = this.modal(`
      <h1>스테이지 클리어!</h1>
      <h2>${stageLabel}</h2>
      <p>${rewards.join('<br/>')}</p>
      <div class="choice-row"><button class="btn primary" id="next-btn">다음으로 →</button></div>`);
    (scroll.querySelector('#next-btn') as HTMLButtonElement).onclick = () => { this.clearModal(); this.onNext(); };
  }

  showNodeChoice(nodes: { kind: string; label: string; desc: string }[]): void {
    const scroll = this.modal(`<h1>갈림길</h1><p>다음 목적지를 선택하세요.</p><div class="choice-row"></div>`);
    const row = scroll.querySelector('.choice-row')!;
    for (const n of nodes) {
      const c = el('div', 'choice', `<div class="ct">${n.label}</div><div class="cd">${n.desc}</div>`);
      c.onclick = () => { this.clearModal(); this.onNode(n.kind); };
      row.appendChild(c);
    }
  }

  showBuffChoice(options: { id: string; label: string }[]): void {
    const scroll = this.modal(`<h1>버프 노드</h1><p>하나를 선택하세요.</p><div class="choice-row"></div>`);
    const row = scroll.querySelector('.choice-row')!;
    for (const o of options) {
      const c = el('div', 'choice', `<div class="ct">${o.label}</div>`);
      c.onclick = () => { this.clearModal(); this.onBuffPick(o.id); };
      row.appendChild(c);
    }
  }

  showEvent(node: { id: string; label: string; desc: string }): void {
    const scroll = this.modal(`<h1>${node.label}</h1><p>${node.desc}</p>
      <div class="choice-row"><button class="btn primary" id="ev-ok">받아들인다</button></div>`);
    (scroll.querySelector('#ev-ok') as HTMLButtonElement).onclick = () => { this.clearModal(); this.onEventPick(node.id); };
  }

  showWin(finalBossName: string): void {
    const scroll = this.modal(`<h1>런 승리! 🎉</h1><p>타락한 ${finalBossName}을(를) 월식에서 해방했습니다.<br/>당신은 진정한 몬스터 키퍼입니다.</p>
      <div class="choice-row"><button class="btn primary" id="again">새 모험</button></div>`);
    (scroll.querySelector('#again') as HTMLButtonElement).onclick = () => { this.clearModal(); this.onRestart(); };
  }

  showLose(reason: string): void {
    const scroll = this.modal(`<h1>런 종료…</h1><p>${reason}</p><p>함께한 몬스터와 카드는 초기화됩니다.</p>
      <div class="choice-row"><button class="btn primary" id="again">다시 도전</button></div>`);
    (scroll.querySelector('#again') as HTMLButtonElement).onclick = () => { this.clearModal(); this.onRestart(); };
  }

  // ── 협동기 배너 / 토스트 ──
  /** 협동기 발동 배너. 최초 발견이면 도감 등록 연출(NEW). */
  banner(name: string, a: Element, b: Element, discovered = false): void {
    const b1 = el('div', `synergy-banner${discovered ? ' discovered' : ''}`,
      `<span class="els">${ELEMENT_ICON[a]}✦${ELEMENT_ICON[b]}</span><span>${name}</span>${discovered ? '<span class="new-tag">NEW! 도감 등록</span>' : ''}`);
    this.bannerLayer.appendChild(b1);
    setTimeout(() => b1.remove(), discovered ? 2200 : 1400);
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const t = el('div', `toast ${kind}`, text);
    this.toastLayer.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // ── 몬스터 뷰어 ──
  private buildViewer(): void {
    this.viewerUI = el('div'); this.viewerUI.id = 'viewer-ui';
    this.viewerUI.innerHTML = `
      <div id="viewer-list" class="panel"><h2>내 몬스터</h2><div id="roster-items"></div></div>
      <div id="viewer-info" class="panel"><div id="info-body">유닛을 선택하세요</div></div>
      <button class="btn primary" id="viewer-close">✕ 닫기</button>`;
    this.root.appendChild(this.viewerUI);
    (this.viewerUI.querySelector('#viewer-close') as HTMLButtonElement).onclick = () => this.onCloseViewer();
  }

  openViewer(roster: OwnedUnit[]): void {
    this.viewerUI.classList.add('on');
    const list = this.viewerUI.querySelector('#roster-items')!;
    list.innerHTML = '';
    roster.forEach((u, i) => {
      const item = el('div', 'roster-item' + (i === 0 ? ' sel' : ''),
        `<div class="ri-pic">${ELEMENT_ICON[u.element]}</div>
         <div class="ri-text">
           <div class="ri-name">${unitName(u)}</div>
           <div class="ri-sub">${ELEMENT_NAME_KO[u.element]} · Lv${u.level} · ${u.stage}단</div>
         </div>`);
      applyPortrait(item.querySelector('.ri-pic') as HTMLElement, u.element, u.stage);
      item.onclick = () => {
        list.querySelectorAll('.roster-item').forEach((x) => x.classList.remove('sel'));
        item.classList.add('sel');
        this.onViewerSelect(u.uid);
        this.showUnitInfo(u);
      };
      list.appendChild(item);
    });
    if (roster[0]) { this.onViewerSelect(roster[0].uid); this.showUnitInfo(roster[0]); }
  }

  closeViewer(): void { this.viewerUI.classList.remove('on'); }

  // ── 로비 ──
  private buildLobby(): void {
    this.lobbyUI = el('div'); this.lobbyUI.id = 'lobby'; this.lobbyUI.style.display = 'none';
    this.lobbyUI.innerHTML = `
      <div class="lobby-card panel">
        <h1>모험가 길드</h1>
        <div id="lobby-stage" class="lobby-stage"></div>
        <div id="lobby-roster" class="lobby-roster"></div>
        <div class="lobby-btns">
          <button class="btn primary" id="lobby-battle">⚔ 전투 시작</button>
          <button class="btn" id="lobby-manage">🃏 캐릭터 관리</button>
          <button class="btn" id="lobby-viewer">📖 내 몬스터</button>
          <button class="btn" id="lobby-codex">📜 반응 도감</button>
        </div>
      </div>`;
    this.root.appendChild(this.lobbyUI);
    (this.lobbyUI.querySelector('#lobby-battle') as HTMLButtonElement).onclick = () => this.onEnterBattle();
    (this.lobbyUI.querySelector('#lobby-manage') as HTMLButtonElement).onclick = () => this.onManage();
    (this.lobbyUI.querySelector('#lobby-viewer') as HTMLButtonElement).onclick = () => this.onOpenViewer();
    (this.lobbyUI.querySelector('#lobby-codex') as HTMLButtonElement).onclick = () => this.onOpenCodex();
  }

  showLobby(info: { stageNo: number; stageLabel: string; gold: number; roster: OwnedUnit[]; discoveredCount: number }): void {
    this.setGameplayVisible(false);
    this.hideManage();
    this.lobbyUI.style.display = 'flex';
    (this.lobbyUI.querySelector('#lobby-stage') as HTMLElement).innerHTML =
      `다음 전투: <b>스테이지 ${info.stageNo}</b> — ${info.stageLabel}<br/>🪙 ${info.gold} · 보유 몬스터 ${info.roster.length}/${MAX_MONSTERS} · 📜 도감 ${info.discoveredCount}/${SYNERGIES.length}`;
    const r = this.lobbyUI.querySelector('#lobby-roster') as HTMLElement;
    r.innerHTML = '';
    const heroChip = el('div', 'lobby-mon', `<div class="lm-ico">🏰</div><div class="lm-name">성 (거점)</div><div class="lm-sub">무색 카드 5장</div>`);
    r.appendChild(heroChip);
    for (const u of info.roster) {
      const br = unitBranch(u);
      const chip = el('div', 'lobby-mon', `<div class="lm-ico">${cardElemIcon(u.element)}</div><div class="lm-name">${unitName(u)}${br ? `·${br.name}` : ''}</div><div class="lm-sub">Lv${u.level} · ${u.stage}단</div>`);
      applyPortrait(chip.querySelector('.lm-ico') as HTMLElement, u.element, u.stage);
      r.appendChild(chip);
    }
  }

  hideLobby(): void { this.lobbyUI.style.display = 'none'; }

  // ── 캐릭터 관리 (덱 편성) ──
  private buildManage(): void {
    this.manageUI = el('div'); this.manageUI.id = 'manage'; this.manageUI.style.display = 'none';
    this.manageUI.innerHTML = `
      <div class="manage-head">
        <h1>캐릭터 관리 · 덱 편성</h1>
        <button class="btn" id="manage-close">✕ 로비로</button>
      </div>
      <div class="manage-body">
        <div id="manage-holders" class="manage-holders panel"></div>
        <div id="manage-cards" class="manage-cards panel"></div>
      </div>`;
    this.root.appendChild(this.manageUI);
    (this.manageUI.querySelector('#manage-close') as HTMLButtonElement).onclick = () => this.onManageClose();
  }

  showManage(data: {
    holders: { id: string; name: string; element: string; level: number }[];
    selected: string; level: number; equippedCount: number; cap: number;
    cards: { id: string; name: string; element: string; cost: number; text: string; learnLevel: number; learned: boolean; equipped: boolean; branchLocked?: boolean }[];
  }): void {
    this.setGameplayVisible(false);
    this.hideLobby();
    this.manageUI.style.display = 'flex';
    const h = this.manageUI.querySelector('#manage-holders') as HTMLElement;
    h.innerHTML = '<h2>캐릭터</h2>';
    for (const ho of data.holders) {
      const item = el('div', 'holder-item' + (ho.id === data.selected ? ' sel' : ''),
        `<span class="hi-ico">${cardElemIcon(ho.element)}</span><span class="hi-name">${ho.name}</span><span class="hi-lv">Lv${ho.level}</span>`);
      item.onclick = () => this.onManageSelectHolder(ho.id);
      h.appendChild(item);
    }
    const cc = this.manageUI.querySelector('#manage-cards') as HTMLElement;
    cc.innerHTML = `<h2>스킬 · 장착 ${data.equippedCount}/${data.cap} (레벨업마다 +2 학습)</h2><div class="mc-grid"></div>`;
    const grid = cc.querySelector('.mc-grid') as HTMLElement;
    for (const c of data.cards) {
      const cls = `mcard el-${c.element}${c.equipped ? ' equipped' : ''}${c.learned ? '' : ' locked'}`;
      const skillIcon = CARD_BY_ID[c.id] ? cardIcon(CARD_BY_ID[c.id]) : cardElemIcon(c.element);
      const foot = c.learned
        ? (c.equipped ? '★ 장착됨' : '＋ 장착')
        : c.branchLocked ? '🔒 분기 진화 선택 시' : `🔒 Lv${c.learnLevel}`;
      const card = el('div', cls, `
        <div class="cost">${c.cost}</div>
        <div class="card-elem">${cardElemIcon(c.element)}</div>
        <div class="mc-name">${skillIcon} ${c.name}</div>
        <div class="mc-desc">${c.text}</div>
        <div class="mc-foot">${foot}</div>`);
      if (c.learned) card.onclick = () => this.onManageToggle(data.selected, c.id);
      grid.appendChild(card);
    }
  }

  hideManage(): void { this.manageUI.style.display = 'none'; }

  private showUnitInfo(u: OwnedUnit): void {
    const s = deriveStats(u);
    const def = MONSTERS[u.element];
    const br = unitBranch(u);
    const body = this.viewerUI.querySelector('#info-body')!;
    body.innerHTML = `
      <div class="info-pic">${ELEMENT_ICON[u.element]}</div>
      <h2>${unitName(u)}${br ? ` · ${br.name}` : ''}</h2>
      <div class="row"><span>속성</span><span>${ELEMENT_ICON[u.element]} ${ELEMENT_NAME_KO[u.element]}</span></div>
      <div class="row"><span>레벨</span><span>Lv ${u.level}</span></div>
      <div class="row"><span>진화 단계</span><span>${u.stage}단 / 3</span></div>
      <div class="row"><span>진화 레벨</span><span>${def.evolveLevels.join(' / ')}</span></div>
      ${br ? `<div class="row"><span>분기 형태</span><span style="color:#${br.tint.toString(16).padStart(6, '0')}">■</span> ${br.name}</div>` : ''}
      <div class="row"><span>HP</span><span>${s.hp}</span></div>
      <div class="row"><span>공격력</span><span>${s.attack}</span></div>
      <div class="row"><span>사거리</span><span>${s.range.toFixed(1)}</span></div>
      <div class="row"><span>공속</span><span>${s.attackSpeed.toFixed(2)}</span></div>
      <div class="row"><span>유대 보너스</span><span>+${Math.round(s.bond * 100)}% <span style="opacity:0.6">(HP·공격)</span></span></div>
      <p style="margin-top:10px;font-size:12.5px;opacity:0.9">${br ? br.role : def.stages[u.stage - 1].role}</p>`;
    applyPortrait(body.querySelector('.info-pic') as HTMLElement, u.element, u.stage);
  }
}

/** 정규화 포트레이트를 배경으로 적용. 파일 없으면 이모지 폴백 유지. */
function applyPortrait(elm: HTMLElement | null, element: Element, stage: number): void {
  if (!elm) return;
  getPortrait(element, stage).then((url) => {
    if (!url) return; // 폴백(이모지) 그대로
    elm.textContent = '';
    elm.style.backgroundImage = `url("${url}")`;
    elm.classList.add('has-img');
  });
}
