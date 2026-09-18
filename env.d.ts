/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the chud-money backend, e.g. http://localhost:3000 */
  readonly VITE_API_BASE?: string
  /** Base URL of the Verys auth service, e.g. http://localhost:8080 */
  readonly VITE_VERYS_URL?: string
  /** This SPA's public (PKCE) client id in Verys. */
  readonly VITE_VERYS_CLIENT_ID?: string
  /** chud-money's client id in Verys; the token-exchange audience. */
  readonly VITE_CHUD_MONEY_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Shape of `window.__CHUD_CONFIG__`, set by `/config.js` before the app loads. */
interface ChudRuntimeConfig {
  readonly apiBase?: string
  readonly verysUrl?: string
  readonly verysClientId?: string
  readonly chudMoneyClientId?: string
}

interface Window {
  __CHUD_CONFIG__?: ChudRuntimeConfig
}
