import { getCurrentUser } from '@/lib/auth'
import { canAccessProspect, getDocument } from '@/lib/db'
import { previewOf } from '@/lib/documents'

/**
 * Sert un document si l'utilisateur a accès au prospect auquel il est joint.
 * Les types sûrs (PDF, images, texte, audio, vidéo) s'affichent dans le navigateur ;
 * les autres (HTML, SVG, Office…) sont toujours proposés en téléchargement.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response('Non authentifié', { status: 401 })

  const { id } = await params
  const document = await getDocument(id)
  // Même réponse si le document n'existe pas ou n'est pas accessible.
  if (!document || !(await canAccessProspect(user, document.prospectId))) return new Response('Document introuvable', { status: 404 })

  const preview = previewOf(document.name, document.mime)
  const download = new URL(request.url).searchParams.has('download') || !preview
  const filename = encodeURIComponent(document.name)

  return new Response(new Uint8Array(document.data), {
    headers: {
      'Content-Type': preview?.mime ?? 'application/octet-stream',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${filename}`,
      'Content-Length': String(document.data.length),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
