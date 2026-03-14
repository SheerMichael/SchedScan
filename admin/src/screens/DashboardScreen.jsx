import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import SalesChart from '../components/graphs/DashboardGraph';
import StatCard from '../components/graphs/StatCard';
import { analyticsApi, auditApi, parseApiError } from '../services/api';

// ---------------------------------------------------------------------------
function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString();
}

function fmtPhp(centavos) {
  if (centavos === null || centavos === undefined) return '—';
  return '₱' + (centavos / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Action type → display label used in the audit log
// ---------------------------------------------------------------------------
const ACTION_LABELS = {
  user_deactivated: 'User deactivated',
  user_reactivated: 'User reactivated',
  holiday_created: 'Holiday created',
  holiday_updated: 'Holiday updated',
  holiday_deleted: 'Holiday deleted',
  admin_login: 'Admin signed in',
};

const ACTION_COLORS = {
  user_deactivated: 'text-red-600 bg-red-50',
  user_reactivated: 'text-emerald-600 bg-emerald-50',
  holiday_created: 'text-primary-700 bg-primary-50',
  holiday_updated: 'text-amber-700 bg-amber-50',
  holiday_deleted: 'text-slate-600 bg-slate-100',
  admin_login: 'text-blue-700 bg-blue-50',
};

export default function DashboardScreen() {
  const [stats, setStats] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingLog, setLoadingLog] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [logError, setLogError] = useState(null);

  useEffect(() => {
    // Fetch analytics summary
    analyticsApi.summary()
      .then(({ data }) => setStats(data))
      .catch((err) => setStatsError(parseApiError(err).message))
      .finally(() => setLoadingStats(false));

    // Fetch recent audit log (last 20 entries for the dashboard)
    auditApi.list(20)
      .then(({ data }) => setAuditLog(data))
      .catch((err) => setLogError(parseApiError(err).message))
      .finally(() => setLoadingLog(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased text-slate-900">
      <Header />

      <div className="p-8 max-w-7xl mx-auto">
        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {loadingStats ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : statsError ? (
            <ErrorBanner message={statsError} />
          ) : (
            <>
              <StatCard title="Total Revenue" value={fmtPhp(stats?.total_revenue_centavos)} />
              <StatCard title="Total Enrolled Users" value={fmt(stats?.total_users)} />
              <StatCard title="Active User Sessions" value={fmt(stats?.active_users)} />
            </>
          )}
        </div>

        {/* Sales / scan activity chart */}
        <div className="mb-8">
          <SalesChart
            totalScans={stats?.total_schedules ?? null}
            loading={loadingStats}
          />
        </div>

        {/* Audit log */}
        <div className="bg-white border-2 border-slate-200 rounded-none p-6 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-700">
              Audit &amp; Recent Activity
            </h2>
            {loadingLog && <Loader2 size={16} className="animate-spin text-slate-400" />}
          </div>

          <div className="p-6">
            {logError ? (
              <ErrorBanner message={logError} />
            ) : loadingLog ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-5 bg-slate-100 rounded animate-pulse w-3/4" />
                ))}
              </div>
            ) : auditLog.length === 0 ? (
              <p className="text-sm text-slate-400 font-medium">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-4">
                {auditLog.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-4 text-sm">
                    <span className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0 ${ACTION_COLORS[entry.action] || 'text-slate-600 bg-slate-100'}`}>
                      {ACTION_LABELS[entry.action] || entry.action}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{entry.detail || '—'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {entry.admin_email} · {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-7">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-black text-slate-800 tracking-tight">Dashboard</h1>
      </div>
    </header>
  );
}

function SkeletonCard() {
  return (
    <div className="h-28 bg-white border-2 border-slate-200 rounded-none animate-pulse shadow-[4px_4px_0px_0px_rgba(185,28,28,0.05)]" />
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
      <AlertCircle size={16} className="shrink-0" />
      {message}
    </div>
  );
}