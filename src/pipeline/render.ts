import { QuicklookRenderError } from "../errors.js";
import { postprocessRenderedOutput } from "./postprocess.js";

import type {
  QuicklookBatchResult,
  QuicklookResult,
  QuicklookStrategy,
  StrategyRenderContext,
  StrategyRenderResult,
} from "../types.js";

const TRIMMED_OFFICE_EXTENSIONS = new Set(["csv", "xls", "xlsx"]);

export async function renderWithStrategy(
  strategy: QuicklookStrategy,
  context: StrategyRenderContext,
): Promise<QuicklookResult> {
  return finalizeRenderedOutput(strategy, context, await strategy.render(context));
}

export async function renderManyWithStrategy(
  strategy: QuicklookStrategy,
  context: StrategyRenderContext,
  pageSelection: readonly number[] | "all",
): Promise<QuicklookBatchResult> {
  if (strategy.renderBatch) {
    const rendered = await strategy.renderBatch(context, pageSelection);

    return {
      items: await Promise.all(rendered.items.map((item) => finalizeRenderedOutput(strategy, context, item))),
      meta: rendered.meta,
    };
  }

  if (pageSelection === "all") {
    throw new QuicklookRenderError(`Strategy ${strategy.id} does not support rendering all pages.`);
  }

  const items: QuicklookResult[] = [];

  for (const page of pageSelection) {
    items.push(
      await renderWithStrategy(strategy, {
        ...context,
        request: {
          ...context.request,
          page,
        },
      }),
    );
  }

  return { items };
}

async function finalizeRenderedOutput(
  strategy: QuicklookStrategy,
  context: StrategyRenderContext,
  rendered: StrategyRenderResult,
): Promise<QuicklookResult> {
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
