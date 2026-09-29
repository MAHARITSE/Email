import { GmailLabel, GmailProfile, GmailRawMessage, ParsedEmail, EmailAttachment } from '../types/gmail';
import JSZip from 'jszip';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function decodeBase64Url(base64UrlStr: string): string {
  if (!base64UrlStr) return '';
  try {
    let base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (err) {
    console.warn('Failed to decode base64url content', err);
    return '';
  }
}

export function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function parseHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
  if (!headers) return '';
  const match = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return match ? match.value : '';
}

export function parseSender(fromHeader: string): { name: string; email: string } {
  if (!fromHeader) return { name: 'Inconnu', email: '' };
  const match = fromHeader.match(/^(.*?)\s*<(.+?)>$/);
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, '').trim();
    return { name: name || match[2], email: match[2].trim() };
  }
  return { name: fromHeader.trim(), email: fromHeader.trim() };
}

export function extractEmailContent(payload: GmailRawMessage['payload']): { bodyHtml: string; bodyText: string } {
  let bodyHtml = '';
  let bodyText = '';

  function inspectPart(part: any) {
    if (!part) return;
    if (part.mimeType === 'text/html' && part.body?.data) {
      bodyHtml = decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/plain' && part.body?.data && !bodyText) {
      bodyText = decodeBase64Url(part.body.data);
    }

    if (Array.isArray(part.parts)) {
      for (const sub of part.parts) {
        inspectPart(sub);
      }
    }
  }

  if (payload.body?.data) {
    if (payload.mimeType === 'text/html') {
      bodyHtml = decodeBase64Url(payload.body.data);
    } else {
      bodyText = decodeBase64Url(payload.body.data);
    }
  }

  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      inspectPart(part);
    }
  }

  return { bodyHtml, bodyText };
}

export function extractAttachments(
  payload: GmailRawMessage['payload'],
  messageId: string,
  emailMeta: {
    subject: string;
    fromName: string;
    fromEmail: string;
    dateStr: string;
    internalDate: string;
  }
): EmailAttachment[] {
  const attachments: EmailAttachment[] = [];
  let partIndex = 0;

  function traverse(part: any) {
    if (!part) return;
    const filename = part.filename?.trim() || '';

    // Extract Content-ID header for inline CID images
    const contentIdHeader = parseHeader(part.headers, 'Content-ID') || parseHeader(part.headers, 'Content-Id');
    const contentId = contentIdHeader ? contentIdHeader.replace(/^<|>$/g, '').trim() : undefined;

    const isImagePart = part.mimeType?.toLowerCase().startsWith('image/');
    const isAttachmentOrInline =
      (filename && filename.length > 0) ||
      Boolean(contentId) ||
      (isImagePart && Boolean(part.body?.attachmentId));

    if (isAttachmentOrInline) {
      const generatedFilename = filename || (contentId ? `inline_${contentId}` : `image_${partIndex++}.png`);
      attachments.push({
        id: `${messageId}_${part.body?.attachmentId || part.partId || contentId || partIndex++}`,
        messageId,
        attachmentId: part.body?.attachmentId,
        partId: part.partId,
        contentId,
        filename: generatedFilename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body?.size || 0,
        dateStr: emailMeta.dateStr,
        internalDate: emailMeta.internalDate,
        emailSubject: emailMeta.subject,
        fromName: emailMeta.fromName,
        fromEmail: emailMeta.fromEmail,
        data: part.body?.data,
      });
    }

    if (Array.isArray(part.parts)) {
      for (const sub of part.parts) {
        traverse(sub);
      }
    }
  }

  traverse(payload);
  return attachments;
}

export function parseRawMessage(msg: GmailRawMessage): ParsedEmail {
  const headers = msg.payload?.headers || [];
  const subject = parseHeader(headers, 'Subject') || '(Sans objet)';
  const fromHeader = parseHeader(headers, 'From');
  const { name: fromName, email: fromEmail } = parseSender(fromHeader);
  const to = parseHeader(headers, 'To');
  const cc = parseHeader(headers, 'Cc') || undefined;
  const dateHeader = parseHeader(headers, 'Date');

  let dateStr = dateHeader;
  try {
    const timestamp = parseInt(msg.internalDate, 10);
    if (!isNaN(timestamp)) {
      const d = new Date(timestamp);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        dateStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      } else if (d.getFullYear() === now.getFullYear()) {
        dateStr = d.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
      } else {
        dateStr = d.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }
  } catch {
    dateStr = dateHeader || '';
  }

  const labelIds = msg.labelIds || [];
  const isUnread = labelIds.includes('UNREAD');
  const isStarred = labelIds.includes('STARRED');
  const { bodyHtml, bodyText } = extractEmailContent(msg.payload);
  const attachments = extractAttachments(msg.payload, msg.id, {
    subject,
    fromName,
    fromEmail,
    dateStr,
    internalDate: msg.internalDate,
  });

  return {
    id: msg.id,
    threadId: msg.threadId,
    labelIds,
    snippet: msg.snippet || '',
    internalDate: msg.internalDate,
    dateStr,
    subject,
    fromName,
    fromEmail,
    to,
    cc,
    isUnread,
    isStarred,
    bodyHtml,
    bodyText,
    attachments,
  };
}

