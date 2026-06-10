import { constants } from "node:fs";
import { access } from "node:fs/promises";

import { execa } from "execa";
import which from "which";

import type { QuicklookBinaryOptions, RuntimeBinaryCapability, RuntimeCapabilities } from "../types.js";

const BINARY_CANDIDATES = {
  ffmpeg: ["ffmpeg"],
  pdftocairo: ["pdftocairo"],
  pdftoppm: ["pdftoppm"],
  libreoffice: ["/Applications/LibreOffice.app/Contents/MacOS/soffice", "libreoffice", "soffice"],
  chromium: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Arc.app/Contents/MacOS/Arc",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome-stable",
    "google-chrome",
    "microsoft-edge",
    "msedge",
    "chromium",
    "chromium-browser",
  ],
} as const;

const VERSION_ARGS = {
  ffmpeg: ["-version"],
  pdftocairo: ["-v"],
  pdftoppm: ["-v"],
  libreoffice: ["--version"],
  chromium: ["--version"],
} as const;

export async function detectRuntimeCapabilities(binaries: QuicklookBinaryOptions = {}): Promise<RuntimeCapabilities> {
  const [ffmpeg, pdftocairo, pdftoppm, libreoffice, chromium] = await Promise.all([
    detectBinary("ffmpeg", binaries.ffmpeg, BINARY_CANDIDATES.ffmpeg, VERSION_ARGS.ffmpeg),
    detectBinary("pdftocairo", binaries.pdftocairo, BINARY_CANDIDATES.pdftocairo, VERSION_ARGS.pdftocairo),
    detectBinary("pdftoppm", binaries.pdftoppm, BINARY_CANDIDATES.pdftoppm, VERSION_ARGS.pdftoppm),
    detectBinary("libreoffice", binaries.libreoffice, BINARY_CANDIDATES.libreoffice, VERSION_ARGS.libreoffice),
    detectBinary("chromium", binaries.chromium, BINARY_CANDIDATES.chromium, VERSION_ARGS.chromium),
  ]);

  return {
    ffmpeg,
    pdftocairo,
    pdftoppm,
    libreoffice,
    chromium,
  };
}

async function detectBinary(
  name: string,
  configuredValue: string | false | undefined,
  candidates: readonly string[],
  versionArgs: readonly string[],
): Promise<RuntimeBinaryCapability> {
  if (configuredValue === false) {
    return {
      name,
      available: false,
      disabled: true,
    };
  }

  const path = configuredValue
    ? configuredValue.includes("/")
      ? await resolveAbsoluteBinary(configuredValue)
      : await which(configuredValue, { nothrow: true })
    : await findFirstAvailableBinary(candidates);

  if (!path) {
    return {
      name,
      available: false,
    };
  }

  const version = await readBinaryVersion(path, versionArgs);

  if (version === null) {
    return {
      name,
      available: false,
    };
  }

  return {
    name,
    available: true,
    path,
    version,
  };
}

async function findFirstAvailableBinary(candidates: readonly string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    const path = candidate.includes("/")
      ? await resolveAbsoluteBinary(candidate)
      : await which(candidate, { nothrow: true });

    if (path) {
      return path;
    }
  }

  return undefined;
}

async function resolveAbsoluteBinary(path: string): Promise<string | undefined> {
  try {
    await access(path, constants.X_OK);
    return path;
  } catch {
    return undefined;
  }
}

async function readBinaryVersion(path: string, args: readonly string[]): Promise<string | undefined | null> {
  const result = await execa(path, [...args], {
    reject: false,
    timeout: 5_000,
    windowsHide: true,
  });

  if (result.failed || result.exitCode !== 0 || result.timedOut) {
    return null;
  }

  const output = `${result.stdout}\n${result.stderr}`.trim();
  const firstLine = output.split(/\r?\n/u).find(Boolean);
  return firstLine?.trim() || undefined;
}
