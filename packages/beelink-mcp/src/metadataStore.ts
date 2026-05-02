import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { CatalogEntry, MetadataSearchResult, MetadataTableProfile, TableColumn } from "./types";

export class MetadataStore {
  private readonly db: Database.Database;

  constructor(readonly dbPath: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  upsertCatalogObjects(entries: CatalogEntry[], syncedAt: number = Date.now()): number {
    const stmt = this.db.prepare(
      `INSERT INTO catalog_objects(path, name, type, parent_path, last_synced_at, permission_status)
       VALUES (@path, @name, @type, @parentPath, @lastSyncedAt, @permissionStatus)
       ON CONFLICT(path) DO UPDATE SET
         name = excluded.name,
         type = excluded.type,
         parent_path = excluded.parent_path,
         last_synced_at = excluded.last_synced_at,
         permission_status = excluded.permission_status`
    );
    const tx = this.db.transaction((items: CatalogEntry[]) => {
      for (const entry of items) {
        stmt.run({
          path: entry.path,
          name: entry.name,
          type: entry.type,
          parentPath: parentPath(entry.path),
          lastSyncedAt: syncedAt,
          permissionStatus: "ok",
        });
      }
    });
    tx(entries);
    return entries.length;
  }

  replaceColumns(objectPath: string, columns: TableColumn[], syncedAt: number = Date.now()): number {
    const existing = this.readColumnHints(objectPath);
    const deleteStmt = this.db.prepare("DELETE FROM table_columns WHERE object_path = ?");
    const insertStmt = this.db.prepare(
      `INSERT INTO table_columns(
         object_path, column_name, data_type, nullable, ordinal, description,
         business_name, sample_values_json, header_confidence, last_synced_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      deleteStmt.run(objectPath);
      columns.forEach((column, index) => {
        const hint = existing.get(column.name);
        insertStmt.run(
          objectPath,
          column.name,
          column.type,
          column.nullable === undefined ? null : column.nullable ? 1 : 0,
          index,
          column.description ?? null,
          column.businessName ?? hint?.businessName ?? null,
          column.sampleValues
            ? JSON.stringify(column.sampleValues.slice(0, 5))
            : hint?.sampleValuesJson ?? null,
          column.headerConfidence ?? hint?.headerConfidence ?? null,
          syncedAt
        );
      });
    });
    tx();
    return columns.length;
  }

  updateColumnHints(objectPath: string, columns: TableColumn[], syncedAt: number = Date.now()): number {
    const stmt = this.db.prepare(
      `UPDATE table_columns
       SET business_name = ?,
           sample_values_json = ?,
           header_confidence = ?,
           last_synced_at = ?
       WHERE object_path = ? AND column_name = ?`
    );
    const tx = this.db.transaction(() => {
      for (const column of columns) {
        stmt.run(
          column.businessName ?? null,
          column.sampleValues ? JSON.stringify(column.sampleValues.slice(0, 5)) : null,
          column.headerConfidence ?? null,
          syncedAt,
          objectPath,
          column.name
        );
      }
    });
    tx();
    return columns.filter((column) => column.businessName || column.sampleValues?.length).length;
  }

  search(query: string, limit: number): MetadataSearchResult {
    const like = `%${query.trim().toLowerCase()}%`;
    const objectRows = this.db
      .prepare(
        `SELECT name, path, type
         FROM catalog_objects
         WHERE lower(path) LIKE ? OR lower(name) LIKE ?
         ORDER BY
           CASE WHEN lower(name) = lower(?) THEN 0 ELSE 1 END,
           path
         LIMIT ?`
      )
      .all(like, like, query.trim(), limit) as Array<{
      name: string;
      path: string;
      type: CatalogEntry["type"];
    }>;
    const columnRows = this.db
      .prepare(
        `SELECT object_path AS objectPath,
                column_name AS columnName,
                data_type AS dataType,
                nullable,
                description,
                business_name AS businessName,
                sample_values_json AS sampleValuesJson,
                header_confidence AS headerConfidence
         FROM table_columns
         WHERE lower(object_path) LIKE ?
            OR lower(column_name) LIKE ?
            OR lower(description) LIKE ?
            OR lower(business_name) LIKE ?
            OR lower(sample_values_json) LIKE ?
         ORDER BY object_path, ordinal
         LIMIT ?`
      )
      .all(like, like, like, like, like, limit) as Array<{
      objectPath: string;
      columnName: string;
      dataType: string;
      nullable: number | null;
      description: string | null;
      businessName: string | null;
      sampleValuesJson: string | null;
      headerConfidence: number | null;
    }>;

    return {
      dbPath: this.dbPath,
      objects: objectRows.map((row) => ({ name: row.name, path: row.path, type: row.type })),
      columns: columnRows.map((row) => ({
        objectPath: row.objectPath,
        columnName: row.columnName,
        dataType: row.dataType,
        ...(row.nullable === null ? {} : { nullable: row.nullable === 1 }),
        ...(row.description ? { description: row.description } : {}),
        ...(row.businessName ? { businessName: row.businessName } : {}),
        ...(row.sampleValuesJson ? { sampleValues: parseJsonArray(row.sampleValuesJson) } : {}),
        ...(typeof row.headerConfidence === "number" ? { headerConfidence: row.headerConfidence } : {}),
      })),
    };
  }

  listTableProfiles(limit: number = 50): MetadataTableProfile[] {
    const tableRows = this.db
      .prepare(
        `SELECT name, path, type
         FROM catalog_objects
         WHERE type IN ('table', 'view')
         ORDER BY path
         LIMIT ?`
      )
      .all(limit) as Array<{
      name: string;
      path: string;
      type: CatalogEntry["type"];
    }>;
    const columnStmt = this.db.prepare(
      `SELECT column_name AS columnName,
              data_type AS dataType,
              business_name AS businessName,
              sample_values_json AS sampleValuesJson
       FROM table_columns
       WHERE object_path = ?
       ORDER BY ordinal`
    );
    return tableRows.map((table) => {
      const columns = columnStmt.all(table.path) as Array<{
        columnName: string;
        dataType: string;
        businessName: string | null;
        sampleValuesJson: string | null;
      }>;
      return {
        name: table.name,
        path: table.path,
        type: table.type,
        columns: columns.map((column) => ({
          columnName: column.columnName,
          dataType: column.dataType,
          ...(column.businessName ? { businessName: column.businessName } : {}),
          ...(column.sampleValuesJson ? { sampleValues: parseJsonArray(column.sampleValuesJson) } : {}),
        })),
      };
    });
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS catalog_objects (
        path TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_path TEXT,
        last_synced_at INTEGER NOT NULL,
        permission_status TEXT NOT NULL DEFAULT 'unknown'
      );

      CREATE INDEX IF NOT EXISTS idx_catalog_objects_parent
        ON catalog_objects(parent_path);

      CREATE INDEX IF NOT EXISTS idx_catalog_objects_name
        ON catalog_objects(name);

      CREATE TABLE IF NOT EXISTS table_columns (
        object_path TEXT NOT NULL,
        column_name TEXT NOT NULL,
        data_type TEXT NOT NULL,
        nullable INTEGER,
        ordinal INTEGER NOT NULL,
        description TEXT,
        business_name TEXT,
        sample_values_json TEXT,
        header_confidence REAL,
        semantic_tags TEXT,
        last_synced_at INTEGER NOT NULL,
        PRIMARY KEY (object_path, column_name)
      );

      CREATE INDEX IF NOT EXISTS idx_table_columns_name
        ON table_columns(column_name);
    `);
    this.ensureColumn("table_columns", "business_name", "TEXT");
    this.ensureColumn("table_columns", "sample_values_json", "TEXT");
    this.ensureColumn("table_columns", "header_confidence", "REAL");
  }

  private ensureColumn(table: string, column: string, type: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (rows.some((row) => row.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }

  private readColumnHints(objectPath: string): Map<
    string,
    { businessName: string | null; sampleValuesJson: string | null; headerConfidence: number | null }
  > {
    const rows = this.db
      .prepare(
        `SELECT column_name AS columnName,
                business_name AS businessName,
                sample_values_json AS sampleValuesJson,
                header_confidence AS headerConfidence
         FROM table_columns
         WHERE object_path = ?`
      )
      .all(objectPath) as Array<{
      columnName: string;
      businessName: string | null;
      sampleValuesJson: string | null;
      headerConfidence: number | null;
    }>;
    return new Map(rows.map((row) => [row.columnName, row]));
  }
}

function parentPath(value: string): string | null {
  const index = value.lastIndexOf(".");
  return index > 0 ? value.slice(0, index) : null;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
