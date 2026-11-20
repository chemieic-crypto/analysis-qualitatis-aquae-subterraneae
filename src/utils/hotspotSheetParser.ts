import * as XLSX from "xlsx";
import { SECTOR_PARAM_CONFIG, fastHaversineKm, fastBearingDeg } from "./sectorAnalysisEngine";
import { downloadStyledSheetJSWorkbook, ensureSheetJSNumbers } from "./excelFormatter";

export type HotspotSampleRole = "identified_hotspot" | "grid_sample";

export interface HotspotSampleRecord {
  hotspotNo: string;
  sampleType: HotspotSampleRole;
  rawSampleType: string;
  identificationNo: string;
  state: string;
  district: string;
  block: string;
  location: string;
  lat: number;
  lon: number;
  source: string;
  /** Inherent parameter key for long-format sheets (e.g., "U", "NO3", "F", "As") */
  primaryParam?: string;
  /** Inherent parameter unit reported on the row (e.g., "ppb", "mg/L") */
  paramUnit?: string;
  values: Record<string, number>;
  raw: Record<string, any>;
  rowIndex: number;
}

export interface HotspotGroup {
  id: string;
  hotspotNo: string;
  identifiedHotspot: HotspotSampleRecord;
  gridSamples: HotspotSampleRecord[];
  state: string;
  district: string;
  block: string;
  location: string;
  identificationNo: string;
  source: string;
  /** Primary parameter key for this Hot Spot group (set in multi-parameter sheets) */
  primaryParam?: string;
  /** Unit reported for this Hot Spot's parameter */
  paramUnit?: string;
}

export interface HotspotSheetParamInfo {
  colName: string;
  paramKey: string;
  label: string;
  unit: string;
  b1: number;
  b2: number;
  hotspotCount?: number;
}

export interface ParsedHotspotSheetResult {
  groups: HotspotGroup[];
  detectedParams: HotspotSheetParamInfo[];
  defaultParamKey: string;
  totalRows: number;
  totalGridSamples: number;
  warnings: string[];
  fileName?: string;
  format?: "long" | "wide";
}

function parseNumericCoord(val: any): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") return isFinite(val) ? val : NaN;
  const str = String(val).trim();
  if (!str) return NaN;
  const clean = str.replace(/,/g, ".").trim();
  const direct = parseFloat(clean);
  if (!isNaN(direct) && isFinite(direct) && /^[-+]?\d+(\.\d+)?$/.test(clean)) {
    return direct;
  }
  const dms = clean.match(/(\d+(?:\.\d+)?)\s*°?\s*(\d+(?:\.\d+)?)?'?\s*(\d+(?:\.\d+)?)?"?\s*([NSEWnsew])?/);
  if (dms && (clean.includes("°") || clean.includes("'") || /[NSEWnsew]/.test(clean))) {
    const deg = parseFloat(dms[1]) || 0;
    const min = parseFloat(dms[2]) || 0;
    const sec = parseFloat(dms[3]) || 0;
    const dir = dms[4] ? dms[4].toUpperCase() : "";
    let dd = deg + min / 60 + sec / 3600;
    if (dir === "S" || dir === "W") dd = -dd;
    if (isFinite(dd) && dd !== 0) return dd;
  }
  const m = clean.match(/[-+]?\d*\.?\d+/);
  if (m) {
    const n = parseFloat(m[0]);
    if (isFinite(n)) return /[SWsw]/.test(clean) && n > 0 ? -n : n;
  }
  return NaN;
}

function parseNumericWaterVal(val: any): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") return isFinite(val) ? val : NaN;
  const str = String(val).trim();
  if (!str) return NaN;
  const lower = str.toLowerCase();
  if (lower === "bdl" || lower === "nil" || lower === "nd" || lower === "absent" || lower === "trace" || lower === "nill") {
    return 0;
  }
  if (lower.startsWith("<")) {
    const num = parseFloat(str.replace(/<|\s/g, "").replace(/,/g, "."));
    return isFinite(num) ? num / 2 : 0;
  }
  const clean = str.replace(/,/g, ".");
  const m = clean.match(/[-+]?\d*\.?\d+/);
  if (m) {
    const n = parseFloat(m[0]);
    return isFinite(n) ? n : NaN;
  }
  return NaN;
}

