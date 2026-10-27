// Service Worker（D-28）：アプリの画面一式を端末に保存し、オフラインでも開けるようにする。
// 新しい版は自動では切り替えない。状態バーの［更新］を押したときか、次に開いたときに切り替える。
// 会計の途中（カートに商品・預かり金がある）は［更新］を押せないようにする
import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/** 新しい版を確認する間隔（開いたときにも確認する） */
const UPDATE_CHECK_MS = 10 * 60 * 1000;

let needRefresh = false;
let saleInProgress = false;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 起動時に1回呼ぶ。Service Worker が使えない環境（http の LAN 開発など）では何もしない */
export function initPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      emit();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        // オフライン中は確認しない（失敗するだけ）
        if (navigator.onLine) registration.update().catch(() => {});
      }, UPDATE_CHECK_MS);
    },
    onRegisterError(err) {
      console.warn('[pwa] Service Worker を登録できませんでした', err);
    },
  });
}

/** 新しい版が届いていて、［更新］を出すべきか */
export function useNeedRefresh(): boolean {
  return useSyncExternalStore(subscribe, () => needRefresh);
}

/** 会計の途中か（レジ画面が知らせる） */
export function setSaleInProgress(v: boolean): void {
  if (saleInProgress === v) return;
  saleInProgress = v;
  emit();
}

export function useSaleInProgress(): boolean {
  return useSyncExternalStore(subscribe, () => saleInProgress);
}

/** 新しい版に切り替えてページを読み込み直す（会計の途中では呼ばない） */
export function applyUpdate(): void {
  if (saleInProgress || !updateSW) return;
  void updateSW(true);
}

export const APP_VERSION = __APP_VERSION__;
