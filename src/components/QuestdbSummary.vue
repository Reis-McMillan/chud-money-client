<script setup lang="ts">
import { computed } from 'vue'

import type { SummarySnapshot, TableSummary } from '@/api/types'
import { fmtAgo, fmtInt, fmtTs } from '@/utils/format'

const props = defineProps<{
  /** The backend's cached summaries; `tables` is null until its first refresh. */
  snapshot: SummarySnapshot
  indexId: string
  seriesTicker: string
  coinbaseProduct?: string
  refreshing: boolean
  /** When this page last fetched the snapshot (not when the backend computed it). */
  refreshedAt: number | null
}>()
const emit = defineEmits<{ refresh: [] }>()

interface Card {
  label: string
  hint: string
  summary: TableSummary
}

/** One card per table, in the order the data flows: index, contracts, Kalshi, Coinbase. */
const cards = computed<Card[]>(() => {
  const t = props.snapshot.tables
  if (!t) return []
  const out: Card[] = [
    { label: 'live', hint: 'ws_5hz', summary: t.live },
    { label: 'history', hint: 'rest backfill', summary: t.hist },
    { label: 'contracts', hint: props.seriesTicker, summary: t.contracts },
    { label: 'kalshi ticker', hint: props.seriesTicker, summary: t.contract_ticker },
    { label: 'kalshi book', hint: props.seriesTicker, summary: t.contract_book },
  ]
  const product = props.coinbaseProduct ?? '?'
  if (t.coinbase_ticker)
    out.push({ label: 'coinbase ticker', hint: product, summary: t.coinbase_ticker })
  if (t.coinbase_book) out.push({ label: 'coinbase book', hint: product, summary: t.coinbase_book })
  return out
})
</script>

<template>
  <section class="card flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold">QuestDB</h3>
        <div class="font-mono text-xs text-muted">index_id = {{ indexId }}</div>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="refreshedAt" class="text-xs text-muted">{{ fmtAgo(refreshedAt) }}</span>
        <button
          type="button"
          class="btn px-2 py-1 text-xs"
          :disabled="refreshing"
          @click="emit('refresh')"
        >
          {{ refreshing ? 'refreshing…' : 'refresh' }}
        </button>
      </div>
    </div>

    <!-- The backend recomputes these about once a minute; say how old they are. -->
    <div class="text-xs text-muted">
      <template v-if="snapshot.refreshed_at">counted {{ fmtAgo(snapshot.refreshed_at) }}</template>
      <template v-else>waiting for the first count since the feed started…</template>
    </div>
    <div v-if="snapshot.error" class="text-xs text-down">
      last count failed: {{ snapshot.error }}
      <template v-if="snapshot.tables"> (showing the previous one)</template>
    </div>

    <div
      v-for="c in cards"
      :key="c.summary.table"
      class="rounded-md border border-border/70 bg-bg/40 p-3"
    >
      <div class="mb-1 flex items-baseline justify-between">
        <span class="text-xs font-semibold tracking-wide uppercase">{{ c.label }}</span>
        <span class="font-mono text-[11px] text-muted">{{ c.summary.table }} · {{ c.hint }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">rows</span>
        <span class="font-mono tabular-nums">{{ fmtInt(c.summary.rows) }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">first</span>
        <span class="font-mono text-xs tabular-nums">{{ fmtTs(c.summary.first_ts) }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">last</span>
        <span class="font-mono text-xs tabular-nums">{{ fmtTs(c.summary.last_ts) }}</span>
      </div>
    </div>
  </section>
</template>
