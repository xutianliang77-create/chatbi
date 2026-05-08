# Golden Real Runner 技术设计

## 1. 目标

Golden runner 分两层：

1. Deterministic mock gate：稳定、快速、适合 CI。
2. Real smoke gate：走真实 provider 或 QueryEngine，用来发现真实提示词、模型、上下文和工具链问题。

本设计覆盖：

- `golden:dialect`
- `golden:meta-router`
- `golden:report`
- `golden:ci`

## 2. 非目标

- Real runner 不替代完整端到端人工验收。
- Dialect `--real` 默认不执行 Dremio SQL。
- Meta Router `--real` 默认不自动注入源 QA 答案。
- 不在 golden runner 中写业务数据或修改 workspace。

## 3. Runner 类型

### 3.1 Dialect Traps

命令：

```bash
npm run golden:dialect -- --mock
npm run golden:dialect -- --real --id dq01
```

输入：

```text
test/golden/dialect/DIALECT-TRAPS.json
```

评分：

- `expected_must_contain` 必须全部命中。
- `expected_must_not_contain` 不得命中。
- gate：整体通过率 >= 90%。

`--real` 行为：

- 使用当前 CodeClaw provider。
- 把 case 转成 SQL-only prompt。
- 只评分生成文本。
- 不执行 SQL。

后续可选：

- 增加 `--execute-dremio` 或单独 `golden:dialect-dremio`。
- 执行前必须完成 metadata sync 和 SQL rule check。

### 3.2 Meta Router Facts

命令：

```bash
npm run golden:meta-router -- --mock
npm run golden:meta-router -- --mock --variants
npm run golden:meta-router -- --real --id META-001
```

输入：

```text
test/golden/meta-router/META-ROUTER-FACTS.json
```

评分：

- 从标准答案中抽取关键事实。
- coverage >= 70%。
- 禁止触发明确 hallucination phrase。
- gate：100%。

`--variants`：

- 每个 fact 使用 sample question。
- 每个 fact 额外生成最多 3 个 trigger keyword prompt。

`--real` 行为：

- 使用当前 CodeClaw provider。
- 把 case 转成产品事实问答 prompt。
- 评分真实模型输出。

重要边界：

- 现在的 `--real` 是 provider-output smoke。
- 它没有把 `META-ROUTER-FACTS.json` 作为事实源注入 provider。
- 如果换成通用模型后出现正常回答但评分失败，应该补“产品事实源/系统事实路由”，不要削弱 scorer。

## 4. Provider 路径

`--real` 复用 `test/golden/runner/provider.ts`：

1. 默认：直接调用 `streamProviderResponse`。
2. `GOLDEN_M1_SYSTEM_PROMPT=true`：注入当前 system prompt。
3. `GOLDEN_M1_QUERY_ENGINE=true`：走 `QueryEngine.submitMessage`。

推荐 smoke 顺序：

```bash
npm run golden:meta-router -- --real --id META-001 --report /tmp/meta-real.jsonl
GOLDEN_M1_SYSTEM_PROMPT=true npm run golden:meta-router -- --real --id META-001 --report /tmp/meta-system.jsonl
GOLDEN_M1_QUERY_ENGINE=true npm run golden:meta-router -- --real --id META-001 --report /tmp/meta-engine.jsonl
```

解释：

- provider 400/connection error：本地模型或 provider 不适合当前 suite。
- 普通回答但事实缺失：真实 prompt path 缺产品事实。
- SQL/text 输出但命中 forbidden：模型或提示词违反 golden。

### 4.1 Real Smoke 前置条件

真实 runner 是 smoke，不是 mock gate。运行前应确认：

- 当前 provider selection 指向通用 chat/coding 模型；医学、纯 vision 或 embedding 模型不适合 Meta Router / Dialect。
- 本地 provider 健康，`/status` 或一次简单 `hi` 不应返回 400、empty response、cooldown。
- 如果使用 `GOLDEN_M1_QUERY_ENGINE=true`，MCP 配置和 workspace 状态会影响结果，应把报告写到 `/tmp` 便于隔离。
- real smoke 建议先跑单条 `--id`，再扩大到小批量；不要把全量 real smoke 放进快速 CI。
- provider 失败和 scorer 失败要分开处理：前者修模型/连接，后者修事实源、prompt 或产品逻辑。

推荐最小验证：

```bash
npm run golden:meta-router -- --real --id META-001 --report /tmp/codeclaw-meta-router-real.jsonl
npm run golden:report -- --report /tmp/codeclaw-meta-router-real.jsonl --failures
```

## 5. JSONL Report

runner 写 append-only JSONL：

```text
test/golden/reports/<YYYY-MM-DD>-dialect.jsonl
test/golden/reports/<YYYY-MM-DD>-meta-router.jsonl
```

每批结构：

```text
record
record
...
summary
```

append-only 的好处：

- 保留历史多次运行。
- 不覆盖失败证据。
- 适合作为长期 trend 数据源。

风险：

- 人工查看时容易把旧失败当成当前失败。

解决：

```bash
npm run golden:report -- --report <path>
```

默认只看最新 batch。

## 6. Report Viewer

命令：

```bash
npm run golden:report -- --report test/golden/reports/2026-05-07-meta-router.jsonl
npm run golden:report -- --report test/golden/reports/2026-05-07-meta-router.jsonl --all
npm run golden:report -- --report /tmp/meta-real.jsonl --failures
npm run golden:report -- --report /tmp/meta-real.jsonl --strict
npm run golden:report -- --report /tmp/meta-real.jsonl --failures --markdown /tmp/meta-real.md
```

行为：

- 默认：如果最新 batch 全绿，只显示摘要。
- 有失败：显示失败详情。
- `--all`：展开全部 case。
- `--failures`：只显示失败 case。
- `--strict`：最新 batch 有失败时 exit 1。
- `--markdown`：生成可分享 Markdown artifact。

## 7. CI / Nightly

快速确定性 gate：

```bash
npm run golden:ci
```

当前等价于：

```bash
npm run golden:dialect -- --mock
npm run golden:meta-router -- --mock --variants
```

建议：

- PR/本地 pre-push：只跑 `golden:ci`。
- nightly：可以追加少量 `--real --id ...` smoke。
- real smoke 失败时，使用 `golden:report --markdown` 导出 artifact。

## 8. Artifact 策略

本地 smoke 可写 `/tmp`：

```bash
--report /tmp/codeclaw-meta-router-real.jsonl
--markdown /tmp/codeclaw-meta-router-real.md
```

仓库内长期报告默认写：

```text
test/golden/reports/
```

CI 中应上传：

- JSONL 原始报告。
- Markdown 摘要。

不建议提交临时 report 输出，除非它是特意用于回归 fixture 的稳定样本。

## 9. 当前已实现

- `golden:dialect --real`
- `golden:meta-router --real`
- `golden:ci`
- `golden:report`
- `golden:report --markdown`
- 最新 batch 视图。
- failure-only 视图。
- strict mode。

## 10. 剩余 TODO

1. 给 `golden:ci` 增加 GitHub Action 或 pre-push hook。
2. 决定 Dialect 是否增加真实 Dremio 执行 gate。
3. 给 Meta Router real path 增加产品事实源注入，或明确 real path 只测裸 provider。
4. 真实 smoke 换成通用 chat/coding 模型后重新跑。
5. 可选：生成 markdown all-case release bundle。
