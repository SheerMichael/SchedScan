import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import VerifyFacultyModal from '../components/modal/VerifyFacultyModal';
import { usersApi, parseApiError } from '../services/api';

const PAGE_SIZE = 10;
const BULK_PAGE_SIZE = 100;

function statusPill(isVerified) {
  return isVerified
    ? 'bg-emerald-50 border-emerald-600 text-emerald-700'
    : 'bg-amber-50 border-amber-600 text-amber-700';
}

export default function FacultyVerificationScreen() {
  const [facultyUsers, setFacultyUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState('pending');
  const [currentPage, setCurrentPage] = useState(1);
  const [verifyingUserId, setVerifyingUserId] = useState(null);
  const [verifyModalState, setVerifyModalState] = useState({
    isOpen: false,
    user: null,
    nextVerified: false,
  });

  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [searchTerm]);

  const fetchFaculty = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let page = 1;
      let totalPages = 1;
      const aggregated = [];

      while (page <= totalPages) {
        const { data } = await usersApi.list({
          page,
          page_size: BULK_PAGE_SIZE,
          user_type: 'faculty',
          search: debouncedSearch || undefined,
        });

        aggregated.push(...(data.results || []));
        totalPages = data.total_pages || 1;
        page += 1;
      }

      setFacultyUsers(aggregated);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchFaculty();
  }, [fetchFaculty]);

  const counts = useMemo(() => {
    const verified = facultyUsers.filter((u) => u.is_verified).length;
    const pending = facultyUsers.length - verified;
    return {
      all: facultyUsers.length,
      verified,
      pending,
    };
  }, [facultyUsers]);

  const filteredUsers = useMemo(() => {
    if (activeTab === 'verified') return facultyUsers.filter((u) => u.is_verified);
    if (activeTab === 'pending') return facultyUsers.filter((u) => !u.is_verified);
    return facultyUsers;
  }, [activeTab, facultyUsers]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredUsers.slice(pageStart, pageStart + PAGE_SIZE);

  const handleVerifyToggle = (user) => {
    if (!user) return;
    setVerifyModalState({
      isOpen: true,
      user,
      nextVerified: !user.is_verified,
    });
  };

  const closeVerifyModal = () => {
    if (verifyingUserId) return;
    setVerifyModalState({
      isOpen: false,
      user: null,
      nextVerified: false,
    });
  };

  const confirmVerifyToggle = async (user) => {
    if (!user || !verifyModalState.user || verifyModalState.user.id !== user.id) return;

    setVerifyingUserId(user.id);
    setError(null);

    try {
      await usersApi.setVerified(user.id, verifyModalState.nextVerified);
      setFacultyUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, is_verified: verifyModalState.nextVerified } : u
        )
      );

      toast.success(
        verifyModalState.nextVerified
          ? 'Faculty account verified successfully.'
          : 'Faculty account marked as unverified.'
      );

      setVerifyModalState({
        isOpen: false,
        user: null,
        nextVerified: false,
      });
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setVerifyingUserId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcf9] pb-20">
      <header className="border-b border-slate-200 bg-white px-4 py-7">
        <div className="mx-auto flex max-w-350 flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Trust And Identity</p>
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
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <StatsCard
            title="Pending Review"
            value={counts.pending}
            icon={<ShieldAlert size={18} />}
            accent="text-amber-700 border-amber-600 bg-amber-50"
          />
          <StatsCard
            title="Verified Faculty"
            value={counts.verified}
            icon={<ShieldCheck size={18} />}
            accent="text-emerald-700 border-emerald-600 bg-emerald-50"
          />
          <StatsCard
            title="Total Faculty"
            value={counts.all}
            icon={<CheckCircle2 size={18} />}
            accent="text-slate-700 border-slate-600 bg-slate-50"
          />
        </div>

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:w-112.5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-900" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="SEARCH FACULTY NAME OR EMAIL..."
              className="w-full border-2 border-slate-900 bg-white py-3.5 pl-12 pr-4 text-xs font-bold tracking-widest text-slate-900 placeholder:text-slate-300 focus:translate-x-0.5 focus:translate-y-0.5 focus:outline-none focus:shadow-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Needs Review', value: 'pending' },
              { label: 'Verified', value: 'verified' },
              { label: 'All Faculty', value: 'all' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setActiveTab(tab.value);
                  setCurrentPage(1);
                }}
                className={`border-2 px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === tab.value
                    ? 'translate-x-0.5 translate-y-0.5 border-primary-900 bg-primary-800 text-white shadow-none'
                    : 'border-slate-900 bg-white text-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            <AlertCircle size={16} className="shrink-0" />
            {error}
            <button
              onClick={fetchFaculty}
              className="ml-auto text-xs font-bold uppercase tracking-wide underline"
            >
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
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Registration Date</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Account State</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Verification</th>
                  <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-[0.2em]">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y-2 divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-16 text-center">
                      <Loader2 size={24} className="mx-auto animate-spin text-slate-300" />
                    </td>
                  </tr>
                ) : pageItems.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-16 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">
                      No faculty records found.
                    </td>
                  </tr>
                ) : (
                  pageItems.map((user) => {
                    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
                    const createdAt = new Date(user.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });

                    return (
                      <tr key={user.id} className="transition-colors hover:bg-primary-50/30">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center border-2 border-slate-900 bg-white text-sm font-black text-slate-900">
                              {fullName.charAt(0) || '?'}
                            </div>
                            <div>
                              <p className="leading-none text-slate-900">
                                <span className="text-sm font-black uppercase tracking-tight">{fullName || 'Unknown Faculty'}</span>
                              </p>
                              <p className="mt-1 text-[11px] font-bold tracking-tight text-slate-400">{user.email}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-5 text-[11px] font-black uppercase text-slate-500">{createdAt}</td>

                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex border-2 px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                              user.is_active
                                ? 'border-emerald-600 bg-white text-emerald-600'
                                : 'border-slate-300 bg-slate-100 text-slate-400'
                            }`}
                          >
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        <td className="px-6 py-5">
                          <span className={`inline-flex border-2 px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusPill(user.is_verified)}`}>
                            {user.is_verified ? 'Verified' : 'Needs Verification'}
                          </span>
                        </td>

                        <td className="px-6 py-5 text-right">
                          <button
                            onClick={() => handleVerifyToggle(user)}
                            disabled={verifyingUserId === user.id}
                            className={`border-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                              verifyingUserId === user.id
                                ? 'cursor-not-allowed border-slate-100 bg-white text-slate-300'
                                : user.is_verified
                                  ? 'border-amber-600 bg-amber-500 text-white shadow-[3px_3px_0px_0px_rgba(146,64,14,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
                                  : 'border-emerald-700 bg-emerald-600 text-white shadow-[3px_3px_0px_0px_rgba(6,95,70,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
                            }`}
                          >
                            {verifyingUserId === user.id
                              ? 'Saving...'
                              : user.is_verified
                                ? 'Mark Unverified'
                                : 'Confirm Faculty'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t-2 border-slate-900 bg-slate-50 px-6 py-6 md:flex-row">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Showing <span className="text-slate-900">{filteredUsers.length === 0 ? 0 : pageStart + 1}</span>-<span className="text-slate-900">{Math.min(pageStart + PAGE_SIZE, filteredUsers.length)}</span> / <span className="text-slate-900">{filteredUsers.length}</span>
            </p>

            <div className="flex items-center gap-6">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                  className={`flex items-center gap-2 border-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                    currentPage === 1 || loading
                      ? 'cursor-not-allowed border-slate-100 bg-white text-slate-200'
                      : 'border-slate-900 bg-white text-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
                  }`}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || loading}
                  className={`flex items-center gap-2 border-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                    currentPage >= totalPages || loading
                      ? 'cursor-not-allowed border-slate-100 bg-white text-slate-200'
                      : 'border-slate-900 bg-white text-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
                  }`}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <VerifyFacultyModal
        isOpen={verifyModalState.isOpen}
        onClose={closeVerifyModal}
        onConfirm={() => verifyModalState.user && confirmVerifyToggle(verifyModalState.user)}
        userName={
          verifyModalState.user
            ? `${verifyModalState.user.first_name} ${verifyModalState.user.last_name}`
            : ''
        }
        nextVerified={verifyModalState.nextVerified}
        isLoading={Boolean(verifyingUserId)}
      />
    </div>
  );
}

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
