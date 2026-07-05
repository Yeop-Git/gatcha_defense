// 紐⑤뱺 留ㅼ쭅 ?섎쾭???ш린濡? 諛몃윴?깆? ???뚯씪怨?媛?data ?뚯씪留??섏젙. (짠14 湲곗?)
import type { Element, ElementOrNeutral, MarkType } from '../core/types';
import type { EnemyTier } from './enemies';

/** ?곕뱶???붾젅??+ ?띿꽦??(ASSETS.md 짠3.2). Three.js/罹붾쾭?ㅼ뿉????16吏꾩닔. */
export const COLORS = {
  woodDark: 0x3e2a1b,
  woodMid: 0x5c4028,
  woodLight: 0x8a6642,
  parchment: 0xefe3c2,
  gold: 0xd8a93b,
  goldBright: 0xf2ce6b,
  manaCrystal: 0x4fa8d8,
  hpRuby: 0xc0392b,
} as const;

/** 5?띿꽦 怨좎젙 紐⑸줉 (?쒕옒?꾪듃/?쒗쉶?? */
export const ELEMENTS: Element[] = ['fire', 'water', 'grass', 'light', 'dark'];

/** 원정대/전장 동료 수는 게임 전체에서 5명으로 고정. */
export const PARTY_SIZE = 5;

/** ?띿꽦 ?ъ씤??而щ윭 (?대갚 罹≪뒓/?댄럺???댄듃) */
export const ELEMENT_COLOR: Record<Element, number> = {
  fire: 0xe8632c,
  water: 0x3fa9bf,
  grass: 0x6fae4c,
  light: 0xf2ce6b,
  dark: 0x4a4e9e,
};

export const NEUTRAL_COLOR = 0xb8a888;

/** ?띿꽦 ?꾩씠肄?(?대え吏 ?대갚 ??Sora ?꾩씠肄?誘몄셿???? */
export const ELEMENT_ICON: Record<Element, string> = {
  fire: '🔥',
  water: '💧',
  grass: '🌿',
  light: '✨',
  dark: '🌙',
};

export const ELEMENT_NAME_KO: Record<Element, string> = {
  fire: '불',
  water: '물',
  grass: '풀',
  light: '빛',
  dark: '어둠',
};

export const MARK_ICON: Record<MarkType, string> = {
  burn: '🔥',
  wet: '💧',
  overgrowth: '🍃',
  curse: '🌑',
  bless: '🌟',
};

/** 寃⑹옄 ?꾩옣 洹쒓꺽. ???= ?뺤쑁硫댁껜. 寃쎈줈??吏곴컖(寃⑹옄 ?뺣젹). */
export const TILE = 2;
export const GRID_COLS = 18;
export const GRID_ROWS = 12;

/** (col,row) 寃⑹옄 ? ???붾뱶 XZ 以묒떖 醫뚰몴 */
export function cellCenter(col: number, row: number): { x: number; z: number } {
  return { x: (col - (GRID_COLS - 1) / 2) * TILE, z: (row - (GRID_ROWS - 1) / 2) * TILE };
}

/** 寃쎈줈 瑗?쭞??(寃⑹옄 ?, 吏곴컖?쇰줈留?爰얠엫). 留덉?留?= 湲곗?. */
/** 스테이지별 경로 레이아웃(꺾은선 코너, 축정렬). 스테이지마다 진로가 달라진다. */
// 스테이지마다 다른 진로 — 10개 각기 다른 정체성(경로 형태). 각 세그먼트는 축정렬(한 축만 변화).
const PATH_LAYOUTS: [number, number][][] = [
  [[0, 3], [4, 3], [4, 8], [10, 8], [10, 3], [14, 3], [14, 8], [16, 8]],            // 0 지그재그
  [[0, 2], [6, 2], [6, 9], [12, 9], [12, 2], [16, 2]],                              // 1 S자
  [[0, 6], [5, 6], [5, 2], [11, 2], [11, 9], [16, 9]],                              // 2 계단
  [[0, 3], [3, 3], [3, 8], [7, 8], [7, 3], [11, 3], [11, 8], [15, 8], [15, 4], [16, 4]], // 3 톱니
  [[0, 9], [13, 9], [13, 2], [16, 2]],                                             // 4 ㄴ자 롱
  [[0, 2], [4, 2], [4, 9], [9, 9], [9, 2], [13, 2], [13, 9], [16, 9]],             // 5 깊은 V 연속
  [[0, 10], [4, 10], [4, 7], [8, 7], [8, 4], [12, 4], [12, 1], [16, 1]],           // 6 오르막 계단
  [[0, 6], [7, 6], [7, 2], [13, 2], [13, 9], [16, 9]],                             // 7 넓은 S
  [[0, 8], [3, 8], [3, 3], [7, 3], [7, 8], [11, 8], [11, 3], [15, 3], [15, 8], [16, 8]], // 8 이중 톱니
  [[0, 3], [9, 3], [9, 9], [13, 9], [13, 4], [16, 4]],                             // 9 긴 직선 후 꺾임
];

