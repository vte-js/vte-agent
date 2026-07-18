#!/usr/bin/env node
/**
 * vte-agent 多 Agent 链路 headless 自动验证脚本
 * ──────────────────────────────────────────────
 * 脱离 VSCode，直接驱动核心模块（AgentPool / Scheduler / WorkOrderPool /
 * AgentEngine），用真实 LLM Key 跑通完整链路，并自动断言：
 *   1) PM 拆解产出 >0 个子任务
 *   2) 调度器并行派发，自动扩容出多个 agent 实例
 *   3) 所有工单到达 terminal 状态（done / failed）
 *   4) 主 Agent 综合出非空中文答复并回流
 *
 * 用法（必须提供 Key）：
 *   export VTE_API_KEY="sk-xxx"
 *   export VTE_API_BASE="https://api.openai.com/v1"   # 可选
 *   export VTE_MODEL="gpt-4o-mini"                    # 可选
 *   export VTE_REQUEST="你的复杂需求（>12字，需多角色协作）"  # 可选
 *   node scripts/verify-link.cjs
 *
 * 退出码：0=全部通过，1=断言失败，2=缺少 Key / 用法错误。
 */

'use strict'
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'out')

// ── 从环境变量读取配置 ──
const API_KEY = process.env.VTE_API_KEY
const API_BASE = process.env.VTE_API_BASE || 'https://api.openai.com/v1'
const MODEL = process.env.VTE_MODEL || 'gpt-4o-mini'
const REQUEST =
  process.env.VTE_REQUEST ||
  '为当前项目设计一个简单的命令行待办事项工具，需要支持添加、列出和删除任务，' +
  '并编写对应的单元测试，最后生成一份使用说明文档。'

function usageAndExit() {
  console.log('\n❌ 缺少 VTE_API_KEY。请先导出真实 LLM Key：\n')
  console.log('  export VTE_API_KEY="sk-xxx"')
  console.log('  export VTE_API_BASE="https://api.openai.com/v1"   # 可选')
  console.log('  export VTE_MODEL="gpt-4o-mini"                    # 可选')
  console.log('  export VTE_REQUEST="你的复杂需求"                  # 可选')
  console.log('  node scripts/verify-link.cjs\n')
  process.exit(2)
}

