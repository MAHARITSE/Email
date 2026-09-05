import React, { useState } from 'react';
import { Menu, Search, X, LogOut, Mail, RefreshCw, Sun, Moon } from 'lucide-react';
import { AuthenticatedUser } from '../services/googleAuth';
import { GmailProfile } from '../types/gmail';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  user: AuthenticatedUser | null;
  profile: GmailProfile | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onToggleMobileSidebar: () => void;
  onSignOut: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  profile,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onToggleMobileSidebar,
  onSignOut,
  onRefresh,
  isRefreshing,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const userEmail = profile?.emailAddress || user?.email || '';
  const displayName = user?.displayName || userEmail.split('@')[0] || 'User';
  const photoUrl = user?.photoURL;

  return (
    <header
      id="main-app-header"
      className={`sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b px-4 sm:px-6 shadow-md transition-colors ${
        isDark
          ? 'border-slate-800 bg-[#080B10]'
          : 'border-slate-200 bg-white shadow-xs'
      }`}
    >
      {/* Left: Brand & Mobile Hamburger */}
      <div className="flex items-center gap-3 w-64 shrink-0">
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
          <span className={`text-base sm:text-lg font-bold tracking-widest uppercase font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>
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
      <div className="flex-1 max-w-2xl px-2">
        <form onSubmit={onSearchSubmit} className="relative flex items-center">
          <div className={`absolute left-3.5 pointer-events-none ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <Search className="h-4 w-4" />
          </div>

          <input
            id="search-emails-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher des messages, libellés ou expéditeurs (ex: de:équipe, réunion)..."
            className={`w-full rounded-lg border py-2 pl-10 pr-10 text-xs sm:text-sm outline-hidden transition font-sans ${
              isDark
                ? 'border-slate-800 bg-[#05070A] text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/60 focus:bg-[#0c1017] focus:ring-1 focus:ring-cyan-500/30'
                : 'border-slate-200 bg-slate-100 text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:ring-1 focus:ring-cyan-500/30'
            }`}
          />

          {searchQuery && (
            <button
              id="clear-search-btn"
              type="button"
              onClick={() => onSearchChange('')}
              className={`absolute right-3 ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>

      {/* Right: Theme Toggle, Actions and User Profile */}
      <div className="flex items-center gap-2 relative">
        <button
          id="theme-toggle-btn"
          type="button"
          onClick={toggleTheme}
          className={`rounded-lg p-2 transition border ${
            isDark
              ? 'text-yellow-400 hover:bg-slate-800 border-transparent hover:border-slate-700'
              : 'text-slate-700 hover:bg-slate-100 border-transparent hover:border-slate-200'
          }`}
          title={isDark ? 'Passer au mode clair' : 'Passer au mode sombre'}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

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
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-cyan-500' : ''}`} />
        </button>

        {/* User Avatar & Dropdown */}
        <button
          id="user-profile-menu-btn"
          type="button"
          onClick={() => setShowUserDropdown(!showUserDropdown)}
          className="flex items-center gap-2 rounded-full p-1 hover:ring-2 hover:ring-cyan-500/40 transition"
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
        </button>

        {/* Dropdown Menu */}
        {showUserDropdown && (
          <div
            id="user-profile-dropdown"
            className={`absolute right-0 top-12 z-50 w-72 rounded-xl border p-4 shadow-xl ${
              isDark
                ? 'border-slate-800 bg-[#080B10] shadow-[0_10px_35px_rgba(0,0,0,0.85)]'
                : 'border-slate-200 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.15)]'
            }`}
            onMouseLeave={() => setShowUserDropdown(false)}
          >
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
                <div className={`rounded-lg border p-2.5 ${isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`block font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {profile.messagesTotal.toLocaleString('fr-FR')}
                  </span>
                  <span className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Messages</span>
                </div>
                <div className={`rounded-lg border p-2.5 ${isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="block font-mono font-bold text-cyan-500">
                    {profile.threadsTotal.toLocaleString('fr-FR')}
                  </span>
                  <span className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Fils</span>
                </div>
              </div>
            )}

            <div className={`mt-4 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
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
                <span>Déconnecter le compte</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

