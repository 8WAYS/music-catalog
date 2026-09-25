/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Относительный base: сайт работает и на <login>.github.io/music-catalog/, и на своём домене
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Музыкальная картотека',
        short_name: 'Картотека',
        description: 'Личная картотека любимой музыки',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0f0e0d',
        theme_color: '#0f0e0d',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Редкие подмножества шрифтов не кладём в кэш заранее — они подгружаются по unicode-range
        globIgnores: [
          'probe.html',
          'data/**',
          '**/*-{vietnamese,math,symbols,latin-ext,cyrillic-ext}-*.woff2',
        ],
        navigateFallbackDenylist: [/\/data\//, /probe\.html$/],
        // Обложки зрителя — для офлайна; в адресе версия (?v=updatedAt), поэтому кэш сначала
        runtimeCaching: [
          {
            urlPattern: /\/data\/covers\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'covers',
              expiration: { maxEntries: 1500 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
