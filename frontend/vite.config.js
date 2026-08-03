import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import { existsSync } from 'node:fs'

const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ||
  (existsSync('/.dockerenv') ? 'http://backend:8000' : 'http://localhost:8001')

const devAllowedHosts = (process.env.VITE_DEV_ALLOWED_HOSTS || 'all')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg', 'logo.jpeg', 'logoB.png'],
      manifest: {
        name: 'Restaurant SaaS',
        short_name: 'Restaurant',
        description: 'Commandes, caisse, cuisine et livraisons',
        theme_color: '#078D50',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Menu : réseau d'abord ; cache seulement si vraiment offline.
            // Avant: timeout 8s + TTL 24h → anciens prix réaffichés (ex. 1500 → 1445).
            urlPattern: ({ url }) => url.pathname.startsWith('/api/v1/menu/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'menu-api-cache',
              expiration: { maxEntries: 40, maxAgeSeconds: 120 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/tables/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tables-api-cache',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 12 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5178,
    allowedHosts: devAllowedHosts.includes('all') ? true : devAllowedHosts,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
      },
      "/uploads": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      "/tables": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      "/kitchen": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }
          if (id.includes('react-router-dom') || id.includes('react-router')) {
            return 'router'
          }
          if (id.includes('lucide-react')) {
            return 'icons'
          }
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react'
          }
          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
