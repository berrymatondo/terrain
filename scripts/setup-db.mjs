// Crée les tables et insère les données initiales (si la base est vide).
// Usage : npm run db:setup
import { randomBytes, scryptSync } from 'crypto'
import { neon } from '@neondatabase/serverless'

try {
  process.loadEnvFile('.env.local')
} catch {}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manquant (voir .env.local)')
const sql = neon(process.env.DATABASE_URL)

await sql`
  CREATE TABLE IF NOT EXISTS prospects (
    id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    institution text NOT NULL,
    contact     text NOT NULL DEFAULT '',
    offer       text NOT NULL DEFAULT '',
    status      text NOT NULL,
    next        text NOT NULL DEFAULT '',
    date        date,
    owner       text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
  )`

await sql`
  CREATE TABLE IF NOT EXISTS actions (
    id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title       text NOT NULL,
    detail      text NOT NULL DEFAULT '',
    owner       text NOT NULL DEFAULT '',
    due         text NOT NULL,
    prospect_id text REFERENCES prospects(id) ON DELETE SET NULL,
    done        boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
  )`

await sql`
  CREATE TABLE IF NOT EXISTS users (
    id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name          text NOT NULL,
    email         text NOT NULL UNIQUE,
    role          text NOT NULL CHECK (role IN ('admin', 'manager', 'user')),
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
  )`

await sql`
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
  )`

// Dossiers accessibles par les utilisateurs au profil « user » (admins et managers voient tout).
await sql`
  CREATE TABLE IF NOT EXISTS prospect_assignments (
    prospect_id text NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (prospect_id, user_id)
  )`

// Documents joints aux prospects, stockés directement dans la base.
await sql`
  CREATE TABLE IF NOT EXISTS documents (
    id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    prospect_id text NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    name        text NOT NULL,
    mime        text NOT NULL,
    size        integer NOT NULL,
    data        bytea NOT NULL,
    uploaded_by text REFERENCES users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  )`
await sql`CREATE INDEX IF NOT EXISTS documents_prospect_idx ON documents (prospect_id)`

// Commentaires : tout utilisateur ayant accès au dossier peut commenter.
await sql`
  CREATE TABLE IF NOT EXISTS prospect_comments (
    id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    prospect_id text NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    author_id   text REFERENCES users(id) ON DELETE SET NULL,
    body        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz
  )`
await sql`CREATE INDEX IF NOT EXISTS prospect_comments_prospect_idx ON prospect_comments (prospect_id)`

// Historique des statuts, pour suivre l'avancement de chaque prospect.
await sql`
  CREATE TABLE IF NOT EXISTS prospect_status_history (
    id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    prospect_id text NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    status      text NOT NULL,
    changed_by  text REFERENCES users(id) ON DELETE SET NULL,
    changed_at  timestamptz NOT NULL DEFAULT now()
  )`
await sql`CREATE INDEX IF NOT EXISTS prospect_status_history_prospect_idx ON prospect_status_history (prospect_id)`
// Point de départ de l'historique pour les prospects existants.
await sql`
  INSERT INTO prospect_status_history (prospect_id, status, changed_at)
  SELECT p.id, p.status, p.created_at FROM prospects p
  WHERE NOT EXISTS (SELECT 1 FROM prospect_status_history h WHERE h.prospect_id = p.id)`

// Responsable rattaché à un compte (la colonne texte « owner » garde les anciens noms saisis à la main).
await sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS owner_id text REFERENCES users(id) ON DELETE SET NULL`
await sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS owner_id text REFERENCES users(id) ON DELETE SET NULL`

// Notifications affichées sous la cloche.
await sql`
  CREATE TABLE IF NOT EXISTS notifications (
    id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id    text REFERENCES users(id) ON DELETE SET NULL,
    entity      text NOT NULL CHECK (entity IN ('prospect', 'action')),
    kind        text NOT NULL CHECK (kind IN ('created', 'updated', 'deleted')),
    prospect_id text,
    title       text NOT NULL,
    body        text NOT NULL DEFAULT '',
    read_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
  )`
await sql`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC)`

