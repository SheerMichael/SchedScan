import SalesChart from '../components/graphs/DashboardGraph';
import StatCard from '../components/graphs/StatCard';

export default function DashboardScreen() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased text-slate-900">
      <Header />
      
      <div className="p-8 max-w-7xl mx-auto"> 
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-8">
          <StatCard title="Total Enrolled Users" value="1,245" />
          <StatCard title="Active System Sessions" value="3,421" />
        </div>

        <div className="mb-8">
          <SalesChart />
        </div>

        <div className="bg-white border-2 border-slate-200 rounded-none p-6 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-700">Audit & Recent Activity</h2>
          </div>
          <div className="p-6">
            <ul className="space-y-6">
              {[
                { label: 'New user registered: john.doe', bg: 'bg-primary-50', text: 'text-primary-700' },
                { label: 'Faculty announcement posted', bg: 'bg-slate-100', text: 'text-slate-700' },
                { label: 'Schedule scan processed', bg: 'bg-amber-50', text: 'text-amber-700' },
              ].map((item, idx) => (
                <li key={idx} className="flex items-center gap-4 text-sm font-medium text-slate-600">
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-7">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-black text-slate-800 tracking-tight">Dashboard</h1>
      </div>
    </header>
  )
}