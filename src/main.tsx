import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext.tsx';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
