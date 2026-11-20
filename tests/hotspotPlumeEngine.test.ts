import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHotspotRows } from "../src/utils/hotspotSheetParser";
import {
  buildHotspotsGeoJson,
  calculateHotspotPlumeData,
  classifyHotspotSpreadPattern,
  computeBatchHotspotAnalytics,
  computeDistanceDecayStats,
  getHotspotParamColor
} from "../src/utils/hotspotPlumeEngine";

describe("Hot Spot Plume & Advanced Analytics Engine", () => {
  const sampleSheetRows = [
    {
      "Hot Spot No.": "1",
      "Type of Sample in grid (Identified hot spot/Grid Sample)": "Identified Hot Spot",
      "Identification No. for Hot Spot /sample collected around hot spot": "RJ/2024/NO3/1",
      "State/ UT": "Rajasthan",
      District: "Karauli",
      "Block/ Taluka": "Karauli",
      "Hot Spot Location/Sample Location around hot Spot": "Karauli",
      "Longitude (DD)": 77.0172,
      "Latitude (DD)": 26.5014,
      "Source of Sample": "DW",
      "Nitrate (mg/L)": 226
    },
    {
      "Hot Spot No.": "",
      "Type of Sample in grid (Identified hot spot/Grid Sample)": "Grid Sample",
      "Identification No. for Hot Spot /sample collected around hot spot": "RJ/2024/NO3/1/1",
      "State/ UT": "Rajasthan",
      District: "Karauli",
      "Block/ Taluka": "Karauli",
      "Hot Spot Location/Sample Location around hot Spot": "Karauli Hindaun Road",
      "Longitude (DD)": 77.0198,
      "Latitude (DD)": 26.5183,
      "Source of Sample": "TW",
      "Nitrate (mg/L)": 9
    },
    {
      "Hot Spot No.": "",
      "Type of Sample in grid (Identified hot spot/Grid Sample)": "Grid Sample",
      "Identification No. for Hot Spot /sample collected around hot spot": "RJ/2024/NO3/1/2",
      "State/ UT": "Rajasthan",
      District: "Karauli",
      "Block/ Taluka": "Karauli",
      "Hot Spot Location/Sample Location around hot Spot": "Karauli Lalsot Road",
      "Longitude (DD)": 77.0243,
      "Latitude (DD)": 26.5036,
      "Source of Sample": "TW",
      "Nitrate (mg/L)": 190
    },
    {
      "Hot Spot No.": "2",
      "Type of Sample in grid (Identified hot spot/Grid Sample)": "Identified Hot Spot",
      "Identification No. for Hot Spot /sample collected around hot spot": "RJ/2024/NO3/3",
      "State/ UT": "Rajasthan",
      District: "Bharatpur",
      "Block/ Taluka": "Weir",
      "Hot Spot Location/Sample Location around hot Spot": "Weir",
      "Longitude (DD)": 77.1673,
      "Latitude (DD)": 27.02,
      "Source of Sample": "DW",
      "Nitrate (mg/L)": 140
    },
    {
      "Hot Spot No.": "",
      "Type of Sample in grid (Identified hot spot/Grid Sample)": "Grid Sample",
      "Identification No. for Hot Spot /sample collected around hot spot": "RJ/2024/NO3/3/2",
      "State/ UT": "Rajasthan",
      District: "Bharatpur",
      "Block/ Taluka": "Weir",
      "Hot Spot Location/Sample Location around hot Spot": "Kumher gate",
      "Longitude (DD)": 77.1718,
      "Latitude (DD)": 27.0221,
      "Source of Sample": "DW",
      "Nitrate (mg/L)": 800
    },
    {
      "Hot Spot No.": "3",
      "Type of Sample in grid (Identified hot spot/Grid Sample)": "Identified Hot Spot",
      "Identification No. for Hot Spot /sample collected around hot spot": "GJ/2024-25/F/01/01",
      "State/ UT": "Gujarat",
      District: "Anand",
      "Block/ Taluka": "Petlad",
      "Hot Spot Location/Sample Location around hot Spot": "Dharmaj",
      "Longitude (DD)": 72.78741,
      "Latitude (DD)": 22.42074,
      "Source of Sample": "Dug Well",
      "Nitrate (mg/L)": 214
    },
    {
      "Hot Spot No.": "",
      "Type of Sample in grid (Identified hot spot/Grid Sample)": "Grid Sample",
      "Identification No. for Hot Spot /sample collected around hot spot": "GJ/2024-25/F/01/02",
      "State/ UT": "Gujarat",
      District: "Anand",
      "Block/ Taluka": "Petlad",
      "Hot Spot Location/Sample Location around hot Spot": "Dharmaj 1",
      "Longitude (DD)": 72.79371,
      "Latitude (DD)": 22.41268,
      "Source of Sample": "Dug Well",
      "Nitrate (mg/L)": 112
    }
  ];

  it("computes batch plume analytics, state summaries, and detects Secondary Off-Center Peaks", () => {
    const parsed = parseHotspotRows(sampleSheetRows, "batch.xlsx");
    const batch = computeBatchHotspotAnalytics(parsed.groups, "NO3", parsed.detectedParams);

    assert.equal(batch.items.length, 3);
    assert.equal(batch.stateSummaries.length, 2);
    assert.equal(batch.globalStats.totalHotspots, 3);
    assert.equal(batch.globalStats.totalGridSamples, 4);
    assert.equal(batch.globalStats.secondaryPeakCount, 1);
    assert.equal(batch.globalStats.peakHotspot?.location, "Karauli");
    assert.equal(batch.globalStats.peakGridSample?.location, "Kumher gate");
    assert.equal(batch.globalStats.peakGridSample?.val, 800);

    const weirItem = batch.items.find((i) => i.group.location === "Weir");
    assert.ok(weirItem);
    assert.equal(weirItem.decay.classification, "Secondary Off-Center Peak");
    assert.equal(weirItem.decay.secondaryPeakSample?.location, "Kumher gate");
    assert.equal(weirItem.decay.secondaryPeakSample?.val, 800);
    assert.equal(weirItem.decay.severity, "Critical");
  });

  it("computes negative slope and positive attenuation for decaying localized plumes", () => {
    const decay = computeDistanceDecayStats(
      226,
      [
        { _dist: 0.7, _val: 190, _bearing: 70, _raw: { Location: "Near" } },
        { _dist: 2.1, _val: 40, _bearing: 15, _raw: { Location: "Far" } }
      ],
      "NO3"
    );

    assert.ok(decay.attenuationPct !== null && decay.attenuationPct > 40);
    assert.ok(decay.decaySlopePerKm !== null && decay.decaySlopePerKm < 0);
    assert.ok(decay.pearsonR !== null && decay.pearsonR < -0.8);
    assert.equal(decay.exceedGridCount, 1);
    assert.equal(decay.footprintKm, 0.7);
  });

  it("produces valid GeoJSON FeatureCollection for simultaneous multi-hotspot GIS export", () => {
    const parsed = parseHotspotRows(sampleSheetRows, "batch.xlsx");
    const batch = computeBatchHotspotAnalytics(parsed.groups, "NO3", parsed.detectedParams);
    const geojson = buildHotspotsGeoJson(batch.items, "NO3");

    assert.equal(geojson.type, "FeatureCollection");
    const hsFeatures = geojson.features.filter((f: any) => f.properties.featureType === "Identified_Hot_Spot");
    const gridFeatures = geojson.features.filter((f: any) => f.properties.featureType === "Grid_Sample");
    const bufferFeatures = geojson.features.filter((f: any) => f.properties.featureType === "Buffer_Zone");
    assert.equal(hsFeatures.length, 3);
    assert.equal(gridFeatures.length, 4);
    assert.equal(bufferFeatures.length, 3);
  });

  it("computes 16 cells and directional spread cleanly for ad-hoc hotspot points", () => {
    const res = calculateHotspotPlumeData(
      { lng: 77.0172, lat: 26.5014, val: 226, locationName: "Karauli" },
      5,
      [
        { _lat: 26.5036, _lon: 77.0243, _val: 190, _hasCoords: true, _index: 0, _raw: { Location: "EastWell" } }
      ],
      "NO3",
      8,
      2
    );
    assert.equal(res.gridCells.length, 16);
    assert.equal(res.totalWellsInEnvelope, 1);
    assert.equal(res.dominantDirection?.direction, "E");
  });

  it("classifies Hot Spot spread accurately into Localised, Unidirectional, and Multi-Directional", () => {
    // 1. Localised: 0 exceeding grid samples
    const loc = classifyHotspotSpreadPattern(
      [
        { _dist: 1.0, _val: 12, _bearing: 45 },
        { _dist: 2.0, _val: 20, _bearing: 210 }
      ],
      "U",
      30,
      30
    );
    assert.equal(loc.spreadPattern, "Localised");
    assert.equal(loc.activeExceedDirections.length, 0);

    // 2. Unidirectional: exceeding samples concentrated within <= 90 deg sector (NE & E)
    const uni = classifyHotspotSpreadPattern(
      [
        { _dist: 1.0, _val: 65, _bearing: 50 },
        { _dist: 1.8, _val: 52, _bearing: 85 },
        { _dist: 2.2, _val: 15, _bearing: 240 }
      ],
      "U",
      30,
      30
    );
    assert.equal(uni.spreadPattern, "Unidirectional");
    assert.ok(uni.angularSpanDeg <= 90);
    assert.ok(uni.activeExceedDirections.includes("NE") && uni.activeExceedDirections.includes("E"));

    // 3. Multi-Directional: exceeding samples across opposing directions (> 90 deg span)
    const multi = classifyHotspotSpreadPattern(
      [
        { _dist: 1.0, _val: 90, _bearing: 10 },
        { _dist: 1.5, _val: 75, _bearing: 195 },
        { _dist: 2.0, _val: 60, _bearing: 280 }
      ],
      "U",
      30,
      30
    );
    assert.equal(multi.spreadPattern, "Multi-Directional");
    assert.ok(multi.angularSpanDeg > 90);
    assert.ok(multi.activeExceedDirections.length >= 3);
  });

  it("assigns distinct cartographic colors for different parameters and defaults to 5 km circle & 2x2 km grid", () => {
    const cU = getHotspotParamColor("U");
    const cNO3 = getHotspotParamColor("NO3");
    const cF = getHotspotParamColor("F");
    const cAs = getHotspotParamColor("As");
    const primaries = new Set([cU.primary, cNO3.primary, cF.primary, cAs.primary]);
    assert.equal(primaries.size, 4, "U, NO3, F, As should all have distinct primary colors");

    // Multi-parameter 12-column sheet rows
    const multiRows = [
      {
        "Type of Sample in grid (Identified hot spot/Grid Sample)": "Identified Hot Spot",
        "Identification No. for Hot Spot /sample collected around hot spot": "Delhi/2024/U/01/1",
        "State/ UT": "Delhi",
        District: "North",
        "Block/ Taluka": "NARELA",
        "Hot Spot Location/Sample Location around hot Spot": "Auchandi",
        "Longitude (DD)": 76.99722,
        "Latitude (DD)": 28.81944,
        "Source of Sample": "TW",
        Parameter: "U",
        "Parametr Uint": "ppb",
        "Parameter Values": 42.0
      },
      {
        "Type of Sample in grid (Identified hot spot/Grid Sample)": "Grid Sample",
        "Identification No. for Hot Spot /sample collected around hot spot": "Delhi/2024/U/01/2",
        "State/ UT": "Delhi",
        District: "North",
        "Block/ Taluka": "NARELA",
        "Hot Spot Location/Sample Location around hot Spot": "Auchandi-2",
        "Longitude (DD)": 77.00487,
        "Latitude (DD)": 28.81758,
        "Source of Sample": "",
        Parameter: "U",
        "Parametr Uint": "ppb",
        "Parameter Values": 36.2
      },
      {
        "Type of Sample in grid (Identified hot spot/Grid Sample)": "Grid Sample",
        "Identification No. for Hot Spot /sample collected around hot spot": "Delhi/2024/U/01/3",
        "State/ UT": "Delhi",
        District: "North",
        "Block/ Taluka": "NARELA",
        "Hot Spot Location/Sample Location around hot Spot": "Auchandi-3",
        "Longitude (DD)": 76.99192,
        "Latitude (DD)": 28.82321,
        "Source of Sample": "",
        Parameter: "U",
        "Parametr Uint": "ppb",
        "Parameter Values": 39.8
      },
      {
        "Type of Sample in grid (Identified hot spot/Grid Sample)": "Identified Hot Spot",
        "Identification No. for Hot Spot /sample collected around hot spot": "AP/2024/F/01/1",
        "State/ UT": "Andhra Pradesh",
        District: "Annamayya",
        "Block/ Taluka": "Galiveedu",
        "Hot Spot Location/Sample Location around hot Spot": "Galiveedu",
        "Longitude (DD)": 78.59031,
        "Latitude (DD)": 14.14071,
        "Source of Sample": "Pz",
        Parameter: "F",
        "Parametr Uint": "mg/L",
        "Parameter Values": 3.2
      },
      {
        "Type of Sample in grid (Identified hot spot/Grid Sample)": "Grid Sample",
        "Identification No. for Hot Spot /sample collected around hot spot": "AP/2024/F/01/2",
        "State/ UT": "Andhra Pradesh",
        District: "Annamayya",
        "Block/ Taluka": "Galiveedu",
        "Hot Spot Location/Sample Location around hot Spot": "Tatimakulapally",
        "Longitude (DD)": 78.62139,
        "Latitude (DD)": 14.13667,
        "Source of Sample": "Pz",
        Parameter: "F",
        "Parametr Uint": "mg/L",
        "Parameter Values": 0.9
      }
    ];

    const parsed = parseHotspotRows(multiRows, "multi.xlsx");
    const batch = computeBatchHotspotAnalytics(parsed.groups, "U", parsed.detectedParams);

    assert.equal(batch.items.length, 2);
    assert.equal(batch.paramSummaries.length, 2);
    assert.equal(batch.items[0].radiusKm, 5.0);
    assert.equal(batch.items[0].gridCellSizeKm, 2.0);
    assert.equal(batch.items[0].paramKey, "U");
    assert.equal(batch.items[0].decay.spreadPattern, "Multi-Directional"); // E (105°) and NW (309°) > 90° span
    assert.equal(batch.items[1].paramKey, "F");
    assert.equal(batch.items[1].decay.spreadPattern, "Localised"); // 0.9 <= 1.5 mg/L

    assert.equal(batch.globalStats.localisedCount, 1);
    assert.equal(batch.globalStats.multiDirectionalCount, 1);
  });
});

