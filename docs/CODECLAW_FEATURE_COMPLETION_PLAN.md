# CodeClaw Feature Completion Plan

本计划用于补全 `DESIGN.md` 当前实现状态矩阵中拆出的基础版能力与未来目标。原则是：先把已经有主路径的模块补成可验证、可运维、可解释的产品闭环，再推进企业版增强。

## 1. 开发分层

| 层级 | 目标 | 进入标准 | 退出标准 |
| --- | --- | --- | --- |
| P0 | 把基础版能力补成稳定闭环 | 当前已有代码主路径 | 用户可按文档完成配置、运行、诊断和回归验证 |
| P1 | 增强可用性与规模化 | P0 通过真实 smoke | 支持更多语言、渠道、UI 状态和错误恢复 |
| P2 | 协同与伴随能力 | P1 稳定，权限/审批/通知边界清晰 | 自动 write-worker 编排受控可用；桌面通知与 Mobile Companion 可用 |

## 2. P0 任务

### 2.1 Setup / Doctor 闭环

目标：让新用户从空环境到可用会话有明确路径，不依赖口口相传。

当前状态（2026-05-08）：基础收口已推进。`codeclaw doctor` 已输出 `setup-status`，按 `ready / optional / blocked` 展示 provider、permission mode、Web token、Beelink/DICOM MCP、WeChat、approvals、audit-chain；Web 已提供 `GET /v1/web/doctor` 供设置区消费。完整 5 步 TUI setup 向导仍属于后续 P1。

任务：

1. 增强 `codeclaw setup` 输出：显示 provider、permission mode、MCP、LSP、Web token、DICOM/Beelink 可选项的配置状态。
2. 增强 `codeclaw doctor`：把检查结果分为 `ready`、`optional`、`blocked`，并给出下一步命令。
3. 在 Web `/status` 或设置区展示同一套 setup/doctor 状态。
4. 增加 setup/doctor snapshot 测试，覆盖无配置、provider 已配置、LSP 未安装、MCP 部分可用。

验收：

1. 新机器执行 `npm install && npm run build && node dist/cli.js doctor` 后能看到明确配置缺口。
2. `doctor` 不打印 secret。
3. setup/doctor 测试稳定通过。

### 2.2 LSP 基础版收敛

目标：把 `fallback-regex-index` 与 `multilspy` 的差异显式化，避免用户误以为所有语言都有同等语义能力。

当前状态（2026-05-08）：基础收口已完成。`/symbol`、`/definition`、`/references` 的工具输出统一展示 `backend / degraded / reason`；`codeclaw doctor` 的 `lsp` 区块和 `setup-status` 已展示 active backend、fallback、real candidate 与降级原因；`docs/LSP_SETUP.md` 已说明真实 LSP 与 regex fallback 的能力边界。

任务：

1. `/doctor` 输出当前 LSP backend、启用原因、fallback 原因和可执行修复命令。
2. LSP 工具结果中增加 `backend`、`degraded`、`reason` 字段，用于 Web/CLI provenance。
3. 给 `/symbol`、`/definition`、`/references` 增加 fallback 行为测试。
4. 文档补充“哪些结果来自 regex fallback，哪些来自 real LSP”。

验收：

1. 未安装 `.venv-lsp` 时 LSP 工具不报错，并明确 `fallback-regex-index`。
2. 安装 real backend 后 doctor 能显示 `multilspy ready`。
3. LSP 单测覆盖 fallback 和 real backend mock。

### 2.3 Orchestration 基础版收敛

目标：Planner / Executor / Reflector 能稳定用于受控任务，而不是只作为演示路径。

当前状态（2026-05-09）：`ReflectorResult` 已增加 `decisionReason`，`/orchestrate` 会展示结构化原因；`test/orchestration-playback.test.ts` 覆盖 complete、approval-required、replan、escalated。超大目标会先返回 `Orchestration staging required` 与 staged DAG，标记 `task_needs_staging` 并阻止 provider call，避免把全仓审查塞进一个 Task。

任务：

