import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initializeDatabase } from './db';
import type { PDFDocument, AppSettings } from './types';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { CoursesPage } from './pages/CoursesPage';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { HistoryPage } from './pages/HistoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PdfReader } from './components/pdf/PdfReader';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem('university-study-navigation');
      const parsed = saved ? JSON.parse(saved) as { currentTab?: string } : null;
      return parsed?.currentTab || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(() => {
    try {
      const saved = sessionStorage.getItem('university-study-navigation');
      const parsed = saved ? JSON.parse(saved) as { activeCourseId?: string | null } : null;
      return parsed?.activeCourseId || null;
    } catch {
      return null;
    }
  });

  // Keep the current section/course when the page is refreshed in this tab.
  useEffect(() => {
    sessionStorage.setItem(
      'university-study-navigation',
      JSON.stringify({ currentTab, activeCourseId })
    );
  }, [currentTab, activeCourseId]);

  // Active PDF reader state
  const [activePdfState, setActivePdfState] = useState<{
    pdf: PDFDocument;
    courseName: string;
    lectureName: string;
  } | null>(null);

  // Initialize IndexedDB once, outside the reactive queries. Each live query
  // then tracks only the table it reads, so writes immediately refresh the UI.
  const [databaseReady, setDatabaseReady] = useState(false);
  useEffect(() => {
    let active = true;
    initializeDatabase()
      .then(() => { if (active) setDatabaseReady(true); })
      .catch(error => console.error('Database initialization failed:', error));
    return () => { active = false; };
  }, []);

  // Settings state
  const liveSettings = useLiveQuery(async () => {
    if (!databaseReady) return undefined;
    return await db.settings.get('user-settings');
  }, [databaseReady]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (liveSettings) {
      setSettings(liveSettings);
    }
  }, [liveSettings]);

  // Sync theme with DOM
  useEffect(() => {
    if (!settings) return;
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings?.theme]);

  // Reactive IndexedDB queries via Dexie hooks
  const liveCourses = useLiveQuery(async () => {
    if (!databaseReady) return undefined;
    return await db.courses.toArray();
  }, [databaseReady]);
  const liveLectures = useLiveQuery(async () => {
    if (!databaseReady) return undefined;
    return await db.lectures.toArray();
  }, [databaseReady]);
  const livePdfs = useLiveQuery(async () => {
    if (!databaseReady) return undefined;
    return await db.pdfs.toArray();
  }, [databaseReady]);
  const liveSessions = useLiveQuery(async () => {
    if (!databaseReady) return undefined;
    return await db.sessions.toArray();
  }, [databaseReady]);
  const courses = liveCourses ?? [];
  const lectures = liveLectures ?? [];
  const pdfs = livePdfs ?? [];
  const sessions = liveSessions ?? [];

  // A deleted or missing saved course must never leave a blank detail screen.
  useEffect(() => {
    if (!databaseReady || currentTab !== 'course-detail' || liveCourses === undefined) return;
    const exists = activeCourseId && liveCourses.some(course => course.id === activeCourseId && !course.isDeleted);
    if (!exists) {
      setActiveCourseId(null);
      setCurrentTab('courses');
    }
  }, [databaseReady, currentTab, activeCourseId, liveCourses]);

  if (!settings || !databaseReady) return null;

  const handleOpenCourse = (courseId: string) => {
    setActiveCourseId(courseId);
    setCurrentTab('course-detail');
  };

  const handleOpenPdf = (pdf: PDFDocument, courseName: string, lectureName: string) => {
    setActivePdfState({ pdf, courseName, lectureName });
  };

  const selectedCourse = courses.find(c => c.id === activeCourseId);

  return (
    <div className="study-app-shell flex h-screen w-screen overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* Vertical Left Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={tab => {
          setActiveCourseId(null);
          setCurrentTab(tab);
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(v => !v)}
      />

      {/* Main Content Area: Large rounded white application container */}
      <main className="study-main flex-1 flex flex-col min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-7xl mx-auto flex-1">
          {currentTab === 'dashboard' && (
            <Dashboard
              courses={courses}
              lectures={lectures}
              pdfs={pdfs}
              sessions={sessions}
              settings={settings}
              onOpenCourse={handleOpenCourse}
              onCreateCourse={() => setCurrentTab('courses')}
              onNavigate={setCurrentTab}
            />
          )}

          {currentTab === 'courses' && (
            <CoursesPage
              courses={courses}
              lectures={lectures}
              pdfs={pdfs}
              onOpenCourse={handleOpenCourse}
            />
          )}

          {currentTab === 'course-detail' && selectedCourse && (
            <CourseDetailPage
              course={selectedCourse}
              lectures={lectures}
              pdfs={pdfs}
              onBack={() => setCurrentTab('courses')}
              onOpenPdf={handleOpenPdf}
            />
          )}

          {currentTab === 'history' && (
            <HistoryPage sessions={sessions} courses={courses} />
          )}

          {currentTab === 'reports' && (
            <ReportsPage sessions={sessions} courses={courses} settings={settings} />
          )}

          {currentTab === 'settings' && (
            <SettingsPage settings={settings} onUpdateSettings={setSettings} />
          )}
        </div>
      </main>

      {/* Fullscreen PDF Reader Modal */}
      {activePdfState && (
        <PdfReader
          pdfDoc={activePdfState.pdf}
          courseName={activePdfState.courseName}
          lectureName={activePdfState.lectureName}
          settings={settings}
          onClose={() => setActivePdfState(null)}
          onPageChange={newPage => {
            setActivePdfState(prev => {
              if (!prev || prev.pdf.lastPositionPage === newPage) return prev;
              return {
                ...prev,
                pdf: { ...prev.pdf, lastPositionPage: newPage }
              };
            });
          }}
        />
      )}
    </div>
  );
};

export default App;
