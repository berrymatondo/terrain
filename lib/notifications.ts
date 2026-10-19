import { insertNotifications, type ActionSnapshot, type NotificationInput, type ProspectSnapshot } from '@/lib/db'
import type { User } from '@/lib/types'

type Kind = NotificationInput['kind']

const day = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : 'aucune')
const uniq = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((id): id is string => !!id))]

/**
 * Envoie une notification à chaque destinataire (sauf l'auteur), avec une précision
 * propre à chacun (« vous êtes désormais responsable », etc.).
 */
async function send(actor: User, recipients: string[], base: NotificationInput, extraFor: (userId: string) => string) {
  const groups = new Map<string, string[]>()
  for (const userId of recipients) {
    if (userId === actor.id) continue
    const extra = extraFor(userId)
    groups.set(extra, [...(groups.get(extra) ?? []), userId])
  }
  await Promise.all(
    [...groups].map(([extra, userIds]) => insertNotifications(userIds, actor.id, { ...base, body: [base.body, extra].filter(Boolean).join(' ') })),
  )
}

/* ---------- Prospects ---------- */

function prospectChanges(before: ProspectSnapshot, after: ProspectSnapshot) {
  const changes: string[] = []
  if (before.status !== after.status) changes.push(`Statut : ${before.status} → ${after.status}.`)
  if (before.ownerId !== after.ownerId || (!after.ownerId && before.owner !== after.owner)) changes.push(`Responsable : ${before.owner || 'aucun'} → ${after.owner || 'aucun'}.`)
  if (before.next !== after.next) changes.push(`Prochaine action : ${after.next || '—'}.`)
  if (before.date !== after.date) changes.push(`Relance : ${day(before.date)} → ${day(after.date)}.`)
  if (before.institution !== after.institution) changes.push(`Renommé (anciennement « ${before.institution} »).`)
  if ([...before.assigneeIds].sort().join() !== [...after.assigneeIds].sort().join()) changes.push('Accès au dossier modifiés.')
  return changes.length ? changes.join(' ') : 'Informations mises à jour.'
}

export async function notifyProspect(actor: User, kind: Kind, before: ProspectSnapshot | undefined, after: ProspectSnapshot | undefined) {
  const p = (after ?? before)!
  const recipients = uniq([before?.ownerId, ...(before?.assigneeIds ?? []), after?.ownerId, ...(after?.assigneeIds ?? [])])
  const titles = { created: 'Nouveau prospect', updated: 'Prospect modifié', deleted: 'Prospect supprimé' }
  const bodies = {
    created: `Statut : ${p.status}.`,
    updated: before && after ? prospectChanges(before, after) : '',
    deleted: 'Le dossier et ses données ont été supprimés.',
  }

  await send(actor, recipients, { entity: 'prospect', kind, prospectId: p.id, title: `${titles[kind]} : ${p.institution}`, body: bodies[kind] }, (userId) => {
    if (kind === 'deleted') return ''
    if (after?.ownerId === userId && before?.ownerId !== userId) return 'Vous en êtes désormais le responsable.'
    if (after?.assigneeIds.includes(userId) && !before?.assigneeIds.includes(userId)) return 'Vous avez désormais accès à ce dossier.'
    if (before && after && !after.assigneeIds.includes(userId) && after.ownerId !== userId) return 'Vous n’avez plus accès à ce dossier.'
    return ''
  })
}

/* ---------- Actions ---------- */

function actionChanges(before: ActionSnapshot, after: ActionSnapshot) {
  const changes: string[] = []
  if (before.done !== after.done) changes.push(after.done ? 'Marquée comme terminée.' : 'Rouverte.')
  if (before.due !== after.due) changes.push(`Échéance : ${before.due} → ${after.due}.`)
  if (before.ownerId !== after.ownerId || (!after.ownerId && before.owner !== after.owner)) changes.push(`Responsable : ${before.owner || 'aucun'} → ${after.owner || 'aucun'}.`)
  if (before.prospectId !== after.prospectId) changes.push(`Projet : ${before.institution ?? 'aucun'} → ${after.institution ?? 'aucun'}.`)
  if (before.title !== after.title) changes.push(`Renommée (anciennement « ${before.title} »).`)
  return changes.length ? changes.join(' ') : 'Informations mises à jour.'
}

export async function notifyAction(actor: User, kind: Kind, before: ActionSnapshot | undefined, after: ActionSnapshot | undefined) {
  const a = (after ?? before)!
  const recipients = uniq([before?.ownerId, ...(before?.prospectUserIds ?? []), after?.ownerId, ...(after?.prospectUserIds ?? [])])
  const toggled = kind === 'updated' && before && after && before.done !== after.done
  const title = kind === 'created' ? 'Nouvelle action' : kind === 'deleted' ? 'Action supprimée' : toggled ? (after!.done ? 'Action terminée' : 'Action rouverte') : 'Action modifiée'
  const project = a.institution ? `Projet : ${a.institution}.` : ''
  const body = kind === 'updated' && before && after ? `${actionChanges(before, after)} ${toggled ? project : ''}`.trim() : `${project} Échéance : ${a.due}.`.trim()

  await send(actor, recipients, { entity: 'action', kind, prospectId: a.prospectId, title: `${title} : ${a.title}`, body }, (userId) =>
    kind !== 'deleted' && after?.ownerId === userId && before?.ownerId !== userId ? 'Vous en êtes désormais le responsable.' : '',
  )
}
