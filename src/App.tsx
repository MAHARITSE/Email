import React, { useEffect, useState, useCallback } from 'react';
import {
  initUniversalAuth,
  universalSignIn,
  universalLogout,
  setCachedUserAndToken,
  AuthenticatedUser,
} from './services/googleAuth';
import {
  getStoredAccounts,
  removeAccountFromStorage,
  StoredAccount,
} from './services/multiAccountService';
import {
  fetchProfile,
  fetchLabels,
  listMessages,
  modifyLabels,
  trashMessage,
  sendMessage,
  saveDraft,
  batchModifyLabels,
  parseRawMessage,
  ComposeOptions,
} from './services/gmailApi';
import {
  ParsedEmail,
  GmailLabel,
  GmailProfile,
  ConfirmationDialogState,
} from './types/gmail';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { EmailList } from './components/EmailList';
import { EmailDetail } from './components/EmailDetail';
import { ComposeModal } from './components/ComposeModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { SignInPrompt } from './components/SignInPrompt';
import { AttachmentExtractor } from './components/AttachmentExtractor';
import { ContactsManagerModal } from './components/ContactsManagerModal';
import { SignatureSettingsModal } from './components/SignatureSettingsModal';
import { AgendaView } from './components/AgendaView';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './context/ThemeContext';
import { getLocalContacts, importContactsFromParsedEmails } from './services/contactsService';
import { getPendingTasksCount } from './services/agendaService';
import {
  EmailCategory,
  classifyEmailFast,
  classifyEmailsWithGemini,
  loadManualOverrides,
  saveManualOverride,
} from './services/emailClassifier';

