import React, { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  Globe,
  Layers,
  MapPin,
  RotateCcw,
  Search
} from "lucide-react";
import { DataHeaders } from "../types";
import { downloadExcelJSWorkbook } from "../utils/excelFormatter";
import {
  computeSourceAllParamsSummary,
  computeSourceExceedingLocations,
  computeStateAffectedSummary,
  computeStateWiseSelectedSummary,
  formatSummaryValue,
  type SourceExceedingLocationRow,
  type SourceParamStatRow,
  type StateAffectedSummaryRow,
  type StateParamStatRow
} from "../utils/sourceSummaryEngine";

interface SourceWiseAllParamTabProps {
  analyzedData: Record<string, any>[];
  totalRawCount: number;
  headers: DataHeaders;
  headerMap: Record<string, string>;
  sourceColumn: string;
  setSourceColumn: (col: string) => void;
  availableHeaders: string[];
  localStateFilter: string;
  setLocalStateFilter: (val: string) => void;
  localDistrictFilter: string;
  setLocalDistrictFilter: (val: string) => void;
  localBlockFilter: string;
  setLocalBlockFilter: (val: string) => void;
  localStates: string[];
  localDistricts: string[];
  localBlocks: string[];
  showToast: (msg: string, type?: "success" | "error") => void;
}

type ActivePanelView = "sourceSummary" | "stateSummary" | "exceedingLocations";
type StatRowLike = SourceParamStatRow | StateParamStatRow;

