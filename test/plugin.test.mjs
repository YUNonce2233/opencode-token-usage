import { test } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const PLUGIN_URL = new URL("../plugin/opencode-token-usage.ts", import.meta.url)
const SESSION = "sess-test-1"

function makeServer({ text }) {
  const calls = { message: 0, update: 0, patchBodies: [] }
  const texts = new Map()
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const send = (code, body) => {
      res.writeHead(code, { "content-type": "application/json" })
      res.end(JSON.stringify(body))
    }
    const messageIDMatch = url.pathname.match(new RegExp(`/session/${SESSION}/message/([^/]+)`))
    const id = messageIDMatch?.[1] ?? url.pathname.split("/").pop()
    if (req.method === "GET" && url.pathname.startsWith(`/session/${SESSION}/message/`)) {
      calls.message += 1
      return send(200, {
        info: { id, sessionID: SESSION, role: "assistant" },
        parts: [{ id: `${id}-text`, type: "text", text: texts.get(id) ?? text, ignored: false }],
      })
    }
    if (req.method === "PATCH" && url.pathname.startsWith(`/session/${SESSION}/message/`)) {
      calls.update += 1
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => {
        calls.patchBodies.push(body)
        const parsed = JSON.parse(body)
        const newText = typeof parsed.part === "object" && parsed.part ? parsed.part.text : parsed.text ?? texts.get(id) ?? text
        texts.set(id, newText)
        res.end(JSON.stringify(parsed))
      })
      return
    }
    send(404, { error: { message: "not found" } })
  })
  return { server, calls, getText: (id = "msg-1") => texts.get(id) ?? text }
}

async function loadPlugin(port) {
  const mod = await import(PLUGIN_URL)
  return mod.default.server({
    serverUrl: new URL(`http://127.0.0.1:${port}`),
    directory: "C:/fake/dir",
  })
}

function makeInfo(id, overrides = {}) {
  return {
    id,
    sessionID: SESSION,
    role: "assistant",
    modelID: "test/model",
    providerID: "test",
    time: { created: Date.now() - 49000, completed: Date.now() },
    tokens: { input: 2049, output: 1696, reasoning: 0, cacheRead: 58880, cacheWrite: 0 },
    cost: 0.123,
    finish: "done",
    agent: "build",
    path: { cwd: "C:/fake/dir", root: "C:/fake/dir" },
    ...overrides,
  }
}

async function runCase(fn, { homeDir }) {
  const { server, calls, getText } = makeServer({ text: "回答内容" })
  await new Promise((r) => server.listen(0, r))
  const port = server.address().port
  process.env.HOME = homeDir
  process.env.USERPROFILE = homeDir
  try {
    const hooks = await loadPlugin(port)
    await fn({ hooks, calls, getText })
  } finally {
    server.closeAllConnections?.()
    server.close()
  }
}

const homeDir = mkdtempSync(join(tmpdir(), "tu-test-"))

test("完成的主 agent 回复自动追加 badge 且去重", async () => {
  await runCase(async ({ hooks, calls, getText }) => {
    const info = makeInfo("msg-1")
    await hooks.event({ event: { type: "message.updated", properties: { info } } })
    await hooks.event({ event: { type: "message.updated", properties: { info } } })

    assert.equal(calls.update, 1, "同一消息只应追加一次")
    const badge = getText()
    assert.ok(badge.includes("<!-- opencode-token-usage -->"), "应含 marker")
    assert.ok(badge.includes("[Token 统计]"), "应含统计文本")
    assert.ok(/✓\s*$/.test(badge.trim().replace(/`$/, "")), "行尾应有 ✓")
    assert.ok(/缓存命中率 96\.6%/.test(badge), "应含缓存命中率")
  }, { homeDir })
})

test("子代理 agent 不追加", async () => {
  await runCase(async ({ hooks, calls, getText }) => {
    await hooks.event({
      event: { type: "message.updated", properties: { info: makeInfo("msg-sub", { agent: "explore" }) } },
    })
    await hooks.event({
      event: { type: "message.updated", properties: { info: makeInfo("msg-gen", { agent: "general" }) } },
    })
    assert.equal(calls.update, 0, "子代理消息不应追加 badge")
    assert.equal(getText(), "回答内容")
  }, { homeDir })
})

test("tool-calls 中间步骤不追加", async () => {
  await runCase(async ({ hooks, calls }) => {
    await hooks.event({
      event: { type: "message.updated", properties: { info: makeInfo("msg-tool", { finish: "tool-calls" }) } },
    })
    assert.equal(calls.update, 0, "tool-calls 步骤不应追加 badge")
  }, { homeDir })
})

test("多条不同完成消息各自追加", async () => {
  await runCase(async ({ hooks, calls }) => {
    await hooks.event({ event: { type: "message.updated", properties: { info: makeInfo("msg-a") } } })
    await hooks.event({ event: { type: "message.updated", properties: { info: makeInfo("msg-b") } } })
    assert.equal(calls.update, 2, "两条完成消息应各自追加一次")
  }, { homeDir })
})
