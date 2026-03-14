import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * Custom tooltip rendered on hover. Only surfaces the "Scans" series,
 * matching the single data key returned by AdminAnalyticsChartView.
 */
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700">
        <p className="text-[10px] font-bold mb-2 text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-sm font-black text-primary-400">
          Scans: {payload[0].value.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

/**
 * ScanActivityChart
 *
 * Renders a filled area chart showing daily schedule upload (scan) activity.
 *
 * Props:
 *   data  – Array of { name: string, Scans: number } from the backend chart endpoint.
 *   days  – Currently selected period (7 | 30 | 90) used in the legend label.
 */
export default function ScanActivityChart({ data, days }) {
  return (
    <div className="bg-white border-2 border-slate-200 rounded-none p-6 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-10">
        <div>
          <p className="text-[10px] font-black text-primary-700 uppercase tracking-widest mb-1">
            System Throughput
          </p>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">
            Scan Activity
          </h2>
        </div>

        {/* Legend */}
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)]">
          <div className="flex items-center gap-4 px-4 py-2">
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase text-primary-800">
              <div className="w-2 h-2 bg-primary-700 rounded-full" /> Scans
            </span>
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Last {days}d
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-80 w-full shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)] rounded-none border border-slate-200 p-4 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorScans" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#b91c1c" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#b91c1c" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#e2e8f0" />

            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }}
              allowDecimals={false}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: '#b91c1c', strokeWidth: 1, strokeDasharray: '4 4' }}
            />

            <Area
              type="monotone"
              dataKey="Scans"
              stroke="#b91c1c"
              strokeWidth={3}
              fill="url(#colorScans)"
              activeDot={{ r: 6, fill: '#b91c1c', strokeWidth: 3, stroke: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}