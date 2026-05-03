# CodeClaw Project Conventions

## Beelink Data Analysis Flow

When the user asks a business/data question that should use Beelink MCP, follow this flow before writing or executing SQL:

1. Call `ExploreForQuestion` with the user's original question to retrieve semantic-layer, glossary, and local metadata candidates.
2. Call `BuildSqlGuidance` for the same question before drafting SQL. Treat its output as the SQL-writing rule/context bundle.
3. Generate SQL yourself using only the returned semantic and metadata evidence. Do not invent table names or columns.
4. Use `PrepareSqlReference` for catalog paths with special characters, especially paths like `@x.chatbi_food_sales`.
5. Call `CheckSqlAgainstRules` before executing SQL. If it returns errors, fix the SQL first. If it returns warnings, address them when safe.
6. Execute read-only SQL only through `RunSqlQuery`, with a bounded preview.
7. If SQL execution fails, call `RepairSqlAttempt` with the failed SQL, the upstream error, and the original user question before retrying.
8. Summarize only from returned preview rows and clearly state uncertainty, permission limits, or business-metric assumptions.

After any Beelink tool call, always produce a final user-facing answer. Do not stop after tool calls and do not return an empty response. If the tools only provide metadata or guidance, summarize what was found, name the evidence source such as semantic-layer, glossary, metadata, or preview, and state the next safe step.

For "most sold / best-selling / 最畅销" questions:

- Prefer a reviewed semantic metric from `semantic-layer.json` when available.
- If only metadata hints exist, first inspect whether there are quantity, amount, order, or item fields.
- If both `quantity` and `sales_amount` exist, treat them as different measures: quantity ranking uses `SUM(quantity)`, sales ranking uses `SUM(sales_amount)`.
- If an `items` column contains colon-separated combinations, do not treat the full combination as the final single-item ranking. First explain the distinction, then use engine-supported string functions or ask for clarification.
- Do not repeatedly try unsupported SQL dialect functions. After one dialect/function failure, use `RepairSqlAttempt` and adapt to the reported engine capabilities.
