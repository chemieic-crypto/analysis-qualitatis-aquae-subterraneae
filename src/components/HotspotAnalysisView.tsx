import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as XLSX from "xlsx";
import {
  Target,
  Upload,
  Plus,
  Download,
  Maximize2,
  MousePointer2,
  Zap,
  Trash2,
  Search,
  Layers,
  BarChart3,
  Table2,
  Map as MapIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  AlertTriangle,
  Crosshair
} from "lucide-react";
import type { DataHeaders, ShapefileLayer } from "../types";
import { downloadStyledSheetJSWorkbook, ensureSheetJSNumbers } from "../utils/excelFormatter";
import {
  SECTOR_PARAM_CONFIG,
  fastDestination,
  fastHaversineKm,
  matchTierRange,
  type CustomTierRange
} from "../utils/sectorAnalysisEngine";
import {
  buildHotspotGroupPlumePoints,
  downloadHotspotSheetTemplate,
  parseHotspotWorksheet,
  type HotspotGroup,
  type HotspotSheetParamInfo
} from "../utils/hotspotSheetParser";
import {
  buildHotspotsGeoJson,
  calculateHotspotPlumeData,
  computeBatchHotspotAnalytics,
  computeDistanceDecayStats,
  getHotspotParamColor,
  type HotspotDecayStats,
  type HotspotGroupBatchAnalytics,
  type HotspotPlumeResult,
  type HotspotPoint,
  type HotspotSpreadPattern
} from "../utils/hotspotPlumeEngine";
import { HotspotSheetEntryModal } from "./HotspotSheetEntryModal";

interface HotspotAnalysisViewProps {
  rawData: any[];
  allRawData?: any[];
  headers?: DataHeaders;
  headerMap?: Record<string, string>;
  sharedLayers?: ShapefileLayer[];
  isVisible?: boolean;
  showToast?: (msg: string, type?: "success" | "error" | "warning" | "info") => void;
}

const BASEMAPS: Record<string, { url: string; attr: string; maxZoom: number; maxNativeZoom: number; subdomains?: string }> = {
  esriTopo: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
    maxZoom: 19,
    maxNativeZoom: 18
  },
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
    maxNativeZoom: 19
  },
  esriPhysical: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
    maxZoom: 18,
    maxNativeZoom: 8
  },
  esriTerrain: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
    maxZoom: 18,
    maxNativeZoom: 13
  },
  esriSatellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
    maxZoom: 19,
    maxNativeZoom: 18
  },
  googleStreets: {
    url: "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    attr: "&copy; Google Maps",
    maxZoom: 20,
    maxNativeZoom: 20,
    subdomains: "mt0,mt1,mt2,mt3"
  },
  googleHybrid: {
    url: "https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}",
    attr: "&copy; Google Maps",
    maxZoom: 20,
    maxNativeZoom: 20,
    subdomains: "mt0,mt1,mt2,mt3"
  },
  carto: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attr: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 19,
    maxNativeZoom: 19,
    subdomains: "abcd"
  }
};

function parseCoord(val: any): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") return isFinite(val) ? val : NaN;
  const s = String(val).trim();
  if (!s) return NaN;
  const direct = parseFloat(s.replace(/,/g, ""));
  return isNaN(direct) ? NaN : direct;
}

