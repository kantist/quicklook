import { QuicklookInputError } from "../errors.js";

import type {
  NormalizedQuicklookLimits,
  NormalizedQuicklookRequest,
  QuicklookLimits,
  QuicklookRequest,
} from "../types.js";

export const DEFAULT_MAX_INPUT_BYTES = 100 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_EDGE = 512;

export function normalizeLimits(limits?: QuicklookLimits): NormalizedQuicklookLimits {
  return {
    timeoutMs: normalizePositiveInteger(limits?.timeoutMs ?? DEFAULT_TIMEOUT_MS, "limits.timeoutMs"),
    maxInputBytes: normalizePositiveInteger(
      limits?.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES,
      "limits.maxInputBytes",
    ),
  };
}

export function normalizeRequest(request: QuicklookRequest = {}): NormalizedQuicklookRequest {
  const format = request.format ?? "webp";
  const page = normalizePositiveInteger(request.page ?? 1, "request.page");
  const noUpscale = request.noUpscale ?? true;

  if (request.size && "maxEdge" in request.size) {
    return {
      format,
      page,
      noUpscale,
      size: {
        mode: "max-edge",
        maxEdge: normalizePositiveInteger(request.size.maxEdge, "request.size.maxEdge"),
      },
    };
  }

  if (request.size && "width" in request.size && "height" in request.size) {
    return {
      format,
      page,
      noUpscale,
      size: {
        mode: "box",
        width: normalizePositiveInteger(request.size.width, "request.size.width"),
        height: normalizePositiveInteger(request.size.height, "request.size.height"),
        fit: request.size.fit ?? "contain",
      },
    };
  }

  return {
    format,
    page,
    noUpscale,
    size: {
      mode: "max-edge",
      maxEdge: DEFAULT_MAX_EDGE,
    },
  };
}

export function assertWithinLimit(value: number, max: number, message: string): void {
  if (value > max) {
    throw new QuicklookInputError(message);
  }
}

function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new QuicklookInputError(`${fieldName} must be a positive integer.`);
  }

  return value;
}
