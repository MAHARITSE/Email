import React, { useRef, useState, useEffect } from 'react';
import {
  Mail,
  ShieldCheck,
  Inbox,
  Search,
  Sparkles,
  ExternalLink,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Globe,
  FileText,
  Lock,
  X,
  Layers,
  Paperclip,
  Calendar,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { copyToClipboard, selectElementText } from '../utils/clipboard';
import { getStoredClientId, saveCustomClientId } from '../services/googleAuth';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';

interface SignInPromptProps {
  onSignIn: () => void;
  isLoading: boolean;
  error?: string | null;
}

export const SignInPrompt: React.FC<SignInPromptProps> = ({ onSignIn, isLoading, error }) => {
  const { isDark } = useTheme();
  const [clientId, setClientId] = useState(getStoredClientId);
  const [configStatus, setConfigStatus] = useState('');
  const [showHelpDetails, setShowHelpDetails] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [domainCopied, setDomainCopied] = useState(false);
  const [copyBlocked, setCopyBlocked] = useState(false);
  const domainCodeRef = useRef<HTMLElement | null>(null);

  // Check URL query or pathname on mount (support direct ?privacy=true or /privacy)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const params = new URLSearchParams(window.location.search);
      if (path.includes('privacy') || params.get('view') === 'privacy') {
        setShowPrivacyModal(true);
      } else if (path.includes('terms') || params.get('view') === 'terms') {
        setShowTermsModal(true);
      }
    }
  }, []);

  const isDomainError =
    !!error &&
    (error.startsWith('Domaine non autorisé') ||
      error.includes('origin_mismatch') ||
      error.includes('Origine JavaScript'));
  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const firebaseSettingsUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;
  const gcpCredentialsUrl = `https://console.cloud.google.com/apis/credentials?project=${firebaseConfig.projectId}`;

  const copyDomain = async () => {
    setCopyBlocked(false);
    const targetText =
      error?.includes('origin_mismatch') || error?.includes('Origine') ? currentOrigin : currentDomain;
    const ok = await copyToClipboard(targetText);
    if (ok) {
      setDomainCopied(true);
      setTimeout(() => setDomainCopied(false), 2000);
    } else {
      selectElementText(domainCodeRef.current);
      setCopyBlocked(true);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div
      id="signin-prompt-container"
      className={`relative min-h-dvh w-full overflow-y-auto ${
        isDark ? 'bg-[#05070A] text-slate-200' : 'bg-slate-50 text-slate-800'
      }`}
    >
      {/* Ambient background glow */}
      <div className="absolute top-10 left-1/4 w-96 h-96 bg-cyan-500/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute top-96 right-10 w-80 h-80 bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* TOP NAVIGATION BAR */}
      <header
        className={`sticky top-0 z-40 w-full border-b backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between transition-colors ${
          isDark ? 'bg-[#080B10]/90 border-slate-800' : 'bg-white/90 border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded-md rotate-45 flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.35)] shrink-0">
            <div
              className={`w-4 h-4 rounded-xs flex items-center justify-center -rotate-45 ${
                isDark ? 'bg-[#05070A]' : 'bg-white'
              }`}
            >
              <Mail className="h-2.5 w-2.5 text-cyan-500" />
            </div>
          </div>
          <div>
            <span className="font-bold text-sm sm:text-base font-mono tracking-wider uppercase">
              Maharitse<span className="text-cyan-500"> Mail</span>
            </span>
            <span className="hidden md:inline-block ml-2 text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Client Web &amp; Messagerie
            </span>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-6 text-xs font-mono">
          <button
            type="button"
            onClick={() => scrollToSection('section-purpose')}
            className="hover:text-cyan-400 transition cursor-pointer"
          >
            Objectif
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('section-features')}
            className="hover:text-cyan-400 transition cursor-pointer"
          >
            Fonctionnalités
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('section-security')}
            className="hover:text-cyan-400 transition cursor-pointer"
          >
            Sécurité &amp; Données
          </button>
          <button
            type="button"
            onClick={() => setShowPrivacyModal(true)}
            className="hover:text-cyan-400 transition cursor-pointer text-cyan-400 font-semibold"
          >
            Confidentialité
          </button>
          <button
            type="button"
            onClick={() => setShowTermsModal(true)}
            className="hover:text-cyan-400 transition cursor-pointer"
          >
            Conditions
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSignIn}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs font-mono transition cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>{isLoading ? 'Connexion...' : 'Connexion Google'}</span>
          </button>
        </div>
      </header>

      {/* HERO & SIGN-IN SECTION */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-10 sm:py-16 space-y-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Column: Application Description & Purpose */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono border border-cyan-500/30 bg-cyan-950/20 text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>Application Web Personnelle Développée par MAHARITSE Hyacinthe Bertrand</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight font-mono leading-tight">
              Gérez votre messagerie avec clarté, rapidité et{' '}
              <span className="text-cyan-400 underline decoration-cyan-500/40">sécurité</span>.
            </h1>

            <p className="text-sm sm:text-base leading-relaxed text-slate-400 max-w-xl">
              <strong>Maharitse Mail</strong> est un client web de messagerie complet permettant aux utilisateurs autorisés de consulter leurs courriels Gmail, d'extraire rapidement les pièces jointes, de rédiger des réponses soignées et d'organiser leurs tâches en toute conformité avec les normes de sécurité Google OAuth 2.0.
            </p>

            <div className="flex flex-wrap items-center gap-3 text-xs font-mono pt-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/40 text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>Authentification Google OAuth 2.0</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/40 text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>Aucune revente de données</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/40 text-slate-300">
                <Lock className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>Chiffrement TLS 1.3</span>
              </div>
            </div>
          </div>

          {/* Right Column: Google OAuth Login Card */}
          <div className="lg:col-span-5">
            <div
              className={`rounded-2xl border p-6 shadow-2xl backdrop-blur-xl space-y-4 ${
                isDark
                  ? 'border-slate-800 bg-[#080B10]/95 shadow-[0_0_50px_rgba(0,0,0,0.85)]'
                  : 'border-slate-200 bg-white/95 shadow-xl'
              }`}
            >
              <div className="flex items-center justify-between border-b pb-3 border-inherit">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="font-bold text-xs font-mono uppercase tracking-wider">
                    Espace d'authentification
                  </span>
                </div>
                <span className="text-[10px] font-mono text-cyan-400">OAuth 2.0</span>
              </div>

              {/* Error Alert Box */}
              {error && (
                <div
                  aria-live="polite"
                  className="rounded-xl bg-amber-950/40 p-3 text-xs font-mono text-amber-300 border border-amber-500/40"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="font-semibold text-amber-200 uppercase tracking-wide">
                        {error.includes('invalid_client')
                          ? 'Client OAuth introuvable :'
                          : error.includes('ACCES_DENIED') || error.includes('access_denied')
                          ? 'Accès réservé (Mode Test) :'
                          : 'Information de connexion :'}
                      </span>
                      <p className="mt-0.5 text-slate-200 font-sans text-xs">{error}</p>
                    </div>
                  </div>

                  {/* Test Users Guidance */}
                  {(error.includes('access_denied') ||
                    error.includes('ACCES_DENIED') ||
                    error.includes('Utilisateurs de test')) && (
                    <div className="mt-2.5 p-2.5 rounded bg-slate-900/90 border border-amber-500/40 text-[11px] font-sans space-y-1">
                      <p className="text-amber-200 font-semibold">Conseil Mode Test :</p>
                      <p className="text-slate-300">
                        Ajoutez votre adresse e-mail dans Google Cloud Console &rarr; Écran de consentement &rarr; Utilisateurs de test.
                      </p>
                    </div>
                  )}

                  {/* Domain Mismatch Guidance */}
                  {isDomainError && (
                    <div className="mt-2.5 p-2.5 rounded bg-slate-900/90 border border-slate-700 text-[11px] font-mono space-y-1">
                      <p className="text-cyan-300">Origine à autoriser sur Google Cloud :</p>
                      <code
                        ref={domainCodeRef}
                        className="block p-1 bg-slate-800 text-cyan-300 rounded text-[10px] break-all select-all"
                      >
                        {currentOrigin || currentDomain}
                      </code>
                      <button
                        type="button"
                        onClick={copyDomain}
                        className="mt-1 px-2 py-0.5 rounded border border-cyan-500/40 text-cyan-300 text-[10px]"
                      >
                        {domainCopied ? 'Copié !' : 'Copier l\'origine'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Main Sign In Button */}
              <div className="space-y-3 pt-2">
                <button
                  id="google-signin-btn"
                  type="button"
                  onClick={onSignIn}
                  disabled={isLoading}
                  className="group relative flex w-full items-center justify-center gap-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-3.5 text-xs font-mono font-bold uppercase tracking-wider text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.15)] transition hover:bg-cyan-500/20 hover:border-cyan-400 hover:text-white hover:shadow-[0_0_25px_rgba(34,211,238,0.25)] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  <div className="h-4 w-4 shrink-0">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-full w-full">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      <path fill="none" d="M0 0h48v48H0z" />
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

                <p className="text-[11px] text-center text-slate-500 font-mono">
                  Authentification chiffrée directe auprès des serveurs Google
                </p>
              </div>

              {/* Custom OAuth Client ID Dropdown for advanced users */}
              <details className="rounded-lg border border-slate-800 p-2.5 text-xs font-mono">
                <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-cyan-400 transition">
                  Identifiant Client OAuth personnalisé (optionnel)
                </summary>
                <div className="mt-2.5 space-y-2 text-[11px]">
                  <input
                    id="oauth-client-id"
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setConfigStatus('');
                    }}
                    placeholder="123456789-…apps.googleusercontent.com"
                    className="w-full rounded border border-slate-700 bg-slate-900/60 p-2 text-xs font-mono text-cyan-300 outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const val = clientId.trim();
                        saveCustomClientId(val);
                        setConfigStatus('ID enregistré.');
                      }}
                      className="px-2 py-1 rounded bg-slate-800 text-cyan-400 hover:bg-slate-700"
                    >
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        saveCustomClientId('');
                        setClientId(getStoredClientId());
                        setConfigStatus('Réinitialisé.');
                      }}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-400 hover:bg-slate-700"
                    >
                      Défaut
                    </button>
                  </div>
                  {configStatus && <p className="text-cyan-400 text-[10px]">{configStatus}</p>}
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* SECTION 1: OBJECTIF DE L'APPLICATION (Required by Google Trust & Safety) */}
        <section
          id="section-purpose"
          className={`p-6 sm:p-8 rounded-2xl border space-y-4 ${
            isDark ? 'bg-[#080B10]/70 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-2 text-cyan-400">
            <Inbox className="h-5 w-5" />
            <h2 className="text-base sm:text-lg font-bold font-mono uppercase tracking-wide">
              Objectif &amp; Utilisation de l'application
            </h2>
          </div>

          <p className="text-sm leading-relaxed text-slate-300">
            <strong>Maharitse Mail</strong> a pour objectif principal d'offrir une interface web rapide, moderne et ergonomique pour la gestion de courriels professionnels et personnels. L'application est destinée à permettre aux utilisateurs autorisés :
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30 space-y-2">
              <h3 className="font-bold text-sm text-cyan-300 font-mono">1. Consultation &amp; Organisation</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Affichage fluide de la boîte de réception, des fils de discussion ordonnés, des dossiers officiels (Important, Envoyés, Brouillons, Corbeille) et recherche plein texte instantanée par expéditeur, objet ou date.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30 space-y-2">
              <h3 className="font-bold text-sm text-cyan-300 font-mono">2. Extraction de pièces jointes</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Visualisation directe des documents PDF, feuilles de calcul Excel et images dans le navigateur sans téléchargement superflu, avec possibilité de téléchargement groupé sous forme d'archive ZIP sécurisée.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30 space-y-2">
              <h3 className="font-bold text-sm text-cyan-300 font-mono">3. Rédaction &amp; Réponses rapides</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Éditeur de texte riche, signatures automatiques personnalisées et suggestions de réponses intelligentes pour accélérer le traitement des courriels professionnels.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30 space-y-2">
              <h3 className="font-bold text-sm text-cyan-300 font-mono">4. Planification &amp; Agenda</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Transformation de courriels importants en tâches d'agenda avec rappels programmés et synchronisation d'événements.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 2: TRANSPARENCE & GOOGLE API USER DATA POLICY (Limited Use Disclosure) */}
        <section
          id="section-security"
          className={`p-6 sm:p-8 rounded-2xl border space-y-5 ${
            isDark ? 'bg-cyan-950/10 border-cyan-500/30' : 'bg-cyan-50/50 border-cyan-200'
          }`}
        >
          <div className="flex items-center gap-2 text-cyan-400">
            <ShieldCheck className="h-5 w-5" />
            <h2 className="text-base sm:text-lg font-bold font-mono uppercase tracking-wide">
              Transparence &amp; Respect des Règles relatives aux données utilisateur de Google
            </h2>
          </div>

          <div className="p-4 rounded-xl border border-cyan-500/40 bg-cyan-950/30 text-xs sm:text-sm leading-relaxed text-cyan-200 font-sans">
            <strong>Déclaration de conformité :</strong> L'utilisation et le transfert par <strong>Maharitse Mail</strong> à toute autre application des informations reçues des API Google respectent scrupuleusement les{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-bold text-white hover:text-cyan-300"
            >
              Règles relatives aux données utilisateur des services d'API Google
            </a>, y compris les exigences relatives à l'utilisation limitée (<em>Limited Use Requirements</em>).
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1.5">
              <span className="font-bold font-mono text-cyan-300">Aucune revente</span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Vos courriels et données personnelles ne sont jamais vendus, loués ou transmis à des tiers.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1.5">
              <span className="font-bold font-mono text-cyan-300">Zéro publicité</span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Vos messages ne font l'objet d'aucun profilage publicitaire ni d'aucun ciblage marketing.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1.5">
              <span className="font-bold font-mono text-cyan-300">Pas d'IA généraliste</span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Vos courriels ne sont jamais utilisés pour entraîner des modèles de fondation d'IA.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1.5">
              <span className="font-bold font-mono text-cyan-300">Révocation totale</span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Vous pouvez révoquer l'accès en 1 clic dans les paramètres de votre compte Google.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 3: LEGAL LINKS & PUBLISHER CONTACT */}
        <section
          id="section-legal"
          className={`p-6 rounded-2xl border text-center space-y-4 ${
            isDark ? 'bg-[#080B10]/50 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-mono">
            <button
              type="button"
              onClick={() => setShowPrivacyModal(true)}
              className="text-cyan-400 hover:underline cursor-pointer font-bold inline-flex items-center gap-1.5"
            >
              <FileText className="h-4 w-4" />
              <span>Consulter les Règles de confidentialité</span>
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className="text-cyan-400 hover:underline cursor-pointer font-bold inline-flex items-center gap-1.5"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Consulter les Conditions d'utilisation</span>
            </button>
            <span>•</span>
            <a
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-cyan-300 underline inline-flex items-center gap-1"
            >
              <span>Page HTML autonome (/privacy.html)</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="text-xs pt-2 font-mono text-slate-500 border-t border-inherit">
            <p>
              Éditeur responsable : <strong>MAHARITSE Hyacinthe Bertrand</strong> • Courriel :{' '}
              <a href="mailto:maharitse@gmail.com" className="text-cyan-400 underline">
                maharitse@gmail.com
              </a>{' '}
              • Tél : +261 38 34 092 61
            </p>
            <p className="text-[10px] mt-1 text-slate-600">
              Hébergement : Cloudflare Workers • Domaine : email.maharitse.workers.dev
            </p>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className={`border-t py-6 px-4 text-center text-xs font-mono text-slate-500 ${
        isDark ? 'border-slate-800 bg-[#040609]' : 'border-slate-200 bg-slate-100'
      }`}>
        <p>&copy; 2026 MAHARITSE Hyacinthe Bertrand. Tous droits réservés.</p>
      </footer>

      {/* PRIVACY POLICY MODAL (Compliant with Google API Services User Data Policy) */}
      {showPrivacyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowPrivacyModal(false)}
        >
          <div
            className={`relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl space-y-4 ${
              isDark ? 'bg-[#080B10] border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3 border-inherit">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-cyan-400" />
                <h2 className="text-base font-bold font-mono">Règles de confidentialité — Maharitse Mail</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed font-sans">
              <p className="text-slate-400 font-mono text-[11px]">Dernière mise à jour : 29 septembre 2026</p>

              <h3 className="font-bold text-cyan-400 text-sm font-mono pt-1">1. Présentation de l'application</h3>
              <p>
                L'application <strong>Maharitse Mail</strong> (accessible à l'adresse <code>https://email.maharitse.workers.dev</code>) est éditée par <strong>MAHARITSE Hyacinthe Bertrand</strong>. Elle fournit une interface web sécurisée permettant aux utilisateurs autorisés de consulter et gérer leur boîte de réception Gmail.
              </p>

              <h3 className="font-bold text-cyan-400 text-sm font-mono pt-1">2. Données collectées et utilisation</h3>
              <p>
                Lorsque vous vous connectez avec votre compte Google via OAuth 2.0, l'application demande l'accès aux portées suivantes :
              </p>
              <ul className="list-disc list-inside space-y-1 pl-2 text-slate-300">
                <li><strong>Profil de base et adresse e-mail (userinfo.email, userinfo.profile)</strong> : pour identifier votre compte et afficher votre boîte aux lettres.</li>
                <li><strong>Lecture des messages et métadonnées (gmail.readonly)</strong> : pour afficher vos e-mails, fils de discussion et pièces jointes dans l'interface.</li>
                <li><strong>Envoi de messages (gmail.send)</strong> : exclusivement pour expédier les réponses ou messages que vous rédigez et validez vous-même.</li>
              </ul>

              <h3 className="font-bold text-cyan-400 text-sm font-mono pt-1">3. Respect des règles relatives aux données utilisateur de Google</h3>
              <p className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-950/20 text-cyan-200">
                L'utilisation et le transfert par Maharitse Mail des informations reçues des API Google vers toute autre application sont strictement conformes aux{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold text-cyan-300 hover:text-white"
                >
                  Règles relatives aux données utilisateur des services d'API Google
                </a>, y compris les exigences relatives à l'utilisation limitée (Limited Use requirements).
              </p>
              <ul className="list-disc list-inside space-y-1 pl-2 text-slate-300">
                <li><strong>Aucune vente de données</strong> : vos données ne sont jamais vendues, louées ou commercialisées.</li>
                <li><strong>Aucun partage avec des tiers</strong> : vos courriels ne sont partagés avec aucun service tiers publicitaire ou commercial.</li>
                <li><strong>Pas d'entraînement d'IA généraliste</strong> : vos messages ne sont jamais utilisés pour entraîner des modèles d'intelligence artificielle généralistes.</li>
              </ul>

              <h3 className="font-bold text-cyan-400 text-sm font-mono pt-1">4. Stockage et sécurité</h3>
              <p>
                Toutes les communications s'effectuent par canaux chiffrés <strong>HTTPS / TLS</strong> directement entre votre navigateur et les serveurs sécurisés de Google. Les jetons d'accès OAuth sont conservés uniquement dans votre session locale protégée de navigateur.
              </p>

              <h3 className="font-bold text-cyan-400 text-sm font-mono pt-1">5. Révocation de l'accès</h3>
              <p>
                Vous pouvez révoquer l'accès de l'application à tout moment directement depuis les paramètres de sécurité de votre compte Google :{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 underline inline-flex items-center gap-1"
                >
                  Gérer les autorisations de compte Google
                  <ExternalLink className="h-3 w-3" />
                </a>.
              </p>

              <h3 className="font-bold text-cyan-400 text-sm font-mono pt-1">6. Contact</h3>
              <p>
                Pour toute question relative à la confidentialité de vos données :<br />
                <strong>MAHARITSE Hyacinthe Bertrand</strong><br />
                Courriel : <a href="mailto:maharitse@gmail.com" className="text-cyan-400 underline">maharitse@gmail.com</a><br />
                Téléphone : +261 38 34 092 61
              </p>
            </div>

            <div className="pt-3 border-t border-inherit flex justify-end">
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TERMS OF SERVICE MODAL */}
      {showTermsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowTermsModal(false)}
        >
          <div
            className={`relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl space-y-4 ${
              isDark ? 'bg-[#080B10] border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3 border-inherit">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-cyan-400" />
                <h2 className="text-base font-bold font-mono">Conditions d'utilisation — Maharitse Mail</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed font-sans">
              <p>
                En utilisant le service <strong>Maharitse Mail</strong>, vous acceptez de vous conformer aux présentes conditions d'utilisation ainsi qu'aux conditions d'utilisation des services Google.
              </p>
              <h3 className="font-bold text-cyan-400 font-mono">Utilisation autorisée</h3>
              <p>
                Ce service est destiné à la gestion personnelle ou professionnelle de votre messagerie électronique en conformité avec les lois applicables. Tout usage abusif, tentative de spam ou violation des quotas de service est strictement interdit.
              </p>
              <h3 className="font-bold text-cyan-400 font-mono">Disponibilité du service</h3>
              <p>
                L'application est fournie « en l'état », sans garantie expresse d'interruption zéro, dépendante de la disponibilité des API Google et de l'infrastructure d'hébergement.
              </p>
            </div>

            <div className="pt-3 border-t border-inherit flex justify-end">
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <ThemeToggle />
    </div>
  );
};
