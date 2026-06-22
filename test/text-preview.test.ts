import assert from "node:assert/strict";
import test from "node:test";

import { createQuicklook } from "../src/index.ts";

test("generates a text preview using maxEdge sizing", async () => {
  const quicklook = createQuicklook({
    binaries: {
      ffmpeg: false,
      pdftocairo: false,
      pdftoppm: false,
      libreoffice: false,
    },
  });

  const result = await quicklook.generate(
    {
      buffer: Buffer.from("# Hello\n\nThis is a markdown file rendered as a preview."),
      filename: "note.md",
      mimeType: "text/markdown",
    },
    {
      size: { maxEdge: 256 },
    },
  );

  const item = result.items[0];

  assert.equal(result.items.length, 1);
  assert.equal(item?.strategy, "text");
  assert.equal(item?.mimeType, "image/webp");
  assert.ok((item?.width ?? 0) <= 256);
  assert.ok((item?.height ?? 0) <= 256);
  assert.ok((item?.buffer.byteLength ?? 0) > 0);
});
