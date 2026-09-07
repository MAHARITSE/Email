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
      className={`object-cover rounded-lg w-full h-full ${className}`}
      loading="lazy"
    />
  );
};

interface AttachmentExtractorProps {
  token: string;
  onOpenEmail?: (messageId: string) => void;
}

type FileCategory = 'all' | 'documents' | 'spreadsheets' | 'images' | 'archives' | 'other';
type SortField = 'date' | 'size' | 'name';
type SortOrder = 'desc' | 'asc';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Ko';
  const k = 1024;
  const sizes = ['Octets', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(i > 1 ? 1 : 0)} ${sizes[i]}`;
}

function getFileCategory(filename: string, mimeType: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (
    ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext) ||
    mimeType.includes('pdf') ||
    mimeType.includes('word') ||
    mimeType.includes('text/')
  ) {
    return 'documents';
  }
  if (
    ['xls', 'xlsx', 'csv', 'ods', 'tsv'].includes(ext) ||
    mimeType.includes('sheet') ||
    mimeType.includes('excel') ||
    mimeType.includes('csv')
  ) {
    return 'spreadsheets';
  }
  if (
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(ext) ||
    mimeType.startsWith('image/')
  ) {
    return 'images';
  }
  if (
    ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) ||
    mimeType.includes('zip') ||
    mimeType.includes('compressed')
  ) {
    return 'archives';
  }
  return 'other';
}

function getFileIcon(category: FileCategory) {
  switch (category) {
    case 'documents':
      return <FileText className="w-5 h-5 text-red-500" />;
    case 'spreadsheets':
      return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
    case 'images':
      return <ImageIcon className="w-5 h-5 text-violet-500" />;
    case 'archives':
      return <FileArchive className="w-5 h-5 text-amber-500" />;
    default:
      return <File className="w-5 h-5 text-cyan-500" />;
  }
}

export const AttachmentExtractor: React.FC<AttachmentExtractorProps> = ({
  token,
  onOpenEmail,
}) => {
  const { isDark } = useTheme();

  // Search & Filter state
  const [senderQuery, setSenderQuery] = useState<string>('');
  const [keywordQuery, setKeywordQuery] = useState<string>('');
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [senderSuggestions, setSenderSuggestions] = useState<LocalContact[]>([]);
  const [isSenderFocused, setIsSenderFocused] = useState<boolean>(false);

  // Attachment list state
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<FileCategory>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Download states
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number; filename: string } | null>(null);

  // Document Preview Modal states
  const [previewAttachment, setPreviewAttachment] = useState<EmailAttachment | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewArrayBuffer, setPreviewArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Auto-suggest contacts when typing sender
  const handleSenderChange = (val: string) => {
    setSenderQuery(val);
    if (val.trim()) {
      setSenderSuggestions(suggestContacts(val, 5));
    } else {
      setSenderSuggestions(suggestContacts('', 4));
    }
  };

  const handleSelectSuggestedContact = (contact: LocalContact) => {
    setSenderQuery(contact.email);
    setSenderSuggestions([]);
    setIsSenderFocused(false);
    // Trigger search directly with this sender
    executeSearch(contact.email, keywordQuery);
  };

  // Perform search (on-demand, not on initial mount!)
  const executeSearch = async (sender = senderQuery, keyword = keywordQuery) => {
    try {
      setIsLoading(true);
      setError(null);
      setHasSearched(true);

      let queryParts: string[] = ['has:attachment'];
      if (sender.trim()) {
        queryParts.push(`from:(${sender.trim()})`);
      }
      if (keyword.trim()) {
        queryParts.push(keyword.trim());
      }

      const queryString = queryParts.join(' ');

      const res = await scanAttachments(token, {
        searchQuery: queryString,
        maxMessages: 40,
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
        e?.message || 'Impossible de récupérer cette pièce jointe depuis Gmail. Vérifiez votre connexion puis réessayez.'
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

  const totalSelectedSize = useMemo(() => {
    return attachments
      .filter((a) => selectedIds.has(a.id))
      .reduce((acc, curr) => acc + (curr.size || 0), 0);
  }, [attachments, selectedIds]);

  return (
    <div
      className={`h-full flex flex-col overflow-hidden select-none transition-colors ${
        isDark ? 'bg-[#05070A] text-slate-200' : 'bg-[#F8FAFC] text-slate-800'
      }`}
      id="attachment-extractor-root"
    >
      {/* Top Banner / Header */}
      <div
        className={`px-6 py-4 border-b shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isDark
            ? 'bg-[#080B10] border-slate-800/80 shadow-xs'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <FolderArchive className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Extracteur de Pièces Jointes</h1>
            <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Recherche ciblée par expéditeur • Aperçu multi-format (PDF, Word, Excel) • Export ZIP
            </p>
          </div>
        </div>

        {/* Global actions */}
        {hasSearched && attachments.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => executeSearch()}
              disabled={isLoading}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                  : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Actualiser</span>
            </button>

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
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition active:scale-95 disabled:opacity-50"
            >
              <FolderArchive className="w-3.5 h-3.5" />
              <span>
                {selectedIds.size > 0
                  ? `Télécharger sélection (${selectedIds.size})`
                  : `Tout télécharger en ZIP (${sortedAttachments.length})`}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* ZIP Download Progress overlay bar */}
      {isZipping && zipProgress && (
        <div className="bg-cyan-500/10 border-b border-cyan-500/30 px-6 py-2.5 flex items-center justify-between text-xs font-mono text-cyan-400">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>
              Création du ZIP en cours : {zipProgress.current} / {zipProgress.total} fichier(s) (
              {zipProgress.filename})
            </span>
          </div>
          <div className="w-32 bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-cyan-400 h-full transition-all duration-200"
              style={{ width: `${(zipProgress.current / zipProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Search & Filter Bar (Targeted, doesn't auto-overload) */}
      <div
        className={`px-6 py-4 border-b shrink-0 ${
          isDark ? 'bg-[#0B0F17] border-slate-800/80' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <form onSubmit={handleFormSubmit} className="flex flex-col sm:flex-row items-stretch gap-3">
          {/* Sender Input with contact auto-suggestions */}
          <div className="relative flex-1">
            <div className="absolute left-3.5 top-2.5 text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Expéditeur (ex: jean@entreprise.com ou nom)..."
              value={senderQuery}
              onChange={(e) => handleSenderChange(e.target.value)}
              onFocus={() => {
                setIsSenderFocused(true);
                setSenderSuggestions(suggestContacts(senderQuery, 4));
              }}
              className={`w-full pl-10 pr-4 py-2 text-xs rounded-xl border outline-none transition ${
                isDark
                  ? 'bg-slate-900/90 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-400'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600'
              }`}
            />

            {/* Suggestions dropdown */}
            {isSenderFocused && senderSuggestions.length > 0 && (
              <div
                className={`absolute left-0 right-0 top-full mt-1.5 z-40 rounded-xl shadow-2xl border overflow-hidden ${
                  isDark ? 'bg-[#0E131F] border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <div className="p-1.5">
                  <div className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    Contacts suggérés
                  </div>
                  {senderSuggestions.map((c) => (
                    <div
                      key={c.id}
                      onMouseDown={() => handleSelectSuggestedContact(c)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition ${
                        isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold truncate">{c.name}</p>
                        <p className={`text-[11px] font-mono truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {c.email}
                        </p>
                      </div>
                      <span
                        className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                          c.category === 'pro'
                            ? isDark
                              ? 'bg-cyan-500/15 text-cyan-400'
                              : 'bg-blue-50 text-blue-700'
                            : isDark
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-emerald-50 text-emerald-700'
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
          <div className="relative sm:w-64">
            <div className="absolute left-3.5 top-2.5 text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Nom de fichier, mot-clé..."
              value={keywordQuery}
              onChange={(e) => setKeywordQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 text-xs rounded-xl border outline-none transition ${
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
            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition active:scale-95 disabled:opacity-50 shrink-0"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>Extraire</span>
          </button>
        </form>

        {/* Category Pills Bar (when search is loaded) */}
        {hasSearched && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-700/30">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'Tous', icon: FolderArchive },
                  { id: 'documents', label: 'Documents', icon: FileText },
                  { id: 'spreadsheets', label: 'Tableurs Excel', icon: FileSpreadsheet },
                  { id: 'images', label: 'Images', icon: ImageIcon },
                  { id: 'archives', label: 'Archives', icon: FileArchive },
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
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                      isActive
                        ? 'bg-cyan-600 text-white shadow-xs'
                        : isDark
                        ? 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                        isActive
                          ? 'bg-cyan-700 text-white'
                          : isDark
                          ? 'bg-slate-700 text-slate-300'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* View Mode & Sorting */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-800/20 rounded-lg p-0.5 border border-slate-700/40">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition ${
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
                  className={`p-1.5 rounded-md transition ${
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
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono transition border ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
                title="Inverser le tri"
              >
                <ArrowUpDown className="w-3 h-3 text-cyan-400" />
                <span>{sortOrder === 'desc' ? 'Plus récents' : 'Plus anciens'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Workspace Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-72 gap-3">
            <Loader2 className="w-9 h-9 animate-spin text-cyan-400" />
            <p className="text-xs font-mono text-slate-400">
              Extraction des pièces jointes en cours depuis Gmail...
            </p>
          </div>
        ) : !hasSearched ? (
          /* Welcome state before search */
          <div className="flex flex-col items-center justify-center min-h-[380px] max-w-lg mx-auto text-center p-8">
            <div className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mb-4 shadow-lg">
              <FolderArchive className="w-10 h-10" />
            </div>
            <h2 className="text-base font-bold mb-1.5">Extraction à la demande</h2>
            <p className={`text-xs leading-relaxed mb-6 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Pour préserver la légèreté et la rapidité de l'application, saisissez le nom ou l'adresse email d'un expéditeur pour cibler et extraire directement ses pièces jointes.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => executeSearch('')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition active:scale-95"
              >
                <span>Scanner tous les e-mails récents</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : sortedAttachments.length === 0 ? (
          <div className="text-center py-20">
            <File className="w-12 h-12 text-slate-500 mx-auto mb-3 opacity-40" />
            <h3 className="text-sm font-semibold mb-1">Aucune pièce jointe trouvée</h3>
            <p className={`text-xs max-w-sm mx-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Aucun document ne correspond aux critères de recherche spécifiés.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {sortedAttachments.map((att) => {
              const isSelected = selectedIds.has(att.id);
              const cat = getFileCategory(att.filename, att.mimeType);
              const isDownloading = downloadingId === att.id;

              return (
                <div
                  key={att.id}
                  className={`group relative flex flex-col justify-between p-4 rounded-xl border transition ${
                    isSelected
                      ? isDark
                        ? 'bg-cyan-950/20 border-cyan-500/50 shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                        : 'bg-cyan-50 border-cyan-300'
                      : isDark
                      ? 'bg-[#0B0F17] border-slate-800/80 hover:border-slate-700 hover:bg-[#0E131F]'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-xs'
                  }`}
                >
                  <div>
                    {/* Header: Image Thumbnail or Icon + Select Checkbox */}
                    {cat === 'images' ? (
                      <div className="relative w-full h-36 mb-3 rounded-lg overflow-hidden border border-slate-700/50 bg-slate-900/80 group/img">
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
                          className={`absolute top-2 right-2 p-1.5 rounded-lg backdrop-blur-md transition ${
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
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="p-2.5 rounded-xl bg-slate-800/30 border border-slate-700/40 shrink-0">
                          {getFileIcon(cat)}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSelect(att.id)}
                          className={`p-1 rounded-md transition ${
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
                    <p className={`text-[11px] font-mono mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                  <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-700/30">
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(att)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
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
                          className={`p-1.5 rounded-lg transition ${
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
                        className={`p-1.5 rounded-lg transition ${
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
          /* List View */
          <div
            className={`rounded-xl border overflow-hidden ${
              isDark ? 'bg-[#0B0F17] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className={isDark ? 'bg-slate-900/60 border-b border-slate-800' : 'bg-slate-100 border-b border-slate-200'}>
                  <th className="p-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={() => toggleSelectAll(sortedAttachments)}
                      className="text-slate-400 hover:text-white"
                    >
                      {selectedIds.size === sortedAttachments.length && sortedAttachments.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-3 font-semibold">Document</th>
                  <th className="p-3 font-semibold hidden sm:table-cell">Objet Email</th>
                  <th className="p-3 font-semibold hidden md:table-cell">Expéditeur</th>
                  <th className="p-3 font-semibold hidden lg:table-cell">Taille</th>
                  <th className="p-3 font-semibold">Date</th>
                  <th className="p-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAttachments.map((att) => {
                  const isSelected = selectedIds.has(att.id);
                  const cat = getFileCategory(att.filename, att.mimeType);
                  const isDownloading = downloadingId === att.id;

                  return (
                    <tr
                      key={att.id}
                      className={`border-b transition ${
                        isSelected
                          ? isDark
                            ? 'bg-cyan-950/20'
                            : 'bg-cyan-50'
                          : isDark
                          ? 'border-slate-800/60 hover:bg-slate-900/40'
                          : 'border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelect(att.id)}
                          className={isSelected ? 'text-cyan-400' : 'text-slate-400'}
                        >
                          {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {cat === 'images' ? (
                            <div
                              onClick={() => handleOpenPreview(att)}
                              className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-slate-700/60 bg-slate-900 cursor-pointer hover:ring-2 hover:ring-cyan-400 transition"
                              title="Cliquer pour afficher l'aperçu"
                            >
                              <ImageThumbnail token={token} attachment={att} isDark={isDark} />
                            </div>
                          ) : (
                            getFileIcon(cat)
                          )}
                          <span className="font-semibold truncate max-w-xs" title={att.filename}>
                            {att.filename}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 hidden sm:table-cell text-slate-400 truncate max-w-xs">
                        {att.emailSubject || '(Sans objet)'}
                      </td>
                      <td className="p-3 hidden md:table-cell font-mono text-[11px] text-slate-400 truncate max-w-xs">
                        {att.fromName || att.fromEmail}
                      </td>
                      <td className="p-3 hidden lg:table-cell font-mono text-[11px] text-slate-400">
                        {formatBytes(att.size)}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {att.dateStr}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(att)}
                            className={`p-1.5 rounded-lg transition ${
                              isDark ? 'text-cyan-400 hover:bg-cyan-500/10' : 'text-cyan-700 hover:bg-cyan-50'
                            }`}
                            title="Aperçu"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownload(att)}
                            disabled={isDownloading}
                            className={`p-1.5 rounded-lg transition ${
                              isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'
                            }`}
                            title="Télécharger"
                          >
                            {isDownloading ? (
                              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
