# GLB 모델 넣는 곳

이 폴더에 아래 네이밍대로 GLB 파일을 **넣기만 하면** 폴백 대신 모델이 자동 렌더됩니다.
(화이트리스트 등록 불필요 — 파일이 없으면 조용히 폴백 유지. 넣은 뒤 새로고침하면 적용.)

- 텍스처는 **로드 시 자동으로 최대 1024px로 축소**됩니다 (`MODEL_MAX_TEXTURE`). 원본 GLB는 그대로 두어도 됩니다.
- 파일명 규칙 (ASSETS.md §0):
  - 유닛: `mon_{element}_{stage}.glb` — 예: `mon_water_1.glb`, `mon_fire_3.glb` (15종 완비)
  - 주인공: `hero.glb`
  - 적(예비): `enemy_slime.glb`, `enemy_imp.glb`, `enemy_shellguard.glb`, `enemy_bat.glb`, `enemy_spirit.glb`, `enemy_golem.glb`
  - 보스(예비): `boss_final.glb` (일월식의 키메라)
- 모델은 +Z 정면, 발바닥 y=0 권장. 스케일은 코드에서 자동 정규화됩니다.
- **카툰 렌더 자동 적용**: 로드 시 머티리얼이 unlit(MeshBasic, 조명 영향 없는 평면 카툰 룩)로
  변환되고 검은 외곽선(inverted hull)이 자동으로 추가됩니다.
  - 끄기/두께 조절: `src/data/constants.ts`의 `MODEL_UNLIT`, `MODEL_OUTLINE`, `MODEL_OUTLINE_THICKNESS`.
  - 외곽선 두께는 뷰 공간 기준이라 모델 크기가 달라도 일정하게 보입니다.

> 참고: 게임의 **모든 3D 오브젝트**(폴백 도형, 격자 타일, 투사체, 기지 등)가 unlit 카툰
> 셰이딩으로 통일되어 있어 모델을 넣어도 룩이 일관됩니다. 격자는 타일 옆면 음영으로 구분됩니다.
