import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from './db';
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
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);

  // Active PDF reader state
  const [activePdfState, setActivePdfState] = useState<{
    pdf: PDFDocument;
    courseName: string;
    lectureName: string;
  } | null>(null);

  // Settings state
  const liveSettings = useLiveQuery(() => db.settings.get('user-settings'));
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

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
  const courses = useLiveQuery(() => db.courses.toArray(), []) || [];
  const lectures = useLiveQuery(() => db.lectures.toArray(), []) || [];
  const pdfs = useLiveQuery(() => db.pdfs.toArray(), []) || [];
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) || [];

  if (!settings) return null;

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
