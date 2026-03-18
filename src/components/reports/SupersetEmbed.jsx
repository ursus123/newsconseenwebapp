import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, BarChart2, CheckCircle2 } from "lucide-react";

const SUPERSET_URL = "https://superset-production-6eb0.up.railway.app";
const API_DOCS = "https://newsconseenwebapp-production.up.railway.app/docs";

export default function SupersetEmbed() {
  return (
    <Card className="border border-indigo-100 bg-indigo-50/40 rounded-2xl mb-8">
      <CardContent className="pt-6 pb-6 px-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
            <BarChart2 className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-indigo-900 mb-1">Advanced Analytics (Superset)</h3>
            <p className="text-sm text-indigo-700 mb-5">
              Superset is your business intelligence layer with advanced drill-down dashboards powered by your analytics database.
            </p>

            <div className="flex flex-wrap gap-2 mb-5">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => window.open(SUPERSET_URL, "_blank")}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Open Superset Dashboard
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                onClick={() => window.open(API_DOCS, "_blank")}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Open API Docs
              </Button>
            </div>

            <ul className="space-y-1.5">
              {[
                "Live charts and drill-down dashboards",
                "Connected to your analytics database",
                "Powered by Apache Superset",
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-indigo-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}