export function notifyIfAuthError(status: number, message?: string) {
  if (
    message &&
    (message.toLowerCase().includes('has not been used in project') ||
      message.toLowerCase().includes('is disabled') ||
      message.toLowerCase().includes('access_not_configured') ||
      message.toLowerCase().includes('gmail api has not been enabled'))
  ) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gmail-api-disabled', {
          detail: { message },
        })
      );
    }
    return;
  }

  // Only trigger session expiration for genuine 401 unauthenticated or explicit token expiry
  const isAuthExpired =
    status === 401 ||
    (message &&
      (message.toLowerCase().includes('invalid authentication credentials') ||
        message.toLowerCase().includes('oauth 2 access token') ||
        message.toLowerCase().includes('unauthenticated') ||
        message.toLowerCase().includes('token expired') ||
        message.toLowerCase().includes('login cookie')));

  if (isAuthExpired) {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem('gmail_net_oauth_access_token');
      } catch {}
      window.dispatchEvent(
        new CustomEvent('gmail-auth-expired', {
          detail: {
            message:
              'Votre session Google a expiré (jeton OAuth expiré ou révoqué). Veuillez vous reconnecter en un clic pour actualiser vos e-mails.',
          },
        })
      );
    }
  }
}

export function getMockFallbackProfile(): GmailProfile {
  return {
    emailAddress: 'maharitse@gmail.com',
    messagesTotal: 3,
    threadsTotal: 3,
    historyId: '1001',
  };
}

export function getMockFallbackLabels(): GmailLabel[] {
  return [
    { id: 'INBOX', name: 'INBOX', type: 'system', messagesUnread: 2, threadsUnread: 2 },
    { id: 'STARRED', name: 'STARRED', type: 'system', messagesUnread: 0, threadsUnread: 0 },
    { id: 'SENT', name: 'SENT', type: 'system' },
    { id: 'DRAFT', name: 'DRAFT', type: 'system' },
    { id: 'SPAM', name: 'SPAM', type: 'system' },
    { id: 'TRASH', name: 'TRASH', type: 'system' },
  ];
}

export function getMockFallbackEmails(_userEmail?: string): ParsedEmail[] {
  // Never display fake/mock emails - only load real emails from active mailbox
  return [];
}

export async function fetchProfile(token: string): Promise<GmailProfile> {
  try {
    const res = await fetch(`${GMAIL_BASE}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const msg = errJson?.error?.message || `Échec du chargement du profil Gmail (${res.status})`;
      notifyIfAuthError(res.status, msg);
      throw new Error(msg);
    }
    return res.json();
  } catch (err: any) {
    if (err?.message && (err.message.includes('401') || err.message.includes('403'))) {
      throw err;
    }
    console.warn('Network or API error fetching profile, using fallback:', err);
    return getMockFallbackProfile();
  }
}

export async function fetchLabels(token: string): Promise<GmailLabel[]> {
  try {
    const res = await fetch(`${GMAIL_BASE}/labels`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const msg = errJson?.error?.message || `Échec du chargement des libellés (${res.status})`;
      notifyIfAuthError(res.status, msg);
      throw new Error(msg);
    }
    const data = await res.json();
    const rawLabels: GmailLabel[] = data.labels || [];

    // Fetch full details (including threadsUnread, messagesUnread, threadsTotal, messagesTotal)
    // ONLY for the main system folders. Les libellés personnalisés n'affichent pas de
    // compteur : récupérer leurs détails multipliait les requêtes à chaque sync.
    const mainFolderIds = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'UNREAD', 'IMPORTANT'];

    const detailed = await Promise.all(
      rawLabels.map(async (l) => {
        if (mainFolderIds.includes(l.id)) {
          try {
            const detailRes = await fetch(`${GMAIL_BASE}/labels/${l.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (detailRes.ok) {
              const detail = await detailRes.json();
              return { ...l, ...detail };
            }
          } catch {
            // fallback to base label
          }
        }
        return l;
      })
    );

    return detailed;
  } catch (err: any) {
    if (err?.message && (err.message.includes('401') || err.message.includes('403'))) {
      throw err;
    }
    console.warn('Network or API error fetching labels, using fallback:', err);
    return getMockFallbackLabels();
  }
}

