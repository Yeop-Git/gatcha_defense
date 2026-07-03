import { Scene } from '../render/Scene';
import { MonsterViewer } from '../render/MonsterViewer';
import { UI, type HandCard } from '../ui/UI';
import { state, unitName, EQUIP_CAP } from './GameState';
import { saveRun, loadRun, clearRun, hasRun } from './save';
import { Battle } from '../systems/Battle';
import { STAGES, BUFF_NODES, EVENT_NODES } from '../data/stages';
import { cardsOfCharacter, CARD_BY_ID, cardIcon } from '../data/cards';
import { MONSTERS } from '../data/monsters';
import type { Element } from './types';
import { DIFFICULTY_JUMP_MULT, FIXED_DT } from '../data/constants';
import { bus } from './events';

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
    this.wireBus();
    this.ui.showTitle(hasRun());
    requestAnimationFrame((t) => this.loop(t));
  }

  private wireUI(): void {
    this.ui.onStart = () => this.startRun();
    this.ui.onContinue = () => this.continueRun();
    this.ui.onBeginWave = () => this.battle?.beginWave();
    this.ui.onCardGrab = (id, ev) => this.beginCardDrag(id, ev);
    this.ui.onCardBlocked = (reason) => this.ui.toast(reason, 'bad');
    this.ui.onOpenViewer = () => this.openViewer();
    this.ui.onCloseViewer = () => this.closeViewer();
    this.ui.onViewerSelect = (uid) => {
      const u = state.roster.find((x) => x.uid === uid);
      if (u) this.viewer.setUnit(u);
    };
    this.ui.onNode = (kind) => this.chooseNode(kind);
    this.ui.onBuffPick = (id) => { state.applyBuff(id); this.backToLobby(); };
    this.ui.onDraftPick = (el) => this.pickDraft(el);
    this.ui.onEventPick = (id) => { this.applyEvent(id); this.afterEvent(); };
    this.ui.onNext = () => this.afterStageClear();
    this.ui.onBranchPick = (uid, key) => this.pickBranch(uid, key);
    this.ui.onRestart = () => { clearRun(); this.startRun(); };
    this.ui.onPlacementToggle = (id) => { this.battle?.togglePlace(id); this.refreshPlacement(); };
    this.ui.onEnterBattle = () => this.enterBattle();
    this.ui.onManage = () => this.openManage();
    this.ui.onManageClose = () => this.showLobby();
    this.ui.onManageSelectHolder = (id) => { this.manageHolder = id; this.renderManage(); };
    this.ui.onManageToggle = (holderId, cardId) => this.toggleEquip(holderId, cardId);
    this.ui.onOpenCodex = () => this.ui.showCodex(state.discovered);
  }

  private lastPhase = '';
  private refreshPlacement(): void {
    if (this.battle && this.battle.phase === 'placement' && !this.paused) {
      this.ui.showPlacement(this.battle.placeablesState());
    } else {
      this.ui.hidePlacement();
    }
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

  // ── 카드 사용 (더블탭=스마트, 드래그=정밀) ──
  private dragId: string | null = null;
  private dragGhost: HTMLElement | null = null;
  private dragMoved = false;
  private lastTapId = '';
  private lastTapAt = 0;
  private tapHintShown = false;

  /** 하단 카드 선반 높이(px) — 그 위쪽이 전장. isOverField 판정용. */
  private static readonly SHELF_H = 176;
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
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      this.ui.setTargeting(false);
      this.ui.setDropZone('off');
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

  private wireBus(): void {
    bus.on('mana:change', () => { if (this.mode === 'battle') this.refreshHand(); });
    bus.on('card:played', () => this.refreshHand());
    bus.on('unit:levelup', () => this.refreshHand());
    bus.on('synergy:fire', ({ discovered, name }) => {
      if (discovered) { saveRun(); this.ui.toast(`📜 반응 도감 등록: ${name}`, 'good'); }
    });
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
      discoveredCount: state.discovered.length,
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
    state.draftPick(element as Element);
    saveRun();
    this.ui.toast(`${unitName(state.roster[state.roster.length - 1])} 합류!`, 'good');
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
      { id: 'hero', name: '성 (공용)', element: 'neutral' as const, level: 1 },
      ...state.roster.map((u) => ({ id: u.uid, name: unitName(u), element: u.element, level: u.level })),
    ];
    const lvl = state.holderLevel(id);
    const branch = state.holderBranch(id);
    const equipped = state.equippedOf(id);
    const cards = cardsOfCharacter(state.holderCharacter(id))
      // 분기 시그니처는 다른 분기 것은 숨김 (선택한/미선택 분기만 노출)
      .filter((c) => !c.branch || !branch || c.branch === branch)
      .map((c) => ({
        id: c.id, name: c.name, element: c.element, cost: c.cost, text: c.text,
        learnLevel: c.learnLevel,
        learned: c.learnLevel <= lvl && (!c.branch || c.branch === branch),
        equipped: equipped.includes(c.id),
        branchLocked: !!c.branch && c.branch !== branch,
      }));
    this.ui.showManage({ holders, selected: id, level: lvl, cards, equippedCount: equipped.length, cap: EQUIP_CAP });
  }

  private toggleEquip(holderId: string, cardId: string): void {
    const eq = [...state.equippedOf(holderId)];
    const i = eq.indexOf(cardId);
    if (i >= 0) {
      eq.splice(i, 1);
    } else {
      const learned = state.learnedIdsFor(state.holderCharacter(holderId), state.holderLevel(holderId), state.holderBranch(holderId));
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
    const hpScale = (1 + index * 0.08) * (1 + (DIFFICULTY_JUMP_MULT - 1) * jumps);
    this.battle = new Battle(this.scene, state, def, hpScale);
    this.paused = false;
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
    const cards: HandCard[] = [];
    for (const id of b.deck.hand) {
      const playable = b.deck.canPlay(id);
      cards.push({ id, playable, reason: playable ? undefined : '마나가 부족합니다' });
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

  // ── 스테이지 클리어 → 보상/분기 진화/갈림길 ──
  /** 3단 도달 후 분기 미선택 유닛 대기열 (스테이지 클리어/이벤트 성장 후 처리) */
  private branchQueue: string[] = [];

  private queueBranchChoices(): void {
    for (const u of state.roster) {
      if (u.stage >= 3 && !u.branch && !this.branchQueue.includes(u.uid)) this.branchQueue.push(u.uid);
    }
  }

  private onStageClearedDetected(): void {
    this.paused = true;
    const def = this.battle!.stage;
    // 유닛 경험치 지급
    const rewards: string[] = [`🪙 골드 ${state.gold}`];
    const xpGain = 40 + def.id * 15;
    const newCards: string[] = [];
    for (const u of state.roster) {
      const r = state.addUnitXp(u, xpGain);
      if (r.evolved) rewards.push(`✨ ${unitName(u)} 진화! → ${u.stage}단`);
      r.newCards.forEach((c) => newCards.push(c));
    }
    if (newCards.length) rewards.push(`🃏 새 스킬 학습: ${newCards.join(', ')}`);
    // 유대 성장: 함께 클리어한 유닛일수록 누적(뚝심 육성 보상, §14)
    state.growBond();
    if (state.roster.length) rewards.push('🤝 동료 유대 상승 (HP·공격 보너스, 상한까지)');
    this.queueBranchChoices();
    if (this.branchQueue.length) rewards.push('🌟 분기 진화의 기로 — 형태를 선택하세요!');
    this.ui.showStageClear(def.label, rewards);
    saveRun();
  }

  /** '다음으로' 버튼 → 분기 진화 선택 or 갈림길 */
  private afterStageClear(): void {
    if (this.processBranchQueue()) return;
    this.showNodeChoice();
  }

  /** 분기 선택 대기열 처리. 띄웠으면 true. */
  private processBranchQueue(): boolean {
    while (this.branchQueue.length) {
      const uid = this.branchQueue[0];
      const u = state.roster.find((x) => x.uid === uid);
      if (!u || u.branch) { this.branchQueue.shift(); continue; }
      this.ui.showBranchChoice({
        uid: u.uid,
        name: unitName(u),
        element: u.element,
        branches: MONSTERS[u.element].branches.map((b) => ({
          key: b.key, name: b.name, role: b.role, tint: b.tint,
          signature: CARD_BY_ID[b.signatureCardId]?.name ?? '',
        })),
      });
      return true;
    }
    return false;
  }

  /** 분기 진화 선택 (§5.6) → 시그니처 카드 해금 */
  private pickBranch(uid: string, key: string): void {
    const sig = state.chooseBranch(uid, key as 'A' | 'B');
    const u = state.roster.find((x) => x.uid === uid);
    if (u && sig) {
      const br = MONSTERS[u.element].branches.find((b) => b.key === key)!;
      this.ui.toast(`🌟 ${unitName(u)} → ${br.name}! 시그니처 카드 「${sig}」 해금`, 'good');
    }
    this.branchQueue = this.branchQueue.filter((x) => x !== uid);
    saveRun();
    if (this.processBranchQueue()) return;
    // 이벤트(온천) 경로에서 진입했으면 갈림길이 아니라 로비로
    if (this.pendingLobbyAfterBranch) { this.pendingLobbyAfterBranch = false; this.backToLobby(); return; }
    this.showNodeChoice();
  }

  private showNodeChoice(): void {
    if (state.stageIndex + 1 >= STAGES.length) { this.backToLobby(); return; }
    this.ui.showNodeChoice([
      { kind: 'battle', label: '⚔️ 전투 노드', desc: '표준 보상. 곧장 다음 전장으로.' },
      { kind: 'buff', label: '🌟 버프 노드', desc: '유용한 영구 강화 3택1.' },
      { kind: 'event', label: '❓ 이벤트 노드', desc: '수상한 사건… 위험과 보상.' },
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
        state.roster.forEach((u) => { const r = state.addUnitXp(u, 40); if (r.evolved) evolved.push(unitName(u)); });
        this.ui.toast(evolved.length ? `온천 효과! ${evolved.join(', ')} 진화!` : '온천 효과! 모든 유닛 성장', 'good');
        this.queueBranchChoices();
        break;
      }
      case 'egg':
        if (Math.random() < 0.5) { state.gold += 60; this.ui.toast('알에서 금화가! 골드 +60', 'good'); }
        else this.ui.toast('알은 부화하지 않았다…', 'bad');
        break;
      case 'altar':
        state.baseHp = Math.max(1, state.baseHp - 15); state.gold += 50;
        this.ui.toast('제단: 기지 HP -15, 골드 +50', 'bad');
        break;
    }
  }

  /** 이벤트 종료 → (온천 진화 시) 분기 선택 → 로비 */
  private afterEvent(): void {
    if (this.processBranchQueue()) { this.pendingLobbyAfterBranch = true; return; }
    this.backToLobby();
  }
  private pendingLobbyAfterBranch = false;

  /** 갈림길까지 마치면 로비로 복귀. 로비 전투 버튼으로 다음 스테이지 진입. */
  private backToLobby(): void {
    this.battle?.finish();
    this.battle = null;
    state.stageIndex = state.stageIndex + 1;
    if (state.stageIndex >= STAGES.length) { this.win(); return; }
    saveRun();
    this.showLobby();
  }

  private win(): void {
    this.mode = 'title';
    const { final } = state.corruptedBosses();
    this.ui.showWin(MONSTERS[final].stages[2].name);
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
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 5) {
        this.battle.update(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
      this.updateHUD();
      this.checkBattlePhase();
      if (this.battle && this.battle.phase !== this.lastPhase) {
        this.lastPhase = this.battle.phase;
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
    } else if (phase === 'won') {
      this.battle.finish(); this.battle = null; this.win();
    } else if (phase === 'lost') {
      const reason = '성(거점)이 무너졌습니다.';
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
      wave: Math.min(b.waveIndex + 1, b.totalWaves), totalWaves: b.totalWaves,
      gold: state.gold,
      enemiesLeft: b.enemies.filter((e) => e.alive).length,
      phaseLabel: b.phase,
      showBeginWave: b.phase === 'placement',
    });
  }
}
