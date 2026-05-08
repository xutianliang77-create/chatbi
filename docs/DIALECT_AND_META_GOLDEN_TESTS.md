# Dialect + Meta Router Golden Suites

This document describes two regression suites generated from exported QA files:

- `test/golden/dialect/DIALECT-TRAPS.json`
- `test/golden/meta-router/META-ROUTER-FACTS.json`

They are intentionally separate from `DATA-100.yaml`.

See also: `docs/GOLDEN_REAL_RUNNER_TECH_DESIGN.md`.

## Dialect Traps

Scope: SQL generation dialect conformance.

The suite has 61 cases and verifies:

1. Dremio/MySQL SQL dialect compatibility.
2. Identifier and string literal quoting.
3. Date, math, string, aggregate, window, array/map, null, cast, and GROUP BY ordinal traps.
4. Required SQL tokens are present.
5. Forbidden dialect traps are absent.

Commands:

```bash
npm run golden:dialect -- --dry-run
npm run golden:dialect -- --mock
npm run golden:dialect -- --id dq02 --verbose
npm run golden:dialect -- --trap T11
npm run golden:dialect -- --difficulty hard
```

Gate: overall pass rate must be at least 90%.

Current runner status:

- `--dry-run` validates the exported JSON schema.
- `--mock` uses deterministic SQL-like output from `expected_must_contain`.
- `--real` uses the configured CodeClaw provider to generate SQL text and scores the text output.
- `--real` does not execute SQL against Dremio. Treat live Dremio execution as a separate follow-up gate after metadata sync.

## Meta Router Facts

Scope: system-fact routing and anti-hallucination answers.

The suite has 7 source facts and verifies:

1. Static `.md` knowledge-base hallucinations are rejected.
2. Context size is described as token-based, not 1MB-based.
3. Verifier/checking behavior is described from the actual product facts.
4. Multi-turn history and knowledge-base persistence are not overstated.
5. Agent flow and data discovery behavior are not invented.

Commands:

```bash
npm run golden:meta-router -- --dry-run
npm run golden:meta-router -- --mock
npm run golden:meta-router -- --mock --variants
npm run golden:meta-router -- --fact context_window --verbose
```

`--variants` adds up to 3 keyword-trigger prompts per fact, so 7 source facts become 28 cases.

Gate: 100% pass rate. A single explicit system-fact hallucination should fail the suite.

Current runner status:

- `--dry-run` validates the exported JSON schema.
- `--mock` returns the exported baseline answer and scores coverage + forbidden hallucination phrases.
- `--real` uses the configured CodeClaw provider to answer fact prompts and scores the text output.
- Set `GOLDEN_M1_SYSTEM_PROMPT=true` to include the current system prompt in the provider call.
- Set `GOLDEN_M1_QUERY_ENGINE=true` to route through `QueryEngine.submitMessage` for a fuller interactive-path smoke.

## Reports

Both runners write JSONL reports under:

```text
test/golden/reports/<YYYY-MM-DD>-dialect.jsonl
test/golden/reports/<YYYY-MM-DD>-meta-router.jsonl
```

Use `--report <path>` to override report location during local smoke tests.

Because reports are append-only JSONL files, use the report viewer to inspect the
latest batch without mixing in old runs:

```bash
npm run golden:report -- --report test/golden/reports/<YYYY-MM-DD>-dialect.jsonl
npm run golden:report -- --report test/golden/reports/<YYYY-MM-DD>-meta-router.jsonl --all
npm run golden:report -- --report /tmp/codeclaw-meta-router-real.jsonl --failures
npm run golden:report -- --report /tmp/codeclaw-meta-router-real.jsonl --strict
npm run golden:report -- --report /tmp/codeclaw-meta-router-real.jsonl --failures --markdown /tmp/codeclaw-meta-router-real.md
```

`--markdown <path>` writes a shareable artifact for review. By default it exports
only failures when failures exist and otherwise exports a compact summary. Add
`--all` when reviewers need every case.

Fast deterministic gate for CI/nightly:

```bash
npm run golden:ci
```

`golden:ci` runs:

1. `golden:dialect -- --mock`
2. `golden:meta-router -- --mock --variants`

## P0 Real Smoke

The real runners are intentionally small provider-output checks:

```bash
npm run golden:meta-router -- --real --id META-001 --report /tmp/codeclaw-meta-router-real.jsonl
npm run golden:dialect -- --real --id dq01 --report /tmp/codeclaw-dialect-real.jsonl
```

Interpretation:

- A provider 400/connection error means the local provider/model is not ready for this suite.
- A scoring failure with a normal natural-language answer means the real prompt path is missing the required product facts or SQL dialect guidance.
- A scoring failure with SQL/text output means the model actually violated the golden expectation.
- Dialect `--real` currently validates generated SQL text only; it does not execute against Dremio.
