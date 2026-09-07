import React, { useRef, useState } from 'react';
import { Mail, ShieldCheck, Inbox, Search, Sparkles, ExternalLink, AlertCircle, ChevronDown, ChevronUp, Copy, Check, Globe } from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { copyToClipboard, selectElementText } from '../utils/clipboard';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';

interface SignInPromptProps {
  onSignIn: () => void;
  onSignInWithToken?: (token: string) => Promise<void>;
  isLoading: boolean;
  error?: string | null;
}

export const SignInPrompt: React.FC<SignInPromptProps> = ({ onSignIn, onSignInWithToken, isLoading, error }) => {
  const { isDark } = useTheme();
  const [showHelpDetails, setShowHelpDetails] = useState(false);
  const [domainCopied, setDomainCopied] = useState(false);
  const [copyBlocked, setCopyBlocked] = useState(false);
  const domainCodeRef = useRef<HTMLElement | null>(null);

  const [accessTokenInput, setAccessTokenInput] = useState('');
  const [isTokenSubmitting, setIsTokenSubmitting] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [customClientIdInput, setCustomClientIdInput] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('custom_google_client_id') || firebaseConfig.oAuthClientId || '';
    }
    return firebaseConfig.oAuthClientId || '';
  });
  const [clientIdSaved, setClientIdSaved] = useState(false);

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessTokenInput.trim() || !onSignInWithToken) return;
    setIsTokenSubmitting(true);
    setTokenError(null);
    try {
      await onSignInWithToken(accessTokenInput.trim());
    } catch (err: any) {
      setTokenError(err?.message || 'Jeton d\'accès invalide ou expiré');
    } finally {
      setIsTokenSubmitting(false);
    }
  };

  const handleSaveClientId = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      if (customClientIdInput.trim()) {
        window.localStorage.setItem('custom_google_client_id', customClientIdInput.trim());
      } else {
        window.localStorage.removeItem('custom_google_client_id');
      }
      setClientIdSaved(true);
      setTimeout(() => setClientIdSaved(false), 2000);
    }
  };

  const isDomainError = !!error && (error.startsWith('Domaine non autorisé') || error.includes('origin_mismatch') || error.includes('Origine JavaScript'));
  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const gcpProjectId = 'gemini-507907';
  const gcpProjectNumber = '211708420086';
  const firebaseSettingsUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;
  const gcpCredentialsUrl = `https://console.cloud.google.com/apis/credentials?project=${gcpProjectId}`;
  const gcpConsentUrl = `https://console.cloud.google.com/apis/credentials/consent?project=${gcpProjectId}`;

  const copyDomain = async () => {
    setCopyBlocked(false);
    const targetText = error?.includes('origin_mismatch') || error?.includes('Origine') ? currentOrigin : currentDomain;
    const ok = await copyToClipboard(targetText);
    if (ok) {
      setDomainCopied(true);
      setTimeout(() => setDomainCopied(false), 2000);
    } else {
      // Copie automatique bloquée (iframe) : on sélectionne le texte pour Ctrl+C
      selectElementText(domainCodeRef.current);
      setCopyBlocked(true);
    }
  };

  return (
    <div
      id="signin-prompt-container"
      className={`relative flex h-screen max-h-screen w-full flex-col items-center justify-start sm:justify-center px-4 py-6 sm:py-12 text-slate-300 overflow-y-auto overscroll-contain scroll-smooth ${isDark ? 'bg-[#05070A]' : 'bg-slate-100 text-slate-700'}`}
    >
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

      <div className={`relative z-10 my-auto shrink-0 w-full max-w-md space-y-4 rounded-2xl border p-5 shadow-2xl backdrop-blur-xl sm:p-6 ${
        isDark
          ? 'border-slate-800 bg-[#080B10]/95 shadow-[0_0_50px_rgba(0,0,0,0.9)]'
          : 'border-slate-200 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.12)]'
      }`}>
        <div className={`flex items-center justify-between rounded-xl border px-3 py-2 text-[10px] font-mono ${isDark ? 'border-cyan-500/20 bg-cyan-950/20 text-cyan-300' : 'border-cyan-200 bg-cyan-50 text-cyan-800'}`}>
          <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Connexion sécurisée</span>
          <span className="tracking-wider">OAUTH 2.0</span>
        </div>
        {/* Header */}
          <div className={`flex items-center gap-3 border-b pb-3 ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)] shrink-0">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse"></span>
              <h1 className={`text-base sm:text-lg font-bold font-mono tracking-tight uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
                GMAIL-PRO
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 font-mono line-clamp-1">
              Terminal client sécurisé pour l'API Gmail
            </p>
          </div>
        </div>

        {/* Error / Expiration Notification */}
        {error && (
          <div aria-live="polite" className="rounded-xl bg-amber-950/40 p-3 text-xs font-mono text-amber-300 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold text-amber-200 uppercase tracking-wide">
                  {error.includes('fermée') || error.includes('fermé')
                    ? 'Fenêtre de connexion fermée :'
                    : error.includes('bloquée') || error.includes('bloqué')
                    ? 'Popup bloquée :'
                    : error.includes('ACCES_DENIED') || error.includes('access_denied')
                    ? 'Erreur 403 : Accès refusé (Mode Test)'
                    : error.includes('Domaine non autorisé')
                    ? 'Domaine non autorisé :'
                    : error.includes('expiré') || error.includes('expirée')
                    ? 'Session expirée :'
                    : 'Information de connexion :'}
                </span>
                <p className="mt-0.5 text-slate-200 font-sans text-xs">
                  {error}
                </p>
              </div>
            </div>

            {/* Aide spécifique : Erreur 403 access_denied / Utilisateurs de test */}
            {(error.includes('access_denied') || error.includes('ACCES_DENIED') || error.includes('Utilisateurs de test')) && (
              <div className="mt-3 rounded-lg bg-slate-900/90 border border-amber-500/50 p-3 space-y-2.5 text-xs font-sans">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>Procédure pour débloquer l'accès :</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  L'application Google OAuth est en cours de test. Google exige que les adresses e-mail autorisées soient explicitement déclarées comme testeurs.
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-200 leading-relaxed font-sans">
                  <li>
                    Ouvrez{' '}
                    <a
                      href={gcpConsentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 underline font-semibold inline-flex items-center gap-1"
                    >
                      Écran de consentement OAuth (Projet gemini-507907)
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Allez dans la section <strong>« Utilisateurs de test »</strong> (Test users).</li>
                  <li>Cliquez sur <strong>« + ADD USERS »</strong> (Ajouter des utilisateurs).</li>
                  <li>Ajoutez l'adresse e-mail de votre compte Google (ex: <code className="bg-slate-800 text-cyan-300 px-1 py-0.5 rounded font-mono">maharitse@gmail.com</code>) puis cliquez sur Enregistrer.</li>
                  <li>Revenez sur cette page et cliquez à nouveau sur le bouton ci-dessous.</li>
                </ol>
              </div>
            )}

            {/* Aide spécifique : domaine ou origine non autorisée */}
            {isDomainError && (
              <div className="mt-3 rounded-lg bg-slate-900/90 border border-cyan-500/50 p-3 space-y-2.5">
                <div className="flex items-center gap-2 text-[11px] font-bold text-cyan-300">
                  <Globe className="h-4 w-4 text-cyan-400 shrink-0" />
                  <span>Résolution de l'erreur Erreur 400 : origin_mismatch</span>
                </div>

                <div className="space-y-2 text-[11px] text-slate-300">
                  <p>
                    Dans votre projet Google Cloud où vous avez créé <strong>Client Web 1</strong>, ajoutez l'URL actuelle dans la section <strong>« Origines JavaScript autorisées »</strong> :
                  </p>
                  
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-cyan-400 font-bold">Origine JavaScript à copier :</span>
                    <div className="flex items-center gap-2">
                      <code
                        ref={domainCodeRef}
                        className="flex-1 px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-cyan-300 font-mono text-[11px] break-all select-all cursor-text"
                        title="Cliquez pour sélectionner"
                        onClick={(e) => selectElementText(e.currentTarget)}
                      >
                        {currentOrigin}
                      </code>
                      <button
                        type="button"
                        onClick={copyDomain}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20 transition shrink-0 font-mono text-[10px] cursor-pointer"
                        title="Copier l'origine JavaScript"
                      >
                        {domainCopied ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" /> Copié
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Copier
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {copyBlocked && (
                  <p className="text-[10px] text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    Copie automatique bloquée par le navigateur : l'URL est sélectionnée —
                    faites <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-600 font-mono">Ctrl+C</kbd>
                    (ou <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-600 font-mono">⌘C</kbd>) pour la copier.
                  </p>
                )}

                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-200 leading-relaxed font-sans pt-2 border-t border-slate-800">
                  <li>
                    Ouvrez{' '}
                    <a
                      href={gcpCredentialsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 underline font-semibold inline-flex items-center gap-1"
                    >
                      Identifiants GCP (Projet gemini-507907)
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Cliquez sur <strong>Client Web 1</strong> dans la liste des identifiants OAuth.</li>
                  <li>Dans <strong>« Origines JavaScript autorisées »</strong>, cliquez sur <strong>« + AJOUTER UNE URL »</strong>.</li>
                  <li>Collez <code className="bg-slate-800 text-cyan-300 px-1 py-0.5 rounded font-mono text-[10px]">{currentOrigin}</code> puis cliquez sur <strong>Enregistrer</strong>.</li>
                </ol>
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
            className="group relative flex w-full items-center justify-center gap-3 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-xs font-mono font-bold uppercase tracking-wider text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.15)] transition hover:bg-cyan-500/20 hover:border-cyan-400 hover:text-white hover:shadow-[0_0_25px_rgba(34,211,238,0.25)] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
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

          <button
            id="open-in-new-tab-btn"
            type="button"
            onClick={() => window.open(window.location.href, '_blank')}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 px-4 text-xs font-mono transition cursor-pointer ${
              isDark
                ? 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white'
                : 'border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-300 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <ExternalLink className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span>Ouvrir dans un nouvel onglet</span>
          </button>
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
                  <li>Désactivez temporairement les bloqueurs de fenêtres surgissantes.</li>
                </ul>
              </div>

              {/* Direct Access Token Input */}
              <form onSubmit={handleTokenSubmit} className="space-y-2 rounded-xl bg-slate-900/90 p-3.5 border border-emerald-500/30 text-[11px] font-mono">
                <div className="flex items-center justify-between text-slate-200 font-bold">
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Jeton d'accès Google (Accès Direct) :
                  </span>
                </div>
                
                <p className="text-[10px] text-slate-300 leading-relaxed font-sans">
                  Pour obtenir un jeton en 30 secondes sans configurer Google Cloud :
                </p>

                <ol className="list-decimal list-inside space-y-1 text-[10px] text-slate-300 font-sans bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                  <li>
                    Ouvrez{' '}
                    <a
                      href="https://developers.google.com/oauthplayground"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:underline font-bold inline-flex items-center gap-1"
                    >
                      Google OAuth Playground <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>
                    Déroulez le titre <strong>Gmail API v1</strong> et cochez <strong>uniquement</strong> la case <code className="bg-slate-900 text-emerald-300 px-1 py-0.5 rounded font-mono">https://mail.google.com/</code> (ne tapez pas les mots "Gmail API v1").
                  </li>
                  <li>Cliquez sur <strong>« Authorize APIs »</strong> et choisissez votre compte Google.</li>
                  <li>Cliquez sur <strong>« Exchange authorization code for tokens »</strong>.</li>
                  <li>Copiez la valeur de <strong>Access token</strong> (qui commence par <code className="bg-slate-900 text-emerald-300 px-1 py-0.5 rounded font-mono">ya29...</code>) et collez-la ci-dessous :</li>
                </ol>

                <input
                  type="password"
                  value={accessTokenInput}
                  onChange={(e) => setAccessTokenInput(e.target.value)}
                  placeholder="ya29.a0A..."
                  className="w-full rounded bg-slate-950 border border-slate-700 px-2.5 py-2 text-emerald-300 font-mono text-[11px] outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50"
                />

                {tokenError && (
                  <p className="text-[10px] text-rose-400 font-sans">{tokenError}</p>
                )}

                <div className="flex items-center justify-end pt-0.5">
                  <button
                    type="submit"
                    disabled={isTokenSubmitting || !accessTokenInput.trim()}
                    className="px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/30 hover:text-white font-mono text-[10px] uppercase font-bold cursor-pointer transition disabled:opacity-40"
                  >
                    {isTokenSubmitting ? 'Validation...' : 'Connexion Directe par Jeton'}
                  </button>
                </div>
              </form>

              {/* Custom OAuth Client ID Config */}
              <form onSubmit={handleSaveClientId} className="space-y-2.5 rounded-xl bg-slate-900/90 p-3.5 border border-cyan-500/30 text-[11px] font-mono">
                <div className="flex items-center justify-between text-slate-200 font-bold">
                  <span className="text-cyan-300">ID Client Google OAuth 2.0 :</span>
                  {clientIdSaved && <span className="text-emerald-400 text-[10px]">✓ Enregistré</span>}
                </div>
                
                <p className="text-[10px] text-slate-300 leading-relaxed font-sans">
                  Google ferme la fenêtre après 2 secondes si l'ID Client de l'application ne correspond pas à celui de votre console Google Cloud. Copiez l'ID Client de votre <strong>Client Web 1</strong> (ex: <code className="bg-slate-800 text-cyan-300 px-1 py-0.5 rounded font-mono">211708420086-...</code>) et collez-le ci-dessous :
                </p>

                <input
                  type="text"
                  value={customClientIdInput}
                  onChange={(e) => setCustomClientIdInput(e.target.value)}
                  placeholder="211708420086-xxxxxxxx.apps.googleusercontent.com"
                  className="w-full rounded bg-slate-950 border border-slate-700 px-2.5 py-2 text-cyan-300 font-mono text-[11px] outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/50"
                />

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400 truncate max-w-[180px]" title={customClientIdInput || 'ID par défaut'}>
                    Actif: {customClientIdInput ? `${customClientIdInput.slice(0, 18)}...` : 'Défaut'}
                  </span>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 hover:bg-cyan-500/30 hover:text-white font-mono text-[10px] uppercase font-bold cursor-pointer transition"
                  >
                    Enregistrer l'ID Client
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Crédit créateur */}
      <div className={`relative z-10 mt-5 flex flex-col items-center gap-1 text-center ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
        <p className="text-[11px] font-mono text-slate-500">
          Conçu et développé par{' '}
          <span className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>MAHARITSE Hyacinthe Bertrand</span>
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

      <ThemeToggle />
    </div>
  );
};