export interface ListMessagesParams {
  query?: string;
  labelIds?: string[];
  pageToken?: string;
  maxResults?: number;
  /**
   * Réutilise les conversations déjà téléchargées (refresh silencieux).
   * Évite de re-télécharger 50 conversations à chaque synchronisation.
   */
  useCache?: boolean;
  /**
   * Conversations réellement modifiées depuis le dernier sync (issues de l'API History).
   * Celles-ci sont obligatoirement re-téléchargées, les autres viennent du cache.
   */
  changedThreadIds?: Set<string> | null;
}

export interface ListMessagesResponse {
  emails: ParsedEmail[];
  nextPageToken?: string;
  resultSizeEstimate: number;
  /** Nombre de conversations réellement re-téléchargées (0 = tout venait du cache). */
  fetchedFromApi?: number;
}

/* -------------------------------------------------------------------------- */
/* CACHE LOCAL DES CONVERSATIONS                                               */
/* -------------------------------------------------------------------------- */

const THREAD_CACHE_TTL_MS = 10 * 60 * 1000;
const THREAD_CACHE_MAX_ENTRIES = 800;
const THREAD_FETCH_CONCURRENCY = 6;

interface ThreadCacheEntry {
  messages: ParsedEmail[];
  fetchedAt: number;
}

const threadCache = new Map<string, ThreadCacheEntry>();
/** Index messageId -> threadId (utilisé par la synchro History). */
const messageThreadIndex = new Map<string, string>();

function rememberThread(threadId: string, messages: ParsedEmail[]) {
  if (threadCache.size > THREAD_CACHE_MAX_ENTRIES) {
    threadCache.clear();
  }
  threadCache.set(threadId, { messages, fetchedAt: Date.now() });
  messages.forEach((m) => messageThreadIndex.set(m.id, threadId));
}

/** Invalide une ou plusieurs conversations (ou tout le cache si aucun id fourni). */
export function invalidateThreadCache(threadIds?: Iterable<string>) {
  if (!threadIds) {
    threadCache.clear();
    return;
  }
  for (const id of threadIds) {
    threadCache.delete(id);
  }
}

export function clearThreadCache() {
  threadCache.clear();
  messageThreadIndex.clear();
}

export function getThreadIdForMessage(messageId: string): string | undefined {
  return messageThreadIndex.get(messageId);
}

/** Exécute un traitement asynchrone avec une concurrence limitée (évite les 429). */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

async function fetchThreadMessages(token: string, threadId: string): Promise<ParsedEmail[]> {
  const threadRes = await fetch(`${GMAIL_BASE}/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!threadRes.ok) return [];
  const threadData = await threadRes.json();
  const rawMsgs: GmailRawMessage[] = threadData.messages || [];
  return rawMsgs.map((m) => parseRawMessage(m));
}

/**
 * Repli fiable pour la CORBEILLE et le SPAM : interroge directement les messages
 * (et non les conversations). Certains comptes renvoient des conversations dont
 * aucun message ne porte le libellé TRASH, ce qui affichait "corbeille vide"
 * alors que le compteur indiquait des éléments.
 */
async function listMessagesByQuery(
  token: string,
  query: string,
  maxResults: number,
  pageToken?: string
): Promise<ListMessagesResponse> {
  const url = new URL(`${GMAIL_BASE}/messages`);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('includeSpamTrash', 'true');
  if (query) url.searchParams.set('q', query);
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const msg = errJson?.error?.message || `Failed to list messages (${res.status})`;
    notifyIfAuthError(res.status, msg);
    throw new Error(msg);
  }

  const data = await res.json();
  const items: { id: string }[] = data.messages || [];
  const emails: ParsedEmail[] = [];

  await mapWithConcurrency(items, THREAD_FETCH_CONCURRENCY, async (item) => {
    try {
      const msgRes = await fetch(`${GMAIL_BASE}/messages/${item.id}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!msgRes.ok) return;
      const raw: GmailRawMessage = await msgRes.json();
      const parsed = parseRawMessage(raw);
      emails.push(parsed);
      if (parsed.threadId) messageThreadIndex.set(parsed.id, parsed.threadId);
    } catch {
      // ignore un message illisible
    }
  });

  return {
    emails,
    nextPageToken: data.nextPageToken,
    resultSizeEstimate: data.resultSizeEstimate || emails.length,
  };
}

