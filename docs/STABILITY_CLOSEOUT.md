# CodeClaw Stability Closeout

This note summarizes the runtime-stability checkpoint for CodeClaw `0.8.6`.

## What Is Covered

| Risk | Guard |
|---|---|
| Model streams forever and floods the terminal | `CODECLAW_MAX_TURN_BYTES` turn output guard |
| User asks for huge final output | `CODECLAW_TERMINAL_RENDER_BYTES` final render artifact |
| Provider returns malformed undelimited stream | `CODECLAW_MAX_UNDELIMITED_STREAM_BUFFER_BYTES` buffer guard |
| Provider stream hangs without chunks | `CODECLAW_STREAM_IDLE_MS` idle watchdog |
| Terminal stdout backpressure never drains | bounded stdout drain wait with fail-open audit |
| Ctrl+C during long tool/MCP/subagent work | parent abort signal is propagated to tools |
| Artifact save fails | fail-open head/tail summary instead of crashing the turn |
| SQL/chart/tool already succeeded but final LLM summary fails | local successful-tool fallback summary |
| Provider repeatedly returns `fetch failed`, `429`, or `5xx` | transient provider cooldown |
| Model repeats identical tool calls | repeated tool-call guard |
| Model changes arguments but every tool turn fails | low-progress tool guard |

## Defaults

| Variable | Default | Purpose |
|---|---:|---|
| `CODECLAW_MAX_TURN_BYTES` | `65536` | One user-turn assistant stream cap |
| `CODECLAW_TERMINAL_RENDER_BYTES` | `24576` | Final terminal render cap |
| `CODECLAW_MAX_OUTPUT_RECOVERY_TURNS` | `2` | Bounded resume turns after output cap |
| `CODECLAW_MAX_UNDELIMITED_STREAM_BUFFER_BYTES` | `2097152` | Malformed stream buffer cap |
| `CODECLAW_STREAM_IDLE_MS` | `60000` | Provider idle watchdog |
| `CODECLAW_MAX_TOOL_TURNS` | `24` | Tool-loop hard limit |
| `CODECLAW_REPEATED_TOOL_CALL_LIMIT` | `5` | Identical tool-call repeat limit |
| `CODECLAW_LOW_PROGRESS_TOOL_TURNS` | `4` | Consecutive failed tool-turn limit |
| `CODECLAW_PROVIDER_MAX_CONCURRENCY` | `2` | In-process provider concurrency |
| `CODECLAW_PROVIDER_STUCK_THRESHOLD` | `2` | Stuck failures before cooldown |
| `CODECLAW_PROVIDER_COOLDOWN_MS` | `30000` | Stuck cooldown |
| `CODECLAW_PROVIDER_TRANSIENT_THRESHOLD` | `3` | Transient failures before cooldown |
| `CODECLAW_PROVIDER_TRANSIENT_COOLDOWN_MS` | `10000` | Transient cooldown |

## Real Smoke Tests Performed

- `/status` and `/stuck` respond normally in a real TUI session.
- Provider `fetch failed` increments transient counts and clears after a successful provider call.
- Long project-scan task can be interrupted with `Ctrl+C`.
- After interrupt, `/mode dontAsk`, `/status`, `/stuck`, and a normal `hi` prompt still work.

## Automated Validation

```bash
npm run test -- test/provider-client.test.ts test/unit/provider/circuitBreaker.test.ts test/unit/agent/turnGuard.test.ts test/unit/lib/stdoutBackpressure.test.ts test/unit/agent/tools/artifact.test.ts test/unit/agent/native-tool-loop.test.ts
npm run typecheck
npm run lint
npm run build
```

## Remaining Non-Blocking Work

- Cross-process provider circuit state, only needed if multiple CodeClaw processes frequently share the same local model.
- More real TUI smoke cases around long MCP calls and extremely large final outputs.
- Stop-hook quality gates for answer-level policy, such as blocking empty or obviously irrelevant final answers.
