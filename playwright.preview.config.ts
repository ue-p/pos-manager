import base from './playwright.config';
import { defineConfig } from '@playwright/test';

// デザイン案のスクリーンショット用（通常の E2E とは別に実行する）
// firebase emulators:exec --only auth,firestore --project demo-gakusai-pos "npx playwright test -c playwright.preview.config.ts"
export default defineConfig({ ...base, testDir: 'tests/preview' });
