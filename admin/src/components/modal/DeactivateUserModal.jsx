import { UserMinus, X } from 'lucide-react';

export default function DeactivateUserModal({ isOpen, onClose, onConfirm, userName, currentStatus }) {
  if (!isOpen) return null;

  const isDeactivating = currentStatus === 'Active';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div 
        className="absolute inset-0 bg-black/20 transition-opacity" 
        onClick={onClose}
      />

      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isDeactivating ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <UserMinus size={24} />
            </div>
            <button 
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mb-8">
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {isDeactivating ? 'Deactivate Account?' : 'Reactivate Account?'}
            </h3>
            <p className="text-slate-500 leading-relaxed">
              Are you sure you want to {isDeactivating ? 'deactivate' : 'reactivate'}{' '}
              <span className="font-bold text-slate-800">{userName}</span>? 
              {isDeactivating 
                ? " They will no longer be able to log in to SchedScan until an admin reactivates them."
                : " They will regain full access to their SchedScan account immediately."}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 text-slate-600 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-3 text-white font-semibold rounded-xl transition-all shadow-lg ${
                isDeactivating 
                ? 'bg-red-600 hover:bg-red-700 shadow-red-100' 
                : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100'
              }`}
            >
              {isDeactivating ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}