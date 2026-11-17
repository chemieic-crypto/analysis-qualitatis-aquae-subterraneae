import { DataHeaders, ShapefileLayer } from "../types";
import { norm, isStateAll, isDistrictAll, featureMatchesSelection } from "./shapefileFilter";

export interface SpatialSamplePoint {
  lat: number;
  lng: number;
  val: number;
  location: string;
  state: string;
  district: string;
  block: string;
  isExceed: boolean;
  isAboveAcceptable: boolean;
  row: Record<string, any>;
}

export interface SpatialBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface ContourSegment {
  level: number;
  x1: number; // normalized grid column index [0..cols-1]
  y1: number; // normalized grid row index [0..rows-1] (0 = south/minLat, rows-1 = north/maxLat)
  x2: number;
  y2: number;
}

// Default Geospatial Map Module EC Colour Ranges (Blue-Yellow-Red for BIS IS 10500:2012)
export const EC_CONTOUR_LEVELS = [
  { max: 750, color: "#005ce6", label: "Acceptable (≤ 750 µS/cm)" },
  { max: 3000, color: "#ffff00", label: "Permissible (750 – 3000 µS/cm)" },
  { max: Infinity, color: "#ff0000", label: "Exceeded (> 3000 µS/cm)" },
];

// Geospatial Map Module Point Colour Ranges
export const POINT_RANGE_COLORS = {
  acceptable: "#22c55e",
  permissible: "#eab308",
  exceeded: "#ef4444",
};

export const EC_ISO_THRESHOLDS = [750, 1500, 2250, 3000];

/**
 * Resolves whether a parameter key represents Electrical Conductivity (EC).
 */
export function isEcParameter(
  paramKey: string,
  headerMap: Record<string, string> = {},
  paramName?: string
): boolean {
  const keyClean = (paramKey || "").trim().toLowerCase();
  const mappedClean = (headerMap[paramKey] || "").trim().toLowerCase();
  const nameClean = (paramName || "").trim().toLowerCase();
  return (
    keyClean === "ec" ||
    mappedClean === "ec" ||
    keyClean.startsWith("ec ") ||
    keyClean.startsWith("ec(") ||
    nameClean.includes("electrical conductivity")
  );
}

/**
 * Parses a numeric value from a spreadsheet cell safely.
 */
export function parseNumericCell(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s || s === "-" || s === "—" || s.toLowerCase() === "nd" || s.toLowerCase() === "bdl") {
    return null;
  }
  const num = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

/**
 * Extracts a parameter's numeric value from a row using headerMap and fuzzy matching.
 */
export function extractRowParamValue(
  row: Record<string, any>,
  paramKey: string,
  headerMap: Record<string, string> = {}
): number | null {
  if (!row || !paramKey) return null;

  if (row[paramKey] !== undefined) {
    const v = parseNumericCell(row[paramKey]);
    if (v !== null) return v;
  }

  const mapped = headerMap[paramKey];
  if (mapped && row[mapped] !== undefined) {
    const v = parseNumericCell(row[mapped]);
    if (v !== null) return v;
  }

  const reverseKey = Object.keys(headerMap).find((k) => headerMap[k] === paramKey);
  if (reverseKey && row[reverseKey] !== undefined) {
    const v = parseNumericCell(row[reverseKey]);
    if (v !== null) return v;
  }

  const pLow = paramKey.toLowerCase().trim();
  const keys = Object.keys(row);
  const exactKey = keys.find((k) => k.toLowerCase().trim() === pLow);
  if (exactKey) {
    const v = parseNumericCell(row[exactKey]);
    if (v !== null) return v;
  }

  const fuzzyKey = keys.find((k) => {
    const kLow = k.toLowerCase().trim();
    return kLow.startsWith(`${pLow} `) || kLow.startsWith(`${pLow}(`) || kLow.includes(`(${pLow})`);
  });
  if (fuzzyKey) {
    const v = parseNumericCell(row[fuzzyKey]);
    if (v !== null) return v;
  }

  return null;
}

/**
 * Extracts latitude and longitude from a data row with headerMap & fallback keys.
 */
