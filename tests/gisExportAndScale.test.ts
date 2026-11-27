import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  buildEsriAsciiGrid,
  buildMapInfoMifMid,
  createGisPackageZip,
  WGS84_PRJ,
  type ShapefileFieldDef
} from "../src/utils/shapefileWriter";
import {
  computeCurrentMapScaleRF,
  computeScaleBarSpec,
  computeZoomFactorForTargetScale,
  formatScaleRF,
  type ScaleBarSettings
} from "../src/utils/mapScaleHelpers";

describe("ArcGIS & MapInfo GIS / Grid ZIP Export", () => {
  const sampleFields: ShapefileFieldDef[] = [
    { name: "ID", origKey: "ID", type: "N", length: 8, decimals: 0 },
    { name: "STATION", origKey: "STATION", type: "C", length: 30 },
    { name: "TDS", origKey: "TDS", type: "N", length: 10, decimals: 2 }
  ];

  it("generates valid MapInfo MIF/MID for point, polyline, and polygon geometries", () => {
    const ptRes = buildMapInfoMifMid(
      "point",
      [{ lng: 77.209, lat: 28.6139, properties: { ID: 1, STATION: 'Delhi "Central"', TDS: 450.5 } }],
      sampleFields
    );
    assert.match(ptRes.mif, /CoordSys Earth Projection 1, 104/);
    assert.match(ptRes.mif, /Point 77\.2090000 28\.6139000/);
    assert.match(ptRes.mid, /1,"Delhi ""Central""",450\.50/);

    const lineRes = buildMapInfoMifMid(
      "polyline",
      [
        {
          parts: [
            [
              [77.0, 28.0],
              [77.5, 28.5]
            ],
            [
              [78.0, 28.0],
              [78.5, 28.5]
            ]
          ],
          properties: { ID: 2, STATION: "Contour_500", TDS: 500 }
        }
      ],
      sampleFields
    );
    assert.match(lineRes.mif, /Pline Multiple 2/);

    const polyRes = buildMapInfoMifMid(
      "polygon",
      [
        {
          rings: [
            [
              [77.0, 28.0],
              [78.0, 28.0],
              [78.0, 29.0],
              [77.0, 29.0]
            ]
          ],
          properties: { ID: 3, STATION: "Zone_A", TDS: 320.25 }
        }
      ],
      sampleFields
    );
    assert.match(polyRes.mif, /Region\s+1/);
    // Should auto-close open 4-point ring to 5 vertices
    assert.match(polyRes.mif, /^\s+5\r?$/m);
  });

  it("generates ESRI ASCII Grid (.asc) in north-to-south order with NODATA handling", () => {
    // Row 0 = South (minLat), Row 1 = North (maxLat)
    const grid = [
      [100, 200],
      [300, Number.NaN]
    ];
    const bounds = { minLng: 77.0, maxLng: 79.0, minLat: 28.0, maxLat: 30.0 };
    const { asc, ncols, nrows, cellsize } = buildEsriAsciiGrid(grid, bounds, -9999);

    assert.equal(ncols, 2);
    assert.equal(nrows, 2);
    assert.equal(cellsize, 1);
    const lines = asc.trim().split(/\r?\n/);
    assert.equal(lines[0], "ncols         2");
    assert.equal(lines[1], "nrows         2");
    assert.equal(lines[5], "NODATA_value  -9999");
    // Top line is North row (300, -9999)
    assert.equal(lines[6], "300.0000 -9999");
    // Bottom line is South row (100, 200)
    assert.equal(lines[7], "100.0000 200.0000");
  });

  it("packages ESRI Shapefile, MapInfo TAB + MIF/MID, and ASCII Grid inside one ZIP", async () => {
    const stationsGeoJson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [77.21, 28.61] },
          properties: { ID: 1, WELL_ID: "W01", VALUE: 512.4 }
        }
      ]
    };
    const { asc } = buildEsriAsciiGrid(
      [
        [10, 20],
        [30, 40]
      ],
      { minLng: 77.0, maxLng: 78.0, minLat: 28.0, maxLat: 29.0 }
    );

    const blob = await createGisPackageZip(
      [{ fileBaseName: "03_TDS_Stations", geoJson: stationsGeoJson }],
      [
        { fileName: "06_TDS_Interpolated_Grid.asc", content: asc },
        { fileName: "06_TDS_Interpolated_Grid.prj", content: WGS84_PRJ }
      ]
    );

    const arrayBuf = await blob.arrayBuffer();
    const loadedZip = await JSZip.loadAsync(arrayBuf);
    const names = Object.keys(loadedZip.files);

    for (const ext of [".shp", ".shx", ".dbf", ".prj", ".cpg", ".tab", ".mif", ".mid"]) {
      assert.ok(names.includes(`03_TDS_Stations${ext}`), `Missing 03_TDS_Stations${ext} in GIS ZIP`);
    }
    assert.ok(names.includes("06_TDS_Interpolated_Grid.asc"));
    assert.ok(names.includes("06_TDS_Interpolated_Grid.prj"));
  });
});

