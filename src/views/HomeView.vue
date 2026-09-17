<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { api, errorMessage } from '@/api/client'
import type { MarketView } from '@/api/types'
import AddMarketDialog from '@/components/AddMarketDialog.vue'
import MarketCard from '@/components/MarketCard.vue'

const REFRESH_MS = 5_000

const markets = ref<MarketView[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const dialogOpen = ref(false)
const removing = ref<string | null>(null)

let abort: AbortController | null = null
let timer: ReturnType<typeof setInterval> | undefined

async function load(initial = false) {
  abort?.abort()
  abort = new AbortController()
  if (initial) loading.value = true
  try {
    markets.value = await api.listMarkets(abort.signal)
    error.value = null
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    error.value = errorMessage(e)
  } finally {
    if (initial) loading.value = false
  }
}

function onAdded(m: MarketView) {
  markets.value = [m, ...markets.value.filter((x) => x.tag !== m.tag)]
}

async function onDelete(tag: string) {
  if (!confirm(`Remove market "${tag}"? The feed stops; QuestDB rows are kept.`)) return
  removing.value = tag
  try {
    await api.deleteMarket(tag)
    markets.value = markets.value.filter((m) => m.tag !== tag)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    removing.value = null
  }
}

onMounted(() => {
  void load(true)
  timer = setInterval(() => void load(), REFRESH_MS)
})
onBeforeUnmount(() => {
  abort?.abort()
  if (timer !== undefined) clearInterval(timer)
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">Markets</h1>
        <p class="text-sm text-muted">Tracked Kalshi series and their live feeds.</p>
      </div>
      <button type="button" class="btn btn-primary" @click="dialogOpen = true">+ Add market</button>
    </div>

    <div v-if="error" class="rounded-md border border-down/50 bg-down/10 p-3 text-sm text-down">
      {{ error }}
      <button type="button" class="btn ml-3 px-2 py-0.5 text-xs" @click="load(true)">retry</button>
    </div>

    <div v-if="loading" class="text-sm text-muted">Loading…</div>

    <div
      v-else-if="markets.length === 0 && !error"
      class="card flex flex-col items-center gap-2 py-12 text-center"
    >
      <p class="text-muted">No markets yet.</p>
      <button type="button" class="btn btn-primary" @click="dialogOpen = true">
        Add your first market
      </button>
    </div>

    <div v-else class="flex flex-wrap gap-4">
      <MarketCard
        v-for="m in markets"
        :key="m.tag"
        :market="m"
        class="max-w-sm grow basis-72"
        :class="{ 'opacity-50': removing === m.tag }"
        @delete="onDelete"
      />
    </div>

    <AddMarketDialog :open="dialogOpen" @close="dialogOpen = false" @added="onAdded" />
  </div>
</template>
