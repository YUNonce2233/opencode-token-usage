# opencode-token-usage

> opencode 的 token 用量统计插件：自动在主 agent 回复底部追加灰色统计条，并提供 `token_usage` 查询工具，数据纯本地保存。
> An opencode plugin that automatically appends a gray token-statistics badge to each main-agent reply, plus a `token_usage` query tool — with 100% local data storage.

---

## 功能特性 / Features

- **自动统计条（Auto badge）**：主 agent（排除 `general` / `explore` / `plan` 子代理与 compaction）回复完成后，自动在回复正文末尾追加一行灰色内联统计条，含本轮合计、输入、输出、缓存读、缓存命中率、调用次数与上下文占用。
  Automatically appends a gray inline badge at the end of each completed main-agent reply, showing turn totals, input, output, cache reads, cache hit rate, call count, and context usage.

- **`token_usage` 查询工具（Query tool）**：提供 `scope=turn | session | project | global` 四种统计范围与可选 `detail` 明细输出。
  Provides a `token_usage` tool with `scope=turn | session | project | global` and an optional `detail` flag.

- **本地数据持久化（Local persistence）**：结构化账本 `ledger.json` 与人类可读日志 `usage.log`，纯本地保存，不向任何服务器上报。
  Persists data to a structured `ledger.json` and a human-readable `usage.log` — stored locally only, never uploaded.

- **按模型缓存上下文上限（Per-model context limits）**：从模型元数据自动学习上下文窗口大小，用于显示上下文占用百分比。
  Learns context-window limits from model metadata to display context usage percentage.

- **去重与跳过（Dedup & skip）**:同一消息只追加一次；回复正文已含统计标记则跳过，避免重复叠加。
  Appends each message only once; skips replies that already contain the badge marker.

---

## 截图预览（占位）/ Screenshot (placeholder)

回复底部会自动出现类似下面的统计条（示例文本，非真实截图）：

```
<!-- opencode-token-usage -->
[Token 统计] 本轮合计 62,625 tok · 输入 2,049 · 输出 1,696 · 缓存读 58,880 · 缓存命中率 96.6% · 1 次调用 · 上下文 60,929/128,000(47.6%) ✓
```

A badge like the one above appears at the bottom of each completed reply (sample text, not an actual screenshot).

---

## 安装步骤 / Installation

