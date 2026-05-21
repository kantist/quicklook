import { QuicklookRenderError } from "../errors.js";
import { postprocessRenderedOutput } from "./postprocess.js";

import type { QuicklookResult, QuicklookStrategy, StrategyRenderContext } from "../types.js";

const TRIMMED_OFFICE_EXTENSIONS = new Set(["csv", "xls", "xlsx"]);

export async function renderWithStrategy(
  strategy: QuicklookStrategy,
  context: StrategyRenderContext,
): Promise<QuicklookResult> {
  const rendered = await strategy.render(context);
  const source = rendered.path ?? rendered.buffer;

  if (!source) {
    throw new QuicklookRenderError(`Strategy ${strategy.id} did not produce render output.`);
  }

  const processed = await postprocessRenderedOutput(source, context.request, {
    trimWhitespace: shouldTrimWhitespace(context),
  });

  return {
    ...processed,
    strategy: strategy.id,
    sourceKind: rendered.sourceKind ?? context.input.sourceKind,
    meta: rendered.meta,
  };
}

function shouldTrimWhitespace(context: StrategyRenderContext): boolean {
  if (context.input.sourceKind !== "office") {
    return false;
  }

  return TRIMMED_OFFICE_EXTENSIONS.has(context.input.extension ?? "");
}
