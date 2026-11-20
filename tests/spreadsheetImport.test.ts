import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  extractSpreadsheetHeaders,
  guessDataHeaders,
  MAX_SPREADSHEET_FILE_BYTES,
  MAX_SPREADSHEET_ROWS,
  validateParsedSpreadsheetRows,
  validateSpreadsheetFile,
} from "../src/utils/spreadsheetImport.ts";

test("validateSpreadsheetFile accepts normal csv/xls/xlsx uploads and rejects bad extensions, empty files, and oversized files", () => {
  assert.deepEqual(validateSpreadsheetFile({ name: "groundwater.xlsx", size: 1024 * 500 }), {
    ok: true,
  });
  assert.deepEqual(validateSpreadsheetFile({ name: "samples.CSV", size: 256 }), {
    ok: true,
  });
  assert.deepEqual(validateSpreadsheetFile({ name: "legacy.xls", size: 4096 }), {
    ok: true,
  });

  const badExt = validateSpreadsheetFile({ name: "malicious.exe", size: 1024 });
  assert.equal(badExt.ok, false);
  if (!badExt.ok) assert.match(badExt.error, /\.csv, \.xls, or \.xlsx/i);

  const emptyFile = validateSpreadsheetFile({ name: "empty.csv", size: 0 });
  assert.equal(emptyFile.ok, false);
  if (!emptyFile.ok) assert.match(emptyFile.error, /empty/i);

  const hugeFile = validateSpreadsheetFile({
    name: "huge.xlsx",
    size: MAX_SPREADSHEET_FILE_BYTES + 1024 * 1024,
  });
  assert.equal(hugeFile.ok, false);
  if (!hugeFile.ok) assert.match(hugeFile.error, /Maximum supported file size/i);
});

test("validateParsedSpreadsheetRows enforces non-empty and row-count safeguards", () => {
  assert.equal(validateParsedSpreadsheetRows([]).ok, false);
  assert.deepEqual(validateParsedSpreadsheetRows([{ a: 1 }]), { ok: true });

  const tooMany = Array.from({ length: MAX_SPREADSHEET_ROWS + 1 }, () => ({ a: 1 }));
  const overCap = validateParsedSpreadsheetRows(tooMany);
  assert.equal(overCap.ok, false);
  if (!overCap.ok) assert.match(overCap.error, /safety cap/i);
});

test("extractSpreadsheetHeaders and guessDataHeaders accurately resolve metadata and hydrochemical columns", () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["State", "District", "Block", "Location", "pH", "EC (µS/cm)", "Nitrate (NO3)", "Fluoride"],
    ["Rajasthan", "Jaipur", "Amber", "Site A", 7.4, 950, 48, 1.8],
  ]);
  const parsed = XLSX.utils.sheet_to_json(ws);
  const headers = extractSpreadsheetHeaders(ws, parsed);
  assert.deepEqual(headers, [
    "State",
    "District",
    "Block",
    "Location",
    "pH",
    "EC (µS/cm)",
    "Nitrate (NO3)",
    "Fluoride",
  ]);

  const { guessed, map } = guessDataHeaders(headers);
  assert.equal(guessed.state, "State");
  assert.equal(guessed.district, "District");
  assert.equal(guessed.block, "Block");
  assert.equal(guessed.location, "Location");
  assert.equal(map["pH"], "pH");
  assert.equal(map["EC (µS/cm)"], "EC");
  assert.equal(map["Nitrate (NO3)"], "NO3");
  assert.equal(map["Fluoride"], "F");
});
