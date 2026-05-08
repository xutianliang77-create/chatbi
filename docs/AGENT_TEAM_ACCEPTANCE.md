# Agent Team 收口验收报告

日期：2026-05-08

## 1. 验收范围

本次验收覆盖 Agent Team 基础版交付面：

1. `/team plan/run/status/cancel/retry/write` CLI 主路径。
2. TeamRun 持久化、Blackboard、Mailbox、Claim Gate、Merge Gate。
3. Web Team 面板、TeamRun 列表、取消、重跑、write preview、confirmed write。
4. 同 provider role-level model override：`--model role=model`。
5. 文档状态矩阵与技术设计同步。

不在本次验收范围：

1. 跨 provider role routing：已列 TODO，建议命令形态为 `--agent role=provider:model`。
2. 自动 write-worker 编排：当前真实写入仍必须经 active claim、preview、confirmation 和 `executeClaimedFileWrite()`。
3. 企业级长期自治、多工作区/远程 worktree、多角色黑板轮询。

## 2. 验收结论

Agent Team 基础版可以标记为“已实现基础版”。

当前能力已经满足：

1. 可生成有边界的 TeamPlan，并对全仓/逐文件类任务做 staging。
2. 可运行 read-only explorer/reviewer worker，并把结果写入 TeamRun/Blackboard/Mailbox。
3. 写入型任务不会直接落盘，会先生成 claim 并进入 `waiting_approval`。
4. 已批准的 active claim 可以通过 `/team write` 或 Web write endpoint 走受控写入。
5. Web 写入入口先 dry-run preview，再要求 `confirmed=true`，旧 UI 或误调用不能绕过确认。
6. Merge Gate 会要求 reviewer/test evidence，未满足时 TeamRun 不能进入真正完成态。
7. Worker/provider 失败或空 summary 时，Team 可以基于 Blackboard 生成本地 fallback。
8. role-level model override 已支持同 provider 下不同 model id。

## 3. 验收矩阵

| 能力 | 状态 | 证据 |
| --- | --- | --- |
| TeamPlan 生成 | 通过 | `test/unit/agent/team/coordinator.test.ts` |
| 超大任务 staging | 通过 | `test/unit/agent/team/coordinator.test.ts`, `test/unit/agent/tools/taskTool.test.ts` |
| read-only TeamRun | 通过 | `test/unit/agent/team/runner.test.ts`, `test/unit/agent/queryEngine-team.test.ts` |
| Blackboard / Mailbox | 通过 | `test/unit/agent/team/runner.test.ts` |
| TeamRun SQLite 持久化 | 通过 | `test/unit/agent/team/store-persistence.test.ts`, `test/unit/storage/migrate.test.ts` |
| Claim Gate | 通过 | `test/unit/agent/team/writeGuard.test.ts`, `test/unit/agent/queryEngine-team.test.ts` |
| Write Executor | 通过 | `test/unit/agent/team/writeExecutor.test.ts` |
| Merge Gate | 通过 | `test/unit/agent/team/mergeGate.test.ts` |
| Web Team endpoints | 通过 | `test/unit/channels/web/server-stage-a.test.ts` |
| Slash command delegation | 通过 | `test/unit/commands/slash/builtins.test.ts` |
| Role-level model override | 通过 | `test/unit/agent/team/coordinator.test.ts`, `test/unit/agent/tools/taskTool.test.ts`, `test/unit/agent/queryEngine-team.test.ts` |
| 打包后 CLI smoke | 通过 | `node dist/cli.js --plain` 手动执行 `/team plan --model explorer=... --model reviewer=...` |

## 4. 本轮执行命令

```bash
npm run test -- test/unit/agent/team/coordinator.test.ts test/unit/agent/team/runner.test.ts test/unit/agent/team/mergeGate.test.ts test/unit/agent/team/store-persistence.test.ts test/unit/agent/team/writeGuard.test.ts test/unit/agent/team/writeExecutor.test.ts test/unit/agent/tools/taskTool.test.ts test/unit/agent/queryEngine-team.test.ts test/unit/channels/web/server-stage-a.test.ts test/unit/commands/slash/builtins.test.ts test/unit/storage/migrate.test.ts
npm run typecheck
git diff --check
npm run build
node dist/cli.js --plain
```

结果：

1. Agent Team 相关回归：11 files / 127 tests passed。
2. TypeScript typecheck：passed。
3. Whitespace check：passed。
4. Build：passed。
5. Vite chunk size warning：仍为既有 Monaco/editor chunk 警告，不影响本次验收。
6. CLI smoke：`/team plan --model explorer=qwen/qwen3.6-14b --model reviewer=qwen/qwen3.6-27b 审查 src/agent/queryEngine.ts` 输出正确。

## 5. 真实 CLI Smoke 输出摘要

命令：

```bash
/team plan --model explorer=qwen/qwen3.6-14b --model reviewer=qwen/qwen3.6-27b 审查 src/agent/queryEngine.ts
```

关键结果：

1. 输出 `Agent Team Plan`。
2. `team-task-1 [explorer]` 显示 `model: qwen/qwen3.6-14b`。
3. `team-task-2 [reviewer]` 显示 `model: qwen/qwen3.6-27b`。
4. 两个 task 均为 `read_only`，scope 指向 `src/agent/queryEngine.ts`。

## 6. 当前边界

1. `--model role=model` 只覆盖当前 provider 的 model id。
2. 跨 provider role routing 尚未实现，已记录为 TODO：`--agent role=provider:model`。
3. 自动 write-worker 尚未开放；真实写入必须经 claim + preview + confirmation。
4. Web Team 面板目前展示模型字段，但还没有 role/provider 配置 UI。
5. TeamRun replay 已有 snapshot 基础，proposal/preview/confirm/apply/reject 的完整产品化历史仍待 M3-write 扩展。

## 7. 下一步建议

优先级建议：

1. P1：跨 provider role routing。
2. P1：Web Team 面板增加 provider/model 配置入口。
3. M3-write：结构化 WriteProposal 持久化与状态机。
4. P2：自动 write-worker 编排，但必须继续保持 claim、preview、confirmation 和 Merge Gate。
