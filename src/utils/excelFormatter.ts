import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

/**
 * Institutional sober color palette applied uniformly across every generated Excel sheet.
 * All ARGB values are 8-char uppercase hex (AARRGGBB).
 */
export const EXCEL_PALETTE = {
  // Primary structural fills
  titleBg: "FF1B365D", // Deep Royal Slate Navy for full-width report title banners
  headerBg: "FF1E3A5F", // Slate Navy for primary table header rows
  subHeaderBg: "FFD9E2EC", // Soft Steel Blue for multi-tier secondary header rows
  sectionBannerBg: "FFE2EAF2", // Muted Slate Tint for embedded section headings
  metaLabelBg: "FFEEF3F8", // Whisper Steel Tint for key-value metadata label columns
  totalBg: "FFDCE6F1", // Dignified Steel Blue for Total / Grand Total / Summary rows
  zebraEvenBg: "FFF4F7FA", // Soft Cool Ice-Gray for alternating data rows
  zebraOddBg: "FFFFFFFF", // Crisp White for alternating data rows
  hotspotRowBg: "FFFEF9C3", // Sober Pale Cream-Gold for Identified Hot Spot rows

  // Typography colors
  textWhite: "FFFFFFFF",
  textNavy: "FF0F2942",
  textDark: "FF1E293B",
  textHotspot: "FF713F12",

  // Border colors
  borderInner: "FFB8C4D4", // Clearly visible medium-light slate border for all data cells
  borderHeader: "FF1E3A5F", // Deep Slate Navy accent border for headers, totals & outer frame
  borderHeaderInner: "FF4A668A", // Subtle steel divider between dark navy header cells

  // Sober semantic status fills & text
  dangerBg: "FFFCE8E6",
  dangerText: "FF9B1C1C",
  warningBg: "FFFEF3C7",
  warningText: "FF92400E",
  safeBg: "FFE6F4EA",
  safeText: "FF166534",
} as const;

interface MergeBounds {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/**
 * Helper to determine if a string represents a valid number (and NOT a date, code, or non-numeric label)
 */
export function isNumericString(val: any): boolean {
  if (typeof val === "number") return !isNaN(val) && isFinite(val);
  if (typeof val !== "string") return false;

  const trimmed = val.trim();
  if (!trimmed) return false;

  // Don't convert dates (e.g., 2025-01-01, 01/02/2025, 01.02.2025)
  if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(trimmed)) return false;
  // Don't convert times (e.g. 10:30, 10:30:00)
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return false;
  // Don't convert codes with leading zeros like "00123" or "09" (preserve "0", "0.0", "-0.5")
  if (/^0\d+$/.test(trimmed)) return false;

  // Strip comma separators like "1,250.50"
  const cleanStr = trimmed.replace(/,/g, "");
  // Must match strict numeric pattern: optional sign, digits, optional decimal point and digits, optional exponent
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(cleanStr)) {
    return false;
  }

  const num = Number(cleanStr);
  return !isNaN(num) && isFinite(num);
}

/**
 * Coerce a raw value to a valid number if possible
 */
export function parseNumericValue(val: any): { isNum: boolean; num: number } {
  if (typeof val === "number") {
    return { isNum: !isNaN(val) && isFinite(val), num: val };
  }
  if (typeof val === "string" && isNumericString(val)) {
    const num = Number(val.trim().replace(/,/g, ""));
    return { isNum: true, num };
  }
  return { isNum: false, num: 0 };
}

function colLettersToIndex(letters: string): number {
  let num = 0;
  for (let i = 0; i < letters.length; i++) {
    num = num * 26 + (letters.charCodeAt(i) - 64);
  }
  return num;
}

function extractCellDisplayText(cellValue: unknown): string {
  if (cellValue === null || cellValue === undefined) return "";
  if (typeof cellValue === "string") return cellValue;
  if (typeof cellValue === "number") return Number.isFinite(cellValue) ? String(cellValue) : "";
  if (typeof cellValue === "boolean") return cellValue ? "TRUE" : "FALSE";
  if (cellValue instanceof Date) return cellValue.toISOString().slice(0, 10);
  if (typeof cellValue === "object") {
    const obj = cellValue as {
      result?: unknown;
      text?: unknown;
      richText?: Array<{ text?: string }>;
      formula?: unknown;
    };
    if (obj.richText && Array.isArray(obj.richText)) {
      return obj.richText.map((part) => part.text || "").join("");
    }
    if (obj.result !== undefined) return extractCellDisplayText(obj.result);
    if (obj.text !== undefined) return extractCellDisplayText(obj.text);
    if (obj.formula !== undefined) return String(obj.formula);
  }
  return String(cellValue);
}

function parseWorksheetMerges(ws: ExcelJS.Worksheet): MergeBounds[] {
  const result: MergeBounds[] = [];
  const rawMerges: string[] = [];

  // ExcelJS exposes merges via ws.model.merges and internal _merges map
  const modelMerges = (ws.model as { merges?: string[] } | undefined)?.merges;
  if (Array.isArray(modelMerges)) {
    rawMerges.push(...modelMerges);
  } else {
    const internalMerges = (ws as unknown as { _merges?: Record<string, { model?: { top: number; left: number; bottom: number; right: number } }> })._merges;
    if (internalMerges && typeof internalMerges === "object") {
      Object.values(internalMerges).forEach((m) => {
        if (m?.model) {
          result.push({
            top: m.model.top,
            left: m.model.left,
            bottom: m.model.bottom,
            right: m.model.right,
          });
        }
      });
    }
  }

  for (const rangeStr of rawMerges) {
    const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(rangeStr.trim());
    if (!match) continue;
    const left = colLettersToIndex(match[1].toUpperCase());
    const top = parseInt(match[2], 10);
    const right = colLettersToIndex(match[3].toUpperCase());
    const bottom = parseInt(match[4], 10);
    result.push({
      top: Math.min(top, bottom),
      left: Math.min(left, right),
      bottom: Math.max(top, bottom),
      right: Math.max(left, right),
    });
  }

  return result;
}

