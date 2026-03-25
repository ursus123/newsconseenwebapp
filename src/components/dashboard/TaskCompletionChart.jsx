import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/card';
import { format, subDays, startOfDay } from 'date-fns';

export default function TaskCompletionChart({ tasks }) {
  const chartData = useMemo(() => {
    if (!tasks.length) return [];
    
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(new Date(), 29 - i);
      return startOfDay(date);
    });

    return last30Days.map((date) => {
      const dayTasks = tasks.filter(
        (t) => t.updated_date && startOfDay(new Date(t.updated_date)).getTime() === date.getTime()
      );
      
      const completed = dayTasks.filter((t) => t.status === 'completed').length;
      const open = dayTasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length;

      return {
        date: format(date, 'MMM d'),
        completed,
        open,
      };
    });
  }, [tasks]);

  if (!chartData.length) {
    return (
      <Card className="p-6 h-80 flex items-center justify-center text-slate-400">
        No task data available
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-slate-700 mb-4">Task Completion Trend (Last 30 Days)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#f1f5f9' }}
          />
          <Legend />
          <Bar dataKey="completed" fill="#10b981" name="Completed" radius={[4, 4, 0, 0]} />
          <Bar dataKey="open" fill="#94a3b8" name="Open/In Progress" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}