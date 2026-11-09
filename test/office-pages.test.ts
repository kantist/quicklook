import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { QuicklookTimeoutError, createQuicklook } from "../src/index.ts";

// Four pages, each with its number in large type: a page drawn alone must look like the same page of the whole.
const pages = [1, 2, 3, 4].map((page) => `{\\fs96 Page ${page}\\par}`).join("\\page\n");
const rtf = Buffer.from(`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\n${pages}\n}`);
const input = () => ({ buffer: rtf, filename: "report.rtf", mimeType: "application/rtf" });

const quicklook = createQuicklook();
const libreOffice = (await quicklook.getRuntimeCapabilities()).libreoffice.available;
const skip = libreOffice ? false : "needs LibreOffice";

test(
  "draws an office page from a PDF of the pages asked for alone, the same as from the whole document",
  { skip },
  async () => {
    const whole = await quicklook.generate(input(), { page: "all", format: "png", size: { maxEdge: 160 } });
    const third = await quicklook.generate(input(), { page: 3, format: "png", size: { maxEdge: 160 } });
    const batch = await quicklook.generate(input(), { page: [4, 2], format: "png", size: { maxEdge: 160 } });

    assert.equal(whole.meta?.pageCount, 4);
    assert.deepEqual(
      third.items.map((item) => item.meta?.page),
      [3],
    );
    assert.deepEqual(
      batch.items.map((item) => item.meta?.page),
      [4, 2],
    );
    assert.ok(
      await samePixels(third.items[0].buffer, whole.items[2].buffer),
      "page 3 alone differs from page 3 of the whole",
    );
    assert.ok(await samePixels(batch.items[0].buffer, whole.items[3].buffer), "page 4 of a batch differs");
    assert.ok(await samePixels(batch.items[1].buffer, whole.items[1].buffer), "page 2 of a batch differs");
  },
);

test("says a conversion ran out of time, never only what the converter printed", { skip }, async () => {
  const hurried = createQuicklook({ limits: { timeoutMs: 1 } });

  await assert.rejects(hurried.generate(input(), { page: 1 }), (error: unknown) => {
    assert.ok(error instanceof QuicklookTimeoutError);
    assert.match((error as Error).message, /timed out after 1 ms/);
    return true;
  });
});

async function samePixels(a: Buffer, b: Buffer): Promise<boolean> {
  const [left, right] = await Promise.all(
    [a, b].map((image) => sharp(image).raw().toBuffer({ resolveWithObject: true })),
  );
  return left.info.width === right.info.width && left.info.height === right.info.height && left.data.equals(right.data);
}
