# CodeClaw Runtime Guards Design

## 1. Problem

Local and OpenAI-compatible models can get stuck while still emitting valid stream chunks. In that state, API `max_tokens` and idle watchdogs are not enough:

- The provider stream is not idle.
- SSE frames may be well-formed.
- `contentBuf` and final assistant text can grow until the terminal renderer or Node heap becomes unstable.
- If all model slots are busy with stuck tasks, new user work cannot make progress.

CodeClaw needs local control-plane guards that can stop the current task even when the model keeps streaming.

## 2. Goals

- Stop runaway model output before it can crash the terminal.
- Keep full oversized output available as an artifact instead of rendering it directly.
- Preserve current interrupt behavior: parent abort cascades to tools and subagents.
- Keep ordinary coding and data-analysis flows unchanged.
- Add clear next tasks for provider-level concurrency circuit breaking.

## 3. Non-Goals

- Do not redesign `QueryEngine`.
- Do not add a separate data mode or separate provider scheduler in P0.
- Do not migrate historical `~/.codeclaw` state in this guard work.

## 4. Guard Layers

| Layer | Scope | Default | Action |
|---|---:|---:|---|
| API `max_tokens` | Single provider call | provider config or `32768` | Provider ends or errors |
| Stream idle watchdog | Provider stream | `60000ms` | Abort reader |
| Stream buffer guard | Malformed stream buffer | `2MB` | Cancel reader and throw |
| Turn output guard | One user task | `64KB` | Abort provider and finish with guard note |
| Tool turn guard | Tool loop | `24` | Force final answer without more tools |
| Repeated tool-call guard | Tool loop | `5` identical batches | Stop repeating the same call and force final answer |
| Low-progress tool guard | Tool loop | `4` failed tool turns | Stop retrying failed tools and force final answer |
| Context budget hard gate | Provider input | provider window + tool schema | Pause before provider call with `[context budget exceeded]` |
| Oversized task staging guard | Task/direct source tools | `5` source-expansion tool calls | Return `task_needs_staging` and stop the turn |
| Tool fallback summarizer | Final summary failure | latest `5` successful tools | Local structured fallback; no second model call |
| Memory compression quality gate | L2 memory / auto-compact | structured digest | Clean tool output, enforce summary fields, avoid stale recall |
| Terminal render guard | Final assistant text | `24KB` | Save full text to artifact, render summary |
| Provider circuit breaker | Provider concurrency | `2` stuck turns -> `30s` cooldown | Cooldown stuck provider and prefer fallback |

## 5. P0 Implementation

### 5.1 TurnGuard

Add `src/agent/turnGuard.ts`.

Responsibilities:

- Track cumulative assistant stream bytes in one `submitMessage` turn.
- Read limits from env.
- Return a structured stop decision when the turn output limit is exceeded.
- Provide the configured max tool turns.

Environment variables:

- `CODECLAW_MAX_TURN_BYTES`, legacy fallback `CHATBI_MAX_TURN_BYTES`, default `65536`.
- `CODECLAW_MAX_TOOL_TURNS`, legacy fallback `CHATBI_MAX_TOOL_TURNS`, default `24`.
- `CODECLAW_REPEATED_TOOL_CALL_LIMIT`, legacy fallback `CHATBI_REPEATED_TOOL_CALL_LIMIT`, default `5`.
- `CODECLAW_LOW_PROGRESS_TOOL_TURNS`, legacy fallback `CHATBI_LOW_PROGRESS_TOOL_TURNS`, default `4`.
- `CODECLAW_TERMINAL_RENDER_BYTES`, legacy fallback `CHATBI_TERMINAL_RENDER_BYTES`, default `24576`.
- `CODECLAW_MAX_OUTPUT_RECOVERY_TURNS`, legacy fallback `CHATBI_MAX_OUTPUT_RECOVERY_TURNS`, default `2`.
- `CODECLAW_MAX_UNDELIMITED_STREAM_BUFFER_BYTES`, legacy fallback `CHATBI_MAX_UNDELIMITED_STREAM_BUFFER_BYTES`, default `2097152`.
- `CODECLAW_STREAM_IDLE_MS`, default `60000`.
- `CODECLAW_SHOW_THINKING`, legacy fallback `CHATBI_SHOW_THINKING`, default unset/hidden. Set `=1` to render provider `reasoning_content` / `reasoning` chunks.

