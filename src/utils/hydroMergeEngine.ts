import * as turf from "@turf/turf";
import { fastPointInFeature } from "./sectorAnalysisEngine";

export type MergeMode = "enrich_main" | "inner_all" | "match_any";

export interface JoinKeyRule {
  id: string;
  mainColumn: string;
  targetColumn: string;
  /** 0 = exact full normalized match; 3..8 = first N alphanumeric characters */
  prefixLength: number;
}

export interface MainSheetInput {
  label: string;
  headers: string[];
  rows: Record<string, any>[];
  selectedColumns: string[];
}

export interface SecondarySheetInput {
  id: string;
  label: string;
  headers: string[];
  rows: Record<string, any>[];
  joinKeys: JoinKeyRule[];
  selectedColumns: string[];
}

export interface MergedRowEntry {
  mainRowIndex: number;
  mainKeyDisplay: string;
  matchedSheetIds: string[];
  missingSheetIds: string[];
  matchCount: number;
  totalSecondarySheets: number;
  status: "full" | "partial" | "unmatched";
  data: Record<string, any>;
}

export interface PerSheetMergeSummary {
  sheetId: string;
  label: string;
  totalRows: number;
  matchedCount: number;
  unmatchedCount: number;
  missingKeyCount: number;
  matchRatePct: number;
  unmatchedRows: Record<string, any>[];
  missingKeyRows: Record<string, any>[];
}

export interface HydroMergeResult {
  mode: MergeMode;
  mainLabel: string;
  mainTotalRows: number;
  mainMissingKeyRows: Record<string, any>[];
  fullyMatchedRows: MergedRowEntry[];
  partiallyMatchedRows: MergedRowEntry[];
  unmatchedMainRows: MergedRowEntry[];
  exportedMergedRows: Record<string, any>[];
  mergedHeaders: string[];
  sheetSummaries: PerSheetMergeSummary[];
  executionMs: number;
}

export interface AreaStatSummary {
  name: string;
  fullMatched: number;
  partialMatched: number;
  unmatched: number;
  total: number;
}

export interface AreaDetailedRow {
  "Principal Aquifer": string;
  State: string;
  "Matched (All Sheets)": number;
  "Partial Matches": number;
  "Unmatched Samples": number;
  "Total Samples": number;
}

export interface GridAnalysisSummary {
  emptyCount: number;
  occupiedCount: number;
  totalCells: number;
  clippedGrids: GeoJSON.FeatureCollection<GeoJSON.Geometry, any>;
}

export interface MergeExecuteOptions {
  mode?: MergeMode;
  includeStatusColumns?: boolean;
}

/**
 * Normalizes a join key cell value: lowercase, strips non-alphanumeric chars,
 * and optionally truncates to the configured prefix length.
 */
export function normalizeJoinValue(val: unknown, prefixLength: number = 0): string {
  if (val === undefined || val === null) return "";
  let clean = String(val).toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  if (prefixLength > 0 && clean.length > prefixLength) {
    clean = clean.slice(0, prefixLength);
  }
  return clean;
}

const DEFAULT_ID_CANDIDATES = [
  "well id",
  "well_id",
  "wellid",
  "wls_id",
  "station id",
  "station_id",
  "site id",
  "site_id",
  "sample id",
  "sample_id",
  "id",
];

/**
 * Picks a sensible default ID/join column from a sheet's header list.
 */
export function findDefaultJoinKeyColumn(headers: string[]): string {
  if (!Array.isArray(headers) || headers.length === 0) return "";
  const valid = headers.filter((h) => h && String(h).trim() !== "");
  for (const candidate of DEFAULT_ID_CANDIDATES) {
    const match = valid.find((h) => h.toLowerCase().trim() === candidate);
    if (match) return match;
  }
  const fuzzy = valid.find((h) => {
    const lower = h.toLowerCase().trim();
    return lower.includes("well") || lower.includes("site") || lower.includes("station") || lower.includes("location");
  });
  return fuzzy || valid[0] || "";
}

