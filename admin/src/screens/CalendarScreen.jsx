import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval, parseISO, isBefore, isAfter
} from 'date-fns';
import { 
  Edit2, Trash2, Plus, ChevronLeft, ChevronRight, Loader2, AlertCircle,
  CalendarDays, Star, MapPin, Clock, Eye
} from 'lucide-react';
import AddHolidayModal from '../components/modal/AddHolidayModal';
import AddEventModal from '../components/modal/AddEventModal';
import DeleteConfirmationModal from '../components/modal/DeleteConfirmationModal';
import { holidaysApi, calendarEventsApi, parseApiError } from '../services/api';

/** Normalize API holiday_type → display type used throughout the UI */
function toDisplayType(apiType) {
  return apiType === 'recurring' ? 'Recurring' : 'One-time';
}

/** Normalize UI display type → API holiday_type */
function toApiType(displayType) {
  return displayType === 'Recurring' ? 'recurring' : 'one_time';
}

const VISIBILITY_LABELS = {
  all: 'All Users',
  student: 'Students',
  faculty: 'Faculty',
};

function formatTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export default function CalendarControlScreen() {
  // ---- shared state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState('holidays'); // 'holidays' | 'events'

  // ---- holidays state
  const [holidays, setHolidays] = useState([]);
  const [loadingHolidays, setLoadingHolidays] = useState(true);
  const [holidayError, setHolidayError] = useState(null);
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [holidaySaveError, setHolidaySaveError] = useState(null);
  const [isAddEditHolidayOpen, setIsAddEditHolidayOpen] = useState(false);
  const [isDeleteHolidayOpen, setIsDeleteHolidayOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState(null);

  // ---- calendar events state
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventError, setEventError] = useState(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventSaveError, setEventSaveError] = useState(null);
  const [isAddEditEventOpen, setIsAddEditEventOpen] = useState(false);
  const [isDeleteEventOpen, setIsDeleteEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // ---- Fetch holidays
  const fetchHolidays = useCallback(async () => {
    setLoadingHolidays(true);
    setHolidayError(null);
    try {
      const { data } = await holidaysApi.list();
      setHolidays(
        data.map(h => ({
          id: h.id,
          name: h.name,
          date: h.date,
          type: toDisplayType(h.holiday_type),
        }))
      );
    } catch (err) {
      setHolidayError(parseApiError(err).message);
    } finally {
      setLoadingHolidays(false);
    }
  }, []);

  // ---- Fetch calendar events
  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    setEventError(null);
    try {
      const { data } = await calendarEventsApi.list();
      setEvents(data);
    } catch (err) {
      setEventError(parseApiError(err).message);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => { fetchHolidays(); fetchEvents(); }, [fetchHolidays, fetchEvents]);

  // ---- Holiday handlers
  const handleOpenAddHoliday = () => { setSelectedHoliday(null); setHolidaySaveError(null); setIsAddEditHolidayOpen(true); };
  const handleOpenEditHoliday = (holiday) => { setSelectedHoliday(holiday); setHolidaySaveError(null); setIsAddEditHolidayOpen(true); };
  const handleOpenDeleteHoliday = (holiday) => { setSelectedHoliday(holiday); setIsDeleteHolidayOpen(true); };

  const handleSaveHoliday = async (holidayData) => {
    setSavingHoliday(true);
    setHolidaySaveError(null);
    try {
      const payload = {
        name: holidayData.name,
        date: holidayData.date,
        holiday_type: toApiType(holidayData.type),
      };
      if (selectedHoliday) {
        await holidaysApi.update(selectedHoliday.id, payload);
      } else {
        await holidaysApi.create(payload);
      }
      setIsAddEditHolidayOpen(false);
      await fetchHolidays();
    } catch (err) {
      setHolidaySaveError(parseApiError(err).message);
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleConfirmDeleteHoliday = async () => {
    try {
      await holidaysApi.delete(selectedHoliday.id);
      setHolidays(prev => prev.filter(h => h.id !== selectedHoliday.id));
      setIsDeleteHolidayOpen(false);
      setSelectedHoliday(null);
    } catch (err) {
      setIsDeleteHolidayOpen(false);
      setHolidayError(parseApiError(err).message);
    }
  };

  // ---- Event handlers
  const handleOpenAddEvent = () => { setSelectedEvent(null); setEventSaveError(null); setIsAddEditEventOpen(true); };
  const handleOpenEditEvent = (event) => { setSelectedEvent(event); setEventSaveError(null); setIsAddEditEventOpen(true); };
  const handleOpenDeleteEvent = (event) => { setSelectedEvent(event); setIsDeleteEventOpen(true); };

  const handleSaveEvent = async (eventData) => {
    setSavingEvent(true);
    setEventSaveError(null);
    try {
      const payload = {
        title: eventData.title,
        description: eventData.description || '',
        date: eventData.date,
        start_time: eventData.start_time || null,
        end_time: eventData.end_time || null,
        location: eventData.location || '',
        event_type: eventData.event_type,
        visibility: eventData.visibility,
      };
      if (selectedEvent) {
        await calendarEventsApi.update(selectedEvent.id, payload);
      } else {
        await calendarEventsApi.create(payload);
      }
      setIsAddEditEventOpen(false);
      await fetchEvents();
    } catch (err) {
      setEventSaveError(parseApiError(err).message);
    } finally {
      setSavingEvent(false);
    }
  };

  const handleConfirmDeleteEvent = async () => {
    try {
      await calendarEventsApi.delete(selectedEvent.id);
      setEvents(prev => prev.filter(e => e.id !== selectedEvent.id));
      setIsDeleteEventOpen(false);
      setSelectedEvent(null);
    } catch (err) {
      setIsDeleteEventOpen(false);
      setEventError(parseApiError(err).message);
    }
  };

  // ---- Calendar dot helpers
  const getHolidayForDay = (day) => {
    return holidays.find(h => {
      const start = parseISO(h.startDate || h.date);
      const end = h.endDate ? parseISO(h.endDate) : start;
      const isWithinRange = (isSameDay(day, start) || isAfter(day, start)) && (isSameDay(day, end) || isBefore(day, end));
      const isRecurringMatch = day.getMonth() === start.getMonth() && day.getDate() === start.getDate();
      if (h.type === "Recurring") return isRecurringMatch;
      return isWithinRange;
    });
  };

  const getEventForDay = (day) => {
    return events.find(e => {
      const eDate = parseISO(e.date);
      if (e.event_type === 'recurring') {
        return day.getMonth() === eDate.getMonth() && day.getDate() === eDate.getDate();
      }
      return isSameDay(day, eDate);
    });
  };

  // ---- Filtered lists for the current month
  const visibleHolidays = useMemo(() => {
    return holidays.filter(h => {
      const hDate = parseISO(h.date);
      if (h.type === "Recurring") {
        return hDate.getMonth() === currentMonth.getMonth();
      }
      return isSameMonth(hDate, currentMonth);
    });
  }, [currentMonth, holidays]);

  const visibleEvents = useMemo(() => {
    return events.filter(e => {
      const eDate = parseISO(e.date);
      if (e.event_type === 'recurring') {
        return eDate.getMonth() === currentMonth.getMonth();
      }
      return isSameMonth(eDate, currentMonth);
    });
  }, [currentMonth, events]);

  const error = activeTab === 'holidays' ? holidayError : eventError;
  const retryFetch = activeTab === 'holidays' ? fetchHolidays : fetchEvents;

  return (
    <div className="min-h-screen bg-[#fcfcf9] no-scrollbar pb-20 selection:bg-primary-100">
      <Header />
      
      <div className="p-8 max-w-350 mx-auto">

        {error && (
          <div className="mb-6 flex items-start gap-3 bg-red-50 border-2 border-red-700 px-5 py-4">
            <AlertCircle size={16} className="text-red-700 mt-0.5 shrink-0" />
            <div className="flex-1 text-[11px] font-bold text-red-700 uppercase tracking-wider">{error}</div>
            <button onClick={retryFetch} className="text-[10px] font-black text-red-700 uppercase tracking-widest underline underline-offset-2 hover:no-underline">Retry</button>
          </div>
        )}

        <div className="flex flex-col xl:flex-row gap-8">
          
          {/* Main content panel */}
          <div className="flex-1 bg-white border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(185,28,28,0.08)] rounded-none overflow-hidden h-fit">
            
            {/* Tab bar + action button */}
            <div className="p-6 border-b-2 border-slate-900 bg-slate-50">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex gap-1 mb-3">
                    <button
                      onClick={() => setActiveTab('holidays')}
                      className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                        activeTab === 'holidays'
                          ? 'bg-primary-800 border-primary-800 text-white'
                          : 'bg-white border-slate-300 text-slate-500 hover:border-slate-900 hover:text-slate-900'
                      }`}
                    >
                      <Star size={12} className="inline mr-1.5 -mt-0.5" />
                      Holidays
                    </button>
                    <button
                      onClick={() => setActiveTab('events')}
                      className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                        activeTab === 'events'
                          ? 'bg-blue-700 border-blue-700 text-white'
                          : 'bg-white border-slate-300 text-slate-500 hover:border-slate-900 hover:text-slate-900'
                      }`}
                    >
                      <CalendarDays size={12} className="inline mr-1.5 -mt-0.5" />
                      Events
                    </button>
                  </div>
                  <p className="text-xl font-black tracking-tighter text-slate-900 uppercase">{format(currentMonth, 'MMMM yyyy')}</p>
                </div>
                <button 
                  className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 border-2 border-slate-900 text-[10px] font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(185,28,28,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
                  onClick={activeTab === 'holidays' ? handleOpenAddHoliday : handleOpenAddEvent}
                >
                  <Plus size={16} />
                  {activeTab === 'holidays' ? 'Register Holiday' : 'Register Event'}
                </button>
              </div>
            </div>
            
            {/* Holidays table */}
            {activeTab === 'holidays' && (
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
                    {loadingHolidays ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-16 text-center">
                          <Loader2 size={20} className="animate-spin text-slate-300 mx-auto" />
                        </td>
                      </tr>
                    ) : visibleHolidays.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-16 text-center text-slate-300 text-[10px] font-black uppercase tracking-[0.4em]">
                          No holidays for this period.
                        </td>
                      </tr>
                    ) : (
                      visibleHolidays.map((holiday) => (
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
                                onClick={() => handleOpenEditHoliday(holiday)} 
                                className="p-2 border-2 border-slate-200 text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button 
                                onClick={() => handleOpenDeleteHoliday(holiday)}
                                className="p-2 border-2 border-slate-200 text-slate-400 hover:border-primary-700 hover:text-primary-700 transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Events table */}
            {activeTab === 'events' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Event Title</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Date & Time</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Location</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Visibility</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Type</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-center">Functions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {loadingEvents ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-16 text-center">
                          <Loader2 size={20} className="animate-spin text-slate-300 mx-auto" />
                        </td>
                      </tr>
                    ) : visibleEvents.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-16 text-center text-slate-300 text-[10px] font-black uppercase tracking-[0.4em]">
                          No events for this period.
                        </td>
                      </tr>
                    ) : (
                      visibleEvents.map((event) => (
                        <tr key={event.id} className="hover:bg-blue-50/30 transition-colors group">
                          <td className="px-6 py-5">
                            <div className="text-sm font-black text-slate-900 uppercase tracking-tight">{event.title}</div>
                            {event.description && (
                              <div className="text-[10px] text-slate-400 mt-1 line-clamp-1 normal-case">{event.description}</div>
                            )}
                          </td>
                          <td className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-tighter">
                            <div>
                              {event.event_type === 'recurring'
                                ? format(parseISO(event.date), 'MMMM dd') + " [ANNUAL]"
                                : format(parseISO(event.date), 'MMMM dd, yyyy')
                              }
                            </div>
                            {event.start_time && (
                              <div className="flex items-center gap-1 mt-1 text-slate-400">
                                <Clock size={10} />
                                {formatTime(event.start_time)}
                                {event.end_time && ` — ${formatTime(event.end_time)}`}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-tighter">
                            {event.location ? (
                              <span className="flex items-center gap-1">
                                <MapPin size={10} className="shrink-0" />
                                {event.location}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-6 py-5">
                            <span className={`inline-flex items-center gap-1 px-3 py-1 border-2 text-[10px] font-black uppercase tracking-widest ${
                              event.visibility === 'all'
                                ? 'bg-emerald-50 border-emerald-600 text-emerald-700'
                                : event.visibility === 'student'
                                ? 'bg-amber-50 border-amber-600 text-amber-700'
                                : 'bg-violet-50 border-violet-600 text-violet-700'
                            }`}>
                              <Eye size={10} />
                              {VISIBILITY_LABELS[event.visibility]}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`px-3 py-1 border-2 text-[10px] font-black uppercase tracking-widest ${
                              event.event_type === 'recurring'
                                ? 'bg-blue-700 border-blue-700 text-white'
                                : 'bg-white border-slate-900 text-slate-900'
                            }`}>
                              {event.event_type === 'recurring' ? 'Recurring' : 'One-time'}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex justify-center gap-3">
                              <button 
                                onClick={() => handleOpenEditEvent(event)} 
                                className="p-2 border-2 border-slate-200 text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button 
                                onClick={() => handleOpenDeleteEvent(event)}
                                className="p-2 border-2 border-slate-200 text-slate-400 hover:border-primary-700 hover:text-primary-700 transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Calendar widget sidebar */}
          <div className="w-full xl:w-96 bg-white border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,0.05)] p-8 rounded-none h-fit">
            <CalendarWidget 
              currentMonth={currentMonth} 
              setCurrentMonth={setCurrentMonth}
              getHolidayForDay={getHolidayForDay}
              getEventForDay={getEventForDay}
            />
          </div>
        </div>
      </div>

      {/* Holiday modals */}
      <AddHolidayModal 
        isOpen={isAddEditHolidayOpen} 
        onClose={() => { setIsAddEditHolidayOpen(false); setHolidaySaveError(null); }}
        onSave={handleSaveHoliday}
        initialData={selectedHoliday}
        isSaving={savingHoliday}
        saveError={holidaySaveError}
      />

      <DeleteConfirmationModal 
        isOpen={isDeleteHolidayOpen}
        itemName={selectedHoliday?.name}
        onClose={() => setIsDeleteHolidayOpen(false)}
        onConfirm={handleConfirmDeleteHoliday}
      />

      {/* Event modals */}
      <AddEventModal
        isOpen={isAddEditEventOpen}
        onClose={() => { setIsAddEditEventOpen(false); setEventSaveError(null); }}
        onSave={handleSaveEvent}
        initialData={selectedEvent}
        isSaving={savingEvent}
        saveError={eventSaveError}
      />

      <DeleteConfirmationModal 
        isOpen={isDeleteEventOpen}
        itemName={selectedEvent?.title}
        onClose={() => setIsDeleteEventOpen(false)}
        onConfirm={handleConfirmDeleteEvent}
      />
    </div>
  );
}

function CalendarWidget({ currentMonth, setCurrentMonth, getHolidayForDay, getEventForDay }) {
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
          const event = getEventForDay(day);
          const isCurrentMonth = isSameMonth(day, monthStart);

          return (
            <div key={i} className="aspect-square flex justify-center items-center p-1">
              <span className={`
                w-full h-full flex flex-col items-center justify-center border-2 text-xs font-black transition-all cursor-default relative
                ${!isCurrentMonth ? 'border-transparent text-slate-200' : 'border-slate-100 text-slate-900'}
                ${holiday?.type === 'Recurring' ? 'bg-primary-800! border-primary-800! text-white! shadow-[3px_3px_0px_0px_rgba(0,0,0,0.2)]' : ''}
                ${holiday?.type === 'One-time' ? 'bg-slate-900! border-slate-900! text-white!' : ''}
                ${isToday ? 'ring-2 ring-primary-700 ring-offset-1 border-primary-700!' : ''}
              `}>
                {format(day, 'd')}
                {event && !holiday && isCurrentMonth && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 absolute bottom-1" />
                )}
              </span>
            </div>
          );
        })}
      </div>
      
      <div className="mt-12 pt-8 border-t-2 border-slate-100 space-y-4">
        <LegendItem color="bg-primary-800" label="Recurring Holiday" />
        <LegendItem color="bg-slate-900" label="One-time Holiday" />
        <LegendItem color="bg-blue-600" label="Calendar Event" dot />
        <LegendItem color="border-2 border-primary-700" label="Current Date" />
      </div>
    </div>
  );
}

const LegendItem = ({ color, label, dot }) => (
  <div className="flex items-center gap-4">
    <div className={`${dot ? 'w-2 h-2 rounded-full' : 'w-3 h-3'} ${color}`}></div>
    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
  </div>
);

function Header() {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-7">
      <div className="max-w-350 mx-auto relative z-10">
        <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
          Calendar <span className="text-primary-800">Control</span>
        </h1>
      </div>
    </header>
  );
}
