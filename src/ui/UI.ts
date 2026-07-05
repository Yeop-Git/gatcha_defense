import { bus } from '../core/events';
import { ELEMENT_ICON, ELEMENT_NAME_KO, MAX_MONSTERS } from '../data/constants';
import type { Element } from '../core/types';
import type { OwnedUnit } from '../core/GameState';
import { unitName, displayName, deriveStats } from '../core/GameState';
import { MONSTERS } from '../data/monsters';
import { ENEMIES } from '../data/enemies';
import { CARD_BY_ID, cardIcon, cardMeta, cardRole } from '../data/cards';
import { getPortrait } from '../render/Portraits';
import { getEnemyPortrait } from '../render/EnemyPortraits';
import { settings, saveSettings } from '../core/Settings';
import { playSfx } from '../audio/Sfx';
import * as Dex from '../core/Dex';

export interface HudInfo {
  stageLabel: string;
  baseHp: number; baseHpMax: number;
  mana: number; manaMax: number;
  deckDraw: number; deckDiscard: number;
  wave: number; totalWaves: number;
  gold: number;
  enemiesLeft: number;
  phaseLabel: string;
  showBeginWave: boolean;
}

export interface HandCard {
  id: string;
  playable: boolean;
  pinned?: boolean;
  cdFrac?: number;
  reason?: string;
}

export interface UnitCard {
  id: string;
  name: string;
  element: string;
  kind: 'creature' | 'enemy';
  species?: string;
  stage: 1 | 2 | 3;
  placed: boolean;
  dead?: boolean;
  level?: number;
}

const el = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/** 스테이지 맵/테마 아이콘 (노드식 모험 지도). */
const THEME_ICON: Record<string, string> = {
  grassland: '🌿', forest: '🌲', cave: '🕳️', volcano: '🌋', temple: '🏛️',
};

function cardElemIcon(e: string): string {
  if (e === 'normal') return '⚪';
  if (e === 'neutral') return '🏰';
  return (ELEMENT_ICON as Record<string, string>)[e] ?? '❔';
}

/** 성장 모달용 유닛 포트레이트 정보 (어느 캐릭터인지 명시). */
export interface UnitPortraitInfo {
  name: string;
  element: string;
  kind: 'creature' | 'enemy';
  stage: 1 | 2 | 3;
  species?: string;
}

/** 모달 헤더용 포트레이트 컨테이너 (이모지 폴백 내장, 인라인 스타일로 CSS 비의존). */
function portraitDiv(element: string): string {
  const emoji = (ELEMENT_ICON as Record<string, string>)[element] ?? '❔';
  return `<div class="modal-pic" style="width:72px;height:72px;min-width:72px;font-size:44px;display:flex;align-items:center;justify-content:center;background-size:contain;background-repeat:no-repeat;background-position:center;border-radius:12px;overflow:hidden">${emoji}</div>`;
}

function capturedTraitLabel(tier?: string): string {
  if (tier === 'swarm') return '무리 본능';
  if (tier === 'flyer') return '공중 추격';
  if (tier === 'tank') return '육중한 타격';
  if (tier === 'healer') return '수호 정령';
  if (tier === 'elite') return '정예 본능';
  if (tier === 'miniboss') return '거대 개체';
  if (tier === 'boss') return '보스의 잔재';
  return '';
}

function capturedTraitDesc(tier?: string): string {
  if (tier === 'swarm') return '공격 속도가 빠르고, 가끔 같은 대상에게 추가타를 넣습니다.';
  if (tier === 'flyer') return '공격 속도가 빠르고, 명중 시 가까운 적 하나를 함께 추격합니다.';
  if (tier === 'tank') return '공격 속도는 느리지만 명중한 적을 밀어내고 잠시 붙잡습니다.';
  if (tier === 'healer') return '공격할 때마다 성을 조금 수리하고, 가끔 자신에게 축복을 부여합니다.';
  if (tier === 'elite') return '기본 공격력이 높고, 명중 지점 주변에 작은 폭발 피해를 줍니다.';
  if (tier === 'miniboss') return '강한 공격력과 넓은 폭발 피해를 지닌 거대 포획체입니다.';
  if (tier === 'boss') return '매우 강한 공격력과 넓은 폭발 피해를 지닌 특별한 포획체입니다.';
  return '';
}

export class UI {
  onStart = () => {};
  onContinue = () => {};
  onBeginWave = () => {};
  onCardGrab = (_id: string, _ev: PointerEvent) => {};
  onCardBlocked = (_reason: string) => {};
  onOpenViewer = () => {};
  onCloseViewer = () => {};
  onViewerSelect = (_uid: string) => {};
  onRename = (_uid: string, _name: string) => {};
  onCardGainAck = () => {};
  onEvolveAck = () => {};
  onCardReplacePick = (_discardId: string) => {};
  onCaptureDiscardPick = (_id: string) => {};
  onNode = (_kind: string) => {};
  onBuffPick = (_id: string) => {};
  onBonusPick = (_id: string) => {};
  onDraftPick = (_element: string) => {};
  onEventPick = (_id: string) => {};
  onNext = () => {};
  onRestart = () => {};
  onPlacementToggle = (_id: string) => {};
  onUnitCardGrab = (_id: string, _ev: PointerEvent) => {};
  onSpeedChange = (_speed: 1 | 2 | 3) => {};
  onEnterBattle = () => {};
  onManage = () => {};
  onManageClose = () => {};
  onSettings = () => {};
  onSettingsChange = () => {};
  onDex = () => {};
  onDexView = (_d: { kind: 'creature' | 'enemy'; element?: string; stage?: number; species?: string; name: string }) => {};
  onDexViewClose = () => {};
  onExit = () => {};
  onToTitle = () => {};
  onManageSelectHolder = (_id: string) => {};
  onManageToggle = (_holderId: string, _cardId: string) => {};
  onShop = () => {};
  onShopBuy = (_id: string) => {};
  onShopClose = () => {};
  onStageEnter = () => {};
  onStageMapBack = () => {};

  private hudTop!: HTMLElement;
  private actions!: HTMLElement;
  private shelf!: HTMLElement;
  private toastLayer!: HTMLElement;
  private modalHost!: HTMLElement;
  private title!: HTMLElement;
  private viewerUI!: HTMLElement;
  private beginCta!: HTMLButtonElement;
  private dropZone!: HTMLElement;
  private placementBar!: HTMLElement;
  private lobbyUI!: HTMLElement;
  private stageMapUI!: HTMLElement;
  private manageUI!: HTMLElement;
  private manaBar!: HTMLElement;
  private refs: Record<string, HTMLElement> = {};
  private handIds: string[] = [];
  private cardEls = new Map<string, HTMLElement>();

  constructor(private root: HTMLElement) {
    this.buildTitle();
    this.buildHUD();
    this.buildShelf();
    this.placementBar = el('div');
    this.placementBar.id = 'placement-bar';
    this.placementBar.style.display = 'none';
    root.appendChild(this.placementBar);
    this.toastLayer = el('div');
    this.toastLayer.id = 'toast-layer';
    root.appendChild(this.toastLayer);
    this.modalHost = el('div');
    root.appendChild(this.modalHost);
    this.buildViewer();
    this.buildLobby();
    this.buildStageMap();
    this.probeLobbyBg();
    this.buildManage();
    this.buildDexView();
    bus.on('base:damage', () => this.pulseHp());
    bus.on('toast', ({ text, kind }) => this.toast(text, kind));
    this.setGameplayVisible(false);
  }

