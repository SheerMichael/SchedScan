import React, { useState, useMemo } from 'react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval, parseISO 
} from 'date-fns';
import { 
  Edit2, Trash2, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock
} from 'lucide-react';
import AddHolidayModal from '../components/modal/AddHolidayModal';
import DeleteConfirmationModal from '../components/modal/DeleteConfirmationModal';

{/* Initial holidays data for the single months you need to 0_ and also an example format for date (March 2, 2026) does not work*/}
const initialHolidays = [
  { id: 1, name: "All Saint's Day Eve", date: "2025-03-31", type: "Recurring" },
  { id: 2, name: "WMSU Palaro", date: "2026-02-23", type: "One-time" },
  { id: 3, name: "WMSU Palaro", date: "2026-02-22", type: "One-time" },
  { id: 4, name: "WMSU Palaro", date: "2026-02-21", type: "One-time" },
  { id: 5, name: "WMSU Palaro", date: "2026-02-20", type: "One-time" },
  { id: 6, name: "WMSU Palaro", date: "2026-02-19", type: "One-time" },
  { id: 7, name: "New Year's Day", date: "2026-01-01", type: "Recurring" },
];

export default function CalendarControlScreen() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [holidays, setHolidays] = useState(initialHolidays);
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState(null);

  const handleOpenAdd = () => { setSelectedHoliday(null); setIsAddEditOpen(true); };
  const handleOpenEdit = (holiday) => { setSelectedHoliday(holiday); setIsAddEditOpen(true); };
  const handleOpenDelete = (holiday) => { setSelectedHoliday(holiday); setIsDeleteOpen(true); };

  const handleSaveHoliday = (holidayData) => {
    if (selectedHoliday) {
      setHolidays(prev => prev.map(h => h.id === holidayData.id ? holidayData : h));
    } else {
      setHolidays(prev => [...prev, holidayData]);
    }
    setIsAddEditOpen(false);
  };

  const handleConfirmDelete = () => {
    setHolidays(prev => prev.filter(h => h.id !== selectedHoliday.id));
    setIsDeleteOpen(false);
    setSelectedHoliday(null);
  };

  const getHolidayForDay = (day) => {
    return holidays.find(h => {
      const hDate = parseISO(h.date);
      if (h.type === "Recurring") {
        return day.getMonth() === hDate.getMonth() && day.getDate() === hDate.getDate();
      }
      return isSameDay(day, hDate);
    });
  };

  const visibleHolidays = useMemo(() => {
    return holidays.filter(h => {
      const hDate = parseISO(h.date);
      if (h.type === "Recurring") {
        return hDate.getMonth() === currentMonth.getMonth();
      }
      return isSameMonth(hDate, currentMonth);
    });
  }, [currentMonth, holidays]);

  return (
    <div className="min-h-screen bg-primary-100 no-scrollbar pb-20">
      <Header title="Calendar Control" />
      
      <div className="p-8 max-w-350 mx-auto">
        <div className="flex flex-col xl:flex-row gap-8">
          
          <div className="flex-1 bg-white border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(185,28,28,0.08)] rounded-none overflow-hidden h-fit">
            <div className="p-6 border-b-2 border-slate-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50">
              <div>
                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-primary-800">Scheduled Institutional Events</h2>
                <p className="text-xl font-black tracking-tighter text-slate-900 uppercase">{format(currentMonth, 'MMMM yyyy')}</p>
              </div>
              <button 
                className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 border-2 border-slate-900 text-[10px] font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(185,28,28,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
                onClick={handleOpenAdd}
              >
                <Plus size={16} />
                Register Holiday
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Event Designation</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Reference Date</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Classification</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-center">Functions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-100">
                  {visibleHolidays.map((holiday) => (
                    <tr key={holiday.id} className="hover:bg-primary-50/30 transition-colors group">
                      <td className="px-6 py-5 text-sm font-black text-slate-900 uppercase tracking-tight">{holiday.name}</td>
                      <td className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-tighter">
                        {holiday.type === "Recurring" 
                          ? format(parseISO(holiday.date), 'MMMM dd') + " [ANNUAL]"
                          : format(parseISO(holiday.date), 'MMMM dd, yyyy')
                        }
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-3 py-1 border-2 text-[10px] font-black uppercase tracking-widest ${
                          holiday.type === 'Recurring' 
                            ? 'bg-primary-800 border-primary-800 text-white' 
                            : 'bg-white border-slate-900 text-slate-900'
                        }`}>
                          {holiday.type}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex justify-center gap-3">
                          <button 
                            onClick={() => handleOpenEdit(holiday)} 
                            className="p-2 border-2 border-slate-200 text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleOpenDelete(holiday)}
                            className="p-2 border-2 border-slate-200 text-slate-400 hover:border-primary-700 hover:text-primary-700 transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleHolidays.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-6 py-16 text-center text-slate-300 text-[10px] font-black uppercase tracking-[0.4em]">
                        No active records for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="w-full xl:w-100 bg-white border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,0.05)] p-8 rounded-none h-fit">
            <CalendarWidget 
              currentMonth={currentMonth} 
              setCurrentMonth={setCurrentMonth}
              getHolidayForDay={getHolidayForDay}
            />
          </div>
        </div>
      </div>

      <AddHolidayModal 
        isOpen={isAddEditOpen} 
        onClose={() => setIsAddEditOpen(false)} 
        onSave={handleSaveHoliday}
        initialData={selectedHoliday}
      />

      <DeleteConfirmationModal 
        isOpen={isDeleteOpen}
        itemName={selectedHoliday?.name}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function CalendarWidget({ currentMonth, setCurrentMonth, getHolidayForDay }) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  return (
    <div>
      <div className="flex justify-between items-center mb-10 border-b-2 border-slate-100 pb-6">
        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{format(currentMonth, 'MMMM yyyy')}</h3>
        <div className="flex gap-2">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 border-2 border-slate-900 hover:bg-slate-50 transition-all"><ChevronLeft size={18} /></button>
          <button onClick={() => setCurrentMonth(new Date())} className="px-3 border-2 border-slate-900 text-[9px] font-black text-slate-900 hover:bg-slate-900 hover:text-white uppercase tracking-widest transition-all">Today</button>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 border-2 border-slate-900 hover:bg-slate-50 transition-all"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map(day => (
          <div key={day} className="text-[10px] font-black text-slate-400 text-center py-2 tracking-widest">{day}</div>
        ))}
        {calendarDays.map((day, i) => {
          const isToday = isSameDay(day, new Date());
          const holiday = getHolidayForDay(day);
          const isCurrentMonth = isSameMonth(day, monthStart);

          return (
            <div key={i} className="aspect-square flex justify-center items-center p-1">
              <span className={`
                w-full h-full flex items-center justify-center border-2 text-xs font-black transition-all cursor-default
                ${!isCurrentMonth ? 'border-transparent text-slate-200' : 'border-slate-100 text-slate-900'}
                ${isToday ? 'border-primary-700 bg-primary-50/50 text-primary-800' : ''}
                ${holiday?.type === 'Recurring' ? 'bg-primary-800 border-primary-800 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.2)]' : ''}
                ${holiday?.type === 'One-time' ? 'bg-slate-900 border-slate-900 text-white' : ''}
              `}>
                {format(day, 'd')}
              </span>
            </div>
          );
        })}
      </div>
      
      <div className="mt-12 pt-8 border-t-2 border-slate-100 space-y-4">
        <LegendItem color="bg-primary-800" label="Recurring Institutional" />
        <LegendItem color="bg-slate-900" label="One-time Special" />
        <LegendItem color="border-2 border-primary-700" label="Current Timestamp" />
      </div>
    </div>
  );
}

const LegendItem = ({ color, label }) => (
  <div className="flex items-center gap-4">
    <div className={`w-3 h-3 ${color}`}></div>
    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
  </div>
);

function Header({ title }) {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-7">
      <div className="max-w-350 mx-auto relative z-10">
        <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
          Holiday <span className="text-primary-800">Coordination</span>
        </h1>
      </div>
    </header>
  );
}