describe("Customizable Map Scale & Scale Bar Calculations", () => {
  const defaultSettings: ScaleBarSettings = {
    unit: "km",
    style: "alternating",
    mode: "auto",
    customLength: 50,
    divisions: 4,
    showRf: true,
    fontSize: 8,
    barHeight: 5,
    color: "#0f172a",
    showBox: true,
    pos: "bottom-left",
    offsetX: 0,
    offsetY: 0
  };

  it("round-trips target Representative Fraction (1 : N) scale via zoom factor", () => {
    const baseLngSpan = 10.0;
    const centerLat = 23.0;
    const mapWidthPx = 485;

    for (const targetScale of [100_000, 500_000, 2_500_000]) {
      const zoom = computeZoomFactorForTargetScale(targetScale, baseLngSpan, centerLat, mapWidthPx);
      const resultingScale = computeCurrentMapScaleRF(baseLngSpan * zoom, centerLat, mapWidthPx);
      const relError = Math.abs(resultingScale - targetScale) / targetScale;
      assert.ok(relError < 0.002, `Expected ~${targetScale}, got ${resultingScale}`);
    }
    assert.equal(formatScaleRF(250000), "1 : 250,000");
  });

  it("computes auto, custom length, meters, miles, and dual scale bar specifications", () => {
    const autoSpec = computeScaleBarSpec({
      finalLngSpan: 4.0,
      centerLat: 22.0,
      canvasW: 595,
      canvasH: 758,
      margin: 55,
      settings: defaultSettings
    });
    assert.equal(autoSpec.unitLabel, "km");
    assert.ok(autoSpec.barWidthPx >= 42);
    assert.ok(autoSpec.rfLabel.startsWith("1 : "));
    assert.equal(autoSpec.ticks[0].label, "0");
    assert.ok(autoSpec.ticks[autoSpec.ticks.length - 1].label.endsWith(" km"));

    const customSpec = computeScaleBarSpec({
      finalLngSpan: 4.0,
      centerLat: 22.0,
      canvasW: 595,
      canvasH: 758,
      margin: 55,
      settings: { ...defaultSettings, mode: "custom", customLength: 75, unit: "km", divisions: 5 }
    });
    assert.equal(customSpec.totalValue, 75);
    assert.equal(customSpec.divisions, 5);
    assert.equal(customSpec.ticks[customSpec.ticks.length - 1].label, "75 km");

    const dualSpec = computeScaleBarSpec({
      finalLngSpan: 4.0,
      centerLat: 22.0,
      canvasW: 595,
      canvasH: 758,
      margin: 55,
      settings: { ...defaultSettings, unit: "dual", pos: "bottom-right" }
    });
    assert.ok(dualSpec.secondary, "Dual mode should include secondary miles bar");
    assert.equal(dualSpec.secondary?.unitLabel, "mi");
    assert.ok(dualSpec.boxX > 250, "Bottom-right anchor should position box on right side");
  });
});
