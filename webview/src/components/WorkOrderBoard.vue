<template>
  <div class="work-order-board">
    <div class="board-header">
      <span class="board-title">工单面板</span>
      <button class="btn btn-sm" @click="$emit('createOrder')">+ 新建工单</button>
    </div>

    <div class="board-columns">
      <!-- Pending -->
      <div class="board-column">
        <div class="column-header pending">
          <span class="column-title">待处理</span>
          <span class="column-count">{{ pendingOrders.length }}</span>
        </div>
        <div class="column-body">
          <div v-for="order in pendingOrders" :key="order.id" class="order-card">
            <div class="order-title">{{ order.title }}</div>
            <div class="order-meta">
              <span class="order-priority" :class="order.priority">{{ order.priority }}</span>
              <span class="order-role" v-if="order.requiredRole">{{ order.requiredRole }}</span>
              <span class="order-id">{{ order.id }}</span>
            </div>
          </div>
          <div v-if="pendingOrders.length === 0" class="column-empty">无</div>
        </div>
      </div>

      <!-- Running -->
      <div class="board-column">
        <div class="column-header running">
          <span class="column-title">执行中</span>
          <span class="column-count">{{ runningOrders.length }}</span>
        </div>
        <div class="column-body">
          <div v-for="order in runningOrders" :key="order.id" class="order-card active">
            <div class="order-title">{{ order.title }}</div>
            <div class="order-meta">
              <span class="order-role" v-if="order.requiredRole">{{ order.requiredRole }}</span>
              <span class="order-agent" v-if="order.assignedAgentId">{{ order.assignedAgentId }}</span>
            </div>
          </div>
          <div v-if="runningOrders.length === 0" class="column-empty">无</div>
        </div>
      </div>

      <!-- Done -->
      <div class="board-column">
        <div class="column-header done">
          <span class="column-title">已完成</span>
          <span class="column-count">{{ doneOrders.length }}</span>
        </div>
        <div class="column-body">
          <div v-for="order in doneOrders.slice(0, 10)" :key="order.id" class="order-card completed">
            <div class="order-title">{{ order.title }}</div>
            <div class="order-meta">
              <span class="order-role" v-if="order.requiredRole">{{ order.requiredRole }}</span>
            </div>
          </div>
          <div v-if="doneOrders.length === 0" class="column-empty">无</div>
        </div>
      </div>

      <!-- Failed -->
      <div v-if="failedOrders.length > 0" class="board-column">
        <div class="column-header failed">
          <span class="column-title">失败</span>
          <span class="column-count">{{ failedOrders.length }}</span>
        </div>
        <div class="column-body">
          <div v-for="order in failedOrders" :key="order.id" class="order-card error">
            <div class="order-title">{{ order.title }}</div>
            <div class="order-error" v-if="order.error">{{ order.error }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WorkOrderStatus } from '../composables/useMultiAgent'

const props = defineProps<{
  orders: WorkOrderStatus[]
}>()

defineEmits<{
  createOrder: []
}>()

const pendingOrders = computed(() => props.orders.filter(o => o.status === 'pending' || o.status === 'assigned'))
const runningOrders = computed(() => props.orders.filter(o => o.status === 'running'))
const doneOrders = computed(() => props.orders.filter(o => o.status === 'done'))
const failedOrders = computed(() => props.orders.filter(o => o.status === 'failed'))
</script>

<style scoped>
.work-order-board { padding: 12px; }

.board-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.board-title { font-size: 14px; font-weight: 600; color: var(--vte-text); }

.btn {
  padding: 5px 10px; border-radius: 6px; border: none;
  font-size: 11px; font-weight: 500; cursor: pointer;
  background: rgba(255,255,255,0.06); color: var(--vte-text-muted);
  transition: all 0.15s;
}
.btn:hover { background: rgba(255,255,255,0.1); color: var(--vte-text); }

.board-columns {
  display: flex; gap: 8px; overflow-x: auto;
}

.board-column {
  flex: 1; min-width: 140px;
  border-radius: 8px; border: 1px solid var(--vte-border);
  background: rgba(255,255,255,0.02);
}

.column-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-bottom: 1px solid var(--vte-border);
}
.column-title { font-size: 11px; font-weight: 600; color: var(--vte-text); }
.column-count {
  font-size: 10px; font-weight: 600; padding: 1px 6px;
  border-radius: 10px; background: rgba(255,255,255,0.08);
  color: var(--vte-text-muted);
}
.column-header.pending .column-count { background: rgba(99,102,241,0.15); color: #818cf8; }
.column-header.running .column-count { background: rgba(245,158,11,0.15); color: #f59e0b; }
.column-header.done .column-count { background: rgba(34,197,94,0.15); color: #22c55e; }
.column-header.failed .column-count { background: rgba(239,68,68,0.15); color: #ef4444; }

.column-body {
  padding: 6px; display: flex; flex-direction: column; gap: 4px;
  max-height: 300px; overflow-y: auto;
}

.order-card {
  padding: 8px 10px; border-radius: 6px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.04);
}
.order-card.active { border-color: rgba(245,158,11,0.2); background: rgba(245,158,11,0.04); }
.order-card.completed { opacity: 0.6; }
.order-card.error { border-color: rgba(239,68,68,0.2); background: rgba(239,68,68,0.04); }

.order-title { font-size: 11px; font-weight: 500; color: var(--vte-text); margin-bottom: 4px; }
.order-meta { display: flex; gap: 4px; font-size: 9px; color: var(--vte-text-muted); }
.order-priority {
  padding: 1px 4px; border-radius: 3px; font-weight: 600;
}
.order-priority.critical { background: rgba(239,68,68,0.15); color: #ef4444; }
.order-priority.high { background: rgba(245,158,11,0.15); color: #f59e0b; }
.order-priority.normal { background: rgba(99,102,241,0.1); color: #818cf8; }
.order-priority.low { background: rgba(100,116,139,0.1); color: #64748b; }
.order-role {
  padding: 1px 4px; border-radius: 3px;
  background: rgba(99,102,241,0.1); color: #818cf8;
}
.order-agent {
  padding: 1px 4px; border-radius: 3px;
  background: rgba(245,158,11,0.1); color: #f59e0b;
}
.order-error { font-size: 10px; color: #ef4444; margin-top: 4px; }

.column-empty {
  padding: 16px; text-align: center;
  font-size: 11px; color: var(--vte-text-muted);
}
</style>
