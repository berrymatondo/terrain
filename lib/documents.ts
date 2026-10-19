/** Types de fichiers affichables dans le navigateur sans risque (jamais de HTML ni de SVG). */
export type PreviewKind = 'pdf' | 'image' | 'text' | 'video' | 'audio'

const BY_EXTENSION: Record<string, { kind: PreviewKind; mime: string }> = {
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  gif: { kind: 'image', mime: 'image/gif' },
  webp: { kind: 'image', mime: 'image/webp' },
  txt: { kind: 'text', mime: 'text/plain; charset=utf-8' },
  csv: { kind: 'text', mime: 'text/plain; charset=utf-8' },
  md: { kind: 'text', mime: 'text/plain; charset=utf-8' },
  log: { kind: 'text', mime: 'text/plain; charset=utf-8' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
}

const BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
}

/** Aperçu possible pour ce fichier, d'après son type déclaré ou, à défaut, son extension. */
export function previewOf(name: string, mime: string) {
  const ext = BY_MIME[mime.split(';')[0].trim().toLowerCase()] ?? name.split('.').pop()?.toLowerCase() ?? ''
  return BY_EXTENSION[ext] ?? null
}
