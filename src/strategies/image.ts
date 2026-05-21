import type { QuicklookKind, QuicklookStrategy } from "../types.js";

const KINDS: QuicklookKind[] = ["thumbnail", "preview"];

export function createImageStrategy(): QuicklookStrategy {
  return {
    id: "image",
    priority: 100,
    match(input) {
      return input.sourceKind === "image" ? 100 : null;
    },
    capabilities() {
      return KINDS;
    },
    async render(context) {
      return {
        path: context.input.path,
        sourceKind: "image",
      };
    },
  };
}
