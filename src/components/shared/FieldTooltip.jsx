import { useState } from "react";
import { HelpCircle } from "lucide-react";

const FIELD_TIPS = {
  person_type: "The category this person belongs to. 'Staff' = employee, 'Client' = customer/patient, 'Contact' = external person you interact with.",
  engagement_model: "How this person is engaged. 'Employed' = on payroll; 'Contracted' = third-party; 'Enrolled' = signed up for a service like a student or member.",
  enterprise_tier: "Where this enterprise sits in your hierarchy. 'Headquarters' is your main office; 'Branch' is a sub-location; 'Franchise' is a licensed operator.",
  item_class: "Special characteristics of this item. 'Perishable' = has expiry date; 'Serialized' = tracked individually; 'Controlled' = regulated (e.g., medication).",
  item_type: "The broad nature of this item. 'Physical' = tangible goods; 'Service Package' = bundled services; 'Digital' = software or licenses.",
  role_category: "Broad job family for reporting. Used to group staff by department type — e.g., 'Professional Licensed' covers doctors, lawyers, accountants.",
  ownership_type: "Who owns this enterprise. 'Privately owned' = not publicly traded; 'Government owned' = public sector; 'Family owned' = family-controlled.",
  legal_structure: "The legal form of the business. 'LLC' = limited liability company; 'Sole Proprietorship' = one owner; 'Cooperative' = member-owned.",
  task_type: "What kind of activity this is. 'Service Visit' = going to a client; 'Medication Admin' = giving medication; 'Stock Counting' = inventory count.",
  transaction_type: "What kind of financial event this is. 'Service Fee' = income from a service; 'Payroll' = staff payment; 'Stock In' = inventory received.",
  payment_method: "How this transaction was or will be paid. 'Mobile Money' = M-Pesa or similar; 'Private Pay' = cash or card directly from client.",
  sic_division: "Industry classification using the Standard Industrial Classification system. Pick the division that best describes your main business activity.",
  enterprise_subtype: "A more specific category within your enterprise type, such as 'Pharmacy', 'Hospital', or 'Primary School'.",
  person_subtype: "A more specific category within the person type, such as 'Nurse', 'Student', or 'Sales Rep'.",
  primary_role: "The person's main job title or function within their type. For example, a Staff person's primary role could be 'Pharmacist' or 'Teacher'.",
};

export default function FieldTooltip({ field, className = "" }) {
  const [visible, setVisible] = useState(false);
  const tip = FIELD_TIPS[field];
  if (!tip) return null;

  return (
    <span className={`relative inline-block ml-1 align-middle ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="text-slate-400 hover:text-slate-600 transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {visible && (
        <div className="absolute left-6 top-1/2 -translate-y-1/2 z-50 w-64 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none">
          {tip}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
        </div>
      )}
    </span>
  );
}