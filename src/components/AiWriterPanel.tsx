import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Wand2,
  Globe,
  Loader2,
  Check,
  CornerUpLeft,
  ChevronDown,
  Languages,
  RotateCcw,
  Send,
  FileText,
  Zap,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  AiLanguage,
  AiTone,
  AiLength,
  DraftEmailResult,
  ImproveAction,
  draftEmailWithAi,
  improveEmailText,
  detectEmailLanguage,
} from '../services/aiAssistant';

export interface AiWriterPanelProps {
  mode?: 'compose' | 'reply';
  recipient?: string;
  emailContext?: {
    subject?: string;
    body?: string;
    sender?: string;
  };
  currentText?: string;
  onApplyDraft: (result: DraftEmailResult) => void;
  onApplyImprovedText: (text: string) => void;
  onClose?: () => void;
}

export const LANGUAGES: { code: AiLanguage; label: string; flag: string }[] = [
  { code: 'Français', label: 'Français', flag: '🇫🇷' },
  { code: 'Malagasy', label: 'Malagasy', flag: '🇲🇬' },
  { code: 'English', label: 'English', flag: '🇬🇧' },
  { code: 'Deutsch', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'Español', label: 'Español', flag: '🇪🇸' },
  { code: 'Italiano', label: 'Italiano', flag: '🇮🇹' },
  { code: 'Português', label: 'Português', flag: '🇵🇹' },
  { code: '中文', label: '中文 (Chinois)', flag: '🇨🇳' },
  { code: '日本語', label: '日本語 (Japonais)', flag: '🇯🇵' },
];

export const TONES: { code: AiTone; label: string; desc: string }[] = [
  { code: 'professionnel', label: 'Professionnel', desc: 'Courtois & adapté au travail' },
  { code: 'amical', label: 'Amical', desc: 'Chaleureux & convivial' },
  { code: 'formel', label: 'Formel', desc: 'Soutenu & protocolaire' },
  { code: 'direct', label: 'Direct', desc: 'Concis & droit au but' },
  { code: 'persuasif', label: 'Persuasif', desc: 'Convaincant & commercial' },
  { code: 'empathique', label: 'Empathique', desc: 'Bienveillant & compréhensif' },
];

export const LENGTHS: { code: AiLength; label: string }[] = [
  { code: 'court', label: '⚡ Court' },
  { code: 'moyen', label: '⚖️ Moyen' },
  { code: 'détaillé', label: '📑 Détaillé' },
];

export const REPLY_QUICK_GOALS: { label: string; prompt: string }[] = [];

export const COMPOSE_QUICK_GOALS = [
  { label: '💼 Email professionnel', prompt: 'Rédiger une communication professionnelle officielle.' },
  { label: '📝 Demande d information', prompt: 'Demander des renseignements clairs et précis.' },
  { label: '📄 Demande de devis', prompt: 'Demander un devis détaillé et les tarifs.' },
  { label: '🤝 Prise de contact', prompt: 'Se présenter et initier un premier contact professionnel.' },
  { label: '⏰ Relance courtoise', prompt: 'Faire une relance polie concernant une demande précédente.' },
];

