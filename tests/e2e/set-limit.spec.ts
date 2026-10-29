// セットの販売上限（D-30）：設定で上限を変えると、レジ画面・お客さん用画面・ダッシュボードに反映され、施策ログに記録される
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tap = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first().click();

test.beforeEach(async ({ request }) => {
  await request.delete('http://127.0.0.1:8080/emulator/v1/projects/demo-gakusai-pos/databases/(default)/documents');
  await request.delete('http://127.0.0.1:9099/emulator/v1/projects/demo-gakusai-pos/accounts');
});

test('セットの販売上限で、セットが売り切れになり、変更が施策ログに残る', async ({ browser }) => {
  const staff = await browser.newContext();
  const page = await staff.newPage();
  await page.goto('/login');
  await page.getByLabel('パスワード').fill('password123');
  await page.getByRole('button', { name: /開発用アカウントを作成/ }).click();
  await expect(page.getByRole('button', { name: '会計確定' })).toBeVisible();

  // 初期値は100（実質、制限なし）
  const setBtn = page.locator('.item-btn--set');
  await expect(setBtn).toContainText('残り 100セット');

  // 担当者を登録して選ぶ
  await page.getByRole('link', { name: '設定・出力' }).click();
  await page.getByLabel('新しい担当者の名前').fill('うえ');
  await tap(page, '追加');
  await page.getByLabel('担当', { exact: true }).selectOption({ label: 'うえ' });

  // 上限：範囲外は保存できない → 2 に変える
  // 施策ログの一覧にも「セットの販売上限を変更した」が出るので、見出しで絞る
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'セットの販売上限', exact: true }) });
  const input = page.getByLabel('セットの販売上限');
  await input.fill('101');
  await expect(section.getByText('0〜100の整数で入力してください')).toBeVisible();
  await expect(section.getByRole('button', { name: '保存' })).toBeDisabled();
  await input.fill('2');
  page.once('dialog', (d) => d.accept());
  await section.getByRole('button', { name: '保存' }).click();
  await expect(page.locator('.toast', { hasText: 'セットの販売上限を変更した（100→2）' })).toBeVisible();
  await expect(section).toContainText('上限 2セット ／ 販売済み 0セット ／ 残り 2セット');

  // お客さん用画面（別端末。ログインなし）
  const other = await browser.newContext();
  const display = await other.newPage();
  await display.goto('/display?reg=reg_1');

  // レジ画面：残り2セット。カートに2つ入れると押せなくなる（カートの＋も）
  await page.getByRole('link', { name: 'レジ' }).click();
  await expect(setBtn).toContainText('残り 2セット');
  const setCard = display.locator('.menu-card--set');
  // 「残りわずか」の基準（初期値10）以下なので残り数を出す。単品（残り100枚）は出さない
  await expect(setCard).toContainText('残りわずか（あと2セット）', { timeout: 15_000 });
  await expect(display.locator('.menu-card').nth(0)).not.toContainText('残り');
  await setBtn.click();
  await expect(setBtn).toContainText('残り 1セット');
  await page.locator('.cart-list li', { hasText: 'セット' }).getByRole('button', { name: '1つ増やす' }).click();
  await expect(setBtn).toContainText('残り 0セット');
  await expect(setBtn).toBeDisabled();
  await expect(page.locator('.cart-list li', { hasText: 'セット' }).getByRole('button', { name: '1つ増やす' })).toBeDisabled();
  // 単品は上限に関係なく買える
  await expect(page.locator('.item-btn').nth(0)).toBeEnabled();

  await tap(page, '大人');
  await tap(page, '1人');
  await tap(page, 'ちょうど');
  await tap(page, '会計確定');
  await expect(page.locator('.done-change')).toHaveText('¥0');
  await tap(page, '次の会計へ');
  await expect(setBtn).toBeDisabled();
  await expect(setBtn).toContainText('残り 0セット');

  // お客さん用画面：0 になったら「売り切れ」だけ（残り数は出さない）
  await expect(setCard).toContainText('売り切れ', { timeout: 15_000 });
  await expect(setCard).not.toContainText('残り');
  await expect(setCard).not.toContainText('あと');

  // ダッシュボード：販売済み／上限
  await page.getByRole('link', { name: 'ダッシュボード' }).click();
  await expect(page.locator('.tile', { hasText: 'セット 販売済み／上限' })).toContainText('2／2');

  // 販売済みより低い上限：残りはマイナスにせず0
  await page.getByRole('link', { name: '設定・出力' }).click();
  await input.fill('1');
  await expect(section.getByText('保存すると残りは0セットになります')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await section.getByRole('button', { name: '保存' }).click();
  await expect(section).toContainText('上限 1セット ／ 販売済み 2セット ／ 残り 0セット');
  await page.getByRole('link', { name: 'ダッシュボード' }).click();
  await expect(page.locator('.tile', { hasText: 'セット 販売済み／上限' })).toContainText('残り 0セット');

  // 上限を戻すと、また売れる
  await page.getByRole('link', { name: '設定・出力' }).click();
  await input.fill('100');
  page.once('dialog', (d) => d.accept());
  await section.getByRole('button', { name: '保存' }).click();
  await page.getByRole('link', { name: 'レジ' }).click();
  await expect(setBtn).toContainText('残り 98セット');
  // 残り98セットは基準（10）より多いので、残り数は出さない
  await expect(setCard).toContainText('¥500', { timeout: 15_000 });
  await expect(setCard).not.toContainText('残り');

  // 単品も基準以下で「残りわずか（あと◯枚）」：案1の初期在庫を 9 にする（販売済み2枚 → 残り7枚）
  await page.getByRole('link', { name: '設定・出力' }).click();
  const priceSection = page.locator('section', { has: page.getByRole('heading', { name: '価格・在庫', exact: true }) });
  await priceSection.locator('.field', { hasText: '案1' }).nth(1).locator('input').fill('9');
  page.once('dialog', (d) => d.accept());
  await priceSection.getByRole('button', { name: '保存' }).click();
  await page.getByRole('link', { name: 'レジ' }).click();
  await expect(display.locator('.menu-card').nth(0)).toContainText('残りわずか（あと7枚）', { timeout: 15_000 });
  // セットも在庫で作れる数（7）が基準以下になるので出る
  await expect(setCard).toContainText('残りわずか（あと7セット）');

  // CSV：変更の記録が set_limit_change・is_test=false で3件
  await page.getByRole('link', { name: '設定・出力' }).click();
  const dl = page.waitForEvent('download');
  await tap(page, 'CSVをダウンロード（ZIP）');
  const zip = await JSZip.loadAsync(readFileSync(await (await dl).path()));
  const logs = (await zip.file('action_logs.csv')!.async('string')).split('\n').filter((l) => l.includes(',set_limit_change,'));
  expect(logs.map((l) => /（(\d+→\d+)）/.exec(l)?.[1]).sort()).toEqual(['100→2', '2→1', '1→100'].sort());
  for (const l of logs) expect(l.endsWith(',false')).toBe(true);
  // check_csv.py も set_limit_change を正しいコードとして扱い、変更の履歴を出す
  const out = execFileSync('python', ['scripts/check_csv.py', await (await dl).path()], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  console.log(out);
  expect(out).toContain('OK');
  expect(out).toContain('セットの販売上限の変更:');

  await staff.close();
  await other.close();
});
