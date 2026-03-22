import { getCategoryFromType } from "@/config/enterpriseTerminology";

const TRANSACTION_TYPES_BY_CATEGORY = {
  healthcare: [
    { value: "service_fee",    label: "Service Fee" },
    { value: "stock_in",       label: "Stock Purchase" },
    { value: "stock_out",      label: "Stock Usage" },
    { value: "payroll",        label: "Payroll" },
    { value: "refund",         label: "Refund" },
    { value: "other",          label: "Other" },
  ],
  education: [
    { value: "tuition",        label: "Tuition Fee" },
    { value: "material_fee",   label: "Material Fee" },
    { value: "salary",         label: "Staff Salary" },
    { value: "grant",          label: "Grant / Funding" },
    { value: "refund",         label: "Refund" },
    { value: "other",          label: "Other" },
  ],
  community: [
    { value: "donation",       label: "Donation" },
    { value: "tithe",          label: "Tithe / Offering" },
    { value: "event_income",   label: "Event Income" },
    { value: "expense",        label: "Expense" },
    { value: "grant",          label: "Grant" },
    { value: "other",          label: "Other" },
  ],
  agriculture: [
    { value: "livestock_sale", label: "Livestock Sale" },
    { value: "crop_sale",      label: "Crop Sale" },
    { value: "feed_purchase",  label: "Feed Purchase" },
    { value: "vet_expense",    label: "Veterinary Expense" },
    { value: "equipment",      label: "Equipment Purchase" },
    { value: "other",          label: "Other" },
  ],
  business: [
    { value: "service_fee",    label: "Service Fee" },
    { value: "product_sale",   label: "Product Sale" },
    { value: "expense",        label: "Business Expense" },
    { value: "payroll",        label: "Payroll" },
    { value: "refund",         label: "Refund" },
    { value: "other",          label: "Other" },
  ],
  nonprofit: [
    { value: "donation",       label: "Donation" },
    { value: "grant",          label: "Grant" },
    { value: "program_cost",   label: "Program Cost" },
    { value: "salary",         label: "Staff Salary" },
    { value: "other",          label: "Other" },
  ],
  government: [
    { value: "budget_item",    label: "Budget Item" },
    { value: "procurement",    label: "Procurement" },
    { value: "grant",          label: "Grant" },
    { value: "other",          label: "Other" },
  ],
  other: [
    { value: "income",         label: "Income" },
    { value: "expense",        label: "Expense" },
    { value: "transfer",       label: "Transfer" },
    { value: "other",          label: "Other" },
  ],
};

export function getTransactionTypes(enterpriseType) {
  const category = getCategoryFromType(enterpriseType);
  return TRANSACTION_TYPES_BY_CATEGORY[category] || TRANSACTION_TYPES_BY_CATEGORY.other;
}

export default TRANSACTION_TYPES_BY_CATEGORY;