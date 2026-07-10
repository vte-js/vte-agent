import { ref } from 'vue'
import { useVsCode } from './useVsCode'
import type { ReasoningLevel } from '../protocol'

export interface ModelProfile {
  name: string
  apiKey: string
  apiBase: string
  model: string
}

export interface PermissionConfig {
  fileRead: 'allow' | 'ask' | 'deny'
  fileWrite: 'allow' | 'ask' | 'deny'
  terminal: 'allow' | 'ask' | 'deny'
  git: 'allow' | 'ask' | 'deny'
  diagnostics: 'allow' | 'ask' | 'deny'
  web: 'allow' | 'ask' | 'deny'
  task: 'allow' | 'ask' | 'deny'
  checkpoint: 'allow' | 'ask' | 'deny'
}

export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  fileRead: 'allow',
  fileWrite: 'ask',
  terminal: 'ask',
  git: 'allow',
  diagnostics: 'allow',
  web: 'ask',
  task: 'allow',
  checkpoint: 'allow',
}

export const PERMISSION_CATEGORIES: Array<{ key: keyof PermissionConfig; label: string; description: string }> = [
  { key: 'fileRead', label: '文件读取', description: '读取文件内容和目录列表' },
  { key: 'fileWrite', label: '文件写入', description: '编辑和创建文件' },
  { key: 'terminal', label: '终端执行', description: '执行 Shell 命令' },
  { key: 'git', label: 'Git 操作', description: '版本控制操作' },
  { key: 'diagnostics', label: '代码诊断', description: '运行类型检查和 lint' },
  { key: 'web', label: '网络请求', description: '访问外部 URL' },
  { key: 'task', label: '任务管理', description: '创建和更新任务' },
  { key: 'checkpoint', label: '快照管理', description: '保存和恢复快照' },
]

export function useConfig() {
  const { send, onMessage } = useVsCode()
  const configVisible = ref(false)
  const models = ref<ModelProfile[]>([])
  const activeModelIndex = ref(0)
  const permissionConfig = ref<PermissionConfig>({ ...DEFAULT_PERMISSION_CONFIG })
  const reasoningLevel = ref<ReasoningLevel>('medium')

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
    } else if (msg.type === 'permissionConfig') {
      permissionConfig.value = { ...DEFAULT_PERMISSION_CONFIG, ...msg.config }
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

  function updatePermissionConfig(config: PermissionConfig) {
    permissionConfig.value = { ...config }
    send({ type: 'setPermissionConfig', config })
  }

  function setReasoningLevel(level: ReasoningLevel) {
    reasoningLevel.value = level
    send({ type: 'setReasoningLevel', level })
  }

  function init() {
    send({ type: 'getConfig' })
    send({ type: 'getPermissionConfig' })
  }

  return {
    configVisible, models, activeModelIndex,
    apiKey, apiBase, model, permissionConfig, reasoningLevel,
    toggleConfig, selectModel, addModel, updateModel, deleteModel, saveConfig, init,
    updatePermissionConfig, setReasoningLevel,
  }
}
