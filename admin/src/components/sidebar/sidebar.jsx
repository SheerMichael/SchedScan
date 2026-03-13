import { Link, useLocation, useNavigate } from 'react-router-dom';
import logoImg from '../../assets/logo.png';

const Sidebar = ({ onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogoutAction = () => {
    // Run the logout logic from App.jsx
    onLogout();
    // Redirect to the login screen
    navigate("/login");
  };

  const menuItems = [
    { name: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', link: '/' },
    { name: 'Analytics', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', link: '/analytics' },
    { name: 'OCR Health', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', link: '/extraction-health' },
    { name: 'User Management', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', link: '/users' },
    { name: 'Calendar Control', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', link: '/calendar' },
    { name: 'Report Logs', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', link: '/report-logs' },
  ];

  return (
    <aside className="h-full w-64 bg-slate-50 border-r border-slate-200 flex flex-col justify-between z-20 sticky top-0 shadow-sm">
      <div>
        <div className="h-24 flex items-center px-6 bg-white border-b border-slate-100">
          <img src={logoImg} alt="Logo" className="h-9 w-auto object-contain mr-3" />
          <div className="flex flex-col">
            <span className="font-black text-xl tracking-tight text-primary-800 leading-none">SchedScan</span>
            <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-400 mt-1">Admin Portal</span>
          </div>
        </div>

        <nav className="mt-6 px-3 space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.link;
            return (
              <Link
                key={item.name}
                to={item.link}
                className={`relative flex items-center px-4 py-3 text-sm font-semibold rounded-lg transition-all group ${
                  isActive 
                    ? "text-primary-800 bg-white shadow-sm ring-1 ring-slate-200" 
                    : "text-slate-500 hover:text-primary-700 hover:bg-primary-50/50"
                }`}
              >
                {isActive && <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary-700 rounded-r-full" />}
                <svg className={`mr-3 h-5 w-5 ${isActive ? "text-primary-700" : "text-slate-400 group-hover:text-primary-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon} />
                </svg>
                <span className="whitespace-nowrap tracking-tight">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-200 bg-white">
        <button 
          onClick={handleLogoutAction}
          className="w-full flex items-center justify-center bg-slate-800 hover:bg-primary-900 text-white px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-md active:scale-95 cursor-pointer"
        >
          <svg className="w-4 h-4 mr-2 transform rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Log Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;