import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FileSignature,
  Plus,
  Trash2,
  Edit2,
  Check,
  Building,
  User,
  Phone,
  Mail,
  Globe,
  FileText,
  Sparkles,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Minus,
  Code,
  Eye,
  Type,
  Palette,
  Upload,
  Smile,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import {
  EmailSignature,
  getSignatures,
  saveSignature,
  deleteSignature,
  formatSignatureText,
  formatSignatureHtml,
} from '../services/signatureService';
import { useTheme } from '../context/ThemeContext';

interface SignatureSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string;
}

const FONT_FAMILIES = [
  { label: 'Sans Serif (Arial)', value: 'Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia (Serif)', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New (Code)', value: '"Courier New", Courier, monospace' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive, sans-serif' },
];

const FONT_SIZES = [
  { label: 'Très petit (11px)', value: '1' },
  { label: 'Petit (13px)', value: '2' },
  { label: 'Normal (15px)', value: '3' },
  { label: 'Grand (18px)', value: '4' },
  { label: 'Très grand (22px)', value: '5' },
];

const COLOR_SWATCHES = [
  '#000000',
  '#334155',
  '#0284c7',
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#d97706',
  '#dc2626',
  '#db2777',
];

const SPECIAL_SYMBOLS = ['✉', '📞', '🏢', '🌐', '📍', '💼', '🚀', '⭐', '✔', '👉', '✨', '⚡'];

