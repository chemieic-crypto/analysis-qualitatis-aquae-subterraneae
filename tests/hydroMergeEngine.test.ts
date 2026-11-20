import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeJoinValue,
  autoSuggestJoinKeyPairs,
  detectCoordinateColumns,
  executeMultiSheetMerge,
  computeRegionalAreaStats,
  generateHydroGridAnalysis,
} from "../src/utils/hydroMergeEngine.ts";

describe("HydroMerge Engine — Normalization & Join Key Suggestion", () => {
  it("normalizes join keys by folding case, stripping symbols, and slicing optional prefix", () => {
    assert.equal(normalizeJoinValue(" WLS-001/A ", 0), "wls001a");
    assert.equal(normalizeJoinValue("RJ-JPR_12345", 5), "rjjpr");
    assert.equal(normalizeJoinValue(null, 4), "");
    assert.equal(normalizeJoinValue(undefined, 0), "");
  });

  it("auto-suggests matching join columns across differently cased headers", () => {
    const pairs = autoSuggestJoinKeyPairs(
      ["State", "Well_ID", "Latitude"],
      ["SITE_NAME", "wellid", "EC"]
    );
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].mainColumn, "Well_ID");
    assert.equal(pairs[0].targetColumn, "wellid");
  });

  it("detects latitude & longitude keys cleanly", () => {
    const { latKey, lonKey } = detectCoordinateColumns([
      { Station: "W1", Latitude: 26.85, Longitude: 75.81 },
    ]);
    assert.equal(latKey, "Latitude");
    assert.equal(lonKey, "Longitude");
  });
});

describe("HydroMerge Engine — Multi-Sheet Reconciliation (1 Main + N Sheets)", () => {
  const mainSheet = {
    label: "Master_Wells",
    headers: ["Well_ID", "State", "District", "TDS", "Latitude", "Longitude"],
    selectedColumns: ["Well_ID", "State", "District", "TDS", "Latitude", "Longitude"],
    rows: [
      { Well_ID: "W-001", State: "Rajasthan", District: "Jaipur", TDS: 610, Latitude: 26.9, Longitude: 75.8 },
      { Well_ID: "W-002", State: "Rajasthan", District: "Ajmer", TDS: 920, Latitude: 26.4, Longitude: 74.6 },
      { Well_ID: "W-003", State: "Gujarat", District: "Kutch", TDS: 1400, Latitude: 23.2, Longitude: 69.6 },
      { Well_ID: "", State: "Gujarat", District: "Surat", TDS: 300, Latitude: 21.1, Longitude: 72.8 },
    ],
  };

  const sheetLabB = {
    id: "lab_b",
    label: "Lab_B",
    headers: ["Station_ID", "TDS", "NO3"],
    selectedColumns: ["TDS", "NO3"],
    joinKeys: [{ id: "k1", mainColumn: "Well_ID", targetColumn: "Station_ID", prefixLength: 0 }],
    rows: [
      { Station_ID: "w001", TDS: 615, NO3: 24 },
      { Station_ID: "W-002", TDS: 910, NO3: 52 },
      { Station_ID: "W-999", TDS: 500, NO3: 10 },
      { Station_ID: "", TDS: 111, NO3: 5 },
    ],
  };

  const sheetLabC = {
    id: "lab_c",
    label: "Lab_C",
    headers: ["SiteCode", "TDS", "F"],
    selectedColumns: ["TDS", "F"],
    joinKeys: [{ id: "k2", mainColumn: "Well_ID", targetColumn: "SiteCode", prefixLength: 0 }],
    rows: [
      { SiteCode: "W001", TDS: 620, F: 1.2 },
      { SiteCode: "W-888", TDS: 450, F: 0.4 },
    ],
  };

  const sheetFieldD = {
    id: "field_d",
    label: "Field_D",
    headers: ["ID", "pH"],
    selectedColumns: ["pH"],
    joinKeys: [{ id: "k3", mainColumn: "Well_ID", targetColumn: "ID", prefixLength: 0 }],
    rows: [
      { ID: "W-001", pH: 7.4 },
      { ID: "W-002", pH: 7.9 },
    ],
  };

  it("reconciles 1 Main Sheet against 3 Comparison Sheets with full, partial, unmatched & missing breakdowns", () => {
    const res = executeMultiSheetMerge(mainSheet, [sheetLabB, sheetLabC, sheetFieldD], {
      mode: "enrich_main",
      includeStatusColumns: true,
    });

    assert.equal(res.mainTotalRows, 4);
    assert.equal(res.mainMissingKeyRows.length, 1); // W-004 blank Well_ID
    assert.equal(res.fullyMatchedRows.length, 1); // W-001 matched all 3 sheets
    assert.equal(res.partiallyMatchedRows.length, 1); // W-002 matched Lab_B & Field_D (2/3)
    assert.equal(res.unmatchedMainRows.length, 1); // W-003 matched 0/3 sheets

    // Validate column disambiguation across multiple TDS columns
    assert.ok(res.mergedHeaders.includes("TDS"));
    assert.ok(res.mergedHeaders.includes("TDS (Lab_B)"));
    assert.ok(res.mergedHeaders.includes("TDS (Lab_C)"));
    assert.ok(res.mergedHeaders.includes("pH"));

    const fullRow = res.fullyMatchedRows[0].data;
    assert.equal(fullRow.TDS, 610);
    assert.equal(fullRow["TDS (Lab_B)"], 615);
    assert.equal(fullRow["TDS (Lab_C)"], 620);
    assert.equal(fullRow.pH, 7.4);
    assert.equal(fullRow._Match_Status, "Full Match (3/3)");

    // Validate Enrich Main export includes Full + Partial + Unmatched Main (3 non-missing-key rows)
    assert.equal(res.exportedMergedRows.length, 3);

    // Validate per-sheet summaries
    const labBSum = res.sheetSummaries.find((s) => s.sheetId === "lab_b")!;
    assert.equal(labBSum.matchedCount, 2);
    assert.equal(labBSum.unmatchedCount, 1); // W-999
    assert.equal(labBSum.missingKeyCount, 1);
  });

  it("respects inner_all and match_any merge modes accurately", () => {
    const innerRes = executeMultiSheetMerge(mainSheet, [sheetLabB, sheetLabC, sheetFieldD], {
      mode: "inner_all",
    });
    assert.equal(innerRes.exportedMergedRows.length, 1);

    const anyRes = executeMultiSheetMerge(mainSheet, [sheetLabB, sheetLabC, sheetFieldD], {
      mode: "match_any",
    });
    assert.equal(anyRes.exportedMergedRows.length, 2);
  });

  it("supports prefix length matching and 1-to-1 duplicate key tracking", () => {
    const res = executeMultiSheetMerge(
      {
        label: "M",
        headers: ["Code"],
        selectedColumns: ["Code"],
        rows: [{ Code: "W1001-NORTH" }, { Code: "W1001-SOUTH" }],
      },
      [
        {
          id: "s1",
          label: "S1",
          headers: ["Code", "Tag"],
          selectedColumns: ["Tag"],
          joinKeys: [{ id: "j", mainColumn: "Code", targetColumn: "Code", prefixLength: 5 }],
          rows: [
            { Code: "W1001_A", Tag: "First" },
            { Code: "W1001_B", Tag: "Second" },
            { Code: "W9999", Tag: "Unused" },
          ],
        },
      ],
      { mode: "inner_all", includeStatusColumns: false }
    );

    assert.equal(res.fullyMatchedRows.length, 2);
    assert.equal(res.fullyMatchedRows[0].data.Tag, "First");
    assert.equal(res.fullyMatchedRows[1].data.Tag, "Second");
    assert.equal(res.sheetSummaries[0].unmatchedCount, 1);
  });
});

