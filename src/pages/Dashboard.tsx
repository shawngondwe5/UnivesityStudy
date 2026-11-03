import React from 'react';
import { CheckCircle, GraduationCap, Plus, ArrowRight, TrendingUp, Flame, Clock3, BookOpen, Target } from 'lucide-react';
import type { Course, Lecture, PDFDocument, StudySession, AppSettings } from '../types';
import { calculateOverallProgress, calculateCourseProgress, calculateStreaks, formatDuration, getDateKey } from '../utils/calculations';
import { ActivityHeatmap, AnimatedDonut, ProgressRing, StudyBarChart } from '../components/charts/AnimatedCharts';

interface DashboardProps {
  courses: Course[];
  lectures: Lecture[];
  pdfs: PDFDocument[];
  sessions: StudySession[];
  settings: AppSettings;
  onOpenCourse: (courseId: string) => void;
  onCreateCourse: () => void;
  onNavigate: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ courses, lectures, pdfs, sessions, settings, onOpenCourse, onCreateCourse, onNavigate }) => {
  const activeCourses = courses.filter(course => !course.isDeleted);
  const activePdfs = pdfs.filter(pdf => !pdf.isDeleted);
  const completedSessions = sessions.filter(session => !session.isUnfinished);
  const overall = calculateOverallProgress(activePdfs);
  const streak = calculateStreaks(sessions, settings);
  const totalSeconds = completedSessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const firstTimeSeconds = completedSessions.filter(session => session.sessionType === 'first-time').reduce((sum, session) => sum + session.durationSeconds, 0);
  const revisionSeconds = completedSessions.filter(session => session.sessionType === 'revision').reduce((sum, session) => sum + session.durationSeconds, 0);
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7) - 6);
  const weekData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const key = getDateKey(date);
    const daySessions = completedSessions.filter(session => session.dateKey === key);
    return {
      label: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      firstTime: daySessions.filter(session => session.sessionType === 'first-time').reduce((sum, session) => sum + session.durationSeconds, 0) / 60,
      revision: daySessions.filter(session => session.sessionType === 'revision').reduce((sum, session) => sum + session.durationSeconds, 0) / 60
    };
  });
  const dailyActivity = new Map<string, number>();
  completedSessions.forEach(session => dailyActivity.set(session.dateKey, (dailyActivity.get(session.dateKey) ?? 0) + session.durationSeconds / 60));
  const heatmapData = Array.from(dailyActivity, ([date, minutes]) => ({ date, minutes }));
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeGoal = Math.max(1, settings.dailyTimeGoalMinutes);
  const pageGoal = Math.max(1, settings.dailyPageGoal);

  return (
    <div className="space-y-7 max-w-7xl mx-auto analytics-page">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 analytics-enter">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600 dark:text-blue-400 mb-2">Your learning space</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Academic Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{today}</p>
        </div>
        <button type="button" onClick={onCreateCourse} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5">
          <Plus className="w-4 h-4" /> New Course
        </button>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 analytics-stagger">
        <div className="analytics-stat"><span className="analytics-stat-icon blue"><Clock3 /></span><p>Total study time</p><strong>{formatDuration(totalSeconds)}</strong><small>Across completed sessions</small></div>
        <div className="analytics-stat"><span className="analytics-stat-icon violet"><BookOpen /></span><p>Pages confirmed</p><strong>{overall.studiedPages.toLocaleString()}</strong><small>Unique first-time pages</small></div>
        <div className="analytics-stat"><span className="analytics-stat-icon amber"><Flame /></span><p>Current streak</p><strong>{streak.currentStreak} <em>days</em></strong><small>Longest: {streak.longestStreak} days</small></div>
        <div className="analytics-stat"><span className="analytics-stat-icon teal"><Target /></span><p>Completed sessions</p><strong>{completedSessions.length}</strong><small>{activeCourses.length} active courses</small></div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.65fr_1fr] gap-5">
        <div className="analytics-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div><h2 className="analytics-heading">Study activity</h2><p className="analytics-subheading">Your daily focus over the last seven days</p></div>
            <button type="button" onClick={() => onNavigate('reports')} className="analytics-link">Full report <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex items-center gap-4 mb-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><i className="legend-dot bg-blue-600" /> First-time</span><span className="inline-flex items-center gap-1.5"><i className="legend-dot bg-violet-500" /> Revision</span></div>
          <StudyBarChart data={weekData} />
        </div>
        <div className="analytics-card p-5 sm:p-6">
          <h2 className="analytics-heading">Study mix</h2><p className="analytics-subheading mb-4">How your completed study time is divided</p>
          <AnimatedDonut data={[{ label: 'First-time study', value: firstTimeSeconds / 60 }, { label: 'Revision', value: revisionSeconds / 60 }]} centerValue={formatDuration(totalSeconds)} />
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.65fr_1fr] gap-5">
        <div className="analytics-card p-5 sm:p-6">
          <div className="mb-5"><h2 className="analytics-heading">Study consistency</h2><p className="analytics-subheading">A snapshot of your activity over the last 12 weeks</p></div>
          <ActivityHeatmap data={heatmapData} />
        </div>
        <div className="analytics-card p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-5"><span className="analytics-stat-icon blue"><TrendingUp /></span><div><h2 className="analytics-heading">Library progress</h2><p className="analytics-subheading">Confirmed pages across your PDFs</p></div></div>
          <div className="flex items-center gap-5">
            <ProgressRing value={overall.percentage} size={94} />
            <div><strong className="text-2xl font-bold text-slate-900 dark:text-white">{overall.percentage}%</strong><p className="text-xs text-slate-500 mt-1">{overall.studiedPages} of {overall.totalPages} pages</p></div>
          </div>
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3">
            <div><p className="text-xs text-slate-500">First-time</p><strong className="text-sm text-slate-900 dark:text-white">{formatDuration(firstTimeSeconds)}</strong></div>
            <div><p className="text-xs text-slate-500">Revision</p><strong className="text-sm text-slate-900 dark:text-white">{formatDuration(revisionSeconds)}</strong></div>
          </div>
        </div>
      </section>

      <section className="analytics-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-5"><div className="flex items-center gap-2"><GraduationCap className="w-5 h-5 text-blue-600 dark:text-blue-400" /><div><h2 className="analytics-heading">Your courses</h2><p className="analytics-subheading">Progress based on confirmed pages in each course</p></div></div>{activeCourses.length > 0 && <button type="button" onClick={() => onNavigate('courses')} className="analytics-link">View all <ArrowRight className="w-3.5 h-3.5" /></button>}</div>
        {activeCourses.length === 0 ? <div className="py-10 text-center"><GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-3" /><h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Your study space is ready</h3><p className="text-xs text-slate-500 mt-1 mb-4">Create a course to start organizing your lectures and PDF materials.</p><button type="button" onClick={onCreateCourse} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"><Plus className="w-4 h-4" /> Create course</button></div> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{activeCourses.map(course => {
          const coursePdfs = activePdfs.filter(pdf => pdf.courseId === course.id);
          const courseLectures = lectures.filter(lecture => lecture.courseId === course.id && !lecture.isDeleted);
          const progress = calculateCourseProgress(coursePdfs);
          return <button key={course.id} type="button" onClick={() => onOpenCourse(course.id)} className="course-progress-item text-left">
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{course.name}</span><span className="text-xs font-bold text-blue-600 dark:text-blue-400">{progress}%</span></div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-3"><div className="h-full rounded-full bg-blue-600 progress-fill" style={{ width: `${progress}%` }} /></div>
            <p className="text-[11px] text-slate-500 mt-2">{courseLectures.length} lectures · {coursePdfs.length} PDFs</p>
          </button>;
        })}</div>}
      </section>

      <section className="analytics-card p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-5"><span className="analytics-stat-icon teal"><CheckCircle /></span><div><h2 className="analytics-heading">Today's goals</h2><p className="analytics-subheading">Keep your daily learning targets in sight</p></div><button type="button" onClick={() => onNavigate('settings')} className="analytics-link ml-auto">Configure</button></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div><div className="flex justify-between text-xs mb-2"><span className="text-slate-600 dark:text-slate-300">Study time</span><strong className="text-slate-900 dark:text-white">{streak.todayMinutes} / {settings.dailyTimeGoalMinutes} min</strong></div><div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-blue-600 progress-fill" style={{ width: `${Math.min(100, streak.todayMinutes / timeGoal * 100)}%` }} /></div></div>
          <div><div className="flex justify-between text-xs mb-2"><span className="text-slate-600 dark:text-slate-300">First-time pages</span><strong className="text-slate-900 dark:text-white">{streak.todayPages} / {settings.dailyPageGoal}</strong></div><div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-emerald-500 progress-fill" style={{ width: `${Math.min(100, streak.todayPages / pageGoal * 100)}%` }} /></div></div>
        </div>
      </section>
    </div>
  );
};
