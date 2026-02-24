import React from "react";
import { motion } from "framer-motion";

export default function StatCard({ title, value, icon: Icon, color, subtitle }) {
  const colorMap = {
    emerald: "from-emerald-500 to-emerald-600 shadow-emerald-500/20",
    blue: "from-blue-500 to-blue-600 shadow-blue-500/20",
    amber: "from-amber-500 to-amber-600 shadow-amber-500/20",
    purple: "from-purple-500 to-purple-600 shadow-purple-500/20",
    rose: "from-rose-500 to-rose-600 shadow-rose-500/20",
    cyan: "from-cyan-500 to-cyan-600 shadow-cyan-500/20",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-6 border border-slate-100 hover:shadow-lg hover:shadow-slate-100 transition-shadow duration-300"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold text-slate-800 mt-2">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${colorMap[color] || colorMap.emerald} flex items-center justify-center shadow-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </motion.div>
  );
}