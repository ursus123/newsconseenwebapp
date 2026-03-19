import React from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, AlertTriangle, Home, Bug } from "lucide-react";

function ErrorFallback({ error, errorInfo, pageName, reported, reporting, onRetry, onGoHome, isTopLevel }) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const content = (
    <div className="max-w-md w-full text-center space-y-6">
      <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto">
        <AlertTriangle className="w-10 h-10 text-rose-400" />
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-800">Something went wrong</h2>
        <p className="text-slate-400 text-sm mt-2">
          {pageName
            ? `The ${pageName} page ran into an unexpected error.`
            : "This page ran into an unexpected error."}
        </p>
      </div>

      {error?.message && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-left">
          <p className="text-xs font-mono text-slate-500 break-all line-clamp-3">{error.message}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
        <button
          onClick={onGoHome}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-medium text-sm transition-colors"
        >
          <Home className="w-4 h-4" />
          Go to Dashboard
        </button>
      </div>

      <div className="text-xs text-slate-400">
        {reporting && (
          <p className="flex items-center justify-center gap-1.5">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Reporting error automatically...
          </p>
        )}
        {reported && !reporting && (
          <p className="flex items-center justify-center gap-1.5 text-emerald-600">
            ✅ Error has been reported to your admin
          </p>
        )}
      </div>

      <button
        onClick={() => setDetailsOpen((o) => !o)}
        className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mx-auto transition-colors"
      >
        <Bug className="w-3 h-3" />
        {detailsOpen ? "Hide" : "Show"} technical details
      </button>

      {detailsOpen && (
        <div className="bg-slate-900 rounded-xl p-4 text-left max-h-48 overflow-y-auto">
          <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all">
            {error?.stack || "No stack trace available"}
          </pre>
        </div>
      )}
    </div>
  );

  if (isTopLevel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        {content}
      </div>
    );
  }

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      {content}
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
          errorInfo={this.state.errorInfo}
          pageName={this.props.pageName}
          reported={this.state.reported}
          reporting={this.state.reporting}
          onRetry={() => this.handleRetry()}
          onGoHome={() => this.handleGoHome()}
          isTopLevel={this.props.isTopLevel}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;