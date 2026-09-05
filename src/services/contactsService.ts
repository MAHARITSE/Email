import { ParsedEmail } from '../types/gmail';

export type ContactCategory = 'pro' | 'personal';
export type ContactDirection = 'received' | 'sent' | 'both';

export interface LocalContact {
  id: string;
  name: string;
  email: string;
  category: ContactCategory;
  direction?: ContactDirection;
  company?: string;
  phone?: string;
  notes?: string;
  avatarColor: string;
  usageCount: number;
  isFavorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

const CONTACTS_STORAGE_KEY = 'gmail_local_contacts_v2';

const AVATAR_COLORS = [
  'from-cyan-500 to-blue-600',
  'from-blue-500 to-indigo-600',
  'from-indigo-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-violet-500 to-fuchsia-600',
];

function getRandomColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

const DEFAULT_SEEDED_CONTACTS: LocalContact[] = [
  {
    id: 'contact_seed_1',
    name: 'Support Google Cloud',
    email: 'cloud-support@google.com',
    category: 'pro',
    company: 'Google Cloud Platform',
    phone: '+33 1 42 68 53 00',
    notes: 'Support technique infrastructure',
    avatarColor: 'from-cyan-500 to-blue-600',
    usageCount: 5,
    isFavorite: true,
    createdAt: Date.now() - 1000000,
    updatedAt: Date.now() - 1000000,
  },
  {
    id: 'contact_seed_2',
    name: 'Alexandre Martin',
    email: 'alexandre.martin@techconsulting.fr',
    category: 'pro',
    company: 'Tech Consulting',
    phone: '+33 6 12 34 56 78',
    notes: 'Direction des projets numériques',
    avatarColor: 'from-blue-500 to-indigo-600',
    usageCount: 8,
    isFavorite: true,
    createdAt: Date.now() - 2000000,
    updatedAt: Date.now() - 2000000,
  },
  {
    id: 'contact_seed_3',
    name: 'Camille Dupont',
    email: 'camille.dupont@gmail.com',
    category: 'personal',
    company: '',
    phone: '+33 6 98 76 54 32',
    notes: 'Ami / Famille',
    avatarColor: 'from-emerald-500 to-teal-600',
    usageCount: 4,
    isFavorite: false,
    createdAt: Date.now() - 3000000,
    updatedAt: Date.now() - 3000000,
  },
];

function notifyContactsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gmail-contacts-updated'));
  }
}

export function getLocalContacts(): LocalContact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(DEFAULT_SEEDED_CONTACTS));
      return DEFAULT_SEEDED_CONTACTS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('Erreur lecture contacts locaux:', err);
  }
  return DEFAULT_SEEDED_CONTACTS;
}

export function getFavoriteContacts(): LocalContact[] {
  return getLocalContacts().filter((c) => Boolean(c.isFavorite));
}

export function isContactFavorite(emailOrId: string): boolean {
  if (!emailOrId) return false;
  const target = emailOrId.toLowerCase().trim();
  const contacts = getLocalContacts();
  const found = contacts.find(
    (c) => c.id === emailOrId || c.email.toLowerCase() === target
  );
  return Boolean(found?.isFavorite);
}

