import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import RejectFacultyModal from '../components/modal/RejectFacultyModal';
import VerifyFacultyModal from '../components/modal/VerifyFacultyModal';
import { pendingVerificationsApi, usersApi, parseApiError } from '../services/api';

const PENDING_PAGE_SIZE = 10;
const FACULTY_PAGE_SIZE = 10;
const FACULTY_BULK_SIZE = 100;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FacultyVerificationScreen() {
  // ── Pending verifications (upload-triggered queue) ────────────────────────
  const [pending, setPending] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingPages, setPendingPages] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState(null);
  const [pendingSearch, setPendingSearch] = useState('');
  const [debouncedPendingSearch, setDebouncedPendingSearch] = useState('');

  // ── All faculty reference list ────────────────────────────────────────────
  const [facultyUsers, setFacultyUsers] = useState([]);
  const [facultyLoading, setFacultyLoading] = useState(true);
  const [facultyError, setFacultyError] = useState(null);
  const [facultySearch, setFacultySearch] = useState('');
  const [debouncedFacultySearch, setDebouncedFacultySearch] = useState('');
  const [facultyTab, setFacultyTab] = useState('all'); // 'all' | 'verified' | 'unverified'
  const [facultyPage, setFacultyPage] = useState(1);

  // ── Action state ──────────────────────────────────────────────────────────
  const [approveModal, setApproveModal] = useState({ isOpen: false, user: null });
  const [rejectModal, setRejectModal] = useState({ isOpen: false, user: null });
  const [actingId, setActingId] = useState(null); // which user we're currently acting on

  // ── Debounces ─────────────────────────────────────────────────────────────
  const pendingDebounceRef = useRef(null);
  const facultyDebounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(pendingDebounceRef.current);
    pendingDebounceRef.current = setTimeout(() => {
      setDebouncedPendingSearch(pendingSearch);
      setPendingPage(1);
    }, 350);
    return () => clearTimeout(pendingDebounceRef.current);
  }, [pendingSearch]);

  useEffect(() => {
    clearTimeout(facultyDebounceRef.current);
    facultyDebounceRef.current = setTimeout(() => {
      setDebouncedFacultySearch(facultySearch);
      setFacultyPage(1);
    }, 350);
    return () => clearTimeout(facultyDebounceRef.current);
  }, [facultySearch]);

  // ── Fetch pending verifications ───────────────────────────────────────────
  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const { data } = await pendingVerificationsApi.list({
        page: pendingPage,
        page_size: PENDING_PAGE_SIZE,
        search: debouncedPendingSearch || undefined,
      });
      setPending(data.results || []);
      setPendingTotal(data.count ?? 0);
      setPendingPages(data.total_pages ?? 1);
    } catch (err) {
      setPendingError(parseApiError(err).message);
    } finally {
      setPendingLoading(false);
    }
  }, [pendingPage, debouncedPendingSearch]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // ── Fetch all faculty (reference list) ───────────────────────────────────
  const fetchFaculty = useCallback(async () => {
    setFacultyLoading(true);
    setFacultyError(null);
    try {
      let page = 1;
      let totalPages = 1;
      const all = [];
      while (page <= totalPages) {
        const { data } = await usersApi.list({
          page,
          page_size: FACULTY_BULK_SIZE,
          user_type: 'faculty',
          search: debouncedFacultySearch || undefined,
        });
        all.push(...(data.results || []));
        totalPages = data.total_pages || 1;
        page += 1;
      }
      setFacultyUsers(all);
    } catch (err) {
      setFacultyError(parseApiError(err).message);
    } finally {
      setFacultyLoading(false);
    }
  }, [debouncedFacultySearch]);

  useEffect(() => {
    fetchFaculty();
  }, [fetchFaculty]);

  // ── Faculty list filtering + pagination ───────────────────────────────────
  const filteredFaculty = useMemo(() => {
    if (facultyTab === 'verified') return facultyUsers.filter((u) => u.is_verified);
    if (facultyTab === 'unverified') return facultyUsers.filter((u) => !u.is_verified);
    return facultyUsers;
  }, [facultyTab, facultyUsers]);

  const facultyTotalPages = Math.max(1, Math.ceil(filteredFaculty.length / FACULTY_PAGE_SIZE));

  useEffect(() => {
    setFacultyPage((p) => Math.min(p, facultyTotalPages));
  }, [facultyTotalPages]);

  const facultyPageStart = (facultyPage - 1) * FACULTY_PAGE_SIZE;
  const facultyPageItems = filteredFaculty.slice(facultyPageStart, facultyPageStart + FACULTY_PAGE_SIZE);

  const facultyCounts = useMemo(() => {
    const verified = facultyUsers.filter((u) => u.is_verified).length;
    return { all: facultyUsers.length, verified, unverified: facultyUsers.length - verified };
  }, [facultyUsers]);

  // ── Approve handler ───────────────────────────────────────────────────────
  const handleApproveClick = (user) => setApproveModal({ isOpen: true, user });
  const closeApproveModal = () => {
    if (actingId) return;
    setApproveModal({ isOpen: false, user: null });
  };

  const confirmApprove = async (user) => {
    if (!user) return;
    setActingId(user.id);
    try {
      await pendingVerificationsApi.approve(user.id);
      toast.success(`${user.full_name || user.email} has been verified as faculty.`);
      setApproveModal({ isOpen: false, user: null });
      // Refresh both lists
      fetchPending();
      fetchFaculty();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setActingId(null);
    }
  };

  // ── Reject handler ────────────────────────────────────────────────────────
  const handleRejectClick = (user) => setRejectModal({ isOpen: true, user });
  const closeRejectModal = () => {
    if (actingId) return;
    setRejectModal({ isOpen: false, user: null });
  };

  const confirmReject = async (user, reason) => {
    if (!user) return;
    setActingId(user.id);
    try {
      await pendingVerificationsApi.reject(user.id, reason);
      toast.success(`Verification request from ${user.full_name || user.email} was rejected.`);
      setRejectModal({ isOpen: false, user: null });
      fetchPending();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcf9] pb-20">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-200 bg-white px-4 py-7">
        <div className="mx-auto flex max-w-350 flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
              Trust And Identity
            </p>
            <h1 className="text-4xl font-black tracking-tighter text-slate-900">
              Faculty <span className="text-primary-800">Verification</span>
            </h1>
          </div>

          <Link
            to="/users"
            className="inline-flex items-center justify-center border-2 border-slate-900 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
          >
            Back To User Management
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-350 px-8 pt-8">
        {/* ── Stats row ──────────────────────────────────────────────────── */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <StatsCard
            title="Awaiting Review"
            value={pendingTotal}
            icon={<ShieldAlert size={18} />}
            accent="text-amber-700 border-amber-600 bg-amber-50"
          />
          <StatsCard
            title="Verified Faculty"
            value={facultyCounts.verified}
            icon={<ShieldCheck size={18} />}
            accent="text-emerald-700 border-emerald-600 bg-emerald-50"
          />
          <StatsCard
            title="Total Faculty"
            value={facultyCounts.all}
            icon={<CheckCircle2 size={18} />}
            accent="text-slate-700 border-slate-600 bg-slate-50"
          />
        </div>

        {/* ══ SECTION 1 — Pending Upload Verifications ══════════════════════ */}
        <div className="mb-12">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">
                Pending Upload Verifications
              </h2>
              <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                Faculty who uploaded a schedule and are awaiting admin approval
              </p>
            </div>

            {/* Search for pending */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-900" size={16} />
              <input
                type="text"
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                placeholder="SEARCH NAME OR EMAIL..."
                className="w-full border-2 border-slate-900 bg-white py-3 pl-11 pr-4 text-[10px] font-bold tracking-widest text-slate-900 placeholder:text-slate-300 focus:translate-x-0.5 focus:translate-y-0.5 focus:outline-none focus:shadow-none"
              />
            </div>
          </div>

          {pendingError && (
            <div className="mb-4 flex items-center gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle size={16} className="shrink-0" />
              {pendingError}
              <button onClick={fetchPending} className="ml-auto text-xs font-bold uppercase tracking-wide underline">
                Retry
              </button>
            </div>
          )}

          <section className="overflow-hidden border-2 border-slate-200 bg-white shadow-[8px_8px_0px_0px_rgba(15,23,42,0.08)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-amber-600 bg-amber-700 text-white">
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Faculty Member</th>
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Latest Upload</th>
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Courses Found</th>
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Uploads</th>
                    <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-[0.2em]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-100">
                  {pendingLoading ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-16 text-center">
                        <Loader2 size={24} className="mx-auto animate-spin text-slate-300" />
                      </td>
                    </tr>
                  ) : pending.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <GraduationCap size={32} className="text-slate-200" />
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">
                            No pending verifications
                          </p>
                          <p className="text-[11px] font-bold text-slate-300">
                            Faculty members will appear here once they upload a schedule
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pending.map((user) => (
                      <tr key={user.id} className="transition-colors hover:bg-amber-50/30">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center border-2 border-amber-600 bg-amber-50 text-sm font-black text-amber-700">
                              {(user.first_name || user.email)?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="text-sm font-black uppercase tracking-tight text-slate-900">
                                {user.full_name || 'Unknown'}
                              </p>
                              <p className="mt-0.5 text-[11px] font-bold tracking-tight text-slate-400">
                                {user.email}
                              </p>
                              <p className="mt-0.5 text-[10px] font-bold text-slate-300">
                                Joined {formatDate(user.created_at)}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-5">
                          {user.latest_schedule ? (
                            <div>
                              <p className="text-xs font-black uppercase tracking-tight text-slate-700">
                                {user.latest_schedule.semester || '—'}{' '}
                                {user.latest_schedule.school_year || ''}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-slate-400">
                                <Clock size={11} />
                                {formatDateTime(user.latest_schedule.created_at)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-300">—</span>
                          )}
                        </td>

                        <td className="px-6 py-5">
                          {user.latest_schedule ? (
                            <span className="flex items-center gap-2 text-xs font-black text-slate-900">
                              <BookOpen size={13} className="text-amber-600" />
                              {user.latest_schedule.course_count}
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-300">—</span>
                          )}
                        </td>

                        <td className="px-6 py-5">
                          <span className="inline-flex border-2 border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-black tabular-nums text-slate-600">
                            {user.schedule_count}
                          </span>
                        </td>

                        <td className="px-6 py-5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApproveClick(user)}
                              disabled={actingId === user.id}
                              className={`border-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                                actingId === user.id
                                  ? 'cursor-not-allowed border-slate-100 bg-white text-slate-300'
                                  : 'border-emerald-700 bg-emerald-600 text-white shadow-[3px_3px_0px_0px_rgba(6,95,70,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
                              }`}
                            >
                              {actingId === user.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                'Approve'
                              )}
                            </button>
                            <button
                              onClick={() => handleRejectClick(user)}
                              disabled={actingId === user.id}
                              className={`border-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                                actingId === user.id
                                  ? 'cursor-not-allowed border-slate-100 bg-white text-slate-300'
                                  : 'border-slate-400 bg-white text-slate-600 shadow-[3px_3px_0px_0px_rgba(100,116,139,0.5)] hover:translate-x-px hover:translate-y-px hover:shadow-none hover:border-red-400 hover:text-red-600'
                              }`}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pending pagination */}
            <div className="flex flex-col items-center justify-between gap-4 border-t-2 border-slate-900 bg-slate-50 px-6 py-5 md:flex-row">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Showing{' '}
                <span className="text-slate-900">
                  {pendingTotal === 0
                    ? 0
                    : (pendingPage - 1) * PENDING_PAGE_SIZE + 1}
                </span>
                –
                <span className="text-slate-900">
                  {Math.min(pendingPage * PENDING_PAGE_SIZE, pendingTotal)}
                </span>{' '}
                / <span className="text-slate-900">{pendingTotal}</span>
              </p>
              <div className="flex items-center gap-6">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">
                  Page {pendingPage} of {pendingPages}
                </span>
                <div className="flex gap-3">
                  <PagBtn onClick={() => setPendingPage((p) => Math.max(1, p - 1))} disabled={pendingPage === 1 || pendingLoading}>
                    <ChevronLeft size={14} /> Prev
                  </PagBtn>
                  <PagBtn onClick={() => setPendingPage((p) => Math.min(pendingPages, p + 1))} disabled={pendingPage >= pendingPages || pendingLoading}>
                    Next <ChevronRight size={14} />
                  </PagBtn>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ══ SECTION 2 — All Faculty Reference ════════════════════════════ */}
        <div>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">
                All Faculty Accounts
              </h2>
              <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                Read-only reference — verification is managed through the queue above
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-900" size={16} />
                <input
                  type="text"
                  value={facultySearch}
                  onChange={(e) => setFacultySearch(e.target.value)}
                  placeholder="SEARCH FACULTY..."
                  className="w-full border-2 border-slate-900 bg-white py-3 pl-11 pr-4 text-[10px] font-bold tracking-widest text-slate-900 placeholder:text-slate-300 focus:translate-x-0.5 focus:translate-y-0.5 focus:outline-none focus:shadow-none"
                />
              </div>

              {/* Tab filters */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'All', value: 'all' },
                  { label: 'Verified', value: 'verified' },
                  { label: 'Unverified', value: 'unverified' },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => { setFacultyTab(tab.value); setFacultyPage(1); }}
                    className={`border-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                      facultyTab === tab.value
                        ? 'translate-x-0.5 translate-y-0.5 border-primary-900 bg-primary-800 text-white shadow-none'
                        : 'border-slate-900 bg-white text-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {facultyError && (
            <div className="mb-4 flex items-center gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle size={16} className="shrink-0" />
              {facultyError}
              <button onClick={fetchFaculty} className="ml-auto text-xs font-bold uppercase tracking-wide underline">
                Retry
              </button>
            </div>
          )}

          <section className="overflow-hidden border-2 border-slate-200 bg-white shadow-[8px_8px_0px_0px_rgba(15,23,42,0.08)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-primary-900 bg-slate-800 text-white">
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Faculty Profile</th>
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Joined</th>
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Account State</th>
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-100">
                  {facultyLoading ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-16 text-center">
                        <Loader2 size={24} className="mx-auto animate-spin text-slate-300" />
                      </td>
                    </tr>
                  ) : facultyPageItems.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-16 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">
                        No faculty records found.
                      </td>
                    </tr>
                  ) : (
                    facultyPageItems.map((user) => (
                      <tr key={user.id} className="transition-colors hover:bg-primary-50/30">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center border-2 border-slate-900 bg-white text-sm font-black text-slate-900">
                              {(user.first_name || user.email)?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="text-sm font-black uppercase tracking-tight text-slate-900">
                                {`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown'}
                              </p>
                              <p className="mt-0.5 text-[11px] font-bold tracking-tight text-slate-400">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-5 text-[11px] font-black uppercase text-slate-500">
                          {formatDate(user.created_at)}
                        </td>

                        <td className="px-6 py-5">
                          <span className={`inline-flex border-2 px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                            user.is_active
                              ? 'border-emerald-600 bg-white text-emerald-600'
                              : 'border-slate-300 bg-slate-100 text-slate-400'
                          }`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            {user.is_verified
                              ? <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                              : <XCircle size={15} className="text-amber-500 shrink-0" />
                            }
                            <span className={`text-[10px] font-black uppercase tracking-widest ${
                              user.is_verified ? 'text-emerald-700' : 'text-amber-700'
                            }`}>
                              {user.is_verified ? 'Verified' : 'Needs Verification'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Faculty pagination */}
            <div className="flex flex-col items-center justify-between gap-4 border-t-2 border-slate-900 bg-slate-50 px-6 py-5 md:flex-row">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Showing{' '}
                <span className="text-slate-900">
                  {filteredFaculty.length === 0 ? 0 : facultyPageStart + 1}
                </span>
                –
                <span className="text-slate-900">
                  {Math.min(facultyPageStart + FACULTY_PAGE_SIZE, filteredFaculty.length)}
                </span>{' '}
                / <span className="text-slate-900">{filteredFaculty.length}</span>
              </p>
              <div className="flex items-center gap-6">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">
                  Page {facultyPage} of {facultyTotalPages}
                </span>
                <div className="flex gap-3">
                  <PagBtn onClick={() => setFacultyPage((p) => Math.max(1, p - 1))} disabled={facultyPage === 1 || facultyLoading}>
                    <ChevronLeft size={14} /> Prev
                  </PagBtn>
                  <PagBtn onClick={() => setFacultyPage((p) => Math.min(facultyTotalPages, p + 1))} disabled={facultyPage >= facultyTotalPages || facultyLoading}>
                    Next <ChevronRight size={14} />
                  </PagBtn>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ── Approve modal ─────────────────────────────────────────────────── */}
      <VerifyFacultyModal
        isOpen={approveModal.isOpen}
        onClose={closeApproveModal}
        onConfirm={() => approveModal.user && confirmApprove(approveModal.user)}
        userName={approveModal.user ? `${approveModal.user.first_name} ${approveModal.user.last_name}` : ''}
        nextVerified={true}
        isLoading={Boolean(actingId)}
      />

      {/* ── Reject modal ─────────────────────────────────────────────────── */}
      <RejectFacultyModal
        isOpen={rejectModal.isOpen}
        onClose={closeRejectModal}
        onConfirm={(reason) => rejectModal.user && confirmReject(rejectModal.user, reason)}
        userName={rejectModal.user ? `${rejectModal.user.first_name} ${rejectModal.user.last_name}` : ''}
        isLoading={Boolean(actingId)}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatsCard({ title, value, icon, accent }) {
  return (
    <div className="border-2 border-slate-900 bg-white p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{title}</p>
        <div className={`flex h-8 w-8 items-center justify-center border-2 ${accent}`}>{icon}</div>
      </div>
      <p className="text-3xl font-black tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function PagBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 border-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
        disabled
          ? 'cursor-not-allowed border-slate-100 bg-white text-slate-200'
          : 'border-slate-900 bg-white text-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
      }`}
    >
      {children}
    </button>
  );
}
