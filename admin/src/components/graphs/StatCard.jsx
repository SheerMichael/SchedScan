export default function StatCard({ title, value, trend, icon }) {
  return (
    <div className="relative overflow-hidden bg-white border-2 border-slate-200 rounded-none p-6 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
      <div className="absolute top-0 right-0 w-8 h-8 bg-primary-700 [clip-path:polygon(100%_0,0_0,100%_100%)]" />
      
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold text-slate-500 uppercase">{title}</h3>
        <div className="flex items-end justify-between mt-4">
          <p className="text-4xl font-black text-slate-900 tracking-tighter leading-none">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}