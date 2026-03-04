import { X } from 'lucide-react';
import React, { useState } from "react";

export default function UserDetailsModal({ isOpen, onClose, user, allUsers }) {
  if (!isOpen) return null;

  const [viewMode, setViewMode] = useState("schedule");

  const showTime = get_current_time();
  const showSchedule = user?.role === "Student" || user?.role === "Faculty";

  const activeClass = user?.schedule?.find(item =>
    is_today_in_schedule(item.day) &&
    compare_time(item.start_time, item.end_time)
  );

  const classSession = activeClass
    ? `Class in session: ${activeClass.location} - ${activeClass.subject_code}`
    : "No class in session";

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
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h2 className="text-xl font-bold text-slate-800">User Profile</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {user && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold">
                {user.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm text-slate-500">{showTime}</p>
                <p className="text-xs text-slate-400">{classSession}</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{user.name}</h3>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-full uppercase tracking-wider">
                  {user.role}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Email Address" value={user.email} />
              <DetailItem label="Status" value={user.status} color={user.status === 'Active' ? 'text-emerald-600' : 'text-slate-400'} />
              <DetailItem label="Joined On" value={user.joinDate} />
            </div>

            {showSchedule && (
              <div className="mt-6 pt-6 border-t border-gray-100">

                {/* Toggle Header */}
                <div className="flex items-center gap-2 mb-4">

                  <button
                    onClick={() => setViewMode("schedule")}
                    className={`text-sm font-bold uppercase tracking-tight px-3 py-1 rounded-full transition
                      ${viewMode === "schedule"
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-slate-600"}`}
                  >
                    Schedule
                  </button>

                  {user.role === "Faculty" && activeClass && (
                    <button
                      onClick={() => setViewMode("students")}
                      className={`text-sm font-bold uppercase tracking-tight px-3 py-1 rounded-full transition
                        ${viewMode === "students"
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 text-slate-600"}`}
                    >
                      Students in {activeClass.subject_code}  
                    </button>
                  )}

                </div>

                    {viewMode === "schedule" && (
                      <>
                        {user.schedule && user.schedule.length > 0 ? (
                          <div className="space-y-3">
                            {user.schedule.map((item, idx) => (
                              <div
                                key={idx}
                                className={`p-3 rounded-xl border
                                  ${activeClass?.subject_code === item.subject_code
                                    ? "bg-indigo-50 border-indigo-200"
                                    : "bg-gray-50 border-gray-100"}`}
                              >
                                <div className="flex justify-between items-start mb-1">
                                  <p className="font-bold text-indigo-700 text-sm">
                                    {item.subject_code}
                                  </p>
                                  <p className="text-[10px] font-bold text-gray-400 bg-white px-2 py-0.5 rounded-md border border-gray-100">
                                    {item.location}
                                  </p>
                                </div>
                                <p className="text-xs text-slate-500">
                                  {item.start_time} — {item.end_time}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic bg-gray-50 p-4 rounded-xl text-center">
                            No schedule available.
                          </p>
                        )}
                      </>
                    )}

                    {viewMode === "students" && user.role === "Faculty" && activeClass && (
                      <div className="space-y-3">
                        {studentsInCurrentClass.length > 0 ? (
                          studentsInCurrentClass.map(student => (
                            <div
                              key={student.id}
                              className="p-3 bg-gray-50 rounded-xl border border-gray-100"
                            >
                              <p className="font-medium text-sm text-slate-700">
                                {student.name}
                              </p>
                              <p className="text-xs text-slate-400">
                                {student.email}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-400 italic text-center">
                            No students currently in this class.
                          </p>
                        )}
                      </div>
                    )}

                  </div>
                )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailItem({ label, value, color = "text-slate-600" }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-sm font-medium break-all ${color}`}>{value}</p>
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