function normalizeHeader(h: string): string {
  return String(h || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyHotspotSampleRole(rawType: string): HotspotSampleRole | null {
  const s = normalizeHeader(rawType).toLowerCase();
  if (!s) return null;
  if (
    s.includes("identified") ||
    s === "hot spot" ||
    s === "hotspot" ||
    s === "hs" ||
    s.includes("hot spot center") ||
    s.includes("hotspot center") ||
    s.includes("primary hot spot")
  ) {
    return "identified_hotspot";
  }
  if (
    s.includes("grid") ||
    s.includes("surrounding") ||
    s.includes("around") ||
    s.includes("peripher") ||
    s.includes("buffer") ||
    s === "sample"
  ) {
    return "grid_sample";
  }
  return null;
}

function adjustLimitsForUnit(
  baseB1: number,
  baseB2: number,
  cfgUnit: string,
  sheetUnit: string
): { b1: number; b2: number; unit: string } {
  const cU = (cfgUnit || "").toLowerCase().trim();
  const sU = (sheetUnit || "").toLowerCase().trim();
  if (!sU) return { b1: baseB1, b2: baseB2, unit: cfgUnit };

  const cfgIsPpb = cU.includes("ppb") || cU.includes("µg/l") || cU.includes("ug/l");
  const cfgIsMgL = cU.includes("mg/l") || cU.includes("ppm");
  const sheetIsPpb = sU.includes("ppb") || sU.includes("µg/l") || sU.includes("ug/l");
  const sheetIsMgL = sU.includes("mg/l") || sU.includes("ppm");

  if (cfgIsPpb && sheetIsMgL) {
    return { b1: Number((baseB1 / 1000).toPrecision(4)), b2: Number((baseB2 / 1000).toPrecision(4)), unit: sheetUnit };
  }
  if (cfgIsMgL && sheetIsPpb) {
    return { b1: Number((baseB1 * 1000).toPrecision(4)), b2: Number((baseB2 * 1000).toPrecision(4)), unit: sheetUnit };
  }
  return { b1: baseB1, b2: baseB2, unit: sheetUnit };
}

/**
 * Matches a column header or Parameter cell value (e.g., "U", "Nitrate (mg/L)", "Fluoride", "As")
 * to a canonical key in SECTOR_PARAM_CONFIG (excluding Molybdenum).
 */
export function matchHotspotParamHeader(colName: string, explicitUnit?: string): HotspotSheetParamInfo {
  const clean = normalizeHeader(colName);
  const lower = clean.toLowerCase();
  const unitMatch = clean.match(/\(([^)]+)\)/);
  const parsedUnit = (explicitUnit && normalizeHeader(explicitUnit)) || (unitMatch ? unitMatch[1].trim() : "");

  const baseName = clean.replace(/\([^)]*\)/g, "").trim().toLowerCase();

  // Pass 1: exact canonical key match (e.g., "U", "F", "As", "Fe", "NO3", "EC", "TDS", "pH")
  for (const [paramKey, cfg] of Object.entries(SECTOR_PARAM_CONFIG)) {
    const pkLower = paramKey.toLowerCase();
    if (baseName === pkLower || lower === pkLower) {
      const lim = adjustLimitsForUnit(cfg.b1, cfg.b2, cfg.unit, parsedUnit);
      return {
        colName: clean,
        paramKey,
        label: lim.unit ? `${paramKey} (${lim.unit})` : paramKey,
        unit: lim.unit || cfg.unit,
        b1: lim.b1,
        b2: lim.b2
      };
    }
  }

  // Pass 2: exact keyword match (avoid matching single-letter keys like "u" or "b" as substrings of longer words!)
  for (const [paramKey, cfg] of Object.entries(SECTOR_PARAM_CONFIG)) {
    if (cfg.keywords) {
      for (const kw of cfg.keywords) {
        const kwLower = kw.toLowerCase();
        if (
          baseName === kwLower ||
          baseName.startsWith(kwLower + " ") ||
          baseName.startsWith(kwLower + "_") ||
          lower.startsWith(kwLower + " ") ||
          lower.startsWith(kwLower + "(") ||
          (kwLower.length >= 3 && lower.includes(kwLower))
        ) {
          const lim = adjustLimitsForUnit(cfg.b1, cfg.b2, cfg.unit, parsedUnit);
          return {
            colName: clean,
            paramKey,
            label: lim.unit ? `${paramKey} (${lim.unit})` : paramKey,
            unit: lim.unit || cfg.unit,
            b1: lim.b1,
            b2: lim.b2
          };
        }
      }
    }
  }

  return {
    colName: clean,
    paramKey: clean,
    label: parsedUnit ? `${clean} (${parsedUnit})` : clean,
    unit: parsedUnit || "mg/L",
    b1: 45,
    b2: 100
  };
}

