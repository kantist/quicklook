import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { QuicklookDependencyError, QuicklookRenderError } from "../errors.js";
import { hasOfficeRenderingSupport } from "../runtime/capabilities.js";
import { runCommand } from "../utils/exec.js";

import { renderPdfToPng } from "./pdf.js";

import type { QuicklookStrategy } from "../types.js";

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

      const convertedPdf = await findConvertedPdf(outputDir);
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
  };
}

async function findConvertedPdf(outputDir: string): Promise<string> {
  const files = await readdir(outputDir);
  const pdfFile = files.find((file) => file.toLowerCase().endsWith(".pdf"));

  if (!pdfFile) {
    throw new QuicklookRenderError("LibreOffice conversion did not produce a PDF file.");
  }

  return join(outputDir, pdfFile);
}
