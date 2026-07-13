import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from '@/App.jsx'
import '@/index.css'
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/table/lib/css/table.css";
import "@blueprintjs/datetime2/lib/css/blueprint-datetime2.css";

// Error monitoring — no-op if VITE_SENTRY_DSN is unset (same convention as
// VITE_SUPERSET_URL in SupersetEmbed.jsx). company_id/user/page tags are set
// from Layout.jsx once the authenticated user and current page are known.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN || "";
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)