import { ref } from 'vue'
import { useVsCode } from './useVsCode'

export type AgentMode = 'plan' | 'code'

export function useMode() {
  const { send, onMessage } = useVsCode()
  const mode = ref<AgentMode>('code')

  function setMode(m: AgentMode) {
    mode.value = m
    send({ type: 'setMode', mode: m })
  }

  // Sync mode from provider (when a new webview opens)
  onMessage((msg) => {
    if (msg.type === 'modeChanged') {
      mode.value = msg.mode
    }
  })

  return { mode, setMode }
}
