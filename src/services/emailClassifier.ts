import { ParsedEmail } from '../types/gmail';

export type EmailCategory = 'all' | 'pro' | 'personal' | 'sites' | 'other';

export interface CategoryInfo {
  id: EmailCategory;
  label: string;
  shortLabel: string;
  description: string;
  colorDark: string;
  colorLight: string;
  borderDark: string;
  borderLight: string;
  bgDark: string;
  bgLight: string;
  iconName: string;
}

export const CATEGORIES: Record<'pro' | 'personal' | 'sites' | 'other', CategoryInfo> = {
  pro: {
    id: 'pro',
    label: 'Professionnels',
    shortLabel: 'Pro',
    description: 'Affaires, clients, travail, factures & projets',
    colorDark: 'text-cyan-400',
    colorLight: 'text-blue-700',
    borderDark: 'border-cyan-500/30',
    borderLight: 'border-blue-200',
    bgDark: 'bg-cyan-500/10',
    bgLight: 'bg-blue-50',
    iconName: 'Briefcase',
  },
  personal: {
    id: 'personal',
    label: 'Personnels',
    shortLabel: 'Perso',
    description: 'Contacts directs, famille, amis & échanges 1-à-1',
    colorDark: 'text-emerald-400',
    colorLight: 'text-emerald-700',
    borderDark: 'border-emerald-500/30',
    borderLight: 'border-emerald-200',
    bgDark: 'bg-emerald-500/10',
    bgLight: 'bg-emerald-50',
    iconName: 'User',
  },
  sites: {
    id: 'sites',
    label: 'Sites & Abonnements',
    shortLabel: 'Sites',
    description: 'Newsletters, notifications web, réseaux sociaux & commandes',
    colorDark: 'text-violet-400',
    colorLight: 'text-violet-700',
    borderDark: 'border-violet-500/30',
    borderLight: 'border-violet-200',
    bgDark: 'bg-violet-500/10',
    bgLight: 'bg-violet-50',
    iconName: 'Globe',
  },
  other: {
    id: 'other',
    label: 'Autres & Divers',
    shortLabel: 'Autres',
    description: 'Notifications système, démarches administratives & courriers divers',
    colorDark: 'text-amber-400',
    colorLight: 'text-amber-700',
    borderDark: 'border-amber-500/30',
    borderLight: 'border-amber-200',
    bgDark: 'bg-amber-500/10',
    bgLight: 'bg-amber-50',
    iconName: 'Layers',
  },
};

const KNOWN_SITE_DOMAINS = [
  'github.com',
  'gitlab.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'facebookmail.com',
  'instagram.com',
  'google.com',
  'apple.com',
  'amazon.',
  'stripe.com',
  'paypal.com',
  'uber.com',
  'deliveroo.',
  'medium.com',
  'substack.com',
  'notion.so',
  'figma.com',
  'slack.com',
  'discord.com',
  'meetup.com',
  'spotify.com',
  'netflix.com',
  'vercel.com',
  'railway.app',
  'supabase.io',
  'firebase.com',
  'cloudflare.com',
  'ovhcloud.com',
  'salesforce.com',
  'hubspot.com',
  'mailerlite.com',
  'mailchimp.com',
  'sendgrid.net',
];

const KNOWN_NOREPLY_PREFIXES = [
  'noreply',
  'no-reply',
  'newsletter',
  'notification',
  'notifications',
  'billing',
  'support',
  'news',
  'service',
  'team@',
  'updates@',
  'alerts@',
  'bounce',
  'mailer-daemon',
];

const PRO_KEYWORDS = [
  'facture',
  'devis',
  'réunion',
  'projet',
  'compte-rendu',
  'candidature',
  'recrutement',
  'client',
  'contrat',
  'entretien',
  'collaboration',
  'livrable',
  'kpi',
  'budget',
  'planning',
  'sprint',
  'lead',
  'partenariat',
  'chiffrage',
  'bon de commande',
  'signature',
  'offre d\'emploi',
  'mission',
];

const PERSONAL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.fr',
  'yahoo.com',
  'yahoo.fr',
  'icloud.com',
  'me.com',
  'free.fr',
  'orange.fr',
  'sfr.fr',
  'laposte.net',
  'proton.me',
  'protonmail.com',
];

