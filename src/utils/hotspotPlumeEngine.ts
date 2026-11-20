import * as turf from "@turf/turf";
import {
  SECTOR_PARAM_CONFIG,
  fastBearingDeg,
  fastDestination,
  fastHaversineKm
} from "./sectorAnalysisEngine";
import {
  buildHotspotGroupPlumePoints,
  type HotspotGroup,
  type HotspotSheetParamInfo
} from "./hotspotSheetParser";

export interface HotspotParamColorSpec {
  primary: string;
  ringFill: string;
  dark: string;
  softBg: string;
}

/**
 * Distinct high-contrast cartographic color palette per groundwater quality parameter
 * so multi-parameter Hot Spots are immediately distinguishable on the map and legend.
 */
export const HOTSPOT_PARAM_COLORS: Record<string, HotspotParamColorSpec> = {
  U: { primary: "#7c3aed", ringFill: "#ddd6fe", dark: "#4c1d95", softBg: "#f5f3ff" },
  NO3: { primary: "#dc2626", ringFill: "#fecaca", dark: "#991b1b", softBg: "#fef2f2" },
  F: { primary: "#ea580c", ringFill: "#fed7aa", dark: "#9a3412", softBg: "#fff7ed" },
  As: { primary: "#be185d", ringFill: "#fbcfe8", dark: "#831843", softBg: "#fdf2f8" },
  Fe: { primary: "#b45309", ringFill: "#fde68a", dark: "#78350f", softBg: "#fffbeb" },
  EC: { primary: "#0d9488", ringFill: "#99f6e4", dark: "#115e59", softBg: "#f0fdfa" },
  TDS: { primary: "#2563eb", ringFill: "#bfdbfe", dark: "#1e40af", softBg: "#eff6ff" },
  Cl: { primary: "#0284c7", ringFill: "#bae6fd", dark: "#075985", softBg: "#f0f9ff" },
  SO4: { primary: "#4f46e5", ringFill: "#c7d2fe", dark: "#3730a3", softBg: "#eef2ff" },
  pH: { primary: "#059669", ringFill: "#a7f3d0", dark: "#065f46", softBg: "#ecfdf5" },
  TH: { primary: "#65a30d", ringFill: "#d9f99d", dark: "#3f6212", softBg: "#f7fee7" },
  Mn: { primary: "#9333ea", ringFill: "#e9d5ff", dark: "#581c87", softBg: "#faf5ff" },
  Pb: { primary: "#334155", ringFill: "#cbd5e1", dark: "#0f172a", softBg: "#f8fafc" },
  Cr: { primary: "#0f766e", ringFill: "#ccfbf1", dark: "#134e4a", softBg: "#f0fdfa" },
  Cd: { primary: "#e11d48", ringFill: "#fecdd3", dark: "#881337", softBg: "#fff1f2" },
  Zn: { primary: "#0369a1", ringFill: "#e0f2fe", dark: "#0c4a6e", softBg: "#f0f9ff" },
  Cu: { primary: "#c2410c", ringFill: "#ffedd5", dark: "#7c2d12", softBg: "#fff7ed" },
  Al: { primary: "#4338ca", ringFill: "#e0e7ff", dark: "#312e81", softBg: "#eef2ff" },
  B: { primary: "#a21caf", ringFill: "#f5d0fe", dark: "#701a75", softBg: "#fdf4ff" },
  Ba: { primary: "#15803d", ringFill: "#bbf7d0", dark: "#14532d", softBg: "#f0fdf4" },
  Ni: { primary: "#6d28d9", ringFill: "#ede9fe", dark: "#4c1d95", softBg: "#f5f3ff" },
  Se: { primary: "#b91c1c", ringFill: "#fee2e2", dark: "#7f1d1d", softBg: "#fef2f2" },
  Hg: { primary: "#475569", ringFill: "#e2e8f0", dark: "#1e293b", softBg: "#f8fafc" },
  Ca: { primary: "#1d4ed8", ringFill: "#dbeafe", dark: "#1e3a8a", softBg: "#eff6ff" },
  Mg: { primary: "#047857", ringFill: "#d1fae5", dark: "#064e3b", softBg: "#ecfdf5" },
  Alkalinity: { primary: "#0891b2", ringFill: "#cffafe", dark: "#155e75", softBg: "#ecfeff" },
  Turbidity: { primary: "#a16207", ringFill: "#fef08a", dark: "#713f12", softBg: "#fefce8" }
};

const FALLBACK_PARAM_PALETTE: HotspotParamColorSpec[] = [
  { primary: "#7c3aed", ringFill: "#ddd6fe", dark: "#4c1d95", softBg: "#f5f3ff" },
  { primary: "#dc2626", ringFill: "#fecaca", dark: "#991b1b", softBg: "#fef2f2" },
  { primary: "#ea580c", ringFill: "#fed7aa", dark: "#9a3412", softBg: "#fff7ed" },
  { primary: "#0d9488", ringFill: "#99f6e4", dark: "#115e59", softBg: "#f0fdfa" },
  { primary: "#2563eb", ringFill: "#bfdbfe", dark: "#1e40af", softBg: "#eff6ff" },
  { primary: "#be185d", ringFill: "#fbcfe8", dark: "#831843", softBg: "#fdf2f8" },
  { primary: "#059669", ringFill: "#a7f3d0", dark: "#065f46", softBg: "#ecfdf5" },
  { primary: "#4f46e5", ringFill: "#c7d2fe", dark: "#3730a3", softBg: "#eef2ff" }
];

