import React, { useState, useEffect } from 'react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval, parseISO 
} from 'date-fns';
import { ChevronLeft, ChevronRight, X, ChevronDown, Calendar as CalendarIcon, Loader2, AlertCircle } from 'lucide-react';

export default function AddHolidayModal({ isOpen, onClose, onSave, initialData, isSaving = false, saveError = null }) {
  const [holidayName, setHolidayName] = useState('');
  const [recurrence, setRecurrence] = useState('Recurring');
  const [timePeriod, setTimePeriod] = useState('All Day');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isRange, setIsRange] = useState(false); // Toggle for range mode

  useEffect(() => {
    if (initialData) {
      setHolidayName(initialData.name);
      setRecurrence(initialData.type);
      setTimePeriod(initialData.period || 'All Day');
      setStartDate(initialData.startDate || initialData.date); 
      setEndDate(initialData.endDate || '');
      setIsRange(!!initialData.endDate);
    } else {
      const today = format(new Date(), 'yyyy-MM-dd');
      setHolidayName('');
      setRecurrence('Recurring');
      setTimePeriod('All Day');
      setStartDate(today);
      setEndDate(today);
      setIsRange(false);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const start = parseISO(startDate);
    const end = isRange ? parseISO(endDate) : start;

    if (!isValid(start) || (isRange && !isValid(end))) {
      alert("INVALID COORDINATES. USE YYYY-MM-DD.");
      return;
    }

    if (isRange && isAfter(start, end)) {
      alert("CHRONOLOGICAL ERROR: END DATE MUST BE AFTER START DATE.");
      return;
    }

    onSave({
      id: initialData?.id,
      name: holidayName,
      date: startDate,
      endDate: isRange ? endDate : null,
      type: recurrence,
      period: timePeriod
    });
    // The parent (CalendarScreen) closes the modal after the async API call completes
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-[#fcfcf9] w-full max-w-md rounded-none border-2 border-slate-900 shadow-[12px_12px_0px_0px_rgba(15,23,42,1)] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-150">
        
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center">
          <div>
            <p className="text-[9px] font-black tracking-[0.3em] text-primary-400 uppercase">Registry Input</p>
            <h2 className="text-xl font-black uppercase tracking-tighter">
              {initialData ? 'Edit Event Record' : 'New Event Entry'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 border-2 border-slate-700 hover:border-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Event Designation</label>
            <input 
              type="text" required value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
              className="w-full px-4 py-4 bg-white border-2 border-slate-900 rounded-none focus:outline-none focus:bg-primary-50/20 transition-all font-bold text-sm uppercase"
              placeholder="e.g., MIDTERM BREAK"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Classification</label>
              <div className="relative">
                <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}
                  className="w-full appearance-none px-4 py-3 bg-white border-2 border-slate-900 rounded-none text-[10px] font-black uppercase tracking-widest cursor-pointer focus:outline-none"
                >
                  <option value="Recurring">Recurring</option>
                  <option value="One-time">One-time</option>
                </select>
                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Period</label>
              <div className="relative">
                <select value={timePeriod} onChange={(e) => setTimePeriod(e.target.value)}
                  className="w-full appearance-none px-4 py-3 bg-white border-2 border-slate-900 rounded-none text-[10px] font-black uppercase tracking-widest cursor-pointer focus:outline-none"
                >
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                  <option value="All Day">All Day</option>
                </select>
                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Range Toggle */}
          <div className="pt-2">
            <button type="button" onClick={() => setIsRange(!isRange)}
              className="flex items-center gap-3 group select-none"
            >
              <div className={`w-6 h-6 border-2 border-slate-900 flex items-center justify-center transition-all ${isRange ? 'bg-primary-800 border-primary-800' : 'bg-white'}`}>
                {isRange ? <CheckSquare size={16} className="text-white" /> : <div className="w-full h-full bg-white group-hover:bg-slate-50" />}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Enable Multi-Day Range Registry</span>
            </button>
          </div>

          {/* Date Entry Area */}
          <div className={`grid ${isRange ? 'grid-cols-1 sm:grid-cols-[1fr_auto_1fr]' : 'grid-cols-1'} items-center gap-4 transition-all`}>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                {isRange ? 'Start Coordinate' : 'Registry Date'}
              </label>
              <div className="relative">
                <input type="text" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  className="w-full px-8 py-4 bg-white border-2 border-slate-900 rounded-none font-bold text-sm tracking-widest focus:outline-none focus:bg-primary-50/20"
                />
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              </div>
            </div>

            {isRange && (
              <div className="flex justify-center pt-6">
                <ArrowRight size={20} className="text-primary-800" />
              </div>
            )}

            {isRange && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">End Coordinate</label>
                <div className="relative">
                  <input type="text" required={isRange} value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="w-full px-8 py-4 bg-white border-2 border-slate-900 rounded-none font-bold text-sm tracking-widest focus:outline-none focus:bg-primary-50/20"
                  />
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                </div>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-500">
            Format of the dates is strictly YYYY-MM-DD. For example, September 5, 2024 would be entered as 2024-09-05.
          </p>

          {saveError && (
            <div className="flex items-start gap-2 bg-red-50 border-2 border-red-700 px-4 py-3">
              <AlertCircle size={14} className="text-red-700 mt-0.5 shrink-0" />
              <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider">{saveError}</p>
            </div>
          )}

          <button 
            type="submit" 
            disabled={isSaving}
            className="w-full py-5 bg-slate-900 text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-[6px_6px_0px_0px_rgba(185,28,28,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-[6px_6px_0px_0px_rgba(185,28,28,1)] flex items-center justify-center gap-2"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            {isSaving ? 'Saving…' : initialData ? 'Update Holiday' : 'Record Holiday'}
          </button>
        </form>
      </div>
    </div>
  );
}