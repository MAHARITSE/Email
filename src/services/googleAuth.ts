import { User } from 'firebase/auth';
import {
  auth,
  initAuth as initFirebaseAuth,
  googleSignIn as firebaseGoogleSignIn,
  logout as firebaseLogout,
  getAuthErrorMessage,
  SCOPES,
} from './firebaseAuth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  saveOrUpdateAccount,
  getStoredAccounts,
  getActiveAccountEmail,
  setActiveAccountEmail,
  clearAllAccountsStorage,
} from './multiAccountService';

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

const TOKEN_STORAGE_KEY = 'gmail_net_oauth_access_token';
const USER_STORAGE_KEY = 'gmail_net_oauth_user_profile';

let cachedToken: string | null = null;
let cachedUser: AuthenticatedUser | null = null;

export function setCachedUserAndToken(user: AuthenticatedUser | null, token: string | null) {
  cachedUser = user;
  cachedToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token && user) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
        window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
        window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
        window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
        if (user.email) setActiveAccountEmail(user.email);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        window.localStorage.removeItem(USER_STORAGE_KEY);
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        window.sessionStorage.removeItem(USER_STORAGE_KEY);
      }
    } catch {}
  }
}

// Try to recover active account from persistent localStorage multi-accounts or localStorage on load
if (typeof window !== 'undefined') {
  try {
    const storedAccounts = getStoredAccounts();
    const activeEmail = getActiveAccountEmail();
    let foundAccount = activeEmail
      ? storedAccounts.find((a) => a.user.email?.toLowerCase() === activeEmail.toLowerCase())
      : null;
    if (!foundAccount && storedAccounts.length > 0) {
      foundAccount = storedAccounts[0];
    }

    if (foundAccount) {
      cachedToken = foundAccount.token;
      cachedUser = foundAccount.user;
    } else {
      cachedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) || window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
      const storedUser = window.localStorage.getItem(USER_STORAGE_KEY) || window.sessionStorage.getItem(USER_STORAGE_KEY);
      if (storedUser) {
        cachedUser = JSON.parse(storedUser);
      }
    }
  } catch {
    // Ignore storage restrictions
  }
}

/**
 * Fetch user info using Google OAuth Access Token
 */
async function fetchGoogleUserInfo(token: string): Promise<AuthenticatedUser> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      return {
        uid: data.sub || 'google-user',
        email: data.email || null,
        displayName: data.name || data.email || 'Utilisateur Google',
        photoURL: data.picture || null,
      };
    }
  } catch (err) {
    console.warn('Could not fetch user info from userinfo endpoint:', err);
  }

  // Fallback to Gmail profile if userinfo fails
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      return {
        uid: data.emailAddress || 'gmail-user',
        email: data.emailAddress || null,
        displayName: data.emailAddress?.split('@')[0] || 'Utilisateur Gmail',
        photoURL: null,
      };
    }
  } catch (err) {
    console.warn('Could not fetch user profile from Gmail API:', err);
  }

  return {
    uid: 'google-user',
    email: null,
    displayName: 'Utilisateur Connecté',
    photoURL: null,
  };
}

/**
 * Wait for Google Identity Services script to be ready
 */