  private hasSave = false;
  private buildTitle(): void {
    this.title = el('div');
    this.title.id = 'title-screen';
    this.title.innerHTML = `
      <div class="title-inner">
        <div class="logo-banner"><span class="logo">Monster Keepers</span></div>
        <div class="sub">적을 포획해 나만의 몬스터로 길들이고,<br/>함께 육성해 성을 지키는 디펜스 로그라이크.</div>
        <nav class="title-menu">
          <button class="menu-item primary" id="continue-btn">이어하기</button>
          <button class="menu-item" id="new-btn">새 모험</button>
          <button class="menu-item" id="settings-btn">설정</button>
        </nav>
      </div>
      <div class="title-hint" id="title-hint">적을 포획해 원정대를 키우고, 몰려오는 적으로부터 성을 지키세요.</div>`;
    this.root.appendChild(this.title);
    (this.title.querySelector('#continue-btn') as HTMLButtonElement).onclick = () => { playSfx('click'); if (this.hasSave) this.onContinue(); else this.onStart(); };
    (this.title.querySelector('#new-btn') as HTMLButtonElement).onclick = () => { playSfx('click'); this.onStart(); };
    (this.title.querySelector('#settings-btn') as HTMLButtonElement).onclick = () => { playSfx('click'); this.onSettings(); };
  }

  showTitle(canContinue = false): void {
    this.hasSave = canContinue;
    this.title.classList.remove('hidden');
    const cont = this.title.querySelector('#continue-btn') as HTMLButtonElement;
    const nw = this.title.querySelector('#new-btn') as HTMLButtonElement;
    cont.textContent = canContinue ? '이어하기' : '시작하기';
    nw.style.display = canContinue ? '' : 'none'; // 저장 없으면 '새 모험'은 '시작하기'와 중복이라 숨김
    this.setGameplayVisible(false);
  }

  /** 설정 모달 — 효과음/음량/기본 전투속도. settings 싱글턴을 직접 갱신·저장. */
  showSettings(): void {
    const scroll = this.modal(`<h1>설정</h1>
      <div class="settings-list">
        <label class="set-row"><span>효과음</span><input type="checkbox" id="set-sfx" ${settings.sfx ? 'checked' : ''}/></label>
        <label class="set-row"><span>음량</span><input type="range" id="set-vol" min="0" max="100" value="${Math.round(settings.volume * 100)}"/></label>
        <label class="set-row"><span>기본 전투 속도</span>
          <select id="set-speed">
            <option value="1" ${settings.speed === 1 ? 'selected' : ''}>1x</option>
            <option value="2" ${settings.speed === 2 ? 'selected' : ''}>2x</option>
            <option value="3" ${settings.speed === 3 ? 'selected' : ''}>3x</option>
          </select></label>
      </div>
      <div class="choice-row"><button class="btn primary" id="set-ok">확인</button></div>`);
    const sfxBox = scroll.querySelector('#set-sfx') as HTMLInputElement;
    const vol = scroll.querySelector('#set-vol') as HTMLInputElement;
    const speed = scroll.querySelector('#set-speed') as HTMLSelectElement;
    sfxBox.onchange = () => { settings.sfx = sfxBox.checked; saveSettings(); playSfx('click'); };
    vol.oninput = () => { settings.volume = Number(vol.value) / 100; };
    vol.onchange = () => { saveSettings(); playSfx('select'); };
    speed.onchange = () => { settings.speed = (Number(speed.value) as 1 | 2 | 3); saveSettings(); this.onSettingsChange(); playSfx('click'); };
    (scroll.querySelector('#set-ok') as HTMLButtonElement).onclick = () => { playSfx('click'); this.clearModal(); };
  }

  /** 도감(컬렉션) 모달 — 영속 Dex 기준. 미해금은 실루엣(???). 전 종 수집이 엔드컨텐츠. */
  showDex(): void {
    const els: Element[] = ['fire', 'water', 'grass', 'light', 'dark'];
    const cell = (unlocked: boolean, element: string, name: string, attr: string): string =>
      `<div class="dex-cell${unlocked ? '' : ' locked'} el-${element}" style="width:74px;display:flex;flex-direction:column;align-items:center;gap:3px;${unlocked ? '' : 'opacity:0.55;filter:grayscale(1)'}">
        <div class="dex-pic" ${attr} style="width:58px;height:58px;font-size:32px;display:flex;align-items:center;justify-content:center;background-size:contain;background-repeat:no-repeat;background-position:center;border-radius:12px;background-color:rgba(20,14,8,0.35)">${unlocked ? '' : '❔'}</div>
        <div class="dex-nm" style="font-size:11px;text-align:center;line-height:1.1;color:var(--ink)">${unlocked ? name : '???'}</div>
      </div>`;
    // 진화계통(라인)별로 묶어서 한꺼번에 표시. 크리처 5속성×3단 + 적 진화체인.
    const lines: string[] = [];
    let collected = 0, total = 0;
    for (const el of els) {
      let inner = '';
      for (const st of [1, 2, 3] as const) {
        const u = Dex.hasCreature(el, st); if (u) collected++; total++;
        inner += cell(u, el, u ? MONSTERS[el].stages[st - 1].name : '', `data-cre="${el}:${st}"`);
      }
      lines.push(`<div class="dex-line el-${el}">${inner}</div>`);
    }
    const enemyIds = Object.keys(ENEMIES).filter((id) => !ENEMIES[id].creatureStage);
    const targets = new Set(enemyIds.map((id) => ENEMIES[id].evolvesTo).filter(Boolean));
    for (const id of enemyIds) {
      if (targets.has(id)) continue; // 진화형은 base 라인에 포함
      const chain: string[] = [id];
      let nxt: string | undefined = ENEMIES[id].evolvesTo;
      while (nxt && ENEMIES[nxt]) { chain.push(nxt); nxt = ENEMIES[nxt].evolvesTo; }
      let inner = '';
      for (const sp of chain) {
        const d = ENEMIES[sp]; const u = Dex.hasEnemy(sp); if (u) collected++; total++;
        inner += cell(u, d.element, u ? d.name : '', `data-enemy="${sp}"`);
      }
      lines.push(`<div class="dex-line el-${ENEMIES[id].element}">${inner}</div>`);
    }
    const scroll = this.modal(`<h1>도감</h1><p class="dex-count">수집 <b>${collected}</b> / ${total} · 같은 진화계통끼리 묶었습니다</p>
      <div class="dex-grid" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:10px 0 14px;align-items:flex-start">${lines.join('')}</div>
      <div class="choice-row"><button class="btn primary" id="dex-ok">닫기</button></div>`);
    scroll.querySelectorAll('.dex-pic[data-cre]').forEach((elm) => {
      const [el, st] = (elm.getAttribute('data-cre') ?? '').split(':');
      if (Dex.hasCreature(el as Element, Number(st))) applyPortrait(elm as HTMLElement, el as Element, Number(st));
    });
    scroll.querySelectorAll('.dex-pic[data-enemy]').forEach((elm) => {
      const id = elm.getAttribute('data-enemy') ?? '';
      if (Dex.hasEnemy(id)) { const d = ENEMIES[id]; applyEnemyPortrait(elm as HTMLElement, d.element, id, d.name); }
    });
    // 해금된 셀 클릭 → 3D 감상
    scroll.querySelectorAll('.dex-cell:not(.locked)').forEach((cellEl) => {
      const pic = cellEl.querySelector('.dex-pic');
      const cre = pic?.getAttribute('data-cre'); const en = pic?.getAttribute('data-enemy');
      (cellEl as HTMLElement).style.cursor = 'pointer';
      (cellEl as HTMLElement).onclick = () => {
        playSfx('select');
        if (cre) { const [el, st] = cre.split(':'); this.onDexView({ kind: 'creature', element: el, stage: Number(st), name: MONSTERS[el as Element].stages[Number(st) - 1].name }); }
        else if (en) this.onDexView({ kind: 'enemy', species: en, name: ENEMIES[en]?.name ?? en });
      };
    });
    (scroll.querySelector('#dex-ok') as HTMLButtonElement).onclick = () => { playSfx('click'); this.clearModal(); };
  }

