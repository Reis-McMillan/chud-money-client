import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  triggerRef,
  watch,
  type MaybeRefOrGetter,
} from 'vue'

import type { OrderbookFrame } from '@/api/types'
import { getChudToken } from '@/auth/useAuth'
import { wsUrl } from '@/config'
import { applyDelta, applySnapshot, ladder, type Books } from './orderbook'
import { useWebSocket } from './useWebSocket'

export function useOrderbook(
  tag: MaybeRefOrGetter<string>,
  openTickers: MaybeRefOrGetter<readonly string[]>,
) {
  const books = shallowRef<Books>(new Map())
  const selected = ref<string | null>(null)
  const lagged = ref(0)
  const frames = ref(0)
  /** Deltas applied since the last render flush; sampled once per second for the rate gauge. */
  let pending = 0
  let rateWindow = 0
  const rate = ref(0)

  // The stream runs at hundreds of deltas per second. Books are mutated in
  // place and Vue is notified at most once per animation frame.
  let raf: number | null = null
  function flush() {
    raf = null
    if (pending === 0) return
    frames.value += pending
    pending = 0
    triggerRef(books)
  }
  function scheduleFlush() {
    if (raf === null) raf = requestAnimationFrame(flush)
  }
  const rateTimer = setInterval(() => {
    rate.value = rateWindow
    rateWindow = 0
  }, 1000)

  const socket = useWebSocket<OrderbookFrame>(() => wsUrl(toValue(tag), 'orderbook'), {
    token: getChudToken,
    onMessage(frame) {
      switch (frame.type) {
        case 'lagged':
          // Our books are now behind the stream. The proxy replays a full
          // snapshot per ticker on connect, so just reconnect.
          lagged.value += frame.dropped
          books.value = new Map()
          pending = 0
          socket.reconnect()
          return
        case 'orderbook_snapshot':
          applySnapshot(books.value, frame)
          break
        case 'orderbook_delta':
          if (!applyDelta(books.value, frame)) return
          break
        default:
          return
      }
      pending += 1
      rateWindow += 1
      scheduleFlush()
    },
    onOpen() {
      // A fresh session replays snapshots; forget the previous session's state.
      books.value = new Map()
      pending = 0
    },
  })

  watch(
    () => toValue(tag),
    () => {
      books.value = new Map()
      selected.value = null
      lagged.value = 0
      frames.value = 0
      pending = 0
    },
  )

  onScopeDispose(() => {
    if (raf !== null) cancelAnimationFrame(raf)
    clearInterval(rateTimer)
  })

  /** Union of what the feed says is open and what we have actually seen. */
  const tickers = computed(() => {
    const set = new Set<string>(toValue(openTickers))
    for (const t of books.value.keys()) set.add(t)
    return [...set].sort()
  })

  // Default the selection to the first ticker with a book, and keep it valid.
  watch(
    [tickers, books],
    ([list, map]) => {
      if (selected.value && list.includes(selected.value)) return
      selected.value = list.find((t) => map.has(t)) ?? list[0] ?? null
    },
    { immediate: true },
  )

  const book = computed(() => (selected.value ? (books.value.get(selected.value) ?? null) : null))
  // Books are mutated in place and flushed with triggerRef, so `book` keeps
  // returning the same object and would not re-notify. Read `books` here
  // directly so every flush re-derives the ladder.
  const view = computed(() => {
    const b = books.value.get(selected.value ?? '')
    return b ? ladder(b) : null
  })

  return { books, tickers, selected, book, view, lagged, frames, rate, socket }
}
