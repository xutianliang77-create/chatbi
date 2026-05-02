import { existsSync, readFileSync } from "node:fs";
import type { BeelinkConfig, SemanticEntity, SemanticMetric, SemanticSearchResult } from "./types";

interface SemanticLayerFile {
  metrics?: SemanticMetric[];
  entities?: SemanticEntity[];
}

export function searchSemanticLayer(
  config: Pick<BeelinkConfig, "semanticLayerPath" | "glossaryPath">,
  question: string,
  limit: number
): SemanticSearchResult {
  const layer = readSemanticLayer(config.semanticLayerPath);
  const metrics = rankMatches(layer.metrics ?? [], question, limit);
  const entities = rankMatches(layer.entities ?? [], question, limit);
  const glossaryExcerpt = readGlossaryExcerpt(config.glossaryPath);
  return {
    semanticLayerPath: config.semanticLayerPath,
    glossaryPath: config.glossaryPath,
    metrics,
    entities,
    ...(glossaryExcerpt ? { glossaryExcerpt } : {}),
  };
}

export function collectSemanticTerms(result: SemanticSearchResult): string[] {
  const terms = new Set<string>();
  for (const metric of result.metrics) {
    addTerm(terms, metric.name);
    addTerm(terms, metric.table);
    for (const alias of metric.aliases ?? []) addTerm(terms, alias);
    for (const dim of metric.dimensions ?? []) addTerm(terms, dim);
    for (const measure of metric.measures ?? []) addTerm(terms, measure.name);
  }
  for (const entity of result.entities) {
    addTerm(terms, entity.name);
    for (const alias of entity.aliases ?? []) addTerm(terms, alias);
    for (const table of entity.candidateTables ?? []) addTerm(terms, table);
  }
  return Array.from(terms).slice(0, 20);
}

function readSemanticLayer(filePath: string): SemanticLayerFile {
  if (!existsSync(filePath)) return {};
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  return {
    metrics: Array.isArray(record.metrics) ? record.metrics.filter(isSemanticMetric) : [],
    entities: Array.isArray(record.entities) ? record.entities.filter(isSemanticEntity) : [],
  };
}

function rankMatches<T extends { name: string; aliases?: string[] }>(
  items: T[],
  question: string,
  limit: number
): T[] {
  const q = question.toLowerCase();
  return items
    .map((item) => ({ item, score: scoreItem(item, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((entry) => entry.item);
}

function scoreItem(item: { name: string; aliases?: string[] }, question: string): number {
  let score = includes(question, item.name) ? 3 : 0;
  for (const alias of item.aliases ?? []) {
    if (includes(question, alias)) score += 2;
  }
  return score;
}

function includes(question: string, term: string): boolean {
  const normalized = term.trim().toLowerCase();
  return normalized.length > 0 && question.includes(normalized);
}

function readGlossaryExcerpt(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  const text = readFileSync(filePath, "utf8").trim();
  return text ? text.slice(0, 1200) : undefined;
}

function isSemanticMetric(value: unknown): value is SemanticMetric {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof (value as { name?: unknown }).name === "string";
}

function isSemanticEntity(value: unknown): value is SemanticEntity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof (value as { name?: unknown }).name === "string";
}

function addTerm(terms: Set<string>, value: string | undefined): void {
  if (value?.trim()) terms.add(value.trim());
}
