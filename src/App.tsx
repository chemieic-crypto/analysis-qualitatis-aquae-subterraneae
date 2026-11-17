import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { ensureSheetJSNumbers } from "./utils/excelFormatter";
import shp from "shpjs";
import { DataHeaders, ShapefileLayer } from "./types";
import { PARAM_CONFIG } from "./data/config";
import { getStats } from "./utils/math";
import MappingModal from "./components/MappingModal";
import DetailedView from "./components/DetailedView";
import ComparisonsView from "./components/ComparisonsView";
import PamphletView from "./components/PamphletView";
import BulletinView from "./components/BulletinView";
import MasterSummaryView from "./components/MasterSummaryView";
import UsslPiperAnalysisView from "./components/UsslPiperAnalysisView";
import RankingStatsView from "./components/RankingStatsView";
import MonsoonImpactView from "./components/MonsoonImpactView";
import GisMapView from "./components/GisMapView";
import SectorAnalysisView from "./components/SectorAnalysisView";
import ErrorBoundary from "./components/ErrorBoundary";
import HydrochemistryView from "./components/HydrochemistryView";
import { CombinationAnalysisView } from "./components/CombinationAnalysisView";
import PcaAnalysisView from "./components/PcaAnalysisView";
import FortnightlyAlertsView from "./components/FortnightlyAlertsView";
import LimitsManagerView from "./components/LimitsManagerView";
import AdvancedAnalysisView from "./components/AdvancedAnalysisView";
import CalculatoriusView from "./components/CalculatoriusView";
import KpiView from "./components/KpiView";
import FactSheetView from "./components/FactSheetView";
import ShapefileFilterView from "./components/ShapefileFilterView";
import { generateOfflineChartBase64 } from "./utils/chartHelpers";
import { isStateAll, isDistrictAll, norm } from "./utils/shapefileFilter";
import { downloadWaterQualityTemplate } from "./utils/templateGenerator";
import { INDIA_BOUNDARY } from "./data/india_boundary";
import MonsoonRainCanvas from "./components/MonsoonRainCanvas";

import {
  Database,
  UploadCloud,
  Download,
  Info,
  AlertTriangle,
  Table2,
  TableProperties,
  LayoutDashboard,
  BarChart3,
  LayoutTemplate,
  FileText,
  CheckCircle,
  Activity,
  X,
  AlertCircle,
  Compass,
  TrendingUp,
  Globe,
  Layers,
  Cpu,
  Settings,
  Clock,
  Calendar,
  Map,
  MapPin,
  Calculator,
  Award
} from "lucide-react";

import Highcharts from "highcharts";
import Highcharts3D from "highcharts/highcharts-3d";
import Cylinder from "highcharts/modules/cylinder";
import Exporting from "highcharts/modules/exporting";
import OfflineExporting from "highcharts/modules/offline-exporting";
import Heatmap from "highcharts/modules/heatmap";
import { initHighchartsModule } from "./utils/chartHelpers";

// Initialize Highcharts modules safely
if (typeof Highcharts === "object") {
  initHighchartsModule(Highcharts3D, Highcharts);
  initHighchartsModule(Cylinder, Highcharts);
  initHighchartsModule(Exporting, Highcharts);
  initHighchartsModule(OfflineExporting, Highcharts);
  initHighchartsModule(Heatmap, Highcharts);
}

type ActiveTab =
  | "single"
  | "master"
  | "multi"
  | "bar"
  | "aisummary"
  | "bulletin"
  | "about"
  | "guidelines"
  | "ussl"
  | "ranking"
  | "monsoon"
  | "gis"
  | "shapefileFilter"
  | "sector"
  | "hydrochemistry"
  | "combination"
  | "pca"
  | "fortnightly"
  | "limits"
  | "advancedAnalysis"
  | "calculatorius"
  | "kpi"
  | "factSheet";

