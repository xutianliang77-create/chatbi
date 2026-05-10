# CodeClaw 快速安装与使用

本文用于从零跑通 CodeClaw。完整安装配置见 [INSTALL.md](./INSTALL.md)，完整命令和工作流见 [USAGE.md](./USAGE.md)。

## 1. 环境要求

必需：

- Node.js `22+`
- npm `10+`
- Bun `1.x`，仅构建时需要

可选：

- Python `3.x` + venv：启用真实 multilspy LSP；不装也能用 regex fallback。
- LM Studio / Ollama：本地模型。
- Dremio / Beelink MCP：数据分析。

## 2. 安装

```bash
git clone <repo-url> CodeClaw
cd CodeClaw
npm install
npm run build
```

运行：

```bash
node dist/cli.js --plain
```

如果想全局使用 `codeclaw`：

```bash
npm link
codeclaw --plain
```

## 3. 配置 Provider

首次推荐：

```bash
node dist/cli.js setup
node dist/cli.js config
```

也可以直接编辑：

- `~/.codeclaw/providers.json`
- `~/.codeclaw/selection.json`

示例：LM Studio 本地模型。

```json
{
  "lmstudio:default": {
    "type": "lmstudio",
    "enabled": true,
    "baseUrl": "http://127.0.0.1:1234/v1",
    "model": "qwen/qwen3-32b",
    "timeoutMs": 240000,
    "maxTokens": 32768
  }
}
```

国内 OpenAI-compatible provider 可参考：

```bash
export CODECLAW_DEEPSEEK_API_KEY=...
export CODECLAW_DASHSCOPE_API_KEY=...
export CODECLAW_ZHIPU_API_KEY=...
export CODECLAW_MOONSHOT_API_KEY=...
export CODECLAW_DOUBAO_API_KEY=...
export CODECLAW_SILICONFLOW_API_KEY=...
```

更多 provider 配置见 [INSTALL.md §3](./INSTALL.md#3-首次配置providers)。

## 4. CLI 快速使用

启动：

```bash
node dist/cli.js --plain
```

常用命令：

```text
/help                 查看命令
/status               查看 provider、mode、session
/mode plan            只读规划模式
/mode default         常规审批模式
/mode dontAsk         本地开发快速模式
/context              查看上下文来源、工具池、预算
/compact              压缩当前会话
/skills               查看技能
/skills inspect review
/mcp                  查看 MCP server
/exit                 退出
```

普通任务直接输入自然语言，例如：

```text
分析这个项目的架构
修复 npm test 的失败
查询 Dremio 里销量最高的商品
生成一份食品销售分析报告
```

## 5. Web 快速使用

启动：

```bash
export CODECLAW_WEB_TOKEN=local-dev-token
node dist/cli.js web --port=7180 --host=127.0.0.1
```

打开：

```text
http://127.0.0.1:7180
```

Web 主要页面：

- **Chat**：会话、工具调用、上下文预算提示。
- **Reports**：LLM 生成的分析报告。
- **Dashboards**：从 Report 升级的仪表盘。
- **RAG / Graph**：知识库与代码图谱。
- **MCP**：外部 MCP server 状态和工具。
- **Hooks / Subagents / Cron / Notifications**：自动化与协作能力。

如果端口被占用：

```bash
lsof -tiTCP:7180 -sTCP:LISTEN | xargs kill
```

## 6. 推荐安全配置

开发初期可以使用：

```bash
export CODECLAW_TOOLSET=all
export CODECLAW_SESSION_SEARCH=true
export CODECLAW_EXECUTE_CODE=true
```

只读审查时建议：

```bash
export CODECLAW_TOOLSET=safe
node dist/cli.js --plain
```

数据分析场景建议：

```bash
export CODECLAW_TOOLSET=bi
node dist/cli.js --plain
```

桌面自动化 / Computer Use 场景建议：

```bash
export CODECLAW_TOOLSET=computer
node dist/cli.js --plain
```

进入后先运行 `/skills use computer_use`，并确保已在 `~/.codeclaw/mcp.json` 配置 Ghost OS MCP。

## 7. 稳定性验证

正常验证：

```bash
npm run typecheck
npm run test
npm run build
git diff --check
```

上下文保护验证：

```bash
CODECLAW_TOKEN_WARN_THRESHOLD=0.005 CODECLAW_AUTO_COMPACT_THRESHOLD=0.01 node dist/cli.js web
```

输入大型任务后，期望看到：

```text
[context budget exceeded]
```

这表示 CodeClaw 已保护性暂停，没有继续把超大上下文发给 Provider。

## 8. 常见问题

### Provider returned an empty response

通常是模型本身返回空、上下文过大、provider 处于 cooldown，或本地模型不支持当前请求格式。建议：

```text
/status
/stuck
/compact
```

必要时新建 session，或切换非 reasoning 模型。

### listen EADDRINUSE 127.0.0.1:7180

旧 Web 进程还在监听：

```bash
lsof -tiTCP:7180 -sTCP:LISTEN | xargs kill
node dist/cli.js web
```

### 新 session 仍显示旧上下文

当前设计是：新 session 不默认注入旧会话摘要。若 Web 仍显示旧内容，先确认是否点中了旧 session；需要续接时使用 `/resume` 或 `session_search`。

### Web 构建输出很大

Monaco/editor 相关 chunk 较大是已知问题，不影响运行。后续可继续做更细粒度懒加载。