/** 瑗?쭞???ъ씠瑜?紐⑤뱺 寃⑹옄 ?濡??꾧컻 (寃쎈줈 ????뚮뜑/?먯젙?? */
function expandCells(corners: [number, number][]): [number, number][] {
  const cells: [number, number][] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const [c1, r1] = corners[i + 1];
    let [c, r] = corners[i];
    const dc = Math.sign(c1 - c), dr = Math.sign(r1 - r);
    while (c !== c1 || r !== r1) { cells.push([c, r]); c += dc; r += dr; }
  }
  cells.push(corners[corners.length - 1]);
  return cells;
}

export const FIELD = {
  tile: TILE,
  cols: GRID_COLS,
  rows: GRID_ROWS,
  cellCenter,
  /** ??吏꾧꺽 寃쎈줈 (醫뚢넂?? 留덉?留됱씠 湲곗?) */
  path: [] as { x: number; z: number }[],
  /** 寃쎈줈媛 ?먯쑀?섎뒗 寃⑹옄 ? 吏묓빀 "col,row" */
  pathCellSet: new Set<string>(),
};

/** 성(城)과 유닛 배치 슬롯이 렌더상 겹치지 않도록 두는 최소 간격(월드 단위).
 *  성 받침 반경 ≈3.2 + 유닛 몸통 여유. 이 반경 안의 경로 인접 셀은 배치 슬롯에서 제외. */
export const CASTLE_CLEARANCE = 4.4;

/** 경로 인접(비경로) 셀에 배치 슬롯 자동 생성 — 경로를 따라 고르게 count개. 성 주변은 제외. */
function genSlots(cells: Set<string>, castleCell: [number, number], count = PARTY_SIZE): { x: number; z: number }[] {
  const castle = cellCenter(castleCell[0], castleCell[1]);
  const cand: { col: number; row: number }[] = [];
  for (let col = 0; col < GRID_COLS; col++) for (let row = 0; row < GRID_ROWS; row++) {
    if (cells.has(`${col},${row}`)) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => cells.has(`${col + dc},${row + dr}`));
    if (!near) continue;
    // 성과 겹치는 자리는 배치 슬롯에서 제외 — 내 캐릭터가 성에 파묻히던 문제 방지.
    const p = cellCenter(col, row);
    if (Math.hypot(p.x - castle.x, p.z - castle.z) < CASTLE_CLEARANCE) continue;
    cand.push({ col, row });
  }
  cand.sort((a, b) => a.col - b.col || a.row - b.row); // 좌→우(진행 방향 근사)로 정렬
  if (cand.length <= count) return cand.map((c) => cellCenter(c.col, c.row));
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (cand.length - 1)) / (count - 1));
    out.push(cellCenter(cand[idx].col, cand[idx].row));
  }
  return out;
}

