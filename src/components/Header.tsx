import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Menu,
  Search,
  X,
  Mail,
  RefreshCw,
  Bell,
  BellRing,
  BellOff,
  User,
  Star,
  Volume2,
  VolumeX,
  Paperclip,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Filter,
  LogOut,
  UserPlus,
} from 'lucide-react';
import { AuthenticatedUser } from '../services/googleAuth';
import { GmailProfile, ParsedEmail } from '../types/gmail';
import { useTheme } from '../context/ThemeContext';
import { StoredAccount } from '../services/multiAccountService';
import { getLocalContacts, LocalContact } from '../services/contactsService';
import {
  requestNotificationPermission,
  sendTestNotification,
  isSoundEnabled,
  setSoundEnabled,
  getNotificationPermission,
  watchSystemNotificationPermission,
} from '../services/notificationService';

interface HeaderProps {
  user: AuthenticatedUser | null;
  profile: GmailProfile | null;
  accounts?: StoredAccount[];
  emails?: ParsedEmail[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClearSearch?: () => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onToggleMobileSidebar: () => void;
  onSignOut: () => void;
  onAddAccount?: () => void;
  onSwitchAccount?: (email: string) => void;
  onRemoveAccount?: (email: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onSelectContactFilter?: (contactEmail: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  profile,
  accounts = [],
  emails = [],
  searchQuery,
  onSearchChange,
  onClearSearch,
  onSearchSubmit,
  onToggleMobileSidebar,
  onSignOut,
  onAddAccount,
  onSwitchAccount,
  onRemoveAccount,
  onRefresh,
  isRefreshing,
  onSelectContactFilter,
}) => {
  const { isDark } = useTheme();
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  // Notification states
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' ? getNotificationPermission() : 'default'
  );
  const [soundActive, setSoundActive] = useState<boolean>(isSoundEnabled());
  const [isTestingNotif, setIsTestingNotif] = useState(false);

  const notifMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const userEmail = profile?.emailAddress || user?.email || '';
  const displayName = user?.displayName || userEmail.split('@')[0] || 'User';
  const photoUrl = user?.photoURL;

  const unreadCount = useMemo(() => {
    return emails.filter((e) => e.isUnread).length;
  }, [emails]);

  // Global Ctrl+K / Cmd+K shortcut to focus search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
      }
      if (e.key === 'Escape') {
        setShowNotifMenu(false);
        setIsSearchFocused(false);
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target as Node)) {
        setShowNotifMenu(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);

    // Synchronize live with device / computer OS notification permission settings
    const unsubscribeNotif = watchSystemNotificationPermission((newPerm) => {
      setNotifPermission(newPerm);
    });

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
      unsubscribeNotif();
    };
  }, []);

  // Compute contact suggestions based on search query
  const contactSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const localContacts = getLocalContacts(userEmail);

    const seenEmails = new Set<string>();
    const allContactsList: Array<{
      id: string;
      name: string;
      email: string;
      category?: 'pro' | 'personal';
      isFavorite?: boolean;
    }> = [];

    // Add local contacts first
    localContacts.forEach((c) => {
      const emailLower = c.email.toLowerCase();
      if (!seenEmails.has(emailLower)) {
        seenEmails.add(emailLower);
        allContactsList.push({
          id: c.id,
          name: c.name,
          email: c.email,
          category: c.category,
          isFavorite: c.isFavorite,
        });
      }
    });

    // Add recent email participants
    emails.forEach((em) => {
      const fromLower = (em.fromEmail || '').toLowerCase();
      if (fromLower && !seenEmails.has(fromLower) && fromLower !== userEmail.toLowerCase()) {
        seenEmails.add(fromLower);
        allContactsList.push({
          id: `email_${fromLower}`,
          name: em.fromName || fromLower.split('@')[0],
          email: em.fromEmail,
        });
      }
    });

    if (!query) {
      return allContactsList.slice(0, 5);
    }

    const filtered = allContactsList.filter((c) => {
      return (
        c.name.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query)
      );
    });

    return filtered.slice(0, 8);
  }, [searchQuery, userEmail, emails]);

  const handleSelectContact = (contactEmail: string) => {
    onSearchChange(contactEmail);
    setIsSearchFocused(false);
    if (onSelectContactFilter) {
      onSelectContactFilter(contactEmail);
    }
  };

  const handleQuickFilterClick = (filterTerm: string) => {
    onSearchChange(filterTerm);
    setIsSearchFocused(false);
    if (onSelectContactFilter) {
      onSelectContactFilter(filterTerm);
    }
  };

  const handleToggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    setSoundEnabled(next);
  };

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
  };

  const handleTestNotification = async () => {
    setIsTestingNotif(true);
    await sendTestNotification();
    setTimeout(() => setIsTestingNotif(false), 1200);
  };

  const handleKeyDownSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearchFocused || contactSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev < contactSuggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev > 0 ? prev - 1 : contactSuggestions.length - 1
      );
    } else if (e.key === 'Enter') {
      if (selectedSuggestionIndex >= 0 && contactSuggestions[selectedSuggestionIndex]) {
        e.preventDefault();
        const selected = contactSuggestions[selectedSuggestionIndex];
        handleSelectContact(selected.email);
      }
    }
  };

  const quickFilterChips = [
    { label: 'Non lus', query: 'is:unread', icon: Mail },
    { label: 'Pièces jointes', query: 'has:attachment', icon: Paperclip },
    { label: 'Suivis', query: 'is:starred', icon: Star },
    { label: 'Pro', query: 'label:pro', icon: Filter },
  ];

  return (
    <header
      id="main-app-header"
      className={`relative z-30 flex min-h-16 w-full items-center justify-between gap-2 border-b px-3 py-2 sm:px-6 shadow-md transition-colors shrink-0 ${
        isDark
          ? 'border-slate-800 bg-[#080B10]'
          : 'border-slate-200 bg-white shadow-xs'
      }`}
    >
      {/* Mobile Fullscreen Expanded Search Overlay */}
      {isSearchFocused && (
        <div
          id="mobile-expanded-search-overlay"
          className={`md:hidden absolute inset-0 z-50 flex items-center gap-2 px-2.5 py-2 shadow-2xl transition-all ${
            isDark ? 'bg-[#080B10]' : 'bg-white'
          }`}
        >
          <button
            type="button"
            onClick={() => setIsSearchFocused(false)}
            className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
              isDark
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Fermer la recherche"
            aria-label="Fermer la recherche"
          >
            <ArrowLeft className="h-5 w-5 text-cyan-400" />
          </button>

          <form
            onSubmit={(e) => {
              onSearchSubmit(e);
              setIsSearchFocused(false);
            }}
            className={`flex-1 flex items-center rounded-xl border px-3 py-2 transition ${
              isDark
                ? 'bg-[#05070A] border-cyan-500/80 ring-2 ring-cyan-500/30'
                : 'bg-slate-50 border-cyan-500 ring-2 ring-cyan-500/20'
            }`}
          >
            <Search className="h-4 w-4 text-cyan-400 shrink-0 mr-2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setSelectedSuggestionIndex(-1);
              }}
              onKeyDown={handleKeyDownSearch}
              placeholder="Rechercher messages, expéditeurs…"
              autoFocus
              className={`w-full bg-transparent text-sm outline-none font-sans ${
                isDark
                  ? 'text-white placeholder:text-slate-500'
                  : 'text-slate-900 placeholder:text-slate-400'
              }`}
            />
          </form>
        </div>
      )}

      {/* Left: Brand & Mobile Hamburger */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3 md:w-56 md:shrink-0">
        <button
          id="mobile-menu-toggle-btn"
          type="button"
          onClick={onToggleMobileSidebar}
          className={`rounded-lg p-2 md:hidden transition cursor-pointer ${
            isDark
              ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Ouvrir le menu"
          aria-label="Ouvrir le menu de navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5">
          {/* Cyan diamond badge */}
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-cyan-500 rounded-xs rotate-45 flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.35)] shrink-0">
            <div
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-xs flex items-center justify-center -rotate-45 ${
                isDark ? 'bg-[#05070A]' : 'bg-white'
              }`}
            >
              <Mail className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-cyan-500" />
            </div>
          </div>
          <span
            className={`text-sm sm:text-base font-bold tracking-wider uppercase font-mono truncate ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}
          >
            Maharitse<span className="text-cyan-500"> Mail</span>
          </span>
        </div>
      </div>

      {/* Middle: Enhanced Search Bar */}
      <div ref={searchContainerRef} className="relative min-w-0 flex-1 max-w-2xl px-1 sm:px-2">
        <form
          onSubmit={onSearchSubmit}
          className={`relative flex items-center rounded-xl border transition-all shadow-xs ${
            isSearchFocused
              ? isDark
                ? 'border-cyan-500/70 bg-[#0C111A] ring-2 ring-cyan-500/25 shadow-[0_0_15px_rgba(34,211,238,0.15)]'
                : 'border-cyan-500 bg-white ring-2 ring-cyan-500/20 shadow-md'
              : isDark
              ? 'border-slate-800 bg-[#05070A] hover:border-slate-700'
              : 'border-slate-200 bg-slate-100 hover:bg-slate-50 hover:border-slate-300'
          }`}
          role="search"
          aria-label="Rechercher dans la boîte mail"
        >
          {/* Left search icon button */}
          <button
            type="submit"
            aria-label="Lancer la recherche"
            className={`flex items-center justify-center pl-3.5 pr-2 py-2.5 transition cursor-pointer shrink-0 ${
              isDark
                ? 'text-slate-400 hover:text-cyan-400'
                : 'text-slate-500 hover:text-cyan-600'
            }`}
            title="Lancer la recherche"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Search input field */}
          <input
            ref={searchInputRef}
            id="search-emails-input"
            type="text"
            value={searchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setIsSearchFocused(true);
              setSelectedSuggestionIndex(-1);
            }}
            onKeyDown={handleKeyDownSearch}
            placeholder="Rechercher messages, contacts, contenus…"
            aria-label="Rechercher dans les messages et leurs contenus"
            autoComplete="off"
            className={`w-full bg-transparent py-2.5 pr-3 text-xs sm:text-sm outline-none transition font-sans ${
              isDark
                ? 'text-slate-100 placeholder:text-slate-500'
                : 'text-slate-900 placeholder:text-slate-400'
            }`}
          />

          {/* Keyboard shortcut hint (hidden on mobile) */}
          <div className="flex items-center pr-2 shrink-0">
            <span
              className={`hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                isDark
                  ? 'border-slate-800 bg-slate-900/80 text-slate-500'
                  : 'border-slate-200 bg-slate-200/60 text-slate-500'
              }`}
            >
              ⌘K
            </span>
          </div>
        </form>

        {/* Contact Suggestions & Quick Filters Dropdown */}
        {isSearchFocused && (
          <div
            id="search-contact-suggestions-dropdown"
            className={`fixed md:absolute left-2 right-2 md:left-2 md:right-2 top-16 md:top-full mt-1.5 rounded-xl border p-2 shadow-2xl z-50 backdrop-blur-md animate-fade-in ${
              isDark
                ? 'border-slate-800 bg-[#0A0E17]/98 shadow-[0_12px_40px_rgba(0,0,0,0.95)]'
                : 'border-slate-200 bg-white/98 shadow-[0_12px_40px_rgba(0,0,0,0.2)]'
            }`}
          >
            {/* Quick Filter Chips */}
            <div className="mb-2 pb-2 border-b border-inherit">
              <div
                className={`text-[9px] font-mono uppercase tracking-wider mb-1.5 px-1 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Filtres rapides :
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {quickFilterChips.map((chip) => {
                  const ChipIcon = chip.icon;
                  return (
                    <button
                      key={chip.query}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleQuickFilterClick(chip.query);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono transition cursor-pointer border ${
                        isDark
                          ? 'bg-slate-900/80 border-slate-700 hover:border-cyan-500/50 hover:bg-cyan-950/40 text-slate-300 hover:text-cyan-300'
                          : 'bg-slate-50 border-slate-200 hover:border-cyan-400 hover:bg-cyan-50 text-slate-700 hover:text-cyan-900'
                      }`}
                    >
                      <ChipIcon className="h-3 w-3 text-cyan-400" />
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contact Suggestions Header */}
            {contactSuggestions.length > 0 && (
              <div>
                <div
                  className={`flex items-center justify-between px-2 py-1 text-[10px] font-mono uppercase tracking-wider mb-1 ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <User className="h-3 w-3 text-cyan-400" />
                    Suggestions de contacts
                  </span>
                  <span>{contactSuggestions.length} trouvés</span>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-0.5">
                  {contactSuggestions.map((contact, index) => {
                    const isSelected = selectedSuggestionIndex === index;
                    return (
                      <button
                        key={contact.id || contact.email}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectContact(contact.email);
                        }}
                        className={`flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                          isSelected
                            ? isDark
                              ? 'bg-cyan-950/60 border border-cyan-500/40 text-white'
                              : 'bg-cyan-50 border border-cyan-300 text-cyan-950'
                            : isDark
                            ? 'hover:bg-slate-800/70 text-slate-200'
                            : 'hover:bg-slate-100 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* Avatar */}
                          <div
                            className={`h-6.5 w-6.5 rounded-full flex items-center justify-center text-[11px] font-bold font-mono text-white shrink-0 ${
                              contact.category === 'pro'
                                ? 'bg-linear-to-br from-cyan-500 to-blue-600'
                                : 'bg-linear-to-br from-emerald-500 to-teal-600'
                            }`}
                          >
                            {(contact.name || contact.email).charAt(0).toUpperCase()}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold truncate">
                                {contact.name}
                              </span>
                              {contact.isFavorite && (
                                <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                              )}
                              {contact.category && (
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full shrink-0 ${
                                    contact.category === 'pro'
                                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                                      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  }`}
                                >
                                  {contact.category === 'pro' ? 'Pro' : 'Perso'}
                                </span>
                              )}
                            </div>
                            <p
                              className={`text-[10px] font-mono truncate ${
                                isDark ? 'text-slate-400' : 'text-slate-500'
                              }`}
                            >
                              {contact.email}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-[9px] font-mono px-2 py-0.5 rounded border ml-2 shrink-0 ${
                            isDark
                              ? 'border-slate-700 bg-slate-900/60 text-slate-400'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          Filtrer
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick full content search option */}
            {searchQuery.trim() && (
              <div
                className={`border-t mt-1.5 pt-1.5 px-2 py-1 text-[11px] font-mono flex items-center justify-between ${
                  isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'
                }`}
              >
                <span>Recherche plein texte pour « {searchQuery.trim()} »</span>
                <span className="text-cyan-400 text-[10px]">Appuyez sur Entrée ↵</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Notifications Bell, Refresh & User Profile */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Notifications Bell Dropdown */}
        <div ref={notifMenuRef} className="relative">
          <button
            id="header-notifications-btn"
            type="button"
            onClick={() => setShowNotifMenu(!showNotifMenu)}
            className={`relative rounded-lg p-2 transition border cursor-pointer ${
              notifPermission === 'granted'
                ? isDark
                  ? 'text-cyan-400 hover:bg-cyan-950/40 hover:text-cyan-300 border-cyan-500/30'
                  : 'text-cyan-600 hover:bg-cyan-50 hover:text-cyan-700 border-cyan-300'
                : isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-white border-transparent'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent'
            }`}
            title="Gérer les notifications et alertes sonores"
            aria-label="Gérer les notifications et alertes sonores"
          >
            {notifPermission === 'granted' ? (
              <BellRing className="h-4 w-4 animate-bounce-short text-cyan-400" />
            ) : notifPermission === 'denied' ? (
              <BellOff className="h-4 w-4 text-slate-500" />
            ) : (
              <Bell className="h-4 w-4" />
            )}

            {notifPermission === 'granted' && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400 ring-2 ring-[#080B10]" />
            )}
          </button>

          {/* Notifications Quick Settings Popover */}
          {showNotifMenu && (
            <div
              id="notifications-settings-popover"
              className={`absolute right-0 top-12 z-50 w-72 sm:w-80 rounded-xl border p-4 shadow-2xl backdrop-blur-md ${
                isDark
                  ? 'border-slate-800 bg-[#080B10]/95 text-slate-200 shadow-[0_10px_35px_rgba(0,0,0,0.85)]'
                  : 'border-slate-200 bg-white/95 text-slate-800 shadow-[0_10px_35px_rgba(0,0,0,0.15)]'
              }`}
            >
              <div className="flex items-center justify-between border-b pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-cyan-400" />
                  <h3 className="text-xs font-bold uppercase font-mono tracking-wider">
                    Notifications &amp; Alertes
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNotifMenu(false)}
                  className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                {/* Status banner */}
                <div
                  className={`p-2.5 rounded-lg border flex items-center justify-between ${
                    notifPermission === 'granted'
                      ? isDark
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : notifPermission === 'denied'
                      ? isDark
                        ? 'bg-red-950/30 border-red-500/40 text-red-300'
                        : 'bg-red-50 border-red-200 text-red-900'
                      : isDark
                      ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-300'
                      : 'bg-cyan-50 border-cyan-200 text-cyan-900'
                  }`}
                >
                  <div>
                    <p className="font-semibold font-mono text-[11px]">
                      {notifPermission === 'granted'
                        ? '✓ Notifications activées'
                        : notifPermission === 'denied'
                        ? '✕ Notifications bloquées'
                        : '⚠️ Notifications en attente'}
                    </p>
                    <p className="text-[10px] opacity-80">
                      Sur PC et smartphone à chaque nouvel e-mail.
                    </p>
                  </div>
                  {notifPermission !== 'granted' && (
                    <button
                      type="button"
                      onClick={handleEnableNotifications}
                      className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-[10px] font-bold shrink-0 cursor-pointer shadow-xs active:scale-95"
                    >
                      Activer
                    </button>
                  )}
                </div>

                {/* Sound Toggle */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    {soundActive ? (
                      <Volume2 className="h-4 w-4 text-cyan-400" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-slate-500" />
                    )}
                    <div>
                      <p className="font-medium text-xs">Carillon sonore &amp; Vibreur</p>
                      <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Joue un son harmonique à l'arrivée d'un message
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleSound}
                    className={`w-9 h-5 rounded-full p-0.5 transition cursor-pointer flex items-center ${
                      soundActive ? 'bg-cyan-500 justify-end' : 'bg-slate-700 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                  </button>
                </div>

                {/* Test button */}
                <button
                  type="button"
                  id="test-notification-sound-btn"
                  onClick={handleTestNotification}
                  disabled={isTestingNotif}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg border font-mono text-[11px] font-semibold transition cursor-pointer ${
                    isDark
                      ? 'border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-cyan-300'
                      : 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-cyan-800 shadow-xs'
                  }`}
                >
                  <BellRing className={`h-3.5 w-3.5 ${isTestingNotif ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>{isTestingNotif ? 'Test en cours…' : 'Tester le son & la notification'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Refresh button */}
        <button
          id="header-refresh-btn"
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className={`rounded-lg p-2 disabled:opacity-50 transition border cursor-pointer ${
            isDark
              ? 'text-slate-400 hover:bg-slate-800 hover:text-cyan-400 border-transparent hover:border-slate-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-cyan-600 border-transparent hover:border-slate-200'
          }`}
          title="Actualiser la boîte aux lettres"
          aria-label="Actualiser la boîte aux lettres"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-cyan-500' : ''}`} />
        </button>
      </div>
    </header>
  );
};
