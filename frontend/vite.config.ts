import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 仅用于手动 `npm run dev`（前端热更新）；日常开发请用 `python start.py` 访问 8000
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
