// npm run test:rules（Emulator 上で実行）
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const STAFF = 'staff@gakusai-pos.example';
let env: RulesTestEnvironment;

const staffDb = () => env.authenticatedContext('staff', { email: STAFF }).firestore();
const otherDb = () => env.authenticatedContext('intruder', { email: 'someone@example.com' }).firestore();
const anonDb = () => env.unauthenticatedContext().firestore();
// rules-unit-testing は compat 版の Firestore を返す（実行時は modular API でもそのまま使える）
type TestDb = ReturnType<typeof staffDb>;

const tx = (id: string) => ({
  schema_version: 1,
  transaction_id: id,
  timestamp: '2026-11-03T14:05:22+09:00',
  group_type: 'student',
  group_size: 2,
  lines: [
    { line_no: 1, item: 'set', quantity: 1, unit_price: 500, amount: 500, design_1_qty: 1, design_2_qty: 1, design_3_qty: 1 },
  ],
  total: 500,
  received: 1000,
  change: 500,
  design_1_qty: 1,
  design_2_qty: 1,
  design_3_qty: 1,
  register_id: 'reg_1',
  device_id: 'dev_a1b2',
  is_void: false,
  voided_at: null,
  is_test: false,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gakusai-pos',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

async function seedTx(id: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'transactions', id), tx(id));
  });
}

describe('transactions', () => {
  it('共通アカウントは作成・読み取りできる', async () => {
    await assertSucceeds(setDoc(doc(staffDb(), 'transactions', 't1'), { ...tx('t1'), created_at: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(staffDb(), 'transactions', 't1')));
  });

  it('未ログイン・別アカウントは読み書きできない', async () => {
    await seedTx('t1');
    await assertFails(getDoc(doc(anonDb(), 'transactions', 't1')));
    await assertFails(getDoc(doc(otherDb(), 'transactions', 't1')));
    await assertFails(setDoc(doc(anonDb(), 'transactions', 't2'), tx('t2')));
    await assertFails(setDoc(doc(otherDb(), 'transactions', 't2'), tx('t2')));
  });

  it('ドキュメントIDと transaction_id が違うと作成できない', async () => {
    await assertFails(setDoc(doc(staffDb(), 'transactions', 'x'), tx('t1')));
  });

  it('取消（is_void / voided_at）だけ更新できる', async () => {
    await seedTx('t1');
    await assertSucceeds(
      updateDoc(doc(staffDb(), 'transactions', 't1'), { is_void: true, voided_at: '2026-11-03T14:06:00+09:00' }),
    );
  });

  it('取消以外の更新・取消の取り消しはできない', async () => {
    await seedTx('t1');
    await assertFails(updateDoc(doc(staffDb(), 'transactions', 't1'), { total: 0 }));
    await assertFails(updateDoc(doc(staffDb(), 'transactions', 't1'), { is_void: true, voided_at: 'x', total: 0 }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'transactions', 't1'), { is_void: true, voided_at: 'x' });
    });
    await assertFails(updateDoc(doc(staffDb(), 'transactions', 't1'), { is_void: false, voided_at: null }));
  });

  it('同じ会計の再送（同一内容の上書き）は通る', async () => {
    await seedTx('t1');
    await assertSucceeds(setDoc(doc(staffDb(), 'transactions', 't1'), { ...tx('t1'), created_at: serverTimestamp() }));
  });

  it('削除はできない', async () => {
    await seedTx('t1');
    await assertFails(deleteDoc(doc(staffDb(), 'transactions', 't1')));
  });
});

describe('vr_visits / action_logs / register_closings', () => {
  const visit = { visit_id: 'v1', timestamp: '2026-11-03T14:00:00+09:00', register_id: 'reg_1', device_id: 'dev_a1b2', is_void: false, voided_at: null, is_test: false };
  const log = { log_id: 'l1', timestamp: '2026-11-03T14:00:00+09:00', log_type: 'manual', note: 'POP', register_id: 'reg_1', device_id: 'dev_a1b2', is_test: false };

  it('VR体験は作成と取消ができ、削除はできない', async () => {
    await assertSucceeds(setDoc(doc(staffDb(), 'vr_visits', 'v1'), visit));
    await assertSucceeds(updateDoc(doc(staffDb(), 'vr_visits', 'v1'), { is_void: true, voided_at: 'x' }));
    await assertFails(updateDoc(doc(staffDb(), 'vr_visits', 'v1'), { register_id: 'reg_2' }));
    await assertFails(deleteDoc(doc(staffDb(), 'vr_visits', 'v1')));
    await assertFails(setDoc(doc(anonDb(), 'vr_visits', 'v2'), { ...visit, visit_id: 'v2' }));
  });

  it('施策ログは作成のみ（更新・削除不可）', async () => {
    await assertSucceeds(setDoc(doc(staffDb(), 'action_logs', 'l1'), log));
    await assertFails(updateDoc(doc(staffDb(), 'action_logs', 'l1'), { note: '書き換え' }));
    await assertFails(deleteDoc(doc(staffDb(), 'action_logs', 'l1')));
  });

  it('レジ締めは作成のみ', async () => {
    const c = { closing_id: 'c1', timestamp: 'x', business_date: '2026-11-03', register_id: 'reg_1', device_id: 'd', system_cash_sales: 0, counted_cash: 0, float_amount: 0, difference: 0, is_test: false };
    await assertSucceeds(setDoc(doc(staffDb(), 'register_closings', 'c1'), c));
    await assertFails(updateDoc(doc(staffDb(), 'register_closings', 'c1'), { difference: 1 }));
  });
});

