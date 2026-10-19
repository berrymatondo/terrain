import { PROSPECT_STATUSES, type ProspectStatus } from '@/lib/types'

/** Étapes du parcours commercial, dans l'ordre. « Perdu » est une sortie, pas une étape. */
export const PIPELINE: ProspectStatus[] = PROSPECT_STATUSES.filter((s) => s !== 'Perdu')

/** Avancement en pourcentage selon l'étape atteinte (0 % = À contacter, 100 % = Signé). */
export function progressOf(status: ProspectStatus) {
  const index = PIPELINE.indexOf(status)
  return index < 0 ? 0 : Math.round((index / (PIPELINE.length - 1)) * 100)
}
