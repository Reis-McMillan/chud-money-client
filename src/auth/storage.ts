/**
 * Persistence for the auth flow. The Verys session lives in localStorage so
 * it survives reloads and is shared across tabs; the state of an in-progress
 * redirect lives in sessionStorage, keyed by the OAuth `state` value. Storage
 * can be unavailable (private mode, disabled), so every access is guarded.
 */

export interface StoredSession {
  accessToken: string
  refreshToken: string
  /** Raw ID token JWT, kept only as the `id_token_hint` for sign-out. */
  idToken: string | null
  sub: string
  email: string | null
  roles: string[]
}

export type PendingFlow =
  | { kind: 'login'; nonce: string; codeVerifier: string; returnTo: string; createdAt: number }
  | { kind: 'consent'; returnTo: string; createdAt: number }

/** One JSON blob so a cross-tab write is atomic. */
export const SESSION_KEY = 'chud.auth.session'
const FLOW_PREFIX = 'chud.auth.flow.'
/** Set once the consent hop for chud-money has completed, to break a loop. */
const CONSENT_DONE_KEY = 'chud.auth.consentDone'
const FLOW_TTL_MS = 10 * 60 * 1000

export function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<StoredSession>
    if (
      typeof s.accessToken !== 'string' ||
      typeof s.refreshToken !== 'string' ||
      typeof s.sub !== 'string'
    ) {
      return null
    }
    return {
      accessToken: s.accessToken,
      refreshToken: s.refreshToken,
      idToken: typeof s.idToken === 'string' ? s.idToken : null,
      sub: s.sub,
      email: typeof s.email === 'string' ? s.email : null,
      roles: Array.isArray(s.roles) ? s.roles.map(String) : [],
    }
  } catch {
    return null
  }
}

export function writeSession(session: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // storage unavailable; the session lives in memory until the next reload
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // nothing to clear
  }
}

export function savePendingFlow(state: string, flow: PendingFlow): void {
  try {
    pruneFlows()
    sessionStorage.setItem(FLOW_PREFIX + state, JSON.stringify(flow))
  } catch {
    // the callback will report a state mismatch
  }
}

/** Read and remove the flow for `state`, so a callback cannot be replayed. */
export function takePendingFlow(state: string): PendingFlow | null {
  try {
    const key = FLOW_PREFIX + state
    const raw = sessionStorage.getItem(key)
    sessionStorage.removeItem(key)
    if (!raw) return null
    const flow = JSON.parse(raw) as PendingFlow
    return Date.now() - flow.createdAt > FLOW_TTL_MS ? null : flow
  } catch {
    return null
  }
}

function pruneFlows(): void {
  const stale: string[] = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (!key?.startsWith(FLOW_PREFIX)) continue
    try {
      const flow = JSON.parse(sessionStorage.getItem(key) ?? '') as PendingFlow
      if (Date.now() - flow.createdAt > FLOW_TTL_MS) stale.push(key)
    } catch {
      stale.push(key)
    }
  }
  for (const key of stale) sessionStorage.removeItem(key)
}

export function consentDone(): boolean {
  try {
    return sessionStorage.getItem(CONSENT_DONE_KEY) !== null
  } catch {
    return false
  }
}

export function markConsentDone(): void {
  try {
    sessionStorage.setItem(CONSENT_DONE_KEY, '1')
  } catch {
    // worst case: one extra consent hop
  }
}

export function clearConsentDone(): void {
  try {
    sessionStorage.removeItem(CONSENT_DONE_KEY)
  } catch {
    // nothing to clear
  }
}
