import { basename } from "node:path";

import { QuicklookInputError } from "../errors.js";

import type { QuicklookInput, QuicklookPathInput, QuicklookBufferInput, QuicklookStreamInput } from "../types.js";

export interface NormalizedInputDescriptor {
  kind: "path" | "buffer" | "stream";
  filename: string;
  declaredMimeType?: string;
  path?: string;
  buffer?: Buffer;
  stream?: ReadableStream<Uint8Array> | NodeJS.ReadableStream;
  sizeHint?: number;
}

export function normalizeInputDescriptor(input: QuicklookInput): NormalizedInputDescriptor {
  if (isPathInput(input)) {
    return {
      kind: "path",
      path: input.path,
      filename: input.filename ?? basename(input.path),
      declaredMimeType: input.mimeType,
    };
  }

  if (isBufferInput(input)) {
    return {
      kind: "buffer",
      buffer: input.buffer,
      filename: input.filename,
      declaredMimeType: input.mimeType,
      sizeHint: input.buffer.byteLength,
    };
  }

  if (isStreamInput(input)) {
    return {
      kind: "stream",
      stream: input.stream,
      filename: input.filename,
      declaredMimeType: input.mimeType,
      sizeHint: input.size,
    };
  }

  throw new QuicklookInputError("Unsupported input shape.");
}

function isPathInput(input: QuicklookInput): input is QuicklookPathInput {
  return typeof (input as QuicklookPathInput).path === "string";
}

function isBufferInput(input: QuicklookInput): input is QuicklookBufferInput {
  return Buffer.isBuffer((input as QuicklookBufferInput).buffer);
}

function isStreamInput(input: QuicklookInput): input is QuicklookStreamInput {
  return "stream" in input;
}
