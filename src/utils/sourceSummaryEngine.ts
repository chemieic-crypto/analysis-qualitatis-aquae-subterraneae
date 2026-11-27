import { DataHeaders } from "../types";
import { PARAM_CONFIG, hasBisLimit } from "../data/config";
import { getRowStateValue, getRowDistrictValue, getRowBlockValue } from "./advancedAnalysisHelpers";
import { canonicalCaseKey, toProperCaseLabel } from "./textNormalization";

export interface SourceParamStatRow {
  sourceName: string;
  isOverall: boolean;
  paramCode: string;
  paramName: string;
  originalHeader: string;
  unit: string;
  hasBisLimit: boolean;
  permissibleLimitLabel: string;
  totalSamples: number;
  min: number | null;
  p05: number | null;
  p75: number | null;
  p99: number | null;
  max: number | null;
  abovePermissibleCount: number | null;
  abovePermissiblePct: number | null;
}

export interface SourceOverviewItem {
  sourceName: string;
  rowCount: number;
  exceedingParamCount: number;
}

export interface ParamMetaDescriptor {
  paramCode: string;
  paramName: string;
  originalHeader: string;
  unit: string;
  hasBisLimit: boolean;
  permissibleLimitLabel: string;
}

export interface SourceAllParamsResult {
  sources: SourceOverviewItem[];
  paramList: ParamMetaDescriptor[];
  rows: SourceParamStatRow[];
  overallRows: SourceParamStatRow[];
  totalInputRows: number;
}

export interface StateParamStatRow {
  stateName: string;
  isOverall: boolean;
  paramCode: string;
  paramName: string;
  originalHeader: string;
  unit: string;
  hasBisLimit: boolean;
  permissibleLimitLabel: string;
  totalSamples: number;
  min: number | null;
  p05: number | null;
  p75: number | null;
  p99: number | null;
  max: number | null;
  abovePermissibleCount: number | null;
  abovePermissiblePct: number | null;
}

export interface StateOverviewItem {
  stateName: string;
  rowCount: number;
  exceedingParamCount: number;
}

export interface StateWiseSummaryResult {
  states: StateOverviewItem[];
  paramList: ParamMetaDescriptor[];
  rows: StateParamStatRow[];
  overallRows: StateParamStatRow[];
  totalFilteredRows: number;
}

export interface ExceedingParamDetail {
  paramCode: string;
  paramName: string;
  value: number;
  formattedValue: string;
  unit: string;
  permissibleLimitLabel: string;
}

export interface SourceExceedingLocationRow {
  rowIndex: number;
  state: string;
  district: string;
  block: string;
  location: string;
  source: string;
  exceedingCount: number;
  exceedingParamNames: string;
  exceedingParamCodes: string[];
  exceedingValuesWithUnits: string;
  exceedingDetails: ExceedingParamDetail[];
}

export interface SourceSummaryFilterOptions {
  selectedSources?: string[];
  selectedParamCodes?: string[];
}

/**
 * Computes linear-interpolated percentile on an already-sorted ascending array in O(1).
 * Matches src/utils/math.ts getPercentile semantics exactly without re-sorting.
 */
