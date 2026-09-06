import { AuthenticatedUser } from './googleAuth';

export interface StoredAccount {
  user: AuthenticatedUser;
  token: string;
  lastActive: number;
}

const MULTI_ACCOUNTS_KEY = 'gmail_pro_multi_accounts';
const ACTIVE_ACCOUNT_EMAIL_KEY = 'gmail_pro_active_account_email';

export function getStoredAccounts(): StoredAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MULTI_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('Error reading stored accounts:', err);
  }
  return [];
}

export function saveStoredAccounts(accounts: StoredAccount[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MULTI_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (err) {
    console.warn('Error saving stored accounts:', err);
  }
}

export function getActiveAccountEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_ACCOUNT_EMAIL_KEY);
  } catch {
    return null;
  }
}

export function setActiveAccountEmail(email: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (email) {
      window.localStorage.setItem(ACTIVE_ACCOUNT_EMAIL_KEY, email);
    } else {
      window.localStorage.removeItem(ACTIVE_ACCOUNT_EMAIL_KEY);
    }
  } catch (err) {
    console.warn('Error setting active account email:', err);
  }
}

export function saveOrUpdateAccount(user: AuthenticatedUser, token: string): StoredAccount[] {
  const accounts = getStoredAccounts();
  const emailKey = user.email ? user.email.toLowerCase() : user.uid;
  
  const existingIdx = accounts.findIndex(
    (acc) => (acc.user.email ? acc.user.email.toLowerCase() : acc.user.uid) === emailKey
  );

  const newAccount: StoredAccount = {
    user,
    token,
    lastActive: Date.now(),
  };

  if (existingIdx >= 0) {
    accounts[existingIdx] = newAccount;
  } else {
    accounts.push(newAccount);
  }

  saveStoredAccounts(accounts);
  if (user.email) {
    setActiveAccountEmail(user.email);
  }
  return accounts;
}

export function removeAccountFromStorage(emailOrUid: string): StoredAccount[] {
  const accounts = getStoredAccounts();
  const searchKey = emailOrUid.toLowerCase();
  const updated = accounts.filter(
    (acc) =>
      (acc.user.email && acc.user.email.toLowerCase() !== searchKey) &&
      acc.user.uid !== emailOrUid
  );
  saveStoredAccounts(updated);

  const currentActive = getActiveAccountEmail();
  if (currentActive && currentActive.toLowerCase() === searchKey) {
    const nextActive = updated[0]?.user.email || null;
    setActiveAccountEmail(nextActive);
  }

  return updated;
}

export function clearAllAccountsStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(MULTI_ACCOUNTS_KEY);
    window.localStorage.removeItem(ACTIVE_ACCOUNT_EMAIL_KEY);
  } catch {}
}
