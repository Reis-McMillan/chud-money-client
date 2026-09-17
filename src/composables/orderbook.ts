// Pure orderbook state, kept free of Vue so it is trivially testable.
//
// Kalshi quotes both sides as *bids*: a resting yes bid at $0.47 and a resting
// no bid at $0.51 mean "buy yes at 0.47" and "sell yes at 1 - 0.51 = 0.49".
// Current frames carry sub-cent prices as decimal strings (`price_dollars:
// "0.0330"`) and fractional sizes (`delta_fp: "-232.21"`); older frames carried
// integer cents (`price: 47`) and whole contracts (`delta: -120`). Both are
// accepted and normalised to integers: prices in units of $0.0001, sizes in
// hundredths of a contract. Integer math keeps deltas exact.

import type { DeltaFrame, SnapshotFrame } from '@/api/types'

/** $1.00 in price units. */
export const PRICE_ONE = 10_000
const PRICE_SCALE = 4
const QTY_SCALE = 2

export interface Book {
  /** price ($0.0001 units) -> size (hundredths of a contract) */
  yes: Map<number, number>
  no: Map<number, number>
  /** Sequence the book is current through. */
  seq: number
  updatedAt: number
}

export type Books = Map<string, Book>

/** Parse "-232.21" with scale 2 -> -23221, truncating extra digits. */
export function parseScaled(s: string, scale: number): number | null {
  const m = /^\s*([+-]?)(\d*)(?:\.(\d*))?\s*$/.exec(s)
  if (!m) return null
  const [, sign, intPart = '', fracPart = ''] = m
  if (intPart === '' && fracPart === '') return null
  const frac = fracPart.slice(0, scale).padEnd(scale, '0')
  const v =
    (intPart === '' ? 0 : parseInt(intPart, 10)) * 10 ** scale +
    (frac === '' ? 0 : parseInt(frac, 10))
  return sign === '-' ? -v : v
}

export function priceToCents(price: number): number {
  return price / (PRICE_ONE / 100)
}

export function qtyToContracts(qty: number): number {
  return qty / 10 ** QTY_SCALE
}

function levels(
  int: [number, number][] | undefined,
  dec: [string, string][] | undefined,
): Map<number, number> {
  const m = new Map<number, number>()
  if (dec) {
    for (const [p, q] of dec) {
      const price = parseScaled(p, PRICE_SCALE)
      const qty = parseScaled(q, QTY_SCALE)
      if (price != null && qty != null && qty > 0) m.set(price, qty)
    }
  } else if (int) {
    for (const [p, q] of int) {
      if (q > 0) m.set(p * (PRICE_ONE / 100), q * 10 ** QTY_SCALE)
    }
  }
  return m
}

export function applySnapshot(books: Books, frame: SnapshotFrame, now = Date.now()): void {
  books.set(frame.msg.market_ticker, {
    yes: levels(frame.msg.yes, frame.msg.yes_dollars),
    no: levels(frame.msg.no, frame.msg.no_dollars),
    seq: frame.seq ?? 0,
    updatedAt: now,
  })
}

function deltaParts(frame: DeltaFrame): { price: number; delta: number } | null {
  const { msg } = frame
  const price =
    msg.price_dollars != null
      ? parseScaled(msg.price_dollars, PRICE_SCALE)
      : msg.price != null
        ? msg.price * (PRICE_ONE / 100)
        : null
  const delta =
    msg.delta_fp != null
      ? parseScaled(msg.delta_fp, QTY_SCALE)
      : msg.delta != null
        ? msg.delta * 10 ** QTY_SCALE
        : null
  if (price == null || delta == null) return null
  return { price, delta }
}

/**
 * Apply a delta. Returns false if it was ignored: no snapshot yet for the
 * ticker, an unparseable payload, or a delta already reflected in a replayed
 * snapshot (its seq is at or below the book's).
 */
export function applyDelta(books: Books, frame: DeltaFrame, now = Date.now()): boolean {
  const book = books.get(frame.msg.market_ticker)
  if (!book) return false
  const seq = frame.seq ?? 0
  if (seq !== 0 && seq <= book.seq) return false
  const parts = deltaParts(frame)
  if (!parts) return false

  const side = frame.msg.side === 'yes' ? book.yes : book.no
  const qty = (side.get(parts.price) ?? 0) + parts.delta
  if (qty <= 0) side.delete(parts.price)
  else side.set(parts.price, qty)
  book.seq = seq
  book.updatedAt = now
  return true
}

export interface LadderRow {
  /** $0.0001 units */
  price: number
  /** hundredths of a contract */
  qty: number
  /** Cumulative size from the top of book down to this row. */
  cum: number
}

export interface Ladder {
  /** Best first (highest yes bid). */
  bids: LadderRow[]
  /** Best first (lowest yes ask). */
  asks: LadderRow[]
  bestBid: LadderRow | null
  bestAsk: LadderRow | null
  /** $0.0001 units */
  spread: number | null
  maxCum: number
}

/** Yes-side view: bids straight from `yes`, asks mirrored from `no`. */
export function ladder(book: Book, depth = 12): Ladder {
  const bidsAll = [...book.yes.entries()].sort((a, b) => b[0] - a[0])
  const asksAll = [...book.no.entries()]
    .map(([p, q]) => [PRICE_ONE - p, q] as const)
    .sort((a, b) => a[0] - b[0])

  let cum = 0
  const bids = bidsAll.slice(0, depth).map(([price, qty]) => ({ price, qty, cum: (cum += qty) }))
  cum = 0
  const asks = asksAll.slice(0, depth).map(([price, qty]) => ({ price, qty, cum: (cum += qty) }))

  const bestBid = bids[0] ?? null
  const bestAsk = asks[0] ?? null
  const spread = bestBid && bestAsk ? bestAsk.price - bestBid.price : null
  const maxCum = Math.max(bids[bids.length - 1]?.cum ?? 0, asks[asks.length - 1]?.cum ?? 0, 1)
  return { bids, asks, bestBid, bestAsk, spread, maxCum }
}
