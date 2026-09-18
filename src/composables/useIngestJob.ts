import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

import { ApiError, api, errorMessage } from '@/api/client'
import type { IngestBody, IngestJob, IngestKind } from '@/api/types'

const POLL_MS = 1_500

// `index` keeps the key it had before kinds existed.
function storageKey(tag: string, kind: IngestKind) {
  return kind === 'index' ? `chud.ingest.${tag}` : `chud.ingest.${tag}.${kind}`
}

function readStored(tag: string, kind: IngestKind): string | null {
  try {
    return localStorage.getItem(storageKey(tag, kind))
  } catch {
    return null
  }
}

function writeStored(tag: string, kind: IngestKind, jobId: string | null) {
  try {
    if (jobId) localStorage.setItem(storageKey(tag, kind), jobId)
    else localStorage.removeItem(storageKey(tag, kind))
  } catch {
    // storage unavailable; the job just will not survive a reload
  }
}

/**
 * Submit and track one ingest job per market tag and kind. The backend keeps jobs in
 * memory only, so the job id is remembered in localStorage and a 404 on
 * refresh means the backend restarted.
 */
export function useIngestJob(tag: MaybeRefOrGetter<string>, kind: IngestKind = 'index') {
  const job = ref<IngestJob | null>(null)
  const submitting = ref(false)
  const error = ref<string | null>(null)
  const staleNotice = ref<string | null>(null)

  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0

  function stopPolling() {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  async function refresh(jobId: string, gen: number) {
    try {
      const j = await api.getIngestJob(jobId)
      if (gen !== generation) return
      job.value = j
      if (j.status === 'running') {
        stopPolling()
        timer = setTimeout(() => void refresh(jobId, gen), POLL_MS)
      }
    } catch (e) {
      if (gen !== generation) return
      if (e instanceof ApiError && e.isNotFound) {
        // Backend restarted and forgot the job.
        job.value = null
        writeStored(toValue(tag), kind, null)
        staleNotice.value = 'Previous job is no longer known to the backend (it likely restarted).'
      } else {
        error.value = errorMessage(e)
        stopPolling()
        timer = setTimeout(() => void refresh(jobId, gen), POLL_MS * 2)
      }
    }
  }

  function init() {
    generation += 1
    stopPolling()
    job.value = null
    error.value = null
    staleNotice.value = null
    const stored = readStored(toValue(tag), kind)
    if (stored) void refresh(stored, generation)
  }

  async function start(body: Omit<IngestBody, 'tag' | 'kind'>) {
    const t = toValue(tag)
    error.value = null
    staleNotice.value = null
    submitting.value = true
    try {
      const accepted = await api.startIngest({ tag: t, kind, ...body })
      writeStored(t, kind, accepted.job_id)
      generation += 1
      stopPolling()
      await refresh(accepted.job_id, generation)
    } catch (e) {
      error.value = errorMessage(e)
    } finally {
      submitting.value = false
    }
  }

  function clear() {
    generation += 1
    stopPolling()
    job.value = null
    error.value = null
    staleNotice.value = null
    writeStored(toValue(tag), kind, null)
  }

  const progress = computed(() => {
    const j = job.value
    if (!j) return 0
    // A contracts job works market by market; its cursor only moves with them.
    if (j.kind === 'contracts' && j.markets_total > 0) {
      return Math.min(1, j.markets_done / j.markets_total)
    }
    const span = j.end_ms - j.start_ms
    if (span <= 0) return j.status === 'done' ? 1 : 0
    return Math.min(1, Math.max(0, (j.cursor_ms - j.start_ms) / span))
  })

  watch(() => toValue(tag), init, { immediate: true })
  onScopeDispose(stopPolling)

  return { job, progress, submitting, error, staleNotice, start, clear }
}
