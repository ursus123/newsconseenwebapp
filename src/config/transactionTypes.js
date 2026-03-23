export const TRANSACTION_TYPES = {
  // Revenue — money coming IN
  service_fee:         "Service Fee",
  tuition:             "Tuition / Course Fee",
  membership_fee:      "Membership Fee",
  donation:            "Donation",
  tithe:               "Tithe / Offering",
  event_income:        "Event Income",
  grant:               "Grant / Funding",
  sponsorship:         "Sponsorship",
  livestock_sale:      "Livestock Sale",
  crop_sale:           "Crop / Harvest Sale",
  product_sale:        "Product Sale",
  rental_income:       "Rental Income",
  interest_income:     "Interest / Investment",
  refund_received:     "Refund Received",

  // Expense — money going OUT
  payroll:             "Payroll / Wages",
  contractor_payment:  "Contractor Payment",
  rent_expense:        "Rent / Lease",
  utility_expense:     "Utilities",
  supply_purchase:     "Supply Purchase",
  equipment_purchase:  "Equipment Purchase",
  feed_purchase:       "Feed / Agricultural Supply",
  vet_expense:         "Veterinary Expense",
  medication_purchase: "Medication Purchase",
  insurance_expense:   "Insurance",
  tax_payment:         "Tax Payment",
  refund_issued:       "Refund Issued",
  ministry_expense:    "Ministry / Program Expense",
  travel_expense:      "Travel Expense",
  marketing_expense:   "Marketing / Outreach",
  other_expense:       "Other Expense",

  // Inventory — stock movements
  stock_in:            "Stock Received",
  stock_out:           "Stock Used / Dispensed",
  stock_adjustment:    "Stock Adjustment",

  // Internal
  budget_allocation:   "Budget Allocation",
  fund_transfer:       "Fund Transfer",
  depreciation:        "Asset Depreciation",

  // Legacy types (kept for backward compatibility)
  expense:             "Expense",
  sale_service:        "Sale / Service",
  stock_transfer:      "Stock Transfer",
  item_assignment:     "Item Assignment",
  item_return:         "Item Return",
  adjustment:          "Adjustment",
  attendance:          "Attendance",
};

export const REVENUE_TYPES = [
  "service_fee", "tuition", "membership_fee",
  "donation", "tithe", "event_income", "grant",
  "sponsorship", "livestock_sale", "crop_sale",
  "product_sale", "rental_income", "interest_income",
  "refund_received", "sale_service",
];

export const EXPENSE_TYPES = [
  "payroll", "contractor_payment", "rent_expense",
  "utility_expense", "supply_purchase",
  "equipment_purchase", "feed_purchase",
  "vet_expense", "medication_purchase",
  "insurance_expense", "tax_payment",
  "refund_issued", "ministry_expense",
  "travel_expense", "marketing_expense",
  "other_expense", "expense",
];

export const INVENTORY_TYPES = [
  "stock_in", "stock_out", "stock_adjustment",
  "stock_transfer", "item_assignment", "item_return", "adjustment",
];

// Backward compat — kept so existing imports don't break
export function getTransactionTypes() {
  return Object.entries(TRANSACTION_TYPES).map(([value, label]) => ({ value, label }));
}

export default TRANSACTION_TYPES;