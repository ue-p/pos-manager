const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');

/** 端末ローカル時刻をオフセット付き ISO 8601 で返す（例 2026-11-03T14:05:22+09:00）。D-12 */
export function toLocalIsoString(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`
  );
}

/** 日本時間（Asia/Tokyo）の UTC からのずれ。1951年以降サマータイムが無いので常に +9 時間 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * CSV の local_datetime 列（Tableau 用）：timestamp を日本時間の「YYYY-MM-DD HH:mm:ss」にする。D-14
 * 端末のタイムゾーン設定に左右されないよう、絶対時刻に直してから +9時間し、UTC として取り出す。
 */
export function toJstDatetime(timestamp: string): string {
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) throw new Error(`日時として読めない timestamp：${timestamp}`);
  const j = new Date(ms + JST_OFFSET_MS);
  return (
    `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())} ` +
    `${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}:${pad(j.getUTCSeconds())}`
  );
}

/** 時刻（ミリ秒）の日本時間での日付 YYYY-MM-DD。端末のタイムゾーンに左右されない（担当者の選択の日替わり：D-27） */
export function jstDateOf(ms: number): string {
  const j = new Date(ms + JST_OFFSET_MS);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`;
}

/** timestamp（ローカルISO）の日付部分 YYYY-MM-DD */
export function localDateOf(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** timestamp（ローカルISO）の時（0〜23） */
export function localHourOf(timestamp: string): number {
  return Number(timestamp.slice(11, 13));
}

export function todayLocalDate(now: Date = new Date()): string {
  return localDateOf(toLocalIsoString(now));
}
