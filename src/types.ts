export type QuicklookOutputFormat = "webp" | "png";

export type QuicklookSourceKind = "image" | "video" | "pdf" | "office" | "html" | "text" | "epub" | "unknown";

export type QuicklookFit = "contain" | "cover";

export type ProbeFailureReason =
  | "unsupported_format"
  | "missing_dependency"
  | "input_too_large"
  | "invalid_input";

export interface QuicklookPathInput {
  path: string;
  filename?: string;
  mimeType?: string;
}

export interface QuicklookBufferInput {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}

export interface QuicklookStreamInput {
  stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream;
  filename: string;
  mimeType?: string;
  size?: number;
}

export type QuicklookInput = QuicklookPathInput | QuicklookBufferInput | QuicklookStreamInput;

export type QuicklookSizeRequest = { maxEdge: number } | { width: number; height: number; fit?: QuicklookFit };

export interface QuicklookRequest {
  size?: QuicklookSizeRequest;
  format?: QuicklookOutputFormat;
  page?: number;
  noUpscale?: boolean;
}

export interface QuicklookMetadata {
  page?: number;
  pageCount?: number;
  durationMs?: number;
}

export interface QuicklookResult {
  buffer: Buffer;
  mimeType: "image/webp" | "image/png";
  width: number;
  height: number;
  strategy: string;
  sourceKind: QuicklookSourceKind;
  meta?: QuicklookMetadata;
}

export interface ProbeResult {
  supported: boolean;
  sourceKind: QuicklookSourceKind;
  strategyId?: string;
  mimeType?: string;
  extension?: string;
  reason?: ProbeFailureReason;
  details?: string;
}

export interface RuntimeBinaryCapability {
  name: string;
  available: boolean;
  path?: string;
  version?: string;
  disabled?: boolean;
}

export interface RuntimeCapabilities {
  ffmpeg: RuntimeBinaryCapability;
  pdftocairo: RuntimeBinaryCapability;
  pdftoppm: RuntimeBinaryCapability;
  libreoffice: RuntimeBinaryCapability;
  chromium: RuntimeBinaryCapability;
}

export interface QuicklookBinaryOptions {
  ffmpeg?: string | false;
  pdftocairo?: string | false;
  pdftoppm?: string | false;
  libreoffice?: string | false;
  chromium?: string | false;
}

export interface QuicklookLimits {
  timeoutMs?: number;
  maxInputBytes?: number;
}

export interface NormalizedQuicklookLimits {
  timeoutMs: number;
  maxInputBytes: number;
}

export type NormalizedQuicklookSizeRequest =
  | { mode: "max-edge"; maxEdge: number }
  | { mode: "box"; width: number; height: number; fit: QuicklookFit };

export interface NormalizedQuicklookRequest {
  size: NormalizedQuicklookSizeRequest;
  format: QuicklookOutputFormat;
  page: number;
  noUpscale: boolean;
}

export interface ResolvedInput {
  inputKind: "path" | "buffer" | "stream";
  path: string;
  filename: string;
  declaredMimeType?: string;
  detectedMimeType?: string;
  mimeType?: string;
  extension?: string;
  sourceKind: QuicklookSourceKind;
  sizeInBytes: number;
}

export interface ProbeInput {
  inputKind: "path" | "buffer" | "stream";
  path?: string;
  filename: string;
  declaredMimeType?: string;
  detectedMimeType?: string;
  mimeType?: string;
  extension?: string;
  sourceKind: QuicklookSourceKind;
  sizeInBytes?: number;
}

export interface StrategyRenderContext {
  input: ResolvedInput;
  request: NormalizedQuicklookRequest;
  runtime: RuntimeCapabilities;
  workDir: string;
  limits: NormalizedQuicklookLimits;
}

export interface StrategyRenderResult {
  path?: string;
  buffer?: Buffer;
  sourceKind?: QuicklookSourceKind;
  meta?: QuicklookMetadata;
}

export interface QuicklookStrategy {
  id: string;
  priority: number;
  match(input: ProbeInput | ResolvedInput, runtime: RuntimeCapabilities): Promise<number | null> | number | null;
  render(context: StrategyRenderContext): Promise<StrategyRenderResult>;
}

export interface QuicklookOptions {
  binaries?: QuicklookBinaryOptions;
  limits?: QuicklookLimits;
  strategies?: QuicklookStrategy[];
}

export interface NormalizedQuicklookOptions {
  binaries: QuicklookBinaryOptions;
  limits: NormalizedQuicklookLimits;
  strategies: QuicklookStrategy[];
}

export interface QuicklookInstance {
  generate(input: QuicklookInput, request?: QuicklookRequest): Promise<QuicklookResult>;
  probe(input: QuicklookInput): Promise<ProbeResult>;
  getRuntimeCapabilities(): Promise<RuntimeCapabilities>;
}
