<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { FeedStatus, OpenMarket } from '@/api/types'
import { useTicker } from '@/composables/useTicker'
import { fmtAgo, fmtDelta, fmtUsd, parseTs } from '@/utils/format'
import TickerChart from './TickerChart.vue'
import WsStatus from './WsStatus.vue'

const props = defineProps<{
  tag: string
  indexId: string
  feed: FeedStatus | null
}>()

const ticker = useTicker(() => props.tag)

/** Show the feed's last known value until the socket delivers. */
const price = computed(() => ticker.last.value?.v ?? props.feed?.last_value ?? null)
const live = computed(() => ticker.last.value !== null)
const change = computed(() => ticker.change.value)

// A 1 Hz clock for the countdown and for picking the current market.
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(clock))

interface CurrentMarket {
  market: OpenMarket
  openAt: number | null
  closeAt: number | null
}

/**
 * The market being settled right now: open_time <= now < close_time. If the
 * series is between periods, fall back to the next one to close.
 */
const current = computed<CurrentMarket | null>(() => {
  const list = props.feed?.open_markets ?? []
  const t = now.value
  const parsed = list.map((market) => ({
    market,
    openAt: parseTs(market.open_time)?.getTime() ?? null,
    closeAt: parseTs(market.close_time)?.getTime() ?? null,
  }))
  const active = parsed
    .filter((m) => m.openAt != null && m.closeAt != null && m.openAt <= t && t < m.closeAt)
    .sort((a, b) => (a.closeAt ?? 0) - (b.closeAt ?? 0))
  if (active[0]) return active[0]
  const upcoming = parsed
    .filter((m) => m.closeAt != null && m.closeAt > t)
    .sort((a, b) => (a.closeAt ?? 0) - (b.closeAt ?? 0))
  return upcoming[0] ?? parsed[0] ?? null
})

const target = computed(() => current.value?.market.floor_strike ?? null)
const strikeType = computed(() => current.value?.market.strike_type ?? null)
/** Distance from the target, positive when the index is above it. */
const vsTarget = computed(() =>
  price.value != null && target.value != null ? price.value - target.value : null,
)
const vsTargetPct = computed(() =>
  vsTarget.value != null && target.value ? (vsTarget.value / target.value) * 100 : null,
)
/** Whether the yes side is currently winning given the strike rule. */
const yesLeading = computed(() => {
  if (vsTarget.value == null) return null
  const st = strikeType.value ?? 'greater_or_equal'
  if (st.startsWith('less')) return vsTarget.value < 0
  return vsTarget.value >= 0
})
const tone = computed(() => {
  if (yesLeading.value == null) return 'text-fg'
  return yesLeading.value ? 'text-up' : 'text-down'
})

const countdown = computed(() => {
  const closeAt = current.value?.closeAt
  if (closeAt == null) return null
  const secs = Math.max(0, Math.round((closeAt - now.value) / 1000))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

function shortTicker(t: string): string {
  const i = t.indexOf('-')
  return i > 0 ? t.slice(i + 1) : t
}
</script>

<template>
  <section class="card flex min-h-[45vh] flex-col gap-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <span class="font-mono text-sm text-muted">{{ ticker.indexId.value ?? indexId }}</span>
          <WsStatus
            :status="ticker.socket.status.value"
            :attempts="ticker.socket.attempts.value"
            label="ticker"
          />
          <span
            v-if="ticker.lagged.value"
            class="badge badge-warn"
            title="frames dropped by the proxy"
          >
            lagged {{ ticker.lagged.value }}
          </span>
        </div>
        <div class="mt-1 flex flex-wrap items-baseline gap-x-3">
          <span class="font-mono text-4xl tabular-nums sm:text-5xl" :class="tone">{{
            fmtUsd(price)
          }}</span>
          <span
            v-if="change != null"
            class="font-mono text-sm tabular-nums"
            :class="change >= 0 ? 'text-up' : 'text-down'"
          >
            {{ fmtDelta(change) }}
          </span>
          <span v-if="!live && price != null" class="text-xs text-muted">last known</span>
        </div>
      </div>

      <div
        v-if="current"
        class="flex min-w-64 flex-col gap-1 rounded-md border border-accent/40 bg-accent/5 px-3 py-2"
      >
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-xs tracking-wide text-muted uppercase">kalshi target</span>
          <span class="font-mono text-[11px] text-muted" :title="current.market.ticker">
            {{ shortTicker(current.market.ticker) }}
          </span>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <span class="font-mono text-2xl text-accent tabular-nums">{{ fmtUsd(target) }}</span>
          <span v-if="countdown" class="font-mono text-sm tabular-nums" title="time to close">
            ⏱ {{ countdown }}
          </span>
        </div>
        <div class="flex items-baseline justify-between gap-3 text-xs">
          <span class="font-mono tabular-nums" :class="tone">
            <template v-if="vsTarget != null">
              {{ fmtDelta(vsTarget) }}
              <span v-if="vsTargetPct != null" class="opacity-70"
                >({{ fmtDelta(vsTargetPct, 3) }}%)</span
              >
            </template>
            <template v-else>target not set yet</template>
          </span>
          <span
            v-if="yesLeading != null"
            class="badge"
            :class="yesLeading ? 'badge-ok' : 'badge-err'"
          >
            {{ yesLeading ? 'YES leading' : 'NO leading' }}
          </span>
        </div>
        <div class="truncate text-[11px] text-muted" :title="current.market.title">
          {{ current.market.title }}
          <span v-if="strikeType" class="opacity-70">· {{ strikeType.replaceAll('_', ' ') }}</span>
        </div>
      </div>
      <div v-else class="self-center text-xs text-muted">no open kalshi market</div>

      <dl class="grid grid-cols-3 gap-x-6 gap-y-1 text-xs">
        <div>
          <dt class="text-muted">rate</dt>
          <dd class="font-mono tabular-nums">{{ ticker.rate.value.toFixed(1) }} msg/s</dd>
        </div>
        <div>
          <dt class="text-muted">points</dt>
          <dd class="font-mono tabular-nums">{{ ticker.points.value.length }}</dd>
        </div>
        <div>
          <dt class="text-muted">last tick</dt>
          <dd class="font-mono tabular-nums">
            {{
              ticker.last.value
                ? fmtAgo(ticker.last.value.t)
                : feed?.last_msg_at
                  ? fmtAgo(feed.last_msg_at)
                  : '—'
            }}
          </dd>
        </div>
      </dl>
    </div>

    <div class="min-h-0 flex-1">
      <TickerChart
        :points="ticker.points.value"
        :target="target"
        :open-at="current?.openAt"
        :close-at="current?.closeAt"
      />
    </div>
  </section>
</template>
