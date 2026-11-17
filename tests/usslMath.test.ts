import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EQ_WEIGHTS,
  getUSSLSalinity,
  getUSSLSodium,
  processAquiferData,
} from "../src/utils/usslMath.ts";

describe("Hydrochemical USSL, Piper & Chadha Calculations", () => {
  it("classifies USSL salinity zones C1–C4 accurately", () => {
    assert.equal(getUSSLSalinity(150), "C1");
    assert.equal(getUSSLSalinity(249.9), "C1");
    assert.equal(getUSSLSalinity(250), "C2");
    assert.equal(getUSSLSalinity(749), "C2");
    assert.equal(getUSSLSalinity(750), "C3");
    assert.equal(getUSSLSalinity(2249), "C3");
    assert.equal(getUSSLSalinity(2250), "C4");
  });

  it("classifies USSL sodium hazard zones S1–S4 accurately", () => {
    assert.equal(getUSSLSodium(500, 1.5), "S1");
    assert.equal(getUSSLSodium(500, 8.5), "S2");
    assert.equal(getUSSLSodium(500, 15.0), "S3");
    assert.equal(getUSSLSodium(500, 25.0), "S4");
    assert.equal(getUSSLSodium(0, 10), "S1");
  });

  it("converts mg/L to meq/L, computes SAR, Na%, Piper facies, Gibbs, and Chadha fields", () => {
    const mapping = {
      Location: "Site",
      Ca: "Ca",
      Mg: "Mg",
      Na: "Na",
      K: "K",
      Cl: "Cl",
      SO4: "SO4",
      HCO3: "HCO3",
      CO3: "CO3",
      EC: "EC",
      TDS: "TDS",
      Lat: "Lat",
      Lng: "Lng",
    };

    const samples = [
      // Ca-Mg-HCO3 recharge water
      {
        Site: "Recharge Well",
        Ca: 80.16, // ~4.0 meq/L
        Mg: 24.3,  // 2.0 meq/L
        Na: 22.99, // 1.0 meq/L
        K: 3.91,   // 0.1 meq/L
        Cl: 35.45, // 1.0 meq/L
        SO4: 24.015, // 0.5 meq/L
        HCO3: 366.12, // 6.0 meq/L
        CO3: 0,
        EC: 650,
        TDS: 420,
        Lat: 26.85,
        Lng: 75.78,
      },
      // Na-Cl saline water
      {
        Site: "Saline Well",
        Ca: 20.04, // 1.0 meq/L
        Mg: 12.15, // 1.0 meq/L
        Na: 229.9, // 10.0 meq/L
        K: 39.1,   // 1.0 meq/L
        Cl: 354.5, // 10.0 meq/L
        SO4: 96.06, // 2.0 meq/L
        HCO3: 61.02, // 1.0 meq/L
        CO3: 0,
        EC: 2500,
        TDS: null,
        Lat: 27.1,
        Lng: 74.2,
      },
    ];

    const processed = processAquiferData(samples, mapping);
    assert.equal(processed.length, 2);

    const w1 = processed[0]._calc;
    assert.equal(w1.locName, "Recharge Well");
    assert.ok(Math.abs(w1.meq.Ca - 80.16 / EQ_WEIGHTS.Ca) < 1e-6);
    assert.ok(Math.abs(w1.meq.Mg - 2.0) < 1e-6);
    assert.ok(Math.abs(w1.meq.Na - 1.0) < 1e-6);
    assert.ok(Math.abs(w1.sar - 1.0 / Math.sqrt((4 + 2) / 2)) < 1e-3);
    assert.equal(w1.ussl, "C2-S1");
    assert.equal(w1.facies, "Ca-Mg-HCO3 Type");
    assert.equal(w1.chadhaField, "5: Weathering & Recharge (Ca-Mg-HCO3)");
    assert.equal(w1.isComplete, true);
    assert.ok(w1.naPerc > 15 && w1.naPerc < 16);

    const w2 = processed[1]._calc;
    assert.equal(w2.tds, 2500 * 0.65); // derived from EC * 0.65 when TDS missing
    assert.equal(w2.facies, "Na-Cl Type");
    assert.equal(w2.chadhaField, "7: Saline Water/Evaporation (NaCl)");
    assert.equal(w2.ussl.startsWith("C4-"), true);
    assert.ok(w2.gibbsCation > 0.8);
    assert.ok(w2.gibbsAnion > 0.8);
  });

  it("handles missing or non-numeric cells without producing NaN crashes", () => {
    const processed = processAquiferData(
      [{ Site: "Partial", Ca: "—", Mg: "", Na: 23, EC: 400 }],
      { Location: "Site", Ca: "Ca", Mg: "Mg", Na: "Na", EC: "EC" }
    );
    const c = processed[0]._calc;
    assert.equal(c.hasUSSL, false);
    assert.equal(c.hasFacies, false);
    assert.equal(c.isComplete, false);
    assert.equal(c.ussl, "Unknown");
    assert.equal(c.facies, "Unknown");
  });
});