1. Executor 继续保持依赖检查，补充 DAG 顺序和 unmet deps 单测。
2. Reflector 输出结构化 decision reason，区分 `approval-required`、`replan`、`escalated`。
3. `/orchestrate` 输出简化为：计划、检查、动作、gap、下一步，不暴露大段内部日志。
4. 给 approval follow-up 增加真实 replay 测试，确保批准后不重复请求同一审批。

验收：

1. `test/orchestration-playback.test.ts` 覆盖 complete、approval、replan、escalated、deps blocked。
2. 用户看到的是可执行下一步，不是原始 observation dump。
3. 风险写操作必须进入 approval，不允许直接执行。

### 2.4 Skills / Persona 基础版收敛

目标：把 persona、skill、MCP 能力边界写清楚，并让模型不再混用错误工具。

当前状态（2026-05-08）：Skill contract 已吸收 Claude Code 可借鉴分层，基础版支持
`whenToUse / context / model / agent / files / mcpServers / mcpTools` 元数据。用户 skill manifest 会校验并保留这些字段；
系统提示、`/skills` 列表/激活反馈和 active skill banner 会展示使用场景、上下文模式、建议模型/agent 与参考文件。
`model`/`agent` 目前是可解释元数据，不改变 provider routing；跨 provider role routing 仍在 Agent Team TODO。

任务：

1. 已完成：为 radiology persona 增加专用 skill，明确中文输出、`小医` 名称、DICOM MCP 优先路径和医疗免责声明。
2. 已完成：Skill registry 输出 active skill、allowed tools、whenToUse、context、model、agent、files 等能力边界。
3. Web 会话隐藏 thinking 后，仍保留 skill banner 和可解释的能力状态。
4. 已完成：增加 skill prompt / manifest metadata 注入测试，防止新 session 泄漏旧 session 的 persona。
5. 已完成：新增 `beelink_data` MCP workflow skill，表达 Beelink/Dremio 数据分析标准链路。
6. 已完成：Skill manifest 支持 `mcpServers` / `mcpTools`，用于 MCP workflow 提示和诊断。

验收：

1. 新会话无 radiology skill 时不会自称 `小医`。
2. 启用 radiology skill 后强制中文，并优先使用 DICOM MCP 预处理 `.dcm`。
3. Web 不展示模型 thinking 文本。

补充：ToolPool 统一入口（2026-05-08）

1. 已完成：新增 `src/agent/tools/toolPool.ts`，集中生成 provider 可见工具池视图。
2. 已完成：ToolPool 标注 `builtin / mcp / extension` 来源，并复用 plan-mode 白名单，不改变现有暴露行为。
3. 已完成：QueryEngine 的 stream tool schema 构建改为通过 `listVisibleToolPoolTools()`。
4. 已完成：ToolPool 标注 `risk / concurrency / approval` 解释性元数据，并在 `/context` 中展示风险/并发分布。
5. 已完成：QueryEngine 对低风险 `parallel` 工具批次执行并发调度；mixed-batch 会按顺序切段，连续 read-only 子批次并发，写入、MCP、extension、Task、bash 或审批相关工具保持串行/独占。
6. 已完成：审批事件、Web ApprovalCard 和 pending 审计事件 details 接入 ToolPool metadata，展示/记录 `source / risk / concurrency / approval`。
7. 已完成：Web `Audit` 面板可查询最近 `audit_events`、按 session/action/decision 过滤、校验审计链，并展示 details 中的 ToolPool metadata。
8. 已完成：`context=fork` 的 skill 不再激活进主会话 system prompt；`/skills use <name>` 返回隔离 Task/Team 路由建议，并展示 allowed tools / MCP tools 的 ToolPool metadata。
9. 已完成：Slash command registry 标注 `builtin / skill / plugin` 来源与 owner；`skip/overwrite/throw` 冲突会留下 diagnostics，`/context` 展示命令来源分布与最近冲突。
10. 已完成：`/doctor` slash 路径附加当前 runtime 的 slash registry diagnostics，便于直接发现 user skill command 被 skip 的原因。

补充：`/context` 来源诊断（2026-05-08）

