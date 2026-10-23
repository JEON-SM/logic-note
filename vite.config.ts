import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 앱 본체(시작 화면 + 편집기)에 필요한 JS만 미리 캐시한다.
// 도식 가져오기용 Mermaid/Graphviz 조각은 처음 쓸 때 받아서 그때부터 캐시한다.
const shell = new Set<string>()
const appShell = (): Plugin => ({
  name: 'ln-app-shell',
  apply: 'build',
  generateBundle(_, bundle) {
    const chunks = Object.values(bundle).flatMap((c) => (c.type === 'chunk' ? [c] : []))
    const byFile = new Map(chunks.map((c) => [c.fileName, c]))
    const visit = (f: string) => {
      if (shell.has(f)) return
      shell.add(f)
      byFile.get(f)?.imports.forEach(visit)
    }
    for (const c of chunks) if (c.isEntry || /\/src\/editor\/Editor\.tsx$/.test(c.facadeModuleId ?? '') || c.name.includes('workbox')) visit(c.fileName)
  },
})

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [
    react(),
    appShell(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'Logic Note',
        short_name: 'Logic Note',
        description: '도형과 선으로 생각을 잇는 노트',
        lang: 'ko',
        display: 'standalone',
        theme_color: '#F7F7F5',
        background_color: '#F7F7F5',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        maximumFileSizeToCacheInBytes: 4_000_000,
        manifestTransforms: [async (entries) => ({ manifest: entries.filter((e) => !e.url.endsWith('.js') || e.url === 'sw.js' || shell.has(e.url)), warnings: [] })],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.woff2') || url.hostname.startsWith('fonts.g'),
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 400 } },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/[^/]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'lazy-chunks', expiration: { maxEntries: 200 } },
          },
        ],
      },
    }),
  ],
})
