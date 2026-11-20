import test from "node:test";
import assert from "node:assert/strict";
import {
  buildComplianceWorkbook,
  computeComplianceDataRows,
} from "../src/utils/complianceExport.ts";
import { DataHeaders } from "../src/types.ts";

const sampleHeaders: DataHeaders = {
  state: "State",
  district: "District",
  block: "Block",
  wellId: "Well ID",
  location: "Location",
  longitude: "Lon",
  latitude: "Lat",
  params: ["pH", "F", "NO3", "Fe"],
};

const sampleHeaderMap: Record<string, string> = {
  pH: "pH",
  F: "F",
  NO3: "NO3",
  Fe: "Fe",
};

const sampleDataset = [
  {
    "Well ID": "W1",
    State: "Rajasthan",
    District: "Jaipur",
    Block: "Amber",
    Location: "Site 1",
    Lon: 75.8,
    Lat: 26.9,
    pH: 7.2,
    F: 0.8,
    NO3: 20,
    Fe: 0.1,
  },
  {
    "Well ID": "W2",
    State: "Rajasthan",
    District: "Jaipur",
    Block: "Sanganer",
    Location: "Site 2",
    Lon: 75.7,
    Lat: 26.8,
    pH: 8.9,
    F: 2.1,
    NO3: 60,
    Fe: 1.8,
  },
  {
    "Well ID": "W3",
    State: "Rajasthan",
    District: "Alwar",
    Block: "Behror",
    Location: "Site 3",
    Lon: 76.2,
    Lat: 27.8,
    pH: 7.8,
    F: 1.2,
    NO3: 30,
    Fe: 0.2,
  },
];

test("computeComplianceDataRows accurately classifies pH range, single-limit, and dual-limit parameters", () => {
  // Dual-limit parameter: F (b1=1.0, b2=1.5)
  const fRows = computeComplianceDataRows(
    "F",
    sampleDataset,
    "District",
    sampleHeaders,
    sampleHeaderMap
  );
  assert.ok(fRows);
  assert.equal(fRows[0][1], "State");
  assert.equal(fRows[0][2], "District");
  // Alwar has 1 sample (1.2 -> >b1-b2 permissible), Jaipur has 2 samples (0.8 -> <=b1, 2.1 -> >b2 fail)
  const alwarRow = fRows.find((r) => r[2] === "Alwar")!;
  assert.equal(alwarRow[3], 1); // Total Samples
  assert.equal(alwarRow[4], 0); // <=1.0
  assert.equal(alwarRow[6], 1); // >1.0-1.5
  assert.equal(alwarRow[8], 0); // >1.5

  const jaipurRow = fRows.find((r) => r[2] === "Jaipur")!;
  assert.equal(jaipurRow[3], 2);
  assert.equal(jaipurRow[4], 1);
  assert.equal(jaipurRow[6], 0);
  assert.equal(jaipurRow[8], 1);

  const totalRow = fRows[fRows.length - 1];
  assert.equal(totalRow[1], "TOTAL SUMMARY");
  assert.equal(totalRow[3], 3);

  // pH range check (6.5 - 8.5): W2 is 8.9 (Out Range)
  const phRows = computeComplianceDataRows(
    "pH",
    sampleDataset,
    "State",
    sampleHeaders,
    sampleHeaderMap
  );
  assert.ok(phRows);
  const stateRow = phRows[1];
  assert.equal(stateRow[2], 3); // Total Samples
  assert.equal(stateRow[3], 2); // In Range
  assert.equal(stateRow[5], 1); // Out Range

  // Single-limit parameter: NO3 (b1=45, b2=45)
  const no3Rows = computeComplianceDataRows(
    "NO3",
    sampleDataset,
    "State",
    sampleHeaders,
    sampleHeaderMap
  );
  assert.ok(no3Rows);
  assert.equal(no3Rows[1][3], 2); // <=45
  assert.equal(no3Rows[1][5], 1); // >45
});

test("buildComplianceWorkbook builds parameter sheets and individual/combined exceedance tabs", () => {
  const { workbook, sheetCount } = buildComplianceWorkbook({
    filteredDataset: sampleDataset,
    reportingLevel: "District",
    headers: sampleHeaders,
    headerMap: sampleHeaderMap,
    exportParams: ["F", "Fe"],
    combinedParams: ["F", "NO3", "Fe"],
    exportIndividualExceedance: true,
    exportCombinedExceedance: true,
  });

  assert.equal(sheetCount, 4);
  assert.deepEqual(workbook.SheetNames, [
    "F",
    "Fe",
    "Exceedance Locations",
    "Combined Exceedances",
  ]);

  const combSheet = workbook.Sheets["Combined Exceedances"];
  // W2 exceeds F (2.1 > 1.5), NO3 (60 > 45), and Fe (heavy metal > 0.3) -> Classification must flag heavy metals
  assert.equal(combSheet["L3"]?.v, "Contamination with heavy metals");
  assert.equal(combSheet["I3"]?.v, 3);
});
