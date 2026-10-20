import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer'
import { PIPELINE, progressOf } from '@/lib/progress'
import { formatAmount } from '@/lib/priority'
import { canSeeContacts, ROLE_LABELS, type Action, type Prospect, type ProspectStatus, type User } from '@/lib/types'

// Pas de coupure de mots avec tiret (« Proposition en-voyée »).
Font.registerHyphenationCallback((word) => [word])

/* ---------- Charte graphique ---------- */

const C = {
  navy: '#0F2A4A',
  navyLight: '#1E3A5F',
  blue: '#2563EB',
  blueSoft: '#DBEAFE',
  sky: '#93C5FD',
  ink: '#0F172A',
  text: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  soft: '#F1F5F9',
  bg: '#F8FAFC',
  white: '#FFFFFF',
  red: '#DC2626',
  redSoft: '#FEE2E2',
  green: '#059669',
  amber: '#D97706',
  amberSoft: '#FEF3C7',
}

const STATUS_COLORS: Record<ProspectStatus, { bg: string; fg: string; bar: string }> = {
  'À contacter': { bg: '#F1F5F9', fg: '#475569', bar: '#CBD5E1' },
  Contacté: { bg: '#E0F2FE', fg: '#0369A1', bar: '#38BDF8' },
  'Échange engagé': { bg: '#DBEAFE', fg: '#1D4ED8', bar: '#2563EB' },
  'En étude': { bg: '#E2E8F0', fg: '#334155', bar: '#64748B' },
  'En rédaction': { bg: '#FFEDD5', fg: '#C2410C', bar: '#FB923C' },
  'Proposition envoyée': { bg: '#EDE9FE', fg: '#6D28D9', bar: '#A78BFA' },
  'En négociation': { bg: '#FEF3C7', fg: '#B45309', bar: '#F59E0B' },
  'En attente de la signature': { bg: '#EDE9FE', fg: '#5B21B6', bar: '#7C3AED' },
  Signé: { bg: '#D1FAE5', fg: '#047857', bar: '#10B981' },
  Perdu: { bg: '#FFE4E6', fg: '#BE123C', bar: '#FB7185' },
}

const DUE_COLORS: Record<string, { bg: string; fg: string }> = {
  Prioritaire: { bg: C.amberSoft, fg: '#B45309' },
  'Cette semaine': { bg: '#EDE9FE', fg: '#6D28D9' },
  'À planifier': { bg: C.blueSoft, fg: '#1D4ED8' },
  'À relancer': { bg: '#D1FAE5', fg: '#047857' },
  'À préparer': { bg: '#FFE4E6', fg: '#BE123C' },
}

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 54, paddingHorizontal: 36, fontFamily: 'Helvetica', fontSize: 9, color: C.text, backgroundColor: C.white },
  // En-tête de couverture
  cover: { backgroundColor: C.navy, borderRadius: 8, padding: 22, marginBottom: 18 },
  coverTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  logo: { width: 26, height: 26, borderRadius: 6, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  logoText: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.navy },
  brand: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, color: C.white },
  brandSub: { fontSize: 8, color: C.sky, marginTop: 1 },
  coverTag: { marginLeft: 'auto', backgroundColor: C.navyLight, borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8, fontSize: 7.5, color: C.sky, letterSpacing: 0.6 },
  coverKicker: { fontSize: 8, color: C.sky, letterSpacing: 1.2, marginBottom: 4 },
  coverTitle: { fontFamily: 'Helvetica-Bold', fontSize: 21, color: C.white, marginBottom: 4 },
  coverSubtitle: { fontSize: 10, color: '#CBD5E1' },
  coverMeta: { flexDirection: 'row', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.navyLight },
  coverMetaItem: { marginRight: 26 },
  coverMetaLabel: { fontSize: 7, color: C.sky, letterSpacing: 0.6, marginBottom: 2 },
  coverMetaValue: { fontSize: 9, color: C.white, fontFamily: 'Helvetica-Bold' },
  // Indicateurs
  kpis: { flexDirection: 'row', marginBottom: 18, marginHorizontal: -4 },
  kpi: { flex: 1, marginHorizontal: 4, backgroundColor: C.bg, borderRadius: 6, padding: 10, borderLeftWidth: 3 },
  kpiLabel: { fontSize: 7, color: C.muted, letterSpacing: 0.5, marginBottom: 4 },
  kpiValue: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: C.ink },
  kpiHint: { fontSize: 7, color: C.faint, marginTop: 2 },
  // Sections
  section: { marginBottom: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionBar: { width: 3, height: 12, backgroundColor: C.blue, borderRadius: 2, marginRight: 6 },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: C.navy },
  sectionCount: { marginLeft: 6, fontSize: 8, color: C.muted },
  empty: { fontSize: 8.5, color: C.faint, fontStyle: 'italic', paddingVertical: 6 },
  // Tableaux
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 6 },
  th: { flexDirection: 'row', backgroundColor: C.navy, borderTopLeftRadius: 5, borderTopRightRadius: 5, paddingVertical: 6, paddingHorizontal: 8 },
  thText: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: C.white, letterSpacing: 0.3 },
  tr: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.line, alignItems: 'center' },
  trAlt: { backgroundColor: C.bg },
  td: { fontSize: 8.5, color: C.text, paddingRight: 6 },
  tdStrong: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.ink, paddingRight: 6 },
  // Divers
  pill: { borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6, alignSelf: 'flex-start' },
  pillText: { fontSize: 7, fontFamily: 'Helvetica-Bold' },
  track: { height: 5, backgroundColor: C.soft, borderRadius: 3, flex: 1 },
  fill: { height: 5, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 4 },
  field: { width: '50%', padding: 6 },
  fieldLabel: { fontSize: 7, color: C.muted, letterSpacing: 0.5, marginBottom: 2 },
  fieldValue: { fontSize: 9, color: C.ink },
  comment: { flexDirection: 'row', marginBottom: 8 },
  avatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.blueSoft, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  avatarText: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.blue },
  bubble: { flex: 1, backgroundColor: C.bg, borderRadius: 6, borderTopLeftRadius: 0, padding: 8, borderWidth: 1, borderColor: C.line },
  // Pied de page
  footer: { position: 'absolute', bottom: 22, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 7, fontSize: 7, color: C.faint },
  runningHead: { position: 'absolute', top: 14, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: C.faint },
})

