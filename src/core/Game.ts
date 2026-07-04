import { Scene } from '../render/Scene';
import { MonsterViewer } from '../render/MonsterViewer';
import { UI, type HandCard } from '../ui/UI';
import { state, unitName, displayName, EQUIP_CAP, type CardGain } from './GameState';
import { saveRun, loadRun, clearRun, hasRun } from './save';
import { Battle } from '../systems/Battle';
import { STAGES, BUFF_NODES, EVENT_NODES } from '../data/stages';
import { ENEMIES } from '../data/enemies';
import { cardsOfCharacter, CARDS, CARD_BY_ID, cardIcon, cardRole } from '../data/cards';
import type { Element } from './types';
import { CAPTURE_CARD_ID, DIFFICULTY_JUMP_MULT, FIXED_DT } from '../data/constants';
import { bus } from './events';
import { settings } from './Settings';
import { playSfx } from '../audio/Sfx';

type Mode = 'title' | 'lobby' | 'battle' | 'viewer' | 'manage';

/** 최상위 앱 컨트롤러: 씬/UI/상태/전투를 조율하고 메타 루프(스테이지 진행/보상/갈림길)를 돌린다. */
export class Game {
  private scene: Scene;
  private ui: UI;
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
    this.wireUI();
    this.wireInput();
    this.wireFieldDrag();
    this.wireBus();
    this.ui.showTitle(hasRun());
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
    this.ui.onSpeedChange = (speed) => { this.speed = speed; this.ui.toast(`전투 속도 ${speed}배`, 'info'); };
    this.ui.onCardBlocked = (reason) => this.ui.toast(reason, 'bad');
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
    this.ui.onNode = (kind) => this.chooseNode(kind);
    this.ui.onBuffPick = (id) => { state.applyBuff(id); this.backToLobby(); };
    this.ui.onBonusPick = (id) => { state.applyBuff(id); saveRun(); this.paused = false; this.ui.toast('강화를 획득했습니다.', 'good'); this.refreshHand(); this.refreshPlacement(); };
    this.ui.onDraftPick = (el) => this.pickDraft(el);
    this.ui.onEventPick = (id) => { this.applyEvent(id); this.afterEvent(); };
    this.ui.onNext = () => this.afterStageClear();
    this.ui.onCardGainAck = () => this.ackCardGain();
    this.ui.onEvolveAck = () => this.onEvolveAck();
    this.ui.onCardReplacePick = (discardId) => this.pickCardReplace(discardId);
    this.ui.onRestart = () => { clearRun(); this.startRun(); };
    this.ui.onPlacementToggle = (_id) => {};
    this.ui.onEnterBattle = () => this.enterBattle();
    this.ui.onManage = () => this.openManage();
    this.ui.onManageClose = () => this.showLobby();
    this.ui.onSettings = () => this.ui.showSettings();
    this.ui.onSettingsChange = () => { this.speed = settings.speed; };
    this.ui.onDex = () => this.ui.showDex();
    this.ui.onManageSelectHolder = (id) => { this.manageHolder = id; this.renderManage(); };
    this.ui.onManageToggle = (holderId, cardId) => this.toggleEquip(holderId, cardId);
    this.ui.onCaptureDiscardPick = (id) => this.onCaptureDiscardPick(id);
  }

  private lastPhase = '';
  private speed: 1 | 2 | 3 = 1;
  private refreshPlacement(): void {
    this.ui.hidePlacement();
  }

  private wireInput(): void {
    // 숫자키 = 손패 카드 스마트 시전.
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'battle' || !this.battle || this.paused) return;
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
        if (!this.tapHintShown) { this.tapHintShown = true; this.ui.toast('한 번 더 탭하거나 전장으로 드래그해 사용', 'info'); }
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

  private makeUnitDragGhost(id: string): HTMLElement {
    const item = this.battle?.placeablesState().find((x) => x.id === id);
    const ghost = document.createElement('div');
    ghost.className = 'card-drag-ghost unit';
    ghost.innerHTML = `<div class="dg-ico">${item?.name?.slice(0, 2) ?? 'Unit'}</div><div class="dg-name">${item?.name ?? 'Unit'}</div>`;
    document.body.appendChild(ghost);
    return ghost;
  }

  private beginUnitCardDrag(id: string, ev: PointerEvent): void {
    if (!this.battle || this.mode !== 'battle' || this.paused || this.battle.phase !== 'placement') return;
    const startX = ev.clientX;
    const startY = ev.clientY;
    let moved = false;
    let ghost: HTMLElement | null = null;
    let hlSlot = -1;
    const range = this.battle.placeableRange(id);
    const move = (e: PointerEvent) => {
      if (!this.battle) return;
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
      if (!moved) {
        moved = true;
        ghost = this.makeUnitDragGhost(id);
        document.body.style.userSelect = 'none';
      }
      e.preventDefault();
      if (ghost) { ghost.style.left = `${e.clientX}px`; ghost.style.top = `${e.clientY}px`; }
      const p = this.scene.groundPoint(e.clientX, e.clientY);
      if (!p) return;
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
      if (ghost) ghost.remove();
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
      this.refreshPlacement();
      this.refreshHand();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private wireBus(): void {
    bus.on('mana:change', () => { if (this.mode === 'battle') this.refreshHand(); });
    bus.on('card:played', () => this.refreshHand());
    bus.on('capture:full', ({ species, name }) => this.onCaptureFull(species, name));
    bus.on('unit:grown', ({ uid, from, to, element, evolved, gains }) => {
      if (evolved) this.evolveQueue.push({ uid, from, to, element });
      this.gainQueue.push(...gains);
      saveRun();
    });
  }

  // ── 포획 캡 초과: '오래된 2 + 신규' 버리기 ──
  private pendingCaptureSpecies: string | null = null;
  private onCaptureFull(species: string, name: string): void {
    this.pendingCaptureSpecies = species;
    this.paused = true; // 전투 일시정지 후 선택
    const def = ENEMIES[species];
    // 오버플로 교체 통일: 오래된 3 + 신규 1 중에서 버리기 (카드 교체와 동일 규칙).
    const oldest = state.roster.slice(0, 3).map((u) => ({
      id: u.uid, name: displayName(u), sub: `Lv${u.level} · ${unitName(u)}`, element: u.element as string,
      kind: u.kind, species: u.species, stage: u.stage,
    }));
    this.ui.showCaptureDiscard({ newName: name, newElement: def?.element ?? 'neutral', newSpecies: species, options: oldest });
  }

  private onCaptureDiscardPick(id: string): void {
    const species = this.pendingCaptureSpecies;
    this.pendingCaptureSpecies = null;
    if (species && id !== '__new__') {
      const dropped = state.roster.find((u) => u.uid === id);
      state.roster = state.roster.filter((u) => u.uid !== id);
      this.battle?.removeUnitByUid(id);
      const joined = state.giveEnemyUnit(species, state.stageIndex + 1);
      this.ui.toast(joined
        ? `${dropped ? displayName(dropped) : '동료'}을(를) 보내고 새 포획체가 합류`
        : '새 포획체 합류에 실패했습니다.', joined ? 'info' : 'bad');
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
    this.ui.hideTitle();
    this.showLobby();
  }

  /** 저장된 런 이어하기 (localStorage 스냅샷 1개) */
  private continueRun(): void {
    if (!loadRun()) { this.startRun(); return; }
    this.ui.hideTitle();
    this.ui.toast('저장된 모험을 이어서 시작합니다', 'good');
    this.showLobby();
  }

  /** 로비: 전투 진입/캐릭터 관리 허브 */
  private showLobby(): void {
    this.mode = 'lobby';
    this.paused = true;
    this.battle = null;
    this.ui.hideManage();
    this.ui.showLobby({
      stageNo: Math.min(state.stageIndex + 1, STAGES.length),
      stageLabel: STAGES[Math.min(state.stageIndex, STAGES.length - 1)].label,
      gold: state.gold,
      roster: state.roster,
      capturedCount: state.capturedCount,
    });
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
    // 전체 카드 보기(도감성): 모든 카드를 읽기 전용으로 나열.
    if (id === '__all__') {
      const cards = CARDS.map((c) => ({ id: c.id, name: c.name, element: c.element, cost: c.cost, text: c.text, learnLevel: c.learnLevel, learned: true, equipped: false }));
      this.ui.showManage({ holders, selected: id, level: 0, cards, equippedCount: 0, cap: EQUIP_CAP, avgCost: 0, deckSummary: `전체 ${cards.length}종`, readOnly: true });
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
      if (!learned.includes(cardId)) { this.ui.toast('아직 배우지 않은 스킬입니다', 'bad'); return; }
      if (eq.length >= EQUIP_CAP) { this.ui.toast(`덱은 최대 ${EQUIP_CAP}장까지`, 'bad'); return; }
      eq.push(cardId);
    }
    state.setEquipped(holderId, eq);
    saveRun();
    this.renderManage();
  }

  private startStage(index: number): void {
    state.stageIndex = index;
    const def = STAGES[index];
    const jumps = STAGES.filter((s) => s.difficultyJump && s.id <= def.id).length;
    // 난이도 점프는 단계적(가산)으로 — 기존 Math.pow는 복리로 S10 ×4.7까지 폭주해 클리어 불가.
    // 후반(3점프 누적)이 ×3까지 치솟아 벽이 됨 → 스테이지당 증가율 완화(0.08→0.06).
    const hpScale = (1 + index * 0.06) * (1 + (DIFFICULTY_JUMP_MULT - 1) * jumps);
    this.battle = new Battle(this.scene, state, def, hpScale);
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
    if (!this.battle) return;
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
    if (state.roster.length === 0) { this.ui.toast('보유한 몬스터가 없습니다', 'bad'); return; }
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

  // ── 스테이지 클리어 → 보상/진화/카드 획득/갈림길 ──
  /** 진화 연출 대기열 (스테이지 클리어 성장 후 처리) */
  private evolveQueue: { uid: string; from: string; to: string; element: Element }[] = [];
  /** 새 카드 획득 대기열 — 연출/교체 선택 */
  private gainQueue: CardGain[] = [];
  /** 현재 교체 선택 중인 획득 이벤트 */
  private currentGain: CardGain | null = null;
  /** 성장 플로우(카드 획득) 종료 후 목적지 */
  private growthDest: 'node' | 'lobby' = 'node';

  private onStageClearedDetected(): void {
    this.paused = true;
    const def = this.battle!.stage;
    // 유닛 경험치 지급
    const rewards: string[] = [`현재 골드 ${state.gold}`];
    const xpGain = 120 + def.id * 90; // 만렙 30 곡선에 맞춘 스테이지 XP (레벨업 완만화)
    for (const u of state.roster) {
      const before = unitName(u);
      const r = state.addUnitXp(u, xpGain);
      if (r.evolved) {
        this.evolveQueue.push({ uid: u.uid, from: before, to: unitName(u), element: u.element });
        // 진화 각성: 그 단계의 핵심 스킬을 즉시 배운다
        const key = state.evolveKeySkill(u);
        if (key) this.gainQueue.push({ uid: u.uid, cardId: key });
        rewards.push(`${displayName(u)} 진화! ${u.stage}단 달성`);
      }
      this.gainQueue.push(...r.gains);
    }
    if (this.gainQueue.length) rewards.push(`새 스킬 ${this.gainQueue.length}장 획득`);
    // 유대 성장: 함께 클리어한 유닛일수록 누적(뚝심 육성 보상, §14)
    state.growBond();
    if (state.roster.length) rewards.push('동료 유대 상승. HP와 공격 보너스가 증가합니다.');
    // 클리어 즉시 다음 스테이지로 전진시켜 저장 — "보상만 받고 종료 → 같은 스테이지 반복" 파밍 방지
    state.stageIndex += 1;
    this.ui.showStageClear(def.label, rewards);
    saveRun();
  }

  /** '다음으로' 버튼 → 성장 플로우(카드 획득) → 로비 (갈림길은 스테이지 중간 보너스로 이동) */
  private afterStageClear(): void {
    this.growthDest = 'lobby';
    this.continueGrowthFlow();
  }

  /** 스테이지 중간(마지막 웨이브 직전) 보너스 강화 3택1. */
  private showMidBonus(): void {
    this.paused = true;
    const picks = BUFF_NODES.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    this.ui.showBonus(picks.map((b) => ({ id: b.apply, label: b.label })));
  }

  /** 진화 연출 → 카드 획득/교체 → 끝나면 목적지(갈림길/로비)로. */
  private continueGrowthFlow(): void {
    if (this.processEvolveQueue()) return;
    if (this.processGainQueue()) return;
    saveRun();
    if (this.growthDest === 'lobby') { this.growthDest = 'node'; this.backToLobby(); return; }
    this.showNodeChoice();
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

  private showNodeChoice(): void {
    if (state.stageIndex >= STAGES.length) { this.backToLobby(); return; }
    this.ui.showNodeChoice([
      { kind: 'battle', label: '전투', desc: '다음 전장으로 이동합니다. 기본 보상을 받을 수 있습니다.' },
      { kind: 'buff', label: '강화', desc: '영구 강화 3개 중 하나를 선택합니다.' },
      { kind: 'event', label: '이벤트', desc: '예상 밖의 사건을 만나 보상이나 위험을 마주합니다.' },
    ]);
  }

  private chooseNode(kind: string): void {
    if (kind === 'buff') {
      // 3택1 (§10) — 풀에서 무작위 3개
      const picks = BUFF_NODES.slice().sort(() => Math.random() - 0.5).slice(0, 3);
      this.ui.showBuffChoice(picks.map((b) => ({ id: b.apply, label: b.label })));
    } else if (kind === 'event') {
      const node = EVENT_NODES[Math.floor(Math.random() * EVENT_NODES.length)];
      this.ui.showEvent(node);
    } else {
      this.backToLobby();
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
    }
  }

  /** 이벤트 종료 → (온천 성장 시) 분기/카드 획득 플로우 → 로비 */
  private afterEvent(): void {
    this.growthDest = 'lobby';
    this.continueGrowthFlow();
  }

  /** 갈림길까지 마치면 로비로 복귀. (stageIndex는 클리어 시점에 이미 전진됨) */
  private backToLobby(): void {
    this.battle?.finish();
    this.battle = null;
    if (state.stageIndex >= STAGES.length) { this.win(); return; }
    saveRun();
    this.showLobby();
  }

  private win(): void {
    this.mode = 'title';
    this.ui.showWin(ENEMIES.tyrant.name);
    clearRun();
  }

  private lose(reason: string): void {
    this.paused = true;
    this.battle?.finish();
    this.battle = null;
    this.mode = 'title';
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
        this.lastPhase = this.battle.phase;
        this.refreshHand();
        this.refreshPlacement();
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
      this.battle.phase = 'placement'; // 중복 방지 (이미 처리)
      this.onStageClearedDetected();
    } else if (phase === 'bonus') {
      this.battle.phase = 'placement'; // 보너스 처리 후 마지막 웨이브 배치 페이즈로
      this.showMidBonus();
    } else if (phase === 'won') {
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
      wave: Math.min(b.waveIndex + 1, b.totalWaves), totalWaves: b.totalWaves,
      gold: state.gold,
      enemiesLeft: b.enemies.filter((e) => e.alive).length,
      phaseLabel: b.phase,
      showBeginWave: b.phase === 'placement',
    });
  }
}
