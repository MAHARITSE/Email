import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Star,
  Trash2,
  Mail,
  Reply,
  Forward,
  CornerUpLeft,
  Send,
  Paperclip,
  Download,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  File,
  Loader2,
  Sparkles,
  Wand2,
  Check,
  Briefcase,
  User,
  Globe,
  ChevronDown,
  ChevronUp,
  Eye,
  MessageSquare,
  Users,
  UserPlus,
  FileSignature,
  Printer,
  ExternalLink,
  ChevronsUpDown,
  MoreVertical,
  Smile,
  ShieldCheck,
  Languages,
  X,
  Copy,
  FolderMinus,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { ParsedEmail, EmailAttachment } from '../types/gmail';
import {
  ComposeOptions,
  downloadAttachmentFile,
  downloadAttachmentsAsZip,
  fetchThread,
  getAttachmentBytes,
} from '../services/gmailApi';
import { useTheme } from '../context/ThemeContext';
import {
  CATEGORIES,
  EmailCategory,
  classifyEmailFast,
} from '../services/emailClassifier';
import {
  getSmartReplySuggestions,
  improveEmailText,
  SmartReplySuggestion,
  ImproveAction,
} from '../services/aiAssistant';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import {
  isContactFavorite,
  toggleContactFavorite,
  saveLocalContact,
  getLocalContacts,
} from '../services/contactsService';
import {
  getDefaultSignature,
  formatSignatureText,
  formatSignatureHtml,
} from '../services/signatureService';
import { detectFileKind, isPreviewableAttachment } from '../utils/fileKind';

interface EmailDetailProps {
  email: ParsedEmail;
  currentUserEmail: string;
  token?: string | null;
  emailCategory?: 'pro' | 'personal' | 'sites';
  onUpdateEmailCategory?: (emailId: string, cat: 'pro' | 'personal' | 'sites') => void;
  onBack: () => void;
  onToggleStar: (email: ParsedEmail) => void;
  onToggleUnread: (email: ParsedEmail) => void;
  onRequestTrash: (email: ParsedEmail) => void;
  onOpenReply: (email: ParsedEmail, mode?: 'reply' | 'replyAll') => void;
  onOpenForward: (email: ParsedEmail) => void;
  onRequestSendQuickReply: (opts: ComposeOptions) => void;
}

const EMOJI_REACTIONS = ['👍', '❤️', '👏', '🎉', '😊', '🙏', '🔥', '👀'];

