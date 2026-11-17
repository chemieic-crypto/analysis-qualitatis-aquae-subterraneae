import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Provide lightweight window.localStorage mock before importing config
const storage = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, String(v));
    },
    removeItem: (k: string) => {
      storage.delete(k);
    },
  },
};

import {
  NO_BIS_LIMIT_PARAMS,
  DEFAULT_PARAM_CONFIG,
  PARAM_CONFIG,
  hasBisLimit,
  addCustomParam,
  updateParamLimits,
  resetParamLimits,
} from "../src/data/config.ts";

describe("BIS IS 10500:2012 Parameter Configuration & Compliance Rules", () => {
  beforeEach(() => {
    storage.clear();
    resetParamLimits();
  });

  it("enforces core BIS IS 10500 desirable (b1) and permissible (b2) limits", () => {
    assert.deepEqual(
      { b1: DEFAULT_PARAM_CONFIG.pH.b1, b2: DEFAULT_PARAM_CONFIG.pH.b2 },
      { b1: 6.5, b2: 8.5 }
    );
    assert.deepEqual(
      { b1: DEFAULT_PARAM_CONFIG.F.b1, b2: DEFAULT_PARAM_CONFIG.F.b2 },
      { b1: 1.0, b2: 1.5 }
    );
    assert.deepEqual(
      { b1: DEFAULT_PARAM_CONFIG.NO3.b1, b2: DEFAULT_PARAM_CONFIG.NO3.b2 },
      { b1: 45, b2: 45 }
    );
    assert.deepEqual(
      { b1: DEFAULT_PARAM_CONFIG.U.b1, b2: DEFAULT_PARAM_CONFIG.U.b2 },
      { b1: 30, b2: 30 }
    );
    assert.deepEqual(
      { b1: DEFAULT_PARAM_CONFIG.As.b1, b2: DEFAULT_PARAM_CONFIG.As.b2 },
      { b1: 10, b2: 10 }
    );
    assert.deepEqual(
      { b1: DEFAULT_PARAM_CONFIG.EC.b1, b2: DEFAULT_PARAM_CONFIG.EC.b2 },
      { b1: 750, b2: 3000 }
    );
    assert.deepEqual(
      { b1: DEFAULT_PARAM_CONFIG.SAR.b1, b2: DEFAULT_PARAM_CONFIG.SAR.b2 },
      { b1: 10, b2: 26 }
    );
    assert.deepEqual(
      { b1: DEFAULT_PARAM_CONFIG.RSC.b1, b2: DEFAULT_PARAM_CONFIG.RSC.b2 },
      { b1: 1.25, b2: 2.5 }
    );
  });

  it("identifies parameters with and without BIS limits accurately", () => {
    for (const noLimit of ["Sr", "Li", "Co", "Na", "K", "SiO2", "PO4", "HCO3", "CO3"]) {
      assert.equal(NO_BIS_LIMIT_PARAMS.has(noLimit), true);
      assert.equal(hasBisLimit(noLimit), false);
      assert.equal(hasBisLimit(noLimit.toLowerCase()), false);
    }

    for (const limited of ["EC", "F", "NO3", "As", "U", "pH", "TDS", "Fe"]) {
      assert.equal(hasBisLimit(limited), true);
    }

    assert.equal(hasBisLimit(""), false);
  });

  it("supports adding custom parameters, updating limits, and resetting cleanly", () => {
    addCustomParam("Br", "Bromide", "mg/L", 0.5, 1.0);
    assert.ok(PARAM_CONFIG.Br);
    assert.equal(PARAM_CONFIG.Br.b1, 0.5);
    assert.equal(PARAM_CONFIG.Br.b2, 1.0);
    assert.equal(hasBisLimit("Br"), true);

    updateParamLimits("Br", 0.2, 0.8);
    assert.equal(PARAM_CONFIG.Br.b1, 0.2);
    assert.equal(PARAM_CONFIG.Br.b2, 0.8);

    updateParamLimits("EC", 800, 2500);
    assert.equal(PARAM_CONFIG.EC.b1, 800);
    assert.equal(PARAM_CONFIG.EC.b2, 2500);

    resetParamLimits();
    assert.equal(PARAM_CONFIG.Br, undefined);
    assert.equal(PARAM_CONFIG.EC.b1, 750);
    assert.equal(PARAM_CONFIG.EC.b2, 3000);
  });
});
