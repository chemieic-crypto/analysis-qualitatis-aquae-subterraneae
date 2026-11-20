import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import L from "leaflet";
import * as XLSX from "xlsx";
import shp from "shpjs";
import JSZip from "jszip";
import {
  GitMerge,
  Plus,
  Trash2,
  UploadCloud,
  Download,
  RefreshCw,
  Map as MapIcon,
  Table2,
  BarChart3,
  Eye,
  EyeOff,
  Ruler,
  Grid,
  PieChart,
  ChevronDown,
  ChevronUp,
  Search,
  Database,
  Sparkles,
  X,
  Scissors,
  Play,
} from "lucide-react";
import { ShapefileLayer } from "../types";
import {
  validateSpreadsheetFile,
  validateParsedSpreadsheetRows,
  extractSpreadsheetHeaders,
} from "../utils/spreadsheetImport";
import { downloadStyledSheetJSWorkbook, ensureSheetJSNumbers } from "../utils/excelFormatter";
import { fastHaversineKm } from "../utils/sectorAnalysisEngine";
import {
  type MergeMode,
  type JoinKeyRule,
  type HydroMergeResult,
  type AreaStatSummary,
  type AreaDetailedRow,
  autoSuggestJoinKeyPairs,
  detectCoordinateColumns,
  parseGeoCoord,
  getFeatureDisplayName,
  executeMultiSheetMerge,
  computeRegionalAreaStats,
  generateHydroGridAnalysis,
} from "../utils/hydroMergeEngine";

interface SheetWorkbookCache {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
  activeSheetName: string;
}

interface SecondarySheetState {
  id: string;
  label: string;
  fileName: string;
  headers: string[];
  rows: Record<string, any>[];
  selectedColumns: string[];
  joinKeys: JoinKeyRule[];
  isExpanded: boolean;
  showColumns: boolean;
  colFilter: string;
  workbookCache?: SheetWorkbookCache | null;
}

export interface HydroMergeViewProps {
  mainAppData?: Record<string, any>[];
  mainAppHeaders?: string[];
  sharedLayers?: ShapefileLayer[];
  setSharedLayers?: React.Dispatch<React.SetStateAction<ShapefileLayer[]>>;
  isVisible: boolean;
  showToast?: (msg: string, type?: "success" | "warning" | "error") => void;
}

type StageViewMode = "matrix" | "map" | "analytics";
type BasemapId = "esriPhysical" | "esriTerrain" | "hybrid" | "satellite";

const SHEET_MINERAL_THEMES = [
  {
    headerBg: "bg-indigo-50/75",
    border: "border-indigo-200",
    badge: "bg-indigo-600 text-white",
    accentText: "text-indigo-700",
    subBg: "bg-indigo-50/45",
  },
  {
    headerBg: "bg-emerald-50/75",
    border: "border-emerald-200",
    badge: "bg-emerald-600 text-white",
    accentText: "text-emerald-700",
    subBg: "bg-emerald-50/45",
  },
  {
    headerBg: "bg-amber-50/75",
    border: "border-amber-200",
    badge: "bg-amber-600 text-white",
    accentText: "text-amber-700",
    subBg: "bg-amber-50/45",
  },
  {
    headerBg: "bg-sky-50/75",
    border: "border-sky-200",
    badge: "bg-sky-700 text-white",
    accentText: "text-sky-700",
    subBg: "bg-sky-50/45",
  },
  {
    headerBg: "bg-violet-50/75",
    border: "border-violet-200",
    badge: "bg-violet-600 text-white",
    accentText: "text-violet-700",
    subBg: "bg-violet-50/45",
  },
  {
    headerBg: "bg-rose-50/75",
    border: "border-rose-200",
    badge: "bg-rose-600 text-white",
    accentText: "text-rose-700",
    subBg: "bg-rose-50/45",
  },
];

const ATTR_PALETTE = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#ea580c",
  "#4f46e5",
  "#65a30d",
  "#0284c7",
  "#e11d48",
];

