# 몬스터 포트레이트(PNG) 넣는 곳

이 폴더에 PNG를 넣으면 몬스터 뷰어(로스터 목록 · 정보 패널)에 자동으로 표시됩니다.
등록 코드 수정 불필요 — 파일이 있으면 사용, 없으면 이모지 폴백.

- 파일명 규칙: `mon_{element}_{stage}.png`
  - element: `fire` | `water` | `grass` | `light` | `dark`
  - stage: `1` | `2` | `3` (진화 단계)
  - 예: `mon_fire_1.png`, `mon_water_3.png`, `mon_dark_2.png` (총 15장)
- **크기·여백·배경 신경 쓰지 않아도 됩니다.** 로드 시 코드가 자동 처리합니다:
  - **흰 배경 자동 누끼**: 가장자리에서 흰색과 연결된 배경만 투명 처리(캐릭터 내부 흰색은 보존),
    경계는 부드럽게 페더링 + 흰 테두리 띠 제거.
  - 그 뒤 내용 영역을 자동 크롭 → 256×256 정사각형에 중앙 정렬.
  - 투명 배경 PNG를 넣어도 그대로 동작(누끼 단계는 자동 생략).
  - 설정: `src/data/constants.ts`의 `PORTRAIT_SIZE`, `PORTRAIT_PADDING`,
    누끼 민감도 `PORTRAIT_KEY_LOW`(배경 판정)·`PORTRAIT_KEY_HIGH`(캐릭터 보존).

깔끔한 단색 흰 배경일수록 누끼가 잘 됩니다. 캐릭터 외곽에 옅은 회색 그림자가 있으면
`PORTRAIT_KEY_HIGH` 를 조금 키우세요.
