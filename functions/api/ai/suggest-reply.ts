import { jsonResponse, corsPreflight, generateGeminiWithFallback } from '../_shared';

export async function onRequestOptions() {
  return corsPreflight();
}

function defaultSuggestions(sender?: string) {
  return [
    {
      label: 'Confirmer réception',
      replyText: `Bonjour ${sender ? sender.split(' ')[0] : ''},\n\nBien reçu, merci pour votre retour. Je reviens vers vous rapidement.\n\nBonne journée.`,
      tone: 'positive',
    },
    {
      label: 'Demande de précisions',
      replyText: `Bonjour ${sender ? sender.split(' ')[0] : ''},\n\nMerci pour votre message. Pourriez-vous m'apporter quelques précisions supplémentaires afin que nous puissions avancer ?\n\nBien cordialement.`,
      tone: 'neutral',
    },
    {
      label: 'Décliner poliment',
      replyText: `Bonjour ${sender ? sender.split(' ')[0] : ''},\n\nJe vous remercie pour votre sollicitation. Malheureusement, je ne suis pas en mesure de donner suite favorablement pour le moment.\n\nMerci pour votre compréhension.`,
      tone: 'polite_decline',
    },
  ];
}

export async function onRequestPost(context: any) {
  try {
    const env = context.env || {};
    const body = await context.request.json().catch(() => ({}));
    const {
      subject = '',
      body: emailBody = '',
      sender = '',
      customPrompt = '',
      language = 'Français',
      tone = 'professionnel',
    } = body;

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ suggestions: defaultSuggestions(sender) });
    }

    const targetLang = language && language !== 'Auto' ? language : "la même langue que l'email reçu";

    const prompt = `Tu es un assistant rédaction d'e-mails IA haute performance (WriteMail.ai style).
Analyse le courriel ci-dessous et propose 3 suggestions de réponses intelligentes synthétiques prêtes à envoyer.

Langue obligatoire des réponses : ${targetLang}
Ton général souhaité : ${tone || 'professionnel'}

Format des 3 suggestions :
1. Une réponse positive/acceptation (accord, confirmation, remerciements).
2. Une réponse de clarification/alternative (demande de précision, date/heure alternative).
3. Une réponse de refus poli/report.

${customPrompt ? `Instruction spécifique de l'utilisateur : "${customPrompt}"` : ''}

E-mail reçu :
Expéditeur : ${sender || 'Non spécifié'}
Objet : ${subject || 'Sans objet'}
Corps :
"""
${(emailBody || '').slice(0, 3000)}
"""

Réponds UNIQUEMENT sous forme de JSON valide avec ce schéma exact :
{
  "suggestions": [
    {
      "label": "Titre court du bouton dans la langue (${targetLang}, max 4 mots, ex: Confirmer réception / Mpanaiky)",
      "replyText": "Le texte complet de la réponse en ${targetLang} avec salutations et formule de politesse",
      "tone": "positive" | "clarify" | "decline"
    }
  ]
}`;

    try {
      const text = await generateGeminiWithFallback(env, prompt, { responseMimeType: 'application/json' });
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try { data = JSON.parse(match[0]); } catch { data = { suggestions: defaultSuggestions(sender) }; }
        } else {
          data = { suggestions: defaultSuggestions(sender) };
        }
      }
      return jsonResponse(data);
    } catch (aiErr: any) {
      console.warn('Gemini suggest-reply fallback:', aiErr?.message);
      return jsonResponse({ suggestions: defaultSuggestions(sender) });
    }
  } catch (err: any) {
    console.error('suggest-reply error', err);
    return jsonResponse({ error: err?.message || 'Erreur suggestion' }, 500);
  }
}

export async function onRequest(context: any) {
  if (context.request.method === 'OPTIONS') return corsPreflight();
  if (context.request.method === 'POST') return onRequestPost(context);
  return jsonResponse({ error: 'Method not allowed' }, 405);
}