/**
 * Automatically suggests initial JoinKeyRule(s) pairing Main Sheet columns with Target Sheet columns.
 */
export function autoSuggestJoinKeyPairs(
  mainHeaders: string[],
  targetHeaders: string[]
): JoinKeyRule[] {
  const validMain = mainHeaders.filter((h) => h && String(h).trim() !== "");
  const validTarget = targetHeaders.filter((h) => h && String(h).trim() !== "");
  if (validMain.length === 0 || validTarget.length === 0) {
    return [
      {
        id: `jk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        mainColumn: "",
        targetColumn: "",
        prefixLength: 0,
      },
    ];
  }

  const normMapTarget = new Map<string, string>();
  for (const h of validTarget) {
    const key = h.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key && !normMapTarget.has(key)) {
      normMapTarget.set(key, h);
    }
  }

  const defaultMain = findDefaultJoinKeyColumn(validMain);
  const defaultMainNorm = defaultMain.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Try exact normalized column match on preferred ID first
  if (defaultMainNorm && normMapTarget.has(defaultMainNorm)) {
    return [
      {
        id: `jk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        mainColumn: defaultMain,
        targetColumn: normMapTarget.get(defaultMainNorm)!,
        prefixLength: 0,
      },
    ];
  }

  // Otherwise try any exact normalized column match across preferred candidates
  for (const h of validMain) {
    const k = h.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normMapTarget.has(k)) {
      return [
        {
          id: `jk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          mainColumn: h,
          targetColumn: normMapTarget.get(k)!,
          prefixLength: 0,
        },
      ];
    }
  }

  // Fall back to default ID guesses on both sides
  return [
    {
      id: `jk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      mainColumn: defaultMain,
      targetColumn: findDefaultJoinKeyColumn(validTarget),
      prefixLength: 0,
    },
  ];
}

/**
 * Robust coordinate parser (supports floats, comma decimals, and DMS strings).
 */
export function parseGeoCoord(val: unknown): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") return Number.isFinite(val) ? val : NaN;
  const str = String(val).trim();
  if (!str) return NaN;

  const cleanStr = str.replace(/,/g, ".").trim();
  if (/^[-+]?\d+(\.\d+)?$/.test(cleanStr)) {
    const n = parseFloat(cleanStr);
    return Number.isFinite(n) ? n : NaN;
  }

  const dms = cleanStr.match(
    /(\d+(?:\.\d+)?)\s*°?\s*(\d+(?:\.\d+)?)?'?\s*(\d+(?:\.\d+)?)?"?\s*([NSEWnsew])?/
  );
  if (dms) {
    const deg = parseFloat(dms[1]) || 0;
    const min = parseFloat(dms[2]) || 0;
    const sec = parseFloat(dms[3]) || 0;
    const dir = dms[4] ? dms[4].toUpperCase() : "";
    let dd = deg + min / 60 + sec / 3600;
    if (dir === "S" || dir === "W") dd = -dd;
    if (Number.isFinite(dd) && dd !== 0) return dd;
  }

  const numMatch = cleanStr.match(/[-+]?\d*\.?\d+/);
  if (numMatch) {
    const n = parseFloat(numMatch[0]);
    if (Number.isFinite(n)) {
      return /[SWsw]/.test(cleanStr) && n > 0 ? -n : n;
    }
  }
  return NaN;
}

/**
 * Detects latitude & longitude column keys from sample rows.
 */
