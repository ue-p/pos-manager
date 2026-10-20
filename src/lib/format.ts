import { ITEM_LABELS, type SaleLine } from '../domain/types';

export function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
}

/** 例：案1×2・セット×1 */
export function describeLines(lines: Pick<SaleLine, 'item' | 'quantity'>[]): string {
  return lines.map((l) => `${ITEM_LABELS[l.item]}×${l.quantity}`).join('・');
}

/** timestamp（ローカルISO）から HH:MM */
export function hhmm(timestamp: string): string {
  return timestamp.slice(11, 16);
}

/** 経過時間（分）の表示。例：1分以内 / 25分 / 1時間5分 */
export function formatElapsed(min: number): string {
  if (min < 1) return '1分以内';
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}時間${min % 60}分`;
}

export function percent(ratio: number | null): string {
  return ratio === null ? '—' : `${(ratio * 100).toFixed(1)}%`;
}
