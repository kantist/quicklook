import assert from "node:assert/strict";
import test from "node:test";

import { zipSync, strToU8 } from "fflate";
import sharp from "sharp";

import { createQuicklook } from "../src/index.ts";

test("extracts an EPUB cover image and renders it as a preview", async () => {
  const quicklook = createQuicklook({
    binaries: {
      ffmpeg: false,
      pdftocairo: false,
      pdftoppm: false,
      libreoffice: false,
    },
  });

  const coverImage = await sharp({
    create: {
      width: 900,
      height: 1400,
      channels: 3,
      background: { r: 219, g: 39, b: 119 },
    },
  })
    .jpeg()
    .toBuffer();

  const epubBuffer = Buffer.from(
    zipSync({
      mimetype: strToU8("application/epub+zip"),
      "META-INF/container.xml": strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`),
      "OEBPS/content.opf": strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg"/>
  </manifest>
  <spine />
</package>`),
      "OEBPS/images/cover.jpg": new Uint8Array(coverImage),
    }),
  );

  const result = await quicklook.generate(
    {
      buffer: epubBuffer,
      filename: "storybook.epub",
      mimeType: "application/epub+zip",
    },
    {
      size: { maxEdge: 256 },
    },
  );

  assert.equal(result.strategy, "epub");
  assert.equal(result.sourceKind, "epub");
  assert.equal(result.mimeType, "image/webp");
  assert.equal(result.height, 256);
  assert.ok(result.width > 0);
  assert.ok(result.buffer.byteLength > 0);
});
