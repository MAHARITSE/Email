import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Highlighter,
  RemoveFormatting,
  ChevronDown,
  Check,
  Type,
  Sparkles,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export interface RichTextEmailEditorProps {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  autoFocus?: boolean;
  onToggleAi?: () => void;
  isAiActive?: boolean;
  aiButtonLabel?: string;
}

// Curated Vibrant & Professional Palette for Text Colors
export const TEXT_COLORS = [
  { name: 'Noir profond', color: '#111827' },
  { name: 'Gris ardoise', color: '#64748b' },
  { name: 'Rouge écarlate', color: '#ef4444' },
  { name: 'Orange vif', color: '#f97316' },
  { name: 'Ambre solaire', color: '#d97706' },
  { name: 'Vert émeraude', color: '#16a34a' },
  { name: 'Cyan océan', color: '#06b6d4' },
  { name: 'Bleu royal', color: '#2563eb' },
  { name: 'Indigo profond', color: '#4f46e5' },
  { name: 'Violet impérial', color: '#9333ea' },
  { name: 'Rose fuchsia', color: '#ec4899' },
  { name: 'Blanc pur', color: '#ffffff' },
];

// Curated Background Highlight Colors (Surlignage)
export const HIGHLIGHT_COLORS = [
  { name: 'Aucun', color: 'transparent' },
  { name: 'Jaune surligneur', color: '#fef08a' },
  { name: 'Vert menthe', color: '#bbf7d0' },
  { name: 'Bleu ciel', color: '#bfdbfe' },
  { name: 'Rose tendre', color: '#fbcfe8' },
  { name: 'Pêche', color: '#fed7aa' },
  { name: 'Lavande', color: '#e9d5ff' },
  { name: 'Gris neutre', color: '#e2e8f0' },
];

// Quick shortcut color dots displayed directly on the toolbar
export const QUICK_COLOR_DOTS = [
  { label: 'Défaut', color: 'default' },
  { label: 'Rouge', color: '#ef4444' },
  { label: 'Bleu', color: '#2563eb' },
  { label: 'Vert', color: '#16a34a' },
  { label: 'Violet', color: '#9333ea' },
  { label: 'Orange', color: '#f97316' },
];

