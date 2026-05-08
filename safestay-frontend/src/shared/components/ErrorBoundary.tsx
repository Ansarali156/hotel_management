import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary — prevents a single broken component from
 * white-screening the whole PWA (H33). Gives the user a clear recovery
 * path (reload or go home) instead of a silent blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  private handleReset = () => {
    this.setState({ error: null });
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f6f8',
        padding: '24px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          textAlign: 'center',
        }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#1B4332', marginBottom: '8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '14px', color: '#4a5568', marginBottom: '24px' }}>
            The app hit an unexpected error. Your data is safe — please reload or return to the home page.
          </p>
          <pre style={{
            background: '#f7fafc',
            padding: '12px',
            borderRadius: '6px',
            fontSize: '11px',
            textAlign: 'left',
            overflow: 'auto',
            maxHeight: '120px',
            color: '#718096',
            marginBottom: '24px',
          }}>
            {this.state.error.message}
          </pre>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={this.handleReload}
              style={{
                background: '#1B4332',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Reload
            </button>
            <button
              onClick={this.handleReset}
              style={{
                background: 'white',
                color: '#1B4332',
                border: '1px solid #1B4332',
                padding: '10px 20px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
