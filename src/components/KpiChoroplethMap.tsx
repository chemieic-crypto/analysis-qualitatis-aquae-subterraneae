import React, { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { DataHeaders, ShapefileLayer } from "../types";
import { norm, buildDistrictStateMap, isStateAll, isDistrictAll, featureMatchesSelection, toProperCase } from "../utils/shapefileFilter";
import { PARAM_CONFIG } from "../data/config";
import { INDIA_BOUNDARY } from "../data/india_boundary";
import {
  Globe,
  Plus,
  Minus,
  RotateCcw,
  Palette,
  Upload,
  Layers,
  Settings2,
  X,
  Check,
  Compass,
  Maximize2,
  Minimize2,
  Info,
  SlidersHorizontal,
  RefreshCw,
  Table,
  Percent,
  Map as MapIcon,
  Mountain,
  Eye,
  Sliders,
  Move,
  AlertTriangle,
  Download,
  FileImage,
  Image,
  Loader2,
  Award,
  MapPin
} from "lucide-react";
import shp from "shpjs";

export type BaseMapType = "vector" | "esri-terrain" | "google-earth" | "google-hybrid" | "esri-topo";

// Slippy Map Tile utilities for WGS84 / Web Mercator Projection
function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

function tile2lon(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export interface KpiRangeClass {
  id: string;
  minPct: number;
  maxPct: number;
  label: string;
  color: string;
}

interface KpiChoroplethMapProps {
  rawData: any[];
  setRawData?: React.Dispatch<React.SetStateAction<any[]>>;
  headers: DataHeaders;
  headerMap: Record<string, string>;
  activeParam: string;
  onParamChange?: (paramKey: string) => void;
  availableParams?: string[];
  activeConfig: { b1?: number; b2?: number; unit?: string; name?: string };
  reportingLevel: "State" | "District" | "Block";
  selectedState?: string;
  selectedDistrict?: string;
  sharedLayers?: ShapefileLayer[];
  setSharedLayers?: React.Dispatch<React.SetStateAction<ShapefileLayer[]>>;
  showGisAnalysis?: boolean;
  setShowGisAnalysis?: (val: boolean) => void;
  showToast?: (message: string, type?: "success" | "error") => void;
  showStateLabels?: boolean;
  setShowStateLabels?: (val: boolean) => void;
  showExceedancePct?: boolean;
  setShowExceedancePct?: (val: boolean) => void;
  baseMapType?: BaseMapType;
  setBaseMapType?: (val: BaseMapType) => void;
  isRangeModalOpen?: boolean;
  setIsRangeModalOpen?: (val: boolean) => void;
  externalFileInputRef?: React.RefObject<HTMLInputElement | null>;
}

// Default 5 Range Color Classes matching the uploaded KPI design
const DEFAULT_RANGE_CLASSES: KpiRangeClass[] = [
  { id: "r1", minPct: 0, maxPct: 0, label: "0%", color: "#2563eb" }, // Blue
  { id: "r2", minPct: 0.0001, maxPct: 5, label: ">0% to 5%", color: "#10b981" }, // Green
  { id: "r3", minPct: 5.0001, maxPct: 10, label: ">5% to 10%", color: "#f59e0b" }, // Amber
  { id: "r4", minPct: 10.0001, maxPct: 20, label: ">10% to 20%", color: "#f97316" }, // Orange
  { id: "r5", minPct: 20.0001, maxPct: 100, label: ">20% High", color: "#ef4444" } // Red
];

// Monochromatic and Multi-color palette presets
const COLOR_PALETTES: Record<string, { name: string; colors: string[] }> = {
  multi: {
    name: "Multi-Color",
    colors: ["#2563eb", "#10b981", "#f59e0b", "#f97316", "#ef4444"]
  },
  monoRed: {
    name: "Mono Red",
    colors: ["#fef2f2", "#fca5a5", "#f87171", "#dc2626", "#7f1d1d"]
  },
  monoBlue: {
    name: "Mono Blue",
    colors: ["#eff6ff", "#93c5fd", "#60a5fa", "#1d4ed8", "#1e3a8a"]
  },
  monoGreen: {
    name: "Mono Green",
    colors: ["#f0fdf4", "#86efac", "#4ade80", "#15803d", "#14532d"]
  },
  monoAmber: {
    name: "Mono Amber",
    colors: ["#fffbe8", "#fde047", "#f59e0b", "#d97706", "#78350f"]
  },
  monoPurple: {
    name: "Mono Purple",
    colors: ["#faf5ff", "#c084fc", "#a855f7", "#6b21a8", "#3b0764"]
  },
  monoSlate: {
    name: "Mono Slate",
    colors: ["#f8fafc", "#cbd5e1", "#64748b", "#334155", "#0f172a"]
  }
};

// Full 36 States and Union Territories of India for default Choropleth visualization
const INDIA_STATES_SIMPLIFIED: { name: string; path: string; center: [number, number] }[] = [
  { name: "Jammu & Kashmir", path: "M 170,70 L 230,60 L 240,110 L 170,110 Z", center: [200, 85] },
  { name: "Ladakh", path: "M 220,35 L 290,35 L 280,95 L 220,90 Z", center: [250, 60] },
  { name: "Himachal Pradesh", path: "M 220,95 L 260,95 L 260,130 L 220,125 Z", center: [240, 110] },
  { name: "Punjab", path: "M 180,115 L 220,115 L 220,150 L 170,145 Z", center: [195, 130] },
  { name: "Chandigarh", path: "M 215,135 L 225,135 L 225,145 L 215,145 Z", center: [220, 140] },
  { name: "Haryana", path: "M 195,145 L 245,145 L 240,185 L 195,180 Z", center: [215, 165] },
  { name: "Delhi", path: "M 230,165 L 242,165 L 242,177 L 230,177 Z", center: [236, 171] },
  { name: "Uttarakhand", path: "M 250,115 L 290,110 L 290,150 L 250,150 Z", center: [270, 130] },
  { name: "Rajasthan", path: "M 120,170 L 210,165 L 230,235 L 150,255 L 110,215 Z", center: [165, 205] },
  { name: "Uttar Pradesh", path: "M 235,150 L 345,150 L 350,215 L 230,210 Z", center: [285, 180] },
  { name: "Gujarat", path: "M 95,225 L 160,225 L 170,270 L 115,285 L 85,250 Z", center: [125, 250] },
  { name: "Madhya Pradesh", path: "M 180,225 L 305,215 L 320,275 L 195,285 Z", center: [245, 250] },
  { name: "Bihar", path: "M 345,175 L 415,175 L 415,225 L 345,225 Z", center: [380, 200] },
  { name: "Sikkim", path: "M 420,165 L 435,165 L 435,185 L 420,185 Z", center: [427, 175] },
  { name: "West Bengal", path: "M 415,200 L 450,200 L 440,275 L 405,250 Z", center: [425, 230] },
  { name: "Jharkhand", path: "M 345,225 L 405,225 L 395,275 L 335,265 Z", center: [370, 245] },
  { name: "Odisha", path: "M 315,275 L 390,265 L 395,335 L 315,325 Z", center: [355, 300] },
  { name: "Chhattisgarh", path: "M 285,255 L 335,255 L 325,325 L 275,315 Z", center: [305, 285] },
  { name: "Maharashtra", path: "M 150,285 L 275,275 L 285,345 L 160,355 Z", center: [215, 315] },
  { name: "Goa", path: "M 165,355 L 180,355 L 178,370 L 163,370 Z", center: [171, 362] },
  { name: "Telangana", path: "M 235,325 L 300,315 L 290,365 L 230,355 Z", center: [265, 340] },
  { name: "Andhra Pradesh", path: "M 245,365 L 330,345 L 310,425 L 235,415 Z", center: [275, 385] },
  { name: "Karnataka", path: "M 165,370 L 235,370 L 225,445 L 160,425 Z", center: [195, 405] },
  { name: "Kerala", path: "M 180,445 L 205,445 L 195,500 L 170,485 Z", center: [188, 470] },
  { name: "Tamil Nadu", path: "M 205,445 L 270,425 L 250,510 L 195,495 Z", center: [230, 465] },
  { name: "Puducherry", path: "M 260,460 L 270,460 L 270,470 L 260,470 Z", center: [265, 465] },
  { name: "Assam", path: "M 460,175 L 525,175 L 515,210 L 450,205 Z", center: [485, 190] },
  { name: "Arunachal Pradesh", path: "M 480,140 L 545,140 L 535,175 L 470,175 Z", center: [505, 155] },
  { name: "Meghalaya", path: "M 450,205 L 490,205 L 490,225 L 450,225 Z", center: [470, 215] },
  { name: "Nagaland", path: "M 525,175 L 550,175 L 545,200 L 520,200 Z", center: [535, 187] },
  { name: "Manipur", path: "M 520,200 L 545,200 L 540,225 L 515,225 Z", center: [530, 212] },
  { name: "Mizoram", path: "M 505,225 L 530,225 L 525,255 L 500,255 Z", center: [515, 240] },
  { name: "Tripura", path: "M 480,225 L 505,225 L 500,250 L 475,250 Z", center: [490, 237] },
  { name: "Daman & Diu", path: "M 130,285 L 145,285 L 145,298 L 130,298 Z", center: [137, 291] },
  { name: "Andaman & Nicobar", path: "M 500,375 L 530,375 L 525,470 L 495,470 Z", center: [512, 420] },
  { name: "Lakshadweep", path: "M 115,435 L 155,435 L 150,495 L 110,495 Z", center: [132, 465] }
];

export default function KpiChoroplethMap({
  rawData,
  setRawData,
  headers,
  headerMap,
  activeParam,
  onParamChange,
  availableParams = [],
  activeConfig,
  reportingLevel,
  selectedState,
  selectedDistrict,
  sharedLayers = [],
  setSharedLayers,
  showGisAnalysis = true,
  setShowGisAnalysis,
  showToast,
  showStateLabels: propShowStateLabels,
  setShowStateLabels: propSetShowStateLabels,
  showExceedancePct: propShowExceedancePct,
  setShowExceedancePct: propSetShowExceedancePct,
  baseMapType: propBaseMapType,
  setBaseMapType: propSetBaseMapType,
  isRangeModalOpen: propIsRangeModalOpen,
  setIsRangeModalOpen: propSetIsRangeModalOpen,
  externalFileInputRef
}: KpiChoroplethMapProps) {
  // Base Map State
  const [internalBaseMapType, setInternalBaseMapType] = useState<BaseMapType>("vector");
  const baseMapType = propBaseMapType !== undefined ? propBaseMapType : internalBaseMapType;
  const setBaseMapType = propSetBaseMapType || setInternalBaseMapType;

  const [basemapOpacity, setBasemapOpacity] = useState<number>(0.85);
  const [polygonOpacity, setPolygonOpacity] = useState<number>(0.78);
  const [isBaseMapMenuOpen, setIsBaseMapMenuOpen] = useState<boolean>(false);

  // Range Colors State
  const [rangeClasses, setRangeClasses] = useState<KpiRangeClass[]>(DEFAULT_RANGE_CLASSES);
  const [activePaletteKey, setActivePaletteKey] = useState<string>("multi");
  const [internalIsRangeModalOpen, setInternalIsRangeModalOpen] = useState<boolean>(false);
  const isRangeModalOpen = propIsRangeModalOpen !== undefined ? propIsRangeModalOpen : internalIsRangeModalOpen;
  const setIsRangeModalOpen = propSetIsRangeModalOpen || setInternalIsRangeModalOpen;

  const applyPalette = (paletteKey: string) => {
    const palette = COLOR_PALETTES[paletteKey];
    if (!palette) return;
    setActivePaletteKey(paletteKey);
    setRangeClasses((prev) =>
      prev.map((item, idx) => ({
        ...item,
        color: palette.colors[idx] || item.color
      }))
    );
    if (showToast) showToast(`Applied ${palette.name} palette`, "success");
  };

  // Hover Tooltip State
  const [hoveredRegion, setHoveredRegion] = useState<{
    name: string;
    total: number;
    exceed: number;
    pct: number;
    meanVal: number | null;
    x: number;
    y: number;
    color: string;
    rangeLabel: string;
  } | null>(null);

  // Show State/Region Name Labels Toggle
  const [internalShowStateLabels, setInternalShowStateLabels] = useState<boolean>(true);
  const showStateLabels = propShowStateLabels !== undefined ? propShowStateLabels : internalShowStateLabels;
  const setShowStateLabels = propSetShowStateLabels || setInternalShowStateLabels;

  // Show Percentage of Samples Above Permissible Limit (% > PL) Toggle
  const [internalShowExceedancePct, setInternalShowExceedancePct] = useState<boolean>(true);
  const showExceedancePct = propShowExceedancePct !== undefined ? propShowExceedancePct : internalShowExceedancePct;
  const setShowExceedancePct = propSetShowExceedancePct || setInternalShowExceedancePct;

  // Zoom & Pan State
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Label Dragging / Moving State
  const [labelOffsets, setLabelOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingLabelKey, setDraggingLabelKey] = useState<string | null>(null);
  const labelDragStartRef = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number }>({
    mouseX: 0,
    mouseY: 0,
    initialX: 0,
    initialY: 0
  });

  const internalFileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = externalFileInputRef || internalFileInputRef;
  const dataFileInputRef = useRef<HTMLInputElement | null>(null);

  // 600 DPI Export state & container ref
  const mapExportContainerRef = useRef<HTMLDivElement | null>(null);
  const [isExportingJpeg, setIsExportingJpeg] = useState<boolean>(false);

  // High-Density 600 DPI JPEG Export Handler
  const handleExport600DpiJpeg = async () => {
    if (!mapExportContainerRef.current) return;
    setIsExportingJpeg(true);
    if (showToast) showToast("Rendering High Density 600 DPI JPEG image...", "success");

    const captureScale = 4; // ~400 DPI high-resolution capture

    try {
      const html2canvasModule = (await import("html2canvas")).default;
      let canvas: HTMLCanvasElement | null = null;

      // 1. Primary html2canvas capture attempt
      try {
        canvas = await html2canvasModule(mapExportContainerRef.current, {
          scale: captureScale,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
          ignoreElements: (el) => el.getAttribute("data-export-hide") === "true",
          onclone: (clonedDoc) => {
            // Remove elements marked to hide during export
            const hideEls = clonedDoc.querySelectorAll('[data-export-hide="true"]');
            hideEls.forEach((el) => el.remove());

            // Safely fix overflow on HTML div containers only (avoid SVG elements)
            const htmlDivs = clonedDoc.querySelectorAll("div, section, article, p, span");
            htmlDivs.forEach((el) => {
              if (el instanceof HTMLElement && el.style) {
                el.style.overflow = "visible";
              }
            });

            // Ensure tile image tags have crossorigin attribute
            const svgImages = clonedDoc.querySelectorAll("image");
            svgImages.forEach((img) => {
              const href = img.getAttribute("href") || img.getAttribute("xlink:href");
              if (href && href.startsWith("http") && !href.startsWith("data:")) {
                img.setAttribute("crossorigin", "anonymous");
              }
            });
          }
        });
      } catch (h2cErr) {
        console.warn("Primary html2canvas capture failed, trying fallback:", h2cErr);
      }

      // 2. Secondary fallback with lower scale if scale 4 failed
      if (!canvas) {
        try {
          canvas = await html2canvasModule(mapExportContainerRef.current, {
            scale: 2,
            useCORS: false,
            allowTaint: true,
            backgroundColor: "#ffffff",
            logging: false,
            ignoreElements: (el) => el.getAttribute("data-export-hide") === "true"
          });
        } catch (fErr) {
          console.warn("Secondary html2canvas fallback failed:", fErr);
        }
      }

      // 3. Direct SVG Vector Rasterization Fallback (100% reliable for SVG map layers)
      if (!canvas) {
        const svgEl = mapExportContainerRef.current.querySelector("svg");
        if (svgEl) {
          const svgData = new XMLSerializer().serializeToString(svgEl);
          const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
          const URLObj = window.URL || (window as any).webkitURL;
          const blobURL = URLObj.createObjectURL(svgBlob);

          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = blobURL;
          });

          const baseW = svgEl.clientWidth || 800;
          const baseH = svgEl.clientHeight || 750;
          const fallbackCanvas = document.createElement("canvas");
          fallbackCanvas.width = baseW * 6;
          fallbackCanvas.height = baseH * 6;

          const ctx = fallbackCanvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
            ctx.drawImage(img, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
            URLObj.revokeObjectURL(blobURL);
            canvas = fallbackCanvas;
          }
        }
      }

      if (!canvas) {
        throw new Error("Unable to capture map element for export");
      }

      // Trigger download helper
      const triggerDownload = (url: string) => {
        const link = document.createElement("a");
        const levelStr = reportingLevel ? reportingLevel.replace(/\s+/g, "_") : "Map";
        const paramStr = paramName ? paramName.replace(/\s+/g, "_") : "Param";
        link.download = `Choropleth_Map_${levelStr}_${paramStr}_600DPI.jpg`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };

      let exported = false;
      try {
        const blob = await new Promise<Blob | null>((resolve) => {
          try {
            canvas!.toBlob((b) => resolve(b), "image/jpeg", 0.95);
          } catch (e) {
            resolve(null);
          }
        });

        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          triggerDownload(blobUrl);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
          exported = true;
        }
      } catch (blobErr) {
        console.warn("toBlob failed, attempting toDataURL:", blobErr);
      }

      if (!exported) {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        triggerDownload(dataUrl);
      }

      if (showToast) showToast("Successfully exported High Density 600 DPI Map Image!", "success");
    } catch (err) {
      console.error("High Density JPEG Export Error:", err);
      if (showToast) showToast("Failed to generate 600 DPI JPEG image. Please try again.", "error");
    } finally {
      setIsExportingJpeg(false);
    }
  };

  // Check whether both data spreadsheet AND GIS shapefile are entered
  const hasData = Boolean(rawData && rawData.length > 0);
  const hasShapefile = Boolean(
    sharedLayers &&
    sharedLayers.length > 0 &&
    sharedLayers.some((l) => l.visible && l.geoJson)
  );
  const hasBothDataAndShapefile = hasData && hasShapefile;

  const handleDataFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);

      if (json && json.length > 0) {
        if (setRawData) {
          setRawData(json);
        }
        if (showToast) showToast(`Data loaded successfully: ${json.length} records`, "success");
      } else {
        if (showToast) showToast("Dataset appears to be empty", "error");
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Failed to parse Excel/CSV dataset", "error");
    }
  };

  const b2 = activeConfig?.b2 || 3000;
  const paramName = activeConfig?.name || activeParam;

  // Compute centroid for GeoJSON feature to place State/Region text label
  const getFeatureCentroid = (feature: any, width = 600, height = 550): [number, number] | null => {
    if (!feature.geometry || !feature.geometry.coordinates) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const processCoords = (coords: any[]) => {
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        const [x, y] = projectCoords(coords[0], coords[1], width, height);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        coords.forEach((c) => processCoords(c));
      }
    };

    processCoords(feature.geometry.coordinates);
    if (minX !== Infinity && maxX !== -Infinity) {
      return [(minX + maxX) / 2, (minY + maxY) / 2];
    }
    return null;
  };

  // Helper to get row numeric value
  const getRowVal = (row: any): number | null => {
    const colKey = headerMap[activeParam] || activeParam;
    if (row[colKey] !== undefined && row[colKey] !== null) {
      const v = parseFloat(row[colKey]);
      return isNaN(v) ? null : v;
    }
    return null;
  };

  // Calculate Exceedance Metrics grouped by State, District, or Block
  const regionMetricsMap = useMemo(() => {
    const map: Record<string, { total: number; exceed: number; pct: number; sum: number; validCount: number }> = {};

    const stateCol = headers.state || "State";
    const districtCol = headers.district || "District";
    const blockCol = headers.block || "Block";

    rawData.forEach((row) => {
      const st = String(row[stateCol] || "").trim();
      const dt = String(row[districtCol] || "").trim();
      const blk = String(row[blockCol] || row["BLOCK"] || row["Block"] || "").trim();

      let regKey = "";
      if (reportingLevel === "Block" || !isDistrictAll(selectedDistrict)) {
        regKey = blk || dt || st || "Unknown";
      } else if (reportingLevel === "District" || !isStateAll(selectedState)) {
        regKey = dt || st || "Unknown";
      } else {
        regKey = st || "Unknown";
      }
      const normKey = norm(regKey);

      if (!map[normKey]) {
        map[normKey] = { total: 0, exceed: 0, pct: 0, sum: 0, validCount: 0 };
      }

      const val = getRowVal(row);
      if (val !== null) {
        map[normKey].total++;
        map[normKey].sum += val;
        map[normKey].validCount++;

        if (activeParam === "pH") {
          if (val < 6.5 || val > 8.5) {
            map[normKey].exceed++;
          }
        } else {
          if (b2 > 0 && val > b2) {
            map[normKey].exceed++;
          }
        }
      }
    });

    // Compute percentages
    Object.keys(map).forEach((k) => {
      const item = map[k];
      item.pct = item.total > 0 ? (item.exceed / item.total) * 100 : 0;
    });

    return map;
  }, [rawData, activeParam, b2, headers, selectedState, selectedDistrict, reportingLevel]);

  // District to State mapping lookup
  const districtStateMap = useMemo(() => {
    return buildDistrictStateMap(rawData, headerMap, headers);
  }, [rawData, headerMap, headers]);

  // Find currently selected State object for locator map and centering
  const selectedStateObj = useMemo(() => {
    if (isStateAll(selectedState)) return null;
    return INDIA_STATES_SIMPLIFIED.find((s) => norm(s.name) === norm(selectedState || "")) || null;
  }, [selectedState]);

  // Auto-center and zoom onto selected State
  useEffect(() => {
    if (!isStateAll(selectedState) && selectedStateObj && selectedStateObj.center) {
      const [cx, cy] = selectedStateObj.center;
      setZoomLevel(2.2);
      setPanOffset({
        x: (300 - cx) * 2.2,
        y: (275 - cy) * 2.2
      });
    } else {
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }, [selectedState, selectedDistrict, selectedStateObj]);

  // Assign color to a region based on range classes
  const getRegionColor = (pct: number): { color: string; label: string } => {
    for (const rc of rangeClasses) {
      if (pct >= rc.minPct && pct <= rc.maxPct) {
        return { color: rc.color, label: rc.label };
      }
    }
    return { color: rangeClasses[rangeClasses.length - 1].color, label: rangeClasses[rangeClasses.length - 1].label };
  };

  // Helper to extract feature metric and region name matching regionMetricsMap
  const getFeatureMetricAndName = (feature: any) => {
    const props = feature.properties || {};

    const getPropVal = (candidateKeys: string[]): string => {
      for (const k of Object.keys(props)) {
        const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (candidateKeys.some((ck) => cleanK === ck || (ck.length >= 3 && cleanK.includes(ck)))) {
          const val = String(props[k] || "").trim();
          if (val) return val;
        }
      }
      return "";
    };

    const stateKeys = ["state", "statename", "stname", "stnm", "st", "name1", "state_name", "st_name", "st_nm", "adm1", "admin1", "state_n"];
    const districtKeys = ["district", "districtname", "distname", "dtname", "distnm", "dt", "name2", "dist_name", "dist_nm", "dt_name", "district_n", "district_name", "adm2", "admin2", "dname"];
    const blockKeys = ["block", "blockname", "blkname", "tehsil", "taluk", "subdist", "subdistrict", "name3", "adm3"];

    const featureState = getPropVal(stateKeys);
    const featureDistrict = getPropVal(districtKeys);
    const featureBlock = getPropVal(blockKeys);
    const featureName = String(props.name || props.Name || props.NAME || props.label || props.LABEL || "").trim();

    let displayName = "Region";
    if (reportingLevel === "Block" || !isDistrictAll(selectedDistrict)) {
      displayName = featureBlock || featureDistrict || featureState || featureName || "Region";
    } else if (reportingLevel === "District" || !isStateAll(selectedState)) {
      displayName = featureDistrict || featureState || featureName || featureBlock || "Region";
    } else {
      displayName = featureState || featureDistrict || featureName || featureBlock || "Region";
    }

    const candidates: string[] = [];
    if (reportingLevel === "Block" || !isDistrictAll(selectedDistrict)) {
      if (featureBlock) candidates.push(featureBlock);
      if (featureDistrict) candidates.push(featureDistrict);
      if (featureName) candidates.push(featureName);
      if (featureState) candidates.push(featureState);
    } else if (reportingLevel === "District" || !isStateAll(selectedState)) {
      if (featureDistrict) candidates.push(featureDistrict);
      if (featureBlock) candidates.push(featureBlock);
      if (featureName) candidates.push(featureName);
      if (featureState) candidates.push(featureState);
    } else {
      if (featureState) candidates.push(featureState);
      if (featureDistrict) candidates.push(featureDistrict);
      if (featureName) candidates.push(featureName);
      if (featureBlock) candidates.push(featureBlock);
    }

    // 1. Direct match
    for (const name of candidates) {
      const n = norm(name);
      if (n && regionMetricsMap[n] && regionMetricsMap[n].total > 0) {
        return { displayName: name, metric: regionMetricsMap[n] };
      }
    }

    // 2. Substring / fuzzy match
    for (const name of candidates) {
      const n = norm(name);
      if (!n) continue;
      for (const [mapKey, metricValUntyped] of Object.entries(regionMetricsMap)) {
        const metricVal = metricValUntyped as any;
        if (metricVal && metricVal.total > 0 && (mapKey === n || mapKey.includes(n) || n.includes(mapKey))) {
          return { displayName: name, metric: metricVal };
        }
      }
    }

    // 3. District to State fallback
    if (featureDistrict && districtStateMap) {
      const mappedSt = districtStateMap[featureDistrict.toLowerCase()] || districtStateMap[norm(featureDistrict)];
      if (mappedSt && regionMetricsMap[norm(mappedSt)] && regionMetricsMap[norm(mappedSt)].total > 0) {
        return { displayName: `${featureDistrict} (${mappedSt})`, metric: regionMetricsMap[norm(mappedSt)] };
      }
    }

    return {
      displayName,
      metric: { total: 0, exceed: 0, pct: 0, sum: 0, validCount: 0 }
    };
  };

  // Smartly select appropriate shapefile GeoJSON layer from sharedLayers
  const activeShapefileGeoJson = useMemo(() => {
    const visLayers = sharedLayers.filter((l) => l.visible && l.geoJson);
    if (visLayers.length === 0) return null;
    if (visLayers.length === 1) return visLayers[0].geoJson;

    // Multiple visible shapefiles uploaded (e.g. State Boundary & District Boundary & Block Boundary)
    const isAllSt = isStateAll(selectedState);
    const isAllDt = isDistrictAll(selectedDistrict);

    // Helper to check layer depth type from layer name and sample feature properties
    const getLayerType = (layer: ShapefileLayer) => {
      const nameLower = (layer.name || "").toLowerCase();
      const sampleFeature = layer.geoJson?.features?.[0] || layer.geoJson;
      const props = sampleFeature?.properties || {};
      const propKeys = Object.keys(props).map((k) => k.toLowerCase());

      const isBlock =
        nameLower.includes("block") ||
        propKeys.some((k) => k.includes("block") || k.includes("blk") || k.includes("tehsil") || k.includes("taluk"));
      if (isBlock) return "block";

      const isDist =
        nameLower.includes("district") ||
        nameLower.includes("dist") ||
        nameLower.includes("dt") ||
        propKeys.some((k) => k.includes("district") || k.includes("dist") || k.includes("dtname"));
      if (isDist) return "district";

      return "state";
    };

    if (!isAllDt || reportingLevel === "Block") {
      // Prioritize block layer if available, else district layer
      const blockLayer = visLayers.find((l) => getLayerType(l) === "block");
      if (blockLayer) return blockLayer.geoJson;
      const distLayer = visLayers.find((l) => getLayerType(l) === "district");
      if (distLayer) return distLayer.geoJson;
    } else if (!isAllSt || reportingLevel === "District") {
      // Prioritize district layer when state is selected
      const distLayer = visLayers.find((l) => getLayerType(l) === "district");
      if (distLayer) return distLayer.geoJson;
      const stateLayer = visLayers.find((l) => getLayerType(l) === "state");
      if (stateLayer) return stateLayer.geoJson;
    } else {
      // Prioritize state layer when All States selected
      const stateLayer = visLayers.find((l) => getLayerType(l) === "state");
      if (stateLayer) return stateLayer.geoJson;
      const distLayer = visLayers.find((l) => getLayerType(l) === "district");
      if (distLayer) return distLayer.geoJson;
    }

    return visLayers[0].geoJson;
  }, [sharedLayers, selectedState, selectedDistrict, reportingLevel]);

  // Extract Features from GeoJSON if present
  const geoFeatures = useMemo(() => {
    if (!activeShapefileGeoJson) {
      return [];
    }
    if (activeShapefileGeoJson.type === "FeatureCollection") {
      return activeShapefileGeoJson.features || [];
    }
    if (activeShapefileGeoJson.type === "Feature") {
      return [activeShapefileGeoJson];
    }
    return [];
  }, [activeShapefileGeoJson]);

  // Region Counts for Legend
  const rangeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rangeClasses.forEach((rc) => (counts[rc.id] = 0));

    Object.values(regionMetricsMap).forEach((m: { total: number; exceed: number; pct: number; sum: number; validCount: number }) => {
      if (m.total > 0) {
        for (const rc of rangeClasses) {
          if (m.pct >= rc.minPct && m.pct <= rc.maxPct) {
            counts[rc.id] = (counts[rc.id] || 0) + 1;
            break;
          }
        }
      }
    });

    return counts;
  }, [regionMetricsMap, rangeClasses]);

  // Top 5 Exceeding Regions for Map Display / Image Export
  const top5ExceedingRegions = useMemo(() => {
    const list: { name: string; pct: number; exceed: number; total: number }[] = [];
    Object.entries(regionMetricsMap).forEach(([normName, metricUntyped]) => {
      const metric = metricUntyped as any;
      if (metric && metric.total >= 1) {
        let displayName = normName;
        for (const f of geoFeatures) {
          const res = getFeatureMetricAndName(f);
          if (norm(res.displayName) === normName || normName.includes(norm(res.displayName))) {
            displayName = res.displayName;
            break;
          }
        }
        displayName = toProperCase(displayName);
        list.push({
          name: displayName,
          pct: metric.pct,
          exceed: metric.exceed,
          total: metric.total
        });
      }
    });
    list.sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;
      return b.exceed - a.exceed;
    });
    return list.slice(0, 5);
  }, [regionMetricsMap, geoFeatures]);

  // Shapefile Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const geoJson = await shp(buffer);

      const newLayer: ShapefileLayer = {
        id: `shapefile-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        geoJson: Array.isArray(geoJson) ? geoJson[0] : geoJson,
        visible: true,
        strokeColor: "#ffffff",
        strokeWidth: 1,
        fillColor: "#3b82f6",
        fillOpacity: 0.85,
        showLabels: true,
        labelKey: "STNAME",
        labelColor: "#000000",
        labelSize: 10
      };

      if (setSharedLayers) {
        setSharedLayers((prev) => [...prev, newLayer]);
      }

      if (showToast) showToast(`Loaded shapefile layer: ${file.name}`, "success");
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Failed to parse shapefile zip", "error");
    }
  };

  // Initiate drag for a specific text label
  const startLabelDrag = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingLabelKey(key);
    const currentOffset = labelOffsets[key] || { x: 0, y: 0 };
    labelDragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: currentOffset.x,
      initialY: currentOffset.y
    };
  };

  // Global mousemove / mouseup listener when dragging labels to ensure smooth motion across the entire screen
  useEffect(() => {
    if (!draggingLabelKey) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - labelDragStartRef.current.mouseX) / zoomLevel;
      const dy = (e.clientY - labelDragStartRef.current.mouseY) / zoomLevel;
      setLabelOffsets((prev) => ({
        ...prev,
        [draggingLabelKey]: {
          x: labelDragStartRef.current.initialX + dx,
          y: labelDragStartRef.current.initialY + dy
        }
      }));
    };

    const handleWindowMouseUp = () => {
      setDraggingLabelKey(null);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [draggingLabelKey, zoomLevel]);

  // Handle Drag / Pan for Map Canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    if (draggingLabelKey) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingLabelKey) {
      const dx = (e.clientX - labelDragStartRef.current.mouseX) / zoomLevel;
      const dy = (e.clientY - labelDragStartRef.current.mouseY) / zoomLevel;
      setLabelOffsets((prev) => ({
        ...prev,
        [draggingLabelKey]: {
          x: labelDragStartRef.current.initialX + dx,
          y: labelDragStartRef.current.initialY + dy
        }
      }));
      return;
    }
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggingLabelKey(null);
  };

  // Filter GeoJSON features based on selected state and district filters
  const filteredGeoFeatures = useMemo(() => {
    if (geoFeatures.length === 0) return [];
    if (isStateAll(selectedState) && isDistrictAll(selectedDistrict)) {
      return geoFeatures;
    }
    return geoFeatures.filter((f: any) =>
      featureMatchesSelection(f, selectedState, selectedDistrict, districtStateMap)
    );
  }, [geoFeatures, selectedState, selectedDistrict, districtStateMap]);

  // Bounding box calculation for ALL GeoJSON features (used by Location Locator Inset Map)
  const allGeoBounds = useMemo(() => {
    if (geoFeatures.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const processCoords = (coords: any[]) => {
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        const [x, y] = coords;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        coords.forEach((c) => processCoords(c));
      }
    };

    geoFeatures.forEach((f: any) => {
      if (f.geometry && f.geometry.coordinates) {
        processCoords(f.geometry.coordinates);
      }
    });

    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
  }, [geoFeatures]);

  // Bounding box calculation for MAIN MAP (auto-fits filtered features when State / District / Block is selected)
  const mainGeoBounds = useMemo(() => {
    const featuresToFit = filteredGeoFeatures.length > 0 ? filteredGeoFeatures : geoFeatures;
    if (featuresToFit.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const processCoords = (coords: any[]) => {
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        const [x, y] = coords;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        coords.forEach((c) => processCoords(c));
      }
    };

    featuresToFit.forEach((f: any) => {
      if (f.geometry && f.geometry.coordinates) {
        processCoords(f.geometry.coordinates);
      }
    });

    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
  }, [geoFeatures, filteredGeoFeatures]);

  // Project Lon/Lat to Canvas X/Y
  const projectCoords = (lon: number, lat: number, width = 600, height = 550, customBounds = mainGeoBounds): [number, number] => {
    if (!customBounds) {
      // Fallback projection for standard India lat/lon
      const x = ((lon - 68) / (98 - 68)) * (width - 80) + 40;
      const y = height - (((lat - 6) / (37 - 6)) * (height - 80) + 40);
      return [x, y];
    }

    const pad = 40;
    const { minX, minY, maxX, maxY } = customBounds;
    const scaleX = (width - pad * 2) / (maxX - minX || 1);
    const scaleY = (height - pad * 2) / (maxY - minY || 1);
    const scale = Math.min(scaleX, scaleY);

    const x = (lon - minX) * scale + pad;
    const y = height - ((lat - minY) * scale + pad);
    return [x, y];
  };

  // Geographical bounds for Base Map tile calculation
  const boundsForTiles = useMemo(() => {
    if (mainGeoBounds) return mainGeoBounds;
    return { minX: 68.0, maxX: 98.0, minY: 6.0, maxY: 37.0 };
  }, [mainGeoBounds]);

  // Compute slippy map tile list for Esri Terrain, Google Earth Satellite, Esri Topo
  const baseMapTiles = useMemo(() => {
    if (baseMapType === "vector") return [];

    // Calculate canvas outer lon/lat extent to cover 100% of the 600x550 SVG area
    let minLon = 68.0, maxLon = 98.0, minLat = 6.0, maxLat = 37.0;

    if (mainGeoBounds) {
      const pad = 40;
      const { minX, minY, maxX, maxY } = mainGeoBounds;
      const scaleX = (600 - pad * 2) / (maxX - minX || 1);
      const scaleY = (550 - pad * 2) / (maxY - minY || 1);
      const scale = Math.min(scaleX, scaleY);

      // Invert projection for canvas bounds [-150, -150] to [750, 700] to ensure complete coverage across whole canvas
      minLon = (-150 - pad) / scale + minX;
      maxLon = (750 - pad) / scale + minX;
      maxLat = (550 - pad - (-150)) / scale + minY;
      minLat = (550 - pad - 700) / scale + minY;
    } else {
      minLon = 60.0;
      maxLon = 105.0;
      minLat = 2.0;
      maxLat = 40.0;
    }

    // Clamp latitudes to Web Mercator limits (-85 to 85)
    minLat = Math.max(-85, Math.min(85, minLat));
    maxLat = Math.max(-85, Math.min(85, maxLat));

    const lonSpan = Math.abs(maxLon - minLon);

    let calcZoom = 5;
    if (lonSpan < 3) calcZoom = 9;
    else if (lonSpan < 7) calcZoom = 8;
    else if (lonSpan < 15) calcZoom = 7;
    else if (lonSpan < 25) calcZoom = 6;

    const effectiveZoom = Math.min(12, Math.max(3, calcZoom + Math.floor(zoomLevel - 1)));

    const minTileX = Math.max(0, lon2tile(minLon, effectiveZoom));
    const maxTileX = Math.min(Math.pow(2, effectiveZoom) - 1, lon2tile(maxLon, effectiveZoom));
    const minTileY = Math.max(0, lat2tile(maxLat, effectiveZoom));
    const maxTileY = Math.min(Math.pow(2, effectiveZoom) - 1, lat2tile(minLat, effectiveZoom));

    const tiles: { id: string; url: string; x: number; y: number; width: number; height: number }[] = [];
    let count = 0;
    const tileLimit = 200;

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        if (count >= tileLimit) break;

        const wLon = tile2lon(tx, effectiveZoom);
        const eLon = tile2lon(tx + 1, effectiveZoom);
        const nLat = tile2lat(ty, effectiveZoom);
        const sLat = tile2lat(ty + 1, effectiveZoom);

        const [xNW, yNW] = projectCoords(wLon, nLat, 600, 550, mainGeoBounds);
        const [xSE, ySE] = projectCoords(eLon, sLat, 600, 550, mainGeoBounds);

        const x = Math.min(xNW, xSE);
        const y = Math.min(yNW, ySE);
        const width = Math.abs(xSE - xNW);
        const height = Math.abs(ySE - yNW);

        let url = "";
        if (baseMapType === "esri-terrain") {
          url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/${effectiveZoom}/${ty}/${tx}`;
        } else if (baseMapType === "google-earth") {
          url = `https://mt1.google.com/vt/lyrs=s&x=${tx}&y=${ty}&z=${effectiveZoom}`;
        } else if (baseMapType === "google-hybrid") {
          url = `https://mt1.google.com/vt/lyrs=y&x=${tx}&y=${ty}&z=${effectiveZoom}`;
        } else if (baseMapType === "esri-topo") {
          url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${effectiveZoom}/${ty}/${tx}`;
        }

        if (url && width > 0.05 && height > 0.05) {
          tiles.push({ id: `${baseMapType}-${effectiveZoom}-${tx}-${ty}`, url, x, y, width, height });
          count++;
        }
      }
    }
    return tiles;
  }, [baseMapType, mainGeoBounds, zoomLevel]);

  // Convert Polygon coordinates to SVG path string
  const coordsToSvgPath = (coordinates: any[], width = 600, height = 550, customBounds = mainGeoBounds): string => {
    if (!coordinates || coordinates.length === 0) return "";

    const formatRing = (ring: number[][]) => {
      return ring
        .map((pt, i) => {
          const [x, y] = projectCoords(pt[0], pt[1], width, height, customBounds);
          return `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ") + " Z";
    };

    if (typeof coordinates[0][0] === "number") {
      return formatRing(coordinates as unknown as number[][]);
    }

    return coordinates.map((ring) => formatRing(ring)).join(" ");
  };

  // Helper to calculate projected center of a feature
  const getFeatureProjectedCenter = (feature: any, width = 600, height = 550, customBounds = mainGeoBounds): [number, number] | null => {
    if (!feature?.geometry?.coordinates) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const processCoords = (coords: any[]) => {
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        const [x, y] = coords;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        coords.forEach((c) => processCoords(c));
      }
    };
    processCoords(feature.geometry.coordinates);
    if (minX === Infinity) return null;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    return projectCoords(midX, midY, width, height, customBounds);
  };

  // Selected feature projected center for locator pin in Location Locator Inset Map
  const selectedFeatureCenterInset = useMemo(() => {
    if (geoFeatures.length === 0) return null;
    const matchingFeature = geoFeatures.find((f: any) =>
      featureMatchesSelection(f, selectedState, selectedDistrict, districtStateMap)
    );
    if (!matchingFeature) return null;
    return getFeatureProjectedCenter(matchingFeature, 600, 550, allGeoBounds);
  }, [geoFeatures, selectedState, selectedDistrict, districtStateMap, allGeoBounds]);

  return (
    <div ref={mapExportContainerRef} className="flex flex-col space-y-3 font-sans relative bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
      {/* MAP HEADER BANNER */}
      <div className="flex items-center justify-between gap-3 bg-[#1a2356] text-white py-2.5 px-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-amber-300 shrink-0" />
          <span className="font-extrabold text-xs sm:text-sm tracking-wide text-white">
            Choropleth Map: {toProperCase(reportingLevel)} Level ({toProperCase(paramName)})
          </span>
        </div>

        {/* Hidden Shapefile & Dataset File Inputs */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".zip"
          className="hidden"
        />
        <input
          type="file"
          ref={dataFileInputRef}
          onChange={handleDataFileUpload}
          accept=".xlsx,.xls,.csv"
          className="hidden"
        />

        <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
          {/* HIGH DENSITY 600 DPI JPEG EXPORT BUTTON */}
          <button
            data-export-hide="true"
            onClick={handleExport600DpiJpeg}
            disabled={isExportingJpeg}
            className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 shrink-0"
            title="Save Choropleth Map as High Density 600 DPI JPEG Image"
          >
            {isExportingJpeg ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
            ) : (
              <FileImage className="w-3.5 h-3.5 text-slate-950" />
            )}
            <span>{isExportingJpeg ? "Exporting..." : "Save 600 DPI JPEG"}</span>
          </button>

          <span className="bg-indigo-900/80 px-2.5 py-1 rounded-lg border border-indigo-700/60 text-amber-300 font-extrabold">
            {filteredGeoFeatures.length > 0 ? `${filteredGeoFeatures.length} Regions` : (rawData && rawData.length > 0 ? "National View" : "0 Regions")}
          </span>
        </div>
      </div>

      {/* SVG CANVAS CONTAINER */}
      <div
        className={`bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs relative transition-all select-none cursor-grab active:cursor-grabbing ${
          showGisAnalysis ? "h-[620px] sm:h-[680px]" : "h-[740px] sm:h-[820px]"
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* UPPER-LEFT LOCATION LOCATOR INSET MAP WINDOW */}
        {(!isStateAll(selectedState) || !isDistrictAll(selectedDistrict)) && (
          <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md border-2 border-[#1a2356] rounded-xl p-2 shadow-xl flex flex-col items-center w-40 sm:w-44 z-30 select-none animate-in fade-in duration-200">
            <div className="flex items-center justify-between w-full border-b border-slate-200 pb-1 mb-1">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                <span className="text-[10px] font-black uppercase text-[#1a2356] tracking-tight">
                  Location Locator
                </span>
              </div>
              <span className="text-[9px] font-bold text-slate-600 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded">
                {!isDistrictAll(selectedDistrict) ? "District" : "State"}
              </span>
            </div>

            {/* MINI OVERVIEW MAP */}
            <div className="w-full h-28 sm:h-32 relative flex items-center justify-center bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-inner">
              <svg viewBox="0 0 600 550" className="w-full h-full">
                {geoFeatures.length > 0 ? (
                  /* RENDER ALL UPLOADED SHAPEFILE BOUNDARIES IN THE INSET LOCATOR MAP WITH EXPLICIT SELECTION HIGHLIGHT */
                  geoFeatures.map((f: any, idx: number) => {
                    const isSelected = featureMatchesSelection(f, selectedState, selectedDistrict, districtStateMap);
                    const dPath =
                      f.geometry?.type === "Polygon"
                        ? coordsToSvgPath(f.geometry.coordinates, 600, 550, allGeoBounds)
                        : f.geometry?.type === "MultiPolygon"
                        ? f.geometry.coordinates.map((poly: any) => coordsToSvgPath(poly, 600, 550, allGeoBounds)).join(" ")
                        : "";
                    if (!dPath) return null;
                    return (
                      <path
                        key={`inset-geo-${idx}`}
                        d={dPath}
                        fill={isSelected ? "#dc2626" : "#cbd5e1"}
                        fillOpacity={isSelected ? 0.95 : 0.45}
                        stroke={isSelected ? "#7f1d1d" : "#94a3b8"}
                        strokeWidth={isSelected ? 2.5 : 0.8}
                      />
                    );
                  })
                ) : (
                  /* FALLBACK SIMPLIFIED INDIA MAP */
                  INDIA_STATES_SIMPLIFIED.map((st) => {
                    const isSelectedSt = norm(st.name) === norm(selectedState || "");
                    return (
                      <path
                        key={`inset-st-${st.name}`}
                        d={st.path}
                        fill={isSelectedSt ? "#dc2626" : "#cbd5e1"}
                        fillOpacity={isSelectedSt ? 0.95 : 0.45}
                        stroke={isSelectedSt ? "#7f1d1d" : "#94a3b8"}
                        strokeWidth={isSelectedSt ? 2.5 : 0.8}
                      />
                    );
                  })
                )}

                {/* Pulsing Pin Marker on Selected Location Center */}
                {selectedFeatureCenterInset ? (
                  <g transform={`translate(${selectedFeatureCenterInset[0]}, ${selectedFeatureCenterInset[1]})`}>
                    <circle r="8" fill="#f59e0b" className="animate-ping opacity-80" />
                    <circle r="4" fill="#dc2626" stroke="#ffffff" strokeWidth="1.5" />
                  </g>
                ) : selectedStateObj && selectedStateObj.center ? (
                  <g transform={`translate(${selectedStateObj.center[0]}, ${selectedStateObj.center[1]})`}>
                    <circle r="8" fill="#f59e0b" className="animate-ping opacity-80" />
                    <circle r="4" fill="#dc2626" stroke="#ffffff" strokeWidth="1.5" />
                  </g>
                ) : null}
              </svg>
            </div>

            <div className="mt-1.5 w-full text-center bg-[#1a2356] text-amber-300 font-black text-[10px] py-1 px-1 rounded-md truncate shadow-xs">
              ★ {!isDistrictAll(selectedDistrict) ? `${selectedDistrict}, ${selectedState}` : selectedState}
            </div>
          </div>
        )}

        {/* MAP ZOOM & LAYER CONTROLS OVERLAY */}
        <div data-export-hide="true" className={`absolute top-3 ${(!isStateAll(selectedState) || !isDistrictAll(selectedDistrict)) ? "left-48 sm:left-52" : "left-3"} bg-white/95 backdrop-blur-xs border border-slate-200 rounded-2xl p-1.5 flex flex-col gap-1 shadow-md z-20 transition-all duration-300`}>
          <button
            onClick={() => setZoomLevel((z) => Math.min(3.5, z + 0.25))}
            className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-700 transition-all cursor-pointer"
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.25))}
            className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-700 transition-all cursor-pointer"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setZoomLevel(1);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-700 transition-all cursor-pointer border-t border-slate-100"
            title="Reset Map View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowExceedancePct(!showExceedancePct)}
            className={`p-1.5 rounded-xl transition-all cursor-pointer border-t border-slate-100 flex items-center justify-center ${
              showExceedancePct ? "bg-rose-600 text-white hover:bg-rose-700 shadow-xs" : "hover:bg-slate-100 text-slate-700"
            }`}
            title={showExceedancePct ? "Hide % > PL on map labels" : "Show Percentage of Samples Exceeding Permissible Limit (% > PL) on map labels"}
          >
            <Percent className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsBaseMapMenuOpen(!isBaseMapMenuOpen)}
            className={`p-1.5 rounded-xl transition-all cursor-pointer border-t border-slate-100 flex items-center justify-center ${
              baseMapType !== "vector" ? "bg-amber-500 text-slate-950 font-black shadow-xs hover:bg-amber-400" : "hover:bg-slate-100 text-slate-700"
            }`}
            title="Base Map Facility: Esri Terrain, Google Earth Satellite, Esri Topo"
          >
            <Mountain className="w-4 h-4" />
          </button>
          <button
            onClick={() => setLabelOffsets({})}
            className={`p-1.5 rounded-xl transition-all cursor-pointer border-t border-slate-100 flex items-center justify-center ${
              Object.keys(labelOffsets).length > 0
                ? "bg-amber-500 text-slate-950 font-extrabold shadow-xs hover:bg-amber-400"
                : "hover:bg-slate-100 text-slate-700"
            }`}
            title={Object.keys(labelOffsets).length > 0 ? "Reset moved labels back to original positions" : "Label Moving Facility: Click & drag any text label on the map"}
          >
            <Move className="w-4 h-4" />
          </button>

          <button
            onClick={handleExport600DpiJpeg}
            disabled={isExportingJpeg}
            className="p-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl transition-all cursor-pointer border-t border-amber-600 flex items-center justify-center shadow-xs disabled:opacity-50"
            title="Save High Density 600 DPI JPEG Image (Choropleth Map Only)"
          >
            {isExportingJpeg ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <FileImage className="w-4 h-4 text-slate-950" />}
          </button>
        </div>

        {/* BASE MAP SELECTION OVERLAY POPOVER PANEL */}
        {isBaseMapMenuOpen && (
          <div data-export-hide="true" className={`absolute top-3 ${(!isStateAll(selectedState) || !isDistrictAll(selectedDistrict)) ? "left-60 sm:left-64" : "left-14 sm:left-16"} bg-white/98 backdrop-blur-md border border-slate-300 rounded-2xl p-3.5 shadow-2xl z-30 w-72 sm:w-80 animate-in fade-in zoom-in-95 duration-150`}>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <div className="flex items-center gap-1.5 text-indigo-950 font-black text-xs">
                <Mountain className="w-4 h-4 text-amber-600" />
                <span>Base Map Facility</span>
              </div>
              <button
                onClick={() => setIsBaseMapMenuOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 mb-3">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">Select Base Map Layer</label>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  onClick={() => setBaseMapType("vector")}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    baseMapType === "vector"
                      ? "bg-indigo-900 text-white border-indigo-950 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Clean Vector Canvas</span>
                  </div>
                  {baseMapType === "vector" && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </button>

                <button
                  onClick={() => setBaseMapType("esri-terrain")}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    baseMapType === "esri-terrain"
                      ? "bg-amber-600 text-white border-amber-700 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Mountain className="w-3.5 h-3.5 text-amber-300" />
                    <span>Esri World Terrain (Relief)</span>
                  </div>
                  {baseMapType === "esri-terrain" && <Check className="w-3.5 h-3.5 text-white" />}
                </button>

                <button
                  onClick={() => setBaseMapType("google-earth")}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    baseMapType === "google-earth"
                      ? "bg-emerald-700 text-white border-emerald-800 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Google Earth / Satellite</span>
                  </div>
                  {baseMapType === "google-earth" && <Check className="w-3.5 h-3.5 text-white" />}
                </button>

                <button
                  onClick={() => setBaseMapType("google-hybrid")}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    baseMapType === "google-hybrid"
                      ? "bg-teal-700 text-white border-teal-800 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-teal-300" />
                    <span>Google Hybrid (Satellite + Labels)</span>
                  </div>
                  {baseMapType === "google-hybrid" && <Check className="w-3.5 h-3.5 text-white" />}
                </button>

                <button
                  onClick={() => setBaseMapType("esri-topo")}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    baseMapType === "esri-topo"
                      ? "bg-blue-700 text-white border-blue-800 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MapIcon className="w-3.5 h-3.5 text-blue-300" />
                    <span>Esri World Topographic</span>
                  </div>
                  {baseMapType === "esri-topo" && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              </div>
            </div>

            {/* OPACITY SLIDERS */}
            {baseMapType !== "vector" && (
              <div className="pt-2.5 border-t border-slate-200 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-700 mb-1">
                    <span>Base Map Opacity</span>
                    <span className="text-amber-700">{Math.round(basemapOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.0"
                    step="0.05"
                    value={basemapOpacity}
                    onChange={(e) => setBasemapOpacity(parseFloat(e.target.value))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-700 mb-1">
                    <span>Choropleth Color Fill Opacity</span>
                    <span className="text-indigo-700">{Math.round(polygonOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.0"
                    step="0.05"
                    value={polygonOpacity}
                    onChange={(e) => setPolygonOpacity(parseFloat(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* COMPASS ROSE OVERLAY */}
        <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-2xl p-2 flex flex-col items-center justify-center shadow-md z-20 pointer-events-none">
          <span className="text-[10px] font-black text-red-600 leading-none">N</span>
          <Compass className="w-5 h-5 text-slate-700 my-0.5" />
        </div>

        {/* MAIN SVG MAP RENDERER */}
        <svg
          className="w-full h-full overflow-visible"
          viewBox="0 0 600 550"
          preserveAspectRatio="xMidYMid meet"
          style={{ overflow: "visible" }}
        >
          <g
            transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}
            style={{ transformOrigin: "300px 275px" }}
            className="transition-transform duration-75"
          >
            {/* LAYER 0: BASE MAP RASTER TILES LAYER (ESRI TERRAIN / GOOGLE EARTH SATELLITE / ESRI TOPO) */}
            {baseMapType !== "vector" && baseMapTiles.length > 0 && (
              <g id="kpi-map-basemap-layer" opacity={basemapOpacity}>
                {baseMapTiles.map((tile) => (
                  <image
                    key={tile.id}
                    href={tile.url}
                    x={tile.x}
                    y={tile.y}
                    width={tile.width}
                    height={tile.height}
                    preserveAspectRatio="none"
                  />
                ))}
              </g>
            )}

            {/* LAYER 1: POLYGONS LAYER */}
            <g id="kpi-map-polygons-layer">
              {filteredGeoFeatures.length > 0 ? (
                filteredGeoFeatures.map((feature: any, idx: number) => {
                  const { displayName, metric } = getFeatureMetricAndName(feature);
                  const { color, label } = getRegionColor(metric.pct);

                  const dPath =
                    feature.geometry?.type === "Polygon"
                      ? coordsToSvgPath(feature.geometry.coordinates)
                      : feature.geometry?.type === "MultiPolygon"
                      ? feature.geometry.coordinates.map((poly: any) => coordsToSvgPath(poly)).join(" ")
                      : "";

                  if (!dPath) return null;

                  return (
                    <path
                      key={`geo-poly-${idx}`}
                      d={dPath}
                      fill={metric.total > 0 ? color : "#e2e8f0"}
                      fillOpacity={baseMapType !== "vector" ? polygonOpacity : 0.88}
                      stroke="#ffffff"
                      strokeWidth={0.8 / zoomLevel}
                      className="transition-all duration-150 cursor-pointer hover:fill-opacity-100 hover:stroke-indigo-900"
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredRegion({
                          name: displayName,
                          total: metric.total,
                          exceed: metric.exceed,
                          pct: metric.pct,
                          meanVal: metric.validCount > 0 ? metric.sum / metric.validCount : null,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 10,
                          color,
                          rangeLabel: label
                        });
                      }}
                      onMouseLeave={() => setHoveredRegion(null)}
                    />
                  );
                })
              ) : (
                /* FALLBACK BUILT-IN SIMPLIFIED INDIA MAP POLYGONS */
                INDIA_STATES_SIMPLIFIED.map((st) => {
                  const normName = norm(st.name);
                  const isSelSt = !isStateAll(selectedState) && normName === norm(selectedState || "");
                  const isOtherStFaded = !isStateAll(selectedState) && !isSelSt;

                  const metric = regionMetricsMap[normName] || { total: 0, exceed: 0, pct: 0, sum: 0, validCount: 0 };
                  const { color, label } = getRegionColor(metric.pct);

                  return (
                    <path
                      key={`st-poly-${st.name}`}
                      d={st.path}
                      fill={isOtherStFaded ? "#f1f5f9" : color}
                      fillOpacity={isOtherStFaded ? 0.25 : 0.88}
                      stroke={isSelSt ? "#1a2356" : "#ffffff"}
                      strokeWidth={(isSelSt ? 2.5 : 1.2) / zoomLevel}
                      className="transition-all duration-200 cursor-pointer hover:fill-opacity-100 hover:stroke-indigo-950"
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredRegion({
                          name: st.name,
                          total: metric.total,
                          exceed: metric.exceed,
                          pct: metric.pct,
                          meanVal: metric.validCount > 0 ? metric.sum / metric.validCount : null,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 10,
                          color,
                          rangeLabel: label
                        });
                      }}
                      onMouseLeave={() => setHoveredRegion(null)}
                    />
                  );
                })
              )}
            </g>

            {/* LAYER 2: UPPER TEXT LABELS LAYER (Renders on top of all polygons) */}
            {showStateLabels && (
              <g id="kpi-map-labels-upper-layer">
                {filteredGeoFeatures.length > 0 ? (
                  filteredGeoFeatures.map((feature: any, idx: number) => {
                    const { displayName, metric } = getFeatureMetricAndName(feature);
                    const centroid = getFeatureProjectedCenter(feature, 600, 550, mainGeoBounds);
                    if (!centroid) return null;

                    const labelKey = `geo-${displayName}-${idx}`;
                    const offset = labelOffsets[labelKey] || { x: 0, y: 0 };
                    const showPct = showExceedancePct;

                    const lx = centroid[0] + offset.x;
                    const ly = centroid[1] + offset.y;

                    const nameY = showPct ? ly - (4.0 / zoomLevel) : ly;
                    const pctY = ly + (5.0 / zoomLevel);

                    const isShifted = Math.abs(offset.x) > 0.5 || Math.abs(offset.y) > 0.5;

                    const textLen = Math.max(displayName.length, showPct ? 6 : 0);
                    const bgW = Math.max(26 / zoomLevel, (textLen * 5.4 + 6) / zoomLevel);
                    const bgH = (showPct ? 20 : 13) / zoomLevel;
                    const bgX = lx - bgW / 2;
                    const bgY = ly - bgH / 2;

                    return (
                      <g
                        key={`geo-label-grp-${idx}`}
                        className="cursor-grab active:cursor-grabbing select-none"
                      >
                        {/* Name Text Halo Outline */}
                        <text
                          x={lx}
                          y={nameY}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth={3.5 / zoomLevel}
                          strokeLinejoin="round"
                          fontSize={Math.max(6.5, 9.5 / zoomLevel)}
                          fontWeight="900"
                          textAnchor="middle"
                          dominantBaseline="central"
                          pointerEvents="none"
                        >
                          {displayName}
                        </text>

                        {/* Name Text Fill */}
                        <text
                          x={lx}
                          y={nameY}
                          fill="#0f172a"
                          fontSize={Math.max(6.5, 9.5 / zoomLevel)}
                          fontWeight="900"
                          textAnchor="middle"
                          dominantBaseline="central"
                          pointerEvents="all"
                          className="cursor-grab active:cursor-grabbing hover:fill-amber-600 transition-colors"
                          onMouseDown={(e) => startLabelDrag(e, labelKey)}
                        >
                          {displayName}
                        </text>

                        {/* Percentage Exceedance Text Label with Halo */}
                        {showPct && (
                          <>
                            <text
                              x={lx}
                              y={pctY}
                              fill="none"
                              stroke="#ffffff"
                              strokeWidth={3.5 / zoomLevel}
                              strokeLinejoin="round"
                              fontSize={Math.max(5.5, 8.5 / zoomLevel)}
                              fontWeight="900"
                              textAnchor="middle"
                              dominantBaseline="central"
                              pointerEvents="none"
                            >
                              {metric.pct.toFixed(1)}%
                            </text>
                            <text
                              x={lx}
                              y={pctY}
                              fill={metric.pct > 0 ? "#b91c1c" : "#047857"}
                              fontSize={Math.max(5.5, 8.5 / zoomLevel)}
                              fontWeight="900"
                              textAnchor="middle"
                              dominantBaseline="central"
                              pointerEvents="all"
                              className="cursor-grab active:cursor-grabbing"
                              onMouseDown={(e) => startLabelDrag(e, labelKey)}
                            >
                              {metric.pct.toFixed(1)}%
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })
                ) : (
                  INDIA_STATES_SIMPLIFIED.map((st) => {
                    const normName = norm(st.name);
                    const metric = regionMetricsMap[normName] || { total: 0, exceed: 0, pct: 0, sum: 0, validCount: 0 };
                    const labelKey = `st-${st.name}`;
                    const offset = labelOffsets[labelKey] || { x: 0, y: 0 };
                    const showPct = showExceedancePct;

                    const lx = st.center[0] + offset.x;
                    const ly = st.center[1] + offset.y;

                    const nameY = showPct ? ly - (4.0 / zoomLevel) : ly;
                    const pctY = ly + (5.0 / zoomLevel);

                    const isShifted = Math.abs(offset.x) > 0.5 || Math.abs(offset.y) > 0.5;

                    return (
                      <g
                        key={`st-label-grp-${st.name}`}
                        className="cursor-grab active:cursor-grabbing select-none"
                      >
                        {/* State Name Halo Outline */}
                        <text
                          x={lx}
                          y={nameY}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth={3.5 / zoomLevel}
                          strokeLinejoin="round"
                          fontSize={Math.max(6.5, 9.5 / zoomLevel)}
                          fontWeight="900"
                          textAnchor="middle"
                          dominantBaseline="central"
                          pointerEvents="none"
                        >
                          {st.name}
                        </text>

                        {/* State Name Fill */}
                        <text
                          x={lx}
                          y={nameY}
                          fill="#0f172a"
                          fontSize={Math.max(6.5, 9.5 / zoomLevel)}
                          fontWeight="900"
                          textAnchor="middle"
                          dominantBaseline="central"
                          pointerEvents="all"
                          className="cursor-grab active:cursor-grabbing hover:fill-amber-600 transition-colors"
                          onMouseDown={(e) => startLabelDrag(e, labelKey)}
                        >
                          {st.name}
                        </text>

                        {/* Percentage Exceedance Text Label with Halo */}
                        {showPct && (
                          <>
                            <text
                              x={lx}
                              y={pctY}
                              fill="none"
                              stroke="#ffffff"
                              strokeWidth={3.5 / zoomLevel}
                              strokeLinejoin="round"
                              fontSize={Math.max(5.5, 8.5 / zoomLevel)}
                              fontWeight="900"
                              textAnchor="middle"
                              dominantBaseline="central"
                              pointerEvents="none"
                            >
                              {metric.pct.toFixed(1)}%
                            </text>
                            <text
                              x={lx}
                              y={pctY}
                              fill={metric.pct > 0 ? "#b91c1c" : "#047857"}
                              fontSize={Math.max(5.5, 8.5 / zoomLevel)}
                              fontWeight="900"
                              textAnchor="middle"
                              dominantBaseline="central"
                              pointerEvents="all"
                              className="cursor-grab active:cursor-grabbing"
                              onMouseDown={(e) => startLabelDrag(e, labelKey)}
                            >
                              {metric.pct.toFixed(1)}%
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })
                )}
              </g>
            )}
          </g>
        </svg>

        {/* FLOATING HOVER TOOLTIP CARD */}
        {hoveredRegion && (
          <div
            className="fixed z-50 bg-slate-900/95 text-white border border-slate-700 rounded-2xl p-3 shadow-2xl backdrop-blur-md pointer-events-none transform -translate-x-1/2 -translate-y-full min-w-[200px]"
            style={{ left: `${hoveredRegion.x}px`, top: `${hoveredRegion.y}px` }}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
              <span className="font-extrabold text-sm text-white">{hoveredRegion.name}</span>
              <span
                className="w-3 h-3 rounded-full border border-white/50 shrink-0"
                style={{ backgroundColor: hoveredRegion.color }}
              />
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between gap-3 text-slate-300">
                <span>Samples Analysed:</span>
                <span className="font-bold text-white">{hoveredRegion.total}</span>
              </div>
              <div className="flex justify-between gap-3 text-slate-300">
                <span>Exceeding Stations:</span>
                <span className="font-bold text-amber-400">{hoveredRegion.exceed}</span>
              </div>
              <div className="flex justify-between gap-3 text-slate-300">
                <span>Non-Compliance Rate:</span>
                <span className="font-black text-pink-400">{hoveredRegion.pct.toFixed(1)}%</span>
              </div>
              {hoveredRegion.meanVal !== null && (
                <div className="flex justify-between gap-3 text-slate-300 pt-1 border-t border-slate-800/80">
                  <span>Mean Value:</span>
                  <span className="font-bold text-emerald-300">{hoveredRegion.meanVal.toFixed(1)}</span>
                </div>
              )}
              <div className="pt-1 mt-1 border-t border-slate-800 text-[10px] text-amber-300 font-extrabold uppercase text-center">
                Range: {hoveredRegion.rangeLabel}
              </div>
            </div>
          </div>
        )}


      </div>

      {/* DYNAMIC RANGE CLASS LEGEND BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
            Exceedance Severity Legend ({rangeClasses.length} Ranges)
          </span>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              data-export-hide="true"
              onClick={handleExport600DpiJpeg}
              disabled={isExportingJpeg}
              className="text-[11px] font-extrabold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
              title="Save Choropleth Map as High Density 600 DPI JPEG Image"
            >
              {isExportingJpeg ? <Loader2 className="w-3 h-3 animate-spin text-amber-900" /> : <FileImage className="w-3 h-3 text-amber-900" />}
              <span>Save 600 DPI JPEG</span>
            </button>

            <button
              data-export-hide="true"
              onClick={() => setIsRangeModalOpen(true)}
              className="text-[11px] font-extrabold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              <Palette className="w-3 h-3" />
              <span>Customize Ranges & Colors</span>
            </button>
          </div>
        </div>

        {/* MONOCHROMATIC PALETTE SELECTOR BAR */}
        <div data-export-hide="true" className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-y border-slate-100 py-1.5">
          <span className="text-[10px] font-black uppercase text-slate-400 shrink-0 mr-1 flex items-center gap-1">
            <Palette className="w-3 h-3 text-amber-500" /> Shades:
          </span>
          {Object.entries(COLOR_PALETTES).map(([pKey, pVal]) => {
            const isAct = activePaletteKey === pKey;
            return (
              <button
                key={pKey}
                onClick={() => applyPalette(pKey)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 ${
                  isAct
                    ? "bg-slate-900 text-amber-300 border-slate-900 shadow-xs"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                }`}
                title={`Apply ${pVal.name} scheme`}
              >
                <span className="flex items-center gap-0.5">
                  {pVal.colors.slice(0, 4).map((c, i) => (
                    <span key={i} className="w-2 h-2 rounded-full border border-black/20" style={{ backgroundColor: c }} />
                  ))}
                </span>
                <span>{pVal.name}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs font-bold">
          {rangeClasses.map((rc) => {
            const cnt = rangeCounts[rc.id] || 0;
            return (
              <div key={rc.id} className="bg-slate-50 border border-slate-200/90 rounded-xl p-2.5 transition-all hover:border-slate-300">
                <div className="flex items-center justify-center gap-1.5 text-slate-800 mb-0.5">
                  <span
                    className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                    style={{ backgroundColor: rc.color }}
                  />
                  <span className="whitespace-nowrap font-extrabold text-slate-800 text-xs">{rc.label}</span>
                </div>
                <span className="text-[11px] font-extrabold text-slate-500 block">
                  {cnt} {reportingLevel}s
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* RANGE COLORS CONFIGURATION MODAL */}
      {isRangeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 space-y-5 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-800">
                  Configure KPI Range Classes & Colors
                </h3>
              </div>
              <button
                onClick={() => setIsRangeModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PALETTE PRESETS SELECTOR IN MODAL */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-slate-600 tracking-wider block">
                Monochromatic & Multi-Color Schemes
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {Object.entries(COLOR_PALETTES).map(([pKey, pVal]) => {
                  const isAct = activePaletteKey === pKey;
                  return (
                    <button
                      key={pKey}
                      onClick={() => applyPalette(pKey)}
                      className={`p-2 rounded-xl text-xs font-extrabold flex flex-col items-center gap-1 transition-all cursor-pointer border ${
                        isAct
                          ? "bg-indigo-950 text-amber-300 border-indigo-900 shadow-sm ring-2 ring-indigo-500/40"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-0.5">
                        {pVal.colors.map((c, i) => (
                          <span key={i} className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <span className="text-[10px] truncate">{pVal.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Define the percentage exceedance intervals and choose colors for the choropleth map.
            </p>

            {/* RANGE ITEMS LIST */}
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {rangeClasses.map((rc, idx) => (
                <div key={rc.id} className="flex items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <input
                    type="color"
                    value={rc.color}
                    onChange={(e) => {
                      const newColor = e.target.value;
                      setRangeClasses((prev) =>
                        prev.map((item) => (item.id === rc.id ? { ...item, color: newColor } : item))
                      );
                    }}
                    className="w-9 h-9 rounded-xl border border-slate-300 cursor-pointer shrink-0"
                  />

                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      value={rc.label}
                      onChange={(e) => {
                        const newLabel = e.target.value;
                        setRangeClasses((prev) =>
                          prev.map((item) => (item.id === rc.id ? { ...item, label: newLabel } : item))
                        );
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-500"
                    />

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
                      <span>Max %:</span>
                      <input
                        type="number"
                        step="0.1"
                        value={rc.maxPct}
                        onChange={(e) => {
                          const newMax = parseFloat(e.target.value) || 0;
                          setRangeClasses((prev) =>
                            prev.map((item) => (item.id === rc.id ? { ...item, maxPct: newMax } : item))
                          );
                        }}
                        className="w-20 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-0.5"
                      />
                      <span>%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* MODAL FOOTER ACTIONS */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                onClick={() => setRangeClasses(DEFAULT_RANGE_CLASSES)}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>

              <button
                onClick={() => {
                  setIsRangeModalOpen(false);
                  if (showToast) showToast("KPI map ranges and colors updated", "success");
                }}
                className="bg-[#1a2356] hover:bg-indigo-900 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Apply Ranges</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
