/**
 * WebSocket <-> HostMessaging bridge.
 *
 * The core engine talks to the host only through `HostMessaging`
 * (postMessage / onMessage). This class makes that transport a WebSocket
 * connection to a browser, with no assumption about VSCode's postMessage.
 *
 * Single-client v1: one active connection at a time (`current`).
 */

import type { WebSocket } from 'ws'
import type { Disposable } from '../../src/host/types'

type MessageHandler = (msg: any) => void

export class WebIDEMessaging {
  private current: WebSocket | null = null
  private handler: MessageHandler | null = null

  /** Called by the server when a browser WebSocket connects. */
  bind(ws: WebSocket): void {
    this.current = ws
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      let msg: any
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      this.handler?.(msg)
    })
    ws.on('close', () => {
      if (this.current === ws) this.current = null
    })
    ws.on('error', () => {
      if (this.current === ws) this.current = null
    })
  }

  /** Send a message to the connected browser (no-op if not connected). */
  postMessage(msg: any): void {
    if (!this.current) return
    try {
      this.current.send(JSON.stringify(msg))
    } catch {
      // ignore broken-pipe during shutdown
    }
  }

  onMessage(handler: MessageHandler): Disposable {
    this.handler = handler
    return {
      dispose() {
        if (this.handler === handler) this.handler = null
      },
    }
  }

  /** Notify the client that the host is ready (optional handshake). */
  signalReady(): void {
    this.postMessage({ type: 'ready' })
  }
}
