import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isEcParameter,
  buildSpatialSamplePoints,
  computeHighDensityIdwGrid,
  extractIsoContourSegments,
  getEcColorRgba,
  featureMatchesAdminSelection,
  computeSpatialExtent,
} from "../src/utils/kpiSpatialHelpers.ts";

describe("KPI Spatial Helpers: IDW High-Density Contour (EC) & Exceedance Point Maps", () => {
  it("detects EC parameter reliably and defaults other parameters to exceedance point mode", () => {
    assert.equal(isEcParameter("EC"), true);
    assert.equal(isEcParameter("ec"), true);
    assert.equal(isEcParameter("Cond", { Cond: "EC" }), true);
    assert.equal(isEcParameter("Conductivity", {}, "Electrical Conductivity"), true);
    assert.equal(isEcParameter("F"), false);
    assert.equal(isEcParameter("NO3"), false);
    assert.equal(isEcParameter("U"), false);
    assert.equal(isEcParameter("As"), false);
  });

  it("extracts geocoded sample points with block filtering and BIS exceedance flags", () => {
    const rawData = [
      { State: "Rajasthan", District: "Jaipur", Block: "Sanganer", Location: "Site A", Lat: 26.8, Lng: 75.78, EC: 3400, F: 2.1, pH: 7.4 },
      { State: "Rajasthan", District: "Jaipur", Block: "Amber", Location: "Site B", Lat: 26.98, Lng: 75.85, EC: 620, F: 0.8, pH: 8.9 },
      { State: "Rajasthan", District: "Jaipur", Block: "Amber", Location: "NoCoord", Lat: "", Lng: "", EC: 900, F: 1.9, pH: 7.2 },
    ];
    const headers = { state: "State", district: "District", block: "Block", location: "Location", latitude: "Lat", longitude: "Lng", params: ["EC", "F", "pH"] };

    const fAll = buildSpatialSamplePoints({ rawData, headers, headerMap: {}, paramKey: "F", b1: 1.0, b2: 1.5 });
    assert.equal(fAll.points.length, 2);
    assert.equal(fAll.nonGeocodedCount, 1);
    assert.equal(fAll.points[0].isExceed, true);
    assert.equal(fAll.points[1].isExceed, false);

    // Block filter isolates Sanganer only
    const fBlock = buildSpatialSamplePoints({ rawData, headers, headerMap: {}, paramKey: "F", b1: 1.0, b2: 1.5, selectedBlock: "Sanganer" });
    assert.equal(fBlock.points.length, 1);
    assert.equal(fBlock.points[0].location, "Site A");

    // pH rule checks < 6.5 or > 8.5
    const phRes = buildSpatialSamplePoints({ rawData, headers, headerMap: {}, paramKey: "pH", b1: 6.5, b2: 8.5 });
    assert.equal(phRes.points[0].isExceed, false);
    assert.equal(phRes.points[1].isExceed, true);
  });

  it("computes high-density IDW grid and extracts Marching Squares iso-contour segments", () => {
    const pts = [
      { lat: 26.0, lng: 75.0, val: 200 },
      { lat: 26.0, lng: 76.0, val: 3500 },
      { lat: 27.0, lng: 75.0, val: 800 },
      { lat: 27.0, lng: 76.0, val: 2500 },
    ];
    const bounds = { minLat: 26.0, maxLat: 27.0, minLng: 75.0, maxLng: 76.0 };
    const cols = 40;
    const rows = 40;
    const grid = computeHighDensityIdwGrid({ points: pts, bounds, cols, rows, power: 2 });

    assert.equal(grid.length, cols * rows);
    // Exact corner matches
    assert.ok(Math.abs(grid[0] - 200) < 1e-2);
    assert.ok(Math.abs(grid[cols - 1] - 3500) < 1e-2);
    assert.ok(Math.abs(grid[(rows - 1) * cols + (cols - 1)] - 2500) < 1e-2);

    const segments = extractIsoContourSegments(grid, cols, rows, [750, 1500, 3000]);
    assert.ok(segments.length > 0);
    assert.equal(segments.some((s) => s.level === 750), true);
    assert.equal(segments.some((s) => s.level === 3000), true);

    assert.deepEqual(getEcColorRgba(500, false), [0, 92, 230, 245]);
    assert.deepEqual(getEcColorRgba(1500, false), [255, 255, 0, 245]);
    assert.deepEqual(getEcColorRgba(3500, false), [255, 0, 0, 245]);
  });

  it("matches GeoJSON features down to Block level and computes tight extent", () => {
    const feat1 = {
      type: "Feature",
      properties: { STATE_NAME: "Rajasthan", DISTRICT_NAME: "Jaipur", BLOCK_NAME: "Sanganer" },
      geometry: { type: "Polygon", coordinates: [[[75.6, 26.7], [75.9, 26.7], [75.9, 26.9], [75.6, 26.9], [75.6, 26.7]]] },
    };
    const feat2 = {
      type: "Feature",
      properties: { STATE_NAME: "Rajasthan", DISTRICT_NAME: "Jaipur", BLOCK_NAME: "Amber" },
      geometry: { type: "Polygon", coordinates: [[[75.7, 26.9], [76.0, 26.9], [76.0, 27.1], [75.7, 27.1], [75.7, 26.9]]] },
    };

    assert.equal(featureMatchesAdminSelection(feat1, "Rajasthan", "Jaipur", "Sanganer"), true);
    assert.equal(featureMatchesAdminSelection(feat2, "Rajasthan", "Jaipur", "Sanganer"), false);

    const ext = computeSpatialExtent([feat1], []);
    assert.ok(ext.minLng < 75.6 && ext.maxLng > 75.9);
    assert.ok(ext.minLat < 26.7 && ext.maxLat > 26.9);
  });
});
