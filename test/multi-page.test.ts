import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { QuicklookInputError, createQuicklook } from "../src/index.ts";

import type { QuicklookStrategy } from "../src/index.ts";

test("returns multiple previews when several PDF pages are requested", async () => {
  const quicklook = createQuicklook({
    binaries: {
      ffmpeg: false,
      pdftocairo: false,
      pdftoppm: false,
      libreoffice: false,
    },
    strategies: [createMockPdfStrategy()],
  });

  const result = await quicklook.generate(
    {
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"),
      filename: "report.pdf",
      mimeType: "application/pdf",
    },
    {
      page: [2, 4],
    },
  );

  assert.deepEqual(result.items.map((item) => item.meta?.page), [2, 4]);
  assert.deepEqual(result.items.map((item) => item.width), [122, 124]);
  assert.ok(result.items.every((item) => item.strategy === "mock-pdf"));
});

test("returns every preview when all PDF pages are requested", async () => {
  const quicklook = createQuicklook({
    binaries: {
      ffmpeg: false,
      pdftocairo: false,
      pdftoppm: false,
      libreoffice: false,
    },
    strategies: [createMockPdfStrategy()],
  });

  const result = await quicklook.generate(
    {
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"),
      filename: "report.pdf",
      mimeType: "application/pdf",
    },
    {
      page: "all",
    },
  );

  assert.equal(result.meta?.pageCount, 3);
  assert.deepEqual(result.items.map((item) => item.meta?.page), [1, 2, 3]);
});

test("rejects multi-page requests for non-paged inputs", async () => {
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
      width: 80,
      height: 60,
      channels: 3,
      background: { r: 8, g: 87, b: 138 },
    },
  })
    .png()
    .toBuffer();

  await assert.rejects(
    () =>
      quicklook.generate(
        {
          buffer: input,
          filename: "poster.png",
        },
        {
          page: [1, 2],
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof QuicklookInputError);
      assert.match(error.message, /Multi-page requests/);
      return true;
    },
  );
});

function createMockPdfStrategy(): QuicklookStrategy {
  return {
    id: "mock-pdf",
    priority: 999,
    match(input) {
      return input.sourceKind === "pdf" ? 999 : null;
    },
    async render(context) {
      return {
        buffer: await createPageBuffer(context.request.page),
        sourceKind: "pdf",
        meta: { page: context.request.page },
      };
    },
    async renderBatch(_context, pageSelection) {
      const pages = pageSelection === "all" ? [1, 2, 3] : [...pageSelection];

      return {
        items: await Promise.all(
          pages.map(async (page) => ({
            buffer: await createPageBuffer(page),
            sourceKind: "pdf" as const,
            meta: { page },
          })),
        ),
        meta: pageSelection === "all" ? { pageCount: pages.length } : undefined,
      };
    },
  };
}

async function createPageBuffer(page: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 120 + page,
      height: 80,
      channels: 3,
      background: { r: 16 * page, g: 120, b: 180 },
    },
  })
    .png()
    .toBuffer();
}
