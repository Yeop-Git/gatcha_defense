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
  fire: '불',
  water: '물',
  grass: '풀',
  light: '빛',
  dark: '암',
};

export const ELEMENT_NAME_KO: Record<Element, string> = {
  fire: '불',
  water: '물',
  grass: '풀',
  light: '빛',
  dark: '어둠',
};

export const MARK_ICON: Record<MarkType, string> = {
  burn: '화상',
  wet: '젖음',
  overgrowth: '덩굴',
  curse: '저주',
  bless: '축복',
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
const PATH_CORNERS: [number, number][] = [
  [0, 3], [4, 3], [4, 8], [10, 8], [10, 3], [14, 3], [14, 8], [16, 8],
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
  path: PATH_CORNERS.map(([c, r]) => cellCenter(c, r)),
  /** 寃쎈줈媛 ?먯쑀?섎뒗 寃⑹옄 ? 吏묓빀 "col,row" */
  pathCellSet: new Set(expandCells(PATH_CORNERS).map(([c, r]) => `${c},${r}`)),
};

/** ?좊떅 怨좎젙 諛곗튂 ?щ’ (寃쎈줈 ?몄젒 ?붾뵒 ?). 二쇱씤怨??ы븿 理쒕? 4媛??ъ슜. 짠2 */
// ?쒖꽌 = autoPlace ?곗꽑?쒖쐞. ??3媛쒓? 吏꾩엯/以묒븰/?꾨컲??怨좊Ⅴ寃?而ㅻ쾭?섎룄濡?諛곗튂(寃쎈줈 ?꾨컲 諛⑹뼱).
export const UNIT_SLOTS: { x: number; z: number }[] = [
  { x: -11, z: -3 }, // 0 吏꾩엯遺
  { x: 1, z: -3 },   // 1 以묒븰
  { x: 9, z: -3 },   // 2 ?꾨컲(湲곗? ?묎렐)
  { x: -7, z: 3 },   // 3 吏꾩엯 蹂닿컯
  { x: 1, z: 3 },    // 4 以묒븰 蹂닿컯
  { x: -7, z: -3 },  // 5 ?덈퉬
];

/** ?꾪룷??GLB ?띿뒪泥?理쒕? ?댁긽??(?⑸웾 ?덇컧). 珥덇낵 ??罹붾쾭?ㅻ줈 異뺤냼. */
export const MODEL_MAX_TEXTURE = 1024;

/** 移댄댆 ?뚮뜑: GLB 癒명떚由ъ뼹??unlit(MeshBasic)濡?蹂??+ 寃? ?멸낸??inverted hull). */
export const MODEL_UNLIT = true;
export const MODEL_OUTLINE = true;
/** ?멸낸???먭퍡 (酉?怨듦컙 ?⑥쐞 ???붾뱶 ?⑥쐞, 紐⑤뜽 ?ㅼ??쇨낵 臾닿??섍쾶 ?쇱젙). */
export const MODEL_OUTLINE_THICKNESS = 0.012;

/** ?ы듃?덉씠??PNG) ?뺢퇋???뺤궗媛곹삎 ??蹂 px + ?щ갚 鍮꾩쑉 */
export const PORTRAIT_SIZE = 256;
export const PORTRAIT_PADDING = 0.08;
/** ??諛곌꼍 ?꾨겮: ?곗깋怨쇱쓽 ?됯굅由?0~441)濡??먯젙.
 *  LOW ?댄븯 = ?꾩쟾 ?щ챸(諛곌꼍), HIGH ?댁긽 = 罹먮┃??蹂댁〈), ?ъ씠 = 寃쎄퀎 ?섎뜑. */
export const PORTRAIT_KEY_LOW = 26;
export const PORTRAIT_KEY_HIGH = 92;

/** 湲곗? / 二쇱씤怨?湲곕낯移?(짠14) */
export const BASE_HP = 205; // ?꾨컲 ?ㅼ썫/?꾩닔??寃щ뵒?꾨줉 ?곹뼢(諛몃윴??
export const BASE_LEAK_NORMAL = 3;
export const BASE_LEAK_MINIBOSS = 20;
export const BASE_LEAK_BOSS = 70;

/** ??諛섍꺽: 洹쇱쿂 諛⑹뼱???좊떅/二쇱씤怨?瑜?二쇨린 ?寃????뷀렂???깅┰(??蹂댄샇留?遺??移대뱶媛 ?섎?瑜?媛吏?. */
export const ENEMY = {
  attackSpeed: 0.8,
  engageRange: 2.4,
} as const;

// ??嫄곗젏) ?꾪닾移???二쇱씤怨??듯빀. 寃쎈줈 ?앹쓽 ?깆씠 ?볦? ?ш굅由щ줈 ?꾨컲 寃쎈줈瑜?諛⑹뼱.
export const HERO = {
  hp: 120,
  attack: 17,
  attackSpeed: 1.45, // 珥덈떦 怨듦꺽 ?잛닔
  range: 7.5, // ?깆씠 ?ㅼ쭏??諛⑹뼱?먭? ?섎룄濡??됰꼮??寃쎈줈 ??而ㅻ쾭)
} as const;

/** 理쒕? 蹂댁쑀쨌湲곗슜 紐ъ뒪????(creature + ?ы쉷 enemy ?⑹퀜). 媛?5????紐ъ뒪????30??+ 臾댁깋 5. */
export const MAX_MONSTERS = 6;

/** ?좊떅 1??湲곕낯移?+ 吏꾪솕 諛곗쑉 (짠14) */
export const UNIT_BASE = {
  hp: 72,
  attack: 9,
  range: 3,
  attackSpeed: 1.0,
} as const;

export const EVOLVE_MULT = 1.6; // 吏꾪솕???ㅽ꺈 諛곗쑉
export const LATE_BLOOM_MULT = 0.8; // 鍮??대몺 1??蹂댁젙
export const LATE_BLOOM_STAGE3_JUMP = 1.9; // 3???꾨떖 ?먰봽

/**
 * ?좊?(Bond) ?깆옣 ???ъ폆紐ъ떇 "?뚮젅?댁뼱? ?④퍡 ?щ뒗" 異붽? ?ㅽ꺈 (짠14).
 * 湲곕낯 ?덈꺼 ?깆옣怨?蹂꾧컻濡? 蹂댁쑀???좊떅???ㅽ뀒?댁?瑜??④퍡 ?대━?댄븷 ?뚮쭏???뚰룺 ?꾩쟻.
 * ?덈줈 紐⑥쭛?섎뒗 寃껊낫?????좊떅???앹떖?덇쾶 ?≪꽦?섎뒗 履쎌뿉 蹂대꼫?ㅻ? 二쇰릺, ?곹븳?쇰줈 怨쇳븿 諛⑹?.
 */
export const BOND_PER_STAGE = 0.035; // ?ㅽ뀒?댁? ?대━?대떦 ?좊? +3.5% (HP쨌怨듦꺽) ???앹떖 ?≪꽦 蹂댁긽 媛뺥솕
export const BOND_CAP = 0.3; // ?좊? 蹂대꼫???곹븳 (+30%) ???꾨컲 援곕떒?????ㅼ??쇱쓣 ?곕씪媛?꾨줉

/** 留덈굹 (짠6). 湲곕낯? ?ㅽ럺(珥덈떦 1)??媛源앷쾶 ??? ?좊떅??留덈굹 ?뚰븨??媛?띿쓣 ?대떦. */
export const MANA_MAX = 8;
export const MANA_REGEN = 0.65; // Base mana per second. Kept tight so card timing matters.
/** ? = 留덈굹 ?뚰븨: 諛곗튂??? ?좊떅 1泥대떦 珥덈떦 異붽? 留덈굹 */
export const GRASS_MANA_REGEN = 0.18;
export const HAND_SIZE = 5;
export const CAPTURE_CARD_ID = 'n_capture';
/** ?묎툒 泥섏튂(湲곗? ?뚮났) ?ъ궗??荑⑤떎??珥? ??짠6.2 "荑⑤떎??議댁옱" */
export const BASE_HEAL_CD = 18;

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
  curse: { duration: 8, maxStacks: 5 },
  bless: { duration: 10, maxStacks: 3 },
};

