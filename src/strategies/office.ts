import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { QuicklookDependencyError, QuicklookRenderError } from "../errors.js";
import { hasOfficeRenderingSupport } from "../runtime/capabilities.js";
import { runCommand } from "../utils/exec.js";

import { renderPdfPageSelectionToPng, renderPdfToPng } from "./pdf.js";

import type { QuicklookStrategy, StrategyRenderContext } from "../types.js";

export function createOfficeStrategy(): QuicklookStrategy {
  return {
    id: "office",
    priority: 70,
    match(input, runtime) {
      if (input.sourceKind !== "office") {
        return null;
      }

      return hasOfficeRenderingSupport(runtime) ? 70 : null;
    },
    async render(context) {
      const convertedPdf = await convertOfficeDocumentToPdf(context);
      const outputPath = await renderPdfToPng({
        inputPath: convertedPdf,
        page: context.request.page,
        runtime: context.runtime,
        workDir: context.workDir,
        timeoutMs: context.limits.timeoutMs,
      });

      return {
        path: outputPath,
        sourceKind: "office",
        meta: { page: context.request.page },
      };
    },
    async renderBatch(context, pageSelection) {
      const convertedPdf = await convertOfficeDocumentToPdf(context);
      const renderedPages = await renderPdfPageSelectionToPng({
        inputPath: convertedPdf,
        pageSelection,
        runtime: context.runtime,
        workDir: context.workDir,
        timeoutMs: context.limits.timeoutMs,
      });

      return {
        items: renderedPages.pages.map((page) => ({
          path: page.path,
          sourceKind: "office",
          meta: { page: page.page },
        })),
        meta: renderedPages.pageCount ? { pageCount: renderedPages.pageCount } : undefined,
      };
    },
  };
}

async function convertOfficeDocumentToPdf(context: StrategyRenderContext): Promise<string> {
  const binaryPath = context.runtime.libreoffice.path;

  if (!binaryPath) {
    throw new QuicklookDependencyError("libreoffice is required to render office previews.");
  }

  const outputDir = join(context.workDir, "office-output");
  const profileDir = join(context.workDir, "libreoffice-profile");
  await mkdir(outputDir, { recursive: true });
  await mkdir(profileDir, { recursive: true });

  await runCommand(
    binaryPath,
    [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      "--headless",
      "--nologo",
      "--nodefault",
      "--nolockcheck",
      "--norestore",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      context.input.path,
    ],
    { timeoutMs: context.limits.timeoutMs },
  );

  return findConvertedPdf(outputDir);
}

async function findConvertedPdf(outputDir: string): Promise<string> {
  const files = await readdir(outputDir);
  const pdfFile = files.find((file) => file.toLowerCase().endsWith(".pdf"));

  if (!pdfFile) {
    throw new QuicklookRenderError("LibreOffice conversion did not produce a PDF file.");
  }

  return join(outputDir, pdfFile);
}