export function detectCoordinateColumns(
  rows: Record<string, any>[],
  preferredHeaders?: string[]
): { latKey?: string; lonKey?: string } {
  const keys =
    preferredHeaders && preferredHeaders.length > 0
      ? preferredHeaders
      : rows && rows.length > 0
      ? Object.keys(rows[0])
      : [];
  if (keys.length === 0) return {};

  const scoreLat = (k: string): number => {
    const lower = k.toLowerCase().trim();
    if (lower === "latitude" || lower === "lat" || lower === "y") return 10;
    if (/^lat(?:itude)?[\s_(]/.test(lower) || lower.startsWith("lat")) return 7;
    return 0;
  };
  const scoreLon = (k: string): number => {
    const lower = k.toLowerCase().trim();
    if (lower === "longitude" || lower === "long" || lower === "lon" || lower === "lng" || lower === "x")
      return 10;
    if (/^(?:lon|lng|long|longitude)[\s_(]/.test(lower) || lower.startsWith("lon") || lower.startsWith("lng"))
      return 7;
    return 0;
  };

  let latKey: string | undefined;
  let latScore = 0;
  let lonKey: string | undefined;
  let lonScore = 0;

  for (const k of keys) {
    const sLat = scoreLat(k);
    if (sLat > latScore) {
      latScore = sLat;
      latKey = k;
    }
    const sLon = scoreLon(k);
    if (sLon > lonScore) {
      lonScore = sLon;
      lonKey = k;
    }
  }
  return { latKey, lonKey };
}

/**
 * Extracts a normalized human-readable name for a GeoJSON feature (prioritizes Aquifer / Region names).
 */
export function getFeatureDisplayName(properties: Record<string, any> | null | undefined): string {
  if (!properties) return "Unknown Area";
  const keys = Object.keys(properties);
  const lowerKeys = keys.map((k) => k.toLowerCase());
  let finalName = "Unknown Area";

  const aqKeywords = [
    "aquifer",
    "aq_name",
    "aq_type",
    "prncpl_aq",
    "principal",
    "aqf",
    "aq",
    "litho",
    "desc",
    "rock",
    "forma",
    "geology",
    "system",
    "type",
  ];
  for (const kw of aqKeywords) {
    const idx = lowerKeys.findIndex((k) => k.includes(kw));
    if (idx !== -1) {
      const val = properties[keys[idx]];
      if (val && String(val).trim() !== "" && Number.isNaN(Number(val))) {
        finalName = String(val).trim();
        break;
      }
    }
  }

  if (finalName === "Unknown Area") {
    const stdKeywords = ["name", "state", "district", "basin", "region"];
    for (const kw of stdKeywords) {
      const idx = lowerKeys.findIndex((k) => k.includes(kw));
      if (idx !== -1) {
        const val = properties[keys[idx]];
        if (val && String(val).trim() !== "" && Number.isNaN(Number(val))) {
          finalName = String(val).trim();
          break;
        }
      }
    }
  }

  if (finalName === "Unknown Area") {
    for (const k of keys) {
      const val = properties[k];
      if (typeof val === "string" && val.trim() !== "" && Number.isNaN(Number(val))) {
        const kl = k.toLowerCase();
        if (!kl.includes("shape") && !kl.includes("id") && !kl.includes("code")) {
          finalName = val.trim();
          break;
        }
      }
    }
  }

  if (finalName === "Unknown Area") {
    for (const k of keys) {
      if (properties[k] && String(properties[k]).trim() !== "") {
        finalName = String(properties[k]).trim();
        break;
      }
    }
  }

  if (finalName !== "Unknown Area") {
    return finalName
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  return finalName;
}

export function getStateFromRow(row: Record<string, any> | null | undefined): string {
  if (!row) return "Unknown State";
  const keys = Object.keys(row);
  const stateKey = keys.find((k) => {
    const lower = k.toLowerCase().trim();
    return lower === "state" || lower === "state_name" || lower === "state name" || lower === "state/ut";
  });
  if (stateKey && row[stateKey] !== undefined && row[stateKey] !== null && String(row[stateKey]).trim() !== "") {
    return String(row[stateKey]).trim();
  }
  return "Unknown State";
}

function buildCompositeKey(
  row: Record<string, any>,
  rules: JoinKeyRule[],
  side: "main" | "target"
): { isEmpty: boolean; compositeKey: string; rawDisplay: string } {
  let allEmpty = true;
  const parts: string[] = [];
  const rawParts: string[] = [];

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const col = side === "main" ? r.mainColumn : r.targetColumn;
    const rawVal = col ? row?.[col] : undefined;
    const rawStr = rawVal === undefined || rawVal === null ? "" : String(rawVal).trim();
    if (rawStr !== "") {
      allEmpty = false;
      rawParts.push(rawStr);
    }
    parts.push(normalizeJoinValue(rawVal, r.prefixLength));
  }

  return {
    isEmpty: allEmpty,
    compositeKey: parts.join("|||"),
    rawDisplay: rawParts.join(" / ") || "—",
  };
}

/**
 * Executes a multi-sheet comparison & reconciliation of 1 Main Sheet against N Secondary Sheets (1, 2, 3, 4...).
 * Tracks exact full matches, partial matches (when >=2 secondary sheets are active),
 * unmatched main rows, unmatched rows per secondary sheet, and missing join keys across all sheets.
 */
export function executeMultiSheetMerge(
  mainSheet: MainSheetInput,
  secondarySheets: SecondarySheetInput[],
  options: MergeExecuteOptions = {}
): HydroMergeResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const mode: MergeMode = options.mode ?? "enrich_main";
  const includeStatusColumns = options.includeStatusColumns ?? true;

  const mainRows = Array.isArray(mainSheet.rows) ? mainSheet.rows : [];
  const mainCols =
    mainSheet.selectedColumns.length > 0 ? mainSheet.selectedColumns : mainSheet.headers;

  const activeSecondaries = secondarySheets.filter(
    (s) =>
      Array.isArray(s.rows) &&
      s.rows.length > 0 &&
      s.joinKeys.some((jk) => jk.mainColumn && jk.targetColumn)
  );

  if (activeSecondaries.length === 0) {
    throw new Error("At least one comparison sheet with rows and valid join key mapping is required.");
  }

  // Normalize join rules per active sheet & plan non-colliding output column names
  const usedHeaderNames = new Set<string>();
  const mainOutCols: Array<{ srcCol: string; outCol: string }> = [];
  for (const col of mainCols) {
    if (!col) continue;
    let outCol = col;
    if (usedHeaderNames.has(outCol)) {
      outCol = `${col} (${mainSheet.label || "Main"})`;
    }
    usedHeaderNames.add(outCol);
    mainOutCols.push({ srcCol: col, outCol });
  }

  interface SheetRuntimeIndex {
    sheet: SecondarySheetInput;
    activeJoinKeys: JoinKeyRule[];
    outCols: Array<{ srcCol: string; outCol: string }>;
    keyMap: Map<string, Array<{ row: Record<string, any>; index: number }>>;
    duplicateCursor: Map<string, number>;
    matchedRowIndices: Set<number>;
    missingKeyRows: Record<string, any>[];
    matchedCount: number;
  }

  const runtimes: SheetRuntimeIndex[] = activeSecondaries.map((sheet) => {
    const activeJoinKeys = sheet.joinKeys.filter((jk) => jk.mainColumn && jk.targetColumn);
    const chosenCols = sheet.selectedColumns.length > 0 ? sheet.selectedColumns : sheet.headers;
    const outCols: Array<{ srcCol: string; outCol: string }> = [];

    for (const col of chosenCols) {
      if (!col) continue;
      let outCol = col;
      if (usedHeaderNames.has(outCol)) {
        outCol = `${col} (${sheet.label})`;
      }
      // Guarantee uniqueness even if two sheets have identical aliases
      let bump = 2;
      while (usedHeaderNames.has(outCol)) {
        outCol = `${col} (${sheet.label} #${bump})`;
        bump++;
      }
      usedHeaderNames.add(outCol);
      outCols.push({ srcCol: col, outCol });
    }

    const keyMap = new Map<string, Array<{ row: Record<string, any>; index: number }>>();
    const missingKeyRows: Record<string, any>[] = [];

    for (let idx = 0; idx < sheet.rows.length; idx++) {
      const row = sheet.rows[idx];
      const { isEmpty, compositeKey } = buildCompositeKey(row, activeJoinKeys, "target");
      if (isEmpty || !compositeKey.replace(/\|/g, "")) {
        missingKeyRows.push(row);
      } else {
        const list = keyMap.get(compositeKey);
        if (list) {
          list.push({ row, index: idx });
        } else {
          keyMap.set(compositeKey, [{ row, index: idx }]);
        }
      }
    }

    return {
      sheet,
      activeJoinKeys,
      outCols,
      keyMap,
      duplicateCursor: new Map(),
      matchedRowIndices: new Set(),
      missingKeyRows,
      matchedCount: 0,
    };
  });

  const mergedHeaders: string[] = [];
  if (includeStatusColumns) {
    mergedHeaders.push("_Match_Status", "_Matched_Sheets");
  }
  for (const c of mainOutCols) mergedHeaders.push(c.outCol);
  for (const rt of runtimes) {
    for (const c of rt.outCols) mergedHeaders.push(c.outCol);
  }

  const fullyMatchedRows: MergedRowEntry[] = [];
  const partiallyMatchedRows: MergedRowEntry[] = [];
  const unmatchedMainRows: MergedRowEntry[] = [];
  const mainMissingKeyRows: Record<string, any>[] = [];

  for (let i = 0; i < mainRows.length; i++) {
    const mainRow = mainRows[i];
    const matchedSheetIds: string[] = [];
    const matchedSheetLabels: string[] = [];
    const missingSheetIds: string[] = [];
    const matchedDataBySheet: Array<{
      runtime: SheetRuntimeIndex;
      matchedRow: Record<string, any>;
    }> = [];

    let hasAnyNonEmptyMainKey = false;
    let firstRawDisplay = "";

    for (let s = 0; s < runtimes.length; s++) {
      const rt = runtimes[s];
      const { isEmpty, compositeKey, rawDisplay } = buildCompositeKey(
        mainRow,
        rt.activeJoinKeys,
        "main"
      );

      if (!firstRawDisplay && rawDisplay !== "—") {
        firstRawDisplay = rawDisplay;
      }

      if (isEmpty || !compositeKey.replace(/\|/g, "")) {
        missingSheetIds.push(rt.sheet.id);
        continue;
      }

      hasAnyNonEmptyMainKey = true;
      const candidates = rt.keyMap.get(compositeKey);

      if (candidates && candidates.length > 0) {
        const cursor = rt.duplicateCursor.get(compositeKey) || 0;
        let chosen: { row: Record<string, any>; index: number };
        if (cursor < candidates.length) {
          chosen = candidates[cursor];
          rt.duplicateCursor.set(compositeKey, cursor + 1);
          rt.matchedRowIndices.add(chosen.index);
        } else {
          // Consistent 1-to-N fallback matching last secondary occurrence
          chosen = candidates[candidates.length - 1];
        }
        matchedSheetIds.push(rt.sheet.id);
        matchedSheetLabels.push(rt.sheet.label);
        rt.matchedCount++;
        matchedDataBySheet.push({ runtime: rt, matchedRow: chosen.row });
      } else {
        missingSheetIds.push(rt.sheet.id);
      }
    }

    if (!hasAnyNonEmptyMainKey) {
      mainMissingKeyRows.push(mainRow);
      continue;
    }

    const totalSec = runtimes.length;
    const matchCount = matchedSheetIds.length;
    const status: "full" | "partial" | "unmatched" =
      matchCount === totalSec ? "full" : matchCount > 0 ? "partial" : "unmatched";

    const combinedRow: Record<string, any> = {};
    if (includeStatusColumns) {
      combinedRow._Match_Status =
        status === "full"
          ? `Full Match (${matchCount}/${totalSec})`
          : status === "partial"
          ? `Partial Match (${matchCount}/${totalSec})`
          : `Unmatched (0/${totalSec})`;
      combinedRow._Matched_Sheets = matchedSheetLabels.length > 0 ? matchedSheetLabels.join(", ") : "None";
    }

    for (const c of mainOutCols) {
      if (mainRow[c.srcCol] !== undefined) {
        combinedRow[c.outCol] = mainRow[c.srcCol];
      }
    }

    for (const pair of matchedDataBySheet) {
      for (const c of pair.runtime.outCols) {
        if (pair.matchedRow[c.srcCol] !== undefined) {
          combinedRow[c.outCol] = pair.matchedRow[c.srcCol];
        }
      }
    }

    const entry: MergedRowEntry = {
      mainRowIndex: i,
      mainKeyDisplay: firstRawDisplay || `Row ${i + 1}`,
      matchedSheetIds,
      missingSheetIds,
      matchCount,
      totalSecondarySheets: totalSec,
      status,
      data: combinedRow,
    };

    if (status === "full") {
      fullyMatchedRows.push(entry);
    } else if (status === "partial") {
      partiallyMatchedRows.push(entry);
    } else {
      unmatchedMainRows.push(entry);
    }
  }

  // Build per-secondary-sheet unmatched / missing audit lists
  const sheetSummaries: PerSheetMergeSummary[] = runtimes.map((rt) => {
    const unmatchedRows: Record<string, any>[] = [];
    for (let idx = 0; idx < rt.sheet.rows.length; idx++) {
      const row = rt.sheet.rows[idx];
      const { isEmpty, compositeKey } = buildCompositeKey(row, rt.activeJoinKeys, "target");
      if (!isEmpty && compositeKey.replace(/\|/g, "") && !rt.matchedRowIndices.has(idx)) {
        unmatchedRows.push(row);
      }
    }
    const validKeyRows = Math.max(0, rt.sheet.rows.length - rt.missingKeyRows.length);
    const matchRatePct =
      validKeyRows > 0
        ? Math.min(100, Math.round((rt.matchedRowIndices.size / validKeyRows) * 1000) / 10)
        : 0;

    return {
      sheetId: rt.sheet.id,
      label: rt.sheet.label,
      totalRows: rt.sheet.rows.length,
      matchedCount: rt.matchedCount,
      unmatchedCount: unmatchedRows.length,
      missingKeyCount: rt.missingKeyRows.length,
      matchRatePct,
      unmatchedRows,
      missingKeyRows: rt.missingKeyRows,
    };
  });

  let exportedMergedRows: Record<string, any>[];
  if (mode === "inner_all") {
    exportedMergedRows = fullyMatchedRows.map((e) => e.data);
  } else if (mode === "match_any") {
    exportedMergedRows = [...fullyMatchedRows, ...partiallyMatchedRows].map((e) => e.data);
  } else {
    exportedMergedRows = [...fullyMatchedRows, ...partiallyMatchedRows, ...unmatchedMainRows].map(
      (e) => e.data
    );
  }

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    mode,
    mainLabel: mainSheet.label || "Main Sheet",
    mainTotalRows: mainRows.length,
    mainMissingKeyRows,
    fullyMatchedRows,
    partiallyMatchedRows,
    unmatchedMainRows,
    exportedMergedRows,
    mergedHeaders,
    sheetSummaries,
    executionMs: Math.max(0, Math.round((t1 - t0) * 10) / 10),
  };
}

