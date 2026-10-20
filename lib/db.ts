import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import type { Action, ActionDue, Comment, Contact, Database, DocumentMeta, ManualPriority, Member, Notification, Prospect, ProspectStatus, Role, StatusChange, User } from '@/lib/types'
import { canEdit, canSeeContacts } from '@/lib/types'

let client: NeonQueryFunction<false, false> | undefined

/**
 * Connexion créée à la première requête, pas au chargement du module : le build
 * (« collecting page data ») importe toutes les routes sans avoir besoin de la base.
 */
function db() {
  if (!client) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manquant (voir .env.local)')
    client = neon(process.env.DATABASE_URL)
  }
  return client
}

const sql = new Proxy((() => {}) as unknown as NeonQueryFunction<false, false>, {
  apply: (_target, _this, args) => Reflect.apply(db(), undefined, args),
  get: (_target, prop) => {
    const value = Reflect.get(db(), prop)
    return typeof value === 'function' ? value.bind(db()) : value
  },
})

type ProspectInput = Omit<Prospect, 'id' | 'assigneeIds' | 'documents' | 'comments' | 'history'>
type ActionInput = Omit<Action, 'id' | 'done'>

/**
 * Données visibles par l'utilisateur : tout pour admin/manager, sinon uniquement
 * les dossiers qui lui sont assignés et les actions liées à ces dossiers.
 */
export async function getDatabase(user: User): Promise<Database> {
  const restricted = !canEdit(user.role)
  const hideContacts = !canSeeContacts(user.role)
  // Un « user » voit les dossiers qui lui sont assignés et ceux dont il est responsable.
  const [prospects, actions, assignments, documents, comments, history, contacts] = await Promise.all([
    sql`SELECT p.id, p.institution, p.contact, p.offer, p.amount::float8 AS amount, p.priority, p.status, p.next, to_char(p.date, 'YYYY-MM-DD') AS date,
               COALESCE(u.name, p.owner) AS owner, p.owner_id AS "ownerId", p.address, p.website, p.platform_url AS "platformUrl"
        FROM prospects p LEFT JOIN users u ON u.id = p.owner_id
        WHERE ${restricted}::boolean = false
           OR p.id IN (SELECT prospect_id FROM prospect_assignments WHERE user_id = ${user.id} UNION SELECT id FROM prospects WHERE owner_id = ${user.id})
        ORDER BY p.created_at DESC`,
    sql`SELECT a.id, a.title, a.detail, COALESCE(u.name, a.owner) AS owner, a.owner_id AS "ownerId", a.due, a.prospect_id AS "prospectId", a.done
        FROM actions a LEFT JOIN users u ON u.id = a.owner_id
        WHERE ${restricted}::boolean = false OR a.owner_id = ${user.id}
           OR a.prospect_id IN (SELECT prospect_id FROM prospect_assignments WHERE user_id = ${user.id} UNION SELECT id FROM prospects WHERE owner_id = ${user.id})
        ORDER BY a.created_at DESC`,
    sql`SELECT prospect_id, user_id FROM prospect_assignments`,
    sql`SELECT d.id, d.prospect_id, d.name, d.mime, d.size, d.created_at AS "createdAt", u.name AS "uploadedBy"
        FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
        ORDER BY d.created_at DESC`,
    sql`SELECT c.id, c.prospect_id, c.author_id AS "authorId", COALESCE(u.name, 'Utilisateur supprimé') AS "authorName", c.body,
               c.created_at AS "createdAt", c.updated_at AS "updatedAt"
        FROM prospect_comments c LEFT JOIN users u ON u.id = c.author_id
        WHERE ${restricted}::boolean = false
           OR c.prospect_id IN (SELECT prospect_id FROM prospect_assignments WHERE user_id = ${user.id} UNION SELECT id FROM prospects WHERE owner_id = ${user.id})
        ORDER BY c.created_at`,
    sql`SELECT h.id, h.prospect_id, h.status, u.name AS "changedBy", h.changed_at AS "changedAt"
        FROM prospect_status_history h LEFT JOIN users u ON u.id = h.changed_by
        WHERE ${restricted}::boolean = false
           OR h.prospect_id IN (SELECT prospect_id FROM prospect_assignments WHERE user_id = ${user.id} UNION SELECT id FROM prospects WHERE owner_id = ${user.id})
        ORDER BY h.changed_at`,
    sql`SELECT c.prospect_id, c.name, c.title, c.phone1, c.phone2, c.whatsapp, c.email
        FROM prospect_contacts c
        WHERE ${hideContacts}::boolean = false
        ORDER BY c.position`,
  ])
  const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null)

  return {
    prospects: prospects.map((p) => ({
      ...p,
      contact: hideContacts ? '' : p.contact,
      // Un utilisateur restreint n'a pas besoin de savoir qui d'autre a accès au dossier.
      assigneeIds: restricted ? [] : assignments.filter((a) => a.prospect_id === p.id).map((a) => a.user_id),
      documents: documents
        .filter((d) => d.prospect_id === p.id)
        .map(({ prospect_id: _, createdAt, ...d }) => ({ ...d, createdAt: iso(createdAt) }) as DocumentMeta),
      comments: comments
        .filter((c) => c.prospect_id === p.id)
        .map(({ prospect_id: _, createdAt, updatedAt, ...c }) => ({ ...c, createdAt: iso(createdAt), updatedAt: iso(updatedAt) }) as Comment),
      history: history
        .filter((h) => h.prospect_id === p.id)
        .map(({ prospect_id: _, changedAt, ...h }) => ({ ...h, changedAt: iso(changedAt) }) as StatusChange),
      contacts: contacts.filter((c) => c.prospect_id === p.id).map(({ prospect_id: _, ...c }) => c as Contact),
    })) as Prospect[],
    actions: actions as Action[],
  }
}

