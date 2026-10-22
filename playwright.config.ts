import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// 開発用アカウントのメールアドレスを firestore.rules の sharedEmail() にそろえる（.env.local が無くても E2E が通るように）
const sharedEmail = /function sharedEmail\(\)\s*\{\s*return '([^']+)'/.exec(readFileSync('firestore.rules', 'utf8'))![1];

// npm run test:e2e（Emulator を起動してから開発サーバー相手に実行する）
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 860 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
    // Emulator に接続させる（.env.local の設定より優先される）。E2E=1 で HMR を止める（vite.config.ts）
    env: { VITE_USE_EMULATOR: 'true', VITE_SHARED_ACCOUNT_EMAIL: sharedEmail, E2E: '1' },
  },
});
