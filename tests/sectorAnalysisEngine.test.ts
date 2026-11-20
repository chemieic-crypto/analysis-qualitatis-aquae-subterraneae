import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SECTOR_PARAM_CONFIG,
  fastHaversineKm,
  fastBearingDeg,
  fastDestination,
  fastPointInFeature,
  computeSectorGeometryAndStats,
  selectCollisionFreeLabels,
  buildSectorsGeoJsonFeatureCollection,
  type CustomTierRange
} from "../src/utils/sectorAnalysisEngine.ts";

describe("Sector Analysis Engine — Geodesy & Spatial Containment", () => {
  it("excludes Molybdenum from SECTOR_PARAM_CONFIG", () => {
    assert.equal("Mo" in SECTOR_PARAM_CONFIG, false);
    assert.equal(Object.values(SECTOR_PARAM_CONFIG).some((m) => /molybd/i.test(m.name)), false);
  });

  it("computes accurate Haversine distances and cardinal bearings without allocating GeoJSON", () => {
    // 1 degree latitude is ~111.195 km
    const dLat = fastHaversineKm(26.0, 75.0, 27.0, 75.0);
    assert.ok(Math.abs(dLat - 111.195) < 0.25, `Expected ~111.2 km, got ${dLat}`);

    assert.ok(Math.abs(fastBearingDeg(26.0, 75.0, 27.0, 75.0) - 0) < 0.1);
    assert.ok(Math.abs(fastBearingDeg(26.0, 75.0, 26.0, 76.0) - 90) < 0.5);
    assert.ok(Math.abs(fastBearingDeg(27.0, 75.0, 26.0, 75.0) - 180) < 0.1);
    assert.ok(Math.abs(fastBearingDeg(26.0, 76.0, 26.0, 75.0) - 270) < 0.5);
  });

  it("checks point-in-polygon with holes and MultiPolygon accurately", () => {
    const donutSquare = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [75.0, 26.0],
            [76.0, 26.0],
            [76.0, 27.0],
            [75.0, 27.0],
            [75.0, 26.0]
          ],
          [
            [75.4, 26.4],
            [75.6, 26.4],
            [75.6, 26.6],
            [75.4, 26.6],
            [75.4, 26.4]
          ]
        ]
      }
    };

    const bbox: [number, number, number, number] = [75.0, 26.0, 76.0, 27.0];
    assert.equal(fastPointInFeature(75.2, 26.2, donutSquare, bbox), true);
    assert.equal(fastPointInFeature(75.5, 26.5, donutSquare, bbox), false); // inside hole
    assert.equal(fastPointInFeature(74.8, 26.5, donutSquare, bbox), false); // outside bbox
  });
});

