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
    environment: import.meta.env.VITE_APP_ENV || "development",
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          for (const key of Object.keys(event.request.headers)) {
            if (["authorization", "cookie", "x-api-key", "apikey"].includes(key.toLowerCase())) {
              event.request.headers[key] = "[Filtered]";
            }
          }
        }
      }
      delete event.user;
      return event;
    },
  });

  if ((import.meta.env.VITE_APP_ENV || "") === "staging") {
    window.__NEWSCONSEEN_CAPTURE_STAGING_ERROR__ = () => {
      const requestId = crypto.randomUUID();
      Sentry.withScope((scope) => {
        scope.setTag("controlled_test", "frontend");
        scope.setTag("request_id", requestId);
        scope.setContext("acceptance", { environment: "staging", tenant_safe: true });
        Sentry.captureException(new Error("Controlled staging frontend monitoring test"));
      });
      return requestId;
    };
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
