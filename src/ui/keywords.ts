import {
  BURN_DPS_PER_STACK, WET_SLOW, OVERGROWTH_SLOW, CURSE_DMG_PER_STACK, BLESS_BUFF_PER_STACK, MARK,
} from '../data/constants';

/** 카드 설명에서 볼드+툴팁 처리할 키워드 정의. */
export interface KeywordDef {
  /** 설명 텍스트에서 매칭할 표현. */
  term: string;
  icon: string;
  /** 마우스 오버 시 보여줄 짧은 설명. */
  desc: string;
}

// 긴 표현을 먼저 매칭하도록 정렬(예: '덩굴 표식' → '덩굴'). 현재는 겹침 없음.
export const KEYWORDS: KeywordDef[] = [
  { term: '화상', icon: '🔥', desc: `불 표식. 매초 지속 피해(중첩당 ${BURN_DPS_PER_STACK})를 줍니다. 최대 ${MARK.burn.maxStacks}중첩. (불의 시간 화력)` },
  { term: '젖음', icon: '💧', desc: `물 표식. 적의 이동 속도를 ${Math.round(WET_SLOW * 100)}% 늦춥니다. (가벼운 견제)` },
  { term: '덩굴 표식', icon: '🍃', desc: `풀 표식. 적을 강하게 속박합니다 — 이동 속도 ${Math.round(OVERGROWTH_SLOW * 100)}% 감소 + 주기적으로 짧게 옭아맵니다(뿌리). 풀은 하드 CC 담당. (피해가 아니라 발묶기)` },
  { term: '저주', icon: '🌑', desc: `어둠 표식. 대상이 받는 피해를 중첩당 ${Math.round(CURSE_DMG_PER_STACK * 100)}% 늘립니다. 최대 ${MARK.curse.maxStacks}중첩. (피해 증폭)` },
  { term: '축복', icon: '🌟', desc: `빛 표식. 아군의 공격력을 중첩당 ${Math.round(BLESS_BUFF_PER_STACK * 100)}% 높입니다.` },
  { term: '보호막', icon: '🛡️', desc: '피격 시 HP보다 먼저 소모되는 임시 방어막입니다.' },
  { term: '표식 반응', icon: '💥', desc: '서로 다른 속성 표식이 같은 적에게 겹치면 반응이 터집니다. 예) 젖음+화상=증기폭발, 화상+덩굴=들불, 저주+덩굴=얽힘의 저주, 저주+젖음=침식. 여러 속성을 섞어 쓸수록 강력해집니다.' },
];

const KW_BY_TERM = new Map(KEYWORDS.map((k) => [k.term, k]));

// 긴 표현 우선 매칭. 한 번의 replace로 처리해 삽입된 태그 안을 다시 매칭하지 않는다.
const KW_RE = new RegExp(
  '(' + KEYWORDS.map((k) => k.term)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|') + ')',
  'g',
);

/** 키워드 조회 (툴팁 렌더용). */
export function keywordByTerm(term: string): KeywordDef | undefined {
  return KW_BY_TERM.get(term);
}

/**
 * 카드 설명 텍스트의 키워드를 볼드 + 툴팁 트리거(<b class="kw">)로 감싼다.
 * 입력은 신뢰된 데이터 문자열(skills.csv)이라 별도 이스케이프 없이 처리한다.
 */
export function decorateKeywords(text: string): string {
  return text.replace(KW_RE, (m) => `<b class="kw" data-kw="${m}">${m}</b>`);
}
