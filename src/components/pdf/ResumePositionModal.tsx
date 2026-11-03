import React from 'react';
import { BookOpen, BookmarkCheck } from 'lucide-react';

interface ResumePositionModalProps {
  isOpen: boolean;
  lastPosition: number;
  earliestUnread: number;
  onResumeLast: () => void;
  onResumeEarliest: () => void;
}

export const ResumePositionModal: React.FC<ResumePositionModalProps> = ({
  isOpen,
  lastPosition,
  earliestUnread,
  onResumeLast,
  onResumeEarliest
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800">
        <h3 id="resume-dialog-title" className="text-base font-bold text-slate-900 dark:text-white mb-2">
          Resume Reading
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Select where you would like to continue in this document:
        </p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onResumeLast}
            className="flex items-center gap-4 w-full p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 text-left transition cursor-pointer"
          >
            <div className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <BookmarkCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Last reading position
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Continue directly from Page {lastPosition}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onResumeEarliest}
            className="flex items-center gap-4 w-full p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 text-left transition cursor-pointer"
          >
            <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Earliest unread page
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Jump to first uncompleted Page {earliestUnread}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
