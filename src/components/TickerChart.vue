<script setup lang="ts">
import { computed } from 'vue'

import { WINDOW_MS, type TickPoint } from '@/composables/useTicker'
import { fmtTime, fmtUsd } from '@/utils/format'

const props = defineProps<{
  points: readonly TickPoint[]
  /** Settlement target to draw as a reference line, if known. */
  target?: number | null
  /** Epoch ms of the current market's open, drawn as a marker when in view. */
  openAt?: number | null
  /** Epoch ms of the current market's close, drawn as a marker when in view. */
  closeAt?: number | null
}>()

const W = 1000
const H = 300
const PAD = { top: 12, right: 92, bottom: 22, left: 8 }
const UP = '#3fb950'
const DOWN = '#f85149'
const TARGET = '#5b9cff'

const geometry = computed(() => {
  const pts = props.points
  if (pts.length < 2) return null

  const first = pts[0]
  const last = pts[pts.length - 1]
  if (!first || !last) return null

  let min = Infinity
  let max = -Infinity
  for (const p of pts) {
    if (p.v < min) min = p.v
    if (p.v > max) max = p.v
  }
  // Keep the target in frame so its line is always visible.
  const target = props.target ?? null
  if (target != null && Number.isFinite(target)) {
    if (target < min) min = target
    if (target > max) max = target
  }
  // Give a flat line some breathing room.
  const span = max - min || Math.max(Math.abs(max) * 0.0005, 0.01)
  min -= span * 0.1
  max += span * 0.1

  // Fixed trailing window so the x axis always spans WINDOW_MS.
  const t1 = last.t
  const t0 = t1 - WINDOW_MS
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * iw
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * ih
  const baseline = PAD.top + ih

  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(' ')
  const area = `${path} L${x(last.t).toFixed(1)},${baseline.toFixed(1)} L${x(first.t).toFixed(1)},${baseline.toFixed(1)} Z`

  // Colour by position relative to the target when there is one, else by trend.
  const rising = target != null ? last.v >= target : last.v >= first.v
  const color = rising ? UP : DOWN
  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: PAD.top + f * ih,
    value: max - f * (max - min),
  }))

  const marker = (t: number | null | undefined, label: string) =>
    t != null && t >= t0 && t <= t1 ? { x: x(t), label } : null

  return {
    path,
    area,
    color,
    lastX: x(last.t),
    lastY: y(last.v),
    lastLabel: fmtUsd(last.v),
    targetY: target != null ? y(target) : null,
    targetLabel: target != null ? fmtUsd(target) : '',
    openMarker: marker(props.openAt, 'open'),
    closeMarker: marker(props.closeAt, 'close'),
    gridlines,
    t0Label: fmtTime(t0),
    t1Label: fmtTime(t1),
    baseline,
  }
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${H}`"
    preserveAspectRatio="none"
    class="block h-full w-full"
    role="img"
    aria-label="Live index value"
  >
    <template v-if="geometry">
      <defs>
        <linearGradient id="tick-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" :stop-color="geometry.color" stop-opacity="0.28" />
          <stop offset="1" :stop-color="geometry.color" stop-opacity="0" />
        </linearGradient>
      </defs>

      <g v-for="g in geometry.gridlines" :key="g.y">
        <line
          :x1="PAD.left"
          :x2="W - PAD.right"
          :y1="g.y"
          :y2="g.y"
          stroke="#2a2f3a"
          stroke-width="1"
        />
        <text
          :x="W - PAD.right + 6"
          :y="g.y + 4"
          fill="#8b93a7"
          font-size="12"
          font-family="ui-monospace, Menlo, monospace"
        >
          {{ fmtUsd(g.value) }}
        </text>
      </g>

      <g v-for="m in [geometry.openMarker, geometry.closeMarker]" :key="m?.label ?? ''">
        <template v-if="m">
          <line
            :x1="m.x"
            :x2="m.x"
            :y1="PAD.top"
            :y2="geometry.baseline"
            stroke="#8b93a7"
            stroke-width="1"
            stroke-dasharray="2 4"
            vector-effect="non-scaling-stroke"
          />
          <text
            :x="m.x + 4"
            :y="PAD.top + 12"
            fill="#8b93a7"
            font-size="11"
            font-family="ui-monospace, Menlo, monospace"
          >
            {{ m.label }}
          </text>
        </template>
      </g>

      <path :d="geometry.area" fill="url(#tick-fill)" />
      <path
        :d="geometry.path"
        fill="none"
        :stroke="geometry.color"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />

      <template v-if="geometry.targetY != null">
        <line
          :x1="PAD.left"
          :x2="W - PAD.right"
          :y1="geometry.targetY"
          :y2="geometry.targetY"
          :stroke="TARGET"
          stroke-width="1.5"
          stroke-dasharray="8 4"
          vector-effect="non-scaling-stroke"
        />
        <rect
          :x="W - PAD.right + 2"
          :y="geometry.targetY - 10"
          :width="PAD.right - 4"
          height="20"
          rx="3"
          :fill="TARGET"
        />
        <text
          :x="W - PAD.right + 6"
          :y="geometry.targetY + 4"
          fill="#0f1115"
          font-size="12"
          font-weight="600"
          font-family="ui-monospace, Menlo, monospace"
        >
          {{ geometry.targetLabel }}
        </text>
      </template>

      <line
        :x1="PAD.left"
        :x2="W - PAD.right"
        :y1="geometry.lastY"
        :y2="geometry.lastY"
        :stroke="geometry.color"
        stroke-width="1"
        stroke-dasharray="4 4"
        opacity="0.6"
      />
      <circle :cx="geometry.lastX" :cy="geometry.lastY" r="4" :fill="geometry.color" />
      <rect
        :x="W - PAD.right + 2"
        :y="geometry.lastY - 10"
        :width="PAD.right - 4"
        height="20"
        rx="3"
        :fill="geometry.color"
      />
      <text
        :x="W - PAD.right + 6"
        :y="geometry.lastY + 4"
        fill="#0f1115"
        font-size="12"
        font-weight="600"
        font-family="ui-monospace, Menlo, monospace"
      >
        {{ geometry.lastLabel }}
      </text>

      <text
        :x="PAD.left"
        :y="H - 6"
        fill="#8b93a7"
        font-size="11"
        font-family="ui-monospace, Menlo, monospace"
      >
        {{ geometry.t0Label }}
      </text>
      <text
        :x="W - PAD.right"
        :y="H - 6"
        fill="#8b93a7"
        font-size="11"
        text-anchor="end"
        font-family="ui-monospace, Menlo, monospace"
      >
        {{ geometry.t1Label }}
      </text>
    </template>
    <text v-else :x="W / 2" :y="H / 2" fill="#8b93a7" font-size="16" text-anchor="middle">
      waiting for ticks…
    </text>
  </svg>
</template>
