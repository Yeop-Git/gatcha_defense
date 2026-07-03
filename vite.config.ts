import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // PORT 환경변수가 있으면 그것을 사용(프리뷰 하네스 autoPort 지원), 없으면 5173.
  server: { port: Number(process.env.PORT) || 5173, open: false },
  build: { target: 'es2020', outDir: 'dist' },
});
