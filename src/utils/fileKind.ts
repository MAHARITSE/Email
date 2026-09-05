/**
 * Utilitaires partagés de détection de type de fichier pour les pièces jointes.
 * Plus fiable que la simple inspection du mimeType : beaucoup de pièces jointes
 * Gmail arrivent avec un mimeType générique (application/octet-stream).
 */

export type FileKind = 'pdf' | 'image' | 'excel' | 'word' | 'text' | 'archive' | 'other';

const EXTENSION_KINDS: Record<string, FileKind> = {
  // PDF
  pdf: 'pdf',
  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  heic: 'image',
  ico: 'image',
  // Tableurs
  xlsx: 'excel',
  xlsm: 'excel',
  xls: 'excel',
  xlsb: 'excel',
  csv: 'excel',
  tsv: 'excel',
  ods: 'excel',
  // Traitement de texte
  docx: 'word',
  doc: 'word',
  dotx: 'word',
  rtf: 'word',
  odt: 'word',
  // Texte / code
  txt: 'text',
  text: 'text',
  log: 'text',
  md: 'text',
  json: 'text',
  xml: 'text',
  html: 'text',
  htm: 'text',
  css: 'text',
  js: 'text',
  mjs: 'text',
  ts: 'text',
  tsx: 'text',
  jsx: 'text',
  py: 'text',
  sh: 'text',
  bat: 'text',
  sql: 'text',
  yml: 'text',
  yaml: 'text',
  toml: 'text',
  ini: 'text',
  env: 'text',
  // Archives
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  bz2: 'archive',
};

export function getFileExtension(filename?: string | null): string {
  if (!filename) return '';
  const idx = filename.lastIndexOf('.');
  if (idx < 0 || idx === filename.length - 1) return '';
  return filename.slice(idx + 1).toLowerCase();
}

/**
 * Détecte le type de fichier à partir de l'extension (prioritaire) puis du mimeType.
 */
export function detectFileKind(filename?: string | null, mimeType?: string | null): FileKind {
  const ext = getFileExtension(filename);
  if (ext && EXTENSION_KINDS[ext]) {
    return EXTENSION_KINDS[ext];
  }

  const mime = (mimeType || '').toLowerCase();
  if (!mime) return 'other';

  if (mime.includes('pdf')) return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv')
  ) {
    return 'excel';
  }
  if (mime.includes('wordprocessing') || mime.includes('msword') || mime.includes('rtf')) {
    return 'word';
  }
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) return 'text';

  return 'other';
}

/** Types de fichiers ouvrables directement dans l'aperçu intégré. */
export const PREVIEWABLE_KINDS: readonly FileKind[] = ['pdf', 'image', 'excel', 'word', 'text'];

export function isPreviewableAttachment(att: {
  filename: string;
  mimeType?: string | null;
}): boolean {
  return PREVIEWABLE_KINDS.includes(detectFileKind(att.filename, att.mimeType));
}
