import { UserMinus, X, AlertTriangle } from 'lucide-react';

export default function DeactivateUserModal({ isOpen, onClose, onConfirm, userName, currentStatus }) {
  if (!isOpen) return null;

  const isDeactivating = currentStatus === 'Active';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <div className="relative bg-white w-full max-w-md rounded-none border-2 border-slate-900 shadow-[12px_12px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
        
        {/* Warning Stripe */}
        <div className={`h-2 w-full ${isDeactivating ? 'bg-primary-800' : 'bg-emerald-600'}`} />

        <div className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className={`w-14 h-14 border-2 border-slate-900 flex items-center justify-center ${
              isDeactivating ? 'bg-primary-50 text-primary-800 shadow-[4px_4px_0px_0px_rgba(185,28,28,1)]' : 'bg-emerald-50 text-emerald-600 shadow-[4px_4px_0px_0px_rgba(5,150,105,1)]'
            }`}>
              {isDeactivating ? <UserMinus size={28} /> : <AlertTriangle size={28} />}
            </div>
            <button onClick={onClose} className="p-2 border-2 border-slate-100 hover:border-slate-900 transition-all">
              <X size={20} />
            </button>
          </div>

          <div className="mb-10">
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3 leading-none">
              {isDeactivating ? 'Confirm Deactivation' : 'Confirm Reactivation'}
            </h3>
            <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase tracking-wide">
              SYSTEM ACTION REQUIRED FOR: <br/>
              <span className="text-slate-900 text-lg font-black tracking-normal lowercase">{userName}</span>
            </p>
            <p className="mt-4 text-[11px] font-medium text-slate-400 leading-relaxed">
              {isDeactivating 
                ? "WARNING: THIS ACTION RESTRICTS ALL ACCESS NODES FOR THIS USER. THEY WILL REMAIN IN THE REGISTRY BUT CANNOT PERFORM ANY SYSTEM SCANS OR LOGINS."
                : "NOTICE: ACCESS PRIVILEGES WILL BE RESTORED ACROSS ALL INSTITUTIONAL PLATFORMS IMMEDIATELY."}
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-4 border-2 border-slate-900 text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Abort
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-4 text-white text-[10px] font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all ${
                isDeactivating 
                ? 'bg-primary-800 hover:bg-primary-900' 
                : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isDeactivating ? 'Execute Deactivation' : 'Authorize Reactivation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}