import React from 'react';
import {
  CheckCircle,
  GraduationCap,
  Plus,
  ArrowRight,
  TrendingUp,
  Flame
} from 'lucide-react';
import type { Course, Lecture, PDFDocument, StudySession, AppSettings } from '../types';
import {
  calculateOverallProgress,
  calculateCourseProgress,
  calculateStreaks,
  formatDuration
} from '../utils/calculations';

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

export const Dashboard: React.FC<DashboardProps> = ({
  courses,
  lectures,
  pdfs,
  sessions,
  settings,
  onOpenCourse,
  onCreateCourse,
  onNavigate
}) => {
  const activeCourses = courses.filter(c => !c.isDeleted);
  const activePdfs = pdfs.filter(p => !p.isDeleted);

  // Overall reading progress calculation
  const overall = calculateOverallProgress(activePdfs);

  // Streaks and today's goals
  const streakData = calculateStreaks(sessions, settings);

  // Overall study statistics
  const completedSessions = sessions.filter(s => !s.isUnfinished);
  const totalStudySeconds = completedSessions.reduce((acc, s) => acc + s.durationSeconds, 0);
  const totalFirstTimeSec = completedSessions
    .filter(s => s.sessionType === 'first-time')
    .reduce((acc, s) => acc + s.durationSeconds, 0);
  const totalRevisionSec = completedSessions
    .filter(s => s.sessionType === 'revision')
    .reduce((acc, s) => acc + s.durationSeconds, 0);

  const currentDateFormatted = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Academic Overview
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{currentDateFormatted}</p>
        </div>
        <button
          type="button"
          onClick={onCreateCourse}
          aria-label="Create a new course"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Course</span>
        </button>
      </div>

      {/* Overall Reading Progress Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Total Academic Progress
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Calculated strictly from unique first-time pages across active course materials.
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
              {overall.percentage}%
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-3">
          <div
            className="h-full bg-blue-600 transition-all duration-500 rounded-full"
            style={{ width: `${overall.percentage}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
          <span>{overall.studiedPages} pages studied</span>
          <span>{overall.totalPages} total pages in library</span>
        </div>
      </div>

      {/* Today's Goals & Study Streak Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Today's Goals */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <CheckCircle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Today's Goals</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Configure
            </button>
          </div>

          <div className="space-y-5">
            {/* Time Goal */}
            <div>
              <div className="flex justify-between text-xs mb-1.5 font-medium">
                <span className="text-slate-600 dark:text-slate-400">Active Study Time</span>
                <span className="text-slate-900 dark:text-white font-mono">
                  {streakData.todayMinutes}m / {settings.dailyTimeGoalMinutes}m
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      (streakData.todayMinutes / settings.dailyTimeGoalMinutes) * 100
                    )}%`
                  }}
                />
              </div>
            </div>

            {/* Page Goal */}
            <div>
              <div className="flex justify-between text-xs mb-1.5 font-medium">
                <span className="text-slate-600 dark:text-slate-400">First-Time Pages</span>
                <span className="text-slate-900 dark:text-white font-mono">
                  {streakData.todayPages} / {settings.dailyPageGoal} pages
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      (streakData.todayPages / settings.dailyPageGoal) * 100
                    )}%`
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Study Streak */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Consistency Streak</h3>
              <p className="text-xs text-slate-400">
                Rule: {settings.streakRule === 'both' ? 'Both goals required' : 'At least one goal required'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
                {streakData.currentStreak}
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-1">Current Days</div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
                {streakData.longestStreak}
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-1">Longest Streak</div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                {streakData.successfulDays}
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-1">Target Days</div>
            </div>
          </div>
        </div>
      </div>

      {/* Study Statistics Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Total Study Time</div>
          <div className="text-lg font-bold text-slate-900 dark:text-white mt-1 font-mono">
            {formatDuration(totalStudySeconds)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">First-Time Time</div>
          <div className="text-lg font-bold text-slate-900 dark:text-white mt-1 font-mono">
            {formatDuration(totalFirstTimeSec)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Revision Time</div>
          <div className="text-lg font-bold text-slate-900 dark:text-white mt-1 font-mono">
            {formatDuration(totalRevisionSec)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Completed Sessions</div>
          <div className="text-lg font-bold text-slate-900 dark:text-white mt-1 font-mono">
            {completedSessions.length}
          </div>
        </div>
      </div>

      {/* My Courses Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Active Courses</h2>
          </div>
          {activeCourses.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('courses')}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {activeCourses.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <GraduationCap className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Welcome to your study space
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
              Create your first course to organize lectures and upload PDF materials.
            </p>
            <button
              type="button"
              onClick={onCreateCourse}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold shadow-sm hover:bg-blue-700 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Course</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeCourses.map(course => {
              const coursePdfs = activePdfs.filter(p => p.courseId === course.id);
              const courseLectures = lectures.filter(l => l.courseId === course.id && !l.isDeleted);
              const progress = calculateCourseProgress(coursePdfs);

              return (
                <div
                  key={course.id}
                  onClick={() => onOpenCourse(course.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') onOpenCourse(course.id);
                  }}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition flex flex-col justify-between group"
                >
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition truncate">
                      {course.name}
                    </h3>
                    {course.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                        {course.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-500">
                        {courseLectures.length} lectures &bull; {coursePdfs.length} PDFs
                      </span>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                        {progress}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
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