1. 已完成：`/context` 展示 provider replay messages、system prompt、tool schemas 和 tool pool。
2. 已完成：`/context` 展示消息 role/source 分布、tool result 数量、hidden-from-ui 数量。
3. 已完成：`/context` 展示 L1/L2 memory、active skill、skill files 和 compact state。
4. 已完成：`/context` 按估算 token 排序展示最大消息和最大工具结果。
5. 已完成：`/context` 展示 slash command 来源分布、alias 数量与 user skill command 冲突摘要。
5. 已完成：`/context` 输出可执行压缩建议，例如 `/compact`、新 session、查看 artifact 或分阶段继续。
6. 已完成：Web Chat 面板接入 `GET /v1/web/sessions/<id>/context`，以状态卡展示 token 预算、最大上下文项、最大工具结果和压缩/分阶段建议。

补充：MCP Workflow Skills（2026-05-08）

1. 已完成：`beelink_data` 内置 skill 绑定 `beelink` MCP，并提示 `RunSemanticSearch / ExploreForQuestion / GetDescriptionOfTableOrSchema / BuildSqlGuidance / CheckSqlAgainstRules / RunSqlQuery / RepairSqlAttempt / ExportSqlArtifact`。
2. 已完成：`radiology` 内置 skill 绑定 `dicom` MCP，并提示 `InspectDicomFile / RenderDicomPreview / PrepareDicomForVision`。
3. 已完成：普通 prompt 明确命中 Beelink/Dremio 或 DICOM/放射影像信号时，provider 上下文注入隐藏 workflow skill suggestion，提醒模型可建议用户 `/skills use ...`。
4. 已完成：`/context` 展示最近一次 workflow skill suggestion 的 skill 名称、`/skills use ...` 提示和命中原因，便于排查模型为什么建议某个 workflow。
5. 当前边界：这些字段是 workflow/prompt contract，不自动启动 MCP server、不提升权限、不改变 provider routing。

### 2.5 WeChat 基础版收敛

目标：把 WeChat 从“能连上”补到“能诊断、能恢复、可观测”。

当前状态（2026-05-09）：worker 已有指数退避、失败日志抑制和 `getHealth()` 快照；login state 已补 `statusCheckedAt`、`qrcodeExpiresAt`，`/wechat status`、`/wechat worker` 和 `/wechat refresh` 可展示二维码刷新/过期信息、worker 状态、连续失败、最近错误、下次重试和日志路径。

任务：

1. `/wechat status` 增加 token 过期、QR 过期、worker 状态、最近错误、日志路径。
2. `/wechat refresh` 明确返回新的二维码链接和过期时间。
3. Worker 增加指数退避、最大失败摘要和健康状态。
4. 增加 iLink mock 测试，覆盖登录、刷新、轮询失败、send 失败。

验收：

1. 二维码过期时用户能通过 `/wechat refresh` 自助恢复。
2. worker 不因连续失败刷屏。
3. `/doctor` 能提示 WeChat 当前是可选集成，不阻塞主流程。

### 2.6 SDK / HTTP API 基础版收敛

目标：把基础 API 做成可复用入口，而不是仅供 Web 内部使用。

当前状态（2026-05-08）：`docs/HTTP_API.md` 已补 SSE 语义事件映射，`CodeClawSdkClient` 已增加 `CodeClawSdkError` 和 `auth / not-found / server / unknown` 错误分类；`test/sdk-http.test.ts` 覆盖 auth、JSON、SSE 和错误分类。

任务：

1. 固化 `/api/sessions`、`/api/messages`、`/api/reports`、`/api/dashboards` 的稳定响应契约。
2. 增加 SSE 事件类型文档：message、tool_call、tool_result、context_budget_exceeded、fallback_summary、error。
3. SDK client 增加 typed helpers 和错误分类。
4. 增加 HTTP contract 测试，覆盖 auth、session resume、message submit、tool fallback。

验收：

1. `docs/HTTP_API.md` 与实际 handler 保持一致。
2. SDK 示例能跑通一次 session submit。
3. Web 和 SDK 共用同一 session/permission 语义。

### 2.7 权限 / 审批 / Audit 基础版收敛

目标：个人版权限安全边界清晰，企业版能力不提前承诺。

