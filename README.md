# opencode-token-usage

> opencode 的 token 用量统计插件：自动在主 agent 回复底部追加灰色统计条，并提供 `token_usage` 查询工具，数据纯本地保存。
> An opencode plugin that automatically appends a gray token-statistics badge to each main-agent reply, plus a `token_usage` query tool — with 100% local data storage.

本项目由一个 `plugin/opencode-token-usage.ts` 插件与配套命令、测试组成，可放入任何 opencode 项目使用。

## 项目能做什么

一次回复完成之后，插件会自动完成以下步骤：

1. 监听 `message.updated` 事件，识别"已完成的最终回复"。
2. 读取该回复的 token 用量（输入、输出、思考、缓存读写、成本、耗时）。
3. 在回复正文末尾追加一行灰色统计条：`[Token 统计] 本轮合计 … · 输入 … · 输出 … · 缓存读 … · 缓存命中率 … · 上下文占用 … ✓`。
4. 把本轮数据写入本地账本与日志，供后续按会话/项目/全局查询。
5. 跳过子代理与工具调用中间步骤，同一回复只追加一次。

## 功能特性

| 功能 | 说明 |
| --- | --- |
| 自动统计条 | 主 agent（排除 `general`/`explore`/`plan` 子代理与 compaction）回复完成后，自动在回复末尾追加灰色统计条 |
| `token_usage` 工具 | `scope=turn \| session \| project \| global` 四种范围 + 可选 `detail` 明细 |
| `/token-usage` 命令 | 对话中直接输入，查询当前会话统计 |
| 本地持久化 | `ledger.json` 结构化账本 + `usage.log` 人类可读日志，纯本地，不上传 |
| 上下文占用 | 从模型元数据学习 context 上限，显示 `上下文 A/B tok(C%)` |
| 去重与跳过 | 同一消息只追加一次；正文已含统计标记则跳过 |
| 诊断日志 | 追加失败时把 HTTP 错误/异常写入 `usage.log`，便于排查 |

## 输出示例

回复底部会自动出现类似下面的统计条：

```
<!-- opencode-token-usage -->
[Token 统计] 本轮合计 62,625 tok · 输入 2,049 · 输出 1,696 · 缓存读 58,880 · 缓存命中率 96.6% · 1 次调用 · 上下文 60,929/128,000(47.6%) ✓
```

## 使用方式

### 自动统计条

无需任何操作。每次主回复完成后自动追加。

### `/token-usage` 命令

在对话中输入 `/token-usage`，agent 会调用 `token_usage` 工具（`scope=session`）并原样展示当前会话统计。

### `token_usage` 工具

| 参数 | 取值 | 默认 | 说明 |
| --- | --- | --- | --- |
| `scope` | `turn` \| `session` \| `project` \| `global` | `session` | 本轮 / 当前会话 / 当前项目（按 cwd 前缀）/ 全部会话 |
| `detail` | `boolean` | `false` | 仅对 `project`/`global` 生效，逐会话输出明细 |

输出字段：输入 / 输出 / 思考 / 缓存读 / 缓存写 / 缓存命中率 / 调用次数 / 会话数 / 成本 / 耗时 / 上下文占用。

## 安装

