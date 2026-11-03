import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import L from "leaflet";
import * as turf from "@turf/turf";
import * as XLSX from "xlsx";
import { ensureSheetJSNumbers } from "../utils/excelFormatter";
import shp from "shpjs";
import JSZip from "jszip";
import {
  Layers,
  FileSpreadsheet,
  MapPin,
  Navigation,
  MousePointer2,
  Plus,
  Trash2,
  Palette,
  Eye,
  EyeOff,
  Scissors,
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Sliders,
  Crosshair,
  FileText,
  PieChart,
  RefreshCw,
  Compass,
  Map as MapIcon,
  Filter,
  Zap,
  Loader2,
  Target,
  Radio,
  ArrowUpRight,
  MoveRight,
  Flame,
  ShieldAlert,
  Sparkles,
  Grid
} from "lucide-react";
import { DataHeaders, ShapefileLayer } from "../types";
import { PARAM_CONFIG as APP_PARAM_CONFIG } from "../data/config";

// Configuration for chemical parameters with standard BIS limits and units
export const SECTOR_PARAM_CONFIG: Record<
  string,
  { b1: number; b2: number; unit: string; name: string; keywords: string[] }
> = {
  pH: { b1: 6.5, b2: 8.5, unit: "", name: "pH Level", keywords: ["ph", "ph level", "hydrogen"] },
  TDS: { b1: 500, b2: 2000, unit: "mg/L", name: "Total Dissolved Solids", keywords: ["tds", "total dissolved solids"] },
  Turbidity: { b1: 1, b2: 5, unit: "NTU", name: "Turbidity", keywords: ["turbidity"] },
  Alkalinity: { b1: 200, b2: 600, unit: "mg/L", name: "Total Alkalinity", keywords: ["alkalinity", "total alkalinity"] },
  TH: { b1: 200, b2: 600, unit: "mg/L as CaCO3", name: "Total Hardness", keywords: ["th", "total hardness", "hardness"] },
  EC: { b1: 750, b2: 3000, unit: "µS/cm at 25°C", name: "Electrical Conductivity", keywords: ["ec", "cond", "conductivity", "electrical conductivity"] },
  Cl: { b1: 250, b2: 1000, unit: "mg/L", name: "Chloride", keywords: ["cl", "chloride"] },
  NO3: { b1: 45, b2: 45, unit: "mg/L", name: "Nitrate", keywords: ["no3", "nitrate"] },
  F: { b1: 1.0, b2: 1.5, unit: "mg/L", name: "Fluoride", keywords: ["f", "fluoride"] },
  Fe: { b1: 1.0, b2: 1.0, unit: "mg/L", name: "Iron", keywords: ["fe", "iron", "total iron"] },
  As: { b1: 10, b2: 10, unit: "ppb", name: "Arsenic", keywords: ["as", "arsenic"] },
  U: { b1: 30, b2: 30, unit: "ppb", name: "Uranium", keywords: ["u", "uranium"] },
  Zn: { b1: 5, b2: 15, unit: "mg/L", name: "Zinc", keywords: ["zn", "zinc"] },
  Cu: { b1: 0.05, b2: 1.5, unit: "mg/L", name: "Copper", keywords: ["cu", "copper"] },
  Pb: { b1: 0.01, b2: 0.01, unit: "mg/L", name: "Lead", keywords: ["pb", "lead"] },
  Cd: { b1: 0.003, b2: 0.003, unit: "mg/L", name: "Cadmium", keywords: ["cd", "cadmium"] },
  Cr: { b1: 0.05, b2: 0.05, unit: "mg/L", name: "Chromium", keywords: ["cr", "chromium"] },
  Hg: { b1: 0.001, b2: 0.001, unit: "mg/L", name: "Mercury", keywords: ["hg", "mercury"] },
  Ni: { b1: 0.02, b2: 0.02, unit: "mg/L", name: "Nickel", keywords: ["ni", "nickel"] },
  Se: { b1: 0.01, b2: 0.01, unit: "mg/L", name: "Selenium", keywords: ["se", "selenium"] },
  Ca: { b1: 75, b2: 200, unit: "mg/L", name: "Calcium", keywords: ["ca", "calcium"] },
  Mg: { b1: 30, b2: 100, unit: "mg/L", name: "Magnesium", keywords: ["mg", "magnesium"] },
  SO4: { b1: 200, b2: 400, unit: "mg/L", name: "Sulphate", keywords: ["so4", "sulphate", "sulfate"] },
  Mn: { b1: 0.1, b2: 0.3, unit: "mg/L", name: "Manganese", keywords: ["mn", "manganese"] },
  Al: { b1: 0.03, b2: 0.2, unit: "mg/L", name: "Alluminium", keywords: ["al", "alluminium"] },
  Ba: { b1: 0.7, b2: 0.7, unit: "mg/L", name: "Barium", keywords: ["ba", "barium"] },
  B: { b1: 0.5, b2: 2.4, unit: "mg/L", name: "Boran", keywords: ["b", "boran"] },
};

// Cascading filter normalization helpers matching App.tsx
const normFilterVal = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const isStateAllFilter = (s: string) => !s || s.toLowerCase() === "all" || s.toLowerCase() === "all states" || s.toLowerCase() === "select state";
const isDistrictAllFilter = (d: string) => !d || d.toLowerCase() === "all" || d.toLowerCase() === "all districts" || d.toLowerCase() === "select district";
const isYearAllFilter = (y: string) => !y || y.toLowerCase() === "all" || y.toLowerCase() === "select year";
const isSeasonAllFilter = (s: string) => !s || s.toLowerCase() === "all" || s.toLowerCase() === "select season";

/**
 * Robust coordinate parsing supporting decimal numbers, string floats, European comma decimals, and DMS
 */
export function parseCoord(val: any): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") return isFinite(val) ? val : NaN;
  const str = String(val).trim();
  if (!str) return NaN;

  // Replace comma decimal separators: "26,9124" -> "26.9124"
  const cleanStr = str.replace(/,/g, ".").trim();
  const directNum = parseFloat(cleanStr);
  if (!isNaN(directNum) && isFinite(directNum) && /^[-+]?\d+(\.\d+)?$/.test(cleanStr)) {
    return directNum;
  }

  // Handle DMS notation: e.g. 26° 54' 30.5" N or 26 54 30 N or 26.9124 N
  const dmsMatch = cleanStr.match(/(\d+(?:\.\d+)?)\s*°?\s*(\d+(?:\.\d+)?)?'?\s*(\d+(?:\.\d+)?)?"?\s*([NSEWnsew])?/);
  if (dmsMatch) {
    const deg = parseFloat(dmsMatch[1]) || 0;
    const min = parseFloat(dmsMatch[2]) || 0;
    const sec = parseFloat(dmsMatch[3]) || 0;
    const dir = dmsMatch[4] ? dmsMatch[4].toUpperCase() : "";
    let dd = deg + min / 60 + sec / 3600;
    if (dir === "S" || dir === "W") dd = -dd;
    if (isFinite(dd) && dd !== 0) return dd;
  }

  // Fallback regex match for any floating number inside string
  const match = cleanStr.match(/[-+]?\d*\.?\d+/);
  if (match) {
    const n = parseFloat(match[0]);
    if (isFinite(n)) {
      if (/[SWsw]/.test(cleanStr) && n > 0) return -n;
      return n;
    }
  }
  return NaN;
}

/**
 * Robust water quality parameter parsing handling <0.01, BDL, ND, Nil, and units
 */
export function parseWaterValue(val: any): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") return isFinite(val) ? val : NaN;
  const str = String(val).trim();
  if (!str) return NaN;
  const lower = str.toLowerCase();
  if (
    lower === "bdl" ||
    lower === "nil" ||
    lower === "nd" ||
    lower === "absent" ||
    lower === "trace" ||
    lower === "nill"
  ) {
    return 0;
  }
  if (lower.startsWith("<")) {
    const num = parseFloat(str.replace(/<|\s/g, "").replace(/,/g, "."));
    return isFinite(num) ? num / 2 : 0;
  }
  if (lower.startsWith(">")) {
    const num = parseFloat(str.replace(/>|\s/g, "").replace(/,/g, "."));
    return isFinite(num) ? num : NaN;
  }
  const clean = str.replace(/,/g, ".");
  const m = clean.match(/[-+]?\d*\.?\d+/);
  if (m) {
    const n = parseFloat(m[0]);
    return isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * Score-based coordinate column detector that inspects both column names and sample row contents
 */
export function findCoordinateColumns(columns: string[], sampleRows: any[] = []): { lat: string; lon: string } {
  if (!columns || columns.length === 0) return { lat: "", lon: "" };

  const sample = sampleRows.slice(0, 50);

  let bestLat = "";
  let bestLatScore = -1;
  let bestLon = "";
  let bestLonScore = -1;

  for (const col of columns) {
    const colLower = col.toLowerCase().trim();

    // Skip non-coordinate metadata columns unless they explicitly mention lat/lon
    if (
      /name|id|code|date|time|remark|comment|site|state|district|block|village|source|type|depth/i.test(colLower) &&
      !/lat|lon|coord|gps/i.test(colLower)
    ) {
      continue;
    }

    let latNameScore = 0;
    let lonNameScore = 0;

    if (/^(lat|latitude|lat_dd|latitude_dd|latitude\(dd\)|lat\(dd\)|gps_lat|y|northing|y_coord|y_coordinate)$/i.test(colLower)) {
      latNameScore += 100;
    } else if (/\blat(itude)?\b/i.test(colLower) || colLower.startsWith("lat")) {
      latNameScore += 65;
    }

    if (/^(lon|long|longitude|lon_dd|long_dd|longitude_dd|longitude\(dd\)|long\(dd\)|gps_lon|gps_long|x|easting|x_coord|x_coordinate)$/i.test(colLower)) {
      lonNameScore += 100;
    } else if (/\blong?(itude)?\b/i.test(colLower) || colLower.startsWith("lon") || colLower.startsWith("lng")) {
      lonNameScore += 65;
    }

    // Inspect values if sample rows are available
    let validLatCount = 0;
    let validLonCount = 0;
    let validIndiaLatCount = 0;
    let validIndiaLonCount = 0;

    if (sample.length > 0) {
      for (const row of sample) {
        const p = parseCoord(row[col]);
        if (!isNaN(p)) {
          if (p >= -90 && p <= 90) validLatCount++;
          if (p >= 6 && p <= 38) validIndiaLatCount++; // typical India latitudes
          if (p >= -180 && p <= 180) validLonCount++;
          if (p >= 68 && p <= 98) validIndiaLonCount++; // typical India longitudes
        }
      }
    }

    const n = sample.length || 1;
    const latScore = latNameScore * 2 + (validLatCount / n) * 40 + (validIndiaLatCount / n) * 50;
    const lonScore = lonNameScore * 2 + (validLonCount / n) * 40 + (validIndiaLonCount / n) * 50;

    if (latScore > bestLatScore && latScore > 40) {
      bestLatScore = latScore;
      bestLat = col;
    }
    if (lonScore > bestLonScore && lonScore > 40) {
      bestLonScore = lonScore;
      bestLon = col;
    }
  }

  // Disambiguate if same column picked
  if (bestLat && bestLon && bestLat === bestLon) {
    if (bestLatScore >= bestLonScore) {
      bestLon = "";
    } else {
      bestLat = "";
    }
  }

  return { lat: bestLat, lon: bestLon };
}

/**
 * Intelligent parameter column matcher
 */
export function findParamColumn(
  paramKey: string,
  columns: string[],
  parentHeaderMap?: Record<string, string>
): string {
  if (!columns || columns.length === 0) return "";

  // 1. Check parent header map first if valid
  if (parentHeaderMap && parentHeaderMap[paramKey] && columns.includes(parentHeaderMap[paramKey])) {
    return parentHeaderMap[paramKey];
  }

  const config = SECTOR_PARAM_CONFIG[paramKey];
  const pLower = paramKey.toLowerCase().trim();

  // 2. Exact match
  const exact = columns.find((c) => c.toLowerCase().trim() === pLower);
  if (exact) return exact;

  // 3. Starts with param key + separator
  const startsWith = columns.find((c) => {
    const cl = c.toLowerCase().trim();
    return (
      cl.startsWith(pLower + " ") ||
      cl.startsWith(pLower + "_") ||
      cl.startsWith(pLower + "(") ||
      cl.startsWith(pLower + "/") ||
      cl.startsWith(pLower + "-")
    );
  });
  if (startsWith) return startsWith;

  // 4. Keyword matches
  if (config?.keywords) {
    for (const kw of config.keywords) {
      const kwLower = kw.toLowerCase().trim();
      const match = columns.find((c) => {
        const cl = c.toLowerCase().trim();
        if (cl === kwLower) return true;
        if (cl.startsWith(kwLower + " ") || cl.startsWith(kwLower + "_") || cl.startsWith(kwLower + "(")) return true;
        return cl.includes(kwLower);
      });
      if (match) return match;
    }
  }

  // 5. Whole word match
  const wordRegex = new RegExp(`(^|[^a-zA-Z0-9])${pLower}([^a-zA-Z0-9]|$)`, "i");
  const wordMatch = columns.find((c) => wordRegex.test(c));
  if (wordMatch) return wordMatch;

  return "";
}

function safeDifference(poly1: any, poly2: any): any {
  if (!poly1 || !poly2) return poly1 || null;
  try {
    try {
      const fc = turf.featureCollection([poly1, poly2]);
      const res = (turf as any).difference(fc);
      if (res) return res;
    } catch {
      // fallback
    }
    return (turf as any).difference(poly1, poly2);
  } catch (e) {
    console.warn("safeDifference error", e);
    return null;
  }
}

function safeIntersect(poly1: any, poly2: any): any {
  if (!poly1 || !poly2) return null;
  try {
    try {
      const fc = turf.featureCollection([poly1, poly2]);
      const res = (turf as any).intersect(fc);
      if (res) return res;
    } catch {
      // fallback
    }
    return (turf as any).intersect(poly1, poly2);
  } catch (e) {
    return null;
  }
}

function safeUnion(poly1: any, poly2: any): any {
  if (!poly1) return poly2 || null;
  if (!poly2) return poly1 || null;
  try {
    try {
      const fc = turf.featureCollection([poly1, poly2]);
      const res = (turf as any).union(fc);
      if (res) return res;
    } catch {
      // fallback
    }
    return (turf as any).union(poly1, poly2);
  } catch (e) {
    return poly1;
  }
}

/**
 * Ultra-fast direct polygon geometry generation for radial rings and annular sectors.
 * Avoids slow turf.difference and martinez-polygon-clipping, computing in < 0.05ms per sector.
 */
export function createAnnularSector(
  centerPt: any, // turf.point([lng, lat])
  innerRadiusKm: number,
  outerRadiusKm: number,
  startBearingDeg: number,
  endBearingDeg: number,
  numSteps: number = 24
): any {
  try {
    if (!centerPt || !centerPt.geometry || !Array.isArray(centerPt.geometry.coordinates)) {
      return null;
    }
    const centerCoords = centerPt.geometry.coordinates as [number, number];
    if (isNaN(centerCoords[0]) || isNaN(centerCoords[1])) return null;

    const safeOuter = Number(outerRadiusKm);
    const safeInner = Math.max(0, Number(innerRadiusKm) || 0);

    if (isNaN(safeOuter) || safeOuter <= 0 || safeOuter <= safeInner) {
      return null;
    }

    // 1. Full 360-degree concentric ring
    if (endBearingDeg - startBearingDeg >= 360) {
      const outerCircle = turf.circle(centerPt, safeOuter, { units: "kilometers", steps: 48 });
      if (safeInner <= 0) {
        return outerCircle;
      }
      const innerCircle = turf.circle(centerPt, safeInner, { units: "kilometers", steps: 48 });
      // In GeoJSON standard: Polygon coordinates[0] is exterior ring, coordinates[1] is interior ring (hole)
      const outerRing = outerCircle.geometry.coordinates[0];
      const innerRing = [...innerCircle.geometry.coordinates[0]].reverse();
      return turf.polygon([outerRing, innerRing]);
    }

    // 2. Annular sector (wedge or donut slice)
    const angleSpan = endBearingDeg - startBearingDeg;
    if (angleSpan <= 0) return null;
    const steps = Math.max(4, Math.round((angleSpan / 360) * numSteps));

    const outerArc: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const b = startBearingDeg + (i / steps) * angleSpan;
      const pt = turf.destination(centerPt, safeOuter, b, { units: "kilometers" });
      outerArc.push(pt.geometry.coordinates as [number, number]);
    }

    if (safeInner > 0) {
      const innerArc: [number, number][] = [];
      for (let i = steps; i >= 0; i--) {
        const b = startBearingDeg + (i / steps) * angleSpan;
        const pt = turf.destination(centerPt, safeInner, b, { units: "kilometers" });
        innerArc.push(pt.geometry.coordinates as [number, number]);
      }
      return turf.polygon([[...outerArc, ...innerArc, outerArc[0]]]);
    } else {
      // Pie slice to center
      return turf.polygon([[centerCoords, ...outerArc, centerCoords]]);
    }
  } catch (err) {
    console.warn("createAnnularSector error:", err);
    return null;
  }
}

export interface CustomTierRange {
  min: number;
  max: number;
  label: string;
  color: string;
  unit: string;
  visible?: boolean;
}

export interface BoundaryFeatureItem {
  poly: any;
  name: string;
  bbox: [number, number, number, number];
  isSelected: boolean;
  color: string;
}

export interface BoundaryLayerItem {
  id: string;
  name: string;
  geojson: any;
  bbox: [number, number, number, number];
  features: BoundaryFeatureItem[];
  isVisible: boolean;
  isFilter: boolean;
  color: string;
  isExpanded: boolean;
  mapLayer: L.GeoJSON | null;
}

export interface SectorAnalysisData {
  id: string;
  ring: string;
  angle: string;
  area: number;
  points: any[];
  avg: number;
  min: number;
  max: number;
  count: number;
  unit: string;
}

export interface DirectionalSpreadStats {
  direction: string; // "N", "NE", "E", "SE", "S", "SW", "W", "NW"
  label: string;
  bearingRange: [number, number];
  midBearing: number;
  innerCount: number; // wells inside 2 km ring
  outerCount: number; // wells between 2 km ring and outer square
  totalCount: number;
  avgVal: number;
  maxVal: number;
  minVal: number;
  exceedanceCount: number;
  exceedanceRate: number; // percentage (0-100%)
  migrationIndex: number;
  riskLevel: "CRITICAL" | "HIGH" | "MODERATE" | "SAFE" | "NO_DATA";
  color: string;
  innerPoints: any[];
  outerPoints: any[];
}

