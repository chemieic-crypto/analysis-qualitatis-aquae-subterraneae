import * as turf from "@turf/turf";
import { PARAM_CONFIG as APP_PARAM_CONFIG } from "../data/config";

export interface SectorParamMeta {
  b1: number;
  b2: number;
  unit: string;
  name: string;
  keywords: string[];
}

// Re-aligned with app-wide BIS limits (Molybdenum intentionally excluded)
export const SECTOR_PARAM_CONFIG: Record<string, SectorParamMeta> = {
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
  Al: { b1: 0.03, b2: 0.2, unit: "mg/L", name: "Aluminium", keywords: ["al", "alluminium", "aluminium"] },
  Ba: { b1: 0.7, b2: 0.7, unit: "mg/L", name: "Barium", keywords: ["ba", "barium"] },
  B: { b1: 0.5, b2: 2.4, unit: "mg/L", name: "Boron", keywords: ["b", "boran", "boron"] }
};

// Keep b1/b2 synchronized with APP_PARAM_CONFIG where keys match
Object.keys(SECTOR_PARAM_CONFIG).forEach((k) => {
  const appCfg = (APP_PARAM_CONFIG as Record<string, { desirable?: number; permissible?: number; unit?: string }>)[k];
  if (appCfg && typeof appCfg.desirable === "number" && typeof appCfg.permissible === "number") {
    SECTOR_PARAM_CONFIG[k].b1 = appCfg.desirable;
    SECTOR_PARAM_CONFIG[k].b2 = appCfg.permissible;
  }
});

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Zero-allocation spherical Haversine distance in km.
 */
export function fastHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const rLat1 = lat1 * DEG_TO_RAD;
  const rLat2 = lat2 * DEG_TO_RAD;

  const sinLat = Math.sin(dLat * 0.5);
  const sinLon = Math.sin(dLon * 0.5);
  const a = sinLat * sinLat + Math.cos(rLat1) * Math.cos(rLat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_KM * c;
}

/**
 * Zero-allocation forward azimuth / bearing in degrees [0, 360).
 */
export function fastBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rLat1 = lat1 * DEG_TO_RAD;
  const rLat2 = lat2 * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x = Math.cos(rLat1) * Math.sin(rLat2) - Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * RAD_TO_DEG;
  if (brng < 0) brng += 360;
  return brng >= 360 ? brng - 360 : brng;
}

/**
 * Fast geodesic destination point [lon, lat] given distanceKm & bearingDeg.
 */
export function fastDestination(
  lon: number,
  lat: number,
  distanceKm: number,
  bearingDeg: number
): [number, number] {
  const rLat1 = lat * DEG_TO_RAD;
  const rLon1 = lon * DEG_TO_RAD;
  const brng = bearingDeg * DEG_TO_RAD;
  const angDist = distanceKm / EARTH_RADIUS_KM;

  const sinLat1 = Math.sin(rLat1);
  const cosLat1 = Math.cos(rLat1);
  const sinAng = Math.sin(angDist);
  const cosAng = Math.cos(angDist);

  const sinLat2 = sinLat1 * cosAng + cosLat1 * sinAng * Math.cos(brng);
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
  const lon2 =
    rLon1 + Math.atan2(Math.sin(brng) * sinAng * cosLat1, cosAng - sinLat1 * sinLat2);

  return [((lon2 * RAD_TO_DEG + 540) % 360) - 180, lat2 * RAD_TO_DEG];
}

/**
 * Zero-allocation ray-casting point-in-ring check.
 */