describe("HydroMerge Engine — Spatial Stats & Clipped Square Grid", () => {
  it("computes regional polygon counts and grid occupancy accurately", () => {
    const geoJson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { PRNCPL_AQ: "Alluvium Belt" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [75.0, 26.0],
                [76.0, 26.0],
                [76.0, 27.0],
                [75.0, 27.0],
                [75.0, 26.0],
              ],
            ],
          },
        },
      ],
    };

    const mergeRes = executeMultiSheetMerge(
      {
        label: "Main",
        headers: ["ID", "State", "Latitude", "Longitude"],
        selectedColumns: ["ID", "State", "Latitude", "Longitude"],
        rows: [
          { ID: "1", State: "Rajasthan", Latitude: 26.5, Longitude: 75.5 },
          { ID: "2", State: "Rajasthan", Latitude: 26.7, Longitude: 75.7 },
        ],
      },
      [
        {
          id: "s2",
          label: "S2",
          headers: ["ID", "Val"],
          selectedColumns: ["Val"],
          joinKeys: [{ id: "k", mainColumn: "ID", targetColumn: "ID", prefixLength: 0 }],
          rows: [{ ID: "1", Val: 10 }],
        },
      ]
    );

    const stats = computeRegionalAreaStats(geoJson, mergeRes);
    assert.equal(stats.summaries.length, 1);
    assert.equal(stats.summaries[0].name, "Alluvium Belt");
    assert.equal(stats.summaries[0].fullMatched, 1);
    assert.equal(stats.summaries[0].unmatched, 1);
    assert.equal(stats.summaries[0].total, 2);

    const grid = generateHydroGridAnalysis(geoJson, 900, mergeRes);
    assert.ok(grid.totalCells > 0);
    assert.ok(grid.occupiedCount >= 1);
    assert.equal(grid.emptyCount + grid.occupiedCount, grid.totalCells);
  });
});
