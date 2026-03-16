import { X, Calendar, Clock, Loader2, AlertCircle } from 'lucide-react';
import React, { useState, useMemo } from "react";

export default function UserDetailsModal({ isOpen, onClose, user, loading = false, error = null }) {
  const activeClass = useMemo(() => {
    return user?.schedule?.find(item =>
      is_today_in_schedule(item.day) &&
      compare_time(item.start_time, item.end_time)
    );
  }, [user]);

  const [viewMode, setViewMode] = useState(user?.role === "Parent" ? "linked" : "schedule");

  const showSchedule = user?.role === "Student" || user?.role === "Faculty";
  const showLinkedTab = user?.role === "Faculty" || user?.role === "Parent" || user?.role === "Student";

  const classSession = activeClass
    ? `SESSION ACTIVE: ${activeClass.location}`
    : "NO ACTIVE SESSION";

  const linkedAccounts = useMemo(() => {
    if (!user) return [];

    if (user.role === "Faculty") {
      return user.enrolled_students || [];
    }

    if (user.role === "Parent") {
      return user.linked_students || [];
    }

    if (user.role === "Student") {
      return user.linked_parents || [];
    }

    return [];
  }, [user]);

  const linkedTabLabel = user?.role === "Faculty" ? "Enrolled Students" : "Linked Accounts";

  const groupedFacultyAccounts = useMemo(() => {
    if (user?.role !== "Faculty") return [];

    const grouped = linkedAccounts.reduce((acc, student) => {
      const subjectCode = student.subject_code || "UNASSIGNED";
      if (!acc[subjectCode]) {
        acc[subjectCode] = [];
      }
      acc[subjectCode].push(student);
      return acc;
    }, {});

    return Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b))
      .map((subjectCode) => ({
        subjectCode,
        students: grouped[subjectCode],
      }));
  }, [user?.role, linkedAccounts]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-[#fcfcf9] w-full max-w-lg rounded-none border-2 border-slate-900 shadow-[12px_12px_0px_0px_rgba(185,28,28,0.15)] p-0 max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Institutional Header */}
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter">User Identification</h2>
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
                  {user.name?.charAt(0) || '?'}
                </div>
                <div className="space-y-2 min-w-0">
                   <div className="inline-block bg-primary-800 text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
                    {user.role}
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none wrap-break-word">
                    {user.name}
                  </h3>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${activeClass ? 'text-emerald-600' : 'text-slate-400'}`}>
                    ● {classSession}
                  </p>
                </div>
              </div>

              {/* Data Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-y-2 border-slate-100 py-6">
                <DetailItem label="Official Email" value={user.email} />
                {user.student_number && <DetailItem label="Student Number" value={user.student_number} />}
                <DetailItem label="Registry Status" value={user.status} color={user.status === 'Active' ? 'text-emerald-600' : 'text-slate-400'} />
                <DetailItem label="Joined On" value={user.joinDate} />
              </div>

              {(showSchedule || showLinkedTab) && (
                <div className="space-y-6">
                  <div className="flex border-2 border-slate-900 p-1 bg-slate-100">
                    {(user?.role === "Student" || user?.role === "Faculty") && (
                      <button
                        onClick={() => setViewMode("schedule")}
                        className={`flex-1 text-[10px] font-black uppercase tracking-widest py-2 transition-all
                          ${viewMode === "schedule" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}
                      >
                        Class Schedule
                      </button>
                    )}
                    
                    {showLinkedTab && (
                      <button
                        onClick={() => setViewMode("linked")}
                        className={`flex-1 text-[10px] font-black uppercase tracking-widest py-2 transition-all
                          ${viewMode === "linked" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}
                      >
                        {linkedTabLabel}
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    {loading ? (
                      <div className="py-8 flex items-center justify-center text-slate-400">
                        <Loader2 size={20} className="animate-spin" />
                      </div>
                    ) : error ? (
                      <div className="p-3 border-2 border-red-200 bg-red-50 text-red-700 text-xs font-bold flex items-center gap-2">
                        <AlertCircle size={14} className="shrink-0" />
                        {error}
                      </div>
                    ) : viewMode === "schedule" ? (
                      user.schedule?.length ? (
                        user.schedule.map((item, idx) => (
                          <div key={idx} className={`p-4 border-2 rounded-none transition-all ${
                            activeClass?.subject_code === item.subject_code &&
                            activeClass?.day === item.day &&
                            activeClass?.start_time === item.start_time
                              ? "border-primary-800 bg-primary-50/30 shadow-[4px_4px_0px_0px_rgba(185,28,28,0.1)]"
                              : "border-slate-200 bg-white"
                          }`}>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-black text-slate-900">{item.subject_code}</span>
                              <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5">{item.location || 'TBA'}</span>
                            </div>
                            <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              <span className="flex items-center gap-1"><Clock size={12}/> {item.start_time}-{item.end_time}</span>
                              <span className="flex items-center gap-1"><Calendar size={12}/> {item.day || 'TBA'}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 border-2 border-slate-200 bg-white text-center text-[10px] font-black tracking-widest uppercase text-slate-400">
                          No class schedule found.
                        </div>
                      )
                    ) : user?.role === "Faculty" ? (
                      groupedFacultyAccounts.length ? (
                        groupedFacultyAccounts.map((group) => (
                          <div key={group.subjectCode} className="space-y-2">
                            <div className="flex items-center justify-between px-3 py-2 border-2 border-slate-900 bg-slate-100">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">
                                Subject: {group.subjectCode}
                              </p>
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                                {group.students.length} Student{group.students.length > 1 ? 's' : ''}
                              </p>
                            </div>

                            {group.students.map((linkedUser, idx) => (
                              <div key={`${group.subjectCode}-${linkedUser.id || linkedUser.email}-${idx}`} className="p-4 border-2 border-slate-900 bg-white flex justify-between items-center shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] font-black bg-primary-800 text-white px-1.5 py-0.5 uppercase">
                                      {linkedUser.role}
                                    </span>
                                    <p className="text-xs font-black text-slate-900 uppercase">{linkedUser.name}</p>
                                  </div>
                                  <p className="text-[10px] font-bold text-slate-400 tracking-tighter">{linkedUser.email}</p>
                                </div>
                                <div className={`w-2 h-2 ${linkedUser.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                              </div>
                            ))}
                          </div>
                        ))
                      ) : (
                        <div className="p-4 border-2 border-slate-200 bg-white text-center text-[10px] font-black tracking-widest uppercase text-slate-400">
                          No enrolled students found.
                        </div>
                      )
                    ) : (
                      linkedAccounts.length ? (
                        linkedAccounts.map((linkedUser, idx) => (
                          <div key={`${linkedUser.id || linkedUser.email}-${idx}`} className="p-4 border-2 border-slate-900 bg-white flex justify-between items-center shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] font-black bg-primary-800 text-white px-1.5 py-0.5 uppercase">
                                  {linkedUser.role}
                                </span>
                                <p className="text-xs font-black text-slate-900 uppercase">{linkedUser.name}</p>
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 tracking-tighter">{linkedUser.email}</p>
                            </div>
                            <div className={`w-2 h-2 ${linkedUser.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          </div>
                        ))
                      ) : (
                        <div className="p-4 border-2 border-slate-200 bg-white text-center text-[10px] font-black tracking-widest uppercase text-slate-400">
                          No linked accounts found.
                        </div>
                      )
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
    <div className="min-w-0">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{label}</p>
      <p className={`text-xs font-black leading-tight break-all ${color}`}>{value || '—'}</p>
    </div>
  );
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

  const parsedStart = parse_time_string(user_start_time);
  const parsedEnd = parse_time_string(user_end_time);

  if (!parsedStart || !parsedEnd) return false;
  const { hour: startHour, minute: startMinute, period: startPeriod } = parsedStart;
  const { hour: endHour, minute: endMinute, period: endPeriod } = parsedEnd;

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

function parse_time_string(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return null;

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    period: match[3],
  };
}