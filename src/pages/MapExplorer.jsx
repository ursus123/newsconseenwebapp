import React from "react";
import MapView from "@/components/map/MapView";

export default function MapExplorer() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Spatial Intelligence</h1>
        <p className="text-sm text-slate-500 mt-1">
          Pins · Clusters · Density heatmaps · Territory boundaries — powered by PostGIS
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <MapView />
      </div>
    </div>
  );
}