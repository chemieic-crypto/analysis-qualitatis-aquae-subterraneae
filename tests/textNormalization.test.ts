import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalCaseKey,
  toProperCaseLabel,
  normalizeDatasetRowsToProperCase,
  previewCaseDuplicates
} from "../src/utils/textNormalization.ts";
import {
  computeSourceAllParamsSummary,
  computeStateWiseSelectedSummary,
  computeStateAffectedSummary
} from "../src/utils/sourceSummaryEngine.ts";
import { buildComplianceWorkbook } from "../src/utils/complianceExport.ts";
import type { DataHeaders } from "../src/types.ts";

describe("Automatic Proper Case & Case-Insensitive Table Merging", () => {
  it("normalizes uppercase, lowercase, mixed-case, and extra-space strings into clean Proper Case", () => {
    assert.equal(toProperCaseLabel("RAJASTHAN"), "Rajasthan");
    assert.equal(toProperCaseLabel("rajasthan"), "Rajasthan");
    assert.equal(toProperCaseLabel("  RaJaStHaN  "), "Rajasthan");
    assert.equal(toProperCaseLabel("WEST   BENGAL"), "West Bengal");
    assert.equal(toProperCaseLabel("ANDAMAN AND NICOBAR ISLANDS"), "Andaman and Nicobar Islands");
    assert.equal(toProperCaseLabel("jammu and kashmir"), "Jammu and Kashmir");
    assert.equal(toProperCaseLabel("JAMMU & KASHMIR"), "Jammu & Kashmir");
    assert.equal(toProperCaseLabel("PRE-MONSOON"), "Pre-Monsoon");
    assert.equal(toProperCaseLabel("post-monsoon"), "Post-Monsoon");
    assert.equal(toProperCaseLabel("bore well"), "Bore Well");
    assert.equal(toProperCaseLabel("SANGANER (JAIPUR)"), "Sanganer (Jaipur)");
    assert.equal(toProperCaseLabel("north/south"), "North/South");
    assert.equal(toProperCaseLabel("site-g1"), "Site-G1");
  });

  it("preserves standard scientific & administrative acronyms uppercase", () => {
    assert.equal(toProperCaseLabel("cgwb"), "CGWB");
    assert.equal(toProperCaseLabel("phed"), "PHED");
    assert.equal(toProperCaseLabel("hp"), "HP");
    assert.equal(toProperCaseLabel("bw"), "BW");
    assert.equal(toProperCaseLabel("dw"), "DW");
    assert.equal(toProperCaseLabel("nct delhi"), "NCT Delhi");
    assert.equal(toProperCaseLabel("j&k"), "J&K");
    assert.equal(toProperCaseLabel("zone iii"), "Zone III");
  });

  it("generates identical canonicalCaseKey values regardless of casing or extra spaces", () => {
    const k1 = canonicalCaseKey("RAJASTHAN");
    const k2 = canonicalCaseKey("rajasthan");
    const k3 = canonicalCaseKey("  Rajasthan ");
    assert.equal(k1, k2);
    assert.equal(k2, k3);
    assert.equal(canonicalCaseKey("BORE   WELL"), canonicalCaseKey("bore well"));
  });

  it("auto-normalizes categorical columns on upload while leaving Well IDs, coordinates, and numeric parameters untouched", () => {
    const headers: DataHeaders = {
      state: "State",
      district: "District",
      block: "Block",
      wellId: "Well ID",
      location: "Location",
      source: "Source",
      season: "Season",
      latitude: "Latitude",
      longitude: "Longitude",
      params: ["pH", "F", "NO3"]
    };

    const rawRows = [
      {
        State: "RAJASTHAN",
        District: "JAIPUR",
        Block: "sanganer",
        "Well ID": "rj-JPR-001",
        Location: "SITE-A",
        Source: "BORE WELL",
        Season: "PRE-MONSOON",
        Latitude: 26.82,
        Longitude: 75.79,
        pH: 7.4,
        F: 1.8,
        NO3: "BDL"
      },
      {
        State: "rajasthan",
        District: "Jaipur",
        Block: "SANGANER",
        "Well ID": "rj-JPR-002",
        Location: "site-b",
        Source: "bore well",
        Season: "pre-monsoon",
        Latitude: 26.85,
        Longitude: 75.81,
        pH: 8.6,
        F: 2.2,
        NO3: 55
      },
      {
        State: "Rajasthan",
        District: "jaipur",
        Block: "Sanganer",
        "Well ID": "rj-JPR-003",
        Location: "Site-C",
        Source: "Bore Well",
        Season: "Pre-Monsoon",
        Latitude: 26.88,
        Longitude: 75.83,
        pH: 7.1,
        F: 0.9,
        NO3: 30
      }
    ];

    const preview = previewCaseDuplicates(rawRows, headers);
    assert.ok(preview.mergedCaseVariantsCount >= 10);
    assert.ok(preview.mergedExamples.length > 0);

    const result = normalizeDatasetRowsToProperCase(rawRows, headers);
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows[0].State, "Rajasthan");
    assert.equal(result.rows[1].State, "Rajasthan");
    assert.equal(result.rows[2].State, "Rajasthan");
    assert.equal(result.rows[0].District, "Jaipur");
    assert.equal(result.rows[1].Block, "Sanganer");
    assert.equal(result.rows[0].Source, "Bore Well");
    assert.equal(result.rows[1].Source, "Bore Well");
    assert.equal(result.rows[0].Season, "Pre-Monsoon");
    assert.equal(result.rows[1].Season, "Pre-Monsoon");

    // Well IDs and chemical parameters must NOT be mangled
    assert.equal(result.rows[0]["Well ID"], "rj-JPR-001");
    assert.equal(result.rows[0].NO3, "BDL");
    assert.equal(result.rows[1].F, 2.2);
    assert.equal(result.rows[0].Latitude, 26.82);
  });

  it("merges UPPER/lower case variants automatically inside Source Summary and Compliance Export tables even on unnormalized input", () => {
    const headers: DataHeaders = {
      state: "State",
      district: "District",
      block: "Block",
      location: "Location",
      source: "Source",
      params: ["F", "NO3"]
    };
    const headerMap = { F: "F", NO3: "NO3" };

    const mixedCaseRows = [
      { State: "RAJASTHAN", District: "JAIPUR", Block: "SANGANER", Location: "VILLAGE-A", Source: "BORE WELL", F: 1.8, NO3: 50 },
      { State: "rajasthan", District: "jaipur", Block: "sanganer", Location: "village-b", Source: "bore well", F: 0.7, NO3: 20 },
      { State: "Rajasthan", District: "Jaipur", Block: "Sanganer", Location: "Village-C", Source: "Bore Well", F: 2.1, NO3: 60 }
    ];

    // 1. Source Summary merges all 3 Bore Well variants into a single Proper Case group
    const srcRes = computeSourceAllParamsSummary(mixedCaseRows, headers, headerMap, "Source");
    assert.equal(srcRes.sources.length, 1);
    assert.equal(srcRes.sources[0].sourceName, "Bore Well");
    assert.equal(srcRes.sources[0].rowCount, 3);

    // 2. State Summary merges RAJASTHAN / rajasthan / Rajasthan into a single Proper Case row
    const stRes = computeStateWiseSelectedSummary(mixedCaseRows, headers, headerMap, "Source", {
      selectedSources: ["bore well"]
    });
    assert.equal(stRes.states.length, 1);
    assert.equal(stRes.states[0].stateName, "Rajasthan");
    assert.equal(stRes.states[0].rowCount, 3);

    // 3. State Affected Locations merges all variants into 1 row
    const affRes = computeStateAffectedSummary(mixedCaseRows, headers, headerMap, "Source", {
      selectedSources: ["BORE WELL"]
    });
    assert.equal(affRes.rows.length, 1);
    assert.equal(affRes.rows[0].stateName, "Rajasthan");
    assert.equal(affRes.rows[0].totalSamples, 3);
    assert.equal(affRes.rows[0].affectedLocationsCount, 2);

    // 4. Compliance Export workbook merges all 3 into 1 Rajasthan row instead of 3 separate rows
    const { workbook, sheetCount } = buildComplianceWorkbook({
      filteredDataset: mixedCaseRows,
      reportingLevel: "State",
      headers,
      headerMap,
      exportParams: ["F"],
      combinedParams: [],
      exportIndividualExceedance: false,
      exportCombinedExceedance: false
    });
    assert.equal(sheetCount, 1);
    const fSheet = workbook.Sheets[workbook.SheetNames[0]];
    assert.ok(fSheet);
    // Row 1 = header, Row 2 = Rajasthan (merged 3 samples), Row 3 = Grand Total
    assert.equal(fSheet["B2"]?.v, "Rajasthan");
    assert.equal(fSheet["C2"]?.v, 3);
  });
});