/**
 * Unmerges vertical/horizontal merged cells in a SheetJS worksheet (e.g., merged "Hot Spot No." cells)
 * into a 2D array of cell values and returns normalized header-keyed row objects.
 */
export function extractRowsFromHotspotWorksheet(ws: XLSX.WorkSheet): Record<string, any>[] {
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as any[][];
  if (!aoa || aoa.length === 0) return [];

  // Fill merged cells (especially vertical merges on Col A "Hot Spot No.")
  const merges = ws["!merges"] || [];
  const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: 0 } };
  const rowOffset = ref.s.r;
  const colOffset = ref.s.c;

  for (const m of merges) {
    const sr = m.s.r - rowOffset;
    const sc = m.s.c - colOffset;
    const er = m.e.r - rowOffset;
    const ec = m.e.c - colOffset;
    if (sr < 0 || sc < 0 || sr >= aoa.length) continue;
    const topLeftVal = aoa[sr]?.[sc];
    if (topLeftVal === undefined || topLeftVal === null || String(topLeftVal).trim() === "") continue;
    for (let r = sr; r <= Math.min(er, aoa.length - 1); r++) {
      if (!aoa[r]) aoa[r] = [];
      for (let c = sc; c <= ec; c++) {
        const existing = aoa[r][c];
        if (existing === undefined || existing === null || String(existing).trim() === "") {
          aoa[r][c] = topLeftVal;
        }
      }
    }
  }

  // Locate header row within the first 6 non-empty rows
  let headerRowIdx = 0;
  let bestHeaderScore = -1;
  const maxScan = Math.min(aoa.length, 6);
  for (let r = 0; r < maxScan; r++) {
    const cells = (aoa[r] || []).map((v) => normalizeHeader(String(v ?? "")).toLowerCase());
    let score = 0;
    for (const c of cells) {
      if (!c) continue;
      if (/hot\s*spot/.test(c)) score += 3;
      if (/type\s*of\s*sample|identified|grid\s*sample/.test(c)) score += 4;
      if (/latitude|\blat\b/.test(c)) score += 3;
      if (/longitude|\blon\b|\blong\b/.test(c)) score += 3;
      if (/parameter|parametr/.test(c)) score += 3;
      if (/state|district|block|taluka|location|source|identification/.test(c)) score += 2;
    }
    if (score > bestHeaderScore) {
      bestHeaderScore = score;
      headerRowIdx = r;
    }
  }

  const rawHeaders = (aoa[headerRowIdx] || []).map((h, idx) => {
    const clean = normalizeHeader(String(h ?? ""));
    return clean || `Column_${idx + 1}`;
  });

  // Deduplicate identical header names if any
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const count = seen.get(h) || 0;
    seen.set(h, count + 1);
    return count === 0 ? h : `${h}_${count + 1}`;
  });

  const rows: Record<string, any>[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const arr = aoa[r] || [];
    const hasAnyValue = arr.some((v) => v !== undefined && v !== null && String(v).trim() !== "");
    if (!hasAnyValue) continue;
    const obj: Record<string, any> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = arr[c] ?? "";
    }
    rows.push(obj);
  }
  return rows;
}

interface DetectedSheetColumns {
  hotspotNo: string;
  sampleType: string;
  identificationNo: string;
  state: string;
  district: string;
  block: string;
  location: string;
  latitude: string;
  longitude: string;
  source: string;
  // Long-format (12-column) columns: Parameter | Parametr Uint | Parameter Values
  paramNameCol: string;
  paramUnitCol: string;
  paramValueCol: string;
  // Wide-format parameter columns
  paramCols: string[];
}

