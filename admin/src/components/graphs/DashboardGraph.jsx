import { useEffect, useState, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, AlertCircle } from 'lucide-react';
import { analyticsApi, parseApiError } from '../../services/api';

// ---------------------------------------------------------------------------
// Period options — aligned exactly with what AdminAnalyticsChartView supports
// ---------------------------------------------------------------------------
const PERIOD_OPTIONS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

// ---------------------------------------------------------------------------
// Custom chart tooltip
// ---------------------------------------------------------------------------
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700">
        <p className="text-[10px] font-bold mb-2 text-slate-400 uppercase tracking-widest">
          {label}
        </p>
        <p className="text-lg font-black text-primary-400">
          Scans: {payload[0]?.value?.toLocaleString() ?? '0'}
        </p>
      </div>
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// SalesChart (renamed semantically but kept as SalesChart for import compat)
//
// Props
// ---------------------------------------------------------------------------
export default function SalesChart({ totalScans, loading: summaryLoading }) {
  const [days, setDays]           = useState(7);
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [error, setError]         = useState(null);

  const fetchChart = useCallback((d) => {
    setChartLoading(true);
    setError(null);
    analyticsApi
      .chart(d)
      .then((res) => {
        setChartData(
          res.data.data.map((row) => ({
            name: row.label,   // e.g. "Mon", "Tue"
            Scans: row.scans,
          }))
        );
      })
      .catch((err) => setError(parseApiError(err).message))
      .finally(() => setChartLoading(false));
  }, []);

  // Re-fetch whenever the selected period changes
  useEffect(() => {
    fetchChart(days);
  }, [days, fetchChart]);

  const isLoading = summaryLoading || chartLoading;

  return (
    <div className="bg-white border-2 border-slate-200 rounded-none p-6 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-10">
        <div>
          <p className="text-[10px] font-black text-primary-700 uppercase tracking-widest mb-1">
            Metrics &amp; Traffic
          </p>
          <div className="flex items-center gap-4">
            {/* All-time total scans from parent */}
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">
              {summaryLoading ? '…' : (totalScans ?? 0).toLocaleString()}
              <span className="text-xl font-bold text-slate-400 ml-2 tracking-normal">
                scans
              </span>
            </h2>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)]">
          {PERIOD_OPTIONS.map(({ label, days: d }) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-6 py-2 text-xs font-bold rounded-lg transition-all ${
                days === d
                  ? 'bg-white text-primary-800 shadow-md ring-1 ring-slate-200'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart body ── */}
      {error ? (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      ) : (
        <div className="relative h-80 w-full rounded-none border border-slate-200 p-4 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]">
          {/* Loading overlay — keeps layout stable while fetching */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorDashScans" x1="0" y1="0" x2="0" y2="1">
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
                fill="url(#colorDashScans)"
                activeDot={{ r: 6, fill: '#b91c1c', strokeWidth: 3, stroke: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}