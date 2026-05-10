# CodeClaw 产品开发总结

本文面向产品、研发和交付验收，概括 CodeClaw `0.8.6` 当前能力、近期完成项、验证状态和后续路线。安装步骤见 [QUICK_START.md](./QUICK_START.md)，完整配置见 [INSTALL.md](./INSTALL.md)，日常工作流见 [USAGE.md](./USAGE.md)。

## 1. 产品定位

CodeClaw 是一个本地优先的 CLI + Web 智能工作台，面向代码开发、数据分析、报表仪表盘和企业级 Agent 协作。

核心目标：

- **本地优先**：配置、会话、审计、记忆、报告产物默认落在 `~/.codeclaw` 或当前 workspace。
- **工具驱动**：模型通过 native tool、MCP、RAG、Graph、Report/Dashboard、Email/DICOM 等工具完成任务。
- **稳定可控**：通过 context budget、output guard、provider circuit、tool-loop guard 和 fallback summary 防止空转、刷屏和 Web 卡死。
- **企业可扩展**：保留 provider chain、权限门、审计、Agent Team、MCP、报告/仪表盘、移动通知等产品化扩展位。

## 2. 当前能力概览

| 模块 | 当前状态 | 说明 |
|---|---|---|
| CLI / Web 入口 | 已实现 | CLI TUI、plain REPL、Web React UI、多 session、Reports、Dashboards、RAG、Graph、MCP、Hooks、Subagents、Cron、Notifications 面板 |
| 模型供应商 | 已实现 | OpenAI、Anthropic、Ollama、LM Studio、自定义 OpenAI-compatible、DeepSeek、DashScope、智谱、Moonshot、豆包、SiliconFlow |
| 运行时稳定性 | 已实现 | 输出上限、终端渲染上限、流空闲 watchdog、malformed stream buffer、provider cooldown、context hard gate、工具 fallback summary |
| 原生工具 | 已实现 | 文件、bash、编辑、RAG、Graph、Knowledge、Web fetch、Browser read、Email draft、Report/Dashboard、Task、Agent Team |
| MCP | 已实现基础版 | Beelink/Dremio、DICOM、workspace MCP；可通过 `~/.codeclaw/mcp.json` 扩展 |
| 数据分析 | 已实现基础版 | Beelink MCP 元数据、语义层、SQL guidance、规则检查、SQL preview、artifact 导出 |
| 报告 / 仪表盘 | 已实现基础版 | LLM 工具生成报告、Web 展示、Report -> Dashboard upgrade、provenance 展示 |
| 技能 / Persona | 已实现基础版 | 内置 skills、user skills、workflow suggestion、`/skills inspect/stats/doctor`、usage 统计 |
| L1/L2/L3 记忆 | 部分实现 | L1 transcript、L2 session digest 显式 recall/search、L3 RAG/Graph/Knowledge；新 session 默认不注入旧摘要 |
| Agent Team | 已实现基础版 | 多角色只读协作、write proposal、merge gate、Web Team 面板触发 |
| LSP | 已实现基础版 | regex fallback 默认可用；真实 multilspy LSP 可选安装 |
| WeChat / Mobile | 部分实现 | WeChat iLink 基础链路和 Notification history 已有；Mobile Companion 仍是后续目标 |

## 3. 近期开发收口

### 3.1 Provider 兼容

- 新增国内 OpenAI-compatible provider 预设：DeepSeek、DashScope、智谱、Moonshot、豆包、SiliconFlow。
- 增加 `streamOptions`、`toolUse`、`extraBody` 兼容字段，便于处理不同平台对 stream usage、tool calling、thinking 参数的差异。
- Provider config UI、能力检测、测试和安装文档已同步。

### 3.2 上下文与工具结果治理

