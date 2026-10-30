/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// アプリの版（設定画面に出す。実機でどの版が動いているか確かめるため）。E2E では APP_VERSION で上書きする
const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // 日本時間
const APP_VERSION =
  process.env.APP_VERSION ??
  `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // D-31：Tailwind CSS（v4）。入口は src/index.css（既存の styles.css もそこから読み込む）
    tailwindcss(),
    // D-28：アプリの画面一式を端末に保存し、オフラインでも再読み込み・開き直しができるようにする。
    // 新しい版は自動では切り替えず、状態バーの［更新］か次に開いたときに切り替える（registerType: 'prompt'）。
    // 緊急時は npm run build:no-sw（mode=nosw）でビルドして公開すると、端末の Service Worker と保存した画面を消す版になる
    // （operations.md）。E2E では PWA_SELF_DESTROY=1 で同じ版を作って確かめる
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      selfDestroying: mode === 'nosw' || process.env.PWA_SELF_DESTROY === '1',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webp}'],
        navigateFallback: '/index.html',
        // Firebase Hosting の予約URL（/__/）は保存した画面で横取りしない
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: { chunkSizeWarningLimit: 1200 }, // Firebase SDK を含むため
  server: {
    // E2E ではオフラインを再現するため、開発サーバーとの接続が切れる。HMR が有効だと復帰時に
    // Vite のクライアントがページを丸ごと再読み込みし、操作の途中でも画面が読み直されてしまうので止める
    hmr: process.env.E2E === '1' ? false : undefined,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
