import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Service Worker の E2E（D-28）。開発サーバーには Service Worker が無いので、
// 本番と同じ形のビルド（mode=e2e：Emulator に接続する）を vite preview で配る。npm run test:e2e から実行される
const sharedEmail = /function sharedEmail\(\)\s*\{\s*return '([^']+)'/.exec(readFileSync('firestore.rules', 'utf8'))![1];
export const PWA_ENV = { VITE_USE_EMULATOR: 'true', VITE_SHARED_ACCOUNT_EMAIL: sharedEmail };

export default defineConfig({
  testDir: 'tests/pwa',
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 860 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'npx vite build --mode e2e --outDir dist-e2e --emptyOutDir && npx vite preview --mode e2e --outDir dist-e2e --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...PWA_ENV, APP_VERSION: 'e2e-v1' },
  },
});
