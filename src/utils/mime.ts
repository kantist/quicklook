import { extension as extensionFromMimeTypeLookup, lookup as mimeLookup } from "mime-types";

import type { QuicklookSourceKind } from "../types.js";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "tif", "tiff", "avif", "svg", "heic", "heif", "bmp"]);
/**
 * Drawings registered under image/ that are vector CAD, not pictures: no image decoder reads them, so they are not
 * images here (a host's viewer strategy draws them).
 */
const CAD_IMAGE_MIME_TYPES = new Set(["image/vnd.dxf", "image/x-dxf", "image/vnd.dwg", "image/x-dwg"]);
const CAD_EXTENSIONS = new Set(["dxf", "dwg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp"]);
const OFFICE_EXTENSIONS = new Set(["doc", "docx", "odt", "rtf", "ppt", "pptx", "odp", "xls", "xlsx", "ods", "csv"]);
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "xml",
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
  // Firmware, hardware description and electronics design written as text, drawn as the text they are. (G-code's
  // .nc is left out: it is also NetCDF, a binary format.)
  "asm",
  "s",
  "ld",
  "lds",
  "map",
  "hex",
  "ihex",
  "ihx",
  "srec",
  "s19",
  "s28",
  "s37",
  "mot",
  "v",
  "vh",
  "sv",
  "svh",
  "vhd",
  "vhdl",
  "cir",
  "sp",
  "spice",
  "ino",
  "cmake",
  "mk",
  "gcode",
  "ngc",
  "kicad_sch",
  "kicad_pcb",
  "kicad_sym",
  "kicad_mod",
  "kicad_pro",
  "gbr",
  "ger",
  "gtl",
  "gbl",
  "gto",
  "gbo",
  "gts",
  "gbs",
  "gtp",
  "gbp",
  "gko",
  "gm1",
  "gml",
  "drl",
  "xln",
]);

const OFFICE_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
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

const HTML_EXTENSIONS = new Set(["html", "htm", "xhtml"]);
const HTML_MIME_TYPES = new Set(["text/html", "application/xhtml+xml"]);

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

  if (HTML_EXTENSIONS.has(extension ?? "") || HTML_MIME_TYPES.has(mimeType ?? "")) {
    return "html";
  }

  if (mimeType === "application/epub+zip" || extension === "epub") {
    return "epub";
  }

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (OFFICE_EXTENSIONS.has(extension ?? "") || OFFICE_MIME_TYPES.has(mimeType ?? "")) {
    return "office";
  }

  if (CAD_IMAGE_MIME_TYPES.has(mimeType ?? "") || CAD_EXTENSIONS.has(extension ?? "")) {
    return "unknown";
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