export function extractRowLatLng(
  row: Record<string, any>,
  headers: DataHeaders,
  headerMap: Record<string, string> = {}
): { lat: number; lng: number } | null {
  if (!row) return null;

  const latCandidates = [
    headerMap["latitude"],
    headers.latitude,
    "Latitude",
    "LATITUDE",
    "lat",
    "LAT",
    "Lat",
    "Y",
    "Northing",
  ].filter(Boolean) as string[];

  const lngCandidates = [
    headerMap["longitude"],
    headers.longitude,
    "Longitude",
    "LONGITUDE",
    "lng",
    "LNG",
    "lon",
    "LON",
    "Long",
    "LONG",
    "X",
    "Easting",
  ].filter(Boolean) as string[];

  let lat: number | null = null;
  for (const k of latCandidates) {
    if (row[k] !== undefined) {
      lat = parseNumericCell(row[k]);
      if (lat !== null) break;
    }
  }
  if (lat === null) {
    const fuzzyLat = Object.keys(row).find((k) => k.toLowerCase().includes("lat"));
    if (fuzzyLat) lat = parseNumericCell(row[fuzzyLat]);
  }

  let lng: number | null = null;
  for (const k of lngCandidates) {
    if (row[k] !== undefined) {
      lng = parseNumericCell(row[k]);
      if (lng !== null) break;
    }
  }
  if (lng === null) {
    const fuzzyLng = Object.keys(row).find((k) => {
      const kl = k.toLowerCase();
      return kl.includes("lon") || kl.includes("lng");
    });
    if (fuzzyLng) lng = parseNumericCell(row[fuzzyLng]);
  }

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;

  return { lat, lng };
}

/**
 * Filters rawData rows into geocoded SpatialSamplePoint[] matching State/District/Block & parameter.
 */
export function buildSpatialSamplePoints(options: {
  rawData: Record<string, any>[];
  headers: DataHeaders;
  headerMap: Record<string, string>;
  paramKey: string;
  b1: number;
  b2: number;
  selectedBlock?: string;
}): { points: SpatialSamplePoint[]; nonGeocodedCount: number } {
  const { rawData, headers, headerMap, paramKey, b1, b2, selectedBlock } = options;

  const stateCol = headers.state || "State";
  const districtCol = headers.district || "District";
  const blockCol = headers.block || "Block";
  const locCol = headers.location || headers.wellId || "Location";

  const isBlockAll = !selectedBlock || selectedBlock === "ALL" || selectedBlock.toLowerCase() === "all blocks";
  const selBlockNorm = norm(selectedBlock || "");

  const points: SpatialSamplePoint[] = [];
  let nonGeocodedCount = 0;

  for (const row of rawData) {
    const blockVal = String(row[blockCol] || row["BLOCK"] || row["Block"] || row["Tehsil"] || "").trim();
    if (!isBlockAll) {
      const bNorm = norm(blockVal);
      if (!bNorm || (bNorm !== selBlockNorm && !bNorm.includes(selBlockNorm) && !selBlockNorm.includes(bNorm))) {
        continue;
      }
    }

    const val = extractRowParamValue(row, paramKey, headerMap);
    if (val === null) continue;

    const coords = extractRowLatLng(row, headers, headerMap);
    if (!coords) {
      nonGeocodedCount++;
      continue;
    }

    const stateVal = String(row[stateCol] || row["STATE"] || row["State"] || "").trim();
    const distVal = String(row[districtCol] || row["DISTRICT"] || row["District"] || "").trim();
    const locVal = String(row[locCol] || row["Village"] || row["Well ID"] || blockVal || distVal || "Station").trim();

    const isExceed = paramKey.toLowerCase() === "ph"
      ? (val < 6.5 || val > 8.5)
      : (b2 > 0 && val > b2);

    const isAboveAcceptable = paramKey.toLowerCase() === "ph"
      ? (val < 6.5 || val > 8.5)
      : (b1 > 0 && val > b1);

    points.push({
      lat: coords.lat,
      lng: coords.lng,
      val,
      location: locVal,
      state: stateVal,
      district: distVal,
      block: blockVal,
      isExceed,
      isAboveAcceptable,
      row,
    });
  }

  return { points, nonGeocodedCount };
}

