import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import shp from "shpjs";
import { INDIA_BOUNDARY } from "../data/india_boundary";
import { Plus, Minus, RotateCcw, Info, Globe, Calendar, Send, Table, Edit2, Edit3, Search, Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CornerDownLeft, Palette, MapPin, Layers, AlertTriangle, Activity, Upload, Trash2, Eye, EyeOff, Settings2, FileText, Check } from "lucide-react";
import { ShapefileLayer } from "../types";
import { getShortName } from "../utils/stateAbbreviations";
import { PARAM_CONFIG } from "../data/config";
import { 
  featureMatchesSelection, 
  buildDistrictStateMap, 
  isStateAll, 
  isDistrictAll,
  norm
} from "../utils/shapefileFilter";

interface GisChoroplethMapProps {
  rawData: any[];
  headers: any;
  headerMap: Record<string, string>;
  activeParam: string;
  activeConfig: any;
  reportingLevel: "State" | "District" | "Block";
  selectedState?: string;
  selectedDistrict?: string;
  showToast?: (msg: string, type: "success" | "error") => void;
  sendToBulletin?: (title: string, svgOrImageBase64: string) => void;
  customMapTitle?: string;
  layers?: ShapefileLayer[];
  setLayers?: React.Dispatch<React.SetStateAction<ShapefileLayer[]>>;
  choroplethClasses?: { limit: number; color: string; label: string }[];
  setChoroplethClasses?: React.Dispatch<React.SetStateAction<{ limit: number; color: string; label: string }[]>>;
  isVisible?: boolean;
}

// Web Mercator Tile conversions
function lngToTileX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * Math.pow(2, zoom);
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1.0 / Math.cos(latRad)) / Math.PI) / 2.0) *
    Math.pow(2, zoom)
  );
}

function tileXToLng(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360.0 - 180.0;
}

function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2.0 * Math.PI * y) / Math.pow(2, zoom);
  return (180.0 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// Point in polygon helpers for interactive clicking/renaming
const isPointInPolygon = (point: [number, number], polygon: number[][][]) => {
  const [x, y] = point;
  let inside = false;
  if (!polygon || polygon.length === 0) return false;
  
  const exterior = polygon[0];
  if (!exterior || exterior.length === 0) return false;
  
  for (let i = 0, j = exterior.length - 1; i < exterior.length; j = i++) {
    const xi = exterior[i][0], yi = exterior[i][1];
    const xj = exterior[j][0], yj = exterior[j][1];
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  if (inside && polygon.length > 1) {
    for (let k = 1; k < polygon.length; k++) {
      const hole = polygon[k];
      let insideHole = false;
      if (!hole) continue;
      for (let i = 0, j = hole.length - 1; i < hole.length; j = i++) {
        const xi = hole[i][0], yi = hole[i][1];
        const xj = hole[j][0], yj = hole[j][1];
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) insideHole = !insideHole;
      }
      if (insideHole) {
        return false;
      }
    }
  }
  
  return inside;
};

const isPointInFeature = (lon: number, lat: number, f: any): boolean => {
  if (!f || !f.geometry) return false;
  const geom = f.geometry;
  if (geom.type === "Polygon") {
    return isPointInPolygon([lon, lat], geom.coordinates);
  } else if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((poly: any) => isPointInPolygon([lon, lat], poly));
  }
  return false;
};

interface GroupData {
  name: string;
  state?: string;
  district?: string;
  block?: string;
  centroidLon: number;
  centroidLat: number;
  totalSamples: number;
  failCount: number;
  pctExceedance: number;
  avgValue: number;
}

export interface ChoroplethPalette {
  id: string;
  name: string;
  type: "single" | "multi";
  badge: string;
  shades: Record<2 | 3 | 4 | 5, string[]>;
}

export const CHOROPLETH_PALETTES: ChoroplethPalette[] = [
  {
    id: "red-single",
    name: "Red Shades (Monochromatic Single Color)",
    type: "single",
    badge: "Red Single Hue",
    shades: {
      2: ["#fca5a5", "#991b1b"],
      3: ["#fca5a5", "#ef4444", "#881337"],
      4: ["#fecaca", "#f87171", "#dc2626", "#7f1d1d"],
      5: ["#fee2e2", "#fca5a5", "#f87171", "#dc2626", "#881337"]
    }
  },
  {
    id: "blue-single",
    name: "Blue Shades (Monochromatic Single Color)",
    type: "single",
    badge: "Blue Single Hue",
    shades: {
      2: ["#93c5fd", "#1e3a8a"],
      3: ["#93c5fd", "#3b82f6", "#172554"],
      4: ["#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"],
      5: ["#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#172554"]
    }
  },
  {
    id: "orange-single",
    name: "Orange Shades (Monochromatic Single Color)",
    type: "single",
    badge: "Orange Single Hue",
    shades: {
      2: ["#fed7aa", "#c2410c"],
      3: ["#fed7aa", "#f97316", "#7c2d12"],
      4: ["#ffedd5", "#fb923c", "#ea580c", "#7c2d12"],
      5: ["#fff7ed", "#fed7aa", "#f97316", "#c2410c", "#431407"]
    }
  },
  {
    id: "green-single",
    name: "Green Shades (Monochromatic Single Color)",
    type: "single",
    badge: "Green Single Hue",
    shades: {
      2: ["#86efac", "#15803d"],
      3: ["#86efac", "#22c55e", "#052e16"],
      4: ["#bbf7d0", "#4ade80", "#16a34a", "#14532d"],
      5: ["#dcfce7", "#86efac", "#22c55e", "#15803d", "#052e16"]
    }
  },
  {
    id: "purple-single",
    name: "Purple Shades (Monochromatic Single Color)",
    type: "single",
    badge: "Purple Single Hue",
    shades: {
      2: ["#d8b4fe", "#581c87"],
      3: ["#d8b4fe", "#a855f7", "#3b0764"],
      4: ["#e9d5ff", "#c084fc", "#9333ea", "#4c1d95"],
      5: ["#f3e8ff", "#d8b4fe", "#a855f7", "#7e22ce", "#3b0764"]
    }
  },
  {
    id: "teal-single",
    name: "Teal Shades (Monochromatic Single Color)",
    type: "single",
    badge: "Teal Single Hue",
    shades: {
      2: ["#99f6e4", "#0f766e"],
      3: ["#99f6e4", "#14b8a6", "#042f2e"],
      4: ["#ccfbf1", "#5eead4", "#0d9488", "#115e59"],
      5: ["#f0fdf4", "#99f6e4", "#14b8a6", "#0f766e", "#042f2e"]
    }
  },
  {
    id: "amber-single",
    name: "Amber/Gold Shades (Monochromatic Single Color)",
    type: "single",
    badge: "Amber Single Hue",
    shades: {
      2: ["#fde047", "#854d0e"],
      3: ["#fde047", "#eab308", "#713f12"],
      4: ["#fef08a", "#facc15", "#ca8a04", "#713f12"],
      5: ["#fef9c3", "#fde047", "#eab308", "#ca8a04", "#422006"]
    }
  },
  {
    id: "gray-single",
    name: "Charcoal/Gray Shades (Monochromatic Single Color)",
    type: "single",
    badge: "Gray Single Hue",
    shades: {
      2: ["#d1d5db", "#111827"],
      3: ["#d1d5db", "#6b7280", "#030712"],
      4: ["#e5e7eb", "#9ca3af", "#4b5563", "#111827"],
      5: ["#f3f4f6", "#d1d5db", "#6b7280", "#374151", "#030712"]
    }
  },
  {
    id: "traffic-multi",
    name: "Traffic Light Spectrum (Multi-Color Green → Red)",
    type: "multi",
    badge: "Multi-Color Spectrum",
    shades: {
      2: ["#22c55e", "#ef4444"],
      3: ["#22c55e", "#eab308", "#ef4444"],
      4: ["#22c55e", "#84cc16", "#f97316", "#ef4444"],
      5: ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"]
    }
  },
  {
    id: "spectral-multi",
    name: "Spectral Diverging (Multi-Color)",
    type: "multi",
    badge: "Multi-Color Diverging",
    shades: {
      2: ["#2b83ba", "#d53e4f"],
      3: ["#2b83ba", "#ffffbf", "#d53e4f"],
      4: ["#2b83ba", "#abdda4", "#fdae61", "#d53e4f"],
      5: ["#2b83ba", "#abdda4", "#ffffbf", "#fdae61", "#d53e4f"]
    }
  }
];

