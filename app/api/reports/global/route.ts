import { pdfResponse, reportFilename, reportUserNames } from '@/app/api/reports/pdf'
import { getCurrentUser } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { renderGlobalReport } from '@/lib/reports'
import { canEdit } from '@/lib/types'

/** Rapport PDF global : tous les projets visibles par l'utilisateur, avec une fiche détaillée par projet. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return new Response('Non authentifié', { status: 401 })

  const [{ prospects, actions }, userNames] = await Promise.all([getDatabase(user), reportUserNames(user)])
  const pdf = await renderGlobalReport(prospects, actions, user, userNames, canEdit(user.role))
  return pdfResponse(pdf, reportFilename('Portefeuille global'))
}
