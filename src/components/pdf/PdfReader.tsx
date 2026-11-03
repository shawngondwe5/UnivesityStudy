import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import 'pdfjs-dist/web/pdf_viewer.css';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  StickyNote,
  Sparkles,
  X,
  Save,
  Trash2
} from 'lucide-react';
import type { PDFDocument, StudySession, SessionType, AppSettings, StudyNote } from '../../types';
import { db } from '../../db';
import { formatTimer, getDateKey } from '../../utils/calculations';
import { useInactivity } from '../../hooks/useInactivity';
import { FinishReviewModal } from './FinishReviewModal';
import { ResumePositionModal } from './ResumePositionModal';

// PDF.js text-layer helper. The task is cancelled whenever its page is rerendered.
async function renderPdfTextLayer(page: pdfjsLib.PDFPageProxy, viewport: any, container: HTMLDivElement) {
  container.replaceChildren();
  const textContent = await page.getTextContent();
  const render = (pdfjsLib as any).renderTextLayer as (options: { textContent: unknown; container: HTMLDivElement; viewport: any; textDivs: HTMLElement[] }) => { promise: Promise<void>; cancel: () => void };
  const task = render({ textContent, container, viewport, textDivs: [] });
  await task.promise;
  return task;
}

// Set offline local worker bundle, with fallback
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
} catch (e) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

const PdfPageThumbnail: React.FC<{
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
}> = ({ pdf, pageNumber }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;
    const render = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(112 / base.width, 148 / base.height);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) return;
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error) {
        if (!cancelled) console.error('Thumbnail render failed:', error);
      }
    };
    render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, visible]);

  return (
    <div ref={hostRef} className="pdf-thumbnail-preview">
      <canvas ref={canvasRef} aria-label={`Preview of page ${pageNumber}`} />
      {!visible && <div className="pdf-thumbnail-skeleton" />}
    </div>
  );
};

interface PdfReaderProps {
  pdfDoc: PDFDocument;
  courseName: string;
  lectureName: string;
  settings: AppSettings;
  onClose: () => void;
  onPageChange?: (newPage: number) => void;
}

