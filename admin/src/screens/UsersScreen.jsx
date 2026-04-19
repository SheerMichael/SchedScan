import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Shield, ChevronLeft, ChevronRight, UserMinus, Power, Loader2, AlertCircle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import DeactivateUserModal from '../components/modal/DeactivateUserModal';
import VerifyFacultyModal from '../components/modal/VerifyFacultyModal';
import UserDetailsModal from '../components/modal/user_details';
import { usersApi, pendingVerificationsApi, parseApiError } from '../services/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function UsersScreen() {
  // --- Remote state ---
  const [users, setUsers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Filter / pagination state ---
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState(''); // '' | 'student' | 'faculty' | 'parent'
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Debounce search input — avoid firing a request on every keystroke
  const searchDebounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchTerm]);

  // --- Modal state ---
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [targetUser, setTargetUser] = useState(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState(null);
  const [verifyingUserId, setVerifyingUserId] = useState(null);
  const [verifyModalState, setVerifyModalState] = useState({
    isOpen: false,
    user: null,
    nextVerified: false,
  });

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsUser, setDetailsUser] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const detailsRequestSeq = useRef(0);

  // Pending verification count for the banner badge
  const [pendingVerificationCount, setPendingVerificationCount] = useState(null);

  // -----------------------------------------------------------------------
  // Fetch users whenever filters / page change
  // -----------------------------------------------------------------------
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: currentPage,
        page_size: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (roleFilter) params.user_type = roleFilter;

      const { data } = await usersApi.list(params);
      setUsers(data.results);
      setTotalCount(data.count);
      setTotalPages(data.total_pages);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Fetch pending verification count for the banner badge
  useEffect(() => {
    pendingVerificationsApi.list({ page_size: 1 })
      .then(({ data }) => setPendingVerificationCount(data.count ?? 0))
      .catch(() => {});
  }, []);

  // -----------------------------------------------------------------------
  // Deactivate / reactivate
  // -----------------------------------------------------------------------
  const openDeactivateModal = (user) => {
    setTargetUser(user);
    setDeactivateError(null);
    setIsDeactivateOpen(true);
  };

  const handleStatusToggle = async () => {
    if (!targetUser) return;
    setDeactivating(true);
    setDeactivateError(null);

    try {
      await usersApi.setActive(targetUser.id, !targetUser.is_active);
      // Optimistically update the local list
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id ? { ...u, is_active: !u.is_active } : u
        )
      );
      setIsDeactivateOpen(false);
      setTargetUser(null);
    } catch (err) {
      setDeactivateError(parseApiError(err).message);
    } finally {
      setDeactivating(false);
    }
  };

  const handleVerifyToggle = (user) => {
    if (!user || user.user_type !== 'faculty') return;
    setVerifyModalState({
      isOpen: true,
      user,
      nextVerified: !user.is_verified,
    });
  };

  // NOTE: handleRoleChange has been intentionally removed.
  // Arbitrary role changes are no longer supported — faculty status is granted
  // exclusively through the faculty schedule upload → admin approval workflow.

  const closeVerifyModal = () => {
    if (verifyingUserId) return;
    setVerifyModalState({
      isOpen: false,
      user: null,
      nextVerified: false,
    });
  };

  const confirmVerifyToggle = async (user) => {
    if (
      !user ||
      user.user_type !== 'faculty' ||
      !verifyModalState.user ||
      verifyModalState.user.id !== user.id
    ) {
      return;
    }

    setVerifyingUserId(user.id);
    setError(null);

    try {
      await usersApi.setVerified(user.id, verifyModalState.nextVerified);
      setUsers((prev) =>
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

  const openDetailsModal = async (user) => {
    const requestId = ++detailsRequestSeq.current;

    const baseUser = {
      ...user,
      name: `${user.first_name} ${user.last_name}`.trim() || user.full_name,
      role: capitalize(user.user_type),
      status: user.is_active ? 'Active' : 'Inactive',
      joinDate: new Date(user.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      }),
      schedule: [],
      linked_students: [],
      linked_parents: [],
      enrolled_students: [],
    };

    setDetailsUser(baseUser);
    setDetailsError(null);
    setDetailsLoading(true);
    setIsDetailsOpen(true);

    try {
      const { data } = await usersApi.getActivity(user.id);

      if (requestId !== detailsRequestSeq.current) return;

      const schedule = data.current_schedule_courses || [];

      const linkedStudents = (data.child_links || []).map((link) => ({
        id: link.child_id,
        first_name: link.child__first_name,
        last_name: link.child__last_name,
        name: `${link.child__first_name || ''} ${link.child__last_name || ''}`.trim(),
        email: link.child__email,
        student_number: link.child__student_number,
        role: 'Student',
        status: 'Active',
      }));

      const linkedParents = (data.parent_links || []).map((link) => ({
        id: link.parent_id,
        first_name: link.parent__first_name,
        last_name: link.parent__last_name,
        name: `${link.parent__first_name || ''} ${link.parent__last_name || ''}`.trim(),
        email: link.parent__email,
        role: 'Parent',
        status: 'Active',
      }));

      const enrolledStudents = (data.faculty_enrollments || []).map((enrollment) => ({
        id: enrollment.student_id,
        first_name: enrollment.student__first_name,
        last_name: enrollment.student__last_name,
        name: `${enrollment.student__first_name || ''} ${enrollment.student__last_name || ''}`.trim(),
        email: enrollment.student__email,
        role: 'Student',
        status: 'Active',
        subject_code: enrollment.subject_code,
      }));

      setDetailsUser((prev) => ({
        ...prev,
        schedule,
        linked_students: linkedStudents,
        linked_parents: linkedParents,
        enrolled_students: enrolledStudents,
      }));
    } catch (err) {
      if (requestId !== detailsRequestSeq.current) return;
      setDetailsError(parseApiError(err).message);
    } finally {
      if (requestId === detailsRequestSeq.current) {
        setDetailsLoading(false);
      }
    }
  };

  // -----------------------------------------------------------------------
  // Pagination index helpers
  // -----------------------------------------------------------------------
  const indexOfFirstItem = (currentPage - 1) * PAGE_SIZE + 1;
  const indexOfLastItem = Math.min(currentPage * PAGE_SIZE, totalCount);

  return (
    <div className="min-h-screen bg-[#fcfcf9] no-scrollbar pb-20">
      <Header />

      <div className="p-8 max-w-350 mx-auto">
        <div className="mb-8 border-2 border-slate-900 bg-primary-50 p-4 shadow-[4px_4px_0px_0px_rgba(127,29,29,0.3)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-700">Identity Control</p>
              <p className="text-sm font-black uppercase tracking-wide text-slate-900">Need to confirm real faculty accounts?</p>
              {pendingVerificationCount !== null && pendingVerificationCount > 0 && (
                <p className="mt-1 text-[11px] font-bold text-amber-700">
                  <span className="inline-flex items-center justify-center border-2 border-amber-600 bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700 mr-1.5">
                    {pendingVerificationCount}
                  </span>
                  {pendingVerificationCount === 1 ? 'faculty member awaits' : 'faculty members await'} verification
                </p>
              )}
            </div>
            <Link
              to="/faculty-verification"
              className="inline-flex items-center justify-center border-2 border-primary-900 bg-primary-800 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-[3px_3px_0px_0px_rgba(127,29,29,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
            >
              Open Faculty Verification
            </Link>
          </div>
        </div>

        {/* Search + filter row */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-10">
          <div className="relative w-full md:w-112.5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-900" size={18} />
            <input
              type="text"
              placeholder="SEARCH REGISTRY..."
              className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-slate-900 rounded-none shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] focus:outline-none focus:translate-x-0.5 focus:translate-y-0.5 focus:shadow-none transition-all font-bold text-xs tracking-widest placeholder:text-slate-300"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { label: 'TRACK ALL', filter: '' },
              { label: 'TRACK FACULTY', filter: 'faculty' },
              { label: 'TRACK STUDENTS', filter: 'student' },
              { label: 'TRACK PARENTS', filter: 'parent' },
            ].map((btn) => (
              <button
                key={btn.label}
                className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest border-2 border-slate-900 transition-all ${
                  roleFilter === btn.filter
                    ? 'bg-primary-800 text-white shadow-none translate-x-0.5 translate-y-0.5'
                    : 'bg-white text-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] hover:bg-slate-50'
                }`}
                onClick={() => { setRoleFilter(btn.filter); setCurrentPage(1); }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
            <AlertCircle size={16} className="shrink-0" />
            {error}
            <button onClick={fetchUsers} className="ml-auto text-xs font-bold underline">Retry</button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white border-2 border-slate-200 rounded-none shadow-[8px_8px_0px_0px_rgba(185,28,28,0.08)] overflow-hidden hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white border-b-2 border-primary-900">
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">User Identification</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Institutional Role</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">State</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Registry Date</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Access Tier</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right">Functions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-16 text-center">
                      <Loader2 size={24} className="animate-spin text-slate-300 mx-auto" />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-16 text-center text-slate-300 text-[10px] font-black uppercase tracking-[0.4em]">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const statusLabel = user.is_active ? 'Active' : 'Inactive';
                    const joinDate = new Date(user.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    });

                    return (
                      <tr
                        key={user.id}
                        onClick={() => openDetailsModal(user)}
                        className="hover:bg-primary-50/30 transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 border-2 border-slate-900 bg-white flex items-center justify-center text-slate-900 font-black text-sm">
                              {user.first_name?.charAt(0) || '?'}
                            </div>
                            <div>
                              <p className="font-black text-slate-900 tracking-tight leading-none mb-1">
                                {(user.first_name + ' ' + user.last_name).toUpperCase()}
                              </p>
                              <p className="text-[11px] font-bold text-slate-400 tracking-tighter">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="flex items-center gap-2 text-[10px] font-black text-slate-900 uppercase tracking-widest">
                            <Shield size={12} className="text-primary-700" />
                            {capitalize(user.user_type)}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1 border-2 text-[10px] font-black uppercase tracking-widest ${
                            user.is_active
                              ? 'bg-white border-emerald-600 text-emerald-600'
                              : 'bg-slate-100 border-slate-300 text-slate-400'
                          }`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-[11px] font-black text-slate-500 uppercase">{joinDate}</td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1 border-2 text-[10px] font-black uppercase tracking-widest ${
                            user.has_premium
                              ? 'bg-primary-800 border-primary-800 text-white'
                              : 'bg-white border-slate-900 text-slate-900'
                          }`}>
                            {user.has_premium ? 'Premium' : 'Standard'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="inline-flex items-center gap-2">
                            {/* Role dropdown removed — role changes are not supported via admin panel.
                                Faculty status is granted through the upload → verification workflow. */}

                            {user.user_type === 'faculty' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleVerifyToggle(user); }}
                                disabled={verifyingUserId === user.id}
                                title={user.is_verified ? 'Faculty is verified' : 'Awaiting verification via Faculty Verification screen'}
                                className={`p-2 border-2 transition-all ${
                                  verifyingUserId === user.id
                                    ? 'border-slate-100 text-slate-200 cursor-not-allowed'
                                    : user.is_verified
                                      ? 'border-emerald-600 text-emerald-600 hover:bg-emerald-50'
                                      : 'border-amber-500 text-amber-600 hover:bg-amber-50'
                                }`}
                              >
                                {user.is_verified ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                              </button>
                            )}

                            <button
                              onClick={(e) => { e.stopPropagation(); openDeactivateModal(user); }}
                              className={`p-2 border-2 transition-all ${
                                user.is_active
                                  ? 'border-slate-200 text-slate-300 hover:border-primary-700 hover:text-primary-700 hover:bg-primary-50'
                                  : 'border-emerald-600 text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              {user.is_active ? <UserMinus size={16} /> : <Power size={16} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-6 bg-slate-50 border-t-2 border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
              Records:{' '}
              <span className="text-slate-900">
                {totalCount > 0 ? `${indexOfFirstItem}-${indexOfLastItem}` : '0'}
              </span>{' '}
              / <span className="text-slate-900">{totalCount}</span>
            </p>

            <div className="flex items-center gap-6">
              <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                Page {currentPage} of {totalPages || 1}
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                  className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                    currentPage === 1 || loading
                      ? 'bg-white border-slate-100 text-slate-200 cursor-not-allowed'
                      : 'bg-white border-slate-900 text-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
                  }`}
                >
                  <ChevronLeft size={14} /> PREV
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0 || loading}
                  className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                    currentPage === totalPages || totalPages === 0 || loading
                      ? 'bg-white border-slate-100 text-slate-200 cursor-not-allowed'
                      : 'bg-white border-slate-900 text-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
                  }`}
                >
                  NEXT <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deactivate / reactivate modal */}
      <DeactivateUserModal
        isOpen={isDeactivateOpen}
        onClose={() => { setIsDeactivateOpen(false); setDeactivateError(null); }}
        onConfirm={handleStatusToggle}
        userName={targetUser ? `${targetUser.first_name} ${targetUser.last_name}` : ''}
        currentStatus={targetUser?.is_active ? 'Active' : 'Inactive'}
        isLoading={deactivating}
        errorMsg={deactivateError}
      />

      <VerifyFacultyModal
        isOpen={verifyModalState.isOpen}
        onClose={closeVerifyModal}
        onConfirm={() => verifyModalState.user && confirmVerifyToggle(verifyModalState.user)}
        userName={verifyModalState.user ? `${verifyModalState.user.first_name} ${verifyModalState.user.last_name}` : ''}
        nextVerified={verifyModalState.nextVerified}
        isLoading={Boolean(verifyingUserId)}
      />

      {/* User details modal */}
      <UserDetailsModal
        key={detailsUser?.id || 'no-user'}
        isOpen={isDetailsOpen}
        onClose={() => {
          detailsRequestSeq.current += 1;
          setIsDetailsOpen(false);
          setDetailsLoading(false);
          setDetailsError(null);
        }}
        user={detailsUser}
        loading={detailsLoading}
        error={detailsError}
      />
    </div>
  );
}

function Header() {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-7">
      <div className="max-w-350 mx-auto relative z-10">
        <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
          User <span className="text-primary-800">Management</span>
        </h1>
      </div>
    </header>
  );
}


