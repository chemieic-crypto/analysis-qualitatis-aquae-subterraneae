import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeSourceAllParamsSummary,
  computeStateWiseSelectedSummary,
  computeSourceExceedingLocations,
  computeStateAffectedSummary,
  percentileFromSorted,
  formatSummaryValue
} from "../src/utils/sourceSummaryEngine.ts";
import type { DataHeaders } from "../src/types.ts";

describe("Source-Wise All-Parameter Summary Engine", () => {
  const headers: DataHeaders = {
    state: "State",
    district: "District",
    block: "Block",
    location: "Location",
    source: "Source",
    params: ["pH", "F (mg/L)", "NO3", "Na", "Mo"]
  };

  const headerMap: Record<string, string> = {
    pH: "pH",
    "F (mg/L)": "F",
    NO3: "NO3",
    Na: "Na",
    Mo: "Mo"
  };

  const sampleRows = [
    // Rajasthan — Bore Well (4 rows)
    { State: "Rajasthan", District: "Jaipur", Block: "Sanganer", Location: "Site-A", Source: "Bore Well", pH: 7.2, "F (mg/L)": 0.5, NO3: 20, Na: 100, Mo: 0.05 },
    { State: "Rajasthan", District: "Jaipur", Block: "Sanganer", Location: "Site-B", Source: "Bore Well", pH: 8.8, "F (mg/L)": 1.8, NO3: 50, Na: 200, Mo: 0.08 },
    { State: "Rajasthan", District: "Jaipur", Block: "Sanganer", Location: "Site-C", Source: "Bore Well", pH: 6.2, "F (mg/L)": 2.4, NO3: 80, Na: 300, Mo: 0.01 },
    { State: "Rajasthan", District: "Jaipur", Block: "Sanganer", Location: "Site-D", Source: "Bore Well", pH: 7.5, "F (mg/L)": "BDL", NO3: 40, Na: 400, Mo: 0.02 },
    // Gujarat — Bore Well (1 row, high F only)
    { State: "Gujarat", District: "Kutch", Block: "Bhuj", Location: "Site-G1", Source: "Bore Well", pH: 7.4, "F (mg/L)": 2.1, NO3: 30, Na: 90, Mo: 0.01 },
    // Rajasthan — Dug Well (2 rows, no exceedances)
    { State: "Rajasthan", District: "Jaipur", Block: "Amber", Location: "Site-E", Source: "Dug Well", pH: 7.0, "F (mg/L)": 1.2, NO3: 30, Na: 50, Mo: 0.01 },
    { State: "Rajasthan", District: "Jaipur", Block: "Amber", Location: "Site-F", Source: "Dug Well", pH: 7.8, "F (mg/L)": "<0.2", NO3: "", Na: 70, Mo: 0.02 }
  ];

  it("excludes Molybdenum (Mo) from paramList and summary rows", () => {
    const res = computeSourceAllParamsSummary(sampleRows, headers, headerMap, "Source");
    assert.equal(res.paramList.some((p) => p.paramCode === "Mo"), false);
    assert.equal(res.rows.some((r) => r.paramCode === "Mo"), false);
    assert.deepEqual(
      res.paramList.map((p) => p.paramCode),
      ["pH", "F", "NO3", "Na"]
    );
  });

  it("computes accurate min, max, P05, P75, P99, and total samples per source and overall", () => {
    const rajRows = sampleRows.filter((r) => r.State === "Rajasthan");
    const res = computeSourceAllParamsSummary(rajRows, headers, headerMap, "Source");
    assert.equal(res.sources.length, 2);
    assert.equal(res.sources[0].sourceName, "Bore Well");
    assert.equal(res.sources[0].rowCount, 4);
    assert.equal(res.sources[1].sourceName, "Dug Well");
    assert.equal(res.sources[1].rowCount, 2);

    // Bore Well NO3 values: [20, 40, 50, 80]
    const bwNo3 = res.rows.find((r) => r.sourceName === "Bore Well" && r.paramCode === "NO3");
    assert.ok(bwNo3);
    assert.equal(bwNo3.totalSamples, 4);
    assert.equal(bwNo3.min, 20);
    assert.equal(bwNo3.max, 80);
    assert.ok(Math.abs((bwNo3.p05 ?? 0) - 23) < 1e-9);
    assert.ok(Math.abs((bwNo3.p75 ?? 0) - 57.5) < 1e-9);
    assert.ok(Math.abs((bwNo3.p99 ?? 0) - 79.1) < 1e-9);
    assert.equal(bwNo3.abovePermissibleCount, 2);
    assert.equal(bwNo3.abovePermissiblePct, 50);

    // Dug Well F values: 1.2 and "<0.2" (= 0.1)
    const dwF = res.rows.find((r) => r.sourceName === "Dug Well" && r.paramCode === "F");
    assert.ok(dwF);
    assert.equal(dwF.totalSamples, 2);
    assert.equal(dwF.min, 0.1);
    assert.equal(dwF.max, 1.2);
    assert.equal(dwF.abovePermissibleCount, 0);
    assert.equal(dwF.abovePermissiblePct, 0);
  });

  it("applies two-sided BIS permissible limits for pH (6.5–8.5) and returns null exceedances for no-BIS-limit params (Na)", () => {
    const rajRows = sampleRows.filter((r) => r.State === "Rajasthan");
    const res = computeSourceAllParamsSummary(rajRows, headers, headerMap, "Source");

    const bwPh = res.rows.find((r) => r.sourceName === "Bore Well" && r.paramCode === "pH");
    assert.ok(bwPh);
    assert.equal(bwPh.hasBisLimit, true);
    assert.equal(bwPh.abovePermissibleCount, 2);
    assert.equal(bwPh.abovePermissiblePct, 50);

    const bwNa = res.rows.find((r) => r.sourceName === "Bore Well" && r.paramCode === "Na");
    assert.ok(bwNa);
    assert.equal(bwNa.hasBisLimit, false);
    assert.equal(bwNa.abovePermissibleCount, null);
    assert.equal(bwNa.abovePermissiblePct, null);
  });

  it("computes State-Wise summary filtered by selected source and selected parameters", () => {
    const stateRes = computeStateWiseSelectedSummary(sampleRows, headers, headerMap, "Source", {
      selectedSources: ["Bore Well"],
      selectedParamCodes: ["F", "NO3"]
    });

    assert.equal(stateRes.totalFilteredRows, 5);
    assert.deepEqual(
      stateRes.paramList.map((p) => p.paramCode),
      ["F", "NO3"]
    );
    assert.deepEqual(
      stateRes.states.map((s) => s.stateName),
      ["Gujarat", "Rajasthan"]
    );

    const gujF = stateRes.rows.find((r) => r.stateName === "Gujarat" && r.paramCode === "F");
    assert.ok(gujF);
    assert.equal(gujF.totalSamples, 1);
    assert.equal(gujF.min, 2.1);
    assert.equal(gujF.max, 2.1);
    assert.equal(gujF.abovePermissibleCount, 1);
    assert.equal(gujF.abovePermissiblePct, 100);

    const rajNo3 = stateRes.rows.find((r) => r.stateName === "Rajasthan" && r.paramCode === "NO3");
    assert.ok(rajNo3);
    assert.equal(rajNo3.totalSamples, 4);
    assert.equal(rajNo3.abovePermissibleCount, 2);
    assert.equal(rajNo3.abovePermissiblePct, 50);
  });

  it("lists exceeding locations with State/District/Block/Location/Source, exceedance count, names, and formatted values with units", () => {
    // Select Bore Well + [pH, F, NO3, Na] -> Site-B (3), Site-C (3), Site-G1 (1) exceed; Na is ignored as no BIS limit
    const locs = computeSourceExceedingLocations(sampleRows, headers, headerMap, "Source", {
      selectedSources: ["Bore Well"],
      selectedParamCodes: ["pH", "F", "NO3", "Na"]
    });

    assert.equal(locs.length, 3);
    // Highest exceeding count first (3 params: Site-B, Site-C), then 1 param (Site-G1)
    assert.equal(locs[0].location, "Site-B");
    assert.equal(locs[0].state, "Rajasthan");
    assert.equal(locs[0].district, "Jaipur");
    assert.equal(locs[0].block, "Sanganer");
    assert.equal(locs[0].source, "Bore Well");
    assert.equal(locs[0].exceedingCount, 3);
    assert.equal(locs[0].exceedingParamNames, "pH Level (pH), Fluoride (F), Nitrate (NO3)");
    assert.equal(locs[0].exceedingValuesWithUnits, "pH: 8.80; F: 1.80 mg/L; NO3: 50.00 mg/L");

    assert.equal(locs[2].location, "Site-G1");
    assert.equal(locs[2].state, "Gujarat");
    assert.equal(locs[2].exceedingCount, 1);
    assert.equal(locs[2].exceedingParamNames, "Fluoride (F)");
    assert.equal(locs[2].exceedingValuesWithUnits, "F: 2.10 mg/L");

    // Selecting Dug Well returns 0 exceeding locations
    const dugLocs = computeSourceExceedingLocations(sampleRows, headers, headerMap, "Source", {
      selectedSources: ["Dug Well"],
      selectedParamCodes: ["pH", "F", "NO3"]
    });
    assert.equal(dugLocs.length, 0);
  });

  it("computes State-Wise Affected Locations Summary counting multi-parameter sites once per location", () => {
    const affectedRes = computeStateAffectedSummary(sampleRows, headers, headerMap, "Source", {
      selectedSources: ["Bore Well"],
      selectedParamCodes: ["pH", "F", "NO3", "Na"]
    });

    assert.equal(affectedRes.overall.totalSamples, 5);
    assert.equal(affectedRes.rows.length, 2);

    const gujarat = affectedRes.rows.find((r) => r.stateName === "Gujarat");
    assert.ok(gujarat);
    assert.equal(gujarat.totalSamples, 1);
    assert.equal(gujarat.affectedLocationsCount, 1);
    assert.equal(gujarat.affectedLocationsPct, 100);
    assert.equal(gujarat.affectedParamNames, "Fluoride (F)");
    assert.equal(gujarat.affectedParamBreakdown.length, 1);
    assert.equal(gujarat.affectedParamBreakdown[0].paramCode, "F");
    assert.equal(gujarat.affectedParamBreakdown[0].count, 1);

    // Rajasthan Bore Well has 4 samples; Site-B & Site-C each exceed 3 params, counted once each -> 2 affected
    const rajasthan = affectedRes.rows.find((r) => r.stateName === "Rajasthan");
    assert.ok(rajasthan);
    assert.equal(rajasthan.totalSamples, 4);
    assert.equal(rajasthan.affectedLocationsCount, 2);
    assert.equal(rajasthan.affectedLocationsPct, 50);
    assert.equal(rajasthan.affectedParamBreakdown.length, 3);
    assert.equal(rajasthan.affectedParamBreakdown.some((p) => p.paramCode === "Na"), false);
    for (const item of rajasthan.affectedParamBreakdown) {
      assert.equal(item.count, 2);
    }

    assert.equal(affectedRes.overall.totalSamples, 5);
    assert.equal(affectedRes.overall.affectedLocationsCount, 3);
    assert.equal(affectedRes.overall.affectedLocationsPct, 60);
    assert.equal(affectedRes.overall.affectedParamBreakdown[0].paramCode, "F");
    assert.equal(affectedRes.overall.affectedParamBreakdown[0].count, 3);

    // Dug Well has 0 exceedances
    const dugAffected = computeStateAffectedSummary(sampleRows, headers, headerMap, "Source", {
      selectedSources: ["Dug Well"],
      selectedParamCodes: ["pH", "F", "NO3"]
    });
    assert.equal(dugAffected.rows.length, 1);
    assert.equal(dugAffected.rows[0].stateName, "Rajasthan");
    assert.equal(dugAffected.rows[0].totalSamples, 2);
    assert.equal(dugAffected.rows[0].affectedLocationsCount, 0);
    assert.equal(dugAffected.rows[0].affectedLocationsPct, 0);
    assert.equal(dugAffected.rows[0].affectedParamNames, "None");
  });

  it("handles empty inputs and formats trace & large numbers cleanly", () => {
    const empty = computeSourceAllParamsSummary([], headers, headerMap, "Source");
    assert.equal(empty.sources.length, 0);
    assert.equal(empty.rows.length, 0);
    assert.equal(percentileFromSorted([10, 20, 30, 40, 50], 50), 30);
    assert.equal(formatSummaryValue(null), "—");
    assert.equal(formatSummaryValue(0.003), "0.003");
    assert.equal(formatSummaryValue(1250.44), "1250.4");
  });
});
