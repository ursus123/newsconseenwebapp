import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/card';

export default function StockHealthChart({ products }) {
  const chartData = useMemo(() => {
    if (!products.length) return [];

    const healthy = products.filter(
      (p) => p.min_stock_level == null || 
      p.stock_quantity == null || 
      p.stock_quantity >= p.min_stock_level
    ).length;

    const lowStock = products.filter(
      (p) => p.min_stock_level != null && 
      p.stock_quantity != null && 
      p.stock_quantity < p.min_stock_level
    ).length;

    const outOfStock = products.filter(
      (p) => p.stock_quantity === 0
    ).length;

    return [
      { name: 'In Stock', value: healthy, color: '#10b981' },
      { name: 'Low Stock', value: lowStock, color: '#f59e0b' },
      { name: 'Out of Stock', value: outOfStock, color: '#ef4444' },
    ].filter((item) => item.value > 0);
  }, [products]);

  if (!chartData.length) {
    return (
      <Card className="p-6 h-80 flex items-center justify-center text-slate-400">
        No product data available
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-slate-700 mb-4">Inventory Health</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, value }) => `${name}: ${value}`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#f1f5f9' }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}