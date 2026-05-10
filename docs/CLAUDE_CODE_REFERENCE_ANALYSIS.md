# Claude Code 源码参考分析

> 本文基于本地源码快照：
> `/Users/xutianliang/Downloads/ai/clawcode前端开发完毕版/clawcode/claude-code-source-code-main`
>
> 目的不是复制 Claude Code，而是抽取可用于 CodeClaw 功能设计的稳定机制，尤其是上下文治理、工具编排、Agent Team、任务恢复和 UI/命令面。

## 1. 已深读的关键文件

| 主题 | Claude Code 源码 | 主要观察 |
| --- | --- | --- |
| 主循环 | `src/query.ts` | Query loop 不是单一 provider 调用，而是 compact、tool result budget、stop hooks、token budget、fallback、tombstone、streaming tool executor 的组合。 |
| 输出恢复 | `src/query.ts` | `MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3`，max output / context window 类错误会走受控恢复，而不是无限继续。 |
| Token budget | `src/query/tokenBudget.ts` | 90% 预算触发继续控制；连续多轮低增量触发 diminishing returns 停止。 |
| Tool result budget | `src/utils/toolResultStorage.ts` | 大工具结果持久化为 artifact，消息里只保留引用和预览；空工具结果会替换成明确完成文本，避免模型最终总结为空。 |
| Stop hooks | `src/query/stopHooks.ts` | 每轮结束后运行质量门控、任务完成 hook、记忆抽取和后台维护。 |
| Auto compact | `src/services/compact/autoCompact.ts` | 基于有效上下文窗口预留 summary token，超过阈值自动压缩；连续失败有 circuit breaker。 |
| Micro compact | `src/services/compact/microCompact.ts` | 优先压缩 read/bash/grep/glob/web 等可压缩工具结果，减少上下文中重复工具输出。 |
| Tool orchestration | `src/services/tools/toolOrchestration.ts` | read-only 工具可分批并发，非安全工具串行，避免工具并发写冲突。 |
| Agent tool | `src/tools/AgentTool/AgentTool.tsx` | 支持 subagent type、model、后台任务、队友、worktree/remote 隔离和结果状态。 |
| Subagent runner | `src/tools/AgentTool/runAgent.ts` | 子 agent 可使用独立 prompt、allowed tools、MCP、权限、abort controller、文件状态 cache。 |
| Team spawn | `src/tools/shared/spawnMultiAgent.ts` | 队友可继承模型/权限/插件设置，支持 split pane、tmux、in-process、后台注册。 |
| Team state | `src/utils/swarm/teamHelpers.ts` | 团队配置落盘，记录成员、模型、权限模式、pane、session、subscriptions、worktree。 |
| Mailbox | `src/utils/teammateMailbox.ts` | 基于文件锁的 team inbox，支持未读消息、summary 预览和并发写入。 |
| Permission sync | `src/utils/swarm/permissionSync.ts` | Worker 权限请求通过 mailbox 交给 Leader，Leader 审批后写回 response。 |
| Task tools | `src/tools/TaskCreateTool/*`, `TaskUpdateTool/*`, `TaskGetTool/*`, `TaskStopTool/*` | 任务有 create/update/get/stop 生命周期，更新状态时会触发 hooks 和 UI 展开。 |

## 2. Claude Code 的核心设计模式

### 2.1 先治理上下文，再调用模型

Claude Code 在 provider 调用前会做多层处理：

1. 计算上下文预算和 warning/error/blocking 状态。
2. 对旧工具结果做 snip/micro compact。
3. 对会话做 auto compact 或 reactive compact。
4. 对工具结果做预算化持久化。
5. 若仍超过 blocking limit，直接本地阻断，不继续打 provider。

对 CodeClaw 的启示：

1. `[context budget exceeded]` 方向是正确的，但要把它作为所有大任务和 Agent Team 的统一硬门。
2. 压缩不应该只生成“摘要”，还要有工具结果预算层，把大输出变成 artifact 引用。
3. 空工具结果必须被显式转成“工具完成但无输出”，避免 provider summary 为空时 UI 看起来像失败。

### 2.2 工具编排按风险分层

Claude Code 不是把所有 tool calls 一起跑：

1. read-only / concurrency-safe 工具可以批量并发。
2. 写操作、权限敏感操作、状态改变操作必须串行或审批。
3. 已经开始流式输出后，不再随意 fallback，避免重复输出。
4. 工具结果大时进入 artifact，不把完整 stdout 塞回主上下文。

对 CodeClaw 的启示：