当前状态（2026-05-08）：`doctor` 已展示 pending approvals、permission mode 风险提示和 audit-chain 状态；audit chain 断裂会被标为 `blocked` 并给出调查建议。approval 来源细分和 audit event 产品化分类仍待后续补充。

任务：

1. `/doctor` 增加 audit chain 状态、approval pending 数、权限模式风险提示。
2. Approval 列表展示来源：tool、orchestration、MCP。
3. Audit log 增加关键事件归类：provider、tool、approval、mcp、report、dashboard。
4. 增加 audit tamper 检测和 approval migration 单测。

验收：

1. audit chain 断裂时 doctor 明确阻断高风险操作建议。
2. approval pending 可以按 session 查看和清理。
3. 权限提示不泄漏 secret。

## 3. P1 任务

### 3.1 完整 5 步 TUI Setup 向导

任务：

1. 欢迎页：显示 workspace、版本、配置目录。
2. Provider 选择：LM Studio、Ollama、OpenAI、Anthropic、自定义。
3. 权限模式选择：plan、auto、dontAsk，并解释风险。
4. 可选能力检查：MCP、LSP、Beelink、DICOM、WeChat。
5. 写入配置并运行 doctor smoke。

验收：

1. 首次启动无配置时自动进入向导。
2. 用户退出向导不会写半配置。
3. 向导生成的配置可被 CLI 和 Web 复用。

### 3.2 增强 LSP 依赖图

当前状态（2026-05-09 P1A）：Web Graph status 已返回并展示 `lsp.backend / degraded / reason / realCandidate`，让用户能在代码图页面看到当前语义来源是否降级。Web 还新增 `GET /v1/web/source-status`，统一返回 RAG / Graph / LSP 的 `backend / degraded / reason`。`src/lsp/service.ts` 已有按 mtime 刷新的增量 symbol index；跨文件引用图仍依赖 CodebaseGraph 的全量 build，尚未做 LSP reference graph 持久化与融合排序。

任务：

1. 增量 symbol index。
2. 跨文件引用图持久化。
3. Graph/RAG/LSP 结果融合排序。
4. Web source status 展示 LSP backend 和 degraded 状态。

验收：

1. 大仓库 symbol 查询不阻塞主会话。
2. 修改文件后增量刷新，不必全量重建。

### 3.3 Orchestration 可视化与分阶段执行

任务：

1. Web 展示 plan DAG、当前 goal、blocked deps。
2. 大任务自动 staging，不把整个仓库审查塞进一个 Task。
3. Reflector 提供可点击的下一步建议。

验收：

1. 超预算任务被拆阶段，不再空响应。
2. 用户可暂停、继续、归档 orchestration。

### 3.4 WeChat 生产可用性

任务：

1. 自动重连与 refresh token 续期。
2. 消息可靠投递队列。
3. 关键错误告警。
4. 二维码登录状态 Web 可视化。

验收：

1. 网络抖动后 worker 能恢复。
2. 失败消息不会丢失或重复刷屏。

## 4. P2 协同与伴随能力

P2 范围只做两条主线：

1. Agent Team 自动 write-worker 编排。
2. Desktop Notification / Mobile Companion。

以下能力不属于当前 P2：企业 Gateway、多租户、企业 ACL、订阅分发、集中审计产品化、Skill Marketplace / Version Governance。这些保留为更远期企业目标，不能作为当前 P2 承诺。

### 4.1 Agent Team 自动 write-worker 编排

详细技术设计见 `docs/AGENT_TEAM_TECH_DESIGN.md`。
收口验收见 `docs/AGENT_TEAM_ACCEPTANCE.md`。
Claude Code 源码参考分析见 `docs/CLAUDE_CODE_REFERENCE_ANALYSIS.md`。

当前状态（2026-05-09）：基础版已实现。`/team plan/run/status/cancel/retry/write/propose/apply/auto-propose`、TeamRun 持久化、Blackboard/Mailbox、claimed-file gate、Merge Gate、Web Team 面板、write preview/confirm、write proposal 展示/应用/拒绝、同 TeamRun proposal apply 串行队列、provider write-worker guarded prompt 生成，以及同 provider 的 role-level model override 已落地。P2 只推进“自动 write-worker 编排”，不扩大到企业级团队自治。

