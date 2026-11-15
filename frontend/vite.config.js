import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// En desarrollo, /api se reenvía al servidor PHP (php -S localhost:8000 -t backend).
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
    },
  },
})
