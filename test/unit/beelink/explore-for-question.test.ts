import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exploreForQuestion } from "../../../packages/beelink-mcp/src/exploreForQuestion";
import { MetadataStore } from "../../../packages/beelink-mcp/src/metadataStore";
import type { BeelinkConfig, CatalogEntry, QueryPreview, TableColumn } from "../../../packages/beelink-mcp/src/types";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("beelink ExploreForQuestion", () => {
  it("combines semantic candidates and local metadata without probing upstream", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "beelink-explore-"));
    tempDirs.push(dir);
    const config = testConfig(dir);
    await writeFile(
      config.semanticLayerPath,
      JSON.stringify({
        entities: [{ name: "食物", aliases: ["食品"], candidateTables: ["@x.food_daily"] }],
      }),
      "utf8"
    );
    const store = new MetadataStore(config.metadataDbPath);
    store.upsertCatalogObjects([{ name: "food_daily", path: "@x.food_daily", type: "table" }]);
    store.replaceColumns("@x.food_daily", [{ name: "food_name", type: "VARCHAR" }]);
    store.close();

    const result = await exploreForQuestion(new FakeClient(), config, {
      question: "告诉我食物的名字",
      probeIfEmpty: true,
    });

    expect(result.semantic.entities.map((entity) => entity.name)).toEqual(["食物"]);
    expect(result.metadata.objects.map((object) => object.path)).toContain("@x.food_daily");
    expect(result.metadata.columns.map((column) => column.columnName)).toContain("food_name");
    expect(result.upstreamProbe).toBeUndefined();
  });
});

class FakeClient {
  async searchCatalog(): Promise<CatalogEntry[]> {
    throw new Error("should not probe upstream when local metadata exists");
  }

  async getSchemaOfTable(): Promise<{ path: string; columns: TableColumn[] }> {
    throw new Error("should not fetch schema when local metadata exists");
  }

  async listCatalogEntries(): Promise<CatalogEntry[]> {
    return [];
  }

  async runSqlQuery(): Promise<QueryPreview> {
    throw new Error("not implemented");
  }
}

function testConfig(dir: string): BeelinkConfig {
  return {
    baseUrl: "http://localhost:9047",
    username: "x",
    password: "x",
    timeoutMs: 1000,
    previewRows: 5,
    maxPreviewRows: 50,
    artifactsRoot: path.join(dir, "artifacts"),
    exportMaxRows: 5000,
    exportPageRows: 500,
    metadataDbPath: path.join(dir, "metadata.db"),
    semanticLayerPath: path.join(dir, "semantic-layer.json"),
    glossaryPath: path.join(dir, "glossary.md"),
  };
}