Token/context budget variables:

- `CODECLAW_TOKEN_WARN_THRESHOLD`, default `0.7`: emit a warning when estimated provider input approaches this ratio of the model context window.
- `CODECLAW_AUTO_COMPACT_THRESHOLD`, default `0.85`: attempt auto-compact before provider calls once estimated input crosses this ratio.

The hard gate is not a separate env toggle. It is the final provider-call check after auto-compact: if estimated messages plus native tool schema still exceed the usable context budget, the turn returns `[context budget exceeded]` locally and does not call the provider.

### 5.2 QueryEngine Integration

Before yielding each provider delta:

1. Record delta size.
2. If over budget, abort the current provider stream.
3. Append a local guard note.
4. End the current turn cleanly.

The guard note is treated as a normal assistant completion so the UI does not show a crash. If no tool call is pending, QueryEngine may inject a hidden resume prompt and continue for up to `CODECLAW_MAX_OUTPUT_RECOVERY_TURNS`; the final response is still passed through the artifact render budget.

### 5.2.1 Context Budget Hard Gate

Before each provider call, `QueryEngine` estimates the provider message tokens plus the native tool schema tokens. If the current context is already over the hard budget, it must not send the request to the provider.

Behavior:

1. Attempt auto-compact first.
2. Recheck the budget after compaction.
3. If the turn is still over budget, emit a local assistant message starting with `[context budget exceeded]`.
4. Stop the current turn before another provider call.

Before L2 summary compact, CodeClaw also runs a micro-compact pass:

1. Oversized `tool` messages are replaced with a bounded `[micro-compact tool result]` preview.
2. The preview keeps tool name, original byte size, query/artifact/error signals, and a small head/tail excerpt.
3. If the summary provider returns empty or fails, CodeClaw treats compacting as failed and blocks the provider call locally instead of inserting a polluted `[LLM 摘要失败]` summary into replay context.
4. After repeated compact summary failures, the auto-compact circuit opens and future oversized turns stop locally without calling the summary model again.

The local message includes:

- current estimated tokens and context window
- auto-compact attempt count
- compact failure count, when summary compact failed
- guidance to start a new session or run `/compact`

This protects local models from returning empty responses or destabilizing the Web/terminal by receiving an oversized prompt.

Web UI handling:

- Assistant messages beginning with `[context budget exceeded]` are rendered as a protective pause notice.
- The session list marks the session as context-budget paused.
- The UI should make clear that the task stopped intentionally and safely, not because the browser crashed.

### 5.2.2 Completed Tools But Final Summary Failed

When tools completed successfully but the final provider summary fails or returns empty, CodeClaw must not call the model again with the same large tool transcript.

Instead, `QueryEngine` generates a local structured fallback from successful tool results:

1. Use only the latest 5 successful tool results.
2. Classify tools by type:
   - `bash` / `find` / `ls` -> file structure or directory scan
   - `glob` -> matched file list
   - `read` -> files that were read
   - `mcp__*` -> external MCP capability calls
   - `Task` -> subagent output or failure reason
   - others -> generic tool result
3. For each tool, show only:
   - tool category and tool name
   - one-line result summary
   - artifact path, if any
   - next-step guidance
4. List artifact paths separately.

The fallback must avoid raw command/output dumps in the main assistant message. Full outputs remain available through artifacts and `read_artifact`.

Tool result budget now has two layers:

1. Per-tool budget: `wrapToolResult` keeps small outputs inline and stores large outputs under the artifact root with a `read_artifact(...)` hint.
2. Per-turn aggregate budget: `applyToolResultAggregateBudget` tracks all tool result summaries produced by the same assistant tool-use turn. When the aggregate exceeds `CODECLAW_TOOL_RESULT_AGGREGATE_BYTES` (default 16KB), later tool results are replaced with `[tool result budget compacted]` plus artifact pointer and bounded preview.

This prevents many individually-small tool results from combining into a large provider replay message.

