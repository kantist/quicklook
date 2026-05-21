import { join } from "node:path";

import { QuicklookDependencyError } from "../errors.js";
import { runCommand } from "../utils/exec.js";

import type { QuicklookKind, QuicklookStrategy } from "../types.js";

const KINDS: QuicklookKind[] = ["thumbnail", "preview"];

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
    capabilities() {
      return KINDS;
    },
    async render(context) {
      const binaryPath = context.runtime.ffmpeg.path;

      if (!binaryPath) {
        throw new QuicklookDependencyError("ffmpeg is required to render video previews.");
      }

      const outputPath = join(context.workDir, "video-frame.png");

      await runCommand(
        binaryPath,
        ["-hide_banner", "-loglevel", "error", "-y", "-i", context.input.path, "-vf", "thumbnail=24", "-frames:v", "1", outputPath],
        { timeoutMs: context.limits.timeoutMs },
      );

      return {
        path: outputPath,
        sourceKind: "video",
      };
    },
  };
}
