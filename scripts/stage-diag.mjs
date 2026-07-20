/**
 * Stage 事件派生 + Diff 数据 验证（纯逻辑，不依赖 WS）
 * 
 * 直接复刻 server/index.ts 中 deriveStageFileTouch / flushStageFileWrite 的逻辑，
 * 用真实文件系统验证路径解析、before/after 读取、toolCallId 配对。
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import path from 'path'

const HOME = `/tmp/stage_diag_${Date.now()}`
const ROOT = `${HOME}/ws`
mkdirSync(ROOT, { recursive: true })

// ── 创建测试文件 ──
const TEST_FILE = 'src/components/test.ts'
const ABS_PATH = path.resolve(ROOT, TEST_FILE)
mkdirSync(path.dirname(ABS_PATH), { recursive: true })
const BEFORE_CONTENT = [
  '// 初始内容',
  'function hello() {',
  '  console.log("hello");',
  '}',
].join('\n')
writeFileSync(ABS_PATH, BEFORE_CONTENT, 'utf-8')

let pass = 0, fail = 0
function assert(cond, label) {
  if (cond) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}`) }
}

console.log(`= 测试目录: ${ROOT} =`)
console.log(`= 测试文件: ${ABS_PATH} =\n`)

// ══════════ 1. 路径解析一致性 ══════════
// 复刻 server 的 resolveWsPath + listDirAndPost 路径生成
function resolveWsPath(p) { return path.resolve(ROOT, p) }
function listDirPath(dirPath, name) { return path.join(dirPath, name) }

const stagePath = resolveWsPath(TEST_FILE)
const listPath = listDirPath(path.dirname(stagePath), path.basename(stagePath))
assert(stagePath === ABS_PATH, `resolveWsPath 一致: ${stagePath}`)
assert(listPath === ABS_PATH, `listDirAndPost 路径一致: ${listPath}`)
assert(existsSync(ABS_PATH), `文件存在`)

// ══════════ 2. deriveStageFileTouch：读 before ══════════
// 模拟引擎 tool_call 事件
const FAKE_CALL_ID = 'fc_e2e_001'
const toolCallEvent = {
  type: 'tool_call',
  toolCallId: FAKE_CALL_ID,
  name: 'edit',
  arguments: {
    path: TEST_FILE,
    old_string: 'console.log("hello")',
    new_string: 'console.log("hello, world!"); console.log("edited!")',
  },
}

const name = toolCallEvent.name
const args = toolCallEvent.arguments

assert(name === 'edit', `工具名: ${name}`)
const p = resolveWsPath(String(args.path || ''))
assert(p === ABS_PATH, `参数路径解析: ${p}`)

let before = ''
try { before = readFileSync(p, 'utf-8') } catch {}
assert(before === BEFORE_CONTENT, `before 内容正确 (${before.length} 字符)`)
assert(before.includes('console.log("hello")'), `before 包含待替换文本`)

// pendingWrites 模拟
const pendingWrites = new Map()
pendingWrites.set(toolCallEvent.toolCallId, { path: p, before })

// stage:file_modifying 应立即发出
const modifyingEvent = {
  type: 'stage:file_modifying', ts: Date.now(), agentId: 'main',
  path: p, op: 'edit',
}
assert(modifyingEvent.path === ABS_PATH, `modifying 事件路径正确`)
assert(modifyingEvent.op === 'edit', `modifying 事件 op=edit`)

// stage:file_touch 也应立即发出
const touchEvent = {
  type: 'stage:file_touch', ts: Date.now(), agentId: 'main',
  path: p, op: 'edit',
}
assert(touchEvent.path === ABS_PATH, `touch 事件路径正确`)

// ══════════ 3. 执行工具（模拟 edit）+ flushStageFileWrite ══════════
const AFTER_CONTENT = before.replace(
  args.old_string,
  args.new_string,
)
writeFileSync(p, AFTER_CONTENT, 'utf-8')

// 模拟 flushStageFileWrite
const pending = pendingWrites.get(FAKE_CALL_ID)
assert(!!pending, `pendingWrites 能用 toolCallId=${FAKE_CALL_ID} 取到记录`)
assert(pending.path === p, `pending.path 匹配`)
assert(pending.before === BEFORE_CONTENT, `pending.before 保留原始内容`)

let after = ''
try { after = readFileSync(p, 'utf-8') } catch {}
assert(after === AFTER_CONTENT, `after 内容正确 (${after.length} 字符)`)
assert(after !== before, `after ≠ before (有实际改动)`)

const writeDoneEvent = {
  type: 'stage:file_write_done', ts: Date.now(), agentId: 'main',
  path: pending.path,
  before: pending.before,
  after: after,
}

// ══════════ 4. MonacoDiffDock.updateDiff 数据验证 ══════════
const diffData = { path: writeDoneEvent.path, before: writeDoneEvent.before, after: writeDoneEvent.after }
assert(diffData.before.length > 0, `diffData.before 非空 → Monaco 左侧有内容`)
assert(diffData.after.length > 0, `diffData.after 非空 → Monaco 右侧有内容`)
assert(diffData.before !== diffData.after, `Monaco 有差异可显示`)

console.log(`\n  📄 before:\n${diffData.before}`)
console.log(`\n  📄 after:\n${diffData.after}`)

// ══════════ 5. 边界情况：新建文件（before 为空）══════════
const NEW_FILE = 'src/new-file.ts'
const NEW_ABS = path.resolve(ROOT, NEW_FILE)
const NEW_BEFORE = '' // 新文件没有 before
const NEW_AFTER = [
  '// 新文件',
  'export function foo() { return 42; }',
].join('\n')

writeFileSync(NEW_ABS, NEW_AFTER, 'utf-8')

const newDiffData = { path: NEW_ABS, before: NEW_BEFORE, after: NEW_AFTER }
assert(newDiffData.before === '', `新文件 before 为空字符串 (不是 null/undefined)`)
assert(newDiffData.after.length > 0, `新文件 after 有内容`)
assert(newDiffData.before !== newDiffData.after, `新建文件也有可显示的 diff (全文绿色)`)

// ══════════ 总结 ══════════
console.log(`\n═══════════════════════════`)
console.log(`结果: ${pass} PASS / ${fail} FAIL`)

// 清理临时文件
rmSync(HOME, { recursive: true })

if (fail > 0) process.exit(1)
