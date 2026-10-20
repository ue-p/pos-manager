// 端末ごとの値（localStorage）。D-03
const KEY_DEVICE = 'pos.device_id';
const KEY_REGISTER = 'pos.register_id';
const KEY_LAST_EXPORT = 'pos.last_export_at';

export const REGISTER_IDS = ['reg_1', 'reg_2', 'reg_3', 'reg_4', 'reg_5', 'reg_6', 'reg_7', 'reg_8', 'reg_9'] as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できない環境（プライベートモード等）でも動作は続ける
  }
}

let memoDeviceId: string | null = null;

/** dev_ + 英数4桁。初回に生成して以後固定 */
export function getDeviceId(): string {
  if (memoDeviceId) return memoDeviceId;
  let id = read(KEY_DEVICE);
  if (!id) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    id = 'dev_' + Array.from(bytes, (b) => chars[b % chars.length]).join('');
    write(KEY_DEVICE, id);
  }
  memoDeviceId = id;
  return id;
}

export function getRegisterId(): string {
  const id = read(KEY_REGISTER);
  return id && (REGISTER_IDS as readonly string[]).includes(id) ? id : 'reg_1';
}

export function setRegisterId(id: string): void {
  write(KEY_REGISTER, id);
}

/** 最後にCSVをエクスポートした時刻（ミリ秒）。未実施なら null */
export function getLastExportAt(): number | null {
  const v = read(KEY_LAST_EXPORT);
  return v ? Number(v) : null;
}

export function setLastExportAt(ms: number): void {
  write(KEY_LAST_EXPORT, String(ms));
}

export function registerLabel(id: string): string {
  return `レジ${id.replace('reg_', '')}`;
}
