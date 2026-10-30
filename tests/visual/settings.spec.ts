// 設定画面の見た目（D-31）。Tailwind への置き換えの前後で、同じ状態の画面がピクセル単位で同じかを比べる
import { expect, test, type Page } from '@playwright/test';

const tap = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first().click();

test.beforeEach(async ({ request }) => {
  await request.delete('http://127.0.0.1:8080/emulator/v1/projects/demo-gakusai-pos/databases/(default)/documents');
  await request.delete('http://127.0.0.1:9099/emulator/v1/projects/demo-gakusai-pos/accounts');
});

/** 時刻で変わる表示（経過時間・施策ログの時刻）をそろえるため、時計を止める */
async function freezeClock(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-03T10:00:00+09:00'));
}

/** 毎回変わる値（端末ID・担当者ID・URL）は塗りつぶす。枠の大きさ・位置は比べられる */
const masks = (page: Page) => [page.locator('code')];

async function shoot(page: Page, name: string) {
  await page.mouse.move(0, 0);
  // 起動直後の最初の表示ではフォントの読み込みが終わっていないことがあるので待つ
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle'); // ボタンの hover を外す
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, mask: masks(page) });
}

test('設定画面', async ({ page }) => {
  await freezeClock(page);
  await page.goto('/login');
  await page.getByLabel('パスワード').fill('password123');
  await page.getByRole('button', { name: /開発用アカウントを作成/ }).click();
  await expect(page.getByRole('button', { name: '会計確定' })).toBeVisible();
  await page.getByRole('link', { name: '設定・出力' }).click();

  // 担当者3人（うち1人を無効）
  for (const name of ['うえ', 'Y.T', 'かわ']) {
    await page.getByLabel('新しい担当者の名前').fill(name);
    await tap(page, '追加');
  }
  page.once('dialog', (d) => d.accept());
  await page.getByRole('listitem').filter({ has: page.locator('input[value="Y.T"]') }).getByRole('button', { name: '無効にする' }).click();
  await expect(page.getByText('無効', { exact: true })).toBeVisible();
  await page.getByLabel('担当', { exact: true }).selectOption({ label: 'うえ' });

  // 施策ログ（手入力2件）
  await tap(page, 'POPを変更');
  await expect(page.getByText('POPを変更').last()).toBeVisible();
  // 同じ時刻だと一覧の並び順が毎回変わるので、1分進めてから2件目を記録する
  await page.clock.setFixedTime(new Date('2026-11-03T10:01:00+09:00'));
  await page.getByPlaceholder('自由メモ（例：セット推しのPOPに変更）').fill('セット推しのPOPに変更');
  await tap(page, '記録');
  await expect(page.getByText('セット推しのPOPに変更').last()).toBeVisible();
  // 通知（トースト）が消えるのを待つ
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15_000 });

  await shoot(page, 'settings-pc-light');

  // 入力の途中：担当者の名前の変更・新しい担当者のエラー・価格のエラー・上限の範囲外・レジ締めの差額
  await page.getByLabel('うえ の名前').fill('うえだ');
  await page.getByLabel('新しい担当者の名前').fill('かわ');
  await page.locator('section', { has: page.getByRole('heading', { name: '価格・在庫', exact: true }) }).locator('input').first().fill('abc');
  await page.getByLabel('セットの販売上限').fill('101');
  await page.getByLabel('数えた現金の総額').fill('1200');
  await shoot(page, 'settings-pc-light-editing');

  // ダーク
  await page.getByLabel('表示モード（この端末だけ）').selectOption('dark');
  await shoot(page, 'settings-pc-dark-editing');

  // スマホ幅
  await page.setViewportSize({ width: 390, height: 844 });
  await shoot(page, 'settings-phone-dark-editing');
  await page.getByLabel('表示モード（この端末だけ）').selectOption('light');
  await shoot(page, 'settings-phone-light-editing');
});
