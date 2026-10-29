// Firestore への書き込み。UI から直接 Firestore を呼ばない。
// オフライン中は Promise がサーバー到達まで解決しないため、呼び出し側は await しない（D-11）。
import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toLocalIsoString } from '../domain/time';
import type { ActionLog, Cashier, RegisterClosing, Settings, Transaction, VrVisit } from '../domain/types';

type ErrorListener = (message: string) => void;
const errorListeners = new Set<ErrorListener>();

export function onWriteError(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

/** 書き込みを投げっぱなしにし、失敗だけ拾って知らせる */
function fireAndForget(what: string, p: Promise<unknown>): void {
  p.catch((err: unknown) => {
    console.error(`[write] ${what}`, err);
    const msg = err instanceof Error ? err.message : String(err);
    errorListeners.forEach((l) => l(`${what}の保存に失敗しました：${msg}`));
  });
}

export function saveTransaction(t: Transaction): void {
  fireAndForget('会計', setDoc(doc(db, 'transactions', t.transaction_id), { ...t, created_at: serverTimestamp() }));
}

/** 取消は is_void と voided_at だけを更新する（D-05） */
export function voidTransaction(transactionId: string): void {
  fireAndForget(
    '取消',
    updateDoc(doc(db, 'transactions', transactionId), { is_void: true, voided_at: toLocalIsoString(new Date()) }),
  );
}

export function saveVrVisit(v: VrVisit): void {
  fireAndForget('VR体験', setDoc(doc(db, 'vr_visits', v.visit_id), { ...v, created_at: serverTimestamp() }));
}

export function voidVrVisit(visitId: string): void {
  fireAndForget(
    'VR体験の取消',
    updateDoc(doc(db, 'vr_visits', visitId), { is_void: true, voided_at: toLocalIsoString(new Date()) }),
  );
}

export function saveActionLog(l: ActionLog): void {
  fireAndForget('施策ログ', setDoc(doc(db, 'action_logs', l.log_id), { ...l, created_at: serverTimestamp() }));
}

/** 担当者の登録（D-27）。名前は呼び名・イニシャル */
export function saveCashier(c: Cashier): void {
  fireAndForget(
    '担当者',
    setDoc(doc(db, 'cashiers', c.cashier_id), { ...c, created_at: serverTimestamp(), updated_at: serverTimestamp() }),
  );
}

/** 担当者の名前・有効／無効の変更。削除はしない */
export function updateCashier(cashierId: string, patch: Partial<Pick<Cashier, 'name' | 'active'>>): void {
  fireAndForget('担当者', updateDoc(doc(db, 'cashiers', cashierId), { ...patch, updated_at: serverTimestamp() }));
}

export function saveRegisterClosing(c: RegisterClosing): void {
  fireAndForget('レジ締め', setDoc(doc(db, 'register_closings', c.closing_id), { ...c, created_at: serverTimestamp() }));
}

/** 設定の保存。test_mode は setTestMode()、set_limit は setSetLimit() でだけ変える（記録と一緒に書くため） */
export function saveSettings(patch: Partial<Omit<Settings, 'test_mode' | 'set_limit'>>): void {
  fireAndForget('設定', setDoc(doc(db, 'settings', 'current'), { ...patch, updated_at: serverTimestamp() }, { merge: true }));
}

/**
 * テストモードの切替と、その施策ログを1つのバッチで書く（D-24）。
 * バッチは端末内でもサーバーでも全部反映か全部失敗のどちらかになり、オフライン中も一緒に保存・送信される。
 * settings.test_mode_log_id で記録を指し、ルール側でも片方だけの書き込みを拒否する。
 */
export function setTestMode(on: boolean, log: ActionLog): void {
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'settings', 'current'),
    { test_mode: on, test_mode_log_id: log.log_id, updated_at: serverTimestamp() },
    { merge: true },
  );
  batch.set(doc(db, 'action_logs', log.log_id), { ...log, created_at: serverTimestamp() });
  fireAndForget('テストモードの切替', batch.commit());
}

/**
 * セットの販売上限の変更と、その施策ログを1つのバッチで書く（D-30。テストモードの切替 D-24 と同じ形）。
 * settings.set_limit_log_id で記録を指し、ルール側でも片方だけの書き込みを拒否する。
 */
export function setSetLimit(limit: number, log: ActionLog): void {
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'settings', 'current'),
    { set_limit: limit, set_limit_log_id: log.log_id, updated_at: serverTimestamp() },
    { merge: true },
  );
  batch.set(doc(db, 'action_logs', log.log_id), { ...log, created_at: serverTimestamp() });
  fireAndForget('セットの販売上限', batch.commit());
}
