<template>
  <Teleport to="body">
    <Transition name="img-preview">
      <div v-if="src" class="img-preview-overlay" @click="$emit('close')">
        <img :src="src" :alt="name" class="img-preview-img" @click.stop />
        <button class="img-preview-close" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  src: string
  name?: string
}>()

defineEmits<{
  close: []
}>()
</script>

<style scoped>
.img-preview-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.85); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  cursor: zoom-out;
}
.img-preview-img {
  max-width: 90vw; max-height: 90vh;
  object-fit: contain; border-radius: 8px;
  cursor: default;
}
.img-preview-close {
  position: absolute; top: 16px; right: 16px;
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.15); border: none;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.img-preview-close:hover { background: rgba(255,255,255,0.3); }
.img-preview-close svg { width: 18px; height: 18px; stroke: #fff; }

.img-preview-enter-active { transition: opacity 0.2s ease; }
.img-preview-leave-active { transition: opacity 0.15s ease; }
.img-preview-enter-from, .img-preview-leave-to { opacity: 0; }
</style>
