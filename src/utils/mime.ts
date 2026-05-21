import { extension as extensionFromMimeTypeLookup, lookup as mimeLookup } from "mime-types";

import type { QuicklookSourceKind } from "../types.js";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "tif", "tiff", "avif", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v"]);
const OFFICE_EXTENSIONS = new Set(["doc", "docx", "odt", "rtf", "ppt", "pptx", "xls", "xlsx", "csv"]);
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "xml",
  "html",
  "htm",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "go",
  "rs",
  "yaml",
  "yml",
  "css",
  "scss",
  "sql",
  "sh",
]);

const OFFICE_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
]);

const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
  "application/x-yaml",
]);

export function normalizeExtension(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.replace(/^\./u, "").trim().toLowerCase() || undefined;
}

export function mimeFromFilename(filename: string): string | undefined {
  const mimeType = mimeLookup(filename);
  return typeof mimeType === "string" ? mimeType : undefined;
}

export function extensionFromMime(mimeType?: string): string | undefined {
  if (!mimeType) {
    return undefined;
  }

  const value = extensionFromMimeTypeLookup(mimeType);
  return typeof value === "string" ? normalizeExtension(value) : undefined;
}

export function detectSourceKind(args: { extension?: string; mimeType?: string }): QuicklookSourceKind {
  const extension = normalizeExtension(args.extension);
  const mimeType = args.mimeType?.toLowerCase();

  if (mimeType === "application/epub+zip" || extension === "epub") {
    return "epub";
  }

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (OFFICE_EXTENSIONS.has(extension ?? "") || OFFICE_MIME_TYPES.has(mimeType ?? "")) {
    return "office";
  }

  if (mimeType?.startsWith("image/") || IMAGE_EXTENSIONS.has(extension ?? "")) {
    return "image";
  }

  if (mimeType?.startsWith("video/") || VIDEO_EXTENSIONS.has(extension ?? "")) {
    return "video";
  }

  if (mimeType?.startsWith("text/") || TEXT_MIME_TYPES.has(mimeType ?? "") || TEXT_EXTENSIONS.has(extension ?? "")) {
    return "text";
  }

  return "unknown";
}
