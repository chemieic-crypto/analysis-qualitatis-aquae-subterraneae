import * as XLSX from "xlsx";
import { DataHeaders } from "../types";
import { PARAM_CONFIG } from "../data/config";

export const MAX_SPREADSHEET_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_SPREADSHEET_ROWS = 50_000;
export const ALLOWED_SPREADSHEET_EXTENSIONS = [".csv", ".xls", ".xlsx"] as const;

export type SpreadsheetValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateSpreadsheetFile(
  file: { name: string; size: number },
  maxBytes: number = MAX_SPREADSHEET_FILE_BYTES
): SpreadsheetValidationResult {
  const lowerName = (file.name || "").trim().toLowerCase();
  const hasAllowedExtension = ALLOWED_SPREADSHEET_EXTENSIONS.some((ext) =>
    lowerName.endsWith(ext)
  );

  if (!hasAllowedExtension) {
    return {
      ok: false,
      error: "Unsupported file format. Please upload a .csv, .xls, or .xlsx spreadsheet.",
    };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return {
      ok: false,
      error: "Uploaded file is empty. Please select a spreadsheet with groundwater records.",
    };
  }

  if (file.size > maxBytes) {
    const limitMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    const fileMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `Spreadsheet is too large (${fileMb} MB). Maximum supported file size is ${limitMb} MB to keep browser analysis responsive.`,
    };
  }

  return { ok: true };
}

export function validateParsedSpreadsheetRows(
  rows: unknown[],
  maxRows: number = MAX_SPREADSHEET_ROWS
): SpreadsheetValidationResult {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      error: "Uploaded spreadsheet contains no plottable data rows.",
    };
  }

  if (rows.length > maxRows) {
    return {
      ok: false,
      error: `Spreadsheet has ${rows.length.toLocaleString()} rows, exceeding the browser safety cap of ${maxRows.toLocaleString()} rows. Please split the dataset by state, district, or year before uploading.`,
    };
  }

  return { ok: true };
}

export function extractSpreadsheetHeaders(
  ws: XLSX.WorkSheet,
  parsedData: unknown[]
): string[] {
  const headersList: string[] = [];
  if (ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const R = range.s.r;
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellRef];
      if (cell && cell.v !== undefined && cell.v !== null) {
        headersList.push(String(cell.v).trim());
      } else if (cell && cell.w !== undefined) {
        headersList.push(String(cell.w).trim());
      }
    }
  }

  const allKeys = new Set<string>();
  parsedData.forEach((row: unknown) => {
    if (row && typeof row === "object") {
      Object.keys(row as Record<string, unknown>).forEach((k) => {
        if (k && !k.startsWith("__EMPTY")) {
          allKeys.add(String(k).trim());
        }
      });
    }
  });

  const headersSet = new Set<string>(headersList.filter(Boolean));
  allKeys.forEach((k) => headersSet.add(k));
  return Array.from(headersSet);
}

export function guessDataHeaders(rawHeaders: string[]): {
  guessed: DataHeaders;
  map: Record<string, string>;
} {
  const find = (targets: string[]) =>
    rawHeaders.find(
      (k) =>
        k &&
        typeof k === "string" &&
        targets.some((t) => k.toLowerCase().trim() === t.toLowerCase())
    );

  const guessed: DataHeaders = {
    state: find(["State", "State_Name", "State/UT"]),
    district: find(["District", "Dist"]),
    block: find(["Block", "Tehsil", "Block/Talluka", "Tehsil_Name"]),
    wellId: find(["Well ID", "Well_ID", "Station ID", "Site ID", "WLS_ID"]),
    location: find(["Location", "Village", "Site Name", "Place", "Location_Name"]),
    longitude: find(["Longitude", "Long", "Lon", "X"]),
    latitude: find(["Latitude", "Lat", "Y"]),
    year: find(["Year", "year"]),
    season: find(["Season", "season"]),
    aquifer: find(["Aquifer", "Aquifer Type", "Aquifer_Type", "Aquifer Name", "Aquifer_Name"]),
    source: find([
      "Source",
      "Well Type",
      "Well_Type",
      "Source Type",
      "Source_Type",
      "Water Source",
      "Water_Source",
      "src",
    ]),
    depth: find([
      "Depth",
      "Well Depth",
      "Depth BGL",
      "Well_Depth",
      "Casing Depth",
      "Drill Depth",
      "Depth(m)",
      "Depth (m)",
      "BGL",
      "depth_m",
    ]),
    params: [],
  };

  const knownKeys = Object.values(guessed).filter((h) => typeof h === "string") as string[];
  const map: Record<string, string> = {};
  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  rawHeaders.forEach((header) => {
    if (!header || typeof header !== "string") return;
    if (knownKeys.includes(header)) return;
    const hLower = header.toLowerCase().trim();
    const staticKeywords = [
      "location",
      "lat",
      "lon",
      "district",
      "state",
      "block",
      "village",
      "well",
      "sl. no",
      "serial",
      "unit",
      "source",
    ];
    if (staticKeywords.some((sw) => hLower.includes(sw))) return;

    const matchedKey = Object.keys(PARAM_CONFIG).find((key) => {
      const config = PARAM_CONFIG[key];
      if (!config) return false;
      if (hLower === key.toLowerCase()) return true;
      if (
        config.keywords &&
        config.keywords.some((kw) => {
          if (!kw) return false;
          const kwLower = kw.toLowerCase().trim();
          if (hLower === kwLower) return true;
          if (hLower.includes(`(${kwLower})`)) return true;
          try {
            const regex = new RegExp(`\\b${escapeRegExp(kwLower)}\\b`, "i");
            return regex.test(hLower);
          } catch {
            return hLower.includes(kwLower);
          }
        })
      ) {
        return true;
      }
      return false;
    });

    if (matchedKey) {
      if (!guessed.params.includes(matchedKey)) {
        guessed.params.push(matchedKey);
      }
      if (!guessed.params.includes(header)) {
        guessed.params.push(header);
      }
      map[header] = matchedKey;
      map[matchedKey] = header;
    }
  });

  return { guessed, map };
}
