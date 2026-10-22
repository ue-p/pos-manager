import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// デザイン案のプレビュー用：?palette=a|b|c で配色を切り替える（案が決まったら固定して、この処理は消す）
const PALETTES = ['a', 'b', 'c'];
const fromUrl = new URLSearchParams(window.location.search).get('palette');
let palette = 'a';
try {
  if (fromUrl && PALETTES.includes(fromUrl)) sessionStorage.setItem('pos.palette', fromUrl);
  palette = sessionStorage.getItem('pos.palette') ?? 'a';
} catch {
  palette = fromUrl && PALETTES.includes(fromUrl) ? fromUrl : 'a';
}
document.documentElement.dataset.palette = palette;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
