import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import sharp from "sharp";

import { createQuicklook } from "../src/index.ts";

test("renders html previews through chromium when available", async (context) => {
  const quicklook = createQuicklook({
    binaries: {
      ffmpeg: false,
      pdftocairo: false,
      pdftoppm: false,
      libreoffice: false,
    },
  });

  const runtime = await quicklook.getRuntimeCapabilities();

  if (!runtime.chromium.available) {
    context.skip("Chromium is not available in this environment.");
    return;
  }

  const fixtureDir = await mkdtemp(join(tmpdir(), "quicklook-html-"));
  context.after(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  const inputPath = join(fixtureDir, "preview.html");
  await writeFile(
    inputPath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #d14905 0%, #f7b538 100%);
        font-family: Georgia, serif;
      }

      article {
        width: min(560px, calc(100vw - 48px));
        padding: 32px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.88);
        box-shadow: 0 24px 70px rgba(93, 31, 7, 0.28);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 42px;
      }

      p {
        margin: 0;
        font-size: 20px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <article>
      <h1>Quicklook HTML</h1>
      <p>This preview should look like a rendered page, not plain text.</p>
    </article>
  </body>
</html>`,
  );

  const result = await quicklook.generate(
    {
      path: inputPath,
      mimeType: "text/html",
    },
    {
      size: { maxEdge: 256 },
    },
  );

  assert.equal(result.strategy, "html");
  assert.equal(result.sourceKind, "html");
  assert.equal(result.mimeType, "image/webp");
  assert.ok(result.width <= 256);
  assert.ok(result.height <= 256);

  const stats = await sharp(result.buffer).stats();
  assert.ok(stats.channels[0].mean > stats.channels[2].mean);
});
