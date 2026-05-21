import { QuicklookUnsupportedError } from "../errors.js";
import { extractEpubCover } from "../utils/epub.js";

import type { QuicklookKind, QuicklookStrategy } from "../types.js";

const KINDS: QuicklookKind[] = ["thumbnail", "preview"];

export function createEpubStrategy(): QuicklookStrategy {
  return {
    id: "epub",
    priority: 85,
    match(input) {
      const isEpub = input.sourceKind === "epub" || input.extension === "epub" || input.mimeType === "application/epub+zip";
      return isEpub ? 85 : null;
    },
    capabilities() {
      return KINDS;
    },
    async render(context) {
      if (context.input.extension !== "epub" && context.input.mimeType !== "application/epub+zip") {
        throw new QuicklookUnsupportedError("EPUB strategy received a non-EPUB input.");
      }

      const coverPath = await extractEpubCover({
        epubPath: context.input.path,
        workDir: context.workDir,
      });

      return {
        path: coverPath,
        sourceKind: "epub",
      };
    },
  };
}
