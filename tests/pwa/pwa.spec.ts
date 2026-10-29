// Service Worker（D-28）：オフラインで再読み込みしても開ける／新しい版で［更新］が出る／緊急時の版で外れる
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { PWA_ENV } from '../../playwright.pwa.config';

test.describe.configure({ mode: 'serial' });

/** 配っているビルド（dist-e2e）を作り直す。vite preview はそのまま新しいファイルを配る */
function rebuild(extraEnv: Record<string, string>) {
  execSync('npx vite build --mode e2e --outDir dist-e2e --emptyOutDir', {
    env: { ...process.env, ...PWA_ENV, ...extraEnv },
    stdio: 'ignore',
  });
}

/** Service Worker が有効になり、このページを制御するまで待つ（初回はいったん読み込み直す） */
async function waitControlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  }
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('パスワード').fill('password123');
  await page.getByRole('button', { name: /開発用アカウントを作成/ }).click();
  await expect(page.getByRole('button', { name: '会計確定' })).toBeVisible();
}

const checkUpdate = (page: Page) =>
  page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));

// テストごとに Emulator のデータとアカウントを消す（開発用アカウントを毎回作るため）
test.beforeEach(async ({ request }) => {
  await request.delete('http://127.0.0.1:8080/emulator/v1/projects/demo-gakusai-pos/databases/(default)/documents');
  await request.delete('http://127.0.0.1:9099/emulator/v1/projects/demo-gakusai-pos/accounts');
});

let ctx: BrowserContext;
test.afterEach(async () => {
  await ctx?.close();
});

test('オフラインで再読み込み・開き直しをしても開ける', async ({ browser }) => {
  ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);
  await waitControlled(page);

  await ctx.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: '会計確定' })).toBeVisible();
  await expect(page.locator('.pill', { hasText: 'オフライン' })).toBeVisible();

  // 新しいタブで開き直しても開ける（お客さん用画面も）
  const page2 = await ctx.newPage();
  await page2.goto('/');
  await expect(page2.getByRole('button', { name: '会計確定' })).toBeVisible();
  const display = await ctx.newPage();
  await display.goto('/display?reg=reg_1');
  await expect(display.locator('.display')).toBeVisible();
});

test('お客さん用画面をオンラインで一度も開いていなくても、オフラインで開ける（?reg= と &theme=dark）', async ({ browser }) => {
  ctx = await browser.newContext();
  const page = await ctx.newPage();
  // オンラインではログイン画面だけを開く（お客さん用画面は開かない）
  await page.goto('/login');
  await waitControlled(page);
  await ctx.setOffline(true);

  const display = await ctx.newPage();
  await display.goto('/display?reg=reg_1');
  await expect(display.getByText('レジからの表示を待っています（reg_1）')).toBeVisible();

  const dark = await ctx.newPage();
  await dark.goto('/display?reg=reg_1&theme=dark');
  await expect(dark.getByText('レジからの表示を待っています（reg_1）')).toBeVisible();
  await expect(dark.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('新しい版が届くと［更新］が出る。会計の途中は押せず、押すと新しい版になる', async ({ browser }) => {
  ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);
  await waitControlled(page);
  await page.getByRole('link', { name: '設定・出力' }).click();
  await expect(page.getByTestId('app-version')).toHaveText('e2e-v1');
  await page.getByRole('link', { name: 'レジ' }).click();

  // 会計の途中（カートに商品）で新しい版が届く
  await page.locator('.item-btn', { hasText: '案1' }).click();
  rebuild({ APP_VERSION: 'e2e-v2' });
  await checkUpdate(page);
  await expect(page.locator('.pill--update')).toContainText('新しい版があります', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: '会計のあとで更新' })).toBeDisabled();
  // まだ切り替わっていない（会計の途中では自動で切り替えない）
  await expect(page.locator('.item-btn', { hasText: '案1' }).locator('.item-count')).toHaveText('1');

  // 会計が終わる（カートを空にする）と［更新］を押せる → 新しい版になる
  await page.getByRole('button', { name: '全部クリア' }).click();
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await page.waitForLoadState('load');
  await page.getByRole('link', { name: '設定・出力' }).click();
  await expect(page.getByTestId('app-version')).toHaveText('e2e-v2', { timeout: 30_000 });
  await expect(page.locator('.pill--update')).toHaveCount(0);
});

test('緊急時の版（Service Worker を外す版）を配ると、端末から Service Worker が外れる', async ({ browser }) => {
  ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await waitControlled(page);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))).toBe(1);

  rebuild({ APP_VERSION: 'e2e-nosw', PWA_SELF_DESTROY: '1' });
  await checkUpdate(page);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)), { timeout: 30_000 })
    .toBe(0);
  // 保存していた画面も消える
  await expect.poll(() => page.evaluate(() => caches.keys().then((k) => k.length)), { timeout: 30_000 }).toBe(0);
  // 普通に開ける（サーバーから読み込む）
  await page.goto('/login');
  await expect(page.getByLabel('パスワード')).toBeVisible();
});
