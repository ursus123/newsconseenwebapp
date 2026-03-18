import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, AlertCircle } from "lucide-react";

const SUPERSET_URL = "http://localhost:8089/superset/dashboard/1/?standalone=true";

export default function SupersetEmbed() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const iframeRef = useRef(null);

  const handleLoad = () => {
    setLoading(false);
    setError(false);
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
  };

  return (
    <Card className="border border-slate-100 rounded-2xl mb-8">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-bold text-slate-800">Live Analytics Dashboard</CardTitle>
        <Button size="sm" variant="outline" onClick={() => window.open(SUPERSET_URL, "_blank")}>
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
          Open Full Screen
        </Button>
      </CardHeader>
      <CardContent className="p-0 pb-0 rounded-b-2xl overflow-hidden">
        <div className="relative w-full" style={{ height: 800 }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">Loading analytics dashboard…</span>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
              <div className="flex flex-col items-center gap-3 text-center px-8">
                <AlertCircle className="w-8 h-8 text-rose-400" />
                <p className="text-sm text-slate-600 max-w-sm">
                  Analytics dashboard unavailable. Make sure the analytics service is running.
                </p>
                <Button size="sm" variant="outline" onClick={() => window.open(SUPERSET_URL, "_blank")}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Try Opening Directly
                </Button>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={SUPERSET_URL}
            width="100%"
            height="800"
            style={{ border: "none", display: "block" }}
            onLoad={handleLoad}
            onError={handleError}
            title="Superset Analytics Dashboard"
            allow="fullscreen"
          />
        </div>
      </CardContent>
    </Card>
  );
}