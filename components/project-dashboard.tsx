'use client'

import { useMemo, useState, useTransition } from 'react'
import { Menu } from '@base-ui/react/menu'
import { CalendarDays, Check, ChevronDown, CircleCheck, Clock3, Eye, EyeOff, ExternalLink, FileDown, FileText, Flame, KeyRound, LayoutDashboard, LogOut, MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Paperclip, Pencil, Pin, Plus, RotateCcw, Search, Settings2, Target, Trash2, UserCog, Users } from 'lucide-react'
import { logout, toggleActionDone, updateProspectPriority } from '@/app/actions'
import { ActionDialog, DeleteDialog, DocumentsDialog, PasswordDialog, ReportPreviewDialog, ProspectDialog, UserDialog, type DeleteTarget } from '@/components/crud-dialogs'
import { NotificationBell } from '@/components/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { ProgressBar, ProspectDetailDialog } from '@/components/prospect-detail-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { CLOSED_STATUSES, formatAmount, rankProspects, sortByPriority, type Priority, type PriorityTier } from '@/lib/priority'
import { PIPELINE, progressOf } from '@/lib/progress'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { canEdit, canManageUsers, canSeeContacts, MANUAL_PRIORITIES, type ManualPriority, PROSPECT_STATUSES, ROLE_LABELS, type Action, type ActionDue, type Member, type Notification, type Prospect, type ProspectStatus, type Role, type User } from '@/lib/types'

const roleStyles: Record<Role, string> = {
  admin: 'bg-violet-100 text-violet-700 border-violet-200',
  manager: 'bg-blue-100 text-blue-700 border-blue-200',
  user: 'bg-slate-100 text-slate-600 border-slate-200',
}

