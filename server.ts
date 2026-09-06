import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

// API Health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// 1. Améliorer / Corriger / Traduire un email avec Gemini
app.post('/api/ai/improve-email', async (req, res) => {
  try {
    const { text, action = 'proofread', instructions = '', language = 'Français' } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Texte manquant' });
    }

    const ai = getGemini();
    if (!ai) {
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
      case 'persuasive':
        promptActionDescription =
          'Adopte un ton persuasif, convaincant et commercial pour inciter le destinataire à l\'action.';
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

    const targetLang = language && language !== 'Auto' ? language : 'la même langue que le texte d\'origine';

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
      const response = await generateGeminiWithFallbackAndRetry(ai, prompt);
      const improvedText = response.text?.trim() || text;
      return res.json({ improvedText });
    } catch (aiErr: any) {
      console.warn('Gemini improve-email temporairement indisponible, utilisation du texte de secours:', aiErr?.message);
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

// 2. Proposer des réponses intelligentes (Smart Replies WriteMail.ai style)
app.post('/api/ai/suggest-reply', async (req, res) => {
  try {
    const {
      subject = '',
      body = '',
      sender = '',
      customPrompt = '',
      language = 'Français',
      tone = 'professionnel',
    } = req.body;

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

    const targetLang = language && language !== 'Auto' ? language : 'la même langue que l\'email reçu';

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
${(body || '').slice(0, 3000)}
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

// 3. Rédiger un e-mail complet (Rédacteur IA WriteMail.ai style)
app.post('/api/ai/draft-email', async (req, res) => {
  try {
    const {
      prompt: userPrompt,
      recipient = '',
      tone = 'professionnel',
      language = 'Français',
      length = 'moyen',
      emailContext,
    } = req.body;

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
      return res.status(400).json({ error: 'Consigne manquante' });
    }

    const defaultDraft = {
      subject: `Message concernant : ${userPrompt.slice(0, 30)}...`,
      body: `Bonjour ${recipient ? recipient : ''},\n\nJe vous contacte concernant : ${userPrompt}.\n\nRestant à votre disposition,\n\nBien cordialement,`,
    };

    const ai = getGemini();
    if (!ai) {
      return res.json(defaultDraft);
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
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' || hasDist;

  if (!isProduction) {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn('Vite dev middleware init failed, falling back to static build:', viteErr);
      if (hasDist) {
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
          res.sendFile(path.join(distPath, 'index.html'));
        });
      }
    }
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);
  });
}

startServer();