// Local storage manual user overrides
function getManualOverrides(): Record<string, 'pro' | 'personal' | 'sites' | 'other'> {
  try {
    const raw = localStorage.getItem('gmail_category_overrides');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setManualCategory(
  emailId: string,
  category: 'pro' | 'personal' | 'sites' | 'other'
) {
  try {
    const current = getManualOverrides();
    current[emailId] = category;
    localStorage.setItem('gmail_category_overrides', JSON.stringify(current));
  } catch (err) {
    console.error('Could not save manual category', err);
  }
}

// Deterministic fast classifier
export function classifyEmailFast(email: ParsedEmail): 'pro' | 'personal' | 'sites' | 'other' {
  // 1. Manual user override
  const overrides = getManualOverrides();
  if (overrides[email.id]) {
    return overrides[email.id];
  }

  const fromEmail = (email.fromEmail || '').toLowerCase();
  const fromName = (email.fromName || '').toLowerCase();
  const subject = (email.subject || '').toLowerCase();
  const snippet = (email.snippet || '').toLowerCase();

  // 2. Check for Sites / Newsletters
  const isSiteDomain = KNOWN_SITE_DOMAINS.some((domain) => fromEmail.includes(domain));
  const isNoReply = KNOWN_NOREPLY_PREFIXES.some((pre) => fromEmail.includes(pre));
  const hasUnsubscribe =
    snippet.includes('se désinscrire') ||
    snippet.includes('unsubscribe') ||
    snippet.includes('désabonner') ||
    snippet.includes('newsletter') ||
    snippet.includes('view in browser');

  if (isSiteDomain || isNoReply || hasUnsubscribe) {
    return 'sites';
  }

  // 3. Check for Professional Keywords or Corporate Domain
  const hasProKeyword = PRO_KEYWORDS.some(
    (kw) => subject.includes(kw) || snippet.includes(kw)
  );

  const domain = fromEmail.split('@')[1] || '';
  const isGenericPersonalDomain = PERSONAL_DOMAINS.includes(domain);

  if (!isGenericPersonalDomain && domain.includes('.')) {
    // Custom domain (enterprise, agency, company)
    return 'pro';
  }

  if (hasProKeyword) {
    return 'pro';
  }

  // 4. Check for system or notification / administrative emails that belong to 'other'
  const isOtherNotification =
    fromEmail.includes('admin') ||
    fromEmail.includes('securit') ||
    fromEmail.includes('auth') ||
    fromEmail.includes('verification') ||
    fromEmail.includes('no-reply') ||
    subject.includes('code de confirmation') ||
    subject.includes('sécurité') ||
    subject.includes('mise à jour des conditions') ||
    subject.includes('rappel') ||
    snippet.includes('automatique');

  if (isOtherNotification) {
    return 'other';
  }

  // 5. Default for personal direct 1-to-1 accounts
  if (isGenericPersonalDomain && fromEmail) {
    return 'personal';
  }

  return 'other';
}

// Background batch classification via Gemini
export async function classifyEmailsWithGemini(
  emails: ParsedEmail[]
): Promise<Record<string, 'pro' | 'personal' | 'sites' | 'other'>> {
  if (emails.length === 0) return {};

  try {
    const payload = emails.map((e) => ({
      id: e.id,
      subject: e.subject,
      from: `${e.fromName} <${e.fromEmail}>`,
      snippet: e.snippet,
    }));

    const res = await fetch('/api/ai/classify-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: payload }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.classifications || {};
    }
  } catch (e) {
    console.warn('Gemini classification fallback to heuristics:', e);
  }

  // Fallback to fast
  const fallback: Record<string, 'pro' | 'personal' | 'sites' | 'other'> = {};
  emails.forEach((e) => {
    fallback[e.id] = classifyEmailFast(e);
  });
  return fallback;
}

const STORAGE_KEY = 'gmail_email_categories_v1';

export function loadManualOverrides(): Record<string, 'pro' | 'personal' | 'sites' | 'other'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

export function saveManualOverride(emailId: string, category: 'pro' | 'personal' | 'sites' | 'other') {
  try {
    const current = loadManualOverrides();
    current[emailId] = category;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}