/* ---------- Utilitaires ---------- */

const TZ = 'Africa/Kinshasa'
const formatDay = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }) : '—')
const formatDateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })
const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`)
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const isOverdue = (p: Prospect) => !!p.date && p.date < todayIso() && p.status !== 'Signé' && p.status !== 'Perdu'

function initials(name: string) {
  const words = name.replace(/[^\p{L}\s-]/gu, ' ').split(/[\s-]+/).filter((w) => w.length > 1)
  return (words.slice(0, 2).map((w) => w[0]).join('') || name.slice(0, 2)).toUpperCase()
}

type Context = { user: User; generatedAt: string; userNames: Map<string, string>; showAssignees: boolean }

/* ---------- Composants ---------- */

function StatusPill({ status }: { status: ProspectStatus }) {
  const c = STATUS_COLORS[status]
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <Text style={[s.pillText, { color: c.fg }]}>{status}</Text>
    </View>
  )
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{label}</Text>
    </View>
  )
}

function Progress({ status, width, showLabel = true }: { status: ProspectStatus; width?: number; showLabel?: boolean }) {
  const lost = status === 'Perdu'
  const value = progressOf(status)
  const color = lost ? STATUS_COLORS.Perdu.bar : value === 100 ? C.green : C.blue
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', width }}>
      <View style={s.track}>
        <View style={[s.fill, { width: `${lost ? 100 : Math.max(value, 3)}%`, backgroundColor: color }]} />
      </View>
      {showLabel && <Text style={{ width: 26, textAlign: 'right', fontSize: 7.5, color: lost ? STATUS_COLORS.Perdu.fg : C.muted, fontFamily: 'Helvetica-Bold' }}>{lost ? '—' : `${value} %`}</Text>}
    </View>
  )
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <View style={s.sectionHead} wrap={false}>
      <View style={s.sectionBar} />
      <Text style={s.sectionTitle}>{title}</Text>
      {count !== undefined && <Text style={s.sectionCount}>({count})</Text>}
    </View>
  )
}

type Column<T> = { label: string; width: string | number; render: (row: T) => React.ReactNode }

function Table<T>({ columns, rows, emptyLabel }: { columns: Column<T>[]; rows: T[]; emptyLabel: string }) {
  if (rows.length === 0) return <Text style={s.empty}>{emptyLabel}</Text>
  return (
    <View style={s.table}>
      <View style={s.th} fixed>
        {columns.map((col) => (
          <Text key={col.label} style={[s.thText, { width: col.width }]}>
            {col.label.toUpperCase()}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]} wrap={false}>
          {columns.map((col) => (
            <View key={col.label} style={{ width: col.width }}>
              {col.render(row)}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function Kpi({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent: string }) {
  return (
    <View style={[s.kpi, { borderLeftColor: accent }]}>
      <Text style={s.kpiLabel}>{label.toUpperCase()}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {hint && <Text style={s.kpiHint}>{hint}</Text>}
    </View>
  )
}

function Cover({ kicker, title, subtitle, tag, meta }: { kicker: string; title: string; subtitle?: string; tag: string; meta: [string, string][] }) {
  return (
    <View style={s.cover}>
      <View style={s.coverTop}>
        <View style={s.logo}>
          <Text style={s.logoText}>E</Text>
        </View>
        <View>
          <Text style={s.brand}>Emergence RDC</Text>
          <Text style={s.brandSub}>Pilotage commercial</Text>
        </View>
        <Text style={s.coverTag}>{tag.toUpperCase()}</Text>
      </View>
      <Text style={s.coverKicker}>{kicker.toUpperCase()}</Text>
      <Text style={s.coverTitle}>{title}</Text>
      {subtitle && <Text style={s.coverSubtitle}>{subtitle}</Text>}
      <View style={s.coverMeta}>
        {meta.map(([label, value]) => (
          <View key={label} style={s.coverMetaItem}>
            <Text style={s.coverMetaLabel}>{label.toUpperCase()}</Text>
            <Text style={s.coverMetaValue}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function PageChrome({ title, ctx }: { title: string; ctx: Context }) {
  return (
    <>
      <View style={s.runningHead} fixed render={({ pageNumber }) => (pageNumber > 1 ? <><Text>Emergence RDC · {title}</Text><Text>{ctx.generatedAt}</Text></> : null)} />
      <View style={s.footer} fixed>
        <Text>Emergence RDC — Document confidentiel</Text>
        <Text>
          Généré le {ctx.generatedAt} par {ctx.user.name}
        </Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </View>
    </>
  )
}

/** Parcours commercial : étapes franchies, étape en cours et dates de passage. */
function Pipeline({ prospect }: { prospect: Prospect }) {
  const lost = prospect.status === 'Perdu'
  const current = PIPELINE.indexOf(prospect.status)
  const reachedAt = new Map(prospect.history.map((h) => [h.status, h.changedAt]))
  return (
    <View wrap={false}>
      <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 4 }}>
        {PIPELINE.map((stage, i) => {
          const done = !lost && i < current
          const active = !lost && i === current
          const color = done || active ? C.blue : C.line
          return (
            <View key={stage} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 6 }}>
                <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : done || active ? C.blue : C.line }} />
                <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: color, backgroundColor: done ? C.blue : C.white, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: done ? C.white : active ? C.blue : C.faint }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, height: 2, backgroundColor: i === PIPELINE.length - 1 ? 'transparent' : done ? C.blue : C.line }} />
              </View>
              <Text style={{ fontSize: 6.5, textAlign: 'center', paddingHorizontal: 2, color: active ? C.blue : done ? C.text : C.faint, fontFamily: active ? 'Helvetica-Bold' : 'Helvetica' }}>{stage}</Text>
              {(done || active) && reachedAt.has(stage) && <Text style={{ fontSize: 6, color: C.faint, marginTop: 2 }}>{formatDay(reachedAt.get(stage)!)}</Text>}
            </View>
          )
        })}
      </View>
      {lost && (
        <View style={{ marginTop: 6, backgroundColor: C.redSoft, borderRadius: 5, padding: 7 }}>
          <Text style={{ color: C.red, fontFamily: 'Helvetica-Bold', fontSize: 8.5 }}>Prospect perdu</Text>
        </View>
      )}
    </View>
  )
}

/** Fiche complète d'un prospect, utilisée seule ou dans le rapport global. */
function ProspectDetail({ prospect, actions, ctx }: { prospect: Prospect; actions: Action[]; ctx: Context }) {
  const linked = actions.filter((a) => a.prospectId === prospect.id)
  const assignees = prospect.assigneeIds.map((id) => ctx.userNames.get(id)).filter(Boolean).join(', ')
  const fields: [string, string][] = [
    ['Institution', prospect.institution],
    ['Adresse', prospect.address || '—'],
    ['Site web', prospect.website || '—'],
    ['Plateforme', prospect.platformUrl || '—'],
    ['Offre proposée', prospect.offer || '—'],
    ['Potentiel financier', formatAmount(prospect.amount)],
    ['Responsable', prospect.owner || '—'],
    ['Prochaine action', prospect.next || '—'],
    ['Date de relance', formatDay(prospect.date) + (isOverdue(prospect) ? '  (en retard)' : '')],
  ]
  if (ctx.showAssignees) fields.push(['Utilisateurs ayant accès', assignees || 'Aucun'])

  return (
    <>
      <View style={s.section}>
        <SectionTitle title="Informations générales" />
        <View style={s.grid} wrap={false}>
          {fields.map(([label, value]) => (
            <View key={label} style={s.field}>
              <Text style={s.fieldLabel}>{label.toUpperCase()}</Text>
              <Text style={[s.fieldValue, label === 'Date de relance' && isOverdue(prospect) ? { color: C.red, fontFamily: 'Helvetica-Bold' } : {}]}>{value}</Text>
            </View>
          ))}
        </View>
      </View>

      {canSeeContacts(ctx.user.role) && (
        <View style={s.section}>
          <SectionTitle title="Contacts" count={prospect.contacts.length} />
          <Table
            rows={prospect.contacts}
            emptyLabel="Aucun contact enregistré."
            columns={[
              {
                label: 'Nom / fonction',
                width: '30%',
                render: (c) => (
                  <View>
                    <Text style={s.tdStrong}>{c.name}</Text>
                    {c.title && <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1, paddingRight: 6 }}>{c.title}</Text>}
                  </View>
                ),
              },
              {
                label: 'Téléphones',
                width: '34%',
                render: (c) => (
                  <View>
                    {(['phone1', 'phone2'] as const).map((key) =>
                      c[key] ? (
                        <Text key={key} style={s.td}>
                          {c[key]}
                          {c.whatsapp === key ? '  (WhatsApp)' : ''}
                        </Text>
                      ) : null,
                    )}
                    {!c.phone1 && !c.phone2 && <Text style={[s.td, { color: C.faint }]}>—</Text>}
                  </View>
                ),
              },
              { label: 'E-mail', width: '36%', render: (c) => <Text style={s.td}>{c.email || '—'}</Text> },
            ]}
          />
        </View>
      )}

      <View style={s.section}>
        <SectionTitle title="Parcours commercial" />
        <Pipeline prospect={prospect} />
      </View>

      <View style={s.section}>
        <SectionTitle title="Historique des statuts" count={prospect.history.length} />
        <Table
          rows={[...prospect.history].reverse()}
          emptyLabel="Aucun changement de statut enregistré."
          columns={[
            { label: 'Date', width: '22%', render: (h) => <Text style={s.td}>{formatDateTime(h.changedAt)}</Text> },
            { label: 'Statut', width: '38%', render: (h) => <StatusPill status={h.status} /> },
            { label: 'Modifié par', width: '40%', render: (h) => <Text style={s.td}>{h.changedBy ?? '—'}</Text> },
          ]}
        />
      </View>

      <View style={s.section}>
        <SectionTitle title="Actions liées" count={linked.length} />
        <Table
          rows={[...linked].sort((a, b) => Number(a.done) - Number(b.done))}
          emptyLabel="Aucune action liée à ce prospect."
          columns={[
            {
              label: 'Action',
              width: '50%',
              render: (a) => (
                <View>
                  <Text style={[s.tdStrong, a.done ? { color: C.faint, textDecoration: 'line-through' } : {}]}>{a.title}</Text>
                  {a.detail && <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2, paddingRight: 6 }}>{a.detail}</Text>}
                </View>
              ),
            },
            { label: 'Responsable', width: '22%', render: (a) => <Text style={s.td}>{a.owner || '—'}</Text> },
            { label: 'Échéance', width: '15%', render: (a) => <Pill label={a.due} {...(DUE_COLORS[a.due] ?? { bg: C.soft, fg: C.text })} /> },
            { label: 'État', width: '13%', render: (a) => (a.done ? <Pill label="Terminée" bg="#D1FAE5" fg="#047857" /> : <Pill label="En cours" bg={C.soft} fg={C.text} />) },
          ]}
        />
      </View>

      <View style={s.section}>
        <SectionTitle title="Commentaires" count={prospect.comments.length} />
        {prospect.comments.length === 0 ? (
          <Text style={s.empty}>Aucun commentaire.</Text>
        ) : (
          prospect.comments.map((c) => (
            <View key={c.id} style={s.comment} wrap={false}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initials(c.authorName)}</Text>
              </View>
              <View style={s.bubble}>
                <View style={{ flexDirection: 'row', marginBottom: 3 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.ink }}>{c.authorName}</Text>
                  <Text style={{ fontSize: 7.5, color: C.faint, marginLeft: 6 }}>
                    {formatDateTime(c.createdAt)}
                    {c.updatedAt ? ' · modifié' : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 8.5, lineHeight: 1.4 }}>{c.body}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={s.section}>
        <SectionTitle title="Documents joints" count={prospect.documents.length} />
        <Table
          rows={prospect.documents}
          emptyLabel="Aucun document joint."
          columns={[
            { label: 'Nom du fichier', width: '50%', render: (d) => <Text style={s.tdStrong}>{d.name}</Text> },
            { label: 'Taille', width: '12%', render: (d) => <Text style={s.td}>{formatSize(d.size)}</Text> },
            { label: 'Ajouté le', width: '18%', render: (d) => <Text style={s.td}>{formatDay(d.createdAt)}</Text> },
            { label: 'Par', width: '20%', render: (d) => <Text style={s.td}>{d.uploadedBy ?? '—'}</Text> },
          ]}
        />
      </View>
    </>
  )
}

function prospectKpis(p: Prospect) {
  const c = STATUS_COLORS[p.status]
  return (
    <View style={s.kpis} wrap={false}>
      <View style={[s.kpi, { borderLeftColor: c.bar }]}>
        <Text style={s.kpiLabel}>STATUT</Text>
        <StatusPill status={p.status} />
      </View>
      <View style={[s.kpi, { borderLeftColor: C.blue }]}>
        <Text style={s.kpiLabel}>AVANCEMENT</Text>
        <Text style={[s.kpiValue, { marginBottom: 4 }]}>{p.status === 'Perdu' ? '—' : `${progressOf(p.status)} %`}</Text>
        <Progress status={p.status} showLabel={false} />
      </View>
      <Kpi label="Prochaine relance" value={formatDay(p.date)} hint={isOverdue(p) ? 'En retard' : undefined} accent={isOverdue(p) ? C.red : C.amber} />
      <Kpi label="Suivi" value={`${p.comments.length} / ${p.documents.length}`} hint="commentaires / documents" accent={C.navy} />
    </View>
  )
}

/* ---------- Rapports ---------- */

function ProspectReport({ prospect, actions, ctx }: { prospect: Prospect; actions: Action[]; ctx: Context }) {
  const title = `Rapport — ${prospect.institution}`
  return (
    <Document title={title} author="Emergence RDC" subject="Rapport de suivi commercial" creator="Emergence RDC — Pilotage commercial">
      <Page size="A4" style={s.page}>
        <PageChrome title={title} ctx={ctx} />
        <Cover
          kicker="Rapport de suivi"
          title={prospect.institution}
          subtitle={prospect.offer || undefined}
          tag="Fiche projet"
          meta={[
            ['Date du rapport', ctx.generatedAt.split(' ')[0]],
            ['Responsable', prospect.owner || '—'],
            ...(canSeeContacts(ctx.user.role) ? [['Contact', prospect.contact || '—'] as [string, string]] : []),
          ]}
        />
        {prospectKpis(prospect)}
        <ProspectDetail prospect={prospect} actions={actions} ctx={ctx} />
      </Page>
    </Document>
  )
}

function GlobalReport({ prospects, actions, ctx }: { prospects: Prospect[]; actions: Action[]; ctx: Context }) {
  const title = 'Rapport global du portefeuille'
  const open = prospects.filter((p) => p.status !== 'Signé' && p.status !== 'Perdu')
  const signed = prospects.filter((p) => p.status === 'Signé').length
  const lost = prospects.filter((p) => p.status === 'Perdu').length
  const tracked = prospects.filter((p) => p.status !== 'Perdu')
  const avgProgress = tracked.length ? Math.round(tracked.reduce((sum, p) => sum + progressOf(p.status), 0) / tracked.length) : 0
  const pending = actions.filter((a) => !a.done)
  const overdue = prospects.filter(isOverdue)
  const byStatus = Object.keys(STATUS_COLORS)
    .map((status) => ({ status: status as ProspectStatus, count: prospects.filter((p) => p.status === status).length }))
    .filter((x) => x.count > 0)
  const maxCount = Math.max(1, ...byStatus.map((x) => x.count))
  const owners = [...new Set(prospects.map((p) => p.owner || 'Non assigné'))]
    .map((owner) => {
      const own = prospects.filter((p) => (p.owner || 'Non assigné') === owner)
      return { owner, count: own.length, avg: Math.round(own.reduce((sum, p) => sum + progressOf(p.status), 0) / own.length) }
    })
    .sort((a, b) => b.count - a.count)
  const institutionOf = (id: string | null) => prospects.find((p) => p.id === id)?.institution ?? '—'
  const scope = ctx.showAssignees ? 'Tous les projets' : 'Dossiers assignés'

  return (
    <Document title={title} author="Emergence RDC" subject="Rapport global du portefeuille commercial" creator="Emergence RDC — Pilotage commercial">
      <Page size="A4" style={s.page}>
        <PageChrome title={title} ctx={ctx} />
        <Cover
          kicker="Synthèse"
          title={title}
          subtitle="État d’avancement des opportunités commerciales"
          tag={scope}
          meta={[
            ['Date du rapport', ctx.generatedAt.split(' ')[0]],
            ['Projets', String(prospects.length)],
            ['Préparé par', `${ctx.user.name} (${ROLE_LABELS[ctx.user.role]})`],
          ]}
        />

        <View style={s.kpis} wrap={false}>
          <Kpi label="Projets en cours" value={open.length} hint={`${prospects.length} au total`} accent={C.blue} />
          <Kpi label="Avancement moyen" value={`${avgProgress} %`} hint="hors projets perdus" accent={C.navy} />
          <Kpi label="Signés / perdus" value={`${signed} / ${lost}`} accent={C.green} />
          <Kpi label="Actions en attente" value={pending.length} hint={`${pending.filter((a) => a.due === 'Prioritaire').length} prioritaire(s)`} accent={C.amber} />
          <Kpi label="Relances en retard" value={overdue.length} accent={overdue.length ? C.red : C.green} />
        </View>

        <View style={[s.section, { flexDirection: 'row' }]} wrap={false}>
          <View style={{ flex: 1.2, marginRight: 14 }}>
            <SectionTitle title="Répartition par statut" />
            <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 10 }}>
              {byStatus.map(({ status, count }) => (
                <View key={status} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                  <Text style={{ width: 108, fontSize: 7.5, color: C.text }}>{status}</Text>
                  <View style={{ flex: 1, height: 9, backgroundColor: C.soft, borderRadius: 2 }}>
                    <View style={{ width: `${(count / maxCount) * 100}%`, height: 9, backgroundColor: STATUS_COLORS[status].bar, borderRadius: 2 }} />
                  </View>
                  <Text style={{ width: 18, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.ink }}>{count}</Text>
                </View>
              ))}
              {byStatus.length === 0 && <Text style={s.empty}>Aucun projet.</Text>}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <SectionTitle title="Par responsable" />
            <Table
              rows={owners}
              emptyLabel="Aucun projet."
              columns={[
                { label: 'Responsable', width: '40%', render: (o) => <Text style={s.tdStrong}>{o.owner}</Text> },
                { label: 'Projets', width: '24%', render: (o) => <Text style={s.td}>{o.count}</Text> },
                { label: 'Avancement', width: '36%', render: (o) => <Text style={s.td}>{o.avg} %</Text> },
              ]}
            />
          </View>
        </View>

        <View style={s.section}>
          <SectionTitle title="Portefeuille des projets" count={prospects.length} />
          <Table
            rows={prospects}
            emptyLabel="Aucun projet dans le périmètre."
            columns={[
              {
                label: 'Institution / offre',
                width: '26%',
                render: (p) => (
                  <View>
                    <Text style={s.tdStrong}>{p.institution}</Text>
                    {p.offer && <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1, paddingRight: 6 }}>{p.offer}</Text>}
                  </View>
                ),
              },
              { label: 'Statut', width: '21%', render: (p) => <StatusPill status={p.status} /> },
              { label: 'Avancement', width: '17%', render: (p) => <View style={{ paddingRight: 8 }}><Progress status={p.status} /></View> },
              { label: 'Relance', width: '12%', render: (p) => <Text style={[s.td, isOverdue(p) ? { color: C.red, fontFamily: 'Helvetica-Bold' } : {}]}>{formatDay(p.date)}</Text> },
              { label: 'Responsable', width: '15%', render: (p) => <Text style={s.td}>{p.owner || '—'}</Text> },
              { label: 'Suivi', width: '9%', render: (p) => <Text style={[s.td, { color: C.muted }]}>{p.comments.length}c · {p.documents.length}d</Text> },
            ]}
          />
          <Text style={{ fontSize: 7, color: C.faint, marginTop: 4 }}>Suivi : nombre de commentaires (c) et de documents (d). Relance en rouge : date dépassée.</Text>
        </View>

        {overdue.length > 0 && (
          <View style={s.section}>
            <SectionTitle title="Points d’attention — relances en retard" count={overdue.length} />
            <Table
              rows={overdue}
              emptyLabel=""
              columns={[
                { label: 'Institution', width: '23%', render: (p) => <Text style={s.tdStrong}>{p.institution}</Text> },
                { label: 'Prochaine action', width: '42%', render: (p) => <Text style={s.td}>{p.next || '—'}</Text> },
                { label: 'Relance prévue', width: '18%', render: (p) => <Text style={[s.td, { color: C.red, fontFamily: 'Helvetica-Bold' }]}>{formatDay(p.date)}</Text> },
                { label: 'Responsable', width: '17%', render: (p) => <Text style={s.td}>{p.owner || '—'}</Text> },
              ]}
            />
          </View>
        )}

        <View style={s.section}>
          <SectionTitle title="Actions en attente" count={pending.length} />
          <Table
            rows={pending}
            emptyLabel="Aucune action en attente."
            columns={[
              { label: 'Action', width: '42%', render: (a) => <Text style={s.tdStrong}>{a.title}</Text> },
              { label: 'Projet', width: '20%', render: (a) => <Text style={s.td}>{institutionOf(a.prospectId)}</Text> },
              { label: 'Responsable', width: '22%', render: (a) => <Text style={s.td}>{a.owner || '—'}</Text> },
              { label: 'Échéance', width: '16%', render: (a) => <Pill label={a.due} {...(DUE_COLORS[a.due] ?? { bg: C.soft, fg: C.text })} /> },
            ]}
          />
        </View>

        {/* Fiches détaillées : une par projet, chacune sur une nouvelle page. */}
        {prospects.map((p, i) => (
          <View key={p.id} break>
            <View style={{ backgroundColor: C.navy, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 7, color: C.sky, letterSpacing: 1, marginBottom: 3 }}>
                  FICHE PROJET {i + 1} / {prospects.length}
                </Text>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.white }}>{p.institution}</Text>
                {p.offer && <Text style={{ fontSize: 8.5, color: '#CBD5E1', marginTop: 2 }}>{p.offer}</Text>}
              </View>
            </View>
            {prospectKpis(p)}
            <ProspectDetail prospect={p} actions={actions} ctx={ctx} />
          </View>
        ))}
      </Page>
    </Document>
  )
}

/* ---------- Génération ---------- */

function context(user: User, userNames: Map<string, string>, showAssignees: boolean): Context {
  const generatedAt = new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ }).replace(',', '')
  return { user, generatedAt, userNames, showAssignees }
}

export function renderProspectReport(prospect: Prospect, actions: Action[], user: User, userNames: Map<string, string>, showAssignees: boolean) {
  return renderToBuffer(<ProspectReport prospect={prospect} actions={actions} ctx={context(user, userNames, showAssignees)} />)
}

export function renderGlobalReport(prospects: Prospect[], actions: Action[], user: User, userNames: Map<string, string>, showAssignees: boolean) {
  return renderToBuffer(<GlobalReport prospects={prospects} actions={actions} ctx={context(user, userNames, showAssignees)} />)
}
