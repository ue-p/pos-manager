// 当日の流れを通しで確認する：ログイン → 会計 → お客さん用画面の同期 → オフライン会計 → 取消 → VR → 集計 → CSV
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SHOTS = process.env.E2E_SHOTS_DIR ?? 'test-results/shots';
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

const tap = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' }).first().click();

// 毎回まっさらな Emulator から始める
test.beforeEach(async ({ request }) => {
  await request.delete('http://127.0.0.1:8080/emulator/v1/projects/demo-gakusai-pos/databases/(default)/documents');
  await request.delete('http://127.0.0.1:9099/emulator/v1/projects/demo-gakusai-pos/accounts');
});

test('学祭当日の一連の操作', async ({ browser }) => {
  const staff = await browser.newContext();
  const page = await staff.newPage();

  // ---- ログイン（Emulator では開発用アカウントを作る）----
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('パスワード').fill('password123');
  await page.getByRole('button', { name: /開発用アカウントを作成/ }).click();
  await expect(page.getByRole('button', { name: '会計確定' })).toBeVisible();

  // ---- お客さん用画面：同じブラウザ（BroadcastChannel）と別端末（Firestore）----
  const sameBrowserDisplay = await staff.newPage();
  await sameBrowserDisplay.goto('/display?reg=reg_1');
  const otherDevice = await browser.newContext();
  const remoteDisplay = await otherDevice.newPage();
  await remoteDisplay.goto('/display?reg=reg_1');

  // ---- 会計1：案1×2 + セット×1 = 900円、1000円預かり ----
  await page.locator('.item-btn', { hasText: '案1' }).click();
  await page.locator('.item-btn', { hasText: '案1' }).click();
  await page.locator('.item-btn', { hasText: 'セット' }).click();
  await expect(page.locator('.summary-total')).toHaveText('¥900');
  await expect(page.getByText('客層を選んでください')).toBeVisible();
  await expect(page.getByRole('button', { name: '会計確定' })).toBeDisabled();
  await expect(sameBrowserDisplay.locator('.display-total')).toContainText('¥900');
  await expect(remoteDisplay.locator('.display-total')).toContainText('¥900', { timeout: 15_000 });

  await tap(page, '学生');
  await tap(page, '2人');
  await tap(page, '500');
  await expect(page.getByText('預かり金が 400 円不足しています')).toBeVisible();
  await tap(page, '500');
  await shot(page, '01-register-before-confirm');
  await tap(page, '会計確定');
  await expect(page.locator('.done-change')).toHaveText('¥100');
  await expect(sameBrowserDisplay.locator('.display-change')).toContainText('¥100');
  await expect(remoteDisplay.locator('.display-change')).toContainText('¥100', { timeout: 15_000 });
  await shot(page, '02-register-done');
  await shot(sameBrowserDisplay, '03-display-done');
  await expect(page.locator('.stock-line')).toContainText('案1 97枚');

  // ---- 会計2：オフラインで入力できること ----
  await staff.setOffline(true);
  await expect(page.locator('.pill', { hasText: 'オフライン' })).toBeVisible();
  await page.locator('.item-btn', { hasText: '案2' }).click();
  await tap(page, '不明');
  await tap(page, '1人');
  await tap(page, 'ちょうど');
  await tap(page, '会計確定');
  await expect(page.locator('.done-change')).toHaveText('¥0');
  await expect(sameBrowserDisplay.locator('.display-change')).toContainText('¥0'); // オフラインでも同じブラウザなら連動
  await expect(page.locator('.pill', { hasText: /未送信 [1-9]件/ })).toBeVisible();
  await shot(page, '04-offline');
  await staff.setOffline(false);
  await expect(page.locator('.pill', { hasText: '未送信 0件' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.pill', { hasText: 'オンライン' })).toBeVisible({ timeout: 30_000 });

  // ---- 直前の取消（会計2を取り消す）----
  await page.getByRole('button', { name: /直前の取消/ }).click();
  await expect(page.locator('.toast')).toContainText('取り消しました');
  await expect(page.locator('.stock-line')).toContainText('案2 99枚');

  // ---- VR体験者 ×2 ----
  await tap(page, '＋1人');
  await tap(page, '＋1人');
  await expect(page.locator('.vr-count')).toContainText('2');

  // ---- ダッシュボード ----
  await page.getByRole('link', { name: 'ダッシュボード' }).click();
  await expect(page.locator('.hero-value')).toHaveText('¥900');
  await expect(page.locator('.tile', { hasText: '購入率' })).toContainText('50.0%');
  await expect(page.getByText('黒字まであと ¥39,850')).toBeVisible();
  await shot(page, '05-dashboard');

  // ---- 設定：施策ログ（カンマ・引用符入り）とCSVエクスポート ----
  await page.getByRole('link', { name: '設定・出力' }).click();
  await page.getByPlaceholder(/自由メモ/).fill('POP変更, "セット推し"');
  await tap(page, '記録');
  await expect(page.locator('.log-list')).toContainText('セット推し');
  const downloadPromise = page.waitForEvent('download');
  await tap(page, 'CSVをダウンロード（ZIP）');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^pos_export_\d{8}_\d{4}\.zip$/);
  const zipPath = path.join(SHOTS, download.suggestedFilename());
  await download.saveAs(zipPath);
  const out = execFileSync('python', ['scripts/check_csv.py', zipPath], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  console.log(out);
  expect(out).toContain('OK');
  expect(out).toContain('売上 900円');
  await expect(page.locator('.pill', { hasText: 'CSV保存' })).not.toHaveClass(/pill--warn/);
  await shot(page, '06-settings');

  // ---- テストモード：帯が出て、会計は集計から除外される ----
  page.once('dialog', (d) => d.accept());
  await tap(page, 'テストモードにする');
  await expect(page.locator('.test-banner')).toBeVisible();
  await page.getByRole('link', { name: 'レジ' }).click();
  await page.locator('.item-btn', { hasText: 'セット' }).click();
  await tap(page, '大人');
  await tap(page, '1人');
  await tap(page, '1,000');
  await tap(page, '会計確定');
  await expect(page.locator('.progress')).toContainText('¥900');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('link', { name: '設定・出力' }).click();
  await tap(page, 'テストモードを終了する');
  await expect(page.locator('.test-banner')).toHaveCount(0);

  // ---- スマホ幅 ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'レジ' }).click();
  await page.locator('.item-btn', { hasText: '案3' }).click();
  await shot(page, '07-phone-register');
  await page.getByRole('link', { name: 'ダッシュボード' }).click();
  await shot(page, '08-phone-dashboard');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);

  await shot(remoteDisplay, '09-remote-display');
  await staff.close();
  await otherDevice.close();
});
