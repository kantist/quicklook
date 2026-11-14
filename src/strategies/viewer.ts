import { readFile } from "node:fs/promises";

import { chromium } from "playwright-core";

import { QuicklookDependencyError, QuicklookRenderError, QuicklookUnsupportedError } from "../errors.js";

import type { ProbeInput, QuicklookStrategy, ResolvedInput, StrategyRenderContext } from "../types.js";

/** How the viewer opens a file: its format, whether it needs WebGL (`3d`) or draws in 2D, and a code language. */
export interface ViewerThumbnailFormat {
  format: string;
  render: "2d" | "3d";
  language?: string;
}

export interface ViewerStrategyOptions {
  /** The deployed artifact viewer, as the server reaches it (an internal address): its `?thumbnail` page draws files. */
  viewerUrl: string;
  /** The formats it draws, by lower-case extension or whole file name (`kicad_pcb`, `step`). */
  formats: Record<string, ViewerThumbnailFormat>;
  /** Wall time for a 2D drawing (DXF, Gerber, KiCad), from page open to picture. Default 12 s. */
  timeout2dMs?: number;
  /** Wall time for a 3D render on SwiftShader (models, IFC). Default 8 s. */
  timeout3dMs?: number;
  /** Larger 3D files are not drawn (their card keeps its poster until the viewer's own capture). Default 20 MB. */
  max3dBytes?: number;
  /** Larger 2D files are not drawn. Default 60 MB. */
  max2dBytes?: number;
}

/** What the viewer's thumbnail page signals on `window.__dvinaThumbnail` (artifact-renderer `thumbnail-app.tsx`). */
type ThumbnailSignal = { state: "picture"; dataUrl: string } | { state: "ready" } | { state: "failed"; message: string };

/** The address the page fetches the file from: on the viewer's own origin, answered here, never by the viewer. */
const FILE_PATH = "/__quicklook/file";
/** After "ready", how long the page has to post its own picture before the window is captured instead. */
const PICTURE_GRACE_MS = 1_000;
const POLL_MS = 100;

/** As the HTML strategy runs Chromium, plus software WebGL (SwiftShader) for the 3D viewer on a GPU-less server. */
const BROWSER_ARGS = [
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
  "--disable-sync",
  "--no-pings",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

function lookup(input: ProbeInput | ResolvedInput, formats: Record<string, ViewerThumbnailFormat>) {
  const name = input.filename.toLowerCase().split("/").at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  return formats[name] ?? (dot > 0 ? formats[name.slice(dot + 1)] : undefined);
}

/** The window the page draws in: the asked picture's proportions, a little larger for a sharp downscale. */
function viewportFor(context: StrategyRenderContext): { width: number; height: number } {
  const size = context.request.size;
  if (size.mode === "box") return { width: Math.max(320, size.width), height: Math.max(240, size.height) };
  const edge = Math.min(1600, Math.max(480, size.maxEdge));
  return { width: edge, height: Math.round((edge * 3) / 4) };
}

/**
 * Files only the artifact viewer can draw (CAD drawings, Gerber and KiCad boards, 3D models, IFC), drawn by the
 * deployed viewer's thumbnail page in headless Chromium: the picture the viewer posts of the file, or a capture of the
 * page once it has drawn. The file is handed to the page from here; the page reaches nothing but the viewer's origin.
 * 3D runs on SwiftShader within a smaller budget. Not a default strategy: a host that runs the viewer adds it, so
 * quicklook's own formats stay as they are.
 */
export function createViewerStrategy(options: ViewerStrategyOptions): QuicklookStrategy {
  const viewer = new URL(options.viewerUrl);
  const timeout2d = options.timeout2dMs ?? 12_000;
  const timeout3d = options.timeout3dMs ?? 8_000;
  const max3d = options.max3dBytes ?? 20 * 1024 * 1024;
  const max2d = options.max2dBytes ?? 60 * 1024 * 1024;

  return {
    id: "viewer",
    priority: 90,
    match(input, runtime) {
      const format = lookup(input, options.formats);
      if (!format || !runtime.chromium.available) return null;
      const limit = format.render === "3d" ? max3d : max2d;
      if (input.sizeInBytes !== undefined && input.sizeInBytes > limit) return null;
      return 90;
    },
    async render(context) {
      const format = lookup(context.input, options.formats);
      if (!format) throw new QuicklookUnsupportedError("Not a format the viewer draws.");
      const executablePath = context.runtime.chromium.path;
      if (!executablePath) throw new QuicklookDependencyError("Chromium or Chrome is required for viewer thumbnails.");

      const budget = format.render === "3d" ? timeout3d : timeout2d;
      const bytes = await readFile(context.input.path);
      const viewport = viewportFor(context);
      const browser = await chromium.launch({ executablePath, headless: true, timeout: budget, env: {}, args: BROWSER_ARGS });

      try {
        const page = await (
          await browser.newContext({ viewport, screen: viewport, deviceScaleFactor: 1, serviceWorkers: "block", acceptDownloads: false })
        ).newPage();
        page.setDefaultTimeout(budget);
        page.setDefaultNavigationTimeout(budget);
        await page.route("**/*", async (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== viewer.origin) return route.abort("blockedbyclient");
          if (url.pathname === FILE_PATH) {
            return route.fulfill({ status: 200, body: bytes, contentType: context.input.mimeType ?? "application/octet-stream" });
          }
          return route.continue();
        });

        const address = new URL(viewer.href);
        address.searchParams.set("thumbnail", "");
        address.searchParams.set("format", format.format);
        address.searchParams.set("name", context.input.filename);
        address.searchParams.set("src", `${viewer.origin}${FILE_PATH}`);
        if (format.language) address.searchParams.set("lang", format.language);
        await page.goto(address.href, { waitUntil: "domcontentloaded" });
        // The budget is the viewer's drawing time, from its page on: starting Chromium has its own timeout.
        const deadline = Date.now() + budget;

        let readyAt: number | undefined;
        while (Date.now() < deadline) {
          const signal = (await page.evaluate(() => (globalThis as { __dvinaThumbnail?: unknown }).__dvinaThumbnail)) as ThumbnailSignal | undefined;
          if (signal?.state === "picture") {
            return { buffer: Buffer.from(signal.dataUrl.slice(signal.dataUrl.indexOf(",") + 1), "base64") };
          }
          if (signal?.state === "failed") throw new QuicklookUnsupportedError(`The viewer cannot draw this file: ${signal.message}`);
          if (signal?.state === "ready") {
            readyAt ??= Date.now();
            if (Date.now() - readyAt >= PICTURE_GRACE_MS) {
              return { buffer: await page.screenshot({ type: "png", animations: "disabled", caret: "hide" }) };
            }
          }
          await page.waitForTimeout(POLL_MS);
        }
        throw new QuicklookUnsupportedError(`The viewer did not draw the file within ${budget} ms.`);
      } catch (error) {
        if (error instanceof QuicklookUnsupportedError || error instanceof QuicklookDependencyError) throw error;
        throw new QuicklookRenderError("Failed to draw the file in the viewer.", { cause: error as Error });
      } finally {
        await browser.close().catch(() => undefined);
      }
    },
  };
}
