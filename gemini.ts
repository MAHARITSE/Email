import type { GoogleGenAI } from '@google/genai';

/* ---------------------------------------------------------------------------
 * RESILIENT GEMINI EXECUTION
 *
 * Objectifs :
 * 1. Ne jamais faire attendre l'utilisateur sur un modèle épuisé.
 * 2. En cas de QUOTA QUOTIDIEN atteint (429 RESOURCE_EXHAUSTED ... "per day"),
 *    basculer AUTOMATIQUEMENT et immédiatement sur une VERSION ANTÉRIEURE de
 *    Gemini (modèles plus anciens = quota journalier distinct).
 * 3. Mémoriser les modèles en quarantaine jusqu'à la réinitialisation du quota
 *    (minuit Pacifique) pour que les requêtes suivantes aillent directement sur
 *    un modèle disponible -> pas de latence ajoutée.
 * ------------------------------------------------------------------------- */

/** Chaîne de modèles : du plus récent au plus ancien. */
const DEFAULT_MODEL_CHAIN = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

type GeminiErrorKind = 'daily_quota' | 'rate_limited' | 'unavailable' | 'fatal' | 'unknown';

interface ModelQuarantine {
  until: number;
  reason: GeminiErrorKind;
}

/** Modèles temporairement indisponibles (quota épuisé / modèle inexistant). */
const modelQuarantine = new Map<string, ModelQuarantine>();
/** Dernier modèle ayant fonctionné : on le réessaie en premier (gain de latence). */
let preferredModel: string | null = null;

function getModelChain(): string[] {
  const fromEnv = (process.env.GEMINI_MODEL_CHAIN || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const chain = fromEnv.length > 0 ? fromEnv : DEFAULT_MODEL_CHAIN;

  const primary = (process.env.GEMINI_MODEL || '').trim();
  const ordered = primary ? [primary, ...chain.filter((m) => m !== primary)] : [...chain];

  if (preferredModel && ordered.includes(preferredModel)) {
    return [preferredModel, ...ordered.filter((m) => m !== preferredModel)];
  }
  return ordered;
}

/**
 * Les quotas Gemini se réinitialisent à minuit (heure du Pacifique).
 * Fallback : 24 h maximum.
 */
function msUntilQuotaReset(): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date());
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
    const secondsToday = get('hour') * 3600 + get('minute') * 60 + get('second');
    const remaining = 86400 - secondsToday;
    return Math.min(Math.max(remaining, 60) * 1000, 24 * 60 * 60 * 1000);
  } catch {
    return 60 * 60 * 1000;
  }
}

function safeStringify(value: any): string {
  try {
    return JSON.stringify(value, Object.getOwnPropertyNames(value || {}));
  } catch {
    return String(value?.message || value || '');
  }
}

function extractStatus(err: any): number | undefined {
  const candidates = [
    err?.status,
    err?.code,
    err?.error?.code,
    err?.error?.status,
    err?.response?.status,
    err?.cause?.status,
  ];
  for (const c of candidates) {
    if (typeof c === 'number') return c;
  }
  const match = /\b(4\d\d|5\d\d)\b/.exec(String(err?.message || ''));
  return match ? Number(match[1]) : undefined;
}