type ReportingLevel = "State" | "District" | "Block";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("kpi");

  // State to trigger dynamic recalculation and re-rendering of all components on parameter limit changes
  const [limitsVersion, setLimitsVersion] = useState(0);

  // Live modern date and time state with high precision
  const [currentDateTime, setCurrentDateTime] = useState<Date>(new Date());
  const [tableFont, setTableFont] = useState<string>(() => localStorage.getItem("table_num_font") || "Inter");

  useEffect(() => {
    localStorage.setItem("table_num_font", tableFont);
    const fontMapping: Record<string, string> = {
      "Roboto": "'Roboto', sans-serif",
      "Poppins": "'Poppins', sans-serif",
      "Manrope": "'Manrope', sans-serif",
      "IBM Plex Sans": "'IBM Plex Sans', sans-serif",
      "Segoe UI": "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      "Inter": "'Inter', sans-serif"
    };
    const fontValue = fontMapping[tableFont] || "'Inter', sans-serif";
    document.documentElement.style.setProperty("--table-num-font", fontValue);
  }, [tableFont]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // State values for uploaded records
  const [rawData, setRawData] = useState<any[]>([]);
  const [uploadedHeaders, setUploadedHeaders] = useState<string[]>([]);
  const [headers, setHeaders] = useState<DataHeaders>({
    state: "State",
    district: "District",
    block: "Block",
    wellId: "Well ID",
    location: "Location",
    longitude: "Longitude",
    latitude: "Latitude",
    year: "Year",
    season: "Season",
    source: "Source",
    params: ["pH", "TDS", "TH", "EC", "Cl", "NO3", "F", "SAR", "RSC"]
  });
  const [headerMap, setHeaderMap] = useState<Record<string, string>>({
    "pH": "pH",
    "TDS": "TDS",
    "TH": "TH",
    "EC": "EC",
    "Cl": "Cl",
    "NO3": "NO3",
    "F": "F",
    "SAR": "SAR",
    "RSC": "RSC"
  });

  // Filters State
  const [reportingLevel, setReportingLevel] = useState<"State" | "District" | "Block">("State");
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSeason, setSelectedSeason] = useState("");

  const [activeParam, setActiveParam] = useState("pH");

  // Export configuration
  const [exportParams, setExportParams] = useState<string[]>([]);
  const [combinedParams, setCombinedParams] = useState<string[]>([]);
  const [exportIndividualExceedance, setExportIndividualExceedance] = useState(true);
  const [exportCombinedExceedance, setExportCombinedExceedance] = useState(true);

  // Shared state to transfer maps directly to Bulletin Report
  const [sharedBulletinMaps, setSharedBulletinMaps] = useState<Record<string, string>>({});

  // Shared Shapefile Layers State (populated when user uploads shapefiles)
  const [sharedLayers, setSharedLayers] = useState<ShapefileLayer[]>([]);

  // Shared Choropleth Classes config (limits, colors, and labels)
  const [choroplethClasses, setChoroplethClasses] = useState<{ limit: number; color: string; label: string }[]>([
    { limit: 5, color: "#22c55e", label: "0% - 5%" },
    { limit: 10, color: "#eab308", label: ">5% - 10%" },
    { limit: 15, color: "#f97316", label: "10% - 15%" },
    { limit: 25, color: "#ef4444", label: "15% - 25%" },
    { limit: 100, color: "#a855f7", label: ">25%" }
  ]);

  // Mapping Modal state overlay
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [tempRawData, setTempRawData] = useState<any[]>([]);
  const [tempHeaders, setTempHeaders] = useState<DataHeaders>({ params: [] });
  const [tempHeaderMap, setTempHeaderMap] = useState<Record<string, string>>({});

  // Toast notifications State
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "error" }[]>([]);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Memoized filtered data to use consistently across exports and pre-generation
  const filteredData = useMemo(() => {
    let filtered = rawData;
    if (selectedState && !isStateAll(selectedState)) {
      const selStateNorm = norm(selectedState);
      filtered = filtered.filter((d) => {
        const val = String(d[headers.state || ""] || d["State"] || d["state"] || "").trim();
        const vNorm = norm(val);
        return vNorm && (vNorm === selStateNorm || vNorm.includes(selStateNorm) || selStateNorm.includes(vNorm));
      });
    }
    if (selectedDistrict && !isDistrictAll(selectedDistrict)) {
      const selDistNorm = norm(selectedDistrict);
      filtered = filtered.filter((d) => {
        const val = String(d[headers.district || ""] || d["District"] || d["district"] || "").trim();
        const vNorm = norm(val);
        return vNorm && (vNorm === selDistNorm || vNorm.includes(selDistNorm) || selDistNorm.includes(vNorm));
      });
    }
    return [...filtered];
  }, [rawData, selectedState, selectedDistrict, headers.state, headers.district, limitsVersion]);

  // Filtered by State, District, and selected Year (without Season, for comparisons / monsoon impact)
  const yearFilteredData = useMemo(() => {
    let filtered = filteredData;
    if (selectedYear && selectedYear.toLowerCase() !== "all" && selectedYear.toLowerCase() !== "select year") {
      const yearFiltered = filtered.filter((d) => {
        const yr = String(d[headers.year || ""] || d["Year"] || d["year"] || "").trim();
        return yr && yr.includes(selectedYear);
      });
      if (yearFiltered.length > 0) {
        filtered = yearFiltered;
      }
    }
    return [...filtered];
  }, [filteredData, selectedYear, headers.year, limitsVersion]);

  // Filtered by State, District, selected Year, AND selected Season
  const yearSeasonFilteredData = useMemo(() => {
    let filtered = yearFilteredData;
    if (selectedSeason && selectedSeason.toLowerCase() !== "all" && selectedSeason.toLowerCase() !== "select season") {
      const seasonLow = selectedSeason.toLowerCase();
      const seasonFiltered = filtered.filter((d) => {
        const rowSeason = String(d[headers.season || ""] || d["Season"] || d["season"] || "").toLowerCase();
        if (seasonLow.includes("pre")) return rowSeason.includes("pre") || rowSeason.includes("before") || rowSeason.includes("may");
        if (seasonLow.includes("post")) return rowSeason.includes("post") || rowSeason.includes("after") || rowSeason.includes("nov");
        return rowSeason.trim() === seasonLow.trim();
      });
      if (seasonFiltered.length > 0) {
        filtered = seasonFiltered;
      }
    }
    return [...filtered];
  }, [yearFilteredData, selectedSeason, headers.season, limitsVersion]);

  // Charts are generated lazily inside BulletinView during bulletin compilation, or asynchronously when viewing a specific parameter in DetailedView.
  // This avoids blocking the main thread during data parsing and filtering.

  // Pre-guess columns matching
  const guessHeaders = (rawHeaders: string[]): { guessed: DataHeaders; map: Record<string, string> } => {
    const find = (targets: string[]) =>
      rawHeaders.find((k) => k && typeof k === "string" && targets.some((t) => k.toLowerCase().trim() === t.toLowerCase()));

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
      source: find(["Source", "Well Type", "Well_Type", "Source Type", "Source_Type", "Water Source", "Water_Source", "src"]),
      depth: find(["Depth", "Well Depth", "Depth BGL", "Well_Depth", "Casing Depth", "Drill Depth", "Depth(m)", "Depth (m)", "BGL", "depth_m"]),
      params: [],
    };

    const knownKeys = Object.values(guessed).filter((h) => typeof h === "string") as string[];
    const map: Record<string, string> = {};

    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    rawHeaders.forEach((header) => {
      if (!header || typeof header !== "string") return;
      if (knownKeys.includes(header)) return;
      const hLower = header.toLowerCase().trim();
      const staticKeywords = ["location", "lat", "lon", "district", "state", "block", "village", "well", "sl. no", "serial", "unit", "source"];
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
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        if (!arrayBuffer) return;

        let wb;
        try {
          wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array", cellFormula: false, cellHTML: false, cellText: false });
        } catch (readErr) {
          // Fallback: try parsing as string (for CSV text standard formats)
          const decoder = new TextDecoder("utf-8");
          const text = decoder.decode(arrayBuffer);
          wb = XLSX.read(text, { type: "string", cellFormula: false, cellHTML: false, cellText: false });
        }

        if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
          showToast("Uploaded spreadsheet contains no readable sheets.", "error");
          return;
        }

        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        if (!ws) {
          showToast("Could not retrieve primary worksheet.", "error");
          return;
        }

        const parsedData = XLSX.utils.sheet_to_json(ws);
        if (!parsedData || parsedData.length === 0) {
          showToast("Uploaded spreadsheet contains no plottable data rows.", "error");
          return;
        }

        // Gather all header values from worksheet structure first
        const headersList: string[] = [];
        if (ws["!ref"]) {
          const range = XLSX.utils.decode_range(ws["!ref"]);
          const R = range.s.r; // First row
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = ws[cellRef];
            if (cell && (cell.v !== undefined && cell.v !== null)) {
              headersList.push(String(cell.v).trim());
            } else if (cell && cell.w !== undefined) {
              headersList.push(String(cell.w).trim());
            }
          }
        }

        // Fallback: extract headers from parsed rows (for resilient mapping)
        const allKeys = new Set<string>();
        parsedData.forEach((row: any) => {
          if (row && typeof row === "object") {
            Object.keys(row).forEach((k) => {
              if (k && !k.startsWith("__EMPTY")) {
                allKeys.add(String(k).trim());
              }
            });
          }
        });

        // Merge standard worksheet headers with json keys
        const headersSet = new Set<string>(headersList.filter(Boolean));
        allKeys.forEach((k) => headersSet.add(k));
        const uniqueHeaders = Array.from(headersSet);

        if (uniqueHeaders.length === 0) {
          showToast("Could not extract column headers. Verify spreadsheet structure.", "error");
          return;
        }

        setTempRawData(parsedData);
        setUploadedHeaders(uniqueHeaders);

        const { guessed, map } = guessHeaders(uniqueHeaders);
        setTempHeaders(guessed);
        setTempHeaderMap(map);
        
        // Open the mapping modal overlay
        setMappingModalOpen(true);
      } catch (err) {
        console.error(err);
        showToast("Parser error: ensure file is a valid standard .csv, .xls, or .xlsx spreadsheet.", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaveMapping = (finalHeaders: DataHeaders, finalHeaderMap: Record<string, string>) => {
    if (tempRawData && tempRawData.length > 0) {
      setRawData(tempRawData);
      setTempRawData([]);
    }
    setHeaders(finalHeaders);
    setHeaderMap(finalHeaderMap);
    setMappingModalOpen(false);

    // Reset filters to ensure new dataset is displayed without stale filter conflicts
    setSelectedState("");
    setSelectedDistrict("");
    setSelectedYear("");
    setSelectedSeason("");

    // Initial dropdown values
    if (finalHeaders.params.length > 0) {
      const firstParam = finalHeaders.params[0]!;
      setActiveParam(firstParam);
      setExportParams([...finalHeaders.params]);
      setCombinedParams([...finalHeaders.params]);
    }

    showToast("Data columns mapped and synchronized successfully!", "success");
  };

  const handleCancelMapping = () => {
    setTempRawData([]);
    setMappingModalOpen(false);
    showToast("Mapping canceled. Data was not imported.", "error");
  };

  useEffect(() => {
    // Attempt to auto-load default data from public/root path with multiple fallback file options
    const autoLoadDefaultData = async () => {
      const dataFilesToTry = [
        "./Pre-Monsoon.xlsx",
        "/Pre-Monsoon.xlsx",
        "./Pre-Monsoon 2025.xlsx",
        "/Pre-Monsoon 2025.xlsx",
        "./Pre-Monsoon.xlsx.xlsx",
        "/Pre-Monsoon.xlsx.xlsx",
        "./Pre-Monsoon 2025.xlsx.xlsx",
        "/Pre-Monsoon 2025.xlsx.xlsx",
        "./Pre_Monsoon.xlsx",
        "/Pre_Monsoon.xlsx",
        "./PreMonsoon.xlsx",
        "/PreMonsoon.xlsx",
        "./pre-monsoon.xlsx",
        "/pre-monsoon.xlsx",
        "./Pre-Monsoon.xls",
        "/Pre-Monsoon.xls",
        "./Pre-Monsoon 2025.xls",
        "/Pre-Monsoon 2025.xls",
        "./groundwater_data.xlsx",
        "/groundwater_data.xlsx",
        "./data.xlsx",
        "/data.xlsx",
        "./groundwater.xlsx",
        "/groundwater.xlsx",
        "./data.csv",
        "/data.csv"
      ];

      for (const fileUrl of dataFilesToTry) {
        try {
          const response = await fetch(fileUrl);
          if (response.ok) {
            const ct = response.headers.get("content-type") || "";
            if (!ct.includes("text/html") && !ct.includes("application/xhtml+xml")) {
              console.log(`Auto-loading default data from: ${fileUrl}`);
              return { response, filename: fileUrl.split("/").pop() || "Default Data" };
            }
          }
        } catch (err) {
          // Continue trying other files
        }
      }
      console.log("No default spreadsheet could be auto-loaded. Waiting for user upload.");
      return null;
    };

    autoLoadDefaultData().then(async (result) => {
      if (!result) return;
      const { response, filename } = result;
      try {
        const arrayBuffer = await response.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array", cellFormula: false, cellHTML: false, cellText: false });
        if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) return;

        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        if (!ws) return;

        const parsedData = XLSX.utils.sheet_to_json(ws);
        if (!parsedData || parsedData.length === 0) return;

        const headersList: string[] = [];
        if (ws["!ref"]) {
          const range = XLSX.utils.decode_range(ws["!ref"]);
          const R = range.s.r;
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = ws[cellRef];
            if (cell && (cell.v !== undefined && cell.v !== null)) {
              headersList.push(String(cell.v).trim());
            } else if (cell && cell.w !== undefined) {
              headersList.push(String(cell.w).trim());
            }
          }
        }

        const allKeys = new Set<string>();
        parsedData.forEach((row: any) => {
          if (row && typeof row === "object") {
            Object.keys(row).forEach((k) => {
              if (k && !k.startsWith("__EMPTY")) {
                allKeys.add(String(k).trim());
              }
            });
          }
        });

        const headersSet = new Set<string>(headersList.filter(Boolean));
        allKeys.forEach((k) => headersSet.add(k));
        const uniqueHeaders = Array.from(headersSet);

        setRawData(parsedData);
        setUploadedHeaders(uniqueHeaders);

        const { guessed, map } = guessHeaders(uniqueHeaders);
        setHeaders(guessed);
        setHeaderMap(map);

        if (guessed.params.length > 0) {
          const firstParam = guessed.params[0]!;
          setActiveParam(firstParam);
          setExportParams([...guessed.params]);
          setCombinedParams([...guessed.params]);
        }

        showToast(`Auto-loaded default data: ${filename} successfully!`, "success");
      } catch (err) {
        console.error("Error parsing auto-loaded default data:", err);
      }
    });
  }, []);

  // State Options dropdown values List
  const stateList = useMemo(() => {
    const key = headers.state || "";
    if (!key) return [];
    return [...new Set(rawData.map((d) => String(d[key] || "").trim()))]
      .filter((v) => v && v !== "Unknown")
      .sort();
  }, [rawData, headers.state]);

  // District options list linked automatically to selected state
  const districtList = useMemo(() => {
    if (!selectedState) return [];
    const stateKey = headers.state || "";
    const distKey = headers.district || "";
    if (!distKey) return [];
    return [
      ...new Set(
        rawData
          .filter((d) => String(d[stateKey] || "").trim() === selectedState)
          .map((d) => String(d[distKey] || "").trim())
      ),
    ]
      .filter((v) => v && v !== "Unknown")
      .sort();
  }, [rawData, selectedState, headers.state, headers.district]);

  // Year options list
  const yearList = useMemo(() => {
    const key = headers.year || "";
    if (!key || !rawData || rawData.length === 0) return [];
    return [...new Set(rawData.map((d) => String(d[key] || "").trim()))]
      .filter((v) => v && v !== "Unknown" && v !== "")
      .sort();
  }, [rawData, headers.year]);

  // Season options list
  const seasonList = useMemo(() => {
    const key = headers.season || "";
    if (!key || !rawData || rawData.length === 0) return [];
    return [...new Set(rawData.map((d) => String(d[key] || "").trim()))]
      .filter((v) => v && v !== "Unknown" && v !== "")
      .sort();
  }, [rawData, headers.season]);

  const handleStateChange = (stateVal: string) => {
    setSelectedState(stateVal);
    setSelectedDistrict(""); // Reset district
  };

  const handleLevelChange = (level: "State" | "District" | "Block") => {
    setReportingLevel(level);
  };

  // Spreadsheet styles applicator helper
  const applyExcelStyles = (ws: any, headerRowCount = 1) => {
    if (!ws["!ref"]) return;
    ensureSheetJSNumbers(ws, headerRowCount);
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const colWidths: any[] = [];
    const rowHeights: any[] = [];

    // Columns width
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

    // Styles writing logic
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
            name: "Times New Roman",
            sz: 12,
            bold: isHeader,
            color: { rgb: isHeader ? "FFFFFF" : "000000" },
          },
          fill: isHeader ? { fgColor: { rgb: "333333" } } : undefined, // Light black header row
          border: {
            top: { style: "thin", color: { rgb: "cbd5e1" } },
            bottom: { style: "thin", color: { rgb: "cbd5e1" } },
            left: { style: "thin", color: { rgb: "cbd5e1" } },
            right: { style: "thin", color: { rgb: "cbd5e1" } },
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
  };

  // Compliance calculations for sheets
  const computeComplianceDataRows = (paramName: string, filteredDataset: any[], level: "State" | "District" | "Block") => {
    const configKey = headerMap[paramName];
    const config = PARAM_CONFIG[configKey];
    if (!config) return null;

    const unit = config.unit;
    const isSingleLimit = config.b1 === config.b2 && configKey !== "pH";

    let accLabel = "", permLabel = "", failLabel = "";
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

    // Set headers
    const cols = ["S.No."];
    if (level === "State") cols.push("State");
    else if (level === "District") cols.push("State", "District");
    else cols.push("State", "District", "Block");

    cols.push("Total Samples", `${accLabel} (No)`, `${accLabel} (%)`);
    if (!isSingleLimit && configKey !== "pH") {
      cols.push(`${permLabel} (No)`, `${permLabel} (%)`);
    }
    cols.push(`${failLabel} (No)`, `${failLabel} (%)`, "Min", "Max", "Average", "SD");

    // Gather groups
    const groupKey =
      level === "State"
        ? headers.state
        : level === "District"
        ? headers.district
        : headers.block;

    if (!groupKey) return null;

    const groupMap: Record<string, { state: string; district: string; block: string; name: string; samples: any[] }> = {};
    let globalAcc = 0, globalPerm = 0, globalFail = 0;
    const globalVals: number[] = [];

    filteredDataset.forEach((row) => {
      const rowSt = String(row[headers.state || ""] || "").trim();
      const rowDt = String(row[headers.district || ""] || "").trim();
      const rowBlk = String(row[headers.block || ""] || "").trim();
      const loc = String(row[groupKey] || "Unknown").trim();

      let compositeKey = loc;
      if (level === "District") {
        compositeKey = rowSt ? `${rowSt}___${loc}` : loc;
      } else if (level === "Block") {
        compositeKey = `${rowSt}___${rowDt}___${loc}`;
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

    sortedEntries.forEach(([keyKey, data], idx) => {
      const vals = data.samples.map((s) => parseFloat(s[paramName])).filter((v) => !isNaN(v));
      const total = vals.length;
      if (total === 0) return;

      let nAcc = 0, nPerm = 0, nFail = 0;
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

    // Grand total
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
  };

  const handleExportIndividual = () => {
    if (!rawData.length) {
      showToast("Uploaded dataset is empty. Cannot export.", "error");
      return;
    }

    if (exportParams.length === 0 && combinedParams.length === 0) {
      showToast("Minimum of one parameter must be checked to begin exporting.", "error");
      return;
    }

    let filtered = yearSeasonFilteredData;

    const wb = XLSX.utils.book_new();
    const uniqueSheetNames = new Set<string>();

    // 1. Generate compliance sheet tab per parameter selection
    exportParams.forEach((paramName) => {
      const dataArr = computeComplianceDataRows(paramName, filtered, reportingLevel);
      if (dataArr && dataArr.length > 1) {
        const ws = XLSX.utils.aoa_to_sheet(dataArr);
        applyExcelStyles(ws, 1);

        let cleanName = paramName.substring(0, 24).replace(/[\[\]\*\/\\\?\:]/g, "_");
        let sheetNameVal = cleanName;
        let counter = 1;
        while (uniqueSheetNames.has(sheetNameVal)) {
          sheetNameVal = `${cleanName}_${counter++}`;
        }
        uniqueSheetNames.add(sheetNameVal);

        XLSX.utils.book_append_sheet(wb, ws, sheetNameVal);
      }
    });

    // 2. Generate Exceedance logs
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

      filtered.forEach((row) => {
        const localExceedances: string[] = [];
        const localNames: string[] = [];
        let hasHeavyMetal = false;

        Object.keys(headerMap).forEach((headerCol) => {
          const isExpInd = exportParams.includes(headerCol);
          const isExpComb = combinedParams.includes(headerCol);

          if (!isExpInd && !isExpComb) return;

          const key = headerMap[headerCol];
          if (!key || !PARAM_CONFIG[key]) return;
          const config = PARAM_CONFIG[key];
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
            const decimalPlaces = key === "EC" ? 1 : key === "NO3" ? 2 : key === "F" ? 3 : wholeNums.includes(key) ? 0 : 4;
            const zFormat = key === "EC" ? "0.0" : key === "NO3" ? "0.00" : key === "F" ? "0.000" : wholeNums.includes(key) ? "0" : "0.000";

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
              const heavyList = ["Fe", "As", "U", "Zn", "Cu", "Pb", "Cd", "Cr", "Hg", "Ni", "Se", "Ba"];
              if (heavyList.includes(key)) hasHeavyMetal = true;

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
        const titleRow = ["Locations where parameter values exceed the respective permissible limits as per BIS: 10500"];
        const wsIndData = [titleRow, indCols, ...indRows];
        const wsInd = XLSX.utils.aoa_to_sheet(wsIndData);
        wsInd["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }];
        applyExcelStyles(wsInd, 2);
        XLSX.utils.book_append_sheet(wb, wsInd, "Exceedance Locations");
      }

      if (exportCombinedExceedance && combRows.length > 0) {
        const titleRow = ["Locations with one or more parameters exceeding permissible limits as per BIS: 10500"];
        const wsCombData = [titleRow, combCols, ...combRows];
        const wsComb = XLSX.utils.aoa_to_sheet(wsCombData);
        wsComb["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }];
        applyExcelStyles(wsComb, 2);
        XLSX.utils.book_append_sheet(wb, wsComb, "Combined Exceedances");
      }
    }

    if (wb.SheetNames.length === 0) {
      showToast("No mapped data available to write sheets.", "error");
      return;
    }

    XLSX.writeFile(wb, `Groundwater_Compliance_Report_${Date.now()}.xlsx`);
    showToast("Styled Excel Workbook written successfully!", "success");
  };

  const getActiveTabButtonClasses = (tab: typeof activeTab) => {
    return activeTab === tab
      ? "whitespace-nowrap px-6 py-3 font-black text-indigo-600 border-b-4 border-indigo-650 transition-all select-none"
      : "whitespace-nowrap px-6 py-3 font-bold text-slate-400 border-b-4 border-transparent hover:text-slate-700 transition-all select-none";
  };

  return (
    <div className="min-h-screen p-2 sm:p-4 md:p-8 relative">
      
      {/* Dynamic Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-[calc(100vw-2rem)] pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-6 py-3 rounded-xl font-bold text-white shadow-lg flex items-center gap-2 duration-300 pointer-events-auto transform translate-y-0 opacity-100 ${
              toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-2 hover:bg-white/20 p-0.5 rounded-lg transition-colors border border-transparent"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Upload Mapping Modal Overlay */}
      <MappingModal
        isOpen={mappingModalOpen}
        uploadedHeaders={uploadedHeaders}
        initialHeaders={tempHeaders}
        initialHeaderMap={tempHeaderMap}
        onSave={handleSaveMapping}
        onCancel={handleCancelMapping}
      />

      <div className="w-full mx-auto max-w-none">
        
        {/* Official Bilingual Header Branding - Glossy 3D Aqua-Chrome Wave Capsule */}
        <header className="aqua-capsule-header rounded-3xl lg:rounded-full px-4 py-3 sm:px-6 sm:py-3.5 mb-7 flex flex-col lg:flex-row justify-between items-center gap-4">
          {/* Flowing Wave Ribbon & Ocean Sweep Background */}
          <svg
            aria-hidden="true"
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 w-full h-full z-[1]"
          >
            <defs>
              <linearGradient id="waveSweepGrad1" x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.06" />
                <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.22" />
                <stop offset="72%" stopColor="#bae6fd" stopOpacity="0.42" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.1" />
              </linearGradient>
              <linearGradient id="waveSweepGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.08" />
                <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.26" />
                <stop offset="75%" stopColor="#e0f2fe" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#0369a1" stopOpacity="0.14" />
              </linearGradient>
            </defs>
            {/* Upper curved sky-aqua wave ribbon sweeping behind droplet */}
            <path
              d="M 520 120 C 780 112, 920 18, 1300 0 L 1440 0 L 1440 120 Z"
              fill="url(#waveSweepGrad1)"
            />
            {/* Smooth lower ocean S-wave */}
            <path
              d="M 0 105 C 240 62, 520 118, 860 94 C 1100 76, 1280 96, 1440 82 L 1440 120 L 0 120 Z"
              fill="url(#waveSweepGrad2)"
            />
            <path
              d="M 0 98 C 300 72, 620 112, 980 88 C 1180 74, 1320 98, 1440 90"
              fill="none"
              stroke="rgba(224,242,254,0.45)"
              strokeWidth="1.8"
            />
          </svg>

          {/* Gentle Atmospheric Rain Layer */}
          <div className="pointer-events-none absolute inset-0 opacity-50 z-[2]">
            <MonsoonRainCanvas />
          </div>

          {/* Left Branding Zone: White Medallion Tea Cup + Divider + Hindi Gold + Divider + English Cursive */}
          <div className="flex flex-wrap md:flex-nowrap items-center justify-center lg:justify-start gap-2.5 sm:gap-4 w-full lg:w-auto relative z-10 min-w-0">
            {/* 1. Animated Tea Cup inside Crisp White Circular Medallion */}
            <div className="relative flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white border-2 border-sky-200/95 shadow-[0_3px_12px_rgba(0,0,0,0.45),inset_0_2px_4px_rgba(255,255,255,1)] flex items-center justify-center select-none shine-sweep-container transition-transform duration-300 hover:scale-105">
              <div className="shine-sweep-element"></div>
              <svg className="w-11 h-11 sm:w-12 sm:h-12 drop-shadow-[0_2px_6px_rgba(30,64,175,0.28)]" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="ceramicGrad" x1="50" y1="48" x2="50" y2="78" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#1d4ed8" />
                  </linearGradient>
                  <linearGradient id="saucerGrad" x1="50" y1="78" x2="50" y2="86" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#cbd5e1" />
                    <stop offset="100%" stopColor="#64748b" />
                  </linearGradient>
                  <linearGradient id="teaLiquidGrad" x1="50" y1="46" x2="50" y2="50" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#fb923c" />
                    <stop offset="100%" stopColor="#7c2d12" />
                  </linearGradient>
                  <linearGradient id="steamGrad" x1="50" y1="40" x2="50" y2="5" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#0284c7" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                  </linearGradient>
                </defs>

                <circle cx="50" cy="50" r="44" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 6" opacity="0.45" className="animate-spin" style={{ transformOrigin: '50px 50px', animationDuration: '24s' }} />
                <circle cx="50" cy="50" r="38" stroke="#0284c7" strokeWidth="0.9" strokeDasharray="2 3" opacity="0.35" className="animate-spin" style={{ transformOrigin: '50px 50px', animationDuration: '14s', animationDirection: 'reverse' }} />
                <ellipse cx="50" cy="80" rx="32" ry="5" fill="url(#saucerGrad)" stroke="#475569" strokeWidth="1" />
                <path d="M 72 54 C 84 54, 84 70, 70 70" fill="none" stroke="url(#ceramicGrad)" strokeWidth="4" strokeLinecap="round" />
                <path d="M 26 48 C 26 48, 24 76, 50 76 C 76 76, 74 48, 74 48 Z" fill="url(#ceramicGrad)" stroke="#1e3a8a" strokeWidth="1.5" />
                <ellipse cx="50" cy="48" rx="24" ry="4.5" fill="#1e40af" stroke="#93c5fd" strokeWidth="1" />
                <ellipse cx="50" cy="49" rx="21" ry="3.5" fill="url(#teaLiquidGrad)" />

                <g stroke="url(#steamGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none">
                  <path d="M 38 41 C 35 30, 43 23, 37 12 C 34 7, 39 3, 37 -3" className="animate-steam-1" style={{ transformOrigin: '38px 41px' }} />
                  <path d="M 50 41 C 47 28, 55 19, 49 8 C 46 2, 51 -2, 49 -8" className="animate-steam-2" style={{ transformOrigin: '50px 41px' }} />
                  <path d="M 62 41 C 59 30, 67 23, 61 12 C 58 7, 63 3, 61 -3" className="animate-steam-3" style={{ transformOrigin: '62px 41px' }} />
                </g>
              </svg>
            </div>

            <span aria-hidden="true" className="hidden sm:block w-[1.5px] h-10 bg-white/65 shrink-0" />

            {/* 2. Hindi Title 'भूजल गुणवत्ता' */}
            <h1
              className="aqua-hindi-title text-[26px] sm:text-[32px] xl:text-[38px] font-black tracking-wide select-none leading-none whitespace-nowrap"
              style={{ fontFamily: "'Noto Sans Devanagari', 'Yatra One', sans-serif" }}
            >
              भूजल गुणवत्ता
            </h1>

            <span aria-hidden="true" className="hidden sm:block w-[1.5px] h-10 bg-white/65 shrink-0" />

            {/* 3. English Flowing Cursive Title */}
            <h2
              className="aqua-english-title text-[26px] sm:text-[32px] xl:text-[40px] font-normal tracking-normal select-none leading-none whitespace-nowrap pt-1"
              style={{ fontFamily: "'Great Vibes', 'Playfair Display', cursive" }}
            >
              Data Analysis Interface
            </h2>
          </div>

          {/* Right Zone: Glossy 3D India-Map Water Droplet + Ripples + Live Analog/Digital Clock */}
          <div className="flex items-center justify-between lg:justify-end gap-5 w-full lg:w-auto shrink-0 relative z-10">
            {/* Glossy 3D Water Droplet with Accurate India Silhouette & Water Ripples */}
            <div aria-hidden="true" className="hidden md:flex items-center justify-center relative w-32 h-16 shrink-0 select-none">
              <svg viewBox="0 0 160 95" className="w-full h-full overflow-visible">
                <defs>
                  <radialGradient id="dropBodyGrad" cx="38%" cy="38%" r="65%">
                    <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.95" />
                    <stop offset="42%" stopColor="#38bdf8" stopOpacity="0.88" />
                    <stop offset="78%" stopColor="#0369a1" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#082f49" stopOpacity="0.98" />
                  </radialGradient>
                  <linearGradient id="dropHighlightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                  <clipPath id="dropClip">
                    <path d="M 80 4 C 80 4 106 36 106 53 C 106 67 94.5 76 80 76 C 65.5 76 54 67 54 53 C 54 36 80 4 80 4 Z" />
                  </clipPath>
                </defs>

                {/* Concentric Water Splash Ripples */}
                <g className="droplet-ripple-pulse">
                  <ellipse cx="80" cy="76" rx="64" ry="13" fill="none" stroke="rgba(186,230,253,0.45)" strokeWidth="1.4" />
                  <ellipse cx="80" cy="76" rx="48" ry="9.5" fill="none" stroke="rgba(224,242,254,0.68)" strokeWidth="1.6" />
                  <ellipse cx="80" cy="76" rx="33" ry="6.5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" />
                </g>

                {/* 3D Crystal Water Droplet */}
                <path
                  d="M 80 4 C 80 4 106 36 106 53 C 106 67 94.5 76 80 76 C 65.5 76 54 67 54 53 C 54 36 80 4 80 4 Z"
                  fill="url(#dropBodyGrad)"
                  stroke="rgba(224,242,254,0.9)"
                  strokeWidth="1.3"
                />

                {/* India Map Silhouette inside the Water Droplet */}
                <g clipPath="url(#dropClip)">
                  <path
                    d={(() => {
                      const ring = INDIA_BOUNDARY.geometry.coordinates[0] || [];
                      if (ring.length === 0) return "";
                      const minLng = 68.0, maxLng = 97.6, minLat = 7.9, maxLat = 36.2;
                      return ring
                        .map(([lng, lat], i) => {
                          const x = 64 + ((lng - minLng) / (maxLng - minLng)) * 32;
                          const y = 31 + ((maxLat - lat) / (maxLat - minLat)) * 38;
                          return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
                        })
                        .join(" ") + " Z";
                    })()}
                    fill="rgba(255, 255, 255, 0.92)"
                    stroke="rgba(12, 74, 110, 0.35)"
                    strokeWidth="0.6"
                  />
                  {/* Curved specular highlight reflection on droplet left side */}
                  <path
                    d="M 76 11 C 68 25 60 39 60 52 C 60 60 64 66 68 68 C 63 63 62 55 64 46 C 67 34 73 22 78 13 Z"
                    fill="url(#dropHighlightGrad)"
                    opacity="0.72"
                  />
                  {/* Bright bottom caustic arc */}
                  <path
                    d="M 66 69 C 74 74 87 74 95 68"
                    fill="none"
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </g>
              </svg>
            </div>

            {/* Live Analog Clock Icon + Vertical Divider + Digital Time & Date */}
            <div className="flex items-center gap-3.5 ml-auto">
              {/* Crisp Analog Clock SVG synced to live time */}
              <svg aria-hidden="true" viewBox="0 0 40 40" className="w-9 h-9 text-white/90 shrink-0 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                <circle cx="20" cy="20" r="16" fill="rgba(255,255,255,0.08)" stroke="currentColor" strokeWidth="2.2" />
                <circle cx="20" cy="20" r="1.6" fill="currentColor" />
                {(() => {
                  const mins = currentDateTime.getMinutes();
                  const hrs = (currentDateTime.getHours() % 12) + mins / 60;
                  const minAngle = (mins * 6 - 90) * (Math.PI / 180);
                  const hrAngle = (hrs * 30 - 90) * (Math.PI / 180);
                  return (
                    <>
                      <line
                        x1="20"
                        y1="20"
                        x2={20 + Math.cos(hrAngle) * 8.5}
                        y2={20 + Math.sin(hrAngle) * 8.5}
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                      <line
                        x1="20"
                        y1="20"
                        x2={20 + Math.cos(minAngle) * 11.5}
                        y2={20 + Math.sin(minAngle) * 11.5}
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                      />
                    </>
                  );
                })()}
              </svg>

              <span aria-hidden="true" className="w-[1.5px] h-10 bg-white/65 shrink-0" />

              <div className="flex flex-col items-end text-right select-none">
                <span className="text-lg sm:text-xl xl:text-[22px] font-black text-white font-mono tracking-tight tabular-nums leading-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.65)] whitespace-nowrap">
                  {(() => {
                    const hours = String(currentDateTime.getHours() % 12 || 12).padStart(2, '0');
                    const minutes = String(currentDateTime.getMinutes()).padStart(2, '0');
                    const seconds = String(currentDateTime.getSeconds()).padStart(2, '0');
                    const ampm = currentDateTime.getHours() >= 12 ? 'PM' : 'AM';
                    return `${hours}:${minutes}:${seconds} ${ampm}`;
                  })()}
                </span>
                <span className="text-[11px] font-bold italic text-sky-100/95 tracking-wide uppercase whitespace-nowrap mt-0.5" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {currentDateTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Global Geographical Filter Strip when data is present */}
        {rawData.length > 0 && (
          <div className="glossy-panel glossy-panel-dropdown p-5 rounded-3xl mb-6 flex flex-col md:flex-row gap-4 items-stretch md:items-end relative z-[60]">
            
            <div className="flex-1 min-w-[150px]">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 drop-shadow-xs">1. Reporting Level</label>
              <select
                value={reportingLevel}
                onChange={(e) => handleLevelChange(e.target.value as ReportingLevel)}
                className="w-full glossy-input rounded-xl p-3 font-bold text-slate-700 bg-white cursor-pointer select-none text-xs"
              >
                <option value="State">States and UTs Wise</option>
                <option value="District">District Wise</option>
                <option value="Block">Block Wise</option>
              </select>
            </div>

            <div className="flex-1 min-w-[150px]">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 drop-shadow-xs">2. Choose States and UTs</label>
              <select
                value={selectedState}
                onChange={(e) => handleStateChange(e.target.value)}
                className="w-full glossy-input rounded-xl p-3 font-bold text-slate-700 bg-white cursor-pointer select-none text-xs"
              >
                <option value="">All States and UTs</option>
                {stateList.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            {selectedState && reportingLevel !== "State" && (
              <div className="flex-1 min-w-[150px]">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 drop-shadow-xs">3. Choose District</label>
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="w-full glossy-input rounded-xl p-3 font-bold text-slate-700 bg-white cursor-pointer select-none text-xs"
                >
                  <option value="">All Districts</option>
                  {districtList.map((dist) => (
                    <option key={dist} value={dist}>{dist}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Year Filter */}
            {yearList.length > 0 && (
              <div className="flex-1 min-w-[120px]">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 drop-shadow-xs">Year</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full glossy-input rounded-xl p-3 font-bold text-slate-700 bg-white cursor-pointer select-none text-xs"
                >
                  <option value="">All Years</option>
                  {yearList.map((yr) => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Season Filter */}
            {seasonList.length > 0 && (
              <div className="flex-1 min-w-[120px]">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 drop-shadow-xs">Season</label>
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                  className="w-full glossy-input rounded-xl p-3 font-bold text-slate-700 bg-white cursor-pointer select-none text-xs"
                >
                  <option value="">All Seasons</option>
                  {seasonList.map((sea) => (
                    <option key={sea} value={sea}>{sea}</option>
                  ))}
                </select>
              </div>
            )}

          </div>
        )}

        {/* Responsive Mobile Tab Select Dropdown */}
        <div className="md:hidden mb-6 flex flex-col gap-3">
          <div>
            <label className="text-[10px] font-black text-indigo-650 uppercase tracking-widest block mb-2 drop-shadow-sm">
              Primary Navigation Module
            </label>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as ActiveTab)}
              className="w-full glossy-input rounded-2xl p-4 font-black text-slate-700 bg-white cursor-pointer select-none text-sm border-2 border-slate-200 outline-none focus:border-indigo-500 shadow-md transition-all"
            >
              <option value="kpi">🏆 KPI Analysis</option>
              <option value="factSheet">📑 State Fact Sheet (EC IDW & Exceedance)</option>
              <option value="single">📊 Detailed Analysis</option>
              <option value="advancedAnalysis">🧪 Advanced Data Analysis</option>
              <option value="ranking">📈 Ranking Stats</option>
              <option value="ussl">📈 USSL & Piper Diagram</option>
              <option value="combination">🧬 Combination Analysis</option>
              <option value="pca">📊 PCA Analysis</option>
              <option value="hydrochemistry">📋 Hydrochemistry Sheet</option>
              <option value="calculatorius">🧮 Calculatorius</option>
              <option value="gis">🌍 Geospatial Map Module</option>
              <option value="shapefileFilter">🗺️ Shapefile Spatial Filter</option>
              <option value="sector">🎯 Sector Analysis (Concentric & Radial)</option>
              <option value="master">📋 Master Summary Matrix</option>
              <option value="monsoon">🌧️ Dynamic Impact of Monsoon</option>
              <option value="bar">📊 Comparative Exceedance (Bar)</option>
              <option value="aisummary">📄 District Pamphlet</option>
              <option value="bulletin">📰 Annual Ground Water Quality Report</option>
              <option value="fortnightly">🔔 Fortnightly Quality Alerts</option>
              <option value="limits">⚙️ Parameter Limits Manager</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={downloadWaterQualityTemplate}
              className="w-full glossy-btn-indigo px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm text-white bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-700 border border-indigo-500/80 hover:opacity-95"
            >
              <Download className="w-3.5 h-3.5 text-white" /> Download Data Template (.xlsx)
            </button>

            {rawData.length > 0 && (
              <button
                onClick={handleExportIndividual}
                className="w-full glossy-btn-emerald px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm text-white"
              >
                <Download className="w-3.5 h-3.5 text-white" /> Export Styled Report
              </button>
            )}

            <div className="flex items-center gap-2.5">
              <div className={`text-white font-extrabold text-[10px] tracking-widest px-4 py-2.5 rounded-xl select-none animate-pulse flex items-center justify-center min-w-[70px] border transition-all duration-300 ${
                rawData.length > 0 
                  ? "bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_4px_10px_rgba(59,130,246,0.4),inset_0_-2px_4px_rgba(0,0,0,0.2),inset_0_2px_4px_rgba(255,255,255,0.3)] border-blue-600/50" 
                  : "bg-gradient-to-b from-red-500 to-red-700 shadow-[0_4px_10px_rgba(239,68,68,0.4),inset_0_-2px_4px_rgba(0,0,0,0.2),inset_0_2px_4px_rgba(255,255,255,0.3)] border-red-600/50"
              }`}>
                READY
              </div>

              <label className="flex-1 cursor-pointer glossy-btn-dark px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 select-none shadow-sm border border-slate-300 bg-slate-900 text-white hover:bg-slate-800">
                <UploadCloud className="w-3.5 h-3.5 text-slate-300 animate-pulse" /> Upload Excel or CSV
                <input type="file" onChange={handleFileUpload} className="hidden" accept=".xlsx, .xls, .csv" />
              </label>
            </div>
          </div>
        </div>

        {/* Desktop Tab Controls Bar */}
        <div className="hidden md:flex flex-wrap gap-x-3.5 gap-y-3 mb-8 select-none p-4 bg-gradient-to-r from-white/95 via-slate-50/80 to-white/95 backdrop-blur-xl rounded-3xl border border-white/90 shadow-[0_12px_32px_-4px_rgba(15,23,42,0.08),inset_0_1.5px_0_0_rgba(255,255,255,1)]">
          {[
            { id: "kpi", label: "KPI Analysis", icon: Award, baseColor: "amber" },
            { id: "factSheet", label: "State Fact Sheet", icon: FileText, baseColor: "teal" },
            { id: "single", label: "Detailed Analysis", icon: LayoutDashboard, baseColor: "blue" },
            { id: "advancedAnalysis", label: "Advanced Data Analysis", icon: Activity, baseColor: "indigo" },
            { id: "ranking", label: "Ranking Stats", icon: TrendingUp, baseColor: "violet" },
            { id: "ussl", label: "USSL & Piper Analysis", icon: Compass, baseColor: "cyan" },
            { id: "combination", label: "Combination Analysis", icon: Layers, baseColor: "teal" },
            { id: "pca", label: "PCA Analysis", icon: Cpu, baseColor: "purple" },
            { id: "hydrochemistry", label: "Hydrochemistry Sheet", icon: TableProperties, baseColor: "emerald" },
            { id: "calculatorius", label: "Calculatorius", icon: Calculator, baseColor: "blue" },
            { id: "gis", label: "Geospatial Map Module", icon: Globe, baseColor: "teal" },
            { id: "shapefileFilter", label: "Shapefile Spatial Filter", icon: MapPin, baseColor: "emerald" },
            { id: "sector", label: "Sector Analysis", icon: Compass, baseColor: "indigo" },
            { id: "master", label: "Master Summary", icon: Table2, baseColor: "amber" },
            { id: "monsoon", label: "Dynamic Monsoon Impact", icon: Database, baseColor: "emerald" },
            { id: "bar", label: "Comparative Exceedance (Bar)", icon: BarChart3, baseColor: "orange" },
            { id: "aisummary", label: "District Pamphlet", icon: LayoutTemplate, baseColor: "fuchsia" },
            { id: "bulletin", label: "Annual Ground Water Quality Report", icon: FileText, baseColor: "rose" },
            { id: "fortnightly", label: "Fortnightly Quality Alerts", icon: AlertTriangle, baseColor: "red" },
            { id: "limits", label: "Limits Manager", icon: Settings, baseColor: "indigo" },
          ].map((tabItem) => {
            const IconComponent = tabItem.icon;
            const isActive = activeTab === tabItem.id;
            
            const colorMap: Record<string, { activeBg: string; ring: string; iconColor: string }> = {
              blue: {
                activeBg: "bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-700 text-white shadow-[0_8px_20px_rgba(37,99,235,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-blue-700",
                ring: "ring-blue-400",
                iconColor: "text-blue-600",
              },
              indigo: {
                activeBg: "bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-800 text-white shadow-[0_8px_20px_rgba(79,70,229,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-indigo-700",
                ring: "ring-indigo-400",
                iconColor: "text-indigo-600",
              },
              violet: {
                activeBg: "bg-gradient-to-r from-violet-600 via-violet-600 to-purple-700 text-white shadow-[0_8px_20px_rgba(124,58,237,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-violet-700",
                ring: "ring-violet-400",
                iconColor: "text-violet-600",
              },
              purple: {
                activeBg: "bg-gradient-to-r from-purple-600 via-purple-600 to-purple-800 text-white shadow-[0_8px_20px_rgba(147,51,234,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-purple-700",
                ring: "ring-purple-400",
                iconColor: "text-purple-600",
              },
              teal: {
                activeBg: "bg-gradient-to-r from-teal-600 via-teal-600 to-emerald-700 text-white shadow-[0_8px_20px_rgba(13,148,136,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-teal-700",
                ring: "ring-teal-400",
                iconColor: "text-teal-600",
              },
              cyan: {
                activeBg: "bg-gradient-to-r from-cyan-600 via-cyan-600 to-blue-700 text-white shadow-[0_8px_20px_rgba(8,145,178,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-cyan-700",
                ring: "ring-cyan-400",
                iconColor: "text-cyan-600",
              },
              emerald: {
                activeBg: "bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-700 text-white shadow-[0_8px_20px_rgba(5,150,105,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-emerald-700",
                ring: "ring-emerald-400",
                iconColor: "text-emerald-600",
              },
              amber: {
                activeBg: "bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white shadow-[0_8px_20px_rgba(217,119,6,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-amber-600",
                ring: "ring-amber-400",
                iconColor: "text-amber-600",
              },
              orange: {
                activeBg: "bg-gradient-to-r from-orange-500 via-orange-600 to-red-600 text-white shadow-[0_8px_20px_rgba(234,88,12,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-orange-600",
                ring: "ring-orange-400",
                iconColor: "text-orange-600",
              },
              fuchsia: {
                activeBg: "bg-gradient-to-r from-fuchsia-600 via-fuchsia-600 to-pink-700 text-white shadow-[0_8px_20px_rgba(192,38,211,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-fuchsia-700",
                ring: "ring-fuchsia-400",
                iconColor: "text-fuchsia-600",
              },
              rose: {
                activeBg: "bg-gradient-to-r from-rose-600 via-rose-600 to-rose-800 text-white shadow-[0_8px_20px_rgba(225,29,72,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-rose-700",
                ring: "ring-rose-400",
                iconColor: "text-rose-600",
              },
              red: {
                activeBg: "bg-gradient-to-r from-red-600 via-red-600 to-rose-700 text-white shadow-[0_8px_20px_rgba(220,38,38,0.35),inset_0_1.5px_0_rgba(255,255,255,0.6)] border-red-700",
                ring: "ring-red-400",
                iconColor: "text-red-600",
              },
            };

            const style = colorMap[tabItem.baseColor] || colorMap.blue;

            return (
              <button
                key={tabItem.id}
                onClick={() => setActiveTab(tabItem.id as ActiveTab)}
                className={`
                  whitespace-nowrap px-4 py-2.5 rounded-2xl font-extrabold text-xs flex items-center gap-2 select-none transition-all duration-200 cursor-pointer border
                  ${isActive 
                    ? `${style.activeBg} translate-y-[1px] ring-2 ${style.ring} ring-offset-2 backdrop-blur-md` 
                    : `bg-gradient-to-b from-white/95 via-white/80 to-slate-100/90 text-slate-800 border-white/95 backdrop-blur-md shadow-[0_6px_16px_rgba(15,23,42,0.06),inset_0_2px_0_rgba(255,255,255,1),inset_0_0_10px_rgba(255,255,255,0.8),inset_0_-1.5px_0_rgba(0,0,0,0.05)] hover:border-indigo-300 hover:text-indigo-950 hover:translate-y-[-1.5px] hover:shadow-[0_10px_22px_rgba(79,70,229,0.18),inset_0_2px_0_rgba(255,255,255,1)] active:translate-y-[1px]`
                  }
                `}
              >
                <IconComponent className={`w-4 h-4 transition-transform ${isActive ? "scale-110 opacity-100 text-white" : `${style.iconColor} opacity-90`}`} />
                {tabItem.label}
              </button>
            );
          })}

          {/* Separation line for clear visual layout */}
          <div className="h-8 w-[2px] bg-slate-200 self-center mx-2 hidden xl:block" />

          {/* Desktop Right Action Panel - Side by side with Limits Manager */}
          <div className="flex items-center gap-3 ml-auto">
            <div className="flex items-center gap-1.5 bg-slate-100/80 border border-slate-200 px-2.5 py-1.5 rounded-xl shadow-inner mr-2">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Table Font:</span>
              <select
                value={tableFont}
                onChange={(e) => setTableFont(e.target.value)}
                className="text-[10px] font-black text-indigo-950 bg-transparent border-none focus:ring-0 cursor-pointer focus:outline-none uppercase"
              >
                <option value="Inter">Inter</option>
                <option value="Roboto">Roboto</option>
                <option value="Poppins">Poppins</option>
                <option value="Manrope">Manrope</option>
                <option value="IBM Plex Sans">IBM Plex</option>
                <option value="Segoe UI">Segoe UI</option>
              </select>
            </div>

            <button
              onClick={downloadWaterQualityTemplate}
              className="px-3.5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-sm text-white bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-700 border border-indigo-400/80 hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer"
              title="Download official Excel template with pre-configured static details and parameter unit headers"
            >
              <Download className="w-3.5 h-3.5 text-white" /> Download Template (.xlsx)
            </button>

            {rawData.length > 0 && (
              <button
                onClick={handleExportIndividual}
                className="glossy-btn-emerald px-4 py-2 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-sm text-white"
              >
                <Download className="w-3.5 h-3.5 text-white" /> Export Styled Report
              </button>
            )}

            <div className={`text-white font-extrabold text-[11px] tracking-widest px-4 py-2 rounded-2xl select-none animate-pulse flex items-center justify-center min-w-[75px] border transition-all duration-300 ${
              rawData.length > 0 
                ? "bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_4px_10px_rgba(59,130,246,0.4),inset_0_-2px_4px_rgba(0,0,0,0.2),inset_0_2px_4px_rgba(255,255,255,0.3)] border-blue-600/50" 
                : "bg-gradient-to-b from-red-500 to-red-700 shadow-[0_4px_10px_rgba(239,68,68,0.4),inset_0_-2px_4px_rgba(0,0,0,0.2),inset_0_2px_4px_rgba(255,255,255,0.3)] border-red-600/50"
            }`}>
              READY
            </div>

            <label className="cursor-pointer glossy-btn-dark px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 select-none shadow-sm border border-slate-300 bg-slate-900 hover:bg-slate-800 text-white transition-all">
              <UploadCloud className="w-3.5 h-3.5 text-slate-300" /> Upload Excel or CSV
              <input type="file" onChange={handleFileUpload} className="hidden" accept=".xlsx, .xls, .csv" />
            </label>
          </div>
        </div>

        {/* Tab Canvas Content Blocks */}
        <div className="glass-tab-view space-y-6">
          
          {/* Default Upload Placement Helper */}
          {rawData.length === 0 && activeTab !== "about" && activeTab !== "guidelines" && (
            <div className="mb-6 mx-auto max-w-full bg-slate-900 border-l-4 border-amber-500 rounded-2xl p-4 shadow-md backdrop-blur-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 rounded-xl shrink-0">
                    <Database className="w-5 h-5 text-amber-400 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">No Custom Spreadsheet Loaded</h4>
                    <p className="text-[10px] font-bold text-slate-300 tracking-wide mt-0.5">
                      Download our pre-structured Excel data template with static location details & parameter units, populate your measurements, and upload.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={downloadWaterQualityTemplate}
                    className="px-3.5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 flex items-center gap-2 shadow-sm transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-950" /> Download Data Template (.xlsx)
                  </button>

                  <label className="cursor-pointer px-3.5 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 shadow-sm transition-all">
                    <UploadCloud className="w-3.5 h-3.5 text-white" /> Upload Data File
                    <input type="file" onChange={handleFileUpload} className="hidden" accept=".xlsx, .xls, .csv" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === "single" && (
            <DetailedView
              rawData={yearSeasonFilteredData}
              headers={headers}
              headerMap={headerMap}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
              reportingLevel={reportingLevel}
              activeParam={activeParam}
              setActiveParam={setActiveParam}
              exportParams={exportParams}
              setExportParams={setExportParams}
              combinedParams={combinedParams}
              setCombinedParams={setCombinedParams}
              exportIndividualExceedance={exportIndividualExceedance}
              setExportIndividualExceedance={setExportIndividualExceedance}
              exportCombinedExceedance={exportCombinedExceedance}
              setExportCombinedExceedance={setExportCombinedExceedance}
              sharedBulletinMaps={sharedBulletinMaps}
              setSharedBulletinMaps={setSharedBulletinMaps}
              allRawData={rawData}
              selectedYear={selectedYear}
              selectedSeason={selectedSeason}
              layers={sharedLayers}
              setLayers={setSharedLayers}
            />
          )}

          {activeTab === "ranking" && (
            <RankingStatsView
              rawData={yearSeasonFilteredData}
              headers={headers}
              headerMap={headerMap}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
            />
          )}

          {activeTab === "master" && (
            <ErrorBoundary>
              <MasterSummaryView
                rawData={yearSeasonFilteredData}
                headers={headers}
                headerMap={headerMap}
                selectedState={selectedState}
                selectedDistrict={selectedDistrict}
                onExportExcel={handleExportIndividual}
                reportingLevel={reportingLevel}
                showToast={showToast}
              />
            </ErrorBoundary>
          )}

          {activeTab === "monsoon" && (
            <MonsoonImpactView
              rawData={yearFilteredData}
              headers={headers}
              headerMap={headerMap}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
              sharedLayers={sharedLayers}
            />
          )}

          {activeTab === "bar" && (
            <ComparisonsView
              rawData={yearSeasonFilteredData}
              headers={headers}
              headerMap={headerMap}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
            />
          )}

          {activeTab === "aisummary" && (
            <PamphletView
              rawData={yearSeasonFilteredData}
              headers={headers}
              headerMap={headerMap}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
            />
          )}

          {activeTab === "bulletin" && (
            <ErrorBoundary>
              <BulletinView
                rawData={yearFilteredData}
                headers={headers}
                headerMap={headerMap}
                selectedState={selectedState}
                bulletinMaps={sharedBulletinMaps}
                setBulletinMaps={setSharedBulletinMaps}
              />
            </ErrorBoundary>
          )}

          {activeTab === "fortnightly" && (
            <FortnightlyAlertsView
              rawData={yearFilteredData}
              headers={headers}
              headerMap={headerMap}
              selectedState={selectedState}
            />
          )}

          {activeTab === "combination" && (
            <CombinationAnalysisView
              rawData={rawData}
              headers={headers}
              headerMap={headerMap}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
              selectedYear={selectedYear}
              selectedSeason={selectedSeason}
              layers={sharedLayers}
            />
          )}

          {activeTab === "pca" && (
            <PcaAnalysisView
              rawData={yearSeasonFilteredData}
              headers={headers}
              headerMap={headerMap}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
              showToast={showToast}
            />
          )}

          <div className={activeTab === "ussl" ? "block" : "hidden"}>
            <UsslPiperAnalysisView
              mainRawData={yearSeasonFilteredData}
              mainHeaders={headers}
              showToast={showToast}
              isVisible={activeTab === "ussl"}
              bulletinMaps={sharedBulletinMaps}
              setBulletinMaps={setSharedBulletinMaps}
              setGlobalRawData={setRawData}
              setGlobalHeaders={setHeaders}
              setGlobalHeaderMap={setHeaderMap}
            />
          </div>

          <div className={activeTab === "hydrochemistry" ? "block" : "hidden"}>
            <HydrochemistryView
              rawData={yearSeasonFilteredData}
              mainHeaders={headers}
              showToast={showToast}
              isVisible={activeTab === "hydrochemistry"}
            />
          </div>

          <div className={activeTab === "calculatorius" ? "block" : "hidden"}>
            <CalculatoriusView rawData={rawData} headerMap={headerMap} headers={headers} />
          </div>

          <div className={activeTab === "gis" ? "block" : "hidden"}>
            <ErrorBoundary>
              <GisMapView
                rawData={yearSeasonFilteredData}
                headers={headers}
                headerMap={headerMap}
                selectedState={selectedState}
                selectedDistrict={selectedDistrict}
                showToast={showToast}
                isVisible={activeTab === "gis"}
                bulletinMaps={sharedBulletinMaps}
                setBulletinMaps={setSharedBulletinMaps}
                layers={sharedLayers}
                setLayers={setSharedLayers}
                choroplethClasses={choroplethClasses}
                setChoroplethClasses={setChoroplethClasses}
              />
            </ErrorBoundary>
          </div>

          <div className={activeTab === "shapefileFilter" ? "block" : "hidden"}>
            <ErrorBoundary>
              <ShapefileFilterView
                rawData={yearSeasonFilteredData}
                headers={headers}
                headerMap={headerMap}
                selectedState={selectedState}
                selectedDistrict={selectedDistrict}
                showToast={showToast}
                isVisible={activeTab === "shapefileFilter"}
                sharedLayers={sharedLayers}
                setSharedLayers={setSharedLayers}
                setGlobalRawData={setRawData}
              />
            </ErrorBoundary>
          </div>

          <div className={activeTab === "sector" ? "block" : "hidden"}>
            <ErrorBoundary>
              <SectorAnalysisView
                rawData={yearSeasonFilteredData}
                allRawData={rawData}
                filteredRawData={yearSeasonFilteredData}
                setRawData={setRawData}
                headers={headers}
                setHeaders={setHeaders}
                headerMap={headerMap}
                setHeaderMap={setHeaderMap}
                selectedState={selectedState}
                selectedDistrict={selectedDistrict}
                selectedYear={selectedYear}
                selectedSeason={selectedSeason}
                sharedLayers={sharedLayers}
                setSharedLayers={setSharedLayers}
                isVisible={activeTab === "sector"}
                showToast={showToast}
              />
            </ErrorBoundary>
          </div>


          {activeTab === "limits" && (
            <ErrorBoundary>
              <LimitsManagerView
                headers={headers}
                uploadedHeaders={uploadedHeaders}
                headerMap={headerMap}
                onLimitsChanged={() => setLimitsVersion((v) => v + 1)}
                showToast={showToast}
                onUpdateHeaders={(newHeaders, newHeaderMap) => {
                  setHeaders(newHeaders);
                  setHeaderMap(newHeaderMap);
                  if (newHeaders.params && newHeaders.params.length > 0) {
                    setExportParams([...newHeaders.params]);
                    setCombinedParams([...newHeaders.params]);
                  }
                }}
              />
            </ErrorBoundary>
          )}

          <div className={activeTab === "advancedAnalysis" ? "block" : "hidden"}>
            <ErrorBoundary>
              <AdvancedAnalysisView
                rawData={yearSeasonFilteredData}
                headers={headers}
                headerMap={headerMap}
                selectedState={selectedState}
                selectedDistrict={selectedDistrict}
                showToast={showToast}
                isVisible={activeTab === "advancedAnalysis"}
              />
            </ErrorBoundary>
          </div>

          {activeTab === "kpi" && (
            <KpiView
              rawData={yearSeasonFilteredData}
              setRawData={setRawData}
              headers={headers}
              headerMap={headerMap}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
              selectedYear={selectedYear}
              selectedSeason={selectedSeason}
              reportingLevel={reportingLevel}
              sharedLayers={sharedLayers}
              setSharedLayers={setSharedLayers}
              choroplethClasses={choroplethClasses}
              setChoroplethClasses={setChoroplethClasses}
              showToast={showToast}
            />
          )}

          {activeTab === "factSheet" && (
            <ErrorBoundary>
              <FactSheetView
                rawData={yearSeasonFilteredData}
                allRawData={rawData}
                headers={headers}
                headerMap={headerMap}
                selectedState={selectedState}
                setSelectedState={setSelectedState}
                selectedDistrict={selectedDistrict}
                setSelectedDistrict={setSelectedDistrict}
                selectedYear={selectedYear}
                selectedSeason={selectedSeason}
                sharedLayers={sharedLayers}
                sharedBulletinMaps={sharedBulletinMaps}
                setSharedBulletinMaps={setSharedBulletinMaps}
                onNavigateToGis={() => setActiveTab("gis")}
                showToast={showToast}
              />
            </ErrorBoundary>
          )}

        </div>

      </div>
    </div>
  );
}
