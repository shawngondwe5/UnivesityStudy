import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ArrowLeft,
  Plus,
  BookOpen,
  FileText,
  Upload,
  Trash2,
  Play
} from 'lucide-react';
import type { Course, Lecture, PDFDocument } from '../types';
import { db } from '../db';
import {
  calculateCourseProgress,
  calculateLectureProgress,
  calculatePdfProgress,
  formatDuration
} from '../utils/calculations';
import { ConfirmDialog } from '../components/layout/ConfirmDialog';

interface CourseDetailPageProps {
  course: Course;
  lectures: Lecture[];
  pdfs: PDFDocument[];
  onBack: () => void;
  onOpenPdf: (pdf: PDFDocument, courseName: string, lectureName: string) => void;
}

export const CourseDetailPage: React.FC<CourseDetailPageProps> = ({
  course,
  lectures,
  pdfs,
  onBack,
  onOpenPdf
}) => {
  const activeLectures = lectures
    .filter(l => l.courseId === course.id && !l.isDeleted)
    .sort((a, b) => a.order - b.order);

  const activePdfs = pdfs.filter(p => p.courseId === course.id && !p.isDeleted);
  const courseProgress = calculateCourseProgress(activePdfs);

  const totalPagesInCourse = activePdfs.reduce((sum, p) => sum + (p.totalPages || 0), 0);
  const totalStudiedPages = activePdfs.reduce(
    (sum, p) => sum + new Set(p.studiedPages || []).size,
    0
  );
  const totalCourseTime = activePdfs.reduce(
    (sum, p) => sum + (p.totalFirstTimeTime || 0) + (p.totalRevisionTime || 0),
    0
  );

  // States
  const [newLectureName, setNewLectureName] = useState('');
  const [isAddingLecture, setIsAddingLecture] = useState(false);
  const [pdfToDelete, setPdfToDelete] = useState<PDFDocument | null>(null);

  const handleCreateLecture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLectureName.trim()) return;

    const newLecture: Lecture = {
      id: crypto.randomUUID(),
      courseId: course.id,
      name: newLectureName,
      order: activeLectures.length + 1,
      createdAt: Date.now()
    };
    await db.lectures.add(newLecture);
    setNewLectureName('');
    setIsAddingLecture(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, lectureId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please upload a valid PDF document.');
      e.target.value = '';
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const proxy = await loadingTask.promise;
      const totalPages = proxy.numPages;
      if (totalPages < 1) {
        throw new Error('The selected PDF does not contain any readable pages.');
      }

      const newPdf: PDFDocument = {
        id: crypto.randomUUID(),
        lectureId,
        courseId: course.id,
        filename: file.name,
        blob: file,
        totalPages,
        studiedPages: [],
        lastPositionPage: 1,
        order: activePdfs.filter(p => p.lectureId === lectureId).length + 1,
        uploadedAt: Date.now(),
        totalFirstTimeTime: 0,
        totalRevisionTime: 0
      };

      await db.pdfs.add(newPdf);
      e.target.value = '';
    } catch (err) {
      console.error('Failed to parse and store PDF:', err);
      alert('This file could not be opened as a valid PDF. Please choose another PDF.');
      e.target.value = '';
    }
  };

  const handleDeletePdf = async () => {
    if (!pdfToDelete) return;
    await db.pdfs.update(pdfToDelete.id, { isDeleted: true });
    setPdfToDelete(null);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Course Header */}
      <div>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to courses list"
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition mb-3 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Courses</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {course.name}
            </h1>
            {course.description && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                {course.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsAddingLecture(true)}
            aria-label="Add lecture to this course"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Lecture</span>
          </button>
        </div>
      </div>

      {/* Course Progress & Aggregate Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="course-overview-stat p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Course Progress</div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1 font-mono">
            {courseProgress}%
          </div>
        </div>
        <div className="course-overview-stat p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Lectures &amp; PDFs</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {activeLectures.length} / {activePdfs.length}
          </div>
        </div>
        <div className="course-overview-stat p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Pages Studied</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
            {totalStudiedPages} / {totalPagesInCourse}
          </div>
        </div>
        <div className="course-overview-stat p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Total Study Time</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
            {formatDuration(totalCourseTime)}
          </div>
        </div>
      </div>

      {/* Add Lecture Inline Box */}
      {isAddingLecture && (
        <form
          onSubmit={handleCreateLecture}
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-blue-500 shadow-sm flex flex-col sm:flex-row gap-3 items-center"
        >
          <input
            type="text"
            required
            autoFocus
            value={newLectureName}
            onChange={e => setNewLectureName(e.target.value)}
            placeholder="e.g. Lecture 1: Core Principles of Assessment"
            aria-label="Lecture title"
            className="flex-1 px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsAddingLecture(false)}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
            >
              Save Lecture
            </button>
          </div>
        </form>
      )}

      {/* Lectures List */}
      <div className="space-y-6">
        {activeLectures.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No lectures yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
              Create your first lecture to upload and organise study PDF documents.
            </p>
            <button
              type="button"
              onClick={() => setIsAddingLecture(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold shadow-sm hover:bg-blue-700 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Lecture</span>
            </button>
          </div>
        ) : (
          activeLectures.map(lecture => {
            const lecturePdfs = activePdfs
              .filter(p => p.lectureId === lecture.id)
              .sort((a, b) => a.order - b.order);
            const lectureProgress = calculateLectureProgress(lecturePdfs);

            return (
              <div
                key={lecture.id}
                className="lecture-library-card rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                {/* Lecture Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {lecture.name}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span>{lecturePdfs.length} Documents</span>
                      <span>&bull;</span>
                      <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {lectureProgress}% Progress (Equal Weight)
                      </span>
                    </div>
                  </div>

                  {/* Actions for Lecture */}
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload PDF</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={e => handleFileUpload(e, lecture.id)}
                      />
                    </label>

                  </div>
                </div>

                {/* PDFs in this Lecture */}
                <div className="p-6">
                  {lecturePdfs.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      No documents in this lecture yet. Upload your lecture PDF to begin tracking real study progress.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {lecturePdfs.map(pdf => {
                        const pdfProg = calculatePdfProgress(pdf);
                        const studiedCount = new Set(pdf.studiedPages || []).size;

                        return (
                          <div
                            key={pdf.id}
                            className="pdf-library-card p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {pdf.filename}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setPdfToDelete(pdf)}
                                  aria-label={`Delete ${pdf.filename}`}
                                  className="p-1 rounded text-slate-400 hover:text-red-600 cursor-pointer"
                                  title="Delete Document"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-2">
                                <span>{pdf.totalPages} Pages</span>
                                <span>&bull;</span>
                                <span>{studiedCount} Studied</span>
                                <span>&bull;</span>
                                <span>{formatDuration((pdf.totalFirstTimeTime || 0) + (pdf.totalRevisionTime || 0))}</span>
                              </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                              <div className="w-28">
                                <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-1">
                                  <span>{pdfProg}%</span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full bg-blue-600 rounded-full"
                                    style={{ width: `${pdfProg}%` }}
                                  />
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => onOpenPdf(pdf, course.name, lecture.name)}
                                aria-label={`Open PDF ${pdf.filename}`}
                                className="pdf-open-action flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>Open PDF</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Confirm Deletion for PDF Document */}
      <ConfirmDialog
        isOpen={!!pdfToDelete}
        title="Delete Document?"
        message={`Are you sure you want to delete "${pdfToDelete?.filename}"?`}
        details="The document file will be deleted from device memory. Your complete reading history, past session durations, and studied page records for this file will remain preserved for your weekly reports."
        confirmLabel="Delete Document"
        onConfirm={handleDeletePdf}
        onCancel={() => setPdfToDelete(null)}
      />
    </div>
  );
};