function getSmartNumberFormat(num: number): string {
  if (Number.isInteger(num)) return "0";
  const abs = Math.abs(num);
  const strVal = String(num);
  const decPart = strVal.includes(".") ? strVal.split(".")[1] : "";
  const decCount = decPart.length;
  if (decCount <= 1) return "0.0";
  if (decCount <= 2) return "0.00";
  if (decCount <= 3) return "0.000";
  if (decCount <= 5 || abs < 180) return "0.0000";
  return "0.00000";
}

function classifySemanticStatus(text: string): "danger" | "warning" | "safe" | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized || normalized.length > 52) return null;

  // Danger / Critical / Exceeded / Unsuitable / Fail
  if (
    normalized === "critical" ||
    normalized === "unsuitable" ||
    normalized === "fail" ||
    normalized === "failed" ||
    normalized === "exceeded" ||
    normalized === "non-potable" ||
    normalized === "exceeded / non-potable" ||
    normalized === "above permissible" ||
    normalized === "out range" ||
    normalized === "secondary off-center peak" ||
    normalized === "contamination with heavy metals" ||
    normalized === "very high" ||
    normalized === "severe" ||
    normalized === "unmatched"
  ) {
    return "danger";
  }

  // Warning / Permissible / High / Moderate / Expanding
  if (
    normalized === "high" ||
    normalized === "moderate" ||
    normalized === "permissible" ||
    normalized === "permissible limit" ||
    normalized === "expanding plume" ||
    normalized === "partial match" ||
    normalized === "multi parameter contamination" ||
    normalized === "one parameter contamination" ||
    normalized === "caution" ||
    normalized === "warning"
  ) {
    return "warning";
  }

  // Safe / Desirable / Acceptable / Pass / Low / Attenuating
  if (
    normalized === "safe" ||
    normalized === "desirable" ||
    normalized === "safe / desirable" ||
    normalized === "acceptable" ||
    normalized === "pass" ||
    normalized === "passed" ||
    normalized === "low" ||
    normalized === "full match" ||
    normalized === "within limit" ||
    normalized === "localized core" ||
    normalized === "rapidly attenuating" ||
    normalized === "pristine"
  ) {
    return "safe";
  }

  return null;
}

function isCenterAlignedColumnHeader(headerText: string): boolean {
  const h = headerText.trim().toLowerCase();
  if (!h) return false;
  return (
    h === "s.no" ||
    h === "s.no." ||
    h === "sl. no" ||
    h === "sl. no." ||
    h === "sl no" ||
    h === "sr. no." ||
    h === "hot spot no." ||
    h === "hotspot no." ||
    h === "unit" ||
    h === "units" ||
    h === "code" ||
    h === "status" ||
    h === "bis status" ||
    h === "severity" ||
    h === "risk" ||
    h === "direction" ||
    h === "cell id" ||
    h === "grid label" ||
    h === "role" ||
    h === "tier" ||
    h === "year" ||
    h === "season" ||
    h.startsWith("s.no") ||
    h.startsWith("sl. no") ||
    h.includes("status") ||
    h.includes("severity") ||
    h.includes("grade") ||
    h.includes("class")
  );
}

/**
 * Scans an ExcelJS Worksheet and ensures that all numeric values (even if originally strings)
 * are stored as native number types with appropriate Excel number formatting.
 */
export function ensureExcelJSWorksheetNumbers(ws: ExcelJS.Worksheet, headerRowCount: number = 1) {
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowCount) return; // Skip headers

    row.eachCell({ includeEmpty: false }, (cell) => {
      let rawVal: unknown = cell.value;
      if (typeof rawVal === "object" && rawVal !== null) {
        const richOrFormula = rawVal as { result?: unknown; text?: unknown; formula?: unknown };
        // Preserve live formulas; only inspect plain values
        if (richOrFormula.formula !== undefined) {
          if (typeof richOrFormula.result === "number" && (!cell.numFmt || cell.numFmt === "@")) {
            cell.numFmt = getSmartNumberFormat(richOrFormula.result);
          }
          return;
        }
        if (richOrFormula.result !== undefined) {
          rawVal = richOrFormula.result;
        } else if (richOrFormula.text !== undefined) {
          rawVal = richOrFormula.text;
        }
      }

      // Check if string can be converted to number
      if (typeof rawVal === "string" && isNumericString(rawVal)) {
        const num = Number(rawVal.trim().replace(/,/g, ""));
        if (!isNaN(num) && isFinite(num)) {
          cell.value = num;
          rawVal = num;
        }
      }

      // Format as true native number
      if (typeof cell.value === "number" && !isNaN(cell.value) && isFinite(cell.value)) {
        if (!cell.numFmt || cell.numFmt === "@" || cell.numFmt === "General") {
          cell.numFmt = getSmartNumberFormat(cell.value);
        }
      }
    });
  });
}

