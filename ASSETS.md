# ASSETS.md — 에셋 목록 & 제작 가이드 v2

> 2D 컨셉/UI: **Sora** → 3D 변환: **Meshy.ai** (image-to-3D 권장) → GLB
> 파이프라인: Sora로 캐릭터 컨셉 이미지 생성 → 검수 → Meshy image-to-3D → 리토폴로지 → GLB 임포트
> 마감 3일 → P0/P1/P2 우선순위 엄수. **P0 없이는 게임이 안 굴러가고, P2는 없어도 된다.**

---

## 0. 공통 제작 규칙

### 이미지 생성 공통 조건 (3D 변환 최적화)

- 단일 캐릭터, 전신, **3/4 정면뷰**, 깨끗한 단색(흰) 배경
- 명확한 실루엣, 둥글고 단순한 큰 형태, 얇은 장식 최소화
- 카툰 3D 피규어(토이) 스타일
- **불꽃/물결/빛/그림자 오라는 모델에 넣지 말 것** → 게임 내 이펙트(Three.js 파티클/셰이더)로 분리.
  단, 불여우 꼬리처럼 정체성인 요소는 "고체 장식 형태"로 모델에 포함.

### 공통 프롬프트 템플릿 (모든 캐릭터에 접두)

```
cute stylized 3D game creature concept art, chibi proportions, simple rounded
shapes, toy-like character, full body, three-quarter front view, clean white
background, clear silhouette, designed for a top-down tower defense game,
suitable for image-to-3D modeling, no complex background, no text, no extra characters
```

### 3D 기술 스펙 (Meshy)

- GLB(텍스처 임베드), 개체당 8k tri 이하, 텍스처 1024² 이하 1장
- +Z 정면, 발바닥 y=0. 애니메이션 없음 (연출은 코드로)
- **탑뷰 가독성 체크**: 위에서 봤을 때 실루엣이 구분되는가? (거북=등껍질, 사슴=뿔, 여우=꼬리, 정령=후광)

### 파일 네이밍

```
/assets/models/mon_{element}_{stage}.glb    예: mon_water_1.glb, mon_dark_3.glb
/assets/models/enemy_{name}.glb / hero.glb / boss_final.glb / prop_{name}.glb
/assets/ui/{category}_{name}.png            예: ui_panel_wood.png, card_fireball.png
/assets/textures/bg_{theme}.png
```

---

## 1. 캐릭터 3D 모델 (Sora → Meshy)

### P0 — 1단 진화 5종 + 필수 (9개)

| 파일 | 캐릭터 | 프롬프트 핵심 (공통 템플릿 + 아래) |
|---|---|---|
| hero.glb | 주인공 | cute adventurer kid with small backpack holding a teal-gold capture orb |
| mon_water_1.glb | 방울북 | small baby water turtle, round water-drop shell with wave mark, pale teal body, water-drop cheek marks, short stubby legs |
| mon_grass_1.glb | 새싹록 | baby deer with small green sprout antlers, cream body, leaf scarf, big eyes, chubby short legs |
| mon_fire_1.glb | 불꼬미 | small baby fox, orange body, cream belly, single candle-like solid flame on tail tip, big ears, playful |
| mon_dark_1.glb | 루나비 | small round navy ghost spirit, big yellow eyes, crescent moon mark on forehead, tiny star pattern inside body, short shadow arms |
| mon_light_1.glb | 별비 | small round starlight spirit, ivory pale-yellow body, tiny halo, glowing core in chest, soft warm face |
| enemy_slime.glb | 슬라임 | simple green slime blob, cute but wild |
| enemy_golem.glb | 골렘 | small mossy rock golem, stubby limbs |
| prop_core.glb | 기지 | cartoon crystal shrine on wooden-stone pedestal, glowing gem |

### P1 — 2·3단 진화 (불/물/풀 우선) + 적 (10개)

