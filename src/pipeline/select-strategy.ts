import type { ProbeInput, QuicklookKind, QuicklookStrategy, ResolvedInput, RuntimeCapabilities } from "../types.js";

export interface RankedStrategy {
  strategy: QuicklookStrategy;
  score: number;
  capabilities: QuicklookKind[];
}

export async function rankStrategies(
  input: ProbeInput | ResolvedInput,
  runtime: RuntimeCapabilities,
  strategies: QuicklookStrategy[],
): Promise<RankedStrategy[]> {
  const ranked = await Promise.all(
    strategies.map(async (strategy) => {
      const score = await strategy.match(input, runtime);

      if (score === null) {
        return undefined;
      }

      const capabilities = await strategy.capabilities(input, runtime);

      return {
        strategy,
        score,
        capabilities,
      } satisfies RankedStrategy;
    }),
  );

  return ranked
    .filter((value): value is RankedStrategy => Boolean(value))
    .sort((left, right) => right.score - left.score || right.strategy.priority - left.strategy.priority);
}

export async function selectStrategy(
  input: ResolvedInput,
  kind: QuicklookKind,
  runtime: RuntimeCapabilities,
  strategies: QuicklookStrategy[],
): Promise<QuicklookStrategy | undefined> {
  const ranked = await rankStrategies(input, runtime, strategies);
  return ranked.find((entry) => entry.capabilities.includes(kind))?.strategy;
}
