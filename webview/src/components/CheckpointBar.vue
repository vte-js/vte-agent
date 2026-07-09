<template>
  <!-- Trigger button -->
  <button class="cp-btn" @click="openModal">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
    <span v-if="checkpoints.length > 0" class="cp-badge">{{ checkpoints.length }}</span>
  </button>

  <!-- Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modalOpen" class="cp-overlay" @click.self="modalOpen = false">
        <div class="cp-dialog">
          <div class="cp-dialog-header">
            <span class="cp-dialog-title">Checkpoints</span>
            <button class="cp-dialog-close" @click="modalOpen = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="cp-dialog-body">
            <!-- Error message -->
            <div v-if="errorMsg" class="cp-error">{{ errorMsg }}</div>

            <!-- Save button -->
            <button class="cp-save-btn" @click="onSave" :disabled="saving">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              {{ saving ? '保存中...' : '保存当前快照' }}
            </button>

            <!-- Checkpoint list -->
            <div v-if="checkpoints.length === 0" class="cp-empty">
              <span>暂无 Checkpoint</span>
              <span class="cp-empty-hint">点击上方按钮创建第一个快照</span>
            </div>

            <div v-else class="cp-list">
              <div v-for="cp in checkpoints" :key="cp.id" class="cp-item">
                <div class="cp-item-info">
                  <span class="cp-item-name">{{ cp.name }}</span>
                  <span class="cp-item-time">{{ formatTime(cp.timestamp) }}</span>
                </div>
                <div class="cp-item-actions">
                  <button class="cp-item-btn restore" @click="onRestore(cp.id)" title="恢复到此快照">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <polyline points="1 4 1 10 7 10"/>
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                    </svg>
                    恢复
                  </button>
                  <button class="cp-item-btn del" @click="onDelete(cp.id)" title="删除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useVsCode } from '../composables/useVsCode'

const { send, onMessage } = useVsCode()

const modalOpen = ref(false)
const saving = ref(false)
const errorMsg = ref('')
const checkpoints = ref<Array<{ id: string; name: string; timestamp: number }>>([])

onMessage((msg) => {
  if (msg.type === 'checkpointList') {
    checkpoints.value = msg.checkpoints
  } else if (msg.type === 'checkpointSaved') {
    saving.value = false
    checkpoints.value.unshift(msg.checkpoint)
    errorMsg.value = ''
  } else if (msg.type === 'checkpointRestored') {
    modalOpen.value = false
  } else if (msg.type === 'checkpointDeleted') {
    checkpoints.value = checkpoints.value.filter(cp => cp.id !== msg.checkpointId)
  } else if (msg.type === 'checkpointError') {
    errorMsg.value = msg.text
    saving.value = false
    setTimeout(() => errorMsg.value = '', 3000)
  }
})

function openModal() {
  modalOpen.value = true
  send({ type: 'listCheckpoints' })
}

function onSave() {
  saving.value = true
  send({ type: 'saveCheckpoint', name: `快照 ${new Date().toLocaleTimeString()}` })
}

function onRestore(id: string) {
  if (confirm('确定要恢复到此 Checkpoint？当前状态将被替换。')) {
    send({ type: 'restoreCheckpoint', checkpointId: id })
  }
}

function onDelete(id: string) {
  if (confirm('确定要删除此 Checkpoint？')) {
    send({ type: 'deleteCheckpoint', checkpointId: id })
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}
</script>

<style scoped>
.cp-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 6px; border: 1px solid var(--vte-border);
  background: var(--vte-input-bg); color: var(--vte-text-muted); font-size: 11px;
  cursor: pointer; transition: all 0.15s; position: relative;
}
.cp-btn:hover { border-color: rgba(99,102,241,0.4); color: var(--vte-text); }

.cp-badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 14px; height: 14px; border-radius: 7px;
  background: #6366f1; color: #fff; font-size: 9px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; padding: 0 3px;
}

/* Modal */
.cp-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
}
.cp-dialog {
  width: 400px; max-width: 90vw; max-height: 80vh;
  border-radius: 14px; background: #1e1e2e;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; overflow: hidden;
}
.cp-dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 0;
}
.cp-dialog-title { font-size: 14px; font-weight: 600; color: #e2e8f0; }
.cp-dialog-close {
  width: 28px; height: 28px; border: none; background: none; border-radius: 6px;
  color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.cp-dialog-close:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
.cp-dialog-close svg { width: 14px; height: 14px; }
.cp-dialog-body { padding: 16px 20px 20px; overflow-y: auto; }

.cp-error {
  padding: 8px 12px; border-radius: 6px; margin-bottom: 12px;
  background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
  color: #fca5a5; font-size: 12px; text-align: center;
}

.cp-save-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 10px; border-radius: 8px; border: 1px dashed rgba(99,102,241,0.3);
  background: none; color: #6366f1; font-size: 12px; cursor: pointer; margin-bottom: 16px;
  transition: all 0.12s;
}
.cp-save-btn:hover { border-color: #6366f1; background: rgba(99,102,241,0.05); }
.cp-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.cp-empty { padding: 20px 0; text-align: center; color: #64748b; font-size: 12px; }
.cp-empty-hint { display: block; margin-top: 4px; font-size: 11px; color: #475569; }

.cp-list { display: flex; flex-direction: column; gap: 6px; }
.cp-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
}
.cp-item:hover { background: rgba(255,255,255,0.04); }
.cp-item-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cp-item-name { font-size: 12px; font-weight: 500; color: #e2e8f0; }
.cp-item-time { font-size: 10px; color: #64748b; }
.cp-item-actions { display: flex; gap: 6px; }
.cp-item-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);
  background: none; color: #94a3b8; font-size: 11px; cursor: pointer;
  transition: all 0.12s;
}
.cp-item-btn.restore { border-color: rgba(34,197,94,0.3); color: #22c55e; }
.cp-item-btn.restore:hover { background: rgba(34,197,94,0.1); border-color: #22c55e; }
.cp-item-btn.del { border-color: rgba(239,68,68,0.2); color: #ef4444; }
.cp-item-btn.del:hover { background: rgba(239,68,68,0.1); border-color: #ef4444; }

/* Transition */
.modal-enter-active { transition: opacity 0.2s ease; }
.modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .cp-dialog { animation: dialogIn 0.25s ease; }
@keyframes dialogIn { from { transform: translateY(12px) scale(0.97); opacity: 0; } }
</style>
