import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createQuicklook } from "../src/index.ts";

test("counts a browser that answers its version slowly as installed", async () => {
  const slow = join(mkdtempSync(join(tmpdir(), "quicklook-slow-")), "chromium");
  writeFileSync(slow, "#!/bin/sh\nsleep 7\necho Chromium 1\n");
  chmodSync(slow, 0o755);
  const quicklook = createQuicklook({ binaries: { chromium: slow, ffmpeg: false, pdftocairo: false, pdftoppm: false, libreoffice: false } });

  const runtime = await quicklook.getRuntimeCapabilities();

  assert.equal(runtime.chromium.available, true);
  assert.equal(runtime.chromium.path, slow);
});
