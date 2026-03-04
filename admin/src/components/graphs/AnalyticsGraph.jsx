// components/graphs/ScanActivityChart.jsx
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ScanActivityChart({ data }) {
  return (
    <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
      <div className="flex justify-between items-center mb-8">
        {/* <h3 className="text-lg font-bold text-slate-800">Scan Volume vs Success</h3>
        <div className="flex gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-indigo-500">
            <div className="w-2 h-2 rounded-full bg-indigo-500"/>Total Scans
          </span>
          <span className="flex items-center gap-1.5 text-emerald-500">
            <div className="w-2 h-2 rounded-full bg-emerald-500"/>Success Rate
          </span>
        </div> */}
      </div>

      <div className="h-80 w-full">
        {/* <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorScans" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
            />
            <Area type="monotone" dataKey="Scans" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorScans)" />
            <Area type="monotone" dataKey="Success" stroke="#10b981" strokeWidth={3} fill="transparent" />
          </AreaChart>
        </ResponsiveContainer> */}
      </div>
    </div>
  );
}