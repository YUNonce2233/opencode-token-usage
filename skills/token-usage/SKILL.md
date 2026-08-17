---
name: token-usage
description: >-
  opencode 的 token 用量统计 Skill：自动在每条主 agent 回复底部追加灰色统计条（本轮合计、输入、输出、缓存读、缓存命中率、首 token 时间、生成速率 tok/s、上下文占用），并提供 token_usage 查询工具（scope=turn/session/project/global）。当用户提到 token 统计、用量、消耗、缓存命中率、TTFT、首 token、tok/s、上下文占用，或需要统计 opencode 会话 token 消耗时使用。
  An opencode token-usage statistics skill: automatically appends a gray per-reply badge (turn total, input, output, cache read, cache hit rate, time to first token, tokens per second, context usage) and provides a token_usage query tool (scope=turn/session/project/global). Use when users mention token usage, consumption, cache hit rate, TTFT, time to first token, tok/s, context usage, or need to track opencode session tokens.
---

# opencode-token-usage Skill

> 面向 opencode 的 token 用量统计：自动展示每次回复的 token 消耗，并可查询会话/项目/全局历史。

`opencode-token-usage` 在每条主 agent 回复完成后自动在回复末尾追加一行灰色统计条，并把每轮数据写入本地账本，供按会话/项目/全局查询。数据纯本地保存，不上传任何服务器。

本 Skill 对应仓库里的 opencode 插件实现（`plugin/opencode-token-usage.ts`）。安装插件后即自动获得统计条与 `token_usage` 工具。

## 输出示例

回复底部会自动出现类似下面的统计条：

```
<!-- opencode-token-usage -->
[Token 统计] 本轮合计 62,625 tok · 输入 2,049 · 输出 1,696 · 缓存读 58,880 · 缓存命中率 96.6% · 1 次调用 · 首 token 24.0s · 70.7 tok/s · 上下文 60,929/128,000(47.6%) ✓
```

## 安装插件

前置要求：已安装 opencode 1.x。

```bash
# 方式一：npx
npx github:YUNonce2233/opencode-token-usage

# 方式二：Bash
curl -sSL https://raw.githubusercontent.com/YUNonce2233/opencode-token-usage/master/install.sh | bash
```

安装后：

1. 确认 `~/.config/opencode/plugins/opencode-token-usage.ts` 已存在。
2. 在 `~/.config/opencode/opencode.json` 的 `plugin` 数组追加：

   ```json
   { "plugin": ["file:///<你的路径>/.config/opencode/plugins/opencode-token-usage.ts"] }
   ```

3. 重启 opencode。每次主回复完成后自动显示统计条。

## 查询方式

- **`/token-usage` 命令**：查询当前会话统计。
- **`token_usage` 工具**：`scope=turn | session | project | global`，可选 `detail` 逐会话明细。

## 数据文件

- `~/.opencode/token-usage/ledger.json`：结构化账本（按会话分桶）。
- `~/.opencode/token-usage/usage.log`：人类可读日志。

## 说明

- 只统计插件运行期间产生的新回复；历史旧回复不追溯。
- 子代理（general/explore/plan）与 compaction 消息不加统计条。
- 缓存命中率显示 provider 上报的缓存字段；若中转站未上报则显示 0%，属服务端行为。
- 首 token 时间 = 首个文本 part 完成时间 − 消息创建时间；生成速率 = 输出 token 数 ÷ 生成耗时。若无 parts 时间戳则不显示。
- 数据纯本地，不上传；统计数字仅供参考，可能与模型提供方账单存在差异。
