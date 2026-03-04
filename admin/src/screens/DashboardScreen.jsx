import SalesChart from '../components/graphs/DashboardGraph';
import StatCard from '../components/graphs/StatCard';

export default function DashboardScreen() {
  return (
    <div className="min-h-screen bg-gray-50 no-scrollbar">
      <Header />
      <div className="p-6 mt-4"> 
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-8">
          <StatCard title="Total Users" value="1,245" />
          <StatCard title="Active Sessions" value="3,421" />
        </div>

        {/* Main Analytics Chart */}
        <div className="mb-8">
          <SalesChart />
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 text-slate-800">Recent Activity</h2>
          <ul className="space-y-4 text-sm text-gray-600">
            <li className="flex items-center gap-3">
              <span className="p-2 bg-green-50 rounded-lg">👤</span> 
              New user registered: john.doe
            </li>
            <li className="flex items-center gap-3">
              <span className="p-2 bg-orange-50 rounded-lg">🕒</span> 
              Faculty announcement posted
            </li>
            <li className="flex items-center gap-3">
              <span className="p-2 bg-purple-50 rounded-lg">📄</span> 
              Schedule scan processed
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="bg-linear-to-r from-indigo-100 via-blue-50 to-amber-50 p-8 h-48 flex items-end">
      <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
    </div>
  )
}