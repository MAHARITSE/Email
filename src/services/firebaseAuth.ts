import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
// Prompt user to select account and ensure fresh consent if needed
provider.setCustomParameters({
  prompt: 'select_account',
});

const TOKEN_STORAGE_KEY = 'gmail_net_oauth_access_token';

let isSigningIn = false;
let cachedAccessToken: string | null = null;
try {
  if (typeof window !== 'undefined') {
    cachedAccessToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  }
} catch {
  // Ignore storage access restrictions
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (!cachedAccessToken && typeof window !== 'undefined') {
        try {
          cachedAccessToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
        } catch {
          // Ignore
        }
      }
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token was not preserved in memory after refresh; user can click sign-in
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        }
      } catch {
        // Ignore
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const getAuthErrorMessage = (error: any): string => {
  if (!error) return 'Une erreur d\'authentification inattendue est survenue.';
  const code = error?.code || '';
  const message = typeof error?.message === 'string' ? error.message : '';

  if (code === 'auth/popup-closed-by-user' || message.includes('popup-closed-by-user')) {
    return 'La fenêtre de connexion Google a été fermée avant la fin de l\'autorisation. Veuillez cliquer sur S\'authentifier et garder la fenêtre popup ouverte jusqu\'à la sélection de votre compte Google.';
  }
  if (code === 'auth/popup-blocked' || message.includes('popup-blocked')) {
    return 'La fenêtre contextuelle de connexion a été bloquée par votre navigateur. Veuillez autoriser les fenêtres popups pour ce site, ou ouvrir l\'application dans un nouvel onglet.';
  }
  if (code === 'auth/cancelled-popup-request' || message.includes('cancelled-popup-request')) {
    return 'La tentative d\'authentification a été interrompue. Veuillez réessayer.';
  }
  if (code === 'auth/network-request-failed' || message.includes('network-request-failed')) {
    return 'Problème de connexion réseau. Veuillez vérifier votre connexion Internet et réessayer.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Ce domaine n\'est pas autorisé dans la configuration Firebase Auth.';
  }

  const cleaned = message.replace(/^Firebase:\s*Error\s*\((.*?)\)\.?$/i, '$1').trim();
  return cleaned || error?.message || 'Échec de l\'authentification avec Google. Veuillez réessayer.';
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google Authentication');
    }

    cachedAccessToken = credential.accessToken;
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(TOKEN_STORAGE_KEY, credential.accessToken);
      }
    } catch {
      // Ignore storage errors
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    const isUserClosed =
      error?.code === 'auth/popup-closed-by-user' ||
      (typeof error?.message === 'string' && error.message.includes('popup-closed-by-user'));

    if (isUserClosed) {
      console.warn('Google sign-in popup was closed before completing auth flow.');
    } else {
      console.error('Sign in error:', error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
};