/** 스테이지 레이아웃 적용 — FIELD.path/pathCellSet/UNIT_SLOTS를 인플레이스로 교체(참조 유지). */
export function setStageLayout(stageIndex: number): void {
  const corners = PATH_LAYOUTS[((stageIndex % PATH_LAYOUTS.length) + PATH_LAYOUTS.length) % PATH_LAYOUTS.length];
  const pts = corners.map(([c, r]) => cellCenter(c, r));
  FIELD.path.length = 0; FIELD.path.push(...pts);
  FIELD.pathCellSet.clear();
  for (const [c, r] of expandCells(corners)) FIELD.pathCellSet.add(`${c},${r}`);
  const castleCell = corners[corners.length - 1]; // 경로 끝 = 성 위치
  const slots = genSlots(FIELD.pathCellSet, castleCell, PARTY_SIZE);
  UNIT_SLOTS.length = 0; UNIT_SLOTS.push(...slots);
}

/** ?좊떅 怨좎젙 諛곗튂 ?щ’ (寃쎈줈 ?몄젒 ?붾뵒 ?). 二쇱씤怨??ы븿 理쒕? 4媛??ъ슜. 짠2 */
// ?쒖꽌 = autoPlace ?곗꽑?쒖쐞. ??3媛쒓? 吏꾩엯/以묒븰/?꾨컲??怨좊Ⅴ寃?而ㅻ쾭?섎룄濡?諛곗튂(寃쎈줈 ?꾨컲 諛⑹뼱).
export const UNIT_SLOTS: { x: number; z: number }[] = [
  { x: -11, z: -3 }, // 0 吏꾩엯遺
  { x: 1, z: -3 },   // 1 以묒븰
  { x: 9, z: -3 },   // 2 ?꾨컲(湲곗? ?묎렐)
  { x: -7, z: 3 },   // 3 吏꾩엯 蹂닿컯
  { x: 1, z: 3 },    // 4 以묒븰 蹂닿컯
];

/** ?꾪룷??GLB ?띿뒪泥?理쒕? ?댁긽??(?⑸웾 ?덇컧). 珥덇낵 ??罹붾쾭?ㅻ줈 異뺤냼. */
setStageLayout(0); // 초기 레이아웃(모듈 로드 시 FIELD.path/슬롯 채우기)

export const MODEL_MAX_TEXTURE = 1024;

/** 移댄댆 ?뚮뜑: GLB 癒명떚由ъ뼹??unlit(MeshBasic)濡?蹂??+ 寃? ?멸낸??inverted hull). */
export const MODEL_UNLIT = true;
export const MODEL_OUTLINE = true;
/** ?멸낸???먭퍡 (酉?怨듦컙 ?⑥쐞 ???붾뱶 ?⑥쐞, 紐⑤뜽 ?ㅼ??쇨낵 臾닿??섍쾶 ?쇱젙). */
export const MODEL_OUTLINE_THICKNESS = 0.012;

/**
 * 성(기지) 모델 목표 높이. public/assets/models/castle.glb 를 넣으면 이 높이로
 * 정규화되어 폴백 성채를 대체한다(발바닥 y=0). 없으면 조용히 폴백 유지.
 * 폴백 성채의 총높이(약 6.5)에 맞춰둔 값 — 넣을 모델 비례에 맞게 여기만 조정.
 */
export const CASTLE_MODEL_HEIGHT = 6.5;

/** ?ы듃?덉씠??PNG) ?뺢퇋???뺤궗媛곹삎 ??蹂 px + ?щ갚 鍮꾩쑉 */
export const PORTRAIT_SIZE = 256;
export const PORTRAIT_PADDING = 0.08;
/** ??諛곌꼍 ?꾨겮: ?곗깋怨쇱쓽 ?됯굅由?0~441)濡??먯젙.
 *  LOW ?댄븯 = ?꾩쟾 ?щ챸(諛곌꼍), HIGH ?댁긽 = 罹먮┃??蹂댁〈), ?ъ씠 = 寃쎄퀎 ?섎뜑. */
export const PORTRAIT_KEY_LOW = 26;
export const PORTRAIT_KEY_HIGH = 92;

