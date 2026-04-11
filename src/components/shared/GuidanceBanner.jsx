import { useState } from "react";
import { X, Info } from "lucide-react";

const BANNERS = {
  People: "People are the individuals you work with — staff, clients, patients, or volunteers. Add them here and link them to Enterprises, Tasks, and Transactions to build a full activity history.",
  Enterprises: "Enterprises represent organizations, branches, or locations you interact with. Link people to enterprises to show who works or belongs where.",
  Tasks: "Tasks are any activity your team performs — calls, visits, follow-ups, appointments. Link them to a Contact or Account to track your full activity history.",
  Transactions: "Transactions record all financial activity — revenue, expenses, payroll, and stock movements. Post them to lock the record and keep your books clean.",
  Products: "Products are items, inventory, equipment, or services your organization manages. Track stock levels, expiry dates, and assignments from here.",
  Services: "Services define what your organization delivers to clients. Attach them to people, tasks, and transactions to measure service performance.",
  Addresses: "Addresses are physical locations linked to people or enterprises. Use them for mapping, routing, and location-based reporting.",
  Relationships: "Relationships connect your data — people to enterprises, items to people, services to clients. This is how you model your real-world operations.",
};

export default function GuidanceBanner({ page }) {
  const storageKey = `banner_dismissed_${page}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === "true");

  const text = BANNERS[page];
  if (!text || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(storageKey, "true");
    setDismissed(true);
  };

  return (
    <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5">
      <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
      <p className="text-sm text-blue-800 flex-1">{text}</p>
      <button onClick={handleDismiss} className="text-blue-400 hover:text-blue-600 transition-colors shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}