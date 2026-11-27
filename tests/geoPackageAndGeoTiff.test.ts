import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fromArrayBuffer } from "geotiff";
import {
  encodeGpkgGeometry,
  decodeGpkgGeometry,
  createGeoPackageBlob,
  parseGeoPackageArrayBuffer,
  sanitizeSqlIdentifier
} from "../src/utils/geoPackageEngine.ts";
import {
  buildInterpolationFloat32Grid,
  createFloat32GeoTiffBlob,
  createRgbaGeoTiffBlob,
  parseGeoTiffArrayBuffer,
  sampleImportedGeoTiffValue
} from "../src/utils/geoTiffEngine.ts";
import { createGeoTiffBlob } from "../src/utils/gisMapHelpers.ts";

describe("OGC GeoPackage 1.3.1 (.gpkg) Point Map Engine", () => {
  it("sanitizes SQL identifiers safely without truncation below 60 chars", () => {
    assert.equal(sanitizeSqlIdentifier("Well_Station_Location_Name"), "Well_Station_Location_Name");
    assert.equal(sanitizeSqlIdentifier("123_nitrate-mg/L"), "f_123_nitrate_mg_L");
    assert.equal(sanitizeSqlIdentifier("   ", "fallback"), "fallback");
  });

  it("round-trips GPB + WKB for Point, LineString, Polygon, and MultiPolygon", () => {
    const geometries = [
      { type: "Point", coordinates: [75.812345, 26.912345] },
      {
        type: "LineString",
        coordinates: [
          [75.1, 26.1],
          [75.5, 26.4],
          [75.9, 26.8]
        ]
      },
      {
        type: "Polygon",
        coordinates: [
          [
            [75.0, 26.0],
            [76.0, 26.0],
            [76.0, 27.0],
            [75.0, 27.0],
            [75.0, 26.0]
          ]
        ]
      },
      {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [72.0, 22.0],
              [73.0, 22.0],
              [73.0, 23.0],
              [72.0, 23.0],
              [72.0, 22.0]
            ]
          ],
          [
            [
              [77.0, 28.0],
              [77.5, 28.0],
              [77.5, 28.5],
              [77.0, 28.5],
              [77.0, 28.0]
            ]
          ]
        ]
      }
    ];

    for (const geom of geometries) {
      const encoded = encodeGpkgGeometry(geom, 4326);
      assert.equal(encoded[0], 0x47); // 'G'
      assert.equal(encoded[1], 0x50); // 'P'
      assert.equal(encoded[2], 0x00); // version 0
      const decoded = decodeGpkgGeometry(encoded);
      assert.deepEqual(decoded, geom);
    }
  });

  it("writes a valid OGC 1.3.1 GeoPackage (.gpkg) and re-imports all layers & long attributes", async () => {
    const stationsGeoJson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [75.812345, 26.912345] },
          properties: {
            WELL_STATION_IDENTIFIER: "CGWB_RJ_JPR_001",
            MONITORING_LOCATION_NAME: "Sanganer Observatory Well",
            FLUORIDE_CONCENTRATION_MG_L: 1.85,
            EXCEEDS_BIS_LIMIT: "Yes",
            SAMPLE_DEPTH_METERS: 42,
            COLOR_HEX: "#EF4444"
          }
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [73.024309, 26.238947] },
          properties: {
            WELL_STATION_IDENTIFIER: "CGWB_RJ_JDP_002",
            MONITORING_LOCATION_NAME: "Jodhpur Piezometer",
            FLUORIDE_CONCENTRATION_MG_L: 0.72,
            EXCEEDS_BIS_LIMIT: "No",
            SAMPLE_DEPTH_METERS: 35,
            COLOR_HEX: "#22C55E"
          }
        }
      ]
    };

    const boundaryGeoJson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [72.5, 25.5],
                [76.5, 25.5],
                [76.5, 27.5],
                [72.5, 27.5],
                [72.5, 25.5]
              ]
            ]
          },
          properties: { STATE_NAME: "Rajasthan", DISTRICT_COUNT: 33 }
        }
      ]
    };

    const blob = await createGeoPackageBlob([
      {
        tableName: "fluoride_point_map",
        identifier: "Fluoride Monitoring Stations",
        description: "Primary Point Map in WGS84",
        geoJson: stationsGeoJson,
        srsId: 4326
      },
      {
        tableName: "study_area_boundary",
        identifier: "Study Area Boundary",
        geoJson: boundaryGeoJson,
        srsId: 4326
      }
    ]);

    assert.equal(blob.type, "application/geopackage+sqlite3");
    const buf = await blob.arrayBuffer();

    // Verify SQLite magic header string "SQLite format 3\0"
    const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 16));
    assert.equal(magic, "SQLite format 3\0");

    // Round-trip parse via parseGeoPackageArrayBuffer
    const parsed = await parseGeoPackageArrayBuffer(buf, "Fluoride_PointMap.gpkg");
    assert.equal(parsed.isValidGpkgSignature, true);
    assert.equal(parsed.applicationId, 1196444487); // 0x47504B47 "GPKG"
    assert.equal(parsed.userVersion, 10301); // OGC GeoPackage 1.3.1
    assert.equal(parsed.layers.length, 2);

    const ptLayer = parsed.layers.find((l) => l.tableName === "fluoride_point_map");
    assert.ok(ptLayer, "Expected fluoride_point_map layer");
    assert.equal(ptLayer.srsId, 4326);
    assert.equal(ptLayer.geometryType, "POINT");
    assert.equal(ptLayer.featureCount, 2);
    assert.ok(ptLayer.bounds);
    assert.ok(Math.abs(ptLayer.bounds[0] - 73.024309) < 1e-6);
    assert.ok(Math.abs(ptLayer.bounds[2] - 75.812345) < 1e-6);

    const f0 = ptLayer.geoJson.features[0];
    assert.equal(f0.geometry.type, "Point");
    assert.ok(Math.abs(f0.geometry.coordinates[0] - 75.812345) < 1e-6);
    assert.ok(Math.abs(f0.geometry.coordinates[1] - 26.912345) < 1e-6);
    // Verify full non-truncated attribute names (>10 chars) and exact values
    assert.equal(f0.properties.WELL_STATION_IDENTIFIER, "CGWB_RJ_JPR_001");
    assert.equal(f0.properties.MONITORING_LOCATION_NAME, "Sanganer Observatory Well");
    assert.ok(Math.abs(f0.properties.FLUORIDE_CONCENTRATION_MG_L - 1.85) < 1e-6);
    assert.equal(f0.properties.SAMPLE_DEPTH_METERS, 42);
    assert.equal(f0.properties.COLOR_HEX, "#EF4444");
  });
});