export const AiWriterPanel: React.FC<AiWriterPanelProps> = ({
  mode = 'compose',
  recipient,
  emailContext,
  currentText = '',
  onApplyDraft,
  onApplyImprovedText,
  onClose,
}) => {
  const { isDark } = useTheme();

  // Selected options
  const [detectedLang, setDetectedLang] = useState<AiLanguage>('Français');
  const [selectedLanguage, setSelectedLanguage] = useState<AiLanguage>('Français');
  const [selectedTone, setSelectedTone] = useState<AiTone>('professionnel');
  const [selectedLength, setSelectedLength] = useState<AiLength>('moyen');
  const [userPrompt, setUserPrompt] = useState('');

  // Auto-detect language if replying or context is provided
  useEffect(() => {
    const textToCheck = emailContext?.body || emailContext?.subject || currentText;
    if (textToCheck) {
      const detected = detectEmailLanguage(emailContext?.body || currentText, emailContext?.subject);
      setDetectedLang(detected);
      setSelectedLanguage(detected);
    }
  }, [emailContext?.body, emailContext?.subject, currentText]);

  // Loading states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPolishing, setIsPolishing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle Quick Goal click
  const handleSelectGoal = (goalPrompt: string) => {
    setUserPrompt(goalPrompt);
  };

  // Generate complete email draft
  const handleGenerate = async () => {
    if (!userPrompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await draftEmailWithAi({
        prompt: userPrompt,
        recipient,
        tone: selectedTone,
        language: selectedLanguage,
        length: selectedLength,
        emailContext,
      });

      onApplyDraft(result);
    } catch (err: any) {
      setError(err.message || 'Erreur de génération par l\'IA');
    } finally {
      setIsGenerating(false);
    }
  };

  // Refine / Polish existing text
  const handlePolishText = async (action: ImproveAction) => {
    if (!currentText.trim()) return;
    setIsPolishing(action);
    setError(null);
    try {
      const improved = await improveEmailText(
        currentText,
        action,
        userPrompt.trim() || undefined,
        selectedLanguage
      );
      onApplyImprovedText(improved);
    } catch (err: any) {
      setError(err.message || 'Erreur d\'amélioration');
    } finally {
      setIsPolishing(null);
    }
  };

  const quickGoals = mode === 'reply' ? REPLY_QUICK_GOALS : COMPOSE_QUICK_GOALS;

  return (
    <div
      className={`rounded-xl border p-2.5 sm:p-3 transition-all shadow-md space-y-2 ${
        isDark
          ? 'bg-[#090D16] border-cyan-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.6)]'
          : 'bg-white border-cyan-200 shadow-sm'
      }`}
    >
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-inherit">
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded-md bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-xs">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-bold tracking-wide">
              <span>Rédacteur IA</span>
            </h3>
            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-400 font-semibold border border-cyan-500/30">
              WriteMail.ai
            </span>
          </div>
        </div>

        {/* Language & Close */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Globe className="h-3 w-3 text-cyan-400 shrink-0" />
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as AiLanguage)}
              className={`h-6 px-1.5 text-[11px] rounded-lg border font-sans font-bold cursor-pointer outline-none transition ${
                isDark
                  ? 'bg-[#0F1626] border-slate-700 text-cyan-300 hover:border-cyan-500'
                  : 'bg-slate-50 border-slate-300 text-cyan-800 hover:border-cyan-600'
              }`}
              title={`Langue de rédaction (détectée : ${detectedLang})`}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.label} {lang.code === detectedLang ? '✓' : ''}
                </option>
              ))}
            </select>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer"
              title="Fermer"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ERROR NOTICE IF ANY */}
      {error && (
        <div className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400 font-mono">
          {error}
        </div>
      )}

      {/* COMPACT OPTIONS ROW: Ton + Format + Modèle rapide */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {/* Ton Selector */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-slate-400">Ton :</span>
          <select
            value={selectedTone}
            onChange={(e) => setSelectedTone(e.target.value as AiTone)}
            className={`h-6 px-1.5 rounded-md text-[11px] font-mono border outline-none cursor-pointer ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
            }`}
          >
            {TONES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Length Selector */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-slate-400">Format :</span>
          <select
            value={selectedLength}
            onChange={(e) => setSelectedLength(e.target.value as AiLength)}
            className={`h-6 px-1.5 rounded-md text-[11px] font-mono border outline-none cursor-pointer ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
            }`}
          >
            {LENGTHS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Goal Selector */}
        {quickGoals.length > 0 && (
          <div className="flex items-center gap-1 flex-1 min-w-[140px]">
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleSelectGoal(e.target.value);
                }
              }}
              className={`h-6 px-1.5 rounded-md text-[11px] font-mono border outline-none cursor-pointer w-full truncate ${
                isDark ? 'bg-slate-900 border-slate-700 text-cyan-300' : 'bg-slate-50 border-slate-300 text-cyan-900'
              }`}
            >
              <option value="" disabled>Modèle rapide...</option>
              {quickGoals.map((g, idx) => (
                <option key={idx} value={g.prompt}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* PROMPT INPUT & GENERATE BUTTON (Compact single block) */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          placeholder={`Consignes (ex: Confirmer la réunion et remercier pour le devis)...`}
          className={`flex-1 h-8 px-2.5 text-xs rounded-lg border outline-none font-sans ${
            isDark
              ? 'bg-[#05080F] border-slate-700 text-white placeholder-slate-500 focus:border-cyan-400'
              : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600'
          }`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleGenerate();
            }
          }}
        />

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !userPrompt.trim()}
          className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition active:scale-[0.98] disabled:opacity-40 cursor-pointer shrink-0 ${
            isDark
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-xs'
              : 'bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 text-white shadow-xs'
          }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="hidden sm:inline">Rédaction...</span>
            </>
          ) : (
            <>
              <Wand2 className="h-3.5 w-3.5" />
              <span>Générer</span>
            </>
          )}
        </button>
      </div>

      {/* REFINEMENT TOOLBAR FOR EXISTING BODY TEXT */}
      {currentText.trim() && (
        <div className="pt-3 border-t border-inherit space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400 flex items-center gap-1">
              <Wand2 className="h-3 w-3 text-cyan-400" />
              <span>Retoucher le texte rédigé actuel :</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => handlePolishText('proofread')}
              disabled={Boolean(isPolishing)}
              className={`px-2.5 py-1 rounded-lg border transition flex items-center gap-1 cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {isPolishing === 'proofread' ? <Loader2 className="h-3 w-3 animate-spin" /> : '✍️'}
              <span>Corriger fautes</span>
            </button>

            <button
              type="button"
              onClick={() => handlePolishText('professional')}
              disabled={Boolean(isPolishing)}
              className={`px-2.5 py-1 rounded-lg border transition flex items-center gap-1 cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {isPolishing === 'professional' ? <Loader2 className="h-3 w-3 animate-spin" /> : '👔'}
              <span>Rendre pro</span>
            </button>

            <button
              type="button"
              onClick={() => handlePolishText('concise')}
              disabled={Boolean(isPolishing)}
              className={`px-2.5 py-1 rounded-lg border transition flex items-center gap-1 cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {isPolishing === 'concise' ? <Loader2 className="h-3 w-3 animate-spin" /> : '⚡'}
              <span>Raccourcir</span>
            </button>

            <button
              type="button"
              onClick={() => handlePolishText('friendly')}
              disabled={Boolean(isPolishing)}
              className={`px-2.5 py-1 rounded-lg border transition flex items-center gap-1 cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {isPolishing === 'friendly' ? <Loader2 className="h-3 w-3 animate-spin" /> : '😊'}
              <span>Chaleureux</span>
            </button>

            <button
              type="button"
              onClick={() => handlePolishText('translate')}
              disabled={Boolean(isPolishing)}
              className={`px-2.5 py-1 rounded-lg border transition flex items-center gap-1 font-bold cursor-pointer ${
                isDark ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/50' : 'bg-cyan-50 border-cyan-300 text-cyan-800 hover:bg-cyan-100'
              }`}
            >
              {isPolishing === 'translate' ? <Loader2 className="h-3 w-3 animate-spin" /> : '🌐'}
              <span>Traduire en {selectedLanguage}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
