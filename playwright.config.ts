import { defineConfig, devices } from '@playwright/test';

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
  },
});