export function getHotspotParamColor(paramKey: string): HotspotParamColorSpec {
  if (!paramKey) return HOTSPOT_PARAM_COLORS.NO3;
  if (HOTSPOT_PARAM_COLORS[paramKey]) return HOTSPOT_PARAM_COLORS[paramKey];
  const lower = paramKey.trim().toLowerCase();
  const matchedKey = Object.keys(HOTSPOT_PARAM_COLORS).find((k) => k.toLowerCase() === lower);
  if (matchedKey) return HOTSPOT_PARAM_COLORS[matchedKey];

  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = (hash * 31 + lower.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PARAM_PALETTE[hash % FALLBACK_PARAM_PALETTE.length];
}

export interface HotspotPoint {
  lng: number;
  lat: number;
  val?: number;
  locationName?: string;
  sampleId?: string;
  hotspotNo?: string;
  state?: string;
  district?: string;
  block?: string;
  source?: string;
  paramKey?: string;
  paramUnit?: string;
}

export interface DirectionalSpreadStats {
  direction: string;
  label: string;
  bearingRange: [number, number];
  midBearing: number;
  innerCount: number;
  outerCount: number;
  totalCount: number;
  avgVal: number;
  maxVal: number;
  minVal: number;
  exceedanceCount: number;
  exceedanceRate: number;
  migrationIndex: number;
  riskLevel: "CRITICAL" | "HIGH" | "MODERATE" | "SAFE" | "NO_DATA";
  color: string;
  innerPoints: any[];
  outerPoints: any[];
}

export interface HotspotGridCell {
  id: string;
  row: number;
  col: number;
  label: string;
  shortCode: string;
  directionCode: string;
  bbox: [number, number, number, number];
  poly: any;
  points: any[];
  count: number;
  avgVal: number;
  maxVal: number;
  minVal: number;
  exceedanceCount: number;
  exceedanceRate: number;
  riskLevel: "CRITICAL" | "HIGH" | "MODERATE" | "SAFE" | "NO_DATA";
  color: string;
  centerLng: number;
  centerLat: number;
  distFromHS: number;
}

export interface HotspotPlumeResult {
  hotspot: HotspotPoint;
  radiusKm: number;
  gridCellSizeKm: number;
  gridRows: number;
  gridCols: number;
  totalWellsInEnvelope: number;
  innerWellsCount: number;
  outerWellsCount: number;
  gridCells: HotspotGridCell[];
  highestContaminatedCell: HotspotGridCell | null;
  samplingLocations: any[];
  directionalStats: DirectionalSpreadStats[];
  dominantDirection: DirectionalSpreadStats | null;
  secondaryDirection: DirectionalSpreadStats | null;
  overallAvg: number;
  overallMax: number;
  baselineLimit: number;
  unit: string;
  verdict: string;
  squareBBox: {
    northLat: number;
    southLat: number;
    eastLng: number;
    westLng: number;
  };
}

export type HotspotPlumeClassification =
  | "Secondary Off-Center Peak"
  | "Expanding Plume"
  | "Localized Point Source"
  | "Within Limit"
  | "No Surrounding Data";

export type HotspotSpreadPattern = "Localised" | "Unidirectional" | "Multi-Directional";

export type HotspotSeverityClass = "Critical" | "High" | "Moderate" | "Low";

export interface HotspotSpreadClassification {
  spreadPattern: HotspotSpreadPattern;
  spreadDirectionLabel: string;
  activeExceedDirections: string[];
  angularSpanDeg: number;
  spreadRationale: string;
}

export interface HotspotDecayStats {
  hsVal: number;
  meanGridVal: number;
  minGridVal: number;
  maxGridVal: number;
  validGridCount: number;
  exceedGridCount: number;
  exceedGridPct: number;
  hsExceedsLimit: boolean;
  /** Positive = concentration drops away from HS; Negative = surrounding average exceeds HS */
  attenuationPct: number | null;
  /** Linear regression slope (unit per km) from distance 0 (HS) outward */
  decaySlopePerKm: number | null;
  /** Pearson correlation r between distance (km) and concentration */
  pearsonR: number | null;
  /** Furthest distance (km) at which a surrounding sample exceeds limit */
  footprintKm: number;
  /** Maximum distance (km) among all surrounding grid samples */
  maxSampleDistKm: number;
  /** Peak surrounding sample exceeding HS (if any) */
  secondaryPeakSample: {
    location: string;
    identificationNo: string;
    val: number;
    distKm: number;
    bearing: number;
  } | null;
  classification: HotspotPlumeClassification;
  spreadPattern: HotspotSpreadPattern;
  spreadDirectionLabel: string;
  activeExceedDirections: string[];
  angularSpanDeg: number;
  spreadRationale: string;
  severity: HotspotSeverityClass;
  severityScore: number;
}

export interface HotspotGroupBatchAnalytics {
  group: HotspotGroup;
  point: HotspotPoint;
  paramKey: string;
  paramUnit: string;
  b1: number;
  b2: number;
  result: HotspotPlumeResult;
  decay: HotspotDecayStats;
  radiusKm: number;
  gridCellSizeKm: number;
}

export interface HotspotStateSummary {
  state: string;
  hotspotCount: number;
  totalGridSamples: number;
  hsExceedCount: number;
  gridExceedCount: number;
  gridExceedPct: number;
  meanHsVal: number;
  maxHsVal: number;
  maxGridVal: number;
  maxFootprintKm: number;
  criticalCount: number;
  secondaryPeakCount: number;
  localisedCount: number;
  unidirectionalCount: number;
  multiDirectionalCount: number;
  parametersAffected: string[];
}

export interface HotspotParamSummary {
  paramKey: string;
  unit: string;
  b1: number;
  b2: number;
  color: string;
  hotspotCount: number;
  totalGridSamples: number;
  hsExceedCount: number;
  gridExceedCount: number;
  gridExceedPct: number;
  meanHsVal: number;
  maxHsVal: number;
  maxGridVal: number;
  maxFootprintKm: number;
  criticalCount: number;
  localisedCount: number;
  unidirectionalCount: number;
  multiDirectionalCount: number;
  statesAffected: string[];
}

export interface HotspotBatchAnalyticsResult {
  items: HotspotGroupBatchAnalytics[];
  stateSummaries: HotspotStateSummary[];
  paramSummaries: HotspotParamSummary[];
  globalStats: {
    totalHotspots: number;
    totalGridSamples: number;
    hsExceedCount: number;
    gridExceedCount: number;
    gridExceedPct: number;
    criticalCount: number;
    highCount: number;
    secondaryPeakCount: number;
    expandingCount: number;
    localisedCount: number;
    unidirectionalCount: number;
    multiDirectionalCount: number;
    meanHsVal: number;
    meanGridVal: number;
    maxFootprintKm: number;
    peakHotspot: {
      hotspotNo: string;
      location: string;
      state: string;
      val: number;
      paramKey?: string;
      unit?: string;
    } | null;
    peakGridSample: {
      hotspotNo: string;
      location: string;
      val: number;
      paramKey?: string;
      unit?: string;
    } | null;
    unit: string;
    b1: number;
    b2: number;
  };
}

function bearingToOctantCode(bearing: number): string {
  const b = ((bearing % 360) + 360) % 360;
  if (b >= 337.5 || b < 22.5) return "N";
  if (b < 67.5) return "NE";
  if (b < 112.5) return "E";
  if (b < 157.5) return "SE";
  if (b < 202.5) return "S";
  if (b < 247.5) return "SW";
  if (b < 292.5) return "W";
  return "NW";
}

function isValueExceedingLimit(val: number, paramKey: string, b1: number, b2: number): boolean {
  if (isNaN(val)) return false;
  if (paramKey.toLowerCase() === "ph") {
    return val < b1 || val > b2;
  }
  const threshold = b2 > 0 ? b2 : b1;
  return val > threshold;
}

/**
 * Classifies Hot Spot spatial spread into:
 * - "Localised": 0 exceeding grid samples (or tightly confined within immediate 0.5 km core with <= 1 exceeding point)
 * - "Unidirectional": Exceeding grid samples extend along a single directional corridor (minimal circular angular span <= 90 deg)
 * - "Multi-Directional": Exceeding grid samples span multiple distinct directions (angular span > 90 deg across >= 2 points)
 */
export function classifyHotspotSpreadPattern(
  samplingLocations: any[],
  paramKey: string,
  b1Override?: number,
  b2Override?: number
): HotspotSpreadClassification {
  const cfg = SECTOR_PARAM_CONFIG[paramKey] || { b1: 45, b2: 100, unit: "mg/L" };
  const b1 = b1Override !== undefined ? b1Override : cfg.b1;
  const b2 = b2Override !== undefined ? b2Override : cfg.b2;

  const exceeding: { dist: number; bearing: number; val: number; octant: string }[] = [];
  for (let i = 0; i < samplingLocations.length; i++) {
    const pt = samplingLocations[i];
    const v = typeof pt._val === "number" ? pt._val : NaN;
    if (isValueExceedingLimit(v, paramKey, b1, b2)) {
      const dist = typeof pt._dist === "number" && !isNaN(pt._dist) ? pt._dist : 0;
      const bearing = typeof pt._bearing === "number" && !isNaN(pt._bearing) ? ((pt._bearing % 360) + 360) % 360 : 0;
      exceeding.push({ dist, bearing, val: v, octant: bearingToOctantCode(bearing) });
    }
  }

  if (exceeding.length === 0) {
    return {
      spreadPattern: "Localised",
      spreadDirectionLabel: "Confined to Hot Spot",
      activeExceedDirections: [],
      angularSpanDeg: 0,
      spreadRationale:
        samplingLocations.length === 0
          ? "No surrounding grid samples recorded; impact assessed as localised."
          : "None of the surrounding grid samples exceed the BIS permissible limit; contamination remains localised at the Hot Spot."
    };
  }

  // Unique octants in clockwise compass order
  const compassOrder = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const octantSet = new Set(exceeding.map((e) => e.octant));
  const activeExceedDirections = compassOrder.filter((o) => octantSet.has(o));

  const maxExceedDist = Math.max(...exceeding.map((e) => e.dist));

  // If all exceeding samples are practically co-located at the Hot Spot (< 0.45 km) with only 1 sample
  if (exceeding.length === 1 && maxExceedDist <= 0.45) {
    return {
      spreadPattern: "Localised",
      spreadDirectionLabel: `Immediate Core (${maxExceedDist.toFixed(2)} km)`,
      activeExceedDirections,
      angularSpanDeg: 0,
      spreadRationale: `Only 1 adjacent sample within ${maxExceedDist.toFixed(2)} km exceeds BIS limit; plume remains localised near the Hot Spot.`
    };
  }

  // Compute minimum circular arc (angular span in degrees) covering all exceeding sample bearings
  const sortedBearings = exceeding.map((e) => e.bearing).sort((a, b) => a - b);
  let angularSpanDeg = 0;
  if (sortedBearings.length >= 2) {
    let maxGap = 0;
    for (let i = 0; i < sortedBearings.length - 1; i++) {
      const gap = sortedBearings[i + 1] - sortedBearings[i];
      if (gap > maxGap) maxGap = gap;
    }
    const wrapGap = 360 - sortedBearings[sortedBearings.length - 1] + sortedBearings[0];
    if (wrapGap > maxGap) maxGap = wrapGap;
    angularSpanDeg = Math.max(0, Math.round(360 - maxGap));
  }

  // Compute circular mean bearing of exceeding samples
  let sinSum = 0;
  let cosSum = 0;
  for (const e of exceeding) {
    const rad = (e.bearing * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  let meanBearing = (Math.atan2(sinSum, cosSum) * 180) / Math.PI;
  if (meanBearing < 0) meanBearing += 360;
  const meanOctant = bearingToOctantCode(meanBearing);

  // If all exceeding points lie within <= 90° wedge (or single sample > 0.45 km) => Unidirectional
  if (exceeding.length === 1 || angularSpanDeg <= 90) {
    const dirSummary =
      activeExceedDirections.length === 1
        ? `${activeExceedDirections[0]} (${Math.round(meanBearing)}°)`
        : `${activeExceedDirections.join("–")} (${Math.round(meanBearing)}°)`;
    return {
      spreadPattern: "Unidirectional",
      spreadDirectionLabel: dirSummary,
      activeExceedDirections,
      angularSpanDeg,
      spreadRationale: `${exceeding.length} exceeding grid sample(s) align along a single ${dirSummary} corridor (angular spread ${angularSpanDeg}°, extending up to ${maxExceedDist.toFixed(2)} km).`
    };
  }

  // Multi-Directional: >= 2 exceeding grid samples spread across > 90° azimuth
  return {
    spreadPattern: "Multi-Directional",
    spreadDirectionLabel: `${activeExceedDirections.join(", ")} (${angularSpanDeg}° span)`,
    activeExceedDirections,
    angularSpanDeg,
    spreadRationale: `${exceeding.length} exceeding grid samples span ${activeExceedDirections.length} compass sectors (${activeExceedDirections.join(", ")}, ${angularSpanDeg}° arc, up to ${maxExceedDist.toFixed(2)} km), indicating multi-directional migration.`
  };
}

/**
 * Calculates Circular Buffer Zone (default 5 km) with Superimposed 4x4 Grid (default 2x2 km cells)
 * using fast zero-allocation math.
 */
export function calculateHotspotPlumeData(
  hotspot: HotspotPoint,
  radiusKm: number = 5.0,
  points: any[],
  activeParam: string,
  resolution: 8 | 4 = 8,
  gridCellSizeKm: number = 2.0,
  limitOverride?: { b1: number; b2: number; unit: string }
): HotspotPlumeResult {
  const R = Math.max(0.5, radiusKm || 5.0);
  const cellKm = Math.max(0.2, gridCellSizeKm || 2.0);
  const paramConfig = limitOverride || SECTOR_PARAM_CONFIG[activeParam] || { b1: 45, b2: 100, unit: "mg/L" };
  const b1 = paramConfig.b1;
  const b2 = paramConfig.b2;
  const unit = paramConfig.unit;

  const halfSpanKm = 2 * cellKm;
  const northLat = fastDestination(hotspot.lng, hotspot.lat, halfSpanKm, 0)[1];
  const southLat = fastDestination(hotspot.lng, hotspot.lat, halfSpanKm, 180)[1];
  const eastLng = fastDestination(hotspot.lng, hotspot.lat, halfSpanKm, 90)[0];
  const westLng = fastDestination(hotspot.lng, hotspot.lat, halfSpanKm, 270)[0];
  const squareBBox = { northLat, southLat, eastLng, westLng };

  const getLatAtOffsetKm = (offsetYKm: number) =>
    Math.abs(offsetYKm) < 0.0001
      ? hotspot.lat
      : fastDestination(hotspot.lng, hotspot.lat, Math.abs(offsetYKm), offsetYKm >= 0 ? 0 : 180)[1];

  const getLngAtOffsetKm = (offsetXKm: number) =>
    Math.abs(offsetXKm) < 0.0001
      ? hotspot.lng
      : fastDestination(hotspot.lng, hotspot.lat, Math.abs(offsetXKm), offsetXKm >= 0 ? 90 : 270)[0];

  const cellNames: Record<string, { label: string; short: string; dir: string }> = {
    "0-0": { label: "NW Outer (R1,C1)", short: "NW-Out", dir: "NW" },
    "0-1": { label: "NNW Mid (R1,C2)", short: "NNW", dir: "NW" },
    "0-2": { label: "NNE Mid (R1,C3)", short: "NNE", dir: "NE" },
    "0-3": { label: "NE Outer (R1,C4)", short: "NE-Out", dir: "NE" },
    "1-0": { label: "WNW Mid (R2,C1)", short: "WNW", dir: "NW" },
    "1-1": { label: "NW Core (R2,C2)", short: "NW-Core", dir: "NW" },
    "1-2": { label: "NE Core (R2,C3)", short: "NE-Core", dir: "NE" },
    "1-3": { label: "ENE Mid (R2,C4)", short: "ENE", dir: "NE" },
    "2-0": { label: "WSW Mid (R3,C1)", short: "WSW", dir: "SW" },
    "2-1": { label: "SW Core (R3,C2)", short: "SW-Core", dir: "SW" },
    "2-2": { label: "SE Core (R3,C3)", short: "SE-Core", dir: "SE" },
    "2-3": { label: "ESE Mid (R3,C4)", short: "ESE", dir: "SE" },
    "3-0": { label: "SW Outer (R4,C1)", short: "SW-Out", dir: "SW" },
    "3-1": { label: "SSW Mid (R4,C2)", short: "SSW", dir: "SW" },
    "3-2": { label: "SSE Mid (R4,C3)", short: "SSE", dir: "SE" },
    "3-3": { label: "SE Outer (R4,C4)", short: "SE-Out", dir: "SE" }
  };

  // Pre-filter points ONCE using a fast lat/lon bounding envelope covering both the buffer circle and 4x4 grid
  const maxEnvKm = Math.max(R, halfSpanKm * 1.45);
  const envLatDeg = maxEnvKm / 110.574 + 0.02;
  const envLonDeg = maxEnvKm / (111.32 * Math.max(0.1, Math.cos((hotspot.lat * Math.PI) / 180))) + 0.02;
  const envMinLat = Math.min(southLat, hotspot.lat - envLatDeg);
  const envMaxLat = Math.max(northLat, hotspot.lat + envLatDeg);
  const envMinLon = Math.min(westLng, hotspot.lng - envLonDeg);
  const envMaxLon = Math.max(eastLng, hotspot.lng + envLonDeg);

  const nearbyPoints: any[] = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!pt._hasCoords) continue;
    // Always keep explicitly uploaded Grid Samples linked to this Hot Spot, even if slightly beyond radius R
    if (
      pt._isGridSample ||
      (pt._lat >= envMinLat && pt._lat <= envMaxLat && pt._lon >= envMinLon && pt._lon <= envMaxLon)
    ) {
      nearbyPoints.push(pt);
    }
  }

  const gridCells: HotspotGridCell[] = [];
  for (let r = 0; r < 4; r++) {
    const cLatTop = getLatAtOffsetKm((2 - r) * cellKm);
    const cLatBottom = getLatAtOffsetKm((1 - r) * cellKm);

    for (let c = 0; c < 4; c++) {
      const cLngLeft = getLngAtOffsetKm((c - 2) * cellKm);
      const cLngRight = getLngAtOffsetKm((c - 1) * cellKm);

      const cellPoly = turf.polygon([
        [
          [cLngLeft, cLatTop],
          [cLngRight, cLatTop],
          [cLngRight, cLatBottom],
          [cLngLeft, cLatBottom],
          [cLngLeft, cLatTop]
        ]
      ]);

      const cMidLng = (cLngLeft + cLngRight) / 2;
      const cMidLat = (cLatTop + cLatBottom) / 2;
      const distFromHS = fastHaversineKm(hotspot.lat, hotspot.lng, cMidLat, cMidLng);

      const cellPoints: any[] = [];
      let cellSum = 0;
      let cellValid = 0;
      let cellMax = -Infinity;
      let cellMin = Infinity;
      let cellExceedCount = 0;

      for (let i = 0; i < nearbyPoints.length; i++) {
        const pt = nearbyPoints[i];
        if (pt._lat >= cLatBottom && pt._lat <= cLatTop && pt._lon >= cLngLeft && pt._lon <= cLngRight) {
          cellPoints.push(pt);
          const v = pt._val;
          if (!isNaN(v)) {
            cellSum += v;
            cellValid++;
            if (v > cellMax) cellMax = v;
            if (v < cellMin) cellMin = v;
            if (isValueExceedingLimit(v, activeParam, b1, b1)) cellExceedCount++;
          }
        }
      }

      const count = cellPoints.length;
      const avgVal = cellValid > 0 ? cellSum / cellValid : 0;
      const maxVal = cellMax !== -Infinity ? cellMax : 0;
      const minVal = cellMin !== Infinity ? cellMin : 0;
      const exceedanceRate = cellValid > 0 ? (cellExceedCount / cellValid) * 100 : 0;

      let riskLevel: HotspotGridCell["riskLevel"] = "NO_DATA";
      let color = "#94a3b8";

      if (count === 0) {
        riskLevel = "NO_DATA";
        color = "#94a3b8";
      } else if (avgVal > b2 || exceedanceRate >= 50) {
        riskLevel = "CRITICAL";
        color = "#ef4444";
      } else if (avgVal > b1 || exceedanceRate >= 25) {
        riskLevel = "HIGH";
        color = "#f97316";
      } else if (cellExceedCount > 0) {
        riskLevel = "MODERATE";
        color = "#eab308";
      } else {
        riskLevel = "SAFE";
        color = "#10b981";
      }

      const meta = cellNames[`${r}-${c}`] || {
        label: `Cell R${r + 1},C${c + 1}`,
        short: `R${r + 1}C${c + 1}`,
        dir: "CORE"
      };

      gridCells.push({
        id: `R${r}-C${c}`,
        row: r,
        col: c,
        label: meta.label,
        shortCode: meta.short,
        directionCode: meta.dir,
        bbox: [cLngLeft, cLatBottom, cLngRight, cLatTop],
        poly: cellPoly,
        points: cellPoints,
        count,
        avgVal,
        maxVal,
        minVal,
        exceedanceCount: cellExceedCount,
        exceedanceRate,
        riskLevel,
        color,
        centerLng: cMidLng,
        centerLat: cMidLat,
        distFromHS
      });
    }
  }

  const samplingLocations: any[] = [];
  let totalSum = 0;
  let overallMax = -Infinity;
  let validValCount = 0;
  let innerWellsCount = 0;
  let outerWellsCount = 0;

  for (let i = 0; i < nearbyPoints.length; i++) {
    const d = nearbyPoints[i];
    const dist = fastHaversineKm(hotspot.lat, hotspot.lng, d._lat, d._lon);

    if (
      d._isGridSample ||
      dist <= R ||
      (d._lat >= southLat && d._lat <= northLat && d._lon >= westLng && d._lon <= eastLng)
    ) {
      const bearing = fastBearingDeg(hotspot.lat, hotspot.lng, d._lat, d._lon);
      const isInner = dist <= cellKm;
      if (isInner) innerWellsCount++;
      else outerWellsCount++;

      const val = typeof d._val === "number" && !isNaN(d._val) ? d._val : NaN;
      if (!isNaN(val)) {
        totalSum += val;
        validValCount++;
        if (val > overallMax) overallMax = val;
      }

      samplingLocations.push({
        ...(d._raw || d),
        _raw: d._raw || d,
        _index: d._index,
        _lat: d._lat,
        _lon: d._lon,
        _val: d._val,
        _hasCoords: d._hasCoords,
        _dist: dist,
        _bearing: bearing,
        _isInner: isInner,
        _isGridSample: d._isGridSample,
        _identificationNo: d._identificationNo,
        _source: d._source
      });
    }
  }

  const overallAvg = validValCount > 0 ? totalSum / validValCount : 0;
  if (overallMax === -Infinity) overallMax = 0;

  type DirectionDef = { code: string; label: string; range: [number, number]; mid: number };
  const octants: DirectionDef[] = [
    { code: "N", label: "North", range: [337.5, 22.5], mid: 0 },
    { code: "NE", label: "North-East", range: [22.5, 67.5], mid: 45 },
    { code: "E", label: "East", range: [67.5, 112.5], mid: 90 },
    { code: "SE", label: "South-East", range: [112.5, 157.5], mid: 135 },
    { code: "S", label: "South", range: [157.5, 202.5], mid: 180 },
    { code: "SW", label: "South-West", range: [202.5, 247.5], mid: 225 },
    { code: "W", label: "West", range: [247.5, 292.5], mid: 270 },
    { code: "NW", label: "North-West", range: [292.5, 337.5], mid: 315 }
  ];
  const quadrants: DirectionDef[] = [
    { code: "NE", label: "North-East Quadrant", range: [0, 90], mid: 45 },
    { code: "SE", label: "South-East Quadrant", range: [90, 180], mid: 135 },
    { code: "SW", label: "South-West Quadrant", range: [180, 270], mid: 225 },
    { code: "NW", label: "North-West Quadrant", range: [270, 360], mid: 315 }
  ];

  const sectorDefs = resolution === 4 ? quadrants : octants;
  const directionalStats: DirectionalSpreadStats[] = sectorDefs.map((sec) => {
    const dirPoints = samplingLocations.filter((ep) =>
      sec.range[0] > sec.range[1]
        ? ep._bearing >= sec.range[0] || ep._bearing < sec.range[1]
        : ep._bearing >= sec.range[0] && ep._bearing < sec.range[1]
    );

    const innerPts = dirPoints.filter((p) => p._isInner);
    const outerPts = dirPoints.filter((p) => !p._isInner);

    let dirSum = 0;
    let dirValidCount = 0;
    let dirMax = -Infinity;
    let dirMin = Infinity;
    let exceedCount = 0;

    for (let i = 0; i < dirPoints.length; i++) {
      const v = dirPoints[i]._val;
      if (!isNaN(v)) {
        dirSum += v;
        dirValidCount++;
        if (v > dirMax) dirMax = v;
        if (v < dirMin) dirMin = v;
        if (isValueExceedingLimit(v, activeParam, b1, b2)) exceedCount++;
      }
    }

    const avgVal = dirValidCount > 0 ? dirSum / dirValidCount : 0;
    const maxVal = dirMax !== -Infinity ? dirMax : 0;
    const minVal = dirMin !== Infinity ? dirMin : 0;
    const exceedanceRate = dirValidCount > 0 ? (exceedCount / dirValidCount) * 100 : 0;
    const outerWeight = outerPts.length > 0 ? 1.4 : 1.0;
    const migrationIndex = dirValidCount > 0 ? avgVal * (1 + exceedanceRate / 100) * outerWeight : 0;

    let riskLevel: DirectionalSpreadStats["riskLevel"] = "NO_DATA";
    let color = "#94a3b8";

    if (dirPoints.length === 0) {
      riskLevel = "NO_DATA";
      color = "#94a3b8";
    } else if (avgVal > b2 || exceedanceRate >= 50) {
      riskLevel = "CRITICAL";
      color = "#ef4444";
    } else if (avgVal > b1 || exceedanceRate >= 25) {
      riskLevel = "HIGH";
      color = "#f97316";
    } else if (exceedCount > 0) {
      riskLevel = "MODERATE";
      color = "#eab308";
    } else {
      riskLevel = "SAFE";
      color = "#10b981";
    }

    return {
      direction: sec.code,
      label: sec.label,
      bearingRange: sec.range,
      midBearing: sec.mid,
      innerCount: innerPts.length,
      outerCount: outerPts.length,
      totalCount: dirPoints.length,
      avgVal,
      maxVal,
      minVal,
      exceedanceCount: exceedCount,
      exceedanceRate,
      migrationIndex,
      riskLevel,
      color,
      innerPoints: innerPts,
      outerPoints: outerPts
    };
  });

  const activeStats = directionalStats.filter((s) => s.totalCount > 0).sort((a, b) => b.migrationIndex - a.migrationIndex);
  const dominantDirection = activeStats.length > 0 ? activeStats[0] : null;
  const secondaryDirection =
    activeStats.length > 1 && activeStats[1].migrationIndex >= (dominantDirection?.migrationIndex || 0) * 0.7
      ? activeStats[1]
      : null;

  const populatedCells = gridCells
    .filter((c) => c.count > 0)
    .sort((a, b) => b.avgVal * (1 + b.exceedanceRate / 100) - a.avgVal * (1 + a.exceedanceRate / 100));
  const highestContaminatedCell = populatedCells.length > 0 ? populatedCells[0] : null;

  const spreadInfo = classifyHotspotSpreadPattern(samplingLocations, activeParam, b1, b2);

  let verdict = "";
  if (!dominantDirection || dominantDirection.totalCount === 0) {
    verdict = `No monitoring wells located within the ${R.toFixed(1)} km circular buffer or the ${cellKm.toFixed(1)} km grid cells.`;
  } else {
    verdict =
      `Spread Pattern: ${spreadInfo.spreadPattern} (${spreadInfo.spreadDirectionLabel}). ` +
      spreadInfo.spreadRationale +
      (highestContaminatedCell
        ? ` Peak cell "${highestContaminatedCell.label}" (${highestContaminatedCell.distFromHS.toFixed(1)} km) averages ${highestContaminatedCell.avgVal.toFixed(2)} ${unit}.`
        : "");
  }

  return {
    hotspot,
    radiusKm: R,
    gridCellSizeKm: cellKm,
    gridRows: 4,
    gridCols: 4,
    totalWellsInEnvelope: samplingLocations.length,
    innerWellsCount,
    outerWellsCount,
    gridCells,
    highestContaminatedCell,
    samplingLocations,
    directionalStats,
    dominantDirection,
    secondaryDirection,
    overallAvg,
    overallMax,
    baselineLimit: b1,
    unit,
    verdict,
    squareBBox
  };
}

/**
 * Computes advanced distance-decay regression, attenuation %, contamination footprint,
 * off-center secondary peak detection, Localised/Unidirectional/Multi-Directional spread classification,
 * and severity classification for a Hot Spot.
 */
export function computeDistanceDecayStats(
  hsVal: number | undefined,
  samplingLocations: any[],
  paramKey: string,
  limitOverride?: { b1: number; b2: number }
): HotspotDecayStats {
  const cfg = limitOverride || SECTOR_PARAM_CONFIG[paramKey] || { b1: 45, b2: 100 };
  const b1 = cfg.b1;
  const b2 = cfg.b2;
  const validHs = hsVal !== undefined && !isNaN(hsVal) ? hsVal : NaN;
  const hsExceedsLimit = !isNaN(validHs) && isValueExceedingLimit(validHs, paramKey, b1, b1);

  let sum = 0;
  let validCount = 0;
  let minVal = Infinity;
  let maxVal = -Infinity;
  let exceedCount = 0;
  let footprintKm = 0;
  let maxSampleDistKm = 0;
  let secondaryPeakSample: HotspotDecayStats["secondaryPeakSample"] = null;

  const regressionPairs: { x: number; y: number }[] = [];
  if (!isNaN(validHs)) {
    regressionPairs.push({ x: 0, y: validHs });
  }

  for (let i = 0; i < samplingLocations.length; i++) {
    const pt = samplingLocations[i];
    const dist = typeof pt._dist === "number" && !isNaN(pt._dist) ? pt._dist : 0;
    if (dist > maxSampleDistKm) maxSampleDistKm = dist;

    const v = typeof pt._val === "number" && !isNaN(pt._val) ? pt._val : NaN;
    if (!isNaN(v)) {
      sum += v;
      validCount++;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
      regressionPairs.push({ x: dist, y: v });

      if (isValueExceedingLimit(v, paramKey, b1, b2)) {
        exceedCount++;
        if (dist > footprintKm) footprintKm = dist;
      }

      if (!isNaN(validHs) && v > validHs && (!secondaryPeakSample || v > secondaryPeakSample.val)) {
        const raw = pt._raw || pt;
        secondaryPeakSample = {
          location: String(raw.Location || raw.Village || pt._identificationNo || `Grid Sample ${i + 1}`),
          identificationNo: String(pt._identificationNo || raw.IdentificationNo || raw["Identification No."] || ""),
          val: v,
          distKm: dist,
          bearing: typeof pt._bearing === "number" ? pt._bearing : 0
        };
      }
    }
  }

  const meanGridVal = validCount > 0 ? sum / validCount : NaN;
  const exceedGridPct = validCount > 0 ? (exceedCount / validCount) * 100 : 0;
  const attenuationPct =
    !isNaN(validHs) && validHs > 0 && !isNaN(meanGridVal)
      ? ((validHs - meanGridVal) / validHs) * 100
      : null;

  // Ordinary Least Squares slope & Pearson r (distance km vs concentration)
  let decaySlopePerKm: number | null = null;
  let pearsonR: number | null = null;
  if (regressionPairs.length >= 2) {
    const n = regressionPairs.length;
    let sumX = 0;
    let sumY = 0;
    for (const p of regressionPairs) {
      sumX += p.x;
      sumY += p.y;
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    let num = 0;
    let denX = 0;
    let denY = 0;
    for (const p of regressionPairs) {
      const dx = p.x - meanX;
      const dy = p.y - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    if (denX > 1e-9) {
      decaySlopePerKm = num / denX;
      if (denY > 1e-9) {
        pearsonR = num / Math.sqrt(denX * denY);
      }
    }
  }

  // Classify hydrogeological plume behavior
  let classification: HotspotPlumeClassification = "Within Limit";
  if (validCount === 0) {
    classification = "No Surrounding Data";
  } else if (secondaryPeakSample && isValueExceedingLimit(secondaryPeakSample.val, paramKey, b1, b1)) {
    classification = "Secondary Off-Center Peak";
  } else if (exceedGridPct >= 50 || (exceedCount >= 2 && footprintKm >= 2.0)) {
    classification = "Expanding Plume";
  } else if (hsExceedsLimit || exceedCount > 0) {
    classification = "Localized Point Source";
  } else {
    classification = "Within Limit";
  }

  // Spread Pattern: Localised | Unidirectional | Multi-Directional
  const spread = classifyHotspotSpreadPattern(samplingLocations, paramKey, b1, b2);

  // Quantitative Severity Score (normalized against BIS limit b1)
  const peakObserved = Math.max(!isNaN(validHs) ? validHs : 0, maxVal !== -Infinity ? maxVal : 0);
  const ratioToLimit = b1 > 0 ? peakObserved / b1 : 0;
  const severityScore = Number((ratioToLimit * (1 + exceedGridPct / 100)).toFixed(2));

  let severity: HotspotSeverityClass = "Low";
  if (peakObserved > b2 * 1.5 || (peakObserved > b2 && exceedGridPct >= 50)) {
    severity = "Critical";
  } else if (peakObserved > b2 || exceedGridPct >= 50) {
    severity = "High";
  } else if (peakObserved > b1 || exceedCount > 0) {
    severity = "Moderate";
  }

  return {
    hsVal: validHs,
    meanGridVal,
    minGridVal: minVal !== Infinity ? minVal : NaN,
    maxGridVal: maxVal !== -Infinity ? maxVal : NaN,
    validGridCount: validCount,
    exceedGridCount: exceedCount,
    exceedGridPct,
    hsExceedsLimit,
    attenuationPct,
    decaySlopePerKm,
    pearsonR,
    footprintKm,
    maxSampleDistKm,
    secondaryPeakSample,
    classification,
    spreadPattern: spread.spreadPattern,
    spreadDirectionLabel: spread.spreadDirectionLabel,
    activeExceedDirections: spread.activeExceedDirections,
    angularSpanDeg: spread.angularSpanDeg,
    spreadRationale: spread.spreadRationale,
    severity,
    severityScore
  };
}

/**
 * Runs simultaneous batch plume + spread-pattern (Localised / Unidirectional / Multi-Directional)
 * + distance-decay + parameter-wise & state-wise analytics across all Hot Spot groups.
 * Default geometry: 5 km circular buffer & 2 x 2 km 4x4 grid.
 */
export function computeBatchHotspotAnalytics(
  groups: HotspotGroup[],
  fallbackParamKey: string,
  paramList: HotspotSheetParamInfo[],
  options: {
    selectedGroupId?: string | null;
    autoFitPerSpot?: boolean;
    uniformRadiusKm?: number;
    uniformGridKm?: number;
    focusedRadiusKm?: number;
    focusedGridKm?: number;
    useSheetGridOnly?: boolean;
    extraMainPoints?: any[];
    resolution?: 8 | 4;
    /** When true (default), each group uses its own primaryParam when present (multi-parameter sheet mode) */
    useGroupPrimaryParam?: boolean;
  } = {}
): HotspotBatchAnalyticsResult {
  const defaultCfg = SECTOR_PARAM_CONFIG[fallbackParamKey] || { b1: 45, b2: 100, unit: "mg/L" };
  // Default to uniform 5 km radius & 2x2 km grid per user specification
  const autoFit = options.autoFitPerSpot === true;
  const useGridOnly = options.useSheetGridOnly !== false;
  const useGroupParam = options.useGroupPrimaryParam !== false;
  const extraPoints = options.extraMainPoints || [];
  const resolution = options.resolution || 8;

  const items: HotspotGroupBatchAnalytics[] = groups.map((grp) => {
    const grpParamKey = useGroupParam && grp.primaryParam ? grp.primaryParam : fallbackParamKey;
    const paramInfo = paramList.find((p) => p.paramKey === grpParamKey || p.colName === grpParamKey);
    const baseCfg = SECTOR_PARAM_CONFIG[grpParamKey] || { b1: 45, b2: 100, unit: "mg/L" };
    const b1 = paramInfo ? paramInfo.b1 : baseCfg.b1;
    const b2 = paramInfo ? paramInfo.b2 : baseCfg.b2;
    const unit = grp.paramUnit || paramInfo?.unit || baseCfg.unit;

    const { points: groupGridPoints, maxDistKm, hsVal } = buildHotspotGroupPlumePoints(
      grp,
      grpParamKey,
      paramInfo?.colName
    );
    const isFocused = grp.id === options.selectedGroupId;

    const autoRadius = Math.min(25, Math.max(5, Math.ceil((maxDistKm + 0.5) * 2) / 2));
    const autoGrid = Math.min(8, Math.max(2, Math.ceil((Math.max(maxDistKm, 2.0) / 2) * 2) / 2));

    let rKm = options.uniformRadiusKm ?? 5.0;
    let gKm = options.uniformGridKm ?? 2.0;
    if (autoFit) {
      rKm = isFocused && options.focusedRadiusKm !== undefined ? options.focusedRadiusKm : autoRadius;
      gKm = isFocused && options.focusedGridKm !== undefined ? options.focusedGridKm : autoGrid;
    }

    const point: HotspotPoint = {
      lng: grp.identifiedHotspot.lon,
      lat: grp.identifiedHotspot.lat,
      val: !isNaN(hsVal) ? hsVal : undefined,
      locationName: grp.location,
      sampleId: grp.identificationNo || `Hot Spot #${grp.hotspotNo}`,
      hotspotNo: grp.hotspotNo,
      state: grp.state,
      district: grp.district,
      block: grp.block,
      source: grp.source,
      paramKey: grpParamKey,
      paramUnit: unit
    };

    const sourcePoints = useGridOnly ? groupGridPoints : [...groupGridPoints, ...extraPoints];
    const result = calculateHotspotPlumeData(point, rKm, sourcePoints, grpParamKey, resolution, gKm, {
      b1,
      b2,
      unit
    });
    const decay = computeDistanceDecayStats(point.val, result.samplingLocations, grpParamKey, { b1, b2 });

    return {
      group: grp,
      point,
      paramKey: grpParamKey,
      paramUnit: unit,
      b1,
      b2,
      result,
      decay,
      radiusKm: rKm,
      gridCellSizeKm: gKm
    };
  });

  // Aggregate State-Wise Summary, Parameter-Wise Summary & Global KPIs
  const stateMap = new Map<
    string,
    {
      hotspotCount: number;
      totalGridSamples: number;
      hsExceedCount: number;
      gridExceedCount: number;
      hsSum: number;
      hsValid: number;
      maxHsVal: number;
      maxGridVal: number;
      maxFootprintKm: number;
      criticalCount: number;
      secondaryPeakCount: number;
      localisedCount: number;
      unidirectionalCount: number;
      multiDirectionalCount: number;
      params: Set<string>;
    }
  >();

  const paramAggMap = new Map<
    string,
    {
      paramKey: string;
      unit: string;
      b1: number;
      b2: number;
      hotspotCount: number;
      totalGridSamples: number;
      hsExceedCount: number;
      gridExceedCount: number;
      hsSum: number;
      hsValid: number;
      maxHsVal: number;
      maxGridVal: number;
      maxFootprintKm: number;
      criticalCount: number;
      localisedCount: number;
      unidirectionalCount: number;
      multiDirectionalCount: number;
      states: Set<string>;
    }
  >();

  let totalGridSamples = 0;
  let hsExceedCount = 0;
  let gridExceedCount = 0;
  let criticalCount = 0;
  let highCount = 0;
  let secondaryPeakCount = 0;
  let expandingCount = 0;
  let localisedCount = 0;
  let unidirectionalCount = 0;
  let multiDirectionalCount = 0;
  let hsSumAll = 0;
  let hsValidAll = 0;
  let gridSumAll = 0;
  let gridValidAll = 0;
  let maxFootprintKm = 0;
  let peakHotspot: HotspotBatchAnalyticsResult["globalStats"]["peakHotspot"] = null;
  let peakGridSample: HotspotBatchAnalyticsResult["globalStats"]["peakGridSample"] = null;

  for (const item of items) {
    const st = item.group.state || "Unspecified";
    const sEntry = stateMap.get(st) || {
      hotspotCount: 0,
      totalGridSamples: 0,
      hsExceedCount: 0,
      gridExceedCount: 0,
      hsSum: 0,
      hsValid: 0,
      maxHsVal: -Infinity,
      maxGridVal: -Infinity,
      maxFootprintKm: 0,
      criticalCount: 0,
      secondaryPeakCount: 0,
      localisedCount: 0,
      unidirectionalCount: 0,
      multiDirectionalCount: 0,
      params: new Set<string>()
    };

    const pEntry = paramAggMap.get(item.paramKey) || {
      paramKey: item.paramKey,
      unit: item.paramUnit,
      b1: item.b1,
      b2: item.b2,
      hotspotCount: 0,
      totalGridSamples: 0,
      hsExceedCount: 0,
      gridExceedCount: 0,
      hsSum: 0,
      hsValid: 0,
      maxHsVal: -Infinity,
      maxGridVal: -Infinity,
      maxFootprintKm: 0,
      criticalCount: 0,
      localisedCount: 0,
      unidirectionalCount: 0,
      multiDirectionalCount: 0,
      states: new Set<string>()
    };

    sEntry.hotspotCount++;
    sEntry.totalGridSamples += item.result.totalWellsInEnvelope;
    sEntry.params.add(item.paramKey);

    pEntry.hotspotCount++;
    pEntry.totalGridSamples += item.result.totalWellsInEnvelope;
    pEntry.states.add(st);

    totalGridSamples += item.result.totalWellsInEnvelope;

    if (item.decay.hsExceedsLimit) {
      sEntry.hsExceedCount++;
      pEntry.hsExceedCount++;
      hsExceedCount++;
    }
    sEntry.gridExceedCount += item.decay.exceedGridCount;
    pEntry.gridExceedCount += item.decay.exceedGridCount;
    gridExceedCount += item.decay.exceedGridCount;

    if (item.decay.spreadPattern === "Localised") {
      sEntry.localisedCount++;
      pEntry.localisedCount++;
      localisedCount++;
    } else if (item.decay.spreadPattern === "Unidirectional") {
      sEntry.unidirectionalCount++;
      pEntry.unidirectionalCount++;
      unidirectionalCount++;
    } else {
      sEntry.multiDirectionalCount++;
      pEntry.multiDirectionalCount++;
      multiDirectionalCount++;
    }

    if (!isNaN(item.decay.hsVal)) {
      sEntry.hsSum += item.decay.hsVal;
      sEntry.hsValid++;
      pEntry.hsSum += item.decay.hsVal;
      pEntry.hsValid++;
      hsSumAll += item.decay.hsVal;
      hsValidAll++;
      if (item.decay.hsVal > sEntry.maxHsVal) sEntry.maxHsVal = item.decay.hsVal;
      if (item.decay.hsVal > pEntry.maxHsVal) pEntry.maxHsVal = item.decay.hsVal;
      if (!peakHotspot || item.decay.hsVal > peakHotspot.val) {
        peakHotspot = {
          hotspotNo: item.group.hotspotNo,
          location: item.group.location,
          state: st,
          val: item.decay.hsVal,
          paramKey: item.paramKey,
          unit: item.paramUnit
        };
      }
    }

    if (!isNaN(item.decay.maxGridVal)) {
      if (item.decay.maxGridVal > sEntry.maxGridVal) sEntry.maxGridVal = item.decay.maxGridVal;
      if (item.decay.maxGridVal > pEntry.maxGridVal) pEntry.maxGridVal = item.decay.maxGridVal;
      if (!peakGridSample || item.decay.maxGridVal > peakGridSample.val) {
        const bestPt = item.result.samplingLocations.reduce(
          (best, cur) => (!isNaN(cur._val) && (!best || cur._val > best._val) ? cur : best),
          null as any
        );
        const raw = bestPt?._raw || bestPt || {};
        peakGridSample = {
          hotspotNo: item.group.hotspotNo,
          location: String(raw.Location || raw.Village || item.group.location),
          val: item.decay.maxGridVal,
          paramKey: item.paramKey,
          unit: item.paramUnit
        };
      }
    }

    if (!isNaN(item.decay.meanGridVal) && item.decay.validGridCount > 0) {
      gridSumAll += item.decay.meanGridVal * item.decay.validGridCount;
      gridValidAll += item.decay.validGridCount;
    }

    if (item.decay.footprintKm > sEntry.maxFootprintKm) sEntry.maxFootprintKm = item.decay.footprintKm;
    if (item.decay.footprintKm > pEntry.maxFootprintKm) pEntry.maxFootprintKm = item.decay.footprintKm;
    if (item.decay.footprintKm > maxFootprintKm) maxFootprintKm = item.decay.footprintKm;

    if (item.decay.severity === "Critical") {
      sEntry.criticalCount++;
      pEntry.criticalCount++;
      criticalCount++;
    } else if (item.decay.severity === "High") {
      highCount++;
    }
    if (item.decay.classification === "Secondary Off-Center Peak") {
      sEntry.secondaryPeakCount++;
      secondaryPeakCount++;
    } else if (item.decay.classification === "Expanding Plume") {
      expandingCount++;
    }

    stateMap.set(st, sEntry);
    paramAggMap.set(item.paramKey, pEntry);
  }

  const stateSummaries: HotspotStateSummary[] = Array.from(stateMap.entries())
    .map(([state, e]) => ({
      state,
      hotspotCount: e.hotspotCount,
      totalGridSamples: e.totalGridSamples,
      hsExceedCount: e.hsExceedCount,
      gridExceedCount: e.gridExceedCount,
      gridExceedPct: e.totalGridSamples > 0 ? (e.gridExceedCount / e.totalGridSamples) * 100 : 0,
      meanHsVal: e.hsValid > 0 ? e.hsSum / e.hsValid : NaN,
      maxHsVal: e.maxHsVal !== -Infinity ? e.maxHsVal : NaN,
      maxGridVal: e.maxGridVal !== -Infinity ? e.maxGridVal : NaN,
      maxFootprintKm: e.maxFootprintKm,
      criticalCount: e.criticalCount,
      secondaryPeakCount: e.secondaryPeakCount,
      localisedCount: e.localisedCount,
      unidirectionalCount: e.unidirectionalCount,
      multiDirectionalCount: e.multiDirectionalCount,
      parametersAffected: Array.from(e.params).sort()
    }))
    .sort((a, b) => b.hotspotCount - a.hotspotCount || a.state.localeCompare(b.state));

  const paramSummaries: HotspotParamSummary[] = Array.from(paramAggMap.values())
    .map((e) => ({
      paramKey: e.paramKey,
      unit: e.unit,
      b1: e.b1,
      b2: e.b2,
      color: getHotspotParamColor(e.paramKey).primary,
      hotspotCount: e.hotspotCount,
      totalGridSamples: e.totalGridSamples,
      hsExceedCount: e.hsExceedCount,
      gridExceedCount: e.gridExceedCount,
      gridExceedPct: e.totalGridSamples > 0 ? (e.gridExceedCount / e.totalGridSamples) * 100 : 0,
      meanHsVal: e.hsValid > 0 ? e.hsSum / e.hsValid : NaN,
      maxHsVal: e.maxHsVal !== -Infinity ? e.maxHsVal : NaN,
      maxGridVal: e.maxGridVal !== -Infinity ? e.maxGridVal : NaN,
      maxFootprintKm: e.maxFootprintKm,
      criticalCount: e.criticalCount,
      localisedCount: e.localisedCount,
      unidirectionalCount: e.unidirectionalCount,
      multiDirectionalCount: e.multiDirectionalCount,
      statesAffected: Array.from(e.states).sort()
    }))
    .sort((a, b) => b.hotspotCount - a.hotspotCount || a.paramKey.localeCompare(b.paramKey));

  const effectiveUnit = paramSummaries.length === 1 ? paramSummaries[0].unit : defaultCfg.unit;
  const effectiveB1 = paramSummaries.length === 1 ? paramSummaries[0].b1 : defaultCfg.b1;
  const effectiveB2 = paramSummaries.length === 1 ? paramSummaries[0].b2 : defaultCfg.b2;

  return {
    items,
    stateSummaries,
    paramSummaries,
    globalStats: {
      totalHotspots: items.length,
      totalGridSamples,
      hsExceedCount,
      gridExceedCount,
      gridExceedPct: gridValidAll > 0 ? (gridExceedCount / gridValidAll) * 100 : 0,
      criticalCount,
      highCount,
      secondaryPeakCount,
      expandingCount,
      localisedCount,
      unidirectionalCount,
      multiDirectionalCount,
      meanHsVal: hsValidAll > 0 ? hsSumAll / hsValidAll : NaN,
      meanGridVal: gridValidAll > 0 ? gridSumAll / gridValidAll : NaN,
      maxFootprintKm,
      peakHotspot,
      peakGridSample,
      unit: effectiveUnit,
      b1: effectiveB1,
      b2: effectiveB2
    }
  };
}

/**
 * Exports all plotted Hot Spots, surrounding Grid Samples, buffer zones, 4x4 grids,
 * and dominant plume vectors as a GeoJSON FeatureCollection for QGIS / ArcGIS.
 */
export function buildHotspotsGeoJson(
  items: { point: HotspotPoint; result: HotspotPlumeResult; decay?: HotspotDecayStats; paramKey?: string }[],
  fallbackParamKey: string
) {
  const features: any[] = [];

  items.forEach(({ point, result, decay, paramKey }) => {
    const pKey = paramKey || point.paramKey || fallbackParamKey;
    const pColor = getHotspotParamColor(pKey).primary;
    const hsLabel = point.hotspotNo ? `HS #${point.hotspotNo} - ${point.locationName || ""}` : point.locationName || "Hot Spot";

    // 1. Identified Hot Spot center point
    features.push(
      turf.point([point.lng, point.lat], {
        featureType: "Identified_Hot_Spot",
        hotspotNo: point.hotspotNo || "",
        identificationNo: point.sampleId || "",
        location: point.locationName || "",
        state: point.state || "",
        district: point.district || "",
        block: point.block || "",
        source: point.source || "",
        parameter: pKey,
        parameterColor: pColor,
        value: point.val ?? null,
        unit: result.unit,
        radiusKm: result.radiusKm,
        gridCellSizeKm: result.gridCellSizeKm,
        dominantDirection: result.dominantDirection?.direction || "",
        dominantBearing: result.dominantDirection?.midBearing ?? null,
        spreadPattern: decay?.spreadPattern || "",
        spreadDirectionLabel: decay?.spreadDirectionLabel || "",
        angularSpanDeg: decay?.angularSpanDeg ?? null,
        plumeClassification: decay?.classification || "",
        severity: decay?.severity || ""
      })
    );

    // 2. Circular Buffer polygon
    features.push(
      turf.circle([point.lng, point.lat], result.radiusKm, {
        steps: 48,
        units: "kilometers",
        properties: {
          featureType: "Buffer_Zone",
          hotspotNo: point.hotspotNo || "",
          parameter: pKey,
          parameterColor: pColor,
          label: hsLabel,
          radiusKm: result.radiusKm
        }
      })
    );

    // 3. 4x4 Grid Cells
    result.gridCells.forEach((cell) => {
      features.push({
        type: "Feature",
        geometry: cell.poly.geometry,
        properties: {
          featureType: "Grid_Cell_4x4",
          hotspotNo: point.hotspotNo || "",
          parameter: pKey,
          hotspotLocation: point.locationName || "",
          cellId: cell.id,
          cellLabel: cell.label,
          sampleCount: cell.count,
          meanVal: cell.count > 0 ? Number(cell.avgVal.toFixed(2)) : null,
          exceedancePct: Number(cell.exceedanceRate.toFixed(1)),
          riskLevel: cell.riskLevel
        }
      });
    });

    // 4. Surrounding Grid Samples
    result.samplingLocations.forEach((pt, idx) => {
      const raw = pt._raw || pt;
      features.push(
        turf.point([pt._lon, pt._lat], {
          featureType: pt._isGridSample ? "Grid_Sample" : "Monitoring_Well",
          hotspotNo: point.hotspotNo || "",
          hotspotLocation: point.locationName || "",
          identificationNo: pt._identificationNo || raw.IdentificationNo || raw["Identification No."] || "",
          location: raw.Location || raw.Village || `Sample ${idx + 1}`,
          source: pt._source || raw.Source || "",
          parameter: pKey,
          parameterColor: pColor,
          value: !isNaN(pt._val) ? pt._val : null,
          unit: result.unit,
          distanceKm: Number(pt._dist.toFixed(3)),
          bearingDeg: Math.round(pt._bearing)
        })
      );
    });

    // 5. Dominant Plume Spread Vector
    if (result.dominantDirection && result.dominantDirection.totalCount > 0) {
      const dom = result.dominantDirection;
      const tip = fastDestination(point.lng, point.lat, result.radiusKm * 0.88, dom.midBearing);
      features.push(
        turf.lineString(
          [
            [point.lng, point.lat],
            [tip[0], tip[1]]
          ],
          {
            featureType: "Plume_Spread_Vector",
            hotspotNo: point.hotspotNo || "",
            parameter: pKey,
            hotspotLocation: point.locationName || "",
            spreadPattern: decay?.spreadPattern || "",
            direction: dom.direction,
            bearingDeg: dom.midBearing,
            riskLevel: dom.riskLevel,
            meanVal: Number(dom.avgVal.toFixed(2))
          }
        )
      );
    }
  });

  return {
    type: "FeatureCollection",
    features
  };
}
