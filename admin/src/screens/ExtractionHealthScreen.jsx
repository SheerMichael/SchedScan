import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  AlertCircle, Loader2, Search, Clock, ChevronLeft, ChevronRight,
  ArrowDown, ArrowUp, CheckCircle2, XCircle, FileText, Eye, X,
  MessageSquare, Wrench, RefreshCw,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import StatCard from '../components/graphs/StatCard';
import { extractionApi, incidentsApi, parseApiError } from '../services/api';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function pct(n) {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(1)}%`;
}
function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString();
}
function fmtTime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  return `${Number(seconds).toFixed(2)}s`;
}

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  investigating: 'bg-blue-100 text-blue-800 border-blue-300',
  resolved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const TAB_KEYS = ['analytics', 'failed', 'incidents'];
const TAB_LABELS = {
  analytics: 'Extraction Analytics',
  failed: 'Failed Extractions',
  incidents: 'Incident Reports',
};

// --------------------------------------------------------------------------
// Main Screen
// --------------------------------------------------------------------------
export default function ExtractionHealthScreen() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="min-h-screen bg-[#fcfcf9] no-scrollbar pb-10">
      <Header />

      {/* Tab Bar */}
      <div className="max-w-350 mx-auto px-8 mt-6">
        <div className="flex items-center gap-2">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-5 py-2.5 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                activeTab === key
                  ? 'bg-slate-900 text-white border-slate-900 shadow-none'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 shadow-[3px_3px_0px_0px_rgba(15,23,42,0.08)]'
              }`}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={handleRefresh}
            title="Refresh data"
            className="p-2.5 border-2 border-slate-200 text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all shadow-[3px_3px_0px_0px_rgba(15,23,42,0.08)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-8 max-w-350 mx-auto">
        {activeTab === 'analytics' && <AnalyticsTab refreshKey={refreshKey} />}
        {activeTab === 'failed' && <FailedExtractionsTab refreshKey={refreshKey} />}
        {activeTab === 'incidents' && <IncidentReportsTab refreshKey={refreshKey} />}
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-7">
      <div className="max-w-350 mx-auto">
        <h1 className="text-4xl font-black text-slate-800 tracking-tight">
          OCR Health <span className="text-primary-800">&amp; Reports</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1 font-semibold tracking-tight">
          Extraction pipeline monitoring &amp; incident management
        </p>
      </div>
    </header>
  );
}

