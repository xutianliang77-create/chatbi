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

### 5.2 QueryEngine Integration

Before yielding each provider delta:

1. Record delta size.
2. If over budget, abort the current provider stream.
3. Append a local guard note.
4. End the current turn cleanly.

The guard note is treated as a normal assistant completion so the UI does not show a crash. If no tool call is pending, QueryEngine may inject a hidden resume prompt and continue for up to `CODECLAW_MAX_OUTPUT_RECOVERY_TURNS`; the final response is still passed through the artifact render budget.

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
7. Run `typecheck`, `lint`, `test`, `build`.

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
3. Add stop hook integration for quality gates.
4. Add optional non-stream fallback for idle failures.