1. `Team Scheduler` 应复用同一规则：read-only worker 可并发，write worker 必须 claim + 串行或隔离。
2. 本地 fallback 应展示结构化工具摘要，而不是 raw dump。
3. Provider fallback 必须知道是否已有 partial output；已有输出时更适合本地收口。

### 2.3 Team 不是“多开几个 Agent”，而是有共享协议

Claude Code 的 Team/Swarm 关键点：

1. `team config` 是共享事实源，记录 leader、members、权限模式、session、pane、worktree。
2. `mailbox` 是低耦合消息总线，队友之间不共享完整上下文，只传短消息和摘要。
3. `permission sync` 让 worker 不绕过 leader 审批。
4. teammate 可继承 leader 的模型、权限、settings、plugin 配置，但 plan mode 优先于 bypass。
5. background task 有 task id、状态、stop 能力和 UI 显示。

对 CodeClaw 的启示：

1. Agent Team 必须先做 `TeamRun + TeamTask + Blackboard + Mailbox`，不能只做并发 subagent。
2. Worker 不能互相塞 transcript，只能写结构化 evidence、handoff、risk。
3. 权限必须由父会话/leader 统一裁决，worker 只发 permission request。
4. Web UI 需要 TeamRun 状态面板，否则多代理会变成不可解释的后台黑盒。

### 2.4 Task 生命周期要独立于最终模型总结

Claude Code 的 Task 工具把任务创建、更新、查询、停止做成单独 native tools。最终模型总结失败时，任务状态仍然可以被 UI 和命令读取。

对 CodeClaw 的启示：

1. 长任务不能只依赖最后一条 assistant message 表达状态。
2. Agent Team P0 至少需要 `team status` 和 `team cancel`，并把 worker 状态落到本地 store。
3. “工具完成但 summary 为空”时，UI 应从 task/team store 生成 fallback，而不是再问模型。

## 3. 与 CodeClaw 现状的差距

| 领域 | CodeClaw 当前 | Claude Code 参考 | 建议 |
| --- | --- | --- | --- |
| Context hard gate | 已有 `[context budget exceeded]`；已补 micro-compact 大工具结果和 compact summary 失败断路 | blocking limit 前还有 tool result budget / micro compact / auto compact circuit breaker | 继续补 per-message tool result budget 和更细 artifact preview。 |
| Tool fallback | 已有结构化 fallback；已补 per-tool artifact 与 per-turn aggregate budget | 按 tool_use_id 稳定替换、空结果显式化、持久化大输出 | 继续补更细 artifact preview 和 Web 可视化。 |
| Subagent | 已有 `Task` 和 `SubagentRegistry` | AgentTool 支持 role、model、allowed tools、MCP、后台、worktree | P0 不做全量，先补 role contract、timeout、allowed tools、status。 |
| Agent Team | 当前是未来目标/设计文档 | team config、mailbox、permission sync、task lifecycle | M1/M2 必须加入 mailbox 和 permission request 协议雏形。 |
| UI | Web 已有 session/report/MCP 等 | team/task 状态有专门 UI 展示 | TeamRun 面板要先展示 plan、worker status、blocked reason。 |
| 权限 | permission mode / approval / audit 已有 | worker 权限请求统一转 leader | Worker 不直接弹审批，先写 team permission request。 |

## 3.1 已落地的借鉴项：Skill Contract

已将 Claude Code 的 Skill 分层收敛为 CodeClaw 基础版 contract：

1. 用户 skill manifest 支持 `whenToUse / context / model / agent / files` 元数据。
2. `whenToUse` 用于告诉模型何时启用该 skill，减少 persona / MCP / tool 混用。
3. `context` 当前支持 `inline | fork`，用于表达当前会话注入或建议隔离执行。
4. `model` 和 `agent` 当前只作为可解释元数据，不改变 provider routing。
5. `files` 当前是相对路径清单，不打包内容；未来插件化 skill 可升级为安全文件包。
6. `/skills`、system prompt、active skill banner 会展示这些边界。

验证：

1. `npm run typecheck`
2. `npm run test -- test/unit/skills/loader.test.ts test/unit/skills/registry.test.ts test/unit/agent/systemPrompt.test.ts test/unit/agent/skillBanner.test.ts`

## 3.2 已落地的借鉴项：Tool Pool Assembly

已将 Claude Code “先组装工具池，再调用 provider” 的边界落成 CodeClaw 基础版投影层：

