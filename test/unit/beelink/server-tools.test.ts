import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BeelinkMcpServer } from "../../../packages/beelink-mcp/src/server";
import { MetadataStore } from "../../../packages/beelink-mcp/src/metadataStore";
import type { BeelinkConfig, CatalogEntry, QueryPreview, TableColumn } from "../../../packages/beelink-mcp/src/types";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("beelink MCP server tool surface", () => {
  it("exposes cloud-aligned metadata tools", () => {
    const server = new BeelinkMcpServer(testConfig("/tmp/beelink-server-tools"), new FakeClient() as never);

    const names = server.listTools().map((tool) => tool.name);

    expect(names).toContain("RunSemanticSearch");
    expect(names).toContain("GetUsefulSystemTableNames");
    expect(names).toContain("GetDescriptionOfTableOrSchema");
    expect(names).toContain("GetTableOrViewLineage");
  });

  it("returns useful system table guidance without calling upstream", async () => {
    const server = new BeelinkMcpServer(testConfig("/tmp/beelink-server-tools"), new FakeClient() as never);

    const result = await server.callTool("GetUsefulSystemTableNames", {});
    const text = result.content[0]?.text ?? "";

    expect(result.isError).toBeUndefined();
    expect(text).toContain("INFORMATION_SCHEMA.TABLES");
    expect(text).toContain("sys.jobs");
    expect(text).toContain("permission");
  });

  it("runs semantic search against semantic files and local metadata", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "beelink-server-tools-"));
    tempDirs.push(dir);
    const config = testConfig(dir);
    await writeFile(
      config.semanticLayerPath,
      JSON.stringify({
        entities: [{ name: "食物", aliases: ["食品"], candidateTables: ["@x.food_daily"] }],
      }),
      "utf8"
    );
    await writeFile(config.glossaryPath, "食物表用于分析每日菜品销量。", "utf8");
    const store = new MetadataStore(config.metadataDbPath);
    store.upsertCatalogObjects([{ name: "food_daily", path: "@x.food_daily", type: "table" }]);
    store.replaceColumns("@x.food_daily", [{ name: "E", type: "VARCHAR", businessName: "items" }]);
    store.close();

    const server = new BeelinkMcpServer(config, new FakeClient() as never);
    const result = await server.callTool("RunSemanticSearch", { query: "食物销量", limit: 10 });
    const text = result.content[0]?.text ?? "";

    expect(result.isError).toBeUndefined();
    expect(text).toContain("Semantic search");
    expect(text).toContain("食物");
    expect(text).toContain("@x.food_daily");
    expect(text).toContain("items");
  });

  it("returns local object descriptions with business column hints", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "beelink-server-tools-"));
    tempDirs.push(dir);
    const config = testConfig(dir);
    const store = new MetadataStore(config.metadataDbPath);
    store.upsertCatalogObjects([{ name: "food_daily", path: "@x.food_daily", type: "table" }]);
    store.replaceColumns("@x.food_daily", [
      { name: "E", type: "VARCHAR", businessName: "items", sampleValues: ["Bread", "Steak"] },
    ]);
    store.close();

    const server = new BeelinkMcpServer(config, new FakeClient() as never);
    const result = await server.callTool("GetDescriptionOfTableOrSchema", { path: "@x.food_daily" });
    const text = result.content[0]?.text ?? "";

    expect(result.isError).toBeUndefined();
    expect(text).toContain("Object description");
    expect(text).toContain("@x.food_daily");
    expect(text).toContain("items");
    expect(text).toContain("Bread");
  });

  it("returns an explicit lineage caveat instead of inventing edges", async () => {
    const server = new BeelinkMcpServer(testConfig("/tmp/beelink-server-tools"), new FakeClient() as never);

    const result = await server.callTool("GetTableOrViewLineage", { path: "@x.food_daily" });
    const text = result.content[0]?.text ?? "";

    expect(result.isError).toBeUndefined();
    expect(text).toContain("Table/view lineage");
    expect(text).toContain("none recorded");
    expect(text).toContain("Do not infer");
  });
});

class FakeClient {
  async searchCatalog(): Promise<CatalogEntry[]> {
    throw new Error("unexpected upstream call");
  }

  async getSchemaOfTable(): Promise<{ path: string; columns: TableColumn[] }> {
    throw new Error("unexpected schema call");
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
    metadataDbPath: path.join(dir, "metadata.db"),
    semanticLayerPath: path.join(dir, "semantic-layer.json"),
    glossaryPath: path.join(dir, "glossary.md"),
  };
}
