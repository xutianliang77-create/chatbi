# Real LSP Setup

## TL;DR — Do I need this?

**No, not to get started.** CodeClaw has **two LSP backends**; the default one needs zero setup.

| Backend | Install steps | When it's used |
|---------|--------------|----------------|
| `fallback-regex-index` | none (ships with the CLI) | Default; used whenever the Python venv below is missing |
| `multilspy` (real LSP)  | follow this doc             | Used when `.venv-lsp/` exists **and** `CODECLAW_ENABLE_REAL_LSP` is unset or `1` |

Skipping this doc is fine for:
- single-file symbol navigation
- TS / Py quick `/symbol <name>` lookups
- any workflow where you don't care about precise cross-file references

You need the real backend if you want:
- accurate cross-file `/references <symbol>` on large projects
- type-aware disambiguation (overloads, re-exports, generic instantiation)
- any language beyond the regex heuristics can handle well

---

## What the real backend actually is

CodeClaw now supports a real `multilspy` backend for:

1. `/symbol`
2. `/definition`
3. `/references`

The real backend is a **Python + Node mixed runtime**:

1. Python dependency: `multilspy` (runs LSP servers, exposes a uniform interface)
2. Node runtime dependency: `typescript-language-server`
3. Node runtime dependency: `typescript`

> **Why Python?** `multilspy` is a Python library that wraps multiple language servers (TS / Python / Java / Rust / Go / C#) behind one interface. The Node process spawns `.venv-lsp/bin/python` to talk to it over stdio. A Node-native LSP client is on the roadmap (P1+) and will remove this dependency.

## Standard Setup

Run:

```bash
npm run setup:lsp
```

This will:

1. create `.venv-lsp`
2. install `multilspy`
3. install `typescript-language-server`
4. install `typescript`

## Runtime Behavior

**Default (zero setup)**: the regex fallback is used silently. `/symbol`, `/definition`, `/references` all work; cross-file precision is reduced.

**After `npm run setup:lsp`**: CodeClaw auto-detects `.venv-lsp/` and prefers the real LSP backend.

You can force either lane with an environment variable:

```bash
CODECLAW_ENABLE_REAL_LSP=1 node dist/cli.js --plain   # force real LSP; error if venv missing
CODECLAW_ENABLE_REAL_LSP=0 node dist/cli.js --plain   # force regex fallback, ignore venv
# unset = auto: prefer real LSP when venv is available, else silent fallback
```

The env var is honored at every startup and per-query; there is no global toggle file.

## How to tell which backend is active

Run any LSP-backed command and look at the status block. `/symbol`, `/definition`, and `/references` now report the same three fields in CLI/Web tool output:

```text
LSPTool backend: fallback-regex-index
degraded: true
reason: real LSP backend not installed; using fallback-regex-index
```

Field meaning:

1. `backend` is the backend that actually produced this answer: `multilspy` or `fallback-regex-index`.
2. `degraded` is `true` when the answer came from the regex fallback or when the real backend itself reports reduced capability.
3. `reason` explains why that backend was selected, including real-backend startup failures such as a missing `.venv-lsp`, disabled env flag, or bridge crash.

You can also run:

```bash
node dist/cli.js doctor | grep -i lsp
```

`doctor` reports the active backend, whether it is degraded, the fallback backend, the real backend candidate, and the same reason text. In Web, the doctor endpoint and tool result panel should use these fields as provenance rather than inferring capability from command success alone.

The Web Graph panel also surfaces the same source status via `/v1/web/graph/status`:

```json
{
  "symbols": 120,
  "imports": 42,
  "calls": 315,
  "lsp": {
    "backend": "fallback-regex-index",
    "degraded": true,
    "reason": "real LSP backend auto-detection did not find an importable multilspy"
  }
}
```

This is intentionally diagnostic only: Graph still uses its own persisted CodebaseGraph tables, while LSP status tells you whether symbol/navigation tools are type-aware or regex-degraded.

## Current Notes

1. `.venv-lsp` is intentionally local to the repository — if you delete the repo, the venv goes with it; no global state polluted
2. If the real LSP fails for any reason (Python absent, venv broken, LSP server crashes), CodeClaw transparently falls back to `fallback-regex-index`; no hard failure
3. The current real backend is strongest on TypeScript-centric workspaces; Python / other languages are supported but less rigorously tested in CodeClaw's bridge layer
4. Uninstalling: `rm -rf .venv-lsp` and clear `CODECLAW_ENABLE_REAL_LSP` — you're back to the default regex lane
5. Roadmap: a Node-native LSP client is under evaluation for P1+ (would remove the Python dependency entirely); tracked via the forthcoming ADR-004
