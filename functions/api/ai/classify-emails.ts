import { jsonResponse, corsPreflight, classifyEmailsHeuristic, generateGeminiWithFallback } from '../_shared';

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost(context: any) {
  try {
    const env = context.env || {};
    const body = await context.request.json().catch(() => ({}));
    const emails = body?.emails;

    if (!Array.isArray(emails) || emails.length === 0) {
      return jsonResponse({ classifications: {} });
    }

    // If no Gemini key, use heuristic immediately
    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ classifications: classifyEmailsHeuristic(emails) });
    }

    const emailSummaries = emails.slice(0, 30).map((em: any) => ({
      id: em.id,
      from: em.from,
      subject: em.subject,
      snippet: (em.snippet || '').slice(0, 200),
    }));

    const prompt = `Tu es un classificateur d'emails précis.
Classe chacun des emails ci-dessous dans l'une des quatre catégories exactes :
1. "pro" : Emails professionnels, échanges de travail, clients, fournisseurs, factures, offres d'emploi, candidatures, projets pro.
2. "personal" : Emails de personnes physiques privées, famille, amis, échanges personnels réels 1-à-1.
3. "sites" : Newsletters, notifications de plateformes/services web (GitHub, LinkedIn, Twitter, Google alerts, Amazon, Uber, banques automatisées, boutiques e-commerce, confirmation de commandes, réseaux sociaux, abonnements).
4. "other" : Courriers divers, notifications système/administratives, réinitialisation de mots de passe, messages automatiques et autres non classés.

Liste des emails :
${JSON.stringify(emailSummaries, null, 2)}

Réponds UNIQUEMENT avec un JSON contenant un dictionnaire id -> categorie :
{
  "classifications": {
    "email_id_1": "pro" | "personal" | "sites" | "other",
    "email_id_2": "pro" | "personal" | "sites" | "other"
  }
}`;

    try {
      const text = await generateGeminiWithFallback(env, prompt, { responseMimeType: 'application/json' });
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        // Try to extract JSON from markdown fences
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try { data = JSON.parse(match[0]); } catch { data = { classifications: classifyEmailsHeuristic(emails) }; }
        } else {
          data = { classifications: classifyEmailsHeuristic(emails) };
        }
      }
      return jsonResponse(data);
    } catch (aiErr: any) {
      console.warn('Gemini classify fallback to heuristic:', aiErr?.message);
      return jsonResponse({ classifications: classifyEmailsHeuristic(emails), fallback: true });
    }
  } catch (err: any) {
    console.error('classify-emails error', err);
    // Absolute safety: never block inbox
    let fallback = {};
    try {
      const body = await context.request.clone().json().catch(() => ({ emails: [] }));
      if (Array.isArray(body.emails)) fallback = classifyEmailsHeuristic(body.emails);
    } catch {}
    return jsonResponse({ classifications: fallback, fallback: true });
  }
}

export async function onRequest(context: any) {
  if (context.request.method === 'OPTIONS') return corsPreflight();
  if (context.request.method === 'POST') return onRequestPost(context);
  return jsonResponse({ error: 'Method not allowed' }, 405);
}