export function toggleContactFavorite(emailOrId: string, fallbackName?: string): boolean {
  const contacts = getLocalContacts();
  const target = emailOrId.toLowerCase().trim();
  const idx = contacts.findIndex(
    (c) => c.id === emailOrId || c.email.toLowerCase() === target
  );

  let newStatus = true;

  if (idx >= 0) {
    contacts[idx].isFavorite = !contacts[idx].isFavorite;
    contacts[idx].updatedAt = Date.now();
    newStatus = Boolean(contacts[idx].isFavorite);
  } else if (target.includes('@')) {
    // Auto-create contact as favorite
    const name = fallbackName || target.split('@')[0];
    const newContact: LocalContact = {
      id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      email: target,
      category: target.endsWith('gmail.com') || target.endsWith('outlook.com') ? 'personal' : 'pro',
      company: '',
      phone: '',
      notes: 'Ajouté aux favoris',
      avatarColor: getRandomColor(target),
      usageCount: 1,
      isFavorite: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    contacts.unshift(newContact);
    newStatus = true;
  }

  localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
  notifyContactsChanged();
  return newStatus;
}

export function saveLocalContact(
  contact: Partial<LocalContact> & { name: string; email: string; category: ContactCategory }
): LocalContact {
  const contacts = getLocalContacts();
  const emailClean = contact.email.trim().toLowerCase();
  const now = Date.now();

  const existingIndex = contact.id
    ? contacts.findIndex((c) => c.id === contact.id)
    : contacts.findIndex((c) => c.email.toLowerCase() === emailClean);

  if (existingIndex >= 0) {
    const existing = contacts[existingIndex];
    const updated: LocalContact = {
      ...existing,
      name: contact.name.trim() || existing.name,
      email: emailClean,
      category: contact.category || existing.category,
      company: contact.company !== undefined ? contact.company.trim() : existing.company,
      phone: contact.phone !== undefined ? contact.phone.trim() : existing.phone,
      notes: contact.notes !== undefined ? contact.notes.trim() : existing.notes,
      isFavorite: contact.isFavorite !== undefined ? contact.isFavorite : existing.isFavorite,
      updatedAt: now,
    };
    contacts[existingIndex] = updated;
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    notifyContactsChanged();
    return updated;
  }

  const newContact: LocalContact = {
    id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: contact.name.trim() || emailClean.split('@')[0],
    email: emailClean,
    category: contact.category,
    company: contact.company?.trim() || '',
    phone: contact.phone?.trim() || '',
    notes: contact.notes?.trim() || '',
    avatarColor: contact.avatarColor || getRandomColor(emailClean),
    usageCount: 1,
    isFavorite: contact.isFavorite || false,
    createdAt: now,
    updatedAt: now,
  };

  contacts.unshift(newContact);
  localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
  notifyContactsChanged();
  return newContact;
}

export function deleteLocalContact(id: string): void {
  const contacts = getLocalContacts().filter((c) => c.id !== id);
  localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
  notifyContactsChanged();
}

export function updateContactCategory(id: string, category: ContactCategory): void {
  const contacts = getLocalContacts();
  const contact = contacts.find((c) => c.id === id);
  if (contact) {
    contact.category = category;
    contact.updatedAt = Date.now();
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    notifyContactsChanged();
  }
}

export function incrementContactUsage(emailOrId: string): void {
  const contacts = getLocalContacts();
  const target = emailOrId.toLowerCase().trim();
  const contact = contacts.find(
    (c) => c.id === emailOrId || c.email.toLowerCase() === target
  );
  if (contact) {
    contact.usageCount = (contact.usageCount || 0) + 1;
    contact.updatedAt = Date.now();
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    notifyContactsChanged();
  }
}

export function suggestContacts(input: string, limit = 8): LocalContact[] {
  const cleanInput = input.trim().toLowerCase();
  const contacts = getLocalContacts();

  if (!cleanInput) {
    return [...contacts]
      .sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return (b.usageCount || 0) - (a.usageCount || 0);
      })
      .slice(0, limit);
  }

  return contacts
    .filter((c) => {
      const matchName = c.name.toLowerCase().includes(cleanInput);
      const matchEmail = c.email.toLowerCase().includes(cleanInput);
      const matchCompany = c.company?.toLowerCase().includes(cleanInput);
      return matchName || matchEmail || matchCompany;
    })
    .sort((a, b) => {
      // Prioritize favorites first
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;

      // Exact startsWith
      const aStarts = a.email.toLowerCase().startsWith(cleanInput) || a.name.toLowerCase().startsWith(cleanInput);
      const bStarts = b.email.toLowerCase().startsWith(cleanInput) || b.name.toLowerCase().startsWith(cleanInput);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return (b.usageCount || 0) - (a.usageCount || 0);
    })
    .slice(0, limit);
}

/**
 * Parse an email header string containing one or multiple addresses (e.g., "John <john@corp.com>, alice@test.fr")
 */
export function parseEmailAddressList(headerVal: string | undefined): Array<{ name: string; email: string }> {
  if (!headerVal) return [];
  const results: Array<{ name: string; email: string }> = [];

  // Split by comma outside quotes
  const rawParts = headerVal.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
  for (const part of rawParts) {
    const raw = part.trim();
    if (!raw) continue;

    // Pattern 1: "Name" <email@dom.com> or Name <email@dom.com>
    const matchNameEmail = raw.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>/);
    if (matchNameEmail && matchNameEmail[2]) {
      const email = matchNameEmail[2].trim().toLowerCase();
      const name = (matchNameEmail[1] || '').trim();
      if (email.includes('@')) {
        results.push({ name: name || email.split('@')[0], email });
      }
      continue;
    }

    // Pattern 2: just email or fallback regex
    const emailMatch = raw.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      const email = emailMatch[1].toLowerCase();
      const cleanName = raw.replace(emailMatch[0], '').replace(/[<>,"']/g, '').trim();
      results.push({ name: cleanName || email.split('@')[0], email });
    }
  }

  return results;
}

/**
 * Auto-import all correspondents (senders AND recipients) from loaded emails
 */
