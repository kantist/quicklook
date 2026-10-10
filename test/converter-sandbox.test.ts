import assert from "node:assert/strict";
import test from "node:test";

import { createQuicklook } from "../src/index.ts";
import { converterEnvironment } from "../src/utils/exec.ts";

test("hands converters none of the caller's environment, and a proxy that goes nowhere", () => {
  process.env.QUICKLOOK_TEST_SECRET = "s3cret";
  try {
    const env = converterEnvironment();

    assert.equal(Object.values(env).includes("s3cret"), false);
    assert.equal(env.https_proxy, "http://127.0.0.1:9");
    assert.ok(env.PATH);
  } finally {
    delete process.env.QUICKLOOK_TEST_SECRET;
  }
});

test("reads a video as the container its name says, never as a playlist of other files", async (context) => {
  const quicklook = createQuicklook({ binaries: { pdftocairo: false, pdftoppm: false, libreoffice: false } });
  if (!(await quicklook.getRuntimeCapabilities()).ffmpeg.available) return context.skip("ffmpeg is not installed");
  const playlist = Buffer.from("#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.0,\nfile:///etc/hosts\n#EXT-X-ENDLIST\n");

  await assert.rejects(quicklook.generate({ buffer: playlist, filename: "holiday.mp4" }));
});