// Premier administrateur : ADMIN_EMAIL / ADMIN_PASSWORD, sinon mot de passe généré et affiché une fois.
const [{ count: userCount }] = await sql`SELECT count(*)::int AS count FROM users`
if (userCount === 0) {
  const email = (process.env.ADMIN_EMAIL || 'berrymatondo@gmail.com').toLowerCase()
  const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url')
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  await sql`INSERT INTO users (name, email, role, password_hash) VALUES ('Administrateur', ${email}, 'admin', ${`scrypt$${salt}$${hash}`})`
  console.log(`Administrateur créé : ${email}`)
  if (!process.env.ADMIN_PASSWORD) console.log(`Mot de passe provisoire : ${password}  (à changer après la première connexion)`)
}

const [{ count }] = await sql`SELECT count(*)::int AS count FROM prospects`
if (count > 0) {
  console.log(`Tables prêtes (${count} prospects déjà présents, pas de données initiales insérées).`)
  process.exit(0)
}

const prospects = [
  ['p1', 'Ministère du Budget', 'Junior Bisuesue', 'Dashboard Budget RDC', 'En négociation', 'Tenir une 2e séance de travail avec la DGPPB', '2026-10-10', 'Berry'],
  ['p2', 'BCC', 'Jean-Louis Kayembe', 'KONEX', 'Échange engagé', 'Relancer le DG Louis pour les API', '2026-10-10', 'Gemima'],
  ['p3', 'FIS', 'Emmanuel Kibina', 'Projet KSE', 'En attente de la signature', "Signature du protocole d'accord", null, 'Darryl'],
  ['p4', 'FOMIN', 'Eugène Bunga Muke', 'Service courrier, RH & suivi', 'En rédaction', "Finalisation et transmission de l'offre", '2026-10-13', 'Darryl'],
  ['p5', 'ACOREP', 'M. Joram', 'Plateforme de suivi réglementaire', 'Échange engagé', 'Recevoir le courrier de réponse aux spécifications', '2026-10-13', 'Gemima'],
  ['p6', 'DGDA', 'DGA', 'Solution similaire au CAMI', 'Échange engagé', "Recevoir un courrier d'invitation", '2026-10-16', 'Olivier'],
  ['p7', 'ONIP', 'Somanza Kokiyolo', 'Outils de gestion interne', 'En étude', 'Développer un MVP', null, 'Berry'],
  ['p8', 'IGF', 'Kitenge', 'Dashboard', 'Échange engagé', 'Relancer M. Kitenge dans 1 semaine', '2026-10-19', 'Berry'],
]

const actions = [
  ['a1', 'Restitution des échanges au DG de l’ACOREP', 'Faire le point sur les modalités de collaboration et solliciter une note auprès de la Direction des Enregistrements.', 'Berry', 'À planifier'],
  ['a2', 'Lettre d’invitation à la Direction des Enregistrements', 'Rédiger un courrier en vue d’une séance de présentation.', 'Gemima', 'Prioritaire'],
  ['a3', 'Protocole d’accord et de confidentialité', 'Définir les modalités de collaboration et les engagements de confidentialité.', 'Darryl Kalambayi', 'Cette semaine'],
  ['a4', 'Relance du point focal ACOREP', 'Reprendre contact avec M. Masidianvinga, Chef de Division chargé de la Gestion des projets.', 'Gemima · Joviale', 'À relancer'],
  ['a5', 'Élaboration de l’offre technique et financière', 'Préparer une proposition inférieure à 500 000 USD, cohérente avec le PPM.', 'Darryl Kalambayi', 'À préparer'],
]

// created_at décroissant pour conserver l'ordre d'affichage (les plus récents en premier).
await sql.transaction([
  ...prospects.map(
    ([id, institution, contact, offer, status, next, date, owner], i) =>
      sql`INSERT INTO prospects (id, institution, contact, offer, status, next, date, owner, created_at)
          VALUES (${id}, ${institution}, ${contact}, ${offer}, ${status}, ${next}, ${date}, ${owner}, now() - make_interval(secs => ${i}))`,
  ),
  ...actions.map(
    ([id, title, detail, owner, due], i) =>
      sql`INSERT INTO actions (id, title, detail, owner, due, prospect_id, created_at)
          VALUES (${id}, ${title}, ${detail}, ${owner}, ${due}, 'p5', now() - make_interval(secs => ${i}))`,
  ),
])

console.log(`Base initialisée : ${prospects.length} prospects, ${actions.length} actions.`)

// Historique initial des prospects que l'on vient d'insérer.
await sql`
  INSERT INTO prospect_status_history (prospect_id, status, changed_at)
  SELECT p.id, p.status, p.created_at FROM prospects p
  WHERE NOT EXISTS (SELECT 1 FROM prospect_status_history h WHERE h.prospect_id = p.id)`
