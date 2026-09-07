import React, { useEffect, useRef, useState } from 'react';
import { Menu, Search, X, LogOut, Mail, RefreshCw, UserPlus, Check, Trash2 } from 'lucide-react';
import { AuthenticatedUser } from '../services/googleAuth';
import { GmailProfile } from '../types/gmail';
import { useTheme } from '../context/ThemeContext';
import { StoredAccount } from '../services/multiAccountService';

interface HeaderProps {
  user: AuthenticatedUser | null;
  profile: GmailProfile | null;
  accounts?: StoredAccount[];
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
}

export const Header: React.FC<HeaderProps> = ({
  user,
  profile,
  accounts = [],
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
}) => {
  const { isDark } = useTheme();
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowUserDropdown(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const userEmail = profile?.emailAddress || user?.email || '';
  const displayName = user?.displayName || userEmail.split('@')[0] || 'User';
  const photoUrl = user?.photoURL;

  return (
    <header
      id="main-app-header"
      className={`relative z-30 flex min-h-16 w-full items-center justify-between gap-2 border-b px-3 py-2 sm:px-6 shadow-md transition-colors ${
        isDark
          ? 'border-slate-800 bg-[#080B10]'
          : 'border-slate-200 bg-white shadow-xs'
      }`}
    >
      {/* Left: Brand & Mobile Hamburger */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3 md:w-64 md:shrink-0">
        <button
          id="mobile-menu-toggle-btn"
          type="button"
          onClick={onToggleMobileSidebar}
          className={`rounded-lg p-2 md:hidden transition ${
            isDark
              ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Ouvrir le menu"
          aria-label="Ouvrir le menu de navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          {/* Cyan/Blue diamond badge */}
          <div className="w-8 h-8 bg-cyan-500 rounded-xs rotate-45 flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.35)] shrink-0">
            <div className={`w-4 h-4 rounded-xs flex items-center justify-center -rotate-45 ${isDark ? 'bg-[#05070A]' : 'bg-white'}`}>
              <Mail className="h-3 w-3 text-cyan-500" />
            </div>
          </div>
          <span className={`hidden sm:inline text-sm sm:text-lg font-bold tracking-widest uppercase font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Gmail<span className="text-cyan-500">-Pro</span>
          </span>
        </div>

        {/* Header Telemetry Badge */}
        <div className={`hidden xl:flex items-center gap-2 border-l pl-4 ml-1 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex flex-col items-start">
            <span className={`text-[9px] uppercase tracking-wider font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Flux</span>
            <span className="font-mono text-[11px] text-cyan-500 flex items-center gap-1.5 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee] animate-pulse" />
              EN LIGNE
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Search Bar */}
      <div className="min-w-0 flex-1 max-w-2xl px-1 sm:px-2">
        <form onSubmit={onSearchSubmit} className="relative flex items-center" role="search" aria-label="Rechercher dans la boîte mail">
          <div className={`absolute left-3.5 pointer-events-none ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <Search className="h-4 w-4" />
          </div>

          <input
            id="search-emails-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher des messages ou expéditeurs…"
            aria-label="Rechercher des messages ou expéditeurs"
            className={`w-full rounded-xl border py-2.5 pl-10 pr-10 text-xs sm:text-sm outline-hidden transition font-sans ${
              isDark
                ? 'border-slate-800 bg-[#05070A] text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/60 focus:bg-[#0c1017] focus:ring-1 focus:ring-cyan-500/30'
                : 'border-slate-200 bg-slate-100 text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:ring-1 focus:ring-cyan-500/30'
            }`}
          />

          {searchQuery && (
            <button
              id="clear-search-btn"
              type="button"
              onClick={() => (onClearSearch ? onClearSearch() : onSearchChange(''))}
              aria-label="Effacer la recherche"
              className={`absolute right-3 rounded-md p-0.5 transition ${isDark ? 'text-slate-500 hover:bg-slate-800 hover:text-slate-300' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>

      {/* Right: Actions and User Profile */}
      <div ref={userMenuRef} className="relative flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          id="header-refresh-btn"
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className={`rounded-lg p-2 disabled:opacity-50 transition border ${
            isDark
              ? 'text-slate-400 hover:bg-slate-800 hover:text-cyan-400 border-transparent hover:border-slate-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-cyan-600 border-transparent hover:border-slate-200'
          }`}
          title="Actualiser la boîte aux lettres"
          aria-label="Actualiser la boîte aux lettres"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-cyan-500' : ''}`} />
        </button>

        {/* User Avatar & Dropdown */}
        <button
          id="user-profile-menu-btn"
          type="button"
          onClick={() => setShowUserDropdown(!showUserDropdown)}
          aria-expanded={showUserDropdown}
          aria-haspopup="menu"
          aria-label={`Ouvrir le menu de ${displayName}`}
          className={`flex items-center gap-2 rounded-full p-1 transition hover:ring-2 hover:ring-cyan-500/40 ${isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-100'}`}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={displayName}
              referrerPolicy="no-referrer"
              className={`h-8 w-8 rounded-full border object-cover ${isDark ? 'border-slate-700' : 'border-slate-200'}`}
            />
          ) : (
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold font-mono ${
              isDark
                ? 'bg-slate-800 border border-cyan-500/30 text-cyan-400'
                : 'bg-cyan-100 border border-cyan-300 text-cyan-800'
            }`}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className={`hidden max-w-28 truncate text-left text-[11px] font-medium lg:block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            {displayName}
          </span>
        </button>

        {/* Dropdown Menu */}
        {showUserDropdown && (
          <div
            id="user-profile-dropdown"
            className={`absolute right-0 top-12 z-50 w-80 rounded-xl border p-4 shadow-xl ${
              isDark
                ? 'border-slate-800 bg-[#080B10] shadow-[0_10px_35px_rgba(0,0,0,0.85)]'
                : 'border-slate-200 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.15)]'
            }`}
          >
            {/* Active User Header */}
            <div className={`flex items-center gap-3 border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 rounded-full border border-slate-700 object-cover"
                />
              ) : (
                <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold font-mono ${
                  isDark
                    ? 'bg-slate-800 border border-cyan-500/30 text-cyan-400'
                    : 'bg-cyan-100 border border-cyan-300 text-cyan-800'
                }`}>
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {displayName}
                </p>
                <p className={`truncate text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {userEmail}
                </p>
              </div>
            </div>

            {profile && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                <div className={`rounded-lg border p-2 ${isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`block font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {profile.messagesTotal.toLocaleString('fr-FR')}
                  </span>
                  <span className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Messages</span>
                </div>
                <div className={`rounded-lg border p-2 ${isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="block font-mono font-bold text-cyan-500">
                    {profile.threadsTotal.toLocaleString('fr-FR')}
                  </span>
                  <span className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Fils</span>
                </div>
              </div>
            )}

            {/* Connected Accounts List */}
            <div className="mt-3 pt-3 border-t border-slate-800/80">
              <p className={`text-[10px] font-mono uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Comptes connectés ({accounts.length})
              </p>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {accounts.map((acc) => {
                  const accEmail = acc.user.email || acc.user.uid;
                  const isActive = accEmail.toLowerCase() === userEmail.toLowerCase();
                  return (
                    <div
                      key={accEmail}
                      className={`flex items-center justify-between rounded-lg p-2 border text-xs transition ${
                        isActive
                          ? isDark
                            ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
                            : 'bg-cyan-50 border-cyan-300 text-cyan-900'
                          : isDark
                          ? 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-300'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!isActive && onSwitchAccount) {
                            onSwitchAccount(accEmail);
                          }
                        }}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                      >
                        {acc.user.photoURL ? (
                          <img
                            src={acc.user.photoURL}
                            alt=""
                            className="h-6 w-6 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-slate-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                            {(acc.user.displayName || accEmail).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium leading-tight">
                            {acc.user.displayName || accEmail.split('@')[0]}
                          </p>
                          <p className="truncate text-[10px] font-mono opacity-70">
                            {accEmail}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {isActive ? (
                          <span className="flex items-center gap-1 text-[9px] font-mono bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30">
                            <Check className="h-3 w-3" /> Actif
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSwitchAccount && onSwitchAccount(accEmail)}
                            className="text-[10px] font-mono text-cyan-400 hover:underline px-1.5 py-0.5"
                          >
                            Basculez
                          </button>
                        )}

                        {onRemoveAccount && accounts.length > 1 && (
                          <button
                            type="button"
                            title="Retirer ce compte"
                            onClick={() => onRemoveAccount(accEmail)}
                            className="text-slate-400 hover:text-red-400 p-1 rounded hover:bg-slate-800/60 transition"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Account Button */}
              <button
                id="add-another-account-btn"
                type="button"
                onClick={() => {
                  setShowUserDropdown(false);
                  if (onAddAccount) onAddAccount();
                }}
                className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg border py-2 px-3 text-xs font-mono font-medium transition ${
                  isDark
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400'
                    : 'border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>+ Ajouter un autre compte Google</span>
              </button>
            </div>

            {/* Logout Total Button */}
            <div className={`mt-3 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <button
                id="sign-out-btn"
                type="button"
                onClick={() => {
                  setShowUserDropdown(false);
                  onSignOut();
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition font-mono ${
                  isDark
                    ? 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-red-950/40 hover:text-red-400 hover:border-red-800/50'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                }`}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Déconnecter tous les comptes</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};


