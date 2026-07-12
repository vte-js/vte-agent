/**
 * useVsCode — backwards-compatible wrapper around useHost
 *
 * Existing code continues to work unchanged.
 * New code should import useHost directly.
 */

import { useHost } from './useHost'
import type { WebviewToHostMessage, HostToWebviewMessage } from '../protocol'

export function useVsCode() {
  const { send: hostSend, onMessage: hostOnMessage, signalReady: hostSignalReady } = useHost()

  function send(msg: WebviewToHostMessage) {
    hostSend(msg)
  }

  function onMessage(handler: (msg: HostToWebviewMessage) => void) {
    hostOnMessage(handler)
  }

  function signalReady() {
    hostSignalReady()
  }

  return { send, onMessage, signalReady }
}
