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

    // Update the users state
    setUsers(prevUsers => 
      prevUsers.map(user => {
        if (user.id === targetUser.id) {
          return { 
            ...user, 
            status: user.status === 'Active' ? 'Inactive' : 'Active' 
          };
        }
        return user;
      })
    );

    setIsModalOpen(false); // Close the modal
    setTargetUser(null);   // Clear target
  };

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredUsers.slice(indexOfFirstItem, indexOfLastItem);

  // 3. Helper functions for buttons
  const goToNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 no-scrollbar pb-20">
      <Header />
      
      <div className="p-6 mt-4"> 
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="relative w-full md:w-96 gap-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="Search users..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1); 
              }}
            />
          </div>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
              <button className="px-2 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" onClick={(e) => {setRoleFilter(''); setCurrentPage(1);}}>
                Track All
              </button>
              <button className="px-2 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" onClick={(e) => {setRoleFilter('Faculty'); setCurrentPage(1);}}>
                Track Faculty
              </button>
              <button className="px-2 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" onClick={(e) => {setRoleFilter('Student'); setCurrentPage(1);}}>
                Track Students
              </button>
            </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">User Details</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Joined</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Subscription</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              {/* To show the modal just press on the user row, and to show the deactivate/reactivate button just press on the button at the right side of the user row. */}
              <tbody className="divide-y divide-gray-100">
                {currentItems.map((user, index) => (
                  <tr 
                    key={`${user.id}-${index}`}  
                    onClick={() => openDetailsModal(user)} 
                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{user.name}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{user.phone_number}</td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5 text-sm text-slate-600 font-medium">
                        <Shield size={14} className="text-gray-400" />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        user.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{user.joinDate}</td>
                    <td className='px-6 py-4'>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            user.premium_status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                        }`}>
                            {user.premium_status === 'Active' ? 'Premium' : 'Standard'}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                openDeactivateModal(user);
                            }}
                            className={`p-2 rounded-lg transition-colors ${
                                user.status === 'Active' 
                                ? 'text-gray-400 hover:text-amber-500 hover:bg-amber-50' 
                                : 'text-emerald-500 hover:bg-emerald-50'
                            }`}
                            title={user.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                        >
                            {user.status === 'Active' ? <UserMinus size={18} /> : <Power size={18} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            
          
          <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
            <p className="text-sm text-gray-500 font-medium">
              Showing <span className="text-slate-900">{indexOfFirstItem + 1}</span> to <span className="text-slate-900">{Math.min(indexOfLastItem, filteredUsers.length)}</span> of <span className="text-slate-900">{filteredUsers.length}</span> users
            </p>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                Page {currentPage} of {totalPages || 1}
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className={`flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-all ${
                    currentPage === 1 
                    ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' 
                    : 'bg-white text-slate-700 border-gray-200 hover:bg-gray-50 shadow-sm'
                  }`}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <button 
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className={`flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-all ${
                    (currentPage === totalPages || totalPages === 0)
                    ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' 
                    : 'bg-white text-slate-700 border-gray-200 hover:bg-gray-50 shadow-sm'
                  }`}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

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
    <div className="bg-linear-to-r from-indigo-100 via-blue-50 to-amber-50 p-8 h-48 flex items-end">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-slate-800">User Accounts</h1>
      </div>
    </div>
  );
}