<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

import { useIngestJob } from '@/composables/useIngestJob'
import { fmtInt, fmtTs } from '@/utils/format'
import { localToRfc3339, toDatetimeLocal } from '@/utils/time'

const props = defineProps<{ tag: string }>()
const emit = defineEmits<{ done: [] }>()

const ingest = useIngestJob(() => props.tag)

const now = new Date()
const form = reactive({
  start: toDatetimeLocal(new Date(now.getTime() - 24 * 3600 * 1000)),
  end: toDatetimeLocal(now),
})

const problems = computed(() => {
  const out: string[] = []
  const s = localToRfc3339(form.start)
  const e = localToRfc3339(form.end)
  if (!s) out.push('start is not a valid time')
  if (!e) out.push('end is not a valid time')
  if (s && e && e <= s) out.push('end must be after start')
  return out
})

const running = computed(() => ingest.job.value?.status === 'running')
const canSubmit = computed(
  () => problems.value.length === 0 && !ingest.submitting.value && !running.value,
)

const rangeHint = computed(() => {
  const s = localToRfc3339(form.start)
  const e = localToRfc3339(form.end)
  if (!s || !e) return null
  const ms = new Date(e).getTime() - new Date(s).getTime()
  if (ms <= 0) return null
  const hours = ms / 3_600_000
  return hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(1)} hours`
})

const statusBadge = computed(() => {
  switch (ingest.job.value?.status) {
    case 'running':
      return 'badge-warn'
    case 'done':
      return 'badge-ok'
    case 'failed':
      return 'badge-err'
    default:
      return 'badge-muted'
  }
})

watch(
  () => ingest.job.value?.status,
  (status, prev) => {
    if (prev === 'running' && status === 'done') emit('done')
  },
)

function submit() {
  if (!canSubmit.value) return
  const start = localToRfc3339(form.start)
  const end = localToRfc3339(form.end)
  if (!start || !end) return
  void ingest.start({ start, end })
}
</script>

<template>
  <section class="card flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold">Ingest history</h3>
      <span class="text-xs text-muted">REST backfill into index_values_hist</span>
    </div>

    <form class="flex flex-col gap-3" @submit.prevent="submit">
      <label>
        <span class="label">start <span class="normal-case opacity-60">(local time)</span></span>
        <input v-model="form.start" type="datetime-local" step="1" class="input" required />
      </label>
      <label>
        <span class="label">end <span class="normal-case opacity-60">(local time)</span></span>
        <input v-model="form.end" type="datetime-local" step="1" class="input" required />
      </label>
      <p class="text-[11px] text-muted">
        <span v-if="rangeHint">range: {{ rangeHint }} · </span>
        fetched one hour per request at the finest resolution the upstream offers, stepping from the
        start (aligned to the hour) until the end.
      </p>

      <ul v-if="problems.length" class="space-y-0.5 text-xs text-warn">
        <li v-for="p in problems" :key="p">{{ p }}</li>
      </ul>

      <button type="submit" class="btn btn-primary justify-center" :disabled="!canSubmit">
        <template v-if="ingest.submitting.value">Submitting…</template>
        <template v-else-if="running">Job running…</template>
        <template v-else>Start ingest</template>
      </button>
    </form>

    <div
      v-if="ingest.error.value"
      class="rounded-md border border-down/50 bg-down/10 p-3 text-sm text-down"
    >
      {{ ingest.error.value }}
    </div>
    <div v-if="ingest.staleNotice.value" class="text-xs text-muted">
      {{ ingest.staleNotice.value }}
    </div>

    <div v-if="ingest.job.value" class="rounded-md border border-border/70 bg-bg/40 p-3 text-sm">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="badge" :class="statusBadge">{{ ingest.job.value.status }}</span>
        <span class="truncate font-mono text-[11px] text-muted" :title="ingest.job.value.job_id">
          {{ ingest.job.value.job_id }}
        </span>
        <button
          type="button"
          class="btn px-2 py-0.5 text-xs"
          :disabled="running"
          @click="ingest.clear()"
        >
          dismiss
        </button>
      </div>

      <div class="mb-2 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          class="h-full rounded-full transition-[width] duration-500"
          :class="ingest.job.value.status === 'failed' ? 'bg-down' : 'bg-accent'"
          :style="{ width: `${ingest.progress.value * 100}%` }"
        />
      </div>

      <div class="stat-row">
        <span class="text-muted">progress</span>
        <span class="font-mono tabular-nums">{{ (ingest.progress.value * 100).toFixed(1) }}%</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">timespan</span>
        <span class="font-mono">{{ ingest.job.value.timespan }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">requests / rows</span>
        <span class="font-mono tabular-nums">
          {{ fmtInt(ingest.job.value.requests) }} / {{ fmtInt(ingest.job.value.rows) }}
        </span>
      </div>
      <div class="stat-row">
        <span class="text-muted">cursor</span>
        <span class="font-mono text-xs tabular-nums">{{
          fmtTs(new Date(ingest.job.value.cursor_ms).toISOString())
        }}</span>
      </div>
      <div class="stat-row">
        <span class="text-muted">started</span>
        <span class="font-mono text-xs tabular-nums">{{ fmtTs(ingest.job.value.started_at) }}</span>
      </div>
      <div v-if="ingest.job.value.finished_at" class="stat-row">
        <span class="text-muted">finished</span>
        <span class="font-mono text-xs tabular-nums">{{
          fmtTs(ingest.job.value.finished_at)
        }}</span>
      </div>
      <div v-if="ingest.job.value.error" class="mt-2 text-xs break-words text-down">
        {{ ingest.job.value.error }}
      </div>
    </div>
  </section>
</template>
