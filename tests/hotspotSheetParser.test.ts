import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  parseHotspotWorksheet,
  parseHotspotRows,
  buildHotspotGroupPlumePoints,
  classifyHotspotSampleRole,
  matchHotspotParamHeader
} from "../src/utils/hotspotSheetParser.ts";

describe("Hot Spot Data Sheet Parser & Grouping Engine", () => {
  it("classifies Identified Hot Spot and Grid Sample roles accurately", () => {
    assert.equal(classifyHotspotSampleRole("Identified Hot Spot"), "identified_hotspot");
    assert.equal(classifyHotspotSampleRole("identified hot spot"), "identified_hotspot");
    assert.equal(classifyHotspotSampleRole("Grid Sample"), "grid_sample");
    assert.equal(classifyHotspotSampleRole("Surrounding Point"), "grid_sample");
  });

  it("maps Nitrate (mg/L) and Fluoride (mg/L) headers to SECTOR_PARAM_CONFIG keys", () => {
    const no3 = matchHotspotParamHeader("Nitrate (mg/L)");
    assert.equal(no3.paramKey, "NO3");
    assert.equal(no3.unit, "mg/L");
    assert.equal(no3.b1, 45);

    const f = matchHotspotParamHeader("Fluoride (mg/L)");
    assert.equal(f.paramKey, "F");
    assert.equal(f.b1, 1.0);
    assert.equal(f.b2, 1.5);
  });

  it("parses Excel worksheet with merged Hot Spot No. cells into Identified Hot Spot centers and Grid Samples", () => {
    const aoa = [
      [
        "Hot Spot No.",
        "Type of Sample in grid (Identified hot spot/Grid Sample)",
        "Identification No. for Hot Spot /sample collected around hot spot",
        "State/ UT",
        "District",
        "Block/ Taluka",
        "Hot Spot Location/Sample Location around hot Spot",
        "Longitude (DD)",
        "Latitude (DD)",
        "Source of Sample",
        "Nitrate (mg/L)"
      ],
      [1, "Identified Hot Spot", "RJ/2024/NO3/1", "Rajasthan", "Karauli", "Karauli", "Karauli", 77.0172, 26.5014, "DW", 226],
      ["", "Grid Sample", "RJ/2024/NO3/1/1", "Rajasthan", "Karauli", "Karauli", "Karauli Hindaun Road", 77.0198, 26.5183, "TW", 9],
      ["", "Grid Sample", "RJ/2024/NO3/1/2", "Rajasthan", "Karauli", "Karauli", "Karauli masalpur mod", 77.0285, 26.5218, "TW", 50],
      ["", "Grid Sample", "RJ/2024/NO3/1/3", "Rajasthan", "Karauli", "Karauli", "Karauli lalsot road", 77.0243, 26.5036, "TW", 190],
      ["", "Grid Sample", "RJ/2024/NO3/1/4", "Rajasthan", "Karauli", "Karauli", "Karauli kothwali thana", 77.0268, 26.5015, "TW", 78],
      [2, "Identified Hot Spot", "GJ/2024-25/F/01/01", "Gujarat", "Anand", "Petlad", "Dharmaj", 72.78741, 22.42074, "Dug Well", 214],
      ["", "Grid Sample", "GJ/2024-25/F/01/02", "Gujarat", "Anand", "Petlad", "Dharmaj 1", 72.79371, 22.41268, "Dug Well", 112],
      ["", "Grid Sample", "GJ/2024-25/F/01/03", "Gujarat", "Anand", "Petlad", "Dharmaj 2", 72.79353, 22.42752, "Hand Pump", 164],
      ["", "Grid Sample", "GJ/2024-25/F/01/04", "Gujarat", "Anand", "Petlad", "Dharmaj 3", 72.77881, 22.42524, "Tubewell", 41]
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [
      { s: { r: 1, c: 0 }, e: { r: 5, c: 0 } },
      { s: { r: 6, c: 0 }, e: { r: 9, c: 0 } }
    ];

    const parsed = parseHotspotWorksheet(ws, "test_hotspots.xlsx");
    assert.equal(parsed.groups.length, 2);
    assert.equal(parsed.defaultParamKey, "NO3");
    assert.equal(parsed.totalGridSamples, 7);

    const g1 = parsed.groups[0];
    assert.equal(g1.hotspotNo, "1");
    assert.equal(g1.identifiedHotspot.location, "Karauli");
    assert.equal(g1.identifiedHotspot.identificationNo, "RJ/2024/NO3/1");
    assert.equal(g1.identifiedHotspot.values.NO3, 226);
    assert.equal(g1.gridSamples.length, 4);
    assert.equal(g1.gridSamples[0].location, "Karauli Hindaun Road");
    assert.equal(g1.gridSamples[2].values.NO3, 190);

    const g2 = parsed.groups[1];
    assert.equal(g2.hotspotNo, "2");
    assert.equal(g2.state, "Gujarat");
    assert.equal(g2.district, "Anand");
    assert.equal(g2.identifiedHotspot.location, "Dharmaj");
    assert.equal(g2.gridSamples.length, 3);

    // Verify plume point conversion computes distances & preserves values
    const plumeInput = buildHotspotGroupPlumePoints(g1, "NO3");
    assert.equal(plumeInput.hsVal, 226);
    assert.equal(plumeInput.points.length, 4);
    assert.ok(plumeInput.maxDistKm > 1.5 && plumeInput.maxDistKm < 4.0);
  });

  it("forward-fills blank Hot Spot No. cells from CSV rows without merge metadata", () => {
    const rows = [
      {
        "Hot Spot No.": "5",
        "Type of Sample in grid (Identified hot spot/Grid Sample)": "Identified Hot Spot",
        "Identification No. for Hot Spot /sample collected around hot spot": "GJ/2024-25/NO3/01",
        "State/ UT": "Gujarat",
        District: "Vadodara",
        "Block/ Taluka": "Savli",
        "Hot Spot Location/Sample Location around hot Spot": "Juna samalya",
        "Longitude (DD)": 73.27419,
        "Latitude (DD)": 22.50406,
        "Source of Sample": "Dug Well",
        "Nitrate (mg/L)": 138
      },
      {
        "Hot Spot No.": "",
        "Type of Sample in grid (Identified hot spot/Grid Sample)": "Grid Sample",
        "Identification No. for Hot Spot /sample collected around hot spot": "GJ/2024-25/NO3/02",
        "State/ UT": "Gujarat",
        District: "Vadodara",
        "Block/ Taluka": "Savli",
        "Hot Spot Location/Sample Location around hot Spot": "Juna samalya 1",
        "Longitude (DD)": 73.27577,
        "Latitude (DD)": 22.50474,
        "Source of Sample": "Tubewell",
        "Nitrate (mg/L)": 368
      },
      {
        "Hot Spot No.": "",
        "Type of Sample in grid (Identified hot spot/Grid Sample)": "Grid Sample",
        "Identification No. for Hot Spot /sample collected around hot spot": "GJ/2024-25/NO3/04",
        "State/ UT": "Gujarat",
        District: "Vadodara",
        "Block/ Taluka": "Savli",
        "Hot Spot Location/Sample Location around hot Spot": "Savli",
        "Longitude (DD)": 73.22583,
        "Latitude (DD)": 22.57548,
        "Source of Sample": "Dug Well",
        "Nitrate (mg/L)": 134
      }
    ];

    const parsed = parseHotspotRows(rows, "vadodara.csv");
    assert.equal(parsed.groups.length, 1);
    assert.equal(parsed.groups[0].hotspotNo, "5");
    assert.equal(parsed.groups[0].gridSamples.length, 2);
    const { maxDistKm } = buildHotspotGroupPlumePoints(parsed.groups[0], "NO3");
    assert.ok(maxDistKm > 8 && maxDistKm < 11, `Expected Savli distance ~9.3 km, got ${maxDistKm}`);
  });

  it("parses new 12-column multi-parameter sheet format (with Parametr Uint typo, no Hot Spot No., and Mo excluded)", () => {
    const aoa = [
      [
        "Type of Sample in grid (Identified hot spot/Grid Sample)",
        "Identification No. for Hot Spot /sample collected around hot spot",
        "State/ UT",
        "District",
        "Block/ Taluka",
        "Hot Spot Location/Sample Location around hot Spot",
        "Longitude (DD)",
        "Latitude (DD)",
        "Source of Sample",
        "Parameter",
        "Parametr Uint",
        "Parameter Values"
      ],
      ["Identified Hot Spot", "Delhi/2024/U/01/1", "Delhi", "North", "NARELA", "Auchandi", 76.99722, 28.81944, "TW", "U", "ppb", 42.0],
      ["Grid Sample", "Delhi/2024/U/01/2", "Delhi", "North", "NARELA", "Auchandi -2", 77.00487, 28.81758, "", "U", "ppb", 36.2],
      ["Grid Sample", "Delhi/2024/U/01/3", "Delhi", "North", "NARELA", "Auchandi -3", 76.99192, 28.82321, "", "U", "ppb", 39.8],
      ["Identified Hot Spot", "MP/2024/NO3/02/1", "Madhya Pradesh", "Gwalior", "Dabra", "Bharthari", 78.2541, 25.987, "BW", "Nitrate", "mg/L", 235.6],
      ["Grid Sample", "MP/2024/NO3/02/2", "Madhya Pradesh", "Gwalior", "Dabra", "Bharthari-2", 78.2641, 25.988, "HP", "Nitrate", "mg/L", 82.0],
      ["Identified Hot Spot", "AP/2024/F/01/1", "Andhra Pradesh", "Annamayya", "Galiveedu", "Bowreeddygaripalli", 78.59031, 14.14071, "Pz", "F", "mg/L", 3.4],
      ["Grid Sample", "AP/2024/F/01/2", "Andhra Pradesh", "Annamayya", "Galiveedu", "Tatimakulapally", 78.62139, 14.13667, "Pz", "F", "mg/L", 1.1],
      // Molybdenum must be excluded automatically
      ["Identified Hot Spot", "XX/2024/Mo/01/1", "Delhi", "North", "NARELA", "Excluded Mo Spot", 77.01, 28.82, "TW", "Mo", "ppb", 120.0]
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const parsed = parseHotspotWorksheet(ws, "multi_param_12col.xlsx");

    assert.equal(parsed.format, "long");
    assert.equal(parsed.groups.length, 3, "Mo group should be excluded, leaving U, NO3, F");
    assert.equal(parsed.totalGridSamples, 4);

    const paramKeys = parsed.detectedParams.map((p) => p.paramKey).sort();
    assert.deepEqual(paramKeys, ["F", "NO3", "U"]);

    const uGroup = parsed.groups[0];
    assert.equal(uGroup.hotspotNo, "1");
    assert.equal(uGroup.primaryParam, "U");
    assert.equal(uGroup.paramUnit, "ppb");
    assert.equal(uGroup.identifiedHotspot.values.U, 42.0);
    assert.equal(uGroup.gridSamples.length, 2);
    assert.equal(uGroup.gridSamples[0].source, "");

    const no3Group = parsed.groups[1];
    assert.equal(no3Group.hotspotNo, "2");
    assert.equal(no3Group.primaryParam, "NO3");
    assert.equal(no3Group.identifiedHotspot.values.NO3, 235.6);

    const fGroup = parsed.groups[2];
    assert.equal(fGroup.hotspotNo, "3");
    assert.equal(fGroup.primaryParam, "F");
    assert.equal(fGroup.identifiedHotspot.values.F, 3.4);
  });
});

