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

// The old in-app sample PDF generator wrote this unmistakable text into its
// generated documents. Use the signature rather than filenames so real PDFs
// and a user's own course/lecture names are never mistaken for demo content.
async function removeGeneratedSampleData(): Promise<void> {
  const allPdfs = await db.pdfs.toArray();
  const generatedPdfIds = new Set<string>();

  for (const pdf of allPdfs) {
    if (!pdf.blob || typeof pdf.blob.text !== 'function') continue;
    try {
      const contents = await pdf.blob.text();
      if (
        contents.includes('University Academic Reading Document') &&
        contents.includes('Offline Persistence: Stored in browser IndexedDB.')
      ) {
        generatedPdfIds.add(pdf.id);
      }
    } catch {
      // An unreadable document is not assumed to be sample data.
    }
  }

  if (generatedPdfIds.size === 0) return;

  await db.transaction('rw', db.courses, db.lectures, db.pdfs, db.sessions, async () => {
    const currentSamplePdfs = await db.pdfs.where('id').anyOf([...generatedPdfIds]).toArray();
    const sampleCourseIds = new Set<string>();

    for (const pdf of currentSamplePdfs) {
      sampleCourseIds.add(pdf.courseId);
      await db.sessions.where('pdfId').equals(pdf.id).delete();
      await db.pdfs.delete(pdf.id);
    }

    // Remove the old built-in demo course only when its exact demo description,
    // lecture titles and all its documents match the generated sample content.
    const demoCourseName = 'Cognitive Psychology & Memory';
    const demoCourseDescription = 'Core models of human memory, sensory processing, and experimental research methodologies.';
    const demoLectureNames = new Set([
      'Lecture 1: Working Memory & Retention',
      'Lecture 2: Long-term Semantic Networks'
    ]);

    for (const courseId of sampleCourseIds) {
      const course = await db.courses.get(courseId);
      if (!course || course.name !== demoCourseName || course.description !== demoCourseDescription) continue;

      const courseLectures = await db.lectures.where('courseId').equals(courseId).toArray();
      if (
        courseLectures.length !== 2 ||
        !courseLectures.every(lecture => demoLectureNames.has(lecture.name))
      ) continue;

      const remainingCoursePdfs = await db.pdfs.where('courseId').equals(courseId).toArray();
      if (remainingCoursePdfs.length > 0) continue;

      await db.lectures.where('courseId').equals(courseId).delete();
      await db.courses.delete(courseId);
    }
  });
}

// Initialize defaults and clean only documents created by the former sample-data
// generator. User-uploaded PDFs, courses, lectures, settings and real sessions stay.
let initPromise: Promise<AppSettings> | null = null;

export async function initializeDatabase(): Promise<AppSettings> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await db.open();
    await removeGeneratedSampleData();

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

    return settings;
  })().catch(error => {
    initPromise = null;
    throw error;
  });

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
