// Dev smoke test for the Web IDE host backend.
// Connects to ws://localhost:<PORT>/ws, sends one chat, prints the event
// stream, and exits. Validates the RAW protocol (no {type:'update'} envelope):
//   configData → thinking → thinking_chunk → stream_chunk(s) → response
//
// Run with the managed Node (server must be up first):
//   VTE_MOCK=1 node ./node_modules/.bin/tsx server/index.ts
//   node scripts/smoke.mjs

import WebSocket from 'ws'

const PORT = process.env.VTE_PORT || '3001'
const URL = `ws://localhost:${PORT}/ws`
const ws = new WebSocket(URL)
const seen = {
  config: false,
  thinking: false,
  thinkingChunk: false,
  chunks: 0,
  response: false,
  error: false,
}
const start = Date.now()
let timer

ws.on('open', () => {
  console.log('[smoke] connected to', URL)
  ws.send(JSON.stringify({ type: 'ready' }))
  setTimeout(() => {
    console.log('[smoke] sending chat: "hello from web ide"')
    ws.send(JSON.stringify({ type: 'chat', text: 'hello from web ide' }))
  }, 200)
})

ws.on('message', (data) => {
  let m
  try {
    m = JSON.parse(data.toString())
  } catch {
    return
  }
  switch (m.type) {
    case 'configData':
      seen.config = true
      console.log('[smoke] configData: model=%s workspace=%s', m.models?.[0]?.model, m.workspace)
      break
    case 'thinking':
      seen.thinking = true
      console.log('[smoke] thinking (turn start)')
      break
    case 'thinking_chunk':
      seen.thinkingChunk = true
      console.log('[smoke] thinking_chunk: %s', m.text?.slice(0, 40))
      break
    case 'stream_chunk':
      seen.chunks++
      break
    case 'response':
      seen.response = true
      console.log('[smoke] RESPONSE (first 120 chars):\n%s', m.text.slice(0, 120))
      break
    case 'error':
      seen.error = true
      console.log('[smoke] ERROR: %s', m.text)
      break
    default:
      // Other raw updates (thinking_start, tool_call, etc.) — log briefly
      if (m.type && !m.type.startsWith('multiAgent:')) {
        console.log('[smoke] msg: %s', m.type)
      }
  }
})

ws.on('error', (e) => {
  console.error('[smoke] ws error:', e.message)
  process.exit(1)
})

timer = setTimeout(() => {
  const ok =
    seen.config &&
    seen.thinking &&
    seen.chunks > 0 &&
    (seen.response || seen.error)
  console.log('\n[smoke] summary: %s', JSON.stringify(seen))
  console.log('[smoke] %s (%dms)', ok ? 'PASS ✅' : 'INCOMPLETE ⚠️', Date.now() - start)
  ws.close()
  process.exit(ok ? 0 : 2)
}, 6000)