function createEmptySecondarySheet(index: number): SecondarySheetState {
  const suffix = String.fromCharCode(65 + (index % 26)); // A, B, C...
  return {
    id: `sec_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    label: `Sheet ${suffix}`,
    fileName: "",
    headers: [],
    rows: [],
    selectedColumns: [],
    joinKeys: [
      {
        id: `jk_${Date.now()}_${index}`,
        mainColumn: "",
        targetColumn: "",
        prefixLength: 0,
      },
    ],
    isExpanded: true,
    showColumns: false,
    colFilter: "",
    workbookCache: null,
  };
}

function sanitizeSheetTabName(name: string, fallback: string): string {
  const cleaned = (name || fallback).replace(/[\\/*?:[\]]/g, "_").trim();
  return (cleaned || fallback).slice(0, 31);
}

export default function HydroMergeView({
  mainAppData = [],
  mainAppHeaders = [],
  sharedLayers = [],
  setSharedLayers,
  isVisible,
  showToast,
}: HydroMergeViewProps) {
  // ---------------- MAIN SHEET STATE ----------------
  const [mainLabel, setMainLabel] = useState<string>("Main Sheet");
  const [mainFileName, setMainFileName] = useState<string>("");
  const [mainHeaders, setMainHeaders] = useState<string[]>([]);
  const [mainRows, setMainRows] = useState<Record<string, any>[]>([]);
  const [mainSelectedCols, setMainSelectedCols] = useState<string[]>([]);
  const [mainWorkbookCache, setMainWorkbookCache] = useState<SheetWorkbookCache | null>(null);
  const [mainExpanded, setMainExpanded] = useState<boolean>(true);
  const [mainShowCols, setMainShowCols] = useState<boolean>(false);
  const [mainColFilter, setMainColFilter] = useState<string>("");
  const [mainSyncedFromApp, setMainSyncedFromApp] = useState<boolean>(false);

  // ---------------- SECONDARY SHEETS STATE (Multi-sheet: default 2 comparison sheets) ----------------
  const [secondarySheets, setSecondarySheets] = useState<SecondarySheetState[]>(() => [
    createEmptySecondarySheet(0),
    createEmptySecondarySheet(1),
  ]);

  // ---------------- MERGE SETTINGS & RESULT ----------------
  const [mergeMode, setMergeMode] = useState<MergeMode>("enrich_main");
  const [includeStatusColumns, setIncludeStatusColumns] = useState<boolean>(true);
  const [exportFileName, setExportFileName] = useState<string>("HydroMerge_Output");
  const [mergeResult, setMergeResult] = useState<HydroMergeResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    text: string;
    tone: "neutral" | "success" | "error" | "info";
  } | null>(null);

  // ---------------- STAGE VIEW & TABLE FILTERS ----------------
  const [stageMode, setStageMode] = useState<StageViewMode>("matrix");
  const [matrixFilter, setMatrixFilter] = useState<string>("all");
  const [matrixSearch, setMatrixSearch] = useState<string>("");
  const [matrixPage, setMatrixPage] = useState<number>(1);
  const PAGE_SIZE = 50;

  // ---------------- SPATIAL MAP STATE ----------------
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const markerGroupRef = useRef<L.FeatureGroup | null>(null);
  const measureGroupRef = useRef<L.FeatureGroup | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const gridLayerRef = useRef<L.GeoJSON | null>(null);
  const basemapLayerRef = useRef<L.TileLayer | null>(null);

  const [basemapId, setBasemapId] = useState<BasemapId>("esriPhysical");
  const [colorFull, setColorFull] = useState<string>("#10b981");
  const [colorPartial, setColorPartial] = useState<string>("#f59e0b");
  const [colorUnmatched, setColorUnmatched] = useState<string>("#f43f5e");
  const [markerRadius, setMarkerRadius] = useState<number>(6);

  const [localLayers, setLocalLayers] = useState<ShapefileLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>("");
  const [isShapeVisible, setIsShapeVisible] = useState<boolean>(true);
  const [shapeColorMode, setShapeColorMode] = useState<"single" | "attribute">("single");
  const [shapeSingleColor, setShapeSingleColor] = useState<string>("#94a3b8");
  const [selectedFeatureName, setSelectedFeatureName] = useState<string>("");

  const [isMeasureMode, setIsMeasureMode] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);
  const [measuredDistanceLabel, setMeasuredDistanceLabel] = useState<string>("");

  const [gridAreaSqKm, setGridAreaSqKm] = useState<number>(100);
  const [gridSummary, setGridSummary] = useState<{
    emptyCount: number;
    occupiedCount: number;
    totalCells: number;
  } | null>(null);

  const [showAreaStatsModal, setShowAreaStatsModal] = useState<boolean>(false);
  const [areaStatsLoading, setAreaStatsLoading] = useState<boolean>(false);
  const [areaSummaries, setAreaSummaries] = useState<AreaStatSummary[]>([]);
  const [areaDetailedRows, setAreaDetailedRows] = useState<AreaDetailedRow[]>([]);

  const notify = useCallback(
    (text: string, tone: "neutral" | "success" | "error" | "info" = "info") => {
      setStatusBanner({ text, tone });
      if (showToast && (tone === "success" || tone === "error")) {
        showToast(text, tone === "error" ? "error" : "success");
      }
    },
    [showToast]
  );

  // Sync main sheet automatically once if app already has loaded data and Main Sheet is empty
  const handleSyncFromMainApp = useCallback(() => {
    if (!mainAppData || mainAppData.length === 0) {
      notify("No primary workbook is currently loaded in the main app.", "error");
      return;
    }
    const derivedHeaders =
      mainAppHeaders && mainAppHeaders.length > 0
        ? mainAppHeaders.filter((h) => h && !String(h).startsWith("__EMPTY"))
        : Object.keys(mainAppData[0] || {}).filter((h) => h && !h.startsWith("__EMPTY"));

    setMainLabel("App Dataset");
    setMainFileName("Active App Workbook");
    setMainHeaders(derivedHeaders);
    setMainRows(mainAppData);
    setMainSelectedCols([...derivedHeaders]);
    setMainWorkbookCache(null);
    setMainSyncedFromApp(true);

    // Re-suggest join keys on comparison sheets that already have headers loaded
    setSecondarySheets((prev) =>
      prev.map((sec) => {
        if (sec.headers.length === 0) return sec;
        const hasValidRule = sec.joinKeys.some(
          (jk) => derivedHeaders.includes(jk.mainColumn) && sec.headers.includes(jk.targetColumn)
        );
        return hasValidRule
          ? sec
          : { ...sec, joinKeys: autoSuggestJoinKeyPairs(derivedHeaders, sec.headers) };
      })
    );

    notify(`Loaded ${mainAppData.length.toLocaleString()} rows from Active App Workbook.`, "success");
  }, [mainAppData, mainAppHeaders, notify]);

  // Auto-populate main sheet from app dataset on first open if mainRows is empty
  useEffect(() => {
    if (isVisible && mainRows.length === 0 && mainAppData.length > 0 && !mainSyncedFromApp) {
      handleSyncFromMainApp();
    }
  }, [isVisible, mainRows.length, mainAppData.length, mainSyncedFromApp, handleSyncFromMainApp]);

  // ---------------- SPREADSHEET PARSING ----------------
  const parseSpreadsheetFile = async (
    file: File
  ): Promise<{
    workbook: XLSX.WorkBook;
    sheetName: string;
    headers: string[];
    rows: Record<string, any>[];
  } | null> => {
    const fileCheck = validateSpreadsheetFile({ name: file.name, size: file.size });
    if ("error" in fileCheck) {
      notify(fileCheck.error, "error");
      return null;
    }

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      notify("Spreadsheet contains no worksheets.", "error");
      return null;
    }

    const firstSheetName = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheetName];
    const parsedRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
    const rowCheck = validateParsedSpreadsheetRows(parsedRows);
    if ("error" in rowCheck) {
      notify(rowCheck.error, "error");
      return null;
    }

    const headers = extractSpreadsheetHeaders(ws, parsedRows);
    return { workbook: wb, sheetName: firstSheetName, headers, rows: parsedRows };
  };

  const handleMainFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      notify(`Parsing ${file.name}...`, "info");
      const parsed = await parseSpreadsheetFile(file);
      if (!parsed) return;

      const baseLabel = file.name.replace(/\.(xlsx|xls|csv)$/i, "").slice(0, 24) || "Main Sheet";
      setMainLabel(baseLabel);
      setMainFileName(file.name);
      setMainHeaders(parsed.headers);
      setMainRows(parsed.rows);
      setMainSelectedCols([...parsed.headers]);
      setMainSyncedFromApp(false);
      setMainWorkbookCache(
        parsed.workbook.SheetNames.length > 1
          ? {
              workbook: parsed.workbook,
              sheetNames: parsed.workbook.SheetNames,
              activeSheetName: parsed.sheetName,
            }
          : null
      );

      setSecondarySheets((prev) =>
        prev.map((sec) =>
          sec.headers.length > 0
            ? { ...sec, joinKeys: autoSuggestJoinKeyPairs(parsed.headers, sec.headers) }
            : sec
        )
      );

      notify(`Main Sheet loaded: ${parsed.rows.length.toLocaleString()} rows, ${parsed.headers.length} columns.`, "success");
    } catch (err) {
      console.error(err);
      notify("Failed to read Main Sheet file.", "error");
    }
  };

  const handleSwitchMainWorksheetTab = (sheetName: string) => {
    if (!mainWorkbookCache) return;
    const ws = mainWorkbookCache.workbook.Sheets[sheetName];
    if (!ws) return;
    const parsedRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
    const rowCheck = validateParsedSpreadsheetRows(parsedRows);
    if ("error" in rowCheck) {
      notify(rowCheck.error, "error");
      return;
    }
    const headers = extractSpreadsheetHeaders(ws, parsedRows);
    setMainHeaders(headers);
    setMainRows(parsedRows);
    setMainSelectedCols([...headers]);
    setMainWorkbookCache({ ...mainWorkbookCache, activeSheetName: sheetName });
    setSecondarySheets((prev) =>
      prev.map((sec) =>
        sec.headers.length > 0
          ? { ...sec, joinKeys: autoSuggestJoinKeyPairs(headers, sec.headers) }
          : sec
      )
    );
    notify(`Main Sheet tab '${sheetName}': ${parsedRows.length.toLocaleString()} rows.`, "success");
  };

  const handleSecondaryFileUpload = async (
    sheetId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      notify(`Parsing ${file.name}...`, "info");
      const parsed = await parseSpreadsheetFile(file);
      if (!parsed) return;

      const suggestedName = file.name.replace(/\.(xlsx|xls|csv)$/i, "").slice(0, 22);
      setSecondarySheets((prev) =>
        prev.map((sec) => {
          if (sec.id !== sheetId) return sec;
          const joinKeys =
            mainHeaders.length > 0
              ? autoSuggestJoinKeyPairs(mainHeaders, parsed.headers)
              : [
                  {
                    id: `jk_${Date.now()}`,
                    mainColumn: "",
                    targetColumn: parsed.headers[0] || "",
                    prefixLength: 0,
                  },
                ];
          return {
            ...sec,
            label: suggestedName || sec.label,
            fileName: file.name,
            headers: parsed.headers,
            rows: parsed.rows,
            selectedColumns: [...parsed.headers],
            joinKeys,
            isExpanded: true,
            workbookCache:
              parsed.workbook.SheetNames.length > 1
                ? {
                    workbook: parsed.workbook,
                    sheetNames: parsed.workbook.SheetNames,
                    activeSheetName: parsed.sheetName,
                  }
                : null,
          };
        })
      );

      notify(`${file.name} loaded: ${parsed.rows.length.toLocaleString()} rows.`, "success");
    } catch (err) {
      console.error(err);
      notify("Failed to read comparison file.", "error");
    }
  };

  const handleSwitchSecondaryWorksheetTab = (sheetId: string, sheetName: string) => {
    setSecondarySheets((prev) =>
      prev.map((sec) => {
        if (sec.id !== sheetId || !sec.workbookCache) return sec;
        const ws = sec.workbookCache.workbook.Sheets[sheetName];
        if (!ws) return sec;
        const parsedRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
        const rowCheck = validateParsedSpreadsheetRows(parsedRows);
        if ("error" in rowCheck) {
          notify(rowCheck.error, "error");
          return sec;
        }
        const headers = extractSpreadsheetHeaders(ws, parsedRows);
        return {
          ...sec,
          headers,
          rows: parsedRows,
          selectedColumns: [...headers],
          joinKeys:
            mainHeaders.length > 0
              ? autoSuggestJoinKeyPairs(mainHeaders, headers)
              : sec.joinKeys,
          workbookCache: { ...sec.workbookCache, activeSheetName: sheetName },
        };
      })
    );
  };

  // ---------------- SECONDARY SHEET CRUD ----------------
  const addSecondarySheet = () => {
    setSecondarySheets((prev) => [...prev, createEmptySecondarySheet(prev.length)]);
  };

  const removeSecondarySheet = (sheetId: string) => {
    setSecondarySheets((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== sheetId)));
  };

  const updateSecondarySheet = (
    sheetId: string,
    updater: (prev: SecondarySheetState) => SecondarySheetState
  ) => {
    setSecondarySheets((prev) => prev.map((s) => (s.id === sheetId ? updater(s) : s)));
  };

  const addJoinKey = (sheetId: string) => {
    updateSecondarySheet(sheetId, (s) => ({
      ...s,
      joinKeys: [
        ...s.joinKeys,
        {
          id: `jk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          mainColumn: "",
          targetColumn: "",
          prefixLength: 0,
        },
      ],
    }));
  };

  const removeJoinKey = (sheetId: string, keyId: string) => {
    updateSecondarySheet(sheetId, (s) => ({
      ...s,
      joinKeys: s.joinKeys.length > 1 ? s.joinKeys.filter((k) => k.id !== keyId) : s.joinKeys,
    }));
  };

  const updateJoinKey = (sheetId: string, keyId: string, patch: Partial<JoinKeyRule>) => {
    updateSecondarySheet(sheetId, (s) => ({
      ...s,
      joinKeys: s.joinKeys.map((k) => (k.id === keyId ? { ...k, ...patch } : k)),
    }));
  };

  // ---------------- EXECUTE MULTI-SHEET MERGE ----------------
  const readySecondarySheets = useMemo(
    () =>
      secondarySheets.filter(
        (s) => s.rows.length > 0 && s.joinKeys.some((jk) => jk.mainColumn && jk.targetColumn)
      ),
    [secondarySheets]
  );

  const handleRunMerge = () => {
    if (mainRows.length === 0) {
      notify("Load or sync the Main Sheet first.", "error");
      return;
    }
    if (readySecondarySheets.length === 0) {
      notify("Upload at least one comparison sheet and select valid Join Key columns.", "error");
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      try {
        const result = executeMultiSheetMerge(
          {
            label: mainLabel,
            headers: mainHeaders,
            rows: mainRows,
            selectedColumns: mainSelectedCols,
          },
          readySecondarySheets.map((s) => ({
            id: s.id,
            label: s.label,
            headers: s.headers,
            rows: s.rows,
            joinKeys: s.joinKeys,
            selectedColumns: s.selectedColumns,
          })),
          {
            mode: mergeMode,
            includeStatusColumns,
          }
        );

        setMergeResult(result);
        setMatrixFilter("all");
        setMatrixSearch("");
        setMatrixPage(1);

        const partialMsg =
          result.partiallyMatchedRows.length > 0
            ? `, ${result.partiallyMatchedRows.length.toLocaleString()} partial`
            : "";
        notify(
          `Reconciled ${result.mainTotalRows.toLocaleString()} main rows against ${result.sheetSummaries.length} sheet(s) in ${result.executionMs} ms: ${result.fullyMatchedRows.length.toLocaleString()} full match${partialMsg}.`,
          "success"
        );
      } catch (err: any) {
        notify(err?.message || "Failed to merge datasets.", "error");
      } finally {
        setIsProcessing(false);
      }
    }, 10);
  };

  const handleReset = () => {
    setMainLabel("Main Sheet");
    setMainFileName("");
    setMainHeaders([]);
    setMainRows([]);
    setMainSelectedCols([]);
    setMainWorkbookCache(null);
    setMainSyncedFromApp(false);
    setSecondarySheets([createEmptySecondarySheet(0), createEmptySecondarySheet(1)]);
    setMergeResult(null);
    setStatusBanner(null);
    setGridSummary(null);
    setAreaSummaries([]);
    setAreaDetailedRows([]);
    setSelectedFeatureName("");
    setIsMeasureMode(false);
    setMeasurePoints([]);
    setMeasuredDistanceLabel("");
    if (markerGroupRef.current) markerGroupRef.current.clearLayers();
    if (measureGroupRef.current) measureGroupRef.current.clearLayers();
    if (gridLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(gridLayerRef.current);
      gridLayerRef.current = null;
    }
  };

  // ---------------- EXPORT WORKBOOK (.XLSX) ----------------
  const handleExportWorkbook = () => {
    if (!mergeResult) return;
    const wb = XLSX.utils.book_new();
    const usedTabs = new Set<string>();

    const appendSheet = (rows: Record<string, any>[], desiredName: string) => {
      if (!rows || rows.length === 0) return;
      let tabName = sanitizeSheetTabName(desiredName, "Sheet");
      let n = 2;
      while (usedTabs.has(tabName)) {
        tabName = sanitizeSheetTabName(`${desiredName.slice(0, 26)}_${n}`, `Sheet_${n}`);
        n++;
      }
      usedTabs.add(tabName);
      const ws = XLSX.utils.json_to_sheet(rows);
      ensureSheetJSNumbers(ws, 1);
      XLSX.utils.book_append_sheet(wb, ws, tabName);
    };

    // 1. Summary tab
    const summaryRows = [
      {
        Role: "Main Sheet",
        "Sheet Name": mergeResult.mainLabel,
        "Total Rows": mergeResult.mainTotalRows,
        "Full Matches (All Sheets)": mergeResult.fullyMatchedRows.length,
        "Partial Matches": mergeResult.partiallyMatchedRows.length,
        Unmatched: mergeResult.unmatchedMainRows.length,
        "Missing Keys": mergeResult.mainMissingKeyRows.length,
        "Match Rate (%)":
          mergeResult.mainTotalRows > 0
            ? Math.round(
                ((mergeResult.fullyMatchedRows.length + mergeResult.partiallyMatchedRows.length) /
                  Math.max(1, mergeResult.mainTotalRows - mergeResult.mainMissingKeyRows.length)) *
                  1000
              ) / 10
            : 0,
      },
      ...mergeResult.sheetSummaries.map((s) => ({
        Role: "Comparison Sheet",
        "Sheet Name": s.label,
        "Total Rows": s.totalRows,
        "Full Matches (All Sheets)": s.matchedCount,
        "Partial Matches": 0,
        Unmatched: s.unmatchedCount,
        "Missing Keys": s.missingKeyCount,
        "Match Rate (%)": s.matchRatePct,
      })),
    ];
    appendSheet(summaryRows, "Reconciliation_Summary");

    // 2. Merged output
    appendSheet(mergeResult.exportedMergedRows, "Merged_Master");

    // 3. Unmatched Main & Missing Keys Main
    if (mergeResult.unmatchedMainRows.length > 0) {
      appendSheet(
        mergeResult.unmatchedMainRows.map((r) => r.data),
        "Unmatched_Main"
      );
    }
    if (mergeResult.mainMissingKeyRows.length > 0) {
      appendSheet(mergeResult.mainMissingKeyRows, "Missing_Keys_Main");
    }

    // 4. Per-sheet unmatched & missing
    for (const s of mergeResult.sheetSummaries) {
      if (s.unmatchedRows.length > 0) {
        appendSheet(s.unmatchedRows, `Unmatched_${s.label}`);
      }
      if (s.missingKeyRows.length > 0) {
        appendSheet(s.missingKeyRows, `MissingKeys_${s.label}`);
      }
    }

    // 5. Optional Regional Area Stats if computed
    if (areaDetailedRows.length > 0) {
      appendSheet(areaDetailedRows, "Regional_Area_Stats");
    }

    const safeName = (exportFileName || "HydroMerge_Output").trim().replace(/\.xlsx$/i, "");
    void downloadStyledSheetJSWorkbook(wb, `${safeName}.xlsx`)
      .then(() => notify(`Exported ${safeName}.xlsx (${usedTabs.size} sheets).`, "success"))
      .catch((err) => {
        console.error("HydroMerge Excel export error:", err);
        notify("Failed to generate styled Excel workbook.", "error");
      });
  };

  // ---------------- MATRIX DATA FILTERING & PAGINATION ----------------
  const matrixDataset = useMemo(() => {
    if (!mergeResult) return { headers: [] as string[], rows: [] as Record<string, any>[] };

    let rows: Record<string, any>[] = [];
    let headers: string[] = mergeResult.mergedHeaders;

    if (matrixFilter === "all") {
      rows = [
        ...mergeResult.fullyMatchedRows.map((r) => r.data),
        ...mergeResult.partiallyMatchedRows.map((r) => r.data),
        ...mergeResult.unmatchedMainRows.map((r) => r.data),
      ];
    } else if (matrixFilter === "full") {
      rows = mergeResult.fullyMatchedRows.map((r) => r.data);
    } else if (matrixFilter === "partial") {
      rows = mergeResult.partiallyMatchedRows.map((r) => r.data);
    } else if (matrixFilter === "unmatched_main") {
      rows = mergeResult.unmatchedMainRows.map((r) => r.data);
    } else if (matrixFilter === "missing_main") {
      rows = mergeResult.mainMissingKeyRows;
      headers = mainHeaders;
    } else if (matrixFilter.startsWith("unmatched_sec::")) {
      const id = matrixFilter.replace("unmatched_sec::", "");
      const secSum = mergeResult.sheetSummaries.find((s) => s.sheetId === id);
      const secOrig = secondarySheets.find((s) => s.id === id);
      rows = secSum?.unmatchedRows || [];
      headers = secOrig?.headers || (rows[0] ? Object.keys(rows[0]) : []);
    } else if (matrixFilter.startsWith("missing_sec::")) {
      const id = matrixFilter.replace("missing_sec::", "");
      const secSum = mergeResult.sheetSummaries.find((s) => s.sheetId === id);
      const secOrig = secondarySheets.find((s) => s.id === id);
      rows = secSum?.missingKeyRows || [];
      headers = secOrig?.headers || (rows[0] ? Object.keys(rows[0]) : []);
    }

    const q = matrixSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) =>
        headers.some((h) => {
          const val = row[h];
          return val !== undefined && val !== null && String(val).toLowerCase().includes(q);
        })
      );
    }

    return { headers, rows };
  }, [mergeResult, matrixFilter, matrixSearch, mainHeaders, secondarySheets]);

  const totalPages = Math.max(1, Math.ceil(matrixDataset.rows.length / PAGE_SIZE));
  const clampedPage = Math.min(matrixPage, totalPages);
  const pagedRows = useMemo(
    () => matrixDataset.rows.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE),
    [matrixDataset.rows, clampedPage]
  );

  // ---------------- COMBINED SHAPEFILE LAYERS (App Shared + Locally Uploaded) ----------------
  const allAvailableLayers = useMemo(() => {
    const map = new Map<string, ShapefileLayer>();
    for (const l of sharedLayers) map.set(l.id, l);
    for (const l of localLayers) map.set(l.id, l);
    return Array.from(map.values());
  }, [sharedLayers, localLayers]);

  const activeLayer = useMemo(
    () => allAvailableLayers.find((l) => l.id === activeLayerId) || null,
    [allAvailableLayers, activeLayerId]
  );

  const featureNamesInActiveLayer = useMemo(() => {
    if (!activeLayer?.geoJson?.features) return [];
    const set = new Set<string>();
    for (const feat of activeLayer.geoJson.features) {
      const name = getFeatureDisplayName(feat.properties);
      if (name && name !== "Unknown Area") set.add(name);
    }
    return Array.from(set).sort();
  }, [activeLayer]);

  const attrColorMap = useMemo(() => {
    const map = new Map<string, string>();
    featureNamesInActiveLayer.forEach((name, idx) => {
      map.set(name, ATTR_PALETTE[idx % ATTR_PALETTE.length]);
    });
    return map;
  }, [featureNamesInActiveLayer]);

  const handleShapefileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      notify("Parsing shapefile boundary layer...", "info");
      const zip = new JSZip();
      let hasShp = false;
      let shpName = `Boundary_${allAvailableLayers.length + 1}`;
      let directZipBuffer: ArrayBuffer | null = null;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const lower = f.name.toLowerCase();
        if (lower.endsWith(".zip")) {
          hasShp = true;
          shpName = f.name.replace(/\.zip$/i, "");
          directZipBuffer = await f.arrayBuffer();
          break;
        }
        if (lower.endsWith(".xml")) continue;
        if (lower.endsWith(".shp")) {
          hasShp = true;
          shpName = f.name.replace(/\.shp$/i, "");
        }
        zip.file(f.name, await f.arrayBuffer());
      }

      if (!hasShp) {
        notify("Please select a .zip archive or a .shp file (alongside .dbf/.shx).", "error");
        e.target.value = "";
        return;
      }

      const buf = directZipBuffer || (await zip.generateAsync({ type: "arraybuffer" }));
      let parsedGeoJson: any = await shp(buf);
      if (Array.isArray(parsedGeoJson)) parsedGeoJson = parsedGeoJson[0];

      const newLayer: ShapefileLayer = {
        id: `hm_shp_${Date.now()}`,
        name: shpName,
        geoJson: parsedGeoJson,
        visible: true,
        strokeColor: "#64748b",
        strokeWidth: 1.5,
        fillColor: shapeSingleColor,
        fillOpacity: 0.3,
        showLabels: false,
        labelKey: "",
        labelColor: "#1e293b",
        labelSize: 11,
      };

      setLocalLayers((prev) => [...prev, newLayer]);
      if (setSharedLayers) {
        setSharedLayers((prev) => [...prev, newLayer]);
      }
      setActiveLayerId(newLayer.id);
      setSelectedFeatureName("");
      setIsShapeVisible(true);
      notify(`Loaded boundary layer '${shpName}'.`, "success");
    } catch (err) {
      console.error(err);
      notify("Error parsing shapefile.", "error");
    } finally {
      e.target.value = "";
    }
  };

  // ---------------- LEAFLET MAP INITIALIZATION ----------------
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      preferCanvas: true,
    }).setView([22.5, 79.0], 5);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    const renderer = L.canvas({ padding: 0.5 });
    canvasRendererRef.current = renderer;
    markerGroupRef.current = L.featureGroup().addTo(map);
    measureGroupRef.current = L.featureGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerGroupRef.current = null;
      measureGroupRef.current = null;
      geoJsonLayerRef.current = null;
      gridLayerRef.current = null;
      basemapLayerRef.current = null;
    };
  }, []);

  // Re-measure Leaflet viewport whenever tab becomes visible or stageMode switches to map
  useEffect(() => {
    if (isVisible && stageMode === "map" && mapInstanceRef.current) {
      const id = window.setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 80);
      return () => window.clearTimeout(id);
    }
  }, [isVisible, stageMode]);

  // Basemap switching
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (basemapLayerRef.current) {
      map.removeLayer(basemapLayerRef.current);
    }

    const basemapUrls: Record<BasemapId, { url: string; options: L.TileLayerOptions }> = {
      esriPhysical: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
        options: { attribution: "&copy; Esri World Physical", maxNativeZoom: 8, maxZoom: 18 },
      },
      esriTerrain: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
        options: { attribution: "&copy; Esri World Terrain", maxNativeZoom: 13, maxZoom: 18 },
      },
      hybrid: {
        url: "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        options: { subdomains: ["mt0", "mt1", "mt2", "mt3"], maxZoom: 20 },
      },
      satellite: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        options: { attribution: "&copy; Esri World Imagery", maxNativeZoom: 18, maxZoom: 19 },
      },
    };

    const spec = basemapUrls[basemapId] || basemapUrls.esriPhysical;
    const layer = L.tileLayer(spec.url, spec.options).addTo(map);
    layer.bringToBack();
    basemapLayerRef.current = layer;
  }, [basemapId]);

  // Measure tool map click handler
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const container = map.getContainer();
    if (isMeasureMode) {
      container.style.cursor = "crosshair";
    } else {
      container.style.cursor = "";
    }

    const onClick = (e: L.LeafletMouseEvent) => {
      if (!isMeasureMode || !measureGroupRef.current) return;
      const mg = measureGroupRef.current;

      setMeasurePoints((prev) => {
        const nextPts = prev.length >= 2 ? [e.latlng] : [...prev, e.latlng];
        mg.clearLayers();

        nextPts.forEach((pt) => {
          L.circleMarker(pt, {
            radius: 6,
            color: "#be123c",
            fillColor: "#f43f5e",
            fillOpacity: 1,
            weight: 2,
          }).addTo(mg);
        });

        if (nextPts.length === 2) {
          const [p1, p2] = nextPts;
          const line = L.polyline([p1, p2], {
            color: "#be123c",
            weight: 2.5,
            dashArray: "6, 6",
          }).addTo(mg);
          const distKm = fastHaversineKm(p1.lat, p1.lng, p2.lat, p2.lng);
          const distLabel =
            distKm < 1 ? `${(distKm * 1000).toFixed(1)} m` : `${distKm.toFixed(2)} km`;
          line.bindTooltip(`Distance: ${distLabel}`, {
            permanent: true,
            direction: "center",
          });
          setMeasuredDistanceLabel(distLabel);
        } else {
          setMeasuredDistanceLabel("Select second point on map...");
        }
        return nextPts;
      });
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [isMeasureMode]);

  // Render active shapefile GeoJSON layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    const renderer = canvasRendererRef.current;
    if (!map) return;

    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    if (!activeLayer?.geoJson || !isShapeVisible) {
      return;
    }

    const layer = L.geoJSON(activeLayer.geoJson, {
      style: (feature) => {
        const name = getFeatureDisplayName(feature?.properties);
        const fill =
          shapeColorMode === "attribute"
            ? attrColorMap.get(name) || shapeSingleColor
            : shapeSingleColor;
        const isHighlighted =
          selectedFeatureName === "ALL_MAP" ||
          (selectedFeatureName !== "" && name === selectedFeatureName);

        return {
          renderer: renderer || undefined,
          fillColor: fill,
          weight: isHighlighted ? 2.5 : 1.25,
          opacity: 1,
          color: isHighlighted ? "#4f46e5" : "#64748b",
          fillOpacity: isHighlighted ? 0.55 : 0.25,
        };
      },
      onEachFeature: (feature, leafletFeature) => {
        const featName = getFeatureDisplayName(feature.properties);
        leafletFeature.bindTooltip(featName, { sticky: true });
        leafletFeature.on("click", () => {
          if (!isMeasureMode) {
            setSelectedFeatureName(featName);
          }
        });
      },
    }).addTo(map);

    layer.bringToBack();
    if (basemapLayerRef.current) basemapLayerRef.current.bringToBack();
    geoJsonLayerRef.current = layer;

    if (!selectedFeatureName && layer.getBounds().isValid()) {
      map.fitBounds(layer.getBounds(), { padding: [24, 24] });
    }
  }, [
    activeLayer,
    isShapeVisible,
    shapeColorMode,
    shapeSingleColor,
    selectedFeatureName,
    attrColorMap,
    isMeasureMode,
  ]);

  // Zoom to highlighted area
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeLayer?.geoJson || !selectedFeatureName) return;
    if (selectedFeatureName === "ALL_MAP" && geoJsonLayerRef.current?.getBounds().isValid()) {
      map.fitBounds(geoJsonLayerRef.current.getBounds(), { padding: [24, 24] });
      return;
    }
    const matchingFeatures = (activeLayer.geoJson.features || []).filter(
      (f: any) => getFeatureDisplayName(f.properties) === selectedFeatureName
    );
    if (matchingFeatures.length > 0) {
      const b = L.geoJSON({ type: "FeatureCollection", features: matchingFeatures } as any).getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [24, 24] });
    }
  }, [selectedFeatureName, activeLayer]);

  // Render map markers using Canvas renderer for high speed
  useEffect(() => {
    const map = mapInstanceRef.current;
    const mg = markerGroupRef.current;
    const renderer = canvasRendererRef.current;
    if (!map || !mg) return;

    mg.clearLayers();
    if (!mergeResult) return;

    const bounds: L.LatLngTuple[] = [];

    const plotDataset = (
      rows: Record<string, any>[],
      fillColor: string,
      statusTitle: string
    ) => {
      if (!rows || rows.length === 0) return;
      const { latKey, lonKey } = detectCoordinateColumns(rows);
      if (!latKey || !lonKey) return;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const lat = parseGeoCoord(row[latKey]);
        const lon = parseGeoCoord(row[lonKey]);
        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lon) ||
          Math.abs(lat) > 90 ||
          Math.abs(lon) > 180
        ) {
          continue;
        }

        bounds.push([lat, lon]);
        const previewKeys = Object.keys(row).slice(0, 6);
        const popLines = previewKeys
          .filter((k) => row[k] !== undefined && row[k] !== "")
          .map(
            (k) =>
              `<div style="font-size:11px;color:#334155;margin-top:2px;"><b>${String(k).replace(/</g, "&lt;")}:</b> ${String(
                row[k]
              ).replace(/</g, "&lt;")}</div>`
          )
          .join("");

        const marker = L.circleMarker([lat, lon], {
          renderer: renderer || undefined,
          radius: markerRadius,
          fillColor,
          color: "#ffffff",
          weight: 1.25,
          fillOpacity: 0.9,
        }).bindPopup(
          `<div style="padding:10px 12px;min-width:170px;font-family:sans-serif;"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:${fillColor};border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-bottom:4px;">${statusTitle}</div>${popLines}</div>`
        );
        mg.addLayer(marker);
      }
    };

    plotDataset(
      mergeResult.unmatchedMainRows.map((r) => r.data),
      colorUnmatched,
      "Unmatched (Main)"
    );
    for (const s of mergeResult.sheetSummaries) {
      plotDataset(s.unmatchedRows, colorUnmatched, `Unmatched (${s.label})`);
    }
    plotDataset(
      mergeResult.partiallyMatchedRows.map((r) => r.data),
      colorPartial,
      "Partial Match"
    );
    plotDataset(
      mergeResult.fullyMatchedRows.map((r) => r.data),
      colorFull,
      "Full Match"
    );

    if (bounds.length > 0 && !selectedFeatureName) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [mergeResult, colorFull, colorPartial, colorUnmatched, markerRadius, selectedFeatureName]);

  // ---------------- SPATIAL GRID & AREA STATS HANDLERS ----------------
  const clearGrid = () => {
    if (gridLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(gridLayerRef.current);
      gridLayerRef.current = null;
    }
    setGridSummary(null);
  };

  const handleRunGridAnalysis = () => {
    if (!activeLayer?.geoJson || !selectedFeatureName) {
      notify("Select a boundary layer and highlight an area first.", "error");
      return;
    }

    try {
      const targetGeoJson =
        selectedFeatureName === "ALL_MAP"
          ? activeLayer.geoJson
          : {
              type: "FeatureCollection" as const,
              features: (activeLayer.geoJson.features || []).filter(
                (f: any) => getFeatureDisplayName(f.properties) === selectedFeatureName
              ),
            };

      const analysis = generateHydroGridAnalysis(targetGeoJson, gridAreaSqKm, mergeResult);
      clearGrid();

      if (mapInstanceRef.current) {
        const layer = L.geoJSON(analysis.clippedGrids, {
          style: (feature) => {
            const isEmpty = Boolean(feature?.properties?.isEmpty);
            return {
              renderer: canvasRendererRef.current || undefined,
              color: isEmpty ? "#be123c" : "#047857",
              weight: 1.25,
              fillColor: isEmpty ? "#f43f5e" : "#10b981",
              fillOpacity: 0.4,
            };
          },
          onEachFeature: (feature, leafletLayer) => {
            const empty = feature?.properties?.isEmpty;
            const count = feature?.properties?.pointCount ?? 0;
            leafletLayer.bindTooltip(empty ? "Empty Grid Cell (0 samples)" : `Samples: ${count}`);
          },
        }).addTo(mapInstanceRef.current);

        if (markerGroupRef.current) markerGroupRef.current.bringToFront();
        gridLayerRef.current = layer;
      }

      setGridSummary({
        emptyCount: analysis.emptyCount,
        occupiedCount: analysis.occupiedCount,
        totalCells: analysis.totalCells,
      });
      notify(
        `Grid scan complete: ${analysis.emptyCount} of ${analysis.totalCells} cells have zero samples.`,
        "success"
      );
    } catch (err: any) {
      notify(err?.message || "Failed to compute spatial grid.", "error");
    }
  };

  const handleCalculateAreaStats = () => {
    if (!activeLayer?.geoJson) {
      notify("Load a shapefile boundary layer first.", "error");
      return;
    }
    if (!mergeResult) {
      notify("Run a merge first before calculating regional spatial stats.", "error");
      return;
    }
    setShowAreaStatsModal(true);
    setAreaStatsLoading(true);
    setTimeout(() => {
      try {
        const { summaries, detailedRows } = computeRegionalAreaStats(
          activeLayer.geoJson,
          mergeResult
        );
        setAreaSummaries(summaries);
        setAreaDetailedRows(detailedRows);
      } catch (err) {
        console.error(err);
        notify("Error computing regional area statistics.", "error");
      } finally {
        setAreaStatsLoading(false);
      }
    }, 20);
  };

  const handleExportRegionalStats = () => {
    if (areaDetailedRows.length === 0) {
      notify("No regional breakdown rows to export.", "error");
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(areaDetailedRows);
    ensureSheetJSNumbers(ws, 1);
    XLSX.utils.book_append_sheet(wb, ws, "State_Aquifer_Breakdown");
    const base = (exportFileName || "HydroMerge_Output").trim().replace(/\.xlsx$/i, "");
    void downloadStyledSheetJSWorkbook(wb, `${base}_Regional_Stats.xlsx`)
      .then(() => notify(`Exported ${base}_Regional_Stats.xlsx`, "success"))
      .catch((err) => {
        console.error("HydroMerge regional stats Excel export error:", err);
        notify("Failed to generate regional stats Excel file.", "error");
      });
  };

  // ---------------- DONUT SVG MATH ----------------
  const donutSegments = useMemo(() => {
    if (!mergeResult) return [];
    const items = [
      { label: "Full Match", count: mergeResult.fullyMatchedRows.length, color: "#10b981" },
      { label: "Partial Match", count: mergeResult.partiallyMatchedRows.length, color: "#f59e0b" },
      { label: "Unmatched Main", count: mergeResult.unmatchedMainRows.length, color: "#f43f5e" },
      { label: "Missing Keys (Main)", count: mergeResult.mainMissingKeyRows.length, color: "#94a3b8" },
    ].filter((it) => it.count > 0);

    const total = items.reduce((s, it) => s + it.count, 0);
    if (total === 0) return [];

    const radius = 64;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return items.map((item) => {
      const pct = item.count / total;
      const strokeLength = pct * circumference;
      const seg = {
        ...item,
        pct: Math.round(pct * 1000) / 10,
        dashArray: `${strokeLength} ${circumference}`,
        dashOffset: -offset,
      };
      offset += strokeLength;
      return seg;
    });
  }, [mergeResult]);

  // ---------------- RENDER ----------------
  const totalSecondaryRowsLoaded = secondarySheets.reduce((sum, s) => sum + s.rows.length, 0);
  const loadedSecondaryCount = secondarySheets.filter((s) => s.rows.length > 0).length;

  return (
    <div className="hydromerge-console flex flex-col lg:h-[calc(100vh-140px)] min-h-[760px] bg-white border border-slate-200 border-t-[3px] border-t-teal-600 rounded-2xl overflow-hidden text-slate-900">
      {/* TOP COMMAND HEADER */}
      <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-sky-50/60 to-teal-50/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-700 to-indigo-700 text-white flex items-center justify-center shrink-0">
            <GitMerge className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-extrabold tracking-tight text-slate-900">
                Hydro Merge
              </h2>
              <span className="text-[11px] font-semibold text-teal-800 border-l border-teal-200 pl-2.5 tabular-nums">
                1 Main ({mainRows.length.toLocaleString()} rows) vs {secondarySheets.length} Sheet Slots ({loadedSecondaryCount} loaded)
              </span>
            </div>
            <p className="text-xs text-slate-600 truncate">
              Multi-sheet key reconciliation, fuzzy prefix matching, spatial auditing &amp; workbook fusion
            </p>
          </div>
        </div>

        {/* Inline KPI Summary Strip (shown once merged) */}
        {mergeResult && (
          <div className="hidden xl:flex items-center gap-3 px-3 py-1 bg-white/90 border border-slate-200 rounded-lg text-xs tabular-nums">
            <div className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200/80">
              <span className="text-emerald-700 mr-1">Full:</span>
              <span className="font-bold text-emerald-800 font-mono">
                {mergeResult.fullyMatchedRows.length.toLocaleString()}
              </span>
            </div>
            <div className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200/80">
              <span className="text-amber-700 mr-1">Partial:</span>
              <span className="font-bold text-amber-800 font-mono">
                {mergeResult.partiallyMatchedRows.length.toLocaleString()}
              </span>
            </div>
            <div className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200/80">
              <span className="text-rose-700 mr-1">Unmatched:</span>
              <span className="font-bold text-rose-800 font-mono">
                {mergeResult.unmatchedMainRows.length.toLocaleString()}
              </span>
            </div>
            <div className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200/80">
              <span className="text-indigo-700 mr-1">Export:</span>
              <span className="font-bold text-indigo-900 font-mono">
                {mergeResult.exportedMergedRows.length.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Primary Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={mergeMode}
            onChange={(e) => setMergeMode(e.target.value as MergeMode)}
            title="Select how rows from multiple comparison sheets are kept in Merged_Master"
            className="h-9 px-2.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-800 outline-none focus:border-teal-600 cursor-pointer"
          >
            <option value="enrich_main">Enrich Main (Keep All Main + Partial &amp; Full)</option>
            <option value="inner_all">Strict Match All (Matched Across Every Sheet)</option>
            <option value="match_any">Match Any (Full + Partial Matches Only)</option>
          </select>

          <button
            type="button"
            onClick={addSecondarySheet}
            className="h-9 px-3 text-xs font-semibold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600" />
            Add Sheet
          </button>

          <button
            type="button"
            onClick={handleRunMerge}
            disabled={isProcessing}
            className="h-9 px-4 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {isProcessing ? "Merging..." : "Run Merge"}
          </button>

          {mergeResult && (
            <button
              type="button"
              onClick={handleExportWorkbook}
              className="h-9 px-3.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export .xlsx
            </button>
          )}

          <button
            type="button"
            onClick={handleReset}
            title="Reset all Hydro Merge inputs and results"
            className="h-9 w-9 flex items-center justify-center bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 rounded-lg cursor-pointer shrink-0 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* MAIN SPLIT CONSOLE */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* LEFT CONFIGURATION WORKBENCH */}
        <aside className="w-full lg:w-[400px] xl:w-[430px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-gradient-to-b from-slate-50 via-sky-50/35 to-teal-50/40 flex flex-col min-h-0">
          <div className="p-3.5 overflow-y-auto custom-scrollbar space-y-3 flex-1">
            {/* Status notice inside workbench */}
            {statusBanner && (
              <div
                className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-between gap-2 ${
                  statusBanner.tone === "error"
                    ? "bg-rose-50 border-rose-200 text-rose-800"
                    : statusBanner.tone === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-sky-50 border-sky-200 text-sky-800"
                }`}
              >
                <span className="leading-snug">{statusBanner.text}</span>
                <button
                  type="button"
                  onClick={() => setStatusBanner(null)}
                  className="text-slate-400 hover:text-slate-700 shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* CARD 1: MAIN / REFERENCE SHEET */}
            <div className="bg-white border border-teal-200 rounded-xl overflow-hidden">
              <div
                onClick={() => setMainExpanded((v) => !v)}
                className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer bg-teal-50/75 hover:bg-teal-50 border-b border-teal-100"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded bg-teal-700 text-white text-[11px] font-bold flex items-center justify-center shrink-0 font-mono">
                    M
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      Main Sheet: {mainLabel}
                    </div>
                    <div className="text-[11px] text-teal-800/80 tabular-nums">
                      {mainRows.length > 0
                        ? `${mainRows.length.toLocaleString()} rows · ${mainHeaders.length} cols`
                        : "Required anchor dataset"}
                    </div>
                  </div>
                </div>
                {mainExpanded ? (
                  <ChevronUp className="w-4 h-4 text-teal-600 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-teal-600 shrink-0" />
                )}
              </div>

              {mainExpanded && (
                <div className="p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex-1 min-w-[140px] h-8 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                      <UploadCloud className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="truncate">
                        {mainFileName && !mainSyncedFromApp ? mainFileName : "Upload Main (.xlsx/.csv)"}
                      </span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleMainFileUpload}
                        className="hidden"
                      />
                    </label>

                    {mainAppData.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSyncFromMainApp}
                        className="h-8 px-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-semibold text-indigo-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                        title="Use the main spreadsheet currently loaded in the application"
                      >
                        <Database className="w-3.5 h-3.5 shrink-0" />
                        Use App Data
                      </button>
                    )}
                  </div>

                  {mainWorkbookCache && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                        Tab:
                      </span>
                      <select
                        value={mainWorkbookCache.activeSheetName}
                        onChange={(e) => handleSwitchMainWorksheetTab(e.target.value)}
                        className="flex-1 h-7 px-2 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800 outline-none"
                      >
                        {mainWorkbookCache.sheetNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {mainHeaders.length > 0 && (
                    <div className="border-t border-slate-100 pt-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setMainShowCols((v) => !v)}
                          className="text-xs font-semibold text-slate-700 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                        >
                          <span>
                            Export Columns ({mainSelectedCols.length}/{mainHeaders.length})
                          </span>
                          {mainShowCols ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => setMainSelectedCols([...mainHeaders])}
                            className="px-1.5 py-0.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-600 cursor-pointer"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setMainSelectedCols([])}
                            className="px-1.5 py-0.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-600 cursor-pointer"
                          >
                            None
                          </button>
                        </div>
                      </div>

                      {mainShowCols && (
                        <div className="mt-2 space-y-1.5">
                          {mainHeaders.length > 8 && (
                            <input
                              type="text"
                              value={mainColFilter}
                              onChange={(e) => setMainColFilter(e.target.value)}
                              placeholder="Filter main columns..."
                              className="w-full h-7 px-2 text-xs border border-slate-200 rounded bg-slate-50 outline-none focus:border-indigo-400"
                            />
                          )}
                          <div className="max-h-36 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50/40">
                            {mainHeaders
                              .filter((h) =>
                                !mainColFilter
                                  ? true
                                  : h.toLowerCase().includes(mainColFilter.toLowerCase())
                              )
                              .map((col) => {
                                const checked = mainSelectedCols.includes(col);
                                return (
                                  <label
                                    key={col}
                                    className="flex items-center gap-2 px-2.5 py-1 text-xs text-slate-700 hover:bg-white cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setMainSelectedCols((p) => [...p, col]);
                                        } else {
                                          setMainSelectedCols((p) => p.filter((c) => c !== col));
                                        }
                                      }}
                                      className="accent-indigo-600 cursor-pointer"
                                    />
                                    <span className="truncate">{col}</span>
                                  </label>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* COMPARISON SHEETS LIST HEADER */}
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Comparison Sheets ({secondarySheets.length}) · {totalSecondaryRowsLoaded.toLocaleString()} rows
              </span>
              <button
                type="button"
                onClick={addSecondarySheet}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Sheet
              </button>
            </div>

            {/* COMPARISON SHEETS CARDS */}
            {secondarySheets.map((sheet, sheetIdx) => {
              const theme = SHEET_MINERAL_THEMES[sheetIdx % SHEET_MINERAL_THEMES.length];
              return (
              <div
                key={sheet.id}
                className={`bg-white border ${theme.border} rounded-xl overflow-hidden`}
              >
                <div className={`px-3.5 py-2.5 flex items-center justify-between border-b border-slate-100 ${theme.headerBg} gap-2`}>
                  <div
                    onClick={() =>
                      updateSecondarySheet(sheet.id, (s) => ({ ...s, isExpanded: !s.isExpanded }))
                    }
                    className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                  >
                    <span className={`w-5 h-5 rounded ${theme.badge} text-[11px] font-bold flex items-center justify-center shrink-0 font-mono`}>
                      S{sheetIdx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {sheet.label}
                      </div>
                      <div className={`text-[11px] ${theme.accentText} tabular-nums`}>
                        {sheet.rows.length > 0
                          ? `${sheet.rows.length.toLocaleString()} rows · ${sheet.headers.length} cols`
                          : "Upload .xlsx, .xls, or .csv"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {secondarySheets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSecondarySheet(sheet.id)}
                        title="Remove comparison sheet"
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        updateSecondarySheet(sheet.id, (s) => ({ ...s, isExpanded: !s.isExpanded }))
                      }
                      className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      {sheet.isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {sheet.isExpanded && (
                  <div className="p-3.5 space-y-3">
                    {/* Sheet Alias + Upload */}
                    <div className="grid grid-cols-5 gap-2">
                      <input
                        type="text"
                        value={sheet.label}
                        onChange={(e) =>
                          updateSecondarySheet(sheet.id, (s) => ({
                            ...s,
                            label: e.target.value,
                          }))
                        }
                        placeholder="Sheet Alias"
                        title="Label used for disambiguated columns and Excel tabs"
                        className="col-span-2 h-8 px-2.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-800 outline-none focus:border-indigo-500"
                      />
                      <label className="col-span-3 h-8 px-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                        <UploadCloud className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate">
                          {sheet.fileName ? sheet.fileName : "Upload File"}
                        </span>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={(e) => handleSecondaryFileUpload(sheet.id, e)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {sheet.workbookCache && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                          Tab:
                        </span>
                        <select
                          value={sheet.workbookCache.activeSheetName}
                          onChange={(e) =>
                            handleSwitchSecondaryWorksheetTab(sheet.id, e.target.value)
                          }
                          className="flex-1 h-7 px-2 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800 outline-none"
                        >
                          {sheet.workbookCache.sheetNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Per-Sheet Join Key Mapping */}
                    {sheet.headers.length > 0 && (
                      <div className="space-y-2 border-t border-slate-100 pt-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700">
                            Join Keys (Main ↔ {sheet.label})
                          </span>
                          <div className="flex items-center gap-2">
                            {mainHeaders.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateSecondarySheet(sheet.id, (s) => ({
                                    ...s,
                                    joinKeys: autoSuggestJoinKeyPairs(mainHeaders, s.headers),
                                  }))
                                }
                                title="Auto-pair matching ID column"
                                className="text-[11px] font-semibold text-slate-600 hover:text-indigo-700 flex items-center gap-0.5 cursor-pointer"
                              >
                                <Sparkles className="w-3 h-3" />
                                Auto
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => addJoinKey(sheet.id)}
                              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              Add Key
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {sheet.joinKeys.map((jk) => (
                            <div
                              key={jk.id}
                              className="p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5"
                            >
                              <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                    Main Column
                                  </label>
                                  <select
                                    value={jk.mainColumn}
                                    onChange={(e) =>
                                      updateJoinKey(sheet.id, jk.id, {
                                        mainColumn: e.target.value,
                                      })
                                    }
                                    className="w-full h-7 px-1.5 text-[11px] bg-white border border-slate-200 rounded text-slate-800 outline-none"
                                  >
                                    <option value="">-- Select --</option>
                                    {mainHeaders.map((h) => (
                                      <option key={h} value={h}>
                                        {h}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                    {sheet.label} Column
                                  </label>
                                  <select
                                    value={jk.targetColumn}
                                    onChange={(e) =>
                                      updateJoinKey(sheet.id, jk.id, {
                                        targetColumn: e.target.value,
                                      })
                                    }
                                    className="w-full h-7 px-1.5 text-[11px] bg-white border border-slate-200 rounded text-slate-800 outline-none"
                                  >
                                    <option value="">-- Select --</option>
                                    {sheet.headers.map((h) => (
                                      <option key={h} value={h}>
                                        {h}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2 pt-0.5">
                                <div className="flex items-center gap-1.5">
                                  <Scissors className="w-3 h-3 text-slate-400" />
                                  <select
                                    value={jk.prefixLength}
                                    onChange={(e) =>
                                      updateJoinKey(sheet.id, jk.id, {
                                        prefixLength: Number(e.target.value) || 0,
                                      })
                                    }
                                    className="h-6 px-1.5 text-[11px] font-medium bg-white border border-slate-200 rounded text-slate-700 outline-none cursor-pointer"
                                  >
                                    <option value={0}>Exact Match (Full)</option>
                                    <option value={3}>First 3 Letters</option>
                                    <option value={4}>First 4 Letters</option>
                                    <option value={5}>First 5 Letters</option>
                                    <option value={6}>First 6 Letters</option>
                                    <option value={7}>First 7 Letters</option>
                                    <option value={8}>First 8 Letters</option>
                                  </select>
                                </div>
                                {sheet.joinKeys.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeJoinKey(sheet.id, jk.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                    title="Remove key pair"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Per-Sheet Export Columns Selector */}
                    {sheet.headers.length > 0 && (
                      <div className="border-t border-slate-100 pt-2">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateSecondarySheet(sheet.id, (s) => ({
                                ...s,
                                showColumns: !s.showColumns,
                              }))
                            }
                            className="text-xs font-semibold text-slate-700 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                          >
                            <span>
                              Include Columns ({sheet.selectedColumns.length}/{sheet.headers.length})
                            </span>
                            {sheet.showColumns ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() =>
                                updateSecondarySheet(sheet.id, (s) => ({
                                  ...s,
                                  selectedColumns: [...s.headers],
                                }))
                              }
                              className="px-1.5 py-0.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-600 cursor-pointer"
                            >
                              All
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSecondarySheet(sheet.id, (s) => ({
                                  ...s,
                                  selectedColumns: [],
                                }))
                              }
                              className="px-1.5 py-0.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-600 cursor-pointer"
                            >
                              None
                            </button>
                          </div>
                        </div>

                        {sheet.showColumns && (
                          <div className="mt-2 space-y-1.5">
                            {sheet.headers.length > 8 && (
                              <input
                                type="text"
                                value={sheet.colFilter}
                                onChange={(e) =>
                                  updateSecondarySheet(sheet.id, (s) => ({
                                    ...s,
                                    colFilter: e.target.value,
                                  }))
                                }
                                placeholder={`Filter ${sheet.label} columns...`}
                                className="w-full h-7 px-2 text-xs border border-slate-200 rounded bg-slate-50 outline-none"
                              />
                            )}
                            <div className="max-h-36 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50/40">
                              {sheet.headers
                                .filter((h) =>
                                  !sheet.colFilter
                                    ? true
                                    : h.toLowerCase().includes(sheet.colFilter.toLowerCase())
                                )
                                .map((col) => {
                                  const checked = sheet.selectedColumns.includes(col);
                                  return (
                                    <label
                                      key={col}
                                      className="flex items-center gap-2 px-2.5 py-1 text-xs text-slate-700 hover:bg-white cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) =>
                                          updateSecondarySheet(sheet.id, (s) => ({
                                            ...s,
                                            selectedColumns: e.target.checked
                                              ? [...s.selectedColumns, col]
                                              : s.selectedColumns.filter((c) => c !== col),
                                          }))
                                        }
                                        className="accent-indigo-600 cursor-pointer"
                                      />
                                      <span className="truncate">{col}</span>
                                    </label>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}

            {/* EXPORT OPTIONS CARD */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeStatusColumns}
                    onChange={(e) => setIncludeStatusColumns(e.target.checked)}
                    className="accent-indigo-600 cursor-pointer"
                  />
                  Include `_Match_Status` &amp; `_Matched_Sheets` columns
                </label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                  Export Name:
                </span>
                <input
                  type="text"
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  className="flex-1 h-7 px-2 text-xs border border-slate-200 rounded bg-slate-50 text-slate-800 outline-none focus:border-indigo-400"
                />
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT STAGE: MATRIX / SPATIAL MAP / ANALYTICS */}
        <section className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
          {/* Sub-view navigation bar */}
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setStageMode("matrix")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer transition-colors ${
                  stageMode === "matrix"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                Comparison Matrix
              </button>
              <button
                type="button"
                onClick={() => setStageMode("map")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer transition-colors ${
                  stageMode === "map"
                    ? "bg-teal-600 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                Spatial Map
              </button>
              <button
                type="button"
                onClick={() => setStageMode("analytics")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer transition-colors ${
                  stageMode === "analytics"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Integration Analytics
              </button>
            </div>

            {mergeResult && (
              <div className="flex items-center gap-3 text-xs text-slate-600 tabular-nums">
                <span>
                  Computed in <strong className="font-mono text-slate-900">{mergeResult.executionMs} ms</strong>
                </span>
                {measuredDistanceLabel && stageMode === "map" && (
                  <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded font-semibold">
                    Distance: {measuredDistanceLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* SUB-VIEW 1: DATA MATRIX */}
          {stageMode === "matrix" && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {!mergeResult ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-white via-sky-50/20 to-teal-50/30">
                  <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center mb-3 text-teal-700">
                    <GitMerge className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">
                    Multi-Sheet Data Reconciliation Ready
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mb-4 leading-relaxed">
                    Load your Main Sheet (or click Use App Data), upload two or more comparison spreadsheets on the left, verify each sheet&apos;s join key column, and click Run Merge.
                  </p>
                  <div className="flex items-center gap-2">
                    {mainAppData.length > 0 && mainRows.length === 0 && (
                      <button
                        type="button"
                        onClick={handleSyncFromMainApp}
                        className="h-8 px-3.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-800 cursor-pointer"
                      >
                        Sync Active App Workbook
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleRunMerge}
                      className="h-8 px-4 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer"
                    >
                      Run Merge
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Matrix Filter & Pagination Bar */}
                  <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={matrixFilter}
                        onChange={(e) => {
                          setMatrixFilter(e.target.value);
                          setMatrixPage(1);
                        }}
                        className="h-8 px-2.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-800 outline-none cursor-pointer"
                      >
                        <option value="all">
                          All Main Rows ({mergeResult.fullyMatchedRows.length + mergeResult.partiallyMatchedRows.length + mergeResult.unmatchedMainRows.length})
                        </option>
                        <option value="full">
                          Full Match Across All Sheets ({mergeResult.fullyMatchedRows.length})
                        </option>
                        <option value="partial">
                          Partial Matches ({mergeResult.partiallyMatchedRows.length})
                        </option>
                        <option value="unmatched_main">
                          Unmatched Main ({mergeResult.unmatchedMainRows.length})
                        </option>
                        <option value="missing_main">
                          Missing Join Keys: Main ({mergeResult.mainMissingKeyRows.length})
                        </option>
                        {mergeResult.sheetSummaries.map((s) => (
                          <React.Fragment key={s.sheetId}>
                            <option value={`unmatched_sec::${s.sheetId}`}>
                              Unmatched in {s.label} ({s.unmatchedCount})
                            </option>
                            <option value={`missing_sec::${s.sheetId}`}>
                              Missing Keys in {s.label} ({s.missingKeyCount})
                            </option>
                          </React.Fragment>
                        ))}
                      </select>

                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={matrixSearch}
                          onChange={(e) => {
                            setMatrixSearch(e.target.value);
                            setMatrixPage(1);
                          }}
                          placeholder="Search rows..."
                          className="h-8 pl-8 pr-3 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 outline-none focus:border-indigo-400 w-52"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-600 tabular-nums">
                      <span>
                        Showing {matrixDataset.rows.length === 0 ? 0 : (clampedPage - 1) * PAGE_SIZE + 1}–
                        {Math.min(clampedPage * PAGE_SIZE, matrixDataset.rows.length)} of{" "}
                        {matrixDataset.rows.length.toLocaleString()}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={clampedPage <= 1}
                          onClick={() => setMatrixPage((p) => Math.max(1, p - 1))}
                          className="h-7 px-2 border border-slate-200 bg-white rounded disabled:opacity-40 cursor-pointer"
                        >
                          Prev
                        </button>
                        <span className="px-1.5 font-mono">
                          {clampedPage}/{totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={clampedPage >= totalPages}
                          onClick={() => setMatrixPage((p) => Math.min(totalPages, p + 1))}
                          className="h-7 px-2 border border-slate-200 bg-white rounded disabled:opacity-40 cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Data Table */}
                  <div className="flex-1 overflow-auto custom-scrollbar">
                    {pagedRows.length === 0 ? (
                      <div className="p-10 text-center text-xs text-slate-500">
                        No rows match the selected audit bucket or search query.
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 z-10 bg-gradient-to-r from-indigo-50 via-sky-50 to-teal-50 border-b border-indigo-200 text-slate-800">
                          <tr>
                            <th className="px-3 py-2 font-bold text-[11px] uppercase tracking-wider border-r border-indigo-100 w-12 text-center text-indigo-800">
                              #
                            </th>
                            {matrixDataset.headers.map((col) => (
                              <th
                                key={col}
                                className="px-3 py-2 font-bold text-[11px] tracking-wide border-r border-indigo-100 whitespace-nowrap"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pagedRows.map((row, idx) => {
                            const rowNum = (clampedPage - 1) * PAGE_SIZE + idx + 1;
                            const statusText = String(row._Match_Status || "");
                            return (
                              <tr key={rowNum} className="hover:bg-sky-50/40 transition-colors">
                                <td className="px-3 py-2 border-r border-slate-100 text-slate-400 font-mono text-center tabular-nums">
                                  {rowNum}
                                </td>
                                {matrixDataset.headers.map((col) => {
                                  const val = row[col];
                                  const isNum = typeof val === "number";
                                  let cellTone = "text-slate-700";
                                  if (col === "_Match_Status") {
                                    if (statusText.startsWith("Full")) cellTone = "font-bold text-emerald-800 bg-emerald-50/70";
                                    else if (statusText.startsWith("Partial")) cellTone = "font-bold text-amber-800 bg-amber-50/70";
                                    else cellTone = "font-bold text-rose-800 bg-rose-50/70";
                                  }
                                  return (
                                    <td
                                      key={col}
                                      className={`px-3 py-2 border-r border-slate-100 whitespace-nowrap max-w-[260px] truncate ${cellTone} ${
                                        isNum ? "text-right font-mono tabular-nums" : ""
                                      }`}
                                      title={val !== undefined && val !== null ? String(val) : ""}
                                    >
                                      {val === undefined || val === null || val === "" ? "—" : String(val)}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* SUB-VIEW 2: SPATIAL MAP (kept mounted via hidden toggle to preserve Leaflet canvas state) */}
          <div className={stageMode === "map" ? "flex-1 flex flex-col min-h-0 overflow-hidden" : "hidden"}>
            {/* Docked Map Toolbar (Zero overlap over map canvas) */}
            <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                {/* Status Color Legend Controls */}
                <div className="flex items-center gap-2 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="color"
                      value={colorFull}
                      onChange={(e) => setColorFull(e.target.value)}
                      className="w-4 h-4 border border-slate-300 rounded cursor-pointer"
                    />
                    Full
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="color"
                      value={colorPartial}
                      onChange={(e) => setColorPartial(e.target.value)}
                      className="w-4 h-4 border border-slate-300 rounded cursor-pointer"
                    />
                    Partial
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="color"
                      value={colorUnmatched}
                      onChange={(e) => setColorUnmatched(e.target.value)}
                      className="w-4 h-4 border border-slate-300 rounded cursor-pointer"
                    />
                    Unmatched
                  </label>
                </div>

                {/* Marker Size */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700">
                  <span>Radius</span>
                  <input
                    type="range"
                    min={3}
                    max={18}
                    value={markerRadius}
                    onChange={(e) => setMarkerRadius(Number(e.target.value))}
                    className="w-16 accent-indigo-600 cursor-pointer"
                  />
                  <span className="font-mono tabular-nums w-4 text-right">{markerRadius}</span>
                </div>

                {/* Basemap Selector (ESRI Physical, ESRI Terrain, Hybrid, Satellite) */}
                <select
                  value={basemapId}
                  onChange={(e) => setBasemapId(e.target.value as BasemapId)}
                  className="h-7 px-2 text-[11px] font-semibold bg-teal-50/75 border border-teal-200 rounded-lg text-teal-900 outline-none cursor-pointer"
                >
                  <option value="esriPhysical">ESRI Physical</option>
                  <option value="esriTerrain">ESRI Terrain</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="satellite">Satellite</option>
                </select>

                {/* Upload Shapefile */}
                <label className="h-7 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                  <UploadCloud className="w-3.5 h-3.5" />
                  Add Shapefile
                  <input
                    type="file"
                    multiple
                    accept=".zip,.shp,.dbf,.shx,.prj,.cpg,.sbx,.sbn,.xml"
                    onChange={handleShapefileUpload}
                    className="hidden"
                  />
                </label>

                {/* Shared/Uploaded Layer Picker */}
                {allAvailableLayers.length > 0 && (
                  <select
                    value={activeLayerId}
                    onChange={(e) => {
                      setActiveLayerId(e.target.value);
                      setSelectedFeatureName("");
                      clearGrid();
                    }}
                    className="h-7 px-2 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg text-slate-800 outline-none max-w-[150px] truncate cursor-pointer"
                  >
                    <option value="">-- Layer --</option>
                    {allAvailableLayers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Shapefile Style & Visibility Controls */}
                {activeLayer && (
                  <>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white border border-slate-200 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setIsShapeVisible((v) => !v)}
                        title="Toggle shapefile boundary"
                        className="p-0.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        {isShapeVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <select
                        value={shapeColorMode}
                        onChange={(e) => setShapeColorMode(e.target.value as "single" | "attribute")}
                        className="text-[11px] font-semibold bg-transparent text-slate-700 outline-none cursor-pointer"
                      >
                        <option value="single">Single Fill</option>
                        <option value="attribute">By Attribute</option>
                      </select>
                      <input
                        type="color"
                        value={shapeSingleColor}
                        onChange={(e) => setShapeSingleColor(e.target.value)}
                        className="w-4 h-4 border border-slate-300 rounded cursor-pointer"
                      />
                    </div>

                    <select
                      value={selectedFeatureName}
                      onChange={(e) => setSelectedFeatureName(e.target.value)}
                      className="h-7 px-2 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg text-slate-800 outline-none max-w-[160px] cursor-pointer"
                    >
                      <option value="">-- Highlight Area --</option>
                      <option value="ALL_MAP">[ Entire Layer ]</option>
                      {featureNamesInActiveLayer.map((fn) => (
                        <option key={fn} value={fn}>
                          {fn}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={handleCalculateAreaStats}
                      className="h-7 px-2.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <PieChart className="w-3.5 h-3.5 text-indigo-600" />
                      Regional Stats
                    </button>
                  </>
                )}

                {/* Distance Measure Tool */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMeasureMode((m) => {
                      if (m) {
                        measureGroupRef.current?.clearLayers();
                        setMeasurePoints([]);
                        setMeasuredDistanceLabel("");
                      } else {
                        setMeasuredDistanceLabel("Click two points on map...");
                      }
                      return !m;
                    });
                  }}
                  className={`h-7 px-2.5 border rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                    isMeasureMode
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700"
                  }`}
                >
                  <Ruler className="w-3.5 h-3.5" />
                  Measure
                </button>
              </div>
            </div>

            {/* Docked Spatial Grid Bar when area is selected */}
            {activeLayer && selectedFeatureName && (
              <div className="px-3 py-1.5 border-b border-slate-200 bg-indigo-50/50 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
                <div className="flex items-center gap-2">
                  <Grid className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-bold text-slate-800">Square Grid Density Audit:</span>
                  <span className="text-slate-600">Cell Area (km²)</span>
                  <input
                    type="number"
                    min={1}
                    max={25000}
                    value={gridAreaSqKm}
                    onChange={(e) => setGridAreaSqKm(Math.max(1, Number(e.target.value) || 100))}
                    className="w-20 h-6 px-2 text-xs font-mono font-bold bg-white border border-slate-200 rounded text-center outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleRunGridAnalysis}
                    className="h-6 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-semibold cursor-pointer"
                  >
                    Analyze Grid
                  </button>
                  {gridSummary && (
                    <button
                      type="button"
                      onClick={clearGrid}
                      className="h-6 px-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-[11px] font-semibold cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {gridSummary && (
                  <div className="text-xs font-semibold text-slate-800 tabular-nums">
                    <span className="text-rose-700 font-mono">{gridSummary.emptyCount}</span> empty /{" "}
                    <span className="text-emerald-700 font-mono">{gridSummary.occupiedCount}</span> sampled (
                    {gridSummary.totalCells} total cells)
                  </div>
                )}
              </div>
            )}

            {/* Map Viewport */}
            <div ref={mapContainerRef} className="flex-1 w-full min-h-[420px] relative z-0" />
          </div>

          {/* SUB-VIEW 3: INTEGRATION ANALYTICS */}
          {stageMode === "analytics" && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
              {!mergeResult ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <BarChart3 className="w-10 h-10 text-slate-400 mb-3" />
                  <p className="text-sm font-bold text-slate-800">No Merge Metrics Yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Run a multi-sheet merge to inspect per-sheet match rates, missing keys, and reconciliation coverage.
                  </p>
                </div>
              ) : (
                <>
                  {/* Main Reconciliation Overview Cards + Donut Chart */}
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="xl:col-span-1 border border-teal-200 rounded-xl p-4 bg-gradient-to-b from-teal-50/40 to-white flex flex-col items-center justify-center">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800 mb-3 self-start">
                        Main Sheet Breakdown
                      </h3>
                      <div className="relative w-44 h-44 flex items-center justify-center">
                        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                          <circle
                            cx="80"
                            cy="80"
                            r="64"
                            fill="transparent"
                            stroke="#e2e8f0"
                            strokeWidth="22"
                          />
                          {donutSegments.map((seg) => (
                            <circle
                              key={seg.label}
                              cx="80"
                              cy="80"
                              r="64"
                              fill="transparent"
                              stroke={seg.color}
                              strokeWidth="22"
                              strokeDasharray={seg.dashArray}
                              strokeDashoffset={seg.dashOffset}
                            />
                          ))}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-xl font-extrabold font-mono text-slate-900 tabular-nums">
                            {mergeResult.mainTotalRows.toLocaleString()}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-700">
                            Main Rows
                          </span>
                        </div>
                      </div>
                      <div className="w-full mt-4 space-y-1.5 text-xs">
                        {donutSegments.map((seg) => (
                          <div key={seg.label} className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-slate-700 font-medium">
                              <span
                                className="w-2.5 h-2.5 rounded-sm shrink-0"
                                style={{ backgroundColor: seg.color }}
                              />
                              {seg.label}
                            </span>
                            <span className="font-mono font-bold text-slate-900 tabular-nums">
                              {seg.count.toLocaleString()} ({seg.pct}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Per-Sheet Reconciliation Matrix */}
                    <div className="xl:col-span-2 border border-indigo-200 rounded-xl bg-white overflow-hidden flex flex-col">
                      <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50/60 flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                          Sheet-by-Sheet Coverage &amp; Unmatched Audit
                        </h3>
                        <span className="text-xs text-indigo-700 font-semibold tabular-nums">
                          {mergeResult.sheetSummaries.length} comparison sheets checked
                        </span>
                      </div>
                      <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] uppercase">
                            <tr>
                              <th className="px-4 py-2.5 font-bold">Comparison Sheet</th>
                              <th className="px-3 py-2.5 text-right font-bold">Rows</th>
                              <th className="px-3 py-2.5 text-right font-bold text-emerald-700">Matched</th>
                              <th className="px-3 py-2.5 text-right font-bold text-rose-700">Unmatched</th>
                              <th className="px-3 py-2.5 text-right font-bold text-slate-500">Missing Key</th>
                              <th className="px-4 py-2.5 font-bold w-40">Coverage</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {mergeResult.sheetSummaries.map((s, idx) => {
                              const theme = SHEET_MINERAL_THEMES[idx % SHEET_MINERAL_THEMES.length];
                              return (
                              <tr key={s.sheetId} className="hover:bg-sky-50/35">
                                <td className="px-4 py-2.5 font-bold text-slate-900">
                                  <span className="inline-flex items-center gap-2">
                                    <span className={`w-2.5 h-2.5 rounded-sm ${theme.badge} shrink-0`} />
                                    {s.label}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                  {s.totalRows.toLocaleString()}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700 tabular-nums">
                                  {s.matchedCount.toLocaleString()}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-700 tabular-nums">
                                  {s.unmatchedCount.toLocaleString()}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-slate-500 tabular-nums">
                                  {s.missingKeyCount.toLocaleString()}
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-emerald-600 rounded-full"
                                        style={{ width: `${Math.min(100, s.matchRatePct)}%` }}
                                      />
                                    </div>
                                    <span className="font-mono font-semibold text-slate-800 tabular-nums w-11 text-right">
                                      {s.matchRatePct}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Export Manifest Preview */}
                  <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/45">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                        Export Workbook Tabs Ready
                      </h3>
                      <button
                        type="button"
                        onClick={handleExportWorkbook}
                        className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download {exportFileName || "HydroMerge_Output"}.xlsx
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                      <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-md font-mono">
                        Reconciliation_Summary
                      </span>
                      <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-md font-mono">
                        Merged_Master ({mergeResult.exportedMergedRows.length.toLocaleString()} rows)
                      </span>
                      {mergeResult.unmatchedMainRows.length > 0 && (
                        <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-md font-mono">
                          Unmatched_Main ({mergeResult.unmatchedMainRows.length.toLocaleString()})
                        </span>
                      )}
                      {mergeResult.sheetSummaries.map(
                        (s) =>
                          s.unmatchedCount > 0 && (
                            <span
                              key={s.sheetId}
                              className="px-2.5 py-1 bg-white border border-slate-200 rounded-md font-mono"
                            >
                              Unmatched_{s.label} ({s.unmatchedCount.toLocaleString()})
                            </span>
                          )
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* REGIONAL AREA STATS MODAL */}
      {showAreaStatsModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-[2000] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Regional Spatial Sample Coverage
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {areaDetailedRows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportRegionalStats}
                    className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Regional Breakdown (.xlsx)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAreaStatsModal(false)}
                  className="h-8 w-8 flex items-center justify-center border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
              {areaStatsLoading ? (
                <div className="p-12 text-center text-xs font-semibold text-slate-600">
                  Computing polygon intersections...
                </div>
              ) : areaSummaries.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  No polygon features or mappable sample coordinates were found.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-5 py-3 font-bold">Principal Aquifer / Feature Name</th>
                      <th className="px-4 py-3 text-right font-bold text-emerald-700">Full Match</th>
                      <th className="px-4 py-3 text-right font-bold text-amber-700">Partial</th>
                      <th className="px-4 py-3 text-right font-bold text-rose-700">Unmatched</th>
                      <th className="px-5 py-3 text-right font-bold text-slate-900">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {areaSummaries.map((row) => (
                      <tr key={row.name} className="hover:bg-slate-50/70">
                        <td className="px-5 py-2.5 font-semibold text-slate-900">{row.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {row.fullMatched.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700 tabular-nums">
                          {row.partialMatched.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-700 tabular-nums">
                          {row.unmatched.toLocaleString()}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono font-extrabold text-slate-900 tabular-nums">
                          {row.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
