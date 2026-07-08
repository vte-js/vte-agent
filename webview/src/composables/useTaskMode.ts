import { ref } from 'vue'
import { useVsCode } from './useVsCode'
import type { TaskMode } from '../protocol'

export function useTaskMode() {
  const { send } = useVsCode()
  const taskMode = ref<TaskMode>('off')

  function setTaskMode(mode: TaskMode) {
    taskMode.value = mode
    send({ type: 'setTaskMode', taskMode: mode })
  }

  return { taskMode, setTaskMode }
}