/** Récupère le délai de réessai conseillé par l'API (retryDelay / "retry in 12.5s"). */
function extractRetryDelayMs(err: any): number | undefined {
  const text = `${safeStringify(err)} ${String(err?.message || '')}`;
  const explicit = /retryDelay["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)s?/i.exec(text);
  if (explicit) return Math.round(Number(explicit[1]) * 1000);

  const human = /retry(?:ing)?\s+in\s+(\d+(?:\.\d+)?)\s*s/i.exec(text);
  if (human) return Math.round(Number(human[1]) * 1000);

  return undefined;
}

function classifyGeminiError(err: any): { kind: GeminiErrorKind; retryAfterMs: number } {
  const status = extractStatus(err);
  const text = `${safeStringify(err)} ${String(err?.message || '')}`.toLowerCase();

  const isQuota =
    text.includes('resource_exhausted') ||
    text.includes('resourceexhausted') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('rate-limit');
  const isDailyQuota =
    isQuota &&
    (text.includes('per day') ||
      text.includes('perday') ||
      text.includes('per_day') ||
      text.includes('daily') ||
      text.includes('free tier') ||
      text.includes('free_tier') ||
      text.includes('free-tier'));

  if (isDailyQuota || (status === 429 && isQuota && !extractRetryDelayMs(err))) {
    return { kind: 'daily_quota', retryAfterMs: msUntilQuotaReset() };
  }

  if (status === 429 || (isQuota && extractRetryDelayMs(err))) {
    const retryAfterMs = Math.min(extractRetryDelayMs(err) || 5000, 30000);
    return { kind: 'rate_limited', retryAfterMs };
  }

  if (
    status === 503 ||
    status === 500 ||
    text.includes('unavailable') ||
    text.includes('high demand') ||
    text.includes('overloaded') ||
    text.includes('deadline') ||
    text.includes('internal error')
  ) {
    return { kind: 'unavailable', retryAfterMs: 1500 };
  }

  if (
    status === 404 ||
    (status === 400 &&
      (text.includes('not found') ||
        text.includes('is not supported') ||
        text.includes('unsupported') ||
        text.includes('invalid model') ||
        text.includes('unknown model')))
  ) {
    // Modèle inexistant (version trop récente/ancienne pour cette clé) : on le met de côté.
    return { kind: 'fatal', retryAfterMs: 6 * 60 * 60 * 1000 };
  }

  return { kind: 'unknown', retryAfterMs: 0 };
}

export class GeminiFallbackError extends Error {
  code: 'ALL_MODELS_EXHAUSTED' | 'GEMINI_ERROR';
  /** Moment (epoch ms) auquel le premier modèle redeviendra disponible. */
  resetAt?: number;

  constructor(code: 'ALL_MODELS_EXHAUSTED' | 'GEMINI_ERROR', message: string, resetAt?: number) {
    super(message);
    this.name = 'GeminiFallbackError';
    this.code = code;
    this.resetAt = resetAt;
  }
}

/**
 * Exécute une requête Gemini en basculant automatiquement sur une version
 * antérieure de Gemini dès qu'un quota (notamment quotidien) est atteint.
 */
export async function generateGeminiWithFallbackAndRetry(
  ai: GoogleGenAI,
  contents: string,
  config?: any
) {
  const chain = getModelChain();
  let lastError: any = null;
  let earliestReset: number | undefined;

  for (const model of chain) {
    const quarantined = modelQuarantine.get(model);
    if (quarantined && quarantined.until > Date.now()) {
      // Modèle en quarantaine (quota quotidien atteint) : on passe à l'ancienne version
      // SANS attendre, pour ne pas rallonger le délai d'exécution.
      earliestReset = Math.min(earliestReset ?? quarantined.until, quarantined.until);
      continue;
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({ model, contents, config });
        modelQuarantine.delete(model);
        preferredModel = model;
        return response;
      } catch (err: any) {
        lastError = err;
        const { kind, retryAfterMs } = classifyGeminiError(err);

        if (kind === 'daily_quota' || kind === 'fatal') {
          // Quota quotidien atteint ou modèle indisponible pour cette clé :
          // quarantaine immédiate + bascule sur la version antérieure suivante.
          const until = Date.now() + retryAfterMs;
          modelQuarantine.set(model, { until, reason: kind });
          earliestReset = Math.min(earliestReset ?? until, until);
          console.warn(
            `[Gemini] ${model} indisponible (${kind}) -> bascule automatique sur une version antérieure` +
              (kind === 'daily_quota'
                ? `, réinitialisation dans ${Math.round(retryAfterMs / 60000)} min.`
                : '.')
          );
          break;
        }

        if (kind === 'rate_limited' || kind === 'unavailable') {
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterMs, 6000)));
            continue;
          }
          // Petite quarantaine douce pour éviter de re-taper sur un modèle saturé.
          modelQuarantine.set(model, { until: Date.now() + 15000, reason: kind });
          break;
        }

        // Erreur non réessayable (requête invalide, etc.)
        break;
      }
    }
  }

  const message =
    earliestReset && earliestReset > Date.now()
      ? `Quota IA quotidien atteint sur tous les modèles Gemini. Réessayez après ${new Date(
          earliestReset
        ).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`
      : lastError?.message || 'Service IA temporairement indisponible';

  throw new GeminiFallbackError('ALL_MODELS_EXHAUSTED', message, earliestReset);
}

/** Décrit proprement un échec Gemini pour les réponses API. */
export function describeGeminiFailure(err: any): { warning: string; quotaExceeded: boolean } {
  const isQuota = err?.code === 'ALL_MODELS_EXHAUSTED' || /quota|resource_exhausted|429/i.test(String(err?.message || ''));
  return {
    warning: isQuota
      ? String(err?.message || 'Quota IA atteint')
      : 'Service IA temporairement surchargé',
    quotaExceeded: isQuota,
  };
}

export function getGeminiModelStatus() {
  const now = Date.now();
  return getModelChain().map((model) => {
    const q = modelQuarantine.get(model);
    return {
      model,
      available: !q || q.until <= now,
      reason: q && q.until > now ? q.reason : undefined,
      availableInMs: q && q.until > now ? q.until - now : 0,
    };
  });
}


/** Modèle ayant répondu avec succès en dernier (affiché dans /api/health). */
export function getActiveModel(): string | null {
  return preferredModel;
}

/** Remet à zéro l'état des modèles (utile pour les tests). */
export function resetGeminiModelState() {
  modelQuarantine.clear();
  preferredModel = null;
}
