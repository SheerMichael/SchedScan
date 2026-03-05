import { useState } from 'react';
import { Search, Shield, ChevronLeft, ChevronRight, UserMinus, Power } from 'lucide-react';
import DeactivateUserModal from '../components/modal/DeactivateUserModal';
import UserDetailsModal from '../components/modal/user_details';

const usersData = [
  { id: 1, name: "John Doe", phone_number: "123-456-7890", email: "john@example.com", role: "Student", status: "Active", joinDate: "Jan 12, 2026", premium_status: "Active", 
    schedule: [
      { subject_code: "CS101", location: "LR2", start_time: "7:00 AM", end_time: "10:00 AM", day: "MWS" },
      { subject_code: "MATH21", location: "LR1", start_time: "10:30 AM", end_time: "12:00 PM", day: "WS" }
    ]},
  { id: 2, name: "Sarah Smith", phone_number: "987-654-3210", email: "sarah.s@example.com", role: "Faculty", status: "Active", joinDate: "Feb 05, 2026", premium_status: "Inactive", 
    schedule: [
      { subject_code: "CS101", location: "LR2", start_time: "7:00 AM", end_time: "10:00 AM", day: "MWS" },
      { subject_code: "MATH21", location: "LR1", start_time: "10:30 AM", end_time: "12:00 PM", day: "WS" }
    ]},
  { id: 3, name: "Mike Johnson", phone_number: "555-123-4567", email: "mike.j@example.com", role: "Student", status: "Inactive", joinDate: "Jan 28, 2026", premium_status: "Inactive" },
  { id: 4, name: "Elena Rodriguez", phone_number: "444-987-6543", email: "elena.r@example.com", role: "Faculty", status: "Active", joinDate: "Feb 10, 2026", premium_status: "Active" },
  { id: 5, name: "John Doe", phone_number: "123-456-7890", email: "john@example.com", role: "Student", status: "Active", joinDate: "Jan 12, 2026", premium_status: "Active" },
  { id: 6, name: "Sarah Smith", phone_number: "987-654-3210", email: "sarah.s@example.com", role: "Faculty", status: "Active", joinDate: "Feb 05, 2026", premium_status: "Inactive" },
  { id: 7, name: "Mike Johnson", phone_number: "555-123-4567", email: "mike.j@example.com", role: "Student", status: "Inactive", joinDate: "Jan 28, 2026", premium_status: "Inactive" },
  { id: 8, name: "Elena Rodriguez", phone_number: "444-987-6543", email: "elena.r@example.com", role: "Faculty", status: "Active", joinDate: "Feb 10, 2026", premium_status: "Active" },
  { id: 9, name: "John Doe", phone_number: "123-456-7890", email: "john@example.com", role: "Student", status: "Active", joinDate: "Jan 12, 2026", premium_status: "Active" },
  { id: 10, name: "Sarah Smith", phone_number: "987-654-3210", email: "sarah.s@example.com", role: "Faculty", status: "Active", joinDate: "Feb 05, 2026", premium_status: "Inactive" },
  { id: 11, name: "David Wilson", phone_number: "333-222-1111", email: "david.w@example.com", role: "Student", status: "Active", joinDate: "Mar 01, 2026", premium_status: "Active" },
  { id: 12, name: "Sarah Smith", phone_number: "987-654-3210", email: "sarah.s@example.com", role: "Faculty", status: "Active", joinDate: "Feb 05, 2026", premium_status: "Inactive" },
  { id: 13, name: "Mike Johnson", phone_number: "555-123-4567", email: "mike.j@example.com", role: "Student", status: "Inactive", joinDate: "Jan 28, 2026", premium_status: "Inactive" },
  { id: 14, name: "Elena Rodriguez", phone_number: "444-987-6543", email: "elena.r@example.com", role: "Faculty", status: "Active", joinDate: "Feb 10, 2026", premium_status: "Active" },
  { id: 15, name: "John Doe", phone_number: "123-456-7890", email: "john@example.com", role: "Student", status: "Active", joinDate: "Jan 12, 2026", premium_status: "Active" },
  { id: 16, name: "Sarah Smith", phone_number: "987-654-3210", email: "sarah.s@example.com", role: "Faculty", status: "Active", joinDate: "Feb 05, 2026", premium_status: "Inactive" },
  { id: 17, name: "David Wilson", phone_number: "333-222-1111", email: "david.w@example.com", role: "Student", status: "Active", joinDate: "Mar 01, 2026", premium_status: "Active" },
  { id: 18, name: "Mike Johnson", phone_number: "555-123-4567", email: "mike.j@example.com", role: "Student", status: "Inactive", joinDate: "Jan 28, 2026", premium_status: "Inactive" },
  { id: 19, name: "Elena Rodriguez", phone_number: "444-987-6543", email: "elena.r@example.com", role: "Faculty", status: "Active", joinDate: "Feb 10, 2026", premium_status: "Active" },
  { id: 20, name: "John Doe", phone_number: "123-456-7890", email: "john@example.com", role: "Student", status: "Active", joinDate: "Jan 12, 2026", premium_status: "Active" },
  { id: 21, name: "Sarah Smith", phone_number: "987-654-3210", email: "sarah.s@example.com", role: "Faculty", status: "Active", joinDate: "Feb 05, 2026", premium_status: "Inactive" },
  { id: 22, name: "David Wilson", phone_number: "333-222-1111", email: "david.w@example.com", role: "Student", status: "Active", joinDate: "Mar 01, 2026", premium_status: "Active" },
];

