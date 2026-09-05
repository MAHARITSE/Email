import React, { useState, useEffect, useRef } from 'react';
import { User, Briefcase, Plus, Check, Star } from 'lucide-react';
import { LocalContact, suggestContacts, incrementContactUsage, saveLocalContact } from '../services/contactsService';
import { useTheme } from '../context/ThemeContext';

interface ContactAutocompleteInputProps {
  id: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  autoFocus?: boolean;
}

export const ContactAutocompleteInput: React.FC<ContactAutocompleteInputProps> = ({
  id,
  value,
  onChange,
  placeholder,
  className,
  required,
  autoFocus,
}) => {
  const { isDark } = useTheme();
  const [suggestions, setSuggestions] = useState<LocalContact[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [quickSaved, setQuickSaved] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update suggestions when value changes
  useEffect(() => {
    const tokens = value.split(',');
    const currentQuery = tokens[tokens.length - 1].trim();

    if (currentQuery.length > 0) {
      const results = suggestContacts(currentQuery, 6);
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setHighlightedIndex(results.length > 0 ? 0 : -1);
    } else {
      setSuggestions([]);
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectContact = (contact: LocalContact) => {
    const tokens = value.split(',');
    tokens.pop(); // remove incomplete query
    const prefix = tokens.length > 0 ? tokens.join(', ').trim() + ', ' : '';
    const formatted = `${contact.name} <${contact.email}>`;
    onChange(prefix ? `${prefix}${formatted}` : formatted);
    incrementContactUsage(contact.email);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleQuickAdd = () => {
    const tokens = value.split(',');
    const current = tokens[tokens.length - 1].trim();
    if (!current || !current.includes('@')) return;

    // Check if format is "Name <email@domain>"
    const match = current.match(/^(.*?)\s*<(.+?)>$/);
    const name = match ? match[1] : current.split('@')[0];
    const email = match ? match[2] : current;

    saveLocalContact({
      name,
      email,
      category: email.endsWith('gmail.com') || email.endsWith('outlook.com') ? 'personal' : 'pro',
    });
    setQuickSaved(true);
    setTimeout(() => setQuickSaved(false), 3000);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelectContact(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const currentToken = value.split(',').pop()?.trim() || '';
  const canQuickAdd =
    currentToken.includes('@') &&
    !suggestions.some((s) => s.email.toLowerCase() === currentToken.toLowerCase());

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (currentToken.length > 0 && suggestions.length > 0) {
            setIsOpen(true);
          }
        }}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        className={
          className ||
          `w-full bg-transparent py-1 text-sm outline-hidden font-mono ${
            isDark
              ? 'text-slate-200 placeholder:text-slate-600'
              : 'text-slate-900 placeholder:text-slate-400'
          }`
        }
      />

      {/* Quick Add Pill feedback */}
      {quickSaved && (
        <span className="absolute right-2 top-1.5 inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full animate-in fade-in">
          <Check className="h-3 w-3" /> Contact enregistré
        </span>
      )}

      {/* Autocomplete Dropdown */}
      {isOpen && (
        <div
          className={`absolute left-0 top-full mt-1.5 w-full max-w-md rounded-xl border shadow-2xl z-50 overflow-hidden text-xs animate-in fade-in-50 duration-100 ${
            isDark
              ? 'bg-[#0B0F17] border-slate-700/80 text-slate-200 shadow-[0_15px_35px_rgba(0,0,0,0.8)]'
              : 'bg-white border-slate-200 text-slate-800 shadow-xl'
          }`}
        >
          <div className="p-1.5 max-h-60 overflow-y-auto space-y-0.5">
            {suggestions.map((contact, idx) => {
              const isHighlighted = idx === highlightedIndex;
              const isPro = contact.category === 'pro';
              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handleSelectContact(contact)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition ${
                    isHighlighted
                      ? isDark
                        ? 'bg-cyan-950/60 text-cyan-200 border border-cyan-500/30'
                        : 'bg-cyan-50 text-cyan-900 border border-cyan-200'
                      : isDark
                      ? 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                      : 'hover:bg-slate-100 text-slate-700 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-full bg-gradient-to-tr ${contact.avatarColor} flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-xs`}
                    >
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold truncate">{contact.name}</span>
                        {contact.isFavorite && (
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                        )}
                        {contact.company && (
                          <span className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            • {contact.company}
                          </span>
                        )}
                      </div>
                      <span className={`text-[11px] font-mono truncate block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {contact.email}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 flex items-center gap-1 ${
                      isPro
                        ? isDark
                          ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/60'
                          : 'bg-blue-100 text-blue-700'
                        : isDark
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {isPro ? <Briefcase className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                    <span>{isPro ? 'Pro' : 'Perso'}</span>
                  </span>
                </button>
              );
            })}

            {/* Quick Add Option */}
            {canQuickAdd && (
              <button
                type="button"
                onClick={handleQuickAdd}
                className={`w-full flex items-center gap-2 p-2 rounded-lg text-left font-mono text-[11px] transition border border-dashed ${
                  isDark
                    ? 'border-slate-700 text-cyan-400 hover:bg-slate-800/40 hover:border-cyan-500'
                    : 'border-slate-300 text-blue-600 hover:bg-slate-50 hover:border-blue-500'
                }`}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  Enregistrer "<strong>{currentToken}</strong>" dans vos contacts
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
