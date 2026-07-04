import type { Element, ElementOrNeutral } from '../core/types';
import { MONSTERS } from './monsters';

/** 도감/설계용 역할 분류 (스탯 프리셋 & 베스티어리 라벨) */
export type EnemyTier =
  | 'swarm'    // 다수·약함·빠름
  | 'normal'   // 표준
  | 'tank'     // 느리고 단단
  | 'elite'    // 강한 정예
  | 'flyer'    // 비행(지상 장판 무시)
  | 'healer'   // 아군 회복
  | 'miniboss'
  | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  element: ElementOrNeutral;
  hp: number;
  speed: number; // 월드/초
  attack: number; // 기지 도달 시가 아니라, 근처 유닛/주인공 반격용
  /** 비행: 지상 장판(풀/화염/감속) 무시 (박쥐 등) */
  flying?: boolean;
  /** 주변 적 회복 (정령 등) */
  healer?: boolean;
  leak: 'normal' | 'miniboss' | 'boss';
  radius: number;
  /** public/assets/models/enemies/ 안의 GLTF 파일명. 없으면 속성 색 폴백 도형. */
  model?: string;
  /** 도감 분류 라벨 */
  tier: EnemyTier;
  /** 도감 설명 (한줄 플레이버) */
  desc: string;
  /** 포획 후 진화 대상 species id (쌍 라인). 없으면 무진화(단독/보스 개체). */
  evolvesTo?: string;
  /** 야생 크리처 적: 플레이어 크리처 모델(makeCreature)로 렌더. 값 = 진화 단계. */
  creatureStage?: 1 | 2 | 3;
}

/**
 * 적 도감(Bestiary) — 40종. public/assets/models/enemies/ 의 GLTF 40개에 1:1 매핑.
 * 스탯은 tier 프리셋 기준으로 플레이버에 맞춰 조정. 밸런싱은 이 파일만 수정.
 * 스테이지 난이도 스케일(hpScale·difficultyJump)은 WaveSystem/Battle에서 별도 적용.
 */
