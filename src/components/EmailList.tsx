import React, { useState, useMemo } from 'react';
import {
  Square,
  CheckSquare,
  MinusSquare,
  Star,
  Trash2,
  MailOpen,
  Mail,
  ChevronLeft,
  ChevronRight,
  Inbox,
  RotateCw,
  Paperclip,
  Briefcase,
  User,
  Globe,
  Tag,
  Check,
  MessageSquare,
  Users,
} from 'lucide-react';
import { ParsedEmail } from '../types/gmail';
import { useTheme } from '../context/ThemeContext';
import { EmailCategory, CATEGORIES, classifyEmailFast } from '../services/emailClassifier';

interface EmailListProps {
  emails: ParsedEmail[];
  isLoading: boolean;
  selectedLabelName: string;
  selectedCategory: EmailCategory;
  onSelectCategory: (cat: EmailCategory) => void;
  emailCategories?: Record<string, 'pro' | 'personal' | 'sites'>;
  onUpdateEmailCategory?: (emailId: string, cat: 'pro' | 'personal' | 'sites') => void;
  onSelectEmail: (email: ParsedEmail) => void;
  onRefresh: () => void;
  onToggleStar: (email: ParsedEmail, e: React.MouseEvent) => void;
  onToggleUnread: (email: ParsedEmail, e: React.MouseEvent) => void;
  onRequestTrash: (email: ParsedEmail, e: React.MouseEvent) => void;
  onRequestBatchTrash: (selectedEmails: ParsedEmail[]) => void;
  onBatchMarkRead: (selectedEmails: ParsedEmail[], isRead: boolean) => void;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  pageIndex: number;
}

export interface ThreadGroup {
  id: string;
  threadId: string;
  emails: ParsedEmail[];
  latestEmail: ParsedEmail;
  subject: string;
  sendersSummary: string;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  category: 'pro' | 'personal' | 'sites';
  messageCount: number;
}

