import type { WebviewToHostMessage, HostToWebviewMessage } from '../protocol'

let vscode: VsCodeApi

function getVsCodeApi(): VsCodeApi {
  try {
    if (typeof acquireVsCodeApi !== 'undefined') {
      return acquireVsCodeApi()
    }
  } catch (e) {
    console.error('[VTE] acquireVsCodeApi() failed:', e)
  }
  // Browser fallback for local development
  console.log('[VTE DEV] Running outside VSCode — messages will be logged to console')
  return {
    postMessage(msg: any) {
      console.log('[VTE DEV] →', msg)
    },
    getState() { return null },
    setState(_state: any) {},
  }
}

try {
  vscode = getVsCodeApi()
} catch (e) {
  console.error('[VTE] Failed to initialize VSCode API:', e)
  vscode = {
    postMessage(msg: any) { console.log('[VTE DEV] →', msg) },
    getState() { return null },
    setState(_state: any) {},
  }
}

export function useVsCode() {
  function send(msg: WebviewToHostMessage) {
    const payloadSize = JSON.stringify(msg).length
    console.log(`[VTE-Web][DEBUG] useVsCode.send: type=${(msg as any).type} payloadSize=${payloadSize}`)
    try {
      // Deep clone to strip Vue reactive proxies — structured clone can't handle them
      const plain = JSON.parse(JSON.stringify(msg))
      vscode.postMessage(plain)
      console.log(`[VTE-Web][DEBUG] useVsCode.send: postMessage succeeded`)
    } catch (err: any) {
      console.error(`[VTE-Web][DEBUG] useVsCode.send: postMessage FAILED: ${err.message}`)
    }
  }

  function onMessage(handler: (msg: HostToWebviewMessage) => void) {
    window.addEventListener('message', (e: MessageEvent) => handler(e.data))
  }

  return { send, onMessage }
}
