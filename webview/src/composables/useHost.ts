/**
 * Host Transport - abstracts messaging between webview and host
 *
 * Supports multiple transports:
 * - VSCode postMessage (acquireVsCodeApi)
 * - WebSocket (Web/Electron)
 * - Console (development)
 */

import type { WebviewToHostMessage, HostToWebviewMessage } from '../protocol'

export interface HostTransport {
  postMessage(msg: any): void
  onMessage(handler: (msg: any) => void): void
  signalReady?(): void
}

// ── VSCode Transport ──

function createVsCodeTransport(): HostTransport {
  let vscodeApi: any
  try {
    if (typeof acquireVsCodeApi !== 'undefined') {
      vscodeApi = acquireVsCodeApi()
    }
  } catch { /* ignore */ }

  if (vscodeApi) {
    return {
      postMessage: (msg) => {
        const plain = JSON.parse(JSON.stringify(msg))
        vscodeApi.postMessage(plain)
      },
      onMessage: (handler) => window.addEventListener('message', (e: MessageEvent) => handler(e.data)),
      signalReady: () => vscodeApi.postMessage({ type: 'ready' }),
    }
  }

  // Fallback: console logging for development
  console.log('[VTE DEV] Running outside VSCode — messages logged to console')
  return {
    postMessage: (msg) => console.log('[VTE DEV] →', msg),
    onMessage: () => {},
    signalReady: () => console.log('[VTE DEV] ready'),
  }
}

// ── WebSocket Transport ──

function createWebSocketTransport(url: string): HostTransport {
  const ws = new WebSocket(url)
  const handlers: Array<(msg: any) => void> = []

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    handlers.forEach(h => h(msg))
  }

  return {
    postMessage: (msg) => ws.send(JSON.stringify(msg)),
    onMessage: (handler) => handlers.push(handler),
    signalReady: () => ws.send(JSON.stringify({ type: 'ready' })),
  }
}

// ── Transport Factory ──

let transportInstance: HostTransport | null = null

export function getTransport(): HostTransport {
  if (!transportInstance) {
    // Auto-detect transport based on environment
    const params = new URLSearchParams(window.location.search)
    const wsUrl = params.get('ws')

    if (wsUrl) {
      transportInstance = createWebSocketTransport(wsUrl)
    } else {
      transportInstance = createVsCodeTransport()
    }
  }
  return transportInstance
}

// ── useHost composable (drop-in replacement for useVsCode) ──

export function useHost() {
  const transport = getTransport()

  function send(msg: WebviewToHostMessage) {
    try {
      const plain = JSON.parse(JSON.stringify(msg))
      transport.postMessage(plain)
    } catch (err: any) {
      console.error(`[VTE] send failed: ${err.message}`)
    }
  }

  function onMessage(handler: (msg: HostToWebviewMessage) => void) {
    transport.onMessage(handler)
  }

  function signalReady() {
    transport.signalReady?.()
  }

  return { send, onMessage, signalReady }
}
