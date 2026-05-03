# Beelink MCP

Beelink is a standard stdio MCP server for catalog exploration and read-only SQL preview. It is intentionally separate from CodeClaw's `QueryEngine`; CodeClaw discovers it through the existing MCP bridge.

## Configure

Add this to `~/.codeclaw/mcp.json` or `<workspace>/.mcp.json`:

```json
{
  "servers": {
    "beelink": {
      "command": "npm",
      "args": ["run", "beelink:mcp"],
      "cwd": "/Users/xutianliang/Downloads/codeclaw",
      "env": {
        "BEELINK_BASE_URL": "http://localhost:9047",
        "BEELINK_USERNAME": "x",
        "BEELINK_PASSWORD": "your-password",
        "BEELINK_PREVIEW_ROWS": "5",
        "BEELINK_MAX_PREVIEW_ROWS": "50",
        "BEELINK_TIMEOUT_MS": "30000",
        "BEELINK_METADATA_DB": "/optional/metadata.db",
        "BEELINK_SEMANTIC_LAYER": "/optional/semantic-layer.json",
        "BEELINK_GLOSSARY": "/optional/glossary.md"
      }
    }
  }
}
```

## Tools

- `ListCatalogEntries`: list root catalog entries or children under a path.
- `GetSchemaOfTable`: return normalized columns for a table or view.
- `GetDescriptionOfTableOrSchema`: return synced/live wiki descriptions, labels, business names, samples, and permission caveats.
- `GetTableOrViewLineage`: return synced/live upstream/downstream lineage when available, or an explicit caveat when unavailable.
- `PrepareSqlReference`: quote special path segments such as `@x.food_daily` into `"@x".food_daily`.
- `SyncMetadataIndex`: sync catalog objects and schemas into the local project metadata index.
- `InitSemanticLayer`: create draft `semantic-layer.json` and `glossary.md` from local metadata hints without overwriting existing files.
- `SearchMetadataIndex`: search local metadata before asking the upstream platform again.
- `RunSemanticSearch`: browse semantic layer, glossary, local metadata, and optional upstream candidates with natural language.
- `ExploreForQuestion`: build SQL-planning context from semantic layer, local metadata, and optional upstream probe.
- `GetUsefulSystemTableNames`: list useful `INFORMATION_SCHEMA` and `sys` tables plus permission caveats.
- `BuildSqlGuidance`: build SQL-writing context and rules for the LLM without generating SQL.
- `CheckSqlAgainstRules`: check generated SQL for obvious safety, quoting, preview, and aggregation issues.
- `RepairSqlAttempt`: classify a failed SQL attempt and suggest repair actions, with optional supplemental exploration.
- `RunSqlQuery`: execute one read-only SQL statement and return a bounded preview.

## Metadata Index

Beelink keeps data metadata outside CodeClaw's global `data.db`. The default index is project-scoped:

```text
~/.codeclaw/projects/<workspace-hash>/beelink/metadata.db
~/.codeclaw/projects/<workspace-hash>/beelink/semantic-layer.json
~/.codeclaw/projects/<workspace-hash>/beelink/glossary.md
```

Override it with `BEELINK_METADATA_DB` when you need an explicit path for testing or deployment.
Override semantic files with `BEELINK_SEMANTIC_LAYER` and `BEELINK_GLOSSARY`.

The index currently stores:

- `catalog_objects`: object path, name, type, parent path, sync time, and permission status.
- `table_columns`: table/view path, column name, type, nullable flag, ordinal, description, and sync time.
- Collaboration metadata: upstream object id/tag, wiki text, labels, and collaboration versions when available.
- `lineage_edges`: upstream/downstream lineage edges discovered from the upstream graph endpoint when available.
- Header/sample hints: when a table appears to use physical columns such as `A-K` and the first row looks like headers, sync records `business_name`, sample values, and header confidence.

Upstream metadata endpoints used by Beelink:

- `GET /api/v3/catalog/{object-id}/collaboration/wiki` for wiki/description text.
- `GET /api/v3/catalog/{object-id}/collaboration/tag` for labels/tags.
- `GET /api/v3/catalog/{object-id}/graph` for table/view lineage when supported by the upstream edition and permissions.

