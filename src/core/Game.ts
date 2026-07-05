import { Scene } from '../render/Scene';
import { MonsterViewer } from '../render/MonsterViewer';
import { UI, type HandCard } from '../ui/UI';
import { Tutorial } from '../ui/Tutorial';
import { state, unitName, displayName, EQUIP_CAP, type CardGain, type SpecialKind } from './GameState';
import { saveRun, loadRun, clearRun, hasRun } from './save';
import { Battle } from '../systems/Battle';
import { STAGES, EVENT_NODES, BUFF_NODES } from '../data/stages';
import { ENEMIES } from '../data/enemies';
import { MONSTERS } from '../data/monsters';
import { cardsOfCharacter, CARD_BY_ID, cardIcon, cardRole } from '../data/cards';
import { ITEMS, ITEM_BY_ID } from '../data/items';
import type { Element } from './types';
import { CAPTURE_CARD_ID, DIFFICULTY_JUMP_MULT, FIXED_DT, MAX_MONSTERS } from '../data/constants';
import { bus } from './events';
import { settings, saveSettings } from './Settings';
import { playSfx } from '../audio/Sfx';
import { setBgmTrack, updateBgmSettings } from '../audio/Bgm';

type Mode = 'title' | 'lobby' | 'battle' | 'viewer' | 'manage' | 'stagemap';

