import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// Gracefully handle benign unhandled rejections and environment quirks
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (
    reason?.code === 'auth/popup-closed-by-user' ||
    reason?.code === 'auth/cancelled-popup-request' ||
    (typeof reason?.message === 'string' &&
      reason.message.includes('popup-closed-by-user'))
  ) {
    event.preventDefault();
  }
});

window.addEventListener('error', (event) => {
  if (
    typeof event.message === 'string' &&
    event.message.includes('Cannot set property fetch')
  ) {
    event.preventDefault();
  }
});

const rootEl = document.getElementById('root');

if (!rootEl) {
  document.body.innerHTML =
    '<p style="font-family:sans-serif;padding:24px">Erreur : élément racine #root introuvable.</p>';
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
