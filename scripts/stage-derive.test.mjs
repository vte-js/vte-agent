/**
 * Logic test for the VTE Stage `stage:*` derivation used in
 * web-ide/server/index.ts (emitUpdate → deriveStageFileTouch / flushStageFileWrite).
 *
 * Mirrors the EXACT algorithm (including the disk-read at tool_call time for
 * "before" and at tool_result time for "after") with an in-memory mock fs,
 * so we can prove event correctness WITHOUT a real LLM / API key.
 *
 * Run: node scripts/stage-derive.test.mjs
 */
import assert from 'node:assert'

// ── mock fs (in-memory) ──
const fsMap = new Map()
function mockRead(p) {
  if (!fsMap.has(p)) throw new Error('ENOENT')
  return fsMap.get(p)
}
// seed an existing file
fsMap.set('/ws/foo.ts', 'OLD CONTENT')

// ── pending writes (module-level in the real server) ──
const pendingWrites = new Map()
const currentWorkspace = '/ws'
const path = { resolve: (root, p) => (p && p.startsWith('/') ? p : `${root}/${p}`) }
const post = (m) => out.push(m)
const out = []

// ── the algorithm under test (copied 1:1 from index.ts) ──
function deriveStageFileTouch(u) {
  const name = u.name
  const args = u.arguments || {}
  if (name === 'read') {
    const p = path.resolve(currentWorkspace, String(args.path || ''))
    if (p) post({ type: 'stage:file_touch', ts: Date.now(), agentId: 'main', path: p, op: 'read' })
    return
  }
  if (name === 'write' || name === 'edit') {
    const p = path.resolve(currentWorkspace, String(args.path || ''))
    if (!p) return
    // ① Immediately signal "modifying" (NEW in M1-opt)
    post({ type: 'stage:file_modifying', ts: Date.now(), agentId: 'main', path: p, op: name === 'write' ? 'write' : 'edit' })
    let before = ''
    try { before = mockRead(p) } catch { /* new file */ }
    pendingWrites.set(u.toolCallId, { path: p, before })
    post({ type: 'stage:file_touch', ts: Date.now(), agentId: 'main', path: p, op: name === 'write' ? 'write' : 'edit' })
  }
}
function flushStageFileWrite(u) {
  const pending = pendingWrites.get(u.toolCallId)
  if (!pending) return
  pendingWrites.delete(u.toolCallId)
  let after = ''
  try { after = mockRead(pending.path) } catch { /* removed */ }
  post({
    type: 'stage:file_write_done',
    ts: Date.now(),
    agentId: 'main',
    path: pending.path,
    before: pending.before,
    after,
  })
}

// ═══════════════════════════════════════════
// Scenario 1: edit an EXISTING file
//   Expected events: modifying → touch(edit) → write_done
// ═══════════════════════════════════════════
deriveStageFileTouch({ type: 'tool_call', toolCallId: 'c1', name: 'edit', arguments: { path: 'foo.ts', old_string: 'OLD', new_string: 'NEW' } })
fsMap.set('/ws/foo.ts', 'NEW CONTENT') // simulate the tool writing
flushStageFileWrite({ type: 'tool_result', toolCallId: 'c1' })

// ═══════════════════════════════════════════
// Scenario 2: read a file (no diff/modifying emitted)
// ═══════════════════════════════════════════
deriveStageFileTouch({ type: 'tool_call', toolCallId: 'c2', name: 'read', arguments: { path: 'bar.ts' } })

// ═══════════════════════════════════════════
// Scenario 3: write a NEW file (before should be '')
// ═══════════════════════════════════════════
deriveStageFileTouch({ type: 'tool_call', toolCallId: 'c3', name: 'write', arguments: { path: 'new.ts', content: 'FRESH' } })
fsMap.set('/ws/new.ts', 'FRESH')
flushStageFileWrite({ type: 'tool_result', toolCallId: 'c3' })

// ═══════════════════════════════════════════
// Scenario 4: orphan tool_result (no matching call)
// ═══════════════════════════════════════════
flushStageFileWrite({ type: 'tool_result', toolCallId: 'orphan' })

// ═══════════════════════════════════════════
// Assertions
// ═══════════════════════════════════════════

// Scenario 1: edit existing file → modifying + touch + write_done
const modFoo = out.filter((m) => m.type === 'stage:file_modifying' && m.path === '/ws/foo.ts')
const touchFoo = out.find((m) => m.type === 'stage:file_touch' && m.path === '/ws/foo.ts')
const writeDoneFoo = out.find((m) => m.type === 'stage:file_write_done' && m.path === '/ws/foo.ts')

assert.ok(modFoo.length === 1 && modFoo[0].op === 'edit', '① edit should emit stage:file_modifying op=edit FIRST')
assert.ok(touchFoo && touchFoo.op === 'edit', '② edit should emit stage:file_touch op=edit AFTER modifying')
assert.ok(writeDoneFoo, '③ edit should emit stage:file_write_done')
assert.strictEqual(writeDoneFoo.before, 'OLD CONTENT', '④ before must be pre-edit content')
assert.strictEqual(writeDoneFoo.after, 'NEW CONTENT', '⑤ after must be post-edit content')

// Event ordering: modifying MUST come before touch for same path
const fooEvents = out.filter((m) => m.path === '/ws/foo.ts')
const modIdx = fooEvents.findIndex((m) => m.type === 'stage:file_modifying')
const touchIdx = fooEvents.findIndex((m) => m.type === 'stage:file_touch')
assert.ok(modIdx < touchIdx, '⑥ modifying event must precede file_touch event')

// Scenario 2: read only emits touch (no modifying, no write_done)
const readBar = out.find((m) => m.type === 'stage:file_touch' && m.path === '/ws/bar.ts')
assert.ok(readBar && readBar.op === 'read', '⑦ read should emit file_touch op=read')
assert.ok(!out.some((m) => m.type === 'stage:file_modifying' && m.path === '/ws/bar.ts'), '⑧ read must NOT emit modifying')
assert.ok(!out.some((m) => m.type === 'stage:file_write_done' && m.path === '/ws/bar.ts'), '⑨ read must NOT emit a diff')

// Scenario 3: new file
const writeDoneNew = out.find((m) => m.type === 'stage:file_write_done' && m.path === '/ws/new.ts')
assert.ok(writeDoneNew && writeDoneNew.before === '', '⑩ new-file before must be empty string')
assert.strictEqual(writeDoneNew.after, 'FRESH', '⑪ new-file after must equal written content')
const modNew = out.some((m) => m.type === 'stage:file_modifying' && m.path === '/ws/new.ts')
assert.ok(modNew, '⑫ write to NEW file must also emit modifying')

// Scenario 4: orphan idempotent
assert.strictEqual(pendingWrites.size, 0, '⑭ pendingWrites must be drained')
assert.ok(!out.some((m) => m.agentId !== 'main'), '⑮ agentId defaults to main')

console.log('✅ stage-derive logic test PASSED (' + out.length + ' events)')
console.log('   event sequence:')
out.forEach((m) => {
  const extra = m.before !== undefined ? `  before=${JSON.stringify(m.before)} after=${JSON.stringify(m.after)}` : ''
  console.log('   •', m.type.padEnd(26), (m.path || '').padEnd(20), m.op || '', extra)
})
