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
    category: "External APIs",
    items: [
      { label: "Search medication", sql: "SELECT * FROM medications_api WHERE name = 'metformin'" },
      { label: "Check recalls", sql: "SELECT * FROM medications_recalls WHERE name = 'metformin'" },
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