function getTableDimensions(ws: ExcelJS.Worksheet, merges: MergeBounds[]): { maxRow: number; maxCol: number } {
  let maxRow = Math.max(ws.rowCount || 0, ws.actualRowCount || 0);
  let maxCol = Math.max(ws.columnCount || 0, ws.actualColumnCount || 0);

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > maxRow) maxRow = rowNumber;
    row.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
      if (colNumber > maxCol) maxCol = colNumber;
    });
  });

  for (const m of merges) {
    if (m.bottom > maxRow) maxRow = m.bottom;
    if (m.right > maxCol) maxCol = m.right;
  }

  return { maxRow, maxCol };
}

/**
 * Safely reinforces custom-formatted worksheets (MasterSummaryView, FortnightlyAlertsView)
 * without overwriting their custom colors, fonts, or merges:
 * - Guarantees wrapText: true on every populated cell
 * - Guarantees a clean thin border wherever a border side was omitted
 * - Ensures row heights are sufficient so wrapped text is not clipped
 * - Applies clean print setup
 */
function ensureCustomSheetBordersAndWrap(ws: ExcelJS.Worksheet) {
  const merges = parseWorksheetMerges(ws);
  const { maxRow, maxCol } = getTableDimensions(ws, merges);
  if (maxRow === 0 || maxCol === 0) return;

  const fallbackEdge: ExcelJS.Border = {
    style: "thin",
    color: { argb: EXCEL_PALETTE.borderInner },
  };

  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r);
    let hasContent = false;
    let hasFill = false;

    for (let c = 1; c <= maxCol; c++) {
      const cell = ws.getCell(r, c);
      if (extractCellDisplayText(cell.value).trim() !== "") hasContent = true;
      if (cell.fill && (cell.fill as ExcelJS.FillPattern).type === "pattern") hasFill = true;
    }

    // Leave tiny intentional blank spacer rows clean
    if (!hasContent && !hasFill) continue;

    let maxNeededHeight = row.height || 20;

    for (let c = 1; c <= maxCol; c++) {
      const cell = ws.getCell(r, c);
      // Enforce wrapText while preserving horizontal/vertical alignment
      cell.alignment = {
        vertical: cell.alignment?.vertical || "middle",
        horizontal: cell.alignment?.horizontal,
        ...(cell.alignment || {}),
        wrapText: true,
      };

      // Add thin border only on sides not already defined
      const existing = cell.border || {};
      cell.border = {
        top: existing.top || fallbackEdge,
        left: existing.left || fallbackEdge,
        bottom: existing.bottom || fallbackEdge,
        right: existing.right || fallbackEdge,
      };

      // Check if wrapped text needs slightly taller row height (never shrink existing custom height)
      const txt = extractCellDisplayText(cell.value);
      if (txt.length > 0) {
        const merge = merges.find((m) => r >= m.top && r <= m.bottom && c >= m.left && c <= m.right);
        // Only calculate from top-left anchor of a merge
        if (!merge || (r === merge.top && c === merge.left)) {
          let effectiveWidth = 0;
          const startC = merge ? merge.left : c;
          const endC = merge ? merge.right : c;
          for (let colIdx = startC; colIdx <= endC; colIdx++) {
            effectiveWidth += ws.getColumn(colIdx).width || 14;
          }
          const rowSpan = merge ? merge.bottom - merge.top + 1 : 1;
          const lines = txt.split(/\r?\n/);
          let wrappedLines = 0;
          for (const line of lines) {
            wrappedLines += Math.max(1, Math.ceil(line.length / Math.max(8, effectiveWidth - 2)));
          }
          const perRowHeight = Math.ceil((wrappedLines * 14 + 8) / rowSpan);
          if (perRowHeight > maxNeededHeight) {
            maxNeededHeight = Math.min(perRowHeight, 150);
          }
        }
      }
    }

    if (!row.height || maxNeededHeight > row.height) {
      row.height = maxNeededHeight;
    }
  }

  if (!ws.pageSetup || !ws.pageSetup.orientation) {
    ws.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
    };
  }
}

/**
 * Standardized Institutional Excel Worksheet Formatter
 * Guarantees on every generated sheet:
 * - Full borderlines across every cell in the table (including empty/sparse & merged cells)
 * - Auto text-wrap (wrapText: true) with dynamic non-clipping row heights
 * - Sober institutional color palette (Slate Navy headers, Steel-Blue sub-headers & totals,
 *   clean ice-gray zebra striping, pale cream-gold Hot Spot highlights, subtle semantic status tints)
 * - Proper native Excel numeric types & number formatting
 * - Auto-fitted column widths, frozen header panes, visible gridlines, landscape print setup
 */
