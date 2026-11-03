import React, { useState, useEffect } from 'react';
import { Moon, Sun, ShieldCheck, Check } from 'lucide-react';
import type { AppSettings } from '../types';
import { db } from '../db';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onUpdateSettings }) => {
  const [theme, setTheme] = useState(settings.theme);
  const [dailyTime, setDailyTime] = useState(settings.dailyTimeGoalMinutes);
  const [dailyPages, setDailyPages] = useState(settings.dailyPageGoal);
  const [inactivity, setInactivity] = useState(settings.inactivityThresholdMinutes);
  const [streakRule, setStreakRule] = useState(settings.streakRule);
  const [defaultMode, setDefaultMode] = useState(settings.defaultReadingMode);
  const [isSaved, setIsSaved] = useState(false);

  // Keep local state in sync if settings update externally
  useEffect(() => {
    setTheme(settings.theme);
    setDailyTime(settings.dailyTimeGoalMinutes);
    setDailyPages(settings.dailyPageGoal);
    setInactivity(settings.inactivityThresholdMinutes);
    setStreakRule(settings.streakRule);
    setDefaultMode(settings.defaultReadingMode);
  }, [settings]);

  const persistSettings = async (partial: Partial<AppSettings>) => {
    const updated: AppSettings = {
      ...settings,
      theme,
      dailyTimeGoalMinutes: Number(dailyTime),
      dailyPageGoal: Number(dailyPages),
      inactivityThresholdMinutes: Number(inactivity),
      streakRule,
      defaultReadingMode: defaultMode,
      ...partial
    };
    await db.settings.put(updated);
    onUpdateSettings(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleThemeChange = async (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    await persistSettings({ theme: newTheme });
  };

  const handleDefaultModeChange = async (newMode: 'single' | 'continuous') => {
    setDefaultMode(newMode);
    await persistSettings({ defaultReadingMode: newMode });
  };

  const handleStreakRuleChange = async (newRule: 'both' | 'at-least-one') => {
    setStreakRule(newRule);
    await persistSettings({ streakRule: newRule });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistSettings({
      theme,
      dailyTimeGoalMinutes: Number(dailyTime),
      dailyPageGoal: Number(dailyPages),
      inactivityThresholdMinutes: Number(inactivity),
      streakRule,
      defaultReadingMode: defaultMode
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Application Settings
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Customise goals, reader preferences, streak rules, and interface appearance.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Appearance Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Appearance</h2>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => handleThemeChange('light')}
              aria-label="Set Light Mode"
              className={`flex-1 flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                theme === 'light'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Sun className="w-4 h-4" />
              <span>Light Mode</span>
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange('dark')}
              aria-label="Set Dark Mode"
              className={`flex-1 flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                theme === 'dark'
                  ? 'border-blue-500 bg-slate-800 text-white'
                  : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Moon className="w-4 h-4" />
              <span>Dark Mode</span>
            </button>
          </div>
        </div>

        {/* Study Goals & Streaks */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Daily Study Goals &amp; Streaks
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="daily-time-goal-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Daily Study Time Goal (Minutes)
              </label>
              <input
                id="daily-time-goal-input"
                type="number"
                min={5}
                max={600}
                value={dailyTime}
                onChange={e => setDailyTime(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label htmlFor="daily-page-goal-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Daily Page Goal (First-Time Pages)
              </label>
              <input
                id="daily-page-goal-input"
                type="number"
                min={1}
                max={500}
                value={dailyPages}
                onChange={e => setDailyPages(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="streak-rule-select" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Streak Success Qualification Rule
            </label>
            <select
              id="streak-rule-select"
              value={streakRule}
              onChange={e => handleStreakRuleChange(e.target.value as any)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 cursor-pointer"
            >
              <option value="at-least-one">At least one daily goal achieved</option>
              <option value="both">Both daily goals required</option>
            </select>
          </div>
        </div>

        {/* Reader & Inactivity Preferences */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            PDF Reader Preferences
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="inactivity-threshold-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Inactivity Detection Threshold (Minutes)
              </label>
              <input
                id="inactivity-threshold-input"
                type="number"
                min={1}
                max={30}
                value={inactivity}
                onChange={e => setInactivity(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label htmlFor="reading-layout-select" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Default PDF Reading Layout
              </label>
              <select
                id="reading-layout-select"
                value={defaultMode}
                onChange={e => handleDefaultModeChange(e.target.value as any)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 cursor-pointer"
              >
                <option value="single">Single-Page Mode</option>
                <option value="continuous">Continuous Scrolling</option>
              </select>
            </div>
          </div>
        </div>

        {/* Local Storage Privacy Advisory */}
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <strong>100% Offline &amp; Private:</strong> All files, study durations, and notes are saved directly inside this browser via IndexedDB. No analytical telemetry or document data is ever sent across the network.
          </div>
        </div>

        <div className="flex justify-end items-center gap-3">
          {isSaved && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <Check className="w-4 h-4" />
              Settings Saved
            </span>
          )}
          <button
            type="submit"
            aria-label="Save application settings"
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition cursor-pointer"
          >
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
};
