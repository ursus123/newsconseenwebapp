import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Bell, AlertCircle, FileText, Package, ChevronRight, X } from "lucide-react";
import { isPast, parseISO } from "date-fns";

function buildNotifications(tasks, transactions, products) {
  const notifs = [];

  // Overdue tasks
  const overdueTasks = tasks.filter(
    (t) => t.due_date && t.status !== "completed" && t.status !== "cancelled" && isPast(parseISO(t.due_date))
  );
  if (overdueTasks.length > 0) {
    notifs.push({
      id: "overdue-tasks",
      icon: AlertCircle,
      iconColor: "text-rose-500",
      bg: "bg-rose-50",
      label: `${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? "s" : ""} need attention`,
      page: "Tasks",
    });
  }

  // Draft transactions
  const draftTx = transactions.filter((t) => !t.status || t.status === "draft");
  if (draftTx.length > 0) {
    notifs.push({
      id: "draft-tx",
      icon: FileText,
      iconColor: "text-amber-600",
      bg: "bg-amber-50",
      label: `${draftTx.length} transaction${draftTx.length !== 1 ? "s" : ""} pending posting`,
      page: "Transactions",
    });
  }

  // Low stock
  const lowStock = products.filter(
    (p) => p.min_stock_level != null && p.stock_quantity != null && p.stock_quantity < p.min_stock_level
  );
  if (lowStock.length > 0) {
    notifs.push({
      id: "low-stock",
      icon: Package,
      iconColor: "text-orange-600",
      bg: "bg-orange-50",
      label: `${lowStock.length} product${lowStock.length !== 1 ? "s" : ""} below minimum stock`,
      page: "Products",
    });
  }

  return notifs;
}

export default function NotificationsBell({ tasks = [], transactions = [], products = [] }) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(false);
  const ref = useRef(null);

  const notifs = buildNotifications(tasks, transactions, products);
  const count = notifs.length;

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((v) => !v); setRead(true); }}
        className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-500" />
        {!read && count > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Notifications</h3>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {notifs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-400">All clear — no alerts right now</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {notifs.map((n) => {
                const Icon = n.icon;
                return (
                  <Link key={n.id} to={createPageUrl(n.page)} onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className={`w-8 h-8 rounded-xl ${n.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${n.iconColor}`} />
                    </div>
                    <p className="text-sm text-slate-700 flex-1 leading-snug">{n.label}</p>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}