export function formatExcelJSWorksheet(
  ws: ExcelJS.Worksheet,
  headerRowCount: number = 1
) {
  // Always guarantee all numeric data cells are native numbers with number formats
  ensureExcelJSWorksheetNumbers(ws, headerRowCount);

  // Preserve specialized bespoke sheets (MasterSummaryView, FortnightlyAlertsView) while
  // still guaranteeing wrapText, missing border coverage, non-clipping row heights & print setup
  if (ws._customFormatted) {
    ws.views = ws.views && ws.views.length > 0 ? ws.views : [{ showGridLines: true }];
    ensureCustomSheetBordersAndWrap(ws);
    return;
  }

  const merges = parseWorksheetMerges(ws);
  const { maxRow, maxCol } = getTableDimensions(ws, merges);

  if (maxRow === 0 || maxCol === 0) {
    ws.views = [{ showGridLines: true }];
    return;
  }

  // Build quick merge lookup helpers
  const findMergeForCell = (r: number, c: number): MergeBounds | undefined =>
    merges.find((m) => r >= m.top && r <= m.bottom && c >= m.left && c <= m.right);

  const isRowCoveredByVerticalMerge = (r: number): boolean =>
    merges.some((m) => m.top < r && m.bottom >= r);

  // Pre-classify each row's structural role so multi-section reports and tables format cleanly
  type RowRole =
    | "blank"
    | "title"
    | "subtitle"
    | "header"
    | "subheader"
    | "section"
    | "subtable_header"
    | "total"
    | "hotspot"
    | "data";

  const rowRoles: RowRole[] = new Array(maxRow + 1).fill("data");
  const rowNonEmptyCounts: number[] = new Array(maxRow + 1).fill(0);
  const rowTexts: string[][] = Array.from({ length: maxRow + 1 }, () => new Array(maxCol + 1).fill(""));

  for (let r = 1; r <= maxRow; r++) {
    let nonEmpty = 0;
    for (let c = 1; c <= maxCol; c++) {
      const txt = extractCellDisplayText(ws.getCell(r, c).value).trim();
      rowTexts[r][c] = txt;
      if (txt !== "") nonEmpty++;
    }
    rowNonEmptyCounts[r] = nonEmpty;
  }

  let hasBlankSpacerRow = false;

  for (let r = 1; r <= maxRow; r++) {
    const nonEmpty = rowNonEmptyCounts[r];

    if (nonEmpty === 0 && !isRowCoveredByVerticalMerge(r)) {
      rowRoles[r] = "blank";
      hasBlankSpacerRow = true;
      continue;
    }

    // Check if row 1 is a single-cell full-width title banner (either already merged across >= 3 cols or single long cell on a multi-column sheet)
    const row1FullMerge =
      r === 1 &&
      maxCol >= 3 &&
      (merges.some((m) => m.top === 1 && m.bottom === 1 && m.left === 1 && m.right >= Math.min(maxCol, 3)) ||
        (nonEmpty === 1 && rowTexts[1][1].length >= 16));

    if (row1FullMerge) {
      rowRoles[r] = "title";
      // Auto-merge unmerged single-cell title banner across the full table width for clean layout
      if (!findMergeForCell(1, 1) && maxCol > 1) {
        try {
          ws.mergeCells(1, 1, 1, maxCol);
          merges.push({ top: 1, left: 1, bottom: 1, right: maxCol });
        } catch {
          // Ignore if overlapping merge exists
        }
      }
      continue;
    }

    // Row 2 right below a title banner: could be a subtitle banner (single cell) OR the main column header row
    if (r === 2 && rowRoles[1] === "title") {
      if (nonEmpty === 1 && maxCol >= 3 && rowTexts[2][1].length >= 10) {
        rowRoles[r] = "subtitle";
        if (!findMergeForCell(2, 1) && maxCol > 1) {
          try {
            ws.mergeCells(2, 1, 2, maxCol);
            merges.push({ top: 2, left: 1, bottom: 2, right: maxCol });
          } catch {
            // Ignore overlap
          }
        }
        continue;
      }
      rowRoles[r] = "header";
      continue;
    }

    if (r <= headerRowCount) {
      if (r === 1) {
        rowRoles[r] = "header";
      } else if (rowRoles[r - 1] === "title" || rowRoles[r - 1] === "subtitle") {
        rowRoles[r] = "header";
      } else {
        rowRoles[r] = "subheader";
      }
      continue;
    }

    // Detect embedded section banners after a blank spacer row (single text cell on a multi-column sheet)
    if (
      r > 2 &&
      rowRoles[r - 1] === "blank" &&
      nonEmpty === 1 &&
      maxCol >= 3 &&
      rowTexts[r][1].length >= 8 &&
      !isNumericString(rowTexts[r][1])
    ) {
      rowRoles[r] = "section";
      if (!findMergeForCell(r, 1) && maxCol > 1) {
        try {
          ws.mergeCells(r, 1, r, maxCol);
          merges.push({ top: r, left: 1, bottom: r, right: maxCol });
        } catch {
          // Ignore overlap
        }
      }
      continue;
    }

    // Detect sub-table header row immediately following a section banner or blank spacer row
    if (
      r > 2 &&
      (rowRoles[r - 1] === "section" || rowRoles[r - 1] === "blank") &&
      nonEmpty >= 2
    ) {
      let allNonNumericLabels = true;
      for (let c = 1; c <= maxCol; c++) {
        const val = ws.getCell(r, c).value;
        const txt = rowTexts[r][c];
        if (!txt) continue;
        if (typeof val === "number" || isNumericString(txt)) {
          allNonNumericLabels = false;
          break;
        }
      }
      // Verify the next row (if present) actually contains data/numbers so we don't misclassify a key-value pair
      let nextLooksLikeData = false;
      if (r + 1 <= maxRow && rowNonEmptyCounts[r + 1] >= 2) {
        for (let c = 1; c <= maxCol; c++) {
          const nextVal = ws.getCell(r + 1, c).value;
          const nextTxt = rowTexts[r + 1][c];
          if (typeof nextVal === "number" || isNumericString(nextTxt) || /%$/.test(nextTxt)) {
            nextLooksLikeData = true;
            break;
          }
        }
      }
      if (allNonNumericLabels && nextLooksLikeData && nonEmpty >= 3) {
        rowRoles[r] = "subtable_header";
        continue;
      }
    }

    // Detect Total / Grand Total / Consolidated / Summary rows
    let isTotalRow = false;
    let isHotspotRow = false;
    for (let c = 1; c <= maxCol; c++) {
      const upper = rowTexts[r][c].toUpperCase();
      if (!upper) continue;
      if (
        upper === "TOTAL" ||
        upper === "GRAND TOTAL" ||
        upper === "TOTAL SUMMARY" ||
        upper === "SUMMARY TOTAL" ||
        upper === "OVERALL" ||
        upper === "ALL INDIA" ||
        upper === "ALL INDIA TOTAL" ||
        upper.startsWith("GRAND TOTAL") ||
        upper.startsWith("TOTAL SUMMARY") ||
        upper.startsWith("CONSOLIDATED") ||
        upper.startsWith("OVERALL TOTAL")
      ) {
        isTotalRow = true;
      }
      if (upper === "IDENTIFIED HOT SPOT" || upper === "IDENTIFIED HOTSPOT") {
        isHotspotRow = true;
      }
    }

    if (isTotalRow) {
      rowRoles[r] = "total";
    } else if (isHotspotRow) {
      rowRoles[r] = "hotspot";
    } else {
      rowRoles[r] = "data";
    }
  }

  // Determine the primary column header row for alignment heuristics
  let primaryHeaderRow = 1;
  for (let r = 1; r <= maxRow; r++) {
    if (rowRoles[r] === "header") {
      primaryHeaderRow = r;
    }
  }

  const centerCols = new Set<number>();
  for (let c = 1; c <= maxCol; c++) {
    const hText = rowTexts[primaryHeaderRow]?.[c] || rowTexts[1]?.[c] || "";
    if (isCenterAlignedColumnHeader(hText)) {
      centerCols.add(c);
    }
  }

  // 1. Compute optimal column widths across all non-banner rows
  const computedColWidths: number[] = new Array(maxCol + 1).fill(12);
  for (let c = 1; c <= maxCol; c++) {
    let maxLen = 10;
    const existingColWidth = ws.getColumn(c).width;

    for (let r = 1; r <= maxRow; r++) {
      const role = rowRoles[r];
      if (role === "blank" || role === "title" || role === "subtitle" || role === "section") {
        continue;
      }
      const merge = findMergeForCell(r, c);
      // Skip cells spanning multiple columns horizontally when sizing individual columns
      if (merge && merge.right > merge.left) {
        continue;
      }

      const txt = rowTexts[r][c];
      if (!txt) continue;

      const lines = txt.split(/\r?\n/);
      for (const line of lines) {
        // For very long comma-separated or prose text, cap contribution so column wraps gracefully
        const effectiveLen = Math.min(line.length, 40);
        if (effectiveLen > maxLen) {
          maxLen = effectiveLen;
        }
      }
    }

    let finalWidth = Math.min(Math.max(maxLen + 4, 11), 44);
    // Respect explicit template width hint if slightly larger (capped cleanly at 44)
    if (typeof existingColWidth === "number" && existingColWidth > 0) {
      finalWidth = Math.min(Math.max(finalWidth, Math.min(existingColWidth, 38)), 44);
    }
    computedColWidths[c] = finalWidth;
    ws.getColumn(c).width = finalWidth;
  }

  // Reusable border definitions
  const thinInner: ExcelJS.Border = { style: "thin", color: { argb: EXCEL_PALETTE.borderInner } };
  const thinHeaderDivider: ExcelJS.Border = { style: "thin", color: { argb: EXCEL_PALETTE.borderHeaderInner } };
  const mediumNavy: ExcelJS.Border = { style: "medium", color: { argb: EXCEL_PALETTE.borderHeader } };
  const thinNavy: ExcelJS.Border = { style: "thin", color: { argb: EXCEL_PALETTE.borderHeader } };
  const doubleNavy: ExcelJS.Border = { style: "double", color: { argb: EXCEL_PALETTE.borderHeader } };

  // Track alternating data row index cleanly across multi-section sheets
  let dataStripeIndex = 0;

  // 2. Apply full borderlines, auto-wrap, sober colors, alignment, and dynamic row heights
  for (let r = 1; r <= maxRow; r++) {
    const role = rowRoles[r];
    const row = ws.getRow(r);

    if (role === "blank") {
      row.height = 10;
      dataStripeIndex = 0;
      continue;
    }

    if (role === "header" || role === "subheader" || role === "subtable_header" || role === "section") {
      dataStripeIndex = 0;
    }

    const isZebraRow = role === "data" && dataStripeIndex % 2 === 1;
    if (role === "data") dataStripeIndex++;

    // Determine whether this data row is part of a 2-column key-value metadata block (e.g., Metric | Value)
    const isMetaKeyValueRow =
      role === "data" &&
      maxCol >= 3 &&
      rowNonEmptyCounts[r] === 2 &&
      rowTexts[r][1] !== "" &&
      rowTexts[r][2] !== "" &&
      rowTexts[r].slice(3).every((t) => t === "");

    // Compute dynamic row height based on wrapped text across every cell in this row
    let maxWrappedLines = 1;

    for (let c = 1; c <= maxCol; c++) {
      const cell = ws.getCell(r, c);
      const merge = findMergeForCell(r, c);
      const isLeftEdge = c === 1;
      const isRightEdge = c === maxCol;
      const isBottomTableEdge = r === maxRow || rowRoles[r + 1] === "blank";
      const isTopTableEdge = r === 1 || rowRoles[r - 1] === "blank";

      // Calculate wrapped line count from the cell (or merge anchor)
      if (!merge || (r === merge.top && c === merge.left)) {
        const txt = rowTexts[r][c];
        if (txt.length > 0) {
          let availWidth = 0;
          const startC = merge ? merge.left : c;
          const endC = merge ? merge.right : c;
          for (let colIdx = startC; colIdx <= endC; colIdx++) {
            availWidth += computedColWidths[colIdx] || 12;
          }
          const rowSpan = merge ? merge.bottom - merge.top + 1 : 1;
          const lines = txt.split(/\r?\n/);
          let estLines = 0;
          for (const line of lines) {
            estLines += Math.max(1, Math.ceil(line.length / Math.max(8, availWidth - 2)));
          }
          const perRowLines = Math.ceil(estLines / rowSpan);
          if (perRowLines > maxWrappedLines) {
            maxWrappedLines = perRowLines;
          }
        }
      }

      // Apply role-based sober full styling
      if (role === "title") {
        cell.font = {
          name: "Calibri",
          size: 13,
          bold: true,
          color: { argb: EXCEL_PALETTE.textWhite },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: EXCEL_PALETTE.titleBg },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
        cell.border = {
          top: mediumNavy,
          left: isLeftEdge ? mediumNavy : thinHeaderDivider,
          bottom: mediumNavy,
          right: isRightEdge ? mediumNavy : thinHeaderDivider,
        };
      } else if (role === "subtitle") {
        cell.font = {
          name: "Calibri",
          size: 11,
          bold: true,
          color: { argb: EXCEL_PALETTE.textNavy },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: EXCEL_PALETTE.subHeaderBg },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
        cell.border = {
          top: thinNavy,
          left: isLeftEdge ? mediumNavy : thinInner,
          bottom: mediumNavy,
          right: isRightEdge ? mediumNavy : thinInner,
        };
      } else if (role === "section") {
        cell.font = {
          name: "Calibri",
          size: 11,
          bold: true,
          color: { argb: EXCEL_PALETTE.textNavy },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: EXCEL_PALETTE.sectionBannerBg },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true,
        };
        cell.border = {
          top: mediumNavy,
          left: isLeftEdge ? mediumNavy : thinInner,
          bottom: thinNavy,
          right: isRightEdge ? mediumNavy : thinInner,
        };
      } else if (role === "header" || role === "subtable_header") {
        cell.font = {
          name: "Calibri",
          size: 11,
          bold: true,
          color: { argb: EXCEL_PALETTE.textWhite },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: EXCEL_PALETTE.headerBg },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
        cell.border = {
          top: isTopTableEdge ? mediumNavy : thinNavy,
          left: isLeftEdge ? mediumNavy : thinHeaderDivider,
          bottom: mediumNavy,
          right: isRightEdge ? mediumNavy : thinHeaderDivider,
        };
      } else if (role === "subheader") {
        cell.font = {
          name: "Calibri",
          size: 10.5,
          bold: true,
          color: { argb: EXCEL_PALETTE.textNavy },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: EXCEL_PALETTE.subHeaderBg },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
        cell.border = {
          top: thinNavy,
          left: isLeftEdge ? mediumNavy : thinInner,
          bottom: mediumNavy,
          right: isRightEdge ? mediumNavy : thinInner,
        };
      } else if (role === "total") {
        const isNumeric = typeof cell.value === "number";
        cell.font = {
          name: "Calibri",
          size: 11,
          bold: true,
          color: { argb: EXCEL_PALETTE.textNavy },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: EXCEL_PALETTE.totalBg },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: isNumeric ? "right" : c <= 2 ? "center" : "left",
          wrapText: true,
        };
        cell.border = {
          top: mediumNavy,
          left: isLeftEdge ? mediumNavy : thinInner,
          bottom: doubleNavy,
          right: isRightEdge ? mediumNavy : thinInner,
        };
      } else if (role === "hotspot") {
        const isNumeric = typeof cell.value === "number";
        const horizAlign: "left" | "center" | "right" =
          c === 1 || centerCols.has(c)
            ? "center"
            : isNumeric
            ? "right"
            : "left";

        cell.font = {
          name: "Calibri",
          size: 10.5,
          bold: true,
          color: { argb: EXCEL_PALETTE.textHotspot },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: EXCEL_PALETTE.hotspotRowBg },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: horizAlign,
          wrapText: true,
        };
        cell.border = {
          top: thinNavy,
          left: isLeftEdge ? mediumNavy : thinInner,
          bottom: isBottomTableEdge ? mediumNavy : thinInner,
          right: isRightEdge ? mediumNavy : thinInner,
        };
      } else {
        // Standard Data Cell
        const isNumeric = typeof cell.value === "number";
        const cellText = rowTexts[r][c];
        const semantic = classifySemanticStatus(cellText);

        let horizAlign: "left" | "center" | "right" = isNumeric ? "right" : "left";
        if (centerCols.has(c) || semantic !== null) {
          horizAlign = "center";
        } else if (c === 1 && (isNumeric || cellText.length <= 6)) {
          horizAlign = "center";
        }

        // Enforce native number format if missing
        if (isNumeric && (!cell.numFmt || cell.numFmt === "@" || cell.numFmt === "General")) {
          cell.numFmt = getSmartNumberFormat(cell.value as number);
        }

        if (semantic === "danger") {
          cell.font = {
            name: "Calibri",
            size: 10.5,
            bold: true,
            color: { argb: EXCEL_PALETTE.dangerText },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: EXCEL_PALETTE.dangerBg },
          };
        } else if (semantic === "warning") {
          cell.font = {
            name: "Calibri",
            size: 10.5,
            bold: true,
            color: { argb: EXCEL_PALETTE.warningText },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: EXCEL_PALETTE.warningBg },
          };
        } else if (semantic === "safe") {
          cell.font = {
            name: "Calibri",
            size: 10.5,
            bold: true,
            color: { argb: EXCEL_PALETTE.safeText },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: EXCEL_PALETTE.safeBg },
          };
        } else if (isMetaKeyValueRow && c === 1) {
          cell.font = {
            name: "Calibri",
            size: 10.5,
            bold: true,
            color: { argb: EXCEL_PALETTE.textNavy },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: EXCEL_PALETTE.metaLabelBg },
          };
        } else {
          cell.font = {
            name: "Calibri",
            size: 10.5,
            bold: false,
            color: { argb: EXCEL_PALETTE.textDark },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: isZebraRow ? EXCEL_PALETTE.zebraEvenBg : EXCEL_PALETTE.zebraOddBg },
          };
        }

        cell.alignment = {
          vertical: "middle",
          horizontal: horizAlign,
          wrapText: true,
        };
        cell.border = {
          top: isTopTableEdge ? mediumNavy : thinInner,
          left: isLeftEdge ? mediumNavy : thinInner,
          bottom: isBottomTableEdge ? mediumNavy : thinInner,
          right: isRightEdge ? mediumNavy : thinInner,
        };
      }
    }

    // Set non-clipping dynamic row height
    const baseHeight =
      role === "title"
        ? 30
        : role === "header" || role === "subtable_header"
        ? 28
        : role === "subtitle" || role === "section" || role === "subheader"
        ? 25
        : role === "total"
        ? 24
        : 21;
    const lineFactor = role === "title" ? 17 : 15;
    const padding = role === "header" || role === "title" ? 10 : 6;
    row.height = Math.min(Math.max(baseHeight, maxWrappedLines * lineFactor + padding), 150);
  }

  // 3. Configure Freeze Panes & Gridlines
  const freezeRows =
    !hasBlankSpacerRow && primaryHeaderRow >= 1 && primaryHeaderRow <= 3 && maxRow > primaryHeaderRow
      ? Math.max(headerRowCount, primaryHeaderRow)
      : 0;

  if (freezeRows > 0) {
    ws.views = [{ state: "frozen", ySplit: freezeRows, showGridLines: true }];
  } else {
    ws.views = [{ showGridLines: true }];
  }

  // 4. Configure Landscape Fit-to-1-Page-Wide Print Setup
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
  };
}

