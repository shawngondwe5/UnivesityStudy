import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePdfProgress,
  calculateLectureProgress,
  calculateCourseProgress,
  calculateOverallProgress,
  formatDuration,
  formatTimer,
  getDateKey,
  calculateStreaks
} from './calculations';
import type { PDFDocument, StudySession, AppSettings } from '../types';

test('calculatePdfProgress calculates percentage of unique confirmed pages', () => {
  const pdf: PDFDocument = {
    id: 'pdf-1',
    lectureId: 'lec-1',
    courseId: 'course-1',
    filename: 'test.pdf',
    blob: new Blob([]),
    totalPages: 20,
    studiedPages: [1, 2, 3, 3, 4, 5], // 5 unique pages
    lastPositionPage: 5,
    order: 1,
    uploadedAt: Date.now(),
    totalFirstTimeTime: 600,
    totalRevisionTime: 0
  };

  const progress = calculatePdfProgress(pdf);
  assert.equal(progress, 25); // (5 / 20) * 100 = 25%
});

test('calculateLectureProgress computes unweighted average of active PDFs', () => {
  const pdf1: PDFDocument = {
    id: 'pdf-1',
    lectureId: 'lec-1',
    courseId: 'course-1',
    filename: 'doc1.pdf',
    blob: new Blob([]),
    totalPages: 10,
    studiedPages: [1, 2, 3, 4, 5], // 50%
    lastPositionPage: 5,
    order: 1,
    uploadedAt: Date.now(),
    totalFirstTimeTime: 300,
    totalRevisionTime: 0
  };

  const pdf2: PDFDocument = {
    id: 'pdf-2',
    lectureId: 'lec-1',
    courseId: 'course-1',
    filename: 'doc2.pdf',
    blob: new Blob([]),
    totalPages: 100,
    studiedPages: Array.from({ length: 100 }, (_, i) => i + 1), // 100%
    lastPositionPage: 100,
    order: 2,
    uploadedAt: Date.now(),
    totalFirstTimeTime: 1200,
    totalRevisionTime: 0
  };

  const pdfDeleted: PDFDocument = {
    id: 'pdf-3',
    lectureId: 'lec-1',
    courseId: 'course-1',
    filename: 'deleted.pdf',
    blob: new Blob([]),
    totalPages: 50,
    studiedPages: [],
    lastPositionPage: 1,
    order: 3,
    uploadedAt: Date.now(),
    totalFirstTimeTime: 0,
    totalRevisionTime: 0,
    isDeleted: true
  };

  // Average of 50% and 100% is 75%
  const lectureProgress = calculateLectureProgress([pdf1, pdf2, pdfDeleted]);
  assert.equal(lectureProgress, 75);
});

test('calculateCourseProgress sums unique pages across all active PDFs', () => {
  const pdf1: PDFDocument = {
    id: 'pdf-1',
    lectureId: 'lec-1',
    courseId: 'course-1',
    filename: 'doc1.pdf',
    blob: new Blob([]),
    totalPages: 10,
    studiedPages: [1, 2], // 2 pages
    lastPositionPage: 2,
    order: 1,
    uploadedAt: Date.now(),
    totalFirstTimeTime: 100,
    totalRevisionTime: 0
  };

  const pdf2: PDFDocument = {
    id: 'pdf-2',
    lectureId: 'lec-2',
    courseId: 'course-1',
    filename: 'doc2.pdf',
    blob: new Blob([]),
    totalPages: 30,
    studiedPages: [1, 2, 3, 4, 5, 6], // 6 pages
    lastPositionPage: 6,
    order: 1,
    uploadedAt: Date.now(),
    totalFirstTimeTime: 300,
    totalRevisionTime: 0
  };

  // Total pages = 40, total studied = 8 -> 20%
  const courseProgress = calculateCourseProgress([pdf1, pdf2]);
  assert.equal(courseProgress, 20);
});

test('calculateOverallProgress returns total pages, studied pages and percentage', () => {
  const pdf1: PDFDocument = {
    id: 'pdf-1',
    lectureId: 'lec-1',
    courseId: 'course-1',
    filename: 'doc1.pdf',
    blob: new Blob([]),
    totalPages: 50,
    studiedPages: [1, 2, 3, 4, 5],
    lastPositionPage: 5,
    order: 1,
    uploadedAt: Date.now(),
    totalFirstTimeTime: 100,
    totalRevisionTime: 0
  };

  const result = calculateOverallProgress([pdf1]);
  assert.equal(result.totalPages, 50);
  assert.equal(result.studiedPages, 5);
  assert.equal(result.percentage, 10);
});

