/**
 * App-wide auth state (module singleton; there is no pinia here).
 *
 * The SPA is a public PKCE client of Verys. After login it holds a Verys
 * access/refresh token pair in localStorage. chud-money does not accept that
 * token: every API call and websocket upgrade needs one obtained by RFC 8693
 * token exchange with `audience = chud-money's client id`. Those live five
 * minutes, have no refresh token, and are kept in memory only; `getChudToken`
 * re-exchanges (refreshing the Verys token first when needed) before expiry.
 *
 * Verys refuses the exchange until the user has consented to chud-money's
 * client once, which only its `/authorize` page records. On that refusal the
 * user is sent through it a single time; see `requestConsent`.
 */

import { computed, ref } from 'vue'
import { CallbackError, VerysClient } from 'verys-js-client'

import { chudMoneyClientId } from '@/config'
import { expiresWithin, rolesOf } from './jwt'
import {
  SESSION_KEY,
  clearConsentDone,
  clearSession,
  consentDone,
  markConsentDone,
  readSession,
  savePendingFlow,
  takePendingFlow,
  writeSession,
  type PendingFlow,
  type StoredSession,
} from './storage'
import {
  chudMoneyAuthz,
  endSessionUrl,
  parseTokenError,
  redeemCode,
  revokeRefreshToken,
  verys,
} from './verys'

export type AuthStatus = 'unauthenticated' | 'redirecting' | 'authenticated' | 'refreshing'

/** Tokens are renewed this long before they expire. */
const EARLY_MS = 30_000

/** The Verys session is gone (refresh token revoked or expired). */
export class SessionExpiredError extends Error {
  constructor() {
    super('Verys session expired')
    this.name = 'SessionExpiredError'
  }
}

/** Verys sent the browser back with an `error` instead of a code. */
export class AuthCallbackError extends Error {
  readonly error: string
  readonly description: string | null
  readonly flow: PendingFlow['kind'] | null

  constructor(error: string, description: string | null, flow: PendingFlow['kind'] | null) {
    super(description ? `${error}: ${description}` : error)
    this.name = 'AuthCallbackError'
    this.error = error
    this.description = description
    this.flow = flow
  }
}

const status = ref<AuthStatus>('unauthenticated')
const email = ref<string | null>(null)
const roles = ref<string[]>([])
const isAuthenticated = computed(
  () => status.value === 'authenticated' || status.value === 'refreshing',
)

let chudToken: string | null = null
/** Shared by concurrent callers so one exchange serves them all. */
let inflight: Promise<string> | null = null
/** Set once the page is navigating away; never resolves. */
let redirecting: Promise<never> | null = null

function adopt(session: StoredSession | null): void {
  if (session) {
    email.value = session.email
    roles.value = session.roles
    if (status.value === 'unauthenticated') status.value = 'authenticated'
  } else {
    email.value = null
    roles.value = []
    chudToken = null
    if (status.value !== 'redirecting') status.value = 'unauthenticated'
  }
}

adopt(readSession())
// A sign-in or sign-out in another tab.
window.addEventListener('storage', (e) => {
  if (e.key === SESSION_KEY || e.key === null) adopt(readSession())
})

function currentPath(): string {
  return window.location.pathname + window.location.search + window.location.hash
}

function never(): Promise<never> {
  return new Promise<never>(() => {})
}

function startRedirect(navigate: () => Promise<void>): Promise<never> {
  if (!redirecting) {
    status.value = 'redirecting'
    redirecting = navigate().then(never, (e: unknown) => {
      redirecting = null
      status.value = readSession() ? 'authenticated' : 'unauthenticated'
      throw e
    })
  }
  return redirecting
}

/** Send the browser to Verys to sign in; `returnTo` is restored afterwards. */
export function login(returnTo: string = currentPath()): Promise<never> {
  return startRedirect(async () => {
    const { url, state, nonce, codeVerifier } = await verys.createAuthUrl()
    if (!codeVerifier) throw new Error('expected a PKCE verifier for a public client')
    savePendingFlow(state, { kind: 'login', nonce, codeVerifier, returnTo, createdAt: Date.now() })
    window.location.assign(url)
  })
}

/** Send the browser through Verys `/authorize` for chud-money's client, once. */
export function requestConsent(returnTo: string = currentPath()): Promise<never> {
  return startRedirect(async () => {
    const { url, state } = await chudMoneyAuthz.createAuthUrl()
    savePendingFlow(state, { kind: 'consent', returnTo, createdAt: Date.now() })
    window.location.assign(url)
  })
}

/**
 * Finish whichever redirect brought the browser to `/auth/callback`.
 * Resolves with where to send the user next.
 */