export function fastPointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-18) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function fastPointInPolygonCoords(lon: number, lat: number, rings: number[][][]): boolean {
  if (!rings || rings.length === 0) return false;
  if (!fastPointInRing(lon, lat, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (fastPointInRing(lon, lat, rings[h])) return false;
  }
  return true;
}

/**
 * Fast point-in-Polygon / MultiPolygon check with optional bbox pre-test.
 */
export function fastPointInFeature(
  lon: number,
  lat: number,
  feature: any,
  bbox?: [number, number, number, number]
): boolean {
  if (bbox) {
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
      return false;
    }
  }
  const geom = feature?.geometry || feature;
  if (!geom || !geom.coordinates) return false;

  if (geom.type === "Polygon") {
    return fastPointInPolygonCoords(lon, lat, geom.coordinates);
  }
  if (geom.type === "MultiPolygon") {
    const polys = geom.coordinates as number[][][][];
    for (let i = 0; i < polys.length; i++) {
      if (fastPointInPolygonCoords(lon, lat, polys[i])) return true;
    }
    return false;
  }
  return false;
}

export interface CustomTierRange {
  min: number;
  max: number;
  label: string;
  color: string;
  unit: string;
  visible?: boolean;
}

export interface ComputedSectorItem {
  id: string;
  shortLabel: string;
  ring: string;
  angle: string;
  area: number;
  points: any[];
  avg: number;
  min: number;
  max: number;
  stdDev: number;
  exceedanceCount: number;
  exceedanceRate: number;
  count: number;
  unit: string;
  color: string;
  poly: any;
  centroid: [number, number]; // [lon, lat]
  bbox: [number, number, number, number];
  ringIndex?: number;
  innerRadiusKm?: number;
  outerRadiusKm?: number;
  startBearing?: number;
  endBearing?: number;
}

export interface RingDistanceProfileItem {
  ringLabel: string;
  innerKm: number;
  outerKm: number;
  sampleCount: number;
  sectorCount: number;
  avg: number;
  min: number;
  max: number;
  exceedanceRate: number;
}

export interface SectorGlobalSummary {
  totalSamples: number;
  populatedSectors: number;
  totalSectors: number;
  globalMean: number;
  globalMin: number;
  globalMax: number;
  peakSectorId: string | null;
  peakSectorAvg: number;
  overallExceedanceRate: number;
  desirableLimit: number;
  permissibleLimit: number;
  unit: string;
}

export interface SectorComputeResult {
  sectors: ComputedSectorItem[];
  ringProfile: RingDistanceProfileItem[];
  summary: SectorGlobalSummary;
}

export function createAnnularSectorPolygon(
  centerLon: number,
  centerLat: number,
  innerRadiusKm: number,
  outerRadiusKm: number,
  startBearingDeg: number,
  endBearingDeg: number,
  numSteps: number = 24
): any {
  const safeOuter = Number(outerRadiusKm);
  const safeInner = Math.max(0, Number(innerRadiusKm) || 0);
  if (!Number.isFinite(safeOuter) || safeOuter <= 0 || safeOuter <= safeInner) return null;

  const angleSpan = endBearingDeg - startBearingDeg;
  if (angleSpan <= 0) return null;

  if (angleSpan >= 360) {
    const centerPt = turf.point([centerLon, centerLat]);
    const outerCircle = turf.circle(centerPt, safeOuter, { units: "kilometers", steps: 48 });
    if (safeInner <= 0) return outerCircle;
    const innerCircle = turf.circle(centerPt, safeInner, { units: "kilometers", steps: 48 });
    const outerRing = outerCircle.geometry.coordinates[0];
    const innerRing = [...innerCircle.geometry.coordinates[0]].reverse();
    return turf.polygon([outerRing, innerRing]);
  }

  const steps = Math.max(4, Math.round((angleSpan / 360) * numSteps));
  const outerArc: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const b = startBearingDeg + (i / steps) * angleSpan;
    outerArc.push(fastDestination(centerLon, centerLat, safeOuter, b));
  }

  if (safeInner > 0) {
    const innerArc: [number, number][] = [];
    for (let i = steps; i >= 0; i--) {
      const b = startBearingDeg + (i / steps) * angleSpan;
      innerArc.push(fastDestination(centerLon, centerLat, safeInner, b));
    }
    return turf.polygon([[...outerArc, ...innerArc, outerArc[0]]]);
  }

  return turf.polygon([[[centerLon, centerLat], ...outerArc, [centerLon, centerLat]]]);
}

