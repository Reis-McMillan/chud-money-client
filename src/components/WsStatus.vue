<script setup lang="ts">
import { computed } from 'vue'

import type { WsStatus } from '@/composables/useWebSocket'

const props = defineProps<{
  status: WsStatus
  attempts?: number
  label?: string
}>()

const cls = computed(() => {
  switch (props.status) {
    case 'open':
      return 'badge-ok'
    case 'connecting':
    case 'reconnecting':
      return 'badge-warn'
    default:
      return 'badge-muted'
  }
})

const text = computed(() => {
  if (props.status === 'reconnecting' && props.attempts) return `reconnecting (${props.attempts})`
  return props.status
})
</script>

<template>
  <span class="badge" :class="cls" :title="label">
    <span
      class="inline-block size-1.5 rounded-full bg-current"
      :class="{ 'animate-pulse': status !== 'open' && status !== 'closed' }"
    />
    <span v-if="label" class="opacity-70">{{ label }}</span>
    {{ text }}
  </span>
</template>
