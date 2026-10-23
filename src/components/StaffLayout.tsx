import { useEffect } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { onWriteError } from '../data/repo';
import { PosDataProvider, usePos } from '../data/PosDataProvider';
import { useAuth } from '../lib/auth';
import { CashierPicker } from './CashierPicker';
import { StatusBar } from './StatusBar';
import { ToastProvider, useToast } from './Toast';

/** ログインが必要な画面の共通枠：状態バー、テストモード帯、ナビ */
export function StaffLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center-message">読み込み中…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <ToastProvider>
      <PosDataProvider>
        <StaffChrome />
      </PosDataProvider>
    </ToastProvider>
  );
}

function StaffChrome() {
  const { settings } = usePos();
  const toast = useToast();

  useEffect(() => onWriteError((msg) => toast(msg, 'error')), [toast]);

  return (
    <div className="staff">
      {settings.test_mode && (
        <div className="test-banner" role="alert">
          テストモード中 ― この入力は集計・在庫から除外されます
        </div>
      )}
      <header className="staff-header">
        <nav className="staff-nav">
          <NavLink to="/" end>
            レジ
          </NavLink>
          <NavLink to="/dashboard">ダッシュボード</NavLink>
          <NavLink to="/settings">設定・出力</NavLink>
        </nav>
        <div className="staff-header-right">
          <CashierPicker />
          <StatusBar />
        </div>
      </header>
      <main className="staff-main">
        <Outlet />
      </main>
    </div>
  );
}