/**
 * Spatial intersection statistics across GeoJSON polygons and merged reconciliation statuses.
 */
export function computeRegionalAreaStats(
  geoJson: GeoJSON.FeatureCollection | null | undefined,
  result: HydroMergeResult
): { summaries: AreaStatSummary[]; detailedRows: AreaDetailedRow[] } {
  if (!geoJson || !Array.isArray(geoJson.features)) {
    return { summaries: [], detailedRows: [] };
  }

  interface SpatialPt {
    lon: number;
    lat: number;
    state: string;
    category: "full" | "partial" | "unmatched";
  }

  const points: SpatialPt[] = [];

  const ingestEntries = (entries: MergedRowEntry[], category: "full" | "partial" | "unmatched") => {
    if (entries.length === 0) return;
    const rawRows = entries.map((e) => e.data);
    const { latKey, lonKey } = detectCoordinateColumns(rawRows, result.mergedHeaders);
    if (!latKey || !lonKey) return;
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const lat = parseGeoCoord(row[latKey]);
      const lon = parseGeoCoord(row[lonKey]);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        points.push({ lon, lat, state: getStateFromRow(row), category });
      }
    }
  };

  ingestEntries(result.fullyMatchedRows, "full");
  ingestEntries(result.partiallyMatchedRows, "partial");
  ingestEntries(result.unmatchedMainRows, "unmatched");

  // Also include secondary sheet unmatched points if coordinates exist
  for (const sheetSum of result.sheetSummaries) {
    if (sheetSum.unmatchedRows.length === 0) continue;
    const { latKey, lonKey } = detectCoordinateColumns(sheetSum.unmatchedRows);
    if (!latKey || !lonKey) continue;
    for (let i = 0; i < sheetSum.unmatchedRows.length; i++) {
      const row = sheetSum.unmatchedRows[i];
      const lat = parseGeoCoord(row[latKey]);
      const lon = parseGeoCoord(row[lonKey]);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        points.push({ lon, lat, state: getStateFromRow(row), category: "unmatched" });
      }
    }
  }

  const regionPolys = new Map<string, Array<{ feat: any; bbox: [number, number, number, number] }>>();
  for (const feat of geoJson.features) {
    if (!feat?.geometry?.type?.includes("Polygon")) continue;
    const name = getFeatureDisplayName(feat.properties as Record<string, any>);
    let bbox: [number, number, number, number];
    try {
      const b = turf.bbox(feat as any);
      bbox = [b[0], b[1], b[2], b[3]];
    } catch {
      continue;
    }
    const list = regionPolys.get(name);
    if (list) list.push({ feat, bbox });
    else regionPolys.set(name, [{ feat, bbox }]);
  }

  const summaries: AreaStatSummary[] = [];
  const detailedRows: AreaDetailedRow[] = [];

  for (const [regionName, polys] of regionPolys.entries()) {
    const matchedPointIndices = new Set<number>();
    const stateMap = new Map<string, { full: number; partial: number; unmatched: number }>();

    for (let p = 0; p < polys.length; p++) {
      const { feat, bbox } = polys[p];
      for (let i = 0; i < points.length; i++) {
        if (matchedPointIndices.has(i)) continue;
        const pt = points[i];
        if (fastPointInFeature(pt.lon, pt.lat, feat, bbox)) {
          matchedPointIndices.add(i);
          let st = stateMap.get(pt.state);
          if (!st) {
            st = { full: 0, partial: 0, unmatched: 0 };
            stateMap.set(pt.state, st);
          }
          st[pt.category]++;
        }
      }
    }

    let fullTotal = 0;
    let partialTotal = 0;
    let unTotal = 0;
    for (const [stateName, counts] of stateMap.entries()) {
      fullTotal += counts.full;
      partialTotal += counts.partial;
      unTotal += counts.unmatched;
      detailedRows.push({
        "Principal Aquifer": regionName,
        State: stateName,
        "Matched (All Sheets)": counts.full,
        "Partial Matches": counts.partial,
        "Unmatched Samples": counts.unmatched,
        "Total Samples": counts.full + counts.partial + counts.unmatched,
      });
    }

    summaries.push({
      name: regionName,
      fullMatched: fullTotal,
      partialMatched: partialTotal,
      unmatched: unTotal,
      total: fullTotal + partialTotal + unTotal,
    });
  }

  summaries.sort((a, b) => b.total - a.total);
  detailedRows.sort((a, b) => b["Total Samples"] - a["Total Samples"]);

  return { summaries, detailedRows };
}

