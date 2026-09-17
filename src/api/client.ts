import { getChudToken, invalidateChudToken, useAuth } from '@/auth/useAuth'
import { apiBase } from '@/config'
import type {
  AddMarketBody,
  ApiErrorBody,
  DeleteResult,
  IngestAccepted,
  IngestBody,
  IngestJob,
  MarketDetail,
  MarketView,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly details: string[] | undefined

  constructor(status: number, message: string, details?: string[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

/**
 * Every call carries a chud-money access token (see `auth/useAuth`). A 401
 * is retried once with a freshly exchanged token; a second one is surfaced.
 */
async function request<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const token = await getChudToken()
  // Acquiring the token is not abortable; honour a cancellation that
  // happened meanwhile before touching the network.
  opts.signal?.throwIfAborted()

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${apiBase}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, `cannot reach backend at ${apiBase}`)
  }

  if (res.status === 401 && !retried) {
    invalidateChudToken()
    return request<T>(path, opts, true)
  }

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    let details: string[] | undefined
    try {
      const body = (await res.json()) as Partial<ApiErrorBody>
      if (typeof body.error === 'string') message = body.error
      if (Array.isArray(body.details)) details = body.details.map(String)
    } catch {
      // non-JSON error body; keep the status text
    }
    if (res.status === 403) {
      // The token is valid; the identity lacks the chud-money role in Verys.
      const { email } = useAuth()
      message = `${email.value ?? 'this account'}: ${message}`
    }
    throw new ApiError(res.status, message, details)
  }

  return (await res.json()) as T
}

export const api = {
  listMarkets: (signal?: AbortSignal) => request<MarketView[]>('/', { signal }),

  addMarket: (body: AddMarketBody) => request<MarketView>('/add', { method: 'POST', body }),

  getMarket: (tag: string, signal?: AbortSignal) =>
    request<MarketDetail>(`/${encodeURIComponent(tag)}`, { signal }),

  deleteMarket: (tag: string) =>
    request<DeleteResult>(`/${encodeURIComponent(tag)}`, { method: 'DELETE' }),

  startIngest: (body: IngestBody) => request<IngestAccepted>('/ingest', { method: 'POST', body }),

  getIngestJob: (jobId: string, signal?: AbortSignal) =>
    request<IngestJob>(`/ingest/${encodeURIComponent(jobId)}`, { signal }),
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}
