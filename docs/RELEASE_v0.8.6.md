# CodeClaw v0.8.6

**Stability, Data Analysis, Reports & Dashboards** — 本版本把 CodeClaw 从“能对话和调工具”推进到更稳定的数据分析工作台：加强模型空转/刷屏保护，接入 Beelink MCP 的元数据与 SQL 链路，新增 Report/Dashboard 产品对象，并把品牌统一回 `CodeClaw/codeclaw`。

## Highlights

### 1. 稳定性护栏

- **单轮输出保护**：`CODECLAW_MAX_TURN_BYTES` 默认 `65536`，避免模型超长输出刷爆终端。
- **终端渲染保护**：`CODECLAW_TERMINAL_RENDER_BYTES` 默认 `24576`，超长内容落 artifact，只在终端显示摘要。
- **provider malformed stream 防爆**：`CODECLAW_MAX_UNDELIMITED_STREAM_BUFFER_BYTES` 默认 `2097152`，防止兼容 API 返回无分隔异常流时无限堆内存。
- **工具循环保护**：`CODECLAW_MAX_TOOL_TURNS`、`CODECLAW_REPEATED_TOOL_CALL_LIMIT`、`CODECLAW_LOW_PROGRESS_TOOL_TURNS` 控制空转、重复工具调用和低进展工具链。
- **provider circuit breaker**：区分 stuck failure 与 transient failure，支持并发上限、短 cooldown 和诊断输出。
- **终端 IO 崩溃保护**：stdout/stderr EIO/EPIPE 时 unmount Ink 并退出，避免 crash log 和 render loop 互相放大。

### 2. Beelink MCP 数据分析链

- Beelink 作为标准 MCP server 接入，不再改造 QueryEngine 主流程为第二套 data mode。
- 新增/增强数据工具：
  - `SyncMetadataIndex`
  - `SearchMetadataIndex`
  - `ExploreForQuestion`
  - `BuildSqlGuidance`
  - `CheckSqlAgainstRules`
  - `RepairSqlAttempt`
  - `RunSqlQuery`
  - `PrepareSqlReference`
- 元数据进入本地 `metadata.db`，语义层草稿进入 `semantic-layer.json` / `glossary.md`。
- LLM 生成 SQL 前应先查本地语义层和元数据；不足时再做上游实时探查。
- SQL 执行失败时按错误类型补探查和修复；SQL 成功但用户判定结果错误时，应反向补探查，而不是盲目坚持原结论。

### 3. Reports & Dashboards

新增 CodeClaw 产品层对象：

- **ReportArtifact**：一次性分析报告，记录问题、数据集、图表、insights、caveats、SQL、query id、provenance 和 exports。
- **DashboardSpec**：长期看板草稿，支持 datasets、pages、widgets、filters、parameters、permissions、schedules、subscriptions 等企业版扩展字段。
- **Report -> Dashboard upgrade**：可把 Report 中的数据、图表和文本段落升级为 Dashboard 草稿。
- **HTML renderers**：Report/Dashboard 都可渲染为本地 HTML artifact。
- **Web API**：
  - Reports: list/read/html/export/upgrade
  - Dashboards: list/create/read/html/validate/render
- **Web UI panels**：`/next` 新增 Reports 和 Dashboards 面板，支持列表、搜索、状态过滤、详情、预览和操作按钮。

当前边界：

- Report 创建以 LLM 工具链为主；前端直接创建 Report 草稿仍是 TODO。
- Dashboard 当前先做静态 HTML 和草稿 spec；企业级权限、订阅、定时刷新、交互编辑将在后续阶段增强。

### 4. Golden Tests 和真实数据测试

- 新增数据分析黄金测试集，覆盖元数据、语义层、SQL 引用、规则检查、修复、图表、报表和安全边界。
- 新增 Dremio 测试 fixture `chatbi_food_sales`，用于真实 Beelink/Dremio 端到端验证。
- 增加 Report/Dashboard golden tests，验证 Report 创建、HTML 渲染、Dashboard 升级和产品链路。

### 5. 品牌统一

- npm package name 和 binary 统一为 `codeclaw`。
- 用户可见文案统一为 `CodeClaw/codeclaw`。
- `CODECLAW_*` 环境变量成为主配置名。
- `CHATBI_*` 环境变量保留 legacy fallback，避免老环境瞬间失效。
- 如果用户通过旧 `chatbi` symlink 启动，会提示迁移到 `codeclaw`，但不重新把旧品牌加回 npm binary。
- 真实 Dremio 测试表名 / fixture（如 `chatbi_food_sales`）不自动重命名。

## Migration Notes

### Command rename

新命令：

```bash
codeclaw --help
codeclaw doctor
codeclaw web --port=7180 --host=127.0.0.1
```

如果本机之前通过 `npm link` 安装过旧命令，重新 link：

```bash
npm link
codeclaw --version
```

### Env rename

新配置优先使用 `CODECLAW_*`：

```bash
CODECLAW_MAX_TURN_BYTES=65536
CODECLAW_PROVIDER_MAX_CONCURRENCY=2
CODECLAW_WEB_TOKEN=...
```

旧 `CHATBI_*` 仍作为 fallback 读取，但新文档和新配置应使用 `CODECLAW_*`。

### Storage

现有本地目录继续使用：

```text
~/.codeclaw/
~/.codeclaw/artifacts/reports/
~/.codeclaw/artifacts/dashboards/
```

无需迁移已有 `~/.codeclaw` 数据。

## Validation Snapshot

本轮开发期间已覆盖：

- `npm run typecheck`
- `npm run build`
- targeted unit tests for turn guards, provider circuit breaker, QueryEngine, doctor, system prompt, WeChat, Web Reports/Dashboards, report/dashboard services and tools
- Web Reports/Dashboards component tests
- mock and real data golden tests for selected Beelink/Dremio scenarios
- real Web/API smoke for report list/read/html/export/upgrade and dashboard list/read/html/validate/render
- `node dist/cli.js web --help` prints help and exits without starting a server
- smoke artifacts cleanup verified

## Known Boundaries

- Browser-click smoke still needs to be rerun when browser automation is available in the active tool namespace.
- Frontend direct Report draft creation remains TODO by design.
- Enterprise Dashboard features such as full editor, subscriptions, scheduled refresh, row-level governance UI, and Dashboard Ask are planned but not included in this patch.
- The `chatbi_food_sales` name is intentionally retained as a test table/fixture identifier, not product branding.