export function percentileFromSorted(sorted: number[], pct: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const idx = (pct / 100) * (n - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function parseNumericSample(rawVal: unknown): number {
  if (rawVal === null || rawVal === undefined || rawVal === "") return NaN;
  if (typeof rawVal === "number") return Number.isFinite(rawVal) ? rawVal : NaN;
  const str = String(rawVal).trim();
  if (!str) return NaN;
  const lower = str.toLowerCase();
  if (lower === "bdl" || lower === "nd" || lower === "nil" || lower === "nill" || lower === "absent") {
    return 0;
  }
  if (lower.startsWith("<")) {
    const n = parseFloat(str.slice(1).trim().replace(/,/g, "."));
    return Number.isFinite(n) ? n / 2 : 0;
  }
  const n = parseFloat(str.replace(/,/g, "."));
  return Number.isFinite(n) ? n : NaN;
}

function isMolybdenumParam(code: string, header: string): boolean {
  const c = code.trim().toLowerCase();
  const h = header.trim().toLowerCase();
  return c === "mo" || c.includes("molybd") || h === "mo" || h.includes("molybd");
}

interface InternalParamMeta extends ParamMetaDescriptor {
  b1: number;
  b2: number;
}

function resolveParamMeta(originalHeader: string, headerMap: Record<string, string>): InternalParamMeta {
  const mappedCode = (headerMap[originalHeader] || originalHeader).trim();
  const cfg = PARAM_CONFIG[mappedCode];
  const unit = cfg?.unit || "";
  const paramName = cfg?.name || originalHeader;

  const bisSupported = Boolean(
    cfg &&
      hasBisLimit(mappedCode) &&
      (mappedCode === "pH"
        ? Number.isFinite(cfg.b1) && Number.isFinite(cfg.b2) && cfg.b2 > cfg.b1
        : Number.isFinite(cfg.b2) && cfg.b2 > 0)
  );

  let permissibleLimitLabel = "No BIS limit";
  if (bisSupported && cfg) {
    if (mappedCode === "pH") {
      permissibleLimitLabel = `${cfg.b1}–${cfg.b2}`;
    } else {
      permissibleLimitLabel = `≤ ${cfg.b2}${unit ? ` ${unit}` : ""}`;
    }
  }

  return {
    paramCode: mappedCode,
    paramName,
    originalHeader,
    unit,
    hasBisLimit: bisSupported,
    permissibleLimitLabel,
    b1: cfg?.b1 ?? 0,
    b2: cfg?.b2 ?? 0
  };
}

function buildDedupedParamMetas(
  headers: DataHeaders,
  headerMap: Record<string, string>,
  selectedParamCodes?: string[]
): InternalParamMeta[] {
  const paramCols = (headers?.params || []).filter((col) => {
    const code = headerMap[col] || col;
    return !isMolybdenumParam(code, col);
  });

  const selectedSet =
    selectedParamCodes && selectedParamCodes.length > 0
      ? new Set(selectedParamCodes.map((c) => c.trim().toLowerCase()))
      : null;

  const seenCodes = new Set<string>();
  const metas: InternalParamMeta[] = [];
  for (let i = 0; i < paramCols.length; i++) {
    const meta = resolveParamMeta(paramCols[i], headerMap);
    const dedupKey = meta.paramCode.toLowerCase();
    if (seenCodes.has(dedupKey)) continue;
    seenCodes.add(dedupKey);
    if (selectedSet && !selectedSet.has(dedupKey)) continue;
    metas.push(meta);
  }
  return metas;
}

function isValueAbovePermissible(val: number, meta: InternalParamMeta): boolean {
  if (!meta.hasBisLimit) return false;
  if (meta.paramCode === "pH") {
    return val < meta.b1 || val > meta.b2;
  }
  return val > meta.b2;
}

function extractSourceName(row: Record<string, any>, sourceColumn: string): string {
  const rawSrc = row[sourceColumn];
  if (rawSrc === undefined || rawSrc === null) return "Not Specified";
  const proper = toProperCaseLabel(rawSrc);
  return proper || "Not Specified";
}

export function getRowLocationValue(row: Record<string, unknown>, headers: DataHeaders): string {
  const locCol = headers.location;
  if (locCol && row[locCol] !== undefined && row[locCol] !== null && String(row[locCol]).trim() !== "") {
    return toProperCaseLabel(row[locCol]) || "—";
  }
  const wellCol = headers.wellId;
  if (wellCol && row[wellCol] !== undefined && row[wellCol] !== null && String(row[wellCol]).trim() !== "") {
    return String(row[wellCol]).trim();
  }
  const fallbackKey = Object.keys(row).find((k) =>
    [
      "location",
      "village",
      "site",
      "station",
      "station_name",
      "site_name",
      "location_name",
      "locality",
      "place",
      "well_id",
      "well id",
      "wellid",
      "sample_id",
      "sample id"
    ].includes(k.toLowerCase().trim())
  );
  if (fallbackKey && row[fallbackKey] !== undefined && row[fallbackKey] !== null && String(row[fallbackKey]).trim() !== "") {
    const isIdCol = /id$/i.test(fallbackKey.trim());
    return isIdCol ? String(row[fallbackKey]).trim() : (toProperCaseLabel(row[fallbackKey]) || "—");
  }
  return "—";
}

function computeStatCore(values: number[], meta: InternalParamMeta) {
  const n = values.length;
  if (n === 0) {
    return {
      totalSamples: 0,
      min: null as number | null,
      p05: null as number | null,
      p75: null as number | null,
      p99: null as number | null,
      max: null as number | null,
      abovePermissibleCount: null as number | null,
      abovePermissiblePct: null as number | null
    };
  }

  values.sort((a, b) => a - b);

  const min = values[0];
  const max = values[n - 1];
  const p05 = percentileFromSorted(values, 5);
  const p75 = percentileFromSorted(values, 75);
  const p99 = percentileFromSorted(values, 99);

  let abovePermissibleCount: number | null = null;
  let abovePermissiblePct: number | null = null;

  if (meta.hasBisLimit) {
    let exceed = 0;
    if (meta.paramCode === "pH") {
      for (let i = 0; i < n; i++) {
        if (values[i] < meta.b1 || values[i] > meta.b2) exceed++;
      }
    } else {
      for (let i = 0; i < n; i++) {
        if (values[i] > meta.b2) exceed++;
      }
    }
    abovePermissibleCount = exceed;
    abovePermissiblePct = (exceed / n) * 100;
  }

  return {
    totalSamples: n,
    min,
    p05,
    p75,
    p99,
    max,
    abovePermissibleCount,
    abovePermissiblePct
  };
}

function toParamDescriptors(metas: InternalParamMeta[]): ParamMetaDescriptor[] {
  return metas.map((m) => ({
    paramCode: m.paramCode,
    paramName: m.paramName,
    originalHeader: m.originalHeader,
    unit: m.unit,
    hasBisLimit: m.hasBisLimit,
    permissibleLimitLabel: m.permissibleLimitLabel
  }));
}

/**
 * Computes Source-Wise All-Parameter Summary statistics in a single pass + single sort per bucket.
 * Includes Min, Max, 5th/75th/99th percentiles, Above Permissible Limit count & %, and Total Samples
 * for every water quality parameter in the dataset (excluding Molybdenum).
 */
export function computeSourceAllParamsSummary(
  dataRows: Record<string, any>[],
  headers: DataHeaders,
  headerMap: Record<string, string>,
  sourceColumn: string
): SourceAllParamsResult {
  const metas = buildDedupedParamMetas(headers, headerMap);
  const paramList = toParamDescriptors(metas);

  if (!dataRows || dataRows.length === 0 || metas.length === 0 || !sourceColumn) {
    return {
      sources: [],
      paramList,
      rows: [],
      overallRows: [],
      totalInputRows: dataRows?.length || 0
    };
  }

  const numParams = metas.length;
  const sourceBuckets = new Map<string, { rowCount: number; paramValues: number[][] }>();
  const overallParamValues: number[][] = Array.from({ length: numParams }, () => []);

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (!row) continue;

    const srcName = extractSourceName(row, sourceColumn);

    let bucket = sourceBuckets.get(srcName);
    if (!bucket) {
      bucket = {
        rowCount: 0,
        paramValues: Array.from({ length: numParams }, () => [])
      };
      sourceBuckets.set(srcName, bucket);
    }
    bucket.rowCount++;

    for (let p = 0; p < numParams; p++) {
      const val = parseNumericSample(row[metas[p].originalHeader]);
      if (!Number.isNaN(val)) {
        bucket.paramValues[p].push(val);
        overallParamValues[p].push(val);
      }
    }
  }

  const sortedSourceEntries = Array.from(sourceBuckets.entries()).sort((a, b) => {
    if (b[1].rowCount !== a[1].rowCount) return b[1].rowCount - a[1].rowCount;
    return a[0].localeCompare(b[0]);
  });

  const rows: SourceParamStatRow[] = [];
  const sources: SourceOverviewItem[] = [];

  for (let s = 0; s < sortedSourceEntries.length; s++) {
    const [srcName, bucket] = sortedSourceEntries[s];
    let exceedingParamCount = 0;

    for (let p = 0; p < numParams; p++) {
      const meta = metas[p];
      const core = computeStatCore(bucket.paramValues[p], meta);
      if (core.abovePermissibleCount !== null && core.abovePermissibleCount > 0) {
        exceedingParamCount++;
      }
      rows.push({
        sourceName: srcName,
        isOverall: false,
        paramCode: meta.paramCode,
        paramName: meta.paramName,
        originalHeader: meta.originalHeader,
        unit: meta.unit,
        hasBisLimit: meta.hasBisLimit,
        permissibleLimitLabel: meta.permissibleLimitLabel,
        ...core
      });
    }

    sources.push({
      sourceName: srcName,
      rowCount: bucket.rowCount,
      exceedingParamCount
    });
  }

  const overallRows: SourceParamStatRow[] = [];
  for (let p = 0; p < numParams; p++) {
    const meta = metas[p];
    const core = computeStatCore(overallParamValues[p], meta);
    overallRows.push({
      sourceName: "All Sources (Combined)",
      isOverall: true,
      paramCode: meta.paramCode,
      paramName: meta.paramName,
      originalHeader: meta.originalHeader,
      unit: meta.unit,
      hasBisLimit: meta.hasBisLimit,
      permissibleLimitLabel: meta.permissibleLimitLabel,
      ...core
    });
  }

  return {
    sources,
    paramList,
    rows,
    overallRows,
    totalInputRows: dataRows.length
  };
}

/**
 * Computes State-Wise & Selected-Parameter-Wise Summary for the selected water source(s).
 * Produces Min, P05, P75, P99, Max, Total Samples, and Above Permissible Limit (No. & %) per State.
 */
export function computeStateWiseSelectedSummary(
  dataRows: Record<string, any>[],
  headers: DataHeaders,
  headerMap: Record<string, string>,
  sourceColumn: string,
  options: SourceSummaryFilterOptions = {}
): StateWiseSummaryResult {
  const metas = buildDedupedParamMetas(headers, headerMap, options.selectedParamCodes);
  const paramList = toParamDescriptors(metas);

  if (!dataRows || dataRows.length === 0 || metas.length === 0 || !sourceColumn) {
    return {
      states: [],
      paramList,
      rows: [],
      overallRows: [],
      totalFilteredRows: 0
    };
  }

  const sourceFilterSet =
    options.selectedSources && options.selectedSources.length > 0
      ? new Set(options.selectedSources.map((s) => canonicalCaseKey(s)))
      : null;

  const numParams = metas.length;
  const stateBuckets = new Map<string, { displayName: string; rowCount: number; paramValues: number[][] }>();
  const overallParamValues: number[][] = Array.from({ length: numParams }, () => []);
  let totalFilteredRows = 0;

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (!row) continue;

    if (sourceFilterSet) {
      const srcName = extractSourceName(row, sourceColumn);
      if (!sourceFilterSet.has(canonicalCaseKey(srcName))) continue;
    }

    totalFilteredRows++;
    const rawState = getRowStateValue(row, headers);
    const stateName = rawState || "Not Specified";
    const stateKey = canonicalCaseKey(stateName);

    let bucket = stateBuckets.get(stateKey);
    if (!bucket) {
      bucket = {
        displayName: stateName,
        rowCount: 0,
        paramValues: Array.from({ length: numParams }, () => [])
      };
      stateBuckets.set(stateKey, bucket);
    }
    bucket.rowCount++;

    for (let p = 0; p < numParams; p++) {
      const val = parseNumericSample(row[metas[p].originalHeader]);
      if (!Number.isNaN(val)) {
        bucket.paramValues[p].push(val);
        overallParamValues[p].push(val);
      }
    }
  }

  const sortedStates = Array.from(stateBuckets.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const rows: StateParamStatRow[] = [];
  const states: StateOverviewItem[] = [];

  for (let s = 0; s < sortedStates.length; s++) {
    const bucket = sortedStates[s];
    const stateName = bucket.displayName;
    let exceedingParamCount = 0;

    for (let p = 0; p < numParams; p++) {
      const meta = metas[p];
      const core = computeStatCore(bucket.paramValues[p], meta);
      if (core.abovePermissibleCount !== null && core.abovePermissibleCount > 0) {
        exceedingParamCount++;
      }
      rows.push({
        stateName,
        isOverall: false,
        paramCode: meta.paramCode,
        paramName: meta.paramName,
        originalHeader: meta.originalHeader,
        unit: meta.unit,
        hasBisLimit: meta.hasBisLimit,
        permissibleLimitLabel: meta.permissibleLimitLabel,
        ...core
      });
    }

    states.push({
      stateName,
      rowCount: bucket.rowCount,
      exceedingParamCount
    });
  }

  const overallRows: StateParamStatRow[] = [];
  for (let p = 0; p < numParams; p++) {
    const meta = metas[p];
    const core = computeStatCore(overallParamValues[p], meta);
    overallRows.push({
      stateName: "All States (Combined)",
      isOverall: true,
      paramCode: meta.paramCode,
      paramName: meta.paramName,
      originalHeader: meta.originalHeader,
      unit: meta.unit,
      hasBisLimit: meta.hasBisLimit,
      permissibleLimitLabel: meta.permissibleLimitLabel,
      ...core
    });
  }

  return {
    states,
    paramList,
    rows,
    overallRows,
    totalFilteredRows
  };
}

/**
 * Finds all sample locations where one or more selected parameters exceed BIS permissible limits
 * for the selected water source(s), returning State, District, Block, Location, Source,
 * exceedance count, parameter names, and formatted values with units.
 */
export function computeSourceExceedingLocations(
  dataRows: Record<string, any>[],
  headers: DataHeaders,
  headerMap: Record<string, string>,
  sourceColumn: string,
  options: SourceSummaryFilterOptions = {}
): SourceExceedingLocationRow[] {
  if (!dataRows || dataRows.length === 0 || !sourceColumn) return [];

  const metas = buildDedupedParamMetas(headers, headerMap, options.selectedParamCodes).filter(
    (m) => m.hasBisLimit
  );
  if (metas.length === 0) return [];

  const sourceFilterSet =
    options.selectedSources && options.selectedSources.length > 0
      ? new Set(options.selectedSources.map((s) => canonicalCaseKey(s)))
      : null;

  const results: SourceExceedingLocationRow[] = [];

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (!row) continue;

    const srcName = extractSourceName(row, sourceColumn);
    if (sourceFilterSet && !sourceFilterSet.has(canonicalCaseKey(srcName))) continue;

    const exceedingDetails: ExceedingParamDetail[] = [];

    for (let p = 0; p < metas.length; p++) {
      const meta = metas[p];
      const val = parseNumericSample(row[meta.originalHeader]);
      if (Number.isNaN(val)) continue;
      if (isValueAbovePermissible(val, meta)) {
        exceedingDetails.push({
          paramCode: meta.paramCode,
          paramName: meta.paramName,
          value: val,
          formattedValue: formatSummaryValue(val),
          unit: meta.unit,
          permissibleLimitLabel: meta.permissibleLimitLabel
        });
      }
    }

    if (exceedingDetails.length > 0) {
      const state = getRowStateValue(row, headers) || "—";
      const district = getRowDistrictValue(row, headers) || "—";
      const block = getRowBlockValue(row, headers) || "—";
      const location = getRowLocationValue(row, headers);

      const exceedingParamNames = exceedingDetails
        .map((d) => (d.paramName !== d.paramCode ? `${d.paramName} (${d.paramCode})` : d.paramCode))
        .join(", ");

      const exceedingValuesWithUnits = exceedingDetails
        .map((d) => `${d.paramCode}: ${d.formattedValue}${d.unit ? ` ${d.unit}` : ""}`)
        .join("; ");

      results.push({
        rowIndex: r,
        state,
        district,
        block,
        location,
        source: srcName,
        exceedingCount: exceedingDetails.length,
        exceedingParamNames,
        exceedingParamCodes: exceedingDetails.map((d) => d.paramCode),
        exceedingValuesWithUnits,
        exceedingDetails
      });
    }
  }

  // Sort by highest number of exceeding parameters first, then alphabetically by State / District / Block / Location
  results.sort((a, b) => {
    if (b.exceedingCount !== a.exceedingCount) return b.exceedingCount - a.exceedingCount;
    const stCmp = a.state.localeCompare(b.state);
    if (stCmp !== 0) return stCmp;
    const dtCmp = a.district.localeCompare(b.district);
    if (dtCmp !== 0) return dtCmp;
    const blkCmp = a.block.localeCompare(b.block);
    if (blkCmp !== 0) return blkCmp;
    return a.location.localeCompare(b.location);
  });

  return results;
}

