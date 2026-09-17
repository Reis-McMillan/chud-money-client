<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  CallbackError,
  JwksError,
  MissingCodeError,
  MissingStateError,
  NonceError,
  TokenError,
} from 'verys-js-client'

import { AuthCallbackError, useAuth } from '@/auth/useAuth'
import { parseTokenError } from '@/auth/verys'

const router = useRouter()
const { completeCallback, login, requestConsent } = useAuth()

const error = ref<string | null>(null)
const consentFlow = ref(false)

/** Only same-origin paths, and never back into the callback itself. */
function safeReturnTo(path: string): string {
  const ok = path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/auth/callback')
  return ok ? path : '/'
}

function describe(e: unknown): string {
  if (e instanceof AuthCallbackError) {
    if (e.flow === 'consent' && e.error === 'access_denied') {
      return 'Consent for chud money was declined, so its data cannot be loaded.'
    }
    return `Verys returned "${e.error}"${e.description ? `: ${e.description}` : ''}.`
  }
  if (e instanceof CallbackError) return `Verys returned "${e.message}".`
  if (e instanceof MissingCodeError || e instanceof MissingStateError) {
    return 'The callback URL is missing its code or state; open the app and sign in again.'
  }
  if (e instanceof NonceError) return 'The ID token nonce did not match; sign in again.'
  if (e instanceof JwksError) return 'Could not fetch the Verys signing key.'
  if (e instanceof TokenError) {
    const oauth = parseTokenError(e)
    return oauth
      ? `Verys rejected the sign-in: ${oauth.error}${oauth.description ? ` (${oauth.description})` : ''}.`
      : `Verys rejected the sign-in: ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}

onMounted(async () => {
  try {
    const { returnTo } = await completeCallback(window.location.search)
    await router.replace(safeReturnTo(returnTo))
  } catch (e) {
    consentFlow.value = e instanceof AuthCallbackError && e.flow === 'consent'
    error.value = describe(e)
  }
})
</script>

<template>
  <div class="mx-auto max-w-md">
    <div v-if="error" class="card space-y-3">
      <h1 class="text-base font-semibold">
        {{ consentFlow ? 'Consent not granted' : 'Sign-in failed' }}
      </h1>
      <p class="text-sm text-down">{{ error }}</p>
      <div class="flex gap-2">
        <button v-if="consentFlow" class="btn btn-primary" @click="requestConsent('/')">
          Try again
        </button>
        <button class="btn" @click="login('/')">Sign in again</button>
      </div>
    </div>
    <p v-else class="text-sm text-muted">Completing sign-in…</p>
  </div>
</template>
