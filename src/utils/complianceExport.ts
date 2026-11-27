import * as XLSX from "xlsx";
import { DataHeaders, ParamConfigItem } from "../types";
import { PARAM_CONFIG } from "../data/config";
import { getStats } from "./math";
import { ensureSheetJSNumbers } from "./excelFormatter";
import { canonicalCaseKey, toProperCaseLabel } from "./textNormalization";

export type ReportingLevel = "State" | "District" | "Block";

const HEAVY_METAL_KEYS = [
  "Fe",
  "As",
  "U",
  "Zn",
  "Cu",
  "Pb",
  "Cd",
  "Cr",
  "Hg",
  "Ni",
  "Se",
  "Ba",
];

export function applyExcelStyles(ws: XLSX.WorkSheet, headerRowCount = 1): void {
  if (!ws["!ref"]) return;
  ensureSheetJSNumbers(ws, headerRowCount);
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const colWidths: Array<{ wch: number }> = [];
  const rowHeights: Array<{ hpt: number }> = [];

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellRef]) ws[cellRef] = { t: "s", v: "" };
      const cellText = ws[cellRef].w || String(ws[cellRef].v || "");

      const maxLineLen = Math.max(...cellText.split("\n").map((l: string) => l.length));
      const textLen = maxLineLen + 2;

      if (!colWidths[C] || colWidths[C].wch < textLen) {
        colWidths[C] = { wch: Math.min(Math.max(textLen, 10), 40) };
      }
    }
  }

  for (let R = range.s.r; R <= range.e.r; ++R) {
    const isHeader = R < headerRowCount;
    let maxRowHeight = isHeader ? 25 : 18;

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellRef];
      const cellText = cell.w || String(cell.v || "");
      const lines = cellText.split("\n");
      const colWidthLimit = colWidths[C].wch;

      let estimatedLines = 0;
      lines.forEach((line: string) => {
        estimatedLines += Math.max(1, Math.ceil((line.length + 1) / colWidthLimit));
      });

      const calcHeight = estimatedLines * 15 + 4;
      if (calcHeight > maxRowHeight) maxRowHeight = calcHeight;

      cell.s = {
        font: {
          name: "Calibri",
          sz: 11,
          bold: isHeader,
          color: { rgb: isHeader ? "FFFFFF" : "1E293B" },
        },
        fill: isHeader ? { fgColor: { rgb: "1E3A5F" } } : undefined,
        border: {
          top: { style: "thin", color: { rgb: "B8C4D4" } },
          bottom: { style: "thin", color: { rgb: "B8C4D4" } },
          left: { style: "thin", color: { rgb: "B8C4D4" } },
          right: { style: "thin", color: { rgb: "B8C4D4" } },
        },
        alignment: {
          wrapText: true,
          vertical: "center",
          horizontal: isHeader ? "center" : cell.t === "n" ? "right" : "left",
        },
      };
    }
    rowHeights[R] = { hpt: maxRowHeight };
  }

  ws["!cols"] = colWidths;
  ws["!rows"] = rowHeights;
}

