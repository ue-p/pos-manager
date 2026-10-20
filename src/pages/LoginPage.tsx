import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { auth, SHARED_ACCOUNT_EMAIL, usingEmulator } from '../lib/firebase';

// F-10：部員共通アカウントでログイン（新規登録画面は作らない。D-16）
export function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState(SHARED_ACCOUNT_EMAIL);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate(from, { replace: true });
    } catch (err) {
      console.error(err);
      setError(navigator.onLine ? 'メールアドレスかパスワードが違います' : '初回のログインには通信が必要です');
    } finally {
      setBusy(false);
    }
  };

  const createDevAccount = async () => {
    setBusy(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(`作成できませんでした：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <h1>学祭シールPOS</h1>
        <p className="muted">部員共通アカウントでログインしてください</p>
        <label className="field">
          <span>メールアドレス</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn--primary btn--lg" disabled={busy}>
          ログイン
        </button>
        {usingEmulator && (
          <div className="dev-box">
            <p>開発モード（Emulator 接続中）。初回はアカウントを作ってください（パスワード6文字以上）。</p>
            <button type="button" className="btn" disabled={busy || password.length < 6} onClick={createDevAccount}>
              このメールとパスワードで開発用アカウントを作成
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
