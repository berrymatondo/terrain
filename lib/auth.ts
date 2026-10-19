import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { promisify } from 'util'
import { deleteSession, getSessionUser, insertSession } from '@/lib/db'
import type { Role, User } from '@/lib/types'

const scrypt = promisify(scryptCb) as (password: string, salt: string, keylen: number) => Promise<Buffer>

const SESSION_COOKIE = 'session'
const SESSION_DAYS = 30
export const MIN_PASSWORD_LENGTH = 8

/* ---------- Mots de passe (format : scrypt$<sel>$<hash>) ---------- */

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = await scrypt(password, salt, 64)
  return `scrypt$${salt}$${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = await scrypt(password, salt, expected.length)
  return timingSafeEqual(actual, expected)
}

/* ---------- Sessions ---------- */

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/** À appeler uniquement depuis une Server Action ou un Route Handler. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await insertSession(hashToken(token), userId, expiresAt)
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function destroySession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) await deleteSession(hashToken(token))
  store.delete(SESSION_COOKIE)
}

export async function currentSessionHash() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return token ? hashToken(token) : undefined
}

export const getCurrentUser = cache(async (): Promise<User | undefined> => {
  const tokenHash = await currentSessionHash()
  return tokenHash ? getSessionUser(tokenHash) : undefined
})

export class ForbiddenError extends Error {}

/** Vérifie que l'utilisateur connecté a l'un des rôles demandés. */
export async function requireRole(roles: readonly Role[]) {
  const user = await getCurrentUser()
  if (!user) throw new ForbiddenError('Votre session a expiré. Veuillez vous reconnecter.')
  if (!roles.includes(user.role)) throw new ForbiddenError('Vous n’avez pas les droits nécessaires pour cette opération.')
  return user
}