任务：

1. 已定义自动 write-worker 触发边界：必须已有 active claim；proposal 创建和应用都会重新校验 claimed-file gate。
2. 已落地结构化 `TeamWriteProposal` snapshot：目标文件、guarded prompt、风险说明、rollback hint、preview、状态时间线。
3. 已落地 dry-run preview：proposal 创建阶段不写文件，真实写入必须走 `executeClaimedFileWrite()`。
4. 已落地 apply/reject 状态推进：CLI `/team apply` 与 Web apply 都要求 preview_ready，Web apply 额外要求 `confirmed=true`。
5. 接入 reviewer/test evidence：没有 reviewer 或 test evidence 时，TeamRun 不能进入真正 completed。
6. Worker provider summary 失败时，Coordinator 可以基于 proposal、Blackboard 和工具证据生成本地 fallback。
7. 已在 Web Team 面板展示 proposal、preview、apply/reject 状态。
8. 已在 TeamRun replay snapshot 中保留 proposal、preview、apply/reject 历史。
9. 已新增 `team_write_proposals` SQLite 审计索引表，支持按 session/run/status/path 查询 proposal 历史。
10. 已接入 provider write-worker：`/team propose <claimId>` 不带 prompt 时由 provider 输出 JSON guarded prompt，再进入同一 proposal preview/apply 链。
11. 已接入 Coordinator 自动调度入口：`/team auto-propose [runId]` 会扫描 active claim，为未创建 proposal 的 claim 逐个走 guarded provider proposal；真实写入仍不自动落盘。

剩余增强：

1. Web Team 面板可继续增加一键触发 `/team auto-propose` 的按钮；当前 CLI/engine 主路径已可用。

验收：

1. 自动 write-worker 不直接落盘；所有真实写入必须经过 active claim、preview、confirmation 和 `executeClaimedFileWrite()`。
2. 同一文件写入需要 claimed-file 锁，冲突时等待、失败或重新分配。
3. Merge Gate 要求 reviewer/test evidence 满足后 Team 才能进入真正完成态。
4. 用户可在 Web/CLI 看见 proposal 和 preview，再决定 confirm/reject。
5. 任一 worker 超预算、空转或 provider summary 为空时，只停止局部 worker，不拖垮主会话。

### 4.2 Desktop Notification

当前实现（P2-2 基础版）：

1. 已新增 `src/notifications/*`：统一 `NotificationEvent` schema、macOS/terminal/none adapter、安全摘要清洗、JSONL history。
2. 已扩展 `.codeclaw/settings.json` 的 `notifications` 配置：`enabled`、`adapter`、`failuresOnly`、`events`、`quietHours`。
3. 已接入 QueryEngine 关键事件生产者：`approval_required`、`context_budget_exceeded`、`provider_cooldown`、`task_completed`、`report_ready`；cron 运行结果接入 `task_completed` / `cron_failed`。
4. 未配置 `notifications` 时完全 no-op；配置后只有 `notifications.enabled=true` 才投递 adapter。禁用、按事件关闭或 quiet hours 时仍写入 history，便于后续 Web/Mobile 展示。
5. Web 已新增 `GET /v1/web/notifications` 和 `Notifications` 面板，支持按 `type` / 当前 session 过滤，展示 delivered/suppressed、reason、resourceId 和安全 metadata。
6. 通知内容只保留 title/message/resourceId/metadata 安全摘要，会截断长文本并脱敏 `token/api_key/secret/password/Bearer`。

任务：

1. 定义 notification event schema：`task_completed`、`approval_required`、`context_budget_exceeded`、`provider_cooldown`、`report_ready`、`cron_failed`。
2. 增加本地通知适配层，先支持 macOS notification / terminal fallback，不直接耦合 Web 或 Cron。
3. 给 QueryEngine、approval queue、report/dashboard、cron runner 接入 notification event producer。
4. 增加用户级开关：全局启用、按事件类型启用、quiet hours、仅失败通知。
5. 已增加 notification history，避免用户错过短暂 toast。
6. 已增加 Web notification history API / 面板，作为 Mobile Companion 前的可视化验证入口。
7. 已补 `provider_cooldown` producer：provider circuit 进入 cooldown 时写入安全通知历史；同一个 cooldown 周期只通知一次。

