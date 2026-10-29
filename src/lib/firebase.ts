import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const env = import.meta.env;

/**
 * 開発時は既定で Emulator に接続する（VITE_USE_EMULATOR=false で本番プロジェクトへ）。本番ビルドでは常に本番。
 * mode=e2e のビルド（Service Worker の E2E 用。vite build --mode e2e）も Emulator に接続する
 */
export const usingEmulator = (env.DEV || env.MODE === 'e2e') && env.VITE_USE_EMULATOR !== 'false';

const EMULATOR_PROJECT_ID = 'demo-gakusai-pos';

const config = usingEmulator
  ? { apiKey: 'demo-api-key', projectId: EMULATOR_PROJECT_ID, authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com` }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    };

/** 部員共通アカウント（firestore.rules の sharedEmail() と一致させる） */
export const SHARED_ACCOUNT_EMAIL: string = env.VITE_SHARED_ACCOUNT_EMAIL || 'staff@gakusai-pos.example';

export const app = initializeApp(config);

export const auth = getAuth(app);

// オフライン永続化（複数タブ対応）。会計はまず端末内に保存され、通信できるときに送られる
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (usingEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
