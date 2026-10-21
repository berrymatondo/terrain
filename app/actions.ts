'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSession, currentSessionHash, destroySession, ForbiddenError, getCurrentUser, hashPassword, MIN_PASSWORD_LENGTH, requireRole, verifyPassword } from '@/lib/auth'
import { notifyAction, notifyProspect } from '@/lib/notifications'
import {
  canAccessProspect,
  getActionSnapshot,
  getMember,
  getNotifications,
  getProspectSnapshot,
  markNotificationsRead,
  countAdmins,
  getComment,
  insertComment,
  removeComment,
  updateComment,
  createAction,
  createProspect,
  createUser,
  deleteUserSessions,
  filterAssignableUserIds,
  findUserByEmail,
  getPasswordHash,
  getUser,
  prospectExists,
  removeAction,
  removeDocument,
  removeProspect,
  removeUser,
  setProspectPriority,
  toggleAction,
  updateAction,
  updatePassword,
  updateProspect,
  updateUser,
} from '@/lib/db'
import { ACTION_DUE_LABELS, canModifyComment, LEGACY_OWNER, MANUAL_PRIORITIES, MAX_COMMENT_LENGTH, MAX_CONTACTS, normalizeUrl, PROSPECT_STATUSES, ROLES, type Contact, type ActionDue, type ManualPriority, type MutationResult, type ProspectStatus, type Role, type User } from '@/lib/types'

class NotFoundError extends Error {}
class ValidationError extends Error {}

const EDITORS: Role[] = ['admin', 'manager']
const ADMINS: Role[] = ['admin']

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
}

function ensureFound(found: boolean, message: string) {
  if (!found) throw new NotFoundError(message)
}

function invalid(message: string): never {
  throw new ValidationError(message)
}

/** Vérifie les droits, exécute la mutation et rafraîchit la page. */
async function run(roles: Role[], fn: (user: User) => Promise<unknown>): Promise<MutationResult> {
  try {
    const user = await requireRole(roles)
    await fn(user)
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError || error instanceof ForbiddenError) return { ok: false, error: error.message }
    console.error(error)
    return { ok: false, error: 'Une erreur est survenue lors de l’enregistrement.' }
  }
  revalidatePath('/')
  return { ok: true }
}

/**
 * Responsable choisi dans le formulaire : un compte (notifié), aucun, ou l'ancien
 * nom saisi à la main que l'on conserve tel quel.
 */
async function resolveOwner(formData: FormData, current?: { owner: string; ownerId: string | null }) {
  const value = text(formData, 'ownerId')
  if (value === LEGACY_OWNER) return { owner: current && !current.ownerId ? current.owner : '', ownerId: null }
  if (!value) return { owner: '', ownerId: null }
  const member = await getMember(value)
  if (!member) invalid('Le responsable choisi n’existe plus.')
  return { owner: member.name, ownerId: member.id }
}

/** Lien http(s) saisi dans le formulaire (« https:// » ajouté si absent). */
/** Montant en USD : espaces et séparateurs de milliers acceptés, virgule ou point décimal. */
function amount(formData: FormData, key: string) {
  const raw = text(formData, key).replace(/[\s  $]/g, '').replace(',', '.')
  if (!raw) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value >= 1e12) invalid('Potentiel financier : montant invalide (exemple : 25000).')
  return Math.round(value * 100) / 100
}

/** Valeur vide = classement automatique. */
function manualPriority(value: string | null): ManualPriority | null {
  if (!value) return null
  if (!MANUAL_PRIORITIES.includes(value as ManualPriority)) invalid('Priorité invalide.')
  return value as ManualPriority
}

function url(formData: FormData, key: string, label: string) {
  const value = normalizeUrl(text(formData, key))
  if (value === null) invalid(`${label} : adresse invalide (exemple : https://exemple.cd).`)
  return value
}

/** Contacts envoyés en JSON par le formulaire ; les lignes entièrement vides sont ignorées. */
function parseContacts(formData: FormData): Contact[] {
  let raw: unknown
  try {
    raw = JSON.parse(String(formData.get('contacts') ?? '[]'))
  } catch {
    invalid('Liste de contacts invalide.')
  }
  if (!Array.isArray(raw)) invalid('Liste de contacts invalide.')
  const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max)

  const contacts = raw
    .map((c) => ({
      name: str(c?.name),
      title: str(c?.title),
      phone1: str(c?.phone1, 40),
      phone2: str(c?.phone2, 40),
      whatsapp: c?.whatsapp === 'phone1' || c?.whatsapp === 'phone2' ? (c.whatsapp as Contact['whatsapp']) : null,
      email: str(c?.email).toLowerCase(),
    }))
    .filter((c) => c.name || c.title || c.phone1 || c.phone2 || c.email)

  if (contacts.length > MAX_CONTACTS) invalid(`Au maximum ${MAX_CONTACTS} contacts par institution.`)
  contacts.forEach((c, i) => {
    const label = `Contact ${i + 1}`
    if (!c.name) invalid(`${label} : le nom est requis.`)
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) invalid(`${label} : adresse e-mail invalide.`)
    for (const phone of [c.phone1, c.phone2]) if (phone && !/^[+()\d][\d\s().-]{4,}$/.test(phone)) invalid(`${label} : numéro de téléphone invalide (« ${phone} »).`)
    // WhatsApp doit désigner un numéro renseigné.
    if (c.whatsapp && !c[c.whatsapp]) c.whatsapp = null
  })
  return contacts
}

