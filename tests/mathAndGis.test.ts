import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeMin, safeMax, getPercentile, getStats } from "../src/utils/math.ts";
import {
  getFeatureBbox,
  doBboxesOverlap,
  getAdminFeatureLabel,
  getFeatureAttributeLabel,
  createGeoTiffBlob,
} from "../src/utils/gisMapHelpers.ts";
import {
  getBulletinMonsoonPercentile,
  getBulletinMonsoonStats,
} from "../src/utils/bulletinChartGenerators.ts";

describe("Descriptive Statistics & Large Array Safety", () => {
  it("computes safeMin, safeMax, getPercentile, and getStats accurately", () => {
    assert.equal(safeMin(5, [2, 9], undefined, NaN, -3), -3);
    assert.equal(safeMax(5, [2, 9], null, NaN, 14), 14);
    assert.equal(safeMin([]), 0);
    assert.equal(safeMax(), 0);

    const arr = [10, 20, 30, 40, 50];
    assert.equal(getPercentile(arr, 50), 30);
    assert.equal(getPercentile(arr, 75), 40);

    const st = getStats(arr);
    assert.equal(st.min, 10);
    assert.equal(st.max, 50);
    assert.equal(st.avg, 30);
    assert.ok(Math.abs(st.std - Math.sqrt(200)) < 1e-6);
    assert.equal(st.p75, 40);
  });

  it("handles arrays larger than 120,000 items without stack overflow", () => {
    const big = new Array<number>(150_000);
    for (let i = 0; i < big.length; i++) big[i] = (i % 500) + 1;
    assert.equal(safeMin(big), 1);
    assert.equal(safeMax(big), 500);
    const st = getStats(big);
    assert.equal(st.min, 1);
    assert.equal(st.max, 500);
  });
});

describe("GIS Geometry, Labeling, and GeoTIFF Binary Export", () => {
  it("extracts feature bboxes and detects bbox overlap accurately", () => {
    const polygon = {
      type: "Feature",
      properties: { DISTRICT: "Jaipur", STATE: "Rajasthan" },
      geometry: {
        type: "Polygon",
        coordinates: [[[75.0, 26.5], [76.2, 26.5], [76.2, 27.3], [75.0, 27.3], [75.0, 26.5]]],
      },
    };
    const bbox = getFeatureBbox(polygon);
    assert.deepEqual(bbox, [75.0, 26.5, 76.2, 27.3]);

    assert.equal(doBboxesOverlap([0, 0, 10, 10], [5, 5, 15, 15]), true);
    assert.equal(doBboxesOverlap([0, 0, 10, 10], [11, 11, 20, 20]), false);
  });

  it("resolves administrative and attribute labels consistently", () => {
    const fBlock = {
      properties: { BLOCK_NAME: "Sanganer", DISTRICT_NAME: "Jaipur", STATE_NAME: "Rajasthan" },
    };
    assert.deepEqual(getAdminFeatureLabel(fBlock), {
      name: "Sanganer (Jaipur)",
      type: "Block",
    });
    assert.equal(getFeatureAttributeLabel(fBlock, "district"), "Jaipur");
    assert.equal(getFeatureAttributeLabel(fBlock, "state"), "Rajasthan");
    assert.equal(getFeatureAttributeLabel(fBlock, "block"), "Sanganer");
  });

  it("builds a valid Little-Endian GeoTIFF binary header with EPSG:4326 GeoKeys", async () => {
    const width = 4;
    const height = 2;
    const rgba = new Uint8ClampedArray(width * height * 4).fill(128);
    const blob = createGeoTiffBlob(width, height, rgba, {
      minLng: 75.0,
      maxLng: 76.0,
      minLat: 26.0,
      maxLat: 27.0,
    });
    assert.equal(blob.type, "image/tiff");
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    // TIFF Little Endian 'II' = 0x4949, magic 42
    assert.equal(view.getUint16(0, true), 0x4949);
    assert.equal(view.getUint16(2, true), 42);
    const ifdOffset = view.getUint32(4, true);
    assert.ok(ifdOffset > 8 && ifdOffset < buf.byteLength);
    // 14 IFD entries written
    assert.equal(view.getUint16(ifdOffset, true), 14);
  });
});

describe("Bulletin Monsoon Percentile & Summary Stats", () => {
  it("computes sorted percentile and quartiles cleanly", () => {
    const vals = [12, 4, 8, 16, 20];
    assert.equal(getBulletinMonsoonPercentile([4, 8, 12, 16, 20], 50), 12);
    const st = getBulletinMonsoonStats(vals);
    assert.equal(st.min, 4);
    assert.equal(st.max, 20);
    assert.equal(st.mean, 12);
    assert.equal(st.median, 12);
    assert.equal(st.q1, 8);
    assert.equal(st.q3, 16);
  });
});
