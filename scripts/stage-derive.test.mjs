/**
 * Logic test for the VTE Stage `stage:*` derivation used in
 * web-ide/server/index.ts (emitUpdate → deriveStageFileTouch / flushStageFileWrite).
 *
 * Mirrors the EXACT algorithm (including the disk-read at tool_call time for
 * "before" and at tool_result time for "after") with an in-memory mock fs,
 * so we can prove event correctness WITHOUT a real LLM / API key.
 *
 * Key timing invariant (post-M1-opt fix):
 *   deriveStageFileTouch  → only sends stage:file_modifying (NO touch yet)
 *   flushStageFileWrite    → sends stage:file_touch + stage:file_write_done
 *   This ensures "modifying" spinner has visible duration.
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

// ── the algorithm under test (copied 1:1 from index.ts, post-M1-opt) ──
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
    // Only send modifying here — defer touch to write_done for visible duration.
    post({ type: 'stage:file_modifying', ts: Date.now(), agentId: 'main', path: p, op: name === 'write' ? 'write' : 'edit' })
    let before = ''
    try { before = mockRead(p) } catch { /* new file */ }
    pendingWrites.set(u.toolCallId, { path: p, before })
    // NOTE: NO stage:file_touch here anymore — moved to flushStageFileWrite
  }
}
function flushStageFileWrite(u) {
  const pending = pendingWrites.get(u.toolCallId)
  if (!pending) return
  pendingWrites.delete(u.toolCallId)
  let after = ''
  try { after = mockRead(pending.path) } catch { /* removed */ }
  // NOW send touch (transitions spinner → highlight)
  post({ type: 'stage:file_touch', ts: Date.now(), agentId: 'main', path: pending.path, op: 'write' })
  // And diff data for Monaco dock.
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
//   Expected events: modifying → [tool executes] → touch + write_done
//   Key: NO touch during tool_call phase!
// ═══════════════════════════════════════════
deriveStageFileTouch({ type: 'tool_call', toolCallId: 'c1', name: 'edit', arguments: { path: 'foo.ts', old_string: 'OLD', new_string: 'NEW' } })

// Verify: ONLY modifying emitted, no touch yet at this point
const eventsAfterCall1 = out.filter(m => m.path === '/ws/foo.ts')
assert.ok(eventsAfterCall1.length === 1 && eventsAfterCall1[0].type === 'stage:file_modifying',
  '① After tool_call: only modifying (no touch/write_done)')

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

// Scenario 1: edit existing file → modifying (call) → touch+write_done (result)
const modFoo = out.filter((m) => m.type === 'stage:file_modifying' && m.path === '/ws/foo.ts')
const touchFoo = out.filter((m) => m.type === 'stage:file_touch' && m.path === '/ws/foo.ts')
const writeDoneFoo = out.find((m) => m.type === 'stage:file_write_done' && m.path === '/ws/foo.ts')

assert.ok(modFoo.length === 1 && modFoo[0].op === 'edit', '① edit emits stage:file_modifying op=edit at tool_call')
assert.ok(touchFoo.length === 1 && touchFoo[0].op === 'write', '② edit emits stage:file_touch op=write at tool_result (NOT at tool_call)')
assert.ok(writeDoneFoo, '③ edit emits stage:file_write_done')
assert.strictEqual(writeDoneFoo.before, 'OLD CONTENT', '④ before = pre-edit content')
assert.strictEqual(writeDoneFoo.after, 'NEW CONTENT', '⑤ after = post-edit content')

// Event ordering: modifying < touch for same path (ensures visible modifying window)
const fooEvents = out.filter((m) => m.path === '/ws/foo.ts')
const modIdx = fooEvents.findIndex((m) => m.type === 'stage:file_modifying')
const touchIdx = fooEvents.findIndex((m) => m.type === 'stage:file_touch')
assert.ok(modIdx >= 0 && touchIdx > modIdx, '⑥ modifying precedes touch (visible window exists)')
assert.ok(touchIdx > 0, '⑦ touch is NOT the first event for this file')

// Scenario 2: read only emits touch (no modifying, no write_done)
const readBar = out.find((m) => m.type === 'stage:file_touch' && m.path === '/ws/bar.ts')
assert.ok(readBar && readBar.op === 'read', '⑧ read emits file_touch op=read')
assert.ok(!out.some((m) => m.type === 'stage:file_modifying' && m.path === '/ws/bar.ts'), '⑨ read does NOT emit modifying')
assert.ok(!out.some((m) => m.type === 'stage:file_write_done' && m.path === '/ws/bar.ts'), '⑩ read does NOT emit diff')

// Scenario 3: new file
const writeDoneNew = out.find((m) => m.type === 'stage:file_write_done' && m.path === '/ws/new.ts')
assert.ok(writeDoneNew && writeDoneNew.before === '', '⑪ new-file before="" (empty string, not undefined)')
assert.strictEqual(writeDoneNew.after, 'FRESH', '⑫ new-file after = written content')
const modNew = out.some((m) => m.type === 'stage:file_modifying' && m.path === '/ws/new.ts')
assert.ok(modNew, '⑬ new-file write also emits modifying')

// Scenario 4: orphan idempotent
assert.strictEqual(pendingWrites.size, 0, '⑭ pendingWorks drained')
assert.ok(!out.some((m) => m.agentId !== 'main'), '⑮ agentId=main always')

console.log('✅ stage-derive logic test PASSED (' + out.length + ' events)')
console.log('   full event sequence:')
out.forEach((m) => {
  const extra = m.before !== undefined ? `  before=${JSON.stringify(m.before).slice(0,40)} after=${JSON.stringify(m.after).slice(0,40)}` : ''
  console.log('   •', m.type.padEnd(28), (m.path || '').padEnd(24), m.op || '', extra)
})
