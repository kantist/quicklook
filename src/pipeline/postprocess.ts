import sharp, { type FitEnum } from "sharp";

import type { NormalizedQuicklookRequest, QuicklookOutputFormat } from "../types.js";

const TRIMMED_OUTPUT_MARGIN_PX = 10;

export async function postprocessRenderedOutput(
  source: Buffer | string,
  request: NormalizedQuicklookRequest,
  options: { trimWhitespace?: boolean } = {},
): Promise<{ buffer: Buffer; mimeType: "image/webp" | "image/png"; width: number; height: number }> {
  const transform = sharp(source, { density: 144 }).autoOrient();
  const marginPx = options.trimWhitespace ? TRIMMED_OUTPUT_MARGIN_PX : 0;

  if (options.trimWhitespace) {
    transform.trim({
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      threshold: 16,
    });
  }

  if (request.size.mode === "max-edge") {
    transform.resize({
      width: Math.max(1, request.size.maxEdge - marginPx * 2),
      height: Math.max(1, request.size.maxEdge - marginPx * 2),
      fit: "inside",
      withoutEnlargement: request.noUpscale,
    });
  } else {
    transform.resize({
      width: Math.max(1, request.size.width - marginPx * 2),
      height: Math.max(1, request.size.height - marginPx * 2),
      fit: mapFit(request.size.fit),
      withoutEnlargement: request.noUpscale,
    });
  }

  if (options.trimWhitespace) {
    transform.extend({
      top: marginPx,
      right: marginPx,
      bottom: marginPx,
      left: marginPx,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    });
  }

  applyOutputFormat(transform, request.format);
  const { data, info } = await transform.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    mimeType: request.format === "png" ? "image/png" : "image/webp",
    width: info.width,
    height: info.height,
  };
}

function applyOutputFormat(transform: sharp.Sharp, format: QuicklookOutputFormat): void {
  if (format === "png") {
    transform.png({ compressionLevel: 9 });
    return;
  }

  transform.webp({ quality: 82 });
}

function mapFit(value: "contain" | "cover"): keyof FitEnum {
  return value === "cover" ? "cover" : "inside";
}
