import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    // eslint-disable-next-line no-unused-vars
    static getDerivedStateFromError(_error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Log to console only in development (drop_console removes in prod)
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    padding: '20px',
                    fontFamily: 'system-ui, sans-serif',
                    backgroundColor: '#f9fafb',
                    color: '#374151'
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>😔</div>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                        Алдаа гарлаа
                    </h1>
                    <p style={{ color: '#6b7280', marginBottom: '24px', textAlign: 'center' }}>
                        Уучлаарай, ямар нэг алдаа гарлаа. Хуудсаа дахин ачаална уу.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            backgroundColor: '#005da3',
                            color: 'white',
                            border: 'none',
                            padding: '12px 24px',
                            borderRadius: '8px',
                            fontSize: '16px',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Дахин ачаалах
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
