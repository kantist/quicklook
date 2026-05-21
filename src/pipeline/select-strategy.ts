import type { ProbeInput, QuicklookStrategy, ResolvedInput, RuntimeCapabilities } from "../types.js";

export interface RankedStrategy {
  strategy: QuicklookStrategy;
  score: number;
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

      return {
        strategy,
        score,
      } satisfies RankedStrategy;
    }),
  );

  return ranked
    .filter((value): value is RankedStrategy => Boolean(value))
    .sort((left, right) => right.score - left.score || right.strategy.priority - left.strategy.priority);
}

export async function selectStrategy(
  input: ResolvedInput,
  runtime: RuntimeCapabilities,
  strategies: QuicklookStrategy[],
): Promise<QuicklookStrategy | undefined> {
  const ranked = await rankStrategies(input, runtime, strategies);
  return ranked[0]?.strategy;
}
