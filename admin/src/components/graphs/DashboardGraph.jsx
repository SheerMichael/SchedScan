import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700">
        <p className="text-[10px] font-bold mb-2 text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-lg font-black text-primary-400">₱{payload[0].value.toLocaleString()}</p>
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
    <div className="bg-white border-2 border-slate-200 rounded-none p-6 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
      <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-10">
        <div>
          <p className="text-[10px] font-black text-primary-700 uppercase tracking-widest mb-1">Metrics & Traffic</p>
          <div className="flex items-center gap-4">
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">
              {activeFilter === 'Daily' ? '₱12,700' : activeFilter === 'Weekly' ? '₱45,200' : '₱1.2M'}
            </h2>
            <div className="flex items-center text-emerald-700 text-xs font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 shadow-sm">
              <TrendingUp size={14} className="mr-1.5" />
              +1.3%
            </div>
          </div>
        </div>
        
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)]">
          {['Daily', 'Weekly', 'Annually'].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-6 py-2 text-xs font-bold rounded-lg transition-all ${
                activeFilter === filter 
                  ? 'bg-white text-primary-800 shadow-md ring-1 ring-slate-200' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="h-80 w-full shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)] rounded-none border border-slate-200 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData[activeFilter]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#b91c1c" stopOpacity={0.1}/> {/* primary-700 */}
                <stop offset="95%" stopColor="#b91c1c" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#e2e8f0" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 700}} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 700}} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#b91c1c', strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#b91c1c" // primary-700
              strokeWidth={3} 
              fill="url(#colorSales)" 
              activeDot={{ r: 6, fill: '#b91c1c', strokeWidth: 3, stroke: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}