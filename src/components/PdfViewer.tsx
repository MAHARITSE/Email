import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Search,
  Loader2,
  Scan,
  ExternalLink,
  Download,
  Lock,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// Configure le worker pdf.js (asset servi par Vite, same-origin : fonctionne en dev et en build)
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PDFJS_VERSION = '4.10.38';

/** Élément texte renvoyé par page.getTextContent() (sous-ensemble utile). */
interface PdfTextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
  hasEOL?: boolean;
}

/** Rectangle de surlignage, en pixels CSS (échelle appliquée). */
interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PdfViewerProps {
  /** Buffer du PDF. Une copie est effectuée en interne (pdf.js détache le buffer transmis). */
  arrayBuffer: ArrayBuffer | null;
  blobUrl?: string | null;
  filename?: string;
  onDownload?: () => void;
}

/**
 * Regroupe les éléments texte par ligne (même baseline), cherche chaque occurrence
 * de la requête et renvoie, pour CHAQUE occurrence, la liste des rectangles
 * concernés (une occurrence peut s'étaler sur plusieurs éléments de texte).
 * L'ordre des occurrences correspond à celui de countMatches().
 */
function computeHighlights(
  items: PdfTextItem[],
  query: string,
  viewport: { transform: number[] },
  scale: number
): HighlightRect[][] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const occurrences: HighlightRect[][] = [];
  const lineItems: { item: PdfTextItem; offset: number }[] = [];
  let lineText = '';
  let lastBaseline: number | null = null;

  const flushLine = () => {
    if (!lineItems.length) {
      lineText = '';
      lastBaseline = null;
      return;
    }
    const hay = lineText.toLowerCase();
    let from = 0;
    while (true) {
      const idx = hay.indexOf(q, from);
      if (idx < 0) break;
      const matchStart = idx;
      const matchEnd = idx + q.length;
      from = idx + Math.max(1, q.length);

      const rects: HighlightRect[] = [];
      for (const { item, offset } of lineItems) {
        const itemStart = offset;
        const itemEnd = offset + item.str.length;
        if (itemEnd <= matchStart || itemStart >= matchEnd || !item.str.length) continue;

        const fracStart = Math.max(0, (matchStart - itemStart) / item.str.length);
        const fracEnd = Math.min(1, (matchEnd - itemStart) / item.str.length);

        // Transform en espace viewport (y vers le bas)
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontHeight =
          (item.height > 0 ? item.height : Math.hypot(tx[2], tx[3]) / (scale || 1)) * scale;
        const itemWidth = item.width * scale;
        const x = tx[4] + fracStart * itemWidth;
        const w = (fracEnd - fracStart) * itemWidth;
        const y = tx[5] - fontHeight * 0.85;
        const h = fontHeight * 1.05;

        if (w > 0) rects.push({ x, y, w, h });
      }
      if (rects.length) occurrences.push(rects);
    }
    lineItems.length = 0;
    lineText = '';
    lastBaseline = null;
  };

  for (const it of items) {
    const baseline = it.transform ? Math.round(it.transform[5]) : 0;
    if (lastBaseline !== null && baseline !== lastBaseline) {
      flushLine();
    }
    lastBaseline = baseline;
    lineItems.push({ item: it, offset: lineText.length });
    lineText += it.str;
    if (it.hasEOL) flushLine();
  }
  flushLine();

  return occurrences;
}

/** Compte les occurrences d'une requête dans une page (même logique de regroupement par ligne). */
function countMatches(items: PdfTextItem[], query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  let count = 0;
  let lineText = '';
  let lastBaseline: number | null = null;

  const flushLine = () => {
    const hay = lineText.toLowerCase();
    let from = 0;
    while (true) {
      const idx = hay.indexOf(q, from);
      if (idx < 0) break;
      count += 1;
      from = idx + Math.max(1, q.length);
    }
    lineText = '';
    lastBaseline = null;
  };

  for (const it of items) {
    const baseline = it.transform ? Math.round(it.transform[5]) : 0;
    if (lastBaseline !== null && baseline !== lastBaseline) flushLine();
    lastBaseline = baseline;
    lineText += it.str;
    if (it.hasEOL) flushLine();
  }
  flushLine();

  return count;
}

