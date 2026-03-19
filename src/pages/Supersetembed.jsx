import React, { useState } from "react";
import { ExternalLink, BarChart3, RefreshCw, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const SUPERSET_URL = "https://superset-production-6eb0.up.railway.app";
const API_DOCS_URL = "https://newsconseenwebapp-production.up.railway.app/docs";

const FEATURES = [
  { icon: "✅", text: "Live charts and drill-down dashboards" },
  { icon: "✅", text: "Connected to your Railway analytics database" },
  { icon: "✅", text: "Powered by Apache Superset" },
  { icon: "✅", text: "Build custom dashboards from your data" },
];

const QUICK_LINKS = [
  { label: "Enterprise Summary Dashboard", path: "/superset/dashboard/1/" },
  { label: "Task Analytics", path: "/superset/dashboard/2/" },
  { label: "Transaction Reports", path: "/superset/dashboard/3/" },
  { label: "SQL Lab", path: "/superset/sqllab/" },
];

export default function SupersetEmbed() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border border-indigo-100 rounded-2xl mb-8 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 px-6 py-4 border-b border-indigo-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Advanced Analytics (Superset)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Business intelligence layer powered by Apache Superset
              </p>
            </div>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-indigo-100 text-slate-400 transition-colors"
          >
            {expanded
              ? <ChevronUp className="w-4 h-4" />
              : <ChevronDown className="w-4 h-4" />
            }
          </button>
        </div>
      </div>

      <CardContent className="p-6">
        {/* Feature list */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          {FEATURES.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
              <span>{f.icon}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Primary action buttons */}
        <div className="flex flex-wrap gap-3 mb-4">
          <Button
            onClick={() => window.open(SUPERSET_URL, "_blank")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            Open Superset Dashboard
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open(API_DOCS_URL, "_blank")}
            className="gap-2"
          >
            <BookOpen className="w-4 h-4" />
            Open API Docs
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Credentials hint */}
        <div className="bg-slate-50 rounded-xl px-4 py-3 mb-4">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Login:</span>{" "}
            admin / admin123 &nbsp;·&nbsp;
            <span className="font-semibold text-slate-700">Database:</span>{" "}
            PostgreSQL → analytics schema
          </p>
        </div>

        {/* Expandable quick links */}
        {expanded && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Quick Links
            </p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_LINKS.map((link) => (
                <button
                  key={link.path}
                  onClick={() => window.open(`${SUPERSET_URL}${link.path}`, "_blank")}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all text-left"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  {link.label}
                </button>
              ))}
            </div>

            {/* Analytics tables available */}
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-4">
              Analytics Tables Available
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                "enterprise_summary",
                "task_summary",
                "transaction_summary",
                "people_summary",
                "service_summary",
                "product_summary",
              ].map((table) => (
                <span
                  key={table}
                  className="text-[10px] px-2 py-1 bg-indigo-50 text-indigo-600 rounded-full font-mono border border-indigo-100"
                >
                  {table}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
