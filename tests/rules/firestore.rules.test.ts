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

// 共通アカウントのメールアドレスは firestore.rules の sharedEmail() から読み取る（書き換えてもテストが追従する）
const STAFF = /function sharedEmail\(\)\s*\{\s*return '([^']+)'/.exec(readFileSync('firestore.rules', 'utf8'))![1];
let env: RulesTestEnvironment;

const staffDb = () => env.authenticatedContext('staff', { email: STAFF }).firestore();
const otherDb = () => env.authenticatedContext('intruder', { email: 'someone@example.com' }).firestore();
const anonDb = () => env.unauthenticatedContext().firestore();
// rules-unit-testing は compat 版の Firestore を返す（実行時は modular API でもそのまま使える）
type TestDb = ReturnType<typeof staffDb>;

const tx = (id: string) => ({
  schema_version: 2,
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
  cashier_id: 'cs_k3f9',
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

  it('担当者（cashier_id = cs_xxxx）が無い・形が違う会計は作れない（D-27）', async () => {
    const { cashier_id: _omit, ...noCashier } = tx('t3');
    void _omit;
    await assertFails(setDoc(doc(staffDb(), 'transactions', 't3'), noCashier));
    await assertFails(setDoc(doc(staffDb(), 'transactions', 't4'), { ...tx('t4'), cashier_id: '' }));
    await assertFails(setDoc(doc(staffDb(), 'transactions', 't5'), { ...tx('t5'), cashier_id: 'unknown' }));
    await assertFails(setDoc(doc(staffDb(), 'transactions', 't6'), { ...tx('t6'), cashier_id: 'うえやま' }));
  });

  it('機能追加前の会計（cashier_id なし）も、取消はできる', async () => {
    const { cashier_id: _omit, ...old } = tx('t7');
    void _omit;
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'transactions', 't7'), { ...old, schema_version: 1 });
    });
    await assertSucceeds(updateDoc(doc(staffDb(), 'transactions', 't7'), { is_void: true, voided_at: 'x' }));
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

  it('レジ締めは作成のみ。担当者（cs_xxxx）が必要', async () => {
    const c = { closing_id: 'c1', timestamp: 'x', business_date: '2026-11-03', register_id: 'reg_1', device_id: 'd', cashier_id: 'cs_k3f9', system_cash_sales: 0, counted_cash: 0, float_amount: 0, difference: 0, is_test: false };
    await assertSucceeds(setDoc(doc(staffDb(), 'register_closings', 'c1'), c));
    await assertFails(updateDoc(doc(staffDb(), 'register_closings', 'c1'), { difference: 1 }));
    const { cashier_id: _omit, ...noCashier } = { ...c, closing_id: 'c2' };
    void _omit;
    await assertFails(setDoc(doc(staffDb(), 'register_closings', 'c2'), noCashier));
    await assertFails(setDoc(doc(staffDb(), 'register_closings', 'c3'), { ...c, closing_id: 'c3', cashier_id: 'unknown' }));
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
  // レジ画面が送る表示データの全項目（src/data/displaySync.ts の DisplayState）
  const state = {
    register_id: 'reg_1',
    mode: 'cart',
    lines: [{ item: 'set', quantity: 1, unit_price: 500, amount: 500 }],
    total: 500,
    received: 1000,
    change: 500,
    prices: { design_1: 200, design_2: 200, design_3: 200, set: 500 },
    // シールの表示名（D-29。画面に出す名前だけ。個人情報ではない）
    labels: { design_1: 'ぴょん丸', design_2: '案2', design_3: '案3', set: 'セット' },
    sold_out: [],
    // 売れるセットの残り数（D-30）
    set_remaining: 12,
    is_test: false,
    updated_at_ms: 1,
  };

  it('未ログインでも読めるが、書けるのは共通アカウントだけ', async () => {
    await assertSucceeds(setDoc(doc(staffDb(), 'display_state', 'reg_1'), state));
    // 古い版のレジ（set_remaining なし）の表示データも受け付ける
    const { set_remaining: _old, ...withoutRemaining } = state;
    void _old;
    await assertSucceeds(setDoc(doc(staffDb(), 'display_state', 'reg_1'), withoutRemaining));
    await assertSucceeds(getDoc(doc(anonDb(), 'display_state', 'reg_1')));
    await assertFails(setDoc(doc(anonDb(), 'display_state', 'reg_1'), state));
    await assertFails(setDoc(doc(staffDb(), 'display_state', 'reg_1'), { ...state, register_id: 'reg_2' }));
  });

  it('担当者の名前もIDも書き込めない（ログインなしで読めるため。D-27）', async () => {
    await assertFails(setDoc(doc(staffDb(), 'display_state', 'reg_1'), { ...state, cashier_id: 'cs_k3f9' }));
    await assertFails(setDoc(doc(staffDb(), 'display_state', 'reg_1'), { ...state, cashier_name: 'うえ' }));
    await assertFails(setDoc(doc(staffDb(), 'display_state', 'reg_1'), { ...state, cashier: { name: 'うえ' } }));
  });
});

