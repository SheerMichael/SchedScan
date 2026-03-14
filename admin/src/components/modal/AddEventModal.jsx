import React, { useState, useEffect } from 'react';
import { X, ChevronDown, Calendar as CalendarIcon, Loader2, AlertCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AddEventModal({ isOpen, onClose, onSave, initialData, isSaving = false, saveError = null }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [eventType, setEventType] = useState('one_time');
  const [visibility, setVisibility] = useState('all');

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setEventDate(initialData.date || '');
      setStartTime(initialData.start_time || '');
      setEndTime(initialData.end_time || '');
      setLocation(initialData.location || '');
      setEventType(initialData.event_type || 'one_time');
      setVisibility(initialData.visibility || 'all');
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setTitle('');
      setDescription('');
      setEventDate(today);
      setStartTime('');
      setEndTime('');
      setLocation('');
      setEventType('one_time');
      setVisibility('all');
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      toast.error('Invalid date format. Please use the date picker.');
      return;
    }

    if (startTime && endTime && startTime >= endTime) {
      toast.error('End time must be after start time.');
      return;
    }

    onSave({
      id: initialData?.id,
      title,
      description,
      date: eventDate,
      start_time: startTime || null,
      end_time: endTime || null,
      location,
      event_type: eventType,
      visibility,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-[#fcfcf9] w-full max-w-lg rounded-none border-2 border-slate-900 shadow-[12px_12px_0px_0px_rgba(15,23,42,1)] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-150 max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center shrink-0">
          <div>
            <p className="text-[9px] font-black tracking-[0.3em] text-primary-400 uppercase">Event Registry</p>
            <h2 className="text-xl font-black uppercase tracking-tighter">
              {initialData ? 'Edit Event' : 'New Event'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 border-2 border-slate-700 hover:border-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto">
          
          {/* Title */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Event Title</label>
            <input 
              type="text" required value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-4 bg-white border-2 border-slate-900 rounded-none focus:outline-none focus:bg-primary-50/20 transition-all font-bold text-sm uppercase"
              placeholder="e.g., ENROLLMENT PERIOD"
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Description (Optional)</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-white border-2 border-slate-900 rounded-none focus:outline-none focus:bg-primary-50/20 transition-all font-bold text-xs"
              placeholder="Details about the event..."
              rows={3}
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Event Date</label>
            <div className="relative">
              <input
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full pl-9 pr-3 py-4 bg-white border-2 border-slate-900 rounded-none font-bold text-sm focus:outline-none focus:bg-primary-50/20 cursor-pointer"
              />
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            </div>
          </div>

          {/* Time fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Start Time (Optional)</label>
              <div className="relative">
                <input 
                  type="time" value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-8 py-3 bg-white border-2 border-slate-900 rounded-none font-bold text-xs focus:outline-none focus:bg-primary-50/20"
                />
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">End Time (Optional)</label>
              <div className="relative">
                <input 
                  type="time" value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-8 py-3 bg-white border-2 border-slate-900 rounded-none font-bold text-xs focus:outline-none focus:bg-primary-50/20"
                />
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Location (Optional)</label>
            <input 
              type="text" value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-3 bg-white border-2 border-slate-900 rounded-none focus:outline-none focus:bg-primary-50/20 transition-all font-bold text-xs uppercase"
              placeholder="e.g., MAIN HALL"
              maxLength={200}
            />
          </div>

          {/* Event Type & Visibility */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Classification</label>
              <div className="relative">
                <select value={eventType} onChange={(e) => setEventType(e.target.value)}
                  className="w-full appearance-none px-4 py-3 bg-white border-2 border-slate-900 rounded-none text-[10px] font-black uppercase tracking-widest cursor-pointer focus:outline-none"
                >
                  <option value="one_time">One-time</option>
                  <option value="recurring">Recurring</option>
                </select>
                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Visibility</label>
              <div className="relative">
                <select value={visibility} onChange={(e) => setVisibility(e.target.value)}
                  className="w-full appearance-none px-4 py-3 bg-white border-2 border-slate-900 rounded-none text-[10px] font-black uppercase tracking-widest cursor-pointer focus:outline-none"
                >
                  <option value="all">All Users</option>
                  <option value="student">Students Only</option>
                  <option value="faculty">Faculty Only</option>
                </select>
                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

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
            {isSaving ? 'Saving…' : initialData ? 'Update Event' : 'Register Event'}
          </button>
        </form>
      </div>
    </div>
  );
}
