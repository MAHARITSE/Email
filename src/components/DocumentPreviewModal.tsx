import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Search,
  Maximize2,
  Minimize2,
  Table,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import type * as XLSXType from 'xlsx';
import type mammothDefault from 'mammoth';
import DOMPurify from 'dompurify';
import { EmailAttachment } from '../types/gmail';
import { useTheme } from '../context/ThemeContext';
import { detectFileKind, getFileExtension, FileKind } from '../utils/fileKind';

// Chargement paresseux : pdf.js, xlsx et mammoth ne sont téléchargés
// que lorsqu'un aperçu de document est réellement ouvert.
const PdfViewer = React.lazy(() =>
  import('./PdfViewer').then((m) => ({ default: m.PdfViewer }))
);
const loadXLSX = () => import('xlsx') as Promise<typeof XLSXType>;
const loadMammoth = () => import('mammoth') as Promise<typeof mammothDefault>;

interface DocumentPreviewModalProps {
  attachment: EmailAttachment | null;
  blobUrl: string | null;
  arrayBuffer?: ArrayBuffer | null;
  isLoading: boolean;
  /** Message d'erreur si le téléchargement des octets de la pièce jointe a échoué. */
  loadError?: string | null;
  onClose: () => void;
  onDownload: (att: EmailAttachment) => void;
  /** Relance le chargement de la pièce jointe après une erreur. */
  onRetry?: (att: EmailAttachment) => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  attachment,
  blobUrl,
  arrayBuffer,
  isLoading,
  loadError,
  onClose,
  onDownload,
  onRetry,
}) => {
  const { isDark } = useTheme();

  // Viewport states
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Excel Spreadsheet states
  const [sheets, setSheets] = useState<{ name: string; data: (string | number)[][] }[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetSearch, setSheetSearch] = useState('');

  // Word Docx states
  const [wordHtml, setWordHtml] = useState<string | null>(null);

  // Text / Code states
  const [textContent, setTextContent] = useState<string | null>(null);

  // Parsing error or status
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsingDoc, setIsParsingDoc] = useState(false);

  // Determine file type (extension d'abord, puis mimeType)
  const filename = attachment?.filename || '';
  const ext = getFileExtension(filename);
  const kind: FileKind = detectFileKind(filename, attachment?.mimeType);

  const isPdf = kind === 'pdf';
  const isImage = kind === 'image';
  const isExcel = kind === 'excel';
  const isWord = kind === 'word';
  const isText = kind === 'text';
  const isLegacyWord = isWord && ext !== 'docx'; // mammoth ne lit que le format .docx

  // Parse files when arrayBuffer changes
  useEffect(() => {
    if (!attachment) {
      setSheets([]);
      setWordHtml(null);
      setTextContent(null);
      setParseError(null);
      setZoom(1);
      setRotation(0);
      return;
    }

    // Reset view states
    setZoom(1);
    setRotation(0);
    setParseError(null);
    setSheetSearch('');

    if (!arrayBuffer) return;

    let cancelled = false;

    (async () => {
      // 1. Handle Excel parsing (xlsx chargé à la demande)
      if (isExcel) {
        setIsParsingDoc(true);
        try {
          const XLSX = await loadXLSX();
          if (cancelled) return;
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const parsedSheets = workbook.SheetNames.map((name) => {
            const sheet = workbook.Sheets[name];
            const rawData: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, {
              header: 1,
              defval: '',
            });
            return { name, data: rawData };
          });
          if (cancelled) return;
          setSheets(parsedSheets);
          setActiveSheetIndex(0);
        } catch (err: any) {
          console.error('Erreur lecture Excel:', err);
          if (!cancelled) setParseError('Impossible de formater ce classeur. Vous pouvez le télécharger pour le consulter.');
        } finally {
          if (!cancelled) setIsParsingDoc(false);
        }
      }

      // 2. Handle Word parsing (.docx uniquement — mammoth ne supporte pas le .doc legacy)
      else if (isWord) {
        if (!isLegacyWord) {
          setIsParsingDoc(true);
          try {
            const mammoth = await loadMammoth();
            if (cancelled) return;
            try {
              const result = await mammoth.convertToHtml({ arrayBuffer });
              if (cancelled) return;
              // Sécurisation du HTML produit (neutralise tout contenu actif malveillant)
              setWordHtml(
                DOMPurify.sanitize(result.value, {
                  USE_PROFILES: { html: true },
                  FORBID_TAGS: ['script', 'iframe', 'form', 'object', 'embed'],
                })
              );
            } catch (err: any) {
              console.error('Erreur lecture Word:', err);
              // Fallback to raw text
              const res = await mammoth.extractRawText({ arrayBuffer });
              if (!cancelled) setTextContent(res.value);
            }
          } catch {
            if (!cancelled) {
              setParseError('Impossible d\'extraire l\'aperçu du document Word. Téléchargez-le pour l\'ouvrir.');
            }
          } finally {
            if (!cancelled) setIsParsingDoc(false);
          }
        } else {
          setParseError(
            `Les anciens formats Word (${ext.toUpperCase()}) ne peuvent pas être affichés directement. Téléchargez le fichier pour l'ouvrir dans Word.`
          );
        }
      }

      // 3. Handle Plain Text / Code
      else if (isText) {
        try {
          const decoded = new TextDecoder('utf-8').decode(arrayBuffer);
          if (!cancelled) setTextContent(decoded);
        } catch {
          // ignore
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachment, arrayBuffer, ext, isExcel, isWord, isLegacyWord, isText]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!attachment) return null;

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 Ko';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
  };

  const currentSheet = sheets[activeSheetIndex];
  const filteredSheetRows = currentSheet
    ? currentSheet.data.filter((row) => {
        if (!sheetSearch.trim()) return true;
        const q = sheetSearch.toLowerCase();
        return row.some((cell) => String(cell).toLowerCase().includes(q));
      })
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150 select-none"
      onClick={onClose}
      id="document-preview-modal-backdrop"
    >
      <div
        className={`relative flex flex-col rounded-2xl shadow-2xl overflow-hidden transition-all ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[88vh]'
        } ${isDark ? 'bg-[#0B0F17] border border-slate-800 text-slate-200' : 'bg-white border border-slate-200 text-slate-800'}`}
        onClick={(e) => e.stopPropagation()}
        id="document-preview-modal-container"
      >
        {/* Header Bar */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0 ${
            isDark ? 'border-slate-800 bg-[#0E131F]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
              {isPdf ? (
                <FileText className="h-5 w-5 text-red-400" />
              ) : isExcel ? (
                <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              ) : isWord ? (
                <FileText className="h-5 w-5 text-blue-400" />
              ) : isImage ? (
                <ImageIcon className="h-5 w-5 text-purple-400" />
              ) : (
                <File className="h-5 w-5 text-cyan-400" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate" title={attachment.filename}>
                {attachment.filename}
              </h3>
              <p className={`text-xs font-mono truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {formatSize(attachment.size)} • {attachment.emailSubject || 'Email'}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Image zoom controls */}
            {isImage && (
              <div className="flex items-center bg-slate-800/40 rounded-lg p-0.5 border border-slate-700/50 mr-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition"
                  title="Zoom arrière"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="text-[11px] font-mono px-1.5 text-slate-300">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition"
                  title="Zoom avant"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition ml-1"
                  title="Pivoter 90°"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Excel search bar */}
            {isExcel && sheets.length > 0 && (
              <div className="relative hidden sm:block mr-2">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher dans le tableau..."
                  value={sheetSearch}
                  onChange={(e) => setSheetSearch(e.target.value)}
                  className={`pl-8 pr-3 py-1.5 text-xs rounded-lg border transition outline-none ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-400'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600'
                  }`}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`p-2 rounded-lg transition ${
                isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700'
              }`}
              title={isFullscreen ? 'Quitter plein écran' : 'Plein écran'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => onDownload(attachment)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Télécharger</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-lg transition ${
                isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-black'
              }`}
              title="Fermer (Échap)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Excel Sheets Tab Bar (if multiple sheets exist) */}
        {isExcel && sheets.length > 1 && (
          <div
            className={`flex items-center gap-1 px-4 py-2 border-b overflow-x-auto text-xs shrink-0 ${
              isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-100'
            }`}
          >
            <Table className="h-3.5 w-3.5 text-emerald-500 mr-1 shrink-0" />
            {sheets.map((s, idx) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setActiveSheetIndex(idx)}
                className={`px-3 py-1 rounded-md font-mono text-xs transition shrink-0 ${
                  activeSheetIndex === idx
                    ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                    : isDark
                    ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                    : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Modal Main Content */}
        <div
          className={`relative select-text ${
            isPdf
              ? 'flex-1 min-h-0 overflow-hidden p-0'
              : 'flex-1 min-h-0 overflow-auto p-2 sm:p-4 flex items-center justify-center'
          }`}
        >
          {isLoading || isParsingDoc ? (
            <div className="flex flex-col items-center gap-3 text-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-xs font-mono text-slate-400">Préparation de l'aperçu du document...</p>
            </div>
          ) : parseError ? (
            <div className="text-center max-w-md p-8">
              <File className="h-12 w-12 text-slate-500 mx-auto mb-3" />
              <p className="text-sm font-semibold mb-1">Aperçu direct non disponible</p>
              <p className="text-xs text-slate-400 mb-4">{parseError}</p>
              <button
                type="button"
                onClick={() => onDownload(attachment)}
                className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500 transition"
              >
                Télécharger le fichier original
              </button>
            </div>
          ) : loadError ? (
            /* Erreur de chargement des octets de la pièce jointe */
            <div className="text-center max-w-md p-8">
              <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-3" />
              <p className="text-sm font-semibold mb-1">Échec du chargement de l'aperçu</p>
              <p className="text-xs text-slate-400 mb-4">{loadError}</p>
              <div className="flex items-center justify-center gap-3">
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(attachment)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Réessayer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDownload(attachment)}
                  className="px-4 py-2 rounded-lg bg-slate-700 text-white text-xs font-semibold hover:bg-slate-600 transition"
                >
                  Télécharger quand même
                </button>
              </div>
            </div>
          ) : isPdf ? (
            /* Lecteur PDF intégré (pdf.js) : rendu canvas directement dans l'application */
            arrayBuffer || blobUrl ? (
              <React.Suspense
                fallback={
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                    <p className="text-xs font-mono text-slate-400">Chargement du lecteur PDF…</p>
                  </div>
                }
              >
                <PdfViewer
                  arrayBuffer={arrayBuffer}
                  blobUrl={blobUrl}
                  filename={attachment.filename}
                  onDownload={() => onDownload(attachment)}
                />
              </React.Suspense>
            ) : null
          ) : isExcel && sheets.length > 0 ? (
            /* Excel / Spreadsheet Grid Viewer */
            <div className="w-full h-full flex flex-col overflow-auto">
              <div
                className={`flex items-center justify-between px-3 py-2 text-xs font-mono ${
                  isDark ? 'text-slate-400 bg-slate-900/40' : 'text-slate-500 bg-slate-50'
                } border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}
              >
                <span>
                  Feuille : <strong>{currentSheet?.name}</strong> • {filteredSheetRows.length} ligne(s)
                </span>
                {sheetSearch && (
                  <span className="text-cyan-400">Filtré par : "{sheetSearch}"</span>
                )}
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs font-mono">
                  <thead>
                    <tr className={isDark ? 'bg-slate-900 sticky top-0 z-10' : 'bg-slate-200 sticky top-0 z-10'}>
                      <th className="p-2 border border-slate-700/60 w-12 text-center text-slate-400 font-bold">#</th>
                      {filteredSheetRows[0]?.map((_, colIdx) => (
                        <th
                          key={colIdx}
                          className={`p-2 border text-left font-bold uppercase tracking-wider ${
                            isDark
                              ? 'border-slate-700/60 text-emerald-400 bg-slate-900'
                              : 'border-slate-300 text-emerald-700 bg-slate-200'
                          }`}
                        >
                          {String.fromCharCode(65 + (colIdx % 26))}
                          {colIdx >= 26 ? Math.floor(colIdx / 26) : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSheetRows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className={`transition hover:bg-cyan-500/5 ${
                          rowIdx % 2 === 0
                            ? isDark
                              ? 'bg-transparent'
                              : 'bg-white'
                            : isDark
                            ? 'bg-slate-900/30'
                            : 'bg-slate-50'
                        }`}
                      >
                        <td
                          className={`p-2 border text-center text-[10px] font-mono ${
                            isDark
                              ? 'border-slate-800 text-slate-500 bg-slate-900/50'
                              : 'border-slate-200 text-slate-400 bg-slate-100'
                          }`}
                        >
                          {rowIdx + 1}
                        </td>
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className={`p-2 border whitespace-nowrap overflow-hidden text-ellipsis max-w-xs ${
                              isDark ? 'border-slate-800/80 text-slate-200' : 'border-slate-200 text-slate-800'
                            }`}
                            title={String(cell ?? '')}
                          >
                            {cell !== undefined && cell !== null && String(cell) !== '' ? String(cell) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : isWord && wordHtml ? (
            /* Word .docx Clean HTML Viewer */
            <div className="w-full h-full overflow-auto p-6 sm:p-10 flex justify-center">
              <div
                className={`max-w-3xl w-full p-8 sm:p-12 rounded-xl shadow-lg leading-relaxed ${
                  isDark
                    ? 'bg-[#121826] border border-slate-800 text-slate-100'
                    : 'bg-white border border-slate-200 text-slate-900'
                }`}
              >
                <div
                  className="prose prose-sm max-w-none break-words space-y-4 font-sans"
                  dangerouslySetInnerHTML={{ __html: wordHtml }}
                />
              </div>
            </div>
          ) : isImage && blobUrl ? (
            /* Image Viewer with Zoom & Rotation */
            <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
              <img
                src={blobUrl}
                alt={attachment.filename}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.15s ease-out',
                }}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-md"
              />
            </div>
          ) : textContent !== null ? (
            /* Text & Code Viewer */
            <div className="w-full h-full overflow-auto p-4">
              <pre
                className={`text-xs font-mono leading-relaxed p-4 rounded-xl border whitespace-pre-wrap ${
                  isDark
                    ? 'bg-[#080B10] border-slate-800 text-emerald-300'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                {textContent}
              </pre>
            </div>
          ) : (
            /* Generic Fallback */
            <div className="text-center p-8 max-w-md">
              <div className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-400 inline-block mb-3">
                <File className="h-10 w-10 mx-auto" />
              </div>
              <p className="text-sm font-semibold mb-1">Aperçu direct non pris en charge</p>
              <p className="text-xs text-slate-400 mb-4">
                Ce type de document ({ext.toUpperCase() || 'inconnu'}) peut être téléchargé directement pour lecture dans vos applications favorites.
              </p>
              <button
                type="button"
                onClick={() => onDownload(attachment)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-sm transition"
              >
                <Download className="h-4 w-4" />
                <span>Télécharger {attachment.filename}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
