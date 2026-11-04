import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, BookOpen, Layers3, CalendarDays } from 'lucide-react';
import type { StudySession, Course, AppSettings } from '../types';
import { formatDuration, getDateKey } from '../utils/calculations';
import { ActivityHeatmap, AnimatedDonut, StudyBarChart } from '../components/charts/AnimatedCharts';

interface ReportsPageProps {
  sessions: StudySession[];
  courses: Course[];
  settings: AppSettings;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ sessions, courses }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const completedSessions = useMemo(() => sessions.filter(session => !session.isUnfinished), [sessions]);

  const weekDays = useMemo(() => {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return { date, key: getDateKey(date), label: date.toLocaleDateString('en-GB', { weekday: 'short' }) };
    });
  }, [weekOffset]);

  const weekKeys = new Set(weekDays.map(day => day.key));
  const weekSessions = completedSessions.filter(session => weekKeys.has(session.dateKey));
  const totalSeconds = weekSessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const firstTimeSeconds = weekSessions.filter(session => session.sessionType === 'first-time').reduce((sum, session) => sum + session.durationSeconds, 0);
  const revisionSeconds = weekSessions.filter(session => session.sessionType === 'revision').reduce((sum, session) => sum + session.durationSeconds, 0);
  const pagesStudied = new Set(
    weekSessions.flatMap(session => (session.confirmedPages ?? []).map(page => `${session.pdfId}:${page}`))
  ).size;
  const dailyData = weekDays.map(day => {
    const daySessions = weekSessions.filter(session => session.dateKey === day.key);
    return {
      label: day.label,
      firstTime: daySessions.filter(session => session.sessionType === 'first-time').reduce((sum, session) => sum + session.durationSeconds, 0) / 60,
      revision: daySessions.filter(session => session.sessionType === 'revision').reduce((sum, session) => sum + session.durationSeconds, 0) / 60
    };
  });
  const courseMap = new Map<string, number>();
  weekSessions.forEach(session => courseMap.set(session.courseName || 'Unassigned course', (courseMap.get(session.courseName || 'Unassigned course') ?? 0) + session.durationSeconds / 60));
  const courseData = Array.from(courseMap, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const activityMap = new Map<string, number>();
  completedSessions.forEach(session => activityMap.set(session.dateKey, (activityMap.get(session.dateKey) ?? 0) + session.durationSeconds / 60));
  const heatmapData = Array.from(activityMap, ([date, minutes]) => ({ date, minutes }));
  const startLabel = weekDays[0].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const endLabel = weekDays[6].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6 max-w-7xl mx-auto analytics-page">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 analytics-enter">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600 dark:text-blue-400 mb-2">Insights & performance</p><h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Study Reports</h1><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Understand your habits and see where your study time goes.</p></div>
        <div className="week-switcher flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-sm">
          <button type="button" onClick={() => setWeekOffset(offset => offset - 1)} aria-label="Previous week" className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-xs font-semibold px-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">{startLabel} – {endLabel}</span>
          <button type="button" onClick={() => setWeekOffset(offset => Math.min(0, offset + 1))} disabled={weekOffset >= 0} aria-label="Next week" className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </header>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 analytics-stagger">
        <div className="analytics-stat analytics-stat--blue"><div className="analytics-stat-top"><span className="analytics-stat-icon blue"><Clock3 /></span><span className="analytics-stat-index">01 / FOCUS</span></div><p>Study time</p><strong>{formatDuration(totalSeconds)}</strong><small>Selected week</small><span className="analytics-stat-accent" aria-hidden="true" /></div>
        <div className="analytics-stat analytics-stat--sky"><div className="analytics-stat-top"><span className="analytics-stat-icon violet"><BookOpen /></span><span className="analytics-stat-index">02 / READING</span></div><p>Confirmed pages</p><strong>{pagesStudied.toLocaleString()}</strong><small>First-time reading</small><span className="analytics-stat-accent" aria-hidden="true" /></div>
        <div className="analytics-stat analytics-stat--mint"><div className="analytics-stat-top"><span className="analytics-stat-icon teal"><Layers3 /></span><span className="analytics-stat-index">03 / ACTIVITY</span></div><p>Sessions</p><strong>{weekSessions.length}</strong><small>Completed sessions</small><span className="analytics-stat-accent" aria-hidden="true" /></div>
        <div className="analytics-stat analytics-stat--lime"><div className="analytics-stat-top"><span className="analytics-stat-icon amber"><CalendarDays /></span><span className="analytics-stat-index">04 / CONSISTENCY</span></div><p>Active days</p><strong>{new Set(weekSessions.map(session => session.dateKey)).size} <em>/ 7</em></strong><small>Days with study activity</small><span className="analytics-stat-accent" aria-hidden="true" /></div>
      </section>

      <section className="analytics-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5"><div><h2 className="analytics-heading">Daily study time</h2><p className="analytics-subheading">Compare first-time study and revision for each day</p></div><div className="flex items-center gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><i className="legend-dot bg-blue-600" /> First-time</span><span className="inline-flex items-center gap-1.5"><i className="legend-dot bg-violet-500" /> Revision</span></div></div>
        <StudyBarChart data={dailyData} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="analytics-card p-5 sm:p-6"><h2 className="analytics-heading">Time by study type</h2><p className="analytics-subheading mb-5">How you divided your study time this week</p><AnimatedDonut data={[{ label: 'First-time study', value: firstTimeSeconds / 60 }, { label: 'Revision', value: revisionSeconds / 60 }]} centerValue={formatDuration(totalSeconds)} /></div>
        <div className="analytics-card p-5 sm:p-6"><h2 className="analytics-heading">Study time by course</h2><p className="analytics-subheading mb-5">Which courses received the most attention</p>
          {courseData.length === 0 ? <div className="chart-empty-state"><Layers3 className="w-8 h-8" /><p>No completed study sessions for this week.</p><span>Once you study, your course breakdown will appear here.</span></div> : <div className="space-y-4">{courseData.map((item, index) => {
            const percentage = totalSeconds ? item.value / (totalSeconds / 60) * 100 : 0;
            return <div key={item.label} className="course-chart-row"><div className="flex items-center justify-between gap-3 text-xs mb-2"><span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{item.label}</span><strong className="text-slate-500 whitespace-nowrap">{formatDuration(item.value * 60)} · {Math.round(percentage)}%</strong></div><div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full course-chart-fill" style={{ width: `${percentage}%`, animationDelay: `${index * 90}ms` }} /></div></div>;
          })}</div>}
          <p className="text-[11px] text-slate-400 mt-5">{courses.filter(course => !course.isDeleted).length} active courses in your library</p>
        </div>
      </section>

      <section className="analytics-card p-5 sm:p-6"><div className="mb-5"><h2 className="analytics-heading">Study consistency</h2><p className="analytics-subheading">Your study activity across the last 12 weeks</p></div><ActivityHeatmap data={heatmapData} /></section>
      <p className="text-[11px] text-slate-400 text-center pb-2">Reports use completed sessions stored on this device. Unfinished sessions are excluded.</p>
    </div>
  );
};
