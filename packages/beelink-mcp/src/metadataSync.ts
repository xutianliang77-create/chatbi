import { MetadataStore } from "./metadataStore";
import { inferHeaderHints } from "./headerInference";
import { initSemanticLayerDraft } from "./semanticDraft";
import type { BeelinkPlatformClient } from "./platformClient";
import type { BeelinkConfig, MetadataSyncResult } from "./types";

export async function syncMetadataIndex(
  client: BeelinkPlatformClient,
  config: Pick<BeelinkConfig, "metadataDbPath" | "semanticLayerPath" | "glossaryPath">,
  input: { paths?: string[]; maxDepth?: number; limitPerNode?: number }
): Promise<MetadataSyncResult> {
  const dbPath = config.metadataDbPath;
  const store = new MetadataStore(dbPath);
  try {
    const roots = input.paths && input.paths.length > 0 ? input.paths : [undefined];
    const maxDepth = clamp(input.maxDepth ?? 2, 0, 5);
    const limitPerNode = clamp(input.limitPerNode ?? 100, 1, 500);
    let scannedObjects = 0;
    let syncedObjects = 0;
    let syncedColumns = 0;
    let inferredHeaders = 0;
    const queue = roots.map((root) => ({ path: root, depth: 0 }));
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const visitKey = current.path ?? "<root>";
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);

      const entries = await client.listCatalogEntries({ path: current.path, limit: limitPerNode });
      scannedObjects += entries.length;
      syncedObjects += store.upsertCatalogObjects(entries);

      for (const entry of entries) {
        if ((entry.type === "table" || entry.type === "view") && !visited.has(`schema:${entry.path}`)) {
          visited.add(`schema:${entry.path}`);
          try {
            const schema = await client.getSchemaOfTable(entry.path);
            syncedColumns += store.replaceColumns(schema.path, schema.columns);
            try {
              const hintedColumns = await inferHeaderHints(client, schema.path, schema.columns, { timeoutMs: 10_000 });
              inferredHeaders += store.updateColumnHints(schema.path, hintedColumns);
            } catch {
              // Header inference is best-effort; schema sync should still succeed without samples.
            }
          } catch {
            // Permission or unsupported metadata endpoints should not abort the whole sync.
          }
        }
        if (current.depth < maxDepth && canHaveChildren(entry.type)) {
          queue.push({ path: entry.path, depth: current.depth + 1 });
        }
      }
    }

    const semanticDraft = initSemanticLayerDraft(config, store.listTableProfiles());
    return { dbPath, scannedObjects, syncedObjects, syncedColumns, inferredHeaders, semanticDraft };
  } finally {
    store.close();
  }
}

function canHaveChildren(type: string): boolean {
  return type === "source" || type === "space" || type === "folder" || type === "schema" || type === "unknown";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}
