import test from "node:test";
import assert from "node:assert/strict";
import {
  GUI_THEMES,
  GUI_THEME_LIST,
  DEFAULT_TAB_THEMES,
  normalizeGuiThemeId,
  resolveActiveGuiTheme,
} from "../src/utils/guiThemes";
import {
  computeHighDensityIdwGrid,
  getEcColorRgba,
  SpatialSamplePoint,
} from "../src/utils/kpiSpatialHelpers";

test("GUI_THEME_LIST exposes 8 distinct themes with complete color tokens", () => {
  assert.equal(GUI_THEME_LIST.length, 8);
  const swatches = new Set(GUI_THEME_LIST.map((t) => t.swatchHex));
  assert.equal(swatches.size, 8);
  for (const theme of GUI_THEME_LIST) {
    assert.ok(theme.name.length > 0);
    assert.ok(theme.bodyBg.length > 0);
    assert.ok(theme.headerBg.length > 0);
    assert.ok(theme.cardHeader.length > 0);
    assert.ok(theme.topAccentGradient.length > 0);
  }
});

test("normalizeGuiThemeId preserves valid IDs and migrates legacy KPI theme IDs", () => {
  assert.equal(normalizeGuiThemeId("emerald-biosphere"), "emerald-biosphere");
  assert.equal(normalizeGuiThemeId("obsidian-dark"), "obsidian-midnight");
  assert.equal(normalizeGuiThemeId("crimson-amber"), "sunset-amber");
  assert.equal(normalizeGuiThemeId("unknown-id", "ocean-aqua"), "ocean-aqua");
  assert.equal(normalizeGuiThemeId(null, "amethyst-violet"), "amethyst-violet");
});

test("resolveActiveGuiTheme returns distinct defaults per GUI tab and honors per-GUI overrides", () => {
  const kpiDefault = resolveActiveGuiTheme("kpi", "per-gui", "royal-indigo", {});
  const gisDefault = resolveActiveGuiTheme("gis", "per-gui", "royal-indigo", {});
  const hotspotDefault = resolveActiveGuiTheme("hotspot", "per-gui", "royal-indigo", {});
  const pcaDefault = resolveActiveGuiTheme("pca", "per-gui", "royal-indigo", {});

  assert.equal(kpiDefault.id, DEFAULT_TAB_THEMES.kpi);
  assert.equal(gisDefault.id, DEFAULT_TAB_THEMES.gis);
  assert.equal(hotspotDefault.id, DEFAULT_TAB_THEMES.hotspot);
  assert.equal(pcaDefault.id, DEFAULT_TAB_THEMES.pca);
  assert.notEqual(kpiDefault.id, gisDefault.id);
  assert.notEqual(gisDefault.id, hotspotDefault.id);

  // Per-GUI custom override only affects that tab
  const overrides = { kpi: "emerald-biosphere" as const, gis: "crimson-ruby" as const };
  assert.equal(resolveActiveGuiTheme("kpi", "per-gui", "royal-indigo", overrides).id, "emerald-biosphere");
  assert.equal(resolveActiveGuiTheme("gis", "per-gui", "royal-indigo", overrides).id, "crimson-ruby");
  assert.equal(resolveActiveGuiTheme("pca", "per-gui", "royal-indigo", overrides).id, DEFAULT_TAB_THEMES.pca);
});

test("resolveActiveGuiTheme applies global theme across all GUIs when in global mode", () => {
  const overrides = { kpi: "emerald-biosphere" as const };
  assert.equal(resolveActiveGuiTheme("kpi", "global", "obsidian-midnight", overrides).id, "obsidian-midnight");
  assert.equal(resolveActiveGuiTheme("gis", "global", "obsidian-midnight", overrides).id, "obsidian-midnight");
  assert.equal(resolveActiveGuiTheme("bulletin", "global", "sunset-amber", overrides).id, "sunset-amber");
});

test("HD IDW interpolation grid & smooth color mapping produce valid continuous values", () => {
  const points: SpatialSamplePoint[] = [
    { lat: 20.0, lng: 75.0, val: 200, state: "MH", district: "A", block: "B1", location: "W1", isExceed: false, isAboveAcceptable: false },
    { lat: 21.0, lng: 76.0, val: 1800, state: "MH", district: "A", block: "B2", location: "W2", isExceed: false, isAboveAcceptable: true },
    { lat: 22.0, lng: 77.0, val: 3800, state: "MH", district: "B", block: "B3", location: "W3", isExceed: true, isAboveAcceptable: true },
  ];

  const grid = computeHighDensityIdwGrid({
    points,
    bounds: { minLng: 74.5, maxLng: 77.5, minLat: 19.5, maxLat: 22.5 },
    cols: 64,
    rows: 64,
    power: 2,
  });

  assert.equal(grid.length, 64 * 64);
  for (let i = 0; i < grid.length; i++) {
    assert.ok(Number.isFinite(grid[i]), "Every interpolated grid cell must be finite");
    assert.ok(grid[i] >= 200 && grid[i] <= 3800, "IDW values must stay within sample bounds");
  }

  // Smooth HD color mapping for any custom parameter threshold (e.g., Fluoride 1.0 - 1.5 mg/L)
  const lowRgba = getEcColorRgba(0.4, true, 1.0, 1.5);
  const midRgba = getEcColorRgba(1.25, true, 1.0, 1.5);
  const highRgba = getEcColorRgba(2.2, true, 1.0, 1.5);

  assert.equal(lowRgba.length, 4);
  assert.equal(midRgba.length, 4);
  assert.equal(highRgba.length, 4);
  assert.notDeepEqual(lowRgba, highRgba);
  assert.ok(highRgba[0] > lowRgba[0], "High exceedance color should be redder than low acceptable color");
});
