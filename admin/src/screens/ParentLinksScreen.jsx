import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Unlink,
  UserPlus,
} from 'lucide-react';
import { parentLinksApi, usersApi, parseApiError } from '../services/api';

const PAGE_SIZE = 10;

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ParentLinksScreen() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'active' | 'revoked'
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  const [studentNumber, setStudentNumber] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [parentOptions, setParentOptions] = useState([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [selectedParent, setSelectedParent] = useState(null);

  const parentSearchDebounceRef = useRef(null);
  const linksSearchDebounceRef = useRef(null);
  const linksRequestVersionRef = useRef(0);
  const parentsRequestVersionRef = useRef(0);
  const [debouncedParentSearch, setDebouncedParentSearch] = useState('');

  useEffect(() => {
    clearTimeout(linksSearchDebounceRef.current);
    linksSearchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);
    return () => clearTimeout(linksSearchDebounceRef.current);
  }, [search]);

  useEffect(() => {
    clearTimeout(parentSearchDebounceRef.current);
    parentSearchDebounceRef.current = setTimeout(() => {
      setDebouncedParentSearch(parentSearch.trim());
    }, 350);
    return () => clearTimeout(parentSearchDebounceRef.current);
  }, [parentSearch]);

  const fetchLinks = useCallback(async () => {
    const requestVersion = linksRequestVersionRef.current + 1;
    linksRequestVersionRef.current = requestVersion;

    setLoading(true);
    setError(null);

    try {
      const params = {
        page: currentPage,
        page_size: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;

      const { data } = await parentLinksApi.list(params);
      if (requestVersion !== linksRequestVersionRef.current) return;
      setLinks(data.results);
      setTotalCount(data.count);
      setTotalPages(data.total_pages);
    } catch (err) {
      if (requestVersion !== linksRequestVersionRef.current) return;
      setError(parseApiError(err).message);
    } finally {
      if (requestVersion === linksRequestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [currentPage, debouncedSearch, statusFilter]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  useEffect(() => {
    if (!debouncedParentSearch) {
      setParentOptions([]);
      return;
    }

    const requestVersion = parentsRequestVersionRef.current + 1;
    parentsRequestVersionRef.current = requestVersion;

    setLoadingParents(true);
    usersApi
      .list({ user_type: 'parent', search: debouncedParentSearch, page: 1, page_size: 20 })
      .then(({ data }) => {
        if (requestVersion !== parentsRequestVersionRef.current) return;
        setParentOptions(data.results || []);
      })
      .catch(() => {
        if (requestVersion !== parentsRequestVersionRef.current) return;
        setParentOptions([]);
      })
      .finally(() => {
        if (requestVersion === parentsRequestVersionRef.current) {
          setLoadingParents(false);
        }
      });
  }, [debouncedParentSearch]);

  const handleCreateLink = async (e) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (!selectedParent?.id) {
      setCreateError('Select a parent account first.');
      return;
    }
    if (!studentNumber.trim()) {
      setCreateError('Student number is required.');
      return;
    }

    setCreating(true);
    try {
      await parentLinksApi.create({
        parent_id: selectedParent.id,
        student_number: studentNumber.trim(),
      });

      setCreateSuccess('Parent-student link created successfully.');
      setStudentNumber('');
      setParentSearch('');
      setDebouncedParentSearch('');
      setParentOptions([]);
      setSelectedParent(null);
      setCurrentPage(1);
      await fetchLinks();
    } catch (err) {
      setCreateError(parseApiError(err).message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (link) => {
    if (link.status !== 'active') return;

    const ok = window.confirm(
      `Revoke link between ${link.parent_email} and ${link.child_email}?`
    );
    if (!ok) return;

    setCreateError(null);
    setCreateSuccess(null);
    setRevokingId(link.id);
    try {
      await parentLinksApi.revoke(link.id);
      setCreateSuccess('Link revoked successfully.');
      await fetchLinks();
    } catch (err) {
      setCreateError(parseApiError(err).message);
    } finally {
      setRevokingId(null);
    }
  };

  const showingFrom = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(currentPage * PAGE_SIZE, totalCount);

  const selectedParentLabel = useMemo(() => {
    if (!selectedParent) return 'No parent selected';
    const fullName = `${selectedParent.first_name || ''} ${selectedParent.last_name || ''}`.trim();
    return `${fullName || selectedParent.email} (${selectedParent.email})`;
  }, [selectedParent]);

  return (
    <div className="min-h-screen bg-[#fcfcf9] no-scrollbar pb-20">
      <Header />

      <div className="p-8 max-w-350 mx-auto space-y-8">
        <section className="bg-white border-2 border-slate-200 rounded-none shadow-[8px_8px_0px_0px_rgba(185,28,28,0.08)] p-6">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-5 flex items-center gap-2">
            <UserPlus size={15} className="text-primary-800" />
            Create Parent-Student Link
          </h2>

          <form onSubmit={handleCreateLink} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Parent Account</label>
              <input
                type="text"
                value={parentSearch}
                onChange={(e) => {
                  setParentSearch(e.target.value);
                  setSelectedParent(null);
                  setCreateError(null);
                }}
                placeholder="Search parent by name/email..."
                className="w-full px-4 py-3 bg-white border-2 border-slate-900 text-xs font-bold tracking-wide focus:outline-none"
              />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Selected: <span className="text-slate-700">{selectedParentLabel}</span>
              </p>
              {loadingParents && <Loader2 size={14} className="animate-spin text-slate-400" />}
              {!loadingParents && parentOptions.length > 0 && (
                <div className="max-h-36 overflow-y-auto border-2 border-slate-200 bg-slate-50">
                  {parentOptions.map((parent) => {
                    const fullName = `${parent.first_name || ''} ${parent.last_name || ''}`.trim();
                    return (
                      <button
                        key={parent.id}
                        type="button"
                        onClick={() => {
                          setSelectedParent(parent);
                          setParentSearch(fullName || parent.email);
                          setParentOptions([]);
                        }}
                        className="w-full text-left px-3 py-2 border-b border-slate-200 last:border-b-0 hover:bg-white"
                      >
                        <p className="text-xs font-black text-slate-900 uppercase tracking-wide">{fullName || 'Unnamed Parent'}</p>
                        <p className="text-[10px] font-bold text-slate-400 tracking-wide">{parent.email}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Student Number</label>
              <input
                type="text"
                value={studentNumber}
                onChange={(e) => {
                  setStudentNumber(e.target.value);
                  setCreateError(null);
                }}
                placeholder="e.g. 2022-01191"
                className="w-full px-4 py-3 bg-white border-2 border-slate-900 text-xs font-bold tracking-wide focus:outline-none"
              />
              <button
                type="submit"
                disabled={creating}
                className={`w-full px-4 py-3 border-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                  creating
                    ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                    : 'bg-slate-900 border-slate-900 text-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
                }`}
              >
                {creating ? 'Creating...' : 'Create Link'}
              </button>
            </div>
          </form>

          {createError && (
            <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
              <AlertCircle size={16} className="shrink-0" />
              {createError}
            </div>
          )}
          {createSuccess && (
            <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
              <CheckCircle2 size={16} className="shrink-0" />
              {createSuccess}
            </div>
          )}
        </section>

        <section className="bg-white border-2 border-slate-200 rounded-none shadow-[8px_8px_0px_0px_rgba(185,28,28,0.08)] overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50 flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
            <div className="relative w-full xl:w-112.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search parent/child/email/student #..."
                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-900 text-xs font-bold tracking-wide focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              {[
                { label: 'All', value: '' },
                { label: 'Active', value: 'active' },
                { label: 'Revoked', value: 'revoked' },
              ].map((option) => (
                <button
                  key={option.label}
                  onClick={() => {
                    setStatusFilter(option.value);
                    setCurrentPage(1);
                  }}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                    statusFilter === option.value
                      ? 'bg-primary-800 border-primary-800 text-white'
                      : 'bg-white border-slate-300 text-slate-500 hover:border-slate-900 hover:text-slate-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="m-6 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
              <AlertCircle size={16} className="shrink-0" />
              {error}
              <button onClick={fetchLinks} className="ml-auto text-xs font-bold underline">Retry</button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white border-b-2 border-primary-900">
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Parent</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Student</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Student #</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Status</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Linked At</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-16 text-center">
                      <Loader2 size={24} className="animate-spin text-slate-300 mx-auto" />
                    </td>
                  </tr>
                ) : links.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-16 text-center text-slate-300 text-[10px] font-black uppercase tracking-[0.4em]">
                      No links found.
                    </td>
                  </tr>
                ) : (
                  links.map((link) => (
                    <tr key={link.id} className="hover:bg-primary-50/30 transition-colors">
                      <td className="px-6 py-5">
                        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{link.parent_name || '—'}</p>
                        <p className="text-[10px] font-bold text-slate-400 tracking-tight">{link.parent_email}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{link.child_name || '—'}</p>
                        <p className="text-[10px] font-bold text-slate-400 tracking-tight">{link.child_email}</p>
                      </td>
                      <td className="px-6 py-5 text-[11px] font-black text-slate-600 uppercase">{link.child_student_number || '—'}</td>
                      <td className="px-6 py-5">
                        <span className={`px-3 py-1 border-2 text-[10px] font-black uppercase tracking-widest ${
                          link.status === 'active'
                            ? 'bg-white border-emerald-600 text-emerald-600'
                            : 'bg-slate-100 border-slate-300 text-slate-400'
                        }`}>
                          {link.status}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-[11px] font-black text-slate-500 uppercase">{formatDate(link.linked_at)}</td>
                      <td className="px-6 py-5 text-right">
                        <button
                          onClick={() => handleRevoke(link)}
                          disabled={link.status !== 'active' || revokingId === link.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                            link.status !== 'active' || revokingId === link.id
                              ? 'bg-white border-slate-100 text-slate-200 cursor-not-allowed'
                              : 'bg-white border-slate-900 text-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
                          }`}
                        >
                          {revokingId === link.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Unlink size={12} />
                          )}
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-6 bg-slate-50 border-t-2 border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
              Records: <span className="text-slate-900">{showingFrom}-{showingTo}</span> / <span className="text-slate-900">{totalCount}</span>
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
        </section>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-7">
      <div className="max-w-350 mx-auto relative z-10">
        <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
          Parent-Student <span className="text-primary-800">Link Manager</span>
        </h1>
      </div>
    </header>
  );
}