/** Admin et manager accèdent à tout ; un « user » seulement aux dossiers assignés ou dont il est responsable. */
export async function canAccessProspect(user: User, prospectId: string) {
  if (canEdit(user.role)) return prospectExists(prospectId)
  const rows = await sql`SELECT 1 FROM prospect_assignments WHERE prospect_id = ${prospectId} AND user_id = ${user.id}
                         UNION SELECT 1 FROM prospects WHERE id = ${prospectId} AND owner_id = ${user.id}`
  return rows.length > 0
}

/* ---------- Prospects ---------- */

function assignmentQueries(prospectId: string, userIds: string[]) {
  return [
    sql`DELETE FROM prospect_assignments WHERE prospect_id = ${prospectId}`,
    ...userIds.map((userId) => sql`INSERT INTO prospect_assignments (prospect_id, user_id) VALUES (${prospectId}, ${userId})`),
  ]
}

/** Remplace la liste des contacts d'un prospect (l'ordre saisi est conservé). */
function contactQueries(prospectId: string, contacts: Contact[]) {
  return [
    sql`DELETE FROM prospect_contacts WHERE prospect_id = ${prospectId}`,
    ...contacts.map(
      (c, position) => sql`INSERT INTO prospect_contacts (prospect_id, position, name, title, phone1, phone2, whatsapp, email)
                           VALUES (${prospectId}, ${position}, ${c.name}, ${c.title}, ${c.phone1}, ${c.phone2}, ${c.whatsapp}, ${c.email})`,
    ),
  ]
}