All three are best-effort. Permission errors or unsupported endpoints do not fail `SyncMetadataIndex`; Beelink returns cached metadata or a clear caveat instead.

Recommended LLM flow:

1. Call `RunSemanticSearch` when the user is browsing data or asking which datasets may answer a question.
2. Use `GetDescriptionOfTableOrSchema` on the selected table/schema before generating SQL.
3. Use `BuildSqlGuidance` before writing SQL; it includes semantic context, candidate SQL references, candidate fields, rules, and retry guidance.
4. Use `CheckSqlAgainstRules` before execution.
5. Run read-only SQL through `RunSqlQuery` and summarize only from the preview.

Specialized helper tools remain available:

- `ExploreForQuestion`: lower-level exploration used by `BuildSqlGuidance`.
- `GetSchemaOfTable`: quick schema-only lookup when descriptions/samples are not needed.
- `GetTableOrViewLineage`: lineage/join-path questions; do not infer lineage when the tool says none is recorded.
- `GetUsefulSystemTableNames`: metadata, jobs, permission, and operational questions.
- `PrepareSqlReference`: direct path quoting helper for special catalog paths.
- `RepairSqlAttempt`: SQL execution failure repair with the failed SQL, error message, and original question.

Example `semantic-layer.json`:

```json
{
  "metrics": [
    {
      "name": "最畅销商品",
      "aliases": ["卖得最好", "销量最高"],
      "table": "@x.food_daily",
      "dimensions": ["food_name"],
      "measures": [{ "name": "销量", "expression": "SUM(quantity)" }],
      "defaultOrderBy": "SUM(quantity) DESC"
    }
  ],
  "entities": [
    {
      "name": "食物",
      "aliases": ["菜品", "食品"],
      "candidateTables": ["@x.food_daily"]
    }
  ]
}
```

`SyncMetadataIndex` also initializes draft semantic files when missing. The generated drafts are intentionally conservative and should be reviewed before they are treated as business truth.

## Knowledge Base TODO

Beelink's semantic files are the handoff point for the future CodeClaw knowledge base:

- Beelink writes `metadata.db`, `semantic-layer.json`, and `glossary.md`.
- CodeClaw's main knowledge-base layer should later ingest reviewed semantic files as data-domain knowledge.
- The main conversation flow should keep owning memory, transcript context, context compression, and LLM prompting.
- Beelink should remain a standard MCP server and should not become a second QueryEngine.
- Retrieval should prefer curated KB entries first, then local beelink metadata, then live upstream probing when metadata is missing or stale.

## Examples

```text
/mcp tools beelink
/mcp call beelink ListCatalogEntries {"path":"@x","limit":20}
/mcp call beelink GetSchemaOfTable {"path":"@x.food_daily"}
/mcp call beelink GetDescriptionOfTableOrSchema {"path":"@x.food_daily"}
/mcp call beelink GetTableOrViewLineage {"path":"@x.food_daily"}
/mcp call beelink PrepareSqlReference {"path":"@x.food_daily"}
/mcp call beelink SyncMetadataIndex {"paths":["@x"],"maxDepth":2,"limitPerNode":100}
/mcp call beelink InitSemanticLayer {"limit":50}
/mcp call beelink SearchMetadataIndex {"query":"food","limit":10}
/mcp call beelink SearchMetadataIndex {"query":"items","limit":10}
/mcp call beelink RunSemanticSearch {"query":"分析食物表里面什么东西最畅销","limit":10,"probeIfEmpty":true}
/mcp call beelink ExploreForQuestion {"question":"分析食物表里面什么东西最畅销","limit":10,"probeIfEmpty":true}
/mcp call beelink GetUsefulSystemTableNames {}
/mcp call beelink BuildSqlGuidance {"question":"分析食物表里面什么东西最畅销","limit":10,"probeIfEmpty":true}
/mcp call beelink CheckSqlAgainstRules {"sql":"select food_name, sum(quantity) from @x.food_daily order by sum(quantity) desc"}
/mcp call beelink RepairSqlAttempt {"sql":"select food_name, sum(quantity) from @x.food_daily order by sum(quantity) desc","error":"Lexical error: Encountered @","question":"分析食物表里面什么东西最畅销"}
/mcp call beelink RunSqlQuery {"sql":"select * from \"@x\".food_daily limit 5","previewRows":5}
```
