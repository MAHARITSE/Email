import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Barrière d'erreur globale : affiche un message visible (français) avec les
 * détails de l'erreur au lieu d'un écran blanc, et permet de recharger l'app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur applicative non interceptée :', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const isDark = document.documentElement.classList.contains('dark');

    return (
      <div
        dir="auto"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: isDark ? '#05070A' : '#f8fafc',
          color: isDark ? '#e2e8f0' : '#0f172a',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: '100%',
            border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
            background: isDark ? '#0B0F17' : '#ffffff',
            borderRadius: 16,
            padding: 28,
            boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                display: 'inline-flex',
                height: 38,
                width: 38,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                background: 'rgba(239,68,68,0.12)',
                color: '#f87171',
                fontSize: 20,
              }}
            >
              ⚠
            </span>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
              Une erreur inattendue s'est produite
            </h1>
          </div>
          <p style={{ fontSize: 13, opacity: 0.75, marginTop: 0 }}>
            L'application n'a pas pu continuer à s'afficher. Vous pouvez tenter un rechargement —
            si le problème persiste, le message ci-dessous aide à identifier la cause.
          </p>
          <pre
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              background: isDark ? '#05070A' : '#f1f5f9',
              border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
              color: isDark ? '#fca5a5' : '#b91c1c',
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              maxHeight: 220,
              overflow: 'auto',
            }}
          >
            {this.state.error.message || String(this.state.error)}
            {this.state.error.stack ? `\n\n${this.state.error.stack.split('\n').slice(0, 6).join('\n')}` : ''}
          </pre>
          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: '#0891b2',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer',
              }}
            >
              Recharger l'application
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.clear();
                  localStorage.removeItem('gmail_app_theme');
                } catch {
                  /* ignore */
                }
                this.handleReload();
              }}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                background: 'transparent',
                color: 'inherit',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Réinitialiser et recharger
            </button>
          </div>
        </div>
      </div>
    );
  }
}
