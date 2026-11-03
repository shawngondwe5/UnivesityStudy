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
  Trash2,
  Search,
  RotateCw,
  Download,
  Printer,
  Bookmark,
  BookOpen,
  MoreHorizontal,
  Copy,
  Pin,
  Bold,
  Italic,
  Underline,
  List,
} from 'lucide-react';
// Use PDF.js's own viewer engine for virtualized page rendering, text layers,
// selection, find highlighting, link navigation, and page/zoom management.
// @ts-ignore - pdfjs-dist 3.x ships the viewer bundle without complete TS declarations.
import { EventBus, PDFViewer, PDFLinkService, PDFFindController, ScrollMode } from 'pdfjs-dist/legacy/web/pdf_viewer';
import type { PDFDocument, StudySession, SessionType, AppSettings, StudyNote } from '../../types';
import { db } from '../../db';
import { formatTimer, getDateKey } from '../../utils/calculations';
import { useInactivity } from '../../hooks/useInactivity';
import { FinishReviewModal } from './FinishReviewModal';
import { ResumePositionModal } from './ResumePositionModal';

// Set offline local worker bundle, with fallback
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
} catch (e) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

const stripAiFormatting = (value: string) => value.replace(/```[\s\S]*?```/g, block => block.replace(/^```[^\n]*\n?|```$/g, '')).replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1').replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*\*\s+/gm, '• ').replace(/^\s*-\s+/gm, '• ').trim();
const HIGHLIGHT_COLORS: Record<string, string> = { yellow: 'rgba(255,214,10,.48)', green: 'rgba(52,211,153,.42)', pink: 'rgba(244,114,182,.40)', blue: 'rgba(96,165,250,.42)', orange: 'rgba(249,115,22,.48)' };

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
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.ceil(viewport.width * outputScale);
        canvas.height = Math.ceil(viewport.height * outputScale);
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        const context = canvas.getContext('2d');
        if (!context) return;
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
        });
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
  const [zoomMode, setZoomMode] = useState('page-width');
  const [readingMode, setReadingMode] = useState<'single' | 'continuous'>(settings.defaultReadingMode || 'single');
  const [isPagePanelOpen, setIsPagePanelOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'pages' | 'outline'>('pages');
  const [outline, setOutline] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState({ current: 0, total: 0 });
  const [pageInput, setPageInput] = useState(String(pdfDoc.lastPositionPage || 1));
  const [rotation, setRotation] = useState(0);

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
  const [selectedText, setSelectedText] = useState<{ text: string; pageNumber: number; top: number; left: number; rects: { x: number; y: number; w: number; h: number }[] } | null>(null);
  const [selectionPanel, setSelectionPanel] = useState<'actions' | 'note' | 'summary' | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [summary, setSummary] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [noteColor, setNoteColor] = useState<'yellow' | 'green' | 'pink' | 'blue' | 'orange'>('yellow');
  const [activeNotePopup, setActiveNotePopup] = useState<{ noteId: string; x: number; y: number; pinned: boolean } | null>(null);
  const [noteEditDraft, setNoteEditDraft] = useState('');
  const [showMoreTools, setShowMoreTools] = useState(false);
  const notes = useLiveQuery(async () => {
    const saved = await db.notes.where('pdfId').equals(pdfDoc.id).toArray();
    return saved.sort((a, b) => b.createdAt - a.createdAt);
  }, [pdfDoc.id]) || [];

  const readerRootRef = useRef<HTMLDivElement | null>(null);
  const mainScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pdfViewerElementRef = useRef<HTMLDivElement | null>(null);
  const pdfViewerRef = useRef<any>(null);
  const pdfLinkServiceRef = useRef<any>(null);
  const pdfFindControllerRef = useRef<any>(null);
  const pdfEventBusRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const activeThumbnailRef = useRef<HTMLButtonElement | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const popupDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const openNotePopup = (noteId: string) => {
    let saved = { x: Math.max(12, window.innerWidth - 410), y: 112 };
    try { const raw = window.localStorage.getItem(`pdf-note-popup:${pdfDoc.id}`); if (raw) saved = { ...saved, ...JSON.parse(raw) }; } catch { /* Ignore invalid saved positions. */ }
    setActiveNotePopup({ noteId, x: Math.max(12, Math.min(window.innerWidth - Math.min(390, window.innerWidth - 24) - 12, saved.x)), y: Math.max(12, Math.min(window.innerHeight - Math.min(620, window.innerHeight - 24) - 12, saved.y)), pinned: false });
    setNoteEditDraft(notes.find(item => item.id === noteId)?.noteText || '');
  };
  useEffect(() => {
    if (!activeNotePopup) return;
    const move = (event: PointerEvent) => { const drag = popupDragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const width = Math.min(390, window.innerWidth - 24); const x = Math.max(12, Math.min(window.innerWidth - width - 12, event.clientX - drag.offsetX)); const popupHeight = Math.min(620, window.innerHeight - 24); const y = Math.max(12, Math.min(window.innerHeight - popupHeight - 12, event.clientY - drag.offsetY)); setActiveNotePopup(current => current ? { ...current, x, y } : current); window.localStorage.setItem(`pdf-note-popup:${pdfDoc.id}`, JSON.stringify({ x, y })); };
    const up = () => { popupDragRef.current = null; };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setActiveNotePopup(null); };
    const outside = (event: PointerEvent) => { if (!activeNotePopup.pinned && event.target instanceof Element && !event.target.closest('.pdf-note-popup')) setActiveNotePopup(null); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('keydown', key); document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', key); document.removeEventListener('pointerdown', outside); };
  }, [activeNotePopup?.noteId, activeNotePopup?.pinned, pdfDoc.id]);
  useEffect(() => { const note = notes.find(item => item.id === activeNotePopup?.noteId); if (note) setNoteEditDraft(note.noteText || ''); }, [activeNotePopup?.noteId, notes]);
  const saveNoteEdit = async () => { if (activeNotePopup) await db.notes.update(activeNotePopup.noteId, { noteText: noteEditDraft, updatedAt: Date.now() }); };
  const insertNoteFormatting = (before: string, after = before) => { const area = document.querySelector<HTMLTextAreaElement>('.pdf-note-edit'); if (!area) return; const start = area.selectionStart, end = area.selectionEnd; setNoteEditDraft(noteEditDraft.slice(0,start) + before + noteEditDraft.slice(start,end) + after + noteEditDraft.slice(end)); requestAnimationFrame(() => { area.focus(); area.setSelectionRange(start + before.length, end + before.length); }); };

  // Keep the floating actions attached to real text selected in the PDF.js layer.
  useEffect(() => {
    const root = readerRootRef.current;
    if (!root) return;
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';
      if (!selection || selection.isCollapsed || !text) {
        if (!selectionPanel || selectionPanel === 'actions') {
          setSelectedText(null);
          setSelectionPanel(null);
        }
        return;
      }
      const anchor = selection.anchorNode;
      const textLayer = anchor instanceof Element ? anchor.closest('.textLayer') : anchor?.parentElement?.closest('.textLayer');
      if (!textLayer || !root.contains(textLayer)) return;
      const range = selection.getRangeAt(0); const rect = range.getBoundingClientRect();
      const pageElement = textLayer.closest<HTMLElement>('.page[data-page-number]'); const pageNumber = Number(pageElement?.dataset.pageNumber || currentPage);
      const viewport = pdfViewerRef.current?.getPageView(pageNumber - 1)?.viewport; const pageRect = pageElement?.getBoundingClientRect();
      const rects = viewport && pageRect ? Array.from(range.getClientRects()).map(r => { const sx = viewport.width / pageRect.width, sy = viewport.height / pageRect.height; const a = viewport.convertToPdfPoint((r.left-pageRect.left)*sx,(r.top-pageRect.top)*sy); const b = viewport.convertToPdfPoint((r.right-pageRect.left)*sx,(r.bottom-pageRect.top)*sy); return { x: Math.min(a[0],b[0]), y: Math.min(a[1],b[1]), w: Math.abs(b[0]-a[0]), h: Math.abs(b[1]-a[1]) }; }).filter(r => r.w > 0 && r.h > 0) : [];
      setSelectedText({ text: text.slice(0, 12000), pageNumber, top: rect.top, left: rect.left, rects });
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
    const note: StudyNote = { id: crypto.randomUUID(), pdfId: pdfDoc.id, pageNumber: selectedText.pageNumber, selectedText: selectedText.text, noteText: noteDraft.trim(), highlight: { color: noteColor, rects: selectedText.rects }, createdAt: now, updatedAt: now };
    await db.notes.add(note);
    setNoteDraft('');
    setSelectionPanel(null);
    openNotePopup(note.id);
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
      const response = await fetch('/api/ai/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: selectedText.text, pageNumber: selectedText.pageNumber, documentName: pdfDoc.filename, mode: 'explain' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The summary could not be generated.');
      const explanation = stripAiFormatting(typeof data.summary === 'string' ? data.summary : ''); setSummary(explanation);
      const now = Date.now(); const note: StudyNote = { id: crypto.randomUUID(), pdfId: pdfDoc.id, pageNumber: selectedText.pageNumber, selectedText: selectedText.text, noteText: '', aiExplanation: explanation, highlight: { color: noteColor, rects: selectedText.rects }, createdAt: now, updatedAt: now };
      await db.notes.add(note); setActiveNotePopup({ noteId: note.id, x: Math.max(12, window.innerWidth - 410), y: 112, pinned: false }); setSelectionPanel(null); setSelectedText(null); window.getSelection()?.removeAllRanges();
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

  // Delegate page layout, visible-page virtualization, progressive rendering,
  // text selection, find highlighting, links, and page caching to PDF.js's
  // maintained viewer implementation (the same viewer layer used by Firefox).
  useEffect(() => {
    const container = mainScrollContainerRef.current;
    const viewerElement = pdfViewerElementRef.current;
    if (!pdfProxy || !container || !viewerElement) return;

    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ eventBus, linkService });
    const viewer = new PDFViewer({
      container,
      viewer: viewerElement,
      eventBus,
      linkService,
      findController,
      textLayerMode: 1,
      removePageBorders: true,
      maxCanvasPixels: 16777216
    });

    pdfViewerRef.current = viewer;
    pdfLinkServiceRef.current = linkService;
    pdfFindControllerRef.current = findController;
    pdfEventBusRef.current = eventBus;

    const onPageChanging = (event: any) => {
      const page = Number(event.pageNumber);
      if (!Number.isFinite(page) || page < 1) return;
      setCurrentPage(page);
      setPageInput(String(page));
      handlePageChange(page);
      if (!isTimerRunning) {
        setIsTimerRunning(true);
        setShowInactivityNotice(false);
      }
    };
    const onScaleChanging = (event: any) => {
      if (Number.isFinite(event.scale)) setScale(event.scale);
      setZoomMode(event.presetValue ? String(event.presetValue) : 'custom');
    };
    const onFindMatches = (event: any) => {
      const count = event.matchesCount || {};
      setSearchMatches({ current: count.current || 0, total: count.total || 0 });
    };

    eventBus.on('pagechanging', onPageChanging);
    eventBus.on('scalechanging', onScaleChanging);
    eventBus.on('updatefindmatchescount', onFindMatches);

    viewer.setDocument(pdfProxy);
    linkService.setDocument(pdfProxy, null);

    const initializeView = () => {
      viewer.currentScaleValue = 'page-width';
      viewer.currentPageNumber = Math.min(Math.max(1, currentPage), pdfProxy.numPages);
      viewer.scrollMode = readingMode === 'single' ? ScrollMode.PAGE : ScrollMode.VERTICAL;
    };
    eventBus.on('pagesinit', initializeView);

    pdfProxy.getOutline().then(items => {
      setOutline(items || []);
    }).catch(error => console.warn('Could not read PDF bookmarks:', error));

    return () => {
      eventBus.off('pagechanging', onPageChanging);
      eventBus.off('scalechanging', onScaleChanging);
      eventBus.off('updatefindmatchescount', onFindMatches);
      eventBus.off('pagesinit', initializeView);
      viewer.setDocument(null as any);
      linkService.setDocument(null as any, null);
      viewer.cleanup();
      pdfViewerRef.current = null;
      pdfLinkServiceRef.current = null;
      pdfFindControllerRef.current = null;
      pdfEventBusRef.current = null;
    };
  // Viewer is created once for each loaded PDF. Page/mode updates are handled below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfProxy, handlePageChange]);

  // Paint saved highlights in PDF page coordinates, converting through each live viewport.
  useEffect(() => {
    const host = pdfViewerElementRef.current; if (!host || !pdfProxy) return; let frame = 0;
    const render = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
      host.querySelectorAll('.pdf-note-highlight-layer').forEach(node => node.remove());
      host.querySelectorAll<HTMLElement>('.page[data-page-number]').forEach(page => {
        const pageNumber = Number(page.dataset.pageNumber); const pageNotes = notes.filter(note => note.pageNumber === pageNumber && note.highlight?.rects?.length); if (!pageNotes.length) return;
        const viewport = pdfViewerRef.current?.getPageView(pageNumber - 1)?.viewport; if (!viewport) return;
        const layer = document.createElement('div'); layer.className = 'pdf-note-highlight-layer'; page.appendChild(layer);
        pageNotes.forEach(note => note.highlight?.rects.forEach(rect => {
          const bounds = viewport.convertToViewportRectangle([rect.x,rect.y,rect.x+rect.w,rect.y+rect.h]); const button = document.createElement('button'); button.type='button'; button.className='pdf-note-highlight';
          button.style.left=`${Math.min(bounds[0],bounds[2])}px`; button.style.top=`${Math.min(bounds[1],bounds[3])}px`; button.style.width=`${Math.max(3,Math.abs(bounds[2]-bounds[0]))}px`; button.style.height=`${Math.max(5,Math.abs(bounds[3]-bounds[1]))}px`; button.style.background=HIGHLIGHT_COLORS[note.highlight?.color || 'yellow']; button.setAttribute('aria-label',`Open note for page ${pageNumber}`); button.title=`Open note · Page ${pageNumber}`;
          button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openNotePopup(note.id);}); layer.appendChild(button);
        }));
      });
    }); };
    const bus=pdfEventBusRef.current; bus?.on('pagerendered',render); bus?.on('textlayerrendered',render); bus?.on('scalechanging',render); bus?.on('rotationchanging',render);
    const observer=new MutationObserver(render); observer.observe(host,{childList:true}); render();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();bus?.off('pagerendered',render);bus?.off('textlayerrendered',render);bus?.off('scalechanging',render);bus?.off('rotationchanging',render);host.querySelectorAll('.pdf-note-highlight-layer').forEach(node=>node.remove());};
  }, [notes,pdfProxy,scale,rotation]);

  // Keep the built-in PDF.js viewer's scroll mode in sync with the study preference.
  useEffect(() => {
    const viewer = pdfViewerRef.current;
    if (!viewer || !pdfProxy) return;
    viewer.scrollMode = readingMode === 'single' ? ScrollMode.PAGE : ScrollMode.VERTICAL;
    viewer.currentPageNumber = currentPage;
  }, [readingMode, pdfProxy]);

  // PDF.js emits pagechanging only when the active page changes; this avoids
  // scanning every page element on every scroll event.


  // Keyboard navigation for page turning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showFinishModal || showResumeModal || ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
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
    const viewer = pdfViewerRef.current;
    if (viewer) viewer.currentPageNumber = pageNum;
    setCurrentPage(pageNum);
    setPageInput(String(pageNum));
    handlePageChange(pageNum);

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

  const handleSearch = (query: string, again = false, previous = false) => {
    setSearchQuery(query);
    const eventBus = pdfEventBusRef.current;
    if (!query.trim()) {
      setSearchMatches({ current: 0, total: 0 });
      eventBus?.dispatch('find', { source: readerRootRef.current, type: '', query: '' });
      return;
    }
    if (!again) setSearchMatches({ current: 0, total: 0 });
    eventBus?.dispatch('find', {
      source: readerRootRef.current,
      type: again ? 'again' : '',
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false
    });
  };

  const goToOutlineItem = (item: any) => {
    const linkService = pdfLinkServiceRef.current;
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    } else if (item.dest && linkService) {
      linkService.goToDestination(item.dest);
    }
  };

  const renderOutlineItems = (items: any[], depth = 0): React.ReactNode => items.map((item: any, index: number) => (
    <React.Fragment key={`${depth}-${index}-${item.title}`}>
      <button
        type="button"
        onClick={() => goToOutlineItem(item)}
        style={{ paddingLeft: 8 + depth * 14 }}
        className="mb-1 flex w-full items-start gap-2 rounded-lg py-2 pr-2 text-left text-xs leading-relaxed text-slate-700 hover:bg-sky-50 hover:text-sky-700"
      >
        <Bookmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>{item.title}</span>
      </button>
      {item.items?.length > 0 && renderOutlineItems(item.items, depth + 1)}
    </React.Fragment>
  ));

  const downloadPdf = () => {
    const url = URL.createObjectURL(pdfDoc.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = pdfDoc.filename || 'document.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const printPdf = () => {
    // Opening the original PDF lets the browser's native PDF print pipeline
    // handle page sizing, vector output, and large documents.
    const url = URL.createObjectURL(pdfDoc.blob);
    const printWindow = window.open(url, '_blank');
    if (printWindow) {
      printWindow.opener = null;
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      URL.revokeObjectURL(url);
    }
  };

  const setViewerZoom = (value: string) => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    viewer.currentScaleValue = value;
    setZoomMode(value);
  };

  const rotatePdf = () => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    const nextRotation = (viewer.pagesRotation + 90) % 360;
    viewer.pagesRotation = nextRotation;
    setRotation(nextRotation);
  };

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
      <header className="pdf-reader-header flex items-center justify-between px-3 py-2 border-b">
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
        <div className="pdf-reader-toolbar flex items-center gap-2 px-2 py-1 rounded-xl border">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isTimerRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span className="font-mono text-sm font-bold tracking-wider text-slate-900">
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
              <span>Resume</span>
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
          <button type="button" onClick={() => { setSearchOpen(open => !open); if (!searchOpen) window.setTimeout(() => searchInputRef.current?.focus(), 0); }} className="pdf-reader-control flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-sky-50" aria-label="Find in document" title="Find in document">
            <Search className="h-4 w-4" /><span className="hidden sm:inline">Find</span>
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
          <select
            aria-label="PDF zoom level"
            value={zoomMode}
            onChange={event => setViewerZoom(event.target.value)}
            className="pdf-reader-control rounded-xl border px-2 py-2 text-xs text-slate-600 outline-none"
          >
            <option value="auto">Automatic</option>
            <option value="page-width">Fit width</option>
            <option value="page-fit">Fit page</option>
            <option value="1">100%</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
            <option value="2">200%</option>
            <option value="custom" disabled>{Math.round(scale * 100)}%</option>
          </select>
          <div className="pdf-reader-control flex items-center rounded-xl p-1 border">
            <button
              type="button"
              onClick={() => pdfViewerRef.current?.decreaseScale()}
              aria-label="Zoom out"
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono px-2 text-slate-500">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              onClick={() => pdfViewerRef.current?.increaseScale()}
              aria-label="Zoom in"
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <div className="relative"><button type="button" onClick={() => setShowMoreTools(open => !open)} className="pdf-reader-control rounded-lg border p-1.5 text-slate-600 hover:bg-sky-50" aria-label="More PDF tools" aria-expanded={showMoreTools} title="More tools"><MoreHorizontal className="h-4 w-4" /></button>{showMoreTools && <div className="pdf-more-tools" role="menu"><button role="menuitem" type="button" onClick={rotatePdf} aria-label="Rotate PDF clockwise" title="Rotate PDF clockwise"><RotateCw />Rotate clockwise</button><button role="menuitem" type="button" onClick={downloadPdf} aria-label="Download PDF" title="Download PDF"><Download />Download PDF</button><button role="menuitem" type="button" onClick={printPdf} aria-label="Open PDF for printing" title="Print PDF"><Printer />Print PDF</button><button role="menuitem" type="button" onClick={handleToggleReadingMode} aria-label={readingMode === 'single' ? 'Switch to continuous scrolling' : 'Switch to single page'} title="Change reading mode"><BookOpen />{readingMode === 'single' ? 'Continuous scroll' : 'Single page'}</button></div>}</div>
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
          <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setSidebarTab('pages')} className={`rounded-lg px-2 py-1 font-semibold ${sidebarTab === 'pages' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}><BookOpen className="mr-1 inline h-3.5 w-3.5" />Pages</button>
              <button type="button" onClick={() => setSidebarTab('outline')} className={`rounded-lg px-2 py-1 font-semibold ${sidebarTab === 'outline' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}><Bookmark className="mr-1 inline h-3.5 w-3.5" />Contents</button>
            </div>
            <span className="text-sky-600 font-mono">{progressPercent}%</span>
          </div>
          {sidebarTab === 'pages' ? <div className="pdf-thumbnail-list flex-1 overflow-y-auto p-3 space-y-3">
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
          </div> : <nav className="flex-1 overflow-y-auto p-3" aria-label="Document contents">
            {outline.length === 0 ? <p className="px-2 py-6 text-center text-xs text-slate-400">This PDF does not contain a bookmarks outline.</p> : renderOutlineItems(outline)}
          </nav>}
        </aside>
        )}

        {/* Center Panel: PDF.js's maintained viewer handles page virtualization and text layers. */}
        <main className="pdf-reader-canvas min-w-0 flex-1 relative">
          <div ref={mainScrollContainerRef} className="pdfjs-viewer-container" aria-label="PDF pages">
            <div ref={pdfViewerElementRef} className="pdfViewer" />
          </div>

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
            <form className="flex items-center gap-1" onSubmit={event => { event.preventDefault(); const page = Number(pageInput); if (Number.isFinite(page)) navigateToPage(Math.min(totalPages, Math.max(1, page))); }}>
              <input
                aria-label="Current page number"
                type="number"
                min={1}
                max={totalPages}
                value={pageInput}
                onChange={event => setPageInput(event.target.value)}
                onBlur={() => setPageInput(String(currentPage))}
                className="w-12 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-center text-xs font-mono text-slate-700 outline-none focus:border-sky-400"
              />
              <span className="text-xs font-mono text-slate-500">/ {totalPages}</span>
            </form>
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
      {showNotes && <aside className="pdf-notes-panel" aria-label="Saved PDF notes">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h3 className="text-sm font-bold text-slate-900">Your notes</h3><p className="text-[11px] text-slate-500">{notes.length} saved for this PDF</p></div><button type="button" onClick={() => setShowNotes(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close notes"><X className="h-4 w-4" /></button></div>
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {notes.length === 0 ? <div className="py-10 text-center text-xs text-slate-400">No notes yet. Select text and choose Add note.</div> : notes.map(note => <article key={note.id} onClick={() => openNotePopup(note.id)} onKeyDown={event => { if (event.key === 'Enter') openNotePopup(note.id); }} role="button" tabIndex={0} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm cursor-pointer hover:border-sky-200">
            <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wide text-sky-700">Page {note.pageNumber}</span><button type="button" onClick={event => { event.stopPropagation(); if (window.confirm('Delete this note and its highlight?')) db.notes.delete(note.id); }} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete note"><Trash2 className="h-3.5 w-3.5" /></button></div>
            <p className="mb-2 border-l-2 border-sky-300 pl-2 text-[11px] italic text-slate-500">{note.selectedText}</p>{note.aiExplanation && <p className="ai-text whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{stripAiFormatting(note.aiExplanation)}</p>}<p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">{note.noteText}</p>
          </article>)}
        </div>
      </aside>}

      </div>

      {activeNotePopup && (() => { const note = notes.find(item => item.id === activeNotePopup.noteId); if (!note) return null; return <section className="pdf-note-popup" style={{ left: activeNotePopup.x, top: activeNotePopup.y }} aria-label={`Note for page ${note.pageNumber}`}>
        <header className="pdf-note-popup-header" onPointerDown={event => { if ((event.target as HTMLElement).closest('button')) return; const box = event.currentTarget.parentElement!.getBoundingClientRect(); popupDragRef.current = { pointerId: event.pointerId, offsetX: event.clientX-box.left, offsetY: event.clientY-box.top }; }}><div><strong>Study note</strong><span>Page {note.pageNumber}</span></div><div className="flex gap-1"><button type="button" onClick={() => setActiveNotePopup(current => current ? { ...current, pinned: !current.pinned } : current)} aria-label="Pin note popup"><Pin className={activeNotePopup.pinned ? 'fill-current' : ''} /></button><button type="button" onClick={() => setActiveNotePopup(null)} aria-label="Close note popup"><X /></button></div></header>
        <div className="pdf-note-popup-content"><p className="pdf-note-selected">{note.selectedText}</p>{note.aiExplanation && <div className="mb-3"><div className="mb-1 flex justify-between text-[11px] font-bold text-sky-700"><span>AI explanation</span><button type="button" onClick={async () => { const response=await fetch('/api/ai/summarize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:note.selectedText,pageNumber:note.pageNumber,documentName:pdfDoc.filename,mode:'explain'})}); const data=await response.json(); if(response.ok) await db.notes.update(note.id,{aiExplanation:stripAiFormatting(data.summary||''),updatedAt:Date.now()}); else window.alert(data.error||'Could not regenerate explanation.'); }} className="hover:underline">Regenerate</button></div><p className="ai-text whitespace-pre-wrap text-xs leading-relaxed">{stripAiFormatting(note.aiExplanation)}</p></div>}
        <div className="mb-2 flex gap-1 border-b border-slate-200 pb-2"><button type="button" title="Bold" onClick={() => insertNoteFormatting('**')}><Bold /></button><button type="button" title="Italic" onClick={() => insertNoteFormatting('_')}><Italic /></button><button type="button" title="Underline" onClick={() => insertNoteFormatting('<u>','</u>')}><Underline /></button><button type="button" title="Bullet list" onClick={() => insertNoteFormatting('\n• ','')}><List /></button></div><textarea className="pdf-note-edit" value={noteEditDraft} onChange={event => setNoteEditDraft(event.target.value)} placeholder="Write or edit your note…" rows={4} aria-label="Edit note text" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><label className="text-[11px]">Highlight <select value={note.highlight?.color || 'yellow'} onChange={event => db.notes.update(note.id,{highlight:{color:event.target.value as any,rects:note.highlight?.rects||[]},updatedAt:Date.now()})} className="ml-1 rounded border p-1"><option value="yellow">Yellow</option><option value="green">Green</option><option value="pink">Pink</option><option value="blue">Blue</option><option value="orange">Orange</option></select></label><div className="flex gap-1"><button type="button" onClick={() => navigator.clipboard?.writeText(`${note.selectedText}\n\n${noteEditDraft}\n\n${note.aiExplanation||''}`)} aria-label="Copy note text"><Copy /></button><button type="button" onClick={() => navigateToPage(note.pageNumber)} aria-label="Jump to page"><BookOpen /></button><button type="button" onClick={saveNoteEdit} className="pdf-note-save">Save</button><button type="button" onClick={async () => { if(window.confirm('Delete this note and its highlight?')) { await db.notes.delete(note.id); setActiveNotePopup(null); } }} aria-label="Delete note"><Trash2 /></button></div></div><p className="mt-2 text-[10px] text-slate-400">Created {new Date(note.createdAt).toLocaleString()} · Updated {new Date(note.updatedAt).toLocaleString()}</p></div></section>; })()}

      {searchOpen && (
        <div className="pdf-find-bar" role="search" aria-label="Find in PDF">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={event => handleSearch(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); handleSearch(searchQuery, true, event.shiftKey); }
              if (event.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); pdfFindControllerRef.current?.executeCommand('find', { query: '' }); }
            }}
            placeholder="Find in document"
            aria-label="Search text in PDF"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
          <span className="whitespace-nowrap text-[11px] text-slate-500">{searchMatches.total ? `${searchMatches.current} of ${searchMatches.total}` : searchQuery ? 'No matches yet' : ''}</span>
          <button type="button" onClick={() => handleSearch(searchQuery, true, true)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Previous match"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => handleSearch(searchQuery, true, false)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Next match"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchMatches({ current: 0, total: 0 }); pdfFindControllerRef.current?.executeCommand('find', { query: '' }); }} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close search"><X className="h-4 w-4" /></button>
        </div>
      )}

      {selectedText && selectionPanel && (
        <div className="pdf-selection-popover" style={{ top: Math.max(12, selectedText.top - 58), left: Math.max(12, Math.min(selectedText.left, window.innerWidth - 290)) }} aria-label="Selected text actions">
          {selectionPanel === 'actions' && <div className="flex items-center gap-1" onMouseDown={event => event.preventDefault()}>
            <button type="button" onClick={() => { setNoteDraft(''); setSelectionPanel('note'); }} className="pdf-selection-action"><StickyNote className="h-4 w-4" /><span>Add note</span></button>
            <button type="button" onClick={handleSummarizeSelection} className="pdf-selection-action pdf-selection-ai"><Sparkles className="h-4 w-4" /><span>Explain simply</span></button>
            <button type="button" onClick={() => { setSelectionPanel(null); setSelectedText(null); }} className="pdf-selection-close" aria-label="Hide selection actions" title="Hide"><X className="h-4 w-4" /></button>
          </div>}
          {selectionPanel === 'note' && <div className="w-72 space-y-2">
            <div className="flex items-center justify-between gap-2"><strong className="text-xs">Quick note · Page {selectedText.pageNumber}</strong><button type="button" onClick={() => setSelectionPanel('actions')} aria-label="Back to selection actions"><X className="h-4 w-4" /></button></div>
            <p className="pdf-selection-quote">“{selectedText.text.slice(0, 180)}{selectedText.text.length > 180 ? '…' : ''}”</p>
            <textarea autoFocus rows={3} maxLength={500} value={noteDraft} onChange={event => setNoteDraft(event.target.value)} placeholder="Write a short note about this passage…" className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-sky-400" />
            <div className="flex items-center justify-between gap-2"><label className="text-[10px] text-slate-500">Highlight <select value={noteColor} onChange={event => setNoteColor(event.target.value as typeof noteColor)} className="ml-1 rounded border border-slate-200 bg-white p-1 text-[10px]"><option value="yellow">Yellow</option><option value="green">Green</option><option value="pink">Pink</option><option value="blue">Blue</option><option value="orange">Orange</option></select></label><button type="button" onClick={handleSaveSelectedNote} disabled={!noteDraft.trim()} className="pdf-selection-save"><Save className="h-3.5 w-3.5" /> Save note</button></div>
          </div>}
          {selectionPanel === 'summary' && <div className="w-80 max-w-[calc(100vw-48px)] space-y-2">
            <div className="flex items-center justify-between gap-2"><strong className="text-xs flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> AI explanation</strong><button type="button" onClick={() => setSelectionPanel('actions')} aria-label="Back to selection actions"><X className="h-4 w-4" /></button></div>
            {isSummarizing ? <p className="text-xs text-slate-500">Reading the selected passage…</p> : summaryError ? <p className="text-xs text-rose-600">{summaryError}</p> : <p className="ai-text whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{stripAiFormatting(summary)}</p>}
            {!isSummarizing && !summaryError && summary && <button type="button" onClick={() => { setSelectionPanel(null); setSelectedText(null); window.getSelection()?.removeAllRanges(); }} className="pdf-selection-save">Done</button>}
            {summaryError && <button type="button" onClick={handleSummarizeSelection} className="pdf-selection-save">Try again</button>}
          </div>}
        </div>
      )}

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
