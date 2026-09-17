const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const int = new Intl.NumberFormat('en-US')

export function fmtUsd(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '—' : usd.format(v)
}

export function fmtInt(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '—' : int.format(v)
}

const cents = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const contracts = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** A book price in $0.0001 units, shown as cents: 330 -> "3.3¢", 4700 -> "47¢". */
export function fmtBookPrice(price: number): string {
  return `${cents.format(price / 100)}¢`
}

/** A book size in hundredths of a contract: 23221 -> "232.21". */
export function fmtBookQty(qty: number): string {
  return contracts.format(qty / 100)
}

/** Signed change with fixed decimals, e.g. "+12.34". */
export function fmtDelta(v: number, digits = 2): string {
  const s = v.toFixed(digits)
  return v > 0 ? `+${s}` : s
}

/**
 * Parse a backend timestamp. QuestDB emits `2026-09-06T10:00:00.000000Z`
 * (six fractional digits), which some engines refuse; trim to milliseconds.
 */
export function parseTs(s: string | null | undefined): Date | null {
  if (!s) return null
  const trimmed = s.replace(/(\.\d{3})\d+(Z|[+-]\d{2}:?\d{2})$/, '$1$2')
  const d = new Date(trimmed)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fmtTs(s: string | null | undefined): string {
  const d = parseTs(s)
  return d ? d.toLocaleString() : '—'
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString()
}

/** "3s ago", "2m ago", ... relative to now. */
export function fmtAgo(input: string | number | Date | null | undefined): string {
  if (input == null) return '—'
  const d =
    input instanceof Date ? input : typeof input === 'number' ? new Date(input) : parseTs(input)
  if (!d) return '—'
  const secs = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
