import { join } from "node:path";

import sharp from "sharp";

import { QuicklookDependencyError, QuicklookInputError } from "../errors.js";
import { runCommand } from "../utils/exec.js";

import type { QuicklookStrategy, StrategyRenderContext, StrategyRenderResult } from "../types.js";

/** Photos sharp's prebuilt libvips cannot decode (HEVC): libheif turns them into PNG first. */
const HEIF_EXTENSIONS = new Set(["heic", "heif"]);
/** Bitmaps sharp does not read: ffmpeg turns them into PNG first. */
const FFMPEG_EXTENSIONS = new Set(["bmp"]);
/** Images that can hold several pages, such as a scanned or faxed document. */
const PAGED_EXTENSIONS = new Set(["tif", "tiff"]);

export function createImageStrategy(): QuicklookStrategy {
  return {
    id: "image",
    priority: 100,
    match(input) {
      return input.sourceKind === "image" ? 100 : null;
    },
    async render(context) {
      const [item] = await renderPages(context, [context.request.page]);
      return item!;
    },
    async renderBatch(context, pageSelection) {
      const path = await decodedPath(context);
      const pageCount = await countPages(context, path);
      const pages = pageSelection === "all" ? Array.from({ length: pageCount }, (_, index) => index + 1) : pageSelection;

      return { items: await renderPages(context, pages, path, pageCount), meta: { pageCount } };
    },
  };
}

/** Whether an image input can be asked for several pages: a multi-page TIFF. */
export function isPagedImage(extension?: string): boolean {
  return PAGED_EXTENSIONS.has(extension ?? "");
}

async function renderPages(
  context: StrategyRenderContext,
  pages: readonly number[],
  decoded?: string,
  knownPageCount?: number,
): Promise<StrategyRenderResult[]> {
  const path = decoded ?? (await decodedPath(context));
  if (!isPagedImage(context.input.extension)) {
    if (pages.some((page) => page !== 1)) {
      throw new QuicklookInputError("This image has a single page.");
    }

    return [{ path, sourceKind: "image", meta: { page: 1 } }];
  }

  const pageCount = knownPageCount ?? (await countPages(context, path));
  const outOfRange = pages.find((page) => page < 1 || page > pageCount);
  if (outOfRange !== undefined) {
    throw new QuicklookInputError(`Page ${outOfRange} is out of range (1-${pageCount}).`);
  }

  return Promise.all(
    pages.map(async (page) => ({
      buffer: await sharp(path, { page: page - 1 }).png().toBuffer(),
      sourceKind: "image" as const,
      meta: { page },
    })),
  );
}

async function countPages(context: StrategyRenderContext, path: string): Promise<number> {
  if (!isPagedImage(context.input.extension)) {
    return 1;
  }

  return (await sharp(path).metadata()).pages ?? 1;
}

/** The input as a file sharp can read: the original, or a PNG decoded from a HEIC or BMP photo. */
async function decodedPath(context: StrategyRenderContext): Promise<string> {
  const extension = context.input.extension ?? "";

  if (HEIF_EXTENSIONS.has(extension)) {
    const binaryPath = context.runtime.heif.path;
    if (!binaryPath) {
      throw new QuicklookDependencyError("libheif (heif-dec or heif-convert) is required to render HEIC previews.");
    }

    const outputPath = join(context.workDir, "heif-decoded.png");
    await runCommand(binaryPath, [context.input.path, outputPath], { timeoutMs: context.limits.timeoutMs });
    return outputPath;
  }

  if (FFMPEG_EXTENSIONS.has(extension)) {
    const binaryPath = context.runtime.ffmpeg.path;
    if (!binaryPath) {
      throw new QuicklookDependencyError("ffmpeg is required to render BMP previews.");
    }

    const outputPath = join(context.workDir, "bitmap-decoded.png");
    await runCommand(binaryPath, ["-hide_banner", "-loglevel", "error", "-y", "-i", context.input.path, outputPath], {
      timeoutMs: context.limits.timeoutMs,
    });
    return outputPath;
  }

  return context.input.path;
}
