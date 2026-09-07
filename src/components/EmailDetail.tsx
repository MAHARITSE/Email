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
  Maximize2,
  Minimize2,
  CalendarPlus,
  Layers,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { ParsedEmail, EmailAttachment } from '../types/gmail';
import { saveAgendaTask } from '../services/agendaService';
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
import { RichTextEmailEditor } from './RichTextEmailEditor';
import {
  improveEmailText,
  draftEmailWithAi,
  detectEmailLanguage,
  ImproveAction,
  AiLanguage,
  AiTone,
} from '../services/aiAssistant';
import { LANGUAGES, TONES } from './AiWriterPanel';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import {
  isContactFavorite,
  toggleContactFavorite,
  saveLocalContact,
  getLocalContacts,
  parseEmailAddressList,
  resolveContactDisplayName,
} from '../services/contactsService';
import {
  getDefaultSignature,
  formatSignatureText,
  formatSignatureHtml,
} from '../services/signatureService';
import { detectFileKind, isPreviewableAttachment } from '../utils/fileKind';

function formatRecipientsSummary(recipients: Array<{ name: string; email: string }>): string {
  if (!recipients || recipients.length === 0) return 'Destinataire inconnu';
  const clean = recipients.filter((r) => r.name || r.email);
  if (clean.length === 0) return 'Destinataire inconnu';
  const getName = (r: { name: string; email: string }) => resolveContactDisplayName(r.email, r.name);
  if (clean.length === 1) {
    return getName(clean[0]);
  }
  if (clean.length === 2) {
    return `${getName(clean[0])}, ${getName(clean[1])}`;
  }
  return `${getName(clean[0])}, ${getName(clean[1])} (+${clean.length - 2})`;
}

interface ParsedQuoteResult {
  mainHtml: string | null;
  quotedHtml: string | null;
  mainText: string | null;
  quotedText: string | null;
  hasQuote: boolean;
}

