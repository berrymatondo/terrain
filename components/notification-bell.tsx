'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Bell, CheckCheck, CircleCheck, FilePlus2, FilePen, Trash2 } from 'lucide-react'
import { fetchNotifications, readNotifications } from '@/app/actions'
import type { Notification } from '@/lib/types'

const POLL_MS = 30_000

const kindStyles: Record<Notification['kind'], { icon: React.ElementType; tone: string }> = {
  created: { icon: FilePlus2, tone: 'bg-blue-50 text-blue-600' },
  updated: { icon: FilePen, tone: 'bg-amber-50 text-amber-600' },
  deleted: { icon: Trash2, tone: 'bg-rose-50 text-rose-600' },
}

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.round(hours / 24)
  return days < 7 ? `il y a ${days} j` : new Date(iso).toLocaleDateString('fr-FR')
}

export function NotificationBell({
  initial,
  onOpenProspect,
  onOpenActions,
}: {
  initial: { items: Notification[]; unread: number }
  /** Ouvre la fiche du prospect ; retourne false s'il n'existe plus (ou n'est plus accessible). */
  onOpenProspect: (prospectId: string) => boolean
  onOpenActions: () => void
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(initial)
  const [, startTransition] = useTransition()

  const refresh = useCallback(() => {
    startTransition(async () => setData(await fetchNotifications()))
  }, [])

  // Nouvelles notifications : vérification régulière tant que l'onglet est visible.
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === 'visible' && refresh(), POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  function markAllRead() {
    setData((d) => ({ unread: 0, items: d.items.map((n) => ({ ...n, read: true })) }))
    startTransition(() => readNotifications())
  }

  function openNotification(n: Notification) {
    if (!n.read) {
      setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) }))
      startTransition(() => readNotifications([n.id]))
    }
    if (n.kind === 'deleted') return
    setOpen(false)
    if (n.prospectId && onOpenProspect(n.prospectId)) return
    if (n.entity === 'action') onOpenActions()
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) refresh()
      }}
    >
      <Popover.Trigger
        className="relative rounded-full p-2 text-slate-500 outline-none hover:bg-slate-100 focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={data.unread ? `Notifications (${data.unread} non lue${data.unread > 1 ? 's' : ''})` : 'Notifications'}
      >
        <Bell className="size-4" />
        {data.unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl outline-none transition-[opacity,transform] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Notifications</p>
                <p className="text-xs text-muted-foreground">{data.unread ? `${data.unread} non lue${data.unread > 1 ? 's' : ''}` : 'Tout est lu'}</p>
              </div>
              {data.unread > 0 && (
                <button onClick={markAllRead} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5">
                  <CheckCheck className="size-3.5" /> Tout marquer comme lu
                </button>
              )}
            </div>

            {data.items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Bell className="size-5" />
                </div>
                <p className="text-sm font-medium">Aucune notification</p>
                <p className="text-xs text-muted-foreground">Vous serez prévenu quand un prospect ou une action qui vous concerne change.</p>
              </div>
            ) : (
              <ul className="max-h-[min(28rem,70vh)] divide-y divide-slate-100 overflow-y-auto">
                {data.items.map((n) => {
                  const { icon: Icon, tone } = n.kind === 'updated' && n.title.startsWith('Action terminée') ? { icon: CircleCheck, tone: 'bg-emerald-50 text-emerald-600' } : kindStyles[n.kind]
                  return (
                    <li key={n.id}>
                      <button onClick={() => openNotification(n)} className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${n.read ? '' : 'bg-blue-50/40'}`}>
                        <div className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm leading-snug ${n.read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</p>
                          {n.body && <p className="mt-0.5 line-clamp-3 text-xs text-slate-500">{n.body}</p>}
                          <p className="mt-1 text-[11px] text-slate-400">
                            {n.actorName ?? 'Utilisateur supprimé'} · {timeAgo(n.createdAt)}
                          </p>
                        </div>
                        {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Non lue" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