/**
 * Generates clipped square grid cells over a selected GeoJSON area/collection and identifies empty vs sampled cells.
 */
export function generateHydroGridAnalysis(
  targetGeoJson: GeoJSON.Feature | GeoJSON.FeatureCollection,
  areaSqKm: number,
  result: HydroMergeResult | null
): GridAnalysisSummary {
  if (!Number.isFinite(areaSqKm) || areaSqKm <= 0) {
    throw new Error("Grid cell area must be a positive number in km².");
  }

  const sideKm = Math.sqrt(areaSqKm);
  const mapBbox = turf.bbox(targetGeoJson as any);
  const grid = turf.squareGrid(mapBbox, sideKm, { units: "kilometers" });

  // Safety guard against huge accidental grids
  if (grid.features.length > 6000) {
    throw new Error(
      `Grid size (${areaSqKm} km²) creates ${grid.features.length.toLocaleString()} cells. Increase Area (km²) so total cells stay below 6,000.`
    );
  }

  const featuresToCheck: any[] =
    targetGeoJson.type === "FeatureCollection"
      ? targetGeoJson.features.filter((f) => f?.geometry?.type?.includes("Polygon"))
      : [targetGeoJson];

  const featBboxes = featuresToCheck.map((f) => {
    try {
      return turf.bbox(f);
    } catch {
      return null;
    }
  });

  // Collect points inside overall bbox
  const points: Array<[number, number]> = [];
  if (result) {
    const collectPts = (rows: Record<string, any>[]) => {
      if (rows.length === 0) return;
      const { latKey, lonKey } = detectCoordinateColumns(rows);
      if (!latKey || !lonKey) return;
      for (let i = 0; i < rows.length; i++) {
        const lat = parseGeoCoord(rows[i][latKey]);
        const lon = parseGeoCoord(rows[i][lonKey]);
        if (
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          lon >= mapBbox[0] &&
          lon <= mapBbox[2] &&
          lat >= mapBbox[1] &&
          lat <= mapBbox[3]
        ) {
          points.push([lon, lat]);
        }
      }
    };
    collectPts(result.exportedMergedRows);
    for (const s of result.sheetSummaries) {
      collectPts(s.unmatchedRows);
    }
  }

  const clippedGrids: any[] = [];
  let emptyCount = 0;

  for (let i = 0; i < grid.features.length; i++) {
    const cell = grid.features[i];
    const cellBbox = turf.bbox(cell);

    let ptCount = 0;
    for (let p = 0; p < points.length; p++) {
      const pt = points[p];
      if (
        pt[0] >= cellBbox[0] &&
        pt[0] <= cellBbox[2] &&
        pt[1] >= cellBbox[1] &&
        pt[1] <= cellBbox[3]
      ) {
        ptCount++;
      }
    }

    const isEmpty = ptCount === 0;
    let finalCell: any = null;

    for (let j = 0; j < featuresToCheck.length; j++) {
      const feat = featuresToCheck[j];
      const fBbox = featBboxes[j];
      if (!fBbox) continue;
      if (
        cellBbox[0] > fBbox[2] ||
        cellBbox[2] < fBbox[0] ||
        cellBbox[1] > fBbox[3] ||
        cellBbox[3] < fBbox[1]
      ) {
        continue;
      }

      try {
        if (turf.booleanWithin(cell, feat)) {
          finalCell = cell;
          break;
        }
      } catch {
        // Ignore invalid rings
      }

      try {
        if (turf.booleanIntersects(cell, feat)) {
          try {
            const clipped = turf.intersect(turf.featureCollection([cell as any, feat as any]));
            if (clipped) {
              if (!finalCell) {
                finalCell = clipped;
              } else {
                const combined = turf.union(turf.featureCollection([finalCell, clipped]));
                if (combined) finalCell = combined;
              }
            } else if (!finalCell) {
              finalCell = cell;
            }
          } catch {
            if (!finalCell) finalCell = cell;
          }
        }
      } catch {
        // Ignore topology errors
      }
    }

    if (finalCell) {
      finalCell.properties = { pointCount: ptCount, isEmpty };
      if (isEmpty) emptyCount++;
      clippedGrids.push(finalCell);
    }
  }

  return {
    emptyCount,
    occupiedCount: clippedGrids.length - emptyCount,
    totalCells: clippedGrids.length,
    clippedGrids: turf.featureCollection(clippedGrids),
  };
}
