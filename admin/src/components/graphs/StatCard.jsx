

export default function StatCard({ title, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:border-indigo-200 transition-colors">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-3xl font-bold mt-1 text-slate-900">{value}</p>
    </div>
  );
}