export function computeComplianceDataRows(
  paramName: string,
  filteredDataset: Record<string, any>[],
  level: ReportingLevel,
  headers: Pick<DataHeaders, "state" | "district" | "block">,
  headerMap: Record<string, string>,
  paramConfigs: Record<string, ParamConfigItem> = PARAM_CONFIG
): any[][] | null {
  const configKey = headerMap[paramName];
  const config = paramConfigs[configKey];
  if (!config) return null;

  const unit = config.unit;
  const isSingleLimit = config.b1 === config.b2 && configKey !== "pH";

  let accLabel = "";
  let permLabel = "";
  let failLabel = "";
  if (configKey === "pH") {
    accLabel = `pH: ${config.b1}-${config.b2}`;
    failLabel = "Out Range";
  } else if (isSingleLimit) {
    accLabel = `≤${config.b1} ${unit}`;
    failLabel = `>${config.b1} ${unit}`;
  } else {
    accLabel = `≤${config.b1} ${unit}`;
    permLabel = `>${config.b1}-${config.b2} ${unit}`;
    failLabel = `>${config.b2} ${unit}`;
  }

  const cols: string[] = ["S.No."];
  if (level === "State") cols.push("State");
  else if (level === "District") cols.push("State", "District");
  else cols.push("State", "District", "Block");

  cols.push("Total Samples", `${accLabel} (No)`, `${accLabel} (%)`);
  if (!isSingleLimit && configKey !== "pH") {
    cols.push(`${permLabel} (No)`, `${permLabel} (%)`);
  }
  cols.push(`${failLabel} (No)`, `${failLabel} (%)`, "Min", "Max", "Average", "SD");

  const groupKey =
    level === "State"
      ? headers.state
      : level === "District"
      ? headers.district
      : headers.block;

  if (!groupKey) return null;

  const groupMap: Record<
    string,
    { state: string; district: string; block: string; name: string; samples: Record<string, any>[] }
  > = {};
  let globalAcc = 0;
  let globalPerm = 0;
  let globalFail = 0;
  const globalVals: number[] = [];

  filteredDataset.forEach((row) => {
    const rowSt = toProperCaseLabel(row[headers.state || ""]);
    const rowDt = toProperCaseLabel(row[headers.district || ""]);
    const rowBlk = toProperCaseLabel(row[headers.block || ""]);
    const loc = toProperCaseLabel(row[groupKey]) || "Unknown";

    const stKey = canonicalCaseKey(rowSt);
    const dtKey = canonicalCaseKey(rowDt);
    const locKey = canonicalCaseKey(loc);

    let compositeKey = locKey;
    if (level === "District") {
      compositeKey = stKey ? `${stKey}___${locKey}` : locKey;
    } else if (level === "Block") {
      compositeKey = `${stKey}___${dtKey}___${locKey}`;
    }

    if (!groupMap[compositeKey]) {
      groupMap[compositeKey] = {
        state: rowSt,
        district: rowDt,
        block: rowBlk,
        name: loc,
        samples: [],
      };
    }
    groupMap[compositeKey].samples.push(row);

    const val = parseFloat(row[paramName]);
    if (!isNaN(val)) globalVals.push(val);
  });

  const bodyRows: any[][] = [];
  const sortedEntries = Object.entries(groupMap).sort((a, b) => {
    const stComp = (a[1].state || "").localeCompare(b[1].state || "");
    if (stComp !== 0) return stComp;
    const dtComp = (a[1].district || "").localeCompare(b[1].district || "");
    if (dtComp !== 0) return dtComp;
    return a[1].name.localeCompare(b[1].name);
  });

  sortedEntries.forEach(([_keyKey, data], idx) => {
    const vals = data.samples.map((s) => parseFloat(s[paramName])).filter((v) => !isNaN(v));
    const total = vals.length;
    if (total === 0) return;

    let nAcc = 0;
    let nPerm = 0;
    let nFail = 0;
    vals.forEach((v) => {
      if (configKey === "pH") {
        if (v >= config.b1 && v <= config.b2) {
          nAcc++;
          globalAcc++;
        } else {
          nFail++;
          globalFail++;
        }
      } else if (isSingleLimit) {
        if (v <= config.b1) {
          nAcc++;
          globalAcc++;
        } else {
          nFail++;
          globalFail++;
        }
      } else {
        if (v <= config.b1) {
          nAcc++;
          globalAcc++;
        } else if (v <= config.b2) {
          nPerm++;
          globalPerm++;
        } else {
          nFail++;
          globalFail++;
        }
      }
    });

    const mathStats = getStats(vals);
    const rowItem: any[] = [idx + 1];

    if (level === "State") rowItem.push(data.state || data.name);
    else if (level === "District") rowItem.push(data.state || "-", data.district || data.name);
    else rowItem.push(data.state || "-", data.district || "-", data.block || data.name);

    rowItem.push(total);
    rowItem.push(nAcc, { v: (nAcc / total) * 100, t: "n", z: "0.00" });
    if (!isSingleLimit && configKey !== "pH") {
      rowItem.push(nPerm, { v: (nPerm / total) * 100, t: "n", z: "0.00" });
    }
    rowItem.push(nFail, { v: (nFail / total) * 100, t: "n", z: "0.00" });

    rowItem.push(
      parseFloat(mathStats.min.toFixed(2)),
      parseFloat(mathStats.max.toFixed(2)),
      parseFloat(mathStats.avg.toFixed(2)),
      parseFloat(mathStats.std.toFixed(2))
    );

    bodyRows.push(rowItem);
  });

  if (globalVals.length > 0) {
    const grandStats = getStats(globalVals);
    const totalCount = globalVals.length;
    const totalRow: any[] = ["-"];

    if (level === "State") totalRow.push("TOTAL SUMMARY");
    else if (level === "District") totalRow.push("TOTAL SUMMARY", "");
    else totalRow.push("TOTAL SUMMARY", "", "");

    totalRow.push(totalCount);
    totalRow.push(globalAcc, { v: (globalAcc / totalCount) * 100, t: "n", z: "0.00" });
    if (!isSingleLimit && configKey !== "pH") {
      totalRow.push(globalPerm, { v: (globalPerm / totalCount) * 100, t: "n", z: "0.00" });
    }
    totalRow.push(globalFail, { v: (globalFail / totalCount) * 100, t: "n", z: "0.00" });

    totalRow.push(
      parseFloat(grandStats.min.toFixed(2)),
      parseFloat(grandStats.max.toFixed(2)),
      parseFloat(grandStats.avg.toFixed(2)),
      parseFloat(grandStats.std.toFixed(2))
    );

    bodyRows.push(totalRow);
  }

  return [cols, ...bodyRows];
}

