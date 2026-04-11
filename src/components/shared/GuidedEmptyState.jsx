import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";

const ENTITY_CONFIG = {
  Person: {
    icon: "👤",
    description: "People are the individuals your organization works with — staff, clients, patients, students, or volunteers.",
    example: "Example: add your first client, John Mwangi, as a Contact.",
  },
  Enterprise: {
    icon: "🏢",
    description: "Enterprises are organizations, companies, branches, or locations you track or work with.",
    example: "Example: add a partner clinic, school, or customer company.",
  },
  Task: {
    icon: "✅",
    description: "Tasks are any activity your team performs — calls, visits, follow-ups, or appointments.",
    example: "Example: 'Call John Mwangi on Monday to discuss renewal.'",
  },
  Transaction: {
    icon: "💰",
    description: "Transactions track money in and out — revenue, expenses, payroll, stock movements, and more.",
    example: "Example: record a service fee payment from a client.",
  },
  Product: {
    icon: "📦",
    description: "Products are items, inventory, equipment, services, or digital goods that you manage or sell.",
    example: "Example: add a medication, office supply, or service package.",
  },
  Service: {
    icon: "🔧",
    description: "Services are what your organization delivers — treatment programs, consulting packages, courses.",
    example: "Example: create a 'Monthly Cleaning' or 'Physiotherapy Session' service.",
  },
  default: {
    icon: "📂",
    description: "This list is empty. Start by adding your first record.",
    example: "Click the button below to get started.",
  },
};

export default function GuidedEmptyState({ entityName, onAdd, onImport, addLabel }) {
  const config = ENTITY_CONFIG[entityName] || ENTITY_CONFIG.default;
  const label = addLabel || entityName;

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="text-5xl mb-4">{config.icon}</div>
      <h3 className="text-lg font-semibold text-slate-700 mb-2">No {label}s yet</h3>
      <p className="text-sm text-slate-500 max-w-md mb-2">{config.description}</p>
      <p className="text-xs text-slate-400 italic max-w-sm mb-8">{config.example}</p>
      <div className="flex items-center gap-3">
        {onAdd && (
          <Button
            onClick={onAdd}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6 py-2.5 text-sm font-semibold shadow-md"
          >
            <Plus className="w-4 h-4 mr-2" /> Add your first {label}
          </Button>
        )}
        {onImport && (
          <Button variant="outline" onClick={onImport} className="rounded-xl px-5 py-2.5 text-sm">
            <Upload className="w-4 h-4 mr-2" /> Import from Excel
          </Button>
        )}
      </div>
    </div>
  );
}