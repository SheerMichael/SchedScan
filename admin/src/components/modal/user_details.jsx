import { X, Calendar, MapPin, Clock } from 'lucide-react';
import React, { useState } from "react";

export default function UserDetailsModal({ isOpen, onClose, user, allUsers }) {
  if (!isOpen) return null;

  const [viewMode, setViewMode] = useState("schedule");
  const showSchedule = user?.role === "Student" || user?.role === "Faculty";

  const activeClass = user?.schedule?.find(item =>
    is_today_in_schedule(item.day) &&
    compare_time(item.start_time, item.end_time)
  );

  const classSession = activeClass
    ? `SESSION ACTIVE: ${activeClass.location}`
    : "NO ACTIVE SESSION";

  const studentsInCurrentClass =
    user?.role === "Faculty" && activeClass
      ? allUsers?.filter(u =>
          u.role === "Student" &&
          u.schedule?.some(s =>
            s.subject_code === activeClass.subject_code &&
            s.location === activeClass.location &&
            s.start_time === activeClass.start_time &&
            s.end_time === activeClass.end_time &&
            s.day === activeClass.day
          )
        )
      : [];

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-[#fcfcf9] w-full max-w-lg rounded-none border-2 border-slate-900 shadow-[12px_12px_0px_0px_rgba(185,28,28,0.15)] p-0 max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Institutional Header */}
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black tracking-[0.3em] text-primary-400 uppercase">Institutional Archive</p>
            <h2 className="text-xl font-black uppercase tracking-tighter">User Identification File</h2>
          </div>
          <button onClick={onClose} className="p-2 border-2 border-slate-700 hover:border-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto no-scrollbar">
          {user && (
            <div className="space-y-8">
              {/* Profile Section */}
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="w-24 h-24 border-2 border-slate-900 bg-white flex items-center justify-center text-slate-900 text-4xl font-black shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                  {user.name.charAt(0)}
                </div>
                <div className="space-y-2">
                   <div className="inline-block bg-primary-800 text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
                    {user.role}
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">{user.name}</h3>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${activeClass ? 'text-emerald-600' : 'text-slate-400'}`}>
                    ● {classSession}
                  </p>
                </div>
              </div>

              {/* Data Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y-2 border-slate-100 py-6">
                <DetailItem label="Official Email" value={user.email} />
                <DetailItem label="Registry Status" value={user.status} color={user.status === 'Active' ? 'text-emerald-600' : 'text-slate-400'} />
                <DetailItem label="Joined On" value={user.joinDate} />
              </div>

              {showSchedule && (
                <div className="space-y-6">
                  {/* Rigid Toggles */}
                  <div className="flex border-2 border-slate-900 p-1 bg-slate-100">
                    <button
                      onClick={() => setViewMode("schedule")}
                      className={`flex-1 text-[10px] font-black uppercase tracking-widest py-2 transition-all
                        ${viewMode === "schedule" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}
                    >
                      Class Schedule
                    </button>
                    {user.role === "Faculty" && activeClass && (
                      <button
                        onClick={() => setViewMode("students")}
                        className={`flex-1 text-[10px] font-black uppercase tracking-widest py-2 transition-all
                          ${viewMode === "students" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}
                      >
                        Enrolled Students
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    {viewMode === "schedule" ? (
                      user.schedule?.map((item, idx) => (
                        <div key={idx} className={`p-4 border-2 rounded-none transition-all ${
                          activeClass?.subject_code === item.subject_code
                            ? "border-primary-800 bg-primary-50/30 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)]"
                            : "border-slate-200 bg-white"
                        }`}>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-black text-slate-900">{item.subject_code}</span>
                            <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5">{item.location}</span>
                          </div>
                          <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                             <span className="flex items-center gap-1"><Clock size={12}/> {item.start_time}-{item.end_time}</span>
                             <span className="flex items-center gap-1"><Calendar size={12}/> {item.day}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      studentsInCurrentClass.map(student => (
                        <div key={student.id} className="p-4 border-2 border-slate-900 bg-white flex justify-between items-center">
                          <div>
                            <p className="text-xs font-black text-slate-900 uppercase">{student.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{student.email}</p>
                          </div>
                          <div className="w-2 h-2 bg-emerald-500" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, color = "text-slate-900" }) {
  return (
    <div>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{label}</p>
      <p className={`text-xs font-black uppercase leading-tight ${color}`}>{value}</p>
    </div>
  );
}

function get_current_time() {
  const date = new Date();
  let hours = date.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const minutes = date.getMinutes().toString().padStart(2, '0');
  hours = hours % 12;
  return hours + ':' + minutes + ' ' + ampm;
}

function get_today_code() {
  const today = new Date().getDay(); 

  const map = {
    0: "SU",
    1: "M",
    2: "T",
    3: "W",
    4: "TH",
    5: "F",
    6: "S"
  };

  return map[today];
}

function is_today_in_schedule(scheduleDay) {
  if (!scheduleDay) return false;

  const todayCode = get_today_code();

  const dayParts = scheduleDay.match(/TH|SU|M|T|W|F|S/g);

  return dayParts?.includes(todayCode);
}

function compare_time(user_start_time, user_end_time) {
  if (!user_start_time || !user_end_time) return false;

  const now = new Date();

  const start = new Date();
  const end = new Date();

  const [startTime, startPeriod] = user_start_time.split(" ");
  const [startHour, startMinute] = startTime.split(":").map(Number);

  const [endTime, endPeriod] = user_end_time.split(" ");
  const [endHour, endMinute] = endTime.split(":").map(Number);

  start.setHours(
    startPeriod === "PM" && startHour !== 12 ? startHour + 12 :
    startPeriod === "AM" && startHour === 12 ? 0 :
    startHour,
    startMinute,
    0,
    0
  );

  end.setHours(
    endPeriod === "PM" && endHour !== 12 ? endHour + 12 :
    endPeriod === "AM" && endHour === 12 ? 0 :
    endHour,
    endMinute,
    0,
    0
  );

  return now >= start && now <= end;
}