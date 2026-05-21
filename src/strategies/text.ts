import { renderTextPreview } from "../renderers/text-preview.js";

import type { QuicklookStrategy } from "../types.js";

export function createTextStrategy(): QuicklookStrategy {
  return {
    id: "text",
    priority: 60,
    match(input) {
      return input.sourceKind === "text" ? 60 : null;
    },
    async render(context) {
      return {
        buffer: await renderTextPreview(context.input, context.request),
        sourceKind: "text",
      };
    },
  };
}
