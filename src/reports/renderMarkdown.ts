import type { ReportArtifact } from "./types";

export function renderReportMarkdown(report: ReportArtifact): string {
  const lines: string[] = [
    `# ${report.title}`,
    "",
    "## 问题",
    report.question,
    "",
    "## 结论",
    ...markdownList(report.insights.map((insight) => insight.markdown), "暂无结论。"),
    "",
    "## 图表",
    ...markdownList(report.charts.map((chart) => `${chart.title} (${chart.chart.kind})`), "暂无图表。"),
    "",
    "## 数据",
    ...report.datasets.map((dataset) => `- ${dataset.name}: previewRows=${dataset.previewRows}, rowCount=${dataset.rowCount ?? "unknown"}`),
    "",
    "## SQL 和来源",
    ...markdownList(
      report.datasets
        .filter((dataset) => dataset.sql)
        .map((dataset) => `\`${dataset.name}\`: ${dataset.queryId ?? "no query id"}\n\n\`\`\`sql\n${dataset.sql}\n\`\`\``),
      "暂无 SQL。"
    ),
    "",
    "## 风险提示",
    ...markdownList(report.caveats.map((caveat) => `${caveat.code}: ${caveat.message}`), "暂无风险提示。"),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function markdownList(items: string[], empty: string): string[] {
  if (items.length === 0) return [empty];
  return items.map((item) => `- ${item}`);
}
