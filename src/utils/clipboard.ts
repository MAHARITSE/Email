/**
 * Copie de texte vers le presse-papiers avec chaîne de secours.
 *
 * navigator.clipboard.writeText() requiert un contexte sécurisé ET l'autorisation
 * « clipboard-write » via Permissions Policy — ce qui échoue typiquement dans les
 * iframes inter-origines (aperçus intégrés). On tente donc, dans l'ordre :
 *  1. l'API Async Clipboard ;
 *  2. execCommand('copy') sur un textarea temporaire (déclenché par geste utilisateur) ;
 *  3. renvoie false → l'appelant peut sélectionner le texte pour copie manuelle.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. API Async Clipboard (contextes sécurisés autorisés)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* passe au fallback */
  }

  // 2. execCommand (déprécié mais efficace sur geste utilisateur, même en iframe)
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.opacity = '0';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    document.body.appendChild(ta);

    const prevActive = document.activeElement as HTMLElement | null;
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);

    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    prevActive?.focus?.();

    if (ok) return true;
  } catch {
    /* passe au dernier recours */
  }

  // 3. Échec : l'appelant gère la copie manuelle (sélection du texte)
  return false;
}

/**
 * Sélectionne visuellement le contenu d'un élément DOM (copie manuelle Ctrl+C).
 */
export function selectElementText(el: HTMLElement | null) {
  if (!el || typeof window.getSelection !== 'function') return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}
