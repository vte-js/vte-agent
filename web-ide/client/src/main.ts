import { createApp } from 'vue'
import App from './App.vue'
import '@theme'
import './styles/app.css'

/**
 * Configure the WebSocket transport BEFORE any composable calls useHost().
 *
 * useHost()'s getTransport() inspects window.location.search for a `ws` param
 * on first call (which happens during App setup at mount time). By rewriting
 * the URL here we force every webview composable (useChat / useConfig /
 * useMultiAgent / …) onto the WebSocket transport talking to our Node server,
 * with zero changes to the shared webview source.
 *
 * In production the client is served from the same origin as the WS endpoint,
 * so `location.host` is correct. For Vite dev mode, set VITE_WS_URL env var.
 */
const devWs = (import.meta as any).env?.VITE_WS_URL as string | undefined
const wsUrl = devWs || `ws://${location.host}/ws`
const search = new URLSearchParams(location.search)
if (!search.has('ws')) {
  search.set('ws', wsUrl)
  history.replaceState(null, '', `${location.pathname}?${search.toString()}`)
}

createApp(App).mount('#app')