function parseWaterValue(val: any): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") return isFinite(val) ? val : NaN;
  const s = String(val).trim().toLowerCase();
  if (!s || s === "-" || s === "na" || s === "n/a" || s === "nil") return NaN;
  if (s === "bdl" || s === "nd" || s === "trace" || s === "traces") return 0;
  if (s.startsWith("<")) {
    const num = parseFloat(s.slice(1).trim());
    return isNaN(num) ? 0 : num * 0.5;
  }
  const cleaned = s.replace(/[><=,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? NaN : num;
}

function buildDefaultRanges(paramKey: string): CustomTierRange[] {
  const cfg = SECTOR_PARAM_CONFIG[paramKey] || { b1: 45, b2: 100, unit: "mg/L" };
  return [
    { min: 0, max: cfg.b1, label: "Desirable", color: "#10b981", unit: cfg.unit, visible: true },
    { min: cfg.b1, max: cfg.b2, label: "Permissible", color: "#f59e0b", unit: cfg.unit, visible: true },
    { min: cfg.b2, max: 100000, label: "Unsuitable", color: "#ef4444", unit: cfg.unit, visible: true }
  ];
}

function severityTextClass(severity: string): string {
  if (severity === "Critical") return "text-rose-700 font-bold";
  if (severity === "High") return "text-orange-700 font-bold";
  if (severity === "Moderate") return "text-amber-700 font-semibold";
  return "text-emerald-700 font-semibold";
}

function classificationTextClass(cls: string): string {
  if (cls === "Secondary Off-Center Peak") return "text-rose-700 font-bold";
  if (cls === "Expanding Plume") return "text-orange-700 font-semibold";
  if (cls === "Localized Point Source") return "text-indigo-700 font-semibold";
  return "text-slate-600";
}

function spreadPatternBadgeClass(pattern: HotspotSpreadPattern | string): string {
  if (pattern === "Multi-Directional") return "bg-rose-50 text-rose-700 border-rose-200";
  if (pattern === "Unidirectional") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

/**
 * Checks whether a measured concentration exceeds the BIS Permissible Limit (PL).
 * Handles two-sided pH limits (6.5–8.5) and standard upper limits.
 */
function isAbovePermissibleLimit(val: number, paramKey: string, b1: number, b2: number): boolean {
  if (isNaN(val)) return false;
  if (paramKey.toLowerCase() === "ph") {
    return val < b1 || val > b2;
  }
  const pl = b2 > 0 ? b2 : b1;
  return val > pl;
}

function formatPermissibleLimit(paramKey: string, b1: number, b2: number, unit: string): string {
  if (paramKey.toLowerCase() === "ph") return `${b1}–${b2}`;
  const pl = b2 > 0 ? b2 : b1;
  return `${pl}${unit ? ` ${unit}` : ""}`;
}

/**
 * Generates a crisp 5-pointed star SVG icon matching the CGWB Hot Spot Grid Sampling diagram.
 */
function buildStarSvgHtml(fillColor: string, strokeColor: string, size: number, highlightRing: boolean = false): string {
  const ring = highlightRing
    ? `<circle cx="12" cy="12" r="11" fill="none" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="2.5,2"/>`
    : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="overflow:visible;filter:drop-shadow(0 1px 2px rgba(15,23,42,0.45));">
    ${ring}
    <polygon points="12,1.6 15.1,8.1 22.3,9.0 17.0,14.0 18.4,21.2 12,17.7 5.6,21.2 7.0,14.0 1.7,9.0 8.9,8.1"
      fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.65" stroke-linejoin="round"/>
  </svg>`;
}

export default function HotspotAnalysisView({
  rawData,
  allRawData,
  headers,
  headerMap,
  sharedLayers,
  isVisible = true,
  showToast
}: HotspotAnalysisViewProps) {
  const [hasActivated, setHasActivated] = useState<boolean>(isVisible);
  useEffect(() => {
    if (isVisible && !hasActivated) setHasActivated(true);
  }, [isVisible, hasActivated]);

  // Workspace view mode: Spatial Map | Analytics & Diagnostics | Batch Data Ledger
  const [workspaceView, setWorkspaceView] = useState<"map" | "analytics" | "ledger">("map");
  const [inspectorTab, setInspectorTab] = useState<"spots" | "layers" | "detail">("spots");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [legendCollapsed, setLegendCollapsed] = useState<boolean>(false);

  // Parameter & Basemap
  const [activeParam, setActiveParam] = useState<string>("NO3");
  const [basemapId, setBasemapId] = useState<keyof typeof BASEMAPS>("esriTopo");
  const customRanges = useMemo(() => buildDefaultRanges(activeParam), [activeParam]);

  // Uploaded / Manual Hot Spot Data Sheet state
  const [hotspotSheetGroups, setHotspotSheetGroups] = useState<HotspotGroup[]>([]);
  const [hotspotSheetParams, setHotspotSheetParams] = useState<HotspotSheetParamInfo[]>([]);
  const [hotspotSheetFileName, setHotspotSheetFileName] = useState<string>("");
  const [selectedHotspotGroupId, setSelectedHotspotGroupId] = useState<string | null>(null);
  const [isHotspotFocused, setIsHotspotFocused] = useState<boolean>(false);
  const [plotAllHotspots, setPlotAllHotspots] = useState<boolean>(true);
  const [useSheetGridOnly, setUseSheetGridOnly] = useState<boolean>(true);
  const [isAddHotspotModalOpen, setIsAddHotspotModalOpen] = useState<boolean>(false);
  const hotspotFileInputRef = useRef<HTMLInputElement | null>(null);

  // Filters & Multi-Select State (empty array = ALL)
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [spreadFilter, setSpreadFilter] = useState<"All" | HotspotSpreadPattern>("All");
  const [severityFilter, setSeverityFilter] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"no_asc" | "hs_desc" | "exceed_desc" | "footprint_desc">("no_asc");
  const [ledgerMode, setLedgerMode] = useState<"groups" | "samples">("groups");
  const [scatterScope, setScatterScope] = useState<"all" | "active">("all");
  const [openFilterMenu, setOpenFilterMenu] = useState<"params" | "states" | null>(null);

  // Ad-hoc Hot Spot point (used when picking on map or Auto-Max from main dataset)
  const [adhocHotspotPoint, setAdhocHotspotPoint] = useState<HotspotPoint | null>(null);
  const [isPickingHotspot, setIsPickingHotspot] = useState<boolean>(false);

  // Plume & Layer Configuration — Default: 5 km circle radius & 2 x 2 km 4x4 dashed grid
  const [autoFitPerSpot, setAutoFitPerSpot] = useState<boolean>(false);
  const [hotspotRadiusKm, setHotspotRadiusKm] = useState<number>(5.0);
  const [hotspotGridSizeKm, setHotspotGridSizeKm] = useState<number>(2.0);
  const [gridColorByPL, setGridColorByPL] = useState<boolean>(true);
  const [starColorMode, setStarColorMode] = useState<"pl" | "parameter">("pl");
  const [showBufferCircle, setShowBufferCircle] = useState<boolean>(true);
  const [showGridCells, setShowGridCells] = useState<boolean>(true);
  const [showGridSamples, setShowGridSamples] = useState<boolean>(true);
  const [showConnectors, setShowConnectors] = useState<boolean>(false);
  const [showPlumeVectorArrow, setShowPlumeVectorArrow] = useState<boolean>(true);
  const [showDimensionLabels, setShowDimensionLabels] = useState<boolean>(true);
  const [showSpotLabels, setShowSpotLabels] = useState<boolean>(true);
  const [showRiskHalos, setShowRiskHalos] = useState<boolean>(false);
  const [showBoundaryOverlays, setShowBoundaryOverlays] = useState<boolean>(true);
  const [selectedCellHighlight, setSelectedCellHighlight] = useState<string | null>(null);
  const [selectedDirectionHighlight, setSelectedDirectionHighlight] = useState<string | null>(null);

  const deferredRadiusKm = useDeferredValue(hotspotRadiusKm);
  const deferredGridKm = useDeferredValue(hotspotGridSizeKm);

  // Leaflet refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const boundaryLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const mainWellsLayerRef = useRef<L.LayerGroup | null>(null);
  const hotspotLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const cursorTextRef = useRef<HTMLSpanElement | null>(null);
  const [mapReady, setMapReady] = useState<boolean>(false);

  // Parse main dataset points (for ad-hoc Pick Map / Auto-Max or combined grid analysis)
  const mainDatasetPoints = useMemo(() => {
    const src = rawData && rawData.length > 0 ? rawData : allRawData || [];
    if (!hasActivated || src.length === 0) return [];
    const latKey = headers?.latitude || "";
    const lonKey = headers?.longitude || "";
    if (!latKey || !lonKey) return [];

    // Resolve parameter column in main dataset
    const cfg = SECTOR_PARAM_CONFIG[activeParam];
    let valKey = headerMap?.[activeParam] || "";
    if (!valKey) {
      const sampleKeys = Object.keys(src[0] || {});
      const lowerTarget = activeParam.toLowerCase();
      valKey =
        sampleKeys.find((k) => k.toLowerCase() === lowerTarget) ||
        sampleKeys.find((k) => k.toLowerCase().startsWith(lowerTarget + " ") || k.toLowerCase().startsWith(lowerTarget + "(")) ||
        (cfg?.keywords
          ? sampleKeys.find((k) => cfg.keywords.some((kw) => k.toLowerCase().includes(kw.toLowerCase()))) || ""
          : "");
    }

    const out: any[] = [];
    for (let i = 0; i < src.length; i++) {
      const d = src[i];
      const lat = parseCoord(d[latKey]);
      const lon = parseCoord(d[lonKey]);
      const isValid =
        isFinite(lat) &&
        isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180 &&
        !(Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001);
      if (!isValid) continue;
      const val = valKey ? parseWaterValue(d[valKey]) : NaN;
      out.push({
        _raw: d,
        _index: i,
        _lat: lat,
        _lon: lon,
        _val: val,
        _hasCoords: true
      });
    }
    return out;
  }, [hasActivated, rawData, allRawData, headers?.latitude, headers?.longitude, headerMap, activeParam]);

  // Unique states & counts in uploaded Hot Spot sheet
  const availableStateCounts = useMemo(() => {
    const map = new Map<string, number>();
    hotspotSheetGroups.forEach((g) => {
      const st = g.state || "Unspecified";
      map.set(st, (map.get(st) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
  }, [hotspotSheetGroups]);

  // Unique parameters & counts in uploaded Hot Spot sheet
  const availableParamCounts = useMemo(() => {
    const map = new Map<string, { paramKey: string; unit: string; count: number; color: string }>();
    hotspotSheetGroups.forEach((g) => {
      const pk = g.primaryParam || activeParam;
      const prev = map.get(pk);
      if (prev) {
        prev.count++;
      } else {
        const info = hotspotSheetParams.find((p) => p.paramKey === pk);
        const cfg = SECTOR_PARAM_CONFIG[pk];
        map.set(pk, {
          paramKey: pk,
          unit: g.paramUnit || info?.unit || cfg?.unit || "mg/L",
          count: 1,
          color: getHotspotParamColor(pk).primary
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.paramKey.localeCompare(b.paramKey));
  }, [hotspotSheetGroups, hotspotSheetParams, activeParam]);

  // Full batch analytics across all uploaded Hot Spot groups (each group evaluated on its own parameter)
  const fullBatchAnalytics = useMemo(() => {
    if (!hasActivated || hotspotSheetGroups.length === 0) {
      return computeBatchHotspotAnalytics([], activeParam, hotspotSheetParams);
    }
    return computeBatchHotspotAnalytics(hotspotSheetGroups, activeParam, hotspotSheetParams, {
      selectedGroupId: selectedHotspotGroupId,
      autoFitPerSpot,
      uniformRadiusKm: deferredRadiusKm,
      uniformGridKm: deferredGridKm,
      focusedRadiusKm: deferredRadiusKm,
      focusedGridKm: deferredGridKm,
      useSheetGridOnly,
      extraMainPoints: useSheetGridOnly ? [] : mainDatasetPoints,
      resolution: 8,
      useGroupPrimaryParam: true
    });
  }, [
    hasActivated,
    hotspotSheetGroups,
    hotspotSheetParams,
    activeParam,
    selectedHotspotGroupId,
    autoFitPerSpot,
    deferredRadiusKm,
    deferredGridKm,
    useSheetGridOnly,
    mainDatasetPoints
  ]);

  // Filtered & sorted batch items (multi-select Parameters × multi-select States × Spread Pattern × Severity × Search)
  const filteredBatchItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const hasParamFilter = selectedParams.length > 0;
    const hasStateFilter = selectedStates.length > 0;

    const list = fullBatchAnalytics.items.filter((it) => {
      if (hasParamFilter && !selectedParams.includes(it.paramKey)) return false;
      if (hasStateFilter && !selectedStates.includes(it.group.state || "Unspecified")) return false;
      if (spreadFilter !== "All" && it.decay.spreadPattern !== spreadFilter) return false;
      if (severityFilter !== "All" && it.decay.severity !== severityFilter) return false;
      if (q) {
        const hay = [
          it.group.hotspotNo,
          it.group.location,
          it.group.district,
          it.group.block,
          it.group.state,
          it.group.identificationNo,
          it.paramKey,
          it.decay.spreadPattern,
          it.decay.spreadDirectionLabel,
          it.decay.classification
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === "hs_desc") {
        const va = isNaN(a.decay.hsVal) ? -Infinity : a.decay.hsVal;
        const vb = isNaN(b.decay.hsVal) ? -Infinity : b.decay.hsVal;
        return vb - va;
      }
      if (sortBy === "exceed_desc") return b.decay.exceedGridPct - a.decay.exceedGridPct || b.decay.severityScore - a.decay.severityScore;
      if (sortBy === "footprint_desc") return b.decay.footprintKm - a.decay.footprintKm;
      const na = parseFloat(a.group.hotspotNo);
      const nb = parseFloat(b.group.hotspotNo);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.group.hotspotNo.localeCompare(b.group.hotspotNo);
    });
    return sorted;
  }, [fullBatchAnalytics.items, selectedParams, selectedStates, spreadFilter, severityFilter, searchTerm, sortBy]);

  // Re-aggregate state summaries, parameter summaries & KPIs for currently filtered items
  const activeBatchSummary = useMemo(() => {
    const isUnfiltered =
      selectedParams.length === 0 &&
      selectedStates.length === 0 &&
      spreadFilter === "All" &&
      severityFilter === "All" &&
      !searchTerm.trim();
    if (isUnfiltered) {
      return fullBatchAnalytics;
    }
    return computeBatchHotspotAnalytics(
      filteredBatchItems.map((i) => i.group),
      activeParam,
      hotspotSheetParams,
      {
        selectedGroupId: selectedHotspotGroupId,
        autoFitPerSpot,
        uniformRadiusKm: deferredRadiusKm,
        uniformGridKm: deferredGridKm,
        focusedRadiusKm: deferredRadiusKm,
        focusedGridKm: deferredGridKm,
        useSheetGridOnly,
        extraMainPoints: useSheetGridOnly ? [] : mainDatasetPoints,
        resolution: 8,
        useGroupPrimaryParam: true
      }
    );
  }, [
    fullBatchAnalytics,
    filteredBatchItems,
    selectedParams,
    selectedStates,
    spreadFilter,
    severityFilter,
    searchTerm,
    activeParam,
    hotspotSheetParams,
    selectedHotspotGroupId,
    autoFitPerSpot,
    deferredRadiusKm,
    deferredGridKm,
    useSheetGridOnly,
    mainDatasetPoints
  ]);

  // Ad-hoc single hotspot calculation (when user uses Pick Map or Auto-Max from main dataset)
  const adhocAnalytics = useMemo(() => {
    if (!hasActivated || !adhocHotspotPoint || selectedHotspotGroupId) return null;
    const cfg = SECTOR_PARAM_CONFIG[activeParam] || { b1: 45, b2: 100, unit: "mg/L" };
    const result = calculateHotspotPlumeData(
      { ...adhocHotspotPoint, paramKey: activeParam, paramUnit: cfg.unit },
      deferredRadiusKm,
      mainDatasetPoints,
      activeParam,
      8,
      deferredGridKm
    );
    const decay = computeDistanceDecayStats(adhocHotspotPoint.val, result.samplingLocations, activeParam);
    return {
      point: { ...adhocHotspotPoint, paramKey: activeParam, paramUnit: cfg.unit },
      paramKey: activeParam,
      paramUnit: cfg.unit,
      b1: cfg.b1,
      b2: cfg.b2,
      result,
      decay
    };
  }, [hasActivated, adhocHotspotPoint, selectedHotspotGroupId, deferredRadiusKm, deferredGridKm, mainDatasetPoints, activeParam]);

  // Currently focused item (either from Hot Spot sheet or ad-hoc pick)
  const focusedItem = useMemo<{
    group: HotspotGroup | null;
    point: HotspotPoint;
    paramKey: string;
    paramUnit: string;
    b1: number;
    b2: number;
    result: HotspotPlumeResult;
    decay: HotspotDecayStats;
  } | null>(() => {
    if (selectedHotspotGroupId) {
      const found =
        filteredBatchItems.find((i) => i.group.id === selectedHotspotGroupId) ||
        fullBatchAnalytics.items.find((i) => i.group.id === selectedHotspotGroupId);
      if (found) return found;
    }
    if (adhocAnalytics) {
      return { group: null, ...adhocAnalytics };
    }
    if (filteredBatchItems.length > 0) {
      return filteredBatchItems[0];
    }
    return null;
  }, [selectedHotspotGroupId, filteredBatchItems, fullBatchAnalytics.items, adhocAnalytics]);

  // Initialize Leaflet Map once when visible
  useEffect(() => {
    if (!hasActivated || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [22.9734, 78.6569],
      zoom: 5,
      zoomControl: false,
      preferCanvas: true
    });
    L.control.zoom({ position: "topright" }).addTo(map);

    const cfg = BASEMAPS[basemapId] || BASEMAPS.esriTopo;
    const tileOpts: L.TileLayerOptions = {
      attribution: cfg.attr,
      maxZoom: cfg.maxZoom,
      maxNativeZoom: cfg.maxNativeZoom,
      crossOrigin: true
    };
    if (cfg.subdomains) tileOpts.subdomains = cfg.subdomains.split(",");
    tileLayerRef.current = L.tileLayer(cfg.url, tileOpts).addTo(map);

    canvasRendererRef.current = L.canvas({ padding: 0.5 });
    boundaryLayerGroupRef.current = L.layerGroup().addTo(map);
    mainWellsLayerRef.current = L.layerGroup().addTo(map);
    hotspotLayerGroupRef.current = L.layerGroup().addTo(map);

    map.on("mousemove", (e: L.LeafletMouseEvent) => {
      if (cursorTextRef.current) {
        cursorTextRef.current.textContent = `${e.latlng.lat.toFixed(4)}°, ${e.latlng.lng.toFixed(4)}°`;
      }
    });

    mapRef.current = map;
    setMapReady(true);

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(mapContainerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      boundaryLayerGroupRef.current = null;
      mainWellsLayerRef.current = null;
      hotspotLayerGroupRef.current = null;
      setMapReady(false);
    };
  }, [hasActivated]);

  // Update cursor directly on DOM node (NEVER via dynamic className on mapContainerRef!)
  useEffect(() => {
    const el = mapContainerRef.current;
    if (el) el.style.cursor = isPickingHotspot ? "crosshair" : "";
  }, [isPickingHotspot]);

  // Invalidate map size when returning to this tab or switching sub-views / sidebar
  useEffect(() => {
    if (!isVisible || workspaceView !== "map" || !mapRef.current) return;
    const t = setTimeout(() => {
      mapRef.current?.invalidateSize({ animate: false });
    }, 80);
    return () => clearTimeout(t);
  }, [isVisible, workspaceView, sidebarCollapsed]);

  // Swap basemap cleanly with automatic fallback
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const cfg = BASEMAPS[basemapId] || BASEMAPS.esriTopo;
    let errorCount = 0;
    let fallbackApplied = false;

    const tileOpts: L.TileLayerOptions = {
      attribution: cfg.attr,
      maxZoom: cfg.maxZoom,
      maxNativeZoom: cfg.maxNativeZoom,
      crossOrigin: true
    };
    if (cfg.subdomains) tileOpts.subdomains = cfg.subdomains.split(",");

    const layer = L.tileLayer(cfg.url, tileOpts);
    layer.on("tileerror", () => {
      errorCount++;
      if (!fallbackApplied && errorCount >= 4) {
        fallbackApplied = true;
        const fbKey = basemapId === "osm" ? "carto" : "osm";
        const fb = BASEMAPS[fbKey];
        const fbOpts: L.TileLayerOptions = {
          attribution: fb.attr,
          maxZoom: fb.maxZoom,
          maxNativeZoom: fb.maxNativeZoom,
          crossOrigin: true
        };
        if (fb.subdomains) fbOpts.subdomains = fb.subdomains.split(",");
        if (tileLayerRef.current && map.hasLayer(tileLayerRef.current)) {
          map.removeLayer(tileLayerRef.current);
        }
        const fbLayer = L.tileLayer(fb.url, fbOpts).addTo(map);
        fbLayer.bringToBack();
        tileLayerRef.current = fbLayer;
      }
    });

    layer.addTo(map);
    layer.bringToBack();
    tileLayerRef.current = layer;
  }, [basemapId, mapReady]);

  // Render Shared Shapefile Boundary Overlays
  useEffect(() => {
    const grp = boundaryLayerGroupRef.current;
    if (!grp || !mapReady) return;
    grp.clearLayers();
    if (!showBoundaryOverlays || !sharedLayers || sharedLayers.length === 0) return;

    const renderer = canvasRendererRef.current || undefined;
    sharedLayers.forEach((layer) => {
      if (!layer.visible || !layer.geoJson) return;
      try {
        L.geoJSON(layer.geoJson as any, {
          interactive: false,
          style: {
            renderer,
            color: layer.strokeColor || "#c2410c",
            weight: 1.5,
            opacity: 0.72,
            dashArray: "4, 4",
            fillOpacity: 0
          }
        }).addTo(grp);
      } catch {
        // skip invalid layer
      }
    });
  }, [sharedLayers, showBoundaryOverlays, mapReady]);

  // Render light background main dataset dots ONLY while picking a point on the map
  useEffect(() => {
    const grp = mainWellsLayerRef.current;
    if (!grp || !mapReady) return;
    grp.clearLayers();
    if (!isPickingHotspot || mainDatasetPoints.length === 0) return;

    const renderer = canvasRendererRef.current || undefined;
    const step = mainDatasetPoints.length > 2500 ? Math.ceil(mainDatasetPoints.length / 2500) : 1;
    for (let i = 0; i < mainDatasetPoints.length; i += step) {
      const pt = mainDatasetPoints[i];
      const tier = !isNaN(pt._val) ? matchTierRange(pt._val, customRanges) : null;
      L.circleMarker([pt._lat, pt._lon], {
        renderer,
        radius: 3.5,
        color: "#0f172a",
        weight: 0.6,
        fillColor: tier?.color || "#64748b",
        fillOpacity: 0.75,
        interactive: false
      }).addTo(grp);
    }
  }, [isPickingHotspot, mainDatasetPoints, customRanges, mapReady]);

  // Fit bounds helper for a list of Hot Spot groups
  const fitMapToGroups = useCallback((groups: HotspotGroup[]) => {
    const map = mapRef.current;
    if (!map || groups.length === 0) return;
    const coords: [number, number][] = [];
    groups.forEach((g) => {
      coords.push([g.identifiedHotspot.lat, g.identifiedHotspot.lon]);
      g.gridSamples.forEach((gs) => coords.push([gs.lat, gs.lon]));
    });
    if (coords.length > 1) {
      const bounds = L.latLngBounds(coords);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [55, 55], maxZoom: 14 });
      }
    } else if (coords.length === 1) {
      map.flyTo(coords[0], 13, { duration: 0.7 });
    }
  }, []);

  const fitMapToSingleItem = useCallback((point: HotspotPoint, result: HotspotPlumeResult) => {
    const map = mapRef.current;
    if (!map) return;
    const coords: [number, number][] = [[point.lat, point.lng]];
    result.samplingLocations.forEach((pt) => coords.push([pt._lat, pt._lon]));
    if (coords.length > 1) {
      map.fitBounds(L.latLngBounds(coords), { padding: [70, 70], maxZoom: 15 });
    } else {
      map.flyTo([point.lat, point.lng], 13, { duration: 0.7 });
    }
  }, []);

  const fitMapSmart = useCallback(() => {
    if (plotAllHotspots && filteredBatchItems.length > 1) {
      setIsHotspotFocused(false);
      fitMapToGroups(filteredBatchItems.map((i) => i.group));
      return;
    }
    if (focusedItem) {
      fitMapToSingleItem(focusedItem.point, focusedItem.result);
      return;
    }
    if (mainDatasetPoints.length > 1 && mapRef.current) {
      const coords = mainDatasetPoints.slice(0, 5000).map((p) => [p._lat, p._lon] as [number, number]);
      mapRef.current.fitBounds(L.latLngBounds(coords), { padding: [45, 45], maxZoom: 12 });
    }
  }, [plotAllHotspots, filteredBatchItems, focusedItem, mainDatasetPoints, fitMapToGroups, fitMapToSingleItem]);

  // Select a Hot Spot group
  const selectHotspotGroup = useCallback(
    (
      group: HotspotGroup,
      paramOverride?: string,
      paramListOverride?: HotspotSheetParamInfo[],
      skipZoom: boolean = false,
      isUserSelection: boolean = true
    ) => {
      const targetParam = paramOverride || activeParam;
      const pList = paramListOverride || hotspotSheetParams;
      const paramInfo = pList.find((p) => p.paramKey === targetParam || p.colName === targetParam);
      const { maxDistKm } = buildHotspotGroupPlumePoints(group, targetParam, paramInfo?.colName);

      setSelectedHotspotGroupId(group.id);
      setIsHotspotFocused(isUserSelection);
      setAdhocHotspotPoint(null);
      setSelectedCellHighlight(null);
      setSelectedDirectionHighlight(null);
      setIsPickingHotspot(false);

      if (autoFitPerSpot) {
        const idealRadius = Math.min(25, Math.max(2, Math.ceil((maxDistKm + 0.5) * 2) / 2));
        const idealGrid = Math.min(8, Math.max(0.5, Math.ceil((Math.max(maxDistKm, 1.5) / 2) * 2) / 2));
        setHotspotRadiusKm(idealRadius);
        setHotspotGridSizeKm(idealGrid);
      }

      if (!skipZoom && mapRef.current) {
        const coords: [number, number][] = [
          [group.identifiedHotspot.lat, group.identifiedHotspot.lon],
          ...group.gridSamples.map((gs) => [gs.lat, gs.lon] as [number, number])
        ];
        if (coords.length > 1) {
          mapRef.current.fitBounds(L.latLngBounds(coords), { padding: [70, 70], maxZoom: 15 });
        } else {
          mapRef.current.flyTo([group.identifiedHotspot.lat, group.identifiedHotspot.lon], 13, { duration: 0.7 });
        }
      }
    },
    [activeParam, hotspotSheetParams, autoFitPerSpot]
  );

  // Map Click Handler for ad-hoc Hot Spot picking
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const onClick = (e: L.LeafletMouseEvent) => {
      if (!isPickingHotspot) return;
      const clickedLat = e.latlng.lat;
      const clickedLng = e.latlng.lng;
      let nearest: any = null;
      let minDist = Infinity;

      for (let i = 0; i < mainDatasetPoints.length; i++) {
        const d = mainDatasetPoints[i];
        const dist = fastHaversineKm(clickedLat, clickedLng, d._lat, d._lon);
        if (dist < minDist) {
          minDist = dist;
          nearest = d;
        }
      }

      setSelectedHotspotGroupId(null);
      setPlotAllHotspots(false);
      setIsPickingHotspot(false);
      setInspectorTab("detail");

      if (nearest && minDist <= 1.2) {
        const raw = nearest._raw || {};
        const loc = String(raw.Location || raw.Village || raw.District || raw.Block || `Sample #${nearest._index + 1}`);
        setAdhocHotspotPoint({
          lat: nearest._lat,
          lng: nearest._lon,
          val: nearest._val,
          locationName: loc,
          sampleId: `Sample #${nearest._index + 1}`,
          state: raw.State || raw["State/ UT"] || "",
          district: raw.District || "",
          block: raw.Block || raw["Block/ Taluka"] || "",
          source: raw.Source || raw["Source of Sample"] || ""
        });
        showToast?.(`Hot Spot pinned to ${loc}`, "success");
      } else {
        setAdhocHotspotPoint({
          lat: clickedLat,
          lng: clickedLng,
          locationName: `Picked (${clickedLat.toFixed(4)}, ${clickedLng.toFixed(4)})`
        });
        showToast?.(`Hot Spot pinned at ${clickedLat.toFixed(4)}, ${clickedLng.toFixed(4)}`, "success");
      }
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [isPickingHotspot, mainDatasetPoints, mapReady, showToast]);

  // Auto-Max peak Hot Spot detection from main dataset
  const autoDetectPeakHotspot = useCallback(() => {
    if (mainDatasetPoints.length === 0) {
      showToast?.("Upload a Hot Spot Sheet or load a main dataset first.", "warning");
      return;
    }
    let maxVal = -Infinity;
    let peak: any = null;
    for (let i = 0; i < mainDatasetPoints.length; i++) {
      const pt = mainDatasetPoints[i];
      if (!isNaN(pt._val) && pt._val > maxVal) {
        maxVal = pt._val;
        peak = pt;
      }
    }
    if (!peak || maxVal === -Infinity) {
      showToast?.(`No valid ${activeParam} values found in main dataset.`, "warning");
      return;
    }
    const raw = peak._raw || {};
    const loc = String(raw.Location || raw.Village || raw.District || raw.Block || `Sample #${peak._index + 1}`);
    setSelectedHotspotGroupId(null);
    setPlotAllHotspots(false);
    setIsPickingHotspot(false);
    setAdhocHotspotPoint({
      lat: peak._lat,
      lng: peak._lon,
      val: maxVal,
      locationName: loc,
      sampleId: `Sample #${peak._index + 1}`,
      state: raw.State || "",
      district: raw.District || "",
      block: raw.Block || "",
      source: raw.Source || ""
    });
    setWorkspaceView("map");
    setInspectorTab("detail");
    mapRef.current?.flyTo([peak._lat, peak._lon], 13, { duration: 0.8 });
    showToast?.(`Peak ${activeParam} Hot Spot: ${loc} (${maxVal} ${SECTOR_PARAM_CONFIG[activeParam]?.unit || ""})`, "success");
  }, [mainDatasetPoints, activeParam, showToast]);

  // Upload Hot Spot Data Sheet (Excel / CSV with merged-cell support)
  const handleHotspotSheetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      let wb: XLSX.WorkBook;
      if (isCsv) {
        const text = await file.text();
        wb = XLSX.read(text, { type: "string" });
      } else {
        const buf = await file.arrayBuffer();
        wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      }
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      if (!firstSheet) {
        showToast?.("Uploaded Hot Spot file has no readable worksheet.", "error");
        return;
      }
      const parsed = parseHotspotWorksheet(firstSheet, file.name);
      if (parsed.groups.length === 0) {
        showToast?.(parsed.warnings[0] || "No valid Hot Spot groups detected in uploaded sheet.", "error");
        return;
      }

      setHotspotSheetGroups(parsed.groups);
      setHotspotSheetParams(parsed.detectedParams);
      setHotspotSheetFileName(file.name);
      setSelectedParams([]); // Show all uploaded parameters by default
      setSelectedStates([]); // Show all states by default
      setSpreadFilter("All");
      setSeverityFilter("All");
      setSearchTerm("");
      setPlotAllHotspots(true);
      setUseSheetGridOnly(true);
      setAdhocHotspotPoint(null);
      setAutoFitPerSpot(false);
      setHotspotRadiusKm(5.0);
      setHotspotGridSizeKm(2.0);

      let targetParam = activeParam;
      if (parsed.defaultParamKey && SECTOR_PARAM_CONFIG[parsed.defaultParamKey]) {
        targetParam = parsed.defaultParamKey;
        setActiveParam(parsed.defaultParamKey);
      }

      const isMulti = parsed.groups.length > 1;
      selectHotspotGroup(parsed.groups[0], targetParam, parsed.detectedParams, isMulti, !isMulti);
      setWorkspaceView("map");
      if (isMulti) {
        setTimeout(() => fitMapToGroups(parsed.groups), 60);
      }

      const paramNames = parsed.detectedParams.map((p) => p.paramKey).join(", ") || targetParam;
      showToast?.(
        `Plotted ${parsed.groups.length} Hot Spot(s) & ${parsed.totalGridSamples} Grid Samples (${paramNames}) — 5 km circle & 2×2 km grid`,
        "success"
      );
    } catch (err: any) {
      showToast?.("Failed to parse Hot Spot sheet: " + (err?.message || "Unknown error"), "error");
    } finally {
      e.target.value = "";
    }
  };

  // Manual Add Hot Spot handler
  const handleManualHotspotSave = useCallback(
    (group: HotspotGroup, paramKey: string) => {
      const cfg = SECTOR_PARAM_CONFIG[paramKey] || { b1: 45, b2: 100, unit: "mg/L" };
      const nextParams: HotspotSheetParamInfo[] = hotspotSheetParams.some((p) => p.paramKey === paramKey)
        ? hotspotSheetParams
        : [
            ...hotspotSheetParams,
            { colName: paramKey, paramKey, label: `${paramKey} (${cfg.unit})`, unit: cfg.unit, b1: cfg.b1, b2: cfg.b2 }
          ];
      const nextGroups = [...hotspotSheetGroups, group];
      setHotspotSheetGroups(nextGroups);
      setHotspotSheetParams(nextParams);
      if (!hotspotSheetFileName) setHotspotSheetFileName("Manual Hot Spot Entry");
      setSelectedParams([]);
      setSelectedStates([]);
      setSpreadFilter("All");
      setSeverityFilter("All");
      setPlotAllHotspots(true);
      setUseSheetGridOnly(true);
      if (SECTOR_PARAM_CONFIG[paramKey]) setActiveParam(paramKey);
      selectHotspotGroup(group, paramKey, nextParams, nextGroups.length > 1, nextGroups.length <= 1);
      setWorkspaceView("map");
      if (nextGroups.length > 1) {
        setTimeout(() => fitMapToGroups(nextGroups), 60);
      }
      showToast?.(`Added Hot Spot #${group.hotspotNo} (${group.location}, ${paramKey}) with ${group.gridSamples.length} Grid Samples`, "success");
    },
    [hotspotSheetGroups, hotspotSheetParams, hotspotSheetFileName, selectHotspotGroup, fitMapToGroups, showToast]
  );

  // Toggle parameter in multi-select filter
  const toggleParamSelection = useCallback(
    (paramKey: string) => {
      setIsHotspotFocused(false);
      setSelectedParams((prev) => {
        const next = prev.includes(paramKey) ? prev.filter((p) => p !== paramKey) : [...prev, paramKey];
        const nextGroups = hotspotSheetGroups.filter((g) => {
          const gp = g.primaryParam || activeParam;
          const matchP = next.length === 0 || next.includes(gp);
          const matchS = selectedStates.length === 0 || selectedStates.includes(g.state || "Unspecified");
          return matchP && matchS;
        });
        if (nextGroups.length > 0 && plotAllHotspots) {
          setTimeout(() => fitMapToGroups(nextGroups), 40);
        }
        return next;
      });
    },
    [hotspotSheetGroups, activeParam, selectedStates, plotAllHotspots, fitMapToGroups]
  );

  // Toggle state in multi-select filter
  const toggleStateSelection = useCallback(
    (stateName: string) => {
      setIsHotspotFocused(false);
      setSelectedStates((prev) => {
        const next = prev.includes(stateName) ? prev.filter((s) => s !== stateName) : [...prev, stateName];
        const nextGroups = hotspotSheetGroups.filter((g) => {
          const gp = g.primaryParam || activeParam;
          const matchP = selectedParams.length === 0 || selectedParams.includes(gp);
          const matchS = next.length === 0 || next.includes(g.state || "Unspecified");
          return matchP && matchS;
        });
        if (nextGroups.length > 0 && plotAllHotspots) {
          setTimeout(() => fitMapToGroups(nextGroups), 40);
        }
        return next;
      });
    },
    [hotspotSheetGroups, activeParam, selectedParams, plotAllHotspots, fitMapToGroups]
  );

  // Delete single Hot Spot group
  const handleRemoveHotspotGroup = useCallback(
    (groupId: string) => {
      setHotspotSheetGroups((prev) => {
        const next = prev.filter((g) => g.id !== groupId);
        if (selectedHotspotGroupId === groupId) {
          setSelectedHotspotGroupId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
    },
    [selectedHotspotGroupId]
  );

  // Render ALL Hot Spots simultaneously (or single focused spot) onto Leaflet map
  // Matching CGWB Diagram: 5 km Outer Circle + 4x4 Dashed 2x2 km Grid + Parameter-Colored Donut HS + 5-Pointed Star Sampling Markers
  useEffect(() => {
    const map = mapRef.current;
    const layerGrp = hotspotLayerGroupRef.current;
    if (!map || !layerGrp || !mapReady) return;

    layerGrp.clearLayers();

    type RenderItem = {
      group: HotspotGroup | null;
      point: HotspotPoint;
      paramKey: string;
      paramUnit: string;
      b1: number;
      b2: number;
      result: HotspotPlumeResult;
      decay: HotspotDecayStats;
    };

    let itemsToRender: RenderItem[] = [];
    if (plotAllHotspots && filteredBatchItems.length > 0 && !adhocHotspotPoint) {
      itemsToRender = [
        ...filteredBatchItems.filter((it) => it.group.id !== focusedItem?.group?.id),
        ...filteredBatchItems.filter((it) => it.group.id === focusedItem?.group?.id)
      ];
    } else if (focusedItem) {
      itemsToRender = [focusedItem];
    }

    if (itemsToRender.length === 0) return;

    const isMultiMode = itemsToRender.length > 1;
    const renderer = canvasRendererRef.current || undefined;
    const placedBoxes: { minX: number; minY: number; maxX: number; maxY: number }[] = [];

    itemsToRender.forEach(({ point }) => {
      const px = map.latLngToContainerPoint([point.lat, point.lng]);
      placedBoxes.push({ minX: px.x - 22, minY: px.y - 22, maxX: px.x + 22, maxY: px.y + 22 });
    });

    const tryPlaceBadge = (lat: number, lng: number, w: number, h: number): boolean => {
      const px = map.latLngToContainerPoint([lat, lng]);
      const cand = { minX: px.x - w / 2, minY: px.y - h / 2, maxX: px.x + w / 2, maxY: px.y + h / 2 };
      const collides = placedBoxes.some(
        (b) => cand.minX - 6 < b.maxX && cand.maxX + 6 > b.minX && cand.minY - 6 < b.maxY && cand.maxY + 6 > b.minY
      );
      if (!collides) placedBoxes.push(cand);
      return !collides;
    };

    itemsToRender.forEach(({ group, point, paramKey, paramUnit, b1, b2, result, decay }) => {
      const isFocused = !isMultiMode || (group ? group.id === focusedItem?.group?.id : true);
      const centerCoord: [number, number] = [point.lat, point.lng];
      const pCol = getHotspotParamColor(paramKey);
      const itemRanges: CustomTierRange[] = [
        { min: 0, max: b1, label: "Desirable", color: "#10b981", unit: paramUnit, visible: true },
        { min: b1, max: b2, label: "Permissible", color: "#f59e0b", unit: paramUnit, visible: true },
        { min: b2, max: 1000000, label: "Unsuitable", color: "#ef4444", unit: paramUnit, visible: true }
      ];

      // 1. Optional Contamination Footprint Halo
      if (showRiskHalos && (decay.footprintKm > 0 || decay.hsExceedsLimit)) {
        const haloRadiusM = Math.max(decay.footprintKm, 0.45) * 1000;
        L.circle(centerCoord, {
          renderer,
          radius: haloRadiusM,
          color: pCol.primary,
          weight: 0,
          fillColor: pCol.primary,
          fillOpacity: isFocused ? 0.13 : 0.08,
          interactive: false
        }).addTo(layerGrp);
      }

      // 2. 4x4 Dashed Square Grid (Default 2 x 2 km cells)
      //    When gridColorByPL is enabled:
      //      - Average > Permissible Limit (PL)  -> slight reddish fill
      //      - Average <= Permissible Limit (PL) -> light green fill
      //      - No sample in cell (count === 0)   -> transparent
      if (showGridCells) {
        const plLabel = formatPermissibleLimit(paramKey, b1, b2, paramUnit);
        result.gridCells.forEach((cell) => {
          const isSelected = isFocused && selectedCellHighlight === cell.id;
          const hasSamples = cell.count > 0;
          const cellAbovePL = hasSamples && isAbovePermissibleLimit(cell.avgVal, paramKey, b1, b2);
          const polyCoords = cell.poly.geometry.coordinates[0].map((c: [number, number]) => [c[1], c[0]]);

          let cellFillColor = "transparent";
          let cellFillOpacity = 0;
          if (gridColorByPL) {
            if (!hasSamples) {
              cellFillColor = "transparent";
              cellFillOpacity = isSelected ? 0.14 : 0;
            } else if (cellAbovePL) {
              cellFillColor = "#ef4444"; // Slight reddish tint for Avg > PL
              cellFillOpacity = isSelected ? 0.34 : isFocused ? 0.22 : 0.17;
            } else {
              cellFillColor = "#22c55e"; // Light green tint for Avg <= PL
              cellFillOpacity = isSelected ? 0.32 : isFocused ? 0.2 : 0.15;
            }
          } else if (isSelected) {
            cellFillColor = pCol.primary;
            cellFillOpacity = 0.2;
          }

          const cellLayer = L.polygon(polyCoords, {
            renderer,
            color: isSelected ? "#4f46e5" : pCol.primary,
            weight: isSelected ? 2.6 : isFocused ? 1.5 : 1.1,
            opacity: isFocused ? 0.85 : 0.62,
            dashArray: "5, 5",
            fillColor: cellFillColor,
            fillOpacity: cellFillOpacity
          });

          const cellStatusHtml = !hasSamples
            ? `<span style="color:#64748b;">No Sample (Transparent)</span>`
            : cellAbovePL
            ? `<span style="color:#dc2626;font-weight:700;">Avg &gt; PL (${plLabel})</span>`
            : `<span style="color:#15803d;font-weight:700;">Avg &le; PL (${plLabel})</span>`;

          cellLayer.bindTooltip(
            `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:10.5px;"><b>${paramKey}</b> · ${point.hotspotNo ? `HS #${point.hotspotNo} (${point.locationName}) · ` : ""}<b>${cell.label}</b><br/>Samples: <b>${cell.count}</b> | Avg: <b>${hasSamples ? `${cell.avgVal.toFixed(2)} ${paramUnit}` : "—"}</b><br/>${cellStatusHtml}</div>`,
            { sticky: true }
          );
          cellLayer.addTo(layerGrp);
        });
      }

      // 3. Outer Circular Buffer Envelope (Default 5 km radius — matching attached diagram)
      if (showBufferCircle) {
        L.circle(centerCoord, {
          renderer,
          radius: result.radiusKm * 1000,
          color: pCol.dark,
          weight: isFocused ? 2.4 : 1.7,
          opacity: isFocused ? 0.95 : 0.78,
          fillColor: pCol.primary,
          fillOpacity: isFocused ? 0.035 : 0.018
        }).addTo(layerGrp);
      }

      // 4. Dimension Callouts (5 km radius + 2 km cell height — matching attached diagram)
      if (showDimensionLabels && (isFocused || itemsToRender.length <= 3)) {
        // Horizontal radius dimension line to West edge (5 km)
        const westEdge = fastDestination(point.lng, point.lat, result.radiusKm, 270);
        const southRef = fastDestination(point.lng, point.lat, result.radiusKm * 1.04, 180)[1];
        L.polyline(
          [
            [southRef, westEdge[0]],
            [southRef, point.lng]
          ],
          { color: pCol.dark, weight: 1.6, dashArray: "4, 3", interactive: false }
        ).addTo(layerGrp);
        L.polyline(
          [
            [point.lat, westEdge[0]],
            [southRef, westEdge[0]]
          ],
          { color: pCol.dark, weight: 1.1, dashArray: "3, 3", opacity: 0.65, interactive: false }
        ).addTo(layerGrp);
        const midRLng = (westEdge[0] + point.lng) / 2;
        if (tryPlaceBadge(southRef, midRLng, 58, 20)) {
          L.marker([southRef, midRLng], {
            interactive: false,
            icon: L.divIcon({
              className: "",
              html: `<div style="background:#ffffff;color:${pCol.dark};font-size:10px;font-weight:800;padding:1px 6px;border-radius:4px;border:1.5px solid ${pCol.dark};white-space:nowrap;font-family:'Plus Jakarta Sans',sans-serif;text-align:center;">${result.radiusKm.toFixed(1)} km</div>`,
              iconSize: [56, 20],
              iconAnchor: [28, 10]
            })
          }).addTo(layerGrp);
        }

        // Bottom-right grid cell height callout (2 km)
        const cellKm = result.gridCellSizeKm;
        const rightLng = fastDestination(point.lng, point.lat, 2 * cellKm, 90)[0];
        const cellTopLat = fastDestination(point.lng, point.lat, cellKm, 180)[1];
        const cellBotLat = fastDestination(point.lng, point.lat, 2 * cellKm, 180)[1];
        const tickLng = fastDestination(rightLng, cellTopLat, Math.max(0.18, cellKm * 0.14), 90)[0];
        L.polyline(
          [
            [cellTopLat, tickLng],
            [cellBotLat, tickLng]
          ],
          { color: pCol.primary, weight: 1.8, interactive: false }
        ).addTo(layerGrp);
        const midG = (cellTopLat + cellBotLat) / 2;
        if (tryPlaceBadge(midG, tickLng, 56, 20)) {
          L.marker([midG, tickLng], {
            interactive: false,
            icon: L.divIcon({
              className: "",
              html: `<div style="background:#ffffff;color:${pCol.primary};font-size:10px;font-weight:800;padding:1px 6px;border-radius:4px;border:1.5px solid ${pCol.primary};white-space:nowrap;font-family:'Plus Jakarta Sans',sans-serif;text-align:center;">${cellKm.toFixed(1)} km</div>`,
              iconSize: [54, 20],
              iconAnchor: [-4, 10]
            })
          }).addTo(layerGrp);
        }
      }

      // 5. Surrounding Grid Samples as 5-Pointed Stars (★) matching attached diagram + Optional Connectors
      if (showGridSamples && result.samplingLocations.length > 0) {
        const allowConn = showConnectors && result.samplingLocations.length <= 60;
        result.samplingLocations.forEach((pt) => {
          const isSecPeak =
            decay.secondaryPeakSample &&
            !isNaN(pt._val) &&
            pt._val === decay.secondaryPeakSample.val &&
            Math.abs(pt._dist - decay.secondaryPeakSample.distKm) < 0.01;

          if (allowConn) {
            L.polyline([centerCoord, [pt._lat, pt._lon]], {
              renderer,
              color: isSecPeak ? "#dc2626" : pCol.primary,
              weight: isSecPeak ? 1.8 : isFocused ? 1.2 : 0.9,
              opacity: isSecPeak ? 0.85 : isFocused ? 0.55 : 0.35,
              dashArray: "3, 4",
              interactive: false
            }).addTo(layerGrp);
          }

          const tier = !isNaN(pt._val) ? matchTierRange(pt._val, itemRanges) : null;
          const isExceed = !isNaN(pt._val) && isAbovePermissibleLimit(pt._val, paramKey, b1, b2);
          let starFill = "#94a3b8";
          let starStroke = "#1e293b";
          if (starColorMode === "pl") {
            if (isNaN(pt._val)) {
              starFill = "#94a3b8";
              starStroke = "#334155";
            } else if (isExceed) {
              starFill = "#dc2626"; // Above PL -> Red inner star
              starStroke = "#7f1d1d";
            } else {
              starFill = "#16a34a"; // Below/Within PL -> Green inner star
              starStroke = "#14532d";
            }
          } else {
            starFill = availableParamCounts.length <= 1 ? "#ea580c" : pCol.primary;
            starStroke = "#1e293b";
          }
          const starSize = isSecPeak ? 22 : isFocused ? 19 : 16;

          const starMarker = L.marker([pt._lat, pt._lon], {
            zIndexOffset: isSecPeak ? 420 : isFocused ? 360 : 300,
            icon: L.divIcon({
              className: "",
              html: buildStarSvgHtml(starFill, starStroke, starSize, Boolean(isSecPeak || (starColorMode === "parameter" && isExceed))),
              iconSize: [starSize, starSize],
              iconAnchor: [starSize / 2, starSize / 2]
            })
          });

          const raw = pt._raw || pt;
          const locName = raw.Location || raw.Village || raw.District || `Sample #${pt._index + 1}`;
          const idNo = pt._identificationNo || raw.IdentificationNo || raw["Identification No."] || "";
          const srcName = pt._source || raw.Source || "";

          starMarker.bindTooltip(
            `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:10.5px;"><b>★ ${locName}</b>${idNo ? ` (${idNo})` : ""}${isSecPeak ? ` · <span style="color:#dc2626;font-weight:800;">PEAK &gt; HS</span>` : ""}<br/><span style="color:${pCol.primary};font-weight:700;">${paramKey}</span>: <b>${!isNaN(pt._val) ? `${pt._val} ${paramUnit}` : "—"}</b>${isExceed ? ` · <span style="color:#dc2626;font-weight:700;">Exceeds BIS</span>` : ""} · ${pt._dist.toFixed(2)} km</div>`,
            { direction: "top", offset: [0, -8] }
          );

          starMarker.bindPopup(
            `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;min-width:210px;padding:8px 10px;">
              <div style="font-weight:800;color:#0f172a;margin-bottom:3px;">★ ${pt._isGridSample ? "Grid Sample" : "Monitoring Well"}: ${locName}</div>
              ${point.hotspotNo ? `<div style="color:#64748b;font-size:10px;margin-bottom:2px;">Hot Spot #${point.hotspotNo}: <b>${point.locationName}</b> (<b style="color:${pCol.primary};">${paramKey}</b>)</div>` : ""}
              ${idNo ? `<div style="color:#475569;font-size:10px;margin-bottom:4px;">ID: <b>${idNo}</b>${srcName ? ` · ${srcName}` : ""}</div>` : ""}
              ${!isNaN(pt._val) ? `<div>${paramKey}: <b style="color:${isExceed ? "#dc2626" : "#059669"};">${pt._val} ${paramUnit}</b>${tier ? ` (${tier.label})` : ""}</div>` : ""}
              <div>Dist from HS: <b>${pt._dist.toFixed(2)} km</b> · Bearing: <b>${Math.round(pt._bearing)}°</b></div>
              <div style="color:#64748b;font-size:10px;margin-top:2px;">Lat ${pt._lat.toFixed(5)}, Lon ${pt._lon.toFixed(5)}</div>
            </div>`
          );
          starMarker.addTo(layerGrp);
        });
      }

      // 6. Identified Hot Spot Center Donut/Ring Marker displaying Parameter Symbol (e.g. U, NO3, F, As)
      const symbolText = (paramKey || "HS").slice(0, 4);
      const outerSz = isFocused ? 40 : 34;
      const innerSz = isFocused ? 24 : 21;
      const symbolFontPx =
        symbolText.length <= 1
          ? isFocused
            ? 11
            : 9.5
          : symbolText.length === 2
          ? isFocused
            ? 9.5
            : 8.5
          : symbolText.length === 3
          ? isFocused
            ? 8
            : 7
          : isFocused
          ? 7
          : 6.2;
      const ringBg = availableParamCounts.length <= 1 ? "#fde68a" : pCol.ringFill;
      const ringBorder = pCol.primary;
      const shadowCss = isFocused ? `0 2px 12px ${pCol.primary}80` : `0 2px 7px ${pCol.primary}55`;

      const hsMarker = L.marker(centerCoord, {
        zIndexOffset: isFocused ? 680 : 520,
        icon: L.divIcon({
          className: "",
          html: `<div style="width:${outerSz}px;height:${outerSz}px;border-radius:9999px;background:${ringBg};border:2.5px solid ${ringBorder};box-shadow:${shadowCss};display:flex;align-items:center;justify-content:center;">
            <div style="width:${innerSz}px;height:${innerSz}px;border-radius:9999px;background:#ffffff;border:1.5px solid #1e3a5f;display:flex;align-items:center;justify-content:center;color:${pCol.dark};font-size:${symbolFontPx}px;font-weight:900;font-family:'Plus Jakarta Sans',sans-serif;line-height:1;letter-spacing:-0.02em;">${symbolText}</div>
          </div>`,
          iconSize: [outerSz, outerSz],
          iconAnchor: [outerSz / 2, outerSz / 2]
        })
      });

      hsMarker.bindTooltip(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:10.5px;"><b>${point.hotspotNo ? `#${point.hotspotNo} ` : ""}${point.locationName || "Hot Spot"}</b> · <span style="color:${pCol.primary};font-weight:800;">${paramKey}</span>${point.val !== undefined && !isNaN(point.val) ? `: <b>${point.val} ${paramUnit}</b>` : ""}<br/>Spread: <b>${decay.spreadPattern}</b> (${decay.spreadDirectionLabel}) · ${result.totalWellsInEnvelope} grid pts</div>`,
        { direction: "top", offset: [0, -17] }
      );

      hsMarker.bindPopup(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;padding:8px 10px;min-width:225px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px;">
            <span style="font-weight:800;color:#b91c1c;">IDENTIFIED HOT SPOT${point.hotspotNo ? ` #${point.hotspotNo}` : ""}</span>
            <span style="background:${pCol.softBg};color:${pCol.dark};border:1px solid ${pCol.primary};font-weight:800;font-size:10px;padding:1px 6px;border-radius:4px;">${paramKey}</span>
          </div>
          <div style="font-weight:700;color:#0f172a;">${point.locationName || "Selected"}</div>
          ${point.sampleId ? `<div style="font-size:10px;color:#475569;">ID: <b>${point.sampleId}</b>${point.source ? ` · ${point.source}` : ""}</div>` : ""}
          ${point.district || point.state ? `<div style="font-size:10px;color:#475569;">${[point.block, point.district, point.state].filter(Boolean).join(", ")}</div>` : ""}
          ${point.val !== undefined && !isNaN(point.val) ? `<div style="margin-top:4px;">HS ${paramKey}: <b style="color:${pCol.primary};">${point.val} ${paramUnit}</b> <span style="color:#64748b;font-size:10px;">(BIS: ${b2})</span></div>` : ""}
          <div>Grid Mean: <b>${!isNaN(decay.meanGridVal) ? `${decay.meanGridVal.toFixed(1)} ${paramUnit}` : "—"}</b> (${decay.exceedGridCount}/${decay.validGridCount} &gt; limit)</div>
          <div style="margin-top:3px;">Spread Pattern: <b style="color:${decay.spreadPattern === "Multi-Directional" ? "#dc2626" : decay.spreadPattern === "Unidirectional" ? "#b45309" : "#059669"};">${decay.spreadPattern}</b></div>
          <div style="font-size:10px;color:#475569;">${decay.spreadDirectionLabel}</div>
          <div style="font-size:10px;color:#64748b;margin-top:3px;">Lat ${point.lat.toFixed(5)}, Lon ${point.lng.toFixed(5)}</div>
        </div>`
      );

      if (group && isMultiMode) {
        hsMarker.on("click", () => {
          selectHotspotGroup(group, paramKey, undefined, true);
          setInspectorTab("detail");
        });
      }
      hsMarker.addTo(layerGrp);

      // Optional non-overlapping floating Hot Spot Name + Parameter Label
      if (showSpotLabels && point.locationName) {
        const lblLat = fastDestination(point.lng, point.lat, Math.max(0.45, result.radiusKm * 0.28), 0)[1];
        if (tryPlaceBadge(lblLat, point.lng, 134, 20)) {
          L.marker([lblLat, point.lng], {
            interactive: false,
            zIndexOffset: 480,
            icon: L.divIcon({
              className: "",
              html: `<div style="background:rgba(15,23,42,0.88);color:#ffffff;padding:2px 6px;border-radius:4px;border-left:3px solid ${pCol.primary};font-size:9.5px;font-weight:700;white-space:nowrap;font-family:'Plus Jakarta Sans',sans-serif;text-align:center;max-width:146px;overflow:hidden;text-overflow:ellipsis;">${paramKey} · ${point.locationName}</div>`,
              iconSize: [134, 18],
              iconAnchor: [67, 9]
            })
          }).addTo(layerGrp);
        }
      }

      // 7. Dominant Plume Spread Vector Arrow (for Unidirectional / Multi-Directional spots)
      if (
        showPlumeVectorArrow &&
        result.dominantDirection &&
        result.dominantDirection.totalCount > 0 &&
        decay.spreadPattern !== "Localised"
      ) {
        const dom = result.dominantDirection;
        const tip = fastDestination(point.lng, point.lat, result.radiusKm * 0.85, dom.midBearing);
        L.polyline([centerCoord, [tip[1], tip[0]]], {
          color: pCol.primary,
          weight: isFocused ? 3.2 : 2.2,
          opacity: isFocused ? 0.92 : 0.72,
          dashArray: "7, 4",
          interactive: false
        }).addTo(layerGrp);
        if (tryPlaceBadge(tip[1], tip[0], 124, 22)) {
          L.marker([tip[1], tip[0]], {
            interactive: false,
            zIndexOffset: isFocused ? 580 : 440,
            icon: L.divIcon({
              className: "",
              html: `<div style="background:${pCol.primary};color:#ffffff;padding:2px 7px;border-radius:5px;font-size:9.5px;font-weight:800;border:1.5px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.3);white-space:nowrap;font-family:'Plus Jakarta Sans',sans-serif;text-align:center;">${decay.spreadPattern === "Multi-Directional" ? "MULTI: " : ""}${dom.direction} (${dom.midBearing}°)</div>`,
              iconSize: [122, 20],
              iconAnchor: [61, 10]
            })
          }).addTo(layerGrp);
        }
      }
    });
  }, [
    mapReady,
    plotAllHotspots,
    filteredBatchItems,
    focusedItem,
    adhocHotspotPoint,
    showRiskHalos,
    showGridCells,
    showBufferCircle,
    showDimensionLabels,
    showGridSamples,
    showConnectors,
    showSpotLabels,
    showPlumeVectorArrow,
    selectedCellHighlight,
    gridColorByPL,
    starColorMode,
    availableParamCounts.length,
    selectHotspotGroup
  ]);

  // Export Comprehensive 6-Sheet Styled Excel Report
  const handleExportExcel = useCallback(() => {
    const exportItems =
      filteredBatchItems.length > 0
        ? filteredBatchItems
        : focusedItem
        ? [
            {
              group: focusedItem.group,
              point: focusedItem.point,
              paramKey: focusedItem.paramKey,
              paramUnit: focusedItem.paramUnit,
              b1: focusedItem.b1,
              b2: focusedItem.b2,
              result: focusedItem.result,
              decay: focusedItem.decay,
              radiusKm: focusedItem.result.radiusKm,
              gridCellSizeKm: focusedItem.result.gridCellSizeKm
            }
          ]
        : [];

    if (exportItems.length === 0) {
      showToast?.("No Hot Spot data available to export.", "warning");
      return;
    }

    const wb = XLSX.utils.book_new();
    const gs = activeBatchSummary.globalStats;
    const plottedParams = Array.from(new Set(exportItems.map((i) => i.paramKey)));
    const plottedStates = Array.from(new Set(exportItems.map((i) => i.point.state || "Unspecified")));

    // Sheet 1: Executive Summary
    const execRows = [
      { Metric: "Parameters Included", Value: plottedParams.join(", ") || activeParam },
      { Metric: "States / UTs Included", Value: selectedStates.length > 0 ? selectedStates.join(", ") : `All (${plottedStates.length})` },
      { Metric: "Source Data Sheet", Value: hotspotSheetFileName || "Main Dataset / Ad-hoc" },
      { Metric: "Circle Buffer Radius (km)", Value: autoFitPerSpot ? "Auto-Fit per Spot" : Number(hotspotRadiusKm.toFixed(1)) },
      { Metric: "Grid Cell Size (km)", Value: autoFitPerSpot ? "Auto-Fit per Spot" : `${hotspotGridSizeKm.toFixed(1)} × ${hotspotGridSizeKm.toFixed(1)} km (4×4)` },
      { Metric: "Total Hot Spots Analyzed", Value: exportItems.length },
      { Metric: "Total Surrounding Grid Samples", Value: gs.totalGridSamples || exportItems.reduce((s, i) => s + i.result.totalWellsInEnvelope, 0) },
      { Metric: "Spread Pattern: Localised", Value: gs.localisedCount },
      { Metric: "Spread Pattern: Unidirectional", Value: gs.unidirectionalCount },
      { Metric: "Spread Pattern: Multi-Directional", Value: gs.multiDirectionalCount },
      { Metric: "Critical Severity Hot Spots", Value: gs.criticalCount },
      { Metric: "Secondary Off-Center Peak Hot Spots", Value: gs.secondaryPeakCount },
      { Metric: "Grid Samples Exceeding BIS Limit (%)", Value: Number(gs.gridExceedPct.toFixed(1)) },
      { Metric: "Max Contamination Footprint (km)", Value: Number(gs.maxFootprintKm.toFixed(2)) }
    ];
    const wsExec = XLSX.utils.json_to_sheet(execRows);
    ensureSheetJSNumbers(wsExec, 1);
    XLSX.utils.book_append_sheet(wb, wsExec, "Executive_Summary");

    // Sheet 2: All Hotspots Summary (with Parameter, Spread Pattern & Spread Comment)
    const hsSummaryRows = exportItems.map((it) => ({
      "Hot Spot No.": it.point.hotspotNo || "1",
      "Identification No.": it.point.sampleId || "",
      "State/ UT": it.point.state || "",
      District: it.point.district || "",
      "Block/ Taluka": it.point.block || "",
      "Hot Spot Location": it.point.locationName || "",
      "Latitude (DD)": Number(it.point.lat.toFixed(5)),
      "Longitude (DD)": Number(it.point.lng.toFixed(5)),
      Source: it.point.source || "",
      Parameter: it.paramKey,
      Unit: it.paramUnit,
      "BIS Permissible Limit (PL)": it.b2,
      "HS Value": !isNaN(it.decay.hsVal) ? Number(it.decay.hsVal.toFixed(2)) : "",
      "Grid Samples (n)": it.result.totalWellsInEnvelope,
      "Grid Min": !isNaN(it.decay.minGridVal) ? Number(it.decay.minGridVal.toFixed(2)) : "",
      "Grid Mean": !isNaN(it.decay.meanGridVal) ? Number(it.decay.meanGridVal.toFixed(2)) : "",
      "Grid Max": !isNaN(it.decay.maxGridVal) ? Number(it.decay.maxGridVal.toFixed(2)) : "",
      "Grid > PL (n)": it.decay.exceedGridCount,
      "Grid > PL (%)": Number(it.decay.exceedGridPct.toFixed(1)),
      "Spread Pattern": it.decay.spreadPattern,
      "Spread Directions": it.decay.spreadDirectionLabel,
      "Angular Span (°)": it.decay.angularSpanDeg,
      "Spread Analysis Comment": `[${it.decay.spreadPattern}${
        it.decay.spreadPattern !== "Localised" ? ` — ${it.decay.spreadDirectionLabel}` : ""
      }] ${it.decay.spreadRationale}`,
      "Dominant Direction": it.result.dominantDirection
        ? `${it.result.dominantDirection.direction} (${it.result.dominantDirection.midBearing}°)`
        : "N/A",
      "Attenuation (%)": it.decay.attenuationPct !== null ? Number(it.decay.attenuationPct.toFixed(1)) : "",
      "Decay Slope (/km)": it.decay.decaySlopePerKm !== null ? Number(it.decay.decaySlopePerKm.toFixed(2)) : "",
      "Footprint (km)": Number(it.decay.footprintKm.toFixed(2)),
      "Plume Classification": it.decay.classification,
      Severity: it.decay.severity
    }));
    const wsHs = XLSX.utils.json_to_sheet(hsSummaryRows);
    ensureSheetJSNumbers(wsHs, 1);
    XLSX.utils.book_append_sheet(wb, wsHs, "All_Hotspots_Summary");

    // Sheet 3: Parameter-Wise Summary
    if (activeBatchSummary.paramSummaries.length > 0) {
      const paramRows = activeBatchSummary.paramSummaries.map((ps) => ({
        Parameter: ps.paramKey,
        Unit: ps.unit,
        "BIS Desirable (b1)": ps.b1,
        "BIS Permissible (b2)": ps.b2,
        "Hot Spots (n)": ps.hotspotCount,
        "Grid Samples (n)": ps.totalGridSamples,
        "Grid > PL (n)": ps.gridExceedCount,
        "Grid > PL (%)": Number(ps.gridExceedPct.toFixed(1)),
        Localised: ps.localisedCount,
        Unidirectional: ps.unidirectionalCount,
        "Multi-Directional": ps.multiDirectionalCount,
        "Mean HS": !isNaN(ps.meanHsVal) ? Number(ps.meanHsVal.toFixed(2)) : "",
        "Max HS": !isNaN(ps.maxHsVal) ? Number(ps.maxHsVal.toFixed(2)) : "",
        "Max Grid": !isNaN(ps.maxGridVal) ? Number(ps.maxGridVal.toFixed(2)) : "",
        "States Affected": ps.statesAffected.join(", ")
      }));
      const wsParam = XLSX.utils.json_to_sheet(paramRows);
      ensureSheetJSNumbers(wsParam, 1);
      XLSX.utils.book_append_sheet(wb, wsParam, "Parameter_Wise_Summary");
    }

    // Sheet 4: State-Wise Summary
    if (activeBatchSummary.stateSummaries.length > 0) {
      const stateRows = activeBatchSummary.stateSummaries.map((st) => ({
        "State/ UT": st.state,
        "Parameters Affected": st.parametersAffected.join(", "),
        "Hot Spots (n)": st.hotspotCount,
        "Grid Samples (n)": st.totalGridSamples,
        "HS > PL (n)": st.hsExceedCount,
        "Grid > PL (n)": st.gridExceedCount,
        "Grid > PL (%)": Number(st.gridExceedPct.toFixed(1)),
        Localised: st.localisedCount,
        Unidirectional: st.unidirectionalCount,
        "Multi-Directional": st.multiDirectionalCount,
        "Mean HS": !isNaN(st.meanHsVal) ? Number(st.meanHsVal.toFixed(2)) : "",
        "Max HS": !isNaN(st.maxHsVal) ? Number(st.maxHsVal.toFixed(2)) : "",
        "Max Grid": !isNaN(st.maxGridVal) ? Number(st.maxGridVal.toFixed(2)) : "",
        "Max Footprint (km)": Number(st.maxFootprintKm.toFixed(2)),
        "Critical Spots": st.criticalCount,
        "Secondary Peak Spots": st.secondaryPeakCount
      }));
      const wsSt = XLSX.utils.json_to_sheet(stateRows);
      ensureSheetJSNumbers(wsSt, 1);
      XLSX.utils.book_append_sheet(wb, wsSt, "State_Wise_Summary");
    }

    // Sheet 5: All Grid Samples Detail (12-column HS Import Format + Spatial & Spread Comments)
    const detailRows: any[] = [];
    exportItems.forEach((it) => {
      const hsAbovePL = !isNaN(it.decay.hsVal) && isAbovePermissibleLimit(it.decay.hsVal, it.paramKey, it.b1, it.b2);
      const spreadComment = `[${it.decay.spreadPattern}${
        it.decay.spreadPattern !== "Localised" ? ` — ${it.decay.spreadDirectionLabel}` : ""
      }] ${it.decay.spreadRationale}`;
      detailRows.push({
        "Hot Spot No.": it.point.hotspotNo || "1",
        "Type of Sample in grid": "Identified Hot Spot",
        "Identification No.": it.point.sampleId || "",
        "State/ UT": it.point.state || "",
        District: it.point.district || "",
        "Block/ Taluka": it.point.block || "",
        Location: it.point.locationName || "",
        "Longitude (DD)": Number(it.point.lng.toFixed(5)),
        "Latitude (DD)": Number(it.point.lat.toFixed(5)),
        "Source of Sample": it.point.source || "",
        Parameter: it.paramKey,
        "Parameter Unit": it.paramUnit,
        "Parameter Values": !isNaN(it.decay.hsVal) ? Number(it.decay.hsVal.toFixed(2)) : "",
        "Distance from HS (km)": 0,
        "Bearing (°)": 0,
        "PL Status": !isNaN(it.decay.hsVal) ? (hsAbovePL ? "Above PL" : "Below / Within PL") : "",
        "Spread Pattern": it.decay.spreadPattern,
        "Spread Analysis Comment": spreadComment
      });
      it.result.samplingLocations.forEach((pt, idx) => {
        const raw = pt._raw || pt;
        const v = Number(pt._val);
        const ptAbovePL = !isNaN(v) && isAbovePermissibleLimit(v, it.paramKey, it.b1, it.b2);
        detailRows.push({
          "Hot Spot No.": it.point.hotspotNo || "1",
          "Type of Sample in grid": pt._isGridSample ? "Grid Sample" : "Monitoring Well",
          "Identification No.": pt._identificationNo || raw.IdentificationNo || raw["Identification No."] || "",
          "State/ UT": raw.State || it.point.state || "",
          District: raw.District || it.point.district || "",
          "Block/ Taluka": raw.Block || it.point.block || "",
          Location: raw.Location || raw.Village || `Grid Sample ${idx + 1}`,
          "Longitude (DD)": Number(pt._lon.toFixed(5)),
          "Latitude (DD)": Number(pt._lat.toFixed(5)),
          "Source of Sample": pt._source || raw.Source || "",
          Parameter: it.paramKey,
          "Parameter Unit": it.paramUnit,
          "Parameter Values": !isNaN(v) ? Number(v.toFixed(2)) : "",
          "Distance from HS (km)": Number(pt._dist.toFixed(3)),
          "Bearing (°)": Math.round(pt._bearing),
          "PL Status": !isNaN(v) ? (ptAbovePL ? "Above PL" : "Below / Within PL") : "",
          "Spread Pattern": it.decay.spreadPattern,
          "Spread Analysis Comment": ""
        });
      });
    });
    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    ensureSheetJSNumbers(wsDetail, 1);
    XLSX.utils.book_append_sheet(wb, wsDetail, "All_Grid_Samples_Detail");

    // Sheet 6: Active 4x4 Grid Matrix
    if (focusedItem) {
      const gridRows = focusedItem.result.gridCells.map((c) => {
        const cellAbovePL = c.count > 0 && isAbovePermissibleLimit(c.avgVal, focusedItem.paramKey, focusedItem.b1, focusedItem.b2);
        return {
          "Hot Spot": focusedItem.point.locationName || "",
          Parameter: focusedItem.paramKey,
          "Cell ID": c.id,
          "Grid Label": c.label,
          Direction: c.directionCode,
          "Dist from HS (km)": Number(c.distFromHS.toFixed(2)),
          "Samples (n)": c.count,
          [`Mean (${focusedItem.paramUnit})`]: c.count > 0 ? Number(c.avgVal.toFixed(2)) : "",
          [`Max (${focusedItem.paramUnit})`]: c.count > 0 ? Number(c.maxVal.toFixed(2)) : "",
          "Grid Cell PL Status": c.count === 0 ? "No Sample (Transparent)" : cellAbovePL ? "Above PL (Reddish)" : "Below / Within PL (Light Green)",
          "Exceedance (%)": Number(c.exceedanceRate.toFixed(1)),
          "Spread Pattern": focusedItem.decay.spreadPattern,
          "Spread Analysis Comment": focusedItem.decay.spreadRationale
        };
      });
      const wsGrid = XLSX.utils.json_to_sheet(gridRows);
      ensureSheetJSNumbers(wsGrid, 1);
      XLSX.utils.book_append_sheet(wb, wsGrid, "Active_4x4_Grid_Matrix");
    }

    const paramSlug = plottedParams.length === 1 ? plottedParams[0] : "MultiParam";
    void downloadStyledSheetJSWorkbook(
      wb,
      `HotSpot_Analysis_${paramSlug}_${new Date().toISOString().slice(0, 10)}.xlsx`
    )
      .then(() => showToast?.("Exported full 6-sheet formatted Hot Spot Excel Report.", "success"))
      .catch((err) => {
        console.error("Hot Spot Excel export error:", err);
        showToast?.("Failed to generate Hot Spot Excel Report.", "error");
      });
  }, [
    filteredBatchItems,
    focusedItem,
    activeParam,
    activeBatchSummary,
    hotspotSheetFileName,
    selectedStates,
    autoFitPerSpot,
    hotspotRadiusKm,
    hotspotGridSizeKm,
    showToast
  ]);

  // Export GeoJSON of all plotted Hot Spots
  const handleExportGeoJson = useCallback(() => {
    const items =
      plotAllHotspots && filteredBatchItems.length > 0 && !adhocHotspotPoint
        ? filteredBatchItems
        : focusedItem
        ? [focusedItem]
        : [];
    if (items.length === 0) {
      showToast?.("No Hot Spot geometry available to export.", "warning");
      return;
    }
    const fc = buildHotspotsGeoJson(items, activeParam);
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HotSpots_${activeParam}_${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.(`Exported GeoJSON with ${fc.features.length} spatial features.`, "success");
  }, [plotAllHotspots, filteredBatchItems, adhocHotspotPoint, focusedItem, activeParam, showToast]);

  // Flatten all grid samples for the Ledger "All Grid Samples" sub-table
  const flattenedLedgerSamples = useMemo(() => {
    const rows: {
      hotspotNo: string;
      hotspotLocation: string;
      sampleType: string;
      identificationNo: string;
      state: string;
      district: string;
      block: string;
      location: string;
      source: string;
      paramKey: string;
      paramUnit: string;
      b1: number;
      b2: number;
      lat: number;
      lon: number;
      val: number;
      distKm: number;
      bearing: number;
      groupId: string;
    }[] = [];

    filteredBatchItems.forEach((it) => {
      rows.push({
        hotspotNo: it.group.hotspotNo,
        hotspotLocation: it.group.location,
        sampleType: "Identified Hot Spot",
        identificationNo: it.group.identificationNo,
        state: it.group.state,
        district: it.group.district,
        block: it.group.block,
        location: it.group.location,
        source: it.group.source,
        paramKey: it.paramKey,
        paramUnit: it.paramUnit,
        b1: it.b1,
        b2: it.b2,
        lat: it.point.lat,
        lon: it.point.lng,
        val: it.decay.hsVal,
        distKm: 0,
        bearing: 0,
        groupId: it.group.id
      });
      it.result.samplingLocations.forEach((pt, idx) => {
        const raw = pt._raw || pt;
        rows.push({
          hotspotNo: it.group.hotspotNo,
          hotspotLocation: it.group.location,
          sampleType: pt._isGridSample ? "Grid Sample" : "Monitoring Well",
          identificationNo: pt._identificationNo || raw.IdentificationNo || raw["Identification No."] || "",
          state: raw.State || it.group.state || "",
          district: raw.District || it.group.district || "",
          block: raw.Block || it.group.block || "",
          location: raw.Location || raw.Village || `Grid Sample ${idx + 1}`,
          source: pt._source || raw.Source || "",
          paramKey: it.paramKey,
          paramUnit: it.paramUnit,
          b1: it.b1,
          b2: it.b2,
          lat: pt._lat,
          lon: pt._lon,
          val: pt._val,
          distKm: pt._dist,
          bearing: pt._bearing,
          groupId: it.group.id
        });
      });
    });
    return rows;
  }, [filteredBatchItems]);

  // Distance-Decay Scatter Chart Data (SVG)
  const scatterData = useMemo(() => {
    const sourceItems =
      scatterScope === "all" && filteredBatchItems.length > 0
        ? filteredBatchItems
        : focusedItem
        ? [focusedItem]
        : [];
    const pts: { x: number; y: number; isHs: boolean; label: string; hsNo: string; color: string; paramKey: string; unit: string }[] = [];
    sourceItems.forEach((it, idx) => {
      const col = getHotspotParamColor(it.paramKey).primary;
      if (!isNaN(it.decay.hsVal)) {
        pts.push({
          x: 0,
          y: it.decay.hsVal,
          isHs: true,
          label: `HS #${it.point.hotspotNo || idx + 1} (${it.paramKey}) ${it.point.locationName || ""}`,
          hsNo: it.point.hotspotNo || String(idx + 1),
          color: col,
          paramKey: it.paramKey,
          unit: it.paramUnit
        });
      }
      it.result.samplingLocations.forEach((s) => {
        if (!isNaN(s._val)) {
          const raw = s._raw || s;
          pts.push({
            x: s._dist,
            y: s._val,
            isHs: false,
            label: `${raw.Location || raw.Village || "Grid"} [${it.paramKey}] (${s._dist.toFixed(2)} km)`,
            hsNo: it.point.hotspotNo || String(idx + 1),
            color: col,
            paramKey: it.paramKey,
            unit: it.paramUnit
          });
        }
      });
    });
    const refItem = sourceItems[0];
    const cfg = SECTOR_PARAM_CONFIG[refItem?.paramKey || activeParam] || { b1: 45, b2: 100, unit: "mg/L" };
    const b1 = refItem?.b1 ?? cfg.b1;
    const b2 = refItem?.b2 ?? cfg.b2;
    const unit = refItem?.paramUnit ?? cfg.unit;
    const maxX = Math.max(2, ...pts.map((p) => p.x)) * 1.08;
    const maxY = Math.max(b2 * 1.15, ...pts.map((p) => p.y), 10) * 1.08;

    let trend: { y0: number; yMax: number; r: number | null; slope: number | null } | null = null;
    if (pts.length >= 2) {
      const n = pts.length;
      const mx = pts.reduce((s, p) => s + p.x, 0) / n;
      const my = pts.reduce((s, p) => s + p.y, 0) / n;
      let num = 0;
      let dx2 = 0;
      let dy2 = 0;
      pts.forEach((p) => {
        num += (p.x - mx) * (p.y - my);
        dx2 += (p.x - mx) ** 2;
        dy2 += (p.y - my) ** 2;
      });
      if (dx2 > 1e-6) {
        const slope = num / dx2;
        const intercept = my - slope * mx;
        const r = dy2 > 1e-6 ? num / Math.sqrt(dx2 * dy2) : null;
        trend = { y0: intercept, yMax: intercept + slope * maxX, r, slope };
      }
    }
    const distinctParams = Array.from(new Set(sourceItems.map((i) => i.paramKey)));
    return { pts, maxX, maxY, b1, b2, unit, trend, distinctParams };
  }, [scatterScope, filteredBatchItems, focusedItem, activeParam]);

  const gStats = activeBatchSummary.globalStats;
  const activeUnit = focusedItem?.paramUnit || SECTOR_PARAM_CONFIG[activeParam]?.unit || "mg/L";

  return (
    <div className="sector-console w-full h-[calc(100vh-140px)] min-h-[700px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 flex flex-col select-none">
      <input
        ref={hotspotFileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleHotspotSheetUpload}
        className="hidden"
      />

      {/* Zone 1: Command & Workspace Switcher Header */}
      <header className="shrink-0 bg-white border-b border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-30 relative">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            title={sidebarCollapsed ? "Show Hot Spot Inspector" : "Collapse Inspector"}
          >
            {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-rose-600" /> : <ChevronLeft className="w-3.5 h-3.5 text-rose-600" />}
            <span>{sidebarCollapsed ? "Inspector" : "Hide Panel"}</span>
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Parameter Multi-Select Popover (when HS sheet is loaded) OR single Parameter selector (for ad-hoc mode) */}
          {availableParamCounts.length > 0 ? (
            <div className="relative flex items-center gap-1.5">
              {/* Parameters Multi-Select Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setOpenFilterMenu((m) => (m === "params" ? null : "params"))}
                  className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    selectedParams.length > 0
                      ? "bg-indigo-50 text-indigo-800 border-indigo-300"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200"
                  }`}
                >
                  <span>
                    {selectedParams.length === 0
                      ? `Parameters: All (${availableParamCounts.length})`
                      : selectedParams.length <= 2
                      ? `Params: ${selectedParams.join(", ")}`
                      : `Params: ${selectedParams.length} selected`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>
                {openFilterMenu === "params" && (
                  <div className="absolute left-0 top-9 z-50 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-2 space-y-1">
                    <div className="flex items-center justify-between px-1.5 pb-1 border-b border-slate-100 text-[10.5px]">
                      <span className="font-bold text-slate-700">Select Parameter(s)</span>
                      <button
                        onClick={() => {
                          setSelectedParams([]);
                          setIsHotspotFocused(false);
                          if (plotAllHotspots && hotspotSheetGroups.length > 0) {
                            const nextG =
                              selectedStates.length === 0
                                ? hotspotSheetGroups
                                : hotspotSheetGroups.filter((g) => selectedStates.includes(g.state || "Unspecified"));
                            setTimeout(() => fitMapToGroups(nextG), 40);
                          }
                        }}
                        className="text-indigo-600 font-semibold hover:underline"
                      >
                        Show All
                      </button>
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-0.5 custom-scrollbar">
                      {availableParamCounts.map((p) => {
                        const checked = selectedParams.length === 0 || selectedParams.includes(p.paramKey);
                        const explicitlyChecked = selectedParams.includes(p.paramKey);
                        return (
                          <label
                            key={p.paramKey}
                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[11px] transition-colors ${
                              explicitlyChecked ? "bg-indigo-50/70 font-semibold" : "hover:bg-slate-50"
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={explicitlyChecked}
                                onChange={() => toggleParamSelection(p.paramKey)}
                                className="w-3.5 h-3.5 accent-indigo-600"
                              />
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                              <span className={checked ? "text-slate-900 truncate" : "text-slate-400 truncate"}>
                                {p.paramKey} ({p.unit})
                              </span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">{p.count}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* States Multi-Select Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setOpenFilterMenu((m) => (m === "states" ? null : "states"))}
                  className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    selectedStates.length > 0
                      ? "bg-rose-50 text-rose-800 border-rose-300"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200"
                  }`}
                >
                  <span>
                    {selectedStates.length === 0
                      ? `States: All (${availableStateCounts.length})`
                      : selectedStates.length === 1
                      ? `State: ${selectedStates[0]}`
                      : `States: ${selectedStates.length} selected`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>
                {openFilterMenu === "states" && (
                  <div className="absolute left-0 top-9 z-50 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-2 space-y-1">
                    <div className="flex items-center justify-between px-1.5 pb-1 border-b border-slate-100 text-[10.5px]">
                      <span className="font-bold text-slate-700">Select State(s) / UT</span>
                      <button
                        onClick={() => {
                          setSelectedStates([]);
                          setIsHotspotFocused(false);
                          if (plotAllHotspots && hotspotSheetGroups.length > 0) {
                            const nextG =
                              selectedParams.length === 0
                                ? hotspotSheetGroups
                                : hotspotSheetGroups.filter((g) => selectedParams.includes(g.primaryParam || activeParam));
                            setTimeout(() => fitMapToGroups(nextG), 40);
                          }
                        }}
                        className="text-rose-600 font-semibold hover:underline"
                      >
                        Show All
                      </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar">
                      {availableStateCounts.map((s) => {
                        const explicitlyChecked = selectedStates.includes(s.state);
                        return (
                          <label
                            key={s.state}
                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[11px] transition-colors ${
                              explicitlyChecked ? "bg-rose-50/70 font-semibold" : "hover:bg-slate-50"
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={explicitlyChecked}
                                onChange={() => toggleStateSelection(s.state)}
                                className="w-3.5 h-3.5 accent-rose-600"
                              />
                              <span className="text-slate-800 truncate">{s.state}</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">{s.count}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
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
          )}

          {/* 3-View Workspace Switcher: Spatial Map | Analytics | Batch Table */}
          <div className="inline-flex h-8 bg-slate-100 rounded-lg p-0.5 border border-slate-200 shrink-0">
            <button
              onClick={() => {
                setOpenFilterMenu(null);
                setWorkspaceView("map");
              }}
              className={`px-2.5 rounded-md text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                workspaceView === "map" ? "bg-rose-600 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Spatial Map</span>
            </button>
            <button
              onClick={() => {
                setOpenFilterMenu(null);
                setWorkspaceView("analytics");
              }}
              className={`px-2.5 rounded-md text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                workspaceView === "analytics" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics & Spread</span>
            </button>
            <button
              onClick={() => {
                setOpenFilterMenu(null);
                setWorkspaceView("ledger");
              }}
              className={`px-2.5 rounded-md text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                workspaceView === "ledger" ? "bg-indigo-600 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Batch Table</span>
            </button>
          </div>
        </div>

        {/* Right Primary Actions */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              setOpenFilterMenu(null);
              hotspotFileInputRef.current?.click();
            }}
            className="h-8 px-3 rounded-lg text-[11px] font-semibold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            title="Upload 12-column multi-parameter or CGWB Hot Spot Excel/CSV sheet"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload HS Sheet</span>
          </button>

          <button
            onClick={() => {
              setOpenFilterMenu(null);
              setIsAddHotspotModalOpen(true);
            }}
            className="h-8 px-2.5 rounded-lg text-[11px] font-semibold bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Spot</span>
          </button>

          <button
            onClick={() => downloadHotspotSheetTemplate(activeParam)}
            className="h-8 px-2.5 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
            title="Download 12-column multi-parameter Hot Spot Excel template"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Template</span>
          </button>

          {workspaceView === "map" && (
            <>
              <button
                onClick={fitMapSmart}
                className="h-8 px-2 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0"
                title="Fit map to all plotted Hot Spots"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Fit All</span>
              </button>

              <select
                value={basemapId}
                onChange={(e) => setBasemapId(e.target.value as keyof typeof BASEMAPS)}
                aria-label="Basemap Layer"
                className="h-8 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold rounded-lg px-2 border border-slate-200 outline-none cursor-pointer"
              >
                <option value="esriTopo">ESRI Topo</option>
                <option value="osm">OpenStreetMap</option>
                <option value="esriPhysical">ESRI Physical</option>
                <option value="esriTerrain">ESRI Terrain</option>
                <option value="esriSatellite">ESRI Satellite</option>
                <option value="googleStreets">Google Streets</option>
                <option value="googleHybrid">Google Hybrid</option>
                <option value="carto">Carto Light</option>
              </select>
            </>
          )}

          <button
            onClick={handleExportExcel}
            className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            title="Export 6-sheet formatted Hot Spot Analysis Excel workbook"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          <button
            onClick={handleExportGeoJson}
            className="h-8 px-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
            title="Export GeoJSON for QGIS / ArcGIS"
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
            <span>GeoJSON</span>
          </button>
        </div>
      </header>

      {/* Zone 2: Docked Split Console */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Left Docked Inspector */}
        {!sidebarCollapsed && (
          <aside className="w-[356px] xl:w-[384px] shrink-0 relative z-20 bg-white border-r border-slate-200 flex flex-col min-h-0">
            <nav className="shrink-0 grid grid-cols-3 border-b border-slate-200 bg-slate-50 p-1 gap-1">
              {[
                { id: "spots" as const, label: `Hot Spots (${filteredBatchItems.length})`, icon: Target },
                { id: "layers" as const, label: "Plume & Layers", icon: Layers },
                { id: "detail" as const, label: "Active Detail", icon: BarChart3 }
              ].map((t) => {
                const Icon = t.icon;
                const active = inspectorTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setInspectorTab(t.id)}
                    className={`h-8 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                      active
                        ? "bg-white text-rose-700 border border-slate-200"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar">
              {/* INSPECTOR TAB 1: HOT SPOTS BROWSER & DATASET TOOLS */}
              {inspectorTab === "spots" && (
                <div className="space-y-3">
                  {/* Simultaneous Plot Mode Switch */}
                  {hotspotSheetGroups.length > 0 && (
                    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                        <span className="font-semibold text-slate-800 truncate" title={hotspotSheetFileName}>
                          {hotspotSheetFileName || "Loaded Hot Spots"}
                        </span>
                        <button
                          onClick={() => {
                            setHotspotSheetGroups([]);
                            setHotspotSheetParams([]);
                            setHotspotSheetFileName("");
                            setSelectedHotspotGroupId(null);
                            setIsHotspotFocused(false);
                            setSelectedParams([]);
                            setSelectedStates([]);
                            setSpreadFilter("All");
                            setSeverityFilter("All");
                            setSearchTerm("");
                            setOpenFilterMenu(null);
                            setAdhocHotspotPoint(null);
                          }}
                          className="text-[10.5px] font-semibold text-rose-600 hover:underline shrink-0"
                        >
                          Clear All
                        </button>
                      </div>

                      {hotspotSheetGroups.length > 1 && (
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 inline-flex h-7 bg-white rounded-md p-0.5 border border-slate-200">
                            <button
                              onClick={() => {
                                setPlotAllHotspots(true);
                                setIsHotspotFocused(false);
                                setAdhocHotspotPoint(null);
                                fitMapToGroups(filteredBatchItems.map((i) => i.group));
                              }}
                              className={`flex-1 rounded text-[10.5px] font-semibold transition-colors ${
                                plotAllHotspots ? "bg-rose-600 text-white" : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              All Spots ({filteredBatchItems.length})
                            </button>
                            <button
                              onClick={() => {
                                setPlotAllHotspots(false);
                                setIsHotspotFocused(true);
                                if (focusedItem) fitMapToSingleItem(focusedItem.point, focusedItem.result);
                              }}
                              className={`flex-1 rounded text-[10.5px] font-semibold transition-colors ${
                                !plotAllHotspots ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Single Spot
                            </button>
                          </div>
                          {plotAllHotspots && (
                            <button
                              onClick={() => {
                                setIsHotspotFocused(false);
                                fitMapToGroups(filteredBatchItems.map((i) => i.group));
                              }}
                              className="h-7 px-2 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-[10.5px] font-semibold text-indigo-700 shrink-0"
                            >
                              Fit All
                            </button>
                          )}
                        </div>
                      )}

                      {/* Parameter-Wise Multi-Select Chips */}
                      {availableParamCounts.length > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <span>Parameters (multi-select)</span>
                            {selectedParams.length > 0 && (
                              <button
                                onClick={() => {
                                  setSelectedParams([]);
                                  setIsHotspotFocused(false);
                                }}
                                className="text-indigo-600 hover:underline normal-case font-semibold"
                              >
                                All
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {availableParamCounts.map((p) => {
                              const isActive = selectedParams.length === 0 || selectedParams.includes(p.paramKey);
                              const isPicked = selectedParams.includes(p.paramKey);
                              return (
                                <button
                                  key={p.paramKey}
                                  onClick={() => toggleParamSelection(p.paramKey)}
                                  className={`px-2 py-0.5 rounded-md text-[10.5px] font-semibold border flex items-center gap-1 transition-colors tabular-nums ${
                                    isPicked
                                      ? "bg-slate-900 text-white border-slate-900"
                                      : isActive
                                      ? "bg-white text-slate-800 border-slate-200 hover:border-slate-400"
                                      : "bg-slate-100 text-slate-400 border-slate-200 opacity-70 hover:opacity-100"
                                  }`}
                                  title={`Toggle ${p.paramKey} (${p.unit}) Hot Spots`}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: p.color }}
                                  />
                                  <span>{p.paramKey}</span>
                                  <span className={isPicked ? "text-slate-300" : "text-slate-400"}>({p.count})</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* State-Wise Multi-Select Chips */}
                      {availableStateCounts.length > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <span>States / UTs (multi-select)</span>
                            {selectedStates.length > 0 && (
                              <button
                                onClick={() => {
                                  setSelectedStates([]);
                                  setIsHotspotFocused(false);
                                }}
                                className="text-rose-600 hover:underline normal-case font-semibold"
                              >
                                All ({availableStateCounts.length})
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar pr-0.5">
                            {availableStateCounts.map((s) => {
                              const isPicked = selectedStates.includes(s.state);
                              const isDim = selectedStates.length > 0 && !isPicked;
                              return (
                                <button
                                  key={s.state}
                                  onClick={() => toggleStateSelection(s.state)}
                                  className={`px-2 py-0.5 rounded-md text-[10.5px] font-semibold border transition-colors tabular-nums ${
                                    isPicked
                                      ? "bg-rose-600 text-white border-rose-600"
                                      : isDim
                                      ? "bg-slate-100 text-slate-400 border-slate-200 opacity-75 hover:opacity-100"
                                      : "bg-white text-slate-700 border-slate-200 hover:border-rose-300"
                                  }`}
                                >
                                  {s.state} <span className={isPicked ? "text-rose-100" : "text-slate-400"}>({s.count})</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Search, Spread Pattern, Severity, Sort Controls */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Search location, district, ID, param..."
                          className="w-full h-7 pl-8 pr-2 text-[11px] bg-white border border-slate-200 rounded-md outline-none focus:border-rose-400"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          value={spreadFilter}
                          onChange={(e) => setSpreadFilter(e.target.value as "All" | HotspotSpreadPattern)}
                          className="h-7 px-1.5 text-[10.5px] font-medium bg-white border border-slate-200 rounded-md outline-none"
                        >
                          <option value="All">All Spreads</option>
                          <option value="Localised">Localised</option>
                          <option value="Unidirectional">Unidirectional</option>
                          <option value="Multi-Directional">Multi-Directional</option>
                        </select>

                        <select
                          value={severityFilter}
                          onChange={(e) => setSeverityFilter(e.target.value)}
                          className="h-7 px-1.5 text-[10.5px] font-medium bg-white border border-slate-200 rounded-md outline-none"
                        >
                          <option value="All">All Severities</option>
                          <option value="Critical">Critical Only</option>
                          <option value="High">High Only</option>
                          <option value="Moderate">Moderate</option>
                          <option value="Low">Low / Within Limit</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-between gap-1.5">
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="flex-1 h-7 px-1.5 text-[10.5px] font-medium bg-white border border-slate-200 rounded-md outline-none"
                        >
                          <option value="no_asc">Sort: Hot Spot #</option>
                          <option value="hs_desc">Sort: HS Value ↓</option>
                          <option value="exceed_desc">Sort: Grid Exceed % ↓</option>
                          <option value="footprint_desc">Sort: Footprint km ↓</option>
                        </select>
                        {filteredBatchItems.length > 1 && (
                          <div className="inline-flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => {
                                const idx = filteredBatchItems.findIndex((i) => i.group.id === focusedItem?.group?.id);
                                const prev = idx <= 0 ? filteredBatchItems.length - 1 : idx - 1;
                                selectHotspotGroup(filteredBatchItems[prev].group, filteredBatchItems[prev].paramKey);
                              }}
                              className="h-7 px-2 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-[10.5px] font-semibold text-slate-700"
                            >
                              Prev
                            </button>
                            <button
                              onClick={() => {
                                const idx = filteredBatchItems.findIndex((i) => i.group.id === focusedItem?.group?.id);
                                const next = idx < 0 || idx >= filteredBatchItems.length - 1 ? 0 : idx + 1;
                                selectHotspotGroup(filteredBatchItems[next].group, filteredBatchItems[next].paramKey);
                              }}
                              className="h-7 px-2 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-[10.5px] font-semibold text-slate-700"
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Scrollable Hot Spot Group Cards */}
                  {filteredBatchItems.length > 0 ? (
                    <div className="space-y-1.5">
                      {filteredBatchItems.map((it) => {
                        const isSel = it.group.id === focusedItem?.group?.id && !adhocHotspotPoint;
                        const pCol = getHotspotParamColor(it.paramKey);
                        return (
                          <div
                            key={it.group.id}
                            className={`rounded-lg border transition-colors ${
                              isSel ? "border-rose-500 bg-rose-50/40" : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-start gap-1 p-2">
                              <button
                                onClick={() => {
                                  selectHotspotGroup(it.group, it.paramKey);
                                  setWorkspaceView("map");
                                }}
                                className="flex-1 text-left min-w-0 tabular-nums"
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="flex items-center gap-1.5 min-w-0">
                                    <span
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold text-white shrink-0"
                                      style={{ backgroundColor: pCol.primary }}
                                    >
                                      {it.paramKey}
                                    </span>
                                    <span className="text-[11.5px] font-bold text-slate-900 truncate">
                                      #{it.group.hotspotNo} · {it.group.location}
                                    </span>
                                  </span>
                                  <span className="text-[11px] font-bold shrink-0" style={{ color: pCol.primary }}>
                                    {!isNaN(it.decay.hsVal) ? `${it.decay.hsVal} ${it.paramUnit}` : "—"}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                  {[it.group.district, it.group.state].filter(Boolean).join(", ") || it.group.identificationNo}
                                </div>
                                <div className="flex items-center justify-between gap-2 text-[10px] mt-1.5 pt-1 border-t border-slate-100">
                                  <span className={`px-1.5 py-0.5 rounded border text-[9.5px] font-bold ${spreadPatternBadgeClass(it.decay.spreadPattern)}`}>
                                    {it.decay.spreadPattern}
                                  </span>
                                  <span className="text-slate-600 shrink-0">
                                    {it.result.totalWellsInEnvelope} ★ · <b>{it.decay.exceedGridPct.toFixed(0)}%</b> &gt; BIS
                                  </span>
                                </div>
                              </button>
                              <button
                                onClick={() => handleRemoveHotspotGroup(it.group.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 shrink-0"
                                title="Remove this Hot Spot"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : hotspotSheetGroups.length === 0 ? (
                    <div className="p-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center space-y-3">
                      <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                        <Target className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-slate-900">Upload a Hot Spot Data Sheet</div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Supports the 12-column multi-parameter HS sheet (<b>Parameter</b>, <b>Parameter Unit</b>, <b>Parameter Values</b>) and legacy CGWB sheets — renders <b>5 km</b> circles, <b>2×2 km</b> dashed grids, donut <b>HS</b> centers & <b>★</b> sampling stars.
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => hotspotFileInputRef.current?.click()}
                          className="h-8 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold flex items-center gap-1.5"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Sheet</span>
                        </button>
                        <button
                          onClick={() => setIsAddHotspotModalOpen(true)}
                          className="h-8 px-3 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Spot</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg border border-slate-200 text-center text-[11px] text-slate-500">
                      No Hot Spots match the current parameter, state, spread, or search filters.
                    </div>
                  )}

                  {/* Ad-Hoc Main Dataset Hot Spot Tools */}
                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Ad-Hoc Dataset Investigation</span>
                      <span className="font-mono text-slate-400 tabular-nums">{mainDatasetPoints.length.toLocaleString()} wells</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => {
                          setWorkspaceView("map");
                          setIsPickingHotspot((p) => !p);
                        }}
                        className={`h-8 rounded-lg text-[11px] font-semibold border flex items-center justify-center gap-1.5 transition-colors ${
                          isPickingHotspot
                            ? "bg-amber-500 text-white border-amber-600"
                            : "bg-white hover:bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        <MousePointer2 className="w-3.5 h-3.5" />
                        <span>{isPickingHotspot ? "Click Map..." : "Pick on Map"}</span>
                      </button>
                      <button
                        onClick={autoDetectPeakHotspot}
                        className="h-8 rounded-lg text-[11px] font-semibold bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Auto-Max Peak</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* INSPECTOR TAB 2: PLUME PARAMETERS & MAP LAYERS */}
              {inspectorTab === "layers" && (
                <div className="space-y-3.5">
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Envelope & 4×4 Grid</div>
                      <button
                        onClick={() => {
                          setAutoFitPerSpot(false);
                          setHotspotRadiusKm(5.0);
                          setHotspotGridSizeKm(2.0);
                        }}
                        className="text-[10px] font-semibold text-indigo-600 hover:underline"
                      >
                        Reset 5 km / 2×2 km
                      </button>
                    </div>

                    <label className="flex items-center justify-between text-[11px] text-slate-700 cursor-pointer">
                      <span>Auto-fit radius & grid per Hot Spot</span>
                      <input
                        type="checkbox"
                        checked={autoFitPerSpot}
                        onChange={(e) => setAutoFitPerSpot(e.target.checked)}
                        className="w-3.5 h-3.5 accent-rose-600"
                      />
                    </label>

                    <div>
                      <div className="flex justify-between text-[11px] font-medium text-slate-700 mb-1 tabular-nums">
                        <span>{autoFitPerSpot ? "Focused Circle Radius" : "Uniform Circle Radius"}</span>
                        <b>{hotspotRadiusKm.toFixed(1)} km</b>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="25"
                        step="0.5"
                        value={hotspotRadiusKm}
                        onChange={(e) => setHotspotRadiusKm(parseFloat(e.target.value) || 5)}
                        className="w-full accent-rose-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-medium text-slate-700 mb-1 tabular-nums">
                        <span>{autoFitPerSpot ? "Focused 4×4 Cell Width" : "Uniform 4×4 Cell Width"}</span>
                        <b>
                          {hotspotGridSizeKm.toFixed(1)} × {hotspotGridSizeKm.toFixed(1)} km
                        </b>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="8"
                        step="0.5"
                        value={hotspotGridSizeKm}
                        onChange={(e) => setHotspotGridSizeKm(parseFloat(e.target.value) || 2)}
                        className="w-full accent-indigo-600"
                      />
                    </div>

                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <div className="space-y-1.5">
                        <div className="text-[10.5px] font-semibold text-slate-700">Sampling Star (★) Inner Color</div>
                        <div className="inline-flex w-full h-7 bg-white rounded-md p-0.5 border border-slate-200">
                          <button
                            onClick={() => setStarColorMode("pl")}
                            className={`flex-1 rounded text-[10.5px] font-semibold transition-colors ${
                              starColorMode === "pl" ? "bg-emerald-700 text-white" : "text-slate-600 hover:text-slate-900"
                            }`}
                            title="Green star if below/within Permissible Limit; Red star if above Permissible Limit"
                          >
                            PL Status (Green / Red)
                          </button>
                          <button
                            onClick={() => setStarColorMode("parameter")}
                            className={`flex-1 rounded text-[10.5px] font-semibold transition-colors ${
                              starColorMode === "parameter" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                            }`}
                            title="Color sampling stars by each Hot Spot's parameter color"
                          >
                            Parameter Color
                          </button>
                        </div>
                      </div>

                      <label className="flex items-center justify-between text-[11px] text-slate-700 cursor-pointer pt-1">
                        <span>Grid Cell PL Fill (Red &gt; PL / Green &le; PL)</span>
                        <input
                          type="checkbox"
                          checked={gridColorByPL}
                          onChange={(e) => setGridColorByPL(e.target.checked)}
                          className="w-3.5 h-3.5 accent-emerald-600"
                        />
                      </label>
                    </div>

                    {hotspotSheetGroups.length > 0 && (
                      <label className="flex items-center justify-between text-[11px] text-slate-700 cursor-pointer pt-2 border-t border-slate-200">
                        <span>Analyze sheet Grid Samples only</span>
                        <input
                          type="checkbox"
                          checked={useSheetGridOnly}
                          onChange={(e) => setUseSheetGridOnly(e.target.checked)}
                          className="w-3.5 h-3.5 accent-indigo-600"
                        />
                      </label>
                    )}
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 pb-1 border-b border-slate-100">
                      Spatial Layers
                    </div>
                    {[
                      { label: "5 km Circular Buffer Envelopes", checked: showBufferCircle, set: setShowBufferCircle },
                      { label: "2×2 km Dashed 4×4 Grid Cells", checked: showGridCells, set: setShowGridCells },
                      { label: "Sampling Location Stars (★)", checked: showGridSamples, set: setShowGridSamples },
                      { label: "Radial HS-to-Grid Connectors", checked: showConnectors, set: setShowConnectors },
                      { label: "Plume Spread Vectors", checked: showPlumeVectorArrow, set: setShowPlumeVectorArrow },
                      { label: "Contamination Footprint Halos", checked: showRiskHalos, set: setShowRiskHalos },
                      { label: "Floating Hot Spot Labels", checked: showSpotLabels, set: setShowSpotLabels },
                      { label: "5 km / 2 km Dimension Callouts", checked: showDimensionLabels, set: setShowDimensionLabels },
                      { label: "Shapefile Boundary Overlays", checked: showBoundaryOverlays, set: setShowBoundaryOverlays }
                    ].map((opt) => (
                      <label key={opt.label} className="flex items-center justify-between text-[11px] text-slate-700 cursor-pointer py-0.5">
                        <span>{opt.label}</span>
                        <input
                          type="checkbox"
                          checked={opt.checked}
                          onChange={(e) => opt.set(e.target.checked)}
                          className="w-3.5 h-3.5 accent-rose-600"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* INSPECTOR TAB 3: ACTIVE HOT SPOT DIAGNOSTIC DETAIL */}
              {inspectorTab === "detail" && (
                <div className="space-y-3">
                  {focusedItem ? (
                    (() => {
                      const fpCol = getHotspotParamColor(focusedItem.paramKey);
                      return (
                        <>
                          {/* Active Spot Header Card */}
                          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5 tabular-nums">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9.5px] font-bold text-white shrink-0"
                                  style={{ backgroundColor: fpCol.primary }}
                                >
                                  {focusedItem.paramKey}
                                </span>
                                <span className="text-xs font-bold text-slate-900 truncate">
                                  {focusedItem.point.hotspotNo ? `HS #${focusedItem.point.hotspotNo} · ` : ""}
                                  {focusedItem.point.locationName}
                                </span>
                              </span>
                              <button
                                onClick={() => {
                                  setWorkspaceView("map");
                                  fitMapToSingleItem(focusedItem.point, focusedItem.result);
                                }}
                                className="text-[11px] font-semibold text-indigo-600 hover:underline shrink-0"
                              >
                                Zoom
                              </button>
                            </div>
                            <div className="text-[10.5px] text-slate-600">
                              {[focusedItem.point.sampleId, focusedItem.point.source].filter(Boolean).join(" · ") || "Identified Hot Spot"}
                            </div>
                            {(focusedItem.point.block || focusedItem.point.district || focusedItem.point.state) && (
                              <div className="text-[10.5px] text-slate-500">
                                {[focusedItem.point.block, focusedItem.point.district, focusedItem.point.state].filter(Boolean).join(", ")}
                              </div>
                            )}
                            <div className="flex justify-between text-[10.5px] font-mono text-slate-500">
                              <span>Lat {focusedItem.point.lat.toFixed(5)}</span>
                              <span>Lon {focusedItem.point.lng.toFixed(5)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                              <div>
                                <div className="text-[10px] text-slate-500">HS {focusedItem.paramKey} (BIS: {focusedItem.b2})</div>
                                <div className="text-sm font-bold" style={{ color: fpCol.primary }}>
                                  {!isNaN(focusedItem.decay.hsVal) ? `${focusedItem.decay.hsVal} ${focusedItem.paramUnit}` : "—"}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-slate-500">Grid Mean / Max</div>
                                <div className="text-sm font-bold text-slate-900">
                                  {!isNaN(focusedItem.decay.meanGridVal)
                                    ? `${focusedItem.decay.meanGridVal.toFixed(1)} / ${focusedItem.decay.maxGridVal.toFixed(1)}`
                                    : "—"}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Hot Spot Spread Pattern Analysis Card (Localised / Unidirectional / Multi-Directional) */}
                          <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-1.5 tabular-nums">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                                Hot Spot Spread Analysis
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded border text-[10px] font-bold ${spreadPatternBadgeClass(
                                  focusedItem.decay.spreadPattern
                                )}`}
                              >
                                {focusedItem.decay.spreadPattern}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800">
                              <span>{focusedItem.decay.spreadDirectionLabel}</span>
                              {focusedItem.decay.angularSpanDeg > 0 && (
                                <span className="font-mono text-[10px] text-slate-500">
                                  Span: {focusedItem.decay.angularSpanDeg}°
                                </span>
                              )}
                            </div>
                            <p className="text-[10.5px] text-slate-600 leading-snug">{focusedItem.decay.spreadRationale}</p>
                          </div>

                          {/* Secondary Off-Center Peak Warning */}
                          {focusedItem.decay.secondaryPeakSample && (
                            <div className="p-2.5 rounded-lg border border-rose-200 bg-rose-50 text-[11px] space-y-1">
                              <div className="flex items-center gap-1.5 font-bold text-rose-800">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Off-Center Peak Exceeds Hot Spot</span>
                              </div>
                              <p className="text-rose-900/80 text-[10.5px] leading-snug tabular-nums">
                                <b>{focusedItem.decay.secondaryPeakSample.location}</b> ({focusedItem.decay.secondaryPeakSample.distKm.toFixed(2)} km,{" "}
                                {Math.round(focusedItem.decay.secondaryPeakSample.bearing)}°) measured{" "}
                                <b>
                                  {focusedItem.decay.secondaryPeakSample.val} {focusedItem.paramUnit}
                                </b>{" "}
                                vs HS center {focusedItem.decay.hsVal} {focusedItem.paramUnit}.
                              </p>
                            </div>
                          )}

                          {/* Hydrogeological Plume Metrics */}
                          <div className="p-3 rounded-lg bg-slate-900 text-white space-y-2 tabular-nums">
                            <div className="flex items-center justify-between text-[10.5px] text-slate-300">
                              <span className="font-semibold uppercase tracking-wider">Plume Diagnosis</span>
                              <span className="font-bold text-rose-300">{focusedItem.decay.severity}</span>
                            </div>
                            <div className="text-xs font-bold">{focusedItem.decay.classification}</div>
                            <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-slate-700/80 text-[10.5px]">
                              <div>
                                <div className="text-slate-400 text-[9.5px]">Attenuation</div>
                                <div className="font-bold">
                                  {focusedItem.decay.attenuationPct !== null ? `${focusedItem.decay.attenuationPct.toFixed(0)}%` : "—"}
                                </div>
                              </div>
                              <div>
                                <div className="text-slate-400 text-[9.5px]">Footprint</div>
                                <div className="font-bold">{focusedItem.decay.footprintKm.toFixed(2)} km</div>
                              </div>
                              <div>
                                <div className="text-slate-400 text-[9.5px]">Spread Dir.</div>
                                <div className="font-bold">
                                  {focusedItem.result.dominantDirection
                                    ? `${focusedItem.result.dominantDirection.direction} (${focusedItem.result.dominantDirection.midBearing}°)`
                                    : "—"}
                                </div>
                              </div>
                            </div>
                            <p className="text-[10.5px] text-slate-300 leading-relaxed pt-1">{focusedItem.result.verdict}</p>
                          </div>

                          {/* 4x4 Grid Matrix */}
                          <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 tabular-nums">
                              <span>4×4 Grid Matrix ({focusedItem.result.gridCellSizeKm.toFixed(1)} × {focusedItem.result.gridCellSizeKm.toFixed(1)} km)</span>
                              {selectedCellHighlight && (
                                <button onClick={() => setSelectedCellHighlight(null)} className="text-rose-600 hover:underline text-[10px]">
                                  Clear
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-4 gap-1 p-1.5 bg-slate-50 rounded-lg border border-slate-200 aspect-square max-w-[250px] mx-auto">
                              {focusedItem.result.gridCells.map((c) => {
                                const isSel = selectedCellHighlight === c.id;
                                const cellAbovePL =
                                  c.count > 0 && isAbovePermissibleLimit(c.avgVal, focusedItem.paramKey, focusedItem.b1, focusedItem.b2);
                                const cellBg =
                                  c.count === 0
                                    ? "transparent"
                                    : gridColorByPL
                                    ? cellAbovePL
                                      ? "rgba(239, 68, 68, 0.20)"
                                      : "rgba(34, 197, 94, 0.20)"
                                    : c.color + "22";
                                const valTextCol =
                                  c.count === 0
                                    ? "#94a3b8"
                                    : gridColorByPL
                                    ? cellAbovePL
                                      ? "#dc2626"
                                      : "#15803d"
                                    : c.color;
                                return (
                                  <button
                                    key={c.id}
                                    onClick={() => {
                                      const next = isSel ? null : c.id;
                                      setSelectedCellHighlight(next);
                                      if (next && mapRef.current) {
                                        setWorkspaceView("map");
                                        mapRef.current.flyToBounds(
                                          [
                                            [c.bbox[1], c.bbox[0]],
                                            [c.bbox[3], c.bbox[2]]
                                          ],
                                          { maxZoom: 15, duration: 0.6 }
                                        );
                                      }
                                    }}
                                    className={`flex flex-col items-center justify-center rounded p-1 text-center tabular-nums border border-dashed ${
                                      isSel ? "ring-2 ring-indigo-600" : ""
                                    }`}
                                    style={{
                                      backgroundColor: cellBg,
                                      borderColor: isSel ? "#4f46e5" : "#cbd5e1"
                                    }}
                                  >
                                    <span className="text-[8px] font-bold text-slate-700">{c.directionCode}</span>
                                    <span className="text-[8.5px] font-semibold text-slate-500">n={c.count}</span>
                                    <span className="text-[9px] font-bold" style={{ color: valTextCol }}>
                                      {c.count > 0 ? c.avgVal.toFixed(1) : "—"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Surrounding Grid Samples List */}
                          {focusedItem.result.samplingLocations.length > 0 && (
                            <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 tabular-nums">
                                <span>Sampling Locations (★)</span>
                                <span className="text-[10px] text-slate-500">{focusedItem.result.samplingLocations.length} pts</span>
                              </div>
                              <div className="max-h-52 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                                {focusedItem.result.samplingLocations.slice(0, 60).map((s, idx) => {
                                  const raw = s._raw || s;
                                  const locName = raw.Location || raw.Village || s._identificationNo || `Grid Sample ${idx + 1}`;
                                  const idNo = s._identificationNo || raw.IdentificationNo || raw["Identification No."] || "";
                                  const src = s._source || raw.Source || "";
                                  const valNum = Number(s._val);
                                  const valColor = isNaN(valNum)
                                    ? "#334155"
                                    : valNum > focusedItem.b2
                                    ? "#dc2626"
                                    : valNum > focusedItem.b1
                                    ? "#d97706"
                                    : "#059669";
                                  return (
                                    <button
                                      key={`${idNo || locName}-${idx}`}
                                      onClick={() => {
                                        setWorkspaceView("map");
                                        mapRef.current?.flyTo([s._lat, s._lon], 15, { duration: 0.6 });
                                      }}
                                      className="w-full text-left px-2 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors tabular-nums"
                                    >
                                      <div className="flex items-center justify-between gap-1.5">
                                        <span className="text-[10.5px] font-semibold text-slate-800 truncate">{locName}</span>
                                        <span className="text-[10.5px] font-bold shrink-0" style={{ color: valColor }}>
                                          {!isNaN(valNum) ? `${valNum.toFixed(1)} ${focusedItem.paramUnit}` : "—"}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-1.5 text-[9.5px] text-slate-500 mt-0.5">
                                        <span className="truncate">{[idNo, src].filter(Boolean).join(" · ") || "Grid Sample"}</span>
                                        <span className="shrink-0 font-mono">
                                          {Number(s._dist).toFixed(2)} km · {Math.round(Number(s._bearing))}°
                                        </span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Select a Hot Spot from the list, upload a sheet, or pick a point on the map to view full diagnostics.
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Right Main Viewport: Map (always mounted for zero Leaflet tile reload), Analytics, and Batch Table */}
        <main className="flex-1 relative min-w-0 min-h-0 overflow-hidden bg-slate-50 flex flex-col">
          {/* Compact Unboxed Top KPI Strip (visible whenever Hot Spots are loaded) */}
          {filteredBatchItems.length > 0 && (
            <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-1.5 tabular-nums z-10">
              <div>
                <div className="text-[10px] font-medium text-slate-500">Hot Spots / Grid ★</div>
                <div className="text-sm font-bold text-slate-900">
                  {gStats.totalHotspots} <span className="text-[10.5px] font-normal text-slate-500">/ {gStats.totalGridSamples} pts</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-slate-500">Spread Pattern</div>
                <div className="text-[11px] font-bold flex items-center gap-1.5 mt-0.5">
                  <span className="text-emerald-700" title="Localised">{gStats.localisedCount} Loc</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-amber-700" title="Unidirectional">{gStats.unidirectionalCount} Uni</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-rose-700" title="Multi-Directional">{gStats.multiDirectionalCount} Multi</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-slate-500">Grid &gt; BIS Limit</div>
                <div className="text-sm font-bold text-rose-700">
                  {gStats.gridExceedCount} <span className="text-[10.5px] font-semibold">({gStats.gridExceedPct.toFixed(1)}%)</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-slate-500">Params / States</div>
                <div className="text-sm font-bold text-slate-900">
                  {activeBatchSummary.paramSummaries.length}{" "}
                  <span className="text-[10.5px] font-normal text-slate-500">
                    param{activeBatchSummary.paramSummaries.length === 1 ? "" : "s"} · {activeBatchSummary.stateSummaries.length} state
                    {activeBatchSummary.stateSummaries.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-slate-500">Peak Hot Spot</div>
                <div className="text-sm font-bold text-rose-700 truncate" title={gStats.peakHotspot?.location || ""}>
                  {gStats.peakHotspot ? `${gStats.peakHotspot.val} (${gStats.peakHotspot.location})` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-slate-500">Max Footprint</div>
                <div className="text-sm font-bold text-indigo-700">{gStats.maxFootprintKm.toFixed(2)} km</div>
              </div>
            </div>
          )}

          {/* VIEW 1: SPATIAL MAP (kept mounted via CSS hidden so Leaflet tiles never reload) */}
          <div
            onClick={() => openFilterMenu && setOpenFilterMenu(null)}
            className={`flex-1 relative min-h-0 ${workspaceView === "map" ? "block" : "hidden"}`}
          >
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full overflow-hidden" />

            {isPickingHotspot && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900 text-white px-4 py-2 rounded-lg border border-rose-400 flex items-center gap-3 text-xs font-semibold shadow-lg">
                <Crosshair className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Click map or monitoring well to pin a Hot Spot location</span>
                <button
                  onClick={() => setIsPickingHotspot(false)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Bottom-Left Coordinate & Mode HUD */}
            <div className="absolute bottom-3 left-3 z-[900] bg-slate-900/90 text-white px-3 py-2 rounded-lg border border-slate-700 text-[11px] tabular-nums flex flex-wrap items-center gap-x-3 gap-y-1 max-w-[calc(100%-290px)]">
              <span ref={cursorTextRef} className="font-mono text-slate-200">
                Move cursor over map
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-rose-300 font-semibold">
                {plotAllHotspots && !isHotspotFocused && filteredBatchItems.length > 1 && !adhocHotspotPoint
                  ? `All ${filteredBatchItems.length} Hot Spots (${hotspotRadiusKm.toFixed(0)} km circle · ${hotspotGridSizeKm.toFixed(0)}×${hotspotGridSizeKm.toFixed(0)} km grid)`
                  : focusedItem
                  ? `HS (${focusedItem.paramKey}): ${focusedItem.point.locationName || "Pinned"} · ${focusedItem.result.totalWellsInEnvelope} ★ · ${focusedItem.decay.spreadPattern}`
                  : "Upload a Hot Spot Sheet, Add Spot, or Pick on Map"}
              </span>
            </div>

            {/* Bottom-Right Context-Aware Collapsible Map Legend (adapts immediately when a particular Hot Spot is selected) */}
            {(() => {
              const isSingleSpotView = Boolean(
                focusedItem && (isHotspotFocused || !plotAllHotspots || filteredBatchItems.length <= 1 || adhocHotspotPoint)
              );
              const singleSpot = isSingleSpotView ? focusedItem : null;
              const singlePLText = singleSpot
                ? formatPermissibleLimit(singleSpot.paramKey, singleSpot.b1, singleSpot.b2, singleSpot.paramUnit)
                : "";
              const singleStarCounts = singleSpot
                ? singleSpot.result.samplingLocations.reduce(
                    (acc, pt) => {
                      const v = Number(pt._val);
                      if (isNaN(v)) return acc;
                      if (isAbovePermissibleLimit(v, singleSpot.paramKey, singleSpot.b1, singleSpot.b2)) acc.above++;
                      else acc.below++;
                      return acc;
                    },
                    { above: 0, below: 0 }
                  )
                : null;
              const singleCellCounts = singleSpot
                ? singleSpot.result.gridCells.reduce(
                    (acc, c) => {
                      if (c.count === 0) acc.empty++;
                      else if (isAbovePermissibleLimit(c.avgVal, singleSpot.paramKey, singleSpot.b1, singleSpot.b2)) acc.above++;
                      else acc.below++;
                      return acc;
                    },
                    { above: 0, below: 0, empty: 0 }
                  )
                : null;

              const headerTitle = singleSpot
                ? `${singleSpot.point.hotspotNo ? `#${singleSpot.point.hotspotNo} · ` : ""}${singleSpot.point.locationName || "Hot Spot"} (${singleSpot.paramKey})`
                : `Map Legend (${hotspotRadiusKm.toFixed(0)} km · ${hotspotGridSizeKm.toFixed(0)}×${hotspotGridSizeKm.toFixed(0)} km)`;
              const singleSubLocation = singleSpot
                ? [singleSpot.point.district, singleSpot.point.state].filter(Boolean).join(", ")
                : "";

              return (
                <div className="absolute bottom-3 right-3 z-[900] bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl shadow-md min-w-[238px] max-w-[292px] overflow-hidden">
                  <button
                    onClick={() => setLegendCollapsed((c) => !c)}
                    className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-800 truncate" title={headerTitle}>
                        {headerTitle}
                      </div>
                      {singleSubLocation && (
                        <div className="text-[9.5px] font-medium text-slate-500 truncate">
                          {singleSubLocation}
                        </div>
                      )}
                    </div>
                    {legendCollapsed ? (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    )}
                  </button>
                  {!legendCollapsed && (
                    <div className="px-3 pb-2.5 pt-1.5 border-t border-slate-100 space-y-2 text-[10.5px] tabular-nums">
                      {/* 1. Hot Spot Center Symbol Row (tailored to single spot or multi-spot) */}
                      {(() => {
                        const legendParam =
                          singleSpot?.paramKey || focusedItem?.paramKey || activeBatchSummary.paramSummaries[0]?.paramKey || activeParam;
                        const legendSym = legendParam.slice(0, 4);
                        const legendCol = getHotspotParamColor(legendParam);
                        const legendFill =
                          availableParamCounts.length <= 1 ? "#fde68a" : legendCol.ringFill;
                        const symFont = legendSym.length <= 1 ? 8 : legendSym.length === 2 ? 7 : legendSym.length === 3 ? 5.8 : 5;
                        return (
                          <div className="flex items-center gap-2.5">
                            <svg width="26" height="26" viewBox="0 0 28 28" className="shrink-0">
                              <circle cx="14" cy="14" r="11.5" fill={legendFill} stroke={legendCol.primary} strokeWidth="2" />
                              <circle cx="14" cy="14" r="7" fill="#ffffff" stroke="#1e293b" strokeWidth="1.2" />
                              <text x="14" y="16.4" textAnchor="middle" fontSize={symFont} fontWeight="900" fill={legendCol.dark}>
                                {legendSym}
                              </text>
                            </svg>
                            <div className="leading-tight min-w-0 flex-1">
                              {singleSpot ? (
                                <>
                                  <div className="font-bold text-slate-900 truncate">
                                    HS: {!isNaN(singleSpot.decay.hsVal) ? `${singleSpot.decay.hsVal} ${singleSpot.paramUnit}` : "Pinned"}
                                  </div>
                                  <div className="text-[9.5px] text-slate-500">
                                    PL: {singlePLText} · {singleSpot.result.radiusKm.toFixed(1)} km /{" "}
                                    {singleSpot.result.gridCellSizeKm.toFixed(1)}×{singleSpot.result.gridCellSizeKm.toFixed(1)} km
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="font-bold text-slate-900">Hot Spot (Parameter Symbol)</div>
                                  <div className="text-[9.5px] text-slate-500">
                                    Outer {hotspotRadiusKm.toFixed(0)} km circle · {hotspotGridSizeKm.toFixed(0)}×{hotspotGridSizeKm.toFixed(0)} km grid
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* 2. Sampling Location Stars (★) Key — dynamically reflects Star Color Mode option */}
                      <div className="pt-1.5 border-t border-slate-100 space-y-1">
                        <div className="flex items-center justify-between text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                          <span>Sampling Locations (★)</span>
                          <button
                            onClick={() => setStarColorMode((m) => (m === "pl" ? "parameter" : "pl"))}
                            className="text-indigo-600 hover:underline normal-case font-semibold"
                            title="Switch between PL Status (Green/Red) and Parameter Color stars"
                          >
                            {starColorMode === "pl" ? "Use Param Color" : "Use Green/Red"}
                          </button>
                        </div>

                        {starColorMode === "pl" ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-2 text-slate-800 font-medium">
                                <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0">
                                  <polygon
                                    points="12,1.6 15.1,8.1 22.3,9.0 17.0,14.0 18.4,21.2 12,17.7 5.6,21.2 7.0,14.0 1.7,9.0 8.9,8.1"
                                    fill="#16a34a"
                                    stroke="#14532d"
                                    strokeWidth="1.7"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                <span>Below / Within PL{singleSpot ? ` (≤ ${singlePLText})` : ""}</span>
                              </span>
                              {singleStarCounts && <span className="font-mono text-[10px] text-emerald-700 font-bold">{singleStarCounts.below}</span>}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-2 text-slate-800 font-medium">
                                <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0">
                                  <polygon
                                    points="12,1.6 15.1,8.1 22.3,9.0 17.0,14.0 18.4,21.2 12,17.7 5.6,21.2 7.0,14.0 1.7,9.0 8.9,8.1"
                                    fill="#dc2626"
                                    stroke="#7f1d1d"
                                    strokeWidth="1.7"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                <span>Above PL{singleSpot ? ` (> ${singlePLText})` : ""}</span>
                              </span>
                              {singleStarCounts && <span className="font-mono text-[10px] text-rose-700 font-bold">{singleStarCounts.above}</span>}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-slate-800 font-medium">
                              <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0">
                                <polygon
                                  points="12,1.6 15.1,8.1 22.3,9.0 17.0,14.0 18.4,21.2 12,17.7 5.6,21.2 7.0,14.0 1.7,9.0 8.9,8.1"
                                  fill={
                                    singleSpot
                                      ? availableParamCounts.length <= 1
                                        ? "#ea580c"
                                        : getHotspotParamColor(singleSpot.paramKey).primary
                                      : "#ea580c"
                                  }
                                  stroke="#1e293b"
                                  strokeWidth="1.7"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              <span>Param Color (red ring &gt; PL)</span>
                            </span>
                            {singleSpot && (
                              <span className="font-mono text-[10px] text-slate-600">{singleSpot.result.samplingLocations.length}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 3. 4x4 Grid Cell Shading Key — dynamically reflects gridColorByPL option */}
                      {showGridCells && (
                        <div className="pt-1.5 border-t border-slate-100 space-y-1">
                          <div className="flex items-center justify-between text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                            <span>4×4 Grid Cells</span>
                            <button
                              onClick={() => setGridColorByPL((v) => !v)}
                              className="text-indigo-600 hover:underline normal-case font-semibold"
                            >
                              {gridColorByPL ? "Clear Fill" : "PL Fill"}
                            </button>
                          </div>
                          {gridColorByPL ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2 text-slate-700 font-medium">
                                  <span
                                    className="w-3.5 h-3.5 rounded-[3px] border border-dashed border-rose-500 shrink-0"
                                    style={{ backgroundColor: "rgba(239, 68, 68, 0.24)" }}
                                  />
                                  <span>Grid Avg &gt; PL</span>
                                </span>
                                {singleCellCounts && (
                                  <span className="font-mono text-[10px] text-rose-700 font-bold">{singleCellCounts.above}</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2 text-slate-700 font-medium">
                                  <span
                                    className="w-3.5 h-3.5 rounded-[3px] border border-dashed border-emerald-600 shrink-0"
                                    style={{ backgroundColor: "rgba(34, 197, 94, 0.22)" }}
                                  />
                                  <span>Grid Avg &le; PL</span>
                                </span>
                                {singleCellCounts && (
                                  <span className="font-mono text-[10px] text-emerald-700 font-bold">{singleCellCounts.below}</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2 text-slate-600 font-medium">
                                  <span className="w-3.5 h-3.5 rounded-[3px] border border-dashed border-slate-400 bg-transparent shrink-0" />
                                  <span>No Sample (Transparent)</span>
                                </span>
                                {singleCellCounts && (
                                  <span className="font-mono text-[10px] text-slate-500">{singleCellCounts.empty}</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-600">
                              <span className="w-3.5 h-3.5 rounded-[3px] border border-dashed border-slate-500 bg-transparent shrink-0" />
                              <span>Transparent dashed grid (no fill)</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 4. Multi-Spot Parameter Symbols Key (shown ONLY when viewing multiple Hot Spots) */}
                      {!singleSpot && activeBatchSummary.paramSummaries.length > 0 && (
                        <div className="pt-1.5 border-t border-slate-100 space-y-1">
                          <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                            Parameter Symbols & Colors
                          </div>
                          {activeBatchSummary.paramSummaries.map((ps) => {
                            const col = getHotspotParamColor(ps.paramKey);
                            const sym = ps.paramKey.slice(0, 4);
                            return (
                              <div key={ps.paramKey} className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5 font-semibold text-slate-800 truncate">
                                  <span
                                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[7.5px] font-black shrink-0"
                                    style={{
                                      backgroundColor: col.ringFill,
                                      border: `1.5px solid ${col.primary}`,
                                      color: col.dark
                                    }}
                                  >
                                    {sym}
                                  </span>
                                  <span>{ps.paramKey}</span>
                                  <span className="text-[9.5px] font-normal text-slate-400">({ps.unit})</span>
                                </span>
                                <span className="font-mono text-[10px] text-slate-600 shrink-0">
                                  {ps.hotspotCount} spots · PL {ps.b2}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 5. Spread Pattern Footer (Particular Hot Spot spread vs Global Multi-Spot counts) */}
                      {singleSpot ? (
                        <div className="pt-1.5 border-t border-slate-100 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Spread</span>
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[9.5px] font-bold ${spreadPatternBadgeClass(
                                singleSpot.decay.spreadPattern
                              )}`}
                            >
                              {singleSpot.decay.spreadPattern}
                            </span>
                          </div>
                          <div className="text-[9.5px] text-slate-600 leading-snug">
                            {singleSpot.decay.spreadDirectionLabel}
                            {singleSpot.decay.angularSpanDeg > 0 ? ` (${singleSpot.decay.angularSpanDeg}°)` : ""}
                          </div>
                          {filteredBatchItems.length > 1 && (
                            <div className="flex items-center gap-1.5 pt-1">
                              {plotAllHotspots && (
                                <button
                                  onClick={() => {
                                    setPlotAllHotspots(false);
                                    setIsHotspotFocused(true);
                                    fitMapToSingleItem(singleSpot.point, singleSpot.result);
                                  }}
                                  className="flex-1 py-1 px-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold transition-colors"
                                >
                                  Isolate on Map
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setPlotAllHotspots(true);
                                  setIsHotspotFocused(false);
                                  setAdhocHotspotPoint(null);
                                  fitMapToGroups(filteredBatchItems.map((i) => i.group));
                                }}
                                className="flex-1 py-1 px-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-semibold transition-colors"
                              >
                                {plotAllHotspots ? `All Legend (${filteredBatchItems.length})` : `Show All (${filteredBatchItems.length})`}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : filteredBatchItems.length > 0 ? (
                        <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1 text-[9.5px] font-bold">
                          <span className="text-emerald-700">Loc: {gStats.localisedCount}</span>
                          <span className="text-amber-700">Uni: {gStats.unidirectionalCount}</span>
                          <span className="text-rose-700">Multi: {gStats.multiDirectionalCount}</span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* VIEW 2: ANALYTICS, SPREAD PATTERN & DISTANCE-DECAY DIAGNOSTICS */}
          {workspaceView === "analytics" && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
              {filteredBatchItems.length === 0 && !focusedItem ? (
                <div className="p-10 rounded-xl border border-dashed border-slate-300 bg-white text-center space-y-2">
                  <div className="text-sm font-bold text-slate-800">No Hot Spot Data Loaded</div>
                  <p className="text-xs text-slate-500">
                    Upload a Hot Spot Data Sheet or add a Hot Spot to view Spread Pattern Analysis, Parameter & State Summaries, and Distance-Decay plots.
                  </p>
                </div>
              ) : (
                <>
                  {/* Row 0: Hot Spot Spread Pattern Analysis Summary (Localised / Unidirectional / Multi-Directional) */}
                  {filteredBatchItems.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 tabular-nums">
                      {(
                        [
                          {
                            pattern: "Localised" as HotspotSpreadPattern,
                            count: gStats.localisedCount,
                            accent: "border-emerald-200 bg-emerald-50/50 text-emerald-900",
                            badge: "bg-emerald-600 text-white",
                            desc: "Exceedance confined to the identified Hot Spot; surrounding grid samples remain within BIS permissible limit."
                          },
                          {
                            pattern: "Unidirectional" as HotspotSpreadPattern,
                            count: gStats.unidirectionalCount,
                            accent: "border-amber-200 bg-amber-50/50 text-amber-950",
                            badge: "bg-amber-600 text-white",
                            desc: "Exceeding grid samples aligned along a single directional sector (angular span ≤ 90°), indicating directional plume flow."
                          },
                          {
                            pattern: "Multi-Directional" as HotspotSpreadPattern,
                            count: gStats.multiDirectionalCount,
                            accent: "border-rose-200 bg-rose-50/50 text-rose-950",
                            badge: "bg-rose-600 text-white",
                            desc: "Exceeding grid samples dispersed across multiple opposing sectors (angular span > 90°), indicating widespread contamination."
                          }
                        ] as const
                      ).map((card) => {
                        const pct = gStats.totalHotspots > 0 ? (card.count / gStats.totalHotspots) * 100 : 0;
                        const activeFilter = spreadFilter === card.pattern;
                        return (
                          <button
                            key={card.pattern}
                            onClick={() => setSpreadFilter((prev) => (prev === card.pattern ? "All" : card.pattern))}
                            className={`text-left p-4 rounded-xl border transition-all ${card.accent} ${
                              activeFilter ? "ring-2 ring-slate-900 shadow-sm" : "hover:shadow-sm"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${card.badge}`}>{card.pattern}</span>
                              <span className="text-xl font-extrabold">
                                {card.count}{" "}
                                <span className="text-xs font-semibold opacity-70">({pct.toFixed(1)}%)</span>
                              </span>
                            </div>
                            <p className="text-[11px] opacity-80 mt-2 leading-snug">{card.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Row 1: Distance-Decay Scatter Chart + 8-Direction Plume Rose */}
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                    {/* Distance-Decay Scatter & OLS Regression */}
                    <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            Distance-Decay Attenuation Profile ({scatterData.distinctParams.join(", ") || activeParam})
                          </h3>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            Concentration ({scatterData.unit}) vs radial distance from Identified Hot Spot (km)
                            {scatterData.trend && scatterData.trend.slope !== null
                              ? ` · Slope: ${scatterData.trend.slope.toFixed(1)} ${scatterData.unit}/km${scatterData.trend.r !== null ? ` · r = ${scatterData.trend.r.toFixed(2)}` : ""}`
                              : ""}
                          </p>
                        </div>
                        {filteredBatchItems.length > 1 && (
                          <div className="inline-flex h-7 bg-slate-100 rounded-md p-0.5 border border-slate-200">
                            <button
                              onClick={() => setScatterScope("all")}
                              className={`px-2.5 rounded text-[10.5px] font-semibold ${
                                scatterScope === "all" ? "bg-white text-slate-900" : "text-slate-600"
                              }`}
                            >
                              All Spots ({filteredBatchItems.length})
                            </button>
                            <button
                              onClick={() => setScatterScope("active")}
                              className={`px-2.5 rounded text-[10.5px] font-semibold ${
                                scatterScope === "active" ? "bg-white text-slate-900" : "text-slate-600"
                              }`}
                            >
                              Focused Spot
                            </button>
                          </div>
                        )}
                      </div>

                      <svg viewBox="0 0 560 240" className="w-full h-60 overflow-visible">
                        {(() => {
                          const padL = 48;
                          const padR = 16;
                          const padT = 14;
                          const padB = 34;
                          const w = 560 - padL - padR;
                          const h = 240 - padT - padB;
                          const sx = (x: number) => padL + Math.min(1, Math.max(0, x / scatterData.maxX)) * w;
                          const sy = (y: number) => padT + h - Math.min(1, Math.max(0, y / scatterData.maxY)) * h;
                          const yB1 = sy(scatterData.b1);
                          const yB2 = sy(scatterData.b2);

                          return (
                            <>
                              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                                const yVal = scatterData.maxY * t;
                                const yy = sy(yVal);
                                return (
                                  <g key={`yg-${t}`}>
                                    <line x1={padL} y1={yy} x2={padL + w} y2={yy} stroke="#e2e8f0" strokeWidth="1" />
                                    <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize="9.5" fill="#64748b">
                                      {yVal.toFixed(0)}
                                    </text>
                                  </g>
                                );
                              })}
                              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                                const xVal = scatterData.maxX * t;
                                const xx = sx(xVal);
                                return (
                                  <g key={`xg-${t}`}>
                                    <line x1={xx} y1={padT} x2={xx} y2={padT + h} stroke="#f1f5f9" strokeWidth="1" />
                                    <text x={xx} y={padT + h + 15} textAnchor="middle" fontSize="9.5" fill="#64748b">
                                      {xVal.toFixed(1)} km
                                    </text>
                                  </g>
                                );
                              })}

                              {/* BIS Limit Lines */}
                              <line x1={padL} y1={yB1} x2={padL + w} y2={yB1} stroke="#f59e0b" strokeWidth="1.3" strokeDasharray="4,3" />
                              <text x={padL + w - 2} y={yB1 - 3} textAnchor="end" fontSize="8.5" fontWeight="700" fill="#b45309">
                                Desirable ({scatterData.b1})
                              </text>
                              <line x1={padL} y1={yB2} x2={padL + w} y2={yB2} stroke="#dc2626" strokeWidth="1.3" strokeDasharray="4,3" />
                              <text x={padL + w - 2} y={yB2 - 3} textAnchor="end" fontSize="8.5" fontWeight="700" fill="#dc2626">
                                Permissible ({scatterData.b2})
                              </text>

                              {/* OLS Trendline */}
                              {scatterData.trend && (
                                <line
                                  x1={sx(0)}
                                  y1={sy(Math.max(0, Math.min(scatterData.maxY, scatterData.trend.y0)))}
                                  x2={sx(scatterData.maxX)}
                                  y2={sy(Math.max(0, Math.min(scatterData.maxY, scatterData.trend.yMax)))}
                                  stroke="#0f172a"
                                  strokeWidth="1.8"
                                  strokeDasharray="6,4"
                                  opacity="0.7"
                                />
                              )}

                              {/* Data Points */}
                              {scatterData.pts.map((pt, idx) => (
                                <circle
                                  key={idx}
                                  cx={sx(pt.x)}
                                  cy={sy(pt.y)}
                                  r={pt.isHs ? 6 : 4.2}
                                  fill={pt.isHs ? "#fef08a" : pt.color}
                                  stroke={pt.isHs ? pt.color : "#ffffff"}
                                  strokeWidth={pt.isHs ? 2 : 1.2}
                                  opacity={0.92}
                                >
                                  <title>{`${pt.label}: ${pt.y.toFixed(1)} ${pt.unit} at ${pt.x.toFixed(2)} km`}</title>
                                </circle>
                              ))}

                              {/* Axes */}
                              <line x1={padL} y1={padT} x2={padL} y2={padT + h} stroke="#94a3b8" strokeWidth="1.2" />
                              <line x1={padL} y1={padT + h} x2={padL + w} y2={padT + h} stroke="#94a3b8" strokeWidth="1.2" />
                            </>
                          );
                        })()}
                      </svg>
                    </div>

                    {/* 8-Direction Compass Plume Rose for Active Hot Spot */}
                    <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Directional Plume Rose</h3>
                          <p className="text-[11px] text-slate-500">
                            {focusedItem
                              ? `#${focusedItem.point.hotspotNo || "1"} ${focusedItem.point.locationName} (${focusedItem.paramKey} · ${focusedItem.decay.spreadPattern})`
                              : "Select a Hot Spot"}
                          </p>
                        </div>
                        {focusedItem?.result.dominantDirection && (
                          <span className="text-[11px] font-bold text-rose-700 tabular-nums">
                            Peak: {focusedItem.result.dominantDirection.direction} ({focusedItem.result.dominantDirection.midBearing}°)
                          </span>
                        )}
                      </div>

                      {focusedItem ? (
                        <svg viewBox="0 0 260 220" className="w-full h-56 mx-auto">
                          {(() => {
                            const cx = 130;
                            const cy = 112;
                            const maxR = 78;
                            const stats = focusedItem.result.directionalStats;
                            const maxAvg = Math.max(focusedItem.result.baselineLimit, ...stats.map((s) => s.avgVal), 1);

                            return (
                              <>
                                {[0.33, 0.66, 1].map((frac) => (
                                  <circle
                                    key={frac}
                                    cx={cx}
                                    cy={cy}
                                    r={maxR * frac}
                                    fill="none"
                                    stroke="#e2e8f0"
                                    strokeWidth="1"
                                    strokeDasharray={frac < 1 ? "3,3" : undefined}
                                  />
                                ))}
                                {stats.map((st) => {
                                  const rad = ((st.midBearing - 90) * Math.PI) / 180;
                                  const halfW = (20 * Math.PI) / 180;
                                  const rLen = st.totalCount > 0 ? Math.max(12, (st.avgVal / maxAvg) * maxR) : 0;
                                  const x1 = cx + rLen * Math.cos(rad - halfW);
                                  const y1 = cy + rLen * Math.sin(rad - halfW);
                                  const x2 = cx + rLen * Math.cos(rad + halfW);
                                  const y2 = cy + rLen * Math.sin(rad + halfW);
                                  const lx = cx + (maxR + 18) * Math.cos(rad);
                                  const ly = cy + (maxR + 18) * Math.sin(rad);
                                  const isSel = selectedDirectionHighlight === st.direction;
                                  return (
                                    <g
                                      key={st.direction}
                                      onClick={() =>
                                        setSelectedDirectionHighlight((prev) => (prev === st.direction ? null : st.direction))
                                      }
                                      className="cursor-pointer"
                                    >
                                      <line
                                        x1={cx}
                                        y1={cy}
                                        x2={cx + maxR * Math.cos(rad)}
                                        y2={cy + maxR * Math.sin(rad)}
                                        stroke="#f1f5f9"
                                        strokeWidth="1"
                                      />
                                      {rLen > 0 && (
                                        <path
                                          d={`M ${cx} ${cy} L ${x1} ${y1} A ${rLen} ${rLen} 0 0 1 ${x2} ${y2} Z`}
                                          fill={st.color}
                                          fillOpacity={isSel ? 0.85 : 0.55}
                                          stroke={isSel ? "#0f172a" : st.color}
                                          strokeWidth={isSel ? 2 : 1.2}
                                        >
                                          <title>{`${st.label}: Mean ${st.avgVal.toFixed(1)} ${focusedItem.paramUnit} (n=${st.totalCount}, Exceed ${st.exceedanceRate.toFixed(0)}%)`}</title>
                                        </path>
                                      )}
                                      <text
                                        x={lx}
                                        y={ly + 3}
                                        textAnchor="middle"
                                        fontSize="10"
                                        fontWeight="700"
                                        fill={st.totalCount > 0 ? "#0f172a" : "#94a3b8"}
                                      >
                                        {st.direction}
                                      </text>
                                    </g>
                                  );
                                })}
                                <circle cx={cx} cy={cy} r={10} fill={getHotspotParamColor(focusedItem.paramKey).ringFill} stroke={getHotspotParamColor(focusedItem.paramKey).primary} strokeWidth="2" />
                                <text
                                  x={cx}
                                  y={cy + 2.8}
                                  textAnchor="middle"
                                  fontSize={focusedItem.paramKey.length <= 2 ? "7.5" : "6.2"}
                                  fontWeight="900"
                                  fill={getHotspotParamColor(focusedItem.paramKey).dark}
                                >
                                  {focusedItem.paramKey.slice(0, 4)}
                                </text>
                              </>
                            );
                          })()}
                        </svg>
                      ) : null}
                    </div>
                  </div>

                  {/* Row 2: Parameter-Wise Hot Spot & Spread Summary Table */}
                  {activeBatchSummary.paramSummaries.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">Parameter-Wise Hot Spot & Spread Summary</h3>
                        <span className="text-[11px] text-slate-500">Each parameter is rendered with a distinct color on the map</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left tabular-nums">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-2.5 font-semibold">Parameter</th>
                              <th className="px-3 py-2.5 font-semibold text-right">BIS Limit</th>
                              <th className="px-3 py-2.5 font-semibold text-right">Hot Spots</th>
                              <th className="px-3 py-2.5 font-semibold text-right">Grid ★</th>
                              <th className="px-3 py-2.5 font-semibold text-right">Grid &gt; BIS</th>
                              <th className="px-3 py-2.5 font-semibold text-right text-emerald-700">Localised</th>
                              <th className="px-3 py-2.5 font-semibold text-right text-amber-700">Unidirectional</th>
                              <th className="px-3 py-2.5 font-semibold text-right text-rose-700">Multi-Dir.</th>
                              <th className="px-3 py-2.5 font-semibold text-right">Mean HS</th>
                              <th className="px-3 py-2.5 font-semibold text-right">Max HS / Grid</th>
                              <th className="px-3 py-2.5 font-semibold">States Affected</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {activeBatchSummary.paramSummaries.map((ps) => {
                              const pCol = getHotspotParamColor(ps.paramKey);
                              return (
                                <tr key={ps.paramKey} className="hover:bg-slate-50">
                                  <td className="px-4 py-2.5 font-bold text-slate-900">
                                    <span className="inline-flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pCol.primary }} />
                                      <span>{ps.paramKey}</span>
                                      <span className="text-[10.5px] font-normal text-slate-400">({ps.unit})</span>
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono">{ps.b2}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold">{ps.hotspotCount}</td>
                                  <td className="px-3 py-2.5 text-right">{ps.totalGridSamples}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold text-rose-700">
                                    {ps.gridExceedCount} ({ps.gridExceedPct.toFixed(1)}%)
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">{ps.localisedCount}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold text-amber-700">{ps.unidirectionalCount}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold text-rose-700">{ps.multiDirectionalCount}</td>
                                  <td className="px-3 py-2.5 text-right">{!isNaN(ps.meanHsVal) ? ps.meanHsVal.toFixed(1) : "—"}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold">
                                    {!isNaN(ps.maxHsVal) ? ps.maxHsVal.toFixed(1) : "—"} /{" "}
                                    <span className="text-amber-700">{!isNaN(ps.maxGridVal) ? ps.maxGridVal.toFixed(1) : "—"}</span>
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-600 max-w-[220px] truncate" title={ps.statesAffected.join(", ")}>
                                    {ps.statesAffected.join(", ") || "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Row 3: Hot Spot Center vs Surrounding Grid Mean & Max Comparison */}
                  {filteredBatchItems.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Hot Spot Center vs Surrounding Grid Comparison</h3>
                          <p className="text-[11px] text-slate-500">
                            Compares Identified Hot Spot concentration against Surrounding Grid Mean and Peak values across all plotted Hot Spots
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-slate-600">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-rose-600 inline-block" /> HS Center (Param Color)
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Grid Mean
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Grid Max
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar tabular-nums">
                        {(() => {
                          const maxVal = Math.max(
                            gStats.b2,
                            ...filteredBatchItems.map((i) => Math.max(i.decay.hsVal || 0, i.decay.maxGridVal || 0)),
                            1
                          );
                          return filteredBatchItems.map((it) => {
                            const hsW = !isNaN(it.decay.hsVal) ? Math.min(100, (it.decay.hsVal / maxVal) * 100) : 0;
                            const meanW = !isNaN(it.decay.meanGridVal) ? Math.min(100, (it.decay.meanGridVal / maxVal) * 100) : 0;
                            const maxPos = !isNaN(it.decay.maxGridVal) ? Math.min(100, (it.decay.maxGridVal / maxVal) * 100) : 0;
                            const pCol = getHotspotParamColor(it.paramKey);
                            return (
                              <button
                                key={it.group.id}
                                onClick={() => {
                                  selectHotspotGroup(it.group, it.paramKey);
                                  setWorkspaceView("map");
                                }}
                                className="w-full text-left py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors"
                              >
                                <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
                                  <span className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
                                    <span
                                      className="px-1 py-0.2 rounded text-[9px] font-bold text-white shrink-0"
                                      style={{ backgroundColor: pCol.primary }}
                                    >
                                      {it.paramKey}
                                    </span>
                                    <span>
                                      #{it.group.hotspotNo} · {it.group.location}{" "}
                                      <span className="text-slate-400 font-normal">({it.group.district || it.group.state})</span>
                                    </span>
                                    <span className={`px-1.5 py-0 rounded border text-[9px] font-bold ${spreadPatternBadgeClass(it.decay.spreadPattern)}`}>
                                      {it.decay.spreadPattern}
                                    </span>
                                  </span>
                                  <span className="text-[10.5px] text-slate-600 shrink-0">
                                    HS <b style={{ color: pCol.primary }}>{!isNaN(it.decay.hsVal) ? it.decay.hsVal : "—"}</b> · Mean{" "}
                                    <b className="text-indigo-700">{!isNaN(it.decay.meanGridVal) ? it.decay.meanGridVal.toFixed(1) : "—"}</b> · Max{" "}
                                    <b className="text-amber-700">{!isNaN(it.decay.maxGridVal) ? it.decay.maxGridVal : "—"}</b> {it.paramUnit}
                                  </span>
                                </div>
                                <div className="relative h-3.5 bg-slate-100 rounded overflow-hidden">
                                  <div className="absolute top-0 left-0 h-1.5 rounded-r" style={{ width: `${hsW}%`, backgroundColor: pCol.primary }} />
                                  <div className="absolute bottom-0 left-0 h-1.5 bg-indigo-500 rounded-r" style={{ width: `${meanW}%` }} />
                                  {maxPos > 0 && (
                                    <div
                                      className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-500 border border-white"
                                      style={{ left: `calc(${maxPos}% - 5px)` }}
                                    />
                                  )}
                                </div>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Row 4: State-Wise Hot Spot & Spread Summary Table */}
                  {activeBatchSummary.stateSummaries.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">State-Wise Hot Spot, Spread & Grid Exceedance Summary</h3>
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {activeBatchSummary.stateSummaries.length} State(s) / UT
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left tabular-nums">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-2.5 font-semibold">State / UT</th>
                              <th className="px-3 py-2.5 font-semibold">Parameters</th>
                              <th className="px-3 py-2.5 font-semibold text-right">Hot Spots</th>
                              <th className="px-3 py-2.5 font-semibold text-right">Grid ★</th>
                              <th className="px-3 py-2.5 font-semibold text-right">Grid &gt; BIS</th>
                              <th className="px-3 py-2.5 font-semibold text-right text-emerald-700">Localised</th>
                              <th className="px-3 py-2.5 font-semibold text-right text-amber-700">Unidirectional</th>
                              <th className="px-3 py-2.5 font-semibold text-right text-rose-700">Multi-Dir.</th>
                              <th className="px-3 py-2.5 font-semibold text-right">Max HS / Grid</th>
                              <th className="px-3 py-2.5 font-semibold text-right">Max Footprint</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {activeBatchSummary.stateSummaries.map((st) => (
                              <tr key={st.state} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5 font-semibold text-slate-900">{st.state}</td>
                                <td className="px-3 py-2.5">
                                  <div className="flex flex-wrap gap-1">
                                    {st.parametersAffected.map((pk) => (
                                      <span
                                        key={pk}
                                        className="px-1.5 py-0.5 rounded text-[9.5px] font-bold text-white"
                                        style={{ backgroundColor: getHotspotParamColor(pk).primary }}
                                      >
                                        {pk}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold">{st.hotspotCount}</td>
                                <td className="px-3 py-2.5 text-right">{st.totalGridSamples}</td>
                                <td className="px-3 py-2.5 text-right font-semibold text-rose-700">
                                  {st.gridExceedCount} ({st.gridExceedPct.toFixed(1)}%)
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">{st.localisedCount}</td>
                                <td className="px-3 py-2.5 text-right font-semibold text-amber-700">{st.unidirectionalCount}</td>
                                <td className="px-3 py-2.5 text-right font-semibold text-rose-700">{st.multiDirectionalCount}</td>
                                <td className="px-3 py-2.5 text-right font-semibold">
                                  {!isNaN(st.maxHsVal) ? st.maxHsVal.toFixed(1) : "—"} /{" "}
                                  <span className="text-amber-700">{!isNaN(st.maxGridVal) ? st.maxGridVal.toFixed(1) : "—"}</span>
                                </td>
                                <td className="px-3 py-2.5 text-right">{st.maxFootprintKm.toFixed(2)} km</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* VIEW 3: FULL BATCH DATA LEDGER (Hot Spot Summary + All Grid Samples Table) */}
          {workspaceView === "ledger" && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex h-8 bg-slate-200/70 rounded-lg p-0.5">
                  <button
                    onClick={() => setLedgerMode("groups")}
                    className={`px-3 rounded-md text-xs font-semibold transition-colors ${
                      ledgerMode === "groups" ? "bg-white text-slate-900" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Hot Spot Summary ({filteredBatchItems.length})
                  </button>
                  <button
                    onClick={() => setLedgerMode("samples")}
                    className={`px-3 rounded-md text-xs font-semibold transition-colors ${
                      ledgerMode === "samples" ? "bg-white text-slate-900" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    All Grid Samples ({flattenedLedgerSamples.length})
                  </button>
                </div>

                <span className="text-xs text-slate-500">Click any row to locate and inspect on the Spatial Map</span>
              </div>

              {filteredBatchItems.length === 0 ? (
                <div className="p-10 rounded-xl border border-dashed border-slate-300 bg-white text-center text-xs text-slate-500">
                  Upload a Hot Spot Data Sheet or add Hot Spots to populate the Batch Table.
                </div>
              ) : ledgerMode === "groups" ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left tabular-nums">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold">HS #</th>
                          <th className="px-3 py-2.5 font-semibold">Param</th>
                          <th className="px-3 py-2.5 font-semibold">ID No.</th>
                          <th className="px-3 py-2.5 font-semibold">Location</th>
                          <th className="px-3 py-2.5 font-semibold">District / State</th>
                          <th className="px-3 py-2.5 font-semibold text-right">HS Value</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Grid ★</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Grid Mean</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Grid Max</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Exceed %</th>
                          <th className="px-3 py-2.5 font-semibold">Spread Pattern</th>
                          <th className="px-3 py-2.5 font-semibold">Spread Directions</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Footprint</th>
                          <th className="px-3 py-2.5 font-semibold">Severity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredBatchItems.map((it) => {
                          const pCol = getHotspotParamColor(it.paramKey);
                          return (
                            <tr
                              key={it.group.id}
                              onClick={() => {
                                selectHotspotGroup(it.group, it.paramKey);
                                setWorkspaceView("map");
                                setInspectorTab("detail");
                              }}
                              className="hover:bg-rose-50/40 cursor-pointer"
                            >
                              <td className="px-3 py-2.5 font-bold text-slate-900">#{it.group.hotspotNo}</td>
                              <td className="px-3 py-2.5">
                                <span
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                                  style={{ backgroundColor: pCol.primary }}
                                >
                                  {it.paramKey}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">{it.group.identificationNo || "—"}</td>
                              <td className="px-3 py-2.5 font-semibold text-slate-900">{it.group.location}</td>
                              <td className="px-3 py-2.5 text-slate-600">
                                {[it.group.district, it.group.state].filter(Boolean).join(", ") || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold" style={{ color: pCol.primary }}>
                                {!isNaN(it.decay.hsVal) ? `${it.decay.hsVal.toFixed(1)} ${it.paramUnit}` : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right">{it.result.totalWellsInEnvelope}</td>
                              <td className="px-3 py-2.5 text-right">
                                {!isNaN(it.decay.meanGridVal) ? it.decay.meanGridVal.toFixed(1) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold">
                                {!isNaN(it.decay.maxGridVal) ? it.decay.maxGridVal.toFixed(1) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold">{it.decay.exceedGridPct.toFixed(0)}%</td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${spreadPatternBadgeClass(
                                    it.decay.spreadPattern
                                  )}`}
                                >
                                  {it.decay.spreadPattern}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-[11px] text-slate-700">{it.decay.spreadDirectionLabel}</td>
                              <td className="px-3 py-2.5 text-right">{it.decay.footprintKm.toFixed(2)} km</td>
                              <td className={`px-3 py-2.5 ${severityTextClass(it.decay.severity)}`}>{it.decay.severity}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left tabular-nums">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold">HS #</th>
                          <th className="px-3 py-2.5 font-semibold">Sample Type</th>
                          <th className="px-3 py-2.5 font-semibold">Identification No.</th>
                          <th className="px-3 py-2.5 font-semibold">State / District</th>
                          <th className="px-3 py-2.5 font-semibold">Location</th>
                          <th className="px-3 py-2.5 font-semibold">Source</th>
                          <th className="px-3 py-2.5 font-semibold">Param</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Lon / Lat</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Value</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Dist (km)</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Bearing</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {flattenedLedgerSamples.map((r, idx) => {
                          const isHs = r.sampleType === "Identified Hot Spot";
                          const pCol = getHotspotParamColor(r.paramKey);
                          const valColor = isNaN(r.val)
                            ? "#334155"
                            : r.val > r.b2
                            ? "#dc2626"
                            : r.val > r.b1
                            ? "#d97706"
                            : "#059669";
                          return (
                            <tr
                              key={`${r.groupId}-${idx}`}
                              onClick={() => {
                                setWorkspaceView("map");
                                mapRef.current?.flyTo([r.lat, r.lon], 15, { duration: 0.65 });
                              }}
                              className={`cursor-pointer ${isHs ? "bg-amber-50/60 hover:bg-amber-50 font-semibold" : "hover:bg-slate-50"}`}
                            >
                              <td className="px-3 py-2 font-bold text-slate-800">#{r.hotspotNo}</td>
                              <td className={`px-3 py-2 ${isHs ? "text-rose-700 font-bold" : "text-slate-600"}`}>{r.sampleType}</td>
                              <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{r.identificationNo || "—"}</td>
                              <td className="px-3 py-2 text-slate-600">
                                {[r.district, r.state].filter(Boolean).join(", ") || "—"}
                              </td>
                              <td className="px-3 py-2 text-slate-900">{r.location}</td>
                              <td className="px-3 py-2 text-slate-600">{r.source || "—"}</td>
                              <td className="px-3 py-2">
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9.5px] font-bold text-white"
                                  style={{ backgroundColor: pCol.primary }}
                                >
                                  {r.paramKey}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-[10.5px] text-slate-500">
                                {r.lon.toFixed(4)}, {r.lat.toFixed(4)}
                              </td>
                              <td className="px-3 py-2 text-right font-bold" style={{ color: valColor }}>
                                {!isNaN(r.val) ? `${r.val.toFixed(1)} ${r.paramUnit}` : "—"}
                              </td>
                              <td className="px-3 py-2 text-right">{r.distKm.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right">{isHs ? "—" : `${Math.round(r.bearing)}°`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <HotspotSheetEntryModal
        isOpen={isAddHotspotModalOpen}
        onClose={() => setIsAddHotspotModalOpen(false)}
        activeParam={activeParam}
        nextHotspotNo={String(hotspotSheetGroups.length + 1)}
        onSaveGroup={handleManualHotspotSave}
      />
    </div>
  );
}