export const ENEMIES: Record<string, EnemyDef> = {
  // ── 초원 / 풀 ──────────────────────────────────────────────
  slime: { id: 'slime', name: '슬라임', element: 'grass', hp: 30, speed: 1.5, attack: 4, leak: 'normal', radius: 0.7, model: 'Blob/GreenBlob.gltf', tier: 'swarm', desc: '초원 어디에나 있는 말랑한 젤리. 약하지만 떼로 몰려온다.', evolvesTo: 'spikeblob' },
  spikeblob: { id: 'spikeblob', name: '가시젤리', element: 'grass', hp: 48, speed: 1.3, attack: 7, leak: 'normal', radius: 0.72, model: 'Blob/GreenSpikyBlob.gltf', tier: 'normal', desc: '가시가 돋은 젤리. 함부로 건드리면 따갑다.' },
  pinkling: { id: 'pinkling', name: '핑크젤리', element: 'light', hp: 24, speed: 2.5, attack: 3, leak: 'normal', radius: 0.6, model: 'Blob/PinkBlob.gltf', tier: 'swarm', desc: '통통 튀는 분홍 젤리. 겉보기와 달리 빠르다.' },
  bunbun: { id: 'bunbun', name: '폭탄토끼', element: 'light', hp: 20, speed: 2.8, attack: 4, leak: 'normal', radius: 0.58, model: 'Big/Bunny.gltf', tier: 'swarm', desc: '깡총깡총 돌진하는 성난 토끼. 순식간에 코앞까지 온다.' },
  cluck: { id: 'cluck', name: '성난닭', element: 'light', hp: 26, speed: 2.3, attack: 4, leak: 'normal', radius: 0.6, model: 'Blob/Chicken.gltf', tier: 'swarm', desc: '무리 지어 달리는 사나운 들닭. 수가 곧 위협이다.' },
  hopper: { id: 'hopper', name: '늪개구리', element: 'water', hp: 46, speed: 1.5, attack: 6, leak: 'normal', radius: 0.72, model: 'Big/Frog.gltf', tier: 'normal', desc: '축축한 혓바닥으로 후려치는 개구리. 물웅덩이를 좋아한다.' },
  cactoro: { id: 'cactoro', name: '선인장로', element: 'grass', hp: 95, speed: 1.0, attack: 8, leak: 'normal', radius: 0.86, model: 'Big/Cactoro.gltf', tier: 'tank', desc: '메마른 대지의 파수꾼. 두꺼운 껍질이 방패가 된다.' },
  alpaca: { id: 'alpaca', name: '알파카', element: 'grass', hp: 50, speed: 1.4, attack: 6, leak: 'normal', radius: 0.78, model: 'Flying/Alpaking.gltf', tier: 'normal', desc: '순해 보이지만 침을 뱉으며 돌격하는 초원의 짐승.', evolvesTo: 'alpaking' },
  alpaking: { id: 'alpaking', name: '알파카 대장', element: 'grass', hp: 150, speed: 1.2, attack: 10, leak: 'normal', radius: 0.98, model: 'Flying/Alpaking_Evolved.gltf', tier: 'elite', desc: '무리를 이끄는 거대 알파카. 뿔갑주를 두른 정예.' },
  mushling: { id: 'mushling', name: '버섯동자', element: 'grass', hp: 26, speed: 2.2, attack: 3, leak: 'normal', radius: 0.6, model: 'Blob/Mushnub.gltf', tier: 'swarm', desc: '포자를 흩뿌리며 종종거리는 아기버섯.', evolvesTo: 'mushlord' },
  mushlord: { id: 'mushlord', name: '버섯무사', element: 'grass', hp: 55, speed: 1.4, attack: 7, leak: 'normal', radius: 0.76, model: 'Blob/Mushnub_Evolved.gltf', tier: 'normal', desc: '갓을 투구처럼 쓴 버섯 전사. 포자의 힘을 다룬다.' },
  monkroose: { id: 'monkroose', name: '뿔원숭이', element: 'grass', hp: 52, speed: 1.7, attack: 7, leak: 'normal', radius: 0.75, model: 'Big/Monkroose.gltf', tier: 'normal', desc: '나뭇가지 뿔을 휘두르는 숲의 말썽꾸러기.' },

  // ── 숲 / 비행 ──────────────────────────────────────────────
  spirit: { id: 'spirit', name: '정령', element: 'light', hp: 44, speed: 1.4, attack: 3, healer: true, leak: 'normal', radius: 0.7, model: 'Flying/Ghost.gltf', tier: 'healer', desc: '주변 아군을 치유하는 빛의 정령. 먼저 처치해야 한다.' },
  cat: { id: 'cat', name: '요묘', element: 'light', hp: 46, speed: 1.8, attack: 6, leak: 'normal', radius: 0.7, model: 'Blob/Cat.gltf', tier: 'normal', desc: '신전을 지키는 신비한 고양이. 날렵하게 파고든다.' },
  pigeon: { id: 'pigeon', name: '전서구', element: 'light', hp: 30, speed: 2.3, attack: 4, flying: true, leak: 'normal', radius: 0.62, model: 'Flying/Pigeon.gltf', tier: 'flyer', desc: '하늘을 가르는 전령새. 지상 함정을 가볍게 넘는다.' },
  beebee: { id: 'beebee', name: '침벌', element: 'light', hp: 28, speed: 2.4, attack: 5, flying: true, leak: 'normal', radius: 0.6, model: 'Flying/Armabee.gltf', tier: 'flyer', desc: '윙윙거리며 달려드는 벌. 침 한 방이 제법 따갑다.', evolvesTo: 'queenbee' },
  queenbee: { id: 'queenbee', name: '여왕벌', element: 'light', hp: 70, speed: 2.0, attack: 8, flying: true, leak: 'normal', radius: 0.72, model: 'Flying/Armabee_Evolved.gltf', tier: 'flyer', desc: '벌떼를 거느린 여왕. 화려한 갑각으로 무장했다.' },

  // ── 동굴 / 어둠 ────────────────────────────────────────────
  bat: { id: 'bat', name: '박쥐', element: 'dark', hp: 18, speed: 2.2, attack: 4, flying: true, leak: 'normal', radius: 0.6, model: 'Blob/Birb.gltf', tier: 'flyer', desc: '동굴의 어둠을 나는 흡혈 박쥐. 무리로 시야를 덮는다.' },
  hywirl: { id: 'hywirl', name: '회오리귀', element: 'dark', hp: 34, speed: 2.5, attack: 5, flying: true, leak: 'normal', radius: 0.64, model: 'Flying/Hywirl.gltf', tier: 'flyer', desc: '빙글빙글 회전하며 떠다니는 바람의 악령.' },
  wraith: { id: 'wraith', name: '해골유령', element: 'dark', hp: 48, speed: 1.3, attack: 4, healer: true, leak: 'normal', radius: 0.72, model: 'Flying/Ghost_Skull.gltf', tier: 'healer', desc: '죽은 자를 되살리는 어둠의 망령. 아군을 치유한다.' },
  goleling: { id: 'goleling', name: '꼬마골렘', element: 'grass', hp: 80, speed: 1.1, attack: 7, leak: 'normal', radius: 0.82, model: 'Flying/Goleling.gltf', tier: 'tank', desc: '바위로 빚어진 작은 골렘. 단단하고 우직하다.', evolvesTo: 'golem' },
  fishman: { id: 'fishman', name: '심해어', element: 'water', hp: 60, speed: 1.3, attack: 7, leak: 'normal', radius: 0.78, model: 'Blob/Fish.gltf', tier: 'normal', desc: '지하 호수에서 올라온 물고기 인간. 미끄럽고 질기다.' },
  squidle: { id: 'squidle', name: '먹물오징어', element: 'water', hp: 92, speed: 1.05, attack: 8, leak: 'normal', radius: 0.84, model: 'Flying/Squidle.gltf', tier: 'tank', desc: '먹물을 뿜으며 촉수를 휘두르는 심해의 파수꾼.' },
  glub: { id: 'glub', name: '글러브', element: 'water', hp: 26, speed: 2.2, attack: 3, leak: 'normal', radius: 0.6, model: 'Flying/Glub.gltf', tier: 'swarm', desc: '물방울처럼 통통 튀는 작은 물의 정령.', evolvesTo: 'glubking' },
  glubking: { id: 'glubking', name: '글러브 장로', element: 'water', hp: 150, speed: 1.1, attack: 10, leak: 'normal', radius: 0.96, model: 'Flying/Glub_Evolved.gltf', tier: 'elite', desc: '수백 년을 산 물의 원로. 파도를 부린다.' },
  dog: { id: 'dog', name: '들개', element: 'dark', hp: 22, speed: 2.7, attack: 4, leak: 'normal', radius: 0.58, model: 'Blob/Dog.gltf', tier: 'swarm', desc: '무리를 이뤄 달려드는 사나운 들개.' },

  // ── 화산 / 불 ──────────────────────────────────────────────
  imp: { id: 'imp', name: '임프', element: 'fire', hp: 24, speed: 2.6, attack: 5, leak: 'normal', radius: 0.6, model: 'Flying/Demon.gltf', tier: 'swarm', desc: '불티를 튀기며 달려드는 작은 악마. 재빠르다.' },
  bluefiend: { id: 'bluefiend', name: '푸른마귀', element: 'fire', hp: 55, speed: 1.6, attack: 8, leak: 'normal', radius: 0.76, model: 'Big/BlueDemon.gltf', tier: 'normal', desc: '푸른 불꽃을 두른 마귀. 뜨거운 화염보다 매섭다.' },
  drake: { id: 'drake', name: '새끼용', element: 'fire', hp: 150, speed: 1.2, attack: 11, leak: 'normal', radius: 0.98, model: 'Flying/Dragon.gltf', tier: 'elite', desc: '갓 태어난 화룡. 이미 불길을 내뿜을 줄 안다.' },
  orc: { id: 'orc', name: '오크 전사', element: 'fire', hp: 100, speed: 1.1, attack: 9, leak: 'normal', radius: 0.86, model: 'Big/Orc.gltf', tier: 'tank', desc: '화산 부족의 전사. 두꺼운 근육이 방어구를 대신한다.' },
  dino: { id: 'dino', name: '사나운 공룡', element: 'fire', hp: 160, speed: 1.3, attack: 12, leak: 'normal', radius: 1.0, model: 'Big/Dino.gltf', tier: 'elite', desc: '용암지대를 배회하는 포악한 공룡. 돌진이 무섭다.' },

  // ── 신전 / 무속성·정예 ─────────────────────────────────────
  orcskull: { id: 'orcskull', name: '해골오크', element: 'dark', hp: 105, speed: 1.0, attack: 10, leak: 'normal', radius: 0.88, model: 'Big/Orc_Skull.gltf', tier: 'tank', desc: '죽어서도 싸우는 언데드 오크. 고통을 모른다.' },
  ninja: { id: 'ninja', name: '그림자닌자', element: 'dark', hp: 120, speed: 1.9, attack: 12, leak: 'normal', radius: 0.8, model: 'Big/Ninja.gltf', tier: 'elite', desc: '어둠 속을 질주하는 암살자. 빠르고 치명적이다.' },
  tribal: { id: 'tribal', name: '부족전사', element: 'fire', hp: 58, speed: 1.5, attack: 7, leak: 'normal', radius: 0.76, model: 'Big/Tribal.gltf', tier: 'normal', desc: '신전을 수호하는 고대 부족의 전사.' },
  wizard: { id: 'wizard', name: '방랑마법사', element: 'light', hp: 52, speed: 1.3, attack: 4, healer: true, leak: 'normal', radius: 0.74, model: 'Blob/Wizard.gltf', tier: 'healer', desc: '수상한 지팡이로 아군을 보호하는 떠돌이 술사.' },
  alien: { id: 'alien', name: '외계생명체', element: 'dark', hp: 170, speed: 1.2, attack: 12, leak: 'normal', radius: 0.98, model: 'Big/Alien.gltf', tier: 'elite', desc: '별에서 떨어진 미지의 생명체. 상식이 통하지 않는다.' },

  // ── 미니보스 ───────────────────────────────────────────────
  golem: { id: 'golem', name: '골렘', element: 'grass', hp: 400, speed: 0.8, attack: 12, leak: 'miniboss', radius: 1.4, model: 'Flying/Goleling_Evolved.gltf', tier: 'miniboss', desc: '거대한 고대 병기. 느리지만 압도적인 맷집을 지녔다.' },
  yeti: { id: 'yeti', name: '설산 예티', element: 'water', hp: 380, speed: 0.85, attack: 13, leak: 'miniboss', radius: 1.35, model: 'Big/Yeti.gltf', tier: 'miniboss', desc: '설산의 주인. 얼어붙은 주먹으로 모든 것을 부순다.' },
  mushking: { id: 'mushking', name: '버섯왕', element: 'grass', hp: 440, speed: 0.8, attack: 14, leak: 'miniboss', radius: 1.45, model: 'Big/MushroomKing.gltf', tier: 'miniboss', desc: '숲을 삼킨 거대 버섯의 왕. 포자 폭풍을 일으킨다.' },

  // ── 스테이지 보스 (무진화 단독 개체 — 포획은 HP 0 → 3초 기절 창에서만) ──
  warlord: { id: 'warlord', name: '해골 군주', element: 'dark', hp: 520, speed: 0.85, attack: 15, leak: 'miniboss', radius: 1.5, model: 'Big/Orc_Skull.gltf', tier: 'miniboss', desc: '신전을 지배하는 언데드 군주. 죽음도 그를 멈추지 못한다.' },
  tyrant: { id: 'tyrant', name: '폭룡 티라노', element: 'fire', hp: 1200, speed: 0.7, attack: 22, leak: 'boss', radius: 2.0, model: 'Big/Dino.gltf', tier: 'boss', desc: '용암 지대 최상위 포식자. 대지를 뒤흔드는 최종 시련.' },
  // (타락체 시스템 제거 — 모든 보스는 enemy 단독 개체)
};

