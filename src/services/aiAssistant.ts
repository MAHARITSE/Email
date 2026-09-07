export interface SmartReplySuggestion {
  label: string;
  replyText: string;
  tone: 'positive' | 'clarify' | 'decline' | string;
}

export interface DraftEmailResult {
  subject: string;
  body: string;
}

export type ImproveAction =
  | 'proofread'
  | 'professional'
  | 'concise'
  | 'friendly'
  | 'formal'
  | 'persuasive'
  | 'translate'
  | 'custom';

export type AiLanguage =
  | 'Français'
  | 'Malagasy'
  | 'English'
  | 'Deutsch'
  | 'Español'
  | 'Italiano'
  | 'Português'
  | '中文'
  | '日本語'
  | 'Auto';

export type AiTone =
  | 'professionnel'
  | 'amical'
  | 'formel'
  | 'direct'
  | 'persuasif'
  | 'empathique';

export type AiLength = 'court' | 'moyen' | 'détaillé';

export interface DraftEmailOptions {
  prompt: string;
  recipient?: string;
  tone?: AiTone | string;
  language?: AiLanguage | string;
  length?: AiLength | string;
  emailContext?: {
    subject?: string;
    body?: string;
    sender?: string;
  };
}

/**
 * Détecte automatiquement la langue d'un email (Français, Malagasy, English, Deutsch, etc.)
 * à partir de son corps et de son objet pour adapter la réponse IA.
 */
