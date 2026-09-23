<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { ApiError, api, errorMessage } from '@/api/client'
import type { AddMarketBody, KalshiEnv, MarketView } from '@/api/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; added: [market: MarketView] }>()

const TAG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/
const SERIES_RE = /^[A-Z0-9]+$/
const INDEX_RE = /^[A-Z0-9_]+$/
const PRODUCT_RE = /^[A-Z0-9]+-[A-Z0-9]+$/
const RESERVED = new Set(['add', 'ingest', 'ws'])

const dialog = ref<HTMLDialogElement | null>(null)
const form = reactive({
  tag: '',
  series_ticker: '',
  index_id: '',
  coinbase_product: '',
  title: '',
  kalshi_env: '' as '' | KalshiEnv,
})
const submitting = ref(false)
const error = ref<string | null>(null)
const details = ref<string[]>([])

const problems = computed(() => {
  const out: string[] = []
  if (!TAG_RE.test(form.tag)) out.push('tag: lowercase letters, digits and dashes, 2 to 64 chars')
  else if (RESERVED.has(form.tag)) out.push(`tag: "${form.tag}" is reserved`)
  if (!SERIES_RE.test(form.series_ticker)) out.push('series ticker: uppercase letters and digits')
  if (!INDEX_RE.test(form.index_id)) out.push('index id: uppercase letters, digits and underscores')
  if (form.coinbase_product && !PRODUCT_RE.test(form.coinbase_product)) {
    out.push('coinbase product: an id like BTC-USD')
  }
  if (form.title.length > 200) out.push('title: at most 200 chars')
  return out
})
const canSubmit = computed(() => problems.value.length === 0 && !submitting.value)

watch(
  () => props.open,
  (open) => {
    const d = dialog.value
    if (!d) return
    if (open && !d.open) {
      reset()
      d.showModal()
    } else if (!open && d.open) {
      d.close()
    }
  },
)

function reset() {
  form.tag = ''
  form.series_ticker = ''
  form.index_id = ''
  form.coinbase_product = ''
  form.title = ''
  form.kalshi_env = ''
  error.value = null
  details.value = []
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = null
  details.value = []
  const body: AddMarketBody = {
    tag: form.tag,
    series_ticker: form.series_ticker,
    index_id: form.index_id,
  }
  if (form.coinbase_product) body.coinbase_product = form.coinbase_product
  if (form.title.trim()) body.title = form.title.trim()
  if (form.kalshi_env) body.kalshi_env = form.kalshi_env
  try {
    const created = await api.addMarket(body)
    emit('added', created)
    emit('close')
  } catch (e) {
    error.value = errorMessage(e)
    if (e instanceof ApiError && e.details) details.value = e.details
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-full max-w-md rounded-lg border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60"
    @close="emit('close')"
    @cancel.prevent="emit('close')"
  >
    <form class="flex flex-col gap-4 p-5" @submit.prevent="submit">
      <div>
        <h2 class="text-lg font-semibold">Add market</h2>
        <p class="mt-1 text-sm text-muted">
          Registers a Kalshi series and starts streaming its index and orderbooks.
        </p>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="sm:col-span-2">
          <span class="label">tag</span>
          <input
            v-model.trim="form.tag"
            class="input"
            placeholder="btc-15m"
            autocomplete="off"
            spellcheck="false"
            required
          />
        </label>
        <label>
          <span class="label">series ticker</span>
          <input
            v-model.trim="form.series_ticker"
            class="input uppercase"
            placeholder="KXBTC15M"
            autocomplete="off"
            spellcheck="false"
            required
            @input="form.series_ticker = form.series_ticker.toUpperCase()"
          />
        </label>
        <label>
          <span class="label">index id</span>
          <input
            v-model.trim="form.index_id"
            class="input uppercase"
            placeholder="BRTI"
            autocomplete="off"
            spellcheck="false"
            required
            @input="form.index_id = form.index_id.toUpperCase()"
          />
        </label>
        <label>
          <span class="label"
            >coinbase product <span class="normal-case opacity-60">(optional)</span></span
          >
          <input
            v-model.trim="form.coinbase_product"
            class="input uppercase"
            placeholder="BTC-USD"
            autocomplete="off"
            spellcheck="false"
            @input="form.coinbase_product = form.coinbase_product.toUpperCase()"
          />
        </label>
        <label class="sm:col-span-2">
          <span class="label">title <span class="normal-case opacity-60">(optional)</span></span>
          <input v-model="form.title" class="input font-sans" placeholder="KXBTC15M (BRTI)" />
        </label>
        <label class="sm:col-span-2">
          <span class="label"
            >kalshi env <span class="normal-case opacity-60">(optional)</span></span
          >
          <select v-model="form.kalshi_env" class="input">
            <option value="">server default</option>
            <option value="prod">prod</option>
            <option value="demo">demo</option>
          </select>
        </label>
      </div>

      <ul
        v-if="form.tag || form.series_ticker || form.index_id"
        class="space-y-0.5 text-xs text-warn"
      >
        <li v-for="p in problems" :key="p">{{ p }}</li>
      </ul>

      <div v-if="error" class="rounded-md border border-down/50 bg-down/10 p-3 text-sm text-down">
        <div>{{ error }}</div>
        <ul v-if="details.length" class="mt-1 list-disc pl-5 text-xs opacity-90">
          <li v-for="d in details" :key="d">{{ d }}</li>
        </ul>
      </div>

      <div class="flex justify-end gap-2">
        <button type="button" class="btn" :disabled="submitting" @click="emit('close')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="!canSubmit">
          {{ submitting ? 'Adding…' : 'Add market' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
