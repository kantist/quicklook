import { pathToFileURL } from "node:url";

import { chromium, type Page, type ViewportSize } from "playwright-core";

import { QuicklookDependencyError, QuicklookRenderError } from "../errors.js";

import type { NormalizedQuicklookLimits, NormalizedQuicklookRequest, ResolvedInput, RuntimeCapabilities } from "../types.js";

const DEFAULT_VIEWPORT = { width: 1200, height: 1600 } as const;
const MAX_CAPTURE_HEIGHT = 2400;
const MIN_VIEWPORT_WIDTH = 900;
const MAX_VIEWPORT_WIDTH = 1600;
const MIN_VIEWPORT_HEIGHT = 720;
const MAX_VIEWPORT_HEIGHT = 1200;

export async function renderHtmlPreview(
  input: ResolvedInput,
  request: NormalizedQuicklookRequest,
  runtime: RuntimeCapabilities,
  limits: NormalizedQuicklookLimits,
): Promise<Buffer> {
  const executablePath = runtime.chromium.path;

  if (!executablePath) {
    throw new QuicklookDependencyError("Chromium or Chrome is required to render HTML previews.");
  }

  const viewport = resolveViewport(request);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    timeout: limits.timeoutMs,
    args: ["--allow-file-access-from-files", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({
      viewport,
      screen: viewport,
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(limits.timeoutMs);
    page.setDefaultTimeout(limits.timeoutMs);

    await page.goto(pathToFileURL(input.path).href, { waitUntil: "domcontentloaded" });
    await settlePage(page, limits.timeoutMs);

    return await page.screenshot({
      type: "png",
      clip: await resolveClip(page, viewport),
      animations: "disabled",
      caret: "hide",
      scale: "device",
    });
  } catch (error) {
    throw new QuicklookRenderError("Failed to render HTML preview.", { cause: error as Error });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function resolveViewport(request: NormalizedQuicklookRequest): ViewportSize {
  if (request.size.mode === "box") {
    return {
      width: clamp(request.size.width * 2, MIN_VIEWPORT_WIDTH, MAX_VIEWPORT_WIDTH),
      height: clamp(request.size.height * 2, MIN_VIEWPORT_HEIGHT, MAX_VIEWPORT_HEIGHT),
    };
  }

  return { ...DEFAULT_VIEWPORT };
}

async function settlePage(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForLoadState("load").catch(() => undefined);
  await page.waitForLoadState("networkidle", {
    timeout: Math.max(500, Math.min(2_500, Math.floor(timeoutMs / 4))),
  }).catch(() => undefined);
  await page.evaluate(async () => {
    const browserGlobals = globalThis as unknown as {
      requestAnimationFrame: (callback: () => void) => number;
      document: {
        fonts?: {
          status?: string;
          ready: Promise<unknown>;
        };
      };
    };

    await new Promise<void>((resolve) => {
      browserGlobals.requestAnimationFrame(() => {
        browserGlobals.requestAnimationFrame(() => resolve());
      });
    });

    const fonts = browserGlobals.document.fonts;

    if (fonts && fonts.status !== "loaded") {
      await fonts.ready.catch(() => undefined);
    }
  });
}

async function resolveClip(page: Page, viewport: ViewportSize): Promise<{ x: number; y: number; width: number; height: number }> {
  const bounds = await page.evaluate(() => {
    const browserGlobals = globalThis as unknown as {
      document: {
        documentElement: {
          clientWidth: number;
          clientHeight: number;
          scrollWidth: number;
          scrollHeight: number;
        };
        body: {
          clientWidth: number;
          clientHeight: number;
          scrollWidth: number;
          scrollHeight: number;
        } | null;
      };
    };
    const root = browserGlobals.document.documentElement;
    const body = browserGlobals.document.body;

    return {
      width: Math.max(root.clientWidth, root.scrollWidth, body?.clientWidth ?? 0, body?.scrollWidth ?? 0),
      height: Math.max(root.clientHeight, root.scrollHeight, body?.clientHeight ?? 0, body?.scrollHeight ?? 0),
    };
  });

  return {
    x: 0,
    y: 0,
    width: Math.max(1, Math.ceil(Math.min(bounds.width, viewport.width))),
    height: Math.max(1, Math.ceil(Math.min(bounds.height, MAX_CAPTURE_HEIGHT))),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}