/** 湲곗? / 二쇱씤怨?湲곕낯移?(짠14) */
export const BASE_HP = 235; // ?꾨컲 ?ㅼ썫/?꾩닔??寃щ뵒?꾨줉 ?곹뼢(諛몃윴??
export const BASE_LEAK_NORMAL = 3;
export const BASE_LEAK_MINIBOSS = 30; // 밸런스: 미니보스 루프백 누수 소폭↑(20→24) — 점프 스테이지 긴장 (스테이지1~3 온보딩은 유지)
export const BASE_LEAK_BOSS = 60;     // 밸런스: 보스 루프백 누수 ↓(70→60) — 불가피한 죽음 절벽 방지(플랫·비스케일). 위협은 공성으로.

// SIEGE: normal enemies that reach the castle no longer vanish with a flat leak.
// They stop at the gate and strike the castle for their own `attack` value every `interval`
// seconds (visible attack motion + damage number), so enemy attack stats finally matter and
// losing HP is never a "mystery death". Boss/miniboss keep the loop-back leak (BASE_LEAK_*).
// 밸런스: 성 위협의 핵심 밸브. 공성 피해 = round(적 attack × atkScale × attackMult)로 스테이지 스케일이 걸리고,
// 포탑+유닛을 뚫고 성문에 도달한 적에게만 적용된다 — 깔끔한 방어는 거의 안 아프고, 새어나간 웨이브는 성을 갉는다.
// mult 1.6/interval 1.05 (기존 1/1.2) ≈ 공성 DPS ×1.83. 병렬·무제한 공성이라 과하지 않게 유지(레드팀 검증).
export const SIEGE = { interval: 1.05, attackMult: 1.7 } as const;

// ENEMY_ATTACK: enemies now fight your units. A (non-boss) enemy that comes within `range` of an
// ally stops marching and strikes it every `interval` seconds for the enemy's own `attack`. Units
// have HP and are downed at 0 (out for the wave, revived next placement phase). This is the core
// "my character is under attack" risk — placement near the lane trades DPS for danger.
// 밸런스: leaveDuration 2.4→2.1 — 적이 속도방지턱 유닛에서 조금 더 빨리 이탈해 성문으로 흘러가도록(공성 밸브에 공급).
// hitsBeforeLeave·interval은 그대로 → 유닛이 받는 교전당 피해는 동일(유닛 생존 유지).
export const ENEMY_ATTACK = { range: 2.2, interval: 1.55, hitsBeforeLeave: 1, leaveDuration: 2.1 } as const;

/** ??諛섍꺽: 洹쇱쿂 諛⑹뼱???좊떅/二쇱씤怨?瑜?二쇨린 ?寃????뷀렂???깅┰(??蹂댄샇留?遺??移대뱶媛 ?섎?瑜?媛吏?. */
// 적→아군 교전 파라미터는 위 ENEMY_ATTACK 참조. 아군 유닛은 이제 피해를 받고 쓰러질 수 있다
// (불사 포탑 설계 폐기). 관련: Monster.takeDamage/restoreFull, Enemy.engaging, Battle.enemyStrikeUnit.

// ??嫄곗젏) ?꾪닾移???二쇱씤怨??듯빀. 寃쎈줈 ?앹쓽 ?깆씠 ?볦? ?ш굅由щ줈 ?꾨컲 寃쎈줈瑜?諛⑹뼱.
export const HERO = {
  hp: 120,
  // 밸런스(성 위협 강화): 포탑 공격력 대폭 너프. attack 17→7, 공속 1.25→1.05 (DPS 21.25→7.35, ≈-65%).
  // 성문 포탑이 더 이상 새어든 물량을 혼자 정리하지 못한다 → 유닛 방어선을 뚫으면 성이 실제로 위협받는다.
  attack: 7,
  attackSpeed: 1.05,
  range: 7.5, // 사거리는 유지 — 보스가 얼마나 일찍 교전되는지(플랫 누수 랩 수)를 결정하므로 건드리지 않음.
} as const;

/** 理쒕? 蹂댁쑀쨌湲곗슜 紐ъ뒪????(creature + ?ы쉷 enemy ?⑹퀜). 媛?5????紐ъ뒪????30??+ 臾댁깋 5. */
export const MAX_MONSTERS = PARTY_SIZE;

