import { open } from "node:fs/promises";

import type { NormalizedQuicklookRequest, ResolvedInput } from "../types.js";

const MAX_READ_BYTES = 48 * 1024;
const MIN_BODY_FONT_SIZE = 16;
const MAX_BODY_FONT_SIZE = 29;

export interface PreviewLine {
  kind: "heading" | "body" | "blank";
  text: string;
}

export interface ExcerptLine extends PreviewLine {}

export async function renderTextPreview(
  input: ResolvedInput,
  request: NormalizedQuicklookRequest,
): Promise<Buffer> {
  const frame = resolvePreviewFrame(request);
  const profile = getTextProfile(input.extension);
  const paddingX = Math.max(16, Math.round(frame.width * 0.045));
  const paddingY = Math.max(16, Math.round(frame.height * 0.045));
  const bodyFontSize = clamp(Math.round(frame.width * 0.041), MIN_BODY_FONT_SIZE, MAX_BODY_FONT_SIZE);
  const lineHeight = Math.round(bodyFontSize * 1.55);
  const headingFontSize = Math.round(bodyFontSize * 1.28);
  const headingLineHeight = Math.round(lineHeight * 1.18);
  const bodyTop = paddingY + Math.round(bodyFontSize * 0.9);
  const bodyWidth = frame.width - paddingX * 2;
  const bodyHeight = frame.height - bodyTop - paddingY;

  const rawText = await readPreviewText(input.path);
  const previewLines = extractPreviewLines(rawText, input.extension);
  const excerpt = layoutExcerpt(previewLines, {
    maxCharsPerLine: Math.max(12, Math.floor(bodyWidth / (bodyFontSize * profile.charWidthFactor))),
    maxLines: Math.max(3, Math.floor(bodyHeight / lineHeight)),
  });
  const textBlock = buildTextBlock(excerpt.lines, paddingX, bodyTop, {
    bodyFontSize,
    bodyLineHeight: lineHeight,
    headingFontSize,
    headingLineHeight,
    fontFamily: profile.fontFamily,
  });

  const svg = `
<svg width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${frame.width}" height="${frame.height}" fill="#ffffff" />
  ${textBlock}
</svg>`.trim();

  return Buffer.from(svg);
}

export function normalizePreviewText(value: string, extension?: string): string {
  return extractPreviewLines(value, extension)
    .map((line) => line.text)
    .join("\n")
    .trim() || "Preview unavailable.";
}

