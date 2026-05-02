import type {
  CatalogEntry,
  ExploreForQuestionResult,
  MetadataSearchResult,
  MetadataSyncResult,
  InitSemanticLayerResult,
  QueryPreview,
  SemanticEntity,
  SemanticMetric,
  SqlGuidanceResult,
  SqlRepairResult,
  SqlRuleCheckResult,
  TableColumn,
} from "./types";

export function formatCatalog(entries: CatalogEntry[]): string {
  if (entries.length === 0) return "No catalog entries found.";
  return entries.map((entry) => `- ${entry.path} [${entry.type}]`).join("\n");
}

export function formatSchema(path: string, columns: TableColumn[]): string {
  if (columns.length === 0) return `Schema for ${path}: no columns returned.`;
  return [
    `Schema for ${path}`,
    "",
    "| column | type | nullable |",
    "| --- | --- | --- |",
    ...columns.map((c) => `| ${escapeCell(c.name)} | ${escapeCell(c.type)} | ${c.nullable ?? ""} |`),
  ].join("\n");
}

export function formatQueryPreview(preview: QueryPreview): string {
  const lines = [
    `Query preview rows: ${preview.rows.length}`,
    `Truncated: ${preview.truncated ? "yes" : "no"}`,
    ...(typeof preview.rowCount === "number" ? [`Row count: ${preview.rowCount}`] : []),
    `Query id: ${preview.queryId}`,
  ];
  if (preview.rows.length === 0) return lines.join("\n");
  const columns = preview.columns.length > 0 ? preview.columns.map((c) => c.name) : Object.keys(preview.rows[0] ?? {});
  lines.push("", `| ${columns.map(escapeCell).join(" | ")} |`);
  lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of preview.rows) {
    lines.push(`| ${columns.map((name) => escapeCell(stringifyCell(row[name]))).join(" | ")} |`);
  }
  return lines.join("\n");
}

export function formatMetadataSync(result: MetadataSyncResult): string {
  return [
    "Metadata sync complete",
    `db: ${result.dbPath}`,
    `scanned-objects: ${result.scannedObjects}`,
    `synced-objects: ${result.syncedObjects}`,
    `synced-columns: ${result.syncedColumns}`,
    `inferred-headers: ${result.inferredHeaders}`,
    ...(result.semanticDraft
      ? [
          `semantic-layer-created: ${result.semanticDraft.semanticLayerCreated ? "yes" : "no"}`,
          `glossary-created: ${result.semanticDraft.glossaryCreated ? "yes" : "no"}`,
          `semantic-layer: ${result.semanticDraft.semanticLayerPath}`,
          `glossary: ${result.semanticDraft.glossaryPath}`,
        ]
      : []),
  ].join("\n");
}

export function formatInitSemanticLayer(result: InitSemanticLayerResult): string {
  return [
    "Semantic layer draft",
    `semantic-layer: ${result.semanticLayerPath}`,
    `glossary: ${result.glossaryPath}`,
    `semantic-layer-created: ${result.semanticLayerCreated ? "yes" : "no"}`,
    `glossary-created: ${result.glossaryCreated ? "yes" : "no"}`,
    `tables: ${result.tableCount}`,
    `metrics: ${result.metricCount}`,
    `entities: ${result.entityCount}`,
  ].join("\n");
}

export function formatMetadataSearch(result: MetadataSearchResult): string {
  const lines = [`Metadata index: ${result.dbPath}`];
  lines.push("", "Objects:");
  if (result.objects.length === 0) {
    lines.push("- none");
  } else {
    lines.push(...result.objects.map((entry) => `- ${entry.path} [${entry.type}]`));
  }

  lines.push("", "Columns:");
  if (result.columns.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      "| table | column | business | type | samples | nullable |",
      "| --- | --- | --- | --- | --- | --- |",
      ...result.columns.map(
        (column) =>
          `| ${escapeCell(column.objectPath)} | ${escapeCell(column.columnName)} | ${escapeCell(
            column.businessName ?? ""
          )} | ${escapeCell(column.dataType)} | ${escapeCell((column.sampleValues ?? []).join(", "))} | ${
            column.nullable ?? ""
          } |`
      )
    );
  }
  return lines.join("\n");
}

