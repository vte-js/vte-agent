import { ref } from 'vue'
import { useVsCode } from './useVsCode'

export interface ModelProfile {
  name: string
  apiKey: string
  apiBase: string
  model: string
}

export function useConfig() {
  const { send, onMessage } = useVsCode()
  const configVisible = ref(false)
  const models = ref<ModelProfile[]>([])
  const activeModelIndex = ref(0)

  // Current active model (derived)
  const apiKey = ref('')
  const apiBase = ref('https://api.openai.com/v1')
  const model = ref('gpt-4')

  onMessage((msg) => {
    if (msg.type === 'configData') {
      // Load multiple models from config
      if (msg.models && Array.isArray(msg.models)) {
        models.value = msg.models
        activeModelIndex.value = msg.activeModelIndex ?? 0
      } else {
        // Legacy: single model config
        models.value = [{
          name: 'Default',
          apiKey: msg.apiKey || '',
          apiBase: msg.apiBase || 'https://api.openai.com/v1',
          model: msg.model || 'gpt-4',
        }]
        activeModelIndex.value = 0
      }
      syncActiveModel()
    } else if (msg.type === 'configSaved') {
      // handled by parent
    } else if (msg.type === 'showSettings') {
      configVisible.value = true
    }
  })

  function syncActiveModel() {
    const m = models.value[activeModelIndex.value]
    if (m) {
      apiKey.value = m.apiKey
      apiBase.value = m.apiBase
      model.value = m.model
    }
  }

  function toggleConfig() {
    configVisible.value = !configVisible.value
  }

  function selectModel(index: number) {
    activeModelIndex.value = index
    syncActiveModel()
    // Send switch to extension
    send({ type: 'switchModel', index })
  }

  function addModel(profile: ModelProfile) {
    models.value.push(profile)
    saveModels()
  }

  function updateModel(index: number, profile: ModelProfile) {
    models.value[index] = profile
    if (index === activeModelIndex.value) {
      syncActiveModel()
    }
    saveModels()
  }

  function deleteModel(index: number) {
    if (models.value.length <= 1) return
    models.value.splice(index, 1)
    if (activeModelIndex.value >= models.value.length) {
      activeModelIndex.value = models.value.length - 1
    }
    syncActiveModel()
    saveModels()
  }

  function saveModels() {
    send({
      type: 'saveModels',
      models: models.value,
      activeModelIndex: activeModelIndex.value,
    })
  }

  function saveConfig() {
    send({
      type: 'saveModels',
      models: models.value,
      activeModelIndex: activeModelIndex.value,
    })
  }

  function init() {
    send({ type: 'getConfig' })
  }

  return {
    configVisible, models, activeModelIndex,
    apiKey, apiBase, model,
    toggleConfig, selectModel, addModel, updateModel, deleteModel, saveConfig, init,
  }
}
