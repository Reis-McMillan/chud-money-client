/** Backend origin, e.g. `http://localhost:3000`. */
export const apiBase = (import.meta.env.VITE_API_BASE ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
)

/** Same origin with a websocket scheme. */
export const wsBase = apiBase.replace(/^http/, 'ws')

export type WsKind = 'ticker' | 'orderbook'

/**
 * Proxy websocket URL for a market. Derived from the API base rather than
 * taken from `market.proxy` because those URLs are frozen at insert time.
 * Token-free: `useWebSocket` appends `?access_token=` at connect time.
 */
export function wsUrl(tag: string, kind: WsKind): string {
  return `${wsBase}/ws/${encodeURIComponent(tag)}/${kind}`
}

/** Verys auth service origin, e.g. `http://localhost:8080`. */
export const verysBase = (import.meta.env.VITE_VERYS_URL ?? 'http://localhost:8080').replace(
  /\/+$/,
  '',
)

// The defaults below are what scripts/verys-seed.js registers in the compose
// Verys, so a checkout runs against `docker compose up` with no .env.local.

/** This SPA's public (PKCE) client id in Verys. */
export const verysClientId = import.meta.env.VITE_VERYS_CLIENT_ID ?? 'chud-money-spa'

/**
 * chud-money's client id in Verys: the audience the Verys session is exchanged
 * for. Must equal the backend's `CHUD_MONEY_API_CLIENT_ID`.
 */
export const chudMoneyClientId = import.meta.env.VITE_CHUD_MONEY_CLIENT_ID ?? 'chud-money-api'

/** Where Verys sends the browser back to; the callback is `${appOrigin}/auth/callback`. */
export const appOrigin = window.location.origin

/** Why auth cannot work with the current env, or null. Shown instead of the app. */
export const authConfigError: string | null = !verysClientId
  ? 'VITE_VERYS_CLIENT_ID is empty; see .env.example'
  : !chudMoneyClientId
    ? 'VITE_CHUD_MONEY_CLIENT_ID is empty; see .env.example'
    : null