function parseEmailBodyQuotes(rawHtml: string | null, rawText: string | null): ParsedQuoteResult {
  let mainHtml: string | null = null;
  let quotedHtml: string | null = null;
  let mainText: string | null = null;
  let quotedText: string | null = null;
  let hasQuote = false;

  // Regex pattern matching quote headers in French, Malagasy, English (e.g. "Le ... a écrit :", "On ... wrote:", "De :")
  const quoteHeaderRegex = /(Le\s+[A-Za-z0-9àáâäçéèêëìíîïòóôöùúûü\s\.,:\/-]+a\s+écrit\s*:|Le\s+[A-Za-z0-9àáâäçéèêëìíîïòóôöùúûü\s\.,:\/-]+à\s+[0-9]{1,2}:[0-9]{2}[^\n]*a\s+écrit|On\s+[A-Za-z0-9\s\.,:\/-]+\s+wrote\s*:|-----\s*Original Message\s*-----|-----\s*Message d['’]origine\s*-----|De\s*:\s*[^\n]+[\r\n]+Sent\s*:|From\s*:\s*[^\n]+[\r\n]+Sent\s*:|De\s*:\s*[^\n]+[\r\n]+Envoyé\s*:)/i;

  // 1. Text quote splitting
  if (rawText) {
    const textMatch = rawText.match(quoteHeaderRegex);
    if (textMatch && textMatch.index !== undefined && textMatch.index > 0) {
      mainText = rawText.substring(0, textMatch.index).trim();
      quotedText = rawText.substring(textMatch.index).trim();
      hasQuote = true;
    } else {
      mainText = rawText;
    }
  }

  // 2. HTML quote splitting
  if (rawHtml) {
    const quoteElementRegex = /<(div|blockquote)[^>]*(class=["'][^"']*(gmail_quote|gmail_extra|gmail_signature|yahoo_quoted)[^"']*["']|id=["'][^"']*(appendonsend|quote)[^"']*["'])[^>]*>/i;
    const tagMatch = rawHtml.match(quoteElementRegex);

    if (tagMatch && tagMatch.index !== undefined && tagMatch.index > 0) {
      mainHtml = rawHtml.substring(0, tagMatch.index);
      quotedHtml = rawHtml.substring(tagMatch.index);
      hasQuote = true;
    } else {
      const bqIdx = rawHtml.search(/<blockquote/i);
      if (bqIdx > 0) {
        mainHtml = rawHtml.substring(0, bqIdx);
        quotedHtml = rawHtml.substring(bqIdx);
        hasQuote = true;
      } else {
        const htmlTextMatch = rawHtml.match(quoteHeaderRegex);
        if (htmlTextMatch && htmlTextMatch.index !== undefined && htmlTextMatch.index > 0) {
          const matchIdx = htmlTextMatch.index;
          const lastTagOpen = rawHtml.lastIndexOf('<', matchIdx);
          const splitIdx = lastTagOpen !== -1 ? lastTagOpen : matchIdx;
          if (splitIdx > 0) {
            mainHtml = rawHtml.substring(0, splitIdx);
            quotedHtml = rawHtml.substring(splitIdx);
            hasQuote = true;
          }
        }
      }
    }
  }

  if (hasQuote && mainHtml !== null && mainHtml.trim() === '') {
    mainHtml = rawHtml;
  }

  return { mainHtml, quotedHtml, mainText, quotedText, hasQuote };
}

function formatInlineFileLinks(content: string): string {
  if (!content) return content;

  // 1. Transform bracketed icon file attachments like: [Icône xlsx] Filename.xlsx<https://...>
  let formatted = content.replace(
    /\[Icône\s*([^\]]+)\]\s*([^<]+)<(https?:\/\/[^>]+)>/gi,
    (_match, iconType, fileName, fileUrl) => {
      const cleanName = fileName.trim();
      const cleanUrl = fileUrl.trim();
      const ext = (iconType || cleanName.split('.').pop() || 'file').toLowerCase();

      let badgeIcon = '📎';
      if (['xlsx', 'xls', 'csv'].includes(ext)) badgeIcon = '📊';
      else if (['docx', 'doc'].includes(ext)) badgeIcon = '📝';
      else if (['pdf'].includes(ext)) badgeIcon = '📕';

      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1 my-0.5 rounded-lg border border-cyan-500/30 bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-300 font-medium text-xs no-underline transition cursor-pointer max-w-full">
        <span class="text-sm shrink-0">${badgeIcon}</span>
        <span class="truncate font-semibold text-slate-200">${cleanName}</span>
        <svg class="w-3 h-3 text-cyan-400 shrink-0 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
      </a>`;
    }
  );

  // 2. Transform filename.ext<https://...> where not matched above
  formatted = formatted.replace(
    /([a-zA-Z0-9_\s-]+\.(?:xlsx?|docx?|pdf|pptx?|zip|rar|png|jpg|jpeg|csv|txt))\s*<(https?:\/\/[^>]+)>/gi,
    (_match, fileName, fileUrl) => {
      const cleanName = fileName.trim();
      const cleanUrl = fileUrl.trim();
      const ext = cleanName.split('.').pop()?.toLowerCase() || 'file';

      let badgeIcon = '📎';
      if (['xlsx', 'xls', 'csv'].includes(ext)) badgeIcon = '📊';
      else if (['docx', 'doc'].includes(ext)) badgeIcon = '📝';
      else if (['pdf'].includes(ext)) badgeIcon = '📕';

      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1 my-0.5 rounded-lg border border-cyan-500/30 bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-300 font-medium text-xs no-underline transition cursor-pointer max-w-full">
        <span class="text-sm shrink-0">${badgeIcon}</span>
        <span class="truncate font-semibold text-slate-200">${cleanName}</span>
        <svg class="w-3 h-3 text-cyan-400 shrink-0 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
      </a>`;
    }
  );

  return formatted;
}

interface EmailDetailProps {
  email: ParsedEmail;
  currentUserEmail: string;
  token?: string | null;
  emailCategory?: 'pro' | 'personal' | 'sites' | 'other';
  onUpdateEmailCategory?: (emailId: string, cat: 'pro' | 'personal' | 'sites' | 'other') => void;
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
  const [expandedCcMsgs, setExpandedCcMsgs] = useState<Record<string, boolean>>({});
  const [expandedToMsgs, setExpandedToMsgs] = useState<Record<string, boolean>>({});
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [trimmedExpanded, setTrimmedExpanded] = useState<Record<string, boolean>>({});

  const scrollToMessage = (msgId: string) => {
    // Uncollapse target message
    setCollapsedMessages((prev) => ({ ...prev, [msgId]: false }));

    // Flash highlight
    setHighlightedMsgId(msgId);
    setTimeout(() => {
      setHighlightedMsgId((curr) => (curr === msgId ? null : curr));
    }, 2500);

    // Scroll to element smoothly
    setTimeout(() => {
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [activeEmojiPickerId, setActiveEmojiPickerId] = useState<string | null>(null);
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({});

  // Keyboard shortcut ESC to exit full screen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

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

  const [customAiPrompt, setCustomAiPrompt] = useState('');
  const [isGeneratingCustomReply, setIsGeneratingCustomReply] = useState(false);
  const [isImprovingText, setIsImprovingText] = useState(false);
  const [showInlineAi, setShowInlineAi] = useState(false);
  const [inlineAiTone, setInlineAiTone] = useState<AiTone>('professionnel');
  const [detectedEmailLang, setDetectedEmailLang] = useState<AiLanguage>('Français');
  const [inlineAiLanguage, setInlineAiLanguage] = useState<AiLanguage>('Français');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [taskAddedFeedback, setTaskAddedFeedback] = useState(false);

  const handleCreateTaskFromEmail = () => {
    try {
      saveAgendaTask({
        title: `Traiter : ${email.subject || '(Sans objet)'}`,
        description: `E-mail de ${email.fromName || email.fromEmail}\n${email.snippet || ''}`,
        type: 'programme',
        priority: 'haute',
        dueDate: new Date().toISOString().split('T')[0],
        dueTime: '10:00',
        category: effectiveCategory === 'pro' ? 'Professionnel' : effectiveCategory === 'personal' ? 'Personnel' : 'Général',
        linkedEmailId: email.id,
        linkedEmailSubject: email.subject || '(Sans objet)',
      });
      setTaskAddedFeedback(true);
      setTimeout(() => setTaskAddedFeedback(false), 3000);
    } catch (err) {
      console.error('Failed to create task from email', err);
    }
  };

  const quickReplyRef = useRef<HTMLDivElement>(null);

  const effectiveCategory = emailCategory || classifyEmailFast(email);
  const catInfo = CATEGORIES[effectiveCategory];

  // Listen to contacts updates
  useEffect(() => {
    const handleUpdate = () => setContactsVersion((v) => v + 1);
    window.addEventListener('gmail-contacts-updated', handleUpdate);
    return () => window.removeEventListener('gmail-contacts-updated', handleUpdate);
  }, []);

  // Automatically detect the received email's language and initialize the response language
  useEffect(() => {
    const targetMsg = replyTargetEmail || threadMessages[threadMessages.length - 1] || email;
    const bodyContent = targetMsg.bodyText || targetMsg.snippet;
    const detected = detectEmailLanguage(bodyContent, targetMsg.subject || email.subject);
    setDetectedEmailLang(detected);
    setInlineAiLanguage(detected);
  }, [replyTargetEmail, threadMessages, email]);

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
            // Unfold/expand all messages by default on opening thread as requested
            setCollapsedMessages({});
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
    const target = mode === 'replyAll'
      ? (threadMessages[0] || email)
      : mode === 'reply'
      ? (threadMessages[threadMessages.length - 1] || email)
      : msg;
    setReplyTargetEmail(target);
    setReplyMode(mode);
    setShowQuickReply(true);

    // Detect language of the target email and set response language accordingly
    const bodyContent = target.bodyText || target.snippet;
    const detected = detectEmailLanguage(bodyContent, target.subject || email.subject);
    setDetectedEmailLang(detected);
    setInlineAiLanguage(detected);

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

  // Custom AI Reply Generator (Gemini inside the reply box)
  const handleGenerateCustomReply = async (promptOverride?: string) => {
    const promptToUse = (promptOverride || customAiPrompt).trim();
    if (!promptToUse) return;
    setIsGeneratingCustomReply(true);
    try {
      const targetMsg = replyTargetEmail || threadMessages[threadMessages.length - 1] || email;
      const res = await draftEmailWithAi({
        prompt: promptToUse,
        recipient: targetMsg.fromEmail,
        tone: inlineAiTone,
        language: inlineAiLanguage,
        emailContext: {
          subject: email.subject,
          body: targetMsg.bodyText || targetMsg.snippet,
          sender: targetMsg.fromName || targetMsg.fromEmail,
        },
      });
      if (res && res.body) {
        setShowQuickReply(true);
        setQuickReplyText(res.body);
        setCustomAiPrompt('');
        setShowInlineAi(false);
        setTimeout(() => {
          quickReplyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    } catch (err) {
      console.warn('Erreur génération custom AI reply:', err);
      // Fallback
      try {
        const targetMsg = replyTargetEmail || threadMessages[threadMessages.length - 1] || email;
        const improved = await improveEmailText(
          `Génère une réponse professionnelle et polie à cet email (de ${targetMsg.fromName || targetMsg.fromEmail}). Consigne : "${promptToUse}". Contexte du message : "${targetMsg.bodyText || targetMsg.snippet}"`,
          'professional',
          undefined,
          inlineAiLanguage
        );
        if (improved) {
          setShowQuickReply(true);
          setQuickReplyText(improved);
          setCustomAiPrompt('');
          setShowInlineAi(false);
          setTimeout(() => {
            quickReplyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }
      } catch (fallbackErr) {
        console.error('Erreur fallback IA:', fallbackErr);
      }
    } finally {
      setIsGeneratingCustomReply(false);
    }
  };

  // Quick Reply Polish with AI (honoring the detected/selected reply language)
  const handleImproveQuickReply = async (action: ImproveAction) => {
    if (!quickReplyText.trim() || isImprovingText) return;
    setIsImprovingText(true);
    try {
      const improved = await improveEmailText(quickReplyText, action, undefined, inlineAiLanguage);
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
        finalBody = finalBody.includes('<')
          ? `${finalBody}<br /><br />--<br />${sigText.replace(/\n/g, '<br />')}`
          : `${finalBody}\n\n--\n${sigText}`;
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
      // Reply: reply to the recipient if sent by me, or to sender if received
      const lastMsg = threadMessages[threadMessages.length - 1] || email;
      targetMsg = lastMsg;
      const isSentByMe = Boolean(
        (currentUserEmail && lastMsg.fromEmail?.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) ||
        lastMsg.labelIds?.includes('SENT') ||
        lastMsg.fromName?.toLowerCase() === 'moi'
      );
      toAddresses = isSentByMe ? (lastMsg.to || lastMsg.fromEmail) : lastMsg.fromEmail;
    }

    replySubject = targetMsg.subject.startsWith('Re:')
      ? targetMsg.subject
      : `Re: ${targetMsg.subject}`;

    onRequestSendQuickReply({
      fromEmail: currentUserEmail,
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

  // Get list of unique participants for thread overview (resolving contact book names)
  const threadParticipants = useMemo(() => {
    const map = new Map<string, string>();
    threadMessages.forEach((m) => {
      const senderName = resolveContactDisplayName(m.fromEmail, m.fromName);
      map.set(m.fromEmail.toLowerCase(), senderName);

      // Also include recipients so sent emails clearly show the recipient name
      const recs = parseEmailAddressList(m.to);
      recs.forEach((r) => {
        if (!map.has(r.email.toLowerCase())) {
          map.set(r.email.toLowerCase(), resolveContactDisplayName(r.email, r.name));
        }
      });
    });
    return Array.from(map.entries()).map(([email, name]) => ({ email, name }));
  }, [threadMessages, contactsVersion]);

  const allCollapsed = useMemo(() => {
    return threadMessages.length > 1 && Object.values(collapsedMessages).every(Boolean);
  }, [threadMessages, collapsedMessages]);

  return (
    <div
      className={`flex-1 flex flex-col h-full overflow-y-auto select-text font-sans transition-all ${
        isFullScreen
          ? `fixed inset-0 z-50 overflow-y-auto ${isDark ? 'bg-[#05070A] text-slate-100' : 'bg-white text-slate-900'}`
          : ''
      }`}
    >
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

        {/* Right: Category Picker + Header Utilities (Full Screen, Expand all, Print) */}
        <div className="flex items-center gap-2">
          {/* Full Screen Reading Toggle Button */}
          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              isFullScreen
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-xs'
                : isDark
                ? 'hover:bg-slate-800 text-slate-300 hover:text-white'
                : 'hover:bg-slate-100 text-slate-700 hover:text-black'
            }`}
            title={isFullScreen ? 'Quitter le mode plein écran (Échap)' : 'Mode lecture plein écran'}
          >
            {isFullScreen ? <Minimize2 className="h-4 w-4 text-cyan-400" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden md:inline font-mono text-[11px]">
              {isFullScreen ? 'Quitter plein écran' : 'Plein écran'}
            </span>
          </button>
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

          {/* Add to Agenda button */}
          <button
            type="button"
            id="detail-add-task-btn"
            onClick={handleCreateTaskFromEmail}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              taskAddedFeedback
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : isDark
                ? 'hover:bg-slate-800 text-slate-300 hover:text-cyan-400'
                : 'hover:bg-slate-100 text-slate-700 hover:text-cyan-700'
            }`}
            title="Créer une tâche dans l'agenda à partir de cet e-mail"
          >
            {taskAddedFeedback ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                <span className="font-mono text-[11px] text-emerald-400">Ajouté !</span>
              </>
            ) : (
              <>
                <CalendarPlus className="h-4 w-4 text-cyan-400" />
                <span className="hidden lg:inline font-mono text-[11px]">Agenda</span>
              </>
            )}
          </button>

          {/* Print button */}
          <button
            type="button"
            onClick={handlePrint}
            className={`p-2 rounded-xl transition cursor-pointer ${
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
                isDark ? catInfo.bgDark : catInfo.bgLight
              }`}
            >
              {effectiveCategory === 'pro' && <Briefcase className="h-3.5 w-3.5" />}
              {effectiveCategory === 'personal' && <User className="h-3.5 w-3.5" />}
              {effectiveCategory === 'sites' && <Globe className="h-3.5 w-3.5" />}
              {effectiveCategory === 'other' && <Layers className="h-3.5 w-3.5" />}
              <span>{catInfo.label}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {showCategoryMenu && (
              <div
                className={`absolute right-0 top-full mt-1.5 w-52 rounded-xl shadow-xl border overflow-hidden z-30 ${
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
                {(['pro', 'personal', 'sites', 'other'] as const).map((c) => {
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
                        {c === 'other' && <Layers className="h-3.5 w-3.5 text-amber-400" />}
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

      {/* TOP SUBJECT & FOLDER BADGE HEADER - COMPACT GMAIL DENSITY */}
      <div className="px-3 sm:px-6 py-2 border-b border-slate-700/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1
              id="detail-email-subject"
              className={`text-base sm:text-lg font-semibold tracking-tight ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {email.subject || '(Sans objet)'}
            </h1>

            {/* Folder badge like Gmail pill: Boîte de réception / Messages envoyés ✕ */}
            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700">
              {email.labelIds?.includes('SENT') ? (
                <span className="inline-flex items-center gap-1 font-semibold text-cyan-600 dark:text-cyan-300">
                  <Send className="h-2.5 w-2.5 rotate-45" />
                  <span>Messages envoyés</span>
                </span>
              ) : email.labelIds?.includes('DRAFT') ? (
                <span>Brouillons</span>
              ) : email.labelIds?.includes('SPAM') ? (
                <span>Spam</span>
              ) : email.labelIds?.includes('TRASH') ? (
                <span>Corbeille</span>
              ) : (
                <span>Boîte de réception</span>
              )}
              <button
                type="button"
                onClick={() => onBack()}
                className="hover:text-red-500 transition p-0.5 cursor-pointer"
                title="Retour à la liste"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* STICKY TIMELINE & PARTICIPANTS BAR FOR MULTI-REPLY THREADS */}
      {threadMessages.length > 1 && (
        <div
          className={`sticky top-[49px] z-10 px-3 sm:px-5 py-1.5 border-b shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs transition-colors backdrop-blur-md ${
            isDark
              ? 'bg-[#0E131F]/95 border-slate-800 text-slate-300'
              : 'bg-slate-100/95 border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="flex items-center gap-1.5 font-mono font-bold text-[10px] text-cyan-500 dark:text-cyan-400 shrink-0 uppercase tracking-wider">
              <Users className="h-3 w-3" />
              <span>Intervenants ({threadMessages.length}) :</span>
            </span>

            <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-full no-scrollbar">
              {threadMessages.map((m, idx) => {
                const senderName = m.fromName || m.fromEmail.split('@')[0];
                const isTargeted = replyTargetEmail?.id === m.id;
                const isHighlighted = highlightedMsgId === m.id;

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => scrollToMessage(m.id)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer shrink-0 border ${
                      isHighlighted
                        ? 'bg-cyan-500 text-white border-cyan-400 font-bold scale-105 ring-2 ring-cyan-300'
                        : isTargeted
                        ? isDark
                          ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                          : 'bg-cyan-100 border-cyan-300 text-cyan-900'
                        : isDark
                        ? 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-black'
                    }`}
                    title={`Cliquer pour aller directement au message de ${senderName} (${m.dateStr})`}
                  >
                    <span className="font-mono text-[9px] font-bold opacity-70">#{idx + 1}</span>
                    <span className="truncate max-w-[120px] sm:max-w-[150px] font-semibold">{senderName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Conversation Flow */}
      <div className="flex-1 p-2 sm:p-4 space-y-1.5 max-w-5xl mx-auto w-full">
        {isLoadingThread && threadMessages.length === 1 ? (
          <div className="flex items-center justify-center py-4 gap-2 text-xs font-mono text-cyan-400">
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
          const resolvedSenderName = resolveContactDisplayName(msg.fromEmail, msg.fromName);
          const initial = (resolvedSenderName || msg.fromEmail || '?').charAt(0).toUpperCase();

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

          // Process HTML body for inline CID images and inline file link formatting
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

            rawHtml = formatInlineFileLinks(rawHtml);
          }

          const globalSanitizeConfig = {
            ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|data|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-]|$))/i,
            ADD_ATTR: [
              'target', 'style', 'src', 'alt', 'width', 'height', 'class', 'loading', 'srcset', 'align', 'valign',
              'color', 'bgcolor', 'background', 'border', 'cellpadding', 'cellspacing', 'face', 'size',
              'colspan', 'rowspan', 'dir', 'nowrap', 'id', 'name', 'clear',
              'rel', 'title', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd'
            ],
            ADD_TAGS: ['svg', 'path', 'font', 'center', 'hr', 'br', 'style', 'bdo', 's', 'strike', 'u'],
            FORBID_TAGS: ['script', 'iframe', 'form'],
          };

          const sanitizedMsgHtml = rawHtml ? DOMPurify.sanitize(rawHtml, globalSanitizeConfig) : null;

          const isSentByMe = Boolean(
            (currentUserEmail && msg.fromEmail?.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) ||
            msg.labelIds?.includes('SENT') ||
            msg.fromName?.toLowerCase() === 'moi'
          );

          const recipients = parseEmailAddressList(msg.to);
          const primaryRecipient = recipients[0];
          const resolvedPrimaryName = primaryRecipient
            ? resolveContactDisplayName(primaryRecipient.email, primaryRecipient.name)
            : 'Destinataire inconnu';
          const recipientNames = recipients.length > 0
            ? formatRecipientsSummary(recipients)
            : (msg.to || 'Destinataire inconnu');

          const recipientInitial = (resolvedPrimaryName || 'D').charAt(0).toUpperCase();

          const displayInitial = isSentByMe ? recipientInitial : initial;
          const displayAvatarBg = isSentByMe
            ? 'bg-gradient-to-tr from-cyan-600 to-blue-600'
            : avatarBg;

          const isContactFav = isSentByMe
            ? (primaryRecipient ? isContactFavorite(primaryRecipient.email) : false)
            : isContactFavorite(msg.fromEmail);
          const reactions = messageReactions[msg.id] || [];

          return (
            <div
              id={`msg-${msg.id}`}
              key={msg.id}
              className={`rounded-2xl border transition-all duration-300 scroll-mt-28 ${
                highlightedMsgId === msg.id
                  ? 'ring-2 ring-cyan-500 border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.35)] scale-[1.01]'
                  : isLastMessage
                  ? isDark
                    ? 'bg-[#080B10] border-slate-700 shadow-[0_4px_20px_rgba(0,0,0,0.4)]'
                    : 'bg-white border-slate-300 shadow-sm'
                  : isDark
                  ? 'bg-[#0A0E17] border-slate-800/80 hover:border-slate-700'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* COLLAPSED MESSAGE VIEW */}
              {isCollapsed ? (
                <div
                  onClick={() => toggleCollapseMessage(msg.id)}
                  className="flex items-center justify-between p-2 sm:p-2.5 cursor-pointer select-none hover:bg-slate-500/5 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Circle Avatar */}
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shadow-xs shrink-0 ${displayAvatarBg}`}
                      title={isSentByMe ? `Destinataire : ${recipientNames}` : (msg.fromName || msg.fromEmail)}
                    >
                      {displayInitial}
                    </div>

                    {/* Sender or Recipient Name in prominence */}
                    {isSentByMe ? (
                      <div className="flex items-center gap-1.5 shrink-0 max-w-[200px] sm:max-w-[280px] truncate">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 dark:bg-cyan-950/80 border border-cyan-500/30 text-cyan-600 dark:text-cyan-300 shrink-0 inline-flex items-center gap-0.5">
                          <Send className="h-2.5 w-2.5 rotate-45" />
                          <span>À :</span>
                        </span>
                        <span
                          className={`text-xs font-bold truncate ${
                            isDark ? 'text-cyan-200' : 'text-cyan-950'
                          }`}
                          title={`Destinataire : ${recipientNames}`}
                        >
                          {recipientNames}
                        </span>
                      </div>
                    ) : (
                      <span
                        className={`text-xs font-semibold shrink-0 max-w-[160px] sm:max-w-[200px] truncate ${
                          isDark ? 'text-slate-200' : 'text-slate-900'
                        }`}
                        title={resolvedSenderName}
                      >
                        {resolvedSenderName}
                      </span>
                    )}

                    {/* Snippet on same row */}
                    <span
                      className={`text-xs truncate flex-1 ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {msg.snippet || '(Corps de message replié)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {msg.dateStr}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar(msg);
                      }}
                      className="p-0.5 hover:scale-110 transition cursor-pointer"
                      title={msg.isStarred ? 'Message suivi' : 'Non suivi'}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          msg.isStarred ? 'text-amber-400 fill-amber-400' : 'text-slate-400'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ) : (
                /* EXPANDED MESSAGE VIEW (Compact Gmail Density) */
                <div className="px-3 py-2 sm:px-4 sm:py-2.5">
                  {/* Message Header - Compact Gmail Density */}
                  <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-slate-100 dark:border-slate-800/60">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Left Avatar Circle (Compact 32px like Gmail) */}
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shadow-xs shrink-0 ${displayAvatarBg}`}
                        title={isSentByMe ? `Destinataire : ${recipientNames}` : (msg.fromName || msg.fromEmail)}
                      >
                        {displayInitial}
                      </div>

                      {/* Sender Info & Recipient Row with Dropdown Details */}
                      <div className="min-w-0 flex-1">
                        {isSentByMe ? (
                          <div className="flex flex-wrap items-center gap-2 leading-tight">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 dark:bg-cyan-950/80 border border-cyan-500/30 text-cyan-600 dark:text-cyan-300 shrink-0 inline-flex items-center gap-1 shadow-xs">
                              <Send className="h-2.5 w-2.5 rotate-45" />
                              <span>À :</span>
                            </span>
                            <span
                              className={`text-xs sm:text-sm font-bold truncate max-w-[240px] sm:max-w-[380px] ${
                                isDark ? 'text-cyan-200' : 'text-cyan-900'
                              }`}
                              title={`Destinataire principal : ${recipientNames}`}
                            >
                              {recipientNames}
                            </span>
                            {primaryRecipient && (
                              <span className={`text-[11px] sm:text-xs truncate max-w-[180px] sm:max-w-[280px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                &lt;{recipients.map((r) => r.email).join(', ')}&gt;
                              </span>
                            )}
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold shrink-0">
                              Message envoyé
                            </span>

                            {/* VIP Favorite Star on primary recipient */}
                            {primaryRecipient && (
                              <button
                                type="button"
                                onClick={() => {
                                  const existing = getLocalContacts().find(
                                    (c) => c.email.toLowerCase() === primaryRecipient.email.toLowerCase()
                                  );
                                  if (existing) {
                                    toggleContactFavorite(existing.id);
                                  } else {
                                    saveLocalContact({
                                      name: primaryRecipient.name || primaryRecipient.email.split('@')[0],
                                      email: primaryRecipient.email,
                                      isFavorite: true,
                                      category: 'pro',
                                    });
                                  }
                                }}
                                className={`p-0.5 rounded transition cursor-pointer ${
                                  isContactFav
                                    ? 'text-amber-400 hover:scale-110'
                                    : 'text-slate-400 hover:text-amber-400'
                                }`}
                                title={
                                  isContactFav
                                    ? 'Destinataire Favori VIP (Priorité en tête de liste)'
                                    : 'Ajouter ce destinataire en Favori VIP'
                                }
                              >
                                <Star className={`h-3.5 w-3.5 ${isContactFav ? 'fill-amber-400' : ''}`} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5 leading-tight">
                            <span
                              className={`text-xs sm:text-sm font-semibold truncate max-w-[200px] sm:max-w-[320px] ${
                                isDark ? 'text-white' : 'text-slate-900'
                              }`}
                              title={resolvedSenderName}
                            >
                              {resolvedSenderName}
                            </span>

                            <span className={`text-[11px] sm:text-xs truncate max-w-[180px] sm:max-w-[260px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              &lt;{msg.fromEmail}&gt;
                            </span>

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
                              className={`p-0.5 rounded transition cursor-pointer ${
                                isContactFav
                                  ? 'text-amber-400 hover:scale-110'
                                  : 'text-slate-400 hover:text-amber-400'
                              }`}
                              title={
                                isContactFav
                                  ? 'Contact Favori VIP (Priorité en tête de liste)'
                                  : 'Ajouter ce contact en Favori VIP'
                              }
                            >
                              <Star className={`h-3.5 w-3.5 ${isContactFav ? 'fill-amber-400' : ''}`} />
                            </button>
                          </div>
                        )}

                        {/* LINE 2: "De : moi" if sent, or "À : moi" if received */}
                        <div className="relative mt-0.5">
                          <div className="flex items-center gap-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 max-w-full">
                            {isSentByMe ? (
                              <>
                                <span className="shrink-0 text-slate-400 font-mono text-[10px]">De :</span>
                                <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[220px] sm:max-w-[380px]">
                                  Moi &lt;{msg.fromEmail}&gt;
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="shrink-0 text-slate-400">À :</span>
                                <span className="truncate max-w-[220px] sm:max-w-[420px]">
                                  {msg.to ? msg.to.split(',')[0] + (msg.to.includes(',') ? ` (+${msg.to.split(',').length - 1})` : '') : 'moi'}
                                </span>
                              </>
                            )}

                            {msg.cc && (
                              <span className="text-[10px] text-cyan-500 dark:text-cyan-400 shrink-0 font-medium">
                                (Cc inclus)
                              </span>
                            )}

                            {/* Dropdown Chevron for Full Gmail Details */}
                            <button
                              type="button"
                              onClick={(e) => toggleDetails(msg.id, e)}
                              className={`p-0.5 rounded hover:bg-slate-500/10 transition inline-flex items-center cursor-pointer ${
                                isDetailsOpen ? 'text-cyan-500' : 'text-slate-400'
                              }`}
                              title="Afficher les détails de distribution"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>

                          {/* GMAIL POPUP DETAILS CARD (De, À, Cc, Date, Objet, Sécurité) */}
                          {isDetailsOpen && (
                            <div
                              className={`absolute left-0 top-full mt-1 w-full max-w-sm rounded-xl p-3 shadow-xl border z-30 text-xs font-sans space-y-1.5 ${
                                isDark
                                  ? 'bg-[#0E131F] border-slate-700 text-slate-300 shadow-[0_10px_25px_rgba(0,0,0,0.5)]'
                                  : 'bg-white border-slate-200 text-slate-700 shadow-xl'
                              }`}
                            >
                              <div className="grid grid-cols-[50px_1fr] gap-1.5 items-baseline">
                                <span className="font-semibold text-slate-400">De :</span>
                                <span className="font-semibold text-slate-900 dark:text-white truncate">
                                  {isSentByMe ? `Moi <${msg.fromEmail}>` : `${msg.fromName || msg.fromEmail} <${msg.fromEmail}>`}
                                </span>
                              </div>

                              <div className="grid grid-cols-[50px_1fr] gap-1.5 items-baseline">
                                <span className="font-semibold text-slate-400">À :</span>
                                <span className="break-all font-semibold text-cyan-600 dark:text-cyan-300">
                                  {msg.to || (isSentByMe ? recipientNames : currentUserEmail)}
                                </span>
                              </div>

                              {msg.cc && (
                                <div className="grid grid-cols-[50px_1fr] gap-1.5 items-baseline">
                                  <span className="font-semibold text-cyan-500">Cc :</span>
                                  <span className="font-medium text-cyan-600 dark:text-cyan-400 break-all">
                                    {msg.cc}
                                  </span>
                                </div>
                              )}

                              <div className="grid grid-cols-[50px_1fr] gap-1.5 items-baseline">
                                <span className="font-semibold text-slate-400">Date :</span>
                                <span>{msg.dateStr}</span>
                              </div>

                              <div className="grid grid-cols-[50px_1fr] gap-1.5 items-baseline">
                                <span className="font-semibold text-slate-400">Objet :</span>
                                <span className="font-medium">{msg.subject || '(Sans objet)'}</span>
                              </div>

                              <div className="grid grid-cols-[50px_1fr] gap-1.5 items-center pt-1 border-t border-inherit">
                                <span className="font-semibold text-slate-400">Sécurité :</span>
                                <span className="flex items-center gap-1 text-emerald-500 font-medium">
                                  <ShieldCheck className="h-3 w-3" />
                                  Chiffrement standard (TLS)
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Header Right Action Icons (Date, Star, Emoji, More Menu) */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[11px] sm:text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mr-0.5`}>
                        {msg.dateStr}
                      </span>

                      {/* Star button */}
                      <button
                        type="button"
                        onClick={() => onToggleStar(msg)}
                        className="p-1 rounded-md hover:bg-slate-500/10 text-slate-400 hover:text-amber-400 transition cursor-pointer"
                        title={msg.isStarred ? 'Suivi' : 'Marquer comme suivi'}
                      >
                        <Star
                          className={`h-3.5 w-3.5 ${
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
                          className="p-1 rounded-md hover:bg-slate-500/10 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                          title="Ajouter une réaction"
                        >
                          <Smile className="h-3.5 w-3.5" />
                        </button>

                        {activeEmojiPickerId === msg.id && (
                          <div
                            className={`absolute right-0 top-full mt-1 p-1.5 rounded-xl shadow-xl border flex items-center gap-1 z-30 ${
                              isDark ? 'bg-[#0E131F] border-slate-700' : 'bg-white border-slate-200'
                            }`}
                          >
                            {EMOJI_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleAddEmoji(msg.id, emoji)}
                                className="text-sm p-1 rounded hover:bg-slate-500/20 transition hover:scale-125 cursor-pointer"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* More Menu (⋮) */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveMenuMessageId(activeMenuMessageId === msg.id ? null : msg.id)
                          }
                          className="p-1 rounded-md hover:bg-slate-500/10 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                          title="Plus d'options"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
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
                              <CornerUpLeft className="h-3.5 w-3.5 text-cyan-400" />
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

                            <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />

                            <button
                              type="button"
                              onClick={() => {
                                handlePrint();
                                setActiveMenuMessageId(null);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 hover:bg-slate-500/10 transition text-slate-400 hover:text-white"
                            >
                              <Printer className="h-3.5 w-3.5 text-slate-400" />
                              <span>Imprimer</span>
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

                  {/* Message Body with Quote Trimming */}
                  {(() => {
                    const parsed = parseEmailBodyQuotes(sanitizedMsgHtml, msg.bodyText);
                    const isQuoteExpanded = trimmedExpanded[msg.id] || false;

                    const innerSanitizeConfig = {
                      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|data|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-]|$))/i,
                      ADD_ATTR: [
                        'target', 'style', 'src', 'alt', 'width', 'height', 'class', 'loading', 'srcset', 'align', 'valign',
                        'color', 'bgcolor', 'background', 'border', 'cellpadding', 'cellspacing', 'face', 'size',
                        'colspan', 'rowspan', 'dir', 'nowrap', 'id', 'name', 'clear',
                        'rel', 'title', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd'
                      ],
                      ADD_TAGS: ['svg', 'path', 'font', 'center', 'hr', 'br', 'style', 'bdo', 's', 'strike', 'u'],
                      FORBID_TAGS: ['script', 'iframe', 'form'],
                    };

                    const mainSanitizedHtml = parsed.mainHtml ? DOMPurify.sanitize(parsed.mainHtml, innerSanitizeConfig) : null;
                    const quotedSanitizedHtml = parsed.quotedHtml ? DOMPurify.sanitize(parsed.quotedHtml, innerSanitizeConfig) : null;

                    return (
                      <div className="py-0 min-h-[40px]">
                        {/* Main new message content - preserves original sender colors with compact Gmail-like vertical spacing */}
                        {mainSanitizedHtml ? (
                          <div
                            className={`email-body-content max-w-none break-words text-sm leading-relaxed overflow-x-auto [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline [&_img]:max-w-full [&_img]:h-auto [&_img]:inline-block [&_img]:my-0.5 [&_p]:my-1 [&_div]:my-0 [&_table]:max-w-full [&_table]:my-1 [&>*:last-child]:mb-0 ${
                              isDark ? 'text-slate-100' : 'text-slate-900'
                            }`}
                            dangerouslySetInnerHTML={{ __html: mainSanitizedHtml }}
                          />
                        ) : (
                          <div
                            className={`email-body-content text-sm leading-relaxed whitespace-pre-wrap font-sans [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline ${
                              isDark ? 'text-slate-100' : 'text-slate-900'
                            }`}
                            dangerouslySetInnerHTML={{
                              __html: DOMPurify.sanitize(
                                formatInlineFileLinks(parsed.mainText || msg.bodyText || '(Corps de message vide)'),
                                innerSanitizeConfig
                              ),
                            }}
                          />
                        )}

                        {/* Inline Display for Image Attachments (signatures, coordinates, contact cards) */}
                        {(() => {
                          const imgAtts = (msg.attachments || []).filter((a) => a.mimeType?.toLowerCase().startsWith('image/'));
                          if (imgAtts.length === 0) return null;
                          return (
                            <div className="my-1.5 flex flex-wrap gap-1.5 items-center">
                              {imgAtts.map((att) => {
                                const imgKey = att.contentId || att.filename || att.id;
                                const imgUrl =
                                  cidMap[imgKey] ||
                                  cidMap[imgKey.replace(/^<|>$/g, '')] ||
                                  (att.data
                                    ? `data:${att.mimeType};base64,${att.data.replace(/-/g, '+').replace(/_/g, '/')}`
                                    : null);
                                if (!imgUrl) return null;
                                return (
                                  <img
                                    key={att.id}
                                    src={imgUrl}
                                    alt={att.filename || 'Signature / Image'}
                                    className="max-w-full max-h-48 object-contain rounded my-0.5 inline-block cursor-pointer hover:opacity-90 transition border border-slate-700/20"
                                    onClick={() => handlePreviewAttachment(att)}
                                    title={att.filename || 'Cliquer pour agrandir'}
                                  />
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Quoted / Historic content toggle if present */}
                        {parsed.hasQuote && (
                          <div className="mt-0 pt-0">
                            {!isQuoteExpanded ? (
                              <button
                                type="button"
                                onClick={() => setTrimmedExpanded((prev) => ({ ...prev, [msg.id]: true }))}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-0.5 rounded-md text-[11px] font-mono font-semibold transition border cursor-pointer ${
                                  isDark
                                    ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-white'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 hover:text-black'
                                }`}
                                title="Afficher l'historique du message cité"
                              >
                                <span className="text-cyan-500 font-bold">···</span>
                                <span>Afficher le message cité</span>
                              </button>
                            ) : (
                              <div className="space-y-1 border-l-2 border-cyan-500/40 pl-3 mt-1 mb-0">
                                <div className="flex items-center justify-between pb-0.5">
                                  <span className="text-[11px] font-mono font-bold text-cyan-500 uppercase tracking-wider">
                                    — Message cité / Historique des échanges —
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setTrimmedExpanded((prev) => ({ ...prev, [msg.id]: false }))}
                                    className="text-[11px] text-slate-400 hover:text-cyan-400 underline font-mono cursor-pointer"
                                  >
                                    Masquer l'historique
                                  </button>
                                </div>

                                {quotedSanitizedHtml ? (
                                  <div
                                    className={`email-body-content max-w-none break-words opacity-85 text-xs [&>*:last-child]:mb-0 ${
                                      isDark ? 'text-slate-300' : 'text-slate-700'
                                    }`}
                                    dangerouslySetInnerHTML={{ __html: quotedSanitizedHtml }}
                                  />
                                ) : (
                                  <div
                                    className={`text-xs leading-relaxed whitespace-pre-wrap font-sans opacity-85 ${
                                      isDark ? 'text-slate-300' : 'text-slate-700'
                                    }`}
                                  >
                                    {parsed.quotedText}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

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

                </div>
              )}
            </div>
          );
        })}

        {/* ALWAYS VISIBLE COMPACT BOTTOM ACTION BAR */}
        <div className={`mt-3 pt-2.5 border-t ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          {/* ALWAYS VISIBLE BUTTONS ALIGNED BOTTOM LEFT */}
          <div className="flex flex-wrap items-center justify-start gap-2">
            <button
              type="button"
              onClick={() => handleTriggerReply(threadMessages[threadMessages.length - 1] || email, 'reply')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition active:scale-95 cursor-pointer ${
                isDark
                  ? 'border-cyan-500/40 bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-200 hover:text-white shadow-xs'
                  : 'border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-950 shadow-2xs'
              }`}
            >
              <CornerUpLeft className="h-3.5 w-3.5 text-cyan-400" />
              <span>Répondre</span>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerReply(threadMessages[threadMessages.length - 1] || email, 'replyAll')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition active:scale-95 cursor-pointer ${
                isDark
                  ? 'border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-200 hover:text-white shadow-xs'
                  : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 shadow-2xs'
              }`}
            >
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <span>Répondre à tous</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenForward(threadMessages[threadMessages.length - 1] || email)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition active:scale-95 cursor-pointer ${
                isDark
                  ? 'border-blue-500/40 bg-blue-950/30 hover:bg-blue-900/50 text-blue-200 hover:text-white shadow-xs'
                  : 'border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-950 shadow-2xs'
              }`}
            >
              <Forward className="h-3.5 w-3.5 text-blue-400" />
              <span>Transférer</span>
            </button>
          </div>
        </div>

        {/* EMBEDDED REPLY COMPOSER & AI ASSISTANT BOX */}
        {showQuickReply && (
          <div
            ref={quickReplyRef}
            className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-xl space-y-3 ${
              isDark
                ? 'bg-[#080B10] border-cyan-500/40 shadow-[0_4px_25px_rgba(0,0,0,0.5)]'
                : 'bg-white border-cyan-300 shadow-lg'
            }`}
          >
            {/* Header of reply box */}
            <div className="flex items-center justify-between pb-2.5 border-b border-inherit">
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
                {/* AI Assistant toggle button right in reply header */}
                <button
                  type="button"
                  onClick={() => setShowInlineAi(!showInlineAi)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                    showInlineAi
                      ? isDark
                        ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/60 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                        : 'bg-cyan-100 text-cyan-900 ring-1 ring-cyan-400'
                      : isDark
                      ? 'bg-slate-800/80 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 border border-slate-700'
                      : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200'
                  }`}
                  title="Ouvrir l'assistant IA Gemini à l'intérieur de la case de réponse"
                >
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                  <span>{showInlineAi ? 'Masquer l\'IA' : 'Aide-moi à écrire'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    replyMode === 'forward'
                      ? onOpenForward(replyTargetEmail)
                      : onOpenReply(replyTargetEmail, replyMode)
                  }
                  className="text-xs font-mono text-cyan-500 hover:underline cursor-pointer"
                >
                  Plein écran
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickReply(false)}
                  className="p-1 rounded hover:bg-slate-500/20 text-slate-400 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Reply Input Form with Integrated AI */}
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
                        className="text-cyan-500 hover:underline uppercase text-[10px] cursor-pointer"
                      >
                        + Cc
                      </button>
                    )}
                    {!showQuickReplyBcc && (
                      <button
                        type="button"
                        onClick={() => setShowQuickReplyBcc(true)}
                        className="text-cyan-500 hover:underline uppercase text-[10px] cursor-pointer"
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

              {/* INLINE GEMINI AI ASSISTANT DRAWER (Ultra-compact, space-saving) */}
              {showInlineAi && (
                <div
                  className={`p-2 sm:p-2.5 rounded-xl border space-y-1.5 transition-all ${
                    isDark
                      ? 'bg-[#080D1A]/90 border-cyan-500/30 shadow-xs'
                      : 'bg-cyan-50/50 border-cyan-200 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400">
                      <Sparkles className="h-3 w-3 text-cyan-400" />
                      <span>Rédiger avec Gemini</span>
                      <span
                        className={`text-[10px] font-mono px-1 py-0.5 rounded border hidden sm:inline ${
                          isDark
                            ? 'bg-cyan-950/80 border-cyan-800/60 text-cyan-300'
                            : 'bg-white border-cyan-200 text-cyan-900'
                        }`}
                        title="Langue détectée"
                      >
                        {detectedEmailLang}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Thread message selector if multi-message thread */}
                      {threadMessages.length > 1 && (
                        <select
                          value={replyTargetEmail.id}
                          onChange={(e) => {
                            const selected = threadMessages.find((m) => m.id === e.target.value);
                            if (selected) setReplyTargetEmail(selected);
                          }}
                          className={`h-6 px-1 rounded text-[10px] font-sans border outline-none ${
                            isDark ? 'bg-[#0E131F] border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                          title="Message cible"
                        >
                          {threadMessages.map((m, i) => (
                            <option key={m.id} value={m.id}>
                              #{i + 1} ({resolveContactDisplayName(m.fromEmail, m.fromName)})
                            </option>
                          ))}
                        </select>
                      )}

                      {/* Tone Selector */}
                      <select
                        value={inlineAiTone}
                        onChange={(e) => setInlineAiTone(e.target.value as AiTone)}
                        className={`h-6 px-1 rounded text-[10px] font-mono border outline-none cursor-pointer ${
                          isDark ? 'bg-[#0E131F] border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                        title="Ton de la réponse"
                      >
                        {TONES.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.label}
                          </option>
                        ))}
                      </select>

                      {/* Language Selector */}
                      <select
                        value={inlineAiLanguage}
                        onChange={(e) => setInlineAiLanguage(e.target.value as AiLanguage)}
                        className={`h-6 px-1 rounded text-[10px] font-mono border outline-none cursor-pointer font-bold ${
                          isDark ? 'bg-[#0E131F] border-slate-700 text-cyan-300' : 'bg-white border-cyan-300 text-cyan-900'
                        }`}
                        title={`Langue de la réponse IA (détectée : ${detectedEmailLang})`}
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.flag} {l.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => setShowInlineAi(false)}
                        className="text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer ml-0.5"
                        title="Fermer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Prompt input row with integrated quick models */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={customAiPrompt}
                      onChange={(e) => setCustomAiPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleGenerateCustomReply();
                        }
                      }}
                      placeholder="Consigne : ex. Remercier et confirmer la date..."
                      className={`flex-1 h-7.5 px-2.5 text-xs rounded-lg border outline-none font-sans ${
                        isDark
                          ? 'bg-[#05070A] border-slate-700 text-white placeholder-slate-500 focus:border-cyan-400'
                          : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600'
                      }`}
                    />

                    {/* Compact quick template selector */}
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleGenerateCustomReply(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      disabled={isGeneratingCustomReply}
                      className={`h-7.5 px-2 rounded-lg text-[11px] font-mono border outline-none cursor-pointer shrink-0 ${
                        isDark
                          ? 'bg-slate-800/90 border-slate-700 text-cyan-300 hover:text-white'
                          : 'bg-white border-slate-300 text-cyan-900 hover:bg-slate-50'
                      }`}
                      title="Sélectionner un modèle rapide"
                    >
                      <option value="" disabled>Modèle rapide...</option>
                      <option value="Remercie chaleureusement et confirme que tout est validé.">Remercier & Valider</option>
                      <option value="Remercie pour le message et demande courtoisement un délai supplémentaire de 48 heures.">Demander un délai</option>
                      <option value="Remercie pour la proposition mais décline poliment pour le moment avec bienveillance.">Décliner poliment</option>
                      <option value="Accuse réception avec intérêt et demande des détails complémentaires sur les prochaines étapes.">Demander des détails</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleGenerateCustomReply()}
                      disabled={isGeneratingCustomReply || !customAiPrompt.trim()}
                      className="inline-flex items-center gap-1 h-7.5 px-3 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {isGeneratingCustomReply ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span className="hidden sm:inline">Génération...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3" />
                          <span>Générer</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Rich Text & Color Editor for Quick Reply with Toolbar AI Button */}
              <RichTextEmailEditor
                id="quick-reply-editor"
                value={quickReplyText}
                onChange={setQuickReplyText}
                placeholder="Rédigez votre réponse ici (saisie en couleur, surlignage et styles autorisés)..."
                minHeight="140px"
                onToggleAi={() => setShowInlineAi(!showInlineAi)}
                isAiActive={showInlineAi}
                aiButtonLabel="Aide-moi à écrire"
              />

              {/* Bottom bar with AI polishing + Signature toggle + Send */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
                {/* AI style micro-chips */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono uppercase text-slate-500 mr-0.5">IA :</span>
                  {(
                    [
                      { id: 'professional' as const, label: 'Pro' },
                      { id: 'concise' as const, label: 'Concis' },
                      { id: 'proofread' as const, label: 'Corriger' },
                    ]
                  ).map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleImproveQuickReply(action.id)}
                      disabled={isImprovingText || !quickReplyText.trim()}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition border disabled:opacity-40 cursor-pointer ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
                          : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                  {isImprovingText && <Loader2 className="h-3 w-3 animate-spin text-cyan-400 ml-1" />}
                </div>

                <div className="flex items-center gap-2">
                  {/* Signature automatic indicator */}
                  <div
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono select-none ${
                      isDark
                        ? 'bg-cyan-950/40 border border-cyan-500/30 text-cyan-300/90'
                        : 'bg-blue-50 border border-blue-200 text-blue-700/90'
                    }`}
                    title="Votre signature par défaut est automatiquement ajoutée à votre envoi"
                  >
                    <FileSignature className="h-3 w-3" />
                    <span className="hidden sm:inline">Signature</span>
                    <Check className="h-2.5 w-2.5 text-cyan-400" />
                  </div>

                  {/* Send button */}
                  <button
                    type="submit"
                    disabled={!quickReplyText.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3 w-3" />
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
