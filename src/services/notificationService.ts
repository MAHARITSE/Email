/**
 * GMAIL-PRO Notification Service
 * Synchronized with Phone & Computer Operating System modes:
 * - HTML5 / Web Notifications on Desktop & Mobile (iOS Safari PWA, Android Chrome, Windows, macOS)
 * - Real-time synchronization with OS permission changes (navigator.permissions)
 * - OS App Badging API (navigator.setAppBadge / clearAppBadge on Dock & Home screen)
 * - Mobile Haptic Vibration respecting system motion preferences
 * - Web Audio API synthesized harmonic chime
 * - Native Service Worker notification delivery for mobile lock screens
 */

import { ParsedEmail } from '../types/gmail';

const NOTIF_SOUND_KEY = 'gmail_pro_notif_sound_enabled';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Checks if the system prefers reduced motion / quiet environment
 */
export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Play a high-quality modern notification chime
 */
export function playNotificationSound(): void {
  try {
    const soundEnabled = isSoundEnabled();
    if (!soundEnabled) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Harmonic multi-tone notification chime (D5 -> A5 -> D6)
    const tones = [
      { freq: 587.33, start: 0, duration: 0.15, gain: 0.14 },    // D5
      { freq: 880.0, start: 0.1, duration: 0.18, gain: 0.16 },    // A5
      { freq: 1174.66, start: 0.22, duration: 0.35, gain: 0.18 },  // D6
    ];

    tones.forEach(({ freq, start, duration, gain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);

      gainNode.gain.setValueAtTime(0, now + start);
      gainNode.gain.linearRampToValueAtTime(gain, now + start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + duration);
    });

    // Mobile haptic vibration if supported and not in reduced motion mode
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && !isReducedMotionPreferred()) {
      navigator.vibrate([100, 50, 100]);
    }
  } catch (err) {
    console.debug('Notification chime skipped or blocked by device policy:', err);
  }
}

/**
 * Check if Web Notifications are supported in current browser/OS
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Check if Notifications are currently granted by the system
 */
export function isNotificationGranted(): boolean {
  if (!isNotificationSupported()) return false;
  return Notification.permission === 'granted';
}

/**
 * Get current notification permission state
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

/**
 * Watch for system/browser permission changes (e.g. user toggles in OS settings)
 */
export function watchSystemNotificationPermission(
  onChange: (permission: NotificationPermission) => void
): () => void {
  if (
    typeof navigator === 'undefined' ||
    !('permissions' in navigator) ||
    !navigator.permissions.query
  ) {
    return () => {};
  }

  let statusObj: PermissionStatus | null = null;

  navigator.permissions
    .query({ name: 'notifications' as PermissionName })
    .then((status) => {
      statusObj = status;
      const handleStatusChange = () => {
        const mappedState: NotificationPermission =
          status.state === 'granted'
            ? 'granted'
            : status.state === 'denied'
            ? 'denied'
            : 'default';
        onChange(mappedState);
      };
      status.addEventListener('change', handleStatusChange);
    })
    .catch(() => {});

  return () => {
    if (statusObj) {
      statusObj.removeEventListener('change', () => {});
    }
  };
}

/**
 * Update system app icon badge (macOS Dock, Windows Taskbar, Android/iOS PWA icon)
 */
export function updateAppBadge(unreadCount: number): void {
  if (typeof navigator === 'undefined') return;

  try {
    const nav = navigator as any;
    if (unreadCount > 0 && typeof nav.setAppBadge === 'function') {
      nav.setAppBadge(unreadCount).catch(() => {});
    } else if (unreadCount <= 0 && typeof nav.clearAppBadge === 'function') {
      nav.clearAppBadge().catch(() => {});
    }
  } catch {}
}

/**
 * Request notification permission from user / OS prompt
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Warm up audio context on user click gesture
      getAudioContext();
    }
    return permission;
  } catch {
    return Notification.permission;
  }
}

/**
 * Check if notification sound is enabled in preferences
 */
export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = localStorage.getItem(NOTIF_SOUND_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

/**
 * Toggle or set notification sound preference
 */
export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTIF_SOUND_KEY, String(enabled));
  } catch {}
}

/**
 * Dispatch an OS / Browser Notification for a new message following device mode
 */
export async function notifyNewEmail(
  email: ParsedEmail,
  onOpen?: () => void
): Promise<void> {
  // Always trigger sound & vibration
  playNotificationSound();

  // If OS Notification is not granted, exit
  if (!isNotificationGranted()) return;

  const title = `Nouveau message : ${email.fromName || email.fromEmail.split('@')[0] || 'Inconnu'}`;
  const cleanBody = email.subject
    ? `${email.subject}\n${(email.snippet || email.bodyText || '').slice(0, 100)}`
    : (email.snippet || email.bodyText || '').slice(0, 120);

  const options: NotificationOptions & { renotify?: boolean } = {
    body: cleanBody || 'Cliquez pour ouvrir le message dans GMAIL-PRO.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `email-${email.id}`,
    renotify: true,
    requireInteraction: false,
    silent: !isSoundEnabled(),
  };

  // Try service worker notification first if available on mobile PWA
  if (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    navigator.serviceWorker.controller
  ) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        return;
      }
    } catch {}
  }

  // Fallback to standard window Notification
  try {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
      if (onOpen) onOpen();
    };
  } catch (err) {
    console.debug('Error showing standard Notification:', err);
  }
}

/**
 * Dispatch an Agenda Event notification (2 days in advance, 9h and 16h)
 */
export async function notifyAgendaEvent(details: {
  title: string;
  advanceText: string;
  time: string;
  description?: string;
  slotText: string;
}): Promise<void> {
  playNotificationSound();

  if (!isNotificationGranted()) return;

  const notifTitle = `📅 Agenda (${details.advanceText}) : ${details.title}`;
  const cleanBody = `⏰ Heure : ${details.time} | ${details.slotText}${
    details.description ? `\n${details.description.slice(0, 100)}` : ''
  }`;

  const options: NotificationOptions & { renotify?: boolean } = {
    body: cleanBody,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `agenda-${details.title.slice(0, 20).replace(/\s+/g, '-')}`,
    renotify: true,
    requireInteraction: false,
    silent: !isSoundEnabled(),
  };

  try {
    const notification = new Notification(notifTitle, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (err) {
    console.debug('Error showing Agenda Notification:', err);
  }
}

/**
 * Send a test notification to verify audio and OS notifications
 */
export async function sendTestNotification(): Promise<boolean> {
  playNotificationSound();

  if (!isNotificationGranted()) {
    const perm = await requestNotificationPermission();
    if (perm !== 'granted') return false;
  }

  try {
    const testOptions: NotificationOptions & { renotify?: boolean } = {
      body: 'Notifications synchronisées avec le mode de votre système (PC, Mac, iPhone, Android).',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'test-notification',
      renotify: true,
      silent: !isSoundEnabled(),
    };
    const testNotif = new Notification('🔔 GMAIL-PRO : Notifications synchronisées !', testOptions);
    testNotif.onclick = () => {
      window.focus();
      testNotif.close();
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Known email IDs tracker to prevent duplicate notifications
 */
export function getKnownEmailIds(userEmail?: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const key = `gmail_known_ids_${(userEmail || 'default').toLowerCase()}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function saveKnownEmailIds(ids: Set<string>, userEmail?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `gmail_known_ids_${(userEmail || 'default').toLowerCase()}`;
    const arr = Array.from(ids).slice(-500); // Keep last 500
    sessionStorage.setItem(key, JSON.stringify(arr));
  } catch {}
}
