'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, FileText, Plus, Trash2, Upload, X } from 'lucide-react'
import { changeOwnPassword, deleteAction, deleteDocument, deleteProspect, deleteUser, saveAction, saveProspect, saveUser } from '@/app/actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/field'
import { PdfViewer } from '@/components/pdf-viewer'
import { previewOf } from '@/lib/documents'
import { ACTION_DUE_LABELS, LEGACY_OWNER, MANUAL_PRIORITIES, MAX_CONTACTS, MAX_DOCUMENT_SIZE, PROSPECT_STATUSES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Action, type Contact, type DocumentMeta, type Member, type MutationResult, type Prospect, type User } from '@/lib/types'

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void; formKey: number }

/** Soumet le formulaire sans le réinitialiser en cas d'erreur, et ferme la modale en cas de succès. */
function useSubmit(action: (formData: FormData) => Promise<MutationResult>, onSuccess: () => void) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await action(formData)
      if (result.ok) onSuccess()
      else setError(result.error)
    })
  }

  return { error, pending, onSubmit }
}

function FormFooter({ error, pending }: { error?: string; pending: boolean }) {
  return (
    <>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Responsable : un compte de l'application, ou l'ancien nom saisi à la main tant qu'il n'est pas remplacé. */
function OwnerSelect({ id, members, current }: { id: string; members: Member[]; current?: { owner: string; ownerId: string | null } }) {
  const legacy = current && !current.ownerId && current.owner ? current.owner : null
  return (
    <NativeSelect id={id} name="ownerId" defaultValue={current?.ownerId ?? (legacy ? LEGACY_OWNER : '')}>
      <option value="">Aucun</option>
      {legacy && <option value={LEGACY_OWNER}>{legacy} (ancien nom, sans compte)</option>}
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name} · {ROLE_LABELS[m.role]}
        </option>
      ))}
    </NativeSelect>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{title}</h3>
      {children}
    </section>
  )
}

const emptyContact = (): Contact => ({ name: '', title: '', phone1: '', phone2: '', whatsapp: null, email: '' })

/** Liste de contacts modifiable ; envoyée au serveur en JSON dans le champ caché « contacts ». */
function ContactsEditor({ initial }: { initial?: Contact[] }) {
  const [contacts, setContacts] = useState<Contact[]>(initial?.length ? initial : [emptyContact()])
  const update = (index: number, patch: Partial<Contact>) => setContacts((list) => list.map((c, i) => (i === index ? { ...c, ...patch } : c)))

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="contacts" value={JSON.stringify(contacts)} />
      {contacts.map((contact, index) => {
        const id = (field: string) => `contact-${index}-${field}`
        return (
          <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600">
                Contact {index + 1}
                {index === 0 && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">principal</span>}
              </p>
              <Button type="button" variant="ghost" size="icon-xs" className="text-slate-400 hover:text-destructive" aria-label={`Retirer le contact ${index + 1}`} onClick={() => setContacts((list) => list.filter((_, i) => i !== index))}>
                <X />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom" htmlFor={id('name')}>
                <Input id={id('name')} value={contact.name} onChange={(e) => update(index, { name: e.target.value })} placeholder="Prénom Nom" />
              </Field>
              <Field label="Fonction" htmlFor={id('title')}>
                <Input id={id('title')} value={contact.title} onChange={(e) => update(index, { title: e.target.value })} placeholder="Directeur, point focal…" />
              </Field>
              {(['phone1', 'phone2'] as const).map((phone, n) => (
                <Field key={phone} label={`Téléphone ${n + 1}`} htmlFor={id(phone)}>
                  <div className="flex items-center gap-2">
                    <Input id={id(phone)} type="tel" value={contact[phone]} onChange={(e) => update(index, { [phone]: e.target.value })} placeholder="+243 …" />
                    <label className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${contact.whatsapp === phone ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-card text-slate-500'}`} title="Numéro utilisé pour WhatsApp">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-emerald-600"
                        checked={contact.whatsapp === phone}
                        onChange={(e) => update(index, { whatsapp: e.target.checked ? phone : null })}
                      />
                      WhatsApp
                    </label>
                  </div>
                </Field>
              ))}
              <Field label="Adresse e-mail" htmlFor={id('email')} className="sm:col-span-2">
                <Input id={id('email')} type="email" value={contact.email} onChange={(e) => update(index, { email: e.target.value })} placeholder="nom@institution.cd" />
              </Field>
            </div>
          </div>
        )
      })}
      {contacts.length < MAX_CONTACTS ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setContacts((list) => [...list, emptyContact()])}>
          <Plus data-icon="inline-start" /> Ajouter un contact
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Maximum de {MAX_CONTACTS} contacts atteint.</p>
      )}
    </div>
  )
}