1. `src/agent/tools/toolPool.ts` 统一生成当前 turn 的工具池视图。
2. ToolPool 识别 `builtin / mcp / extension` 来源，后续可用于 UI、审计和权限解释。
3. ToolPool 复用 `ToolRegistry.listForMode()` 的 plan-mode 白名单，不改变现有工具暴露行为。
4. QueryEngine 的 provider schema 构建已改为通过 `listVisibleToolPoolTools()`，避免继续在主循环里散落 runtime-mode 分支。
5. ToolPool 已标注 `risk / concurrency / approval`：read-only 工具可解释为低风险并行候选，写入、MCP、extension、Task 等默认走串行/独占与 PermissionManager。
6. QueryEngine 已接入 mixed-batch 分段调度：同一轮 tool calls 会按顺序切段，连续 `parallel` 低风险工具并发执行；写入、MCP、extension、Task、bash 或审批相关工具保持串行/独占。
7. 审批事件、Web ApprovalCard 和 pending 审计事件 details 已接入 ToolPool metadata，用户能看到/审计 `source / risk / concurrency / approval`。
8. Web 已新增 `Audit` 面板，可只读查询 `audit_events`、按 session/action/decision 过滤、校验链完整性，并展示 ToolPool metadata。
9. `context=fork` 的 skill 已接入 fork 路由提示：不注入当前 session system prompt，返回隔离 Task/Team 建议，并展示 ToolPool metadata。
10. Slash command registry 已接入来源 metadata 与冲突 diagnostics；user skill command 被 `skip` 时可在 `/context` 看到原因。
11. `/doctor` slash 路径已附加当前 runtime 的 slash registry diagnostics，作为 `/context` 之外的快速体检入口。
12. 当前不改变 provider routing。

验证：

1. `npm run test -- test/unit/agent/tools/toolPool.test.ts test/unit/agent/tools/registry.test.ts test/unit/agent/tools/planMode.test.ts`
2. `npm run test -- test/unit/agent/tools/toolPool.test.ts test/unit/agent/context-diagnostics.test.ts`
3. `npm run test -- test/unit/agent/native-tool-loop.test.ts -t "all-parallel|turn 1 tool_call"`

## 3.3 已落地的借鉴项：Context Source Diagnostics

已将 Claude Code “先看清上下文来源，再决定 compact / staging / fallback” 的思路落到 `/context` 基础诊断：

1. `/context` 输出 `Provider context sources`，展示 provider replay messages、system prompt、tool schemas 和 tool pool。
2. `/context` 输出 `Message breakdown`，展示 role/source 分布、tool result 数量和 hidden-from-ui 数量。
3. `/context` 输出 `Largest context items` 和 `Largest tool results`，按估算 token 排序展示最占上下文的消息/工具结果。
4. `/context` 输出 `Context suggestions`，把接近阈值、工具结果过大、工具结果过多等情况转成可执行建议。
5. `/context` 输出 `Memory / skill`，展示 L1 transcript、L2 recall、active skill 和 skill files。
6. `/context` 保留 compact 状态，便于判断下一步是 `/compact`、新 session，还是分阶段继续。
7. Web Chat 面板已接入同类诊断 API，直接展示 token 预算、最大上下文项、最大工具结果和压缩/分阶段建议，减少用户必须手动运行 `/context` 的成本。

验证：

1. `npm run test -- test/unit/agent/context-diagnostics.test.ts test/unit/agent/tools/toolPool.test.ts`

## 3.4 已落地的借鉴项：MCP Workflow Skills

已把 Claude Code 中“工具不是孤立列表，而是被 skill / workflow 约束使用”的设计落到 CodeClaw 基础版：

1. Skill manifest 支持 `mcpServers` 和 `mcpTools` 元数据。
2. 内置 `beelink_data` skill 表达 Beelink/Dremio 数据分析标准链路：语义搜索/探查、描述与元数据、SQL guidance、规则检查、只读查询、失败修复和 artifact 导出。
3. 内置 `radiology` skill 明确依赖 `dicom` MCP，并列出 DICOM 预处理工具。
4. system prompt、active skill banner、`/skills` 激活输出和 `/context` 诊断会展示 MCP 边界。
5. 当普通 prompt 明确提到 Beelink/Dremio、DICOM/放射影像或 Ghost OS/Computer Use 桌面自动化时，provider 上下文会收到隐藏的 workflow skill suggestion，提醒模型可建议用户 `/skills use beelink_data`、`/skills use radiology` 或 `/skills use computer_use`。
6. `/context` 会展示最近一次 workflow skill suggestion 的 skill 名称、提示命令和命中原因，便于用户审计这条隐藏提示。
7. 当前不自动启动 MCP server、不改变 provider routing、不把 MCP tools 变成 allowedTools 权限白名单；它是模型可解释工作流 contract。

验证：