const statusStyles: Record<ProspectStatus, { badge: string; bar: string }> = {
  'À contacter': { badge: 'bg-slate-100 text-slate-600 border-slate-200', bar: 'bg-slate-300' },
  Contacté: { badge: 'bg-sky-100 text-sky-700 border-sky-200', bar: 'bg-sky-300' },
  'Échange engagé': { badge: 'bg-blue-100 text-blue-700 border-blue-200', bar: 'bg-primary' },
  'En étude': { badge: 'bg-slate-100 text-slate-600 border-slate-200', bar: 'bg-slate-400' },
  'En rédaction': { badge: 'bg-orange-100 text-orange-700 border-orange-200', bar: 'bg-orange-400' },
  'Proposition envoyée': { badge: 'bg-violet-100 text-violet-700 border-violet-200', bar: 'bg-violet-400' },
  'En négociation': { badge: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'bg-amber-400' },
  'En attente de la signature': { badge: 'bg-violet-100 text-violet-700 border-violet-200', bar: 'bg-violet-600' },
  Signé: { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500' },
  Perdu: { badge: 'bg-rose-100 text-rose-700 border-rose-200', bar: 'bg-rose-400' },
}

const dueTones: Record<ActionDue, string> = {
  'À planifier': 'bg-primary/10 text-primary',
  Prioritaire: 'bg-amber-100 text-amber-700',
  'Cette semaine': 'bg-violet-100 text-violet-700',
  'À relancer': 'bg-emerald-100 text-emerald-700',
  'À préparer': 'bg-rose-100 text-rose-700',
}

const PROPOSAL_STATUSES: ProspectStatus[] = ['Proposition envoyée', 'En négociation', 'En attente de la signature', 'Signé']
const tierStyles: Record<PriorityTier, string> = {
  Haute: 'border-rose-200 bg-rose-50 text-rose-700',
  Moyenne: 'border-amber-200 bg-amber-50 text-amber-700',
  Basse: 'border-slate-200 bg-slate-50 text-slate-500',
  Clôturé: 'border-slate-200 bg-transparent text-slate-400',
}

function initials(name: string) {
  const words = name.replace(/[^\p{L}\s-]/gu, ' ').split(/[\s-]+/).filter((w) => w.length > 1)
  return (words.slice(0, 2).map((w) => w[0]).join('') || name.slice(0, 2)).toUpperCase()
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function todayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** État d'une modale d'édition : `key` change à chaque ouverture pour réinitialiser le formulaire. */
function useEditor<T>() {
  const [state, setState] = useState<{ open: boolean; item?: T; key: number }>({ open: false, key: 0 })
  return {
    ...state,
    openWith: (item?: T) => setState((s) => ({ open: true, item, key: s.key + 1 })),
    setOpen: (open: boolean) => setState((s) => ({ ...s, open })),
  }
}

const NO_OWNER = '__none__'

type View = 'Vue d’ensemble' | 'Actions à mener' | 'Utilisateurs'

export function ProjectDashboard({
  prospects,
  actions,
  currentUser,
  users,
  assignableUsers,
  members,
  notifications,
  initialCollapsed,
}: {
  prospects: Prospect[]
  actions: Action[]
  currentUser: User
  users: User[] | null
  /** Comptes au profil « user » auxquels on peut assigner des dossiers. */
  assignableUsers: User[]
  /** Comptes sélectionnables comme responsable (admins et managers uniquement). */
  members: Member[]
  notifications: { items: Notification[]; unread: number }
  initialCollapsed: boolean
}) {
  const [activeTab, setActiveTab] = useState<View>('Vue d’ensemble')
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [showOffer, setShowOffer] = useState(false)
  const [sortMode, setSortMode] = useState<'priority' | 'recent'>('priority')
  const prospectEditor = useEditor<Prospect>()
  const actionEditor = useEditor<Action>()
  const userEditor = useEditor<User>()
  const passwordEditor = useEditor<never>()
  const deleteEditor = useEditor<DeleteTarget>()
  const documentsEditor = useEditor<string>()
  const detailEditor = useEditor<string>()
  const reportEditor = useEditor<string>()
  const userNames = useMemo(() => new Map(assignableUsers.map((u) => [u.id, u.name])), [assignableUsers])
  const editable = canEdit(currentUser.role)
  const showContacts = canSeeContacts(currentUser.role)
  const isAdmin = canManageUsers(currentUser.role)

  // Sur mobile, le menu s'ouvre en panneau par-dessus le contenu et n'est jamais réduit.
  const compact = collapsed && !mobileOpen

  /** Bouton de l'en-tête : réduit/déplie le menu sur grand écran, l'ouvre en panneau sur mobile. */
  function toggleMenu() {
    if (window.matchMedia('(min-width: 1024px)').matches) toggleSidebar()
    else setMobileOpen((open) => !open)
  }

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    // Cookie lu côté serveur pour afficher directement le bon état au rechargement.
    document.cookie = `sidebar-collapsed=${next ? 1 : 0}; path=/; max-age=31536000; samesite=lax`
  }

  const owners = useMemo(() => [...new Set(prospects.map((p) => p.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [prospects])
  const hasUnassigned = prospects.some((p) => !p.owner)
  const today = todayIso()
  const priorities = useMemo(() => rankProspects(prospects, actions, today), [prospects, actions, today])
  const topPriorities = useMemo(() => sortByPriority(prospects, priorities).filter((p) => priorities.get(p.id)?.rank).slice(0, 3), [prospects, priorities])
  const filteredProspects = useMemo(() => {
    const matching = prospects.filter(
        (item) =>
          (!statusFilter || item.status === statusFilter) &&
          (!ownerFilter || (ownerFilter === NO_OWNER ? !item.owner : item.owner === ownerFilter)) &&
          `${item.institution} ${item.contacts.map((c) => `${c.name} ${c.email}`).join(" ")} ${item.offer} ${item.owner} ${item.address}`.toLowerCase().includes(query.toLowerCase()),
    )
    // Les prospects arrivent du plus récent au plus ancien.
    return sortMode === 'priority' ? sortByPriority(matching, priorities) : matching
  }, [prospects, query, statusFilter, ownerFilter, sortMode, priorities])

  const pendingActions = actions.filter((a) => !a.done)
  const activeProspects = prospects.filter((p) => !CLOSED_STATUSES.includes(p.status))
  const engaged = prospects.filter((p) => p.status === 'Échange engagé').length
  const proposals = prospects.filter((p) => PROPOSAL_STATUSES.includes(p.status)).length
  const priority = pendingActions.filter((a) => a.due === 'Prioritaire').length
  // Parcours complet (étapes vides comprises) ; « Perdu » seulement s'il y en a.
  const stageCounts = [...PIPELINE, 'Perdu' as ProspectStatus]
    .map((status) => ({ status, count: prospects.filter((p) => p.status === status).length }))
    .filter((s) => s.status !== 'Perdu' || s.count > 0)
  const tracked = prospects.filter((p) => p.status !== 'Perdu')
  const avgProgress = tracked.length ? Math.round(tracked.reduce((sum, p) => sum + progressOf(p.status), 0) / tracked.length) : 0
  const signed = prospects.filter((p) => p.status === 'Signé').length
  const overdue = prospects.filter((p) => p.date && p.date < today && !CLOSED_STATUSES.includes(p.status))
  const showActions = activeTab === 'Actions à mener'
  const navItems: [View, React.ElementType][] = [
    ['Vue d’ensemble', LayoutDashboard],
    ...(isAdmin ? [['Utilisateurs', UserCog] as [View, React.ElementType]] : []),
  ]

  return (
    <div className="min-h-screen bg-[#f4f6fb] text-slate-900 dark:bg-background">
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />}
      <aside
        className={`keep-colors fixed inset-y-0 left-0 z-40 flex flex-col overflow-y-auto bg-[#0b1a30] py-6 text-slate-400 transition-[width,translate] duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'} ${compact ? 'w-16 px-2.5' : 'w-64 px-4'}`}
      >
        <div className={`flex items-center gap-3 ${compact ? 'justify-center' : 'px-2'}`}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 font-bold text-white shadow-lg shadow-blue-900/40">E</div>
          {!compact && (
            <div className="min-w-0">
              <p className="truncate font-semibold tracking-tight text-white">Emergence RDC</p>
              <p className="truncate text-xs text-slate-400">Pilotage commercial</p>
            </div>
          )}
        </div>
        <div className="my-7 h-px bg-white/10" />
        <nav className="flex flex-col gap-1 text-sm">
          {!compact && <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Espace de travail</p>}
          {navItems.map(([label, Icon]) => {
            // L'onglet « Actions à mener » fait partie de la vue d'ensemble.
            const active = label === 'Utilisateurs' ? activeTab === 'Utilisateurs' : activeTab !== 'Utilisateurs'
            return (
              <button
                key={label}
                onClick={() => {
                  setActiveTab(label)
                  setMobileOpen(false)
                }}
                title={compact ? label : undefined}
                aria-label={compact ? label : undefined}
                className={`relative flex items-center gap-3 rounded-xl py-2.5 text-left transition-colors ${compact ? 'justify-center px-0' : 'px-3'} ${
                  active ? 'bg-white/10 font-medium text-white shadow-inner shadow-white/5' : 'hover:bg-white/5 hover:text-white'
                }`}
              >
                {active && !compact && <span className="absolute top-2 bottom-2 -left-4 w-1 rounded-r-full bg-blue-500" />}
                <Icon className={`size-4 shrink-0 ${active ? 'text-blue-400' : ''}`} />
                {!compact && label}
              </button>
            )
          })}
        </nav>
        {!compact && (
          <div className="mt-auto rounded-2xl bg-linear-to-br from-blue-600/25 to-indigo-500/10 p-4 ring-1 ring-white/10">
            <p className="text-xs font-semibold text-white">Avancement du portefeuille</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">Moyenne des projets en cours, selon leur étape.</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-blue-400" style={{ width: `${avgProgress}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              <span className="font-semibold text-white">{avgProgress} %</span> · {signed} signé{signed > 1 ? 's' : ''}
            </p>
          </div>
        )}
        <div className={`flex flex-col gap-1 text-sm ${compact ? 'mt-auto items-center' : 'mt-4'}`}>
          <button title={compact ? 'Paramètres' : undefined} aria-label="Paramètres" className={`flex items-center gap-3 rounded-xl py-2 hover:bg-white/5 hover:text-white ${compact ? 'w-full justify-center' : 'px-3'}`}>
            <Settings2 className="size-4" /> {!compact && 'Paramètres'}
          </button>
          <button onClick={toggleSidebar} title={compact ? 'Déplier le menu' : undefined} aria-label={compact ? 'Déplier le menu' : 'Réduire le menu'} className={`hidden items-center gap-3 rounded-xl py-2 hover:bg-white/5 hover:text-white lg:flex ${compact ? 'w-full justify-center' : 'px-3'}`}>
            {compact ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />} {!compact && 'Réduire le menu'}
          </button>
        </div>
      </aside>

      <main className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/70 bg-card/80 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-slate-500" onClick={toggleMenu} aria-label={collapsed ? 'Déplier le menu' : 'Réduire le menu'} title={collapsed ? 'Déplier le menu' : 'Réduire le menu'}>
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <div>
              <p className="text-sm text-muted-foreground first-letter:uppercase" suppressHydrationWarning>
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <h1 className="text-lg font-semibold tracking-tight">Bonjour {currentUser.name.split(' ')[0]}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!editable && (
              <Badge variant="outline" className="hidden gap-1 border-slate-200 text-slate-500 sm:inline-flex">
                <Eye /> Lecture seule
              </Badge>
            )}
            <ThemeToggle />
            <NotificationBell
              initial={notifications}
              onOpenProspect={(prospectId) => {
                if (!prospects.some((p) => p.id === prospectId)) return false
                setActiveTab('Vue d’ensemble')
                detailEditor.openWith(prospectId)
                return true
              }}
              onOpenActions={() => setActiveTab('Actions à mener')}
            />
            <Menu.Root>
              <Menu.Trigger className="flex items-center gap-2 rounded-full p-0.5 outline-none hover:bg-slate-100 focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Menu du compte">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-amber-100 text-xs font-semibold text-amber-700">{initials(currentUser.name)}</AvatarFallback>
                </Avatar>
                <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner sideOffset={8} align="end" className="z-50">
                  <Menu.Popup className="min-w-60 rounded-xl border border-slate-200 bg-card p-1.5 text-sm shadow-lg outline-none transition-[opacity,transform] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                    <div className="px-2.5 py-2">
                      <p className="font-medium">{currentUser.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{currentUser.email}</p>
                      <Badge variant="outline" className={`mt-2 ${roleStyles[currentUser.role]}`}>
                        {ROLE_LABELS[currentUser.role]}
                      </Badge>
                    </div>
                    <Separator className="my-1" />
                    <Menu.Item onClick={() => passwordEditor.openWith()} className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-highlighted:bg-slate-100">
                      <KeyRound className="size-4 text-slate-500" /> Changer mon mot de passe
                    </Menu.Item>
                    <Menu.Item onClick={() => logout()} className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-destructive outline-none data-highlighted:bg-destructive/10">
                      <LogOut className="size-4" /> Se déconnecter
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8">
          {activeTab === 'Utilisateurs' && users ? (
            <UsersPanel
              users={users}
              prospects={prospects}
              currentUser={currentUser}
              onCreate={() => userEditor.openWith()}
              onEdit={(user) => userEditor.openWith(user)}
              onDelete={(user) => deleteEditor.openWith({ kind: 'user', id: user.id, label: user.name })}
            />
          ) : (
          <>
          {/* Bannière */}
          <section className="keep-colors relative mb-6 overflow-hidden rounded-3xl bg-linear-to-br from-[#0b1a30] via-[#132f57] to-blue-700 p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
            <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-blue-400/25 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-indigo-500/20 blur-3xl" aria-hidden />
            <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium tracking-wide text-blue-100 ring-1 ring-white/15">
                  <LayoutDashboard className="size-3" /> VUE D’ENSEMBLE
                </span>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Tableau de pilotage</h2>
                <p className="mt-2 max-w-xl text-sm text-blue-100/80">Suivez l’avancement de vos opportunités et les prochaines échéances.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href="/api/reports/global" download className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-medium text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20" title="Télécharger le rapport PDF de tous les projets">
                  <FileDown className="size-4" /> Rapport global
                </a>
                {editable && (
                  <>
                    <button onClick={() => actionEditor.openWith()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-medium text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20">
                      <Plus className="size-4" /> Nouvelle action
                    </button>
                    <button onClick={() => prospectEditor.openWith()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-900 shadow-lg shadow-blue-950/20 transition hover:bg-blue-50">
                      <Plus className="size-4" /> Nouveau prospect
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="relative mt-7 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
              <HeroMetric label="Avancement moyen" value={`${avgProgress} %`} hint="des projets suivis">
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-linear-to-r from-sky-300 to-blue-300" style={{ width: `${avgProgress}%` }} />
                </div>
              </HeroMetric>
              <HeroMetric label="Projets signés" value={String(signed)} hint={`sur ${prospects.length} au portefeuille`} />
              <HeroMetric label="Relances en retard" value={String(overdue.length)} hint={overdue.length ? overdue.map((p) => p.institution).slice(0, 3).join(', ') + (overdue.length > 3 ? '…' : '') : 'Tout est à jour'} alert={overdue.length > 0} />
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Prospects actifs" value={activeProspects.length} change={`${prospects.length} au total`} icon={Target} accent="blue" />
            <StatCard label="Échanges engagés" value={engaged} change={`${prospects.length ? Math.round((engaged / prospects.length) * 100) : 0} % du portefeuille`} icon={Users} accent="violet" />
            <StatCard label="Actions à venir" value={pendingActions.length} change={`${priority} prioritaire${priority > 1 ? 's' : ''}`} icon={Clock3} accent="amber" />
            <StatCard label="Propositions envoyées" value={proposals} change="Objectif : 2" icon={FileText} accent="emerald" />
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            <Card className="rounded-2xl shadow-sm ring-slate-200/70">
              <CardHeader className="pb-1">
                <CardTitle className="text-base font-semibold">Pipeline commercial</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Nombre de prospects à chaque étape du parcours ({prospects.length} au total)</p>
              </CardHeader>
              <CardContent>
                <PipelineChart data={stageCounts} total={prospects.length} />
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm ring-slate-200/70">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold">Prochaines échéances</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">Actions à mener en priorité</p>
                </div>
                {pendingActions.length > 4 && (
                  <button onClick={() => setActiveTab('Actions à mener')} className="text-xs font-medium text-primary hover:underline">
                    Tout voir ({pendingActions.length})
                  </button>
                )}
              </CardHeader>
              <CardContent>
                {pendingActions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Aucune action en attente.</p>}
                <ol className="relative flex flex-col">
                  {[...pendingActions]
                    .sort((a, b) => Number(b.due === 'Prioritaire') - Number(a.due === 'Prioritaire'))
                    .slice(0, 4)
                    .map((action, index, list) => (
                      <li key={action.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < list.length - 1 && <span className="absolute top-9 bottom-1 left-4 w-px bg-slate-200" aria-hidden />}
                        <div className={`relative flex size-8 shrink-0 items-center justify-center rounded-xl ${dueTones[action.due]}`}>
                          <CalendarDays className="size-4" />
                        </div>
                        <button disabled={!editable} onClick={() => actionEditor.openWith(action)} className="-mx-2 -my-1 min-w-0 flex-1 rounded-lg px-2 py-1 text-left transition enabled:hover:bg-slate-50">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm leading-snug font-medium">{action.title}</p>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${dueTones[action.due]}`}>{action.due}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {action.owner || 'Non assigné'}
                            {action.prospectId && ` · ${prospects.find((p) => p.id === action.prospectId)?.institution ?? ''}`}
                          </p>
                        </button>
                      </li>
                    ))}
                </ol>
              </CardContent>
            </Card>
          </div>

          <Tabs value={showActions ? 'Actions' : 'Prospects'} onValueChange={(v) => setActiveTab(v === 'Actions' ? 'Actions à mener' : 'Vue d’ensemble')} className="mt-8">
            <TabsList className="h-10 rounded-xl bg-slate-200/60 p-1">
              <TabsTrigger value="Prospects" className="rounded-lg px-4 data-active:bg-card data-active:text-slate-900 data-active:shadow-sm">
                Portefeuille prospects
              </TabsTrigger>
              <TabsTrigger value="Actions" className="rounded-lg px-4 data-active:bg-card data-active:text-slate-900 data-active:shadow-sm">
                Actions à mener <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">{pendingActions.length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {showActions ? (
            <ActionsList
              actions={actions}
              prospects={prospects}
              editable={editable}
              onCreate={() => actionEditor.openWith()}
              onEdit={(action) => actionEditor.openWith(action)}
              onDelete={(action) => deleteEditor.openWith({ kind: 'action', id: action.id, label: action.title })}
            />
          ) : (
            <>
            {topPriorities.length > 0 && <TopPriorities prospects={topPriorities} priorities={priorities} onOpen={(id) => detailEditor.openWith(id)} />}
            <Card className="mt-4 overflow-hidden rounded-2xl shadow-sm ring-slate-200/70">
              <CardHeader className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Suivi de la prospection</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sortMode === 'priority' ? 'Classées par priorité : urgence des actions, potentiel financier et engagement' : 'Les opportunités commerciales en cours'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-auto gap-1.5 py-2" onClick={() => setShowOffer((v) => !v)} aria-pressed={showOffer} title={showOffer ? 'Masquer la colonne « Offre proposée »' : 'Afficher la colonne « Offre proposée »'}>
                    {showOffer ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />} Offre
                  </Button>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <Search className="size-4 text-slate-400" />
                    <input aria-label="Rechercher un prospect" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher..." className="w-32 bg-transparent text-sm outline-none placeholder:text-slate-400 sm:w-44" />
                  </div>
                  <NativeSelect aria-label="Classement" value={sortMode} onChange={(e) => setSortMode(e.target.value as 'priority' | 'recent')} className="h-auto w-auto py-2">
                    <option value="priority">Tri : priorité</option>
                    <option value="recent">Tri : plus récents</option>
                  </NativeSelect>
                  <NativeSelect aria-label="Filtrer par responsable" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="h-auto w-auto py-2">
                    <option value="">Tous les responsables</option>
                    {owners.map((owner) => (
                      <option key={owner} value={owner}>
                        {owner}
                      </option>
                    ))}
                    {hasUnassigned && <option value={NO_OWNER}>Sans responsable</option>}
                  </NativeSelect>
                  <NativeSelect aria-label="Filtrer par statut" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-auto w-auto py-2">
                    <option value="">Tous les statuts</option>
                    {PROSPECT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                        <TableHead className="pl-6">Priorité</TableHead>
                        <TableHead>Institution / prospect</TableHead>
                        {showContacts && <TableHead>Contact</TableHead>}
                        {showOffer && <TableHead>Offre proposée</TableHead>}
                        <TableHead>Plateforme</TableHead>
                        <TableHead>Suivi</TableHead>
                        <TableHead>Statut / avancement</TableHead>
                        <TableHead>Prochaine action</TableHead>
                        <TableHead>Relance</TableHead>
                        <TableHead>Responsable</TableHead>
                        <TableHead className="pr-6 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProspects.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9 + Number(showOffer) + Number(showContacts)} className="py-10 text-center text-sm text-muted-foreground">
                            {prospects.length > 0 ? 'Aucun prospect ne correspond à la recherche.' : editable ? 'Aucun prospect. Ajoutez-en un avec « Nouveau prospect ».' : 'Aucun dossier ne vous a encore été assigné.'}
                          </TableCell>
                        </TableRow>
                      )}
                      {filteredProspects.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="pl-6">
                            <PriorityCell prospectId={item.id} priority={priorities.get(item.id)} amount={item.amount} editable={editable} />
                          </TableCell>
                          <TableCell>
                            <button onClick={() => detailEditor.openWith(item.id)} className="text-left font-medium hover:text-primary hover:underline" title="Voir l’avancement et les commentaires">
                              {item.institution}
                            </button>
                            {editable && item.assigneeIds.length > 0 && (
                              <p className="mt-0.5 flex max-w-48 items-center gap-1 text-xs text-muted-foreground" title="Utilisateurs ayant accès">
                                <Users className="size-3 shrink-0" />
                                <span className="truncate">{item.assigneeIds.map((id) => userNames.get(id)).filter(Boolean).join(', ')}</span>
                              </p>
                            )}
                          </TableCell>
                          {showContacts && (
                            <TableCell className="text-sm text-slate-600">
                              {item.contacts.length === 0 ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <button onClick={() => detailEditor.openWith(item.id)} className="text-left hover:text-primary" title={item.contacts.map((c) => c.name).join(', ')}>
                                  {item.contacts[0].name}
                                  {item.contacts.length > 1 && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">+{item.contacts.length - 1}</span>}
                                </button>
                              )}
                            </TableCell>
                          )}
                          {showOffer && <TableCell className="max-w-44 min-w-32 text-sm whitespace-normal text-slate-600">{item.offer}</TableCell>}
                          <TableCell>
                            {item.platformUrl ? (
                              <a href={item.platformUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15" title={item.platformUrl}>
                                <ExternalLink className="size-3.5" /> Ouvrir
                              </a>
                            ) : (
                              <span className="text-sm text-slate-300">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1.5">
                              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => detailEditor.openWith(item.id)} aria-label={`Commentaires et avancement de ${item.institution}`} title="Avancement et commentaires">
                                <MessageSquare data-icon="inline-start" /> {item.comments.length}
                              </Button>
                              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => documentsEditor.openWith(item.id)} aria-label={`Documents de ${item.institution}`} title="Documents">
                                <Paperclip data-icon="inline-start" /> {item.documents.length}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="min-w-40">
                            <Badge variant="outline" className={statusStyles[item.status]?.badge}>
                              {item.status}
                            </Badge>
                            <ProgressBar prospect={item} className="mt-1.5" />
                          </TableCell>
                          <TableCell className="max-w-64 min-w-44 text-sm whitespace-normal text-slate-600">{item.next}</TableCell>
                          <TableCell className={`text-sm whitespace-nowrap ${item.date && item.date < today && !CLOSED_STATUSES.includes(item.status) ? 'font-medium text-rose-600' : 'text-slate-500'}`}>{formatDate(item.date)}</TableCell>
                          <TableCell>
                            {item.owner && (
                              <div className="flex items-center gap-2 text-sm">
                                <Avatar className="size-7">
                                  <AvatarFallback className="bg-slate-100 text-[10px] font-medium">{initials(item.contact || item.institution)}</AvatarFallback>
                                </Avatar>
                                {item.owner}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="pr-6">
                              <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => reportEditor.openWith(item.id)} aria-label={`Aperçu du rapport de ${item.institution}`} title="Aperçu du rapport">
                                <Eye />
                              </Button>
                              <Menu.Root>
                                <Menu.Trigger className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label={`Actions pour ${item.institution}`}>
                                  <MoreHorizontal />
                                </Menu.Trigger>
                                <Menu.Portal>
                                  <Menu.Positioner sideOffset={4} align="end" className="z-50">
                                    <Menu.Popup className="min-w-48 rounded-xl border border-slate-200 bg-card p-1.5 text-sm shadow-lg outline-none transition-[opacity,transform] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                                      <Menu.LinkItem href={`/api/reports/prospects/${item.id}`} download className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-highlighted:bg-slate-100">
                                        <FileDown className="size-4 text-slate-500" /> Télécharger le rapport
                                      </Menu.LinkItem>
                                      {editable && (
                                        <>
                                          <Menu.Item onClick={() => prospectEditor.openWith(item)} className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-highlighted:bg-slate-100">
                                            <Pencil className="size-4 text-slate-500" /> Modifier
                                          </Menu.Item>
                                          <Menu.Item onClick={() => deleteEditor.openWith({ kind: 'prospect', id: item.id, label: item.institution })} className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-destructive outline-none data-highlighted:bg-destructive/10">
                                            <Trash2 className="size-4" /> Supprimer
                                          </Menu.Item>
                                        </>
                                      )}
                                    </Menu.Popup>
                                  </Menu.Positioner>
                                </Menu.Portal>
                              </Menu.Root>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            </>
          )}
          </>
          )}
        </div>
      </main>

      {editable && (
        <>
          <ProspectDialog open={prospectEditor.open} onOpenChange={prospectEditor.setOpen} formKey={prospectEditor.key} prospect={prospectEditor.item} assignableUsers={assignableUsers} members={members} />
          <ActionDialog open={actionEditor.open} onOpenChange={actionEditor.setOpen} formKey={actionEditor.key} action={actionEditor.item} prospects={prospects} members={members} />
          <DeleteDialog open={deleteEditor.open} onOpenChange={deleteEditor.setOpen} target={deleteEditor.item} />
        </>
      )}
      {isAdmin && <UserDialog open={userEditor.open} onOpenChange={userEditor.setOpen} formKey={userEditor.key} user={userEditor.item} isSelf={userEditor.item?.id === currentUser.id} />}
      <PasswordDialog open={passwordEditor.open} onOpenChange={passwordEditor.setOpen} formKey={passwordEditor.key} />
      {/* Prospect relu depuis les props pour refléter les documents ajoutés ou supprimés. */}
      <DocumentsDialog open={documentsEditor.open} onOpenChange={documentsEditor.setOpen} prospect={prospects.find((p) => p.id === documentsEditor.item)} editable={editable} />
      <ReportPreviewDialog open={reportEditor.open} onOpenChange={reportEditor.setOpen} prospect={prospects.find((p) => p.id === reportEditor.item)} />
      <ProspectDetailDialog open={detailEditor.open} onOpenChange={detailEditor.setOpen} prospect={prospects.find((p) => p.id === detailEditor.item)} currentUser={currentUser} />
    </div>
  )
}

const accents = {
  blue: { chip: 'bg-blue-50 text-blue-600 ring-blue-100', glow: 'from-blue-500/10' },
  violet: { chip: 'bg-violet-50 text-violet-600 ring-violet-100', glow: 'from-violet-500/10' },
  amber: { chip: 'bg-amber-50 text-amber-600 ring-amber-100', glow: 'from-amber-500/10' },
  emerald: { chip: 'bg-emerald-50 text-emerald-600 ring-emerald-100', glow: 'from-emerald-500/10' },
}

function StatCard({ label, value, change, icon: Icon, accent = 'blue' }: { label: string; value: number; change: string; icon: React.ElementType; accent?: keyof typeof accents }) {
  const a = accents[accent]
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-card p-5 shadow-sm ring-1 ring-slate-200/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className={`pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-radial ${a.glow} to-transparent opacity-0 transition-opacity group-hover:opacity-100`} aria-hidden />
      <div className="relative flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={`flex size-10 items-center justify-center rounded-xl ring-1 ${a.chip}`}>
          <Icon className="size-5" />
        </div>
      </div>
      <p className="relative mt-3 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      <p className="relative mt-1 text-xs text-slate-500">{change}</p>
    </div>
  )
}