export const SignatureSettingsModal: React.FC<SignatureSettingsModalProps> = ({
  isOpen,
  onClose,
  currentUserEmail = '',
}) => {
  const { isDark } = useTheme();
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editorMode, setEditorMode] = useState<'rich' | 'fields'>('rich');
  const [isHtmlSourceMode, setIsHtmlSourceMode] = useState(false);

  // Image modal helper
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageWidthInput, setImageWidthInput] = useState('140');
  const [imageAltInput, setImageAltInput] = useState('Logo / Signature');

  // Form State
  const [formData, setFormData] = useState<Omit<EmailSignature, 'id' | 'createdAt' | 'updatedAt'>>({
    name: 'Nouvelle signature',
    senderName: '',
    title: '',
    company: '',
    phone: '',
    email: currentUserEmail,
    website: '',
    customText: 'Bien cordialement,',
    htmlContent: '',
    mode: 'rich',
    isDefaultNew: false,
    isDefaultReply: false,
  });

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = () => {
    setSignatures(getSignatures());
  };

  useEffect(() => {
    if (isOpen) {
      loadAll();
      setIsAddingNew(false);
      setEditingId(null);
      setIsHtmlSourceMode(false);
    }
  }, [isOpen]);

  // Sync editor content when formData.htmlContent changes externally
  useEffect(() => {
    if (editorRef.current && !isHtmlSourceMode && (isAddingNew || editingId)) {
      if (editorRef.current.innerHTML !== formData.htmlContent) {
        editorRef.current.innerHTML = formData.htmlContent || '';
      }
    }
  }, [formData.htmlContent, isAddingNew, editingId, isHtmlSourceMode]);

  if (!isOpen) return null;

  const executeEditorCommand = (command: string, value: string = '') => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    setFormData((prev) => ({
      ...prev,
      htmlContent: editorRef.current?.innerHTML || '',
    }));
  };

  const handleEditorInput = () => {
    if (editorRef.current) {
      setFormData((prev) => ({
        ...prev,
        htmlContent: editorRef.current?.innerHTML || '',
      }));
    }
  };

  const insertImageToEditor = (src: string, width: string = '140', alt: string = '') => {
    if (!src) return;
    const imgHtml = `<img src="${src}" alt="${alt}" style="max-width: ${width}px; height: auto; border-radius: 6px; margin: 6px 0; display: inline-block; vertical-align: middle;" />`;
    if (isHtmlSourceMode) {
      setFormData((prev) => ({
        ...prev,
        htmlContent: (prev.htmlContent || '') + '\n' + imgHtml,
      }));
    } else {
      executeEditorCommand('insertHTML', imgHtml);
    }
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        insertImageToEditor(dataUrl, imageWidthInput || '140', file.name);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const insertSymbol = (sym: string) => {
    if (isHtmlSourceMode) {
      setFormData((prev) => ({
        ...prev,
        htmlContent: (prev.htmlContent || '') + sym,
      }));
    } else {
      executeEditorCommand('insertText', sym + ' ');
    }
  };

  const handleStartAdd = () => {
    setEditingId(null);
    const initialHtml = `<div style="font-family: Arial, sans-serif; font-size: 13px; color: #334155; line-height: 1.5; padding-top: 10px; border-top: 2px solid #0284c7; margin-top: 12px;">
  <p style="margin: 0 0 4px 0; font-size: 15px; font-weight: bold; color: #0284c7;">Votre Nom &amp; Prénom</p>
  <p style="margin: 0 0 4px 0; color: #475569; font-size: 12px;">Poste / Titre &bull; <strong>Entreprise</strong></p>
  <p style="margin: 0 0 4px 0; color: #64748b; font-size: 12px;">📞 +33 6 00 00 00 00 | ✉ ${currentUserEmail || 'contact@domaine.fr'}</p>
  <p style="margin: 6px 0 0 0; font-size: 11px; color: #94a3b8; font-style: italic;">Bien cordialement,</p>
</div>`;

    setFormData({
      name: `Signature ${signatures.length + 1}`,
      senderName: '',
      title: '',
      company: '',
      phone: '',
      email: currentUserEmail,
      website: '',
      customText: 'Bien cordialement,\n--',
      htmlContent: initialHtml,
      mode: 'rich',
      isDefaultNew: signatures.length === 0,
      isDefaultReply: signatures.length === 0,
    });
    setEditorMode('rich');
    setIsHtmlSourceMode(false);
    setIsAddingNew(true);
  };

  const handleStartEdit = (sig: EmailSignature) => {
    setIsAddingNew(false);
    setEditingId(sig.id);
    const effectiveHtml = sig.htmlContent || formatSignatureHtml(sig);
    setFormData({
      name: sig.name,
      senderName: sig.senderName || '',
      title: sig.title || '',
      company: sig.company || '',
      phone: sig.phone || '',
      email: sig.email || '',
      website: sig.website || '',
      customText: sig.customText || '',
      htmlContent: effectiveHtml,
      mode: sig.mode || 'rich',
      isDefaultNew: sig.isDefaultNew,
      isDefaultReply: sig.isDefaultReply,
    });
    setEditorMode(sig.mode || 'rich');
    setIsHtmlSourceMode(false);
  };

  const applyTemplate = (templateType: 'modern' | 'clean' | 'badge' | 'minimal') => {
    let tplHtml = '';
    if (templateType === 'modern') {
      tplHtml = `<div style="font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; line-height: 1.5; border-left: 3px solid #0ea5e9; padding-left: 12px; margin-top: 14px;">
  <div style="font-weight: bold; font-size: 15px; color: #0284c7;">MAHARITSE Hyacinthe Bertrand</div>
  <div style="font-size: 12px; color: #475569; margin-top: 4px;">
    📞 +261 38 34 092 61
  </div>
</div>`;
    } else if (templateType === 'clean') {
      tplHtml = `<div style="font-family: Georgia, serif; font-size: 14px; color: #334155; line-height: 1.6; border-top: 1px solid #cbd5e1; padding-top: 10px; margin-top: 12px;">
  <p style="margin: 0 0 4px 0; font-style: italic; color: #64748b;">Bien à vous,</p>
  <p style="margin: 0 0 2px 0; font-weight: bold; color: #0f172a; font-size: 16px;">Jean-Marc DUPONT</p>
  <p style="margin: 0; font-size: 12px; color: #64748b;">Consultant Stratégie &bull; Paris</p>
</div>`;
    } else if (templateType === 'badge') {
      tplHtml = `<div style="font-family: Arial, sans-serif; display: inline-block; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-top: 12px;">
  <table style="border-collapse: collapse;">
    <tr>
      <td style="padding-right: 14px; border-right: 2px solid #3b82f6;">
        <div style="font-size: 15px; font-weight: bold; color: #1e3a8a;">SOCIÉTÉ TECH</div>
        <div style="font-size: 11px; color: #3b82f6; font-weight: 600;">SERVICE SUPPORT</div>
      </td>
      <td style="padding-left: 14px;">
        <div style="font-weight: bold; font-size: 13px; color: #1e293b;">Équipe Support Client</div>
        <div style="font-size: 12px; color: #64748b;">✉ support@domaine.com</div>
        <div style="font-size: 11px; color: #10b981; font-weight: bold; margin-top: 2px;">✔ Support disponible 24/7</div>
      </td>
    </tr>
  </table>
</div>`;
    } else {
      tplHtml = `<div style="font-family: Arial, sans-serif; font-size: 13px; color: #64748b; margin-top: 10px;">
  <p style="margin: 0 0 2px 0;">Cordialement,</p>
  <p style="margin: 0; font-weight: bold; color: #334155;">${currentUserEmail.split('@')[0]}</p>
</div>`;
    }

    setFormData((prev) => ({
      ...prev,
      htmlContent: tplHtml,
    }));
    if (editorRef.current && !isHtmlSourceMode) {
      editorRef.current.innerHTML = tplHtml;
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalHtml = isHtmlSourceMode
      ? formData.htmlContent || ''
      : editorRef.current?.innerHTML || formData.htmlContent || '';

    saveSignature({
      ...formData,
      htmlContent: finalHtml,
      mode: editorMode,
      id: editingId || undefined,
    });
    loadAll();
    setIsAddingNew(false);
    setEditingId(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Supprimer définitivement la signature "${name}" ?`)) {
      deleteSignature(id);
      loadAll();
      if (editingId === id) {
        setEditingId(null);
      }
    }
  };

  const sanitizedPreviewHtml = DOMPurify.sanitize(formData.htmlContent || '', {
    ADD_ATTR: ['target', 'style', 'src', 'alt', 'width', 'height'],
    ADD_TAGS: ['style', 'span', 'p', 'b', 'i', 'u', 's', 'font', 'table', 'tr', 'td', 'img', 'hr', 'a'],
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-xs select-none"
      onClick={onClose}
      id="signature-modal-backdrop"
    >
      <div
        className={`relative flex flex-col rounded-2xl shadow-2xl overflow-hidden w-full max-w-5xl max-h-[92vh] transition-colors ${
          isDark
            ? 'bg-[#0B0F17] border border-slate-800 text-slate-200'
            : 'bg-white border border-slate-200 text-slate-800'
        }`}
        onClick={(e) => e.stopPropagation()}
        id="signature-modal-container"
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isDark ? 'border-slate-800 bg-[#0E131F]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
              <FileSignature className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-wide flex items-center gap-2">
                Éditeur &amp; Gestionnaire de Signatures d'e-mails
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Champ libre complet avec polices personnalisées, couleurs, logos, images et mise en page WYSIWYG
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-lg transition ${
              isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-black'
            }`}
            title="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Left: Signatures list */}
          <div
            className={`w-full md:w-72 border-r flex flex-col shrink-0 ${
              isDark ? 'border-slate-800 bg-[#080B10]' : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            <div className="p-3 border-b border-inherit flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                Vos Signatures ({signatures.length})
              </span>
              <button
                type="button"
                onClick={handleStartAdd}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Créer</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {signatures.map((sig) => {
                const isSelected = editingId === sig.id && !isAddingNew;
                return (
                  <div
                    key={sig.id}
                    className={`p-3 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? isDark
                          ? 'bg-cyan-950/40 border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.15)]'
                          : 'bg-cyan-50 border-cyan-300 shadow-xs'
                        : isDark
                        ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => handleStartEdit(sig)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold truncate text-cyan-400">
                          {sig.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {sig.mode === 'rich' ? '🎨 Signature Libre Formattée' : '📋 Signature Simple'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(sig);
                          }}
                          className="p-1 hover:text-cyan-400 rounded transition"
                          title="Modifier"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {signatures.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(sig.id, sig.name);
                            }}
                            className="p-1 hover:text-red-400 rounded transition"
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {sig.isDefaultNew && (
                        <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                          Nouveaux envois
                        </span>
                      )}
                      {sig.isDefaultReply && (
                        <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          Réponses
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Form & Free-form WYSIWYG Editor */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 select-text">
            {isAddingNew || editingId ? (
              <form onSubmit={handleSave} className="space-y-4">
                {/* Top Action & Mode Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 border-inherit">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      {isAddingNew ? 'Créer une signature personnalisée' : 'Modifier la signature'}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNew(false);
                        setEditingId(null);
                      }}
                      className="px-3 py-1.5 text-xs rounded-lg hover:bg-slate-500/20 transition"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white shadow-md transition active:scale-95"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Enregistrer</span>
                    </button>
                  </div>
                </div>

                {/* Name & Quick Templates */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Nom de la signature
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Signature Pro Direction (avec Logo)"
                      className={`w-full px-3 py-2 text-xs rounded-lg border outline-none font-medium ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                          : 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Modèles prêts à l'emploi
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyTemplate('modern')}
                        className={`flex-1 py-2 text-[10px] font-mono font-semibold rounded-lg border transition ${
                          isDark
                            ? 'bg-slate-900 border-slate-700 hover:border-cyan-500 text-slate-300'
                            : 'bg-slate-100 border-slate-200 hover:border-cyan-600 text-slate-700'
                        }`}
                        title="Modèle Moderne avec barre colorée"
                      >
                        Moderne
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTemplate('clean')}
                        className={`flex-1 py-2 text-[10px] font-mono font-semibold rounded-lg border transition ${
                          isDark
                            ? 'bg-slate-900 border-slate-700 hover:border-cyan-500 text-slate-300'
                            : 'bg-slate-100 border-slate-200 hover:border-cyan-600 text-slate-700'
                        }`}
                        title="Modèle Serif Classique"
                      >
                        Classique
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTemplate('badge')}
                        className={`flex-1 py-2 text-[10px] font-mono font-semibold rounded-lg border transition ${
                          isDark
                            ? 'bg-slate-900 border-slate-700 hover:border-cyan-500 text-slate-300'
                            : 'bg-slate-100 border-slate-200 hover:border-cyan-600 text-slate-700'
                        }`}
                        title="Modèle Badge d'entreprise"
                      >
                        Badge
                      </button>
                    </div>
                  </div>
                </div>

                {/* THE FREE-FORM WYSIWYG BOX WITH TOOLBAR */}
                <div
                  className={`rounded-xl border shadow-xs overflow-hidden ${
                    isDark ? 'bg-slate-900/90 border-slate-700' : 'bg-white border-slate-300'
                  }`}
                >
                  {/* Rich Toolbar */}
                  <div
                    className={`flex flex-wrap items-center gap-1 p-2 border-b text-xs ${
                      isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    {/* Font Family Selector */}
                    <select
                      onChange={(e) => executeEditorCommand('fontName', e.target.value)}
                      className={`h-7 px-2 text-xs rounded border outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                      }`}
                      title="Changer de police"
                    >
                      <option value="">Police...</option>
                      {FONT_FAMILIES.map((f) => (
                        <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                          {f.label}
                        </option>
                      ))}
                    </select>

                    {/* Font Size Selector */}
                    <select
                      onChange={(e) => executeEditorCommand('fontSize', e.target.value)}
                      className={`h-7 px-1.5 text-xs rounded border outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                      }`}
                      title="Taille de texte"
                    >
                      <option value="">Taille...</option>
                      {FONT_SIZES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>

                    <div className="h-4 w-px bg-slate-400/30 mx-1" />

                    {/* Basic Formatting */}
                    <button
                      type="button"
                      onClick={() => executeEditorCommand('bold')}
                      className={`p-1.5 rounded transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                      title="Gras (Ctrl+B)"
                    >
                      <Bold className="h-3.5 w-3.5 font-bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => executeEditorCommand('italic')}
                      className={`p-1.5 rounded transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                      title="Italique (Ctrl+I)"
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => executeEditorCommand('underline')}
                      className={`p-1.5 rounded transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                      title="Souligné (Ctrl+U)"
                    >
                      <Underline className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => executeEditorCommand('strikeThrough')}
                      className={`p-1.5 rounded transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                      title="Barré"
                    >
                      <Strikethrough className="h-3.5 w-3.5" />
                    </button>

                    <div className="h-4 w-px bg-slate-400/30 mx-1" />

                    {/* Text Color Swatches Dropdown */}
                    <div className="flex items-center gap-1" title="Couleur du texte">
                      <Palette className="h-3.5 w-3.5 text-slate-400 mr-0.5" />
                      {COLOR_SWATCHES.slice(0, 6).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => executeEditorCommand('foreColor', c)}
                          className="h-3.5 w-3.5 rounded-full border border-white/20 transition hover:scale-125"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>

                    <div className="h-4 w-px bg-slate-400/30 mx-1" />

                    {/* Alignments */}
                    <button
                      type="button"
                      onClick={() => executeEditorCommand('justifyLeft')}
                      className={`p-1.5 rounded transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                      title="Aligner à gauche"
                    >
                      <AlignLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => executeEditorCommand('justifyCenter')}
                      className={`p-1.5 rounded transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                      title="Centrer"
                    >
                      <AlignCenter className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => executeEditorCommand('justifyRight')}
                      className={`p-1.5 rounded transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                      title="Aligner à droite"
                    >
                      <AlignRight className="h-3.5 w-3.5" />
                    </button>

                    <div className="h-4 w-px bg-slate-400/30 mx-1" />

                    {/* Insert Link */}
                    <button
                      type="button"
                      onClick={() => {
                        const url = prompt('Entrez l\'URL du lien (ex: https://mon-site.com) :');
                        if (url) executeEditorCommand('createLink', url);
                      }}
                      className={`p-1.5 rounded transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                      title="Insérer un lien"
                    >
                      <Link2 className="h-3.5 w-3.5 text-cyan-400" />
                    </button>

                    {/* Insert Image / Logo Button */}
                    <button
                      type="button"
                      onClick={() => setShowImageDialog(true)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 transition border border-cyan-500/30`}
                      title="Insérer une image ou un logo"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-medium">+ Image</span>
                    </button>

                    {/* Insert Divider */}
                    <button
                      type="button"
                      onClick={() => executeEditorCommand('insertHorizontalRule')}
                      className={`p-1.5 rounded transition ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                      title="Insérer une ligne de séparation"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>

                    {/* HTML Source Toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!isHtmlSourceMode && editorRef.current) {
                          setFormData((prev) => ({
                            ...prev,
                            htmlContent: editorRef.current?.innerHTML || '',
                          }));
                        }
                        setIsHtmlSourceMode(!isHtmlSourceMode);
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition ${
                        isHtmlSourceMode
                          ? 'bg-amber-500 text-black font-bold'
                          : isDark
                          ? 'text-slate-400 hover:bg-slate-800'
                          : 'text-slate-600 hover:bg-slate-200'
                      }`}
                      title="Mode Code Source HTML"
                    >
                      <Code className="h-3.5 w-3.5" />
                      <span>{isHtmlSourceMode ? 'Visuel' : '&lt;HTML&gt;'}</span>
                    </button>
                  </div>

                  {/* Quick Symbol Row */}
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 border-b text-[11px] ${
                      isDark ? 'bg-slate-900/60 border-slate-800/80 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      Symboles &amp; Caractères :
                    </span>
                    {SPECIAL_SYMBOLS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => insertSymbol(s)}
                        className={`h-5 w-5 rounded flex items-center justify-center transition hover:scale-125 ${
                          isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-800'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  {/* Free-form Content Editable Canvas OR Raw HTML TextArea */}
                  {isHtmlSourceMode ? (
                    <textarea
                      rows={8}
                      value={formData.htmlContent}
                      onChange={(e) => setFormData({ ...formData, htmlContent: e.target.value })}
                      placeholder="<div style='font-family: Arial...'>Collez ou écrivez votre code HTML personnalisé</div>"
                      className={`w-full p-4 text-xs font-mono outline-none ${
                        isDark ? 'bg-[#080B10] text-cyan-300' : 'bg-slate-50 text-slate-800'
                      }`}
                    />
                  ) : (
                    <div
                      ref={editorRef}
                      contentEditable
                      onInput={handleEditorInput}
                      className={`p-4 min-h-[160px] max-h-[300px] overflow-y-auto outline-none transition ${
                        isDark ? 'bg-[#080B10] text-slate-100' : 'bg-white text-slate-900'
                      }`}
                      style={{ minHeight: '160px' }}
                      tabIndex={0}
                    />
                  )}
                </div>

                {/* Default Usage Toggles */}
                <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-inherit">
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={formData.isDefaultNew}
                      onChange={(e) => setFormData({ ...formData, isDefaultNew: e.target.checked })}
                      className="rounded text-cyan-600 focus:ring-cyan-500 h-4 w-4"
                    />
                    <span>
                      Signature par défaut pour les <strong>nouveaux e-mails</strong>
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={formData.isDefaultReply}
                      onChange={(e) => setFormData({ ...formData, isDefaultReply: e.target.checked })}
                      className="rounded text-cyan-600 focus:ring-cyan-500 h-4 w-4"
                    />
                    <span>
                      Signature par défaut pour les <strong>réponses &amp; transferts</strong>
                    </span>
                  </label>
                </div>

                {/* Live Real-Time Rendering Preview */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono uppercase text-slate-400 font-bold flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-cyan-400" />
                      Rendu visuel exact dans vos e-mails :
                    </span>
                  </div>
                  <div
                    className={`p-4 rounded-xl border font-sans text-xs leading-relaxed overflow-x-auto ${
                      isDark
                        ? 'bg-[#070A0F] border-slate-800 text-slate-300'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    {formData.htmlContent ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: sanitizedPreviewHtml }}
                        className="signature-live-render"
                      />
                    ) : (
                      <span className="italic text-slate-500">(Signature vide)</span>
                    )}
                  </div>
                </div>
              </form>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
                <div className="p-4 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  <FileSignature className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Sélectionnez ou créez une signature</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md">
                    Créez des signatures personnalisées avec mise en page libre, polices spécifiques, couleurs de marque et images / logos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleStartAdd}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white shadow-md transition active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  <span>Créer une signature personnalisée</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* IMAGE / LOGO INSERTION MODAL */}
        {showImageDialog && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setShowImageDialog(false)}
          >
            <div
              className={`rounded-2xl p-5 w-full max-w-md shadow-2xl border ${
                isDark ? 'bg-[#0E131F] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-inherit">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-cyan-400" />
                  Insérer une image ou un logo
                </h4>
                <button
                  type="button"
                  onClick={() => setShowImageDialog(false)}
                  className="p-1 hover:bg-slate-500/20 rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {/* File Upload option */}
                <div>
                  <label className="block font-mono text-slate-400 mb-1.5">
                    Option A : Téléverser une image depuis votre appareil
                  </label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={(e) => {
                      handleImageFileUpload(e);
                      setShowImageDialog(false);
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex w-full items-center justify-center gap-2 py-3 px-4 rounded-xl border border-dashed transition ${
                      isDark
                        ? 'border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-300'
                        : 'border-cyan-400 bg-cyan-50 hover:bg-cyan-100 text-cyan-800'
                    }`}
                  >
                    <Upload className="h-4 w-4" />
                    <span className="font-semibold">Choisir une image (PNG, JPG, Logo)</span>
                  </button>
                </div>

                <div className="text-center font-mono text-slate-400 text-[10px] uppercase">
                  — OU —
                </div>

                {/* URL option */}
                <div>
                  <label className="block font-mono text-slate-400 mb-1">
                    Option B : URL d'une image web
                  </label>
                  <input
                    type="url"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://mon-entreprise.com/logo.png"
                    className={`w-full px-3 py-2 rounded-lg border outline-none ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300'
                    }`}
                  />
                </div>

                {/* Width control */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-mono text-slate-400 mb-1">
                      Largeur max (pixels)
                    </label>
                    <input
                      type="number"
                      value={imageWidthInput}
                      onChange={(e) => setImageWidthInput(e.target.value)}
                      placeholder="140"
                      className={`w-full px-3 py-2 rounded-lg border outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-slate-400 mb-1">
                      Texte alternatif (Alt)
                    </label>
                    <input
                      type="text"
                      value={imageAltInput}
                      onChange={(e) => setImageAltInput(e.target.value)}
                      placeholder="Logo"
                      className={`w-full px-3 py-2 rounded-lg border outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-inherit">
                  <button
                    type="button"
                    onClick={() => setShowImageDialog(false)}
                    className="px-3 py-1.5 rounded-lg hover:bg-slate-500/20"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={!imageUrlInput.trim()}
                    onClick={() => {
                      insertImageToEditor(imageUrlInput.trim(), imageWidthInput || '140', imageAltInput);
                      setShowImageDialog(false);
                      setImageUrlInput('');
                    }}
                    className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-50"
                  >
                    Insérer par URL
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
