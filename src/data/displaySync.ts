// お客さん用画面への表示内容の送受信（D-10）
// 同じブラウザ：BroadcastChannel（オフラインでも動く）／別端末：display_state/{register_id}
// 送信の失敗はスタッフ入力画面に波及させない（握りつぶしてログだけ出す）
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import type { ItemCode, Prices, SaleLine } from '../domain/types';
import { db } from '../lib/firebase';

export interface DisplayState {
  register_id: string;
  mode: 'idle' | 'cart' | 'done';
  lines: Pick<SaleLine, 'item' | 'quantity' | 'unit_price' | 'amount'>[];
  total: number;
  received: number;
  change: number;
  /** 待機表示用の価格と売り切れ（お客さん用画面は settings を読めないため一緒に送る） */
  prices: Prices;
  /** シールの表示名（D-29。ログインなしで読めるが、名前は個人情報ではない） */
  labels: Record<ItemCode, string>;
  sold_out: ItemCode[];
  /** 残りが「残りわずか」の基準以下（1以上）の商品と、その残り数（D-30）。古い版のレジからのデータには無い */
  low_stock?: Partial<Record<ItemCode, number>>;
  is_test: boolean;
  updated_at_ms: number;
}

type Message = { type: 'state'; state: DisplayState } | { type: 'hello' };

const channelName = (registerId: string) => `pos-display:${registerId}`;

function openChannel(registerId: string): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName(registerId));
  } catch {
    return null;
  }
}

/** スタッフ入力画面側。send() は何度呼んでもよい（Firestore は300msに間引く） */
export function createDisplaySender(registerId: string) {
  const channel = openChannel(registerId);
  let latest: DisplayState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flushToFirestore = () => {
    timer = null;
    if (!latest) return;
    setDoc(doc(db, 'display_state', registerId), latest).catch((err) => console.warn('[display] Firestore送信失敗', err));
  };

  if (channel) {
    channel.onmessage = (e: MessageEvent<Message>) => {
      // 後から開いたお客さん用画面に現在の状態を返す
      if (e.data?.type === 'hello' && latest) channel.postMessage({ type: 'state', state: latest } satisfies Message);
    };
  }

  return {
    send(state: DisplayState) {
      latest = state;
      try {
        channel?.postMessage({ type: 'state', state } satisfies Message);
      } catch (err) {
        console.warn('[display] BroadcastChannel送信失敗', err);
      }
      if (!timer) timer = setTimeout(flushToFirestore, 300);
    },
    close() {
      if (timer) {
        clearTimeout(timer);
        flushToFirestore();
      }
      channel?.close();
    },
  };
}

/** お客さん用画面側。両方を購読し、updated_at_ms が新しい方を渡す */
export function subscribeDisplay(registerId: string, onState: (s: DisplayState) => void): () => void {
  let newest = 0;
  const accept = (s: DisplayState | undefined) => {
    if (!s || s.updated_at_ms <= newest) return;
    newest = s.updated_at_ms;
    onState(s);
  };

  const channel = openChannel(registerId);
  if (channel) {
    channel.onmessage = (e: MessageEvent<Message>) => {
      if (e.data?.type === 'state') accept(e.data.state);
    };
    channel.postMessage({ type: 'hello' } satisfies Message);
  }

  const unsub = onSnapshot(
    doc(db, 'display_state', registerId),
    (snap) => accept(snap.data() as DisplayState | undefined),
    (err) => console.warn('[display] 購読失敗', err),
  );

  return () => {
    unsub();
    channel?.close();
  };
}
