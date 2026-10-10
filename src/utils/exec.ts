import { tmpdir } from "node:os";

import { execa } from "execa";

const NO_PROXY_TARGET = "http://127.0.0.1:9";

/**
 * What a converter (LibreOffice, ffmpeg, Poppler, libheif) sees of the environment: a path to find its own
 * programs and nothing of the caller's secrets. Every proxy points nowhere, so a document that links to a URL
 * cannot make it fetch one.
 */
export function converterEnvironment(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: tmpdir(),
    TMPDIR: tmpdir(),
    LANG: "C.UTF-8",
    http_proxy: NO_PROXY_TARGET,
    https_proxy: NO_PROXY_TARGET,
    ftp_proxy: NO_PROXY_TARGET,
    all_proxy: NO_PROXY_TARGET,
    HTTP_PROXY: NO_PROXY_TARGET,
    HTTPS_PROXY: NO_PROXY_TARGET,
    ALL_PROXY: NO_PROXY_TARGET,
    no_proxy: "",
    NO_PROXY: "",
  };
}

import { QuicklookRenderError } from "../errors.js";

export async function runCommand(
  file: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<void> {
  const result = await execa(file, args, {
    cwd: options.cwd,
    env: converterEnvironment(),
    extendEnv: false,
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
