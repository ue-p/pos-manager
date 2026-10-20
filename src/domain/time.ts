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