export async function listMessages(
  token: string,
  params: ListMessagesParams = {},
  userEmail?: string
): Promise<ListMessagesResponse> {
  try {
    const requestedMax = params.maxResults || 50;
    const isTrash =
      params.labelIds?.includes('TRASH') ||
      Boolean(params.query && (params.query.toLowerCase().includes('in:trash') || params.query.toLowerCase().includes('is:trash')));

    const isSpam =
      params.labelIds?.includes('SPAM') ||
      Boolean(params.query && (params.query.toLowerCase().includes('in:spam') || params.query.toLowerCase().includes('is:spam')));

    const isSpamOrTrash = isTrash || isSpam;

    // Fetch conversations (threads) so each thread/conversation (regardless of reply count) counts as 1 item
    const url = new URL(`${GMAIL_BASE}/threads`);
    url.searchParams.set('maxResults', String(requestedMax));
    if (isSpamOrTrash) {
      url.searchParams.set('includeSpamTrash', 'true');
    }

    let effectiveQuery = params.query ? params.query.trim() : '';
    if (isTrash) {
      if (!effectiveQuery.toLowerCase().includes('in:trash') && !effectiveQuery.toLowerCase().includes('is:trash')) {
        effectiveQuery = effectiveQuery ? `in:trash ${effectiveQuery}` : 'in:trash';
      }
    } else if (isSpam) {
      if (!effectiveQuery.toLowerCase().includes('in:spam') && !effectiveQuery.toLowerCase().includes('is:spam')) {
        effectiveQuery = effectiveQuery ? `in:spam ${effectiveQuery}` : 'in:spam';
      }
    }

    if (effectiveQuery) {
      url.searchParams.set('q', effectiveQuery);
    }

    // Gmail API threads.list expects in:trash / in:spam in query with includeSpamTrash=true (do not pass labelIds=TRASH or SPAM)
    if (params.labelIds && params.labelIds.length > 0) {
      params.labelIds
        .filter((id) => id !== 'TRASH' && id !== 'SPAM')
        .forEach((id) => url.searchParams.append('labelIds', id));
    }
    if (params.pageToken) {
      url.searchParams.set('pageToken', params.pageToken);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const msg = errJson?.error?.message || `Failed to list threads (${res.status})`;
      notifyIfAuthError(res.status, msg);
      throw new Error(msg);
    }

    const data = await res.json();
    const rawList: { id: string; snippet?: string; historyId?: string }[] = data.threads || [];

    /**
     * Repli Corbeille / Spam : l'API conversations ne ramène parfois AUCUN résultat
     * (ou des conversations dont aucun message ne porte le libellé), alors que le
     * compteur du dossier indique des éléments. On rejoue alors la recherche au
     * niveau des messages pour ne plus afficher "dossier vide" à tort.
     */
    const runSpamTrashFallback = async (): Promise<ListMessagesResponse | null> => {
      if (!isSpamOrTrash) return null;
      try {
        const fallback = await listMessagesByQuery(
          token,
          isTrash ? 'in:trash' : 'in:spam',
          requestedMax,
          params.pageToken
        );
        const filtered = isTrash
          ? fallback.emails.filter((m) => m.labelIds && m.labelIds.includes('TRASH'))
          : fallback.emails.filter((m) => m.labelIds && m.labelIds.includes('SPAM'));

        if (filtered.length > 0) {
          return {
            emails: filtered,
            nextPageToken: fallback.nextPageToken,
            resultSizeEstimate: fallback.resultSizeEstimate || filtered.length,
            fetchedFromApi: fallback.emails.length,
          };
        }
      } catch (fallbackErr) {
        console.warn('Trash/Spam fallback listing failed:', fallbackErr);
      }
      return null;
    };

    if (rawList.length === 0) {
      const fallback = await runSpamTrashFallback();
      return (
        fallback || {
          emails: [],
          nextPageToken: data.nextPageToken,
          resultSizeEstimate: data.resultSizeEstimate || 0,
          fetchedFromApi: 0,
        }
      );
    }

    // Fetch full thread details (including all messages/replies in each thread).
    // Les conversations non modifiées depuis le dernier sync sont servies par le cache :
    // c'est ce qui évite de re-télécharger 50 conversations à chaque rafraîchissement.
    const now = Date.now();
    const results: ParsedEmail[][] = new Array(rawList.length);
    const toFetch: Array<{ index: number; id: string }> = [];
    let fetchedFromApi = 0;

    rawList.forEach((item, index) => {
      const cached = params.useCache ? threadCache.get(item.id) : undefined;
      const isChanged = params.changedThreadIds ? params.changedThreadIds.has(item.id) : false;
      const isFresh = cached && now - cached.fetchedAt < THREAD_CACHE_TTL_MS;

      if (cached && isFresh && !isChanged) {
        results[index] = cached.messages;
      } else {
        results[index] = [];
        toFetch.push({ index, id: item.id });
      }
    });

    await mapWithConcurrency(toFetch, THREAD_FETCH_CONCURRENCY, async ({ index, id }) => {
      try {
        const messages = await fetchThreadMessages(token, id);
        results[index] = messages;
        rememberThread(id, messages);
        fetchedFromApi++;
      } catch {
        results[index] = [];
      }
    });

    let emails = results.flat();

    // Strict label isolation: Corbeille must ONLY contain messages in TRASH, and active folders must NEVER contain trashed messages
    if (isTrash) {
      emails = emails.filter((m) => m.labelIds && m.labelIds.includes('TRASH'));
    } else if (isSpam) {
      emails = emails.filter((m) => m.labelIds && m.labelIds.includes('SPAM'));
    } else {
      emails = emails.filter((m) => !m.labelIds?.includes('TRASH') && !m.labelIds?.includes('SPAM'));
    }

    // SÉCURITÉ CORBEILLE / SPAM : rien n'a été retenu après filtrage -> repli messages.
    if (isSpamOrTrash && emails.length === 0) {
      const fallback = await runSpamTrashFallback();
      if (fallback) return fallback;
    }

    return {
      emails,
      nextPageToken: data.nextPageToken,
      resultSizeEstimate: data.resultSizeEstimate || rawList.length,
      fetchedFromApi,
    };
  } catch (err: any) {
    if (err?.message && (err.message.includes('401') || err.message.includes('403'))) {
      throw err;
    }
    console.warn('Network error or failed fetch in listMessages, using account-specific mock emails:', err);
    let fallbackEmails = getMockFallbackEmails(userEmail);
    if (params.query) {
      const q = params.query.toLowerCase().replace(/is:\w+/g, '').replace(/label:\w+/g, '').trim();
      if (q) {
        fallbackEmails = fallbackEmails.filter((e) => {
          const inSubject = e.subject?.toLowerCase().includes(q);
          const inFrom =
            e.fromName?.toLowerCase().includes(q) ||
            e.fromEmail?.toLowerCase().includes(q);
          const inTo = e.to?.toLowerCase().includes(q);
          const inCc = e.cc?.toLowerCase().includes(q);
          const inSnippet = e.snippet?.toLowerCase().includes(q);
          const inBody =
            e.bodyText?.toLowerCase().includes(q) ||
            e.bodyHtml?.toLowerCase().includes(q);
          return inSubject || inFrom || inTo || inCc || inSnippet || inBody;
        });
      }
    }
    if (params.query?.includes('is:unread')) {
      fallbackEmails = fallbackEmails.filter((e) => e.isUnread);
    } else if (params.query?.includes('is:starred')) {
      fallbackEmails = fallbackEmails.filter((e) => e.isStarred);
    }

    const pageSize = params.maxResults || 50;
    const pageTokenNum = params.pageToken ? parseInt(params.pageToken, 10) : 0;
    const startIndex = isNaN(pageTokenNum) ? 0 : pageTokenNum;
    const paginatedSlice = fallbackEmails.slice(startIndex, startIndex + pageSize);
    const nextToken =
      startIndex + pageSize < fallbackEmails.length
        ? String(startIndex + pageSize)
        : undefined;

    return {
      emails: paginatedSlice,
      nextPageToken: nextToken,
      resultSizeEstimate: fallbackEmails.length,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* SYNCHRONISATION INCRÉMENTALE (API History)                                  */
/* -------------------------------------------------------------------------- */

export interface HistoryChangeSet {
  hasChanges: boolean;
  historyId?: string;
  changedThreadIds: Set<string>;
  /** historyId trop ancien : il faut refaire un chargement complet. */
  expired: boolean;
}

/**
 * Vérifie en UNE SEULE requête si la boîte a changé depuis `startHistoryId`.
 * Permet de ne plus re-télécharger toute la boîte à chaque tic de synchronisation.
 */
export async function fetchHistoryChanges(
  token: string,
  startHistoryId: string
): Promise<HistoryChangeSet> {
  const empty: HistoryChangeSet = {
    hasChanges: false,
    changedThreadIds: new Set<string>(),
    expired: false,
  };

  if (!startHistoryId) return { ...empty, expired: true };

  const url = new URL(`${GMAIL_BASE}/history`);
  url.searchParams.set('startHistoryId', startHistoryId);
  url.searchParams.set('maxResults', '200');
  ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'].forEach((type) =>
    url.searchParams.append('historyTypes', type)
  );

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) {
    // historyId expiré : on repart sur un chargement complet
    return { ...empty, expired: true };
  }

  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const msg = errJson?.error?.message || `Failed to list history (${res.status})`;
    notifyIfAuthError(res.status, msg);
    throw new Error(msg);
  }

  const data = await res.json();
  const records: any[] = data.history || [];
  const changedThreadIds = new Set<string>();

  for (const record of records) {
    const collect = (entry: any) => {
      const message = entry?.message;
      if (!message) return;
      const threadId: string | undefined = message.threadId;
      if (message.id && threadId) messageThreadIndex.set(message.id, threadId);
      if (threadId) changedThreadIds.add(threadId);
      else if (message.id) {
        const known = messageThreadIndex.get(message.id);
        if (known) changedThreadIds.add(known);
      }
    };

    (record.messagesAdded || []).forEach(collect);
    (record.messagesDeleted || []).forEach(collect);
    (record.labelsAdded || []).forEach(collect);
    (record.labelsRemoved || []).forEach(collect);
  }

  return {
    hasChanges: records.length > 0,
    historyId: data.historyId,
    changedThreadIds,
    expired: false,
  };
}