export const RichTextEmailEditor: React.FC<RichTextEmailEditorProps> = ({
  id = 'rich-email-editor',
  value,
  onChange,
  placeholder = 'Rédigez votre message...',
  minHeight = '180px',
  className = '',
  autoFocus = false,
  onToggleAi,
  isAiActive = false,
  aiButtonLabel = 'Aide-moi à écrire',
}) => {
  const { isDark } = useTheme();
  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef<string>(value);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Active styles state for visual feedback in toolbar
  const [activeTextColor, setActiveTextColor] = useState<string>('#2563eb');
  const [activeHighlightColor, setActiveHighlightColor] = useState<string>('transparent');
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [activeColorTab, setActiveColorTab] = useState<'text' | 'highlight'>('text');
  const [customColorInput, setCustomColorInput] = useState<string>('#2563eb');

  // Format states
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);

  // Close color picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setIsColorPickerOpen(false);
      }
    };
    if (isColorPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColorPickerOpen]);

  // Convert plain text to HTML paragraphs if incoming value has no HTML tags
  const normalizeContentToHtml = useCallback((raw: string): string => {
    if (!raw) return '';
    // If it already looks like HTML (has tags)
    if (/<[a-z][\s\S]*>/i.test(raw)) {
      return raw;
    }
    // Convert newlines to breaks or paragraphs
    return raw
      .split('\n\n')
      .map((para) => `<p>${para.replace(/\n/g, '<br />')}</p>`)
      .join('');
  }, []);

  // Synchronize incoming external value without losing cursor position
  useEffect(() => {
    if (!editorRef.current) return;
    const currentEditorHtml = editorRef.current.innerHTML;

    // Only update DOM if the external value differs from what we tracked
    if (value !== lastHtmlRef.current || (value && !currentEditorHtml)) {
      const normalized = normalizeContentToHtml(value);
      if (currentEditorHtml !== normalized) {
        editorRef.current.innerHTML = normalized;
        lastHtmlRef.current = value;
      }
    }
  }, [value, normalizeContentToHtml]);

  // Handle internal typing and notify parent
  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    // Check if effectively empty
    const textOnly = editorRef.current.innerText.trim();
    const cleanHtml = !textOnly && !html.includes('<img') ? '' : html;
    lastHtmlRef.current = cleanHtml;
    onChange(cleanHtml);
    checkFormatStates();
  };

  // Inspect selection format states (bold, italic, colors, etc.)
  const checkFormatStates = () => {
    try {
      setIsBold(document.queryCommandState('bold'));
      setIsItalic(document.queryCommandState('italic'));
      setIsUnderline(document.queryCommandState('underline'));
      setIsStrikethrough(document.queryCommandState('strikeThrough'));
    } catch {
      // Ignore if queryCommandState is unavailable
    }
  };

  // Apply command with prevention of blur
  const execCmd = (cmd: string, val: string = '') => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd, false, val);
    handleInput();
  };

  // Set Text Color & allow typing immediately in that color
  const applyTextColor = (color: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    setActiveTextColor(color);

    if (color === 'default') {
      // Revert to theme default
      document.execCommand('removeFormat', false);
    } else {
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand('foreColor', false, color);
    }
    handleInput();
  };

  // Set Background Highlight Color (Surlignage)
  const applyHighlightColor = (color: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    setActiveHighlightColor(color);

    document.execCommand('styleWithCSS', false, 'true');
    if (color === 'transparent') {
      try {
        document.execCommand('removeFormat', false);
      } catch {
        // fallback
      }
    } else {
      try {
        if (!document.execCommand('hiliteColor', false, color)) {
          document.execCommand('backColor', false, color);
        }
      } catch {
        document.execCommand('backColor', false, color);
      }
    }
    handleInput();
  };

  // Clean all formatting
  const handleRemoveFormat = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('removeFormat', false);
    setActiveTextColor(isDark ? '#f8fafc' : '#111827');
    setActiveHighlightColor('transparent');
    handleInput();
  };

  return (
    <div
      className={`flex flex-col border rounded-xl overflow-hidden transition-all ${
        isDark
          ? 'bg-[#06090E] border-slate-700/80 focus-within:border-cyan-500/60'
          : 'bg-white border-slate-300 focus-within:border-cyan-600'
      } ${className}`}
    >
      {/* RICH FORMATTING & COLOR TOOLBAR */}
      <div
        className={`flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 border-b select-none ${
          isDark
            ? 'bg-[#0B0F17] border-slate-800 text-slate-300'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}
      >
        {/* Left Toolbar: Colors, Quick Dots, Formatting Controls */}
        <div className="flex flex-wrap items-center gap-1">
          {/* Main Color Picker Dropdown Trigger ("A" with colored bar) */}
          <div className="relative" ref={colorPickerRef}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsColorPickerOpen(!isColorPickerOpen);
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                isColorPickerOpen
                  ? isDark
                    ? 'bg-cyan-950/60 text-cyan-300 ring-1 ring-cyan-500'
                    : 'bg-cyan-100 text-cyan-900 ring-1 ring-cyan-400'
                  : isDark
                  ? 'hover:bg-slate-800 text-slate-200'
                  : 'hover:bg-slate-200 text-slate-800'
              }`}
              title="Couleur du texte et surlignage"
            >
              <div className="flex flex-col items-center leading-none">
                <span className="font-serif font-black text-sm">A</span>
                <span
                  className="w-4 h-1 rounded-full mt-0.5 shadow-2xs"
                  style={{
                    backgroundColor:
                      activeTextColor === 'default'
                        ? isDark
                          ? '#ffffff'
                          : '#000000'
                        : activeTextColor,
                  }}
                />
              </div>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>

            {/* Color Palette Popover */}
            {isColorPickerOpen && (
              <div
                className={`absolute left-0 top-full mt-1.5 w-64 rounded-xl border p-3 shadow-2xl z-40 text-xs font-sans space-y-3 ${
                  isDark
                    ? 'bg-[#0E131F] border-slate-700 text-slate-200 shadow-[0_15px_35px_rgba(0,0,0,0.8)]'
                    : 'bg-white border-slate-200 text-slate-800 shadow-xl'
                }`}
              >
                {/* Tabs: Couleur du texte vs Surlignage */}
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-500/10 text-center font-medium text-[11px]">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setActiveColorTab('text');
                    }}
                    className={`py-1 rounded-md transition cursor-pointer flex items-center justify-center gap-1 ${
                      activeColorTab === 'text'
                        ? isDark
                          ? 'bg-cyan-600 text-white shadow-xs font-bold'
                          : 'bg-white text-slate-900 shadow-xs font-bold'
                        : 'text-slate-400 hover:text-inherit'
                    }`}
                  >
                    <Type className="h-3 w-3" />
                    <span>Texte</span>
                  </button>

                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setActiveColorTab('highlight');
                    }}
                    className={`py-1 rounded-md transition cursor-pointer flex items-center justify-center gap-1 ${
                      activeColorTab === 'highlight'
                        ? isDark
                          ? 'bg-cyan-600 text-white shadow-xs font-bold'
                          : 'bg-white text-slate-900 shadow-xs font-bold'
                        : 'text-slate-400 hover:text-inherit'
                    }`}
                  >
                    <Highlighter className="h-3 w-3" />
                    <span>Surlignage</span>
                  </button>
                </div>

                {/* TAB 1: TEXT COLOR */}
                {activeColorTab === 'text' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Palette de couleurs</span>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyTextColor('default');
                          setIsColorPickerOpen(false);
                        }}
                        className="hover:underline hover:text-cyan-400 cursor-pointer"
                      >
                        Réinitialiser
                      </button>
                    </div>

                    <div className="grid grid-cols-6 gap-2">
                      {TEXT_COLORS.map((c) => {
                        const isSelected = activeTextColor.toLowerCase() === c.color.toLowerCase();
                        return (
                          <button
                            key={c.color}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              applyTextColor(c.color);
                              setIsColorPickerOpen(false);
                            }}
                            className={`h-7 w-7 rounded-lg transition-transform hover:scale-110 flex items-center justify-center border cursor-pointer ${
                              isSelected
                                ? 'ring-2 ring-cyan-500 scale-105'
                                : 'border-slate-400/40 dark:border-slate-700'
                            }`}
                            style={{ backgroundColor: c.color }}
                            title={c.name}
                          >
                            {isSelected && (
                              <Check
                                className={`h-3.5 w-3.5 ${
                                  c.color === '#ffffff' || c.color === '#fef08a'
                                    ? 'text-black'
                                    : 'text-white'
                                }`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Color Pipette */}
                    <div className="pt-2 border-t border-inherit flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">Couleur sur-mesure :</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={customColorInput}
                          onChange={(e) => {
                            setCustomColorInput(e.target.value);
                            applyTextColor(e.target.value);
                          }}
                          className="h-6 w-7 rounded cursor-pointer border border-slate-400 bg-transparent p-0"
                          title="Choisir une couleur personnalisée"
                        />
                        <span className="text-[10px] font-mono uppercase text-slate-400">
                          {customColorInput}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: HIGHLIGHT COLOR */}
                {activeColorTab === 'highlight' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Couleur de fond</span>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyHighlightColor('transparent');
                          setIsColorPickerOpen(false);
                        }}
                        className="hover:underline hover:text-cyan-400 cursor-pointer"
                      >
                        Aucun
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {HIGHLIGHT_COLORS.map((c) => {
                        const isSelected = activeHighlightColor === c.color;
                        return (
                          <button
                            key={c.color}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              applyHighlightColor(c.color);
                              setIsColorPickerOpen(false);
                            }}
                            className={`h-7 rounded-md text-[10px] font-medium transition-transform hover:scale-105 flex items-center justify-center border cursor-pointer ${
                              isSelected
                                ? 'ring-2 ring-cyan-500 scale-105'
                                : 'border-slate-400/40 dark:border-slate-700'
                            }`}
                            style={{
                              backgroundColor: c.color === 'transparent' ? 'transparent' : c.color,
                              color: c.color === 'transparent' ? 'inherit' : '#111827',
                            }}
                            title={c.name}
                          >
                            {c.name === 'Aucun' ? 'Aucun' : ''}
                            {isSelected && c.name !== 'Aucun' && (
                              <Check className="h-3 w-3 text-slate-900" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick-Access 1-Click Color Dots (Instant typing in color!) */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 border-r border-slate-700/30">
            {QUICK_COLOR_DOTS.map((dot) => {
              const isDefault = dot.color === 'default';
              const dotColor = isDefault
                ? isDark
                  ? '#ffffff'
                  : '#111827'
                : dot.color;
              const isActive =
                activeTextColor.toLowerCase() === (isDefault ? 'default' : dot.color.toLowerCase());

              return (
                <button
                  key={dot.label}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyTextColor(dot.color);
                  }}
                  className={`h-4 w-4 rounded-full transition-transform hover:scale-125 cursor-pointer border ${
                    isActive
                      ? 'ring-2 ring-cyan-400 scale-110'
                      : 'border-slate-400/50 dark:border-slate-600'
                  }`}
                  style={{ backgroundColor: dotColor }}
                  title={`Écrire en ${dot.label}`}
                />
              );
            })}
          </div>

          {/* Standard Rich Text Controls (Bold, Italic, Underline, Strike) */}
          <div className="flex items-center gap-0.5 pl-1">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('bold');
              }}
              className={`p-1.5 rounded transition cursor-pointer ${
                isBold
                  ? 'bg-slate-500/20 text-cyan-400 font-bold'
                  : 'hover:bg-slate-500/10'
              }`}
              title="Gras (Ctrl+B)"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('italic');
              }}
              className={`p-1.5 rounded transition cursor-pointer ${
                isItalic
                  ? 'bg-slate-500/20 text-cyan-400 font-bold'
                  : 'hover:bg-slate-500/10'
              }`}
              title="Italique (Ctrl+I)"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('underline');
              }}
              className={`p-1.5 rounded transition cursor-pointer ${
                isUnderline
                  ? 'bg-slate-500/20 text-cyan-400 font-bold'
                  : 'hover:bg-slate-500/10'
              }`}
              title="Souligné (Ctrl+U)"
            >
              <Underline className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('strikeThrough');
              }}
              className={`p-1.5 rounded transition cursor-pointer ${
                isStrikethrough
                  ? 'bg-slate-500/20 text-cyan-400 font-bold'
                  : 'hover:bg-slate-500/10'
              }`}
              title="Barré"
            >
              <Strikethrough className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Lists and Alignment */}
          <div className="hidden sm:flex items-center gap-0.5 border-l border-slate-700/30 pl-1">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('insertUnorderedList');
              }}
              className="p-1.5 rounded hover:bg-slate-500/10 transition cursor-pointer"
              title="Liste à puces"
            >
              <List className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('insertOrderedList');
              }}
              className="p-1.5 rounded hover:bg-slate-500/10 transition cursor-pointer"
              title="Liste numérotée"
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('justifyLeft');
              }}
              className="p-1.5 rounded hover:bg-slate-500/10 transition cursor-pointer"
              title="Aligner à gauche"
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('justifyCenter');
              }}
              className="p-1.5 rounded hover:bg-slate-500/10 transition cursor-pointer"
              title="Centrer"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd('justifyRight');
              }}
              className="p-1.5 rounded hover:bg-slate-500/10 transition cursor-pointer"
              title="Aligner à droite"
            >
              <AlignRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Right Toolbar: AI Assistant & Remove formatting */}
        <div className="flex items-center gap-1.5">
          {onToggleAi && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onToggleAi();
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold transition cursor-pointer ${
                isAiActive
                  ? isDark
                    ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/60 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                    : 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-400'
                  : isDark
                  ? 'hover:bg-slate-800 text-cyan-400 hover:text-cyan-300'
                  : 'hover:bg-cyan-50 text-cyan-700'
              }`}
              title="Rédiger avec l'IA (Gemini)"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span className="hidden sm:inline">{aiButtonLabel}</span>
            </button>
          )}

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleRemoveFormat();
            }}
            className="p-1.5 rounded hover:bg-slate-500/10 text-slate-400 hover:text-red-400 transition cursor-pointer"
            title="Supprimer la mise en forme (texte brut)"
          >
            <RemoveFormatting className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* CONTENTEDITABLE WRITING CANVAS */}
      <div
        id={id}
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyUp={checkFormatStates}
        onMouseUp={checkFormatStates}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className={`flex-1 p-3.5 sm:p-4 text-sm leading-relaxed outline-none font-sans overflow-y-auto rich-email-content ${
          isDark
            ? 'text-slate-100 selection:bg-cyan-500/30'
            : 'text-slate-900 selection:bg-cyan-100'
        }`}
      />
    </div>
  );
};
