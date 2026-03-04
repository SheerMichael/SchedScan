import { AlertTriangle, X } from 'lucide-react';

export default function DeleteConfirmationModal({ isOpen, onClose, onConfirm, itemName }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-sm rounded-4xl shadow-2xl p-8 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-end">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="p-4 bg-red-50 rounded-full text-red-500">
            <AlertTriangle size={32} />
          </div>
          
          <div>
            <h2 className="text-xl font-bold text-slate-800">Delete Holiday?</h2>
            <p className="text-sm text-slate-500 mt-2">
              Are you sure you want to delete <span className="font-semibold text-slate-700">"{itemName}"</span>? This action cannot be undone.
            </p>
          </div>
          
          <div className="flex flex-col w-full gap-3 pt-4">
            <button 
              onClick={onConfirm}
              className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all active:scale-95"
            >
              Yes, Delete
            </button>
            <button 
              onClick={onClose}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-slate-600 font-semibold rounded-xl transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}