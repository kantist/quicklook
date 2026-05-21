import { stat } from "node:fs/promises";

import { QuicklookInputError } from "./errors.js";
import { normalizeInputDescriptor } from "./input/normalize.js";
import { sniffBufferInput, sniffFileInput, sniffMetadataInput } from "./input/sniff.js";
import { rankStrategies } from "./pipeline/select-strategy.js";
import { getMissingDependenciesForSourceKind } from "./runtime/capabilities.js";

import type {
  ProbeFailureReason,
  ProbeInput,
  ProbeResult,
  QuicklookInput,
  QuicklookStrategy,
  RuntimeCapabilities,
} from "./types.js";

export async function probeInput(args: {
  input: QuicklookInput;
  runtime: RuntimeCapabilities;
  strategies: QuicklookStrategy[];
  maxInputBytes: number;
}): Promise<ProbeResult> {
  try {
    const inspectedInput = await inspectProbeInput(args.input, args.maxInputBytes);
    const ranked = await rankStrategies(inspectedInput, args.runtime, args.strategies);

    if (ranked[0]) {
      return {
        supported: true,
        sourceKind: inspectedInput.sourceKind,
        strategyId: ranked[0].strategy.id,
        mimeType: inspectedInput.mimeType,
        extension: inspectedInput.extension,
        kinds: ranked[0].capabilities,
      };
    }

    const missingDependencies = getMissingDependenciesForSourceKind(inspectedInput.sourceKind, args.runtime);

    if (missingDependencies.length > 0) {
      return {
        supported: false,
        sourceKind: inspectedInput.sourceKind,
        mimeType: inspectedInput.mimeType,
        extension: inspectedInput.extension,
        reason: "missing_dependency",
        details: `Missing dependency: ${missingDependencies.join(", ")}`,
      };
    }

    return {
      supported: false,
      sourceKind: inspectedInput.sourceKind,
      mimeType: inspectedInput.mimeType,
      extension: inspectedInput.extension,
      reason: "unsupported_format",
    };
  } catch (error) {
    if (error instanceof QuicklookInputError) {
      return {
        supported: false,
        sourceKind: "unknown",
        reason: probeReasonFromInputError(error),
        details: error.message,
      };
    }

    throw error;
  }
}

async function inspectProbeInput(input: QuicklookInput, maxInputBytes: number): Promise<ProbeInput> {
  const descriptor = normalizeInputDescriptor(input);

  if (descriptor.kind === "path") {
    const stats = await stat(descriptor.path as string);

    if (stats.size > maxInputBytes) {
      throw new QuicklookInputError(`Input exceeds maxInputBytes (${maxInputBytes}).`);
    }

    return {
      inputKind: descriptor.kind,
      path: descriptor.path,
      filename: descriptor.filename,
      sizeInBytes: stats.size,
      ...(await sniffFileInput({
        filePath: descriptor.path as string,
        filename: descriptor.filename,
        declaredMimeType: descriptor.declaredMimeType,
      })),
    };
  }

  if (descriptor.kind === "buffer") {
    const sizeInBytes = descriptor.buffer?.byteLength ?? 0;

    if (sizeInBytes > maxInputBytes) {
      throw new QuicklookInputError(`Input exceeds maxInputBytes (${maxInputBytes}).`);
    }

    return {
      inputKind: descriptor.kind,
      filename: descriptor.filename,
      sizeInBytes,
      ...(await sniffBufferInput({
        buffer: descriptor.buffer as Buffer,
        filename: descriptor.filename,
        declaredMimeType: descriptor.declaredMimeType,
      })),
    };
  }

  if (descriptor.sizeHint !== undefined && descriptor.sizeHint > maxInputBytes) {
    throw new QuicklookInputError(`Input exceeds maxInputBytes (${maxInputBytes}).`);
  }

  return {
    inputKind: descriptor.kind,
    filename: descriptor.filename,
    sizeInBytes: descriptor.sizeHint,
    ...sniffMetadataInput({
      filename: descriptor.filename,
      declaredMimeType: descriptor.declaredMimeType,
    }),
  };
}

function probeReasonFromInputError(error: QuicklookInputError): ProbeFailureReason {
  return error.message.includes("maxInputBytes") ? "input_too_large" : "invalid_input";
}
