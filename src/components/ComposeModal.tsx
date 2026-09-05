import React, { useState, useEffect } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Send,
  Bookmark,
  Trash2,
  Sparkles,
  Wand2,
  Loader2,
  Check,
  ChevronDown,
  FileSignature,
  Settings,
} from 'lucide-react';
import { ComposeOptions } from '../services/gmailApi';
import { useTheme } from '../context/ThemeContext';
import {
  improveEmailText,
  draftEmailWithAi,
  ImproveAction,
} from '../services/aiAssistant';
import { ContactAutocompleteInput } from './ContactAutocompleteInput';
import {
  EmailSignature,
  getSignatures,
  getDefaultSignature,
  formatSignatureText,
} from '../services/signatureService';

interface ComposeModalProps {
  isOpen: boolean;
  currentUserEmail: string;
  initialData?: Partial<ComposeOptions>;
  onClose: () => void;
  onRequestSend: (opts: ComposeOptions) => void;
  onRequestSaveDraft: (opts: ComposeOptions) => Promise<void>;
  onOpenSignatureSettings?: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  currentUserEmail,
  initialData,
  onClose,
  onRequestSend,
  onRequestSaveDraft,
  onOpenSignatureSettings,
}) => {
  const { isDark } = useTheme();
  const [to, setTo] = useState(initialData?.to || '');
  const [cc, setCc] = useState(initialData?.cc || '');
  const [bcc, setBcc] = useState(initialData?.bcc || '');
  const [showCc, setShowCc] = useState(Boolean(initialData?.cc));
  const [showBcc, setShowBcc] = useState(Boolean(initialData?.bcc));
  const [subject, setSubject] = useState(initialData?.subject || '');
  const [body, setBody] = useState(initialData?.body || '');
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signatures state
  const [availableSignatures, setAvailableSignatures] = useState<EmailSignature[]>([]);
  const [showSignatureMenu, setShowSignatureMenu] = useState(false);

  // AI Assistant states
  const [showAiDraftPanel, setShowAiDraftPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState<'professionnel' | 'amical' | 'concis' | 'formel'>('professionnel');
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isImprovingBody, setIsImprovingBody] = useState(false);
  const [showImproveMenu, setShowImproveMenu] = useState(false);

  // Initialize or update fields when modal opens
  useEffect(() => {
    if (isOpen) {
      setTo(initialData?.to || '');
      setCc(initialData?.cc || '');
      setBcc(initialData?.bcc || '');
      setShowCc(Boolean(initialData?.cc));
      setShowBcc(Boolean(initialData?.bcc));
      setSubject(initialData?.subject || '');

      const sigs = getSignatures();
      setAvailableSignatures(sigs);

      const isReply = Boolean(initialData?.inReplyTo);
      const defaultSig = getDefaultSignature(isReply ? 'reply' : 'new');
      const sigFormatted = defaultSig ? formatSignatureText(defaultSig) : '';

      if (!initialData?.body) {
        setBody(sigFormatted ? `\n\n--\n${sigFormatted}` : '');
      } else {
        const initBody = initialData.body;
        if (sigFormatted && !initBody.includes(sigFormatted)) {
          setBody(`${initBody}\n\n--\n${sigFormatted}`);
        } else {
          setBody(initBody);
        }
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSendClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim()) {
      setError('Veuillez spécifier au moins un destinataire dans le champ "À".');
      return;
    }
    setError(null);

    let finalBody = body.trim();
    const isReply = Boolean(initialData?.inReplyTo);
    const defaultSig = getDefaultSignature(isReply ? 'reply' : 'new');
    const sigFormatted = defaultSig ? formatSignatureText(defaultSig) : '';
    if (sigFormatted && !finalBody.includes(sigFormatted)) {
      finalBody = `${finalBody}\n\n--\n${sigFormatted}`;
    }

    const opts: ComposeOptions = {
      fromEmail: currentUserEmail,
      to: to.trim(),
      cc: cc.trim() || undefined,
      bcc: bcc.trim() || undefined,
      subject: subject.trim(),
      body: finalBody,
      threadId: initialData?.threadId,
      inReplyTo: initialData?.inReplyTo,
      references: initialData?.references,
    };

    onRequestSend(opts);
  };

  const handleSaveDraft = async () => {
    if (!to.trim() && !subject.trim() && !body.trim()) {
      onClose();
      return;
    }
    try {
      setIsSavingDraft(true);
      setError(null);
      await onRequestSaveDraft({
        fromEmail: currentUserEmail,
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject: subject.trim(),
        body: body.trim(),
        threadId: initialData?.threadId,
      });
      onClose();
    } catch (err: any) {
      setError(`Échec de sauvegarde du brouillon : ${err.message}`);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleInsertSignature = (sig: EmailSignature) => {
    const formatted = formatSignatureText(sig);
    if (!formatted) return;

    setShowSignatureMenu(false);
    // Append or replace
    setBody((prev) => {
      const cleanPrev = prev.trimEnd();
      return cleanPrev ? `${cleanPrev}\n\n${formatted}` : formatted;
    });
  };

  // AI Draft generator
  const handleAiDraftSubmit = async () => {
    if (!aiPrompt.trim()) return;
    setIsGeneratingDraft(true);
    setError(null);
    try {
      const result = await draftEmailWithAi(aiPrompt, to || undefined, aiTone);
      if (!subject.trim()) {
        setSubject(result.subject);
      }

      // Check default signature
      const defaultSig = getDefaultSignature(initialData?.inReplyTo ? 'reply' : 'new');
      const sigFormatted = defaultSig ? formatSignatureText(defaultSig) : '';

      setBody(sigFormatted ? `${result.body}\n\n${sigFormatted}` : result.body);
      setShowAiDraftPanel(false);
    } catch (err: any) {
      setError(`Erreur lors de la rédaction par l'IA : ${err.message}`);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // AI Improve existing text
  const handleImproveText = async (action: ImproveAction) => {
    if (!body.trim()) return;
    setIsImprovingBody(true);
    setShowImproveMenu(false);
    setError(null);
    try {
      const improved = await improveEmailText(body, action);
      setBody(improved);
    } catch (err: any) {
      setError(`Erreur d'amélioration : ${err.message}`);
    } finally {
      setIsImprovingBody(false);
    }
  };

  return (
    <div
      id="compose-modal-container"
      className={`fixed z-50 transition-all duration-200 ${
        isMaximized
          ? 'inset-0'
          : isMinimized
          ? 'bottom-0 right-4 sm:right-10 w-72 sm:w-80 h-12 shadow-2xl'
          : 'bottom-0 right-2 sm:right-8 w-full max-w-2xl h-[600px] shadow-2xl rounded-t-xl'
      }`}
    >
      <form
        onSubmit={handleSendClick}
        className={`flex h-full flex-col border rounded-t-xl overflow-hidden transition-colors ${
          isDark
            ? 'border-slate-800 bg-[#080B10] shadow-[0_20px_50px_rgba(0,0,0,0.95)]'
            : 'border-slate-300 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.2)]'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex h-11 items-center justify-between border-b px-4 select-none ${
            isDark ? 'border-slate-800 bg-[#06080d]' : 'border-slate-200 bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {initialData?.inReplyTo ? 'Répondre au message' : 'Nouveau message'}
            </span>
            {isSavingDraft && (
              <span className="text-[10px] text-cyan-500 font-mono animate-pulse">
                (Enregistrement...)
              </span>
            )}
          </div>

          <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            <button
              type="button"
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded hover:bg-slate-500/20 transition"
              title={isMinimized ? 'Agrandir' : 'Réduire'}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

            {!isMinimized && (
              <button
                type="button"
                onClick={() => setIsMaximized(!isMaximized)}
                className="p-1 rounded hover:bg-slate-500/20 transition"
                title={isMaximized ? 'Restaurer la taille' : 'Plein écran'}
              >
                {isMaximized ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
            )}

            <button
              id="close-compose-modal-btn"
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-red-500/20 hover:text-red-500 transition"
              title="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Minimized view stops here */}
        {isMinimized && <div className="hidden" />}

        {/* Error Notification */}
        {error && (
          <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2 text-xs text-red-500 font-mono">
            {error}
          </div>
        )}

        {/* AI Generator Banner (Toggleable) */}
        <div
          className={`border-b px-4 py-2 transition-colors ${
            isDark
              ? 'bg-gradient-to-r from-cyan-950/25 via-slate-900/30 to-violet-950/25 border-slate-800'
              : 'bg-gradient-to-r from-blue-50 via-slate-50 to-purple-50 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAiDraftPanel(!showAiDraftPanel)}
              className={`flex items-center gap-2 text-xs font-mono font-semibold transition ${
                isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-blue-700 hover:text-blue-800'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{showAiDraftPanel ? 'Masquer l\'assistant IA' : 'Rédiger tout l\'email avec l\'IA'}</span>
            </button>

            {body.trim() && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowImproveMenu(!showImproveMenu)}
                  disabled={isImprovingBody}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-semibold transition ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs'
                  }`}
                >
                  {isImprovingBody ? (
                    <Loader2 className="h-3 w-3 animate-spin text-cyan-500" />
                  ) : (
                    <Wand2 className="h-3 w-3 text-cyan-500" />
                  )}
                  <span>Améliorer le texte</span>
                  <ChevronDown className="h-3 w-3" />
                </button>

                {showImproveMenu && (
                  <div
                    className={`absolute right-0 top-full mt-1 w-52 rounded-lg border shadow-xl z-20 py-1 font-sans text-xs ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 text-slate-200'
                        : 'bg-white border-slate-200 text-slate-800 shadow-md'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleImproveText('professional')}
                      className={`w-full text-left px-3 py-1.5 transition ${
                        isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                      }`}
                    >
                      Rendre plus professionnel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleImproveText('concise')}
                      className={`w-full text-left px-3 py-1.5 transition ${
                        isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                      }`}
                    >
                      Raccourcir & synthétiser
                    </button>
                    <button
                      type="button"
                      onClick={() => handleImproveText('proofread')}
                      className={`w-full text-left px-3 py-1.5 transition ${
                        isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                      }`}
                    >
                      Corriger orthographe & grammaire
                    </button>
                    <button
                      type="button"
                      onClick={() => handleImproveText('friendly')}
                      className={`w-full text-left px-3 py-1.5 transition ${
                        isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                      }`}
                    >
                      Rendre plus chaleureux
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Drafting Panel Drawer */}
          {showAiDraftPanel && (
            <div className="mt-2.5 pt-2.5 border-t border-inherit space-y-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ex: Demander un devis pour la maintenance des serveurs Cloud en proposant un rendez-vous mardi..."
                className={`w-full px-3 py-2 text-xs rounded-lg border outline-none font-sans ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-400'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600'
                }`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAiDraftSubmit();
                  }
                }}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Ton :</span>
                  {(['professionnel', 'amical', 'concis', 'formel'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAiTone(t)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize transition ${
                        aiTone === t
                          ? isDark
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-blue-600 text-white font-semibold'
                          : isDark
                          ? 'text-slate-400 hover:text-slate-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleAiDraftSubmit}
                  disabled={isGeneratingDraft || !aiPrompt.trim()}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-semibold transition disabled:opacity-50 ${
                    isDark
                      ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isGeneratingDraft ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  <span>Générer l'email</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* To Field with Autocomplete */}
        <div className={`flex items-center border-b px-4 py-1.5 text-sm ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
          <span className={`w-12 text-xs font-mono uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>À</span>
          <ContactAutocompleteInput
            id="compose-to-input"
            value={to}
            onChange={setTo}
            placeholder="destinataire@exemple.com (saisir pour suggestions...)"
            autoFocus
          />
          <div className={`flex items-center gap-2 text-xs font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="hover:text-cyan-500 uppercase px-1 py-0.5 rounded"
              >
                Cc
              </button>
            )}
            {!showBcc && (
              <button
                type="button"
                onClick={() => setShowBcc(true)}
                className="hover:text-cyan-500 uppercase px-1 py-0.5 rounded"
              >
                Cci
              </button>
            )}
          </div>
        </div>

        {/* Cc Field with Autocomplete */}
        {showCc && (
          <div className={`flex items-center border-b px-4 py-1.5 text-sm ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
            <span className={`w-12 text-xs font-mono uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Cc</span>
            <ContactAutocompleteInput
              id="compose-cc-input"
              value={cc}
              onChange={setCc}
              placeholder="cc@exemple.com (suggestions automatiques...)"
            />
          </div>
        )}

        {/* Bcc Field with Autocomplete */}
        {showBcc && (
          <div className={`flex items-center border-b px-4 py-1.5 text-sm ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
            <span className={`w-12 text-xs font-mono uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Cci</span>
            <ContactAutocompleteInput
              id="compose-bcc-input"
              value={bcc}
              onChange={setBcc}
              placeholder="cci@exemple.com (suggestions automatiques...)"
            />
          </div>
        )}

        {/* Subject Field */}
        <div className={`flex items-center border-b px-4 py-1.5 text-sm ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
          <span className={`w-12 text-xs font-mono uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Objet</span>
          <input
            id="compose-subject-input"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Objet du message"
            className={`flex-1 bg-transparent py-1 text-sm outline-hidden font-sans ${
              isDark ? 'text-slate-100 placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'
            }`}
          />
        </div>

        {/* Message Body */}
        <div className="flex-1 p-4 overflow-y-auto">
          <textarea
            id="compose-body-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Rédigez votre message ici..."
            className={`h-full w-full resize-none bg-transparent text-sm leading-relaxed outline-hidden font-sans ${
              isDark ? 'text-slate-200 placeholder:text-slate-600' : 'text-slate-800 placeholder:text-slate-400'
            }`}
          />
        </div>

        {/* Footer / Send Controls */}
        <div
          className={`flex items-center justify-between border-t px-4 py-3 select-none ${
            isDark ? 'border-slate-800 bg-[#06080d]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              id="compose-send-button"
              type="submit"
              className={`flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-mono font-bold uppercase tracking-wider transition active:scale-[0.98] ${
                isDark
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-md'
              }`}
            >
              <Send className="h-4 w-4" />
              <span>Envoyer</span>
            </button>

            {/* Signature Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSignatureMenu(!showSignatureMenu)}
                className={`p-2 rounded-lg transition flex items-center gap-1.5 text-xs font-mono ${
                  isDark
                    ? 'hover:bg-slate-800 text-slate-400 hover:text-cyan-400'
                    : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                }`}
                title="Insérer ou gérer une signature"
              >
                <FileSignature className="h-4 w-4" />
                <span className="hidden sm:inline">Signature</span>
                <ChevronDown className="h-3 w-3" />
              </button>

              {showSignatureMenu && (
                <div
                  className={`absolute left-0 bottom-full mb-1 w-64 rounded-xl border shadow-2xl z-30 py-1.5 text-xs ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-slate-200 shadow-[0_15px_30px_rgba(0,0,0,0.8)]'
                      : 'bg-white border-slate-200 text-slate-800 shadow-xl'
                  }`}
                >
                  <div className="px-3 py-1 text-[10px] font-mono uppercase text-slate-400 border-b border-inherit">
                    Insérer une signature
                  </div>

                  {availableSignatures.map((sig) => (
                    <button
                      key={sig.id}
                      type="button"
                      onClick={() => handleInsertSignature(sig)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between transition ${
                        isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className="truncate font-semibold">{sig.name}</span>
                      {sig.senderName && (
                        <span className="text-[10px] text-slate-400 truncate max-w-28">
                          {sig.senderName}
                        </span>
                      )}
                    </button>
                  ))}

                  {onOpenSignatureSettings && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowSignatureMenu(false);
                        onOpenSignatureSettings();
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 border-t border-inherit text-cyan-400 font-mono text-[11px] transition ${
                        isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100 text-blue-600'
                      }`}
                    >
                      <Settings className="h-3.5 w-3.5" />
                      <span>Gérer les signatures...</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="compose-save-draft-button"
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft}
              className={`p-2 rounded-lg transition ${
                isDark
                  ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                  : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
              }`}
              title="Enregistrer comme brouillon et fermer"
            >
              <Bookmark className="h-4 w-4" />
            </button>

            <button
              id="compose-discard-button"
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition"
              title="Supprimer le brouillon"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