export default function App() {
  const { isDark } = useTheme();

  // Auth state
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<StoredAccount[]>(() => getStoredAccounts());

  // Mailbox data state
  const [profile, setProfile] = useState<GmailProfile | null>(null);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [selectedLabelId, setSelectedLabelId] = useState<string>('INBOX');
  const [emails, setEmails] = useState<ParsedEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<ParsedEmail | null>(null);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'starred'>('all');

  // Email Category & AI Classification state
  const [selectedCategory, setSelectedCategory] = useState<EmailCategory>('all');
  const [emailCategories, setEmailCategories] = useState<Record<string, 'pro' | 'personal' | 'sites' | 'other'>>(() =>
    loadManualOverrides()
  );

  // Search & Pagination state (50 emails per page)
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [pageTokens, setPageTokens] = useState<string[]>(['']);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);

  // UI modal / drawer state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const [isSignaturesOpen, setIsSignaturesOpen] = useState(false);
  const [contactsCount, setContactsCount] = useState(() => getLocalContacts().length);
  const [agendaCount, setAgendaCount] = useState(() => getPendingTasksCount());
  const [composeInitialData, setComposeInitialData] = useState<Partial<ComposeOptions> | undefined>(undefined);
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmationDialogState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync contacts count, agenda count & listen for auth expiry
  useEffect(() => {
    const handleUpdate = () => {
      setContactsCount(getLocalContacts().length);
    };
    const handleAgendaUpdate = () => {
      setAgendaCount(getPendingTasksCount());
    };
    const handleAuthExpired = (e: any) => {
      const msg =
        e?.detail?.message ||
        'Votre session Google a expiré (jeton OAuth expiré ou révoqué). Veuillez vous reconnecter en un clic.';
      setToken(null);
      setNeedsAuth(true);
      setAuthError(msg);
      showToast('Session Google expirée - Reconnexion requise');
    };

    window.addEventListener('gmail-contacts-updated', handleUpdate);
    window.addEventListener('gmail-agenda-updated', handleAgendaUpdate);
    window.addEventListener('gmail-auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('gmail-contacts-updated', handleUpdate);
      window.removeEventListener('gmail-agenda-updated', handleAgendaUpdate);
      window.removeEventListener('gmail-auth-expired', handleAuthExpired);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4000);
  };

  // 1. Initialize Auth on Mount
  useEffect(() => {
    const unsubscribe = initUniversalAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setNeedsAuth(false);
      },
      () => {
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Google Sign-In & Multi-Account actions
  const handleSignIn = async () => {
    try {
      setIsLoggingIn(true);
      setAuthError(null);
      const res = await universalSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setNeedsAuth(false);
        setAccounts(getStoredAccounts());
        showToast('Authentification réussie avec Google');
      }
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setAuthError(
        err?.message ||
          'Impossible d\'ouvrir la fenêtre de connexion Google. Veuillez vous assurer que les popups sont autorisées.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAddAccount = async () => {
    try {
      setIsLoggingIn(true);
      const res = await universalSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setNeedsAuth(false);
        const updated = getStoredAccounts();
        setAccounts(updated);
        setSelectedEmail(null);
        showToast(`Compte ajouté : ${res.user.email || res.user.displayName}`);
      }
    } catch (err: any) {
      showToast(err?.message || 'Impossible d\'ajouter le compte Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSwitchAccount = (targetEmail: string) => {
    const stored = getStoredAccounts();
    const target = stored.find(
      (a) => a.user.email?.toLowerCase() === targetEmail.toLowerCase()
    );
    if (target) {
      setUser(target.user);
      setToken(target.token);
      setCachedUserAndToken(target.user, target.token);
      setAccounts(stored);
      setSelectedEmail(null);
      setEmails([]);
      showToast(`Compte actif : ${target.user.email}`);
    }
  };

  const handleRemoveAccount = (targetEmail: string) => {
    const updated = removeAccountFromStorage(targetEmail);
    setAccounts(updated);
    showToast(`Compte ${targetEmail} retiré.`);
    if (user?.email?.toLowerCase() === targetEmail.toLowerCase()) {
      if (updated.length > 0) {
        const next = updated[0];
        setUser(next.user);
        setToken(next.token);
        setCachedUserAndToken(next.user, next.token);
        setSelectedEmail(null);
        setEmails([]);
      } else {
        handleSignOut();
      }
    }
  };

  const handleSignOut = async () => {
    await universalLogout();
    setUser(null);
    setToken(null);
    setProfile(null);
    setEmails([]);
    setSelectedEmail(null);
    setAccounts([]);
    setNeedsAuth(true);
  };

  // 3. Load user profile and labels once token is active
  const loadProfileAndLabels = useCallback(async (activeToken: string) => {
    try {
      const [profData, labelsData] = await Promise.all([
        fetchProfile(activeToken).catch(() => null),
        fetchLabels(activeToken).catch(() => []),
      ]);
      if (profData) setProfile(profData);
      if (labelsData) setLabels(labelsData);
    } catch (err) {
      console.error('Failed to load profile or labels', err);
    }
  }, []);

  // 4. Load messages for selected folder/label or search query (50 items per page + cross-page unread retrieval)
  const loadMessages = useCallback(
    async (
      activeToken: string,
      labelId: string,
      search: string,
      filter: 'all' | 'unread' | 'starred' = 'all',
      targetPageToken: string = ''
    ) => {
      try {
        setIsLoadingEmails(true);
        const params: any = {
          maxResults: 50,
          pageToken: targetPageToken || undefined,
        };

        const queryParts: string[] = [];
        if (search.trim()) {
          queryParts.push(search.trim());
        }

        if (filter === 'unread') {
          queryParts.push('is:unread');
        } else if (filter === 'starred' && labelId !== 'STARRED') {
          queryParts.push('is:starred');
        }

        if (queryParts.length > 0) {
          // If we have a query, specify folder context
          if (['INBOX', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH'].includes(labelId)) {
            if (labelId === 'INBOX' && !search.includes('label:')) {
              queryParts.push('label:INBOX');
            } else if (labelId !== 'INBOX') {
              params.labelIds = [labelId];
            }
          } else {
            params.labelIds = [labelId];
          }
          params.query = queryParts.join(' ');
        } else {
          // Standard Gmail system folders mapping
          params.labelIds = [labelId];
        }

        const res = await listMessages(activeToken, params);
        setEmails(res.emails);
        setNextPageToken(res.nextPageToken);
      } catch (err: any) {
        console.error('Error fetching emails:', err);
        const msg = err?.message || 'Échec du chargement des courriels';
        if (
          msg.toLowerCase().includes('invalid authentication credentials') ||
          msg.toLowerCase().includes('oauth 2 access token') ||
          msg.toLowerCase().includes('unauthenticated') ||
          msg.toLowerCase().includes('token expired') ||
          msg.toLowerCase().includes('login cookie')
        ) {
          window.dispatchEvent(
            new CustomEvent('gmail-auth-expired', {
              detail: { message: msg },
            })
          );
        } else {
          showToast(msg);
        }
      } finally {
        setIsLoadingEmails(false);
      }
    },
    []
  );

  // Trigger loading when token, label, or search changes
  useEffect(() => {
    if (!token) return;
    loadProfileAndLabels(token);
  }, [token, loadProfileAndLabels]);

  useEffect(() => {
    if (!token) return;
    if (selectedLabelId === 'ATTACHMENTS' || selectedLabelId === 'AGENDA') {
      setSelectedEmail(null);
      return;
    }
    setPageIndex(0);
    setPageTokens(['']);
    setSelectedEmail(null);
    loadMessages(token, selectedLabelId, activeSearch, statusFilter, '');
  }, [token, selectedLabelId, activeSearch, statusFilter, loadMessages]);

  const handleStatusFilterChange = (newFilter: 'all' | 'unread' | 'starred') => {
    setStatusFilter(newFilter);
    setPageIndex(0);
    setPageTokens(['']);
    setSelectedEmail(null);
  };

  // Pagination Handlers
  const handleNextPage = () => {
    if (!token || !nextPageToken) return;
    const newTokens = [...pageTokens, nextPageToken];
    setPageTokens(newTokens);
    setPageIndex(pageIndex + 1);
    loadMessages(token, selectedLabelId, activeSearch, statusFilter, nextPageToken);
  };

  const handlePrevPage = () => {
    if (!token || pageIndex <= 0) return;
    const targetToken = pageTokens[pageIndex - 1] || '';
    setPageIndex(pageIndex - 1);
    loadMessages(token, selectedLabelId, activeSearch, statusFilter, targetToken);
  };

  const handleRefresh = () => {
    if (!token) return;
    loadProfileAndLabels(token);
    if (selectedLabelId !== 'ATTACHMENTS' && selectedLabelId !== 'AGENDA') {
      const currentToken = pageTokens[pageIndex] || '';
      loadMessages(token, selectedLabelId, activeSearch, statusFilter, currentToken);
    }
    showToast('Boîte de réception actualisée');
  };

  // Search handler
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery);
  };

  // Update email categories when new emails are fetched
  useEffect(() => {
    if (emails.length === 0) return;
    importContactsFromParsedEmails(emails, emailCategories, profile?.emailAddress);

    const overrides = loadManualOverrides();
    const nextCats = { ...emailCategories };
    let hasNew = false;
    emails.forEach((em) => {
      if (!nextCats[em.id]) {
        nextCats[em.id] = overrides[em.id] || classifyEmailFast(em);
        hasNew = true;
      }
    });
    if (hasNew) {
      setEmailCategories(nextCats);
    }

    // AI Classification in background using Gemini for top unclassified emails only
    const unclassified = emails
      .filter((e) => !overrides[e.id] && !emailCategories[e.id])
      .slice(0, 15);
    if (unclassified.length > 0) {
      classifyEmailsWithGemini(unclassified).then((geminiMap) => {
        setEmailCategories((prev) => {
          const updated = { ...prev };
          let changed = false;
          for (const [id, cat] of Object.entries(geminiMap)) {
            if (!overrides[id] && updated[id] !== cat) {
              updated[id] = cat;
              changed = true;
            }
          }
          return changed ? updated : prev;
        });
      });
    }
  }, [emails]);

  const handleUpdateEmailCategory = (
    emailId: string,
    category: 'pro' | 'personal' | 'sites' | 'other'
  ) => {
    saveManualOverride(emailId, category);
    setEmailCategories((prev) => ({
      ...prev,
      [emailId]: category,
    }));
    showToast(
      `Courriel classé en "${
        category === 'pro'
          ? 'Professionnel'
          : category === 'personal'
          ? 'Personnel'
          : category === 'sites'
          ? 'Sites & Abonnements'
          : 'Autres & Divers'
      }"`
    );
  };

  const categoryCounts = React.useMemo(() => {
    const counts = { pro: 0, personal: 0, sites: 0, other: 0 };
    const seenThreads = new Set<string>();
    emails.forEach((em) => {
      const threadKey = em.threadId || em.id;
      if (!seenThreads.has(threadKey)) {
        seenThreads.add(threadKey);
        const cat = emailCategories[em.id] || classifyEmailFast(em);
        if (counts[cat] !== undefined) {
          counts[cat]++;
        }
      }
    });
    return counts;
  }, [emails, emailCategories]);

  // Star / Unstar
  const handleToggleStar = async (email: ParsedEmail, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!token) return;

    const newStarred = !email.isStarred;
    // Optimistic update
    setEmails((prev) =>
      prev.map((m) =>
        m.id === email.id ? { ...m, isStarred: newStarred } : m
      )
    );
    if (selectedEmail?.id === email.id) {
      setSelectedEmail((prev) => (prev ? { ...prev, isStarred: newStarred } : null));
    }

    try {
      if (newStarred) {
        await modifyLabels(token, email.id, { addLabelIds: ['STARRED'] });
      } else {
        await modifyLabels(token, email.id, { removeLabelIds: ['STARRED'] });
      }
    } catch (err: any) {
      console.error('Failed to update star', err);
      // Revert optimistic update
      setEmails((prev) =>
        prev.map((m) =>
          m.id === email.id ? { ...m, isStarred: !newStarred } : m
        )
      );
    }
  };

  // Mark Read / Unread
  const handleToggleUnread = async (email: ParsedEmail, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!token) return;

    const newUnread = !email.isUnread;
    setEmails((prev) =>
      prev.map((m) =>
        m.id === email.id ? { ...m, isUnread: newUnread } : m
      )
    );
    if (selectedEmail?.id === email.id) {
      setSelectedEmail((prev) => (prev ? { ...prev, isUnread: newUnread } : null));
    }

    // Immediately update INBOX and label unread counters in state
    setLabels((prevLabels) =>
      prevLabels.map((lbl) => {
        if (lbl.id === 'INBOX' || (email.labelIds && email.labelIds.includes(lbl.id))) {
          const delta = newUnread ? 1 : -1;
          const curThreads = typeof lbl.threadsUnread === 'number' ? lbl.threadsUnread : (lbl.messagesUnread || 0);
          const curMsgs = typeof lbl.messagesUnread === 'number' ? lbl.messagesUnread : (lbl.threadsUnread || 0);
          return {
            ...lbl,
            threadsUnread: Math.max(0, curThreads + delta),
            messagesUnread: Math.max(0, curMsgs + delta),
          };
        }
        return lbl;
      })
    );

    try {
      if (newUnread) {
        await modifyLabels(token, email.id, { addLabelIds: ['UNREAD'] });
      } else {
        await modifyLabels(token, email.id, { removeLabelIds: ['UNREAD'] });
      }
    } catch (err: any) {
      console.error('Failed to update read state', err);
      // Revert both the message and the counters when Gmail rejects the update.
      setEmails((prev) =>
        prev.map((m) =>
          m.id === email.id ? { ...m, isUnread: !newUnread } : m
        )
      );
      setSelectedEmail((prev) =>
        prev?.id === email.id ? { ...prev, isUnread: !newUnread } : prev
      );
      setLabels((prevLabels) =>
        prevLabels.map((lbl) => {
          if (lbl.id === 'INBOX' || (email.labelIds && email.labelIds.includes(lbl.id))) {
            const delta = newUnread ? -1 : 1;
            const curThreads = typeof lbl.threadsUnread === 'number' ? lbl.threadsUnread : (lbl.messagesUnread || 0);
            const curMsgs = typeof lbl.messagesUnread === 'number' ? lbl.messagesUnread : (lbl.threadsUnread || 0);
            return {
              ...lbl,
              threadsUnread: Math.max(0, curThreads + delta),
              messagesUnread: Math.max(0, curMsgs + delta),
            };
          }
          return lbl;
        })
      );
      showToast('Impossible de mettre à jour ce courriel');
    }
  };

  // Batch Mark Read / Unread
  const handleBatchMarkRead = async (selectedList: ParsedEmail[], isRead: boolean) => {
    if (!token || selectedList.length === 0) return;
    const ids = selectedList.map((m) => m.id);

    setEmails((prev) =>
      prev.map((m) => (ids.includes(m.id) ? { ...m, isUnread: !isRead } : m))
    );

    // Update inbox/labels unread count immediately
    const countUnreadTargeted = selectedList.filter((m) => isRead ? m.isUnread : !m.isUnread).length;
    if (countUnreadTargeted > 0) {
      const delta = isRead ? -countUnreadTargeted : countUnreadTargeted;
      setLabels((prevLabels) =>
        prevLabels.map((lbl) => {
          if (lbl.id === 'INBOX') {
            const curThreads = typeof lbl.threadsUnread === 'number' ? lbl.threadsUnread : 0;
            const curMsgs = typeof lbl.messagesUnread === 'number' ? lbl.messagesUnread : 0;
            return {
              ...lbl,
              threadsUnread: Math.max(0, curThreads + delta),
              messagesUnread: Math.max(0, curMsgs + delta),
            };
          }
          return lbl;
        })
      );
    }

    try {
      if (isRead) {
        await batchModifyLabels(token, ids, { removeLabelIds: ['UNREAD'] });
      } else {
        await batchModifyLabels(token, ids, { addLabelIds: ['UNREAD'] });
      }
      showToast(`${ids.length} courriel(s) marqué(s) comme ${isRead ? 'lu(s)' : 'non lu(s)'}`);
    } catch (err: any) {
      showToast('Échec de la mise à jour des courriels');
      handleRefresh();
    }
  };

  // Selection of Email item
  const handleSelectEmail = (email: ParsedEmail) => {
    // Keep the detail view in sync with the optimistic list update. Previously an
    // unread message stayed visually unread in the detail header until a refresh.
    const openedEmail = email.isUnread ? { ...email, isUnread: false } : email;
    setSelectedEmail(openedEmail);
    // If unread, mark as read automatically & update inbox unread count directly
    if (email.isUnread) {
      setEmails((prev) =>
        prev.map((m) => (m.id === email.id ? { ...m, isUnread: false } : m))
      );
      setLabels((prevLabels) =>
        prevLabels.map((lbl) => {
          if (lbl.id === 'INBOX' || (email.labelIds && email.labelIds.includes(lbl.id))) {
            const curThreads = typeof lbl.threadsUnread === 'number' ? lbl.threadsUnread : (lbl.messagesUnread || 0);
            const curMsgs = typeof lbl.messagesUnread === 'number' ? lbl.messagesUnread : (lbl.threadsUnread || 0);
            return {
              ...lbl,
              threadsUnread: Math.max(0, curThreads - 1),
              messagesUnread: Math.max(0, curMsgs - 1),
            };
          }
          return lbl;
        })
      );
      if (token) {
        modifyLabels(token, email.id, { removeLabelIds: ['UNREAD'] }).catch(() => {
          setEmails((prev) =>
            prev.map((m) => (m.id === email.id ? { ...m, isUnread: true } : m))
          );
          setSelectedEmail((prev) =>
            prev?.id === email.id ? { ...prev, isUnread: true } : prev
          );
          setLabels((prevLabels) =>
            prevLabels.map((lbl) => {
              if (lbl.id === 'INBOX' || (email.labelIds && email.labelIds.includes(lbl.id))) {
                const curThreads = typeof lbl.threadsUnread === 'number' ? lbl.threadsUnread : (lbl.messagesUnread || 0);
                const curMsgs = typeof lbl.messagesUnread === 'number' ? lbl.messagesUnread : (lbl.threadsUnread || 0);
                return {
                  ...lbl,
                  threadsUnread: curThreads + 1,
                  messagesUnread: curMsgs + 1,
                };
              }
              return lbl;
            })
          );
          showToast('Le message reste non lu : synchronisation impossible');
        });
      }
    }
  };

  // MANDATORY USER CONFIRMATION: Single Trash Operation
  const handleRequestTrash = (email: ParsedEmail, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfirmationDialog({
      isOpen: true,
      title: 'Déplacer la conversation dans la corbeille',
      message: `Êtes-vous sûr de vouloir déplacer la conversation "${
        email.subject || '(Sans objet)'
      }" de ${email.fromName || email.fromEmail} dans la corbeille ?`,
      confirmLabel: 'Déplacer dans la corbeille',
      confirmStyle: 'danger',
      onConfirm: async () => {
        if (!token) return;
        try {
          await trashMessage(token, email.id);
          setEmails((prev) => prev.filter((m) => m.id !== email.id));
          if (selectedEmail?.id === email.id) {
            setSelectedEmail(null);
          }
          showToast('Conversation déplacée dans la corbeille');
        } catch (err: any) {
          showToast(err?.message || 'Échec du déplacement vers la corbeille');
        }
      },
    });
  };

  // MANDATORY USER CONFIRMATION: Batch Trash Operation
  const handleRequestBatchTrash = (selectedList: ParsedEmail[]) => {
    if (selectedList.length === 0) return;
    setConfirmationDialog({
      isOpen: true,
      title: `Déplacer ${selectedList.length} conversation(s) dans la corbeille`,
      message: `Êtes-vous sûr de vouloir déplacer ${selectedList.length} conversation(s) sélectionnée(s) dans la corbeille ?`,
      confirmLabel: 'Déplacer dans la corbeille',
      confirmStyle: 'danger',
      onConfirm: async () => {
        if (!token) return;
        try {
          await Promise.all(selectedList.map((m) => trashMessage(token, m.id)));
          const ids = new Set(selectedList.map((m) => m.id));
          setEmails((prev) => prev.filter((m) => !ids.has(m.id)));
          if (selectedEmail && ids.has(selectedEmail.id)) {
            setSelectedEmail(null);
          }
          showToast(`${selectedList.length} conversation(s) déplacée(s) dans la corbeille`);
        } catch (err: any) {
          showToast(err?.message || 'Échec de la suppression des conversations');
          handleRefresh();
        }
      },
    });
  };

  // MANDATORY USER CONFIRMATION: Send Email Operation
  const handleRequestSend = (opts: ComposeOptions) => {
    setConfirmationDialog({
      isOpen: true,
      title: 'Confirmation d\'envoi',
      message: `Êtes-vous sûr de vouloir envoyer ce courriel à "${opts.to}"${
        opts.cc ? ` (Cc: ${opts.cc})` : ''
      } avec l'objet "${opts.subject || '(Sans objet)'}" ?`,
      confirmLabel: 'Envoyer le message',
      confirmStyle: 'primary',
      onConfirm: async () => {
        if (!token) return;
        try {
          await sendMessage(token, opts);
          setIsComposeOpen(false);
          setComposeInitialData(undefined);
          showToast('Message envoyé avec succès');
          if (selectedLabelId === 'SENT') {
            handleRefresh();
          }
        } catch (err: any) {
          showToast(err?.message || 'Échec de l\'envoi du message');
        }
      },
    });
  };

  // Save Draft
  const handleSaveDraft = async (opts: ComposeOptions) => {
    if (!token) return;
    await saveDraft(token, opts);
    showToast('Brouillon enregistré dans Gmail');
    if (selectedLabelId === 'DRAFT') {
      handleRefresh();
    }
  };

  // Compose Reply / Forward helpers
  const handleOpenReply = (email: ParsedEmail, mode: 'reply' | 'replyAll' = 'reply') => {
    const replySubject = email.subject.startsWith('Re:')
      ? email.subject
      : `Re: ${email.subject}`;

    const isSentByMe = Boolean(
      (currentUserEmail && email.fromEmail?.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) ||
      email.labelIds?.includes('SENT') ||
      email.fromName?.toLowerCase() === 'moi'
    );
    let toAddr = isSentByMe ? (email.to || email.fromEmail) : email.fromEmail;
    let ccAddr = undefined;

    if (mode === 'replyAll') {
      const allParticipants = new Set<string>();
      if (email.fromEmail && !email.fromEmail.toLowerCase().includes(currentUserEmail.toLowerCase())) {
        allParticipants.add(email.fromEmail);
      }
      if (email.to) {
        email.to.split(',').forEach((s) => {
          const trimmed = s.trim();
          if (trimmed && !trimmed.toLowerCase().includes(currentUserEmail.toLowerCase())) {
            allParticipants.add(trimmed);
          }
        });
      }
      if (email.cc) {
        email.cc.split(',').forEach((s) => {
          const trimmed = s.trim();
          if (trimmed && !trimmed.toLowerCase().includes(currentUserEmail.toLowerCase())) {
            allParticipants.add(trimmed);
          }
        });
      }
      allParticipants.delete(email.fromEmail);
      ccAddr = Array.from(allParticipants).join(', ') || undefined;
    }

    const quotedBody = `\n\n\n---------- Message d'origine ----------\nDe : ${email.fromName} <${email.fromEmail}>\nDate : ${email.dateStr}\nObjet : ${email.subject}\nÀ : ${email.to}\n\n${email.bodyText || email.snippet}`;

    setComposeInitialData({
      to: toAddr,
      cc: ccAddr,
      subject: replySubject,
      body: quotedBody,
      threadId: email.threadId,
      inReplyTo: email.id,
      references: email.id,
    });
    setIsComposeOpen(true);
  };

  const handleOpenForward = (email: ParsedEmail) => {
    const forwardSubject = email.subject.startsWith('Fwd:')
      ? email.subject
      : `Fwd: ${email.subject}`;

    const quotedBody = `\n\n\n---------- Message transféré ----------\nDe : ${email.fromName} <${email.fromEmail}>\nDate : ${email.dateStr}\nObjet : ${email.subject}\nÀ : ${email.to}\n\n${email.bodyText || email.snippet}`;

    setComposeInitialData({
      to: '',
      subject: forwardSubject,
      body: quotedBody,
    });
    setIsComposeOpen(true);
  };

  // Label name resolution for header/list
  const selectedLabelObj = labels.find((l) => l.id === selectedLabelId);
  const selectedLabelName = selectedLabelObj
    ? selectedLabelObj.name
    : selectedLabelId === 'INBOX'
    ? 'Boîte de réception'
    : selectedLabelId === 'STARRED'
    ? 'Messages suivis'
    : selectedLabelId === 'SENT'
    ? 'Messages envoyés'
    : selectedLabelId === 'DRAFT'
    ? 'Brouillons'
    : selectedLabelId === 'SPAM'
    ? 'Spam'
    : selectedLabelId === 'TRASH'
    ? 'Corbeille'
    : selectedLabelId;

  const inboxLabel = labels.find((l) => l.id === 'INBOX');
  const calculatedUnread = emails.filter((m) => m.isUnread).length;
  const unreadCount = inboxLabel?.threadsUnread ?? inboxLabel?.messagesUnread ?? (calculatedUnread > 0 ? calculatedUnread : 0);
  const currentUserEmail = profile?.emailAddress || user?.email || 'me';

  // If user is not authenticated or token is not yet ready, render official sign-in prompt
  if (needsAuth || !token) {
    return (
      <SignInPrompt
        onSignIn={handleSignIn}
        isLoading={isLoggingIn}
        error={authError}
      />
    );
  }

  return (
    <div
      id="gmail-app-root"
      className={`flex h-screen w-screen flex-col overflow-hidden font-sans relative transition-colors duration-200 ${
        isDark ? 'bg-[#05070A] text-slate-300' : 'bg-slate-100 text-slate-800'
      }`}
    >
      {/* Ambient decorative glow */}
      {isDark && (
        <>
          <div className="pointer-events-none absolute top-[-60px] left-[-60px] w-[350px] h-[350px] bg-purple-950/20 blur-[120px]" />
          <div className="pointer-events-none absolute bottom-[-60px] right-[-60px] w-[350px] h-[350px] bg-cyan-950/20 blur-[120px]" />
        </>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div
          id="app-toast-notification"
          className={`fixed bottom-20 right-4 sm:right-6 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-xl px-4 py-3 text-xs font-mono font-medium shadow-xl animate-fade-in ${
            isDark
              ? 'bg-[#080B10] border border-cyan-500/40 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
              : 'bg-white border border-slate-300 text-slate-900 shadow-md'
          }`}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <Header
        user={user}
        profile={profile}
        accounts={accounts}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearSearch={() => {
          setSearchQuery('');
          setActiveSearch('');
        }}
        onSearchSubmit={handleSearchSubmit}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
        onSignOut={handleSignOut}
        onAddAccount={handleAddAccount}
        onSwitchAccount={handleSwitchAccount}
        onRemoveAccount={handleRemoveAccount}
        onRefresh={handleRefresh}
        isRefreshing={isLoadingEmails}
      />

      {/* Main Workspace Layout: Sidebar + List/Detail */}
      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Navigation Sidebar */}
        <Sidebar
          selectedLabelId={selectedLabelId}
          onSelectLabel={(id) => {
            setSelectedLabelId(id);
            setSelectedEmail(null);
            setActiveSearch('');
            setSearchQuery('');
          }}
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => {
            setSelectedCategory(cat);
            setSelectedEmail(null);
          }}
          categoryCounts={categoryCounts}
          labels={labels}
          onOpenCompose={() => {
            setComposeInitialData(undefined);
            setIsComposeOpen(true);
          }}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          unreadCount={unreadCount}
          onOpenContacts={() => setIsContactsOpen(true)}
          contactsCount={contactsCount}
          onOpenSignatures={() => setIsSignaturesOpen(true)}
          onOpenAgenda={() => {
            setSelectedLabelId('AGENDA');
            setSelectedEmail(null);
          }}
          agendaCount={agendaCount}
        />

        {/* Content Pane */}
        <main
          id="main-content-pane"
          className={`flex-1 overflow-hidden relative ${
            isDark ? 'bg-[#05070A]' : 'bg-slate-50'
          }`}
        >
          {selectedEmail ? (
            <EmailDetail
              email={selectedEmail}
              currentUserEmail={currentUserEmail}
              token={token}
              emailCategory={emailCategories[selectedEmail.id]}
              onUpdateEmailCategory={handleUpdateEmailCategory}
              onBack={() => setSelectedEmail(null)}
              onToggleStar={(em) => handleToggleStar(em)}
              onToggleUnread={(em) => handleToggleUnread(em)}
              onRequestTrash={(em) => handleRequestTrash(em)}
              onOpenReply={handleOpenReply}
              onOpenForward={handleOpenForward}
              onRequestSendQuickReply={handleRequestSend}
            />
          ) : selectedLabelId === 'AGENDA' ? (
            <AgendaView
              onBackToMailbox={() => {
                setSelectedLabelId('INBOX');
                setSelectedEmail(null);
              }}
            />
          ) : selectedLabelId === 'ATTACHMENTS' ? (
            <AttachmentExtractor
              token={token || ''}
              onOpenEmail={async (messageId) => {
                const found = emails.find((e) => e.id === messageId);
                if (found) {
                  setSelectedEmail(found);
                } else if (token) {
                  try {
                    const res = await fetch(
                      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
                      {
                        headers: { Authorization: `Bearer ${token}` },
                      }
                    );
                    if (res.ok) {
                      const raw = await res.json();
                      setSelectedEmail(parseRawMessage(raw));
                    }
                  } catch (err) {
                    console.error('Could not load email detail', err);
                  }
                }
              }}
            />
          ) : (
            <EmailList
              emails={emails}
              isLoading={isLoadingEmails}
              selectedLabelName={activeSearch ? `Recherche : "${activeSearch}"` : selectedLabelName}
              selectedLabelId={selectedLabelId}
              currentUserEmail={currentUserEmail}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              emailCategories={emailCategories}
              onUpdateEmailCategory={handleUpdateEmailCategory}
              onSelectEmail={handleSelectEmail}
              onRefresh={handleRefresh}
              onToggleStar={handleToggleStar}
              onToggleUnread={handleToggleUnread}
              onRequestTrash={handleRequestTrash}
              onRequestBatchTrash={handleRequestBatchTrash}
              onBatchMarkRead={handleBatchMarkRead}
              hasPrevPage={pageIndex > 0}
              hasNextPage={Boolean(nextPageToken)}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
              pageIndex={pageIndex}
              statusFilter={statusFilter}
              onStatusFilterChange={handleStatusFilterChange}
            />
          )}
        </main>
      </div>

      {/* Immersive UI Telemetry Footer */}
      <footer
        className={`h-8 border-t flex items-center px-4 sm:px-6 justify-between text-[10px] uppercase tracking-[0.18em] shrink-0 font-mono select-none z-20 transition-colors ${
          isDark
            ? 'bg-[#040609] border-slate-800 text-slate-500'
            : 'bg-white border-slate-200 text-slate-500'
        }`}
      >
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
            <span>RELAIS : ACTIF</span>
          </div>
          <span className="hidden sm:inline text-slate-400">SERVICE : API_GMAIL</span>
          <span className="hidden md:inline text-slate-400">IA : GEMINI ACTIVE</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={isDark ? 'text-cyan-400/80' : 'text-cyan-600'}>LIAISON CHIFFRÉE</span>
          <div className={`w-2 h-2 border rounded-xs rotate-45 ${isDark ? 'border-slate-700' : 'border-slate-400'}`} />
        </div>
      </footer>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        currentUserEmail={currentUserEmail}
        initialData={composeInitialData}
        onClose={() => {
          setIsComposeOpen(false);
          setComposeInitialData(undefined);
        }}
        onRequestSend={handleRequestSend}
        onRequestSaveDraft={handleSaveDraft}
        onOpenSignatureSettings={() => setIsSignaturesOpen(true)}
      />

      {/* Contacts Manager Modal */}
      <ContactsManagerModal
        isOpen={isContactsOpen}
        onClose={() => setIsContactsOpen(false)}
        emailsForImport={emails}
        emailCategoryMap={emailCategories}
        currentUserEmail={currentUserEmail}
        onSelectContactToCompose={(recipientEmail) => {
          setComposeInitialData({ to: recipientEmail });
          setIsComposeOpen(true);
        }}
      />

      {/* Signature Settings Modal */}
      <SignatureSettingsModal
        isOpen={isSignaturesOpen}
        onClose={() => setIsSignaturesOpen(false)}
        currentUserEmail={currentUserEmail}
      />

      {/* Destructive Operation Safeguard Modal (Mandatory Workspace Skill Rule) */}
      <ConfirmationModal
        dialog={confirmationDialog}
        onClose={() => setConfirmationDialog(null)}
      />

      {/* Floating Theme Toggle (Bottom Right as requested by user) */}
      <ThemeToggle />
    </div>
  );
}
