export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPartBody {
  size: number;
  data?: string;
  attachmentId?: string;
}

export interface GmailPart {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailHeader[];
  body: GmailPartBody;
  parts?: GmailPart[];
}

export interface GmailRawMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  historyId?: string;
  internalDate: string;
  payload: {
    partId: string;
    mimeType: string;
    filename: string;
    headers: GmailHeader[];
    body: GmailPartBody;
    parts?: GmailPart[];
  };
  sizeEstimate?: number;
}

export interface EmailAttachment {
  id: string;
  messageId: string;
  attachmentId?: string;
  partId?: string;
  contentId?: string;
  filename: string;
  mimeType: string;
  size: number;
  dateStr: string;
  internalDate: string;
  emailSubject: string;
  fromName: string;
  fromEmail: string;
  data?: string;
}

export interface ParsedEmail {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  dateStr: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  to: string;
  cc?: string;
  isUnread: boolean;
  isStarred: boolean;
  bodyHtml: string;
  bodyText: string;
  attachments: EmailAttachment[];
}

export interface GmailLabel {
  id: string;
  name: string;
  messageListVisibility?: string;
  labelListVisibility?: string;
  type: 'system' | 'user';
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
  color?: {
    textColor: string;
    backgroundColor: string;
  };
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface ConfirmationDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmStyle?: 'danger' | 'primary';
  onConfirm: () => Promise<void> | void;
}
