import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

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
  };
}

export async function renderPdfToPng(args: {
  inputPath: string;
  page: number;
  runtime: RuntimeCapabilities;
  workDir: string;
  timeoutMs: number;
}): Promise<string> {
  if (args.runtime.pdftocairo.path) {
    const outputPrefix = join(args.workDir, "pdf-page");
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
    const outputPrefix = join(args.workDir, "pdf-page");
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

async function ensureExists(path: string): Promise<void> {
  try {
    await access(path, constants.F_OK);
  } catch (error) {
    throw new QuicklookRenderError(`Expected render output was not created: ${path}`, { cause: error as Error });
  }
}