export function detectEmailLanguage(body?: string, subject?: string): AiLanguage {
  const combined = `${subject || ''} ${body || ''}`.trim();
  if (!combined) return 'Français';

  // 1. Détection des caractères asiatiques
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(combined)) {
    return '日本語';
  }
  if (/[\u4e00-\u9fa5]/.test(combined)) {
    return '中文';
  }

  // Tokenisation en mots minuscules
  const words = combined
    .toLowerCase()
    .replace(/[^\p{L}\s']/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  if (words.length === 0) return 'Français';

  const dicts: Record<Exclude<AiLanguage, 'Auto' | '中文' | '日本語'>, string[]> = {
    Malagasy: [
      'salama', 'misaotra', 'manahoana', 'tonga', 'araka', 'faly', 'miarahaba', 'dia', 'koa', 'ary',
      'aminny', 'amin\'ny', 'aminy', 'anareo', 'izahay', 'izao', 'raha', 'rehetra', 'fa', 'sy',
      'ao', 'eny', 'tsara', 'tratra', 'fisaorana', 'fiarahabana', 'asa', 'fivoriana', 'baiko',
      'tompo', 'tompoko', 'veloma', 'anefa', 'nefa', 'momba', 'antony', 'fanazavana', 'fanontaniana',
      'valiny', 'mandefa', 'nahazo', 'andriamatoa', 'ramatoa', 'mankasitraka', 'manasa', 'ianao',
      'izy', 'ireo', 'ireny', 'mba', 'ka', 'eto', 'aza', 'fady', 'ho'
    ],
    English: [
      'the', 'this', 'that', 'with', 'from', 'have', 'has', 'had', 'will', 'would', 'can', 'could',
      'should', 'please', 'thank', 'thanks', 'regards', 'best', 'meeting', 'update', 'hello', 'dear',
      'hope', 'you', 'your', 'about', 'project', 'attached', 'email', 'schedule', 'week', 'today',
      'tomorrow', 'sincerely', 'kind', 'let', 'know', 'looking', 'forward', 'are', 'was', 'were',
      'been', 'they', 'their', 'which', 'there', 'what', 'when', 'where', 'how', 'any', 'help'
    ],
    Deutsch: [
      'und', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einer', 'mit',
      'von', 'für', 'dass', 'nicht', 'hallo', 'guten', 'tag', 'morgen', 'abend', 'sehr', 'geehrte',
      'geehrter', 'vielen', 'dank', 'bitte', 'grüße', 'herzliche', 'freundlichen', 'ich', 'wir',
      'sie', 'ihnen', 'ihre', 'unsere', 'nachricht', 'anhang', 'termin'
    ],
    Español: [
      'hola', 'gracias', 'estimado', 'estimada', 'saludos', 'buenos', 'días', 'tardes', 'noches',
      'por', 'favor', 'para', 'con', 'sobre', 'como', 'usted', 'ustedes', 'mensaje', 'adjunto',
      'reunión', 'atentamente', 'cordial', 'saludo', 'nosotros', 'nuestro', 'nuestra', 'bienvenido',
      'también', 'más', 'pero', 'este', 'esta'
    ],
    Italiano: [
      'ciao', 'grazie', 'cordiali', 'saluti', 'buongiorno', 'buonasera', 'gentile', 'per', 'favore',
      'con', 'della', 'delle', 'degli', 'questo', 'questa', 'sono', 'siamo', 'allegato', 'riunione',
      'anche', 'molto', 'nostro', 'nostra', 'vostro', 'vostra', 'prego', 'arrivederci'
    ],
    Português: [
      'olá', 'obrigado', 'obrigada', 'atenciosamente', 'cumprimentos', 'bom', 'dia', 'boa', 'tarde',
      'noite', 'por', 'favor', 'com', 'para', 'sobre', 'voce', 'você', 'reunião', 'anexo', 'cordiais',
      'saudações', 'também', 'estou', 'estamos', 'nosso', 'nossa'
    ],
    Français: [
      'bonjour', 'bonsoir', 'merci', 'cordialement', 'salutations', 'veuillez', 'agréer', 'madame',
      'monsieur', 'vous', 'nous', 'avec', 'dans', 'pour', 'sur', 'votre', 'notre', 'vos', 'nos',
      'projet', 'réunion', 'pièce', 'jointe', 'suite', 'message', 'courriel', 'être', 'avoir',
      'faire', 'pouvoir', 'bien', 'très', 'aussi', 'plus', 'comme', 'mais', 'donc', 'ainsi',
      'disposition', 'journée', 'semaine', 'cordial', 'chère', 'cher'
    ],
  };

  const scores: Record<string, number> = {
    Français: 0,
    English: 0,
    Malagasy: 0,
    Deutsch: 0,
    Español: 0,
    Italiano: 0,
    Português: 0,
  };

  for (const word of words) {
    for (const [lang, dict] of Object.entries(dicts)) {
      if (dict.includes(word)) {
        scores[lang] += (word.length >= 5 ? 2 : 1);
      }
    }
  }

  let topLang: AiLanguage = 'Français';
  let maxScore = 0;

  for (const [lang, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      topLang = lang as AiLanguage;
    }
  }

  return maxScore > 0 ? topLang : 'Français';
}

// 1. Améliorer ou corriger le texte d'un email
export async function improveEmailText(
  text: string,
  action: ImproveAction = 'proofread',
  instructions?: string,
  language?: AiLanguage | string
): Promise<string> {
  const res = await fetch('/api/ai/improve-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, action, instructions, language }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur réseau IA' }));
    throw new Error(err.error || 'Impossible d\'améliorer le message');
  }

  const data = await res.json();
  return data.improvedText || text;
}

// 2. Obtenir des suggestions de réponses intelligentes avec choix de langue
export async function getSmartReplySuggestions(
  subject: string,
  body: string,
  sender?: string,
  customPrompt?: string,
  language: AiLanguage | string = 'Français',
  tone: AiTone | string = 'professionnel'
): Promise<SmartReplySuggestion[]> {
  const res = await fetch('/api/ai/suggest-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, body, sender, customPrompt, language, tone }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur suggestions IA' }));
    throw new Error(err.error || 'Impossible de générer des réponses');
  }

  const data = await res.json();
  return data.suggestions || [];
}

// 3. Rédiger un email complet (nouveau ou réponse) à partir d'une consigne
export async function draftEmailWithAi(
  optsOrPrompt: string | DraftEmailOptions,
  recipient?: string,
  tone?: string
): Promise<DraftEmailResult> {
  const payload: DraftEmailOptions =
    typeof optsOrPrompt === 'string'
      ? { prompt: optsOrPrompt, recipient, tone }
      : optsOrPrompt;

  const res = await fetch('/api/ai/draft-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur rédaction IA' }));
    throw new Error(err.error || 'Impossible de rédiger le message');
  }

  const data = await res.json();
  return {
    subject: data.subject || 'Nouveau message',
    body: data.body || (typeof optsOrPrompt === 'string' ? optsOrPrompt : payload.prompt),
  };
}

