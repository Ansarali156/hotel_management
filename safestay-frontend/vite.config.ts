import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' keeps an in-progress form from being swept away by a silent SW
      // takeover; the UI asks before reloading to a new bundle (M24).
      registerType: 'prompt',
      // Disable the PWA in dev — the service worker intercepts /api calls and
      // makes login look broken on the first re-visit. Dev relies on vite proxy.
      devOptions: {
        enabled: false,
        type: 'module',
        navigateFallback: undefined,
      },
      includeAssets: ['checkinnow-icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2}'],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        navigateFallback: 'index.html',
        // CRITICAL: never serve index.html for /api/** — the SW must not
        // hijack login POSTs or any backend call.
        navigateFallbackDenylist: [/^\/@vite/, /^\/node_modules/, /^\/@react-refresh/, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/api\/v1\/(auth|hotel|police)\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\.(png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      },
      manifest: {
        name: 'SafeStay - Hotel & Police Management',
        short_name: 'SafeStay',
        description: 'Professional hotel guest management with real-time police verification and criminal monitoring',
        theme_color: '#1B4332',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        dir: 'ltr',
        lang: 'en',
        scope: '/',
        start_url: '/',
        categories: ['business', 'productivity', 'travel'],
        icons: [
          {
            src: '/checkinnow-icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
        ]
      }
    })
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
