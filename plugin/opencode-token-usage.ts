import { tool, type Plugin } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { Buffer } from "node:buffer"
import { homedir } from "node:os"
import { join } from "node:path"
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises"

const VERSION = "0.1.0"
const DATA_DIR = join(homedir(), ".opencode", "token-usage")
const LEDGER_PATH = join(DATA_DIR, "ledger.json")
const HISTORY_LOG_PATH = join(DATA_DIR, "usage.log")
const BADGE_MARKER = "<!-- opencode-token-usage -->"
const SUBAGENTS = new Set(["general", "explore", "plan"])

type TokenBreakdown = { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }
type TurnRecord = {
  messageID: string
  modelID: string
  providerID: string
  completedAt: number
  tokens: TokenBreakdown
  cost: number
  elapsedMs: number
  contextUsed: number
  contextLimit: number
}
type SessionRecord = { sessionID: string; cwd: string; root: string; turns: TurnRecord[]; updatedAt: number }
type Ledger = { version: string; sessions: Record<string, SessionRecord> }
type Totals = {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  calls: number
  elapsedMs: number
}

const contextLimits = new Map<string, number>()

let ledger: Ledger | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

const num = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

const fmt = (n: number) => n.toLocaleString("en-US")

async function loadLedger(): Promise<Ledger> {
  if (ledger) return ledger
  try {
    ledger = JSON.parse(await readFile(LEDGER_PATH, "utf8"))
  } catch {
    ledger = { version: VERSION, sessions: {} }
  }
  for (const s of Object.values(ledger.sessions)) {
    for (const t of s.turns) {
      if (t.contextLimit > 0) contextLimits.set(`${t.providerID}/${t.modelID}`, t.contextLimit)
    }
  }
  return ledger
}

function persist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(async () => {
    if (!ledger) return
    try {
      await mkdir(DATA_DIR, { recursive: true })
      await writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2))
    } catch {}
  }, 200)
}

function readTokens(info: any): TokenBreakdown | null {
  const t = info?.tokens
  if (!t || typeof t !== "object") return null
  const tokens: TokenBreakdown = {
    input: num(t.input),
    output: num(t.output),
    reasoning: num(t.reasoning),
    cacheRead: num(t.cache?.read ?? t.cacheRead),
    cacheWrite: num(t.cache?.write ?? t.cacheWrite),
  }
  const hasAny = tokens.input || tokens.output || tokens.reasoning || tokens.cacheRead || tokens.cacheWrite || num(info.cost)
  return hasAny ? tokens : null
}

function computeTotals(s: SessionRecord): Totals {
  const totals: Totals = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, calls: s.turns.length, elapsedMs: 0 }
  for (const t of s.turns) {
    totals.input += t.tokens.input
    totals.output += t.tokens.output
    totals.reasoning += t.tokens.reasoning
    totals.cacheRead += t.tokens.cacheRead
    totals.cacheWrite += t.tokens.cacheWrite
    totals.cost += t.cost
    totals.elapsedMs += t.elapsedMs
  }
  return totals
}

