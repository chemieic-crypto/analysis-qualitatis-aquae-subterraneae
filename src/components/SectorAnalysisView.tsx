import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from "react";
import L from "leaflet";
import * as turf from "@turf/turf";
import * as XLSX from "xlsx";
import { downloadStyledSheetJSWorkbook, ensureSheetJSNumbers } from "../utils/excelFormatter";
import shp from "shpjs";
import JSZip from "jszip";
import {
  FileSpreadsheet,
  Navigation,
  MousePointer2,
  Trash2,
  Palette,
  Eye,
  EyeOff,
  Scissors,
  Download,
  Maximize2,
  Minimize2,
  Crosshair,
  PieChart,
  RefreshCw,
  Compass,
  Map as MapIcon,
  Zap,
  Loader2,
  ArrowUpRight,
  Grid,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  BarChart3,
  SlidersHorizontal,
  Layers
} from "lucide-react";
import { DataHeaders, ShapefileLayer } from "../types";
import {
  SECTOR_PARAM_CONFIG,
  fastPointInFeature,
  createAnnularSectorPolygon,
  matchTierRange,
  computeSectorGeometryAndStats,
  selectCollisionFreeLabels,
  buildSectorsGeoJsonFeatureCollection,
  type CustomTierRange,
  type ComputedSectorItem,
  type ScreenBox,
  type LabelCandidate
} from "../utils/sectorAnalysisEngine";
import { FastWellCanvasLayer, type FastWellDot } from "../utils/fastWellCanvasLayer";

export { SECTOR_PARAM_CONFIG };
export type { CustomTierRange };

// Cascading filter normalization helpers matching App.tsx
const normFilterVal = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const isStateAllFilter = (s: string) =>
  !s || s.toLowerCase() === "all" || s.toLowerCase() === "all states" || s.toLowerCase() === "select state";
const isDistrictAllFilter = (d: string) =>
  !d || d.toLowerCase() === "all" || d.toLowerCase() === "all districts" || d.toLowerCase() === "select district";
const isYearAllFilter = (y: string) => !y || y.toLowerCase() === "all" || y.toLowerCase() === "select year";
const isSeasonAllFilter = (s: string) => !s || s.toLowerCase() === "all" || s.toLowerCase() === "select season";

/**
 * Robust coordinate parsing supporting decimal numbers, string floats, European comma decimals, and DMS
 */
export function parseCoord(val: any): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") return isFinite(val) ? val : NaN;
  const str = String(val).trim();
  if (!str) return NaN;

  const cleanStr = str.replace(/,/g, ".").trim();
  const directNum = parseFloat(cleanStr);
  if (!isNaN(directNum) && isFinite(directNum) && /^[-+]?\d+(\.\d+)?$/.test(cleanStr)) {
    return directNum;
  }

  const dmsMatch = cleanStr.match(/(\d+(?:\.\d+)?)\s*°?\s*(\d+(?:\.\d+)?)?'?\s*(\d+(?:\.\d+)?)?"?\s*([NSEWnsew])?/);
  if (dmsMatch) {
    const deg = parseFloat(dmsMatch[1]) || 0;
    const min = parseFloat(dmsMatch[2]) || 0;
    const sec = parseFloat(dmsMatch[3]) || 0;
    const dir = dmsMatch[4] ? dmsMatch[4].toUpperCase() : "";
    let dd = deg + min / 60 + sec / 3600;
    if (dir === "S" || dir === "W") dd = -dd;
    if (isFinite(dd) && dd !== 0) return dd;
  }

  const match = cleanStr.match(/[-+]?\d*\.?\d+/);
  if (match) {
    const n = parseFloat(match[0]);
    if (isFinite(n)) {
      if (/[SWsw]/.test(cleanStr) && n > 0) return -n;
      return n;
    }
  }
  return NaN;
}

/**
 * Robust water quality parameter parsing handling <0.01, BDL, ND, Nil, and units
 */
