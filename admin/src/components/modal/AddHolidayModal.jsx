import React, { useState, useEffect } from 'react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval, parseISO 
} from 'date-fns';
import { ChevronLeft, ChevronRight, X, ChevronDown } from 'lucide-react';

export default function AddHolidayModal({ isOpen, onClose, onSave, initialData }) {
  const [holidayName, setHolidayName] = useState('');
  const [recurrence, setRecurrence] = useState('Recurring');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMonth, setViewMonth] = useState(new Date());

  // Reset or Load data when modal opens/initialData changes
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-4xl shadow-2xl p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800">
            {initialData ? 'Edit Holiday' : 'Add Holiday'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Holiday Name</label>
            <input 
              type="text"
              required
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-500 transition-all"
              placeholder="Enter holiday name"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Recurrence</label>
            <div className="relative w-fit">
              <select 
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className={`appearance-none px-5 py-2 pr-10 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer border transition-all focus:outline-none ${
                  recurrence === 'Recurring' 
                    ? 'bg-red-600 text-white border-transparent' 
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                <option value="Recurring" className="bg-white text-slate-800">Recurring</option>
                <option value="One-time" className="bg-white text-slate-800">One-time</option>
              </select>
              <ChevronDown size={14} className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${recurrence === 'Recurring' ? 'text-white' : 'text-gray-400'}`} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Select Date</label>
            <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/30">
              <CalendarPicker 
                selectedDate={selectedDate} 
                setSelectedDate={setSelectedDate}
                viewMonth={viewMonth}
                setViewMonth={setViewMonth}
              />
            </div>
          </div>

          <button type="submit" className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95">
            {initialData ? 'Update Holiday' : 'Add Holiday'}
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
      <div className="flex justify-between items-center mb-4 px-2">
        <h3 className="font-bold text-slate-800 text-sm">{format(viewMonth, 'MMMM yyyy')}</h3>
        <div className="flex gap-2">
          <button type="button" onClick={() => setViewMonth(subMonths(viewMonth, 1))} className="p-1 hover:bg-white rounded border border-gray-100 text-gray-400"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="p-1 hover:bg-white rounded border border-gray-100 text-gray-400"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center gap-y-1">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
          <div key={d} className="text-[10px] font-bold text-gray-400 uppercase py-1">{d}</div>
        ))}
        {calendarDays.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          return (
            <div key={i} className="flex justify-center py-0.5">
              <button
                type="button"
                onClick={() => setSelectedDate(day)}
                className={`w-8 h-8 flex items-center justify-center rounded-full text-xs transition-all
                  ${!isSameMonth(day, monthStart) ? 'text-gray-200' : 'text-slate-600'}
                  ${isSelected ? 'bg-red-500 text-white font-bold' : 'hover:bg-white'}
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