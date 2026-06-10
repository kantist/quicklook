import { renderHtmlPreview } from "../renderers/html-preview.js";
import { hasHtmlRenderingSupport } from "../runtime/capabilities.js";

import type { QuicklookStrategy } from "../types.js";

export function createHtmlStrategy(): QuicklookStrategy {
  return {
    id: "html",
    priority: 70,
    match(input, runtime) {
      if (input.sourceKind !== "html") {
        return null;
      }

      return hasHtmlRenderingSupport(runtime) ? 70 : null;
    },
    async render(context) {
      return {
        buffer: await renderHtmlPreview(context.input, context.request, context.runtime, context.limits),
        sourceKind: "html",
      };
    },
  };
}