/**
 * Checks whether a GeoJSON feature matches optional block selection on top of state/district.
 */
export function featureMatchesAdminSelection(
  feature: any,
  selectedState?: string,
  selectedDistrict?: string,
  selectedBlock?: string,
  districtStateMap?: Record<string, string>
): boolean {
  if (!featureMatchesSelection(feature, selectedState, selectedDistrict, districtStateMap)) {
    return false;
  }

  const isBlockAll = !selectedBlock || selectedBlock === "ALL" || selectedBlock.toLowerCase() === "all blocks";
  if (isBlockAll) return true;

  const props = feature?.properties || {};
  const blockKeys = [
    "block", "blockname", "blkname", "blknm", "blk", "tehsil", "taluk", "taluka", "subdist", "subdistrict", "name3", "adm3"
  ];
  let featureBlock = "";
  for (const k of Object.keys(props)) {
    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (blockKeys.some((bk) => cleanK === bk || (bk.length >= 3 && cleanK.includes(bk)))) {
      const v = String(props[k] || "").trim();
      if (v) {
        featureBlock = v;
        break;
      }
    }
  }

  if (!featureBlock && (props.name || props.Name || props.NAME)) {
    featureBlock = String(props.name || props.Name || props.NAME || "").trim();
  }

  if (!featureBlock) return true;

  const fbNorm = norm(featureBlock);
  const sbNorm = norm(selectedBlock);
  return fbNorm === sbNorm || fbNorm.includes(sbNorm) || sbNorm.includes(fbNorm);
}

/**
 * Picks the most appropriate shapefile layer from sharedLayers for the current geographic depth.
 */
export function selectBestAdminLayer(
  sharedLayers: ShapefileLayer[] = [],
  selectedState?: string,
  selectedDistrict?: string,
  selectedBlock?: string,
  reportingLevel?: "State" | "District" | "Block"
): ShapefileLayer | null {
  const visLayers = sharedLayers.filter((l) => l.visible && l.geoJson);
  if (visLayers.length === 0) return null;
  if (visLayers.length === 1) return visLayers[0];

  const isAllSt = isStateAll(selectedState);
  const isAllDt = isDistrictAll(selectedDistrict);
  const isAllBlk = !selectedBlock || selectedBlock === "ALL" || selectedBlock.toLowerCase() === "all blocks";

  const getLayerType = (layer: ShapefileLayer): "block" | "district" | "state" => {
    const nameLower = (layer.name || "").toLowerCase();
    const sampleFeature = layer.geoJson?.features?.[0] || layer.geoJson;
    const props = sampleFeature?.properties || {};
    const propKeys = Object.keys(props).map((k) => k.toLowerCase());

    if (
      nameLower.includes("block") ||
      propKeys.some((k) => k.includes("block") || k.includes("blk") || k.includes("tehsil") || k.includes("taluk"))
    ) {
      return "block";
    }
    if (
      nameLower.includes("district") ||
      nameLower.includes("dist") ||
      nameLower.includes("dt") ||
      propKeys.some((k) => k.includes("district") || k.includes("dist") || k.includes("dtname"))
    ) {
      return "district";
    }
    return "state";
  };

  if (!isAllBlk || !isAllDt || reportingLevel === "Block") {
    return (
      visLayers.find((l) => getLayerType(l) === "block") ||
      visLayers.find((l) => getLayerType(l) === "district") ||
      visLayers[0]
    );
  }

  if (!isAllSt || reportingLevel === "District") {
    return (
      visLayers.find((l) => getLayerType(l) === "district") ||
      visLayers.find((l) => getLayerType(l) === "state") ||
      visLayers[0]
    );
  }

  return (
    visLayers.find((l) => getLayerType(l) === "state") ||
    visLayers.find((l) => getLayerType(l) === "district") ||
    visLayers[0]
  );
}

/**
 * Computes tight geographic bounds from filtered GeoJSON features or fallback points.
 */
