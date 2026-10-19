import { getCurrentUser } from '@/lib/auth'
import { canAccessProspect, getDocument } from '@/lib/db'

// Types affichables sans risque dans le navigateur ; les autres (HTML, SVG…) sont toujours téléchargés.
const INLINE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain']

/** Télécharge un document, si l'utilisateur a accès au prospect auquel il est joint. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response('Non authentifié', { status: 401 })

  const { id } = await params
  const document = await getDocument(id)
  // Même réponse si le document n'existe pas ou n'est pas accessible.
  if (!document || !(await canAccessProspect(user, document.prospectId))) return new Response('Document introuvable', { status: 404 })

  const download = new URL(request.url).searchParams.has('download') || !INLINE_TYPES.includes(document.mime)
  const filename = encodeURIComponent(document.name)

  return new Response(new Uint8Array(document.data), {
    headers: {
      'Content-Type': INLINE_TYPES.includes(document.mime) ? document.mime : 'application/octet-stream',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${filename}`,
      'Content-Length': String(document.data.length),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
