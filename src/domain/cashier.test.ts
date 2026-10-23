import { describe, expect, it } from 'vitest';
import {
  activeCashiers,
  CASHIER_ID_PATTERN,
  cashierIdFromBytes,
  resolveCurrentCashier,
  validateCashierName,
  withCashierId,
} from './cashier';
import type { Cashier } from './types';

const c = (cashier_id: string, name: string, active = true): Cashier => ({ cashier_id, name, active });
const list = [c('cs_aaaa', 'うえ'), c('cs_bbbb', 'Y.T'), c('cs_cccc', 'まる', false)];

describe('担当者ID', () => {
  it('cs_ + 英小文字・数字4桁', () => {
    const id = cashierIdFromBytes(new Uint8Array([0, 25, 26, 35]));
    expect(id).toBe('cs_az09');
    expect(CASHIER_ID_PATTERN.test(id)).toBe(true);
    expect(CASHIER_ID_PATTERN.test('unknown')).toBe(false);
    expect(CASHIER_ID_PATTERN.test('山田')).toBe(false);
  });
});

describe('担当者名の確認', () => {
  it('前後の空白を除いて1〜20文字', () => {
    expect(validateCashierName('  ', list)).toBe('名前を入力してください');
    expect(validateCashierName('あ'.repeat(21), list)).toBe('20文字以内で入力してください');
    expect(validateCashierName('あ'.repeat(20), list)).toBeNull();
  });

  it('有効な担当者と同じ名前は登録できない（自分自身の変更と、無効の担当者は除く）', () => {
    expect(validateCashierName('うえ', list)).toBe('同じ名前の担当者がいます');
    expect(validateCashierName('うえ', list, 'cs_aaaa')).toBeNull();
    expect(validateCashierName('まる', list)).toBeNull();
  });
});

describe('選択肢と、端末の「いまの担当者」', () => {
  it('選択肢は有効な担当者だけ（名前順）', () => {
    expect(activeCashiers(list).map((x) => x.name)).toEqual(['Y.T', 'うえ']);
  });

  it('同じ日（日本時間）に選んだ有効な担当者なら、その人', () => {
    expect(resolveCurrentCashier({ cashier_id: 'cs_bbbb', date: '2026-11-03' }, list, '2026-11-03')?.name).toBe('Y.T');
  });

  it('日付が変わったら未選択に戻る', () => {
    expect(resolveCurrentCashier({ cashier_id: 'cs_bbbb', date: '2026-11-03' }, list, '2026-11-04')).toBeNull();
  });

  it('無効にした担当者・見つからない担当者・未選択は、未選択と同じ扱い', () => {
    expect(resolveCurrentCashier({ cashier_id: 'cs_cccc', date: '2026-11-03' }, list, '2026-11-03')).toBeNull();
    expect(resolveCurrentCashier({ cashier_id: 'cs_zzzz', date: '2026-11-03' }, list, '2026-11-03')).toBeNull();
    expect(resolveCurrentCashier(null, list, '2026-11-03')).toBeNull();
  });
});

describe('この機能より前の記録', () => {
  it('cashier_id が無い記録は unknown として扱う', () => {
    expect(withCashierId({ total: 500 }).cashier_id).toBe('unknown');
    expect(withCashierId({ total: 500, cashier_id: 'cs_aaaa' }).cashier_id).toBe('cs_aaaa');
  });
});