/** 최상위 앱 컨트롤러: 씬/UI/상태/전투를 조율하고 메타 루프(스테이지 진행/보상/갈림길)를 돌린다. */
export class Game {
  private scene: Scene;
  private ui: UI;
  private tutorial: Tutorial;
  private viewer: MonsterViewer;
  private battle: Battle | null = null;
  private mode: Mode = 'title';
  private paused = false; // 모달 표시 중 전투 정지
  private acc = 0;
  private last = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.scene = new Scene(canvas);
    this.viewer = new MonsterViewer(this.scene.renderer);
    this.ui = new UI(uiRoot);
    this.tutorial = new Tutorial(uiRoot);
    this.wireUI();
    this.wireInput();
    this.wireFieldDrag();
    this.wireBus();
    this.ui.showTitle(hasRun());
    setBgmTrack('lobby');
    if (import.meta.env.DEV) {
      (window as unknown as { __scene: Scene }).__scene = this.scene;
      (window as unknown as { __game: Game }).__game = this;
      (window as unknown as { __state: typeof state }).__state = state;
      import('three').then((T) => { (window as unknown as { __THREE: typeof T }).__THREE = T; });
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  private wireUI(): void {
    this.ui.onStart = () => this.startRun();
    this.ui.onContinue = () => this.continueRun();
    this.ui.onBeginWave = () => { this.battle?.beginWave(); this.refreshHand(); this.refreshPlacement(); };
    this.ui.onCardGrab = (id, ev) => this.beginCardDrag(id, ev);
    this.ui.onUnitCardGrab = (id, ev) => this.beginUnitCardDrag(id, ev);
    // 배속은 설정에 영속화 — 스테이지/웨이브 전환 시 startStage가 settings.speed로 되돌려도 유지되도록.
    this.ui.onSpeedChange = (speed) => { this.speed = speed; settings.speed = speed; saveSettings(); this.ui.toast(`전투 속도 ${speed}배`, 'info'); };
    this.ui.onCardBlocked = (reason) => this.ui.warn(reason);
    this.ui.onOpenViewer = () => this.openViewer();
    this.ui.onCloseViewer = () => this.closeViewer();
    this.ui.onViewerSelect = (uid) => {
      const u = state.roster.find((x) => x.uid === uid);
      if (u) this.viewer.setUnit(u);
    };
    this.ui.onRename = (uid, name) => {
      state.setNickname(uid, name);
      saveRun();
      const u = state.roster.find((x) => x.uid === uid);
      if (u) this.ui.toast(`이름 확정: ${displayName(u)}`, 'good');
      if (this.mode === 'viewer') this.ui.openViewer(state.roster, uid); // 선택 유닛 유지하며 갱신
    };
    this.ui.onSpecialEnter = () => this.enterSpecialNode();
    this.ui.onDraftPick = (el) => this.pickDraft(el);
    this.ui.onEventPick = (id) => { this.applyEvent(id); this.afterEvent(); };
    this.ui.onNext = () => this.afterStageClear();
    this.ui.onCardGainAck = () => this.ackCardGain();
    this.ui.onEvolveAck = () => this.onEvolveAck();
    this.ui.onCardReplacePick = (discardId) => this.pickCardReplace(discardId);
    this.ui.onRestart = () => { clearRun(); this.startRun(); };
    this.ui.onPlacementToggle = (_id) => {};
    this.ui.onEnterBattle = () => this.openStageMap();
    this.ui.onStageEnter = () => { this.ui.hideStageMap(); this.enterBattle(); };
    this.ui.onStageMapBack = () => { this.ui.hideStageMap(); this.showLobby(); };
    this.ui.onManage = () => this.openManage();
    this.ui.onManageClose = () => this.showLobby();
    this.ui.onSettings = () => this.ui.showSettings();
    this.ui.onSettingsChange = () => { this.speed = settings.speed; updateBgmSettings(); };
    this.ui.onDex = () => this.ui.showDex();
    this.ui.onDexView = (d) => this.openDexView(d);
    this.ui.onDexViewClose = () => this.closeDexView();
    this.ui.onExit = () => this.exitBattle();
    this.ui.onToTitle = () => this.toTitle();
    this.ui.onManageSelectHolder = (id) => { this.manageHolder = id; this.renderManage(); };
    this.ui.onManageToggle = (holderId, cardId) => this.toggleEquip(holderId, cardId);
    this.ui.onCaptureDiscardPick = (id) => this.onCaptureDiscardPick(id);
    this.ui.onCaptureReject = () => this.onCaptureReject();
    this.ui.onShopBuy = (id) => this.buyShopItem(id);
    this.ui.onShopReroll = () => this.rerollShop();
    this.ui.onShopClose = () => this.backToStageMap(); // 상점(특수 노드) 닫으면 전투 정리 후 스테이지 지도로
    this.ui.onItemAssign = (uid) => this.assignItem(uid);
  }

  private lastPhase = '';
  private speed: 1 | 2 | 3 = 1;
  private normalizeRosterCap(): void {
    state.placementCap = MAX_MONSTERS;
    if (state.roster.length > MAX_MONSTERS) state.roster = state.roster.slice(0, MAX_MONSTERS);
  }

  private refreshPlacement(): void {
    this.ui.hidePlacement();
  }

  private wireInput(): void {
    // 숫자키 = 손패 카드 스마트 시전.
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'battle' || !this.battle) return;
      if (this.paused) return; // 모달(성장/보너스/포획/클리어) 표시 중엔 ESC 포함 모든 입력 무시
      if (e.code === 'Escape') { this.exitBattle(); return; }
      if (e.code.startsWith('Digit')) {
        const idx = parseInt(e.code.slice(5)) - 1;
        const id = this.battle.deck.hand[idx];
        if (id) this.smartCast(id);
      }
    });
  }

  // ── 유닛 위치 변경 (배치 페이즈: 필드에서 유닛을 드래그해 슬롯 이동/교환) ──
  private unitDragActive = false;
  private wireFieldDrag(): void {
    this.scene.renderer.domElement.addEventListener('pointerdown', (e) => this.onFieldPointerDown(e));
  }

  private onFieldPointerDown(e: PointerEvent): void {
    if (this.unitDragActive) return;
    if (this.mode !== 'battle' || !this.battle || this.paused) return;
    if (this.battle.phase !== 'placement') return;
    const pt = this.scene.groundPoint(e.clientX, e.clientY);
    if (!pt) return;
    const m = this.battle.unitNear(pt.x, pt.z, 1.6);
    if (!m) return; // 유닛을 집지 않았으면 필드 클릭 무시 (카드/기타 동작 방해 안 함)
    this.scene.showRangePreview(m.pos.x, m.pos.z, m.stats.range);
    this.unitDragActive = true;
    e.preventDefault();
    document.body.style.userSelect = 'none';
    let hlSlot = -1;
    const move = (ev: PointerEvent) => {
      if (!this.battle) return;
      const p = this.scene.groundPoint(ev.clientX, ev.clientY);
      if (!p) return;
      m.view.position.x = p.x; m.view.position.z = p.z; // 모델이 커서를 따라옴
      this.scene.showRangePreview(p.x, p.z, m.stats.range);
      const slot = this.battle.nearestSlot(p.x, p.z);
      if (slot !== hlSlot) {
        if (hlSlot >= 0) this.scene.setSlotHighlight(hlSlot, false);
        this.scene.setSlotHighlight(slot, true);
        hlSlot = slot;
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      this.unitDragActive = false;
      if (hlSlot >= 0) this.scene.setSlotHighlight(hlSlot, false);
      this.scene.hideRangePreview();
      if (!this.battle) return;
      const p = this.scene.groundPoint(ev.clientX, ev.clientY);
      const slot = p ? this.battle.nearestSlot(p.x, p.z) : -1;
      if (slot >= 0) this.battle.moveUnitToSlot(m, slot);
      else this.battle.resnapUnit(m);
      this.refreshPlacement();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ── 카드 사용 (더블탭=스마트, 드래그=정밀) ──
  private dragId: string | null = null;
  private dragGhost: HTMLElement | null = null;
  private dragMoved = false;
  private lastTapId = '';
  private lastTapAt = 0;
  private tapHintShown = false;
  private captureHintShown = false;

  /** 하단 카드 선반 높이(px) — 그 위쪽이 전장. isOverField 판정용. */
  private static readonly SHELF_H = 220;
  /** 더블탭 인정 간격(ms) */
  private static readonly DBL_MS = 350;

  private isOverField(clientY: number): boolean {
    return clientY < window.innerHeight - Game.SHELF_H;
  }

  /** 더블탭/키: 지점은 전투가 스마트 타깃(최전방). */
  private smartCast(id: string): void {
    if (!this.battle || this.paused) return;
    this.battle.playCard(id);
    this.refreshHand();
  }

  /**
   * 카드 포인터다운 → 전장으로 드래그하면 드롭 지점에 정밀 시전.
   * 이동 없이 떼면 탭으로 간주하고, 같은 카드가 350ms 내 두 번 탭되면 스마트 시전(더블탭).
   */
  private beginCardDrag(id: string, ev: PointerEvent): void {
    if (!this.battle || this.mode !== 'battle' || this.paused) return;
    this.dragId = id;
    this.dragMoved = false;
    const isCapture = CARD_BY_ID[id]?.effect.kind === 'capture';
    const startX = ev.clientX, startY = ev.clientY;
    const move = (e: PointerEvent) => {
      if (!this.dragId) return;
      if (!this.dragMoved && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
      if (!this.dragMoved) {
        this.dragMoved = true;
        document.body.style.userSelect = 'none'; // 드래그 중 텍스트 선택 방지
        this.ui.setCardSelected(null); // 선택 강조 해제
        this.ui.setCardDragging(this.dragId, true); // 원본 카드 흐리게(하스스톤식)
        this.dragGhost = this.makeDragGhost(this.dragId);
      }
      e.preventDefault();
      if (this.dragGhost) { this.dragGhost.style.left = `${e.clientX}px`; this.dragGhost.style.top = `${e.clientY}px`; }
      const overField = this.isOverField(e.clientY);
      this.ui.setTargeting(overField);
      this.ui.setDropZone(overField ? 'field' : 'shelf'); // 놓기/취소 안내
      // 포획구 조준 미리보기: 착지 지점의 포획 판정 반경/상태를 링으로 표시
      if (isCapture && overField) {
        const pt = this.scene.groundPoint(e.clientX, e.clientY);
        if (pt && this.battle) { const h = this.battle.captureHint(pt.x, pt.z); this.scene.setCapturePreview(pt.x, pt.z, h.radius, h.status, h.label); }
      } else {
        this.scene.hideCapturePreview();
      }
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      this.ui.setTargeting(false);
      this.ui.setDropZone('off');
      this.scene.hideCapturePreview();
      if (this.dragGhost) { this.dragGhost.remove(); this.dragGhost = null; }
      const upId = this.dragId; this.dragId = null;
      if (upId) this.ui.setCardDragging(upId, false);
      if (!upId || !this.battle) return;
      if (this.dragMoved) {
        // 드래그 시전 (선반 위에서 떼면 취소)
        if (!this.isOverField(e.clientY)) return;
        const pt = this.scene.groundPoint(e.clientX, e.clientY);
        this.battle.playCard(upId, pt ?? undefined);
        this.refreshHand();
        return;
      }
      // 제자리 탭 → 더블탭 판정
      if (this.lastTapId === upId && e.timeStamp - this.lastTapAt < Game.DBL_MS) {
        this.lastTapId = ''; this.lastTapAt = 0;
        this.ui.setCardSelected(null);
        this.smartCast(upId);
      } else {
        // 첫 탭: 카드 강조 + 최초 1회 사용법 안내
        this.lastTapId = upId; this.lastTapAt = e.timeStamp;
        this.ui.setCardSelected(upId);
        if (!this.tapHintShown && !this.tutorial.isActive) { this.tapHintShown = true; this.ui.toast('한 번 더 탭하거나 전장으로 드래그해 사용', 'info'); }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private makeDragGhost(id: string): HTMLElement {
    const ghost = document.createElement('div');
    ghost.className = 'card-drag-ghost';
    const def = CARD_BY_ID[id];
    const icon = def ? cardIcon(def) : '⚪';
    const name = def?.name ?? '카드';
    ghost.innerHTML = `<div class="dg-ico">${icon}</div><div class="dg-name">${name}</div>`;
    document.body.appendChild(ghost);
    return ghost;
  }

  private beginUnitCardDrag(id: string, ev: PointerEvent): void {
    if (!this.battle || this.mode !== 'battle' || this.paused || this.battle.phase !== 'placement') return;
    const startX = ev.clientX;
    const startY = ev.clientY;
    let moved = false;
    let hlSlot = -1;
    const placed = this.battle.placedUnit(id);
    const range = this.battle.placeableRange(id);
    const move = (e: PointerEvent) => {
      if (!this.battle) return;
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
      if (!moved) {
        moved = true;
        this.battle.showUnitGhost(id); // 반투명 캐릭터 모델을 필드에 표시(직관적 배치)
        document.body.style.userSelect = 'none';
      }
      e.preventDefault();
      const p = this.scene.groundPoint(e.clientX, e.clientY);
      if (!p) return;
      if (placed) {
        placed.view.position.x = p.x;
        placed.view.position.z = p.z;
      }
      this.battle.moveUnitGhost(p.x, p.z);
      this.scene.showRangePreview(p.x, p.z, range);
      const slot = this.battle.nearestSlot(p.x, p.z);
      if (slot !== hlSlot) {
        if (hlSlot >= 0) this.scene.setSlotHighlight(hlSlot, false);
        this.scene.setSlotHighlight(slot, true);
        hlSlot = slot;
      }
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      this.battle?.hideUnitGhost();
      if (hlSlot >= 0) this.scene.setSlotHighlight(hlSlot, false);
      this.scene.hideRangePreview();
      if (!this.battle) return;
      if (!moved) {
        this.battle.togglePlace(id);
        this.refreshPlacement();
        this.refreshHand();
        return;
      }
      const p = this.scene.groundPoint(e.clientX, e.clientY);
      if (p && this.isOverField(e.clientY)) this.battle.placeUnitAtNearest(id, p.x, p.z);
      else if (placed) this.battle.resnapUnit(placed);
      this.refreshPlacement();
      this.refreshHand();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private wireBus(): void {
    bus.on('mana:change', () => { if (this.mode === 'battle') this.refreshHand(); });
    bus.on('card:played', () => this.refreshHand());
    bus.on('card:draw', () => this.refreshHand());
    bus.on('capture:full', ({ species, name }) => this.onCaptureFull(species, name));
    bus.on('unit:grown', ({ uid, from, to, element, evolved, gains }) => {
      if (evolved) this.evolveQueue.push({ uid, from, to, element });
      this.gainQueue.push(...gains);
      saveRun();
      // 전투 중 흡수-진화: 대기열을 즉시 소진(진화 연출·시그니처 학습)하고 전투를 재개한다.
      // 방치하면 다음 스테이지 클리어까지 미뤄져 연출이 어긋나고, 도중 이탈 시 획득 카드가 유실됨.
      if (this.mode === 'battle' && !this.paused) {
        this.paused = true;
        this.growthDest = 'battle';
        this.continueGrowthFlow();
      }
    });
  }

  // ── 포획 캡 초과: '오래된 2 + 신규' 버리기 ──
  private pendingCaptureSpecies: string | null = null;
  private onCaptureFull(species: string, name: string): void {
    if (!state.monstersFull) {
      this.ui.warn('원정대 자리가 남아 있어 교체가 필요하지 않습니다.');
      return;
    }
    this.pendingCaptureSpecies = species;
    this.paused = true; // 전투 일시정지 후 선택
    const def = ENEMIES[species];
    const placeState = new Map(this.battle?.placeablesState().map((u) => [u.id, u]) ?? []);
    // 편입을 택하면 원정대 전원 중에서 내보낼 동료 1명을 고른다(오래된 순).
    const options = state.roster.map((u) => ({
      id: u.uid, name: displayName(u), sub: `Lv${u.level} · ${unitName(u)}`, element: u.element as string,
      kind: u.kind, species: u.species, stage: u.stage, dead: placeState.get(u.uid)?.dead ?? false,
    }));
    this.ui.showCaptureFull({ newName: name, newElement: def?.element ?? 'neutral', newSpecies: species, options });
  }

  /** 만석 포획: '놓아주기' 선택 — 새 포획체를 받지 않고 전투 재개. */
  private onCaptureReject(): void {
    this.pendingCaptureSpecies = null;
    this.ui.toast('새 포획체를 놓아주었다', 'info');
    this.paused = false;
    this.refreshPlacement();
  }

  private onCaptureDiscardPick(id: string): void {
    const species = this.pendingCaptureSpecies;
    this.pendingCaptureSpecies = null;
    // ENEMIES[species] 유효성 확인 후에만 기존 동료 제거 — 무효 시 동료만 잃는 사고 방지.
    if (species && ENEMIES[species]) {
      const def = ENEMIES[species];
      const rosterBefore = [...state.roster];
      const dropped = state.roster.find((u) => u.uid === id);
      state.roster = state.roster.filter((u) => u.uid !== id);
      this.battle?.removeUnitByUid(id);
      // 야생 크리처는 크리처로, 일반 적은 포획체로 편입 (giveUnit vs giveEnemyUnit).
      let joined;
      if (def.creatureStage) {
        const el = def.element as Element;
        const evo = MONSTERS[el].evolveLevels;
        const lvl = def.creatureStage >= 3 ? evo[1] : def.creatureStage === 2 ? evo[0] : 1;
        joined = state.giveUnit(el, lvl);
      } else {
        joined = state.giveEnemyUnit(species, state.stageIndex + 1);
      }
      if (joined) {
        this.battle?.deployCaptured(joined);
        this.ui.toast(`${dropped ? displayName(dropped) : '동료'}을(를) 보내고 ${displayName(joined)}이(가) 합류했습니다.`, 'info');
      } else {
        state.roster = rosterBefore;
        if (dropped) this.battle?.deployCaptured(dropped);
        this.ui.warn('포획체 편입에 실패해 원정대를 되돌렸습니다.');
      }
    } else {
      this.ui.toast('새 포획체를 놓아주었다', 'info');
    }
    saveRun();
    this.paused = false; // 전투 재개
    this.refreshPlacement();
  }

  // ── 런/로비/스테이지 ──
  private startRun(): void {
    state.reset();
    this.ensureMapTrack(); // 런 시작 시 갭별 특수 노드 생성
    this.tutorial.maybeStart(); // 첫 모험이면 온보딩 무장(첫 stage:start에서 발동)
    this.ui.hideTitle();
    this.showLobby();
  }

  /** 저장된 런 이어하기 (localStorage 스냅샷 1개) */
  private continueRun(): void {
    if (!loadRun()) { this.startRun(); return; }
    this.ensureMapTrack(); // 구버전 저장 방어: 트랙 없으면 생성
    this.ui.hideTitle();
    this.ui.toast('저장된 모험을 이어서 시작합니다', 'good');
    this.showLobby();
  }

  /** 로비: 전투 진입/캐릭터 관리 허브 */
  private showLobby(): void {
    this.normalizeRosterCap();
    this.mode = 'lobby';
    setBgmTrack('lobby');
    this.paused = true;
    this.battle = null;
    this.ui.hideManage();
    this.ui.hideStageMap();
    this.ui.showLobby({
      stageNo: Math.min(state.stageIndex + 1, STAGES.length),
      stageLabel: STAGES[Math.min(state.stageIndex, STAGES.length - 1)].label,
      gold: state.gold,
      roster: state.roster,
      capturedCount: state.capturedCount,
    });
  }

  /** 로비 '출정' → 노드식 모험 지도를 열어 현재 스테이지를 선택하게 한다. */
  private static readonly SPECIAL_LABEL: Record<SpecialKind, string> = { shop: '상점', event: '사건', rest: '야영' };

  /** 런 시작 시 갭별 특수 노드 종류를 1회 생성(재현 안정, save에 영속). 비어있을 때만. */
  private ensureMapTrack(): void {
    if (state.gapSpecials.length >= STAGES.length - 1) return;
    const pool: SpecialKind[] = ['shop', 'shop', 'event', 'event', 'rest'];
    const track: SpecialKind[] = [];
    for (let i = 0; i < STAGES.length - 1; i++) track.push(pool[Math.floor(Math.random() * pool.length)]);
    state.gapSpecials = track;
    saveRun();
  }

  private openStageMap(): void {
    this.mode = 'stagemap';
    setBgmTrack('lobby');
    this.ui.hideLobby();
    this.ensureMapTrack();
    const cur = state.stageIndex;
    const pending = state.specialPending;
    const nodes: { kind: 'stage' | SpecialKind; no?: number; label: string; theme?: string; boss?: 'mini' | 'final'; state: 'cleared' | 'current' | 'locked' }[] = [];
    for (let i = 0; i < STAGES.length; i++) {
      const s = STAGES[i];
      const stState: 'cleared' | 'current' | 'locked' = i < cur ? 'cleared' : (i === cur && !pending) ? 'current' : 'locked';
      nodes.push({ kind: 'stage', no: s.id, label: s.label, theme: s.theme, boss: s.boss, state: stState });
      if (i < STAGES.length - 1) {
        const kind = state.gapSpecials[i] ?? 'shop';
        // 갭 i는 스테이지 i 클리어(cur=i+1) 후 방문 대상.
        const gState: 'cleared' | 'current' | 'locked' =
          cur < i + 1 ? 'locked' : (cur === i + 1 && pending) ? 'current' : 'cleared';
        nodes.push({ kind, label: Game.SPECIAL_LABEL[kind], state: gState });
      }
    }
    this.ui.showStageMap({ nodes });
  }

  private enterBattle(): void {
    this.ui.hideLobby();
    this.mode = 'battle';
    // v3: 스테이지 1·2·3 시작 시 3택1 드래프트 먼저
    if (state.needsDraft) {
      this.paused = true;
      this.ui.showDraft(state.draftOptions());
      return;
    }
    this.startStage(state.stageIndex);
  }

  private pickDraft(element: string): void {
    const before = state.roster.length;
    state.draftPick(element as Element);
    saveRun();
    // giveUnit 실패(중복/가득) 시 roster가 안 늘어나므로 방금 뽑은 유닛만 안전하게 참조.
    const u = state.roster.length > before ? state.roster[state.roster.length - 1] : undefined;
    if (u) this.ui.toast(`${unitName(u)} 합류!`, 'good');
    this.startStage(state.stageIndex);
  }

  // ── 캐릭터 관리 (덱 편성) ──
  private manageHolder = 'hero';
  private openManage(): void {
    this.mode = 'manage';
    this.ui.hideLobby();
    this.manageHolder = 'hero';
    this.renderManage();
  }

  private renderManage(): void {
    const id = this.manageHolder;
    const holders = [
      { id: '__all__', name: '전체 카드', element: 'normal' as const, level: 0 },
      { id: 'hero', name: '성 (공용)', element: 'neutral' as const, level: 1 },
      ...state.roster.map((u) => ({ id: u.uid, name: displayName(u), element: u.element, level: u.level, kind: u.kind, species: u.species, stage: u.stage })),
    ];
    if (id === '__all__') {
      const currentIds = [...new Set(state.battleDeck())];
      const cards = currentIds
        .map((cardId) => CARD_BY_ID[cardId])
        .filter(Boolean)
        .map((c) => ({ id: c.id, name: c.name, element: c.element, cost: c.cost, text: c.text, learnLevel: c.learnLevel, learned: true, equipped: true }));
      const avgCost = cards.length ? cards.reduce((sum, c) => sum + c.cost, 0) / cards.length : 0;
      const roleCounts = new Map<string, number>();
      for (const c of cards) {
        const def = CARD_BY_ID[c.id];
        if (def) roleCounts.set(cardRole(def), (roleCounts.get(cardRole(def)) ?? 0) + 1);
      }
      const deckSummary = [...roleCounts].map(([role, count]) => `${role} ${count}`).join(' 쨌 ') || '장착 카드 없음';
      this.ui.showManage({ holders, selected: id, level: 0, cards, equippedCount: cards.length, cap: cards.length, avgCost, deckSummary, readOnly: true });
      return;
    }
    const lvl = state.holderLevel(id);
    const equipped = state.equippedOf(id);
    const discarded = state.holderDiscarded(id);
    const cards = cardsOfCharacter(state.holderCharacter(id))
      // 교체에서 버린 카드는 숨김
      .filter((c) => !discarded.includes(c.id))
      .map((c) => ({
        id: c.id, name: c.name, element: c.element, cost: c.cost, text: c.text,
        learnLevel: c.learnLevel,
        learned: c.learnLevel <= lvl,
        equipped: equipped.includes(c.id),
      }));
    const equippedDefs = equipped.map((cid) => CARD_BY_ID[cid]).filter(Boolean);
    const avgCost = equippedDefs.length ? equippedDefs.reduce((sum, c) => sum + c.cost, 0) / equippedDefs.length : 0;
    const roleCounts = new Map<string, number>();
    for (const c of equippedDefs) roleCounts.set(cardRole(c), (roleCounts.get(cardRole(c)) ?? 0) + 1);
    const deckSummary = [...roleCounts].map(([role, count]) => `${role} ${count}`).join(' · ') || '장착 카드 없음';
    this.ui.showManage({ holders, selected: id, level: lvl, cards, equippedCount: equipped.length, cap: EQUIP_CAP, avgCost, deckSummary });
  }

  private toggleEquip(holderId: string, cardId: string): void {
    const eq = [...state.equippedOf(holderId)];
    const i = eq.indexOf(cardId);
    if (i >= 0) {
      eq.splice(i, 1);
    } else {
      const learned = state.learnedIdsFor(state.holderCharacter(holderId), state.holderLevel(holderId), state.holderDiscarded(holderId));
      if (!learned.includes(cardId)) { this.ui.warn('아직 배우지 않은 스킬입니다'); return; }
      if (eq.length >= EQUIP_CAP) { this.ui.warn(`덱은 최대 ${EQUIP_CAP}장까지`); return; }
      eq.push(cardId);
    }
    state.setEquipped(holderId, eq);
    saveRun();
    this.renderManage();
  }

  // ── 상점 (골드 사용처) ──
  /** 상점 품목 정의. cost=골드 가격, apply=효과 키. heal은 만피면 비활성. */
  private static readonly SHOP_ITEMS: { id: string; icon: string; label: string; desc: string; cost: number }[] = [
    { id: 'heal', icon: '❤️', label: '성 수리', desc: '성 HP를 모두 회복합니다.', cost: 30 },
    { id: 'maxhp', icon: '🏰', label: '성벽 보강', desc: '성 최대 HP +25 (즉시 회복).', cost: 55 },
    { id: 'atk', icon: '⚔️', label: '무기 연마', desc: '모든 유닛 공격력 +12%.', cost: 60 },
    { id: 'aspd', icon: '⚡', label: '민첩 훈련', desc: '모든 유닛 공격속도 +0.12.', cost: 55 },
    { id: 'range', icon: '🎯', label: '조준 훈련', desc: '모든 유닛 사거리 +0.6.', cost: 55 },
    { id: 'crit', icon: '💥', label: '급소 간파', desc: '모든 유닛 치명타 확률 +6%.', cost: 50 },
  ];

  /** 스크롤 없이 보이도록 방문마다 소수만 무작위 진열. */
  private static readonly SHOP_STOCK_SIZE = 4;
  private shopStock: { id: string; sold: boolean }[] = [];
  private shopRerolls = 0;

  private shopRerollCost(): number { return 15 + this.shopRerolls * 10; }

  /** 상점 진열 재추첨: 강화 + 도구 통합 풀에서 무작위 N개(중복 없이). */
  private rollShop(): void {
    const pool = [...Game.SHOP_ITEMS.map((it) => it.id), ...ITEMS.map((t) => `item:${t.id}`)];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.shopStock = pool.slice(0, Game.SHOP_STOCK_SIZE).map((id) => ({ id, sold: false }));
  }

  /** 진열 id → 표시 정보(강화/도구 공용). */
  private shopEntry(id: string): { icon: string; label: string; desc: string; cost: number } | null {
    if (id.startsWith('item:')) { const t = ITEM_BY_ID[id.slice(5)]; return t ? { icon: t.icon, label: t.name, desc: t.desc, cost: t.cost } : null; }
    const it = Game.SHOP_ITEMS.find((x) => x.id === id);
    return it ? { icon: it.icon, label: it.label, desc: it.desc, cost: it.cost } : null;
  }

  /** 상점 진입 — 진열 새로 뽑고 리롤 카운터 초기화. */
  private enterShop(): void {
    this.shopRerolls = 0;
    this.rollShop();
    this.openShop();
  }

  private openShop(): void {
    const full = state.baseHp >= state.baseHpMax;
    const stock = this.shopStock.map((s) => {
      const e = this.shopEntry(s.id)!;
      const healFull = s.id === 'heal' && full;
      return {
        id: s.id, icon: e.icon, label: e.label, desc: e.desc, cost: e.cost, sold: s.sold,
        disabled: s.sold || healFull || state.gold < e.cost,
        note: s.sold ? '품절' : healFull ? '성이 이미 온전합니다.' : undefined,
      };
    });
    const rerollCost = this.shopRerollCost();
    this.ui.showShop({ gold: state.gold, stock, rerollCost, canReroll: state.gold >= rerollCost });
  }

  /** 골드로 진열 새로고침. 리롤할수록 비용 증가(무한 리롤 방지). */
  private rerollShop(): void {
    const cost = this.shopRerollCost();
    if (!state.spendGold(cost)) { this.ui.warn('골드가 부족합니다.'); this.openShop(); return; }
    this.shopRerolls++;
    this.rollShop();
    saveRun();
    this.openShop();
  }

  private buyShopItem(id: string): void {
    const slot = this.shopStock.find((s) => s.id === id);
    if (!slot || slot.sold) { this.openShop(); return; } // 진열에 없거나 품절
    if (id.startsWith('item:')) { this.startBuyItem(id.slice(5)); return; } // 품절 처리는 장착 확정 후
    const item = Game.SHOP_ITEMS.find((it) => it.id === id);
    if (!item) return;
    if (id === 'heal' && state.baseHp >= state.baseHpMax) { this.openShop(); return; }
    if (!state.spendGold(item.cost)) { this.ui.warn('골드가 부족합니다.'); this.openShop(); return; }
    if (id === 'heal') { state.heal(state.baseHpMax); this.ui.toast('성을 완전히 수리했습니다.', 'good'); }
    else if (id === 'maxhp') { state.baseHpMax += 25; state.baseHp += 25; this.ui.toast('성벽을 보강했습니다. 최대 HP +25', 'good'); }
    else { state.applyBuff(id); this.ui.toast(`${item.label} 완료!`, 'good'); }
    slot.sold = true; // 산 물건은 그 방문 동안 품절 (더 원하면 새로고침)
    saveRun();
    this.openShop();
  }

  // ── 도구(held item) 구매 → 장착 대상 선택 ──
  private pendingItem: string | null = null;
  private startBuyItem(itemId: string): void {
    const def = ITEM_BY_ID[itemId];
    if (!def) { this.openShop(); return; }
    if (state.roster.length === 0) { this.ui.warn('도구를 지닐 동료가 없습니다.'); this.openShop(); return; }
    if (state.gold < def.cost) { this.ui.warn('골드가 부족합니다.'); this.openShop(); return; }
    this.pendingItem = itemId;
    this.ui.showItemAssign(def, state.roster.map((u) => ({
      uid: u.uid, name: displayName(u), element: u.element, kind: u.kind, species: u.species, stage: u.stage,
      currentItem: u.item ? ITEM_BY_ID[u.item]?.name : undefined,
    })));
  }

  /** 도구 장착 대상 확정(빈 uid=취소). */
  private assignItem(uid: string): void {
    const itemId = this.pendingItem;
    this.pendingItem = null;
    if (!uid || !itemId) { this.openShop(); return; } // 취소
    const def = ITEM_BY_ID[itemId];
    if (!def || !state.spendGold(def.cost)) { this.ui.warn('골드가 부족합니다.'); this.openShop(); return; }
    const prev = state.giveItem(uid, itemId);
    const u = state.roster.find((x) => x.uid === uid);
    const slot = this.shopStock.find((s) => s.id === `item:${itemId}`);
    if (slot) slot.sold = true; // 구매 확정 시 품절
    this.battle?.refreshUnitStats(); // 장착 즉시 스탯 반영(전투 대기 중일 수 있음)
    this.ui.toast(`${u ? displayName(u) : '동료'}에게 ${def.name} 장착${prev ? ` (${prev} 교체)` : ''}`, 'good');
    saveRun();
    this.openShop();
  }

  private startStage(index: number): void {
    this.normalizeRosterCap();
    state.stageIndex = index;
    setBgmTrack('battle');
    const def = STAGES[index];
    const jumps = STAGES.filter((s) => s.difficultyJump && s.id <= def.id).length;
    // 난이도(긴장): 점프는 가산 유지(복리 폭주 방지). "성이 한 번도 안 위협받는다" 이슈 →
    // 스테이지당 HP 증가율 0.06→0.09로 올려 후반 적이 더 오래 살아 성문까지 새어들도록.
    // 1~3 스테이지 온보딩(earlyHpEase)은 그대로 두어 초반은 여전히 부드럽게.
    const earlyHpEase = index <= 2 ? 0.88 + index * 0.04 : 1;
    // 난이도(중반~후반 강화): 스테이지4(index3)부터 HP 증가율을 가속(+8%/스테이지 추가)해 적이 킬 처리량보다
    // 오래 살아남아 유닛 방어선을 뚫고 성문까지 새어들도록. 포탑 대폭 너프와 맞물려 "성이 위협받는" 상황이 잦아짐.
    // 초반 1~3(earlyHpEase)은 그대로 부드럽게 유지.
    const lateHp = 1 + Math.max(0, index - 2) * 0.08;
    const hpScale = earlyHpEase * (1 + index * 0.10) * lateHp * (1 + (DIFFICULTY_JUMP_MULT - 1) * jumps);
    // 공격력 스케일: 이제 스테이지에도 완만히 반응(+4%/스테이지) + 점프(+9%/점프). 성문 공성·유닛 교전이
    // 후반에 실제로 아프게 — 단, 순삭 절벽은 피하려 스테이지 계수는 낮게 유지.
    const earlyAtkEase = index <= 2 ? 0.85 + index * 0.05 : 1;
    const atkScale = earlyAtkEase * (1 + index * 0.03) * (1 + 0.09 * jumps);
    this.battle = new Battle(this.scene, state, def, hpScale, atkScale);
    this.paused = false;
    this.speed = settings.speed; // 설정의 기본 전투 속도 적용
    this.lastPhase = this.battle.phase;
    this.refreshHand();
    this.refreshPlacement();
    this.ui.toast(`${def.label}`, 'info');
    saveRun();
  }

  // ── 손패 갱신 ──
  private refreshHand(): void {
    if (!this.battle || this.paused) return; // 모달(보너스/성장 등) 표시 중엔 손패/셸프 재렌더 생략
    const b = this.battle;
    if (b.phase === 'placement') {
      this.ui.showUnitShelf(b.placeablesState());
      return;
    }
    const cards: HandCard[] = [];
    for (const id of b.deck.hand) {
      const playable = b.deck.canPlay(id);
      const cdFrac = b.deck.cdFrac(id);
      cards.push({ id, playable, pinned: id === CAPTURE_CARD_ID, cdFrac, reason: playable ? undefined : cdFrac > 0 ? '재사용 대기 중' : '마나가 부족합니다' });
    }
    this.ui.refreshHand(cards);
  }

  // ── 뷰어 ──
  private viewerFrom: Mode = 'battle';
  private openViewer(): void {
    if (state.roster.length === 0) { this.ui.warn('보유한 몬스터가 없습니다'); return; }
    this.viewerFrom = this.mode;
    if (this.mode === 'lobby') this.ui.hideLobby();
    this.mode = 'viewer';
    this.viewer.setActive(true);
    this.ui.openViewer(state.roster);
  }
  private closeViewer(): void {
    this.viewer.setActive(false);
    this.ui.closeViewer();
    if (this.viewerFrom === 'lobby') this.showLobby();
    else this.mode = 'battle';
  }

  // ── 도감 3D 감상 (소유 여부 무관, OrbitControls) ──
  private openDexView(d: { kind: 'creature' | 'enemy'; element?: string; stage?: number; species?: string; name: string }): void {
    this.ui.hideLobby(); // 로비 DOM이 3D 캔버스를 가리지 않게 숨김
    if (d.kind === 'creature' && d.element && d.stage) this.viewer.viewCreature(d.element as Element, d.stage as 1 | 2 | 3);
    else if (d.kind === 'enemy' && d.species) this.viewer.viewEnemy(d.species);
    this.viewer.setActive(true);
    this.mode = 'viewer';
    this.ui.showDexView(d.name);
  }
  private closeDexView(): void {
    this.viewer.setActive(false);
    this.ui.hideDexView();
    this.mode = 'lobby';
    this.showLobby();
    this.ui.showDex();
  }

  // ── 스테이지 클리어 → 보상/진화/카드 획득/갈림길 ──
  /** 진화 연출 대기열 (스테이지 클리어 성장 후 처리) */
  private evolveQueue: { uid: string; from: string; to: string; element: Element }[] = [];
  /** 새 카드 획득 대기열 — 연출/교체 선택 */
  private gainQueue: CardGain[] = [];
  /** 현재 교체 선택 중인 획득 이벤트 */
  private currentGain: CardGain | null = null;
  /** 성장 플로우(카드 획득) 종료 후 목적지. 'battle' = 전투 중 흡수-진화 후 전투 재개. */
  private growthDest: 'node' | 'stagemap' | 'battle' = 'node';

  private flushBattleGrowth(dest: 'battle' | 'stagemap' = 'battle'): boolean {
    if (!this.battle) return false;
    for (const ev of this.battle.consumeGrowthEvents()) {
      if (ev.evolved) this.evolveQueue.push({ uid: ev.uid, from: ev.from, to: ev.to, element: ev.element });
      this.gainQueue.push(...ev.gains);
    }
    if (!this.evolveQueue.length && !this.gainQueue.length) return false;
    this.paused = true;
    this.growthDest = dest;
    this.continueGrowthFlow();
    return true;
  }

  private onStageClearedDetected(): void {
    this.paused = true;
    const def = this.battle!.stage;
    // 유닛 경험치 지급
    const rewards: string[] = [`🪙 ${state.gold}`];
    rewards.push('처치와 웨이브 보상 XP를 정산했습니다.');
    // 유대 성장: 함께 클리어한 유닛일수록 누적(뚝심 육성 보상, §14)
    state.growBond();
    if (state.roster.length) rewards.push('동료 유대 상승. HP와 공격 보너스가 증가합니다.');
    // 클리어 즉시 다음 스테이지로 전진시켜 저장 — "보상만 받고 종료 → 같은 스테이지 반복" 파밍 방지
    state.stageIndex += 1;
    // 방금 건넌 갭(stageIndex-1)의 특수 노드를 지도에서 방문 대상으로 표시.
    this.ensureMapTrack();
    state.specialPending = state.stageIndex - 1 < state.gapSpecials.length;
    this.ui.showStageClear(def.label, rewards);
    saveRun();
  }

  /** '다음으로' 버튼 → 성장 연출(카드 획득) → 모험 지도(특수 노드가 현재 위치로 표시). */
  private afterStageClear(): void {
    this.growthDest = 'stagemap'; // 성장 연출 후 지도로 (특수 노드는 지도에서 방문)
    this.continueGrowthFlow();
  }

  /** 진화 연출 → 카드 획득/교체 → 끝나면 목적지(전투/지도)로. */
  private continueGrowthFlow(): void {
    if (this.processEvolveQueue()) return;
    if (this.processGainQueue()) return;
    saveRun();
    if (this.growthDest === 'battle') { // 전투 중 흡수-진화 소진 완료 → 전투 재개
      this.growthDest = 'node';
      this.paused = false;
      this.refreshHand();
      this.refreshPlacement();
      return;
    }
    // 그 외(스테이지 클리어/이벤트 성장) → 모험 지도로 복귀.
    this.growthDest = 'node';
    this.backToStageMap();
  }

  /** 진화 연출 대기열 처리. 띄웠으면 true. 현재 유닛 단계/종류로 포트레이트 정합. */
  private processEvolveQueue(): boolean {
    if (this.evolveQueue.length) {
      const e = this.evolveQueue[0];
      const u = state.roster.find((x) => x.uid === e.uid);
      playSfx('evolve');
      this.ui.showEvolve({ from: e.from, to: e.to, element: e.element, stage: u?.stage ?? 3, kind: u?.kind ?? 'creature', species: u?.species });
      return true;
    }
    return false;
  }
  private onEvolveAck(): void {
    this.evolveQueue.shift();
    this.continueGrowthFlow();
  }

  /**
   * 카드 획득 대기열 처리 (연출 + 5장 초과 시 교체 선택). 모달을 띄웠으면 true.
   * 자리가 있으면 획득 연출만, 가득이면 '오래된 3장 + 신규' 중 1장 버리기.
   */
  private processGainQueue(): boolean {
    while (this.gainQueue.length) {
      const gain = this.gainQueue.shift()!;
      const u = state.roster.find((x) => x.uid === gain.uid);
      const card = CARD_BY_ID[gain.cardId];
      if (!u || !card) continue;
      const r = state.acquireCard(gain.uid, gain.cardId);
      if (r.result === 'skip') continue;
      const desc = { name: displayName(u), element: u.element, kind: u.kind, stage: u.stage, species: u.species };
      playSfx('gain');
      if (r.result === 'added') {
        this.ui.showCardGain(desc, gain.cardId);
        return true;
      }
      // replace: 항상 5장 유지 — 오래된 3장 + 신규 중 하나를 버린다
      this.currentGain = gain;
      this.ui.showCardReplace(desc, gain.cardId, r.options!);
      return true;
    }
    return false;
  }

  /** 획득 연출 확인 → 다음 큐 */
  private ackCardGain(): void {
    this.continueGrowthFlow();
  }

  /** 교체 선택: discardId를 버리고 항상 5장 유지 */
  private pickCardReplace(discardId: string): void {
    if (this.currentGain) {
      state.resolveCardReplace(this.currentGain.uid, this.currentGain.cardId, discardId);
      const name = state.cardName(discardId);
      this.ui.toast(discardId === this.currentGain.cardId ? `「${name}」을(를) 획득하지 않았다` : `「${name}」을(를) 버리고 새 카드를 장착`, 'info');
      this.currentGain = null;
    }
    saveRun();
    this.continueGrowthFlow();
  }

  /**
   * 지도에서 현재 특수 노드를 방문(클릭). 갭 종류(상점/사건/야영)를 그 자리에서 해결.
   * 방문 즉시 소비(specialPending=false) → 해결 후 지도로 복귀하면 다음 스테이지가 열린다.
   */
  private enterSpecialNode(): void {
    const gap = state.stageIndex - 1;
    const kind = state.gapSpecials[gap] ?? 'shop';
    state.specialPending = false; // 방문 = 소비
    saveRun();
    if (kind === 'shop') {
      this.enterShop(); // 상점 모달 — onShopClose가 지도로 복귀
    } else if (kind === 'event') {
      const nodes = [...EVENT_NODES].sort(() => Math.random() - 0.5).slice(0, 3);
      this.ui.showEvent(nodes); // onEventPick → applyEvent → afterEvent → 지도로 복귀
    } else { // rest(야영)
      const heal = Math.round(state.baseHpMax * 0.25);
      state.heal(heal);
      this.ui.toast(`야영으로 성을 정비했습니다. 성 HP +${heal}`, 'good');
      saveRun();
      this.openStageMap();
    }
  }

  private applyEvent(id: string): void {
    switch (id) {
      case 'merchant':
        state.gold += 40;
        this.ui.toast('상인에게서 골드 +40', 'good');
        break;
      case 'hotspring': {
        const evolved: string[] = [];
        state.roster.forEach((u) => {
          const before = unitName(u);
          const r = state.addUnitXp(u, 200);
          if (r.evolved) {
            evolved.push(displayName(u));
            // 스테이지 클리어와 동일한 진화 플로우: 연출 + 각성 시그니처 학습
            this.evolveQueue.push({ uid: u.uid, from: before, to: unitName(u), element: u.element });
            const key = state.evolveKeySkill(u);
            if (key) this.gainQueue.push({ uid: u.uid, cardId: key });
          }
          this.gainQueue.push(...r.gains);
        });
        this.ui.toast(evolved.length ? `온천 효과! ${evolved.join(', ')} 진화!` : '온천 효과! 모든 유닛 성장', 'good');
        break;
      }
      case 'egg':
        if (Math.random() < 0.5) { state.gold += 60; this.ui.toast('알에서 금화가! 골드 +60', 'good'); }
        else this.ui.toast('알은 부화하지 않았다…', 'bad');
        break;
      case 'altar':
        state.baseHp = Math.max(1, state.baseHp - 15); state.gold += 50;
        this.ui.toast('제단: 성 HP -15, 골드 +50', 'bad');
        break;
      case 'roulette': {
        const bet = Math.floor(state.gold / 2);
        if (bet <= 0) { this.ui.toast('룰렛: 걸 골드가 없다…', 'info'); break; }
        // 승률 0.5 = 기댓값 중립. (기존 0.55는 무손실 양의 기댓값이라 '무조건 걸기'가 정답이 되는 익스플로잇이었음)
        if (Math.random() < 0.5) { state.gold += bet; this.ui.toast(`🎰 룰렛 대성공! 골드 +${bet}`, 'good'); }
        else { state.gold -= bet; this.ui.toast(`🎰 룰렛 실패… 골드 -${bet}`, 'bad'); }
        break;
      }
      case 'pact':
        state.baseHp = Math.max(1, state.baseHp - 40);
        state.applyBuff('pact_atk');
        this.ui.toast('🩸 피의 계약: 성 HP -40, 전 유닛 공격력 영구 +18%', 'bad');
        break;
      case 'dice': {
        const roll = 1 + Math.floor(Math.random() * 6);
        if (roll === 6) {
          const pick = BUFF_NODES[Math.floor(Math.random() * BUFF_NODES.length)];
          state.applyBuff(pick.apply);
          this.ui.toast(`🎲 주사위 6! ${pick.label} 영구 획득!`, 'good');
        } else if (roll >= 4) { state.gold += 50; this.ui.toast(`🎲 주사위 ${roll}! 골드 +50`, 'good'); }
        else { state.gold = Math.max(0, state.gold - 20); this.ui.toast(`🎲 주사위 ${roll}… 골드 -20`, 'bad'); }
        break;
      }
    }
  }

  /** 이벤트 종료 → (온천 성장 시) 분기/카드 획득 플로우 → 로비 */
  private afterEvent(): void {
    this.growthDest = 'stagemap';
    this.continueGrowthFlow();
  }

  /** 갈림길까지 마치면 스테이지 선택 지도로 복귀. (stageIndex는 클리어 시점에 이미 전진됨)
   *  로비(원정대 허브)는 지도의 '← 원정대' 버튼으로 이동. */
  private backToStageMap(): void {
    this.battle?.finish();
    this.battle = null;
    if (state.stageIndex >= STAGES.length) { this.win(); return; }
    saveRun();
    this.openStageMap();
  }

  /** 로비 → 타이틀 화면으로. 진행 상황은 저장돼 있어 '이어하기'로 복귀 가능. */
  private toTitle(): void {
    this.tutorial.cancel(); // 타이틀 이탈 시 취소 → 다음 새 모험에서 다시 안내
    this.ui.hideLobby();
    this.ui.hideManage();
    this.viewer.setActive(false);
    this.ui.closeViewer();
    this.mode = 'title';
    setBgmTrack('lobby');
    this.paused = true;
    saveRun();
    this.ui.showTitle(hasRun());
  }

  /** 전투 중 ESC/나가기 → 원정대(홈)로 복귀. 현재 스테이지는 포기(다시 출정 가능). */
  private exitBattle(): void {
    if (this.mode !== 'battle' || !this.battle) return;
    this.ui.clearModal();
    this.pendingCaptureSpecies = null; // 포획-가득 선택 도중 이탈해도 상태가 남지 않게 정리
    this.paused = false;
    this.battle.finish();
    this.battle = null;
    saveRun();
    this.ui.toast('전투를 떠나 원정대로 돌아왔습니다.', 'info');
    this.showLobby();
  }

  private win(): void {
    this.tutorial.finish(true); // 승리 = 온보딩 완료로 기록
    this.mode = 'title';
    setBgmTrack('lobby');
    this.ui.showWin(ENEMIES.tyrant.name);
    clearRun();
  }

  private lose(reason: string): void {
    this.paused = true;
    this.battle?.finish();
    this.battle = null;
    this.mode = 'title';
    setBgmTrack('lobby');
    this.ui.showLose(reason);
    clearRun();
  }

  // ── 루프 ──
  private loop(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;

    if (this.mode === 'battle' && this.battle && !this.paused) {
      this.acc += dt * this.speed;
      let steps = 0;
      // !paused 확인 — 포획 캡 모달 등 update 중 일시정지가 걸리면 즉시 멈춘다.
      while (this.acc >= FIXED_DT && steps < 5 && !this.paused) {
        this.battle.update(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
      this.updateHUD();
      this.checkBattlePhase();
      if (this.battle && this.battle.phase !== this.lastPhase) {
        const prev = this.lastPhase;
        this.lastPhase = this.battle.phase;
        this.refreshHand();
        this.refreshPlacement();
        if (prev === 'wave' && this.battle.phase === 'placement') {
          this.flushBattleGrowth('battle');
        }
        // 첫 전투 시작 시 1회 포획 안내 (핵심 루프 온보딩)
        if (prev === 'placement' && this.battle.phase !== 'placement' && !this.captureHintShown && !this.tutorial.isActive) {
          this.captureHintShown = true;
          this.ui.toast('빛나는 포획구 카드를 적에게 드래그하면 포획! 원정대에 합류시켜 키울 수 있어요', 'info');
        }
      }
    }

    if (this.mode === 'viewer') {
      this.viewer.update(dt);
      this.scene.renderer.render(this.viewer.scene, this.viewer.camera);
    } else {
      this.scene.render();
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  private checkBattlePhase(): void {
    if (!this.battle) return;
    const phase = this.battle.phase;
    if (phase === 'stageClear') {
      if (this.flushBattleGrowth('battle')) return;
      this.battle.phase = 'placement'; // 중복 방지 (이미 처리)
      this.onStageClearedDetected();
    } else if (phase === 'won') {
      if (this.flushBattleGrowth('battle')) return;
      this.battle.finish(); this.battle = null; this.win();
    } else if (phase === 'lost') {
      const reason = '성이 무너졌습니다.';
      this.lose(reason);
    }
  }

  private updateHUD(): void {
    if (!this.battle) return;
    const b = this.battle;
    this.ui.setHUD({
      stageLabel: b.stage.label,
      baseHp: state.baseHp, baseHpMax: state.baseHpMax,
      mana: b.deck.mana, manaMax: b.deck.manaMax,
      deckDraw: b.deck.drawCount, deckDiscard: b.deck.discardCount,
      drawFrac: b.autoDrawFrac,
      wave: Math.min(b.waveIndex + 1, b.totalWaves), totalWaves: b.totalWaves,
      gold: state.gold,
      enemiesLeft: b.enemies.filter((e) => e.alive).length,
      phaseLabel: b.phase,
      showBeginWave: b.phase === 'placement',
    });
  }
}