describe('settings', () => {
  it('共通アカウントのみ読み書きできる', async () => {
    await assertSucceeds(setDoc(doc(staffDb(), 'settings', 'current'), { test_mode: false }));
    await assertSucceeds(getDoc(doc(staffDb(), 'settings', 'current')));
    await assertFails(getDoc(doc(anonDb(), 'settings', 'current')));
    await assertFails(setDoc(doc(otherDb(), 'settings', 'current'), { test_mode: true }));
  });
});

describe('display_state', () => {
  it('未ログインでも読めるが、書けるのは共通アカウントだけ', async () => {
    await assertSucceeds(setDoc(doc(staffDb(), 'display_state', 'reg_1'), { register_id: 'reg_1', mode: 'idle' }));
    await assertSucceeds(getDoc(doc(anonDb(), 'display_state', 'reg_1')));
    await assertFails(setDoc(doc(anonDb(), 'display_state', 'reg_1'), { register_id: 'reg_1', mode: 'idle' }));
    await assertFails(setDoc(doc(staffDb(), 'display_state', 'reg_1'), { register_id: 'reg_2', mode: 'idle' }));
  });
});

describe('テストモード切替と施策ログ（D-24）', () => {
  const autoLog = (id: string, on: boolean, extra: Record<string, unknown> = {}) => ({
    log_id: id,
    timestamp: '2026-11-03T08:00:00+09:00',
    log_type: on ? 'test_mode_on' : 'test_mode_off',
    note: on ? 'テストモードをオンにした' : 'テストモードをオフにした',
    register_id: 'reg_1',
    device_id: 'dev_a1b2',
    is_test: false,
    ...extra,
  });

  /** アプリと同じ形のバッチ（settings の切替 + 記録） */
  const toggleBatch = (db: TestDb, on: boolean, logId: string, log = autoLog(logId, on)) => {
    const b = writeBatch(db as unknown as Firestore);
    b.set(doc(db, 'settings', 'current'), { test_mode: on, test_mode_log_id: logId }, { merge: true });
    b.set(doc(db, 'action_logs', logId), log);
    return b.commit();
  };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'settings', 'current'), { test_mode: false, prices: { set: 500 } });
    });
  });

  it('切替と記録を同じバッチで書けば、オン→オフとも通る', async () => {
    await assertSucceeds(toggleBatch(staffDb(), true, 'on1'));
    await assertSucceeds(toggleBatch(staffDb(), false, 'off1'));
  });

  it('記録なしで test_mode だけ変えることはできない', async () => {
    await assertFails(setDoc(doc(staffDb(), 'settings', 'current'), { test_mode: true }, { merge: true }));
    await assertFails(
      setDoc(doc(staffDb(), 'settings', 'current'), { test_mode: true, test_mode_log_id: 'nolog' }, { merge: true }),
    );
  });

  it('切替なしで自動記録だけ作ることはできない', async () => {
    await assertFails(setDoc(doc(staffDb(), 'action_logs', 'on2'), autoLog('on2', true)));
  });

  it('記録の種類と切替の向きが食い違うと通らない', async () => {
    await assertFails(toggleBatch(staffDb(), true, 'x1', autoLog('x1', false)));
  });

  it('自動記録は is_test=true にできない', async () => {
    await assertFails(toggleBatch(staffDb(), true, 'x2', autoLog('x2', true, { is_test: true })));
  });

  it('既にある記録を使い回して切り替えることはできない', async () => {
    await assertSucceeds(toggleBatch(staffDb(), true, 'on3'));
    await assertSucceeds(toggleBatch(staffDb(), false, 'off3'));
    await assertFails(
      setDoc(doc(staffDb(), 'settings', 'current'), { test_mode: true, test_mode_log_id: 'on3' }, { merge: true }),
    );
  });

  it('test_mode を変えない設定の保存は記録なしで通る', async () => {
    await assertSucceeds(setDoc(doc(staffDb(), 'settings', 'current'), { prices: { set: 600 } }, { merge: true }));
  });

  it('手入力メモは manual なら is_test=true でも作れる。不明な種類は作れない', async () => {
    const memo = { log_id: 'm1', timestamp: 'x', log_type: 'manual', note: 'POP', register_id: 'reg_1', device_id: 'd', is_test: true };
    await assertSucceeds(setDoc(doc(staffDb(), 'action_logs', 'm1'), memo));
    await assertFails(setDoc(doc(staffDb(), 'action_logs', 'm2'), { ...memo, log_id: 'm2', log_type: 'other' }));
    const { log_type: _omit, ...noType } = memo;
    void _omit;
    await assertFails(setDoc(doc(staffDb(), 'action_logs', 'm3'), { ...noType, log_id: 'm3' }));
  });

  it('オフライン復帰時の再送（同じ内容の上書き）は通る', async () => {
    await assertSucceeds(toggleBatch(staffDb(), true, 'on4'));
    const db = staffDb();
    const b = writeBatch(db as unknown as Firestore);
    b.set(doc(db, 'settings', 'current'), { test_mode: true, test_mode_log_id: 'on4', updated_at: serverTimestamp() }, { merge: true });
    b.set(doc(db, 'action_logs', 'on4'), { ...autoLog('on4', true), created_at: serverTimestamp() });
    await assertSucceeds(b.commit());
  });

  it('settings は削除できない', async () => {
    await assertFails(deleteDoc(doc(staffDb(), 'settings', 'current')));
  });
});