const formatDuration = (ms: number) => {
  const seconds = Math.max(0, ms) / 1000
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)}min`
  return `${seconds.toFixed(1)}s`
}

async function recordAssistantMessage(info: any) {
  const sessionID = String(info?.sessionID ?? "")
  const messageID = String(info?.id ?? "")
  if (!sessionID || !messageID || info?.role !== "assistant") return null
  const tokens = readTokens(info)
  if (!tokens) return null
  const data = await loadLedger()
  let session = data.sessions[sessionID]
  if (!session) {
    session = { sessionID, cwd: "", root: "", turns: [], updatedAt: 0 }
    data.sessions[sessionID] = session
  }
  if (info.path?.cwd) session.cwd = String(info.path.cwd)
  if (info.path?.root) session.root = String(info.path.root)
  const modelID = String(info.modelID ?? "")
  const providerID = String(info.providerID ?? "")
  const created = num(info.time?.created)
  const completed = num(info.time?.completed)
  const elapsedMs = created && completed && completed > created ? completed - created : 0
  const contextLimit = contextLimits.get(`${providerID}/${modelID}`) ?? 0
  const contextUsed = tokens.input + tokens.cacheRead
  const turn: TurnRecord = {
    messageID,
    modelID,
    providerID,
    completedAt: completed || created || Date.now(),
    tokens,
    cost: num(info.cost),
    elapsedMs,
    contextUsed,
    contextLimit,
  }
  if (contextLimit > 0) contextLimits.set(`${providerID}/${modelID}`, contextLimit)
  const idx = session.turns.findIndex((x) => x.messageID === messageID)
  if (idx >= 0) session.turns[idx] = turn
  else session.turns.push(turn)
  session.updatedAt = Date.now()
  persist()
  const totals = computeTotals(session)
  const last = session.turns[session.turns.length - 1]
  const hitRate = last.tokens.input + last.tokens.cacheRead > 0 ? (last.tokens.cacheRead / (last.tokens.input + last.tokens.cacheRead)) * 100 : 0
  try {
    await mkdir(DATA_DIR, { recursive: true })
    await appendFile(
      HISTORY_LOG_PATH,
      `[${new Date(turn.completedAt).toISOString()}] session=${sessionID} model=${turn.modelID} ` +
        `input=${turn.tokens.input} output=${turn.tokens.output} reasoning=${turn.tokens.reasoning} ` +
        `cacheRead=${turn.tokens.cacheRead} cacheWrite=${turn.tokens.cacheWrite} cost=${turn.cost.toFixed(6)} ` +
        `cacheHit=${hitRate.toFixed(1)}% elapsed=${elapsedMs}ms ctx=${contextUsed}/${contextLimit || "-"} ` +
        `| sessionTotal=${totals.input + totals.output + totals.reasoning + totals.cacheRead + totals.cacheWrite} calls=${totals.calls}\n`,
    )
  } catch {}
  return turn
}

function formatTurn(t: TurnRecord): string {
  const hitRate = t.tokens.input + t.tokens.cacheRead > 0 ? (t.tokens.cacheRead / (t.tokens.input + t.tokens.cacheRead)) * 100 : 0
  const total = t.tokens.input + t.tokens.output + t.tokens.reasoning + t.tokens.cacheRead + t.tokens.cacheWrite
  const parts = [
    `[Token 统计] 本轮合计 ${fmt(total)} tok · 输入 ${fmt(t.tokens.input)} · 输出 ${fmt(t.tokens.output)}`,
    `缓存读 ${fmt(t.tokens.cacheRead)} · 缓存命中率 ${hitRate.toFixed(1)}% · 1 次调用`,
  ]
  if (t.contextLimit > 0) {
    const pct = t.contextUsed > 0 ? ((t.contextUsed / t.contextLimit) * 100).toFixed(1) : "0"
    parts.push(`上下文 ${fmt(t.contextUsed)}/${fmt(t.contextLimit)}(${pct}%)`)
  }
  return `${parts.join(" · ")} ✓`
}

function formatSession(s: SessionRecord | undefined): string {
  if (!s || !s.turns.length) return "暂无 token 统计"
  const totals = computeTotals(s)
  const hitRate = totals.input + totals.cacheRead > 0 ? (totals.cacheRead / (totals.input + totals.cacheRead)) * 100 : 0
  const grandTotal = totals.input + totals.output + totals.reasoning + totals.cacheRead + totals.cacheWrite
  const last = s.turns[s.turns.length - 1]
  const parts = [
    `[Token 统计] 会话合计 ${fmt(grandTotal)} tok · 输入 ${fmt(totals.input)} · 输出 ${fmt(totals.output)}`,
    `缓存读 ${fmt(totals.cacheRead)} · 缓存命中率 ${hitRate.toFixed(1)}% · ${totals.calls} 次调用`,
  ]
  if (last.contextLimit > 0) {
    const pct = last.contextUsed > 0 ? ((last.contextUsed / last.contextLimit) * 100).toFixed(1) : "0"
    parts.push(`上下文 ${fmt(last.contextUsed)}/${fmt(last.contextLimit)}(${pct}%)`)
  }
  if (totals.elapsedMs > 0) parts.push(`耗时 ${formatDuration(totals.elapsedMs)}`)
  return parts.join(" · ")
}

function formatSummary(label: string, sessionCount: number, totals: Totals, grandTotal: number, hitRate: number): string {
  const parts = [
    `[Token 统计] ${label}合计 ${fmt(grandTotal)} tok · 输入 ${fmt(totals.input)} · 输出 ${fmt(totals.output)}`,
    `缓存读 ${fmt(totals.cacheRead)} · 缓存命中率 ${hitRate.toFixed(1)}% · ${totals.calls} 次调用 · ${sessionCount} 个会话`,
  ]
  if (totals.elapsedMs > 0) parts.push(`耗时 ${formatDuration(totals.elapsedMs)}`)
  return parts.join(" · ")
}

const normPath = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "")

const TokenUsagePlugin: Plugin = async (ctx) => {
  const password = process.env.OPENCODE_SERVER_PASSWORD
  const authorization = password
    ? `Basic ${Buffer.from(`${process.env.OPENCODE_SERVER_USERNAME ?? "opencode"}:${password}`).toString("base64")}`
    : undefined
  const client = createOpencodeClient({
    baseUrl: ctx.serverUrl.toString(),
    directory: ctx.directory,
    headers: authorization ? { Authorization: authorization } : undefined,
  })
  const updating = new Set<string>()
  try {
    await mkdir(DATA_DIR, { recursive: true })
    await appendFile(
      HISTORY_LOG_PATH,
      `[${new Date().toISOString()}] plugin loaded sessionDir=${ctx.directory} serverUrl=${ctx.serverUrl} hasPass=${process.env.OPENCODE_SERVER_PASSWORD ? "yes" : "no"}\n`,
    )
  } catch {}
  return {
    event: async ({ event }) => {
      if (event.type !== "message.updated") return
      const info = (event as any).properties?.info
      const turn = await recordAssistantMessage(info)
      if (!turn || !info?.time?.completed || info.finish === "tool-calls") return
      if (SUBAGENTS.has(info.agent) || info.agent === "compaction") return
      if (updating.has(info.id)) return
      updating.add(info.id)
      try {
        const result = await client.session.message({ sessionID: info.sessionID, messageID: info.id })
        if (result?.error) {
          await appendFile(
            HISTORY_LOG_PATH,
            `[${new Date().toISOString()}] badge-fetch-error session=${info.sessionID} msg=${info.id}: ${JSON.stringify(result.error).slice(0, 300)}\n`,
          ).catch(() => {})
          return
        }
        const parts = result.data?.parts
        const part = Array.isArray(parts)
          ? [...parts].reverse().find((candidate) => candidate.type === "text" && !(candidate as any).ignored)
          : undefined
        if (!part || part.type !== "text" || part.text.includes(BADGE_MARKER)) return
        const text = `${part.text.trimEnd()}\n\n${BADGE_MARKER}\n\`${formatTurn(turn)}\``
        await client.part.update({
          sessionID: info.sessionID,
          messageID: info.id,
          partID: part.id,
          part: { ...part, text },
        })
      } catch (error) {
        try {
          await appendFile(
            HISTORY_LOG_PATH,
            `[${new Date().toISOString()}] badge-append-error session=${info.sessionID} msg=${info.id}: ${error instanceof Error ? error.message : String(error)}\n`,
          )
        } catch {}
      }
      finally {
        updating.delete(info.id)
      }
    },
    "experimental.chat.system.transform": async (input, output) => {
      const model = (input as any).model
      const limit = model?.limits?.context ?? model?.limit?.context ?? model?.context ?? 0
      if (limit > 0 && model?.id) contextLimits.set(`${model.providerID ?? ""}/${model.id}`, limit)
    },
    tool: {
      token_usage: tool({
        description:
          "查询 opencode 的 token 消耗统计：本轮最近一次调用 / 当前会话 / 当前项目 / 全局，包含输入、输出、思考、缓存读写、缓存命中率与成本。",
        args: {
          scope: tool.schema.enum(["turn", "session", "project", "global"]).optional().describe("统计范围，默认 session"),
          detail: tool.schema.boolean().optional().describe("project/global 范围下是否输出逐会话明细，默认 false"),
        },
        async execute(args, tctx) {
          const data = await loadLedger()
          if (args.scope === "turn") {
            const session = data.sessions[tctx.sessionID]
            const last = session?.turns?.[session.turns.length - 1]
            return last ? formatTurn(last) : "本轮暂无统计"
          }
          if (args.scope === "session") {
            return formatSession(data.sessions[tctx.sessionID])
          }
          const dir = normPath(tctx.directory)
          const sessions = args.scope === "project"
            ? Object.values(data.sessions).filter((s) => s.cwd && normPath(s.cwd).startsWith(dir))
            : Object.values(data.sessions)
          if (!sessions.length) return `${args.scope === "project" ? "当前项目" : "全局"}：暂无 token 统计`
          if (args.detail) {
            return sessions.map((s) => formatSession(s)).join("\n")
          }
          const totals: Totals = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, calls: 0, elapsedMs: 0 }
          for (const s of sessions) {
            const t = computeTotals(s)
            totals.input += t.input
            totals.output += t.output
            totals.reasoning += t.reasoning
            totals.cacheRead += t.cacheRead
            totals.cacheWrite += t.cacheWrite
            totals.cost += t.cost
            totals.calls += t.calls
            totals.elapsedMs += t.elapsedMs
          }
          const hitRate = totals.input + totals.cacheRead > 0 ? (totals.cacheRead / (totals.input + totals.cacheRead)) * 100 : 0
          const grandTotal = totals.input + totals.output + totals.reasoning + totals.cacheRead + totals.cacheWrite
          return formatSummary(args.scope === "project" ? "project" : "global", sessions.length, totals, grandTotal, hitRate)
        },
      }),
    },
  }
}

export default { id: "opencode-token-usage", server: TokenUsagePlugin }
