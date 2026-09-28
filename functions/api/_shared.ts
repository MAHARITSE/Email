// Shared utilities for Cloudflare Pages Functions
// This file is prefixed with _ so it is NOT routed as an endpoint

export interface Env {
  GEMINI_API_KEY?: string;
  VITE_GOOGLE_CLIENT_ID?: string;
  [key: string]: any;
}

export function jsonResponse(data: any, status = 200, extraHeaders: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders
    }
  });
}

export function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// Heuristic classifier (same as server.ts)
export function classifyEmailsHeuristic(emails: Array<{ id: string; from?: string; subject?: string; snippet?: string }>) {
  const result: Record<string, 'pro' | 'personal' | 'sites' | 'other'> = {};
  for (const em of emails) {
    const from = (em.from || '').toLowerCase();
    const snippet = (em.snippet || '').toLowerCase();
    const subject = (em.subject || '').toLowerCase();

    const isSiteOrNotification =
      from.includes('noreply') ||
      from.includes('no-reply') ||
      from.includes('newsletter') ||
      from.includes('notification') ||
      from.includes('notifications') ||
      from.includes('info@') ||
      from.includes('support@') ||
      from.includes('news@') ||
      from.includes('service@') ||
      from.includes('team@') ||
      from.includes('alert') ||
      snippet.includes('désinscrire') ||
      snippet.includes('unsubscribe') ||
      snippet.includes('désabonner') ||
      from.includes('github.com') ||
      from.includes('google.com') ||
      from.includes('linkedin.com') ||
      from.includes('twitter.com') ||
      from.includes('x.com') ||
      from.includes('amazon.') ||
      from.includes('apple.com') ||
      from.includes('stripe.com') ||
      from.includes('paypal.com') ||
      from.includes('slack.com') ||
      from.includes('notion.so') ||
      from.includes('figma.com') ||
      from.includes('medium.com') ||
      from.includes('discord.com');

    if (isSiteOrNotification) {
      result[em.id] = 'sites';
      continue;
    }

    const isPersonalDomain =
      from.includes('@gmail.') ||
      from.includes('@outlook.') ||
      from.includes('@yahoo.') ||
      from.includes('@hotmail.') ||
      from.includes('@icloud.') ||
      from.includes('@free.fr') ||
      from.includes('@orange.fr') ||
      from.includes('@sfr.fr') ||
      from.includes('@laposte.net');

    const hasProKeyword =
      subject.includes('facture') ||
      subject.includes('devis') ||
      subject.includes('contrat') ||
      subject.includes('réunion') ||
      subject.includes('projet') ||
      subject.includes('recrutement') ||
      subject.includes('candidature') ||
      snippet.includes('facture') ||
      snippet.includes('devis') ||
      snippet.includes('contrat');

    const isOtherNotification =
      from.includes('admin') ||
      from.includes('securit') ||
      from.includes('auth') ||
      from.includes('verification') ||
      subject.includes('code de confirmation') ||
      subject.includes('sécurité') ||
      snippet.includes('automatique');

    if (hasProKeyword) {
      result[em.id] = 'pro';
    } else if (isOtherNotification) {
      result[em.id] = 'other';
    } else if (isPersonalDomain) {
      result[em.id] = 'personal';
    } else {
      result[em.id] = 'pro';
    }
  }
  return result;
}

// Gemini via REST API (compatible with Cloudflare Workers)
export async function generateGeminiWithFallback(
  env: Env,
  prompt: string,
  config?: { responseMimeType?: string }
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY || (env as any).GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY missing');
  }

  // Use stable, publicly available models. Original code used non-existent 3.8-flash, so we map to real models.
  const candidateModels = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
  ];

  let lastError: any = null;

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const body: any = {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
        };
        if (config?.responseMimeType === 'application/json') {
          body.generationConfig = {
            responseMimeType: 'application/json',
          };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          const isTransient = res.status === 429 || res.status === 503 || res.status === 500 || res.status === 502;
          if (isTransient && attempt === 0) {
            await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
            continue;
          }
          throw new Error(`Gemini API ${res.status} ${model}: ${errText.slice(0, 500)}`);
        }

        const data: any = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
        // Sometimes response is empty
        throw new Error(`Empty response from ${model}`);
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        const isBusy = msg.includes('503') || msg.includes('429') || msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('500') || msg.includes('502');
        if (isBusy && attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        break;
      }
    }
  }
  throw lastError;
}