/** Une notification qui échoue ne doit pas faire échouer l'enregistrement. */
async function safely(task: Promise<unknown>) {
  try {
    await task
  } catch (error) {
    console.error('Notification non envoyée', error)
  }
}

/* ---------- Prospects ---------- */

export async function saveProspect(formData: FormData): Promise<MutationResult> {
  return run(EDITORS, async (user) => {
    const id = text(formData, 'id')
    const status = text(formData, 'status') as ProspectStatus
    const date = text(formData, 'date')
    const before = id ? await getProspectSnapshot(id) : undefined
    if (id) ensureFound(!!before, 'Ce prospect n’existe plus.')

    const contacts = parseContacts(formData)
    const data = {
      institution: text(formData, 'institution'),
      // Le premier contact sert de contact principal (tableau, rapports).
      contact: contacts[0]?.name ?? '',
      contacts,
      offer: text(formData, 'offer'),
      amount: amount(formData, 'amount'),
      priority: manualPriority(text(formData, 'priority')),
      status,
      next: text(formData, 'next'),
      date: date || null,
      address: text(formData, 'address').slice(0, 500),
      website: url(formData, 'website', 'Site web'),
      platformUrl: url(formData, 'platformUrl', 'Lien de la plateforme'),
      credentials: text(formData, 'credentials').slice(0, 2000),
      ...(await resolveOwner(formData, before)),
    }

    if (!data.institution) invalid('Le nom de l’institution est requis.')
    if (!PROSPECT_STATUSES.includes(status)) invalid('Statut invalide.')
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) invalid('Date de relance invalide.')

    // Seuls des utilisateurs au profil « user » peuvent être assignés (les autres voient déjà tout).
    const assigneeIds = await filterAssignableUserIds(formData.getAll('assignees').map(String))

    let prospectId = id
    if (id) ensureFound(await updateProspect(id, data, assigneeIds, user.id), 'Ce prospect n’existe plus.')
    else prospectId = await createProspect(data, assigneeIds, user.id)

    await safely(notifyProspect(user, id ? 'updated' : 'created', before, await getProspectSnapshot(prospectId)))
  })
}

/** Fixe la priorité d'un prospect, ou la rend au classement automatique (null). */
export async function updateProspectPriority(id: string, priority: string | null): Promise<MutationResult> {
  return run(EDITORS, async () => ensureFound(await setProspectPriority(id, manualPriority(priority)), 'Ce prospect n’existe plus.'))
}

export async function deleteProspect(id: string): Promise<MutationResult> {
  return run(EDITORS, async (user) => {
    const before = await getProspectSnapshot(id)
    await removeProspect(id)
    if (before) await safely(notifyProspect(user, 'deleted', before, undefined))
  })
}

export async function deleteDocument(id: string): Promise<MutationResult> {
  return run(EDITORS, async () => ensureFound(await removeDocument(id), 'Ce document n’existe plus.'))
}

/* ---------- Commentaires (tous les profils, sur les dossiers accessibles) ---------- */

function commentBody(body: string) {
  const value = String(body ?? '').trim()
  if (!value) invalid('Le commentaire est vide.')
  if (value.length > MAX_COMMENT_LENGTH) invalid(`Le commentaire ne doit pas dépasser ${MAX_COMMENT_LENGTH} caractères.`)
  return value
}

/** Retrouve un commentaire que l'utilisateur a le droit de modifier (auteur ou administrateur). */
async function modifiableComment(user: User, id: string) {
  const comment = await getComment(id)
  if (!comment || !(await canAccessProspect(user, comment.prospectId))) throw new NotFoundError('Ce commentaire n’existe plus.')
  if (!canModifyComment(user, comment)) throw new ForbiddenError('Seul l’auteur ou un administrateur peut modifier ce commentaire.')
}

export async function addComment(prospectId: string, body: string): Promise<MutationResult> {
  return run([...ROLES], async (user) => {
    const value = commentBody(body)
    ensureFound(await canAccessProspect(user, prospectId), 'Ce prospect n’existe plus.')
    await insertComment(prospectId, user.id, value)
  })
}

export async function editComment(id: string, body: string): Promise<MutationResult> {
  return run([...ROLES], async (user) => {
    const value = commentBody(body)
    await modifiableComment(user, id)
    await updateComment(id, value)
  })
}

export async function deleteComment(id: string): Promise<MutationResult> {
  return run([...ROLES], async (user) => {
    await modifiableComment(user, id)
    await removeComment(id)
  })
}

/* ---------- Actions ---------- */

