import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy initialization of Gemini client
let geminiClient: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

/**
 * Resilient Gemini execution helper:
 * - Uses gemini-3.8-flash as primary model
 * - Handles 503 (high demand / unavailable) and 429 (rate limits) with automatic retry and backoff
 * - Falls back to gemini-flash-latest and gemini-3.1-flash-lite if the primary model is busy
 */
async function generateGeminiWithFallbackAndRetry(
  ai: GoogleGenAI,
  contents: string,
  config?: any
) {
  const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
  let lastError: any = null;

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err);
        const isBusyOrTransient =
          msg.includes('503') ||
          msg.includes('high demand') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED');

        if (isBusyOrTransient && attempt === 0) {
          // Short delay before retrying or switching models
          await new Promise((resolve) => setTimeout(resolve, 600));
          continue;
        }
        // If second attempt or other error, break out and try next candidate model
        break;
      }
    }
  }

  throw lastError;
}

/**
 * Rule-based heuristic email classifier (fast & deterministic)
 */
function classifyEmailsHeuristic(emails: Array<{ id: string; from?: string; subject?: string; snippet?: string }>) {
  const result: Record<string, 'pro' | 'personal' | 'sites'> = {};

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
      snippet.includes('se désinscrire') ||
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

    if (hasProKeyword) {
      result[em.id] = 'pro';
    } else if (isPersonalDomain) {
      result[em.id] = 'personal';
    } else {
      result[em.id] = 'pro';
    }
  }

  return result;
}

