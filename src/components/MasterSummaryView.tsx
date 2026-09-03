import React, { useState, useEffect, useMemo } from "react";
import { DataHeaders } from "../types";
import { PARAM_CONFIG, hasBisLimit } from "../data/config";
import {
  TableProperties,
  FileSpreadsheet,
  Download,
  Maximize2,
  Minimize2,
  FileText,
  AlertTriangle,
  MapPin,
  CheckSquare,
  Layers,
  Search,
  Filter,
  RefreshCw,
  FileCheck,
  Sparkles,
  ChevronRight,
  Info
} from "lucide-react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { downloadExcelJSWorkbook } from "../utils/excelFormatter";
import { downloadMhtmlWordDoc } from "../utils/export";

interface MasterSummaryViewProps {
  rawData: any[];
  headers: DataHeaders;
  headerMap: Record<string, string>;
  selectedState: string;
  selectedDistrict: string;
  onExportExcel: () => void;
  reportingLevel: "State" | "District" | "Block";
}

export default function MasterSummaryView({
  rawData,
  headers,
  headerMap,
  selectedState,
  selectedDistrict,
  onExportExcel,
}: MasterSummaryViewProps) {
  // Main view mode tabs
  const [activeSubTab, setActiveSubTab] = useState<
    "matrix" | "exceedance" | "partially_affected" | "docx_hub"
  >("matrix");

  const [masterGeoLevel, setMasterGeoLevel] = useState<"State" | "District">("State");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bodyHtml, setBodyHtml] = useState<React.ReactNode[]>([]);

  // Sub-tab selection filters
  const [selectedParamForExceedance, setSelectedParamForExceedance] = useState<string>("ALL_ACTIVE");
  const [selectedParamForAffected, setSelectedParamForAffected] = useState<string>("ALL_ACTIVE");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Multi-parameter selection for DOCX Hub
  const [selectedDocxParams, setSelectedDocxParams] = useState<Record<string, boolean>>({});
  const [includeExceedanceInDocx, setIncludeExceedanceInDocx] = useState(true);
  const [includeAffectedInDocx, setIncludeAffectedInDocx] = useState(true);
  const [includePristineInDocx, setIncludePristineInDocx] = useState(true);

  // Get active mapped params (including SAR and RSC if necessary components are present)
  const activeParams = useMemo(() => {
    if (!headers.params) return [];
    let baseParams = [...headers.params];
    
    // Filter out parameters without BIS limits from BIS analysis
    baseParams = baseParams.filter(p => {
      const paramId = headerMap[p] || p;
      return hasBisLimit(paramId) && hasBisLimit(p);
    });
    
    const hasCa = !!headerMap["Ca"];
    const hasMg = !!headerMap["Mg"];
    const hasNa = !!headerMap["Na"];
    const hasHco3 = !!headerMap["HCO3"];
    
    const showSAR = hasCa && hasMg && hasNa && !baseParams.some(p => p === "SAR" || headerMap[p] === "SAR");
    const showRSC = hasCa && hasMg && hasHco3 && !baseParams.some(p => p === "RSC" || headerMap[p] === "RSC");
    
    if (showSAR && !baseParams.includes("SAR")) {
      baseParams.push("SAR");
    }
    if (showRSC && !baseParams.includes("RSC")) {
      baseParams.push("RSC");
    }
    return baseParams;
  }, [headers.params, headerMap]);

  // Sync default multi-select parameters for DOCX Hub when activeParams change
  useEffect(() => {
    if (activeParams.length > 0) {
      const initialMap: Record<string, boolean> = {};
      activeParams.forEach((p) => {
        initialMap[p] = true;
      });
      setSelectedDocxParams(initialMap);
    }
  }, [activeParams]);

  // Helper to parse/calculate parameter values (with fallback for SAR/RSC)
  const getParamVal = (row: any, paramName: string) => {
    if (paramName === "SAR" || paramName === "RSC") {
      const excelCol = headerMap[paramName];
      if (excelCol && row[excelCol] !== undefined && row[excelCol] !== null) {
        const parsedVal = parseFloat(row[excelCol]);
        if (!isNaN(parsedVal)) return parsedVal;
      }
      
      const caCol = headerMap["Ca"] || "Ca";
      const mgCol = headerMap["Mg"] || "Mg";
      const naCol = headerMap["Na"] || "Na";
      const hco3Col = headerMap["HCO3"] || "HCO3";
      const co3Col = headerMap["CO3"] || "CO3";
      
      const caVal = parseFloat(row[caCol]);
      const mgVal = parseFloat(row[mgCol]);
      const naVal = parseFloat(row[naCol]);
      const hco3Val = parseFloat(row[hco3Col]);
      const co3Val = parseFloat(row[co3Col]) || 0;

      const caMeq = !isNaN(caVal) ? caVal / 20.04 : 0;
      const mgMeq = !isNaN(mgVal) ? mgVal / 12.15 : 0;
      const naMeq = !isNaN(naVal) ? naVal / 22.99 : 0;
      const hco3Meq = !isNaN(hco3Val) ? hco3Val / 61.02 : 0;
      const co3Meq = co3Val / 30.00;

      if (!isNaN(caVal) && !isNaN(mgVal)) {
        if (paramName === "SAR") {
          if (!isNaN(naVal)) {
            const denom = Math.sqrt((caMeq + mgMeq) / 2);
            return denom > 0 ? naMeq / denom : NaN;
          }
        } else {
          if (!isNaN(hco3Val)) {
            return (hco3Meq + co3Meq) - (caMeq + mgMeq);
          }
        }
      }
      return NaN;
    }
    const excelCol = headerMap[paramName] || paramName;
    return parseFloat(row[excelCol]);
  };

  // Structured summary computation map for each active parameter
  const summaryDataMap = useMemo(() => {
    if (!rawData.length || !activeParams || activeParams.length === 0) return {};

    const isDistrict = masterGeoLevel === "District";
    const subGroupKey = isDistrict ? headers.block : headers.district;

    // Filter Raw Data based on global state / district inputs
    let filtered = rawData;
    if (selectedState) {
      filtered = filtered.filter(
        (d) => String(d[headers.state || ""] || "").trim() === selectedState
      );
    }
    if (selectedDistrict && isDistrict) {
      filtered = filtered.filter(
        (d) => String(d[headers.district || ""] || "").trim() === selectedDistrict
      );
    }

    // Group samples by Level ID
    const groupMap: Record<string, { state: string; district: string; samples: any[] }> = {};
    filtered.forEach((row) => {
      const state = String(row[headers.state || ""] || "Unknown").trim();
      const district = String(row[headers.district || ""] || "Unknown").trim();
      
      const key = isDistrict ? `${state}|${district}` : state;
      if (!groupMap[key]) {
        groupMap[key] = { state, district, samples: [] };
      }
      groupMap[key].samples.push(row);
    });

    const sortedGroupKeys = Object.keys(groupMap).sort((a, b) => {
      const gA = groupMap[a]!;
      const gB = groupMap[b]!;
      if (gA.state === gB.state) return gA.district.localeCompare(gB.district);
      return gA.state.localeCompare(gB.state);
    });

    const resultMap: Record<string, {
      paramName: string;
      configKey: string;
      paramFullName: string;
      limitHeaderStr: string;
      rows: Array<{
        slNo: number;
        state: string;
        district: string;
        analyzed: number;
        above: number;
        pct: number;
        affectedCount: number;
        affectedNames: string;
      }>;
      totalAnalyzed: number;
      totalAbove: number;
      totalPct: number;
      totalAffectedCount: number;
    }> = {};

    activeParams.forEach((paramName) => {
      const configKey = headerMap[paramName] || paramName;
      const config = PARAM_CONFIG[configKey] || PARAM_CONFIG[paramName];
      const paramFullName = config?.name || paramName;

      let limitHeaderStr = "Permissible Limit";
      if (config) {
        if (configKey === "pH") {
          limitHeaderStr = "Outside 6.5 - 8.5";
        } else {
          const isSingleLimit = config.b1 === config.b2;
          const limitVal = isSingleLimit ? config.b1 : config.b2;
          const unitStr = config.unit ? ` ${config.unit}` : "";
          if (configKey === "EC") {
            limitHeaderStr = `${limitVal} µS/cm at 25°C`;
          } else {
            limitHeaderStr = `${limitVal}${unitStr}`;
          }
        }
      }

      let totalAnalyzed = 0;
      let totalAbove = 0;
      const globalAffectedSet = new Set<string>();

      const rows: Array<{
        slNo: number;
        state: string;
        district: string;
        analyzed: number;
        above: number;
        pct: number;
        affectedCount: number;
        affectedNames: string;
      }> = [];

      let slNo = 1;
      sortedGroupKeys.forEach((key) => {
        const group = groupMap[key]!;
        let analyzed = 0;
        let above = 0;
        const affectedSubGroups = new Set<string>();

        const limit = config ? (config.b1 === config.b2 && configKey !== "pH" ? config.b1 : config.b2) : 0;

        group.samples.forEach((sample) => {
          const val = getParamVal(sample, paramName);
          if (!isNaN(val)) {
            analyzed++;
            let isExceed = false;
            if (configKey === "pH") {
              if (val < (config?.b1 || 6.5) || val > (config?.b2 || 8.5)) isExceed = true;
            } else if (val > limit) {
              isExceed = true;
            }

            if (isExceed) {
              above++;
              if (subGroupKey) {
                const subVal = String(sample[subGroupKey] || "Unknown").trim();
                if (subVal !== "Unknown" && subVal) {
                  affectedSubGroups.add(subVal);
                  globalAffectedSet.add(subVal);
                }
              }
            }
          }
        });

        const pct = analyzed > 0 ? (above / analyzed) * 100 : 0;
        const affectedNames = affectedSubGroups.size > 0 ? Array.from(affectedSubGroups).sort().join(", ") : "-";

        totalAnalyzed += analyzed;
        totalAbove += above;

        rows.push({
          slNo: slNo++,
          state: group.state,
          district: group.district,
          analyzed,
          above,
          pct,
          affectedCount: affectedSubGroups.size,
          affectedNames,
        });
      });

      const totalPct = totalAnalyzed > 0 ? (totalAbove / totalAnalyzed) * 100 : 0;

      resultMap[paramName] = {
        paramName,
        configKey,
        paramFullName,
        limitHeaderStr,
        rows,
        totalAnalyzed,
        totalAbove,
        totalPct,
        totalAffectedCount: globalAffectedSet.size,
      };
    });

    return resultMap;
  }, [rawData, activeParams, masterGeoLevel, selectedState, selectedDistrict, headers, headerMap]);

  // Master unified matrix DOM construction
  useEffect(() => {
    if (!rawData.length || !activeParams || activeParams.length === 0) return;

    const isDistrict = masterGeoLevel === "District";
    const subGroupKey = isDistrict ? headers.block : headers.district;

    let filtered = rawData;
    if (selectedState) {
      filtered = filtered.filter(
        (d) => String(d[headers.state || ""] || "").trim() === selectedState
      );
    }
    if (selectedDistrict && isDistrict) {
      filtered = filtered.filter(
        (d) => String(d[headers.district || ""] || "").trim() === selectedDistrict
      );
    }

    const groupMap: Record<string, { state: string; district: string; samples: any[] }> = {};
    filtered.forEach((row) => {
      const state = String(row[headers.state || ""] || "Unknown").trim();
      const district = String(row[headers.district || ""] || "Unknown").trim();
      const key = isDistrict ? `${state}|${district}` : state;
      if (!groupMap[key]) {
        groupMap[key] = { state, district, samples: [] };
      }
      groupMap[key].samples.push(row);
    });

    const globalStats: Record<string, { analyzed: number; above: number; affectedSubGroups: Set<string>; affectedSubGroupsSum: number }> = {};
    activeParams.forEach((p) => {
      globalStats[p] = { analyzed: 0, above: 0, affectedSubGroups: new Set(), affectedSubGroupsSum: 0 };
    });

    const sortedGroupKeys = Object.keys(groupMap).sort((a, b) => {
      const gA = groupMap[a]!;
      const gB = groupMap[b]!;
      if (gA.state === gB.state) return gA.district.localeCompare(gB.district);
      return gA.state.localeCompare(gB.state);
    });

    const rowElements: React.ReactNode[] = [];
    let slNo = 1;

    sortedGroupKeys.forEach((key) => {
      const group = groupMap[key]!;
      const rowCells: React.ReactNode[] = [];

      rowCells.push(
        <td key="sl" className="p-3 border border-slate-200 text-center text-slate-400 font-bold">
          {slNo++}
        </td>
      );
      rowCells.push(
        <td key="state" className="p-3 border border-slate-200 font-bold">
          {group.state}
        </td>
      );
      if (isDistrict) {
        rowCells.push(
          <td key="district" className="p-3 border border-slate-200 font-black text-slate-900">
            {group.district}
          </td>
        );
      }

      activeParams.forEach((paramName, pIdx) => {
        const configKey = headerMap[paramName] || paramName;
        const config = PARAM_CONFIG[configKey];
        if (!config) {
          rowCells.push(<td key={`${pIdx}-1`} className="p-3 border border-slate-200 text-center font-mono">0</td>);
          rowCells.push(<td key={`${pIdx}-2`} className="p-3 border border-slate-200 text-center font-mono">0</td>);
          rowCells.push(<td key={`${pIdx}-3`} className="p-3 border border-slate-200 text-center font-mono">0.00%</td>);
          rowCells.push(<td key={`${pIdx}-4`} className="p-3 border border-slate-200 text-center font-mono">0</td>);
          rowCells.push(<td key={`${pIdx}-5`} className="p-3 border border-slate-200 text-left">-</td>);
          return;
        }

        const isSingleLimit = config.b1 === config.b2 && configKey !== "pH";
        const limit = isSingleLimit ? config.b1 : config.b2;

        let analyzed = 0;
        let above = 0;
        const affectedSubGroups = new Set<string>();

        group.samples.forEach((sample) => {
          const val = getParamVal(sample, paramName);
          if (!isNaN(val)) {
            analyzed++;
            let isExceed = false;
            if (configKey === "pH") {
              if (val < config.b1 || val > config.b2) isExceed = true;
            } else if (val > limit) {
              isExceed = true;
            }

            if (isExceed) {
              above++;
              if (subGroupKey) {
                const subVal = String(sample[subGroupKey] || "Unknown").trim();
                if (subVal !== "Unknown" && subVal) affectedSubGroups.add(subVal);
              }
            }
          }
        });

        const pct = analyzed > 0 ? (above / analyzed) * 100 : 0;
        const affectedNames = affectedSubGroups.size > 0 ? Array.from(affectedSubGroups).sort().join(", ") : "-";

        rowCells.push(
          <td key={`${pIdx}-a`} className="p-3 border border-slate-100 text-center font-mono text-xs">{analyzed}</td>
        );
        rowCells.push(
          <td key={`${pIdx}-b`} className={`p-3 border border-slate-100 text-center font-mono text-xs font-bold ${above > 0 ? "text-rose-600 bg-rose-50/10" : "text-slate-400"}`}>
            {above}
          </td>
        );
        rowCells.push(
          <td key={`${pIdx}-c`} className={`p-3 border border-slate-100 text-center font-mono text-xs font-black ${above > 0 ? "text-rose-600 bg-rose-50/20" : "text-emerald-600"}`}>
            {pct.toFixed(2)}%
          </td>
        );
        rowCells.push(
          <td key={`${pIdx}-d`} className="p-3 border border-slate-100 text-center font-mono text-xs">{affectedSubGroups.size}</td>
        );
        rowCells.push(
          <td key={`${pIdx}-e`} className="p-3 border border-slate-100 text-left text-slate-500 max-w-[200px] truncate" title={affectedNames}>
            {affectedNames}
          </td>
        );

        globalStats[paramName]!.analyzed += analyzed;
        globalStats[paramName]!.above += above;
        globalStats[paramName]!.affectedSubGroupsSum += affectedSubGroups.size;
        affectedSubGroups.forEach((v) => globalStats[paramName]!.affectedSubGroups.add(v));
      });

      rowElements.push(
        <tr key={key} className="hover:bg-blue-50 transition-colors">
          {rowCells}
        </tr>
      );
    });

    // Add Grand Total row
    if (rowElements.length > 0) {
      const grandCells: React.ReactNode[] = [];
      grandCells.push(
        <td key="sl" className="p-3 border border-slate-700 text-center text-slate-400">-</td>
      );
      grandCells.push(
        <td key="state" className="p-3 border border-slate-700" colSpan={isDistrict ? 2 : 1}>
          GRAND TOTAL
        </td>
      );

      activeParams.forEach((paramName, pIdx) => {
        const stats = globalStats[paramName]!;
        const pct = stats.analyzed > 0 ? (stats.above / stats.analyzed) * 100 : 0;

        grandCells.push(
          <td key={`${pIdx}-a`} className="p-3 border border-slate-700 text-center text-slate-300 font-mono text-xs">{stats.analyzed}</td>
        );
        grandCells.push(
          <td key={`${pIdx}-b`} className={`p-3 border border-slate-700 text-center font-mono text-xs font-black ${stats.above > 0 ? "text-rose-300 bg-rose-900/40" : "text-slate-400"}`}>
            {stats.above}
          </td>
        );
        grandCells.push(
          <td key={`${pIdx}-c`} className={`p-3 border border-slate-700 text-center font-mono text-xs font-black ${stats.above > 0 ? "text-rose-300" : "text-emerald-400"}`}>
            {pct.toFixed(2)}%
          </td>
        );

        grandCells.push(
          <td key={`${pIdx}-d`} className="p-3 border border-slate-700 text-center font-mono text-xs font-bold text-amber-300">
            {stats.affectedSubGroupsSum}
          </td>
        );
        grandCells.push(
          <td key={`${pIdx}-e`} className="p-3 border border-slate-700 text-left text-slate-400 font-semibold max-w-[200px] truncate" title="-">
            -
          </td>
        );
      });

      rowElements.push(
        <tr key="grand_total" className="bg-slate-900 text-white font-extrabold text-xs">
          {grandCells}
        </tr>
      );
    }

    setBodyHtml(rowElements);
  }, [rawData, headers, headerMap, selectedState, selectedDistrict, masterGeoLevel, activeParams]);

  // Handler to export the complete unified Master Summary Matrix table as a styled Excel Sheet
  const handleExportMatrixExcel = async () => {
    if (!rawData.length || !activeParams || activeParams.length === 0) {
      alert("No data available to export.");
      return;
    }

    const isDistrict = masterGeoLevel === "District";
    const subGroupName = isDistrict ? "Block" : "District";

    let filtered = rawData;
    if (selectedState) {
      filtered = filtered.filter(
        (d) => String(d[headers.state || ""] || "").trim() === selectedState
      );
    }
    if (selectedDistrict && isDistrict) {
      filtered = filtered.filter(
        (d) => String(d[headers.district || ""] || "").trim() === selectedDistrict
      );
    }

    const groupMap: Record<string, { state: string; district: string; samples: any[] }> = {};
    filtered.forEach((row) => {
      const state = String(row[headers.state || ""] || "Unknown").trim();
      const district = String(row[headers.district || ""] || "Unknown").trim();
      const key = isDistrict ? `${state}|${district}` : state;
      if (!groupMap[key]) {
        groupMap[key] = { state, district, samples: [] };
      }
      groupMap[key].samples.push(row);
    });

    const sortedGroupKeys = Object.keys(groupMap).sort((a, b) => {
      const gA = groupMap[a]!;
      const gB = groupMap[b]!;
      if (gA.state === gB.state) return gA.district.localeCompare(gB.district);
      return gA.state.localeCompare(gB.state);
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Master Summary Matrix");
    (ws as any)._customFormatted = true;
    ws.views = [{ showGridLines: true }];

    const totalCols = (isDistrict ? 3 : 2) + activeParams.length * 5;

    // Row 1: Title
    const titleRow = ws.addRow([`Groundwater Quality Master Summary Matrix - ${isDistrict ? "District" : "States and UTs"} Wise`]);
    ws.mergeCells(1, 1, 1, totalCols);
    titleRow.height = 32;
    const titleCell = ws.getCell(1, 1);
    titleCell.font = { name: "Times New Roman", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };

    // Row 2: Blank spacing row
    ws.addRow([]);
    ws.getRow(2).height = 10;

    // Row 3 & 4: Headers
    const h1: any[] = ["S.No.", "State / UT"];
    if (isDistrict) h1.push("District");
    activeParams.forEach((paramName) => {
      h1.push(paramName, "", "", "", "");
    });
    const r3 = ws.addRow(h1);
    r3.height = 24;

    const h2: any[] = ["", ""];
    if (isDistrict) h2.push("");
    activeParams.forEach(() => {
      h2.push(
        "No. of Samples Analyzed",
        "No. of Samples Above Limit",
        "% Above Limit",
        `No. of Partially Affected ${subGroupName}s`,
        `Name(s) of Partially Affected ${subGroupName}s`
      );
    });
    const r4 = ws.addRow(h2);
    r4.height = 28;

    // Merge S.No, State, District across rows 3 and 4
    ws.mergeCells(3, 1, 4, 1);
    ws.mergeCells(3, 2, 4, 2);
    if (isDistrict) {
      ws.mergeCells(3, 3, 4, 3);
    }

    // Merge parameter headers in row 3 across 5 columns
    let paramColStart = isDistrict ? 4 : 3;
    activeParams.forEach(() => {
      ws.mergeCells(3, paramColStart, 3, paramColStart + 4);
      paramColStart += 5;
    });

    // Style Header Rows (Row 3 and 4)
    for (let r = 3; r <= 4; r++) {
      const row = ws.getRow(r);
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const isParamMainHeader = r === 3 && colNumber >= (isDistrict ? 4 : 3);
        const isAboveHeader = r === 4 && ((colNumber - (isDistrict ? 4 : 3)) % 5 === 1 || (colNumber - (isDistrict ? 4 : 3)) % 5 === 2);
        
        cell.font = { name: "Times New Roman", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: isParamMainHeader
              ? "FF1E3A8A" // Dark blue for Parameter name
              : isAboveHeader
              ? "FF991B1B" // Dark red for exceedance subheaders
              : "FF2563EB", // Standard navy blue header
          },
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FF1E40AF" } },
          bottom: { style: "thin", color: { argb: "FF1E40AF" } },
          left: { style: "thin", color: { argb: "FF1E40AF" } },
          right: { style: "thin", color: { argb: "FF1E40AF" } },
        };
      });
    }

    // Data rows
    let slNo = 1;
    const globalStats: Record<string, { analyzed: number; above: number; affectedSubGroupsSum: number }> = {};
    activeParams.forEach((p) => {
      globalStats[p] = { analyzed: 0, above: 0, affectedSubGroupsSum: 0 };
    });

    sortedGroupKeys.forEach((key) => {
      const group = groupMap[key]!;
      const rowVals: any[] = [slNo++, group.state];
      if (isDistrict) rowVals.push(group.district);

      activeParams.forEach((paramName) => {
        const pData = summaryDataMap[paramName];
        if (!pData) {
          rowVals.push(0, 0, 0, 0, "-");
          return;
        }
        const rowItem = pData.rows.find((r) => r.state === group.state && r.district === group.district);
        if (rowItem) {
          rowVals.push(rowItem.analyzed, rowItem.above, rowItem.pct / 100, rowItem.affectedCount, rowItem.affectedNames);
          globalStats[paramName]!.analyzed += rowItem.analyzed;
          globalStats[paramName]!.above += rowItem.above;
          globalStats[paramName]!.affectedSubGroupsSum += rowItem.affectedCount;
        } else {
          rowVals.push(0, 0, 0, 0, "-");
        }
      });

      const addedRow = ws.addRow(rowVals);
      addedRow.height = 20;
      const isEven = slNo % 2 === 0;

      addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const colOffset = colNumber - (isDistrict ? 4 : 3);
        const isParamCol = colOffset >= 0;
        const subColIdx = isParamCol ? colOffset % 5 : -1;

        const isAboveCountCol = subColIdx === 1;
        const isPctCol = subColIdx === 2;
        const isAffectedCountCol = subColIdx === 3;

        let fgColor = isEven ? "FFF8FAFC" : "FFFFFFFF";
        let fontColor = "FF1E293B";
        let isBold = false;

        if (isAboveCountCol || isPctCol) {
          const valNum = typeof cell.value === "number" ? cell.value : parseFloat(String(cell.value || 0));
          if (valNum > 0) {
            fgColor = "FFFEE2E2"; // Soft red
            fontColor = "FFDC2626"; // Dark red
            isBold = true;
          }
        } else if (isAffectedCountCol) {
          const valNum = typeof cell.value === "number" ? cell.value : parseFloat(String(cell.value || 0));
          if (valNum > 0) {
            fgColor = "FFFEF3C7"; // Soft amber
            fontColor = "FFD97706"; // Dark amber
            isBold = true;
          }
        }

        cell.font = {
          name: "Times New Roman",
          size: 11,
          bold: isBold || (colNumber === 2 || colNumber === 3),
          color: { argb: fontColor },
        };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fgColor } };

        if (isPctCol) {
          cell.numFmt = "0.00%";
        } else if (typeof cell.value === "number") {
          cell.numFmt = "0";
        }

        let horizAlign: "center" | "left" = "center";
        if (colNumber === 2 || colNumber === 3 || subColIdx === 4) {
          horizAlign = "left";
        }

        cell.alignment = { vertical: "middle", horizontal: horizAlign, wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    });

    // Grand Total Row
    const grandVals: any[] = ["-", "GRAND TOTAL"];
    if (isDistrict) grandVals.push("");
    activeParams.forEach((paramName) => {
      const stats = globalStats[paramName]!;
      const pct = stats.analyzed > 0 ? stats.above / stats.analyzed : 0;
      grandVals.push(stats.analyzed, stats.above, pct, stats.affectedSubGroupsSum, "-");
    });

    const grandRow = ws.addRow(grandVals);
    grandRow.height = 24;
    const grandRowIndex = grandRow.number;

    if (isDistrict) {
      ws.mergeCells(grandRowIndex, 2, grandRowIndex, 3);
    }

    grandRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colOffset = colNumber - (isDistrict ? 4 : 3);
      const isParamCol = colOffset >= 0;
      const subColIdx = isParamCol ? colOffset % 5 : -1;

      const isAboveCountCol = subColIdx === 1;
      const isPctCol = subColIdx === 2;

      let fontColor = "FFFFFFFF";
      if ((isAboveCountCol || isPctCol) && typeof cell.value === "number" && cell.value > 0) {
        fontColor = "FFFCA5A5"; // Soft red text for exceedance in dark row
      }

      cell.font = { name: "Times New Roman", size: 11, bold: true, color: { argb: fontColor } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };

      if (isPctCol) {
        cell.numFmt = "0.00%";
      } else if (typeof cell.value === "number") {
        cell.numFmt = "0";
      }

      let horizAlign: "center" | "left" = "center";
      if (colNumber === 2 || colNumber === 3) horizAlign = "left";

      cell.alignment = { vertical: "middle", horizontal: horizAlign, wrapText: true };
      cell.border = {
        top: { style: "medium", color: { argb: "FF334155" } },
        bottom: { style: "medium", color: { argb: "FF334155" } },
        left: { style: "thin", color: { argb: "FF334155" } },
        right: { style: "thin", color: { argb: "FF334155" } },
      };
    });

    // Auto-fit Column Widths
    ws.columns.forEach((col, idx) => {
      if (!col) return;
      if (idx === 0) col.width = 8;
      else if (idx === 1 || idx === 2) col.width = 24;
      else {
        const offset = idx - (isDistrict ? 3 : 2);
        const subIdx = offset % 5;
        if (subIdx === 0 || subIdx === 1) col.width = 16;
        else if (subIdx === 2) col.width = 14;
        else if (subIdx === 3) col.width = 18;
        else col.width = 32;
      }
    });

    await downloadExcelJSWorkbook(wb, `WQ_Master_Summary_Matrix_${isDistrict ? "District" : "States_and_UTs"}_${Date.now()}.xlsx`);
  };

  // Handler to export Exceedance Tables to Excel with exact GUI formatting
  const handleExportExceedanceExcel = async (paramKey: string) => {
    const targetParams = paramKey === "ALL_ACTIVE" ? activeParams : [paramKey];
    if (targetParams.length === 0) return;

    const isDistrict = masterGeoLevel === "District";
    const wb = new ExcelJS.Workbook();

    targetParams.forEach((pName) => {
      const pData = summaryDataMap[pName];
      if (!pData) return;

      const ws = wb.addWorksheet(pName.substring(0, 31));
      (ws as any)._customFormatted = true;
      ws.views = [{ showGridLines: true }];

      // Title Banner
      ws.addRow([`${pData.paramFullName} (${pData.paramName}) Exceedance Assessment Table`]);
      ws.mergeCells(1, 1, 1, 5);
      const r1Cell = ws.getCell(1, 1);
      r1Cell.font = { name: "Times New Roman", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
      r1Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      r1Cell.alignment = { vertical: "middle", horizontal: "center" };
      ws.getRow(1).height = 28;

      // Subtitle Banner
      ws.addRow([`Permissible Limit: ${pData.limitHeaderStr} | Assessment Level: ${isDistrict ? "District Wise" : "State / UT Wise"}`]);
      ws.mergeCells(2, 1, 2, 5);
      const r2Cell = ws.getCell(2, 1);
      r2Cell.font = { name: "Times New Roman", size: 10, bold: true, color: { argb: "FF334155" } };
      r2Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      r2Cell.alignment = { vertical: "middle", horizontal: "center" };
      ws.getRow(2).height = 20;

      ws.addRow([]); // Blank line

      // Table Header Row
      const hRow = ws.addRow([
        "Sl. No.",
        isDistrict ? "State / UT - District" : "State / UT",
        "No. of Samples Analysed",
        `No. of Samples above Permissible limit (${pData.limitHeaderStr})`,
        "% of samples above permissible limit",
      ]);
      hRow.height = 26;

      hRow.eachCell((cell, colNum) => {
        const isExceedHeader = colNum === 4 || colNum === 5;
        cell.font = { name: "Times New Roman", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isExceedHeader ? "FF991B1B" : "FF2563EB" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FF1E40AF" } },
          bottom: { style: "thin", color: { argb: "FF1E40AF" } },
          left: { style: "thin", color: { argb: "FF1E40AF" } },
          right: { style: "thin", color: { argb: "FF1E40AF" } },
        };
      });

      // Filter rows if searchQuery is active
      const filteredRows = searchQuery.trim()
        ? pData.rows.filter(
            (r) =>
              r.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
              r.district.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : pData.rows;

      filteredRows.forEach((r, idx) => {
        const dataRow = ws.addRow([
          r.slNo,
          isDistrict ? `${r.state} - ${r.district}` : r.state,
          r.analyzed,
          r.above,
          r.pct / 100,
        ]);
        dataRow.height = 20;

        const isEven = idx % 2 === 0;
        dataRow.eachCell((cell, colNum) => {
          let fgColor = isEven ? "FFF8FAFC" : "FFFFFFFF";
          let fontColor = "FF1E293B";
          let isBold = colNum === 2;

          if ((colNum === 4 || colNum === 5) && r.above > 0) {
            fgColor = "FFFEE2E2";
            fontColor = "FFDC2626";
            isBold = true;
          }

          cell.font = { name: "Times New Roman", size: 11, bold: isBold, color: { argb: fontColor } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fgColor } };

          if (colNum === 5) {
            cell.numFmt = "0.00%";
          } else if (typeof cell.value === "number") {
            cell.numFmt = "0";
          }

          cell.alignment = {
            vertical: "middle",
            horizontal: colNum === 2 ? "left" : "center",
            wrapText: true,
          };
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } },
          };
        });
      });

      // Grand Total Row
      const grandRow = ws.addRow([
        "-",
        "GRAND TOTAL",
        pData.totalAnalyzed,
        pData.totalAbove,
        pData.totalPct / 100,
      ]);
      grandRow.height = 24;

      grandRow.eachCell((cell, colNum) => {
        let fontColor = "FFFFFFFF";
        if ((colNum === 4 || colNum === 5) && pData.totalAbove > 0) {
          fontColor = "FFFCA5A5";
        }

        cell.font = { name: "Times New Roman", size: 11, bold: true, color: { argb: fontColor } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };

        if (colNum === 5) {
          cell.numFmt = "0.00%";
        } else if (typeof cell.value === "number") {
          cell.numFmt = "0";
        }

        cell.alignment = {
          vertical: "middle",
          horizontal: colNum === 2 ? "left" : "center",
          wrapText: true,
        };
        cell.border = {
          top: { style: "medium", color: { argb: "FF334155" } },
          bottom: { style: "medium", color: { argb: "FF334155" } },
          left: { style: "thin", color: { argb: "FF334155" } },
          right: { style: "thin", color: { argb: "FF334155" } },
        };
      });

      // Column widths
      ws.getColumn(1).width = 10;
      ws.getColumn(2).width = 30;
      ws.getColumn(3).width = 24;
      ws.getColumn(4).width = 38;
      ws.getColumn(5).width = 28;
    });

    const fileName = paramKey === "ALL_ACTIVE"
      ? `WQ_Exceedance_Tables_All_Parameters_${Date.now()}.xlsx`
      : `WQ_Exceedance_Table_${paramKey}_${Date.now()}.xlsx`;

    await downloadExcelJSWorkbook(wb, fileName);
  };

  // Handler to export Partially Affected Sub-Units to Excel with exact GUI formatting
  const handleExportAffectedExcel = async (paramKey: string) => {
    const targetParams = paramKey === "ALL_ACTIVE" ? activeParams : [paramKey];
    if (targetParams.length === 0) return;

    const isDistrict = masterGeoLevel === "District";
    const subGroupName = isDistrict ? "Block" : "District";
    const wb = new ExcelJS.Workbook();

    targetParams.forEach((pName) => {
      const pData = summaryDataMap[pName];
      if (!pData) return;

      const ws = wb.addWorksheet(pName.substring(0, 31));
      (ws as any)._customFormatted = true;
      ws.views = [{ showGridLines: true }];

      // Title Banner
      ws.addRow([`${pData.paramFullName} (${pData.paramName}) - Partially Affected ${subGroupName}s`]);
      ws.mergeCells(1, 1, 1, 4);
      const r1Cell = ws.getCell(1, 1);
      r1Cell.font = { name: "Times New Roman", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
      r1Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } }; // Dark Teal
      r1Cell.alignment = { vertical: "middle", horizontal: "center" };
      ws.getRow(1).height = 28;

      // Subtitle Banner
      ws.addRow([`Permissible Limit: ${pData.limitHeaderStr} | Sub-Unit Level: ${subGroupName}s`]);
      ws.mergeCells(2, 1, 2, 4);
      const r2Cell = ws.getCell(2, 1);
      r2Cell.font = { name: "Times New Roman", size: 10, bold: true, color: { argb: "FF334155" } };
      r2Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      r2Cell.alignment = { vertical: "middle", horizontal: "center" };
      ws.getRow(2).height = 20;

      ws.addRow([]); // Blank line

      // Table Header Row
      const hRow = ws.addRow([
        "Sl. No.",
        isDistrict ? "State / UT - District" : "State / UT",
        `No. of Partially affected ${subGroupName}s`,
        `Name(s) of Partially affected ${subGroupName}s`,
      ]);
      hRow.height = 26;

      hRow.eachCell((cell) => {
        cell.font = { name: "Times New Roman", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FF115E59" } },
          bottom: { style: "thin", color: { argb: "FF115E59" } },
          left: { style: "thin", color: { argb: "FF115E59" } },
          right: { style: "thin", color: { argb: "FF115E59" } },
        };
      });

      // Filter rows where affectedCount > 0
      let filteredRows = pData.rows.filter((r) => r.affectedCount > 0);
      if (searchQuery.trim()) {
        filteredRows = filteredRows.filter(
          (r) =>
            r.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.district.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      if (filteredRows.length === 0) {
        const emptyRow = ws.addRow(["-", "No partially affected units recorded", 0, "-"]);
        emptyRow.height = 20;
        emptyRow.eachCell((cell) => {
          cell.font = { name: "Times New Roman", size: 11, italic: true, color: { argb: "FF64748B" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });
      } else {
        filteredRows.forEach((r, idx) => {
          const dataRow = ws.addRow([
            idx + 1,
            isDistrict ? `${r.state} - ${r.district}` : r.state,
            r.affectedCount,
            r.affectedNames,
          ]);
          dataRow.height = 20;

          const isEven = idx % 2 === 0;
          dataRow.eachCell((cell, colNum) => {
            let fgColor = isEven ? "FFF8FAFC" : "FFFFFFFF";
            let fontColor = "FF1E293B";
            let isBold = colNum === 2;

            if (colNum === 3) {
              fgColor = "FFFEF3C7"; // Light amber fill
              fontColor = "FFD97706"; // Amber text
              isBold = true;
            }

            cell.font = { name: "Times New Roman", size: 11, bold: isBold, color: { argb: fontColor } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fgColor } };

            cell.alignment = {
              vertical: "middle",
              horizontal: colNum === 1 || colNum === 3 ? "center" : "left",
              wrapText: true,
            };
            cell.border = {
              top: { style: "thin", color: { argb: "FFE2E8F0" } },
              bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
              left: { style: "thin", color: { argb: "FFE2E8F0" } },
              right: { style: "thin", color: { argb: "FFE2E8F0" } },
            };
          });
        });
      }

      // Grand Total Row
      const grandRow = ws.addRow(["-", "GRAND TOTAL", pData.totalAffectedCount, "-"]);
      grandRow.height = 24;

      grandRow.eachCell((cell, colNum) => {
        let fontColor = "FFFFFFFF";
        if (colNum === 3) fontColor = "FFFCD34D"; // Yellow text for affected count in dark row

        cell.font = { name: "Times New Roman", size: 11, bold: true, color: { argb: fontColor } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };

        cell.alignment = {
          vertical: "middle",
          horizontal: colNum === 2 ? "left" : "center",
          wrapText: true,
        };
        cell.border = {
          top: { style: "medium", color: { argb: "FF334155" } },
          bottom: { style: "medium", color: { argb: "FF334155" } },
          left: { style: "thin", color: { argb: "FF334155" } },
          right: { style: "thin", color: { argb: "FF334155" } },
        };
      });

      // Column widths
      ws.getColumn(1).width = 10;
      ws.getColumn(2).width = 30;
      ws.getColumn(3).width = 32;
      ws.getColumn(4).width = 50;
    });

    const fileName = paramKey === "ALL_ACTIVE"
      ? `WQ_Partially_Affected_${subGroupName}s_All_Parameters_${Date.now()}.xlsx`
      : `WQ_Partially_Affected_${subGroupName}s_${paramKey}_${Date.now()}.xlsx`;

    await downloadExcelJSWorkbook(wb, fileName);
  };

  // Handler to export Pristine Summary to Excel with exact GUI formatting
  const handleExportPristineExcel = async () => {
    if (!activeParams || activeParams.length === 0) return;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Pristine Summary");
    (ws as any)._customFormatted = true;
    ws.views = [{ showGridLines: true }];

    // Title
    ws.addRow(["Parameter-Wise Pristine States / UTs Summary (No Exceedance)"]);
    ws.mergeCells(1, 1, 1, 4);
    const r1Cell = ws.getCell(1, 1);
    r1Cell.font = { name: "Times New Roman", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    r1Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } }; // Emerald
    r1Cell.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(1).height = 28;

    // Subtitle
    ws.addRow(["List of States and Union Territories where 100% of tested samples complied with BIS IS 10500 permissible limits."]);
    ws.mergeCells(2, 1, 2, 4);
    const r2Cell = ws.getCell(2, 1);
    r2Cell.font = { name: "Times New Roman", size: 10, bold: true, color: { argb: "FF334155" } };
    r2Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
    r2Cell.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(2).height = 20;

    ws.addRow([]); // Blank line

    // Header Row
    const hRow = ws.addRow([
      "Sl. No.",
      "Parameter",
      "No. of Pristine States/UTs",
      "Name(s) of Pristine States / UTs (No exceedance)",
    ]);
    hRow.height = 26;

    hRow.eachCell((cell) => {
      cell.font = { name: "Times New Roman", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF047857" } },
        bottom: { style: "thin", color: { argb: "FF047857" } },
        left: { style: "thin", color: { argb: "FF047857" } },
        right: { style: "thin", color: { argb: "FF047857" } },
      };
    });

    const targetParams = selectedParamForAffected === "ALL_ACTIVE" ? activeParams : [selectedParamForAffected];

    targetParams.forEach((pName, pIdx) => {
      const pData = summaryDataMap[pName];
      if (!pData) return;

      const pristineStates = getPristineStatesForParam(pName);
      const pristineStr = pristineStates.length > 0 ? pristineStates.join(", ") : "Nil";

      const dataRow = ws.addRow([
        pIdx + 1,
        `${pData.paramFullName} (${pData.paramName})`,
        pristineStates.length,
        pristineStr,
      ]);
      dataRow.height = 20;

      const isEven = pIdx % 2 === 0;
      dataRow.eachCell((cell, colNum) => {
        let fgColor = isEven ? "FFF8FAFC" : "FFFFFFFF";
        let fontColor = "FF1E293B";
        let isBold = colNum === 2;

        if (colNum === 3 && pristineStates.length > 0) {
          fgColor = "FFDCFCE7"; // Light green fill
          fontColor = "FF15803D"; // Dark green text
          isBold = true;
        }

        cell.font = { name: "Times New Roman", size: 11, bold: isBold, color: { argb: fontColor } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fgColor } };

        cell.alignment = {
          vertical: "middle",
          horizontal: colNum === 1 || colNum === 3 ? "center" : "left",
          wrapText: true,
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    });

    // Column widths
    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 30;
    ws.getColumn(3).width = 24;
    ws.getColumn(4).width = 50;

    await downloadExcelJSWorkbook(wb, `WQ_Pristine_States_Summary_${Date.now()}.xlsx`);
  };

  // --- DOCX GENERATORS ---

  // Generate Exceedance Table DOCX HTML
  const generateExceedanceDocxHtml = (targetParams: string[]) => {
    const isDistrict = masterGeoLevel === "District";
    const dateStr = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });

    const geoScope = selectedDistrict
      ? `District: ${selectedDistrict}, State: ${selectedState}`
      : selectedState
      ? `State / UT: ${selectedState}`
      : "Pan-India Assessment";

    let tablesContent = "";

    targetParams.forEach((pName, pIdx) => {
      const pData = summaryDataMap[pName];
      if (!pData) return;

      const filteredRows = searchQuery.trim()
        ? pData.rows.filter((r) =>
            r.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.district.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : pData.rows;

      tablesContent += `
        <div style="margin-top: ${pIdx > 0 ? "24pt" : "12pt"}; page-break-inside: avoid;">
          <h3 style="color: #1e3a8a; font-size: 13pt; margin-bottom: 6pt; font-weight: bold; font-family: 'Times New Roman', Times, serif;">
            ${pIdx + 1}. ${pData.paramFullName} (${pData.paramName}) Exceedance Table
          </h3>
          <p style="font-size: 10pt; color: #334155; margin-bottom: 8pt; font-family: 'Times New Roman', Times, serif;">
            Permissible Limit: <strong>${pData.limitHeaderStr}</strong> | Assessment Level: <strong>${isDistrict ? "District" : "State / UT"}</strong>
          </p>

          <table border="1" cellpadding="5" cellspacing="0" style="width: 100%; border-collapse: collapse; font-family: 'Times New Roman', Times, serif; font-size: 9.5pt;">
            <thead>
              <tr style="background-color: #1e3a8a; color: #ffffff; text-align: center; font-weight: bold;">
                <th style="padding: 6pt 4pt; width: 8%; background-color: #1e3a8a; color: #ffffff;">Sl. No.</th>
                <th style="padding: 6pt 4pt; width: 28%; background-color: #1e3a8a; color: #ffffff; text-align: left;">${isDistrict ? "State / UT - District" : "State / UT"}</th>
                <th style="padding: 6pt 4pt; width: 20%; background-color: #1e3a8a; color: #ffffff;">No. of Samples Analysed</th>
                <th style="padding: 6pt 4pt; width: 24%; background-color: #1e3a8a; color: #ffffff;">No. of Samples above Permissible limit (${pData.limitHeaderStr})</th>
                <th style="padding: 6pt 4pt; width: 20%; background-color: #1e3a8a; color: #ffffff;">% of samples above permissible limit</th>
              </tr>
            </thead>
            <tbody>
              ${filteredRows.map((r, rIdx) => `
                <tr style="background-color: ${rIdx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
                  <td style="padding: 4pt; text-align: center; color: #64748b;">${r.slNo}</td>
                  <td style="padding: 4pt; text-align: left; font-weight: bold; color: #0f172a;">${isDistrict ? `${r.state} - ${r.district}` : r.state}</td>
                  <td style="padding: 4pt; text-align: center;">${r.analyzed}</td>
                  <td style="padding: 4pt; text-align: center; font-weight: ${r.above > 0 ? "bold" : "normal"}; color: ${r.above > 0 ? "#dc2626" : "#475569"};">
                    ${r.above}
                  </td>
                  <td style="padding: 4pt; text-align: center; font-weight: bold; color: ${r.above > 0 ? "#dc2626" : "#059669"};">
                    ${r.pct.toFixed(2)}%
                  </td>
                </tr>
              `).join("")}
              <tr style="background-color: #0f172a; color: #ffffff; font-weight: bold;">
                <td style="padding: 6pt; text-align: center; color: #94a3b8;">-</td>
                <td style="padding: 6pt; text-align: left; color: #ffffff;">GRAND TOTAL</td>
                <td style="padding: 6pt; text-align: center; color: #ffffff;">${pData.totalAnalyzed}</td>
                <td style="padding: 6pt; text-align: center; color: ${pData.totalAbove > 0 ? "#fca5a5" : "#ffffff"};">${pData.totalAbove}</td>
                <td style="padding: 6pt; text-align: center; color: ${pData.totalAbove > 0 ? "#fca5a5" : "#34d399"};">${pData.totalPct.toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    });

    return `
      <div style="font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #0f172a;">
        <div style="text-align: center; margin-bottom: 18pt; border-bottom: 2pt solid #1e3a8a; padding-bottom: 10pt;">
          <h1 style="color: #1e3a8a; font-size: 16pt; margin: 0; text-transform: uppercase; font-weight: bold;">Groundwater Compliance Reporting Engine</h1>
          <h2 style="color: #334155; font-size: 13pt; margin-top: 4pt; font-weight: bold;">Groundwater Quality Exceedance Assessment Report</h2>
          <p style="font-size: 9.5pt; color: #64748b; margin-top: 4pt;">
            <strong>Scope:</strong> ${geoScope} | <strong>Standard:</strong> BIS IS 10500 | <strong>Date:</strong> ${dateStr}
          </p>
        </div>

        ${tablesContent}
      </div>
    `;
  };

  // Helper to compute pristine states for a parameter (0 exceedances / 0 affected districts)
  const getPristineStatesForParam = (pName: string): string[] => {
    const pData = summaryDataMap[pName];
    if (!pData) return [];

    const stateMap: Record<string, { analyzed: number; above: number; affectedCount: number }> = {};
    pData.rows.forEach((r) => {
      if (!stateMap[r.state]) {
        stateMap[r.state] = { analyzed: 0, above: 0, affectedCount: 0 };
      }
      stateMap[r.state].analyzed += r.analyzed;
      stateMap[r.state].above += r.above;
      stateMap[r.state].affectedCount += r.affectedCount;
    });

    return Object.keys(stateMap)
      .filter((st) => stateMap[st].analyzed > 0 && stateMap[st].above === 0 && stateMap[st].affectedCount === 0)
      .sort((a, b) => a.localeCompare(b));
  };

  // Generate Parameter-Wise Pristine States DOCX HTML
  const generatePristineDocxHtml = (targetParams: string[]) => {
    const rowsHtml = targetParams.map((pName, pIdx) => {
      const pData = summaryDataMap[pName];
      if (!pData) return "";

      const pristineStates = getPristineStatesForParam(pName);
      const pristineStr = pristineStates.length > 0 ? pristineStates.join(", ") : "Nil";

      return `
        <tr style="background-color: ${pIdx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
          <td style="padding: 5pt 4pt; text-align: center; color: #64748b; font-weight: bold;">${pIdx + 1}</td>
          <td style="padding: 5pt 4pt; text-align: left; font-weight: bold; color: #0f172a;">
            ${pData.paramFullName} (${pData.paramName})
          </td>
          <td style="padding: 5pt 4pt; text-align: center; font-weight: bold; color: ${pristineStates.length > 0 ? "#15803d" : "#64748b"}; font-size: 9.5pt;">
            ${pristineStates.length}
          </td>
          <td style="padding: 5pt 4pt; text-align: left; color: ${pristineStates.length > 0 ? "#15803d" : "#64748b"}; font-weight: ${pristineStates.length > 0 ? "bold" : "normal"}; font-size: 9pt;">
            ${pristineStr}
          </td>
        </tr>
      `;
    }).join("");

    return `
      <div style="margin-top: 24pt; page-break-inside: avoid;">
        <h3 style="color: #1e3a8a; font-size: 13pt; margin-bottom: 6pt; font-weight: bold; font-family: 'Times New Roman', Times, serif;">
          Parameter-Wise Pristine States / UTs Summary (No Exceedance)
        </h3>
        <p style="font-size: 9.5pt; color: #334155; margin-bottom: 8pt; font-family: 'Times New Roman', Times, serif;">
          List of States and Union Territories where 100% of analyzed groundwater samples complied with BIS IS 10500 permissible limits (0 partially affected districts logged).
        </p>

        <table border="1" cellpadding="5" cellspacing="0" style="width: 100%; border-collapse: collapse; font-family: 'Times New Roman', Times, serif; font-size: 9.5pt;">
          <thead>
            <tr style="background-color: #1e3a8a; color: #ffffff; text-align: center; font-weight: bold;">
              <th style="padding: 6pt 4pt; width: 8%; background-color: #1e3a8a; color: #ffffff;">Sl. No.</th>
              <th style="padding: 6pt 4pt; width: 28%; background-color: #1e3a8a; color: #ffffff; text-align: left;">Parameter</th>
              <th style="padding: 6pt 4pt; width: 16%; background-color: #1e3a8a; color: #ffffff; text-align: center;">No. of Pristine States/UTs</th>
              <th style="padding: 6pt 4pt; width: 48%; background-color: #1e3a8a; color: #ffffff; text-align: left;">Name(s) of Pristine States / UTs (No exceedance)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  };

  // Generate Partially Affected Districts DOCX HTML
  const generatePartiallyAffectedDocxHtml = (targetParams: string[]) => {
    const isDistrict = masterGeoLevel === "District";
    const subGroupName = isDistrict ? "Block" : "District";
    const dateStr = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });

    const geoScope = selectedDistrict
      ? `District: ${selectedDistrict}, State: ${selectedState}`
      : selectedState
      ? `State / UT: ${selectedState}`
      : "Pan-India Assessment";

    let tablesContent = "";

    targetParams.forEach((pName, pIdx) => {
      const pData = summaryDataMap[pName];
      if (!pData) return;

      // Filter out rows where affectedCount is 0 as requested by the user
      let filteredRows = pData.rows.filter((r) => r.affectedCount > 0);
      if (searchQuery.trim()) {
        filteredRows = filteredRows.filter((r) =>
          r.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.district.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      tablesContent += `
        <div style="margin-top: ${pIdx > 0 ? "24pt" : "12pt"}; page-break-inside: avoid;">
          <h3 style="color: #1e3a8a; font-size: 13pt; margin-bottom: 6pt; font-weight: bold; font-family: 'Times New Roman', Times, serif;">
            ${pIdx + 1}. ${pData.paramFullName} (${pData.paramName}) - Partially Affected ${subGroupName}s
          </h3>
          <p style="font-size: 10pt; color: #334155; margin-bottom: 8pt; font-family: 'Times New Roman', Times, serif;">
            Permissible Limit: <strong>${pData.limitHeaderStr}</strong> | Sub-Unit Level: <strong>${subGroupName}s</strong>
          </p>

          <table border="1" cellpadding="5" cellspacing="0" style="width: 100%; border-collapse: collapse; font-family: 'Times New Roman', Times, serif; font-size: 9.5pt;">
            <thead>
              <tr style="background-color: #1e3a8a; color: #ffffff; text-align: center; font-weight: bold;">
                <th style="padding: 6pt 4pt; width: 8%; background-color: #1e3a8a; color: #ffffff;">Sl. No.</th>
                <th style="padding: 6pt 4pt; width: 27%; background-color: #1e3a8a; color: #ffffff; text-align: left;">${isDistrict ? "State / UT - District" : "State / UT"}</th>
                <th style="padding: 6pt 4pt; width: 20%; background-color: #1e3a8a; color: #ffffff;">No. of Partially affected ${subGroupName}s</th>
                <th style="padding: 6pt 4pt; width: 45%; background-color: #1e3a8a; color: #ffffff; text-align: left;">Name(s) of Partially affected ${subGroupName}s</th>
              </tr>
            </thead>
            <tbody>
              ${filteredRows.length === 0 ? `
                <tr>
                  <td colSpan="4" style="padding: 8pt; text-align: center; color: #64748b; font-style: italic;">
                    No partially affected ${subGroupName}s recorded.
                  </td>
                </tr>
              ` : filteredRows.map((r, rIdx) => `
                <tr style="background-color: ${rIdx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
                  <td style="padding: 4pt; text-align: center; color: #64748b;">${rIdx + 1}</td>
                  <td style="padding: 4pt; text-align: left; font-weight: bold; color: #0f172a;">${isDistrict ? `${r.state} - ${r.district}` : r.state}</td>
                  <td style="padding: 4pt; text-align: center; font-weight: bold; color: #b45309;">
                    ${r.affectedCount}
                  </td>
                  <td style="padding: 4pt; text-align: left; font-size: 9pt; color: #334155;">
                    ${r.affectedNames}
                  </td>
                </tr>
              `).join("")}
              <tr style="background-color: #0f172a; color: #ffffff; font-weight: bold;">
                <td style="padding: 6pt; text-align: center; color: #94a3b8;">-</td>
                <td style="padding: 6pt; text-align: left; color: #ffffff;">GRAND TOTAL</td>
                <td style="padding: 6pt; text-align: center; color: #fcd34d;">${pData.totalAffectedCount}</td>
                <td style="padding: 6pt; text-align: center; color: #94a3b8;">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    });

    const pristineSectionHtml = generatePristineDocxHtml(targetParams);

    return `
      <div style="font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #0f172a;">
        <div style="text-align: center; margin-bottom: 18pt; border-bottom: 2pt solid #1e3a8a; padding-bottom: 10pt;">
          <h1 style="color: #1e3a8a; font-size: 16pt; margin: 0; text-transform: uppercase; font-weight: bold;">Groundwater Compliance Reporting Engine</h1>
          <h2 style="color: #334155; font-size: 13pt; margin-top: 4pt; font-weight: bold;">Partially Affected Districts & Sub-Groups Log</h2>
          <p style="font-size: 9.5pt; color: #64748b; margin-top: 4pt;">
            <strong>Scope:</strong> ${geoScope} | <strong>Standard:</strong> BIS IS 10500 | <strong>Date:</strong> ${dateStr}
          </p>
        </div>

        ${tablesContent}

        ${pristineSectionHtml}
      </div>
    `;
  };

  // Download Exceedance DOCX trigger
  const handleDownloadExceedanceDocx = async (paramKey: string) => {
    const targetParams = paramKey === "ALL_ACTIVE" ? activeParams : [paramKey];
    if (targetParams.length === 0) return;

    const htmlContent = generateExceedanceDocxHtml(targetParams);
    const fileName = paramKey === "ALL_ACTIVE"
      ? `WQ_Exceedance_Table_All_Parameters_${Date.now()}`
      : `WQ_Exceedance_Table_${paramKey}_${Date.now()}`;

    await downloadMhtmlWordDoc(htmlContent, fileName, "docx");
  };

  // Download Partially Affected DOCX trigger
  const handleDownloadAffectedDocx = async (paramKey: string) => {
    const targetParams = paramKey === "ALL_ACTIVE" ? activeParams : [paramKey];
    if (targetParams.length === 0) return;

    const htmlContent = generatePartiallyAffectedDocxHtml(targetParams);
    const fileName = paramKey === "ALL_ACTIVE"
      ? `WQ_Partially_Affected_Districts_All_Parameters_${Date.now()}`
      : `WQ_Partially_Affected_Districts_${paramKey}_${Date.now()}`;

    await downloadMhtmlWordDoc(htmlContent, fileName, "docx");
  };

  // Download Custom Combined DOCX report from Hub
  const handleDownloadHubCustomDocx = async () => {
    const selectedList = activeParams.filter((p) => selectedDocxParams[p]);
    if (selectedList.length === 0) {
      alert("Please select at least one parameter to generate the DOCX document.");
      return;
    }

    const isDistrict = masterGeoLevel === "District";
    const dateStr = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });

    let docHtml = `
      <div style="font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #0f172a;">
        <div style="text-align: center; margin-bottom: 20pt; border-bottom: 2pt solid #1e3a8a; padding-bottom: 12pt;">
          <h1 style="color: #1e3a8a; font-size: 18pt; margin: 0; text-transform: uppercase; font-weight: bold;">Central Ground Water Quality Assessment</h1>
          <h2 style="color: #334155; font-size: 14pt; margin-top: 4pt; font-weight: bold;">Comprehensive Compliance & Hotspot Summary Document</h2>
          <p style="font-size: 9.5pt; color: #64748b; margin-top: 4pt;">
            <strong>Selected Parameters:</strong> ${selectedList.join(", ")} | <strong>Standard:</strong> BIS IS 10500 | <strong>Date:</strong> ${dateStr}
          </p>
        </div>
    `;

    if (includeExceedanceInDocx) {
      docHtml += `
        <h2 style="color: #1e3a8a; font-size: 15pt; border-bottom: 1.5pt solid #1e3a8a; padding-bottom: 4pt; margin-top: 18pt;">
          Section 1: Parameter Exceedance Assessment Tables
        </h2>
      `;
      docHtml += generateExceedanceDocxHtml(selectedList);
    }

    if (includeAffectedInDocx) {
      docHtml += `
        <h2 style="color: #1e3a8a; font-size: 15pt; border-bottom: 1.5pt solid #1e3a8a; padding-bottom: 4pt; margin-top: 24pt; page-break-before: always;">
          Section 2: Partially Affected Districts & Sub-Groups
        </h2>
      `;
      docHtml += generatePartiallyAffectedDocxHtml(selectedList);
    }

    if (includePristineInDocx && !includeAffectedInDocx) {
      docHtml += `
        <h2 style="color: #1e3a8a; font-size: 15pt; border-bottom: 1.5pt solid #1e3a8a; padding-bottom: 4pt; margin-top: 24pt; page-break-before: always;">
          Section 3: Pristine States & UTs (No Exceedance)
        </h2>
      `;
      docHtml += generatePristineDocxHtml(selectedList);
    }

    docHtml += `</div>`;

    const fileName = `Groundwater_Compliance_Report_${selectedList.length}_Params_${Date.now()}`;
    await downloadMhtmlWordDoc(docHtml, fileName, "docx");
  };

  // Render individual exceedance table for GUI view
  const renderExceedanceGuiTable = (pName: string) => {
    const pData = summaryDataMap[pName];
    if (!pData) return null;

    const isDistrict = masterGeoLevel === "District";

    const filteredRows = searchQuery.trim()
      ? pData.rows.filter(
          (r) =>
            r.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.district.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : pData.rows;

    return (
      <div key={pName} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="bg-slate-900 text-white p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-amber-500 text-slate-950 text-xs font-black px-2.5 py-0.5 rounded-full uppercase">
                {pData.paramName}
              </span>
              <h4 className="text-base font-extrabold text-white">{pData.paramFullName}</h4>
            </div>
            <p className="text-xs text-slate-300 font-semibold mt-1">
              Permissible Limit: <span className="text-amber-300 font-bold">{pData.limitHeaderStr}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportExceedanceExcel(pName)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Download Excel
            </button>
            <button
              onClick={() => handleDownloadExceedanceDocx(pName)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Download DOCX
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
            <thead className="bg-blue-600 text-white font-bold">
              <tr>
                <th className="p-3 border border-blue-700 text-center w-12">Sl. No.</th>
                <th className="p-3 border border-blue-700 text-left">
                  {isDistrict ? "State / UT - District" : "State / UT"}
                </th>
                <th className="p-3 border border-blue-700 text-center">No. of Samples Analysed</th>
                <th className="p-3 border border-blue-700 text-center bg-rose-700 text-white font-extrabold">
                  No. of Samples above Permissible limit ({pData.limitHeaderStr})
                </th>
                <th className="p-3 border border-blue-700 text-center bg-rose-800 text-white font-extrabold">
                  % of samples above permissible limit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700 font-medium">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400 font-bold">
                    No matching records found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, rIdx) => (
                  <tr key={rIdx} className="hover:bg-blue-50/50 transition-colors">
                    <td className="p-3 border border-slate-100 text-center text-slate-400 font-bold">{r.slNo}</td>
                    <td className="p-3 border border-slate-100 font-bold text-slate-900">
                      {isDistrict ? `${r.state} - ${r.district}` : r.state}
                    </td>
                    <td className="p-3 border border-slate-100 text-center font-mono font-bold">{r.analyzed}</td>
                    <td className={`p-3 border border-slate-100 text-center font-mono font-bold ${r.above > 0 ? "text-rose-600 bg-rose-50/20" : "text-slate-400"}`}>
                      {r.above}
                    </td>
                    <td className={`p-3 border border-slate-100 text-center font-mono font-black ${r.above > 0 ? "text-rose-600 bg-rose-50/30" : "text-emerald-600"}`}>
                      {r.pct.toFixed(2)}%
                    </td>
                  </tr>
                ))
              )}
              <tr className="bg-slate-900 text-white font-extrabold text-xs">
                <td className="p-3 border border-slate-700 text-center text-slate-400">-</td>
                <td className="p-3 border border-slate-700">GRAND TOTAL</td>
                <td className="p-3 border border-slate-700 text-center font-mono">{pData.totalAnalyzed}</td>
                <td className={`p-3 border border-slate-700 text-center font-mono ${pData.totalAbove > 0 ? "text-rose-300 bg-rose-950/60" : "text-slate-400"}`}>
                  {pData.totalAbove}
                </td>
                <td className={`p-3 border border-slate-700 text-center font-mono ${pData.totalAbove > 0 ? "text-rose-300" : "text-emerald-400"}`}>
                  {pData.totalPct.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render individual partially affected table for GUI view
  const renderAffectedGuiTable = (pName: string) => {
    const pData = summaryDataMap[pName];
    if (!pData) return null;

    const isDistrict = masterGeoLevel === "District";
    const subGroupName = isDistrict ? "Block" : "District";

    // Filter out rows where affectedCount is 0
    let filteredRows = pData.rows.filter((r) => r.affectedCount > 0);
    if (searchQuery.trim()) {
      filteredRows = filteredRows.filter(
        (r) =>
          r.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.district.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return (
      <div key={pName} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="bg-slate-900 text-white p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-teal-500 text-slate-950 text-xs font-black px-2.5 py-0.5 rounded-full uppercase">
                {pData.paramName}
              </span>
              <h4 className="text-base font-extrabold text-white">{pData.paramFullName}</h4>
            </div>
            <p className="text-xs text-slate-300 font-semibold mt-1">
              Partially Affected Sub-Units: <span className="text-teal-300 font-bold">{subGroupName}s</span> | Limit: <span className="text-amber-300 font-bold">{pData.limitHeaderStr}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportAffectedExcel(pName)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Download Excel
            </button>
            <button
              onClick={() => handleDownloadAffectedDocx(pName)}
              className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Download DOCX
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
            <thead className="bg-teal-700 text-white font-bold">
              <tr>
                <th className="p-3 border border-teal-800 text-center w-12">Sl. No.</th>
                <th className="p-3 border border-teal-800 text-left">
                  {isDistrict ? "State / UT - District" : "State / UT"}
                </th>
                <th className="p-3 border border-teal-800 text-center">
                  No. of Partially affected {subGroupName}s
                </th>
                <th className="p-3 border border-teal-800 text-left">
                  Name(s) of Partially affected {subGroupName}s
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700 font-medium">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400 font-bold">
                    No partially affected {subGroupName}s found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, rIdx) => (
                  <tr key={rIdx} className="hover:bg-teal-50/50 transition-colors">
                    <td className="p-3 border border-slate-100 text-center text-slate-400 font-bold">{rIdx + 1}</td>
                    <td className="p-3 border border-slate-100 font-bold text-slate-900">
                      {isDistrict ? `${r.state} - ${r.district}` : r.state}
                    </td>
                    <td className="p-3 border border-slate-100 text-center font-mono font-bold text-amber-600 bg-amber-50/30">
                      {r.affectedCount}
                    </td>
                    <td className="p-3 border border-slate-100 text-left text-slate-600 font-medium whitespace-normal max-w-lg">
                      {r.affectedNames}
                    </td>
                  </tr>
                ))
              )}
              <tr className="bg-slate-900 text-white font-extrabold text-xs">
                <td className="p-3 border border-slate-700 text-center text-slate-400">-</td>
                <td className="p-3 border border-slate-700">GRAND TOTAL</td>
                <td className="p-3 border border-slate-700 text-center font-mono text-amber-300 font-black">
                  {pData.totalAffectedCount}
                </td>
                <td className="p-3 border border-slate-700 text-slate-400 text-center">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render Parameter-Wise Pristine States GUI Table for Web View
  const renderPristineGuiTable = (targetParams: string[]) => {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="bg-slate-900 text-white p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500 text-slate-950 text-xs font-black px-2.5 py-0.5 rounded-full uppercase">
                Compliance Summary
              </span>
              <h4 className="text-base font-extrabold text-white">Parameter-Wise Pristine States / UTs Log (No Exceedance)</h4>
            </div>
            <p className="text-xs text-slate-300 font-semibold mt-1">
              List of States and Union Territories where 100% of tested groundwater samples complied with BIS IS 10500 permissible limits.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPristineExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white font-extrabold border-b border-slate-700">
                <th className="p-3 text-center w-16">Sl. No.</th>
                <th className="p-3 text-left w-1/4">Parameter</th>
                <th className="p-3 text-center w-44">No. of Pristine States/UTs</th>
                <th className="p-3 text-left">Name(s) of Pristine States / UTs (No exceedance)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium bg-white">
              {targetParams.map((pName, pIdx) => {
                const pData = summaryDataMap[pName];
                if (!pData) return null;
                const pristineStates = getPristineStatesForParam(pName);

                return (
                  <tr key={pName} className="hover:bg-emerald-50/40 transition-colors">
                    <td className="p-3 text-center font-bold text-slate-400 border-r border-slate-100">{pIdx + 1}</td>
                    <td className="p-3 font-bold text-slate-900 border-r border-slate-100">
                      {pData.paramFullName} <span className="text-emerald-700 font-mono font-bold">({pData.paramName})</span>
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-emerald-800 bg-emerald-50/40 border-r border-slate-100">
                      {pristineStates.length}
                    </td>
                    <td className="p-3">
                      {pristineStates.length > 0 ? (
                        <span className="text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60 inline-block leading-relaxed">
                          {pristineStates.join(", ")}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal italic">Nil</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (!activeParams || activeParams.length === 0) return null;

  const isDistrict = masterGeoLevel === "District";
  const subGroupName = isDistrict ? "Block" : "District";

  return (
    <div className="space-y-6">
      <div className="glossy-panel p-6 rounded-3xl">
        
        {/* Top Header Title */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-200/60 pb-4">
          <div>
            <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2.5 drop-shadow-sm">
              <TableProperties className="w-7 h-7 text-amber-600" />
              Comprehensive Summary Matrix & DOCX Hub
            </h3>
            <p className="text-xs text-slate-500 font-bold mt-1">
              Multi-parameter compliance assessment, exceedance logs, and customizable Word (.docx) downloads
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                View Level Link
              </label>
              <select
                value={masterGeoLevel}
                onChange={(e) => setMasterGeoLevel(e.target.value as "State" | "District")}
                className="glossy-input rounded-xl p-2.5 font-bold text-slate-700 min-w-[160px] bg-white cursor-pointer text-xs"
              >
                <option value="District">District Wise</option>
                <option value="State">States and UTs Wise</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sub-Tabs Navigation Bar */}
        <div className="flex flex-wrap gap-2 mb-6 p-2 bg-slate-100/80 backdrop-blur-md rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveSubTab("matrix")}
            className={`px-5 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === "matrix"
                ? "bg-amber-600 text-white shadow-md"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
          >
            <TableProperties className="w-4 h-4" />
            <span>Master Summary Matrix</span>
          </button>

          <button
            onClick={() => setActiveSubTab("exceedance")}
            className={`px-5 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === "exceedance"
                ? "bg-blue-600 text-white shadow-md"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Exceedance Tables (.docx)</span>
          </button>

          <button
            onClick={() => setActiveSubTab("partially_affected")}
            className={`px-5 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === "partially_affected"
                ? "bg-teal-600 text-white shadow-md"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Partially Affected Districts (.docx)</span>
          </button>

          <button
            onClick={() => setActiveSubTab("docx_hub")}
            className={`px-5 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === "docx_hub"
                ? "bg-indigo-600 text-white shadow-md"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Multi-Parameter DOCX Generator</span>
          </button>
        </div>

        {/* --- SUB TAB 1: MASTER SUMMARY MATRIX UNIFIED VIEW --- */}
        {activeSubTab === "matrix" && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="text-xs text-slate-600 font-bold">
                Unified cross-parameter compliance matrix combining sample counts, exceedance counts, percentages, and hotspot lists across all active parameters.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleExportMatrixExcel}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export Matrix (Excel)
                </button>

                <button
                  onClick={() => handleDownloadExceedanceDocx("ALL_ACTIVE")}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <FileText className="w-4 h-4" /> Download Exceedance DOCX
                </button>

                <button
                  onClick={() => setIsFullscreen(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <Maximize2 className="w-4 h-4" /> Full Screen
                </button>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="rounded-2xl overflow-hidden border border-slate-350 shadow-inner bg-white relative">
              <div className="overflow-x-auto overflow-y-auto custom-scrollbar max-h-[600px] w-full">
                <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                  <thead className="bg-blue-600 text-white font-bold sticky top-0 z-30 shadow-md">
                    <tr>
                      <th rowSpan={2} className="p-3 border border-blue-700 bg-blue-600 text-center sticky left-0 z-40 align-middle">
                        S.No.
                      </th>
                      <th rowSpan={2} className="p-3 border border-blue-700 bg-blue-600 text-center sticky left-[52px] z-40 align-middle">
                        State / UT
                      </th>
                      
                      {isDistrict && (
                        <th rowSpan={2} className="p-3 border border-blue-700 bg-blue-600 text-center sticky left-[120px] z-40 align-middle border-r-2 border-r-blue-800">
                          District
                        </th>
                      )}

                      {activeParams.map((paramName) => (
                        <th key={paramName} colSpan={5} className="p-3 border border-blue-700 bg-blue-700 text-center tracking-wider font-extrabold">
                          {paramName}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {activeParams.flatMap((_, pIdx) => [
                        <th key={`${pIdx}-1`} className="p-2 border border-blue-500 bg-blue-500 text-center text-[10px] font-semibold min-w-[125px]">
                          No. of Samples Analyzed
                        </th>,
                        <th key={`${pIdx}-2`} className="p-2 border border-blue-500 bg-blue-500 text-center text-[10px] font-semibold min-w-[125px] bg-rose-700/20 text-rose-100">
                          No. of Samples Above Limit
                        </th>,
                        <th key={`${pIdx}-3`} className="p-2 border border-blue-500 bg-blue-500 text-center text-[10px] font-semibold min-w-[100px] bg-rose-700/40 text-white">
                          % Above Limit
                        </th>,
                        <th key={`${pIdx}-4`} className="p-2 border border-blue-500 bg-blue-500 text-center text-[10px] font-semibold min-w-[125px]">
                          No. of Partially Affected {subGroupName}s
                        </th>,
                        <th key={`${pIdx}-5`} className="p-2 border border-blue-500 bg-blue-500 text-left text-[10px] font-semibold min-w-[200px]">
                          Name(s) of Partially Affected {subGroupName}s
                        </th>
                      ])}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700 font-medium bg-white">
                    {bodyHtml.length === 0 ? (
                      <tr>
                        <td colSpan={2 + (isDistrict ? 1 : 0) + (activeParams.length * 5)} className="p-12 text-center text-slate-400 font-bold uppercase tracking-wider bg-white">
                          No data uploaded yet. Please upload a spreadsheet to view the compliance matrix.
                        </td>
                      </tr>
                    ) : (
                      bodyHtml
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- SUB TAB 2: EXCEEDANCE TABLES (.DOCX) --- */}
        {activeSubTab === "exceedance" && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h4 className="text-sm font-extrabold text-blue-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-600" /> Exceedance Tables & Word Document (.docx) Exporter
                </h4>
                <p className="text-xs text-blue-700 font-medium mt-1">
                  Generates dedicated tables containing: <strong className="font-bold">Sl. No. | State/UT | No. of Samples Analysed | No. of Samples above Permissible limit (e.g. 3000 µS/cm at 25°C) | % of samples above permissible limit</strong>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <button
                  onClick={() => handleExportExceedanceExcel(selectedParamForExceedance)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg hover:shadow-xl transition-all cursor-pointer whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Download Selected Excel Table
                </button>
                <button
                  onClick={() => handleDownloadExceedanceDocx(selectedParamForExceedance)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg hover:shadow-xl transition-all cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4" /> Download Selected DOCX Table
                </button>
              </div>
            </div>

            {/* Parameter & Search Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider block mb-1">
                  Select Parameter
                </label>
                <select
                  value={selectedParamForExceedance}
                  onChange={(e) => setSelectedParamForExceedance(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL_ACTIVE">-- All Active Parameters --</option>
                  {activeParams.map((p) => {
                    const pData = summaryDataMap[p];
                    return (
                      <option key={p} value={p}>
                        {p} ({pData?.paramFullName || p}) - Limit: {pData?.limitHeaderStr}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider block mb-1">
                  Filter by State / District
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type state or district name..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 font-semibold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSelectedParamForExceedance("ALL_ACTIVE");
                    setSearchQuery("");
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer w-full justify-center"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reset Filters
                </button>
              </div>
            </div>

            {/* Display Tables */}
            <div>
              {selectedParamForExceedance === "ALL_ACTIVE" ? (
                activeParams.map((p) => renderExceedanceGuiTable(p))
              ) : (
                renderExceedanceGuiTable(selectedParamForExceedance)
              )}
            </div>
          </div>
        )}

        {/* --- SUB TAB 3: PARTIALLY AFFECTED DISTRICTS TABLES (.DOCX) --- */}
        {activeSubTab === "partially_affected" && (
          <div className="space-y-6">
            <div className="bg-teal-50 border border-teal-200 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h4 className="text-sm font-extrabold text-teal-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-teal-600" /> Partially Affected Districts Tables (.docx) Exporter
                </h4>
                <p className="text-xs text-teal-700 font-medium mt-1">
                  Generates dedicated tables containing: <strong className="font-bold">Sl. No. | State / UT | No. of Partially affected Districts | Name(s) of Partially affected Districts</strong>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <button
                  onClick={() => handleExportAffectedExcel(selectedParamForAffected)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg hover:shadow-xl transition-all cursor-pointer whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Download Selected Excel Table
                </button>
                <button
                  onClick={() => handleDownloadAffectedDocx(selectedParamForAffected)}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg hover:shadow-xl transition-all cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4" /> Download Selected DOCX Table
                </button>
              </div>
            </div>

            {/* Parameter & Search Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider block mb-1">
                  Select Parameter
                </label>
                <select
                  value={selectedParamForAffected}
                  onChange={(e) => setSelectedParamForAffected(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-teal-500"
                >
                  <option value="ALL_ACTIVE">-- All Active Parameters --</option>
                  {activeParams.map((p) => {
                    const pData = summaryDataMap[p];
                    return (
                      <option key={p} value={p}>
                        {p} ({pData?.paramFullName || p}) - Limit: {pData?.limitHeaderStr}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider block mb-1">
                  Filter by State / District
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type state or district name..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 font-semibold text-slate-800 text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSelectedParamForAffected("ALL_ACTIVE");
                    setSearchQuery("");
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer w-full justify-center"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reset Filters
                </button>
              </div>
            </div>

            {/* Display Tables */}
            <div>
              {/* Parameter-Wise Pristine States / UTs Summary Table */}
              {renderPristineGuiTable(selectedParamForAffected === "ALL_ACTIVE" ? activeParams : [selectedParamForAffected])}

              {/* Individual Partially Affected District / Sub-Group Tables */}
              {selectedParamForAffected === "ALL_ACTIVE" ? (
                activeParams.map((p) => renderAffectedGuiTable(p))
              ) : (
                renderAffectedGuiTable(selectedParamForAffected)
              )}
            </div>
          </div>
        )}

        {/* --- SUB TAB 4: DOCX MULTI-PARAMETER REPORT GENERATOR HUB --- */}
        {activeSubTab === "docx_hub" && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-6 rounded-3xl shadow-xl">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <span className="bg-indigo-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                    Word Document (.docx) Engine
                  </span>
                  <h4 className="text-xl font-black text-white mt-2 flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-indigo-400" /> Multi-Parameter Custom Report Builder
                  </h4>
                  <p className="text-xs text-indigo-200 font-medium mt-1 max-w-2xl">
                    Select specific water quality parameters and configure document sections to generate a publication-ready Microsoft Word document (.docx) with embedded tables, formal typography, and header styling.
                  </p>
                </div>

                <button
                  onClick={handleDownloadHubCustomDocx}
                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-6 py-3 rounded-2xl font-black text-xs flex items-center gap-2 shadow-xl hover:shadow-2xl transition-all cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-5 h-5" /> Generate & Download Custom DOCX
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Parameter Selection Panel */}
              <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h5 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-indigo-600" /> Select Parameters for DOCX Report
                  </h5>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const allOn: Record<string, boolean> = {};
                        activeParams.forEach((p) => (allOn[p] = true));
                        setSelectedDocxParams(allOn);
                      }}
                      className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => setSelectedDocxParams({})}
                      className="text-xs font-bold text-slate-500 hover:underline cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {activeParams.map((param) => {
                    const pData = summaryDataMap[param];
                    const isChecked = !!selectedDocxParams[param];
                    return (
                      <label
                        key={param}
                        onClick={() =>
                          setSelectedDocxParams((prev) => ({
                            ...prev,
                            [param]: !prev[param],
                          }))
                        }
                        className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                          isChecked
                            ? "bg-indigo-50/80 border-indigo-300 shadow-sm"
                            : "bg-slate-50 border-slate-200 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Handled by container
                          className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-black text-xs text-slate-900">{param}</div>
                          <div className="text-[10px] text-slate-500 font-semibold">{pData?.paramFullName || param}</div>
                          <div className="text-[10px] text-indigo-600 font-bold mt-0.5">Limit: {pData?.limitHeaderStr}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Document Configuration Panel */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h5 className="text-sm font-black text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" /> Document Sections
                </h5>

                <div className="space-y-3">
                  <label className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeExceedanceInDocx}
                      onChange={(e) => setIncludeExceedanceInDocx(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Exceedance Tables</div>
                      <div className="text-[10px] text-slate-500">Sample counts, exceedances, and % ratios</div>
                    </div>
                  </label>

                  <label className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeAffectedInDocx}
                      onChange={(e) => setIncludeAffectedInDocx(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Partially Affected Tables</div>
                      <div className="text-[10px] text-slate-500">Affected districts & sub-group names</div>
                    </div>
                  </label>

                  <label className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includePristineInDocx}
                      onChange={(e) => setIncludePristineInDocx(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Pristine States / UTs Table</div>
                      <div className="text-[10px] text-slate-500">Parameter-wise list of States/UTs with 0 exceedance</div>
                    </div>
                  </label>
                </div>

                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 text-xs text-indigo-900 space-y-1">
                  <div className="font-extrabold flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-indigo-600" /> Target Output Format
                  </div>
                  <p className="text-[11px] text-indigo-700">
                    Outputs native Microsoft Word (.docx) document formatted with Times New Roman typography, 1-inch margins, navy headers, zebra rows, and page numbers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Full Screen Table Modal View */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-8">
          <div className="bg-white rounded-3xl shadow-2xl p-3 sm:p-6 w-full h-[95vh] sm:h-[92vh] flex flex-col relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <TableProperties className="w-5 h-5 text-indigo-600 animate-pulse" />
                  Master Summary Matrix (Full Screen Explorer)
                </h3>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase mt-0.5">
                  Interactive multi-parameter compliance logs with scroll optimization
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportMatrixExcel}
                  className="bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border-b-4 border-emerald-200 hover:border-emerald-800 active:border-b-0 active:translate-y-1 cursor-pointer"
                  title="Export Excel"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Export Excel</span>
                </button>
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="bg-slate-100 text-slate-600 hover:bg-rose-600 hover:text-white p-2 rounded-xl text-xs font-bold transition-all border-b-4 border-slate-200 hover:border-rose-800 active:border-b-0 active:translate-y-1 cursor-pointer"
                  title="Close Full Screen"
                >
                  <Minimize2 className="w-4 h-4" />
                  <span>Exit Full Screen</span>
                </button>
              </div>
            </div>

            {/* Table stage inside Modal */}
            <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 shadow-inner bg-white relative flex flex-col">
              <div className="overflow-auto custom-scrollbar flex-1 w-full h-full">
                <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                  <thead className="bg-indigo-600 text-white font-bold sticky top-0 z-30 shadow-md">
                    <tr>
                      <th rowSpan={2} className="p-3 border border-indigo-750 bg-indigo-600 text-center sticky left-0 z-40 align-middle">
                        S.No.
                      </th>
                      <th rowSpan={2} className="p-3 border border-indigo-750 bg-indigo-600 text-center sticky left-[52px] z-40 align-middle">
                        State / UT
                      </th>
                      
                      {isDistrict && (
                        <th rowSpan={2} className="p-3 border border-indigo-750 bg-indigo-600 text-center sticky left-[120px] z-40 align-middle border-r-2 border-r-indigo-800">
                          District
                        </th>
                      )}

                      {activeParams.map((paramName) => (
                        <th key={paramName} colSpan={5} className="p-3 border border-indigo-700 bg-indigo-700 text-center tracking-wider font-extrabold">
                          {paramName}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {activeParams.flatMap((_, pIdx) => [
                        <th key={`${pIdx}-1`} className="p-2 border border-indigo-500 bg-indigo-500 text-center text-[10px] font-semibold min-w-[125px]">
                          No. of Samples Analyzed
                        </th>,
                        <th key={`${pIdx}-2`} className="p-2 border border-indigo-500 bg-indigo-500 text-center text-[10px] font-semibold min-w-[125px] bg-rose-700/20 text-rose-100">
                          No. of Samples Above Limit
                        </th>,
                        <th key={`${pIdx}-3`} className="p-2 border border-indigo-500 bg-indigo-500 text-center text-[10px] font-semibold min-w-[100px] bg-rose-700/40 text-white">
                          % Above Limit
                        </th>,
                        <th key={`${pIdx}-4`} className="p-2 border border-indigo-500 bg-indigo-500 text-center text-[10px] font-semibold min-w-[125px]">
                          No. of Partially Affected {subGroupName}s
                        </th>,
                        <th key={`${pIdx}-5`} className="p-2 border border-indigo-500 bg-indigo-500 text-left text-[10px] font-semibold min-w-[200px]">
                          Name(s) of Partially Affected {subGroupName}s
                        </th>
                      ])}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700 font-medium bg-white">
                    {bodyHtml.length === 0 ? (
                      <tr>
                        <td colSpan={2 + (isDistrict ? 1 : 0) + (activeParams.length * 5)} className="p-12 text-center text-slate-400 font-bold uppercase tracking-wider bg-white">
                          No data uploaded yet.
                        </td>
                      </tr>
                    ) : (
                      bodyHtml
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
