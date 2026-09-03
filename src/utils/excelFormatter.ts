import ExcelJS from "exceljs";

/**
 * Standardized Excel Worksheet Formatter
 * Rules:
 * - Font Family: Times New Roman
 * - Font Size: 12
 * - Header row: Light black color fill (#333333 / FF333333) with Bold white text (FFFFFFFF)
 * - Total row: Light black color fill (#333333 / FF333333) with Bold white text (FFFFFFFF)
 * - Auto-wrapped cells with minimum possible row height (Header: 24pt, Data: 20pt)
 */
export function formatExcelJSWorksheet(
  ws: ExcelJS.Worksheet,
  headerRowCount: number = 1
) {
  // Enable grid lines
  ws.views = [{ showGridLines: true }];

  // If worksheet was already custom formatted by a specialized module, preserve custom styles
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

        // Number format for floats / ints (no thousands grouping comma)
        if (isNumeric) {
          if (!cell.numFmt) {
            cell.numFmt = Number.isInteger(cell.value as number) ? "0" : "0.00";
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
