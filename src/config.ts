/**
 * Runtime settings. Resolution order for each value:
 *
 * 1. `window.__CHUD_CONFIG__`, written by `/config.js`. In the Docker image
 *    nginx renders that script from its environment at container start
 *    (see `nginx.conf`), so a deployment sets `API_BASE`, `VERYS_URL`,
 *    `VERYS_CLIENT_ID` and `CHUD_MONEY_CLIENT_ID` on the container instead
 *    of rebuilding the image. In `npm run dev` the file is the empty stub in
 *    `public/config.js`.
 * 2. `VITE_*` from `.env.local`, inlined by Vite at build time.
 * 3. The compose defaults below, which are what `scripts/verys-seed.js`
 *    registers, so a checkout runs against `docker compose up` unconfigured.
 */
const runtime = window.__CHUD_CONFIG__ ?? {}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

/** Backend origin, e.g. `http://localhost:3000`. */
export const apiBase = trimSlash(
  runtime.apiBase ?? import.meta.env.VITE_API_BASE ?? 'http://localhost:3000',
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
export const verysBase = trimSlash(
  runtime.verysUrl ?? import.meta.env.VITE_VERYS_URL ?? 'http://localhost:8080',
)

/** This SPA's public (PKCE) client id in Verys. */
export const verysClientId =
  runtime.verysClientId ?? import.meta.env.VITE_VERYS_CLIENT_ID ?? 'chud-money-spa'

/**
 * chud-money's client id in Verys: the audience the Verys session is exchanged
 * for. Must equal the backend's `CHUD_MONEY_API_CLIENT_ID`.
 */
export const chudMoneyClientId =
  runtime.chudMoneyClientId ?? import.meta.env.VITE_CHUD_MONEY_CLIENT_ID ?? 'chud-money-api'

/** Where Verys sends the browser back to; the callback is `${appOrigin}/auth/callback`. */
export const appOrigin = window.location.origin

/** Why auth cannot work with the current config, or null. Shown instead of the app. */
export const authConfigError: string | null = !verysClientId
  ? 'VERYS_CLIENT_ID (or VITE_VERYS_CLIENT_ID) is empty; see .env.example'
  : !chudMoneyClientId
    ? 'CHUD_MONEY_CLIENT_ID (or VITE_CHUD_MONEY_CLIENT_ID) is empty; see .env.example'
    : null