// ==========================================================================
// TAB 1: Extraction Analytics
// ==========================================================================
function AnalyticsTab({ refreshKey }) {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [days, setDays] = useState(30);
  const [chartDays, setChartDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      extractionApi.analytics(days),
      extractionApi.chart(chartDays),
    ])
      .then(([statsRes, chartRes]) => {
        setStats(statsRes.data);
        setChartData(
          chartRes.data.data.map((d) => ({
            name: d.label,
            date: d.date,
            Success: d.success,
            Failure: d.failure,
          }))
        );
      })
      .catch((err) => setError(parseApiError(err).message))
      .finally(() => setLoading(false));
  }, [days, chartDays, refreshKey]);

  return (
    <>
      {/* Period selector */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                days === d
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'
              }`}
            >
              {d}d
            </button>
          ))}
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

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard title="Total Extractions" value={loading ? '…' : fmt(stats?.total_extractions)} />
        <StatCard title="Success Rate" value={loading ? '…' : pct(stats?.success_rate)} />
        <StatCard title="Avg Confidence" value={loading ? '…' : pct(stats?.avg_confidence)} />
        <StatCard title="Avg Processing" value={loading ? '…' : fmtTime(stats?.avg_processing_time)} />
      </div>

      {/* Method breakdown */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          <BreakdownCard title="By Method" data={stats.method_breakdown} labels={{
            pdf_text: 'PDF Text', ocr: 'OCR (Direct)', ocr_fallback: 'OCR (Fallback)',
            pdf_text_only: 'PDF Only (No OCR)', none: 'Failed',
          }} />
          <BreakdownCard title="By Upload Type" data={stats.upload_type_breakdown} labels={{
            student: 'Student', faculty: 'Faculty',
          }} />
        </div>
      )}

      {/* Chart */}
      <div className="bg-white border-2 border-slate-200 p-6 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.08)]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Daily Extractions</h3>
          <div className="flex gap-2">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setChartDays(d)}
                className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border transition-all ${
                  chartDays === d
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12, fontWeight: 600 }} />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
            <Bar dataKey="Success" fill="#16a34a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Failure" fill="#dc2626" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function BreakdownCard({ title, data, labels }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return (
    <div className="bg-white border-2 border-slate-200 p-6 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.05)]">
      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">{title}</h3>
      <div className="space-y-3">
        {Object.entries(data).map(([key, count]) => {
          const pctVal = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700 w-32 truncate">{labels[key] || key}</span>
              <div className="flex-1 bg-slate-100 h-5 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-slate-800 transition-all"
                  style={{ width: `${pctVal}%` }}
                />
              </div>
              <span className="text-[11px] font-black text-slate-600 w-16 text-right">{count} ({pctVal}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================================================
// TAB 2: Failed Extractions
// ==========================================================================
function FailedExtractionsTab({ refreshKey }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewLog, setPreviewLog] = useState(null);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    setError(null);
    extractionApi.failed({ search, page, page_size: 15 })
      .then((res) => {
        setLogs(res.data.results);
        setTotal(res.data.count);
        setTotalPages(res.data.total_pages);
      })
      .catch((err) => setError(parseApiError(err).message))
      .finally(() => setLoading(false));
  }, [search, page, refreshKey]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <>
      {/* Search */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
        <div className="relative w-full md:w-112.5">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-900" size={18} />
          <input
            type="text"
            placeholder="SEARCH FAILED LOGS…"
            className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-slate-900 rounded-none shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] focus:outline-none focus:translate-x-0.5 focus:translate-y-0.5 focus:shadow-none transition-all font-bold text-xs tracking-widest placeholder:text-slate-300"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {total} failed {total === 1 ? 'extraction' : 'extractions'}
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(185,28,28,0.08)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white border-b-2 border-primary-900">
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em]">File</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em]">Type</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em]">Method</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em]">Confidence</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em]">Error</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em]">Time</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin inline mr-2" />Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400 font-bold text-sm">No failed extractions found</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-primary-50/30 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900 text-xs truncate max-w-48">{log.file_name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{log.user_email || 'Unknown'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 border border-slate-300 text-[10px] font-black uppercase tracking-wider">
                        {log.upload_type}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[11px] font-bold text-slate-500 uppercase">{log.extraction_method}</td>
                    <td className="px-5 py-4 text-[11px] font-bold text-slate-500">{(log.confidence * 100).toFixed(1)}%</td>
                    <td className="px-5 py-4 max-w-xs">
                      <p className="text-[11px] text-red-600 font-medium truncate">{log.error_message || '—'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                        <Clock size={12} className="text-primary-700" />
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setPreviewLog(log)}
                        className="p-2 border-2 border-slate-200 text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination page={page} totalPages={totalPages} total={total} label="failed extractions" onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
      </div>

      {/* Detail modal */}
      {previewLog && (
        <Modal onClose={() => setPreviewLog(null)} title="Extraction Detail">
          <div className="space-y-4 text-sm">
            <Field label="File" value={previewLog.file_name} />
            <Field label="User" value={previewLog.user_email || 'Unknown'} />
            <Field label="Upload Type" value={previewLog.upload_type} />
            <Field label="Method" value={previewLog.extraction_method} />
            <Field label="Confidence" value={`${(previewLog.confidence * 100).toFixed(1)}%`} />
            <Field label="Processing Time" value={`${previewLog.processing_time}s`} />
            <Field label="Attempts" value={previewLog.attempts?.join(' → ') || '—'} />
            <div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Error Message</span>
              <p className="text-red-600 font-medium text-xs whitespace-pre-wrap bg-red-50 p-3 border border-red-200 rounded">{previewLog.error_message || 'N/A'}</p>
            </div>
            {previewLog.raw_text_preview && (
              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Raw Text Preview</span>
                <pre className="text-[11px] bg-slate-50 p-3 border border-slate-200 rounded whitespace-pre-wrap max-h-48 overflow-y-auto">{previewLog.raw_text_preview}</pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

// ==========================================================================
// TAB 3: Incident Reports
// ==========================================================================
function IncidentReportsTab({ refreshKey }) {
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editReport, setEditReport] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchReports = useCallback(() => {
    setLoading(true);
    setError(null);
    incidentsApi.list({ search, status: statusFilter, page, page_size: 15 })
      .then((res) => {
        setReports(res.data.results);
        setTotal(res.data.count);
        setTotalPages(res.data.total_pages);
      })
      .catch((err) => setError(parseApiError(err).message))
      .finally(() => setLoading(false));
  }, [search, statusFilter, page, refreshKey]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await incidentsApi.update(id, { status: newStatus });
      fetchReports();
    } catch (err) {
      setError(parseApiError(err).message);
    }
  };

  const handleSaveNotes = async () => {
    if (!editReport) return;
    setSaving(true);
    try {
      await incidentsApi.update(editReport.id, {
        status: editReport.status,
        admin_notes: editReport.admin_notes,
      });
      setEditReport(null);
      fetchReports();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Search + Filters */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
        <div className="relative w-full md:w-112.5">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-900" size={18} />
          <input
            type="text"
            placeholder="SEARCH REPORTS…"
            className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-slate-900 rounded-none shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] focus:outline-none focus:translate-x-0.5 focus:translate-y-0.5 focus:shadow-none transition-all font-bold text-xs tracking-widest placeholder:text-slate-300"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <div className="flex gap-2">
          {['', 'pending', 'investigating', 'resolved'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                statusFilter === s
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(185,28,28,0.08)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white border-b-2 border-primary-900">
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em]">Reporter</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em]">Description</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em]">Error</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em]">Status</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em]">Date</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin inline mr-2" />Loading…</td></tr>
              ) : reports.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400 font-bold text-sm">No incident reports found</td></tr>
              ) : (
                reports.map((r) => (
                  <tr key={r.id} className="hover:bg-primary-50/30 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900 text-xs uppercase">{r.reporter_name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{r.reporter_email}</p>
                    </td>
                    <td className="px-5 py-4 max-w-xs">
                      <p className="text-[11px] font-medium text-slate-600 truncate">{r.description}</p>
                    </td>
                    <td className="px-5 py-4 max-w-48">
                      <p className="text-[11px] text-red-500 font-medium truncate">{r.upload_error || '—'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={r.status}
                        onChange={(e) => handleStatusChange(r.id, e.target.value)}
                        className={`px-2 py-1 border text-[10px] font-black uppercase tracking-widest cursor-pointer ${STATUS_COLORS[r.status]}`}
                      >
                        <option value="pending">Pending</option>
                        <option value="investigating">Investigating</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                        <Clock size={12} className="text-primary-700" />
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setEditReport({ ...r })}
                        className="p-2 border-2 border-slate-200 text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all"
                        title="Edit notes"
                      >
                        <MessageSquare size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} total={total} label="reports" onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
      </div>

      {/* Edit modal */}
      {editReport && (
        <Modal onClose={() => setEditReport(null)} title={`Incident #${editReport.id}`}>
          <div className="space-y-4">
            <Field label="Reporter" value={`${editReport.reporter_name} (${editReport.reporter_email})`} />
            <Field label="Description" value={editReport.description} />
            {editReport.upload_error && <Field label="System Error" value={editReport.upload_error} />}

            <div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Status</span>
              <select
                value={editReport.status}
                onChange={(e) => setEditReport({ ...editReport, status: e.target.value })}
                className={`w-full px-3 py-2 border-2 text-xs font-bold uppercase tracking-widest ${STATUS_COLORS[editReport.status]}`}
              >
                <option value="pending">Pending</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            <div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Admin Notes</span>
              <textarea
                rows={4}
                className="w-full px-3 py-2 border-2 border-slate-200 text-sm font-medium text-slate-700 focus:border-slate-900 focus:outline-none transition-colors"
                placeholder="Internal investigation notes…"
                value={editReport.admin_notes}
                onChange={(e) => setEditReport({ ...editReport, admin_notes: e.target.value })}
              />
            </div>

            {editReport.resolved_by_email && (
              <Field label="Resolved By" value={`${editReport.resolved_by_email} — ${new Date(editReport.resolved_at).toLocaleString()}`} />
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSaveNotes}
                disabled={saving}
                className="flex-1 py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary-800 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditReport(null)}
                className="flex-1 py-3 border-2 border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:border-slate-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ==========================================================================
// Shared Components
// ==========================================================================

function Pagination({ page, totalPages, total, label, onPrev, onNext }) {
  return (
    <div className="px-6 py-5 bg-slate-50 border-t-2 border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
      <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
        Total: <span className="text-slate-900">{total}</span> {label}
      </p>
      <div className="flex items-center gap-6">
        <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
          Page {page} of {totalPages || 1}
        </span>
        <div className="flex gap-3">
          <button
            onClick={onPrev}
            disabled={page <= 1}
            className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
              page <= 1
                ? 'bg-white border-slate-100 text-slate-200 cursor-not-allowed'
                : 'bg-white border-slate-900 text-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
            }`}
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <button
            onClick={onNext}
            disabled={page >= totalPages}
            className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
              page >= totalPages
                ? 'bg-white border-slate-100 text-slate-200 cursor-not-allowed'
                : 'bg-white border-slate-900 text-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
            }`}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,0.15)] w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-slate-900 bg-slate-50">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">{title}</h3>
          <button onClick={onClose} className="p-1 hover:text-primary-700 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">{label}</span>
      <p className="text-sm font-medium text-slate-800">{value || '—'}</p>
    </div>
  );
}
