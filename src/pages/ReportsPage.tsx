import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { StudySession, Course, AppSettings } from '../types';
import { formatDuration, getDateKey } from '../utils/calculations';

interface ReportsPageProps {
  sessions: StudySession[];
  courses: Course[];
  settings: AppSettings;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ sessions }) => {
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Calculate current week range (Monday to Sunday)
  const getWeekRange = (offset: number) => {
    const now = new Date();
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0 = Mon, 6 = Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + offset * 7);
    monday.setHours(0, 0, 0, 0);

    const days: { date: Date; key: string; label: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push({
        date: d,
        key: getDateKey(d),
        label: d.toLocaleDateString('en-GB', { weekday: 'short' })
      });
    }
    return days;
  };

  const weekDays = getWeekRange(weekOffset);
  const weekStartStr = weekDays[0].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const weekEndStr = weekDays[6].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const weekKeys = new Set(weekDays.map(d => d.key));
  const weekSessions = sessions.filter(s => weekKeys.has(s.dateKey) && !s.isUnfinished);

  // Totals for this week
  const totalSeconds = weekSessions.reduce((acc, s) => acc + s.durationSeconds, 0);
  const firstTimeSeconds = weekSessions
    .filter(s => s.sessionType === 'first-time')
    .reduce((acc, s) => acc + s.durationSeconds, 0);
  const revisionSeconds = weekSessions
    .filter(s => s.sessionType === 'revision')
    .reduce((acc, s) => acc + s.durationSeconds, 0);
  const totalPagesStudied = weekSessions.reduce(
    (acc, s) => acc + (s.confirmedPages?.length || 0),
    0
  );

  // Daily time breakdown
  const dailyBreakdown = weekDays.map(day => {
    const daySessions = weekSessions.filter(s => s.dateKey === day.key);
    const sec = daySessions.reduce((acc, s) => acc + s.durationSeconds, 0);
    const pages = daySessions.reduce((acc, s) => acc + (s.confirmedPages?.length || 0), 0);
    return { ...day, seconds: sec, minutes: Math.floor(sec / 60), pages };
  });

  const maxDailyMinutes = Math.max(...dailyBreakdown.map(d => d.minutes), 60);

  // Course distribution
  const courseTimeMap: Record<string, number> = {};
  weekSessions.forEach(s => {
    courseTimeMap[s.courseName] = (courseTimeMap[s.courseName] || 0) + s.durationSeconds;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header and Week Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Weekly Study Reports
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Aggregated academic analytics generated entirely from local device data.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setWeekOffset(o => o - 1)}
            aria-label="Previous week"
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold px-2 text-slate-700 dark:text-slate-200">
            {weekStartStr} – {weekEndStr}
          </span>
          <button
            type="button"
            onClick={() => setWeekOffset(o => o + 1)}
            disabled={weekOffset >= 0}
            aria-label="Next week"
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Aggregate Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Total Study Time</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
            {formatDuration(totalSeconds)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">First-Time Time</div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1 font-mono">
            {formatDuration(firstTimeSeconds)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Revision Time</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
            {formatDuration(revisionSeconds)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Confirmed Pages</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
            {totalPagesStudied}
          </div>
        </div>
      </div>

      {/* Daily Study Time Chart (Solid Bar Chart) */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-6">
          Daily Study Minutes
        </h3>

        <div className="h-48 flex items-end gap-4 pt-4 border-b border-slate-200 dark:border-slate-800">
          {dailyBreakdown.map(day => {
            const barHeight = Math.max(8, (day.minutes / maxDailyMinutes) * 100);
            return (
              <div key={day.key} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <span className="text-[11px] font-mono text-slate-500">{day.minutes}m</span>
                <div
                  className="w-full max-w-[40px] rounded-t-lg bg-blue-600 transition-all duration-300"
                  style={{ height: `${barHeight}%` }}
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
                  {day.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Course Breakdown */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
          Study Time by Course
        </h3>

        {Object.keys(courseTimeMap).length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">
            No study sessions logged during this week.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(courseTimeMap).map(([courseName, seconds]) => {
              const pct = Math.round((seconds / totalSeconds) * 100) || 0;
              return (
                <div key={courseName}>
                  <div className="flex justify-between text-xs mb-1 font-semibold">
                    <span className="text-slate-800 dark:text-slate-200">{courseName}</span>
                    <span className="text-slate-500 font-mono">
                      {formatDuration(seconds)} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
