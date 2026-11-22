import React from 'react';
import ReactDOM from 'react-dom/client';
import { resolveAssetUrl } from './engine/utils/assetUrl';
import App from './App';
import './styles/index.css';

if (
  import.meta.env.PROD &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator
) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(resolveAssetUrl('sw.js'))
      .catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
