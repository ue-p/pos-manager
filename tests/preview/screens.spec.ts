// デザイン案のスクリーンショット（npx playwright test -c playwright.preview.config.ts を Emulator 上で実行）
// 表示モード light/dark × スタッフ入力画面・お客さん用画面（待機・会計中）× PC幅・スマホ幅
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.PREVIEW_DIR ?? 'design-preview';
mkdirSync(OUT, { recursive: true });
const PC = { width: 1280, height: 860 };
const PHONE = { width: 390, height: 844 };
const FS = 'http://127.0.0.1:8080/v1/projects/demo-gakusai-pos/databases/(default)/documents';

const tap = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first().click();
const imagesLoaded = (page: Page) =>
  page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
const int = (n: number) => ({ integerValue: String(n) });
const map = (o: Record<string, number>) => ({ mapValue: { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, int(v)])) } });

test('表示モードのスクリーンショット', async ({ browser, request }) => {
  test.setTimeout(240_000);
  await request.delete(`${FS.replace('/v1/', '/emulator/v1/')}`);
  await request.delete('http://127.0.0.1:9099/emulator/v1/projects/demo-gakusai-pos/accounts');
  // 案3を少なめにして「残りわずか」の表示も見えるようにする
  await request.patch(`${FS}/settings/current`, {
    headers: { Authorization: 'Bearer owner' },
    data: {
      fields: {
        prices: map({ design_1: 200, design_2: 200, design_3: 200, set: 500 }),
        initial_stock: map({ design_1: 100, design_2: 100, design_3: 12 }),
        target_amount: int(40750),
        low_stock_threshold: int(10),
        float_amount: int(0),
        test_mode: { booleanValue: false },
      },
    },
  });

  const ctx = await browser.newContext({ viewport: PC });
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel('パスワード').fill('password123');
  await page.getByRole('button', { name: /開発用アカウントを作成/ }).click();
  await expect(page.getByRole('button', { name: '会計確定' })).toBeVisible();

  // 売上と在庫の変化が見えるよう、先に2件会計しておく
  for (const items of [['セット', '案3'], ['案2']]) {
    for (const i of items) await page.locator('.item-btn', { hasText: i }).click();
    await tap(page, '大人');
    await tap(page, '1人');
    await tap(page, 'ちょうど');
    await tap(page, '会計確定');
    await expect(page.locator('.done-change')).toBeVisible();
    await page.waitForTimeout(700);
    await tap(page, '次の会計へ');
  }

  for (const palette of ['light', 'dark']) {
    await page.setViewportSize(PC);
    await page.goto(`/?theme=${palette}`);
    await expect(page.getByRole('button', { name: '会計確定' })).toBeVisible();

    // お客さん用画面（同じブラウザ。待機中）
    const display = await ctx.newPage();
    await display.setViewportSize({ width: 1280, height: 720 });
    await display.goto(`/display?reg=reg_1&theme=${palette}`);
    await expect(display.locator('.display-idle')).toBeVisible();
    await imagesLoaded(display);
    await display.screenshot({ path: path.join(OUT, `${palette}-display-idle-pc.png`) });
    await display.setViewportSize(PHONE);
    await display.screenshot({ path: path.join(OUT, `${palette}-display-idle-phone.png`), fullPage: true });

    // 会計中：案1×2・セット×1、学生・2人、1,000円預かり
    await page.locator('.item-btn', { hasText: '案1' }).click();
    await page.locator('.item-btn', { hasText: '案1' }).click();
    await page.locator('.item-btn', { hasText: 'セット' }).click();
    await tap(page, '学生');
    await tap(page, '2人');
    await tap(page, '1,000');
    await imagesLoaded(page);
    await page.screenshot({ path: path.join(OUT, `${palette}-register-pc.png`), fullPage: true });
    await page.setViewportSize(PHONE);
    // スマホは実際に見える1画面分（合計と確定ボタンは画面下に固定表示される）と、下までスクロールした状態
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT, `${palette}-register-phone.png`) });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.screenshot({ path: path.join(OUT, `${palette}-register-phone-bottom.png`) });

    await expect(display.locator('.display-cart')).toBeVisible();
    await imagesLoaded(display);
    await display.screenshot({ path: path.join(OUT, `${palette}-display-cart-phone.png`), fullPage: true });
    await display.setViewportSize({ width: 1280, height: 720 });
    await display.screenshot({ path: path.join(OUT, `${palette}-display-cart-pc.png`) });
    await display.close();

    await page.getByRole('button', { name: '全部クリア' }).click();

    // ダッシュボードと設定画面（色の変更が及ぶので確認用）
    await page.setViewportSize(PC);
    await page.getByRole('link', { name: 'ダッシュボード' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `${palette}-dashboard-pc.png`), fullPage: true });
    await page.getByRole('link', { name: '設定・出力' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${palette}-settings-pc.png`) });
    await page.getByRole('link', { name: 'レジ' }).click();
  }
});
