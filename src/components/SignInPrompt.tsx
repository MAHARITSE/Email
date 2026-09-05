import React, { useState } from 'react';
import { Mail, ShieldCheck, Inbox, Search, Sparkles, ExternalLink, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface SignInPromptProps {
  onSignIn: () => void;
  isLoading: boolean;
  error?: string | null;
}

export const SignInPrompt: React.FC<SignInPromptProps> = ({ onSignIn, isLoading, error }) => {
  const [showHelpDetails, setShowHelpDetails] = useState(false);

  return (
    <div
      id="signin-prompt-container"
      className="relative flex min-h-screen w-full flex-col items-center justify-center bg-[#05070A] px-4 py-6 sm:py-10 text-slate-300 overflow-y-auto select-none"
    >
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="relative w-full max-w-md my-auto rounded-2xl border border-slate-800 bg-[#080B10]/95 backdrop-blur-xl p-5 sm:p-6 shadow-[0_0_50px_rgba(0,0,0,0.9)] z-10 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)] shrink-0">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse"></span>
              <h1 className="text-base sm:text-lg font-bold font-mono tracking-tight text-white uppercase">
                GMAIL-PRO // NODE
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 font-mono line-clamp-1">
              Terminal client sécurisé pour l'API Gmail
            </p>
          </div>
        </div>

        {/* Error / Expiration Notification */}
        {error && (
          <div className="rounded-xl bg-amber-950/40 p-3 text-xs font-mono text-amber-300 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold text-amber-200 uppercase tracking-wide">
                  Session expirée :
                </span>
                <p className="mt-0.5 text-slate-200 font-sans text-xs">
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Google Sign-In Primary Actions */}
        <div className="space-y-2.5">
          <button
            id="google-signin-btn"
            type="button"
            onClick={onSignIn}
            disabled={isLoading}
            className="group relative flex w-full items-center justify-center gap-3 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-xs font-mono font-bold uppercase tracking-wider text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.15)] transition hover:bg-cyan-500/20 hover:border-cyan-400 hover:text-white hover:shadow-[0_0_25px_rgba(34,211,238,0.25)] active:scale-[0.98] disabled:opacity-50"
          >
            <div className="h-4 w-4 shrink-0">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-full w-full">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                <path fill="none" d="M0 0h48v48H0z"></path>
              </svg>
            </div>
            <span>
              {isLoading
                ? 'Connexion en cours...'
                : error
                ? 'Réessayer la connexion Google'
                : 'S\'authentifier avec Google'}
            </span>
          </button>

          <a
            id="open-in-new-tab-link"
            href={typeof window !== 'undefined' ? window.location.href : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full text-xs font-mono text-slate-400 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 bg-slate-900/40 hover:bg-slate-900/80 py-2 px-4 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            <span>Ouvrir dans un nouvel onglet</span>
          </a>
        </div>

        {/* Toggleable Details & Troubleshooting Section */}
        <div className="border-t border-slate-800/80 pt-3">
          <button
            type="button"
            onClick={() => setShowHelpDetails(!showHelpDetails)}
            className="flex items-center justify-between w-full text-[11px] font-mono text-slate-400 hover:text-cyan-300 transition"
          >
            <span>{showHelpDetails ? 'Masquer les conseils & détails' : 'Afficher les conseils & détails'}</span>
            {showHelpDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showHelpDetails && (
            <div className="mt-3 space-y-3 text-xs font-mono animate-fade-in">
              {/* Feature Highlights */}
              <div className="space-y-1.5 rounded-xl bg-slate-900/50 p-3 border border-slate-800 text-[11px] text-slate-400">
                <div className="flex items-center gap-2.5">
                  <Inbox className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span>Dossiers principaux et libellés synchronisés</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Search className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span>Recherche rapide et filtres de messages</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span>Rédaction de courriels et réponses IA</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Protocoles de sécurité OAuth 2.0</span>
                </div>
              </div>

              {/* Troubleshooting Solutions */}
              <div className="rounded-lg bg-cyan-950/20 border border-cyan-500/20 p-2.5 text-[10px] text-cyan-300/90 leading-relaxed">
                <span className="font-semibold text-cyan-300">Solutions :</span>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-300">
                  <li>Gardez la fenêtre popup ouverte pendant la connexion.</li>
                  <li>Si la popup est bloquée, utilisez le bouton « Ouvrir dans un nouvel onglet ».</li>
                  <li>Désactivez temporairement les bloqueurs de fenêtres surgissantes.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[10px] font-mono text-slate-500 pt-1">
          OAuth 2.0 direct. Les jetons restent en mémoire locale.
        </p>
      </div>
    </div>
  );
};
