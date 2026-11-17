import React, { useState, useMemo, useEffect, useRef } from "react";
import * as turf from "@turf/turf";
import ExcelJS from "exceljs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  PageOrientation,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  VerticalAlign
} from "docx";
import { downloadExcelJSWorkbook } from "../utils/excelFormatter";
import { safeHtml2canvas } from "../utils/colorSanitizer";
import { DataHeaders, ShapefileLayer } from "../types";
import { PARAM_CONFIG } from "../data/config";
import { INDIA_BOUNDARY } from "../data/india_boundary";
import { toProperCase, norm, isStateAll, isDistrictAll } from "../utils/shapefileFilter";
import { findAlertRemedialMeasure } from "../data/alertRemedialMeasures";
import {
  Filter,
  Download,
  Printer,
  FileSpreadsheet,
  FileText,
  Compass,
  Sparkles,
  X,
  ExternalLink,
  ChevronDown,
  Layout,
  Maximize2,
  Sliders,
  RotateCcw,
  Image as ImageIcon,
  Check,
  Type,
  Palette
} from "lucide-react";

interface FactSheetViewProps {
  rawData: any[];
  allRawData?: any[];
  headers: DataHeaders;
  headerMap: Record<string, string>;
  selectedState?: string;
  setSelectedState?: (state: string) => void;
  selectedDistrict?: string;
  setSelectedDistrict?: (district: string) => void;
  selectedYear?: string;
  selectedSeason?: string;
  sharedLayers?: ShapefileLayer[];
  sharedBulletinMaps?: Record<string, string>;
  setSharedBulletinMaps?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onNavigateToGis?: () => void;
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
}

// Canonical CGWB Prevalent Contaminants (IS 10500:2012)
const CANONICAL_PREVALENT_KEYS = ["EC", "F", "NO3", "As", "U"];

// Visual color schemes for hydrochemical parameters in infographic
const PARAMETER_THEMES: Record<string, { color: string; textColor: string; gradient: string }> = {
  EC: { color: "#fef08a", textColor: "#854d0e", gradient: "from-[#fef08a] to-[#fde047]" },
  F: { color: "#bae6fd", textColor: "#0369a1", gradient: "from-[#bae6fd] to-[#7dd3fc]" },
  NO3: { color: "#fde68a", textColor: "#92400e", gradient: "from-[#fde68a] to-[#fcd34d]" },
  As: { color: "#fed7aa", textColor: "#9a3412", gradient: "from-[#fed7aa] to-[#fdba74]" },
  U: { color: "#bbf7d0", textColor: "#166534", gradient: "from-[#bbf7d0] to-[#86efac]" },
  pH: { color: "#e9d5ff", textColor: "#6b21a8", gradient: "from-[#e9d5ff] to-[#d8b4fe]" },
  TDS: { color: "#fed7aa", textColor: "#9a3412", gradient: "from-[#fed7aa] to-[#f97316]" },
  TH: { color: "#fbcfe8", textColor: "#9d174d", gradient: "from-[#fbcfe8] to-[#f472b6]" },
  Cl: { color: "#c7d2fe", textColor: "#3730a3", gradient: "from-[#c7d2fe] to-[#818cf8]" },
  SO4: { color: "#ffedd5", textColor: "#9a3412", gradient: "from-[#ffedd5] to-[#fdba74]" },
  Fe: { color: "#fecdd3", textColor: "#9f1239", gradient: "from-[#fecdd3] to-[#fb7185]" },
  Ca: { color: "#e2e8f0", textColor: "#334155", gradient: "from-[#e2e8f0] to-[#cbd5e1]" },
  Mg: { color: "#e2e8f0", textColor: "#334155", gradient: "from-[#e2e8f0] to-[#cbd5e1]" }
};

// 3 Standard CGWB Electrical Conductivity Color Classes
const EC_CLASSES = [
  { min: 0, max: 750, color: "#0070c0", label: "< 750" },
  { min: 750, max: 3000, color: "#ffff00", label: "750 to 3000" },
  { min: 3000, max: 999999, color: "#ff3300", label: "> 3000" }
];

const getEcClassColor = (val: number): string => {
  if (val <= 750) return "#0070c0"; // Blue
  if (val <= 3000) return "#ffff00"; // Yellow
  return "#ff3300"; // Red / Orange-Red
};

const toNormalTitleCase = (str: string): string => {
  if (!str) return "";
  return str.replace(/\b([a-zA-Z])([a-zA-Z]*)/g, (_, first, rest) => first.toUpperCase() + rest.toLowerCase());
};

// Known approximate centers of Indian States for Inset Locator Map
const STATE_CENTROIDS: Record<string, { lat: number; lon: number; name: string }> = {
  "gujarat": { lat: 22.25, lon: 71.19, name: "Gujarat" },
  "rajasthan": { lat: 27.02, lon: 74.21, name: "Rajasthan" },
  "maharashtra": { lat: 19.75, lon: 75.71, name: "Maharashtra" },
  "madhya pradesh": { lat: 22.97, lon: 78.65, name: "Madhya Pradesh" },
  "uttar pradesh": { lat: 26.84, lon: 80.94, name: "Uttar Pradesh" },
  "bihar": { lat: 25.09, lon: 85.31, name: "Bihar" },
  "west bengal": { lat: 22.98, lon: 87.85, name: "West Bengal" },
  "odisha": { lat: 20.95, lon: 85.09, name: "Odisha" },
  "andhra pradesh": { lat: 15.91, lon: 79.74, name: "Andhra Pradesh" },
  "telangana": { lat: 18.11, lon: 79.01, name: "Telangana" },
  "karnataka": { lat: 15.31, lon: 75.71, name: "Karnataka" },
  "tamil nadu": { lat: 11.12, lon: 78.65, name: "Tamil Nadu" },
  "kerala": { lat: 10.85, lon: 76.27, name: "Kerala" },
  "punjab": { lat: 31.14, lon: 75.34, name: "Punjab" },
  "haryana": { lat: 29.05, lon: 76.08, name: "Haryana" },
  "himachal pradesh": { lat: 31.10, lon: 77.17, name: "Himachal Pradesh" },
  "uttarakhand": { lat: 30.06, lon: 79.01, name: "Uttarakhand" },
  "jammu and kashmir": { lat: 33.77, lon: 76.57, name: "Jammu & Kashmir" },
  "jammu & kashmir": { lat: 33.77, lon: 76.57, name: "Jammu & Kashmir" },
  "ladakh": { lat: 34.15, lon: 77.57, name: "Ladakh" },
  "assam": { lat: 26.20, lon: 92.93, name: "Assam" },
  "jharkhand": { lat: 23.61, lon: 85.27, name: "Jharkhand" },
  "chhattisgarh": { lat: 21.27, lon: 81.86, name: "Chhattisgarh" },
  "goa": { lat: 15.29, lon: 74.12, name: "Goa" },
  "tripura": { lat: 23.94, lon: 91.98, name: "Tripura" },
  "meghalaya": { lat: 25.46, lon: 91.36, name: "Meghalaya" },
  "manipur": { lat: 24.66, lon: 93.90, name: "Manipur" },
  "nagaland": { lat: 26.15, lon: 94.56, name: "Nagaland" },
  "mizoram": { lat: 23.16, lon: 92.93, name: "Mizoram" },
  "arunachal pradesh": { lat: 28.21, lon: 94.72, name: "Arunachal Pradesh" },
  "sikkim": { lat: 27.53, lon: 88.51, name: "Sikkim" },
  "delhi": { lat: 28.70, lon: 77.10, name: "Delhi" }
};