export async function createProspect(p: ProspectInput, assigneeIds: string[], userId: string) {
  const [{ id }] = await sql`INSERT INTO prospects (institution, contact, offer, amount, priority, status, next, date, owner, owner_id, address, website, platform_url)
                             VALUES (${p.institution}, ${p.contact}, ${p.offer}, ${p.amount}, ${p.priority}, ${p.status}, ${p.next}, ${p.date}, ${p.owner}, ${p.ownerId},
                                     ${p.address}, ${p.website}, ${p.platformUrl}) RETURNING id`
  await sql.transaction([
    sql`INSERT INTO prospect_status_history (prospect_id, status, changed_by) VALUES (${id}, ${p.status}, ${userId})`,
    ...assignmentQueries(id, assigneeIds),
    ...contactQueries(id, p.contacts),
  ])
  return id as string
}

/** Retourne false si le prospect n'existe pas. Un changement de statut est ajouté à l'historique. */
export async function updateProspect(id: string, p: ProspectInput, assigneeIds: string[], userId: string) {
  const [, rows] = await sql.transaction([
    sql`INSERT INTO prospect_status_history (prospect_id, status, changed_by)
        SELECT id, ${p.status}, ${userId} FROM prospects WHERE id = ${id} AND status <> ${p.status}`,
    sql`UPDATE prospects
        SET institution = ${p.institution}, contact = ${p.contact}, offer = ${p.offer}, amount = ${p.amount}, priority = ${p.priority}, status = ${p.status as ProspectStatus},
            next = ${p.next}, date = ${p.date}, owner = ${p.owner}, owner_id = ${p.ownerId},
            address = ${p.address}, website = ${p.website}, platform_url = ${p.platformUrl}
        WHERE id = ${id} RETURNING id`,
    ...assignmentQueries(id, assigneeIds),
    ...contactQueries(id, p.contacts),
  ])
  return rows.length > 0
}

/** Sur une liste d'ids, retourne ceux qui correspondent à des utilisateurs au profil « user ». */
export async function filterAssignableUserIds(ids: string[]) {
  if (!ids.length) return []
  const rows = await sql`SELECT id FROM users WHERE role = 'user' AND id = ANY(${ids})`
  return rows.map((r) => r.id as string)
}

export async function getAssignableUsers() {
  return (await sql`SELECT id, name, email, role FROM users WHERE role = 'user' ORDER BY name`) as User[]
}

/* ---------- Documents ---------- */

export async function insertDocument(prospectId: string, file: { name: string; mime: string; data: Buffer }, userId: string) {
  await sql`INSERT INTO documents (prospect_id, name, mime, size, data, uploaded_by)
            VALUES (${prospectId}, ${file.name}, ${file.mime}, ${file.data.length}, ${file.data}, ${userId})`
}

export async function getDocument(id: string) {
  const rows = await sql`SELECT prospect_id AS "prospectId", name, mime, data FROM documents WHERE id = ${id}`
  return rows[0] as { prospectId: string; name: string; mime: string; data: Buffer } | undefined
}

