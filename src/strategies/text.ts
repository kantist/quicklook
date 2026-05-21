import { renderTextPreview } from "../renderers/text-preview.js";

import type { QuicklookKind, QuicklookStrategy } from "../types.js";

const KINDS: QuicklookKind[] = ["thumbnail", "preview"];

export function createTextStrategy(): QuicklookStrategy {
  return {
    id: "text",
    priority: 60,
    match(input) {
      return input.sourceKind === "text" ? 60 : null;
    },
    capabilities() {
      return KINDS;
    },
    async render(context) {
      return {
        buffer: await renderTextPreview(context.input, context.request),
        sourceKind: "text",
      };
    },
  };
}
