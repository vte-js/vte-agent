<template>
  <Teleport to="body">
    <Transition name="auth">
      <div v-if="visible" class="auth-overlay" @click.self="deny">
        <div class="auth-dialog">
          <div class="auth-header">
            <div class="auth-icon" :class="categoryClass">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <span class="auth-title">工具授权</span>
          </div>

          <div class="auth-body">
            <div class="auth-desc">VTE Agent 请求执行以下操作:</div>

            <div class="auth-detail">
              <div class="auth-detail-row">
                <span class="auth-detail-label">工具</span>
                <span class="auth-detail-value">{{ toolName }}</span>
              </div>
              <div v-if="toolDescription" class="auth-detail-row">
                <span class="auth-detail-label">说明</span>
                <span class="auth-detail-value">{{ toolDescription }}</span>
              </div>
              <div class="auth-detail-args">
                <span class="auth-detail-label">参数</span>
                <pre class="auth-detail-code">{{ formattedArgs }}</pre>
              </div>
            </div>
          </div>

          <div class="auth-actions">
            <button class="auth-btn allow-once" @click="allowOnce">仅本次允许</button>
            <button class="auth-btn always-allow" @click="alwaysAllow">总是允许</button>
            <button class="auth-btn deny" @click="deny">拒绝</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TOOL_DESCRIPTIONS, TOOL_CATEGORIES } from '../../../src/core/permissions'

const props = defineProps<{
  visible: boolean
  toolName: string
  toolArgs: Record<string, unknown>
}>()

const emit = defineEmits<{
  allow_once: []
  always_allow: []
  deny: []
}>()

const category = computed(() => TOOL_CATEGORIES[props.toolName] || 'unknown')
const toolDescription = computed(() => TOOL_DESCRIPTIONS[props.toolName] || '')

const categoryClass = computed(() => {
  const c = category.value
  if (c === 'fileRead') return 'read'
  if (c === 'fileWrite') return 'write'
  if (c === 'terminal') return 'terminal'
  if (c === 'git') return 'git'
  if (c === 'web') return 'web'
  return 'other'
})

const formattedArgs = computed(() => {
  const args = props.toolArgs
  if (!args || Object.keys(args).length === 0) return '(无参数)'

  switch (props.toolName) {
    case 'read':
      return `文件: ${args.path || ''}${args.range ? ` (行 ${args.range.start}-${args.range.end})` : ''}`
    case 'edit':
      return `文件: ${args.path || ''}\n替换: "${String(args.oldString || '').substring(0, 60)}" → "${String(args.newString || '').substring(0, 60)}"`
    case 'write':
      return `文件: ${args.path || ''}\n内容: ${String(args.content || '').length} 字符`
    case 'bash':
      return `$ ${args.command || ''}`
    case 'grep':
      return `搜索: "${args.pattern || ''}" in ${args.path || '.'}`
    case 'glob':
      return `匹配: ${args.pattern || ''}`
    case 'list':
      return `目录: ${args.path || '.'}`
    case 'git':
      return `git ${args.subcommand || ''} ${(args.args as string[] || []).join(' ')}`
    case 'webfetch':
      return `URL: ${args.url || ''}`
    default:
      return JSON.stringify(args, null, 2).substring(0, 200)
  }
})

function allowOnce() { emit('allow_once') }
function alwaysAllow() { emit('always_allow') }
function deny() { emit('deny') }
</script>

<style scoped>
.auth-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.auth-dialog {
  width: 420px; max-width: 100%;
  background: #1e1e2e; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  overflow: hidden;
}
.auth-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.auth-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.auth-icon.read { background: rgba(59,130,246,0.12); color: #3b82f6; }
.auth-icon.write { background: rgba(239,68,68,0.12); color: #ef4444; }
.auth-icon.terminal { background: rgba(168,85,247,0.12); color: #a855f7; }
.auth-icon.git { background: rgba(34,197,94,0.12); color: #22c55e; }
.auth-icon.web { background: rgba(245,158,11,0.12); color: #f59e0b; }
.auth-icon.other { background: rgba(99,102,241,0.12); color: #818cf8; }
.auth-title { font-size: 15px; font-weight: 600; color: #e2e8f0; }

.auth-body { padding: 16px 20px; }
.auth-desc { font-size: 13px; color: #94a3b8; margin-bottom: 12px; }
.auth-detail {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px;
}
.auth-detail-row { display: flex; gap: 8px; }
.auth-detail-label { font-size: 11px; color: #64748b; min-width: 36px; flex-shrink: 0; }
.auth-detail-value { font-size: 12px; color: #e2e8f0; font-weight: 500; }
.auth-detail-args { display: flex; gap: 8px; }
.auth-detail-code {
  margin: 0; padding: 6px 8px; border-radius: 6px;
  background: rgba(0,0,0,0.2); color: #94a3b8;
  font-family: 'SF Mono', Monaco, Menlo, monospace; font-size: 11px;
  line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all;
  flex: 1;
}

.auth-actions {
  display: flex; gap: 8px; padding: 12px 20px 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.auth-btn {
  flex: 1; padding: 10px 12px; border-radius: 8px; border: none;
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all 0.15s;
}
.auth-btn.allow-once { background: rgba(99,102,241,0.12); color: #818cf8; }
.auth-btn.allow-once:hover { background: rgba(99,102,241,0.2); }
.auth-btn.always-allow { background: #6366f1; color: #fff; }
.auth-btn.always-allow:hover { background: #818cf8; }
.auth-btn.deny { background: rgba(239,68,68,0.12); color: #ef4444; }
.auth-btn.deny:hover { background: rgba(239,68,68,0.2); }

.auth-enter-active { transition: opacity 0.2s ease; }
.auth-leave-active { transition: opacity 0.15s ease; }
.auth-enter-from, .auth-leave-to { opacity: 0; }
.auth-enter-active .auth-dialog { animation: authIn 0.25s ease; }
@keyframes authIn { from { transform: translateY(12px) scale(0.97); opacity: 0; } }
</style>