| 파일 | 프롬프트 핵심 |
|---|---|
| mon_water_2 | coral shell turtle, teal body, mint-blue shell with coral and seashell decorations, wider flipper-like front legs, confident |
| mon_water_3 | majestic ocean guardian turtle, deep teal, navy shield-like shell with big wave pattern, coral-shell armor, small wave crown, calm reliable face |
| mon_grass_2 | forest deer, branch-shaped antlers with leaf buds and flower buds, vine decorations, gentle confident |
| mon_grass_3 | majestic forest guardian deer, large tree antlers with leaves flowers and fruits, leaf cape, bark-armor pattern, dignified |
| mon_fire_2 | sleek flame fox, two solid-flame tails, flame-scarf fur around neck, red-yellow accents, confident eyes |
| mon_fire_3 | majestic guardian flame fox, 3-5 large fan-spread solid flame tails, flame-motif armor accents, orange-red-gold, calm sharp eyes |
| enemy_imp | small fire imp, fast-looking |
| enemy_shellguard | clam-shell soldier, high-defense look |
| enemy_bat | small dark bat, navy-purple |
| boss_final | large chimera split in half: golden holy side and dark navy eclipse side, sun and crescent motifs, imposing but stylized cute-cool |

### P1.5 — 빛/어둠 2·3단 (여유 시 P1 직후)

| 파일 | 프롬프트 핵심 |
|---|---|
| mon_dark_2 | moon witch spirit, semi-humanoid upper body, simple mask-like face, crescent ornament, ghost-dress lower body, night-sky cloak with blue stars, navy-blue-yellow palette |
| mon_dark_3 | noble lunar eclipse spirit, humanoid upper body with ghost-dress silhouette, large crescent/eclipse halo behind head, constellation patterns, eclipse emblem on chest, yellow eyes, cold noble elegance |
| mon_light_2 | young light cleric spirit, small robe silhouette, halo above head, star-sun core on chest, glowing sleeves, white-gold-skyblue |
| mon_light_3 | majestic high priest spirit, humanoid upper body, glowing robe, large golden halo, holy wing-like light silhouette (solid shapes), sun core on chest, warm dignified |

> 진화 라인 팁: 1단 렌더 이미지를 Meshy image-to-3D 입력으로 재활용하거나, 프롬프트에 "evolved larger form of (전 단계 설명), same color palette, same face motif" 추가로 실루엣 연속성 유지.

### P2

- enemy_spirit(빛 정령), 도구 소품 5종(조가비/씨앗/부적/월식 조각/성배)

### 폴백 규칙 (변함없음, 중요)

모델 미완성 = 속성 색 캡슐(물=청록, 풀=초록, 불=주황, 어둠=남색, 빛=아이보리) + 머리 위 속성 아이콘. **에셋이 게임 완성을 막지 않는다.**

---

## 2. VFX 분리 원칙 (Three.js)

원 기획안의 "Unity VFX 분리"를 Three.js로 대체:

| 표현 | 구현 |
|---|---|
| 불꽃/화상 | 가산합성(AdditiveBlending) 스프라이트 파티클 + 이미시브 틴트 |
| 물결/넉백 파도 | 링 지오메트리 스케일 애니메이션 + 반투명 셰이더 |
| 덩굴/풀 장판 | 바닥 데칼(투명 PlaneGeometry) + 흔들리는 스프라이트 |
| 저주 표식 | 적 머리 위 회전하는 초승달 스프라이트, 중첩 수 표시 |
| 축복/후광 | 이미시브 링 + 부드러운 글로우 스프라이트 |
| 협동기 배너 | DOM 오버레이 (두루마리 펼침 CSS 애니메이션) |

파티클 텍스처 5장(스파크/물방울/잎/별/연기): Sora로 뽑되 실패 시 코드 도형으로 대체 (P2).

---

## 3. UI — 판타지 우드톤 스타일 가이드 ★

### 3.1 컨셉

**"모험가 길드의 오래된 나무 테이블".** 다크 월넛 목재 프레임, 양피지 콘텐츠 영역, 금장 트림, 가죽 디테일. 게임 화면(밝고 채도 높은 카툰)과 대비되는 차분한 프레임 역할.

### 3.2 팔레트 (CSS 변수로 코드에 반영)

| 변수 | HEX | 용도 |
|---|---|---|
| --wood-dark | #3E2A1B | 패널 외곽, 최하단 바 |
| --wood-mid | #5C4028 | 패널 본체, 버튼 |
| --wood-light | #8A6642 | 하이라이트, 버튼 hover |
| --parchment | #EFE3C2 | 카드 바탕, 텍스트 영역 |
| --parchment-dark | #D9C79E | 카드 음영, 구분선 |
| --gold | #D8A93B | 트림, 테두리, 강조 |
| --gold-bright | #F2CE6B | 선택/포커스 |
| --leather | #7A4A2B | 스트랩, 탭 |
| --ink | #3B2C1E | 본문 텍스트 (양피지 위) |
| --mana-crystal | #4FA8D8 | 마나 게이지 |
| --hp-ruby | #C0392B | HP |