function safeIntersectPoly(poly1: any, poly2: any): any {
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
  } catch {
    return null;
  }
}

export function matchTierRange(val: number, ranges: CustomTierRange[]): CustomTierRange | undefined {
  if (!Number.isFinite(val) || ranges.length === 0) return undefined;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (i === ranges.length - 1 ? val >= r.min && val <= r.max : val >= r.min && val < r.max) {
      return r;
    }
  }
  return undefined;
}

export interface ComputeSectorsInput {
  points: any[]; // pre-parsed rows with _lat, _lon, _val, _hasCoords
  analysisMode: "sector" | "grid" | "hotspot";
  centerPoint: [number, number] | null; // [lon, lat]
  radii: number[];
  sectorAngle: number;
  gridCellWidthKm: number;
  gridCellHeightKm: number;
  gridScope: "data_bounds" | "origin_extent";
  hideEmptySectors: boolean;
  activeParam: string;
  customRanges: CustomTierRange[];
  clipBoundaryPoly?: any | null;
  clipBoundaryBBox?: [number, number, number, number] | null;
  autoRestrictOrigin?: boolean;
}

function summarizePointBucket(
  bucket: any[],
  customRanges: CustomTierRange[],
  desirableLimit: number,
  defaultUnit: string
) {
  const n = bucket.length;
  if (n === 0) {
    return {
      avg: 0,
      min: 0,
      max: 0,
      stdDev: 0,
      exceedanceCount: 0,
      exceedanceRate: 0,
      color: "rgba(148, 163, 184, 0.16)",
      unit: defaultUnit
    };
  }
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let exceed = 0;

  for (let i = 0; i < n; i++) {
    const v = bucket[i]._val;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v > desirableLimit) exceed++;
  }
  const avg = sum / n;
  let sqDiffSum = 0;
  for (let i = 0; i < n; i++) {
    const d = bucket[i]._val - avg;
    sqDiffSum += d * d;
  }
  const stdDev = n > 1 ? Math.sqrt(sqDiffSum / n) : 0;
  const match = matchTierRange(avg, customRanges);

  return {
    avg,
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
    stdDev,
    exceedanceCount: exceed,
    exceedanceRate: (exceed / n) * 100,
    color: match?.color || "#4f46e5",
    unit: match?.unit || defaultUnit
  };
}

/**
 * Pure spatial computation decoupled from React/Leaflet rendering so label toggles
 * and zoom events never re-run geometry intersections or turf math.
 */
