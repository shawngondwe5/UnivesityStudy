export interface Course {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  isDeleted?: boolean;
}

export interface Lecture {
  id: string;
  courseId: string;
  name: string;
  order: number;
  createdAt: number;
  isDeleted?: boolean;
}

export interface PDFDocument {
  id: string;
  lectureId: string;
  courseId: string;
  filename: string;
  blob: Blob;
  totalPages: number;
  studiedPages: number[]; // Set of confirmed unique page numbers (1-indexed)
  lastPositionPage: number; // Last viewed page
  order: number;
  uploadedAt: number;
  lastReadAt?: number;
  totalFirstTimeTime: number; // Seconds
  totalRevisionTime: number; // Seconds
  isDeleted?: boolean;
}

export type SessionType = 'first-time' | 'revision';

export interface StudySession {
  id: string;
  pdfId: string;
  pdfName: string;
  courseId: string;
  courseName: string;
  lectureId: string;
  lectureName: string;
  sessionType: SessionType;
  startedAt: number; // Epoch ms
  endedAt?: number;
  durationSeconds: number; // Active time only
  visitedPages: number[]; // Temporary pages during session
  confirmedPages: number[]; // Confirmed pages (for first-time)
  isUnfinished: boolean;
  dateKey: string; // YYYY-MM-DD
}

export interface AppSettings {
  id: string;
  theme: 'light' | 'dark';
  dailyTimeGoalMinutes: number;
  dailyPageGoal: number;
  inactivityThresholdMinutes: number;
  streakRule: 'both' | 'at-least-one';
  defaultReadingMode: 'single' | 'continuous';
  sampleDataCleanupVersion?: number;
}

 
export interface StudyNoteHighlight {
  color: 'yellow' | 'green' | 'pink' | 'blue' | 'orange';
  rects: { x: number; y: number; w: number; h: number }[];
}

export interface StudyNote {
  id: string;
  pdfId: string;
  pageNumber: number;
  selectedText: string;
  noteText: string;
  aiExplanation?: string;
  highlight?: StudyNoteHighlight;
  createdAt: number;
  updatedAt: number;
}
