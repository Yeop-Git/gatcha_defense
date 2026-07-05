# 캐치 수호핑 (MVP)

탑뷰 디펜스 × 덱빌딩 로그라이크 × 몬스터 수집. Three.js + TypeScript + Vite.
기획: [DESIGN.md](DESIGN.md) · 에셋/UI: [ASSETS.md](ASSETS.md) · 아키텍처: [CLAUDE.md](CLAUDE.md)

## 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 타입체크 + 배포 빌드 (dist/)
```

> 3D 모델(GLB)은 아직 없으므로 **속성 색 캡슐 + 아이콘 폴백**으로 완전 플레이 가능합니다.
> GLB를 `public/assets/models/`에 넣고 `src/render/ModelLoader.ts`의 `AVAILABLE_MODELS`에
> 파일명을 추가하면 자동 적용됩니다. **텍스처는 로드 시 자동으로 최대 1024px로 축소**되어 용량을 줄입니다
> (`MODEL_MAX_TEXTURE`). 자세한 내용은 [public/assets/models/README.md](public/assets/models/README.md).

## 덱 / 스킬 (포켓몬식 학습·장착)

- 모든 스킬은 [src/data/skills.csv](src/data/skills.csv)에 정의 (캐릭터×20 = 120개). 편집 시 HMR로 즉시 반영.
- 각 캐릭터는 **레벨1에 3개 학습, 레벨업마다 +2개** 학습(최대 20). 주인공도 동일.
- 덱에는 **학습한 것 중 5개만 장착**. **로비 → 캐릭터 관리**에서 20개 전부 표시(미학습은 🔒 잠금), 그중 5개 선택 — 잊은 스킬도 다시 장착 가능.
- 전투 덱 = 주인공 + 보유 몬스터 각자의 장착 5장(최대 4×5=20장)에서 매 스테이지 5장 드로우.
- 카드 우상단에 **속성 아이콘 배지**(무속성 ⚪ 포함).

## 흐름

타이틀 → **로비**(전투 시작 / 캐릭터 관리 / 내 몬스터) → 전투 → 클리어·보상·갈림길 → 로비 → 다음 전투 …

## 조작

- **주인공은 고정 배치형**(이동 없음, 무속성 공격 + 서포트 스킬 위주). 웨이브 사이 하단 **배치 바**에서 주인공과 몬스터를 슬롯에 배치.
- **총 4캐릭터**: 주인공 + 5속성 중 **최대 3종 포획**.

| 입력 | 동작 |
|---|---|
| 배치 바의 캐릭터 클릭 | 빈 슬롯에 배치 / 다시 클릭 시 회수 (웨이브 사이에만) |
| 자동 | 배치된 주인공·유닛 기본 공격 |
| 하단 카드 클릭 (또는 숫자키 1~9) | 카드 선택. 지점 카드는 이후 지면 클릭으로 시전 |
| F / Space / 포획 버튼 | 가장 가까운 야생 몬스터에게 포획구 투척 (배치된 주인공 위치에서) |
| ▶ 웨이브 시작 | 배치 후 다음 웨이브 개시 |
| 📖 내 몬스터 | 3D 뷰어 (마우스 드래그로 360° 회전/줌) |

맵은 **격자 큐브** 지형이며 경로는 직각으로 꺾입니다.

## 구조 (CLAUDE.md 원칙 준수)

```
src/
  core/      # 이벤트 버스, GameState(런), Game(메타 루프), 저장
  data/      # 선언적 데이터 (몬스터/카드/적/스테이지/협동기/스킬/상수)
  entities/  # Hero, Monster, Enemy, Projectile, GroundZone, Marks
  systems/   # Battle(조율), affinity, Deck, Synergy
  render/    # Scene(탑뷰), fallback(폴백 메시), VFX, MonsterViewer
  ui/        # DOM 오버레이 + 우드톤 theme.css
```

핵심 설계:
- **표식(Mark) 시스템**이 협동기의 단일 기반. `data/synergies.ts` 선언 + `SynergySystem` 하나가 모든 조합 판정 (조합별 하드코딩 없음).
- 로직은 고정 timestep(1/60), 렌더는 rAF 분리.
- UI는 전부 DOM 오버레이 — Three.js 안에 UI를 그리지 않음.

## MVP 구현 범위

탑뷰 맵/경로/기지 HP · 주인공 조작 + 레벨업 3택1 · 웨이브1 포획(HP 비례 확률) · 고정 슬롯 배치 ·
5속성 진화 · 유닛 레벨업 전용 카드 · 카드 패/마나 · 표식 + 협동기(들불/무성한 성장/일월식 +P1 3종) ·
상성 배율 · 스테이지 10개(3/6/9 난이도 점프, 10 보스 2페이즈) · 갈림길(전투/버프/이벤트) · 우드톤 UI · 3D 뷰어.