> 前置要求：已安装 opencode 1.x，并已配置 `~/.config/opencode/`（Windows 为 `C:\Users\<用户名>\.config\opencode\`）。

### 使用 npx

```bash
npx github:YUNonce2233/opencode-token-usage
```

安装器会把 `plugin/opencode-token-usage.ts` 复制到 `~/.config/opencode/plugins/`，把 `command/token-usage.md` 复制到 `~/.config/opencode/command/`，并打印注册所需的配置行。

### 使用 Bash

```bash
curl -sSL https://raw.githubusercontent.com/YUNonce2233/opencode-token-usage/master/install.sh | bash
```

可通过环境变量自定义安装目录：

```bash
OPENCODE_CONFIG_DIR="$HOME/.config/opencode" bash -c "$(curl -sSL https://raw.githubusercontent.com/YUNonce2233/opencode-token-usage/master/install.sh)"
```

### 手动安装

1. 将 `plugin/opencode-token-usage.ts` 复制到 `~/.config/opencode/plugins/`。
2. 在 `~/.config/opencode/opencode.json` 的 `plugin` 数组追加文件 URL：

   ```json
   {
     "plugin": [
       "file:///C:/Users/<用户名>/.config/opencode/plugins/opencode-token-usage.ts"
     ]
   }
   ```

   Linux/macOS 示例：`"file:///home/<user>/.config/opencode/plugins/opencode-token-usage.ts"`

3. （可选）复制 `command/token-usage.md` 到 `~/.config/opencode/command/`，启用 `/token-usage` 命令。
4. 重启 opencode。首次加载会创建 `~/.opencode/token-usage/` 目录。

## 数据文件

数据保存在 `~/.opencode/token-usage/`，纯本地：

| 文件 | 格式 | 说明 |
| --- | --- | --- |
| `ledger.json` | JSON | 结构化账本，按 sessionID 分桶；每轮含 messageID、模型、tokens、成本、耗时、上下文占用 |
| `usage.log` | 文本 | 每完成一轮追加一行，含时间戳、会话、模型、token 明细、成本、缓存命中率与会话累计 |

> 只有插件运行期间产生的消息才会被记录；历史会话不会追溯补齐。

## 测试

使用 Node 内置 `node:test` + `node:http` mock server，无需真实 opencode 实例即可运行：

```bash
npm install
npm test
```

测试覆盖：
- 完成的主 agent 回复自动追加 badge，且同一消息只追加一次（去重）；
- `general` / `explore` 等子代理消息不追加；
- `tool-calls` 中间步骤不追加；
- 多条不同完成消息各自追加一次。

另可运行 `npm run check` 做 TypeScript 语法检查。

## 文件结构

| 文件 | 用途 |
| --- | --- |
| `plugin/opencode-token-usage.ts` | 插件主代码（ESM 单文件） |
| `command/token-usage.md` | `/token-usage` 命令定义 |
| `bin/install.js` | npx 安装入口 |
| `install.sh` | Bash 安装脚本 |
| `test/plugin.test.mjs` | 集成测试 |
| `README.md` | 本说明 |
| `package.json` | 依赖与测试脚本 |
| `LICENSE` | MIT 许可证 |

## 工作原理

1. **事件监听**：订阅 `message.updated`，仅处理携带 token 数据的 assistant 消息。
2. **记录账本**：每轮写入 `ledger.json`（按消息去重、按会话分桶）并追加 `usage.log`。数据不经过网络。
3. **过滤条件**：跳过未完成（无 `time.completed`）、`finish === "tool-calls"` 的中间步骤、`general`/`explore`/`plan` 子代理与 `compaction` 消息。
4. **part.update 追加**：定位最后非忽略的 text part；若已含 `<!-- opencode-token-usage -->` 标记则跳过；否则追加标记 + 统计文本，经 SDK `part.update` 写回，`updating` 集合防重入。
5. **上下文上限学习**：通过 `experimental.chat.system.transform` 从模型元数据读取 context 上限。
6. **查询工具**：`token_usage` 按 `scope` 从账本聚合输出。

## 常见问题

**Q1：历史会话的旧回复会补上统计条吗？**
不会。插件只处理运行期间收到的事件，旧回复不追溯。

**Q2：为什么子代理（general/explore/plan）回复没有统计条？**
设计如此，避免污染子代理工具输出。只有主 agent 最终回复被追加。

**Q3：回复正文已经包含统计标记会怎样？**
插件检测到 `<!-- opencode-token-usage -->` 后跳过，不会重复追加。

**Q4：`tool-calls` 中间步骤为什么不统计？**
它们是工具调用中间态，不代表一次完成的回复。

**Q5：数据会传到哪里？**
不传。账本与日志仅写入本机 `~/.opencode/token-usage/`。

**Q6：缓存命中率是怎么算的？**
`cacheRead / (input + cacheRead)`；之和为 0 时记为 0%。

**Q7：为什么缓存命中率是 0%？**
插件如实显示 provider 上报的缓存字段。若中转站未返回 `prompt_tokens_details.cached_tokens` 或 Anthropic 的 `cache_read_input_tokens`，命中率恒为 0%——这是服务端行为，非插件问题。

## 免责声明 / Disclaimer

**中文**
本插件仅用于在本地统计 opencode 的 token 消耗，数据完全保存在本机 `~/.opencode/token-usage/` 下，不上传任何服务器。本项目与 OpenAI、Anthropic 及其他模型提供商无关，非其官方产品，亦不构成任何形式的认可、担保或合同关系。本项目为开源学习参考而发布，按"现状"提供，不保证完整性、准确性或适用性；使用者自行承担全部风险与责任。请遵守您所用服务（opencode、模型提供商等）的使用条款与当地法律法规。统计数字仅供参考，可能与模型提供方账单存在差异。

**English**
This plugin is intended solely for local token-usage statistics within opencode. All data is stored entirely on your machine under `~/.opencode/token-usage/` and is never uploaded to any server. This project is not affiliated with, endorsed by, or in any way connected to OpenAI, Anthropic, or any other model provider, and is not an official product of any of them. It is released as an open-source learning reference, provided "as is," without warranties of completeness, accuracy, or fitness for a particular purpose. You assume all risks and responsibilities. Please comply with the terms of service of your tools (opencode, model providers, etc.) and applicable local laws. Reported figures are approximate and may differ from your provider's billing.

## 许可证

本项目基于 [MIT License](LICENSE) 开源。使用、修改与分发请遵循许可证条款。
This project is open-sourced under the [MIT License](LICENSE). Use, modification, and distribution are governed by its terms.

## 致谢

本插件由 ☁️ 与 **小佳 Agent** 共同开发。灵感源自 Codex++ 脚本市场插件 *Codex Token Usage*（Albert_Luo），并基于 opencode 插件事件机制重新实现。

Developed by ☁️ together with **Xiaojia Agent**. Inspired by the *Codex Token Usage* plugin (by Albert_Luo) from the Codex++ script marketplace, reimplemented on opencode's plugin event system.
