/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
});
