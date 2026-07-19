/**
 * WebSocket client — talks to the Web IDE Node server (/ws).
 *
 * The server always listens on :3000, even when the client is served
 * by Vite's dev server on :5173, so we connect to a fixed port.
 */

import type { ServerMessage, ClientMessage } from './protocol'

type Listener = (msg: ServerMessage) => void
type StateListener = (state: 'connected' | 'disconnected' | 'connecting') => void

const WS_PORT = (import.meta.env?.VITE_WS_PORT) ? Number(import.meta.env.VITE_WS_PORT) : 3000

class WsClient {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private stateListeners = new Set<StateListener>()
  private outbox: string[] = []
  connected = false

  private emitState(state: 'connected' | 'disconnected' | 'connecting') {
    this.stateListeners.forEach((l) => l(state))
  }

  connect(): void {
    this.emitState('connecting')
    const url = `ws://${location.hostname}:${WS_PORT}/ws`
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      this.connected = true
      this.emitState('connected')
      this.send({ type: 'ready' })
      // flush anything queued before open
      for (const raw of this.outbox) ws.send(raw)
      this.outbox = []
    }
    ws.onclose = () => {
      this.connected = false
      this.emitState('disconnected')
    }
    ws.onmessage = (ev: MessageEvent) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(ev.data as string)
      } catch {
        return
      }
      this.listeners.forEach((l) => l(msg))
    }
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  send(msg: ClientMessage): void {
    const raw = JSON.stringify(msg)
    if (this.ws && this.connected) {
      this.ws.send(raw)
    } else {
      this.outbox.push(raw)
    }
  }
}

export const wsClient = new WsClient()