export function computeSectorGeometryAndStats(input: ComputeSectorsInput): SectorComputeResult {
  const {
    points,
    analysisMode,
    centerPoint,
    radii,
    sectorAngle,
    gridCellWidthKm,
    gridCellHeightKm,
    gridScope,
    hideEmptySectors,
    activeParam,
    customRanges,
    clipBoundaryPoly = null,
    clipBoundaryBBox = null,
    autoRestrictOrigin = false
  } = input;

  const paramCfg = SECTOR_PARAM_CONFIG[activeParam] || { b1: 500, b2: 2000, unit: "mg/L" };
  const desirableLimit = paramCfg.b1;
  const permissibleLimit = paramCfg.b2;
  const defaultUnit = paramCfg.unit || "";

  const emptyResult: SectorComputeResult = {
    sectors: [],
    ringProfile: [],
    summary: {
      totalSamples: 0,
      populatedSectors: 0,
      totalSectors: 0,
      globalMean: 0,
      globalMin: 0,
      globalMax: 0,
      peakSectorId: null,
      peakSectorAvg: 0,
      overallExceedanceRate: 0,
      desirableLimit,
      permissibleLimit,
      unit: defaultUnit
    }
  };

  if (analysisMode === "hotspot") {
    return emptyResult;
  }

  if (analysisMode === "sector" && (!centerPoint || radii.length === 0)) {
    return emptyResult;
  }

  const centerLon = centerPoint ? centerPoint[0] : 0;
  const centerLat = centerPoint ? centerPoint[1] : 0;
  const hasCenter = Boolean(centerPoint);
  const hasClip = Boolean(clipBoundaryPoly && clipBoundaryBBox);
  const restrictByClip = Boolean(autoRestrictOrigin && hasClip);
  const sectors: ComputedSectorItem[] = [];
  const ringProfile: RingDistanceProfileItem[] = [];

  if (analysisMode === "grid") {
    // Grid mode never needs Haversine distance or bearing — keep direct references with zero object cloning
    const validPoints: any[] = [];
    for (let i = 0; i < points.length; i++) {
      const d = points[i];
      if (!d || !d._hasCoords) continue;
      const val = d._val;
      if (typeof val !== "number" || !Number.isFinite(val)) continue;

      const match = matchTierRange(val, customRanges);
      if (match && match.visible === false) continue;

      if (restrictByClip && !fastPointInFeature(d._lon, d._lat, clipBoundaryPoly, clipBoundaryBBox!)) {
        continue;
      }
      validPoints.push(d);
    }

    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    if (gridScope === "origin_extent" && hasCenter) {
      const spanKm = radii.length > 0 ? Math.max(...radii) : 10;
      minLat = fastDestination(centerLon, centerLat, spanKm, 180)[1];
      maxLat = fastDestination(centerLon, centerLat, spanKm, 0)[1];
      minLon = fastDestination(centerLon, centerLat, spanKm, 270)[0];
      maxLon = fastDestination(centerLon, centerLat, spanKm, 90)[0];
    } else {
      for (let i = 0; i < validPoints.length; i++) {
        const p = validPoints[i];
        if (p._lon < minLon) minLon = p._lon;
        if (p._lon > maxLon) maxLon = p._lon;
        if (p._lat < minLat) minLat = p._lat;
        if (p._lat > maxLat) maxLat = p._lat;
      }
      if (!Number.isFinite(minLon) || !Number.isFinite(maxLon)) {
        if (!hasCenter) return emptyResult;
        minLon = centerLon - 0.15;
        maxLon = centerLon + 0.15;
        minLat = centerLat - 0.15;
        maxLat = centerLat + 0.15;
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
    const safeW = Math.max(0.1, gridCellWidthKm || 2.0);
    const safeH = Math.max(0.1, gridCellHeightKm || 2.0);
    const latStepDeg = safeH / 110.574;
    const lonStepDeg = safeW / (111.32 * Math.max(0.1, Math.cos(meanLat * DEG_TO_RAD)));

    const totalRows = Math.min(50, Math.max(1, Math.ceil((maxLat - minLat) / latStepDeg)));
    const totalCols = Math.min(50, Math.max(1, Math.ceil((maxLon - minLon) / lonStepDeg)));

    const gridBuckets = new Map<string, any[]>();
    for (let i = 0; i < validPoints.length; i++) {
      const p = validPoints[i];
      if (p._lon >= minLon && p._lon <= maxLon && p._lat >= minLat && p._lat <= maxLat) {
        const c = Math.min(totalCols - 1, Math.max(0, Math.floor((p._lon - minLon) / lonStepDeg)));
        const r = Math.min(totalRows - 1, Math.max(0, Math.floor((p._lat - minLat) / latStepDeg)));
        const key = `${r}_${c}`;
        const existing = gridBuckets.get(key);
        if (existing) existing.push(p);
        else gridBuckets.set(key, [p]);
      }
    }

    for (let r = 0; r < totalRows; r++) {
      const cellMinLat = minLat + r * latStepDeg;
      const cellMaxLat = Math.min(maxLat, cellMinLat + latStepDeg);
      let rowSamples = 0;
      let rowSum = 0;
      let rowMin = Infinity;
      let rowMax = -Infinity;
      let rowExceed = 0;
      let rowCells = 0;

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

        let areaSqKm = safeW * safeH;
        let bbox: [number, number, number, number] = [cellMinLon, cellMinLat, cellMaxLon, cellMaxLat];

        if (hasClip && clipBoundaryPoly && clipBoundaryBBox) {
          if (
            bbox[0] > clipBoundaryBBox[2] ||
            bbox[2] < clipBoundaryBBox[0] ||
            bbox[1] > clipBoundaryBBox[3] ||
            bbox[3] < clipBoundaryBBox[1]
          ) {
            continue;
          }
          cellPoly = safeIntersectPoly(cellPoly, clipBoundaryPoly);
          if (!cellPoly) continue;
          areaSqKm = turf.area(cellPoly) / 1_000_000;
          bbox = turf.bbox(cellPoly) as [number, number, number, number];
        }

        const stats = summarizePointBucket(cellPoints, customRanges, desirableLimit, defaultUnit);
        const centroidLon = (bbox[0] + bbox[2]) / 2;
        const centroidLat = (bbox[1] + bbox[3]) / 2;

        rowCells++;
        if (cellPoints.length > 0) {
          rowSamples += cellPoints.length;
          rowSum += stats.avg * cellPoints.length;
          if (stats.min < rowMin) rowMin = stats.min;
          if (stats.max > rowMax) rowMax = stats.max;
          rowExceed += stats.exceedanceCount;
        }

        sectors.push({
          id: `Grid_R${r + 1}_C${c + 1}`,
          shortLabel: `R${r + 1}C${c + 1}`,
          ring: `Row ${r + 1}`,
          angle: `Col ${c + 1}`,
          area: areaSqKm,
          points: cellPoints,
          avg: stats.avg,
          min: stats.min,
          max: stats.max,
          stdDev: stats.stdDev,
          exceedanceCount: stats.exceedanceCount,
          exceedanceRate: stats.exceedanceRate,
          count: cellPoints.length,
          unit: stats.unit,
          color: stats.color,
          poly: cellPoly,
          centroid: [centroidLon, centroidLat],
          bbox,
          ringIndex: r
        });
      }

      if (rowSamples > 0) {
        ringProfile.push({
          ringLabel: `Row ${r + 1}`,
          innerKm: r * safeH,
          outerKm: (r + 1) * safeH,
          sampleCount: rowSamples,
          sectorCount: rowCells,
          avg: rowSum / rowSamples,
          min: rowMin,
          max: rowMax,
          exceedanceRate: (rowExceed / rowSamples) * 100
        });
      }
    }
  } else {
    // Radial Rings & Annular Sectors Mode
    let angleInput = Number(sectorAngle);
    if (!Number.isFinite(angleInput) || angleInput <= 0) angleInput = 45;
    const sortedRadii = [...radii].filter((r) => Number.isFinite(r) && r > 0).sort((a, b) => a - b);
    if (sortedRadii.length === 0) return emptyResult;

    const maxRadiusKm = sortedRadii[sortedRadii.length - 1];
    const cosLat = Math.max(0.1, Math.cos(centerLat * DEG_TO_RAD));
    const maxLatDeg = maxRadiusKm / 110.574 + 0.02;
    const maxLonDeg = maxRadiusKm / (111.32 * cosLat) + 0.02;
    const minSearchLat = centerLat - maxLatDeg;
    const maxSearchLat = centerLat + maxLatDeg;
    const minSearchLon = centerLon - maxLonDeg;
    const maxSearchLon = centerLon + maxLonDeg;

    const sectorBuckets = new Map<string, any[]>();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p || !p._hasCoords) continue;

      // Fast O(1) bounding-box rejection eliminates ~95% of wells before trig math
      const lat = p._lat;
      const lon = p._lon;
      if (lat < minSearchLat || lat > maxSearchLat || lon < minSearchLon || lon > maxSearchLon) {
        continue;
      }

      const val = p._val;
      if (typeof val !== "number" || !Number.isFinite(val)) continue;

      const match = matchTierRange(val, customRanges);
      if (match && match.visible === false) continue;

      if (restrictByClip && !fastPointInFeature(lon, lat, clipBoundaryPoly, clipBoundaryBBox!)) {
        continue;
      }

      const d = fastHaversineKm(centerLat, centerLon, lat, lon);
      if (d > maxRadiusKm) continue;

      let matchedRIdx = -1;
      for (let rIdx = 0; rIdx < sortedRadii.length; rIdx++) {
        const innerR = rIdx === 0 ? 0 : sortedRadii[rIdx - 1];
        const outerR = sortedRadii[rIdx];
        if (innerR === 0 ? d <= outerR : d > innerR && d <= outerR) {
          matchedRIdx = rIdx;
          break;
        }
      }
      if (matchedRIdx === -1) continue;

      const angleSlot =
        angleInput >= 360 ? 0 : Math.floor(fastBearingDeg(centerLat, centerLon, lat, lon) / angleInput) * angleInput;
      const key = `${matchedRIdx}_${angleSlot}`;
      const existing = sectorBuckets.get(key);
      if (existing) existing.push(p);
      else sectorBuckets.set(key, [p]);
    }

    for (let rIdx = 0; rIdx < sortedRadii.length; rIdx++) {
      const innerR = rIdx === 0 ? 0 : sortedRadii[rIdx - 1];
      const outerR = sortedRadii[rIdx];
      let ringSamples = 0;
      let ringSum = 0;
      let ringMin = Infinity;
      let ringMax = -Infinity;
      let ringExceed = 0;
      let ringSectors = 0;

      for (let start = 0; start < 360; start += angleInput) {
        let end = start + angleInput;
        if (end > 360 || 360 - end < 0.001) end = 360;

        const cellPoints = sectorBuckets.get(`${rIdx}_${start}`) || [];
        if (hideEmptySectors && cellPoints.length === 0) {
          if (end >= 360) break;
          continue;
        }

        let finalCell = createAnnularSectorPolygon(centerLon, centerLat, innerR, outerR, start, end, 24);
        if (!finalCell) {
          if (end >= 360) break;
          continue;
        }

        const theoreticalArea =
          Math.PI * (outerR * outerR - innerR * innerR) * ((end - start) / 360);
        let areaSqKm = theoreticalArea;
        let bbox = turf.bbox(finalCell) as [number, number, number, number];

        if (hasClip && clipBoundaryPoly && clipBoundaryBBox) {
          if (
            bbox[0] > clipBoundaryBBox[2] ||
            bbox[2] < clipBoundaryBBox[0] ||
            bbox[1] > clipBoundaryBBox[3] ||
            bbox[3] < clipBoundaryBBox[1]
          ) {
            if (end >= 360) break;
            continue;
          }
          finalCell = safeIntersectPoly(finalCell, clipBoundaryPoly);
          if (!finalCell) {
            if (end >= 360) break;
            continue;
          }
          areaSqKm = Math.min(theoreticalArea, turf.area(finalCell) / 1_000_000);
          bbox = turf.bbox(finalCell) as [number, number, number, number];
        }

        const isFullRing = end - start >= 360;
        const cellId = isFullRing ? `Ring_${innerR}-${outerR}` : `R${outerR}_A${Math.round(start)}`;
        const shortLabel = isFullRing ? `${innerR}-${outerR}km` : `${outerR}km · ${Math.round(start)}°`;

        // Ideal mid-arc centroid sits cleanly inside concave rings too (avoids ring center collision!)
        let centroid: [number, number];
        if (isFullRing) {
          const midR = innerR === 0 ? outerR * 0.45 : (innerR + outerR) / 2;
          centroid = innerR === 0 ? [centerLon, centerLat] : fastDestination(centerLon, centerLat, midR, 45);
        } else if (hasClip) {
          try {
            const cPt = turf.centerOfMass(finalCell);
            centroid = cPt.geometry.coordinates as [number, number];
          } catch {
            centroid = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
          }
        } else {
          const midR = innerR === 0 ? outerR * 0.62 : (innerR + outerR) / 2;
          const midB = (start + end) / 2;
          centroid = fastDestination(centerLon, centerLat, midR, midB);
        }

        const stats = summarizePointBucket(cellPoints, customRanges, desirableLimit, defaultUnit);

        ringSectors++;
        if (cellPoints.length > 0) {
          ringSamples += cellPoints.length;
          ringSum += stats.avg * cellPoints.length;
          if (stats.min < ringMin) ringMin = stats.min;
          if (stats.max > ringMax) ringMax = stats.max;
          ringExceed += stats.exceedanceCount;
        }

        sectors.push({
          id: cellId,
          shortLabel,
          ring: `${innerR}-${outerR}`,
          angle: `${Math.round(start)}-${Math.round(end)}`,
          area: areaSqKm,
          points: cellPoints,
          avg: stats.avg,
          min: stats.min,
          max: stats.max,
          stdDev: stats.stdDev,
          exceedanceCount: stats.exceedanceCount,
          exceedanceRate: stats.exceedanceRate,
          count: cellPoints.length,
          unit: stats.unit,
          color: stats.color,
          poly: finalCell,
          centroid,
          bbox,
          ringIndex: rIdx,
          innerRadiusKm: innerR,
          outerRadiusKm: outerR,
          startBearing: start,
          endBearing: end
        });

        if (end >= 360) break;
      }

      ringProfile.push({
        ringLabel: `${innerR}-${outerR} km`,
        innerKm: innerR,
        outerKm: outerR,
        sampleCount: ringSamples,
        sectorCount: ringSectors,
        avg: ringSamples > 0 ? ringSum / ringSamples : 0,
        min: ringMin === Infinity ? 0 : ringMin,
        max: ringMax === -Infinity ? 0 : ringMax,
        exceedanceRate: ringSamples > 0 ? (ringExceed / ringSamples) * 100 : 0
      });
    }
  }

  // Global summary across generated sectors
  let totalSamples = 0;
  let populatedSectors = 0;
  let globalSum = 0;
  let globalMin = Infinity;
  let globalMax = -Infinity;
  let totalExceed = 0;
  let peakSectorId: string | null = null;
  let peakSectorAvg = -Infinity;

  for (let i = 0; i < sectors.length; i++) {
    const s = sectors[i];
    if (s.count > 0) {
      populatedSectors++;
      totalSamples += s.count;
      globalSum += s.avg * s.count;
      if (s.min < globalMin) globalMin = s.min;
      if (s.max > globalMax) globalMax = s.max;
      totalExceed += s.exceedanceCount;
      if (s.avg > peakSectorAvg) {
        peakSectorAvg = s.avg;
        peakSectorId = s.id;
      }
    }
  }

  return {
    sectors,
    ringProfile,
    summary: {
      totalSamples,
      populatedSectors,
      totalSectors: sectors.length,
      globalMean: totalSamples > 0 ? globalSum / totalSamples : 0,
      globalMin: globalMin === Infinity ? 0 : globalMin,
      globalMax: globalMax === -Infinity ? 0 : globalMax,
      peakSectorId,
      peakSectorAvg: peakSectorAvg === -Infinity ? 0 : peakSectorAvg,
      overallExceedanceRate: totalSamples > 0 ? (totalExceed / totalSamples) * 100 : 0,
      desirableLimit,
      permissibleLimit,
      unit: defaultUnit
    }
  };
}

