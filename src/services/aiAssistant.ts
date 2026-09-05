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
  | 'custom';

// 1. Améliorer ou corriger le texte d'un email
export async function improveEmailText(
  text: string,
  action: ImproveAction = 'proofread',
  instructions?: string
): Promise<string> {
  const res = await fetch('/api/ai/improve-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, action, instructions }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur réseau IA' }));
    throw new Error(err.error || 'Impossible d\'améliorer le message');
  }

  const data = await res.json();
  return data.improvedText || text;
}

// 2. Obtenir des suggestions de réponses intelligentes
export async function getSmartReplySuggestions(
  subject: string,
  body: string,
  sender?: string,
  customPrompt?: string
): Promise<SmartReplySuggestion[]> {
  const res = await fetch('/api/ai/suggest-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, body, sender, customPrompt }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur suggestions IA' }));
    throw new Error(err.error || 'Impossible de générer des réponses');
  }

  const data = await res.json();
  return data.suggestions || [];
}

// 3. Rédiger un email complet à partir d'une consigne
export async function draftEmailWithAi(
  prompt: string,
  recipient?: string,
  tone?: string
): Promise<DraftEmailResult> {
  const res = await fetch('/api/ai/draft-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, recipient, tone }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur rédaction IA' }));
    throw new Error(err.error || 'Impossible de rédiger le message');
  }

  const data = await res.json();
  return {
    subject: data.subject || 'Nouveau message',
    body: data.body || prompt,
  };
}
