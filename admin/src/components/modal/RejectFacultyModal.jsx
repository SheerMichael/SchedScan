import { useState } from 'react';
import { ShieldX, X } from 'lucide-react';

export default function RejectFacultyModal({
  isOpen,
  onClose,
  onConfirm,
  userName,
  isLoading = false,
}) {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (isLoading) return; // prevent double-submit
    onConfirm(reason.trim());
    // NOTE: reason is intentionally NOT cleared here.
    // It stays visible while the async request is in-flight.
    // The parent closes the modal on success, which triggers handleClose → setReason('').
  };

  const handleClose = () => {
    if (isLoading) return;
    setReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <div className="relative bg-white w-full max-w-md rounded-none border-2 border-slate-900 shadow-[12px_12px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
        <div className="h-2 w-full bg-red-500" />

        <div className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className="w-14 h-14 border-2 border-slate-900 bg-red-50 text-red-600 flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(185,28,28,0.6)]">
              <ShieldX size={28} />
            </div>
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="p-2 border-2 border-slate-100 hover:border-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mb-8">
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3 leading-none">
              Reject Verification
            </h3>
            <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase tracking-wide">
              FACULTY MEMBER: <br />
              <span className="text-slate-900 text-lg font-black tracking-normal lowercase">{userName}</span>
            </p>
            <p className="mt-4 text-[11px] font-medium text-slate-400 leading-relaxed uppercase">
              This account will remain unverified. The faculty member will receive a notification
              and may re-upload a corrected schedule for review.
            </p>
          </div>

          {/* Optional reason */}
          <div className="mb-8">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
              Rejection Reason <span className="text-slate-300">(Optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
              placeholder="e.g. Schedule is unclear, wrong document uploaded..."
              maxLength={500}
              rows={3}
              className="w-full border-2 border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700 placeholder:text-slate-300 placeholder:font-normal focus:border-slate-900 focus:outline-none focus:bg-white transition-colors resize-none disabled:opacity-50"
            />
            <p className="mt-1 text-right text-[10px] font-bold text-slate-300">
              {reason.length}/500
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 px-4 py-4 border-2 border-slate-900 text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className="flex-1 px-4 py-4 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(185,28,28,0.8)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Rejecting...' : 'Reject Verification'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
