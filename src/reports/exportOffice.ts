import { readFile } from "node:fs/promises";

import { reportChartKind, reportDatasetColumns, reportDatasetPreviewRows, reportDatasetRows } from "./compat";
import type { ReportArtifact, ReportChart, ReportDataset } from "./types";
import { createStoredZip } from "../office/ooxmlZip";

interface ExportImage {
  chartId: string;
  title: string;
  data: Buffer;
  fileName: string;
}

export async function renderReportDocx(report: ReportArtifact): Promise<Buffer> {
  const images = await loadChartImages(report.charts);
  return createStoredZip([
    { path: "[Content_Types].xml", data: docxContentTypes(images.length > 0) },
    { path: "_rels/.rels", data: packageRels("word/document.xml") },
    ...(images.length > 0 ? [{ path: "word/_rels/document.xml.rels", data: documentRels(images) }] : []),
    { path: "word/document.xml", data: documentXml(report, images) },
    ...images.map((image) => ({ path: `word/media/${image.fileName}`, data: image.data })),
  ]);
}

export async function renderReportPptx(report: ReportArtifact): Promise<Buffer> {
  const images = await loadChartImages(report.charts);
  const slides = buildSlides(report, images).slice(0, 12);
  const entries = [
    { path: "[Content_Types].xml", data: pptxContentTypes(slides.length, images.length > 0) },
    { path: "_rels/.rels", data: packageRels("ppt/presentation.xml") },
    { path: "ppt/presentation.xml", data: presentationXml(slides.length) },
    { path: "ppt/_rels/presentation.xml.rels", data: presentationRels(slides.length) },
    ...slides.map((slide, index) => ({ path: `ppt/slides/slide${index + 1}.xml`, data: slideXml(slide.title, slide.lines, slide.image) })),
    ...slides.flatMap((slide, index) =>
      slide.image
        ? [{ path: `ppt/slides/_rels/slide${index + 1}.xml.rels`, data: slideImageRels(slide.image.fileName) }]
        : []
    ),
    ...images.map((image) => ({ path: `ppt/media/${image.fileName}`, data: image.data })),
  ];
  return createStoredZip(entries);
}

