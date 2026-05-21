import { createWriteStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { QuicklookInputError } from "../errors.js";
import { extensionFromMime, normalizeExtension } from "../utils/mime.js";
import { assertWithinLimit } from "../utils/limits.js";

import type { NormalizedInputDescriptor } from "./normalize.js";

export interface MaterializedInput {
  inputKind: NormalizedInputDescriptor["kind"];
  path: string;
  filename: string;
  sizeInBytes: number;
}

export async function materializeInput(
  descriptor: NormalizedInputDescriptor,
  workDir: string,
  maxInputBytes: number,
): Promise<MaterializedInput> {
  if (descriptor.kind === "path") {
    const stats = await stat(descriptor.path as string);
    assertWithinLimit(stats.size, maxInputBytes, `Input exceeds maxInputBytes (${maxInputBytes}).`);

    return {
      inputKind: descriptor.kind,
      path: descriptor.path as string,
      filename: descriptor.filename,
      sizeInBytes: stats.size,
    };
  }

  if (descriptor.kind === "buffer") {
    const sizeInBytes = descriptor.buffer?.byteLength ?? 0;
    assertWithinLimit(sizeInBytes, maxInputBytes, `Input exceeds maxInputBytes (${maxInputBytes}).`);
    const filePath = join(workDir, createMaterializedFilename(descriptor.filename, descriptor.declaredMimeType));
    await writeFile(filePath, descriptor.buffer as Buffer);

    return {
      inputKind: descriptor.kind,
      path: filePath,
      filename: descriptor.filename,
      sizeInBytes,
    };
  }

  if (descriptor.sizeHint !== undefined) {
    assertWithinLimit(descriptor.sizeHint, maxInputBytes, `Input exceeds maxInputBytes (${maxInputBytes}).`);
  }

  const filePath = join(workDir, createMaterializedFilename(descriptor.filename, descriptor.declaredMimeType));
  const countingTransform = createCountingTransform(maxInputBytes);
  const writeStream = createWriteStream(filePath);
  const readable = toNodeReadable(descriptor.stream);

  await pipeline(readable, countingTransform, writeStream);

  return {
    inputKind: descriptor.kind,
    path: filePath,
    filename: descriptor.filename,
    sizeInBytes: countingTransform.bytesWritten,
  };
}

function createMaterializedFilename(filename: string, mimeType?: string): string {
  const extension = normalizeExtension(extname(filename)) ?? extensionFromMime(mimeType) ?? "bin";
  return `input.${extension}`;
}

function createCountingTransform(maxInputBytes: number): Transform & { bytesWritten: number } {
  let bytesWritten = 0;

  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      bytesWritten += Buffer.byteLength(chunk);

      if (bytesWritten > maxInputBytes) {
        callback(new QuicklookInputError(`Input exceeds maxInputBytes (${maxInputBytes}).`));
        return;
      }

      callback(null, chunk);
    },
    final(callback) {
      callback();
    },
  }) as Transform & { bytesWritten: number };

  Object.defineProperty(transform, "bytesWritten", {
    get() {
      return bytesWritten;
    },
  });

  return transform;
}

function toNodeReadable(stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream | undefined): NodeJS.ReadableStream {
  if (!stream) {
    throw new QuicklookInputError("Stream input is missing a readable stream.");
  }

  if (typeof (stream as NodeJS.ReadableStream).pipe === "function") {
    return stream as NodeJS.ReadableStream;
  }

  if (typeof (stream as ReadableStream<Uint8Array>).getReader === "function") {
    return Readable.fromWeb(stream as ReadableStream<Uint8Array>);
  }

  throw new QuicklookInputError("Unsupported stream implementation.");
}
