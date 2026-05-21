import type { QuicklookStrategy } from "../types.js";

export function createImageStrategy(): QuicklookStrategy {
  return {
    id: "image",
    priority: 100,
    match(input) {
      return input.sourceKind === "image" ? 100 : null;
    },
    async render(context) {
      return {
        path: context.input.path,
        sourceKind: "image",
      };
    },
  };
}
