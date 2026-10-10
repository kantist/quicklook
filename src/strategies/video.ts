import { join } from "node:path";

import { QuicklookDependencyError } from "../errors.js";
import { runCommand } from "../utils/exec.js";

import type { QuicklookStrategy } from "../types.js";

/**
 * The demuxer each video is read with, chosen by its extension rather than guessed from its bytes: a playlist (HLS,
 * concat) uploaded as "video.mp4" would otherwise be followed, and the files it names drawn into the preview.
 */
const DEMUXERS: Record<string, string> = {
  mp4: "mov",
  mov: "mov",
  m4v: "mov",
  "3gp": "mov",
  webm: "matroska",
  mkv: "matroska",
  avi: "avi",
};

export function createVideoStrategy(): QuicklookStrategy {
  return {
    id: "video",
    priority: 90,
    match(input, runtime) {
      if (input.sourceKind !== "video") {
        return null;
      }

      return runtime.ffmpeg.available ? 90 : null;
    },
    async render(context) {
      const binaryPath = context.runtime.ffmpeg.path;

      if (!binaryPath) {
        throw new QuicklookDependencyError("ffmpeg is required to render video previews.");
      }

      const outputPath = join(context.workDir, "video-frame.png");

      await runCommand(
        binaryPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-protocol_whitelist",
          "file",
          ...(DEMUXERS[context.input.extension ?? ""] ? ["-f", DEMUXERS[context.input.extension ?? ""]!] : []),
          "-i",
          context.input.path,
          "-vf",
          "thumbnail=24",
          "-frames:v",
          "1",
          outputPath,
        ],
        { timeoutMs: context.limits.timeoutMs },
      );

      return {
        path: outputPath,
        sourceKind: "video",
      };
    },
  };
}