export default function GisChoroplethMap({
  rawData,
  headers,
  headerMap,
  activeParam,
  activeConfig,
  reportingLevel,
  selectedState,
  selectedDistrict,
  showToast,
  sendToBulletin,
  customMapTitle,
  layers,
  setLayers,
  choroplethClasses,
  setChoroplethClasses,
  isVisible,
}: GisChoroplethMapProps) {
  // Local shapefile layers fallback state if parent doesn't provide setLayers
  const [localLayers, setLocalLayers] = useState<ShapefileLayer[]>([]);

  useEffect(() => {
    if (layers !== undefined && layers.length > 0) {
      setLocalLayers(layers);
    }
  }, [layers]);

  const effectiveLayers = (layers !== undefined && setLayers) ? layers : localLayers;
  const setEffectiveLayers = (newLayersOrFn: any) => {
    if (setLayers) setLayers(newLayersOrFn);
    setLocalLayers(newLayersOrFn);
  };

  // Local toast message state
  const [localToast, setLocalToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const triggerToast = (msg: string, type: "success" | "error" | "info" = "success") => {
    if (showToast) {
      showToast(msg, type === "info" ? "success" : type);
    } else {
      setLocalToast({ message: msg, type });
      setTimeout(() => setLocalToast(null), 3000);
    }
  };

  // Upload custom shapefile (.zip or .geojson/.json) directly in Choropleth view
  const handleShapefileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files) as File[];

    for (const file of fileList) {
      try {
        let geojson: any = null;
        const fileNameLower = file.name.toLowerCase();

        if (fileNameLower.endsWith(".zip")) {
          const buffer = await file.arrayBuffer();
          geojson = (await shp(buffer)) as any;
        } else if (fileNameLower.endsWith(".json") || fileNameLower.endsWith(".geojson")) {
          const text = await file.text();
          geojson = JSON.parse(text);
        } else {
          triggerToast(`Unsupported file type: ${file.name}. Please upload .zip or .geojson`, "error");
          continue;
        }

        if (!geojson) continue;

        const targetGeo = Array.isArray(geojson) ? geojson[0] : geojson;
        if (!targetGeo) continue;

        // Auto-detect property label key
        const keys = new Set<string>();
        const features = targetGeo.features || (targetGeo.type === "Feature" ? [targetGeo] : []);
        features.forEach((f: any) => {
          if (f && f.properties) {
            Object.keys(f.properties).forEach((k) => keys.add(k));
          }
        });
        const propertyKeys = Array.from(keys);
        const autoLabelKey =
          propertyKeys.find((k) => {
            const l = k.toLowerCase();
            return (
              l.includes("name") ||
              l.includes("state") ||
              l.includes("dist") ||
              l.includes("st_nm") ||
              l.includes("dt_nm") ||
              l.includes("block")
            );
          }) ||
          propertyKeys[0] ||
          "";

        const newLayer: ShapefileLayer = {
          id: `shapefile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name.replace(/\.(zip|geojson|json)$/i, ""),
          geoJson: targetGeo,
          visible: true,
          strokeColor: "#0f172a",
          strokeWidth: 1.5,
          fillColor: "#3b82f6",
          fillOpacity: 20,
          showLabels: true,
          labelKey: autoLabelKey,
          labelColor: "#0f172a",
          labelSize: 10,
          showInLegend: true,
          showStroke: true,
        };

        setEffectiveLayers((prev) => [...prev, newLayer]);
        triggerToast(`Uploaded ${file.name} shapefile layer successfully!`, "success");
      } catch (err) {
        console.error("Shapefile upload error:", err);
        triggerToast(`Failed to parse ${file.name}. Ensure valid .zip shapefile or GeoJSON.`, "error");
      }
    }
    e.target.value = "";
  };

  // Local season toggle state: "pre" | "post" | "both"
  const [seasonFilter, setSeasonFilter] = useState<"pre" | "post" | "both">("both");

  // Customizable GIS layout and rendering modes
  const [choroplethMode, setChoroplethMode] = useState<"region" | "voronoi">("region");
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [showCompass, setShowCompass] = useState(true);
  const [showScaleBar, setShowScaleBar] = useState(true);
  const [showGridLines, setShowGridLines] = useState(false);
  const [showIndiaBoundary, setShowIndiaBoundary] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"default" | "a4-portrait" | "a4-landscape">("default");
  const [showMapBorder, setShowMapBorder] = useState(true);
  const [show3DBubbles, setShow3DBubbles] = useState(false);
  const [globalStrokeColor, setGlobalStrokeColor] = useState<string>("#0f172a");
  const [globalStrokeWidth, setGlobalStrokeWidth] = useState<number>(1.5);
  const [globalFillColor, setGlobalFillColor] = useState<string>("#3b82f6");
  const [globalFillOpacity, setGlobalFillOpacity] = useState<number>(30);
  
  // Advanced Features
  

  const [useShortNames, setUseShortNames] = useState(false);
  const [selectedBoundaryLayerId, setSelectedBoundaryLayerId] = useState<string>("auto");
  const pixelRatio = typeof window !== "undefined"
    ? ((window.innerWidth < 768 || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0))
        ? Math.max(window.devicePixelRatio || 2, 2.0)
        : Math.max((window.devicePixelRatio || 2) * 1.5, 3.2))
    : 3.0;
  const [mapTheme, setMapTheme] = useState<"light" | "dark" | "blueprint">("light");

  const handleExportImage = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `GIS_Choropleth_Map_${new Date().getTime()}.png`;
    link.click();
    triggerToast("Map exported successfully!", "success");
  };

  // Local fallback state if parent doesn't provide them
  const [localChoroplethClasses, setLocalChoroplethClasses] = useState([
    { limit: 10, color: "#fca5a5", label: "Low" },
    { limit: 25, color: "#f87171", label: "Moderate" },
    { limit: 50, color: "#dc2626", label: "High" },
    { limit: 75, color: "#991b1b", label: "Very High" },
    { limit: 100, color: "#881337", label: "Severe" }
  ]);

  const [selectedPalette, setSelectedPalette] = useState<string>("red-single");

  const activeClasses = useMemo(() => {
    return choroplethClasses || localChoroplethClasses;
  }, [choroplethClasses, localChoroplethClasses]);

  const userLayers = useMemo(() => {
    return (effectiveLayers || []).filter((l) => l.visible && l.geoJson);
  }, [effectiveLayers]);

  const defaultIndiaLayers: ShapefileLayer[] = useMemo(() => [
    {
      id: "india-default-layer",
      name: "India Boundary",
      visible: true,
      strokeColor: "#0f172a",
      strokeWidth: 1.8,
      fillColor: "#e2e8f0",
      fillOpacity: 0.1,
      showLabels: true,
      labelKey: "name",
      labelColor: "#0f172a",
      labelSize: 10,
      geoJson: {
        type: "FeatureCollection",
        features: [INDIA_BOUNDARY]
      }
    }
  ], []);

  const activeLayers = useMemo(() => {
    return userLayers.length > 0 ? userLayers : defaultIndiaLayers;
  }, [userLayers, defaultIndiaLayers]);

  // Determine Primary Choropleth Layer for region fills and raster clipping mask
  const primaryLayer = useMemo(() => {
    if (activeLayers.length === 0) return null;
    if (selectedBoundaryLayerId && selectedBoundaryLayerId !== "auto") {
      const found = activeLayers.find((l) => l.id === selectedBoundaryLayerId);
      if (found) return found;
    }
    // Match based on reporting level first
    if (reportingLevel === "State") {
      const stateL = activeLayers.find((l) => l.name.toLowerCase().includes("state"));
      if (stateL) return stateL;
    } else if (reportingLevel === "District" || reportingLevel === "Block") {
      const distL = activeLayers.find((l) => l.name.toLowerCase().includes("dist") || l.name.toLowerCase().includes("district"));
      if (distL) return distL;
    }

    // Auto selection from custom uploaded layers
    const customUserUploaded = activeLayers.find(
      (l) => !l.id.includes("india-default")
    );
    if (customUserUploaded) return customUserUploaded;

    return activeLayers[0];
  }, [activeLayers, selectedBoundaryLayerId, reportingLevel]);

  // Secondary layers are remaining visible layers rendered as crisp boundary outlines
  const secondaryLayers = useMemo(() => {
    if (!primaryLayer) return [];
    return activeLayers.filter((l) => l.id !== primaryLayer.id);
  }, [activeLayers, primaryLayer]);

  const updateClasses = (newClasses: typeof localChoroplethClasses) => {
    setLocalChoroplethClasses(newClasses);
    if (setChoroplethClasses) {
      setChoroplethClasses(newClasses);
    }
  };

  const applyPalette = (paletteId: string, customClasses?: typeof localChoroplethClasses) => {
    const pal = CHOROPLETH_PALETTES.find(p => p.id === paletteId) || CHOROPLETH_PALETTES[0];
    const targetClasses = customClasses || activeClasses;
    const count = (targetClasses.length >= 2 && targetClasses.length <= 5 ? targetClasses.length : 5) as 2 | 3 | 4 | 5;
    const shadeList = pal.shades[count] || pal.shades[5];

    const updated = targetClasses.map((cls, idx) => ({
      ...cls,
      color: shadeList[idx] || cls.color
    }));

    setSelectedPalette(paletteId);
    updateClasses(updated);
    triggerToast(`Applied ${pal.name} scheme!`, "success");
  };

  const handleClassCountChange = (count: number) => {
    if (count === activeClasses.length) return;
    
    let newClasses = [];
    
    if (count === 2) {
      newClasses = [
        { limit: 10, color: "#fca5a5", label: "Safe (≤10%)" },
        { limit: 100, color: "#881337", label: "Severe (>10%)" }
      ];
    } else if (count === 3) {
      newClasses = [
        { limit: 5, color: "#fca5a5", label: "Safe (≤5%)" },
        { limit: 15, color: "#dc2626", label: "Moderate (>5-15%)" },
        { limit: 100, color: "#881337", label: "Severe (>15%)" }
      ];
    } else if (count === 4) {
      newClasses = [
        { limit: 5, color: "#fecaca", label: "Safe (0-5%)" },
        { limit: 10, color: "#f87171", label: "Low (>5-10%)" },
        { limit: 20, color: "#dc2626", label: "High (>10-20%)" },
        { limit: 100, color: "#7f1d1d", label: "Severe (>20%)" }
      ];
    } else { // 5 classes
      newClasses = [
        { limit: 5, color: "#fee2e2", label: "Safe (0-5%)" },
        { limit: 10, color: "#fca5a5", label: "Low (>5-10%)" },
        { limit: 15, color: "#f87171", label: "Moderate (>10-15%)" },
        { limit: 20, color: "#dc2626", label: "High (>15-20%)" },
        { limit: 100, color: "#881337", label: "Severe (>20%)" }
      ];
    }

    const pal = CHOROPLETH_PALETTES.find(p => p.id === selectedPalette) || CHOROPLETH_PALETTES[0];
    const cntKey = (count >= 2 && count <= 5 ? count : 5) as 2 | 3 | 4 | 5;
    const shadeList = pal.shades[cntKey] || pal.shades[5];
    const shadedClasses = newClasses.map((cls, idx) => ({
      ...cls,
      color: shadeList[idx] || cls.color
    }));

    updateClasses(shadedClasses);
    triggerToast(`Set map to ${count} classification levels.`, "success");
  };

  const applyPreset = (presetType: "0-5" | "standard" | "dense") => {
    let newClasses;
    if (presetType === "0-5") {
      newClasses = [
        { limit: 5, color: "#fee2e2", label: "Safe (0-5%)" },
        { limit: 10, color: "#fca5a5", label: "Low (>5-10%)" },
        { limit: 15, color: "#f87171", label: "Moderate (>10-15%)" },
        { limit: 20, color: "#dc2626", label: "High (>15-20%)" },
        { limit: 100, color: "#881337", label: "Severe (>20%)" }
      ];
    } else if (presetType === "dense") {
      newClasses = [
        { limit: 2, color: "#fee2e2", label: "Safe (0-2%)" },
        { limit: 4, color: "#fca5a5", label: "Slight (>2-4%)" },
        { limit: 6, color: "#f87171", label: "Moderate (>4-6%)" },
        { limit: 8, color: "#dc2626", label: "High (>6-8%)" },
        { limit: 100, color: "#881337", label: "Critical (>8%)" }
      ];
    } else {
      newClasses = [
        { limit: 10, color: "#fee2e2", label: "Low (0-10%)" },
        { limit: 25, color: "#fca5a5", label: "Moderate (>10-25%)" },
        { limit: 50, color: "#f87171", label: "High (>25-50%)" },
        { limit: 75, color: "#dc2626", label: "Very High (>50-75%)" },
        { limit: 100, color: "#881337", label: "Severe (>75%)" }
      ];
    }

    const pal = CHOROPLETH_PALETTES.find(p => p.id === selectedPalette) || CHOROPLETH_PALETTES[0];
    const cntKey = (newClasses.length >= 2 && newClasses.length <= 5 ? newClasses.length : 5) as 2 | 3 | 4 | 5;
    const shadeList = pal.shades[cntKey] || pal.shades[5];
    const shadedClasses = newClasses.map((cls, idx) => ({
      ...cls,
      color: shadeList[idx] || cls.color
    }));

    updateClasses(shadedClasses);
    triggerToast(`Applied ${presetType === "0-5" ? "0-5% Interval" : presetType === "dense" ? "High Granularity" : "Standard"} range preset!`, "success");
  };

  // State for draggable & resizable statistical classification overlay
  const [showTableOverlay, setShowTableOverlay] = useState(true);
  const [tableOverlayTransparent, setTableOverlayTransparent] = useState(true);
  const [tableScale, setTableScale] = useState(0.72); // comfortable default scale
  const [tablePos, setTablePos] = useState({ x: 15, y: 55 });
  const [isDraggingTable, setIsDraggingTable] = useState(false);
  const dragStartOffset = useRef({ x: 0, y: 0 });

  const handleTableMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent map panning during table drag
    setIsDraggingTable(true);
    dragStartOffset.current = {
      x: e.clientX - tablePos.x,
      y: e.clientY - tablePos.y
    };
  };

  useEffect(() => {
    if (!isDraggingTable) return;

    const handleMouseMoveGlobal = (e: MouseEvent) => {
      let nextX = e.clientX - dragStartOffset.current.x;
      let nextY = e.clientY - dragStartOffset.current.y;

      // Restrict within reasonable boundaries relative to canvas viewport
      const container = canvasRef.current?.parentElement;
      if (container) {
        const rect = container.getBoundingClientRect();
        const maxX = rect.width - 80;
        const maxY = rect.height - 40;
        nextX = Math.max(-150, Math.min(maxX, nextX));
        nextY = Math.max(-50, Math.min(maxY, nextY));
      }

      setTablePos({ x: nextX, y: nextY });
    };

    const handleMouseUpGlobal = () => {
      setIsDraggingTable(false);
    };

    window.addEventListener("mousemove", handleMouseMoveGlobal);
    window.addEventListener("mouseup", handleMouseUpGlobal);
    return () => {
      window.removeEventListener("mousemove", handleMouseMoveGlobal);
      window.removeEventListener("mouseup", handleMouseUpGlobal);
    };
  }, [isDraggingTable]);

  // Map interactive state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Draggable sub-elements states
  const [northArrowPos, setNorthArrowPos] = useState({ x: 550, y: 40 });
  const [legendPos, setLegendPos] = useState({ x: 420, y: 280 });
  const [titlePos, setTitlePos] = useState({ x: 20, y: 30 });

  const [isDraggingNorthArrow, setIsDraggingNorthArrow] = useState(false);
  const [isDraggingLegend, setIsDraggingLegend] = useState(false);
  const [isDraggingTitle, setIsDraggingTitle] = useState(false);
  const dragElementStartOffset = useRef({ x: 0, y: 0 });

  // Custom Font styling states
  const [fontFamily, setFontFamily] = useState<string>("Inter");
  const [fontStyle, setFontStyle] = useState<string>("bold");
  const [fontSizeTitle, setFontSizeTitle] = useState<number>(14);
  const [fontSizeSubtitle, setFontSizeSubtitle] = useState<number>(9);
  const [fontSizeLegend, setFontSizeLegend] = useState<number>(9);
  const [fontColor, setFontColor] = useState<string>("#1e293b");
  const [legendTransparent, setLegendTransparent] = useState<boolean>(true);

  // New Font styling states for State name visible on Choropleth
  const [stateFontFamily, setStateFontFamily] = useState<string>("Inter");
  const [stateFontSize, setStateFontSize] = useState<number>(10);
  const [showRegionNames, setShowRegionNames] = useState<boolean>(true);
  const [showStateNames, setShowStateNames] = useState<boolean>(true);
  const [showDistrictNames, setShowDistrictNames] = useState<boolean>(true);
  const [showBlockNames, setShowBlockNames] = useState<boolean>(true);
  const [drawnNames] = useState<Set<string>>(new Set());
  const [stateFontStyle, setStateFontStyle] = useState<string>("bold");
  const [stateFontColor, setStateFontColor] = useState<string>("#1e293b");

  // Sub-label states for (% of samples above permissible limit)
  const [showExceedanceSubLabel, setShowExceedanceSubLabel] = useState<boolean>(true);
  const [subLabelFontFamily, setSubLabelFontFamily] = useState<string>("Inter");
  const [subLabelFontSize, setSubLabelFontSize] = useState<number>(8);
  const [subLabelFontStyle, setSubLabelFontStyle] = useState<string>("normal");
  const [subLabelFontColor, setSubLabelFontColor] = useState<string>("#475569");
  const [subLabelFormat, setSubLabelFormat] = useState<string>("percent"); // 'percent', 'full', 'exceedance', 'short_limit'

  // New Title specific controls
  const [titleFontFamily, setTitleFontFamily] = useState<string>("Inter");
  const [titleFontSize, setTitleFontSize] = useState<number>(14);
  const [titleFontStyle, setTitleFontStyle] = useState<string>("bold");
  const [titleFontColor, setTitleFontColor] = useState<string>("#0f172a");

  // New Subtitle specific controls
  const [subtitleFontFamily, setSubtitleFontFamily] = useState<string>("Inter");
  const [subtitleFontSize, setSubtitleFontSize] = useState<number>(9);
  const [subtitleFontStyle, setSubtitleFontStyle] = useState<string>("normal");
  const [subtitleFontColor, setSubtitleFontColor] = useState<string>("#475569");

  // New Legend specific controls
  const [legendFontFamily, setLegendFontFamily] = useState<string>("Inter");
  const [legendFontSize, setLegendFontSize] = useState<number>(9);
  const [legendFontStyle, setLegendFontStyle] = useState<string>("normal");
  const [legendFontColor, setLegendFontColor] = useState<string>("#1e293b");

  const [nilColor, setNilColor] = useState<string>("#38bdf8");
  const [nilLabel, setNilLabel] = useState<string>("Nil Exceedance (0%)");

  const [expandedTypography, setExpandedTypography] = useState<boolean>(false);

  // Basemap settings
  const [basemap, setBasemap] = useState<string>("No Basemap");
  const [basemapOpacity, setBasemapOpacity] = useState<number>(90);
  const [redrawTilesTrigger, setRedrawTilesTrigger] = useState<number>(0);
  const tileCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const loadingTiles = useRef<Set<string>>(new Set());

  // Interactive renaming states and mouse tracking
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [renamingFeature, setRenamingFeature] = useState<{
    feature: any;
    layer: any;
    originalName: string;
    currentName: string;
  } | null>(null);
  const [newNameInput, setNewNameInput] = useState("");
  const clickStartPos = useRef({ x: 0, y: 0 });

  // Smart detection of available seasons in the imported data
  const detectedSeasons = useMemo(() => {
    const rawList = rawData || [];
    if (rawList.length === 0) return { hasPre: false, hasPost: false, count: 0 };

    const safeHeaders = headers || {};
    const seasonCol = safeHeaders.season || "Season";

    let hasPre = false;
    let hasPost = false;

    rawList.forEach((row) => {
      if (!row) return;
      const val = String(row[seasonCol] || row["Season"] || row["season"] || row["Period"] || row["period"] || "").trim().toLowerCase();
      if (!val) return;
      if (val.includes("pre") || val.includes("before") || val.includes("may") || val.includes("prm") || val === "1") {
        hasPre = true;
      } else if (val.includes("post") || val.includes("after") || val.includes("nov") || val.includes("pom") || val === "2") {
        hasPost = true;
      }
    });

    return { hasPre, hasPost, count: (hasPre ? 1 : 0) + (hasPost ? 1 : 0) };
  }, [rawData, headers]);

  // Auto-switch season filter based on detected seasons in dataset
  useEffect(() => {
    if (detectedSeasons.hasPre && !detectedSeasons.hasPost) {
      setSeasonFilter("pre");
    } else if (detectedSeasons.hasPost && !detectedSeasons.hasPre) {
      setSeasonFilter("post");
    } else if (detectedSeasons.hasPre && detectedSeasons.hasPost) {
      if (seasonFilter !== "pre" && seasonFilter !== "post" && seasonFilter !== "both") {
        setSeasonFilter("both");
      }
    } else {
      setSeasonFilter("pre");
    }
  }, [detectedSeasons]);

  // Side-by-side seasonal state: ONLY active if user selected "both" AND dataset actually contains BOTH seasons!
  const sideBySide = seasonFilter === "both" && detectedSeasons.hasPre && detectedSeasons.hasPost;
  const canvasPostRef = useRef<HTMLCanvasElement>(null);

  // Tooltip & Label Position Repositioning States
  const [hoveredGroup, setHoveredGroup] = useState<GroupData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Map Label Location Repositioning State (Allows moving any State/UT/District label location on the map area using mouse)
  const [labelOffsets, setLabelOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const [isDraggingLabel, setIsDraggingLabel] = useState<string | null>(null);
  const [hoveredLabelName, setHoveredLabelName] = useState<string | null>(null);
  const dragLabelOffsetStart = useRef({ x: 0, y: 0, initialDx: 0, initialDy: 0 });
  const renderedLabelPositionsRef = useRef<Map<string, { sx: number; sy: number; name: string }>>(new Map());

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // District to State mapping built from loaded raw dataset
  const districtStateMap = useMemo(() => {
    return buildDistrictStateMap(rawData, headerMap, headers);
  }, [rawData, headerMap, headers]);

  // Helper to extract matching features for a shapefile layer according to state and district selection
  const getMatchingFeaturesForLayer = useCallback((layer: ShapefileLayer) => {
    if (!layer || !layer.geoJson) return [];
    const allFeatures = layer.geoJson.features || (layer.geoJson.type === "Feature" ? [layer.geoJson] : []);
    if (allFeatures.length === 0) return [];

    if (isStateAll(selectedState) && isDistrictAll(selectedDistrict)) {
      return allFeatures;
    }

    const matched = allFeatures.filter((f: any) =>
      f && f.geometry && featureMatchesSelection(f, selectedState, selectedDistrict, districtStateMap)
    );

    return matched;
  }, [selectedState, selectedDistrict, districtStateMap]);

  // Cache for findGroupForFeature to prevent massive Levenshtein computations on every render
  const featureMatchCache = useRef(new WeakMap<any, any>());

  useEffect(() => {
    featureMatchCache.current = new WeakMap();
  }, [rawData, effectiveLayers, reportingLevel, activeParam, selectedState, selectedDistrict, seasonFilter]);

  // Helper to parse coordinates safely
  const parseCoordinate = (val: any): number | null => {
    if (val === undefined || val === null) return null;
    const num = Number(val);
    if (!isNaN(num) && num !== 0 && Number.isFinite(num)) return num;
    return null;
  };

  const parseParamValue = (val: any): number | null => {
    if (val === undefined || val === null) return null;
    if (typeof val === "number") {
      return isNaN(val) || !Number.isFinite(val) ? null : val;
    }
    let str = String(val).trim();
    if (!str) return null;
    const low = str.toLowerCase();
    if (low === "bdl" || low === "nd" || low === "nil" || low === "none" || low === "null") {
      return 0;
    }
    str = str.replace(/^[<>=~\s]+/, "");
    const match = str.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/);
    if (match) {
      const parsed = parseFloat(match[0]);
      return isNaN(parsed) || !Number.isFinite(parsed) ? null : parsed;
    }
    return null;
  };

  // Pre-Monsoon Data Subset
  const preDataSubset = useMemo(() => {
    const rawList = rawData || [];
    if (rawList.length === 0) return [];
    const safeHeaders = headers || {};
    const seasonCol = safeHeaders.season || "Season";
    const res = rawList.filter((row) => {
      const rowSeason = String((row && (row[seasonCol] || row["Season"] || row["season"] || row["Period"] || row["period"])) || "").toLowerCase();
      return rowSeason.includes("pre") || rowSeason.includes("before") || rowSeason.includes("may") || rowSeason.includes("prm") || rowSeason === "1";
    });
    if (res.length > 0) return res;
    if (detectedSeasons.hasPre) return rawList;
    return [];
  }, [rawData, headers, detectedSeasons]);

  // Post-Monsoon Data Subset
  const postDataSubset = useMemo(() => {
    const rawList = rawData || [];
    if (rawList.length === 0) return [];
    const safeHeaders = headers || {};
    const seasonCol = safeHeaders.season || "Season";
    const res = rawList.filter((row) => {
      const rowSeason = String((row && (row[seasonCol] || row["Season"] || row["season"] || row["Period"] || row["period"])) || "").toLowerCase();
      return rowSeason.includes("post") || rowSeason.includes("after") || rowSeason.includes("nov") || rowSeason.includes("pom") || rowSeason === "2";
    });
    if (res.length > 0) return res;
    if (detectedSeasons.hasPost) return rawList;
    return [];
  }, [rawData, headers, detectedSeasons]);

  // General seasonalFilteredData for the standard single view
  const seasonalFilteredData = useMemo(() => {
    const rawList = rawData || [];
    if (rawList.length === 0 || !seasonFilter || seasonFilter === "all") return rawList;
    const safeHeaders = headers || {};
    const seasonCol = safeHeaders.season || "Season";
    const res = rawList.filter((row) => {
      const rowSeason = String((row && (row[seasonCol] || row["Season"] || row["season"] || row["Period"] || row["period"])) || "").toLowerCase();
      if (seasonFilter === "pre") {
        return rowSeason.includes("pre") || rowSeason.includes("before") || rowSeason.includes("may") || rowSeason.includes("prm") || rowSeason === "1";
      }
      if (seasonFilter === "post") {
        return rowSeason.includes("post") || rowSeason.includes("after") || rowSeason.includes("nov") || rowSeason.includes("pom") || rowSeason === "2";
      }
      return true;
    });
    return res.length > 0 ? res : rawList;
  }, [rawData, seasonFilter, headers]);

  // 2. Helper to compute group list from any raw data array
  const computeGroupList = (dataSubset: any[]) => {
    const safeHeaders = headers || {};

    const getRowVal = (row: any, primaryKey: string, fallbacks: string[]): string => {
      if (!row) return "";
      if (primaryKey && row[primaryKey] !== undefined && row[primaryKey] !== null) {
        const val = String(row[primaryKey]).trim();
        if (val) return val;
      }
      for (const fb of fallbacks) {
        if (row[fb] !== undefined && row[fb] !== null) {
          const val = String(row[fb]).trim();
          if (val) return val;
        }
      }
      const keys = Object.keys(row);
      for (const fb of [primaryKey, ...fallbacks]) {
        if (!fb) continue;
        const fbNorm = norm(fb);
        const matchedKey = keys.find((k) => norm(k) === fbNorm || norm(k).includes(fbNorm) || fbNorm.includes(norm(k)));
        if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
          const val = String(row[matchedKey]).trim();
          if (val) return val;
        }
      }
      return "";
    };

    const getExtractParamVal = (row: any, paramKey: string): number => {
      if (!row) return NaN;

      // 1. Direct match or via headerMap
      if (row[paramKey] !== undefined && row[paramKey] !== null) {
        const p = parseParamValue(row[paramKey]);
        if (p !== null && !isNaN(p)) return p;
      }

      const mappedKey1 = headerMap ? headerMap[paramKey] : undefined;
      if (mappedKey1 && row[mappedKey1] !== undefined && row[mappedKey1] !== null) {
        const p = parseParamValue(row[mappedKey1]);
        if (p !== null && !isNaN(p)) return p;
      }

      const mappedKey2 = headerMap ? Object.keys(headerMap).find((k) => headerMap[k] === paramKey) : undefined;
      if (mappedKey2 && row[mappedKey2] !== undefined && row[mappedKey2] !== null) {
        const p = parseParamValue(row[mappedKey2]);
        if (p !== null && !isNaN(p)) return p;
      }

      // 2. Fallback search through row keys matching param config keywords or symbol
      const config = PARAM_CONFIG[paramKey];
      const searchTerms = [paramKey.toLowerCase()];
      if (config) {
        if (config.name) searchTerms.push(config.name.toLowerCase());
        if (config.keywords) config.keywords.forEach((kw) => searchTerms.push(kw.toLowerCase()));
      }

      const keys = Object.keys(row);
      const foundKey = keys.find((k) => {
        const kLow = k.toLowerCase().trim();
        return searchTerms.some((term) => kLow === term || kLow.includes(term));
      });

      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
        const p = parseParamValue(row[foundKey]);
        if (p !== null && !isNaN(p)) return p;
      }

      return NaN;
    };

    const groups: Record<string, { name: string; state: string; district: string; block: string; lats: number[]; lons: number[]; vals: number[] }> = {};

    const safeSubset = dataSubset || [];
    safeSubset.forEach((row) => {
      if (!row) return;

      const rowSt = getRowVal(row, safeHeaders.state || "", ["State", "State_Name", "State Name", "STATE", "State/UT"]);
      const rowDt = getRowVal(row, safeHeaders.district || "", ["District", "District_Name", "District Name", "DISTRICT", "Dist"]);
      const rowBlk = getRowVal(row, safeHeaders.block || "", ["Block", "Block_Name", "Block Name", "BLOCK", "Tehsil", "Taluka"]);

      if (!isStateAll(selectedState)) {
        if (rowSt && norm(rowSt) !== norm(selectedState || "")) return;
      }
      if (!isDistrictAll(selectedDistrict)) {
        if (rowDt && norm(rowDt) !== norm(selectedDistrict || "")) return;
      }

      let compositeKey = "";
      let displayName = "";
      if (reportingLevel === "State") {
        displayName = (rowSt || rowDt || "Unknown State").trim();
        compositeKey = displayName;
      } else if (reportingLevel === "District") {
        displayName = (rowDt || rowSt || "Unknown District").trim();
        compositeKey = rowSt ? `${rowSt.trim()}___${displayName}` : displayName;
      } else {
        displayName = (rowBlk || rowDt || rowSt || "Unknown Block").trim();
        compositeKey = `${rowSt.trim()}___${rowDt.trim()}___${displayName}`;
      }

      const lat = parseCoordinate(row[safeHeaders.latitude] ?? row["Latitude"] ?? row["latitude"] ?? row["Lat"] ?? row["lat"]);
      const lon = parseCoordinate(row[safeHeaders.longitude] ?? row["Longitude"] ?? row["longitude"] ?? row["Lon"] ?? row["lng"]);

      let val = NaN;
      const isVirtual = ["SAR", "RSC", "SSP", "Na%", "PI", "KR", "MH", "TDS", "Alkalinity"].includes(activeParam);
      if (isVirtual) {
        const caVal = getExtractParamVal(row, "Ca");
        const mgVal = getExtractParamVal(row, "Mg");
        const naVal = getExtractParamVal(row, "Na");
        const kVal = getExtractParamVal(row, "K") || 0;
        const hco3Val = getExtractParamVal(row, "HCO3");
        const co3Val = getExtractParamVal(row, "CO3") || 0;
        const ecVal = getExtractParamVal(row, "EC");
        const tdsVal = getExtractParamVal(row, "TDS");
        const alkVal = getExtractParamVal(row, "Alkalinity");

        const caMeq = !isNaN(caVal) ? caVal / 20.04 : 0;
        const mgMeq = !isNaN(mgVal) ? mgVal / 12.15 : 0;
        const naMeq = !isNaN(naVal) ? naVal / 22.99 : 0;
        const kMeq = !isNaN(kVal) ? kVal / 39.10 : 0;
        const hco3Meq = !isNaN(hco3Val) ? hco3Val / 61.02 : 0;
        const co3Meq = co3Val / 30.00;

        if (activeParam === "SAR") {
          if (!isNaN(caVal) && !isNaN(mgVal) && !isNaN(naVal)) {
            const denom = Math.sqrt((caMeq + mgMeq) / 2);
            if (denom > 0) val = naMeq / denom;
          }
        } else if (activeParam === "RSC") {
          if (!isNaN(caVal) && !isNaN(mgVal) && !isNaN(hco3Val)) {
            val = hco3Meq + co3Meq - (caMeq + mgMeq);
          }
        } else if (activeParam === "TDS") {
          if (!isNaN(tdsVal)) {
            val = tdsVal;
          } else if (!isNaN(ecVal)) {
            val = ecVal * 0.65;
          }
        } else if (activeParam === "Alkalinity") {
          if (!isNaN(alkVal)) {
            val = alkVal;
          } else if (!isNaN(hco3Val)) {
            val = (hco3Meq + co3Meq) * 50;
          }
        } else if (activeParam === "SSP" || activeParam === "Na%") {
          const sum = caMeq + mgMeq + naMeq + kMeq;
          if (sum > 0) val = ((naMeq + kMeq) * 100) / sum;
        } else if (activeParam === "PI") {
          const denom = caMeq + mgMeq + naMeq;
          if (denom > 0) val = ((naMeq + Math.sqrt(hco3Meq)) * 100) / denom;
        } else if (activeParam === "KR") {
          const denom = caMeq + mgMeq;
          if (denom > 0) val = naMeq / denom;
        } else if (activeParam === "MH") {
          const denom = caMeq + mgMeq;
          if (denom > 0) val = (mgMeq * 100) / denom;
        }
      } else {
        val = getExtractParamVal(row, activeParam);
      }

      if (!isNaN(val)) {
        if (!groups[compositeKey]) {
          groups[compositeKey] = {
            name: displayName,
            state: rowSt,
            district: rowDt,
            block: rowBlk,
            lats: [],
            lons: [],
            vals: []
          };
        }
        if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
          groups[compositeKey].lats.push(lat);
          groups[compositeKey].lons.push(lon);
        }
        groups[compositeKey].vals.push(val);
      }
    });

    const userLayers = (effectiveLayers || []).filter((l) => l.visible && l.geoJson);
    const defaultIndiaLayers: ShapefileLayer[] = [
      {
        id: "india-default-layer",
        name: "India Boundary",
        visible: true,
        strokeColor: "#0f172a",
        strokeWidth: 1.8,
        fillColor: "#e2e8f0",
        fillOpacity: 0.1,
        showLabels: true,
        labelKey: "name",
        labelColor: "#0f172a",
        labelSize: 10,
        geoJson: {
          type: "FeatureCollection",
          features: [INDIA_BOUNDARY]
        }
      }
    ];
    const activeLayersToScan = userLayers.length > 0 ? userLayers : defaultIndiaLayers;

    const list: GroupData[] = [];
    Object.entries(groups).forEach(([name, data]) => {
      if (data.vals.length === 0) return;

      // Calculate centroid of coordinates
      let centroidLon = 78.96;
      let centroidLat = 20.59;
      if (data.lons.length > 0 && data.lats.length > 0) {
        centroidLon = data.lons.reduce((a, b) => a + b, 0) / data.lons.length;
        centroidLat = data.lats.reduce((a, b) => a + b, 0) / data.lats.length;
      } else {
        // Fallback to feature polygon centroid from layer if data has no Lat/Lon
        let matchedCentroid: [number, number] | null = null;
        for (const layer of activeLayersToScan) {
          const feats = getMatchingFeaturesForLayer(layer);
          for (const f of feats) {
            if (!f || !f.properties) continue;
            const propVals = Object.values(f.properties).map((v) => String(v).trim());
            if (propVals.some((pv) => norm(pv) === norm(name) || norm(pv).includes(norm(name)) || norm(name).includes(norm(pv)))) {
              // Calculate feature bounding box center
              let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
              const traverseCoords = (coords: any) => {
                if (Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number") {
                  const x = coords[0], y = coords[1];
                  if (!isNaN(x) && !isNaN(y)) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                  }
                } else if (Array.isArray(coords)) {
                  coords.forEach(traverseCoords);
                }
              };
              if (f.geometry && f.geometry.coordinates) {
                traverseCoords(f.geometry.coordinates);
                if (minX !== Infinity && maxX !== -Infinity && minY !== Infinity && maxY !== -Infinity) {
                  matchedCentroid = [(minX + maxX) / 2, (minY + maxY) / 2];
                  break;
                }
              }
            }
          }
          if (matchedCentroid) break;
        }
        if (matchedCentroid) {
          centroidLon = matchedCentroid[0];
          centroidLat = matchedCentroid[1];
        }
      }

      // Calculate exceedance rate
      let failCount = 0;
      let sum = 0;
      data.vals.forEach((v) => {
        sum += v;
        if (activeParam === "SAR") {
          if (v > 26) failCount++;
        } else if (activeParam === "RSC") {
          if (v > 2.5) failCount++;
        } else if (activeParam === "SSP" || activeParam === "Na%") {
          if (v > 60) failCount++;
        } else if (activeParam === "PI") {
          if (v < 25) failCount++;
        } else if (activeParam === "KR") {
          if (v > 1.0) failCount++;
        } else if (activeParam === "MH") {
          if (v > 50) failCount++;
        } else if (activeParam === "pH") {
          const b1 = activeConfig?.b1 ?? 6.5;
          const b2 = activeConfig?.b2 ?? 8.5;
          if (v < b1 || v > b2) failCount++;
        } else if (activeConfig && activeConfig.b1 === activeConfig.b2) {
          if (v > (activeConfig.b1 ?? 0)) failCount++;
        } else {
          const limit = activeConfig?.b2 ?? activeConfig?.b1 ?? 0;
          if (v > limit) failCount++;
        }
      });

      const pctExceedance = (failCount / data.vals.length) * 100;
      const avgValue = sum / data.vals.length;

      list.push({
        name: data.name,
        state: data.state,
        district: data.district,
        block: data.block,
        centroidLon,
        centroidLat,
        totalSamples: data.vals.length,
        failCount,
        pctExceedance,
        avgValue,
      });
    });

    return list;
  };

  const groupList = useMemo(() => {
    return computeGroupList(seasonalFilteredData);
  }, [seasonalFilteredData, headers, activeParam, activeConfig, headerMap, reportingLevel, effectiveLayers]);

  const groupListPre = useMemo(() => {
    return computeGroupList(preDataSubset);
  }, [preDataSubset, headers, activeParam, activeConfig, headerMap, reportingLevel, effectiveLayers]);

  const groupListPost = useMemo(() => {
    return computeGroupList(postDataSubset);
  }, [postDataSubset, headers, activeParam, activeConfig, headerMap, reportingLevel, effectiveLayers]);

  // Compact summary statistics for Evaluated Regions, Regional State Summary, & Highest Shift Region
  const regionalSummaryStats = useMemo(() => {
    if (!groupList || groupList.length === 0) return null;

    const totalRegions = groupList.length;
    const totalSamples = groupList.reduce((acc, g) => acc + g.totalSamples, 0);
    const totalExceeded = groupList.reduce((acc, g) => acc + g.failCount, 0);
    const overallExceedancePct = totalSamples > 0 ? (totalExceeded / totalSamples) * 100 : 0;

    let highestRegion: GroupData | null = null;
    let maxPct = -1;
    groupList.forEach((g) => {
      if (g.pctExceedance > maxPct) {
        maxPct = g.pctExceedance;
        highestRegion = g;
      }
    });

    const nilExceedanceCount = groupList.filter((g) => g.pctExceedance === 0).length;

    let highestShiftRegion: { name: string; shiftPct: number; prePct: number; postPct: number } | null = null;
    if (groupListPre.length > 0 && groupListPost.length > 0) {
      const postMap = new Map<string, number>();
      groupListPost.forEach((g) => postMap.set(g.name, g.pctExceedance));

      let maxShift = -1;
      groupListPre.forEach((gPre) => {
        if (postMap.has(gPre.name)) {
          const postPct = postMap.get(gPre.name)!;
          const shift = Math.abs(postPct - gPre.pctExceedance);
          if (shift > maxShift) {
            maxShift = shift;
            highestShiftRegion = {
              name: gPre.name,
              shiftPct: postPct - gPre.pctExceedance,
              prePct: gPre.pctExceedance,
              postPct,
            };
          }
        }
      });
    }

    return {
      totalRegions,
      totalSamples,
      totalExceeded,
      overallExceedancePct,
      highestRegion,
      nilExceedanceCount,
      highestShiftRegion,
    };
  }, [groupList, groupListPre, groupListPost]);
  useEffect(() => {
    // Defaults only run if classes were reset (already removed from metric switch)
  }, [activeParam, groupList]);

  // 3. Determine map bounding box dynamically based on active shapefile features and data centroids
  const mapBounds = useMemo(() => {
    // Default bounding box for India
    const defaultBounds = {
      minLon: 68.1,
      maxLon: 97.4,
      minLat: 8.0,
      maxLat: 36.0,
    };

    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    const addCoord = (lon: number, lat: number) => {
      if (
        typeof lon === "number" &&
        typeof lat === "number" &&
        !isNaN(lon) &&
        !isNaN(lat) &&
        Number.isFinite(lon) &&
        Number.isFinite(lat) &&
        Math.abs(lon) <= 180 &&
        Math.abs(lat) <= 90 &&
        !(Math.abs(lon) < 0.0001 && Math.abs(lat) < 0.0001)
      ) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    };

    // Determine active layers (user uploaded shapefile layers or fallback India boundary layer)
    const userLayers = (effectiveLayers || []).filter((l) => l.visible && l.geoJson);
    const defaultIndiaLayers: ShapefileLayer[] = [
      {
        id: "india-default-layer",
        name: "India Boundary",
        visible: true,
        strokeColor: "#0f172a",
        strokeWidth: 1.8,
        fillColor: "#e2e8f0",
        fillOpacity: 0.1,
        showLabels: true,
        labelKey: "name",
        labelColor: "#0f172a",
        labelSize: 10,
        geoJson: {
          type: "FeatureCollection",
          features: [INDIA_BOUNDARY]
        }
      }
    ];
    const activeLayersToScan = userLayers.length > 0 ? userLayers : defaultIndiaLayers;

    const traverse = (coords: any) => {
      if (!coords) return;
      if (Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number") {
        addCoord(coords[0], coords[1]);
      } else if (Array.isArray(coords)) {
        for (let i = 0; i < coords.length; i++) {
          traverse(coords[i]);
        }
      }
    };

    activeLayersToScan.forEach(l => {
      if (!l || !l.geoJson || !l.visible) return;
      const feats = getMatchingFeaturesForLayer(l);
      feats.forEach((f: any) => {
        if (f && f.geometry) {
          traverse(f.geometry.coordinates);
        }
      });
    });

    // Collect coordinates from active data points
    groupList.forEach((g) => {
      if (g.centroidLon && g.centroidLat && (g.centroidLon !== 78.96 || g.centroidLat !== 20.59)) {
        addCoord(g.centroidLon, g.centroidLat);
      }
    });

    if (minLon === Infinity || maxLon === -Infinity || minLat === Infinity || maxLat === -Infinity) {
      return defaultBounds;
    }

    // If single point or flat line, expand bounds
    if (minLon === maxLon) {
      minLon -= 1.0;
      maxLon += 1.0;
    }
    if (minLat === maxLat) {
      minLat -= 1.0;
      maxLat += 1.0;
    }

    // Add 10% padding to bounds so shapes and centroids fit comfortably in view
    const lonPadding = (maxLon - minLon) * 0.10;
    const latPadding = (maxLat - minLat) * 0.10;

    return {
      minLon: Math.max(-180, minLon - lonPadding),
      maxLon: Math.min(180, maxLon + lonPadding),
      minLat: Math.max(-85, minLat - latPadding),
      maxLat: Math.min(85, maxLat + latPadding),
    };
  }, [groupList, effectiveLayers, selectedState, selectedDistrict, districtStateMap]);

  // Five-color gradient for groundwater parameter exceedance percentage (customizable classes)
  const getColorForExceedance = (pct: number): string => {
    if (pct === 0) return nilColor; // Nil Exceedance color
    if (activeClasses && Array.isArray(activeClasses) && activeClasses.length > 0) {
      const matched = activeClasses.find(c => c && typeof c.limit === "number" && pct <= c.limit);
      if (matched && matched.color) return matched.color;
      return activeClasses[activeClasses.length - 1]?.color || "#22c55e";
    }
    if (pct <= 10) return "#22c55e"; // Green (Low)
    if (pct <= 25) return "#eab308"; // Yellow (Moderate)
    if (pct <= 50) return "#f97316"; // Orange (High)
    if (pct <= 75) return "#ef4444"; // Red (Very High)
    return "#a855f7"; // Purple (Severe)
  };

  // Projection coordinate helpers - Geospatial Equirectangular/Mercator with true aspect-ratio scaling
  const project = (lon: number, lat: number, width: number, height: number): [number, number] => {
    let { minLon, maxLon, minLat, maxLat } = mapBounds;
    if (!Number.isFinite(minLon) || !Number.isFinite(maxLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
      minLon = 68.1; maxLon = 97.4; minLat = 8.0; maxLat = 36.0;
    }

    const midLon = (minLon + maxLon) / 2;
    const midLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180) || 0.92;

    const spanXDeg = (maxLon - minLon) * cosLat || 1e-6;
    const spanYDeg = (maxLat - minLat) || 1e-6;

    // Viewport inner area with padding for borders/labels
    const padX = Math.min(18, width * 0.025);
    const padY = Math.min(18, height * 0.025);
    const availW = Math.max(10, width - padX * 2);
    const availH = Math.max(10, height - padY * 2);

    // Uniform spatial scale (pixels per degree of latitude/effective longitude)
    const scaleX = availW / spanXDeg;
    const scaleY = availH / spanYDeg;
    const fitScale = Math.min(scaleX, scaleY) || 1;

    const midX = width / 2;
    const midY = height / 2;

    // Relative offset from map center
    const screenX0 = midX + (lon - midLon) * cosLat * fitScale;
    const screenY0 = midY - (lat - midLat) * fitScale;

    // Apply interactive zoom and pan
    const x = (screenX0 - midX) * zoom + midX + panX;
    const y = (screenY0 - midY) * zoom + midY + panY;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return [width / 2, height / 2];
    }

    return [x, y];
  };

  const unproject = (x: number, y: number, width: number, height: number): [number, number] => {
    let { minLon, maxLon, minLat, maxLat } = mapBounds;
    if (!Number.isFinite(minLon) || !Number.isFinite(maxLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
      minLon = 68.1; maxLon = 97.4; minLat = 8.0; maxLat = 36.0;
    }

    const midLon = (minLon + maxLon) / 2;
    const midLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180) || 0.92;

    const spanXDeg = (maxLon - minLon) * cosLat || 1e-6;
    const spanYDeg = (maxLat - minLat) || 1e-6;

    const padX = Math.min(18, width * 0.025);
    const padY = Math.min(18, height * 0.025);
    const availW = Math.max(10, width - padX * 2);
    const availH = Math.max(10, height - padY * 2);

    const fitScale = Math.min(availW / spanXDeg, availH / spanYDeg) || 1;

    const midX = width / 2;
    const midY = height / 2;

    const screenX0 = (x - panX - midX) / zoom + midX;
    const screenY0 = (y - panY - midY) / zoom + midY;

    const dxDeg = (screenX0 - midX) / fitScale;
    const dyDeg = (midY - screenY0) / fitScale;

    const lon = midLon + dxDeg / cosLat;
    const lat = midLat + dyDeg;

    return [lon, lat];
  };

  // Helper to find a matched statistical group for a given GeoJSON feature using fuzzy matching + spatial point-in-polygon
  const findGroupForFeature = (f: any, gList: any[]) => {
    if (!f || typeof f !== "object" || !f.properties) return null;
    
    if (featureMatchCache.current.has(f)) {
      const cachedVal = featureMatchCache.current.get(f);
      if (typeof cachedVal === "string") {
        return gList.find(g => g.name === cachedVal) || null;
      } else if (cachedVal && typeof cachedVal === "object") {
        return cachedVal;
      }
      return null;
    }

    const propValues = Object.values(f.properties).map(v => String(v).trim());

    const getFuzzyScore = (s1: string, s2: string): number => {
      const norm = (s: string) => s.toLowerCase()
        .replace(/[^a-z0-9]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b(state|ut|union territory|islands?|and)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

      const n1 = norm(s1);
      const n2 = norm(s2);

      if (!n1 || !n2) return 0;
      if (n1 === n2) return 1.0;
      if (n1.includes(n2) || n2.includes(n1)) return 0.95;

      const len1 = n1.length;
      const len2 = n2.length;
      const maxLen = Math.max(len1, len2);
      
      const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));
      for (let i = 0; i <= len1; i++) dp[i][0] = i;
      for (let j = 0; j <= len2; j++) dp[0][j] = j;

      for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
          if (n1[i - 1] === n2[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1];
          } else {
            dp[i][j] = Math.min(
              dp[i - 1][j - 1] + 1,
              dp[i][j - 1] + 1,
              dp[i - 1][j] + 1
            );
          }
        }
      }

      const dist = dp[len1][len2];
      return 1 - dist / maxLen;
    };

    // Extract feature's state and district property values if available
    let fState = "";
    let fDistrict = "";
    if (f.properties) {
      for (const [k, v] of Object.entries(f.properties)) {
        const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        const vStr = String(v || "").trim();
        if (!vStr) continue;
        if (["state", "statename", "stname", "stnm", "st", "statecode", "stcode", "statename", "stname"].some(x => kClean === x || kClean.includes("state") || kClean.includes("stname"))) {
          if (!fState) fState = vStr;
        }
        if (["district", "districtname", "distname", "dtname", "distnm", "dt", "distname", "districtname"].some(x => kClean === x || kClean.includes("district") || kClean.includes("dist"))) {
          if (!fDistrict) fDistrict = vStr;
        }
      }
    }

    let bestGroup: any = null;
    let bestScore = 0;

    for (const g of gList) {
      // Prevent matching feature to group if State properties contradict
      if (g.state && fState) {
        const normGS = norm(g.state);
        const normFS = norm(fState);
        if (normGS && normFS && normGS !== normFS && !normGS.includes(normFS) && !normFS.includes(normGS)) {
          continue;
        }
      }
      // Prevent matching feature to group if District properties contradict (ignoring numeric ID properties)
      if (g.district && fDistrict && !/^\d+$/.test(fDistrict.trim())) {
        const normGD = norm(g.district);
        const normFD = norm(fDistrict);
        if (normGD && normFD && normGD !== normFD && !normGD.includes(normFD) && !normFD.includes(normGD)) {
          continue;
        }
      }

      for (const val of propValues) {
        // First check exact normalized equality
        const score = getFuzzyScore(val, g.name);
        if (score > bestScore) {
          bestScore = score;
          bestGroup = g;
        }
      }
    }

    // Require a confidence threshold
    if (bestScore >= 0.55 && bestGroup) {
      featureMatchCache.current.set(f, bestGroup.name);
      return bestGroup;
    }

    // SPATIAL POINT-IN-POLYGON (PIP) FALLBACK MATCHING:
    // If string match score < 0.55, check which data points/centroids in gList lie inside feature f
    if (f.geometry) {
      const insideGroups = gList.filter((g) => {
        if (!g.centroidLon || !g.centroidLat) return false;
        if (g.centroidLon === 78.96 && g.centroidLat === 20.59) return false;
        return isPointInFeature(g.centroidLon, g.centroidLat, f);
      });

      if (insideGroups.length > 0) {
        let totalSamples = 0;
        let failCount = 0;
        let sumVal = 0;
        insideGroups.forEach((g) => {
          totalSamples += g.totalSamples || 0;
          failCount += g.failCount || 0;
          sumVal += (g.avgValue || 0) * (g.totalSamples || 1);
        });

        const pctExceedance = totalSamples > 0 ? (failCount / totalSamples) * 100 : 0;
        const avgValue = totalSamples > 0 ? sumVal / totalSamples : 0;

        const featName = String(
          f.properties?.label ||
          f.properties?.name ||
          f.properties?.Name ||
          f.properties?.NAME ||
          f.properties?.DISTRICT ||
          f.properties?.District ||
          f.properties?.BLOCK ||
          f.properties?.Block ||
          f.properties?.STNAME ||
          Object.values(f.properties)[0] ||
          "Region"
        ).trim();

        const spatialGroup: GroupData = {
          name: featName,
          centroidLon: insideGroups[0].centroidLon,
          centroidLat: insideGroups[0].centroidLat,
          totalSamples,
          failCount,
          pctExceedance,
          avgValue,
        };

        featureMatchCache.current.set(f, spatialGroup);
        return spatialGroup;
      }
    }

    featureMatchCache.current.set(f, null);
    return null;
  };

  // Helper to check if a feature matches the selectedState or selectedDistrict filters
  const checkIfFeatureMatchesFilter = (f: any, gList?: any[]): boolean => {
    return featureMatchesSelection(f, selectedState, selectedDistrict, districtStateMap);
  };

  // A4 layout configurations
  const layoutSizes = useMemo(() => ({
    default: { width: 650, height: 500, style: "w-full lg:w-2/3 min-h-[500px]" },
    "a4-portrait": { width: 595, height: 842, style: "w-full max-w-[500px] min-h-[600px] border border-slate-200 shadow-lg mx-auto" },
    "a4-landscape": { width: 842, height: 595, style: "w-full max-w-[750px] min-h-[500px] border border-slate-200 shadow-lg mx-auto" },
  }), []);

  const currentLayout = layoutSizes[layoutMode] || layoutSizes.default;

  // 4. Draw Map using discrete Voronoi algorithm or direct Region-based choropleth
  const drawMapOnCanvas = (canvas: HTMLCanvasElement, gList: GroupData[], titleText: string, subtitleText: string) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Reset transform before scaling to avoid cumulative scales
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(pixelRatio, pixelRatio);

    const width = canvas.width / pixelRatio;
    const height = canvas.height / pixelRatio;

    // Clear canvas - support transparent background
    drawnNames.clear();
    renderedLabelPositionsRef.current.clear();
    if (transparentBackground) {
      ctx.clearRect(0, 0, width, height);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    // Render basemap tiles if active
    if (basemap !== "No Basemap") {
      ctx.save();
      ctx.globalAlpha = basemapOpacity / 100;

      // Calculate full canvas view lon/lat bounds to cover entire map canvas area without gaps
      const [cMinLon, cMaxLat] = unproject(0, 0, width, height);
      const [cMaxLon, cMinLat] = unproject(width, height, width, height);

      const tileMinLon = Math.max(-180, Math.min(180, Math.min(cMinLon, cMaxLon) - 0.2));
      const tileMaxLon = Math.max(-180, Math.min(180, Math.max(cMinLon, cMaxLon) + 0.2));
      const tileMinLat = Math.max(-85, Math.min(85, Math.min(cMinLat, cMaxLat) - 0.2));
      const tileMaxLat = Math.max(-85, Math.min(85, Math.max(cMinLat, cMaxLat) + 0.2));

      const spanLon = (mapBounds.maxLon - mapBounds.minLon) || 1e-6;
      let baseZ = Math.round(Math.log2(360 / spanLon)) + 2;
      let finalZoom = Math.max(1, Math.min(18, baseZ + Math.round(Math.log2(zoom))));

      let xMin = Math.floor(lngToTileX(tileMinLon, finalZoom));
      let xMax = Math.floor(lngToTileX(tileMaxLon, finalZoom));
      let yMin = Math.floor(latToTileY(tileMaxLat, finalZoom));
      let yMax = Math.floor(latToTileY(tileMinLat, finalZoom));

      // Limit maximum number of tiles to draw to avoid heavy loading and crash
      while ((xMax - xMin + 1) * (yMax - yMin + 1) > 80 && finalZoom > 1) {
        finalZoom--;
        xMin = Math.floor(lngToTileX(tileMinLon, finalZoom));
        xMax = Math.floor(lngToTileX(tileMaxLon, finalZoom));
        yMin = Math.floor(latToTileY(tileMaxLat, finalZoom));
        yMax = Math.floor(latToTileY(tileMinLat, finalZoom));
      }

      const getTileUrl = (tx: number, ty: number, tz: number) => {
        const maxTile = Math.pow(2, tz) - 1;
        const cleanX = Math.max(0, Math.min(maxTile, tx));
        const cleanY = Math.max(0, Math.min(maxTile, ty));

        if (basemap === "ESRI Satellite" || basemap === "Google Satellite" || basemap === "Google Hybrid") {
          return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tz}/${cleanY}/${cleanX}`;
        } else if (basemap === "ESRI Topographic") {
          return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${tz}/${cleanY}/${cleanX}`;
        } else if (basemap === "ESRI Terrain") {
          return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/${tz}/${cleanY}/${cleanX}`;
        } else if (basemap === "CartoDB Light") {
          return `https://basemaps.cartocdn.com/light_all/${tz}/${cleanX}/${cleanY}.png`;
        } else if (basemap === "CartoDB Dark") {
          return `https://basemaps.cartocdn.com/dark_all/${tz}/${cleanX}/${cleanY}.png`;
        } else {
          // Default OpenStreetMap
          return `https://tile.openstreetmap.org/${tz}/${cleanX}/${cleanY}.png`;
        }
      };

      for (let tx = xMin; tx <= xMax; tx++) {
        for (let ty = yMin; ty <= yMax; ty++) {
          const tileLngLeft = tileXToLng(tx, finalZoom);
          const tileLngRight = tileXToLng(tx + 1, finalZoom);
          const tileLatTop = tileYToLat(ty, finalZoom);
          const tileLatBottom = tileYToLat(ty + 1, finalZoom);

          const [tileCanvasXLeft, tileCanvasYTop] = project(tileLngLeft, tileLatTop, width, height);
          const [tileCanvasXRight, tileCanvasYBottom] = project(tileLngRight, tileLatBottom, width, height);

          const tW = tileCanvasXRight - tileCanvasXLeft;
          const tH = tileCanvasYBottom - tileCanvasYTop;

          // Viewport bounding check
          if (
            tileCanvasXRight < 0 ||
            tileCanvasXLeft > width ||
            tileCanvasYBottom < 0 ||
            tileCanvasYTop > height
          ) {
            continue;
          }

          const url = getTileUrl(tx, ty, finalZoom);
          
          let tileImg = tileCache.current.get(url);
          if (tileImg) {
            tileCache.current.delete(url);
            tileCache.current.set(url, tileImg);
          }

          if (!tileImg) {
            if (!loadingTiles.current.has(url)) {
              loadingTiles.current.add(url);
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.src = url;
              img.onload = () => {
                tileCache.current.delete(url);
                tileCache.current.set(url, img);
                if (tileCache.current.size > 128) {
                  const oldestKey = tileCache.current.keys().next().value;
                  if (oldestKey) {
                    tileCache.current.delete(oldestKey);
                  }
                }
                loadingTiles.current.delete(url);
                setRedrawTilesTrigger(prev => prev + 1);
              };
              img.onerror = () => {
                loadingTiles.current.delete(url);
              };
            }
            ctx.fillStyle = basemap.includes("Satellite") || basemap.includes("Dark") ? "#0c1524" : "#f1ebd9";
            ctx.fillRect(tileCanvasXLeft, tileCanvasYTop, tW, tH);
          } else {
            ctx.drawImage(tileImg, tileCanvasXLeft, tileCanvasYTop, tW, tH);
          }
        }
      }
      ctx.restore();
    }

    const userLayers = (effectiveLayers || []).filter(l => l.visible && l.geoJson);
    const defaultIndiaLayers: ShapefileLayer[] = [
      {
        id: "india-default-layer",
        name: "India Boundary",
        visible: true,
        strokeColor: "#0f172a",
        strokeWidth: 1.8,
        fillColor: "#e2e8f0",
        fillOpacity: 0.1,
        showLabels: true,
        labelKey: "name",
        labelColor: "#0f172a",
        labelSize: 10,
        geoJson: {
          type: "FeatureCollection",
          features: [INDIA_BOUNDARY]
        }
      }
    ];
    const activeLayers = userLayers.length > 0 ? userLayers : defaultIndiaLayers;
    const hasLayers = activeLayers.length > 0;
    const shouldDrawIndiaBoundary = (userLayers.length === 0 && isStateAll(selectedState)) || (showIndiaBoundary && isStateAll(selectedState));

    // Draw grid background if transparent background is OFF and grid lines are enabled
    if (!transparentBackground && showGridLines) {
      ctx.strokeStyle = "rgba(71, 85, 105, 0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // Draw high-fidelity Latitude/Longitude Grid lines
    if (showGridLines) {
      ctx.save();
      ctx.strokeStyle = "rgba(71, 85, 105, 0.08)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);

      const { minLon, maxLon, minLat, maxLat } = mapBounds;
      const lonStep = Math.max(0.5, Math.ceil((maxLon - minLon) / 5));
      const latStep = Math.max(0.5, Math.ceil((maxLat - minLat) / 5));

      const startLon = Math.floor(minLon / lonStep) * lonStep;
      const endLon = Math.ceil(maxLon / lonStep) * lonStep;
      for (let lon = startLon; lon <= endLon; lon += lonStep) {
        ctx.beginPath();
        for (let lat = minLat; lat <= maxLat; lat += (maxLat - minLat) / 10) {
          const [sx, sy] = project(lon, lat, width, height);
          if (lat === minLat) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();

        // Draw label at the bottom of the grid
        const [sx] = project(lon, minLat + (maxLat - minLat) * 0.015, width, height);
        if (sx > 15 && sx < width - 15) {
          ctx.font = "bold 8px Courier, monospace";
          ctx.fillStyle = "rgba(71, 85, 105, 0.45)";
          ctx.textAlign = "center";
          ctx.fillText(`${lon.toFixed(1)}°E`, sx, height - 12);
        }
      }

      const startLat = Math.floor(minLat / latStep) * latStep;
      const endLat = Math.ceil(maxLat / latStep) * latStep;
      for (let lat = startLat; lat <= endLat; lat += latStep) {
        ctx.beginPath();
        for (let lon = minLon; lon <= maxLon; lon += (maxLon - minLon) / 10) {
          const [sx, sy] = project(lon, lat, width, height);
          if (lon === minLon) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();

        // Draw label at the left of the grid
        const [, sy] = project(minLon + (maxLon - minLon) * 0.015, lat, width, height);
        if (sy > 15 && sy < height - 15) {
          ctx.font = "bold 8px Courier, monospace";
          ctx.fillStyle = "rgba(71, 85, 105, 0.45)";
          ctx.textAlign = "left";
          ctx.fillText(`${lat.toFixed(1)}°N`, 12, sy);
        }
      }
      ctx.restore();
    }

    // Map screen coordinates for active centroids
    const screenCentroids = gList.map((g) => {
      const [sx, sy] = project(g.centroidLon, g.centroidLat, width, height);
      return { sx, sy, g };
    });

    // MODE A: REGION-BASED SHAPEFILE CHOROPLETH (Colors uploaded shapefile features directly)
    if (choroplethMode === "region" && hasLayers) {
      // 1. Draw Primary Fill Layer
      if (primaryLayer && primaryLayer.geoJson) {
        try {
          ctx.save();
          const strokeColor = primaryLayer.strokeColor || globalStrokeColor || "#0f172a";
          const strokeWidth = typeof primaryLayer.strokeWidth === "number" ? primaryLayer.strokeWidth : globalStrokeWidth;
          const features = getMatchingFeaturesForLayer(primaryLayer);

          features.forEach((f: any) => {
            try {
              if (!f || !f.geometry) return;

              const matchedGroup = findGroupForFeature(f, gList);
              const fallbackColor = primaryLayer.fillColor || (transparentBackground ? "rgba(226, 232, 240, 0.25)" : "#e2e8f0");
              const finalFillColor = matchedGroup 
                ? getColorForExceedance(matchedGroup.pctExceedance)
                : fallbackColor;

              const drawPolygonRing = (ring: any[]) => {
                if (!ring || !Array.isArray(ring) || ring.length === 0) return;
                
                const screenPts: [number, number][] = [];
                ring.forEach((pt: any) => {
                  if (!pt || !Array.isArray(pt) || pt.length < 2) return;
                  const [lon, lat] = pt;
                  if (typeof lon !== "number" || typeof lat !== "number" || isNaN(lon) || isNaN(lat)) return;
                  screenPts.push(project(lon, lat, width, height));
                });
                if (screenPts.length === 0) return;

                ctx.beginPath();
                let minY = Infinity;
                let maxY = -Infinity;
                
                screenPts.forEach(([sx, sy], idx) => {
                  if (idx === 0) ctx.moveTo(sx, sy);
                  else ctx.lineTo(sx, sy);
                  if (Number.isFinite(sy)) {
                    if (sy < minY) minY = sy;
                    if (sy > maxY) maxY = sy;
                  }
                });
                ctx.closePath();
                
                ctx.fillStyle = finalFillColor;
                ctx.fill();

                if (primaryLayer.showStroke !== false) {
                  ctx.strokeStyle = primaryLayer.strokeColor || strokeColor;
                  ctx.lineWidth = typeof primaryLayer.strokeWidth === "number" ? primaryLayer.strokeWidth : strokeWidth;
                  ctx.stroke();
                }
              };

              const drawGeom = (geom: any) => {
                if (!geom) return;
                if (geom.type === "Polygon") {
                  geom.coordinates.forEach((ring: any[]) => drawPolygonRing(ring));
                } else if (geom.type === "MultiPolygon") {
                  geom.coordinates.forEach((poly: any[][]) => {
                    poly.forEach((ring: any[]) => drawPolygonRing(ring));
                  });
                } else if (geom.type === "GeometryCollection") {
                  geom.geometries?.forEach((g: any) => drawGeom(g));
                }
              };

              drawGeom(f.geometry);

              // Labels for primary region mode showing exceedance percentage
              if (primaryLayer.showLabels && primaryLayer.labelKey) {
                let avgLon = 0, avgLat = 0, count = 0;
                const accum = (ring: any[]) => {
                  if (!ring || !Array.isArray(ring)) return;
                  ring.forEach((pt: any) => {
                    if (!pt || !Array.isArray(pt) || pt.length < 2) return;
                    const [lon, lat] = pt;
                    if (typeof lon !== "number" || typeof lat !== "number" || isNaN(lon) || isNaN(lat)) return;
                    avgLon += lon;
                    avgLat += lat;
                    count++;
                  });
                };
                
                const geom = f.geometry;
                if (geom.type === "Polygon") {
                  geom.coordinates.forEach(accum);
                } else if (geom.type === "MultiPolygon") {
                  geom.coordinates.forEach((poly: any[][]) => poly.forEach(accum));
                }
                
                if (count > 0) {
                  const lon = avgLon / count;
                  const lat = avgLat / count;
                  const [sx, sy] = project(lon, lat, width, height);
                  
                  if (sx >= 0 && sx <= width && sy >= 0 && sy <= height) {
                    const baseLabel = String(f.properties?.[primaryLayer.labelKey] || "");
                    const isLayerState = (primaryLayer.name || "").toLowerCase().includes("state");
                    const isLayerDist = (primaryLayer.name || "").toLowerCase().includes("dist") || (primaryLayer.name || "").toLowerCase().includes("district");
                    const isLayerBlock = (primaryLayer.name || "").toLowerCase().includes("block");
                    const showThisLayerLabels = showRegionNames && (
                      isLayerState ? showStateNames : isLayerDist ? showDistrictNames : isLayerBlock ? showBlockNames : true
                    );
                    if (showThisLayerLabels && baseLabel) {
                      const labelText = nameOverrides[baseLabel] || baseLabel;
                      const labelLower = labelText.trim().toLowerCase();
                      if (!drawnNames.has(labelLower)) {
                        drawnNames.add(labelLower);
                        ctx.font = `${stateFontStyle} ${stateFontSize || primaryLayer.labelSize || 9}px ${stateFontFamily || "sans-serif"}`;
                        ctx.fillStyle = stateFontColor || primaryLayer.labelColor || "#0f172a";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        const offset = labelOffsets[baseLabel] || labelOffsets[labelText] || { dx: 0, dy: 0 };
                        const finalSx = sx + offset.dx;
                        const finalSy = sy + offset.dy;
                        ctx.fillText(labelText, finalSx, finalSy);

                        // Draw sub-label (% of samples above permissible limit) if match found in gList
                        if (showExceedanceSubLabel) {
                          const match = gList.find((g) => g.name.toLowerCase() === baseLabel.toLowerCase() || g.name.toLowerCase() === labelText.toLowerCase());
                          if (match) {
                            ctx.font = `${subLabelFontStyle} ${subLabelFontSize}px ${subLabelFontFamily || "sans-serif"}`;
                            ctx.fillStyle = subLabelFontColor;
                            ctx.textAlign = "center";
                            ctx.textBaseline = "top";
                            let subText = `(${match.pctExceedance.toFixed(1)}%)`;
                            if (subLabelFormat === "full") subText = `(${match.pctExceedance.toFixed(1)}% of samples above permissible limit)`;
                            else if (subLabelFormat === "exceedance") subText = `(${match.pctExceedance.toFixed(1)}% Exceedance)`;
                            else if (subLabelFormat === "short_limit") subText = `(${match.pctExceedance.toFixed(1)}% samples > limit)`;
                            const subY = finalSy + Math.round((stateFontSize || primaryLayer.labelSize || 9) / 2) + 2;
                            ctx.fillText(subText, finalSx, subY);
                          }
                        }

                        renderedLabelPositionsRef.current.set(baseLabel.toLowerCase(), { sx: finalSx, sy: finalSy, name: baseLabel });
                        if (labelText !== baseLabel) {
                          renderedLabelPositionsRef.current.set(labelText.toLowerCase(), { sx: finalSx, sy: finalSy, name: baseLabel });
                        }
                      }
                    }
                  }
                }
              }
            } catch (err) {
              console.error("Error rendering feature in primaryLayer Mode A:", err);
            }
          });

          ctx.restore();
        } catch (err) {
          console.error("Error rendering primaryLayer in Mode A:", err);
        }
      }

      // 2. Draw Secondary Layers (Boundary Fill & Outlines)
      secondaryLayers.forEach((secLayer) => {
        try {
          if (!secLayer || !secLayer.geoJson) return;
          ctx.save();
          const strokeColor = secLayer.strokeColor || globalStrokeColor || "#334155";
          const strokeWidth = typeof secLayer.strokeWidth === "number" ? secLayer.strokeWidth : globalStrokeWidth;
          const fillColor = secLayer.fillColor || globalFillColor;
          const fillOpacity = typeof secLayer.fillOpacity === "number" ? secLayer.fillOpacity / 100 : (globalFillOpacity / 100);
          const features = getMatchingFeaturesForLayer(secLayer);

          features.forEach((f: any) => {
            try {
              if (!f || !f.geometry) return;

              const drawPolygonRingStyled = (ring: any[]) => {
                if (!ring || !Array.isArray(ring) || ring.length === 0) return;
                ctx.beginPath();
                ring.forEach((pt: any, idx: number) => {
                  if (!pt || !Array.isArray(pt) || pt.length < 2) return;
                  const [lon, lat] = pt;
                  if (typeof lon !== "number" || typeof lat !== "number" || isNaN(lon) || isNaN(lat)) return;
                  const [sx, sy] = project(lon, lat, width, height);
                  if (idx === 0) ctx.moveTo(sx, sy);
                  else ctx.lineTo(sx, sy);
                });
                ctx.closePath();

                if (fillColor && secLayer.showFill !== false && fillOpacity > 0) {
                  ctx.save();
                  ctx.fillStyle = fillColor;
                  ctx.globalAlpha = fillOpacity;
                  ctx.fill();
                  ctx.restore();
                }

                if (secLayer.showStroke !== false) {
                  ctx.strokeStyle = strokeColor;
                  ctx.lineWidth = strokeWidth;
                  ctx.stroke();
                }
              };

              const drawGeomStyled = (geom: any) => {
                if (!geom) return;
                if (geom.type === "Polygon") {
                  geom.coordinates.forEach((ring: any[]) => drawPolygonRingStyled(ring));
                } else if (geom.type === "MultiPolygon") {
                  geom.coordinates.forEach((poly: any[][]) => {
                    poly.forEach((ring: any[]) => drawPolygonRingStyled(ring));
                  });
                } else if (geom.type === "GeometryCollection") {
                  geom.geometries?.forEach((g: any) => drawGeomStyled(g));
                }
              };

              drawGeomStyled(f.geometry);
            } catch (err) {
              console.error("Error rendering secondaryLayer outline:", err);
            }
          });

          ctx.restore();
        } catch (err) {
          console.error("Error rendering secondaryLayer in Mode A:", err);
        }
      });
    } 
    // MODE B: INTERPOLATED CONTINUOUS VORONOI GRID
    else {
      const offW = 150;
      const offH = 125;
      const offCanvas = document.createElement("canvas");
      offCanvas.width = offW;
      offCanvas.height = offH;
      const offCtx = offCanvas.getContext("2d");

      if (offCtx) {
        const drawGeomForClip = (geom: any) => {
          if (!geom) return;
          if (geom.type === "Polygon") {
            geom.coordinates.forEach((ring: any[]) => {
              if (!ring || !Array.isArray(ring)) return;
              ring.forEach((pt: any, idx: number) => {
                if (!pt || !Array.isArray(pt) || pt.length < 2) return;
                const [lon, lat] = pt;
                if (typeof lon !== "number" || typeof lat !== "number" || isNaN(lon) || isNaN(lat)) return;
                const [sx, sy] = project(lon, lat, width, height);
                if (idx === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
              });
            });
          } else if (geom.type === "MultiPolygon") {
            geom.coordinates.forEach((poly: any[][]) => {
              if (!poly || !Array.isArray(poly)) return;
              poly.forEach((ring: any[]) => {
                if (!ring || !Array.isArray(ring)) return;
                ring.forEach((pt: any, idx: number) => {
                  if (!pt || !Array.isArray(pt) || pt.length < 2) return;
                  const [lon, lat] = pt;
                  if (typeof lon !== "number" || typeof lat !== "number" || isNaN(lon) || isNaN(lat)) return;
                  const [sx, sy] = project(lon, lat, width, height);
                  if (idx === 0) ctx.moveTo(sx, sy);
                  else ctx.lineTo(sx, sy);
                });
              });
            });
          } else if (geom.type === "GeometryCollection") {
            geom.geometries?.forEach((g: any) => drawGeomForClip(g));
          }
        };

        const imgData = offCtx.createImageData(offW, offH);
        const data = imgData.data;

        const offCentroids = gList.map((g) => {
          const [osx, osy] = project(g.centroidLon, g.centroidLat, offW, offH);
          return { osx, osy, g };
        });

        for (let y = 0; y < offH; y++) {
          for (let x = 0; x < offW; x++) {
            let minDist = Infinity;
            let nearestIdx = -1;

            for (let i = 0; i < offCentroids.length; i++) {
              const dx = x - offCentroids[i].osx;
              const dy = y - offCentroids[i].osy;
              const dist = dx * dx + dy * dy;
              if (dist < minDist) {
                minDist = dist;
                nearestIdx = i;
              }
            }

            if (nearestIdx !== -1) {
              const g = offCentroids[nearestIdx].g;
              const colorHex = getColorForExceedance(g.pctExceedance);

              const r = parseInt(colorHex.substring(1, 3), 16);
              const g_val = parseInt(colorHex.substring(3, 5), 16);
              const b = parseInt(colorHex.substring(5, 7), 16);

              const idx = (y * offW + x) * 4;
              data[idx] = r;
              data[idx + 1] = g_val;
              data[idx + 2] = b;
              data[idx + 3] = 220; // 85% opacity for professional blending
            }
          }
        }

        offCtx.putImageData(imgData, 0, 0);

        ctx.save();
        ctx.beginPath();
        
        // Define Clipping Path
        if (hasLayers) {
          // Clip to union of custom shapefile geometries
          activeLayers.forEach(l => {
            try {
              if (!l || !l.geoJson) return;
              const features = getMatchingFeaturesForLayer(l);
              features.forEach(f => {
                if (f && f.geometry) {
                  drawGeomForClip(f.geometry);
                }
              });
            } catch (err) {
              console.error("Error in clip drawing for layer:", err);
            }
          });
        } else if (shouldDrawIndiaBoundary) {
          // Fallback to India boundary clip
          const coords = INDIA_BOUNDARY.geometry.coordinates[0];
          coords.forEach((pt: any, idx: number) => {
            const [lon, lat] = pt;
            const [sx, sy] = project(lon, lat, width, height);
            if (idx === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          });
        }

        ctx.closePath();
        ctx.clip();
        // Render Voronoi stretched to canvas
        ctx.drawImage(offCanvas, 0, 0, width, height);
        ctx.restore();


      }

      // Draw custom boundaries on top of cells
      if (hasLayers) {
        activeLayers.forEach((layer) => {
          try {
            if (!layer || !layer.geoJson) return;
            ctx.save();
            const strokeColor = layer.strokeColor || globalStrokeColor || "#0f172a";
            const strokeWidth = typeof layer.strokeWidth === "number" ? layer.strokeWidth : globalStrokeWidth;
            
            const drawPolygonRing = (ring: any[]) => {
              if (!ring || !Array.isArray(ring) || ring.length === 0) return;
              ctx.beginPath();
              ring.forEach((pt: any, idx: number) => {
                if (!pt || !Array.isArray(pt) || pt.length < 2) return;
                const [lon, lat] = pt;
                if (typeof lon !== "number" || typeof lat !== "number" || isNaN(lon) || isNaN(lat)) return;
                const [sx, sy] = project(lon, lat, width, height);
                if (idx === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
              });
              ctx.closePath();
              if (layer.showStroke !== false) {
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = strokeWidth;
                ctx.stroke();
              }
            };

            const drawGeom = (geom: any) => {
              if (!geom) return;
              if (geom.type === "Polygon") {
                geom.coordinates.forEach((ring: any[]) => drawPolygonRing(ring));
              } else if (geom.type === "MultiPolygon") {
                geom.coordinates.forEach((poly: any[][]) => {
                  poly.forEach((ring: any[]) => drawPolygonRing(ring));
                });
              }
            };

            const features = getMatchingFeaturesForLayer(layer);
            features.forEach((f: any) => {
              if (f && f.geometry) {
                drawGeom(f.geometry);
              }
            });
            ctx.restore();
          } catch (err) {
            console.error("Error drawing custom boundaries on top of cells:", err);
          }
        });
      } else if (shouldDrawIndiaBoundary) {
        ctx.beginPath();
        const coords = INDIA_BOUNDARY.geometry.coordinates[0];
        coords.forEach((pt: any, idx: number) => {
          const [lon, lat] = pt;
          const [sx, sy] = project(lon, lat, width, height);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    }

    // Optional highlight for a specifically selected single district (uses layer's customized stroke settings)
    if (hasLayers && selectedDistrict && selectedDistrict.toUpperCase() !== "ALL" && selectedDistrict.trim() !== "") {
      activeLayers.forEach((layer) => {
        try {
          if (!layer || !layer.geoJson) return;
          const strokeColor = layer.strokeColor || globalStrokeColor || "#0f172a";
          const strokeWidth = (typeof layer.strokeWidth === "number" ? layer.strokeWidth : globalStrokeWidth) + 0.8;
          const features = layer.geoJson.features || (layer.geoJson.type === "Feature" ? [layer.geoJson] : []);
          features.forEach((f: any) => {
            try {
              if (!f || !f.geometry) return;
              if (!checkIfFeatureMatchesFilter(f, gList)) return;

              ctx.save();
              const drawPolygonRingHighlight = (ring: any[]) => {
                if (!ring || !Array.isArray(ring) || ring.length === 0) return;
                ctx.beginPath();
                ring.forEach((pt: any, idx: number) => {
                  if (!pt || !Array.isArray(pt) || pt.length < 2) return;
                  const [lon, lat] = pt;
                  if (typeof lon !== "number" || typeof lat !== "number" || isNaN(lon) || isNaN(lat)) return;
                  const [sx, sy] = project(lon, lat, width, height);
                  if (idx === 0) ctx.moveTo(sx, sy);
                  else ctx.lineTo(sx, sy);
                });
                ctx.closePath();

                ctx.save();
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = strokeWidth;
                ctx.lineJoin = "round";
                ctx.stroke();
                ctx.restore();
              };

              const drawGeomHighlight = (geom: any) => {
                if (!geom) return;
                if (geom.type === "Polygon") {
                  geom.coordinates.forEach((ring: any[]) => drawPolygonRingHighlight(ring));
                } else if (geom.type === "MultiPolygon") {
                  geom.coordinates.forEach((poly: any[][]) => {
                    poly.forEach((ring: any[]) => drawPolygonRingHighlight(ring));
                  });
                } else if (geom.type === "GeometryCollection") {
                  geom.geometries?.forEach((g: any) => drawGeomHighlight(g));
                }
              };

              drawGeomHighlight(f.geometry);
              ctx.restore();
            } catch (err) {
              console.error("Error highlighting feature:", err);
            }
          });
        } catch (err) {
          console.error("Error highlighting layer:", err);
        }
      });
    }

    // Draw Compass Rose (North Arrow)
    if (showCompass) {
      ctx.save();
      const cx = northArrowPos.x === 550 ? width - 40 : northArrowPos.x;
      const cy = northArrowPos.y === 40 ? 50 : northArrowPos.y;

      // Draw beautiful outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inner precise circle
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
      ctx.fillStyle = "#0f172a";
      ctx.fill();

      // Sharp North Pointer (Left side - filled dark, right side - white/contrasting)
      ctx.beginPath();
      ctx.moveTo(cx, cy - 18); // top tip
      ctx.lineTo(cx - 5, cy);  // left tip
      ctx.lineTo(cx, cy - 2);  // inner join
      ctx.closePath();
      ctx.fillStyle = "#0f172a"; // solid dark slate
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, cy - 18); // top tip
      ctx.lineTo(cx + 5, cy);  // right tip
      ctx.lineTo(cx, cy - 2);  // inner join
      ctx.closePath();
      ctx.fillStyle = "#f1f5f9"; // solid light grey
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.fill();

      // Sharp South Pointer (Left side - light, right side - dark)
      ctx.beginPath();
      ctx.moveTo(cx, cy + 18); // bottom tip
      ctx.lineTo(cx - 5, cy);  // left tip
      ctx.lineTo(cx, cy + 2);  // inner join
      ctx.closePath();
      ctx.fillStyle = "#cbd5e1"; // light grey-blue
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, cy + 18); // bottom tip
      ctx.lineTo(cx + 5, cy);  // right tip
      ctx.lineTo(cx, cy + 2);  // inner join
      ctx.closePath();
      ctx.fillStyle = "#475569"; // slate dark grey
      ctx.fill();

      // Premium elegant "N" lettering above the pointer
      ctx.font = `bold 10px ${fontFamily || "sans-serif"}`;
      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("N", cx, cy - 20);

      ctx.restore();
    }

    // Draw Scale Bar (Lower Left Side)
    if (showScaleBar) {
      ctx.save();
      const sx = 20;
      const sy = height - 25;
      const barWidth = 80;

      const [lon1, lat1] = unproject(sx, sy, width, height);
      const [lon2] = unproject(sx + barWidth, sy, width, height);

      const R = 6371;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat1 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distanceKm = R * c;

      if (distanceKm > 0) {
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 1.2;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + barWidth, sy);
        ctx.moveTo(sx, sy - 3);
        ctx.lineTo(sx, sy + 3);
        ctx.moveTo(sx + barWidth, sy - 3);
        ctx.lineTo(sx + barWidth, sy + 3);
        ctx.moveTo(sx + barWidth / 2, sy - 3);
        ctx.lineTo(sx + barWidth / 2, sy + 3);
        ctx.stroke();

        ctx.font = "bold 8px Inter, sans-serif";
        ctx.fillStyle = "#1e293b";
        ctx.textAlign = "center";
        ctx.fillText("0", sx, sy - 6);
        ctx.fillText((distanceKm / 2).toFixed(0), sx + barWidth / 2, sy - 6);
        ctx.fillText(`${distanceKm.toFixed(0)} km`, sx + barWidth, sy - 6);
      }
      ctx.restore();
    }

    // Draw Centroids as text labels
    const shouldDrawCentroidLabels = showRegionNames && (
      reportingLevel === "State"
        ? showStateNames
        : reportingLevel === "District"
        ? showDistrictNames
        : showBlockNames
    );
    if (shouldDrawCentroidLabels) {
      screenCentroids.forEach(({ sx, sy, g }) => {
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) return;
        
        let displayName = nameOverrides[g.name] || g.name;
        if (useShortNames) {
          displayName = getShortName(displayName, reportingLevel, useShortNames);
        }
        const labelText = displayName; // Full name up to 20+ characters, fully visible
        const labelLower = displayName.trim().toLowerCase();
        
        if (!drawnNames.has(labelLower)) {
          drawnNames.add(labelLower);
          ctx.save();

          const offset = labelOffsets[g.name] || labelOffsets[displayName] || { dx: 0, dy: 0 };
          const finalSx = Math.round(sx + offset.dx);
          const finalSy = Math.round(sy + offset.dy);

          // 3D Glossy Bubble Points Facility
          if (show3DBubbles && Number.isFinite(finalSx) && Number.isFinite(finalSy)) {
            const safePct = typeof g.pctExceedance === "number" && !isNaN(g.pctExceedance) ? g.pctExceedance : 0;
            const bRadius = Math.min(14, Math.max(5, 5 + (safePct / 100) * 8));
            const r0 = Math.max(0.1, bRadius * 0.1);
            const r1 = Math.max(1, bRadius);
            try {
              const bubbleGrad = ctx.createRadialGradient(
                finalSx - bRadius * 0.35,
                finalSy - bRadius * 0.35 - 12,
                r0,
                finalSx,
                finalSy - 12,
                r1
              );
              const coreCol = getColorForExceedance(safePct) || "#22c55e";
              bubbleGrad.addColorStop(0, "#ffffff");
              bubbleGrad.addColorStop(0.35, coreCol);
              bubbleGrad.addColorStop(1, "#0f172a");

              ctx.beginPath();
              ctx.arc(finalSx, finalSy - 12, r1, 0, 2 * Math.PI);
              ctx.fillStyle = bubbleGrad;
              ctx.shadowColor = "rgba(0,0,0,0.35)";
              ctx.shadowBlur = 4;
              ctx.shadowOffsetX = 1;
              ctx.shadowOffsetY = 2;
              ctx.fill();
              ctx.shadowColor = "transparent";

              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = 1;
              ctx.stroke();

              // Specular sheen dot
              ctx.beginPath();
              ctx.arc(finalSx - bRadius * 0.3, finalSy - 12 - bRadius * 0.3, bRadius * 0.25, 0, 2 * Math.PI);
              ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
              ctx.fill();
            } catch (err) {
              // Ignore any transient canvas gradient error safely
            }
          }
          
          // 1. Main State / UT / District Name Label
          ctx.font = `${stateFontStyle} ${stateFontSize}px ${stateFontFamily}, sans-serif`;
          ctx.fillStyle = stateFontColor;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(labelText, finalSx, finalSy);

          // 2. Sub-label: (% of samples above permissible limit)
          if (showExceedanceSubLabel) {
            ctx.font = `${subLabelFontStyle} ${subLabelFontSize}px ${subLabelFontFamily}, sans-serif`;
            ctx.fillStyle = subLabelFontColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            let subText = `(${g.pctExceedance.toFixed(1)}%)`;
            if (subLabelFormat === "full") subText = `(${g.pctExceedance.toFixed(1)}% of samples above permissible limit)`;
            else if (subLabelFormat === "exceedance") subText = `(${g.pctExceedance.toFixed(1)}% Exceedance)`;
            else if (subLabelFormat === "short_limit") subText = `(${g.pctExceedance.toFixed(1)}% samples > limit)`;

            const subY = finalSy + Math.round(stateFontSize / 2) + 2;
            ctx.fillText(subText, finalSx, subY);
          }

          ctx.restore();
          renderedLabelPositionsRef.current.set(g.name.toLowerCase(), { sx: finalSx, sy: finalSy, name: g.name });
          if (displayName !== g.name) {
            renderedLabelPositionsRef.current.set(displayName.toLowerCase(), { sx: finalSx, sy: finalSy, name: g.name });
          }
        }
      });
    }

    // Draw customizable map title & subtitle (Rule 5 & 8) - Centered & Draggable at upper side
    ctx.save();
    const tY = Math.round(titlePos.y);
    const titleX = titlePos.x === 20 ? Math.round(width / 2) : Math.round(titlePos.x);

    ctx.font = `${titleFontStyle} ${titleFontSize}px ${titleFontFamily}`;
    ctx.fillStyle = titleFontColor;
    ctx.textAlign = "center";
    ctx.fillText(titleText, titleX, tY);

    ctx.font = `${subtitleFontStyle} ${subtitleFontSize}px ${subtitleFontFamily}`;
    ctx.fillStyle = subtitleFontColor;
    ctx.textAlign = "center";
    ctx.fillText(subtitleText, titleX, tY + Math.round(titleFontSize * 1.1));
    ctx.restore();

    // Draw Customizable map legend with transparent/translucent background (Rule 4 & 6 & 8) - Draggable!
    ctx.save();
    const lW = 145;
    const lH = Math.max(85, (activeClasses.length + 1) * 12 + 24);
    const lX = legendPos.x === 420 ? Math.round(width - 160) : Math.round(legendPos.x);
    const lY = legendPos.y === 280 ? Math.round(height - lH - 16) : Math.round(legendPos.y);

    const drawRectRounded = (x: number, y: number, w: number, h: number, r: number) => {
      if (typeof (ctx as any).roundRect === "function") {
        (ctx as any).roundRect(x, y, w, h, r);
      } else {
        ctx.rect(x, y, w, h);
      }
    };

    if (!legendTransparent) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.strokeStyle = "rgba(15, 23, 42, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      drawRectRounded(lX, lY, lW, lH, 8);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      drawRectRounded(lX, lY, lW, lH, 8);
      ctx.stroke();
    }

    ctx.font = `bold 8.5px ${legendFontFamily}`;
    ctx.fillStyle = legendFontColor;
    ctx.textAlign = "left";
    ctx.fillText("% Exceedance Legend", lX + 8, lY + 14);

    const activeLegendClasses: {color: string, label: string}[] = [];
    activeLegendClasses.push({ color: nilColor, label: nilLabel });
    
    activeClasses.forEach((cls, idx) => {
      const prevLimit = idx === 0 ? 0 : activeClasses[idx - 1].limit;
      let rangeText = "";
      if (true) {
        rangeText = idx === 0 ? `>0% – ${cls.limit}%` : `>${prevLimit}% – ${cls.limit}%`;
      } else {
        rangeText = idx === 0 ? `≤ ${cls.limit}` : `>${prevLimit} – ${cls.limit}`;
      }
      activeLegendClasses.push({ color: cls.color, label: cls.label || rangeText });
    });

    activeLegendClasses.forEach((item, idx) => {
      const itemY = lY + 26 + idx * 11.5;
      if (itemY + 8 < lY + lH) {
        ctx.save();
        ctx.fillStyle = item.color;
        ctx.beginPath();
        drawRectRounded(lX + 8, itemY - 7, 8, 8, 2);
        ctx.fill();
        ctx.restore();

        ctx.font = `${legendFontStyle} ${Math.min(legendFontSize, 8.5)}px ${legendFontFamily}`;
        ctx.fillStyle = legendFontColor;
        ctx.fillText(item.label, lX + 21, itemY);
      }
    });
    ctx.restore();



    // Draw a premium classic cartographic border around the canvas
    if (showMapBorder) {
      ctx.save();
      // Outer thick border
      ctx.strokeStyle = fontColor === "#ffffff" ? "#f8fafc" : "#0f172a";
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, width - 12, height - 12);
      
      // Inner thin border
      ctx.strokeStyle = fontColor === "#ffffff" ? "rgba(248, 250, 252, 0.3)" : "#475569";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(10, 10, width - 20, height - 20);
      
      // Corner markers
      if (layoutMode !== "default") {
        ctx.fillStyle = fontColor === "#ffffff" ? "#f8fafc" : "#0f172a";
        const size = 4;
        ctx.fillRect(6, 6, size, size);
        ctx.fillRect(width - 6 - size, 6, size, size);
        ctx.fillRect(6, height - 6 - size, size, size);
        ctx.fillRect(width - 6 - size, height - 6 - size, size, size);
      }
      ctx.restore();
    }

    if (gList.length === 0) {
      ctx.save();
      ctx.fillStyle = "rgba(241, 245, 249, 0.92)";
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(width / 2 - 130, height / 2 - 16, 260, 32, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#475569";
      ctx.font = `bold 11px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No sample data for active filter", width / 2, height / 2);
      ctx.restore();
    }
  };

  const renderMap = () => {
    let yearStr = "";
    if (rawData && rawData.length > 0 && headers.year) {
      const years = Array.from(new Set(rawData.map((d: any) => d[headers.year]).filter(Boolean)));
      if (years.length > 0) yearStr = `${years.join(", ")}`;
    }

    const fullName = PARAM_CONFIG[activeParam]?.name || activeParam;

    if (canvasRef.current) {
      const gList = sideBySide ? groupListPre : groupList;
      const baseTitle = sideBySide ? `Heat Map For ${fullName} (Pre)` : customMapTitle || `Heat Map For ${fullName}`;
      const title = baseTitle;

      const seasonText = sideBySide ? `Pre-Monsoon` : `${seasonFilter === "both" ? "All Seasons" : seasonFilter === "pre" ? "Pre-Monsoon" : "Post-Monsoon"}`;
      const subtitle = yearStr ? `${seasonText} ${yearStr}` : seasonText;

      drawMapOnCanvas(canvasRef.current, gList, title, subtitle);
    }
    if (sideBySide && canvasPostRef.current) {
      const baseTitle = `Heat Map For ${fullName} (Post)`;
      const title = baseTitle;

      const seasonText = `Post-Monsoon`;
      const subtitle = yearStr ? `${seasonText} ${yearStr}` : seasonText;

      drawMapOnCanvas(canvasPostRef.current, groupListPost, title, subtitle);
    }
  };

  useEffect(() => {
    renderMap();
    const timer1 = setTimeout(() => {
      renderMap();
    }, 50);
    const timer2 = setTimeout(() => {
      renderMap();
    }, 200);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [
    groupList, 
    groupListPre,
    groupListPost,
    sideBySide,
    zoom, 
    panX, 
    panY, 
    hoveredGroup, 
    mapBounds, 
    customMapTitle, 
    effectiveLayers, 
    activeClasses, 
    choroplethMode, 
    transparentBackground, 
    showCompass, 
    showScaleBar, 
    showGridLines,
    showRegionNames, 
    showStateNames,
    showDistrictNames,
    showBlockNames,
    showIndiaBoundary,
    layoutMode,
    showMapBorder,
    basemap,
    basemapOpacity,
    fontFamily,
    fontStyle,
    fontSizeTitle,
    fontSizeSubtitle,
    fontSizeLegend,
    fontColor,
    legendTransparent,
    northArrowPos,
    legendPos,
    titlePos,
    redrawTilesTrigger,
    nameOverrides,
    labelOffsets,
    stateFontFamily,
    stateFontSize,
    stateFontStyle,
    stateFontColor,
    showExceedanceSubLabel,
    subLabelFontFamily,
    subLabelFontSize,
    subLabelFontStyle,
    subLabelFontColor,
    subLabelFormat,
    titleFontFamily,
    titleFontSize,
    titleFontStyle,
    titleFontColor,
    subtitleFontFamily,
    subtitleFontSize,
    subtitleFontStyle,
    subtitleFontColor,
    legendFontFamily,
    legendFontSize,
    legendFontStyle,
    legendFontColor,
    nilColor,
    nilLabel,
    selectedBoundaryLayerId,
    primaryLayer,
    isVisible
  ]);

  // Drag to pan or move sub-elements handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    if (!canvas) return;

    clickStartPos.current = { x: e.clientX, y: e.clientY };

    const rect = canvas.getBoundingClientRect();
    const scaleX = (canvas.width / pixelRatio) / rect.width;
    const scaleY = (canvas.height / pixelRatio) / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // 0. Check if clicked near a Map Label (to drag and replace its location on the map area using mouse)
    for (const pos of renderedLabelPositionsRef.current.values()) {
      const dist = Math.hypot(x - pos.sx, y - pos.sy);
      if (dist <= 30) {
        setIsDraggingLabel(pos.name);
        const currentOff = labelOffsets[pos.name] || { dx: 0, dy: 0 };
        dragLabelOffsetStart.current = {
          x,
          y,
          initialDx: currentOff.dx,
          initialDy: currentOff.dy,
        };
        return;
      }
    }

    // 1. Check if clicked near North Arrow (Compass)
    const compassX = northArrowPos.x === 550 ? (canvas.width / pixelRatio) - 40 : northArrowPos.x;
    const compassY = northArrowPos.y === 40 ? 50 : northArrowPos.y;
    if (showCompass && Math.sqrt((x - compassX)**2 + (y - compassY)**2) < 25) {
      setIsDraggingNorthArrow(true);
      dragElementStartOffset.current = { x: x - compassX, y: y - compassY };
      return;
    }

    // 2. Check if clicked in Legend box (bounds: lX to lX+160, lY to lY+lH)
    const lH = Math.max(110, (activeClasses.length + 2) * 15 + 30);
    const lX = legendPos.x === 420 ? Math.round((canvas.width / pixelRatio) - 180) : legendPos.x;
    const lY = legendPos.y === 280 ? Math.round((canvas.height / pixelRatio) - lH - 20) : legendPos.y;
    if (x >= lX && x <= lX + 160 && y >= lY && y <= lY + lH) {
      setIsDraggingLegend(true);
      dragElementStartOffset.current = { x: x - lX, y: y - lY };
      return;
    }

    // 3. Check if clicked near Title
    const titleX = titlePos.x === 20 ? (canvas.width / pixelRatio) / 2 : titlePos.x;
    const titleY = titlePos.y === 30 ? 30 : titlePos.y;
    if (x >= titleX - 150 && x <= titleX + 150 && y >= titleY - 20 && y <= titleY + 35) {
      setIsDraggingTitle(true);
      dragElementStartOffset.current = { x: x - titleX, y: y - titleY };
      return;
    }

    // 4. Default to panning the map
    setIsDragging(true);
    setDragStart({ x: e.clientX * scaleX - panX, y: e.clientY * scaleY - panY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    
    const scaleX = (canvas.width / pixelRatio) / rect.width;
    const scaleY = (canvas.height / pixelRatio) / rect.height;
    const x = cssX * scaleX;
    const y = cssY * scaleY;

    const width = canvas.width / pixelRatio;
    const height = canvas.height / pixelRatio;

    if (isDraggingLabel) {
      const deltaX = x - dragLabelOffsetStart.current.x;
      const deltaY = y - dragLabelOffsetStart.current.y;
      const newDx = Math.round(dragLabelOffsetStart.current.initialDx + deltaX);
      const newDy = Math.round(dragLabelOffsetStart.current.initialDy + deltaY);
      setLabelOffsets((prev) => ({
        ...prev,
        [isDraggingLabel]: { dx: newDx, dy: newDy },
      }));
    } else if (isDraggingNorthArrow) {
      setNorthArrowPos({
        x: Math.max(10, Math.min(width - 10, x - dragElementStartOffset.current.x)),
        y: Math.max(10, Math.min(height - 10, y - dragElementStartOffset.current.y))
      });
    } else if (isDraggingLegend) {
      const lH = Math.max(110, (activeClasses.length + 2) * 15 + 30);
      setLegendPos({
        x: Math.max(10, Math.min(width - 160, x - dragElementStartOffset.current.x)),
        y: Math.max(10, Math.min(height - lH, y - dragElementStartOffset.current.y))
      });
    } else if (isDraggingTitle) {
      setTitlePos({
        x: Math.max(5, Math.min(width - 50, x - dragElementStartOffset.current.x)),
        y: Math.max(15, Math.min(height - 15, y - dragElementStartOffset.current.y))
      });
    } else if (isDragging) {
      setPanX(e.clientX * scaleX - dragStart.x);
      setPanY(e.clientY * scaleY - dragStart.y);
    } else {
      // Check if mouse is near any map label to set move cursor
      let nearLabelName: string | null = null;
      for (const pos of renderedLabelPositionsRef.current.values()) {
        if (Math.hypot(x - pos.sx, y - pos.sy) <= 30) {
          nearLabelName = pos.name;
          break;
        }
      }
      setHoveredLabelName(nearLabelName);

      // Unproject screen coordinates to geographic coordinates
      const [mouseLon, mouseLat] = unproject(x, y, width, height);

      const userLayers = (effectiveLayers || []).filter((l) => l.visible && l.geoJson);
      const defaultIndiaLayers: ShapefileLayer[] = [
        {
          id: "india-default-layer",
          name: "India Boundary",
          visible: true,
          strokeColor: "#0f172a",
          strokeWidth: 1.8,
          fillColor: "#e2e8f0",
          fillOpacity: 0.1,
          showLabels: true,
          labelKey: "name",
          labelColor: "#0f172a",
          labelSize: 10,
          geoJson: {
            type: "FeatureCollection",
            features: [INDIA_BOUNDARY]
          }
        }
      ];
      const activeLayers = userLayers.length > 0 ? userLayers : defaultIndiaLayers;
      let foundGroup: GroupData | null = null;

      // 1. Polygon hit-test: check if mouse is inside any GeoJSON shapefile feature
      if (activeLayers.length > 0 && Number.isFinite(mouseLon) && Number.isFinite(mouseLat)) {
        for (const layer of activeLayers) {
          const features = getMatchingFeaturesForLayer(layer);
          for (const f of features) {
            if (f && f.geometry && isPointInFeature(mouseLon, mouseLat, f)) {
              const matched = findGroupForFeature(f, groupList);
              if (matched) {
                foundGroup = matched;
                break;
              } else {
                const featName = String(
                  f.properties?.[layer.labelKey] ||
                  f.properties?.STNAME ||
                  f.properties?.DISTRICT ||
                  f.properties?.District ||
                  f.properties?.State_Name ||
                  f.properties?.STATE ||
                  f.properties?.NAME ||
                  ""
                ).trim();
                if (featName) {
                  foundGroup = {
                    name: featName,
                    centroidLon: mouseLon,
                    centroidLat: mouseLat,
                    totalSamples: 0,
                    failCount: 0,
                    pctExceedance: 0,
                    avgValue: 0,
                  };
                  break;
                }
              }
            }
          }
          if (foundGroup) break;
        }
      }

      // 2. Fallback distance check: search centroids with generous 250px radius to locate state/district everywhere
      if (!foundGroup && groupList.length > 0) {
        let minDist = Infinity;
        let nearest: GroupData | null = null;

        groupList.forEach((g) => {
          const [sx, sy] = project(g.centroidLon, g.centroidLat, width, height);
          const dx = x - sx;
          const dy = y - sy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < minDist) {
            minDist = dist;
            nearest = g;
          }
        });

        if (nearest && minDist < 250) {
          foundGroup = nearest;
        }
      }

      setHoveredGroup(foundGroup);
      if (foundGroup) {
        setTooltipPos({ x: cssX + 15, y: cssY + 15 });
      }
    }
  };

  const handleCanvasClickEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = (canvas.width / pixelRatio) / rect.width;
    const scaleY = (canvas.height / pixelRatio) / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // 1. Skip if clicked on North arrow, legend or title dragging areas
    const compassX = northArrowPos.x === 550 ? (canvas.width / pixelRatio) - 40 : northArrowPos.x;
    const compassY = northArrowPos.y === 40 ? 50 : northArrowPos.y;
    if (showCompass && Math.sqrt((x - compassX)**2 + (y - compassY)**2) < 25) return;

    const lH = Math.max(110, (activeClasses.length + 2) * 15 + 30);
    const lX = legendPos.x === 420 ? Math.round((canvas.width / pixelRatio) - 180) : legendPos.x;
    const lY = legendPos.y === 280 ? Math.round((canvas.height / pixelRatio) - lH - 20) : legendPos.y;
    if (x >= lX && x <= lX + 160 && y >= lY && y <= lY + lH) return;

    const titleX = titlePos.x === 20 ? (canvas.width / pixelRatio) / 2 : titlePos.x;
    const titleY = titlePos.y === 30 ? 30 : titlePos.y;
    if (x >= titleX - 150 && x <= titleX + 150 && y >= titleY - 20 && y <= titleY + 35) return;

    // 2. Unproject screen click to geographic lon/lat
    const [lon, lat] = unproject(x, y, canvas.width, canvas.height);

    // 3. Find which feature was clicked
    const userLayers = (effectiveLayers || []).filter(l => l.visible && l.geoJson);
    const defaultIndiaLayers: ShapefileLayer[] = [
      {
        id: "india-default-layer",
        name: "India Boundary",
        visible: true,
        strokeColor: "#0f172a",
        strokeWidth: 1.8,
        fillColor: "#e2e8f0",
        fillOpacity: 0.1,
        showLabels: true,
        labelKey: "name",
        labelColor: "#0f172a",
        labelSize: 10,
        geoJson: {
          type: "FeatureCollection",
          features: [INDIA_BOUNDARY]
        }
      }
    ];
    const activeLayers = userLayers.length > 0 ? userLayers : defaultIndiaLayers;
    let clickedFeature: any = null;
    let clickedLayer: any = null;

    for (const layer of activeLayers) {
      const features = getMatchingFeaturesForLayer(layer);
      for (const f of features) {
        if (f && f.geometry && isPointInFeature(lon, lat, f)) {
          clickedFeature = f;
          clickedLayer = layer;
          break;
        }
      }
      if (clickedFeature) break;
    }

    if (clickedFeature && clickedLayer) {
      const isPostCanvas = sideBySide && canvas === canvasPostRef.current;
      const gList = isPostCanvas ? groupListPost : (sideBySide ? groupListPre : groupList);
      const matchedG = findGroupForFeature(clickedFeature, gList);
      const featPropName = String(
        clickedFeature.properties?.[clickedLayer.labelKey] ||
        clickedFeature.properties?.STNAME ||
        clickedFeature.properties?.DISTRICT ||
        clickedFeature.properties?.District ||
        clickedFeature.properties?.State_Name ||
        clickedFeature.properties?.STATE ||
        clickedFeature.properties?.NAME ||
        ""
      ).trim();

      const originalName = matchedG ? matchedG.name : (featPropName || "");
      if (originalName) {
        setRenamingFeature({
          feature: clickedFeature,
          layer: clickedLayer,
          originalName,
          currentName: nameOverrides[originalName] || originalName,
        });
        setNewNameInput(nameOverrides[originalName] || originalName);
      }
    } else {
      // Fallback: Check if clicked near any of the centroids or hoveredGroup
      const isPostCanvas = sideBySide && canvas === canvasPostRef.current;
      const gList = isPostCanvas ? groupListPost : (sideBySide ? groupListPre : groupList);
      let closestG: GroupData | null = hoveredGroup;
      let minDistance = 120; // Expanded click tolerance in pixels for easy mouse replacement

      gList.forEach((g) => {
        const [sx, sy] = project(g.centroidLon, g.centroidLat, canvas.width, canvas.height);
        const dist = Math.sqrt((x - sx)**2 + (y - sy)**2);
        if (dist < minDistance) {
          minDistance = dist;
          closestG = g;
        }
      });

      if (closestG) {
        const originalName = (closestG as GroupData).name;
        setRenamingFeature({
          feature: null,
          layer: null,
          originalName,
          currentName: nameOverrides[originalName] || originalName,
        });
        setNewNameInput(nameOverrides[originalName] || originalName);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingLabel) {
      triggerToast(`Location of label "${isDraggingLabel}" updated on map!`, "success");
      setIsDraggingLabel(null);
    }
    setIsDragging(false);
    setIsDraggingNorthArrow(false);
    setIsDraggingLegend(false);
    setIsDraggingTitle(false);

    // If it's a simple click (mouse didn't move significantly)
    const dx = e.clientX - clickStartPos.current.x;
    const dy = e.clientY - clickStartPos.current.y;
    const isClick = Math.sqrt(dx * dx + dy * dy) < 5;
    if (isClick) {
      handleCanvasClickEvent(e);
    }
  };

  // Zoom helpers - exact +/- 5% zoom in and zoom out facility on every click
  const handleZoomIn = () => setZoom((z) => Math.min(20, z * 1.05));
  const handleZoomOut = () => setZoom((z) => Math.max(0.1, z * 0.95));
  const handleReset = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setHoveredGroup(null);
  };

  // Pre-calculate class statistics for the classification table
  const tableData = useMemo(() => {
    let rows = [];
    
    // 1. Special 0% category (ONLY FOR EXCEEDANCE)
    if (true) {
      const zeroMatched = groupList.filter((g) => g.pctExceedance === 0);
      rows.push({
        slNo: 0,
        rangeText: "0%",
        label: "Nil Exceedance",
        color: "#38bdf8",
        count: zeroMatched.length,
        items: zeroMatched.map(m => ({
          name: m.name,
          pct: m.pctExceedance,
          fail: m.failCount,
          total: m.totalSamples,
        })),
      });
    }

    // 2. The standard customizable classes
    const classes = activeClasses;
    const standardRows = classes.map((cls, idx) => {
      const prevLimit = idx === 0 ? 0 : classes[idx - 1].limit;
      
      let rangeText = "";
      if (true) {
        rangeText = idx === 0 ? `>0% – ${cls.limit}%` : `>${prevLimit}% – ${cls.limit}%`;
      } else {
        rangeText = idx === 0 ? `≤ ${cls.limit}` : `>${prevLimit} – ${cls.limit}`;
      }
      
      // Match groups belonging to this range
      const matched = groupList.filter((g) => {
        const val = g.pctExceedance;
        
        if (true) {
          if (val === 0) return false; // Handled by zeroRow
          if (idx === 0) return val > 0 && val <= cls.limit;
        } else {
          // For average or count, 0 is a valid number inside standard classes
          if (idx === 0) return val <= cls.limit;
        }
        return val > prevLimit && val <= cls.limit;
      });

      return {
        slNo: idx + 1,
        rangeText,
        label: cls.label,
        color: cls.color,
        count: matched.length,
        items: matched.map(m => ({
          name: m.name,
          pct: m.pctExceedance,
          fail: m.failCount,
          total: m.totalSamples,
        })),
      };
    });

    return [...rows, ...standardRows];
  }, [groupList, activeClasses]);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `GIS_Choropleth_Map_${layoutMode}_${activeParam}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      triggerToast("Downloaded high-quality map successfully!", "success");
    } catch (err) {
      console.error(err);
      triggerToast("Failed to download image.", "error");
    }
  };

  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        // Pop-up blocked fallback
        downloadPng();
        triggerToast("Pop-up blocked! High-res map downloaded instead for direct printing.", "success");
        return;
      }
      printWindow.document.write(`
        <html>
          <head>
            <title>Print GIS Map - ${activeParam}</title>
            <style>
              body { margin: 0; display: flex; align-items: center; justify-content: center; background-color: #f8fafc; font-family: system-ui, sans-serif; }
              .container { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 20px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); text-align: center; }
              img { max-width: 100%; max-height: 85vh; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 4px; }
              .btn { background-color: #4f46e5; color: white; padding: 10px 24px; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2); }
              @media print {
                body { background: white; }
                .btn { display: none; }
                .container { border: none; box-shadow: none; padding: 0; margin: 0; }
                img { border: none; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <button class="btn" onclick="window.print()">Print This Map</button>
              <br/>
              <img src="${dataUrl}" />
              <div style="margin-top: 12px; font-size: 12px; color: #64748b; font-weight: 500;">
                GIS Exceedance Map Layout (${layoutMode}) - Generated on ${new Date().toLocaleDateString()}
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error(err);
      downloadPng();
      triggerToast("Error opening print window. Map downloaded instead.", "success");
    }
  };

  // Function to send Map Image to Bulletin Report
  const handleSendToBulletin = () => {
    const canvas = canvasRef.current;
    if (!canvas || !sendToBulletin) return;

    try {
      const dataUrl = canvas.toDataURL("image/png");
      sendToBulletin(`Spatial Exceedance Map (${seasonFilter === "both" ? "All Seasons" : seasonFilter === "pre" ? "Pre-Monsoon" : "Post-Monsoon"})`, dataUrl);
      triggerToast("GIS Exceedance Map sent to report successfully!", "success");
    } catch (err) {
      console.error(err);
      triggerToast("Failed to compile spatial map image.", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-md p-5 flex flex-col xl:flex-row gap-6 relative">
      {/* Local Toast Alert */}
      {localToast && (
        <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold text-white transition-all flex items-center gap-2 ${
          localToast.type === "success" ? "bg-emerald-500 shadow-emerald-100" : "bg-rose-500 shadow-rose-100"
        }`}>
          <span>{localToast.message}</span>
        </div>
      )}
      {/* Sidebar Controls Panel */}
      <div className="w-full xl:w-[320px] shrink-0 flex flex-col justify-between gap-4 border-r border-slate-100 xl:pr-5 max-h-[750px] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-600" />
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">
              {customMapTitle || "GIS Choropleth Analysis"}
            </h4>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            Professional GIS choropleth mapping tool. Renders and colors boundaries dynamically based on groundwater permissible limit exceedances.
          </p>

          {/* Season Selector */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-1.5">
            <label className="text-[9px] font-black uppercase text-indigo-950 tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-indigo-500" />
                Season Filter
              </span>
              {detectedSeasons.count === 1 && (
                <span className="text-[8px] font-black text-amber-800 bg-amber-100/90 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                  Single Season Sheet
                </span>
              )}
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-200/50 p-0.5 rounded-lg">
              <button
                onClick={() => setSeasonFilter("pre")}
                disabled={!detectedSeasons.hasPre && detectedSeasons.hasPost}
                title={!detectedSeasons.hasPre && detectedSeasons.hasPost ? "No Pre-Monsoon data in imported sheet" : "Show Pre-Monsoon Map"}
                className={`py-1 rounded-md text-[10px] font-bold transition-all ${
                  seasonFilter === "pre"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : !detectedSeasons.hasPre && detectedSeasons.hasPost
                    ? "text-slate-400 opacity-50 cursor-not-allowed"
                    : "text-slate-600 hover:text-slate-900 cursor-pointer"
                }`}
              >
                Pre-Mon {detectedSeasons.hasPre && !detectedSeasons.hasPost ? "✓" : ""}
              </button>
              <button
                onClick={() => setSeasonFilter("post")}
                disabled={!detectedSeasons.hasPost && detectedSeasons.hasPre}
                title={!detectedSeasons.hasPost && detectedSeasons.hasPre ? "No Post-Monsoon data in imported sheet" : "Show Post-Monsoon Map"}
                className={`py-1 rounded-md text-[10px] font-bold transition-all ${
                  seasonFilter === "post"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : !detectedSeasons.hasPost && detectedSeasons.hasPre
                    ? "text-slate-400 opacity-50 cursor-not-allowed"
                    : "text-slate-600 hover:text-slate-900 cursor-pointer"
                }`}
              >
                Post-Mon {detectedSeasons.hasPost && !detectedSeasons.hasPre ? "✓" : ""}
              </button>
              <button
                onClick={() => setSeasonFilter("both")}
                disabled={!detectedSeasons.hasPre || !detectedSeasons.hasPost}
                title={
                  !detectedSeasons.hasPre || !detectedSeasons.hasPost
                    ? "Side-by-side comparison requires both Pre and Post Monsoon data in sheet"
                    : "Show Both Seasons Side-by-Side"
                }
                className={`py-1 rounded-md text-[10px] font-bold transition-all ${
                  seasonFilter === "both" && detectedSeasons.hasPre && detectedSeasons.hasPost
                    ? "bg-white text-indigo-600 shadow-xs"
                    : (!detectedSeasons.hasPre || !detectedSeasons.hasPost)
                    ? "text-slate-400 opacity-50 cursor-not-allowed"
                    : "text-slate-600 hover:text-slate-900 cursor-pointer"
                }`}
              >
                Both
              </button>
            </div>
            {!detectedSeasons.hasPost && detectedSeasons.hasPre && (
              <div className="text-[9.5px] font-medium text-amber-800 bg-amber-50/90 border border-amber-200/80 p-2 rounded-lg leading-snug">
                💡 <strong>Single Season Detected:</strong> Sheet contains <strong>Pre-Monsoon</strong> data only. Choropleth map is automatically set to Pre-Monsoon mode.
              </div>
            )}
            {!detectedSeasons.hasPre && detectedSeasons.hasPost && (
              <div className="text-[9.5px] font-medium text-amber-800 bg-amber-50/90 border border-amber-200/80 p-2 rounded-lg leading-snug">
                💡 <strong>Single Season Detected:</strong> Sheet contains <strong>Post-Monsoon</strong> data only. Choropleth map is automatically set to Post-Monsoon mode.
              </div>
            )}
            {detectedSeasons.hasPre && detectedSeasons.hasPost && (
              <div className="text-[9.5px] font-medium text-emerald-800 bg-emerald-50/90 border border-emerald-200/80 p-2 rounded-lg leading-snug">
                ✨ <strong>Dual Seasons Detected:</strong> Sheet contains both Pre & Post Monsoon data. Side-by-side mode available.
              </div>
            )}
          </div>

          {/* Options */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-2">
            <span className="text-[9px] font-black uppercase text-indigo-950 tracking-wider block">
              Label & Name Settings
            </span>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-100/50 transition-all">
                <input
                  type="checkbox"
                  checked={showStateNames}
                  onChange={(e) => setShowStateNames(e.target.checked)}
                  className="text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 w-3 h-3"
                />
                <span className="text-[10px] font-bold text-slate-800">Show State/UT Names</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-100/50 transition-all">
                <input
                  type="checkbox"
                  checked={showDistrictNames}
                  onChange={(e) => setShowDistrictNames(e.target.checked)}
                  className="text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 w-3 h-3"
                />
                <span className="text-[10px] font-bold text-slate-800">Show District Names</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-100/50 transition-all">
                <input
                  type="checkbox"
                  checked={showBlockNames}
                  onChange={(e) => setShowBlockNames(e.target.checked)}
                  className="text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 w-3 h-3"
                />
                <span className="text-[10px] font-bold text-slate-800">Show Block Names</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-100/50 transition-all border-t border-slate-200/50 pt-1.5 mt-0.5">
                <input
                  type="checkbox"
                  checked={useShortNames}
                  onChange={(e) => setUseShortNames(e.target.checked)}
                  className="text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 w-3 h-3"
                />
                <span className="text-[10px] font-bold text-slate-800">Use Short Names (Abbreviate)</span>
              </label>
            </div>
          </div>

          {/* Shapefile Layer Management & Upload */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black uppercase text-indigo-950 tracking-wider flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-indigo-600" /> Shapefile Layers ({effectiveLayers.length})
              </span>
              <label className="cursor-pointer px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all shadow-xs">
                <Upload className="w-3 h-3" />
                Upload .zip / .geojson
                <input
                  type="file"
                  accept=".zip,.geojson,.json"
                  multiple
                  className="hidden"
                  onChange={handleShapefileUpload}
                />
              </label>
            </div>

            {/* Primary Boundary Selection */}
            {effectiveLayers.length > 0 && (
              <div className="flex items-center justify-between gap-2 p-1.5 bg-white rounded-lg border border-slate-200 text-[10px]">
                <span className="font-bold text-slate-700 shrink-0">Choropleth Boundary:</span>
                <select
                  value={selectedBoundaryLayerId}
                  onChange={(e) => setSelectedBoundaryLayerId(e.target.value)}
                  className="text-[10px] font-bold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-800 max-w-[140px] truncate"
                >
                  <option value="auto">Auto ({primaryLayer?.name || "Detect"})</option>
                  {effectiveLayers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} {l.visible ? "" : "(Hidden)"}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {effectiveLayers.length === 0 ? (
              <div className="text-[10px] text-slate-400 italic p-2 bg-white/60 rounded-lg border border-dashed border-slate-200 text-center">
                No custom shapefiles uploaded yet. Using default India boundary layer.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                {effectiveLayers.map((layer) => {
                  const sampleFeatures = layer.geoJson?.features || (layer.geoJson?.type === "Feature" ? [layer.geoJson] : []);
                  const propKeys = sampleFeatures[0]?.properties ? Object.keys(sampleFeatures[0].properties) : [];

                  return (
                    <div key={layer.id} className="p-2 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEffectiveLayers((prev) =>
                                prev.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l))
                              );
                            }}
                            className={`p-1 rounded transition-colors ${
                              layer.visible ? "text-indigo-600 hover:bg-indigo-50" : "text-slate-400 hover:bg-slate-100"
                            }`}
                            title={layer.visible ? "Hide layer" : "Show layer"}
                          >
                            {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <span className="text-[11px] font-bold text-slate-800 truncate" title={layer.name}>
                            {layer.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEffectiveLayers((prev) => prev.filter((l) => l.id !== layer.id));
                            triggerToast(`Removed shapefile layer: ${layer.name}`, "info");
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="Delete layer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {layer.visible && (
                        <div className="pt-1.5 border-t border-slate-100 space-y-2">
                          {propKeys.length > 0 && (
                            <div>
                              <span className="text-[8px] font-bold uppercase text-slate-400 block mb-0.5">Label Attribute</span>
                              <select
                                value={layer.labelKey || ""}
                                onChange={(e) => {
                                  const newKey = e.target.value;
                                  setEffectiveLayers((prev) =>
                                    prev.map((l) => (l.id === layer.id ? { ...l, labelKey: newKey } : l))
                                  );
                                }}
                                className="w-full text-[9px] font-bold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-700"
                              >
                                <option value="">Auto-Detect</option>
                                {propKeys.map((k) => (
                                  <option key={k} value={k}>
                                    {k}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Individual Layer Stroke & Fill Customization */}
                          <div className="bg-slate-50/80 p-2 rounded-lg border border-slate-200/60 space-y-1.5 text-[10px]">
                            <div className="grid grid-cols-2 gap-2 items-center">
                              {/* Stroke Color */}
                              <div className="flex items-center justify-between bg-white px-1.5 py-1 rounded border border-slate-200">
                                <span className="text-[9px] font-bold text-slate-600">Line Color</span>
                                <input
                                  type="color"
                                  value={layer.strokeColor || globalStrokeColor || "#0f172a"}
                                  onChange={(e) => {
                                    const color = e.target.value;
                                    setEffectiveLayers((prev) =>
                                      prev.map((l) => (l.id === layer.id ? { ...l, strokeColor: color } : l))
                                    );
                                  }}
                                  className="w-5 h-5 rounded border border-slate-200 cursor-pointer p-0 shrink-0"
                                  title="Line Color"
                                />
                              </div>

                              {/* Stroke Thickness */}
                              <div className="flex items-center justify-between bg-white px-1.5 py-1 rounded border border-slate-200">
                                <span className="text-[9px] font-bold text-slate-600">Thickness</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="range"
                                    min="0.2"
                                    max="6"
                                    step="0.1"
                                    value={typeof layer.strokeWidth === "number" ? layer.strokeWidth : globalStrokeWidth}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 1.5;
                                      setEffectiveLayers((prev) =>
                                        prev.map((l) => (l.id === layer.id ? { ...l, strokeWidth: val } : l))
                                      );
                                    }}
                                    className="w-10 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    title="Thickness"
                                  />
                                  <span className="text-[8.5px] font-mono font-bold text-slate-600 w-5 text-right">
                                    {(typeof layer.strokeWidth === "number" ? layer.strokeWidth : globalStrokeWidth).toFixed(1)}
                                  </span>
                                </div>
                              </div>

                              {/* Fill Color */}
                              <div className="flex items-center justify-between bg-white px-1.5 py-1 rounded border border-slate-200">
                                <span className="text-[9px] font-bold text-slate-600">Fill Color</span>
                                <input
                                  type="color"
                                  value={layer.fillColor || globalFillColor || "#3b82f6"}
                                  onChange={(e) => {
                                    const color = e.target.value;
                                    setEffectiveLayers((prev) =>
                                      prev.map((l) => (l.id === layer.id ? { ...l, fillColor: color } : l))
                                    );
                                  }}
                                  className="w-5 h-5 rounded border border-slate-200 cursor-pointer p-0 shrink-0"
                                  title="Fill Color"
                                />
                              </div>

                              {/* Fill Opacity */}
                              <div className="flex items-center justify-between bg-white px-1.5 py-1 rounded border border-slate-200">
                                <span className="text-[9px] font-bold text-slate-600">Fill Opacity</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="5"
                                    value={typeof layer.fillOpacity === "number" ? layer.fillOpacity : globalFillOpacity}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      setEffectiveLayers((prev) =>
                                        prev.map((l) => (l.id === layer.id ? { ...l, fillOpacity: val } : l))
                                      );
                                    }}
                                    className="w-10 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    title="Fill Opacity"
                                  />
                                  <span className="text-[8.5px] font-mono font-bold text-slate-600 w-5 text-right">
                                    {typeof layer.fillOpacity === "number" ? layer.fillOpacity : globalFillOpacity}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Choropleth Mode Selector */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-1.5">
            <label className="text-[9px] font-black uppercase text-indigo-950 tracking-wider block">
              Map Visualization Mode
            </label>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-start gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-slate-100/50 transition-all">
                <input
                  type="radio"
                  name="choroplethMode"
                  checked={choroplethMode === "region"}
                  onChange={() => setChoroplethMode("region")}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-slate-800">Region-based (Shapefile)</span>
                  <span className="text-[9px] text-slate-400">Color individual shapefile polygons directly. Renders names and exceedance percentages in place.</span>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-slate-100/50 transition-all">
                <input
                  type="radio"
                  name="choroplethMode"
                  checked={choroplethMode === "voronoi"}
                  onChange={() => setChoroplethMode("voronoi")}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-slate-800">Continuous Heatmap Grid</span>
                  <span className="text-[9px] text-slate-400">Interpolate data point values across coordinates and clip the rendering to polygon bounds.</span>
                </div>
              </label>
            </div>
          </div>

          {/* Bulk Shapefile Boundary & Fill Customizer */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-black uppercase text-indigo-950 tracking-wider block">
                All Shapefiles Global Styling
              </label>
              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                Bulk Override
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-700">Line Color</span>
                <input
                  type="color"
                  value={globalStrokeColor}
                  onChange={(e) => {
                    const color = e.target.value;
                    setGlobalStrokeColor(color);
                    setEffectiveLayers((prev) => prev.map((l) => ({ ...l, strokeColor: color })));
                  }}
                  className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0"
                />
              </div>

              <div className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-700">Thickness</span>
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min="0.2"
                    max="6"
                    step="0.1"
                    value={globalStrokeWidth}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 1.5;
                      setGlobalStrokeWidth(val);
                      setEffectiveLayers((prev) => prev.map((l) => ({ ...l, strokeWidth: val })));
                    }}
                    className="w-12 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="text-[10px] font-mono font-bold text-slate-600 w-6 text-right">
                    {globalStrokeWidth.toFixed(1)}px
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-700">Fill Color</span>
                <input
                  type="color"
                  value={globalFillColor}
                  onChange={(e) => {
                    const color = e.target.value;
                    setGlobalFillColor(color);
                    setEffectiveLayers((prev) => prev.map((l) => ({ ...l, fillColor: color })));
                  }}
                  className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0"
                />
              </div>

              <div className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-700">Fill Opacity</span>
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={globalFillOpacity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setGlobalFillOpacity(val);
                      setEffectiveLayers((prev) => prev.map((l) => ({ ...l, fillOpacity: val })));
                    }}
                    className="w-12 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="text-[10px] font-mono font-bold text-slate-600 w-6 text-right">
                    {globalFillOpacity}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Map Aesthetics / Layout Toggles */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-2">
            <label className="text-[9px] font-black uppercase text-indigo-950 tracking-wider block">
              Base Map & Layout Settings
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={transparentBackground}
                  onChange={(e) => setTransparentBackground(e.target.checked)}
                  className="rounded text-indigo-600 w-3.5 h-3.5"
                />
                <span className="text-[10px] font-bold text-slate-700">Transparent Bg</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showGridLines}
                  onChange={(e) => setShowGridLines(e.target.checked)}
                  className="rounded text-indigo-600 w-3.5 h-3.5"
                />
                <span className="text-[10px] font-bold text-slate-700">Lat/Lon Grid</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCompass}
                  onChange={(e) => setShowCompass(e.target.checked)}
                  className="rounded text-indigo-600 w-3.5 h-3.5"
                />
                <span className="text-[10px] font-bold text-slate-700">Compass (North)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showScaleBar}
                  onChange={(e) => setShowScaleBar(e.target.checked)}
                  className="rounded text-indigo-600 w-3.5 h-3.5"
                />
                <span className="text-[10px] font-bold text-slate-700">Scale Bar (km)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMapBorder}
                  onChange={(e) => setShowMapBorder(e.target.checked)}
                  className="rounded text-indigo-600 w-3.5 h-3.5"
                />
                <span className="text-[10px] font-bold text-slate-700">Double Border Line</span>
              </label>
              <label className="col-span-2 flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showIndiaBoundary}
                  onChange={(e) => setShowIndiaBoundary(e.target.checked)}
                  className="rounded text-indigo-600 w-3.5 h-3.5"
                />
                <span className="text-[10px] font-bold text-slate-700">Draw India Fallback Border</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={show3DBubbles}
                  onChange={(e) => setShow3DBubbles(e.target.checked)}
                  className="rounded text-indigo-600 w-3.5 h-3.5"
                />
                <span className="text-[10px] font-bold text-slate-700">3D Glossy Bubble Points</span>
              </label>

              <div className="col-span-2 pt-2 border-t border-slate-200/40 space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleExportImage}
                    className="flex-1 text-[10px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded-lg transition-colors shadow-sm"
                  >
                    Export PNG
                  </button>
                </div>
              </div>

              <div className="col-span-2 pt-2 border-t border-slate-200/40 space-y-2">
                <div className="space-y-0.5">
                  <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">Base Map Style</label>
                  <select
                    value={basemap}
                    onChange={(e) => setBasemap(e.target.value)}
                    className="w-full text-[10px] font-bold p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                  >
                    <option value="No Basemap">No Basemap (Solid Color)</option>
                    <option value="OpenStreetMap">OpenStreetMap</option>
                    <option value="ESRI Terrain">ESRI Terrain</option>
                    <option value="ESRI Topographic">ESRI Topographic</option>
                    <option value="ESRI Satellite">ESRI Satellite</option>
                    <option value="CartoDB Light">CartoDB Light (Minimalist)</option>
                    <option value="CartoDB Dark">CartoDB Dark (Night)</option>
                  </select>
                </div>
                {basemap !== "No Basemap" && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                      <span>Basemap Opacity</span>
                      <span>{basemapOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={basemapOpacity}
                      onChange={(e) => setBasemapOpacity(parseInt(e.target.value))}
                      className="w-full accent-indigo-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* A4 Size & Portrait/Landscape Layout */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-2">
            <label className="text-[9px] font-black uppercase text-indigo-950 tracking-wider block">
              Layout & Sheet Sizing
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-200/50 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => { setLayoutMode("default"); }}
                className={`py-1 rounded-md text-[10px] font-bold transition-all ${
                  layoutMode === "default"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Default
              </button>
              <button
                type="button"
                onClick={() => { setLayoutMode("a4-portrait"); }}
                className={`py-1 rounded-md text-[10px] font-bold transition-all ${
                  layoutMode === "a4-portrait"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                A4 Portrait
              </button>
              <button
                type="button"
                onClick={() => { setLayoutMode("a4-landscape"); }}
                className={`py-1 rounded-md text-[10px] font-bold transition-all ${
                  layoutMode === "a4-landscape"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                A4 Landscape
              </button>
            </div>
          </div>

          {/* Map Zoom & View Controls */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-2">
            <label className="text-[9px] font-black uppercase text-indigo-950 tracking-wider block">
              Map Zoom & View Controls
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={handleZoomIn}
                className="py-1 px-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 font-bold text-[9px] flex items-center justify-center gap-1 shadow-3xs transition-all"
                title="Zoom In (+5%)"
              >
                <Plus className="w-3 h-3" /> Zoom In
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                className="py-1 px-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 font-bold text-[9px] flex items-center justify-center gap-1 shadow-3xs transition-all"
                title="Zoom Out (-5%)"
              >
                <Minus className="w-3 h-3" /> Zoom Out
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="py-1 px-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 font-bold text-[9px] flex items-center justify-center gap-1 shadow-3xs transition-all"
                title="Reset View Zoom/Pan"
              >
                <RotateCcw className="w-3 h-3" /> Reset View
              </button>
            </div>
          </div>

          {/* Typography Settings Collapsible Panel */}
          <div className="bg-slate-50/50 rounded-xl border border-slate-200/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedTypography(!expandedTypography)}
              className="w-full p-2.5 flex items-center justify-between text-[10px] font-black uppercase text-indigo-950 tracking-wider hover:bg-slate-100/50 transition-colors"
            >
              <span>Map Typography Settings</span>
              <span className="text-xs">{expandedTypography ? "▼" : "▶"}</span>
            </button>

            {expandedTypography && (
              <div className="p-3 border-t border-slate-200/50 space-y-4 max-h-[300px] overflow-y-auto">
                {/* 1. State Name Labels */}
                <div className="space-y-1.5 pb-2.5 border-b border-slate-200/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase text-indigo-900 tracking-wider block">State / District Name Labels</span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={showRegionNames} onChange={(e) => setShowRegionNames(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 w-2.5 h-2.5" />
                      <span className="text-[9px] font-bold text-slate-600">Show Labels</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Family</label>
                      <select
                        value={stateFontFamily}
                        onChange={(e) => setStateFontFamily(e.target.value)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      >
                        <option value="Inter">Inter</option>
                        <option value="Space Grotesk">Space Grotesk</option>
                        <option value="JetBrains Mono">JetBrains Mono</option>
                        <option value="Playfair Display">Playfair Display</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Arial">Arial</option>
                        <option value="sans-serif">Sans-Serif</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500 block">Font Size (px)</label>
                      <input
                        type="number"
                        min="6"
                        max="28"
                        value={stateFontSize}
                        onChange={(e) => setStateFontSize(parseInt(e.target.value) || 10)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Style</label>
                      <select
                        value={stateFontStyle}
                        onChange={(e) => setStateFontStyle(e.target.value)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="italic">Italic</option>
                        <option value="bold italic">Bold Italic</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Color</label>
                      <div className="flex gap-1">
                        <input
                          type="color"
                          value={stateFontColor}
                          onChange={(e) => setStateFontColor(e.target.value)}
                          className="w-5 h-5 p-0 border-0 cursor-pointer bg-transparent rounded shrink-0"
                        />
                        <input
                          type="text"
                          value={stateFontColor}
                          onChange={(e) => setStateFontColor(e.target.value)}
                          className="w-full text-[8px] font-mono p-0.5 bg-white border border-slate-200 rounded uppercase font-bold"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 1b. Sub-label (% of samples above permissible limit) */}
                <div className="space-y-1.5 pb-2.5 border-b border-slate-200/40 bg-indigo-50/40 p-2 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase text-indigo-900 tracking-wider block">Sub-Label (% Above Limit)</span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={showExceedanceSubLabel} onChange={(e) => setShowExceedanceSubLabel(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 w-2.5 h-2.5" />
                      <span className="text-[9px] font-bold text-indigo-700">Show Sub-Label</span>
                    </label>
                  </div>
                  {showExceedanceSubLabel && (
                    <div className="space-y-2 pt-1">
                      <div className="space-y-0.5">
                        <label className="text-[8px] font-bold text-slate-500">Label Format</label>
                        <select
                          value={subLabelFormat}
                          onChange={(e) => setSubLabelFormat(e.target.value)}
                          className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                        >
                          <option value="percent">(X%) - Percentage Only (Default)</option>
                          <option value="full">(% of samples above permissible limit)</option>
                          <option value="exceedance">(% Exceedance)</option>
                          <option value="short_limit">(% samples &gt; limit)</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-bold text-slate-500">Font Family</label>
                          <select
                            value={subLabelFontFamily}
                            onChange={(e) => setSubLabelFontFamily(e.target.value)}
                            className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                          >
                            <option value="Inter">Inter</option>
                            <option value="Space Grotesk">Space Grotesk</option>
                            <option value="JetBrains Mono">JetBrains Mono</option>
                            <option value="Playfair Display">Playfair Display</option>
                            <option value="Georgia">Georgia</option>
                            <option value="Arial">Arial</option>
                            <option value="sans-serif">Sans-Serif</option>
                          </select>
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-bold text-slate-500">Font Size (px)</label>
                          <input
                            type="number"
                            min="6"
                            max="22"
                            value={subLabelFontSize}
                            onChange={(e) => setSubLabelFontSize(parseInt(e.target.value) || 8)}
                            className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-bold text-slate-500">Font Style</label>
                          <select
                            value={subLabelFontStyle}
                            onChange={(e) => setSubLabelFontStyle(e.target.value)}
                            className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                          >
                            <option value="normal">Normal</option>
                            <option value="bold">Bold</option>
                            <option value="italic">Italic</option>
                            <option value="bold italic">Bold Italic</option>
                          </select>
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-bold text-slate-500">Font Color</label>
                          <div className="flex gap-1">
                            <input
                              type="color"
                              value={subLabelFontColor}
                              onChange={(e) => setSubLabelFontColor(e.target.value)}
                              className="w-5 h-5 p-0 border-0 cursor-pointer bg-transparent rounded shrink-0"
                            />
                            <input
                              type="text"
                              value={subLabelFontColor}
                              onChange={(e) => setSubLabelFontColor(e.target.value)}
                              className="w-full text-[8px] font-mono p-0.5 bg-white border border-slate-200 rounded uppercase font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Map Title */}
                <div className="space-y-1.5 pb-2.5 border-b border-slate-200/40">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Map Title</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Family</label>
                      <select
                        value={titleFontFamily}
                        onChange={(e) => setTitleFontFamily(e.target.value)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      >
                        <option value="Inter">Inter</option>
                        <option value="Space Grotesk">Space Grotesk</option>
                        <option value="JetBrains Mono">JetBrains Mono</option>
                        <option value="Playfair Display">Playfair Display</option>
                        <option value="Georgia">Georgia</option>
                        <option value="sans-serif">Sans-Serif</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Size</label>
                      <input
                        type="number"
                        min="8"
                        max="36"
                        value={titleFontSize}
                        onChange={(e) => setTitleFontSize(parseInt(e.target.value) || 14)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Style</label>
                      <select
                        value={titleFontStyle}
                        onChange={(e) => setTitleFontStyle(e.target.value)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="italic">Italic</option>
                        <option value="bold italic">Bold Italic</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Color</label>
                      <div className="flex gap-1">
                        <input
                          type="color"
                          value={titleFontColor}
                          onChange={(e) => setTitleFontColor(e.target.value)}
                          className="w-5 h-5 p-0 border-0 cursor-pointer bg-transparent rounded shrink-0"
                        />
                        <input
                          type="text"
                          value={titleFontColor}
                          onChange={(e) => setTitleFontColor(e.target.value)}
                          className="w-full text-[8px] font-mono p-0.5 bg-white border border-slate-200 rounded uppercase font-bold"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Map Subtitle */}
                <div className="space-y-1.5 pb-2.5 border-b border-slate-200/40">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Map Subtitle</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Family</label>
                      <select
                        value={subtitleFontFamily}
                        onChange={(e) => setSubtitleFontFamily(e.target.value)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      >
                        <option value="Inter">Inter</option>
                        <option value="Space Grotesk">Space Grotesk</option>
                        <option value="JetBrains Mono">JetBrains Mono</option>
                        <option value="Playfair Display">Playfair Display</option>
                        <option value="Georgia">Georgia</option>
                        <option value="sans-serif">Sans-Serif</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Size</label>
                      <input
                        type="number"
                        min="6"
                        max="24"
                        value={subtitleFontSize}
                        onChange={(e) => setSubtitleFontSize(parseInt(e.target.value) || 9)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Style</label>
                      <select
                        value={subtitleFontStyle}
                        onChange={(e) => setSubtitleFontStyle(e.target.value)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="italic">Italic</option>
                        <option value="bold italic">Bold Italic</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Color</label>
                      <div className="flex gap-1">
                        <input
                          type="color"
                          value={subtitleFontColor}
                          onChange={(e) => setSubtitleFontColor(e.target.value)}
                          className="w-5 h-5 p-0 border-0 cursor-pointer bg-transparent rounded shrink-0"
                        />
                        <input
                          type="text"
                          value={subtitleFontColor}
                          onChange={(e) => setSubtitleFontColor(e.target.value)}
                          className="w-full text-[8px] font-mono p-0.5 bg-white border border-slate-200 rounded uppercase font-bold"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Legend Text */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">Legend Text</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Family</label>
                      <select
                        value={legendFontFamily}
                        onChange={(e) => setLegendFontFamily(e.target.value)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      >
                        <option value="Inter">Inter</option>
                        <option value="Space Grotesk">Space Grotesk</option>
                        <option value="JetBrains Mono">JetBrains Mono</option>
                        <option value="Playfair Display">Playfair Display</option>
                        <option value="Georgia">Georgia</option>
                        <option value="sans-serif">Sans-Serif</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Size</label>
                      <input
                        type="number"
                        min="6"
                        max="24"
                        value={legendFontSize}
                        onChange={(e) => setLegendFontSize(parseInt(e.target.value) || 9)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Style</label>
                      <select
                        value={legendFontStyle}
                        onChange={(e) => setLegendFontStyle(e.target.value)}
                        className="w-full text-[9px] font-bold p-1 bg-white border border-slate-200 rounded"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="italic">Italic</option>
                        <option value="bold italic">Bold Italic</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-bold text-slate-500">Font Color</label>
                      <div className="flex gap-1">
                        <input
                          type="color"
                          value={legendFontColor}
                          onChange={(e) => setLegendFontColor(e.target.value)}
                          className="w-5 h-5 p-0 border-0 cursor-pointer bg-transparent rounded shrink-0"
                        />
                        <input
                          type="text"
                          value={legendFontColor}
                          onChange={(e) => setLegendFontColor(e.target.value)}
                          className="w-full text-[8px] font-mono p-0.5 bg-white border border-slate-200 rounded uppercase font-bold"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Statistics Side Table Settings */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-2">
            <label className="text-[9px] font-black uppercase text-indigo-950 tracking-wider block">
              Side-By-Side Statistics Table
            </label>
            <div className="space-y-2 text-[10px] font-bold text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTableOverlay}
                  onChange={(e) => setShowTableOverlay(e.target.checked)}
                  className="rounded text-indigo-600 w-3.5 h-3.5"
                />
                <span>Show Stats Table next to map</span>
              </label>
              <p className="text-[8.5px] text-slate-400 font-medium leading-relaxed">
                Renders a detailed tabular breakdown of exceedance classification bounds and regional totals directly to the side of the map container.
              </p>
            </div>
          </div>

          {/* Dynamic Class & Legend Customizer */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-2.5">
            <span className="text-[9px] font-black uppercase text-indigo-950 tracking-wider block">
              Classification & Ranges
            </span>

            {/* Single Color & Multi Color Palette Customizer */}
            <div className="space-y-1.5 bg-white p-2 rounded-lg border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-extrabold text-slate-700 flex items-center gap-1">
                  <Palette className="w-3 h-3 text-indigo-600" />
                  Exceedance Color Scheme:
                </span>
                <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase">
                  {CHOROPLETH_PALETTES.find(p => p.id === selectedPalette)?.badge || "Single Hue"}
                </span>
              </div>

              {/* Select Dropdown */}
              <select
                value={selectedPalette}
                onChange={(e) => applyPalette(e.target.value)}
                className="w-full text-[9.5px] font-bold bg-slate-50 border border-slate-200 rounded-md p-1.5 text-slate-800 shadow-xs hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
              >
                <optgroup label="🎨 Single Color Monochromatic Shades (Different Exceedance Levels)">
                  {CHOROPLETH_PALETTES.filter(p => p.type === "single").map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
                <optgroup label="🌈 Multi-Color Ramps">
                  {CHOROPLETH_PALETTES.filter(p => p.type === "multi").map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              </select>

              {/* Active Color Ramp Shade Preview Bar */}
              <div className="space-y-1 pt-0.5">
                <div className="flex items-center justify-between text-[8px] font-bold text-slate-400 px-0.5">
                  <span>Low Exceedance (Light)</span>
                  <span>Severe Exceedance (Dark)</span>
                </div>
                <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded border border-slate-200/80 shadow-inner">
                  {activeClasses.map((cls, idx) => (
                    <div
                      key={idx}
                      className="h-4 flex-1 first:rounded-l last:rounded-r border border-black/10 transition-transform hover:scale-105"
                      style={{ backgroundColor: cls.color }}
                      title={`${cls.label}: ${cls.color}`}
                    />
                  ))}
                </div>
              </div>

              {/* Quick Single Color Palette Pills */}
              <div className="grid grid-cols-4 gap-1 pt-1">
                {[
                  { id: "red-single", label: "🔴 Red Shades" },
                  { id: "blue-single", label: "🔵 Blue Shades" },
                  { id: "orange-single", label: "🟠 Orange Shades" },
                  { id: "green-single", label: "🟢 Green Shades" },
                  { id: "purple-single", label: "🟣 Purple Shades" },
                  { id: "teal-single", label: "🩵 Teal Shades" },
                  { id: "amber-single", label: "🟡 Amber Shades" },
                  { id: "gray-single", label: "⚪ Gray Shades" },
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyPalette(item.id)}
                    className={`py-1 px-0.5 rounded text-[8px] font-black border transition-all truncate ${
                      selectedPalette === item.id
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Class Count Selector */}
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-slate-500">Number of Classes (up to 5):</span>
              <div className="grid grid-cols-4 gap-1">
                {[2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleClassCountChange(num)}
                    className={`py-0.5 rounded text-[10px] font-extrabold border transition-all ${
                      activeClasses.length === num
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {num} Cls
                  </button>
                ))}
              </div>
            </div>

            {/* Range Presets */}
            <div className="space-y-1 border-t border-slate-200/50 pt-2">
              <span className="text-[9px] font-bold text-slate-500">Quick Range Presets:</span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => applyPreset("0-5")}
                  className="py-1 px-1 rounded text-[8px] font-black bg-white hover:bg-slate-50 text-indigo-700 border border-slate-200 shadow-3xs"
                  title="5% intervals: 0-5, 5-10, 10-15, 15-20, >20%"
                >
                  0–5% Step
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("dense")}
                  className="py-1 px-1 rounded text-[8px] font-black bg-white hover:bg-slate-50 text-indigo-700 border border-slate-200 shadow-3xs"
                  title="Dense low ranges: 0-2, 2-4, 4-6, 6-8, >8%"
                >
                  2–4–6% step
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("standard")}
                  className="py-1 px-1 rounded text-[8px] font-black bg-white hover:bg-slate-50 text-indigo-700 border border-slate-200 shadow-3xs"
                  title="Standard bounds: 0-10, 10-25, 25-50, 50-75, >75%"
                >
                  Standard
                </button>
              </div>
            </div>

            {/* Editable Classes list */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 border-t border-slate-200/50 pt-2">
              <span className="text-[9px] font-bold text-slate-500 block mb-1">Modify Bounds & Palette:</span>
              
              {/* Nil Exceedance Row */}
              <div className="flex items-center gap-1.5 p-1 bg-white rounded-lg border border-slate-200/60 shadow-3xs">
                <input
                  type="text"
                  value={nilLabel}
                  title="Nil Exceedance Label"
                  onChange={(e) => setNilLabel(e.target.value)}
                  className="flex-1 min-w-[70px] text-[9px] px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded font-bold"
                  placeholder="Nil Exceedance"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px] font-bold text-slate-400">0% Only</span>
                </div>
                <input
                  type="color"
                  value={nilColor}
                  onChange={(e) => setNilColor(e.target.value)}
                  className="w-5 h-5 p-0 cursor-pointer border-0 rounded bg-transparent ml-auto shrink-0"
                />
              </div>

              {activeClasses.map((cls, idx) => {
                const prevLimit = idx === 0 ? 0 : activeClasses[idx - 1].limit;
                return (
                  <div key={idx} className="flex items-center gap-1.5 p-1 bg-white rounded-lg border border-slate-200/60 shadow-3xs">
                    {/* Class Label Input */}
                    <input
                      type="text"
                      value={cls.label}
                      title="Class Label"
                      onChange={(e) => {
                        const updated = [...activeClasses];
                        updated[idx] = { ...updated[idx], label: e.target.value };
                        updateClasses(updated);
                      }}
                      className="flex-1 min-w-[70px] text-[9px] px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded font-bold"
                    />

                    {/* Class limit input */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] font-bold text-slate-400">
                        {idx === 0 ? "≤" : ">"}
                      </span>
                      <input
                        type="number"
                        min={prevLimit + 1}
                        max="100"
                        value={cls.limit}
                        onChange={(e) => {
                          const updated = [...activeClasses];
                          updated[idx] = { ...updated[idx], limit: Math.max(prevLimit + 1, Math.min(100, parseInt(e.target.value) || 0)) };
                          updateClasses(updated);
                        }}
                        disabled={idx === activeClasses.length - 1}
                        className="w-8 text-[9px] p-0.5 border border-slate-200 rounded text-center font-bold"
                      />
                      <span className="text-[9px] font-bold text-slate-400">%</span>
                    </div>

                    {/* Color picker */}
                    <input
                      type="color"
                      value={cls.color}
                      onChange={(e) => {
                        const updated = [...activeClasses];
                        updated[idx] = { ...updated[idx], color: e.target.value };
                        updateClasses(updated);
                      }}
                      className="w-5 h-5 p-0 cursor-pointer border-0 rounded bg-transparent ml-auto shrink-0"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* GIS Metadata / Controls */}
        <div className="space-y-2.5 pt-2">
          <div className="text-[9px] text-slate-400 leading-relaxed bg-indigo-50/50 p-2 border border-indigo-100 rounded-xl flex gap-1">
            <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>
              <strong>GIS Tip:</strong> Scroll to Zoom, Drag to Pan. Hover on centers to view statistics in real-time.
            </span>
          </div>

          {sendToBulletin && (
            <button
              onClick={handleSendToBulletin}
              className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold text-xs hover:from-indigo-700 hover:to-indigo-800 transition-all flex items-center justify-center gap-2 shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              Export Map to Report
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={downloadPng}
              className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 border border-slate-200/80 shadow-xs"
            >
              Download PNG
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 border border-slate-200/80 shadow-xs"
            >
              Print Map (A4 Ready)
            </button>
          </div>
        </div>
      </div>



      {/* Map and Side-Table Container Wrapper */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 items-start min-w-0 w-full">

        {/* Main Map Interactive Viewport */}
        <div className={`flex flex-col sm:flex-row gap-4 ${currentLayout.style} relative flex-1 min-w-[320px] min-h-[500px] border border-slate-200 rounded-2xl bg-white shadow-xs overflow-hidden select-none`}>
          <div className="flex-1 relative min-w-0 w-full h-full min-h-[480px] flex items-center justify-center p-2">
            <canvas
              ref={canvasRef}
              width={currentLayout.width * pixelRatio}
              height={currentLayout.height * pixelRatio}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onDoubleClick={(e) => handleCanvasClickEvent(e)}
              onContextMenu={(e) => {
                e.preventDefault();
                handleCanvasClickEvent(e);
              }}
              className={`block bg-transparent pointer-events-auto mx-auto ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
              style={{
                width: "100%",
                height: "100%",
                maxWidth: `${currentLayout.width}px`,
                maxHeight: `${currentLayout.height}px`,
                aspectRatio: `${currentLayout.width} / ${currentLayout.height}`,
                objectFit: "contain"
              }}
            />
          </div>
          {sideBySide && (
            <div className="flex-1 relative min-w-0 w-full h-full min-h-[480px] border-l border-slate-200/50 flex items-center justify-center p-2">
              <canvas
                ref={canvasPostRef}
                width={currentLayout.width * pixelRatio}
                height={currentLayout.height * pixelRatio}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={(e) => handleCanvasClickEvent(e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleCanvasClickEvent(e);
                }}
                className={`block bg-transparent pointer-events-auto mx-auto ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                style={{
                  width: "100%",
                  height: "100%",
                  maxWidth: `${currentLayout.width}px`,
                  maxHeight: `${currentLayout.height}px`,
                  aspectRatio: `${currentLayout.width} / ${currentLayout.height}`,
                  objectFit: "contain"
                }}
              />
            </div>
          )}

          {/* Hover Information Tooltip */}
          {hoveredGroup && (
            <div
              className="absolute z-20 pointer-events-auto bg-white/95 backdrop-blur border border-indigo-100 p-3 rounded-2xl shadow-xl max-w-xs transition-all duration-75 text-xs text-slate-700 font-medium select-none"
              style={{ left: tooltipPos.x, top: tooltipPos.y }}
            >
              <div className="border-b border-slate-100 pb-1.5 mb-2 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-wider block">
                    {reportingLevel} Center
                  </span>
                  <strong className="text-slate-800 text-sm font-extrabold">{nameOverrides[hoveredGroup.name] || hoveredGroup.name}</strong>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingFeature({
                      feature: null,
                      layer: null,
                      originalName: hoveredGroup.name,
                      currentName: nameOverrides[hoveredGroup.name] || hoveredGroup.name,
                    });
                    setNewNameInput(nameOverrides[hoveredGroup.name] || hoveredGroup.name);
                  }}
                  className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-all border border-indigo-200/60 shadow-2xs cursor-pointer shrink-0"
                  title={`Click to Replace Name of ${nameOverrides[hoveredGroup.name] || hoveredGroup.name}`}
                >
                  <Edit2 className="w-3.5 h-3.5 text-indigo-600" />
                </button>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center gap-6">
                  <span className="text-slate-500">{"Exceedance Percentage:"}</span>
                  <span
                    className="font-extrabold px-1.5 py-0.5 rounded text-[11px]"
                    style={{
                      backgroundColor: getColorForExceedance(hoveredGroup.pctExceedance) + "15",
                      color: getColorForExceedance(hoveredGroup.pctExceedance),
                    }}
                  >
                    {hoveredGroup.pctExceedance.toFixed(2) + "%"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Total Samples:</span>
                  <span className="font-bold text-slate-800">{hoveredGroup.totalSamples}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Exceeded Samples:</span>
                  <span className="font-bold text-rose-600">{hoveredGroup.failCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Average Value:</span>
                  <span className="font-extrabold text-slate-800">
                    {hoveredGroup.avgValue.toFixed(2)}{" "}
                    <span className="text-[10px] text-slate-400 font-medium font-mono">
                      {activeConfig?.unit || ""}
                    </span>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingFeature({
                    feature: null,
                    layer: null,
                    originalName: hoveredGroup.name,
                    currentName: nameOverrides[hoveredGroup.name] || hoveredGroup.name,
                  });
                  setNewNameInput(nameOverrides[hoveredGroup.name] || hoveredGroup.name);
                }}
                className="w-full mt-2.5 py-1.5 px-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-extrabold rounded-xl flex items-center justify-center gap-1.5 text-[11px] transition-all shadow-xs cursor-pointer"
              >
                <Move className="w-3 h-3 text-indigo-200" />
                Move / Reposition Label Location on Map
              </button>
            </div>
          )}
        </div>

        {/* Statistical Table Panel Side-by-Side (not absolute, just static/relative side-by-side) */}
        {showTableOverlay && (
          <div className="w-full lg:w-[380px] shrink-0 bg-white border border-slate-200/80 rounded-2xl flex flex-col shadow-xs overflow-hidden max-h-[520px] select-text">
            {/* Header */}
            <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100 bg-slate-50/80 select-none">
              <div className="flex items-center gap-1.5 text-[9.5px] font-black uppercase tracking-wider text-indigo-950">
                <Table className="w-3.5 h-3.5 text-indigo-600" />
                <span>Classification Table</span>
              </div>
              <button
                type="button"
                onClick={() => setShowTableOverlay(false)}
                title="Hide Table"
                className="p-1 hover:bg-slate-100 rounded text-slate-500 transition-colors text-[10px] font-black"
              >
                ✕
              </button>
            </div>

            {/* Table Content (Scrollable) */}
            <div className="p-2 sm:p-4 overflow-y-auto overflow-x-auto custom-scrollbar flex-1 bg-white">
              <table className="w-full text-left border-collapse text-[10px]">
                <thead>
                  <tr className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 border-b border-slate-100 pb-2">
                    <th className="pb-2 px-1 w-10">Sl. No.</th>
                    <th className="pb-2 px-1 w-16">Ranges</th>
                    <th className="pb-2 px-1 w-20">Colour</th>
                    <th className="pb-2 px-1 text-center w-16">No. {reportingLevel === "State" ? "State/UT" : "Districts"}</th>
                    <th className="pb-2 px-1">Name(s) of {reportingLevel === "State" ? "State/UT" : "Districts"}</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {tableData.map((row, i) => (
                    <tr key={row.slNo} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 px-1 font-mono font-medium text-slate-900 text-center">
                        {i + 1}
                      </td>
                      <td className="py-2 px-1 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {row.rangeText}
                      </td>
                      <td className="py-2 px-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="text-[10px] truncate max-w-[110px]" title={row.label}>
                            {row.label}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-1 text-center">
                        <span className="font-semibold text-[10px] text-slate-900">
                          {row.count}
                        </span>
                      </td>
                      <td className="py-2 px-1">
                        {row.items.length > 0 ? (
                          <div className="text-[10px] text-slate-500 font-medium leading-relaxed max-h-[80px] overflow-y-auto pr-1">
                            {row.items.map(i => {
                               let n = nameOverrides[i.name] || i.name;
                               if (useShortNames) n = getShortName(n, reportingLevel, useShortNames);
                               return n;
                            }).join(", ")}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[10px]">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {renamingFeature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newNameInput.trim() && newNameInput.trim() !== renamingFeature.originalName) {
                setNameOverrides((prev) => ({
                  ...prev,
                  [renamingFeature.originalName]: newNameInput.trim(),
                }));
              }
              triggerToast(`Label settings for ${renamingFeature.originalName} saved!`, "success");
              setRenamingFeature(null);
            }}
            className="bg-white/95 backdrop-blur border border-indigo-100 rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4 select-none"
          >
            <div className="space-y-1 border-b border-slate-100 pb-3">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-indigo-500" />
                REPOSITION MAP LABEL LOCATION
              </span>
              <h3 className="text-base font-black text-slate-800 leading-tight">
                Move Label Position on Map
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                You can click and drag any label directly on the map area using your mouse, or use the nudge controls below.
              </p>
            </div>

            <div className="space-y-3">
              {/* Region Selector Dropdown */}
              {groupList.length > 0 && (
                <div className="space-y-1 text-xs">
                  <label className="font-bold text-slate-600 block">Select Region on Map</label>
                  <select
                    value={renamingFeature.originalName}
                    onChange={(e) => {
                      const selName = e.target.value;
                      setRenamingFeature({
                        feature: null,
                        layer: null,
                        originalName: selName,
                        currentName: nameOverrides[selName] || selName,
                      });
                      setNewNameInput(nameOverrides[selName] || selName);
                    }}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none text-slate-800 cursor-pointer"
                  >
                    {groupList.map((g) => (
                      <option key={g.name} value={g.name}>
                        {g.name} {labelOffsets[g.name] ? `(Moved: dx=${labelOffsets[g.name].dx}, dy=${labelOffsets[g.name].dy})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Mouse Drag Banner Tip */}
              <div className="bg-indigo-50/80 border border-indigo-100/80 p-2.5 rounded-xl text-[11px] text-indigo-900 font-semibold flex items-center gap-2">
                <Move className="w-4 h-4 text-indigo-600 shrink-0" />
                <span><strong>Direct Mouse Control:</strong> Simply click and drag the label text on the map area with your mouse!</span>
              </div>

              {/* D-Pad Nudge Buttons */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 block">Directional Nudge Position</label>
                <div className="flex items-center justify-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
                  <div className="grid grid-cols-3 gap-1.5 w-36">
                    <div />
                    <button
                      type="button"
                      onClick={() => {
                        const cur = labelOffsets[renamingFeature.originalName] || { dx: 0, dy: 0 };
                        setLabelOffsets((prev) => ({ ...prev, [renamingFeature.originalName]: { ...cur, dy: cur.dy - 10 } }));
                      }}
                      className="p-2 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                      title="Nudge Up 10px"
                    >
                      <ArrowUp className="w-3.5 h-3.5 text-indigo-600" />
                    </button>
                    <div />

                    <button
                      type="button"
                      onClick={() => {
                        const cur = labelOffsets[renamingFeature.originalName] || { dx: 0, dy: 0 };
                        setLabelOffsets((prev) => ({ ...prev, [renamingFeature.originalName]: { ...cur, dx: cur.dx - 10 } }));
                      }}
                      className="p-2 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                      title="Nudge Left 10px"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-indigo-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLabelOffsets((prev) => {
                          const copy = { ...prev };
                          delete copy[renamingFeature.originalName];
                          return copy;
                        });
                        triggerToast(`Reset label position for ${renamingFeature.originalName}`, "info");
                      }}
                      className="p-2 bg-slate-200 hover:bg-rose-100 border border-slate-300 text-slate-700 hover:text-rose-700 rounded-lg flex items-center justify-center transition-all cursor-pointer text-[9px] font-black uppercase"
                      title="Reset Position"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = labelOffsets[renamingFeature.originalName] || { dx: 0, dy: 0 };
                        setLabelOffsets((prev) => ({ ...prev, [renamingFeature.originalName]: { ...cur, dx: cur.dx + 10 } }));
                      }}
                      className="p-2 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                      title="Nudge Right 10px"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-indigo-600" />
                    </button>

                    <div />
                    <button
                      type="button"
                      onClick={() => {
                        const cur = labelOffsets[renamingFeature.originalName] || { dx: 0, dy: 0 };
                        setLabelOffsets((prev) => ({ ...prev, [renamingFeature.originalName]: { ...cur, dy: cur.dy + 10 } }));
                      }}
                      className="p-2 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                      title="Nudge Down 10px"
                    >
                      <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                    </button>
                    <div />
                  </div>
                </div>
              </div>

              {/* X and Y Sliders */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="font-bold text-slate-600">Horizontal Shift (X)</label>
                    <span className="font-mono text-indigo-600 font-extrabold">
                      {(labelOffsets[renamingFeature.originalName]?.dx || 0)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-200"
                    max="200"
                    value={labelOffsets[renamingFeature.originalName]?.dx || 0}
                    onChange={(e) => {
                      const dx = parseInt(e.target.value) || 0;
                      const cur = labelOffsets[renamingFeature.originalName] || { dx: 0, dy: 0 };
                      setLabelOffsets((prev) => ({ ...prev, [renamingFeature.originalName]: { ...cur, dx } }));
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="font-bold text-slate-600">Vertical Shift (Y)</label>
                    <span className="font-mono text-indigo-600 font-extrabold">
                      {(labelOffsets[renamingFeature.originalName]?.dy || 0)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-200"
                    max="200"
                    value={labelOffsets[renamingFeature.originalName]?.dy || 0}
                    onChange={(e) => {
                      const dy = parseInt(e.target.value) || 0;
                      const cur = labelOffsets[renamingFeature.originalName] || { dx: 0, dy: 0 };
                      setLabelOffsets((prev) => ({ ...prev, [renamingFeature.originalName]: { ...cur, dy } }));
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>

              {/* Optional Text Rename Input */}
              <div className="space-y-1 text-xs pt-1 border-t border-slate-100">
                <label className="font-bold text-slate-500 block">Edit Display Text (Optional)</label>
                <input
                  type="text"
                  value={newNameInput}
                  onChange={(e) => setNewNameInput(e.target.value)}
                  placeholder={renamingFeature.originalName}
                  className="w-full text-xs font-semibold p-2.5 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl focus:outline-none transition-all text-slate-800"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 text-xs font-bold">
              <button
                type="submit"
                className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100 transition-all cursor-pointer"
              >
                Done
              </button>
              {labelOffsets[renamingFeature.originalName] && (
                <button
                  type="button"
                  onClick={() => {
                    setLabelOffsets((prev) => {
                      const updated = { ...prev };
                      delete updated[renamingFeature.originalName];
                      return updated;
                    });
                    triggerToast(`Label position reset for ${renamingFeature.originalName}`, "info");
                  }}
                  className="py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 transition-all cursor-pointer"
                >
                  Reset Location
                </button>
              )}
              <button
                type="button"
                onClick={() => setRenamingFeature(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

            {Object.keys(labelOffsets).length > 0 && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">
                  {Object.keys(labelOffsets).length} label position override(s) active
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLabelOffsets({});
                    triggerToast("All label positions reset to default.", "info");
                  }}
                  className="text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                >
                  Reset All Label Positions
                </button>
              </div>
            )}
          </form>
        </div>
      )}

    </div>
  </div>
);
}
