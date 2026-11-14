import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import test from "node:test";

import { zipSync } from "fflate";
import sharp from "sharp";

import { createArchiveStrategy, createQuicklook, createViewerStrategy, readZipSummary } from "../src/index.ts";
import { detectSourceKind } from "../src/utils/mime.ts";

const NO_BINARIES = { ffmpeg: false, pdftocairo: false, pdftoppm: false, libreoffice: false } as const;

function projectZip(): Buffer {
  const text = (value: string) => new TextEncoder().encode(value);
  return Buffer.from(
    zipSync({
      "board/": new Uint8Array(),
      "board/main.kicad_sch": text("(kicad_sch)"),
      "board/gerbers/top.gtl": text("%FSLAX46Y46*%\nM02*\n"),
      "board/README.md": text("# Board\n"),
      "__MACOSX/board/._README.md": text("x"),
      "board/.DS_Store": text("x"),
    }),
  );
}

const sha = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

test("reads a ZIP's file count and size from its central directory, leaving folders and clutter out", async () => {
  const quicklook = createQuicklook({ binaries: NO_BINARIES, strategies: [createArchiveStrategy()] });
  const result = await quicklook.generate({ buffer: projectZip(), filename: "board.zip" }, { size: { maxEdge: 384 } });
  assert.equal(result.items[0]?.strategy, "archive");
  const { width, height } = await sharp(result.items[0]!.buffer).metadata();
  assert.equal(Math.max(width ?? 0, height ?? 0), 384);
});

test("counts what readZipSummary counts", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const path = join(mkdtempSync(join(tmpdir(), "ql-zip-")), "a.zip");
  writeFileSync(path, projectZip());
  assert.deepEqual(await readZipSummary(path), { fileCount: 3, totalBytes: 11 + 19 + 8 });
});

test("still refuses a ZIP without the archive strategy (the defaults are unchanged)", async () => {
  const quicklook = createQuicklook({ binaries: NO_BINARIES });
  await assert.rejects(quicklook.generate({ buffer: projectZip(), filename: "board.zip" }));
});

test("draws firmware, HDL and electronics text as text", () => {
  for (const extension of ["s", "asm", "ld", "map", "hex", "srec", "v", "vhd", "cir", "kicad_sch", "gtl", "drl"]) {
    assert.equal(detectSourceKind({ extension }), "text", extension);
  }
  // G-code's .nc is also NetCDF (binary): not taken as text.
  assert.equal(detectSourceKind({ extension: "nc" }), "unknown");
});

test("tells every format it told before the same way (the text list only grew)", () => {
  const before: Record<string, string> = {
    pdf: "pdf",
    docx: "office",
    xlsx: "office",
    pptx: "office",
    csv: "office",
    png: "image",
    jpg: "image",
    heic: "image",
    svg: "image",
    tiff: "image",
    mp4: "video",
    mov: "video",
    html: "html",
    epub: "epub",
    txt: "text",
    md: "text",
    json: "text",
    ts: "text",
    py: "text",
    yaml: "text",
    zip: "unknown",
    exe: "unknown",
  };
  for (const [extension, kind] of Object.entries(before)) assert.equal(detectSourceKind({ extension }), kind, extension);
});

test("gives byte-identical thumbnails for quicklook's own formats with the new strategies added", async () => {
  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#2a7a4a" } }).png().toBuffer();
  const samples = [
    { buffer: png, filename: "photo.png" },
    { buffer: Buffer.from("Hello\nWorld\n".repeat(40)), filename: "notes.txt" },
    { buffer: Buffer.from("# Title\n\n- one\n- two\n"), filename: "readme.md" },
    { buffer: Buffer.from(JSON.stringify({ a: 1, b: [1, 2, 3] }, null, 2)), filename: "data.json" },
  ];
  const plain = createQuicklook({ binaries: NO_BINARIES });
  const extended = createQuicklook({
    binaries: NO_BINARIES,
    strategies: [
      createArchiveStrategy(),
      createViewerStrategy({ viewerUrl: "http://127.0.0.1:9/", formats: { gtl: { format: "gerber", render: "2d" } } }),
    ],
  });
  for (const sample of samples) {
    const [a, b] = await Promise.all([plain.generate(sample, { size: { maxEdge: 256 } }), extended.generate(sample, { size: { maxEdge: 256 } })]);
    assert.equal(b.items[0]?.strategy, a.items[0]?.strategy, sample.filename);
    assert.equal(sha(b.items[0]!.buffer), sha(a.items[0]!.buffer), sample.filename);
  }
});

/** A stand-in viewer: its thumbnail page fetches the file and posts a picture of it, as artifact-renderer's does. */
async function stubViewer(picture: string): Promise<{ server: Server; url: string }> {
  const page = `<!doctype html><script>
    const src = new URLSearchParams(location.search).get("src");
    fetch(src).then((r) => r.text()).then((text) => {
      window.__dvinaThumbnail = text.includes("M02") ? { state: "picture", dataUrl: ${JSON.stringify(picture)} } : { state: "failed", message: "not gerber" };
    });
  </script>`;
  const server = createServer((_, response) => response.writeHead(200, { "content-type": "text/html" }).end(page));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${port}/` };
}

test("draws a Gerber layer through the viewer's thumbnail page, the file handed over from here", async (t) => {
  const quicklook = createQuicklook({ binaries: NO_BINARIES });
  if (!(await quicklook.getRuntimeCapabilities()).chromium.available) return t.skip("no Chromium");
  const red = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#c0392b" } }).png().toBuffer();
  const { server, url } = await stubViewer(`data:image/png;base64,${red.toString("base64")}`);
  try {
    const withViewer = createQuicklook({
      binaries: NO_BINARIES,
      strategies: [createViewerStrategy({ viewerUrl: url, formats: { gtl: { format: "gerber", render: "2d" } } })],
    });
    const result = await withViewer.generate({ buffer: Buffer.from("%FSLAX46Y46*%\nM02*\n"), filename: "top.gtl" }, { size: { maxEdge: 300 } });
    assert.equal(result.items[0]?.strategy, "viewer");
    const { data } = await sharp(result.items[0]!.buffer).raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[0]! > 150 && data[1]! < 100, "the viewer's red picture");
  } finally {
    server.close();
  }
});
