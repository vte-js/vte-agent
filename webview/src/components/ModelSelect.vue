<template>
  <div class="c-select" :class="['c-select--' + size]" @click.stop="open = !open">
    <div class="c-select-trigger">
      <span>{{ displayLabel }}</span>
      <span class="c-select-arrow"></span>
    </div>
    <div v-if="open" class="c-select-list">
      <div
        v-for="opt in options"
        :key="opt.value"
        class="c-select-item"
        :class="{ selected: opt.value === modelValue }"
        @click.stop="select(opt.value)"
      >{{ opt.label }}</div>
      <template v-if="allowCustom">
        <div class="c-select-divider"></div>
        <div class="c-select-custom">
          <input
            class="c-input"
            :value="customInput"
            @input="customInput = ($event.target as HTMLInputElement).value"
            @keydown.enter.stop="applyCustom"
            @click.stop
            placeholder="自定义模型名称..."
          />
          <button class="c-select-apply" @click.stop="applyCustom">确定</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  options: Array<{ value: string; label: string }>
  allowCustom?: boolean
  /** 'md' = standard form-input height (default); 'sm' = compact toolbar */
  size?: 'md' | 'sm'
}>(), { allowCustom: true, size: 'md' })

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const customInput = ref('')

const displayLabel = computed(() => {
  const hit = props.options.find(o => o.value === props.modelValue)
  return hit ? hit.label : props.modelValue
})

function select(val: string) {
  emit('update:modelValue', val)
  open.value = false
}

function applyCustom() {
  const val = customInput.value.trim()
  if (val) {
    emit('update:modelValue', val)
    customInput.value = ''
    open.value = false
  }
}

function close() { open.value = false }
onMounted(() => document.addEventListener('click', close))
onUnmounted(() => document.removeEventListener('click', close))
</script>

<style scoped>
/* Self-contained styling — no reliance on global theme.css .c-select block.
   Theme-aware via --vte-* tokens, overridable with --csel-* vars on a
   parent wrapper (no :deep() patches needed). */
.c-select {
  --csel-bg: var(--vte-input-bg);
  --csel-border: var(--vte-input-border);
  --csel-text: var(--vte-text);
  --csel-muted: var(--vte-text-muted);
  --csel-radius: 8px;
  position: relative;
  width: 100%;
}
.c-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  background: var(--csel-bg);
  border: 1px solid var(--csel-border);
  color: var(--csel-text);
  line-height: 1.4;
  transition: border-color .15s;
}
.c-select-trigger > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.c-select--md .c-select-trigger {
  padding: 7px 12px;
  font-size: 13px;
  border-radius: var(--csel-radius);
  min-height: 34px;
}
.c-select--sm .c-select-trigger {
  padding: 4px 10px;
  font-size: 11px;
  border-radius: 6px;
  min-height: 28px;
}
.c-select-trigger:hover { border-color: var(--csel-muted); }
.c-select-arrow {
  width: 0; height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--csel-muted);
  transition: transform .15s;
  flex-shrink: 0;
}
.c-select.open .c-select-arrow { transform: rotate(180deg); }

.c-select-list {
  margin-top: 4px;
  background: var(--vte-bg-elevated);
  border: 1px solid var(--vte-border);
  border-radius: var(--csel-radius);
  padding: 4px;
  max-height: 240px;
  overflow-y: auto;
}
.c-select--md .c-select-item { padding: 7px 12px; font-size: 13px; }
.c-select--sm .c-select-item { padding: 5px 10px; font-size: 11px; }
.c-select-item {
  border-radius: 6px;
  color: var(--csel-text);
  cursor: pointer;
  white-space: nowrap;
}
.c-select-item:hover { background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08)); }
.c-select-item.selected { background: rgba(99,102,241,0.18); color: #a5b4fc; }
.c-select-divider { height: 1px; background: var(--vte-border); margin: 4px 6px; }
.c-select-custom { display: flex; gap: 4px; padding: 4px 6px; align-items: center; }
.c-select-custom .c-input { flex: 1; padding: 4px 8px; font-size: 12px; min-width: 0; }
.c-select-apply {
  padding: 4px 8px; border-radius: 6px; border: none;
  background: var(--vte-primary); color: #fff; font-size: 11px;
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
</style>