1. `npm run test -- test/unit/skills/loader.test.ts test/unit/skills/registry.test.ts test/unit/agent/systemPrompt.test.ts test/unit/agent/skillBanner.test.ts test/unit/cli/skill-cli.test.ts test/unit/agent/context-diagnostics.test.ts test/unit/agent/skillSuggestion.test.ts`

## 4. 对 Agent Team 的落地建议

### M1: Plan-only Team

先做本地 plan，不启动 worker：

1. `src/agent/team/types.ts`
2. `src/agent/team/coordinator.ts`
3. `/team plan <goal>`
4. 输出 `TeamPlan`，包含 role、scope、deps、acceptance、budget。

验收重点：

1. 大任务自动拆阶段。
2. 每个 task 有明确 scope，不允许“读取全仓所有文件”。
3. 计划输出可被 Web 和 CLI 渲染。

### M2: Read-only Team Run

只允许 explorer / reviewer：

1. 引入 `TeamRunStore`，先内存或 SQLite 均可。
2. 引入 `Blackboard`，只存结构化事实。
3. 引入简化 `Mailbox`，支持 worker -> coordinator handoff。
4. Worker 输出必须转成 `WorkerResult`，不能直接把长文本塞回主上下文。

验收重点：

1. 任一 worker 超预算只阻断该 worker。
2. coordinator 最终 summary 失败时，本地 fallback 可从 blackboard 生成。
3. read-only worker 不改文件。

### M3: Claimed-file Write Team

在 M2 稳定后再开放写：

1. `FileClaim` 独占写。
2. Worker permission request 统一交给 coordinator/parent approval。
3. implementer 只能改 claimed files。
4. reviewer/test_engineer 必须给 evidence。

验收重点：

1. 两个 worker 写同一文件时必须冲突阻断。
2. approval 被拒绝时 TeamRun 转 `waiting_user_decision` 或 `blocked`。
3. Merge Gate 不允许无测试证据的完成声明。

## 5. 不建议照搬的部分

1. 不建议 P0 引入 tmux/split-pane/remote/worktree 全套机制；这会让 CodeClaw 过早承担复杂运行环境。
2. 不建议让 worker 自动再 spawn worker；应先禁止递归，避免指数级失控。
3. 不建议把队友 transcript 全部注入 leader；应只走 Blackboard/Mailbox 摘要。
4. 不建议把 Team 作为默认路径；只有用户显式 `/team` 或 `task_needs_staging` 后确认才启用。
5. 不建议跳过现有 `TurnGuard`、`CompletionGate`、audit、permission manager；Team 必须复用这些治理层。

## 6. CodeClaw 应优先吸收的机制

优先级从高到低：

1. **Tool result budget**：大结果 artifact 化，消息内只保留 preview 和路径。
2. **Task/team 状态独立存储**：最终模型失败不影响状态读取和本地 fallback。
3. **Mailbox / handoff**：worker 间只传短消息、证据和风险。
4. **Permission sync**：worker 权限请求统一由 coordinator/parent session 处理。
5. **Read-only 并发 + write 串行**：提升速度但避免写冲突。
6. **Auto compact circuit breaker**：压缩连续失败后停止重试，避免浪费 provider 调用。
7. **Diminishing returns guard**：连续低进展时停止，提示拆阶段或用户决策。

已补充落地：

1. `src/agent/microCompact.ts` 会在 auto-compact 前把超大 `tool` 消息替换为 bounded preview，保留 artifact/query/error 信号。
2. `autoCompactIfNeeded` 不再把 `[LLM 摘要失败]` 写入 replay summary；摘要失败会返回 `summaryFailed`。
3. QueryEngine 在 context hard gate 路径上遇到 compact summary 失败时直接返回 `[context budget exceeded]`，不继续调用 provider。
4. 连续 compact summary 失败达到阈值后，auto-compact circuit open，后续 oversized turn 不再调用摘要模型。
5. `applyToolResultAggregateBudget` 已补 per-turn 工具结果聚合预算，避免多个小 tool result 累积撑大下一轮 provider replay。

## 7. 推荐更新到 CodeClaw 设计中的约束

1. TeamRun 必须有全局 budget：worker 数、并发数、工具次数、输出字节、总时长。
2. WorkerResult 必须是结构化对象：status、summary、changedFiles、evidence、risks、nextSteps。
3. Blackboard entry 必须去重且有 evidenceRefs。
4. Mailbox message 必须短：from、to、summary、text、createdAt、read。
5. Permission request 必须落 audit，且不能高于父会话 permission mode。
6. context budget hard gate 触发时，TeamRun 暂停，不再启动新 worker。
7. coordinator 汇总失败时，必须本地 fallback，不再二次打模型。