/* ------------------------------------------------------------------ */
/*  Page individuelle (rendu lazy piloté par IntersectionObserver)     */
/* ------------------------------------------------------------------ */

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  rotation: number;
  /** La page est-elle dans la fenêtre de rendu (visible ou adjacente) ? */
  visible: boolean;
  highlightQuery: string;
  /** Index local (0-based) de l'occurrence active sur cette page, sinon null. */
  activeLocalMatch: number | null;
  isDark: boolean;
  /** Dimensions prises en charge par le parent (permet un layout stable). */
  widthPx: number | null;
  heightPx: number | null;
  onBaseSize: (page: number, size: { w: number; h: number }) => void;
  getTextItems: (page: number) => Promise<PdfTextItem[]>;
}

const PdfPage: React.FC<PdfPageProps> = ({
  pdf,
  pageNumber,
  scale,
  rotation,
  visible,
  highlightQuery,
  activeLocalMatch,
  isDark,
  widthPx,
  heightPx,
  onBaseSize,
  getTextItems,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [rendered, setRendered] = useState(false);
  const [highlights, setHighlights] = useState<HighlightRect[][]>([]);
  const [renderError, setRenderError] = useState(false);

  const effectiveRotation = ((rotation % 360) + 360) % 360;

  // Dimensions de la page (échelle 1) pour un layout stable avant rendu
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const vp = page.getViewport({ scale: 1, rotation: effectiveRotation });
        onBaseSize(pageNumber, { w: vp.width, h: vp.height });
      } catch {
        /* géré par l'effet de rendu */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNumber, effectiveRotation]);

  // Rendu canvas (uniquement si la page est dans la fenêtre de rendu)
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!visible) {
      // Libère la mémoire du bitmap hors fenêtre de rendu
      if (canvas && canvas.width > 0) {
        canvas.width = 0;
        canvas.height = 0;
      }
      setRendered(false);
      return;
    }

    let cancelled = false;
    setRendered(false);

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        if (!canvas) return; // canvas capturé avant le return ci-dessus
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr, rotation: effectiveRotation });

        renderTaskRef.current?.cancel();
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) {
          setRendered(true);
          setRenderError(false);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`Erreur rendu page ${pageNumber}:`, err);
          if (!cancelled) setRenderError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel();
      } catch {
        /* noop */
      }
    };
  }, [pdf, pageNumber, scale, effectiveRotation, visible]);

  // Surlignage des résultats de recherche
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!visible || !highlightQuery.trim()) {
        setHighlights((prev) => (prev.length ? [] : prev));
        return;
      }
      try {
        const page = await pdf.getPage(pageNumber);
        const items = await getTextItems(pageNumber);
        if (cancelled) return;
        const vp = page.getViewport({ scale: 1, rotation: effectiveRotation });
        setHighlights(computeHighlights(items, highlightQuery, vp, scale));
      } catch {
        /* recherche best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, highlightQuery, scale, effectiveRotation, pageNumber, pdf, getTextItems]);

  return (
    <div
      data-page={pageNumber}
      className="relative"
      style={{ width: widthPx ? `${widthPx}px` : 'min(680px, 100%)', height: heightPx ? `${heightPx}px` : 320 }}
    >
      <div
        className={`relative h-full w-full overflow-hidden rounded-lg shadow-lg ${
          isDark ? 'ring-1 ring-slate-700/70' : 'ring-1 ring-slate-300/70'
        }`}
        style={{ background: isDark ? '#151a23' : '#f8fafc' }}
      >
        <div className="flex h-full w-full items-center justify-center">
          <canvas ref={canvasRef} className="block" />
        </div>

        {/* Calque de surlignage de recherche */}
        {highlights.length > 0 && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {highlights.map((group, gi) =>
              group.map((r, ri) => (
                <div
                  key={`${gi}-${ri}`}
                  className={`absolute rounded-sm ${
                    activeLocalMatch === gi
                      ? 'bg-orange-400/70 ring-1 ring-orange-500'
                      : 'bg-yellow-300/45'
                  }`}
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                />
              ))
            )}
          </div>
        )}

        {/* Squelette pendant le chargement / rendu */}
        {!rendered && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6">
            {renderError ? (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <span className="text-[11px] font-mono text-slate-400">
                  Page {pageNumber} non rendue
                </span>
              </>
            ) : (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                <span className="text-[11px] font-mono text-slate-400">Page {pageNumber}…</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Numéro de page sous l'aperçu */}
      <div className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2">
        <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {pageNumber}
        </span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*                        Viewer PDF complet                           */
/* ------------------------------------------------------------------ */

export const PdfViewer: React.FC<PdfViewerProps> = ({
  arrayBuffer,
  blobUrl,
  filename,
  onDownload,
}) => {
  const { isDark } = useTheme();

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loadKey, setLoadKey] = useState(0);

  const [scale, setScale] = useState(1.2);
  const [fitWidth, setFitWidth] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1, 2]));
  const [baseSizes, setBaseSizes] = useState<Record<number, { w: number; h: number }>>({});

  // Recherche
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCounts, setMatchCounts] = useState<number[]>([]);
  const [activeMatch, setActiveMatch] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const textCacheRef = useRef<Map<number, PdfTextItem[]>>(new Map());
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const intersectingRef = useRef<Set<number>>(new Set());
  const suppressScrollTrackingRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const totalMatches = useMemo(() => matchCounts.reduce((a, b) => a + b, 0), [matchCounts]);

  const cumulativeMatches = useMemo(() => {
    const cum: number[] = [0];
    for (let i = 0; i < matchCounts.length; i++) cum.push(cum[i] + matchCounts[i]);
    return cum;
  }, [matchCounts]);

  /* ------------------------- Chargement du document ------------------------- */
  useEffect(() => {
    if (!arrayBuffer) return;

    let cancelled = false;

    // Libère l'éventuel document précédent
    docRef.current?.destroy().catch(() => undefined);
    docRef.current = null;

    setLoadError(null);
    setNeedsPassword(false);
    setPasswordError(null);
    setProgress(0);
    setDoc(null);
    setNumPages(0);
    setMatchCounts([]);
    setActiveMatch(0);
    setCurrentPage(1);
    setBaseSizes({});
    setVisiblePages(new Set([1, 2]));
    intersectingRef.current = new Set();
    textCacheRef.current = new Map();
    pageRefs.current = new Map();

    // pdf.js transfère (détache) le buffer : on travaille sur une copie
    const data = arrayBuffer.slice(0);

    const task = pdfjsLib.getDocument({
      data,
      password: password || undefined,
      cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`,
      isEvalSupported: false,
    });

    task.onProgress = (pData: { loaded: number; total: number }) => {
      if (pData.total > 0 && !cancelled) {
        setProgress(Math.round((pData.loaded / pData.total) * 100));
      }
    };

    task.promise
      .then((pdf) => {
        if (cancelled) {
          pdf.destroy();
          return;
        }
        docRef.current = pdf;
        setDoc(pdf);
        setNumPages(pdf.numPages);
      })
      .catch((err: any) => {
        if (cancelled) return;
        if (err?.name === 'PasswordException') {
          setNeedsPassword(true);
          if (err?.code === 2) {
            setPasswordError('Mot de passe incorrect. Réessayez.');
          }
        } else if (err?.name === 'InvalidPDFException') {
          setLoadError('Ce fichier n\'est pas un PDF valide ou est corrompu.');
        } else if (err?.name === 'MissingPDFException') {
          setLoadError('Le document PDF est introuvable.');
        } else {
          setLoadError(err?.message || 'Impossible d\'ouvrir ce PDF.');
        }
      });

    return () => {
      cancelled = true;
      try {
        task.destroy();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrayBuffer, loadKey]);

  // Destruction du document au démontage
  useEffect(() => {
    return () => {
      docRef.current?.destroy().catch(() => undefined);
      docRef.current = null;
      observerRef.current?.disconnect();
    };
  }, []);

  /* ------------------------- Cache texte (recherche) ------------------------ */
  const getTextItems = useCallback(async (pageNumber: number): Promise<PdfTextItem[]> => {
    const cached = textCacheRef.current.get(pageNumber);
    if (cached) return cached;
    if (!docRef.current) return [];
    const page = await docRef.current.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = (content.items as unknown[]).filter(
      (it): it is PdfTextItem => typeof (it as PdfTextItem).str === 'string'
    );
    textCacheRef.current.set(pageNumber, items);
    return items;
  }, []);

  /* ------------------------------ Recherche -------------------------------- */
  useEffect(() => {
    const q = searchInput.trim();
    const t = setTimeout(async () => {
      setSearchQuery(q);
      setActiveMatch(0);
      if (!q || !docRef.current) {
        setMatchCounts([]);
        return;
      }
      try {
        const counts: number[] = [];
        for (let p = 1; p <= docRef.current.numPages; p++) {
          const items = await getTextItems(p);
          counts.push(countMatches(items, q));
        }
        setMatchCounts(counts);
      } catch {
        setMatchCounts([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, getTextItems]);

  const pageOfMatch = useCallback(
    (globalIdx: number): number => {
      for (let p = 1; p < cumulativeMatches.length; p++) {
        if (globalIdx < cumulativeMatches[p]) return p;
      }
      return 1;
    },
    [cumulativeMatches]
  );

  const scrollToPage = useCallback((page: number) => {
    const el = pageRefs.current.get(page);
    const container = scrollRef.current;
    if (!el || !container) return;
    suppressScrollTrackingRef.current = Date.now() + 600;
    container.scrollTo({ top: Math.max(0, el.offsetTop - 12), behavior: 'smooth' });
  }, []);

  const goMatch = useCallback(
    (dir: 1 | -1) => {
      if (!totalMatches) return;
      const next = (activeMatch + dir + totalMatches) % totalMatches;
      setActiveMatch(next);
      scrollToPage(pageOfMatch(next));
    },
    [activeMatch, totalMatches, pageOfMatch, scrollToPage]
  );

  /* --------------------------- Pages visibles (IO) -------------------------- */
  const attachObserver = useCallback(() => {
    const container = scrollRef.current;
    if (!container || !observerRef.current) return;
    container.querySelectorAll<HTMLElement>('[data-page]').forEach((t) => {
      observerRef.current?.observe(t);
    });
  }, []);

  useEffect(() => {
    if (!doc || !numPages) return;
    const container = scrollRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Met à jour l'état d'intersection, puis dérive la fenêtre de rendu
        // (pages visibles ± 1) : les pages éloignées libèrent leur bitmap.
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (!page) continue;
          if (entry.isIntersecting) intersectingRef.current.add(page);
          else intersectingRef.current.delete(page);
        }

        const keep = new Set<number>();
        intersectingRef.current.forEach((p) => {
          for (let q = Math.max(1, p - 1); q <= Math.min(numPages, p + 1); q++) keep.add(q);
        });
        if (keep.size === 0) return; // transition transitoire

        setVisiblePages((prev) => {
          if (prev.size === keep.size && [...keep].every((p) => prev.has(p))) return prev;
          return keep;
        });
      },
      { root: container, rootMargin: '120% 0px 120% 0px' }
    );

    observerRef.current = observer;
    attachObserver();

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [doc, numPages, attachObserver]);

  // Observe les pages dont le layout vient d'être résolu
  useEffect(() => {
    if (!doc || !numPages) return;
    attachObserver();
  }, [doc, numPages, baseSizes, attachObserver]);

  /* ------------------------ Suivi de la page courante ----------------------- */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !numPages) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (Date.now() < suppressScrollTrackingRef.current) return;
        const mid = container.scrollTop + container.clientHeight / 2;
        let current = 1;
        for (let p = 1; p <= numPages; p++) {
          const el = pageRefs.current.get(p);
          if (!el) continue;
          if (el.offsetTop <= mid) current = p;
          else break;
        }
        setCurrentPage((prev) => (prev === current ? prev : current));
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [numPages]);

  /* ------------------------------ Ajuster largeur --------------------------- */
  const computeFitScale = useCallback(() => {
    const container = scrollRef.current;
    if (!container || !numPages) return null;
    const first = baseSizes[1];
    if (!first) return null;
    const avail = container.clientWidth - 32;
    if (avail <= 0 || first.w <= 0) return null;
    const rot = rotation % 180 !== 0;
    const w = rot ? first.h : first.w;
    return avail / w;
  }, [baseSizes, numPages, rotation]);

  useEffect(() => {
    if (!fitWidth) return;
    const s = computeFitScale();
    if (s && Math.abs(s - scaleRef.current) > 0.01) setScale(s);
  }, [fitWidth, computeFitScale, rotation, numPages]);

  useEffect(() => {
    if (!fitWidth) return;
    const container = scrollRef.current;
    if (!container) return;
    let raf = 0;
    const onResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const s = computeFitScale();
        if (s && Math.abs(s - scaleRef.current) > 0.01) setScale(s);
      });
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fitWidth, computeFitScale]);

  /* --------------------------- Raccourcis clavier --------------------------- */
  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(numPages || 1, page));
      setCurrentPage(clamped);
      scrollToPage(clamped);
    },
    [numPages, scrollToPage]
  );

  const zoomIn = useCallback(() => {
    setFitWidth(false);
    setScale((s) => Math.min(4, +(s + 0.2).toFixed(2)));
  }, []);

  const zoomOut = useCallback(() => {
    setFitWidth(false);
    setScale((s) => Math.max(0.3, +(s - 0.2).toFixed(2)));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = !!target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (inInput) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goToPage(Math.min(numPages, currentPage + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goToPage(Math.max(1, currentPage - 1));
      } else if (e.key === '+' || e.key === '=') {
        zoomIn();
      } else if (e.key === '-') {
        zoomOut();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [numPages, currentPage, goToPage, zoomIn, zoomOut]);

  /* --------------------------------- Actions -------------------------------- */
  const handleBaseSize = useCallback((page: number, size: { w: number; h: number }) => {
    setBaseSizes((prev) =>
      prev[page]?.w === size.w && prev[page]?.h === size.h ? prev : { ...prev, [page]: size }
    );
  }, []);

  const toolbarBtn = `p-1.5 rounded-lg transition ${
    isDark
      ? 'text-slate-300 hover:text-white hover:bg-slate-700/70'
      : 'text-slate-600 hover:text-black hover:bg-slate-200'
  }`;

  /* --------------------------------- Rendus --------------------------------- */
  const activeMatchPage = activeMatch < totalMatches ? pageOfMatch(activeMatch) : -1;
  const activeLocalMatchFor = (page: number): number | null => {
    if (!searchQuery || page !== activeMatchPage || activeMatch < 0) return null;
    return activeMatch - cumulativeMatches[page - 1];
  };

  // ------- Aucune donnée -------
  if (!arrayBuffer) {
    if (!blobUrl) return null;
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div
          className={`w-full max-w-md rounded-2xl border p-6 text-center ${
            isDark ? 'border-slate-700 bg-[#0E131F]' : 'border-slate-200 bg-white'
          }`}
        >
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <p className="mb-4 text-sm font-semibold">
            Les données du PDF n'ont pas pu être chargées pour l'affichage intégré.
          </p>
          <div className="flex items-center justify-center gap-3">
            <a
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ouvrir dans un onglet
            </a>
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-600"
              >
                <Download className="h-3.5 w-3.5" />
                Télécharger
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ------- PDF protégé par mot de passe -------
  if (needsPassword) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div
          className={`w-full max-w-sm rounded-2xl border p-6 text-center ${
            isDark ? 'border-slate-700 bg-[#0E131F]' : 'border-slate-200 bg-white'
          }`}
        >
          <Lock className="mx-auto mb-3 h-8 w-8 text-amber-400" />
          <p className="mb-1 text-sm font-semibold">PDF protégé par mot de passe</p>
          <p className="mb-4 text-xs text-slate-400">
            Saisissez le mot de passe pour ouvrir ce document dans l'application.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setLoadKey((k) => k + 1);
            }}
            className="space-y-3"
          >
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
              }}
              placeholder="Mot de passe du document…"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-white focus:border-cyan-400'
                  : 'border-slate-300 bg-white text-slate-900 focus:border-cyan-600'
              }`}
            />
            {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
            <button
              type="submit"
              className="w-full rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-cyan-500"
            >
              Déverrouiller
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ------- Erreur de chargement -------
  if (loadError) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div
          className={`w-full max-w-md rounded-2xl border p-6 text-center ${
            isDark ? 'border-slate-700 bg-[#0E131F]' : 'border-slate-200 bg-white'
          }`}
        >
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <p className="mb-1 text-sm font-semibold">Impossible d'afficher ce PDF</p>
          <p className="mb-5 text-xs text-slate-400">{loadError}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setLoadKey((k) => k + 1)}
              className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-600"
            >
              Réessayer
            </button>
            {blobUrl && (
              <a
                href={blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ouvrir dans un onglet
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ------- Chargement en cours -------
  if (!doc) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        <p className="text-xs font-mono text-slate-400">
          {progress > 0 ? `Ouverture du PDF… ${progress}%` : 'Ouverture du PDF…'}
        </p>
      </div>
    );
  }

  // ------- Viewer principal -------
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Barre d'outils PDF */}
      <div
        className={`flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2 ${
          isDark ? 'border-slate-800 bg-[#0E131F]' : 'border-slate-200 bg-slate-50'
        }`}
      >
        {/* Navigation pages */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className={`${toolbarBtn} disabled:opacity-30`}
            title="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1 text-xs font-mono">
            <input
              type="number"
              min={1}
              max={numPages}
              value={currentPage}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isNaN(v)) goToPage(v);
              }}
              className={`w-12 rounded-md border px-1.5 py-1 text-center outline-none ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-white focus:border-cyan-400'
                  : 'border-slate-300 bg-white text-slate-900 focus:border-cyan-600'
              }`}
            />
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>/ {numPages}</span>
          </div>
          <button
            type="button"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            className={`${toolbarBtn} disabled:opacity-30`}
            title="Page suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className={`h-5 w-px ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

        {/* Zoom & rotation */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={zoomOut} className={toolbarBtn} title="Zoom arrière (-)">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center text-xs font-mono">
            {Math.round(scale * 100)}%
          </span>
          <button type="button" onClick={zoomIn} className={toolbarBtn} title="Zoom avant (+)">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setFitWidth((f) => !f)}
            className={`${toolbarBtn} ${fitWidth ? 'text-cyan-400' : ''}`}
            title="Ajuster à la largeur"
          >
            <Scan className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className={toolbarBtn}
            title="Pivoter 90°"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        <div className={`hidden h-5 w-px sm:block ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

        {/* Recherche dans le document */}
        <div className="flex min-w-[170px] flex-1 items-center sm:max-w-xs">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  goMatch(e.shiftKey ? -1 : 1);
                }
              }}
              placeholder="Rechercher dans le PDF… (Ctrl+F)"
              className={`w-full rounded-lg border py-1.5 pl-8 pr-2 text-xs outline-none transition ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-white placeholder-slate-500 focus:border-cyan-400'
                  : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-600'
              }`}
            />
          </div>
        </div>

        {searchQuery && (
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-slate-400">
              {totalMatches > 0 ? `${activeMatch + 1} / ${totalMatches}` : '0 résultat'}
            </span>
            <button
              type="button"
              onClick={() => goMatch(-1)}
              disabled={!totalMatches}
              className={`${toolbarBtn} disabled:opacity-30`}
              title="Occurrence précédente (Maj+Entrée)"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => goMatch(1)}
              disabled={!totalMatches}
              className={`${toolbarBtn} disabled:opacity-30`}
              title="Occurrence suivante (Entrée)"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {filename && (
            <span
              className={`hidden max-w-[180px] truncate text-[11px] font-mono lg:block ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}
              title={filename}
            >
              {filename}
            </span>
          )}
          {blobUrl && (
            <a
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={toolbarBtn}
              title="Ouvrir dans un nouvel onglet"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {onDownload && (
            <button type="button" onClick={onDownload} className={toolbarBtn} title="Télécharger">
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Zone de défilement des pages */}
      <div
        ref={scrollRef}
        className={`relative flex-1 overflow-auto overscroll-contain ${
          isDark ? 'bg-[#07090E]' : 'bg-slate-200/70'
        }`}
        style={{
          backgroundImage: isDark
            ? 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.08) 1px, transparent 0)'
            : 'radial-gradient(circle at 1px 1px, rgba(100,116,139,0.12) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      >
        <div className="relative flex w-max min-w-full flex-col items-center gap-8 p-4 pb-10">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => {
            const size = baseSizes[page];
            const widthPx = size ? Math.round(size.w * scale) : null;
            const heightPx = size ? Math.round(size.h * scale) : null;
            return (
              <div
                key={page}
                ref={(el) => {
                  if (el) pageRefs.current.set(page, el);
                  else pageRefs.current.delete(page);
                }}
                className="shrink-0"
              >
                <PdfPage
                  pdf={doc}
                  pageNumber={page}
                  scale={scale}
                  rotation={rotation}
                  visible={visiblePages.has(page)}
                  highlightQuery={searchQuery}
                  activeLocalMatch={activeLocalMatchFor(page)}
                  isDark={isDark}
                  widthPx={widthPx}
                  heightPx={heightPx}
                  onBaseSize={handleBaseSize}
                  getTextItems={getTextItems}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
