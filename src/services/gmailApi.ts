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
    status === 401 ||
    status === 403 ||
    (message &&
      (message.toLowerCase().includes('invalid authentication credentials') ||
        message.toLowerCase().includes('oauth 2 access token') ||
        message.toLowerCase().includes('unauthenticated') ||
        message.toLowerCase().includes('token expired') ||
        message.toLowerCase().includes('login cookie')))
  ) {
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

export function getMockFallbackEmails(): ParsedEmail[] {
  const now = Date.now();
  return [
    {
      id: 'mock_msg_1',
      threadId: 'mock_thread_1',
      labelIds: ['INBOX', 'UNREAD'],
      subject: 'Bienvenue sur votre messagerie intelligente',
      fromName: 'Équipe Support',
      fromEmail: 'support@workspace.ai',
      to: 'maharitse@gmail.com',
      cc: '',
      dateStr: "Aujourd'hui, 08:30",
      internalDate: String(now - 3600000),
      snippet: 'Bienvenue dans votre nouvel espace de messagerie propulsé par l’IA. Retrouvez vos contacts, vos signatures et vos résumés intelligents.',
      bodyHtml: '<div style="font-family:sans-serif; padding:16px;"><h2>Bienvenue sur votre messagerie intelligente</h2><p>Bienvenue dans votre nouvel espace de messagerie propulsé par l’IA. Retrouvez vos contacts, vos signatures personnalisées et vos résumés intelligents.</p><p>Cordialement,<br><strong>L’équipe Support</strong></p></div>',
      bodyText: 'Bienvenue sur votre messagerie intelligente.\n\nBienvenue dans votre nouvel espace de messagerie propulsé par l’IA. Retrouvez vos contacts, vos signatures personnalisées et vos résumés intelligents.\n\nCordialement,\nL’équipe Support',
      isUnread: true,
      isStarred: true,
      attachments: [],
    },
    {
      id: 'mock_msg_2',
      threadId: 'mock_thread_2',
      labelIds: ['INBOX', 'UNREAD'],
      subject: 'Point sur le projet et avancement des livrables',
      fromName: 'MAHARITSE Hyacinthe Bertrand',
      fromEmail: 'maharitse@gmail.com',
      to: 'equipe@workspace.ai',
      cc: 'direction@workspace.ai',
      dateStr: "Hier, 14:15",
      internalDate: String(now - 86400000),
      snippet: 'Bonjour à tous, voici le point sur les derniers livrables et la synchronisation des contacts.',
      bodyHtml: '<div style="font-family:sans-serif; padding:16px;"><h3>Point sur le projet et avancement</h3><p>Bonjour à tous,</p><p>Voici le point sur les derniers livrables et la synchronisation des contacts. Tout progresse comme prévu.</p><p>Bien cordialement,<br><strong>Hyacinthe</strong></p></div>',
      bodyText: 'Point sur le projet et avancement\n\nBonjour à tous,\n\nVoici le point sur les derniers livrables et la synchronisation des contacts. Tout progresse comme prévu.\n\nBien cordialement,\nHyacinthe',
      isUnread: true,
      isStarred: false,
      attachments: [
        {
          id: 'att_1',
          messageId: 'mock_msg_2',
          filename: 'Rapport_Projet_2026.pdf',
          mimeType: 'application/pdf',
          size: 245000,
          dateStr: 'Hier, 14:15',
          internalDate: String(now - 86400000),
          emailSubject: 'Point sur le projet et avancement des livrables',
          fromName: 'MAHARITSE Hyacinthe Bertrand',
          fromEmail: 'maharitse@gmail.com',
        },
      ],
    },
    {
      id: 'mock_msg_3',
      threadId: 'mock_thread_3',
      labelIds: ['INBOX'],
      subject: 'Confirmation de votre inscription aux services cloud',
      fromName: 'Google Cloud Platform',
      fromEmail: 'no-reply@google.com',
      to: 'maharitse@gmail.com',
      cc: '',
      dateStr: '2 Sept',
      internalDate: String(now - 172800000),
      snippet: 'Votre compte a été provisionné avec succès sur la région europe-west2.',
      bodyHtml: '<div style="font-family:sans-serif; padding:16px;"><h3>Google Cloud Notification</h3><p>Votre compte a été provisionné avec succès sur la région europe-west2 avec le stockage cloud sécurisé.</p></div>',
      bodyText: 'Google Cloud Notification\n\nVotre compte a été provisionné avec succès sur la région europe-west2 avec le stockage cloud sécurisé.',
      isUnread: false,
      isStarred: false,
      attachments: [],
    },
  ];
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
  params: ListMessagesParams = {}
): Promise<ListMessagesResponse> {
  try {
    const url = new URL(`${GMAIL_BASE}/messages`);
    url.searchParams.set('maxResults', String(params.maxResults || 20));

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
      const msg = errJson?.error?.message || `Failed to list messages (${res.status})`;
      notifyIfAuthError(res.status, msg);
      throw new Error(msg);
    }

    const data = await res.json();
    const rawList: { id: string; threadId: string }[] = data.messages || [];

    if (rawList.length === 0) {
      return {
        emails: [],
        nextPageToken: data.nextPageToken,
        resultSizeEstimate: data.resultSizeEstimate || 0,
      };
    }

    // Fetch full details for the returned batch
    const detailPromises = rawList.map(async (item) => {
      try {
        const msgRes = await fetch(`${GMAIL_BASE}/messages/${item.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!msgRes.ok) return null;
        const rawMsg: GmailRawMessage = await msgRes.json();
        return parseRawMessage(rawMsg);
      } catch {
        return null;
      }
    });

    const resolved = await Promise.all(detailPromises);
    const emails = resolved.filter((m): m is ParsedEmail => m !== null);

    return {
      emails,
      nextPageToken: data.nextPageToken,
      resultSizeEstimate: data.resultSizeEstimate || emails.length,
    };
  } catch (err: any) {
    if (err?.message && (err.message.includes('401') || err.message.includes('403'))) {
      throw err;
    }
    console.warn('Network error or failed fetch in listMessages, using mock fallback emails:', err);
    const fallbackEmails = getMockFallbackEmails();
    return {
      emails: fallbackEmails,
      nextPageToken: undefined,
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
  lines.push('Content-Transfer-Encoding: 7bit');
  lines.push('');
  lines.push(plainText);
  lines.push('');

  // HTML content
  const htmlContent = opts.body.includes('<') ? opts.body : `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.5; color: #222;">${opts.body.replace(/\n/g, '<br />')}</div>`;
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: 7bit');
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
}> {
  const baseQuery = 'has:attachment';
  const query = options.searchQuery
    ? `${baseQuery} ${options.searchQuery}`
    : baseQuery;

  const url = new URL(`${GMAIL_BASE}/messages`);
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(options.maxMessages || 30));
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
    throw new Error(msg);
  }

  const data = await res.json();
  const messagesList: { id: string; threadId: string }[] = data.messages || [];

  if (messagesList.length === 0) {
    return { attachments: [], scannedCount: 0, nextPageToken: data.nextPageToken };
  }

  // Fetch full messages in parallel chunks of 8
  const CHUNK_SIZE = 8;
  const allAttachments: EmailAttachment[] = [];

  for (let i = 0; i < messagesList.length; i += CHUNK_SIZE) {
    const chunk = messagesList.slice(i, i + CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map(async (m) => {
        const msgRes = await fetch(`${GMAIL_BASE}/messages/${m.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!msgRes.ok) return null;
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
  };
}
