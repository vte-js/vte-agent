import { ref } from 'vue'
import { useVsCode } from './useVsCode'

export function useConfig() {
  const { send, onMessage } = useVsCode()
  const configVisible = ref(false)
  const apiKey = ref('')
  const apiBase = ref('https://api.openai.com/v1')
  const model = ref('gpt-4')

  onMessage((msg) => {
    if (msg.type === 'configData') {
      apiKey.value = msg.apiKey
      apiBase.value = msg.apiBase
      model.value = msg.model
    } else if (msg.type === 'configSaved') {
      // handled by parent
    } else if (msg.type === 'showSettings') {
      configVisible.value = true
    }
  })

  function toggleConfig() {
    configVisible.value = !configVisible.value
  }

  function saveConfig() {
    send({ type: 'saveConfig', apiKey: apiKey.value, apiBase: apiBase.value, model: model.value })
  }

  function init() {
    send({ type: 'getConfig' })
  }

  return { configVisible, apiKey, apiBase, model, toggleConfig, saveConfig, init }
}
