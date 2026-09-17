import { createRouter, createWebHistory } from 'vue-router'

import { useAuth } from '@/auth/useAuth'
import { authConfigError } from '@/config'

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without a Verys session. */
    public?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    {
      path: '/m/:tag',
      name: 'market',
      component: () => import('@/views/MarketView.vue'),
      props: true,
    },
    {
      // Fixed by verys-js-client: the redirect URI is always `${host}/auth/callback`.
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('@/views/AuthCallbackView.vue'),
      meta: { public: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// Everything but the callback needs a Verys session; `login` navigates away
// and never resolves, so the pending navigation is simply abandoned.
router.beforeEach(async (to) => {
  if (to.meta.public) return true
  // Misconfigured: let App.vue show the problem instead of redirecting.
  if (authConfigError) return true
  const { isAuthenticated, login } = useAuth()
  if (isAuthenticated.value) return true
  await login(to.fullPath)
  return false
})

export default router
