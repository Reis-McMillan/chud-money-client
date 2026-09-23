<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import type { MarketView } from '@/api/types'
import { fmtAgo, fmtUsd } from '@/utils/format'

const props = defineProps<{ market: MarketView }>()
const emit = defineEmits<{ delete: [tag: string] }>()

const feed = computed(() => props.market.feed)
const feedBadge = computed(() => {
  const f = feed.value
  if (!f) return { cls: 'badge-muted', text: 'no feed' }
  if (f.connected) return { cls: 'badge-ok', text: 'connected' }
  return { cls: 'badge-err', text: f.last_error ? 'error' : 'disconnected' }
})
const coinbase = computed(() => feed.value?.coinbase ?? null)
const coinbaseBadge = computed(() => {
  const c = coinbase.value
  if (!c) return null
  if (c.connected) return { cls: 'badge-ok', text: `${c.product} connected` }
  return { cls: 'badge-err', text: `${c.product} ${c.last_error ? 'error' : 'disconnected'}` }
})
const droppedRows = computed(
  () => (feed.value?.dropped_rows ?? 0) + (coinbase.value?.dropped_rows ?? 0),
)

function onDelete(ev: Event) {
  ev.preventDefault()
  ev.stopPropagation()
  emit('delete', props.market.tag)
}
</script>

<template>
  <RouterLink
    :to="{ name: 'market', params: { tag: market.tag } }"
    class="card group relative flex flex-col gap-3 no-underline transition-colors hover:border-accent"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h2 class="truncate text-base font-semibold text-fg">{{ market.title }}</h2>
        <div class="mt-0.5 font-mono text-xs text-muted">
          /{{ market.tag }} · {{ market.series_ticker }} · {{ market.index_id }}
        </div>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        <span class="badge" :class="feedBadge.cls" :title="feed?.last_error ?? undefined">
          {{ feedBadge.text }}
        </span>
        <span
          v-if="coinbaseBadge"
          class="badge"
          :class="coinbaseBadge.cls"
          :title="coinbase?.last_error ?? undefined"
        >
          {{ coinbaseBadge.text }}
        </span>
      </div>
    </div>

    <div class="flex items-baseline justify-between gap-2">
      <span class="font-mono text-2xl tabular-nums">{{ fmtUsd(feed?.last_value) }}</span>
      <span class="text-xs text-muted">{{
        feed?.last_msg_at ? fmtAgo(feed.last_msg_at) : '—'
      }}</span>
    </div>

    <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span>{{ feed?.open_tickers.length ?? 0 }} open</span>
      <span>{{ feed?.ticker_msgs ?? 0 }} ticks</span>
      <span>{{ feed?.contract_ticker_msgs ?? 0 }} contract ticks</span>
      <span>{{ feed?.orderbook_msgs ?? 0 }} book</span>
      <span v-if="coinbase">{{ coinbase.ticker_msgs }} / {{ coinbase.book_msgs }} spot</span>
      <span v-if="feed && feed.reconnects > 0" class="text-warn"
        >{{ feed.reconnects }} reconnects</span
      >
      <span v-if="droppedRows > 0" class="text-down">{{ droppedRows }} rows dropped</span>
      <span class="ml-auto uppercase">{{ market.kalshi.env }}</span>
    </div>

    <button
      type="button"
      class="btn btn-danger absolute top-3 right-3 hidden px-2 py-0.5 text-xs group-hover:inline-flex"
      title="Remove market"
      @click="onDelete"
    >
      remove
    </button>
  </RouterLink>
</template>