export function computeSpatialExtent(
  features: any[],
  points: SpatialSamplePoint[],
  padRatio = 0.05
): SpatialBounds {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  const scanCoords = (c: any) => {
    if (!c) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      const [lng, lat] = c;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else if (Array.isArray(c)) {
      for (let i = 0; i < c.length; i++) scanCoords(c[i]);
    }
  };

  if (features.length > 0) {
    features.forEach((f) => {
      if (f?.geometry?.coordinates) scanCoords(f.geometry.coordinates);
    });
  }

  if (minLat === Infinity && points.length > 0) {
    for (const p of points) {
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
    }
  }

  if (minLat === Infinity) {
    return { minLng: 68.0, maxLng: 97.5, minLat: 6.5, maxLat: 37.2 };
  }

  const dLng = Math.max(0.08, maxLng - minLng);
  const dLat = Math.max(0.08, maxLat - minLat);

  return {
    minLng: minLng - dLng * padRatio,
    maxLng: maxLng + dLng * padRatio,
    minLat: minLat - dLat * padRatio,
    maxLat: maxLat + dLat * padRatio,
  };
}

/**
 * Computes a high-density Inverse Distance Weighting (IDW) raster grid.
 * Row 0 = bounds.minLat (south), Row rows-1 = bounds.maxLat (north).
 */
export function computeHighDensityIdwGrid(options: {
  points: { lat: number; lng: number; val: number }[];
  bounds: SpatialBounds;
  cols: number;
  rows: number;
  power?: number;
}): Float32Array {
  const { points, bounds, cols, rows, power = 2 } = options;
  const grid = new Float32Array(rows * cols);
  if (!points.length || cols <= 0 || rows <= 0) {
    grid.fill(NaN);
    return grid;
  }

  const latSpan = bounds.maxLat - bounds.minLat || 1;
  const lngSpan = bounds.maxLng - bounds.minLng || 1;
  const halfExp = power / 2;
  const usePow = Math.abs(halfExp - 1) > 1e-6;

  // Pre-copy coordinates into flat typed arrays for fast tight inner loop
  const n = points.length;
  const ptLat = new Float64Array(n);
  const ptLng = new Float64Array(n);
  const ptVal = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    ptLat[i] = points[i].lat;
    ptLng[i] = points[i].lng;
    ptVal[i] = points[i].val;
  }

  const invColsMinus1 = cols > 1 ? 1 / (cols - 1) : 1;
  const invRowsMinus1 = rows > 1 ? 1 / (rows - 1) : 1;

  for (let r = 0; r < rows; r++) {
    const cellLat = bounds.minLat + r * invRowsMinus1 * latSpan;
    const rowOffset = r * cols;
    for (let c = 0; c < cols; c++) {
      const cellLng = bounds.minLng + c * invColsMinus1 * lngSpan;

      let exactVal: number | null = null;
      let numer = 0;
      let denom = 0;

      for (let i = 0; i < n; i++) {
        const dLat = cellLat - ptLat[i];
        const dLng = cellLng - ptLng[i];
        const distSq = dLat * dLat + dLng * dLng;
        if (distSq < 1e-11) {
          exactVal = ptVal[i];
          break;
        }
        const w = usePow ? 1 / Math.pow(distSq, halfExp) : 1 / distSq;
        numer += w * ptVal[i];
        denom += w;
      }

      grid[rowOffset + c] = exactVal !== null ? exactVal : (denom > 0 ? numer / denom : NaN);
    }
  }

  return grid;
}

/**
 * Returns RGBA [0..255] color for an EC value (µS/cm at 25°C) using
 * Geospatial Map Module defaults: Blue (#005ce6) <= b1, Yellow (#ffff00) <= b2, Red (#ff0000) > b2.
 */
