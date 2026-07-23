import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Both the dev server and the preview server:
//  - host: true         → bind 0.0.0.0 so the LAN / a tunnel can reach it
//  - allowedHosts: true → accept any Host header (needed so a Cloudflare tunnel
//                         domain like *.trycloudflare.com isn't rejected)
//  - proxy /api         → forward API calls to the backend so the whole app is
//                         served from ONE origin (no CORS, works through a tunnel)
//
// The proxy target defaults to a local backend. Set VITE_PROXY_TARGET in
// .env.local (gitignored) to develop against the deployed Cloud Run backend
// without running MySQL locally — the browser only ever sees same-origin
// requests, so the deployed CORS allowlist never has to know about localhost.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'http://localhost:3000'

  const shared = {
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target,
        changeOrigin: true,   // rewrite the Host header, or Cloud Run 404s
        secure: true,
      },
    },
  }

  return {
    plugins: [react()],
    server: shared,
    preview: shared,
  }
})