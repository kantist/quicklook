export { createQuicklook } from "./quicklook.js";
// Strategies a host adds for files only it can draw (`createQuicklook({ strategies: [...] })`); not defaults.
export { createArchiveStrategy, readZipSummary, zipPosterSvg, type ZipSummary } from "./strategies/archive.js";
export { createViewerStrategy, type ViewerStrategyOptions, type ViewerThumbnailFormat } from "./strategies/viewer.js";

export {
  QuicklookDependencyError,
  QuicklookError,
  QuicklookInputError,
  QuicklookRenderError,
  QuicklookTimeoutError,
  QuicklookUnsupportedError,
} from "./errors.js";

export type {
  NormalizedQuicklookLimits,
  NormalizedQuicklookRequest,
  ProbeFailureReason,
  ProbeInput,
  ProbeResult,
  QuicklookBinaryOptions,
  QuicklookBatchResult,
  QuicklookFit,
  QuicklookInput,
  QuicklookInstance,
  QuicklookLimits,
  QuicklookMetadata,
  QuicklookOptions,
  QuicklookOutputFormat,
  QuicklookPageSelection,
  QuicklookRequest,
  QuicklookResult,
  QuicklookSizeRequest,
  QuicklookSourceKind,
  QuicklookStrategy,
  ResolvedInput,
  RuntimeBinaryCapability,
  RuntimeCapabilities,
  StrategyRenderContext,
  StrategyRenderBatchResult,
  StrategyRenderResult,
} from "./types.js";
