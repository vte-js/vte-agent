<template>
  <div class="task-panel" v-if="tasks.length > 0">
    <div class="task-head" @click="expanded = !expanded">
      <div class="task-head-left">
        <svg class="task-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span class="task-label">任务清单</span>
      </div>
      <div class="task-head-right">
        <span class="task-counter">{{ doneCount }}/{{ totalCount }}</span>
        <svg class="task-toggle" :class="{ rotated: !expanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>
    <div class="task-progress-wrap" v-show="expanded">
      <div class="task-progress-bar">
        <div class="task-progress-fill" :style="{ width: progressPct + '%' }"></div>
      </div>
      <span class="task-progress-text">{{ progressPct }}%</span>
    </div>
    <Transition name="expand">
      <div v-show="expanded" class="task-items">
        <TransitionGroup name="task">
          <template v-for="task in sortedTasks" :key="task.id">
            <div class="task-row" :class="task.status">
              <div class="task-status" :class="task.status">
                <svg v-if="task.status === 'done'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else-if="task.status === 'in_progress'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <svg v-else-if="task.status === 'blocked'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                <span v-else class="task-dot"></span>
              </div>
              <div class="task-body">
                <span class="task-name" :class="{ done: task.status === 'done' }">{{ task.title }}</span>
                <span v-if="task.subtasks && task.subtasks.length > 0" class="task-sub-count">{{ getSubDone(task) }}/{{ task.subtasks.length }}</span>
              </div>
              <span v-if="task.status === 'in_progress'" class="task-status-tag active">进行中</span>
              <span v-else-if="task.status === 'blocked'" class="task-status-tag blocked">阻塞</span>
            </div>
            <!-- Subtasks -->
            <div v-if="task.subtasks && task.subtasks.length > 0" class="task-subtasks">
              <div v-for="subId in task.subtasks" :key="subId" class="task-row sub" :class="getSubTask(subId)?.status">
                <div class="task-status sm" :class="getSubTask(subId)?.status">
                  <svg v-if="getSubTask(subId)?.status === 'done'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else-if="getSubTask(subId)?.status === 'in_progress'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span v-else class="task-dot sm"></span>
                </div>
                <span class="task-name sm" :class="{ done: getSubTask(subId)?.status === 'done' }">{{ getSubTask(subId)?.title }}</span>
              </div>
            </div>
          </template>
        </TransitionGroup>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

export interface Task {
  id: number
  title: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
  subtasks?: number[]
}

const props = defineProps<{
  tasks: Task[]
}>()

const expanded = ref(true)

const allTasks = computed(() => {
  const map = new Map<number, Task>()
  props.tasks.forEach(t => map.set(t.id, t))
  // Also collect subtasks from nested structure
  props.tasks.forEach(t => {
    if (t.subtasks) {
      t.subtasks.forEach(sub => {
        // Find subtask in flat list if available
      })
    }
  })
  return map
})

const topLevelTasks = computed(() => props.tasks)

const totalCount = computed(() => {
  let count = 0
  function countAll(tasks: Task[]) {
    tasks.forEach(t => {
      count++
      if (t.subtasks) {
        const subs = t.subtasks.map(id => props.tasks.find(st => st.id === id)).filter(Boolean) as Task[]
        countAll(subs)
      }
    })
  }
  countAll(topLevelTasks.value)
  return count
})

const doneCount = computed(() => {
  let count = 0
  function countDone(tasks: Task[]) {
    tasks.forEach(t => {
      if (t.status === 'done') count++
      if (t.subtasks) {
        const subs = t.subtasks.map(id => props.tasks.find(st => st.id === id)).filter(Boolean) as Task[]
        countDone(subs)
      }
    })
  }
  countDone(topLevelTasks.value)
  return count
})

const progressPct = computed(() => totalCount.value > 0 ? Math.round((doneCount.value / totalCount.value) * 100) : 0)

const sortedTasks = computed(() => {
  const order = { in_progress: 0, blocked: 1, pending: 2, done: 3 }
  return [...topLevelTasks.value].sort((a, b) => order[a.status] - order[b.status])
})

function getSubTask(id: number): Task | undefined {
  return props.tasks.find(t => t.id === id)
}

function getSubDone(task: Task): number {
  if (!task.subtasks) return 0
  return task.subtasks.filter(id => {
    const sub = getSubTask(id)
    return sub && sub.status === 'done'
  }).length
}
</script>
