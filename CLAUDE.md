# CLAUDE.md — 프로젝트 컨텍스트 v4

> 이 파일은 Claude Code가 프로젝트 전반의 맥락을 이해하기 위한 문서입니다.
> 게임 기획은 `DESIGN.md`, 에셋 목록/UI 스타일 가이드는 `ASSETS.md`를 참조하세요.
>
> **⚠️ 문서 정합성 원칙: 코드가 정본이다.** 이 문서는 실제 구현(`/src`)을 서술한다.
> v3 기획(협동기/Lv6·9 분기 진화/가지 않은 길 타락체 보스)은 **구현되지 않았고 채택하지 않는다.**
> 대신 게임은 **드래프트 1회 + 포획 육성**의 몬스터 테이머 디펜스로 확정되었다(DESIGN.md § 설계 변경 이력).

## 프로젝트 개요

- **게임명**: 캐치 수호핑 (영문 빌드 산출물명 `CatchSuhoping`)
- **장르**: 탑뷰 디펜스 × 덱빌딩 × **몬스터 포획/육성(테이머)** 로그라이크
- **한 줄**: 스타터 1마리를 드래프트로 얻고, 적을 **포획**해 원정대(최대 6)를 키우며 성을 지키는 탑뷰 디펜스.
- **아트**: 카툰풍 귀여운 몬스터 + **판타지 우드톤 UI**
- **마감**: 2026-07-06 (일) 15:00 — **MVP 우선.**

## 기술 스택

| 항목 | 선택 | 비고 |
|---|---|---|
| 엔진 | Three.js (WebGL) | 탑뷰 고정 카메라 + 몬스터 뷰어 OrbitControls |
| 언어 | TypeScript (strict) | `npm run build` = `tsc --noEmit && vite build` |
| 번들러 | Vite | `npm run dev` / `npm run build` |
| 상태 | 순수 TS 클래스 + 이벤트 버스(`core/events.ts`) | 외부 상태 라이브러리 금지 |
| 3D | Meshy.ai(크리처) / Quaternius(적) → GLB·GLTF | ASSETS.md 스펙, 8k tri 이하 |
| 2D | Sora → PNG/WebP | UI, 카드, 배경 |
| 데이터 | 카드 = `skills.csv`, 나머지 = TS 선언 데이터 | 밸런싱은 데이터만 수정 |
| 저장 | localStorage | 런 스냅샷 1개 |

## 디렉터리 구조

```
/src
  /core        # Game(앱 컨트롤러), GameState(런 상태), events(버스), save(localStorage), types
  /systems     # Battle(전투 루프), DeckSystem(손패/마나), affinity(상성)
  /entities    # Monster(아군), Enemy(적), Projectile, GroundZone(장판), Marks(표식), CaptureOrb(포획구)
  /data        # monsters, enemies(40종 도감), stages, cards+skills.csv, constants(모든 매직넘버)
  /render      # Scene, MonsterViewer(뷰어), ModelLoader, fallback(폴백 도형), VFX, Portraits
  /ui          # UI.ts (DOM 오버레이 전부), theme.css (우드톤)
/assets(=public/assets)/{models,textures,ui,audio}
```

## 핵심 아키텍처 원칙

1. **데이터 주도**: 카드는 `data/skills.csv`, 스탯/적/웨이브/스테이지는 `/src/data` 선언 데이터. 밸런싱은 데이터만 수정.
2. **UI는 DOM 오버레이**: Three.js 안에 UI를 그리지 않는다. HTML/CSS + 우드톤 CSS 변수(`ui/theme.css`).
3. **로직/렌더 분리**: 고정 timestep(`FIXED_DT = 1/60`) 로직 틱, rAF 렌더. `Game.loop`가 accumulator로 분리.
4. **폴백 우선**: 모델 없으면 속성 색 도형 + 아이콘(`render/fallback.ts`). 에셋 없이 완전 플레이 가능해야 함.
5. **★표식(Mark) 시스템**: 모든 속성 공격은 `Marks`(화상/젖음/덩굴/저주/축복)를 남긴다. 표식은 **단독 도트·디버프**로 작동한다(화상 도트, 젖음 감속, 저주 피증, 축복 버프 등). *표식끼리의 협동 반응(협동기)은 현재 없음* — 도입 시 `systems/`에 단일 판정 시스템으로 넣고 조합별 하드코딩은 금지.
6. **이펙트는 저렴하게**: 가산합성 스프라이트 파티클(`VFX`), 링 스케일, 플로팅 텍스트. 포스트프로세싱 금지.
7. **이벤트 버스로 느슨한 결합**: 전투→UI 통지는 `bus.emit`(mana:change, unit:grown, capture:full, run:win/lose 등). 직접 참조 최소화.

## UI 테마 (우드톤) — CSS 변수

```css
:root {
  --wood-dark:#3E2A1B; --wood-mid:#5C4028; --wood-light:#8A6642;
  --parchment:#EFE3C2; --parchment-dark:#D9C79E;
  --gold:#D8A93B; --gold-bright:#F2CE6B; --leather:#7A4A2B; --ink:#3B2C1E;
  --mana-crystal:#4FA8D8; --hp-ruby:#C0392B;
  --el-fire:#E8632C; --el-water:#3FA9BF; --el-grass:#6FAE4C;
  --el-light:#F2CE6B; --el-dark:#4A4E9E;
}
```

컴포넌트 규칙(카드/버튼/패널/두루마리 팝업)은 ASSETS.md §3.3 준수.