  private dexViewUI!: HTMLElement;
  private buildDexView(): void {
    this.dexViewUI = el('div');
    this.dexViewUI.id = 'dexview-ui';
    this.dexViewUI.style.display = 'none';
    this.dexViewUI.innerHTML = `<div class="dexview-top panel"><span class="dexview-name" id="dexview-name"></span><button class="btn" id="dexview-close">← 도감</button></div><div class="dexview-hint">🖱️ 드래그로 회전 · 휠로 확대</div>`;
    this.root.appendChild(this.dexViewUI);
    (this.dexViewUI.querySelector('#dexview-close') as HTMLButtonElement).onclick = () => { playSfx('click'); this.onDexViewClose(); };
  }
  /** 도감 3D 감상 오버레이 표시(3D는 메인 캔버스가 뷰어 씬을 렌더). */
  showDexView(name: string): void {
    this.clearModal();
    this.setGameplayVisible(false);
    this.dexViewUI.style.display = 'flex';
    (this.dexViewUI.querySelector('#dexview-name') as HTMLElement).textContent = name;
  }
  hideDexView(): void { this.dexViewUI.style.display = 'none'; }
  hideTitle(): void { this.title.classList.add('hidden'); }

  private setGameplayVisible(on: boolean): void {
    this.hudTop.style.display = on ? 'flex' : 'none';
    this.actions.style.display = on ? 'flex' : 'none';
    this.shelf.style.display = on ? 'flex' : 'none';
    this.manaBar.style.display = on ? 'flex' : 'none';
    if (!on) {
      this.placementBar.style.display = 'none';
      this.beginCta.style.display = 'none';
      this.dropZone.className = '';
    }
  }

  private buildHUD(): void {
    this.hudTop = el('div');
    this.hudTop.id = 'hud-top';
    this.hudTop.innerHTML = `
      <div class="gauge panel big" style="padding:8px 14px" title="성 HP가 0이 되면 패배합니다.">
        <span class="icon">🏰</span>
        <div class="bar-wrap"><div class="bar hp" id="hp-bar" style="width:100%"></div></div>
        <span class="val" id="hp-val">0</span>
      </div>
      <div class="chip">웨이브 <span id="wave-val">-</span></div>
      <div class="chip" title="드로우 더미 / 버린 더미">덱 <span id="deck-val">0/0</span></div>
      <div class="chip" title="남은 적">적 <span id="enemy-val">0</span></div>
      <div class="chip">골드 <span id="gold-val">0</span></div>
      <div class="chip stage-label"><span id="stage-val">스테이지</span></div>`;
    this.root.appendChild(this.hudTop);
    ['hp-bar','hp-val','wave-val','deck-val','enemy-val','gold-val','stage-val'].forEach((id) => {
      this.refs[id] = this.hudTop.querySelector('#' + id) as HTMLElement;
    });
    this.buildManaBar();

    this.actions = el('div');
    this.actions.id = 'hud-actions';
    const viewerBtn = el('button', 'btn', '몬스터 보기') as HTMLButtonElement;
    viewerBtn.onclick = () => this.onOpenViewer();
    this.actions.append(viewerBtn);
    const exitBtn = el('button', 'btn', '⌂ 나가기') as HTMLButtonElement;
    exitBtn.title = '원정대(홈)로 나가기 (ESC)';
    exitBtn.onclick = () => { playSfx('click'); this.onExit(); };
    this.actions.append(exitBtn);
    const speedWrap = el('div', 'speed-toggle');
    for (const speed of [1, 2, 3] as const) {
      const b = el('button', `speed-btn${speed === 1 ? ' on' : ''}`, `${speed}x`) as HTMLButtonElement;
      b.onclick = () => {
        speedWrap.querySelectorAll('.speed-btn').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.onSpeedChange(speed);
      };
      speedWrap.appendChild(b);
    }
    this.actions.append(speedWrap);
    this.root.appendChild(this.actions);

    this.beginCta = el('button', 'btn primary', '웨이브 시작') as HTMLButtonElement;
    this.beginCta.id = 'begin-cta';
    this.beginCta.onclick = () => this.onBeginWave();
    this.beginCta.style.display = 'none';
    this.actions.append(this.beginCta);

    this.dropZone = el('div');
    this.dropZone.id = 'drop-zone';
    this.root.appendChild(this.dropZone);
  }

  private buildManaBar(): void {
    this.manaBar = el('div');
    this.manaBar.id = 'mana-vert';
    this.manaBar.innerHTML = `
      <div class="mv-crystal" title="마나">💧</div>
      <div class="mv-track"><div class="mv-fill" id="mana-fill"></div></div>
      <div class="mv-val"><span id="mana-val">0</span>/<span id="mana-max">0</span></div>`;
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
    this.refs['wave-val'].textContent = `${info.wave}/${info.totalWaves}`;
    this.refs['deck-val'].textContent = `${info.deckDraw}/${info.deckDiscard}`;
    this.refs['enemy-val'].textContent = `${info.enemiesLeft}`;
    this.refs['gold-val'].textContent = `${info.gold}`;
    this.refs['stage-val'].textContent = info.stageLabel;
    this.beginCta.style.display = info.showBeginWave ? 'flex' : 'none';
  }

  private pulseHp(): void {
    this.refs['hp-bar'].animate([{ filter: 'brightness(2)' }, { filter: 'brightness(1)' }], { duration: 300 });
  }

  private buildShelf(): void {
    this.shelf = el('div');
    this.shelf.id = 'card-shelf';
    this.root.appendChild(this.shelf);
  }

  refreshHand(cards: HandCard[]): void {
    this.shelf.classList.remove('placement'); // 웨이브: 카드 선반 원위치
    const ids = cards.map((c) => c.id);
    const same = ids.length === this.handIds.length && ids.every((id, i) => id === this.handIds[i]);
    if (same && cards.length > 0) {
      for (const c of cards) {
        const elm = this.cardEls.get(c.id);
        if (elm) this.updateCardEl(elm, c);
      }
      return;
    }
    const prev = new Set(this.handIds);
    this.shelf.innerHTML = '';
    this.cardEls.clear();
    let dealIdx = 0;
    for (const c of cards) {
      const card = this.buildCardEl(c);
      if (!card) continue;
      if (!prev.has(c.id)) {
        card.classList.add('dealing');
        card.style.animationDelay = `${dealIdx * 0.07}s`;
        dealIdx++;
      }
      this.shelf.appendChild(card);
      this.cardEls.set(c.id, card);
    }
    this.handIds = ids;
    if (cards.length === 0) this.shelf.appendChild(el('div', 'chip', '사용할 카드가 없습니다.'));
  }