export async function completeCallback(search: string): Promise<{ returnTo: string }> {
  const params = new URLSearchParams(search)
  const state = params.get('state')
  const flow = state ? takePendingFlow(state) : null

  let callback: { state: string; code: string }
  try {
    callback = VerysClient.handleCallback(params)
  } catch (e) {
    if (e instanceof CallbackError) {
      throw new AuthCallbackError(e.message, params.get('error_description'), flow?.kind ?? null)
    }
    throw e
  }

  if (!flow) {
    // A reload of an already-completed callback, or a stale/foreign state.
    if (readSession()) return { returnTo: '/' }
    throw new Error(
      'No pending sign-in matches this callback: the browser session was cleared or the sign-in started in another tab. Start again.',
    )
  }

  if (flow.kind === 'consent') {
    // Only the consent Verys just recorded matters; the code is for a client
    // this SPA cannot act as.
    markConsentDone()
    return { returnTo: flow.returnTo }
  }

  const tokens = await redeemCode(callback.code, flow.nonce, flow.codeVerifier)
  const session: StoredSession = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    idToken: tokens.idToken,
    sub: String(tokens.claims.sub ?? ''),
    email: tokens.claims.email ?? null,
    roles: tokens.claims.roles ?? rolesOf(tokens.accessToken) ?? [],
  }
  writeSession(session)
  clearConsentDone()
  chudToken = null
  status.value = 'authenticated'
  adopt(session)
  return { returnTo: flow.returnTo }
}

/** A chud-money access token, exchanged or renewed as needed. */
export function getChudToken(): Promise<string> {
  if (chudToken && !expiresWithin(chudToken, EARLY_MS)) return Promise.resolve(chudToken)
  if (!inflight) {
    inflight = acquireChudToken().finally(() => {
      inflight = null
    })
  }
  return inflight
}

/** Forget the cached token, e.g. after chud-money answered 401. */
export function invalidateChudToken(): void {
  chudToken = null
}

async function acquireChudToken(): Promise<string> {
  if (status.value === 'authenticated') status.value = 'refreshing'
  try {
    let access = await freshVerysAccessToken()
    try {
      chudToken = await verys.tokenByExchange(access, chudMoneyClientId)
    } catch (e) {
      const err = parseTokenError(e)
      if (err?.error === 'invalid_grant') {
        // Verys disagrees with our clock about the subject token: refresh and retry once.
        access = await freshVerysAccessToken({ force: true })
        chudToken = await verys.tokenByExchange(access, chudMoneyClientId)
      } else if (err?.error === 'access_denied') {
        if (consentDone()) {
          throw new Error(
            `Verys still refuses the chud-money exchange after consent (${err.description ?? err.error}); check the chud-money client registration`,
          )
        }
        return requestConsent(currentPath())
      } else if (err) {
        throw new Error(
          `Verys token exchange failed: ${err.error}${err.description ? ` (${err.description})` : ''}`,
        )
      } else {
        throw e
      }
    }
    status.value = 'authenticated'
    return chudToken
  } catch (e) {
    if (e instanceof SessionExpiredError) {
      adopt(null)
      return login(currentPath())
    }
    // Transient (network, 5xx): keep the session; the next call retries.
    if (status.value === 'refreshing') status.value = 'authenticated'
    throw e
  }
}

async function freshVerysAccessToken(opts: { force?: boolean } = {}): Promise<string> {
  const seen = readSession()
  if (!seen) throw new SessionExpiredError()
  if (!opts.force && !expiresWithin(seen.accessToken, EARLY_MS)) return seen.accessToken
  return withLock('chud.auth.refresh', () => rotate(seen))
}

/**
 * Refresh-token grant. Verys rotates refresh tokens and the old one dies
 * immediately, so refreshes are serialized across tabs with a Web Lock and
 * re-check storage first in case a sibling tab already did the work.
 */
async function rotate(seen: StoredSession): Promise<string> {
  const latest = readSession()
  if (!latest) throw new SessionExpiredError()
  if (latest.accessToken !== seen.accessToken && !expiresWithin(latest.accessToken, EARLY_MS)) {
    return latest.accessToken
  }
  try {
    const pair = await verys.refreshAccessToken(latest.refreshToken)
    const next: StoredSession = {
      ...latest,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      roles: rolesOf(pair.accessToken) ?? latest.roles,
    }
    writeSession(next)
    roles.value = next.roles
    return pair.accessToken
  } catch (e) {
    if (parseTokenError(e)?.error !== 'invalid_grant') throw e
    // Without Web Locks a sibling tab may have rotated under us; use its tokens.
    const now = readSession()
    if (
      now &&
      now.refreshToken !== latest.refreshToken &&
      !expiresWithin(now.accessToken, EARLY_MS)
    ) {
      return now.accessToken
    }
    clearSession()
    throw new SessionExpiredError()
  }
}

function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = navigator.locks as LockManager | undefined
  return locks ? (locks.request(name, fn) as Promise<T>) : fn()
}

/** Revoke the refresh token, drop everything, and end the Verys browser session. */
export function logout(): Promise<never> {
  const session = readSession()
  clearSession()
  adopt(null)
  return startRedirect(async () => {
    if (session) await revokeRefreshToken(session.refreshToken)
    window.location.assign(endSessionUrl(session?.idToken ?? null))
  })
}

export function useAuth() {
  return {
    status,
    email,
    roles,
    isAuthenticated,
    login,
    requestConsent,
    completeCallback,
    getChudToken,
    invalidateChudToken,
    logout,
  }
}
