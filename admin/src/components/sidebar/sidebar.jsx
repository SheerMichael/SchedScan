import { Link, useLocation } from 'react-router-dom';
import logoImg from '../../assets/logo.png';

const Sidebar = () => {
  const location = useLocation();

  const menuItems = [
    { name: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', link: '/dashboard' },
    { name: 'Analytics', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', link: '/analytics' },
    { name: 'User Management', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', link: '/users' },
    { name: 'Calendar Control', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', link: '/calendar' },
  ];

  return (
    <aside className="h-full w-64 bg-white border-r border-gray-200 flex flex-col justify-between z-20 sticky top-0">
      <div>
        {/* Logo Section */}
        <div className="h-24 flex items-center px-6 overflow-hidden">
          <img src={logoImg} alt="Logo" className="h-8 w-auto object-contain mr-2" />
          <span className="font-bold text-xl tracking-tight text-gray-900">SchedScan</span>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-3">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.link;
            
            return (
              <Link
                key={item.name}
                to={item.link}
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg group transition-colors mb-1 ${
                  isActive 
                    ? "text-gray-900 bg-gray-50" 
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                <svg 
                  className={`mr-3 h-5 w-5 transition-colors ${
                    isActive ? "text-gray-900" : "text-gray-400 group-hover:text-gray-600"
                  }`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon} />
                </svg>
                <span className="whitespace-nowrap">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Logout Button */}
      <div className="p-4 border-t border-gray-100">
        <Link 
          to="/login" 
          className="w-full flex items-center justify-center bg-[#5c6b7f] hover:bg-[#4b5563] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-5 h-5 transform rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="ml-2 whitespace-nowrap">Logout</span>
        </Link>
      </div>
    </aside>
  );
};

export default Sidebar;