import React, { useRef, useState } from 'react';
import { Mail, ShieldCheck, Inbox, Search, Sparkles, ExternalLink, AlertCircle, ChevronDown, ChevronUp, Copy, Check, Globe } from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { copyToClipboard, selectElementText } from '../utils/clipboard';

interface SignInPromptProps {
  onSignIn: () => void;
  isLoading: boolean;
  error?: string | null;
}

export const SignInPrompt: React.FC<SignInPromptProps> = ({ onSignIn, isLoading, error }) => {
  const [showHelpDetails, setShowHelpDetails] = useState(false);
  const [domainCopied, setDomainCopied] = useState(false);
  const [copyBlocked, setCopyBlocked] = useState(false);
  const domainCodeRef = useRef<HTMLElement | null>(null);

  const isDomainError = !!error && error.startsWith('Domaine non autorisé');
  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
  const firebaseSettingsUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;
  const gcpCredentialsUrl = `https://console.cloud.google.com/apis/credentials?project=${firebaseConfig.projectId}`;

  const copyDomain = async () => {
    setCopyBlocked(false);
    const ok = await copyToClipboard(currentDomain);
    if (ok) {
      setDomainCopied(true);
      setTimeout(() => setDomainCopied(false), 2000);
    } else {
      // Copie automatique bloquée (iframe) : on sélectionne le domaine pour Ctrl+C
      selectElementText(domainCodeRef.current);
      setCopyBlocked(true);
    }
  };

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

            {/* Aide spécifique : domaine non autorisé Firebase Auth */}
            {isDomainError && currentDomain && (
              <div className="mt-3 rounded-lg bg-slate-900/70 border border-slate-700/60 p-3 space-y-2.5">
                <div className="flex items-center gap-2 text-[11px] text-slate-300">
                  <Globe className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span>Domaine actuel à autoriser :</span>
                  <code
                    ref={domainCodeRef}
                    className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300 font-mono text-[11px] break-all select-all cursor-text"
                    title="Cliquez pour sélectionner le domaine"
                    onClick={(e) => selectElementText(e.currentTarget)}
                  >
                    {currentDomain}
                  </code>
                  <button
                    type="button"
                    onClick={copyDomain}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition shrink-0"
                    title="Copier le domaine"
                  >
                    {domainCopied ? (
                      <>
                        <Check className="h-3 w-3" /> Copié
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copier
                      </>
                    )}
                  </button>
                </div>

                {copyBlocked && (
                  <p className="text-[10px] text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    Copie automatique bloquée par le navigateur : le domaine est sélectionné —
                    faites <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-600 font-mono">Ctrl+C</kbd>
                    (ou <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-600 font-mono">⌘C</kbd>) pour le copier.
                  </p>
                )}

                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 leading-relaxed">
                  <li>
                    Ouvrez{' '}
                    <a
                      href={firebaseSettingsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 underline inline-flex items-center gap-1"
                    >
                      Firebase Console → Authentication → Domaines autorisés
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Cliquez sur « Ajouter un domaine » et collez le domaine ci-dessus.</li>
                  <li>
                    (Recommandé) Ajoutez aussi l'origine{' '}
                    <code className="text-cyan-300">{typeof window !== 'undefined' ? window.location.origin : ''}</code>{' '}
                    dans{' '}
                    <a
                      href={gcpCredentialsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 underline inline-flex items-center gap-1"
                    >
                      Google Cloud → Identifiants → Origines JavaScript
                      <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    du client OAuth.
                  </li>
                  <li>Revenez ici et cliquez à nouveau sur « S'authentifier avec Google ».</li>
                </ol>

                <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-2">
                  Astuce : en développement local (http://localhost:3000), la connexion fonctionne
                  sans configuration — localhost est toujours autorisé par défaut.
                </p>
              </div>
            )}
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

      {/* Crédit créateur */}
      <div className="relative z-10 mt-5 flex flex-col items-center gap-1 text-center">
        <p className="text-[11px] font-mono text-slate-500">
          Conçu et développé par{' '}
          <span className="font-semibold text-slate-300">MAHARITSE Hyacinthe Bertrand</span>
        </p>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <a
            href="mailto:maharitse@gmail.com"
            className="inline-flex items-center gap-1 text-cyan-400/80 hover:text-cyan-300 transition"
          >
            <Mail className="h-3 w-3" />
            maharitse@gmail.com
          </a>
          <span className="text-slate-600">•</span>
          <a
            href="tel:+261383409261"
            className="text-cyan-400/80 hover:text-cyan-300 transition"
          >
            +261 38 34 092 61
          </a>
        </div>
      </div>
    </div>
  );
};
