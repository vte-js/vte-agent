import { ref, watch } from 'vue'
import { useVsCode } from './useVsCode'
import { useNotification } from './useNotification'
import type { ReasoningLevel, LspProfile } from '../protocol'

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
  const { notify } = useNotification()
  const configVisible = ref(false)
  const configEditorVisible = ref(false)
  const models = ref<ModelProfile[]>([])
  const activeModelIndex = ref(0)
  const permissionConfig = ref<PermissionConfig>({ ...DEFAULT_PERMISSION_CONFIG })
  const reasoningLevel = ref<ReasoningLevel>('medium')
  const lspProfiles = ref<Record<string, LspProfile>>({})
  const lspConfigProfiles = ref<Record<string, LspProfile>>({})
  let isConfigEditorInitializing = false

  watch(configEditorVisible, (v) => {
    if (!v) {
      isConfigEditorInitializing = false
    }
  })

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
    } else if (msg.type === 'lspProfiles') {
      console.log('[VTE-UI] lspProfiles received, keys:', Object.keys(msg.profiles || {}))
      lspProfiles.value = msg.profiles || {}
    } else if (msg.type === 'lspConfigEditor:data') {
      console.log('[VTE-UI] lspConfigEditor:data received, isConfigEditorInitializing:', isConfigEditorInitializing, 'keys:', Object.keys(msg.profiles || {}))
      // Only apply during initial config editor open (isConfigEditorInitializing=true)
      // After add/save/delete, config editor manages its own state locally
      if (isConfigEditorInitializing) {
        isConfigEditorInitializing = false
        lspConfigProfiles.value = msg.profiles || {}
      }
    } else if (msg.type === 'lspConfigEditor:saved') {
      notify('success', `Profile saved: ${msg.languageId}`, { duration: 2000 })
    } else if (msg.type === 'lspConfigEditor:deleted') {
      notify('info', `Profile deleted: ${msg.languageId}`, { duration: 2000 })
    } else if (msg.type === 'lsp:testResult') {
      // Show detailed LSP test result
      console.log('[VTE-LSP] Test result received:', msg)

      if (msg.success) {
        // Show success toast (keep message short for toast display)
        const shortMsg = msg.message?.substring(0, 50) || 'LSP test completed'
        console.log('[VTE-LSP] Showing success toast:', shortMsg)
        notify('success', shortMsg, { duration: 3000 })
      } else {
        // Show error toast
        const errorMsg = msg.message?.substring(0, 50) || 'LSP test failed'
        console.log('[VTE-LSP] Showing error toast:', errorMsg)
        notify('error', errorMsg, { duration: 5000 })
      }
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

  function setupLsp() {
    send({ type: 'lsp:setup' })
  }

  function testLsp() {
    send({ type: 'lsp:test' })
  }

  function openConfigEditor() {
    configEditorVisible.value = true
    isConfigEditorInitializing = true
    console.log('[VTE-UI] openConfigEditor, lspProfiles keys:', Object.keys(lspProfiles.value))
    // Initialize config editor from already-loaded lsp profiles
    lspConfigProfiles.value = { ...lspProfiles.value }
    console.log('[VTE-UI] openConfigEditor, lspConfigProfiles keys:', Object.keys(lspConfigProfiles.value))
    // Request fresh data for config editor (separate from lspProfiles broadcast)
    send({ type: 'getLspConfigEditorData' })
  }

  function saveLspProfile(profile: LspProfile) {
    send({ type: 'lspConfigEditor:save', profile })
    lspConfigProfiles.value = { ...lspConfigProfiles.value, [profile.languageId]: profile }
  }

  function deleteLspProfile(languageId: string) {
    send({ type: 'lspConfigEditor:delete', languageId })
    const { [languageId]: _, ...rest } = lspConfigProfiles.value
    lspConfigProfiles.value = rest
  }

  function addLspProfile(profile: LspProfile) {
    console.log('[VTE-UI] addLspProfile:', profile.languageId, 'current keys:', Object.keys(lspConfigProfiles.value))
    send({ type: 'lspConfigEditor:add', profile })
    // Locally update so the UI refreshes immediately
    lspConfigProfiles.value = { ...lspConfigProfiles.value, [profile.languageId]: profile }
    console.log('[VTE-UI] addLspProfile after update, keys:', Object.keys(lspConfigProfiles.value))
  }

  function init() {
    send({ type: 'getConfig' })
    send({ type: 'getPermissionConfig' })
    send({ type: 'getLspProfiles' })
  }

  return {
    configVisible, configEditorVisible, models, activeModelIndex,
    apiKey, apiBase, model, permissionConfig, reasoningLevel,
    lspProfiles, lspConfigProfiles,
    toggleConfig, selectModel, addModel, updateModel, deleteModel, saveConfig, init,
    updatePermissionConfig, setReasoningLevel, setupLsp, testLsp,
    openConfigEditor, saveLspProfile, deleteLspProfile, addLspProfile,
  }
}
