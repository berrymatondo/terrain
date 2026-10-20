import { pdfResponse, reportFilename, reportUserNames } from '@/app/api/reports/pdf'
import { getCurrentUser } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { renderProspectReport } from '@/lib/reports'
import { canEdit } from '@/lib/types'

/** Rapport PDF complet d'un projet (`?preview` pour l'afficher dans le navigateur). Un « user » n'obtient que les dossiers qui lui sont assignés. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response('Non authentifié', { status: 401 })

  const { id } = await params
  const [{ prospects, actions }, userNames] = await Promise.all([getDatabase(user), reportUserNames(user)])
  const prospect = prospects.find((p) => p.id === id)
  if (!prospect) return new Response('Projet introuvable', { status: 404 })

  const pdf = await renderProspectReport(prospect, actions, user, userNames, canEdit(user.role))
  return pdfResponse(pdf, reportFilename(prospect.institution), new URL(request.url).searchParams.has('preview'))
}
