import React from 'react';
import UserCompositionChart from '../components/graphs/AnalyticsPie';
import ScanActivityChart from '../components/graphs/AnalyticsGraph';
import StatCard from '../components/graphs/StatCard';

// Data remains consistent with your previous dashboard style (example )
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
  { name: 'Students', value: 840, color: '#6366f1' },
  { name: 'Faculty', value: 405, color: '#fbbf24' },
  { name: 'Parent', value: 120, color: '#10b981' },
];

export default function AnalyticsScreen() {
  return (
    <div className="min-h-screen bg-gray-50 no-scrollbar pb-10">
      <Header />
      
      <div className="p-6 mt-2">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
          <p className="px-4 py-2 text-sm font-bold bg-slate-900 text-white rounded-lg">Last 7 Days</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Revenue" value="₱128,430" />
          <StatCard title="Total Downloads" value="14,201" />
          <StatCard title="# of Premium" value="892" />
          <StatCard title="# of Parents Linked" value="90" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ScanActivityChart data={scanActivityData} />
          </div>
          <UserCompositionChart data={userTypeData} />
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="bg-linear-to-r from-indigo-100 via-blue-50 to-amber-50 p-8 h-48 flex items-end">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-slate-800">System Analytics</h1>
      </div>
    </div>
  );
}