describe('cashiers（担当者。D-27）', () => {
  const cashier = { cashier_id: 'cs_k3f9', name: 'うえ', active: true };

  it('共通アカウントは登録・読み取りでき、名前と有効／無効を変えられる', async () => {
    await assertSucceeds(
      setDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), { ...cashier, created_at: serverTimestamp(), updated_at: serverTimestamp() }),
    );
    await assertSucceeds(getDoc(doc(staffDb(), 'cashiers', 'cs_k3f9')));
    await assertSucceeds(updateDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), { name: 'Y.U', updated_at: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), { active: false, updated_at: serverTimestamp() }));
  });

  it('削除はできない。ID や他の項目は変えられない', async () => {
    await assertSucceeds(setDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), cashier));
    await assertFails(deleteDoc(doc(staffDb(), 'cashiers', 'cs_k3f9')));
    await assertFails(updateDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), { cashier_id: 'cs_zzzz' }));
    await assertFails(updateDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), { phone: '090' }));
    await assertFails(updateDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), { name: '' }));
  });

  it('ID の形・ドキュメントIDとの一致・名前（1〜20文字）・active・余計な項目を確かめる', async () => {
    await assertFails(setDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), { ...cashier, cashier_id: 'cs_zzzz' }));
    await assertFails(setDoc(doc(staffDb(), 'cashiers', 'yamada'), { ...cashier, cashier_id: 'yamada' }));
    await assertFails(setDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), { ...cashier, name: '' }));
    await assertFails(setDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), { ...cashier, name: 'あ'.repeat(21) }));
    await assertFails(setDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), { ...cashier, active: 'yes' }));
    await assertFails(setDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), { ...cashier, email: 'x@example.com' }));
  });

  it('未ログイン・別アカウントは読み書きできない', async () => {
    await assertSucceeds(setDoc(doc(staffDb(), 'cashiers', 'cs_k3f9'), cashier));
    await assertFails(getDoc(doc(anonDb(), 'cashiers', 'cs_k3f9')));
    await assertFails(getDoc(doc(otherDb(), 'cashiers', 'cs_k3f9')));
    await assertFails(setDoc(doc(otherDb(), 'cashiers', 'cs_aaaa'), { ...cashier, cashier_id: 'cs_aaaa' }));
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

describe('CSVエクスポートの記録（D-25）', () => {
  const exportLog = (id: string, extra: Record<string, unknown> = {}) => ({
    log_id: id,
    timestamp: '2026-11-03T14:30:00+09:00',
    log_type: 'csv_export',
    note: 'CSVをエクスポートした（pos_export_reg_1_20261103_143000.zip）',
    register_id: 'reg_1',
    device_id: 'dev_a1b2',
    is_test: false,
    ...extra,
  });

  it('is_test=false なら単独で作れ、再送も通る。更新・削除はできない', async () => {
    await assertSucceeds(setDoc(doc(staffDb(), 'action_logs', 'e1'), exportLog('e1')));
    await assertSucceeds(setDoc(doc(staffDb(), 'action_logs', 'e1'), { ...exportLog('e1'), created_at: serverTimestamp() }));
    await assertFails(updateDoc(doc(staffDb(), 'action_logs', 'e1'), { note: '書き換え' }));
    await assertFails(deleteDoc(doc(staffDb(), 'action_logs', 'e1')));
  });

  it('is_test=true にはできない。未ログイン・別アカウントは作れない', async () => {
    await assertFails(setDoc(doc(staffDb(), 'action_logs', 'e2'), exportLog('e2', { is_test: true })));
    await assertFails(setDoc(doc(otherDb(), 'action_logs', 'e3'), exportLog('e3')));
    await assertFails(setDoc(doc(anonDb(), 'action_logs', 'e4'), exportLog('e4')));
  });
});

describe('セットの販売上限と施策ログ（D-30）', () => {
  const limitLog = (id: string, before: number, after: number, extra: Record<string, unknown> = {}) => ({
    log_id: id,
    timestamp: '2026-11-03T13:00:00+09:00',
    log_type: 'set_limit_change',
    note: `セットの販売上限を変更した（${before}→${after}）`,
    register_id: 'reg_1',
    device_id: 'dev_a1b2',
    is_test: false,
    ...extra,
  });

  /** アプリと同じ形のバッチ（settings の上限 + 記録） */
  const limitBatch = (db: TestDb, limit: unknown, logId: string, log: Record<string, unknown> = limitLog(logId, 100, Number(limit))) => {
    const b = writeBatch(db as unknown as Firestore);
    b.set(doc(db, 'settings', 'current'), { set_limit: limit, set_limit_log_id: logId }, { merge: true });
    b.set(doc(db, 'action_logs', logId), log);
    return b.commit();
  };

  beforeEach(async () => {
    // 本番と同じく、上限を一度も保存していない settings（既定の100として扱う）
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'settings', 'current'), { test_mode: false, prices: { set: 500 } });
    });
  });

  it('変更と記録を同じバッチで書けば通る（0〜100）', async () => {
    await assertSucceeds(limitBatch(staffDb(), 40, 'l1'));
    await assertSucceeds(limitBatch(staffDb(), 0, 'l2', limitLog('l2', 40, 0)));
    await assertSucceeds(limitBatch(staffDb(), 100, 'l3', limitLog('l3', 0, 100)));
  });

  it('範囲外・整数でない上限は保存できない', async () => {
    await assertFails(limitBatch(staffDb(), 101, 'b1'));
    await assertFails(limitBatch(staffDb(), -1, 'b2'));
    await assertFails(limitBatch(staffDb(), 1.5, 'b3'));
    await assertFails(limitBatch(staffDb(), '50', 'b4'));
  });

  it('記録なしで上限だけ変えることはできない。既存の記録の使い回しも不可', async () => {
    await assertFails(setDoc(doc(staffDb(), 'settings', 'current'), { set_limit: 50 }, { merge: true }));
    await assertFails(setDoc(doc(staffDb(), 'settings', 'current'), { set_limit: 50, set_limit_log_id: 'none' }, { merge: true }));
    await assertSucceeds(limitBatch(staffDb(), 50, 'r1'));
    await assertFails(setDoc(doc(staffDb(), 'settings', 'current'), { set_limit: 60, set_limit_log_id: 'r1' }, { merge: true }));
  });

  it('変更なしで記録だけ作ることはできない。is_test=true にもできない', async () => {
    await assertFails(setDoc(doc(staffDb(), 'action_logs', 'x1'), limitLog('x1', 100, 50)));
    await assertFails(limitBatch(staffDb(), 50, 'x2', limitLog('x2', 100, 50, { is_test: true })));
  });

  it('上限を変えない設定の保存（価格など）は記録なしで通る', async () => {
    await assertSucceeds(limitBatch(staffDb(), 30, 'p1'));
    await assertSucceeds(setDoc(doc(staffDb(), 'settings', 'current'), { prices: { set: 600 } }, { merge: true }));
  });

  it('オフラインの2台が同じ元の値から変えても、両方届く（変更前の値はルールで照合しない）', async () => {
    await assertSucceeds(limitBatch(staffDb(), 80, 'a1', limitLog('a1', 100, 80)));
    await assertSucceeds(limitBatch(staffDb(), 90, 'b1', limitLog('b1', 100, 90)));
  });

  it('オフライン復帰時の再送（同じ内容の上書き）は通る', async () => {
    await assertSucceeds(limitBatch(staffDb(), 70, 'o1'));
    const db = staffDb();
    const b = writeBatch(db as unknown as Firestore);
    b.set(doc(db, 'settings', 'current'), { set_limit: 70, set_limit_log_id: 'o1', updated_at: serverTimestamp() }, { merge: true });
    b.set(doc(db, 'action_logs', 'o1'), { ...limitLog('o1', 100, 70), created_at: serverTimestamp() });
    await assertSucceeds(b.commit());
  });
});
