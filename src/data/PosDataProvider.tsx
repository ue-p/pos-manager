// ログイン後の画面で使うデータの購読（D-11）。コレクション全体を購読し、未送信件数と通信状態を出す
import { collection, doc, onSnapshot, type DocumentData, type QuerySnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type ActionLog, type RegisterClosing, type Settings, type Transaction, type VrVisit } from '../domain/types';
import { getDeviceId, getRegisterId, setRegisterId as persistRegisterId } from '../lib/device';
import { db } from '../lib/firebase';

interface CollectionState<T> {
  docs: T[];
  pending: number;
  fromCache: boolean;
}

export interface PosData {
  transactions: Transaction[];
  vrVisits: VrVisit[];
  actionLogs: ActionLog[];
  registerClosings: RegisterClosing[];
  settings: Settings;
  /** サーバーまたはキャッシュから設定を読めたか（未保存なら false で既定値を使う） */
  settingsStored: boolean;
  pendingCount: number;
  online: boolean;
  deviceId: string;
  registerId: string;
  setRegisterId: (id: string) => void;
}

const PosDataContext = createContext<PosData | null>(null);

function useCollection<T>(name: string): CollectionState<T> {
  const [state, setState] = useState<CollectionState<T>>({ docs: [], pending: 0, fromCache: true });
  useEffect(() => {
    return onSnapshot(
      collection(db, name),
      { includeMetadataChanges: true },
      (snap: QuerySnapshot<DocumentData>) => {
        setState({
          docs: snap.docs.map((d) => d.data() as T),
          pending: snap.docs.filter((d) => d.metadata.hasPendingWrites).length,
          fromCache: snap.metadata.fromCache,
        });
      },
      (err) => console.error(`[subscribe] ${name}`, err),
    );
  }, [name]);
  return state;
}

function useNavigatorOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function PosDataProvider({ children }: { children: ReactNode }) {
  const transactions = useCollection<Transaction>('transactions');
  const vrVisits = useCollection<VrVisit>('vr_visits');
  const actionLogs = useCollection<ActionLog>('action_logs');
  const registerClosings = useCollection<RegisterClosing>('register_closings');
  const navOnline = useNavigatorOnline();
  const [settingsState, setSettingsState] = useState<{ settings: Settings; stored: boolean; pending: boolean }>({
    settings: DEFAULT_SETTINGS,
    stored: false,
    pending: false,
  });
  const [registerId, setRegisterIdState] = useState(getRegisterId);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'settings', 'current'),
      { includeMetadataChanges: true },
      (snap) => {
        const data = snap.data() as Partial<Settings> | undefined;
        setSettingsState({
          settings: {
            ...DEFAULT_SETTINGS,
            ...data,
            prices: { ...DEFAULT_SETTINGS.prices, ...data?.prices },
            initial_stock: { ...DEFAULT_SETTINGS.initial_stock, ...data?.initial_stock },
          },
          stored: snap.exists(),
          pending: snap.metadata.hasPendingWrites,
        });
      },
      (err) => console.error('[subscribe] settings', err),
    );
  }, []);

  const value = useMemo<PosData>(
    () => ({
      transactions: transactions.docs,
      vrVisits: vrVisits.docs,
      actionLogs: actionLogs.docs,
      registerClosings: registerClosings.docs,
      settings: settingsState.settings,
      settingsStored: settingsState.stored,
      pendingCount:
        transactions.pending +
        vrVisits.pending +
        actionLogs.pending +
        registerClosings.pending +
        (settingsState.pending ? 1 : 0),
      online: navOnline && !transactions.fromCache,
      deviceId: getDeviceId(),
      registerId,
      setRegisterId: (id: string) => {
        persistRegisterId(id);
        setRegisterIdState(id);
      },
    }),
    [transactions, vrVisits, actionLogs, registerClosings, settingsState, navOnline, registerId],
  );

  return <PosDataContext.Provider value={value}>{children}</PosDataContext.Provider>;
}

export function usePos(): PosData {
  const v = useContext(PosDataContext);
  if (!v) throw new Error('usePos は PosDataProvider の内側で使う');
  return v;
}
