import Dexie, { type Table } from 'dexie';
import type { Course, Lecture, PDFDocument, StudySession, AppSettings } from '../types';
import { createSamplePdfBlob } from '../utils/samplePdf';
import { getDateKey } from '../utils/calculations';

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

// Initialize default settings and seed demo course if empty
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

    // Check if course already exists before seeding
    const courseId = 'course-cog-psy-101';
    const existingCourse = await db.courses.get(courseId);
    if (!existingCourse) {
      await db.courses.put({
        id: courseId,
        name: 'Cognitive Psychology & Human Memory',
        description: 'Foundational models of working memory, neural encoding, semantic networks, and empirical recall.',
        createdAt: Date.now() - 86400000 * 2
      });

      const lectureId1 = 'lec-working-mem';
      await db.lectures.put({
        id: lectureId1,
        courseId,
        name: 'Lecture 1: Working Memory Architecture',
        order: 1,
        createdAt: Date.now() - 86400000 * 2
      });

      const lectureId2 = 'lec-semantic-enc';
      await db.lectures.put({
        id: lectureId2,
        courseId,
        name: 'Lecture 2: Semantic Encoding & Retrieval',
        order: 2,
        createdAt: Date.now() - 86400000
      });

      const pdf1Blob = createSamplePdfBlob('Working Memory Architecture', 'Cognitive Psychology', 8);
      const pdf1Id = 'pdf-wm-arch';
      await db.pdfs.put({
        id: pdf1Id,
        lectureId: lectureId1,
        courseId,
        filename: 'Working_Memory_Architecture_L1.pdf',
        blob: pdf1Blob,
        totalPages: 8,
        studiedPages: [1, 2, 3],
        lastPositionPage: 3,
        order: 1,
        uploadedAt: Date.now() - 86400000 * 2,
        totalFirstTimeTime: 2400,
        totalRevisionTime: 600
      });

      const pdf2Blob = createSamplePdfBlob('Semantic Encoding and Recall', 'Cognitive Psychology', 10);
      const pdf2Id = 'pdf-sem-enc';
      await db.pdfs.put({
        id: pdf2Id,
        lectureId: lectureId2,
        courseId,
        filename: 'Semantic_Encoding_L2.pdf',
        blob: pdf2Blob,
        totalPages: 10,
        studiedPages: [],
        lastPositionPage: 1,
        order: 1,
        uploadedAt: Date.now() - 86400000,
        totalFirstTimeTime: 0,
        totalRevisionTime: 0
      });

      // Seed yesterday's completed session to demonstrate streak and weekly report
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = getDateKey(yesterday);

      await db.sessions.put({
        id: 'session-seed-1',
        pdfId: pdf1Id,
        pdfName: 'Working_Memory_Architecture_L1.pdf',
        courseId,
        courseName: 'Cognitive Psychology & Human Memory',
        lectureId: lectureId1,
        lectureName: 'Lecture 1: Working Memory Architecture',
        sessionType: 'first-time',
        startedAt: yesterday.getTime() - 2400000,
        endedAt: yesterday.getTime(),
        durationSeconds: 2400,
        visitedPages: [1, 2, 3],
        confirmedPages: [1, 2, 3],
        isUnfinished: false,
        dateKey: yesterdayKey
      });
    }

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