export interface HotspotGridCell {
  id: string; // e.g. "R0-C0"
  row: number; // 0 to 3
  col: number; // 0 to 3
  label: string; // e.g. "NW-Outer (R1,C1)"
  shortCode: string; // e.g. "NW1", "SE2"
  directionCode: string; // "NW", "NE", "SE", "SW"
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  poly: any; // Turf polygon
  points: any[]; // Sample wells inside this cell
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
  hotspot: {
    lng: number;
    lat: number;
    val?: number;
    locationName?: string;
    sampleId?: string;
  };
  radiusKm: number; // default 5.0 km (from reference diagram)
  gridCellSizeKm: number; // default 2.0 km (from reference diagram)
  gridRows: number; // 4
  gridCols: number; // 4
  totalWellsInEnvelope: number;
  innerWellsCount: number;
  outerWellsCount: number;
  gridCells: HotspotGridCell[]; // 16 cells (4x4)
  highestContaminatedCell: HotspotGridCell | null;
  samplingLocations: any[]; // All sample wells inside the 5km buffer
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

/**
 * Calculates 5 km Circular Buffer Zone with Superimposed 4x4 Grid of 2 km x 2 km Squares,
 * plotting Sampling Location Stars and estimating Directional Contamination Spread.
 */
export function calculateHotspotPlumeData(
  hotspot: { lng: number; lat: number; val?: number; locationName?: string; sampleId?: string },
  radiusKm: number = 5.0,
  points: any[],
  activeParam: string,
  resolution: 8 | 4 = 8,
  gridCellSizeKm: number = 2.0
): HotspotPlumeResult {
  const centerPt = turf.point([hotspot.lng, hotspot.lat]);
  const R = Math.max(0.5, radiusKm || 5.0);
  const cellKm = Math.max(0.2, gridCellSizeKm || 2.0);
  const paramConfig = SECTOR_PARAM_CONFIG[activeParam] || { b1: 500, b2: 2000, unit: "mg/L" };
  const b1 = paramConfig.b1;
  const b2 = paramConfig.b2;
  const unit = paramConfig.unit;

  // Outer Envelope Bounding Box (4 rows x 4 cols of cellKm = total 4 * cellKm = 8 km width/height)
  const halfSpanKm = 2 * cellKm; // 2 cells = 4 km from center in each cardinal direction
  const northPt = turf.destination(centerPt, halfSpanKm, 0, { units: "kilometers" });
  const northLat = northPt.geometry.coordinates[1];
  const southPt = turf.destination(centerPt, halfSpanKm, 180, { units: "kilometers" });
  const southLat = southPt.geometry.coordinates[1];
  const eastPt = turf.destination(centerPt, halfSpanKm, 90, { units: "kilometers" });
  const eastLng = eastPt.geometry.coordinates[0];
  const westPt = turf.destination(centerPt, halfSpanKm, 270, { units: "kilometers" });
  const westLng = westPt.geometry.coordinates[0];

  const squareBBox = { northLat, southLat, eastLng, westLng };

  // Helper functions for geodetic offsets
  const getLatAtOffsetKm = (offsetYKm: number) => {
    if (Math.abs(offsetYKm) < 0.0001) return hotspot.lat;
    return turf.destination(centerPt, Math.abs(offsetYKm), offsetYKm >= 0 ? 0 : 180, {
      units: "kilometers"
    }).geometry.coordinates[1];
  };

  const getLngAtOffsetKm = (offsetXKm: number) => {
    if (Math.abs(offsetXKm) < 0.0001) return hotspot.lng;
    return turf.destination(centerPt, Math.abs(offsetXKm), offsetXKm >= 0 ? 90 : 270, {
      units: "kilometers"
    }).geometry.coordinates[0];
  };

  // 1. Construct 16 Grid Cells (4x4) of 2 km x 2 km each, centered on Hot Spot (HS)
  const gridCells: HotspotGridCell[] = [];
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

  for (let r = 0; r < 4; r++) {
    // r=0: +4 to +2; r=1: +2 to 0; r=2: 0 to -2; r=3: -2 to -4 km
    const yTopKm = (2 - r) * cellKm;
    const yBottomKm = (1 - r) * cellKm;
    const cLatTop = getLatAtOffsetKm(yTopKm);
    const cLatBottom = getLatAtOffsetKm(yBottomKm);

    for (let c = 0; c < 4; c++) {
      // c=0: -4 to -2; c=1: -2 to 0; c=2: 0 to +2; c=3: +2 to +4 km
      const xLeftKm = (c - 2) * cellKm;
      const xRightKm = (c - 1) * cellKm;
      const cLngLeft = getLngAtOffsetKm(xLeftKm);
      const cLngRight = getLngAtOffsetKm(xRightKm);

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
      const distFromHS = turf.distance(centerPt, turf.point([cMidLng, cMidLat]), {
        units: "kilometers"
      });

      // Find points falling within this 2 km x 2 km cell
      const cellPoints: any[] = [];
      let cellSum = 0;
      let cellMax = -Infinity;
      let cellMin = Infinity;
      let cellExceedCount = 0;

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (!pt._hasCoords) continue;
        const lat = pt._lat;
        const lon = pt._lon;
        if (lat >= cLatBottom && lat <= cLatTop && lon >= cLngLeft && lon <= cLngRight) {
          cellPoints.push(pt);
          const v = pt._val;
          if (!isNaN(v)) {
            cellSum += v;
            if (v > cellMax) cellMax = v;
            if (v < cellMin) cellMin = v;
            if (v > b1) cellExceedCount++;
          }
        }
      }

      const count = cellPoints.length;
      const avgVal = count > 0 ? cellSum / count : 0;
      const maxVal = cellMax !== -Infinity ? cellMax : 0;
      const minVal = cellMin !== Infinity ? cellMin : 0;
      const exceedanceRate = count > 0 ? (cellExceedCount / count) * 100 : 0;

      let riskLevel: "CRITICAL" | "HIGH" | "MODERATE" | "SAFE" | "NO_DATA" = "NO_DATA";
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

  // 2. Filter all Sampling Locations inside the 5.0 km circular buffer zone
  const samplingLocations: any[] = [];
  let totalSum = 0;
  let overallMax = -Infinity;
  let validValCount = 0;
  let innerWellsCount = 0;
  let outerWellsCount = 0;

  for (let i = 0; i < points.length; i++) {
    const d = points[i];
    if (!d._hasCoords) continue;
    const ptTurf = turf.point([d._lon, d._lat]);
    const dist = turf.distance(centerPt, ptTurf, { units: "kilometers" });

    // Include if within the 5 km study circle or within the 4x4 grid bounds
    if (dist <= R || (d._lat >= southLat && d._lat <= northLat && d._lon >= westLng && d._lon <= eastLng)) {
      let bearing = turf.bearing(centerPt, ptTurf);
      if (bearing < 0) bearing += 360;

      const isInner = dist <= cellKm; // within 2 km of HS
      if (isInner) innerWellsCount++;
      else outerWellsCount++;

      const val = typeof d._val === "number" && !isNaN(d._val) ? d._val : NaN;
      if (!isNaN(val)) {
        totalSum += val;
        validValCount++;
        if (val > overallMax) overallMax = val;
      }

      samplingLocations.push({ ...d, _dist: dist, _bearing: bearing, _isInner: isInner });
    }
  }

  const overallAvg = validValCount > 0 ? totalSum / validValCount : 0;
  if (overallMax === -Infinity) overallMax = 0;

  // 3. Directional Spread Sectors (8 Octants or 4 Quadrants) radiating from HS
  type DirectionDef = {
    code: string;
    label: string;
    range: [number, number];
    mid: number;
  };

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
    const dirPoints = samplingLocations.filter((ep) => {
      if (sec.range[0] > sec.range[1]) {
        return ep._bearing >= sec.range[0] || ep._bearing < sec.range[1];
      } else {
        return ep._bearing >= sec.range[0] && ep._bearing < sec.range[1];
      }
    });

    const innerPts = dirPoints.filter((p) => p._isInner);
    const outerPts = dirPoints.filter((p) => !p._isInner);

    let dirSum = 0;
    let dirValidCount = 0;
    let dirMax = -Infinity;
    let dirMin = Infinity;
    let exceedCount = 0;

    dirPoints.forEach((p) => {
      const v = p._val;
      if (!isNaN(v)) {
        dirSum += v;
        dirValidCount++;
        if (v > dirMax) dirMax = v;
        if (v < dirMin) dirMin = v;
        if (v > b1) exceedCount++;
      }
    });

    const avgVal = dirValidCount > 0 ? dirSum / dirValidCount : 0;
    const maxVal = dirMax !== -Infinity ? dirMax : 0;
    const minVal = dirMin !== Infinity ? dirMin : 0;
    const exceedanceRate = dirValidCount > 0 ? (exceedCount / dirValidCount) * 100 : 0;

    const outerWeight = outerPts.length > 0 ? 1.4 : 1.0;
    const migrationIndex = dirValidCount > 0 ? avgVal * (1 + exceedanceRate / 100) * outerWeight : 0;

    let riskLevel: "CRITICAL" | "HIGH" | "MODERATE" | "SAFE" | "NO_DATA" = "NO_DATA";
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

  // Dominant Direction
  const activeStats = directionalStats.filter((s) => s.totalCount > 0);
  activeStats.sort((a, b) => b.migrationIndex - a.migrationIndex);
  const dominantDirection = activeStats.length > 0 ? activeStats[0] : null;
  const secondaryDirection =
    activeStats.length > 1 &&
    activeStats[1].migrationIndex >= (dominantDirection?.migrationIndex || 0) * 0.7
      ? activeStats[1]
      : null;

  // Highest Contaminated 2km Grid Cell
  const populatedCells = gridCells.filter((c) => c.count > 0);
  populatedCells.sort((a, b) => {
    // Sort by avg concentration and exceedance
    const scoreA = a.avgVal * (1 + a.exceedanceRate / 100);
    const scoreB = b.avgVal * (1 + b.exceedanceRate / 100);
    return scoreB - scoreA;
  });
  const highestContaminatedCell = populatedCells.length > 0 ? populatedCells[0] : null;

  // Scientific verdict
  let verdict = "";
  if (!dominantDirection || dominantDirection.totalCount === 0) {
    verdict = `No monitoring wells located within the ${R.toFixed(1)} km circular buffer or the 2 km grid cells. Pick a hotspot closer to well clusters or enlarge radius.`;
  } else {
    const hasBreached = dominantDirection.outerCount > 0;
    const exceedStr =
      dominantDirection.exceedanceRate > 0
        ? ` with ${dominantDirection.exceedanceRate.toFixed(0)}% limit exceedance`
        : "";

    verdict =
      `Pollution plume from Hot Spot (HS) is predominantly dispersing towards the ${dominantDirection.label} (${dominantDirection.direction} · ${dominantDirection.midBearing}°) sector. ` +
      (highestContaminatedCell
        ? `Grid cell "${highestContaminatedCell.label}" (${cellKm} km × ${cellKm} km, ${highestContaminatedCell.distFromHS.toFixed(1)} km from HS) exhibits peak contamination averaging ${highestContaminatedCell.avgVal.toFixed(2)} ${unit}${exceedStr}. `
        : "") +
      (hasBreached
        ? `⚠️ Contamination plume has breached the inner ${cellKm} km core, with ${dominantDirection.outerCount} wells contaminated in the outer cells reaching towards the ${R.toFixed(1)} km boundary.`
        : `Contamination is currently confined within ${cellKm} km of the Hot Spot epicenter (${dominantDirection.innerCount} samples monitored).`);

    if (secondaryDirection) {
      verdict += ` Secondary spread vector observed towards ${secondaryDirection.label} (${secondaryDirection.direction} · ${secondaryDirection.midBearing}°).`;
    }
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

interface SectorAnalysisViewProps {
  rawData: any[];
  allRawData?: any[];
  filteredRawData?: any[];
  setRawData?: (data: any[]) => void;
  headers?: DataHeaders;
  setHeaders?: React.Dispatch<React.SetStateAction<DataHeaders>>;
  headerMap?: Record<string, string>;
  setHeaderMap?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  selectedState?: string;
  selectedDistrict?: string;
  selectedYear?: string;
  selectedSeason?: string;
  sharedLayers?: ShapefileLayer[];
  setSharedLayers?: React.Dispatch<React.SetStateAction<ShapefileLayer[]>>;
  isVisible: boolean;
  showToast?: (msg: string, type?: "success" | "warning" | "error") => void;
}

const LAYER_COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];

export default function SectorAnalysisView({
  rawData: initialRawData = [],
  allRawData = [],
  filteredRawData = [],
  setRawData: setParentRawData,
  headers: initialHeaders,
  setHeaders: setParentHeaders,
  headerMap: initialHeaderMap,
  setHeaderMap: setParentHeaderMap,
  selectedState = "",
  selectedDistrict = "",
  selectedYear = "",
  selectedSeason = "",
  sharedLayers = [],
  setSharedLayers,
  isVisible,
  showToast
}: SectorAnalysisViewProps) {
  // Map Container & Instances
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    polys: L.LayerGroup;
    labels: L.LayerGroup;
    centerMarker: L.LayerGroup;
    wells: L.LayerGroup;
    hotspotPlume: L.LayerGroup;
  }>({
    polys: L.layerGroup(),
    labels: L.layerGroup(),
    centerMarker: L.layerGroup(),
    wells: L.layerGroup(),
    hotspotPlume: L.layerGroup()
  });

  // Analysis status & debounce timer to keep UI completely fluid without hanging
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const analysisTimerRef = useRef<any>(null);

  // Parent Dataset reference - prioritizing filtered points matching active cascading filters
  const parentDataset = useMemo(() => {
    if (filteredRawData && filteredRawData.length > 0) return filteredRawData;
    if (initialRawData && initialRawData.length > 0) return initialRawData;
    if (allRawData && allRawData.length > 0) return allRawData;
    return [];
  }, [filteredRawData, initialRawData, allRawData]);

  // Local Dataset state (initialized with parent rawData or custom local upload)
  const [isLocalUpload, setIsLocalUpload] = useState<boolean>(false);
  const [localData, setLocalData] = useState<any[]>(parentDataset);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Auto-sync with parent if user hasn't uploaded a separate local sheet
  useEffect(() => {
    if (!isLocalUpload && parentDataset.length > 0) {
      setLocalData(parentDataset);
    }
  }, [parentDataset, isLocalUpload]);

  // Available column keys
  const availableColumns = useMemo(() => {
    if (localData.length === 0) return [];
    const keys = new Set<string>();
    localData.forEach((row) => {
      Object.keys(row).forEach((k) => keys.add(k));
    });
    return Array.from(keys).sort();
  }, [localData]);

  // Column Mapping state
  const [columnMap, setColumnMap] = useState<{
    lat: string;
    lon: string;
    params: Record<string, string>;
  }>({
    lat: "",
    lon: "",
    params: {}
  });

  // Active Parameter
  const [activeParam, setActiveParam] = useState<string>("pH");

  // Pre-parsed rows cache: parsed once per dataset/mapping change, eliminating repeated regex work
  const memoizedPoints = useMemo(() => {
    if (localData.length === 0 || !columnMap.lat || !columnMap.lon) return [];
    const latKey = columnMap.lat;
    const lonKey = columnMap.lon;
    const valKey = columnMap.params[activeParam];

    return localData.map((d, index) => {
      const lat = parseCoord(d[latKey]);
      const lon = parseCoord(d[lonKey]);
      const val = valKey ? parseWaterValue(d[valKey]) : NaN;
      return {
        ...d,
        _raw: d,
        _index: index,
        _lat: lat,
        _lon: lon,
        _val: val,
        _hasCoords: !isNaN(lat) && !isNaN(lon)
      };
    });
  }, [localData, columnMap.lat, columnMap.lon, columnMap.params, activeParam]);

  // Spatial Analysis Mode: Radial Rings & Sectors vs Rectangular Grid Analysis
  const [analysisMode, setAnalysisMode] = useState<"sector" | "grid">("sector");

  // Rectangular Grid-Wise Analysis Parameters
  const [gridCellWidthKm, setGridCellWidthKm] = useState<number>(2.0);
  const [gridCellHeightKm, setGridCellHeightKm] = useState<number>(2.0);
  const [gridScope, setGridScope] = useState<"data_bounds" | "origin_extent">("data_bounds");

  // Radial Rings (KM)
  const [radii, setRadii] = useState<number[]>([5, 10]);
  const [newRingInput, setNewRingInput] = useState<string>("");

  // Sector Angle (degrees)
  const [sectorAngle, setSectorAngle] = useState<number>(45);

  // Analysis Toggles
  const [hideEmptySectors, setHideEmptySectors] = useState<boolean>(false);
  const [hideMissingData, setHideMissingData] = useState<boolean>(true);
  const [clipToBoundary, setClipToBoundary] = useState<boolean>(true);
  const [autoRestrictOrigin, setAutoRestrictOrigin] = useState<boolean>(true);

  // Stats on Sectors
  const [showLabelId, setShowLabelId] = useState<boolean>(true);
  const [showLabelAvg, setShowLabelAvg] = useState<boolean>(true);
  const [showLabelCount, setShowLabelCount] = useState<boolean>(true);
  const [showLabelArea, setShowLabelArea] = useState<boolean>(true);

  // Label Formatting panel state
  const [showLabelFormatPanel, setShowLabelFormatPanel] = useState<boolean>(false);
  const [labelFormat, setLabelFormat] = useState({
    id: { color: "#4f46e5", size: 7 },
    avg: { color: "#0f172a", size: 9 },
    count: { color: "#0f172a", size: 8 },
    area: { color: "#64748b", size: 8 },
    sector: { borderColor: "#ffffff", weight: 1.5, matchFill: true }
  });

  // Range Thresholds & Units
  const [customRanges, setCustomRanges] = useState<CustomTierRange[]>([
    { min: 0, max: 6.5, label: "Desirable", color: "#10b981", unit: "", visible: true },
    { min: 6.5, max: 8.5, label: "Permissible", color: "#fbbf24", unit: "", visible: true },
    { min: 8.5, max: 100000, label: "Unsuitable", color: "#ef4444", unit: "", visible: true }
  ]);

  // Center Point [lng, lat]
  const [centerPoint, setCenterPoint] = useState<[number, number] | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  // Boundary layers uploaded / managed
  const [shapefileLayers, setShapefileLayers] = useState<BoundaryLayerItem[]>([]);
  const colorIndexRef = useRef(0);

  // Filter dropdown state
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [filterMeta, setFilterMeta] = useState<{ label: string; actualKey: string }[]>([]);

  // Active calculated sectors data
  const [activeSectorData, setActiveSectorData] = useState<SectorAnalysisData[]>([]);

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [sidebarTab, setSidebarTab] = useState<"steps" | "filters" | "plume" | "stats">("steps");

  // Hotspot Plume 2km Ring & Outer Square State
  const [hotspotPoint, setHotspotPoint] = useState<{
    lng: number;
    lat: number;
    val?: number;
    locationName?: string;
    sampleId?: string;
  } | null>(null);
  const [isPickingHotspot, setIsPickingHotspot] = useState<boolean>(false);
  const [hotspotRadiusKm, setHotspotRadiusKm] = useState<number>(5.0);
  const [hotspotGridSizeKm, setHotspotGridSizeKm] = useState<number>(2.0);
  const [showHotspotPlume, setShowHotspotPlume] = useState<boolean>(false);
  const [plumeResolution, setPlumeResolution] = useState<8 | 4>(8);
  const [showBufferCircle, setShowBufferCircle] = useState<boolean>(true);
  const [showGridCells, setShowGridCells] = useState<boolean>(true);
  const [showStarMarkers, setShowStarMarkers] = useState<boolean>(true);
  const [showDimensionLabels, setShowDimensionLabels] = useState<boolean>(true);
  const [showPlumeVectorArrow, setShowPlumeVectorArrow] = useState<boolean>(true);
  const [hotspotPlumeResult, setHotspotPlumeResult] = useState<HotspotPlumeResult | null>(null);
  const [selectedDirectionHighlight, setSelectedDirectionHighlight] = useState<string | null>(null);
  const [selectedCellHighlight, setSelectedCellHighlight] = useState<string | null>(null);

  // Auto-detect columns on data change with smart scoring
  useEffect(() => {
    if (availableColumns.length === 0) return;

    const detectedCoords = findCoordinateColumns(availableColumns, localData);
    let detectedLat = detectedCoords.lat;
    let detectedLon = detectedCoords.lon;

    // Fallbacks from initialHeaders if passed and valid
    if (!detectedLat && initialHeaders?.latitude && availableColumns.includes(initialHeaders.latitude)) {
      detectedLat = initialHeaders.latitude;
    }
    if (!detectedLon && initialHeaders?.longitude && availableColumns.includes(initialHeaders.longitude)) {
      detectedLon = initialHeaders.longitude;
    }

    const paramMap: Record<string, string> = {};
    Object.keys(SECTOR_PARAM_CONFIG).forEach((pKey) => {
      paramMap[pKey] = findParamColumn(pKey, availableColumns, initialHeaderMap);
    });

    setColumnMap({
      lat: detectedLat,
      lon: detectedLon,
      params: paramMap
    });

    // Setup filter meta
    const targetKeys = ["State", "District", "Block", "Source", "Season", "Year"];
    const metas = targetKeys
      .map((key) => {
        const actualKey = availableColumns.find(
          (k) =>
            k.toLowerCase() === key.toLowerCase() ||
            (k.toLowerCase().includes(key.toLowerCase()) && !k.toLowerCase().includes("date"))
        );
        return { label: key, actualKey: actualKey || "" };
      })
      .filter((f) => f.actualKey !== "");
    setFilterMeta(metas);
  }, [availableColumns, localData, initialHeaders, initialHeaderMap]);

  // Sync parameter limits when activeParam changes
  const syncLimits = useCallback(() => {
    const config = SECTOR_PARAM_CONFIG[activeParam] || { b1: 500, b2: 2000, unit: "mg/L" };
    setCustomRanges([
      { min: 0, max: config.b1, label: "Desirable", color: "#10b981", unit: config.unit, visible: true },
      { min: config.b1, max: config.b2, label: "Permissible", color: "#fbbf24", unit: config.unit, visible: true },
      { min: config.b2, max: 100000, label: "Unsuitable", color: "#ef4444", unit: config.unit, visible: true }
    ]);
  }, [activeParam]);

  useEffect(() => {
    syncLimits();
  }, [syncLimits]);

  // Helper: check range match
  const getRangeMatch = useCallback(
    (val: number) => {
      return customRanges.find((r, i) =>
        i === customRanges.length - 1 ? val >= r.min && val <= r.max : val >= r.min && val < r.max
      );
    },
    [customRanges]
  );

  // Helper: Extract readable feature name
  const getFeatureName = (feature: any, index: number) => {
    if (!feature.properties) return `Feature ${index}`;
    const keys = Object.keys(feature.properties);
    let nameKey = keys.find((k) =>
      /^(name|nam|dist|district|block|state|mandal|tehsil|aq|aquifer)$/i.test(k.trim())
    );
    if (!nameKey) nameKey = keys.find((k) => /name/i.test(k.trim()));
    if (!nameKey)
      nameKey = keys.find(
        (k) => typeof feature.properties[k] === "string" && feature.properties[k].length < 50
      );
    if (nameKey && feature.properties[nameKey]) return String(feature.properties[nameKey]).trim();
    return `Feature ${index}`;
  };

  // Convert parent sharedLayers to shapefileLayers whenever sharedLayers updates
  useEffect(() => {
    if (!sharedLayers || sharedLayers.length === 0) return;
    setShapefileLayers((prev) => {
      const existingIds = new Set(prev.map((l) => l.id));
      const newlyAdded: BoundaryLayerItem[] = [];
      sharedLayers.forEach((shLayer) => {
        const layerId = shLayer.id || "shared_" + shLayer.name;
        if (existingIds.has(layerId)) return;
        if (!shLayer.geoJson) return;
        try {
          const color = shLayer.strokeColor || LAYER_COLORS[colorIndexRef.current % LAYER_COLORS.length];
          colorIndexRef.current++;
          const bbox = turf.bbox(shLayer.geoJson) as [number, number, number, number];
          const features: BoundaryFeatureItem[] = [];
          let fIndex = 0;
          turf.flattenEach(shLayer.geoJson, (currentFeature: any) => {
            if (
              currentFeature.geometry &&
              (currentFeature.geometry.type === "Polygon" ||
                currentFeature.geometry.type === "MultiPolygon")
            ) {
              const fBox = turf.bbox(currentFeature) as [number, number, number, number];
              features.push({
                poly: currentFeature,
                name: getFeatureName(currentFeature, ++fIndex),
                bbox: fBox,
                isSelected: true,
                color: color
              });
            }
          });
          features.sort((a, b) => String(a.name).localeCompare(String(b.name)));
          newlyAdded.push({
            id: layerId,
            name: shLayer.name || "Boundary Layer",
            geojson: shLayer.geoJson,
            bbox,
            features,
            isVisible: shLayer.visible !== false,
            isFilter: true,
            color,
            isExpanded: false,
            mapLayer: null
          });
        } catch (e) {
          console.warn("Error converting shared layer to sector boundary", e);
        }
      });
      if (newlyAdded.length > 0) {
        return [...prev, ...newlyAdded];
      }
      return prev;
    });
  }, [sharedLayers]);

  // Leaflet Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }
    mapContainerRef.current.innerHTML = "";

    const map = L.map(mapContainerRef.current, {
      preferCanvas: true,
      zoomControl: false,
      attributionControl: false
    }).setView([22.5, 82.5], 5);

    // Basemaps
    const googleHybrid = L.tileLayer("https://{s}.google.com/vt/lyrs=y,h&x={x}&y={y}&z={z}", {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      crossOrigin: true
    });

    const googleSatellite = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      crossOrigin: true
    });

