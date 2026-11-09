import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { QuicklookDependencyError, QuicklookRenderError, QuicklookTimeoutError } from "../errors.js";
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
      const converted = await convertOfficeDocumentToPdf(context, [context.request.page]);
      const outputPath = await renderPdfToPng({
        inputPath: converted.path,
        page: converted.pageOf(context.request.page),
        size: context.request.size,
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
      const converted = await convertOfficeDocumentToPdf(context, pageSelection);
      const renderedPages = await renderPdfPageSelectionToPng({
        inputPath: converted.path,
        pageSelection: pageSelection === "all" ? "all" : pageSelection.map((page) => converted.pageOf(page)),
        size: context.request.size,
        runtime: context.runtime,
        workDir: context.workDir,
        timeoutMs: context.limits.timeoutMs,
      });

      return {
        items: renderedPages.pages.map((page, index) => ({
          path: page.path,
          sourceKind: "office",
          meta: { page: pageSelection === "all" ? page.page : (pageSelection[index] ?? page.page) },
        })),
        meta: renderedPages.pageCount ? { pageCount: renderedPages.pageCount } : undefined,
      };
    },
  };
}

/** The PDF LibreOffice made, and where a page of the document is in it. */
type ConvertedPdf = { path: string; pageOf(page: number): number };

/**
 * The document as a PDF of only the pages asked for: LibreOffice lays the document out, but writes (and re-encodes the
 * pictures of) those pages alone. A thumbnail asks for page 1, and a whole report's export ran past the time limit on
 * every ask (dvina prod 2026-11-09: two DOCX reports, 30 s each; a 30-page report with 12 charts took 8.1 s whole and
 * 2.0 s for its first page). The pages go to LibreOffice's PDF export as its `PageRange`, which it applies to a text
 * document, a sheet and a presentation alike. Should that export make no PDF, the whole document is converted, as
 * before; a conversion that ran out of time is not tried again.
 */
async function convertOfficeDocumentToPdf(
  context: StrategyRenderContext,
  pages: readonly number[] | "all",
): Promise<ConvertedPdf> {
  const binaryPath = context.runtime.libreoffice.path;

  if (!binaryPath) {
    throw new QuicklookDependencyError("libreoffice is required to render office previews.");
  }

  const profileDir = join(context.workDir, "libreoffice-profile");
  await mkdir(profileDir, { recursive: true });

  if (pages !== "all") {
    const wanted = [...new Set(pages)].sort((a, b) => a - b);
    const limited = await convertToPdf(binaryPath, context, profileDir, "office-pages", pdfOfPages(wanted)).catch(
      (error: unknown) => {
        if (error instanceof QuicklookTimeoutError) throw error;
        return undefined;
      },
    );
    if (limited) return { path: limited, pageOf: (page) => wanted.indexOf(page) + 1 };
  }

  const whole = await convertToPdf(binaryPath, context, profileDir, "office-output", "pdf");
  if (!whole) {
    throw new QuicklookRenderError("LibreOffice conversion did not produce a PDF file.");
  }

  return { path: whole, pageOf: (page) => page };
}

/** LibreOffice's PDF export of the given pages (1-based, ascending), as `--convert-to` takes it. */
function pdfOfPages(pages: readonly number[]): string {
  return `pdf:writer_pdf_Export:${JSON.stringify({ PageRange: { type: "string", value: pages.join(",") } })}`;
}

/** Runs one LibreOffice conversion into its own folder; the PDF it made, if any. */
async function convertToPdf(
  binaryPath: string,
  context: StrategyRenderContext,
  profileDir: string,
  folder: string,
  convertTo: string,
): Promise<string | undefined> {
  const outputDir = join(context.workDir, folder);
  await mkdir(outputDir, { recursive: true });

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
      convertTo,
      "--outdir",
      outputDir,
      context.input.path,
    ],
    { timeoutMs: context.limits.timeoutMs },
  );

  return findConvertedPdf(outputDir);
}

async function findConvertedPdf(outputDir: string): Promise<string | undefined> {
  const files = await readdir(outputDir);
  const pdfFile = files.find((file) => file.toLowerCase().endsWith(".pdf"));
  return pdfFile ? join(outputDir, pdfFile) : undefined;
}