describe("Sector Analysis Engine — Radial & Grid Spatial Aggregation", () => {
  const ranges: CustomTierRange[] = [
    { min: 0, max: 45, label: "Desirable", color: "#10b981", unit: "mg/L", visible: true },
    { min: 45, max: 100000, label: "Unsuitable", color: "#ef4444", unit: "mg/L", visible: true }
  ];

  it("buckets points into radial rings & sectors, preserving 0 values and ring decay profile", () => {
    const origin: [number, number] = [75.8, 26.9];
    const ne3 = fastDestination(origin[0], origin[1], 3.0, 45);
    const ne3b = fastDestination(origin[0], origin[1], 3.2, 50);
    const sw8 = fastDestination(origin[0], origin[1], 8.0, 220);

    const points = [
      { _hasCoords: true, _lon: ne3[0], _lat: ne3[1], _val: 0 },
      { _hasCoords: true, _lon: ne3b[0], _lat: ne3b[1], _val: 60 },
      { _hasCoords: true, _lon: sw8[0], _lat: sw8[1], _val: 90 }
    ];

    const res = computeSectorGeometryAndStats({
      points,
      analysisMode: "sector",
      centerPoint: origin,
      radii: [5, 10],
      sectorAngle: 90,
      gridCellWidthKm: 2,
      gridCellHeightKm: 2,
      gridScope: "data_bounds",
      hideEmptySectors: true,
      activeParam: "NO3",
      customRanges: ranges
    });

    assert.equal(res.sectors.length, 2);
    assert.equal(res.summary.totalSamples, 3);
    assert.equal(res.summary.populatedSectors, 2);
    // Zero concentration must be included in bucket mean: (0 + 60) / 2 = 30
    const innerSector = res.sectors.find((s) => s.id === "R5_A0");
    assert.ok(innerSector);
    assert.equal(innerSector.count, 2);
    assert.equal(innerSector.avg, 30);
    assert.equal(innerSector.min, 0);
    assert.equal(innerSector.exceedanceCount, 1);

    assert.equal(res.ringProfile.length, 2);
    assert.equal(res.ringProfile[0].sampleCount, 2);
    assert.equal(res.ringProfile[1].sampleCount, 1);
    assert.equal(res.ringProfile[1].avg, 90);
  });

  it("computes rectangular grid cells and builds valid GeoJSON FeatureCollection", () => {
    const points = [
      { _hasCoords: true, _lon: 75.8, _lat: 26.9, _val: 20 },
      { _hasCoords: true, _lon: 75.85, _lat: 26.95, _val: 70 }
    ];

    const res = computeSectorGeometryAndStats({
      points,
      analysisMode: "grid",
      centerPoint: [75.82, 26.92],
      radii: [5, 10],
      sectorAngle: 45,
      gridCellWidthKm: 5,
      gridCellHeightKm: 5,
      gridScope: "data_bounds",
      hideEmptySectors: true,
      activeParam: "NO3",
      customRanges: ranges
    });

    assert.ok(res.sectors.length >= 1);
    assert.equal(res.summary.totalSamples, 2);

    const fc = buildSectorsGeoJsonFeatureCollection(res.sectors, "NO3");
    assert.equal(fc.type, "FeatureCollection");
    assert.equal(fc.features.length, res.sectors.length);
    assert.equal(fc.features[0].properties.parameter, "NO3");
  });

  it("returns empty sectors and ringProfile when analysisMode is hotspot", () => {
    const res = computeSectorGeometryAndStats({
      points: [{ _hasCoords: true, _lon: 75.8, _lat: 26.9, _val: 80 }],
      analysisMode: "hotspot",
      centerPoint: [75.8, 26.9],
      radii: [5, 10],
      sectorAngle: 45,
      gridCellWidthKm: 2,
      gridCellHeightKm: 2,
      gridScope: "data_bounds",
      hideEmptySectors: false,
      activeParam: "NO3",
      customRanges: ranges
    });

    assert.equal(res.sectors.length, 0);
    assert.equal(res.ringProfile.length, 0);
    assert.equal(res.summary.totalSamples, 0);
  });
});

describe("Sector Analysis Engine — Collision-Free Label Plate Layout", () => {
  it("never produces overlapping plates and prioritizes higher-sample sectors over obstacles", () => {
    const candidates = [
      { id: "HighPriority", x: 300, y: 300, width: 90, height: 42, priority: 1000, maxNudgePx: 0 },
      { id: "CollidingLowPriority", x: 310, y: 305, width: 90, height: 42, priority: 10, maxNudgePx: 0 },
      { id: "ObstacleBlocked", x: 500, y: 500, width: 90, height: 42, priority: 500, maxNudgePx: 0 },
      { id: "ClearPlate", x: 650, y: 300, width: 90, height: 42, priority: 200, maxNudgePx: 0 }
    ];

    const layout = selectCollisionFreeLabels(candidates, {
      viewportWidth: 1200,
      viewportHeight: 800,
      paddingPx: 8,
      marginPx: 10,
      obstacles: [{ minX: 480, minY: 480, maxX: 520, maxY: 520 }],
      allowNudge: false
    });

    assert.equal(layout.visibleIds.has("HighPriority"), true);
    assert.equal(layout.visibleIds.has("ClearPlate"), true);
    assert.equal(layout.visibleIds.has("CollidingLowPriority"), false);
    assert.equal(layout.visibleIds.has("ObstacleBlocked"), false);
    assert.equal(layout.suppressedCount, 2);

    // Mathematically verify zero pairwise overlap among placed boxes
    for (let i = 0; i < layout.placed.length; i++) {
      for (let j = i + 1; j < layout.placed.length; j++) {
        const a = layout.placed[i].box;
        const b = layout.placed[j].box;
        const overlaps = a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
        assert.equal(overlaps, false, `Placed boxes ${layout.placed[i].id} and ${layout.placed[j].id} overlap`);
      }
    }
  });
});
