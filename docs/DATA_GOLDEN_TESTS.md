# CodeClaw Data Golden Suite

This is the data-analysis golden suite for CodeClaw. It is separate from the general `/ask` golden set.

## Scope

The suite has 100 cases in `test/golden/data/DATA-100.yaml`.

It verifies the expected CodeClaw + Beelink data lane:

1. Search local metadata and semantic context first.
2. Probe upstream only when local context is insufficient.
3. Build SQL guidance before drafting SQL.
4. Prepare special SQL references such as `@x.chatbi_food_sales`.
5. Check SQL against read-only and dialect rules before execution.
6. Execute through Beelink with bounded previews.
7. Repair failed SQL attempts with metadata feedback.
8. Summarize only from returned preview/artifacts.
9. Produce chart/report arguments from actual query results.
10. Protect the terminal and transcript from huge outputs or stuck loops.

## Layers

| Layer | Count | Purpose |
| --- | ---: | --- |
| metadata | 10 | catalog/schema search, metadata.db, permissions |
| semantic | 10 | semantic-layer.json, glossary.md, business metrics |
| sql | 10 | SQL reference, guidance, rule check, dialect |
| execution | 10 | RunSqlQuery, preview, query id, artifact |
| repair | 10 | RepairSqlAttempt and reverse probing |
| chart | 10 | PrepareChartRenderArgs and chart fallbacks |
| report | 10 | concise reviewable BI report behavior |
| security | 10 | read-only enforcement, privacy, prompt injection |
| workflow | 10 | orchestrated flow without a second QueryEngine |
| runtime | 10 | terminal safety, stuck guard, multi-channel session |

## Commands

```bash
npm run golden:data -- --dry-run
npm run golden:data -- --mock
npm run golden:data -- --layer sql
npm run golden:data -- --id DATA-090 --verbose
```

`--dry-run` validates the 100-case schema only.

`--mock` runs a deterministic invoker and scorer. It is the current CI-safe gate.

`--real` runs the same cases through a real QueryEngine + configured provider + Beelink MCP. Start with one or a few cases before running all 100, because real runs can be slow and consume model capacity.

Example real smoke:

```bash
TMPDIR=/private/tmp npm run golden:data -- --real --id DATA-099 --verbose
```

Real cases have a default timeout of 120 seconds. Override it only for known long data questions:

```bash
DATA_GOLDEN_REAL_TIMEOUT_MS=240000 TMPDIR=/private/tmp npm run golden:data -- --real --id DATA-011 --verbose
```

## Gates

Overall pass rate must be at least 90%.

Layer gates:

| Layer | Gate |
| --- | ---: |
| metadata | 90% |
| semantic | 90% |
| sql | 90% |
| execution | 90% |
| repair | 80% |
| chart | 80% |
| report | 80% |
| security | 100% |
| workflow | 85% |
| runtime | 85% |

Security is stricter because a single write-operation or credential leak behavior is unacceptable.

## Report

Reports are JSONL files:

```text
test/golden/reports/<YYYY-MM-DD>-data.jsonl
```

Each record includes:

- `id`
- `layer`
- `difficulty`
- `answerExcerpt`
- `toolsInvoked`
- `score.reason`

The summary line includes per-layer pass rates and the final gate result.

## Adding Cases

Keep the suite at exactly 100 active cases unless intentionally changing the gate contract.

Each case must include:

- `id` in continuous `DATA-001` to `DATA-100` order
- `layer`
- `difficulty`
- `prompt`
- `expected.must_mention` and/or `expected.tool_calls.must_invoke`

Prefer behavior-oriented expectations over brittle exact wording.

## Real Runner Notes

The real runner does the following:

1. Create a QueryEngine with Beelink MCP enabled.
2. Submit the case prompt.
3. Capture assistant text and actual MCP tool names.
4. Score with the same `scoreDataGolden` function.
5. Keep SQL previews bounded and artifacts outside the LLM transcript.

The runner physically unregisters non-read local tools during real runs while keeping read-only local tools and MCP bridge tools. This prevents golden tests from mutating the repository while still allowing Beelink data tools.

The real runner also resets the process-local provider circuit before and after each case. This keeps one timed-out or stuck model call from poisoning the rest of a 100-case evaluation run. Production CodeClaw runtime does not reset circuit state this way.

Recommended rollout:

1. Run `--dry-run`.
2. Run `--mock`.
3. Run one low-risk real smoke such as `DATA-099`.
4. Run one Beelink metadata case such as `DATA-001`.
5. Only then run a layer or the full suite.

## Real Dremio Fixture

For real Beelink/Dremio smoke tests that need deterministic business answers, use:

```text
test/fixtures/dremio/codeclaw_golden_customers.csv
test/fixtures/dremio/codeclaw_golden_orders.csv
test/fixtures/dremio/codeclaw_golden_bi.md
```

Suggested Dremio table names:

```text
@xu.codeclaw_golden_customers
@xu.codeclaw_golden_orders
```

Core expected answers:

| Question | Expected |
| --- | --- |
| 女性购物有多少人，金额一共多少？ | `5` shoppers, `1110.00` sales amount |
| 男性购物有多少人，金额一共多少？ | `4` shoppers, `1082.00` sales amount |
| 哪个商品销量最高？ | `Bread`, `SUM(quantity)=38` |
| 哪个商品销售额最高？ | `Steak`, `SUM(sales_amount)=1128.00` |

After uploading the CSVs, run `SyncMetadataIndex` with the latest Beelink MCP so stale local metadata and stale semantic drafts are pruned/refreshed before running real golden cases.
