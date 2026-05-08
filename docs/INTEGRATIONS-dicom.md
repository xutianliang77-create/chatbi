# DICOM MCP Integration

`dicom-mcp` is a local stdio MCP server for preparing DICOM Part 10 `.dcm` files for vision models.

It is the official CodeClaw medical-imaging integration boundary. DICOM parsing, PHI redaction,
windowing, and PNG preview generation live in this MCP server, not in the core QueryEngine,
Web UI, or radiology prompt layer.

It is intentionally a preprocessing lane:

1. Inspect the local DICOM file.
2. Redact common PHI tags from metadata.
3. Render supported grayscale pixel data to PNG.
4. Return a safe prompt context and artifact paths.
5. Send the rendered PNG plus deidentified context to the vision model.

Raw DICOM bytes should not be sent directly to an LLM. CodeClaw should call the DICOM MCP tools,
then pass only the rendered PNG path and deidentified context to the vision model.

## Start

```bash
npm run dicom:mcp
```

Example MCP config:

```json
{
  "servers": {
    "dicom": {
      "command": "/Users/xutianliang/Downloads/CodeClaw/node_modules/.bin/tsx",
      "args": ["/Users/xutianliang/Downloads/CodeClaw/packages/dicom-mcp/src/index.ts"],
      "cwd": "/Users/xutianliang/Downloads/CodeClaw"
    }
  }
}
```

## Tools

- `InspectDicomFile`: parse tags, redact common PHI, and report renderability.
- `RenderDicomPreview`: render an uncompressed grayscale DICOM to PNG and metadata JSON.
- `PrepareDicomForVision`: render PNG and return a safe prompt context for 小医 / medgemma.

## CodeClaw Boundary

- `packages/dicom-mcp/`: owns DICOM file parsing, rendering, PHI redaction, and prompt-context preparation.
- `src/mcp/*`: owns spawning and bridging the `dicom` MCP server.
- `src/channels/web/*`: may persist uploaded `.dcm` files temporarily, but must call `dicom.PrepareDicomForVision`; it must not import DICOM parsing functions directly.
- Radiology prompts / 小医 persona: may instruct the model to use `mcp__dicom__*` tools, but must not implement image preprocessing.
- Long-term memory / RAG: should store only deidentified conclusions or user-approved notes, not raw DICOM bytes or PHI tags.

## Supported In This Patch

- DICOM Part 10 files with `DICM` magic.
- Explicit VR Little Endian and Implicit VR Little Endian.
- Single-frame grayscale `MONOCHROME1` / `MONOCHROME2`.
- 8-bit and 16-bit pixel data.
- Window center/width, rescale slope/intercept, signed and unsigned pixels.

## Not Yet Supported

- JPEG/JPEG2000/RLE compressed transfer syntaxes.
- Multi-frame series navigation.
- DICOMweb, PACS query/retrieve, WADO, STOW, QIDO.
- Viewer interactions such as scroll, measurements, MPR, segmentation, annotations.

Unsupported inputs return a clear error instead of producing an unreliable image.

## Radiology Prompt

Use a radiology persona or project `CODECLAW.md` to activate 小医 mode. This prompt layer tells the model to:

- answer in Chinese,
- use DICOM MCP tools for all `.dcm` preprocessing,
- avoid raw DICOM bytes,
- keep PHI out of prompts and memory,
- provide structured findings and safety caveats.

This is not a separate image-processing implementation. The prompt layer only routes and explains;
the MCP server remains the single execution boundary for DICOM preprocessing.

## Web Chat Uploads

Web Chat accepts `.dcm` / `application/dicom` attachments up to 24 MB. The server does not pass raw DICOM bytes to the model. It first persists the upload to a temporary file, calls `dicom.PrepareDicomForVision` through the configured MCP manager, injects the deidentified DICOM context into the prompt, and sends the rendered PNG through the existing image attachment path.

If the `dicom` MCP server is not configured or not ready, Web upload returns `503` with a clear
`dicom mcp unavailable` error instead of falling back to in-process DICOM parsing.

For larger studies or compressed transfer syntaxes, use an external DICOM viewer/PACS export path first, or extend this MCP with DICOMweb and compressed codec support.

## Configuration

| Variable | Default | Purpose |
| --- | ---: | --- |
| `CODECLAW_DICOM_MAX_FILE_BYTES` | `268435456` | Maximum local `.dcm` file size accepted by `dicom-mcp` before preprocessing. |

Keep this limit conservative for Web uploads. The Web message body limit may be lower than the MCP file limit because uploaded `.dcm` files can arrive as base64 data URLs.

## Example Flow

```text
/mcp call dicom InspectDicomFile {"path":"/absolute/path/chest.dcm"}
/mcp call dicom PrepareDicomForVision {"path":"/absolute/path/chest.dcm"}
```

Then attach the returned PNG path, or upload a supported `.dcm` directly in Web Chat for automatic preprocessing.
