/**
 * Utilities for exporting high-resolution JPEGs with embedded JFIF DPI metadata (600–800 DPI).
 */

export const MIN_KPI_DPI = 600;
export const MAX_KPI_DPI = 800;

/**
 * Converts a target print DPI (e.g., 600–800 DPI) into a DOM-to-Canvas scale factor
 * relative to the standard 96 CSS pixels-per-inch baseline.
 */
export function dpiToCaptureScale(dpi: number): number {
  const safeDpi = Math.max(72, Math.min(1200, Math.round(dpi)));
  return safeDpi / 96;
}

/**
 * Injects or updates the JFIF APP0 DPI metadata inside raw JPEG bytes so image viewers,
 * desktop OS properties, Photoshop, and publishing pipelines read the true DPI (e.g. 600–800 DPI).
 */
export function injectJpegDpi(jpegBytes: Uint8Array, dpi: number): Uint8Array {
  const safeDpi = Math.max(1, Math.min(65535, Math.round(dpi)));
  if (jpegBytes.length < 4 || jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
    return jpegBytes;
  }

  const out = new Uint8Array(jpegBytes);
  const hi = (safeDpi >> 8) & 0xff;
  const lo = safeDpi & 0xff;

  let pos = 2;
  while (pos + 3 < out.length) {
    if (out[pos] !== 0xff) break;
    const marker = out[pos + 1];

    // Skip padding 0xFF bytes
    if (marker === 0xff) {
      pos++;
      continue;
    }

    // Stop scanning at Start of Scan (0xDA) or End of Image (0xD9)
    if (marker === 0xda || marker === 0xd9) break;

    // Standalone markers without length (RST0-RST7, TEM)
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      pos += 2;
      continue;
    }

    const segLen = (out[pos + 2] << 8) | out[pos + 3];
    if (segLen < 2 || pos + 2 + segLen > out.length) break;

    // Check for APP0 (0xE0) with "JFIF\0" identifier and at least 16-byte length
    if (
      marker === 0xe0 &&
      segLen >= 16 &&
      out[pos + 4] === 0x4a && // 'J'
      out[pos + 5] === 0x46 && // 'F'
      out[pos + 6] === 0x49 && // 'I'
      out[pos + 7] === 0x46 && // 'F'
      out[pos + 8] === 0x00    // '\0'
    ) {
      // JFIF APP0 layout:
      // +9: major version, +10: minor version, +11: units (1 = dots per inch)
      // +12..13: Xdensity (BE uint16), +14..15: Ydensity (BE uint16)
      out[pos + 11] = 1;
      out[pos + 12] = hi;
      out[pos + 13] = lo;
      out[pos + 14] = hi;
      out[pos + 15] = lo;
      return out;
    }

    pos += 2 + segLen;
  }

  // No JFIF APP0 segment found: insert a standard 18-byte JFIF APP0 segment right after SOI (0xFF 0xD8)
  const jfifSegment = new Uint8Array([
    0xff, 0xe0, // APP0 marker
    0x00, 0x10, // Length = 16
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, // Version 1.1
    0x01,       // Density units: 1 = dots per inch (DPI)
    hi, lo,     // Xdensity
    hi, lo,     // Ydensity
    0x00, 0x00  // Xthumbnail, Ythumbnail = 0
  ]);

  const combined = new Uint8Array(out.length + jfifSegment.length);
  combined.set(out.subarray(0, 2), 0);
  combined.set(jfifSegment, 2);
  combined.set(out.subarray(2), 2 + jfifSegment.length);
  return combined;
}

/**
 * Converts an HTMLCanvasElement to a JPEG Blob with embedded JFIF DPI metadata.
 */
export async function canvasToJpegBlobWithDpi(
  canvas: HTMLCanvasElement,
  dpi: number,
  quality: number = 0.96
): Promise<Blob> {
  const rawBlob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    } catch {
      resolve(null);
    }
  });

  let rawBytes: Uint8Array;
  if (rawBlob) {
    const buffer = await rawBlob.arrayBuffer();
    rawBytes = new Uint8Array(buffer);
  } else {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.split(",")[1] || "";
    const binary = atob(base64);
    rawBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      rawBytes[i] = binary.charCodeAt(i);
    }
  }

  const patched = injectJpegDpi(rawBytes, dpi);
  const copy = new Uint8Array(patched.byteLength);
  copy.set(patched);
  return new Blob([copy.buffer], { type: "image/jpeg" });
}
