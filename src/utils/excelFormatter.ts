import ExcelJS from "exceljs";

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

/**
 * Scans an ExcelJS Worksheet and ensures that all numeric values (even if originally strings)
 * are stored as native number types with appropriate Excel number formatting.
 */
export function ensureExcelJSWorksheetNumbers(ws: ExcelJS.Worksheet, headerRowCount: number = 1) {
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowCount) return; // Skip headers

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      let rawVal = cell.value;
      if (typeof rawVal === "object" && rawVal !== null) {
        if ((rawVal as any).result !== undefined) {
          rawVal = (rawVal as any).result;
        } else if ((rawVal as any).text !== undefined) {
          rawVal = (rawVal as any).text;
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
        if (!cell.numFmt || cell.numFmt === "@") {
          if (Number.isInteger(cell.value)) {
            cell.numFmt = "0";
          } else {
            const strVal = String(cell.value);
            const decCount = strVal.includes(".") ? strVal.split(".")[1].length : 0;
            if (decCount <= 2) {
              cell.numFmt = "0.00";
            } else if (decCount <= 4) {
              cell.numFmt = "0.0000";
            } else {
              cell.numFmt = "0.000000";
            }
          }
        }
      }
    });
  });
}

/**
 * Standardized Excel Worksheet Formatter
 * Rules:
 * - Font Family: Times New Roman
 * - Font Size: 12
 * - Header row: Light black color fill (#333333 / FF333333) with Bold white text (FFFFFFFF)
 * - Total row: Light black color fill (#333333 / FF333333) with Bold white text (FFFFFFFF)
 * - Auto-wrapped cells with minimum possible row height (Header: 24pt, Data: 20pt)
 * - Enforces native Number format for all numeric cells across the sheet
 */
export function formatExcelJSWorksheet(
  ws: ExcelJS.Worksheet,
  headerRowCount: number = 1
) {
  // Always guarantee all numeric data cells are native numbers with number formats
  ensureExcelJSWorksheetNumbers(ws, headerRowCount);

  // Enable grid lines
  ws.views = [{ showGridLines: true }];

  // If worksheet was already custom formatted by a specialized module, preserve custom colors/fonts
  if ((ws as any)._customFormatted) {
    return;
  }

  // Compute column widths dynamically with safety padding
  (ws.columns || []).forEach((col) => {
    if (!col) return;
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      let rawVal = cell.value;
      if (typeof rawVal === "object" && rawVal !== null) {
        rawVal = (rawVal as any).result ?? (rawVal as any).text ?? (rawVal as any).formula ?? "";
      }
      const valStr = rawVal !== undefined && rawVal !== null ? String(rawVal) : "";
      const lines = valStr.split("\n");
      for (const line of lines) {
        if (line.length > maxLen) {
          maxLen = line.length;
        }
      }
    });
    col.width = Math.min(Math.max(maxLen + 4, 12), 50);
  });

  // Style every row and cell
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const isHeader = rowNumber <= headerRowCount;

    // Check if cell or row contains "Total", "Grand Total", "Consolidated", "Overall"
    let isTotalRow = false;
    row.eachCell({ includeEmpty: true }, (cell) => {
      let rawVal = cell.value;
      if (typeof rawVal === "object" && rawVal !== null) {
        rawVal = (rawVal as any).result ?? (rawVal as any).text ?? "";
      }
      const cellValStr = String(rawVal || "").toUpperCase().trim();
      if (
        cellValStr === "TOTAL" ||
        cellValStr === "GRAND TOTAL" ||
        cellValStr.startsWith("GRAND TOTAL") ||
        cellValStr.startsWith("CONSOLIDATED") ||
        cellValStr.startsWith("OVERALL TOTAL") ||
        cellValStr === "SUMMARY TOTAL"
      ) {
        isTotalRow = true;
      }
    });

    // Minimum possible row height for clean display
    row.height = isHeader ? 24 : isTotalRow ? 22 : 20;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (isHeader || isTotalRow) {
        // Header & Total row styling: Light black fill (#333333), Bold white text
        cell.font = {
          name: "Times New Roman",
          size: 12,
          bold: true,
          color: { argb: "FFFFFFFF" },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF333333" }, // Light black
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF555555" } },
          left: { style: "thin", color: { argb: "FF555555" } },
          bottom: { style: "thin", color: { argb: "FF555555" } },
          right: { style: "thin", color: { argb: "FF555555" } },
        };
      } else {
        // Standard data cell styling: Times New Roman, 12pt, wrap text
        const isNumeric = typeof cell.value === "number";
        const valStr = String(cell.value || "").trim().toLowerCase();
        
        // Determine alignment
        let horizAlign: "left" | "center" | "right" = isNumeric ? "right" : "left";
        if (colNumber === 1 || valStr === "s.no" || valStr === "s.no." || valStr === "sl. no." || valStr === "code") {
          horizAlign = "center";
        }

        cell.font = {
          name: "Times New Roman",
          size: 12,
          color: { argb: "FF1E293B" },
        };

        // Enforce Number format for floats / ints (native Excel numbers)
        if (isNumeric) {
          if (!cell.numFmt || cell.numFmt === "@") {
            if (Number.isInteger(cell.value as number)) {
              cell.numFmt = "0";
            } else {
              const strVal = String(cell.value);
              const decCount = strVal.includes(".") ? strVal.split(".")[1].length : 0;
              cell.numFmt = decCount <= 2 ? "0.00" : decCount <= 4 ? "0.0000" : "0.000000";
            }
          }
        }

        // Alternating row background for enhanced readability
        if (rowNumber % 2 === 0) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        }

        cell.alignment = {
          vertical: "middle",
          horizontal: horizAlign,
          wrapText: true,
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      }
    });
  });
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

  sheets.forEach(({ sheetName, headers, data, headerRowCount = 1 }) => {
    const ws = wb.addWorksheet(sheetName);
    
    if (headers && headers.length > 0) {
      ws.addRow(headers);
    }
    
    data.forEach((row) => {
      ws.addRow(row);
    });

    formatExcelJSWorksheet(ws, headerRowCount);
  });

  await downloadExcelJSWorkbook(wb, fileName);
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
              cell.z = Number.isInteger(num) ? "0" : "0.00";
            }
          }
        }
      } else if (cell.t === "n" && typeof cell.v === "number") {
        if (!cell.z) {
          cell.z = Number.isInteger(cell.v) ? "0" : "0.00";
        }
      }
    }
  }
}
