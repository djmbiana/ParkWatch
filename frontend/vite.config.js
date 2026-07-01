import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Both the dev server and the preview server:
//  - host: true         → bind 0.0.0.0 so the LAN / a tunnel can reach it
//  - allowedHosts: true → accept any Host header (needed so a Cloudflare tunnel
//                         domain like *.trycloudflare.com isn't rejected)
//  - proxy /api         → forward API calls to the backend so the whole app is
//                         served from ONE origin (no CORS, works through a tunnel)
const shared = {
  host: true,
  allowedHosts: true,
  proxy: {
    '/api': 'http://localhost:3000',
  },
}

export default defineConfig({
  plugins: [react()],
  server: shared,
  preview: shared,
})