export const EmailList: React.FC<EmailListProps> = ({
  emails,
  isLoading,
  selectedLabelName,
  selectedCategory,
  onSelectCategory,
  emailCategories = {},
  onUpdateEmailCategory,
  onSelectEmail,
  onRefresh,
  onToggleStar,
  onToggleUnread,
  onRequestTrash,
  onRequestBatchTrash,
  onBatchMarkRead,
  hasPrevPage,
  hasNextPage,
  onPrevPage,
  onNextPage,
  pageIndex,
}) => {
  const { isDark } = useTheme();
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'unread' | 'starred'>('all');
  const [activeCategoryMenuId, setActiveCategoryMenuId] = useState<string | null>(null);

  // Helper to get effective category for an email
  const getCategory = (email: ParsedEmail): 'pro' | 'personal' | 'sites' => {
    return emailCategories[email.id] || classifyEmailFast(email);
  };

  // Group emails by thread
  const threadGroups = useMemo(() => {
    const threadMap = new Map<string, ParsedEmail[]>();

    emails.forEach((email) => {
      const key = email.threadId || email.id;
      const list = threadMap.get(key) || [];
      list.push(email);
      threadMap.set(key, list);
    });

    const groups: ThreadGroup[] = [];

    threadMap.forEach((msgs, key) => {
      const sorted = [...msgs].sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
      const latest = sorted[sorted.length - 1];
      const isUnread = sorted.some((m) => m.isUnread);
      const isStarred = sorted.some((m) => m.isStarred);
      const hasAttachments = sorted.some((m) => m.attachments && m.attachments.length > 0);

      // Unique senders summary
      const senders: string[] = [];
      sorted.forEach((m) => {
        const name = m.fromName || m.fromEmail.split('@')[0];
        if (!senders.includes(name)) {
          senders.push(name);
        }
      });
      const sendersSummary = senders.join(', ');

      const category = getCategory(latest);

      groups.push({
        id: key,
        threadId: latest.threadId || latest.id,
        emails: sorted,
        latestEmail: latest,
        subject: latest.subject || '(Sans objet)',
        sendersSummary,
        isUnread,
        isStarred,
        hasAttachments,
        category,
        messageCount: sorted.length,
      });
    });

    return groups.sort(
      (a, b) => Number(b.latestEmail.internalDate) - Number(a.latestEmail.internalDate)
    );
  }, [emails, emailCategories]);

  // Counts for categories in thread list
  const categoryCounts = useMemo(() => {
    const counts = { pro: 0, personal: 0, sites: 0 };
    threadGroups.forEach((t) => {
      if (counts[t.category] !== undefined) {
        counts[t.category]++;
      }
    });
    return counts;
  }, [threadGroups]);

  // Filter threads by both read/starred filter AND selectedCategory
  const filteredThreads = threadGroups.filter((t) => {
    if (filterType === 'unread' && !t.isUnread) return false;
    if (filterType === 'starred' && !t.isStarred) return false;

    if (selectedCategory !== 'all') {
      if (t.category !== selectedCategory) return false;
    }

    return true;
  });

  const allFilteredSelected =
    filteredThreads.length > 0 &&
    filteredThreads.every((t) => selectedThreadIds.has(t.id));
  const someFilteredSelected =
    filteredThreads.some((t) => selectedThreadIds.has(t.id)) && !allFilteredSelected;

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedThreadIds(new Set());
    } else {
      const next = new Set<string>();
      filteredThreads.forEach((t) => next.add(t.id));
      setSelectedThreadIds(next);
    }
  };

  const handleToggleSelectItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedThreadIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedThreadIds(next);
  };

  // Extract all ParsedEmail objects from selected threads for batch actions
  const selectedEmailsList = useMemo(() => {
    const result: ParsedEmail[] = [];
    threadGroups.forEach((t) => {
      if (selectedThreadIds.has(t.id)) {
        result.push(...t.emails);
      }
    });
    return result;
  }, [threadGroups, selectedThreadIds]);

  return (
    <div
      id="email-list-container"
      className={`flex h-full flex-col overflow-hidden transition-colors ${
        isDark ? 'bg-[#05070A] text-slate-300' : 'bg-slate-50 text-slate-700'
      }`}
    >
      {/* Category Tabs Strip: Separation Pro / Perso / Sites */}
      <div
        id="email-category-tabs-bar"
        className={`flex items-center gap-1.5 px-4 py-2 border-b overflow-x-auto select-none shrink-0 ${
          isDark ? 'border-slate-800 bg-[#080B10]' : 'border-slate-200 bg-white'
        }`}
      >
        <button
          id="category-tab-all"
          type="button"
          onClick={() => onSelectCategory('all')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            selectedCategory === 'all'
              ? isDark
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 font-semibold shadow-xs'
                : 'bg-slate-200 text-slate-900 border border-slate-300 font-semibold'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Tag className="h-3.5 w-3.5" />
          <span>Toutes les discussions</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {threadGroups.length}
          </span>
        </button>

        {/* Pro tab */}
        <button
          id="category-tab-pro"
          type="button"
          onClick={() => onSelectCategory('pro')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            selectedCategory === 'pro'
              ? isDark
                ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-500/50 font-semibold shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                : 'bg-blue-100 text-blue-900 border border-blue-300 font-semibold'
              : isDark
              ? 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800/40'
              : 'text-slate-600 hover:text-blue-700 hover:bg-slate-100'
          }`}
        >
          <Briefcase className={`h-3.5 w-3.5 ${isDark ? 'text-cyan-400' : 'text-blue-600'}`} />
          <span>Professionnels</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              isDark ? 'bg-cyan-900/40 text-cyan-300' : 'bg-blue-200/70 text-blue-800'
            }`}
          >
            {categoryCounts.pro}
          </span>
        </button>

        {/* Personal tab */}
        <button
          id="category-tab-personal"
          type="button"
          onClick={() => onSelectCategory('personal')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            selectedCategory === 'personal'
              ? isDark
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/50 font-semibold shadow-[0_0_12px_rgba(52,211,153,0.2)]'
                : 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-semibold'
              : isDark
              ? 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800/40'
              : 'text-slate-600 hover:text-emerald-700 hover:bg-slate-100'
          }`}
        >
          <User className={`h-3.5 w-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
          <span>Personnels</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-200/70 text-emerald-800'
            }`}
          >
            {categoryCounts.personal}
          </span>
        </button>

        {/* Sites tab */}
        <button
          id="category-tab-sites"
          type="button"
          onClick={() => onSelectCategory('sites')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            selectedCategory === 'sites'
              ? isDark
                ? 'bg-violet-950/60 text-violet-300 border border-violet-500/50 font-semibold shadow-[0_0_12px_rgba(167,139,250,0.2)]'
                : 'bg-purple-100 text-purple-900 border border-purple-300 font-semibold'
              : isDark
              ? 'text-slate-400 hover:text-violet-300 hover:bg-slate-800/40'
              : 'text-slate-600 hover:text-purple-700 hover:bg-slate-100'
          }`}
        >
          <Globe className={`h-3.5 w-3.5 ${isDark ? 'text-violet-400' : 'text-purple-600'}`} />
          <span>Sites & Notifications</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              isDark ? 'bg-violet-900/40 text-violet-300' : 'bg-purple-200/70 text-purple-800'
            }`}
          >
            {categoryCounts.sites}
          </span>
        </button>
      </div>

      {/* Action Toolbar Header */}
      <div
        className={`flex items-center justify-between border-b px-4 py-2 select-none shrink-0 ${
          isDark
            ? 'border-slate-800 bg-[#080B10]/60'
            : 'border-slate-200 bg-white/60'
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Select All Checkbox */}
          <button
            id="select-all-emails-btn"
            type="button"
            onClick={handleToggleSelectAll}
            className={`rounded p-1 transition ${
              isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-cyan-400'
                : 'text-slate-600 hover:bg-slate-200 hover:text-cyan-600'
            }`}
            title="Tout sélectionner / désélectionner"
          >
            {allFilteredSelected ? (
              <CheckSquare className="h-4 w-4 text-cyan-400" />
            ) : someFilteredSelected ? (
              <MinusSquare className="h-4 w-4 text-cyan-400" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>

          {/* Refresh Button */}
          <button
            id="refresh-emails-btn"
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className={`rounded p-1 transition ${
              isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-cyan-400'
                : 'text-slate-600 hover:bg-slate-200 hover:text-cyan-600'
            }`}
            title="Actualiser la boîte"
          >
            <RotateCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`}
            />
          </button>

          {/* Batch Actions (Visible when items selected) */}
          {selectedThreadIds.size > 0 && (
            <div className="flex items-center gap-1 border-l pl-2 border-slate-700/60 animate-in fade-in duration-200">
              <span className={`text-xs font-mono mr-2 ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>
                {selectedThreadIds.size} sélectionné(s)
              </span>

              {/* Mark as read */}
              <button
                type="button"
                onClick={() => onBatchMarkRead(selectedEmailsList, true)}
                className={`rounded p-1 transition ${
                  isDark
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-cyan-400'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-cyan-600'
                }`}
                title="Marquer comme lu"
              >
                <MailOpen className="h-4 w-4" />
              </button>

              {/* Mark as unread */}
              <button
                type="button"
                onClick={() => onBatchMarkRead(selectedEmailsList, false)}
                className={`rounded p-1 transition ${
                  isDark
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-cyan-400'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-cyan-600'
                }`}
                title="Marquer comme non lu"
              >
                <Mail className="h-4 w-4" />
              </button>

              {/* Batch Trash */}
              <button
                type="button"
                onClick={() => onRequestBatchTrash(selectedEmailsList)}
                className={`rounded p-1 transition ${
                  isDark
                    ? 'text-slate-400 hover:bg-red-950/50 hover:text-red-400'
                    : 'text-slate-600 hover:bg-red-50 hover:text-red-600'
                }`}
                title="Déplacer vers la corbeille"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right side: Sub-filters & Pagination */}
        <div className="flex items-center gap-3">
          {/* Sub Filters: All / Unread / Starred */}
          <div
            className={`hidden sm:flex items-center rounded-lg p-0.5 text-xs ${
              isDark ? 'bg-slate-900/80 text-slate-400' : 'bg-slate-200/80 text-slate-600'
            }`}
          >
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`rounded-md px-2.5 py-1 transition ${
                filterType === 'all'
                  ? isDark
                    ? 'bg-slate-800 font-semibold text-cyan-400 border border-cyan-500/30 shadow-xs'
                    : 'bg-white font-semibold text-slate-900 shadow-xs'
                  : isDark
                  ? 'hover:text-slate-200'
                  : 'hover:text-slate-900'
              }`}
            >
              Tous
            </button>
            <button
              type="button"
              onClick={() => setFilterType('unread')}
              className={`rounded-md px-2.5 py-1 transition ${
                filterType === 'unread'
                  ? isDark
                    ? 'bg-slate-800 font-semibold text-cyan-400 border border-cyan-500/30 shadow-xs'
                    : 'bg-white font-semibold text-slate-900 shadow-xs'
                  : isDark
                  ? 'hover:text-slate-200'
                  : 'hover:text-slate-900'
              }`}
            >
              Non lus
            </button>
            <button
              type="button"
              onClick={() => setFilterType('starred')}
              className={`rounded-md px-2.5 py-1 transition ${
                filterType === 'starred'
                  ? isDark
                    ? 'bg-slate-800 font-semibold text-cyan-400 border border-cyan-500/30 shadow-xs'
                    : 'bg-white font-semibold text-slate-900 shadow-xs'
                  : isDark
                  ? 'hover:text-slate-200'
                  : 'hover:text-slate-900'
              }`}
            >
              Suivis
            </button>
          </div>

          {/* Pagination Controls */}
          <div
            className={`flex items-center gap-1 border-l pl-2 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <span className={`text-xs font-mono mr-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Page {pageIndex + 1}
            </span>
            <button
              id="prev-page-btn"
              type="button"
              onClick={onPrevPage}
              disabled={!hasPrevPage || isLoading}
              className={`rounded p-1 disabled:opacity-30 transition ${
                isDark
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-cyan-400'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-cyan-600'
              }`}
              title="Plus récents"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              id="next-page-btn"
              type="button"
              onClick={onNextPage}
              disabled={!hasNextPage || isLoading}
              className={`rounded p-1 disabled:opacity-30 transition ${
                isDark
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-cyan-400'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-cyan-600'
              }`}
              title="Plus anciens"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Email / Thread List Rows */}
      <div
        className={`flex-1 overflow-y-auto divide-y ${
          isDark ? 'divide-slate-800/60 bg-[#05070A]' : 'divide-slate-200 bg-slate-50'
        }`}
      >
        {isLoading && emails.length === 0 ? (
          // Loading Skeletons
          <div className="p-4 space-y-3">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className={`flex items-center gap-4 rounded-lg border p-3.5 animate-pulse ${
                  isDark ? 'bg-slate-900/40 border-slate-800/50' : 'bg-white border-slate-200'
                }`}
              >
                <div className={`h-4 w-4 rounded ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <div className={`h-4 w-4 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <div className={`h-4 w-32 rounded ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <div className={`h-4 flex-1 rounded ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <div className={`h-4 w-16 rounded ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
              </div>
            ))}
          </div>
        ) : filteredThreads.length === 0 ? (
          // Empty State
          <div className="flex h-72 flex-col items-center justify-center p-8 text-center">
            <div
              className={`w-16 h-16 rounded-full border flex items-center justify-center mb-3 ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <Inbox
                className={`h-8 w-8 stroke-[1.5] ${
                  isDark ? 'text-cyan-400/60' : 'text-cyan-600/60'
                }`}
              />
            </div>
            <p
              className={`text-sm font-semibold font-mono uppercase tracking-wider ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              Aucune discussion trouvée
            </p>
            <p
              className={`mt-1 text-xs font-mono max-w-sm ${
                isDark ? 'text-slate-500' : 'text-slate-500'
              }`}
            >
              {selectedCategory !== 'all'
                ? `Aucune discussion dans la catégorie "${CATEGORIES[selectedCategory]?.label || selectedCategory}".`
                : filterType !== 'all'
                ? `Aucune discussion ne correspond au filtre "${filterType === 'unread' ? 'Non lus' : 'Suivis'}".`
                : `Les courriels et discussions s'afficheront ici.`}
            </p>
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const isSelected = selectedThreadIds.has(thread.id);
            const catInfo = CATEGORIES[thread.category];
            const isCategoryMenuOpen = activeCategoryMenuId === thread.id;
            const latest = thread.latestEmail;

            return (
              <div
                key={thread.id}
                id={`thread-row-${thread.id}`}
                onClick={() => onSelectEmail(latest)}
                className={`group flex items-center gap-3 px-4 py-2.5 text-xs transition cursor-pointer select-none border-l-2 relative ${
                  isSelected
                    ? isDark
                      ? 'bg-cyan-950/30 border-cyan-400 text-cyan-200'
                      : 'bg-cyan-50 border-cyan-500 text-cyan-900'
                    : thread.isUnread
                    ? isDark
                      ? 'bg-[#0a0e16] border-cyan-400/80 hover:bg-[#0f1522] text-white'
                      : 'bg-white border-cyan-500 hover:bg-slate-50 text-slate-900 shadow-xs'
                    : isDark
                    ? 'bg-transparent border-transparent hover:bg-slate-900/50 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50/50 border-transparent hover:bg-white text-slate-600 hover:text-slate-900'
                }`}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={(e) => handleToggleSelectItem(thread.id, e)}
                  className={`p-1 shrink-0 transition ${
                    isDark
                      ? 'text-slate-500 hover:text-cyan-400'
                      : 'text-slate-400 hover:text-cyan-600'
                  }`}
                >
                  {isSelected ? (
                    <CheckSquare className="h-4 w-4 text-cyan-400" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>

                {/* Star Button (acts on latest email) */}
                <button
                  type="button"
                  onClick={(e) => onToggleStar(latest, e)}
                  className="p-1 hover:text-amber-400 shrink-0 transition"
                  title={thread.isStarred ? 'Ne plus suivre' : 'Suivre'}
                >
                  <Star
                    className={`h-4 w-4 ${
                      thread.isStarred
                        ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]'
                        : isDark
                        ? 'text-slate-600 group-hover:text-slate-500'
                        : 'text-slate-300 group-hover:text-slate-400'
                    }`}
                  />
                </button>

                {/* Category Badge with quick override dropdown (Icon only) */}
                <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setActiveCategoryMenuId(isCategoryMenuOpen ? null : thread.id)}
                    className={`flex items-center justify-center p-1.5 rounded-lg text-[10px] font-mono border transition ${
                      isDark
                        ? `${catInfo.bgDark} ${catInfo.colorDark} ${catInfo.borderDark} hover:brightness-125`
                        : `${catInfo.bgLight} ${catInfo.colorLight} ${catInfo.borderLight} hover:brightness-95`
                    }`}
                    title={`Catégorie : ${catInfo.label}. Cliquer pour modifier.`}
                  >
                    {thread.category === 'pro' && <Briefcase className="h-3.5 w-3.5 shrink-0" />}
                    {thread.category === 'personal' && <User className="h-3.5 w-3.5 shrink-0" />}
                    {thread.category === 'sites' && <Globe className="h-3.5 w-3.5 shrink-0" />}
                  </button>

                  {/* Manual category dropdown */}
                  {isCategoryMenuOpen && (
                    <div
                      className={`absolute left-0 top-7 z-30 w-44 rounded-xl border p-1 shadow-xl text-left ${
                        isDark
                          ? 'bg-[#0c1017] border-slate-700 text-slate-300'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                      onMouseLeave={() => setActiveCategoryMenuId(null)}
                    >
                      <div
                        className={`px-2 py-1 text-[9px] uppercase tracking-wider font-mono ${
                          isDark ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        Changer la catégorie
                      </div>
                      {(['pro', 'personal', 'sites'] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            if (onUpdateEmailCategory) {
                              thread.emails.forEach((m) => onUpdateEmailCategory(m.id, c));
                            }
                            setActiveCategoryMenuId(null);
                          }}
                          className={`flex w-full items-center justify-between px-2 py-1.5 rounded-lg text-xs transition ${
                            thread.category === c
                              ? isDark
                                ? 'bg-slate-800 text-white font-semibold'
                                : 'bg-slate-100 text-slate-900 font-semibold'
                              : isDark
                              ? 'hover:bg-slate-800/50'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {c === 'pro' && <Briefcase className="h-3.5 w-3.5 text-cyan-400" />}
                            {c === 'personal' && <User className="h-3.5 w-3.5 text-emerald-400" />}
                            {c === 'sites' && <Globe className="h-3.5 w-3.5 text-violet-400" />}
                            <span>{CATEGORIES[c].label}</span>
                          </div>
                          {thread.category === c && <Check className="h-3 w-3 text-cyan-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Senders Summary + Thread Count Badge */}
                <div className="w-36 sm:w-44 shrink-0 flex items-center gap-1.5 truncate">
                  <span
                    className={`truncate ${
                      thread.isUnread
                        ? isDark
                          ? 'font-bold text-white'
                          : 'font-bold text-slate-900'
                        : isDark
                        ? 'font-normal text-slate-400'
                        : 'font-normal text-slate-600'
                    }`}
                    title={thread.sendersSummary}
                  >
                    {thread.sendersSummary}
                  </span>

                  {thread.messageCount > 1 && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                        isDark
                          ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-800/60'
                          : 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                      }`}
                      title={`${thread.messageCount} messages dans cette discussion`}
                    >
                      {thread.messageCount}
                    </span>
                  )}
                </div>

                {/* Subject & Snippet */}
                <div className="flex-1 min-w-0 flex items-center gap-2 truncate">
                  <span
                    className={`truncate ${
                      thread.isUnread
                        ? isDark
                          ? 'font-semibold text-white'
                          : 'font-semibold text-slate-900'
                        : isDark
                        ? 'font-normal text-slate-300'
                        : 'font-normal text-slate-700'
                    }`}
                  >
                    {thread.subject}
                  </span>
                  <span
                    className={`font-normal truncate hidden sm:inline ${
                      isDark ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    - {latest.snippet}
                  </span>
                </div>

                {/* Attachment Indicator */}
                {thread.hasAttachments && (
                  <div
                    className={`p-1 shrink-0 ${
                      isDark ? 'text-cyan-400/80' : 'text-cyan-600'
                    }`}
                    title="Contient des pièces jointes"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </div>
                )}

                {/* Quick Row Hover Actions */}
                <div className="hidden group-hover:flex items-center gap-1 shrink-0 bg-inherit pl-2">
                  <button
                    type="button"
                    onClick={(e) => onToggleUnread(latest, e)}
                    className={`rounded p-1 transition ${
                      isDark
                        ? 'text-slate-400 hover:bg-slate-800 hover:text-cyan-300'
                        : 'text-slate-500 hover:bg-slate-200 hover:text-cyan-700'
                    }`}
                    title={thread.isUnread ? 'Marquer comme lu' : 'Marquer comme non lu'}
                  >
                    {thread.isUnread ? (
                      <MailOpen className="h-3.5 w-3.5" />
                    ) : (
                      <Mail className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => onRequestTrash(latest, e)}
                    className={`rounded p-1 transition ${
                      isDark
                        ? 'text-slate-400 hover:bg-red-950/40 hover:text-red-400'
                        : 'text-slate-500 hover:bg-red-50 hover:text-red-600'
                    }`}
                    title="Déplacer dans la corbeille"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Date */}
                <div className="w-20 text-right shrink-0 group-hover:hidden sm:group-hover:inline">
                  <span
                    className={`text-[11px] font-mono ${
                      thread.isUnread
                        ? 'font-bold text-cyan-500'
                        : isDark
                        ? 'text-slate-500'
                        : 'text-slate-400'
                    }`}
                  >
                    {latest.dateStr}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
