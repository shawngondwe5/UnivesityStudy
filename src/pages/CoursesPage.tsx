import React, { useState } from 'react';
import { Plus, GraduationCap, Edit, Trash2 } from 'lucide-react';
import type { Course, Lecture, PDFDocument } from '../types';
import { db } from '../db';
import { calculateCourseProgress } from '../utils/calculations';
import { ConfirmDialog } from '../components/layout/ConfirmDialog';

interface CoursesPageProps {
  courses: Course[];
  lectures: Lecture[];
  pdfs: PDFDocument[];
  onOpenCourse: (courseId: string) => void;
}

export const CoursesPage: React.FC<CoursesPageProps> = ({
  courses,
  lectures,
  pdfs,
  onOpenCourse
}) => {
  const activeCourses = courses.filter(c => !c.isDeleted);
  const activePdfs = pdfs.filter(p => !p.isDeleted);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);

  const handleOpenCreate = () => {
    setEditingCourse(null);
    setName('');
    setDescription('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Course) => {
    setEditingCourse(c);
    setName(c.name);
    setDescription(c.description || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingCourse) {
      await db.courses.update(editingCourse.id, { name, description });
    } else {
      const newCourse: Course = {
        id: crypto.randomUUID(),
        name,
        description,
        createdAt: Date.now()
      };
      await db.courses.add(newCourse);
    }
    setIsModalOpen(false);
  };

  const handleDelete = async () => {
    if (!courseToDelete) return;
    // Mark course as deleted; lectures and active PDFs soft-deleted, historical sessions preserved
    await db.courses.update(courseToDelete.id, { isDeleted: true });
    const relatedLectures = lectures.filter(l => l.courseId === courseToDelete.id);
    for (const l of relatedLectures) {
      await db.lectures.update(l.id, { isDeleted: true });
    }
    const relatedPdfs = pdfs.filter(p => p.courseId === courseToDelete.id);
    for (const p of relatedPdfs) {
      await db.pdfs.update(p.id, { isDeleted: true });
    }
    setCourseToDelete(null);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            My Courses
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Organise university modules, lecture series and PDF documents.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          aria-label="Add new course"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Course</span>
        </button>
      </div>

      {activeCourses.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <GraduationCap className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No courses yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
            Add your university courses to begin structuring your academic materials.
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold shadow-sm hover:bg-blue-700 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add First Course</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {activeCourses.map(course => {
            const coursePdfs = activePdfs.filter(p => p.courseId === course.id);
            const courseLectures = lectures.filter(l => l.courseId === course.id && !l.isDeleted);
            const progress = calculateCourseProgress(coursePdfs);

            return (
              <article
                key={course.id}
                className="course-library-card p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 dark:hover:border-blue-500 transition flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 text-base font-bold text-slate-900 dark:text-white truncate">
                      <button
                        type="button"
                        onClick={() => onOpenCourse(course.id)}
                        className="text-left hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 rounded"
                      >
                        {course.name}
                      </button>
                    </h3>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(course)}
                        aria-label={`Edit course ${course.name}`}
                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="Edit Course"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCourseToDelete(course)}
                        aria-label={`Delete course ${course.name}`}
                        className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-600 cursor-pointer"
                        title="Delete Course"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {course.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-2">
                      {course.description}
                    </p>
                  )}
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-500">
                      {courseLectures.length} lectures &bull; {coursePdfs.length} PDFs
                    </span>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {progress}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal: Create/Edit Course */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="course-modal-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 id="course-modal-heading" className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {editingCourse ? 'Edit Course' : 'Create Course'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label htmlFor="course-name-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Course Name *
                </label>
                <input
                  id="course-name-input"
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Educational Testing & Measurement"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label htmlFor="course-desc-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  id="course-desc-input"
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Course overview or lecture room notes..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-sm cursor-pointer"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Safe Course Deletion */}
      <ConfirmDialog
        isOpen={!!courseToDelete}
        title="Delete Course?"
        message={`Are you sure you want to delete "${courseToDelete?.name}"?`}
        details="This will remove the course and its lecture files from active browsing. All your reading history, completed session logs, and recorded study times will remain safely preserved in your reports."
        confirmLabel="Confirm Deletion"
        onConfirm={handleDelete}
        onCancel={() => setCourseToDelete(null)}
      />
    </div>
  );
};
