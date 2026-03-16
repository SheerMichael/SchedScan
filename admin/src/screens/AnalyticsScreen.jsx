import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import UserCompositionChart from '../components/graphs/AnalyticsPie';
import ScanActivityChart from '../components/graphs/AnalyticsGraph';
import StatCard from '../components/graphs/StatCard';
import { analyticsApi, parseApiError } from '../services/api';

// ---------------------------------------------------------------------------
// Helpers — pure functions, no side-effects
// ---------------------------------------------------------------------------

/** Format a plain number with locale-aware commas. Returns "—" for null/undefined. */
function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString();
}

/** Format centavo integer to PHP currency string. */
function fmtPhp(centavos) {
  if (centavos === null || centavos === undefined) return '—';
  return '₱' + (centavos / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Period options for the chart (summary cards are always all-time)
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

// ---------------------------------------------------------------------------
// AnalyticsScreen
// ---------------------------------------------------------------------------

export default function AnalyticsScreen() {
  const [summary, setSummary]       = useState(null);
  const [chartData, setChartData]   = useState([]);
  const [chartDays, setChartDays]   = useState(7);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [chartLoading, setChartLoading]     = useState(true);
  const [error, setError]           = useState(null);

  // ----- Fetch summary stats once (all-time — backend returns all-time only) -----
  useEffect(() => {
    setSummaryLoading(true);
    setError(null);
    analyticsApi
      .summary()
      .then((res) => setSummary(res.data))
      .catch((err) => setError(parseApiError(err).message))
      .finally(() => setSummaryLoading(false));
  }, []);

  // ----- Fetch chart data whenever the selected period changes -----
  const fetchChart = useCallback((days) => {
    setChartLoading(true);
    analyticsApi
      .chart(days)
      .then((res) => {
        setChartData(
          res.data.data.map((d) => ({
            name: d.label,   // e.g. "Mon"
            Scans: d.scans,  // daily count from Schedule model
          }))
        );
      })
      .catch((err) => setError(parseApiError(err).message))
      .finally(() => setChartLoading(false));
  }, []);

  useEffect(() => {
    fetchChart(chartDays);
  }, [chartDays, fetchChart]);

  // Build Pie chart data from summary response
  const userTypeData = summary
    ? [
        { name: 'Students', value: summary.users_by_type.student, color: '#b91c1c' },
        { name: 'Faculty',  value: summary.users_by_type.faculty, color: '#334155' },
        { name: 'Parents',  value: summary.users_by_type.parent,  color: '#94a3b8' },
      ]
    : [];

  const isLoading = summaryLoading || chartLoading;

  return (
    <div className="min-h-screen bg-[#fcfcf9] no-scrollbar pb-10">

      {/* Page Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-7 mb-8">
        <div className="max-w-350 mx-auto">
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">
            System <span className="text-primary-800">Analytics</span>
          </h1>
        </div>
      </header>

      <div className="p-8 max-w-350 mx-auto mt-2">

        {/* Reporting period badge + spinner */}
        <div className="flex items-center gap-4 mb-8">
          <div className="px-4 py-1.5 text-[10px] font-black bg-slate-900 text-white uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(185,28,28,0.3)]">
            Reporting Period: All Time
          </div>
          <div className="h-px grow bg-slate-200" />
          {isLoading && <Loader2 size={16} className="animate-spin text-slate-400" />}
        </div>

        {/* Global error banner */}
        {error && (
          <div className="mb-8 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-10">
          <StatCard
            title="Total Revenue"
            value={summaryLoading ? '…' : fmtPhp(summary?.total_revenue_centavos)}
          />
          <StatCard
            title="Total Scans"
            value={summaryLoading ? '…' : fmt(summary?.total_schedules)}
          />
          <StatCard
            title="# of Premium"
            value={summaryLoading ? '…' : fmt(summary?.premium_parents)}
          />
          <StatCard
            title="# of Parents Linked"
            value={summaryLoading ? '…' : fmt(summary?.linked_parents)}
          />
          <StatCard
            title="Pending Payments"
            value={summaryLoading ? '…' : fmt(summary?.pending_payments)}
          />
        </div>

        {/* ── Charts ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Scan Activity Chart (2/3 width) */}
          <div className="lg:col-span-2">
            {/* Period selector for the chart */}
            <div className="flex gap-2 mb-4">
              {PERIOD_OPTIONS.map(({ label, days }) => (
                <button
                  key={days}
                  onClick={() => setChartDays(days)}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                    chartDays === days
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
              {chartLoading && (
                <Loader2 size={14} className="animate-spin text-slate-400 self-center ml-2" />
              )}
            </div>

            <ScanActivityChart data={chartData} days={chartDays} />
          </div>

          {/* User Composition Pie (1/3 width) */}
          <UserCompositionChart data={userTypeData} />
        </div>

      </div>
    </div>
  );
}