import { useState, useMemo } from 'react';
import { Search, AlertCircle, Clock, ChevronLeft, ChevronRight, Trash2, Wrench, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

const logsData = [
  { id: 1, name: "John Doe", time: "2026-03-10 14:30:22", main_error: "Scanner Error", extra_details: "Not Scanning", status: "Investigating" },
  { id: 2, name: "Sarah Smith", time: "2026-03-10 13:15:05", main_error: "Scanner Error", extra_details: "Ayaw mag scan", status: "Resolved" },
  { id: 3, name: "System Admin", time: "2026-03-10 12:00:00", main_error: "Scanner Error", extra_details: "Kulang schedule", status: "Investigating" },
  { id: 4, name: "David Wilson", time: "2026-03-10 11:45:30", main_error: "Scanner Error", extra_details: "idk", status: "Pending" },
];

// Status and Actions are placeholders for now the functionality will be implemented later.

export default function ReportsLogsScreen() {
  const [logs] = useState(logsData);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Memoized filtered and sorted logs
  const processedLogs = useMemo(() => {
    let result = logs.filter(log => 
      log.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.main_error.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.extra_details.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Date Sorting Logic
    result.sort((a, b) => {
      const dateA = new Date(a.time);
      const dateB = new Date(b.time);
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [logs, searchTerm, sortOrder]);

  const totalPages = Math.ceil(processedLogs.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = processedLogs.slice(indexOfFirstItem, indexOfLastItem);

  const toggleSort = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    setCurrentPage(1);
  };

  const goToNextPage = () => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); };
  const goToPreviousPage = () => { if (currentPage > 1) setCurrentPage(currentPage - 1); };

  return (
    <div className="min-h-screen bg-[#fcfcf9] no-scrollbar pb-20">
      <Header />
      
      <div className="p-8 max-w-350 mx-auto"> 
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-10">
          <div className="relative w-full md:w-112.5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-900" size={18} />
            <input 
              type="text"
              placeholder="SEARCH SYSTEM LOGS..."
              className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-slate-900 rounded-none shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] focus:outline-none focus:translate-x-0.5 focus:translate-y-0.5 focus:shadow-none transition-all font-bold text-xs tracking-widest placeholder:text-slate-300"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>

          <button 
            onClick={toggleSort}
            className="flex items-center gap-3 px-6 py-3.5 bg-white border-2 border-slate-900 text-[10px] font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
          >
            {sortOrder === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
            Sort by: {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
          </button>
        </div>

        <div className="bg-white border-2 border-slate-900 rounded-none shadow-[8px_8px_0px_0px_rgba(185,28,28,0.08)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white border-b-2 border-primary-900">
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Originator</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">
                    <div className="flex items-center gap-2">
                        Timestamp <ArrowUpDown size={12} className="opacity-50" />
                    </div>
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Error Signature</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Incident Details</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Status</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-100">
                {currentItems.map((log) => (
                  <tr key={log.id} className="hover:bg-primary-50/30 transition-colors group">
                    <td className="px-6 py-5">
                      <p className="font-black text-slate-900 tracking-tight leading-none uppercase">{log.name}</p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-tighter">
                        <Clock size={12} className="text-primary-700" />
                        {log.time}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="flex items-center gap-2 text-[10px] font-black text-primary-800 uppercase tracking-widest">
                        <AlertCircle size={14} />
                        {log.main_error}
                      </span>
                    </td>
                    <td className="px-6 py-5 max-w-xs">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter truncate">
                        {log.extra_details}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-3 py-1 border-2 border-slate-900 text-[10px] font-black uppercase tracking-widest bg-white">
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button className="p-2 border-2 border-slate-200 text-slate-300 hover:border-slate-900 hover:text-slate-900 transition-all">
                          <Wrench size={16} />
                        </button>
                        <button className="p-2 border-2 border-slate-200 text-slate-300 hover:border-primary-700 hover:text-primary-700 transition-all">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            
          <div className="px-6 py-6 bg-slate-50 border-t-2 border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
              Reports Found: <span className="text-slate-900">{processedLogs.length}</span>
            </p>
            
            <div className="flex items-center gap-6">
              <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                Page {currentPage} of {totalPages || 1}
              </span>
              <div className="flex gap-3">
                <button 
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                    currentPage === 1 
                    ? 'bg-white border-slate-100 text-slate-200 cursor-not-allowed' 
                    : 'bg-white border-slate-900 text-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] hover:translate-x-px hover:translate-y-px hover:shadow-none'
                  }`}
                >
                  <ChevronLeft size={14} /> PREV
                </button>
                <button 
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                    (currentPage === totalPages || totalPages === 0)
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
    </div>
  );
}

function Header() {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-7">
      <div className="max-w-350 mx-auto relative z-10">
        <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
          Report <span className="text-primary-800">Logs</span>
        </h1>
      </div>
    </header>
  );
}