/** ?좊떅 1??湲곕낯移?+ 吏꾪솕 諛곗쑉 (짠14) */
export const UNIT_BASE = {
  hp: 82,
  attack: 10,
  range: 3,
  attackSpeed: 1.0,
} as const;

export const EVOLVE_MULT = 1.6; // 吏꾪솕???ㅽ꺈 諛곗쑉
export const LATE_BLOOM_MULT = 0.88; // 鍮??대몺 1??蹂댁젙
export const LATE_BLOOM_STAGE3_JUMP = 1.85; // 3???꾨떖 ?먰봽

/**
 * ?좊?(Bond) ?깆옣 ???ъ폆紐ъ떇 "?뚮젅?댁뼱? ?④퍡 ?щ뒗" 異붽? ?ㅽ꺈 (짠14).
 * 湲곕낯 ?덈꺼 ?깆옣怨?蹂꾧컻濡? 蹂댁쑀???좊떅???ㅽ뀒?댁?瑜??④퍡 ?대━?댄븷 ?뚮쭏???뚰룺 ?꾩쟻.
 * ?덈줈 紐⑥쭛?섎뒗 寃껊낫?????좊떅???앹떖?덇쾶 ?≪꽦?섎뒗 履쎌뿉 蹂대꼫?ㅻ? 二쇰릺, ?곹븳?쇰줈 怨쇳븿 諛⑹?.
 */
export const BOND_PER_STAGE = 0.035; // ?ㅽ뀒?댁? ?대━?대떦 ?좊? +3.5% (HP쨌怨듦꺽) ???앹떖 ?≪꽦 蹂댁긽 媛뺥솕
export const BOND_CAP = 0.3; // ?좊? 蹂대꼫???곹븳 (+30%) ???꾨컲 援곕떒?????ㅼ??쇱쓣 ?곕씪媛?꾨줉

/** 留덈굹 (짠6). 湲곕낯? ?ㅽ럺(珥덈떦 1)??媛源앷쾶 ??? ?좊떅??留덈굹 ?뚰븨??媛?띿쓣 ?대떦. */
export const MANA_MAX = 8;
export const MANA_REGEN = 0.5; // 초당 기본 마나 회복. 역할분리로 덱이 크리처(고코스트 주문) 위주가 되므로 살짝 타이트하게(0.55→0.5) — 언제 무엇을 쓸지가 핵심 결정.
/** ? = 留덈굹 ?뚰븨: 諛곗튂??? ?좊떅 1泥대떦 珥덈떦 異붽? 留덈굹 */
export const GRASS_MANA_REGEN = 0.16;
export const HAND_SIZE = 5;
export const AUTO_DRAW_INTERVAL = 6;
export const CAPTURE_CARD_ID = 'n_capture';
/** ?묎툒 泥섏튂(湲곗? ?뚮났) ?ъ궗??荑⑤떎??珥? ??짠6.2 "荑⑤떎??議댁옱" */
export const BASE_HEAL_CD = 18;

// 밸런스(성장 곡선): XP +≈20% & monsters.csv 진화레벨 하향(불/물/풀 6·16, 빛/어둠 10·18) →
// 2단 진화 ≈ 스테이지 3, 최종(3단) 진화 ≈ 스테이지 8. "최종진화가 스테이지 10에야 나온다" 이슈 해소.
export const XP_REWARD = {
  kill: { swarm: 6, flyer: 7, normal: 10, healer: 11, tank: 13, elite: 19, miniboss: 44, boss: 110 } as Record<EnemyTier, number>,
  waveBase: 14,
  wavePerStage: 5,
  wavePerIndex: 4,
  finalWaveBonus: 10,
} as const;

/** 遺??floating) ?곗텧 ?뚮씪誘명꽣 ??鍮??대몺 ?뺣졊瑜섏뿉留??곸슜. ?섎㉧吏???묒?(?좊땲硫붿씠??異뷀썑). */
export const FLOAT = { height: 0.5, amp: 0.24, speed: 1.9 } as const;
/** 遺???띿꽦?멸? (鍮??대몺 = ?좊졊쨌?뺣졊瑜?. */
export function isFloating(el: ElementOrNeutral): boolean {
  return el === 'light' || el === 'dark';
}

