import React, { useState, useMemo } from 'react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval, parseISO 
} from 'date-fns';
import { 
  Edit2, Trash2, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon 
} from 'lucide-react';
import AddHolidayModal from '../components/modal/AddHolidayModal';
import DeleteConfirmationModal from '../components/modal/DeleteConfirmationModal';

// Mock Data using ISO Strings
const initialHolidays = [
  { id: 1, name: "All Saints' Day Eve", date: "2025-10-31", type: "Recurring" },
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
  
  // Modal & Selection State
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState(null);

  // --- HANDLERS ---
  const handleOpenAdd = () => {
    setSelectedHoliday(null);
    setIsAddEditOpen(true);
  };

  const handleOpenEdit = (holiday) => {
    setSelectedHoliday(holiday);
    setIsAddEditOpen(true);
  };

  const handleOpenDelete = (holiday) => {
    setSelectedHoliday(holiday);
    setIsDeleteOpen(true);
  };

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

  // --- LOGIC ---
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
    <div className="min-h-screen bg-gray-50 no-scrollbar pb-10">
      <Header title="Calendar Control" />
      
      <div className="p-6 mt-8">
        <div className="flex flex-col xl:flex-row gap-6">
          
          {/* Main Content: Holiday Table */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-fit">
            <div className="p-6 border-b border-gray-50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Scheduled Holidays</h2>
                <p className="text-xs text-slate-400">Viewing {format(currentMonth, 'MMMM yyyy')}</p>
              </div>
              <button 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-blue-100"
                onClick={handleOpenAdd}
              >
                <Plus size={18} />
                Add Holiday
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50/50">
                  <tr className="text-gray-400 text-[12px] uppercase tracking-widest">
                    <th className="px-6 py-4 font-bold">Holiday Name</th>
                    <th className="px-6 py-4 font-bold">Date</th>
                    <th className="px-6 py-4 font-bold">Recurrence</th>
                    <th className="px-6 py-4 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleHolidays.map((holiday) => (
                    <tr key={holiday.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4 text-sm font-medium text-slate-700">{holiday.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {holiday.type === "Recurring" 
                          ? format(parseISO(holiday.date), 'MMMM dd') + " (Annual)"
                          : format(parseISO(holiday.date), 'MMMM dd, yyyy')
                        }
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter ${
                          holiday.type === 'Recurring' 
                            ? 'bg-red-500 text-white' 
                            : 'bg-indigo-100 text-indigo-600'
                        }`}>
                          {holiday.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleOpenEdit(holiday)} 
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleOpenDelete(holiday)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleHolidays.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-gray-400 text-sm italic">
                        No holidays or events scheduled for this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar Content: Interactive Calendar */}
          <div className="w-full xl:w-96 bg-white rounded-xl border border-gray-200 shadow-sm p-6 h-fit">
            <CalendarWidget 
              currentMonth={currentMonth} 
              setCurrentMonth={setCurrentMonth}
              getHolidayForDay={getHolidayForDay}
            />
          </div>
        </div>
      </div>

      {/* MODALS */}
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
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-bold text-slate-800">{format(currentMonth, 'MMMM yyyy')}</h3>
        <div className="flex gap-1">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><ChevronLeft size={20} /></button>
          <button onClick={() => setCurrentMonth(new Date())} className="px-2 text-[10px] font-bold text-gray-400 hover:text-blue-600 uppercase">Today</button>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><ChevronRight size={20} /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => (
          <div key={day} className="text-[10px] font-bold text-gray-400 py-2 uppercase tracking-widest">{day}</div>
        ))}
        {calendarDays.map((day, i) => {
          const isToday = isSameDay(day, new Date());
          const holiday = getHolidayForDay(day);

          return (
            <div key={i} className="py-1 flex justify-center items-center">
              <span className={`
                w-9 h-9 flex items-center justify-center rounded-full text-xs transition-all cursor-default
                ${!isSameMonth(day, monthStart) ? 'text-gray-200' : 'text-slate-600'}
                ${isToday ? 'border-2 border-blue-500 font-bold text-blue-600' : ''}
                ${holiday?.type === 'Recurring' ? 'bg-red-500 text-white font-bold shadow-lg shadow-red-100' : ''}
                ${holiday?.type === 'One-time' ? 'bg-gray-100 text-slate-900 font-semibold' : ''}
              `}>
                {format(day, 'd')}
              </span>
            </div>
          );
        })}
      </div>
      
      <div className="mt-8 pt-6 border-t border-gray-50 space-y-3">
        <LegendItem color="bg-red-500" label="Recurring Holiday" />
        <LegendItem color="bg-gray-200" label="One-time Event" />
        <LegendItem color="border-2 border-blue-500" label="Today" />
      </div>
    </div>
  );
}

const LegendItem = ({ color, label }) => (
  <div className="flex items-center gap-3">
    <div className={`w-2.5 h-2.5 rounded-full ${color}`}></div>
    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-tight">{label}</span>
  </div>
);

function Header({ title }) {
  return (
    <div className="bg-linear-to-r from-indigo-100 via-blue-50 to-amber-50 p-8 h-48 flex items-end">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">{title}</h1>
      </div>
    </div>
  );
}