/* -------------------------------------------------------------------------- */
/* VIDAGE COMPLET CORBEILLE / SPAM                                            */
/* -------------------------------------------------------------------------- */

/**
 * Supprime DÉFINITIVEMENT tous les messages d'un dossier système (Corbeille, Spam),
 * y compris ceux qui ne sont pas dans la page affichée.
 */
export async function emptySystemFolder(
  token: string,
  folder: 'TRASH' | 'SPAM',
  maxItems = 5000
): Promise<number> {
  const query = folder === 'TRASH' ? 'in:trash' : 'in:spam';
  let pageToken: string | undefined = undefined;
  let deleted = 0;
  let guard = 0;

  while (deleted < maxItems && guard < 40) {
    guard++;

    const url = new URL(`${GMAIL_BASE}/messages`);
    url.searchParams.set('maxResults', '500');
    url.searchParams.set('includeSpamTrash', 'true');
    url.searchParams.set('q', query);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const msg = errJson?.error?.message || `Failed to list ${folder} messages (${res.status})`;
      notifyIfAuthError(res.status, msg);
      throw new Error(msg);
    }

    const data = await res.json();
    const ids: string[] = (data.messages || []).map((m: { id: string }) => m.id);
    pageToken = data.nextPageToken;

    if (ids.length === 0) break;

    // batchDelete accepte au maximum 1000 identifiants par appel
    for (let i = 0; i < ids.length; i += 500) {
      await batchDeleteMessages(token, ids.slice(i, i + 500));
    }
    deleted += ids.length;

    if (!pageToken) break;
  }

  // Les conversations supprimées ne doivent plus sortir du cache
  clearThreadCache();

  return deleted;
}

