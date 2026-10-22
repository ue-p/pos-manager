import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTheme } from './lib/theme';
import './styles.css';

// 表示モード（ライト／ダーク）を描画の前に決めて、ちらつきを防ぐ（D-26）
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
