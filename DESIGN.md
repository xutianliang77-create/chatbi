# CodeClaw 产品与架构设计文档

> **版本**: v1.0 | **日期**: 2026-04-20  
> **定位**: 个人自主智能体平台 · 从"接收指令"到"交付结果"的全自动闭环  
> **关联文档**: [`DEV_TASKS.md`](tech-design/DEV_TASKS.md)（开发任务清单）

---

## 目录

1. [产品定位](#1-产品定位)
2. [当前实现状态矩阵](#2-当前实现状态矩阵)
3. [支柱一：深度语义理解](#3-支柱一深度语义理解)
4. [支柱二：长程任务规划](#4-支柱二长程任务规划)
5. [支柱三：多渠道交互](#5-支柱三多渠道交互)
6. [五层架构](#6-五层架构)
7. [数据流架构](#7-数据流架构)
8. [数据模型](#8-数据模型)
9. [状态管理](#9-状态管理)
10. [Provider 抽象层](#10-provider-抽象层)
11. [工具系统](#11-工具系统)
12. [认知层设计](#12-认知层设计)
13. [权限系统](#13-权限系统)
14. [技能系统](#14-技能系统)
15. [钩子系统](#15-钩子系统)
16. [MCP 协议集成](#16-mcp-协议集成)
17. [插件系统](#17-插件系统)
18. [技术栈选型](#18-技术栈选型)
19. [配置](#19-配置)
20. [构建与部署](#20-构建与部署)
21. [数据持久化](#21-数据持久化)
22. [国际化](#22-国际化)
23. [技术决策记录（ADR）](#23-技术决策记录adr)
24. [设计缺口与收敛方案](#24-设计缺口与收敛方案)
25. [附录：与 Claude Code 的关系](#附录与-claude-code-的关系)

---

## 1. 产品定位

CodeClaw **不是编程助手，而是具备深度语义理解、长程任务规划、多渠道交互能力的自主智能体平台**。通过集成代码语义（LSP）、外部数据源（MCP）与业务逻辑（Skills），实现全自动闭环。

---

## 2. 当前实现状态矩阵

本文档是 v1.0 产品与架构总纲，其中包含愿景、阶段目标和部分早期设计。为避免把未来目标误认为当前能力，以下矩阵记录截至当前代码线的实现状态。

状态定义：

- **已实现**：已有代码、文档和至少基础测试/真实 smoke 证明。
- **已实现基础版**：主路径已有代码、文档和基础验证，但仍可继续增强体验、规模化或企业能力。
- **未来目标**：仍是产品路线图或企业版增强，不能按当前能力承诺。

| 领域 | 当前状态 | 说明 | 详细文档 |
| --- | --- | --- | --- |
| CLI / Web 基础会话 | 已实现 | CLI 和 Web 均可启动会话；Web 已支持 session 列表、恢复历史上下文和归档入口。 | `docs/USAGE.md`, `docs/INSTALL.md` |
| 首次启动 setup / doctor | 已实现基础版 | 配置加载、provider 配置、doctor 检查和安装说明已存在；可支撑首次运行与故障定位。 | `docs/INSTALL.md` |
| 完整 5 步 TUI setup 向导 | 未来目标 | 本文中的欢迎页、provider 选择、权限模式、工具能力检查、配置写入一体化 TUI 仍是体验增强目标。 | `docs/CODECLAW_FEATURE_COMPLETION_PLAN.md` |
| Provider chain / fallback | 已实现 | 支持 provider selection、fallback、stream guard、reasoning/content 分离和 circuit breaker。 | `docs/RUNTIME_GUARDS_DESIGN.md`, `docs/STABILITY_CLOSEOUT.md` |
| Runtime Guards / Context hard gate | 已实现 | 已有输出上限、render artifact、tool loop guard、context budget exceeded、task_needs_staging、本地 fallback。 | `docs/RUNTIME_GUARDS_DESIGN.md` |
| L1 transcript | 已实现 | 会话 transcript 持久化，Web 新会话默认不注入旧上下文。 | `docs/INSTALL.md` |
| L2 session memory digest | 已实现 | `/end` 写入结构化摘要；`/resume` 或继续类 prompt 显式 recall；新 session 默认不注入。 | `docs/RUNTIME_GUARDS_DESIGN.md`, `docs/SLASH_COMMANDS.md` |
| L3 Knowledge unified search | 已实现 | `knowledge_search` 统一 RAG、Graph、Beelink 本地语义/元数据证据；仍缺 Web source status 面板。 | `docs/L3_KNOWLEDGE_TECH_DESIGN.md` |
| RAG / Graph | 已实现基础版 | RAG index/search、Graph build/query、旧工具兼容；更强语义质量和 UI provenance 仍可增强。 | `docs/SLASH_COMMANDS.md`, `docs/L3_KNOWLEDGE_TECH_DESIGN.md` |
| LSP | 已实现基础版 | 默认 regex fallback 可零配置运行；可选 `multilspy` real backend、doctor 检查和 setup 文档已存在。 | `docs/LSP_SETUP.md` |
| 增强 LSP 依赖图 / Node-native LSP | 未来目标 | 跨语言深度调用图、增量索引、性能优化和 Node-native LSP client 仍是后续增强。 | `docs/CODECLAW_FEATURE_COMPLETION_PLAN.md` |
| Orchestration Planner / Executor / Reflector | 已实现基础版 | 基础 Planner/Executor/Reflector、依赖检查、审批、replan/escalated 和 playback 测试存在。 | `docs/PHASE2_DELIVERY.md`, `docs/PHASE2_PLAYBACKS.md` |
| 长程自治 / Agent Team DAG | 已实现基础版 | `/team plan/run/status/cancel/retry/write`、TeamRun 持久化、Blackboard/Mailbox、Merge Gate、claimed-file 写入保护和 Web Team 面板已存在；P2 只推进自动 write-worker 编排；大型 DAG、长期自治、跨 provider 多模型调度仍是未来增强。 | `docs/AGENT_TEAM_TECH_DESIGN.md`, `docs/AGENT_TEAM_ACCEPTANCE.md`, `docs/CODECLAW_FEATURE_COMPLETION_PLAN.md` |
| Native tools | 已实现 | 文件、bash、memory、RAG、Graph、knowledge、Task、Report/Dashboard 等 native tools 已注册和受权限控制。 | `docs/SLASH_COMMANDS.md` |
| MCP bridge | 已实现 | 支持 stdio/in-process MCP、工具调用、资源读取和权限管控。 | `docs/SLASH_COMMANDS.md` |
| Beelink MCP / Dremio data lane | 已实现 | 标准 MCP server，含 metadata sync、semantic draft、SQL guidance/rules、preview、artifact export、L3 Beelink source。 | `docs/BEELINK_DATA_ANALYSIS_DESIGN.md`, `docs/INTEGRATIONS-beelink.md` |
| Reports / Dashboards | 已实现基础版 | Core types/store/service/tools、Web list/detail/render/upgrade、provenance 展示、product-flow golden smoke 已有；企业编辑器/订阅/ACL 是更远期企业目标，不属于当前 P2。 | `docs/CODECLAW_REPORT_DASHBOARD_TECH_DESIGN.md`, `docs/CODECLAW_REPORT_DASHBOARD_DEV_PLAN.md` |
| Charting | 已实现基础版 | 产品图表走内部 ECharts runtime；外部 ECharts MCP 不再是主路径。 | `docs/CODECLAW_REPORT_DASHBOARD_TECH_DESIGN.md` |
| DICOM / Radiology MCP | 已实现基础版 | `dicom-mcp` 支持本地 DICOM inspect/render/prepare；Web `.dcm` 上传通过 MCP 预处理；压缩、多帧、DICOMweb 仍未支持。 | `docs/INTEGRATIONS-dicom.md` |
| Skills / Persona | 已实现基础版 | 内置 skills、radiology persona、skill registry、prompt 注入和基础工具约束存在。 | `docs/USAGE.md`, `docs/INTEGRATIONS-dicom.md` |
| Skill marketplace / version governance | 未来目标 | skill 市场、版本治理、签名分发和组织级策略仍是后续目标。 | `docs/CODECLAW_FEATURE_COMPLETION_PLAN.md` |
| Hooks | 已实现基础版 | hooks runner/statusLine 等存在；复杂 stop hook quality gate 仍可增强。 | `docs/SLASH_COMMANDS.md` |
| Cron | 已实现基础版 | 内置 cron 命令和运行历史存在；分布式调度、依赖 DAG、失败重试是未来目标。 | `docs/SLASH_COMMANDS.md` |
| WeChat | 已实现基础版 | iLink token、登录/刷新/状态/worker/send 命令、轮询、媒体处理和语音转写路径存在。 | `docs/WECHAT_BOT.md`, `docs/INSTALL.md` |
| WeChat 生产级运维 | 未来目标 | 二维码长期稳定性、自动重连、账号风控、消息可靠投递和运维告警仍需真实环境验证。 | `docs/CODECLAW_FEATURE_COMPLETION_PLAN.md` |
| SDK / HTTP API | 已实现基础版 | HTTP server、SDK client、共享 session/permission 语义和基础文档存在。 | `docs/HTTP_API.md` |
| 企业 Gateway / SDK 生态 | 未来目标（非当前 P2） | 完整 SDK 发布、SSE 生态、企业网关、多租户接入和外部开发者稳定 API 仍是更远期目标。 | `docs/CODECLAW_FEATURE_COMPLETION_PLAN.md` |
| Desktop notification / Mobile Companion | P2 目标 | 当前 P2 只做 Desktop Notification 与 Mobile Companion：本地通知/history、移动端状态查看与审批，不另起 agent loop。 | `docs/CODECLAW_FEATURE_COMPLETION_PLAN.md` |
| Agent Team 自动 write-worker 编排 | P2 目标 | 基础 Team 已落地；P2 只开放自动 write-worker proposal/preview/confirm/apply/replay 编排，并继续强制 claim、Merge Gate 和 `executeClaimedFileWrite()`。 | `docs/AGENT_TEAM_TECH_DESIGN.md`, `docs/AGENT_TEAM_ACCEPTANCE.md`, `docs/CODECLAW_FEATURE_COMPLETION_PLAN.md` |
| Golden tests | 已实现 | data/ask/dialect/meta-router/report-dashboard 多套 golden；real runner 可 smoke，但依赖健康通用模型。 | `docs/DATA_GOLDEN_TESTS.md`, `docs/DIALECT_AND_META_GOLDEN_TESTS.md`, `docs/GOLDEN_REAL_RUNNER_TECH_DESIGN.md` |
| 配置决策模板 | 已实现 | `.env.example` 和 `env.json` 已提供设置模板；`env.json` 当前不自动加载。 | `docs/INSTALL.md`, `env.json` |
| 权限 / 审批 / Audit 基础 | 已实现基础版 | permission mode、approval queue、audit.db、hash chain 检查和 doctor 提示存在。 | `docs/SLASH_COMMANDS.md`, `docs/INSTALL.md` |
| 企业 ACL / 订阅 / 集中审计产品化 | 未来目标（非当前 P2） | 企业 ACL、组织共享、订阅分发、集中审计、合规报表和管理后台仍是更远期企业版目标。 | `docs/CODECLAW_DASHBOARD_DESIGN.md` |

同步原则：

1. 本文保留 v1.0 愿景；交付状态以本矩阵和各详细技术文档为准。
2. 新增核心能力时，必须同步本矩阵、对应 `docs/*TECH_DESIGN.md` 和 `PROGRESS_LOG.md`。
3. 若矩阵与代码冲突，优先以代码和最近验证记录为准，再修本文。

---

## 3. 支柱一：深度语义理解

不只是文本搜索——真正"读懂"代码结构和依赖关系。

| 能力 | 实现机制 | MVP 阶段 |
|------|---------|----------|
| **LSP 符号索引** | multilspy + Language Server Protocol → 项目级 AST、函数/类/变量定义与引用关系图谱 | P1 |
| **代码依赖分析** | CodebaseGraph：跨文件函数调用链、import 依赖图 | P2 |
| **向量语义检索** | BM25（关键词）+ bge-m3 embedding（cosine 相似度）→ 混合召回 | P1 |
| **项目结构感知** | Auto-discovery 文件树 + Glob/Grep → Planner 理解目录结构和模块划分 | P1 |

vs Cursor 的差异：Cursor 靠文本匹配查找文件；CodeClaw 通过 LSP 图谱理解代码关系，能回答"这个函数被谁调用？""修改这里会影响哪些模块？"

---

## 4. 支柱二：长程任务规划

不只是接收指令→执行——能自主拆解、规划、纠偏、闭环交付。

| 能力 | 实现机制 | MVP 阶段 |
|------|---------|----------|
| **Goal→Plan→Execute** | Planner(LLM)将自然语言目标拆解为 Task DAG → Executor 按拓扑序调度工具调用 | P1 |
| **Reflector Gap Analysis** | 对 Observation（步骤执行结果）做偏差分析 → 判断 match/gap → 触发继续/重试/重规划/上报 | P1 |
| **FSM 状态机控制** | PLANNING→EXECUTING→REFLECTING→RETRYING/REPLAN→COMPLETED/HALTED/ESCALATED，每步附带 trace_id 审计链路 | P1 |
| **Agent Team 多角色协同** | Coordinator 拆分任务 → read-only Worker / Blackboard / Mailbox / Merge Gate 汇总证据；claimed-file gate + write preview/confirm 已支持受控写入，自动 write-worker 与跨 provider 多模型调度留后续增强 | 已实现基础版 |
| **Loop Detection 防死循环** | 检测连续 Planner 输出相同 DAG → 触发 ESCALATED，要求人工介入 | P1 |

vs Cursor 的差异：Cursor 是 prompt-driven（用户引导每一步）；CodeClaw 是 autonomous planning（自主规划→执行→纠偏→交付）。

---

## 5. 支柱三：多渠道交互

用户在哪都能指挥 CodeClaw——CLI 终端、微信私聊、通用 Channel Adapter 统一接入。

| 渠道 | 入站协议 | 出站回传 | 状态 |
|------|---------|---------|------|
| **CLI REPL** | stdin/stdout + Ink（TUI）渲染流式输出 + Spinner 动画 | TUI 组件（进度条/审批卡片/结果展示） | ✅ P1 |
| **iLink 微信 Bot** | 长轮询 pollUpdates() 每 1s 监听 → buildMessageContext | sendMessage(text, user_id, contextToken) 回传 Markdown 卡片 | P3 |
| **SDK/HTTP API** | Node.js SDK / REST + SSE 流式 | JSON + SSE event stream | P2 |
| **桌面通知** | OS native | Notification Center / D-Bus / Toast | P2 |
| **Mobile Companion** | 自定义客户端 / 复用 HTTP API | 状态查看、报告摘要、审批处理、推送接口 | P2 |

所有渠道消息统一转换为 **IngressMessage** → SessionManager → Orchestration，屏蔽物理渠道差异。

### 5.1 启动与首次配置流程

CodeClaw 的首个可交付体验必须覆盖“首次启动即能完成基本配置”，不能假设用户已经手动准备好全部环境。

**首次启动目标**：

1. 用户第一次运行 `codeclaw` 时能知道下一步做什么
2. 没有 API Key 或本地模型时，系统能给出明确引导
3. 用户能在 3 分钟内完成最小配置并进入可用状态
4. 配置失败时能降级到只读/演示模式，而不是直接退出

**首次启动主流程**：

1. 检查 `~/.codeclaw/config.yaml` 是否存在
2. 若不存在，进入 `setup` 向导
3. 引导用户选择默认 Provider、语言、权限模式、默认工作目录
4. 校验 API Key / 本地模型连通性
5. 写入配置并展示首次使用提示
6. 进入 CLI 会话

**非首次启动流程**：

1. 加载配置
2. 检查 Provider 可用性
3. 提示可恢复 session / 未决审批
4. 进入默认会话或恢复上次会话

**异常分支**：

1. 无可用 Provider：进入受限模式，只允许查看帮助、配置、诊断
2. 配置损坏：提示修复或回退到最近一次可用配置
3. 工作目录无权限：提示切换目录，不阻塞全局启动

### 5.2 CLI 交互界面目标

CLI 不是单纯的 stdout 文本流，而是带状态感知的 TUI。P1 阶段必须优先保证“清晰、稳定、可恢复”，而不是追求复杂动画。

**界面目标**：

1. 用户能随时知道当前在做什么
2. 审批、错误、压缩、恢复这些关键状态要有明确视觉区分
3. 长任务过程中，输出区不能被状态提示淹没
4. 中断、恢复、重新规划要有一致的交互位置

**P1 CLI 界面组成**：

| 区域 | 功能 |
|------|------|
| Header | 当前会话、模型、权限模式、工作目录、预算摘要 |
| Main Transcript | 用户/助手消息、工具输出摘要、流式文本 |
| Status Bar | 当前阶段：planning / executing / waiting_approval / compacting / completed |
| Approval Card | 待审批操作、风险等级、允许/拒绝动作 |
| Composer | 用户输入框、快捷命令提示 |
| Footer Hint | `/help`、`/resume`、`/compact`、`Ctrl+C` 等提示 |

**主界面原型图**：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ CodeClaw  session: sess_01  model: sonnet  mode: plan  cwd: ~/project      │
│ budget: $0.42  tokens: 18.2k  provider: anthropic                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ User                                                                      │
│ 帮我定位 test 失败原因并修复                                              │
│                                                                            │
│ Assistant                                                                 │
│ 正在分析失败用例，先读取测试输出并定位相关文件。                           │
│                                                                            │
│ Tool: Bash                                                                 │
│ npm test -- login.spec.ts                                                  │
│ exit=1  duration=3.2s                                                      │
│                                                                            │
│ Assistant                                                                 │
│ 失败集中在 token 刷新逻辑，我接着检查 auth 模块。                          │
│                                                                            │
│ Tool: Read src/auth/token.ts                                               │
│ Tool: Read tests/login.spec.ts                                             │
│                                                                            │
│ Assistant...                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ phase: executing   task: inspect auth flow   pending tools: 0              │
├──────────────────────────────────────────────────────────────────────────────┤
│ > 输入消息或命令（/help /resume /compact）                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ Enter 发送   Tab 补全   Ctrl+C 中断   ↑↓ 历史   Esc 关闭浮层               │
└──────────────────────────────────────────────────────────────────────────────┘
```

**审批卡片原型图**：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ APPROVAL REQUIRED                                                          │
│ tool: Bash                                                                 │
│ risk: high                                                                 │
│ action: rm -rf ./dist && npm run build                                     │
│ reason: 需要清理旧构建产物后重新构建验证修复                               │
│ affected paths: ./dist                                                     │
│                                                                            │
│ [a] Approve    [d] Deny    [v] View diff/context                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

**恢复会话原型图**：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ RECOVERY                                                                   │
│ Found 1 pending approval and 2 resumable sessions                          │
│                                                                            │
│ [1] Resume approval: edit src/config.ts                                    │
│ [2] Resume session: "fix failing tests"                                    │
│ [3] Resume session: "review auth refactor"                                 │
│ [4] Start a new session                                                    │
│                                                                            │
│ Select: _                                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**首次启动向导原型图**：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Welcome to CodeClaw                                                        │
│                                                                            │
│ Step 1/5: Choose language                                                  │
│ > 中文                                                                     │
│   English                                                                  │
│                                                                            │
│ Step 2/5: Choose default provider                                          │
│ > Anthropic                                                                │
│   OpenAI                                                                   │
│   Ollama                                                                   │
│   LMStudio                                                                 │
│                                                                            │
│ Step 3/5: Enter API key or local endpoint                                  │
│ Step 4/5: Choose workspace and permission mode                             │
│ Step 5/5: Confirm and write ~/.codeclaw/config.yaml                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 关键交互流程

**普通任务流程**

1. 用户输入目标
2. 系统显示进入 planning
3. 若需要工具，显示 executing 和工具摘要
4. 完成后给出结果总结与下一步建议

**审批流程**

1. 高风险工具调用触发审批卡片
2. 主状态进入 `waiting_approval`
3. 用户批准或拒绝
4. 系统继续执行或中止并解释原因

**中断与恢复流程**

1. 用户中断当前任务
2. 系统将会话标记为 interrupted
3. 下次启动时展示“恢复上次任务”入口
4. 用户可恢复、放弃或导出上下文

**压缩流程**

1. 上下文接近阈值时进入 compacting
2. 系统显示压缩提示和结果摘要
3. 返回原任务继续执行

### 5.4 P1 交互验收标准

1. 首次启动在无配置机器上可完成向导并进入会话
2. CLI 中能清楚看见当前模型、权限模式、任务阶段
3. 审批卡片与普通消息视觉上明显区分
4. 中断后能恢复会话或明确放弃
5. 压缩、错误、审批三类系统状态都能在界面中被识别
6. 纯键盘操作即可完成主要流程

---

## 6. 五层架构

```
┌──────────────────────────────────────────────────────────────┐
│  接入层 Omni-Channel Gateway                                  │
│  CLI(REPL) ─── iLink微信Bot ─── Channel Adapter ─── SDK/API  │
│  (支柱三：多渠道统一入口)                                       │
├──────────────────────────────────────────────────────────────┤
│  编排层 Orchestration                                          │
│  Planner → Executor → Reflector 循环                         │
│  + Agent Team Leader/Worker 协同 (Coordinator 框架)          │
│  (支柱二：长程规划 + 执行)                                      │
├──────────────────────────────────────────────────────────────┤
│  认知层 Cognition                                              │
│  L1(滚动缓冲~200k) → L2(SessionMem) → L3(Codebase RAG+BM25) │
│  Auto-Compact 智能压缩                                         │
├──────────────────────────────────────────────────────────────┤
│  能力层 Capability                                             │
│  Tool(Read/Bash/Write/Glob/Grep/LSP/MCP/Agent/Task/Skill)   │
│  Skill(code_review/bug_fix/data_insight/git_flow/...)        │
│  (支柱一：深度语义理解)                                          │
├──────────────────────────────────────────────────────────────┤
│  基础设施层 Infrastructure                                     │
│  CostTracker · Auto-Compact · PermissionGate · AuditLog     │
│  SQLite + JSONL + pino 日志 + i18n                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. 数据流架构

```
用户输入
    │
    ▼
┌─────────────┐
│ Channel      │  CLI / WebSocket / HTTP / SDK / WeChat
│ Adapter      │  统一转换为 IngressMessage
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Ingress      │
│ Gateway      │  1. 渠道适配（原始消息 → IngressMessage）
│              │  2. Session 映射（channel + userId → sessionId）
│              │  3. 路由到 Agent Loop
└──────┬──────┘
       │
       ▼
┌─────────────┐         ┌─────────────┐
│ Agent Loop  │◄────────│ State Layer │
│             │         │  AppState   │
│ 1. 构建上下文 │         └─────────────┘
│ 2. 调用 LLM  │
│ 3. 解析响应  │
│ 4. 执行工具  │
│ 5. 追加结果  │
│ 6. 检查压缩  │
│ 7. 循环      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Result       │  流式输出 + 格式化 + 渠道回传
│ Delivery     │
└─────────────┘
```

---

## 8. 数据模型

### 8.1 核心类型

```typescript
type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

interface Message {
  role: MessageRole;
  content: ContentBlock[];
  metadata?: Record<string, unknown>;
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'file'; filename: string; data: Buffer }
  | { type: 'tool_use'; toolName: string; toolInput: Record<string, unknown>; toolCallId: string }
  | { type: 'tool_result'; toolCallId: string; content: string }
  | { type: 'thinking'; text: string }
  | { type: 'reasoning'; text: string };

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolResult {
  toolCallId: string;
  content: string;
  status: 'success' | 'error' | 'timeout';
}

interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}
```

### 8.2 会话模型

```typescript
interface Session {
  id: string;
  userId: string;
  channelId: ChannelType;
  messages: Message[];           // L1 滚动缓冲
  sessionMemory: ImportantMemory[]; // L2 会话记忆
  createdAt: number;
  updatedAt: number;
  cost: {
    totalUSD: number;
    tokens: number;
    byProvider: Record<string, { tokens: number; cost: number }>;
  };
}
```

---

## 9. 状态管理

```typescript
interface AppState {
  currentProvider: string;
  currentSession: string;
  permissionMode: PermissionMode;
  language: 'zh' | 'en';
  budgetLimit: number;
  recentTools: string[];
  // ... 其他状态
}

/** 全局状态管理（单例） */
interface AppStateStore {
  state: AppState;
  listeners: Set<() => void>;
  get(): AppState;
  set(partial: Partial<AppState>): void;
  subscribe(listener: () => void): () => void;
  reset(): void;
}
```

### 9.1 权限模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `default` | 每次询问 | 安全优先 |
| `plan` | 先计划再执行 | 高风险操作 |
| `auto` | 自动批准（低风险） | 只读操作 |
| `acceptEdits` | 自动批准编辑 | 本地可信开发 |
| `bypassPermissions` | 绕过权限 | 开发者调试 |
| `dontAsk` | 永远不问 | 自动化/CI |

### 9.2 权限矩阵

| 操作 | default | plan | auto | acceptEdits | bypassPermissions |
|------|---------|------|------|-------------|--------|
| Read | allow | allow | allow | allow | allow |
| Glob | allow | allow | allow | allow | allow |
| Write (new) | ask | ask | deny | allow | allow |
| Write (edit) | ask | ask | allow | allow | allow |
| Bash (safe) | ask | ask | allow | allow | allow |
| Bash (danger) | ask | ask | deny | deny | allow |
| Delete | ask | plan | deny | deny | allow |

---

## 10. Provider 抽象层

### 10.1 接口定义

```typescript
type ProviderType = 'anthropic' | 'openai' | 'ollama' | 'local';

interface LLMProvider {
  id: string;
  displayName: string;
  type: ProviderType;
  stream(request: LLMRequest): AsyncGenerator<LLMResponseEvent>;
  healthCheck(): Promise<boolean>;
  getProviderDef(): ProviderDef;
  getConfig(): ProviderConfig;
  configure(config: ProviderConfig): void;
}

interface LLMRequest {
  model: string;
  systemPrompt: string;
  messages: Message[];
  thinkingConfig?: ThinkingConfig;
  tools: ToolDef[];
  signal: AbortSignal;
  options: LLMQueryOptions;
}

type LLMResponseEvent =
  | { type: 'stream'; text: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'usage'; usage: Usage }
  | { type: 'done'; finishReason: string };

interface ProviderDef {
  id: string;
  displayName: string;
  type: ProviderType;
  defaultModel: string;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  requiresApiKey: boolean;
}
```

### 10.2 内置 Provider

| Provider | Base URL | API Key 环境变量 | 默认模型 |
|----------|----------|-----------------|----------|
| `anthropic` | api.anthropic.com | `CLAW_CODE_ANTHROPIC_API_KEY` | claude-sonnet-4-6 |
| `openai` | api.openai.com/v1 | `CLAW_CODE_OPENAI_API_KEY` | gpt-4.1-mini |
| `ollama` | 127.0.0.1:11434/v1 | `CLAW_CODE_OLLAMA_API_KEY` | llama3.1 |
| `local` | 可配置 | 可配置 | 可配置 |

### 10.3 选择优先级

1. `--provider` CLI 参数
2. `CLAW_CODE_PROVIDER` 环境变量
3. `CLAUDE_CODE_PROVIDER` 兼容环境变量
4. `CLAW_CODE_ANTHROPIC_API_KEY` 是否存在
5. `CLAW_CODE_OPENAI_API_KEY` 是否存在
6. local 模型可用
7. 默认 `anthropic`

### 10.4 自定义扩展

```typescript
// 1. 创建适配器
export const myProvider: LLMProvider = {
  id: 'my-provider',
  displayName: 'My Provider',
  stream(request: LLMRequest): AsyncGenerator<LLMResponseEvent> { /* ... */ }
}

// 2. 注册
BUILTIN_PROVIDERS.push(myProvider)
```

---

## 11. 工具系统

### 11.1 工具基类

```typescript
interface Tool<Input = any, Output = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  execute(input: Input, context: ToolUseContext): Promise<ToolResult>;
  isEnabled: () => boolean;
  isConcurrencySafe: (input: Input) => boolean;
  isReadOnly: (input: Input) => boolean;
  isDestructive: (input: Input) => boolean;
  checkPermissions: (input: Input) => Promise<PermissionResult>;
  userFacingName: () => string;
}
```

### 11.2 buildTool 工厂模式

```typescript
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
};

function buildTool<D extends ToolDef>(def: D): Tool {
  return { ...TOOL_DEFAULTS, ...def } as Tool;
}
```

### 11.3 MVP 工具清单

| 类别 | 工具 | 优先级 |
|------|------|--------|
| 文件 | FileReadTool, FileWriteTool, FileEditTool, GlobTool | P0 |
| 搜索 | GrepTool, CodebaseSearch | P1 |
| Shell | BashTool | P0 |
| Agent | AgentTool, SubAgentTool, TaskTool | P2 |
| 任务 | TaskCreateTool, TaskGetTool, TaskListTool, TaskStopTool | P1 |
| MCP | MCPTool, ReadMcpResourceTool, McpAuthTool | P2 |
| LSP | LSPTool | P1 |
| 交互 | AskQuestionTool, TodoWriteTool | P0 |

### 11.4 权限决策流

```
工具调用请求
  → validateInput()          → 拒绝无效输入
  → checkPermissions()       → 默认行为 (allow/ask/deny)
  → isDestructive?           → 高风险：plan 模式
  → isConcurrencySafe?       → 安全：allow
  → 输出：allow/ask/deny
```

---

## 12. 认知层设计（Context L1/L2/L3）

### 12.1 三层记忆架构

| 层 | 名称 | 容量 | 机制 |
|----|------|------|------|
| **L1** | 滚动缓冲 | ~200k tokens | Auto-Compact 智能压缩 |
| **L2** | Session Memory | 会话级 | JSONL 持久化 |
| **L3** | Codebase RAG | 代码库级 | BM25 + embedding 混合检索 |

### 12.2 L1 滚动缓冲（Auto-Compact）

| 压缩方式 | 触发 | 说明 |
|----------|------|------|
| `autoCompact` | 上下文 > 阈值（默认 167k tokens） | 自动压缩旧消息 |
| `snipCompact` | 手动触发 | 手动移除僵尸消息 |
| `contextCollapse` | 实验性 | 重构上下文结构 |

**压缩流程**：
```
上下文大小 > autoCompactWindow
  → 压缩早期消息
  → 生成摘要消息（compact summary）
  → 标记 compact boundary
  → 更新有效上下文窗口
```

### 12.3 L2 Session Memory（会话记忆）

| 能力 | 说明 |
|------|------|
| 会话记忆持久化 | 跨会话记忆 |
| 记忆提取 | extractMemories |
| 记忆预取 | 相关记忆预加载 |
| 重要性评分 | importanceScore 排序 |

```typescript
interface SessionMemoryEntry {
  sessionId: string;
  summaryText: string;
  importanceScore: number;
}
```

### 12.4 L3 Codebase RAG（代码库语义检索）

| 组件 | 技术 | 用途 |
|------|------|------|
| BM25 | 关键词检索 | 快速文本匹配 |
| bge-m3 embedding | cosine 相似度 | 语义向量召回 |
| 混合召回 | BM25 + embedding | "这段代码在哪？""谁用到了这个 API？" |

---

## 13. 权限系统

### 13.1 沙箱隔离

| 沙箱级别 | 说明 | 适用场景 |
|----------|------|----------|
| 无沙箱 | 完全访问 | 信任模式 |
| 文件沙箱 | 限定文件访问 | 默认模式 |
| 命令沙箱 | 白名单命令 | plan 模式 |
| 网络沙箱 | 限制网络访问 | 安全敏感场景 |

### 13.2 成本防护

```typescript
interface CostTracker {
  currentSessionCost: number;
  dailyCost: number;
  monthlyCost: number;
  budgetLimit: number;
  checkBudget(): BudgetStatus;
  recordUsage(provider: string, usage: Usage): void;
}

interface BudgetStatus {
  ok: boolean;
  current: number;
  limit: number;
  percentage: number;
  warning?: string;
}
```

---

## 14. 技能系统

```typescript
type SkillDefinition = {
  name: string;
  description: string;
  aliases?: string[];
  whenToUse?: string;
  argumentHint?: string;
  allowedTools?: string[];
  model?: string;
  context?: 'inline' | 'fork';
  agent?: string;
  files?: string[]; // 当前实现为相对路径清单；未来插件/打包 skill 可扩展为文件内容包
  mcpServers?: string[]; // 该 skill 依赖的 MCP server；只做提示/诊断，不自动启动
  mcpTools?: string[]; // 推荐 native MCP tool 名，如 mcp__beelink__RunSqlQuery
  getPromptForCommand: (args, context) => Promise<ContentBlockParam[]>;
};
```

当前基础版已实现 `whenToUse / context / model / agent / files / mcpServers / mcpTools` 元数据解析、校验和展示：用户 skill 可在
`~/.codeclaw/skills/<name>/manifest.yaml` 中声明这些字段；系统提示、`/skills` 列表/激活反馈和 active skill
banner 会展示这些边界。`model` 和 `agent` 目前只作为路由建议元数据，不会直接改变 provider selection。

### 14.1 Skills 与 Plugins 的关系

- **Skills**: 预定义的工作流模板（内建）
- **Plugins**: 可扩展的能力包（市场/本地）
- Skills 可以作为 Plugin 的组件

### 14.2 示例 Skills

| 名称 | 用途 | allowedTools |
|------|------|-------------|
| code_review | 代码审查 | LSPTool, GrepTool, Bash(eslint) |
| bug_fix | Bug 修复 | LSPTool, FileEditTool, Bash |
| data_insight | 数据分析 | Bash(python/pandas), FileRead |
| git_flow | Git 工作流 | Bash(git), Bash(git-diff) |
| frontend_dev | 前端开发 | FileWrite, FileRead, Bash(npm) |
| backend_dev | 后端开发 | FileWrite, FileRead, Bash |

---

## 15. 钩子系统

| 钩子 | 触发时机 | 执行方式 |
|------|----------|----------|
| `pre_tool_use` | 工具调用前 | command/http/prompt |
| `post_tool_use` | 工具调用后 | command/http/prompt |
| `pre_compact` | 压缩前 | command/http/prompt |
| `post_compact` | 压缩后 | command/http/prompt |
| `session_start` | 会话开始 | command/http/prompt |
| `pre_stream` | 渠道输出前 | command/http/prompt |
| `post_stream` | 渠道输出后 | command/http/prompt |

**钩子配置格式（与 Claude Code `.claude/hooks/` 一致）**：

```json
{
  "hooks": {
    "pre_tool_use": {
      "commands": ["./scripts/pre-tool-hook.sh"]
    },
    "post_tool_use": {
      "http": {
        "url": "https://example.com/post-tool",
        "method": "POST"
      }
    }
  }
}
```

---

## 16. MCP 协议集成

### 16.1 传输协议

| 传输 | 配置结构 | 适用场景 |
|------|----------|----------|
| `stdio` | `{ command, args[], env }` | 本地子进程 |
| `sse` | `{ url, headers }` | 远程 HTTP EventSource |
| `http` | `{ url, headers, oauth }` | 可流式 HTTP |
| `ws` | `{ url }` | WebSocket |
| `sdk` | 进程内 | 内嵌服务 |
| `sse-ide` | 内部 | IDE 扩展 |

### 16.2 MCP 能力

- MCP 工具调用 (MCPTool)
- MCP 资源读取 (ReadMcpResourceTool)
- MCP 资源列表 (ListMcpResourcesTool)
- MCP 认证 (McpAuthTool)
- MCP 服务器审批
- MCP 监控
- OAuth 支持
- Cross-App Access (XAA/SEP-990)

### 16.3 MCP 服务器配置

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me"],
      "transport": "stdio"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "." },
      "transport": "stdio"
    }
  }
}
```

---

## 17. 插件系统

### 17.1 插件类型

| 类型 | 来源 | 管理 |
|------|------|------|
| builtin | 随 CLI 发布 | /plugin 启用/禁用 |
| marketplace | GitHub/自定义源 | 市场安装 |
| local | 本地路径 | 手动配置 |

### 17.2 插件组件类型

- commands — 斜杠命令
- agents — 代理定义
- skills — 技能
- hooks — 钩子
- output-styles — 输出样式
- mcpServers — MCP 服务器
- lspServers — LSP 服务器

### 17.3 插件 Manifest 格式

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My custom plugin",
  "commands": [{ "name": "/my-cmd", "description": "Custom command" }],
  "tools": [{ "name": "my_tool", "description": "Custom tool" }]
}
```

---

## 18. 技术栈选型

### 18.1 语言与运行时

| 层级 | 技术选型 | 理由 |
|------|---------|------|
| **主语言** | TypeScript 5.x | 全栈统一类型系统，与 Claude Code 源码生态兼容 |
| **运行时** | Node.js 22 LTS | Long-term support，V8 性能成熟，ESM/CJS 双兼容 |
| **构建** | esbuild + bun（feature-gated build） | 快速编译，支持 `feature()` 编译时死代码消除 |
| **包管理** | npm 10+ | 兼容 monorepo (workspaces) |

### 18.2 核心依赖

| 类别 | 库名 | 版本 | 用途 | 阶段 |
|------|------|------|------|------|
| LLM 集成 | `fetch` (native) | native | Anthropic/OpenAI/Ollama 调用 | MVP ✅ |
| CLI 渲染 | `ink` | latest | React-based TUI | MVP ✅ |
| 测试 | `vitest` | latest | 单元测试 | MVP ✅ |
| 配置 | `js-yaml` | latest | 配置读写（稳定优先） | MVP ✅ |
| LSP | `multilspy` | latest | 跨语言服务器协议封装 | Phase 1.5 |
| 数据库 | `better-sqlite3` | latest | 本地持久化 | Phase 1.9 |
| 日志 | `pino` | latest | 高性能 JSON 结构化日志 | Phase 4 |
| 测试工具 | `@testing-library/react` | latest | TUI 组件测试 | MVP |
| i18n | `i18next` | latest | 中/英双语国际化 | Phase 3 |
| 微信 Bot | `wechaty` | latest | iLink 微信 Bot 对接 | Phase 3 |
| 消息队列 | `ioredis` | latest | WebSocket channel adapter 消息转发 | Phase 3 |
| WebSocket | `ws` | latest | 双向通信通道 | Phase 3 |
| SSE | `eventsource-parser` | latest | 服务端推送事件解析 | Phase 3 |
| 向量检索 | `bge-m3` (ONNX Runtime) | latest | 语义 embedding | Phase 3 |

### 18.3 关键决策

| 决策点 | 选项 A | 选项 B | 选择 | 理由 |
|--------|---------|---------|------|------|
| LLM 调用 | 官方 SDK | native `fetch` | **fetch** | 零依赖，更快冷启动 |
| 数据库 | SQLite | JSONL 文件 | **JSONL→SQLite** | 简单部署 + 生产级 |
| CLI 渲染 | Ink (React) | Commander+chalk | **Ink** | 需要进度条/审批卡片等 TUI |
| 消息协议 | WebSocket | SSE | **WebSocket** | 双向通信需求 |
| 向量模型 | bge-m3 | all-minilm | **bge-m3** | 中文语义能力更强 |
| LSP 实现 | multilspy | tree-sitter-wasm | **multilspy** | 成熟生态，支持多语言 |
| 微信 Bot | wechaty | 自建 API 轮询 | **wechaty** | 社区成熟，支持多平台 |

### 18.4 开发环境与编译命令

CodeClaw 采用“两条链路”：

1. **日常开发链路**：`Node.js 22 + npm`
2. **正式打包链路**：`bun + esbuild`

**环境基线**：

| 项目 | 要求 | 用途 |
|------|------|------|
| Node.js | 22 LTS | 本地开发、运行、测试 |
| npm | 10+ | 安装依赖、执行脚本 |
| Bun | 1.x | 正式 build、feature-gated 打包 |
| TypeScript | 5.x | 类型检查 |

**标准脚本约定**：

| 命令 | 用途 |
|------|------|
| `npm install` | 安装项目依赖 |
| `npm run dev` | 本地开发模式启动 CLI |
| `npm run typecheck` | 执行 TypeScript 类型检查 |
| `npm run test` | 执行 `vitest` 测试 |
| `npm run lint` | 代码风格与静态检查 |
| `bun run build` | 生成正式 bundle |
| `node dist/cli.js` | 验证打包产物可运行 |

**原则**：

1. 日常开发不强依赖 Bun
2. 发布前必须通过 `bun run build`
3. CI 至少执行 `typecheck + test + build`

---

## 19. 配置

```yaml
# ~/.codeclaw/config.yaml — Agent Platform Configuration

gateway:
  enabled_channels:
    - type: cli
  bots:
    ilink_wechat:
      enabled: true
      token_file: "~/.claude/wechat-ibot/default.json"

agent_team:
  enabled: true
  max_workers: 4

memory:
  l1_auto_compact_threshold: 167000
  l2_dir: "~/.codeclaw/sessions/"
  l3_enabled: true

permission:
  mode: personal

provider:
  default: anthropic
  fallback: openai
```

---

## 20. 构建与部署

### 20.1 安装

```bash
npm install
npm run dev
```

### 20.2 配置

```bash
# 配置 Provider
codeclaw config set provider.anthropic.api-key <key>
codeclaw config set provider.openai.api-key <key>

# 配置偏好
codeclaw config set defaults.language zh
codeclaw config set defaults.permissionMode plan
```

### 20.3 开发与编译

```bash
# 本地开发
npm run dev

# 类型检查
npm run typecheck

# 测试
npm run test

# 正式打包
bun run build

# 验证产物
node dist/cli.js --version
```

### 20.4 日志与调试

```bash
# 查看日志
cat ~/.codeclaw/logs/codeclaw.log

# 调试模式
codeclaw --debug

# 诊断
codeclaw doctor
```

---

## 21. 数据持久化

| 路径 | 类型 | 内容 |
|------|------|------|
| `.codeclaw/config.yaml` | 文件 | 全局配置 |
| `.codeclaw/providers.json` | JSON | Provider 配置 |
| `.codeclaw/sessions/` | JSONL | 会话 |
| `.codeclaw/hooks/` | 目录 | 钩子 |
| `.codeclaw/skills/` | 目录 | 技能 |
| `.codeclaw/plugins/` | 目录 | 插件缓存 |
| `.codeclaw/scheduled_tasks.json` | JSON | 定时任务 |

---

## 22. 国际化

| 项目 | 数量 | 说明 |
|------|------|------|
| 语言 | 中文 / 英文 | i18next 双语 |
| 翻译键 | ~350 条 | 加载/错误/成功/按钮/进度/权限 |
| 切换 | CLI `--lang` / 配置 | 运行时切换 |

---

## 23. 技术决策记录（ADR）

### ADR-001: 使用 native fetch 而非官方 SDK

- **背景**: 官方 SDK 增加依赖体积和冷启动时间
- **决策**: MVP 使用 native `fetch` + `AbortController` + SSE 解析器
- **理由**: 零依赖、更快冷启动、更少的 breaking change 风险
- **后续**: Phase 4 评估是否需要迁移回官方 SDK

### ADR-002: 数据库从 JSONL 起步，逐步迁移到 SQLite

- **背景**: SQLite 功能强大但增加部署复杂度
- **决策**: MVP 使用 JSONL 文件持久化，Phase 1.9 引入 SQLite 迁移
- **理由**: 简单部署 > 复杂功能，JSONL 足够支撑 MVP
- **后续**: SQLite 迁移时保持 JSONL 向后兼容

### ADR-003: CLI 渲染使用 Ink (React-based TUI)

- **背景**: 需要进度条、审批卡片、Spinner 等 TUI 组件
- **决策**: 使用 Ink 而非 Commander+chalk
- **理由**: 需要交互式 TUI 组件，React 生态成熟
- **后续**: 控制组件复杂度，避免 Ink 组件树过深

### ADR-004: Provider 抽象层隔离 LLM 依赖

- **背景**: 不同 Provider 的 API 格式差异大
- **决策**: LLMProvider 接口统一，各 Provider 实现适配
- **理由**: 多模型兼容，降低单一供应商锁定风险
- **后续**: 新增 Provider 只需实现 LLMProvider 接口 + register

### ADR-005: 个人版优先，不做企业级功能

- **背景**: Claude Code 包含大量企业级功能（遥测/MDM/工作树隔离等）
- **决策**: MVP 专注个人使用场景，企业功能延后
- **理由**: 个人版需求验证后，再考虑企业化扩展
- **后续**: 架构预留企业化扩展点（多租户/权限策略/审计日志）

### ADR-006: 配置系统直接使用 `js-yaml`

- **背景**: 配置文件需要稳定的 YAML 解析、注释兼容和错误提示
- **决策**: MVP 直接使用 `js-yaml`，不自研 YAML 解析器
- **理由**: 配置是基础设施能力，稳定性优先于“零依赖”
- **后续**: 后续若引入更强配置管理，可继续封装统一的 ConfigService

### ADR-007: 向量模型选择 bge-m3

- **背景**: 需要中文语义理解能力
- **决策**: 使用 bge-m3 而非 all-minilm
- **理由**: bge-m3 中文语义能力更强，支持多语言
- **后续**: 评估量化版本（onnxruntime）以减小内存占用

---

## 24. 设计缺口与收敛方案

### 24.1 MVP 边界

本版本的 **MVP 定义** 不是“完整自主智能体平台”，而是“可稳定完成本地代码任务的 CLI Agent 内核”。

**MVP 必须做到**：

1. CLI 单渠道稳定收发消息、流式输出、支持中断与恢复
2. 至少 2 个云 Provider + 1 个本地 Provider 可切换
3. File / Bash / Grep / Glob / Edit 工具可用并受权限控制
4. L1 Auto-Compact 可在长对话中稳定工作
5. Session 持久化、成本统计、错误恢复可用
6. 对简单任务支持“计划 → 执行 → 结果总结”的轻量闭环

**MVP 明确不承诺**：

1. 跨渠道一致审批体验
2. 通用多 Agent 团队协作
3. 完整 LSP 依赖图与跨语言调用图
4. 高质量通用 RAG 问答
5. 微信与移动端的生产级稳定性

### 24.2 必须补齐的 10 个设计缺口

| # | 缺口 | 当前问题 | 收敛方案 | 验收标准 |
|---|------|----------|----------|----------|
| 1 | 单一事实源 | 两份文档对阶段、权限模式、钩子定义不一致 | 以本文件为功能单一事实源，技术文档只做实现细化 | 术语、阶段、权限、钩子在两份文档完全一致 |
| 2 | MVP 边界 | 目标过大，容易把 P1 做成平台化大工程 | 明确 CLI-first，SDK/HTTP 为 P2，微信为 P3 | P1 关闭后不依赖微信/Mobile 也可独立交付 |
| 3 | Planner 完成判定 | 只有接口，没有“任务完成”的判定规则 | 引入 GoalDefinition、Observation、CompletionCheck 三元组 | 每个 Goal 都有可执行验收检查 |
| 4 | Reflector 纠偏规则 | 容易出现模型自评自证、假闭环 | Reflector 只基于工具结果和显式检查判断 gap | 不能仅凭 assistant 文本宣布完成 |
| 5 | LSP 回退策略 | LSP 启动失败或语言不支持时行为未定义 | 定义 LSP 不可用时回退到文件树 + grep + BM25 | 任一代码库都能退化运行，不因 LSP 不可用阻塞 |
| 6 | RAG 索引策略 | 没有 chunk、刷新、去重、融合规则 | 定义文件切块、增量刷新、BM25/向量融合与去重 | 同一仓库重复索引不会持续膨胀，结果可解释 |
| 7 | 审批流生命周期 | 创建/恢复有接口，但缺少跨中断状态机 | 审批状态统一持久化，CLI 先实现单会话恢复 | 杀进程重启后，未完成审批仍可恢复或取消 |
| 8 | 工具副作用控制 | 读写/执行/删除的风险模型还不够清晰 | 统一 ToolRiskLevel 与 PermissionMatrix | 危险命令必须可解释、可拦截、可审计 |
| 9 | 观测与回归 | 高状态复杂度系统缺少最小测试闭环 | Phase 1 起就建立 golden transcript 和状态机回归测试 | 升级后可回放关键对话并比对结果 |
| 10 | 性能与资源预算 | Token、索引、子进程、流式输出缺少上限 | 为每类资源定义 hard limit 和降级策略 | 超预算时系统降级而非失控 |

### 24.3 功能验收标准

**Phase 1 验收**

1. 用户可在 CLI 中发起任务、查看流式输出、执行工具、结束会话
2. Provider 切换、权限模式、会话持久化、成本统计可用
3. 上下文超长时能自动压缩，且不中断主流程
4. 至少 20 条 golden transcript 回放通过

**Phase 2 验收**

1. SDK/HTTP API 可复用同一 Agent Loop 和 Session 语义
2. Planner 产出的任务具备显式完成检查
3. LSP 不可用时系统可自动降级，不阻塞任务执行
4. MCP 与 Skills 可接入，但不会破坏核心闭环

**Phase 3 验收**

1. 微信接入复用同一审批与会话模型
2. L3 RAG 和增强 LSP 能提升真实任务成功率，而不是只增加复杂度
3. 多 Agent 仅在有明确收益的场景启用，默认仍以单 Agent 为主

## 附录：与 Claude Code 的关系

### 参考来源

本项目的以下模块参考了 Claude Code 源码。详细源码参考分析见 `docs/CLAUDE_CODE_REFERENCE_ANALYSIS.md`。

| 模块 | 参考源码 | 说明 |
|------|----------|------|
| Agent Loop | `src/query.ts` | compact、tool result budget、stop hooks、token budget、fallback 的组合式主循环。 |
| Provider / fallback | `src/services/api/*`, `src/query.ts` | provider 错误恢复、partial output 后不重复 fallback、输出恢复轮数限制。 |
| 上下文压缩 | `src/services/compact/*` | auto compact、micro compact、snip compact、连续失败 circuit breaker。 |
| 工具结果预算 | `src/utils/toolResultStorage.ts` | 大工具结果 artifact 化、空工具结果显式化、稳定 replacement。 |
| 工具系统 | `src/Tool.ts`, `src/services/tools/toolOrchestration.ts` | buildTool、read-only 并发、非安全工具串行。 |
| Agent / Team | `src/tools/AgentTool/*`, `src/tools/shared/spawnMultiAgent.ts`, `src/utils/swarm/*` | subagent、teammate、mailbox、permission sync、team state。 |
| Task 生命周期 | `src/tools/TaskCreateTool/*`, `TaskUpdateTool/*`, `TaskGetTool/*`, `TaskStopTool/*` | 长任务状态独立于最终模型总结。 |
| 钩子系统 | `src/query/stopHooks.ts`, `src/utils/hooks.ts` | stop hook、task completed hook、后台维护。 |

### 差异化定位

| 维度 | Claude Code | CodeClaw |
|------|------------|----------|
| 定位 | 编程助手 | **自主智能体平台** |
| 语义理解 | LSP 骨架（不完整） | **Codebase Graph + Symbol Index**（核心差异） |
| 多渠道 | CLI + IDE | **CLI + 微信 + SDK + HTTP** |
| 规划 | Prompt-driven | **Autonomous Planning** |
| 企业化 | 企业级功能 | **个人版优先** |
| 依赖 | 大量依赖 | **零依赖起步** |

### 设计策略

```
保留差异化优势 (CodeClaw 独有):
├── Ingress Gateway（多渠道统一接入）
├── 微信/企微集成
├── Codebase Graph（代码依赖图）
└── Symbol Index（符号索引）

吸收成熟经验 (参考 Claude Code):
├── Agent Loop 核心模式
├── Provider 抽象层
├── Auto-Compact 策略
├── Tool Result Budget / Artifact 策略
├── 工具系统设计（ToolPool 可见性 + risk/concurrency/approval 元数据已落地；read-only parallel 批次、mixed-batch 分段并发、审批 UI、Audit 查询和 skill fork 路由提示已接入）
├── Command Registry Diagnostics（slash command 来源 metadata、alias 数量、skill command 冲突记录已接入 /context）
├── Context Source Diagnostics（/context 与 Web Chat 状态卡已展示 system/tool/message/memory/skill 来源、最大上下文项和压缩建议）
├── 权限系统设计
├── Team Mailbox / Permission Sync
└── Task 生命周期管理

补齐缺失能力 (Claude Code 缺失 = CodeClaw 竞争力):
├── Codebase Graph ← 核心差异化
├── Symbol Index ← 核心差异化
├── Import Graph ← 核心差异化
└── 完整 LSP 实现 ← Phase 1.5
```
