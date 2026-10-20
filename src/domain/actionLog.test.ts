import { describe, expect, it } from 'vitest';
import { createManualLog, createTestModeLog, normalizeActionLog } from './actionLog';

const base = { logId: 'L1', timestamp: '2026-11-03T09:00:00+09:00', registerId: 'reg_2', deviceId: 'dev_a1b2' };

describe('テストモード切替の自動記録（D-24）', () => {
  it('オンにした記録', () => {
    expect(createTestModeLog({ ...base, on: true })).toEqual({
      log_id: 'L1',
      timestamp: '2026-11-03T09:00:00+09:00',
      log_type: 'test_mode_on',
      note: 'テストモードをオンにした',
      register_id: 'reg_2',
      device_id: 'dev_a1b2',
      is_test: false,
    });
  });

  it('オフにした記録', () => {
    expect(createTestModeLog({ ...base, on: false })).toMatchObject({
      log_type: 'test_mode_off',
      note: 'テストモードをオフにした',
      is_test: false,
    });
  });
});

describe('手入力の施策ログ', () => {
  it('種類は manual、テストモード中なら is_test=true', () => {
    expect(createManualLog({ ...base, note: '  POPを変更 ', isTest: true })).toEqual({
      log_id: 'L1',
      timestamp: '2026-11-03T09:00:00+09:00',
      log_type: 'manual',
      note: 'POPを変更',
      register_id: 'reg_2',
      device_id: 'dev_a1b2',
      is_test: true,
    });
  });
});

describe('log_type 追加前のデータ', () => {
  it('log_type が無い記録は manual として扱う', () => {
    const old = { log_id: 'L0', timestamp: base.timestamp, note: 'メモ', register_id: 'reg_1', device_id: 'dev_x', is_test: false };
    expect(normalizeActionLog(old).log_type).toBe('manual');
    expect(normalizeActionLog({ ...old, log_type: 'test_mode_off' }).log_type).toBe('test_mode_off');
  });
});