function documentXml(report: ReportArtifact, images: ExportImage[]): string {
  const parts: string[] = [
    paragraph(report.title, true),
    paragraph(`问题：${report.question}`),
    paragraph(`生成时间：${report.updatedAt}`),
    paragraph("结论", true),
    ...listLines(report.insights.map((insight) => insight.markdown), "暂无结论。").map((line) => paragraph(line)),
    paragraph("图表", true),
    ...listLines(report.charts.map((chart) => `${chart.title} (${reportChartKind(chart)})`), "暂无图表。").map((line) => paragraph(line)),
    ...images.map((image, index) => chartImageParagraph(image, index + 1)),
    paragraph("数据", true),
    ...report.datasets.flatMap((dataset) => datasetBlock(dataset)),
    paragraph("风险提示", true),
    ...listLines(report.caveats.map((caveat) => `${caveat.code}: ${caveat.message}`), "暂无风险提示。").map((line) => paragraph(line)),
    paragraph("来源附录", true),
    ...provenanceLines(report).map((line) => paragraph(line)),
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>`,
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>${parts.join("")}</w:body>
</w:document>`;
}

function datasetBlock(dataset: ReportDataset): string[] {
  const rows = reportDatasetRows(dataset).slice(0, 12);
  const columns = reportDatasetColumns(dataset).slice(0, 8);
  const lines = [
    paragraph(
      `${dataset.name}: previewRows=${reportDatasetPreviewRows(dataset)}, rowCount=${dataset.rowCount ?? "unknown"}, truncated=${dataset.provenance?.preview?.truncated ?? "unknown"}`
    ),
  ];
  if (rows.length === 0 || columns.length === 0) return lines;
  lines.push(table(columns.map((column) => column.name), rows.map((row) => columns.map((column) => formatCell(row[column.name])))));
  return lines;
}

function table(headers: string[], rows: string[][]): string {
  return `<w:tbl>${tableRow(headers, true)}${rows.map((row) => tableRow(row, false)).join("")}</w:tbl>`;
}

function tableRow(values: string[], bold: boolean): string {
  return `<w:tr>${values.map((value) => `<w:tc>${paragraph(value, bold)}</w:tc>`).join("")}</w:tr>`;
}

function paragraph(text: string, bold = false): string {
  const boldStart = bold ? "<w:b/>" : "";
  return `<w:p><w:r><w:rPr>${boldStart}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function buildSlides(report: ReportArtifact, images: ExportImage[]): Array<{ title: string; lines: string[]; image?: ExportImage }> {
  const imageByChartId = new Map(images.map((image) => [image.chartId, image]));
  const slides = [
    { title: report.title, lines: [`问题：${report.question}`, `Workspace：${report.workspaceId}`] },
    { title: "执行摘要", lines: listLines(report.insights.map((insight) => insight.markdown), "暂无结论。") },
  ];
  for (const chart of report.charts.slice(0, 6)) {
    const image = imageByChartId.get(chart.id);
    slides.push({
      title: chart.title,
      lines: [
        `图表类型：${reportChartKind(chart)}`,
        `数据集：${chart.datasetId}`,
        image ? "图表图片已嵌入。" : "图表图片暂未嵌入时，请参考报告数据表。",
      ],
      ...(image ? { image } : {}),
    });
  }
  for (const dataset of report.datasets.slice(0, 4)) {
    const rows = reportDatasetRows(dataset).slice(0, 6);
    const columns = reportDatasetColumns(dataset).slice(0, 5);
    const rowLines = rows.map((row) => columns.map((column) => `${column.name}=${formatCell(row[column.name])}`).join(" | "));
    slides.push({
      title: dataset.name,
      lines: [
        `previewRows=${reportDatasetPreviewRows(dataset)}, rowCount=${dataset.rowCount ?? "unknown"}`,
        ...listLines(rowLines, "暂无预览行。"),
      ],
    });
  }
  slides.push({ title: "来源与限制", lines: provenanceLines(report).slice(0, 12) });
  return slides;
}

function slideXml(title: string, lines: string[], image?: ExportImage): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    ${shape(2, "Title", title, 457200, 274320, 11277600, 914400, 3200)}
    ${shape(3, "Body", lines.slice(0, 12).join("\n"), 685800, 1371600, image ? 4572000 : 10820400, 4572000, 1800)}
    ${image ? pptPicture(4, image.title, "rId1", 5943600, 1371600, 5486400, 3086100) : ""}
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function shape(id: number, name: string, text: string, x: number, y: number, cx: number, cy: number, fontSize: number): string {
  const paragraphs = text.split(/\r?\n/).map((line) => `<a:p><a:r><a:rPr lang="zh-CN" sz="${fontSize}"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`).join("");
  return `<p:sp>
    <p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
    <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphs}</p:txBody>
  </p:sp>`;
}

function pptPicture(id: number, name: string, relId: string, x: number, y: number, cx: number, cy: number): string {
  return `<p:pic>
    <p:nvPicPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
    <p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
    <p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
  </p:pic>`;
}

function chartImageParagraph(image: ExportImage, index: number): string {
  return `<w:p><w:r><w:drawing>
    <wp:inline distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="5486400" cy="3086100"/>
      <wp:docPr id="${index}" name="${escapeXml(image.title)}"/>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic>
            <pic:nvPicPr><pic:cNvPr id="${index}" name="${escapeXml(image.title)}"/><pic:cNvPicPr/></pic:nvPicPr>
            <pic:blipFill><a:blip r:embed="rId${index}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
            <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing></w:r></w:p>`;
}

function provenanceLines(report: ReportArtifact): string[] {
  const lines = [
    `reportId=${report.id}`,
    `source=${report.provenance.source}`,
    `provider=${report.provenance.provider ?? "unknown"}`,
    `model=${report.provenance.model ?? "unknown"}`,
  ];
  for (const dataset of report.datasets) {
    const provenance = dataset.provenance;
    lines.push(`${dataset.name}: queryId=${provenance?.queryId ?? dataset.queryId ?? "unknown"}`);
    lines.push(`${dataset.name}: previewRows=${provenance?.preview?.rows ?? reportDatasetPreviewRows(dataset)}, rowCount=${provenance?.preview?.rowCount ?? dataset.rowCount ?? "unknown"}, truncated=${provenance?.preview?.truncated ?? "unknown"}`);
    if (provenance?.sql ?? dataset.sql) lines.push(`${dataset.name}: SQL=${provenance?.sql ?? dataset.sql}`);
  }
  return lines;
}

function listLines(values: string[], empty: string): string[] {
  const clean = values.map((value) => value.trim()).filter(Boolean);
  return clean.length > 0 ? clean.map((value) => `- ${value}`) : [empty];
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function docxContentTypes(hasPng: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasPng ? '<Default Extension="png" ContentType="image/png"/>' : ""}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
}

function pptxContentTypes(slideCount: number, hasPng: boolean): string {
  const slides = Array.from({ length: slideCount }, (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasPng ? '<Default Extension="png" ContentType="image/png"/>' : ""}
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slides}
</Types>`;
}

function packageRels(target: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${escapeXml(target)}"/>
</Relationships>`;
}

function documentRels(images: ExportImage[]): string {
  const rels = images
    .map(
      (image, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${escapeXml(image.fileName)}"/>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function presentationXml(slideCount: number): string {
  const ids = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>${ids}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

function presentationRels(slideCount: number): string {
  const rels = Array.from({ length: slideCount }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function slideImageRels(fileName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${escapeXml(fileName)}"/>
</Relationships>`;
}

async function loadChartImages(charts: ReportChart[]): Promise<ExportImage[]> {
  const images: ExportImage[] = [];
  for (const chart of charts) {
    const ref = chart.imageArtifact;
    if (!ref || ref.kind !== "png") continue;
    try {
      images.push({
        chartId: chart.id,
        title: chart.title,
        data: await readFile(ref.path),
        fileName: `chart-${images.length + 1}.png`,
      });
    } catch {
      // A missing image artifact should degrade to table/text export, not fail the whole report export.
    }
  }
  return images;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
