import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPwa } from './lib/pwa';
import { initTheme } from './lib/theme';
import './index.css';

// 表示モード（ライト／ダーク）を描画の前に決めて、ちらつきを防ぐ（D-26）
initTheme();
// 画面一式を端末に保存して、オフラインでも開けるようにする（D-28）
initPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