/** 야생 크리처 적 id (속성·단계). 웨이브 삽입/스폰 참조용. */
export const creatureEnemyId = (el: Element, stage: 1 | 2 | 3): string => `cre_${el}_${stage}`;

/** 단계별 야생 크리처 스탯 프리셋 (1→2→3 진화형). */
const CRE_TIER: Record<1 | 2 | 3, EnemyTier> = { 1: 'normal', 2: 'elite', 3: 'elite' };
const CRE_STATS: Record<1 | 2 | 3, { hp: number; speed: number; attack: number; radius: number }> = {
  1: { hp: 70, speed: 1.4, attack: 8, radius: 0.8 },
  2: { hp: 170, speed: 1.3, attack: 12, radius: 0.95 },
  3: { hp: 340, speed: 1.15, attack: 16, radius: 1.1 },
};

// 플레이어 크리처 모델(mon_{el}_{stage}.glb)을 재사용한 "야생 개체"를 도감에 등록.
for (const el of ['fire', 'water', 'grass', 'light', 'dark'] as Element[]) {
  for (const stage of [1, 2, 3] as (1 | 2 | 3)[]) {
    const st = CRE_STATS[stage];
    const name = MONSTERS[el].stages[stage - 1].name;
    ENEMIES[creatureEnemyId(el, stage)] = {
      id: creatureEnemyId(el, stage),
      name: `야생 ${name}`,
      element: el,
      hp: st.hp,
      speed: st.speed,
      attack: st.attack,
      leak: 'normal',
      radius: st.radius,
      tier: CRE_TIER[stage],
      desc: `길들지 않은 야생 개체. ${MONSTERS[el].stages[stage - 1].role}`,
      creatureStage: stage,
    };
  }
}
