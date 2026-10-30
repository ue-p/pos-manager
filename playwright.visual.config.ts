import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// 見た目の比較（D-31）。styles.css を Tailwind に置き換えるとき、置き換えの前後で画面がピクセル単位で同じかを確かめる。
//   1. 置き換えの前に基準を撮る：VISUAL_UPDATE=1 npm run test:visual（visual-baseline/ に保存。git には入れない）
//   2. 置き換えた後に比べる：npm run test:visual
const sharedEmail = /function sharedEmail\(\)\s*\{\s*return '([^']+)'/.exec(readFileSync('firestore.rules', 'utf8'))![1];

export default defineConfig({
  testDir: 'tests/visual',
  timeout: 300_000,
  workers: 1,
  updateSnapshots: process.env.VISUAL_UPDATE === '1' ? 'all' : 'none',
  snapshotPathTemplate: 'visual-baseline/{testFilePath}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixels: 0, animations: 'disabled', caret: 'hide' } },
  use: {
    baseURL: 'http://localhost:5174',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 860 },
    trace: 'retain-on-failure',
  },
  webServer: {
    // 開発中のサーバー（5173）とぶつからないよう別のポートで起動する
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_USE_EMULATOR: 'true', VITE_SHARED_ACCOUNT_EMAIL: sharedEmail, E2E: '1', APP_VERSION: 'visual' },
  },
});