export const EmailDetail: React.FC<EmailDetailProps> = ({
  email,
  currentUserEmail,
  token,
  emailCategory,
  onUpdateEmailCategory,
  onBack,
  onToggleStar,
  onToggleUnread,
  onRequestTrash,
  onOpenReply,
  onOpenForward,
  onRequestSendQuickReply,
}) => {
  const { isDark } = useTheme();

  // Thread conversation messages state
  const [threadMessages, setThreadMessages] = useState<ParsedEmail[]>([email]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [collapsedMessages, setCollapsedMessages] = useState<Record<string, boolean>>({});
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});
  const [trimmedExpanded, setTrimmedExpanded] = useState<Record<string, boolean>>({});
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [activeEmojiPickerId, setActiveEmojiPickerId] = useState<string | null>(null);
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({});
  const [showTranslateBanner, setShowTranslateBanner] = useState(true);

  // Quick reply & AI states
  const [replyMode, setReplyMode] = useState<'reply' | 'replyAll' | 'forward'>('reply');
  const [replyTargetEmail, setReplyTargetEmail] = useState<ParsedEmail>(email);
  const [quickReplyText, setQuickReplyText] = useState('');
  const [quickReplyCc, setQuickReplyCc] = useState('');
  const [quickReplyBcc, setQuickReplyBcc] = useState('');
  const [showQuickReplyCc, setShowQuickReplyCc] = useState(false);
  const [showQuickReplyBcc, setShowQuickReplyBcc] = useState(false);
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [includeSignatureInQuickReply, setIncludeSignatureInQuickReply] = useState(true);
  const [contactsVersion, setContactsVersion] = useState(0);
  const [downloadingAttId, setDownloadingAttId] = useState<string | null>(null);
  const [isZippingEmail, setIsZippingEmail] = useState(false);

  // Document Preview Modal states
  const [previewAttachment, setPreviewAttachment] = useState<EmailAttachment | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewArrayBuffer, setPreviewArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Resolved CID inline image map (contentId/filename -> blobUrl or dataUrl)
  const [cidMap, setCidMap] = useState<Record<string, string>>({});

  const [suggestions, setSuggestions] = useState<SmartReplySuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [customAiPrompt, setCustomAiPrompt] = useState('');
  const [isGeneratingCustomReply, setIsGeneratingCustomReply] = useState(false);
  const [isImprovingText, setIsImprovingText] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  const quickReplyRef = useRef<HTMLDivElement>(null);

  const effectiveCategory = emailCategory || classifyEmailFast(email);
  const catInfo = CATEGORIES[effectiveCategory];

  // Listen to contacts updates
  useEffect(() => {
    const handleUpdate = () => setContactsVersion((v) => v + 1);
    window.addEventListener('gmail-contacts-updated', handleUpdate);
    return () => window.removeEventListener('gmail-contacts-updated', handleUpdate);
  }, []);

  // Resolve inline CID image attachments automatically
  useEffect(() => {
    let isCancelled = false;
    if (!threadMessages.length) return;

    threadMessages.forEach((msg) => {
      if (!msg.attachments || !msg.attachments.length) return;

      msg.attachments.forEach(async (att) => {
        const isImage = att.mimeType?.toLowerCase().startsWith('image/');
        const cidKey = att.contentId || att.filename;
        if (!cidKey && !isImage) return;

        const key = cidKey || att.id;
        if (cidMap[key]) return; // Already resolved

        if (att.data) {
          const dataUrl = `data:${att.mimeType || 'image/png'};base64,${att.data.replace(/-/g, '+').replace(/_/g, '/')}`;
          if (!isCancelled) {
            setCidMap((prev) => ({ ...prev, [key]: dataUrl }));
          }
        } else if (att.attachmentId && token) {
          try {
            const bytes = await getAttachmentBytes(token, msg.id, att.attachmentId);
            if (isCancelled) return;
            const blob = new Blob([bytes], { type: att.mimeType || 'image/png' });
            const blobUrl = URL.createObjectURL(blob);
            setCidMap((prev) => ({ ...prev, [key]: blobUrl }));
          } catch (e) {
            console.warn('Erreur chargement image inline CID:', key, e);
          }
        }
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [threadMessages, token]);

  // 1. Fetch full thread conversation when email changes
  useEffect(() => {
    let isCancelled = false;
    setThreadMessages([email]);
    setCollapsedMessages({});
    setDetailsOpen({});
    setTrimmedExpanded({});

    if (token && email.threadId) {
      setIsLoadingThread(true);
      fetchThread(token, email.threadId)
        .then((msgs) => {
          if (!isCancelled && msgs && msgs.length > 0) {
            setThreadMessages(msgs);
            setReplyTargetEmail(msgs[msgs.length - 1]);
            // By default, collapse all except the last message
            const collapsed: Record<string, boolean> = {};
            msgs.forEach((m, idx) => {
              if (idx < msgs.length - 1) {
                collapsed[m.id] = true;
              }
            });
            setCollapsedMessages(collapsed);
          }
        })
        .catch((err) => {
          console.warn('Could not fetch thread messages:', err);
        })
        .finally(() => {
          if (!isCancelled) setIsLoadingThread(false);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [email.id, email.threadId, token]);

  // 2. Load Smart Reply Suggestions
  useEffect(() => {
    let isCancelled = false;
    const loadSuggestions = async () => {
      setIsLoadingSuggestions(true);
      try {
        const lastMsg = threadMessages[threadMessages.length - 1] || email;
        const bodyContent = lastMsg.bodyText || lastMsg.snippet;
        const res = await getSmartReplySuggestions(
          lastMsg.subject,
          bodyContent,
          lastMsg.fromName || lastMsg.fromEmail
        );
        if (!isCancelled && res && res.length > 0) {
          setSuggestions(res);
        }
      } catch (e) {
        console.warn('Could not load smart suggestions', e);
      } finally {
        if (!isCancelled) setIsLoadingSuggestions(false);
      }
    };

    loadSuggestions();
    return () => {
      isCancelled = true;
    };
  }, [threadMessages, email]);

  const toggleCollapseMessage = (msgId: string) => {
    setCollapsedMessages((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const toggleDetails = (msgId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDetailsOpen((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const toggleAllMessages = () => {
    const anyCollapsed = Object.values(collapsedMessages).some(Boolean);
    if (anyCollapsed) {
      // Expand all
      setCollapsedMessages({});
    } else {
      // Collapse all except last
      const nextCollapsed: Record<string, boolean> = {};
      threadMessages.forEach((m, idx) => {
        if (idx < threadMessages.length - 1) {
          nextCollapsed[m.id] = true;
        }
      });
      setCollapsedMessages(nextCollapsed);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAddEmoji = (msgId: string, emoji: string) => {
    setMessageReactions((prev) => {
      const current = prev[msgId] || [];
      if (current.includes(emoji)) {
        return { ...prev, [msgId]: current.filter((e) => e !== emoji) };
      }
      return { ...prev, [msgId]: [...current, emoji] };
    });
    setActiveEmojiPickerId(null);
  };

  const handleTriggerReply = (msg: ParsedEmail, mode: 'reply' | 'replyAll' | 'forward') => {
    if (mode === 'replyAll') {
      setReplyTargetEmail(threadMessages[0] || email);
    } else if (mode === 'reply') {
      setReplyTargetEmail(threadMessages[threadMessages.length - 1] || email);
    } else {
      setReplyTargetEmail(msg);
    }
    setReplyMode(mode);
    setShowQuickReply(true);

    if (mode === 'forward') {
      const forwardPrefix = `\n\n\n---------- Message transféré ----------\nDe : ${msg.fromName || msg.fromEmail} <${msg.fromEmail}>\nDate : ${msg.dateStr}\nObjet : ${msg.subject}\nÀ : ${msg.to}\n${msg.cc ? `Cc : ${msg.cc}\n` : ''}\n${msg.bodyText || msg.snippet}`;
      setQuickReplyText(forwardPrefix);
    }

    setTimeout(() => {
      quickReplyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Preview Attachment Handler
  const handlePreviewAttachment = async (att: EmailAttachment) => {
    setIsLoadingPreview(true);
    setPreviewAttachment(att);
    setPreviewError(null);

    if (!token) {
      setIsLoadingPreview(false);
      setPreviewError(
        'Session expirée ou jeton d\'accès manquant. Reconnectez-vous pour prévisualiser les pièces jointes.'
      );
      return;
    }

    try {
      const bytes = await getAttachmentBytes(token, att.messageId, att.attachmentId);
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      );
      setPreviewArrayBuffer(arrayBuffer as ArrayBuffer);

      const blob = new Blob([arrayBuffer], { type: att.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl(url);
    } catch (err: any) {
      console.error('Erreur chargement aperçu:', err);
      setPreviewError(
        err?.message || 'Impossible de récupérer cette pièce jointe depuis Gmail. Vérifiez votre connexion puis réessayez.'
      );
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const closePreview = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setPreviewAttachment(null);
    setPreviewBlobUrl(null);
    setPreviewArrayBuffer(null);
    setIsLoadingPreview(false);
    setPreviewError(null);
  };

  // Single Attachment Download
  const handleDownloadSingle = async (att: EmailAttachment) => {
    if (!token) return;
    setDownloadingAttId(att.id);
    try {
      await downloadAttachmentFile(token, att);
    } catch (err) {
      console.error('Erreur téléchargement pièce jointe:', err);
    } finally {
      setDownloadingAttId(null);
    }
  };

  // ZIP Download for all attachments of a message
  const handleDownloadAllZip = async (attachments: EmailAttachment[]) => {
    if (!token || attachments.length === 0) return;
    setIsZippingEmail(true);
    try {
      await downloadAttachmentsAsZip(token, attachments);
    } catch (err) {
      console.error('Erreur téléchargement ZIP:', err);
    } finally {
      setIsZippingEmail(false);
    }
  };

  // Apply Smart Reply Suggestion
  const handleApplySuggestion = (sugg: SmartReplySuggestion) => {
    setShowQuickReply(true);
    setQuickReplyText(sugg.replyText);
    setTimeout(() => {
      quickReplyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Custom AI Reply Generator
  const handleGenerateCustomReply = async () => {
    if (!customAiPrompt.trim()) return;
    setIsGeneratingCustomReply(true);
    try {
      const lastMsg = threadMessages[threadMessages.length - 1] || email;
      const improved = await improveEmailText(
        `Génère une réponse professionnelle et polie à cet email. Instruction spécifique : "${customAiPrompt}". Contexte de l'email : "${lastMsg.bodyText || lastMsg.snippet}"`,
        'professional'
      );
      if (improved) {
        setShowQuickReply(true);
        setQuickReplyText(improved);
        setCustomAiPrompt('');
        setTimeout(() => {
          quickReplyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    } catch (err) {
      console.warn('Erreur génération custom AI reply:', err);
    } finally {
      setIsGeneratingCustomReply(false);
    }
  };

  // Quick Reply Polish with AI
  const handleImproveQuickReply = async (action: ImproveAction) => {
    if (!quickReplyText.trim() || isImprovingText) return;
    setIsImprovingText(true);
    try {
      const improved = await improveEmailText(quickReplyText, action);
      if (improved) {
        setQuickReplyText(improved);
      }
    } catch (err) {
      console.warn('Erreur amélioration de texte:', err);
    } finally {
      setIsImprovingText(false);
    }
  };

  // Send Quick Reply
  const handleSendQuickReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickReplyText.trim()) return;

    let finalBody = quickReplyText.trim();

    // Automatically append default reply signature
    const defaultSig = getDefaultSignature('reply');
    if (defaultSig) {
      const sigText = formatSignatureText(defaultSig);
      if (sigText && !finalBody.includes(sigText)) {
        finalBody = `${finalBody}\n\n--\n${sigText}`;
      }
    }

    let toAddresses = '';
    let ccAddresses = quickReplyCc.trim();
    let bccAddresses = quickReplyBcc.trim();
    let targetMsg = threadMessages[threadMessages.length - 1] || email;
    let replySubject = email.subject.startsWith('Re:')
      ? email.subject
      : `Re: ${email.subject}`;

    if (replyMode === 'replyAll') {
      // Reply all: reply to the first email in the thread, with other participants in CC
      const firstMsg = threadMessages[0] || email;
      targetMsg = firstMsg;
      toAddresses = firstMsg.fromEmail;

      const allParticipants = new Set<string>();
      if (ccAddresses) {
        ccAddresses.split(',').forEach((s) => allParticipants.add(s.trim()));
      }
      threadMessages.forEach((m) => {
        if (m.fromEmail && !m.fromEmail.toLowerCase().includes(currentUserEmail.toLowerCase())) {
          allParticipants.add(m.fromEmail);
        }
        if (m.to) {
          m.to.split(',').forEach((s) => {
            const trimmed = s.trim();
            if (trimmed && !trimmed.toLowerCase().includes(currentUserEmail.toLowerCase())) {
              allParticipants.add(trimmed);
            }
          });
        }
        if (m.cc) {
          m.cc.split(',').forEach((s) => {
            const trimmed = s.trim();
            if (trimmed && !trimmed.toLowerCase().includes(currentUserEmail.toLowerCase())) {
              allParticipants.add(trimmed);
            }
          });
        }
      });
      allParticipants.delete(firstMsg.fromEmail);
      ccAddresses = Array.from(allParticipants).join(', ');
    } else {
      // Reply: reply to the last person only
      const lastMsg = threadMessages[threadMessages.length - 1] || email;
      targetMsg = lastMsg;
      toAddresses = lastMsg.fromEmail;
    }

    replySubject = targetMsg.subject.startsWith('Re:')
      ? targetMsg.subject
      : `Re: ${targetMsg.subject}`;

    onRequestSendQuickReply({
      to: toAddresses,
      cc: ccAddresses || undefined,
      bcc: bccAddresses || undefined,
      subject: replySubject,
      body: finalBody,
      threadId: targetMsg.threadId || email.threadId,
      inReplyTo: targetMsg.id,
      references: targetMsg.id,
    });

    setQuickReplyText('');
    setShowQuickReply(false);
  };

  // Get list of unique participants for thread overview
  const threadParticipants = useMemo(() => {
    const map = new Map<string, string>();
    threadMessages.forEach((m) => {
      const name = m.fromName || m.fromEmail.split('@')[0];
      map.set(m.fromEmail.toLowerCase(), name);
    });
    return Array.from(map.entries()).map(([email, name]) => ({ email, name }));
  }, [threadMessages]);

  const allCollapsed = useMemo(() => {
    return threadMessages.length > 1 && Object.values(collapsedMessages).every(Boolean);
  }, [threadMessages, collapsedMessages]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto select-text font-sans">
      {/* Top Sticky Navigation / Actions Bar */}
      <div
        className={`sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 py-3 border-b backdrop-blur-md transition-colors ${
          isDark
            ? 'bg-[#0A0D14]/90 border-slate-800 text-slate-200'
            : 'bg-white/95 border-slate-200 text-slate-800'
        }`}
      >
        {/* Left: Back + Common Email Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            id="detail-back-btn"
            type="button"
            onClick={onBack}
            className={`inline-flex items-center gap-1.5 rounded-xl p-2 text-xs font-semibold transition ${
              isDark
                ? 'hover:bg-slate-800 text-slate-300 hover:text-white'
                : 'hover:bg-slate-100 text-slate-700 hover:text-black'
            }`}
            title="Retour à la liste"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline font-mono">Retour</span>
          </button>

          <div className="h-4 w-px bg-slate-400/30 mx-1" />

          {/* Star Toggle */}
          <button
            id="detail-star-btn"
            type="button"
            onClick={() => onToggleStar(email)}
            className={`p-2 rounded-xl transition ${
              email.isStarred
                ? 'text-amber-400 hover:bg-amber-400/10'
                : isDark
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={email.isStarred ? 'Retirer l\'étoile' : 'Ajouter une étoile'}
          >
            <Star className={`h-4 w-4 ${email.isStarred ? 'fill-amber-400' : ''}`} />
          </button>

          {/* Mark Unread */}
          <button
            id="detail-unread-btn"
            type="button"
            onClick={() => onToggleUnread(email)}
            className={`p-2 rounded-xl transition ${
              isDark
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Marquer comme non lu"
          >
            <Mail className="h-4 w-4" />
          </button>

          {/* Trash / Delete */}
          <button
            id="detail-trash-btn"
            type="button"
            onClick={() => onRequestTrash(email)}
            className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
            title="Mettre à la corbeille"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Right: Category Picker + Header Utilities (Expand all, Print) */}
        <div className="flex items-center gap-2">
          {/* Thread expand/collapse all */}
          {threadMessages.length > 1 && (
            <button
              type="button"
              onClick={toggleAllMessages}
              className={`p-2 rounded-xl transition ${
                isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-black'
              }`}
              title={allCollapsed ? 'Tout développer' : 'Tout réduire'}
            >
              <ChevronsUpDown className="h-4 w-4" />
            </button>
          )}

          {/* Print button */}
          <button
            type="button"
            onClick={handlePrint}
            className={`p-2 rounded-xl transition ${
              isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-black'
            }`}
            title="Imprimer tout le fil"
          >
            <Printer className="h-4 w-4" />
          </button>

          {/* Category Dropdown */}
          <div className="relative">
            <button
              id="detail-category-btn"
              type="button"
              onClick={() => setShowCategoryMenu(!showCategoryMenu)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition ${
                isDark ? catInfo.badgeDark : catInfo.badgeLight
              }`}
            >
              {effectiveCategory === 'pro' && <Briefcase className="h-3.5 w-3.5" />}
              {effectiveCategory === 'personal' && <User className="h-3.5 w-3.5" />}
              {effectiveCategory === 'sites' && <Globe className="h-3.5 w-3.5" />}
              <span>{catInfo.label}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {showCategoryMenu && (
              <div
                className={`absolute right-0 top-full mt-1.5 w-48 rounded-xl shadow-xl border overflow-hidden z-30 ${
                  isDark ? 'bg-[#0E131F] border-slate-700' : 'bg-white border-slate-200'
                }`}
              >
                <div
                  className={`p-2 text-[10px] font-mono uppercase tracking-wider border-b ${
                    isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'
                  }`}
                >
                  Changer de catégorie
                </div>
                {(['pro', 'personal', 'sites'] as const).map((c) => {
                  const info = CATEGORIES[c];
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        onUpdateEmailCategory?.(email.id, c);
                        setShowCategoryMenu(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-xs transition ${
                        effectiveCategory === c
                          ? isDark
                            ? 'bg-cyan-500/10 text-cyan-400 font-bold'
                            : 'bg-cyan-50 text-cyan-800 font-bold'
                          : isDark
                          ? 'text-slate-300 hover:bg-slate-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {c === 'pro' && <Briefcase className="h-3.5 w-3.5 text-cyan-400" />}
                        {c === 'personal' && <User className="h-3.5 w-3.5 text-emerald-400" />}
                        {c === 'sites' && <Globe className="h-3.5 w-3.5 text-violet-400" />}
                        <span>{info.label}</span>
                      </div>
                      {effectiveCategory === c && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TOP SUBJECT & FOLDER BADGE HEADER (IDENTICAL TO GMAIL AS IN IMAGE) */}
      <div className="px-6 sm:px-10 pt-6 pb-4 border-b border-slate-700/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <h1
              id="detail-email-subject"
              className={`text-xl sm:text-2xl font-bold tracking-tight ${
                isDark ? 'text-white' : 'text-slate-950'
              }`}
            >
              {email.subject || '(Sans objet)'}
            </h1>

            {/* Folder badge like Gmail pill: Boîte de réception ✕ */}
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-200/80 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
              <span>Boîte de réception</span>
              <button
                type="button"
                onClick={() => onBack()}
                className="hover:text-red-500 transition p-0.5"
                title="Supprimer le libellé de l'affichage"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Thread Participants Pill list if multiple messages */}
        {threadMessages.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyan-400">
              <Users className="h-3.5 w-3.5" /> Participants ({threadParticipants.length}) :
            </span>
            {threadParticipants.map((p) => (
              <span
                key={p.email}
                className={`px-2 py-0.5 rounded-md text-[11px] ${
                  isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-800'
                }`}
                title={p.email}
              >
                {p.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main Conversation Flow */}
      <div className="flex-1 p-4 sm:p-8 space-y-5 max-w-5xl mx-auto w-full">
        {isLoadingThread && threadMessages.length === 1 ? (
          <div className="flex items-center justify-center py-6 gap-2 text-xs font-mono text-cyan-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Chargement du fil de discussion...</span>
          </div>
        ) : null}

        {/* Render each message in chronological order matching Gmail replica */}
        {threadMessages.map((msg, index) => {
          const isCollapsed = Boolean(collapsedMessages[msg.id]);
          const isLastMessage = index === threadMessages.length - 1;
          const isDetailsOpen = Boolean(detailsOpen[msg.id]);
          const isTrimmedOpen = Boolean(trimmedExpanded[msg.id]);
          const initial = (msg.fromName || msg.fromEmail || '?').charAt(0).toUpperCase();

          // Avatar background palette
          const avatarColors = [
            'bg-amber-600',
            'bg-purple-600',
            'bg-blue-600',
            'bg-emerald-600',
            'bg-rose-600',
            'bg-teal-600',
          ];
          const avatarBg = avatarColors[index % avatarColors.length];

          // Process HTML body for inline CID images
          let rawHtml = msg.bodyHtml || '';
          if (rawHtml) {
            // Replace cid: references with resolved inline data/blob URLs or cidMap
            if (msg.attachments && msg.attachments.length > 0) {
              msg.attachments.forEach((att) => {
                const keys = [att.contentId, att.filename, att.id].filter(Boolean) as string[];
                keys.forEach((k) => {
                  const cleanKey = k.replace(/^<|>$/g, '');
                  const resolvedUrl =
                    cidMap[k] ||
                    cidMap[cleanKey] ||
                    (att.data
                      ? `data:${att.mimeType || 'image/png'};base64,${att.data.replace(/-/g, '+').replace(/_/g, '/')}`
                      : null);

                  if (resolvedUrl && cleanKey) {
                    const regex = new RegExp(`cid:<?${cleanKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>?`, 'gi');
                    rawHtml = rawHtml.replace(regex, resolvedUrl);
                  }
                });
              });
            }
          }

          const sanitizedMsgHtml = rawHtml
            ? DOMPurify.sanitize(rawHtml, {
                ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|data|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-]|$))/i,
                ADD_ATTR: ['target', 'style', 'src', 'alt', 'width', 'height', 'class', 'loading', 'srcset', 'align'],
                FORBID_TAGS: ['script', 'iframe', 'form'],
              })
            : null;

          const isSenderFav = isContactFavorite(msg.fromEmail);
          const reactions = messageReactions[msg.id] || [];

          return (
            <div
              key={msg.id}
              className={`rounded-2xl border transition-all ${
                isLastMessage
                  ? isDark
                    ? 'bg-[#080B10] border-slate-700 shadow-[0_4px_20px_rgba(0,0,0,0.4)]'
                    : 'bg-white border-slate-300 shadow-sm'
                  : isDark
                  ? 'bg-[#0A0E17] border-slate-800/80 hover:border-slate-700'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* COLLAPSED MESSAGE VIEW (As shown in image top item) */}
              {isCollapsed ? (
                <div
                  onClick={() => toggleCollapseMessage(msg.id)}
                  className="flex items-center justify-between p-3.5 sm:p-4 cursor-pointer select-none hover:bg-slate-500/5 transition"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Circle Avatar */}
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs shrink-0 ${avatarBg}`}
                    >
                      {initial}
                    </div>

                    {/* Sender Name/Email */}
                    <span
                      className={`text-xs font-bold shrink-0 max-w-[180px] sm:max-w-[220px] truncate ${
                        isDark ? 'text-slate-200' : 'text-slate-900'
                      }`}
                    >
                      {msg.fromName || msg.fromEmail}
                    </span>

                    {/* Snippet on same row */}
                    <span
                      className={`text-xs truncate flex-1 ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {msg.snippet || '(Corps de message replié)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {msg.dateStr}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar(msg);
                      }}
                      className="p-1 hover:scale-110 transition"
                      title={msg.isStarred ? 'Message suivi' : 'Non suivi'}
                    >
                      <Star
                        className={`h-4 w-4 ${
                          msg.isStarred ? 'text-amber-400 fill-amber-400' : 'text-slate-400'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ) : (
                /* EXPANDED MESSAGE VIEW (Exact Gmail Layout as shown in image.png) */
                <div className="p-4 sm:p-6">
                  {/* Message Header */}
                  <div className="flex items-start justify-between gap-3 pb-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      {/* Left Avatar Circle */}
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-xs shrink-0 ${avatarBg}`}
                      >
                        {initial}
                      </div>

                      {/* Sender Info & Recipient Row with Dropdown Details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3
                            className={`text-sm sm:text-base font-bold truncate ${
                              isDark ? 'text-white' : 'text-slate-950'
                            }`}
                          >
                            {msg.fromName || msg.fromEmail}
                          </h3>

                          {/* VIP Favorite Star */}
                          <button
                            type="button"
                            onClick={() => {
                              const existing = getLocalContacts().find(
                                (c) => c.email.toLowerCase() === msg.fromEmail.toLowerCase()
                              );
                              if (existing) {
                                toggleContactFavorite(existing.id);
                              } else {
                                saveLocalContact({
                                  name: msg.fromName || msg.fromEmail.split('@')[0],
                                  email: msg.fromEmail,
                                  isFavorite: true,
                                  category: 'pro',
                                });
                              }
                            }}
                            className={`p-0.5 rounded transition ${
                              isSenderFav
                                ? 'text-amber-400 hover:scale-110'
                                : 'text-slate-400 hover:text-amber-400 hover:scale-110'
                            }`}
                            title={
                              isSenderFav
                                ? 'Contact Favori VIP (Priorité en tête de liste)'
                                : 'Ajouter ce contact en Favori VIP'
                            }
                          >
                            <Star className={`h-4 w-4 ${isSenderFav ? 'fill-amber-400' : ''}`} />
                          </button>

                          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            &lt;{msg.fromEmail}&gt;
                          </span>
                        </div>

                        {/* LINE 2: "À rhsemstul, moi ▼" + prominent CC display matching Gmail */}
                        <div className="relative mt-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span>À :</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {msg.to || currentUserEmail}
                            </span>

                            {/* CC PROMINENT DISPLAY */}
                            {msg.cc && (
                              <>
                                <span className="text-slate-400 mx-1">|</span>
                                <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                                  Cc : {msg.cc}
                                </span>
                              </>
                            )}

                            {/* Dropdown Chevron for Full Gmail Details */}
                            <button
                              type="button"
                              onClick={(e) => toggleDetails(msg.id, e)}
                              className={`p-0.5 rounded hover:bg-slate-500/10 transition inline-flex items-center ${
                                isDetailsOpen ? 'text-cyan-500' : 'text-slate-400'
                              }`}
                              title="Afficher les détails de distribution"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* GMAIL POPUP DETAILS CARD (De, À, Cc, Date, Objet, Sécurité) */}
                          {isDetailsOpen && (
                            <div
                              className={`absolute left-0 top-full mt-2 w-full max-w-md rounded-xl p-4 shadow-xl border z-30 text-xs font-sans space-y-2.5 ${
                                isDark
                                  ? 'bg-[#0E131F] border-slate-700 text-slate-300 shadow-[0_10px_25px_rgba(0,0,0,0.5)]'
                                  : 'bg-white border-slate-200 text-slate-700 shadow-xl'
                              }`}
                            >
                              <div className="grid grid-cols-[60px_1fr] gap-2 items-baseline">
                                <span className="font-bold text-slate-400">De :</span>
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {msg.fromName} &lt;{msg.fromEmail}&gt;
                                </span>
                              </div>

                              <div className="grid grid-cols-[60px_1fr] gap-2 items-baseline">
                                <span className="font-bold text-slate-400">À :</span>
                                <span>{msg.to || currentUserEmail}</span>
                              </div>

                              {msg.cc && (
                                <div className="grid grid-cols-[60px_1fr] gap-2 items-baseline">
                                  <span className="font-bold text-cyan-500">Cc :</span>
                                  <span className="font-medium text-cyan-600 dark:text-cyan-400">
                                    {msg.cc}
                                  </span>
                                </div>
                              )}

                              <div className="grid grid-cols-[60px_1fr] gap-2 items-baseline">
                                <span className="font-bold text-slate-400">Date :</span>
                                <span>{msg.dateStr}</span>
                              </div>

                              <div className="grid grid-cols-[60px_1fr] gap-2 items-baseline">
                                <span className="font-bold text-slate-400">Objet :</span>
                                <span>{msg.subject || '(Sans objet)'}</span>
                              </div>

                              <div className="grid grid-cols-[60px_1fr] gap-2 items-center pt-1 border-t border-inherit">
                                <span className="font-bold text-slate-400">Sécurité :</span>
                                <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Chiffrement standard (TLS)
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Header Right Action Icons (Date, Star, Emoji, Reply, More Menu) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mr-1`}>
                        {msg.dateStr}
                      </span>

                      {/* Star button */}
                      <button
                        type="button"
                        onClick={() => onToggleStar(msg)}
                        className="p-1.5 rounded-lg hover:bg-slate-500/10 text-slate-400 hover:text-amber-400 transition"
                        title={msg.isStarred ? 'Suivi' : 'Marquer comme suivi'}
                      >
                        <Star
                          className={`h-4 w-4 ${
                            msg.isStarred ? 'text-amber-400 fill-amber-400' : ''
                          }`}
                        />
                      </button>

                      {/* Emoji reaction button */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveEmojiPickerId(activeEmojiPickerId === msg.id ? null : msg.id)
                          }
                          className="p-1.5 rounded-lg hover:bg-slate-500/10 text-slate-400 hover:text-slate-200 transition"
                          title="Ajouter une réaction"
                        >
                          <Smile className="h-4 w-4" />
                        </button>

                        {activeEmojiPickerId === msg.id && (
                          <div
                            className={`absolute right-0 top-full mt-1 p-2 rounded-xl shadow-xl border flex items-center gap-1.5 z-30 ${
                              isDark ? 'bg-[#0E131F] border-slate-700' : 'bg-white border-slate-200'
                            }`}
                          >
                            {EMOJI_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleAddEmoji(msg.id, emoji)}
                                className="text-base p-1 rounded hover:bg-slate-500/20 transition hover:scale-125"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Quick Reply Header Arrow */}
                      <button
                        type="button"
                        onClick={() => handleTriggerReply(msg, 'reply')}
                        className="p-1.5 rounded-lg hover:bg-slate-500/10 text-slate-400 hover:text-cyan-400 transition"
                        title="Répondre à ce message"
                      >
                        <CornerUpLeft className="h-4 w-4" />
                      </button>

                      {/* More Menu (⋮) */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveMenuMessageId(activeMenuMessageId === msg.id ? null : msg.id)
                          }
                          className="p-1.5 rounded-lg hover:bg-slate-500/10 text-slate-400 hover:text-slate-200 transition"
                          title="Plus d'options"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {activeMenuMessageId === msg.id && (
                          <div
                            className={`absolute right-0 top-full mt-1 w-48 rounded-xl shadow-xl border overflow-hidden z-30 text-xs ${
                              isDark ? 'bg-[#0E131F] border-slate-700' : 'bg-white border-slate-200'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                handleTriggerReply(msg, 'reply');
                                setActiveMenuMessageId(null);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 hover:bg-slate-500/10 transition"
                            >
                              <Reply className="h-3.5 w-3.5 text-cyan-400" />
                              <span>Répondre</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                handleTriggerReply(msg, 'replyAll');
                                setActiveMenuMessageId(null);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 hover:bg-slate-500/10 transition"
                            >
                              <Users className="h-3.5 w-3.5 text-emerald-400" />
                              <span>Répondre à tous</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                onOpenForward(msg);
                                setActiveMenuMessageId(null);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 hover:bg-slate-500/10 transition"
                            >
                              <Forward className="h-3.5 w-3.5 text-blue-400" />
                              <span>Transférer</span>
                            </button>

                            <div className="h-px bg-inherit my-1" />

                            <button
                              type="button"
                              onClick={() => {
                                window.print();
                                setActiveMenuMessageId(null);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 hover:bg-slate-500/10 transition"
                            >
                              <Printer className="h-3.5 w-3.5 text-slate-400" />
                              <span>Imprimer ce message</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                onRequestTrash(msg);
                                setActiveMenuMessageId(null);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 hover:bg-red-500/10 text-red-400 transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Supprimer ce message</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SMART TRANSLATE BANNER (As seen in Gmail image: "Ce message semble être en anglais...") */}
                  {showTranslateBanner && (
                    <div
                      className={`flex items-center justify-between p-2.5 mb-4 rounded-xl border text-xs ${
                        isDark
                          ? 'bg-slate-900/80 border-slate-800 text-slate-300'
                          : 'bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Languages className="h-4 w-4 text-cyan-400" />
                        <span>Ce message est en français.</span>
                        <button
                          type="button"
                          className="font-semibold text-cyan-600 dark:text-cyan-400 hover:underline ml-1"
                        >
                          Traduire en : anglais
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowTranslateBanner(false)}
                        className="p-1 hover:bg-slate-500/10 rounded"
                        title="Masquer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Message Body */}
                  <div className="py-2 min-h-[60px]">
                    {sanitizedMsgHtml ? (
                      <div
                        className={`prose prose-sm max-w-none break-words ${
                          isDark ? 'prose-invert text-slate-200' : 'text-slate-800'
                        }`}
                        dangerouslySetInnerHTML={{ __html: sanitizedMsgHtml }}
                      />
                    ) : (
                      <div
                        className={`text-sm leading-relaxed whitespace-pre-wrap font-sans ${
                          isDark ? 'text-slate-200' : 'text-slate-800'
                        }`}
                      >
                        {msg.bodyText || '(Corps de message vide)'}
                      </div>
                    )}
                  </div>

                  {/* Emoji Reactions Pills */}
                  {reactions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2">
                      {reactions.map((emo, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-500/10 border border-slate-500/20"
                        >
                          {emo}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Attachments Grid if any */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div
                      className={`border rounded-xl p-4 mt-5 ${
                        isDark ? 'border-slate-800 bg-[#0B0F17]' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/30">
                        <div className="flex items-center gap-2">
                          <Paperclip className="h-4 w-4 text-cyan-400" />
                          <span
                            className={`text-xs font-mono font-bold uppercase tracking-wider ${
                              isDark ? 'text-slate-200' : 'text-slate-800'
                            }`}
                          >
                            {msg.attachments.length} Pièce{msg.attachments.length > 1 ? 's' : ''} jointe{msg.attachments.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        {msg.attachments.length > 1 && token && (
                          <button
                            type="button"
                            onClick={() => handleDownloadAllZip(msg.attachments)}
                            disabled={isZippingEmail}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-semibold rounded-lg transition ${
                              isDark
                                ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20'
                                : 'bg-cyan-50 border border-cyan-300 text-cyan-800 hover:bg-cyan-100'
                            }`}
                          >
                            <Download className="h-3 w-3" />
                            <span>Tout télécharger (.ZIP)</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {msg.attachments.map((att) => {
                          const isDownloading = downloadingAttId === att.id;
                          const kind = detectFileKind(att.filename, att.mimeType);
                          const mime = att.mimeType.toLowerCase();
                          const imgKey = att.contentId || att.filename || att.id;
                          const resolvedImgUrl = cidMap[imgKey] || cidMap[imgKey.replace(/^<|>$/g, '')] || (att.data ? `data:${att.mimeType};base64,${att.data.replace(/-/g, '+').replace(/_/g, '/')}` : null);
                          const isDoc = isPreviewableAttachment(att);

                          return (
                            <div
                              key={att.id}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                                isDark
                                  ? 'bg-[#0E131F] border-slate-700/80 hover:border-slate-600'
                                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {mime.includes('image') && resolvedImgUrl ? (
                                  <img
                                    src={resolvedImgUrl}
                                    alt={att.filename}
                                    className="h-10 w-10 object-cover rounded-lg border border-slate-700/50 shrink-0 cursor-pointer hover:opacity-80 transition"
                                    onClick={() => handlePreviewAttachment(att)}
                                    title="Cliquez pour agrandir l'image"
                                  />
                                ) : (
                                  <div className="p-2 rounded-lg bg-slate-500/10 text-cyan-400 shrink-0">
                                    {kind === 'pdf' ? (
                                      <FileText className="h-4 w-4 text-red-400" />
                                    ) : kind === 'excel' ? (
                                      <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                                    ) : kind === 'image' ? (
                                      <ImageIcon className="h-4 w-4 text-amber-400" />
                                    ) : kind === 'word' ? (
                                      <FileText className="h-4 w-4 text-blue-400" />
                                    ) : (
                                      <File className="h-4 w-4 text-slate-400" />
                                    )}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold truncate" title={att.filename}>
                                    {att.filename}
                                  </p>
                                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                                    {(att.size / 1024).toFixed(1)} Ko
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {isDoc && token && (
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewAttachment(att)}
                                    className="p-1.5 rounded-lg bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400 transition"
                                    title="Aperçu du document"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDownloadSingle(att)}
                                  disabled={isDownloading}
                                  className="p-1.5 rounded-lg bg-slate-500/10 hover:bg-slate-500/20 text-slate-300 transition disabled:opacity-50"
                                  title="Télécharger ce fichier"
                                >
                                  {isDownloading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                                  ) : (
                                    <Download className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 4 BOTTOM PILL ACTION BUTTONS MATCHING GMAIL EXACTLY */}
                  {isLastMessage && !showQuickReply && (
                    <div className="flex flex-wrap items-center gap-3 pt-6 mt-6 border-t border-slate-700/30">
                      <button
                        type="button"
                        onClick={() => handleTriggerReply(msg, 'reply')}
                        className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border text-xs font-semibold transition active:scale-95 ${
                          isDark
                            ? 'border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200'
                            : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-2xs'
                        }`}
                      >
                        <CornerUpLeft className="h-4 w-4 text-cyan-400" />
                        <span>Répondre</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTriggerReply(msg, 'replyAll')}
                        className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border text-xs font-semibold transition active:scale-95 ${
                          isDark
                            ? 'border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200'
                            : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-2xs'
                        }`}
                      >
                        <Users className="h-4 w-4 text-emerald-400" />
                        <span>Répondre à tous</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenForward(msg)}
                        className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border text-xs font-semibold transition active:scale-95 ${
                          isDark
                            ? 'border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200'
                            : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-2xs'
                        }`}
                      >
                        <Forward className="h-4 w-4 text-blue-400" />
                        <span>Transférer</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setActiveEmojiPickerId(activeEmojiPickerId === msg.id ? null : msg.id)
                        }
                        className={`p-2 rounded-full border transition ${
                          isDark
                            ? 'border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-400'
                            : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-500'
                        }`}
                        title="Ajouter une réaction emoji"
                      >
                        <Smile className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* EMBEDDED REPLY COMPOSER & AI ASSISTANT BOX */}
        {showQuickReply && (
          <div
            ref={quickReplyRef}
            className={`rounded-2xl border p-5 sm:p-6 transition-all shadow-xl space-y-4 ${
              isDark
                ? 'bg-[#080B10] border-cyan-500/40 shadow-[0_4px_25px_rgba(0,0,0,0.5)]'
                : 'bg-white border-cyan-300 shadow-lg'
            }`}
          >
            {/* Header of reply box */}
            <div className="flex items-center justify-between pb-3 border-b border-inherit">
              <div className="flex items-center gap-2">
                <CornerUpLeft className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-bold">
                  {replyMode === 'replyAll' ? (
                    <span>Réponse à tous ({replyTargetEmail.fromName || replyTargetEmail.fromEmail})</span>
                  ) : replyMode === 'forward' ? (
                    <span>Transférer le message</span>
                  ) : (
                    <span>Répondre à {replyTargetEmail.fromName || replyTargetEmail.fromEmail}</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenReply(replyTargetEmail, replyMode)}
                  className="text-xs font-mono text-cyan-500 hover:underline"
                >
                  Plein écran
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickReply(false)}
                  className="p-1 rounded hover:bg-slate-500/20 text-slate-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Smart Reply Suggestions Pills */}
            {suggestions.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-cyan-400" />
                  Suggestions intelligentes Gemini :
                </span>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((sugg, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleApplySuggestion(sugg)}
                      className={`text-left px-3 py-1.5 rounded-lg text-xs transition border flex items-center gap-2 ${
                        isDark
                          ? 'bg-slate-900 border-cyan-500/30 hover:border-cyan-400 text-slate-200 hover:bg-slate-800'
                          : 'bg-slate-50 border-blue-200 hover:border-blue-400 text-slate-800 hover:bg-blue-50'
                      }`}
                    >
                      <span className="font-bold text-[11px] text-cyan-400 font-mono">
                        {sugg.label} :
                      </span>
                      <span className="text-[11px] text-slate-400 truncate max-w-xs">
                        {sugg.replyText}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reply Input */}
            <form onSubmit={handleSendQuickReply} className="space-y-3">
              {/* CC / BCC Toggle & Inputs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    À : <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>{replyMode === 'replyAll' ? (threadMessages[0]?.fromEmail || email.fromEmail) : (threadMessages[threadMessages.length - 1]?.fromEmail || email.fromEmail)}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    {!showQuickReplyCc && (
                      <button
                        type="button"
                        onClick={() => setShowQuickReplyCc(true)}
                        className="text-cyan-500 hover:underline uppercase text-[10px]"
                      >
                        + Cc
                      </button>
                    )}
                    {!showQuickReplyBcc && (
                      <button
                        type="button"
                        onClick={() => setShowQuickReplyBcc(true)}
                        className="text-cyan-500 hover:underline uppercase text-[10px]"
                      >
                        + Cci
                      </button>
                    )}
                  </div>
                </div>

                {showQuickReplyCc && (
                  <div className="flex items-center gap-2">
                    <span className="w-8 text-[11px] font-mono uppercase text-slate-500">Cc</span>
                    <input
                      type="text"
                      value={quickReplyCc}
                      onChange={(e) => setQuickReplyCc(e.target.value)}
                      placeholder="Adresses en Copie..."
                      className={`flex-1 px-3 py-1.5 text-xs rounded-lg border outline-none font-sans ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                )}

                {showQuickReplyBcc && (
                  <div className="flex items-center gap-2">
                    <span className="w-8 text-[11px] font-mono uppercase text-slate-500">Cci</span>
                    <input
                      type="text"
                      value={quickReplyBcc}
                      onChange={(e) => setQuickReplyBcc(e.target.value)}
                      placeholder="Adresses en Copie Cachée..."
                      className={`flex-1 px-3 py-1.5 text-xs rounded-lg border outline-none font-sans ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                )}
              </div>

              <textarea
                rows={5}
                placeholder="Rédigez votre réponse..."
                value={quickReplyText}
                onChange={(e) => setQuickReplyText(e.target.value)}
                className={`w-full p-4 text-xs rounded-xl border outline-none font-sans leading-relaxed resize-y ${
                  isDark
                    ? 'bg-[#05070A] border-slate-700 text-white placeholder-slate-500 focus:border-cyan-400'
                    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600'
                }`}
              />

              {/* Bottom bar with AI polishing + Signature toggle + Send */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                {/* AI style chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase text-slate-500 mr-1">IA :</span>
                  {(
                    [
                      { id: 'professional' as const, label: 'Professionnel' },
                      { id: 'concise' as const, label: 'Concis' },
                      { id: 'proofread' as const, label: 'Corriger' },
                    ]
                  ).map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleImproveQuickReply(action.id)}
                      disabled={isImprovingText || !quickReplyText.trim()}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition border disabled:opacity-40 ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
                          : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                  {isImprovingText && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400 ml-1" />}
                </div>

                <div className="flex items-center gap-2.5">
                  {/* Signature automatic indicator */}
                  <div
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono select-none ${
                      isDark
                        ? 'bg-cyan-950/40 border border-cyan-500/30 text-cyan-300/90'
                        : 'bg-blue-50 border border-blue-200 text-blue-700/90'
                    }`}
                    title="Votre signature par défaut est automatiquement ajoutée à votre envoi"
                  >
                    <FileSignature className="h-3.5 w-3.5" />
                    <span>Signature auto</span>
                    <Check className="h-3 w-3 text-cyan-400" />
                  </div>

                  {/* Send button */}
                  <button
                    type="submit"
                    disabled={!quickReplyText.trim()}
                    className="inline-flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 shadow-md disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Envoyer</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        attachment={previewAttachment}
        blobUrl={previewBlobUrl}
        arrayBuffer={previewArrayBuffer}
        isLoading={isLoadingPreview}
        loadError={previewError}
        onClose={closePreview}
        onDownload={handleDownloadSingle}
        onRetry={handlePreviewAttachment}
      />
    </div>
  );
};