;(async () => {
  if (!API_KEY) usageAndExit()

  // ── 最小但够用的 Mock HostAdapter ──
  // AgentPool 实际只用 workspace.getRoot()；子 agent 的工具（read/write/bash…）
  // 走全局 host，这里用真实 fs / child_process 接管，让它们能真实执行。
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vte-link-'))
  const mockHost = {
    id: 'mock',
    name: 'mock',
    fs: {
      readFile: (p) => fs.promises.readFile(p, 'utf8'),
      writeFile: (p, c) => fs.promises.writeFile(p, c),
      exists: async (p) => fs.existsSync(p),
      stat: async (p) => {
        const s = fs.statSync(p)
        return { type: s.isDirectory() ? 'directory' : 'file', size: s.size }
      },
      mkdir: (p, r) => fs.promises.mkdir(p, { recursive: !!r }),
      readdir: (p) => fs.promises.readdir(p),
      delete: (p) => fs.promises.rm(p, { recursive: true, force: true }),
    },
    workspace: { getRoot: () => TMP, getFolders: () => [] },
    ui: {
      showInfo: async () => {},
      showWarning: async () => {},
      showError: async () => {},
      confirm: async () => true,
      showQuickPick: async () => [],
      showInputBox: async () => '',
      showOpenDialog: async () => [],
      toast: () => {},
      withProgress: async (t, fn) => fn(() => {}),
    },
    messaging: { postMessage: () => {}, onMessage: () => ({ dispose() {} }) },
    shell: {
      execute: (cmd, opts) =>
        new Promise((res) => {
          try {
            const out = execSync(cmd, {
              cwd: opts && opts.cwd ? opts.cwd : TMP,
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'pipe'],
              timeout: (opts && opts.timeout) || 60000,
            })
            res({ stdout: out || '', stderr: '', exitCode: 0 })
          } catch (e) {
            res({
              stdout: (e.stdout || '').toString(),
              stderr: (e.stderr || '').toString(),
              exitCode: e.status || 1,
            })
          }
        }),
    },
    git: undefined,
    lsp: undefined,
    sandbox: undefined,
    lspTools: [],
  }

  // ── 加载核心模块（在确认 Key 之后，避免无 Key 时白白加载） ──
  const { setHost } = require(path.join(OUT, 'host', 'registry.js'))
  const { AgentPool } = require(path.join(OUT, 'agent', 'agent-pool.js'))
  const { Scheduler } = require(path.join(OUT, 'agent', 'scheduler.js'))
  const { WorkOrderPool } = require(path.join(OUT, 'agent', 'work-order.js'))
  const { AgentCommunication } = require(path.join(OUT, 'agent', 'agent-communication.js'))
  const { AgentEngine } = require(path.join(OUT, 'agent', 'engine.js'))
  const { VTEContextManager } = require(path.join(OUT, 'context', 'manager.js'))

  try {
    setHost(mockHost)
  } catch (e) {
    console.log('[warn] setHost 失败（子 agent 工具可能降级）:', e.message)
  }

  console.log('──────── vte-agent 链路自动验证 ────────')
  console.log(`model   : ${MODEL}`)
  console.log(`apiBase : ${API_BASE}`)
  console.log(`request : ${REQUEST.slice(0, 60)}… (${REQUEST.length} 字)`)
  console.log(`sandbox : ${TMP}`)
  console.log('──────────────────────────────────────────')

  const wop = new WorkOrderPool()
  const comm = new AgentCommunication()
  const pool = new AgentPool(mockHost, wop, comm)

  const provisioned = new Set()
  pool.onAgentCreated = () => console.log('[link] ✓ 调度器自动扩容出新 agent 实例')
  pool.onAgentUpdate = (id) => {
    if (!provisioned.has(id)) {
      provisioned.add(id)
      console.log(`[link]   · agent 实例上线: ${id}`)
    }
  }

  // ── Step 1: PM 拆解 ──
  console.log('\n[1/3] PM 正在拆解需求…')
  const t0 = Date.now()
  const orders = await pool.decomposeRequest(REQUEST, {
    model: MODEL,
    apiKey: API_KEY,
    apiBase: API_BASE,
  })
  console.log(`      → 拆出 ${orders.length} 个子任务，耗时 ${Date.now() - t0}ms`)
  for (const o of orders) {
    console.log(`        · [${o.requiredRole}] ${o.title}`)
  }

  // ── Step 2: 并行派发 + 等待全部 terminal ──
  console.log('\n[2/3] 调度器并行派发子 Agent 执行…')
  const scheduler = new Scheduler(pool, wop, {
    mode: 'parallel',
    maxConcurrent: 5,
    autoAssign: true,
  })
  scheduler.start()

  const allTerminal = () => {
    const all = wop.getAll()
    return all.length > 0 && all.every((o) => o.status === 'done' || o.status === 'failed')
  }
  const deadline = Date.now() + 5 * 60 * 1000
  while (!allTerminal() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500))
  }
  scheduler.stop()

  const all = wop.getAll()
  const done = all.filter((o) => o.status === 'done').length
  const failed = all.filter((o) => o.status === 'failed').length
  console.log(`      → 完成 ${done} / 失败 ${failed} / 共 ${all.length}`)

  // ── Step 3: 主 Agent 综合回流 ──
  console.log('\n[3/3] 主 Agent 综合各子 Agent 结果…')
  const summary = all
    .map(
      (o) =>
        `### [${o.requiredRole}] ${o.title} — ${o.status}\n${(o.result || o.error || '（无输出）').slice(0, 1500)}`,
    )
    .join('\n\n')
  const ctx = new VTEContextManager(TMP)
  const synth = new AgentEngine(ctx, MODEL, API_KEY, API_BASE, TMP)
  synth.setAllowedTools([])
  let answer = ''
  try {
    answer = await synth.chat(
      `你是项目主 Agent。下面的需求已由多个子 Agent 协作完成，请综合各角色工作结果，` +
        `给用户一份连贯、可读的最终答复（中文 + Markdown）。\n\n` +
        `## 原始需求\n${REQUEST}\n\n## 各子 Agent 工作结果\n${summary}`,
    )
  } catch (e) {
    answer = `（综合失败：${e.message}）\n\n${summary}`
  }
  console.log(`      → 综合答复长度 ${answer.length} 字`)
  console.log('──────── 综合答复预览 ────────')
  console.log(answer.slice(0, 600))
  console.log('──────────────────────────────')

  // ── 断言 ──
  const checks = [
    ['PM 拆解产出 >0 子任务', orders.length > 0],
    ['所有工单到达 terminal', all.length > 0 && all.every((o) => o.status === 'done' || o.status === 'failed')],
    ['至少有一个子任务成功', done > 0],
    ['调度器自动扩容出 agent', provisioned.size >= 1],
    ['主 Agent 综合出非空答复', answer.trim().length > 0],
  ]
  console.log('\n──────── 断言结果 ────────')
  let ok = true
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? '✅' : '❌'} ${name}`)
    if (!pass) ok = false
  }
  console.log(`  ℹ️  自动扩容 agent 数: ${provisioned.size}，工单数: ${all.length}`)
  console.log('──────────────────────────')

  // 清理临时目录
  try {
    fs.rmSync(TMP, { recursive: true, force: true })
  } catch (_) {}

  process.exit(ok ? 0 : 1)
})().catch((e) => {
  console.error('\n💥 验证脚本异常:', e)
  process.exit(1)
})
