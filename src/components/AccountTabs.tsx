import React, { useState, useEffect } from 'react';
import { UserPlus, X, Mail, CheckCircle2, LogOut } from 'lucide-react';
import { AuthenticatedUser } from '../services/googleAuth';
import { StoredAccount } from '../services/multiAccountService';
import { useTheme } from '../context/ThemeContext';

interface AccountTabsProps {
  accounts: StoredAccount[];
  activeUser: AuthenticatedUser | null;
  unreadCount?: number;
  onSwitchAccount: (email: string) => void;
  onAddAccount: () => void;
  onRemoveAccount: (email: string) => void;
  onSignOut?: () => void;
  isAdding?: boolean;
}

export const AccountTabs: React.FC<AccountTabsProps> = ({
  accounts,
  activeUser,
  unreadCount = 0,
  onSwitchAccount,
  onAddAccount,
  onRemoveAccount,
  onSignOut,
  isAdding = false,
}) => {
  const { isDark } = useTheme();

  // Ensure activeUser is represented even if accounts array is still updating
  const displayAccounts: StoredAccount[] = [...accounts];
  if (
    activeUser?.email &&
    !displayAccounts.some(
      (a) => a.user.email?.toLowerCase() === activeUser.email?.toLowerCase()
    )
  ) {
    displayAccounts.unshift({
      user: activeUser,
      token: '',
      lastActive: Date.now(),
    });
  }

  return (
    <div
      id="connected-accounts-tabs-bar"
      className={`flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-2.5 border-b overflow-x-auto no-scrollbar shrink-0 transition-colors ${
        isDark
          ? 'bg-[#06080d] border-slate-800/80 text-slate-300'
          : 'bg-slate-100/90 border-slate-200 text-slate-700'
      }`}
      role="tablist"
      aria-label="Comptes Google connectés"
    >
      <div className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider mr-2 shrink-0 opacity-80">
        <Mail className="h-4 w-4 text-cyan-500" />
        <span className="hidden md:inline">Comptes :</span>
      </div>

      {/* Account Tabs */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {displayAccounts.map((acc, index) => {
          const email = acc.user.email || 'Compte Google';
          const name = acc.user.displayName || email.split('@')[0];
          const photo = acc.user.photoURL;
          const isActive =
            activeUser?.email?.toLowerCase() === email.toLowerCase() ||
            (!activeUser?.email && index === 0);

          return (
            <div
              key={email}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => {
                if (!isActive) onSwitchAccount(email);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!isActive) onSwitchAccount(email);
                }
              }}
              title={`Basculer vers ${name} (${email})`}
              className={`group relative flex items-center gap-3 px-4 py-2 sm:py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all shrink-0 select-none border ${
                isActive
                  ? isDark
                    ? 'bg-[#0e1420] border-cyan-500/60 text-white shadow-[0_0_15px_rgba(34,211,238,0.2)] ring-1 ring-cyan-500/40'
                    : 'bg-white border-cyan-500 text-slate-900 shadow-sm ring-1 ring-cyan-500/30'
                  : isDark
                  ? 'bg-slate-900/50 border-slate-800/80 text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 hover:border-slate-700'
                  : 'bg-slate-200/70 border-slate-300/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {/* User Avatar */}
              <div className="relative shrink-0">
                {photo ? (
                  <img
                    src={photo}
                    alt={name}
                    referrerPolicy="no-referrer"
                    className={`h-8 w-8 rounded-full object-cover border-2 ${
                      isActive
                        ? isDark
                          ? 'border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                          : 'border-cyan-600'
                        : isDark
                        ? 'border-slate-700'
                        : 'border-slate-300'
                    }`}
                  />
                ) : (
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold border-2 ${
                      isActive
                        ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                        : isDark
                        ? 'bg-slate-800 text-slate-300 border-slate-700'
                        : 'bg-slate-300 text-slate-700 border-slate-300'
                    }`}
                  >
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                {/* Active Indicator Dot */}
                {isActive && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyan-400 ring-2 ring-[#0e1420] shadow-[0_0_6px_#22d3ee] animate-pulse" />
                )}
              </div>

              {/* Account Label: Name & Email */}
              <div className="flex flex-col min-w-0 max-w-[180px] sm:max-w-[280px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate font-bold leading-tight text-xs sm:text-sm text-slate-900 dark:text-white">
                    {name}
                  </span>
                  {isActive && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  )}
                </div>
                <span
                  className={`truncate text-[10px] sm:text-[11px] font-mono leading-tight mt-0.5 ${
                    isActive
                      ? isDark
                        ? 'text-cyan-400/90'
                        : 'text-cyan-700 font-semibold'
                      : isDark
                      ? 'text-slate-500'
                      : 'text-slate-400'
                  }`}
                >
                  {email}
                </span>
              </div>

              {/* Number of Unread Messages Badge */}
              {isActive && (
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold shrink-0 transition-all ${
                    unreadCount > 0
                      ? isDark
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_rgba(34,211,238,0.25)]'
                        : 'bg-cyan-100 text-cyan-900 border border-cyan-300 shadow-xs'
                      : isDark
                      ? 'bg-slate-800/80 text-slate-400 border border-slate-700/60'
                      : 'bg-slate-200/80 text-slate-600 border border-slate-300'
                  }`}
                  title={`${unreadCount} message(s) non lu(s)`}
                >
                  <Mail className={`h-3.5 w-3.5 ${unreadCount > 0 ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>
                    {unreadCount} {unreadCount > 1 ? 'non lus' : 'non lu'}
                  </span>
                </div>
              )}

              {/* Disconnect Account button on tab */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (displayAccounts.length <= 1 && onSignOut) {
                    onSignOut();
                  } else {
                    onRemoveAccount(email);
                  }
                }}
                title={`Déconnecter ${name} (${email})`}
                aria-label={`Déconnecter ${email}`}
                className={`p-1.5 rounded-lg transition-all opacity-50 group-hover:opacity-100 hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 shrink-0 cursor-pointer ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        {/* Add Account Button Tab */}
        <button
          id="add-connected-account-tab-btn"
          type="button"
          onClick={onAddAccount}
          disabled={isAdding}
          title="Connecter et ajouter un autre compte Google en onglet"
          className={`flex items-center gap-2 px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition border shrink-0 ${
            isDark
              ? 'border-dashed border-slate-700 bg-slate-900/30 text-cyan-400 hover:bg-cyan-950/30 hover:border-cyan-500/50 hover:text-cyan-300'
              : 'border-dashed border-slate-300 bg-white/60 text-cyan-700 hover:bg-cyan-50 hover:border-cyan-400'
          } ${isAdding ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
        >
          <UserPlus className="h-4 w-4 text-cyan-500" />
          <span>
            {isAdding ? 'Connexion…' : '+ Ajouter un compte'}
          </span>
        </button>
      </div>
    </div>
  );
};
