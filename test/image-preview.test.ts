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

test("auto-orients EXIF-rotated JPEG image previews before resizing", async () => {
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
      background: { r: 43, g: 91, b: 203 },
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

  const inputMetadata = await sharp(input).metadata();

  assert.equal(inputMetadata.width, 1600);
  assert.equal(inputMetadata.height, 900);
  assert.equal(inputMetadata.orientation, 6);

  const result = await quicklook.generate(
    {
      buffer: input,
      filename: "phone-photo.jpg",
    },
    {
      size: { maxEdge: 512 },
    },
  );

  assert.equal(result.strategy, "image");
  assert.equal(result.width, 288);
  assert.equal(result.height, 512);

  const outputMetadata = await sharp(result.buffer).metadata();

  assert.equal(outputMetadata.orientation, undefined);
});
