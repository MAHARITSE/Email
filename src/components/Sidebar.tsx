import React from 'react';
import {
  Inbox,
  Star,
  Send,
  FileText,
  AlertOctagon,
  Trash2,
  Tag,
  PenSquare,
  ChevronDown,
  ChevronRight,
  Paperclip,
  Briefcase,
  User,
  Globe,
  Users,
  FileSignature,
} from 'lucide-react';
import { GmailLabel } from '../types/gmail';
import { useTheme } from '../context/ThemeContext';
import { EmailCategory } from '../services/emailClassifier';

interface SidebarProps {
  selectedLabelId: string;
  onSelectLabel: (labelId: string) => void;
  selectedCategory: EmailCategory;
  onSelectCategory: (cat: EmailCategory) => void;
  labels: GmailLabel[];
  onOpenCompose: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  unreadCount: number;
  categoryCounts?: { pro: number; personal: number; sites: number };
  onOpenContacts?: () => void;
  contactsCount?: number;
  onOpenSignatures?: () => void;
  signaturesCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  selectedLabelId,
  onSelectLabel,
  selectedCategory,
  onSelectCategory,
  labels,
  onOpenCompose,
  isOpenMobile,
  onCloseMobile,
  unreadCount,
  categoryCounts = { pro: 0, personal: 0, sites: 0 },
  onOpenContacts,
  contactsCount = 0,
  onOpenSignatures,
  signaturesCount = 0,
}) => {
  const { isDark } = useTheme();
  const [showCustomLabels, setShowCustomLabels] = React.useState(true);

  // Helper to extract unread count for any folder label (prioritizing threadsUnread for exact Gmail count parity)
  const getFolderUnread = (id: string, fallback = 0): number => {
    const found = labels.find((l) => l.id.toUpperCase() === id.toUpperCase());
    if (!found) return fallback;
    if (typeof found.threadsUnread === 'number') {
      return found.threadsUnread;
    }
    if (typeof found.messagesUnread === 'number') {
      return found.messagesUnread;
    }
    return fallback;
  };

  const inboxUnread = getFolderUnread('INBOX', unreadCount);
  const starredUnread = getFolderUnread('STARRED', 0);
  const sentUnread = getFolderUnread('SENT', 0);
  const draftUnread = getFolderUnread('DRAFT', labels.find((l) => l.id === 'DRAFT')?.threadsTotal || labels.find((l) => l.id === 'DRAFT')?.messagesTotal || 0);
  const spamUnread = getFolderUnread('SPAM', 0);
  const trashUnread = getFolderUnread('TRASH', 0);

  // System items with their respective unread message counts
  const systemNav = [
    { id: 'INBOX', name: 'Boîte de réception', icon: Inbox, count: inboxUnread },
    { id: 'ATTACHMENTS', name: 'Pièces jointes', icon: Paperclip, count: 0 },
    { id: 'STARRED', name: 'Messages suivis', icon: Star, count: starredUnread },
    { id: 'SENT', name: 'Messages envoyés', icon: Send, count: sentUnread },
    { id: 'DRAFT', name: 'Brouillons', icon: FileText, count: draftUnread },
    { id: 'SPAM', name: 'Spam', icon: AlertOctagon, count: spamUnread },
    { id: 'TRASH', name: 'Corbeille', icon: Trash2, count: trashUnread },
  ];

  // Smart Categories
  const smartCategories: Array<{ id: EmailCategory; name: string; icon: any; count: number; colorDark: string; colorLight: string }> = [
    { id: 'pro', name: 'Professionnels', icon: Briefcase, count: categoryCounts.pro, colorDark: 'text-cyan-400', colorLight: 'text-blue-600' },
    { id: 'personal', name: 'Personnels', icon: User, count: categoryCounts.personal, colorDark: 'text-emerald-400', colorLight: 'text-emerald-600' },
    { id: 'sites', name: 'Sites & Abonnements', icon: Globe, count: categoryCounts.sites, colorDark: 'text-violet-400', colorLight: 'text-violet-600' },
  ];

  // User custom labels
  const userLabels = labels.filter(
    (l) => l.type === 'user' && !['CHAT', 'UNREAD', 'IMPORTANT'].includes(l.id)
  );

  const handleNavClick = (id: string) => {
    onSelectLabel(id);
    onCloseMobile();
  };

  const handleCategoryClick = (cat: EmailCategory) => {
    if (selectedLabelId === 'ATTACHMENTS') {
      onSelectLabel('INBOX');
    }
    onSelectCategory(selectedCategory === cat ? 'all' : cat);
    onCloseMobile();
  };

  const content = (
    <div
      className={`flex h-full flex-col border-r select-none transition-colors ${
        isDark
          ? 'bg-[#080B10] border-slate-800 text-slate-400'
          : 'bg-white border-slate-200 text-slate-600'
      }`}
    >
      {/* Compose Button */}
      <div className="p-4">
        <button
          id="sidebar-compose-button"
          type="button"
          onClick={() => {
            onOpenCompose();
            onCloseMobile();
          }}
          className={`flex w-full items-center justify-center gap-2.5 rounded-lg px-4 py-3 text-xs font-mono font-bold uppercase tracking-wider transition active:scale-[0.98] ${
            isDark
              ? 'bg-cyan-500/10 border border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.15)] hover:bg-cyan-500/20 hover:border-cyan-400'
              : 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-md hover:shadow-lg'
          }`}
        >
          <PenSquare className="h-4 w-4" />
          <span>Nouveau message</span>
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1">
        <div className={`px-2 pb-1 text-[9px] font-mono uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Dossiers principaux
        </div>
        {systemNav.map((item) => {
          const Icon = item.icon;
          const isActive = selectedLabelId === item.id;
          return (
            <button
              key={item.id}
              id={`nav-label-${item.id.toLowerCase()}`}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2 text-xs font-medium transition ${
                isActive
                  ? isDark
                    ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(34,211,238,0.15)]'
                    : 'bg-cyan-50 text-cyan-800 border border-cyan-200 font-semibold'
                  : isDark
                  ? 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200 border border-transparent'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`h-4 w-4 ${
                    isActive
                      ? isDark ? 'text-cyan-400' : 'text-cyan-600'
                      : isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}
                />
                <span>{item.name}</span>
              </div>
              {item.count > 0 && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
                    isActive
                      ? isDark
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60'
                        : 'bg-cyan-200 text-cyan-900'
                      : isDark
                      ? 'bg-slate-800 text-slate-400 border border-slate-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}

        {/* Smart Categories Section */}
        <div className="pt-4">
          <div className={`px-2 pb-1 text-[9px] font-mono uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Filtres intelligents
          </div>
          <div className="space-y-1">
            {smartCategories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id && selectedLabelId !== 'ATTACHMENTS';
              return (
                <button
                  key={cat.id}
                  id={`nav-category-${cat.id}`}
                  type="button"
                  onClick={() => handleCategoryClick(cat.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2 text-xs font-medium transition ${
                    isSelected
                      ? isDark
                        ? 'bg-slate-800 border border-cyan-500/30 text-white font-semibold'
                        : 'bg-slate-100 border border-slate-300 text-slate-900 font-semibold'
                      : isDark
                      ? 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200 border border-transparent'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 ${isDark ? cat.colorDark : cat.colorLight}`} />
                    <span>{cat.name}</span>
                  </div>
                  {cat.count > 0 && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
                        isDark ? 'bg-slate-800/80 text-slate-400' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {cat.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>


        {/* Tools & Settings Section */}
        <div className="pt-4">
          <div className={`px-2 pb-1 text-[9px] font-mono uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Gestion & Outils
          </div>
          <div className="space-y-1">
            {onOpenContacts && (
              <button
                type="button"
                id="nav-open-contacts-btn"
                onClick={() => {
                  onOpenContacts();
                  onCloseMobile();
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2 text-xs font-medium transition ${
                  isDark
                    ? 'text-slate-400 hover:bg-slate-800/60 hover:text-cyan-400 border border-transparent'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-cyan-700 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-cyan-400" />
                  <span>Carnet de Contacts</span>
                </div>
                {contactsCount > 0 && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-700'}`}>
                    {contactsCount}
                  </span>
                )}
              </button>
            )}

            {onOpenSignatures && (
              <button
                type="button"
                id="nav-open-signatures-btn"
                onClick={() => {
                  onOpenSignatures();
                  onCloseMobile();
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2 text-xs font-medium transition ${
                  isDark
                    ? 'text-slate-400 hover:bg-slate-800/60 hover:text-cyan-400 border border-transparent'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-cyan-700 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FileSignature className="h-4 w-4 text-emerald-400" />
                  <span>Signatures d'e-mails</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Connection Status Badge */}
      <div className="p-3">
        <div className={`p-3 rounded-xl border ${
          isDark
            ? 'bg-cyan-950/20 border-cyan-800/40'
            : 'bg-slate-100 border-slate-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_#34d399] animate-pulse"></div>
            <span className={`text-[10px] font-bold font-mono uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-800'}`}>
              Liaison Google active
            </span>
          </div>
          <p className={`text-[10px] font-mono leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            Assistant IA Gemini & synchronisation Gmail opérationnels.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        id="desktop-sidebar"
        className="hidden md:block w-64 shrink-0 h-[calc(100vh-64px)]"
      >
        {content}
      </aside>

      {/* Mobile Drawer */}
      {isOpenMobile && (
        <div
          id="mobile-sidebar-backdrop"
          className="fixed inset-0 z-40 md:hidden bg-black/80 backdrop-blur-xs"
          onClick={onCloseMobile}
        >
          <div
            id="mobile-sidebar-drawer"
            className={`w-72 h-full shadow-2xl border-r ${
              isDark ? 'bg-[#080B10] border-slate-800' : 'bg-white border-slate-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </div>
        </div>
      )}
    </>
  );
};

