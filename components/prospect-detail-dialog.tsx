'use client'

import { useState, useTransition } from 'react'
import { Check, CircleX, FileDown, Globe, Mail, MapPin, MessageCircle, MessageSquare, MonitorSmartphone, Pencil, Phone, Trash2 } from 'lucide-react'
import { addComment, deleteComment, editComment } from '@/app/actions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/field'
import { PIPELINE, progressOf } from '@/lib/progress'
import { canModifyComment, canSeeContacts, MAX_COMMENT_LENGTH, whatsappLink, type Comment, type Prospect, type User } from '@/lib/types'

function initials(name: string) {
  const words = name.replace(/[^\p{L}\s-]/gu, ' ').split(/[\s-]+/).filter((w) => w.length > 1)
  return (words.slice(0, 2).map((w) => w[0]).join('') || name.slice(0, 2)).toUpperCase()
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/* ---------- Avancement ---------- */

export function ProgressBar({ prospect, className = '' }: { prospect: Pick<Prospect, 'status'>; className?: string }) {
  const lost = prospect.status === 'Perdu'
  const value = progressOf(prospect.status)
  return (
    <div className={`flex items-center gap-2 ${className}`} title={lost ? 'Prospect perdu' : `Avancement : ${value} %`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={lost ? 0 : value} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${lost ? 'bg-rose-300' : value === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${lost ? 100 : Math.max(value, 4)}%` }} />
      </div>
      <span className={`w-9 text-right text-xs tabular-nums ${lost ? 'text-rose-600' : 'text-slate-500'}`}>{lost ? '—' : `${value} %`}</span>
    </div>
  )
}

function Pipeline({ prospect }: { prospect: Prospect }) {
  const lost = prospect.status === 'Perdu'
  const current = PIPELINE.indexOf(prospect.status)
  // Dernière date à laquelle chaque étape a été atteinte.
  const reachedAt = new Map(prospect.history.map((h) => [h.status, h.changedAt]))

  return (
    <ol className="flex flex-col">
      {PIPELINE.map((stage, index) => {
        const done = !lost && index < current
        const active = !lost && index === current
        return (
          <li key={stage} className="relative flex gap-3 pb-3 last:pb-0">
            {index < PIPELINE.length - 1 && <span className={`absolute top-6 left-[11px] h-[calc(100%-1.25rem)] w-0.5 ${done ? 'bg-primary' : 'bg-slate-200'}`} />}
            <span
              className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold ${
                done ? 'border-primary bg-primary text-white' : active ? 'border-primary bg-card text-primary' : 'border-slate-200 bg-card text-slate-400'
              }`}
            >
              {done ? <Check className="size-3" /> : index + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={`text-sm ${active ? 'font-semibold text-primary' : done ? 'text-slate-700' : 'text-slate-400'}`}>{stage}</p>
              {(done || active) && reachedAt.has(stage) && <p className="text-[11px] text-muted-foreground">{formatDay(reachedAt.get(stage)!)}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ---------- Commentaires ---------- */

function CommentItem({ comment, currentUser }: { comment: Comment; currentUser: User }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const canModify = canModifyComment(currentUser, comment)
  const isOwn = comment.authorId === currentUser.id

  function save() {
    setError(undefined)
    startTransition(async () => {
      const result = await editComment(comment.id, draft)
      if (result.ok) setEditing(false)
      else setError(result.error)
    })
  }

  function remove() {
    setError(undefined)
    startTransition(async () => {
      const result = await deleteComment(comment.id)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <li className="flex gap-3">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className={`text-[10px] font-semibold ${isOwn ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600'}`}>{initials(comment.authorName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-sm font-medium">{comment.authorName}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(comment.createdAt)}
            {comment.updatedAt && <span title={`Modifié le ${formatDateTime(comment.updatedAt)}`}> · modifié</span>}
          </p>
          {canModify && !editing && !confirmDelete && (
            <div className="ml-auto flex gap-0.5">
              <Button variant="ghost" size="icon-xs" aria-label="Modifier le commentaire" title={isOwn ? 'Modifier' : 'Modifier (administrateur)'} onClick={() => setEditing(true)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-xs" className="text-slate-400 hover:text-destructive" aria-label="Supprimer le commentaire" title={isOwn ? 'Supprimer' : 'Supprimer (administrateur)'} onClick={() => setConfirmDelete(true)}>
                <Trash2 />
              </Button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-1.5 flex flex-col gap-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MAX_COMMENT_LENGTH} autoFocus aria-label="Modifier le commentaire" />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false)
                  setDraft(comment.body)
                  setError(undefined)
                }}
              >
                Annuler
              </Button>
              <Button size="sm" disabled={pending || !draft.trim()} onClick={save}>
                {pending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 rounded-lg rounded-tl-none bg-slate-50 px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap text-slate-700">{comment.body}</p>
        )}

        {confirmDelete && (
          <div className="mt-2 flex items-center justify-end gap-2 text-sm">
            <span className="text-slate-600">Supprimer ce commentaire ?</span>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Non
            </Button>
            <Button size="sm" className="bg-destructive text-white hover:bg-destructive/90" disabled={pending} onClick={remove}>
              {pending ? 'Suppression…' : 'Supprimer'}
            </Button>
          </div>
        )}
        {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      </div>
    </li>
  )
}

function CommentForm({ prospectId }: { prospectId: string }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!body.trim()) return
    setError(undefined)
    startTransition(async () => {
      const result = await addComment(prospectId, body)
      if (result.ok) setBody('')
      else setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
        }}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder="Ajouter un commentaire…"
        aria-label="Nouveau commentaire"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">Ctrl + Entrée pour publier</span>
        <Button size="sm" disabled={pending || !body.trim()} onClick={submit}>
          {pending ? 'Publication…' : 'Publier'}
        </Button>
      </div>
    </div>
  )
}

/* ---------- Institution et contacts ---------- */

function InstitutionCard({ prospect, showContacts }: { prospect: Prospect; showContacts: boolean }) {
  const links = [
    prospect.platformUrl && { href: prospect.platformUrl, label: 'Accéder à la plateforme', icon: MonitorSmartphone, primary: true },
    prospect.website && { href: prospect.website, label: prospect.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), icon: Globe, primary: false },
  ].filter(Boolean) as { href: string; label: string; icon: React.ElementType; primary: boolean }[]

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2 text-sm text-slate-600">
          <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
          <span className="whitespace-pre-line">{prospect.address || <span className="text-slate-400">Adresse non renseignée</span>}</span>
        </div>
        {links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {links.map(({ href, label, icon: Icon, primary }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: primary ? 'default' : 'outline', size: 'sm' }), 'max-w-64 gap-1.5')}
              >
                <Icon data-icon="inline-start" /> <span className="truncate">{label}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {showContacts && (prospect.contacts.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun contact enregistré.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {prospect.contacts.map((c, i) => (
            <li key={i} className="flex gap-3 rounded-lg bg-card p-3 ring-1 ring-slate-200/70">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">{initials(c.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {c.name}
                  {i === 0 && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">principal</span>}
                </p>
                {c.title && <p className="truncate text-xs text-muted-foreground">{c.title}</p>}
                <div className="mt-1.5 flex flex-col gap-1 text-xs">
                  {(['phone1', 'phone2'] as const).map((key) =>
                    c[key] ? (
                      <span key={key} className="flex items-center gap-1.5">
                        <a href={`tel:${c[key].replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 text-slate-700 hover:text-primary">
                          <Phone className="size-3 text-slate-400" /> {c[key]}
                        </a>
                        {c.whatsapp === key && whatsappLink(c[key]) && (
                          <a href={whatsappLink(c[key])!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 hover:bg-emerald-100" title="Écrire sur WhatsApp">
                            <MessageCircle className="size-3" /> WhatsApp
                          </a>
                        )}
                      </span>
                    ) : null,
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 truncate text-slate-700 hover:text-primary">
                      <Mail className="size-3 text-slate-400" /> {c.email}
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ))}
    </section>
  )
}

/* ---------- Fiche ---------- */

export function ProspectDetailDialog({ open, onOpenChange, prospect, currentUser }: { open: boolean; onOpenChange: (open: boolean) => void; prospect?: Prospect; currentUser: User }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        {prospect && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <DialogTitle>{prospect.institution}</DialogTitle>
                <a href={`/api/reports/prospects/${prospect.id}`} download className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}>
                  <FileDown data-icon="inline-start" /> Rapport PDF
                </a>
              </div>
              <DialogDescription>{[prospect.offer, prospect.owner && `Responsable : ${prospect.owner}`].filter(Boolean).join(' · ') || 'Suivi du prospect'}</DialogDescription>
            </DialogHeader>

            <InstitutionCard prospect={prospect} showContacts={canSeeContacts(currentUser.role)} />

            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <section className="flex flex-col gap-4">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Avancement</h3>
                  <ProgressBar prospect={prospect} />
                  {prospect.status === 'Perdu' && (
                    <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      <CircleX className="size-3.5" /> Prospect perdu
                    </p>
                  )}
                </div>
                <Pipeline prospect={prospect} />
                {prospect.next && (
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Prochaine action</p>
                    <p className="mt-0.5 text-sm text-slate-700">{prospect.next}</p>
                  </div>
                )}
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Historique des statuts</h3>
                  <ul className="flex flex-col gap-1.5 text-xs">
                    {[...prospect.history].reverse().map((h) => (
                      <li key={h.id} className="flex gap-2 text-slate-600">
                        <span className="shrink-0 text-muted-foreground tabular-nums">{formatDay(h.changedAt)}</span>
                        <span>
                          <span className="font-medium text-slate-700">{h.status}</span>
                          {h.changedBy && <span className="text-muted-foreground"> · {h.changedBy}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="flex min-w-0 flex-col gap-4 md:border-l md:border-slate-100 md:pl-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="size-4 text-slate-400" /> Commentaires
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{prospect.comments.length}</span>
                </h3>
                {prospect.comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun commentaire pour le moment.</p>
                ) : (
                  <ul className="flex max-h-[45vh] flex-col gap-4 overflow-y-auto pr-1">
                    {prospect.comments.map((comment) => (
                      <CommentItem key={comment.id} comment={comment} currentUser={currentUser} />
                    ))}
                  </ul>
                )}
                <CommentForm prospectId={prospect.id} />
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