验收：

1. 任务完成、审批等待、报告生成完成能触发通知。
2. quiet hours 下不弹系统通知，但 history 仍记录。
3. 通知不包含 secret、SQL 全文或敏感 artifact 内容，只展示安全摘要和资源 ID。
4. 关闭通知后不影响 CLI/Web 主流程。

### 4.3 Mobile Companion

当前实现（P2-3 companion foundation）：

1. 已新增 `src/mobile/*`：本地 Mobile Companion store，保存 pairing tokens 和 devices；secret 只保存 SHA-256 hash。
2. Web 管理 API 已接入：
   - `POST /v1/web/mobile/pairing-tokens` 创建短期 pairing token。
   - `GET /v1/web/mobile/devices` 查看 active devices。
   - `DELETE /v1/web/mobile/devices/:deviceId` 撤销设备。
3. 移动端配对 API 已接入：`POST /v1/mobile/pair` 使用 pairing token 换取 device token。
4. pairing token 默认短期有效、一次性使用；device token 只在配对响应中返回一次，服务端只保存 hash。
5. 移动端只读 API 已接入：
   - `GET /v1/mobile/status` 查看当前设备所属用户的最近 session 状态。
   - `GET /v1/mobile/sessions/:id/summary` 查看最近消息摘要。
   - `GET /v1/mobile/reports` 查看 report 摘要。
6. 移动端审批 API 已接入：
   - `GET /v1/mobile/approvals` 只列出当前设备所属用户 session 的 pending approval 摘要。
   - `POST /v1/mobile/approvals/:approvalId/decision` 只允许 `approve` / `deny` 已存在 approval，并把实际执行转回所属 Web/CLI session。
7. 移动端审批会写 audit event，actor 形如 `mobile:<deviceId>`；移动端仍不另起 agent loop，不开放直接工具执行、完整 provenance 或 SQL 明细。

任务：

1. 定义 Mobile API scope：查看 session 状态、查看最新消息摘要、处理 approval、查看 report/dashboard 摘要、接收推送。（状态 / session 摘要 / report 摘要 / approval 转发已完成）
2. 复用 SDK / HTTP API，不为移动端另起一套 agent loop。
3. 已增加 mobile auth skeleton：短期 pairing token、设备列表、撤销设备、device-token 只读鉴权。
4. 已增加 approval 操作保护：移动端只能批准/拒绝已有 pending approval，不能绕过 permission manager 直接执行工具。
5. 增加 push notification 适配接口，先保留 provider-agnostic contract。

验收：

1. 移动端可以查看任务状态和 report 摘要，但默认不展示完整 provenance / SQL，除非权限允许。
2. 移动端审批必须写入 audit log，并带 device id。
3. pairing token 过期后不能继续登录。
4. 移动端断网不会影响 CLI/Web 会话。

## 5. 推荐执行顺序

1. P0-Setup/Doctor：先让环境状态可见。
2. P0-LSP：让代码语义能力可解释。
3. P0-Orchestration：让长任务不空转、不假完成。
4. P0-Skills/Persona：避免 persona 泄漏和工具混用。
5. P0-SDK/HTTP：稳定 Web 和外部入口契约。
6. P0-WeChat：补诊断和恢复，不追求生产级。
7. P0-Permissions/Audit：补安全观测。
8. P2-Agent Team 自动 write-worker 编排：先完成 proposal/preview/confirm/apply/replay 闭环。
9. P2-Desktop Notification：先做本地通知和 history。
10. P2-Mobile Companion：复用 HTTP/SDK 和 approval，不另起 agent loop。

## 6. 全局验收命令

```bash
git diff --check
npm run typecheck
npm run build
npm run test -- test/orchestration-playback.test.ts
npm run test -- test/unit/knowledge/search.test.ts test/unit/agent/tools/knowledgeTool.test.ts
```

真实 smoke：

```bash
node dist/cli.js doctor
node dist/cli.js web
npm run golden:ci
```
