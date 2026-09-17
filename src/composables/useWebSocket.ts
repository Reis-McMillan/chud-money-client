import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

export type WsStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface UseWebSocketOptions<T> {
  /** Called with the JSON-parsed payload of every text frame. */
  onMessage: (frame: T) => void
  onOpen?: () => void
  onClose?: () => void
  /** Reconnect backoff bounds in ms. */
  minDelay?: number
  maxDelay?: number
  /**
   * Resolved, untracked, on every (re)connect and sent as `?access_token=`.
   * Because it is not part of the watched URL, a renewed token never tears
   * down an open socket; only the next connect picks it up.
   */
  token?: () => Promise<string>
}

export interface UseWebSocketReturn {
  status: Ref<WsStatus>
  /** Consecutive failed attempts since the last successful open. */
  attempts: Ref<number>
  lastMessageAt: Ref<number | null>
  /** Frames that were not valid JSON. */
  parseErrors: Ref<number>
  /** Stop for good (until `reconnect()`). */
  close: () => void
  /** Drop the current socket and connect again immediately. */
  reconnect: () => void
}

/**
 * A websocket that reconnects with jittered exponential backoff, follows a
 * reactive URL (tears down and reconnects when it changes), and cleans up
 * when the owning scope is disposed. The proxy needs no subscribe message:
 * connecting is subscribing. The proxy checks the token at upgrade only.
 */
export function useWebSocket<T>(
  url: MaybeRefOrGetter<string | null>,
  opts: UseWebSocketOptions<T>,
): UseWebSocketReturn {
  const minDelay = opts.minDelay ?? 500
  const maxDelay = opts.maxDelay ?? 10_000

  const status = ref<WsStatus>('closed')
  const attempts = ref(0)
  const lastMessageAt = ref<number | null>(null)
  const parseErrors = ref(0)

  let ws: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let closedByUser = false
  /** Bumped by every teardown so a connect still awaiting its token stands down. */
  let generation = 0

  function clearTimer() {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  function teardown() {
    clearTimer()
    generation += 1
    if (ws) {
      const s = ws
      ws = null
      // Detach handlers so a late close event does not schedule a reconnect.
      s.onopen = s.onmessage = s.onerror = s.onclose = null
      if (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING) s.close()
    }
  }

  function scheduleReconnect() {
    const backoff = Math.min(maxDelay, minDelay * 2 ** attempts.value)
    const delay = backoff * (0.75 + Math.random() * 0.5)
    attempts.value += 1
    status.value = 'reconnecting'
    clearTimer()
    timer = setTimeout(() => void connect(), delay)
  }

  async function connect() {
    clearTimer()
    const target = toValue(url)
    if (!target || closedByUser) {
      status.value = 'closed'
      return
    }
    status.value = attempts.value === 0 ? 'connecting' : 'reconnecting'

    let endpoint = target
    if (opts.token) {
      const gen = generation
      let token: string
      try {
        token = await opts.token()
      } catch {
        if (gen === generation && !closedByUser) scheduleReconnect()
        return
      }
      // Torn down, or superseded by a newer connect, while waiting.
      if (gen !== generation || closedByUser) return
      const u = new URL(target)
      u.searchParams.set('access_token', token)
      endpoint = u.toString()
    }

    let socket: WebSocket
    try {
      socket = new WebSocket(endpoint)
    } catch {
      scheduleReconnect()
      return
    }
    ws = socket

    socket.onopen = () => {
      if (ws !== socket) return
      attempts.value = 0
      status.value = 'open'
      opts.onOpen?.()
    }
    socket.onmessage = (ev: MessageEvent) => {
      if (ws !== socket) return
      lastMessageAt.value = Date.now()
      if (typeof ev.data !== 'string') return
      let parsed: T
      try {
        parsed = JSON.parse(ev.data) as T
      } catch {
        parseErrors.value += 1
        return
      }
      opts.onMessage(parsed)
    }
    socket.onerror = () => {
      // The browser always follows an error with a close event.
    }
    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      opts.onClose?.()
      if (closedByUser) {
        status.value = 'closed'
        return
      }
      scheduleReconnect()
    }
  }

  function close() {
    closedByUser = true
    teardown()
    status.value = 'closed'
  }

  function reconnect() {
    closedByUser = false
    teardown()
    attempts.value = 0
    void connect()
  }

  watch(
    () => toValue(url),
    () => {
      teardown()
      attempts.value = 0
      closedByUser = false
      void connect()
    },
    { immediate: true },
  )

  onScopeDispose(close)

  return { status, attempts, lastMessageAt, parseErrors, close, reconnect }
}
