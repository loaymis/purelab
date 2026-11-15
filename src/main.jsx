import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { syncEngine } from './sync/engine.js';
import './lib/install.js'; // capture the PWA install prompt as early as possible
import { isDesktop } from './lib/platform.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);

syncEngine.start();

// Offline app shell for the mobile/web companion (needs a trusted HTTPS origin or localhost).
if (!isDesktop && 'serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}