describe("OGC GeoTIFF 1.1 (.tif) Scientific Float32 & Visual RGBA Engine", () => {
  it("clips interpolation grids, writes Float32 GeoTIFF with GDAL_NODATA, and round-trips exact pixel values", async () => {
    const bounds = { minLng: 74.0, maxLng: 78.0, minLat: 24.0, maxLat: 28.0 };
    // 4 rows (south -> north) x 4 cols (west -> east)
    const grid = [
      [10, 20, 30, 40],   // south row (lat 24.5)
      [50, 60, 70, 80],   // lat 25.5
      [90, 100, 110, 120], // lat 26.5
      [130, 140, 150, 160] // north row (lat 27.5)
    ];

    // Clip to inner 2x2 square: lng [75, 77], lat [25, 27]
    const clipPoly = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [75.0, 25.0],
                [77.0, 25.0],
                [77.0, 27.0],
                [75.0, 27.0],
                [75.0, 25.0]
              ]
            ]
          },
          properties: {}
        }
      ]
    };

    const built = buildInterpolationFloat32Grid(grid, bounds, clipPoly, -9999);
    assert.equal(built.width, 4);
    assert.equal(built.height, 4);
    assert.equal(built.validCount, 4); // Only center 4 cells inside clip polygon
    assert.equal(built.minVal, 60);
    assert.equal(built.maxVal, 110);

    const blob = createFloat32GeoTiffBlob(
      built.width,
      built.height,
      built.values,
      bounds,
      -9999,
      "TDS Float32 Interpolation"
    );
    assert.equal(blob.type, "image/tiff");

    const buf = await blob.arrayBuffer();

    // Verify with strict `geotiff` library (same tags QGIS/GDAL/ArcGIS read)
    const tiff = await fromArrayBuffer(buf);
    const img = await tiff.getImage();
    assert.equal(img.getWidth(), 4);
    assert.equal(img.getHeight(), 4);
    assert.equal(img.getSamplesPerPixel(), 1);
    assert.equal(img.getBitsPerSample(0), 32);
    assert.equal(img.getSampleFormat(0), 3); // IEEE Float
    assert.equal(img.getGDALNoData(), -9999);
    const gKeys = img.getGeoKeys();
    assert.equal(gKeys.GTModelTypeGeoKey, 2);
    assert.equal(gKeys.GTRasterTypeGeoKey, 1);
    assert.equal(gKeys.GeographicTypeGeoKey, 4326);
    assert.equal(gKeys.GeogAngularUnitsGeoKey, 9102);

    const parsed = await parseGeoTiffArrayBuffer(buf, "TDS_Interpolation_Float32.tif");
    assert.equal(parsed.isSingleBandNumeric, true);
    assert.equal(parsed.epsgCode, 4326);
    assert.equal(parsed.nodata, -9999);
    assert.equal(parsed.minVal, 60);
    assert.equal(parsed.maxVal, 110);
    assert.ok(Math.abs(parsed.bounds.minLng - 74.0) < 1e-6);
    assert.ok(Math.abs(parsed.bounds.maxLat - 28.0) < 1e-6);

    // Sample interior pixels (north-west center = 100 at 75.5E, 26.5N; south-east center = 70 at 76.5E, 25.5N)
    assert.equal(sampleImportedGeoTiffValue(parsed, 75.5, 26.5), 100);
    assert.equal(sampleImportedGeoTiffValue(parsed, 76.5, 25.5), 70);
    // Exterior clipped pixel must return null (NoData)
    assert.equal(sampleImportedGeoTiffValue(parsed, 74.2, 27.8), null);
  });

  it("writes and parses transparent 4-band RGBA GeoTIFF and fixed legacy RGB GeoTIFF cleanly", async () => {
    const bounds = { minLng: 75.0, maxLng: 76.0, minLat: 26.0, maxLat: 27.0 };
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 0,
      0, 0, 255, 255,
      128, 128, 128, 128
    ]);

    const rgbaBlob = createRgbaGeoTiffBlob(2, 2, rgba, bounds);
    const parsedRgba = await parseGeoTiffArrayBuffer(await rgbaBlob.arrayBuffer(), "Visual.tif");
    assert.equal(parsedRgba.isSingleBandNumeric, false);
    assert.equal(parsedRgba.bands, 4);
    assert.equal(parsedRgba.epsgCode, 4326);
    assert.ok(parsedRgba.rgbaBytes);
    assert.equal(parsedRgba.rgbaBytes[0], 255); // R of pixel 0
    assert.equal(parsedRgba.rgbaBytes[3], 255); // Alpha of pixel 0
    assert.equal(parsedRgba.rgbaBytes[7], 0);   // Transparent alpha of pixel 1

    // Also verify createGeoTiffBlob in gisMapHelpers.ts parses cleanly with 4 complete GeoKeys
    const legacyBlob = createGeoTiffBlob(2, 2, rgba, bounds);
    const legacyTiff = await fromArrayBuffer(await legacyBlob.arrayBuffer());
    const legacyImg = await legacyTiff.getImage();
    const legacyKeys = legacyImg.getGeoKeys();
    assert.equal(legacyKeys.GeographicTypeGeoKey, 4326);
    assert.equal(legacyKeys.GeogAngularUnitsGeoKey, 9102);
  });
});