export const BURN_DPS_PER_STACK = 3;
export const WET_SLOW = 0.2;
export const CURSE_DMG_PER_STACK = 0.05;
export const BLESS_BUFF_PER_STACK = 0.1;
export const OVERGROWTH_SLOW = 0.4;
export const OVERGROWTH_DPS = 4;


/** ?대몺 3??泥섏튂 ?ㅽ깮 (짠5.4) */
export const DARK_KILL_STACK = 0.02;
export const DARK_KILL_STACK_MAX = 0.5;

/** 濡쒖쭅 怨좎젙 timestep */
export const FIXED_DT = 1 / 60;

/** ?쒖씠???먰봽 ?ㅽ뀒?댁??먯꽌 ???ㅽ꺈 諛곗쑉 (짠10) ??踰쎌씠 ?덈Т 媛?붾씪 ?꾪솕 */
export const DIFFICULTY_JUMP_MULT = 1.28;

/**
 * ?ы쉷 ??李⑹? ?뺥솗??湲곕컲 寃곗젙濡??먯젙(泥대젰 臾닿?). 蹂댁뒪/誘몃땲蹂댁뒪??HP0 ??湲곗젅 李쎌뿉?쒕쭔.
 * ?곗뼱蹂??ы쉷 諛섍꼍(李⑹? 吏?먭낵 ??以묒떖 嫄곕━ ??諛섍꼍?대㈃ ?깃났). ?쏀븳 ?곗뼱?쇱닔濡??됰꼮.
 */
