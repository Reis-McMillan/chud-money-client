<script setup lang="ts">
import type { CandleSummary, TableSummary } from '@/api/types'
import { fmtAgo, fmtInt, fmtTs, fmtUsd } from '@/utils/format'

defineProps<{
  live: TableSummary
  hist: TableSummary
  contracts: CandleSummary
  indexId: string
  seriesTicker: string
  refreshing: boolean
  refreshedAt: number | null
}>()
const emit = defineEmits<{ refresh: [] }>()

const tables = [
  { key: 'live', label: 'live', hint: 'ws_5hz' },
  { key: 'hist', label: 'history', hint: 'rest backfill' },
] as const
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

    <div v-for="t in tables" :key="t.key" class="rounded-md border border-border/70 bg-bg/40 p-3">
      <div class="mb-1 flex items-baseline justify-between">
        <span class="text-xs font-semibold tracking-wide uppercase">{{ t.label }}</span>
        <span class="font-mono text-[11px] text-muted"
          >{{ $props[t.key].table }} · {{ t.hint }}</span
        >
      </div>
      <div class="stat-row">
        <span class="text-muted">rows</span>
        <span class="font-mono tabular-nums">{{ fmtInt($props[t.key].rows) }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">rows last hour</span>
        <span class="font-mono tabular-nums">{{ fmtInt($props[t.key].rows_last_hour) }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">first</span>
        <span class="font-mono text-xs tabular-nums">{{ fmtTs($props[t.key].first_ts) }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">last</span>
        <span class="font-mono text-xs tabular-nums">{{ fmtTs($props[t.key].last_ts) }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">last value</span>
        <span class="font-mono tabular-nums">{{ fmtUsd($props[t.key].last_value) }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">min / max</span>
        <span class="font-mono tabular-nums">
          {{ fmtUsd($props[t.key].min_value) }} / {{ fmtUsd($props[t.key].max_value) }}
        </span>
      </div>
    </div>

    <div class="rounded-md border border-border/70 bg-bg/40 p-3">
      <div class="mb-1 flex items-baseline justify-between">
        <span class="text-xs font-semibold tracking-wide uppercase">contracts</span>
        <span class="font-mono text-[11px] text-muted"
          >{{ contracts.table }} · {{ seriesTicker }}</span
        >
      </div>
      <div class="stat-row">
        <span class="text-muted">rows</span>
        <span class="font-mono tabular-nums">{{ fmtInt(contracts.rows) }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">markets</span>
        <span class="font-mono tabular-nums">{{ fmtInt(contracts.markets) }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">first</span>
        <span class="font-mono text-xs tabular-nums">{{ fmtTs(contracts.first_ts) }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">last</span>
        <span class="font-mono text-xs tabular-nums">{{ fmtTs(contracts.last_ts) }}</span>
      </div>
    </div>
  </section>
</template>
