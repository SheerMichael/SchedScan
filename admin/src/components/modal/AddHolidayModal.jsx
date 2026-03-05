import React, { useState, useEffect } from 'react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval, parseISO 
} from 'date-fns';
import { ChevronLeft, ChevronRight, X, ChevronDown, Calendar as CalendarIcon } from 'lucide-react';

export default function AddHolidayModal({ isOpen, onClose, onSave, initialData }) {
  const [holidayName, setHolidayName] = useState('');
  const [recurrence, setRecurrence] = useState('Recurring');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMonth, setViewMonth] = useState(new Date());

  useEffect(() => {
    if (initialData) {
      setHolidayName(initialData.name);
      setRecurrence(initialData.type);
      setSelectedDate(parseISO(initialData.date));
      setViewMonth(parseISO(initialData.date));
    } else {
      setHolidayName('');
      setRecurrence('Recurring');
      setSelectedDate(new Date());
      setViewMonth(new Date());
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      id: initialData?.id || Date.now(),
      name: holidayName,
      date: format(selectedDate, 'yyyy-MM-dd'),
      type: recurrence
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-[#fcfcf9] w-full max-w-md rounded-none border-2 border-slate-900 shadow-[12px_12px_0px_0px_rgba(15,23,42,1)] overflow-hidden flex flex-col">
        
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter">
              {initialData ? 'Update Holiday Record' : 'Register New Holiday'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 border-2 border-slate-700 hover:border-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Holiday Name</label>
            <input 
              type="text"
              required
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
              className="w-full px-4 py-4 bg-white border-2 border-slate-900 rounded-none focus:outline-none focus:bg-primary-50/20 transition-all font-bold text-sm uppercase tracking-tight"
              placeholder="e.g., INSTITUTIONAL FOUNDING DAY"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Type of Holiday</label>
            <div className="relative w-fit">
              <select 
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className={`appearance-none px-6 py-2.5 pr-12 rounded-none text-[10px] font-black uppercase tracking-widest cursor-pointer border-2 transition-all focus:outline-none ${
                  recurrence === 'Recurring' 
                    ? 'bg-primary-800 text-white border-primary-800' 
                    : 'bg-white text-slate-900 border-slate-900'
                }`}
              >
                <option value="Recurring">Recurring (Annual)</option>
                <option value="One-time">One-time Event</option>
              </select>
              <ChevronDown size={14} className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${recurrence === 'Recurring' ? 'text-white' : 'text-slate-900'}`} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Coordinate Selection</label>
            <div className="border-2 border-slate-900 p-6 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,0.05)]">
              <CalendarPicker 
                selectedDate={selectedDate} 
                setSelectedDate={setSelectedDate}
                viewMonth={viewMonth}
                setViewMonth={setViewMonth}
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full py-5 bg-slate-900 text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-[6px_6px_0px_0px_rgba(185,28,28,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
          >
            {initialData ? 'Update Holiday' : 'Record Holiday'}
          </button>
        </form>
      </div>
    </div>
  );
}

function CalendarPicker({ selectedDate, setSelectedDate, viewMonth, setViewMonth }) {
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  return (
    <div>
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
        <h3 className="font-black text-slate-900 text-xs uppercase tracking-widest">{format(viewMonth, 'MMMM yyyy')}</h3>
        <div className="flex gap-2">
          <button type="button" onClick={() => setViewMonth(subMonths(viewMonth, 1))} className="p-1.5 border border-slate-200 hover:border-slate-900 transition-colors"><ChevronLeft size={14} /></button>
          <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="p-1.5 border border-slate-200 hover:border-slate-900 transition-colors"><ChevronRight size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center gap-1 bg-[radial-gradient(#f1f5f9_1px,transparent_1px)] bg-size:10px_10px">
        {['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map(d => (
          <div key={d} className="text-[9px] font-black text-slate-400 uppercase py-2">{d}</div>
        ))}
        {calendarDays.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, monthStart);
          return (
            <div key={i} className="flex justify-center p-0.5">
              <button
                type="button"
                onClick={() => setSelectedDate(day)}
                className={`w-8 h-8 flex items-center justify-center border text-[10px] font-black transition-all
                  ${!isCurrentMonth ? 'border-transparent text-slate-200' : 'border-slate-50 text-slate-700'}
                  ${isSelected ? 'bg-primary-800 border-primary-800 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'hover:border-slate-900'}
                `}
              >
                {format(day, 'd')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}