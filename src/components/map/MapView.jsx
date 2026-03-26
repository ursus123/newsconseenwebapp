import React, { useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Building2, MapPin, Filter, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ENTITY_TYPES = [
  { value: "all", label: "All Locations" },
  { value: "enterprise", label: "Enterprises" },
  { value: "address", label: "Addresses" },
];

export default function MapView() {
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [selectedMarker, setSelectedMarker] = useState(null);

  // Fetch enterprises
  const { data: enterprises = [], isLoading: enterprisesLoading } = useQuery({
    queryKey: ["enterprises-map"],
    queryFn: () => base44.entities.Enterprise.list(),
  });

  // Fetch addresses
  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ["addresses-map"],
    queryFn: () => base44.entities.Address.list(),
  });

  // Combine and filter location data
  const mapData = useMemo(() => {
    const locations = [];

    if (selectedFilter === "all" || selectedFilter === "enterprise") {
      enterprises.forEach((e) => {
        if (e.latitude && e.longitude) {
          locations.push({
            id: `enterprise-${e.id}`,
            type: "enterprise",
            name: e.enterprise_name || "Unnamed Enterprise",
            latitude: parseFloat(e.latitude),
            longitude: parseFloat(e.longitude),
            entity: e,
            icon: "🏢",
          });
        }
      });
    }

    if (selectedFilter === "all" || selectedFilter === "address") {
      addresses.forEach((a) => {
        if (a.latitude && a.longitude) {
          locations.push({
            id: `address-${a.id}`,
            type: "address",
            name: a.label || a.address_line1 || "Unnamed Address",
            latitude: parseFloat(a.latitude),
            longitude: parseFloat(a.longitude),
            entity: a,
            icon: "📍",
          });
        }
      });
    }

    return locations;
  }, [enterprises, addresses, selectedFilter]);

  const isLoading = enterprisesLoading || addressesLoading;

  // Default center (world view)
  const center = mapData.length > 0
    ? [
        mapData.reduce((sum, l) => sum + l.latitude, 0) / mapData.length,
        mapData.reduce((sum, l) => sum + l.longitude, 0) / mapData.length,
      ]
    : [20, 0];

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-slate-800">Location Map</h2>
            {mapData.length > 0 && (
              <Badge className="bg-emerald-100 text-emerald-700 ml-2">
                {mapData.length} location{mapData.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400" />
          {ENTITY_TYPES.map((ft) => (
            <button
              key={ft.value}
              onClick={() => setSelectedFilter(ft.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border
                ${
                  selectedFilter === ft.value
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
                }`}
            >
              {ft.label}
            </button>
          ))}
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-40 rounded-b-xl">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
              <p className="text-sm text-slate-500">Loading locations...</p>
            </div>
          </div>
        )}

        {mapData.length === 0 && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 rounded-b-xl">
            <div className="text-center">
              <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">
                No locations with coordinates found.
              </p>
              <p className="text-slate-400 text-xs mt-1">
                Add latitude and longitude to enterprises or addresses to display them here.
              </p>
            </div>
          </div>
        )}

        {mapData.length > 0 && (
          <MapContainer center={center} zoom={4} className="h-full w-full">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
            {mapData.map((location) => (
              <Marker
                key={location.id}
                position={[location.latitude, location.longitude]}
                eventHandlers={{
                  click: () => setSelectedMarker(location),
                }}
              >
                {selectedMarker?.id === location.id && (
                  <Popup onClose={() => setSelectedMarker(null)}>
                    <LocationPopup location={location} />
                  </Popup>
                )}
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}

// Quick summary popup component
function LocationPopup({ location }) {
  const isEnterprise = location.type === "enterprise";
  const entity = location.entity;

  return (
    <div className="w-64 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{location.name}</p>
          <Badge variant="outline" className="mt-1">
            {isEnterprise ? "Enterprise" : "Address"}
          </Badge>
        </div>
      </div>

      {isEnterprise ? (
        <div className="space-y-1 text-xs text-slate-600">
          {entity.enterprise_type && (
            <p>
              <span className="font-medium">Type:</span> {entity.enterprise_type}
            </p>
          )}
          {entity.phone && (
            <p>
              <span className="font-medium">Phone:</span> {entity.phone}
            </p>
          )}
          {entity.email && (
            <p>
              <span className="font-medium">Email:</span> {entity.email}
            </p>
          )}
          {entity.city && (
            <p>
              <span className="font-medium">City:</span> {entity.city}
            </p>
          )}
          {entity.status && (
            <p>
              <span className="font-medium">Status:</span> {entity.status}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1 text-xs text-slate-600">
          {entity.address_line1 && (
            <p>
              <span className="font-medium">Address:</span> {entity.address_line1}
            </p>
          )}
          {entity.city && (
            <p>
              <span className="font-medium">City:</span> {entity.city}
            </p>
          )}
          {entity.country && (
            <p>
              <span className="font-medium">Country:</span> {entity.country}
            </p>
          )}
          {entity.linked_people?.length > 0 && (
            <p>
              <span className="font-medium">People:</span>{" "}
              {entity.linked_people.length}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <p className="text-[10px] text-slate-400">
          {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
        </p>
      </div>
    </div>
  );
}