import { extname } from "node:path";

import { fileTypeFromBuffer, fileTypeFromFile } from "file-type";

import { detectSourceKind, mimeFromFilename, normalizeExtension } from "../utils/mime.js";

import type { ProbeInput } from "../types.js";

export async function sniffFileInput(args: {
  filePath: string;
  filename: string;
  declaredMimeType?: string;
}): Promise<Pick<ProbeInput, "extension" | "declaredMimeType" | "detectedMimeType" | "mimeType" | "sourceKind">> {
  const fileType = await fileTypeFromFile(args.filePath).catch(() => undefined);

  return buildSniffedInput({
    filename: args.filename,
    declaredMimeType: args.declaredMimeType,
    detectedMimeType: fileType?.mime,
    detectedExtension: fileType?.ext,
  });
}

export async function sniffBufferInput(args: {
  buffer: Buffer;
  filename: string;
  declaredMimeType?: string;
}): Promise<Pick<ProbeInput, "extension" | "declaredMimeType" | "detectedMimeType" | "mimeType" | "sourceKind">> {
  const fileType = await fileTypeFromBuffer(args.buffer).catch(() => undefined);

  return buildSniffedInput({
    filename: args.filename,
    declaredMimeType: args.declaredMimeType,
    detectedMimeType: fileType?.mime,
    detectedExtension: fileType?.ext,
  });
}

export function sniffMetadataInput(args: {
  filename: string;
  declaredMimeType?: string;
}): Pick<ProbeInput, "extension" | "declaredMimeType" | "detectedMimeType" | "mimeType" | "sourceKind"> {
  return buildSniffedInput(args);
}

function buildSniffedInput(args: {
  filename: string;
  declaredMimeType?: string;
  detectedMimeType?: string;
  detectedExtension?: string;
}): Pick<ProbeInput, "extension" | "declaredMimeType" | "detectedMimeType" | "mimeType" | "sourceKind"> {
  const filenameExtension = normalizeExtension(extname(args.filename));
  const detectedExtension = normalizeExtension(args.detectedExtension);
  const fallbackMimeType = mimeFromFilename(args.filename);
  let extension = detectedExtension ?? filenameExtension;
  let mimeType = args.detectedMimeType ?? args.declaredMimeType ?? fallbackMimeType;
  let sourceKind = detectSourceKind({ extension, mimeType });

  if (sourceKind === "unknown" && (filenameExtension || fallbackMimeType || args.declaredMimeType)) {
    const filenameMimeType = args.declaredMimeType ?? fallbackMimeType ?? mimeType;
    const filenameSourceKind = detectSourceKind({
      extension: filenameExtension,
      mimeType: filenameMimeType,
    });

    if (filenameSourceKind !== "unknown") {
      extension = filenameExtension ?? extension;
      mimeType = filenameMimeType;
      sourceKind = filenameSourceKind;
    }
  }

  return {
    extension,
    declaredMimeType: args.declaredMimeType,
    detectedMimeType: args.detectedMimeType,
    mimeType,
    sourceKind,
  };
}