    const googlePhysical = L.tileLayer("https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      crossOrigin: true
    });

    const googleStreets = L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      crossOrigin: true
    });

    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    });

    googleHybrid.addTo(map);

    const baseMaps = {
      "Google Earth Hybrid": googleHybrid,
      "Google Satellite": googleSatellite,
      "Terrain Physical": googlePhysical,
      "Standard Streets": googleStreets,
      "OpenStreetMap": osm
    };

    L.control.layers(baseMaps, undefined, { position: "topright" }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);

    layersRef.current.polys.addTo(map);
    layersRef.current.labels.addTo(map);
    layersRef.current.centerMarker.addTo(map);
    layersRef.current.wells.addTo(map);
    layersRef.current.hotspotPlume.addTo(map);

    mapRef.current = map;

    return () => {
      try {
        map.remove();
      } catch (err) {
        console.warn("Map remove cleanup", err);
      }
      mapRef.current = null;
    };
  }, []);

  // Invalidate map size on tab visibility change to avoid gray/blank tiles
  useEffect(() => {
    if (isVisible && mapRef.current) {
      const t1 = setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
      const t2 = setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 350);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isVisible]);



  // Update center marker on map when centerPoint changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layersRef.current.centerMarker.clearLayers();

    if (centerPoint) {
      const [lng, lat] = centerPoint;
      const pulseHtml = `
        <div style="
          width: 26px; height: 26px;
          background: #4f46e5; border: 4px solid white;
          border-radius: 50%;
          box-shadow: 0 0 16px rgba(79, 70, 229, 0.8);
          animation: pulseMarker 1.8s infinite;
        "></div>
      `;
      const icon = L.divIcon({
        className: "",
        html: pulseHtml,
        iconAnchor: [13, 13]
      });
      L.marker([lat, lng], { icon }).addTo(layersRef.current.centerMarker);
    }
  }, [centerPoint]);

  // Redraw Boundary Layers on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    shapefileLayers.forEach((layer) => {
      if (layer.mapLayer) {
        map.removeLayer(layer.mapLayer);
      }
      const activePolys = layer.features
        .filter((f) => f.isSelected)
        .map((f) => {
          if (!f.poly.properties) f.poly.properties = {};
          f.poly.properties._renderColor = f.color;
          return f.poly;
        });

      if (activePolys.length > 0) {
        const geoLayer = L.geoJSON(turf.featureCollection(activePolys), {
          style: (feature) => ({
            color: feature?.properties?._renderColor || layer.color,
            weight: 2,
            fillOpacity: 0.08,
            dashArray: "5, 5"
          }),
          interactive: false
        });
        layer.mapLayer = geoLayer;
        if (layer.isVisible) {
          geoLayer.addTo(map);
        }
      } else {
        layer.mapLayer = null;
      }
    });
  }, [shapefileLayers]);

  // Filtered dataset cache based on attribute & spatial boundaries using pre-parsed memoized points
  const currentFilteredData = useMemo(() => {
    if (memoizedPoints.length === 0) return [];
    const activeFilters = shapefileLayers.filter((l) => l.isFilter);
    const filterEntries = Object.entries(filters).filter(([_, vSet]) => vSet.size > 0);

    const checkState = !isLocalUpload && selectedState && !isStateAllFilter(selectedState);
    const selStateNorm = checkState ? normFilterVal(selectedState) : "";
    const stateKey = initialHeaders?.state || "";

    const checkDistrict = !isLocalUpload && selectedDistrict && !isDistrictAllFilter(selectedDistrict);
    const selDistNorm = checkDistrict ? normFilterVal(selectedDistrict) : "";
    const distKey = initialHeaders?.district || "";

    const checkYear = !isLocalUpload && selectedYear && !isYearAllFilter(selectedYear);
    const selYearLower = checkYear ? selectedYear.toLowerCase().trim() : "";
    const yearKey = initialHeaders?.year || "";

    const checkSeason = !isLocalUpload && selectedSeason && !isSeasonAllFilter(selectedSeason);
    const selSeasonLower = checkSeason ? selectedSeason.toLowerCase().trim() : "";
    const seasonKey = initialHeaders?.season || "";

    return memoizedPoints.filter((d) => {
      // 0. Cascading App Filters (State, District, Year, Season)
      if (checkState) {
        const val = String(d[stateKey] || d["State"] || d["state"] || d["STATE"] || d["State_Name"] || d["State/UT"] || "").trim();
        const vNorm = normFilterVal(val);
        if (!vNorm || (!vNorm.includes(selStateNorm) && !selStateNorm.includes(vNorm))) {
          return false;
        }
      }

      if (checkDistrict) {
        const val = String(d[distKey] || d["District"] || d["district"] || d["DISTRICT"] || d["Dist"] || "").trim();
        const vNorm = normFilterVal(val);
        if (!vNorm || (!vNorm.includes(selDistNorm) && !selDistNorm.includes(vNorm))) {
          return false;
        }
      }

      if (checkYear) {
        const yrVal = String(d[yearKey] || d["Year"] || d["year"] || d["YEAR"] || "").toLowerCase().trim();
        if (!yrVal || !yrVal.includes(selYearLower)) {
          return false;
        }
      }

      if (checkSeason) {
        const rowSeason = String(d[seasonKey] || d["Season"] || d["season"] || d["SEASON"] || "").toLowerCase().trim();
        if (selSeasonLower.includes("pre")) {
          if (!rowSeason.includes("pre") && !rowSeason.includes("before") && !rowSeason.includes("may")) return false;
        } else if (selSeasonLower.includes("post")) {
          if (!rowSeason.includes("post") && !rowSeason.includes("after") && !rowSeason.includes("nov")) return false;
        } else {
          if (rowSeason !== selSeasonLower && !rowSeason.includes(selSeasonLower)) return false;
        }
      }

      // 1. Check Dropdown Attribute Filters
      if (filterEntries.length > 0) {
        const passesFilters = filterEntries.every(([k, vSet]) => vSet.has(String(d[k] || "")));
        if (!passesFilters) return false;
      }

      // 2. Spatial Boundary Filter check
      if (activeFilters.length > 0 && d._hasCoords) {
        const lat = d._lat;
        const lon = d._lon;
        const pt = turf.point([lon, lat]);

        for (let f = 0; f < activeFilters.length; f++) {
          const filterLayer = activeFilters[f];
          const activeFeatures = filterLayer.features.filter((feat) => feat.isSelected);
          if (activeFeatures.length === 0) return false;

          // Quick Layer BBox check
          if (
            lon < filterLayer.bbox[0] ||
            lon > filterLayer.bbox[2] ||
            lat < filterLayer.bbox[1] ||
            lat > filterLayer.bbox[3]
          ) {
            return false;
          }

          let isInside = false;
          for (let i = 0; i < activeFeatures.length; i++) {
            const feat = activeFeatures[i];
            if (
              lon < feat.bbox[0] ||
              lon > feat.bbox[2] ||
              lat < feat.bbox[1] ||
              lat > feat.bbox[3]
            ) {
              continue;
            }
            if (turf.booleanPointInPolygon(pt, feat.poly)) {
              isInside = true;
              break;
            }
          }
          if (!isInside) return false;
        }
      }
      return true;
    });
  }, [
    memoizedPoints,
    filters,
    shapefileLayers,
    isLocalUpload,
    selectedState,
    selectedDistrict,
    selectedYear,
    selectedSeason,
    initialHeaders
  ]);

  // Track filter changes to automatically re-center and fit bounds to the filtered district
  const lastFilterSigRef = useRef<string>("");

  // Auto-center and fit map bounds on first load or when cascading filters change
  useEffect(() => {
    if (currentFilteredData.length === 0 || !columnMap.lat || !columnMap.lon) return;

    const filterSig = `${selectedState}|${selectedDistrict}|${selectedYear}|${selectedSeason}|${isLocalUpload ? "local" : "parent"}|${currentFilteredData.length}`;
    const filterChanged = lastFilterSigRef.current !== filterSig;

    if (filterChanged || !centerPoint) {
      lastFilterSigRef.current = filterSig;

      let sumLat = 0;
      let sumLon = 0;
      let count = 0;
      const validPoints: [number, number][] = [];

      currentFilteredData.forEach((d) => {
        if (d._hasCoords) {
          sumLat += d._lat;
          sumLon += d._lon;
          count++;
          validPoints.push([d._lat, d._lon]);
        }
      });

      if (count > 0) {
        const avgLat = sumLat / count;
        const avgLon = sumLon / count;
        setCenterPoint([avgLon, avgLat]);
        if (mapRef.current && validPoints.length > 0) {
          if (validPoints.length > 1) {
            const bounds = L.latLngBounds(validPoints);
            mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
          } else {
            mapRef.current.setView([avgLat, avgLon], 10);
          }
        }
      }
    }
  }, [
    currentFilteredData,
    columnMap.lat,
    columnMap.lon,
    centerPoint,
    selectedState,
    selectedDistrict,
    selectedYear,
    selectedSeason,
    isLocalUpload
  ]);

  // Plot Well Points with high-speed GPU canvas renderer
  const plotAllPoints = useCallback(() => {
    try {
      const map = mapRef.current;
      if (!map) return;
      layersRef.current.wells.clearLayers();
      if (currentFilteredData.length === 0) return;

      const valKey = columnMap.params[activeParam];

      currentFilteredData.forEach((d) => {
        const lat = d._lat;
        const lon = d._lon;
        const val = d._val;

        if (d._hasCoords) {
          let color = "#4f46e5";
          let isVisible = true;
          let tooltipText = `Sample #${d._index + 1}<br/>Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;

          if (valKey && !isNaN(val)) {
            const rangeMatch = getRangeMatch(val);
            if (rangeMatch) {
              color = rangeMatch.color;
              isVisible = rangeMatch.visible !== false;
              tooltipText += `<br/><b>${activeParam}:</b> ${val} ${rangeMatch.unit} (${rangeMatch.label})`;
            } else {
              tooltipText += `<br/><b>${activeParam}:</b> ${val}`;
            }
          } else if (valKey) {
            if (hideMissingData) {
              isVisible = false;
            } else {
              color = "#94a3b8";
              tooltipText += `<br/><b>${activeParam}:</b> No Data / NaN`;
            }
          } else {
            tooltipText += `<br/><span style="color:#64748b;">(Select ${activeParam} column in Step 2 to color-code)</span>`;
          }

          if (isVisible) {
            const marker = L.circleMarker([lat, lon], {
              radius: 3.5,
              color: "#ffffff",
              weight: 0.8,
              fillColor: color,
              fillOpacity: 0.85
            });
            marker.bindTooltip(tooltipText, { direction: "top", offset: [0, -3] });
            marker.addTo(layersRef.current.wells);
          }
        }
      });
    } catch (err) {
      console.warn("plotAllPoints error:", err);
    }
  }, [currentFilteredData, columnMap.params, activeParam, getRangeMatch, hideMissingData]);

  useEffect(() => {
    plotAllPoints();
  }, [plotAllPoints]);

  // Auto-detect highest contaminated hotspot well
  const autoDetectMaxHotspot = useCallback(() => {
    if (currentFilteredData.length === 0) {
      showToast?.("No samples available to detect hotspot", "warning");
      return;
    }
    let maxVal = -Infinity;
    let maxWell: any = null;
    currentFilteredData.forEach((d) => {
      if (!d._hasCoords) return;
      const v = d._val;
      if (!isNaN(v) && v > maxVal) {
        maxVal = v;
        maxWell = d;
      }
    });

    if (!maxWell || maxVal === -Infinity) {
      showToast?.(`No valid ${activeParam} values found in active samples`, "warning");
      return;
    }

    const locName =
      maxWell.Location ||
      maxWell.Village ||
      maxWell.District ||
      maxWell.Block ||
      `Sample #${maxWell._index + 1}`;

    const newHotspot = {
      lng: maxWell._lon,
      lat: maxWell._lat,
      val: maxVal,
      locationName: String(locName),
      sampleId: `Sample #${maxWell._index + 1}`
    };

    setHotspotPoint(newHotspot);
    setShowHotspotPlume(true);
    setSidebarTab("plume");

    if (mapRef.current) {
      mapRef.current.flyTo([maxWell._lat, maxWell._lon], 13, { duration: 1 });
    }
    showToast?.(`⚡ Detected Max Hotspot: ${locName} (${maxVal} ${SECTOR_PARAM_CONFIG[activeParam]?.unit || ""})`, "success");
  }, [currentFilteredData, activeParam, showToast]);

  // Handle map clicks for drawing / picking center or picking hotspot
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      // 1. Picking Hotspot
      if (isPickingHotspot) {
        const clickedLng = e.latlng.lng;
        const clickedLat = e.latlng.lat;

        // Find nearest well within 0.8 km to snap, if available
        let nearestWell: any = null;
        let minDist = Infinity;
        if (currentFilteredData.length > 0) {
          const clickPt = turf.point([clickedLng, clickedLat]);
          for (let i = 0; i < currentFilteredData.length; i++) {
            const d = currentFilteredData[i];
            if (!d._hasCoords) continue;
            const dist = turf.distance(clickPt, turf.point([d._lon, d._lat]), { units: "kilometers" });
            if (dist < minDist) {
              minDist = dist;
              nearestWell = d;
            }
          }
        }

        if (minDist <= 0.8 && nearestWell) {
          const locName =
            nearestWell.Location ||
            nearestWell.Village ||
            nearestWell.District ||
            nearestWell.Block ||
            `Sample #${nearestWell._index + 1}`;
          setHotspotPoint({
            lng: nearestWell._lon,
            lat: nearestWell._lat,
            val: nearestWell._val,
            locationName: String(locName),
            sampleId: `Sample #${nearestWell._index + 1}`
          });
          showToast?.(
            `Hotspot pinned to well: ${locName} (${nearestWell._val !== undefined && !isNaN(nearestWell._val) ? nearestWell._val : "N/A"} ${SECTOR_PARAM_CONFIG[activeParam]?.unit || ""})`,
            "success"
          );
        } else {
          setHotspotPoint({
            lng: clickedLng,
            lat: clickedLat,
            locationName: `Picked Point (${clickedLat.toFixed(4)}, ${clickedLng.toFixed(4)})`
          });
          showToast?.(
            `Hotspot set at coordinates: ${clickedLat.toFixed(4)}, ${clickedLng.toFixed(4)}`,
            "success"
          );
        }

        setIsPickingHotspot(false);
        setShowHotspotPlume(true);
        setSidebarTab("plume");
        return;
      }

      // 2. Regular Center Picking
      if (isDrawing) {
        setCenterPoint([e.latlng.lng, e.latlng.lat]);
        setIsDrawing(false);
      }
    };

    map.on("click", onMapClick);
    return () => {
      map.off("click", onMapClick);
    };
  }, [isDrawing, isPickingHotspot, currentFilteredData, activeParam, showToast]);

  // Recompute Hotspot Plume Result whenever hotspot, radius, dataset, or parameter changes
  useEffect(() => {
    if (!hotspotPoint) {
      setHotspotPlumeResult(null);
      return;
    }
    try {
      const result = calculateHotspotPlumeData(
        hotspotPoint,
        hotspotRadiusKm,
        currentFilteredData,
        activeParam,
        plumeResolution,
        hotspotGridSizeKm
      );
      setHotspotPlumeResult(result);
    } catch (err) {
      console.warn("Hotspot plume calculation error:", err);
    }
  }, [hotspotPoint, hotspotRadiusKm, hotspotGridSizeKm, currentFilteredData, activeParam, plumeResolution]);

  // Render Hotspot 5km Buffer Circle, 4x4 Grid of 2km Squares, and Star Markers on Leaflet Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.hotspotPlume.clearLayers();

    if (!showHotspotPlume || !hotspotPoint || !hotspotPlumeResult) {
      return;
    }

    try {
      const centerCoord: [number, number] = [hotspotPoint.lat, hotspotPoint.lng];

      // 1. Render the 16 Grid Cells (4x4) of 2 km x 2 km each (dashed blue borders)
      if (showGridCells) {
        hotspotPlumeResult.gridCells.forEach((cell) => {
          const isSelected = selectedCellHighlight === cell.id;
          const isHighest = hotspotPlumeResult.highestContaminatedCell?.id === cell.id;

          const polyCoords = cell.poly.geometry.coordinates[0].map((coord: [number, number]) => [coord[1], coord[0]]);
          const cellLayer = L.polygon(polyCoords, {
            color: isSelected ? "#4f46e5" : isHighest ? "#ef4444" : "#2563eb",
            weight: isSelected ? 3.5 : isHighest ? 2.8 : 1.8,
            dashArray: "5, 5",
            fillColor: cell.color,
            fillOpacity: isSelected ? 0.38 : isHighest ? 0.30 : cell.count > 0 ? 0.16 : 0.03
          });

          const tooltipHtml = `
            <div style="font-family:'Plus Jakarta Sans',sans-serif; font-size:10px;">
              <div style="font-weight:900; color:#1e293b;">${cell.label}</div>
              <div style="color:#64748b;">Size: ${hotspotPlumeResult.gridCellSizeKm} km × ${hotspotPlumeResult.gridCellSizeKm} km</div>
              <div>Wells: <b>${cell.count}</b> | Avg: <b style="color:${cell.color};">${cell.count > 0 ? cell.avgVal.toFixed(2) : "—"} ${hotspotPlumeResult.unit}</b></div>
            </div>
          `;
          cellLayer.bindTooltip(tooltipHtml, { sticky: true });

          const popupHtml = `
            <div style="width:230px; font-family:'Plus Jakarta Sans',sans-serif;">
              <div style="background:${cell.color}; color:white; padding:8px 10px; font-size:11px; font-weight:900; border-radius:8px 8px 0 0; display:flex; justify-content:space-between; align-items:center;">
                <span>${cell.label}</span>
                <span style="font-size:9px; background:rgba(255,255,255,0.25); padding:1px 5px; border-radius:4px;">${cell.distFromHS.toFixed(1)} km</span>
              </div>
              <div style="padding:10px; background:white; border-radius:0 0 8px 8px; font-size:10px; line-height:1.45;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span style="color:#64748b;">Sampling Wells:</span>
                  <b>${cell.count} locations</b>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span style="color:#64748b;">Average (${activeParam}):</span>
                  <b style="color:#0f172a; font-weight:800;">${cell.count > 0 ? cell.avgVal.toFixed(2) : "No Data"} ${hotspotPlumeResult.unit}</b>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span style="color:#64748b;">Max Value:</span>
                  <b>${cell.count > 0 ? cell.maxVal.toFixed(2) : "—"}</b>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span style="color:#64748b;">Limit Exceedance:</span>
                  <b>${cell.exceedanceRate.toFixed(0)}% (${cell.exceedanceCount} wells)</b>
                </div>
                <div style="margin-top:6px; padding-top:6px; border-top:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;">
                  <span style="color:#64748b; font-weight:bold;">Risk Status:</span>
                  <span style="background:${cell.color}20; color:${cell.color}; padding:2px 7px; border-radius:6px; font-weight:900; font-size:9px;">${cell.riskLevel}</span>
                </div>
              </div>
            </div>
          `;
          cellLayer.bindPopup(popupHtml);
          cellLayer.addTo(layersRef.current.hotspotPlume);
        });
      }

      // 2. Render Outer Buffer Circle (5.0 km radius)
      if (showBufferCircle) {
        const circleLayer = L.circle(centerCoord, {
          radius: hotspotPlumeResult.radiusKm * 1000,
          color: "#0f4c81",
          weight: 2.8,
          fillColor: "#0f4c81",
          fillOpacity: 0.02
        });
        circleLayer.bindTooltip(
          `<div style="font-family:'Plus Jakarta Sans',sans-serif; font-size:10px; font-weight:800;">⭕ ${hotspotPlumeResult.radiusKm.toFixed(1)} km Buffer Zone</div>`,
          { sticky: true }
        );
        circleLayer.addTo(layersRef.current.hotspotPlume);
      }

      // 3. Dimension Callouts: "5 km" line (bottom-left) and "2 km" arrow (right side)
      if (showDimensionLabels) {
        // Dimension Line for 5 km (from center towards SW 215 deg)
        const swAngle = 215;
        const swCircumPt = turf.destination(
          turf.point([hotspotPoint.lng, hotspotPoint.lat]),
          hotspotPlumeResult.radiusKm,
          swAngle,
          { units: "kilometers" }
        );
        const swCoords = swCircumPt.geometry.coordinates;

        // Line
        const dimLine5k = L.polyline(
          [
            centerCoord,
            [swCoords[1], swCoords[0]]
          ],
          {
            color: "#0f4c81",
            weight: 1.5,
            dashArray: "4, 4"
          }
        );
        dimLine5k.addTo(layersRef.current.hotspotPlume);

        // Midpoint badge
        const mid5kPt = turf.destination(
          turf.point([hotspotPoint.lng, hotspotPoint.lat]),
          hotspotPlumeResult.radiusKm * 0.55,
          swAngle,
          { units: "kilometers" }
        );
        const mid5kCoords = mid5kPt.geometry.coordinates;
        const badge5k = L.divIcon({
          className: "",
          html: `<div style="
            background: white; color: #0f4c81;
            font-size: 11px; font-weight: 900;
            padding: 2px 7px; border-radius: 6px;
            border: 1.5px solid #0f4c81;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
            white-space: nowrap;
            transform: translate(-50%, -50%);
            font-family: 'Plus Jakarta Sans', sans-serif;
          ">5 km</div>`,
          iconAnchor: [0, 0]
        });
        L.marker([mid5kCoords[1], mid5kCoords[0]], { icon: badge5k, interactive: false }).addTo(
          layersRef.current.hotspotPlume
        );

        // Dimension Callout for 2 km (vertical double arrow on rightmost edge)
        const cellKm = hotspotPlumeResult.gridCellSizeKm;
        const rightColLng = turf.destination(
          turf.point([hotspotPoint.lng, hotspotPoint.lat]),
          2 * cellKm,
          90,
          { units: "kilometers" }
        ).geometry.coordinates[0];

        const r1TopLat = turf.destination(
          turf.point([hotspotPoint.lng, hotspotPoint.lat]),
          0,
          0,
          { units: "kilometers" }
        ).geometry.coordinates[1];

        const r1BottomLat = turf.destination(
          turf.point([hotspotPoint.lng, hotspotPoint.lat]),
          cellKm,
          180,
          { units: "kilometers" }
        ).geometry.coordinates[1];

        const dimLine2k = L.polyline(
          [
            [r1TopLat, rightColLng],
            [r1BottomLat, rightColLng]
          ],
          {
            color: "#2563eb",
            weight: 2
          }
        );
        dimLine2k.addTo(layersRef.current.hotspotPlume);

        const mid2kLat = (r1TopLat + r1BottomLat) / 2;
        const badge2k = L.divIcon({
          className: "",
          html: `<div style="
            background: white; color: #2563eb;
            font-size: 10px; font-weight: 900;
            padding: 2px 6px; border-radius: 6px;
            border: 1.5px solid #2563eb;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
            white-space: nowrap;
            transform: translate(6px, -50%);
            font-family: 'Plus Jakarta Sans', sans-serif;
          ">↕ ${cellKm} km</div>`,
          iconAnchor: [0, 0]
        });
        L.marker([mid2kLat, rightColLng], { icon: badge2k, interactive: false }).addTo(
          layersRef.current.hotspotPlume
        );
      }

      // 4. Render Sampling Locations as Orange Stars with Brown Borders (Matching Image Legend)
      if (showStarMarkers && hotspotPlumeResult.samplingLocations.length > 0) {
        hotspotPlumeResult.samplingLocations.forEach((pt) => {
          const lat = pt._lat;
          const lon = pt._lon;
          const v = pt._val;
          const locName = pt.Location || pt.Village || pt.District || `Sample #${pt._index + 1}`;

          const starHtml = `
            <div style="transform:translate(-50%, -50%); cursor:pointer;">
              <svg width="22" height="22" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                <polygon
                  points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                  fill="#f97316"
                  stroke="#7c2d12"
                  stroke-width="1.8"
                />
              </svg>
            </div>
          `;
          const starIcon = L.divIcon({
            className: "",
            html: starHtml,
            iconAnchor: [0, 0]
          });

          const starMarker = L.marker([lat, lon], { icon: starIcon });
          const starPopup = `
            <div style="font-family:'Plus Jakarta Sans',sans-serif; width:200px;">
              <div style="background:#ea580c; color:white; padding:6px 10px; font-size:10.5px; font-weight:900; border-radius:6px 6px 0 0; display:flex; align-items:center; gap:4px;">
                <span>⭐ Sampling Location</span>
              </div>
              <div style="padding:8px 10px; background:white; border-radius:0 0 6px 6px; font-size:9.5px; line-height:1.4;">
                <div><b>Location:</b> ${locName}</div>
                <div><b>Coordinates:</b> ${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
                ${!isNaN(v) ? `<div><b>${activeParam}:</b> <span style="font-weight:900; color:#ea580c;">${v} ${hotspotPlumeResult.unit}</span></div>` : ""}
                <div style="color:#64748b; font-size:8.5px; margin-top:4px;">Distance from Hotspot: ${pt._dist.toFixed(2)} km</div>
              </div>
            </div>
          `;
          starMarker.bindPopup(starPopup);
          starMarker.addTo(layersRef.current.hotspotPlume);
        });
      }

      // 5. Render Hot Spot (HS) Double Concentric Ring Epicenter (Matching Image Legend)
      const hsMarkerHtml = `
        <div style="position:relative; width:40px; height:40px; cursor:pointer; transform:translate(-50%, -50%);">
          <!-- Pulse wave -->
          <div style="
            position:absolute; inset:-4px;
            border-radius:50%;
            background:rgba(234, 179, 8, 0.4);
            animation:pulseMarker 1.8s infinite ease-out;
          "></div>
          <!-- Outer gold/tan ring -->
          <div style="
            position:absolute; inset:0;
            border-radius:50%;
            background:#fef08a;
            border:3px solid #ca8a04;
            box-shadow:0 0 16px rgba(202,138,4,0.65);
            display:flex; align-items:center; justify-content:center;
          ">
            <!-- Inner white/blue ring with red HS text -->
            <div style="
              width:22px; height:22px;
              border-radius:50%;
              background:white;
              border:2px solid #2563eb;
              display:flex; align-items:center; justify-content:center;
            ">
              <span style="color:#dc2626; font-size:10px; font-weight:900; font-family:'Plus Jakarta Sans',sans-serif; letter-spacing:-0.5px;">HS</span>
            </div>
          </div>
        </div>
      `;
      const hsIcon = L.divIcon({
        className: "",
        html: hsMarkerHtml,
        iconAnchor: [0, 0]
      });
      const hsMarker = L.marker(centerCoord, { icon: hsIcon });
      const hsPopupHtml = `
        <div style="font-family:'Plus Jakarta Sans',sans-serif; width:220px;">
          <div style="background:#ca8a04; color:white; padding:8px 10px; font-size:11px; font-weight:900; border-radius:8px 8px 0 0; display:flex; align-items:center; gap:5px;">
            <span>🎯 HOT SPOT (HS) EPICENTER</span>
          </div>
          <div style="padding:10px; background:white; border-radius:0 0 8px 8px; font-size:10px; line-height:1.45;">
            <div style="margin-bottom:4px;"><b>Location:</b> ${hotspotPoint.locationName || "Selected Hotspot"}</div>
            <div style="margin-bottom:4px;"><b>Coordinates:</b> ${hotspotPoint.lat.toFixed(4)}, ${hotspotPoint.lng.toFixed(4)}</div>
            ${
              hotspotPoint.val !== undefined && !isNaN(hotspotPoint.val)
                ? `<div style="margin-bottom:4px;"><b>Hotspot Level:</b> <span style="color:#dc2626; font-weight:900;">${hotspotPoint.val} ${hotspotPlumeResult.unit}</span></div>`
                : ""
            }
            <div style="margin-top:6px; padding-top:6px; border-top:1px solid #f1f5f9; color:#64748b; font-size:9px;">
              Encircled with ${hotspotPlumeResult.radiusKm.toFixed(1)} km Buffer Zone and 4×4 Grid of ${hotspotPlumeResult.gridCellSizeKm.toFixed(1)} km × ${hotspotPlumeResult.gridCellSizeKm.toFixed(1)} km Squares.
            </div>
          </div>
        </div>
      `;
      hsMarker.bindPopup(hsPopupHtml);
      hsMarker.addTo(layersRef.current.hotspotPlume);

      // 6. Dominant Plume Spread Vector Arrow
      if (
        showPlumeVectorArrow &&
        hotspotPlumeResult.dominantDirection &&
        hotspotPlumeResult.dominantDirection.totalCount > 0
      ) {
        const dom = hotspotPlumeResult.dominantDirection;
        const arrowDist = hotspotPlumeResult.radiusKm * 0.9;
        const tipPt = turf.destination(
          turf.point([hotspotPoint.lng, hotspotPoint.lat]),
          arrowDist,
          dom.midBearing,
          { units: "kilometers" }
        );
        const tipCoords = tipPt.geometry.coordinates;

        const arrowLine = L.polyline(
          [
            centerCoord,
            [tipCoords[1], tipCoords[0]]
          ],
          {
            color: "#dc2626",
            weight: 4.5,
            dashArray: "8, 4"
          }
        );
        arrowLine.addTo(layersRef.current.hotspotPlume);

        const arrowBadgeIcon = L.divIcon({
          className: "",
          html: `<div style="
            background: #dc2626; color: white;
            padding: 3.5px 8px; border-radius: 8px;
            font-size: 9.5px; font-weight: 900;
            border: 2px solid white;
            box-shadow: 0 4px 14px rgba(220,38,38,0.7);
            white-space: nowrap;
            transform: translate(-50%, -50%);
            display: flex; align-items: center; gap: 4px;
            letter-spacing: 0.03em;
          ">
            <span>🚨 SPREAD: ${dom.direction} (${dom.midBearing}°)</span>
          </div>`,
          iconAnchor: [0, 0]
        });
        L.marker([tipCoords[1], tipCoords[0]], { icon: arrowBadgeIcon }).addTo(
          layersRef.current.hotspotPlume
        );
      }
    } catch (err) {
      console.warn("renderHotspotPlume error:", err);
    }
  }, [
    showHotspotPlume,
    hotspotPoint,
    hotspotPlumeResult,
    showBufferCircle,
    showGridCells,
    showStarMarkers,
    showDimensionLabels,
    showPlumeVectorArrow,
    selectedCellHighlight,
    selectedDirectionHighlight
  ]);

  // Export Hotspot Plume Directional Spread Excel Report
  const exportPlumeReport = useCallback(() => {
    if (!hotspotPlumeResult || !hotspotPoint) {
      showToast?.("No active hotspot plume analysis to export", "warning");
      return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Directional Spread Summary
    const summaryRows = hotspotPlumeResult.directionalStats.map((s) => ({
      Direction: s.direction,
      "Compass Label": s.label,
      "Bearing Range (deg)": `${s.bearingRange[0]}° - ${s.bearingRange[1]}°`,
      "Mid Bearing": `${s.midBearing}°`,
      "Wells in Inner 2km Core": s.innerCount,
      "Wells in Outer 5km Zone": s.outerCount,
      "Total Wells": s.totalCount,
      [`Average ${activeParam} (${hotspotPlumeResult.unit})`]: s.totalCount > 0 ? s.avgVal.toFixed(2) : "No Data",
      [`Max ${activeParam} (${hotspotPlumeResult.unit})`]: s.totalCount > 0 ? s.maxVal.toFixed(2) : "-",
      [`Min ${activeParam} (${hotspotPlumeResult.unit})`]: s.totalCount > 0 ? s.minVal.toFixed(2) : "-",
      "Exceedance Count": s.exceedanceCount,
      "Exceedance Rate (%)": `${s.exceedanceRate.toFixed(1)}%`,
      "Plume Migration Index": s.migrationIndex.toFixed(1),
      "Plume Spread Risk": s.riskLevel
    }));

    const headerRows = [
      { Direction: "HOT SPOT BUFFER (5 KM) & 2 KM GRID POLLUTION SPREAD REPORT" },
      { Direction: `Parameter: ${activeParam} (Desirable Limit: ${hotspotPlumeResult.baselineLimit} ${hotspotPlumeResult.unit})` },
      { Direction: `Hot Spot (HS) Location: ${hotspotPoint.locationName || "Selected"} (${hotspotPoint.lat.toFixed(5)}, ${hotspotPoint.lng.toFixed(5)})` },
      { Direction: `Buffer Circle: ${hotspotPlumeResult.radiusKm.toFixed(1)} km Radius | Grid: 4x4 Cells (${hotspotPlumeResult.gridCellSizeKm.toFixed(1)} km x ${hotspotPlumeResult.gridCellSizeKm.toFixed(1)} km each)` },
      { Direction: `Dominant Dispersion: ${hotspotPlumeResult.dominantDirection ? `${hotspotPlumeResult.dominantDirection.label} (${hotspotPlumeResult.dominantDirection.direction})` : "None"}` },
      { Direction: `Highest Contaminated Cell: ${hotspotPlumeResult.highestContaminatedCell ? `${hotspotPlumeResult.highestContaminatedCell.label} (Avg: ${hotspotPlumeResult.highestContaminatedCell.avgVal.toFixed(2)} ${hotspotPlumeResult.unit})` : "None"}` },
      { Direction: `Verdict: ${hotspotPlumeResult.verdict}` },
      {}
    ];

    const plumeSummaryWs = XLSX.utils.json_to_sheet([...headerRows, ...summaryRows]);
    ensureSheetJSNumbers(plumeSummaryWs, 1);
    XLSX.utils.book_append_sheet(wb, plumeSummaryWs, "Plume_Summary");

    // Sheet 2: 16 Grid Cells (2km x 2km) Detailed Stats
    const cellRows = hotspotPlumeResult.gridCells.map((c) => ({
      "Cell ID": c.id,
      "Cell Name": c.label,
      Row: c.row + 1,
      Col: c.col + 1,
      Quadrant: c.directionCode,
      "Distance from HS (km)": Number(c.distFromHS.toFixed(2)),
      "Well Count": c.count,
      [`Average ${activeParam} (${hotspotPlumeResult.unit})`]: c.count > 0 ? Number(c.avgVal.toFixed(2)) : "No Data",
      "Max Value": c.count > 0 ? Number(c.maxVal.toFixed(2)) : "-",
      "Min Value": c.count > 0 ? Number(c.minVal.toFixed(2)) : "-",
      "Exceedance Count": c.exceedanceCount,
      "Exceedance (%)": `${c.exceedanceRate.toFixed(1)}%`,
      "Pollution Status": c.riskLevel
    }));
    const cellsWs = XLSX.utils.json_to_sheet(cellRows);
    ensureSheetJSNumbers(cellsWs, 1);
    XLSX.utils.book_append_sheet(wb, cellsWs, "16_Grid_Cells_2km");

    // Sheet 3: Sampling Locations (Orange Stars)
    const wellRows = hotspotPlumeResult.samplingLocations.map((pt) => ({
      Location: pt.Location || pt.Village || pt.District || `Sample #${pt._index + 1}`,
      Latitude: typeof pt._lat === "number" ? pt._lat : (parseFloat(String(pt._lat)) || pt._lat),
      Longitude: typeof pt._lon === "number" ? pt._lon : (parseFloat(String(pt._lon)) || pt._lon),
      [activeParam]: typeof pt._val === "number" ? pt._val : (parseFloat(String(pt._val)) || pt._val),
      Unit: hotspotPlumeResult.unit,
      "Distance from HS (km)": Number(pt._dist.toFixed(2)),
      Bearing: `${pt._bearing.toFixed(1)}°`,
      "Within 2km Core": pt._isInner ? "YES" : "NO (In Outer Buffer Zone)"
    }));
    const wellsWs = XLSX.utils.json_to_sheet(wellRows);
    ensureSheetJSNumbers(wellsWs, 1);
    XLSX.utils.book_append_sheet(wb, wellsWs, "Sampling_Locations_Stars");

    XLSX.writeFile(
      wb,
      `HotSpot_5kmBuffer_2kmGrid_${activeParam}_${new Date().toISOString().split("T")[0]}.xlsx`
    );
    showToast?.("Exported Hotspot 5km Buffer & 2km Grid Report", "success");
  }, [hotspotPlumeResult, hotspotPoint, activeParam, showToast]);

  // Run Sector / Ring / Rectangular Grid Analysis calculation (High Performance direct geometry)
  const runAnalysis = useCallback(() => {
    try {
      const map = mapRef.current;
      if (!map) {
        layersRef.current.polys.clearLayers();
        layersRef.current.labels.clearLayers();
        setActiveSectorData([]);
        return;
      }

      if (analysisMode === "sector" && (!centerPoint || radii.length === 0)) {
        layersRef.current.polys.clearLayers();
        layersRef.current.labels.clearLayers();
        setActiveSectorData([]);
        return;
      }

    layersRef.current.polys.clearLayers();
    layersRef.current.labels.clearLayers();

    if (!columnMap.lat || !columnMap.lon) return;

    let angleInput = parseFloat(String(sectorAngle));
    if (isNaN(angleInput) || angleInput <= 0) angleInput = 45;

    const center = centerPoint ? turf.point(centerPoint) : null;
    const clipLayers = shapefileLayers.filter((l) => l.isFilter);

    // 1. Fast single pass to extract valid points with distance and bearing
    let points: any[] = [];
    for (let i = 0; i < currentFilteredData.length; i++) {
      const d = currentFilteredData[i];
      if (!d._hasCoords) continue;
      const val = d._val;
      if (isNaN(val)) continue;

      const rangeMatch = getRangeMatch(val);
      if (rangeMatch && rangeMatch.visible === false) continue;

      const pt = turf.point([d._lon, d._lat], { ...d, _val: val });
      if (center) {
        pt.properties._dist = turf.distance(center, pt, { units: "kilometers" });
        let b = turf.bearing(center, pt);
        if (b < 0) b += 360;
        pt.properties._bearing = b;
      }
      points.push(pt);
    }

    // 2. Pre-combine clip features outside the loop to eliminate O(N^2) polygon operations
    let preCombinedClipPoly: any = null;
    let hasClipBoundary = false;

    if (clipToBoundary && clipLayers.length > 0) {
      const activePolys: any[] = [];
      clipLayers.forEach((layer) => {
        const feats = layer.features.filter((f) => f.isSelected);
        feats.forEach((f) => {
          if (autoRestrictOrigin && center && centerPoint) {
            if (
              centerPoint[0] >= f.bbox[0] &&
              centerPoint[0] <= f.bbox[2] &&
              centerPoint[1] >= f.bbox[1] &&
              centerPoint[1] <= f.bbox[3] &&
              turf.booleanPointInPolygon(center, f.poly)
            ) {
              activePolys.push(f.poly);
            }
          } else {
            activePolys.push(f.poly);
          }
        });
      });

      if (activePolys.length === 1) {
        preCombinedClipPoly = activePolys[0];
        hasClipBoundary = true;
      } else if (activePolys.length > 1) {
        try {
          preCombinedClipPoly = turf.combine(turf.featureCollection(activePolys)).features[0];
          hasClipBoundary = true;
        } catch {
          preCombinedClipPoly = activePolys[0];
          hasClipBoundary = true;
        }
      }

      const clipBBox = preCombinedClipPoly ? turf.bbox(preCombinedClipPoly) : null;
      if (autoRestrictOrigin && preCombinedClipPoly && clipBBox) {
        points = points.filter((p: any) => {
          const coords = p.geometry.coordinates;
          const lng = coords[0];
          const lat = coords[1];
          if (lng < clipBBox[0] || lng > clipBBox[2] || lat < clipBBox[1] || lat > clipBBox[3]) {
            return false;
          }
          return turf.booleanPointInPolygon(p, preCombinedClipPoly);
        });
      }
    }

    const clipBBox = preCombinedClipPoly ? turf.bbox(preCombinedClipPoly) : null;

    // -------------------------------------------------------------
    // Rectangular Grid-Wise Analysis Mode
    // -------------------------------------------------------------
    if (analysisMode === "grid") {
      let minLon = Infinity;
      let maxLon = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;

      if (gridScope === "origin_extent" && center && centerPoint) {
        const spanKm = radii.length > 0 ? Math.max(...radii) : 10;
        const northPt = turf.destination(center, spanKm, 0, { units: "kilometers" });
        const southPt = turf.destination(center, spanKm, 180, { units: "kilometers" });
        const eastPt = turf.destination(center, spanKm, 90, { units: "kilometers" });
        const westPt = turf.destination(center, spanKm, 270, { units: "kilometers" });
        minLat = southPt.geometry.coordinates[1];
        maxLat = northPt.geometry.coordinates[1];
        minLon = westPt.geometry.coordinates[0];
        maxLon = eastPt.geometry.coordinates[0];
      } else {
        for (let i = 0; i < points.length; i++) {
          const coords = points[i].geometry.coordinates;
          if (coords[0] < minLon) minLon = coords[0];
          if (coords[0] > maxLon) maxLon = coords[0];
          if (coords[1] < minLat) minLat = coords[1];
          if (coords[1] > maxLat) maxLat = coords[1];
        }

        if (minLon === Infinity || maxLon === -Infinity) {
          if (centerPoint) {
            minLon = centerPoint[0] - 0.15;
            maxLon = centerPoint[0] + 0.15;
            minLat = centerPoint[1] - 0.15;
            maxLat = centerPoint[1] + 0.15;
          } else {
            setActiveSectorData([]);
            return;
          }
        } else {
          const lonPad = Math.max((maxLon - minLon) * 0.04, 0.01);
          const latPad = Math.max((maxLat - minLat) * 0.04, 0.01);
          minLon -= lonPad;
          maxLon += lonPad;
          minLat -= latPad;
          maxLat += latPad;
        }
      }

      const meanLat = (minLat + maxLat) / 2;
      const safeWidthKm = Math.max(0.1, gridCellWidthKm || 2.0);
      const safeHeightKm = Math.max(0.1, gridCellHeightKm || 2.0);
      const latStepDeg = safeHeightKm / 110.574;
      const lonStepDeg = safeWidthKm / (111.320 * Math.cos((meanLat * Math.PI) / 180));

      const totalRows = Math.min(50, Math.max(1, Math.ceil((maxLat - minLat) / latStepDeg)));
      const totalCols = Math.min(50, Math.max(1, Math.ceil((maxLon - minLon) / lonStepDeg)));

      const newGridSectors: SectorAnalysisData[] = [];

      // Pre-bucket points in O(N) single pass into grid cells
      const gridBuckets = new Map<string, any[]>();
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const coords = p.geometry.coordinates;
        const lng = coords[0];
        const lat = coords[1];
        if (lng >= minLon && lng <= maxLon && lat >= minLat && lat <= maxLat) {
          const c = Math.min(totalCols - 1, Math.max(0, Math.floor((lng - minLon) / lonStepDeg)));
          const r = Math.min(totalRows - 1, Math.max(0, Math.floor((lat - minLat) / latStepDeg)));
          const key = `${r}_${c}`;
          const bucket = gridBuckets.get(key);
          if (bucket) {
            bucket.push(p.properties);
          } else {
            gridBuckets.set(key, [p.properties]);
          }
        }
      }

      for (let r = 0; r < totalRows; r++) {
        const cellMinLat = minLat + r * latStepDeg;
        const cellMaxLat = Math.min(maxLat, cellMinLat + latStepDeg);

        for (let c = 0; c < totalCols; c++) {
          const cellPoints = gridBuckets.get(`${r}_${c}`) || [];
          if (hideEmptySectors && cellPoints.length === 0) continue;

          const cellMinLon = minLon + c * lonStepDeg;
          const cellMaxLon = Math.min(maxLon, cellMinLon + lonStepDeg);

          let cellPoly: any = turf.polygon([
            [
              [cellMinLon, cellMinLat],
              [cellMaxLon, cellMinLat],
              [cellMaxLon, cellMaxLat],
              [cellMinLon, cellMaxLat],
              [cellMinLon, cellMinLat]
            ]
          ]);

          let areaSqKm = safeWidthKm * safeHeightKm;

          if (hasClipBoundary && preCombinedClipPoly && clipBBox) {
            const sBox = turf.bbox(cellPoly);
            if (
              sBox[0] > clipBBox[2] ||
              sBox[2] < clipBBox[0] ||
              sBox[1] > clipBBox[3] ||
              sBox[3] < clipBBox[1]
            ) {
              continue;
            }
            cellPoly = safeIntersect(cellPoly, preCombinedClipPoly);
            if (!cellPoly) continue;
            areaSqKm = turf.area(cellPoly) / 1000000;
          }

          const cellId = `Grid_R${r + 1}_C${c + 1}`;
          let avg = 0;
          let color = "rgba(203, 213, 225, 0.15)";
          let min = 0;
          let max = 0;
          let unit = SECTOR_PARAM_CONFIG[activeParam]?.unit || "";

          if (cellPoints.length > 0) {
            const vals = cellPoints.map((p) => p._val);
            avg = vals.reduce((s, v) => s + v, 0) / vals.length;
            min = Math.min(...vals);
            max = Math.max(...vals);
            const rangeMatch = getRangeMatch(avg);
            if (rangeMatch) {
              color = rangeMatch.color;
              unit = rangeMatch.unit || unit;
            }
          }

          const polyLayer = L.geoJSON(cellPoly, {
            style: {
              fillColor: color,
              fillOpacity: 0.65,
              stroke: true,
              color: labelFormat.sector.matchFill ? color : labelFormat.sector.borderColor,
              weight: labelFormat.sector.weight,
              opacity: 0.85,
              dashArray: "3, 3"
            }
          }).addTo(layersRef.current.polys);

          polyLayer.on("click", () => {
            const subStatusRows = customRanges
              .map((range, i) => {
                const count = cellPoints.filter((p) =>
                  i === customRanges.length - 1
                    ? p._val >= range.min && p._val <= range.max
                    : p._val >= range.min && p._val < range.max
                ).length;
                const perc = cellPoints.length > 0 ? ((count / cellPoints.length) * 100).toFixed(1) : 0;
                return `
                  <div style="display:flex; align-items:center; justify-content:space-between; padding:5px 0; border-bottom:1px solid #f1f5f9;">
                    <div style="display:flex; align-items:center; gap:6px;">
                      <div style="width:10px; height:10px; border-radius:50%; background:${range.color};"></div>
                      <span style="font-size:11px; font-weight:700; color:#334155;">${range.label}</span>
                    </div>
                    <span style="font-size:11px; font-weight:800; color:#0f172a;">${count} <small style="color:#64748b; font-weight:normal;">(${perc}%)</small></span>
                  </div>
                `;
              })
              .join("");

            const popupContent = `
              <div style="width:260px; font-family:'Plus Jakarta Sans', sans-serif;">
                <div style="background:#0284c7; color:white; padding:10px 14px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; border-radius:12px 12px 0 0;">
                  Rectangular Grid Cell: ${cellId}
                </div>
                <div style="padding:12px; background:white; border-radius:0 0 12px 12px;">
                  <div style="display:flex; justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
                    <div>
                      <div style="font-size:9px; text-transform:uppercase; font-weight:900; color:#94a3b8;">Average (${activeParam})</div>
                      <div style="font-size:13px; font-weight:800; color:#0284c7;">${avg > 0 ? avg.toFixed(2) : "0"} ${unit}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-size:9px; text-transform:uppercase; font-weight:900; color:#94a3b8;">Samples in Cell</div>
                      <div style="font-size:13px; font-weight:800; color:#0f172a;">${cellPoints.length}</div>
                    </div>
                  </div>
                  <div style="font-size:9px; text-transform:uppercase; font-weight:900; color:#64748b; margin-bottom:4px;">Status Breakdown</div>
                  ${subStatusRows}
                  <div style="margin-top:10px; padding-top:8px; border-top:1px solid #f1f5f9; font-size:9px; color:#94a3b8; font-style:italic;">
                    Grid Dimensions: ${safeWidthKm} km × ${safeHeightKm} km | Area: ${areaSqKm.toFixed(2)} km²
                  </div>
                </div>
              </div>
            `;
            polyLayer.bindPopup(popupContent).openPopup();
          });

          if (showLabelId || showLabelAvg || showLabelCount || showLabelArea) {
            const centerLng = (cellMinLon + cellMaxLon) / 2;
            const centerLat = (cellMinLat + cellMaxLat) / 2;
            let labelHtml = `<div style="
              background: rgba(255, 255, 255, 0.95);
              backdrop-filter: blur(4px);
              border-radius: 6px;
              border: 1px solid rgba(14, 165, 233, 0.35);
              box-shadow: 0 2px 8px rgba(0,0,0,0.12);
              padding: 2px 5px;
              text-align: center;
              line-height: 1.2;
              white-space: nowrap;
              transform: translate(-50%, -50%);
              font-family: 'Plus Jakarta Sans', sans-serif;
            ">`;

            if (showLabelId) {
              labelHtml += `<div style="color:${labelFormat.id.color}; font-size:${labelFormat.id.size}px; font-weight:900;">R${r + 1}C${c + 1}</div>`;
            }
            if (showLabelAvg) {
              labelHtml += `<div style="color:${labelFormat.avg.color}; font-size:${labelFormat.avg.size}px;">Avg: <b style="font-weight:900">${cellPoints.length > 0 ? avg.toFixed(1) : "0"}</b></div>`;
            }
            if (showLabelCount) {
              labelHtml += `<div style="color:${labelFormat.count.color}; font-size:${labelFormat.count.size}px; font-weight:700;">n=${cellPoints.length}</div>`;
            }
            if (showLabelArea) {
              labelHtml += `<div style="color:${labelFormat.area.color}; font-size:${labelFormat.area.size}px; opacity:0.85; font-style:italic;">${areaSqKm.toFixed(1)} km²</div>`;
            }
            labelHtml += `</div>`;

            const icon = L.divIcon({
              className: "",
              html: labelHtml,
              iconAnchor: [0, 0]
            });
            L.marker([centerLat, centerLng], { icon, interactive: false }).addTo(layersRef.current.labels);
          }

          newGridSectors.push({
            id: cellId,
            ring: `Row ${r + 1}`,
            angle: `Col ${c + 1}`,
            area: areaSqKm,
            points: cellPoints,
            avg,
            min,
            max,
            count: cellPoints.length,
            unit
          });
        }
      }

      setActiveSectorData(newGridSectors);
      return;
    }

    // -------------------------------------------------------------
    // Radial Rings & Annular Sectors Mode
    // -------------------------------------------------------------
    const sortedRadii = [...radii].sort((a, b) => a - b);
    const newActiveSectors: SectorAnalysisData[] = [];

    // Pre-bucket points into annular sectors in O(N) single pass
    const sectorBuckets = new Map<string, any[]>();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const d = p.properties._dist;
      let b = p.properties._bearing;
      if (typeof d !== "number" || typeof b !== "number") continue;
      if (b < 0) b += 360;
      let matchedRIdx = -1;
      for (let rIdx = 0; rIdx < sortedRadii.length; rIdx++) {
        const innerRadius = rIdx === 0 ? 0 : sortedRadii[rIdx - 1];
        const outerRadius = sortedRadii[rIdx];
        if (innerRadius === 0 ? d <= outerRadius : d > innerRadius && d <= outerRadius) {
          matchedRIdx = rIdx;
          break;
        }
      }
      if (matchedRIdx === -1) continue;
      const angleSlot = angleInput >= 360 ? 0 : Math.floor(b / angleInput) * angleInput;
      const key = `${matchedRIdx}_${angleSlot}`;
      const bucket = sectorBuckets.get(key);
      if (bucket) {
        bucket.push(p.properties);
      } else {
        sectorBuckets.set(key, [p.properties]);
      }
    }

    // 3. Ultra-fast annular sector loop using createAnnularSector
    for (let rIdx = 0; rIdx < sortedRadii.length; rIdx++) {
      const innerRadius = rIdx === 0 ? 0 : sortedRadii[rIdx - 1];
      const outerRadius = sortedRadii[rIdx];

      for (let start = 0; start < 360; start += angleInput) {
        let end = start + angleInput;
        if (end > 360 || 360 - end < 0.001) end = 360;

        const cellPoints = sectorBuckets.get(`${rIdx}_${start}`) || [];
        if (hideEmptySectors && cellPoints.length === 0) {
          if (end >= 360) break;
          continue;
        }

        // Instant mathematical polygon generation (< 0.05ms)
        let finalCell: any = createAnnularSector(center, innerRadius, outerRadius, start, end, 24);

        if (!finalCell) {
          if (end >= 360) break;
          continue;
        }

        const theoreticalArea =
          Math.PI * (Math.pow(outerRadius, 2) - Math.pow(innerRadius, 2)) * ((end - start) / 360);
        let areaSqKm = theoreticalArea;

        // Single boundary intersection with bbox pre-check
        if (hasClipBoundary && preCombinedClipPoly && clipBBox) {
          const sBox = turf.bbox(finalCell);
          if (
            sBox[0] > clipBBox[2] ||
            sBox[2] < clipBBox[0] ||
            sBox[1] > clipBBox[3] ||
            sBox[3] < clipBBox[1]
          ) {
            finalCell = null;
          } else {
            finalCell = safeIntersect(finalCell, preCombinedClipPoly);
            if (finalCell) {
              const clippedTurfArea = turf.area(finalCell) / 1000000;
              areaSqKm = Math.min(theoreticalArea, clippedTurfArea);
            }
          }
        }

        if (!finalCell) {
          if (end >= 360) break;
          continue;
        }

        const cellId =
          end - start >= 360 ? `Ring_${innerRadius}-${outerRadius}` : `R${outerRadius}_A${Math.round(start)}`;
        let avg = 0;
        let color = "rgba(203, 213, 225, 0.15)";
        let min = 0;
        let max = 0;
        let unit = SECTOR_PARAM_CONFIG[activeParam]?.unit || "";

        if (cellPoints.length > 0) {
          const vals = cellPoints.map((p) => p._val);
          avg = vals.reduce((s, v) => s + v, 0) / vals.length;
          min = Math.min(...vals);
          max = Math.max(...vals);
          const rangeMatch = getRangeMatch(avg);
          if (rangeMatch) {
            color = rangeMatch.color;
            unit = rangeMatch.unit || unit;
          }
        }

        const polyLayer = L.geoJSON(finalCell, {
          style: {
            fillColor: color,
            fillOpacity: 0.7,
            stroke: true,
            color: labelFormat.sector.matchFill ? color : labelFormat.sector.borderColor,
            weight: labelFormat.sector.weight,
            opacity: 0.75
          }
        }).addTo(layersRef.current.polys);

        // Click popup on sector
        polyLayer.on("click", (e) => {
          const subStatusRows = customRanges
            .map((range, i) => {
              const count = cellPoints.filter((p) =>
                i === customRanges.length - 1
                  ? p._val >= range.min && p._val <= range.max
                  : p._val >= range.min && p._val < range.max
              ).length;
              const perc = cellPoints.length > 0 ? ((count / cellPoints.length) * 100).toFixed(1) : 0;
              return `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:5px 0; border-bottom:1px solid #f1f5f9;">
                  <div style="display:flex; align-items:center; gap:6px;">
                    <div style="width:10px; height:10px; border-radius:50%; background:${range.color};"></div>
                    <span style="font-size:11px; font-weight:700; color:#334155;">${range.label}</span>
                  </div>
                  <span style="font-size:11px; font-weight:800; color:#0f172a;">${count} <small style="color:#64748b; font-weight:normal;">(${perc}%)</small></span>
                </div>
              `;
            })
            .join("");

          const popupContent = `
            <div style="width:260px; font-family:'Plus Jakarta Sans', sans-serif;">
              <div style="background:#1e293b; color:white; padding:10px 14px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; border-radius:12px 12px 0 0;">
                Concentric Details: ${cellId}
              </div>
              <div style="padding:12px; background:white; border-radius:0 0 12px 12px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
                  <div>
                    <div style="font-size:9px; text-transform:uppercase; font-weight:900; color:#94a3b8;">Average (${activeParam})</div>
                    <div style="font-size:13px; font-weight:800; color:#4f46e5;">${avg > 0 ? avg.toFixed(2) : "0"} ${unit}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:9px; text-transform:uppercase; font-weight:900; color:#94a3b8;">Total Samples</div>
                    <div style="font-size:13px; font-weight:800; color:#0f172a;">${cellPoints.length}</div>
                  </div>
                </div>
                <div style="font-size:9px; text-transform:uppercase; font-weight:900; color:#64748b; margin-bottom:4px;">Status Breakdown</div>
                ${subStatusRows}
                <div style="margin-top:10px; padding-top:8px; border-top:1px solid #f1f5f9; font-size:9px; color:#94a3b8; font-style:italic;">
                  Ring Range: ${innerRadius}km to ${outerRadius}km | Area: ${areaSqKm.toFixed(2)} km²
                </div>
              </div>
            </div>
          `;

          L.popup({ offset: [0, -10] })
            .setLatLng(e.latlng)
            .setContent(popupContent)
            .openOn(map);
        });

        // Centroid stat label
        if (showLabelId || showLabelAvg || showLabelCount || showLabelArea) {
          try {
            const centroid = turf.centroid(finalCell);
            const labelPos = centroid.geometry.coordinates;

            let labelHtml = `<div style="
              background: rgba(255, 255, 255, 0.95);
              backdrop-filter: blur(4px);
              padding: 5px 8px;
              border-radius: 8px;
              border: 1px solid rgba(79, 70, 229, 0.3);
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              text-align: center;
              line-height: 1.3;
              white-space: nowrap;
              transform: translate(-50%, -50%);
              font-family: 'Plus Jakarta Sans', sans-serif;
            ">`;

            if (showLabelId) {
              labelHtml += `<div style="color:${labelFormat.id.color}; font-size:${labelFormat.id.size}px; font-weight:900;">ID: ${cellId}</div>`;
            }
            if (showLabelAvg) {
              labelHtml += `<div style="color:${labelFormat.avg.color}; font-size:${labelFormat.avg.size}px;">Avg: <b style="font-weight:900">${cellPoints.length > 0 ? avg.toFixed(1) : "0"}</b> <small style="font-size:0.8em">${unit}</small></div>`;
            }
            if (showLabelCount) {
              labelHtml += `<div style="color:${labelFormat.count.color}; font-size:${labelFormat.count.size}px; font-weight:700;">Samples: <b style="font-weight:900">${cellPoints.length}</b></div>`;
            }
            if (showLabelArea) {
              labelHtml += `<div style="color:${labelFormat.area.color}; font-size:${labelFormat.area.size}px; opacity:0.85; font-style:italic;">${areaSqKm.toFixed(1)} km²</div>`;
            }

            labelHtml += `</div>`;

            const labelIcon = L.divIcon({
              className: "",
              html: labelHtml
            });

            L.marker([labelPos[1], labelPos[0]], { icon: labelIcon, interactive: false }).addTo(
              layersRef.current.labels
            );
          } catch (e) {
            // Ignore centroid issues
          }
        }

        newActiveSectors.push({
          id: cellId,
          ring: `${innerRadius}-${outerRadius}`,
          angle: `${Math.round(start)}-${Math.round(end)}`,
          area: areaSqKm,
          points: cellPoints,
          avg,
          min,
          max,
          count: cellPoints.length,
          unit
        });

        if (end >= 360) break;
      }
    }

    setActiveSectorData(newActiveSectors);
    } catch (err) {
      console.warn("runAnalysis error:", err);
    }
  }, [
    centerPoint,
    radii,
    sectorAngle,
    columnMap.lat,
    columnMap.lon,
    activeParam,
    currentFilteredData,
    shapefileLayers,
    clipToBoundary,
    autoRestrictOrigin,
    hideEmptySectors,
    getRangeMatch,
    showLabelId,
    showLabelAvg,
    showLabelCount,
    showLabelArea,
    labelFormat,
    analysisMode,
    gridCellWidthKm,
    gridCellHeightKm,
    gridScope
  ]);

  // Non-blocking debounced analysis runner to ensure silky-smooth 60fps UI
  useEffect(() => {
    if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
    setIsAnalyzing(true);
    analysisTimerRef.current = setTimeout(() => {
      runAnalysis();
      setIsAnalyzing(false);
    }, 60);

    return () => {
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
    };
  }, [runAnalysis]);

  // Add / remove rings
  const addRingFromInput = () => {
    const num = parseFloat(newRingInput);
    if (!isNaN(num) && num > 0 && !radii.includes(num)) {
      setRadii((prev) => [...prev, num].sort((a, b) => a - b));
      setNewRingInput("");
    }
  };

  const removeRing = (index: number) => {
    setRadii((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Add / remove tiers
  const addNewRange = () => {
    setCustomRanges((prev) => {
      const lastMax = prev.length > 0 ? prev[prev.length - 1].max : 0;
      const lastUnit = prev.length > 0 ? prev[prev.length - 1].unit : "";
      return [
        ...prev,
        {
          min: Number((lastMax + 0.001).toFixed(3)),
          max: Number((lastMax + 100).toFixed(3)),
          label: `Tier ${prev.length + 1}`,
          color: "#6366f1",
          unit: lastUnit,
          visible: true
        }
      ];
    });
  };

  const removeRange = (index: number) => {
    if (customRanges.length <= 1) return;
    setCustomRanges((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Locate User (GPS)
  const locateUser = () => {
    if (!navigator.geolocation) {
      showToast?.("Geolocation is not supported by your browser.", "warning");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenterPoint([pos.coords.longitude, pos.coords.latitude]);
        mapRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 12);
        showToast?.("Center pinned to your current GPS location", "success");
      },
      (err) => {
        showToast?.("Unable to retrieve your location: " + err.message, "error");
      }
    );
  };

  // Synchronize from parent spreadsheet uploaded in the main app
  const syncFromParentData = (useFiltered: boolean = true) => {
    const source =
      useFiltered && filteredRawData && filteredRawData.length > 0
        ? filteredRawData
        : initialRawData && initialRawData.length > 0
        ? initialRawData
        : allRawData;
    if (!source || source.length === 0) {
      showToast?.("No records found in main uploaded sheet. Please upload a spreadsheet first.", "warning");
      return;
    }

    setIsLocalUpload(false);
    setLocalData(source);

    const cols = Array.from(new Set(source.flatMap((r) => Object.keys(r))));
    const detectedCoords = findCoordinateColumns(cols, source);
    const latKey = detectedCoords.lat || initialHeaders?.latitude || "";
    const lonKey = detectedCoords.lon || initialHeaders?.longitude || "";

    const newParamMap: Record<string, string> = {};
    Object.keys(SECTOR_PARAM_CONFIG).forEach((pk) => {
      newParamMap[pk] = findParamColumn(pk, cols, initialHeaderMap);
    });

    setColumnMap({
      lat: latKey,
      lon: lonKey,
      params: newParamMap
    });

    if (latKey && lonKey) {
      let sumLat = 0;
      let sumLon = 0;
      let count = 0;
      const validPoints: [number, number][] = [];

      source.forEach((r) => {
        const lat = parseCoord(r[latKey]);
        const lon = parseCoord(r[lonKey]);
        if (!isNaN(lat) && !isNaN(lon)) {
          sumLat += lat;
          sumLon += lon;
          count++;
          validPoints.push([lat, lon]);
        }
      });

      if (count > 0) {
        const avgLat = sumLat / count;
        const avgLon = sumLon / count;
        setCenterPoint([avgLon, avgLat]);
        if (mapRef.current) {
          if (validPoints.length > 1) {
            mapRef.current.fitBounds(L.latLngBounds(validPoints), { padding: [50, 50], maxZoom: 13 });
          } else {
            mapRef.current.setView([avgLat, avgLon], 10);
          }
        }
      }
    }

    showToast?.(
      `📥 Successfully synced ${source.length.toLocaleString()} samples from original uploaded sheet!`,
      "success"
    );
  };

  // Ultra-Fast Excel & CSV Upload Pipeline
  const handleFastExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const startTime = performance.now();

    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      let data: any[] = [];

      if (isCsv) {
        const text = await file.text();
        const wb = XLSX.read(text, { type: "string", dense: true });
        const sheetName = wb.SheetNames[0];
        data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: true });
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(arrayBuffer), {
          type: "array",
          dense: true,
          cellFormula: false,
          cellHTML: false,
          cellText: false,
          cellDates: false
        });
        const sheetName = wb.SheetNames[0];
        data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: true });
      }

      if (!data || data.length === 0) {
        showToast?.("Uploaded sheet contains no data rows.", "warning");
        setIsUploading(false);
        e.target.value = "";
        return;
      }

      const elapsed = Math.round(performance.now() - startTime);
      setIsLocalUpload(true);
      setLocalData(data);

      if (setParentRawData) {
        setParentRawData(data);
      }

      const cols = Array.from(new Set(data.flatMap((r) => Object.keys(r))));
      const detectedCoords = findCoordinateColumns(cols, data);

      if (setParentHeaders && detectedCoords.lat && detectedCoords.lon) {
        setParentHeaders((prev) => ({
          ...prev,
          latitude: detectedCoords.lat,
          longitude: detectedCoords.lon
        }));
      }

      const newParamMap: Record<string, string> = {};
      Object.keys(SECTOR_PARAM_CONFIG).forEach((pk) => {
        newParamMap[pk] = findParamColumn(pk, cols, initialHeaderMap);
      });

      setColumnMap({
        lat: detectedCoords.lat,
        lon: detectedCoords.lon,
        params: newParamMap
      });

      // Fit map to new coordinates
      if (detectedCoords.lat && detectedCoords.lon) {
        let sumLat = 0;
        let sumLon = 0;
        let count = 0;
        const validPoints: [number, number][] = [];

        data.forEach((row) => {
          const lat = parseCoord(row[detectedCoords.lat]);
          const lon = parseCoord(row[detectedCoords.lon]);
          if (!isNaN(lat) && !isNaN(lon)) {
            sumLat += lat;
            sumLon += lon;
            count++;
            validPoints.push([lat, lon]);
          }
        });

        if (count > 0) {
          const avgLat = sumLat / count;
          const avgLon = sumLon / count;
          setCenterPoint([avgLon, avgLat]);
          if (mapRef.current) {
            if (validPoints.length > 1) {
              mapRef.current.fitBounds(L.latLngBounds(validPoints), { padding: [50, 50], maxZoom: 13 });
            } else {
              mapRef.current.setView([avgLat, avgLon], 10);
            }
          }
        }
      }

      showToast?.(
        `⚡ High-Speed parsed ${data.length.toLocaleString()} records in ${elapsed}ms! Lat: "${detectedCoords.lat || "None"}", Lon: "${detectedCoords.lon || "None"}"`,
        "success"
      );
    } catch (err: any) {
      console.error("Fast Excel upload error:", err);
      showToast?.("Failed to parse file: " + (err.message || "Unknown error"), "error");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  // Upload Shapefile / Boundary File
  const handleShapefileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      let geojson: any;
      let mainFileName = files[0].name;

      if (files.length === 1) {
        const file = files[0];
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith(".zip")) {
          const buffer = await file.arrayBuffer();
          geojson = await shp(buffer);
        } else if (fileName.endsWith(".geojson") || fileName.endsWith(".json")) {
          const text = await file.text();
          geojson = JSON.parse(text);
        } else if (fileName.endsWith(".shp") || fileName.endsWith(".shx") || fileName.endsWith(".dbf")) {
          showToast?.(
            "For raw shapefiles, please select ALL linked files together (.shp, .shx, .dbf, .prj) at once or upload a .zip",
            "warning"
          );
          e.target.value = "";
          return;
        } else {
          showToast?.("Please upload a valid .zip, .geojson, or linked shapefile components.", "warning");
          return;
        }
      } else {
        const shpFile = Array.from(files).find((f) => f.name.toLowerCase().endsWith(".shp"));
        if (shpFile) mainFileName = shpFile.name;

        const zip = new JSZip();
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const arrayBuffer = await file.arrayBuffer();
          zip.file(file.name, arrayBuffer);
        }
        const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
        geojson = await shp(zipBuffer);
      }

      if (Array.isArray(geojson)) {
        geojson = turf.featureCollection(geojson.flatMap((g: any) => g.features || [g]));
      }

      addBoundaryLayer(geojson, mainFileName);
      showToast?.(`Boundary layer ${mainFileName} loaded successfully`, "success");
    } catch (err: any) {
      console.error("Boundary parsing error", err);
      showToast?.(
        "Error processing boundary file. Ensure at least .shp, .shx, and .dbf files are included.",
        "error"
      );
    }
    e.target.value = "";
  };

  const addBoundaryLayer = (geojson: any, name: string) => {
    const id = "layer_" + Date.now();
    const color = LAYER_COLORS[colorIndexRef.current % LAYER_COLORS.length];
    colorIndexRef.current++;

    const bbox = turf.bbox(geojson) as [number, number, number, number];
    const features: BoundaryFeatureItem[] = [];
    let fIndex = 0;

    turf.flattenEach(geojson, (currentFeature: any) => {
      if (
        currentFeature.geometry &&
        (currentFeature.geometry.type === "Polygon" || currentFeature.geometry.type === "MultiPolygon")
      ) {
        const fBox = turf.bbox(currentFeature) as [number, number, number, number];
        features.push({
          poly: currentFeature,
          name: getFeatureName(currentFeature, ++fIndex),
          bbox: fBox,
          isSelected: true,
          color
        });
      }
    });

    features.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const newLayer: BoundaryLayerItem = {
      id,
      name,
      geojson,
      bbox,
      features,
      isVisible: true,
      isFilter: true,
      color,
      isExpanded: false,
      mapLayer: null
    };

    setShapefileLayers((prev) => [...prev, newLayer]);

    if (setSharedLayers) {
      setSharedLayers((prev) => [
        ...prev,
        {
          id,
          name,
          geoJson: geojson,
          visible: true,
          fillColor: color,
          strokeColor: color,
          strokeWidth: 2,
          fillOpacity: 0.1,
          showLabels: false,
          labelKey: "",
          labelColor: "#1e293b",
          labelSize: 11
        }
      ]);
    }

    // Fit map bounds
    if (mapRef.current) {
      mapRef.current.fitBounds([
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]]
      ]);
    }
  };

  // Toggle boundary layer features
  const toggleFeatureSelect = (layerId: string, featureIndex: number, isChecked: boolean) => {
    setShapefileLayers((prev) =>
      prev.map((l) => {
        if (l.id !== layerId) return l;
        const nextFeatures = [...l.features];
        nextFeatures[featureIndex] = { ...nextFeatures[featureIndex], isSelected: isChecked };
        return { ...l, features: nextFeatures };
      })
    );
  };

  const toggleAllFeatures = (layerId: string, isChecked: boolean) => {
    setShapefileLayers((prev) =>
      prev.map((l) => {
        if (l.id !== layerId) return l;
        return {
          ...l,
          features: l.features.map((f) => ({ ...f, isSelected: isChecked }))
        };
      })
    );
  };

  const toggleLayerVisibility = (id: string) => {
    setShapefileLayers((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const nextVis = !l.isVisible;
        if (l.mapLayer && mapRef.current) {
          if (nextVis) {
            mapRef.current.addLayer(l.mapLayer);
          } else {
            mapRef.current.removeLayer(l.mapLayer);
          }
        }
        return { ...l, visible: nextVis, isVisible: nextVis };
      })
    );
  };

  const toggleLayerFilter = (id: string) => {
    setShapefileLayers((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        return { ...l, isFilter: !l.isFilter };
      })
    );
  };

  const deleteLayer = (id: string) => {
    setShapefileLayers((prev) => {
      const target = prev.find((l) => l.id === id);
      if (target?.mapLayer && mapRef.current) {
        mapRef.current.removeLayer(target.mapLayer);
      }
      return prev.filter((l) => l.id !== id);
    });
  };

  // Export shapefile feature stats
  const exportLayerStats = (layerId: string) => {
    const layer = shapefileLayers.find((l) => l.id === layerId);
    if (!layer) return;

    const valKey = columnMap.params[activeParam];
    const latKey = columnMap.lat;
    const lonKey = columnMap.lon;

    if (!latKey || !lonKey) {
      showToast?.("Please ensure Latitude and Longitude columns are mapped first.", "warning");
      return;
    }

    const baseData = localData.filter((d) =>
      Object.entries(filters).every(([k, vSet]) => vSet.size === 0 || vSet.has(String(d[k] || "")))
    );

    const results = layer.features
      .filter((f) => f.isSelected)
      .map((f) => {
        let count = 0;
        let sum = 0;
        let min = Infinity;
        let max = -Infinity;

        baseData.forEach((d) => {
          const lat = parseCoord(d[latKey]);
          const lon = parseCoord(d[lonKey]);
          const rawVal = d[valKey];
          const val = parseWaterValue(rawVal);

          if (isNaN(lat) || isNaN(lon)) return;
          if (lon < f.bbox[0] || lon > f.bbox[2] || lat < f.bbox[1] || lat > f.bbox[3]) return;

          if (turf.booleanPointInPolygon(turf.point([lon, lat]), f.poly)) {
            count++;
            if (!isNaN(val)) {
              sum += val;
              if (val < min) min = val;
              if (val > max) max = val;
            }
          }
        });

        return {
          "Shape Feature Name": f.name,
          "Total Samples Found": count,
          Parameter: activeParam,
          "Average Value": count > 0 && sum > 0 ? Number((sum / count).toFixed(3)) : "No Data",
          "Min Value": count > 0 && min !== Infinity ? Number(min.toFixed(3)) : "-",
          "Max Value": count > 0 && max !== -Infinity ? Number(max.toFixed(3)) : "-"
        };
      });

    if (results.length === 0) {
      showToast?.("No features are currently selected in this layer.", "warning");
      return;
    }

    const wb = XLSX.utils.book_new();
    const statsWs = XLSX.utils.json_to_sheet(results);
    ensureSheetJSNumbers(statsWs, 1);
    XLSX.utils.book_append_sheet(wb, statsWs, "Shape_Feature_Stats");
    XLSX.writeFile(wb, `Shapefile_Stats_${layer.name}_${activeParam}.xlsx`);
    showToast?.(`Exported stats for ${layer.name}`, "success");
  };

  // Export Advanced Report Multi-Sheet Excel
  const exportAdvancedReport = () => {
    if (activeSectorData.length === 0) {
      showToast?.("No active sectors to export. Run analysis first.", "warning");
      return;
    }

    const wb = XLSX.utils.book_new();

    const summaryData = activeSectorData.map((s) => ({
      "Sector/Ring ID": s.id,
      "Ring (km)": typeof s.ring === "number" ? s.ring : (parseFloat(String(s.ring)) || s.ring),
      "Angle Range": s.angle,
      Samples: s.count,
      Average: Number(s.avg.toFixed(3)),
      Min: Number(s.min.toFixed(3)),
      Max: Number(s.max.toFixed(3)),
      Unit: s.unit,
      "Area (sq km)": Number(s.area.toFixed(4))
    }));
    const summaryWs = XLSX.utils.json_to_sheet(summaryData);
    ensureSheetJSNumbers(summaryWs, 1);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Analysis_Summary");

    activeSectorData
      .filter((s) => s.count > 0)
      .forEach((sector) => {
        const statSheetName = `STAT_${sector.id}`.replace(/[^a-zA-Z0-9_]/g, "").substring(0, 31);
        const distributionRows = customRanges.map((range, i) => {
          const countInRange = sector.points.filter((pt) =>
            i === customRanges.length - 1
              ? pt._val >= range.min && pt._val <= range.max
              : pt._val >= range.min && pt._val < range.max
          ).length;
          return {
            "Range Name": range.label,
            Limits: `${range.min} - ${range.max}`,
            Unit: range.unit,
            "No. of Samples": countInRange,
            "Percentage (%)":
              (sector.count > 0 ? ((countInRange / sector.count) * 100).toFixed(2) : "0") + "%"
          };
        });

        const combinedRows = [
          { Metric: "Identifier", Value: sector.id },
          { Metric: "Ring Span", Value: sector.ring + " km" },
          { Metric: "Total Samples", Value: sector.count },
          { Metric: "Average", Value: sector.avg.toFixed(3) + " " + sector.unit },
          { Metric: "Area (sq km)", Value: Number(sector.area.toFixed(4)) },
          {},
          ...distributionRows
        ];

        const secWs = XLSX.utils.json_to_sheet(combinedRows);
        ensureSheetJSNumbers(secWs, 1);
        XLSX.utils.book_append_sheet(wb, secWs, statSheetName);
      });

    XLSX.writeFile(
      wb,
      `Advanced_Concentric_Report_${activeParam}_${new Date().toISOString().split("T")[0]}.xlsx`
    );
    showToast?.(`Exported Advanced Concentric Report for ${activeParam}`, "success");
  };

  // Quick fit map to points
  const fitMapToPoints = () => {
    if (layersRef.current.wells.getLayers().length > 0 && mapRef.current) {
      const group = L.featureGroup(layersRef.current.wells.getLayers());
      mapRef.current.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-140px)] min-h-[640px] rounded-3xl overflow-hidden shadow-2xl border border-slate-200 bg-slate-900 select-none">
      {/* Map Container */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full ${isDrawing ? "cursor-crosshair ring-4 ring-indigo-500 ring-inset" : ""}`}
      />

      {/* Crosshair Drawing Toast Indicator */}
      {isDrawing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] bg-slate-900/95 text-white px-5 py-2.5 rounded-full border border-indigo-400 shadow-2xl flex items-center gap-2.5 text-xs font-black uppercase tracking-wider backdrop-blur-md animate-pulse">
          <Crosshair className="w-4 h-4 text-indigo-400 animate-spin" />
          <span>Click on the map to set origin center point</span>
          <button
            onClick={() => setIsDrawing(false)}
            className="ml-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md text-[10px]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Hotspot Picking Toast Indicator */}
      {isPickingHotspot && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] bg-slate-900/95 text-white px-5 py-2.5 rounded-full border border-rose-400 shadow-2xl flex items-center gap-2.5 text-xs font-black uppercase tracking-wider backdrop-blur-md animate-pulse">
          <Target className="w-4 h-4 text-rose-400 animate-spin" />
          <span>Click on map or well to set Contamination Hotspot (2 km Ring & Outer Square will calculate spread)</span>
          <button
            onClick={() => setIsPickingHotspot(false)}
            className="ml-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md text-[10px]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floating Top Quick-Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] hidden lg:flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-xl border border-slate-200">
        <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider flex items-center gap-1">
          <Compass className="w-3.5 h-3.5 text-indigo-600" />
          Sector Pro:
        </span>

        {/* Quick Parameter Select */}
        <select
          value={activeParam}
          onChange={(e) => setActiveParam(e.target.value)}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl px-2.5 py-1 border border-slate-200 outline-none cursor-pointer"
        >
          {Object.keys(SECTOR_PARAM_CONFIG).map((p) => (
            <option key={p} value={p}>
              {p} ({SECTOR_PARAM_CONFIG[p].unit || "unitless"})
            </option>
          ))}
        </select>

        {/* Spatial Mode Switcher: Radial vs Grid */}
        <div className="flex bg-slate-100 rounded-xl p-0.5 border border-slate-200">
          <button
            onClick={() => setAnalysisMode("sector")}
            className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 ${
              analysisMode === "sector"
                ? "bg-indigo-600 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-200"
            }`}
            title="Radial Concentric Rings & Angular Sectors"
          >
            <PieChart className="w-3 h-3" />
            <span>Radial</span>
          </button>
          <button
            onClick={() => setAnalysisMode("grid")}
            className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 ${
              analysisMode === "grid"
                ? "bg-sky-600 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-200"
            }`}
            title="Rectangular Grid-Wise Analysis with custom cell area"
          >
            <Grid className="w-3 h-3" />
            <span>Grid-Wise</span>
          </button>
        </div>

        {/* Quick Angle Buttons (Radial Mode) or Grid Area Presets (Grid Mode) */}
        {analysisMode === "sector" ? (
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-0.5 border border-slate-200">
            {[30, 45, 60, 90, 360].map((deg) => (
              <button
                key={deg}
                onClick={() => setSectorAngle(deg)}
                className={`px-2 py-0.5 text-[10px] font-black rounded-lg transition-all ${
                  sectorAngle === deg
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
                title={deg === 360 ? "Full Concentric Rings (360°)" : `${deg}° Sectors`}
              >
                {deg === 360 ? "Rings" : `${deg}°`}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-0.5 bg-sky-50 rounded-xl p-0.5 border border-sky-200">
            {[
              { label: "1 km²", w: 1, h: 1 },
              { label: "4 km²", w: 2, h: 2 },
              { label: "9 km²", w: 3, h: 3 },
              { label: "25 km²", w: 5, h: 5 },
              { label: "100 km²", w: 10, h: 10 }
            ].map((preset) => {
              const isSelected = gridCellWidthKm === preset.w && gridCellHeightKm === preset.h;
              return (
                <button
                  key={preset.label}
                  onClick={() => {
                    setGridCellWidthKm(preset.w);
                    setGridCellHeightKm(preset.h);
                  }}
                  className={`px-2 py-0.5 text-[10px] font-black rounded-lg transition-all ${
                    isSelected
                      ? "bg-sky-600 text-white shadow-2xs"
                      : "text-sky-800 hover:bg-sky-100"
                  }`}
                  title={`Rectangular Grid: ${preset.w} km × ${preset.h} km (${preset.w * preset.h} km²)`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Pick Center Quick Button */}
        <button
          onClick={() => setIsDrawing((p) => !p)}
          className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
            isDrawing
              ? "bg-amber-500 text-white shadow-xs animate-pulse"
              : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200"
          }`}
        >
          <MousePointer2 className="w-3 h-3" />
          <span>{isDrawing ? "Click Map..." : "Pick Center"}</span>
        </button>

        {/* Dedicated Hotspot 2km Plume Trigger Button */}
        <button
          onClick={() => {
            if (sidebarCollapsed) setSidebarCollapsed(false);
            setSidebarTab("plume");
            if (!hotspotPoint) {
              setIsPickingHotspot(true);
            }
          }}
          className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
            showHotspotPlume && hotspotPoint
              ? "bg-rose-600 text-white shadow-xs"
              : isPickingHotspot
              ? "bg-amber-500 text-white shadow-xs animate-pulse"
              : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
          }`}
          title="Pick a pollution hotspot with 2.0 km encircled ring & outer square directional spread estimation"
        >
          <Target className="w-3 h-3 text-current" />
          <span>{isPickingHotspot ? "Pick Hotspot..." : hotspotPoint ? "🎯 2km Plume Active" : "🎯 2km Hotspot Plume"}</span>
        </button>

        {/* GPS Center */}
        <button
          onClick={locateUser}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-xl text-xs font-bold flex items-center gap-1 border border-slate-200"
          title="GPS My Location"
        >
          <Navigation className="w-3 h-3 text-indigo-600" />
          <span>GPS</span>
        </button>

        {/* Fit to Points */}
        <button
          onClick={fitMapToPoints}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-xl text-xs font-bold flex items-center gap-1 border border-slate-200"
          title="Zoom to Fit Points"
        >
          <Maximize2 className="w-3 h-3" />
          <span>Fit</span>
        </button>

        {/* Summary Badges */}
        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
          {currentFilteredData.length.toLocaleString()} Wells
        </span>
        {isAnalyzing ? (
          <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 flex items-center gap-1 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
            <span>Analyzing...</span>
          </span>
        ) : (
          <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-200">
            {activeSectorData.length} Sectors
          </span>
        )}

        {/* Export Button */}
        <button
          onClick={exportAdvancedReport}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-sm transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Excel Report</span>
        </button>
      </div>

      {/* Floating Sidebar */}
      <div
        className={`absolute top-4 left-4 z-[1000] w-[390px] sm:w-[420px] max-h-[calc(100%-32px)] bg-white/95 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] border border-slate-200 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? "-translate-x-[440px]" : "translate-x-0"
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-indigo-600 to-blue-600 rounded-xl shadow-md text-white">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-800 uppercase tracking-tight">Sector Analyst Pro</h1>
              <p className="text-[9.5px] text-slate-500 font-bold uppercase tracking-wider">
                Advanced Spatial Reporting
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              title="Collapse Sidebar"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-Tabs within Sidebar */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 p-1 gap-1">
          <button
            onClick={() => setSidebarTab("steps")}
            className={`flex-1 py-1.5 text-[9.5px] font-black uppercase tracking-wider rounded-xl transition-all ${
              sidebarTab === "steps"
                ? "bg-white text-indigo-700 shadow-xs border border-slate-200/60"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Steps
          </button>
          <button
            onClick={() => setSidebarTab("filters")}
            className={`flex-1 py-1.5 text-[9.5px] font-black uppercase tracking-wider rounded-xl transition-all ${
              sidebarTab === "filters"
                ? "bg-white text-indigo-700 shadow-xs border border-slate-200/60"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Filters
          </button>
          <button
            onClick={() => setSidebarTab("plume")}
            className={`flex-1 py-1.5 text-[9.5px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1 ${
              sidebarTab === "plume"
                ? "bg-rose-600 text-white shadow-xs"
                : hotspotPoint
                ? "bg-rose-50 text-rose-700 border border-rose-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
            title="Hotspot 2 km Encircled Ring & Outer Square Directional Spread Analysis"
          >
            <Target className="w-3 h-3 text-current" />
            <span>2km Plume</span>
          </button>
          <button
            onClick={() => setSidebarTab("stats")}
            className={`flex-1 py-1.5 text-[9.5px] font-black uppercase tracking-wider rounded-xl transition-all ${
              sidebarTab === "stats"
                ? "bg-white text-indigo-700 shadow-xs border border-slate-200/60"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Stats ({activeSectorData.length})
          </button>
        </div>

        {/* Sidebar Content Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
          {sidebarTab === "steps" && (
            <>
              {/* Step 1: Data Preparation */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Step 1: Data Source & Shape
                  </label>
                  <span
                    className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                      localData.length > 0
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {localData.length.toLocaleString()} Samples
                  </span>
                </div>

                {/* Primary Sync from Original Sheet button if main data exists */}
                {parentDataset.length > 0 && (
                  <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200/80 p-2.5 rounded-2xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                        Main App Dataset
                      </span>
                      <span className="text-[9px] font-bold text-indigo-600 bg-white px-1.5 py-0.5 rounded border border-indigo-100">
                        {isLocalUpload ? "Local file active" : "Auto-synced"}
                      </span>
                    </div>

                    {/* Active Filter Description Banner */}
                    {(!isStateAllFilter(selectedState) || !isDistrictAllFilter(selectedDistrict) || !isYearAllFilter(selectedYear) || !isSeasonAllFilter(selectedSeason)) && (
                      <div className="bg-indigo-100/70 border border-indigo-200/60 rounded-lg px-2 py-1 text-[9px] text-indigo-900 font-semibold flex items-center justify-between gap-1">
                        <span className="truncate">
                          🎯 Filtered: {[selectedState, selectedDistrict, selectedYear, selectedSeason].filter(Boolean).join(" • ")}
                        </span>
                        <span className="font-extrabold text-indigo-700 whitespace-nowrap">
                          {currentFilteredData.length.toLocaleString()} pts
                        </span>
                      </div>
                    )}

                    <button
                      onClick={() => syncFromParentData(true)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white py-1.5 px-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-xs"
                      title="Sync points matching current State, District, Year, and Season filters"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Sync Filtered Dataset ({currentFilteredData.length.toLocaleString()} Wells)</span>
                    </button>

                    {allRawData && allRawData.length > 0 && allRawData.length !== currentFilteredData.length && (
                      <button
                        onClick={() => syncFromParentData(false)}
                        className="w-full bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 py-1 px-2 rounded-lg font-bold text-[9px] flex items-center justify-center gap-1 transition-all"
                        title="Reset to all samples across India from original uploaded spreadsheet"
                      >
                        <span>Reset to Entire Dataset ({allRawData.length.toLocaleString()} samples)</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Upload Buttons */}
                <div className="flex gap-2">
                  <label
                    className={`flex-1 cursor-pointer bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 active:scale-[0.99] text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md ${
                      isUploading ? "opacity-75 pointer-events-none" : ""
                    }`}
                    title="Upload local Excel (.xlsx, .xls) or CSV with high-speed sub-second parsing"
                  >
                    {isUploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                    )}
                    <span>{isUploading ? "Parsing..." : "Upload Excel"}</span>
                    <input
                      type="file"
                      onChange={handleFastExcelUpload}
                      className="hidden"
                      accept=".xlsx, .xls, .csv"
                      disabled={isUploading}
                    />
                  </label>

                  <label className="flex-1 cursor-pointer bg-slate-800 hover:bg-slate-900 active:scale-[0.99] text-white px-3 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm">
                    <MapIcon className="w-3.5 h-3.5 text-teal-300" />
                    <span>Boundary Shape</span>
                    <input
                      type="file"
                      onChange={handleShapefileUpload}
                      className="hidden"
                      accept=".zip,.geojson,.json,.shp,.shx,.dbf,.prj"
                      multiple
                    />
                  </label>
                </div>

                {/* Quick Helper Tools */}
                {localData.length > 0 && (
                  <div className="flex items-center justify-between px-1 text-[9px] text-slate-500 font-bold">
                    <span>
                      Active: {columnMap.lat && columnMap.lon ? "📍 Coords Detected" : "⚠️ Select Coords in Step 2"}
                    </span>
                    <button
                      onClick={fitMapToPoints}
                      className="text-indigo-600 hover:underline flex items-center gap-0.5"
                    >
                      <Maximize2 className="w-2.5 h-2.5" />
                      Fit Map to Points
                    </button>
                  </div>
                )}

                {/* Multiple Boundary Layers List */}
                {shapefileLayers.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {shapefileLayers.map((layer) => (
                      <div key={layer.id} className="flex flex-col bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between p-2">
                          <div
                            className="flex items-center gap-1.5 overflow-hidden flex-1 cursor-pointer"
                            onClick={() =>
                              setShapefileLayers((prev) =>
                                prev.map((l) => (l.id === layer.id ? { ...l, isExpanded: !l.isExpanded } : l))
                              )
                            }
                          >
                            <input
                              type="color"
                              value={layer.color}
                              onChange={(e) => {
                                const newCol = e.target.value;
                                setShapefileLayers((prev) =>
                                  prev.map((l) =>
                                    l.id === layer.id
                                      ? {
                                          ...l,
                                          color: newCol,
                                          features: l.features.map((f) => ({ ...f, color: newCol }))
                                        }
                                      : l
                                  )
                                );
                              }}
                              className="w-3.5 h-3.5 rounded cursor-pointer border-none bg-transparent p-0 shrink-0"
                            />
                            <span className="text-[10px] font-black text-slate-800 truncate" title={layer.name}>
                              {layer.name}
                            </span>
                            <span className="text-[9px] text-slate-400 font-bold">({layer.features.length})</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleLayerVisibility(layer.id)}
                              className={`p-1 rounded hover:bg-slate-200 ${layer.isVisible ? "text-indigo-600" : "text-slate-300"}`}
                              title="Toggle Visibility"
                            >
                              {layer.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => toggleLayerFilter(layer.id)}
                              className={`p-1 rounded hover:bg-slate-200 ${layer.isFilter ? "text-emerald-600" : "text-slate-300"}`}
                              title="Use as Spatial Clip Boundary"
                            >
                              <Scissors className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteLayer(layer.id)}
                              className="p-1 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500"
                              title="Remove Layer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {layer.isExpanded && (
                          <div className="border-t border-slate-200 bg-white p-2 space-y-2">
                            <button
                              onClick={() => exportLayerStats(layer.id)}
                              className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 border border-indigo-200"
                            >
                              <Download className="w-3 h-3" />
                              <span>Export Feature Stats</span>
                            </button>
                            <div className="flex justify-between items-center text-[9px] font-bold text-slate-500">
                              <span>Sub-Features</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => toggleAllFeatures(layer.id, true)}
                                  className="text-indigo-600 hover:underline"
                                >
                                  All
                                </button>
                                <button
                                  onClick={() => toggleAllFeatures(layer.id, false)}
                                  className="text-slate-500 hover:underline"
                                >
                                  None
                                </button>
                              </div>
                            </div>
                            <div className="max-h-28 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                              {layer.features.map((f, i) => (
                                <label
                                  key={i}
                                  className="flex items-center gap-1.5 p-1 rounded hover:bg-slate-50 cursor-pointer text-[9.5px]"
                                >
                                  <input
                                    type="checkbox"
                                    checked={f.isSelected}
                                    onChange={(e) => toggleFeatureSelect(layer.id, i, e.target.checked)}
                                    className="w-3 h-3 accent-indigo-600 rounded"
                                  />
                                  <span className="truncate flex-1 font-medium text-slate-700">{f.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 2: Map Columns */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-2.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                  Step 2: Map Columns
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase block mb-0.5">Latitude</label>
                    <select
                      value={columnMap.lat}
                      onChange={(e) => setColumnMap((p) => ({ ...p, lat: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                    >
                      <option value="">-- Select --</option>
                      {availableColumns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase block mb-0.5">Longitude</label>
                    <select
                      value={columnMap.lon}
                      onChange={(e) => setColumnMap((p) => ({ ...p, lon: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                    >
                      <option value="">-- Select --</option>
                      {availableColumns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase block mb-0.5">
                    Data Column for <span className="text-indigo-600">{activeParam}</span>
                  </label>
                  <select
                    value={columnMap.params[activeParam] || ""}
                    onChange={(e) =>
                      setColumnMap((p) => ({
                        ...p,
                        params: { ...p.params, [activeParam]: e.target.value }
                      }))
                    }
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                  >
                    <option value="">-- Select Column --</option>
                    {availableColumns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Step 3: Origin & Points */}
              <div className="bg-indigo-600 text-white p-3.5 rounded-2xl shadow-lg space-y-2.5">
                <label className="text-[10px] font-black text-white/70 uppercase tracking-widest block">
                  Step 3: Origin Center
                </label>
                <div className="flex gap-1.5">
                  <button
                    onClick={locateUser}
                    className="flex-1 bg-white text-indigo-700 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 hover:bg-indigo-50 shadow-xs"
                    title="Pin center to your current device GPS location"
                  >
                    <Navigation className="w-3 h-3" />
                    <span>GPS</span>
                  </button>
                  <button
                    onClick={() => {
                      if (currentFilteredData.length > 0 && columnMap.lat && columnMap.lon) {
                        let sumLat = 0;
                        let sumLon = 0;
                        let count = 0;
                        const validPts: [number, number][] = [];
                        currentFilteredData.forEach((d) => {
                          const lat = parseCoord(d[columnMap.lat]);
                          const lon = parseCoord(d[columnMap.lon]);
                          if (!isNaN(lat) && !isNaN(lon)) {
                            sumLat += lat;
                            sumLon += lon;
                            count++;
                            validPts.push([lat, lon]);
                          }
                        });
                        if (count > 0) {
                          const avgLat = sumLat / count;
                          const avgLon = sumLon / count;
                          setCenterPoint([avgLon, avgLat]);
                          mapRef.current?.setView([avgLat, avgLon], 11);
                          showToast?.(`Origin centered on centroid of ${count} sample wells`, "success");
                        }
                      } else {
                        showToast?.("No valid coordinates available to calculate centroid", "warning");
                      }
                    }}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-400 text-white py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs"
                    title="Snap center to the average location (centroid) of all sample points"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>Centroid</span>
                  </button>
                  <button
                    onClick={() => setIsDrawing((p) => !p)}
                    className={`flex-1 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs transition-all ${
                      isDrawing
                        ? "bg-amber-400 text-amber-950 animate-pulse"
                        : "bg-indigo-500 hover:bg-indigo-400 text-white"
                    }`}
                    title="Click any position directly on the map to set origin"
                  >
                    <MousePointer2 className="w-3 h-3" />
                    <span>{isDrawing ? "Click..." : "Pick"}</span>
                  </button>
                </div>
                <div className="flex justify-between text-[10px] text-white/90 font-mono font-bold px-1 pt-1 border-t border-white/10">
                  <div>Lat: {centerPoint ? centerPoint[1].toFixed(5) : "--"}</div>
                  <div>Lng: {centerPoint ? centerPoint[0].toFixed(5) : "--"}</div>
                </div>

                {/* 2km Hotspot Plume Quick Launch */}
                <div className="pt-2 mt-2 border-t border-white/15 bg-indigo-700/60 -mx-1 px-2.5 py-2 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-rose-200 flex items-center gap-1">
                      <Target className="w-3 h-3 text-rose-300" />
                      2km Hotspot & Outer Square Plume
                    </span>
                    {hotspotPoint && (
                      <span className="text-[8px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full uppercase">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => {
                        setIsPickingHotspot(true);
                        setSidebarTab("plume");
                      }}
                      className="flex-1 bg-white hover:bg-rose-50 text-rose-700 font-black text-[9px] uppercase tracking-wider py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all shadow-xs"
                    >
                      <Target className="w-3 h-3 text-rose-600" />
                      <span>Pick Hotspot</span>
                    </button>
                    <button
                      onClick={autoDetectMaxHotspot}
                      className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-black text-[9px] uppercase tracking-wider py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all shadow-xs"
                      title="Auto-detect maximum contaminated sample point"
                    >
                      <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
                      <span>Auto-Max</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 4: Ring & Sector / Grid Config */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Step 4: {analysisMode === "sector" ? "Radial & Sector Config" : "Rectangular Grid Config"}
                  </label>
                  <button
                    onClick={() => runAnalysis()}
                    disabled={isAnalyzing}
                    className="text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-200 transition-all cursor-pointer"
                    title="Force immediate recalculation of spatial geometry and chemistry statistics"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-600" />
                    ) : (
                      <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                    )}
                    <span>{isAnalyzing ? "Computing..." : "Run Analysis"}</span>
                  </button>
                </div>

                {/* Mode Selector Tabs */}
                <div className="grid grid-cols-2 gap-1 bg-slate-200/70 p-1 rounded-xl">
                  <button
                    onClick={() => setAnalysisMode("sector")}
                    className={`py-1.5 text-[9.5px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      analysisMode === "sector"
                        ? "bg-white text-indigo-700 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <PieChart className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Radial Rings</span>
                  </button>
                  <button
                    onClick={() => setAnalysisMode("grid")}
                    className={`py-1.5 text-[9.5px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      analysisMode === "grid"
                        ? "bg-sky-600 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" />
                    <span>Grid-Wise</span>
                  </button>
                </div>

                {analysisMode === "sector" ? (
                  <>
                    {/* Radial Rings */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-500 uppercase">Radial Rings (km)</span>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.5"
                            placeholder="KM"
                            value={newRingInput}
                            onChange={(e) => setNewRingInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addRingFromInput()}
                            className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] font-bold outline-none"
                          />
                          <button
                            onClick={addRingFromInput}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded-lg text-[9px] font-black uppercase"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 p-2 bg-white rounded-xl border border-dashed border-slate-200 min-h-[32px]">
                        {radii.map((r, i) => (
                          <div
                            key={r}
                            className="flex items-center bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-0.5 gap-1.5 text-indigo-700 text-[10px] font-bold shadow-2xs"
                          >
                            <span>{r} km</span>
                            <button onClick={() => removeRing(i)} className="text-indigo-400 hover:text-rose-500">
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sector Angle & Parameter */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">
                          Sector Angle (°)
                        </label>
                        <input
                          type="number"
                          value={sectorAngle}
                          min="1"
                          max="360"
                          onChange={(e) => setSectorAngle(parseFloat(e.target.value) || 45)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">
                          Target Parameter
                        </label>
                        <select
                          value={activeParam}
                          onChange={(e) => setActiveParam(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                        >
                          {Object.keys(SECTOR_PARAM_CONFIG).map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Rectangular Grid Area Presets */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-500 uppercase">
                          Grid Cell Area Presets
                        </span>
                        <span className="text-[9.5px] font-black text-sky-700 bg-sky-100 px-2 py-0.5 rounded-md">
                          {(gridCellWidthKm * gridCellHeightKm).toFixed(2)} km² / cell
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { label: "1 km²", w: 1, h: 1 },
                          { label: "4 km²", w: 2, h: 2 },
                          { label: "9 km²", w: 3, h: 3 },
                          { label: "16 km²", w: 4, h: 4 },
                          { label: "25 km²", w: 5, h: 5 },
                          { label: "100 km²", w: 10, h: 10 }
                        ].map((preset) => {
                          const isSelected = gridCellWidthKm === preset.w && gridCellHeightKm === preset.h;
                          return (
                            <button
                              key={preset.label}
                              onClick={() => {
                                setGridCellWidthKm(preset.w);
                                setGridCellHeightKm(preset.h);
                              }}
                              className={`py-1 px-1.5 text-[9.5px] font-black rounded-lg transition-all border ${
                                isSelected
                                  ? "bg-sky-600 text-white border-sky-700 shadow-2xs"
                                  : "bg-white text-slate-700 border-slate-200 hover:bg-sky-50"
                              }`}
                            >
                              <span>{preset.label}</span>
                              <span className="block text-[8px] opacity-80">({preset.w}×{preset.h}km)</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom Width & Height Inputs */}
                    <div className="bg-sky-50/70 border border-sky-200/80 p-2.5 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-sky-900 uppercase tracking-wider">
                          Custom Cell Dimensions (km)
                        </span>
                        <span className="text-[8.5px] font-bold text-sky-600 font-mono">
                          W: {gridCellWidthKm}km × H: {gridCellHeightKm}km
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[8.5px] font-bold text-slate-500 uppercase block mb-0.5">
                            Cell Width (km)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0.2"
                            max="50"
                            value={gridCellWidthKm}
                            onChange={(e) => setGridCellWidthKm(Math.max(0.2, parseFloat(e.target.value) || 1))}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[8.5px] font-bold text-slate-500 uppercase block mb-0.5">
                            Cell Height (km)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0.2"
                            max="50"
                            value={gridCellHeightKm}
                            onChange={(e) => setGridCellHeightKm(Math.max(0.2, parseFloat(e.target.value) || 1))}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Grid Scope & Target Parameter */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">
                          Grid Scope
                        </label>
                        <select
                          value={gridScope}
                          onChange={(e) => setGridScope(e.target.value as any)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                        >
                          <option value="data_bounds">Data Wells Bounds</option>
                          <option value="origin_extent">Origin Extent</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">
                          Target Parameter
                        </label>
                        <select
                          value={activeParam}
                          onChange={(e) => setActiveParam(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                        >
                          {Object.keys(SECTOR_PARAM_CONFIG).map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {/* Toggles */}
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideEmptySectors}
                      onChange={(e) => setHideEmptySectors(e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded"
                    />
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Hide Empty Sectors</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideMissingData}
                      onChange={(e) => setHideMissingData(e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded"
                    />
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Hide Missing Data</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clipToBoundary}
                      onChange={(e) => setClipToBoundary(e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded"
                    />
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Clip to Boundary</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRestrictOrigin}
                      onChange={(e) => setAutoRestrictOrigin(e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded"
                    />
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Isolate Origin Shape</span>
                  </label>
                </div>

                {/* Sector Stats to Display */}
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                      Sector Stats to Display
                    </span>
                    <button
                      onClick={() => setShowLabelFormatPanel((p) => !p)}
                      className="text-[8px] font-black text-indigo-600 hover:underline flex items-center gap-0.5"
                    >
                      <Palette className="w-2.5 h-2.5" />
                      <span>{showLabelFormatPanel ? "Hide Format" : "Format"}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showLabelId}
                        onChange={(e) => setShowLabelId(e.target.checked)}
                        className="w-3 h-3 accent-indigo-600 rounded"
                      />
                      <span className="text-[9px] font-bold text-slate-600 uppercase">Sector ID</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showLabelAvg}
                        onChange={(e) => setShowLabelAvg(e.target.checked)}
                        className="w-3 h-3 accent-indigo-600 rounded"
                      />
                      <span className="text-[9px] font-bold text-slate-600 uppercase">Avg Value</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showLabelCount}
                        onChange={(e) => setShowLabelCount(e.target.checked)}
                        className="w-3 h-3 accent-indigo-600 rounded"
                      />
                      <span className="text-[9px] font-bold text-slate-600 uppercase">Samples</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showLabelArea}
                        onChange={(e) => setShowLabelArea(e.target.checked)}
                        className="w-3 h-3 accent-indigo-600 rounded"
                      />
                      <span className="text-[9px] font-bold text-slate-600 uppercase">Area (km²)</span>
                    </label>
                  </div>

                  {/* Format Panel */}
                  {showLabelFormatPanel && (
                    <div className="pt-2 border-t border-slate-100 bg-slate-50 p-2 rounded-lg space-y-1.5">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[8px] font-black text-slate-400 uppercase">
                        <span>Label</span>
                        <span>Color</span>
                        <span>Size</span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[9px] font-bold text-slate-700">
                        <span>Sector ID</span>
                        <input
                          type="color"
                          value={labelFormat.id.color}
                          onChange={(e) =>
                            setLabelFormat((p) => ({
                              ...p,
                              id: { ...p.id, color: e.target.value }
                            }))
                          }
                          className="w-4 h-4 rounded cursor-pointer border-none bg-transparent p-0"
                        />
                        <input
                          type="number"
                          value={labelFormat.id.size}
                          onChange={(e) =>
                            setLabelFormat((p) => ({
                              ...p,
                              id: { ...p.id, size: parseInt(e.target.value) || 7 }
                            }))
                          }
                          className="w-10 border border-slate-200 rounded px-1 py-0.5 text-center bg-white"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[9px] font-bold text-slate-700">
                        <span>Avg Value</span>
                        <input
                          type="color"
                          value={labelFormat.avg.color}
                          onChange={(e) =>
                            setLabelFormat((p) => ({
                              ...p,
                              avg: { ...p.avg, color: e.target.value }
                            }))
                          }
                          className="w-4 h-4 rounded cursor-pointer border-none bg-transparent p-0"
                        />
                        <input
                          type="number"
                          value={labelFormat.avg.size}
                          onChange={(e) =>
                            setLabelFormat((p) => ({
                              ...p,
                              avg: { ...p.avg, size: parseInt(e.target.value) || 9 }
                            }))
                          }
                          className="w-10 border border-slate-200 rounded px-1 py-0.5 text-center bg-white"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[9px] font-bold text-slate-700">
                        <span>Samples</span>
                        <input
                          type="color"
                          value={labelFormat.count.color}
                          onChange={(e) =>
                            setLabelFormat((p) => ({
                              ...p,
                              count: { ...p.count, color: e.target.value }
                            }))
                          }
                          className="w-4 h-4 rounded cursor-pointer border-none bg-transparent p-0"
                        />
                        <input
                          type="number"
                          value={labelFormat.count.size}
                          onChange={(e) =>
                            setLabelFormat((p) => ({
                              ...p,
                              count: { ...p.count, size: parseInt(e.target.value) || 8 }
                            }))
                          }
                          className="w-10 border border-slate-200 rounded px-1 py-0.5 text-center bg-white"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[9px] font-bold text-slate-700">
                        <span>Area</span>
                        <input
                          type="color"
                          value={labelFormat.area.color}
                          onChange={(e) =>
                            setLabelFormat((p) => ({
                              ...p,
                              area: { ...p.area, color: e.target.value }
                            }))
                          }
                          className="w-4 h-4 rounded cursor-pointer border-none bg-transparent p-0"
                        />
                        <input
                          type="number"
                          value={labelFormat.area.size}
                          onChange={(e) =>
                            setLabelFormat((p) => ({
                              ...p,
                              area: { ...p.area, size: parseInt(e.target.value) || 8 }
                            }))
                          }
                          className="w-10 border border-slate-200 rounded px-1 py-0.5 text-center bg-white"
                        />
                      </div>

                      {/* Sector Borders */}
                      <div className="border-t border-slate-200 pt-1.5 mt-1.5 flex items-center justify-between text-[9px] font-bold text-slate-700">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={labelFormat.sector.matchFill}
                            onChange={(e) =>
                              setLabelFormat((p) => ({
                                ...p,
                                sector: { ...p.sector, matchFill: e.target.checked }
                              }))
                            }
                            className="w-3 h-3 accent-indigo-600 rounded"
                          />
                          <span>Match Fill</span>
                        </label>
                        <input
                          type="color"
                          value={labelFormat.sector.borderColor}
                          onChange={(e) =>
                            setLabelFormat((p) => ({
                              ...p,
                              sector: { ...p.sector, borderColor: e.target.value }
                            }))
                          }
                          className="w-4 h-4 rounded cursor-pointer border-none bg-transparent p-0"
                        />
                        <input
                          type="number"
                          step="0.5"
                          value={labelFormat.sector.weight}
                          onChange={(e) =>
                            setLabelFormat((p) => ({
                              ...p,
                              sector: { ...p.sector, weight: parseFloat(e.target.value) || 1 }
                            }))
                          }
                          className="w-10 border border-slate-200 rounded px-1 py-0.5 text-center bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Range Thresholds & Units Editor */}
                <div className="pt-2 border-t border-slate-200">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">
                      Range Thresholds & Units
                    </span>
                    <button
                      onClick={addNewRange}
                      className="text-[9px] font-black text-indigo-600 uppercase hover:underline"
                    >
                      + Add Tier
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {customRanges.map((r, i) => (
                      <div
                        key={i}
                        className={`flex flex-col bg-white p-2 rounded-xl border border-slate-200 shadow-2xs ${
                          r.visible === false ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <input
                            type="checkbox"
                            checked={r.visible !== false}
                            onChange={(e) =>
                              setCustomRanges((prev) =>
                                prev.map((rng, idx) => (idx === i ? { ...rng, visible: e.target.checked } : rng))
                              )
                            }
                            className="w-3 h-3 accent-indigo-600 rounded"
                          />
                          <input
                            type="color"
                            value={r.color}
                            onChange={(e) =>
                              setCustomRanges((prev) =>
                                prev.map((rng, idx) => (idx === i ? { ...rng, color: e.target.value } : rng))
                              )
                            }
                            className="w-4 h-4 rounded cursor-pointer border-none bg-transparent p-0 shrink-0"
                          />
                          <input
                            type="text"
                            value={r.label}
                            onChange={(e) =>
                              setCustomRanges((prev) =>
                                prev.map((rng, idx) => (idx === i ? { ...rng, label: e.target.value } : rng))
                              )
                            }
                            className="flex-1 text-[9px] font-bold bg-slate-50 border border-slate-100 rounded px-1"
                          />
                          <input
                            type="text"
                            value={r.unit}
                            onChange={(e) =>
                              setCustomRanges((prev) =>
                                prev.map((rng, idx) => (idx === i ? { ...rng, unit: e.target.value } : rng))
                              )
                            }
                            placeholder="Unit"
                            className="w-12 text-[8px] font-bold bg-slate-50 border border-slate-100 rounded px-1"
                          />
                          {customRanges.length > 1 && (
                            <button
                              onClick={() => removeRange(i)}
                              className="text-slate-300 hover:text-rose-500"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1 pl-4 text-[9px] font-bold text-slate-500">
                          <input
                            type="number"
                            step="0.01"
                            value={r.min}
                            onChange={(e) =>
                              setCustomRanges((prev) =>
                                prev.map((rng, idx) =>
                                  idx === i ? { ...rng, min: parseFloat(e.target.value) || 0 } : rng
                                )
                              )
                            }
                            className="flex-1 bg-slate-100 rounded py-0.5 text-center"
                          />
                          <span className="text-[8px] text-slate-400">TO</span>
                          <input
                            type="number"
                            step="0.01"
                            value={r.max}
                            onChange={(e) =>
                              setCustomRanges((prev) =>
                                prev.map((rng, idx) =>
                                  idx === i ? { ...rng, max: parseFloat(e.target.value) || 0 } : rng
                                )
                              )
                            }
                            className="flex-1 bg-slate-100 rounded py-0.5 text-center"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {sidebarTab === "filters" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Attribute Filters
                </span>
                <button
                  onClick={() => setFilters({})}
                  className="text-[9px] font-bold text-indigo-600 hover:underline"
                >
                  Reset All
                </button>
              </div>

              {filterMeta.map((fm) => {
                const uniqueVals = Array.from(
                  new Set(localData.map((d) => String(d[fm.actualKey] || "")).filter((v) => v.trim() !== ""))
                ).sort();
                const activeSet = filters[fm.actualKey] || new Set();

                return (
                  <div key={fm.actualKey} className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-black text-slate-700 uppercase">
                      <span>{fm.label}</span>
                      <span className="text-slate-400 font-normal">({uniqueVals.length})</span>
                    </div>
                    <div className="max-h-28 overflow-y-auto space-y-1 custom-scrollbar pr-1 bg-white p-1 rounded-lg border border-slate-200">
                      {uniqueVals.slice(0, 100).map((v) => (
                        <label key={v} className="flex items-center gap-1.5 cursor-pointer text-[9px] text-slate-600">
                          <input
                            type="checkbox"
                            checked={activeSet.has(v)}
                            onChange={(e) => {
                              const nextSet = new Set(activeSet);
                              if (e.target.checked) nextSet.add(v);
                              else nextSet.delete(v);
                              setFilters((prev) => ({ ...prev, [fm.actualKey]: nextSet }));
                            }}
                            className="w-3 h-3 accent-indigo-600 rounded"
                          />
                          <span className="truncate">{v}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {sidebarTab === "plume" && (
            <div className="space-y-3.5">
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-rose-600 text-white p-3 rounded-2xl shadow-md">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-amber-300" />
                    Hot Spot (HS) Buffer & 2 km Grid
                  </span>
                  <span className="text-[9px] font-mono bg-white/20 text-white px-2 py-0.5 rounded-full font-bold">
                    {activeParam}
                  </span>
                </div>
                <p className="text-[9.5px] text-white/90 leading-relaxed">
                  Select a Hot Spot (HS) epicenter. The system encircles a 5.0 km radius area and lays a 4×4 grid of 2.0 km × 2.0 km squares to calculate directional contamination spread.
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200">
                <button
                  onClick={() => setIsPickingHotspot((p) => !p)}
                  className={`py-2 px-1 rounded-xl text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                    isPickingHotspot
                      ? "bg-amber-500 text-white animate-pulse shadow-sm"
                      : "bg-white hover:bg-rose-50 text-rose-700 shadow-2xs"
                  }`}
                  title="Click anywhere on the map or well to pick hotspot"
                >
                  <MousePointer2 className="w-3 h-3 text-current" />
                  <span>{isPickingHotspot ? "Click Map..." : "Pick on Map"}</span>
                </button>
                <button
                  onClick={autoDetectMaxHotspot}
                  className="bg-white hover:bg-rose-50 text-slate-800 py-2 px-1 rounded-xl text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all shadow-2xs"
                  title="Automatically finds well with highest concentration"
                >
                  <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                  <span>Auto-Max</span>
                </button>
                <button
                  onClick={() => {
                    setHotspotPoint(null);
                    setShowHotspotPlume(false);
                    setHotspotPlumeResult(null);
                    setSelectedDirectionHighlight(null);
                    setSelectedCellHighlight(null);
                    layersRef.current.hotspotPlume.clearLayers();
                    showToast?.("Hotspot plume layer cleared", "success");
                  }}
                  className="bg-white hover:bg-slate-200 text-slate-500 hover:text-rose-600 py-2 px-1 rounded-xl text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all shadow-2xs"
                  title="Clear active hotspot"
                >
                  <Trash2 className="w-3 h-3 text-current" />
                  <span>Clear</span>
                </button>
              </div>

              {/* Active Hotspot Origin Card */}
              {hotspotPoint ? (
                <div className="bg-white border-2 border-amber-300 p-3 rounded-2xl shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] font-black uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                      {/* Double concentric circle icon matching image */}
                      <div className="w-4 h-4 rounded-full bg-yellow-200 border border-yellow-600 flex items-center justify-center shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-white border border-blue-600 flex items-center justify-center">
                          <span className="text-[5.5px] font-black text-red-600 leading-none">HS</span>
                        </div>
                      </div>
                      Hot Spot (HS) Epicenter
                    </span>
                    <button
                      onClick={() => {
                        if (mapRef.current && hotspotPoint) {
                          mapRef.current.flyTo([hotspotPoint.lat, hotspotPoint.lng], 13);
                        }
                      }}
                      className="text-[8.5px] font-black text-indigo-600 hover:underline flex items-center gap-0.5"
                    >
                      <Maximize2 className="w-2.5 h-2.5" />
                      Zoom Origin
                    </button>
                  </div>
                  <div className="space-y-1 text-slate-700">
                    <div className="font-bold text-slate-900 truncate" title={hotspotPoint.locationName}>
                      {hotspotPoint.locationName || "Custom Picked Point"}
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-slate-500">
                      <span>Lat: {hotspotPoint.lat.toFixed(5)}</span>
                      <span>Lng: {hotspotPoint.lng.toFixed(5)}</span>
                    </div>
                    {hotspotPoint.val !== undefined && !isNaN(hotspotPoint.val) && (
                      <div className="flex justify-between items-center bg-rose-50 border border-rose-100 px-2 py-1 rounded-lg">
                        <span className="text-[9px] font-bold text-rose-800">
                          {activeParam} Concentration:
                        </span>
                        <span className="text-xs font-black text-rose-600">
                          {hotspotPoint.val} {SECTOR_PARAM_CONFIG[activeParam]?.unit || ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-300 p-4 rounded-2xl text-center space-y-2">
                  <div className="w-9 h-9 rounded-full bg-yellow-100 border-2 border-yellow-500 mx-auto flex items-center justify-center shadow-xs">
                    <div className="w-5 h-5 rounded-full bg-white border border-blue-600 flex items-center justify-center">
                      <span className="text-[8px] font-black text-red-600">HS</span>
                    </div>
                  </div>
                  <div className="text-[11px] font-black uppercase text-slate-600">No Hot Spot (HS) Selected</div>
                  <p className="text-[9.5px] text-slate-400">
                    Click <b>Pick on Map</b> or <b>Auto-Max</b> above to select a contamination epicenter. The 5 km buffer circle and 2 km grid cells will generate immediately.
                  </p>
                </div>
              )}

              {/* Buffer & Grid Geometry Controls */}
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9.5px] font-black uppercase text-slate-500 tracking-wider">
                    Buffer & Grid Geometry
                  </span>
                  <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                    Extent: {(hotspotGridSizeKm * 4).toFixed(1)} km × {(hotspotGridSizeKm * 4).toFixed(1)} km
                  </span>
                </div>

                {/* Buffer Circle Radius Slider */}
                <div>
                  <div className="flex justify-between text-[9px] text-slate-600 font-bold mb-1">
                    <span>Encircled Buffer Circle Radius:</span>
                    <span className="text-[#0f4c81] font-black">{hotspotRadiusKm.toFixed(1)} km</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="1.0"
                      max="20.0"
                      step="0.5"
                      value={hotspotRadiusKm}
                      onChange={(e) => setHotspotRadiusKm(parseFloat(e.target.value) || 5.0)}
                      className="flex-1 accent-[#0f4c81] cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                    />
                    <input
                      type="number"
                      step="0.5"
                      min="1.0"
                      max="50.0"
                      value={hotspotRadiusKm}
                      onChange={(e) => setHotspotRadiusKm(parseFloat(e.target.value) || 5.0)}
                      className="w-12 bg-white border border-slate-300 rounded px-1 py-0.5 text-center text-[9px] font-bold"
                    />
                  </div>
                </div>

                {/* Grid Cell Size Slider */}
                <div>
                  <div className="flex justify-between text-[9px] text-slate-600 font-bold mb-1">
                    <span>Grid Cell Width (Square Block):</span>
                    <span className="text-blue-600 font-black">{hotspotGridSizeKm.toFixed(1)} km × {hotspotGridSizeKm.toFixed(1)} km</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.5"
                      max="5.0"
                      step="0.5"
                      value={hotspotGridSizeKm}
                      onChange={(e) => setHotspotGridSizeKm(parseFloat(e.target.value) || 2.0)}
                      className="flex-1 accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                    />
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="10.0"
                      value={hotspotGridSizeKm}
                      onChange={(e) => setHotspotGridSizeKm(parseFloat(e.target.value) || 2.0)}
                      className="w-12 bg-white border border-slate-300 rounded px-1 py-0.5 text-center text-[9px] font-bold"
                    />
                  </div>
                </div>

                {/* Layer Toggles */}
                <div className="pt-2 border-t border-slate-200 space-y-1.5 text-[9.5px]">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full border-2 border-[#0f4c81] inline-block" />
                      Show {hotspotRadiusKm.toFixed(1)} km Buffer Circle
                    </span>
                    <input
                      type="checkbox"
                      checked={showBufferCircle}
                      onChange={(e) => setShowBufferCircle(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#0f4c81] rounded cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs border-2 border-dashed border-blue-600 bg-blue-50 inline-block" />
                      Show {hotspotGridSizeKm.toFixed(1)} km Grid Cells (16 Squares)
                    </span>
                    <input
                      type="checkbox"
                      checked={showGridCells}
                      onChange={(e) => setShowGridCells(e.target.checked)}
                      className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="text-amber-500 font-black">⭐</span>
                      Show Sampling Locations (Stars)
                    </span>
                    <input
                      type="checkbox"
                      checked={showStarMarkers}
                      onChange={(e) => setShowStarMarkers(e.target.checked)}
                      className="w-3.5 h-3.5 accent-amber-600 rounded cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="font-mono text-xs text-blue-600 font-bold">↕</span>
                      Show Dimension Labels (5 km / 2 km)
                    </span>
                    <input
                      type="checkbox"
                      checked={showDimensionLabels}
                      onChange={(e) => setShowDimensionLabels(e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <ArrowUpRight className="w-3 h-3 text-red-600" />
                      Show Plume Spread Vector Arrow
                    </span>
                    <input
                      type="checkbox"
                      checked={showPlumeVectorArrow}
                      onChange={(e) => setShowPlumeVectorArrow(e.target.checked)}
                      className="w-3.5 h-3.5 accent-red-600 rounded cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Interactive 4x4 Grid Matrix & Plume Analysis Results */}
              {hotspotPlumeResult && (
                <div className="space-y-3">
                  {/* Dominant Plume Direction Verdict Card */}
                  <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-3.5 rounded-2xl shadow-lg border border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5 text-amber-400" />
                        Estimated Direction Pollution is Spreading
                      </span>
                      {hotspotPlumeResult.dominantDirection && (
                        <span
                          className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full"
                          style={{
                            background: hotspotPlumeResult.dominantDirection.color,
                            color: "white"
                          }}
                        >
                          {hotspotPlumeResult.dominantDirection.riskLevel}
                        </span>
                      )}
                    </div>

                    {hotspotPlumeResult.dominantDirection ? (
                      <div className="space-y-2">
                        <div className="flex items-baseline justify-between">
                          <div>
                            <div className="text-base font-black text-white flex items-center gap-1.5">
                              <span>🧭 {hotspotPlumeResult.dominantDirection.label}</span>
                              <span className="text-xs text-amber-300">
                                ({hotspotPlumeResult.dominantDirection.direction} · {hotspotPlumeResult.dominantDirection.midBearing}°)
                              </span>
                            </div>
                            <div className="text-[9.5px] text-slate-300">
                              Avg Concentration: <b className="text-amber-300 font-extrabold">{hotspotPlumeResult.dominantDirection.avgVal.toFixed(2)} {hotspotPlumeResult.unit}</b>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[9px] uppercase font-bold text-slate-400">Exceedance</div>
                            <div className="text-sm font-black text-rose-400">
                              {hotspotPlumeResult.dominantDirection.exceedanceRate.toFixed(0)}%
                            </div>
                          </div>
                        </div>

                        {/* Breach & Spread Status Alert */}
                        <div className="p-2 rounded-xl bg-white/10 border border-white/10 text-[9.5px] leading-relaxed">
                          {hotspotPlumeResult.verdict}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-300 italic">
                        No wells found in buffer envelope. Enlarge radius or pick closer to samples.
                      </div>
                    )}
                  </div>

                  {/* Visual 4x4 Grid Matrix Card (16 Blocks) */}
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                        <Grid className="w-3.5 h-3.5 text-blue-600" />
                        16 Grid Cells (4×4 Matrix · {hotspotGridSizeKm} km Each)
                      </span>
                      {selectedCellHighlight && (
                        <button
                          onClick={() => setSelectedCellHighlight(null)}
                          className="text-[8.5px] font-black text-rose-600 hover:underline"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                    <p className="text-[8.5px] text-slate-500">
                      Click any 2 km cell to focus and inspect that square block on the map:
                    </p>

                    {/* 4x4 Grid Matrix Container */}
                    <div className="relative grid grid-cols-4 gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200 aspect-square max-w-[280px] mx-auto shadow-inner">
                      {hotspotPlumeResult.gridCells.map((c) => {
                        const isSelected = selectedCellHighlight === c.id;
                        const isHighest = hotspotPlumeResult.highestContaminatedCell?.id === c.id;
                        return (
                          <button
                            key={c.id}
                            onClick={() => {
                              const next = selectedCellHighlight === c.id ? null : c.id;
                              setSelectedCellHighlight(next);
                              if (next && mapRef.current) {
                                const bounds = L.latLngBounds(
                                  [c.bbox[1], c.bbox[0]],
                                  [c.bbox[3], c.bbox[2]]
                                );
                                mapRef.current.flyToBounds(bounds, { maxZoom: 14, duration: 0.8 });
                              }
                            }}
                            className={`relative flex flex-col items-center justify-center p-1 rounded-lg text-center transition-all cursor-pointer ${
                              isSelected
                                ? "ring-2 ring-indigo-600 shadow-md scale-95 z-10"
                                : isHighest
                                ? "ring-2 ring-rose-500 hover:scale-102"
                                : "hover:scale-102 hover:shadow-xs"
                            }`}
                            style={{
                              backgroundColor: c.count > 0 ? c.color + "25" : "#ffffff",
                              border: `1.5px dashed ${isSelected ? "#4f46e5" : isHighest ? "#ef4444" : "#93c5fd"}`
                            }}
                            title={`${c.label} (${c.count} wells, Avg: ${c.count > 0 ? c.avgVal.toFixed(1) : "—"})`}
                          >
                            <span className="text-[7.5px] font-black text-slate-800 leading-none">
                              {c.directionCode}
                            </span>
                            <span className="text-[7px] text-amber-600 font-bold flex items-center gap-0.5 mt-0.5 leading-none">
                              ⭐ {c.count}
                            </span>
                            {c.count > 0 ? (
                              <span
                                className="text-[7.5px] font-extrabold mt-0.5 leading-none"
                                style={{ color: c.color }}
                              >
                                {c.avgVal.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-[7px] text-slate-400 mt-0.5 leading-none">
                                —
                              </span>
                            )}
                          </button>
                        );
                      })}

                      {/* Center HS Epicenter Crosshair Indicator */}
                      <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 flex items-center justify-center"
                        title="Hot Spot (HS) Epicenter"
                      >
                        <div className="w-6 h-6 rounded-full bg-yellow-200 border-2 border-yellow-600 flex items-center justify-center shadow-md">
                          <div className="w-3.5 h-3.5 rounded-full bg-white border border-blue-600 flex items-center justify-center">
                            <span className="text-[6.5px] font-black text-red-600">HS</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {selectedCellHighlight && (
                      <div className="text-[9px] bg-indigo-50 border border-indigo-200 p-2 rounded-xl text-indigo-950 flex justify-between items-center">
                        <span>Active Cell: <b>{hotspotPlumeResult.gridCells.find((c) => c.id === selectedCellHighlight)?.label}</b></span>
                        <span className="font-mono text-[8px] bg-white px-1.5 py-0.5 rounded border border-indigo-200">
                          Avg: {hotspotPlumeResult.gridCells.find((c) => c.id === selectedCellHighlight)?.avgVal.toFixed(2)} {hotspotPlumeResult.unit}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 8-Directional Compass Matrix */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] font-black uppercase text-slate-500 tracking-wider">
                        Compass Direction Matrix ({hotspotPlumeResult.directionalStats.length} Sectors)
                      </span>
                      <span className="text-[8.5px] text-slate-400">Click to highlight</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {hotspotPlumeResult.directionalStats.map((stat) => {
                        const isDominant = hotspotPlumeResult.dominantDirection?.direction === stat.direction;
                        const isSelected = selectedDirectionHighlight === stat.direction;

                        return (
                          <div
                            key={stat.direction}
                            onClick={() =>
                              setSelectedDirectionHighlight((prev) => (prev === stat.direction ? null : stat.direction))
                            }
                            className={`p-2 rounded-xl border text-[9.5px] cursor-pointer transition-all ${
                              isSelected
                                ? "ring-2 ring-indigo-500 bg-indigo-50/50 border-indigo-400 shadow-xs"
                                : isDominant
                                ? "bg-rose-50/70 border-rose-300 shadow-2xs"
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-black text-slate-800 flex items-center gap-1">
                                <span
                                  className="w-2 h-2 rounded-full inline-block"
                                  style={{ background: stat.color }}
                                />
                                {stat.direction} ({stat.midBearing}°)
                              </span>
                              <span
                                className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded"
                                style={{
                                  background: stat.color + "20",
                                  color: stat.color
                                }}
                              >
                                {stat.riskLevel === "NO_DATA" ? "EMPTY" : stat.riskLevel}
                              </span>
                            </div>

                            <div className="flex justify-between text-slate-600">
                              <span>Average:</span>
                              <b className="font-bold text-slate-900">
                                {stat.totalCount > 0 ? stat.avgVal.toFixed(1) : "—"} {stat.totalCount > 0 ? hotspotPlumeResult.unit : ""}
                              </b>
                            </div>

                            <div className="flex justify-between text-slate-500 text-[8.5px]">
                              <span>Inside 2km: <b>{stat.innerCount}</b></span>
                              <span>Outer Ring: <b className={stat.outerCount > 0 ? "text-rose-600 font-extrabold" : ""}>{stat.outerCount}</b></span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary Metric Counters */}
                  <div className="grid grid-cols-3 gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200 text-center">
                    <div>
                      <div className="text-[8.5px] uppercase font-bold text-slate-400">Total Stars (⭐)</div>
                      <div className="text-xs font-black text-slate-800">{hotspotPlumeResult.totalWellsInEnvelope}</div>
                    </div>
                    <div>
                      <div className="text-[8.5px] uppercase font-bold text-slate-400">Inside 2km Core</div>
                      <div className="text-xs font-black text-indigo-600">{hotspotPlumeResult.innerWellsCount}</div>
                    </div>
                    <div>
                      <div className="text-[8.5px] uppercase font-bold text-slate-400">Outer 5km Zone</div>
                      <div className={`text-xs font-black ${hotspotPlumeResult.outerWellsCount > 0 ? "text-rose-600" : "text-slate-800"}`}>
                        {hotspotPlumeResult.outerWellsCount}
                      </div>
                    </div>
                  </div>

                  {/* Export Hotspot Report */}
                  <button
                    onClick={exportPlumeReport}
                    className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-rose-600 hover:from-blue-700 hover:to-rose-700 text-white py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-[0.99]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Hotspot 5km Buffer & 2km Grid (XLSX)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {sidebarTab === "stats" && (
            <div className="space-y-2">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Active Sectors ({activeSectorData.length})
                </span>
                <span className="text-[9px] font-bold text-slate-400">Parameter: {activeParam}</span>
              </div>
              {activeSectorData.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No active sectors generated. Set an origin center point to compute sectors.
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
                  {activeSectorData.map((s) => (
                    <div
                      key={s.id}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 space-y-1 shadow-2xs"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-black text-indigo-700 text-xs">{s.id}</span>
                        <span className="text-[9px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          {s.area.toFixed(1)} km²
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        <div>
                          <span className="text-slate-400">Samples:</span>{" "}
                          <b className="font-bold">{s.count}</b>
                        </div>
                        <div>
                          <span className="text-slate-400">Average:</span>{" "}
                          <b className="font-bold text-indigo-600">
                            {s.count > 0 ? s.avg.toFixed(2) : "0"} {s.unit}
                          </b>
                        </div>
                        <div>
                          <span className="text-slate-400">Min:</span>{" "}
                          <b>{s.count > 0 ? s.min.toFixed(2) : "-"}</b>
                        </div>
                        <div>
                          <span className="text-slate-400">Max:</span>{" "}
                          <b>{s.count > 0 ? s.max.toFixed(2) : "-"}</b>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Footer Export */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={exportAdvancedReport}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
          >
            <Download className="w-4 h-4" />
            <span>Export Detailed Reports</span>
          </button>
        </div>
      </div>

      {/* Floating Expand Sidebar Button when collapsed */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="absolute top-4 left-4 z-[1000] bg-white/95 text-slate-800 p-3 rounded-2xl shadow-xl border border-slate-200 flex items-center gap-2 font-black text-xs uppercase tracking-wider hover:bg-slate-50 transition-all"
        >
          <Compass className="w-4 h-4 text-indigo-600" />
          <span>Sector Controls</span>
        </button>
      )}

      {/* Bottom Right Floating Map Legend */}
      <div className="absolute bottom-5 right-5 z-[1000] bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-200 min-w-[200px] max-w-[260px]">
        <div className="text-[10px] font-black uppercase text-slate-800 tracking-wider mb-2 pb-1 border-b border-slate-100 flex items-center justify-between">
          <span>{activeParam} Legend</span>
          <span className="text-[8px] text-slate-400 font-normal">
            ({SECTOR_PARAM_CONFIG[activeParam]?.unit || "-"})
          </span>
        </div>
        <div className="space-y-1.5 text-[9px] font-bold text-slate-600">
          {customRanges.map((r, i) => (
            <div
              key={i}
              className={`flex items-center justify-between gap-2 ${
                r.visible === false ? "opacity-35 line-through" : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                  style={{ background: r.color }}
                />
                <span className="truncate">{r.label}</span>
              </div>
              <span className="font-mono text-[8.5px] text-slate-400 bg-slate-50 px-1 py-0.5 rounded border border-slate-100">
                [{r.min} - {r.max >= 99999 ? "MAX" : r.max}]
              </span>
            </div>
          ))}
        </div>

        {showHotspotPlume && hotspotPoint && (
          <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1.5 text-[8.5px]">
            <div className="font-black text-slate-800 uppercase flex items-center justify-between">
              <span className="flex items-center gap-1 text-slate-800">
                <Target className="w-3 h-3 text-rose-600" />
                <span>Legend</span>
              </span>
              <span className="text-[7.5px] bg-slate-100 px-1.5 py-0.2 rounded text-slate-500 font-mono">
                5km / 2km
              </span>
            </div>

            {/* Hot Spot (HS) */}
            <div className="flex items-center gap-2 text-slate-700">
              <div className="w-4 h-4 rounded-full bg-yellow-200 border-2 border-yellow-600 flex items-center justify-center shrink-0 shadow-2xs">
                <div className="w-2.5 h-2.5 rounded-full bg-white border border-blue-600 flex items-center justify-center">
                  <span className="text-[5.5px] font-black text-red-600 leading-none">HS</span>
                </div>
              </div>
              <span className="font-bold text-slate-800">Hot Spot (HS)</span>
            </div>

            {/* Sampling Location */}
            <div className="flex items-center gap-2 text-slate-700">
              <svg width="15" height="15" viewBox="0 0 24 24" className="shrink-0 drop-shadow-2xs">
                <polygon
                  points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                  fill="#f97316"
                  stroke="#7c2d12"
                  strokeWidth="1.8"
                />
              </svg>
              <span className="font-bold text-slate-800">Sampling Location</span>
            </div>

            {/* 5 km Buffer Radius */}
            <div className="flex items-center justify-between text-slate-600 pt-0.5">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full border-2 border-[#0f4c81] bg-blue-50/20 inline-block shrink-0" />
                <span>Buffer Boundary</span>
              </span>
              <span className="font-bold text-[#0f4c81]">{hotspotRadiusKm.toFixed(1)} km</span>
            </div>

            {/* 2 km Grid Square Block */}
            <div className="flex items-center justify-between text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs border-2 border-dashed border-blue-600 bg-blue-50/30 inline-block shrink-0" />
                <span>Grid Cell Block</span>
              </span>
              <span className="font-bold text-blue-600">{hotspotGridSizeKm.toFixed(1)} km × {hotspotGridSizeKm.toFixed(1)} km</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
