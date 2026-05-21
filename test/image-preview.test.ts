import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { createQuicklook } from "../src/index.ts";

test("resizes image previews with maxEdge while preserving aspect ratio", async () => {
  const quicklook = createQuicklook({
    binaries: {
      ffmpeg: false,
      pdftocairo: false,
      pdftoppm: false,
      libreoffice: false,
    },
  });

  const input = await sharp({
    create: {
      width: 1600,
      height: 900,
      channels: 3,
      background: { r: 194, g: 65, b: 12 },
    },
  })
    .png()
    .toBuffer();

  const result = await quicklook.generate(
    {
      buffer: input,
      filename: "poster.png",
    },
    {
      size: { maxEdge: 512 },
    },
  );

  assert.equal(result.strategy, "image");
  assert.equal(result.width, 512);
  assert.equal(result.height, 288);
});