export const CAPTURE = {
  orbDuration: 0.75, // ?ъ쿃 ?숉븯 ?쒓컙(珥? ???덉륫 由щ뱶媛 ?꾩슂???댁쑀
  arcHeight: 5,      // ?щЪ??理쒓퀬 ?믪씠
  cooldown: 5,       // 移대뱶 ?ъ궗??荑⑤떎??珥? ???쒖궗 諛⑹?
  bossStun: 3,       // 蹂댁뒪/誘몃땲蹂댁뒪 HP0 ???ы쉷 媛??湲곗젅 李?珥?
  duplicateXp: 70,
  duplicateBond: 0.04,
} as const;

export const CAPTURE_RADIUS: Record<EnemyTier, number> = {
  swarm: 1.7, flyer: 1.35, normal: 1.5, tank: 1.2, healer: 1.45, elite: 1.15, miniboss: 0.95, boss: 0.9,
};

/** ?ы쉷???곸쓣 ?뚮젅?댁뼱釉붾줈 ?????ㅽ꺈 ?섏궛 諛곗쑉 (???꾧컧 ?ㅽ꺈 ???꾧뎔 ?좊떅 ?ㅼ???. */
export const ENEMY_PLAY = { hpMult: 1.5, atkMult: 1.3 } as const;
/** ?ы쉷 enemy 2??吏꾪솕 ?덈꺼 (???쇱씤留?. ?⑤룆/蹂댁뒪泥대뒗 臾댁쭊?? */
export const ENEMY_EVOLVE_LEVEL = 5;

// ?? 罹먮┃???ш린 ?뺢퇋???????????????????????????????
/** ?뚮젅?댁뼱釉??좊떅(?щ━泥샕룻룷?띿껜) ?뺢퇋???믪씠 ??吏꾪솕?좎닔濡??뚰룺 而ㅼ쭊?? */
export const UNIT_HEIGHT = { base: 2.0, perStage: 0.26 } as const;
export function unitHeight(stage: number): number {
  return UNIT_HEIGHT.base + (Math.max(1, stage) - 1) * UNIT_HEIGHT.perStage;
}
/** ?꾨뱶 ???뺢퇋???믪씠 (?곗뼱蹂???蹂댁뒪/誘몃땲蹂댁뒪???쇰????ш쾶). */
export const ENEMY_HEIGHT: Record<EnemyTier, number> = {
  swarm: 1.6, flyer: 1.8, normal: 2.0, healer: 2.0, tank: 2.4, elite: 2.8, miniboss: 4.2, boss: 6.2,
};
/** ?ы쉷??蹂댁뒪/誘몃땲蹂댁뒪泥대뒗 ?꾧뎔?쇰줈 ?⑤룄 ?ш쾶 (?꾩븬媛??좎?). */
export const CAPTURED_BOSS_SCALE = 1.5;