export function importContactsFromParsedEmails(
  emails: ParsedEmail[],
  existingCategoryMap?: Record<string, string>,
  currentUserEmail?: string
): { added: number; updated: number } {
  const currentContacts = getLocalContacts();
  const mapByEmail = new Map<string, LocalContact>();
  currentContacts.forEach((c) => mapByEmail.set(c.email.toLowerCase(), c));

  let added = 0;
  let updated = 0;
  const myEmailClean = currentUserEmail?.toLowerCase().trim();

  for (const email of emails) {
    // 1. Process SENDER
    if (email.fromEmail && email.fromEmail.includes('@')) {
      const fromEmail = email.fromEmail.toLowerCase().trim();
      const fromName = (email.fromName || '').trim() || fromEmail.split('@')[0];

      if (fromEmail !== myEmailClean || emails.length === 1) {
        const domain = fromEmail.split('@')[1] || '';
        const isPersonalDomain = [
          'gmail.com',
          'outlook.com',
          'yahoo.com',
          'hotmail.com',
          'free.fr',
          'orange.fr',
          'sfr.fr',
          'icloud.com',
        ].includes(domain);

        const categoryFromEmail = existingCategoryMap?.[email.id];
        const inferredCategory: ContactCategory =
          categoryFromEmail === 'pro'
            ? 'pro'
            : categoryFromEmail === 'personal'
            ? 'personal'
            : !isPersonalDomain
            ? 'pro'
            : 'personal';

        const companyFromDomain = !isPersonalDomain && domain.includes('.')
          ? domain.split('.')[0].toUpperCase()
          : undefined;

        if (mapByEmail.has(fromEmail)) {
          const existing = mapByEmail.get(fromEmail)!;
          existing.usageCount = (existing.usageCount || 0) + 1;
          if ((!existing.name || existing.name === fromEmail.split('@')[0]) && fromName) {
            existing.name = fromName;
          }
          if (!existing.company && companyFromDomain) {
            existing.company = companyFromDomain;
          }
          if (!existing.direction || existing.direction === 'sent') {
            existing.direction = existing.direction === 'sent' ? 'both' : 'received';
          }
          updated++;
        } else {
          const newContact: LocalContact = {
            id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: fromName,
            email: fromEmail,
            category: inferredCategory,
            direction: 'received',
            company: companyFromDomain || '',
            phone: '',
            notes: `Contact importé de Gmail`,
            avatarColor: getRandomColor(fromEmail),
            usageCount: 1,
            isFavorite: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          mapByEmail.set(fromEmail, newContact);
          added++;
        }
      }
    }

    // 2. Process RECIPIENTS (To, Cc)
    const recipientList = [
      ...parseEmailAddressList(email.to),
      ...parseEmailAddressList(email.cc),
    ];

    for (const recipient of recipientList) {
      const recEmail = recipient.email.toLowerCase().trim();
      if (
        !recEmail ||
        !recEmail.includes('@')
      ) {
        continue;
      }

      const domain = recEmail.split('@')[1] || '';
      const isPersonalDomain = [
        'gmail.com',
        'outlook.com',
        'yahoo.com',
        'hotmail.com',
        'free.fr',
        'orange.fr',
        'sfr.fr',
        'icloud.com',
      ].includes(domain);

      const inferredCategory: ContactCategory = !isPersonalDomain ? 'pro' : 'personal';
      const companyFromDomain = !isPersonalDomain && domain.includes('.')
        ? domain.split('.')[0].toUpperCase()
        : undefined;

      if (mapByEmail.has(recEmail)) {
        const existing = mapByEmail.get(recEmail)!;
        existing.usageCount = (existing.usageCount || 0) + 1;
        if ((!existing.name || existing.name === recEmail.split('@')[0]) && recipient.name) {
          existing.name = recipient.name;
        }
        if (!existing.company && companyFromDomain) {
          existing.company = companyFromDomain;
        }
        if (!existing.direction || existing.direction === 'received') {
          existing.direction = existing.direction === 'received' ? 'both' : 'sent';
        }
        updated++;
      } else {
        const newContact: LocalContact = {
          id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: recipient.name || recEmail.split('@')[0],
          email: recEmail,
          category: inferredCategory,
          direction: 'sent',
          company: companyFromDomain || '',
          phone: '',
          notes: `Contact importé de Gmail`,
          avatarColor: getRandomColor(recEmail),
          usageCount: 1,
          isFavorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        mapByEmail.set(recEmail, newContact);
        added++;
      }
    }
  }

  const result = Array.from(mapByEmail.values());
  localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(result));
  notifyContactsChanged();
  return { added, updated };
}