> 前置要求：已安装 opencode 1.x，并已配置 `~/.config/opencode/`（Windows 为 `C:\Users\<用户名>\.config\opencode\`）。
> Prerequisite: opencode 1.x with a configured `~/.config/opencode/` directory (on Windows: `C:\Users\<用户名>\.config\opencode\`).

1. **复制插件 / Copy the plugin**

   将 `plugin/opencode-token-usage.ts` 复制到 `~/.config/opencode/plugins/`（Windows 上即 `C:\Users\<用户名>\.config\opencode\plugins\`）。
   Copy `plugin/opencode-token-usage.ts` into `~/.config/opencode/plugins/` (on Windows: `C:\Users\<用户名>\.config\opencode\plugins\`).

2. **注册到配置 / Register in config**

   在全局配置 `~/.config/opencode/opencode.json` 的 `plugin` 数组中追加该文件 URL：
   Add the file URL to the `plugin` array in `~/.config/opencode/opencode.json`:

   ```json
   {
     "plugin": [
       "file:///C:/Users/<用户名>/.config/opencode/plugins/opencode-token-usage.ts"
     ]
   }
   ```

   非 Windows 系统示例（Linux/macOS）：
   Non-Windows example (Linux/macOS):

   ```json
   {
     "plugin": [
       "file:///home/<user>/.config/opencode/plugins/opencode-token-usage.ts"
     ]
   }
   ```

3. **复制命令 / Copy the command**

   将 `command/token-usage.md` 复制到 `~/.config/opencode/command/`，以便使用 `/token-usage` 斜杠命令。
   Copy `command/token-usage.md` into `~/.config/opencode/command/` to enable the `/token-usage` slash command.

4. **重启 opencode / Restart opencode**

   重启后生效。插件首次加载时会创建 `~/.opencode/token-usage/` 目录。
   Restart opencode. On first load the plugin creates `~/.opencode/token-usage/`.

---

## 使用方法 / Usage

### `/token-usage` 命令

在对话中输入 `/token-usage`，agent 会调用 `token_usage` 工具（`scope=session`）并原样展示当前会话的统计。
Type `/token-usage` in a conversation; the agent calls the `token_usage` tool (`scope=session`) and shows the current session's stats verbatim.

### `token_usage` 工具

agent 也可直接调用 `token_usage` 工具。参数说明：
The agent can also call the `token_usage` tool directly. Parameters:

| 参数 / Argument | 取值 / Values | 默认 / Default | 说明 / Description |
|---|---|---|---|
| `scope` | `turn` \| `session` \| `project` \| `global` | `session` | 统计范围：本轮最近一次调用 / 当前会话 / 当前项目（按 cwd 前缀匹配）/ 全部会话。<br/>Scope: last turn / current session / current project (matched by cwd prefix) / all sessions. |
| `detail` | `boolean` | `false` | 仅对 `project` / `global` 生效；为 `true` 时逐会话输出明细。<br/>Only applies to `project` / `global`; when `true`, outputs a per-session breakdown. |

输出字段：输入 / 输出 / 思考 / 缓存读 / 缓存写 / 缓存命中率 / 调用次数 / 会话数 / 成本 / 耗时 / 上下文占用。
Reported fields: input / output / reasoning / cache read / cache write / cache hit rate / call count / session count / cost / elapsed time / context usage.

---

## 数据文件 / Data Files

数据保存在 `~/.opencode/token-usage/` 下，纯本地：
Data lives under `~/.opencode/token-usage/`, stored locally:

| 文件 / File | 格式 / Format | 说明 / Description |
|---|---|---|
| `ledger.json` | JSON | 结构化账本。按会话（sessionID）分桶，每个会话记录 turn 列表，含 messageID、modelID、providerID、tokens（input/output/reasoning/cacheRead/cacheWrite）、cost、耗时、上下文占用等。<br/>Structured ledger, bucketed by sessionID; each session holds a list of turns with messageID, modelID, providerID, tokens (input/output/reasoning/cacheRead/cacheWrite), cost, elapsed time, and context usage. |
| `usage.log` | 纯文本 | 人类可读日志，每完成一轮追加一行，含时间戳、会话、模型、token 明细、成本、缓存命中率与会话累计。附加插件加载日志。<br/>Human-readable log; appends one line per completed turn with timestamp, session, model, token breakdown, cost, cache hit rate, and session totals, plus a plugin-load entry. |

> 说明：只有插件运行期间产生的消息才会被记录；历史会话不会追溯补齐。
> Note: only messages produced while the plugin is running are recorded; historical sessions are not retroactively backfilled.

---

## 测试 / Testing

测试使用 Node 内置的 `node:test` + `node:http` mock server，无需真实 opencode 实例即可运行：
Tests use Node's built-in `node:test` and a `node:http` mock server — no real opencode instance required.

```bash
npm install
npm test
```

`package.json` 中的测试脚本为 `node --experimental-strip-types --test test/plugin.test.mjs`。测试覆盖：
The test script is `node --experimental-strip-types --test test/plugin.test.mjs`. Coverage includes:

- 完成的主 agent 回复自动追加 badge，且同一消息只追加一次（去重）；
  Completed main-agent replies get the badge appended exactly once (dedup);
- `general` / `explore` 等子代理消息不追加；
  Sub-agent (`general` / `explore`) messages are not annotated;
- `tool-calls` 中间步骤不追加；
  Intermediate `tool-calls` steps are not annotated;
- 多条不同完成消息各自追加一次。
  Multiple distinct completed messages each get the badge.

另可运行 `npm run check` 做 TypeScript 语法检查。
You can also run `npm run check` for a TypeScript syntax check.

---

## 工作原理 / How It Works

1. **事件监听（Event hook）**：插件订阅 `message.updated` 事件；仅处理 `role === "assistant"` 且携带 token 数据的消息。
   Subscribes to `message.updated`; only handles `role === "assistant"` messages that carry token data.

2. **记录账本（Ledger record）**：每轮写入 `ledger.json`（按消息去重、按会话分桶）并向 `usage.log` 追加一行。数据不经过网络。
   Each turn is written into `ledger.json` (deduped by messageID, bucketed by session) and appended to `usage.log`. No network involved.

3. **过滤条件（Filters）**：跳过未完成（无 `time.completed`）、`finish === "tool-calls"` 的中间步骤、`general` / `explore` / `plan` 子代理与 `compaction` 消息。
   Skips unfinished messages (no `time.completed`), intermediate `finish === "tool-calls"` steps, `general` / `explore` / `plan` sub-agents, and `compaction`.

4. **part.update 追加（Append via part.update）**：定位该消息最后一个非忽略的 text part，若其正文已含 `<!-- opencode-token-usage -->` 标记则跳过；否则在末尾追加 `标记 + 反引号包裹的统计文本`，并调用 SDK 的 `part.update` 写回。追加期间用 `updating` 集合防重入。
   Locates the last non-ignored text part; skips if it already contains the `<!-- opencode-token-usage -->` marker; otherwise appends `marker + backtick-wrapped stats text` and writes it back via the SDK's `part.update`. An in-flight `updating` set prevents re-entrancy.

5. **上下文上限学习（Context limit learning）**：通过 `experimental.chat.system.transform` 从模型元数据读取 context 上限，用于上下文占用百分比展示。
   Reads context limits from model metadata via `experimental.chat.system.transform` to show context usage percentage.

6. **查询工具（Query tool）**：`token_usage` 工具按 `scope` 从账本聚合输出格式化统计文本。
   The `token_usage` tool aggregates ledger data by `scope` into formatted stats text.

---

## 常见问题 / FAQ

**Q1：历史会话的旧回复会补上统计条吗？**
不会。插件只处理其运行期间收到的事件；旧回复无事件触发，不会被追溯追加。
**Will old replies from past sessions get the badge?**
No. Only events received while the plugin runs are handled; past replies have no events and are not backfilled.

**Q2：为什么子代理（general/explore/plan）回复没有统计条？**
设计如此，避免污染子代理工具输出。只有主 agent 的最终回复会被追加。
**Why don't sub-agent (general/explore/plan) replies get the badge?**
By design, to avoid polluting sub-agent tool output. Only main-agent final replies are annotated.

**Q3：回复正文已经包含 `<!-- opencode-token-usage -->` 会怎样？**
插件检测到该标记后跳过，不会重复追加。
**What if a reply already contains `<!-- opencode-token-usage -->`?**
The plugin detects the marker and skips it, so nothing is appended twice.

**Q4：`tool-calls` 中间步骤为什么不统计？**
这些只是工具调用中间态，不代表一次完成的回复；插件只统计带完成时间的最终回复。
**Why aren't `tool-calls` intermediate steps counted?**
They are transient tool-call states, not completed replies; only replies with a completion time are counted.

**Q5：数据会传到哪里？**
不传。账本与日志仅写入本机 `~/.opencode/token-usage/`。
**Where does the data go?**
Nowhere. The ledger and log are written only to local `~/.opencode/token-usage/`.

**Q6：缓存命中率是怎么算的？**
`cacheRead / (input + cacheRead)`。输入与缓存读之和为 0 时记为 0%。
**How is the cache hit rate computed?**
`cacheRead / (input + cacheRead)`, reported as 0% when the sum is zero.

---

## 免责声明 / Disclaimer

**中文**
本插件仅用于在本地统计 opencode 的 token 消耗，数据完全保存在本机 `~/.opencode/token-usage/` 下，不上传任何服务器。本项目与 OpenAI、Anthropic 及其他模型提供商无关，非其官方产品，亦不构成任何形式的认可、担保或合同关系。本项目为开源学习参考而发布，按“现状”提供，不保证完整性、准确性或适用性；使用者自行承担全部风险与责任。请遵守您所用服务（opencode、模型提供商等）的使用条款与当地法律法规。统计数字仅供参考，可能与模型提供方账单存在差异。

**English**
This plugin is intended solely for local token-usage statistics within opencode. All data is stored entirely on your machine under `~/.opencode/token-usage/` and is never uploaded to any server. This project is not affiliated with, endorsed by, or in any way connected to OpenAI, Anthropic, or any other model provider, and is not an official product of any of them. It is released as an open-source learning reference, provided "as is," without warranties of completeness, accuracy, or fitness for a particular purpose. You assume all risks and responsibilities. Please comply with the terms of service of your tools (opencode, model providers, etc.) and applicable local laws. Reported figures are approximate and may differ from your provider's billing.

---

## 作者与致谢 / Authors

**中文**
本插件由 **YUN**（GitHub: [YUNonce2233](https://github.com/YUNonce2233)）与 **AI 助手** 共同开发。
灵感源自 Codex++ 脚本市场插件 *Codex Token Usage*（Albert_Luo），并基于 opencode 插件事件机制重新实现。

**English**
Developed by **YUN** (GitHub: [YUNonce2233](https://github.com/YUNonce2233)) together with an **AI assistant**.
Inspired by the *Codex Token Usage* plugin (by Albert_Luo) from the Codex++ script marketplace, reimplemented on opencode's plugin event system.

---

## License

[MIT](LICENSE)

本项目基于 MIT 许可证开源，使用、修改与分发请遵循许可证条款。
This project is open-sourced under the MIT License. Use, modification, and distribution are governed by its terms.
