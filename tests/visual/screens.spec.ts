// 設定画面以外の見た目（D-31）。Tailwind への置き換えの前後で、同じ状態の画面がピクセル単位で同じかを比べる。
// レジ画面（担当者なし・会計の途中・確定後・会計一覧・通知・テストモードの帯）、お客さん用画面（待機・会計中・確定後）、
// ダッシュボード（グラフのヒントを含む）、ログイン画面を、PC幅・スマホ幅 × ライト・ダークで撮る
import { expect, test, type Page } from '@playwright/test';

/** お客さん用画面は「前より新しい時刻」のデータだけを表示するので、レジ画面を操作するたびに時計を進める */
let ms = 0;
async function nudge(page: Page) {
  ms += 1000;
  await page.clock.setFixedTime(new Date(base + ms));
}
async function tap(page: Page, name: string) {
  await nudge(page);
  await page.getByRole('button', { name, exact: true }).first().click();
}
async function item(page: Page, name: string) {
  await nudge(page);
  await page.locator('.item-btn', { hasText: name }).first().click();
}

test.beforeEach(async ({ request }) => {
  await request.delete('http://127.0.0.1:8080/emulator/v1/projects/demo-gakusai-pos/databases/(default)/documents');
  await request.delete('http://127.0.0.1:9099/emulator/v1/projects/demo-gakusai-pos/accounts');
});

let minute = 0;
/** 時計を止める。会計ごとに10分進めて、時間帯・一覧の並び順を毎回同じにする（操作ごとの1秒ずつとは別） */
async function tick(...pages: Page[]) {
  minute += 10;
  ms = 0;
  const t = new Date(Date.parse('2026-11-03T09:00:00+09:00') + minute * 60_000);
  for (const p of pages) await p.clock.setFixedTime(t);
  base = t.getTime();
}
let base = 0;

/** 毎回変わる値（端末ID・担当者ID・URL）は塗りつぶす */
async function shoot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  await page.mouse.move(0, 0);
  // 起動直後の最初の表示ではフォントの読み込みが終わっていないことがあるので待つ
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: opts.fullPage ?? true, mask: [page.locator('code')] });
}

