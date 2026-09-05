export interface EmailSignature {
  id: string;
  name: string;
  senderName: string;
  title?: string;
  company?: string;
  phone?: string;
  email?: string;
  website?: string;
  customText?: string;
  htmlContent?: string;
  mode?: 'rich' | 'fields';
  isDefaultNew: boolean;
  isDefaultReply: boolean;
  createdAt: number;
  updatedAt: number;
}

const SIGNATURES_STORAGE_KEY = 'gmail_user_signatures_v2';

const DEFAULT_SIGNATURES: EmailSignature[] = [
  {
    id: 'sig_pro_default',
    name: 'Signature Professionnelle',
    senderName: 'MAHARITSE Hyacinthe Bertrand',
    title: '',
    company: '',
    phone: '+261 38 34 092 61',
    email: '',
    website: '',
    customText: 'Bien cordialement,',
    htmlContent: `<div style="font-family: Arial, sans-serif; font-size: 13px; color: #333333; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 12px;">
  <p style="margin: 0 0 4px 0; font-weight: bold; color: #0284c7; font-size: 14px;">MAHARITSE Hyacinthe Bertrand</p>
  <p style="margin: 0; color: #475569; font-size: 12px;">📞 +261 38 34 092 61</p>
</div>`,
    mode: 'rich',
    isDefaultNew: true,
    isDefaultReply: true,
    createdAt: Date.now() - 5000000,
    updatedAt: Date.now() - 5000000,
  },
  {
    id: 'sig_perso_default',
    name: 'Signature Personnelle',
    senderName: '',
    title: '',
    company: '',
    phone: '',
    email: '',
    website: '',
    customText: 'Amitiés,\nEnvoyé depuis mon espace Gmail sécurisé',
    htmlContent: `<div style="font-family: Arial, sans-serif; font-size: 13px; color: #475569; margin-top: 10px;">
  <p style="margin: 0 0 4px 0;">Amitiés,</p>
  <p style="margin: 0; font-size: 11px; color: #94a3b8; font-style: italic;">Envoyé depuis mon espace Gmail sécurisé</p>
</div>`,
    mode: 'rich',
    isDefaultNew: false,
    isDefaultReply: false,
    createdAt: Date.now() - 4000000,
    updatedAt: Date.now() - 4000000,
  },
];

function notifySignaturesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gmail-signatures-updated'));
  }
}

export function getSignatures(): EmailSignature[] {
  try {
    const raw = localStorage.getItem(SIGNATURES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SIGNATURES_STORAGE_KEY, JSON.stringify(DEFAULT_SIGNATURES));
      return DEFAULT_SIGNATURES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('Erreur chargement signatures:', err);
  }
  return DEFAULT_SIGNATURES;
}

export function getDefaultSignature(type: 'new' | 'reply'): EmailSignature | null {
  const sigs = getSignatures();
  if (type === 'new') {
    return sigs.find((s) => s.isDefaultNew) || sigs[0] || null;
  } else {
    return sigs.find((s) => s.isDefaultReply) || sigs[0] || null;
  }
}

export function formatSignatureText(sig: EmailSignature): string {
  if (sig.mode === 'rich' && sig.htmlContent?.trim()) {
    // Convert HTML to simple readable text for text-only fallbacks
    const temp = document.createElement('div');
    temp.innerHTML = sig.htmlContent;
    return temp.textContent || temp.innerText || '';
  }

  const parts: string[] = [];

  if (sig.customText?.trim()) {
    parts.push(sig.customText.trim());
  }

  const details: string[] = [];
  if (sig.senderName?.trim()) details.push(sig.senderName.trim());
  if (sig.title?.trim() && sig.company?.trim()) {
    details.push(`${sig.title.trim()} | ${sig.company.trim()}`);
  } else if (sig.title?.trim()) {
    details.push(sig.title.trim());
  } else if (sig.company?.trim()) {
    details.push(sig.company.trim());
  }

  if (sig.phone?.trim()) details.push(`Tél: ${sig.phone.trim()}`);
  if (sig.email?.trim()) details.push(`Email: ${sig.email.trim()}`);
  if (sig.website?.trim()) details.push(`Web: ${sig.website.trim()}`);

  if (details.length > 0) {
    if (parts.length > 0) {
      parts.push('--\n' + details.join('\n'));
    } else {
      parts.push(details.join('\n'));
    }
  }

  return parts.join('\n\n');
}

export function formatSignatureHtml(sig: EmailSignature): string {
  if (sig.htmlContent?.trim()) {
    return sig.htmlContent.trim();
  }

  const text = formatSignatureText(sig);
  return `<div style="font-family: Arial, sans-serif; font-size: 13px; color: #333333; margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 8px;">
    ${text.split('\n').map((l) => `<p style="margin: 0 0 3px 0;">${l || '&nbsp;'}</p>`).join('')}
  </div>`;
}

export function saveSignature(signature: Omit<EmailSignature, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): EmailSignature {
  const list = getSignatures();
  const now = Date.now();

  let targetId = signature.id;
  const isNew = !targetId || !list.some((s) => s.id === targetId);

  if (isNew) {
    targetId = `sig_${now}_${Math.random().toString(36).slice(2, 6)}`;
  }

  // If this signature is marked default, unset defaults from others
  const updatedList = list.map((item) => {
    const isThis = item.id === targetId;
    return {
      ...item,
      isDefaultNew: isThis ? signature.isDefaultNew : signature.isDefaultNew ? false : item.isDefaultNew,
      isDefaultReply: isThis ? signature.isDefaultReply : signature.isDefaultReply ? false : item.isDefaultReply,
    };
  });

  const fullRecord: EmailSignature = {
    id: targetId!,
    name: signature.name.trim() || 'Ma signature',
    senderName: signature.senderName?.trim() || '',
    title: signature.title?.trim() || '',
    company: signature.company?.trim() || '',
    phone: signature.phone?.trim() || '',
    email: signature.email?.trim() || '',
    website: signature.website?.trim() || '',
    customText: signature.customText?.trim() || '',
    htmlContent: signature.htmlContent?.trim() || '',
    mode: signature.mode || 'rich',
    isDefaultNew: Boolean(signature.isDefaultNew),
    isDefaultReply: Boolean(signature.isDefaultReply),
    createdAt: isNew ? now : (list.find((s) => s.id === targetId)?.createdAt || now),
    updatedAt: now,
  };

  if (isNew) {
    updatedList.push(fullRecord);
  } else {
    const idx = updatedList.findIndex((s) => s.id === targetId);
    if (idx >= 0) {
      updatedList[idx] = fullRecord;
    }
  }

  localStorage.setItem(SIGNATURES_STORAGE_KEY, JSON.stringify(updatedList));
  notifySignaturesChanged();
  return fullRecord;
}

export function deleteSignature(id: string): void {
  const list = getSignatures().filter((s) => s.id !== id);
  localStorage.setItem(SIGNATURES_STORAGE_KEY, JSON.stringify(list));
  notifySignaturesChanged();
}
