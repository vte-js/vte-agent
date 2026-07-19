<script setup lang="ts">
defineProps<{ config: any }>()
</script>

<template>
  <div class="ide-pane-inner">
    <div class="ide-pane-header">
      <span class="ide-pane-header-icon">
        <!-- folder icon -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      </span>
      项目
    </div>
    <div class="ide-pane-body">

      <!-- Model info -->
      <div class="ide-section">
        <div class="ide-section-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          模型配置
        </div>
        <div class="ide-card">
          <div class="ide-card-row">
            <span class="ide-card-label">活跃模型</span>
            <span class="ide-badge primary">{{ config?.models?.[0]?.model || '—' }}</span>
          </div>
        </div>
      </div>

      <!-- Workspace -->
      <div class="ide-section">
        <div class="ide-section-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
          工作区
        </div>
        <div class="ide-card">
          <div class="ide-card-row">
            <span class="ide-card-label">路径</span>
            <span class="ide-badge neutral font-mono" :title="config?.workspace">{{ (config?.workspace || '—').split('/').pop() }}</span>
          </div>
        </div>
      </div>

      <!-- File tree placeholder (M2) -->
      <div class="ide-section">
        <div class="ide-section-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          文件树
        </div>
        <div class="ide-placeholder">
          <div class="ide-placeholder-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
          </div>
          <span>接入服务端 <code style="font-family:var(--vscode-editor-font-family);font-size:11px;background:var(--vte-input-bg);padding:1px 5px;border-radius:4px">fs</code> 接口</span>
          <span style="font-size:11px;opacity:.7">渲染可折叠目录树，点击文件在中栏预览</span>
        </div>
      </div>

      <!-- Git status placeholder (M2) -->
      <div class="ide-section">
        <div class="ide-section-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v1a3 3 0 0 1-3 3h-2"/><path d="M6 9v1a3 3 0 0 0 3 3h2"/></svg>
          Git 状态
        </div>
        <div class="ide-placeholder">
          <div class="ide-placeholder-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <span>展示当前分支与改动数</span>
          <span style="font-size:11px;opacity:.7">复用 HostGit 接口</span>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.ide-pane-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
