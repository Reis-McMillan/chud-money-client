import { decodeJwt, type JWTPayload } from 'jose'

/** Unverified claims of a JWT, or null if it does not parse. */
export function claimsOf(token: string): JWTPayload | null {
  try {
    return decodeJwt(token)
  } catch {
    return null
  }
}

/** Whether the token's `exp` is within `marginMs` of now (or already past). */
export function expiresWithin(token: string, marginMs: number): boolean {
  const exp = claimsOf(token)?.exp
  if (typeof exp !== 'number') return false
  return exp * 1000 - marginMs <= Date.now()
}

/** The `roles` claim as a string array, if present. */
export function rolesOf(token: string): string[] | null {
  const roles = claimsOf(token)?.roles
  return Array.isArray(roles) ? roles.map(String) : null
}
