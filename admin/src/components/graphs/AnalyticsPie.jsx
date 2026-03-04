// components/graphs/UserCompositionChart.jsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export default function UserCompositionChart({ data }) {
  return (
    <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
      <h3 className="text-lg font-bold text-slate-800 mb-6">User Composition</h3>
      
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={65}
              outerRadius={85}
              paddingAngle={10}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-8 space-y-4">
        {data.map((item) => (
          <div key={item.name} className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
              <span className="text-slate-500 font-semibold text-sm">{item.name}</span>
            </div>
            <span className="font-bold text-slate-800 text-sm">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}