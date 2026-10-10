import { readFile } from "node:fs/promises";

import { chromium, type Page, type ViewportSize } from "playwright-core";
import sharp from "sharp";

import { QuicklookDependencyError, QuicklookRenderError } from "../errors.js";

import type { NormalizedQuicklookLimits, NormalizedQuicklookRequest, ResolvedInput, RuntimeCapabilities } from "../types.js";

const DEFAULT_VIEWPORT = { width: 1200, height: 1600 } as const;
const MAX_CAPTURE_HEIGHT = 2400;
const MIN_VIEWPORT_WIDTH = 900;
const MAX_VIEWPORT_WIDTH = 1600;
const MIN_VIEWPORT_HEIGHT = 720;
const MAX_VIEWPORT_HEIGHT = 1200;

/**
 * An uploaded page is drawn as a picture of its markup and nothing more: it reaches no file, no network address
 * and no secret of the process that draws it, and it runs no script. Only inline styles and `data:` images, fonts
 * and media load.
 */
const UNTRUSTED_PAGE_POLICY =
  "default-src 'none'; style-src 'unsafe-inline' data:; img-src data:; font-src data:; media-src data:; base-uri 'none'; form-action 'none'";

/**
 * Chromium is started with no environment of its own (the caller's secrets stay out of its reach), no file access
 * between pages, and every connection sent to a proxy that does not exist, so a request the page or the browser
 * makes cannot leave the machine, the cloud metadata address included.
 */
const BROWSER_ARGS = [
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
  "--disable-sync",
  "--no-pings",
  "--proxy-server=127.0.0.1:9",
  "--proxy-bypass-list=<-loopback>",
];

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
  const html = await readFile(input.path, "utf8");
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    timeout: limits.timeoutMs,
    env: {},
    args: BROWSER_ARGS,
  });

  try {
    const context = await browser.newContext({
      viewport,
      screen: viewport,
      deviceScaleFactor: 1,
      javaScriptEnabled: request.trustedHtmlScripts,
      offline: true,
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    // Nothing is fetched: the page is set as content, so any URL it names (http, file, the metadata address) is refused.
    await context.route("**/*", (route) => route.abort("blockedbyclient"));

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(limits.timeoutMs);
    page.setDefaultTimeout(limits.timeoutMs);

    await page.setContent(request.trustedHtmlScripts ? html : withPolicy(html), { waitUntil: "load" });
    if (request.trustedHtmlScripts) await settlePage(page, limits.timeoutMs);

    const shot = await page.screenshot({ type: "png", fullPage: true, animations: "disabled", caret: "hide", scale: "device" });
    return await cropToCapture(shot, viewport);
  } catch (error) {
    throw new QuicklookRenderError("Failed to render HTML preview.", { cause: error as Error });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** The page with the policy that keeps it from loading anything, first in its markup so it governs all of it. */
function withPolicy(html: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${UNTRUSTED_PAGE_POLICY}">${html}`;
}

/** The top of the page, as wide as the viewport and at most MAX_CAPTURE_HEIGHT tall. */
async function cropToCapture(screenshot: Buffer, viewport: ViewportSize): Promise<Buffer> {
  const { width = viewport.width, height = viewport.height } = await sharp(screenshot).metadata();
  return sharp(screenshot)
    .extract({ left: 0, top: 0, width: Math.min(width, viewport.width), height: Math.min(height, MAX_CAPTURE_HEIGHT) })
    .png()
    .toBuffer();
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}
