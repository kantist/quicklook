import { QuicklookDependencyError, QuicklookInputError, QuicklookRenderError, QuicklookUnsupportedError } from "./errors.js";
import { normalizeInputDescriptor } from "./input/normalize.js";
import { materializeInput } from "./input/materialize.js";
import { sniffFileInput } from "./input/sniff.js";
import { renderWithStrategy } from "./pipeline/render.js";
import { selectStrategy } from "./pipeline/select-strategy.js";
import { probeInput } from "./probe.js";
import { getMissingDependenciesForSourceKind } from "./runtime/capabilities.js";
import { detectRuntimeCapabilities } from "./runtime/detect.js";
import { createEpubStrategy } from "./strategies/epub.js";
import { createImageStrategy } from "./strategies/image.js";
import { createOfficeStrategy } from "./strategies/office.js";
import { createPdfStrategy } from "./strategies/pdf.js";
import { createTextStrategy } from "./strategies/text.js";
import { createVideoStrategy } from "./strategies/video.js";
import { normalizeLimits, normalizeRequest } from "./utils/limits.js";
import { createTempDirectory } from "./utils/temp.js";

import type {
  NormalizedQuicklookOptions,
  QuicklookInput,
  QuicklookInstance,
  QuicklookOptions,
  QuicklookResult,
  ResolvedInput,
  RuntimeCapabilities,
} from "./types.js";

export function createQuicklook(options: QuicklookOptions = {}): QuicklookInstance {
  const normalizedOptions = normalizeOptions(options);
  let runtimePromise: Promise<RuntimeCapabilities> | undefined;

  const getRuntimeCapabilities = async (): Promise<RuntimeCapabilities> => {
    runtimePromise ??= detectRuntimeCapabilities(normalizedOptions.binaries);
    return runtimePromise;
  };

  return {
    async generate(input, request = {}) {
      const runtime = await getRuntimeCapabilities();
      const normalizedRequest = normalizeRequest(request);
      const session = await createTempDirectory();

      try {
        const resolvedInput = await prepareResolvedInput(input, session.path, normalizedOptions.limits.maxInputBytes);
        const strategy = await selectStrategy(
          resolvedInput,
          normalizedRequest.kind,
          runtime,
          normalizedOptions.strategies,
        );

        if (!strategy) {
          throw createUnsupportedError(resolvedInput, runtime);
        }

        return await renderWithStrategy(strategy, {
          input: resolvedInput,
          request: normalizedRequest,
          runtime,
          workDir: session.path,
          limits: normalizedOptions.limits,
        });
      } catch (error) {
        if (
          error instanceof QuicklookUnsupportedError ||
          error instanceof QuicklookDependencyError ||
          error instanceof QuicklookInputError ||
          error instanceof QuicklookRenderError
        ) {
          throw error;
        }

        throw new QuicklookRenderError("Failed to generate preview output.", { cause: error as Error });
      } finally {
        await session.cleanup();
      }
    },
    async probe(input) {
      const runtime = await getRuntimeCapabilities();

      return probeInput({
        input,
        runtime,
        strategies: normalizedOptions.strategies,
        maxInputBytes: normalizedOptions.limits.maxInputBytes,
      });
    },
    getRuntimeCapabilities,
  };
}

async function prepareResolvedInput(
  input: QuicklookInput,
  workDir: string,
  maxInputBytes: number,
): Promise<ResolvedInput> {
  const descriptor = normalizeInputDescriptor(input);
  const materialized = await materializeInput(descriptor, workDir, maxInputBytes);
  const sniffed = await sniffFileInput({
    filePath: materialized.path,
    filename: materialized.filename,
    declaredMimeType: descriptor.declaredMimeType,
  });

  return {
    inputKind: materialized.inputKind,
    path: materialized.path,
    filename: materialized.filename,
    sizeInBytes: materialized.sizeInBytes,
    ...sniffed,
  };
}

function createUnsupportedError(input: ResolvedInput, runtime: RuntimeCapabilities): Error {
  const missingDependencies = getMissingDependenciesForSourceKind(input.sourceKind, runtime);

  if (missingDependencies.length > 0) {
    return new QuicklookDependencyError(`Missing dependency: ${missingDependencies.join(", ")}.`);
  }

  return new QuicklookUnsupportedError(
    `Unsupported input format${input.extension ? `: .${input.extension}` : ""}.`,
  );
}

function normalizeOptions(options: QuicklookOptions): NormalizedQuicklookOptions {
  return {
    binaries: options.binaries ?? {},
    limits: normalizeLimits(options.limits),
    strategies: [...(options.strategies ?? []), ...createDefaultStrategies()],
  };
}

function createDefaultStrategies() {
  return [
    createImageStrategy(),
    createVideoStrategy(),
    createPdfStrategy(),
    createEpubStrategy(),
    createOfficeStrategy(),
    createTextStrategy(),
  ];
}
