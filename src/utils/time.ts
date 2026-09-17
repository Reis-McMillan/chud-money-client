/** Format a Date for an `<input type="datetime-local">` (local time, seconds precision). */
export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/**
 * Convert a datetime-local value (interpreted in the browser's zone) to
 * RFC 3339 UTC, which is what chrono's `DateTime<Utc>` expects.
 */
export function localToRfc3339(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
