import React, { useState } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";

const TEMPLATES = [
  {
    category: "Operations",
    items: [
      {
        label: "Daily task completion report",
        sql: `SELECT task_type, status, COUNT(*) as count
FROM tasks
WHERE created_date >= date('now', '-1 day')
GROUP BY task_type, status`,
      },
      {
        label: "Overdue tasks by enterprise",
        sql: `SELECT enterprise, title, due_date, assigned_to_name, priority
FROM tasks
WHERE status != 'completed'
AND due_date < date('now')
ORDER BY due_date ASC`,
      },
      {
        label: "Staff workload",
        sql: `SELECT assigned_to_name,
  COUNT(*) as total_tasks,
  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
FROM tasks
GROUP BY assigned_to_name
ORDER BY total_tasks DESC`,
      },
    ],
  },
  {
    category: "Financial Intelligence",
    items: [
      {
        label: "Outstanding Invoices",
        sql: `SELECT 
  enterprise,
  primary_person,
  invoice_number,
  description,
  amount,
  due_date,
  CASE 
    WHEN due_date < date('now') 
    THEN 'OVERDUE'
    ELSE 'PENDING'
  END as urgency
FROM transactions
WHERE payment_status = 'unpaid'
AND status = 'posted'
ORDER BY due_date ASC`,
      },
      {
        label: "Revenue by Enterprise",
        sql: `SELECT 
  enterprise,
  COUNT(*) as invoice_count,
  SUM(amount) as total_billed,
  SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END) as total_collected,
  ROUND(
    SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END) * 100.0 / 
    NULLIF(SUM(amount), 0)
  , 1) as collection_rate_pct
FROM transactions
WHERE transaction_type IN (
  'service_fee','tuition','donation',
  'membership_fee','grant','livestock_sale'
)
GROUP BY enterprise
ORDER BY total_collected DESC`,
      },
      {
        label: "Monthly Revenue Trend",
        sql: `SELECT 
  substr(date, 1, 7) as month,
  enterprise,
  SUM(amount) as revenue
FROM transactions
WHERE payment_status = 'paid'
AND transaction_type IN (
  'service_fee','tuition','donation',
  'membership_fee','grant','livestock_sale'
)
GROUP BY month, enterprise
ORDER BY month DESC`,
      },
      {
        label: "Draft Invoices Pending Review",
        sql: `SELECT 
  enterprise,
  description,
  amount,
  primary_person,
  task_title,
  created_date
FROM transactions
WHERE status = 'draft'
ORDER BY created_date DESC`,
      },
    ],
  },
  {
    category: "Finance",
    items: [
      {
        label: "Revenue this month",
        sql: `SELECT transaction_type,
  COUNT(*) as count,
  SUM(amount) as total
FROM transactions
WHERE status = 'posted'
AND date >= date('now', 'start of month')
GROUP BY transaction_type`,
      },
      {
        label: "Unpaid transactions",
        sql: `SELECT enterprise, description, amount, due_date, payment_status
FROM transactions
WHERE payment_status = 'unpaid'
AND status = 'posted'
ORDER BY due_date ASC`,
      },
      {
        label: "Expense breakdown",
        sql: `SELECT enterprise, SUM(amount) as total_expenses
FROM transactions
WHERE transaction_type = 'expense'
AND status = 'posted'
GROUP BY enterprise
ORDER BY total_expenses DESC`,
      },
    ],
  },
  {
    category: "Inventory",
    items: [
      {
        label: "Low stock alert",
        sql: `SELECT name, stock_quantity, min_stock_level, unit_price,
  (stock_quantity - min_stock_level) as gap
FROM products
WHERE stock_quantity < min_stock_level
ORDER BY gap ASC`,
      },
      {
        label: "Medication expiry",
        sql: `SELECT name, stock_quantity, expiry_date, regulatory_status
FROM products
WHERE item_type = 'medication'
AND expiry_date IS NOT NULL
ORDER BY expiry_date ASC`,
      },
      {
        label: "Stock valuation",
        sql: `SELECT item_type,
  COUNT(*) as items,
  SUM(stock_quantity) as total_units,
  SUM(stock_quantity * cost_price) as total_value
FROM products
GROUP BY item_type
ORDER BY total_value DESC`,
      },
    ],
  },
  {
    category: "People",
    items: [
      {
        label: "Staff by enterprise",
        sql: `SELECT enterprise, primary_role,
  COUNT(*) as headcount,
  SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active
FROM people
GROUP BY enterprise, primary_role
ORDER BY enterprise, headcount DESC`,
      },
      {
        label: "People by role",
        sql: `SELECT primary_role, role_category,
  COUNT(*) as count,
  SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active_count
FROM people
GROUP BY primary_role, role_category
ORDER BY count DESC`,
      },
      {
        label: "Tasks by enterprise",
        sql: `SELECT enterprise,
  COUNT(*) as total_tasks,
  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
FROM tasks
GROUP BY enterprise
ORDER BY total_tasks DESC`,
      },
    ],
  },
  {
    category: "Healthcare",
    items: [
      {
        label: "Medication inventory",
        sql: `SELECT name, stock_quantity, min_stock_level, unit_price,
  expiry_date, regulatory_status, storage_instructions
FROM products
WHERE item_type = 'medication'
ORDER BY stock_quantity ASC`,
      },
      {
        label: "Medication admin tasks",
        sql: `SELECT enterprise, assigned_to_name,
  COUNT(*) as total,
  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN outcome='refused' THEN 1 ELSE 0 END) as refused,
  SUM(CASE WHEN outcome='missed' THEN 1 ELSE 0 END) as missed
FROM tasks
WHERE task_type = 'medication_admin'
GROUP BY enterprise, assigned_to_name`,
      },
      {
        label: "Revenue by enterprise",
        sql: `SELECT enterprise,
  SUM(amount) as total_revenue,
  COUNT(*) as transactions
FROM transactions
WHERE status = 'posted'
GROUP BY enterprise
ORDER BY total_revenue DESC`,
      },
    ],
  },
  {
    category: "Analytics DB",
    items: [
      { label: "Enterprise breakdown", sql: "SELECT * FROM analytics_enterprises" },
      { label: "Task completion", sql: "SELECT task_type, total_tasks, completed_tasks FROM analytics_tasks" },
      { label: "Revenue by type", sql: "SELECT transaction_type, total_amount FROM analytics_transactions ORDER BY total_amount DESC" },
      { label: "Stock levels", sql: "SELECT item_type, total_stock FROM analytics_products ORDER BY total_stock ASC" },
    ],
  },
  {
    category: "Geospatial",
    items: [
      { label: "Find pharmacies near location", sql: "SELECT * FROM osm_nearby\nWHERE lat = 44.8 AND lon = -68.7\nAND type = 'pharmacy' AND radius_km = 5" },
      { label: "Search hospitals in city", sql: "SELECT * FROM osm_places\nWHERE query = 'hospital' AND city = 'Bangor'" },
      { label: "Find schools near enterprise", sql: "SELECT * FROM osm_places\nWHERE query = 'school' AND city = 'Bugesera'" },
    ],
  },
  {
    category: "Weather",
    items: [
      { label: "Current weather", sql: "SELECT * FROM weather_current WHERE city = 'Bangor'" },
      { label: "7 day forecast", sql: "SELECT * FROM weather_forecast\nWHERE city = 'Kigali' AND days = 7" },
      { label: "Weather for enterprise cities", sql: "SELECT e.enterprise_name, e.city,\n  w.temperature_c, w.weather_description\nFROM enterprises e\nJOIN weather_current w ON w.city = e.city\nWHERE e.status = 'active'" },
    ],
  },
  {
    category: "Healthcare APIs",
    items: [
      { label: "Drug interaction check", sql: "SELECT * FROM medications_interactions\nWHERE drug1 = 'metformin' AND drug2 = 'ibuprofen'" },
      { label: "Medication label / warnings", sql: "SELECT * FROM medications_label WHERE name = 'metformin'" },
      { label: "Search medication", sql: "SELECT * FROM medications_api WHERE name = 'metformin'" },
      { label: "Check recalls", sql: "SELECT * FROM medications_recalls WHERE name = 'metformin'" },
      { label: "Cross-check inventory recalls", sql: "SELECT p.name, p.stock_quantity, r.reason_for_recall,\n  r.recalling_firm, r.recall_initiation_date\nFROM products p\nJOIN medications_recalls r ON r.name = p.name\nWHERE p.item_type = 'medication'" },
      { label: "FDA device recalls", sql: "SELECT * FROM fda_devices WHERE product = 'wheelchair'" },
      { label: "FDA food safety alerts", sql: "SELECT * FROM fda_food_recalls WHERE product = 'milk'" },
    ],
  },
  {
    category: "Demographics",
    items: [
      { label: "Rwanda population trend", sql: "SELECT year, value as population\nFROM worldbank_indicators\nWHERE country = 'RW'\nAND indicator = 'SP.POP.TOTL'\nAND year_from = 2015 AND year_to = 2023" },
      { label: "Healthcare spending comparison", sql: "SELECT country_name, year, value as health_spend_per_capita\nFROM worldbank_indicators\nWHERE indicator = 'SH.XPD.CHEX.PC.CD'\nAND year_from = 2020 AND year_to = 2023" },
      { label: "East African countries", sql: "SELECT name, capital, population, currency\nFROM countries\nWHERE subregion = 'Eastern Africa'\nORDER BY population DESC" },
      { label: "Enrich enterprises with country data", sql: "SELECT e.enterprise_name, e.country,\n  c.capital, c.population, c.currency\nFROM enterprises e\nJOIN countries c ON c.name = e.country\nWHERE e.status = 'active'" },
    ],
  },
  {
    category: "Finance & FX",
    items: [
      { label: "USD exchange rates", sql: "SELECT currency, rate FROM exchange_rates\nWHERE base = 'USD'\nORDER BY currency ASC" },
      { label: "Convert transaction amounts to RWF", sql: "SELECT t.enterprise, t.amount as amount_usd,\n  t.amount * r.rate as amount_rwf\nFROM transactions t\nJOIN exchange_rates r ON r.base = 'USD' AND r.currency = 'RWF'\nWHERE t.status = 'posted'" },
    ],
  },
  {
    category: "Advanced (Cross-API)",
    items: [
      { label: "Enterprises with weather", sql: "SELECT e.enterprise_name, e.city, e.country,\n  w.temperature_c, w.weather_description\nFROM enterprises e\nJOIN weather_current w ON w.city = e.city\nWHERE e.status = 'active'" },
      { label: "Enterprise locations on map", sql: "SELECT e.enterprise_name, e.enterprise_type,\n  o.lat, o.lon, o.display_name\nFROM enterprises e\nJOIN osm_places o ON o.query = e.enterprise_name\nWHERE e.status = 'active'" },
      { label: "Medication recalls in inventory", sql: "SELECT p.name, p.stock_quantity,\n  r.reason_for_recall, r.is_active\nFROM products p\nJOIN medications_recalls r ON r.name = p.name\nWHERE p.item_type = 'medication'" },
      { label: "Transactions in local currency", sql: "SELECT t.enterprise, t.amount as usd_amount,\n  t.amount * fx.rate as local_amount,\n  fx.currency, c.name as country_name\nFROM transactions t\nJOIN enterprises e ON e.enterprise_name = t.enterprise\nJOIN countries c ON c.name = e.country\nJOIN exchange_rates fx ON fx.base = 'USD' AND fx.currency = c.currency\nWHERE t.status = 'posted'" },
      { label: "Nearby healthcare per enterprise", sql: "SELECT e.enterprise_name, e.city,\n  n.name as facility_name, n.amenity, n.distance_km\nFROM enterprises e\nJOIN osm_nearby n ON n.city = e.city\nWHERE n.amenity IN ('pharmacy', 'hospital', 'clinic')\nAND n.distance_km < 5\nORDER BY e.enterprise_name, n.distance_km" },
    ],
  },
  {
    category: "External APIs (Legacy)",
    items: [
      { label: "Search medication (Railway)", sql: "SELECT * FROM medications_api WHERE name = 'metformin'" },
      { label: "Check recalls (Railway)", sql: "SELECT * FROM medications_recalls WHERE name = 'metformin'" },
    ],
  },
];

function TemplateGroup({ category, items, onLoad }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <FileText className="w-3 h-3 text-violet-400" />
        {category} ({items.length})
      </button>
      {open && items.map((tpl, i) => (
        <div
          key={i}
          onClick={() => onLoad(tpl.sql)}
          className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer ml-2"
        >
          <span className="text-xs text-slate-400 hover:text-slate-200 flex-1 truncate">{tpl.label}</span>
          <span className="text-[9px] text-violet-400 opacity-0 group-hover:opacity-100 shrink-0">load →</span>
        </div>
      ))}
    </div>
  );
}

export default function TemplatesPanel({ onLoad }) {
  return (
    <div className="flex-1 overflow-y-auto py-2 px-1">
      {TEMPLATES.map(({ category, items }) => (
        <TemplateGroup key={category} category={category} items={items} onLoad={onLoad} />
      ))}
    </div>
  );
}