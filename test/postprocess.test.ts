import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { postprocessRenderedOutput } from "../src/pipeline/postprocess.ts";

test("trims white margins before resizing when requested", async () => {
  const source = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 120,
            height: 220,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
          },
        })
          .png()
          .toBuffer(),
        left: 140,
        top: 90,
      },
    ])
    .png()
    .toBuffer();

  const untrimmed = await postprocessRenderedOutput(
    source,
    {
      kind: "preview",
      format: "webp",
      noUpscale: true,
      page: 1,
      size: { mode: "max-edge", maxEdge: 200 },
    },
    { trimWhitespace: false },
  );

  const trimmed = await postprocessRenderedOutput(
    source,
    {
      kind: "preview",
      format: "webp",
      noUpscale: true,
      page: 1,
      size: { mode: "max-edge", maxEdge: 200 },
    },
    { trimWhitespace: true },
  );

  assert.equal(untrimmed.width, 200);
  assert.equal(untrimmed.height, 200);
  assert.equal(trimmed.height, 200);
  assert.ok(trimmed.width < untrimmed.width);
});
