import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dpiToCaptureScale, injectJpegDpi } from "../src/utils/jpegDpi.ts";

describe("KPI JPEG DPI scaling and JFIF metadata injection", () => {
  it("computes accurate capture scales for 600–800 DPI relative to 96 CSS DPI", () => {
    assert.equal(dpiToCaptureScale(600), 600 / 96);
    assert.equal(dpiToCaptureScale(700), 700 / 96);
    assert.equal(dpiToCaptureScale(800), 800 / 96);
  });

  it("updates an existing JFIF APP0 header with 600, 700, or 800 DPI", () => {
    // Minimal SOI + APP0(JFIF 1.1, 0 units, 1x1) + SOS + EOI
    const sampleJpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10,
      0x4a, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01,
      0x00,       // density units = 0
      0x00, 0x48, // 72
      0x00, 0x48, // 72
      0x00, 0x00,
      0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
      0xff, 0xd9
    ]);

    for (const targetDpi of [600, 700, 800]) {
      const patched = injectJpegDpi(sampleJpeg, targetDpi);
      assert.equal(patched.length, sampleJpeg.length);
      assert.equal(patched[13], 1); // units = DPI
      const xDpi = (patched[14] << 8) | patched[15];
      const yDpi = (patched[16] << 8) | patched[17];
      assert.equal(xDpi, targetDpi);
      assert.equal(yDpi, targetDpi);
    }
  });

  it("inserts a JFIF APP0 header after SOI when missing (e.g. EXIF-only JPEG)", () => {
    const exifOnlyJpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
      0xff, 0xd9
    ]);

    const patched = injectJpegDpi(exifOnlyJpeg, 720);
    assert.equal(patched.length, exifOnlyJpeg.length + 18);
    assert.equal(patched[0], 0xff);
    assert.equal(patched[1], 0xd8);
    assert.equal(patched[2], 0xff);
    assert.equal(patched[3], 0xe0);
    assert.equal(patched[13], 1);
    assert.equal((patched[14] << 8) | patched[15], 720);
    assert.equal((patched[16] << 8) | patched[17], 720);
  });
});
