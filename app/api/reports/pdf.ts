import { getAssignableUsers } from '@/lib/db'
import { canEdit, type User } from '@/lib/types'

/** Noms des utilisateurs assignables, affichés dans les rapports des admins et managers. */
export async function reportUserNames(user: User) {
  return canEdit(user.role) ? new Map((await getAssignableUsers()).map((u) => [u.id, u.name])) : new Map<string, string>()
}

/** Les rapports sont toujours proposés en téléchargement, jamais affichés dans le navigateur. */
export function pdfResponse(pdf: Buffer, filename: string) {
  // Nom ASCII de repli pour les navigateurs qui ignorent filename*.
  const fallback = filename.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'private, no-store',
    },
  })
}

/** Nom de fichier lisible : « Rapport - ACOREP - 2026-10-19.pdf ». */
export function reportFilename(label: string) {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kinshasa' })
  return `Rapport - ${label.replace(/[\\/:*?"<>|]+/g, ' ').trim()} - ${date}.pdf`
}
