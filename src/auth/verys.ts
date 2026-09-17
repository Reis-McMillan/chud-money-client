/**
 * Verys clients and the few requests `verys-js-client` does not cover.
 */

import { jwtVerify, type JWTPayload } from 'jose'
import { NonceError, TokenError, VerysClient } from 'verys-js-client'

import { appOrigin, chudMoneyClientId, verysBase, verysClientId } from '@/config'

// A missing client id is reported by App.vue via `authConfigError` rather
// than thrown here: an import-time throw leaves a blank page.

export const SCOPES = ['openid', 'profile', 'email']

/** This SPA as a public PKCE client. Its callback is `${appOrigin}/auth/callback`. */
export const verys = new VerysClient({
  host: appOrigin,
  baseUrl: verysBase,
  clientId: verysClientId,
  clientSecret: null,
  scopes: SCOPES,
})

/**
 * chud-money's client, used only to build an `/authorize` URL for the one-time
 * consent hop. Verys will not let a token be exchanged for an audience the
 * user has never consented to, and consent is only recorded by `/authorize`.
 * The code it sends back is never redeemed (that client is confidential).
 */
export const chudMoneyAuthz = new VerysClient({
  host: appOrigin,
  baseUrl: verysBase,
  clientId: chudMoneyClientId,
  clientSecret: null,
  scopes: ['openid'],
})

export interface IdClaims extends JWTPayload {
  email?: string
  roles?: string[]
}

export interface RedeemedTokens {
  /** Raw ID token JWT. */
  idToken: string
  claims: IdClaims
  accessToken: string
  refreshToken: string
}

/**
 * Authorization-code grant. Same request as `verys.tokenByCode`, but keeps
 * the raw `id_token`: Verys `/end-session` only redirects back to the app
 * when given it as `id_token_hint`, and the library discards it.
 */
export async function redeemCode(
  code: string,
  nonce: string,
  codeVerifier: string,
): Promise<RedeemedTokens> {
  const res = await fetch(verys.tokenUrl, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: verysClientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: verys.hostAuthCallbackUrl,
      code_verifier: codeVerifier,
    }),
  })
  if (!res.ok) throw new TokenError(await res.text())
  const tokens = (await res.json()) as {
    id_token: string
    access_token: string
    refresh_token: string
  }

  let claims: IdClaims
  try {
    ;({ payload: claims } = await jwtVerify(tokens.id_token, await verys.getPublicKey(), {
      algorithms: ['EdDSA'],
      audience: verysClientId,
      clockTolerance: 60,
    }))
  } catch (e) {
    throw new TokenError(e instanceof Error ? e.message : String(e))
  }
  if (claims.nonce !== nonce) throw new NonceError('Invalid nonce.')

  return {
    idToken: tokens.id_token,
    claims,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  }
}

export interface OAuthError {
  error: string
  description?: string
}

/** The OAuth error body behind a `TokenError`, whose message is the raw response text. */
export function parseTokenError(e: unknown): OAuthError | null {
  if (!(e instanceof TokenError)) return null
  try {
    const body = JSON.parse(e.message) as { error?: unknown; error_description?: unknown }
    if (typeof body.error !== 'string') return null
    return {
      error: body.error,
      description: typeof body.error_description === 'string' ? body.error_description : undefined,
    }
  } catch {
    return null
  }
}

/** Best effort; sign-out proceeds whether or not Verys accepts it. */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    await fetch(`${verysBase}/token/revoke`, {
      method: 'POST',
      body: new URLSearchParams({ token: refreshToken, client_id: verysClientId }),
    })
  } catch {
    // offline or blocked; the token still expires on its own
  }
}

export function endSessionUrl(idToken: string | null): string {
  const params = new URLSearchParams({ post_logout_redirect_uri: `${appOrigin}/` })
  if (idToken) params.set('id_token_hint', idToken)
  return `${verysBase}/end-session?${params}`
}
