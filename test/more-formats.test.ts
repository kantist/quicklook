import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import sharp from "sharp";

import { QuicklookInputError, createQuicklook } from "../src/index.ts";

const page = (background: string) =>
  sharp({ create: { width: 200, height: 280, channels: 3, background } }).png().toBuffer();

async function multiPageTiff(): Promise<Buffer> {
  const pages = await Promise.all(["#c2410c", "#15803d", "#1d4ed8"].map(page));
  return sharp(pages, { join: { animated: true } }).tiff().toBuffer();
}

test("renders every page of a multi-page TIFF, such as a faxed scan", async () => {
  const quicklook = createQuicklook({ binaries: { ffmpeg: false, pdftocairo: false, pdftoppm: false, libreoffice: false } });

  const result = await quicklook.generate({ buffer: await multiPageTiff(), filename: "fax.tiff" }, { page: "all", size: { maxEdge: 140 } });

  assert.equal(result.meta?.pageCount, 3);
  assert.deepEqual(result.items.map((item) => item.meta?.page), [1, 2, 3]);
  const second = await sharp(result.items[1]!.buffer).raw().toBuffer({ resolveWithObject: true });
  assert.ok(second.data[1]! > second.data[0]!, "page 2 is the green one");
});

test("renders one page of a multi-page TIFF and refuses a page it does not have", async () => {
  const quicklook = createQuicklook({ binaries: { ffmpeg: false, pdftocairo: false, pdftoppm: false, libreoffice: false } });
  const input = { buffer: await multiPageTiff(), filename: "fax.tif" };

  const third = await quicklook.generate(input, { page: 3, size: { maxEdge: 140 } });
  assert.equal(third.items[0]?.meta?.page, 3);
  await assert.rejects(quicklook.generate(input, { page: 4 }), QuicklookInputError);
});

test("still refuses every page of a single-page image", async () => {
  const quicklook = createQuicklook({ binaries: { ffmpeg: false, pdftocairo: false, pdftoppm: false, libreoffice: false } });

  await assert.rejects(quicklook.generate({ buffer: await page("#000000"), filename: "photo.png" }, { page: "all" }), QuicklookInputError);
});

test("renders a BMP through ffmpeg", async (t) => {
  const quicklook = createQuicklook({ binaries: { pdftocairo: false, pdftoppm: false, libreoffice: false } });
  if (!(await quicklook.getRuntimeCapabilities()).ffmpeg.available) return t.skip("ffmpeg is not installed");
  const dir = mkdtempSync(join(tmpdir(), "quicklook-bmp-"));
  const png = join(dir, "in.png");
  await sharp(await page("#c2410c")).toFile(png);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", png, join(dir, "in.bmp")]);

  const result = await quicklook.generate({ buffer: readFileSync(join(dir, "in.bmp")), filename: "scan.bmp" }, { size: { maxEdge: 100 } });

  assert.equal(result.items[0]?.strategy, "image");
  assert.equal(result.items[0]?.height, 100);
});

test("renders a HEIC photo through libheif", async (t) => {
  const quicklook = createQuicklook({ binaries: { pdftocairo: false, pdftoppm: false, libreoffice: false } });
  if (!(await quicklook.getRuntimeCapabilities()).heif.available) return t.skip("libheif (heif-dec) is not installed");
  const heic = process.env.QUICKLOOK_TEST_HEIC;
  if (!heic) return t.skip("set QUICKLOOK_TEST_HEIC to a .heic photo");

  const result = await quicklook.generate({ path: heic }, { size: { maxEdge: 300 } });

  assert.equal(result.items[0]?.strategy, "image");
  assert.ok((result.items[0]?.width ?? 0) > 0);
});

test("says what a HEIC photo needs when libheif is missing", async () => {
  const quicklook = createQuicklook({ binaries: { heif: false, pdftocairo: false, pdftoppm: false, libreoffice: false } });

  await assert.rejects(
    quicklook.generate({ buffer: Buffer.from("not decoded"), filename: "photo.heic" }),
    /libheif/,
  );
});
