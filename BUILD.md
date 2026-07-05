# 빌드 / 실행 가이드

## 개발 실행
```bash
npm install
npm run dev      # Vite 개발 서버 (http://localhost:5173)
```

## 웹 빌드
```bash
npm run build    # tsc 체크 + vite build → dist/
```
`dist/`는 정적 파일입니다. **로컬 서버로 열어야 3D 모델(GLB)이 로드**됩니다:
```bash
npm run preview        # 또는  npx serve dist
```
> ⚠️ `dist/index.html`을 브라우저에서 그냥 더블클릭(file://)하면 브라우저 보안 정책상
> GLB 모델 fetch가 막혀 **폴백 도형**으로만 보입니다(게임은 플레이 가능). 풀 퀄리티는 아래 exe 권장.

## 데스크톱 앱(.exe) — 제출용 (풀 퀄리티, 오프라인, 더블클릭 실행)
Electron으로 브라우저를 내장해 `file://`에서도 모델이 정상 로드됩니다(`webSecurity:false`).

### A. 바로 실행 (개발 중)
```bash
npm run build
npm run electron       # 데스크톱 창으로 실행
```

### B. 배포용 exe 폴더 만들기
```bash
npm run exe            # vite build + electron-builder --dir → release/win-unpacked/MonsterKeepers.exe
```
> 일부 환경(안티바이러스/샌드박스)에서 electron-builder가 파일 잠금(EBUSY/EPERM)으로 실패할 수 있습니다.
> 그럴 땐 아래 수동 조립을 쓰세요(이미 받은 electron 런타임을 복사).

### C. 수동 조립 (electron-builder 실패 시)
```bash
npm run build
node node_modules/electron/install.js   # electron 바이너리 확보(최초 1회)
rm -rf release && mkdir -p release/MonsterKeepers/resources/app
cp -r node_modules/electron/dist/. release/MonsterKeepers/
mv release/MonsterKeepers/electron.exe release/MonsterKeepers/MonsterKeepers.exe
rm -f release/MonsterKeepers/resources/default_app.asar
cp -r dist electron package.json release/MonsterKeepers/resources/app/
```
→ **`release/MonsterKeepers/MonsterKeepers.exe`** 더블클릭으로 실행. 폴더째 zip하면 제출/배포 가능(약 350MB).

## 구성 파일
- `electron/main.cjs` — Electron 메인(창 생성, dist/index.html 로드, webSecurity:false)
- `package.json` — `main`, `electron`/`exe` 스크립트, `build`(electron-builder) 설정
- `vite.config.ts` — `base:'./'`(상대경로, file:// 호환)
