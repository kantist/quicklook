import { execa } from "execa";

import { QuicklookRenderError } from "../errors.js";

export async function runCommand(
  file: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<void> {
  const result = await execa(file, args, {
    cwd: options.cwd,
    reject: false,
    timeout: options.timeoutMs,
    windowsHide: true,
  });

  if (result.failed || result.exitCode !== 0) {
    throw new QuicklookRenderError(`Command failed: ${file}`, {
      cause: new Error(result.stderr || result.stdout || `Exit code: ${String(result.exitCode)}`),
    });
  }
}
