<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'

import { useAuth } from '@/auth/useAuth'
import { apiBase, authConfigError } from '@/config'

const { email, roles, status, logout } = useAuth()
const REQUIRED_ROLE = 'chud-money'
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b border-border bg-surface/80 backdrop-blur">
      <div class="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-3">
        <RouterLink to="/" class="flex items-baseline gap-2 no-underline">
          <span class="text-lg font-semibold tracking-tight">chud money</span>
          <span class="text-xs text-muted">kalshi index feeds</span>
        </RouterLink>
        <div class="flex items-center gap-3">
          <span class="font-mono text-xs text-muted" :title="apiBase">{{ apiBase }}</span>
          <template v-if="status === 'authenticated' || status === 'refreshing'">
            <span
              v-if="!roles.includes(REQUIRED_ROLE)"
              class="badge badge-warn"
              :title="`this account lacks the ${REQUIRED_ROLE} role in Verys`"
            >
              no {{ REQUIRED_ROLE }} role
            </span>
            <span class="text-xs text-muted" :title="email ?? undefined">{{
              email ?? 'signed in'
            }}</span>
            <button class="btn px-2 py-0.5 text-xs" @click="logout()">sign out</button>
          </template>
        </div>
      </div>
    </header>
    <main class="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6">
      <div v-if="authConfigError" class="card mx-auto max-w-md space-y-2">
        <h1 class="text-base font-semibold">Auth is not configured</h1>
        <p class="text-sm text-down">{{ authConfigError }}</p>
        <p class="text-sm text-muted">
          Copy <code>.env.example</code> to <code>.env.local</code> and restart the dev server.
        </p>
      </div>
      <RouterView v-else />
    </main>
  </div>
</template>
