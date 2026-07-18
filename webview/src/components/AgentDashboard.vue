<template>
  <div class="agent-dashboard">
    <div class="dashboard-header">
      <span class="dashboard-title">Agent 仪表盘</span>
      <div class="dashboard-actions">
        <button class="btn btn-sm" @click="showRolePicker = true">
          <span>+ 新建 Agent</span>
        </button>
        <button class="btn btn-sm btn-primary" @click="$emit('startScheduler')">
          {{ schedulerRunning ? '⏸ 暂停' : '▶ 启动' }}
        </button>
      </div>
    </div>

    <!-- Stats bar -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-value">{{ stats.totalAgents }}</span>
        <span class="stat-label">Agent</span>
      </div>
      <div class="stat-item running">
        <span class="stat-value">{{ stats.busyAgents }}</span>
        <span class="stat-label">运行中</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-value">{{ stats.pendingOrders }}</span>
        <span class="stat-label">待处理</span>
      </div>
      <div class="stat-item running">
        <span class="stat-value">{{ stats.runningOrders }}</span>
        <span class="stat-label">执行中</span>
      </div>
      <div class="stat-item done">
        <span class="stat-value">{{ stats.doneOrders }}</span>
        <span class="stat-label">已完成</span>
      </div>
      <div v-if="stats.failedOrders > 0" class="stat-item failed">
        <span class="stat-value">{{ stats.failedOrders }}</span>
        <span class="stat-label">失败</span>
      </div>
    </div>

    <!-- Agent cards -->
    <div class="agent-cards">
      <div
        v-for="agent in agents"
        :key="agent.id"
        class="agent-card"
        :class="{ selected: selectedAgentId === agent.id, [agent.status]: true }"
        @click="$emit('selectAgent', agent.id)"
      >
        <div class="agent-card-header">
          <span class="agent-role-badge" :style="{ background: getRoleColor(agent.role) }">
            {{ getRoleIcon(agent.role) }}
          </span>
          <div class="agent-info">
            <span class="agent-name">{{ agent.roleName }}</span>
            <span class="agent-id">{{ agent.id }}</span>
          </div>
          <span class="agent-status-dot" :class="agent.status"></span>
        </div>
        <div class="agent-card-stats">
          <span class="agent-stat">✓ {{ agent.completedOrders }}</span>
          <span v-if="agent.failedOrders > 0" class="agent-stat failed">✗ {{ agent.failedOrders }}</span>
          <span v-if="agent.currentOrderId" class="agent-task">{{ agent.currentOrderId }}</span>
        </div>
      </div>

      <div v-if="agents.length === 0" class="agent-empty">
        点击"新建 Agent"创建第一个 Agent
      </div>
    </div>

    <!-- Role picker dialog -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="showRolePicker" class="dialog-overlay" @click.self="showRolePicker = false">
          <div class="role-picker">
            <div class="role-picker-header">
              <span class="role-picker-title">选择 Agent 角色</span>
              <button class="role-picker-close" @click="showRolePicker = false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div class="role-picker-list">
              <div v-for="role in roles" :key="role.id" class="role-item" @click="selectRole(role)">
                <span class="role-icon" :style="{ background: getRoleColor(role.id) }">{{ getRoleIcon(role.id) }}</span>
                <div class="role-info">
                  <span class="role-name">{{ role.name }}</span>
                  <span class="role-desc">{{ role.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Agent config dialog -->
    <AgentConfigDialog
      v-if="selectedRole"
      :visible="!!selectedRole"
      :role="selectedRole"
      :global-config="globalConfig"
      @cancel="selectedRole = null"
      @confirm="onConfirmConfig"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { AgentStatus } from '../composables/useMultiAgent'
import type { AgentRole } from '../../../src/agent/agent-role'
import { BUILTIN_ROLES } from '../../../src/agent/agent-role'
import AgentConfigDialog from './AgentConfigDialog.vue'

defineProps<{
  agents: AgentStatus[]
  stats: {
    totalAgents: number
    busyAgents: number
    totalOrders: number
    pendingOrders: number
    runningOrders: number
    doneOrders: number
    failedOrders: number
  }
  selectedAgentId: string | null
  schedulerRunning: boolean
  globalConfig: { model: string; apiKey: string; apiBase: string }
}>()

const emit = defineEmits<{
  createAgent: [roleId: string, config: { model: string; apiKey: string; apiBase: string }]
  startScheduler: []
  selectAgent: [id: string]
}>()

const showRolePicker = ref(false)
const selectedRole = ref<AgentRole | null>(null)
const roles = BUILTIN_ROLES

const ROLE_COLORS: Record<string, string> = {
  pm: '#6366f1', dev: '#22c55e', test: '#f59e0b', review: '#8b5cf6', doc: '#ec4899',
}
const ROLE_ICONS: Record<string, string> = {
  pm: '📋', dev: '💻', test: '🧪', review: '🔍', doc: '📝',
}

function getRoleColor(role: string) { return ROLE_COLORS[role] || '#64748b' }
function getRoleIcon(role: string) { return ROLE_ICONS[role] || '🤖' }

function selectRole(role: AgentRole) {
  selectedRole.value = role
  showRolePicker.value = false
}

function onConfirmConfig(config: { model: string; apiKey: string; apiBase: string }) {
  if (selectedRole.value) {
    emit('createAgent', selectedRole.value.id, config)
  }
  selectedRole.value = null
}
</script>

<style scoped>
.agent-dashboard {
  padding: 12px;
  flex-shrink: 0;
  max-height: 220px;
  overflow-y: auto;
}

.dashboard-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.dashboard-title { font-size: 14px; font-weight: 600; color: var(--vte-text); }
.dashboard-actions { display: flex; gap: 6px; }

.btn {
  padding: 5px 10px; border-radius: 6px; border: none;
  font-size: 11px; font-weight: 500; cursor: pointer;
  background: rgba(255,255,255,0.06); color: var(--vte-text-muted);
  transition: all 0.15s;
}
.btn:hover { background: rgba(255,255,255,0.1); color: var(--vte-text); }
.btn-primary { background: var(--vte-primary, #6366f1); color: #fff; }
.btn-primary:hover { opacity: 0.9; }

.stats-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px; border-radius: 8px;
  background: rgba(255,255,255,0.03); margin-bottom: 12px;
}
.stat-item { display: flex; flex-direction: column; align-items: center; }
.stat-value { font-size: 16px; font-weight: 700; color: var(--vte-text); }
.stat-label { font-size: 10px; color: var(--vte-text-muted); }
.stat-item.running .stat-value { color: #f59e0b; }
.stat-item.done .stat-value { color: #22c55e; }
.stat-item.failed .stat-value { color: #ef4444; }
.stat-divider { width: 1px; height: 24px; background: var(--vte-border); }

.agent-cards {
  display: flex; flex-direction: column; gap: 6px;
}

.agent-card {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--vte-border);
  background: rgba(255,255,255,0.02);
  cursor: pointer; transition: all 0.15s;
}
.agent-card:hover { background: rgba(255,255,255,0.04); }
.agent-card.selected { border-color: var(--vte-primary, #6366f1); background: rgba(99,102,241,0.06); }
.agent-card.busy { border-color: rgba(245,158,11,0.3); }

.agent-card-header { display: flex; align-items: center; gap: 8px; }
.agent-role-badge {
  width: 28px; height: 28px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}
.agent-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.agent-name { font-size: 12px; font-weight: 600; color: var(--vte-text); }
.agent-id { font-size: 10px; color: var(--vte-text-muted); }

.agent-status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #64748b; flex-shrink: 0;
}
.agent-status-dot.idle { background: #64748b; }
.agent-status-dot.busy { background: #f59e0b; animation: pulse 1.5s infinite; }
.agent-status-dot.error { background: #ef4444; }

.agent-card-stats {
  display: flex; gap: 8px; font-size: 10px; color: var(--vte-text-muted);
}
.agent-stat.failed { color: #ef4444; }
.agent-task {
  padding: 1px 4px; border-radius: 3px;
  background: rgba(245,158,11,0.1); color: #f59e0b;
  font-size: 9px;
}

.agent-empty {
  padding: 20px; text-align: center;
  font-size: 12px; color: var(--vte-text-muted);
}

/* Role picker dialog */
.dialog-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.role-picker {
  width: 360px; max-width: 100%; background: #1e1e2e;
  border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5); overflow: hidden;
}
.role-picker-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
}
.role-picker-title { font-size: 14px; font-weight: 600; color: #e2e8f0; }
.role-picker-close {
  width: 28px; height: 28px; border: none; background: none; border-radius: 6px;
  color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.role-picker-close:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
.role-picker-list { padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.role-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px; cursor: pointer;
  transition: background 0.15s;
}
.role-item:hover { background: rgba(99,102,241,0.08); }
.role-info { flex: 1; }
.role-info .role-name { font-size: 13px; font-weight: 500; color: #e2e8f0; display: block; }
.role-info .role-desc { font-size: 11px; color: #64748b; }

.dialog-enter-active { transition: opacity 0.2s ease; }
.dialog-leave-active { transition: opacity 0.15s ease; }
.dialog-enter-from, .dialog-leave-to { opacity: 0; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