### 5.2.2.1 Memory Compression Quality Gate

Auto-compact and L2 session memory must not compress raw transcripts directly into free-form prose. Poor summaries can re-inject stale tool output, hidden thinking, old task directions, or unrelated prior sessions into new provider calls.

The summarizer now applies three quality gates before a digest is persisted:

1. Clean input:
   - Drop `system` and `hiddenFromUi` messages.
   - Keep user/assistant text clipped.
   - Convert `tool` messages into short evidence lines: tool name, queryId, preview rows, artifact, read targets, file paths, and error keywords.
   - Never pass raw large tool output into the summary prompt.
2. Structured output:
   - Require fields: `目标`, `已完成`, `关键证据`, `文件/对象`, `失败与原因`, `当前决策`, `下一步`, `禁止重复`.
   - Strip model thinking/self-check text.
   - If the model returns unstructured prose, wrap it into the structured schema.
   - If the model returns empty text or errors, keep the existing `[LLM 摘要失败]` fallback.
3. Relevant recall:
   - `recallRecent` remains backward compatible with numeric `limit`.
   - New option `{ query, limit, minScore }` filters digests by relevance when the current prompt is available.
   - Continuation prompts such as `继续`, `上次`, `刚才`, `resume`, or `previous` bypass filtering and keep recent summaries.
   - New sessions do not inject L2 summaries by default.
   - `QueryEngine` injects L2 summaries only for explicit `/resume`, continuation prompts, or the compatibility option `enableSessionMemoryRecall=true`.
   - Injected L2 recall is stored as `role=system, source=summary` and must be included in provider replay.
   - Failed summaries such as `[LLM 摘要失败]` and summaries polluted with `thinking process` are ignored during recall.

This layer complements, but does not replace, the context budget hard gate. The hard gate decides whether a provider call is allowed; the memory quality gate decides what compacted history is safe and useful to carry forward.

### 5.2.3 Oversized Task Staging Guard

Whole-repo or every-file tasks can overwhelm the context before the model reaches a final answer. Examples:

- "scan the entire repository"
- "read every source file"
- "analyze every file and find bugs"
- "full codebase exhaustive review"
- explicit "context over budget" / "empty summary" stress tasks

CodeClaw handles these as staged tasks, not as one giant Task or one giant direct tool loop.

There are two enforcement points:

1. `Task` tool guard:
   - If a `Task` prompt looks oversized and does not already specify a phase/batch/file limit, the Task tool returns `task_needs_staging`.
   - It does not start a subagent.
   - It does not call the provider.
2. Direct source-tool guard:
   - Some models bypass `Task` and call `glob`, `read`, `read_artifact`, or `bash` directly.
   - For oversized prompts, `QueryEngine` tracks these source-expansion tool calls.
   - After the small first-phase allowance, it blocks the next source-tool batch, records blocked tool evidence with `task_needs_staging`, emits staged guidance, and halts the turn.

Staged guidance tells the model/user to proceed as:

1. Phase 1: directory and file inventory only; do not read every file.
2. Phase 2: read one module or at most 10 related files.
3. Phase 3: continue module batches, reusing prior summaries.
4. Phase 4: summarize verified findings, residual risk, and next batch.

Prompts that already include explicit phase, batch, module, or file-count limits are allowed to proceed.

### 5.3 Low-Progress Tool Guard

Some stuck turns are not identical repeats: the model changes SQL or tool arguments slightly while every tool attempt still fails. QueryEngine now tracks consecutive tool turns where no tool succeeds. After `CODECLAW_LOW_PROGRESS_TOOL_TURNS` failed tool turns, it injects a hidden final-answer reminder and disables tools for the next turn.

This guard is intentionally relaxed by default. Any successful tool result resets the counter, so complex but progressing tasks can continue.

### 5.4 Render Budget

Before storing and emitting `message-complete`, wrap oversized assistant text:

1. Save full text under `~/.codeclaw/artifacts/<session>/<messageId>.txt`.
2. Render only head/tail summary and a `read_artifact` hint.
3. Store the summary in transcript to avoid replaying giant content into future provider calls.

Embedded/test runtimes can pass `QueryEngineOptions.artifactsRoot` to isolate artifact output away from the default home directory.