function HeroMetric({ label, value, hint, alert, children }: { label: string; value: string; hint: string; alert?: boolean; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-blue-100/70">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? 'text-amber-300' : 'text-white'}`}>{value}</p>
      {children}
      <p className="mt-1.5 truncate text-xs text-blue-100/60" title={hint}>
        {hint}
      </p>
    </div>
  )
}

/**
 * Parcours commercial en barres horizontales : une seule couleur (la position et
 * l'étiquette identifient déjà l'étape), étapes vides visibles, info-bulle au survol.
 */
function PipelineChart({ data, total }: { data: { status: ProspectStatus; count: number }[]; total: number }) {
  if (total === 0) return <p className="py-16 text-center text-sm text-muted-foreground">Aucun prospect à afficher.</p>
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <ul className="flex flex-col gap-1 pt-2" aria-label="Prospects par étape">
      {data.map(({ status, count }, index) => {
        const share = Math.round((count / total) * 100)
        const lost = status === 'Perdu'
        return (
          <li key={status} className="group relative grid grid-cols-[1.5rem_minmax(0,9.5rem)_1fr_2rem] items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50">
            <span className="text-[11px] font-medium text-slate-400 tabular-nums">{lost ? '×' : index + 1}</span>
            <span className={`truncate text-sm ${count ? 'text-slate-700' : 'text-slate-400'}`}>{status}</span>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              {count > 0 && <div className={`h-full rounded-full transition-[width] duration-500 ${lost ? 'bg-slate-400' : 'bg-primary'}`} style={{ width: `${(count / max) * 100}%` }} />}
            </div>
            <span className={`text-right text-sm font-semibold tabular-nums ${count ? 'text-slate-900' : 'text-slate-300'}`}>{count}</span>
            {/* Info-bulle */}
            <span role="tooltip" className="pointer-events-none absolute -top-8 right-10 z-10 rounded-lg bg-foreground px-2.5 py-1 text-xs whitespace-nowrap text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {status} : {count} prospect{count > 1 ? 's' : ''} · {share} %
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Score, niveau et potentiel financier ; le détail du calcul s'affiche au survol.
 * Un éditeur peut cliquer sur le niveau pour le fixer à la main ou revenir à l'automatique.
 */
function PriorityCell({ prospectId, priority, amount, editable }: { prospectId: string; priority?: Priority; amount: number | null; editable: boolean }) {
  const [pending, startTransition] = useTransition()
  if (!priority) return null
  const detail = priority.rank
    ? `Score ${priority.score}/100 — Actions ${priority.action} · Potentiel ${priority.financial} · Engagement ${priority.engagement}\n${priority.reasons.join(' · ')}`
    : 'Dossier clôturé, non classé'

  function choose(value: ManualPriority | null) {
    startTransition(async () => {
      const result = await updateProspectPriority(prospectId, value)
      if (!result.ok) alert(result.error)
    })
  }

  const badge = (
    <>
      {priority.manual && <Pin className="size-3" aria-label="Fixée à la main" />}
      {priority.tier}
      {priority.rank && <span className="ml-1 tabular-nums opacity-70">{priority.score}</span>}
    </>
  )
  const itemClass = 'flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-highlighted:bg-slate-100'

  return (
    <div className="flex min-w-28 flex-col gap-1" title={detail}>
      <div className="flex items-center gap-1.5">
        {priority.rank && <span className="w-6 text-xs font-semibold text-slate-400 tabular-nums">#{priority.rank}</span>}
        {editable && priority.rank ? (
          <Menu.Root>
            <Menu.Trigger disabled={pending} className={cn(badgeVariants({ variant: 'outline' }), tierStyles[priority.tier], 'cursor-pointer gap-1 hover:opacity-80 disabled:opacity-50')} aria-label="Modifier la priorité">
              {badge}
              <ChevronDown className="size-3 opacity-60" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={4} align="start" className="z-50">
                <Menu.Popup className="min-w-52 rounded-xl border border-slate-200 bg-card p-1.5 text-sm shadow-lg outline-none transition-[opacity,transform] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                  <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">Priorité</p>
                  <Menu.Item onClick={() => choose(null)} className={itemClass}>
                    <RotateCcw className="size-4 text-slate-500" /> Automatique ({priority.autoTier})
                    {!priority.manual && <Check className="ml-auto size-4 text-primary" />}
                  </Menu.Item>
                  {MANUAL_PRIORITIES.map((tier) => (
                    <Menu.Item key={tier} onClick={() => choose(tier)} className={itemClass}>
                      <span className={cn('size-2.5 rounded-full border', tierStyles[tier])} /> {tier}
                      {priority.manual && priority.tier === tier && <Check className="ml-auto size-4 text-primary" />}
                    </Menu.Item>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ) : (
          <Badge variant="outline" className={cn(tierStyles[priority.tier], 'gap-1')}>
            {badge}
          </Badge>
        )}
      </div>
      <span className={`text-xs tabular-nums ${priority.rank ? 'pl-7.5' : ''} ${amount == null ? 'text-slate-300' : 'text-slate-500'}`}>{formatAmount(amount)}</span>
    </div>
  )
}

/** Les trois dossiers en cours les plus prioritaires, mis en avant au-dessus du tableau. */
function TopPriorities({ prospects, priorities, onOpen }: { prospects: Prospect[]; priorities: Map<string, Priority>; onOpen: (id: string) => void }) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Flame className="size-4 text-rose-500" />
        <h3 className="text-sm font-semibold">À prioriser</h3>
        <span className="text-xs text-muted-foreground">Classement automatique selon l’urgence des actions, le potentiel financier et l’engagement</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {prospects.map((p) => {
          const priority = priorities.get(p.id)!
          return (
            <button key={p.id} onClick={() => onOpen(p.id)} className="group flex flex-col gap-3 rounded-2xl bg-card p-4 text-left shadow-sm ring-1 ring-slate-200/70 transition hover:ring-primary/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-400">#{priority.rank}</p>
                  <p className="truncate font-semibold group-hover:text-primary">{p.institution}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatAmount(p.amount)} · {p.status}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-2xl leading-none font-semibold tabular-nums">{priority.score}</span>
                  <Badge variant="outline" className={cn(tierStyles[priority.tier], 'gap-1')} title={priority.manual ? `Fixée à la main (auto : ${priority.autoTier})` : undefined}>
                    {priority.manual && <Pin className="size-3" />}
                    {priority.tier}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['Actions', priority.action],
                    ['Potentiel', priority.financial],
                    ['Engagement', priority.engagement],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{label}</span>
                      <span className="tabular-nums">{value}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="line-clamp-2 text-xs text-slate-500">{priority.reasons.join(' · ')}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ActionsList({
  actions,
  prospects,
  editable,
  onCreate,
  onEdit,
  onDelete,
}: {
  actions: Action[]
  prospects: Prospect[]
  editable: boolean
  onCreate: () => void
  onEdit: (action: Action) => void
  onDelete: (action: Action) => void
}) {
  const [pendingId, setPendingId] = useState<string>()
  const [, startTransition] = useTransition()
  const sorted = [...actions].sort((a, b) => Number(a.done) - Number(b.done))
  const institutionOf = (id: string | null) => prospects.find((p) => p.id === id)?.institution

  function toggle(id: string) {
    setPendingId(id)
    startTransition(async () => {
      await toggleActionDone(id)
      setPendingId(undefined)
    })
  }

  return (
    <Card className="mt-4 rounded-2xl shadow-sm ring-slate-200/70">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Actions à mener</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Prochaines actions à mener sur vos dossiers</p>
        </div>
        {editable && (
          <Button variant="outline" size="sm" onClick={onCreate}>
            <Plus data-icon="inline-start" /> Ajouter
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        {sorted.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Aucune action pour le moment.</p>}
        {sorted.map((action, index) => {
          const institution = institutionOf(action.prospectId)
          return (
            <div key={action.id} className={`flex items-start gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4 ${action.done ? 'opacity-60' : ''}`}>
              <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${action.done ? 'bg-emerald-500' : 'bg-primary'}`}>{action.done ? <CircleCheck className="size-4" /> : index + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col justify-between gap-2 sm:flex-row">
                  <p className={`font-medium ${action.done ? 'line-through' : ''}`}>{action.title}</p>
                  <div className="flex gap-1.5">
                    {institution && (
                      <Badge variant="outline" className="w-fit text-xs">
                        {institution}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="w-fit text-xs">
                      {action.done ? 'Terminée' : action.due}
                    </Badge>
                  </div>
                </div>
                {action.detail && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{action.detail}</p>}
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Responsable : <span className="text-slate-700">{action.owner || 'Non assigné'}</span>
                </p>
              </div>
              {editable && (
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" disabled={pendingId === action.id} aria-label={action.done ? 'Rouvrir l’action' : 'Marquer comme terminée'} title={action.done ? 'Rouvrir' : 'Marquer comme terminée'} onClick={() => toggle(action.id)}>
                  {action.done ? <RotateCcw /> : <CircleCheck />}
                </Button>
                <Button variant="ghost" size="icon" aria-label="Modifier l’action" onClick={() => onEdit(action)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" className="text-slate-400 hover:text-destructive" aria-label="Supprimer l’action" onClick={() => onDelete(action)}>
                  <Trash2 />
                </Button>
              </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function UsersPanel({
  users,
  prospects,
  currentUser,
  onCreate,
  onEdit,
  onDelete,
}: {
  users: User[]
  prospects: Prospect[]
  currentUser: User
  onCreate: () => void
  onEdit: (user: User) => void
  onDelete: (user: User) => void
}) {
  return (
    <>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-sm font-medium text-primary">ADMINISTRATION</p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Utilisateurs</h2>
          <p className="mt-1 text-sm text-muted-foreground">Gérez les accès et les profils de l’équipe.</p>
        </div>
        <Button className="gap-2 self-start" onClick={onCreate}>
          <Plus data-icon="inline-start" /> Nouvel utilisateur
        </Button>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Administrateurs" value={users.filter((u) => u.role === 'admin').length} change="Accès complet + utilisateurs" icon={UserCog} />
        <StatCard label="Managers" value={users.filter((u) => u.role === 'manager').length} change="Accès complet" icon={Target} />
        <StatCard label="Utilisateurs" value={users.filter((u) => u.role === 'user').length} change="Lecture seule, dossiers assignés" icon={Users} />
      </div>

      <Card className="overflow-hidden rounded-2xl shadow-sm ring-slate-200/70">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead className="pl-6">Nom</TableHead>
                  <TableHead>Adresse e-mail</TableHead>
                  <TableHead>Profil</TableHead>
                  <TableHead>Dossiers accessibles</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-7">
                          <AvatarFallback className="bg-slate-100 text-[10px] font-medium">{initials(user.name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{user.name}</span>
                        {user.id === currentUser.id && <span className="text-xs text-muted-foreground">(vous)</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleStyles[user.role]}>
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-72 text-sm text-slate-600">
                      {user.role === 'user' ? (
                        <UserDossiers names={prospects.filter((p) => p.assigneeIds.includes(user.id)).map((p) => p.institution)} />
                      ) : (
                        <span className="text-muted-foreground">Tous</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label={`Modifier ${user.name}`} onClick={() => onEdit(user)}>
                          <Pencil />
                        </Button>
                        {user.id !== currentUser.id && (
                          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-destructive" aria-label={`Supprimer ${user.name}`} onClick={() => onDelete(user)}>
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function UserDossiers({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-amber-600">Aucun — à assigner depuis un prospect</span>
  return (
    <span className="block truncate" title={names.join(', ')}>
      {names.join(', ')}
    </span>
  )
}
