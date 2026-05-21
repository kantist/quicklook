import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import process from "node:process";

import {
  QuicklookDependencyError,
  QuicklookInputError,
  QuicklookRenderError,
  QuicklookUnsupportedError,
  createQuicklook,
} from "../src/index.ts";

import type { QuicklookInput, QuicklookRequest, RuntimeCapabilities } from "../src/index.ts";

type CliMode = "path" | "buffer" | "stream";

interface CliOptions {
  inputPath: string;
  outputPath: string;
  mode: CliMode;
  format: "webp" | "png";
  maxEdge?: number;
  width?: number;
  height?: number;
  fit?: "contain" | "cover";
  noUpscale: boolean;
  page?: number;
  probeOnly: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const quicklook = createQuicklook();
  const runtime = await quicklook.getRuntimeCapabilities();
  const input = await buildInput(options);

  printRuntime(runtime);

  const probe = await quicklook.probe(input);
  console.log("\nProbe:");
  console.log(JSON.stringify(probe, null, 2));

  if (options.probeOnly) {
    return;
  }

  const request = buildRequest(options);
  const result = await quicklook.generate(input, request);

  await mkdir(resolveFromRoot("example/output"), { recursive: true });
  await writeFile(options.outputPath, result.buffer);

  console.log("\nGenerated:");
  console.log(
    JSON.stringify(
      {
        outputPath: options.outputPath,
        width: result.width,
        height: result.height,
        mimeType: result.mimeType,
        strategy: result.strategy,
        sourceKind: result.sourceKind,
        meta: result.meta,
      },
      null,
      2,
    ),
  );
}

function parseArgs(args: string[]): CliOptions {
  const defaults: CliOptions = {
    inputPath: resolveFromRoot("example/fixtures/sample.md"),
    outputPath: resolveFromRoot("example/output/sample.webp"),
    mode: "stream",
    format: "webp",
    maxEdge: 512,
    noUpscale: true,
    probeOnly: false,
  };

  const values = { ...defaults };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--input":
        values.inputPath = resolvePathValue(args[++index], "--input");
        break;
      case "--out":
        values.outputPath = resolvePathValue(args[++index], "--out");
        break;
      case "--mode":
        values.mode = parseMode(readRequiredValue(args[++index], "--mode"));
        break;
      case "--format": {
        const format = readRequiredValue(args[++index], "--format");

        if (format !== "webp" && format !== "png") {
          throw new QuicklookInputError("--format must be webp or png.");
        }

        values.format = format;
        break;
      }
      case "--max-edge":
        values.maxEdge = parsePositiveInteger(readRequiredValue(args[++index], "--max-edge"), "--max-edge");
        delete values.width;
        delete values.height;
        break;
      case "--width":
        values.width = parsePositiveInteger(readRequiredValue(args[++index], "--width"), "--width");
        delete values.maxEdge;
        break;
      case "--height":
        values.height = parsePositiveInteger(readRequiredValue(args[++index], "--height"), "--height");
        delete values.maxEdge;
        break;
      case "--fit": {
        const fit = readRequiredValue(args[++index], "--fit");

        if (fit !== "contain" && fit !== "cover") {
          throw new QuicklookInputError("--fit must be contain or cover.");
        }

        values.fit = fit;
        break;
      }
      case "--page":
        values.page = parsePositiveInteger(readRequiredValue(args[++index], "--page"), "--page");
        break;
      case "--allow-upscale":
        values.noUpscale = false;
        break;
      case "--probe":
        values.probeOnly = true;
        break;
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new QuicklookInputError(`Unknown argument: ${arg}`);
    }
  }

  if ((values.width && !values.height) || (!values.width && values.height)) {
    throw new QuicklookInputError("--width and --height must be provided together.");
  }

  if (!values.outputPath.endsWith(`.${values.format}`)) {
    const baseName = values.outputPath.replace(/\.[^.]+$/u, "");
    values.outputPath = `${baseName}.${values.format}`;
  }

  return values;
}

async function buildInput(options: CliOptions): Promise<QuicklookInput> {
  const filename = basename(options.inputPath);
  const mimeType = inferMimeTypeFromFilename(filename);

  switch (options.mode) {
    case "path":
      return {
        path: options.inputPath,
        filename,
        mimeType,
      };
    case "buffer":
      return {
        buffer: await readFile(options.inputPath),
        filename,
        mimeType,
      };
    case "stream":
      return {
        stream: createReadStream(options.inputPath),
        filename,
        mimeType,
      };
  }
}

function buildRequest(options: CliOptions): QuicklookRequest {
  return {
    format: options.format,
    noUpscale: options.noUpscale,
    page: options.page,
    size:
      options.width && options.height
        ? {
            width: options.width,
            height: options.height,
            fit: options.fit ?? "contain",
          }
        : {
            maxEdge: options.maxEdge ?? 512,
          },
  };
}

function printRuntime(runtime: RuntimeCapabilities): void {
  console.log("Runtime capabilities:");
  console.log(JSON.stringify(runtime, null, 2));
}

function printHelp(): void {
  console.log(`
Quicklook example runner

Usage:
  npm run example -- [options]

Options:
  --input <path>       Input file path
  --out <path>         Output file path
  --mode <mode>        path | buffer | stream (default: stream)
  --format <format>    webp | png (default: webp)
  --max-edge <px>      Resize so the longest edge matches this value (default: 512)
  --width <px>         Fixed output width
  --height <px>        Fixed output height
  --fit <mode>         contain | cover (used with width/height)
  --page <number>      Page number for PDF/office inputs
  --allow-upscale      Allow enlarging smaller inputs
  --probe              Only run probe()
  --help               Show this message

Examples:
  npm run example
  npm run example -- --mode path --input example/fixtures/sample.md
  npm run example -- --input /tmp/report.pdf --page 1 --max-edge 768
  npm run example -- --input /tmp/poster.png --width 1200 --height 800 --fit cover
`);
}

function parseMode(value: string): CliMode {
  if (value === "path" || value === "buffer" || value === "stream") {
    return value;
  }

  throw new QuicklookInputError("--mode must be path, buffer, or stream.");
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new QuicklookInputError(`${flag} must be a positive integer.`);
  }

  return parsed;
}

function readRequiredValue(value: string | undefined, flag: string): string {
  if (!value) {
    throw new QuicklookInputError(`Missing value for ${flag}.`);
  }

  return value;
}

function resolvePathValue(value: string | undefined, flag: string): string {
  const raw = readRequiredValue(value, flag);

  return isAbsolute(raw) ? raw : resolveFromRoot(raw);
}

function resolveFromRoot(path: string): string {
  return resolve(process.cwd(), path);
}

function inferMimeTypeFromFilename(filename: string): string | undefined {
  const extension = extname(filename).toLowerCase();

  switch (extension) {
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".html":
      return "text/html";
    case ".xml":
      return "application/xml";
    case ".csv":
      return "text/csv";
    default:
      return undefined;
  }
}

main().catch((error: unknown) => {
  if (
    error instanceof QuicklookInputError ||
    error instanceof QuicklookUnsupportedError ||
    error instanceof QuicklookDependencyError ||
    error instanceof QuicklookRenderError
  ) {
    console.error(error.name + ": " + error.message);

    if (error.cause instanceof Error) {
      console.error("Cause: " + error.cause.message);
    }

    process.exitCode = 1;
    return;
  }

  console.error(error);
  process.exitCode = 1;
});
