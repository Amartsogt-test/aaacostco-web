import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
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
                    {this.state.error && (
                        <pre style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '8px', fontSize: '12px', maxWidth: '90%', overflowX: 'auto', marginBottom: '24px' }}>
                            {this.state.error.toString()}
                            <br />
                            {this.state.errorInfo?.componentStack}
                        </pre>
                    )}
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