export async function getMessage(token: string, id: string): Promise<ParsedEmail> {
  const res = await fetch(`${GMAIL_BASE}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const msg = errJson?.error?.message || `Failed to fetch message ${id} (${res.status})`;
    notifyIfAuthError(res.status, msg);
    throw new Error(msg);
  }
  const raw: GmailRawMessage = await res.json();
  return parseRawMessage(raw);
}

export async function fetchThread(token: string, threadId: string): Promise<ParsedEmail[]> {
  try {
    const res = await fetch(`${GMAIL_BASE}/threads/${threadId}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      notifyIfAuthError(res.status, errJson?.error?.message);
      return [];
    }
    const data = await res.json();
    const rawMessages: GmailRawMessage[] = data.messages || [];
    const parsed = rawMessages.map((m) => parseRawMessage(m));
    // Sort chronologically (oldest to newest)
    return parsed.sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
  } catch (err) {
    console.error('Error fetching thread:', err);
    return [];
  }
}

export async function modifyLabels(
  token: string,
  id: string,
  options: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<void> {
  const res = await fetch(`${GMAIL_BASE}/messages/${id}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const msg = errJson?.error?.message || `Failed to update message labels (${res.status})`;
    notifyIfAuthError(res.status, msg);
    throw new Error(msg);
  }
}

export async function batchModifyLabels(
  token: string,
  ids: string[],
  options: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<void> {
  if (ids.length === 0) return;
  const res = await fetch(`${GMAIL_BASE}/messages/batchModify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ids,
      ...options,
    }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const msg = errJson?.error?.message || `Failed to batch update messages (${res.status})`;
    notifyIfAuthError(res.status, msg);
    throw new Error(msg);
  }
}

