# CodeClaw

CodeClaw 是一个本地优先的 CLI + Web 智能工作台，面向代码开发、BI/数据分析、报告、仪表盘、MCP 工具和多 Agent 协作。

当前包含：

- Provider 选择、fallback 链路和国内 OpenAI-compatible 预设。
- CLI REPL 与 Web UI，支持审批、压缩、会话持久化、报告、仪表盘、RAG、Graph、MCP、Hooks、Subagents、Cron 和 Notifications。
- 文件、shell、编辑、Web、Browser、Email、Report/Dashboard、DICOM、Task、Agent Team 等 native tools。
- LSP 风格的 symbol / definition / references 查询；默认走零依赖 regex index，真实 `multilspy` 后端可选安装。
- HTTP SDK / gateway 入口。
- Planner / Executor / Reflector 编排链路和 Agent Team 协作。
- Beelink/Dremio 数据分析工具、Report/Dashboard artifacts、DICOM 医学影像 MCP、Ghost OS Computer Use MCP。
- context budget、tool loop、provider cooldown、malformed stream、超长输出等稳定性保护。

## 当前状态

当前版本：`v0.8.6`。

已交付：

- Phase 1：CLI agent loop、tools、approvals、compact、ingress、HTTP gateway。
- Phase 1.5：真实 LSP bridge 与 fallback index。
- Phase 2：planner / executor / reflector、MCP、skills、补齐 slash commands。
- Phase 3.5：WeChat bot login、webhook mode、worker mode、approval / resume flow。
- **v0.8.6**：
  - 长输出、重复工具循环、异常 provider stream、provider cooldown、terminal IO shutdown 稳定性保护。
  - Beelink MCP metadata / semantic / SQL guidance 工具，用于 Dremio 风格数据分析。
  - CodeClaw Reports 和 Dashboards：artifact、renderer、Web API、React Web 面板、Report -> Dashboard upgrade。
  - 品牌统一回 `CodeClaw/codeclaw`，`CHATBI_*` 环境变量保留为 legacy fallback。
  - DeepSeek、DashScope、智谱、Moonshot、豆包、SiliconFlow 等国内 OpenAI-compatible provider 预设。
  - Hermes-inspired context reduction：toolset profile、`session_search`、结构化 Task result envelope、安全 `execute_code`。
  - Skill lifecycle 基础能力：`/skills inspect`、`/skills stats`、`/skills doctor` 和本地 usage 统计。
  - `computer_use` workflow skill：通过 Ghost OS MCP 接入 macOS 桌面操作能力，并由权限门保护点击、输入、热键、拖拽等高风险动作。

仍有意保持限制：

- 编辑能力是确定性结构化编辑，不是 AST 级自动重构。
- MCP 仍是基础实现，重在标准接入和稳定运行。
- TUI 中文输入体验弱于 `--plain`。
- WeChat rich media 还未完成。
- Cron DAG、失败重试、跨机调度仍是后续目标。

## 系统要求

- Node.js `22+`
- npm `10+`
- Bun `1.x`，仅构建时需要
- 可选：Python `3.x` + `venv`，仅在需要真实 `multilspy` LSP 后端时安装；不安装时 `/symbol`、`/definition`、`/references` 仍会走 regex fallback。

### 推荐终端

CodeClaw 的 Ink TUI 在高频按键时事件量较大。在 **macOS 26 beta** 上，Apple 自带 **Terminal.app** 存在 `NSEventThread` / `libmalloc` 内存破坏问题，可能随机崩窗。建议使用 GPU 加速的现代终端：

```bash
# Ghostty
brew install --cask ghostty

# 或 iTerm2 / Warp / Alacritty
brew install --cask iterm2
```

如果只能用 Terminal.app，建议运行纯文本 REPL：

```bash
node dist/cli.js --plain
```

## 快速开始

安装依赖：

```bash
npm install
```

构建：

```bash
npm run build
```

启动纯文本 REPL：

```bash
node dist/cli.js --plain
```

CodeClaw 使用 `~/.codeclaw` 作为 provider、MCP、session、Web、WeChat 等配置和数据目录。

推荐验证：

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

环境变量：

- 从 [`.env.example`](./.env.example) 开始配置 provider key、runtime guard、tool toggle、MCP/RAG、WeChat、LSP 等参数。
- 真实 secret 应放在 shell profile、进程管理器或本机 `.env.local`，不要提交真实 token。
- 稳定性保护设计见 [docs/RUNTIME_GUARDS_DESIGN.md](./docs/RUNTIME_GUARDS_DESIGN.md)。
- 稳定性收口说明见 [docs/STABILITY_CLOSEOUT.md](./docs/STABILITY_CLOSEOUT.md)。

