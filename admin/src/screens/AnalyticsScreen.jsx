import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import UserCompositionChart from '../components/graphs/AnalyticsPie';
import ScanActivityChart from '../components/graphs/AnalyticsGraph';
import StatCard from '../components/graphs/StatCard';
import { analyticsApi, parseApiError } from '../services/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString();
}

function fmtPhp(centavos) {
  if (centavos === null || centavos === undefined) return '—';
  return '₱' + (centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AnalyticsScreen() {
  const [summary, setSummary] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      analyticsApi.summary(),
      analyticsApi.chart(7),
    ])
      .then(([summaryRes, chartRes]) => {
        setSummary(summaryRes.data);
        // Transform API chart data into the shape recharts expects
        setChartData(
          chartRes.data.data.map((d) => ({
            name: d.label,
            Scans: d.scans,
          }))
        );
      })
      .catch((err) => setError(parseApiError(err).message))
      .finally(() => setLoading(false));
  }, []);

  // Build pie chart data from summary
  const userTypeData = summary
    ? [
        { name: 'Students', value: summary.users_by_type.student, color: '#b91c1c' },
        { name: 'Faculty',  value: summary.users_by_type.faculty,  color: '#334155' },
        { name: 'Parents',  value: summary.users_by_type.parent,  color: '#94a3b8' },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#fcfcf9] no-scrollbar pb-10">
      <header className="bg-white border-b border-slate-200 px-4 py-7 mb-8">
        <div className="max-w-350 mx-auto">
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">
            System <span className="text-primary-800">Analytics</span>
          </h1>
        </div>
      </header>

      <div className="p-8 max-w-350 mx-auto mt-2">
        <div className="flex items-center gap-4 mb-8">
          <div className="px-4 py-1.5 text-[10px] font-black bg-slate-900 text-white uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(185,28,28,0.3)]">
            Reporting Period: All Time
          </div>
          <div className="h-px grow bg-slate-200" />
          {loading && <Loader2 size={16} className="animate-spin text-slate-400" />}
        </div>

        {error && (
          <div className="mb-8 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatCard
            title="Total Revenue"
            value={loading ? '…' : fmtPhp(summary?.total_revenue_centavos)}
          />
          <StatCard
            title="Total Scans"
            value={loading ? '…' : fmt(summary?.total_schedules)}
          />
          <StatCard
            title="# of Premium"
            value={loading ? '…' : fmt(summary?.premium_parents)}
          />
          <StatCard
            title="# of Parents Linked"
            value={loading ? '…' : fmt(summary?.linked_parents)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <ScanActivityChart data={chartData} />
          </div>
          <UserCompositionChart data={userTypeData} />
        </div>
      </div>
    </div>
  );
}