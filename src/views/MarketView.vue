<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { ApiError, api, errorMessage } from '@/api/client'
import type { MarketDetail } from '@/api/types'
import IngestPanel from '@/components/IngestPanel.vue'
import OrderbookPanel from '@/components/OrderbookPanel.vue'
import QuestdbSummary from '@/components/QuestdbSummary.vue'
import TickerPanel from '@/components/TickerPanel.vue'
import { wsUrl } from '@/config'

const props = defineProps<{ tag: string }>()

const detail = ref<MarketDetail | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const refreshedAt = ref<number | null>(null)
const error = ref<string | null>(null)
const notFound = ref(false)

let abort: AbortController | null = null

async function load(initial: boolean) {
  abort?.abort()
  abort = new AbortController()
  if (initial) {
    loading.value = true
    detail.value = null
    notFound.value = false
  } else {
    refreshing.value = true
  }
  try {
    const d = await api.getMarket(props.tag, abort.signal)
    detail.value = d
    error.value = null
    refreshedAt.value = Date.now()
    if (import.meta.env.DEV) {
      const expected = wsUrl(d.market.tag, 'ticker')
      if (d.market.proxy.ticker_ws !== expected) {
        console.warn(
          `stored proxy url ${d.market.proxy.ticker_ws} differs from derived ${expected}; using derived`,
        )
      }
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    if (e instanceof ApiError && e.isNotFound) notFound.value = true
    else error.value = errorMessage(e)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

watch(
  () => props.tag,
  () => void load(true),
  { immediate: true },
)

// Open markets roll every 15 minutes and the QuestDB summary is a point-in-time
// read, so keep the detail fresh in the background.
const REFRESH_MS = 30_000
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (detail.value && !refreshing.value) void load(false)
  }, REFRESH_MS)
})
onBeforeUnmount(() => {
  abort?.abort()
  if (timer !== undefined) clearInterval(timer)
})

const openTickers = computed(() => detail.value?.feed?.open_tickers ?? [])
</script>

<template>
  <div class="flex flex-col gap-4">
    <nav class="flex items-center gap-2 text-sm text-muted">
      <RouterLink to="/" class="hover:text-fg">markets</RouterLink>
      <span>/</span>
      <span class="font-mono text-fg">{{ tag }}</span>
    </nav>

    <div v-if="loading" class="text-sm text-muted">Loading…</div>

    <div v-else-if="notFound" class="card flex flex-col items-center gap-2 py-12 text-center">
      <p>
        No market with tag <span class="font-mono">{{ tag }}</span
        >.
      </p>
      <RouterLink to="/" class="btn">back to markets</RouterLink>
    </div>

    <div v-else-if="error && !detail" class="card flex flex-col items-start gap-2">
      <p class="text-sm text-down">{{ error }}</p>
      <p class="text-xs text-muted">
        The market page needs QuestDB for its summary; a "questdb query failed" error usually means
        it is down.
      </p>
      <button type="button" class="btn" @click="load(true)">retry</button>
    </div>

    <template v-else-if="detail">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 class="text-xl font-semibold">{{ detail.market.title }}</h1>
          <div class="font-mono text-xs text-muted">
            {{ detail.market.series_ticker }} · {{ detail.market.index_id }} ·
            {{ detail.market.kalshi.env }}
            <template v-if="detail.feed">
              · feed {{ detail.feed.connected ? 'connected' : 'disconnected' }}
              <span v-if="detail.feed.reconnects" class="text-warn"
                >· {{ detail.feed.reconnects }} reconnects</span
              >
            </template>
            <span v-else class="text-warn">· no feed task running</span>
          </div>
          <div v-if="detail.feed?.last_error" class="mt-1 text-xs text-down">
            {{ detail.feed.last_error }}
          </div>
        </div>
        <div v-if="error" class="text-xs text-down">refresh failed: {{ error }}</div>
      </div>

      <TickerPanel
        :tag="detail.market.tag"
        :index-id="detail.market.index_id"
        :feed="detail.feed"
      />

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <OrderbookPanel :tag="detail.market.tag" :open-tickers="openTickers" />
        <QuestdbSummary
          :live="detail.questdb.live"
          :hist="detail.questdb.hist"
          :index-id="detail.market.index_id"
          :refreshing="refreshing"
          :refreshed-at="refreshedAt"
          @refresh="load(false)"
        />
        <IngestPanel :tag="detail.market.tag" @done="load(false)" />
      </div>
    </template>
  </div>
</template>
