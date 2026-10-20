import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StaffLayout } from './components/StaffLayout';
import { AuthProvider } from './lib/auth';
import { DashboardPage } from './pages/DashboardPage';
import { DisplayPage } from './pages/DisplayPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SettingsPage } from './pages/SettingsPage';

// D-02：スタッフ入力画面以外も独立したURLで開ける
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/display" element={<DisplayPage />} />
          <Route element={<StaffLayout />}>
            <Route path="/" element={<RegisterPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
