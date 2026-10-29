// シールの表示名（D-29）：設定画面で変えると、レジ画面・お客さん用画面・ダッシュボードに反映される。CSV のコード値は変わらない
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

const LONG = 'ぴょんぴょんうさぎ丸くん'; // 12文字（最大）
const tap = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first().click();

test.beforeEach(async ({ request }) => {
  await request.delete('http://127.0.0.1:8080/emulator/v1/projects/demo-gakusai-pos/databases/(default)/documents');
  await request.delete('http://127.0.0.1:9099/emulator/v1/projects/demo-gakusai-pos/accounts');
});

test('シールの表示名を変えると全画面に反映され、CSV はコード値のまま', async ({ browser }) => {
  const staff = await browser.newContext();
  const page = await staff.newPage();
  await page.goto('/login');
  await page.getByLabel('パスワード').fill('password123');
  await page.getByRole('button', { name: /開発用アカウントを作成/ }).click();
  await expect(page.getByRole('button', { name: '会計確定' })).toBeVisible();

  // 担当者を登録して選ぶ
  await page.getByRole('link', { name: '設定・出力' }).click();
  await page.getByLabel('新しい担当者の名前').fill('うえ');
  await tap(page, '追加');
  await page.getByLabel('担当', { exact: true }).selectOption({ label: 'うえ' });

  // 表示名：確認（13文字・他と同じ名前・「セット」は不可）→ 保存
  const label = (n: number) => page.getByLabel(`案${n}の表示名`);
  await label(1).fill('あ'.repeat(13));
  await expect(page.getByText('12文字以内で入力してください')).toBeVisible();
  await label(1).fill('案2');
  await expect(page.getByText('他の絵柄と同じ名前です')).toBeVisible();
  await label(1).fill('セット');
  await expect(page.getByText('「セット」は使えません')).toBeVisible();
  await label(1).fill(LONG);
  await label(3).fill('スライム');
  await page.locator('section', { hasText: 'シールの表示名' }).getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('シールの表示名を保存しました')).toBeVisible();
  // 価格・在庫の欄の名前も変わる
  await expect(page.locator('section', { hasText: '価格・在庫' })).toContainText(LONG);

  // お客さん用画面（別端末。ログインなし）：待機中の名前とセットの説明
  const other = await browser.newContext();
  const display = await other.newPage();
  await display.goto('/display?reg=reg_1');

  // レジ画面：商品ボタン・在庫表示
  await page.getByRole('link', { name: 'レジ' }).click();
  await expect(page.locator('.item-btn').nth(0)).toContainText(LONG);
  await expect(page.locator('.item-btn').nth(1)).toContainText('案2'); // 空欄は「案N」のまま
  await expect(page.locator('.item-btn').nth(2)).toContainText('スライム');
  await expect(page.locator('.stock-line')).toContainText(`${LONG} 100枚`);
  await expect(display.locator('.menu-card').nth(0)).toContainText(LONG, { timeout: 15_000 });
  await expect(display.locator('.menu-note')).toHaveText(`${LONG}・案2・スライム を1枚ずつ`);

  // 会計中のお客さん用画面・カート
  await page.locator('.item-btn').nth(0).click();
  await expect(page.locator('.cart-list')).toContainText(LONG);
  await expect(display.locator('.display-lines')).toContainText(LONG, { timeout: 15_000 });
  await tap(page, '大人');
  await tap(page, '1人');
  await tap(page, 'ちょうど');
  await tap(page, '会計確定');
  await expect(page.locator('.done-change')).toHaveText('¥0');

  // ダッシュボード
  await page.getByRole('link', { name: 'ダッシュボード' }).click();
  await expect(page.locator('.hbar').first()).toContainText(LONG);

  // スマホ幅でも横にはみ出さない（レジ画面・お客さん用画面）
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'レジ' }).click();
  await page.locator('.item-btn').nth(0).click();
  const overflows = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(await overflows(page)).toBe(false);
  for (const btn of await page.locator('.item-btn').all()) {
    const fits = await btn.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);
  }
  await display.setViewportSize({ width: 390, height: 844 });
  await expect(display.locator('.display-lines')).toContainText(LONG, { timeout: 15_000 });
  expect(await overflows(display)).toBe(false);
  await page.getByRole('button', { name: '全部クリア' }).click();

  // CSV：名前ではなくコード値（design_1）のまま
  await page.getByRole('link', { name: '設定・出力' }).click();
  const dl = page.waitForEvent('download');
  await tap(page, 'CSVをダウンロード（ZIP）');
  const zip = await JSZip.loadAsync(readFileSync(await (await dl).path()));
  const lines = await zip.file('sales_lines.csv')!.async('string');
  expect(lines).toContain(',design_1,');
  for (const name of [LONG, 'スライム']) {
    for (const f of Object.keys(zip.files)) expect(await zip.file(f)!.async('string')).not.toContain(name);
  }

  await staff.close();
  await other.close();
});
