import type { PDFDocument, StudySession, AppSettings } from '../types';

/**
 * PDF Progress: Unique Confirmed Pages Studied / Total Pages * 100
 */
export function calculatePdfProgress(pdf: PDFDocument): number {
  if (!pdf.totalPages || pdf.totalPages === 0) return 0;
  const uniqueCount = new Set(pdf.studiedPages || []).size;
  return Math.min(100, Math.round((uniqueCount / pdf.totalPages) * 1000) / 10);
}

/**
 * Lecture Progress: Average percentage of all active PDFs (equal weight per PDF)
 */
export function calculateLectureProgress(pdfs: PDFDocument[]): number {
  const activePdfs = pdfs.filter(p => !p.isDeleted);
  if (activePdfs.length === 0) return 0;
  const totalPercentage = activePdfs.reduce((sum, p) => sum + calculatePdfProgress(p), 0);
  return Math.round((totalPercentage / activePdfs.length) * 10) / 10;
}

/**
 * Course Progress: Total unique pages studied / Total pages across all active PDFs * 100
 */
export function calculateCourseProgress(pdfs: PDFDocument[]): number {
  const activePdfs = pdfs.filter(p => !p.isDeleted);
  const totalPages = activePdfs.reduce((sum, p) => sum + (p.totalPages || 0), 0);
  if (totalPages === 0) return 0;
  const totalStudied = activePdfs.reduce((sum, p) => sum + new Set(p.studiedPages || []).size, 0);
  return Math.min(100, Math.round((totalStudied / totalPages) * 1000) / 10);
}

/**
 * Overall Progress across all active courses
 */
export function calculateOverallProgress(allActivePdfs: PDFDocument[]): {
  percentage: number;
  studiedPages: number;
  totalPages: number;
} {
  const totalPages = allActivePdfs.reduce((sum, p) => sum + (p.totalPages || 0), 0);
  const studiedPages = allActivePdfs.reduce((sum, p) => sum + new Set(p.studiedPages || []).size, 0);
  const percentage = totalPages === 0 ? 0 : Math.min(100, Math.round((studiedPages / totalPages) * 1000) / 10);
  return { percentage, studiedPages, totalPages };
}

/**
 * Formats seconds into clean readable string (e.g. "1h 45m" or "32m")
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  const remainingM = m % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${remainingM}m`;
}

/**
 * Formats seconds into HH:MM:SS for active timer
 */
export function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}

/**
 * Date formatting utilities (Local YYYY-MM-DD)
 */
export function getDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculates current streak and longest streak based on local calendar dates and user rules
 */
export function calculateStreaks(
  sessions: StudySession[],
  settings: AppSettings
): {
  currentStreak: number;
  longestStreak: number;
  successfulDays: number;
  todayMetTime: boolean;
  todayMetPages: boolean;
  todayMinutes: number;
  todayPages: number;
} {
  // Aggregate daily records (completed sessions only)
  const validSessions = sessions.filter(s => !s.isUnfinished);
  const dailyData: Record<string, { durationSec: number; pagesCount: number }> = {};

  for (const s of validSessions) {
    if (!dailyData[s.dateKey]) {
      dailyData[s.dateKey] = { durationSec: 0, pagesCount: 0 };
    }
    dailyData[s.dateKey].durationSec += s.durationSeconds;
    if (s.sessionType === 'first-time') {
      dailyData[s.dateKey].pagesCount += (s.confirmedPages || []).length;
    }
  }

  const todayKey = getDateKey();
  const todayRecord = dailyData[todayKey] || { durationSec: 0, pagesCount: 0 };
  const todayMinutes = Math.floor(todayRecord.durationSec / 60);
  const todayPages = todayRecord.pagesCount;

  const todayMetTime = todayMinutes >= settings.dailyTimeGoalMinutes;
  const todayMetPages = todayPages >= settings.dailyPageGoal;

  const isDaySuccessful = (record: { durationSec: number; pagesCount: number }) => {
    const min = Math.floor(record.durationSec / 60);
    const metT = min >= settings.dailyTimeGoalMinutes;
    const metP = record.pagesCount >= settings.dailyPageGoal;
    return settings.streakRule === 'both' ? metT && metP : metT || metP;
  };

  const successfulDateKeys = new Set(
    Object.keys(dailyData).filter(key => isDaySuccessful(dailyData[key]))
  );

  const successfulDays = successfulDateKeys.size;

  // Streak calculations walking backwards day by day
  let currentStreak = 0;
  let checkDate = new Date();
  const todaySuccessful = successfulDateKeys.has(todayKey);

  if (todaySuccessful) {
    currentStreak = 1;
    checkDate.setDate(checkDate.getDate() - 1);
    while (successfulDateKeys.has(getDateKey(checkDate))) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  } else {
    // Check if yesterday was successful
    checkDate.setDate(checkDate.getDate() - 1);
    while (successfulDateKeys.has(getDateKey(checkDate))) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  }

  // Calculate longest streak
  const sortedDates = Array.from(successfulDateKeys).sort();
  let longestStreak = 0;
  let tempStreak = 0;
  let prevTime = 0;

  for (const dStr of sortedDates) {
    const curTime = new Date(dStr + 'T00:00:00').getTime();
    if (prevTime === 0) {
      tempStreak = 1;
    } else {
      const diffDays = Math.round((curTime - prevTime) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    if (tempStreak > longestStreak) longestStreak = tempStreak;
    prevTime = curTime;
  }

  return {
    currentStreak,
    longestStreak,
    successfulDays,
    todayMetTime,
    todayMetPages,
    todayMinutes,
    todayPages
  };
}