export async function saveAction(formData: FormData): Promise<MutationResult> {
  return run(EDITORS, async (user) => {
    const id = text(formData, 'id')
    const due = text(formData, 'due') as ActionDue
    const before = id ? await getActionSnapshot(id) : undefined
    if (id) ensureFound(!!before, 'Cette action n’existe plus.')

    const data = {
      title: text(formData, 'title'),
      detail: text(formData, 'detail'),
      due,
      prospectId: text(formData, 'prospectId') || null,
      ...(await resolveOwner(formData, before)),
    }

    if (!data.title) invalid('Le titre de l’action est requis.')
    if (!ACTION_DUE_LABELS.includes(due)) invalid('Échéance invalide.')

    if (data.prospectId) ensureFound(await prospectExists(data.prospectId), 'Le prospect lié n’existe plus.')
    let actionId = id
    if (id) ensureFound(await updateAction(id, data), 'Cette action n’existe plus.')
    else actionId = await createAction(data)

    await safely(notifyAction(user, id ? 'updated' : 'created', before, await getActionSnapshot(actionId)))
  })
}

export async function toggleActionDone(id: string): Promise<MutationResult> {
  return run(EDITORS, async (user) => {
    const before = await getActionSnapshot(id)
    ensureFound(!!before && (await toggleAction(id)), 'Cette action n’existe plus.')
    await safely(notifyAction(user, 'updated', before, await getActionSnapshot(id)))
  })
}

export async function deleteAction(id: string): Promise<MutationResult> {
  return run(EDITORS, async (user) => {
    const before = await getActionSnapshot(id)
    await removeAction(id)
    if (before) await safely(notifyAction(user, 'deleted', before, undefined))
  })
}

/* ---------- Notifications ---------- */

export async function fetchNotifications() {
  const user = await getCurrentUser()
  if (!user) return { items: [], unread: 0 }
  return getNotifications(user.id)
}

/** Marque des notifications comme lues (toutes si aucune liste n'est donnée). */
export async function readNotifications(ids?: string[]) {
  const user = await getCurrentUser()
  if (user) await markNotificationsRead(user.id, ids)
}

/* ---------- Utilisateurs (admin uniquement) ---------- */

export async function saveUser(formData: FormData): Promise<MutationResult> {
  return run(ADMINS, async (currentUser) => {
    const id = text(formData, 'id')
    const password = String(formData.get('password') ?? '')
    const role = text(formData, 'role') as Role
    const data = { name: text(formData, 'name'), email: text(formData, 'email').toLowerCase(), role }

    if (!data.name) invalid('Le nom est requis.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) invalid('Adresse e-mail invalide.')
    if (!ROLES.includes(role)) invalid('Profil invalide.')
    if ((!id || password) && password.length < MIN_PASSWORD_LENGTH) invalid(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`)

    const existing = await findUserByEmail(data.email)
    if (existing && existing.id !== id) invalid('Un utilisateur utilise déjà cette adresse e-mail.')

    if (!id) {
      await createUser(data, await hashPassword(password))
      return
    }

    const before = await getUser(id)
    ensureFound(!!before, 'Cet utilisateur n’existe plus.')
    if (before!.role === 'admin' && role !== 'admin' && (await countAdmins()) <= 1) invalid('Il doit rester au moins un administrateur.')
    await updateUser(id, data)
    if (password) {
      await updatePassword(id, await hashPassword(password))
      // Déconnecte l'utilisateur partout (sauf la session courante si l'admin modifie son propre compte).
      await deleteUserSessions(id, id === currentUser.id ? await currentSessionHash() : undefined)
    }
  })
}

export async function deleteUser(id: string): Promise<MutationResult> {
  return run(ADMINS, async (currentUser) => {
    if (id === currentUser.id) invalid('Vous ne pouvez pas supprimer votre propre compte.')
    await removeUser(id)
  })
}

/* ---------- Session ---------- */

export async function login(formData: FormData): Promise<MutationResult> {
  const email = text(formData, 'email').toLowerCase()
  const password = String(formData.get('password') ?? '')
  const user = email ? await findUserByEmail(email) : undefined
  // Même message dans tous les cas pour ne pas révéler quels comptes existent.
  if (!user || !(await verifyPassword(password, user.passwordHash))) return { ok: false, error: 'E-mail ou mot de passe incorrect.' }
  await createSession(user.id)
  redirect('/')
}

export async function logout() {
  await destroySession()
  redirect('/login')
}

export async function changeOwnPassword(formData: FormData): Promise<MutationResult> {
  return run([...ROLES], async (currentUser) => {
    const current = String(formData.get('current') ?? '')
    const next = String(formData.get('next') ?? '')
    const hash = await getPasswordHash(currentUser.id)
    if (!hash || !(await verifyPassword(current, hash))) invalid('Mot de passe actuel incorrect.')
    if (next.length < MIN_PASSWORD_LENGTH) invalid(`Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`)
    if (next !== String(formData.get('confirm') ?? '')) invalid('Les deux mots de passe ne correspondent pas.')
    await updatePassword(currentUser.id, await hashPassword(next))
    await deleteUserSessions(currentUser.id, await currentSessionHash())
  })
}
