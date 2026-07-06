// Electron 메인 — 빌드된 dist/index.html을 창에 로드해 데스크톱 앱(.exe)으로 실행.
// webSecurity:false 로 로컬 GLB/PNG 에셋을 file://에서 fetch 가능하게 함(풀 퀄리티).
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#17100a',
    title: '캐치 수호핑',
    // 창/작업표시줄 아이콘 (빌드 후 dist에 복사된 앱 로고). 파일 없으면 Electron 기본 아이콘.
    icon: path.join(__dirname, '..', 'dist', 'assets', 'ui', 'logo.png'),
    autoHideMenuBar: true,
    webPreferences: {
      webSecurity: false,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);

  // 전체화면 토글: F11(켜기/끄기). 전체화면 중 Esc는 게임 조작(모달 닫기)과 겹치지 않게 가로채지 않는다.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