export default function UsersScreen() {
  const [users, setUsers] = useState(usersData);
  const [searchTerm, setSearchTerm] = useState("");
  const [rolefilter, setRoleFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; 

  const filteredUsers = users.filter(user => {
      const matchesSearch = 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = rolefilter === "" || 
        user.role.toLowerCase().includes(rolefilter.toLowerCase());
      return matchesSearch && matchesRole;
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsUser, setDetailsUser] = useState(null);

  const openDetailsModal = (user) => {
    setDetailsUser(user);
    setIsDetailsOpen(true);
  };

  const openDeactivateModal = (user) => {
    setTargetUser(user);
    setIsModalOpen(true);
  };

  const handleStatusToggle = () => {
    if (!targetUser) return;
    setUsers(prevUsers => 
      prevUsers.map(user => {
        if (user.id === targetUser.id) {
          return { ...user, status: user.status === 'Active' ? 'Inactive' : 'Active' };
        }
        return user;
      })
    );
    setIsModalOpen(false);
    setTargetUser(null);
  };

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredUsers.slice(indexOfFirstItem, indexOfLastItem);

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
              placeholder="SEARCH REGISTRY..."
              className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-slate-900 rounded-none shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] focus:outline-none focus:translate-x-0.5 focus:translate-y-0.5 focus:shadow-none transition-all font-bold text-xs tracking-widest placeholder:text-slate-300"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>

          <div className='flex flex-wrap gap-2'>
            {[
              { label: 'TRACK ALL', filter: '' },
              { label: 'TRACK FACULTY', filter: 'Faculty' },
              { label: 'TRACK STUDENTS', filter: 'Student' }
            ].map((btn) => (
              <button 
                key={btn.label}
                className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest border-2 border-slate-900 transition-all ${
                  rolefilter === btn.filter 
                  ? "bg-primary-800 text-white shadow-none translate-x-0.5 translate-y-0.5" 
                  : "bg-white text-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] hover:bg-slate-50"
                }`}
                onClick={() => {setRoleFilter(btn.filter); setCurrentPage(1);}}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border-2 border-slate-200 rounded-none shadow-[8px_8px_0px_0px_rgba(185,28,28,0.08)] overflow-hidden hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white border-b-2 border-primary-900">
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">User Identification</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Contact Node</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Institutional Role</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">State</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Registry Date</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Access Tier</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right">Functions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-100">
                {currentItems.map((user, index) => (
                  <tr 
                    key={`${user.id}-${index}`}  
                    onClick={() => openDetailsModal(user)} 
                    className="hover:bg-primary-50/30 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 border-2 border-slate-900 bg-white flex items-center justify-center text-slate-900 font-black text-sm">
                          {user.name.charAt(0)} {/* Most likely photo */}
                        </div>
                        <div>
                          <p className="font-black text-slate-900 tracking-tight leading-none mb-1">{user.name.toUpperCase()}</p>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-[11px] font-black text-slate-500">{user.phone_number}</td>
                    <td className="px-6 py-5">
                      <span className="flex items-center gap-2 text-[10px] font-black text-slate-900 uppercase tracking-widest">
                        <Shield size={12} className="text-primary-700" />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1 border-2 text-[10px] font-black uppercase tracking-widest ${
                        user.status === 'Active' 
                        ? 'bg-white border-emerald-600 text-emerald-600' 
                        : 'bg-slate-100 border-slate-300 text-slate-400'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-[11px] font-black text-slate-500 uppercase">{user.joinDate}</td>
                    <td className='px-6 py-5'>
                        <span className={`px-3 py-1 border-2 text-[10px] font-black uppercase tracking-widest ${
                            user.premium_status === 'Active' 
                            ? 'bg-primary-800 border-primary-800 text-white' 
                            : 'bg-white border-slate-900 text-slate-900'
                        }`}>
                            {user.premium_status === 'Active' ? 'Premium' : 'Standard'}
                        </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                        <button 
                            onClick={(e) => { e.stopPropagation(); openDeactivateModal(user); }}
                            className={`p-2 border-2 transition-all ${
                                user.status === 'Active' 
                                ? 'border-slate-200 text-slate-300 hover:border-primary-700 hover:text-primary-700 hover:bg-primary-50' 
                                : 'border-emerald-600 text-emerald-600 hover:bg-emerald-50'
                            }`}
                        >
                            {user.status === 'Active' ? <UserMinus size={16} /> : <Power size={16} />}
                        </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            
          {/* Pagination Surface */}
          <div className="px-6 py-6 bg-slate-50 border-t-2 border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
              Records: <span className="text-slate-900">{indexOfFirstItem + 1}-{Math.min(indexOfLastItem, filteredUsers.length)}</span> / <span className="text-slate-900">{filteredUsers.length}</span>
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

      {/* Modals remain integrated but will inherit global rigid styles */}
      <DeactivateUserModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleStatusToggle}
        userName={targetUser?.name}
        currentStatus={targetUser?.status}
      />
      <UserDetailsModal 
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        user={detailsUser}
        allUsers={usersData}
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