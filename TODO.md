# TODO — 남은 폴리싱 (다음 세션 핸드오프)

> 이 파일은 장기 폴리싱 루프의 인수인계 문서입니다. 게임은 `DESIGN.md`/`CLAUDE.md`(v4, 포획형 몬스터 테이머 TD)를 정본으로 합니다.
> 각 항목: 무엇을 · 어디를(파일) · 어떻게. 작업 후 `tsc --noEmit` + `vite build` + preview 스크린샷으로 검증하고 커밋하세요.
> 빌드/실행: `npm run dev`(개발), `npm run build`. Node PATH는 `C:\Program Files\nodejs`.
> **주의(불사 설계):** 아군 유닛은 의도적으로 죽지 않는 방어 포탑임(순수 DPS 레이스). 유닛 사망/피격 재도입은 사용자 확인 필수. `Monster.atkCd`는 유닛 발사 간격이라 유효.

## 남은 작업 (우선순위)

### A. [모험 지도] 특수 노드를 지도 위에 직접 렌더 — ✅ 완료
- 구현: 트랙 = [스테이지1, 특수, 스테이지2, 특수, …] 인터리브(스테이지 10 + 갭 9 = 19 노드).
  갭별 특수 종류는 런 시작 시 1회 생성(`GameState.gapSpecials`, save 영속), 진행은 `stageIndex`+`specialPending`로 표현.
  스테이지 클리어 → 지도의 그 갭 특수 노드가 '현재'로 반짝임 → 클릭 시 상점/사건/야영을 그 자리에서 해결 → 다음 스테이지 개방.
  구 '다음 길' 모달(`showNodeChoice`/`chooseNode`) 제거, `UI.showStageMap`이 혼합 트랙 렌더(`smap-special` 스타일), `Game.enterSpecialNode`/`onSpecialEnter`.
- 위치: `src/ui/UI.ts`(showStageMap), `src/core/Game.ts`(openStageMap/enterSpecialNode/ensureMapTrack), `GameState.ts`(gapSpecials/specialPending)+`save.ts`.

### B. [도구(held item) 시스템] 확장 (이번 세션 최소 구현 완료)
- 완료: `src/data/items.ts` 5종, `OwnedUnit.item`, deriveStats 합산, 상점 '도구' 섹션 구매→장착 대상 선택, 뷰어 표시, roster 저장으로 영속.
- 남음: 아이템 등급/희귀도, 보스 처치 시 도구 드랍, 유닛당 슬롯 2개 이상, 해제/판매(환불), 도구 아이콘 아트(현재 이모지), 카드 관리 화면에서도 장착 관리.

### C. [경제 밸런스] 새 골드 소모처 vs 수입 튜닝 (풀 플레이 검증 필요)
- 이번 세션에서 소모처 대폭 추가(상점 강화 6종 + 도구 5종 + 사건). 수입은 처치 골드(3/30/100)+사건.
- rAF 스로틀로 이번엔 풀런 실측을 못 함 → **다음 세션 첫 작업으로 실제 1→10 플레이스루** 하며 골드 곡선/가격 균형, 도구 파워 확인.
- 위치: `Game.SHOP_ITEMS`(가격), `items.ts`(도구 효과/가격), `Battle`(처치 골드), `stages.csv`/`Game.applyEvent`(사건).

### D. [갈림길 정리] 웨이브 중간 무료 강화 — ✅ 제거 완료
- 마지막 웨이브 직전 무료 5스탯 3택1(`showMidBonus`/`showBonus`/`onBonusPick`) 및 `bonus` 페이즈 제거.
  강화는 이제 상점(유료)·특수노드로 일원화. `showBuffChoice`/`onBuffPick` 死코드도 제거됨.
- (참고) `stages.ts`의 `BUFF_NODES` 데이터는 남아있으나 현재 미사용(추후 재활용 여지로 존치).

### E. [맵 완성도] 선택 다듬기
- 완료: 스테이지 10개 고유 팔레트(`Scene.STAGE_VISUAL`), 경로 레이아웃 10종, 테마 배경색, 장식이 배치 슬롯 위에 안 생김.
- 남음(선택): 안개, 경로 타일 텍스처 변주, 테마별 accent 장식(설산 눈·화산 용암 등), 신규 경로 5종의 난이도 실측.

## 최근 세션 완료 (포획 UX · UI 아이콘 · 공성)
- **포획/영입 개선**: 원정대 만석 시 편입/놓아주기 2단계 모달(적·야생 크리처 공통, 인원 상관없이 교체 편입) `showCaptureFull`; 포획 즉시 필드 배치 `Battle.deployCaptured`(여러 마리 영입 스킵 버그 해소).
- **야생 크리처 희귀화**: 미보유 속성만·1웨이브에 1마리·전부 보유 시 미등장(`Battle.beginWave`).
- **전투 종료 → 스테이지 선택 지도**(`backToStageMap`, 로비는 지도 '← 원정대'로). 
- **아이콘-수치 일괄 UI**: 로비 상단(🪙/👥/📖)·상점 보유골드·전투 HUD 칩·스테이지 클리어 골드. `.stat` 칩.
- **예외 알림 통일**: `UI.warn`(에러음+붉은 토스트) + `warn` 이벤트 — 골드 부족·빈 원정대·배치 상한 등.
- **거북이(물 크리처) 축소**: `CREATURE_DISPLAY_SCALE.water=0.6`.
- **공성(SIEGE)**: 일반 적이 성문 도달 시 소멸 대신 정지해 자기 attack으로 주기 타격(`Enemy.atBase`/`Battle.siegeStrike`, 피해숫자·사운드·공격모션·넉백 해제까지). 보스/미니보스는 기존 루프백 유지.
- **정리**: `showBuffChoice`/`onBuffPick` 死코드 제거.

## 이번 세션(이어서) 완료된 것 (참고)
- **적대적 검증 2라운드**: 저장 유실(스탯 보너스), 전투 중 흡수-진화 대기열 방치, ESC 소프트락, 포획-교체 안전, 포획체 밸런스 상향, 상점 후 로비 골드 갱신, setBaseHp 매틱 할당 — 모두 수정.
- **불사 유닛 확정 + 죽은코드 제거**(ENEMY/atkCd/takeDamage). 텍스트 자연어화(monsters.csv 역할·글러브·도트), 가독성(진화 모달 등).
- **노드식 모험 지도**(현재 스테이지만 진입), **스테이지 10개 고유 정체성**(팔레트+경로+장식).
- **상설 상점 제거 → 스테이지 사이 특수노드(상점/사건/야영)**, **캐릭터 도구 시스템**, **stages.csv 개명**, **줄바꿈 keep-all**, **배치 슬롯 장식 제외**.

## 이전 대규모 세션에서 완료된 것 (참고)
- 스탯 5종 + 레벨/진화 성장 + 치명타 연출, 웨이브 보너스, 속성 컨셉(물/어둠/풀/빛/불), 도감 3D, 진화 연출, 타이틀/로비 UI, 야생 크리처 적, 효과음/설정.

## 작업 규칙
- 코드가 정본. 문서와 코드가 어긋나면 코드에 맞춰 문서 갱신.
- 매직넘버는 `src/data/constants.ts`, 카드는 `skills.csv`, 캐릭터는 `monsters.csv`, 스테이지 표시는 `stages.csv`, 도구는 `items.ts`.
- 협동기/분기진화/타락체 보스는 명시 요청 전 신규 도입 금지(v3 잔재). 유닛 불사 설계 변경도 사용자 확인 필수.