/* ---------- Prospect ---------- */

export function ProspectDialog({ open, onOpenChange, formKey, prospect, assignableUsers, members }: DialogProps & { prospect?: Prospect; assignableUsers: User[]; members: Member[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{prospect ? 'Modifier le prospect' : 'Nouveau prospect'}</DialogTitle>
          <DialogDescription>{prospect ? `Mettre à jour le suivi de ${prospect.institution}.` : 'Ajouter une opportunité au portefeuille.'}</DialogDescription>
        </DialogHeader>
        <ProspectForm key={formKey} prospect={prospect} assignableUsers={assignableUsers} members={members} onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ProspectForm({ prospect, assignableUsers, members, onSuccess }: { prospect?: Prospect; assignableUsers: User[]; members: Member[]; onSuccess: () => void }) {
  const { error, pending, onSubmit } = useSubmit(saveProspect, onSuccess)

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      {prospect && <input type="hidden" name="id" value={prospect.id} />}

      <FormSection title="Institution">
        <Field label="Institution / prospect *" htmlFor="institution">
          <Input id="institution" name="institution" required autoFocus defaultValue={prospect?.institution} />
        </Field>
        <Field label="Adresse physique" htmlFor="address">
          <Textarea id="address" name="address" rows={2} className="min-h-0" placeholder="Avenue, numéro, commune, ville" defaultValue={prospect?.address} />
        </Field>
        <Field label="Site web" htmlFor="website">
          <Input id="website" name="website" inputMode="url" placeholder="www.institution.cd" defaultValue={prospect?.website} />
        </Field>
      </FormSection>

      <FormSection title="Offre et plateforme">
        <Field label="Offre proposée" htmlFor="offer">
          <Input id="offer" name="offer" defaultValue={prospect?.offer} />
        </Field>
        <Field label="Potentiel financier estimé (USD)" htmlFor="amount">
          <Input id="amount" name="amount" inputMode="decimal" placeholder="25 000" defaultValue={prospect?.amount ?? ''} />
        </Field>
        <Field label="Priorité" htmlFor="priority">
          <NativeSelect id="priority" name="priority" defaultValue={prospect?.priority ?? ''}>
            <option value="">Automatique (calculée)</option>
            {MANUAL_PRIORITIES.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Lien d’accès à la plateforme" htmlFor="platformUrl">
          <Input id="platformUrl" name="platformUrl" inputMode="url" placeholder="https://plateforme.exemple.cd" defaultValue={prospect?.platformUrl} />
        </Field>
      </FormSection>

      <FormSection title="Contacts">
        <ContactsEditor initial={prospect?.contacts} />
      </FormSection>

      <FormSection title="Suivi">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Statut" htmlFor="status">
          <NativeSelect id="status" name="status" defaultValue={prospect?.status ?? 'À contacter'}>
            {PROSPECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Responsable (notifié)" htmlFor="ownerId">
          <OwnerSelect id="ownerId" members={members} current={prospect} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Prochaine action" htmlFor="next">
          <Input id="next" name="next" defaultValue={prospect?.next} />
        </Field>
        <Field label="Relance" htmlFor="date">
          <Input id="date" name="date" type="date" defaultValue={prospect?.date ?? ''} />
        </Field>
      </div>
      </FormSection>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium text-slate-600">Utilisateurs ayant accès à ce dossier</legend>
        <p className="text-xs text-muted-foreground">Les administrateurs et managers voient tous les dossiers. Les utilisateurs ne voient que ceux qui leur sont assignés ou dont ils sont responsables. Toutes ces personnes sont notifiées des changements.</p>
        {assignableUsers.length === 0 ? (
          <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Aucun compte au profil « Utilisateur » pour le moment.</p>
        ) : (
          <div className="mt-1 grid max-h-36 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
            {assignableUsers.map((user) => (
              <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" name="assignees" value={user.id} defaultChecked={prospect?.assigneeIds.includes(user.id)} className="size-4 accent-primary" />
                <span className="truncate">{user.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <FormFooter error={error} pending={pending} />
    </form>
  )
}

/* ---------- Documents ---------- */

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
}

export function DocumentsDialog({ open, onOpenChange, prospect, editable }: { open: boolean; onOpenChange: (open: boolean) => void; prospect?: Prospect; editable: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string>()
  const [previewId, setPreviewId] = useState<string>()
  const [, startTransition] = useTransition()
  const documents = prospect?.documents ?? []
  const previewIndex = documents.findIndex((d) => d.id === previewId)
  const previewed = previewIndex >= 0 ? documents[previewIndex] : undefined

  async function upload(files: FileList | null) {
    if (!prospect || !files?.length) return
    setError(undefined)
    const tooBig = Array.from(files).find((f) => f.size > MAX_DOCUMENT_SIZE)
    if (tooBig) return setError(`« ${tooBig.name} » dépasse la taille maximale de ${MAX_DOCUMENT_SIZE / 1024 / 1024} Mo.`)

    const body = new FormData()
    for (const file of Array.from(files)) body.append('files', file)
    setUploading(true)
    try {
      const response = await fetch(`/api/prospects/${prospect.id}/documents`, { method: 'POST', body })
      const result = (await response.json().catch(() => ({ ok: false, error: 'Envoi impossible.' }))) as MutationResult
      if (!result.ok) setError(result.error)
      else startTransition(() => router.refresh())
    } catch {
      setError('Envoi impossible. Vérifiez votre connexion.')
    } finally {
      setUploading(false)
    }
  }

  function remove(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteDocument(id)
      if (!result.ok) setError(result.error)
      setDeletingId(undefined)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setError(undefined)
          setPreviewId(undefined)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className={previewed ? 'max-w-5xl' : 'max-w-xl'}>
        {previewed ? (
          <DocumentPreview
            doc={previewed}
            position={`${previewIndex + 1} / ${documents.length}`}
            onBack={() => setPreviewId(undefined)}
            onPrevious={previewIndex > 0 ? () => setPreviewId(documents[previewIndex - 1].id) : undefined}
            onNext={previewIndex < documents.length - 1 ? () => setPreviewId(documents[previewIndex + 1].id) : undefined}
          />
        ) : (
        <>
        <DialogHeader>
          <DialogTitle>Documents — {prospect?.institution}</DialogTitle>
          <DialogDescription>
            {documents.length === 0 ? 'Aucun document joint.' : `${documents.length} document${documents.length > 1 ? 's' : ''} joint${documents.length > 1 ? 's' : ''}. Cliquez sur un document pour l’afficher.`}
          </DialogDescription>
        </DialogHeader>

        {documents.length > 0 && (
          <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 px-3 py-2.5">
                <FileText className="size-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <button onClick={() => setPreviewId(doc.id)} className="block max-w-full truncate text-left text-sm font-medium hover:text-primary hover:underline">
                    {doc.name}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(doc.size)} · {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                    {doc.uploadedBy && ` · ${doc.uploadedBy}`}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Afficher ${doc.name}`} title="Afficher" onClick={() => setPreviewId(doc.id)}>
                  <Eye />
                </Button>
                <a href={`/api/documents/${doc.id}?download`} aria-label={`Télécharger ${doc.name}`} title="Télécharger" className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
                  <Download />
                </a>
                {editable && (
                  <Button variant="ghost" size="icon" className="text-slate-400 hover:text-destructive" disabled={deletingId === doc.id} aria-label={`Supprimer ${doc.name}`} onClick={() => remove(doc.id)}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center transition-colors hover:border-primary hover:bg-primary/5 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
            <Upload className="size-5 text-slate-400" />
            <span className="text-sm font-medium">{uploading ? 'Envoi en cours…' : 'Ajouter des documents'}</span>
            <span className="text-xs text-muted-foreground">Plusieurs fichiers possibles · {MAX_DOCUMENT_SIZE / 1024 / 1024} Mo maximum par fichier</span>
            <input
              type="file"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                upload(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        )}

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Visionneuse intégrée : PDF, images, texte, audio et vidéo s'affichent sans téléchargement. */
function DocumentPreview({ doc, position, onBack, onPrevious, onNext }: { doc: DocumentMeta; position: string; onBack: () => void; onPrevious?: () => void; onNext?: () => void }) {
  const preview = previewOf(doc.name, doc.mime)
  const src = `/api/documents/${doc.id}`
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 pr-8">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" /> Documents
        </Button>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-sm">{doc.name}</DialogTitle>
          <DialogDescription className="text-xs">
            {formatSize(doc.size)} · {position}
          </DialogDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" disabled={!onPrevious} onClick={onPrevious} aria-label="Document précédent" title="Précédent">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon" disabled={!onNext} onClick={onNext} aria-label="Document suivant" title="Suivant">
            <ChevronRight />
          </Button>
          {preview && (
            <a href={src} target="_blank" rel="noopener" className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label="Ouvrir dans un nouvel onglet" title="Ouvrir dans un nouvel onglet">
              <ExternalLink />
            </a>
          )}
          <a href={`${src}?download`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Download data-icon="inline-start" /> Télécharger
          </a>
        </div>
      </div>

      <div className="flex h-[min(72vh,800px)] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        {preview?.kind === 'pdf' && <PdfViewer key={doc.id} src={src} downloadHref={`${src}?download`} title={doc.name} />}
        {preview?.kind === 'text' && <iframe key={doc.id} src={src} title={doc.name} sandbox="" className="size-full bg-white" />}
        {/* eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par l'API, pas d'optimisation possible */}
        {preview?.kind === 'image' && <img key={doc.id} src={src} alt={doc.name} className="max-h-full max-w-full object-contain" />}
        {preview?.kind === 'video' && <video key={doc.id} src={src} controls className="max-h-full max-w-full" />}
        {preview?.kind === 'audio' && <audio key={doc.id} src={src} controls className="w-4/5" />}
        {!preview && (
          <div className="flex max-w-sm flex-col items-center gap-3 p-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-card text-slate-400 shadow-sm">
              <FileText className="size-6" />
            </div>
            <p className="text-sm font-medium text-slate-700">Aperçu non disponible pour ce type de fichier</p>
            <p className="text-xs text-muted-foreground">Les PDF, images, textes, sons et vidéos s’affichent directement. Pour les fichiers Word, Excel ou PowerPoint, téléchargez-les ou joignez-en une version PDF.</p>
            <a href={`${src}?download`} className={buttonVariants({ size: 'sm' })}>
              <Download data-icon="inline-start" /> Télécharger
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Aperçu du rapport ---------- */

/** Affiche le rapport PDF d'un prospect dans la page, sans le télécharger. */
export function ReportPreviewDialog({ open, onOpenChange, prospect }: Omit<DialogProps, 'formKey'> & { prospect?: Prospect }) {
  const src = prospect && `/api/reports/prospects/${prospect.id}`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm">Rapport · {prospect?.institution}</DialogTitle>
              <DialogDescription className="text-xs">Aperçu du rapport PDF</DialogDescription>
            </div>
            {src && (
              <div className="flex items-center gap-1">
                <a href={`${src}?preview`} target="_blank" rel="noopener" className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label="Ouvrir dans un nouvel onglet" title="Ouvrir dans un nouvel onglet">
                  <ExternalLink />
                </a>
                <a href={src} download className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  <Download data-icon="inline-start" /> Télécharger
                </a>
              </div>
            )}
          </div>
          <div className="h-[min(78vh,900px)] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {src && <PdfViewer key={src} src={`${src}?preview`} downloadHref={src} title={`Rapport ${prospect?.institution}`} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Action ---------- */

export function ActionDialog({ open, onOpenChange, formKey, action, prospects, members }: DialogProps & { action?: Action; prospects: Prospect[]; members: Member[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action ? 'Modifier l’action' : 'Nouvelle action'}</DialogTitle>
          <DialogDescription>{action ? 'Mettre à jour cette action.' : 'Planifier une action à mener.'}</DialogDescription>
        </DialogHeader>
        <ActionForm key={formKey} action={action} prospects={prospects} members={members} onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ActionForm({ action, prospects, members, onSuccess }: { action?: Action; prospects: Prospect[]; members: Member[]; onSuccess: () => void }) {
  const { error, pending, onSubmit } = useSubmit(saveAction, onSuccess)

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {action && <input type="hidden" name="id" value={action.id} />}
      <Field label="Titre *" htmlFor="title">
        <Input id="title" name="title" required autoFocus defaultValue={action?.title} />
      </Field>
      <Field label="Détail" htmlFor="detail">
        <Textarea id="detail" name="detail" defaultValue={action?.detail} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Responsable (notifié)" htmlFor="action-owner">
          <OwnerSelect id="action-owner" members={members} current={action} />
        </Field>
        <Field label="Échéance" htmlFor="due">
          <NativeSelect id="due" name="due" defaultValue={action?.due ?? 'À planifier'}>
            {ACTION_DUE_LABELS.map((due) => (
              <option key={due} value={due}>
                {due}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Prospect lié" htmlFor="prospectId">
        <NativeSelect id="prospectId" name="prospectId" defaultValue={action?.prospectId ?? ''}>
          <option value="">Aucun</option>
          {prospects.map((prospect) => (
            <option key={prospect.id} value={prospect.id}>
              {prospect.institution}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <FormFooter error={error} pending={pending} />
    </form>
  )
}

/* ---------- Utilisateur ---------- */

export function UserDialog({ open, onOpenChange, formKey, user, isSelf }: DialogProps & { user?: User; isSelf: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}</DialogTitle>
          <DialogDescription>{user ? `Mettre à jour le compte de ${user.name}.` : 'Créer un accès à l’application.'}</DialogDescription>
        </DialogHeader>
        <UserForm key={formKey} user={user} isSelf={isSelf} onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function UserForm({ user, isSelf, onSuccess }: { user?: User; isSelf: boolean; onSuccess: () => void }) {
  const { error, pending, onSubmit } = useSubmit(saveUser, onSuccess)

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom *" htmlFor="user-name">
          <Input id="user-name" name="name" required autoFocus defaultValue={user?.name} />
        </Field>
        <Field label="Adresse e-mail *" htmlFor="user-email">
          <Input id="user-email" name="email" type="email" required autoComplete="off" defaultValue={user?.email} />
        </Field>
      </div>
      <Field label="Profil" htmlFor="role">
        {/* Un admin ne peut pas modifier son propre profil, pour éviter de perdre l'accès. */}
        {isSelf && <input type="hidden" name="role" value={user?.role} />}
        <NativeSelect id="role" name={isSelf ? undefined : 'role'} disabled={isSelf} defaultValue={user?.role ?? 'user'}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]} — {ROLE_DESCRIPTIONS[role]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={user ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe * (8 caractères minimum)'} htmlFor="user-password">
        <Input id="user-password" name="password" type="password" autoComplete="new-password" required={!user} minLength={8} />
      </Field>
      <FormFooter error={error} pending={pending} />
    </form>
  )
}

export function PasswordDialog({ open, onOpenChange, formKey }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Changer mon mot de passe</DialogTitle>
          <DialogDescription>Vos autres sessions ouvertes seront déconnectées.</DialogDescription>
        </DialogHeader>
        <PasswordForm key={formKey} onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function PasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const { error, pending, onSubmit } = useSubmit(changeOwnPassword, onSuccess)

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Mot de passe actuel" htmlFor="current">
        <Input id="current" name="current" type="password" autoComplete="current-password" required autoFocus />
      </Field>
      <Field label="Nouveau mot de passe (8 caractères minimum)" htmlFor="new-password">
        <Input id="new-password" name="next" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirmer le nouveau mot de passe" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <FormFooter error={error} pending={pending} />
    </form>
  )
}

/* ---------- Suppression ---------- */

export type DeleteTarget = { kind: 'prospect' | 'action' | 'user'; id: string; label: string }

const deleteConfig = {
  prospect: { title: 'Supprimer le prospect', run: deleteProspect, note: ' Les actions liées seront conservées sans prospect.', suffix: '' },
  action: { title: 'Supprimer l’action', run: deleteAction, note: '', suffix: 'e' },
  user: { title: 'Supprimer l’utilisateur', run: deleteUser, note: ' Il ne pourra plus se connecter.', suffix: '' },
}

export function DeleteDialog({ open, onOpenChange, target }: { open: boolean; onOpenChange: (open: boolean) => void; target?: DeleteTarget }) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  function confirm() {
    if (!target) return
    startTransition(async () => {
      const result = await deleteConfig[target.kind].run(target.id)
      if (result.ok) onOpenChange(false)
      else setError(result.error)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setError(undefined)
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{target && deleteConfig[target.kind].title}</DialogTitle>
          <DialogDescription>
            « {target?.label} » sera définitivement supprimé{target && deleteConfig[target.kind].suffix}.{target && deleteConfig[target.kind].note}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
          <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" disabled={pending} onClick={confirm}>
            {pending ? 'Suppression…' : 'Supprimer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
