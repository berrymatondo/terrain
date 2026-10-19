import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { insertDocument, prospectExists } from '@/lib/db'
import { canEdit, MAX_DOCUMENT_SIZE } from '@/lib/types'

function error(message: string, status: number) {
  return Response.json({ ok: false, error: message }, { status })
}

/** Ajoute un ou plusieurs documents (champ « files ») à un prospect. Réservé aux admins et managers. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return error('Votre session a expiré. Veuillez vous reconnecter.', 401)
  if (!canEdit(user.role)) return error('Vous n’avez pas les droits nécessaires pour cette opération.', 403)

  const { id } = await params
  if (!(await prospectExists(id))) return error('Ce prospect n’existe plus.', 404)

  const files = (await request.formData()).getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (!files.length) return error('Aucun fichier reçu.', 400)
  const tooBig = files.find((f) => f.size > MAX_DOCUMENT_SIZE)
  if (tooBig) return error(`« ${tooBig.name} » dépasse la taille maximale de ${MAX_DOCUMENT_SIZE / 1024 / 1024} Mo.`, 413)

  for (const file of files) {
    await insertDocument(id, { name: file.name.slice(0, 255), mime: file.type || 'application/octet-stream', data: Buffer.from(await file.arrayBuffer()) }, user.id)
  }

  revalidatePath('/')
  return Response.json({ ok: true })
}