  showUnitShelf(items: UnitCard[]): void {
    this.handIds = items.map((c) => c.id);
    this.cardEls.clear();
    this.shelf.classList.add('placement'); // 배치 페이즈: 카드 위로, 전투 버튼 하단 중앙
    this.shelf.innerHTML = '';
    for (const it of items) {
      const icon = cardElemIcon(it.element);
      const stateLabel = it.placed ? '배치됨' : '대기';
      const card = el('div', `unit-card el-${it.element}${it.placed ? ' placed' : ''}`, `
        <div class="unit-lv" style="position:absolute;top:4px;left:6px;font-size:11px;font-weight:800;color:#f2ce6b;text-shadow:0 1px 2px #000;z-index:2">Lv${it.level ?? 1}</div>
        <div class="unit-state">${stateLabel}</div>
        <div class="unit-art">${icon}</div>
        <div class="unit-name">${it.name}</div>`);
      applyUnitPortrait(card.querySelector('.unit-art') as HTMLElement, it);
      card.addEventListener('pointerdown', (e) => this.onUnitCardGrab(it.id, e as PointerEvent));
      this.shelf.appendChild(card);
    }
    if (items.length === 0) this.shelf.appendChild(el('div', 'chip', '배치할 유닛이 없습니다.'));
  }

  setCardDragging(id: string, on: boolean): void { this.cardEls.get(id)?.classList.toggle('dragging', on); }
  setCardSelected(id: string | null): void { this.cardEls.forEach((elm, cid) => elm.classList.toggle('selected', cid === id)); }
  setTargeting(on: boolean): void { document.body.classList.toggle('targeting', on); }

  setDropZone(state: 'field' | 'shelf' | 'off'): void {
    this.dropZone.className = state === 'off' ? '' : `on ${state}`;
    this.dropZone.textContent = state === 'field' ? '여기에 놓아 사용' : state === 'shelf' ? '손패로 돌아가려면 놓기' : '';
  }

  private buildCardEl(c: HandCard): HTMLElement | null {
    if (!CARD_BY_ID[c.id]) return null;
    const card = el('div', 'card');
    card.addEventListener('pointerdown', (e) => {
      if (card.dataset.playable === '1') this.onCardGrab(c.id, e as PointerEvent);
      else if (card.dataset.reason) this.onCardBlocked(card.dataset.reason);
    });
    this.updateCardEl(card, c);
    return card;
  }

  private updateCardEl(card: HTMLElement, c: HandCard): void {
    const def = CARD_BY_ID[c.id];
    const keep = `${card.classList.contains('dealing') ? ' dealing' : ''}${card.classList.contains('dragging') ? ' dragging' : ''}${card.classList.contains('selected') ? ' selected' : ''}`;
    card.className = `card el-${def.element}${c.playable ? '' : ' disabled'}${c.pinned ? ' pinned' : ''}${keep}`;
    card.dataset.playable = c.playable ? '1' : '0';
    card.dataset.reason = c.reason ?? '';
    card.innerHTML = `
      <div class="cost">${def.cost}</div>
      <div class="card-elem">${cardElemIcon(def.element)}</div>
      <div class="art">${cardIcon(def)}</div>
      <div class="name">${def.name}</div>
      <div class="desc">${def.text}</div>
      ${c.cdFrac && c.cdFrac > 0 ? `<div class="cd-overlay" style="height:${Math.round(c.cdFrac * 100)}%"></div>` : ''}`;
  }

  showPlacement(items: { id: string; name: string; element: string; kind: 'creature' | 'enemy'; species?: string; stage: 1 | 2 | 3; placed: boolean; dead?: boolean }[]): void {
    this.placementBar.style.display = 'flex';
    this.placementBar.innerHTML = '<div class="place-hint">유닛 카드를 전장으로 드래그해 배치하세요. 배치된 유닛을 드래그하면 위치를 바꿀 수 있습니다.</div>';
    const row = el('div', 'place-row');
    for (const it of items) {
      const stateLabel = it.placed ? '배치됨' : '대기';
      const chip = el('div', `place-chip${it.placed ? ' placed' : ''}`, `<span class="pc-ico">${cardElemIcon(it.element)}</span><span class="pc-name">${it.name}</span><span class="pc-state">${stateLabel}</span>`);
      applyUnitPortrait(chip.querySelector('.pc-ico') as HTMLElement, it);
      chip.onclick = () => this.onPlacementToggle(it.id);
      row.appendChild(chip);
    }
    this.placementBar.appendChild(row);
  }
  hidePlacement(): void { this.placementBar.style.display = 'none'; }

  private modal(html: string): HTMLElement {
    this.clearModal();
    const overlay = el('div', 'overlay-center');
    const scroll = el('div', 'scroll', html);
    overlay.appendChild(scroll);
    this.modalHost.appendChild(overlay);
    return scroll;
  }
  clearModal(): void { this.modalHost.innerHTML = ''; }

  showDraft(elements: Element[]): void {
    const scroll = this.modal('<h1>첫 동료 선택</h1><p>함께 성을 지킬 몬스터를 고르세요.</p><div class="choice-row draft-row"></div>');
    const row = scroll.querySelector('.choice-row')!;
    for (const elm of elements) {
      const s1 = MONSTERS[elm].stages[0];
      const card = el('div', `choice draft-card el-${elm}`, `<div class="dc-el">${ELEMENT_NAME_KO[elm]}</div><div class="dc-ico">${ELEMENT_ICON[elm]}</div><div class="ct">${s1.name}</div><div class="cd">${s1.role}</div>`);
      applyPortrait(card.querySelector('.dc-ico') as HTMLElement, elm, 1);
      card.onclick = () => { this.clearModal(); this.onDraftPick(elm); };
      row.appendChild(card);
    }
  }

  private bigCardHtml(cardId: string, extraCls = ''): string {
    const def = CARD_BY_ID[cardId];
    if (!def) return '';
    return `<div class="big-card el-${def.element} ${extraCls}" data-card="${cardId}"><div class="cost">${def.cost}</div><div class="card-elem">${cardElemIcon(def.element)}</div><div class="art">${cardIcon(def)}</div><div class="name">${def.name}</div><div class="meta">${cardMeta(def)}</div><div class="desc">${def.text}</div></div>`;
  }

  showEvolve(data: { from: string; to: string; element: Element; stage: 1 | 2 | 3; kind: 'creature' | 'enemy'; species?: string }): void {
    const scroll = this.modal(`<div class="evolve-stage el-${data.element}"><div class="evo-burst"></div><div class="evo-ring"></div><div class="evo-ico">${ELEMENT_ICON[data.element]}</div><div class="evo-title">진화</div><div class="evo-names"><span class="evo-from">${data.from}</span><span class="evo-arrow">→</span><span class="evo-to">${data.to}</span></div><p class="evo-sub">${data.stage}단으로 진화했습니다. 새로운 핵심 스킬을 배웠습니다.</p></div><div class="choice-row"><button class="btn primary" id="evo-ok">확인</button></div>`);
    // 실제 진화 단계·종류(크리처/적)에 맞는 포트레이트 (기존: 항상 3단 → 2단 진화 시 불일치 버그)
    applyUnitPortrait(scroll.querySelector('.evo-ico') as HTMLElement, { name: data.to, element: data.element, kind: data.kind, species: data.species, stage: data.stage });
    (scroll.querySelector('#evo-ok') as HTMLButtonElement).onclick = () => { this.clearModal(); this.onEvolveAck(); };
  }

