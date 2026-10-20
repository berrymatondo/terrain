export const PROSPECT_STATUSES = [
  'À contacter',
  'Contacté',
  'Échange engagé',
  'En étude',
  'En rédaction',
  'Proposition envoyée',
  'En négociation',
  'En attente de la signature',
  'Signé',
  'Perdu',
] as const

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number]

export const ACTION_DUE_LABELS = ['Prioritaire', 'Cette semaine', 'À planifier', 'À relancer', 'À préparer'] as const

export type ActionDue = (typeof ACTION_DUE_LABELS)[number]

export type Prospect = {
  id: string
  institution: string
  contact: string
  offer: string
  status: ProspectStatus
  next: string
  /** Date de relance au format ISO (YYYY-MM-DD) */
  date: string | null
  /** Nom affiché du responsable : nom du compte, ou ancien nom saisi à la main. */
  owner: string
  /** Compte responsable (destinataire des notifications), null si aucun ou ancien nom libre. */
  ownerId: string | null
  /** Adresse physique de l'institution. */
  address: string
  website: string
  /** Lien d'accès à la plateforme développée pour ce prospect. */
  platformUrl: string
  /** Contacts de l'institution, dans l'ordre (le premier est le contact principal). */
  contacts: Contact[]
  /** Utilisateurs (profil « user ») ayant accès à ce dossier. */
  assigneeIds: string[]
  documents: DocumentMeta[]
  comments: Comment[]
  /** Changements de statut, du plus ancien au plus récent. */
  history: StatusChange[]
}

export type Comment = {
  id: string
  authorId: string | null
  authorName: string
  body: string
  createdAt: string
  updatedAt: string | null
}

export type StatusChange = {
  id: string
  status: ProspectStatus
  changedBy: string | null
  changedAt: string
}

export const MAX_COMMENT_LENGTH = 5000

/** L'auteur peut modifier ou supprimer son commentaire ; l'administrateur peut tout modifier. */
export const canModifyComment = (user: User, comment: Pick<Comment, 'authorId'>) => user.role === 'admin' || comment.authorId === user.id

export type DocumentMeta = {
  id: string
  name: string
  mime: string
  size: number
  createdAt: string
  uploadedBy: string | null
}

export const MAX_DOCUMENT_SIZE = 4 * 1024 * 1024

export type Action = {
  id: string
  title: string
  detail: string
  owner: string
  ownerId: string | null
  due: ActionDue
  prospectId: string | null
  done: boolean
}

export type Database = {
  prospects: Prospect[]
  actions: Action[]
}

export type MutationResult = { ok: true } | { ok: false; error: string }

export const ROLES = ['admin', 'manager', 'user'] as const

export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  user: 'Utilisateur',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Accès complet, y compris la gestion des utilisateurs',
  manager: 'Accès complet aux prospects et actions',
  user: 'Lecture seule',
}

export type User = {
  id: string
  name: string
  email: string
  role: Role
}

/** Admin et Manager peuvent créer, modifier et supprimer prospects et actions. */
export const canEdit = (role: Role) => role === 'admin' || role === 'manager'

/** Les coordonnées des contacts ne sont pas communiquées aux « Utilisateurs ». */
export const canSeeContacts = (role: Role) => canEdit(role)

export const canManageUsers = (role: Role) => role === 'admin'

/** Compte sélectionnable comme responsable. */
export type Member = Pick<User, 'id' | 'name' | 'role'>

/** Valeur du sélecteur « Responsable » qui conserve un ancien nom saisi à la main. */
export const LEGACY_OWNER = '__legacy__'

export type Notification = {
  id: string
  entity: 'prospect' | 'action'
  kind: 'created' | 'updated' | 'deleted'
  prospectId: string | null
  title: string
  body: string
  actorName: string | null
  read: boolean
  createdAt: string
}

export type Contact = {
  name: string
  /** Fonction dans l'institution. */
  title: string
  phone1: string
  phone2: string
  /** Numéro utilisé pour WhatsApp. */
  whatsapp: 'phone1' | 'phone2' | null
  email: string
}

export const MAX_CONTACTS = 10

/** Lien http(s) affichable, ou chaîne vide. Ajoute « https:// » si l'adresse est saisie sans protocole. */
export function normalizeUrl(value: string) {
  const raw = value.trim()
  if (!raw) return ''
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Lien WhatsApp (wa.me) à partir d'un numéro au format international. */
export function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^00/, '')
  return digits ? `https://wa.me/${digits}` : null
}
