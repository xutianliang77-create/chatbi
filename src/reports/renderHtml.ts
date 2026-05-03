import { renderEChartsRuntimeScript, type EChartsRuntimeOptions } from "../charts/htmlRuntime";
import { renderReportMarkdown } from "./renderMarkdown";
import type { ReportArtifact } from "./types";

export interface RenderReportHtmlOptions {
  echarts?: EChartsRuntimeOptions;
}

export function renderReportHtml(report: ReportArtifact, options: RenderReportHtmlOptions = {}): string {
  const markdown = renderReportMarkdown(report);
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(report.title)}</title>`,
    "<style>",
    "body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:32px;line-height:1.6;color:#172026;background:#f7f3ea}",
    "main{max-width:1040px;margin:0 auto;background:#fff;padding:32px;border-radius:18px;box-shadow:0 16px 50px rgba(31,40,51,.10)}",
    "pre{white-space:pre-wrap;background:#111827;color:#f9fafb;padding:16px;border-radius:12px;overflow:auto}",
    ".card{border:1px solid #e5e7eb;border-radius:14px;padding:16px;margin:16px 0;background:#fffaf0}",
    ".muted{color:#6b7280}",
    "</style>",
    renderEChartsRuntimeScript(options.echarts),
    "</head>",
    "<body><main>",
    `<h1>${escapeHtml(report.title)}</h1>`,
    `<p class="muted">${escapeHtml(report.question)}</p>`,
    `<section><h2>结论</h2>${renderInsightList(report)}</section>`,
    `<section><h2>图表</h2>${renderChartCards(report)}</section>`,
    `<section><h2>数据</h2>${renderDatasetCards(report)}</section>`,
    `<section><h2>风险提示</h2>${renderCaveats(report)}</section>`,
    "<details><summary>Markdown 原文</summary>",
    `<pre>${escapeHtml(markdown)}</pre>`,
    "</details>",
    "</main></body></html>",
  ].join("\n");
}

function renderInsightList(report: ReportArtifact): string {
  if (report.insights.length === 0) return "<p>暂无结论。</p>";
  return `<ul>${report.insights.map((insight) => `<li>${escapeHtml(insight.markdown)}</li>`).join("")}</ul>`;
}

function renderChartCards(report: ReportArtifact): string {
  if (report.charts.length === 0) return "<p>暂无图表。</p>";
  return report.charts
    .map((chart) => {
      const refs = [chart.imageArtifact, chart.htmlArtifact, chart.chartArgsArtifact]
        .filter(Boolean)
        .map((ref) => `<a href="${escapeHtmlAttr(ref!.path)}">${escapeHtml(ref!.kind)}</a>`)
        .join(" · ");
      return `<article class="card"><h3>${escapeHtml(chart.title)}</h3><p>${escapeHtml(chart.chart.kind)}</p><p>${refs || "暂无图表 artifact。"}</p></article>`;
    })
    .join("");
}

function renderDatasetCards(report: ReportArtifact): string {
  return report.datasets
    .map((dataset) => `<article class="card"><h3>${escapeHtml(dataset.name)}</h3><p>previewRows=${dataset.previewRows}, rowCount=${escapeHtml(String(dataset.rowCount ?? "unknown"))}</p>${dataset.sql ? `<pre>${escapeHtml(dataset.sql)}</pre>` : ""}</article>`)
    .join("");
}

function renderCaveats(report: ReportArtifact): string {
  if (report.caveats.length === 0) return "<p>暂无风险提示。</p>";
  return `<ul>${report.caveats.map((caveat) => `<li>${escapeHtml(caveat.code)}: ${escapeHtml(caveat.message)}</li>`).join("")}</ul>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
