import React, { useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer 
} from 'recharts';
import { TrendingUp } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700">
        <p className="text-xs font-bold mb-1 text-slate-400">{label}</p>
        <p className="text-sm font-semibold">₱{payload[0].value.toLocaleString()}</p>
      </div>
    );
  }
  return null;
};

const chartData = {
  Daily: [ { name: '08:00', value: 10 }, { name: '10:00', value: 35 }, { name: '12:00', value: 48 }, { name: '14:00', value: 70 }, { name: '16:00', value: 150 }, { name: '19:00', value: 165 } ],
  Weekly: [ { name: 'Mon', value: 400 }, { name: 'Tue', value: 300 }, { name: 'Wed', value: 600 }, { name: 'Thu', value: 800 }, { name: 'Fri', value: 500 }, { name: 'Sat', value: 900 } ],
  Annually: [ { name: '2022', value: 2000 }, { name: '2023', value: 4500 }, { name: '2024', value: 8000 }, { name: '2025', value: 12700 } ]
};

export default function SalesChart() {
  const [activeFilter, setActiveFilter] = useState('Weekly');

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      {/* Header Section */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Revenue Overview</p>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-slate-900">
              {activeFilter === 'Daily' ? '₱12,700' : activeFilter === 'Weekly' ? '₱45,200' : '₱1.2M'}
            </h2>
            <div className="flex items-center text-emerald-500 text-[11px] font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              <TrendingUp size={12} className="mr-1" />
              +1.3%
            </div>
          </div>
        </div>
        
        {/* Toggle Buttons */}
        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
          {['Daily', 'Weekly', 'Annually'].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeFilter === filter 
                  ? 'bg-white text-indigo-600 shadow-sm border border-gray-200' 
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Fixed Chart Container */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart 
            data={chartData[activeFilter]} 
            // Increased bottom and left margins to prevent label clipping
            margin={{ top: 10, right: 10, left: 0, bottom: 25 }}
          >
            <defs>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01}/>
              </linearGradient>
            </defs>
            
            {/* Dotted horizontal lines only */}
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
            
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 500}} 
              dy={15} // Space between axis and labels
            />
            
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{fill: '#94a3b8', fontSize: 11}} 
              tickCount={5}
            />
            
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '5 5' }} />
            
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#6366f1" 
              strokeWidth={2.5} 
              fill="url(#colorSales)" 
              animationDuration={1200}
              activeDot={{ r: 5, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}