export function extractPreviewLines(value: string, extension?: string): PreviewLine[] {
  let normalized = value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").replace(/\t/gu, "  ");
  const normalizedExtension = extension?.toLowerCase();

  if (normalizedExtension === "html" || normalizedExtension === "htm" || normalizedExtension === "xml") {
    normalized = normalized
      .replace(/<(?:br|hr)\s*\/?\s*>/giu, "\n")
      .replace(/<\/(?:p|div|section|article|header|footer|li|ul|ol|h[1-6]|pre|table|tr)>/giu, "\n")
      .replace(/<[^>]+>/gu, " ");
  }

  normalized = normalized
    .replace(/^---\n[\s\S]*?\n---\n/gu, "")
    .replace(/^```[^\n]*$/gmu, "")
    .replace(/^~~~[^\n]*$/gmu, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/^\[[^\]]+\]:\s+\S+.*$/gmu, "")
    .replace(/^\s{0,3}>\s?/gmu, "")
    .replace(/^\s*[-*+]\s+/gmu, "- ")
    .replace(/^\s*\d+\.\s+/gmu, "1. ")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/gu, "$1")
    .replace(/\|/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'");

  const lines = normalized.split("\n");
  const output: PreviewLine[] = [];

  for (const rawLine of lines) {
    const headingMatch = /^(?:\s{0,3})(#{1,6})\s+(.*)$/u.exec(rawLine);

    if (headingMatch) {
      const text = normalizeLineText(headingMatch[2]);

      if (text) {
        output.push({ kind: "heading", text });
      }

      continue;
    }

    const text = normalizeLineText(rawLine);

    if (!text) {
      if (output[output.length - 1]?.kind !== "blank") {
        output.push({ kind: "blank", text: "" });
      }

      continue;
    }

    output.push({ kind: "body", text });
  }

  while (output[0]?.kind === "blank") {
    output.shift();
  }

  while (output[output.length - 1]?.kind === "blank") {
    output.pop();
  }

  return output.length > 0 ? output : [{ kind: "body", text: "Preview unavailable." }];
}

export function layoutExcerpt(
  input: string | PreviewLine[],
  options: { maxCharsPerLine: number; maxLines: number },
): { lines: ExcerptLine[]; truncated: boolean } {
  const sourceLines = Array.isArray(input)
    ? input
    : input.split("\n").map<PreviewLine>((line) => (line.trim().length === 0 ? { kind: "blank", text: "" } : { kind: "body", text: line }));
  const lines: ExcerptLine[] = [];
  let truncated = false;

  for (const sourceLine of sourceLines) {
    if (sourceLine.kind === "blank") {
      if (lines.length > 0 && lines[lines.length - 1]?.kind !== "blank") {
        if (lines.length >= options.maxLines) {
          truncated = true;
          break;
        }

        lines.push({ kind: "blank", text: "" });
      }

      continue;
    }

    const wrappedLines = wrapStructuredLine(sourceLine, options.maxCharsPerLine);

    for (const line of wrappedLines) {
      if (lines.length >= options.maxLines) {
        truncated = true;
        break;
      }

      lines.push(line);
    }

    if (truncated) {
      break;
    }
  }

  while (lines[lines.length - 1]?.kind === "blank") {
    lines.pop();
  }

  if (lines.length === 0) {
    lines.push({ kind: "body", text: "Preview unavailable." });
  }

  if (truncated) {
    const lastIndex = Math.max(0, lines.length - 1);
    const lastLine = lines[lastIndex];
    lines[lastIndex] = {
      kind: lastLine.kind,
      text: appendEllipsis(lastLine.text, options.maxCharsPerLine),
    };
  }

  return { lines, truncated };
}

function resolvePreviewFrame(request: NormalizedQuicklookRequest): { width: number; height: number } {
  if (request.size.mode === "box") {
    return {
      width: request.size.width,
      height: request.size.height,
    };
  }

  return {
    width: Math.max(220, Math.round(request.size.maxEdge / Math.SQRT2)),
    height: request.size.maxEdge,
  };
}

function getTextProfile(extension?: string): { fontFamily: string; charWidthFactor: number } {
  const normalizedExtension = extension?.toLowerCase();
  const codeLikeExtensions = new Set([
    "js",
    "jsx",
    "ts",
    "tsx",
    "json",
    "xml",
    "yaml",
    "yml",
    "css",
    "scss",
    "sql",
    "py",
    "go",
    "rs",
    "sh",
  ]);

  if (codeLikeExtensions.has(normalizedExtension ?? "")) {
    return {
      fontFamily: "SFMono-Regular, Menlo, Consolas, monospace",
      charWidthFactor: 0.62,
    };
  }

  return {
    fontFamily: "Georgia, Times New Roman, serif",
    charWidthFactor: 0.56,
  };
}

function buildTextBlock(
  lines: ExcerptLine[],
  x: number,
  startY: number,
  options: {
    bodyFontSize: number;
    bodyLineHeight: number;
    headingFontSize: number;
    headingLineHeight: number;
    fontFamily: string;
  },
): string {
  let currentY = startY;

  return lines
    .map((line, index) => {
      if (line.kind === "blank") {
        currentY += options.bodyLineHeight;
        return "";
      }

      const fontSize = line.kind === "heading" ? options.headingFontSize : options.bodyFontSize;
      const lineHeight = line.kind === "heading" ? options.headingLineHeight : options.bodyLineHeight;
      const fontWeight = line.kind === "heading" ? "700" : "400";
      const rendered = `<text x="${x}" y="${currentY}" font-size="${fontSize}" font-family="${options.fontFamily}" font-weight="${fontWeight}" fill="#111111" xml:space="preserve">${escapeXml(line.text)}</text>`;

      currentY += lineHeight;

      if (line.kind === "heading" && index < lines.length - 1) {
        currentY += Math.round(options.bodyLineHeight * 0.2);
      }

      return rendered;
    })
    .filter(Boolean)
    .join("");
}

async function readPreviewText(path: string): Promise<string> {
  const handle = await open(path, "r");

  try {
    const buffer = Buffer.alloc(MAX_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, MAX_READ_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function wrapStructuredLine(line: PreviewLine, maxCharsPerLine: number): ExcerptLine[] {
  if (line.kind === "heading") {
    return wrapParagraph(line.text, maxCharsPerLine).map((text) => ({ kind: "heading", text }));
  }

  const match = /^(?<prefix>(?:- |\* |\+ |> |\d+\. ))(?<content>.+)$/u.exec(line.text);

  if (!match?.groups) {
    return wrapParagraph(line.text, maxCharsPerLine).map((text) => ({ kind: "body", text }));
  }

  const prefix = match.groups.prefix;
  const continuationPrefix = " ".repeat(prefix.length);
  const firstLineWidth = Math.max(6, maxCharsPerLine - prefix.length);
  const continuationWidth = Math.max(6, maxCharsPerLine - continuationPrefix.length);
  const wrappedContent = wrapParagraph(match.groups.content.trim(), firstLineWidth, continuationWidth);

  return wrappedContent.map((contentLine, index) => ({
    kind: "body",
    text: `${index === 0 ? prefix : continuationPrefix}${contentLine}`,
  }));
}

function wrapParagraph(paragraph: string, firstLineWidth: number, continuationWidth = firstLineWidth): string[] {
  const segments = segmentText(paragraph);
  const lines: string[] = [];
  let currentLine = "";
  let currentWidth = firstLineWidth;

  for (const segment of segments) {
    const candidate = currentLine ? `${currentLine} ${segment}` : segment;

    if (candidate.length <= currentWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
      currentWidth = continuationWidth;
    }

    if (segment.length <= currentWidth) {
      currentLine = segment;
      continue;
    }

    const chunks = chunkText(segment, currentWidth, continuationWidth);
    lines.push(...chunks.slice(0, -1));
    currentLine = chunks[chunks.length - 1] ?? "";
    currentWidth = continuationWidth;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function segmentText(value: string): string[] {
  return value.split(/\s+/u).map((segment) => segment.trim()).filter(Boolean);
}

function chunkText(value: string, firstLineWidth: number, continuationWidth = firstLineWidth): string[] {
  const chunks: string[] = [];
  let index = 0;
  let width = firstLineWidth;

  while (index < value.length) {
    chunks.push(value.slice(index, index + width));
    index += width;
    width = continuationWidth;
  }

  return chunks;
}

function appendEllipsis(value: string, maxCharsPerLine: number): string {
  const trimmed = value.trimEnd();

  if (trimmed.length >= maxCharsPerLine) {
    return `${trimmed.slice(0, Math.max(0, maxCharsPerLine - 1)).trimEnd()}…`;
  }

  return `${trimmed}…`;
}

function normalizeLineText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
