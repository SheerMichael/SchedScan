import { BadgeCheck, X } from 'lucide-react';

export default function VerifyFacultyModal({
  isOpen,
  onClose,
  onConfirm,
  userName,
  nextVerified,
  isLoading = false,
}) {
  if (!isOpen) return null;

  const isVerifying = Boolean(nextVerified);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <div className="relative bg-white w-full max-w-md rounded-none border-2 border-slate-900 shadow-[12px_12px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
        <div className={`h-2 w-full ${isVerifying ? 'bg-emerald-600' : 'bg-amber-500'}`} />

        <div className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className={`w-14 h-14 border-2 border-slate-900 flex items-center justify-center ${
              isVerifying
                ? 'bg-emerald-50 text-emerald-600 shadow-[4px_4px_0px_0px_rgba(5,150,105,1)]'
                : 'bg-amber-50 text-amber-600 shadow-[4px_4px_0px_0px_rgba(217,119,6,1)]'
            }`}>
              <BadgeCheck size={28} />
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="p-2 border-2 border-slate-100 hover:border-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mb-10">
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3 leading-none">
              {isVerifying ? 'Confirm Faculty Verification' : 'Confirm Faculty Unverification'}
            </h3>
            <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase tracking-wide">
              TARGET ACCOUNT: <br />
              <span className="text-slate-900 text-lg font-black tracking-normal lowercase">{userName}</span>
            </p>
            <p className="mt-4 text-[11px] font-medium text-slate-400 leading-relaxed uppercase">
              {isVerifying
                ? 'THIS WILL ENABLE CLASS CODE GENERATION FOR THIS FACULTY ACCOUNT IN THE MOBILE APP.'
                : 'THIS WILL DISABLE CLASS CODE GENERATION UNTIL THE ACCOUNT IS VERIFIED AGAIN.'}
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-4 border-2 border-slate-900 text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 px-4 py-4 text-white text-[10px] font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isVerifying ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              {isLoading ? 'Saving...' : isVerifying ? 'Confirm Verification' : 'Confirm Unverification'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