export interface BuildComplianceWorkbookOptions {
  filteredDataset: Record<string, any>[];
  reportingLevel: ReportingLevel;
  headers: DataHeaders;
  headerMap: Record<string, string>;
  exportParams: string[];
  combinedParams: string[];
  exportIndividualExceedance: boolean;
  exportCombinedExceedance: boolean;
  paramConfigs?: Record<string, ParamConfigItem>;
}

export function buildComplianceWorkbook(options: BuildComplianceWorkbookOptions): {
  workbook: XLSX.WorkBook;
  sheetCount: number;
} {
  const {
    filteredDataset,
    reportingLevel,
    headers,
    headerMap,
    exportParams,
    combinedParams,
    exportIndividualExceedance,
    exportCombinedExceedance,
    paramConfigs = PARAM_CONFIG,
  } = options;

  const wb = XLSX.utils.book_new();
  const uniqueSheetNames = new Set<string>();

  exportParams.forEach((paramName) => {
    const dataArr = computeComplianceDataRows(
      paramName,
      filteredDataset,
      reportingLevel,
      headers,
      headerMap,
      paramConfigs
    );
    if (dataArr && dataArr.length > 1) {
      const ws = XLSX.utils.aoa_to_sheet(dataArr);
      applyExcelStyles(ws, 1);

      const cleanName = paramName.substring(0, 24).replace(/[\[\]\*\/\\\?\:]/g, "_");
      let sheetNameVal = cleanName;
      let counter = 1;
      while (uniqueSheetNames.has(sheetNameVal)) {
        sheetNameVal = `${cleanName}_${counter++}`;
      }
      uniqueSheetNames.add(sheetNameVal);

      XLSX.utils.book_append_sheet(wb, ws, sheetNameVal);
    }
  });

  if (exportIndividualExceedance || exportCombinedExceedance) {
    const indRows: any[][] = [];
    const combRows: any[][] = [];
    let indSl = 1;
    let combSl = 1;

    const indCols = [
      "Sl. No",
      "Well ID",
      "State/UT",
      "District",
      "Block/Tehsil",
      "Location",
      "Longitude",
      "Latitude",
      "Measured Value",
      "Parameter Name",
      "BIS Permissible Limit",
      "Unit",
    ];

    const combCols = [
      "Sl. No",
      "Well ID",
      "State/UT",
      "District",
      "Block/Tehsil",
      "Location",
      "Longitude",
      "Latitude",
      "Count of Exceedances",
      "Names of Exceedances",
      "Exceeding Values Detail",
      "Classification",
    ];

    filteredDataset.forEach((row) => {
      const localExceedances: string[] = [];
      const localNames: string[] = [];
      let hasHeavyMetal = false;

      Object.keys(headerMap).forEach((headerCol) => {
        const isExpInd = exportParams.includes(headerCol);
        const isExpComb = combinedParams.includes(headerCol);

        if (!isExpInd && !isExpComb) return;

        const key = headerMap[headerCol];
        if (!key || !paramConfigs[key]) return;
        const config = paramConfigs[key];
        const val = parseFloat(row[headerCol]);

        if (isNaN(val)) return;

        const isSingleLimit = config.b1 === config.b2 && key !== "pH";
        const checkLimit = key === "pH" ? null : isSingleLimit ? config.b1 : config.b2;

        let isExceeding = false;
        let limitStr = "";

        if (key === "pH") {
          if (val < config.b1 || val > config.b2) {
            isExceeding = true;
            limitStr = `${config.b1}-${config.b2}`;
          }
        } else if (checkLimit !== null) {
          if (val > checkLimit) {
            isExceeding = true;
            limitStr = `${checkLimit}`;
          }
        }

        if (isExceeding) {
          const wholeNums = ["TH", "Ca", "SO4", "Mg", "Cl"];
          const decimalPlaces =
            key === "EC"
              ? 1
              : key === "NO3"
              ? 2
              : key === "F"
              ? 3
              : wholeNums.includes(key)
              ? 0
              : 4;
          const zFormat =
            key === "EC"
              ? "0.0"
              : key === "NO3"
              ? "0.00"
              : key === "F"
              ? "0.000"
              : wholeNums.includes(key)
              ? "0"
              : "0.000";

          if (isExpInd) {
            indRows.push([
              indSl++,
              row[headers.wellId || ""] || "-",
              row[headers.state || ""] || "-",
              row[headers.district || ""] || "-",
              row[headers.block || ""] || "-",
              row[headers.location || ""] || "-",
              row[headers.longitude || ""] || "-",
              row[headers.latitude || ""] || "-",
              { v: val, t: "n", z: zFormat },
              headerCol,
              `${limitStr} ${config.unit}`.trim(),
              config.unit,
            ]);
          }

          if (isExpComb) {
            if (HEAVY_METAL_KEYS.includes(key)) hasHeavyMetal = true;

            localExceedances.push(`${headerCol} (${val.toFixed(decimalPlaces)} ${config.unit})`);
            localNames.push(headerCol);
          }
        }
      });

      if (localExceedances.length > 0) {
        let typeClass = "One Parameter Contamination";
        if (hasHeavyMetal) typeClass = "Contamination with heavy metals";
        else if (localExceedances.length > 1) typeClass = "Multi Parameter Contamination";

        combRows.push([
          combSl++,
          row[headers.wellId || ""] || "-",
          row[headers.state || ""] || "-",
          row[headers.district || ""] || "-",
          row[headers.block || ""] || "-",
          row[headers.location || ""] || "-",
          row[headers.longitude || ""] || "-",
          row[headers.latitude || ""] || "-",
          localNames.length,
          localNames.join(", "),
          localExceedances.join(", "),
          typeClass,
        ]);
      }
    });

    if (exportIndividualExceedance && indRows.length > 0) {
      const titleRow = [
        "Locations where parameter values exceed the respective permissible limits as per BIS: 10500",
      ];
      const wsIndData = [titleRow, indCols, ...indRows];
      const wsInd = XLSX.utils.aoa_to_sheet(wsIndData);
      wsInd["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }];
      applyExcelStyles(wsInd, 2);
      XLSX.utils.book_append_sheet(wb, wsInd, "Exceedance Locations");
    }

    if (exportCombinedExceedance && combRows.length > 0) {
      const titleRow = [
        "Locations with one or more parameters exceeding permissible limits as per BIS: 10500",
      ];
      const wsCombData = [titleRow, combCols, ...combRows];
      const wsComb = XLSX.utils.aoa_to_sheet(wsCombData);
      wsComb["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }];
      applyExcelStyles(wsComb, 2);
      XLSX.utils.book_append_sheet(wb, wsComb, "Combined Exceedances");
    }
  }

  return {
    workbook: wb,
    sheetCount: wb.SheetNames.length,
  };
}
