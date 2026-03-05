import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export default function UserCompositionChart({ data }) {
  return (
    <div className="bg-white border-slate-200 border-2 rounded-none p-6 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
      <div className="flex items-center gap-2 mb-8">
        <div className="w-2 h-4 bg-primary-700" />
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">User Composition</h3>
      </div>
      
      <div className="h-64 border-2 border-slate-200 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-size:15px:15px">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={60}
              outerRadius={80}
              paddingAngle={0}
              dataKey="value"
              stroke="#0f172a"
              strokeWidth={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
               contentStyle={{backgroundColor: '#9e1910', border: 'none', color: '#fff', fontSize: '12px', fontWeight: '900'}}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-10 space-y-3">
        {data.map((item) => (
          <div key={item.name} className="flex justify-between items-center border-b border-slate-100 pb-2">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-none" style={{ backgroundColor: item.color }}></div>
              <span className="text-slate-500 font-bold uppercase text-[10px] tracking-tight">{item.name}</span>
            </div>
            <span className="font-black text-slate-900 text-sm">{item.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}