## 코딩 컨벤션

- Element 타입: `'fire' | 'water' | 'grass' | 'light' | 'dark'` 고정. 적/무속성은 `ElementOrNeutral`(+`'neutral'`).
- Mark 타입: `'burn' | 'wet' | 'overgrowth' | 'curse' | 'bless'` 고정.
- 매직 넘버 금지 → `/src/data/constants.ts`.
- 커밋: `feat:` `fix:` `balance:` `asset:` `ui:`.

## 게임 루프 (실제 구현)

```
타이틀 → 로비(허브) → 전투 → 스테이지 클리어(경험치·골드·카드 해금)
       → 성장 연출(진화/카드 획득·교체) → 갈림길(전투/강화/이벤트) → 로비 → …
       → 스테이지 10 최종보스(폭룡) 처치 = 런 승리 / 성 HP 0 = 런 종료
```

- **캐릭터 획득**: 스테이지 1 시작 시 **3택1 드래프트로 스타터 1마리**. 이후 원정대 증원은 **전투 중 포획구(카드)로 적을 포획**해서만 이뤄진다. 원정대 상한 6.
- **육성**: 레벨업 → 카드 해금, 진화(불/물/풀 Lv8·18, 빛/어둠 Lv12·24, 대기만성 ×0.8→3단 점프). 포획 적은 쌍 라인이면 Lv10에 2단 진화. (실제 값은 `monsters.csv`·`ENEMY_EVOLVE_LEVEL`이 정본)
- **덱**: 성(공용 무색) 장착 5장 + 원정대 각 유닛 장착 최대 5장. 전투 시작마다 덱풀에서 랜덤 5장, 마나(최대 8, 초당 회복)로 사용. 포획구 카드는 우선 확보.
- **성(城) = 방어 포탑**: 기지가 사거리 내 적을 자동 공격한다(`HERO` 상수). 별도 "주인공" 유닛은 없다.
- **포획 트레이트**: 포획한 적은 tier별 패시브를 갖는다(swarm 추가타·flyer 추격·tank 넉백/속박·healer 성수리·elite~boss 폭발). `Monster.capturedTier()`.

## MVP 범위 (현재 구현 상태)

- [x] 탑뷰 맵 + 경로 웨이브 + 기지 HP (기지 파괴 = 런 종료)
- [x] 스타터 드래프트 (스테이지 1, 3택1)
- [x] **포획 시스템** (포획구 카드 → 오브 투척 → 반경 판정, 보스는 HP0 기절창에서만) + 포획 도감
- [x] 유닛 고정 슬롯 배치 (상한 6, 필드 드래그 이동/교환), 5속성 3단 진화
- [x] 레벨업 → 카드 해금, 진화 + 각성 시그니처 스킬 학습
- [x] 덱(장착 5장 모델, 자동 조립/편성 화면), 랜덤 5장 드로우, 마나 소모
- [x] 표식 시스템(화상/젖음/덩굴/저주/축복 단독 효과) + 상성 배율
- [x] 스테이지 10개, 3/6/9 난이도 점프, 미니보스(골렘·예티·해골군주)·최종보스(폭룡)
- [x] 갈림길 (전투/강화/이벤트 노드) + 유대(Bond) 성장
- [x] 우드톤 UI (패널/카드/게이지/드래프트·포획·진화·교체 모달)
- [x] 몬스터 3D 뷰어 (OrbitControls, 닉네임 편집)
- [x] 적 도감 40종 (Quaternius GLTF 1:1 매핑) + 폴백 도형

## 확장 범위 (시간 남으면)

- 협동기(표식 반응) 시스템, 반응 도감
- Lv6/9 분기 진화(팔레트 스왑) — 현재 `skills.csv`의 `branch` 열은 데이터만 존재(유닛은 진화 레벨에 A·B 카드를 모두 학습). 분기 선택 UI/로직은 미구현.
- 손으로 짜는 능동적 덱빌딩 고도화, 도구(held item) 시스템, 사운드, 파티클 고도화, 환경 기믹(용암 분출 등).

## 실행 커맨드

```bash
npm install && npm run dev   # 개발 (Vite dev 서버)
npm run build                # 타입체크 + 배포 (dist/)
```

## Claude Code에게 지시사항

- **코드가 정본.** 문서와 코드가 어긋나면 코드를 믿고, 문서를 코드에 맞춰 갱신하라(그 반대가 아님).
- 기능 구현/밸런싱 전, 관련 수치는 반드시 `/src/data/constants.ts` 또는 `skills.csv`에서 확인·수정할 것.
- 완벽한 구조보다 **동작하는 수직 슬라이스** 우선. 스테이지 1~3이 매끄럽게 도는 것이 최우선.
- 에셋 없으면 폴백 + `// TODO(asset: 파일명)` 주석. 폴백만으로 완전 플레이 가능해야 함.
- 빛/어둠은 대기만성 곡선(진화 Lv12/24, 초반 스탯 ×0.8, 3단 ×1.9 점프)을 데이터에 유지.
- **포획이 핵심 루프.** 포획 판정 반경(`CAPTURE_RADIUS`)·기절창(`CAPTURE.bossStun`)·원정대 상한(`MAX_MONSTERS`)은 밸런스 민감. 함부로 바꾸지 말 것.
- 협동기/분기 진화/타락체 보스는 **명시적 요청이 없는 한 새로 넣지 말 것** (v3 잔재). 표식은 단독 효과로만 유지.
