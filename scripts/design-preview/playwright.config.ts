import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../../playwright.config';

// デザイン確認用のスクリーンショット（ライト／ダーク × 各画面 × PC幅・スマホ幅）。本番のビルドには含まれない。
// プロジェクト直下で実行する（Emulator を起動して撮影し、design-preview/ に PNG を出す）:
//   npx firebase emulators:exec --only auth,firestore --project demo-gakusai-pos "npx playwright test -c scripts/design-preview/playwright.config.ts"
const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  ...base,
  testDir: '.',
  webServer: base.webServer && !Array.isArray(base.webServer) ? { ...base.webServer, cwd: root } : base.webServer,
});
