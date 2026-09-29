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
  deleteMessage,
  batchDeleteMessages,
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
import { AccountTabs } from './components/AccountTabs';
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
import {
  getPendingTasksCount,
  checkAndNotifyAgendaTasks,
  importGoogleCalendarEvents,
  importEmailCalendarInvites,
} from './services/agendaService';
import {
  notifyNewEmail,
  getKnownEmailIds,
  saveKnownEmailIds,
} from './services/notificationService';
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
  const [contactsCount, setContactsCount] = useState(() => getLocalContacts(user?.email || undefined).length);
  const [agendaCount, setAgendaCount] = useState(() => getPendingTasksCount(user?.email || undefined));
  const [composeInitialData, setComposeInitialData] = useState<Partial<ComposeOptions> | undefined>(undefined);
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmationDialogState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isGmailApiDisabled, setIsGmailApiDisabled] = useState(false);
  const initialLoadDoneRef = React.useRef(false);

  const [isTokenExpired, setIsTokenExpired] = useState(false);

  // Sync contacts count and agenda count when user changes
  useEffect(() => {
    setContactsCount(getLocalContacts(user?.email || undefined).length);
    setAgendaCount(getPendingTasksCount(user?.email || undefined));
    if (user?.email) {
      checkAndNotifyAgendaTasks(user.email);
    }
  }, [user?.email]);

  // Sync contacts count, agenda count & listen for auth expiry / API disabled events
  useEffect(() => {
    const handleUpdate = () => {
      setContactsCount(getLocalContacts(user?.email || undefined).length);
    };
    const handleAgendaUpdate = () => {
      setAgendaCount(getPendingTasksCount(user?.email || undefined));
    };
    const handleAuthExpired = (e: any) => {
      const msg =
        e?.detail?.message ||
        'Jeton d\'accès Google à renouveler. Vos comptes et vos données restent intégralement enregistrés.';
      setIsTokenExpired(true);
      setAuthError(msg);
      showToast('Jeton Google à renouveler - Compte conservé');
    };
    const handleApiDisabled = () => {
      setIsGmailApiDisabled(true);
    };

    window.addEventListener('gmail-contacts-updated', handleUpdate);
    window.addEventListener('gmail-agenda-updated', handleAgendaUpdate);
    window.addEventListener('gmail-auth-expired', handleAuthExpired);
    window.addEventListener('gmail-api-disabled', handleApiDisabled);
    return () => {
      window.removeEventListener('gmail-contacts-updated', handleUpdate);
      window.removeEventListener('gmail-agenda-updated', handleAgendaUpdate);
      window.removeEventListener('gmail-auth-expired', handleAuthExpired);
      window.removeEventListener('gmail-api-disabled', handleApiDisabled);
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
        setIsTokenExpired(false);
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
      targetPageToken: string = '',
      silent: boolean = false
    ) => {
      try {
        if (!silent) {
          setIsLoadingEmails(true);
        }
        const params: any = {
          maxResults: 50,
          pageToken: targetPageToken || undefined,
        };

        const queryParts: string[] = [];
        const cleanSearch = search.trim();

        if (cleanSearch) {
          // Gmail API search: searches across all message contents, bodies, subjects and senders
          queryParts.push(cleanSearch);

          if (filter === 'unread') {
            queryParts.push('is:unread');
          } else if (filter === 'starred') {
            queryParts.push('is:starred');
          }

          // Do not restrict to labelIds when searching so Gmail searches all mail contents
          params.query = queryParts.join(' ');
        } else {
          // Standard Gmail system folders mapping
          params.labelIds = [labelId];
          if (filter === 'unread') {
            params.query = 'is:unread';
          } else if (filter === 'starred' && labelId !== 'STARRED') {
            params.query = 'is:starred';
          }
        }

        const res = await listMessages(activeToken, params, user?.email || undefined);
        setEmails(res.emails);
        setNextPageToken(res.nextPageToken);
        setIsGmailApiDisabled(false);

        // Detect new unread emails for instant audio chime & OS notification on PC & phone
        const knownIds = getKnownEmailIds(user?.email || undefined);
        if (initialLoadDoneRef.current && res.emails && res.emails.length > 0) {
          const newUnreadEmails = res.emails.filter(
            (em) => em.isUnread && !knownIds.has(em.id)
          );
          if (newUnreadEmails.length > 0) {
            const latestNew = newUnreadEmails[0];
            notifyNewEmail(latestNew, () => {
              setSelectedEmail(latestNew);
            });
            showToast(`🔔 Nouveau message de ${latestNew.fromName || latestNew.fromEmail}`);
          }
        }
        res.emails.forEach((em) => knownIds.add(em.id));
        saveKnownEmailIds(knownIds, user?.email || undefined);
        initialLoadDoneRef.current = true;
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
        } else if (!silent) {
          showToast(msg);
        }
      } finally {
        if (!silent) {
          setIsLoadingEmails(false);
        }
      }
    },
    [user?.email]
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
  }, [token, user?.email, selectedLabelId, activeSearch, statusFilter, loadMessages]);

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

  // Background auto-polling for incoming messages every 35s
  useEffect(() => {
    if (!token || selectedLabelId === 'ATTACHMENTS' || selectedLabelId === 'AGENDA') return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isLoadingEmails) {
        const currentToken = pageTokens[pageIndex] || '';
        loadMessages(token, selectedLabelId, activeSearch, statusFilter, currentToken, true);
        loadProfileAndLabels(token);
      }
    }, 35000);

    return () => clearInterval(interval);
  }, [token, selectedLabelId, activeSearch, statusFilter, pageIndex, pageTokens, isLoadingEmails, loadMessages, loadProfileAndLabels]);

  // Live search debounce like Gmail
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setActiveSearch('');
      return;
    }
    const timer = setTimeout(() => {
      setActiveSearch(searchQuery.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search handler (immediate on Enter or form submit)
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery.trim());
  };

  // Auto-import Google Calendar events into Agenda tasks for current user
  useEffect(() => {
    if (!token) return;
    importGoogleCalendarEvents(token, user?.email || undefined).then(() => {
      setAgendaCount(getPendingTasksCount(user?.email || undefined));
    });
  }, [token, user?.email]);

  // Update email categories & scan for calendar invites when new emails are fetched
  useEffect(() => {
    if (emails.length === 0) return;
    importContactsFromParsedEmails(emails, emailCategories, profile?.emailAddress);
    importEmailCalendarInvites(emails, user?.email || undefined);
    checkAndNotifyAgendaTasks(user?.email || undefined);

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

    // Instantly update STARRED label counter
    setLabels((prevLabels) =>
      prevLabels.map((lbl) => {
        if (lbl.id === 'STARRED') {
          const delta = newStarred ? 1 : -1;
          const curTotal = typeof lbl.threadsTotal === 'number' ? lbl.threadsTotal : (lbl.messagesTotal || 0);
          return {
            ...lbl,
            threadsTotal: Math.max(0, curTotal + delta),
            messagesTotal: Math.max(0, curTotal + delta),
          };
        }
        return lbl;
      })
    );

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

  // MANDATORY USER CONFIRMATION: Single Trash / Permanent Delete Operation
  const handleRequestTrash = (email: ParsedEmail, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isInTrash = selectedLabelId === 'TRASH' || email.labelIds?.includes('TRASH');

    setConfirmationDialog({
      isOpen: true,
      title: isInTrash
        ? 'Supprimer définitivement la conversation'
        : 'Déplacer la conversation dans la corbeille',
      message: isInTrash
        ? `Êtes-vous sûr de vouloir supprimer DÉFINITIVEMENT "${
            email.subject || '(Sans objet)'
          }" ? Cette action est irréversible.`
        : `Êtes-vous sûr de vouloir déplacer la conversation "${
            email.subject || '(Sans objet)'
          }" de ${email.fromName || email.fromEmail} dans la corbeille ?`,
      confirmLabel: isInTrash ? 'Supprimer définitivement' : 'Déplacer dans la corbeille',
      confirmStyle: 'danger',
      onConfirm: async () => {
        if (!token) return;
        try {
          if (isInTrash) {
            await deleteMessage(token, email.id);
            showToast('Conversation supprimée définitivement');
          } else {
            await trashMessage(token, email.id);
            showToast('Conversation déplacée dans la corbeille');
          }
          setEmails((prev) => prev.filter((m) => m.id !== email.id));
          if (selectedEmail?.id === email.id) {
            setSelectedEmail(null);
          }

          // Instantly update label counters across sidebar
          setLabels((prevLabels) =>
            prevLabels.map((lbl) => {
              if (
                lbl.id === selectedLabelId ||
                (email.labelIds && email.labelIds.includes(lbl.id))
              ) {
                const curTotal = typeof lbl.threadsTotal === 'number' ? lbl.threadsTotal : (lbl.messagesTotal || 1);
                const curUnread = typeof lbl.threadsUnread === 'number' ? lbl.threadsUnread : (lbl.messagesUnread || 0);
                const deltaUnread = email.isUnread ? -1 : 0;
                return {
                  ...lbl,
                  threadsTotal: Math.max(0, curTotal - 1),
                  messagesTotal: Math.max(0, curTotal - 1),
                  threadsUnread: Math.max(0, curUnread + deltaUnread),
                  messagesUnread: Math.max(0, curUnread + deltaUnread),
                };
              }
              if (!isInTrash && lbl.id === 'TRASH') {
                const curTotal = typeof lbl.threadsTotal === 'number' ? lbl.threadsTotal : (lbl.messagesTotal || 0);
                return {
                  ...lbl,
                  threadsTotal: curTotal + 1,
                  messagesTotal: curTotal + 1,
                };
              }
              return lbl;
            })
          );

          loadProfileAndLabels(token);
        } catch (err: any) {
          showToast(err?.message || (isInTrash ? 'Échec de la suppression définitive' : 'Échec du déplacement vers la corbeille'));
        }
      },
    });
  };

  // MANDATORY USER CONFIRMATION: Batch Trash / Permanent Delete Operation
  const handleRequestBatchTrash = (selectedList: ParsedEmail[]) => {
    if (selectedList.length === 0) return;
    const isInTrash = selectedLabelId === 'TRASH';

    setConfirmationDialog({
      isOpen: true,
      title: isInTrash
        ? `Supprimer définitivement ${selectedList.length} conversation(s)`
        : `Déplacer ${selectedList.length} conversation(s) dans la corbeille`,
      message: isInTrash
        ? `Êtes-vous sûr de vouloir supprimer DÉFINITIVEMENT ${selectedList.length} conversation(s) sélectionnée(s) de la corbeille ? Cette action est irréversible.`
        : `Êtes-vous sûr de vouloir déplacer ${selectedList.length} conversation(s) sélectionnée(s) dans la corbeille ?`,
      confirmLabel: isInTrash ? 'Supprimer définitivement' : 'Déplacer dans la corbeille',
      confirmStyle: 'danger',
      onConfirm: async () => {
        if (!token) return;
        try {
          const ids = selectedList.map((m) => m.id);
          if (isInTrash) {
            await batchDeleteMessages(token, ids);
            showToast(`${selectedList.length} conversation(s) supprimée(s) définitivement`);
          } else {
            await Promise.all(selectedList.map((m) => trashMessage(token, m.id)));
            showToast(`${selectedList.length} conversation(s) déplacée(s) dans la corbeille`);
          }
          const idSet = new Set(ids);
          setEmails((prev) => prev.filter((m) => !idSet.has(m.id)));
          if (selectedEmail && idSet.has(selectedEmail.id)) {
            setSelectedEmail(null);
          }

          const unreadCountInBatch = selectedList.filter((m) => m.isUnread).length;
          const totalCountInBatch = selectedList.length;

          // Instantly update current folder and TRASH counters
          setLabels((prevLabels) =>
            prevLabels.map((lbl) => {
              if (
                lbl.id === selectedLabelId ||
                selectedList.some((m) => m.labelIds?.includes(lbl.id))
              ) {
                const curTotal = typeof lbl.threadsTotal === 'number' ? lbl.threadsTotal : (lbl.messagesTotal || totalCountInBatch);
                const curUnread = typeof lbl.threadsUnread === 'number' ? lbl.threadsUnread : (lbl.messagesUnread || 0);
                return {
                  ...lbl,
                  threadsTotal: Math.max(0, curTotal - totalCountInBatch),
                  messagesTotal: Math.max(0, curTotal - totalCountInBatch),
                  threadsUnread: Math.max(0, curUnread - unreadCountInBatch),
                  messagesUnread: Math.max(0, curUnread - unreadCountInBatch),
                };
              }
              if (!isInTrash && lbl.id === 'TRASH') {
                const curTotal = typeof lbl.threadsTotal === 'number' ? lbl.threadsTotal : (lbl.messagesTotal || 0);
                return {
                  ...lbl,
                  threadsTotal: curTotal + totalCountInBatch,
                  messagesTotal: curTotal + totalCountInBatch,
                };
              }
              return lbl;
            })
          );

          loadProfileAndLabels(token);
        } catch (err: any) {
          showToast(err?.message || 'Échec de l\'opération');
          handleRefresh();
        }
      },
    });
  };

  // EMPTY ENTIRE TRASH OPERATION
  const handleEmptyTrash = () => {
    if (emails.length === 0) return;
    setConfirmationDialog({
      isOpen: true,
      title: 'Vider la corbeille',
      message: `Êtes-vous sûr de vouloir vider l'ensemble des ${emails.length} message(s) de la corbeille ? Tous les messages seront supprimés DÉFINITIVEMENT. Cette action est irréversible.`,
      confirmLabel: 'Vider la corbeille définitivement',
      confirmStyle: 'danger',
      onConfirm: async () => {
        if (!token) return;
        try {
          const ids = emails.map((e) => e.id);
          await batchDeleteMessages(token, ids);
          setEmails([]);
          setSelectedEmail(null);
          setLabels((prevLabels) =>
            prevLabels.map((lbl) =>
              lbl.id === 'TRASH'
                ? { ...lbl, threadsTotal: 0, messagesTotal: 0, threadsUnread: 0, messagesUnread: 0 }
                : lbl
            )
          );
          showToast('Corbeille vidée avec succès');
          loadProfileAndLabels(token);
        } catch (err: any) {
          showToast(err?.message || 'Échec du vidage de la corbeille');
          handleRefresh();
        }
      },
    });
  };

  // EMPTY ENTIRE SPAM OPERATION
  const handleEmptySpam = () => {
    if (emails.length === 0) return;
    setConfirmationDialog({
      isOpen: true,
      title: 'Supprimer tous les spams',
      message: `Êtes-vous sûr de vouloir supprimer DÉFINITIVEMENT l'ensemble des ${emails.length} message(s) de spam ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer tous les spams définitivement',
      confirmStyle: 'danger',
      onConfirm: async () => {
        if (!token) return;
        try {
          const ids = emails.map((e) => e.id);
          await batchDeleteMessages(token, ids);
          setEmails([]);
          setSelectedEmail(null);
          setLabels((prevLabels) =>
            prevLabels.map((lbl) =>
              lbl.id === 'SPAM'
                ? { ...lbl, threadsTotal: 0, messagesTotal: 0, threadsUnread: 0, messagesUnread: 0 }
                : lbl
            )
          );
          showToast('Dossier Spam vidé avec succès');
          loadProfileAndLabels(token);
        } catch (err: any) {
          showToast(err?.message || 'Échec de la suppression des spams');
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
          loadProfileAndLabels(token);
          handleRefresh();
          window.dispatchEvent(
            new CustomEvent('gmail-message-sent', { detail: { threadId: opts.threadId } })
          );
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
    const forwardSubject = email.subject.startsWith('Fwd:') || email.subject.startsWith('Tr:')
      ? email.subject
      : `Tr: ${email.subject}`;

    const quotedBody = `\n\n\n---------- Message transféré ----------\nDe : ${email.fromName || email.fromEmail} <${email.fromEmail}>\nDate : ${email.dateStr}\nObjet : ${email.subject}\nÀ : ${email.to}\n\n${email.bodyText || email.snippet}`;

    setComposeInitialData({
      to: '',
      subject: forwardSubject,
      body: quotedBody,
      threadId: email.threadId,
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
      className={`flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden font-sans relative transition-colors duration-200 min-h-0 ${
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
        emails={emails}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearSearch={() => {
          setSearchQuery('');
          setActiveSearch('');
        }}
        onSearchSubmit={handleSearchSubmit}
        onSelectContactFilter={(contactEmail) => {
          setActiveSearch(contactEmail);
        }}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
        onSignOut={handleSignOut}
        onAddAccount={handleAddAccount}
        onSwitchAccount={handleSwitchAccount}
        onRemoveAccount={handleRemoveAccount}
        onRefresh={handleRefresh}
        isRefreshing={isLoadingEmails}
      />

      {/* Connected Accounts Tabs Ribbon */}
      <AccountTabs
        accounts={accounts}
        activeUser={user}
        unreadCount={unreadCount}
        onSwitchAccount={handleSwitchAccount}
        onAddAccount={handleAddAccount}
        onRemoveAccount={handleRemoveAccount}
        onSignOut={handleSignOut}
        isAdding={isLoggingIn}
      />

      {/* Token Expired Soft Renewal Banner - Accounts are NEVER automatically disconnected */}
      {isTokenExpired && (
        <div className="bg-cyan-950/90 border-b border-cyan-500/40 px-3 sm:px-4 py-2 text-cyan-200 flex items-center justify-between text-xs shrink-0 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1 rounded bg-cyan-500/20 text-cyan-300 font-bold shrink-0">🔑 Jeton Google</span>
            <span className="truncate">
              Jeton d'accès à rafraîchir pour <strong>{user?.email || 'votre compte'}</strong>. Tous vos comptes et données sont conservés.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isLoggingIn}
              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition shadow-xs cursor-pointer text-xs"
            >
              {isLoggingIn ? 'Connexion...' : 'Renouveler le jeton'}
            </button>
            <button
              type="button"
              onClick={() => setIsTokenExpired(false)}
              title="Masquer cette bannière"
              className="p-1 hover:bg-cyan-500/20 text-cyan-300 rounded transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Gmail API Disabled Warning Banner */}
      {isGmailApiDisabled && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 sm:px-4 py-2 text-amber-200 flex items-center justify-between text-xs shrink-0 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1 rounded bg-amber-500/20 text-amber-400 font-bold shrink-0">⚠️ API Gmail</span>
            <span className="truncate">
              L'API Gmail n'est pas activée sur votre projet Google Cloud.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              type="button"
              onClick={() => {
                setIsGmailApiDisabled(false);
                if (token) loadMessages(token, selectedLabelId, activeSearch, statusFilter, '');
              }}
              className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold rounded border border-amber-500/40 transition shadow-xs cursor-pointer text-xs"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => setIsGmailApiDisabled(false)}
              title="Masquer cette bannière"
              className="p-1 hover:bg-amber-500/20 text-amber-300 rounded transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Layout: Sidebar + List/Detail */}
      <div className="flex flex-1 overflow-hidden relative z-10 min-h-0 w-full">
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
          onSignOut={handleSignOut}
        />

        {/* Content Pane */}
        <main
          id="main-content-pane"
          className={`flex-1 overflow-hidden relative min-h-0 flex flex-col w-full ${
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
              key={currentUserEmail || 'agenda-view'}
              currentUserEmail={currentUserEmail}
              accessToken={token || ''}
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
              onEmptyTrash={handleEmptyTrash}
              onEmptySpam={handleEmptySpam}
            />
          )}
        </main>
      </div>

      {/* Immersive UI Telemetry Footer (Hidden on mobile for maximum viewable area) */}
      <footer
        className={`hidden sm:flex h-7 border-t items-center px-4 sm:px-6 justify-between text-[10px] uppercase tracking-[0.18em] shrink-0 font-mono select-none z-20 transition-colors ${
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