export const PdfReader: React.FC<PdfReaderProps> = ({
  pdfDoc,
  courseName,
  lectureName,
  settings,
  onClose,
  onPageChange
}) => {
  const [pdfProxy, setPdfProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(pdfDoc.lastPositionPage || 1);
  const [totalPages, setTotalPages] = useState<number>(pdfDoc.totalPages || 1);
  const [scale, setScale] = useState<number>(1.2);
  const [readingMode, setReadingMode] = useState<'single' | 'continuous'>(settings.defaultReadingMode || 'single');
  const [isPagePanelOpen, setIsPagePanelOpen] = useState(true);

  // Document progress state (in-memory sync with IndexedDB)
  const [studiedPages, setStudiedPages] = useState<number[]>(pdfDoc.studiedPages || []);
  const lastRecordedPageRef = useRef<number | null>(null);

  // Study timer and session states
  const [sessionMode, setSessionMode] = useState<SessionType>('first-time');
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true); // Auto-start reading timer
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [visitedPages, setVisitedPages] = useState<number[]>([pdfDoc.lastPositionPage || 1]);
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());

  // Inactivity notification state
  const [showInactivityNotice, setShowInactivityNotice] = useState<boolean>(false);

  // Modals
  const [showFinishModal, setShowFinishModal] = useState<boolean>(false);
  const [showResumeModal, setShowResumeModal] = useState<boolean>(false);
  const [selectedText, setSelectedText] = useState<{ text: string; pageNumber: number; top: number; left: number } | null>(null);
  const [selectionPanel, setSelectionPanel] = useState<'actions' | 'note' | 'summary' | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [summary, setSummary] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const notes = useLiveQuery(async () => {
    const saved = await db.notes.where('pdfId').equals(pdfDoc.id).toArray();
    return saved.sort((a, b) => b.createdAt - a.createdAt);
  }, [pdfDoc.id]) || [];

  const readerRootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const mainScrollContainerRef = useRef<HTMLElement | null>(null);
  const continuousContainerRef = useRef<HTMLDivElement | null>(null);
  const activeThumbnailRef = useRef<HTMLButtonElement | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Keep the floating actions attached to real text selected in the PDF.js layer.
  useEffect(() => {
    const root = readerRootRef.current;
    if (!root) return;
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';
      if (!selection || selection.isCollapsed || !text) {
        if (!selectionPanel) setSelectedText(null);
        return;
      }
      const anchor = selection.anchorNode;
      const textLayer = anchor instanceof Element ? anchor.closest('.textLayer') : anchor?.parentElement?.closest('.textLayer');
      if (!textLayer || !root.contains(textLayer)) return;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const pageElement = textLayer.closest('[data-page-number]');
      setSelectedText({ text: text.slice(0, 12000), pageNumber: Number(pageElement?.getAttribute('data-page-number') || currentPage), top: rect.top, left: rect.left });
      setSelectionPanel('actions');
    };
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.pdf-selection-popover, .textLayer')) return;
      setSelectedText(null);
      setSelectionPanel(null);
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [currentPage, selectionPanel]);

  const handleSaveSelectedNote = async () => {
    if (!selectedText || !noteDraft.trim()) return;
    const now = Date.now();
    const note: StudyNote = { id: crypto.randomUUID(), pdfId: pdfDoc.id, pageNumber: selectedText.pageNumber, selectedText: selectedText.text, noteText: noteDraft.trim(), createdAt: now, updatedAt: now };
    await db.notes.add(note);
    setNoteDraft('');
    setSelectionPanel(null);
    setSelectedText(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleSummarizeSelection = async () => {
    if (!selectedText) return;
    setSelectionPanel('summary');
    setIsSummarizing(true);
    setSummary('');
    setSummaryError('');
    try {
      const response = await fetch('/api/ai/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: selectedText.text, pageNumber: selectedText.pageNumber, documentName: pdfDoc.filename }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The summary could not be generated.');
      setSummary(typeof data.summary === 'string' ? data.summary : '');
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : 'The summary could not be generated.');
    } finally {
      setIsSummarizing(false);
    }
  };

  // Sync reading mode if settings change
  useEffect(() => {
    if (settings.defaultReadingMode) {
      setReadingMode(settings.defaultReadingMode);
    }
  }, [settings.defaultReadingMode]);

  // Load PDF file from Blob
  useEffect(() => {
    let isCancelled = false;

    const loadPdf = async () => {
      try {
        const arrayBuffer = await pdfDoc.blob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const proxy = await loadingTask.promise;
        if (!isCancelled) {
          setPdfProxy(proxy);
          setTotalPages(proxy.numPages);
          const savedPosition = Math.min(Math.max(1, pdfDoc.lastPositionPage || 1), proxy.numPages);
          setCurrentPage(savedPosition);
          setVisitedPages([savedPosition]);

          // Offer a choice only when there is a valid saved position and an
          // actual unread page to return to. Do not treat a fully studied PDF
          // as if page 1 were unread.
          const studiedSet = new Set((pdfDoc.studiedPages || []).filter(p => p >= 1 && p <= proxy.numPages));
          const earliestUnread = Array.from({ length: proxy.numPages }, (_, i) => i + 1)
            .find(page => !studiedSet.has(page));
          if (savedPosition > 1 && earliestUnread !== undefined && earliestUnread !== savedPosition) {
            setShowResumeModal(true);
          }
        }
      } catch (err) {
        console.error('Failed to load PDF document:', err);
      }
    };

    loadPdf();
    return () => {
      isCancelled = true;
    };
  }, [pdfDoc.id]);

  // Handle study timer interval
  useEffect(() => {
    if (isTimerRunning) {
      timerIntervalRef.current = window.setInterval(() => {
        setTimerSeconds(s => s + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isTimerRunning]);

  // Inactivity hook (pauses timer after inactivity threshold)
  useInactivity({
    thresholdMinutes: settings.inactivityThresholdMinutes,
    isActive: isTimerRunning,
    onInactive: () => {
      setIsTimerRunning(false);
      setShowInactivityNotice(true);
    }
  });

  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  const lastHandledPageRef = useRef<number | null>(null);

  // Page views are tracked separately from confirmed study progress.
  // Moving through a document only saves the resume position.
  const handlePageChange = useCallback(
    async (newPage: number) => {
      if (newPage < 1 || newPage > totalPages) return;

      setVisitedPages(prev => (prev.includes(newPage) ? prev : [...prev, newPage]));

      if (lastHandledPageRef.current === newPage) return;
      lastHandledPageRef.current = newPage;

      try {
        await db.pdfs.update(pdfDoc.id, {
          lastPositionPage: newPage,
          lastReadAt: Date.now()
        });
        onPageChangeRef.current?.(newPage);
      } catch (err) {
        console.error('Failed to update PDF reading position:', err);
      }
    },
    [pdfDoc.id, totalPages]
  );

  // Synchronize initial page or any direct page change
  useEffect(() => {
    handlePageChange(currentPage);
  }, [currentPage, handlePageChange]);

  // Render current page and its selectable PDF.js text layer in single mode
  useEffect(() => {
    if (!pdfProxy || readingMode !== 'single' || !canvasRef.current) return;

    let renderTask: any = null;
    let textRenderTask: { cancel: () => void } | null = null;

    const renderPage = async () => {
      try {
        const page = await pdfProxy.getPage(currentPage);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';

        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        const textLayer = textLayerRef.current;
        if (textLayer) {
          textLayer.style.width = viewport.width + 'px';
          textLayer.style.height = viewport.height + 'px';
          textRenderTask = await renderPdfTextLayer(page, viewport, textLayer);
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Page render error:', err);
        }
      }
    };

    renderPage();
    return () => {
      if (renderTask) renderTask.cancel();
      textRenderTask?.cancel();
    };
  }, [pdfProxy, currentPage, scale, readingMode]);

  // Render all pages in continuous scrolling mode
  useEffect(() => {
    if (!pdfProxy || readingMode !== 'continuous' || !continuousContainerRef.current) return;

    let isCancelled = false;
    const container = continuousContainerRef.current;
    container.innerHTML = '';

    const renderAllPages = async () => {
      for (let num = 1; num <= pdfProxy.numPages; num++) {
        if (isCancelled) break;
        const page = await pdfProxy.getPage(num);
        const viewport = page.getViewport({ scale });
        const wrapper = document.createElement('div');
        wrapper.className = 'pdf-page-surface mb-6 flex flex-col items-center shadow-md';
        wrapper.id = `continuous-page-${num}`;
        wrapper.setAttribute('data-page-number', String(num));
        wrapper.style.width = viewport.width + 'px';
        wrapper.style.height = viewport.height + 'px';

        const canvas = document.createElement('canvas');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        const label = document.createElement('div');
        label.className = 'text-xs text-slate-400 mt-2 font-mono';
        label.innerText = `Page ${num}`;

        const textLayer = document.createElement('div');
        textLayer.className = 'textLayer pdf-text-layer';
        textLayer.style.width = viewport.width + 'px';
        textLayer.style.height = viewport.height + 'px';
        wrapper.appendChild(canvas);
        wrapper.appendChild(textLayer);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
        await renderPdfTextLayer(page, viewport, textLayer);
      }
    };

    renderAllPages();
    return () => {
      isCancelled = true;
    };
  }, [pdfProxy, readingMode, scale]);

  // Continuous mode records the page after scrolling settles. This prevents
  // smooth scrolling and fast flicks from marking every page passed on the way.
  useEffect(() => {
    if (readingMode !== 'continuous' || !pdfProxy || !mainScrollContainerRef.current) return;

    const scrollContainer = mainScrollContainerRef.current;
    let settleTimer: number | null = null;

    const handleScroll = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        const pageElements = scrollContainer.querySelectorAll<HTMLElement>('[data-page-number]');
        if (pageElements.length === 0) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const viewportMiddle = containerRect.top + containerRect.height / 2;
        let visiblePage = currentPage;
        let smallestDistance = Infinity;

        pageElements.forEach(element => {
          const rect = element.getBoundingClientRect();
          const distance = viewportMiddle < rect.top
            ? rect.top - viewportMiddle
            : viewportMiddle > rect.bottom
              ? viewportMiddle - rect.bottom
              : 0;
          if (distance < smallestDistance) {
            smallestDistance = distance;
            visiblePage = Number(element.dataset.pageNumber);
          }
        });

        if (visiblePage >= 1 && visiblePage <= totalPages && visiblePage !== currentPage) {
          setCurrentPage(visiblePage);
          handlePageChange(visiblePage);
          if (!isTimerRunning) {
            setIsTimerRunning(true);
            setShowInactivityNotice(false);
          }
        }
      }, 160);
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
  }, [readingMode, pdfProxy, totalPages, currentPage, isTimerRunning, handlePageChange]);

  // Keyboard navigation for page turning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showFinishModal || showResumeModal || ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        navigateToPage(Math.min(totalPages, currentPage + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        navigateToPage(Math.max(1, currentPage - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, readingMode, showFinishModal, showResumeModal]);

  const navigateToPage = (pageNum: number) => {
    if (pageNum < 1 || pageNum > totalPages) return;
    setCurrentPage(pageNum);
    handlePageChange(pageNum);

    if (readingMode === 'continuous') {
      const el = document.getElementById(`continuous-page-${pageNum}`);
      el?.scrollIntoView({ behavior: 'smooth' });
    }

    if (!isTimerRunning) {
      setIsTimerRunning(true);
      setShowInactivityNotice(false);
    }
  };

  // Keep sidebar thumbnail list scrolled so current page remains in view
  useEffect(() => {
    if (activeThumbnailRef.current) {
      activeThumbnailRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [currentPage]);

  const handleToggleReadingMode = async () => {
    const nextMode: 'single' | 'continuous' = readingMode === 'single' ? 'continuous' : 'single';
    setReadingMode(nextMode);
    // Persist user preference into IndexedDB
    const updated: AppSettings = { ...settings, defaultReadingMode: nextMode };
    await db.settings.put(updated);
  };

  // Start study session
  const handleStartSession = () => {
    setIsTimerRunning(true);
    setShowInactivityNotice(false);
    if (!sessionStartTime) {
      setSessionStartTime(Date.now());
    }
  };

  // Pause study session
  const handlePauseSession = () => {
    setIsTimerRunning(false);
  };

  // Handle Finish Now
  const handleFinishNow = () => {
    setIsTimerRunning(false);
    if (sessionMode === 'first-time') {
      setShowFinishModal(true);
    } else {
      handleSaveRevisionSession();
    }
  };

  const handleSaveRevisionSession = async () => {
    if (timerSeconds < 5) {
      onClose();
      return;
    }

    const session: StudySession = {
      id: crypto.randomUUID(),
      pdfId: pdfDoc.id,
      pdfName: pdfDoc.filename,
      courseId: pdfDoc.courseId,
      courseName,
      lectureId: pdfDoc.lectureId,
      lectureName,
      sessionType: 'revision',
      startedAt: sessionStartTime || Date.now() - timerSeconds * 1000,
      endedAt: Date.now(),
      durationSeconds: timerSeconds,
      visitedPages: [],
      confirmedPages: [],
      isUnfinished: false,
      dateKey: getDateKey()
    };

    await db.sessions.add(session);
    await db.pdfs.update(pdfDoc.id, {
      totalRevisionTime: (pdfDoc.totalRevisionTime || 0) + timerSeconds,
      lastReadAt: Date.now()
    });
    onClose();
  };

  // Confirm pages from Finish Review Modal
  const handleConfirmPages = async (confirmedPages: number[]) => {
    const session: StudySession = {
      id: crypto.randomUUID(),
      pdfId: pdfDoc.id,
      pdfName: pdfDoc.filename,
      courseId: pdfDoc.courseId,
      courseName,
      lectureId: pdfDoc.lectureId,
      lectureName,
      sessionType: 'first-time',
      startedAt: sessionStartTime || Date.now() - timerSeconds * 1000,
      endedAt: Date.now(),
      durationSeconds: timerSeconds,
      visitedPages,
      confirmedPages,
      isUnfinished: false,
      dateKey: getDateKey()
    };

    await db.sessions.add(session);

    // Merge confirmed pages into unique studiedPages set
    const currentDoc = await db.pdfs.get(pdfDoc.id);
    const currentStudied = new Set(currentDoc?.studiedPages || studiedPages);
    confirmedPages.forEach(p => currentStudied.add(p));
    const mergedPages = Array.from(currentStudied).sort((a, b) => a - b);

    await db.pdfs.update(pdfDoc.id, {
      studiedPages: mergedPages,
      totalFirstTimeTime: (currentDoc?.totalFirstTimeTime || pdfDoc.totalFirstTimeTime || 0) + timerSeconds,
      lastReadAt: Date.now(),
      lastPositionPage: currentPage
    });
    setStudiedPages(mergedPages);
    onPageChangeRef.current?.(currentPage);

    setShowFinishModal(false);
    onClose();
  };

  // Close safely preserving unfinished session
  const handleSafeClose = async () => {
    if (timerSeconds >= 10) {
      const unfinishedSession: StudySession = {
        id: crypto.randomUUID(),
        pdfId: pdfDoc.id,
        pdfName: pdfDoc.filename,
        courseId: pdfDoc.courseId,
        courseName,
        lectureId: pdfDoc.lectureId,
        lectureName,
        sessionType: sessionMode,
        startedAt: sessionStartTime || Date.now() - timerSeconds * 1000,
        endedAt: Date.now(),
        durationSeconds: timerSeconds,
        visitedPages,
        confirmedPages: [],
        isUnfinished: true,
        dateKey: getDateKey()
      };
      await db.sessions.add(unfinishedSession);
    }
    onClose();
  };

  const studiedSet = new Set(studiedPages);
  const progressPercent = totalPages > 0 ? Math.round((studiedSet.size / totalPages) * 100) : 0;

  return (
    <div
      role="region"
      aria-label="PDF Reader Workspace"
      ref={readerRootRef}
      className="pdf-reader fixed inset-0 z-40 flex flex-col"
    >
      {/* Top Header & Reading Controls */}
      <header className="pdf-reader-header flex items-center justify-between px-5 py-3 border-b">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleSafeClose}
            aria-label="Back to course materials"
            className="pdf-reader-button flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div>
            <div className="text-sm font-bold text-slate-900 truncate max-w-sm">{pdfDoc.filename}</div>
            <div className="text-xs text-slate-500">
              {courseName} &bull; {lectureName}
            </div>
          </div>
        </div>

        {/* Study Timer Center Controls */}
        <div className="pdf-reader-toolbar flex items-center gap-4 px-4 py-1.5 rounded-2xl border">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isTimerRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span className="font-mono text-base font-bold tracking-wider text-slate-900">
              {formatTimer(timerSeconds)}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Mode Selector */}
          <select
            value={sessionMode}
            onChange={e => setSessionMode(e.target.value as SessionType)}
            aria-label="Session reading mode"
            className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none cursor-pointer"
          >
            <option value="first-time" className="bg-white text-slate-900">First-time Reading</option>
            <option value="revision" className="bg-slate-900 text-white">Revision Session</option>
          </select>

          <div className="h-4 w-px bg-slate-800" />

          {!isTimerRunning ? (
            <button
              type="button"
              onClick={handleStartSession}
              aria-label="Start reading timer"
              className="pdf-reader-primary flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold text-white transition cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume Timer</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePauseSession}
              aria-label="Pause reading timer"
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Pause</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleFinishNow}
            disabled={visitedPages.length === 0 && timerSeconds === 0}
            aria-label="Finish study session now"
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-lime-500 hover:bg-lime-600 disabled:opacity-40 text-slate-900 transition cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Finish Now</span>
          </button>
        </div>

        {/* View Mode, saved notes and zoom controls */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowNotes(true)} className="pdf-reader-control flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-sky-50" aria-label={`Open notes, ${notes.length} saved`} title="Saved notes">
            <StickyNote className="h-4 w-4" /><span className="hidden sm:inline">Notes {notes.length > 0 ? `(${notes.length})` : ''}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsPagePanelOpen(open => !open)}
            aria-label={isPagePanelOpen ? 'Hide page thumbnails' : 'Show page thumbnails'}
            aria-expanded={isPagePanelOpen}
            className="pdf-reader-control flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-sky-50"
            title={isPagePanelOpen ? 'Hide page panel' : 'Show page panel'}
          >
            {isPagePanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            <span className="hidden sm:inline">{isPagePanelOpen ? 'Hide pages' : 'Show pages'}</span>
          </button>
          <div className="pdf-reader-control flex items-center rounded-xl p-1 border">
            <button
              type="button"
              onClick={() => setScale(s => Math.max(0.6, s - 0.2))}
              aria-label="Zoom out"
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono px-2 text-slate-500">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              onClick={() => setScale(s => Math.min(2.5, s + 0.2))}
              aria-label="Zoom in"
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800">
            <button
              type="button"
              onClick={handleToggleReadingMode}
              aria-label={readingMode === 'single' ? 'Switch to Continuous Scrolling' : 'Switch to Single Page'}
              className="px-2.5 py-1 text-xs font-medium rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
            >
              {readingMode === 'single' ? 'Single' : 'Scroll'}
            </button>
          </div>
        </div>
      </header>

      {/* Inactivity Alert Banner */}
      {showInactivityNotice && (
        <div className="bg-amber-500 text-white px-4 py-2 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Study timer paused. No activity detected for {settings.inactivityThresholdMinutes} minutes.</span>
          </div>
          <button
            type="button"
            onClick={handleStartSession}
            className="px-3 py-1 rounded bg-white text-amber-900 font-bold hover:bg-amber-50 cursor-pointer"
          >
            Resume Studying
          </button>
        </div>
      )}

      {/* Reader Main Body */}
      <div className="pdf-reader-body relative flex flex-1 overflow-hidden">
        {/* Left Panel: Page Thumbnails & Navigation */}
        {isPagePanelOpen && (
        <aside className="pdf-reader-sidebar w-56 shrink-0 border-r flex flex-col" aria-label="Page navigation">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">Pages ({totalPages})</span>
            <span className="text-sky-600 font-mono">{progressPercent}% studied</span>
          </div>
          <div className="pdf-thumbnail-list flex-1 overflow-y-auto p-3 space-y-3">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => {
              const isStudied = studiedSet.has(pageNumber);
              const isCurrent = currentPage === pageNumber;
              const isVisited = visitedPages.includes(pageNumber);

              return (
                <button
                  key={pageNumber}
                  id={`sidebar-page-btn-${pageNumber}`}
                  ref={isCurrent ? activeThumbnailRef : null}
                  type="button"
                  aria-label={`Jump to page ${pageNumber}`}
                  onClick={() => navigateToPage(pageNumber)}
                  className={`pdf-thumbnail-card w-full flex flex-col gap-2 p-2 rounded-xl border text-left text-xs transition cursor-pointer ${
                    isCurrent
                      ? 'is-current'
                      : ''
                  }`}
                >
                  {pdfProxy ? <PdfPageThumbnail pdf={pdfProxy} pageNumber={pageNumber} /> : <div className="pdf-thumbnail-preview"><div className="pdf-thumbnail-skeleton" /></div>}
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="font-semibold text-slate-700">Page {pageNumber}</span>

                  {/* Status Indicator */}
                  <div className="shrink-0">
                    {isStudied ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Studied
                      </span>
                    ) : isVisited ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Visited
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                        Unread
                      </span>
                    )}
                  </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
        )}

        {/* Center Panel: PDF Viewer */}
        <main
          ref={mainScrollContainerRef}
          className="pdf-reader-canvas min-w-0 flex-1 overflow-auto flex flex-col items-center p-6 relative"
        >
          {readingMode === 'single' ? (
            <div className="flex flex-col items-center pb-20">
              <div className="pdf-page-surface" data-page-number={currentPage}>
                <canvas ref={canvasRef} className="pdf-reader-page-canvas max-w-full shadow-xl rounded-sm bg-white border border-slate-200" />
                <div ref={textLayerRef} className="textLayer pdf-text-layer" />
              </div>
            </div>
          ) : (
            <div ref={continuousContainerRef} className="w-full flex flex-col items-center pb-24" />
          )}

          {/* Floating Bottom Pagination Controls (Always available in both modes) */}
          <div className="pdf-reader-pagination fixed bottom-6 flex items-center gap-4 backdrop-blur px-5 py-2.5 rounded-full border shadow-xl z-30">
            <button
              type="button"
              onClick={() => navigateToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Previous page"
              className="p-1.5 rounded-full hover:bg-sky-50 text-slate-600 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-xs font-mono font-medium text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => navigateToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
              className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300 disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </main>
      </div>

      {selectedText && selectionPanel && (
        <div className="pdf-selection-popover" style={{ top: Math.max(12, selectedText.top - 58), left: Math.max(12, Math.min(selectedText.left, window.innerWidth - 290)) }} aria-label="Selected text actions">
          {selectionPanel === 'actions' && <div className="flex items-center gap-1" onMouseDown={event => event.preventDefault()}>
            <button type="button" onClick={() => { setNoteDraft(''); setSelectionPanel('note'); }} className="pdf-selection-action"><StickyNote className="h-4 w-4" /><span>Add note</span></button>
            <button type="button" onClick={handleSummarizeSelection} className="pdf-selection-action pdf-selection-ai"><Sparkles className="h-4 w-4" /><span>Summarize</span></button>
            <button type="button" onClick={() => { setSelectionPanel(null); setSelectedText(null); }} className="pdf-selection-close" aria-label="Hide selection actions" title="Hide"><X className="h-4 w-4" /></button>
          </div>}
          {selectionPanel === 'note' && <div className="w-72 space-y-2">
            <div className="flex items-center justify-between gap-2"><strong className="text-xs">Quick note · Page {selectedText.pageNumber}</strong><button type="button" onClick={() => setSelectionPanel('actions')} aria-label="Back to selection actions"><X className="h-4 w-4" /></button></div>
            <p className="pdf-selection-quote">“{selectedText.text.slice(0, 180)}{selectedText.text.length > 180 ? '…' : ''}”</p>
            <textarea autoFocus rows={3} maxLength={500} value={noteDraft} onChange={event => setNoteDraft(event.target.value)} placeholder="Write a short note about this passage…" className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-sky-400" />
            <div className="flex justify-end"><button type="button" onClick={handleSaveSelectedNote} disabled={!noteDraft.trim()} className="pdf-selection-save"><Save className="h-3.5 w-3.5" /> Save note</button></div>
          </div>}
          {selectionPanel === 'summary' && <div className="w-80 max-w-[calc(100vw-48px)] space-y-2">
            <div className="flex items-center justify-between gap-2"><strong className="text-xs flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> AI summary</strong><button type="button" onClick={() => setSelectionPanel('actions')} aria-label="Back to selection actions"><X className="h-4 w-4" /></button></div>
            {isSummarizing ? <p className="text-xs text-slate-500">Reading the selected passage…</p> : summaryError ? <p className="text-xs text-rose-600">{summaryError}</p> : <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{summary}</p>}
            {!isSummarizing && !summaryError && summary && <button type="button" onClick={() => { setSelectionPanel(null); setSelectedText(null); window.getSelection()?.removeAllRanges(); }} className="pdf-selection-save">Done</button>}
            {summaryError && <button type="button" onClick={handleSummarizeSelection} className="pdf-selection-save">Try again</button>}
          </div>}
        </div>
      )}

      {showNotes && <aside className="pdf-notes-panel" aria-label="Saved PDF notes">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h3 className="text-sm font-bold text-slate-900">Your notes</h3><p className="text-[11px] text-slate-500">{notes.length} saved for this PDF</p></div><button type="button" onClick={() => setShowNotes(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close notes"><X className="h-4 w-4" /></button></div>
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {notes.length === 0 ? <div className="py-10 text-center text-xs text-slate-400">No notes yet. Select text and choose Add note.</div> : notes.map(note => <article key={note.id} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wide text-sky-700">Page {note.pageNumber}</span><button type="button" onClick={() => db.notes.delete(note.id)} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete note"><Trash2 className="h-3.5 w-3.5" /></button></div>
            <p className="mb-2 border-l-2 border-sky-300 pl-2 text-[11px] italic text-slate-500">{note.selectedText}</p><p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">{note.noteText}</p>
          </article>)}
        </div>
      </aside>}

      {/* Modals */}
      <FinishReviewModal
        isOpen={showFinishModal}
        totalPages={totalPages}
        visitedPages={visitedPages}
        alreadyStudiedPages={studiedPages}
        sessionDurationSeconds={timerSeconds}
        onConfirm={handleConfirmPages}
        onCancel={() => setShowFinishModal(false)}
      />

      <ResumePositionModal
        isOpen={showResumeModal}
        lastPosition={Math.min(Math.max(1, pdfDoc.lastPositionPage || 1), totalPages)}
        earliestUnread={(() => {
          const s = new Set(pdfDoc.studiedPages || []);
          for (let i = 1; i <= totalPages; i++) {
            if (!s.has(i)) return i;
          }
          return 1;
        })()}
        onResumeLast={() => {
          navigateToPage(Math.min(Math.max(1, pdfDoc.lastPositionPage || 1), totalPages));
          setShowResumeModal(false);
        }}
        onResumeEarliest={() => {
          const s = new Set(pdfDoc.studiedPages || []);
          let earliest = 1;
          for (let i = 1; i <= totalPages; i++) {
            if (!s.has(i)) {
              earliest = i;
              break;
            }
          }
          navigateToPage(earliest);
          setShowResumeModal(false);
        }}
      />
    </div>
  );
};
