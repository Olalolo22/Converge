// ── Polyfills — must be first, before any Solana/React imports ──
import { Buffer } from 'buffer';
window.Buffer = Buffer;
(globalThis as any).Buffer = Buffer;

// Ensure process is defined for packages that reference it
if (!(globalThis as any).process) {
  (globalThis as any).process = { env: {}, version: '', browser: true };
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
