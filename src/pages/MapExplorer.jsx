import React from "react";
import MapView from "@/components/map/MapView";

export default function MapExplorer() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Map Explorer</h1>
        <p className="text-sm text-slate-500 mt-1">
          View all enterprises and addresses with coordinates on an interactive map
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <MapView />
      </div>
    </div>
  );
}