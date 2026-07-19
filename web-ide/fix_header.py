import sys

with open('web-ide/client/src/App.vue', 'r') as f:
    content = f.read()

start_marker = '<span class="ide-title">VTE Agent<span class="ide-title-sub">Web IDE</span></span>'
end_marker = '</header>\n\n'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx) + len(end_marker)

if start_idx < 0 or end_idx < 0:
    print(f"ERROR: start={start_idx}, end={end_idx}")
    sys.exit(1)

print(f"Replacing from byte {start_idx} to {end_idx}")

new_content = '''<span class="ide-title">VTE Agent<span class="ide-title-sub">Web IDE</span></span>
      </div>

    <!-- Row 1, Col 3: center-zone header -->
    <div class="ide-hdr-cell ide-hdr-center">
      <div class="pane-header-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>对话</span>
      </div>
      <div class="pane-header-actions">
        <div class="hist-wrap">
          <button class="pane-hdr-btn" :class="{ active: showHistory }" title="会话历史" @click="onToggleHistory">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
          </button>
          <div v-if="showHistory" class="hist-backdrop" @click="showHistory = false"></div>
          <div v-if="showHistory" class="hist-popover">
            <div class="hist-pop-head">会话历史</div>
            <template v-if="chat.historyCount.value > 0">
              <div class="hist-pop-row"><span>已保存</span><span class="hist-pop-val">{{ historyTime }}</span></div>
              <div class="hist-pop-row"><span>消息数</span><span class="hist-pop-val">{{ chat.historyCount.value }} 条</span></div>
              <button class="hist-restore" @click="onRestoreHistory">恢复上次对话</button>
            </template>
            <div v-else class="hist-pop-empty">暂无保存的对话</div>
          </div>
        </div>
        <button class="pane-hdr-btn" title="清空对话" @click="onClearChat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>

    <!-- Row 1, Col 5: right-zone header -->
    <div class="ide-hdr-cell ide-hdr-right">
      <div class="pane-header-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        <span>概览</span>
      </div>
      <div class="pane-header-actions">
        <span class="ide-status-dot" :class="{ disconnected: !connected }" :title="connected ? '已连接' : '连接中…'" />
        <button class="ide-hdr-icon-btn" :class="{ active: config.configVisible.value }" :title="config.configVisible.value ? '关闭设置' : '设置'" @click="config.toggleConfig()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06-.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </div>'''

content = content[:start_idx] + new_content + content[end_idx:]

with open('web-ide/client/src/App.vue', 'w') as f:
    f.write(content)

print("DONE - replaced old unified header with 3 per-zone header cells")
