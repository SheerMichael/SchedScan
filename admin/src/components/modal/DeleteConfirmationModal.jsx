import { AlertTriangle, X } from 'lucide-react';

export default function DeleteConfirmationModal({ isOpen, onClose, onConfirm, itemName }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-sm rounded-none border-2 border-slate-900 shadow-[12px_12px_0px_0px_rgba(185,28,28,0.2)] p-8 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="p-1 border-2 border-slate-100 hover:border-slate-900 transition-all text-slate-400 hover:text-slate-900">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex flex-col items-center text-center space-y-6">
          {/* Rigid Warning Icon Box */}
          <div className="w-16 h-16 border-2 border-primary-800 bg-primary-50 flex items-center justify-center text-primary-800 shadow-[4px_4px_0px_0px_rgba(185,28,28,1)]">
            <AlertTriangle size={32} />
          </div>
          
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">Delete Holiday?</h2>
            <div className="mt-4 p-3 bg-slate-50 border border-slate-200">
              <p className="text-[11px] font-bold text-slate-500 uppercase leading-relaxed">
                Confirm removal of entry: <br/>
                <span className="text-slate-900 text-sm font-black tracking-normal lowercase italic">"{itemName}"</span>
              </p>
            </div>
            <p className="text-[10px] text-primary-700 font-black uppercase mt-4 tracking-widest">Action is Irreversible</p>
          </div>
          
          <div className="flex flex-col w-full gap-3 pt-4">
            <button 
              onClick={onConfirm}
              className="w-full py-4 bg-primary-700 text-white text-[10px] font-black uppercase tracking-widest border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] hover:bg-primary-900 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
            >
              Delete
            </button>
            <button 
              onClick={onClose}
              className="w-full py-4 bg-white border-2 border-slate-900 text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}