속성 포인트 컬러: 불 #E8632C / 물 #3FA9BF / 풀 #6FAE4C / 빛 #F2CE6B / 어둠 #4A4E9E

### 3.3 컴포넌트 규칙

| 컴포넌트 | 스타일 |
|---|---|
| 카드 | 양피지 바탕 + 속성색 얇은 내부 테두리 + 금장 코너 장식. 상단 일러스트, 하단 잉크색 텍스트, 좌상단 마나 크리스털 코스트 |
| 카드 패(하단) | 목재 선반 텍스처 바 위 부채꼴 배열, hover 시 카드 상승 + 금테 발광 |
| HP/마나 | 금테 프레임 안 루비 하트 / 크리스털 게이지 |
| 버튼 | 목재 판 + 금장 모서리, hover 시 --wood-light |
| 팝업/이벤트 창 | 양피지 두루마리가 세로로 펼쳐지는 연출 (CSS transform) |
| 협동기 배너 | 가로 두루마리 + 두 속성 아이콘 충돌 이펙트 + 협동기명 |
| 몬스터 뷰어 배경 | 어두운 목재 진열장 + 은은한 스포트라이트 |
| 폰트 | 한글: 판타지 감성 라운드 세리프 계열(무료 웹폰트, 예: 마루 부리) + 숫자 강조는 세리프 |

### 3.4 Sora UI 에셋 목록

**P0 (12개)**
- ui_panel_wood.png — 다크 월넛 목재 패널 (9-slice 가능하게 균일 테두리)
- ui_shelf_wood.png — 하단 카드 선반 바
- card_frame_{element}.png ×5 — 양피지+금장+속성색 카드 프레임 (중앙 비움)
- icon_{element}.png ×5 — 속성 아이콘 (불꽃/물방울/잎/태양별/초승달), 굵은 외곽선, 투명 배경

프롬프트 예:
```
fantasy game UI wooden panel, dark walnut wood texture frame with ornate gold
trim corners, parchment inner area, hand-crafted adventurer guild style,
clean symmetrical border for 9-slice, no text, game asset
```

**P1**
- 카드 일러스트 23장 (DESIGN.md §6 카드 목록)
- ui_capture_orb.png (청록+금 — 포켓볼 색 회피)
- ui_heart_gold.png / ui_mana_crystal.png / ui_gold_coin.png
- bg_grassland / bg_forest / bg_cave / bg_volcano / bg_temple (탑뷰 맵 텍스처 5종)
- 이벤트 삽화 4장 (상인/온천/알/제단 — 양피지 그림체)
- 타이틀 로고 (나무 간판 + 금장 문자)

**P2**
- 몬스터 포트레이트 15장 (뷰어/카드용), 승리/패배 화면, 갈림길 맵(양피지 지도 스타일)

---

## 4. 사운드 (P2)

무료 라이선스 효과음 6개만: 타격 / 포획 성공 / 카드 사용 / 협동기 발동 / 레벨업·진화 / 승리.

---

## 5. 3일 제작 스케줄

| 날짜 | 작업 |
|---|---|
| 7/3 (금) | Sora: P0 캐릭터 컨셉 9종 + UI P0 12종 → Meshy P0 발주. 코드는 폴백으로 병행 |
| 7/4 (토) | P0 GLB 검수/임포트. Sora: 2·3단 진화(불/물/풀) + 적 → Meshy P1 발주. 카드 일러스트 |
| 7/5 (일) | 보스 + 빛/어둠 진화(P1.5), 맵 배경 5종, 남는 시간 P2 |
| 7/6 (월) 오전 | **신규 발주 금지.** 임포트/폴리싱/탑뷰 가독성 최종 점검 |

## 6. 임포트 체크리스트

- [ ] GLTFLoader 무에러 로드 / 텍스처 임베드
- [ ] 스케일 정규화 (코드에서 통일)
- [ ] **탑뷰 실루엣 구분** (등껍질/뿔/꼬리/후광이 위에서 보이는가)
- [ ] 진화 라인 색 팔레트 연속성
- [ ] 파일명 규칙 일치
