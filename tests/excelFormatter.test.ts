import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  EXCEL_PALETTE,
  formatExcelJSWorksheet,
  convertSheetJSWorkbookToExcelJS,
} from "../src/utils/excelFormatter.ts";
import { buildComplianceWorkbook } from "../src/utils/complianceExport.ts";
import { DataHeaders } from "../src/types.ts";

function getFillArgb(cell: ExcelJS.Cell): string | undefined {
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  return fill?.fgColor?.argb;
}

test("formatExcelJSWorksheet enforces full borders (including sparse empty cells), auto-wrap, dynamic row heights, sober colors, and freeze panes", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Summary");

  ws.addRow(["S.No.", "State / UT", "Location Description", "Nitrate (mg/L)", "BIS Status"]);
  ws.addRow([
    "1",
    "Rajasthan",
    "Karauli Hindaun Road deep alluvial aquifer monitoring station with prolonged seasonal contamination",
    "226.4",
    "Unsuitable",
  ]);
  // Sparse row missing trailing 2 columns to confirm full rectangular borderlines
  ws.addRow([2, "Gujarat", "Anand Petlad"]);
  ws.addRow([3, "Punjab", "Amritsar", 18.2, "Desirable"]);
  ws.addRow(["", "GRAND TOTAL", "", 244.6, ""]);

  formatExcelJSWorksheet(ws, 1);

  // Verify header styling: Deep Slate Navy fill, white bold text, wrapText, full borders
  for (let c = 1; c <= 5; c++) {
    const hCell = ws.getCell(1, c);
    assert.equal(getFillArgb(hCell), EXCEL_PALETTE.headerBg);
    assert.equal(hCell.font?.bold, true);
    assert.equal(hCell.font?.color?.argb, EXCEL_PALETTE.textWhite);
    assert.equal(hCell.alignment?.wrapText, true);
    assert.ok(hCell.border?.top?.style, `header col ${c} missing top border`);
    assert.ok(hCell.border?.bottom?.style, `header col ${c} missing bottom border`);
    assert.ok(hCell.border?.left?.style, `header col ${c} missing left border`);
    assert.ok(hCell.border?.right?.style, `header col ${c} missing right border`);
  }

  // Verify EVERY cell in the 5x5 table (including empty trailing cells on row 3) has borders & wrapText
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 5; c++) {
      const cell = ws.getCell(r, c);
      assert.equal(cell.alignment?.wrapText, true, `cell (${r},${c}) missing wrapText`);
      assert.ok(cell.border?.top?.style, `cell (${r},${c}) missing top border`);
      assert.ok(cell.border?.bottom?.style, `cell (${r},${c}) missing bottom border`);
      assert.ok(cell.border?.left?.style, `cell (${r},${c}) missing left border`);
      assert.ok(cell.border?.right?.style, `cell (${r},${c}) missing right border`);
    }
  }

  // Verify native numeric conversion from numeric strings
  assert.equal(typeof ws.getCell(2, 1).value, "number");
  assert.equal(ws.getCell(2, 1).value, 1);
  assert.equal(typeof ws.getCell(2, 4).value, "number");
  assert.equal(ws.getCell(2, 4).value, 226.4);

  // Verify dynamic row height expands for wrapped long text on row 2
  assert.ok((ws.getRow(2).height || 0) >= 36, `Expected row 2 height >= 36 for wrapped text, got ${ws.getRow(2).height}`);

  // Verify sober semantic status highlights
  assert.equal(getFillArgb(ws.getCell(2, 5)), EXCEL_PALETTE.dangerBg);
  assert.equal(ws.getCell(2, 5).font?.color?.argb, EXCEL_PALETTE.dangerText);
  assert.equal(getFillArgb(ws.getCell(4, 5)), EXCEL_PALETTE.safeBg);
  assert.equal(ws.getCell(4, 5).font?.color?.argb, EXCEL_PALETTE.safeText);

  // Verify zebra striping on row 3 (second data row)
  assert.equal(getFillArgb(ws.getCell(3, 2)), EXCEL_PALETTE.zebraEvenBg);

  // Verify Total row styling (dignified steel-blue fill, medium top & double bottom border)
  assert.equal(getFillArgb(ws.getCell(5, 2)), EXCEL_PALETTE.totalBg);
  assert.equal(ws.getCell(5, 2).font?.bold, true);
  assert.equal(ws.getCell(5, 2).border?.top?.style, "medium");
  assert.equal(ws.getCell(5, 2).border?.bottom?.style, "double");

  // Verify frozen header pane & landscape print setup
  assert.equal(ws.views[0]?.state, "frozen");
  assert.equal((ws.views[0] as ExcelJS.WorksheetViewFrozen)?.ySplit, 1);
  assert.equal(ws.pageSetup?.orientation, "landscape");
  assert.equal(ws.pageSetup?.fitToWidth, 1);
});

