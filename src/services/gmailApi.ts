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

    // Fetch full details (including threadsUnread, messagesUnread, threadsTotal, messagesTotal) for all folders
    const mainFolderIds = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'UNREAD', 'IMPORTANT'];

    const detailed = await Promise.all(
      rawLabels.map(async (l) => {
        if (mainFolderIds.includes(l.id) || l.type === 'user') {
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
}

export interface ListMessagesResponse {
  emails: ParsedEmail[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export async function listMessages(
  token: string,
  params: ListMessagesParams = {},
  userEmail?: string
): Promise<ListMessagesResponse> {
  try {
    const requestedMax = params.maxResults || 50;
    const isSpamOrTrash =
      params.labelIds?.some((id) => id === 'SPAM' || id === 'TRASH') ||
      params.query?.toLowerCase().includes('spam') ||
      params.query?.toLowerCase().includes('trash');

    // Fetch conversations (threads) so each thread/conversation (regardless of reply count) counts as 1 item
    const url = new URL(`${GMAIL_BASE}/threads`);
    url.searchParams.set('maxResults', String(requestedMax));
    if (isSpamOrTrash) {
      url.searchParams.set('includeSpamTrash', 'true');
    }

    if (params.query && params.query.trim()) {
      url.searchParams.set('q', params.query.trim());
    }
    if (params.labelIds && params.labelIds.length > 0) {
      params.labelIds.forEach((id) => url.searchParams.append('labelIds', id));
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

    if (rawList.length === 0) {
      return {
        emails: [],
        nextPageToken: data.nextPageToken,
        resultSizeEstimate: data.resultSizeEstimate || 0,
      };
    }

    // Fetch full thread details (including all messages/replies in each thread)
    const detailPromises = rawList.map(async (item) => {
      try {
        const threadRes = await fetch(`${GMAIL_BASE}/threads/${item.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!threadRes.ok) return [];
        const threadData = await threadRes.json();
        const rawMsgs: GmailRawMessage[] = threadData.messages || [];
        return rawMsgs.map((m) => parseRawMessage(m));
      } catch {
        return [];
      }
    });

    const resolvedLists = await Promise.all(detailPromises);
    const emails = resolvedLists.flat();

    return {
      emails,
      nextPageToken: data.nextPageToken,
      resultSizeEstimate: data.resultSizeEstimate || rawList.length,
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