  showCardGain(unit: UnitPortraitInfo, cardId: string): void {
    const scroll = this.modal(`<h1>새 스킬 획득</h1><div class="gain-head" style="display:flex;align-items:center;gap:14px;margin:6px 0 14px;text-align:left">${portraitDiv(unit.element)}<p><b>${unit.name}</b>이(가) 새 스킬을 배웠습니다.</p></div><div class="gain-stage">${this.bigCardHtml(cardId, 'gain-anim')}</div><div class="choice-row"><button class="btn primary" id="gain-ok">확인</button></div>`);
    applyUnitPortrait(scroll.querySelector('.modal-pic') as HTMLElement, unit);
    (scroll.querySelector('#gain-ok') as HTMLButtonElement).onclick = () => { this.clearModal(); this.onCardGainAck(); };
  }

  showCardReplace(unit: UnitPortraitInfo, newId: string, options: string[]): void {
    const scroll = this.modal(`<h1>카드가 가득 찼습니다</h1><div class="gain-head" style="display:flex;align-items:center;gap:14px;margin:6px 0 14px;text-align:left">${portraitDiv(unit.element)}<p><b>${unit.name}</b>은(는) 카드 5장까지만 장착할 수 있습니다.<br/>새로 배운 <b>${CARD_BY_ID[newId]?.name ?? ''}</b>을(를) 넣으려면 버릴 카드를 하나 고르세요.</p></div><div class="replace-row"></div>`);
    applyUnitPortrait(scroll.querySelector('.modal-pic') as HTMLElement, unit);
    const row = scroll.querySelector('.replace-row')!;
    for (const id of options) {
      const isNew = id === newId;
      const wrap = el('div', 'replace-slot', `${isNew ? '<div class="rs-tag new">새 카드</div>' : '<div class="rs-tag old">보유 중</div>'}${this.bigCardHtml(id, isNew ? 'gain-anim' : '')}`);
      wrap.onclick = () => { this.clearModal(); this.onCardReplacePick(id); };
      row.appendChild(wrap);
    }
  }

  showCaptureDiscard(data: { newName: string; newElement: string; newSpecies?: string; options: { id: string; name: string; sub: string; element: string; kind: 'creature' | 'enemy'; species?: string; stage: 1 | 2 | 3 }[] }): void {
    const scroll = this.modal(`<h1>원정대가 가득 찼습니다</h1><p>최대 ${MAX_MONSTERS}마리까지 함께할 수 있습니다. 보낼 동료를 고르거나 새 포획체를 놓아주세요.</p><div class="replace-row"></div>`);
    const row = scroll.querySelector('.replace-row')!;
    const mk = (id: string, name: string, sub: string, element: string, kind: 'creature' | 'enemy', species: string | undefined, stage: 1 | 2 | 3, isNew: boolean): void => {
      const wrap = el('div', 'replace-slot', `${isNew ? '<div class="rs-tag new">새 포획체</div>' : '<div class="rs-tag old">동료</div>'}<div class="big-card el-${element}"><div class="card-elem">${cardElemIcon(element)}</div><div class="art">${cardElemIcon(element)}</div><div class="name">${name}</div><div class="desc">${sub}</div></div>`);
      applyUnitPortrait(wrap.querySelector('.art') as HTMLElement, { name, element, kind, species, stage });
      wrap.onclick = () => { this.clearModal(); this.onCaptureDiscardPick(id); };
      row.appendChild(wrap);
    };
    for (const o of data.options) mk(o.id, o.name, o.sub, o.element, o.kind, o.species, o.stage, false);
    mk('__new__', data.newName, '방금 포획한 개체', data.newElement, 'enemy', data.newSpecies, 1, true);
  }

  showStageClear(stageLabel: string, rewards: string[]): void {
    const scroll = this.modal(`<h1>스테이지 클리어</h1><h2>${stageLabel}</h2><p>${rewards.join('<br/>')}</p><div class="choice-row"><button class="btn primary" id="next-btn">다음으로</button></div>`);
    (scroll.querySelector('#next-btn') as HTMLButtonElement).onclick = () => { this.clearModal(); this.onNext(); };
  }

  showNodeChoice(nodes: { kind: string; label: string; desc: string }[]): void {
    const scroll = this.modal('<h1>다음 길</h1><p>다음 목적지를 선택하세요.</p><div class="choice-row"></div>');
    const row = scroll.querySelector('.choice-row')!;
    for (const n of nodes) {
      const c = el('div', 'choice', `<div class="ct">${n.label}</div><div class="cd">${n.desc}</div>`);
      c.onclick = () => { this.clearModal(); this.onNode(n.kind); };
      row.appendChild(c);
    }
  }

  showBuffChoice(options: { id: string; label: string }[]): void {
    const scroll = this.modal('<h1>강화 선택</h1><p>하나를 선택하세요.</p><div class="choice-row"></div>');
    const row = scroll.querySelector('.choice-row')!;
    for (const o of options) {
      const c = el('div', 'choice', `<div class="ct">${o.label}</div>`);
      c.onclick = () => { this.clearModal(); this.onBuffPick(o.id); };
      row.appendChild(c);
    }
  }

  /** 스테이지 중간 보너스 강화 3택1 (갈림길 대체). */
  showBonus(options: { id: string; label: string }[]): void {
    const scroll = this.modal('<h1>✦ 보너스 강화 ✦</h1><p>다음 웨이브가 몰려오기 전에, 강화 하나를 챙기세요.</p><div class="choice-row"></div>');
    const row = scroll.querySelector('.choice-row')!;
    for (const o of options) {
      const c = el('div', 'choice', `<div class="ct">${o.label}</div>`);
      c.onclick = () => { playSfx('select'); this.clearModal(); this.onBonusPick(o.id); };
      row.appendChild(c);
    }
  }

  showEvent(node: { id: string; label: string; desc: string }): void {
    const scroll = this.modal(`<h1>${node.label}</h1><p>${node.desc}</p><div class="choice-row"><button class="btn primary" id="ev-ok">선택</button></div>`);
    (scroll.querySelector('#ev-ok') as HTMLButtonElement).onclick = () => { this.clearModal(); this.onEventPick(node.id); };
  }