export async function removeDocument(id: string) {
  const rows = await sql`DELETE FROM documents WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

/** Les actions liées sont conservées (prospect_id passe à NULL via la clé étrangère). */
export async function removeProspect(id: string) {
  await sql`DELETE FROM prospects WHERE id = ${id}`
}

export async function prospectExists(id: string) {
  const rows = await sql`SELECT 1 FROM prospects WHERE id = ${id}`
  return rows.length > 0
}

/* ---------- Actions ---------- */

export async function createAction(a: ActionInput) {
  const [{ id }] = await sql`INSERT INTO actions (title, detail, owner, owner_id, due, prospect_id)
                             VALUES (${a.title}, ${a.detail}, ${a.owner}, ${a.ownerId}, ${a.due}, ${a.prospectId}) RETURNING id`
  return id as string
}

export async function updateAction(id: string, a: ActionInput) {
  const rows = await sql`UPDATE actions
                         SET title = ${a.title}, detail = ${a.detail}, owner = ${a.owner}, owner_id = ${a.ownerId}, due = ${a.due as ActionDue}, prospect_id = ${a.prospectId}
                         WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

/** Retourne false si le prospect n'existe pas. */
export async function setProspectPriority(id: string, priority: ManualPriority | null) {
  const rows = await sql`UPDATE prospects SET priority = ${priority} WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

export async function toggleAction(id: string) {
  const rows = await sql`UPDATE actions SET done = NOT done WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

export async function removeAction(id: string) {
  await sql`DELETE FROM actions WHERE id = ${id}`
}

/* ---------- Utilisateurs ---------- */

type UserInput = Omit<User, 'id'>

export async function getUsers() {
  return (await sql`SELECT id, name, email, role FROM users ORDER BY created_at`) as User[]
}

export async function findUserByEmail(email: string) {
  const rows = await sql`SELECT id, name, email, role, password_hash AS "passwordHash" FROM users WHERE email = ${email}`
  return rows[0] as (User & { passwordHash: string }) | undefined
}

export async function getPasswordHash(id: string) {
  const rows = await sql`SELECT password_hash FROM users WHERE id = ${id}`
  return rows[0]?.password_hash as string | undefined
}

export async function getUser(id: string) {
  const rows = await sql`SELECT id, name, email, role FROM users WHERE id = ${id}`
  return rows[0] as User | undefined
}

export async function countAdmins() {
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM users WHERE role = 'admin'`
  return count as number
}

export async function createUser(u: UserInput, passwordHash: string) {
  await sql`INSERT INTO users (name, email, role, password_hash) VALUES (${u.name}, ${u.email}, ${u.role}, ${passwordHash})`
}

export async function updateUser(id: string, u: UserInput) {
  const rows = await sql`UPDATE users SET name = ${u.name}, email = ${u.email}, role = ${u.role as Role} WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

export async function updatePassword(id: string, passwordHash: string) {
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${id}`
}

/** Les sessions de l'utilisateur sont supprimées en cascade. */
export async function removeUser(id: string) {
  await sql`DELETE FROM users WHERE id = ${id}`
}

/* ---------- Sessions ---------- */

export async function insertSession(tokenHash: string, userId: string, expiresAt: Date) {
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${tokenHash}, ${userId}, ${expiresAt.toISOString()})`
}

export async function getSessionUser(tokenHash: string) {
  const rows = await sql`SELECT u.id, u.name, u.email, u.role
                         FROM sessions s JOIN users u ON u.id = s.user_id
                         WHERE s.token_hash = ${tokenHash} AND s.expires_at > now()`
  return rows[0] as User | undefined
}

export async function deleteSession(tokenHash: string) {
  await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash} OR expires_at < now()`
}

/** Déconnecte toutes les sessions d'un utilisateur, sauf éventuellement la session courante. */
export async function deleteUserSessions(userId: string, exceptTokenHash?: string) {
  await sql`DELETE FROM sessions WHERE user_id = ${userId} AND token_hash <> ${exceptTokenHash ?? ''}`
}

/* ---------- Commentaires ---------- */

export async function insertComment(prospectId: string, authorId: string, body: string) {
  await sql`INSERT INTO prospect_comments (prospect_id, author_id, body) VALUES (${prospectId}, ${authorId}, ${body})`
}

export async function getComment(id: string) {
  const rows = await sql`SELECT prospect_id AS "prospectId", author_id AS "authorId" FROM prospect_comments WHERE id = ${id}`
  return rows[0] as { prospectId: string; authorId: string | null } | undefined
}

export async function updateComment(id: string, body: string) {
  await sql`UPDATE prospect_comments SET body = ${body}, updated_at = now() WHERE id = ${id}`
}

export async function removeComment(id: string) {
  await sql`DELETE FROM prospect_comments WHERE id = ${id}`
}

/* ---------- Comptes sélectionnables comme responsable ---------- */

export async function getMembers() {
  return (await sql`SELECT id, name, role FROM users ORDER BY name`) as Member[]
}

export async function getMember(id: string) {
  const rows = await sql`SELECT id, name, role FROM users WHERE id = ${id}`
  return rows[0] as Member | undefined
}

/* ---------- Instantanés (avant/après) pour les notifications ---------- */

export type ProspectSnapshot = {
  id: string
  institution: string
  status: ProspectStatus
  next: string
  date: string | null
  owner: string
  ownerId: string | null
  assigneeIds: string[]
}

export async function getProspectSnapshot(id: string) {
  const [rows, assignees] = await Promise.all([
    sql`SELECT p.id, p.institution, p.status, p.next, to_char(p.date, 'YYYY-MM-DD') AS date, COALESCE(u.name, p.owner) AS owner, p.owner_id AS "ownerId"
        FROM prospects p LEFT JOIN users u ON u.id = p.owner_id WHERE p.id = ${id}`,
    sql`SELECT user_id FROM prospect_assignments WHERE prospect_id = ${id}`,
  ])
  if (!rows[0]) return undefined
  return { ...rows[0], assigneeIds: assignees.map((a) => a.user_id as string) } as ProspectSnapshot
}

export type ActionSnapshot = {
  id: string
  title: string
  due: ActionDue
  done: boolean
  owner: string
  ownerId: string | null
  prospectId: string | null
  institution: string | null
  /** Responsable et utilisateurs du prospect lié. */
  prospectUserIds: string[]
}

export async function getActionSnapshot(id: string) {
  const rows = await sql`SELECT a.id, a.title, a.due, a.done, COALESCE(u.name, a.owner) AS owner, a.owner_id AS "ownerId",
                                a.prospect_id AS "prospectId", p.institution
                         FROM actions a LEFT JOIN users u ON u.id = a.owner_id LEFT JOIN prospects p ON p.id = a.prospect_id
                         WHERE a.id = ${id}`
  if (!rows[0]) return undefined
  return { ...rows[0], prospectUserIds: await prospectUserIds(rows[0].prospectId) } as ActionSnapshot
}

/** Responsable + utilisateurs ayant accès à un prospect. */
export async function prospectUserIds(prospectId: string | null) {
  if (!prospectId) return []
  const rows = await sql`SELECT owner_id AS id FROM prospects WHERE id = ${prospectId} AND owner_id IS NOT NULL
                         UNION SELECT user_id FROM prospect_assignments WHERE prospect_id = ${prospectId}`
  return rows.map((r) => r.id as string)
}

/* ---------- Notifications ---------- */

export type NotificationInput = Pick<Notification, 'entity' | 'kind' | 'prospectId' | 'title' | 'body'>

export async function insertNotifications(userIds: string[], actorId: string, n: NotificationInput) {
  if (!userIds.length) return
  await sql.transaction(
    userIds.map(
      (userId) => sql`INSERT INTO notifications (user_id, actor_id, entity, kind, prospect_id, title, body)
                      VALUES (${userId}, ${actorId}, ${n.entity}, ${n.kind}, ${n.prospectId}, ${n.title}, ${n.body})`,
    ),
  )
}

export async function getNotifications(userId: string, limit = 30) {
  const [rows, [{ unread }]] = await Promise.all([
    sql`SELECT n.id, n.entity, n.kind, n.prospect_id AS "prospectId", n.title, n.body, u.name AS "actorName",
               n.read_at IS NOT NULL AS read, n.created_at AS "createdAt"
        FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
        WHERE n.user_id = ${userId}
        ORDER BY n.created_at DESC LIMIT ${limit}`,
    sql`SELECT count(*)::int AS unread FROM notifications WHERE user_id = ${userId} AND read_at IS NULL`,
  ])
  return {
    items: rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() })) as Notification[],
    unread: unread as number,
  }
}

/** Marque comme lues les notifications données (toutes si aucune liste). */
export async function markNotificationsRead(userId: string, ids?: string[]) {
  if (ids) await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${userId} AND id = ANY(${ids}) AND read_at IS NULL`
  else await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${userId} AND read_at IS NULL`
}
