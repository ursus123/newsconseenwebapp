import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/card';
import { format, subDays, startOfDay } from 'date-fns';

export default function TransactionsTrendChart({ transactions }) {
  const chartData = useMemo(() => {
    if (!transactions.length) return [];
    
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(new Date(), 29 - i);
      return startOfDay(date);
    });

    return last30Days.map((date) => {
      const dayTransactions = transactions.filter(
        (t) => t.date && startOfDay(new Date(t.date)).getTime() === date.getTime()
      );
      
      const revenue = dayTransactions
        .filter((t) => ['service_fee', 'sale_service', 'event_income', 'product_sale'].includes(t.transaction_type))
        .reduce((sum, t) => sum + (t.net_amount || 0), 0);
      
      const expenses = dayTransactions
        .filter((t) => t.transaction_type?.includes('expense'))
        .reduce((sum, t) => sum + (t.net_amount || 0), 0);

      return {
        date: format(date, 'MMM d'),
        revenue,
        expenses,
        count: dayTransactions.length,
      };
    });
  }, [transactions]);

  if (!chartData.length) {
    return (
      <Card className="p-6 h-80 flex items-center justify-center text-slate-400">
        No transaction data available
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-slate-700 mb-4">Revenue & Expenses (Last 30 Days)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#f1f5f9' }}
            formatter={(value) => `$${value.toFixed(0)}`}
          />
          <Legend />
          <Line type="monotone" dataKey="revenue" stroke="#10b981" dot={false} strokeWidth={2} name="Revenue" />
          <Line type="monotone" dataKey="expenses" stroke="#ef4444" dot={false} strokeWidth={2} name="Expenses" />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}