function sanitizeExcelJSSheetName(rawName: string, usedNames: Set<string>): string {
  const cleaned = (rawName || "Sheet")
    .replace(/[\\/*?:[\]]/g, "_")
    .trim()
    .slice(0, 31) || "Sheet";

  if (!usedNames.has(cleaned)) {
    usedNames.add(cleaned);
    return cleaned;
  }

  let idx = 2;
  while (idx < 1000) {
    const suffix = `_${idx}`;
    const candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    idx++;
  }
  const fallback = `Sheet_${usedNames.size + 1}`;
  usedNames.add(fallback);
  return fallback;
}

/**
 * Converts a SheetJS (XLSX) WorkBook into a fully formatted ExcelJS Workbook,
 * preserving all sheets, cell values, native number formats, formulas, column widths,
 * and merged cell regions, then applying standardized borderlines, auto-wrap, and sober colors.
 */
export function convertSheetJSWorkbookToExcelJS(
  sheetJsWb: XLSX.WorkBook,
  headerRowCountMap?: Record<string, number>
): ExcelJS.Workbook {
  const excelWb = new ExcelJS.Workbook();
  excelWb.creator = "Groundwater Quality Analysis System";
  excelWb.created = new Date();
  excelWb.modified = new Date();

  const usedNames = new Set<string>();

  for (const sheetName of sheetJsWb.SheetNames) {
    const srcWs = sheetJsWb.Sheets[sheetName];
    if (!srcWs) continue;

    const safeName = sanitizeExcelJSSheetName(sheetName, usedNames);
    const dstWs = excelWb.addWorksheet(safeName);

    const ref = srcWs["!ref"];
    let detectedHeaderRows = headerRowCountMap?.[sheetName] ?? headerRowCountMap?.[safeName] ?? 1;

    if (ref) {
      const range = XLSX.utils.decode_range(ref);

      // Copy column width hints if provided on SheetJS sheet
      const srcCols = srcWs["!cols"] as Array<{ wch?: number; width?: number }> | undefined;
      if (Array.isArray(srcCols)) {
        srcCols.forEach((colInfo, idx) => {
          const w = colInfo?.wch ?? colInfo?.width;
          if (typeof w === "number" && w > 0) {
            dstWs.getColumn(idx + 1).width = w;
          }
        });
      }

      // Copy cell values & number formats
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const srcCell = srcWs[addr] as XLSX.CellObject | undefined;
          if (!srcCell) continue;

          const dstCell = dstWs.getCell(r + 1, c + 1);

          if (srcCell.f) {
            dstCell.value = {
              formula: srcCell.f,
              result: srcCell.v as string | number | Date | undefined,
              date1904: false,
            };
          } else if (srcCell.t === "n" && typeof srcCell.v === "number") {
            dstCell.value = srcCell.v;
          } else if (srcCell.t === "b") {
            dstCell.value = Boolean(srcCell.v);
          } else if (srcCell.t === "d" && srcCell.v instanceof Date) {
            dstCell.value = srcCell.v;
          } else if (srcCell.v !== undefined && srcCell.v !== null) {
            dstCell.value = srcCell.v as ExcelJS.CellValue;
          }

          if (srcCell.z && typeof srcCell.z === "string" && srcCell.z !== "General") {
            dstCell.numFmt = srcCell.z;
          }
        }
      }

      // Copy merged cell ranges
      const srcMerges = srcWs["!merges"] as XLSX.Range[] | undefined;
      if (Array.isArray(srcMerges)) {
        for (const m of srcMerges) {
          if (!m?.s || !m?.e) continue;
          const top = Math.min(m.s.r, m.e.r) + 1;
          const left = Math.min(m.s.c, m.e.c) + 1;
          const bottom = Math.max(m.s.r, m.e.r) + 1;
          const right = Math.max(m.s.c, m.e.c) + 1;
          if (top === bottom && left === right) continue;

          // If row 1 is a merged title banner spanning multiple columns, ensure row 2 is also treated as header
          if (top === 1 && bottom === 1 && right - left >= 2 && detectedHeaderRows < 2) {
            detectedHeaderRows = 2;
          }

          try {
            dstWs.mergeCells(top, left, bottom, right);
          } catch {
            // Skip duplicate or overlapping merges safely
          }
        }
      }
    }

    formatExcelJSWorksheet(dstWs, detectedHeaderRows);
  }

  return excelWb;
}

/**
 * Converts a SheetJS (XLSX) WorkBook to a fully styled ExcelJS Workbook and downloads it as .xlsx.
 * Replaces plain XLSX.writeFile calls so every exported sheet has full borders, auto-wrap, and sober colors.
 */
export async function downloadStyledSheetJSWorkbook(
  sheetJsWb: XLSX.WorkBook,
  fileName: string,
  headerRowCountMap?: Record<string, number>
): Promise<void> {
  const excelWb = convertSheetJSWorkbookToExcelJS(sheetJsWb, headerRowCountMap);
  const buffer = await excelWb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function getExcelJSBlob(
  workbook: ExcelJS.Workbook,
  headerRowCountMap?: Record<string, number>
): Promise<Blob> {
  workbook.worksheets.forEach((ws) => {
    const hCount = headerRowCountMap?.[ws.name] || 1;
    formatExcelJSWorksheet(ws, hCount);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Format and trigger ExcelJS workbook download
 */
export async function downloadExcelJSWorkbook(
  workbook: ExcelJS.Workbook,
  fileName: string,
  headerRowCountMap?: Record<string, number>
) {
  const blob = await getExcelJSBlob(workbook, headerRowCountMap);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Helper to build a styled ExcelJS workbook directly from 2D data arrays
 */
export async function exportSimpleExcel(
  sheets: Array<{
    sheetName: string;
    headers?: string[];
    data: any[][]; // array of row arrays
    headerRowCount?: number;
  }>,
  fileName: string
) {
  const wb = new ExcelJS.Workbook();
  const headerMap: Record<string, number> = {};

  sheets.forEach(({ sheetName, headers, data, headerRowCount = 1 }) => {
    const ws = wb.addWorksheet(sheetName);
    headerMap[sheetName] = headerRowCount;

    if (headers && headers.length > 0) {
      ws.addRow(headers);
    }

    data.forEach((row) => {
      ws.addRow(row);
    });
  });

  await downloadExcelJSWorkbook(wb, fileName, headerMap);
}

/**
 * Scans a SheetJS (XLSX) worksheet and guarantees all numeric cells (even if entered as strings)
 * are converted to native Number cells (t: "n") with valid number formatting (z).
 */
export function ensureSheetJSNumbers(ws: any, headerRowCount: number = 1) {
  if (!ws || !ws["!ref"]) return;
  const ref = ws["!ref"];
  const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return;

  function colToNum(col: string): number {
    let num = 0;
    for (let i = 0; i < col.length; i++) {
      num = num * 26 + (col.charCodeAt(i) - 64);
    }
    return num;
  }

  function numToCol(num: number): string {
    let s = "";
    while (num > 0) {
      const m = (num - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      num = Math.floor((num - m) / 26);
    }
    return s;
  }

  const startCol = colToNum(match[1]);
  const startRow = parseInt(match[2], 10);
  const endCol = colToNum(match[3]);
  const endRow = parseInt(match[4], 10);

  for (let r = startRow; r <= endRow; r++) {
    if (r <= headerRowCount) continue; // Skip header rows

    for (let c = startCol; c <= endCol; c++) {
      const cellRef = numToCol(c) + r;
      const cell = ws[cellRef];
      if (!cell) continue;

      // If string, test if it's numeric
      if (cell.t === "s" && typeof cell.v === "string") {
        const trimmed = cell.v.trim();
        if (isNumericString(trimmed)) {
          const num = Number(trimmed.replace(/,/g, ""));
          if (!isNaN(num) && isFinite(num)) {
            cell.t = "n";
            cell.v = num;
            if (!cell.z) {
              cell.z = getSmartNumberFormat(num);
            }
          }
        }
      } else if (cell.t === "n" && typeof cell.v === "number") {
        if (!cell.z) {
          cell.z = getSmartNumberFormat(cell.v);
        }
      }
    }
  }
}
