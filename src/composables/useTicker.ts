import { computed, ref, shallowRef, toValue, triggerRef, watch, type MaybeRefOrGetter } from 'vue'

import type { TickerSocketFrame } from '@/api/types'
import { getChudToken } from '@/auth/useAuth'
import { wsUrl } from '@/config'
import { useWebSocket } from './useWebSocket'

export interface TickPoint {
  /** epoch ms */
  t: number
  v: number
}

/** Trailing window kept for the chart. */
export const WINDOW_MS = 15 * 60 * 1000
/** Safety cap (~15 min at 5 Hz with headroom). */
const MAX_POINTS = 5_000
/** Window for the messages-per-second gauge. */
const RATE_WINDOW_MS = 5_000

export function useTicker(tag: MaybeRefOrGetter<string>) {
  const points = shallowRef<TickPoint[]>([])
  const indexId = ref<string | null>(null)
  const lagged = ref(0)
  const arrivals = shallowRef<number[]>([])

  const socket = useWebSocket<TickerSocketFrame>(() => wsUrl(toValue(tag), 'ticker'), {
    token: getChudToken,
    onMessage(frame) {
      if (frame.type === 'lagged') {
        lagged.value += frame.dropped
        return
      }
      if (frame.type !== 'cfbenchmarks_value_5hz') return
      const v = Number(frame.msg.value_usd)
      if (!Number.isFinite(v)) return
      const t = frame.msg.source_ts_ms ?? frame.msg.received_at ?? Date.now()
      indexId.value = frame.msg.index_id

      const buf = points.value
      const last = buf[buf.length - 1]
      // Keep the series monotonic so the chart never draws backwards.
      if (last && t < last.t) return
      // A fresh array each tick so consumers that key on identity (props,
      // computeds) see the change. Drop anything older than the window.
      const cutoff = t - WINDOW_MS
      let start = 0
      while (start < buf.length && (buf[start]?.t ?? t) < cutoff) start++
      if (buf.length - start >= MAX_POINTS) start = buf.length - MAX_POINTS + 1
      const next = buf.slice(start)
      next.push({ t, v })
      points.value = next

      const now = Date.now()
      const arr = arrivals.value
      arr.push(now)
      while (arr.length && (arr[0] ?? now) < now - RATE_WINDOW_MS) arr.shift()
      triggerRef(arrivals)
    },
  })

  watch(
    () => toValue(tag),
    () => {
      points.value = []
      arrivals.value = []
      indexId.value = null
      lagged.value = 0
    },
  )

  const last = computed(() => points.value[points.value.length - 1] ?? null)
  const prev = computed(() => points.value[points.value.length - 2] ?? null)
  const change = computed(() => (last.value && prev.value ? last.value.v - prev.value.v : null))
  /** Change over the whole buffer, i.e. the visible window. */
  const windowChange = computed(() => {
    const first = points.value[0]
    return first && last.value ? last.value.v - first.v : null
  })
  const rate = computed(() => arrivals.value.length / (RATE_WINDOW_MS / 1000))

  return { points, last, prev, change, windowChange, rate, indexId, lagged, socket }
}