async function waitForGsi(timeoutMs = 4000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/**
 * Perform sign in using Google Identity Services (GSI Token Client)
 * This avoids cross-origin iframe cookie issues of Firebase popups!
 */
export async function signInWithGoogleGsi(): Promise<{ user: AuthenticatedUser; accessToken: string }> {
  const isGsiAvailable = await waitForGsi(2500);
  const clientId =
    (firebaseConfig as any).oAuthClientId ||
    (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID : undefined);

  if (!isGsiAvailable || !clientId) {
    throw new Error('GSI_UNAVAILABLE');
  }

  return new Promise((resolve, reject) => {
    try {
      const google = (window as any).google;
      let isResolved = false;

      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES.join(' ') + ' https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        callback: async (response: any) => {
          if (isResolved) return;
          if (response.error) {
            isResolved = true;
            if (response.error === 'popup_closed_by_user') {
              reject(new Error('POPUP_CLOSED'));
            } else if (response.error === 'access_denied' || response.error_description?.includes('access_denied')) {
              reject(new Error('ACCESS_DENIED'));
            } else if (response.error === 'origin_mismatch' || response.error_description?.includes('origin_mismatch')) {
              const origin = typeof window !== 'undefined' ? window.location.origin : '';
              reject(new Error(`ORIGIN_MISMATCH:${origin}`));
            } else {
              reject(new Error(response.error_description || response.error));
            }
            return;
          }

          const accessToken = response.access_token;
          if (!accessToken) {
            isResolved = true;
            reject(new Error('Aucun jeton d\'accès reçu de Google.'));
            return;
          }

          try {
            const user = await fetchGoogleUserInfo(accessToken);
            cachedToken = accessToken;
            cachedUser = user;
            saveOrUpdateAccount(user, accessToken);
            try {
              window.sessionStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
              window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
            } catch {}
            isResolved = true;
            resolve({ user, accessToken });
          } catch (e: any) {
            isResolved = true;
            reject(e);
          }
        },
        error_callback: (err: any) => {
          if (isResolved) return;
          isResolved = true;
          if (err?.type === 'popup_closed') {
            reject(new Error('POPUP_CLOSED'));
          } else {
            reject(new Error(err?.message || 'Erreur d\'autorisation Google'));
          }
        },
      });

      // Request token with select_account prompt so Google always shows account picker
      client.requestAccessToken({ prompt: 'select_account' });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Universal sign-in: tries GSI first (direct OAuth popup), falls back to Firebase Auth
 */
export async function universalSignIn(): Promise<{ user: AuthenticatedUser; accessToken: string }> {
  try {
    return await signInWithGoogleGsi();
  } catch (gsiError: any) {
    if (gsiError?.message === 'POPUP_CLOSED') {
      throw new Error(
        'La fenêtre de connexion Google a été fermée avant la validation. Veuillez cliquer sur S\'authentifier et sélectionner votre compte.'
      );
    }
    if (gsiError?.message === 'ACCESS_DENIED' || gsiError?.message?.includes('access_denied')) {
      throw new Error(
        'ACCES_DENIED: L\'application Google OAuth est en mode test. Votre compte n\'est pas encore enregistré dans les Utilisateurs de test sur Google Cloud Console. Ajoutez votre adresse e-mail dans Google Cloud Console → Écran de consentement OAuth → Utilisateurs de test.'
      );
    }
    if (gsiError?.message?.startsWith('ORIGIN_MISMATCH')) {
      const origin = gsiError.message.split('ORIGIN_MISMATCH:')[1] || (typeof window !== 'undefined' ? window.location.origin : '');
      throw new Error(
        `Origine JavaScript non autorisée (Erreur 400 origin_mismatch) : Veuillez ajouter « ${origin} » dans Google Cloud Console → Client OAuth 2.0 → Origines JavaScript autorisées.`
      );
    }

    console.warn('GSI flow encountered non-popup issue, trying fallback auth:', gsiError);
    // Fallback to Firebase Auth
    try {
      const fbResult = await firebaseGoogleSignIn();
      if (!fbResult) {
        throw new Error('Connexion annulée.');
      }
      const user: AuthenticatedUser = {
        uid: fbResult.user.uid,
        email: fbResult.user.email,
        displayName: fbResult.user.displayName,
        photoURL: fbResult.user.photoURL,
      };
      cachedToken = fbResult.accessToken;
      cachedUser = user;
      try {
        window.sessionStorage.setItem(TOKEN_STORAGE_KEY, fbResult.accessToken);
        window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      } catch {}
      return { user, accessToken: fbResult.accessToken };
    } catch (fbError: any) {
      const msg = getAuthErrorMessage(fbError);
      throw new Error(msg);
    }
  }
}

/**
 * Universal Auth State Listener
 */
export function initUniversalAuth(
  onSuccess: (user: AuthenticatedUser, token: string) => void,
  onFailure: () => void
) {
  // If we have cached token & user in session, immediately restore
  if (cachedToken && cachedUser) {
    onSuccess(cachedUser, cachedToken);
    return () => {};
  }

  // Otherwise listen to Firebase Auth changes
  return initFirebaseAuth(
    (fbUser: User, fbToken: string) => {
      const user: AuthenticatedUser = {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        photoURL: fbUser.photoURL,
      };
      cachedToken = fbToken;
      cachedUser = user;
      onSuccess(user, fbToken);
    },
    () => {
      // If we don't have session cache, call onFailure
      if (!cachedToken) {
        onFailure();
      }
    }
  );
}

/**
 * Log out and clear all sessions
 */
export async function universalLogout() {
  cachedToken = null;
  cachedUser = null;
  clearAllAccountsStorage();
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch {}
  await firebaseLogout();
}
