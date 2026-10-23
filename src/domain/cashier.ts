// レジ担当者（D-27）。記録・CSV には cashier_id だけを残し、名前は出さない
import type { Cashier } from './types';

/** cs_ + 英小文字・数字4桁 */
export const CASHIER_ID_PATTERN = /^cs_[a-z0-9]{4}$/;
/** この機能より前の記録など、担当者が分からない場合の値 */
export const UNKNOWN_CASHIER = 'unknown';
export const CASHIER_NAME_MAX = 20;

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 乱数4バイトから cs_xxxx を作る（乱数は呼び出し側で crypto.getRandomValues から渡す） */
export function cashierIdFromBytes(bytes: Uint8Array): string {
  return 'cs_' + Array.from(bytes.slice(0, 4), (b) => CHARS[b % CHARS.length]).join('');
}

/** 名前の確認。問題がなければ null。others には登録済みの全担当者を渡す（selfId は変更中の本人） */
export function validateCashierName(name: string, others: Cashier[], selfId?: string): string | null {
  const n = name.trim();
  if (n === '') return '名前を入力してください';
  if (n.length > CASHIER_NAME_MAX) return `${CASHIER_NAME_MAX}文字以内で入力してください`;
  if (others.some((c) => c.active && c.cashier_id !== selfId && c.name.trim() === n)) return '同じ名前の担当者がいます';
  return null;
}

/** 選択肢に出す担当者（有効な人だけ。名前順） */
export function activeCashiers(cashiers: Cashier[]): Cashier[] {
  return cashiers.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

/** 端末に保存する「いまの担当者」。選んだ日（日本時間）も持ち、日付が変わったら未選択に戻す */
export interface CashierSelection {
  cashier_id: string;
  date: string;
}

/** 端末の「いまの担当者」。日付が変わった・無効にされた・見つからない場合は未選択（null） */
export function resolveCurrentCashier(sel: CashierSelection | null, cashiers: Cashier[], today: string): Cashier | null {
  if (!sel || sel.date !== today) return null;
  const c = cashiers.find((x) => x.cashier_id === sel.cashier_id);
  return c && c.active ? c : null;
}

/** cashier_id が無い記録（この機能より前）は unknown として扱う */
export function withCashierId<T extends object>(raw: T): T & { cashier_id: string } {
  const id = (raw as { cashier_id?: unknown }).cashier_id;
  return { ...raw, cashier_id: typeof id === 'string' && id !== '' ? id : UNKNOWN_CASHIER };
}