/** 画面の幅とライト／ダークを変えて撮る（表示モードは端末の設定として切り替える） */
async function shootAll(page: Page, name: string, sizes: ('pc' | 'phone')[] = ['pc', 'phone']) {
  for (const size of sizes) {
    await page.setViewportSize(size === 'pc' ? { width: 1280, height: 860 } : { width: 390, height: 844 });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await shoot(page, `${name}-${size}-${scheme}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.emulateMedia({ colorScheme: 'light' });
}

async function sell(page: Page, items: string[], group: string, size: string) {
  for (const i of items) await item(page, i);
  await tap(page, group);
  await tap(page, size);
  await tap(page, 'ちょうど');
  await tap(page, '会計確定');
  await expect(page.getByText('お釣り', { exact: true })).toBeVisible();
  await page.waitForTimeout(600); // 確定ボタンの二度押し防止が解けるまで
}

test('ログイン・レジ・お客さん用画面・ダッシュボード', async ({ browser }) => {
  const staff = await browser.newContext();
  const page = await staff.newPage();
  await tick(page);

  // ログイン画面
  await page.goto('/login');
  await expect(page.getByLabel('パスワード')).toBeVisible();
  await shootAll(page, 'login');

  await page.getByLabel('パスワード').fill('password123');
  await page.getByRole('button', { name: /開発用アカウントを作成/ }).click();
  await expect(page.getByRole('button', { name: '会計確定' })).toBeVisible();
  // レジ画面：担当者が選ばれていない（警告）・カートが空
  await shootAll(page, 'register-empty');

  // 担当者を登録・選択。案1の在庫を12枚にして、売ると「残りわずか」になるようにする
  await page.getByRole('link', { name: '設定・出力' }).click();
  await page.getByLabel('新しい担当者の名前').fill('うえ');
  await tap(page, '追加');
  await page.getByLabel('担当', { exact: true }).selectOption({ label: 'うえ' });
  const price = page.locator('section', { has: page.getByRole('heading', { name: '価格・在庫', exact: true }) });
  await price.locator('.field', { hasText: '案1' }).nth(1).locator('input').fill('12');
  page.once('dialog', (d) => d.accept());
  await price.getByRole('button', { name: '保存' }).click();
  // セットの販売上限を2にして、お客さん用画面に「あと◯セット」が出るようにする
  await page.getByLabel('セットの販売上限').fill('3');
  page.once('dialog', (d) => d.accept());
  await page.locator('section', { has: page.getByRole('heading', { name: 'セットの販売上限', exact: true }) }).getByRole('button', { name: '保存' }).click();

  // お客さん用画面（別端末。ログインなし）
  const other = await browser.newContext();
  const display = await other.newPage();
  await tick(page, display);
  await display.goto('/display?reg=reg_1');

  // 会計を3件（時間帯・客層を分ける）
  await page.getByRole('link', { name: 'レジ' }).click();
  await sell(page, ['案1', '案1', 'セット'], '子連れ', '3人');
  await tick(page, display);
  await sell(page, ['案2'], '学生', '2人');
  await tick(page, display);
  await sell(page, ['案3', '案1'], '大人', '1人');
  await tick(page, display);
  await tap(page, '次の会計へ');
  await page.waitForTimeout(1000);

  // お客さん用画面：待機（案1は残りわずか、セットはあと2セット）
  await expect(display.locator('.menu-card').first()).toContainText('あと', { timeout: 15_000 });
  await shootAll(display, 'display-idle');

  // レジ画面：会計の途中（確定できない理由が出ている）
  await item(page, 'セット');
  await item(page, '案2');
  await nudge(page);
  await page.locator('.cart-list li', { hasText: '案2' }).getByRole('button', { name: '1つ増やす' }).click();
  await shootAll(page, 'register-blockers');
  // 会計の途中（確定できる）
  await tap(page, 'その他');
  await tap(page, '5人以上');
  await tap(page, '1,000');
  await tap(page, '1,000');
  await shootAll(page, 'register-ready');
  await expect(display.locator('.display-pay')).toBeVisible({ timeout: 15_000 });
  await shootAll(display, 'display-cart');

  // 確定後
  await tap(page, '会計確定');
  await expect(page.locator('.done-change')).toBeVisible();
  await shootAll(page, 'register-done');
  await expect(display.locator('.display-thanks')).toBeVisible({ timeout: 15_000 });
  await shootAll(display, 'display-done');
  await page.waitForTimeout(600);

  // 直前の取消（通知が出る）
  await tick(page, display);
  await tap(page, '次の会計へ');
  await page.getByRole('button', { name: /直前の取消/ }).click();
  await expect(page.locator('.toast')).toBeVisible();
  await shoot(page, 'register-toast-pc-light');

  // 会計一覧（取消済み・テストモードの記録を含む）
  await page.getByRole('button', { name: '会計一覧' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shootAll(page, 'history', ['pc']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15_000 });

  // ダッシュボード
  await page.getByRole('link', { name: 'ダッシュボード' }).click();
  await expect(page.locator('.hero-value')).toBeVisible();
  await shootAll(page, 'dashboard');
  // グラフのヒント（横棒・縦棒）
  await page.locator('.hbar-row').first().hover();
  await expect(page.locator('.chart-tip').first()).toBeVisible();
  await expect(page).toHaveScreenshot('dashboard-hbar-tip.png', { fullPage: true, mask: [page.locator('code')] });
  await page.locator('.colchart-col').first().hover();
  await expect(page).toHaveScreenshot('dashboard-col-tip.png', { fullPage: true, mask: [page.locator('code')] });
  // 日付の切り替え（全期間）
  await page.getByRole('button', { name: '全期間' }).click();
  await shoot(page, 'dashboard-all-pc-light');

  // テストモードの帯（スタッフ画面）と、お客さん用画面の「TEST」
  await page.getByRole('link', { name: '設定・出力' }).click();
  page.once('dialog', (d) => d.accept());
  await tap(page, 'テストモードにする');
  await page.getByRole('link', { name: 'レジ' }).click();
  await expect(page.locator('.test-banner')).toBeVisible();
  await shootAll(page, 'register-testmode', ['pc', 'phone']);
  await expect(display.locator('.display-test')).toBeVisible({ timeout: 15_000 });
  await shoot(display, 'display-testmode-pc-light');

  await staff.close();
  await other.close();
});
