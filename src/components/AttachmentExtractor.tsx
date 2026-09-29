import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  File,
  Download,
  Eye,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  Mail,
  Filter,
  X,
  Loader2,
  FolderArchive,
  ArrowUpDown,
  LayoutGrid,
  List as ListIcon,
  ExternalLink,
  User,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { EmailAttachment } from '../types/gmail';
import { useTheme } from '../context/ThemeContext';
import {
  scanAttachments,
  downloadAttachmentFile,
  downloadAttachmentsAsZip,
  getAttachmentBytes,
} from '../services/gmailApi';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { suggestContacts, LocalContact } from '../services/contactsService';

const ImageThumbnail: React.FC<{
  token: string;
  attachment: EmailAttachment;
  isDark: boolean;
  className?: string;
}> = ({ token, attachment, isDark, className = '' }) => {
  const [srcUrl, setSrcUrl] = useState<string | null>(() => {
    if (attachment.data) {
      return `data:${attachment.mimeType || 'image/png'};base64,${attachment.data.replace(/-/g, '+').replace(/_/g, '/')}`;
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(!attachment.data);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    if (!srcUrl && !error) {
      setLoading(true);
      getAttachmentBytes(token, attachment.messageId, attachment.attachmentId, attachment.data)
        .then((bytes) => {
          if (!active) return;
          const blob = new Blob([bytes], { type: attachment.mimeType || 'image/png' });
          createdUrl = URL.createObjectURL(blob);
          setSrcUrl(createdUrl);
        })
        .catch((err) => {
          if (!active) return;
          console.warn('Failed loading image thumbnail:', err);
          setError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [attachment, token, srcUrl, error]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-slate-800/40 rounded-lg ${className}`}>
        <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (error || !srcUrl) {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-800/20 text-slate-500 rounded-lg ${className}`}>
        <ImageIcon className="w-6 h-6 mb-1 text-violet-400 opacity-60" />
        <span className="text-[10px] font-mono">Image</span>
      </div>
    );
  }

  return (
    <img
      src={srcUrl}
      alt={attachment.filename}
      className={`w-full h-full object-cover ${className}`}
    />
  );
};

export type FileCategory = 'all' | 'documents' | 'spreadsheets' | 'images' | 'archives' | 'other';

function getFileCategory(filename: string, mimeType: string): FileCategory {
  const lowerName = (filename || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  if (
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.doc') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.txt') ||
    lowerMime.includes('pdf') ||
    lowerMime.includes('word')
  ) {
    return 'documents';
  }

  if (
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.csv') ||
    lowerMime.includes('spreadsheet') ||
    lowerMime.includes('excel') ||
    lowerMime.includes('csv')
  ) {
    return 'spreadsheets';
  }

  if (
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.webp') ||
    lowerName.endsWith('.gif') ||
    lowerName.endsWith('.svg') ||
    lowerMime.startsWith('image/')
  ) {
    return 'images';
  }

  if (
    lowerName.endsWith('.zip') ||
    lowerName.endsWith('.rar') ||
    lowerName.endsWith('.tar') ||
    lowerName.endsWith('.gz') ||
    lowerName.endsWith('.7z') ||
    lowerMime.includes('zip') ||
    lowerMime.includes('tar') ||
    lowerMime.includes('archive')
  ) {
    return 'archives';
  }

  return 'other';
}

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes === 0) return '0 o';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileIcon(cat: FileCategory) {
  switch (cat) {
    case 'documents':
      return <FileText className="w-5 h-5 text-rose-400" />;
    case 'spreadsheets':
      return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    case 'images':
      return <ImageIcon className="w-5 h-5 text-violet-400" />;
    case 'archives':
      return <FileArchive className="w-5 h-5 text-amber-400" />;
    default:
      return <File className="w-5 h-5 text-slate-400" />;
  }
}

interface AttachmentExtractorProps {
  token: string;
  onOpenEmail?: (messageId: string) => void;
  currentUserEmail?: string;
}

export const AttachmentExtractor: React.FC<AttachmentExtractorProps> = ({
  token,
  onOpenEmail,
  currentUserEmail,
}) => {
  const { isDark } = useTheme();

  // Search & Filter state
  const [senderQuery, setSenderQuery] = useState('');
  const [keywordQuery, setKeywordQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FileCategory>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortField, setSortField] = useState<'date' | 'size' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [isFilterExpandedMobile, setIsFilterExpandedMobile] = useState(false);

  // Contact autocomplete for sender input
  const [senderSuggestions, setSenderSuggestions] = useState<LocalContact[]>([]);
  const [isSenderFocused, setIsSenderFocused] = useState(false);

  // Data & loading states
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Operations
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number; filename: string } | null>(null);

  // Rich preview state
  const [previewAttachment, setPreviewAttachment] = useState<EmailAttachment | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewArrayBuffer, setPreviewArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Auto-scan recent attachments on initial mount if token is available and search hasn't run
  useEffect(() => {
    if (token && !hasSearched && attachments.length === 0 && !isLoading) {
      executeSearch('');
    }
  }, [token]);

  const handleSenderChange = (val: string) => {
    setSenderQuery(val);
    if (val.trim()) {
      setSenderSuggestions(suggestContacts(val, 4));
    } else {
      setSenderSuggestions([]);
    }
  };

  const handleSelectSuggestedContact = (contact: LocalContact) => {
    setSenderQuery(contact.email);
    setIsSenderFocused(false);
    setSenderSuggestions([]);
    executeSearch(contact.email);
  };

  // Main search function
  const executeSearch = async (overrideSender?: string) => {
    if (!token) {
      setError('Veuillez vous connecter à votre compte Google pour rechercher les pièces jointes.');
      return;
    }

    const targetSender = overrideSender !== undefined ? overrideSender : senderQuery;
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setIsFilterExpandedMobile(false);

    try {
      const queryParts: string[] = [];
      if (targetSender.trim()) {
        queryParts.push(`from:${targetSender.trim()}`);
      }
      if (keywordQuery.trim()) {
        queryParts.push(keywordQuery.trim());
      }
      const combinedQuery = queryParts.join(' ');

      const res = await scanAttachments(token, {
        searchQuery: combinedQuery || undefined,
        maxMessages: 15,
      });

      setAttachments(res.attachments);
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error('Error scanning attachments:', err);
      setError(err?.message || 'Impossible de récupérer les pièces jointes.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch();
  };

  // Handle single download
  const handleDownload = async (att: EmailAttachment) => {
    try {
      setDownloadingId(att.id);
      await downloadAttachmentFile(token, att);
    } catch (err: any) {
      alert(`Erreur lors du téléchargement: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle rich preview modal
  const handleOpenPreview = async (att: EmailAttachment) => {
    setPreviewAttachment(att);
    setIsLoadingPreview(true);
    setPreviewArrayBuffer(null);
    setPreviewBlobUrl(null);
    setPreviewError(null);

    try {
      const bytes = await getAttachmentBytes(token, att.messageId, att.attachmentId, att.data);
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      setPreviewArrayBuffer(arrayBuffer);

      const blob = new Blob([bytes], { type: att.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl(url);
    } catch (e: any) {
      console.warn('Could not load preview bytes:', e);
      setPreviewError(
        e?.message || 'Impossible de récupérer cette pièce jointe depuis Gmail.'
      );
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const closePreview = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setPreviewBlobUrl(null);
    setPreviewArrayBuffer(null);
    setPreviewAttachment(null);
    setPreviewError(null);
  };

  // Handle batch ZIP download
  const handleDownloadZip = async (targetList: EmailAttachment[]) => {
    if (targetList.length === 0) return;
    try {
      setIsZipping(true);
      setZipProgress({ current: 0, total: targetList.length, filename: '' });
      await downloadAttachmentsAsZip(token, targetList, (current, total, filename) => {
        setZipProgress({ current, total, filename });
      });
    } catch (err: any) {
      alert(`Erreur lors de la création de l'archive ZIP: ${err.message}`);
    } finally {
      setIsZipping(false);
      setZipProgress(null);
    }
  };

  // Selection toggle
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = (filteredList: EmailAttachment[]) => {
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map((a) => a.id)));
    }
  };

  // Filter & Sort
  const filteredAttachments = useMemo(() => {
    return attachments.filter((att) => {
      const cat = getFileCategory(att.filename, att.mimeType);
      if (activeCategory !== 'all' && cat !== activeCategory) return false;
      return true;
    });
  }, [attachments, activeCategory]);

  const sortedAttachments = useMemo(() => {
    return [...filteredAttachments].sort((a, b) => {
      if (sortField === 'date') {
        const diff = Number(a.internalDate) - Number(b.internalDate);
        return sortOrder === 'desc' ? -diff : diff;
      }
      if (sortField === 'size') {
        const diff = a.size - b.size;
        return sortOrder === 'desc' ? -diff : diff;
      }
      if (sortField === 'name') {
        const diff = a.filename.localeCompare(b.filename);
        return sortOrder === 'desc' ? -diff : diff;
      }
      return 0;
    });
  }, [filteredAttachments, sortField, sortOrder]);

  const categoryCounts = useMemo(() => {
    const counts: Record<FileCategory, number> = {
      all: attachments.length,
      documents: 0,
      spreadsheets: 0,
      images: 0,
      archives: 0,
      other: 0,
    };
    attachments.forEach((att) => {
      const cat = getFileCategory(att.filename, att.mimeType);
      counts[cat]++;
    });
    return counts;
  }, [attachments]);

  return (
    <div
      className={`h-full flex flex-col min-h-0 overflow-hidden select-none transition-colors relative ${
        isDark ? 'bg-[#05070A] text-slate-200' : 'bg-[#F8FAFC] text-slate-800'
      }`}
      id="attachment-extractor-root"
    >
      {/* Top Banner / Header (Compact on mobile) */}
      <div
        className={`px-3 py-2.5 sm:px-6 sm:py-3.5 border-b shrink-0 flex items-center justify-between gap-2 transition-colors ${
          isDark
            ? 'bg-[#080B10] border-slate-800/80 shadow-xs'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="p-2 sm:p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shrink-0 shadow-[0_0_10px_rgba(34,211,238,0.2)]">
            <FolderArchive className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-base font-bold tracking-tight truncate">
                Extracteur de Pièces Jointes
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shrink-0">
                {attachments.length} trouvés
              </span>
            </div>
            <p className={`hidden sm:block text-xs font-mono truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Extraction • Aperçu multi-format (PDF, Excel, Images) • Export ZIP
            </p>
          </div>
        </div>

        {/* Global actions (Desktop & Tablet) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => executeSearch()}
            disabled={isLoading}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition border cursor-pointer ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
            }`}
            title="Actualiser la recherche"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>

          {/* Toggle Mobile Search Filter Drawer */}
          <button
            type="button"
            onClick={() => setIsFilterExpandedMobile(!isFilterExpandedMobile)}
            className={`sm:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              isFilterExpandedMobile
                ? 'bg-cyan-600 text-white border-cyan-500'
                : isDark
                ? 'bg-slate-900 border-slate-700 text-slate-300'
                : 'bg-slate-100 border-slate-300 text-slate-700'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtres</span>
            {isFilterExpandedMobile ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {sortedAttachments.length > 0 && (
            <button
              type="button"
              onClick={() =>
                handleDownloadZip(
                  selectedIds.size > 0
                    ? attachments.filter((a) => selectedIds.has(a.id))
                    : sortedAttachments
                )
              }
              disabled={isZipping || sortedAttachments.length === 0}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <FolderArchive className="w-3.5 h-3.5" />
              <span>
                {selectedIds.size > 0
                  ? `ZIP sélection (${selectedIds.size})`
                  : `Tout télécharger en ZIP (${sortedAttachments.length})`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ZIP Download Progress bar */}
      {isZipping && zipProgress && (
        <div className="bg-cyan-500/15 border-b border-cyan-500/40 px-3 sm:px-6 py-2 flex items-center justify-between text-xs font-mono text-cyan-300 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-cyan-400" />
            <span className="truncate">
              ZIP : {zipProgress.current} / {zipProgress.total} fichier(s) ({zipProgress.filename})
            </span>
          </div>
          <div className="w-24 sm:w-32 bg-slate-800 rounded-full h-1.5 overflow-hidden shrink-0 ml-2">
            <div
              className="bg-cyan-400 h-full transition-all duration-200"
              style={{ width: `${(zipProgress.current / zipProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Search & Filter Bar (Adaptive & Collapsible on mobile) */}
      <div
        className={`px-3 py-2 sm:px-6 sm:py-3 border-b shrink-0 transition-colors ${
          !isFilterExpandedMobile ? 'hidden sm:block' : 'block'
        } ${isDark ? 'bg-[#0B0F17] border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}
      >
        <form onSubmit={handleFormSubmit} className="flex flex-col sm:flex-row items-stretch gap-2">
          {/* Sender Input with contact auto-suggestions */}
          <div className="relative flex-1">
            <div className="absolute left-3 top-2.5 text-slate-400">
              <User className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              placeholder="Expéditeur (ex: contact@email.com ou nom)..."
              value={senderQuery}
              onChange={(e) => handleSenderChange(e.target.value)}
              onFocus={() => {
                setIsSenderFocused(true);
                setSenderSuggestions(suggestContacts(senderQuery, 4));
              }}
              className={`w-full pl-9 pr-4 py-1.5 sm:py-2 text-xs rounded-xl border outline-none transition ${
                isDark
                  ? 'bg-slate-900/90 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-400'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600'
              }`}
            />

            {/* Suggestions dropdown */}
            {isSenderFocused && senderSuggestions.length > 0 && (
              <div
                className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-xl shadow-2xl border overflow-hidden backdrop-blur-md ${
                  isDark ? 'bg-[#0E131F]/95 border-slate-700 text-slate-200' : 'bg-white/95 border-slate-300 text-slate-800'
                }`}
              >
                <div className="p-1">
                  <div className={`px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Contacts suggérés
                  </div>
                  {senderSuggestions.map((c) => (
                    <div
                      key={c.id}
                      onMouseDown={() => handleSelectSuggestedContact(c)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition ${
                        isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold truncate">{c.name}</p>
                        <p className={`text-[10px] font-mono truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {c.email}
                        </p>
                      </div>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded shrink-0 ${
                          c.category === 'pro'
                            ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {c.category === 'pro' ? 'Pro' : 'Perso'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Keyword / File type Input */}
          <div className="relative sm:w-56">
            <div className="absolute left-3 top-2.5 text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              placeholder="Nom de fichier, mot-clé..."
              value={keywordQuery}
              onChange={(e) => setKeywordQuery(e.target.value)}
              className={`w-full pl-9 pr-4 py-1.5 sm:py-2 text-xs rounded-xl border outline-none transition ${
                isDark
                  ? 'bg-slate-900/90 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-400'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600'
              }`}
            />
          </div>

          {/* Submit Search Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Extraire</span>
          </button>
        </form>
      </div>

      {/* Category Pills & View Switcher (Scrollable horizontally) */}
      <div
        className={`px-3 py-2 sm:px-6 sm:py-2.5 border-b shrink-0 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar ${
          isDark ? 'bg-[#070A0F] border-slate-800' : 'bg-slate-100/80 border-slate-200'
        }`}
      >
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'all', label: 'Tous', icon: FolderArchive },
              { id: 'documents', label: 'PDF & Docs', icon: FileText },
              { id: 'spreadsheets', label: 'Excel & Tables', icon: FileSpreadsheet },
              { id: 'images', label: 'Photos', icon: ImageIcon },
              { id: 'archives', label: 'ZIP & Rars', icon: FileArchive },
            ] as const
          ).map((cat) => {
            const Icon = cat.icon;
            const count = categoryCounts[cat.id];
            const isActive = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer select-none ${
                  isActive
                    ? 'bg-cyan-600 text-white shadow-xs font-semibold'
                    : isDark
                    ? 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">{cat.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full shrink-0 ${
                    isActive
                      ? 'bg-cyan-700 text-white'
                      : isDark
                      ? 'bg-slate-800 text-slate-300'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* View Mode & Sorting */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => toggleSelectAll(sortedAttachments)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono transition border cursor-pointer ${
              selectedIds.size > 0 && selectedIds.size === sortedAttachments.length
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                : isDark
                ? 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                : 'border-slate-300 bg-white text-slate-600 hover:text-slate-900'
            }`}
            title="Tout sélectionner"
          >
            {selectedIds.size === sortedAttachments.length && sortedAttachments.length > 0 ? (
              <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Tout</span>
          </button>

          <div className="flex items-center bg-slate-800/30 rounded-lg p-0.5 border border-slate-700/40">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded-md transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-cyan-600 text-white'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-black'
              }`}
              title="Vue Grille"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1 rounded-md transition cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-cyan-600 text-white'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-black'
              }`}
              title="Vue Liste"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono transition border cursor-pointer ${
              isDark
                ? 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
            title="Inverser le tri"
          >
            <ArrowUpDown className="w-3 h-3 text-cyan-400" />
            <span className="hidden sm:inline">
              {sortOrder === 'desc' ? 'Récents' : 'Anciens'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Workspace Scrollable Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 sm:p-6 pb-24 sm:pb-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
            <p className="text-xs font-mono text-slate-400">
              Extraction des pièces jointes depuis Gmail...
            </p>
          </div>
        ) : sortedAttachments.length === 0 ? (
          <div className="text-center py-16 px-4">
            <File className="w-12 h-12 text-slate-500 mx-auto mb-3 opacity-40" />
            <h3 className="text-sm font-semibold mb-1">Aucune pièce jointe trouvée</h3>
            <p className={`text-xs max-w-sm mx-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Aucun fichier ne correspond à votre filtre. Modifiez les critères ou actualisez.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Responsive Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {sortedAttachments.map((att) => {
              const isSelected = selectedIds.has(att.id);
              const cat = getFileCategory(att.filename, att.mimeType);
              const isDownloading = downloadingId === att.id;

              return (
                <div
                  key={att.id}
                  className={`group relative flex flex-col justify-between p-3 sm:p-4 rounded-xl border transition ${
                    isSelected
                      ? isDark
                        ? 'bg-cyan-950/30 border-cyan-500/60 shadow-[0_0_12px_rgba(34,211,238,0.15)] ring-1 ring-cyan-500/40'
                        : 'bg-cyan-50 border-cyan-400 ring-1 ring-cyan-400/30'
                      : isDark
                      ? 'bg-[#0B0F17] border-slate-800/80 hover:border-slate-700 hover:bg-[#0E131F]'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-xs'
                  }`}
                >
                  <div>
                    {/* Header: Thumbnail or Icon + Selection Checkbox */}
                    {cat === 'images' ? (
                      <div className="relative w-full h-32 sm:h-36 mb-2 sm:mb-3 rounded-lg overflow-hidden border border-slate-700/50 bg-slate-900/80 group/img">
                        <ImageThumbnail token={token} attachment={att} isDark={isDark} />
                        <div
                          onClick={() => handleOpenPreview(att)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span className="px-2.5 py-1 rounded-md bg-cyan-600 text-white text-[11px] font-bold flex items-center gap-1 shadow-md">
                            <Eye className="w-3.5 h-3.5" /> Aperçu
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(att.id);
                          }}
                          className={`absolute top-2 right-2 p-1.5 rounded-lg backdrop-blur-md transition cursor-pointer ${
                            isSelected
                              ? 'bg-cyan-500 text-slate-950 font-bold'
                              : 'bg-black/60 text-white hover:bg-black/80'
                          }`}
                          title={isSelected ? 'Désélectionner' : 'Sélectionner'}
                        >
                          {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
                        <div className="p-2 sm:p-2.5 rounded-xl bg-slate-800/30 border border-slate-700/40 shrink-0">
                          {getFileIcon(cat)}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSelect(att.id)}
                          className={`p-1.5 rounded-md transition cursor-pointer ${
                            isSelected ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                          }`}
                          title={isSelected ? 'Désélectionner' : 'Sélectionner'}
                        >
                          {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      </div>
                    )}

                    {/* Filename & Info */}
                    <h3
                      className="text-xs font-bold truncate mb-1"
                      title={att.filename}
                    >
                      {att.filename}
                    </h3>
                    <p className={`text-[11px] font-mono mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {formatBytes(att.size)} • {att.dateStr}
                    </p>

                    <div className={`text-[11px] truncate flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate" title={att.emailSubject}>
                        {att.emailSubject || '(Sans objet)'}
                      </span>
                    </div>
                    <div className={`text-[10px] font-mono truncate mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      De : {att.fromName || att.fromEmail}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-700/30">
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(att)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        isDark
                          ? 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
                          : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Aperçu</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {onOpenEmail && (
                        <button
                          type="button"
                          onClick={() => onOpenEmail(att.messageId)}
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-black'
                          }`}
                          title="Voir le message original"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDownload(att)}
                        disabled={isDownloading}
                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                          isDark ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-500 hover:text-cyan-600'
                        }`}
                        title="Télécharger ce fichier"
                      >
                        {isDownloading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Responsive List View */
          <div className="space-y-2">
            {sortedAttachments.map((att) => {
              const isSelected = selectedIds.has(att.id);
              const cat = getFileCategory(att.filename, att.mimeType);
              const isDownloading = downloadingId === att.id;

              return (
                <div
                  key={att.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 rounded-xl border gap-2 transition ${
                    isSelected
                      ? isDark
                        ? 'bg-cyan-950/30 border-cyan-500/50'
                        : 'bg-cyan-50 border-cyan-400'
                      : isDark
                      ? 'bg-[#0B0F17] border-slate-800 hover:border-slate-700'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleSelect(att.id)}
                      className={`p-1 rounded-md transition cursor-pointer shrink-0 ${
                        isSelected ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>

                    <div className="shrink-0">{getFileIcon(cat)}</div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate" title={att.filename}>
                        {att.filename}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 truncate">
                        <span>{formatBytes(att.size)}</span>
                        <span>•</span>
                        <span>{att.dateStr}</span>
                        <span>•</span>
                        <span className="truncate">De : {att.fromName || att.fromEmail}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 shrink-0 pl-7 sm:pl-0">
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(att)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        isDark ? 'text-cyan-400 hover:bg-cyan-500/10' : 'text-cyan-700 hover:bg-cyan-50'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Aperçu</span>
                    </button>

                    {onOpenEmail && (
                      <button
                        type="button"
                        onClick={() => onOpenEmail(att.messageId)}
                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                          isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-black'
                        }`}
                        title="Voir le message"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDownload(att)}
                      disabled={isDownloading}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'
                      }`}
                      title="Télécharger"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile Sticky Floating Bottom Action Bar */}
      {sortedAttachments.length > 0 && (
        <div
          className={`sm:hidden fixed bottom-0 left-0 right-0 p-2.5 border-t backdrop-blur-md z-30 flex items-center justify-between gap-2 shadow-2xl ${
            isDark ? 'bg-[#080B10]/95 border-slate-800' : 'bg-white/95 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="font-semibold text-cyan-400">
              {selectedIds.size > 0 ? `${selectedIds.size} sélect.` : `${sortedAttachments.length} docs`}
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              handleDownloadZip(
                selectedIds.size > 0
                  ? attachments.filter((a) => selectedIds.has(a.id))
                  : sortedAttachments
              )
            }
            disabled={isZipping || sortedAttachments.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <FolderArchive className="w-4 h-4" />
            <span>
              {selectedIds.size > 0
                ? `Télécharger ZIP (${selectedIds.size})`
                : `Tout en ZIP (${sortedAttachments.length})`}
            </span>
          </button>
        </div>
      )}

      {/* Multi-Format Document Preview Modal */}
      <DocumentPreviewModal
        attachment={previewAttachment}
        blobUrl={previewBlobUrl}
        arrayBuffer={previewArrayBuffer}
        isLoading={isLoadingPreview}
        loadError={previewError}
        onRetry={handleOpenPreview}
        onClose={closePreview}
        onDownload={handleDownload}
      />
    </div>
  );
};
