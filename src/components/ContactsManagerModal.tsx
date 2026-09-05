import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  User,
  Briefcase,
  Search,
  Plus,
  Trash2,
  Edit2,
  Mail,
  Phone,
  Building,
  Check,
  Download,
  Users,
  Star,
  Sparkles,
} from 'lucide-react';
import {
  LocalContact,
  ContactCategory,
  getLocalContacts,
  saveLocalContact,
  deleteLocalContact,
  updateContactCategory,
  toggleContactFavorite,
  importContactsFromParsedEmails,
} from '../services/contactsService';
import { ParsedEmail } from '../types/gmail';
import { useTheme } from '../context/ThemeContext';

interface ContactsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  emailsForImport?: ParsedEmail[];
  emailCategoryMap?: Record<string, string>;
  currentUserEmail?: string;
  onSelectContactToCompose?: (email: string) => void;
}

export const ContactsManagerModal: React.FC<ContactsManagerModalProps> = ({
  isOpen,
  onClose,
  emailsForImport = [],
  emailCategoryMap = {},
  currentUserEmail = '',
  onSelectContactToCompose,
}) => {
  const { isDark } = useTheme();

  const [contacts, setContacts] = useState<LocalContact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'favorites' | 'pro' | 'personal' | 'received' | 'sent'>('all');

  // Form states
  const [isAdding, setIsAdding] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    category: ContactCategory;
    company: string;
    phone: string;
    notes: string;
    isFavorite: boolean;
  }>({
    name: '',
    email: '',
    category: 'pro',
    company: '',
    phone: '',
    notes: '',
    isFavorite: false,
  });

  const [importStatus, setImportStatus] = useState<string | null>(null);

  const reloadContacts = () => {
    setContacts(getLocalContacts());
  };

  useEffect(() => {
    if (isOpen) {
      reloadContacts();
      setIsAdding(false);
      setEditingContactId(null);
      setImportStatus(null);
    }
  }, [isOpen]);

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    return contacts
      .filter((c) => {
        if (activeCategory === 'favorites' && !c.isFavorite) {
          return false;
        }
        if (activeCategory === 'pro' && c.category !== 'pro') {
          return false;
        }
        if (activeCategory === 'personal' && c.category !== 'personal') {
          return false;
        }
        if (activeCategory === 'received' && c.direction !== 'received' && c.direction !== 'both') {
          return false;
        }
        if (activeCategory === 'sent' && c.direction !== 'sent' && c.direction !== 'both') {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = c.name.toLowerCase().includes(q);
          const matchEmail = c.email.toLowerCase().includes(q);
          const matchCompany = c.company?.toLowerCase().includes(q);
          const matchNotes = c.notes?.toLowerCase().includes(q);
          return matchName || matchEmail || matchCompany || matchNotes;
        }
        return true;
      })
      .sort((a, b) => {
        // Prioritize favorites
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [contacts, activeCategory, searchQuery]);

  const counts = useMemo(() => {
    const favorites = contacts.filter((c) => c.isFavorite).length;
    const pro = contacts.filter((c) => c.category === 'pro').length;
    const personal = contacts.filter((c) => c.category === 'personal').length;
    const received = contacts.filter((c) => c.direction === 'received' || c.direction === 'both').length;
    const sent = contacts.filter((c) => c.direction === 'sent' || c.direction === 'both').length;
    return { all: contacts.length, favorites, pro, personal, received, sent };
  }, [contacts]);

  const handleStartAdd = () => {
    setEditingContactId(null);
    setFormData({
      name: '',
      email: '',
      category: activeCategory === 'personal' ? 'personal' : 'pro',
      company: '',
      phone: '',
      notes: '',
      isFavorite: activeCategory === 'favorites',
    });
    setIsAdding(true);
  };

  const handleStartEdit = (c: LocalContact) => {
    setIsAdding(false);
    setEditingContactId(c.id);
    setFormData({
      name: c.name,
      email: c.email,
      category: c.category,
      company: c.company || '',
      phone: c.phone || '',
      notes: c.notes || '',
      isFavorite: Boolean(c.isFavorite),
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim() || !formData.email.includes('@')) {
      alert('Veuillez renseigner une adresse email valide.');
      return;
    }

    saveLocalContact({
      id: editingContactId || undefined,
      name: formData.name.trim() || formData.email.split('@')[0],
      email: formData.email.trim(),
      category: formData.category,
      company: formData.company.trim(),
      phone: formData.phone.trim(),
      notes: formData.notes.trim(),
      isFavorite: formData.isFavorite,
    });

    reloadContacts();
    setIsAdding(false);
    setEditingContactId(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Supprimer définitivement le contact "${name}" ?`)) {
      deleteLocalContact(id);
      reloadContacts();
      if (editingContactId === id) {
        setEditingContactId(null);
      }
    }
  };

  const handleToggleFavorite = (id: string) => {
    toggleContactFavorite(id);
    reloadContacts();
  };

  const handleImportEmails = () => {
    if (emailsForImport.length === 0) {
      setImportStatus('Aucun e-mail disponible à analyser pour le moment.');
      return;
    }
    const { added, updated } = importContactsFromParsedEmails(
      emailsForImport,
      emailCategoryMap,
      currentUserEmail
    );
    reloadContacts();
    setImportStatus(
      `Synchronisation terminée : ${added} nouveaux contacts ajoutés, ${updated} mis à jour.`
    );
    setTimeout(() => setImportStatus(null), 5000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-xs select-none"
      onClick={onClose}
      id="contacts-manager-modal-backdrop"
    >
      <div
        className={`relative flex flex-col rounded-2xl shadow-2xl overflow-hidden w-full max-w-5xl h-[88vh] transition-colors ${
          isDark
            ? 'bg-[#0B0F17] border border-slate-800 text-slate-200'
            : 'bg-white border border-slate-200 text-slate-800'
        }`}
        onClick={(e) => e.stopPropagation()}
        id="contacts-manager-modal-container"
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isDark ? 'border-slate-800 bg-[#0E131F]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-wide flex items-center gap-2">
                Carnet de Contacts Local
                <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {contacts.length} enregistrés
                </span>
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Gérez vos contacts professionnels et personnels avec suggestions intelligentes & priorité favoris
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleImportEmails}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border transition ${
                isDark
                  ? 'border-slate-700 bg-slate-800/80 text-cyan-400 hover:bg-slate-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
              title="Scanner les e-mails récents pour extraire les contacts"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Auto-importer depuis Gmail</span>
            </button>

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
        </div>

        {/* Import Status Alert */}
        {importStatus && (
          <div className="px-6 py-2 bg-emerald-500/10 border-b border-emerald-500/30 text-xs text-emerald-400 font-mono flex items-center gap-2">
            <Check className="h-3.5 w-3.5" />
            <span>{importStatus}</span>
          </div>
        )}

        {/* Action Bar (Search & Filter Tabs) */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b shrink-0 ${
            isDark ? 'border-slate-800 bg-[#080B10]' : 'border-slate-200 bg-slate-50/60'
          }`}
        >
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeCategory === 'all'
                  ? isDark
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'bg-slate-200 text-slate-900 font-semibold'
                  : isDark
                  ? 'text-slate-400 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Tous ({counts.all})
            </button>

            <button
              type="button"
              onClick={() => setActiveCategory('favorites')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeCategory === 'favorites'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                  : isDark
                  ? 'text-slate-400 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
              <span>Favoris VIP ({counts.favorites})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveCategory('pro')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeCategory === 'pro'
                  ? isDark
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50 font-semibold'
                    : 'bg-blue-100 text-blue-900 font-semibold'
                  : isDark
                  ? 'text-slate-400 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5 text-cyan-400" />
              <span>Professionnels ({counts.pro})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveCategory('personal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeCategory === 'personal'
                  ? isDark
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50 font-semibold'
                    : 'bg-emerald-100 text-emerald-900 font-semibold'
                  : isDark
                  ? 'text-slate-400 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <User className="h-3.5 w-3.5 text-emerald-400" />
              <span>Personnels ({counts.personal})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveCategory('received')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeCategory === 'received'
                  ? isDark
                    ? 'bg-purple-950 text-purple-300 border border-purple-500/50 font-semibold'
                    : 'bg-purple-100 text-purple-900 font-semibold'
                  : isDark
                  ? 'text-slate-400 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Contacts qui m'ont envoyé des e-mails"
            >
              <span>Reçus ({counts.received})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveCategory('sent')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeCategory === 'sent'
                  ? isDark
                    ? 'bg-amber-950 text-amber-300 border border-amber-500/50 font-semibold'
                    : 'bg-amber-100 text-amber-900 font-semibold'
                  : isDark
                  ? 'text-slate-400 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Contacts auxquels j'ai envoyé des e-mails"
            >
              <span>Envoyés ({counts.sent})</span>
            </button>
          </div>

          {/* Search Bar & Add Button */}
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher nom, email, société..."
                className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border outline-none ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-400'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600'
                }`}
              />
            </div>

            <button
              type="button"
              onClick={handleStartAdd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition active:scale-95 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nouveau contact</span>
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 select-text">
            {filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center space-y-3">
                <Users className="h-10 w-10 text-slate-500" />
                <p className="text-sm font-semibold">Aucun contact trouvé</p>
                <p className="text-xs text-slate-400 max-w-sm">
                  {searchQuery
                    ? `Aucun résultat pour "${searchQuery}"`
                    : 'Ajoutez votre premier contact ou importez vos correspondants récents.'}
                </p>
                <button
                  type="button"
                  onClick={handleStartAdd}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Ajouter un contact</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filteredContacts.map((contact) => {
                  const isPro = contact.category === 'pro';
                  const isEditing = editingContactId === contact.id;

                  return (
                    <div
                      key={contact.id}
                      className={`p-4 rounded-xl border transition group relative ${
                        isEditing
                          ? isDark
                            ? 'bg-cyan-950/40 border-cyan-500/50'
                            : 'bg-cyan-50 border-cyan-300'
                          : isDark
                          ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                          : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Avatar & Contact Info */}
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${contact.avatarColor} flex items-center justify-center text-sm font-bold text-white shadow-xs shrink-0`}
                          >
                            {contact.name.charAt(0).toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-sm font-bold truncate">
                                {contact.name}
                              </h4>
                              {contact.isFavorite && (
                                <span title="Contact Favori VIP (prioritaire si non lu)">
                                  <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs font-mono text-cyan-500 truncate">
                                {contact.email}
                              </p>
                              {contact.direction === 'sent' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                  Envoyé ➔
                                </span>
                              )}
                              {contact.direction === 'received' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/30">
                                  Reçu 🡐
                                </span>
                              )}
                              {contact.direction === 'both' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                  Échanges ⇆
                                </span>
                              )}
                            </div>

                            {contact.company && (
                              <p className={`text-[11px] truncate mt-0.5 flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                <Building className="h-3 w-3 shrink-0" />
                                <span>{contact.company}</span>
                              </p>
                            )}

                            {contact.phone && (
                              <p className={`text-[11px] font-mono truncate mt-0.5 flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                <Phone className="h-3 w-3 shrink-0" />
                                <span>{contact.phone}</span>
                              </p>
                            )}

                            {contact.notes && (
                              <p className={`text-[11px] line-clamp-1 italic mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                "{contact.notes}"
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Top Right Badges & Actions */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            {/* Star VIP toggle button */}
                            <button
                              type="button"
                              onClick={() => handleToggleFavorite(contact.id)}
                              className={`p-1.5 rounded-lg transition ${
                                contact.isFavorite
                                  ? 'text-amber-400 hover:bg-amber-500/10'
                                  : 'text-slate-500 hover:text-amber-400 hover:bg-slate-500/10'
                              }`}
                              title={contact.isFavorite ? 'Retirer des favoris' : 'Marquer comme favori VIP'}
                            >
                              <Star className={`h-4 w-4 ${contact.isFavorite ? 'fill-amber-400' : ''}`} />
                            </button>

                            {/* Category Badge Toggle */}
                            <button
                              type="button"
                              onClick={() =>
                                updateContactCategory(
                                  contact.id,
                                  isPro ? 'personal' : 'pro'
                                )
                              }
                              title="Cliquer pour basculer Pro / Perso"
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 transition active:scale-95 ${
                                isPro
                                  ? isDark
                                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900/60'
                                    : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                  : isDark
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60'
                                  : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              }`}
                            >
                              {isPro ? (
                                <Briefcase className="h-3 w-3" />
                              ) : (
                                <User className="h-3 w-3" />
                              )}
                              <span>{isPro ? 'Pro' : 'Perso'}</span>
                            </button>
                          </div>

                          {/* Quick Action buttons */}
                          <div className="flex items-center gap-1">
                            {onSelectContactToCompose && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectContactToCompose(contact.email);
                                  onClose();
                                }}
                                className={`p-1.5 rounded-lg transition ${
                                  isDark
                                    ? 'hover:bg-cyan-950/60 hover:text-cyan-400 text-slate-400'
                                    : 'hover:bg-blue-100 hover:text-blue-700 text-slate-600'
                                }`}
                                title="Écrire un e-mail à ce contact"
                              >
                                <Mail className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleStartEdit(contact)}
                              className={`p-1.5 rounded-lg transition ${
                                isDark
                                  ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                                  : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                              }`}
                              title="Modifier"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(contact.id, contact.name)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                              title="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Edit / Add Contact Modal Dialog */}
      {(isAdding || editingContactId) && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs select-none animate-fade-in"
          onClick={() => {
            setIsAdding(false);
            setEditingContactId(null);
          }}
          id="contact-edit-modal-backdrop"
        >
          <div
            className={`relative flex flex-col rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg transition-colors ${
              isDark
                ? 'bg-[#0E131F] border border-slate-700 text-slate-200 shadow-[0_0_30px_rgba(34,211,238,0.15)]'
                : 'bg-white border border-slate-200 text-slate-800'
            }`}
            onClick={(e) => e.stopPropagation()}
            id="contact-edit-modal-container"
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${
                isDark ? 'border-slate-800 bg-[#080B10]' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <h3 className="text-sm font-bold flex items-center gap-2">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {editingContactId ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </div>
                <span>{isAdding ? 'Nouveau contact' : 'Modifier le contact'}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setEditingContactId(null);
                }}
                className={`p-1.5 rounded-lg transition ${
                  isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500'
                }`}
                title="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="p-5 space-y-3.5 text-xs">
              {/* Name */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Nom complet
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Sophie Lambert"
                  className={`w-full px-3 py-2 rounded-lg border outline-none ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600'
                  }`}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Adresse e-mail *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="sophie@entreprise.com"
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600'
                  }`}
                />
              </div>

              {/* Category Radio */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Catégorie
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, category: 'pro' })}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border transition ${
                      formData.category === 'pro'
                        ? isDark
                          ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300 font-semibold'
                          : 'bg-blue-100 border-blue-400 text-blue-900 font-semibold'
                        : isDark
                        ? 'border-slate-800 text-slate-400 hover:bg-slate-800/40'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Briefcase className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Professionnel</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, category: 'personal' })}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border transition ${
                      formData.category === 'personal'
                        ? isDark
                          ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 font-semibold'
                          : 'bg-emerald-100 border-emerald-400 text-emerald-900 font-semibold'
                        : isDark
                        ? 'border-slate-800 text-slate-400 hover:bg-slate-800/40'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <User className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Personnel</span>
                  </button>
                </div>
              </div>

              {/* Favorite VIP Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.isFavorite}
                    onChange={(e) => setFormData({ ...formData, isFavorite: e.target.checked })}
                    className="rounded text-amber-500 focus:ring-amber-400 h-4 w-4"
                  />
                  <span className="flex items-center gap-1 text-xs">
                    <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                    <span>Ajouter aux <strong>Favoris VIP</strong> (Priorité liste)</span>
                  </span>
                </label>
              </div>

              {/* Company */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Entreprise / Organisation
                </label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Ex: Acme Inc."
                  className={`w-full px-3 py-2 rounded-lg border outline-none ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600'
                  }`}
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Numéro de téléphone
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+33 6 00 00 00 00"
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600'
                  }`}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Notes complémentaires
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Responsable achats, ami d'enfance..."
                  className={`w-full px-3 py-2 rounded-lg border outline-none ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600'
                  }`}
                />
              </div>

              {/* Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800/40">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingContactId(null);
                  }}
                  className="px-3 py-1.5 rounded-lg hover:bg-slate-500/20 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-md transition active:scale-95"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Enregistrer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