## 常用命令

生命周期命令：

- `codeclaw setup`
- `codeclaw config`
- `codeclaw doctor`
- `codeclaw gateway`
- `codeclaw wechat`

核心 REPL 命令：

- `/help`
- `/status`
- `/session`
- `/providers`
- `/context`
- `/memory`
- `/compact`
- `/approvals`
- `/read <path>`
- `/glob <pattern>`
- `/symbol <name>`
- `/definition <name>`
- `/references <name>`
- `/bash <command>`
- `/write <path> :: <content>`
- `/append <path> :: <content>`
- `/replace <path> :: <find> :: <replace>`
- `/plan <goal>`
- `/orchestrate <goal>`
- `/skills`
- `/mcp`
- `/wechat`

## LSP 设置

CodeClaw 有两种 LSP 后端：

| 后端 | 依赖 | 使用场景 |
|---|---|---|
| `fallback-regex-index` | 无 | 默认；零依赖支持 `/symbol`、`/definition`、`/references` |
| `multilspy` | Python `3.x` + venv + `npm run setup:lsp` | 真实跨文件语义 LSP，通过 Python bridge 管理语言服务器 |

开箱即用时无需额外安装，CodeClaw 会使用 regex index。需要更准确的跨文件 references 和类型感知查询时再安装真实 LSP：

```bash
npm run setup:lsp
```

安装后，CodeClaw 会自动优先使用真实后端。也可以强制指定：

```bash
CODECLAW_ENABLE_REAL_LSP=1 codeclaw   # 强制真实 LSP；缺 venv 会报错
CODECLAW_ENABLE_REAL_LSP=0 codeclaw   # 强制 regex fallback
# 未设置 = auto：有真实 LSP 就用，否则静默 fallback
```

完整流程见 [docs/LSP_SETUP.md](./docs/LSP_SETUP.md)。

## WeChat Bot

CodeClaw 支持两种 WeChat 接入路径：

1. webhook mode
2. iLink worker mode

CLI 中运行：

```text
/wechat
```

该命令会启动 QR 登录、绑定当前 session，并在确认后自动启动 worker。

详见 [docs/WECHAT_BOT.md](./docs/WECHAT_BOT.md)。

## HTTP API

启动本地 gateway：

```bash
node dist/cli.js gateway --port 3000
```

详见 [docs/HTTP_API.md](./docs/HTTP_API.md)。

## 文档导航

| 文档 | 说明 |
|---|---|
| [docs/PRODUCT_DEVELOPMENT_SUMMARY.md](./docs/PRODUCT_DEVELOPMENT_SUMMARY.md) | 产品开发总结、当前能力矩阵、近期收口、验收路径、后续路线 |
| [docs/QUICK_START.md](./docs/QUICK_START.md) | 从零安装、配置 provider、启动 CLI/Web、常见问题 |
| [docs/INSTALL.md](./docs/INSTALL.md) | 安装、首次配置、各通道启动、环境变量速查、常见排错 |
| [docs/USAGE.md](./docs/USAGE.md) | 用户视角工作流：陌生代码库、写代码、调 bug、refactor、MCP、Hooks、状态栏等 |
| [docs/SLASH_COMMANDS.md](./docs/SLASH_COMMANDS.md) | builtin slash 命令字典、native tool 总览、存储位置 |
| [docs/HTTP_API.md](./docs/HTTP_API.md) | gateway 子命令 HTTP API |
| [docs/WECHAT_BOT.md](./docs/WECHAT_BOT.md) | WeChat iLink 集成，包含 webhook 和 worker 双模式 |
| [docs/LSP_SETUP.md](./docs/LSP_SETUP.md) | 真实 `multilspy` LSP 后端可选安装 |
| [docs/STABILITY_CLOSEOUT.md](./docs/STABILITY_CLOSEOUT.md) | Runtime guard、provider circuit、TUI stability checkpoint |

## 版本说明

- [docs/RELEASE_v0.8.6.md](./docs/RELEASE_v0.8.6.md) — 当前版本
- [docs/RELEASE_v0.7.0.md](./docs/RELEASE_v0.7.0.md)
- [docs/RELEASE_v0.6.0.md](./docs/RELEASE_v0.6.0.md)
- [docs/RELEASE_v0.5.0.md](./docs/RELEASE_v0.5.0.md)

## 许可证

[MIT](./LICENSE)