function detectHotspotSheetColumns(columns: string[], rows: Record<string, any>[]): DetectedSheetColumns {
  const pick = (patterns: RegExp[], exclude: Set<string>): string => {
    for (const pat of patterns) {
      const found = columns.find((c) => !exclude.has(c) && pat.test(normalizeHeader(c).toLowerCase()));
      if (found) {
        exclude.add(found);
        return found;
      }
    }
    return "";
  };

  const used = new Set<string>();

  const sampleType = pick(
    [
      /type\s*of\s*sample/,
      /identified\s*hot\s*spot.*grid/,
      /sample\s*type/,
      /\bcategory\b|\brole\b/
    ],
    used
  );

  const hotspotNo = pick(
    [
      /^hot\s*spot\s*no\.?$/,
      /hot\s*spot\s*no/,
      /\bhs\s*no\.?\b/,
      /hot\s*spot\s*#/,
      /^(sl\.?|s\.?|sr\.?)\s*no\.?$/,
      /\bgroup\s*(no|id)?\b/
    ],
    used
  );

  const identificationNo = pick(
    [
      /identification\s*no/,
      /identification/,
      /sample\s*(id|code|no)/,
      /well\s*(id|code|no)/,
      /^id\s*no\.?$/
    ],
    used
  );

  const latitude = pick([/^latitude\b/, /\blatitude\b/, /^lat\b/, /\blat\s*\(dd\)/], used);
  const longitude = pick([/^longitude\b/, /\blongitude\b/, /^long?\b/, /\blon(g)?\s*\(dd\)/], used);
  const state = pick([/^state\b/, /state\s*\/\s*ut/, /\bstate\b/], used);
  const district = pick([/^district\b/, /\bdistrict\b/, /^dist\.?$/], used);
  const block = pick([/^block\b/, /block\s*\/\s*taluka/, /\btaluka\b/, /\btehsil\b/, /\bmandal\b/], used);
  const source = pick([/source\s*of\s*sample/, /^source\b/, /well\s*type/, /\bsource\b/], used);
  const location = pick(
    [
      /hot\s*spot\s*location/,
      /sample\s*location/,
      /\blocation\b/,
      /\bvillage\b/,
      /\bsite\b/,
      /\bplace\b/
    ],
    used
  );

  // Detect Long-Format columns (Image 1: Parameter | Parametr Uint | Parameter Values)
  // Match Value & Unit BEFORE bare Parameter so "Parameter Values" / "Parametr Uint" aren't grabbed as paramNameCol!
  const paramValueCol = pick(
    [
      /param(et(er|r))?\s*values?/,
      /measured\s*values?/,
      /^values?$/,
      /\bconcentration\b/,
      /\bresult\b/
    ],
    used
  );

  const paramUnitCol = pick(
    [
      /param(et(er|r))?\s*(units?|uints?)/,
      /^units?$/,
      /^uints?$/,
      /\bunit\b/,
      /\buint\b/
    ],
    used
  );

  const paramNameCol = pick(
    [
      /^param(et(er|r))?\s*(name)?$/,
      /\bparameter\b/,
      /\bparametr\b/,
      /\banalyte\b/,
      /\bcontaminant\b/
    ],
    used
  );

  // Verify long format: must have both paramNameCol and paramValueCol with actual parameter text & numeric values
  const isValidLongFormat = Boolean(paramNameCol && paramValueCol);

  // If NOT long format, release those columns back so wide-format detection can inspect them if needed
  if (!isValidLongFormat) {
    if (paramNameCol) used.delete(paramNameCol);
    if (paramUnitCol) used.delete(paramUnitCol);
    if (paramValueCol) used.delete(paramValueCol);
  }

  // Remaining columns with numeric water quality values (wide format; exclude Molybdenum)
  const sampleSlice = rows.slice(0, Math.min(rows.length, 60));
  const paramCols = isValidLongFormat
    ? []
    : columns.filter((col) => {
        if (used.has(col)) return false;
        const lower = normalizeHeader(col).toLowerCase();
        if (!lower || lower.startsWith("column_")) return false;
        if (/remark|comment|date|time|year|season|month|depth|agency|lab|notes|status|unit|uint/.test(lower)) return false;
        if (/^mo(\b|\s|\(|_)|molybdenum/.test(lower)) return false;

        let numericHits = 0;
        for (const r of sampleSlice) {
          const v = parseNumericWaterVal(r[col]);
          if (!isNaN(v)) numericHits++;
        }
        return numericHits > 0;
      });

  return {
    hotspotNo,
    sampleType,
    identificationNo,
    state,
    district,
    block,
    location,
    latitude,
    longitude,
    source,
    paramNameCol: isValidLongFormat ? paramNameCol : "",
    paramUnitCol: isValidLongFormat ? paramUnitCol : "",
    paramValueCol: isValidLongFormat ? paramValueCol : "",
    paramCols
  };
}

/**
 * Parses a structured Hot Spot Data Sheet in EITHER:
 * - New 12-column Long Multi-Parameter format (Type of Sample | ID No. | State/UT | District | Block | Location | Lon | Lat | Source | Parameter | Parametr Uint | Parameter Values)
 * - Legacy 11-column Wide format (Hot Spot No. | Type of Sample | ... | Nitrate (mg/L))
 * into grouped Hot Spot objects where each group has 1 Identified Hot Spot center and N surrounding Grid Samples.
 */
export function parseHotspotRows(rows: Record<string, any>[], fileName?: string): ParsedHotspotSheetResult {
  const warnings: string[] = [];
  if (!rows || rows.length === 0) {
    return {
      groups: [],
      detectedParams: [],
      defaultParamKey: "NO3",
      totalRows: 0,
      totalGridSamples: 0,
      warnings: ["Uploaded sheet contains no data rows."],
      fileName
    };
  }

  const colSet = new Set<string>();
  const scanCount = Math.min(rows.length, 40);
  for (let i = 0; i < scanCount; i++) {
    Object.keys(rows[i] || {}).forEach((k) => colSet.add(k));
  }
  const columns = Array.from(colSet);
  const cols = detectHotspotSheetColumns(columns, rows);

  if (!cols.latitude || !cols.longitude) {
    warnings.push("Could not detect Latitude / Longitude columns in the uploaded Hot Spot sheet.");
    return {
      groups: [],
      detectedParams: [],
      defaultParamKey: "NO3",
      totalRows: rows.length,
      totalGridSamples: 0,
      warnings,
      fileName
    };
  }

  const isLongFormat = Boolean(cols.paramNameCol && cols.paramValueCol);
  const paramMap = new Map<string, HotspotSheetParamInfo>();

  if (!isLongFormat) {
    for (const c of cols.paramCols) {
      const info = matchHotspotParamHeader(c);
      if (!paramMap.has(info.paramKey)) {
        paramMap.set(info.paramKey, info);
      }
    }
  }

  // Group records by Hot Spot No. (when present) OR sequentially starting a new group at every "Identified Hot Spot" row
  const groupOrder: string[] = [];
  const groupBuckets = new Map<string, HotspotSampleRecord[]>();

  let currentHotspotNo = "";
  let autoGroupCounter = 0;
  let skippedInvalidCoords = 0;
  let skippedMolybdenum = 0;
  let lastLongParamName = "";
  let lastLongParamUnit = "";

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const lat = parseNumericCoord(r[cols.latitude]);
    const lon = parseNumericCoord(r[cols.longitude]);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      skippedInvalidCoords++;
      continue;
    }

    const rawNo = cols.hotspotNo ? String(r[cols.hotspotNo] ?? "").trim() : "";
    const rawType = cols.sampleType ? String(r[cols.sampleType] ?? "").trim() : "";
    const classifiedRole = classifyHotspotSampleRole(rawType);

    let rowPrimaryParam: string | undefined;
    let rowParamUnit: string | undefined;
    const values: Record<string, number> = {};

    if (isLongFormat) {
      const rawPName = normalizeHeader(String(r[cols.paramNameCol] ?? ""));
      const rawPUnit = cols.paramUnitCol ? normalizeHeader(String(r[cols.paramUnitCol] ?? "")) : "";
      const effectivePName = rawPName || lastLongParamName;
      const effectivePUnit = rawPUnit || (rawPName ? "" : lastLongParamUnit);

      if (rawPName) {
        lastLongParamName = rawPName;
        lastLongParamUnit = rawPUnit;
      }

      if (effectivePName) {
        const lowerP = effectivePName.toLowerCase();
        if (/^mo(\b|\s|\(|_)|molybdenum/.test(lowerP)) {
          skippedMolybdenum++;
          continue;
        }
        const matched = matchHotspotParamHeader(effectivePName, effectivePUnit);
        rowPrimaryParam = matched.paramKey;
        rowParamUnit = matched.unit;
        if (!paramMap.has(matched.paramKey)) {
          paramMap.set(matched.paramKey, matched);
        }
        const numVal = parseNumericWaterVal(r[cols.paramValueCol]);
        if (!isNaN(numVal)) {
          values[matched.paramKey] = numVal;
          values[effectivePName] = numVal;
        }
      }
    } else {
      for (const p of paramMap.values()) {
        const numVal = parseNumericWaterVal(r[p.colName]);
        if (!isNaN(numVal)) {
          values[p.paramKey] = numVal;
          values[p.colName] = numVal;
        }
      }
      const firstWide = paramMap.values().next().value as HotspotSheetParamInfo | undefined;
      if (firstWide) {
        rowPrimaryParam = firstWide.paramKey;
        rowParamUnit = firstWide.unit;
      }
    }

    if (rawNo) {
      // If a new Identified Hot Spot appears under the same Hot Spot No. (e.g., different parameter), disambiguate cleanly
      const existingBucket = groupBuckets.get(rawNo);
      if (
        classifiedRole === "identified_hotspot" &&
        existingBucket &&
        existingBucket.some((rec) => rec.sampleType === "identified_hotspot")
      ) {
        autoGroupCounter++;
        currentHotspotNo = `${rawNo}_${autoGroupCounter}`;
      } else {
        currentHotspotNo = rawNo;
      }
    } else if (classifiedRole === "identified_hotspot" || !currentHotspotNo) {
      autoGroupCounter++;
      currentHotspotNo = String(autoGroupCounter);
    }

    const groupKey = currentHotspotNo;
    if (!groupBuckets.has(groupKey)) {
      groupBuckets.set(groupKey, []);
      groupOrder.push(groupKey);
    }
    const bucket = groupBuckets.get(groupKey)!;

    // Determine final role: respect explicit Type of Sample column, else first row in group is hotspot
    const finalRole: HotspotSampleRole =
      classifiedRole ?? (bucket.length === 0 ? "identified_hotspot" : "grid_sample");

    const rec: HotspotSampleRecord = {
      hotspotNo: groupKey,
      sampleType: finalRole,
      rawSampleType: rawType || (finalRole === "identified_hotspot" ? "Identified Hot Spot" : "Grid Sample"),
      identificationNo: cols.identificationNo ? String(r[cols.identificationNo] ?? "").trim() : "",
      state: cols.state ? String(r[cols.state] ?? "").trim() : "",
      district: cols.district ? String(r[cols.district] ?? "").trim() : "",
      block: cols.block ? String(r[cols.block] ?? "").trim() : "",
      location: cols.location ? String(r[cols.location] ?? "").trim() : "",
      lat,
      lon,
      source: cols.source ? String(r[cols.source] ?? "").trim() : "",
      primaryParam: rowPrimaryParam,
      paramUnit: rowParamUnit,
      values,
      raw: r,
      rowIndex: i
    };

    bucket.push(rec);
  }

  if (skippedInvalidCoords > 0) {
    warnings.push(`Skipped ${skippedInvalidCoords} row(s) with missing or invalid Latitude/Longitude.`);
  }
  if (skippedMolybdenum > 0) {
    warnings.push(`Excluded ${skippedMolybdenum} Molybdenum (Mo) row(s) per active BIS rules.`);
  }

  const groups: HotspotGroup[] = [];
  let totalGridSamples = 0;
  const paramGroupCounts = new Map<string, number>();

  for (const key of groupOrder) {
    const records = groupBuckets.get(key) || [];
    if (records.length === 0) continue;

    let hsRecord = records.find((rec) => rec.sampleType === "identified_hotspot");
    let gridSamples: HotspotSampleRecord[];

    if (hsRecord) {
      gridSamples = records.filter((rec) => rec !== hsRecord);
    } else {
      hsRecord = { ...records[0], sampleType: "identified_hotspot" };
      gridSamples = records.slice(1);
      warnings.push(
        `Hot Spot #${key} had no explicit "Identified Hot Spot" label; used first row (${hsRecord.location || hsRecord.identificationNo || "Row 1"}) as Hot Spot center.`
      );
    }

    const grpParam = hsRecord.primaryParam || gridSamples.find((g) => g.primaryParam)?.primaryParam;
    const grpUnit =
      hsRecord.paramUnit ||
      gridSamples.find((g) => g.paramUnit)?.paramUnit ||
      (grpParam ? paramMap.get(grpParam)?.unit : undefined);

    if (grpParam) {
      paramGroupCounts.set(grpParam, (paramGroupCounts.get(grpParam) || 0) + 1);
    }

    totalGridSamples += gridSamples.length;

    groups.push({
      id: `hs-${key}-${groups.length + 1}`,
      hotspotNo: key,
      identifiedHotspot: hsRecord,
      gridSamples,
      state: hsRecord.state || gridSamples.find((g) => g.state)?.state || "",
      district: hsRecord.district || gridSamples.find((g) => g.district)?.district || "",
      block: hsRecord.block || gridSamples.find((g) => g.block)?.block || "",
      location: hsRecord.location || hsRecord.identificationNo || `Hot Spot ${key}`,
      identificationNo: hsRecord.identificationNo,
      source: hsRecord.source,
      primaryParam: grpParam,
      paramUnit: grpUnit
    });
  }

  const detectedParams = Array.from(paramMap.values()).map((p) => ({
    ...p,
    hotspotCount: paramGroupCounts.get(p.paramKey) || (isLongFormat ? 0 : groups.length)
  }));
  const defaultParamKey = detectedParams[0]?.paramKey || "NO3";

  return {
    groups,
    detectedParams,
    defaultParamKey,
    totalRows: rows.length,
    totalGridSamples,
    warnings,
    fileName,
    format: isLongFormat ? "long" : "wide"
  };
}

