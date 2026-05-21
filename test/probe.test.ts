import assert from "node:assert/strict";
import test from "node:test";

import { createQuicklook } from "../src/index.ts";

test("reports unsupported formats without fallback generation", async () => {
  const quicklook = createQuicklook({
    binaries: {
      ffmpeg: false,
      pdftocairo: false,
      pdftoppm: false,
      libreoffice: false,
    },
  });

  const result = await quicklook.probe({
    buffer: Buffer.from("plain bytes"),
    filename: "archive.bin",
  });

  assert.equal(result.supported, false);
  assert.equal(result.reason, "unsupported_format");
});

test("reports missing dependencies for pdf inputs", async () => {
  const quicklook = createQuicklook({
    binaries: {
      ffmpeg: false,
      pdftocairo: false,
      pdftoppm: false,
      libreoffice: false,
    },
  });

  const result = await quicklook.probe({
    buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"),
    filename: "report.pdf",
    mimeType: "application/pdf",
  });

  assert.equal(result.supported, false);
  assert.equal(result.reason, "missing_dependency");
});

test("reports missing dependencies for csv inputs when libreoffice is unavailable", async () => {
  const quicklook = createQuicklook({
    binaries: {
      ffmpeg: false,
      pdftocairo: false,
      pdftoppm: false,
      libreoffice: false,
    },
  });

  const result = await quicklook.probe({
    buffer: Buffer.from("id,name\n1,Emirhan\n"),
    filename: "active.csv",
    mimeType: "text/csv",
  });

  assert.equal(result.supported, false);
  assert.equal(result.reason, "missing_dependency");
  assert.equal(result.sourceKind, "office");
});

test("reports epub inputs as supported when a cover image can be extracted", async () => {
  const quicklook = createQuicklook({
    binaries: {
      ffmpeg: false,
      pdftocairo: false,
      pdftoppm: false,
      libreoffice: false,
    },
  });

  const result = await quicklook.probe({
    buffer: Buffer.from("PK\u0003\u0004dummy"),
    filename: "book.epub",
    mimeType: "application/epub+zip",
  });

  assert.equal(result.supported, true);
  assert.equal(result.sourceKind, "epub");
  assert.equal(result.strategyId, "epub");
});