- `CODECLAW_TOOLSET=all/safe/coding/bi/browser/computer/office/medical` 控制 provider-visible tools，减少 tool schema 膨胀；`computer` 用于 Ghost OS Computer Use MCP。
- `session_search` 支持显式检索 L2 session digest，避免新 session 默认带入旧上下文。
- Task 子代理输出改为结构化 `result-envelope`，长结果落 artifact，只把摘要送回父上下文。
- `execute_code` 安全 MVP 支持只读程序化工具批处理，降低多轮 read/glob 工具结果对主上下文的污染。

### 3.3 Skill 生命周期

- `/skills inspect <name>`：查看 skill 元数据、工具边界、MCP refs、manifest 和 usage。
- `/skills stats`：查看本地激活次数排行。
- `/skills doctor`：查看 skill 加载错误和 usage 存储状态。
- 默认 usage 文件：`~/.codeclaw/skills/usage.json`。

### 3.4 稳定性

- 超上下文时返回 `[context budget exceeded]` 并保护性暂停，不继续打 Provider。
- 工具已完成但最终模型 summary 为空/失败时，生成本地 fallback summary，不再循环重试。
- Provider concurrency/cooldown、stream idle、malformed stream buffer、输出截断、terminal render artifact 均已接入。

## 4. 验证状态

最近一轮验证通过：

```bash
npm run typecheck
npx vitest run test/unit/skills test/query-engine.test.ts
npm run build
git diff --check
```

构建说明：

- `npm run build` 会先构建 `web-react`，再打包 CLI 到 `dist/cli.js`。
- Monaco/editor 相关 bundle 仍较大，属于已知包体积问题，不影响运行。

## 5. 推荐验收路径

### 5.1 本地 CLI smoke

```bash
node dist/cli.js --plain
/status
/skills
/skills inspect review
/context
hi
```

### 5.2 Web smoke

```bash
export CODECLAW_WEB_TOKEN=local-dev-token
node dist/cli.js web --port=7180 --host=127.0.0.1
```

浏览器打开 `http://127.0.0.1:7180`，粘贴 token 后验证：

- Chat 能新建/切换 session。
- Reports/Dashboards 能展示已有 artifact。
- MCP 面板能列出 server。
- Notifications 面板能显示历史事件。

### 5.3 稳定性 smoke

```bash
CODECLAW_TOKEN_WARN_THRESHOLD=0.005 CODECLAW_AUTO_COMPACT_THRESHOLD=0.01 node dist/cli.js web
```

输入大型任务，例如“扫描源代码，解读每一个文件，找到 bug”。期望：

- 出现 `[context budget exceeded]`。
- 本轮暂停，不继续打 Provider。
- Web 不 OOM，不长时间空转。

## 6. 主要配置入口

| 配置 | 位置 |
|---|---|
| Provider chain | `~/.codeclaw/providers.json` |
| 当前 provider / fallback | `~/.codeclaw/selection.json` |
| MCP server | `~/.codeclaw/mcp.json` 或 `<workspace>/.mcp.json` |
| 用户偏好 | `~/.codeclaw/CODECLAW.md` |
| 项目偏好 | `<workspace>/CODECLAW.md` |
| Web token | `CODECLAW_WEB_TOKEN` 或 `~/.codeclaw/web-auth.json` |
| 环境变量模板 | `.env.example` |
| 设置决策表 | `env.json` |

## 7. 后续路线

优先级建议：

- **P0**：继续真实 provider smoke，尤其是国内 provider 的 toolUse/streamOptions 兼容矩阵。
- **P1**：增强 `execute_code` 沙箱，从 in-process VM 演进到 child process + RPC。
- **P1**：Report/Dashboard 继续补齐布局编辑、筛选器、权限、provenance 审计。
- **P2**：Mobile Companion、Desktop notification provider、Skill marketplace、企业级 ACL/订阅/审计产品化。

## 8. 交付边界

- 当前项目仍是 `private: true` scaffold，不是公开 npm 包。
- 真实数据源、API key、MCP server 凭据不应提交到仓库。
- `.codex/` 是本地 Codex 配置目录，不属于 CodeClaw 产品交付内容。
