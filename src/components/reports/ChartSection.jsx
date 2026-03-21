import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { executeSQL } from "@/components/querybuilder/sqlEngine";
import ChartRenderer from "./ChartRenderer";

export default function ChartSection({ chart, height = 250 }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const sql = chart?.sql_query || chart?.sql;
    if (!sql) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    executeSQL(sql, {})
      .then((result) => {
        // Sanitize: flatten any object/array values to strings so React can render them
        const rows = (result.rows || []).map((row) => {
          const clean = {};
          Object.entries(row).forEach(([k, v]) => {
            clean[k] = v !== null && v !== undefined && typeof v === "object" ? JSON.stringify(v) : v;
          });
          return clean;
        });
        setData(rows);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [chart?.sql_query, chart?.sql]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center text-rose-400 text-xs" style={{ height }}>
        Error loading chart: {error}
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-slate-400 text-xs" style={{ height }}>
        No data available
      </div>
    );
  }

  return <ChartRenderer chart={chart} data={data} height={height} />;
}