export function getEcColorRgba(
  val: number,
  smoothBlend: boolean,
  b1 = 750,
  b2 = 3000
): [number, number, number, number] {
  if (!Number.isFinite(val)) return [0, 0, 0, 0];

  if (!smoothBlend) {
    if (val <= b1) return [0, 92, 230, 245];    // #005ce6 Acceptable
    if (val <= b2) return [255, 255, 0, 245];   // #ffff00 Permissible
    return [255, 0, 0, 245];                    // #ff0000 Exceeded
  }

  const mid = b1 + (b2 - b1) * 0.5;
  const stops: [number, [number, number, number]][] = [
    [0, [0, 92, 230]],         // #005ce6
    [b1, [0, 160, 220]],       // transition out of acceptable blue
    [mid, [255, 255, 0]],      // #ffff00 permissible yellow
    [b2, [255, 140, 0]],       // orange transition near PL
    [b2 * 1.35, [255, 0, 0]],  // #ff0000 exceeded red
  ];

  if (val <= stops[0][0]) return [...stops[0][1], 245];
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i];
    const [v1, c1] = stops[i + 1];
    if (val <= v1) {
      const t = (val - v0) / (v1 - v0 || 1);
      return [
        Math.round(c0[0] + t * (c1[0] - c0[0])),
        Math.round(c0[1] + t * (c1[1] - c0[1])),
        Math.round(c0[2] + t * (c1[2] - c0[2])),
        245,
      ];
    }
  }
  const last = stops[stops.length - 1][1];
  return [last[0], last[1], last[2], 245];
}

/**
 * Extracts Marching Squares iso-contour segments across a regular scalar grid.
 */
export function extractIsoContourSegments(
  grid: Float32Array,
  cols: number,
  rows: number,
  levels: number[]
): ContourSegment[] {
  const segments: ContourSegment[] = [];
  if (cols < 2 || rows < 2) return segments;

  const interp = (v1: number, v2: number, level: number) => {
    const denom = v2 - v1;
    if (Math.abs(denom) < 1e-9) return 0.5;
    return Math.max(0, Math.min(1, (level - v1) / denom));
  };

  for (const level of levels) {
    for (let r = 0; r < rows - 1; r++) {
      const r0 = r * cols;
      const r1 = (r + 1) * cols;
      for (let c = 0; c < cols - 1; c++) {
        // Cell corners: bl (c,r), br (c+1,r), tr (c+1,r+1), tl (c,r+1)
        const bl = grid[r0 + c];
        const br = grid[r0 + c + 1];
        const tr = grid[r1 + c + 1];
        const tl = grid[r1 + c];
        if (!Number.isFinite(bl) || !Number.isFinite(br) || !Number.isFinite(tr) || !Number.isFinite(tl)) {
          continue;
        }

        const idx =
          (bl >= level ? 1 : 0) |
          (br >= level ? 2 : 0) |
          (tr >= level ? 4 : 0) |
          (tl >= level ? 8 : 0);

        if (idx === 0 || idx === 15) continue;

        // Edge midpoints:
        // 0: bottom (bl -> br), 1: right (br -> tr), 2: top (tl -> tr), 3: left (bl -> tl)
        const edgePt = (edge: number): [number, number] => {
          switch (edge) {
            case 0:
              return [c + interp(bl, br, level), r];
            case 1:
              return [c + 1, r + interp(br, tr, level)];
            case 2:
              return [c + interp(tl, tr, level), r + 1];
            default:
              return [c, r + interp(bl, tl, level)];
          }
        };

        const addSeg = (eA: number, eB: number) => {
          const [x1, y1] = edgePt(eA);
          const [x2, y2] = edgePt(eB);
          segments.push({ level, x1, y1, x2, y2 });
        };

        switch (idx) {
          case 1:
          case 14:
            addSeg(3, 0);
            break;
          case 2:
          case 13:
            addSeg(0, 1);
            break;
          case 3:
          case 12:
            addSeg(3, 1);
            break;
          case 4:
          case 11:
            addSeg(1, 2);
            break;
          case 5: {
            const center = (bl + br + tr + tl) * 0.25;
            if (center >= level) {
              addSeg(3, 2);
              addSeg(0, 1);
            } else {
              addSeg(3, 0);
              addSeg(1, 2);
            }
            break;
          }
          case 6:
          case 9:
            addSeg(0, 2);
            break;
          case 7:
          case 8:
            addSeg(3, 2);
            break;
          case 10: {
            const center = (bl + br + tr + tl) * 0.25;
            if (center >= level) {
              addSeg(3, 0);
              addSeg(1, 2);
            } else {
              addSeg(3, 2);
              addSeg(0, 1);
            }
            break;
          }
        }
      }
    }
  }

  return segments;
}
