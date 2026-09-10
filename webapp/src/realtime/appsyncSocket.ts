/**
 * A minimal client for AppSync's realtime protocol.
 *
 * Hand-rolled, and not for want of trying a library first: **AppSync does not speak
 * `graphql-transport-ws`**. It refuses that subprotocol outright, which rules out Apollo's
 * `GraphQLWsLink` and every client built on it. AppSync's protocol is negotiated as `graphql-ws`
 * but is AWS's own — auth in a base64 query parameter, then
 * `connection_init` → `connection_ack` → `start` → `start_ack` → `data`.
 *
 * It is also deliberately NOT an Apollo link. The only thing this subscription carries is a list of
 * dates, and the only response is to evict cache entries — no component renders it, nothing calls
 * `useSubscription`. Routing it through Apollo's subscription machinery would add link ordering and
 * a lifecycle to manage in exchange for nothing.
 */

/** Milliseconds. AppSync reports `connectionTimeoutMs: 300000`; it closes an idle socket. */
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

export interface AppSyncSocketOptions {
  /** The HTTP GraphQL endpoint. The realtime URL is derived from it — see below. */
  readonly httpEndpoint: string
  /** Fetched per connection, never cached: a reconnect after a long sleep needs a fresh token. */
  readonly token: () => Promise<string | null>
  readonly query: string
  readonly onData: (payload: unknown) => void
  /**
   * Called once the subscription is live again after a drop. A subscription cannot outlive its
   * connection and AppSync does not replay: anything published while disconnected is simply lost,
   * so the caller must refetch rather than assume it has missed nothing.
   */
  readonly onResubscribed?: () => void
}

/**
 * Derives the realtime URL from the HTTP one.
 *
 * The path differs by host, which is verified rather than assumed: a custom domain serves realtime
 * at `/graphql/realtime`, while the raw AppSync realtime host serves it at `/graphql`. Using the
 * wrong one does not fail gracefully — the socket never connects.
 */
export function realtimeUrlFor(httpEndpoint: string, header: string): string {
  const url = new URL(httpEndpoint)
  const isRawAppSyncHost = url.hostname.endsWith('.amazonaws.com')
  const host = isRawAppSyncHost
    ? url.hostname.replace('appsync-api', 'appsync-realtime-api')
    : url.hostname
  const path = isRawAppSyncHost ? url.pathname : `${url.pathname}/realtime`
  const payload = base64(JSON.stringify({}))
  return `wss://${host}${path}?header=${header}&payload=${payload}`
}

function base64(value: string): string {
  return btoa(value)
}

/**
 * Opens the subscription and keeps it open, reconnecting with exponential backoff.
 *
 * @returns a function that closes the socket and stops reconnecting.
 */
export function openAppSyncSubscription(options: AppSyncSocketOptions): () => void {
  let socket: WebSocket | null = null
  let reconnectDelay = RECONNECT_BASE_MS
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let closedByCaller = false
  // Distinguishes the first connection from a reconnect: only a reconnect has a gap during which
  // broadcasts were missed, and only a reconnect should trigger a resync.
  let hasConnectedBefore = false

  const scheduleReconnect = () => {
    if (closedByCaller) return
    reconnectTimer = setTimeout(connect, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
  }

  async function connect(): Promise<void> {
    if (closedByCaller) return
    const token = await options.token()
    if (!token) {
      // Signed out, or the session expired. Not an error worth retrying quickly.
      scheduleReconnect()
      return
    }

    const header = base64(JSON.stringify({
      host: new URL(options.httpEndpoint).hostname,
      Authorization: token,
    }))

    let ws: WebSocket
    try {
      ws = new WebSocket(realtimeUrlFor(options.httpEndpoint, header), 'graphql-ws')
    } catch {
      scheduleReconnect()
      return
    }
    socket = ws

    ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init' }))

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as { type?: string; payload?: unknown }
      switch (message.type) {
        case 'connection_ack':
          ws.send(JSON.stringify({
            id: crypto.randomUUID(),
            type: 'start',
            payload: {
              // The query travels as a JSON STRING nested inside payload.data, not as an object.
              data: JSON.stringify({ query: options.query, variables: {} }),
              extensions: { authorization: JSON.parse(atob(header)) },
            },
          }))
          break
        case 'start_ack':
          // Only now is the subscription live. Anything published between `start` and here is not
          // delivered, which is why a resync belongs at this point rather than at `connection_ack`.
          reconnectDelay = RECONNECT_BASE_MS
          if (hasConnectedBefore) options.onResubscribed?.()
          hasConnectedBefore = true
          break
        case 'data':
          options.onData(message.payload)
          break
        default:
          break
      }
    }

    // Both paths reconnect. A dropped socket is normal - AppSync closes idle connections, phones
    // suspend them, and networks change - so this is the expected case, not the exceptional one.
    ws.onclose = () => { if (socket === ws) scheduleReconnect() }
    ws.onerror = () => { try { ws.close() } catch { /* onclose still runs */ } }
  }

  void connect()

  return () => {
    closedByCaller = true
    clearTimeout(reconnectTimer)
    try { socket?.close() } catch { /* already gone */ }
  }
}
