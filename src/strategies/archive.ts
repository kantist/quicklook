import { open } from "node:fs/promises";

import sharp from "sharp";

import { QuicklookRenderError } from "../errors.js";

import type { QuicklookStrategy, ResolvedInput, ProbeInput } from "../types.js";

/** A ZIP's contents as its central directory lists them: nothing is inflated. */
export interface ZipSummary {
  fileCount: number;
  totalBytes: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
/** The end record is 22 bytes plus a comment of at most 65535. */
const EOCD_SEARCH_BYTES = 22 + 0xffff;
/** A central directory larger than this is not read for a poster. */
const MAX_DIRECTORY_BYTES = 64 * 1024 * 1024;

/** The extensions whose files are ZIP archives this strategy draws as a folder poster. */
const ARCHIVE_EXTENSIONS = new Set(["zip"]);

function extensionOf(input: ProbeInput | ResolvedInput): string {
  const name = input.filename.toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

/** Entries an archiver adds that are no part of the content (macOS resource forks, Finder's settings). */
function isClutter(name: string): boolean {
  const segments = name.split("/");
  return segments[0] === "__MACOSX" || segments.at(-1) === ".DS_Store" || segments.at(-1) === "Thumbs.db";
}

/** Reads a ZIP's central directory (ZIP64 too) and counts its files and their uncompressed size. */
export async function readZipSummary(path: string): Promise<ZipSummary> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const tailLength = Math.min(size, EOCD_SEARCH_BYTES);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);

    let eocd = -1;
    for (let index = tailLength - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === EOCD_SIGNATURE) {
        eocd = index;
        break;
      }
    }
    if (eocd < 0) throw new QuicklookRenderError("Not a ZIP archive: no end of central directory.");

    let directorySize = tail.readUInt32LE(eocd + 12);
    let directoryOffset = tail.readUInt32LE(eocd + 16);
    const locator = eocd - 20;
    if ((directoryOffset === 0xffffffff || directorySize === 0xffffffff) && locator >= 0) {
      if (tail.readUInt32LE(locator) === ZIP64_LOCATOR_SIGNATURE) {
        const record = Buffer.alloc(56);
        await handle.read(record, 0, 56, Number(tail.readBigUInt64LE(locator + 8)));
        if (record.readUInt32LE(0) !== ZIP64_EOCD_SIGNATURE) throw new QuicklookRenderError("Damaged ZIP64 archive.");
        directorySize = Number(record.readBigUInt64LE(40));
        directoryOffset = Number(record.readBigUInt64LE(48));
      }
    }
    if (directorySize > MAX_DIRECTORY_BYTES || directoryOffset + directorySize > size) {
      throw new QuicklookRenderError("The ZIP's directory is too large or damaged.");
    }

    const directory = Buffer.alloc(directorySize);
    await handle.read(directory, 0, directorySize, directoryOffset);
    let fileCount = 0;
    let totalBytes = 0;
    for (let offset = 0; offset + 46 <= directory.length; ) {
      if (directory.readUInt32LE(offset) !== CENTRAL_HEADER_SIGNATURE) break;
      let uncompressed = directory.readUInt32LE(offset + 24);
      const nameLength = directory.readUInt16LE(offset + 28);
      const extraLength = directory.readUInt16LE(offset + 30);
      const commentLength = directory.readUInt16LE(offset + 32);
      const name = directory.toString("utf8", offset + 46, offset + 46 + nameLength);
      if (uncompressed === 0xffffffff) {
        // The ZIP64 extra field (0x0001) carries the real size first.
        const extra = directory.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
        for (let at = 0; at + 4 <= extra.length; ) {
          const id = extra.readUInt16LE(at);
          const length = extra.readUInt16LE(at + 2);
          if (id === 0x0001 && length >= 8) uncompressed = Number(extra.readBigUInt64LE(at + 4));
          at += 4 + length;
        }
      }
      if (!name.endsWith("/") && !isClutter(name)) {
        fileCount += 1;
        totalBytes += uncompressed;
      }
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return { fileCount, totalBytes };
  } finally {
    await handle.close();
  }
}

/** "1 file" / "1,204 files". */
function filesLabel(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "file" : "files"}`;
}

/** A size as Finder writes it, in powers of 1000: "812 bytes", "18.3 MB". */
function sizeLabel(bytes: number): string {
  if (bytes < 1000) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, "")} ${units[unit]}`;
}

/**
 * The poster: a folder in Finder's shape and tint on a white page, with the archive's file count across it and its
 * size under it. 1200 × 900, scaled to the size asked by the pipeline.
 */
export function zipPosterSvg(summary: ZipSummary): string {
  const count = summary.fileCount.toLocaleString("en-US");
  const countSize = count.length <= 3 ? 150 : count.length <= 5 ? 120 : 92;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <rect width="1200" height="900" fill="#ffffff"/>
  <g transform="translate(300 170)">
    <path d="M40 0h170c14 0 26 6 34 17l26 35c8 11 20 17 34 17h296c22 0 40 18 40 40v391c0 22-18 40-40 40H40c-22 0-40-18-40-40V40C0 18 18 0 40 0Z" fill="#5aa0ec"/>
    <path d="M0 150c0-22 18-40 40-40h520c22 0 40 18 40 40v350c0 22-18 40-40 40H40c-22 0-40-18-40-40Z" fill="#7db7f3"/>
    <text x="300" y="${330 + countSize * 0.18}" text-anchor="middle" font-family="Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="${countSize}" font-weight="600" fill="#ffffff">${count}</text>
    <text x="300" y="440" text-anchor="middle" font-family="Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="44" font-weight="500" fill="#ffffff" fill-opacity="0.92">${summary.fileCount === 1 ? "file" : "files"}</text>
  </g>
  <text x="600" y="790" text-anchor="middle" font-family="Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="40" fill="#6f6f6f">${filesLabel(summary.fileCount)}, ${sizeLabel(summary.totalBytes)}</text>
</svg>`;
}

/**
 * A ZIP as a folder poster with its file count, drawn from its central directory alone, with no viewer or browser.
 * Not one of the default strategies: a host adds it (`createQuicklook({ strategies: [createArchiveStrategy()] })`),
 * so quicklook's own formats stay as they are.
 */
export function createArchiveStrategy(): QuicklookStrategy {
  return {
    id: "archive",
    priority: 50,
    match(input) {
      return ARCHIVE_EXTENSIONS.has(extensionOf(input)) ? 50 : null;
    },
    async render(context) {
      const summary = await readZipSummary(context.input.path);
      return { buffer: await sharp(Buffer.from(zipPosterSvg(summary))).png().toBuffer() };
    },
  };
}