export function parseHotspotWorksheet(ws: XLSX.WorkSheet, fileName?: string): ParsedHotspotSheetResult {
  const rows = extractRowsFromHotspotWorksheet(ws);
  return parseHotspotRows(rows, fileName);
}

/**
 * Converts a HotSpotGroup's surrounding Grid Samples into memoized point objects compatible
 * with calculateHotspotPlumeData(), and computes the max spread distance from the Hot Spot center.
 */
export function buildHotspotGroupPlumePoints(
  group: HotspotGroup,
  paramKey: string,
  colName?: string
): { points: any[]; maxDistKm: number; hsVal: number } {
  const hs = group.identifiedHotspot;
  const effectiveKey = paramKey || group.primaryParam || "NO3";
  const hsVal =
    hs.values[effectiveKey] !== undefined
      ? hs.values[effectiveKey]
      : colName && hs.values[colName] !== undefined
      ? hs.values[colName]
      : group.primaryParam && hs.values[group.primaryParam] !== undefined
      ? hs.values[group.primaryParam]
      : NaN;

  let maxDistKm = 0;
  const points = group.gridSamples.map((gs, idx) => {
    const val =
      gs.values[effectiveKey] !== undefined
        ? gs.values[effectiveKey]
        : colName && gs.values[colName] !== undefined
        ? gs.values[colName]
        : group.primaryParam && gs.values[group.primaryParam] !== undefined
        ? gs.values[group.primaryParam]
        : NaN;
    const dist = fastHaversineKm(hs.lat, hs.lon, gs.lat, gs.lon);
    const bearing = fastBearingDeg(hs.lat, hs.lon, gs.lat, gs.lon);
    if (dist > maxDistKm) maxDistKm = dist;

    return {
      ...gs.raw,
      Location: gs.location || gs.identificationNo || `Grid Sample ${idx + 1}`,
      District: gs.district || group.district,
      Block: gs.block || group.block,
      State: gs.state || group.state,
      Source: gs.source,
      "Identification No.": gs.identificationNo,
      "Hot Spot No.": group.hotspotNo,
      "Sample Type": gs.rawSampleType,
      Parameter: effectiveKey,
      Unit: gs.paramUnit || group.paramUnit || "",
      _raw: {
        ...gs.raw,
        Location: gs.location || gs.identificationNo || `Grid Sample ${idx + 1}`,
        District: gs.district || group.district,
        Block: gs.block || group.block,
        State: gs.state || group.state,
        Source: gs.source,
        IdentificationNo: gs.identificationNo,
        HotSpotNo: group.hotspotNo
      },
      _index: gs.rowIndex,
      _lat: gs.lat,
      _lon: gs.lon,
      _val: val,
      _hasCoords: true,
      _dist: dist,
      _bearing: bearing,
      _isGridSample: true,
      _identificationNo: gs.identificationNo,
      _source: gs.source
    };
  });

  return { points, maxDistKm, hsVal };
}

