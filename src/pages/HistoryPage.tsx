import React, { useState } from 'react';
import { History } from 'lucide-react';
import type { StudySession, Course } from '../types';
import { formatDuration } from '../utils/calculations';

interface HistoryPageProps {
  sessions: StudySession[];
  courses: Course[];
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ sessions, courses }) => {
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  const filteredSessions = sessions
    .filter(s => {
      if (selectedCourse !== 'all' && s.courseId !== selectedCourse) return false;
      if (selectedType !== 'all' && s.sessionType !== selectedType) return false;
      return true;
    })
    .sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Reading History
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Audit trail of reading and revision sessions. Historical records persist even if materials are deleted.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <label htmlFor="filter-course-select" className="sr-only">Filter by Course</label>
          <select
            id="filter-course-select"
            value={selectedCourse}
            onChange={e => setSelectedCourse(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
          >
            <option value="all">All Courses</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <label htmlFor="filter-type-select" className="sr-only">Filter by Type</label>
          <select
            id="filter-type-select"
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="first-time">First-time Reading</option>
            <option value="revision">Revision</option>
          </select>
        </div>
      </div>

      {filteredSessions.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <History className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            No study sessions recorded yet
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Open a PDF document and start the timer to log your active study time.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-[11px] font-bold text-slate-500 uppercase">
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4">Document &amp; Lecture</th>
                <th className="py-3 px-4">Course</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Pages Confirmed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredSessions.map(session => {
                const dateStr = new Date(session.startedAt).toLocaleDateString();
                const timeStr = new Date(session.startedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <tr key={session.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{dateStr}</div>
                      <div className="text-[11px] text-slate-400">{timeStr}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white truncate max-w-xs">
                        {session.pdfName}
                      </div>
                      <div className="text-[11px] text-slate-400">{session.lectureName}</div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                      {session.courseName}
                    </td>
                    <td className="py-3.5 px-4">
                      {session.sessionType === 'first-time' ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                          First-Time
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          Revision
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                      {formatDuration(session.durationSeconds)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 font-mono">
                      {session.sessionType === 'first-time'
                        ? `${session.confirmedPages?.length || 0} pages`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
