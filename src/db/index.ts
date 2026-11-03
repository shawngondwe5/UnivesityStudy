import Dexie, { type Table } from 'dexie';
import type { Course, Lecture, PDFDocument, StudySession, AppSettings } from '../types';

export class StudyTrackerDB extends Dexie {
  courses!: Table<Course, string>;
  lectures!: Table<Lecture, string>;
  pdfs!: Table<PDFDocument, string>;
  sessions!: Table<StudySession, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('UniversityStudyTrackerDB');
    this.version(1).stores({
      courses: 'id, name, createdAt, isDeleted',
      lectures: 'id, courseId, order, isDeleted',
      pdfs: 'id, lectureId, courseId, order, isDeleted, lastReadAt',
      sessions: 'id, pdfId, courseId, sessionType, startedAt, dateKey, isUnfinished',
      settings: 'id'
    });
  }
}

export const db = new StudyTrackerDB();

// Initialize default settings without inserting demo courses or study history.
let initPromise: Promise<AppSettings> | null = null;

export async function initializeDatabase(): Promise<AppSettings> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let settings = await db.settings.get('user-settings');
    if (!settings) {
      settings = {
        id: 'user-settings',
        theme: 'light',
        dailyTimeGoalMinutes: 60,
        dailyPageGoal: 15,
        inactivityThresholdMinutes: 5,
        streakRule: 'at-least-one',
        defaultReadingMode: 'single'
      };
      await db.settings.put(settings);
    }

    // New installations start with an empty workspace; demo PDFs can be added manually.

    return settings;
  })();

  return initPromise;
}

export async function getSettings(): Promise<AppSettings> {
  await initializeDatabase();
  const current = await db.settings.get('user-settings');
  if (current) return current;
  return {
    id: 'user-settings',
    theme: 'light',
    dailyTimeGoalMinutes: 60,
    dailyPageGoal: 15,
    inactivityThresholdMinutes: 5,
    streakRule: 'at-least-one',
    defaultReadingMode: 'single'
  };
}
