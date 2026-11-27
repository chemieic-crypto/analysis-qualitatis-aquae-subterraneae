import type { DataHeaders } from "../types";

/**
 * Words that should remain lowercase when appearing in the middle of a multi-word Proper Case name
 * (e.g. "Andaman and Nicobar Islands", "Jammu and Kashmir", "Stage of Extraction").
 */
const MINOR_CONNECTOR_WORDS = new Set([
  "and",
  "of",
  "the",
  "in",
  "at",
  "on",
  "for",
  "by",
  "to",
  "or",
  "vs",
  "de",
  "la",
  "van",
  "di"
]);

/**
 * Standard hydrochemical, groundwater, and Indian administrative acronyms
 * that should stay UPPERCASE even when normalizing mixed/lowercase text.
 */
const PRESERVED_ACRONYMS = new Set([
  "CGWB",
  "PHED",
  "UT",
  "NCT",
  "J&K",
  "D&NH",
  "D&D",
  "BIS",
  "WHO",
  "DWLR",
  "NHS",
  "GWMS",
  "BW",
  "DW",
  "HP",
  "TW",
  "OW",
  "PZ",
  "SW",
  "GW",
  "RO",
  "BDL",
  "ND",
  "NA",
  "N/A",
  "II",
  "III",
  "IV",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X"
]);

/**
 * Column name fragments that represent categorical text fields suitable for automatic Proper Case merging.
 * IDs, coordinates, dates, years, depths, and numeric parameter columns are intentionally excluded.
 */
const CATEGORICAL_COLUMN_PATTERNS = [
  /^state(\b|_)/i,
  /^st[_\s]?name/i,
  /^state[_\s]?ut/i,
  /^district(\b|_)/i,
  /^dist(\b|_)/i,
  /^dst[_\s]?name/i,
  /^block(\b|_)/i,
  /^tehsil(\b|_)/i,
  /^taluk(\b|_)/i,
  /^taluka(\b|_)/i,
  /^mandal(\b|_)/i,
  /^sub[\s_-]?district/i,
  /^village(\b|_)/i,
  /^location(\b|_)/i,
  /^site(\b|_)/i,
  /^station[_\s]?name/i,
  /^place(\b|_)/i,
  /^habitation(\b|_)/i,
  /^locality(\b|_)/i,
  /^source(\b|_)/i,
  /^well[_\s]?type/i,
  /^type[_\s]?of[_\s]?well/i,
  /^structure(\b|_)/i,
  /^aquifer(\b|_)/i,
  /^principal[_\s]?aquifer/i,
  /^major[_\s]?aquifer/i,
  /^aquifer[_\s]?tapped/i,
  /^season(\b|_)/i,
  /^monsoon(\b|_)/i,
  /^basin(\b|_)/i,
  /^watershed(\b|_)/i,
  /^lithology(\b|_)/i,
  /^formation(\b|_)/i,
  /^geology(\b|_)/i,
  /^rock[_\s]?type/i,
  /^zone(\b|_)/i,
  /^category(\b|_)/i,
  /^stage[_\s]?of/i,
  /^assessment[_\s]?unit/i,
  /^region(\b|_)/i,
  /^division(\b|_)/i,
  /^agency(\b|_)/i,
  /^lab(\b|_)/i,
  /^laboratory(\b|_)/i,
  /^water[_\s]?use/i,
  /^purpose(\b|_)/i,
  /^status(\b|_)/i
];

const EXCLUDED_COLUMN_PATTERNS = [
  /well[\s_-]*id/i,
  /station[\s_-]*id/i,
  /sample[\s_-]*id/i,
  /site[\s_-]*id/i,
  /site[\s_-]*code/i,
  /station[\s_-]*code/i,
  /well[\s_-]*no/i,
  /sl[\s._-]*no/i,
  /sr[\s._-]*no/i,
  /serial/i,
  /^id$/i,
  /^code$/i,
  /lat/i,
  /lon|lng/i,
  /depth/i,
  /year/i,
  /date/i,
  /time/i,
  /elevation|rl|amsl/i,
  /water[\s_-]*level|wl|mbgl/i
];

