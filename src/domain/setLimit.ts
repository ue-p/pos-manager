// セットの販売上限（D-30）。残りセット数は保存せず、在庫と同じく会計から毎回計算する
import { DESIGNS, isCounted, type Stock, type Transaction } from './types';

export const SET_LIMIT_MAX = 100;

/** 販売済みのセット数（取消・テストを除外。在庫と同じ扱い） */
export function soldSets(txs: Transaction[]): number {
  let n = 0;
  for (const t of txs) {
    if (!isCounted(t)) continue;
    for (const l of t.lines) if (l.item === 'set') n += l.quantity;
  }
  return n;
}

/** 残りセット数 = 上限 − 販売済み。販売済みより低い上限にしたときは 0（マイナスにしない） */
export function remainingSets(limit: number, txs: Transaction[]): number {
  return Math.max(0, limit - soldSets(txs));
}

/** 設定画面の入力。0〜100 の整数だけ受け付け、それ以外は null */
export function parseSetLimit(input: string): number | null {
  const s = input.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n <= SET_LIMIT_MAX ? n : null;
}

/** 実際に売れるセット数：残りセット数と、3絵柄の在庫の少ない方 */
export function availableSets(remaining: Stock, setsLeft: number): number {
  return Math.max(0, Math.min(setsLeft, ...DESIGNS.map((d) => remaining[d])));
}