test("convertSheetJSWorkbookToExcelJS preserves merges, highlights Identified Hot Spot rows, and survives real .xlsx write/read round-trip", async () => {
  const aoa = [
    ["Hot Spot No.", "Type of Sample in grid", "Identification No.", "Location", "Nitrate (mg/L)", "BIS Status"],
    [1, "Identified Hot Spot", "RJ/2024/NO3/1", "Karauli", 226, "Unsuitable"],
    ["", "Grid Sample", "RJ/2024/NO3/1/1", "Karauli Hindaun Road", 9, "Desirable"],
    ["", "Grid Sample", "RJ/2024/NO3/1/2", "Karauli Masalpur Mod", 50, "Permissible"],
  ];
  const sheetJsWs = XLSX.utils.aoa_to_sheet(aoa);
  sheetJsWs["!merges"] = [{ s: { r: 1, c: 0 }, e: { r: 3, c: 0 } }];
  sheetJsWs["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 22 }, { wch: 26 }, { wch: 16 }, { wch: 15 }];

  const sheetJsWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(sheetJsWb, sheetJsWs, "HotSpot_Data_Sheet");

  const excelWb = convertSheetJSWorkbookToExcelJS(sheetJsWb, { HotSpot_Data_Sheet: 1 });
  const buffer = await excelWb.xlsx.writeBuffer();

  // Reload the generated .xlsx file from binary buffer using ExcelJS to verify real persisted XML styles
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer as ArrayBuffer);

  const ws = reloaded.getWorksheet("HotSpot_Data_Sheet");
  assert.ok(ws, "Reloaded worksheet should exist");

  // Verify merge A2:A4 persisted
  assert.equal(ws.getCell("A3").master.address, "A2");
  assert.equal(ws.getCell("A4").master.address, "A2");

  // Verify header styling persisted
  assert.equal(getFillArgb(ws.getCell("A1")), EXCEL_PALETTE.headerBg);
  assert.equal(ws.getCell("B1").alignment?.wrapText, true);

  // Verify Identified Hot Spot row gets sober pale cream-gold highlight
  assert.equal(getFillArgb(ws.getCell("B2")), EXCEL_PALETTE.hotspotRowBg);
  assert.equal(ws.getCell("B2").font?.bold, true);

  // Verify numeric value and border persisted on grid sample
  assert.equal(ws.getCell("E3").value, 9);
  assert.ok(ws.getCell("E3").border?.bottom?.style);
  assert.equal(ws.getCell("F3").alignment?.wrapText, true);
  assert.equal(getFillArgb(ws.getCell("F3")), EXCEL_PALETTE.safeBg);
  assert.equal(getFillArgb(ws.getCell("F4")), EXCEL_PALETTE.warningBg);
});

test("convertSheetJSWorkbookToExcelJS formats multi-sheet compliance workbooks with title banners and section tables", () => {
  const sampleHeaders: DataHeaders = {
    state: "State",
    district: "District",
    block: "Block",
    wellId: "Well ID",
    location: "Location",
    longitude: "Lon",
    latitude: "Lat",
    params: ["F", "NO3"],
  };
  const { workbook } = buildComplianceWorkbook({
    filteredDataset: [
      {
        "Well ID": "W1",
        State: "Rajasthan",
        District: "Jaipur",
        Block: "Sanganer",
        Location: "Site 1",
        Lon: 75.7,
        Lat: 26.8,
        F: 2.1,
        NO3: 60,
      },
    ],
    reportingLevel: "District",
    headers: sampleHeaders,
    headerMap: { F: "F", NO3: "NO3" },
    exportParams: ["F"],
    combinedParams: ["F", "NO3"],
    exportIndividualExceedance: true,
    exportCombinedExceedance: true,
  });

  const styledWb = convertSheetJSWorkbookToExcelJS(workbook, {
    "Exceedance Locations": 2,
    "Combined Exceedances": 2,
  });

  const combWs = styledWb.getWorksheet("Combined Exceedances");
  assert.ok(combWs);
  // Row 1 is the merged title banner (Deep Royal Navy), Row 2 is column header (Slate Navy)
  assert.equal(getFillArgb(combWs.getCell(1, 1)), EXCEL_PALETTE.titleBg);
  assert.equal(getFillArgb(combWs.getCell(2, 1)), EXCEL_PALETTE.headerBg);
  assert.equal(combWs.getCell(3, 12).alignment?.wrapText, true);
  assert.ok(combWs.getCell(3, 12).border?.right?.style);
});

test("formatExcelJSWorksheet preserves custom fills on _customFormatted sheets while enforcing missing borders and wrapText", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("CustomSheet");
  ws._customFormatted = true;

  ws.addRow(["Custom Header", "Value"]);
  ws.addRow(["Zone A", 42]);
  ws.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2EFDA" },
  };
  // Intentionally omit border and wrapText on B2

  formatExcelJSWorksheet(ws, 1);

  // Custom fill must remain untouched
  assert.equal(getFillArgb(ws.getCell("A1")), "FFE2EFDA");
  // Missing border & wrapText must be filled in automatically
  assert.equal(ws.getCell("B2").alignment?.wrapText, true);
  assert.ok(ws.getCell("B2").border?.top?.style);
  assert.ok(ws.getCell("B2").border?.bottom?.style);
  assert.ok(ws.getCell("B2").border?.left?.style);
  assert.ok(ws.getCell("B2").border?.right?.style);
});