/**
 * Returns a case-insensitive, whitespace-normalized comparison key so that
 * "RAJASTHAN", "rajasthan", "Rajasthan", and "  Rajasthan  " map to the same group.
 */
export function canonicalCaseKey(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Formats a single word segment (already split on spaces, hyphens, slashes, or parentheses)
 * into clean Proper Case while preserving recognized acronyms and alphanumeric site codes.
 */
function formatAtomicToken(token: string, isFirstWord: boolean): string {
  if (!token) return "";

  const upper = token.toUpperCase();
  const lower = token.toLowerCase();

  // Keep pure numbers, dashes, or punctuation unchanged
  if (/^[\d.,%+-]+$/.test(token) || /^[-—–]+$/.test(token)) {
    return token;
  }

  // Keep known hydrochemical / administrative acronyms uppercase
  if (PRESERVED_ACRONYMS.has(upper)) {
    return upper;
  }

  // Keep compact alphanumeric codes like G1, W12, 12A uppercase so "Site-g1" and "Site-G1" unify cleanly
  if (/^[a-zA-Z]{1,2}\d+[a-zA-Z]?$/.test(token) || /^\d+[a-zA-Z]{1,2}$/.test(token)) {
    return upper;
  }

  // Keep minor English connectors lowercase in the middle of a multi-word name
  if (!isFirstWord && MINOR_CONNECTOR_WORDS.has(lower)) {
    return lower;
  }

  // Handle apostrophes like "o'connor" -> "O'Connor" or "st. john's" -> "St. John's"
  if (lower.includes("'")) {
    const parts = lower.split("'");
    return parts
      .map((part, idx) => {
        if (!part) return "";
        // Possessive 's or contraction 't stays lowercase
        if (idx > 0 && part.length <= 2 && ["s", "t", "re", "ve", "ll", "d", "m"].includes(part)) {
          return part;
        }
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join("'");
  }

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Converts a categorical label into consistent Proper Case while trimming and collapsing spaces.
 * Examples:
 * - "RAJASTHAN" / "rajasthan" / "RaJaStHaN" -> "Rajasthan"
 * - "ANDAMAN AND NICOBAR ISLANDS" -> "Andaman and Nicobar Islands"
 * - "BORE WELL" / "bore  well" -> "Bore Well"
 * - "PRE-MONSOON" / "pre-monsoon" -> "Pre-Monsoon"
 * - "SANGANER (JAIPUR)" -> "Sanganer (Jaipur)"
 * - "cgwb" -> "CGWB"
 */
export function toProperCaseLabel(value: unknown): string {
  if (value === undefined || value === null) return "";
  const trimmed = String(value).trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  // Preserve exact placeholder strings
  if (trimmed === "-" || trimmed === "—") return trimmed;
  if (PRESERVED_ACRONYMS.has(trimmed.toUpperCase())) {
    return trimmed.toUpperCase();
  }

  // Split by spaces while handling compound delimiters (-, /, (, ), &) inside each word
  const words = trimmed.split(" ");
  return words
    .map((word, wordIndex) => {
      const upperWord = word.toUpperCase();
      if (PRESERVED_ACRONYMS.has(upperWord)) {
        return upperWord;
      }

      // Split while keeping delimiters: -, /, (, ), [, ], &, .
      const segments = word.split(/([-/()[\]&.,])/);
      return segments
        .map((seg, segIdx) => {
          if (!seg || /^[-/()[\]&.,]$/.test(seg)) return seg;
          const isFirst = wordIndex === 0 && segIdx === 0;
          // Inside parentheses or after hyphen/slash, always capitalize the segment's leading word
          const prevDelim = segIdx > 0 ? segments[segIdx - 1] : "";
          const forceCap = isFirst || prevDelim === "-" || prevDelim === "/" || prevDelim === "(" || prevDelim === "[";
          return formatAtomicToken(seg, forceCap);
        })
        .join("");
    })
    .join(" ");
}

/**
 * Determines which dataset columns should be automatically normalized to Proper Case.
 */
export function identifyCategoricalColumns(
  rows: Record<string, any>[],
  headers?: Partial<DataHeaders>
): string[] {
  if (!rows || rows.length === 0) return [];

  const excludedCols = new Set<string>();
  if (headers) {
    [
      headers.wellId,
      headers.latitude,
      headers.longitude,
      headers.year,
      headers.depth
    ].forEach((c) => {
      if (c) excludedCols.add(c);
    });
    if (Array.isArray(headers.params)) {
      headers.params.forEach((p) => {
        if (p) excludedCols.add(p);
      });
    }
  }

  const targetCols = new Set<string>();

  // 1. Always include explicitly mapped categorical text headers
  if (headers) {
    [
      headers.state,
      headers.district,
      headers.block,
      headers.location,
      headers.season,
      headers.aquifer,
      headers.source
    ].forEach((col) => {
      if (col && !excludedCols.has(col)) {
        targetCols.add(col);
      }
    });
  }

  // 2. Also detect any additional unmapped categorical metadata columns by header name
  const sampleSize = Math.min(rows.length, 40);
  const discoveredKeys = new Set<string>();
  for (let i = 0; i < sampleSize; i++) {
    const row = rows[i];
    if (row && typeof row === "object") {
      Object.keys(row).forEach((k) => {
        if (k && !k.startsWith("__EMPTY")) discoveredKeys.add(k);
      });
    }
  }

  discoveredKeys.forEach((col) => {
    if (excludedCols.has(col) || targetCols.has(col)) return;
    if (EXCLUDED_COLUMN_PATTERNS.some((rx) => rx.test(col))) return;

    if (CATEGORICAL_COLUMN_PATTERNS.some((rx) => rx.test(col))) {
      // Confirm column actually holds non-numeric strings (not pure numbers)
      let hasText = false;
      for (let i = 0; i < sampleSize; i++) {
        const val = rows[i]?.[col];
        if (typeof val === "string" && /[a-zA-Z]/.test(val)) {
          hasText = true;
          break;
        }
      }
      if (hasText) {
        targetCols.add(col);
      }
    }
  });

  return Array.from(targetCols);
}

export interface ProperCaseNormalizationResult {
  rows: Record<string, any>[];
  normalizedCellsCount: number;
  mergedCaseVariantsCount: number;
  affectedColumns: string[];
  mergedExamples: Array<{ column: string; variants: string[]; mergedTo: string }>;
}

/**
 * Inspects a dataset to count how many upper/lower-case spelling duplicates will be unified
 * when Proper Case normalization runs (non-mutating preview for MappingModal).
 */
export function previewCaseDuplicates(
  rows: Record<string, any>[],
  headers?: Partial<DataHeaders>
): {
  mergedCaseVariantsCount: number;
  cellsToNormalizeCount: number;
  affectedColumns: string[];
  mergedExamples: Array<{ column: string; variants: string[]; mergedTo: string }>;
} {
  if (!rows || rows.length === 0) {
    return {
      mergedCaseVariantsCount: 0,
      cellsToNormalizeCount: 0,
      affectedColumns: [],
      mergedExamples: []
    };
  }

  const targetCols = identifyCategoricalColumns(rows, headers);
  if (targetCols.length === 0) {
    return {
      mergedCaseVariantsCount: 0,
      cellsToNormalizeCount: 0,
      affectedColumns: [],
      mergedExamples: []
    };
  }

  let cellsToNormalizeCount = 0;
  let mergedCaseVariantsCount = 0;
  const affectedColumns: string[] = [];
  const mergedExamples: Array<{ column: string; variants: string[]; mergedTo: string }> = [];

  for (const col of targetCols) {
    const rawVariantsByCanonical = new Map<string, Set<string>>();
    const canonicalToProper = new Map<string, string>();
    let colChanged = false;

    for (let r = 0; r < rows.length; r++) {
      const val = rows[r]?.[col];
      if (typeof val !== "string") continue;
      const trimmed = val.trim();
      if (!trimmed) continue;

      const key = canonicalCaseKey(trimmed);
      let proper = canonicalToProper.get(key);
      if (proper === undefined) {
        proper = toProperCaseLabel(trimmed);
        canonicalToProper.set(key, proper);
      }

      if (val !== proper) {
        cellsToNormalizeCount++;
        colChanged = true;
      }

      let variants = rawVariantsByCanonical.get(key);
      if (!variants) {
        variants = new Set<string>();
        rawVariantsByCanonical.set(key, variants);
      }
      variants.add(trimmed);
    }

    if (colChanged) {
      affectedColumns.push(col);
    }

    for (const [key, variants] of rawVariantsByCanonical.entries()) {
      if (variants.size > 1) {
        mergedCaseVariantsCount += variants.size - 1;
        if (mergedExamples.length < 6) {
          mergedExamples.push({
            column: col,
            variants: Array.from(variants).slice(0, 4),
            mergedTo: canonicalToProper.get(key) || ""
          });
        }
      }
    }
  }

  return {
    mergedCaseVariantsCount,
    cellsToNormalizeCount,
    affectedColumns,
    mergedExamples
  };
}

/**
 * Automatically normalizes categorical text columns (State, District, Block, Location, Source,
 * Aquifer, Season, etc.) to consistent Proper Case so upper/lower case variants with the same
 * spelling (e.g., "RAJASTHAN", "rajasthan", "Rajasthan") merge seamlessly across all tables,
 * filters, charts, and exports.
 *
 * Numeric values, Well IDs, coordinates, years, and water-quality parameters are never altered.
 */
export function normalizeDatasetRowsToProperCase(
  rows: Record<string, any>[],
  headers?: Partial<DataHeaders>
): ProperCaseNormalizationResult {
  if (!rows || rows.length === 0) {
    return {
      rows: rows || [],
      normalizedCellsCount: 0,
      mergedCaseVariantsCount: 0,
      affectedColumns: [],
      mergedExamples: []
    };
  }

  const targetCols = identifyCategoricalColumns(rows, headers);
  if (targetCols.length === 0) {
    return {
      rows,
      normalizedCellsCount: 0,
      mergedCaseVariantsCount: 0,
      affectedColumns: [],
      mergedExamples: []
    };
  }

  const properCache = new Map<string, string>();
  const rawVariantsPerCol = new Map<string, Map<string, Set<string>>>();
  const changedCols = new Set<string>();
  let normalizedCellsCount = 0;

  for (const col of targetCols) {
    rawVariantsPerCol.set(col, new Map<string, Set<string>>());
  }

  const normalizedRows = rows.map((row) => {
    if (!row || typeof row !== "object") return row;

    let cloned: Record<string, any> | null = null;

    for (let c = 0; c < targetCols.length; c++) {
      const col = targetCols[c];
      const rawVal = row[col];
      if (typeof rawVal !== "string") continue;

      const trimmed = rawVal.trim();
      if (!trimmed) {
        if (rawVal !== "") {
          if (!cloned) cloned = { ...row };
          cloned[col] = "";
          normalizedCellsCount++;
          changedCols.add(col);
        }
        continue;
      }

      const cKey = canonicalCaseKey(trimmed);
      let proper = properCache.get(cKey);
      if (proper === undefined) {
        proper = toProperCaseLabel(trimmed);
        properCache.set(cKey, proper);
      }

      const colMap = rawVariantsPerCol.get(col)!;
      let variantSet = colMap.get(cKey);
      if (!variantSet) {
        variantSet = new Set<string>();
        colMap.set(cKey, variantSet);
      }
      variantSet.add(trimmed);

      if (rawVal !== proper) {
        if (!cloned) cloned = { ...row };
        cloned[col] = proper;
        normalizedCellsCount++;
        changedCols.add(col);
      }
    }

    return cloned || row;
  });

  let mergedCaseVariantsCount = 0;
  const mergedExamples: Array<{ column: string; variants: string[]; mergedTo: string }> = [];

  for (const [col, colMap] of rawVariantsPerCol.entries()) {
    for (const [cKey, variantSet] of colMap.entries()) {
      if (variantSet.size > 1) {
        mergedCaseVariantsCount += variantSet.size - 1;
        if (mergedExamples.length < 6) {
          mergedExamples.push({
            column: col,
            variants: Array.from(variantSet).slice(0, 4),
            mergedTo: properCache.get(cKey) || ""
          });
        }
      }
    }
  }

  return {
    rows: normalizedRows,
    normalizedCellsCount,
    mergedCaseVariantsCount,
    affectedColumns: Array.from(changedCols),
    mergedExamples
  };
}
