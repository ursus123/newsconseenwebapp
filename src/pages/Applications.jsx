import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Search, LayoutGrid, Layers, Users, Building2, Package, CheckSquare, Receipt, Link2, MapPin, Zap, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { APP_REGISTRY, CATEGORIES, PLAN_ORDER, APPS_BY_ENTERPRISE_CATEGORY } from "@/components/applications/appRegistry";
import { getCategoryFromType } from "@/config/enterpriseTerminology";
import AppCard from "@/components/applications/AppCard";
import ComingSoonModal from "@/components/applications/ComingSoonModal";
import RecentlyUsed from "@/components/applications/RecentlyUsed";
import UpgradeModal from "@/components/shared/UpgradeModal";

// Ontology object type icons — apps are "built on" these objects
const ONTOLOGY_TYPES = [
  { key: "Person",       icon: Users,       color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200"   },
  { key: "Enterprise",   icon: Building2,   color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200"  },
  { key: "Product",      icon: Package,     color: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-200"   },
  { key: "Task",         icon: CheckSquare, color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-200" },
  { key: "Transaction",  icon: Receipt,     color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200"},
  { key: "Relationship", icon: Link2,       color: "text-indigo-600",  bg: "bg-indigo-50",  border: "border-indigo-200" },
  { key: "Address",      icon: MapPin,      color: "text-teal-600",    bg: "bg-teal-50",    border: "border-teal-200"   },
];
const ONTOLOGY_MAP = Object.fromEntries(ONTOLOGY_TYPES.map(t => [t.key, t]));

// Ontology object type annotations per app (which objects each app reads/writes)
const APP_ONTOLOGY = {
  "staff-schedule":      ["Person", "Task", "Enterprise"],
  "clock-in-out":        ["Person", "Task"],
  "attendance":          ["Person", "Task", "Enterprise"],
  "attendance-register": ["Person", "Task", "Enterprise"],
  "med-admin":           ["Person", "Product", "Task"],
  "stock-counter":       ["Product"],
  "barcode-scanner":     ["Product", "Transaction"],
  "client-onboarding":   ["Person", "Relationship", "Enterprise"],
  "add-client":          ["Person", "Relationship"],
  "map-explorer":        ["Address", "Enterprise", "Person"],
  "data-repair":         ["Person", "Enterprise", "Product", "Task", "Transaction"],
  "reports":             ["Person", "Enterprise", "Product", "Task", "Transaction"],
  "query-builder":       ["Person", "Enterprise", "Product", "Task", "Transaction", "Relationship", "Address"],
  "copilot":             ["Person", "Enterprise", "Task", "Transaction"],
  "alerts":              ["Person", "Enterprise", "Task", "Transaction"],
  "connectors":          ["Person", "Enterprise", "Product", "Transaction"],
  "ml-models":           ["Person", "Task", "Transaction", "Product"],
  "pipelines":           ["Person", "Enterprise", "Product", "Task", "Transaction", "Relationship", "Address"],
  "pdf-excel":           ["Person", "Enterprise", "Transaction"],
};

function OntologyObjectBadge({ typeKey }) {
  const t = ONTOLOGY_MAP[typeKey];
  if (!t) return null;
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${t.bg} ${t.color} border ${t.border}`}>
      <Icon className="w-2 h-2" />{typeKey}
    </span>
  );
}

const RECENTLY_USED_KEY = (email) => `recently_used_apps_${email}`;
const MAX_RECENT = 4;

function saveRecentApp(email, appId) {
  if (!email) return;
  const key = RECENTLY_USED_KEY(email);
  const existing = JSON.parse(localStorage.getItem(key) || "[]");
  const updated = [appId, ...existing.filter((id) => id !== appId)].slice(0, MAX_RECENT);
  localStorage.setItem(key, JSON.stringify(updated));
}

function getRecentApps(email) {
  if (!email) return [];
  const key = RECENTLY_USED_KEY(email);
  return JSON.parse(localStorage.getItem(key) || "[]");
}

export default function Applications() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [comingSoonApp, setComingSoonApp] = useState(null);
  const [upgradeApp, setUpgradeApp] = useState(null);
  const [recentIds, setRecentIds] = useState([]);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      setRecentIds(getRecentApps(u?.email));
    }).catch(() => {});
  }, []);

  // Load enterprise to determine industry
  const { data: enterprises = [] } = useQuery({
    queryKey: ["enterprise_for_apps", user?.company_id],
    queryFn: () => base44.entities.Enterprise.filter({ enterprise_name: user.company_id }),
    enabled: !!user?.company_id && user?.role !== "super_admin",
  });
  const enterprise = enterprises[0];
  const industry = enterprise?.enterprise_type || "";
  const enterpriseCategory = getCategoryFromType(industry);
  const recommendedIds = APPS_BY_ENTERPRISE_CATEGORY[enterpriseCategory] || [];

  const isEducation = industry === "education";
  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = user?.role === "admin" || isSuperAdmin;

  // Determine current plan tier
  const planTier = isSuperAdmin ? "consultant" : (enterprise?.subscription_tier || "starter");

  // Filter visible apps
  const visibleApps = useMemo(() => {
    return APP_REGISTRY.filter((app) => {
      // Education-only apps
      if (app.educationOnly && !isEducation && !isSuperAdmin) return false;
      // Admin-only apps
      if (app.roles === "admin_only" && !isAdmin) return false;
      return true;
    });
  }, [isAdmin, isEducation, isSuperAdmin]);

  // Industry-based category ordering
  const orderedCategories = useMemo(() => {
    const cats = CATEGORIES.filter((c) => {
      if (c === "Education" && !isEducation && !isSuperAdmin) return false;
      return true;
    });
    // Reorder based on industry
    const priority = [];
    if (industry === "healthcare" || industry === "other") priority.push("Healthcare");
    if (industry === "retail" || industry === "logistics") priority.push("Inventory");
    const rest = cats.filter((c) => c !== "All" && !priority.includes(c));
    return ["All", ...priority, ...rest.filter((c) => !priority.includes(c))];
  }, [industry, isEducation, isSuperAdmin]);

  // Filtered apps for display
  const filteredApps = useMemo(() => {
    return visibleApps.filter((app) => {
      const matchCat = activeCategory === "All" || app.category === activeCategory;
      const matchSearch = !search || app.name.toLowerCase().includes(search.toLowerCase()) || app.category.toLowerCase().includes(search.toLowerCase()) || app.description.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [visibleApps, activeCategory, search]);

  // Group by category for section headers
  const groupedByCategory = useMemo(() => {
    if (activeCategory !== "All" || search) return null;
    const groups = {};
    orderedCategories.filter((c) => c !== "All").forEach((cat) => {
      const apps = filteredApps.filter((a) => a.category === cat);
      if (apps.length > 0) groups[cat] = apps;
    });
    return groups;
  }, [filteredApps, activeCategory, search, orderedCategories]);

  const recentApps = useMemo(() => {
    return recentIds.map((id) => visibleApps.find((a) => a.id === id)).filter(Boolean);
  }, [recentIds, visibleApps]);

  const isLocked = (app) => {
    if (isSuperAdmin) return false;
    return PLAN_ORDER[app.plan] > PLAN_ORDER[planTier];
  };

  const handleLaunch = (app) => {
    if (!app.exists) {
      setComingSoonApp(app);
      return;
    }
    saveRecentApp(user?.email, app.id);
    setRecentIds(getRecentApps(user?.email));
    navigate(createPageUrl(app.route));
  };

  const handleCardClick = (app) => {
    if (isLocked(app)) {
      setUpgradeApp(app);
      return;
    }
    handleLaunch(app);
  };

  const categoryEmojis = { HR: "👥", Inventory: "📦", Healthcare: "🏥", Field: "🚀", Finance: "💼", Compliance: "📋", Education: "🎓" };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Applications</h1>
          <p className="text-sm text-slate-500 mt-0.5">Ontology-powered operational tools — every app is built on the universal object model</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <LayoutGrid className="w-4 h-4" />
          <span>{visibleApps.length} applications available</span>
        </div>
      </div>

      {/* Ontology foundation banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <Layers className="w-5 h-5 text-violet-400" />
          <span className="text-sm font-bold text-white">Universal Ontology</span>
          <span className="text-[10px] font-semibold text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">7 object types</span>
        </div>
        <div className="flex flex-wrap gap-1.5 flex-1">
          {ONTOLOGY_TYPES.map(t => {
            const Icon = t.icon;
            return (
              <span key={t.key} className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg ${t.bg} ${t.color} border ${t.border}`}>
                <Icon className="w-3 h-3" /> {t.key}
              </span>
            );
          })}
        </div>
        <button
          onClick={() => navigate(createPageUrl("ObjectExplorer"))}
          className="flex items-center gap-1.5 text-[11px] font-bold text-violet-300 hover:text-violet-200 transition-colors shrink-0"
        >
          <Search className="w-3.5 h-3.5" /> Explore Objects <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search apps by name or category..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {orderedCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat
                ? "bg-slate-800 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {cat !== "All" && categoryEmojis[cat] ? `${categoryEmojis[cat]} ` : ""}{cat}
          </button>
        ))}
      </div>

      {/* Recently Used */}
      {!search && activeCategory === "All" && (
        <RecentlyUsed apps={recentApps} onLaunch={handleCardClick} />
      )}

      {/* Recommended for your enterprise type */}
      {!search && activeCategory === "All" && recommendedIds.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">⭐</span>
            <h2 className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Recommended for you</h2>
            <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full font-medium capitalize">{enterpriseCategory}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {recommendedIds
              .map(id => visibleApps.find(a => a.id === id))
              .filter(Boolean)
              .map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  isLocked={isLocked(app)}
                  onLaunch={handleCardClick}
                  onUpgrade={() => setUpgradeApp(app)}
                />
              ))}
          </div>
        </div>
      )}

      {/* All Applications header when recommended shown */}
      {!search && activeCategory === "All" && recommendedIds.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📱</span>
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">All Applications</h2>
        </div>
      )}

      {/* Empty state */}
      {filteredApps.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <span className="text-4xl mb-3">🔍</span>
          <p className="font-medium text-slate-600">No apps found for "{search}"</p>
          <p className="text-sm mt-1">Try a different search term</p>
        </div>
      )}

      {/* Grouped by category (All view) */}
      {groupedByCategory && Object.keys(groupedByCategory).map((cat) => (
        <div key={cat} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">{categoryEmojis[cat]}</span>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{cat}</h2>
            <span className="text-xs text-slate-400 font-medium">({groupedByCategory[cat].length} app{groupedByCategory[cat].length !== 1 ? "s" : ""})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {groupedByCategory[cat].map((app) => (
              <AppCard
                key={app.id}
                app={app}
                isLocked={isLocked(app)}
                onLaunch={handleCardClick}
                onUpgrade={() => setUpgradeApp(app)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Flat grid (search or category filter active) */}
      {!groupedByCategory && filteredApps.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredApps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              isLocked={isLocked(app)}
              onLaunch={handleCardClick}
              onUpgrade={() => setUpgradeApp(app)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <ComingSoonModal
        app={comingSoonApp}
        userEmail={user?.email}
        onClose={() => setComingSoonApp(null)}
      />

      <UpgradeModal
        open={!!upgradeApp}
        onClose={() => setUpgradeApp(null)}
        reason={upgradeApp ? `${upgradeApp.name} requires the ${upgradeApp.plan} plan or higher.` : ""}
      />
    </div>
  );
}