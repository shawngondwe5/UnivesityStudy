import React from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  History,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  BookOpen
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'courses', label: 'My Courses', icon: GraduationCap },
    { id: 'history', label: 'Reading History', icon: History },
    { id: 'reports', label: 'Weekly Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <aside
      className={`study-sidebar relative flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-200 ease-in-out z-20 shrink-0 ${
        isCollapsed ? 'w-16 sm:w-20' : 'w-16 sm:w-20 md:w-64'
      }`}
      aria-label="Main Navigation"
    >
      {/* App Branding */}
      <div className="sidebar-brand flex items-center gap-3 px-3 md:px-5 py-5 md:py-6 border-b border-slate-100 dark:border-slate-800 justify-center md:justify-start">
        <div className="sidebar-logo flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 text-white shrink-0 shadow-sm">
          <BookOpen className="w-5 h-5" />
        </div>
        {!isCollapsed && (
          <div className="hidden md:block overflow-hidden">
            <h1 className="sidebar-title text-sm font-bold tracking-tight text-slate-900 dark:text-white uppercase">
              Study Tracker
            </h1>
            <p className="sidebar-caption text-xs text-slate-500 dark:text-slate-400">Offline Academic Hub</p>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-2 sm:px-3 py-4 md:py-6 space-y-1.5 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              aria-label={item.label}
              title={item.label}
              aria-current={isActive ? "page" : undefined}
              className={`sidebar-nav-item flex items-center justify-center md:justify-start w-full gap-3.5 px-3 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span className="hidden md:inline truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse Toggle Footer (Desktop only) */}
      <div className="sidebar-footer p-3 border-t border-slate-100 dark:border-slate-800 hidden md:block">
        <button
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          className="sidebar-toggle flex items-center justify-center w-full p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </aside>
  );
};