export interface ScreenBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
  maxNudgePx?: number;
}

export interface PlacedLabel extends LabelCandidate {
  box: ScreenBox;
  nudged: boolean;
}

export interface LabelLayoutOptions {
  viewportWidth?: number;
  viewportHeight?: number;
  paddingPx?: number;
  marginPx?: number;
  obstacles?: ScreenBox[];
  allowNudge?: boolean;
}

export interface LabelLayoutResult {
  placed: PlacedLabel[];
  visibleIds: Set<string>;
  suppressedCount: number;
}

function boxesOverlap(a: ScreenBox, b: ScreenBox, pad: number): boolean {
  return (
    a.minX - pad < b.maxX &&
    a.maxX + pad > b.minX &&
    a.minY - pad < b.maxY &&
    a.maxY + pad > b.minY
  );
}

function makeCenteredBox(cx: number, cy: number, width: number, height: number): ScreenBox {
  const hw = width / 2;
  const hh = height / 2;
  return {
    minX: cx - hw,
    minY: cy - hh,
    maxX: cx + hw,
    maxY: cy + hh
  };
}

/**
 * Deterministic 2D AABB collision-free label plate allocator.
 * Prevents overlapping plates and overlapping obstacles at every zoom level.
 */
export function selectCollisionFreeLabels(
  candidates: LabelCandidate[],
  options: LabelLayoutOptions = {}
): LabelLayoutResult {
  const {
    viewportWidth = 4000,
    viewportHeight = 4000,
    paddingPx = 6,
    marginPx = 8,
    obstacles = [],
    allowNudge = true
  } = options;

  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const placed: PlacedLabel[] = [];
  const visibleIds = new Set<string>();
  const occupied: ScreenBox[] = [...obstacles];

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const nudgeLimit = allowNudge ? c.maxNudgePx ?? Math.min(c.height * 0.75, 22) : 0;

    const offsets: Array<[number, number]> =
      nudgeLimit > 0
        ? [
            [0, 0],
            [0, -nudgeLimit],
            [0, nudgeLimit],
            [nudgeLimit, 0],
            [-nudgeLimit, 0]
          ]
        : [[0, 0]];

    let chosen: PlacedLabel | null = null;

    for (let o = 0; o < offsets.length; o++) {
      const [dx, dy] = offsets[o];
      const cx = c.x + dx;
      const cy = c.y + dy;
      const box = makeCenteredBox(cx, cy, c.width, c.height);

      if (
        box.minX < marginPx ||
        box.maxX > viewportWidth - marginPx ||
        box.minY < marginPx ||
        box.maxY > viewportHeight - marginPx
      ) {
        continue;
      }

      let collides = false;
      for (let k = 0; k < occupied.length; k++) {
        if (boxesOverlap(box, occupied[k], paddingPx)) {
          collides = true;
          break;
        }
      }

      if (!collides) {
        chosen = {
          ...c,
          x: cx,
          y: cy,
          box,
          nudged: o > 0
        };
        break;
      }
    }

    if (chosen) {
      placed.push(chosen);
      occupied.push(chosen.box);
      visibleIds.add(c.id);
    }
  }

  return {
    placed,
    visibleIds,
    suppressedCount: Math.max(0, candidates.length - placed.length)
  };
}

/**
 * Builds a clean RFC 7946 GeoJSON FeatureCollection for GIS software (QGIS, ArcGIS).
 */
export function buildSectorsGeoJsonFeatureCollection(
  sectors: ComputedSectorItem[],
  activeParam: string
) {
  return {
    type: "FeatureCollection" as const,
    name: `Sector_Analysis_${activeParam}`,
    features: sectors
      .filter((s) => s.poly && s.poly.geometry)
      .map((s) => ({
        type: "Feature" as const,
        geometry: s.poly.geometry,
        properties: {
          sector_id: s.id,
          ring_or_row: s.ring,
          angle_or_col: s.angle,
          parameter: activeParam,
          unit: s.unit,
          samples: s.count,
          average: Number(s.avg.toFixed(4)),
          min: s.count > 0 ? Number(s.min.toFixed(4)) : null,
          max: s.count > 0 ? Number(s.max.toFixed(4)) : null,
          std_dev: s.count > 1 ? Number(s.stdDev.toFixed(4)) : null,
          exceedance_count: s.exceedanceCount,
          exceedance_pct: Number(s.exceedanceRate.toFixed(2)),
          area_sq_km: Number(s.area.toFixed(4)),
          fill_color: s.color
        }
      }))
  };
}