export default function FactSheetView({
  rawData,
  allRawData = [],
  headers,
  headerMap,
  selectedState: globalState = "",
  setSelectedState: setGlobalState,
  selectedDistrict = "",
  selectedYear = "",
  selectedSeason = "",
  sharedLayers = [],
  sharedBulletinMaps = {},
  setSharedBulletinMaps,
  onNavigateToGis,
  showToast
}: FactSheetViewProps) {
  // Use complete rawData as base, falling back to allRawData if rawData is filtered
  const sourceDataset = useMemo(() => {
    return allRawData && allRawData.length > 0 ? allRawData : rawData;
  }, [allRawData, rawData]);

  // Extract list of all unique states from dataset
  const stateList = useMemo(() => {
    const set = new Set<string>();
    const stateCol = headers.state || "State";
    sourceDataset.forEach((row) => {
      const val = row[stateCol] || row["State"] || row["STATE"] || row["state"];
      if (val && String(val).trim()) {
        const clean = String(val).trim();
        if (!isStateAll(clean)) {
          set.add(clean);
        }
      }
    });
    return Array.from(set).sort();
  }, [sourceDataset, headers.state]);

  // Local State selection for Fact Sheet
  const [activeState, setActiveState] = useState<string>(() => {
    if (globalState && !isStateAll(globalState) && stateList.includes(globalState)) {
      return globalState;
    }
    return stateList.length > 0 ? stateList[0] : "";
  });

  // Sync when globalState changes externally
  useEffect(() => {
    if (globalState && !isStateAll(globalState) && stateList.includes(globalState)) {
      setActiveState(globalState);
    } else if (!activeState && stateList.length > 0) {
      setActiveState(stateList[0]);
    }
  }, [globalState, stateList]);

  // Helper: Filter dataset for any given State / UT
  const getStateRows = (targetState: string) => {
    if (!targetState || isStateAll(targetState)) return sourceDataset;
    const stateCol = headers.state || "State";
    const targetNorm = norm(targetState);
    return sourceDataset.filter((row) => {
      const val = String(row[stateCol] || row["State"] || row["STATE"] || "").trim();
      const rowNorm = norm(val);
      return rowNorm && (rowNorm === targetNorm || rowNorm.includes(targetNorm) || targetNorm.includes(rowNorm));
    });
  };

  // Helper: Derived Year & Season text for any state's rows
  const getAssessmentPeriodForRows = (rows: any[]) => {
    if (rows.length === 0) return "";
    const seasonCol = headers.season || "Season";
    const yearCol = headers.year || "Year";
    const seasons = new Set<string>();
    const years = new Set<string>();
    rows.forEach((r) => {
      const s = r[seasonCol] || r["SEASON"] || r["season"];
      if (s && String(s).trim()) seasons.add(String(s).trim());
      const y = r[yearCol] || r["YEAR"] || r["year"];
      if (y && String(y).trim()) years.add(String(y).trim());
    });
    const sStr = Array.from(seasons).slice(0, 2).join("/");
    const yArr = Array.from(years).sort();
    const yStr = yArr.length === 1 ? yArr[0] : yArr.length > 1 ? `${yArr[0]}-${yArr[yArr.length - 1]}` : "";
    return `${sStr} ${yStr}`.trim();
  };

  // Filter dataset for active state
  const stateData = useMemo(() => {
    return getStateRows(activeState);
  }, [sourceDataset, activeState, headers.state]);

  // Derived Year & Season text for the fact sheet header (e.g. "Pre-Monsoon 2023")
  const assessmentPeriod = useMemo(() => {
    return getAssessmentPeriodForRows(stateData);
  }, [stateData, headers.season, headers.year]);

  // Helper to extract numeric value from a row for any parameter key
  const getRowVal = (row: any, paramKey: string): number | null => {
    if (!row) return null;

    // 1. Check via headerMap
    const mappedCol = headerMap[paramKey];
    if (mappedCol && row[mappedCol] !== undefined && row[mappedCol] !== null && String(row[mappedCol]).trim() !== "") {
      const val = parseFloat(String(row[mappedCol]).replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // 2. Direct column name match
    if (row[paramKey] !== undefined && row[paramKey] !== null && String(row[paramKey]).trim() !== "") {
      const val = parseFloat(String(row[paramKey]).replace(/,/g, ""));
      if (!isNaN(val)) return val;
    }

    // 3. Match aliases from PARAM_CONFIG
    const cfg = PARAM_CONFIG[paramKey];
    if (cfg && cfg.keywords) {
      for (const kw of cfg.keywords) {
        for (const k in row) {
          if (norm(k) === norm(kw)) {
            const val = parseFloat(String(row[k]).replace(/,/g, ""));
            if (!isNaN(val)) return val;
          }
        }
      }
    }

    // 4. Case-insensitive column match
    const pNorm = norm(paramKey);
    for (const k in row) {
      if (norm(k) === pNorm) {
        const val = parseFloat(String(row[k]).replace(/,/g, ""));
        if (!isNaN(val)) return val;
      }
    }

    return null;
  };

  // Available parameters present in dataset or config
  const availableDatasetParams = useMemo(() => {
    const list: { key: string; name: string; unit: string; limitStr: string; numericLimit: number }[] = [];
    const checkedKeys = new Set<string>();

    CANONICAL_PREVALENT_KEYS.forEach((k) => {
      const cfg = PARAM_CONFIG[k];
      if (cfg) {
        list.push({
          key: k,
          name: cfg.name || k,
          unit: cfg.unit || "",
          limitStr: `${cfg.b2} ${cfg.unit || ""}`.trim(),
          numericLimit: cfg.b2 || 0
        });
        checkedKeys.add(k);
      }
    });

    Object.keys(PARAM_CONFIG).forEach((k) => {
      if (checkedKeys.has(k)) return;
      const cfg = PARAM_CONFIG[k];
      if (!cfg || cfg.b2 === undefined || cfg.b2 <= 0) return;

      list.push({
        key: k,
        name: cfg.name || k,
        unit: cfg.unit || "",
        limitStr: `${cfg.b2} ${cfg.unit || ""}`.trim(),
        numericLimit: cfg.b2 || 0
      });
      checkedKeys.add(k);
    });

    return list;
  }, []);

  // Selected parameters state: defaults to 5 prevalent, but user can choose 1 or more
  const [selectedParamKeys, setSelectedParamKeys] = useState<string[]>(CANONICAL_PREVALENT_KEYS);
  const [paramPickerOpen, setParamPickerOpen] = useState(false);
  const [showOnlyExceededParamsInPicker, setShowOnlyExceededParamsInPicker] = useState(true);
  const [hideNonCoreZeroExceedance, setHideNonCoreZeroExceedance] = useState(true);

  // Per-parameter exceedance summary for the active State/UT (used to filter Parameters picker & presets)
  const stateParamExceedanceMap = useMemo(() => {
    const map: Record<string, { validCount: number; exceedCount: number; exceedPct: number }> = {};
    availableDatasetParams.forEach((p) => {
      let validCount = 0;
      let exceedCount = 0;
      stateData.forEach((row) => {
        const val = getRowVal(row, p.key);
        if (val !== null && !isNaN(val)) {
          validCount++;
          if (val > p.numericLimit) {
            exceedCount++;
          }
        }
      });
      const denom = validCount > 0 ? validCount : stateData.length;
      map[p.key] = {
        validCount,
        exceedCount,
        exceedPct: denom > 0 ? (exceedCount / denom) * 100 : 0
      };
    });
    return map;
  }, [availableDatasetParams, stateData, headers, headerMap]);

  // 5 Core parameters (EC, F, NO3, As, U) are always kept even with 0 exceedances; others only when exceedCount > 0
  const corePlusExceededParamKeys = useMemo(
    () =>
      availableDatasetParams
        .filter(
          (p) =>
            CANONICAL_PREVALENT_KEYS.includes(p.key) ||
            (stateParamExceedanceMap[p.key]?.exceedCount || 0) > 0
        )
        .map((p) => p.key),
    [availableDatasetParams, stateParamExceedanceMap]
  );

  // Toggle individual parameter
  const handleToggleParam = (paramKey: string) => {
    setSelectedParamKeys((prev) => {
      if (prev.includes(paramKey)) {
        if (prev.length <= 1) {
          if (showToast) showToast("At least one parameter must remain selected.", "info");
          return prev;
        }
        return prev.filter((k) => k !== paramKey);
      } else {
        return [...prev, paramKey];
      }
    });
  };

  // Helper: Parameter Compliance & Exceedance Stats for any State/UT row set
  const getComputedTableStatsForRows = (rows: any[]) => {
    const distCol = headers.district || "District";
    const totalStateSamples = rows.length;

    return selectedParamKeys.map((key) => {
      const cfg = PARAM_CONFIG[key] || { name: key, b2: 10, unit: "" };
      const theme = PARAMETER_THEMES[key] || {
        color: "#f1f5f9",
        textColor: "#0f172a",
        gradient: "from-slate-100 to-slate-200"
      };

      let validCount = 0;
      let exceedCount = 0;
      const affectedDistrictsSet = new Set<string>();

      rows.forEach((row) => {
        const val = getRowVal(row, key);
        if (val !== null && !isNaN(val)) {
          validCount++;
          if (val > (cfg.b2 || 0)) {
            exceedCount++;
            const d = String(row[distCol] || row["District"] || row["DISTRICT"] || "").trim();
            if (d && !isStateAll(d)) {
              affectedDistrictsSet.add(toProperCase(d));
            }
          }
        }
      });

      const sampleCount = validCount > 0 ? validCount : totalStateSamples;
      const exceedPct = sampleCount > 0 ? (exceedCount / sampleCount) * 100 : 0;
      const affectedDistricts = Array.from(affectedDistrictsSet).sort();

      let cleanName = cfg.name || key;
      if (key === "EC") cleanName = "EC";
      else if (key === "F") cleanName = "Fluoride";
      else if (key === "NO3") cleanName = "Nitrate";
      else if (key === "As") cleanName = "Arsenic";
      else if (key === "U") cleanName = "Uranium";

      return {
        key,
        name: cleanName,
        limitStr: `${cfg.b2} ${cfg.unit || ""}`.trim(),
        numericLimit: cfg.b2 || 0,
        unit: cfg.unit || "",
        sampleCount,
        exceedCount,
        exceedPct,
        affectedDistricts,
        theme
      };
    }).filter((item) => {
      if (!hideNonCoreZeroExceedance) return true;
      return CANONICAL_PREVALENT_KEYS.includes(item.key) || item.exceedCount > 0;
    });
  };

  // Helper: Extract EC Spatial Points for IDW Map from any State/UT row set
  const getEcSpatialPointsForRows = (rows: any[]) => {
    const latCol = headers.latitude || "Latitude";
    const lonCol = headers.longitude || "Longitude";
    const distCol = headers.district || "District";
    const blockCol = headers.block || "Block";
    const locCol = headers.location || "Location";

    const points: {
      lat: number;
      lon: number;
      ec: number;
      district: string;
      block: string;
      location: string;
    }[] = [];

    rows.forEach((row) => {
      const latRaw = row[latCol] || row["Latitude"] || row["lat"] || row["LATITUDE"];
      const lonRaw = row[lonCol] || row["Longitude"] || row["lon"] || row["LONGITUDE"];
      const lat = parseFloat(String(latRaw));
      const lon = parseFloat(String(lonRaw));

      if (!isNaN(lat) && !isNaN(lon) && lat >= 6 && lat <= 38 && lon >= 66 && lon <= 98) {
        const ecVal = getRowVal(row, "EC");
        if (ecVal !== null && !isNaN(ecVal) && ecVal > 0) {
          const dist = String(row[distCol] || row["District"] || "").trim();
          const blk = String(row[blockCol] || row["Block"] || "").trim();
          const loc = String(row[locCol] || row["Location"] || row["Well ID"] || "Station").trim();

          points.push({
            lat,
            lon,
            ec: ecVal,
            district: dist,
            block: blk,
            location: loc
          });
        }
      }
    });

    return points;
  };

  // Helper: State Centroid & Bounding info (Prioritizes true shapefile geometry when available)
  const getStateSpatialInfoForState = (
    targetState: string,
    spatialPts: { lat: number; lon: number }[]
  ) => {
    const normSt = norm(targetState);

    // 1. Check if uploaded or shared GeoJSON layers contain the state boundary polygon
    for (const layer of sharedLayers) {
      if (!layer.geoJson) continue;
      const features = layer.geoJson.features || (layer.geoJson.type === "Feature" ? [layer.geoJson] : []);
      const matched = features.filter((f: any) => {
        const p = f.properties || {};
        const fState = String(p.state || p.STATE || p.State || p.ST_NM || p.st_nm || p.NAME_1 || "").trim();
        return fState && (norm(fState) === normSt || norm(fState).includes(normSt));
      });
      if (matched.length > 0) {
        try {
          const combined = matched.length === 1 ? matched[0] : turf.combine(turf.featureCollection(matched)).features[0];
          const bbox = turf.bbox(combined); // [minLon, minLat, maxLon, maxLat]
          const center = turf.center(combined);
          return {
            centroid: [center.geometry.coordinates[1], center.geometry.coordinates[0]] as [number, number],
            bounds: { minLat: bbox[1], maxLat: bbox[3], minLon: bbox[0], maxLon: bbox[2] }
          };
        } catch {
          // ignore
        }
      }
    }

    // 2. Compute bounding box from monitoring station coordinates
    if (spatialPts.length > 0) {
      let sumLat = 0;
      let sumLon = 0;
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLon = Infinity;
      let maxLon = -Infinity;

      spatialPts.forEach((p) => {
        sumLat += p.lat;
        sumLon += p.lon;
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
      });

      return {
        centroid: [sumLat / spatialPts.length, sumLon / spatialPts.length] as [number, number],
        bounds: { minLat, maxLat, minLon, maxLon }
      };
    }

    // 3. Fallback to known approximate center
    if (STATE_CENTROIDS[normSt]) {
      const c = STATE_CENTROIDS[normSt];
      return {
        centroid: [c.lat, c.lon] as [number, number],
        bounds: { minLat: c.lat - 2.5, maxLat: c.lat + 2.5, minLon: c.lon - 2.5, maxLon: c.lon + 2.5 }
      };
    }

    return {
      centroid: [22.5, 78.5] as [number, number],
      bounds: { minLat: 8, maxLat: 36, minLon: 68, maxLon: 96 }
    };
  };

  // State-Level Parameter Compliance & Exceedance Stats for the currently selected parameters
  const computedTableStats = useMemo(() => {
    return getComputedTableStatsForRows(stateData);
  }, [selectedParamKeys, hideNonCoreZeroExceedance, stateData, headers.district, headerMap]);

  // Extract EC Spatial Points for IDW Map
  const ecSpatialPoints = useMemo(() => {
    return getEcSpatialPointsForRows(stateData);
  }, [stateData, headers]);

  // State Centroid & Bounding info (Prioritizes true shapefile geometry when available)
  const stateSpatialInfo = useMemo(() => {
    return getStateSpatialInfoForState(activeState, ecSpatialPoints);
  }, [ecSpatialPoints, activeState, sharedLayers]);

  // Layout Orientation & Granular Slide Area Sizing Controls (Requirement 1, 2, 6)
  const [layoutOrientation, setLayoutOrientation] = useState<"portrait" | "landscape">("portrait");
  const [mapDistrictLayout, setMapDistrictLayout] = useState<"stacked" | "side_by_side">("stacked");
  const [showRemedialMeasures, setShowRemedialMeasures] = useState<boolean>(true);
  const [remedialScope, setRemedialScope] = useState<"selected" | "affected">("affected");
  const [mapHeight, setMapHeight] = useState<number>(560); // Map Height: 380px to 850px
  const [showStationPoints, setShowStationPoints] = useState<boolean>(false);
  const [showGraticule, setShowGraticule] = useState<boolean>(true);
  const [showNeighbourLabels, setShowNeighbourLabels] = useState<boolean>(false);
  const [mapBackground, setMapBackground] = useState<"white" | "transparent">("white");
  const [tableScale, setTableScale] = useState<"compact" | "normal" | "enlarged">("normal");
  const [showAreaControls, setShowAreaControls] = useState<boolean>(false);
  const [mapSourceMode, setMapSourceMode] = useState<"state_canvas" | "imported_gis" | "all_india">("state_canvas");

  // Table Typography Controls (User Requirement 3 & Attachment image_aeb8d2ae.png)
  const [tableFontFamily, setTableFontFamily] = useState<string>("Times New Roman");
  const [tableFontSize, setTableFontSize] = useState<number>(11);
  const [tableFontWeight, setTableFontWeight] = useState<"bold" | "normal">("bold");
  const [tableFontItalic, setTableFontItalic] = useState<boolean>(false);
  const [tableFontColor, setTableFontColor] = useState<string>("#0f172a");
  const [tableHeaderBg, setTableHeaderBg] = useState<string>("#005b70");

  // Fact Sheet Visual Themes (User Requirement 5: Separate Themes)
  const FACT_SHEET_THEMES = useMemo(() => [
    {
      id: "cgwb-teal",
      name: "CGWB Official Teal",
      primaryColor: "#005b70",
      headerBg: "#005b70",
      titleColor: "#006072",
      accentBorder: "#005b70",
      tableAltRow: "#f4fbfc",
      anomalyBorder: "#0052cc",
      anomalyTitle: "#003399",
      topGradient: "from-teal-600 via-cyan-500 to-teal-700",
      badgeColor: "#005b70"
    },
    {
      id: "royal-navy",
      name: "Royal Navy Executive",
      primaryColor: "#0f2b5c",
      headerBg: "#0f2b5c",
      titleColor: "#0f2b5c",
      accentBorder: "#1e3a8a",
      tableAltRow: "#f0f4fc",
      anomalyBorder: "#1e3a8a",
      anomalyTitle: "#0f2b5c",
      topGradient: "from-blue-800 via-indigo-600 to-sky-600",
      badgeColor: "#0f2b5c"
    },
    {
      id: "burgundy-academic",
      name: "Burgundy Academic",
      primaryColor: "#701a35",
      headerBg: "#701a35",
      titleColor: "#701a35",
      accentBorder: "#831843",
      tableAltRow: "#fff1f2",
      anomalyBorder: "#831843",
      anomalyTitle: "#701a35",
      topGradient: "from-rose-800 via-pink-700 to-rose-900",
      badgeColor: "#701a35"
    },
    {
      id: "emerald-forest",
      name: "Emerald Forest",
      primaryColor: "#064e3b",
      headerBg: "#064e3b",
      titleColor: "#064e3b",
      accentBorder: "#065f46",
      tableAltRow: "#f0fdf4",
      anomalyBorder: "#065f46",
      anomalyTitle: "#064e3b",
      topGradient: "from-emerald-700 via-green-600 to-teal-800",
      badgeColor: "#064e3b"
    },
    {
      id: "modern-slate",
      name: "Slate Minimalist",
      primaryColor: "#1e293b",
      headerBg: "#1e293b",
      titleColor: "#0f172a",
      accentBorder: "#334155",
      tableAltRow: "#f8fafc",
      anomalyBorder: "#334155",
      anomalyTitle: "#0f172a",
      topGradient: "from-slate-800 via-slate-600 to-zinc-800",
      badgeColor: "#1e293b"
    },
    {
      id: "pacific-cobalt",
      name: "Pacific Cobalt",
      primaryColor: "#0369a1",
      headerBg: "#0369a1",
      titleColor: "#0369a1",
      accentBorder: "#0284c7",
      tableAltRow: "#f0f9ff",
      anomalyBorder: "#0284c7",
      anomalyTitle: "#0369a1",
      topGradient: "from-sky-700 via-cyan-600 to-blue-700",
      badgeColor: "#0369a1"
    }
  ], []);

  const [selectedThemeId, setSelectedThemeId] = useState<string>("cgwb-teal");
  const currentTheme = useMemo(() => {
    return FACT_SHEET_THEMES.find((t) => t.id === selectedThemeId) || FACT_SHEET_THEMES[0];
  }, [FACT_SHEET_THEMES, selectedThemeId]);

  const handleSelectTheme = (themeId: string) => {
    setSelectedThemeId(themeId);
    const theme = FACT_SHEET_THEMES.find((t) => t.id === themeId);
    if (theme) {
      setTableHeaderBg(theme.headerBg);
    }
  };

  // Attribute Label Typography Controls (Font family, bold, italic, size, color, halo)
  const [attrFontFamily, setAttrFontFamily] = useState<string>("Times New Roman");
  const [attrFontWeight, setAttrFontWeight] = useState<"bold" | "normal" | "900">("bold");
  const [attrFontItalic, setAttrFontItalic] = useState<boolean>(false);
  const [attrFontSize, setAttrFontSize] = useState<number>(12);
  const [attrFontColor, setAttrFontColor] = useState<string>("#0f172a");
  const [attrShowHalo, setAttrShowHalo] = useState<boolean>(false);

  // GIS SNAPSHOT RENDERER
  const gisSnapshotCanvasRef = useRef<HTMLCanvasElement>(null);
  const [snapshotDataUrl, setSnapshotDataUrl] = useState<string>("");

  // Check available bulletin maps from GIS module
  const allIndiaEcMap = sharedBulletinMaps["ALL_INDIA_EC"];
  const stateEcMap = sharedBulletinMaps[`${norm(activeState)}_EC`];
  const importedGisMap = sharedBulletinMaps["FACT_SHEET_MAP"];

  const sentFactSheetTime = sharedBulletinMaps["FACT_SHEET_TIME"];
  useEffect(() => {
    if (sentFactSheetTime && importedGisMap) {
      setMapSourceMode("imported_gis");
    }
  }, [sentFactSheetTime, importedGisMap]);

  // Effective display map: High-Density State IDW Canvas by default (or chosen GIS import)
  const activeDisplayMap = useMemo(() => {
    if (mapSourceMode === "all_india" && allIndiaEcMap) return allIndiaEcMap;
    if (mapSourceMode === "imported_gis" && (importedGisMap || stateEcMap)) {
      const sentState = sharedBulletinMaps["FACT_SHEET_STATE"] || "";
      if (importedGisMap && (!sentState || norm(sentState) === norm(activeState))) {
        return importedGisMap;
      }
      if (stateEcMap) return stateEcMap;
      if (!sentState) return importedGisMap;
    }
    // High-Density State IDW Canvas (2400x1440, 300+ DPI dedicated publication engine) is always the primary crystal-clear map
    if (snapshotDataUrl) return snapshotDataUrl;
    if (stateEcMap) return stateEcMap;
    if (importedGisMap) return importedGisMap;
    return "";
  }, [mapSourceMode, allIndiaEcMap, stateEcMap, importedGisMap, sharedBulletinMaps, activeState, snapshotDataUrl]);

  // Pure High-Density GIS Map Canvas Renderer (reusable for live preview and batch All-States export)
  const renderPublicationMapDataUrl = (
    targetState: string,
    spatialPts: { lat: number; lon: number; ec: number; district: string; block: string; location: string }[],
    spatialInfo: { centroid: [number, number]; bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number } },
    periodStr: string,
    canvas: HTMLCanvasElement,
    gridResolution = 600
  ): string => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    // Ultra High-Density Publication Resolution (Landscape: 2400 x 1440, Portrait: 2000 x 1400)
    const isLandscape = layoutOrientation === "landscape";
    const w = isLandscape ? 2400 : 2000;
    const h = isLandscape ? 1440 : 1400;
    const s = h / 700; // Scale factor (~2.0) for crisp 300+ DPI typography & cartographic chrome
    canvas.width = w;
    canvas.height = h;

    // 1. Pristine Publication Background (White or Transparent) & Double Neatline
    ctx.clearRect(0, 0, w, h);
    if (mapBackground !== "transparent") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }

    // Outer double cartographic neatline border
    ctx.strokeStyle = "#004d61";
    ctx.lineWidth = 4 * s;
    ctx.strokeRect(10 * s, 10 * s, w - 20 * s, h - 20 * s);
    ctx.strokeStyle = "#0891b2";
    ctx.lineWidth = 1.5 * s;
    ctx.strokeRect(17 * s, 17 * s, w - 34 * s, h - 34 * s);

    // 2. Publication Header Title
    ctx.fillStyle = "#0f172a";
    ctx.font = `bold ${Math.round(21 * s)}px "Times New Roman", Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const mapTitle = `Distribution of Electrical Conductivity in ${toProperCase(targetState || "State")} ${
      periodStr ? `(${periodStr})` : ""
    }`;
    ctx.fillText(mapTitle, w / 2, 24 * s);

    // 3. Map Viewport Geographic Extent with true aspect ratio preservation (Matching GIS Module)
    const { minLat, maxLat, minLon, maxLon } = spatialInfo.bounds;
    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    const cosFactor = Math.cos((centerLat * Math.PI) / 180);
    const dLat = Math.max(0.15, maxLat - minLat);
    const dLon = Math.max(0.15, maxLon - minLon);

    const mapAreaX = 65 * s;
    const mapAreaY = 66 * s;
    const mapAreaW = w - 130 * s;
    const mapAreaH = h - 132 * s;

    const mapBoxAspect = mapAreaW / mapAreaH;
    const dataAspect = (dLon * cosFactor) / dLat;

    let finalLatSpan = dLat;
    let finalLonSpan = dLon;

    // Equalize margins on all sides & preserve true-to-life cartographic geometry
    if (dataAspect > mapBoxAspect) {
      finalLonSpan = dLon / 0.82;
      finalLatSpan = (finalLonSpan * cosFactor) / mapBoxAspect;
    } else {
      finalLatSpan = dLat / 0.82;
      finalLonSpan = (finalLatSpan * mapBoxAspect) / cosFactor;
    }

    const bMinLon = centerLon - finalLonSpan / 2;
    const bMaxLon = centerLon + finalLonSpan / 2;
    const bMinLat = centerLat - finalLatSpan / 2;
    const bMaxLat = centerLat + finalLatSpan / 2;

    const project = (lon: number, lat: number): [number, number] => {
      const x = mapAreaX + ((lon - bMinLon) / finalLonSpan) * mapAreaW;
      const y = mapAreaY + ((bMaxLat - lat) / finalLatSpan) * mapAreaH;
      return [x, y];
    };

    // Graticule Coordinates & Border Ticks along Neatline
    if (showGraticule) {
      ctx.save();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.0 * s;
      ctx.font = `bold ${Math.round(9.5 * s)}px sans-serif`;
      ctx.fillStyle = "#475569";

      const latStep = finalLatSpan > 6 ? 2 : finalLatSpan > 2 ? 1 : 0.5;
      const startLat = Math.ceil(bMinLat / latStep) * latStep;
      for (let lat = startLat; lat <= bMaxLat; lat += latStep) {
        const y = mapAreaY + ((bMaxLat - lat) / finalLatSpan) * mapAreaH;
        if (y >= mapAreaY && y <= mapAreaY + mapAreaH) {
          ctx.beginPath();
          ctx.moveTo(17 * s, y);
          ctx.lineTo(25 * s, y);
          ctx.moveTo(w - 17 * s, y);
          ctx.lineTo(w - 25 * s, y);
          ctx.stroke();

          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(`${lat.toFixed(latStep < 1 ? 1 : 0)}°N`, 28 * s, y);
        }
      }

      const lonStep = finalLonSpan > 6 ? 2 : finalLonSpan > 2 ? 1 : 0.5;
      const startLon = Math.ceil(bMinLon / lonStep) * lonStep;
      for (let lon = startLon; lon <= bMaxLon; lon += lonStep) {
        const x = mapAreaX + ((lon - bMinLon) / finalLonSpan) * mapAreaW;
        if (x >= mapAreaX && x <= mapAreaX + mapAreaW) {
          ctx.beginPath();
          ctx.moveTo(x, 17 * s);
          ctx.lineTo(x, 25 * s);
          ctx.moveTo(x, h - 17 * s);
          ctx.lineTo(x, h - 25 * s);
          ctx.stroke();

          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(`${lon.toFixed(lonStep < 1 ? 1 : 0)}°E`, x, h - 22 * s);
        }
      }
      ctx.restore();
    }

    // 4. Trace State Mask Polygon for Boundary-Constrained Raster & Outlines
    let stateMaskPolygon: any = null;
    const stateTargetNorm = norm(targetState);

    for (const layer of sharedLayers) {
      if (!layer.geoJson) continue;
      const features = layer.geoJson.features || (layer.geoJson.type === "Feature" ? [layer.geoJson] : []);
      const matched = features.filter((f: any) => {
        const p = f.properties || {};
        const fState = String(p.state || p.STATE || p.State || p.ST_NM || p.st_nm || p.NAME_1 || "").trim();
        return fState && (norm(fState) === stateTargetNorm || norm(fState).includes(stateTargetNorm));
      });
      if (matched.length > 0) {
        try {
          stateMaskPolygon = matched.length === 1 ? matched[0] : turf.combine(turf.featureCollection(matched)).features[0];
          break;
        } catch {
          // ignore
        }
      }
    }

    if (!stateMaskPolygon && spatialPts.length >= 3) {
      try {
        const pts = spatialPts.map((p) => turf.point([p.lon, p.lat]));
        const hull = turf.convex(turf.featureCollection(pts));
        if (hull) stateMaskPolygon = turf.buffer(hull, 16, { units: "kilometers" });
      } catch {
        // ignore
      }
    }

    const traceGeomPath = (c2d: CanvasRenderingContext2D, geom: any): boolean => {
      if (!geom) return false;
      let pathStarted = false;

      const tracePolygonRing = (ring: number[][]) => {
        if (!ring || ring.length === 0) return;
        const [x0, y0] = project(ring[0][0], ring[0][1]);
        c2d.moveTo(x0, y0);
        for (let i = 1; i < ring.length; i++) {
          const [px, py] = project(ring[i][0], ring[i][1]);
          c2d.lineTo(px, py);
        }
        c2d.closePath();
        pathStarted = true;
      };

      if (geom.type === "Polygon") {
        geom.coordinates.forEach((ring: number[][]) => tracePolygonRing(ring));
      } else if (geom.type === "MultiPolygon") {
        geom.coordinates.forEach((poly: number[][][]) => {
          poly.forEach((ring: number[][]) => tracePolygonRing(ring));
        });
      } else if (geom.type === "Feature") {
        return traceGeomPath(c2d, geom.geometry);
      } else if (geom.type === "FeatureCollection") {
        geom.features?.forEach((f: any) => traceGeomPath(c2d, f.geometry));
      }
      return pathStarted;
    };

    // 5. Two-Stage Smooth Bilinear IDW Surface with Vector Polygon Clipping & Glossy Sheen
    if (spatialPts.length >= 3) {
      const colStep = gridResolution;
      const rowStep = gridResolution;
      const mathCanvas = document.createElement("canvas");
      mathCanvas.width = colStep;
      mathCanvas.height = rowStep;
      const mathCtx = mathCanvas.getContext("2d");

      if (mathCtx) {
        const imgData = mathCtx.createImageData(colStep, rowStep);
        const dataArr = imgData.data;
        const cosMeanLat = Math.cos(((bMinLat + bMaxLat) / 2) * (Math.PI / 180));
        const kmLat = 111.32;
        const kmLon = 111.32 * cosMeanLat;

        // Precompute projected station km coordinates for fast inner IDW loop
        const prePts = spatialPts.map((pt) => ({
          kmY: pt.lat * kmLat,
          kmX: pt.lon * kmLon,
          ec: pt.ec
        }));

        for (let r = 0; r < rowStep; r++) {
          const imgY = rowStep - 1 - r;
          const cellKmY = (bMinLat + (r / (rowStep - 1)) * (bMaxLat - bMinLat)) * kmLat;

          for (let c = 0; c < colStep; c++) {
            const cellKmX = (bMinLon + (c / (colStep - 1)) * (bMaxLon - bMinLon)) * kmLon;
            const idx = (imgY * colStep + c) * 4;

            let exactVal: number | null = null;
            let numer = 0;
            let denom = 0;

            for (let i = 0; i < prePts.length; i++) {
              const pt = prePts[i];
              const dy = pt.kmY - cellKmY;
              const dx = pt.kmX - cellKmX;
              const distSq = dx * dx + dy * dy;

              if (distSq < 0.0001) {
                exactVal = pt.ec;
                break;
              }
              const weight = 1 / distSq;
              numer += weight * pt.ec;
              denom += weight;
            }

            const val = exactVal !== null ? exactVal : denom > 0 ? numer / denom : 0;
            // Fast inline RGB lookup matching getEcClassColor
            let rVal = 0, gVal = 112, bVal = 192;
            if (val > 3000) {
              rVal = 255; gVal = 51; bVal = 0;
            } else if (val > 750) {
              rVal = 255; gVal = 255; bVal = 0;
            }

            dataArr[idx] = rVal;
            dataArr[idx + 1] = gVal;
            dataArr[idx + 2] = bVal;
            dataArr[idx + 3] = 245;
          }
        }

        mathCtx.putImageData(imgData, 0, 0);

        ctx.save();
        if (stateMaskPolygon && stateMaskPolygon.geometry) {
          ctx.beginPath();
          traceGeomPath(ctx, stateMaskPolygon.geometry);
          ctx.clip("evenodd");
        } else {
          ctx.beginPath();
          ctx.rect(mapAreaX, mapAreaY, mapAreaW, mapAreaH);
          ctx.clip();
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(mathCanvas, mapAreaX, mapAreaY, mapAreaW, mapAreaH);

        const glossyGrad = ctx.createLinearGradient(mapAreaX, mapAreaY, mapAreaX + mapAreaW, mapAreaY + mapAreaH);
        glossyGrad.addColorStop(0, "rgba(255, 255, 255, 0.24)");
        glossyGrad.addColorStop(0.35, "rgba(255, 255, 255, 0.06)");
        glossyGrad.addColorStop(0.65, "rgba(255, 255, 255, 0.0)");
        glossyGrad.addColorStop(1, "rgba(15, 23, 42, 0.06)");
        ctx.fillStyle = glossyGrad;
        ctx.fillRect(mapAreaX, mapAreaY, mapAreaW, mapAreaH);

        ctx.restore();
      }
    }

    // 6. District Boundaries & Deduplicated District Attribute Labels with Full Typography Control
    const districtPolygonsByName: Record<string, { feature: any; displayName: string; isNeighbour: boolean }[]> = {};
    const drawnDistrictNames = new Set<string>();
    const stateDatasetDistricts = new Set(spatialPts.map((pt) => norm(pt.district || "")).filter(Boolean));

    const isFeatureInsideSelectedState = (f: any, p: any, rawName: string): boolean => {
      const fState = String(
        p.state || p.STATE || p.State || p.ST_NM || p.st_nm || p.NAME_1 || p.state_name || p.statename || p.st_name || ""
      ).trim();
      if (fState) {
        return norm(fState) === stateTargetNorm || norm(fState).includes(stateTargetNorm) || stateTargetNorm.includes(norm(fState));
      }
      if (rawName && stateDatasetDistricts.has(norm(rawName))) {
        return true;
      }
      if (stateMaskPolygon && stateMaskPolygon.geometry) {
        try {
          const c = turf.pointOnFeature(f);
          return turf.booleanPointInPolygon(c, stateMaskPolygon);
        } catch {
          return false;
        }
      }
      return true;
    };

    sharedLayers.forEach((layer) => {
      if (!layer.geoJson) return;
      const features = layer.geoJson.features || (layer.geoJson.type === "Feature" ? [layer.geoJson] : []);
      features.forEach((f: any) => {
        if (!f || !f.geometry) return;
        const p = f.properties || {};
        const rawDist = String(p.district || p.DISTRICT || p.District || p.NAME_2 || p.DT_NM || p.dist_name || p.DIST_NAME || p.district_name || "").trim();
        const rawState = String(p.state || p.STATE || p.State || p.ST_NM || p.st_nm || p.NAME_1 || p.state_name || "").trim();
        const rawName = rawDist || rawState;

        const insideSelected = isFeatureInsideSelectedState(f, p, rawDist);
        if (!insideSelected && !showNeighbourLabels) return;

        ctx.save();
        ctx.beginPath();
        traceGeomPath(ctx, f.geometry);
        if (insideSelected) {
          ctx.strokeStyle = layer.strokeColor || "#334155";
          ctx.lineWidth = (layer.strokeWidth || 1.1) * s;
          ctx.setLineDash([4 * s, 3 * s]);
        } else {
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 0.8 * s;
          ctx.setLineDash([2 * s, 3 * s]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        if (rawName && rawName.toLowerCase() !== "unknown" && rawName.toLowerCase() !== "india") {
          const normD = norm(rawName);
          if (!districtPolygonsByName[normD]) {
            districtPolygonsByName[normD] = [];
          }
          districtPolygonsByName[normD].push({
            feature: f,
            displayName: toProperCase(rawName),
            isNeighbour: !insideSelected
          });
        }
      });
    });

    const scaledAttrFontSize = Math.round(attrFontSize * s);
    const fontStyleStr = `${attrFontItalic ? "italic " : ""}${attrFontWeight} ${scaledAttrFontSize}px "${attrFontFamily}", sans-serif`;
    const neighbourFontStyleStr = `italic ${Math.max(8 * s, Math.round(scaledAttrFontSize * 0.85))}px "${attrFontFamily}", sans-serif`;

    const drawnLabelCoords: { x: number; y: number }[] = [];
    const sortedEntries = Object.entries(districtPolygonsByName).sort((a, b) => {
      const aNeigh = a[1].every((it) => it.isNeighbour) ? 1 : 0;
      const bNeigh = b[1].every((it) => it.isNeighbour) ? 1 : 0;
      return aNeigh - bNeigh;
    });

    sortedEntries.forEach(([normD, items]) => {
      const isNeighbourOnly = items.every((it) => it.isNeighbour);
      if (isNeighbourOnly && !showNeighbourLabels) return;
      if (drawnDistrictNames.has(normD)) return;
      drawnDistrictNames.add(normD);

      const displayName = items[0].displayName;

      let bestFeature = items[0].feature;
      let maxArea = -Infinity;
      items.forEach(({ feature }) => {
        try {
          const area = turf.area(feature);
          if (area > maxArea) {
            maxArea = area;
            bestFeature = feature;
          }
        } catch {
          // ignore
        }
      });

      try {
        const center = turf.center(bestFeature);
        const [cLon, cLat] = center.geometry.coordinates;
        const [lx, ly] = project(cLon, cLat);

        if (lx >= mapAreaX + 15 * s && lx <= mapAreaX + mapAreaW - 15 * s && ly >= mapAreaY + 15 * s && ly <= mapAreaY + mapAreaH - 15 * s) {
          const collides = drawnLabelCoords.some((pt) => Math.hypot(pt.x - lx, pt.y - ly) < scaledAttrFontSize * 1.5);
          if (!collides) {
            ctx.save();
            ctx.font = isNeighbourOnly ? neighbourFontStyleStr : fontStyleStr;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            if (attrShowHalo) {
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = Math.max(3 * s, scaledAttrFontSize * 0.28);
              ctx.lineJoin = "round";
              ctx.miterLimit = 2;
              ctx.strokeText(displayName, lx, ly);
            }

            ctx.fillStyle = isNeighbourOnly ? "#64748b" : attrFontColor;
            ctx.fillText(displayName, lx, ly);
            ctx.restore();
            drawnLabelCoords.push({ x: lx, y: ly });
          }
        }
      } catch {
        // ignore
      }
    });

    if (spatialPts.length > 0) {
      const dMap: Record<string, { latSum: number; lonSum: number; count: number }> = {};
      spatialPts.forEach((pt) => {
        if (!pt.district) return;
        const normD = norm(pt.district);
        if (drawnDistrictNames.has(normD)) return;

        if (!dMap[pt.district]) dMap[pt.district] = { latSum: 0, lonSum: 0, count: 0 };
        dMap[pt.district].latSum += pt.lat;
        dMap[pt.district].lonSum += pt.lon;
        dMap[pt.district].count++;
      });
      Object.entries(dMap).forEach(([dName, val]) => {
        const normD = norm(dName);
        if (drawnDistrictNames.has(normD)) return;
        drawnDistrictNames.add(normD);

        const [lx, ly] = project(val.lonSum / val.count, val.latSum / val.count);
        if (lx >= mapAreaX + 15 * s && lx <= mapAreaX + mapAreaW - 15 * s && ly >= mapAreaY + 15 * s && ly <= mapAreaY + mapAreaH - 15 * s) {
          const collides = drawnLabelCoords.some((pt) => Math.hypot(pt.x - lx, pt.y - ly) < scaledAttrFontSize * 1.5);
          if (!collides) {
            ctx.save();
            ctx.font = fontStyleStr;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            if (attrShowHalo) {
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = Math.max(3 * s, scaledAttrFontSize * 0.28);
              ctx.lineJoin = "round";
              ctx.miterLimit = 2;
              ctx.strokeText(toProperCase(dName), lx, ly);
            }

            ctx.fillStyle = attrFontColor;
            ctx.fillText(toProperCase(dName), lx, ly);
            ctx.restore();
            drawnLabelCoords.push({ x: lx, y: ly });
          }
        }
      });
    }

    if (stateMaskPolygon && stateMaskPolygon.geometry) {
      ctx.save();
      ctx.beginPath();
      traceGeomPath(ctx, stateMaskPolygon.geometry);
      ctx.strokeStyle = "#004d61";
      ctx.lineWidth = 2.6 * s;
      ctx.stroke();
      ctx.restore();
    }

    if (showStationPoints && spatialPts.length > 0) {
      ctx.save();
      spatialPts.forEach((pt) => {
        const [px, py] = project(pt.lon, pt.lat);
        if (px >= mapAreaX && px <= mapAreaX + mapAreaW && py >= mapAreaY && py <= mapAreaY + mapAreaH) {
          ctx.beginPath();
          ctx.arc(px, py, 3.0 * s, 0, Math.PI * 2);
          ctx.fillStyle = getEcClassColor(pt.ec);
          ctx.fill();
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 0.8 * s;
          ctx.stroke();
        }
      });
      ctx.restore();
    }

    // 7. Cartographic 3D North Arrow
    ctx.save();
    const naX = w - 62 * s;
    const naY = 58 * s;
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.arc(naX, naY, 22 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(naX, naY - 16 * s);
    ctx.lineTo(naX + 7 * s, naY + 10 * s);
    ctx.lineTo(naX, naY + 5 * s);
    ctx.closePath();
    ctx.fillStyle = "#1d4ed8";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(naX, naY - 16 * s);
    ctx.lineTo(naX - 7 * s, naY + 10 * s);
    ctx.lineTo(naX, naY + 5 * s);
    ctx.closePath();
    ctx.fillStyle = "#3b82f6";
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.font = `bold ${Math.round(10 * s)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("N", naX, naY + 11 * s);
    ctx.restore();

    // 8. Glassmorphic Cartographic Legend
    ctx.save();
    const legX = 34 * s;
    const legY = h - 182 * s;
    const legW = 240 * s;
    const legH = 148 * s;

    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.5 * s;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(legX, legY, legW, legH, 8 * s);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(legX, legY, legW, legH);
      ctx.strokeRect(legX, legY, legW, legH);
    }

    ctx.fillStyle = "#0f172a";
    ctx.font = `bold ${Math.round(12 * s)}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Legend", legX + 12 * s, legY + 10 * s);

    ctx.strokeStyle = "#004d61";
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.moveTo(legX + 12 * s, legY + 32 * s);
    ctx.lineTo(legX + 38 * s, legY + 32 * s);
    ctx.stroke();
    ctx.font = `${Math.round(10 * s)}px sans-serif`;
    ctx.fillStyle = "#334155";
    ctx.fillText("State Boundary", legX + 46 * s, legY + 27 * s);

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.2 * s;
    ctx.setLineDash([4 * s, 3 * s]);
    ctx.beginPath();
    ctx.moveTo(legX + 12 * s, legY + 50 * s);
    ctx.lineTo(legX + 38 * s, legY + 50 * s);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText("District Boundary", legX + 46 * s, legY + 45 * s);

    ctx.font = `bold ${Math.round(10 * s)}px sans-serif`;
    ctx.fillStyle = "#0f172a";
    ctx.fillText("Electrical Conductivity (µS/cm)", legX + 12 * s, legY + 68 * s);

    EC_CLASSES.forEach((cls, idx) => {
      const cy = legY + (86 + idx * 18) * s;
      ctx.fillStyle = cls.color;
      ctx.fillRect(legX + 12 * s, cy, 16 * s, 13 * s);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 0.8 * s;
      ctx.strokeRect(legX + 12 * s, cy, 16 * s, 13 * s);

      ctx.font = `bold ${Math.round(10 * s)}px sans-serif`;
      ctx.fillStyle = "#1e293b";
      ctx.fillText(cls.label, legX + 36 * s, cy + 1.5 * s);
    });
    ctx.restore();

    // 9. Accurate Geographic Graphic Scale Bar
    ctx.save();
    const kmPerDegLon = 111.32 * cosFactor;
    const mapWidthKm = finalLonSpan * kmPerDegLon;
    const targetScaleKm = mapWidthKm * 0.22;
    const niceSteps = [10, 20, 40, 50, 100, 150, 200, 300, 400, 500, 1000];
    const totalScaleKm = niceSteps.reduce((prev, curr) =>
      Math.abs(curr - targetScaleKm) < Math.abs(prev - targetScaleKm) ? curr : prev
    );
    const scW = (totalScaleKm / mapWidthKm) * mapAreaW;
    const scH = 7 * s;
    const scX = w - 45 * s - scW;
    const scY = h - 55 * s;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(scX, scY, scW / 2, scH);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(scX + scW / 2, scY, scW / 2, scH);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.2 * s;
    ctx.strokeRect(scX, scY, scW, scH);

    ctx.fillStyle = "#0f172a";
    ctx.font = `bold ${Math.round(10 * s)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("0", scX, scY + 11 * s);
    ctx.fillText(`${totalScaleKm / 2}`, scX + scW / 2, scY + 11 * s);
    ctx.fillText(`${totalScaleKm} km`, scX + scW, scY + 11 * s);
    ctx.restore();

    return canvas.toDataURL("image/png");
  };

  // Render high-density GIS map canvas whenever state data, state, orientation, or typography changes
  useEffect(() => {
    const canvas = gisSnapshotCanvasRef.current;
    if (!canvas) return;
    const url = renderPublicationMapDataUrl(
      activeState,
      ecSpatialPoints,
      stateSpatialInfo,
      assessmentPeriod,
      canvas,
      600
    );
    if (url) setSnapshotDataUrl(url);
  }, [
    activeState,
    stateData,
    ecSpatialPoints,
    sharedLayers,
    importedGisMap,
    selectedDistrict,
    assessmentPeriod,
    stateSpatialInfo,
    layoutOrientation,
    showStationPoints,
    showGraticule,
    showNeighbourLabels,
    mapBackground,
    attrFontFamily,
    attrFontWeight,
    attrFontItalic,
    attrFontSize,
    attrFontColor,
    attrShowHalo
  ]);

  // DOM ref for High Density Glossy Export
  const factSheetContainerRef = useRef<HTMLDivElement>(null);
  const [isExportingJpeg, setIsExportingJpeg] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingAllDocx, setIsExportingAllDocx] = useState(false);
  const [allStatesDocxProgress, setAllStatesDocxProgress] = useState<{
    current: number;
    total: number;
    stateName: string;
  } | null>(null);

  // Download High-Resolution Glossy Transparent PNG of Fact Sheet (300+ DPI, Matching GUI Fonts & Sizes Exactly)
  const handleExportJpeg = async () => {
    if (!factSheetContainerRef.current) return;
    setIsExportingJpeg(true);
    try {
      if (showToast) showToast("Generating 300+ DPI Transparent Glossy Fact Sheet PNG...", "info");
      await new Promise((r) => setTimeout(r, 150));

      const elem = factSheetContainerRef.current;
      const targetWidth = elem.offsetWidth;
      const targetHeight = elem.offsetHeight;

      // Capture exact live GUI computed typography across all elements before cloning
      const sourceNodes = [elem, ...Array.from(elem.querySelectorAll("*"))] as HTMLElement[];
      const typographySnapshots = sourceNodes.map((node) => {
        const cs = window.getComputedStyle(node);
        return {
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          fontStyle: cs.fontStyle,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          textTransform: cs.textTransform
        };
      });

      const canvas = await safeHtml2canvas(elem, {
        scale: 3.0, // Ultra Crisp 300+ DPI publication glossy resolution
        useCORS: true,
        allowTaint: false,
        backgroundColor: null, // True alpha transparency
        logging: false,
        width: targetWidth,
        height: targetHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        scrollX: 0,
        scrollY: 0,
        imageTimeout: 15000,
        onclone: (clonedDoc: globalThis.Document, clonedElem?: HTMLElement) => {
          const clonedRoot =
            clonedElem || (elem.id ? clonedDoc.getElementById(elem.id) : null);
          if (!clonedRoot) return;

          // Lock cloned element typography to match live GUI pixel-for-pixel
          const clonedNodes = [clonedRoot, ...Array.from(clonedRoot.querySelectorAll("*"))] as HTMLElement[];
          if (clonedNodes.length === typographySnapshots.length) {
            for (let i = 0; i < clonedNodes.length; i++) {
              const snap = typographySnapshots[i];
              const cNode = clonedNodes[i];
              if (cNode && cNode.style && snap) {
                cNode.style.setProperty("font-family", snap.fontFamily, "important");
                cNode.style.setProperty("font-size", snap.fontSize, "important");
                cNode.style.setProperty("font-weight", snap.fontWeight, "important");
                cNode.style.setProperty("font-style", snap.fontStyle, "important");
                cNode.style.setProperty("line-height", snap.lineHeight, "important");
                cNode.style.setProperty("letter-spacing", snap.letterSpacing, "important");
                cNode.style.setProperty("text-transform", snap.textTransform, "important");
              }
            }
          }

          // Strip solid white & checkerboard backgrounds so exported PNG has a true transparent background
          clonedRoot.style.setProperty("background-color", "transparent", "important");
          clonedRoot.style.setProperty("background-image", "none", "important");
          clonedRoot.style.setProperty("box-shadow", "none", "important");

          const transparentTargets = clonedRoot.querySelectorAll(
            '[data-glossy-transparent="card"], [data-glossy-transparent="map-wrapper"], [data-glossy-transparent="row"]'
          );
          transparentTargets.forEach((node) => {
            const el = node as HTMLElement;
            el.style.setProperty("background-color", "transparent", "important");
            el.style.setProperty("background-image", "none", "important");
            el.style.setProperty("box-shadow", "none", "important");
          });
        }
      });

      const fileName = `State_Fact_Sheet_${(activeState || "State").replace(/[^a-zA-Z0-9]/g, "_")}_${layoutOrientation.toUpperCase()}_300DPI_Glossy.png`;

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          if (showToast) showToast("Transparent 300+ DPI Glossy Fact Sheet PNG saved successfully!", "success");
        }
      }, "image/png", 1.0);
    } catch (err) {
      console.error("Glossy PNG generation failed:", err);
      if (showToast) showToast("Failed to generate Transparent Glossy Image", "error");
    } finally {
      setIsExportingJpeg(false);
    }
  };

  // Direct 4K PNG Map Export (Zero distortion vector/raster snapshot)
  const handleExportMapPng = () => {
    const url = activeDisplayMap || snapshotDataUrl;
    if (!url) {
      if (showToast) showToast("Map snapshot not ready yet.", "info");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `GIS_Map_${(activeState || "State").replace(/[^a-zA-Z0-9]/g, "_")}_Publication_4K.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (showToast) showToast("GIS Map downloaded in Publication 4K quality!", "success");
  };

  // Export Complete Fact Sheet to Excel (.xlsx) with Embedded Publication Quality Map Image (Requirement 7)
  const handleExportExcel = async () => {
    try {
      if (showToast) showToast("Generating Publication Quality Excel with Embedded Map...", "info");
      const wb = new ExcelJS.Workbook();
      wb.creator = "CGWB National Groundwater Information System";
      wb.created = new Date();

      const ws = wb.addWorksheet("State Fact Sheet", {
        views: [{ showGridLines: true }]
      });

      // 1. Title Banner
      ws.addRow([`Groundwater Quality Scenario in ${toProperCase(activeState || "State")}`]);
      ws.getRow(1).font = { name: "Arial", size: 16, bold: true, color: { argb: "FF005B70" } };
      ws.addRow([
        assessmentPeriod
          ? `Assessment Season: ${assessmentPeriod} · Total Monitored Stations: ${stateData.length}`
          : `Total Monitored Stations: ${stateData.length}`
      ]);
      ws.getRow(2).font = { name: "Arial", size: 10, italic: true, color: { argb: "FF475569" } };
      ws.addRow([]); // Blank line

      // 2. Compliance Table Header (Row 4)
      const headerRow = ws.addRow([
        "Parameters",
        "No of samples",
        "Permissible limit",
        "No of Samples above permissible limit",
        "% Samples above permissible Limit"
      ]);
      headerRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.eachCell((cell, colNumber) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF005B70" }
        };
        cell.alignment = { vertical: "middle", horizontal: colNumber === 1 ? "left" : "center" };
        cell.border = {
          top: { style: "thin", color: { argb: "FF003B49" } },
          bottom: { style: "thin", color: { argb: "FF003B49" } },
          left: { style: "thin", color: { argb: "FF003B49" } },
          right: { style: "thin", color: { argb: "FF003B49" } }
        };
      });

      // 3. Compliance Data Rows
      computedTableStats.forEach((p, idx) => {
        const row = ws.addRow([
          p.name,
          p.sampleCount,
          p.limitStr,
          p.exceedCount,
          Number(p.exceedPct.toFixed(2))
        ]);
        const isEven = idx % 2 === 0;
        const bg = isEven ? "FFFFFFFF" : "FFF4FBFC";
        row.eachCell((cell, colNumber) => {
          cell.font = { name: "Arial", size: 10, bold: colNumber === 1 || colNumber === 5 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
          cell.alignment = { vertical: "middle", horizontal: colNumber === 1 ? "left" : "center" };
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } }
          };
          if (colNumber === 5) {
            cell.numFmt = "0.00";
            if (p.exceedPct > 0) {
              cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFB91C1C" } };
            }
          }
        });
      });

      ws.addRow([]); // Blank line
      ws.addRow([]); // Blank line

      // 4. Anomalous Districts Section Header
      const anomHeader = ws.addRow(["Districts with anomalous values at sporadic locations"]);
      anomHeader.font = { name: "Arial", size: 13, bold: true, color: { argb: "FF003399" } };
      ws.addRow([]);

      computedTableStats.forEach((item) => {
        const anomRow = ws.addRow([
          `${item.name} (${item.limitStr})`,
          item.affectedDistricts.length > 0 ? item.affectedDistricts.join(", ") : "Not Any"
        ]);
        anomRow.getCell(1).font = { name: "Arial", size: 10, bold: true, color: { argb: "FFE11D48" } };
        anomRow.getCell(2).font = { name: "Arial", size: 10 };
      });

      // Column Widths
      ws.columns = [
        { width: 28 },
        { width: 16 },
        { width: 22 },
        { width: 38 },
        { width: 34 },
        { width: 4 } // Spacer
      ];

      // 5. REQUIREMENT 7: EMBED PUBLICATION QUALITY MAP IMAGE INTO SPREADSHEET
      const mapToEmbed = activeDisplayMap || snapshotDataUrl;
      if (mapToEmbed && mapToEmbed.startsWith("data:image/")) {
        try {
          const base64Data = mapToEmbed.replace(/^data:image\/\w+;base64,/, "");
          const imageId = wb.addImage({
            base64: base64Data,
            extension: "png"
          });
          // Embed starting at Column G (col 6), row 3
          ws.addImage(imageId, {
            tl: { col: 6, row: 3 },
            ext: { width: 680, height: 460 },
            editAs: "oneCell"
          });
        } catch (imgErr) {
          console.error("Failed to embed map into spreadsheet:", imgErr);
        }
      }

      const fileName = `Groundwater_Quality_Scenario_${(activeState || "State").replace(/[^a-zA-Z0-9]/g, "_")}_Publication`;
      await downloadExcelJSWorkbook(wb, fileName);
      if (showToast) showToast(`Publication-quality Fact Sheet Excel exported with embedded map!`, "success");
    } catch (err) {
      console.error("Excel export error:", err);
      if (showToast) showToast("Failed to export Fact Sheet to Excel", "error");
    }
  };

  // Reusable Builder: Creates Word (.docx) children nodes (Title, Compliance Table, Map Image, Anomaly Box) for any State/UT
  const buildStateDocxNodes = async (
    targetState: string,
    rows: any[],
    periodStr: string,
    stats: ReturnType<typeof getComputedTableStatsForRows>,
    mapDataUrl: string | undefined,
    addPageBreakBefore: boolean
  ): Promise<(Paragraph | Table)[]> => {
    const stripHash = (hex: string, fallback: string) => {
      const clean = (hex || "").replace("#", "").trim();
      return /^[0-9a-fA-F]{6}$/.test(clean) ? clean.toUpperCase() : fallback;
    };

    const headerHex = stripHash(tableHeaderBg, "005B70");
    const titleHex = stripHash(currentTheme.titleColor, "006072");
    const borderHex = stripHash(currentTheme.accentBorder, "005B70");
    const altRowHex = stripHash(currentTheme.tableAltRow, "F4FBFC");
    const anomalyBorderHex = stripHash(currentTheme.anomalyBorder, "0052CC");
    const anomalyTitleHex = stripHash(currentTheme.anomalyTitle, "003399");
    const fontColorHex = stripHash(tableFontColor, "0F172A");

    const isLandscape = layoutOrientation === "landscape";
    const fontName = tableFontFamily || "Times New Roman";
    const fontHalfPt = Math.max(16, Math.round((tableFontSize || 11) * 2));
    const isBold = tableFontWeight === "bold";
    const isItalic = tableFontItalic;

    const tableColWidths = [28, 14, 18, 20, 20];
    const headersText = [
      "Parameters",
      "No of samples",
      "Permissible limit",
      "No of Samples above permissible limit",
      "% Samples above permissible Limit"
    ];

    const docTableRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headersText.map((hText, colIdx) =>
          new TableCell({
            width: { size: tableColWidths[colIdx], type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, fill: headerHex, color: headerHex },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 70, bottom: 70, left: 90, right: 90 },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 6, color: borderHex },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: borderHex },
              left: { style: BorderStyle.SINGLE, size: 4, color: borderHex },
              right: {
                style: colIdx < headersText.length - 1 ? BorderStyle.DASHED : BorderStyle.SINGLE,
                size: 4,
                color: colIdx < headersText.length - 1 ? "CBD5E1" : borderHex
              }
            },
            children: [
              new Paragraph({
                alignment: colIdx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: [
                  new TextRun({
                    text: hText,
                    font: fontName,
                    size: Math.max(18, fontHalfPt),
                    bold: true,
                    color: "FFFFFF"
                  })
                ]
              })
            ]
          })
        )
      }),
      ...stats.map((row, rIdx) => {
        const rowBg = rIdx % 2 === 0 ? "FFFFFF" : altRowHex;
        const cellsData = [
          row.name,
          String(row.sampleCount),
          row.limitStr,
          String(row.exceedCount),
          row.exceedCount === 0 ? "0" : row.exceedPct.toFixed(2)
        ];

        return new TableRow({
          cantSplit: true,
          children: cellsData.map((val, colIdx) => {
            const isPctCol = colIdx === 4;
            const cellColor = isPctCol
              ? (row.exceedPct > 0 ? "B91C1C" : "047857")
              : fontColorHex;

            return new TableCell({
              width: { size: tableColWidths[colIdx], type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.SOLID, fill: rowBg, color: rowBg },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 55, bottom: 55, left: 90, right: 90 },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
                left: { style: BorderStyle.SINGLE, size: 4, color: colIdx === 0 ? borderHex : "E2E8F0" },
                right: {
                  style: colIdx < 4 ? BorderStyle.DASHED : BorderStyle.SINGLE,
                  size: 4,
                  color: colIdx < 4 ? "CBD5E1" : borderHex
                }
              },
              children: [
                new Paragraph({
                  alignment: colIdx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
                  spacing: { before: 0, after: 0 },
                  children: [
                    new TextRun({
                      text: val,
                      font: fontName,
                      size: fontHalfPt,
                      bold: colIdx === 0 || isPctCol ? true : isBold,
                      italics: isItalic,
                      color: cellColor
                    })
                  ]
                })
              ]
            });
          })
        });
      })
    ];

    const complianceTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: docTableRows
    });

    const isSideBySide = mapDistrictLayout === "side_by_side";

    let parsedMapImage: { bytes: Uint8Array; type: "png" | "jpg"; targetW: number; targetH: number } | null = null;
    if (mapDataUrl && mapDataUrl.startsWith("data:image/")) {
      const mimeMatch = mapDataUrl.match(/^data:image\/(png|jpeg|jpg);base64,/i);
      const imgType: "png" | "jpg" = mimeMatch && /jpe?g/i.test(mimeMatch[1]) ? "jpg" : "png";
      const base64Data = mapDataUrl.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
      const binaryString = atob(base64Data);
      const imgBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        imgBytes[i] = binaryString.charCodeAt(i);
      }

      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const im = new Image();
        im.onload = () => resolve({ w: im.naturalWidth || 2000, h: im.naturalHeight || 1400 });
        im.onerror = () => resolve({ w: isLandscape ? 2400 : 2000, h: isLandscape ? 1440 : 1400 });
        im.src = mapDataUrl;
      });

      const maxDrawWidthPx = isSideBySide
        ? (isLandscape ? 510 : 375)
        : (isLandscape ? 920 : 660);
      const maxDrawHeightPx = isSideBySide
        ? (isLandscape ? 360 : 320)
        : (isLandscape ? 430 : 460);
      const scaleRatio = Math.min(maxDrawWidthPx / dims.w, maxDrawHeightPx / dims.h);
      const targetW = Math.max(120, Math.round(dims.w * scaleRatio));
      const targetH = Math.max(90, Math.round(dims.h * scaleRatio));

      parsedMapImage = { bytes: imgBytes, type: imgType, targetW, targetH };
    }

    const middleBlocks: (Paragraph | Table)[] = [];

    if (isSideBySide) {
      // Side-by-Side 2-Column Layout: Map on Left (58%) & Anomalous Districts Box on Right (42%)
      const leftCellChildren: Paragraph[] = parsedMapImage
        ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 40, after: 40 },
              children: [
                new ImageRun({
                  data: parsedMapImage.bytes,
                  type: parsedMapImage.type,
                  transformation: {
                    width: parsedMapImage.targetW,
                    height: parsedMapImage.targetH
                  }
                })
              ]
            })
          ]
        : [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Map preview unavailable", font: fontName, size: 18, color: "64748B" })]
            })
          ];

      const rightCellChildren: Paragraph[] = [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 100 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1", space: 4 }
          },
          children: [
            new TextRun({
              text: "Districts with anomalous values at sporadic locations",
              font: fontName,
              size: 20,
              bold: true,
              color: anomalyTitleHex
            })
          ]
        }),
        ...stats.map((item) => {
          const dList = item.affectedDistricts;
          return new Paragraph({
            spacing: { before: 45, after: 45 },
            children: [
              new TextRun({
                text: `${item.name} (${item.limitStr}): `,
                font: fontName,
                size: Math.max(16, fontHalfPt - 2),
                bold: true,
                color: "E11D48"
              }),
              new TextRun({
                text: dList.length > 0 ? dList.join(", ") : "Not Any",
                font: fontName,
                size: Math.max(16, fontHalfPt - 2),
                bold: isBold,
                italics: isItalic,
                color: fontColorHex
              })
            ]
          });
        })
      ];

      const sideBySideTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: 58, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                margins: { top: 40, bottom: 40, left: 0, right: 90 },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE }
                },
                children: leftCellChildren
              }),
              new TableCell({
                width: { size: 42, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.TOP,
                shading: { type: ShadingType.SOLID, fill: "FFFFFF", color: "FFFFFF" },
                margins: { top: 90, bottom: 90, left: 110, right: 110 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 12, color: anomalyBorderHex },
                  bottom: { style: BorderStyle.SINGLE, size: 12, color: anomalyBorderHex },
                  left: { style: BorderStyle.SINGLE, size: 12, color: anomalyBorderHex },
                  right: { style: BorderStyle.SINGLE, size: 12, color: anomalyBorderHex }
                },
                children: rightCellChildren
              })
            ]
          })
        ]
      });

      middleBlocks.push(
        new Paragraph({ spacing: { before: 60, after: 0 }, children: [] }),
        sideBySideTable
      );
    } else {
      // Stacked Layout: Full-Width Map followed by Full-Width Anomalous Districts Box
      if (parsedMapImage) {
        middleBlocks.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 140, after: 140 },
            children: [
              new ImageRun({
                data: parsedMapImage.bytes,
                type: parsedMapImage.type,
                transformation: {
                  width: parsedMapImage.targetW,
                  height: parsedMapImage.targetH
                }
              })
            ]
          })
        );
      }

      const anomalyRows: TableRow[] = [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              columnSpan: 2,
              shading: { type: ShadingType.SOLID, fill: "F8FAFC", color: "F8FAFC" },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 12, color: anomalyBorderHex },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                left: { style: BorderStyle.SINGLE, size: 12, color: anomalyBorderHex },
                right: { style: BorderStyle.SINGLE, size: 12, color: anomalyBorderHex }
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 0 },
                  children: [
                    new TextRun({
                      text: "Districts with anomalous values at sporadic locations",
                      font: fontName,
                      size: 24,
                      bold: true,
                      color: anomalyTitleHex
                    })
                  ]
                })
              ]
            })
          ]
        }),
        ...stats.map((item, idx) => {
          const isLast = idx === stats.length - 1;
          const dList = item.affectedDistricts;
          return new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: 30, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.TOP,
                margins: { top: 55, bottom: 55, left: 120, right: 80 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: "F1F5F9" },
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: isLast ? 12 : 4,
                    color: isLast ? anomalyBorderHex : "F1F5F9"
                  },
                  left: { style: BorderStyle.SINGLE, size: 12, color: anomalyBorderHex },
                  right: { style: BorderStyle.NONE }
                },
                children: [
                  new Paragraph({
                    spacing: { before: 0, after: 0 },
                    children: [
                      new TextRun({
                        text: `${item.name} (${item.limitStr})`,
                        font: fontName,
                        size: fontHalfPt,
                        bold: true,
                        color: "E11D48"
                      })
                    ]
                  })
                ]
              }),
              new TableCell({
                width: { size: 70, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.TOP,
                margins: { top: 55, bottom: 55, left: 80, right: 120 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: "F1F5F9" },
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: isLast ? 12 : 4,
                    color: isLast ? anomalyBorderHex : "F1F5F9"
                  },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.SINGLE, size: 12, color: anomalyBorderHex }
                },
                children: [
                  new Paragraph({
                    spacing: { before: 0, after: 0 },
                    children: [
                      new TextRun({
                        text: dList.length > 0 ? dList.join(", ") : "Not Any",
                        font: fontName,
                        size: fontHalfPt,
                        bold: isBold,
                        italics: isItalic,
                        color: fontColorHex
                      })
                    ]
                  })
                ]
              })
            ]
          });
        })
      ];

      middleBlocks.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: anomalyRows
        })
      );
    }

    // Lower Section: Risk Perception & Remedial Measures for Selected Parameters (from Alerts Section)
    const remedialBlocks: (Paragraph | Table)[] = [];
    if (showRemedialMeasures) {
      const targetRemedialStats = stats.filter((s) => remedialScope === "selected" || s.exceedCount > 0);
      const resolvedMeasures = targetRemedialStats
        .map((item) => ({ item, measure: findAlertRemedialMeasure(item.key) }))
        .filter((entry): entry is { item: typeof stats[number]; measure: NonNullable<ReturnType<typeof findAlertRemedialMeasure>> } => Boolean(entry.measure));

      if (resolvedMeasures.length > 0) {
        const remedialRows: TableRow[] = [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                columnSpan: 2,
                shading: { type: ShadingType.SOLID, fill: "F0FDFA", color: "F0FDFA" },
                margins: { top: 70, bottom: 70, left: 120, right: 120 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 10, color: borderHex },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                  left: { style: BorderStyle.SINGLE, size: 10, color: borderHex },
                  right: { style: BorderStyle.SINGLE, size: 10, color: borderHex }
                },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 0, after: 0 },
                    children: [
                      new TextRun({
                        text:
                          remedialScope === "affected"
                            ? "Risk Perception & Remedial Measures for Exceeded Parameters"
                            : "Risk Perception & Remedial Measures for Selected Parameters",
                        font: fontName,
                        size: 22,
                        bold: true,
                        color: titleHex
                      })
                    ]
                  })
                ]
              })
            ]
          }),
          ...resolvedMeasures.map(({ item, measure }, idx) => {
            const isLast = idx === resolvedMeasures.length - 1;
            const remedialDescParts: string[] = [];
            if (measure.desc) remedialDescParts.push(measure.desc);
            measure.sections.forEach((sec) => {
              const secLine = [sec.subtitle, sec.desc, sec.points ? sec.points.join("; ") : "", sec.postDesc]
                .filter(Boolean)
                .join(" ");
              if (secLine) remedialDescParts.push(secLine);
            });

            const rightParas: Paragraph[] = [];
            if (measure.riskPerception) {
              rightParas.push(
                new Paragraph({
                  spacing: { before: 0, after: 35 },
                  children: [
                    new TextRun({
                      text: "Risk Perception: ",
                      font: fontName,
                      size: Math.max(16, fontHalfPt - 2),
                      bold: true,
                      color: "B91C1C"
                    }),
                    new TextRun({
                      text: measure.riskPerception,
                      font: fontName,
                      size: Math.max(16, fontHalfPt - 2),
                      color: fontColorHex
                    })
                  ]
                })
              );
            }
            rightParas.push(
              new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [
                  new TextRun({
                    text: "Remedial Measures: ",
                    font: fontName,
                    size: Math.max(16, fontHalfPt - 2),
                    bold: true,
                    color: titleHex
                  }),
                  new TextRun({
                    text: remedialDescParts.join(" "),
                    font: fontName,
                    size: Math.max(16, fontHalfPt - 2),
                    color: fontColorHex
                  })
                ]
              })
            );

            return new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: 22, type: WidthType.PERCENTAGE },
                  verticalAlign: VerticalAlign.TOP,
                  shading: { type: ShadingType.SOLID, fill: idx % 2 === 0 ? "FFFFFF" : altRowHex, color: idx % 2 === 0 ? "FFFFFF" : altRowHex },
                  margins: { top: 55, bottom: 55, left: 100, right: 80 },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
                    bottom: { style: BorderStyle.SINGLE, size: isLast ? 10 : 4, color: isLast ? borderHex : "E2E8F0" },
                    left: { style: BorderStyle.SINGLE, size: 10, color: borderHex },
                    right: { style: BorderStyle.DASHED, size: 4, color: "CBD5E1" }
                  },
                  children: [
                    new Paragraph({
                      spacing: { before: 0, after: 0 },
                      children: [
                        new TextRun({
                          text: `${item.name} (${item.limitStr})`,
                          font: fontName,
                          size: Math.max(16, fontHalfPt - 2),
                          bold: true,
                          color: titleHex
                        })
                      ]
                    })
                  ]
                }),
                new TableCell({
                  width: { size: 78, type: WidthType.PERCENTAGE },
                  verticalAlign: VerticalAlign.TOP,
                  shading: { type: ShadingType.SOLID, fill: idx % 2 === 0 ? "FFFFFF" : altRowHex, color: idx % 2 === 0 ? "FFFFFF" : altRowHex },
                  margins: { top: 55, bottom: 55, left: 90, right: 100 },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
                    bottom: { style: BorderStyle.SINGLE, size: isLast ? 10 : 4, color: isLast ? borderHex : "E2E8F0" },
                    left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.SINGLE, size: 10, color: borderHex }
                  },
                  children: rightParas
                })
              ]
            });
          })
        ];

        remedialBlocks.push(
          new Paragraph({ spacing: { before: 100, after: 0 }, children: [] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: remedialRows
          })
        );
      }
    }

    const nodes: (Paragraph | Table)[] = [
      new Paragraph({
        pageBreakBefore: addPageBreakBefore,
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60 },
        children: [
          new TextRun({
            text: `Groundwater Quality Scenario in ${toProperCase(targetState || "State")}`,
            font: fontName,
            size: 40,
            bold: true,
            color: titleHex
          })
        ]
      })
    ];

    if (periodStr) {
      nodes.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 140 },
          children: [
            new TextRun({
              text: `Assessment Season: ${toNormalTitleCase(periodStr)} · Total Stations Monitored: ${rows.length}`,
              font: fontName,
              size: 18,
              bold: true,
              color: "64748B"
            })
          ]
        })
      );
    }

    nodes.push(complianceTable, ...middleBlocks, ...remedialBlocks);
    return nodes;
  };

  // Export Complete State Fact Sheet as Native Microsoft Word (.docx)
  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      if (showToast) showToast("Generating Publication-Quality Word (.docx) Fact Sheet...", "info");

      const isLandscape = layoutOrientation === "landscape";
      const mapToEmbed = activeDisplayMap || snapshotDataUrl;
      const docChildren = await buildStateDocxNodes(
        activeState || "State",
        stateData,
        assessmentPeriod,
        computedTableStats,
        mapToEmbed,
        false
      );

      const doc = new Document({
        creator: "CGWB National Groundwater Information System",
        title: `Groundwater Quality Scenario in ${toProperCase(activeState || "State")}`,
        sections: [
          {
            properties: {
              page: {
                size: {
                  orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
                },
                margin: {
                  top: 650,
                  right: 650,
                  bottom: 650,
                  left: 650
                }
              }
            },
            children: docChildren
          }
        ]
      });

      const blob = await Packer.toBlob(doc);
      const fileName = `State_Fact_Sheet_${(activeState || "State").replace(/[^a-zA-Z0-9]/g, "_")}_${layoutOrientation.toUpperCase()}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      if (showToast) showToast("State Fact Sheet downloaded as Microsoft Word (.docx)!", "success");
    } catch (err) {
      console.error("DOCX export error:", err);
      if (showToast) showToast("Failed to export Fact Sheet to Word (.docx)", "error");
    } finally {
      setIsExportingDocx(false);
    }
  };

  // One-Click Batch Export: Generate Fact Sheets for ALL States / UTs into a single publication-grade .docx
  const handleExportAllStatesDocx = async () => {
    if (stateList.length === 0) {
      if (showToast) showToast("No States or UTs available in the loaded dataset.", "error");
      return;
    }

    setIsExportingAllDocx(true);
    setAllStatesDocxProgress({ current: 0, total: stateList.length, stateName: stateList[0] });

    try {
      if (showToast) {
        showToast(`Generating Word (.docx) Fact Sheets for all ${stateList.length} States/UTs...`, "info");
      }

      const isLandscape = layoutOrientation === "landscape";
      const batchCanvas = document.createElement("canvas");
      const batchGridRes = stateList.length > 10 ? 460 : 600;
      const allChildren: (Paragraph | Table)[] = [];

      for (let i = 0; i < stateList.length; i++) {
        const stName = stateList[i];
        setAllStatesDocxProgress({ current: i + 1, total: stateList.length, stateName: stName });

        // Yield to UI thread so progress indicator updates smoothly
        await new Promise((r) => setTimeout(r, 15));

        const stRows = getStateRows(stName);
        const stPeriod = getAssessmentPeriodForRows(stRows);
        const stStats = getComputedTableStatsForRows(stRows);
        const stPts = getEcSpatialPointsForRows(stRows);
        const stSpatialInfo = getStateSpatialInfoForState(stName, stPts);

        let stMapUrl: string | undefined;
        const importedStMap = sharedBulletinMaps[`${norm(stName)}_EC`];
        if (mapSourceMode === "imported_gis" && importedStMap) {
          stMapUrl = importedStMap;
        } else if (mapSourceMode === "all_india" && allIndiaEcMap) {
          stMapUrl = allIndiaEcMap;
        } else {
          stMapUrl = renderPublicationMapDataUrl(
            stName,
            stPts,
            stSpatialInfo,
            stPeriod,
            batchCanvas,
            batchGridRes
          );
        }

        const stNodes = await buildStateDocxNodes(
          stName,
          stRows,
          stPeriod,
          stStats,
          stMapUrl,
          i > 0
        );
        allChildren.push(...stNodes);
      }

      setAllStatesDocxProgress({
        current: stateList.length,
        total: stateList.length,
        stateName: "Packaging Word Document..."
      });
      await new Promise((r) => setTimeout(r, 15));

      const doc = new Document({
        creator: "CGWB National Groundwater Information System",
        title: "National Groundwater Quality Fact Sheets — All States & UTs",
        sections: [
          {
            properties: {
              page: {
                size: {
                  orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
                },
                margin: {
                  top: 650,
                  right: 650,
                  bottom: 650,
                  left: 650
                }
              }
            },
            children: allChildren
          }
        ]
      });

      const blob = await Packer.toBlob(doc);
      const fileName = `All_States_UT_Groundwater_Fact_Sheets_${layoutOrientation.toUpperCase()}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      if (showToast) {
        showToast(`Generated Fact Sheets for all ${stateList.length} States/UTs in Word (.docx)!`, "success");
      }
    } catch (err) {
      console.error("All States DOCX batch export error:", err);
      if (showToast) showToast("Failed to generate All States/UT Word (.docx)", "error");
    } finally {
      setIsExportingAllDocx(false);
      setAllStatesDocxProgress(null);
    }
  };

  return (
    <div className="space-y-6 pb-12 font-sans animate-fade-in text-slate-800">
      {/* Hidden processing canvas for auto-rendering GIS snapshot */}
      <canvas ref={gisSnapshotCanvasRef} className="hidden" />

      {/* 1. TOP TOOLBAR & CONTROLS (Clean Two-Row Responsive Layout - Zero Right-Edge Overflow) */}
      <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white shadow-xl border border-teal-800 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-teal-300 bg-teal-950/90 border border-teal-700 px-2.5 py-0.5 rounded-md">
                CGWB National Groundwater Quality Assessment · IS 10500:2012
              </span>
              {assessmentPeriod && (
                <span className="text-[10px] font-bold tracking-wide text-amber-300 bg-amber-950/90 border border-amber-700 px-2.5 py-0.5 rounded-md">
                  {toNormalTitleCase(assessmentPeriod)}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              State Groundwater Quality Fact Sheet
            </h1>
            <p className="text-xs text-slate-300 mt-0.5 font-medium">
              Multi-parameter compliance table, high-density GIS map snapshot, district anomalies, and remedial measures.
            </p>
          </div>

          {/* State & Parameter Selectors */}
          <div className="flex flex-wrap items-end gap-2.5">
            {/* State Dropdown Selector */}
            <div className="relative min-w-[180px]">
              <label className="block text-[9px] font-black uppercase tracking-widest text-teal-200 mb-1">
                Select State / UT:
              </label>
              <div className="relative flex items-center">
                <select
                  value={activeState}
                  onChange={(e) => {
                    const st = e.target.value;
                    setActiveState(st);
                    if (setGlobalState) setGlobalState(st);
                  }}
                  className="w-full bg-white text-slate-900 font-black text-xs pl-3 pr-8 py-2 rounded-xl border-2 border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400 shadow-md cursor-pointer appearance-none"
                >
                  {stateList.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-700 absolute right-2.5 pointer-events-none" />
              </div>
            </div>

            {/* PARAMETER SELECTION MODAL BUTTON */}
            <div className="relative">
              <label className="block text-[9px] font-black uppercase tracking-widest text-teal-200 mb-1">
                Parameters ({selectedParamKeys.length}):
              </label>
              <button
                onClick={() => setParamPickerOpen(!paramPickerOpen)}
                className="px-3 py-2 rounded-xl text-xs font-black bg-teal-800 hover:bg-teal-700 text-white shadow-md border border-teal-600 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                title="Select one or more parameters to display in the Fact Sheet"
              >
                <Filter className="w-3.5 h-3.5 text-teal-300" />
                <span>Parameters</span>
                <span className="w-4 h-4 rounded-full bg-teal-400 text-slate-950 text-[10px] flex items-center justify-center font-black">
                  {selectedParamKeys.length}
                </span>
              </button>

              {/* Dropdown Popover for Parameter Multi-Select */}
              {paramPickerOpen && (() => {
                const pickerParams = showOnlyExceededParamsInPicker
                  ? availableDatasetParams.filter(
                      (p) =>
                        CANONICAL_PREVALENT_KEYS.includes(p.key) ||
                        (stateParamExceedanceMap[p.key]?.exceedCount || 0) > 0
                    )
                  : availableDatasetParams;

                return (
                  <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border-2 border-teal-600 p-4 z-[9999] text-slate-900 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-2.5">
                      <span className="font-extrabold text-xs text-slate-900 uppercase tracking-wide">
                        Choose Fact Sheet Parameters
                      </span>
                      <button
                        onClick={() => setParamPickerOpen(false)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Core 5 + Exceedances Filter Switcher */}
                    <div className="flex items-center justify-between bg-slate-100 p-1 rounded-xl border border-slate-200 mb-2.5 gap-1">
                      <button
                        type="button"
                        onClick={() => setShowOnlyExceededParamsInPicker(true)}
                        className={`flex-1 py-1 px-2 text-[10px] font-black rounded-lg cursor-pointer transition-colors ${
                          showOnlyExceededParamsInPicker
                            ? "bg-teal-700 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Core 5 + Exceeded ({corePlusExceededParamKeys.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowOnlyExceededParamsInPicker(false)}
                        className={`flex-1 py-1 px-2 text-[10px] font-black rounded-lg cursor-pointer transition-colors ${
                          !showOnlyExceededParamsInPicker
                            ? "bg-slate-800 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        All Parameters ({availableDatasetParams.length})
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                      <button
                        type="button"
                        onClick={() => setSelectedParamKeys(corePlusExceededParamKeys)}
                        className="text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200 py-1 px-1.5 rounded-lg cursor-pointer transition-colors"
                        title="Keep EC, Fluoride, Nitrate, Arsenic & Uranium always, plus other parameters with exceedances"
                      >
                        Core 5 + Ex ({corePlusExceededParamKeys.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedParamKeys(CANONICAL_PREVALENT_KEYS)}
                        className="text-[10px] font-bold bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 py-1 px-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        5 Prevalent
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedParamKeys(availableDatasetParams.map((p) => p.key))}
                        className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 py-1 px-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        Select All ({availableDatasetParams.length})
                      </button>
                    </div>

                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700 bg-teal-50/70 border border-teal-200/80 rounded-lg px-2 py-1.5 mb-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hideNonCoreZeroExceedance}
                        onChange={(e) => setHideNonCoreZeroExceedance(e.target.checked)}
                        className="accent-teal-700 rounded"
                      />
                      <span>Always show EC, F, NO₃, As, U (0% / Not Any); hide other 0-exceedance params</span>
                    </label>

                    <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      {pickerParams.map((p) => {
                        const isChecked = selectedParamKeys.includes(p.key);
                        const isCore = CANONICAL_PREVALENT_KEYS.includes(p.key);
                        const exCount = stateParamExceedanceMap[p.key]?.exceedCount || 0;
                        return (
                          <label
                            key={p.key}
                            className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all border ${
                              isChecked
                                ? "bg-teal-50/80 border-teal-300 font-bold text-teal-950"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleParam(p.key)}
                                className="rounded accent-teal-600 w-3.5 h-3.5"
                              />
                              <span>
                                {p.name} <span className="text-[10px] text-slate-400 font-mono">({p.key})</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {exCount > 0 ? (
                                <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                  {exCount} ex
                                </span>
                              ) : isCore ? (
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  0% · Core
                                </span>
                              ) : null}
                              <span className="text-[9px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                {p.limitStr}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-200 flex justify-end">
                      <button
                        onClick={() => setParamPickerOpen(false)}
                        className="px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-black text-xs cursor-pointer"
                      >
                        Done ({selectedParamKeys.length} selected)
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Second Row inside Card: Layout & Export Action Buttons (Contained cleanly within card width) */}
        <div className="pt-3 border-t border-teal-800/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* LANDSCAPE / PORTRAIT ORIENTATION SWITCHER */}
            <div className="flex items-center bg-teal-950/80 p-0.5 rounded-xl border border-teal-700">
              <button
                type="button"
                onClick={() => setLayoutOrientation("portrait")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                  layoutOrientation === "portrait"
                    ? "bg-teal-500 text-slate-950 shadow-sm"
                    : "text-teal-200 hover:text-white"
                }`}
                title="Switch to Portrait Mode"
              >
                <Layout className="w-3 h-3" />
                <span>Portrait</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutOrientation("landscape")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                  layoutOrientation === "landscape"
                    ? "bg-teal-500 text-slate-950 shadow-sm"
                    : "text-teal-200 hover:text-white"
                }`}
                title="Switch to Landscape Mode (Wide Panorama View)"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Landscape</span>
              </button>
            </div>

            {/* MAP & DISTRICT LIST ARRANGEMENT SWITCHER (Stacked vs Side-by-Side) */}
            <div className="flex items-center bg-teal-950/80 p-0.5 rounded-xl border border-teal-700">
              <button
                type="button"
                onClick={() => setMapDistrictLayout("stacked")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  mapDistrictLayout === "stacked"
                    ? "bg-cyan-400 text-slate-950 shadow-sm"
                    : "text-teal-200 hover:text-white"
                }`}
                title="Place Map above Anomalous District List"
              >
                Stacked
              </button>
              <button
                type="button"
                onClick={() => setMapDistrictLayout("side_by_side")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  mapDistrictLayout === "side_by_side"
                    ? "bg-cyan-400 text-slate-950 shadow-sm"
                    : "text-teal-200 hover:text-white"
                }`}
                title="Place Map and Anomalous District List Side by Side"
              >
                Side-by-Side
              </button>
            </div>

            {/* SLIDE AREA SIZING CONTROLS TOGGLE */}
            <button
              onClick={() => setShowAreaControls(!showAreaControls)}
              className={`px-2.5 py-2 rounded-xl text-xs font-black border shadow-md flex items-center gap-1 cursor-pointer transition-all active:scale-95 ${
                showAreaControls
                  ? "bg-amber-400 text-slate-950 border-amber-300"
                  : "bg-teal-800 hover:bg-teal-700 text-teal-100 border-teal-600"
              }`}
              title="Adjust area and sizing of maps, tables, and infographics"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Resize Sections</span>
            </button>

            {onNavigateToGis && (
              <button
                onClick={onNavigateToGis}
                className="px-2.5 py-2 rounded-xl text-xs font-black bg-indigo-700 hover:bg-indigo-600 text-white shadow-md border border-indigo-500 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                title="Open Geospatial Map Module"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                <span>GIS Editor</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* EXPORT TO WORD (.DOCX) PUBLICATION DOCUMENT */}
            <button
              onClick={handleExportDocx}
              disabled={isExportingDocx || isExportingAllDocx}
              className="px-3 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-500 text-white shadow-md border border-blue-400 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
              title="Download active State Fact Sheet as editable Microsoft Word (.docx) document"
            >
              {isExportingDocx ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>{isExportingDocx ? "Exporting..." : "Word (.docx)"}</span>
            </button>

            {/* ONE-CLICK ALL STATES/UT WORD (.DOCX) COMPENDIUM */}
            <button
              onClick={handleExportAllStatesDocx}
              disabled={isExportingAllDocx || isExportingDocx || stateList.length === 0}
              className="px-3 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md border border-violet-400 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
              title={`Generate Fact Sheets for all ${stateList.length} States/UTs into a single Word (.docx) document on one click`}
            >
              {isExportingAllDocx ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>
                {isExportingAllDocx && allStatesDocxProgress
                  ? `All States (${allStatesDocxProgress.current}/${allStatesDocxProgress.total})`
                  : `All States/UT (${stateList.length}) .docx`}
              </span>
            </button>

            {/* EXPORT TO EXCEL WITH EMBEDDED PUBLICATION QUALITY MAP */}
            <button
              onClick={handleExportExcel}
              className="px-3 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-md border border-emerald-400 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
              title="Download Publication-Quality Excel with Embedded Map Image"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel + Map</span>
            </button>

            {/* DIRECT 4K MAP EXPORT */}
            <button
              onClick={handleExportMapPng}
              className="px-2.5 py-2 rounded-xl text-xs font-black bg-sky-700 hover:bg-sky-600 text-white shadow-md border border-sky-500 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
              title="Download GIS Map Only (Publication 4K PNG)"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Map PNG</span>
            </button>

            {/* HIGH DENSITY GLOSSY IMAGE DOWNLOAD BUTTON */}
            <button
              onClick={handleExportJpeg}
              disabled={isExportingJpeg}
              className="px-3 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-500 text-slate-950 shadow-[0_4px_16px_rgba(245,158,11,0.35)] border border-amber-300 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
              title="Download Fact Sheet as High-Density Glossy Image (300/600 DPI matching screen exactly)"
            >
              {isExportingJpeg ? (
                <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-slate-950" />
              )}
              <span>{isExportingJpeg ? "Saving..." : "Save Glossy Image"}</span>
            </button>

            <button
              onClick={() => window.print()}
              className="px-2.5 py-2 rounded-xl text-xs font-black bg-slate-700 hover:bg-slate-600 text-white shadow-md border border-slate-600 flex items-center gap-1 cursor-pointer transition-all"
              title="Print Fact Sheet"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* BATCH EXPORT PROGRESS BAR FOR ALL STATES/UT DOCX */}
      {isExportingAllDocx && allStatesDocxProgress && (
        <div className="bg-indigo-50 border-2 border-indigo-300 rounded-2xl p-3.5 shadow-md space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-black text-indigo-950">
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Generating Fact Sheet {allStatesDocxProgress.current} of {allStatesDocxProgress.total}:{" "}
              <span className="text-indigo-700">{toProperCase(allStatesDocxProgress.stateName)}</span>
            </span>
            <span className="font-mono text-indigo-700">
              {Math.round((allStatesDocxProgress.current / Math.max(1, allStatesDocxProgress.total)) * 100)}%
            </span>
          </div>
          <div className="w-full h-2 bg-indigo-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-all duration-200"
              style={{
                width: `${Math.round((allStatesDocxProgress.current / Math.max(1, allStatesDocxProgress.total)) * 100)}%`
              }}
            />
          </div>
        </div>
      )}

      {/* COLLAPSIBLE SLIDE AREA SIZING & VISUAL CONTROLS BAR (Requirement 6) */}
      {showAreaControls && (
        <div className="bg-white rounded-2xl p-4 border-2 border-amber-400 shadow-xl space-y-3.5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                Slide Area & Sizing Controller (Small / Large Scale Maps & Tables)
              </span>
            </div>
            <button
              onClick={() => {
                setMapHeight(540);
                setAttrFontFamily("Times New Roman");
                setAttrFontWeight("bold");
                setAttrFontItalic(false);
                setAttrFontSize(12);
                setAttrFontColor("#0f172a");
                setAttrShowHalo(false);
                setShowStationPoints(false);
                setShowGraticule(true);
                setShowNeighbourLabels(false);
                setMapBackground("white");
                setMapDistrictLayout("stacked");
                setShowRemedialMeasures(true);
                setRemedialScope("affected");
                setTableScale("normal");
                setLayoutOrientation("portrait");
              }}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Map Height Slider & Presets */}
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center text-xs font-black text-slate-700">
                <span>Map Canvas Height</span>
                <span className="font-mono text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {mapHeight}px
                </span>
              </div>
              <input
                type="range"
                min={380}
                max={850}
                step={20}
                value={mapHeight}
                onChange={(e) => setMapHeight(Number(e.target.value))}
                className="w-full accent-teal-600 cursor-pointer h-1.5 bg-slate-200 rounded"
              />
              <div className="flex gap-1 pt-1">
                {[420, 540, 680, 800].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setMapHeight(h)}
                    className={`flex-1 py-1 text-[10px] font-bold rounded border cursor-pointer ${
                      mapHeight === h
                        ? "bg-teal-600 text-white border-teal-700"
                        : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                    }`}
                  >
                    {h === 420 ? "Compact" : h === 540 ? "Balanced" : h === 680 ? "Large" : "Poster"}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. District Attribute Labels Typography Controls (User Requirement 2) */}
            <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="block text-xs font-black text-slate-700">
                District Attribute Label Typography
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500">Font Family</label>
                  <select
                    value={attrFontFamily}
                    onChange={(e) => setAttrFontFamily(e.target.value)}
                    className="w-full text-[11px] font-bold py-1 px-1 rounded border border-slate-300 bg-white"
                  >
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Arial">Arial (Sans)</option>
                    <option value="Calibri">Calibri</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Trebuchet MS">Trebuchet MS</option>
                    <option value="Courier New">Courier Mono</option>
                    <option value="Verdana">Verdana</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500">Size: {attrFontSize}px</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setAttrFontSize((s) => Math.max(8, s - 1))}
                      className="px-2 py-0.5 bg-white border border-slate-300 rounded font-bold text-xs"
                    >
                      -
                    </button>
                    <span className="flex-1 text-center text-xs font-bold text-slate-700">{attrFontSize}px</span>
                    <button
                      type="button"
                      onClick={() => setAttrFontSize((s) => Math.min(24, s + 1))}
                      className="px-2 py-0.5 bg-white border border-slate-300 rounded font-bold text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAttrFontWeight((w) => (w === "bold" ? "normal" : "bold"))}
                  className={`flex-1 py-1 text-[10px] font-black rounded border cursor-pointer ${
                    attrFontWeight === "bold" ? "bg-teal-700 text-white border-teal-800" : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  Bold
                </button>
                <button
                  type="button"
                  onClick={() => setAttrFontItalic((i) => !i)}
                  className={`flex-1 py-1 text-[10px] italic font-bold rounded border cursor-pointer ${
                    attrFontItalic ? "bg-teal-700 text-white border-teal-800" : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  Italic
                </button>
                <button
                  type="button"
                  onClick={() => setAttrShowHalo((h) => !h)}
                  className={`flex-1 py-1 text-[10px] font-bold rounded border cursor-pointer ${
                    attrShowHalo ? "bg-teal-700 text-white border-teal-800" : "bg-white text-slate-700 border-slate-300"
                  }`}
                  title="White halo around labels for readability over IDW colors"
                >
                  Halo {attrShowHalo ? "ON" : "OFF"}
                </button>
                <input
                  type="color"
                  value={attrFontColor}
                  onChange={(e) => setAttrFontColor(e.target.value)}
                  className="w-6 h-6 p-0 border border-slate-300 rounded cursor-pointer"
                  title="Label Text Color"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 text-[10px] text-slate-600 border-t border-slate-200">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showStationPoints}
                    onChange={(e) => setShowStationPoints(e.target.checked)}
                    className="accent-teal-600 rounded"
                  />
                  <span>Points</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGraticule}
                    onChange={(e) => setShowGraticule(e.target.checked)}
                    className="accent-teal-600 rounded"
                  />
                  <span>Graticule</span>
                </label>
                <label
                  className="flex items-center gap-1 cursor-pointer"
                  title="Show or hide neighbouring state and district names outside selected state"
                >
                  <input
                    type="checkbox"
                    checked={showNeighbourLabels}
                    onChange={(e) => setShowNeighbourLabels(e.target.checked)}
                    className="accent-teal-600 rounded"
                  />
                  <span>Neighbour Names</span>
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200">
                <span className="text-[10px] font-bold text-slate-600">Map Background:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMapBackground("white")}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded border cursor-pointer ${
                      mapBackground === "white"
                        ? "bg-teal-700 text-white border-teal-800"
                        : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    White
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapBackground("transparent")}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded border cursor-pointer ${
                      mapBackground === "transparent"
                        ? "bg-teal-700 text-white border-teal-800"
                        : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    Transparent
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Table Font & Row Spacing Scale */}
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="block text-xs font-black text-slate-700">
                Compliance Table Scale
              </span>
              <div className="flex gap-1 pt-1">
                {[
                  { id: "compact", label: "Compact" },
                  { id: "normal", label: "Standard" },
                  { id: "enlarged", label: "Enlarged" }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTableScale(t.id as any)}
                    className={`flex-1 py-1.5 text-[10.5px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                      tableScale === t.id
                        ? "bg-teal-600 text-white border-teal-700 shadow-xs"
                        : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Map Source Switcher (Requirement 8) */}
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-700">Map Source</span>
                {(stateEcMap || importedGisMap || allIndiaEcMap) && (
                  <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    GIS Synced
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => setMapSourceMode("state_canvas")}
                  className={`py-1 px-2 text-[10px] font-bold rounded border text-left flex items-center justify-between cursor-pointer ${
                    mapSourceMode === "state_canvas"
                      ? "bg-teal-700 text-white border-teal-800"
                      : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                  }`}
                >
                  <span>State Boundary Cropped IDW (300+ DPI)</span>
                  {mapSourceMode === "state_canvas" && <Check className="w-3 h-3" />}
                </button>
                {(stateEcMap || importedGisMap) && (
                  <button
                    type="button"
                    onClick={() => setMapSourceMode("imported_gis")}
                    className={`py-1 px-2 text-[10px] font-bold rounded border text-left flex items-center justify-between cursor-pointer ${
                      mapSourceMode === "imported_gis"
                        ? "bg-teal-700 text-white border-teal-800"
                        : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                    }`}
                  >
                    <span>Sent from Geospatial Module</span>
                    {mapSourceMode === "imported_gis" && <Check className="w-3 h-3" />}
                  </button>
                )}
                {allIndiaEcMap && (
                  <button
                    type="button"
                    onClick={() => setMapSourceMode("all_india")}
                    className={`py-1 px-2 text-[10px] font-bold rounded border text-left flex items-center justify-between cursor-pointer ${
                      mapSourceMode === "all_india"
                        ? "bg-teal-700 text-white border-teal-800"
                        : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                    }`}
                  >
                    <span>All-India EC Map (from GIS)</span>
                    {mapSourceMode === "all_india" && <Check className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. PUBLICATION FORMATTING & TYPOGRAPHY TOOLBARS (User Requirements 1, 3 & Attachment image_aeb8d2ae.png) */}
      <div className="bg-gradient-to-r from-slate-50 via-teal-50/50 to-slate-50 rounded-2xl p-3.5 sm:p-4 border border-slate-300 shadow-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-teal-700" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Publication Document Typography & Formatting Controls
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Map & Districts Layout Quick Switcher */}
            <div className="flex items-center bg-white rounded-lg border border-slate-300 p-0.5 gap-0.5">
              <span className="text-[10px] font-bold text-slate-500 px-1.5">Map & Districts:</span>
              <button
                type="button"
                onClick={() => setMapDistrictLayout("stacked")}
                className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                  mapDistrictLayout === "stacked"
                    ? "bg-teal-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Stacked
              </button>
              <button
                type="button"
                onClick={() => setMapDistrictLayout("side_by_side")}
                className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                  mapDistrictLayout === "side_by_side"
                    ? "bg-teal-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Side-by-Side
              </button>
            </div>

            {/* Remedial Measures Toggle & Scope */}
            <div className="flex items-center bg-white rounded-lg border border-slate-300 p-0.5 gap-1 px-1.5">
              <label className="flex items-center gap-1 text-[10px] font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRemedialMeasures}
                  onChange={(e) => setShowRemedialMeasures(e.target.checked)}
                  className="accent-teal-600 rounded"
                />
                <span>Remedial Measures</span>
              </label>
              {showRemedialMeasures && (
                <select
                  value={remedialScope}
                  onChange={(e) => setRemedialScope(e.target.value as "selected" | "affected")}
                  className="text-[10px] font-bold bg-slate-50 text-teal-800 rounded px-1 py-0.5 border border-slate-200 cursor-pointer"
                  title="Choose whether Remedial Measures display only exceeded parameters or all selected parameters"
                >
                  <option value="affected">Exceeded Only</option>
                  <option value="selected">All Selected Params</option>
                </select>
              )}
            </div>

            <label
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                showNeighbourLabels
                  ? "bg-teal-700 text-white border-teal-800"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              title="Show or hide neighbouring district/state names outside the selected state"
            >
              <input
                type="checkbox"
                checked={showNeighbourLabels}
                onChange={(e) => setShowNeighbourLabels(e.target.checked)}
                className="accent-teal-600 rounded"
              />
              <span>Neighbour Names</span>
            </label>

            <div className="flex items-center bg-white rounded-lg border border-slate-300 p-0.5 gap-0.5">
              <span className="text-[10px] font-bold text-slate-500 px-1.5">Map BG:</span>
              <button
                type="button"
                onClick={() => setMapBackground("white")}
                className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                  mapBackground === "white"
                    ? "bg-teal-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                White
              </button>
              <button
                type="button"
                onClick={() => setMapBackground("transparent")}
                className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                  mapBackground === "transparent"
                    ? "bg-teal-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Transparent
              </button>
            </div>

            <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
              Live Preview · High-Resolution Publication Engine
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* A. TABLE TYPOGRAPHY CONTROLS (Exact layout matching image_aeb8d2ae.png) */}
          <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 pr-1.5 border-r border-slate-200 shrink-0">
              <Type className="w-3.5 h-3.5 text-teal-700" />
              <span>Table Font:</span>
            </div>

            {/* Font Family Dropdown */}
            <select
              value={tableFontFamily}
              onChange={(e) => setTableFontFamily(e.target.value)}
              className="text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-300 focus:outline-none cursor-pointer"
              title="Change Table Font Family"
            >
              <option value="Times New Roman">Times New Roman</option>
              <option value="Arial">Arial (Sans)</option>
              <option value="Calibri">Calibri</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
              <option value="Courier New">Courier Mono</option>
            </select>

            {/* Bold & Italic Toggles */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300 gap-0.5">
              <button
                type="button"
                onClick={() => setTableFontWeight((w) => (w === "bold" ? "normal" : "bold"))}
                className={`px-2 py-1 text-xs font-black rounded transition-all cursor-pointer ${
                  tableFontWeight === "bold" ? "bg-teal-700 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
                title="Toggle Bold for Tables"
              >
                B
              </button>
              <button
                type="button"
                onClick={() => setTableFontItalic((i) => !i)}
                className={`px-2 py-1 text-xs font-bold italic rounded transition-all cursor-pointer ${
                  tableFontItalic ? "bg-teal-700 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
                title="Toggle Italic for Tables"
              >
                I
              </button>
            </div>

            {/* Font Size Stepper */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300 gap-1 px-1.5">
              <button
                type="button"
                onClick={() => setTableFontSize((s) => Math.max(9, s - 1))}
                className="w-5 h-5 flex items-center justify-center bg-white border border-slate-200 rounded text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                title="Decrease Table Font Size"
              >
                -
              </button>
              <span className="text-xs font-bold text-slate-800 min-w-[30px] text-center">
                {tableFontSize}px
              </span>
              <button
                type="button"
                onClick={() => setTableFontSize((s) => Math.min(18, s + 1))}
                className="w-5 h-5 flex items-center justify-center bg-white border border-slate-200 rounded text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                title="Increase Table Font Size"
              >
                +
              </button>
            </div>

            {/* Font Color Picker */}
            <div className="flex items-center bg-slate-100 px-1.5 py-1 rounded-lg border border-slate-300 gap-1" title="Table Font Color">
              <span className="text-[10px] font-bold text-slate-500">Color:</span>
              <input
                type="color"
                value={tableFontColor}
                onChange={(e) => setTableFontColor(e.target.value)}
                className="w-5 h-5 p-0 border border-slate-300 rounded cursor-pointer"
              />
            </div>

            {/* Header Background Color Picker */}
            <div className="flex items-center bg-slate-100 px-1.5 py-1 rounded-lg border border-slate-300 gap-1" title="Table Header Color">
              <Palette className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] font-bold text-slate-500">Header:</span>
              <input
                type="color"
                value={tableHeaderBg}
                onChange={(e) => setTableHeaderBg(e.target.value)}
                className="w-5 h-5 p-0 border border-slate-300 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* B. FACT SHEET TEMPLATE THEMES (User Requirement 5: Separate Themes) */}
          <div className="bg-white/95 p-2.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 pr-2 border-r border-slate-200 shrink-0">
              <Palette className="w-3.5 h-3.5 text-teal-700" />
              <span>Template Theme:</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 flex-1">
              {FACT_SHEET_THEMES.map((theme) => {
                const isSelected = selectedThemeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleSelectTheme(theme.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      isSelected
                        ? "bg-slate-900 text-white border-slate-900 shadow-xs ring-2 ring-teal-500/40"
                        : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200"
                    }`}
                    title={`Apply ${theme.name} Theme`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: theme.primaryColor }}
                    />
                    <span>{theme.name}</span>
                    {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. THE OFFICIAL STATE FACT SHEET DOSSIER (Pristine Publication Quality - Zero Extraneous UI Text) */}
      <div
        ref={factSheetContainerRef}
        data-glossy-transparent="root"
        className={`relative bg-white rounded-3xl p-6 sm:p-8 border border-slate-300 shadow-[0_20px_50px_rgba(0,0,0,0.08)] space-y-5 mx-auto font-sans overflow-hidden transition-all duration-300 ${
          layoutOrientation === "landscape" ? "max-w-[1440px]" : "max-w-5xl"
        }`}
        style={{ backgroundColor: "#ffffff" }}
      >
        {/* Subtle Ambient Specular Top Accent (Dynamic Theme Gradient) */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${currentTheme.topGradient} pointer-events-none`} />

        {/* HEADER: Centered Publication Heading & Clean Subtitle */}
        <div className="text-center pb-0.5">
          <h2
            style={{
              fontFamily: `"${tableFontFamily}", Georgia, serif, sans-serif`,
              color: currentTheme.titleColor
            }}
            className="text-2xl sm:text-3xl font-black tracking-tight drop-shadow-xs"
          >
            Groundwater Quality Scenario in {toProperCase(activeState || "State")}
          </h2>
          {assessmentPeriod && (
            <p
              style={{
                fontFamily: `"${tableFontFamily}", Georgia, serif, sans-serif`
              }}
              className="text-xs font-bold text-slate-500 mt-1 tracking-wide"
            >
              Assessment Season: {toNormalTitleCase(assessmentPeriod)} · Total Stations Monitored: {stateData.length}
            </p>
          )}
        </div>

        {/* TOP TABLE: Content-Fitted, Compact, Fully Customizable Typography */}
        <div
          className="overflow-x-auto rounded-xl border shadow-xs"
          style={{ borderColor: currentTheme.accentBorder }}
        >
          <table
            className="w-full text-left border-collapse"
            style={{
              fontFamily: `"${tableFontFamily}", Georgia, serif, sans-serif`,
              color: tableFontColor
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: tableHeaderBg,
                  color: "#ffffff",
                  fontFamily: `"${tableFontFamily}", Georgia, serif, sans-serif`
                }}
                className="select-none font-extrabold text-xs"
              >
                <th className={`border-r border-dashed border-white/60 text-left ${tableScale === "compact" ? "py-1 px-2.5" : tableScale === "enlarged" ? "py-2.5 px-3.5" : "py-1.5 px-3"}`}>Parameters</th>
                <th className={`border-r border-dashed border-white/60 text-center ${tableScale === "compact" ? "py-1 px-2" : tableScale === "enlarged" ? "py-2.5 px-3" : "py-1.5 px-2.5"}`}>No of samples</th>
                <th className={`border-r border-dashed border-white/60 text-center ${tableScale === "compact" ? "py-1 px-2" : tableScale === "enlarged" ? "py-2.5 px-3" : "py-1.5 px-2.5"}`}>Permissible limit</th>
                <th className={`border-r border-dashed border-white/60 text-center ${tableScale === "compact" ? "py-1 px-2" : tableScale === "enlarged" ? "py-2.5 px-3" : "py-1.5 px-2.5"}`}>No of Samples above permissible limit</th>
                <th className={`text-center ${tableScale === "compact" ? "py-1 px-2" : tableScale === "enlarged" ? "py-2.5 px-3" : "py-1.5 px-2.5"}`}>% Samples above permissible Limit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {computedTableStats.map((row, idx) => {
                const cellPad =
                  tableScale === "compact"
                    ? "py-1 px-2"
                    : tableScale === "enlarged"
                    ? "py-2.5 px-3"
                    : "py-1.5 px-2.5";
                const namePad =
                  tableScale === "compact"
                    ? "py-1 px-2.5"
                    : tableScale === "enlarged"
                    ? "py-2.5 px-3.5"
                    : "py-1.5 px-3";
                return (
                  <tr
                    key={row.key}
                    data-glossy-transparent="row"
                    style={{
                      fontFamily: `"${tableFontFamily}", Georgia, serif, sans-serif`,
                      fontSize: `${tableFontSize}px`,
                      fontWeight: tableFontWeight === "bold" ? 700 : 400,
                      fontStyle: tableFontItalic ? "italic" : "normal",
                      color: tableFontColor,
                      backgroundColor: idx % 2 === 0 ? "#ffffff" : currentTheme.tableAltRow
                    }}
                    className="transition-colors"
                  >
                    <td className={`border-r border-dashed border-slate-300 ${namePad}`}>
                      <span>{row.name}</span>
                    </td>
                    <td className={`border-r border-dashed border-slate-300 text-center ${cellPad}`}>
                      {row.sampleCount}
                    </td>
                    <td className={`border-r border-dashed border-slate-300 text-center ${cellPad}`}>
                      {row.limitStr}
                    </td>
                    <td className={`border-r border-dashed border-slate-300 text-center ${cellPad}`}>
                      {row.exceedCount}
                    </td>
                    <td className={`text-center ${cellPad}`}>
                      <span className={row.exceedPct > 0 ? "text-rose-700" : "text-emerald-700"}>
                        {row.exceedCount === 0 ? "0" : row.exceedPct.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* MIDDLE SECTION: GIS MAP + ANOMALOUS DISTRICTS (Stacked OR Side-by-Side Layout) */}
        <div
          className={
            mapDistrictLayout === "side_by_side"
              ? "grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch"
              : "space-y-4"
          }
        >
          {/* GIS MAP CARD (Fits snugly to exact map image dimensions without blank side/top space) */}
          <div
            className={
              mapDistrictLayout === "side_by_side"
                ? "md:col-span-7 flex items-center justify-center"
                : "w-full flex items-center justify-center my-1"
            }
          >
            {activeDisplayMap || snapshotDataUrl ? (
              <div
                data-glossy-transparent="map-wrapper"
                className="inline-flex w-fit max-w-full rounded-xl overflow-hidden shadow-md border-2 border-slate-300 items-center justify-center mx-auto"
                style={{
                  backgroundColor: mapBackground === "transparent" ? "#f8fafc" : "#ffffff",
                  backgroundImage:
                    mapBackground === "transparent"
                      ? "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)"
                      : undefined,
                  backgroundSize: mapBackground === "transparent" ? "16px 16px" : undefined,
                  backgroundPosition: mapBackground === "transparent" ? "0 0, 0 8px, 8px -8px, -8px 0px" : undefined
                }}
              >
                <img
                  src={activeDisplayMap || snapshotDataUrl}
                  alt={`GIS Map Snapshot of ${activeState}`}
                  className="block max-w-full w-auto h-auto"
                  style={{
                    maxHeight: `${mapHeight}px`
                  }}
                />
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 animate-pulse font-medium text-xs border border-dashed border-slate-300 rounded-xl w-full">
                Generating High-Density Publication GIS Map for {activeState}...
              </div>
            )}
          </div>

          {/* ANOMALOUS DISTRICTS CARD */}
          <div
            data-glossy-transparent="card"
            className={`${
              mapDistrictLayout === "side_by_side" ? "md:col-span-5 flex flex-col justify-between" : ""
            } rounded-xl border-2 p-4 bg-white shadow-xs space-y-2`}
            style={{ borderColor: currentTheme.anomalyBorder }}
          >
            <div className="space-y-2">
              <div className="text-center pb-1.5 border-b border-slate-100">
                <h3
                  style={{
                    fontFamily: `"${tableFontFamily}", Georgia, serif, sans-serif`,
                    color: currentTheme.anomalyTitle
                  }}
                  className="text-sm sm:text-base font-black tracking-tight"
                >
                  Districts with anomalous values at sporadic locations
                </h3>
              </div>

              <div
                className="space-y-1.5 leading-snug divide-y divide-slate-100"
                style={{
                  fontFamily: `"${tableFontFamily}", Georgia, serif, sans-serif`,
                  color: tableFontColor,
                  fontSize: `${tableFontSize}px`,
                  fontWeight: tableFontWeight === "bold" ? 700 : 400,
                  fontStyle: tableFontItalic ? "italic" : "normal"
                }}
              >
                {computedTableStats.map((item) => {
                  const dList = item.affectedDistricts;
                  return (
                    <div
                      key={item.key}
                      className={`pt-1.5 flex ${
                        mapDistrictLayout === "side_by_side"
                          ? "flex-col gap-0.5"
                          : "flex-col sm:flex-row sm:items-start gap-1 sm:gap-3"
                      }`}
                    >
                      <span
                        className={`font-bold text-rose-600 shrink-0 ${
                          mapDistrictLayout === "side_by_side" ? "" : "sm:w-48"
                        }`}
                      >
                        {item.name} ({item.limitStr})
                      </span>
                      <span className="flex-1" style={{ color: tableFontColor }}>
                        {dList.length > 0 ? dList.join(", ") : "Not Any"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* LOWER SECTION: RISK PERCEPTION & REMEDIAL MEASURES FOR PARAMETERS WITH EXCEEDANCES (FROM ALERTS SECTION) */}
        {showRemedialMeasures && (() => {
          const targetStats = computedTableStats.filter(
            (item) => remedialScope === "selected" || item.exceedCount > 0
          );
          const resolvedRemedials = targetStats
            .map((item) => ({ item, measure: findAlertRemedialMeasure(item.key) }))
            .filter(
              (entry): entry is {
                item: typeof computedTableStats[number];
                measure: NonNullable<ReturnType<typeof findAlertRemedialMeasure>>;
              } => Boolean(entry.measure)
            );

          if (resolvedRemedials.length === 0) return null;

          return (
            <div
              data-glossy-transparent="card"
              className="rounded-xl border-2 p-4 bg-white shadow-xs space-y-2.5"
              style={{ borderColor: currentTheme.accentBorder }}
            >
              <div className="text-center pb-1.5 border-b border-slate-200">
                <h3
                  style={{
                    fontFamily: `"${tableFontFamily}", Georgia, serif, sans-serif`,
                    color: currentTheme.titleColor
                  }}
                  className="text-sm sm:text-base font-black tracking-tight"
                >
                  {remedialScope === "affected"
                    ? "Risk Perception & Remedial Measures for Exceeded Parameters"
                    : "Risk Perception & Remedial Measures for Selected Parameters"}
                </h3>
              </div>

              <div
                className="divide-y divide-slate-200"
                style={{
                  fontFamily: `"${tableFontFamily}", Georgia, serif, sans-serif`,
                  color: tableFontColor,
                  fontSize: `${tableFontSize}px`,
                  fontWeight: tableFontWeight === "bold" ? 700 : 400,
                  fontStyle: tableFontItalic ? "italic" : "normal"
                }}
              >
                {resolvedRemedials.map(({ item, measure }, idx) => (
                  <div
                    key={item.key}
                    data-glossy-transparent="row"
                    className={`py-2 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-start ${
                      idx % 2 === 1 ? "bg-slate-50/70 px-2 rounded-lg" : "px-2"
                    }`}
                  >
                    <div className="md:col-span-3 flex flex-col gap-0.5">
                      <span
                        className="font-bold"
                        style={{ color: currentTheme.titleColor }}
                      >
                        {item.name} ({item.limitStr})
                      </span>
                    </div>

                    <div className="md:col-span-9 space-y-1 leading-snug">
                      {measure.riskPerception && (
                        <p>
                          <span className="font-bold text-rose-700 mr-1">Risk Perception:</span>
                          <span>{measure.riskPerception}</span>
                        </p>
                      )}
                      <div>
                        <span className="font-bold mr-1" style={{ color: currentTheme.titleColor }}>
                          Remedial Measures:
                        </span>
                        {measure.desc && <span>{measure.desc} </span>}
                        {measure.sections.map((sec, sIdx) => (
                          <span key={sIdx}>
                            {sec.subtitle && <strong className="mr-1">{sec.subtitle}</strong>}
                            {sec.desc && <span>{sec.desc} </span>}
                            {sec.points && sec.points.length > 0 && (
                              <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
                                {sec.points.map((pt, pIdx) => (
                                  <li key={pIdx}>{pt}</li>
                                ))}
                              </ul>
                            )}
                            {sec.postDesc && <span>{sec.postDesc}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
