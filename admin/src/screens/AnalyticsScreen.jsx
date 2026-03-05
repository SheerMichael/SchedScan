import React from 'react';
import UserCompositionChart from '../components/graphs/AnalyticsPie';
import ScanActivityChart from '../components/graphs/AnalyticsGraph';
import StatCard from '../components/graphs/StatCard';

const scanActivityData = [
  { name: 'Mon', Scans: 45, Success: 42 },
  { name: 'Tue', Scans: 52, Success: 48 },
  { name: 'Wed', Scans: 38, Success: 35 },
  { name: 'Thu', Scans: 65, Success: 61 },
  { name: 'Fri', Scans: 48, Success: 44 },
  { name: 'Sat', Scans: 25, Success: 22 },
  { name: 'Sun', Scans: 15, Success: 14 },
];

const userTypeData = [
  { name: 'Students', value: 840, color: '#b91c1c' }, 
  { name: 'Faculty', value: 405, color: '#334155' },  
  { name: 'Parent', value: 120, color: '#94a3b8' },   
];

export default function AnalyticsScreen() {
  return (
    <div className="min-h-screen bg-[#fcfcf9] no-scrollbar pb-10">
      <header className="bg-white border-b border-slate-200 px-4 py-7 mb-8">
        <div className="max-w-350 mx-auto">
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">System <span className="text-primary-800">Analytics</span></h1>
        </div>
      </header>
      
      <div className="p-8 max-w-350 mx-auto mt-2">
        <div className="flex items-center gap-4 mb-8">
          <div className="px-4 py-1.5 text-[10px] font-black bg-slate-900 text-white uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(185,28,28,0.3)]">
            Reporting Period: Last 7 Days
          </div>
          <div className="h-px grow bg-slate-200" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatCard title="Total Revenue" value="₱128,430" />
          <StatCard title="Total Downloads" value="14,201" />
          <StatCard title="# of Premium" value="892" />
          <StatCard title="# of Parents Linked" value="90" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <ScanActivityChart data={scanActivityData} />
          </div>
          <UserCompositionChart data={userTypeData} />
        </div>
      </div>
    </div>
  );
}