  /** 상점 모달 — 골드로 성 회복/영구 강화 구매. 구매마다 Game이 다시 열어 잔액/상태 갱신. */
  showShop(data: { gold: number; items: { id: string; icon: string; label: string; desc: string; cost: number; disabled?: boolean; note?: string }[] }): void {
    const rows = data.items.map((it) => {
      const affordable = !it.disabled && data.gold >= it.cost;
      return `<div class="shop-item${affordable ? '' : ' disabled'}" data-id="${it.id}">
        <div class="si-ico">${it.icon}</div>
        <div class="si-text"><div class="si-label">${it.label}</div><div class="si-desc">${it.note ?? it.desc}</div></div>
        <div class="si-cost">🪙 ${it.cost}</div>
      </div>`;
    }).join('');
    const scroll = this.modal(`<h1>🛒 상점</h1><p class="shop-gold">보유 골드 <b>${data.gold}</b></p>
      <div class="shop-list">${rows}</div>
      <div class="choice-row"><button class="btn primary" id="shop-ok">닫기</button></div>`);
    scroll.querySelectorAll('.shop-item:not(.disabled)').forEach((row) => {
      (row as HTMLElement).onclick = () => { playSfx('coin'); this.onShopBuy((row as HTMLElement).dataset.id!); };
    });
    (scroll.querySelector('#shop-ok') as HTMLButtonElement).onclick = () => { playSfx('click'); this.clearModal(); this.onShopClose(); };
  }

  showWin(finalBossName: string): void {
    const scroll = this.modal(`<h1>승리!</h1><p>최종 보스 ${finalBossName}을(를) 쓰러뜨리고 성을 지켜냈습니다.</p><div class="choice-row"><button class="btn primary" id="again">새 모험</button></div>`);
    (scroll.querySelector('#again') as HTMLButtonElement).onclick = () => { this.clearModal(); this.onRestart(); };
  }

