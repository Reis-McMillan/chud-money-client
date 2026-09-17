<script setup lang="ts">
import { computed } from 'vue'

import { useOrderbook } from '@/composables/useOrderbook'
import { fmtAgo, fmtBookPrice, fmtBookQty, fmtInt } from '@/utils/format'
import WsStatus from './WsStatus.vue'

const props = defineProps<{
  tag: string
  openTickers: readonly string[]
}>()

const ob = useOrderbook(
  () => props.tag,
  () => props.openTickers,
)

const view = computed(() => ob.view.value)
/** Asks are rendered best-at-bottom so the spread sits in the middle. */
const asksTopDown = computed(() => (view.value ? [...view.value.asks].reverse() : []))
const mid = computed(() => {
  const v = view.value
  if (!v?.bestBid || !v.bestAsk) return null
  return (v.bestBid.price + v.bestAsk.price) / 2
})

function shortTicker(t: string): string {
  // KXBTC15M-26SEP0612-T110000 -> 26SEP0612-T110000
  const i = t.indexOf('-')
  return i > 0 ? t.slice(i + 1) : t
}
</script>

<template>
  <section class="card flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-semibold">Orderbook</h3>
      <div class="flex items-center gap-2">
        <span v-if="ob.lagged.value" class="badge badge-warn" title="resynced after dropped frames">
          resynced
        </span>
        <WsStatus
          :status="ob.socket.status.value"
          :attempts="ob.socket.attempts.value"
          label="book"
        />
      </div>
    </div>

    <label class="block">
      <span class="label">market ticker</span>
      <select v-model="ob.selected.value" class="input" :disabled="ob.tickers.value.length === 0">
        <option v-if="ob.tickers.value.length === 0" :value="null">no open markets</option>
        <option v-for="t in ob.tickers.value" :key="t" :value="t">
          {{ t }}{{ ob.books.value.has(t) ? '' : ' (no snapshot)' }}
        </option>
      </select>
    </label>

    <div v-if="view && ob.book.value" class="flex flex-col gap-1 font-mono text-xs tabular-nums">
      <div class="grid grid-cols-3 px-1 text-[10px] tracking-wide text-muted uppercase">
        <span>price</span>
        <span class="text-right">size</span>
        <span class="text-right">total</span>
      </div>

      <div class="flex flex-col">
        <div
          v-for="row in asksTopDown"
          :key="'a' + row.price"
          class="relative grid grid-cols-3 rounded px-1 py-0.5"
        >
          <div
            class="absolute inset-y-0 right-0 rounded bg-down/15"
            :style="{ width: `${(row.cum / view.maxCum) * 100}%` }"
          />
          <span class="relative text-down">{{ fmtBookPrice(row.price) }}</span>
          <span class="relative text-right">{{ fmtBookQty(row.qty) }}</span>
          <span class="relative text-right text-muted">{{ fmtBookQty(row.cum) }}</span>
        </div>
        <div v-if="asksTopDown.length === 0" class="px-1 py-1 text-muted">no asks</div>
      </div>

      <div class="my-1 flex items-center justify-between border-y border-border px-1 py-1">
        <span class="text-muted">spread</span>
        <span>{{ view.spread != null ? fmtBookPrice(view.spread) : '—' }}</span>
        <span class="text-muted">mid</span>
        <span>{{ mid != null ? fmtBookPrice(mid) : '—' }}</span>
      </div>

      <div class="flex flex-col">
        <div
          v-for="row in view.bids"
          :key="'b' + row.price"
          class="relative grid grid-cols-3 rounded px-1 py-0.5"
        >
          <div
            class="absolute inset-y-0 right-0 rounded bg-up/15"
            :style="{ width: `${(row.cum / view.maxCum) * 100}%` }"
          />
          <span class="relative text-up">{{ fmtBookPrice(row.price) }}</span>
          <span class="relative text-right">{{ fmtBookQty(row.qty) }}</span>
          <span class="relative text-right text-muted">{{ fmtBookQty(row.cum) }}</span>
        </div>
        <div v-if="view.bids.length === 0" class="px-1 py-1 text-muted">no bids</div>
      </div>

      <div class="mt-2 flex justify-between text-[10px] text-muted">
        <span>yes side · asks mirrored from no bids</span>
        <span>
          {{ fmtInt(ob.rate.value) }} msg/s · seq {{ ob.book.value.seq }} ·
          {{ fmtAgo(ob.book.value.updatedAt) }}
        </span>
      </div>
    </div>

    <div
      v-else
      class="flex flex-1 flex-col items-center justify-center gap-1 py-8 text-center text-sm text-muted"
    >
      <span v-if="ob.selected.value"
        >waiting for a snapshot of {{ shortTicker(ob.selected.value) }}…</span
      >
      <span v-else>no open market tickers for this series yet</span>
      <span class="text-xs opacity-70">{{ ob.frames.value }} frames received</span>
    </div>
  </section>
</template>
