# CodeClaw Project Conventions

## Beelink Data Analysis Flow

When the user asks a business/data question that should use Beelink MCP, follow this flow before writing or executing SQL:

1. Call `ExploreForQuestion` with the user's original question to retrieve semantic-layer, glossary, and local metadata candidates.
2. Call `BuildSqlGuidance` for the same question before drafting SQL. Treat its output as the SQL-writing rule/context bundle.
3. Generate SQL yourself using only the returned semantic and metadata evidence. Do not invent table names or columns.
4. Use `PrepareSqlReference` for catalog paths with special characters, especially paths like `@x.chatbi_food_sales`.
5. Call `CheckSqlAgainstRules` before executing SQL. If it returns errors, fix the SQL first. If it returns warnings, address them when safe.
6. Execute exploratory read-only SQL only through `RunSqlQuery`, with a bounded preview.
7. If SQL execution fails, call `RepairSqlAttempt` with the failed SQL, the upstream error, and the original user question before retrying.
8. Summarize only from returned preview rows and clearly state uncertainty, permission limits, or business-metric assumptions.

After any Beelink tool call, always produce a final user-facing answer. Do not stop after tool calls and do not return an empty response. If the tools only provide metadata or guidance, summarize what was found, name the evidence source such as semantic-layer, glossary, metadata, or preview, and state the next safe step.

For "most sold / best-selling / 最畅销" questions:

- Prefer a reviewed semantic metric from `semantic-layer.json` when available.
- If only metadata hints exist, first inspect whether there are quantity, amount, order, or item fields.
- If both `quantity` and `sales_amount` exist, treat them as different measures: quantity ranking uses `SUM(quantity)`, sales ranking uses `SUM(sales_amount)`.
- If an `items` column contains colon-separated combinations, do not treat the full combination as the final single-item ranking. First explain the distinction, then use engine-supported string functions or ask for clarification.
- Do not repeatedly try unsupported SQL dialect functions. After one dialect/function failure, use `RepairSqlAttempt` and adapt to the reported engine capabilities.

## Report And Dashboard Generation Flow

When the user asks to create, generate, save, show, or open a report/dashboard, prefer the product tools instead of only replying with prose. The goal is that chat-generated reports appear in the Reports/Dashboards area.

Use this report flow:

1. Clarify the report goal only if the requested metric, table, or time grain is ambiguous enough that a safe default would be misleading.
2. If the report needs Beelink data, follow the full `Beelink Data Analysis Flow` first: explore metadata, build SQL guidance, check SQL rules, run read-only SQL, and repair once when needed.
3. Keep `RunSqlQuery` previews bounded. Use the preview only to validate shape and reason about the answer; do not treat preview rows as a complete report dataset.
4. For the final SQL used by a saved report, call `ExportSqlArtifact` unless the user explicitly asked for preview-only output. Use its bounded JSON artifact as the dataset source of truth.
5. Build a report specification with at least: title, original question, workspace id, datasets, sections, insights/caveats, chart specs, and provenance.
   - Put only a small preview in inline `dataset.rows` / `dataset.data`.
   - Put the `ExportSqlArtifact` path in `dataset.resultArtifact` and `dataset.provenance.artifacts.result`.
   - Preserve `queryId`, `rowCount`, exported row count, and truncation state from `ExportSqlArtifact`.
   - Preserve the `CheckSqlAgainstRules` result in `dataset.provenance.ruleCheck`. If you have one SQL dataset, you may pass the same result as top-level `ruleCheck`; `CreateReportArtifact` will attach it to that dataset.
   - Add a caveat when `ExportSqlArtifact` says `Truncated: yes`; do not imply the report contains all rows.
6. Call `CreateReportArtifact` to persist the report. If it returns warnings about missing SQL artifact/provenance, fix the report spec before telling the user the report is complete.
   - If `CreateReportArtifact` fails, do not switch to prose-only output or a standalone HTML file. Fix the tool arguments and retry.
   - If the error says `question is required`, retry with top-level `question`, `datasets`, and `provenance`, for example: `{"question":"客户性别对比","datasets":[...],"provenance":{"source":"llm","question":"客户性别对比"}}`.
7. Call `RenderReportHtml` when the user asks to view/open/export the report, or when the report should be immediately consumable in the Web UI.
8. Call `ListReports` or `ReadReport` after creation when you need to verify that the report was saved and visible.
9. If the user asks for an interactive dashboard, recurring dashboard, multi-page dashboard, or "upgrade this report", call `UpgradeReportToDashboard` or `CreateDashboardSpec` after the report exists.
10. For dashboard output, call `ValidateDashboardSpec` before rendering. If validation warns about missing datasets, broken chart references, or missing provenance, fix the dashboard spec first.
11. Call `RenderDashboardHtml` when the user asks to view/open/export the dashboard, or when the dashboard should be immediately consumable in the Web UI.

Hard boundaries:

- Do not use `write`, `append`, `replace`, or ad-hoc HTML files as the final delivery path for reports or dashboards.
- If the user asks for a report, chart report, dashboard, or HTML report, the saved product object must be created through `CreateReportArtifact` or `CreateDashboardSpec`.
- A standalone file such as `analysis.html` may be an auxiliary artifact only after the Report/Dashboard object exists; it must not be presented as "the report is saved" unless it is also visible through `ListReports` or `ReadReport`.
- If report/dashboard creation fails, explicitly say the saved report/dashboard was not created yet, then repair the tool input. Never claim completion from query previews alone.
- After creating a report from chat, verify visibility with `ListReports` or `ReadReport` before telling the user it can be found in Reports.

Report/Dashboard provenance requirements:

- Preserve the SQL text used for each dataset when SQL was involved.
- Preserve query id, preview row count, truncation state, preview artifact path, and result artifact path when available.
- Preserve model/provider information when a model generated the report, SQL, interpretation, or chart choice.
- Include caveats for permission-limited metadata, truncated previews, sampled rows, business-metric assumptions, and SQL repairs.
- If a report/dashboard is generated from chat, rely on the current tool context user id as owner unless the user explicitly asks for a different owner.

Tool preference:

- Use `CreateReportArtifact` for saved reports.
- Use `RenderReportHtml` for report HTML output.
- Use `ListReports` and `ReadReport` for report verification or retrieval.
- Use `UpgradeReportToDashboard` when converting an existing report into a dashboard.
- Use `CreateDashboardSpec` for a new dashboard that is not based on an existing report.
- Use `ValidateDashboardSpec` before dashboard rendering or whenever charts/datasets were edited.
- Use `RenderDashboardHtml` for dashboard HTML output.