## 6. P1 Provider Circuit Breaker

Add provider-level concurrency state:

- `runningCount`
- `stuckCount`
- `cooldownUntil`
- `lastReasons`

Trigger condition:

```text
runningCount >= maxConcurrency
AND stuckCount >= threshold
```

Actions:

- Abort the current stuck task.
- Mark provider in cooldown. Default is intentionally relaxed for complex data tasks: 2 stuck outcomes before a 30-second cooldown.
- Prefer fallback provider.
- If no fallback is available, return a local error explaining the provider is cooling down.

Implemented baseline:

- `src/provider/circuitBreaker.ts` tracks running, stuck count, cooldown, and last reason.
- It also tracks transient provider failures separately, such as `fetch failed`, `ECONNRESET`, `429`, and `5xx`.
- `QueryEngine` acquires a provider circuit token before provider streaming and releases it after completion.
- TurnGuard-triggered normal output-limit stops are recovered locally and are not classified as provider stuck.
- Malformed/idle streams are classified as `stuck`.
- Network/provider-capacity failures are classified as transient and use a shorter cooldown.
- Provider chain treats `circuit_open` as a normal provider failure and tries the fallback provider.
- The baseline is process-local. Cross-process circuit state is a future enhancement.

Environment variables:

- `CODECLAW_PROVIDER_MAX_CONCURRENCY`, legacy fallback `CHATBI_PROVIDER_MAX_CONCURRENCY`, default `2`.
- `CODECLAW_PROVIDER_STUCK_THRESHOLD`, legacy fallback `CHATBI_PROVIDER_STUCK_THRESHOLD`, default `2`.
- `CODECLAW_PROVIDER_COOLDOWN_MS`, legacy fallback `CHATBI_PROVIDER_COOLDOWN_MS`, default `30000`.
- `CODECLAW_PROVIDER_TRANSIENT_THRESHOLD`, legacy fallback `CHATBI_PROVIDER_TRANSIENT_THRESHOLD`, default `3`.
- `CODECLAW_PROVIDER_TRANSIENT_COOLDOWN_MS`, legacy fallback `CHATBI_PROVIDER_TRANSIENT_COOLDOWN_MS`, default `10000`.

## 7. P2 Diagnostics

Done: Add `/stuck`:

- Current turn duration.
- Current provider.
- Output bytes.
- Tool turn count.
- Last tool calls.
- Circuit breaker state.

Implementation note:

- `/stuck` does not reset runtime guard diagnostics. This allows a future concurrent channel to inspect a running turn without overwriting the stuck turn's state.

## 8. Development Tasks

### P0

1. Add `TurnGuard`.
2. Add assistant render artifact wrapper.
3. Wire turn output guard into `QueryEngine`.
4. Lower tool turn default through config helper.
5. Make subagent parent abort actively call child `engine.interrupt()`.
6. Add unit tests for guard config, output stop, render artifact, and subagent abort path.
7. Done: Add `[context budget exceeded]` hard pause before oversized provider calls.
8. Done: Add local structured fallback when tools succeed but final model summary is empty or fails.
9. Done: Add `task_needs_staging` guard for oversized `Task` prompts.
10. Done: Add direct source-tool staging guard for oversized prompts that call `glob` / `read` / `read_artifact` / `bash` without using `Task`.
11. Done: Add memory compression quality gate for structured digests and relevant recall.
12. Run `typecheck`, `lint`, `test`, `build`.

### P1

1. Done: Add `ProviderCircuitBreaker`.
2. Done: Track provider acquire/release around provider chain calls.
3. Done: Add provider cooldown and fallback behavior.
4. Done: Add `/status` provider health summary.
5. Done: Add repeated identical tool-call detection and force final answer.
6. Done: Add low-progress stuck classification.
7. Next: Add cross-process circuit state if multiple CodeClaw processes share one local model.

### P2

1. Done: Add `/stuck`.
2. Done: Add repeated tool-call detection.
3. Done: Web renders `[context budget exceeded]` as a visible protective pause notice.
4. Add stop hook integration for quality gates.
5. Add optional non-stream fallback for idle failures.
