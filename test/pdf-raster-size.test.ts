import assert from "node:assert/strict";
import test from "node:test";

import { buildPdfRasterScaleArgs } from "../src/strategies/pdf.ts";

test("uses requested max edge for PDF raster sizing", () => {
  assert.deepEqual(buildPdfRasterScaleArgs({ mode: "max-edge", maxEdge: 512 }), ["-scale-to", "512"]);
});

test("uses requested long edge for contain box PDF raster sizing", () => {
  assert.deepEqual(
    buildPdfRasterScaleArgs({ mode: "box", width: 320, height: 180, fit: "contain" }),
    ["-scale-to", "320"],
  );
});

test("adds overscan for cover box PDF raster sizing", () => {
  assert.deepEqual(
    buildPdfRasterScaleArgs({ mode: "box", width: 320, height: 180, fit: "cover" }),
    ["-scale-to", "640"],
  );
});