/** ?쒖떇 湲곕낯 ?뚮씪誘명꽣 (짠4.3) */
export const MARK: Record<MarkType, { duration: number; maxStacks: number }> = {
  burn: { duration: 4, maxStacks: 5 },
  wet: { duration: 5, maxStacks: 1 },
  overgrowth: { duration: 6, maxStacks: 1 },
  curse: { duration: 8, maxStacks: 8 },
  bless: { duration: 10, maxStacks: 3 },
};

// ── 표식 정체성(역할 분리) ────────────────────────────────────────────────
// 각 속성 표식은 "명확히 다른 한 가지 역할"만 갖는다 — 화상만 지속피해, 나머지는 비피해 제어/증폭:
//   🔥 화상(burn)        = 지속 피해 (스택 DoT)          → 불 = 시간 화력
//   💧 젖음(wet)         = 가벼운 감속                    → 물 = 견제/넉백
//   🍃 덩굴(overgrowth)  = 강한 속박 (중감속 + 주기적 뿌리) → 풀 = 하드 CC (화상과 완전히 다름)
//   🌑 저주(curse)       = 받는 피해 증폭                 → 어둠 = 증폭/처형
//   🌟 축복(bless)       = 아군 공격력 버프 (적에겐 안 붙음) → 빛 = 지원
export const BURN_DPS_PER_STACK = 3;
export const WET_SLOW = 0.2;
export const CURSE_DMG_PER_STACK = 0.06;
export const BLESS_BUFF_PER_STACK = 0.1;
/** 덩굴 표식 = 하드 CC. 지속 감속(젖음보다 강함) + 주기적 뿌리로 "발을 묶는다". 더 이상 DoT가 아니다. */
export const OVERGROWTH_SLOW = 0.5;
export const OVERGROWTH_ROOT = { interval: 2.0, duration: 0.55 } as const;


/** ?대몺 3??泥섏튂 ?ㅽ깮 (짠5.4) */
export const DARK_KILL_STACK = 0.02;
export const DARK_KILL_STACK_MAX = 0.5;

/** 濡쒖쭅 怨좎젙 timestep */
export const FIXED_DT = 1 / 60;

/** ?쒖씠???먰봽 ?ㅽ뀒?댁??먯꽌 ???ㅽ꺈 諛곗쑉 (짠10) ??踰쎌씠 ?덈Т 媛?붾씪 ?꾪솕 */
export const DIFFICULTY_JUMP_MULT = 1.2;

/** 유닛 생존 바닥: 스테이지가 오를수록 아군 최대 HP를 +5%/스테이지 보정.
 *  (적 공격력·HP는 스테이지마다 오르는데 유닛 HP는 레벨/진화로만 올라, 뒤처진 유닛이 순삭되던 문제 완화) */
export const STAGE_HP_FLOOR_PER = 0.05;

/**
 * ?ы쉷 ??李⑹? ?뺥솗??湲곕컲 寃곗젙濡??먯젙(泥대젰 臾닿?). 蹂댁뒪/誘몃땲蹂댁뒪??HP0 ??湲곗젅 李쎌뿉?쒕쭔.
 * ?곗뼱蹂??ы쉷 諛섍꼍(李⑹? 吏?먭낵 ??以묒떖 嫄곕━ ??諛섍꼍?대㈃ ?깃났). ?쏀븳 ?곗뼱?쇱닔濡??됰꼮.
 */
export const CAPTURE = {
  orbDuration: 0.75, // ?ъ쿃 ?숉븯 ?쒓컙(珥? ???덉륫 由щ뱶媛 ?꾩슂???댁쑀
  arcHeight: 5,      // ?щЪ??理쒓퀬 ?믪씠
  cooldown: 5,       // 移대뱶 ?ъ궗??荑⑤떎??珥? ???쒖궗 諛⑹?
  bossStun: 3,       // 蹂댁뒪/誘몃땲蹂댁뒪 HP0 ???ы쉷 媛??湲곗젅 李?珥?
  duplicateXp: 120,
  duplicateBond: 0.04,
} as const;