test('formatDuration and formatTimer format times cleanly', () => {
  assert.equal(formatDuration(45), '0m');
  assert.equal(formatDuration(125), '2m');
  assert.equal(formatDuration(3660), '1h 1m');
  assert.equal(formatDuration(7200), '2h 0m');

  assert.equal(formatTimer(0), '00:00:00');
  assert.equal(formatTimer(65), '00:01:05');
  assert.equal(formatTimer(3665), '01:01:05');
});

test('calculateStreaks calculates streak and daily achievements correctly', () => {
  const settings: AppSettings = {
    id: 'settings',
    theme: 'light',
    dailyTimeGoalMinutes: 60,
    dailyPageGoal: 10,
    inactivityThresholdMinutes: 5,
    streakRule: 'at-least-one',
    defaultReadingMode: 'single'
  };

  const todayKey = getDateKey();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday);

  const sessions: StudySession[] = [
    {
      id: 's-1',
      pdfId: 'p-1',
      pdfName: 'doc.pdf',
      courseId: 'c-1',
      courseName: 'Course 1',
      lectureId: 'l-1',
      lectureName: 'Lecture 1',
      sessionType: 'first-time',
      startedAt: Date.now() - 3600000,
      durationSeconds: 3600, // 60 minutes meets time goal
      visitedPages: [1, 2, 3, 4, 5],
      confirmedPages: [1, 2, 3, 4, 5],
      isUnfinished: false,
      dateKey: todayKey
    },
    {
      id: 's-2',
      pdfId: 'p-1',
      pdfName: 'doc.pdf',
      courseId: 'c-1',
      courseName: 'Course 1',
      lectureId: 'l-1',
      lectureName: 'Lecture 1',
      sessionType: 'first-time',
      startedAt: yesterday.getTime(),
      durationSeconds: 1800,
      visitedPages: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      confirmedPages: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // 10 pages meets page goal
      isUnfinished: false,
      dateKey: yesterdayKey
    }
  ];

  const streaks = calculateStreaks(sessions, settings);
  assert.equal(streaks.currentStreak, 2);
  assert.equal(streaks.longestStreak, 2);
  assert.equal(streaks.successfulDays, 2);
  assert.equal(streaks.todayMetTime, true);
  assert.equal(streaks.todayMinutes, 60);
});

test('page change updates studiedPages array uniquely and updates lastPositionPage', () => {
  const initialPdf: PDFDocument = {
    id: 'pdf-update-test',
    lectureId: 'lec-1',
    courseId: 'course-1',
    filename: 'test-doc.pdf',
    blob: new Blob([]),
    totalPages: 10,
    studiedPages: [1, 2],
    lastPositionPage: 2,
    order: 1,
    uploadedAt: Date.now(),
    totalFirstTimeTime: 120,
    totalRevisionTime: 0
  };

  // Simulate callback on page change to page 3
  const newPage = 3;
  const currentStudied = new Set(initialPdf.studiedPages || []);
  currentStudied.add(newPage);
  const updatedStudiedPages = Array.from(currentStudied).sort((a, b) => a - b);

  const updatedPdf: PDFDocument = {
    ...initialPdf,
    lastPositionPage: newPage,
    studiedPages: updatedStudiedPages
  };

  assert.equal(updatedPdf.lastPositionPage, 3);
  assert.deepEqual(updatedPdf.studiedPages, [1, 2, 3]);
  assert.equal(calculatePdfProgress(updatedPdf), 30); // 3 out of 10 pages = 30%

  // Simulate visiting an already studied page (e.g. going back to page 2)
  const revisitPage = 2;
  const revisitStudied = new Set(updatedPdf.studiedPages || []);
  revisitStudied.add(revisitPage);
  const revisitPages = Array.from(revisitStudied).sort((a, b) => a - b);

  const revisitedPdf: PDFDocument = {
    ...updatedPdf,
    lastPositionPage: revisitPage,
    studiedPages: revisitPages
  };

  assert.equal(revisitedPdf.lastPositionPage, 2);
  assert.deepEqual(revisitedPdf.studiedPages, [1, 2, 3]); // remains unique
  assert.equal(calculatePdfProgress(revisitedPdf), 30);
});