/**
 * Generates and downloads a styled Excel template matching the updated 12-column multi-parameter
 * CGWB Hot Spot Data Sheet format (with Parameter, Parameter Unit, and Parameter Values columns).
 */
export function downloadHotspotSheetTemplate(_paramLabel?: string) {
  const headers = [
    "Type of Sample in grid (Identified hot spot/Grid Sample)",
    "Identification No. for Hot Spot /sample collected around hot spot",
    "State/ UT",
    "District",
    "Block/ Taluka",
    "Hot Spot Location/Sample Location around hot Spot",
    "Longitude (DD)",
    "Latitude (DD)",
    "Source of Sample",
    "Parameter",
    "Parameter Unit",
    "Parameter Values"
  ];

  const sampleRows = [
    ["Identified Hot Spot", "Delhi/2024/U/01/1", "Delhi", "North", "NARELA", "Auchandi", 76.99722, 28.81944, "TW", "U", "ppb", 42.0],
    ["Grid Sample", "Delhi/2024/U/01/2", "Delhi", "North", "NARELA", "Auchandi -2", 77.00487, 28.81758, "TW", "U", "ppb", 36.2],
    ["Grid Sample", "Delhi/2024/U/01/3", "Delhi", "North", "NARELA", "Auchandi -3", 76.99192, 28.82321, "TW", "U", "ppb", 39.8],
    ["Identified Hot Spot", "MP/2024/U/04/1", "Madhya Pradesh", "Seoni", "Keolari", "Dhangada-4-I", 79.8592, 22.322, "BW", "U", "ppb", 553.6],
    ["Grid Sample", "MP/2024/U/04/2", "Madhya Pradesh", "Seoni", "Keolari", "Dhangada-4-II", 79.8586, 22.324, "HP", "U", "ppb", 84.0],
    ["Grid Sample", "MP/2024/U/04/3", "Madhya Pradesh", "Seoni", "Keolari", "Dhangada-4-III", 79.8587, 22.324, "DW", "U", "ppb", 6.3],
    ["Grid Sample", "MP/2024/U/04/4", "Madhya Pradesh", "Seoni", "Keolari", "Dhangada-1-I(Lopa)", 79.8463, 22.297, "HP", "U", "ppb", 114.5],
    ["Grid Sample", "MP/2024/U/04/5", "Madhya Pradesh", "Seoni", "Keolari", "Dhangada-1-II(Lopa)", 79.8465, 22.297, "BW", "U", "ppb", 1063.8],
    ["Identified Hot Spot", "RJ/2024/NO3/01/1", "Rajasthan", "Karauli", "Karauli", "Karauli", 77.0172, 26.5014, "DW", "NO3", "mg/L", 226.0],
    ["Grid Sample", "RJ/2024/NO3/01/2", "Rajasthan", "Karauli", "Karauli", "Karauli Hindaun Road", 77.0198, 26.5183, "TW", "NO3", "mg/L", 9.0],
    ["Grid Sample", "RJ/2024/NO3/01/3", "Rajasthan", "Karauli", "Karauli", "Karauli Lalsot Road", 77.0243, 26.5036, "TW", "NO3", "mg/L", 190.0],
    ["Identified Hot Spot", "GJ/2024/F/01/1", "Gujarat", "Anand", "Petlad", "Dharmaj", 72.78741, 22.42074, "Dug Well", "F", "mg/L", 2.8],
    ["Grid Sample", "GJ/2024/F/01/2", "Gujarat", "Anand", "Petlad", "Dharmaj 1", 72.79371, 22.41268, "Dug Well", "F", "mg/L", 1.9],
    ["Grid Sample", "GJ/2024/F/01/3", "Gujarat", "Anand", "Petlad", "Dharmaj 2", 72.79353, 22.42752, "Hand Pump", "F", "mg/L", 0.9]
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  ws["!cols"] = [
    { wch: 28 },
    { wch: 24 },
    { wch: 16 },
    { wch: 15 },
    { wch: 15 },
    { wch: 26 },
    { wch: 15 },
    { wch: 15 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 }
  ];
  ensureSheetJSNumbers(ws, 1);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "HotSpot_Data_Sheet");
  void downloadStyledSheetJSWorkbook(wb, "HotSpot_Grid_Data_Template.xlsx", {
    HotSpot_Data_Sheet: 1
  });
}
