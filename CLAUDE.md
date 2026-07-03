# CLAUDE.md — 프로젝트 컨텍스트 v3

> 이 파일은 Claude Code가 프로젝트 전반의 맥락을 이해하기 위한 문서입니다.
> 게임 기획은 `DESIGN.md`, 에셋 목록/UI 스타일 가이드는 `ASSETS.md`를 참조하세요.

## 프로젝트 개요

- **게임명(가칭)**: Monster Keepers
- **장르**: 탑뷰 디펜스 × 덱빌딩 로그라이크 × 몬스터 드래프트/육성 (버린 2종이 보스로 회귀)
- **아트**: 카툰풍 귀여운 몬스터(오리지널 디자인) + **판타지 우드톤 UI**
- **마감**: 2026-07-06 (일) 15:00 — **총 3일. MVP 우선.**

## 기술 스택

| 항목 | 선택 | 비고 |
|---|---|---|
| 엔진 | Three.js (WebGL) | 탑뷰 고정 카메라 + 몬스터 뷰어 OrbitControls |
| 언어 | TypeScript (strict) | |
| 번들러 | Vite | `npm run dev` / `npm run build` |
| 상태 | 순수 TS 클래스 + 이벤트 버스 | 외부 상태 라이브러리 금지 |
| 3D | Meshy.ai → GLB | 8k tri 이하, ASSETS.md 스펙 |
| 2D | Sora → PNG/WebP | UI, 카드, 배경 |
| 저장 | localStorage | 런 스냅샷 1개 |

## 디렉터리 구조

```
/src
  /core        # 게임 루프, 씬 관리, 이벤트 버스, 저장
  /systems     # 전투, 웨이브, 드래프트, 카드/덱, 레벨업/분기진화, 상성, ★표식/협동기, 가지않은길(보스)
  /entities    # Monster, Enemy, Boss(타락체), Projectile, GroundZone(장판)
  /data        # 몬스터/카드/웨이브/스테이지/협동기/드래프트/분기진화 정의 (선언적 데이터)
  /render      # Three.js 씬, 카메라, 라이팅, VFX, 몬스터 뷰어 (팔레트 스왑 유틸)
  /ui          # DOM 오버레이 (카드 패, HP바, 이벤트 창, 협동기 배너, 드래프트 화면)
/assets/{models,textures,ui,audio}
```

## 핵심 아키텍처 원칙

1. **데이터 주도**: 스탯/카드/웨이브/협동기는 전부 `/src/data` 선언적 데이터. 밸런싱은 데이터만 수정.
2. **UI는 DOM 오버레이**: Three.js 안에 UI 그리지 않는다. HTML/CSS + 아래 우드톤 CSS 변수.
3. **로직/렌더 분리**: 고정 timestep 로직 틱, rAF 렌더.
4. **폴백 우선**: 모델 없으면 속성 색 캡슐 + 아이콘. 에셋 없이 완전 플레이 가능해야 함.
5. **★표식(Mark) 시스템이 협동기의 단일 기반**:
   - 모든 속성 효과는 `MarkComponent`(화상/젖음/풀장판/저주/축복)를 남긴다.
   - 협동기 = `data/synergies.ts`에 `{trigger: 표식조건, reaction: 속성공격, effect, consumesTrigger, minStage}` 로 선언.
   - `SynergySystem` 하나가 모든 조합을 판정. 조합별 하드코딩 금지.
   - 동일 협동기 내부 쿨다운 2초.
6. **이펙트는 저렴하게**: 가산합성 스프라이트 파티클, 링 스케일, 데칼. 포스트프로세싱 금지.

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

- Element 타입: `'fire' | 'water' | 'grass' | 'light' | 'dark'` 고정.
- Mark 타입: `'burn' | 'wet' | 'overgrowth' | 'curse' | 'bless'` 고정.
- 매직 넘버 금지 → `/src/data/constants.ts`.
- 커밋: `feat:` `fix:` `balance:` `asset:` `ui:`.

## MVP 범위 (마감 내 필수)

- [ ] 탑뷰 맵 + 경로 웨이브 + 기지 HP (기지 파괴 = 런 종료, 주인공 없음)
- [ ] 캐릭터 드래프트 (스테이지 1·2·3 3택1, 중복 없음, 총 3마리 확정)
- [ ] 유닛 고정 슬롯 배치 (**상한 3 고정**), 5속성 1단 진화
- [ ] 유닛 레벨업 → 카드 해금, 진화(불/물/풀 Lv3/6, 빛/어둠 Lv5/9) + **Lv6/9 분기(팔레트 스왑)**
- [ ] 덱 20장 (무색 5 + 몬스터당 5×3, 자동 조립), 스테이지 시작 랜덤 5장, 마나 소모
- [ ] 표식 시스템 + **협동기 3종** (들불 / 무성한 성장 / 일월식) + 반응 도감
- [ ] 상성 배율
- [ ] 스테이지 10개, 3/6/9 난이도 점프
- [ ] **가지 않은 길: 버린 2종 → 9 중간보스 / 10 최종보스(2페이즈) 타락체** (팔레트 스왑 + 스킬 재활용)
- [ ] 갈림길 (전투/버프/이벤트 노드)
- [ ] 우드톤 UI (패널/카드/게이지/협동기 배너/드래프트 화면)
- [ ] 몬스터 3D 뷰어 (OrbitControls)

## 확장 범위 (시간 남으면)

빛/어둠 2·3단 모델(로직은 MVP 포함, 모델만 폴백), 협동기 +7종, 손으로 짜는 덱빌딩, 연쇄 반응 콤보, 스테이지 9 미드보스 회귀 고도화, 도구 시스템, 사운드, 파티클 고도화.

## 실행 커맨드

```bash
npm install && npm run dev   # 개발
npm run build                # 배포 (dist/)
```

## Claude Code에게 지시사항

- 기능 구현 전 `DESIGN.md` 해당 섹션의 수치/규칙을 데이터 파일로 옮길 것.
- 협동기는 반드시 SynergySystem + 선언 데이터로. 조합별 if문 금지.
- 완벽한 구조보다 **동작하는 수직 슬라이스** 우선. 스테이지 1~2가 완전히 도는 것이 최우선.
- 에셋 없으면 폴백 + `// TODO(asset: 파일명)` 주석.
- 빛/어둠은 대기만성 곡선(진화 Lv5/9, 초반 스탯 ×0.8)을 데이터에 반영할 것.
- 캐릭터 획득은 포획이 아니라 **드래프트**(스테이지 1·2·3, 중복 없음). **주인공 없음.**
- **타락체 보스(가지 않은 길)** = 버린 2종의 팔레트 스왑 + 시그니처 스킬 재활용. 새 모델 만들지 말 것.
- **분기 진화**도 팔레트 스왑(모델 clone + `material.color`/`emissive` 오버라이드). 색이 곧 빌드.
