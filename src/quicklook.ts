import { QuicklookDependencyError, QuicklookInputError, QuicklookRenderError, QuicklookUnsupportedError } from "./errors.js";
import { normalizeInputDescriptor } from "./input/normalize.js";
import { materializeInput } from "./input/materialize.js";
import { sniffFileInput } from "./input/sniff.js";
import { renderManyWithStrategy } from "./pipeline/render.js";
import { selectStrategy } from "./pipeline/select-strategy.js";
import { probeInput } from "./probe.js";
import { getMissingDependenciesForSourceKind } from "./runtime/capabilities.js";
import { detectRuntimeCapabilities } from "./runtime/detect.js";
import { createEpubStrategy } from "./strategies/epub.js";
import { createHtmlStrategy } from "./strategies/html.js";
import { createImageStrategy } from "./strategies/image.js";
import { createOfficeStrategy } from "./strategies/office.js";
import { createPdfStrategy } from "./strategies/pdf.js";
import { createTextStrategy } from "./strategies/text.js";
import { createVideoStrategy } from "./strategies/video.js";
import { normalizeLimits, normalizePageSelection, normalizeRequest } from "./utils/limits.js";
import { createTempDirectory } from "./utils/temp.js";

import type {
  NormalizedQuicklookOptions,
  QuicklookBatchResult,
  QuicklookInput,
  QuicklookInstance,
  QuicklookOptions,
  QuicklookRequest,
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

  async function generate(input: QuicklookInput, request: QuicklookRequest = {}): Promise<QuicklookBatchResult> {
    const runtime = await getRuntimeCapabilities();
    const session = await createTempDirectory();

    try {
      const normalizedPageSelection = normalizePageSelection(request.page);
      const resolvedInput = await prepareResolvedInput(input, session.path, normalizedOptions.limits.maxInputBytes);
      const strategy = await selectStrategy(
        resolvedInput,
        runtime,
        normalizedOptions.strategies,
      );

      if (!strategy) {
        throw createUnsupportedError(resolvedInput, runtime);
      }

      if (typeof normalizedPageSelection !== "number" && !supportsMultiPageSelection(resolvedInput.sourceKind)) {
        throw new QuicklookInputError("Multi-page requests are only supported for PDF and office inputs.");
      }

      const pageSelection = typeof normalizedPageSelection === "number" ? [normalizedPageSelection] : normalizedPageSelection;

      return await renderManyWithStrategy(
        strategy,
        {
          input: resolvedInput,
          request: normalizeRequest(request),
          runtime,
          workDir: session.path,
          limits: normalizedOptions.limits,
        },
        pageSelection,
      );
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
  }

  return {
    generate,
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

function supportsMultiPageSelection(sourceKind: ResolvedInput["sourceKind"]): boolean {
  return sourceKind === "pdf" || sourceKind === "office";
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
    createHtmlStrategy(),
    createTextStrategy(),
  ];
}