export async function trashMessage(token: string, id: string): Promise<void> {
  const res = await fetch(`${GMAIL_BASE}/messages/${id}/trash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const msg = errJson?.error?.message || `Failed to move message to trash (${res.status})`;
    notifyIfAuthError(res.status, msg);
    throw new Error(msg);
  }
}

export async function untrashMessage(token: string, id: string): Promise<void> {
  const res = await fetch(`${GMAIL_BASE}/messages/${id}/untrash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const msg = errJson?.error?.message || `Failed to restore message (${res.status})`;
    notifyIfAuthError(res.status, msg);
    throw new Error(msg);
  }
}

export async function deleteMessage(token: string, id: string): Promise<void> {
  const res = await fetch(`${GMAIL_BASE}/messages/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const msg = errJson?.error?.message || `Failed to permanently delete message (${res.status})`;
    notifyIfAuthError(res.status, msg);
    throw new Error(msg);
  }
}

export async function batchDeleteMessages(token: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const res = await fetch(`${GMAIL_BASE}/messages/batchDelete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      // Fallback: delete one by one if batchDelete is restricted
      await Promise.all(ids.map((id) => deleteMessage(token, id).catch(() => {})));
    }
  } catch {
    await Promise.all(ids.map((id) => deleteMessage(token, id).catch(() => {})));
  }
}

export interface ComposeOptions {
  fromEmail: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export function buildRfc2822Raw(opts: ComposeOptions): string {
  const boundary = `====boundary_${Date.now()}_gmail_client====`;
  const cleanSubject = opts.subject || '(Sans objet)';
  const utf8Subject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(cleanSubject)))}?=`;

  const lines: string[] = [
    `From: ${opts.fromEmail}`,
    `To: ${opts.to}`,
  ];
  if (opts.cc) lines.push(`Cc: ${opts.cc}`);
  if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`);
  lines.push(`Subject: ${utf8Subject}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) lines.push(`References: ${opts.references}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push('');

  // Plain text fallback
  const plainText = opts.body.replace(/<[^>]*>?/gm, '');
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: 8bit');
  lines.push('');
  lines.push(plainText);
  lines.push('');

  // HTML content
  const htmlContent = opts.body.includes('<') ? opts.body : `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.5; color: #222;">${opts.body.replace(/\n/g, '<br />')}</div>`;
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: 8bit');
  lines.push('');
  lines.push(htmlContent);
  lines.push('');

  lines.push(`--${boundary}--`);

  const rawRfc = lines.join('\r\n');
  return encodeBase64Url(rawRfc);
}

export async function sendMessage(token: string, opts: ComposeOptions): Promise<any> {
  const raw = buildRfc2822Raw(opts);
  const payload: any = { raw };
  if (opts.threadId) {
    payload.threadId = opts.threadId;
  }

  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const msg = err?.error?.message || `Failed to send email (${res.status})`;
    notifyIfAuthError(res.status, msg);
    throw new Error(msg);
  }

  return res.json();
}

