import { progressOf } from '@/lib/progress'
import type { Action, ActionDue, ManualPriority, Prospect, ProspectStatus } from '@/lib/types'

/**
 * Classement automatique du portefeuille.
 *
 * Chaque prospect en cours reçoit un score de 0 à 100, moyenne pondérée de trois critères
 * (eux-mêmes notés de 0 à 100) :
 *  - Priorité d'action (40 %) : action la plus urgente encore ouverte, ou proximité de la relance ;
 *  - Potentiel financier (35 %) : montant estimé, comparé au plus gros du portefeuille (échelle log) ;
 *  - Engagement (25 %) : étape atteinte dans le parcours et activité des 30 derniers jours.
 * Les dossiers signés ou perdus ne sont pas classés.
 *
 * Un éditeur peut imposer le niveau (Haute, Moyenne, Basse) : le prospect est alors classé
 * dans ce niveau, et le score automatique départage les prospects d'un même niveau.
 */

export const PRIORITY_WEIGHTS = { action: 0.4, financial: 0.35, engagement: 0.25 } as const

export const CLOSED_STATUSES: ProspectStatus[] = ['Signé', 'Perdu']

const DUE_URGENCY: Record<ActionDue, number> = {
  Prioritaire: 100,
  'Cette semaine': 80,
  'À relancer': 60,
  'À préparer': 45,
  'À planifier': 30,
}

const DAY = 24 * 60 * 60 * 1000
const RECENT_DAYS = 30

export type PriorityTier = ManualPriority | 'Clôturé'

const TIER_ORDER: Record<PriorityTier, number> = { Haute: 0, Moyenne: 1, Basse: 2, Clôturé: 3 }

export type Priority = {
  score: number
  /** Niveau retenu : celui fixé à la main s'il existe, sinon le niveau automatique. */
  tier: PriorityTier
  /** Niveau déduit du score. */
  autoTier: PriorityTier
  /** Vrai si le niveau a été fixé à la main. */
  manual: boolean
  /** Rang dans le portefeuille (1 = le plus prioritaire), null pour un dossier clôturé. */
  rank: number | null
  action: number
  financial: number
  engagement: number
  /** Explications courtes, de la plus importante à la moins importante. */
  reasons: string[]
}

function tierOf(score: number): ManualPriority {
  return score >= 60 ? 'Haute' : score >= 35 ? 'Moyenne' : 'Basse'
}

function daysUntil(iso: string, today: string) {
  return Math.round((Date.parse(iso) - Date.parse(today)) / DAY)
}

export function formatAmount(amount: number | null) {
  return amount == null ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount)} $`
}

function scoreProspect(p: Prospect, actions: Action[], maxAmount: number, today: string, now: number): Omit<Priority, 'rank'> {
  const reasons: string[] = []

  // Priorité d'action
  const pending = actions.filter((a) => a.prospectId === p.id && !a.done)
  const mostUrgent = pending.reduce<Action | undefined>((best, a) => (!best || DUE_URGENCY[a.due] > DUE_URGENCY[best.due] ? a : best), undefined)
  let relance = 0
  if (p.date) {
    const days = daysUntil(p.date, today)
    relance = days < 0 ? 100 : days <= 3 ? 80 : days <= 7 ? 60 : 20
    if (days < 0) reasons.push(`Relance en retard de ${-days} j`)
    else if (days <= 7) reasons.push(days === 0 ? 'Relance aujourd’hui' : `Relance dans ${days} j`)
  }
  if (mostUrgent) reasons.push(`Action « ${mostUrgent.due} »`)
  const action = Math.max(relance, mostUrgent ? DUE_URGENCY[mostUrgent.due] : 0)

  // Potentiel financier
  const financial = p.amount && maxAmount > 0 ? Math.round((Math.log1p(p.amount) / Math.log1p(maxAmount)) * 100) : 0
  reasons.push(p.amount ? `Potentiel ${formatAmount(p.amount)}` : 'Potentiel non renseigné')

  // Engagement
  const since = now - RECENT_DAYS * DAY
  const recent = [...p.comments.map((c) => c.createdAt), ...p.history.map((h) => h.changedAt), ...p.documents.map((d) => d.createdAt)].filter(
    (at) => at && Date.parse(at) >= since,
  ).length
  const activity = Math.min(recent / 3, 1) * 100
  const engagement = Math.round(progressOf(p.status) * 0.6 + activity * 0.4)
  reasons.push(`${p.status} (${progressOf(p.status)} %)`)
  if (recent) reasons.push(`${recent} activité${recent > 1 ? 's' : ''} sur ${RECENT_DAYS} j`)

  const score = Math.round(action * PRIORITY_WEIGHTS.action + financial * PRIORITY_WEIGHTS.financial + engagement * PRIORITY_WEIGHTS.engagement)
  const autoTier = tierOf(score)
  if (p.priority) reasons.unshift(`Priorité fixée à la main (auto : ${autoTier})`)
  return { score, tier: p.priority ?? autoTier, autoTier, manual: !!p.priority, action, financial, engagement, reasons }
}

/** Calcule la priorité de chaque prospect et son rang parmi les dossiers en cours. */
export function rankProspects(prospects: Prospect[], actions: Action[], today: string, now = Date.now()) {
  const open = prospects.filter((p) => !CLOSED_STATUSES.includes(p.status))
  const maxAmount = Math.max(0, ...open.map((p) => p.amount ?? 0))
  const result = new Map<string, Priority>()

  open
    .map((p) => ({ id: p.id, ...scoreProspect(p, actions, maxAmount, today, now) }))
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.score - a.score)
    .forEach(({ id, ...priority }, i) => result.set(id, { ...priority, rank: i + 1 }))

  for (const p of prospects) {
    if (!result.has(p.id)) result.set(p.id, { score: 0, tier: 'Clôturé', autoTier: 'Clôturé', manual: false, rank: null, action: 0, financial: 0, engagement: 0, reasons: [p.status] })
  }
  return result
}

/** Prospects triés du plus prioritaire au moins prioritaire ; les dossiers clôturés en dernier. */
export function sortByPriority<T extends Pick<Prospect, 'id'>>(prospects: T[], priorities: Map<string, Priority>) {
  const rank = (p: T) => priorities.get(p.id)?.rank ?? Number.MAX_SAFE_INTEGER
  return [...prospects].sort((a, b) => rank(a) - rank(b))
}