// ── 표식 반응(시너지) ─────────────────────────────────────────────────────
// 서로 다른 속성 표식이 같은 적에게 겹치면 "반응"이 터진다(systems/reactions.ts의 단일 판정 테이블).
// 덱에 여러 속성을 섞을 전략적 이유 = 반응 폭발. 스택이 쌓인 적일수록 반응 피해가 커진다.
export const REACTION = {
  cooldown: 0.7,        // 적 1마리가 반응을 연속으로 터뜨리지 못하게 하는 최소 간격(초)
  dmgPerStagePct: 0.14, // 반응 피해 스테이지 스케일(+14%/스테이지) — 후반에도 유효타
} as const;

export const CAPTURE_RADIUS: Record<EnemyTier, number> = {
  swarm: 1.7, flyer: 1.35, normal: 1.5, tank: 1.2, healer: 1.45, elite: 1.15, miniboss: 0.95, boss: 0.9,
};

/** ?ы쉷???곸쓣 ?뚮젅?댁뼱釉붾줈 ?????ㅽ꺈 ?섏궛 諛곗쑉 (???꾧컧 ?ㅽ꺈 ???꾧뎔 ?좊떅 ?ㅼ???. */
export const ENEMY_PLAY = { hpMult: 1.5, atkMult: 1.3 } as const;
/** ?ы쉷 enemy 2??吏꾪솕 ?덈꺼 (???쇱씤留?. ?⑤룆/蹂댁뒪泥대뒗 臾댁쭊?? */
export const ENEMY_EVOLVE_LEVEL = 10;

// ?? 罹먮┃???ш린 ?뺢퇋???????????????????????????????
/** ?뚮젅?댁뼱釉??좊떅(?щ━泥샕룻룷?띿껜) ?뺢퇋???믪씠 ??吏꾪솕?좎닔濡??뚰룺 而ㅼ쭊?? */
export const UNIT_HEIGHT = { base: 2.0, perStage: 0.26 } as const;
export function unitHeight(stage: number): number {
  return UNIT_HEIGHT.base + (Math.max(1, stage) - 1) * UNIT_HEIGHT.perStage;
}
/** 속성별 크리처 표시 배율 — 모델 비율 편차 보정. 물 거북은 몸통이 커 보여 축소. */
export const CREATURE_DISPLAY_SCALE: Record<Element, number> = {
  fire: 1, water: 0.6, grass: 1, light: 1, dark: 1,
};

/** 만렙 (레벨 확장). 이 이상 XP는 누적하지 않는다. 크리처 = 30. */
export const MAX_LEVEL = 30;
/** 포획 적(enemy) 육성 상한 — 크리처(30)보다 낮게 두어 차등. */
export const ENEMY_MAX_LEVEL = 25;
/** 레벨당 스탯 성장률(HP·공격). 30레벨 확장에 맞춰 완만하게. */
export const LEVEL_GROWTH_PER = 0.035;

/** 치명타 스탯: 레벨업=부드럽게, 진화=든든하게 증가. */
export const CRIT = {
  chanceBase: 0.05, chancePerLevel: 0.004, chancePerStage: 0.03, chanceMax: 0.5,
  dmgBase: 1.5, dmgPerLevel: 0.01, dmgPerStage: 0.12,
} as const;
/** ?꾨뱶 ???뺢퇋???믪씠 (?곗뼱蹂???蹂댁뒪/誘몃땲蹂댁뒪???쇰????ш쾶). */
export const ENEMY_HEIGHT: Record<EnemyTier, number> = {
  swarm: 1.6, flyer: 1.8, normal: 2.0, healer: 2.0, tank: 2.4, elite: 2.8, miniboss: 4.2, boss: 6.2,
};
/** ?ы쉷??蹂댁뒪/誘몃땲蹂댁뒪泥대뒗 ?꾧뎔?쇰줈 ?⑤룄 ?ш쾶 (?꾩븬媛??좎?). */
export const CAPTURED_BOSS_SCALE = 1.5;