export default function SourceWiseAllParamTab({
  analyzedData,
  totalRawCount,
  headers,
  headerMap,
  sourceColumn,
  setSourceColumn,
  availableHeaders,
  localStateFilter,
  setLocalStateFilter,
  localDistrictFilter,
  setLocalDistrictFilter,
  localBlockFilter,
  setLocalBlockFilter,
  localStates,
  localDistricts,
  localBlocks,
  showToast
}: SourceWiseAllParamTabProps) {
  const [activeView, setActiveView] = useState<ActivePanelView>("sourceSummary");
  const [groupMode, setGroupMode] = useState<"byGroup" | "byParam">("byGroup");
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>("ALL");

  // Multi-parameter selection: null means all available parameters are selected
  const [selectedParamCodes, setSelectedParamCodes] = useState<string[] | null>(null);

  const [includeOverallSection, setIncludeOverallSection] = useState<boolean>(true);
  const [onlyExceedances, setOnlyExceedances] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [minExceedCount, setMinExceedCount] = useState<number>(1);
  const [visibleLocationLimit, setVisibleLocationLimit] = useState<number>(250);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Full Source-Wise Summary (used for source list, parameter list, and Source-Wise view)
  const summary = useMemo(
    () => computeSourceAllParamsSummary(analyzedData, headers, headerMap, sourceColumn),
    [analyzedData, headers, headerMap, sourceColumn]
  );

  const allParamCodes = useMemo(
    () => summary.paramList.map((p) => p.paramCode),
    [summary.paramList]
  );

  // Effective list of active parameter codes (sanitized against current dataset)
  const activeParamCodes = useMemo(() => {
    if (selectedParamCodes === null) return allParamCodes;
    const availableSet = new Set(allParamCodes);
    return selectedParamCodes.filter((code) => availableSet.has(code));
  }, [selectedParamCodes, allParamCodes]);

  const activeParamSet = useMemo(() => new Set(activeParamCodes), [activeParamCodes]);

  // Keep selectedSourceFilter valid when geographic filters change
  const activeSourceFilter =
    selectedSourceFilter === "ALL" ||
    selectedSourceFilter === "OVERALL_ONLY" ||
    summary.sources.some((s) => s.sourceName === selectedSourceFilter)
      ? selectedSourceFilter
      : "ALL";

  const selectedSourcesForEngine = useMemo(
    () =>
      activeSourceFilter !== "ALL" && activeSourceFilter !== "OVERALL_ONLY"
        ? [activeSourceFilter]
        : undefined,
    [activeSourceFilter]
  );

  // State-Wise & Selected-Parameter-Wise Summary for Selected Source(s)
  const stateSummary = useMemo(() => {
    if (activeParamCodes.length === 0) {
      return {
        states: [],
        paramList: [],
        rows: [],
        overallRows: [],
        totalFilteredRows: 0
      };
    }
    return computeStateWiseSelectedSummary(analyzedData, headers, headerMap, sourceColumn, {
      selectedSources: selectedSourcesForEngine,
      selectedParamCodes: activeParamCodes
    });
  }, [analyzedData, headers, headerMap, sourceColumn, selectedSourcesForEngine, activeParamCodes]);

  // List of locations where 1 or more selected parameters exceed BIS permissible limit
  const exceedingLocations = useMemo(() => {
    if (activeParamCodes.length === 0) return [];
    return computeSourceExceedingLocations(analyzedData, headers, headerMap, sourceColumn, {
      selectedSources: selectedSourcesForEngine,
      selectedParamCodes: activeParamCodes
    });
  }, [analyzedData, headers, headerMap, sourceColumn, selectedSourcesForEngine, activeParamCodes]);

  // Additional State-Wise Affected Locations Summary (State, No. of Samples, No. Affected >= 1 Param, Name of Parameters)
  const stateAffectedSummary = useMemo(() => {
    if (activeParamCodes.length === 0) {
      return {
        rows: [] as StateAffectedSummaryRow[],
        overall: {
          stateName: "All States (Total)",
          isOverall: true,
          totalSamples: 0,
          affectedLocationsCount: 0,
          affectedLocationsPct: 0,
          affectedParamNames: "None",
          affectedParamBreakdown: []
        } as StateAffectedSummaryRow
      };
    }
    return computeStateAffectedSummary(analyzedData, headers, headerMap, sourceColumn, {
      selectedSources: selectedSourcesForEngine,
      selectedParamCodes: activeParamCodes
    });
  }, [analyzedData, headers, headerMap, sourceColumn, selectedSourcesForEngine, activeParamCodes]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredStateAffectedRows = useMemo(() => {
    return stateAffectedSummary.rows.filter((r) => {
      if (onlyExceedances && r.affectedLocationsCount === 0) return false;
      if (!normalizedSearch) return true;
      return (
        r.stateName.toLowerCase().includes(normalizedSearch) ||
        r.affectedParamNames.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [stateAffectedSummary.rows, onlyExceedances, normalizedSearch]);

  const matchesStatRow = (row: StatRowLike, groupLabel: string): boolean => {
    if (!activeParamSet.has(row.paramCode)) return false;
    if (onlyExceedances && (row.abovePermissibleCount === null || row.abovePermissibleCount === 0)) {
      return false;
    }
    if (!normalizedSearch) return true;
    return (
      row.paramCode.toLowerCase().includes(normalizedSearch) ||
      row.paramName.toLowerCase().includes(normalizedSearch) ||
      row.originalHeader.toLowerCase().includes(normalizedSearch) ||
      groupLabel.toLowerCase().includes(normalizedSearch)
    );
  };

  // Source-Wise grouped rows
  const groupedBySource = useMemo(() => {
    const groups: Array<{
      key: string;
      title: string;
      subtitle: string;
      isOverall: boolean;
      rows: SourceParamStatRow[];
    }> = [];

    if (includeOverallSection && (activeSourceFilter === "ALL" || activeSourceFilter === "OVERALL_ONLY")) {
      const filteredOverall = summary.overallRows.filter((r) => matchesStatRow(r, r.sourceName));
      if (filteredOverall.length > 0) {
        groups.push({
          key: "__OVERALL__",
          title: "All Sources Combined (Overall Summary)",
          subtitle: `${summary.totalInputRows.toLocaleString()} filtered samples · ${activeParamCodes.length} selected parameter${activeParamCodes.length === 1 ? "" : "s"}`,
          isOverall: true,
          rows: filteredOverall
        });
      }
    }

    if (activeSourceFilter !== "OVERALL_ONLY") {
      for (const src of summary.sources) {
        if (activeSourceFilter !== "ALL" && src.sourceName !== activeSourceFilter) continue;
        const srcRows = summary.rows.filter(
          (r) => r.sourceName === src.sourceName && matchesStatRow(r, r.sourceName)
        );
        if (srcRows.length > 0) {
          const excCount = srcRows.filter(
            (r) => r.abovePermissibleCount !== null && r.abovePermissibleCount > 0
          ).length;
          groups.push({
            key: src.sourceName,
            title: src.sourceName,
            subtitle: `${src.rowCount.toLocaleString()} samples · ${excCount} selected parameter${excCount === 1 ? "" : "s"} exceeding BIS limit`,
            isOverall: false,
            rows: srcRows
          });
        }
      }
    }

    return groups;
  }, [summary, includeOverallSection, activeSourceFilter, activeParamSet, activeParamCodes.length, onlyExceedances, normalizedSearch]);

  const groupedSourceByParam = useMemo(() => {
    const groups: Array<{
      key: string;
      paramCode: string;
      paramName: string;
      unit: string;
      permissibleLimitLabel: string;
      rows: SourceParamStatRow[];
    }> = [];

    for (const p of summary.paramList) {
      if (!activeParamSet.has(p.paramCode)) continue;
      const paramRows: SourceParamStatRow[] = [];
      if (includeOverallSection && (activeSourceFilter === "ALL" || activeSourceFilter === "OVERALL_ONLY")) {
        const ov = summary.overallRows.find((r) => r.paramCode === p.paramCode);
        if (ov && matchesStatRow(ov, ov.sourceName)) paramRows.push(ov);
      }
      if (activeSourceFilter !== "OVERALL_ONLY") {
        for (const r of summary.rows) {
          if (r.paramCode !== p.paramCode) continue;
          if (activeSourceFilter !== "ALL" && r.sourceName !== activeSourceFilter) continue;
          if (matchesStatRow(r, r.sourceName)) paramRows.push(r);
        }
      }
      if (paramRows.length > 0) {
        groups.push({
          key: p.paramCode,
          paramCode: p.paramCode,
          paramName: p.paramName,
          unit: p.unit,
          permissibleLimitLabel: p.permissibleLimitLabel,
          rows: paramRows
        });
      }
    }
    return groups;
  }, [summary, includeOverallSection, activeSourceFilter, activeParamSet, onlyExceedances, normalizedSearch]);

  // State-Wise grouped rows (for selected source & selected parameters)
  const groupedByState = useMemo(() => {
    const groups: Array<{
      key: string;
      title: string;
      subtitle: string;
      isOverall: boolean;
      rows: StateParamStatRow[];
    }> = [];

    if (includeOverallSection) {
      const filteredOverall = stateSummary.overallRows.filter((r) => matchesStatRow(r, r.stateName));
      if (filteredOverall.length > 0) {
        groups.push({
          key: "__ALL_STATES__",
          title: `All States Combined (${activeSourceFilter === "ALL" || activeSourceFilter === "OVERALL_ONLY" ? "All Sources" : activeSourceFilter})`,
          subtitle: `${stateSummary.totalFilteredRows.toLocaleString()} samples across ${stateSummary.states.length} state${stateSummary.states.length === 1 ? "" : "s"}`,
          isOverall: true,
          rows: filteredOverall
        });
      }
    }

    for (const st of stateSummary.states) {
      const stRows = stateSummary.rows.filter(
        (r) => r.stateName === st.stateName && matchesStatRow(r, r.stateName)
      );
      if (stRows.length > 0) {
        groups.push({
          key: st.stateName,
          title: st.stateName,
          subtitle: `${st.rowCount.toLocaleString()} samples · ${st.exceedingParamCount} selected parameter${st.exceedingParamCount === 1 ? "" : "s"} exceeding BIS limit`,
          isOverall: false,
          rows: stRows
        });
      }
    }

    return groups;
  }, [stateSummary, includeOverallSection, activeSourceFilter, activeParamSet, onlyExceedances, normalizedSearch]);

  const groupedStateByParam = useMemo(() => {
    const groups: Array<{
      key: string;
      paramCode: string;
      paramName: string;
      unit: string;
      permissibleLimitLabel: string;
      rows: StateParamStatRow[];
    }> = [];

    for (const p of stateSummary.paramList) {
      const paramRows: StateParamStatRow[] = [];
      if (includeOverallSection) {
        const ov = stateSummary.overallRows.find((r) => r.paramCode === p.paramCode);
        if (ov && matchesStatRow(ov, ov.stateName)) paramRows.push(ov);
      }
      for (const r of stateSummary.rows) {
        if (r.paramCode !== p.paramCode) continue;
        if (matchesStatRow(r, r.stateName)) paramRows.push(r);
      }
      if (paramRows.length > 0) {
        groups.push({
          key: p.paramCode,
          paramCode: p.paramCode,
          paramName: p.paramName,
          unit: p.unit,
          permissibleLimitLabel: p.permissibleLimitLabel,
          rows: paramRows
        });
      }
    }
    return groups;
  }, [stateSummary, includeOverallSection, activeParamSet, onlyExceedances, normalizedSearch]);

  // Filtered exceeding locations
  const filteredExceedingLocations = useMemo(() => {
    return exceedingLocations.filter((loc) => {
      if (loc.exceedingCount < minExceedCount) return false;
      if (!normalizedSearch) return true;
      return (
        loc.state.toLowerCase().includes(normalizedSearch) ||
        loc.district.toLowerCase().includes(normalizedSearch) ||
        loc.block.toLowerCase().includes(normalizedSearch) ||
        loc.location.toLowerCase().includes(normalizedSearch) ||
        loc.source.toLowerCase().includes(normalizedSearch) ||
        loc.exceedingParamNames.toLowerCase().includes(normalizedSearch) ||
        loc.exceedingValuesWithUnits.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [exceedingLocations, minExceedCount, normalizedSearch]);

  const toggleParam = (paramCode: string) => {
    setSelectedParamCodes((prev) => {
      const current = prev === null ? [...allParamCodes] : [...prev];
      const idx = current.indexOf(paramCode);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(paramCode);
      }
      return current;
    });
    setVisibleLocationLimit(250);
  };

  const handleSelectAllParams = () => {
    setSelectedParamCodes(null);
    setVisibleLocationLimit(250);
  };

  const handleSelectBisOnlyParams = () => {
    setSelectedParamCodes(summary.paramList.filter((p) => p.hasBisLimit).map((p) => p.paramCode));
    setVisibleLocationLimit(250);
  };

  const handleClearParams = () => {
    setSelectedParamCodes([]);
    setVisibleLocationLimit(250);
  };

  const activeGeoLabel = [
    localStateFilter || "All States",
    localDistrictFilter || "All Districts",
    localBlockFilter || "All Blocks"
  ].join(" / ");

  const activeSourceLabel =
    activeSourceFilter === "ALL" || activeSourceFilter === "OVERALL_ONLY"
      ? "All Sources"
      : activeSourceFilter;

  const appendStatSheet = (
    wb: ExcelJS.Workbook,
    sheetName: string,
    title: string,
    groupColHeader: string,
    rowsToWrite: Array<StatRowLike & { groupLabel: string }>
  ) => {
    const ws = wb.addWorksheet(sheetName);
    ws.columns = [
      { width: 24 },
      { width: 26 },
      { width: 12 },
      { width: 14 },
      { width: 20 },
      { width: 16 },
      { width: 12 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 12 },
      { width: 22 },
      { width: 20 }
    ];

    const titleRow = ws.addRow([title]);
    ws.mergeCells("A1:M1");
    const titleCell = titleRow.getCell(1);
    titleCell.font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    titleRow.height = 24;

    const headerRow = ws.addRow([
      groupColHeader,
      "Parameter",
      "Code",
      "Unit",
      "BIS Permissible Limit",
      "Total Samples (n)",
      "Min",
      "5th Percentile (P05)",
      "75th Percentile (P75)",
      "99th Percentile (P99)",
      "Max",
      "Above Permissible (No.)",
      "Above Permissible (%)"
    ]);
    headerRow.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.height = 26;

    rowsToWrite.forEach((r) => {
      const row = ws.addRow([
        r.groupLabel,
        r.paramName,
        r.paramCode,
        r.unit || "—",
        r.permissibleLimitLabel,
        r.totalSamples,
        r.min !== null ? Number(r.min.toFixed(4)) : "—",
        r.p05 !== null ? Number(r.p05.toFixed(4)) : "—",
        r.p75 !== null ? Number(r.p75.toFixed(4)) : "—",
        r.p99 !== null ? Number(r.p99.toFixed(4)) : "—",
        r.max !== null ? Number(r.max.toFixed(4)) : "—",
        r.abovePermissibleCount !== null ? r.abovePermissibleCount : "—",
        r.abovePermissiblePct !== null ? Number(r.abovePermissiblePct.toFixed(2)) : "—"
      ]);

      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
        if (colNumber >= 6) {
          cell.alignment = { horizontal: "right", vertical: "middle" };
        }
      });

      if (r.abovePermissibleCount !== null && r.abovePermissibleCount > 0) {
        row.getCell(13).font = { bold: true, color: { argb: "FFB91C1C" } };
      }
    });

    ws.views = [{ state: "frozen", ySplit: 2 }];
  };

  const appendExceedingLocationsSheet = (
    wb: ExcelJS.Workbook,
    locationsToWrite: SourceExceedingLocationRow[]
  ) => {
    const ws = wb.addWorksheet("Exceeding_Locations");
    ws.columns = [
      { width: 9 },
      { width: 18 },
      { width: 20 },
      { width: 20 },
      { width: 26 },
      { width: 18 },
      { width: 24 },
      { width: 34 },
      { width: 44 }
    ];

    const titleRow = ws.addRow([
      `Locations Exceeding BIS Permissible Limit — Source: ${activeSourceLabel} | Region: ${activeGeoLabel}`
    ]);
    ws.mergeCells("A1:I1");
    const titleCell = titleRow.getCell(1);
    titleCell.font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    titleRow.height = 24;

    const headerRow = ws.addRow([
      "Sl. No.",
      "State",
      "District",
      "Block",
      "Location",
      "Source",
      "No. of Parameters Above Permissible Limit",
      "Name of Parameters Above Permissible Limit",
      "Values & Units of Exceeding Parameters"
    ]);
    headerRow.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.height = 28;

    locationsToWrite.forEach((loc, idx) => {
      const row = ws.addRow([
        idx + 1,
        loc.state,
        loc.district,
        loc.block,
        loc.location,
        loc.source,
        loc.exceedingCount,
        loc.exceedingParamNames,
        loc.exceedingValuesWithUnits
      ]);

      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
        if (colNumber === 1 || colNumber === 7) {
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        }
      });

      row.getCell(7).font = { bold: true, color: { argb: "FFB91C1C" } };
    });

    ws.views = [{ state: "frozen", ySplit: 2 }];
  };

  const appendStateAffectedSheet = (
    wb: ExcelJS.Workbook,
    rowsToWrite: StateAffectedSummaryRow[],
    overallRow: StateAffectedSummaryRow
  ) => {
    const ws = wb.addWorksheet("State_Affected_Summary");
    ws.columns = [
      { width: 9 },
      { width: 24 },
      { width: 16 },
      { width: 32 },
      { width: 16 },
      { width: 48 }
    ];

    const titleRow = ws.addRow([
      `State-Wise Affected Locations Summary (≥ 1 Parameter Above BIS Limit) — Source: ${activeSourceLabel} | Region: ${activeGeoLabel}`
    ]);
    ws.mergeCells("A1:F1");
    const titleCell = titleRow.getCell(1);
    titleCell.font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    titleRow.height = 24;

    const headerRow = ws.addRow([
      "Sl. No.",
      "State",
      "No. of Samples",
      "No. of Locations Affected (≥ 1 Parameter)",
      "Affected (%)",
      "Name of Parameter(s) Above Permissible Limit"
    ]);
    headerRow.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.height = 28;

    const writeRow = (r: StateAffectedSummaryRow, slNo: number | string, isTotal: boolean) => {
      const row = ws.addRow([
        slNo,
        r.stateName,
        r.totalSamples,
        r.affectedLocationsCount,
        Number(r.affectedLocationsPct.toFixed(2)),
        r.affectedParamNames
      ]);
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
        if (colNumber === 1 || colNumber === 3 || colNumber === 4 || colNumber === 5) {
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        }
        if (isTotal) {
          cell.font = { bold: true, color: { argb: "FF0F172A" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
        }
      });
      if (!isTotal && r.affectedLocationsCount > 0) {
        row.getCell(4).font = { bold: true, color: { argb: "FFB91C1C" } };
        row.getCell(5).font = { bold: true, color: { argb: "FFB91C1C" } };
      }
    };

    rowsToWrite.forEach((r, idx) => writeRow(r, idx + 1, false));
    if (overallRow.totalSamples > 0) {
      writeRow(overallRow, "", true);
    }

    ws.views = [{ state: "frozen", ySplit: 2 }];
  };

  const handleExportExcel = async (exportMode: "full" | "locations" | "stateAffected" = "full") => {
    if (!sourceColumn || activeParamCodes.length === 0) {
      showToast("Select a source column and at least one parameter before exporting.", "error");
      return;
    }

    setIsExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "HydroGeo Analytics";
      wb.created = new Date();

      if (exportMode === "locations") {
        if (filteredExceedingLocations.length === 0) {
          showToast("No exceeding locations match the current filters.", "error");
          return;
        }
        appendExceedingLocationsSheet(wb, filteredExceedingLocations);
      } else if (exportMode === "stateAffected") {
        if (filteredStateAffectedRows.length === 0) {
          showToast("No state affected summary rows match the current filters.", "error");
          return;
        }
        appendStateAffectedSheet(wb, filteredStateAffectedRows, stateAffectedSummary.overall);
      } else {
        const exportedSourceRows = summary.rows
          .filter(
            (r) =>
              activeParamSet.has(r.paramCode) &&
              (activeSourceFilter === "ALL" ||
                activeSourceFilter === "OVERALL_ONLY" ||
                r.sourceName === activeSourceFilter)
          )
          .map((r) => ({ ...r, groupLabel: r.sourceName }));

        if (exportedSourceRows.length > 0) {
          appendStatSheet(
            wb,
            "Source_Wise_Summary",
            `Source-Wise Selected-Parameter Summary — ${activeGeoLabel}`,
            "Source",
            exportedSourceRows
          );
        }

        if (stateAffectedSummary.rows.length > 0) {
          appendStateAffectedSheet(wb, stateAffectedSummary.rows, stateAffectedSummary.overall);
        }

        const exportedStateRows = stateSummary.rows.map((r) => ({
          ...r,
          groupLabel: r.stateName
        }));
        if (exportedStateRows.length > 0) {
          appendStatSheet(
            wb,
            "State_Wise_Summary",
            `State-Wise Summary for ${activeSourceLabel} — ${activeGeoLabel}`,
            "State",
            exportedStateRows
          );
        }

        const exportedOverallRows = summary.overallRows
          .filter((r) => activeParamSet.has(r.paramCode))
          .map((r) => ({ ...r, groupLabel: r.sourceName }));
        if (exportedOverallRows.length > 0) {
          appendStatSheet(
            wb,
            "Overall_Summary",
            `Combined Overall Summary — ${activeGeoLabel}`,
            "Scope",
            exportedOverallRows
          );
        }

        appendExceedingLocationsSheet(wb, filteredExceedingLocations);
      }

      const geoTag = [localStateFilter, localDistrictFilter, localBlockFilter]
        .filter(Boolean)
        .join("_")
        .replace(/[^a-zA-Z0-9_-]/g, "");
      const srcTag = activeSourceLabel.replace(/[^a-zA-Z0-9_-]/g, "");
      const prefix =
        exportMode === "locations"
          ? "Exceeding_Locations"
          : exportMode === "stateAffected"
            ? "State_Affected_Summary"
            : "Source_State_Param_Summary";
      const fileName = `${prefix}_${srcTag}_${geoTag || "All_Regions"}_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;

      await downloadExcelJSWorkbook(wb, fileName);
      showToast(`Exported ${fileName}`, "success");
    } catch (err) {
      console.error("Source-wise Excel export failed:", err);
      showToast("Failed to export Excel report.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const renderStatCells = (r: StatRowLike) => {
    const hasExceed = r.abovePermissibleCount !== null && r.abovePermissibleCount > 0;
    const pct = r.abovePermissiblePct ?? 0;

    return (
      <>
        <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums border-b border-slate-100">
          {r.totalSamples.toLocaleString()}
        </td>
        <td className="px-3 py-2 text-right text-slate-700 tabular-nums border-b border-slate-100">
          {formatSummaryValue(r.min)}
        </td>
        <td className="px-3 py-2 text-right text-slate-700 tabular-nums border-b border-slate-100">
          {formatSummaryValue(r.p05)}
        </td>
        <td className="px-3 py-2 text-right text-slate-800 font-medium tabular-nums border-b border-slate-100">
          {formatSummaryValue(r.p75)}
        </td>
        <td className="px-3 py-2 text-right text-slate-800 font-medium tabular-nums border-b border-slate-100">
          {formatSummaryValue(r.p99)}
        </td>
        <td className="px-3 py-2 text-right text-slate-900 font-semibold tabular-nums border-b border-slate-100">
          {formatSummaryValue(r.max)}
        </td>
        <td
          className={`px-3 py-2 text-right tabular-nums border-b border-slate-100 ${
            !r.hasBisLimit
              ? "text-slate-400"
              : hasExceed
                ? "text-rose-700 font-semibold bg-rose-50/50"
                : "text-emerald-700 font-medium"
          }`}
        >
          {r.abovePermissibleCount !== null ? r.abovePermissibleCount.toLocaleString() : "—"}
        </td>
        <td
          className={`px-3 py-2 text-right tabular-nums border-b border-slate-100 ${
            !r.hasBisLimit
              ? "text-slate-400"
              : hasExceed
                ? "text-rose-700 font-semibold bg-rose-50/50"
                : "text-emerald-700 font-medium"
          }`}
        >
          {r.abovePermissiblePct !== null ? (
            <div className="inline-flex items-center justify-end gap-2 min-w-[82px]">
              <div className="w-10 h-1.5 bg-slate-200 rounded-sm overflow-hidden hidden sm:block">
                <div
                  className={hasExceed ? "h-full bg-rose-600" : "h-full bg-emerald-500"}
                  style={{ width: `${Math.min(100, Math.max(pct > 0 ? 4 : 0, pct))}%` }}
                />
              </div>
              <span>{pct.toFixed(1)}%</span>
            </div>
          ) : (
            "—"
          )}
        </td>
      </>
    );
  };

  const hasActiveResettableFilters =
    Boolean(localStateFilter) ||
    Boolean(localDistrictFilter) ||
    Boolean(localBlockFilter) ||
    activeSourceFilter !== "ALL" ||
    selectedParamCodes !== null ||
    Boolean(searchQuery) ||
    onlyExceedances ||
    minExceedCount > 1;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header Bar */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/70">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Source-Wise All-Parameter &amp; State-Wise Summary</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Select one or more parameters and a water source to inspect Source-Wise statistics, State-Wise breakdowns, and locations exceeding BIS permissible limits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleExportExcel("full")}
            disabled={isExporting || !sourceColumn || activeParamCodes.length === 0 || analyzedData.length === 0}
            className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? "Exporting..." : "Export Full Excel"}</span>
          </button>
        </div>
      </div>

      {/* Synced Geographic & Source Filter Bar */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-white space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* State Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-slate-400" /> State / UT
            </label>
            <select
              value={localStateFilter}
              onChange={(e) => {
                setLocalStateFilter(e.target.value);
                setLocalDistrictFilter("");
                setLocalBlockFilter("");
                setVisibleLocationLimit(250);
              }}
              className="h-9 px-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="">All States / UTs ({localStates.length})</option>
              {localStates.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* District Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" /> District
            </label>
            <select
              value={localDistrictFilter}
              onChange={(e) => {
                setLocalDistrictFilter(e.target.value);
                setLocalBlockFilter("");
                setVisibleLocationLimit(250);
              }}
              disabled={!localStateFilter && localStates.length > 1}
              className="h-9 px-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {!localStateFilter && localStates.length > 1
                  ? "Select State first"
                  : `All Districts (${localDistricts.length})`}
              </option>
              {localDistricts.map((dist) => (
                <option key={dist} value={dist}>
                  {dist}
                </option>
              ))}
            </select>
          </div>

          {/* Block Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-400" /> Block / Tehsil
            </label>
            <select
              value={localBlockFilter}
              onChange={(e) => {
                setLocalBlockFilter(e.target.value);
                setVisibleLocationLimit(250);
              }}
              disabled={!localDistrictFilter}
              className="h-9 px-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {!localDistrictFilter
                  ? "Select District first"
                  : `All Blocks (${localBlocks.length})`}
              </option>
              {localBlocks.map((blk) => (
                <option key={blk} value={blk}>
                  {blk}
                </option>
              ))}
            </select>
          </div>

          {/* Water Source Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-slate-400" /> Selected Water Source
            </label>
            <select
              value={activeSourceFilter}
              onChange={(e) => {
                setSelectedSourceFilter(e.target.value);
                setVisibleLocationLimit(250);
              }}
              disabled={!sourceColumn || summary.sources.length === 0}
              className="h-9 px-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
            >
              <option value="ALL">All Sources ({summary.sources.length})</option>
              <option value="OVERALL_ONLY">Combined Overall Only</option>
              {summary.sources.map((s) => (
                <option key={s.sourceName} value={s.sourceName}>
                  {s.sourceName} ({s.rowCount.toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Multi-Parameter Selector */}
        {summary.paramList.length > 0 && (
          <div className="pt-2.5 border-t border-slate-100 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-700">
                Select Parameters{" "}
                <span className="text-slate-400 font-normal tabular-nums">
                  ({activeParamCodes.length} of {summary.paramList.length} selected)
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAllParams}
                  className="text-indigo-600 hover:text-indigo-800 font-semibold whitespace-nowrap cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={handleSelectBisOnlyParams}
                  className="text-indigo-600 hover:text-indigo-800 font-semibold whitespace-nowrap cursor-pointer"
                >
                  BIS Limited Only
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={handleClearParams}
                  className="text-slate-500 hover:text-slate-800 font-semibold whitespace-nowrap cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {summary.paramList.map((p) => {
                const isSelected = activeParamSet.has(p.paramCode);
                return (
                  <button
                    key={p.paramCode}
                    type="button"
                    onClick={() => toggleParam(p.paramCode)}
                    title={`${p.paramName}${p.unit ? ` (${p.unit})` : ""} · BIS: ${p.permissibleLimitLabel}`}
                    className={`h-7 px-2.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-300 hover:border-slate-400 hover:text-slate-900"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 shrink-0" />}
                    <span>{p.paramCode}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* View Mode Switcher + Secondary Controls */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {/* Primary 3-Tab Sub-View Switcher */}
          <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveView("sourceSummary")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeView === "sourceSummary"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Source-Wise Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveView("stateSummary")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeView === "stateSummary"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              State-Wise Summary ({stateSummary.states.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveView("exceedingLocations")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeView === "exceedingLocations"
                  ? "bg-white text-rose-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Exceeding Locations ({exceedingLocations.length.toLocaleString()})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setVisibleLocationLimit(250);
                }}
                placeholder={
                  activeView === "exceedingLocations"
                    ? "Search state, district, block, location..."
                    : "Search parameter, state, source..."
                }
                className="h-8 pl-8 pr-3 w-56 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {activeView !== "exceedingLocations" ? (
              <>
                <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setGroupMode("byGroup")}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                      groupMode === "byGroup"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {activeView === "stateSummary" ? "By State" : "By Source"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupMode("byParam")}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                      groupMode === "byParam"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    By Parameter
                  </button>
                </div>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={includeOverallSection}
                    onChange={(e) => setIncludeOverallSection(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Combined Row</span>
                </label>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={onlyExceedances}
                    onChange={(e) => setOnlyExceedances(e.target.checked)}
                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Exceeding Only</span>
                </label>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="font-medium whitespace-nowrap">Min Exceeding:</span>
                  <select
                    value={minExceedCount}
                    onChange={(e) => {
                      setMinExceedCount(Number(e.target.value));
                      setVisibleLocationLimit(250);
                    }}
                    className="h-8 px-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value={1}>≥ 1 Parameter</option>
                    <option value={2}>≥ 2 Parameters</option>
                    <option value={3}>≥ 3 Parameters</option>
                    <option value={4}>≥ 4 Parameters</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => handleExportExcel("locations")}
                  disabled={isExporting || filteredExceedingLocations.length === 0}
                  className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Locations</span>
                </button>
              </>
            )}

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="whitespace-nowrap font-medium">Source Col:</span>
              <select
                value={sourceColumn}
                onChange={(e) => setSourceColumn(e.target.value)}
                className="h-8 px-2 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[160px]"
              >
                <option value="">-- Select Col --</option>
                {availableHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveResettableFilters && (
              <button
                type="button"
                onClick={() => {
                  setLocalStateFilter("");
                  setLocalDistrictFilter("");
                  setLocalBlockFilter("");
                  setSelectedSourceFilter("ALL");
                  setSelectedParamCodes(null);
                  setSearchQuery("");
                  setOnlyExceedances(false);
                  setMinExceedCount(1);
                  setVisibleLocationLimit(250);
                }}
                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compact 4-Metric KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200 bg-slate-50/40">
        <div className="px-5 py-3">
          <div className="text-[11px] font-medium text-slate-500">Samples ({activeSourceLabel})</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
            {stateSummary.totalFilteredRows.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1.5">
              / {totalRawCount.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="px-5 py-3">
          <div className="text-[11px] font-medium text-slate-500">States Covered</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
            {stateSummary.states.length}
            <span className="text-xs font-normal text-slate-400 ml-1.5">
              · {summary.sources.length} sources
            </span>
          </div>
        </div>
        <div className="px-5 py-3">
          <div className="text-[11px] font-medium text-slate-500">Selected Parameters</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
            {activeParamCodes.length}
            <span className="text-xs font-normal text-slate-400 ml-1.5">
              / {summary.paramList.length}
            </span>
          </div>
        </div>
        <div className="px-5 py-3">
          <div className="text-[11px] font-medium text-slate-500">Locations Above Permissible</div>
          <div
            className={`text-lg font-bold tabular-nums mt-0.5 ${
              exceedingLocations.length > 0 ? "text-rose-700" : "text-emerald-700"
            }`}
          >
            {exceedingLocations.length.toLocaleString()}
            {stateSummary.totalFilteredRows > 0 && (
              <span className="text-xs font-medium text-slate-500 ml-1.5">
                ({((exceedingLocations.length / stateSummary.totalFilteredRows) * 100).toFixed(1)}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Empty States */}
      {!sourceColumn ? (
        <div className="p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-800">No Source Column Mapped</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Select the column containing water source types (e.g., Bore Well, Dug Well, Hand Pump, Tube Well) from the{" "}
            <strong className="text-slate-700">Source Col</strong> dropdown above.
          </p>
        </div>
      ) : summary.paramList.length === 0 ? (
        <div className="p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-800">No Water Quality Parameters Detected</p>
          <p className="text-xs text-slate-500">
            Upload a dataset with numeric water quality columns to view source-wise and state-wise statistics.
          </p>
        </div>
      ) : activeParamCodes.length === 0 ? (
        <div className="p-10 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-800">No Parameters Selected</p>
          <p className="text-xs text-slate-500">
            Select one or more parameters from the parameter selector above to compute summaries and exceeding locations.
          </p>
          <button
            type="button"
            onClick={handleSelectAllParams}
            className="h-8 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            Select All Parameters
          </button>
        </div>
      ) : analyzedData.length === 0 ? (
        <div className="p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-800">No Samples Match Active Filters</p>
          <p className="text-xs text-slate-500">
            Clear or adjust the State, District, or Block filters above ({activeGeoLabel}).
          </p>
        </div>
      ) : activeView === "exceedingLocations" ? (
        /* VIEW 3: EXCEEDING LOCATIONS LIST WITH STATE / DISTRICT / BLOCK / LOCATION / SOURCE / COUNT / NAMES / VALUES & UNITS */
        <div className="flex flex-col">
          <div className="overflow-x-auto max-h-[660px] overflow-y-auto custom-scrollbar">
            <table className="w-full min-w-[1100px] border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-900 text-white">
                <tr>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-800 w-14">
                    Sl. No.
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap border-b border-slate-800">
                    State
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap border-b border-slate-800">
                    District
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap border-b border-slate-800">
                    Block
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap border-b border-slate-800">
                    Location
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap border-b border-slate-800">
                    Source
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-800">
                    No. Above Limit
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap border-b border-slate-800">
                    Parameter(s) Above Permissible Limit
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap border-b border-slate-800">
                    Values &amp; Units of Parameters
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredExceedingLocations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-slate-500 text-xs">
                      No locations exceed BIS permissible limits for the selected source ({activeSourceLabel}) and selected parameter(s).
                    </td>
                  </tr>
                ) : (
                  filteredExceedingLocations.slice(0, visibleLocationLimit).map((loc, idx) => (
                    <tr
                      key={`${loc.rowIndex}_${idx}`}
                      className="hover:bg-slate-50 transition-colors align-top"
                    >
                      <td className="px-3 py-2 text-right text-slate-500 tabular-nums border-b border-slate-100">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 text-slate-800 font-medium border-b border-slate-100 whitespace-nowrap">
                        {loc.state}
                      </td>
                      <td className="px-3 py-2 text-slate-700 border-b border-slate-100 whitespace-nowrap">
                        {loc.district}
                      </td>
                      <td className="px-3 py-2 text-slate-700 border-b border-slate-100 whitespace-nowrap">
                        {loc.block}
                      </td>
                      <td className="px-3 py-2 text-slate-900 font-semibold border-b border-slate-100">
                        {loc.location}
                      </td>
                      <td className="px-3 py-2 text-slate-700 border-b border-slate-100 whitespace-nowrap">
                        {loc.source}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-rose-700 bg-rose-50/40 tabular-nums border-b border-slate-100">
                        {loc.exceedingCount}
                      </td>
                      <td className="px-3 py-2 text-slate-800 font-medium border-b border-slate-100 min-w-[200px]">
                        {loc.exceedingParamNames}
                      </td>
                      <td className="px-3 py-2 text-slate-800 border-b border-slate-100 tabular-nums min-w-[260px]">
                        <div className="space-y-0.5">
                          {loc.exceedingDetails.map((d) => (
                            <div key={d.paramCode} className="text-[11px] leading-snug">
                              <span className="font-semibold text-slate-900">{d.paramCode}:</span>{" "}
                              <span className="font-semibold text-rose-700">
                                {d.formattedValue}
                                {d.unit ? ` ${d.unit}` : ""}
                              </span>{" "}
                              <span className="text-slate-400">({d.permissibleLimitLabel})</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredExceedingLocations.length > visibleLocationLimit && (
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-600 tabular-nums">
                Showing <strong>{visibleLocationLimit.toLocaleString()}</strong> of{" "}
                <strong>{filteredExceedingLocations.length.toLocaleString()}</strong> exceeding locations
                (Excel export always includes all matching locations).
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleLocationLimit((n) => n + 250)}
                  className="h-8 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold cursor-pointer"
                >
                  Load Next 250
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleLocationLimit(filteredExceedingLocations.length)}
                  className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
                >
                  Show All ({filteredExceedingLocations.length.toLocaleString()})
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* VIEW 1 (SOURCE-WISE SUMMARY) & VIEW 2 (STATE-WISE SUMMARY FOR SELECTED SOURCE & PARAMETERS) */
        <div className="flex flex-col">
          {/* ADDITIONAL TABLE INSIDE STATE-WISE SUMMARY: State | No. of Samples | No. of Locations Affected (>= 1 Param) | Name of Parameter(s) */}
          {activeView === "stateSummary" && (
            <div className="border-b-2 border-slate-200">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 tracking-tight">
                    State-Wise Affected Locations Summary (One or More Selected Parameters Above BIS Permissible Limit)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Source: <strong className="text-slate-700">{activeSourceLabel}</strong> · Counts each sample location once if one or more selected BIS-limited parameters exceed permissible limits.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleExportExcel("stateAffected")}
                  disabled={isExporting || filteredStateAffectedRows.length === 0}
                  className="h-8 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export State Affected Table</span>
                </button>
              </div>

              <div className="overflow-x-auto max-h-[380px] overflow-y-auto custom-scrollbar">
                <table className="w-full min-w-[820px] border-collapse text-xs">
                  <thead className="sticky top-0 z-20 bg-slate-800 text-white">
                    <tr>
                      <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-700 w-14">
                        Sl. No.
                      </th>
                      <th className="px-4 py-2.5 text-left font-semibold whitespace-nowrap border-b border-slate-700">
                        State
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-700">
                        No. of Samples
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-700">
                        No. of Locations Affected (≥ 1 Parameter)
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-700">
                        Affected (%)
                      </th>
                      <th className="px-4 py-2.5 text-left font-semibold whitespace-nowrap border-b border-slate-700">
                        Name of Parameter(s)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStateAffectedRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-500 text-xs">
                          No states match the current source, parameter, or search filter.
                        </td>
                      </tr>
                    ) : (
                      <>
                        {filteredStateAffectedRows.map((row, idx) => {
                          const hasAffected = row.affectedLocationsCount > 0;
                          return (
                            <tr key={row.stateName} className="hover:bg-slate-50 transition-colors align-top">
                              <td className="px-3 py-2 text-right text-slate-500 tabular-nums border-b border-slate-100">
                                {idx + 1}
                              </td>
                              <td className="px-4 py-2 font-semibold text-slate-900 whitespace-nowrap border-b border-slate-100">
                                {row.stateName}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums border-b border-slate-100">
                                {row.totalSamples.toLocaleString()}
                              </td>
                              <td
                                className={`px-3 py-2 text-right tabular-nums border-b border-slate-100 ${
                                  hasAffected
                                    ? "text-rose-700 font-bold bg-rose-50/50"
                                    : "text-emerald-700 font-medium"
                                }`}
                              >
                                {row.affectedLocationsCount.toLocaleString()}
                              </td>
                              <td
                                className={`px-3 py-2 text-right tabular-nums border-b border-slate-100 ${
                                  hasAffected
                                    ? "text-rose-700 font-semibold bg-rose-50/50"
                                    : "text-emerald-700 font-medium"
                                }`}
                              >
                                {row.affectedLocationsPct.toFixed(1)}%
                              </td>
                              <td className="px-4 py-2 text-slate-700 border-b border-slate-100">
                                {row.affectedParamBreakdown.length === 0 ? (
                                  <span className="text-slate-400">None</span>
                                ) : (
                                  <span>
                                    {row.affectedParamBreakdown.map((item, itemIdx) => (
                                      <React.Fragment key={item.paramCode}>
                                        {itemIdx > 0 && <span className="text-slate-400">, </span>}
                                        <span className="font-medium text-slate-900">
                                          {item.paramName !== item.paramCode
                                            ? `${item.paramName} (${item.paramCode})`
                                            : item.paramCode}
                                        </span>
                                        <span className="text-slate-500 tabular-nums ml-1">
                                          [{item.count.toLocaleString()}]
                                        </span>
                                      </React.Fragment>
                                    ))}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {includeOverallSection && stateAffectedSummary.overall.totalSamples > 0 && (
                          <tr className="bg-indigo-50/70 font-semibold">
                            <td className="px-3 py-2.5 text-right text-slate-500 border-t border-slate-200">
                              —
                            </td>
                            <td className="px-4 py-2.5 text-indigo-950 font-bold whitespace-nowrap border-t border-slate-200">
                              {stateAffectedSummary.overall.stateName}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-900 font-bold tabular-nums border-t border-slate-200">
                              {stateAffectedSummary.overall.totalSamples.toLocaleString()}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right font-bold tabular-nums border-t border-slate-200 ${
                                stateAffectedSummary.overall.affectedLocationsCount > 0
                                  ? "text-rose-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              {stateAffectedSummary.overall.affectedLocationsCount.toLocaleString()}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right font-bold tabular-nums border-t border-slate-200 ${
                                stateAffectedSummary.overall.affectedLocationsCount > 0
                                  ? "text-rose-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              {stateAffectedSummary.overall.affectedLocationsPct.toFixed(1)}%
                            </td>
                            <td className="px-4 py-2.5 text-slate-800 border-t border-slate-200">
                              {stateAffectedSummary.overall.affectedParamNames}
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeView === "stateSummary" && (
            <div className="px-5 py-2.5 bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-800">
              State-Wise × Selected Parameter Statistical Breakdown (Min, P05, P75, P99, Max &amp; Exceedances)
            </div>
          )}

          <div className="overflow-x-auto max-h-[680px] overflow-y-auto custom-scrollbar">
            <table className="w-full min-w-[980px] border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-900 text-white">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold whitespace-nowrap border-b border-slate-800">
                    {groupMode === "byGroup"
                      ? "Parameter (Unit · BIS Limit)"
                      : activeView === "stateSummary"
                        ? "State / UT"
                        : "Water Source"}
                  </th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-800">
                  Total Samples
                </th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-800">
                  Min
                </th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-800">
                  5th %ile (P05)
                </th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-800">
                  75th %ile (P75)
                </th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-800">
                  99th %ile (P99)
                </th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-800">
                  Max
                </th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-800">
                  Above Permissible (No.)
                </th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap border-b border-slate-800">
                  Above Permissible (%)
                </th>
              </tr>
            </thead>

            <tbody>
              {activeView === "sourceSummary" ? (
                groupMode === "byGroup" ? (
                  groupedBySource.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500 text-xs">
                        No source-parameter rows match your active selection or search filter.
                      </td>
                    </tr>
                  ) : (
                    groupedBySource.map((grp) => (
                      <React.Fragment key={grp.key}>
                        <tr className={grp.isOverall ? "bg-indigo-50/70" : "bg-slate-100/90"}>
                          <td
                            colSpan={9}
                            className="px-4 py-2 border-y border-slate-200 font-bold text-slate-900"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs tracking-tight">{grp.title}</span>
                              <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                                {grp.subtitle}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {grp.rows.map((r) => (
                          <tr
                            key={`${grp.key}_${r.paramCode}`}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="px-4 py-2 border-b border-slate-100">
                              <div className="font-semibold text-slate-900">
                                {r.paramName}
                                {r.paramCode !== r.paramName && (
                                  <span className="text-slate-400 font-normal ml-1.5">
                                    ({r.paramCode})
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {r.unit ? `${r.unit} · ` : ""}
                                BIS: {r.permissibleLimitLabel}
                              </div>
                            </td>
                            {renderStatCells(r)}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  )
                ) : groupedSourceByParam.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 text-xs">
                      No parameter rows match your active selection or search filter.
                    </td>
                  </tr>
                ) : (
                  groupedSourceByParam.map((grp) => (
                    <React.Fragment key={grp.key}>
                      <tr className="bg-slate-100/90">
                        <td
                          colSpan={9}
                          className="px-4 py-2 border-y border-slate-200 font-bold text-slate-900"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs tracking-tight">
                              {grp.paramName}
                              {grp.paramCode !== grp.paramName ? ` (${grp.paramCode})` : ""}
                              {grp.unit ? ` — ${grp.unit}` : ""}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">
                              BIS Permissible Limit: {grp.permissibleLimitLabel}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {grp.rows.map((r) => (
                        <tr
                          key={`${grp.key}_${r.sourceName}`}
                          className={
                            r.isOverall
                              ? "bg-indigo-50/40 hover:bg-indigo-50/70 transition-colors"
                              : "hover:bg-slate-50 transition-colors"
                          }
                        >
                          <td
                            className={`px-4 py-2 border-b border-slate-100 ${
                              r.isOverall ? "font-bold text-indigo-950" : "font-medium text-slate-800"
                            }`}
                          >
                            {r.sourceName}
                          </td>
                          {renderStatCells(r)}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )
              ) : groupMode === "byGroup" ? (
                groupedByState.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 text-xs">
                      No state-wise rows match the selected source ({activeSourceLabel}) and selected parameter(s).
                    </td>
                  </tr>
                ) : (
                  groupedByState.map((grp) => (
                    <React.Fragment key={grp.key}>
                      <tr className={grp.isOverall ? "bg-indigo-50/70" : "bg-slate-100/90"}>
                        <td
                          colSpan={9}
                          className="px-4 py-2 border-y border-slate-200 font-bold text-slate-900"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs tracking-tight">{grp.title}</span>
                            <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                              {grp.subtitle}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {grp.rows.map((r) => (
                        <tr
                          key={`${grp.key}_${r.paramCode}`}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-2 border-b border-slate-100">
                            <div className="font-semibold text-slate-900">
                              {r.paramName}
                              {r.paramCode !== r.paramName && (
                                <span className="text-slate-400 font-normal ml-1.5">
                                  ({r.paramCode})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {r.unit ? `${r.unit} · ` : ""}
                              BIS: {r.permissibleLimitLabel}
                            </div>
                          </td>
                          {renderStatCells(r)}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )
              ) : groupedStateByParam.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 text-xs">
                    No state-wise parameter rows match your active selection or search filter.
                  </td>
                </tr>
              ) : (
                groupedStateByParam.map((grp) => (
                  <React.Fragment key={grp.key}>
                    <tr className="bg-slate-100/90">
                      <td
                        colSpan={9}
                        className="px-4 py-2 border-y border-slate-200 font-bold text-slate-900"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs tracking-tight">
                            {grp.paramName}
                            {grp.paramCode !== grp.paramName ? ` (${grp.paramCode})` : ""}
                            {grp.unit ? ` — ${grp.unit}` : ""}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            Source: {activeSourceLabel} · BIS Limit: {grp.permissibleLimitLabel}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {grp.rows.map((r) => (
                      <tr
                        key={`${grp.key}_${r.stateName}`}
                        className={
                          r.isOverall
                            ? "bg-indigo-50/40 hover:bg-indigo-50/70 transition-colors"
                            : "hover:bg-slate-50 transition-colors"
                        }
                      >
                        <td
                          className={`px-4 py-2 border-b border-slate-100 ${
                            r.isOverall ? "font-bold text-indigo-950" : "font-medium text-slate-800"
                          }`}
                        >
                          {r.stateName}
                        </td>
                        {renderStatCells(r)}
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Footer Footnote */}
      <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          Active Scope: <strong className="text-slate-700">{activeSourceLabel}</strong> ·{" "}
          <strong className="text-slate-700">{activeGeoLabel}</strong>
        </span>
        <span>
          BIS:10500 permissible limits applied (pH outside 6.5–8.5; others &gt; permissible limit; no-BIS-limit parameters excluded from exceedances).
        </span>
      </div>
    </div>
  );
}