  showLose(reason: string): void {
    const scroll = this.modal(`<h1>패배</h1><p>${reason}</p><p>성은 무너졌지만, 다음 원정은 더 나아질 겁니다.</p><div class="choice-row"><button class="btn primary" id="again">다시 도전</button></div>`);
    (scroll.querySelector('#again') as HTMLButtonElement).onclick = () => { this.clearModal(); this.onRestart(); };
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const t = el('div', `toast ${kind}`, text);
    this.toastLayer.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  private buildViewer(): void {
    this.viewerUI = el('div');
    this.viewerUI.id = 'viewer-ui';
    this.viewerUI.innerHTML = `<div id="viewer-list" class="panel"><h2>몬스터</h2><div id="roster-items"></div></div><div id="viewer-info" class="panel"><div id="info-body">몬스터를 선택하세요.</div></div><button class="btn primary" id="viewer-close">닫기</button>`;
    this.root.appendChild(this.viewerUI);
    (this.viewerUI.querySelector('#viewer-close') as HTMLButtonElement).onclick = () => this.onCloseViewer();
  }

  openViewer(roster: OwnedUnit[], selectedUid?: string): void {
    this.setGameplayVisible(false); // 전투 HUD/선반/전투버튼이 뷰어 뒤로 비쳐 보이지 않게 숨김
    this.viewerUI.classList.add('on');
    const list = this.viewerUI.querySelector('#roster-items')!;
    list.innerHTML = '';
    const selIndex = Math.max(0, roster.findIndex((u) => u.uid === selectedUid));
    roster.forEach((u, i) => {
      const item = el('div', 'roster-item' + (i === selIndex ? ' sel' : ''), `<div class="ri-pic">${ELEMENT_ICON[u.element]}</div><div class="ri-text"><div class="ri-name">${displayName(u)}</div><div class="ri-sub">${ELEMENT_NAME_KO[u.element]} · Lv${u.level} · ${u.stage}단</div></div>`);
      applyOwnedPortrait(item.querySelector('.ri-pic') as HTMLElement, u);
      item.onclick = () => {
        list.querySelectorAll('.roster-item').forEach((x) => x.classList.remove('sel'));
        item.classList.add('sel');
        this.onViewerSelect(u.uid);
        this.showUnitInfo(u);
      };
      list.appendChild(item);
    });
    const sel = roster[selIndex];
    if (sel) { this.onViewerSelect(sel.uid); this.showUnitInfo(sel); }
  }
  closeViewer(): void { this.viewerUI.classList.remove('on'); }

  private buildLobby(): void {
    this.lobbyUI = el('div');
    this.lobbyUI.id = 'lobby';
    this.lobbyUI.style.display = 'none';
    this.lobbyUI.innerHTML = `<div class="lobby-head"><button class="btn lobby-title-btn" id="lobby-title">☰ 타이틀</button><h1>몬스터 원정대</h1><div id="lobby-stage" class="lobby-stage"></div></div><div class="lobby-body"><div class="lobby-left panel"><h2>원정대</h2><div id="lobby-roster" class="lobby-roster"></div></div><div class="lobby-menu"><div class="menu-card" id="lobby-manage"><div class="mc-ico">🎴</div><div class="mc-title">카드 관리</div><div class="mc-sub">스킬 카드 장착</div></div><div class="menu-card" id="lobby-shop"><div class="mc-ico">🛒</div><div class="mc-title">상점</div><div class="mc-sub">골드로 강화 구매</div></div><div class="menu-card" id="lobby-viewer"><div class="mc-ico">🔍</div><div class="mc-title">몬스터 보기</div><div class="mc-sub">3D 뷰어 · 이름 짓기</div></div><div class="menu-card" id="lobby-dex"><div class="mc-ico">📖</div><div class="mc-title">도감</div><div class="mc-sub">수집 컬렉션</div></div></div></div><button class="btn primary lobby-cta" id="lobby-battle"><span class="lc-ico">⚔️</span><span class="lc-title">출정</span><span class="lc-sub" id="lobby-next-stage"></span></button>`;
    this.root.appendChild(this.lobbyUI);
    (this.lobbyUI.querySelector('#lobby-battle') as HTMLElement).onclick = () => this.onEnterBattle();
    (this.lobbyUI.querySelector('#lobby-manage') as HTMLElement).onclick = () => this.onManage();
    (this.lobbyUI.querySelector('#lobby-shop') as HTMLElement).onclick = () => { playSfx('click'); this.onShop(); };
    (this.lobbyUI.querySelector('#lobby-viewer') as HTMLElement).onclick = () => this.onOpenViewer();
    (this.lobbyUI.querySelector('#lobby-dex') as HTMLElement).onclick = () => { playSfx('click'); this.onDex(); };
    (this.lobbyUI.querySelector('#lobby-title') as HTMLElement).onclick = () => { playSfx('click'); this.onToTitle(); };
  }

  showLobby(info: { stageNo: number; stageLabel: string; gold: number; roster: OwnedUnit[]; capturedCount: number }): void {
    this.setGameplayVisible(false);
    this.hideManage();
    this.lobbyUI.style.display = 'flex';
    (this.lobbyUI.querySelector('#lobby-stage') as HTMLElement).innerHTML = `골드 ${info.gold} · 원정대 ${info.roster.length}/${MAX_MONSTERS} · 포획 도감 ${info.capturedCount}`;
    (this.lobbyUI.querySelector('#lobby-next-stage') as HTMLElement).textContent = `스테이지 ${info.stageNo} · ${info.stageLabel}`;
    const r = this.lobbyUI.querySelector('#lobby-roster') as HTMLElement;
    r.innerHTML = '';
    r.appendChild(el('div', 'lobby-mon', '<div class="lm-ico">🏰</div><div class="lm-name">성</div><div class="lm-sub">공용 카드 5장</div>'));
    for (const u of info.roster) {
      const chip = el('div', 'lobby-mon', `<div class="lm-ico">${cardElemIcon(u.element)}</div><div class="lm-name">${displayName(u)}</div><div class="lm-sub">Lv${u.level} · ${u.stage}단</div>`);
      applyOwnedPortrait(chip.querySelector('.lm-ico') as HTMLElement, u);
      r.appendChild(chip);
    }
    if (info.roster.length === 0) r.appendChild(el('div', 'lobby-empty', '아직 동료가 없습니다.<br/>출정해서 첫 동료를 선택하세요.'));
  }
  hideLobby(): void { this.lobbyUI.style.display = 'none'; }

  // ── 노드식 모험 지도 (스테이지 선택) ──────────────────────────
  private buildStageMap(): void {
    this.stageMapUI = el('div');
    this.stageMapUI.id = 'stagemap';
    this.stageMapUI.style.display = 'none';
    this.root.appendChild(this.stageMapUI);
  }

  /**
   * 마리오식 노드 지도. 클리어=체크·현재=반짝(진입 가능)·미래=자물쇠.
   * 현재 노드만 클릭해 진입. 굽이치는 경로로 10개 스테이지를 한눈에.
   */
  showStageMap(data: { stages: { no: number; label: string; theme: string; boss?: 'mini' | 'final'; state: 'cleared' | 'current' | 'locked' }[] }): void {
    this.setGameplayVisible(false);
    this.hideLobby();
    this.clearModal();
    const W = 1000, H = 460, padX = 70, padY = 84;
    const N = data.stages.length;
    const pts = data.stages.map((s, i) => {
      const x = padX + (N > 1 ? i * ((W - 2 * padX) / (N - 1)) : 0);
      const y = H / 2 - Math.sin(i * 0.8) * (H / 2 - padY); // 굽이치는 경로
      return { x, y, s };
    });
    let segs = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const on = data.stages[i + 1].state !== 'locked'; // 도달한 구간 = 금색 실선
      segs += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="smap-seg ${on ? 'on' : 'off'}"/>`;
    }
    const nodes = pts.map(({ x, y, s }) => {
      const icon = THEME_ICON[s.theme] ?? '❔';
      const badge = s.state === 'cleared' ? '✓' : s.state === 'locked' ? '🔒' : icon;
      const boss = s.boss === 'final' ? '<span class="smap-boss">👑</span>' : s.boss === 'mini' ? '<span class="smap-boss">💀</span>' : '';
      const dis = s.state === 'current' ? '' : 'disabled';
      return `<button class="smap-node ${s.state}${s.boss ? ' boss' : ''}" data-no="${s.no}" title="${s.label}" ${dis}
        style="left:${(x / W) * 100}%;top:${(y / H) * 100}%">
        <span class="smap-badge">${badge}</span><span class="smap-num">${s.no}</span>${boss}
      </button>`;
    }).join('');
    const cur = data.stages.find((s) => s.state === 'current');
    const subText = cur ? `${cur.no}. ${cur.label} — 진입하려면 반짝이는 노드를 누르세요` : '모든 스테이지를 정복했습니다!';
    this.stageMapUI.innerHTML = `
      <div class="smap-head">
        <button class="btn smap-back" id="smap-back">← 원정대</button>
        <h1>모험 지도</h1>
        <div class="smap-sub">${subText}</div>
      </div>
      <div class="smap-canvas">
        <svg class="smap-lines" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${segs}</svg>
        ${nodes}
      </div>`;
    this.stageMapUI.style.display = 'flex';
    (this.stageMapUI.querySelector('#smap-back') as HTMLButtonElement).onclick = () => { playSfx('click'); this.onStageMapBack(); };
    this.stageMapUI.querySelectorAll('.smap-node.current').forEach((n) => {
      (n as HTMLButtonElement).onclick = () => { playSfx('select'); this.onStageEnter(); };
    });
  }
  hideStageMap(): void { this.stageMapUI.style.display = 'none'; }

  /**
   * 로비 배경 이미지 적용: public/assets/ui/lobby_bg.{jpg,png,webp} 중 존재하는 것을 자동 사용.
   * 파일이 없으면 theme.css 기본 우드톤 배경 유지. 어둡게 오버레이해 위 패널 가독성 확보.
   */
  private probeLobbyBg(): void {
    const base = import.meta.env.BASE_URL;
    const candidates = ['assets/ui/lobby_bg.jpg', 'assets/ui/lobby_bg.png', 'assets/ui/lobby_bg.webp'];
    const tryNext = (i: number): void => {
      if (i >= candidates.length) return;
      const img = new Image();
      img.onload = () => {
        this.lobbyUI.style.backgroundImage = `linear-gradient(rgba(20,14,8,0.42), rgba(20,14,8,0.66)), url("${base}${candidates[i]}")`;
        this.lobbyUI.style.backgroundSize = 'cover';
        this.lobbyUI.style.backgroundPosition = 'center';
      };
      img.onerror = () => tryNext(i + 1);
      img.src = base + candidates[i];
    };
    tryNext(0);
  }

  private buildManage(): void {
    this.manageUI = el('div');
    this.manageUI.id = 'manage';
    this.manageUI.style.display = 'none';
    this.manageUI.innerHTML = `<div class="manage-head"><h1>카드 관리</h1><button class="btn" id="manage-close">로비로</button></div><div class="manage-body"><div id="manage-holders" class="manage-holders panel"></div><div id="manage-cards" class="manage-cards panel"></div></div>`;
    this.root.appendChild(this.manageUI);
    (this.manageUI.querySelector('#manage-close') as HTMLButtonElement).onclick = () => this.onManageClose();
  }

  showManage(data: { holders: { id: string; name: string; element: string; level: number; kind?: 'creature' | 'enemy'; species?: string; stage?: 1 | 2 | 3 }[]; selected: string; level: number; equippedCount: number; cap: number; avgCost: number; deckSummary: string; readOnly?: boolean; cards: { id: string; name: string; element: string; cost: number; text: string; learnLevel: number; learned: boolean; equipped: boolean }[] }): void {
    this.setGameplayVisible(false);
    this.hideLobby();
    this.manageUI.style.display = 'flex';
    const h = this.manageUI.querySelector('#manage-holders') as HTMLElement;
    h.innerHTML = '<h2>대상</h2>';
    for (const ho of data.holders) {
      const item = el('div', 'holder-item' + (ho.id === data.selected ? ' sel' : ''), `<span class="hi-ico">${cardElemIcon(ho.element)}</span><span class="hi-name">${ho.name}</span><span class="hi-lv">Lv${ho.level}</span>`);
      if (ho.kind && ho.stage) applyUnitPortrait(item.querySelector('.hi-ico') as HTMLElement, { name: ho.name, element: ho.element, kind: ho.kind, species: ho.species, stage: ho.stage });
      item.onclick = () => this.onManageSelectHolder(ho.id);
      h.appendChild(item);
    }
    const cc = this.manageUI.querySelector('#manage-cards') as HTMLElement;
    const header = data.readOnly
      ? `<h2>전체 카드 ${data.cards.length}</h2><div class="deck-summary">${data.deckSummary}</div>`
      : `<h2>장착 카드 ${data.equippedCount}/${data.cap}</h2><div class="deck-summary">평균 비용 ${data.avgCost.toFixed(1)} · ${data.deckSummary}</div>`;
    cc.innerHTML = `${header}<div class="mc-grid"></div>`;
    const grid = cc.querySelector('.mc-grid') as HTMLElement;
    for (const c of data.cards) {
      const def = CARD_BY_ID[c.id];
      // 전투 손패와 동일한 .card UI + 관리 전용 하단 상태(.mc-foot).
      const cls = `card mcard el-${c.element}${c.equipped ? ' equipped' : ''}${c.learned ? '' : ' locked'}`;
      const foot = data.readOnly
        ? (def ? cardMeta(def) : `Lv${c.learnLevel}`)
        : (c.learned ? (c.equipped ? '장착 중 · 탭하여 해제' : '탭하여 장착') : `Lv${c.learnLevel} 필요`);
      const card = el('div', cls, `<div class="cost">${c.cost}</div><div class="card-elem">${cardElemIcon(c.element)}</div><div class="art">${def ? cardIcon(def) : '❔'}</div><div class="name">${c.name}</div><div class="desc">${c.text}</div><div class="mc-foot" style="margin-top:auto;font-size:11px;opacity:0.85;padding-top:4px">${foot}</div>`);
      if (!data.readOnly && c.learned) card.onclick = () => this.onManageToggle(data.selected, c.id);
      grid.appendChild(card);
    }
  }
  hideManage(): void { this.manageUI.style.display = 'none'; }

  private showUnitInfo(u: OwnedUnit): void {
    const s = deriveStats(u);
    const isEnemy = u.kind === 'enemy';
    const edef = isEnemy ? ENEMIES[u.species ?? ''] : null;
    const roleText = isEnemy ? (edef?.desc ?? '') : MONSTERS[u.element].stages[u.stage - 1].role;
    const traitLabel = isEnemy ? capturedTraitLabel(edef?.tier) : '';
    const traitDesc = isEnemy ? capturedTraitDesc(edef?.tier) : '';
    const stageRow = isEnemy ? `<div class="row"><span>구분</span><span>포획 개체 · ${u.stage}단</span></div>` : `<div class="row"><span>진화 단계</span><span>${u.stage}단 / 3</span></div><div class="row"><span>진화 레벨</span><span>${MONSTERS[u.element].evolveLevels.join(' / ')}</span></div>`;
    const body = this.viewerUI.querySelector('#info-body')!;
    body.innerHTML = `<div class="info-pic">${ELEMENT_ICON[u.element]}</div><h2>${displayName(u)} <button class="rename-btn" id="rename-btn" title="이름 짓기">수정</button></h2><div class="row"><span>종족</span><span>${unitName(u)}</span></div><div class="row"><span>속성</span><span>${ELEMENT_NAME_KO[u.element]}</span></div><div class="row"><span>레벨</span><span>Lv ${u.level}</span></div>${stageRow}${traitLabel ? `<div class="row"><span>포획 특성</span><span>${traitLabel}</span></div>` : ''}<div class="row"><span>❤️ 체력</span><span>${s.hp}</span></div><div class="row"><span>⚔️ 공격력</span><span>${s.attack}</span></div><div class="row"><span>🎯 사거리</span><span>${s.range.toFixed(1)}</span></div><div class="row"><span>⚡ 공격속도</span><span>${s.attackSpeed.toFixed(2)}</span></div><div class="row"><span>💥 치명타 확률</span><span>${Math.round(s.critChance * 100)}%</span></div><div class="row"><span>🔥 치명타 피해</span><span>+${Math.round((s.critDmg - 1) * 100)}%</span></div><div class="row"><span>🤝 유대 보너스</span><span>+${Math.round(s.bond * 100)}%</span></div><p style="margin-top:10px;font-size:12.5px;opacity:0.9">${traitDesc || roleText}</p>`;
    applyOwnedPortrait(body.querySelector('.info-pic') as HTMLElement, u);
    (body.querySelector('#rename-btn') as HTMLButtonElement).onclick = () => this.showRenameDialog(u);
  }

  private showRenameDialog(u: OwnedUnit): void {
    const scroll = this.modal(`<h1>이름 짓기</h1><p><b>${unitName(u)}</b>에게 별명을 지어주세요. 비워두면 기본 이름을 사용합니다.</p><div class="rename-row"><input id="rename-input" maxlength="8" placeholder="${unitName(u)}" value="${u.nickname ?? ''}" /></div><div class="choice-row"><button class="btn primary" id="rename-ok">확인</button><button class="btn" id="rename-cancel">취소</button></div>`);
    const input = scroll.querySelector('#rename-input') as HTMLInputElement;
    input.focus();
    const confirm = () => { this.clearModal(); this.onRename(u.uid, input.value); };
    (scroll.querySelector('#rename-ok') as HTMLButtonElement).onclick = confirm;
    input.onkeydown = (e) => { if (e.key === 'Enter') confirm(); };
    (scroll.querySelector('#rename-cancel') as HTMLButtonElement).onclick = () => this.clearModal();
  }
}

function applyPortrait(elm: HTMLElement | null, element: Element, stage: number): void {
  if (!elm) return;
  getPortrait(element, stage).then((url) => {
    if (!url) return;
    elm.textContent = '';
    elm.style.backgroundImage = `url("${url}")`;
    elm.classList.add('has-img');
  });
}

function enemyTierShort(tier?: string): string {
  if (tier === 'swarm') return '무리';
  if (tier === 'flyer') return '비행';
  if (tier === 'tank') return '탱커';
  if (tier === 'healer') return '지원';
  if (tier === 'elite') return '정예';
  if (tier === 'miniboss') return '거대';
  if (tier === 'boss') return '보스';
  return '포획';
}

function initials(name: string): string {
  return Array.from(name.replace(/\s+/g, '')).slice(0, 2).join('') || '?';
}

function applyEnemyPortrait(elm: HTMLElement | null, element: string, species?: string, name?: string): void {
  if (!elm) return;
  const def = species ? ENEMIES[species] : undefined;
  const label = initials(name ?? def?.name ?? cardElemIcon(element));
  elm.textContent = '';
  elm.style.backgroundImage = '';
  elm.classList.add('enemy-portrait', `el-${element}`);
  elm.innerHTML = `<span class="ep-mark">${cardElemIcon(element)}</span><span class="ep-face">${label}</span><span class="ep-tier">${enemyTierShort(def?.tier)}</span>`;
  // 실제 모델을 오프스크린 렌더해 썸네일로 교체 (로드되면). 실패 시 위 이니셜 유지.
  if (species) {
    getEnemyPortrait(species).then((url) => {
      if (!url) return;
      elm.innerHTML = '';
      elm.classList.remove('enemy-portrait');
      elm.style.backgroundImage = `url("${url}")`;
      elm.classList.add('has-img');
    });
  }
}

function applyUnitPortrait(elm: HTMLElement | null, unit: { name: string; element: string; kind: 'creature' | 'enemy'; species?: string; stage: 1 | 2 | 3 }): void {
  if (!elm) return;
  elm.classList.remove('has-img', 'enemy-portrait');
  elm.className = elm.className.replace(/\bel-(fire|water|grass|light|dark|neutral|normal)\b/g, '').trim();
  if (unit.kind === 'enemy') {
    applyEnemyPortrait(elm, unit.element, unit.species, unit.name);
    return;
  }
  applyPortrait(elm, unit.element as Element, unit.stage);
}

function applyOwnedPortrait(elm: HTMLElement | null, unit: OwnedUnit): void {
  applyUnitPortrait(elm, {
    name: displayName(unit),
    element: unit.element,
    kind: unit.kind,
    species: unit.species,
    stage: unit.stage,
  });
}