// API Health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// 1. Améliorer / Corriger un email avec Gemini
app.post('/api/ai/improve-email', async (req, res) => {
  try {
    const { text, action = 'proofread', instructions = '' } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Texte manquant' });
    }

    const ai = getGemini();
    if (!ai) {
      // Fallback si la clé n'est pas encore renseignée
      let fallbackText = text.trim();
      if (action === 'concise') {
        fallbackText = fallbackText.split('\n').filter(Boolean).slice(0, 3).join('\n');
      } else if (action === 'professional') {
        fallbackText = `Bonjour,\n\n${fallbackText}\n\nCordialement,`;
      }
      return res.json({
        improvedText: fallbackText,
        explanation: 'Correction automatique (Clé Gemini en attente dans Settings > Secrets).',
      });
    }

    let promptActionDescription = '';
    switch (action) {
      case 'proofread':
        promptActionDescription =
          'Corrige toutes les fautes d’orthographe, de grammaire, de ponctuation et de syntaxe en conservant scrupuleusement le sens et le ton de l’auteur.';
        break;
      case 'professional':
        promptActionDescription =
          'Réécris cet email avec un ton hautement professionnel, soigné, courtois et adapté au monde du travail et des affaires.';
        break;
      case 'concise':
        promptActionDescription =
          'Rends cet email direct, clair et concis en éliminant les redondances tout en gardant tous les points clés essentiels.';
        break;
      case 'friendly':
        promptActionDescription =
          'Adopte un ton chaleureux, bienveillant, convivial et poli tout en restant clair.';
        break;
      case 'formal':
        promptActionDescription =
          'Adopte un registre formel, soutenu avec des formules de politesse protocolaires irréprochables.';
        break;
      case 'custom':
        promptActionDescription = instructions || 'Améliore la clarté et la qualité de ce message.';
        break;
      default:
        promptActionDescription = 'Corrige et améliore la qualité de ce texte.';
    }

    const prompt = `Tu es un assistant expert en communication par email.
Tâche : ${promptActionDescription}
${instructions ? `Instruction supplémentaire de l'utilisateur : ${instructions}` : ''}

Consignes strictes :
1. Reste dans la langue de l'email original (généralement en français sauf si l'email est dans une autre langue).
2. Fournis directement le texte réécrit/amélioré, sans formules d'introduction comme "Voici votre email corrigé :", sans guillemets superflus, ni balises markdown superflues.

Texte original :
"""
${text}
"""`;

    try {
      const response = await generateGeminiWithFallbackAndRetry(ai, prompt);
      const improvedText = response.text?.trim() || text;
      return res.json({ improvedText });
    } catch (aiErr: any) {
      console.warn('Gemini improve-email temporairement indisponible, utilisation du texte de secours:', aiErr?.message);
      // Fallback gracieux sans renvoyer de code d'erreur bloquant 500
      let fallbackText = text.trim();
      if (action === 'professional' && !fallbackText.startsWith('Bonjour')) {
        fallbackText = `Bonjour,\n\n${fallbackText}\n\nCordialement,`;
      }
      return res.json({ improvedText: fallbackText, warning: 'Service IA temporairement surchargé' });
    }
  } catch (error: any) {
    console.error('Erreur improve-email:', error);
    return res.status(500).json({ error: error.message || 'Erreur lors du traitement IA' });
  }
});

// 2. Proposer des réponses intelligentes (Smart Replies)
app.post('/api/ai/suggest-reply', async (req, res) => {
  try {
    const { subject = '', body = '', sender = '', customPrompt = '' } = req.body;

    const defaultSuggestions = [
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

    const ai = getGemini();
    if (!ai) {
      return res.json({ suggestions: defaultSuggestions });
    }

    const prompt = `Tu es un assistant email personnel intelligent.
Analyse le courriel ci-dessous et propose 3 suggestions de réponses différentes prêtes à être envoyées (courtes, pertinentes et naturelles en français) :
1. Une réponse positive ou confirmative (ex: accord, confirmation, remerciements).
2. Une réponse demandant des précisions ou proposant une alternative.
3. Une réponse déclinant poliment ou reportant l'échange.

${customPrompt ? `Note personnalisée souhaitée par l'utilisateur : "${customPrompt}" (intègre cette intention si pertinente)` : ''}

Informations sur le courriel reçu :
Expéditeur : ${sender || 'Non spécifié'}
Objet : ${subject || 'Sans objet'}
Corps du message :
"""
${(body || '').slice(0, 3000)}
"""

Réponds UNIQUEMENT sous forme de JSON valide avec le schéma suivant :
{
  "suggestions": [
    {
      "label": "Titre court du bouton (max 4 mots, ex: Confirmer réception)",
      "replyText": "Le texte complet de la réponse prête à envoyer avec salutations et formule de politesse",
      "tone": "positive" | "clarify" | "decline"
    }
  ]
}`;

    try {
      const response = await generateGeminiWithFallbackAndRetry(ai, prompt, {
        responseMimeType: 'application/json',
      });

      const responseText = response.text || '{}';
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { suggestions: defaultSuggestions };
      }

      return res.json(data);
    } catch (aiErr: any) {
      console.warn('Gemini suggest-reply temporairement indisponible, utilisation des réponses types:', aiErr?.message);
      return res.json({ suggestions: defaultSuggestions });
    }
  } catch (error: any) {
    console.error('Erreur suggest-reply:', error);
    return res.status(500).json({ error: error.message || 'Erreur lors de la suggestion' });
  }
});

// 3. Rédiger un nouvel email à partir d'une consigne
app.post('/api/ai/draft-email', async (req, res) => {
  try {
    const { prompt: userPrompt, recipient = '', tone = 'professionnel' } = req.body;

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
      return res.status(400).json({ error: 'Consigne manquante' });
    }

    const defaultDraft = {
      subject: `Message concernant : ${userPrompt.slice(0, 30)}...`,
      body: `Bonjour ${recipient ? recipient : ''},\n\nJe vous contacte concernant la demande suivante : ${userPrompt}.\n\nRestant à votre disposition pour tout échange,\n\nBien cordialement,`,
    };

    const ai = getGemini();
    if (!ai) {
      return res.json(defaultDraft);
    }

    const prompt = `Tu es un assistant de rédaction d'emails de haut niveau.
Rédige un email complet et soigné à partir de la consigne suivante :
Consigne : "${userPrompt}"
Destinataire ciblé : ${recipient || 'Non spécifié'}
Ton souhaité : ${tone || 'professionnel et courtois'}

Consignes :
1. Rédige en français impeccable (sauf si la consigne demande une autre langue).
2. Fournis un objet (subject) percutant, précis et engageant.
3. Fournis un corps (body) bien structuré avec salutations adaptées, paragraphes aérés et formule de politesse.

Réponds UNIQUEMENT en JSON avec ce format :
{
  "subject": "Objet de l'email",
  "body": "Corps complet du message rédigé"
}`;

    try {
      const response = await generateGeminiWithFallbackAndRetry(ai, prompt, {
        responseMimeType: 'application/json',
      });

      const responseText = response.text || '{}';
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = defaultDraft;
      }

      return res.json(data);
    } catch (aiErr: any) {
      console.warn('Gemini draft-email temporairement indisponible, utilisation du canevas par défaut:', aiErr?.message);
      return res.json(defaultDraft);
    }
  } catch (error: any) {
    console.error('Erreur draft-email:', error);
    return res.status(500).json({ error: error.message || 'Erreur lors de la rédaction' });
  }
});

// 4. Classifier des emails en Pro / Perso / Sites & Abonnements
app.post('/api/ai/classify-emails', async (req, res) => {
  try {
    const { emails } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.json({ classifications: {} });
    }

    const ai = getGemini();
    if (!ai) {
      // Heuristiques locales si clé absente
      return res.json({ classifications: classifyEmailsHeuristic(emails) });
    }

    const emailSummaries = emails.slice(0, 30).map((em) => ({
      id: em.id,
      from: em.from,
      subject: em.subject,
      snippet: (em.snippet || '').slice(0, 200),
    }));

    const prompt = `Tu es un classificateur d'emails précis.
Classe chacun des emails ci-dessous dans l'une des trois catégories exactes :
1. "pro" : Emails professionnels, échanges de travail, clients, fournisseurs, factures, offres d'emploi, candidatures, projets pro.
2. "personal" : Emails de personnes physiques privées, famille, amis, échanges personnels réels 1-à-1.
3. "sites" : Newsletters, notifications de plateformes/services web (GitHub, LinkedIn, Twitter, Google alerts, Amazon, Uber, banques automatisées, boutiques e-commerce, confirmation de commandes, réseaux sociaux, abonnements).

Liste des emails :
${JSON.stringify(emailSummaries, null, 2)}

Réponds UNIQUEMENT avec un JSON contenant un dictionnaire id -> categorie :
{
  "classifications": {
    "email_id_1": "pro" | "personal" | "sites",
    "email_id_2": "pro" | "personal" | "sites"
  }
}`;

    try {
      const response = await generateGeminiWithFallbackAndRetry(ai, prompt, {
        responseMimeType: 'application/json',
      });

      const responseText = response.text || '{}';
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { classifications: classifyEmailsHeuristic(emails) };
      }

      return res.json(data);
    } catch (aiErr: any) {
      // Si Gemini subit une hausse de demande (503) ou indisponibilité temporaire, basculer instantanément sur la classification heuristique
      console.warn(
        'Note: Gemini indisponible temporairement pour classify-emails, bascule sur la classification heuristique:',
        aiErr?.message
      );
      return res.json({
        classifications: classifyEmailsHeuristic(emails),
        fallback: true,
      });
    }
  } catch (error: any) {
    console.error('Erreur classify-emails:', error);
    // Sécurité absolue : ne jamais bloquer la boîte de réception
    const safeFallback = Array.isArray(req.body?.emails) ? classifyEmailsHeuristic(req.body.emails) : {};
    return res.json({ classifications: safeFallback, fallback: true });
  }
});

// Vite middleware for development & static file serving for production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