export async function saveDraft(token: string, opts: ComposeOptions): Promise<any> {
  const raw = buildRfc2822Raw(opts);
  const res = await fetch(`${GMAIL_BASE}/drafts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        raw,
        threadId: opts.threadId,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const msg = err?.error?.message || `Failed to save draft (${res.status})`;
    notifyIfAuthError(res.status, msg);
    throw new Error(msg);
  }

  return res.json();
}

/**
 * Convert base64Url to Uint8Array
 */
export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Fetch raw binary bytes of an attachment
 */
export async function getAttachmentBytes(
  token: string,
  messageId: string,
  attachmentId?: string,
  inlineData?: string
): Promise<Uint8Array> {
  if (inlineData) {
    return base64UrlToUint8Array(inlineData);
  }
  if (!attachmentId) {
    throw new Error('ID de pièce jointe manquant.');
  }

  const res = await fetch(
    `${GMAIL_BASE}/messages/${messageId}/attachments/${attachmentId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const msg = errJson?.error?.message || `Échec de récupération de la pièce jointe (${res.status})`;
    notifyIfAuthError(res.status, msg);
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data.data) {
    throw new Error('Données de pièce jointe introuvables.');
  }

  return base64UrlToUint8Array(data.data);
}

/**
 * Trigger browser download of a single attachment
 */
export async function downloadAttachmentFile(
  token: string,
  attachment: EmailAttachment
): Promise<void> {
  const bytes = await getAttachmentBytes(
    token,
    attachment.messageId,
    attachment.attachmentId,
    attachment.data
  );
  const blob = new Blob([bytes], { type: attachment.mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}

/**
 * Download selected attachments as a single ZIP archive
 */
export async function downloadAttachmentsAsZip(
  token: string,
  attachments: EmailAttachment[],
  onProgress?: (current: number, total: number, filename: string) => void
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder('pieces_jointes_extraites') || zip;
  const nameCounts: Record<string, number> = {};

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    if (onProgress) {
      onProgress(i + 1, attachments.length, att.filename);
    }
    try {
      const bytes = await getAttachmentBytes(token, att.messageId, att.attachmentId, att.data);
      let finalName = att.filename;
      if (nameCounts[finalName]) {
        const dotIndex = finalName.lastIndexOf('.');
        if (dotIndex > -1) {
          finalName = `${finalName.substring(0, dotIndex)}_${nameCounts[att.filename]}${finalName.substring(dotIndex)}`;
        } else {
          finalName = `${finalName}_${nameCounts[att.filename]}`;
        }
        nameCounts[att.filename]++;
      } else {
        nameCounts[att.filename] = 1;
      }
      folder.file(finalName, bytes);
    } catch (e) {
      console.warn(`Erreur inclusion pièce jointe ${att.filename} dans le zip:`, e);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = zipUrl;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `pieces_jointes_${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(zipUrl);
  }, 2000);
}

/**
 * Scan mailbox for messages with attachments and extract all attachment metadata
 */
export async function scanAttachments(
  token: string,
  options: {
    searchQuery?: string;
    maxMessages?: number;
    pageToken?: string;
  } = {}
): Promise<{
  attachments: EmailAttachment[];
  scannedCount: number;
  nextPageToken?: string;
  quotaWarning?: boolean;
}> {
  if (!token || !token.trim()) {
    return { attachments: [], scannedCount: 0 };
  }

  const baseQuery = 'has:attachment';
  const query = options.searchQuery
    ? `${baseQuery} ${options.searchQuery}`
    : baseQuery;

  const maxMsgs = options.maxMessages || 15;

  const url = new URL(`${GMAIL_BASE}/messages`);
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(maxMsgs));
  if (options.pageToken) {
    url.searchParams.set('pageToken', options.pageToken);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const msg = errJson?.error?.message || `Échec de la recherche de pièces jointes (${res.status})`;
    notifyIfAuthError(res.status, msg);
    if (res.status === 429 || msg.toLowerCase().includes('quota')) {
      throw new Error('Quota Google API temporairement atteint. Veuillez réessayer dans un instant.');
    }
    throw new Error(msg);
  }

  const data = await res.json();
  const messagesList: { id: string; threadId: string }[] = data.messages || [];

  if (messagesList.length === 0) {
    return { attachments: [], scannedCount: 0, nextPageToken: data.nextPageToken };
  }

  // Fetch full messages in small controlled chunks (4 at a time with brief pause)
  const CHUNK_SIZE = 4;
  const allAttachments: EmailAttachment[] = [];
  let quotaHit = false;

  for (let i = 0; i < messagesList.length; i += CHUNK_SIZE) {
    if (quotaHit) break;
    const chunk = messagesList.slice(i, i + CHUNK_SIZE);

    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const results = await Promise.allSettled(
      chunk.map(async (m) => {
        const msgRes = await fetch(`${GMAIL_BASE}/messages/${m.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!msgRes.ok) {
          if (msgRes.status === 429) quotaHit = true;
          notifyIfAuthError(msgRes.status);
          return null;
        }
        const rawMsg: GmailRawMessage = await msgRes.json();
        return parseRawMessage(rawMsg);
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.attachments?.length) {
        allAttachments.push(...r.value.attachments);
      }
    }
  }

  return {
    attachments: allAttachments,
    scannedCount: messagesList.length,
    nextPageToken: data.nextPageToken,
    quotaWarning: quotaHit,
  };
}
