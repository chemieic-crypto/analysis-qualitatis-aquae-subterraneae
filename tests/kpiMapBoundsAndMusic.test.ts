import test from "node:test";
import assert from "node:assert/strict";
import {
  computeFitTransform,
  getProjectedFeaturesBBox,
  getSvgPathBBox,
} from "../src/utils/kpiMapBounds.ts";
import {
  MUSIC_CATEGORIES,
  isSafeHttpsUrl,
  resolveCategoryId,
  sanitizeMusicSearchQuery,
} from "../server/musicRouter.ts";

test("getSvgPathBBox parses and transforms simplified SVG state polygon accurately", () => {
  const goaPath = "M 165,355 L 180,355 L 178,370 L 163,370 Z";
  const bbox = getSvgPathBBox(goaPath, {
    scaleX: 1.12,
    scaleY: 1.44,
    translateX: -40,
    translateY: 22,
  });

  assert.ok(bbox);
  assert.ok(Math.abs(bbox.minX - (163 * 1.12 - 40)) < 1e-6);
  assert.ok(Math.abs(bbox.maxX - (180 * 1.12 - 40)) < 1e-6);
  assert.ok(Math.abs(bbox.minY - (355 * 1.44 + 22)) < 1e-6);
  assert.ok(Math.abs(bbox.maxY - (370 * 1.44 + 22)) < 1e-6);
});

test("computeFitTransform centers a selected State or District boundary inside the plot frame", () => {
  const frame = {
    left: 48,
    top: 52,
    width: 532,
    height: 712,
    originX: 314,
    originY: 408,
  };

  // Small district-sized box in top-left quadrant
  const districtBBox = { minX: 120, minY: 140, maxX: 220, maxY: 240 };
  const fit = computeFitTransform(districtBBox, frame, {
    fillRatio: 0.84,
    minZoom: 0.85,
    maxZoom: 8.0,
  });

  // Width 100 -> 532*0.84 / 100 = 4.4688
  assert.ok(fit.zoomLevel > 4.4 && fit.zoomLevel < 4.5);

  // Verify transformed center of districtBBox lands on frame center (314, 408)
  const cx = (districtBBox.minX + districtBBox.maxX) / 2;
  const cy = (districtBBox.minY + districtBBox.maxY) / 2;
  const transformedCx = frame.originX + fit.panOffset.x + fit.zoomLevel * (cx - frame.originX);
  const transformedCy = frame.originY + fit.panOffset.y + fit.zoomLevel * (cy - frame.originY);

  assert.ok(Math.abs(transformedCx - 314) < 0.05);
  assert.ok(Math.abs(transformedCy - 408) < 0.05);
});

test("getProjectedFeaturesBBox extracts bounding box from MultiPolygon GeoJSON features", () => {
  const features = [
    {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [72, 18],
              [76, 18],
              [76, 22],
              [72, 22],
              [72, 18],
            ],
          ],
        ],
      },
    },
  ];
  const bbox = getProjectedFeaturesBBox(features, (lon, lat) => [lon * 10, lat * 10]);
  assert.deepEqual(bbox, { minX: 720, minY: 180, maxX: 760, maxY: 220 });
});

test("MUSIC_CATEGORIES includes all 10 requested Indian music genres", () => {
  const ids = MUSIC_CATEGORIES.map((c) => c.id);
  assert.deepEqual(ids, [
    "hindi",
    "malayalam",
    "telugu",
    "kannada",
    "bihari",
    "bengali",
    "tamil",
    "maharashtrian",
    "shastriya",
    "instrumental",
  ]);
});

test("musicRouter URL and query validation helpers reject unsafe inputs", () => {
  assert.equal(isSafeHttpsUrl("https://audio-ssl.itunes.apple.com/track.m4a"), true);
  assert.equal(isSafeHttpsUrl("http://example.com/track.mp3"), false);
  assert.equal(isSafeHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpsUrl("https://127.0.0.1/internal"), false);
  assert.equal(isSafeHttpsUrl("https://169.254.169.254/latest/meta-data"), false);

  assert.equal(resolveCategoryId("MARATHI"), "hindi");
  assert.equal(resolveCategoryId("maharashtrian"), "maharashtrian");
  assert.equal(resolveCategoryId("shastriya"), "shastriya");

  assert.equal(sanitizeMusicSearchQuery("  Arijit\x00 <Singh>  "), "Arijit Singh");
  assert.equal(sanitizeMusicSearchQuery("a".repeat(200)).length, 80);
});
