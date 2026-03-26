import React from "react";
import { base44 } from "@/api/base44Client";

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <p style={{ color: "#ef4444", marginBottom: 8, fontWeight: 600 }}>
        Something went wrong
      </p>
      <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 20 }}>
        {error?.message || "An unexpected error occurred"}
      </p>
      <button
        onClick={resetErrorBoundary}
        style={{
          padding: "8px 20px",
          background: "#1e293b",
          color: "white",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        Try again
      </button>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, reported: false, reporting: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // Log clearly for debugging
    console.group("🔴 React Error Caught");
    console.error("Error:", error.message);
    console.error("Component stack:", errorInfo.componentStack);
    console.groupEnd();

    this.reportError(error, errorInfo);
  }

  async reportError(error, errorInfo) {
    this.setState({ reporting: true });
    try {
      await base44.entities.Task.create({
        task_type: "other",
        title: `App Error: ${error?.message?.slice(0, 80) || "Unknown error"}`,
        priority: "high",
        status: "open",
        outcome_notes: JSON.stringify({
          error: error?.message,
          stack: error?.stack?.slice(0, 500),
          componentStack: errorInfo?.componentStack?.slice(0, 500),
          page: this.props.pageName || "unknown",
          url: window.location.href,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        }),
      });
      this.setState({ reported: true });
    } catch {
      // silently fail
    } finally {
      this.setState({ reporting: false });
    }
  }

  handleRetry() {
    this.setState({ hasError: false, error: null, errorInfo: null, reported: false });
  }

  handleGoHome() {
    window.location.href = "/";
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          resetErrorBoundary={() => this.handleRetry()}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;