const { defineConfig } = require('vite')
const react = require('@vitejs/plugin-react')

module.exports = defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  // Electron renderer 환경에서 Node.js 모듈 제외
  base: './',
  server: {
    port: 5173,
    strictPort: true,  // 포트 충돌 시 다른 포트로 넘어가지 않고 에러 발생
  },
})
