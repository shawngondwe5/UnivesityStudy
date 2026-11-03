import React, { useState } from 'react';
import { Check, X, Plus, AlertCircle, FileCheck } from 'lucide-react';

interface FinishReviewModalProps {
  isOpen: boolean;
  totalPages: number;
  visitedPages: number[];
  alreadyStudiedPages: number[];
  sessionDurationSeconds: number;
  onConfirm: (finalPages: number[]) => void;
  onCancel: () => void;
}

export const FinishReviewModal: React.FC<FinishReviewModalProps> = ({
  isOpen,
  totalPages,
  visitedPages,
  alreadyStudiedPages,
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  // Initial candidate pages: visited during session that were not previously studied
  const initialCandidates = Array.from(new Set(visitedPages))
    .filter(p => !alreadyStudiedPages.includes(p))
    .sort((a, b) => a - b);

  const [selectedPages, setSelectedPages] = useState<number[]>(initialCandidates);
  const [manualPageInput, setManualPageInput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const togglePage = (page: number) => {
    if (selectedPages.includes(page)) {
      setSelectedPages(selectedPages.filter(p => p !== page));
    } else {
      setSelectedPages([...selectedPages, page].sort((a, b) => a - b));
    }
  };

  const handleAddManualPage = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(manualPageInput, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
      setErrorMsg(`Please enter a valid page number between 1 and ${totalPages}`);
      return;
    }
    if (alreadyStudiedPages.includes(pageNum)) {
      setErrorMsg(`Page ${pageNum} is already recorded in your completed progress.`);
      return;
    }
    if (selectedPages.includes(pageNum)) {
      setErrorMsg(`Page ${pageNum} is already selected for this session.`);
      return;
    }
    setErrorMsg('');
    setSelectedPages([...selectedPages, pageNum].sort((a, b) => a - b));
    setManualPageInput('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="finish-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Review Studied Pages
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Confirm unique first-time pages completed during this session.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close review modal"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Pages visited while timer was running. Click any page to deselect if you only skimmed it:
          </p>

          {/* Visited Pages Badges */}
          <div className="min-h-[100px] max-h-48 overflow-y-auto p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
            {selectedPages.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                No new pages selected. You can manually add pages below.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedPages.map(page => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => togglePage(page)}
                    aria-label={`Remove page ${page}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition cursor-pointer"
                  >
                    <span>Page {page}</span>
                    <X className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add Offline / Manual Page */}
          <form onSubmit={handleAddManualPage} className="flex gap-2 items-center">
            <input
              type="number"
              min={1}
              max={totalPages}
              value={manualPageInput}
              onChange={e => setManualPageInput(e.target.value)}
              placeholder="Add studied page number..."
              aria-label="Studied page number"
              className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </form>

          {errorMsg && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
            Adding <strong>{selectedPages.length}</strong> new pages will update your daily progress and course completion.
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedPages)}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-sm cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Confirm Pages &amp; Save</span>
          </button>
        </div>
      </div>
    </div>
  );
};
