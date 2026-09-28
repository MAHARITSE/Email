import { jsonResponse, corsPreflight, generateGeminiWithFallback } from '../_shared';

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost(context: any) {
  try {
    const env = context.env || {};
    const body = await context.request.json().catch(() => ({}));
    const { text, action = 'proofread', instructions = '', language = 'Français' } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return jsonResponse({ error: 'Texte manquant' }, 400);
    }

    if (!env.GEMINI_API_KEY) {
      let fallbackText = text.trim();
      if (action === 'concise') {
        fallbackText = fallbackText.split('\n').filter(Boolean).slice(0, 3).join('\n');
      } else if (action === 'professional') {
        fallbackText = `Bonjour,\n\n${fallbackText}\n\nCordialement,`;
      }
      return jsonResponse({
        improvedText: fallbackText,
        explanation: 'Correction automatique (Clé Gemini non configurée).',
      });
    }

    let promptActionDescription = '';
    switch (action) {
      case 'proofread':
        promptActionDescription = 'Corrige toutes les fautes d’orthographe, de grammaire, de ponctuation et de syntaxe en conservant scrupuleusement le sens et le ton de l’auteur.';
        break;
      case 'professional':
        promptActionDescription = 'Réécris cet email avec un ton hautement professionnel, soigné, courtois et adapté au monde du travail et des affaires.';
        break;
      case 'concise':
        promptActionDescription = 'Rends cet email direct, clair et concis en éliminant les redondances tout en gardant tous les points clés essentiels.';
        break;
      case 'friendly':
        promptActionDescription = 'Adopte un ton chaleureux, bienveillant, convivial et poli tout en restant clair.';
        break;
      case 'formal':
        promptActionDescription = 'Adopte un registre formel, soutenu avec des formules de politesse protocolaires irréprochables.';
        break;
      case 'persuasive':
        promptActionDescription = 'Adopte un ton persuasif, convaincant et commercial pour inciter le destinataire à l\'action.';
        break;
      case 'translate':
        promptActionDescription = `Traduis fidèlement cet email vers la langue : ${language}.`;
        break;
      case 'custom':
        promptActionDescription = instructions || 'Améliore la clarté et la qualité de ce message.';
        break;
      default:
        promptActionDescription = 'Corrige et améliore la qualité de ce texte.';
    }

    const targetLang = language && language !== 'Auto' ? language : "la même langue que le texte d'origine";

    const prompt = `Tu es un assistant expert en communication par email (style Official AI Email Writer / WriteMail.ai).
Tâche : ${promptActionDescription}
${instructions ? `Instruction spécifique : ${instructions}` : ''}
Langue cible souhaitée pour le rendu final : ${targetLang}

Consignes strictes :
1. Conserve impérativement la langue du texte d'origine ou traduis fidèlement dans la langue demandée : "${targetLang}". Si le texte d'origine est en anglais, conserve l'anglais. S'il est en malagasy, conserve le malagasy. Ne bascule JAMAIS vers le français si le texte ou la langue demandée est une autre langue.
2. Fournis directement le texte réécrit/amélioré, sans formules d'introduction comme "Voici votre email corrigé :", sans guillemets superflus, ni balises markdown.

Texte original :
"""
${text}
"""`;

    try {
      const improvedText = (await generateGeminiWithFallback(env, prompt)).trim();
      return jsonResponse({ improvedText });
    } catch (aiErr: any) {
      console.warn('Gemini improve-email fallback:', aiErr?.message);
      let fallbackText = text.trim();
      if (action === 'professional' && !fallbackText.startsWith('Bonjour')) {
        fallbackText = `Bonjour,\n\n${fallbackText}\n\nCordialement,`;
      }
      return jsonResponse({ improvedText: fallbackText, warning: 'Service IA temporairement surchargé' });
    }
  } catch (err: any) {
    console.error('improve-email error', err);
    return jsonResponse({ error: err?.message || 'Erreur IA' }, 500);
  }
}

export async function onRequest(context: any) {
  if (context.request.method === 'OPTIONS') return corsPreflight();
  if (context.request.method === 'POST') return onRequestPost(context);
  return jsonResponse({ error: 'Method not allowed' }, 405);
}
