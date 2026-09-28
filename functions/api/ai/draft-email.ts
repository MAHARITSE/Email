import { jsonResponse, corsPreflight, generateGeminiWithFallback } from '../_shared';

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost(context: any) {
  try {
    const env = context.env || {};
    const body = await context.request.json().catch(() => ({}));
    const {
      prompt: userPrompt,
      recipient = '',
      tone = 'professionnel',
      language = 'Français',
      length = 'moyen',
      emailContext,
    } = body;

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
      return jsonResponse({ error: 'Consigne manquante' }, 400);
    }

    const defaultDraft = {
      subject: `Message concernant : ${userPrompt.slice(0, 30)}...`,
      body: `Bonjour ${recipient ? recipient : ''},\n\nJe vous contacte concernant : ${userPrompt}.\n\nRestant à votre disposition,\n\nBien cordialement,`,
    };

    if (!env.GEMINI_API_KEY) {
      return jsonResponse(defaultDraft);
    }

    const targetLang =
      language && language !== 'Auto'
        ? language
        : emailContext?.body
        ? "la même langue que le courriel reçu dans le contexte ci-dessous (ex. anglais si le message est en anglais, malagasy si en malagasy, allemand si en allemand)"
        : 'Français';

    let lengthInstruction = 'Longueur moyenne (2 à 3 paragraphes concis).';
    if (length === 'court') {
      lengthInstruction = 'Très court et direct (1 à 2 phrases clés, style réponse rapide).';
    } else if (length === 'détaillé') {
      lengthInstruction = 'Détaillé, complet et très argumenté avec plusieurs paragraphes bien structurés.';
    }

    const contextSection = emailContext
      ? `CONTEXTE DE L'EMAIL AUQUEL ON RÉPOND :
Expéditeur initial : ${emailContext.sender || 'Inconnu'}
Objet initial : ${emailContext.subject || 'Sans objet'}
Dernier message reçu :
"""
${(emailContext.body || '').slice(0, 2000)}
"""
`
      : '';

    const prompt = `Tu es l'assistant Rédacteur d'e-mails IA officiel (inspiré de WriteMail.ai pour Gmail).
Ta mission est de rédiger un e-mail à la perfection selon les choix de l'utilisateur.

PARAMÈTRES EXIGÉS :
- Langue obligatoire : ${targetLang}.
ATTENTION CRUCIALE SUR LA LANGUE : Si le courriel reçu ci-dessous est en Anglais, réponds OBLIGATOIREMENT en Anglais. S'il est en Malagasy, réponds OBLIGATOIREMENT en Malagasy. S'il est en Allemand, réponds en Allemand. S'il est en Espagnol, en Espagnol. Ne réponds SURTOUT PAS arbitrairement en Français si le message d'origine ou la langue demandée est une autre langue !
- Ton : ${tone || 'professionnel et courtois'}
- Format/Longueur : ${lengthInstruction}
- Destinataire : ${recipient || 'Non spécifié'}
- Consigne utilisateur : "${userPrompt}"

${contextSection}

EXIGENCES :
1. L'objet ("subject") doit être accrocheur, clair et directement rédigé dans la même langue cible requise (${targetLang}).
2. Le corps ("body") doit comporter des salutations appropriées, une structure fluide aérée, et une formule de politesse finale élégante dans cette même langue.
3. Si le texte est en Malagasy, utilise une grammaire et un vocabulaire malagasy impeccables (ex: "Salama tompoko", "Misaotra betsaka tamin'ny hafatra...", "Miarahaba am-panajana..."). Si en Anglais, anglais impeccable et naturel ("Hello", "Thank you for reaching out", "Best regards").

Réponds UNIQUEMENT sous forme de JSON valide :
{
  "subject": "Objet rédigé dans la langue requise",
  "body": "Corps complet rédigé dans la langue requise"
}`;

    try {
      const text = await generateGeminiWithFallback(env, prompt, { responseMimeType: 'application/json' });
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try { data = JSON.parse(match[0]); } catch { data = defaultDraft; }
        } else {
          data = defaultDraft;
        }
      }
      return jsonResponse(data);
    } catch (aiErr: any) {
      console.warn('Gemini draft-email fallback:', aiErr?.message);
      return jsonResponse(defaultDraft);
    }
  } catch (err: any) {
    console.error('draft-email error', err);
    return jsonResponse({ error: err?.message || 'Erreur rédaction' }, 500);
  }
}

export async function onRequest(context: any) {
  if (context.request.method === 'OPTIONS') return corsPreflight();
  if (context.request.method === 'POST') return onRequestPost(context);
  return jsonResponse({ error: 'Method not allowed' }, 405);
}
