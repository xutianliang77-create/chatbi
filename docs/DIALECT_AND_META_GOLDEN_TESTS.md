# Dialect + Meta Router Golden Suites

This document describes two regression suites generated from exported QA files:

- `test/golden/dialect/DIALECT-TRAPS.json`
- `test/golden/meta-router/META-ROUTER-FACTS.json`

They are intentionally separate from `DATA-100.yaml`.

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
- `--real` is intentionally not wired yet; use it only after a real provider/SQL generation adapter is implemented.

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
- `--real` is intentionally not wired yet; use it only after a real meta-router/provider adapter is implemented.

## Reports

Both runners write JSONL reports under:

```text
test/golden/reports/<YYYY-MM-DD>-dialect.jsonl
test/golden/reports/<YYYY-MM-DD>-meta-router.jsonl
```

Use `--report <path>` to override report location during local smoke tests.
