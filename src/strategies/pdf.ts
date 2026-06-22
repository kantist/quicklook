import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join } from "node:path";

import { QuicklookDependencyError, QuicklookRenderError } from "../errors.js";
import { hasPdfRenderingSupport } from "../runtime/capabilities.js";
import { runCommand } from "../utils/exec.js";

import type { QuicklookStrategy, RuntimeCapabilities } from "../types.js";

export function createPdfStrategy(): QuicklookStrategy {
  return {
    id: "pdf",
    priority: 80,
    match(input, runtime) {
      if (input.sourceKind !== "pdf") {
        return null;
      }

      return hasPdfRenderingSupport(runtime) ? 80 : null;
    },
    async render(context) {
      const outputPath = await renderPdfToPng({
        inputPath: context.input.path,
        page: context.request.page,
        runtime: context.runtime,
        workDir: context.workDir,
        timeoutMs: context.limits.timeoutMs,
      });

      return {
        path: outputPath,
        sourceKind: "pdf",
        meta: { page: context.request.page },
      };
    },
    async renderBatch(context, pageSelection) {
      const renderedPages = await renderPdfPageSelectionToPng({
        inputPath: context.input.path,
        pageSelection,
        runtime: context.runtime,
        workDir: context.workDir,
        timeoutMs: context.limits.timeoutMs,
      });

      return {
        items: renderedPages.pages.map((page) => ({
          path: page.path,
          sourceKind: "pdf",
          meta: { page: page.page },
        })),
        meta: renderedPages.pageCount ? { pageCount: renderedPages.pageCount } : undefined,
      };
    },
  };
}

export async function renderPdfPageSelectionToPng(args: {
  inputPath: string;
  pageSelection: readonly number[] | "all";
  runtime: RuntimeCapabilities;
  workDir: string;
  timeoutMs: number;
}): Promise<{ pages: Array<{ page: number; path: string }>; pageCount?: number }> {
  if (args.pageSelection === "all") {
    return renderAllPdfPagesToPng(args);
  }

  const pages: Array<{ page: number; path: string }> = [];

  for (const [index, page] of args.pageSelection.entries()) {
    pages.push({
      page,
      path: await renderPdfToPng({
        inputPath: args.inputPath,
        page,
        runtime: args.runtime,
        workDir: args.workDir,
        timeoutMs: args.timeoutMs,
        outputStem: `pdf-page-${index + 1}-${page}`,
      }),
    });
  }

  return { pages };
}

export async function renderPdfToPng(args: {
  inputPath: string;
  page: number;
  runtime: RuntimeCapabilities;
  workDir: string;
  timeoutMs: number;
  outputStem?: string;
}): Promise<string> {
  const outputStem = args.outputStem ?? "pdf-page";

  if (args.runtime.pdftocairo.path) {
    const outputPrefix = join(args.workDir, outputStem);
    const outputPath = `${outputPrefix}.png`;

    await runCommand(
      args.runtime.pdftocairo.path,
      ["-png", "-singlefile", "-f", String(args.page), "-l", String(args.page), args.inputPath, outputPrefix],
      { timeoutMs: args.timeoutMs },
    );

    await ensureExists(outputPath);
    return outputPath;
  }

  if (args.runtime.pdftoppm.path) {
    const outputPrefix = join(args.workDir, outputStem);
    const outputPath = `${outputPrefix}-${args.page}.png`;

    await runCommand(
      args.runtime.pdftoppm.path,
      ["-png", "-f", String(args.page), "-l", String(args.page), args.inputPath, outputPrefix],
      { timeoutMs: args.timeoutMs },
    );

    await ensureExists(outputPath);
    return outputPath;
  }

  if (!hasPdfRenderingSupport(args.runtime)) {
    throw new QuicklookDependencyError("pdftocairo or pdftoppm is required to render PDF previews.");
  }

  throw new QuicklookRenderError("Unable to render PDF preview.");
}

async function renderAllPdfPagesToPng(args: {
  inputPath: string;
  runtime: RuntimeCapabilities;
  workDir: string;
  timeoutMs: number;
}): Promise<{ pages: Array<{ page: number; path: string }>; pageCount: number }> {
  const outputPrefix = join(args.workDir, "pdf-pages");
  const outputName = basename(outputPrefix);

  if (args.runtime.pdftocairo.path) {
    await runCommand(
      args.runtime.pdftocairo.path,
      ["-png", args.inputPath, outputPrefix],
      { timeoutMs: args.timeoutMs },
    );

    const pages = await collectRenderedPages(dirname(outputPrefix), outputName);
    return {
      pages,
      pageCount: pages.length,
    };
  }

  if (args.runtime.pdftoppm.path) {
    await runCommand(
      args.runtime.pdftoppm.path,
      ["-png", args.inputPath, outputPrefix],
      { timeoutMs: args.timeoutMs },
    );

    const pages = await collectRenderedPages(dirname(outputPrefix), outputName);
    return {
      pages,
      pageCount: pages.length,
    };
  }

  if (!hasPdfRenderingSupport(args.runtime)) {
    throw new QuicklookDependencyError("pdftocairo or pdftoppm is required to render PDF previews.");
  }

  throw new QuicklookRenderError("Unable to render PDF preview.");
}

async function collectRenderedPages(directory: string, prefix: string): Promise<Array<{ page: number; path: string }>> {
  const files = await readdir(directory);
  const renderedPages = files
    .map((file) => {
      const match = new RegExp(`^${prefix}-(\\d+)\\.png$`, "u").exec(file);

      if (!match) {
        return null;
      }

      return {
        page: Number.parseInt(match[1] as string, 10),
        path: join(directory, file),
      };
    })
    .filter((file): file is { page: number; path: string } => file !== null)
    .sort((left, right) => left.page - right.page);

  if (renderedPages.length === 0) {
    throw new QuicklookRenderError(`Expected render output was not created for prefix: ${prefix}`);
  }

  return renderedPages;
}

async function ensureExists(path: string): Promise<void> {
  try {
    await access(path, constants.F_OK);
  } catch (error) {
    throw new QuicklookRenderError(`Expected render output was not created: ${path}`, { cause: error as Error });
  }
}