export function parseWaterValue(val: any): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") return isFinite(val) ? val : NaN;
  const str = String(val).trim();
  if (!str) return NaN;
  const lower = str.toLowerCase();
  if (lower === "bdl" || lower === "nil" || lower === "nd" || lower === "absent" || lower === "trace" || lower === "nill") {
    return 0;
  }
  if (lower.startsWith("<")) {
    const num = parseFloat(str.replace(/<|\s/g, "").replace(/,/g, "."));
    return isFinite(num) ? num / 2 : 0;
  }
  if (lower.startsWith(">")) {
    const num = parseFloat(str.replace(/>|\s/g, "").replace(/,/g, "."));
    return isFinite(num) ? num : NaN;
  }
  const clean = str.replace(/,/g, ".");
  const m = clean.match(/[-+]?\d*\.?\d+/);
  if (m) {
    const n = parseFloat(m[0]);
    return isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * Score-based coordinate column detector that inspects both column names and sample row contents
 */
export function findCoordinateColumns(columns: string[], sampleRows: any[] = []): { lat: string; lon: string } {
  if (!columns || columns.length === 0) return { lat: "", lon: "" };

  const sample = sampleRows.slice(0, 50);

  let bestLat = "";
  let bestLatScore = -1;
  let bestLon = "";
  let bestLonScore = -1;

  for (const col of columns) {
    const colLower = col.toLowerCase().trim();

    if (
      /name|id|code|date|time|remark|comment|site|state|district|block|village|source|type|depth/i.test(colLower) &&
      !/lat|lon|coord|gps/i.test(colLower)
    ) {
      continue;
    }

    let latNameScore = 0;
    let lonNameScore = 0;

    if (/^(lat|latitude|lat_dd|latitude_dd|latitude\(dd\)|lat\(dd\)|gps_lat|y|northing|y_coord|y_coordinate)$/i.test(colLower)) {
      latNameScore += 100;
    } else if (/\blat(itude)?\b/i.test(colLower) || colLower.startsWith("lat")) {
      latNameScore += 65;
    }

    if (/^(lon|long|longitude|lon_dd|long_dd|longitude_dd|longitude\(dd\)|long\(dd\)|gps_lon|gps_long|x|easting|x_coord|x_coordinate)$/i.test(colLower)) {
      lonNameScore += 100;
    } else if (/\blong?(itude)?\b/i.test(colLower) || colLower.startsWith("lon") || colLower.startsWith("lng")) {
      lonNameScore += 65;
    }

    let validLatCount = 0;
    let validLonCount = 0;
    let validIndiaLatCount = 0;
    let validIndiaLonCount = 0;

    if (sample.length > 0) {
      for (const row of sample) {
        const p = parseCoord(row[col]);
        if (!isNaN(p)) {
          if (p >= -90 && p <= 90) validLatCount++;
          if (p >= 6 && p <= 38) validIndiaLatCount++;
          if (p >= -180 && p <= 180) validLonCount++;
          if (p >= 68 && p <= 98) validIndiaLonCount++;
        }
      }
    }

    const n = sample.length || 1;
    const latScore = latNameScore * 2 + (validLatCount / n) * 40 + (validIndiaLatCount / n) * 50;
    const lonScore = lonNameScore * 2 + (validLonCount / n) * 40 + (validIndiaLonCount / n) * 50;

    if (latScore > bestLatScore && latScore > 40) {
      bestLatScore = latScore;
      bestLat = col;
    }
    if (lonScore > bestLonScore && lonScore > 40) {
      bestLonScore = lonScore;
      bestLon = col;
    }
  }

  if (bestLat && bestLon && bestLat === bestLon) {
    if (bestLatScore >= bestLonScore) {
      bestLon = "";
    } else {
      bestLat = "";
    }
  }

  return { lat: bestLat, lon: bestLon };
}

/**
 * Intelligent parameter column matcher
 */
export function findParamColumn(
  paramKey: string,
  columns: string[],
  parentHeaderMap?: Record<string, string>
): string {
  if (!columns || columns.length === 0) return "";

  if (parentHeaderMap && parentHeaderMap[paramKey] && columns.includes(parentHeaderMap[paramKey])) {
    return parentHeaderMap[paramKey];
  }

  const config = SECTOR_PARAM_CONFIG[paramKey];
  const pLower = paramKey.toLowerCase().trim();

  const exact = columns.find((c) => c.toLowerCase().trim() === pLower);
  if (exact) return exact;

  const startsWith = columns.find((c) => {
    const cl = c.toLowerCase().trim();
    return (
      cl.startsWith(pLower + " ") ||
      cl.startsWith(pLower + "_") ||
      cl.startsWith(pLower + "(") ||
      cl.startsWith(pLower + "/") ||
      cl.startsWith(pLower + "-")
    );
  });
  if (startsWith) return startsWith;

  if (config?.keywords) {
    for (const kw of config.keywords) {
      const kwLower = kw.toLowerCase().trim();
      const match = columns.find((c) => {
        const cl = c.toLowerCase().trim();
        if (cl === kwLower) return true;
        if (cl.startsWith(kwLower + " ") || cl.startsWith(kwLower + "_") || cl.startsWith(kwLower + "(")) return true;
        return cl.includes(kwLower);
      });
      if (match) return match;
    }
  }

  const wordRegex = new RegExp(`(^|[^a-zA-Z0-9])${pLower}([^a-zA-Z0-9]|$)`, "i");
  const wordMatch = columns.find((c) => wordRegex.test(c));
  if (wordMatch) return wordMatch;

  return "";
}

/**
 * Fast direct polygon geometry generation for radial rings and annular sectors.
 */
export function createAnnularSector(
  centerPt: any,
  innerRadiusKm: number,
  outerRadiusKm: number,
  startBearingDeg: number,
  endBearingDeg: number,
  numSteps: number = 24
): any {
  try {
    if (!centerPt || !centerPt.geometry || !Array.isArray(centerPt.geometry.coordinates)) {
      return null;
    }
    const centerCoords = centerPt.geometry.coordinates as [number, number];
    if (isNaN(centerCoords[0]) || isNaN(centerCoords[1])) return null;
    return createAnnularSectorPolygon(
      centerCoords[0],
      centerCoords[1],
      innerRadiusKm,
      outerRadiusKm,
      startBearingDeg,
      endBearingDeg,
      numSteps
    );
  } catch (err) {
    console.warn("createAnnularSector error:", err);
    return null;
  }
}

export interface BoundaryFeatureItem {
  poly: any;
  name: string;
  bbox: [number, number, number, number];
  isSelected: boolean;
  color: string;
}

export interface BoundaryLayerItem {
  id: string;
  name: string;
  geojson: any;
  bbox: [number, number, number, number];
  features: BoundaryFeatureItem[];
  isVisible: boolean;
  isFilter: boolean;
  color: string;
  isExpanded: boolean;
  mapLayer: L.GeoJSON | null;
}

export interface SectorAnalysisData {
  id: string;
  ring: string;
  angle: string;
  area: number;
  points: any[];
  avg: number;
  min: number;
  max: number;
  stdDev?: number;
  exceedanceCount?: number;
  exceedanceRate?: number;
  count: number;
  unit: string;
}

interface SectorAnalysisViewProps {
  rawData: any[];
  allRawData?: any[];
  filteredRawData?: any[];
  setRawData?: (data: any[]) => void;
  headers?: DataHeaders;
  setHeaders?: React.Dispatch<React.SetStateAction<DataHeaders>>;
  headerMap?: Record<string, string>;
  setHeaderMap?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  selectedState?: string;
  selectedDistrict?: string;
  selectedYear?: string;
  selectedSeason?: string;
  sharedLayers?: ShapefileLayer[];
  setSharedLayers?: React.Dispatch<React.SetStateAction<ShapefileLayer[]>>;
  isVisible: boolean;
  showToast?: (msg: string, type?: "success" | "warning" | "error") => void;
}

const LAYER_COLORS = ["#4f46e5", "#0284c7", "#059669", "#d97706", "#7c3aed", "#0891b2"];

export default function SectorAnalysisView({
  rawData: initialRawData = [],
  allRawData = [],
  filteredRawData = [],
  setRawData: setParentRawData,
  headers: initialHeaders,
  setHeaders: setParentHeaders,
  headerMap: initialHeaderMap,
  selectedState = "",
  selectedDistrict = "",
  selectedYear = "",
  selectedSeason = "",
  sharedLayers = [],
  setSharedLayers,
  isVisible,
  showToast
}: SectorAnalysisViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const basemapLayerRef = useRef<L.Layer | null>(null);
  const basemapPrimaryTileRef = useRef<L.TileLayer | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const wellCanvasLayerRef = useRef<FastWellCanvasLayer | null>(null);
  const wellTooltipRef = useRef<L.Tooltip | null>(null);
  const pendingBoundsRef = useRef<[[number, number], [number, number]] | null>(null);
  const cursorTextRef = useRef<HTMLSpanElement | null>(null);
  const hoveredSectorIdRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState<number>(0);
  const layersRef = useRef<{
    polys: L.LayerGroup;
    labels: L.LayerGroup;
    centerMarker: L.LayerGroup;
  }>({
    polys: L.layerGroup(),
    labels: L.layerGroup(),
    centerMarker: L.layerGroup()
  });

  const [basemapId, setBasemapId] = useState<
    "osm" | "esriTopo" | "googleStreets" | "googleHybrid" | "carto" | "esriPhysical" | "esriTerrain" | "esriSatellite"
  >("esriTopo");

  // Lookup refs for interactive map highlight/focus
  const sectorLayerIndexRef = useRef<Map<string, { layer: L.GeoJSON; sector: ComputedSectorItem }>>(new Map());
  const plateRafRef = useRef<number | null>(null);

  // Parent Dataset reference
  const parentDataset = useMemo(() => {
    if (filteredRawData && filteredRawData.length > 0) return filteredRawData;
    if (initialRawData && initialRawData.length > 0) return initialRawData;
    if (allRawData && allRawData.length > 0) return allRawData;
    return [];
  }, [filteredRawData, initialRawData, allRawData]);

  const [isLocalUpload, setIsLocalUpload] = useState<boolean>(false);
  const [localData, setLocalData] = useState<any[]>(parentDataset);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  useEffect(() => {
    if (!isLocalUpload && parentDataset.length > 0) {
      setLocalData(parentDataset);
    }
  }, [parentDataset, isLocalUpload]);

  const availableColumns = useMemo(() => {
    if (localData.length === 0) return [];
    const keys = new Set<string>();
    const sampleLen = Math.min(localData.length, 50);
    for (let i = 0; i < sampleLen; i++) {
      Object.keys(localData[i]).forEach((k) => keys.add(k));
    }
    return Array.from(keys).sort();
  }, [localData]);

  const [columnMap, setColumnMap] = useState<{
    lat: string;
    lon: string;
    params: Record<string, string>;
  }>({
    lat: "",
    lon: "",
    params: {}
  });

  const [activeParam, setActiveParam] = useState<string>("pH");

  // Defer initial 25k+ row coordinate parsing until Sector Analysis tab is actually visited
  const [hasActivated, setHasActivated] = useState<boolean>(isVisible);
  useEffect(() => {
    if (isVisible && !hasActivated) setHasActivated(true);
  }, [isVisible, hasActivated]);

  // Pre-parsed lightweight row index: avoids cloning 30+ Excel columns across 25,000+ rows
  const memoizedPoints = useMemo(() => {
    if (!hasActivated || localData.length === 0 || !columnMap.lat || !columnMap.lon) return [];
    const latKey = columnMap.lat;
    const lonKey = columnMap.lon;
    const valKey = columnMap.params[activeParam];

    const out = new Array(localData.length);
    for (let index = 0; index < localData.length; index++) {
      const d = localData[index];
      const lat = parseCoord(d[latKey]);
      const lon = parseCoord(d[lonKey]);
      const val = valKey ? parseWaterValue(d[valKey]) : NaN;
      const isValidGeo =
        isFinite(lat) &&
        isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180 &&
        !(Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001);
      out[index] = {
        _raw: d,
        _index: index,
        _lat: lat,
        _lon: lon,
        _val: val,
        _hasCoords: isValidGeo
      };
    }
    return out;
  }, [hasActivated, localData, columnMap.lat, columnMap.lon, columnMap.params, activeParam]);

  // Spatial Analysis Configuration (Radial | Grid)
  const [analysisMode, setAnalysisMode] = useState<"sector" | "grid">("sector");
  const [gridCellWidthKm, setGridCellWidthKm] = useState<number>(2.0);
  const [gridCellHeightKm, setGridCellHeightKm] = useState<number>(2.0);
  const [gridScope, setGridScope] = useState<"data_bounds" | "origin_extent">("data_bounds");
  const [radii, setRadii] = useState<number[]>([5, 10]);
  const [newRingInput, setNewRingInput] = useState<string>("");
  const [sectorAngle, setSectorAngle] = useState<number>(45);

  // Toggles & Collision-free Plate Options
  const [hideEmptySectors, setHideEmptySectors] = useState<boolean>(false);
  const [hideMissingData, setHideMissingData] = useState<boolean>(true);
  const [clipToBoundary, setClipToBoundary] = useState<boolean>(true);
  const [autoRestrictOrigin, setAutoRestrictOrigin] = useState<boolean>(true);
  const [autoDeoverlapPlates, setAutoDeoverlapPlates] = useState<boolean>(true);

  const [showLabelId, setShowLabelId] = useState<boolean>(true);
  const [showLabelAvg, setShowLabelAvg] = useState<boolean>(true);
  const [showLabelCount, setShowLabelCount] = useState<boolean>(true);
  const [showLabelArea, setShowLabelArea] = useState<boolean>(false);

  const [showLabelFormatPanel, setShowLabelFormatPanel] = useState<boolean>(false);
  const [labelFormat, setLabelFormat] = useState({
    id: { color: "#312e81", size: 9 },
    avg: { color: "#0f172a", size: 10 },
    count: { color: "#334155", size: 9 },
    area: { color: "#64748b", size: 8 },
    sector: { borderColor: "#ffffff", weight: 1.5, matchFill: false }
  });

  const [customRanges, setCustomRanges] = useState<CustomTierRange[]>([
    { min: 0, max: 6.5, label: "Desirable", color: "#10b981", unit: "", visible: true },
    { min: 6.5, max: 8.5, label: "Permissible", color: "#fbbf24", unit: "", visible: true },
    { min: 8.5, max: 100000, label: "Unsuitable", color: "#ef4444", unit: "", visible: true }
  ]);

  const [centerPoint, setCenterPoint] = useState<[number, number] | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  const [shapefileLayers, setShapefileLayers] = useState<BoundaryLayerItem[]>([]);
  const colorIndexRef = useRef(0);

  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [filterMeta, setFilterMeta] = useState<{ label: string; actualKey: string }[]>([]);
  const [filterSearchTerms, setFilterSearchTerms] = useState<Record<string, string>>({});

  // UI Console State
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [sidebarTab, setSidebarTab] = useState<"steps" | "filters" | "stats">("steps");
  const [legendCollapsed, setLegendCollapsed] = useState<boolean>(false);

  // Analytics Search, Sort & Selection
  const [sectorSearch, setSectorSearch] = useState<string>("");
  const [sectorSortBy, setSectorSortBy] = useState<"avg_desc" | "count_desc" | "exceed_desc" | "area_desc" | "id_asc">("avg_desc");
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);

  // Live Probe HUD State (cursor coordinates update directly via ref to avoid 60fps React re-renders)
  const [hoveredSector, setHoveredSector] = useState<{ id: string; avg: number; count: number; unit: string } | null>(null);
  const [plateTelemetry, setPlateTelemetry] = useState<{ visible: number; total: number; suppressed: number }>({
    visible: 0,
    total: 0,
    suppressed: 0
  });

  // Deferred spatial parameters keep sliders & quick-toggle clicks responsive under 25k+ wells
  const deferredRadii = useDeferredValue(radii);
  const deferredSectorAngle = useDeferredValue(sectorAngle);
  const deferredGridW = useDeferredValue(gridCellWidthKm);
  const deferredGridH = useDeferredValue(gridCellHeightKm);

  // Refs for O(1) hover tooltip formatting & O(1) sector selection highlighting (zero full redraws)
  const selectedSectorIdRef = useRef<string | null>(null);
  const prevSelectedSectorIdRef = useRef<string | null>(null);
  const tooltipMetaRef = useRef<{
    activeParam: string;
    valKey: string;
    customRanges: CustomTierRange[];
  }>({ activeParam, valKey: "", customRanges });
  tooltipMetaRef.current = {
    activeParam,
    valKey: columnMap.params[activeParam] || "",
    customRanges
  };

  // Auto-detect columns
  useEffect(() => {
    if (availableColumns.length === 0) return;

    const detectedCoords = findCoordinateColumns(availableColumns, localData);
    let detectedLat = detectedCoords.lat;
    let detectedLon = detectedCoords.lon;

    if (!detectedLat && initialHeaders?.latitude && availableColumns.includes(initialHeaders.latitude)) {
      detectedLat = initialHeaders.latitude;
    }
    if (!detectedLon && initialHeaders?.longitude && availableColumns.includes(initialHeaders.longitude)) {
      detectedLon = initialHeaders.longitude;
    }

    const paramMap: Record<string, string> = {};
    Object.keys(SECTOR_PARAM_CONFIG).forEach((pKey) => {
      paramMap[pKey] = findParamColumn(pKey, availableColumns, initialHeaderMap);
    });

    setColumnMap({ lat: detectedLat, lon: detectedLon, params: paramMap });

    const targetKeys = ["State", "District", "Block", "Source", "Season", "Year"];
    const metas = targetKeys
      .map((key) => {
        const actualKey = availableColumns.find(
          (k) =>
            k.toLowerCase() === key.toLowerCase() ||
            (k.toLowerCase().includes(key.toLowerCase()) && !k.toLowerCase().includes("date"))
        );
        return { label: key, actualKey: actualKey || "" };
      })
      .filter((f) => f.actualKey !== "");
    setFilterMeta(metas);
  }, [availableColumns, localData, initialHeaders, initialHeaderMap]);

  const syncLimits = useCallback(() => {
    const config = SECTOR_PARAM_CONFIG[activeParam] || { b1: 500, b2: 2000, unit: "mg/L" };
    setCustomRanges([
      { min: 0, max: config.b1, label: "Desirable", color: "#10b981", unit: config.unit, visible: true },
      { min: config.b1, max: config.b2, label: "Permissible", color: "#fbbf24", unit: config.unit, visible: true },
      { min: config.b2, max: 100000, label: "Unsuitable", color: "#ef4444", unit: config.unit, visible: true }
    ]);
  }, [activeParam]);

  useEffect(() => {
    syncLimits();
  }, [syncLimits]);

  const getRangeMatch = useCallback((val: number) => matchTierRange(val, customRanges), [customRanges]);

  const getFeatureName = (feature: any, index: number) => {
    if (!feature.properties) return `Feature ${index}`;
    const keys = Object.keys(feature.properties);
    let nameKey = keys.find((k) => /^(name|nam|dist|district|block|state|mandal|tehsil|aq|aquifer)$/i.test(k.trim()));
    if (!nameKey) nameKey = keys.find((k) => /name/i.test(k.trim()));
    if (!nameKey) nameKey = keys.find((k) => typeof feature.properties[k] === "string" && feature.properties[k].length < 50);
    if (nameKey && feature.properties[nameKey]) return String(feature.properties[nameKey]).trim();
    return `Feature ${index}`;
  };

  useEffect(() => {
    if (!sharedLayers || sharedLayers.length === 0) return;
    setShapefileLayers((prev) => {
      const existingIds = new Set(prev.map((l) => l.id));
      const newlyAdded: BoundaryLayerItem[] = [];
      sharedLayers.forEach((shLayer) => {
        const layerId = shLayer.id || "shared_" + shLayer.name;
        if (existingIds.has(layerId) || !shLayer.geoJson) return;
        try {
          const color = shLayer.strokeColor || LAYER_COLORS[colorIndexRef.current % LAYER_COLORS.length];
          colorIndexRef.current++;
          const bbox = turf.bbox(shLayer.geoJson) as [number, number, number, number];
          const features: BoundaryFeatureItem[] = [];
          let fIndex = 0;
          turf.flattenEach(shLayer.geoJson, (currentFeature: any) => {
            if (
              currentFeature.geometry &&
              (currentFeature.geometry.type === "Polygon" || currentFeature.geometry.type === "MultiPolygon")
            ) {
              const fBox = turf.bbox(currentFeature) as [number, number, number, number];
              features.push({
                poly: currentFeature,
                name: getFeatureName(currentFeature, ++fIndex),
                bbox: fBox,
                isSelected: true,
                color
              });
            }
          });
          features.sort((a, b) => String(a.name).localeCompare(String(b.name)));
          newlyAdded.push({
            id: layerId,
            name: shLayer.name || "Boundary Layer",
            geojson: shLayer.geoJson,
            bbox,
            features,
            isVisible: shLayer.visible !== false,
            isFilter: true,
            color,
            isExpanded: false,
            mapLayer: null
          });
        } catch (e) {
          console.warn("Error converting shared layer to sector boundary", e);
        }
      });
      return newlyAdded.length > 0 ? [...prev, ...newlyAdded] : prev;
    });
  }, [sharedLayers]);

  // Lazily initialize Leaflet Map ONLY once the tab is actually visible (never while display:none 0x0)
  useEffect(() => {
    if (!isVisible || !mapContainerRef.current || mapRef.current) return;
    const container = mapContainerRef.current;
    if ((container as any)._leaflet_id) {
      delete (container as any)._leaflet_id;
    }
    container.innerHTML = "";

    const canvasRenderer = L.canvas({ padding: 0.1 });
    canvasRendererRef.current = canvasRenderer;

    const map = L.map(container, {
      preferCanvas: true,
      renderer: canvasRenderer,
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: false,
      minZoom: 2,
      maxZoom: 18
    }).setView([22.5, 82.5], 5);

    L.control.zoom({ position: "topright" }).addTo(map);

    // Always instantiate fresh layer groups bound to this Leaflet map instance
    layersRef.current = {
      polys: L.layerGroup().addTo(map),
      labels: L.layerGroup().addTo(map),
      centerMarker: L.layerGroup().addTo(map)
    };

    const sharedTooltip = L.tooltip({ direction: "top", offset: [0, -6], opacity: 0.96 });
    wellTooltipRef.current = sharedTooltip;

    const fastWells = new FastWellCanvasLayer({
      radius: 3.2,
      opacity: 0.86,
      strokeThreshold: 1800,
      onHoverDot: (dot, latlng) => {
        if (!dot || !latlng) {
          map.closeTooltip(sharedTooltip);
          return;
        }
        // Build tooltip HTML lazily for ONLY the single hovered well (zero 25k upfront string allocations)
        const meta = tooltipMetaRef.current;
        const rangeMatch = meta.valKey && !isNaN(dot.val) ? matchTierRange(dot.val, meta.customRanges) : undefined;
        let html = `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;line-height:1.4;">`;
        html += `<b>Sample #${dot.rowIndex + 1}</b><br/>Lat: ${dot.lat.toFixed(4)}, Lon: ${dot.lon.toFixed(4)}`;
        if (meta.valKey && !isNaN(dot.val)) {
          html += `<br/><b>${meta.activeParam}:</b> ${dot.val}${rangeMatch?.unit ? " " + rangeMatch.unit : ""}${rangeMatch ? ` (${rangeMatch.label})` : ""}`;
        } else if (meta.valKey) {
          html += `<br/><b>${meta.activeParam}:</b> Missing / NaN`;
        }
        html += `</div>`;
        sharedTooltip.setLatLng(latlng).setContent(html).openOn(map);
      }
    });
    fastWells.addTo(map);
    wellCanvasLayerRef.current = fastWells;

    // Ensure initial viewport measurement settles immediately on first frame
    requestAnimationFrame(() => {
      if (mapRef.current === map) {
        map.invalidateSize({ animate: false });
      }
    });

    // Direct DOM update on mousemove -> ZERO React re-renders while moving mouse over map
    map.on("mousemove", (ev: L.LeafletMouseEvent) => {
      if (cursorTextRef.current) {
        cursorTextRef.current.textContent = `${ev.latlng.lat.toFixed(4)}°, ${ev.latlng.lng.toFixed(4)}°`;
      }
    });
    map.on("mouseout", () => {
      if (cursorTextRef.current) {
        cursorTextRef.current.textContent = "Move cursor over map";
      }
    });

    mapRef.current = map;

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0 && mapRef.current) {
          mapRef.current.invalidateSize({ animate: false });
          if (pendingBoundsRef.current) {
            const bounds = L.latLngBounds(pendingBoundsRef.current);
            pendingBoundsRef.current = null;
            if (bounds.isValid()) {
              const span =
                Math.abs(bounds.getNorth() - bounds.getSouth()) + Math.abs(bounds.getEast() - bounds.getWest());
              if (span < 0.0005) {
                mapRef.current.setView(bounds.getCenter(), 11);
              } else {
                mapRef.current.fitBounds(bounds, { padding: [45, 45], maxZoom: 13 });
              }
            }
          }
          fastWells.scheduleDraw();
        }
      });
      ro.observe(container);
      resizeObserverRef.current = ro;
    }

    setMapReady((v) => v + 1);
  }, [isVisible]);

  // Clean up Leaflet instance only when component unmounts
  useEffect(() => {
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (plateRafRef.current !== null) cancelAnimationFrame(plateRafRef.current);
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // ignore cleanup error
        }
      }
      mapRef.current = null;
      basemapLayerRef.current = null;
      basemapPrimaryTileRef.current = null;
      wellCanvasLayerRef.current = null;
      wellTooltipRef.current = null;
      canvasRendererRef.current = null;
    };
  }, []);

  // Explicit Basemap Management with clean teardown and universal multi-provider fallback
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapReady === 0) return;

    let cancelled = false;

    if (basemapLayerRef.current) {
      try {
        map.removeLayer(basemapLayerRef.current);
      } catch {
        // ignore removal error
      }
      basemapLayerRef.current = null;
      basemapPrimaryTileRef.current = null;
    }

    const commonTileOpts: L.TileLayerOptions = {
      pane: "tilePane",
      zIndex: 1,
      keepBuffer: 4,
      updateWhenIdle: false,
      updateWhenZooming: false
    };

    const createBasemapLayer = (
      id:
        | "osm"
        | "esriTopo"
        | "googleStreets"
        | "googleHybrid"
        | "carto"
        | "esriPhysical"
        | "esriTerrain"
        | "esriSatellite"
    ): { layer: L.Layer; primaryTile: L.TileLayer } => {
      if (id === "googleStreets") {
        const tl = L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
          ...commonTileOpts,
          subdomains: ["mt0", "mt1", "mt2", "mt3"],
          maxZoom: 19
        });
        return { layer: tl, primaryTile: tl };
      }
      if (id === "googleHybrid") {
        const tl = L.tileLayer("https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
          ...commonTileOpts,
          subdomains: ["mt0", "mt1", "mt2", "mt3"],
          maxZoom: 19
        });
        return { layer: tl, primaryTile: tl };
      }
      if (id === "carto") {
        const tl = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          ...commonTileOpts,
          subdomains: ["a", "b", "c", "d"],
          maxZoom: 19
        });
        return { layer: tl, primaryTile: tl };
      }
      if (id === "esriPhysical") {
        const tl = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
          { ...commonTileOpts, maxNativeZoom: 8, maxZoom: 18 }
        );
        return { layer: tl, primaryTile: tl };
      }
      if (id === "esriTerrain") {
        const base = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
          { ...commonTileOpts, maxNativeZoom: 13, maxZoom: 18 }
        );
        const ref = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}",
          { ...commonTileOpts, zIndex: 2, maxNativeZoom: 13, maxZoom: 18 }
        );
        return { layer: L.layerGroup([base, ref]), primaryTile: base };
      }
      if (id === "esriSatellite") {
        const tl = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { ...commonTileOpts, maxNativeZoom: 18, maxZoom: 18 }
        );
        return { layer: tl, primaryTile: tl };
      }
      if (id === "esriTopo") {
        const tl = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
          { ...commonTileOpts, maxNativeZoom: 18, maxZoom: 18 }
        );
        return { layer: tl, primaryTile: tl };
      }
      const tl = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        ...commonTileOpts,
        subdomains: ["a", "b", "c"],
        maxZoom: 19
      });
      return { layer: tl, primaryTile: tl };
    };

    const { layer, primaryTile } = createBasemapLayer(basemapId);
    let loadedTiles = 0;
    let errorTiles = 0;

    primaryTile.on("tileload", () => {
      loadedTiles++;
    });
    primaryTile.on("tileerror", () => {
      if (cancelled) return;
      errorTiles++;
      if (errorTiles >= 4 && loadedTiles === 0) {
        if (basemapId === "esriTopo") setBasemapId("carto");
        else if (basemapId === "carto") setBasemapId("googleStreets");
        else if (basemapId === "googleStreets") setBasemapId("osm");
        else if (basemapId !== "osm") setBasemapId("esriTopo");
      }
    });

    layer.addTo(map);
    if ("bringToBack" in layer && typeof (layer as L.TileLayer).bringToBack === "function") {
      (layer as L.TileLayer).bringToBack();
    }
    basemapLayerRef.current = layer;
    basemapPrimaryTileRef.current = primaryTile;

    map.invalidateSize({ animate: false });

    return () => {
      cancelled = true;
      primaryTile.off("tileload");
      primaryTile.off("tileerror");
      if (mapRef.current && basemapLayerRef.current === layer) {
        try {
          mapRef.current.removeLayer(layer);
        } catch {
          // ignore cleanup error
        }
        basemapLayerRef.current = null;
        basemapPrimaryTileRef.current = null;
      }
    };
  }, [basemapId, mapReady]);

  // Re-measure map & apply deferred fitBounds when tab becomes visible, sidebar toggles, or mode changes
  // Note: never call tileLayer.redraw() here — invalidateSize() fetches newly exposed tiles without aborting in-flight loads
  useEffect(() => {
    if (!isVisible || !mapRef.current || mapReady === 0) return;
    const syncViewport = () => {
      const map = mapRef.current;
      const container = mapContainerRef.current;
      if (!map || !container || container.clientWidth === 0 || container.clientHeight === 0) return;
      map.invalidateSize({ animate: false });
      if (pendingBoundsRef.current) {
        const bounds = L.latLngBounds(pendingBoundsRef.current);
        pendingBoundsRef.current = null;
        if (bounds.isValid()) {
          const span =
            Math.abs(bounds.getNorth() - bounds.getSouth()) + Math.abs(bounds.getEast() - bounds.getWest());
          if (span < 0.0005) {
            map.setView(bounds.getCenter(), 11);
          } else {
            map.fitBounds(bounds, { padding: [45, 45], maxZoom: 13 });
          }
        }
      }
      wellCanvasLayerRef.current?.scheduleDraw();
      schedulePlateRefresh();
    };
    const t1 = setTimeout(syncViewport, 60);
    const t2 = setTimeout(syncViewport, 280);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isVisible, sidebarCollapsed, analysisMode, mapReady]);

  // Apply crosshair cursor directly via style (never toggle className on mapContainerRef,
  // because React reassigning className wipes Leaflet's .leaflet-container DOM class!)
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    container.style.cursor = isDrawing ? "crosshair" : "";
  }, [isDrawing, mapReady]);

  // Center marker update (shown in Radial mode or Grid Origin-Extent mode)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layersRef.current.centerMarker.clearLayers();
    const showOrigin =
      Boolean(centerPoint) &&
      (analysisMode === "sector" || (analysisMode === "grid" && gridScope === "origin_extent"));
    if (showOrigin && centerPoint) {
      const [lng, lat] = centerPoint;
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:24px;height:24px;background:#4f46e5;border:3px solid #ffffff;border-radius:9999px;box-shadow:0 0 12px rgba(79,70,229,0.75);animation:pulseMarker 1.8s infinite;"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      L.marker([lat, lng], { icon }).addTo(layersRef.current.centerMarker);
    }
  }, [centerPoint, analysisMode, gridScope, mapReady]);

  // Boundary layers redraw
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const renderer = canvasRendererRef.current || undefined;

    shapefileLayers.forEach((layer) => {
      if (layer.mapLayer) map.removeLayer(layer.mapLayer);
      const activePolys = layer.features
        .filter((f) => f.isSelected)
        .map((f) => {
          if (!f.poly.properties) f.poly.properties = {};
          f.poly.properties._renderColor = f.color;
          return f.poly;
        });

      if (activePolys.length > 0) {
        const geoLayer = L.geoJSON(turf.featureCollection(activePolys), {
          style: (feature) => ({
            renderer,
            color: feature?.properties?._renderColor || layer.color,
            weight: 2,
            fillOpacity: 0.06,
            dashArray: "5, 5"
          }),
          interactive: false
        });
        layer.mapLayer = geoLayer;
        if (layer.isVisible) geoLayer.addTo(map);
      } else {
        layer.mapLayer = null;
      }
    });
  }, [shapefileLayers, mapReady]);

  // Fast attribute & spatial boundary filter using zero-allocation fastPointInFeature
  const currentFilteredData = useMemo(() => {
    if (memoizedPoints.length === 0) return [];
    const activeFilters = shapefileLayers.filter((l) => l.isFilter);
    const filterEntries = Object.entries(filters).filter(([_, vSet]) => vSet.size > 0);

    const checkState = !isLocalUpload && selectedState && !isStateAllFilter(selectedState);
    const selStateNorm = checkState ? normFilterVal(selectedState) : "";
    const stateKey = initialHeaders?.state || "";

    const checkDistrict = !isLocalUpload && selectedDistrict && !isDistrictAllFilter(selectedDistrict);
    const selDistNorm = checkDistrict ? normFilterVal(selectedDistrict) : "";
    const distKey = initialHeaders?.district || "";

    const checkYear = !isLocalUpload && selectedYear && !isYearAllFilter(selectedYear);
    const selYearLower = checkYear ? selectedYear.toLowerCase().trim() : "";
    const yearKey = initialHeaders?.year || "";

    const checkSeason = !isLocalUpload && selectedSeason && !isSeasonAllFilter(selectedSeason);
    const selSeasonLower = checkSeason ? selectedSeason.toLowerCase().trim() : "";
    const seasonKey = initialHeaders?.season || "";

    const precomputedLayerFeatures = activeFilters.map((fl) => ({
      bbox: fl.bbox,
      features: fl.features.filter((f) => f.isSelected)
    }));

    return memoizedPoints.filter((d) => {
      const raw = d._raw || d;
      if (checkState) {
        const val = String(raw[stateKey] || raw["State"] || raw["state"] || raw["STATE"] || raw["State_Name"] || raw["State/UT"] || "").trim();
        const vNorm = normFilterVal(val);
        if (!vNorm || (!vNorm.includes(selStateNorm) && !selStateNorm.includes(vNorm))) return false;
      }
      if (checkDistrict) {
        const val = String(raw[distKey] || raw["District"] || raw["district"] || raw["DISTRICT"] || raw["Dist"] || "").trim();
        const vNorm = normFilterVal(val);
        if (!vNorm || (!vNorm.includes(selDistNorm) && !selDistNorm.includes(vNorm))) return false;
      }
      if (checkYear) {
        const yrVal = String(raw[yearKey] || raw["Year"] || raw["year"] || raw["YEAR"] || "").toLowerCase().trim();
        if (!yrVal || !yrVal.includes(selYearLower)) return false;
      }
      if (checkSeason) {
        const rowSeason = String(raw[seasonKey] || raw["Season"] || raw["season"] || raw["SEASON"] || "").toLowerCase().trim();
        if (selSeasonLower.includes("pre")) {
          if (!rowSeason.includes("pre") && !rowSeason.includes("before") && !rowSeason.includes("may")) return false;
        } else if (selSeasonLower.includes("post")) {
          if (!rowSeason.includes("post") && !rowSeason.includes("after") && !rowSeason.includes("nov")) return false;
        } else if (rowSeason !== selSeasonLower && !rowSeason.includes(selSeasonLower)) {
          return false;
        }
      }

      if (filterEntries.length > 0) {
        if (!filterEntries.every(([k, vSet]) => vSet.has(String(raw[k] || "")))) return false;
      }

      if (precomputedLayerFeatures.length > 0 && d._hasCoords) {
        const lat = d._lat;
        const lon = d._lon;
        for (let f = 0; f < precomputedLayerFeatures.length; f++) {
          const fl = precomputedLayerFeatures[f];
          if (fl.features.length === 0) return false;
          if (lon < fl.bbox[0] || lon > fl.bbox[2] || lat < fl.bbox[1] || lat > fl.bbox[3]) return false;
          let inside = false;
          for (let i = 0; i < fl.features.length; i++) {
            const feat = fl.features[i];
            if (fastPointInFeature(lon, lat, feat.poly, feat.bbox)) {
              inside = true;
              break;
            }
          }
          if (!inside) return false;
        }
      }
      return true;
    });
  }, [memoizedPoints, filters, shapefileLayers, isLocalUpload, selectedState, selectedDistrict, selectedYear, selectedSeason, initialHeaders]);

  const lastFilterSigRef = useRef<string>("");

  useEffect(() => {
    if (currentFilteredData.length === 0 || !columnMap.lat || !columnMap.lon) return;
    const filterSig = `${selectedState}|${selectedDistrict}|${selectedYear}|${selectedSeason}|${isLocalUpload ? "local" : "parent"}|${currentFilteredData.length}`;
    const filterChanged = lastFilterSigRef.current !== filterSig;

    if (filterChanged || !centerPoint) {
      lastFilterSigRef.current = filterSig;
      let sumLat = 0;
      let sumLon = 0;
      let count = 0;
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLon = Infinity;
      let maxLon = -Infinity;
      for (let i = 0; i < currentFilteredData.length; i++) {
        const d = currentFilteredData[i];
        if (d._hasCoords) {
          sumLat += d._lat;
          sumLon += d._lon;
          count++;
          if (d._lat < minLat) minLat = d._lat;
          if (d._lat > maxLat) maxLat = d._lat;
          if (d._lon < minLon) minLon = d._lon;
          if (d._lon > maxLon) maxLon = d._lon;
        }
      }
      if (count > 0) {
        const avgLat = sumLat / count;
        const avgLon = sumLon / count;
        setCenterPoint([avgLon, avgLat]);
        const targetBounds: [[number, number], [number, number]] = [
          [minLat, minLon],
          [maxLat, maxLon]
        ];
        const container = mapContainerRef.current;
        const span = Math.abs(maxLat - minLat) + Math.abs(maxLon - minLon);
        if (mapRef.current && mapReady > 0 && isVisible && container && container.clientWidth > 0 && container.clientHeight > 0) {
          if (count > 1 && span >= 0.0005) {
            mapRef.current.fitBounds(targetBounds, { padding: [45, 45], maxZoom: 13 });
          } else {
            mapRef.current.setView([avgLat, avgLon], 11);
          }
          pendingBoundsRef.current = null;
        } else {
          pendingBoundsRef.current = targetBounds;
        }
      }
    }
  }, [currentFilteredData, columnMap.lat, columnMap.lon, centerPoint, selectedState, selectedDistrict, selectedYear, selectedSeason, isLocalUpload, isVisible, mapReady]);

  // Switch cleanly between Radial and Grid spatial modes
  const switchAnalysisMode = useCallback((nextMode: "sector" | "grid") => {
    setAnalysisMode(nextMode);
    setSelectedSectorId(null);
    setHoveredSector(null);
    mapRef.current?.closePopup();
  }, []);

  // High-speed single-canvas well rendering (zero L.circleMarker overhead & zero upfront tooltip strings)
  const plotAllPoints = useCallback(() => {
    const fastWells = wellCanvasLayerRef.current;
    if (!fastWells || !isVisible) return;
    if (currentFilteredData.length === 0) {
      fastWells.clearData();
      return;
    }

    const valKey = columnMap.params[activeParam];
    const dots: FastWellDot[] = [];

    for (let i = 0; i < currentFilteredData.length; i++) {
      const d = currentFilteredData[i];
      if (!d._hasCoords) continue;

      const val = d._val;
      let color = "#4f46e5";
      let visible = true;

      if (valKey && !isNaN(val)) {
        const rangeMatch = matchTierRange(val, customRanges);
        if (rangeMatch) {
          color = rangeMatch.color;
          visible = rangeMatch.visible !== false;
        }
      } else if (valKey) {
        if (hideMissingData) visible = false;
        else color = "#94a3b8";
      }

      if (!visible) continue;

      dots.push({
        lat: d._lat,
        lon: d._lon,
        color,
        rowIndex: d._index,
        val
      });
    }

    fastWells.setOptions({
      radius: 3.2,
      opacity: 0.86
    });
    fastWells.setData(dots);
  }, [isVisible, currentFilteredData, columnMap.params, activeParam, customRanges, hideMissingData]);

  useEffect(() => {
    plotAllPoints();
  }, [plotAllPoints, mapReady]);

  // Map click picking for Origin Center
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (isDrawing) {
        setCenterPoint([e.latlng.lng, e.latlng.lat]);
        setIsDrawing(false);
      }
    };

    map.on("click", onMapClick);
    return () => {
      map.off("click", onMapClick);
    };
  }, [isDrawing, mapReady]);

  // Pre-combined (and simplified) clip boundary memoized independently from labels/zoom
  const clipBoundaryContext = useMemo(() => {
    if (!isVisible) return { poly: null, bbox: null as [number, number, number, number] | null };
    const clipLayers = shapefileLayers.filter((l) => l.isFilter);
    if (!clipToBoundary || clipLayers.length === 0) {
      return { poly: null, bbox: null as [number, number, number, number] | null };
    }
    const activePolys: any[] = [];
    clipLayers.forEach((layer) => {
      layer.features.forEach((f) => {
        if (!f.isSelected) return;
        if (autoRestrictOrigin && centerPoint) {
          if (fastPointInFeature(centerPoint[0], centerPoint[1], f.poly, f.bbox)) {
            activePolys.push(f.poly);
          }
        } else {
          activePolys.push(f.poly);
        }
      });
    });

    if (activePolys.length === 0) return { poly: null, bbox: null as [number, number, number, number] | null };
    let combined: any = activePolys[0];
    if (activePolys.length > 1) {
      try {
        combined = turf.combine(turf.featureCollection(activePolys)).features[0] || activePolys[0];
      } catch {
        combined = activePolys[0];
      }
    }
    // Simplify heavy admin boundaries once so per-sector turf.intersect runs ~15x faster
    try {
      const simplified = turf.simplify(combined, { tolerance: 0.002, highQuality: false, mutate: false });
      if (simplified) combined = simplified;
    } catch {
      // keep unsimplified on fallback
    }
    return { poly: combined, bbox: turf.bbox(combined) as [number, number, number, number] };
  }, [isVisible, shapefileLayers, clipToBoundary, autoRestrictOrigin, centerPoint]);

  // STAGE A: Pure spatial computation (zero dependency on zoom/label formatting; deferred sliders + gated when hidden)
  const sectorComputation = useMemo(() => {
    if (!isVisible || !columnMap.lat || !columnMap.lon) {
      return computeSectorGeometryAndStats({
        points: [],
        analysisMode,
        centerPoint,
        radii: deferredRadii,
        sectorAngle: deferredSectorAngle,
        gridCellWidthKm: deferredGridW,
        gridCellHeightKm: deferredGridH,
        gridScope,
        hideEmptySectors,
        activeParam,
        customRanges
      });
    }
    return computeSectorGeometryAndStats({
      points: currentFilteredData,
      analysisMode,
      centerPoint,
      radii: deferredRadii,
      sectorAngle: deferredSectorAngle,
      gridCellWidthKm: deferredGridW,
      gridCellHeightKm: deferredGridH,
      gridScope,
      hideEmptySectors,
      activeParam,
      customRanges,
      clipBoundaryPoly: clipBoundaryContext.poly,
      clipBoundaryBBox: clipBoundaryContext.bbox,
      autoRestrictOrigin
    });
  }, [
    isVisible,
    columnMap.lat,
    columnMap.lon,
    currentFilteredData,
    analysisMode,
    centerPoint,
    deferredRadii,
    deferredSectorAngle,
    deferredGridW,
    deferredGridH,
    gridScope,
    hideEmptySectors,
    activeParam,
    customRanges,
    clipBoundaryContext,
    autoRestrictOrigin
  ]);

  const activeSectorData: SectorAnalysisData[] = sectorComputation.sectors;

  // STAGE C: Screen-space collision-free plate renderer (separated from heavy Turf computation)
  const renderCollisionFreePlates = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.labels.clearLayers();

    const sectors = sectorComputation.sectors;
    const anyLineEnabled = showLabelId || showLabelAvg || showLabelCount || showLabelArea;

    if (!anyLineEnabled || sectors.length === 0) {
      setPlateTelemetry({ visible: 0, total: sectors.length, suppressed: 0 });
      return;
    }

    const size = map.getSize();
    const vpW = size.x || 1200;
    const vpH = size.y || 720;

    // Estimate exact pixel dimensions of each plate so AABB matches DOM
    const lineHeights: number[] = [];
    if (showLabelId) lineHeights.push(Math.max(11, labelFormat.id.size + 4));
    if (showLabelAvg) lineHeights.push(Math.max(12, labelFormat.avg.size + 4));
    if (showLabelCount) lineHeights.push(Math.max(11, labelFormat.count.size + 3));
    if (showLabelArea) lineHeights.push(Math.max(10, labelFormat.area.size + 3));

    const plateH = Math.ceil(lineHeights.reduce((a, b) => a + b, 0) + 10);
    const maxFontSize = Math.max(
      showLabelId ? labelFormat.id.size : 0,
      showLabelAvg ? labelFormat.avg.size : 0,
      showLabelCount ? labelFormat.count.size : 0,
      showLabelArea ? labelFormat.area.size : 0
    );
    const plateW = Math.ceil(Math.max(76, maxFontSize * 8.6));

    // Reserve non-map HUD obstacles & markers so plates NEVER overlap controls or HUDs
    const obstacles: ScreenBox[] = [
      // Top-right Leaflet basemap & zoom controls
      { minX: Math.max(0, vpW - 116), minY: 0, maxX: vpW, maxY: 112 },
      // Bottom-left Live Probe HUD
      { minX: 0, minY: Math.max(0, vpH - 68), maxX: 360, maxY: vpH },
      // Bottom-right Legend panel
      {
        minX: Math.max(0, vpW - (legendCollapsed ? 185 : 275)),
        minY: Math.max(0, vpH - (legendCollapsed ? 52 : 185)),
        maxX: vpW,
        maxY: vpH
      }
    ];

    if (centerPoint) {
      const cp = map.latLngToContainerPoint([centerPoint[1], centerPoint[0]]);
      obstacles.push({ minX: cp.x - 16, minY: cp.y - 16, maxX: cp.x + 16, maxY: cp.y + 16 });
    }

    const candidates: LabelCandidate[] = [];
    const sectorById = new Map<string, ComputedSectorItem>();

    for (let i = 0; i < sectors.length; i++) {
      const s = sectors[i];
      const [cLon, cLat] = s.centroid;
      const px = map.latLngToContainerPoint([cLat, cLon]);
      if (px.x < -plateW || px.x > vpW + plateW || px.y < -plateH || px.y > vpH + plateH) continue;

      // Measure visual pixel span of sector so plate isn't placed inside a 10px sliver
      const nw = map.latLngToContainerPoint([s.bbox[3], s.bbox[0]]);
      const se = map.latLngToContainerPoint([s.bbox[1], s.bbox[2]]);
      const spanW = Math.abs(se.x - nw.x);
      const spanH = Math.abs(se.y - nw.y);

      if (autoDeoverlapPlates && (spanW < 34 || spanH < 26)) {
        continue;
      }

      const priority =
        (s.id === selectedSectorId ? 1_000_000 : 0) +
        (s.count > 0 ? 10_000 + s.count * 10 + s.avg : 0) +
        Math.min(500, s.area);

      candidates.push({
        id: s.id,
        x: px.x,
        y: px.y,
        width: plateW,
        height: plateH,
        priority,
        maxNudgePx: Math.min(18, Math.floor(Math.min(spanW, spanH) * 0.18))
      });
      sectorById.set(s.id, s);
    }

    const layout = autoDeoverlapPlates
      ? selectCollisionFreeLabels(candidates, {
          viewportWidth: vpW,
          viewportHeight: vpH,
          paddingPx: 8,
          marginPx: 10,
          obstacles,
          allowNudge: true
        })
      : {
          placed: candidates.map((c) => ({
            ...c,
            box: {
              minX: c.x - c.width / 2,
              minY: c.y - c.height / 2,
              maxX: c.x + c.width / 2,
              maxY: c.y + c.height / 2
            },
            nudged: false
          })),
          visibleIds: new Set(candidates.map((c) => c.id)),
          suppressedCount: 0
        };

    for (let i = 0; i < layout.placed.length; i++) {
      const p = layout.placed[i];
      const s = sectorById.get(p.id);
      if (!s) continue;

      const latLng = map.containerPointToLatLng(L.point(p.x, p.y));
      const borderAccent = s.count > 0 ? s.color : "#cbd5e1";

      let html = `<div style="
        width:${plateW}px;
        height:${plateH}px;
        box-sizing:border-box;
        background:rgba(255,255,255,0.96);
        border:1.5px solid ${borderAccent};
        border-radius:6px;
        box-shadow:0 2px 6px rgba(15,23,42,0.18);
        padding:3px 6px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        text-align:center;
        line-height:1.2;
        white-space:nowrap;
        overflow:hidden;
        font-family:'Plus Jakarta Sans',sans-serif;
        font-variant-numeric:tabular-nums;
        pointer-events:none;
      ">`;

      if (showLabelId) {
        html += `<div style="color:${labelFormat.id.color};font-size:${labelFormat.id.size}px;font-weight:800;letter-spacing:0.01em;">${s.shortLabel}</div>`;
      }
      if (showLabelAvg) {
        const valText = s.count > 0 ? `${s.avg.toFixed(1)}${s.unit ? ` ${s.unit}` : ""}` : "No data";
        html += `<div style="color:${labelFormat.avg.color};font-size:${labelFormat.avg.size}px;font-weight:700;">Avg ${valText}</div>`;
      }
      if (showLabelCount) {
        html += `<div style="color:${labelFormat.count.color};font-size:${labelFormat.count.size}px;font-weight:600;">n=${s.count}</div>`;
      }
      if (showLabelArea) {
        html += `<div style="color:${labelFormat.area.color};font-size:${labelFormat.area.size}px;">${s.area.toFixed(1)} km²</div>`;
      }
      html += `</div>`;

      const icon = L.divIcon({
        className: "sector-plate-icon",
        html,
        iconSize: [plateW, plateH],
        iconAnchor: [plateW / 2, plateH / 2]
      });

      L.marker(latLng, { icon, interactive: false, zIndexOffset: 200 }).addTo(layersRef.current.labels);
    }

    setPlateTelemetry({
      visible: layout.placed.length,
      total: sectors.length,
      suppressed: Math.max(0, sectors.length - layout.placed.length)
    });
  }, [
    sectorComputation,
    showLabelId,
    showLabelAvg,
    showLabelCount,
    showLabelArea,
    labelFormat,
    autoDeoverlapPlates,
    centerPoint,
    legendCollapsed,
    selectedSectorId
  ]);

  const schedulePlateRefresh = useCallback(() => {
    if (plateRafRef.current !== null) cancelAnimationFrame(plateRafRef.current);
    plateRafRef.current = requestAnimationFrame(() => {
      renderCollisionFreePlates();
      plateRafRef.current = null;
    });
  }, [renderCollisionFreePlates]);

  // Re-run fast plate placement on zoom / pan without recomputing sectors!
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => schedulePlateRefresh();
    map.on("zoomend moveend resize", handler);
    return () => {
      map.off("zoomend moveend resize", handler);
    };
  }, [schedulePlateRefresh, mapReady]);

  // STAGE B: Draw vector polygons on Canvas when sectorComputation changes (decoupled from selectedSectorId!)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.polys.clearLayers();
    sectorLayerIndexRef.current.clear();

    const renderer = canvasRendererRef.current || undefined;
    const sectors = sectorComputation.sectors;
    const currentSelected = selectedSectorIdRef.current;

    for (let i = 0; i < sectors.length; i++) {
      const s = sectors[i];
      if (!s.poly) continue;
      const isSelected = currentSelected === s.id;

      const polyLayer = L.geoJSON(s.poly, {
        style: {
          renderer,
          fillColor: s.color,
          fillOpacity: s.count > 0 ? (isSelected ? 0.54 : 0.36) : 0.08,
          stroke: true,
          color: isSelected ? "#0f172a" : labelFormat.sector.matchFill ? s.color : labelFormat.sector.borderColor,
          weight: isSelected ? 2.5 : labelFormat.sector.weight,
          opacity: 0.85,
          dashArray: analysisMode === "grid" ? "3, 3" : undefined
        }
      }).addTo(layersRef.current.polys);

      polyLayer.on("mouseover", () => {
        if (hoveredSectorIdRef.current !== s.id) {
          hoveredSectorIdRef.current = s.id;
          setHoveredSector({ id: s.id, avg: s.avg, count: s.count, unit: s.unit });
        }
        polyLayer.setStyle({ weight: labelFormat.sector.weight + 1.5, fillOpacity: s.count > 0 ? 0.62 : 0.18 });
      });

      polyLayer.on("mouseout", () => {
        if (hoveredSectorIdRef.current !== null) {
          hoveredSectorIdRef.current = null;
          setHoveredSector(null);
        }
        const stillSelected = selectedSectorIdRef.current === s.id;
        polyLayer.setStyle({
          weight: stillSelected ? 2.5 : labelFormat.sector.weight,
          color: stillSelected ? "#0f172a" : labelFormat.sector.matchFill ? s.color : labelFormat.sector.borderColor,
          fillOpacity: s.count > 0 ? (stillSelected ? 0.54 : 0.36) : 0.08
        });
      });

      polyLayer.on("click", (e) => {
        setSelectedSectorId(s.id);
        const rowsHtml = customRanges
          .map((range, idx) => {
            const cnt = s.points.filter((pt) =>
              idx === customRanges.length - 1
                ? pt._val >= range.min && pt._val <= range.max
                : pt._val >= range.min && pt._val < range.max
            ).length;
            const pct = s.count > 0 ? ((cnt / s.count) * 100).toFixed(1) : "0.0";
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;">
                <span style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#334155;">
                  <span style="width:9px;height:9px;border-radius:9999px;background:${range.color};display:inline-block;"></span>
                  ${range.label}
                </span>
                <span style="font-size:11px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums;">${cnt} <span style="color:#64748b;font-weight:400;">(${pct}%)</span></span>
              </div>
            `;
          })
          .join("");

        const popupHtml = `
          <div style="width:255px;font-family:'Plus Jakarta Sans',sans-serif;font-variant-numeric:tabular-nums;">
            <div style="background:#0f172a;color:#ffffff;padding:8px 12px;font-size:11px;font-weight:800;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;">
              <span>${s.id}</span>
              <span style="color:#94a3b8;font-weight:600;">${s.area.toFixed(1)} km²</span>
            </div>
            <div style="padding:10px 12px;background:#ffffff;border-radius:0 0 8px 8px;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #f1f5f9;">
                <div>
                  <div style="font-size:9px;text-transform:uppercase;font-weight:700;color:#64748b;">Mean (${activeParam})</div>
                  <div style="font-size:13px;font-weight:800;color:#4f46e5;">${s.count > 0 ? s.avg.toFixed(2) : "—"} ${s.unit}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:9px;text-transform:uppercase;font-weight:700;color:#64748b;">Samples</div>
                  <div style="font-size:13px;font-weight:800;color:#0f172a;">${s.count}</div>
                </div>
              </div>
              <div style="font-size:9px;text-transform:uppercase;font-weight:700;color:#64748b;margin-bottom:4px;">Tier Breakdown</div>
              ${rowsHtml}
              <div style="margin-top:8px;font-size:10px;color:#64748b;">
                Min: <b>${s.count > 0 ? s.min.toFixed(2) : "—"}</b> · Max: <b>${s.count > 0 ? s.max.toFixed(2) : "—"}</b> · Exceed: <b>${s.exceedanceRate.toFixed(0)}%</b>
              </div>
            </div>
          </div>
        `;

        L.popup({ offset: [0, -8] }).setLatLng(e.latlng).setContent(popupHtml).openOn(map);
      });

      sectorLayerIndexRef.current.set(s.id, { layer: polyLayer, sector: s });
    }

    schedulePlateRefresh();
  }, [sectorComputation, analysisMode, activeParam, customRanges, labelFormat.sector, schedulePlateRefresh, mapReady]);

  // O(1) incremental highlight when selectedSectorId changes — never destroys/rebuilds vector layers!
  useEffect(() => {
    const prevId = prevSelectedSectorIdRef.current;
    selectedSectorIdRef.current = selectedSectorId;
    prevSelectedSectorIdRef.current = selectedSectorId;

    if (prevId && prevId !== selectedSectorId) {
      const prevEntry = sectorLayerIndexRef.current.get(prevId);
      if (prevEntry) {
        const s = prevEntry.sector;
        prevEntry.layer.setStyle({
          weight: labelFormat.sector.weight,
          color: labelFormat.sector.matchFill ? s.color : labelFormat.sector.borderColor,
          fillOpacity: s.count > 0 ? 0.36 : 0.08
        });
      }
    }
    if (selectedSectorId) {
      const nextEntry = sectorLayerIndexRef.current.get(selectedSectorId);
      if (nextEntry) {
        const s = nextEntry.sector;
        nextEntry.layer.setStyle({
          weight: 2.5,
          color: "#0f172a",
          fillOpacity: s.count > 0 ? 0.54 : 0.16
        });
      }
    }
  }, [selectedSectorId, labelFormat.sector]);

  // Also refresh collision-free plates when label controls change
  useEffect(() => {
    schedulePlateRefresh();
  }, [schedulePlateRefresh, mapReady]);

  // Sorted & Filtered Sector List for Analytics Tab
  const analyticsSectorRows = useMemo(() => {
    const q = sectorSearch.trim().toLowerCase();
    const list = sectorComputation.sectors.filter((s) => {
      if (!q) return true;
      return s.id.toLowerCase().includes(q) || s.ring.toLowerCase().includes(q) || s.angle.toLowerCase().includes(q);
    });

    list.sort((a, b) => {
      if (sectorSortBy === "avg_desc") return b.avg - a.avg;
      if (sectorSortBy === "count_desc") return b.count - a.count;
      if (sectorSortBy === "exceed_desc") return b.exceedanceRate - a.exceedanceRate;
      if (sectorSortBy === "area_desc") return b.area - a.area;
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [sectorComputation.sectors, sectorSearch, sectorSortBy]);

  const flyToSector = useCallback((sector: ComputedSectorItem) => {
    setSelectedSectorId(sector.id);
    const map = mapRef.current;
    if (!map) return;
    const [minLon, minLat, maxLon, maxLat] = sector.bbox;
    map.flyToBounds(
      [
        [minLat, minLon],
        [maxLat, maxLon]
      ],
      { padding: [55, 55], maxZoom: 13, duration: 0.65 }
    );
  }, []);

  const addRingFromInput = () => {
    const num = parseFloat(newRingInput);
    if (!isNaN(num) && num > 0 && !radii.includes(num)) {
      setRadii((prev) => [...prev, num].sort((a, b) => a - b));
      setNewRingInput("");
    }
  };

  const removeRing = (index: number) => {
    setRadii((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addNewRange = () => {
    setCustomRanges((prev) => {
      const lastMax = prev.length > 0 ? prev[prev.length - 1].max : 0;
      const lastUnit = prev.length > 0 ? prev[prev.length - 1].unit : "";
      return [
        ...prev,
        {
          min: Number((lastMax + 0.001).toFixed(3)),
          max: Number((lastMax + 100).toFixed(3)),
          label: `Tier ${prev.length + 1}`,
          color: "#6366f1",
          unit: lastUnit,
          visible: true
        }
      ];
    });
  };

  const removeRange = (index: number) => {
    if (customRanges.length <= 1) return;
    setCustomRanges((prev) => prev.filter((_, idx) => idx !== index));
  };

  const locateUser = () => {
    if (!navigator.geolocation) {
      showToast?.("Geolocation is not supported by your browser.", "warning");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenterPoint([pos.coords.longitude, pos.coords.latitude]);
        mapRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 12);
        showToast?.("Center pinned to current GPS location", "success");
      },
      (err) => showToast?.("Unable to retrieve location: " + err.message, "error")
    );
  };

  const syncFromParentData = (useFiltered: boolean = true) => {
    const source =
      useFiltered && filteredRawData && filteredRawData.length > 0
        ? filteredRawData
        : initialRawData && initialRawData.length > 0
        ? initialRawData
        : allRawData;
    if (!source || source.length === 0) {
      showToast?.("No records found in main uploaded sheet.", "warning");
      return;
    }

    setIsLocalUpload(false);
    setLocalData(source);

    const cols = Array.from(new Set(source.slice(0, 50).flatMap((r) => Object.keys(r))));
    const detectedCoords = findCoordinateColumns(cols, source);
    const latKey = detectedCoords.lat || initialHeaders?.latitude || "";
    const lonKey = detectedCoords.lon || initialHeaders?.longitude || "";

    const newParamMap: Record<string, string> = {};
    Object.keys(SECTOR_PARAM_CONFIG).forEach((pk) => {
      newParamMap[pk] = findParamColumn(pk, cols, initialHeaderMap);
    });
    setColumnMap({ lat: latKey, lon: lonKey, params: newParamMap });

    if (latKey && lonKey) {
      let sumLat = 0;
      let sumLon = 0;
      let count = 0;
      const validPts: [number, number][] = [];
      for (let i = 0; i < source.length; i++) {
        const lat = parseCoord(source[i][latKey]);
        const lon = parseCoord(source[i][lonKey]);
        if (!isNaN(lat) && !isNaN(lon)) {
          sumLat += lat;
          sumLon += lon;
          count++;
          validPts.push([lat, lon]);
        }
      }
      if (count > 0) {
        setCenterPoint([sumLon / count, sumLat / count]);
        if (mapRef.current && validPts.length > 1) {
          mapRef.current.fitBounds(L.latLngBounds(validPts), { padding: [45, 45], maxZoom: 13 });
        }
      }
    }
    showToast?.(`Synced ${source.length.toLocaleString()} samples`, "success");
  };

  const handleFastExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      showToast?.("File exceeds 50 MB upload limit.", "error");
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    const startTime = performance.now();

    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      let data: any[] = [];
      if (isCsv) {
        const text = await file.text();
        const wb = XLSX.read(text, { type: "string", dense: true });
        data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), {
          type: "array",
          dense: true,
          cellFormula: false,
          cellHTML: false,
          cellText: false,
          cellDates: false
        });
        data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
      }

      if (!data || data.length === 0) {
        showToast?.("Uploaded sheet contains no data rows.", "warning");
        return;
      }

      const elapsed = Math.round(performance.now() - startTime);
      setIsLocalUpload(true);
      setLocalData(data);
      setParentRawData?.(data);

      const cols = Array.from(new Set(data.slice(0, 50).flatMap((r) => Object.keys(r))));
      const detectedCoords = findCoordinateColumns(cols, data);

      if (setParentHeaders && detectedCoords.lat && detectedCoords.lon) {
        setParentHeaders((prev) => ({
          ...prev,
          latitude: detectedCoords.lat,
          longitude: detectedCoords.lon
        }));
      }

      const newParamMap: Record<string, string> = {};
      Object.keys(SECTOR_PARAM_CONFIG).forEach((pk) => {
        newParamMap[pk] = findParamColumn(pk, cols, initialHeaderMap);
      });
      setColumnMap({ lat: detectedCoords.lat, lon: detectedCoords.lon, params: newParamMap });

      if (detectedCoords.lat && detectedCoords.lon) {
        let sumLat = 0;
        let sumLon = 0;
        let count = 0;
        const validPts: [number, number][] = [];
        for (let i = 0; i < data.length; i++) {
          const lat = parseCoord(data[i][detectedCoords.lat]);
          const lon = parseCoord(data[i][detectedCoords.lon]);
          if (!isNaN(lat) && !isNaN(lon)) {
            sumLat += lat;
            sumLon += lon;
            count++;
            validPts.push([lat, lon]);
          }
        }
        if (count > 0) {
          setCenterPoint([sumLon / count, sumLat / count]);
          if (mapRef.current && validPts.length > 1) {
            mapRef.current.fitBounds(L.latLngBounds(validPts), { padding: [45, 45], maxZoom: 13 });
          }
        }
      }

      showToast?.(`Loaded ${data.length.toLocaleString()} records in ${elapsed} ms`, "success");
    } catch (err: any) {
      showToast?.("Failed to parse file: " + (err.message || "Unknown error"), "error");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleShapefileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      let geojson: any;
      let mainFileName = files[0].name;

      if (files.length === 1) {
        const file = files[0];
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith(".zip")) {
          geojson = await shp(await file.arrayBuffer());
        } else if (fileName.endsWith(".geojson") || fileName.endsWith(".json")) {
          geojson = JSON.parse(await file.text());
        } else if (fileName.endsWith(".shp") || fileName.endsWith(".shx") || fileName.endsWith(".dbf")) {
          showToast?.("Select .shp, .shx, .dbf together or upload a .zip archive.", "warning");
          e.target.value = "";
          return;
        } else {
          showToast?.("Upload a valid .zip, .geojson, or linked shapefile set.", "warning");
          e.target.value = "";
          return;
        }
      } else {
        const shpFile = Array.from(files).find((f) => f.name.toLowerCase().endsWith(".shp"));
        if (shpFile) mainFileName = shpFile.name;
        const zip = new JSZip();
        for (let i = 0; i < files.length; i++) {
          zip.file(files[i].name, await files[i].arrayBuffer());
        }
        geojson = await shp(await zip.generateAsync({ type: "arraybuffer" }));
      }

      if (Array.isArray(geojson)) {
        geojson = turf.featureCollection(geojson.flatMap((g: any) => g.features || [g]));
      }

      addBoundaryLayer(geojson, mainFileName);
      showToast?.(`Boundary layer ${mainFileName} loaded`, "success");
    } catch {
      showToast?.("Error reading boundary file. Include .shp, .shx, and .dbf.", "error");
    }
    e.target.value = "";
  };

  const addBoundaryLayer = (geojson: any, name: string) => {
    const id = "layer_" + Date.now();
    const color = LAYER_COLORS[colorIndexRef.current % LAYER_COLORS.length];
    colorIndexRef.current++;

    const bbox = turf.bbox(geojson) as [number, number, number, number];
    const features: BoundaryFeatureItem[] = [];
    let fIndex = 0;

    turf.flattenEach(geojson, (currentFeature: any) => {
      if (currentFeature.geometry && (currentFeature.geometry.type === "Polygon" || currentFeature.geometry.type === "MultiPolygon")) {
        features.push({
          poly: currentFeature,
          name: getFeatureName(currentFeature, ++fIndex),
          bbox: turf.bbox(currentFeature) as [number, number, number, number],
          isSelected: true,
          color
        });
      }
    });
    features.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    setShapefileLayers((prev) => [
      ...prev,
      { id, name, geojson, bbox, features, isVisible: true, isFilter: true, color, isExpanded: false, mapLayer: null }
    ]);

    setSharedLayers?.((prev) => [
      ...prev,
      {
        id,
        name,
        geoJson: geojson,
        visible: true,
        fillColor: color,
        strokeColor: color,
        strokeWidth: 2,
        fillOpacity: 0.1,
        showLabels: false,
        labelKey: "",
        labelColor: "#1e293b",
        labelSize: 11
      }
    ]);

    mapRef.current?.fitBounds([
      [bbox[1], bbox[0]],
      [bbox[3], bbox[2]]
    ]);
  };

  const toggleFeatureSelect = (layerId: string, featureIndex: number, isChecked: boolean) => {
    setShapefileLayers((prev) =>
      prev.map((l) => {
        if (l.id !== layerId) return l;
        const nextFeatures = [...l.features];
        nextFeatures[featureIndex] = { ...nextFeatures[featureIndex], isSelected: isChecked };
        return { ...l, features: nextFeatures };
      })
    );
  };

  const toggleAllFeatures = (layerId: string, isChecked: boolean) => {
    setShapefileLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, features: l.features.map((f) => ({ ...f, isSelected: isChecked })) } : l))
    );
  };

  const toggleLayerVisibility = (id: string) => {
    setShapefileLayers((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const nextVis = !l.isVisible;
        if (l.mapLayer && mapRef.current) {
          if (nextVis) mapRef.current.addLayer(l.mapLayer);
          else mapRef.current.removeLayer(l.mapLayer);
        }
        return { ...l, isVisible: nextVis };
      })
    );
  };

  const toggleLayerFilter = (id: string) => {
    setShapefileLayers((prev) => prev.map((l) => (l.id === id ? { ...l, isFilter: !l.isFilter } : l)));
  };

  const deleteLayer = (id: string) => {
    setShapefileLayers((prev) => {
      const target = prev.find((l) => l.id === id);
      if (target?.mapLayer && mapRef.current) mapRef.current.removeLayer(target.mapLayer);
      return prev.filter((l) => l.id !== id);
    });
  };

  const exportLayerStats = (layerId: string) => {
    const layer = shapefileLayers.find((l) => l.id === layerId);
    if (!layer || !columnMap.lat || !columnMap.lon) {
      showToast?.("Map Latitude and Longitude columns first.", "warning");
      return;
    }
    const baseData = currentFilteredData.filter((d) => d._hasCoords);
    const results = layer.features
      .filter((f) => f.isSelected)
      .map((f) => {
        let count = 0;
        let sum = 0;
        let validCount = 0;
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < baseData.length; i++) {
          const d = baseData[i];
          if (fastPointInFeature(d._lon, d._lat, f.poly, f.bbox)) {
            count++;
            if (!isNaN(d._val)) {
              sum += d._val;
              validCount++;
              if (d._val < min) min = d._val;
              if (d._val > max) max = d._val;
            }
          }
        }
        return {
          "Shape Feature Name": f.name,
          "Total Samples": count,
          Parameter: activeParam,
          Average: validCount > 0 ? Number((sum / validCount).toFixed(3)) : "No Data",
          Min: validCount > 0 ? Number(min.toFixed(3)) : "-",
          Max: validCount > 0 ? Number(max.toFixed(3)) : "-"
        };
      });

    if (results.length === 0) {
      showToast?.("No features selected.", "warning");
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(results);
    ensureSheetJSNumbers(ws, 1);
    XLSX.utils.book_append_sheet(wb, ws, "Shape_Feature_Stats");
    void downloadStyledSheetJSWorkbook(wb, `Shapefile_Stats_${layer.name}_${activeParam}.xlsx`)
      .then(() => showToast?.(`Exported stats for ${layer.name}`, "success"))
      .catch((err) => {
        console.error("Shapefile stats Excel export error:", err);
        showToast?.("Failed to generate Excel file.", "error");
      });
  };

  const exportAdvancedReport = async () => {
    if (sectorComputation.sectors.length === 0) {
      showToast?.("No active sectors to export.", "warning");
      return;
    }
    const wb = XLSX.utils.book_new();
    const summaryData = sectorComputation.sectors.map((s) => ({
      "Sector/Cell ID": s.id,
      "Ring / Row": s.ring,
      "Angle / Col": s.angle,
      Samples: s.count,
      Average: s.count > 0 ? Number(s.avg.toFixed(3)) : 0,
      Min: s.count > 0 ? Number(s.min.toFixed(3)) : 0,
      Max: s.count > 0 ? Number(s.max.toFixed(3)) : 0,
      "Std Dev": s.count > 1 ? Number(s.stdDev.toFixed(3)) : 0,
      "Exceedance (%)": Number(s.exceedanceRate.toFixed(1)),
      Unit: s.unit,
      "Area (sq km)": Number(s.area.toFixed(4))
    }));
    const summaryWs = XLSX.utils.json_to_sheet(summaryData);
    ensureSheetJSNumbers(summaryWs, 1);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Analysis_Summary");

    const headerMap: Record<string, number> = { Analysis_Summary: 1 };

    sectorComputation.sectors
      .filter((s) => s.count > 0)
      .slice(0, 60)
      .forEach((sector) => {
        const sheetName = `STAT_${sector.id}`.replace(/[^a-zA-Z0-9_]/g, "").substring(0, 31);
        const tierRows = customRanges.map((range, i) => {
          const cnt = sector.points.filter((pt) =>
            i === customRanges.length - 1 ? pt._val >= range.min && pt._val <= range.max : pt._val >= range.min && pt._val < range.max
          ).length;
          return [
            range.label,
            `${range.min} - ${range.max}`,
            range.unit,
            cnt,
            sector.count > 0 ? Number(((cnt / sector.count) * 100).toFixed(2)) : 0
          ];
        });
        const aoa: any[][] = [
          [`Sector Analysis Breakdown — ${sector.id} (${activeParam})`],
          [],
          ["Identifier", sector.id],
          ["Ring / Row", sector.ring],
          ["Samples", sector.count],
          ["Mean", `${sector.avg.toFixed(3)} ${sector.unit}`],
          ["Area (sq km)", Number(sector.area.toFixed(4))],
          [],
          ["PARAMETER TIER DISTRIBUTION"],
          ["Tier", "Range", "Unit", "Samples", "Share (%)"],
          ...tierRows
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ensureSheetJSNumbers(ws, 10);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        headerMap[sheetName] = 1;
      });

    try {
      await downloadStyledSheetJSWorkbook(
        wb,
        `Sector_Analysis_${activeParam}_${new Date().toISOString().split("T")[0]}.xlsx`,
        headerMap
      );
      showToast?.(`Exported Excel Report for ${activeParam}`, "success");
    } catch (err) {
      console.error("Sector Analysis Excel export error:", err);
      showToast?.("Failed to generate Excel file.", "error");
    }
  };

  const exportGeoJson = () => {
    if (sectorComputation.sectors.length === 0) {
      showToast?.("No active sectors to export as GeoJSON.", "warning");
      return;
    }
    const fc = buildSectorsGeoJsonFeatureCollection(sectorComputation.sectors, activeParam);
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Sector_Analysis_${activeParam}_${new Date().toISOString().split("T")[0]}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast?.(`Exported GeoJSON (${fc.features.length} features)`, "success");
  };

  // Memoized unique filter lists: computed ONLY when Filters tab is open (avoids scanning 25k+ rows unnecessarily)
  const filterUniqueValuesByCol = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!isVisible || sidebarTab !== "filters" || localData.length === 0 || filterMeta.length === 0) return map;
    filterMeta.forEach((fm) => {
      const set = new Set<string>();
      for (let i = 0; i < localData.length; i++) {
        const v = String(localData[i]?.[fm.actualKey] || "").trim();
        if (v) set.add(v);
      }
      map[fm.actualKey] = Array.from(set).sort();
    });
    return map;
  }, [isVisible, sidebarTab, localData, filterMeta]);

  const fitMapToPoints = () => {

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    let count = 0;
    for (let i = 0; i < currentFilteredData.length; i++) {
      const d = currentFilteredData[i];
      if (d._hasCoords) {
        count++;
        if (d._lat < minLat) minLat = d._lat;
        if (d._lat > maxLat) maxLat = d._lat;
        if (d._lon < minLon) minLon = d._lon;
        if (d._lon > maxLon) maxLon = d._lon;
      }
    }
    if (count > 0 && mapRef.current) {
      const span = Math.abs(maxLat - minLat) + Math.abs(maxLon - minLon);
      if (count > 1 && span >= 0.0005) {
        mapRef.current.fitBounds(
          [
            [minLat, minLon],
            [maxLat, maxLon]
          ],
          { padding: [45, 45], maxZoom: 13 }
        );
      } else {
        mapRef.current.setView([minLat, minLon], 11);
      }
    }
  };

  // Concentric Ring / Row Distance-Decay Profile SVG data
  const profileChartData = useMemo(() => {
    const items = sectorComputation.ringProfile;
    if (items.length === 0) return null;
    const limit = sectorComputation.summary.desirableLimit;
    const maxVal = Math.max(limit * 1.15, ...items.map((r) => r.max), 1);
    return { items, limit, maxVal };
  }, [sectorComputation]);

  return (
    <div className="sector-console w-full h-[calc(100vh-140px)] min-h-[680px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 flex flex-col select-none">
      {/* Zone 1: Full-Width Command & Telemetry Header (Zero Overlap) */}
      <header className="shrink-0 bg-white border-b border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-20">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            title={sidebarCollapsed ? "Show Spatial Workbench" : "Collapse Workbench"}
          >
            {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-indigo-600" /> : <ChevronLeft className="w-3.5 h-3.5 text-indigo-600" />}
            <span>{sidebarCollapsed ? "Controls" : "Inspector"}</span>
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Parameter Selector */}
          <select
            value={activeParam}
            onChange={(e) => setActiveParam(e.target.value)}
            aria-label="Target Water Quality Parameter"
            className="h-8 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg px-2.5 border border-slate-200 outline-none cursor-pointer"
          >
            {Object.keys(SECTOR_PARAM_CONFIG).map((p) => (
              <option key={p} value={p}>
                {p} ({SECTOR_PARAM_CONFIG[p].unit || "unitless"})
              </option>
            ))}
          </select>

          {/* 2-Mode Selector: Radial | Grid */}
          <div className="inline-flex h-8 bg-slate-100 rounded-lg p-0.5 border border-slate-200 shrink-0">
            <button
              onClick={() => switchAnalysisMode("sector")}
              className={`px-2.5 rounded-md text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap transition-colors ${
                analysisMode === "sector" ? "bg-indigo-600 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <PieChart className="w-3 h-3" />
              <span>Radial</span>
            </button>
            <button
              onClick={() => switchAnalysisMode("grid")}
              className={`px-2.5 rounded-md text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap transition-colors ${
                analysisMode === "grid" ? "bg-sky-600 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Grid className="w-3 h-3" />
              <span>Grid</span>
            </button>
          </div>

          {/* Mode-Specific Quick Presets */}
          {analysisMode === "sector" && (
            <div className="hidden md:inline-flex h-8 bg-slate-100 rounded-lg p-0.5 border border-slate-200 shrink-0">
              {[30, 45, 60, 90, 360].map((deg) => (
                <button
                  key={deg}
                  onClick={() => setSectorAngle(deg)}
                  className={`px-2 rounded-md text-[11px] font-semibold tabular-nums whitespace-nowrap transition-colors ${
                    sectorAngle === deg ? "bg-white text-indigo-700 border border-slate-200" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {deg === 360 ? "Rings" : `${deg}°`}
                </button>
              ))}
            </div>
          )}

          {analysisMode === "grid" && (
            <div className="hidden md:inline-flex h-8 bg-slate-100 rounded-lg p-0.5 border border-slate-200 shrink-0">
              {[
                { label: "1 km²", w: 1, h: 1 },
                { label: "4 km²", w: 2, h: 2 },
                { label: "9 km²", w: 3, h: 3 },
                { label: "25 km²", w: 5, h: 5 },
                { label: "100 km²", w: 10, h: 10 }
              ].map((preset) => {
                const isSel = gridCellWidthKm === preset.w && gridCellHeightKm === preset.h;
                return (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setGridCellWidthKm(preset.w);
                      setGridCellHeightKm(preset.h);
                    }}
                    className={`px-2 rounded-md text-[11px] font-semibold tabular-nums whitespace-nowrap transition-colors ${
                      isSel ? "bg-white text-sky-700 border border-slate-200" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          )}

        </div>

        {/* Right Actions & Clean Telemetry */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsDrawing((p) => !p)}
            className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 border transition-colors ${
              isDrawing
                ? "bg-amber-500 text-white border-amber-600"
                : "bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200"
            }`}
          >
            <MousePointer2 className="w-3.5 h-3.5" />
            <span>{isDrawing ? "Click Map..." : "Pick Center"}</span>
          </button>

          <button
            onClick={locateUser}
            className="h-8 px-2 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0"
            title="Use Device GPS for Origin"
          >
            <Navigation className="w-3 h-3 text-indigo-600" />
            <span>GPS</span>
          </button>

          <button
            onClick={fitMapToPoints}
            className="h-8 px-2 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0"
            title="Fit Map to Active Wells"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Fit</span>
          </button>

          <select
            value={basemapId}
            onChange={(e) => setBasemapId(e.target.value as any)}
            aria-label="Basemap Layer"
            title="Select Basemap Layer"
            className="h-8 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold rounded-lg px-2 border border-slate-200 outline-none cursor-pointer"
          >
            <option value="osm">OpenStreetMap</option>
            <option value="esriTopo">ESRI Topo</option>
            <option value="esriPhysical">ESRI Physical</option>
            <option value="esriTerrain">ESRI Terrain</option>
            <option value="esriSatellite">ESRI Satellite</option>
            <option value="googleStreets">Google Streets</option>
            <option value="googleHybrid">Google Hybrid</option>
            <option value="carto">Carto Light</option>
          </select>

          <div className="hidden xl:flex items-center gap-2 px-2.5 h-8 text-[11px] text-slate-600 font-medium tabular-nums border-l border-slate-200">
            <span>
              <b className="text-slate-900">{currentFilteredData.length.toLocaleString()}</b> wells
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <b className="text-indigo-700">{sectorComputation.sectors.length}</b> {analysisMode === "grid" ? "cells" : "sectors"}
            </span>
          </div>

          <button
            onClick={exportAdvancedReport}
            className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel Report</span>
          </button>
        </div>
      </header>

      {/* Zone 2: Docked Asymmetric Split-Console Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Left Docked Inspector (strictly elevated above map canvas & never overlaps map) */}
        {!sidebarCollapsed && (
          <aside className="w-[344px] xl:w-[376px] shrink-0 relative z-20 bg-white border-r border-slate-200 flex flex-col min-h-0">
            {/* 3 Clean Sub-Tabs */}
            <nav className="shrink-0 grid grid-cols-3 border-b border-slate-200 bg-slate-50 p-1 gap-1">
              {[
                { id: "steps" as const, label: "Setup", icon: SlidersHorizontal },
                { id: "filters" as const, label: "Filters", icon: Layers },
                {
                  id: "stats" as const,
                  label: `Analytics (${activeSectorData.length})`,
                  icon: BarChart3
                }
              ].map((t) => {
                const Icon = t.icon;
                const active = sidebarTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSidebarTab(t.id)}
                    className={`h-8 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
                      active
                        ? "bg-white text-indigo-700 border border-slate-200"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Scrollable Inspector Body */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar text-xs">
              {sidebarTab === "steps" && (
                <>
                  {/* Dataset & Boundaries */}
                  <section className="space-y-2 pb-3 border-b border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">1. Dataset & Boundaries</span>
                      <span className="text-[11px] font-semibold tabular-nums text-emerald-700">
                        {localData.length.toLocaleString()} rows
                      </span>
                    </div>

                    {parentDataset.length > 0 && (
                      <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                            <span>App Dataset</span>
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {isLocalUpload ? "Local file" : "Synced"}
                          </span>
                        </div>
                        <button
                          onClick={() => syncFromParentData(true)}
                          className="w-full h-7 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Sync Filtered ({currentFilteredData.length.toLocaleString()})</span>
                        </button>
                        {allRawData && allRawData.length > 0 && allRawData.length !== currentFilteredData.length && (
                          <button
                            onClick={() => syncFromParentData(false)}
                            className="w-full h-7 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10.5px] font-medium"
                          >
                            Load Full Dataset ({allRawData.length.toLocaleString()})
                          </button>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <label className="h-8 cursor-pointer rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors">
                        {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-300" />}
                        <span>{isUploading ? "Loading..." : "Upload Sheet"}</span>
                        <input type="file" onChange={handleFastExcelUpload} className="hidden" accept=".xlsx,.xls,.csv" disabled={isUploading} />
                      </label>
                      <label className="h-8 cursor-pointer rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors">
                        <MapIcon className="w-3.5 h-3.5 text-teal-600" />
                        <span>Boundary (.zip)</span>
                        <input type="file" onChange={handleShapefileUpload} className="hidden" accept=".zip,.geojson,.json,.shp,.shx,.dbf,.prj" multiple />
                      </label>
                    </div>

                    {shapefileLayers.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {shapefileLayers.map((layer) => (
                          <div key={layer.id} className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                            <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                              <button
                                onClick={() =>
                                  setShapefileLayers((prev) =>
                                    prev.map((l) => (l.id === layer.id ? { ...l, isExpanded: !l.isExpanded } : l))
                                  )
                                }
                                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                              >
                                <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ background: layer.color }} />
                                <span className="text-[11px] font-semibold text-slate-800 truncate">{layer.name}</span>
                                <span className="text-[10px] text-slate-400 tabular-nums">({layer.features.length})</span>
                              </button>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => toggleLayerVisibility(layer.id)} className="p-1 text-slate-500 hover:text-indigo-600" title="Visibility">
                                  {layer.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => toggleLayerFilter(layer.id)}
                                  className={`p-1 ${layer.isFilter ? "text-emerald-600" : "text-slate-400"}`}
                                  title="Use as Spatial Clip Boundary"
                                >
                                  <Scissors className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteLayer(layer.id)} className="p-1 text-slate-400 hover:text-rose-600" title="Remove">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            {layer.isExpanded && (
                              <div className="border-t border-slate-200 bg-white p-2 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <button onClick={() => exportLayerStats(layer.id)} className="text-[10px] font-semibold text-indigo-600 hover:underline">
                                    Export Feature Stats
                                  </button>
                                  <div className="flex gap-2 text-[10px] font-semibold">
                                    <button onClick={() => toggleAllFeatures(layer.id, true)} className="text-indigo-600 hover:underline">
                                      All
                                    </button>
                                    <button onClick={() => toggleAllFeatures(layer.id, false)} className="text-slate-500 hover:underline">
                                      None
                                    </button>
                                  </div>
                                </div>
                                <div className="max-h-28 overflow-y-auto space-y-1 custom-scrollbar">
                                  {layer.features.map((f, i) => (
                                    <label key={i} className="flex items-center gap-1.5 text-[10.5px] cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={f.isSelected}
                                        onChange={(e) => toggleFeatureSelect(layer.id, i, e.target.checked)}
                                        className="w-3 h-3 accent-indigo-600"
                                      />
                                      <span className="truncate text-slate-700">{f.name}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Column Mapping */}
                  <section className="space-y-2 pb-3 border-b border-slate-200">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">2. Column Mapping</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Latitude</label>
                        <select
                          value={columnMap.lat}
                          onChange={(e) => setColumnMap((p) => ({ ...p, lat: e.target.value }))}
                          className="w-full h-7 bg-slate-50 border border-slate-200 rounded-md px-2 text-[11px] font-medium"
                        >
                          <option value="">-- Select --</option>
                          {availableColumns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Longitude</label>
                        <select
                          value={columnMap.lon}
                          onChange={(e) => setColumnMap((p) => ({ ...p, lon: e.target.value }))}
                          className="w-full h-7 bg-slate-50 border border-slate-200 rounded-md px-2 text-[11px] font-medium"
                        >
                          <option value="">-- Select --</option>
                          {availableColumns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                        Value Column (<span className="text-indigo-700">{activeParam}</span>)
                      </label>
                      <select
                        value={columnMap.params[activeParam] || ""}
                        onChange={(e) => setColumnMap((p) => ({ ...p, params: { ...p.params, [activeParam]: e.target.value } }))}
                        className="w-full h-7 bg-slate-50 border border-slate-200 rounded-md px-2 text-[11px] font-medium"
                      >
                        <option value="">-- Select Column --</option>
                        {availableColumns.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </section>

                  {/* Origin Center */}
                  <section className="space-y-2 pb-3 border-b border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">3. Origin Reference</span>
                      <span className="text-[10.5px] font-mono tabular-nums text-slate-600">
                        {centerPoint ? `${centerPoint[1].toFixed(4)}, ${centerPoint[0].toFixed(4)}` : "--"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={locateUser}
                        className="h-7 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-[10.5px] font-semibold flex items-center justify-center gap-1"
                      >
                        <Navigation className="w-3 h-3 text-indigo-600" />
                        <span>GPS</span>
                      </button>
                      <button
                        onClick={() => {
                          let sumLat = 0;
                          let sumLon = 0;
                          let count = 0;
                          for (let i = 0; i < currentFilteredData.length; i++) {
                            const d = currentFilteredData[i];
                            if (d._hasCoords) {
                              sumLat += d._lat;
                              sumLon += d._lon;
                              count++;
                            }
                          }
                          if (count > 0) {
                            const avgLat = sumLat / count;
                            const avgLon = sumLon / count;
                            setCenterPoint([avgLon, avgLat]);
                            mapRef.current?.setView([avgLat, avgLon], 11);
                          }
                        }}
                        className="h-7 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-[10.5px] font-semibold flex items-center justify-center gap-1"
                      >
                        <Crosshair className="w-3 h-3 text-indigo-600" />
                        <span>Centroid</span>
                      </button>
                      <button
                        onClick={() => setIsDrawing((p) => !p)}
                        className={`h-7 rounded-md text-[10.5px] font-semibold flex items-center justify-center gap-1 ${
                          isDrawing ? "bg-amber-500 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"
                        }`}
                      >
                        <MousePointer2 className="w-3 h-3" />
                        <span>{isDrawing ? "Click..." : "Pick"}</span>
                      </button>
                    </div>
                  </section>

                  {/* Spatial Geometry */}
                  <section className="space-y-2.5 pb-3 border-b border-slate-200">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">4. Spatial Geometry</span>
                    {analysisMode === "sector" ? (
                      <>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10.5px] font-semibold text-slate-600">Concentric Rings (km)</span>
                            <div className="flex gap-1">
                              <input
                                type="number"
                                step="0.5"
                                placeholder="km"
                                value={newRingInput}
                                onChange={(e) => setNewRingInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addRingFromInput()}
                                className="w-16 h-6 border border-slate-200 rounded px-1.5 text-[11px] tabular-nums bg-slate-50"
                              />
                              <button onClick={addRingFromInput} className="h-6 px-2 bg-indigo-600 text-white rounded text-[10px] font-semibold">
                                Add
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {radii.map((r, i) => (
                              <span
                                key={r}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-semibold tabular-nums"
                              >
                                {r} km
                                <button onClick={() => removeRing(i)} className="text-indigo-400 hover:text-rose-600">
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Sector Angle (°)</label>
                            <input
                              type="number"
                              value={sectorAngle}
                              min="1"
                              max="360"
                              onChange={(e) => setSectorAngle(parseFloat(e.target.value) || 45)}
                              className="w-full h-7 border border-slate-200 rounded-md px-2 text-[11px] tabular-nums bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Parameter</label>
                            <select
                              value={activeParam}
                              onChange={(e) => setActiveParam(e.target.value)}
                              className="w-full h-7 border border-slate-200 rounded-md px-2 text-[11px] bg-slate-50"
                            >
                              {Object.keys(SECTOR_PARAM_CONFIG).map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Cell Width (km)</label>
                            <input
                              type="number"
                              step="0.5"
                              min="0.2"
                              max="50"
                              value={gridCellWidthKm}
                              onChange={(e) => setGridCellWidthKm(Math.max(0.2, parseFloat(e.target.value) || 1))}
                              className="w-full h-7 border border-slate-200 rounded-md px-2 text-[11px] tabular-nums bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Cell Height (km)</label>
                            <input
                              type="number"
                              step="0.5"
                              min="0.2"
                              max="50"
                              value={gridCellHeightKm}
                              onChange={(e) => setGridCellHeightKm(Math.max(0.2, parseFloat(e.target.value) || 1))}
                              className="w-full h-7 border border-slate-200 rounded-md px-2 text-[11px] tabular-nums bg-slate-50"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Grid Scope</label>
                          <select
                            value={gridScope}
                            onChange={(e) => setGridScope(e.target.value as "data_bounds" | "origin_extent")}
                            className="w-full h-7 border border-slate-200 rounded-md px-2 text-[11px] bg-slate-50"
                          >
                            <option value="data_bounds">Data Wells Bounds</option>
                            <option value="origin_extent">Origin Radius Extent</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Spatial & Plate Collision Toggles */}
                    <div className="grid grid-cols-1 gap-1.5 pt-1 text-[11px]">
                      {[
                        { label: "Auto De-overlap Map Plates", checked: autoDeoverlapPlates, set: setAutoDeoverlapPlates },
                        { label: "Hide Empty Sectors / Cells", checked: hideEmptySectors, set: setHideEmptySectors },
                        { label: "Hide Missing Data Wells", checked: hideMissingData, set: setHideMissingData },
                        { label: "Clip Geometry to Boundary", checked: clipToBoundary, set: setClipToBoundary },
                        { label: "Isolate Origin Polygon", checked: autoRestrictOrigin, set: setAutoRestrictOrigin }
                      ].map((opt) => (
                        <label key={opt.label} className="flex items-center justify-between cursor-pointer text-slate-700">
                          <span className="font-medium">{opt.label}</span>
                          <input
                            type="checkbox"
                            checked={opt.checked}
                            onChange={(e) => opt.set(e.target.checked)}
                            className="w-3.5 h-3.5 accent-indigo-600"
                          />
                        </label>
                      ))}
                    </div>
                  </section>

                  {/* Plate Content & Styling */}
                  <section className="space-y-2 pb-3 border-b border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">5. Plate Display</span>
                      <button
                        onClick={() => setShowLabelFormatPanel((p) => !p)}
                        className="text-[10.5px] font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        <Palette className="w-3 h-3" />
                        <span>{showLabelFormatPanel ? "Hide Style" : "Typography"}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      {[
                        { label: "Sector ID", checked: showLabelId, set: setShowLabelId },
                        { label: "Avg Value", checked: showLabelAvg, set: setShowLabelAvg },
                        { label: "Sample Count", checked: showLabelCount, set: setShowLabelCount },
                        { label: "Area (km²)", checked: showLabelArea, set: setShowLabelArea }
                      ].map((item) => (
                        <label key={item.label} className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(e) => item.set(e.target.checked)}
                            className="w-3.5 h-3.5 accent-indigo-600"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>

                    {showLabelFormatPanel && (
                      <div className="p-2 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5 text-[10.5px]">
                        {(["id", "avg", "count", "area"] as const).map((field) => (
                          <div key={field} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                            <span className="capitalize font-medium text-slate-700">{field}</span>
                            <input
                              type="color"
                              value={labelFormat[field].color}
                              onChange={(e) =>
                                setLabelFormat((p) => ({ ...p, [field]: { ...p[field], color: e.target.value } }))
                              }
                              className="w-5 h-5 cursor-pointer border-0 bg-transparent p-0"
                            />
                            <input
                              type="number"
                              min={7}
                              max={14}
                              value={labelFormat[field].size}
                              onChange={(e) =>
                                setLabelFormat((p) => ({ ...p, [field]: { ...p[field], size: parseInt(e.target.value) || 9 } }))
                              }
                              className="w-11 h-6 border border-slate-200 rounded text-center bg-white tabular-nums"
                            />
                          </div>
                        ))}
                        <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between gap-2">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={labelFormat.sector.matchFill}
                              onChange={(e) =>
                                setLabelFormat((p) => ({ ...p, sector: { ...p.sector, matchFill: e.target.checked } }))
                              }
                              className="w-3 h-3 accent-indigo-600"
                            />
                            <span>Border = Fill</span>
                          </label>
                          <input
                            type="color"
                            value={labelFormat.sector.borderColor}
                            onChange={(e) =>
                              setLabelFormat((p) => ({ ...p, sector: { ...p.sector, borderColor: e.target.value } }))
                            }
                            className="w-5 h-5 cursor-pointer border-0 bg-transparent p-0"
                          />
                          <input
                            type="number"
                            step="0.5"
                            min={0.5}
                            max={5}
                            value={labelFormat.sector.weight}
                            onChange={(e) =>
                              setLabelFormat((p) => ({ ...p, sector: { ...p.sector, weight: parseFloat(e.target.value) || 1.5 } }))
                            }
                            className="w-11 h-6 border border-slate-200 rounded text-center bg-white tabular-nums"
                          />
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Classification Tiers */}
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">6. Classification Tiers</span>
                      <button onClick={addNewRange} className="text-[10.5px] font-semibold text-indigo-600 hover:underline">
                        + Add Tier
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {customRanges.map((r, i) => (
                        <div key={i} className={`p-2 rounded-lg border border-slate-200 bg-slate-50 space-y-1 ${r.visible === false ? "opacity-50" : ""}`}>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={r.visible !== false}
                              onChange={(e) =>
                                setCustomRanges((prev) => prev.map((rng, idx) => (idx === i ? { ...rng, visible: e.target.checked } : rng)))
                              }
                              className="w-3 h-3 accent-indigo-600"
                            />
                            <input
                              type="color"
                              value={r.color}
                              onChange={(e) =>
                                setCustomRanges((prev) => prev.map((rng, idx) => (idx === i ? { ...rng, color: e.target.value } : rng)))
                              }
                              className="w-4 h-4 cursor-pointer border-0 bg-transparent p-0 shrink-0"
                            />
                            <input
                              type="text"
                              value={r.label}
                              onChange={(e) =>
                                setCustomRanges((prev) => prev.map((rng, idx) => (idx === i ? { ...rng, label: e.target.value } : rng)))
                              }
                              className="flex-1 min-w-0 h-6 text-[10.5px] font-semibold bg-white border border-slate-200 rounded px-1.5"
                            />
                            {customRanges.length > 1 && (
                              <button onClick={() => removeRange(i)} className="text-slate-400 hover:text-rose-600">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1 pl-4 text-[10.5px] tabular-nums">
                            <input
                              type="number"
                              step="0.01"
                              value={r.min}
                              onChange={(e) =>
                                setCustomRanges((prev) =>
                                  prev.map((rng, idx) => (idx === i ? { ...rng, min: parseFloat(e.target.value) || 0 } : rng))
                                )
                              }
                              className="flex-1 h-6 bg-white border border-slate-200 rounded px-1 text-center"
                            />
                            <span className="text-slate-400 text-[10px]">to</span>
                            <input
                              type="number"
                              step="0.01"
                              value={r.max}
                              onChange={(e) =>
                                setCustomRanges((prev) =>
                                  prev.map((rng, idx) => (idx === i ? { ...rng, max: parseFloat(e.target.value) || 0 } : rng))
                                )
                              }
                              className="flex-1 h-6 bg-white border border-slate-200 rounded px-1 text-center"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {sidebarTab === "filters" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Attribute Filters</span>
                    <button onClick={() => setFilters({})} className="text-[11px] font-semibold text-indigo-600 hover:underline">
                      Reset All
                    </button>
                  </div>
                  {filterMeta.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">No categorical metadata columns detected.</div>
                  ) : (
                    filterMeta.map((fm) => {
                      const searchTerm = (filterSearchTerms[fm.actualKey] || "").toLowerCase();
                      const uniqueVals = filterUniqueValuesByCol[fm.actualKey] || [];
                      const filteredVals = searchTerm ? uniqueVals.filter((v) => v.toLowerCase().includes(searchTerm)) : uniqueVals;
                      const activeSet = filters[fm.actualKey] || new Set();

                      return (
                        <div key={fm.actualKey} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                            <span>{fm.label}</span>
                            <span className="text-slate-400 tabular-nums">
                              {activeSet.size > 0 ? `${activeSet.size}/${uniqueVals.length}` : uniqueVals.length}
                            </span>
                          </div>
                          {uniqueVals.length > 8 && (
                            <input
                              type="text"
                              placeholder={`Search ${fm.label.toLowerCase()}...`}
                              value={filterSearchTerms[fm.actualKey] || ""}
                              onChange={(e) => setFilterSearchTerms((p) => ({ ...p, [fm.actualKey]: e.target.value }))}
                              className="w-full h-6 px-2 text-[10.5px] bg-white border border-slate-200 rounded"
                            />
                          )}
                          <div className="max-h-32 overflow-y-auto space-y-1 bg-white p-1.5 rounded border border-slate-200 custom-scrollbar">
                            {filteredVals.slice(0, 120).map((v) => (
                              <label key={v} className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={activeSet.has(v)}
                                  onChange={(e) => {
                                    const nextSet = new Set(activeSet);
                                    if (e.target.checked) nextSet.add(v);
                                    else nextSet.delete(v);
                                    setFilters((prev) => ({ ...prev, [fm.actualKey]: nextSet }));
                                  }}
                                  className="w-3 h-3 accent-indigo-600"
                                />
                                <span className="truncate">{v}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {sidebarTab === "stats" && (
                <div className="space-y-3.5">
                  {/* Unboxed Tabular KPI Summary Strip */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 pb-3 border-b border-slate-200 tabular-nums">
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-slate-500">Global Mean ({activeParam})</div>
                      <div className="text-base font-bold text-slate-900">
                        {sectorComputation.summary.totalSamples > 0 ? sectorComputation.summary.globalMean.toFixed(2) : "—"}{" "}
                        <span className="text-[11px] font-medium text-slate-500">{sectorComputation.summary.unit}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-slate-500">Desirable Exceedance</div>
                      <div className="text-base font-bold text-rose-600">
                        {sectorComputation.summary.overallExceedanceRate.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-slate-500">Populated Sectors</div>
                      <div className="text-sm font-bold text-slate-800">
                        {sectorComputation.summary.populatedSectors} / {sectorComputation.summary.totalSectors}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-slate-500">Peak Sector Mean</div>
                      <div className="text-sm font-bold text-indigo-700 truncate" title={sectorComputation.summary.peakSectorId || ""}>
                        {sectorComputation.summary.peakSectorId ? `${sectorComputation.summary.peakSectorAvg.toFixed(2)}` : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Distance-Decay / Ring Profile SVG Chart */}
                  {profileChartData && profileChartData.items.length > 0 && (
                    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5">
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="font-bold uppercase tracking-wider text-slate-600">
                          {analysisMode === "sector" ? "Radial Ring Decay Profile" : "Grid Row Profile"}
                        </span>
                        <span className="text-slate-500 tabular-nums">
                          Limit: {profileChartData.limit} {sectorComputation.summary.unit}
                        </span>
                      </div>
                      <svg viewBox="0 0 280 92" className="w-full h-24 overflow-visible">
                        {(() => {
                          const { items, limit, maxVal } = profileChartData;
                          const chartW = 264;
                          const chartH = 66;
                          const padL = 8;
                          const padT = 8;
                          const limitY = padT + chartH - Math.min(1, limit / maxVal) * chartH;
                          const barGap = 6;
                          const barW = Math.max(8, Math.min(36, (chartW - barGap * (items.length - 1)) / items.length));

                          return (
                            <>
                              <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke="#cbd5e1" strokeWidth="1" />
                              <line
                                x1={padL}
                                y1={limitY}
                                x2={padL + chartW}
                                y2={limitY}
                                stroke="#dc2626"
                                strokeWidth="1"
                                strokeDasharray="3,3"
                              />
                              {items.map((item, idx) => {
                                const h = item.sampleCount > 0 ? Math.max(2, (item.avg / maxVal) * chartH) : 1;
                                const x = padL + idx * (barW + barGap);
                                const y = padT + chartH - h;
                                const fill = item.avg > limit ? "#f59e0b" : "#4f46e5";
                                return (
                                  <g key={item.ringLabel}>
                                    <rect x={x} y={y} width={barW} height={h} rx={2} fill={fill} opacity={0.85}>
                                      <title>{`${item.ringLabel}: Mean ${item.avg.toFixed(2)} (n=${item.sampleCount})`}</title>
                                    </rect>
                                    <text
                                      x={x + barW / 2}
                                      y={padT + chartH + 11}
                                      textAnchor="middle"
                                      fontSize="7.5"
                                      fill="#475569"
                                    >
                                      {item.ringLabel.replace(" km", "")}
                                    </text>
                                  </g>
                                );
                              })}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  )}

                  {/* Search & Sort Controls */}
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Filter sectors..."
                        value={sectorSearch}
                        onChange={(e) => setSectorSearch(e.target.value)}
                        className="w-full h-7 pl-6 pr-2 text-[11px] bg-slate-50 border border-slate-200 rounded-md outline-none"
                      />
                    </div>
                    <select
                      value={sectorSortBy}
                      onChange={(e) => setSectorSortBy(e.target.value as any)}
                      className="h-7 px-2 text-[11px] bg-slate-50 border border-slate-200 rounded-md font-medium"
                    >
                      <option value="avg_desc">Sort: Mean ↓</option>
                      <option value="count_desc">Sort: Samples ↓</option>
                      <option value="exceed_desc">Sort: Exceedance ↓</option>
                      <option value="area_desc">Sort: Area ↓</option>
                      <option value="id_asc">Sort: ID A-Z</option>
                    </select>
                  </div>

                  {/* Interactive Click-to-Focus Sector List */}
                  {analyticsSectorRows.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No active sectors computed. Configure origin or dataset columns in Setup.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-0.5 custom-scrollbar">
                      {analyticsSectorRows.map((s) => {
                        const isSel = selectedSectorId === s.id;
                        return (
                          <button
                            key={s.id}
                            onClick={() => flyToSector(s)}
                            className={`w-full text-left p-2.5 rounded-lg border transition-colors tabular-nums ${
                              isSel ? "border-indigo-500 bg-indigo-50/40" : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                                <span className="truncate">{s.id}</span>
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 shrink-0">{s.area.toFixed(1)} km²</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 mt-1 text-[10.5px] text-slate-600">
                              <span>
                                n=<b>{s.count}</b>
                              </span>
                              <span>
                                Mean <b className="text-indigo-700">{s.count > 0 ? s.avg.toFixed(2) : "—"}</b>
                              </span>
                              <span className="text-right">
                                Exceed <b>{s.exceedanceRate.toFixed(0)}%</b>
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Docked Inspector Footer */}
            <footer className="shrink-0 p-2.5 border-t border-slate-200 bg-slate-50 grid grid-cols-2 gap-2">
              <button
                onClick={exportAdvancedReport}
                className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
              <button
                onClick={exportGeoJson}
                className="h-8 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1.5"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
                <span>GeoJSON</span>
              </button>
            </footer>
          </aside>
        )}

        {/* Right Full-Bleed Spatial Stage */}
        <main className="flex-1 relative z-10 min-w-0 min-h-0 overflow-hidden bg-[#e8eef5]">
          <div
            ref={mapContainerRef}
            className="absolute inset-0 w-full h-full overflow-hidden"
          />

          {/* Interactive Picking Prompt Banner (only shown when actively picking) */}
          {isDrawing && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900 text-white px-4 py-2 rounded-lg border border-indigo-400 flex items-center gap-3 text-xs font-semibold shadow-lg">
              <Crosshair className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Click map to position Origin Center</span>
              <button
                onClick={() => setIsDrawing(false)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Bottom-Left Live Probe & Telemetry HUD */}
          <div className="absolute bottom-3 left-3 z-[900] bg-slate-900/90 text-white px-3 py-2 rounded-lg border border-slate-700 text-[11px] tabular-nums flex flex-wrap items-center gap-x-3 gap-y-1 max-w-[calc(100%-260px)]">
            <span ref={cursorTextRef} className="font-mono text-slate-200">
              Move cursor over map
            </span>
            {hoveredSector && (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-indigo-300 font-semibold">
                  {hoveredSector.id}: {hoveredSector.count > 0 ? `${hoveredSector.avg.toFixed(2)} ${hoveredSector.unit}` : "Empty"} (n=
                  {hoveredSector.count})
                </span>
              </>
            )}
            <span className="text-slate-500">·</span>
            <span className="text-slate-300" title="Visible collision-free map plates vs total computed sectors">
              Plates <b>{plateTelemetry.visible}</b>/{plateTelemetry.total}
              {plateTelemetry.suppressed > 0 && autoDeoverlapPlates ? ` (${plateTelemetry.suppressed} zoomed out)` : ""}
            </span>
          </div>

          {/* Bottom-Right Collapsible Map Legend */}
          <div className="absolute bottom-3 right-3 z-[900] bg-white border border-slate-200 rounded-xl shadow-md min-w-[180px] max-w-[250px] overflow-hidden">
            <button
              onClick={() => setLegendCollapsed((c) => !c)}
              className="w-full px-3 py-2 flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-50"
            >
              <span>
                {activeParam} ({SECTOR_PARAM_CONFIG[activeParam]?.unit || "unitless"})
              </span>
              {legendCollapsed ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
            </button>

            {!legendCollapsed && (
              <div className="px-3 pb-2.5 pt-1 border-t border-slate-100 space-y-1.5 text-[10.5px] tabular-nums">
                {customRanges.map((r, i) => (
                  <div key={i} className={`flex items-center justify-between gap-2 ${r.visible === false ? "opacity-40 line-through" : ""}`}>
                    <span className="flex items-center gap-1.5 text-slate-700 font-medium truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                      <span className="truncate">{r.label}</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 shrink-0">
                      {r.min}–{r.max >= 99999 ? "MAX" : r.max}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
