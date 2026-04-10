import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
// Blueprint CSS — table + datetime only (no core reset to avoid Tailwind conflict)
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/table/lib/css/table.css";
import "@blueprintjs/datetime2/lib/css/blueprint-datetime2.css";

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