export function formatExploreForQuestion(result: ExploreForQuestionResult): string {
  const lines = [
    `Question: ${result.question}`,
    `Metadata index: ${result.metadata.dbPath}`,
    `Semantic layer: ${result.semantic.semanticLayerPath}`,
    `Glossary: ${result.semantic.glossaryPath}`,
  ];

  lines.push("", "Semantic metrics:");
  lines.push(
    result.semantic.metrics.length === 0
      ? "- none"
      : result.semantic.metrics.map(formatMetric).join("\n")
  );

  lines.push("", "Semantic entities:");
  lines.push(
    result.semantic.entities.length === 0
      ? "- none"
      : result.semantic.entities.map(formatEntity).join("\n")
  );

  if (result.semantic.glossaryExcerpt) {
    lines.push("", "Glossary excerpt:", result.semantic.glossaryExcerpt);
  }

  lines.push("", formatMetadataSearch(result.metadata));

  if (result.upstreamProbe) {
    lines.push(
      "",
      "Upstream probe:",
      `attempted: ${result.upstreamProbe.attempted ? "yes" : "no"}`,
      result.upstreamProbe.entries.length === 0
        ? "entries: none"
        : ["entries:", ...result.upstreamProbe.entries.map((entry) => `- ${entry.path} [${entry.type}]`)].join("\n")
    );
  }

  lines.push(
    "",
    "Next step: use the semantic matches and metadata candidates to draft read-only SQL, then call PrepareSqlReference and RunSqlQuery."
  );
  return lines.join("\n");
}

export function formatSqlGuidance(result: SqlGuidanceResult): string {
  const lines = [
    "SQL guidance",
    "",
    "Question:",
    result.question,
    "",
    "Context:",
    formatExploreForQuestion(result.exploration),
    "",
    "Rules:",
    ...result.rules.map((rule) => `- ${rule}`),
  ];
  return lines.join("\n");
}

export function formatSqlRuleCheck(result: SqlRuleCheckResult): string {
  const lines = ["SQL rule check", "", "Errors:"];
  lines.push(result.errors.length === 0 ? "- none" : result.errors.map((error) => `- ${error}`).join("\n"));
  lines.push("", "Warnings:");
  lines.push(result.warnings.length === 0 ? "- none" : result.warnings.map((warning) => `- ${warning}`).join("\n"));
  lines.push("", "Suggested fixes:");
  lines.push(
    result.suggestedFixes.length === 0
      ? "- none"
      : result.suggestedFixes.map((fix) => `- ${fix}`).join("\n")
  );
  return lines.join("\n");
}

export function formatSqlRepair(result: SqlRepairResult): string {
  const lines = [
    "SQL repair attempt",
    "",
    `category: ${result.category}`,
    `error: ${result.error}`,
  ];
  if (result.repairedSql) {
    lines.push("", "Repaired SQL candidate:", "```sql", result.repairedSql, "```");
  }
  lines.push("", formatSqlRuleCheck(result.ruleCheck));
  lines.push("", "Suggested actions:");
  lines.push(...result.suggestedActions.map((action) => `- ${action}`));
  if (result.exploration) {
    lines.push("", "Supplemental exploration:", formatExploreForQuestion(result.exploration));
  }
  return lines.join("\n");
}

function formatMetric(metric: SemanticMetric): string {
  const parts = [`- ${metric.name}`];
  if (metric.table) parts.push(`table=${metric.table}`);
  if (metric.dimensions?.length) parts.push(`dimensions=${metric.dimensions.join(", ")}`);
  if (metric.measures?.length) {
    parts.push(`measures=${metric.measures.map((m) => `${m.name}:${m.expression}`).join(", ")}`);
  }
  if (metric.defaultOrderBy) parts.push(`order=${metric.defaultOrderBy}`);
  return parts.join(" | ");
}

function formatEntity(entity: SemanticEntity): string {
  const parts = [`- ${entity.name}`];
  if (entity.candidateTables?.length) parts.push(`tables=${entity.candidateTables.join(", ")}`);
  return parts.join(" | ");
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
