import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ncClient } from "@/api/ncClient";
import { Plus, X, Check } from "lucide-react";

export default function ProfileSwitcher({
  profiles,
  currentProfileId,
  onSwitchProfile,
  onAddProfile,
  onDeleteProfile,
  isLight,
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("business");
  const [selectedEnterprise, setSelectedEnterprise] = useState("");

  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprises_for_profile"],
    queryFn: () => ncClient.entities.Enterprise.list(undefined, 100).catch(() => []),
  });

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAddProfile(newName, newType, selectedEnterprise || null);
    setNewName("");
    setNewType("business");
    setSelectedEnterprise("");
    setShowAddForm(false);
  };

  const typeLabels = {
    school: "🏫 School",
    business: "🏢 Business",
    ngo: "🤝 NGO",
    healthcare: "🏥 Healthcare",
    retail: "🛒 Retail",
    other: "📋 Other",
  };

  return (
    <div
      style={{
        background: isLight ? "rgba(255,255,255,0.97)" : "rgba(8,15,30,0.97)",
        border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
        backdropFilter: "blur(20px)",
        minWidth: 320,
        maxHeight: 400,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          borderBottom: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.08)",
          color: isLight ? "#374151" : "#94a3b8",
        }}
      >
        Profiles
      </div>

      {/* Profile list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {profiles.map((profile) => (
          <div key={profile.id}>
            <button
              onClick={() => onSwitchProfile(profile.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                background: currentProfileId === profile.id
                  ? isLight ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.15)"
                  : "none",
                border: "none",
                color: isLight ? "#1f2937" : "#f1f5f9",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
                borderBottom: isLight ? "1px solid rgba(0,0,0,0.04)" : "1px solid rgba(255,255,255,0.04)",
              }}
              onMouseEnter={(e) => {
                if (currentProfileId !== profile.id) {
                  e.currentTarget.style.background = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)";
                }
              }}
              onMouseLeave={(e) => {
                if (currentProfileId !== profile.id) {
                  e.currentTarget.style.background = "none";
                }
              }}
            >
              {currentProfileId === profile.id && (
                <Check style={{ width: 16, height: 16, color: "#10b981", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{profile.name}</div>
                <div style={{ fontSize: 11, color: isLight ? "#6b7280" : "#94a3b8" }}>
                  {typeLabels[profile.type] || profile.type}
                  {profile.enterpriseId && ` • ${profile.enterpriseId}`}
                </div>
              </div>
              {profiles.length > 1 && currentProfileId === profile.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProfile(profile.id);
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "none",
                    color: "#ef4444",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                  title="Delete profile"
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Add profile form */}
      {showAddForm && (
        <div
          style={{
            padding: 12,
            borderTop: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.08)",
            background: isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text"
              placeholder="Profile name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{
                padding: "6px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.15)",
                background: isLight ? "white" : "rgba(15, 23, 42, 0.8)",
                color: isLight ? "#000" : "#fff",
              }}
              autoFocus
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              style={{
                padding: "6px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.15)",
                background: isLight ? "white" : "rgba(15, 23, 42, 0.8)",
                color: isLight ? "#000" : "#fff",
              }}
            >
              {Object.entries(typeLabels).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <select
              value={selectedEnterprise}
              onChange={(e) => setSelectedEnterprise(e.target.value)}
              style={{
                padding: "6px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.15)",
                background: isLight ? "white" : "rgba(15, 23, 42, 0.8)",
                color: isLight ? "#000" : "#fff",
              }}
            >
              <option value="">No enterprise (optional)</option>
              {enterprises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.enterprise_name}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleAdd}
                style={{
                  flex: 1,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 4,
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Create
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                style={{
                  flex: 1,
                  padding: "6px 12px",
                  fontSize: 12,
                  borderRadius: 4,
                  background: isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
                  color: isLight ? "#000" : "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px 16px",
            background: "none",
            border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.1)",
            borderTop: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.08)",
            color: "#10b981",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
          }}
        >
          <Plus style={{ width: 14, height: 14 }} /> New Profile
        </button>
      )}
    </div>
  );
}