export interface StateAffectedParamBreakdownItem {
  paramCode: string;
  paramName: string;
  count: number;
}

export interface StateAffectedSummaryRow {
  stateName: string;
  isOverall: boolean;
  totalSamples: number;
  affectedLocationsCount: number;
  affectedLocationsPct: number;
  affectedParamNames: string;
  affectedParamBreakdown: StateAffectedParamBreakdownItem[];
}

export interface StateAffectedSummaryResult {
  rows: StateAffectedSummaryRow[];
  overall: StateAffectedSummaryRow;
}

/**
 * Computes a compact State-wise table summarizing:
 * State | No. of Samples | No. of Locations Affected (>= 1 selected parameter above BIS permissible limit) | Name of Parameter(s).
 * A location exceeding multiple parameters is counted ONCE in affectedLocationsCount.
 */
export function computeStateAffectedSummary(
  dataRows: Record<string, any>[],
  headers: DataHeaders,
  headerMap: Record<string, string>,
  sourceColumn: string,
  options: SourceSummaryFilterOptions = {}
): StateAffectedSummaryResult {
  const emptyOverall: StateAffectedSummaryRow = {
    stateName: "All States (Total)",
    isOverall: true,
    totalSamples: 0,
    affectedLocationsCount: 0,
    affectedLocationsPct: 0,
    affectedParamNames: "None",
    affectedParamBreakdown: []
  };

  if (!dataRows || dataRows.length === 0 || !sourceColumn) {
    return { rows: [], overall: emptyOverall };
  }

  const bisMetas = buildDedupedParamMetas(headers, headerMap, options.selectedParamCodes).filter(
    (m) => m.hasBisLimit
  );

  const sourceFilterSet =
    options.selectedSources && options.selectedSources.length > 0
      ? new Set(options.selectedSources.map((s) => canonicalCaseKey(s)))
      : null;

  const stateMap = new Map<
    string,
    { displayName: string; totalSamples: number; affectedLocationsCount: number; paramCounts: Map<string, StateAffectedParamBreakdownItem> }
  >();
  const overallParamCounts = new Map<string, StateAffectedParamBreakdownItem>();
  let overallTotalSamples = 0;
  let overallAffectedLocations = 0;

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (!row) continue;

    if (sourceFilterSet) {
      const srcName = extractSourceName(row, sourceColumn);
      if (!sourceFilterSet.has(canonicalCaseKey(srcName))) continue;
    }

    const rawState = getRowStateValue(row, headers);
    const stateName = rawState || "Not Specified";
    const stateKey = canonicalCaseKey(stateName);

    let bucket = stateMap.get(stateKey);
    if (!bucket) {
      bucket = {
        displayName: stateName,
        totalSamples: 0,
        affectedLocationsCount: 0,
        paramCounts: new Map<string, StateAffectedParamBreakdownItem>()
      };
      stateMap.set(stateKey, bucket);
    }

    bucket.totalSamples++;
    overallTotalSamples++;

    let rowAffected = false;
    for (let p = 0; p < bisMetas.length; p++) {
      const meta = bisMetas[p];
      const val = parseNumericSample(row[meta.originalHeader]);
      if (Number.isNaN(val)) continue;

      if (isValueAbovePermissible(val, meta)) {
        rowAffected = true;

        const existingSt = bucket.paramCounts.get(meta.paramCode);
        if (existingSt) existingSt.count++;
        else bucket.paramCounts.set(meta.paramCode, { paramCode: meta.paramCode, paramName: meta.paramName, count: 1 });

        const existingOv = overallParamCounts.get(meta.paramCode);
        if (existingOv) existingOv.count++;
        else overallParamCounts.set(meta.paramCode, { paramCode: meta.paramCode, paramName: meta.paramName, count: 1 });
      }
    }

    if (rowAffected) {
      bucket.affectedLocationsCount++;
      overallAffectedLocations++;
    }
  }

  const formatBreakdown = (map: Map<string, StateAffectedParamBreakdownItem>) => {
    const list = Array.from(map.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.paramName.localeCompare(b.paramName);
    });
    const names =
      list.length > 0
        ? list.map((d) => (d.paramName !== d.paramCode ? `${d.paramName} (${d.paramCode})` : d.paramCode)).join(", ")
        : "None";
    return { list, names };
  };

  const rows: StateAffectedSummaryRow[] = Array.from(stateMap.values())
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((bucket) => {
      const { list, names } = formatBreakdown(bucket.paramCounts);
      return {
        stateName: bucket.displayName,
        isOverall: false,
        totalSamples: bucket.totalSamples,
        affectedLocationsCount: bucket.affectedLocationsCount,
        affectedLocationsPct:
          bucket.totalSamples > 0 ? (bucket.affectedLocationsCount / bucket.totalSamples) * 100 : 0,
        affectedParamNames: names,
        affectedParamBreakdown: list
      };
    });

  const overallFormatted = formatBreakdown(overallParamCounts);
  const overall: StateAffectedSummaryRow = {
    stateName: "All States (Total)",
    isOverall: true,
    totalSamples: overallTotalSamples,
    affectedLocationsCount: overallAffectedLocations,
    affectedLocationsPct:
      overallTotalSamples > 0 ? (overallAffectedLocations / overallTotalSamples) * 100 : 0,
    affectedParamNames: overallFormatted.names,
    affectedParamBreakdown: overallFormatted.list
  };

  return { rows, overall };
}

/**
 * Formats numeric statistics cleanly while preserving precision for trace metals (Pb, Cd, Hg, etc.).
 */
export function formatSummaryValue(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return "—";
  const abs = Math.abs(val);
  if (abs === 0) return "0";
  if (abs < 0.01) return val.toFixed(4).replace(/\.?0+$/, "");
  if (abs < 1) return val.toFixed(3).replace(/\.?0+$/, "");
  if (abs < 100) return val.toFixed(2);
  return val.toFixed(1);
}
