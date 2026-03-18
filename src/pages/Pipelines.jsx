import React from "react";
import AirflowSection from "../components/reports/AirflowSection";

export default function Pipelines() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800">Data Pipelines</h1>
        <p className="text-slate-400 text-sm mt-1">Manage and monitor your ETL pipelines via Airflow</p>
      </div>
      <AirflowSection />
    </div>
  );
}