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

  assert.equal(result.strategy, "text");
  assert.equal(result.mimeType, "image/webp");
  assert.ok(result.width <= 256);
  assert.ok(result.height <= 256);
  assert.ok(result.buffer.byteLength > 0);
});
