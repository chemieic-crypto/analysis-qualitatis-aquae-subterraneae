import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import shp from "shpjs";
import {
  Layers,
  Compass,
  Sliders,
  Play,
  CheckCircle,
  TrendingUp,
  Map as MapIcon,
  Globe,
  Info,
  Calendar,
  SlidersHorizontal,
  FolderKanban,
  FileDown,
  Printer,
  ChevronRight,
  Eye,
  EyeOff,
  Maximize2,
  LayoutGrid,
  Layout,
  FileText,
  Image as ImageIcon,
  Upload,
  Trash2,
  ZoomIn,
  ZoomOut,
  Plus,
  Table,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Download,
  Type,
  Palette,
  Sparkles,
  Grid3X3,
  FileJson,
  AlertTriangle,
  Scissors,
  Tag,
  Check
} from "lucide-react";
import * as turf from "@turf/turf";
import { PARAM_CONFIG, hasBisLimit } from "../data/config";
import { INDIA_BOUNDARY } from "../data/india_boundary";
import {
  createPointShapefileZip,
  createShapefileFromGeoJson,
  createGisPackageZip,
  buildMapInfoRasterTab,
  WGS84_PRJ,
  GisPackageLayerInput,
  GisPackageExtraFile,
  downloadBlob
} from "../utils/shapefileWriter";
import { 
  featureMatchesSelection, 
  getFilteredGeoJson, 
  buildDistrictStateMap, 
  isStateAll, 
  isDistrictAll,
  norm,
  toProperCase
} from "../utils/shapefileFilter";

import {
  ShapefileLayer,
  DEFAULT_AQUIFER_COLORS,
  getDpr,
  getInitialColorMapping,
  getFeatureFillColor,
  COLOR_SCHEMES,
  BASEMAP_STYLES,
  lngToTileX,
  latToTileY,
  tileXToLng,
  tileYToLat,
  createGeoTiffBlob,
  darkenColor,
  getDistanceKm,
  getPolygonCentroid,
  getFeatureBbox,
  doBboxesOverlap,
  getAdminFeatureLabel,
  getFeatureAttributeLabel,
  createInterpolationWorker
} from "../utils/gisMapHelpers";
import GisAttributeTable from "./gis/GisAttributeTable";

export type { ShapefileLayer };
export {
  getFeatureBbox,
  doBboxesOverlap,
  getAdminFeatureLabel,
  getFeatureAttributeLabel
};

interface GisMapViewProps {
  rawData: any[];
  headers: any;
  headerMap: Record<string, string>;
  selectedState?: string;
  selectedDistrict?: string;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
  isVisible: boolean;
  bulletinMaps?: Record<string, string>;
  setBulletinMaps?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  layers: ShapefileLayer[];
  setLayers: React.Dispatch<React.SetStateAction<ShapefileLayer[]>>;
  choroplethClasses?: { limit: number; color: string; label: string }[];
  setChoroplethClasses?: React.Dispatch<React.SetStateAction<{ limit: number; color: string; label: string }[]>>;
}

export default function GisMapView({
  rawData,
  headers,
  headerMap,
  selectedState = "",
  selectedDistrict = "",
  showToast,
  isVisible,
  bulletinMaps,
  setBulletinMaps,
  layers,
  setLayers,
  choroplethClasses,
  setChoroplethClasses
}: GisMapViewProps) {
  // Canvas references for dual panels (Comparison mode)
  const canvasRefLeft = useRef<HTMLCanvasElement>(null);
  const canvasRefRight = useRef<HTMLCanvasElement>(null);

  // Active configurations state
  const [activeTab, setActiveTab] = useState<"layers" | "basemap" | "interpolation" | "classification" | "styling" | "decorations" | "batch" | "shapefile">("layers");
  
  // Base settings
  const [selectedParam, setSelectedParam] = useState<string>("EC");
  const [basemap, setBasemap] = useState<string>("ESRI Topographic");
  const [projection, setProjection] = useState<"wgs84" | "mercator" | "utm">("wgs84");
  const [utmZone, setUtmZone] = useState<number>(44);

  // Shapefile Layers State
  const [clipTarget, setClipTarget] = useState<string>("india"); // "none" | "india" | "layer-id"

  // Shapefile/GeoJSON State (for backwards compatibility)
  const [uploadedGeoJson, setUploadedGeoJson] = useState<any>(null);
  const [shapefileName, setShapefileName] = useState<string>("");
  const [shapeStrokeColor, setShapeStrokeColor] = useState<string>("#2563eb");
  const [shapeStrokeWidth, setShapeStrokeWidth] = useState<number>(2.0);
  const [shapeFillColor, setShapeFillColor] = useState<string>("#60a5fa");
  const [shapeFillOpacity, setShapeFillOpacity] = useState<number>(15);
  const [showShapefile, setShowShapefile] = useState<boolean>(true);
  const [showShapefileInLegend, setShowShapefileInLegend] = useState<boolean>(true);
  const [shapefileLegendColumns, setShapefileLegendColumns] = useState<number>(1);
  const [shapefileLegendFontStyle, setShapefileLegendFontStyle] = useState<string>("normal");
  const [shapefileLegendSpacing, setShapefileLegendSpacing] = useState<number>(15);
  const [legendColumns, setLegendColumns] = useState<number>(1);
  const [shapefileLegendFontSize, setShapefileLegendFontSize] = useState<number>(7.5);
  const [shapefileLegendTextColor, setShapefileLegendTextColor] = useState<string>("#475569");
  const [showGlobalShapefileOutline, setShowGlobalShapefileOutline] = useState<boolean>(true);
  const [fitToShapefile, setFitToShapefile] = useState<boolean>(false);
  const [panelBackgroundStyle, setPanelBackgroundStyle] = useState<"translucent-light" | "translucent-dark" | "transparent-glass" | "solid-light" | "solid-dark">("translucent-light");

  // Shapefile Labels State
  const [showShapefileLabels, setShowShapefileLabels] = useState<boolean>(true);
  const [shapefileLabelKey, setShapefileLabelKey] = useState<string>("");
  const [shapefileLabelColor, setShapefileLabelColor] = useState<string>("#1e293b");
  const [shapefileLabelSize, setShapefileLabelSize] = useState<number>(11);

  // Area Shapefile Auto-Clipping & Admin Extraction States
  const [aoiLayerId, setAoiLayerId] = useState<string>("");
  const [autoCutAdminToAoi, setAutoCutAdminToAoi] = useState<boolean>(true);
  const [adminCutMode, setAdminCutMode] = useState<"intersect" | "exact">("intersect");
  const [showAdminNamesOnMap, setShowAdminNamesOnMap] = useState<boolean>(true);
  const [showNeighbourLabels, setShowNeighbourLabels] = useState<boolean>(false);
  const [adminLabelAttribute, setAdminLabelAttribute] = useState<string>("auto");
  const [adminLabelFontFamily, setAdminLabelFontFamily] = useState<string>("Times New Roman"); // Requirement 1 & 3: Default Times New Roman
  const [adminLabelItalic, setAdminLabelItalic] = useState<boolean>(false);
  const [adminLabelColor, setAdminLabelColor] = useState<string>("#0f172a");
  const [adminLabelSize, setAdminLabelSize] = useState<number>(11);
  const [adminLabelShowHalo, setAdminLabelShowHalo] = useState<boolean>(false); // Default false: "dont show whaite background beind name simple name it should be"
  const [adminLabelWeight, setAdminLabelWeight] = useState<"bold" | "normal">("bold");
  const [interpolationTrigger, setInterpolationTrigger] = useState<number>(0);
  const [isClippingAdmin, setIsClippingAdmin] = useState<boolean>(false);
  
  // Ultra-fast memoized spatial clipping: pre-filters 98%+ of features using BBox before running exact Turf intersection
  const clippedFeaturesMap = useMemo<Record<string, any[]>>(() => {
    if (!autoCutAdminToAoi || !aoiLayerId) return {};
    const aoiLayer = layers.find(l => l.id === aoiLayerId);
    if (!aoiLayer || !aoiLayer.geoJson) return {};

    const aoiFeatures = aoiLayer.geoJson.features || (aoiLayer.geoJson.type === "Feature" ? [aoiLayer.geoJson] : []);
    if (aoiFeatures.length === 0) return {};

    let aoiMinX = Infinity, aoiMinY = Infinity, aoiMaxX = -Infinity, aoiMaxY = -Infinity;
    aoiFeatures.forEach((af: any) => {
      const b = getFeatureBbox(af);
      if (b) {
        if (b[0] < aoiMinX) aoiMinX = b[0];
        if (b[1] < aoiMinY) aoiMinY = b[1];
        if (b[2] > aoiMaxX) aoiMaxX = b[2];
        if (b[3] > aoiMaxY) aoiMaxY = b[3];
      }
    });
    if (aoiMinX === Infinity) return {};
    const aoiBbox: [number, number, number, number] = [aoiMinX, aoiMinY, aoiMaxX, aoiMaxY];

    let aoiPoly: any = null;
    try {
      aoiPoly = aoiFeatures.length === 1 ? aoiFeatures[0] : turf.combine(turf.featureCollection(aoiFeatures)).features[0];
    } catch {
      aoiPoly = aoiFeatures[0];
    }
    if (!aoiPoly) return {};

    const result: Record<string, any[]> = {};

    layers.forEach(layer => {
      if (layer.id === aoiLayerId || !layer.geoJson) return;
      const allFeatures = layer.geoJson.features || (layer.geoJson.type === "Feature" ? [layer.geoJson] : []);
      const keptFeatures: any[] = [];

      for (let i = 0; i < allFeatures.length; i++) {
        const f = allFeatures[i];
        if (!f || !f.geometry) continue;

        // 1. Instant Bounding Box Rejection (skips 95-99% of nationwide units in <0.001ms)
        const fBbox = getFeatureBbox(f);
        if (fBbox && !doBboxesOverlap(fBbox, aoiBbox)) {
          continue;
        }

        // 2. Exact spatial intersection check only for prospective candidates
        let intersects = false;
        try {
          intersects = turf.booleanIntersects(f, aoiPoly);
        } catch {
          const c = getPolygonCentroid(f.geometry?.coordinates);
          if (c) {
            intersects = turf.booleanPointInPolygon([c.lng, c.lat], aoiPoly);
          }
        }

        if (!intersects) continue;

        // 3. Exact cookie-cutter slicing if requested
        if (adminCutMode === "exact") {
          try {
            const clipped = turf.intersect(turf.featureCollection([f, aoiPoly]));
            if (clipped && clipped.geometry) {
              keptFeatures.push({ ...f, geometry: clipped.geometry });
              continue;
            }
          } catch {}
        }

        keptFeatures.push(f);
      }

      result[layer.id] = keptFeatures;
    });

    return result;
  }, [aoiLayerId, autoCutAdminToAoi, adminCutMode, layers]);

  // Multi-layer custom label positions: Record<layerId, Record<featureIndex, position>>
  const [customLabelPositions, setCustomLabelPositions] = useState<Record<string, Record<number, { lng: number; lat: number }>>>({});
  const [draggedLabel, setDraggedLabel] = useState<{ layerId: string; featureIndex: number } | null>(null);
  const [draggedElement, setDraggedElement] = useState<"scaleBar" | "title" | "legend" | "stats" | "northArrow" | null>(null);
  const [draggedPanelId, setDraggedPanelId] = useState<"left" | "right" | null>(null);

  const draggedLabelIndex = draggedLabel ? draggedLabel.featureIndex : null;

  // Attribute table states
  const [selectedAttributeLayerId, setSelectedAttributeLayerId] = useState<string>("");
  const [attributeSearchQuery, setAttributeSearchQuery] = useState<string>("");
  const [attributePage, setAttributePage] = useState<number>(1);
  const [attributeSortKey, setAttributeSortKey] = useState<string>("");
  const [attributeSortDesc, setAttributeSortDesc] = useState<boolean>(false);

  const [redrawTilesTrigger, setRedrawTilesTrigger] = useState<number>(0);
  const tileCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const loadingTiles = useRef<Set<string>>(new Set());

  // Offscreen canvas and key cache for super-fast interpolation rendering
  const rasterCacheLeftRef = useRef<HTMLCanvasElement | null>(null);
  const rasterCacheRightRef = useRef<HTMLCanvasElement | null>(null);
  const rasterCacheKeyLeftRef = useRef<string>("");
  const rasterCacheKeyRightRef = useRef<string>("");

  // District to State mapping built from loaded raw dataset
  const districtStateMap = useMemo(() => {
    return buildDistrictStateMap(rawData, headerMap, headers);
  }, [rawData, headerMap, headers]);

  // Automatic India or custom layer boundary clipping filtered by selected State and District
  const [clipToIndia, setClipToIndia] = useState<boolean>(true);

  const effectiveClipGeoJson = useMemo(() => {
    let baseGeoJson = null;
    if (clipTarget === "india") {
      baseGeoJson = INDIA_BOUNDARY;
    } else if (clipTarget !== "none") {
      const selectedLayer = layers.find(l => l.id === clipTarget);
      if (selectedLayer) {
        baseGeoJson = selectedLayer.geoJson;
      }
    }

    if (!baseGeoJson) return null;

    if (!isStateAll(selectedState) || !isDistrictAll(selectedDistrict)) {
      return getFilteredGeoJson(baseGeoJson, selectedState, selectedDistrict, districtStateMap);
    }

    return baseGeoJson;
  }, [layers, clipTarget, selectedState, selectedDistrict, districtStateMap]);

  const shapefilePropertyKeys = useMemo(() => {
    if (!effectiveClipGeoJson) return [];
    const keys = new Set<string>();
    const features = effectiveClipGeoJson.features || 
                     (effectiveClipGeoJson.type === "Feature" ? [effectiveClipGeoJson] : []);
    features.forEach((f: any) => {
      if (f && f.properties) {
        Object.keys(f.properties).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys);
  }, [effectiveClipGeoJson]);

  useEffect(() => {
    if (shapefilePropertyKeys.length > 0 && !shapefileLabelKey) {
      const goodKey = shapefilePropertyKeys.find(k => {
        const l = k.toLowerCase();
        return l.includes("name") || l.includes("state") || l.includes("dist") || l.includes("st_nm") || l.includes("dt_nm");
      }) || shapefilePropertyKeys[0];
      if (goodKey) {
        setShapefileLabelKey(goodKey);
      }
    }
  }, [shapefilePropertyKeys, shapefileLabelKey]);

  // Shapefile Bounds Extractor
  const shapefileBounds = useMemo(() => {
    if (!effectiveClipGeoJson) return null;
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    const traverse = (coords: any) => {
      if (Array.isArray(coords) && typeof coords[0] === "number") {
        const [lng, lat] = coords;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      } else if (Array.isArray(coords)) {
        coords.forEach(traverse);
      }
    };

    if (effectiveClipGeoJson.features) {
      effectiveClipGeoJson.features.forEach((f: any) => {
        if (f.geometry && f.geometry.coordinates) {
          traverse(f.geometry.coordinates);
        }
      });
    } else if (effectiveClipGeoJson.geometry && effectiveClipGeoJson.geometry.coordinates) {
      traverse(effectiveClipGeoJson.geometry.coordinates);
    } else if (effectiveClipGeoJson.coordinates) {
      traverse(effectiveClipGeoJson.coordinates);
    }

    if (minLng === Infinity || minLat === Infinity) return null;
    return { minLng, maxLng, minLat, maxLat };
  }, [effectiveClipGeoJson]);

  // Get Layer Bounds
  const getLayerBounds = useCallback((layer: ShapefileLayer) => {
    const geoJson = layer.geoJson;
    if (!geoJson) return null;
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    const traverse = (coords: any) => {
      if (Array.isArray(coords) && typeof coords[0] === "number") {
        const [lng, lat] = coords;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      } else if (Array.isArray(coords)) {
        coords.forEach(traverse);
      }
    };

    if (geoJson.features) {
      geoJson.features.forEach((f: any) => {
        if (f.geometry && f.geometry.coordinates) {
          traverse(f.geometry.coordinates);
        }
      });
    } else if (geoJson.geometry && geoJson.geometry.coordinates) {
      traverse(geoJson.geometry.coordinates);
    } else if (geoJson.coordinates) {
      traverse(geoJson.coordinates);
    }

    if (minLng === Infinity || minLat === Infinity) return null;
    return { minLng, maxLng, minLat, maxLat };
  }, []);

  // Centroid/feature zooming helper
  // Relocated below isComparisonActive definition

  // Interpolation parameters
  const [interpolationMethod, setInterpolationMethod] = useState<"idw" | "nearest" | "kriging" | "rbf" | "natural" | "spline" | "ordinary_kriging" | "universal_kriging" | "ebk">("idw");
  const [idwPower, setIdwPower] = useState<number>(2.0);
  const [gridSmoothingRes, setGridSmoothingRes] = useState<number>(150); // resolution columns of grid
  const [searchRadius, setSearchRadius] = useState<number>(150); // in kilometers
  const [clippingRadius, setClippingRadius] = useState<number>(100); // clipping threshold to points in kilometers
  const [smoothBlending, setSmoothBlending] = useState<boolean>(true); // Continuous color interpolation

  // Web Worker Interpolation Grids & Loading States
  const [leftInterpolatedGrid, setLeftInterpolatedGrid] = useState<any>(null);
  const [rightInterpolatedGrid, setRightInterpolatedGrid] = useState<any>(null);
  const [isLeftLoading, setIsLeftLoading] = useState<boolean>(false);
  const [isRightLoading, setIsRightLoading] = useState<boolean>(false);

  // Advanced Interpolation and Rendering options
  const [enableGaussianSmoothing, setEnableGaussianSmoothing] = useState<boolean>(true);
  const [enableAnisotropy, setEnableAnisotropy] = useState<boolean>(false);
  const [anisotropyAngle, setAnisotropyAngle] = useState<number>(45);
  const [anisotropyRatio, setAnisotropyRatio] = useState<number>(1.5);

  // Classification & Symbology
  const [classificationMode, setClassificationMode] = useState<"bis" | "equal" | "quantile" | "stddev" | "geometric" | "manual">("bis");
  const [manualBreaksInput, setManualBreaksInput] = useState<string>("");
  const [colorScheme, setColorScheme] = useState<string>("Blue-Yellow-Red");
  const [symbolType, setSymbolType] = useState<"circle" | "square" | "triangle" | "diamond" | "star">("circle");
  const [symbolSize, setSymbolSize] = useState<number>(7);
  const [symbolBorderColor, setSymbolBorderColor] = useState<string>("#ffffff");
  const [symbolBorderSize, setSymbolBorderSize] = useState<number>(1.2);
  const [symbolOpacity, setSymbolOpacity] = useState<number>(85);

  // Layer toggles & transparency
  const [showRaster, setShowRaster] = useState<boolean>(true);
  const [showPoints, setShowPoints] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showDifferenceMap, setShowDifferenceMap] = useState<boolean>(false);

  const [rasterOpacity, setRasterOpacity] = useState<number>(75);
  const [basemapOpacity, setBasemapOpacity] = useState<number>(90);

  // Custom zoom & pan factors
  const [zoomScaleFactor, setZoomScaleFactor] = useState<number>(1.0);
  const [panOffsetLat, setPanOffsetLat] = useState<number>(0);
  const [panOffsetLng, setPanOffsetLng] = useState<number>(0);

  // Drag-to-pan map canvas state
  const isDraggingRef = useRef<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ 
    x: number; 
    y: number; 
    startPanLat: number; 
    startPanLng: number;
    startOffsetX: number;
    startOffsetY: number;
  }>({ 
    x: 0, 
    y: 0, 
    startPanLat: 0, 
    startPanLng: 0,
    startOffsetX: 0,
    startOffsetY: 0
  });

  const getParamDisplayName = (paramKey: string) => {
    const config = PARAM_CONFIG[paramKey];
    if (!config) return paramKey;
    const subscripts: Record<string, string> = {
      "NO3": "NO₃",
      "CO3": "CO₃",
      "HCO3": "HCO₃",
      "SO4": "SO₄",
      "CaCO3": "CaCO₃"
    };
    const formattedKey = subscripts[paramKey] || paramKey;
    if (config.name === paramKey) {
      return paramKey;
    }
    return `${config.name} (${formattedKey})`;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const isLeft = e.currentTarget === canvasRefLeft.current;
    const panelId: "left" | "right" = isLeft ? "left" : "right";

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Scale up to matches dpr-scaled coordinates used in drawing
    const dpr = getDpr();
    const currentWidth = canvasWidth * dpr;
    const currentHeight = canvasHeight * dpr;

    // Map to dpr scale
    const clickX = mouseX * (currentWidth / rect.width);
    const clickY = mouseY * (currentHeight / rect.height);

    const margin = 55 * dpr;
    const mw = currentWidth - 2 * margin;
    const mh = currentHeight - 2 * margin;

    // 1. Check if clicking on the Scale Bar decoration
    if (showScaleBar) {
      const { mapMinLng, finalLngSpan, centerLat } = mapExtent;
      const widthKm = finalLngSpan * 111 * Math.cos(centerLat * Math.PI / 180);
      const pxPerKm = mw / widthKm;
      const roundDivisions = [1, 2, 5, 10, 25, 50, 100, 200, 500];
      const targetKmRaw = (120 * dpr) / pxPerKm;
      const targetKm = roundDivisions.reduce((prev, curr) => 
        Math.abs(curr - targetKmRaw) < Math.abs(prev - targetKmRaw) ? curr : prev
      );
      const scaleW = targetKm * pxPerKm;
      const scaleX = margin + 15 * dpr + scaleBarOffsetX * dpr;
      const scaleY = currentHeight - margin - 20 * dpr + scaleBarOffsetY * dpr;

      const scaleBoxX = scaleX - 5 * dpr;
      const scaleBoxY = scaleY - 18 * dpr;
      const scaleBoxW = scaleW + 25 * dpr;
      const scaleBoxH = 30 * dpr;

      if (clickX >= scaleBoxX && clickX <= scaleBoxX + scaleBoxW && clickY >= scaleBoxY && clickY <= scaleBoxY + scaleBoxH) {
        setDraggedElement("scaleBar");
        setDraggedPanelId(panelId);
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          startPanLat: panOffsetLat,
          startPanLng: panOffsetLng,
          startOffsetX: scaleBarOffsetX,
          startOffsetY: scaleBarOffsetY
        };
        return;
      }
    }

    // 2. Check click on North Arrow
    let arrowX = currentWidth - margin - 35 * dpr;
    let arrowY = margin + 45 * dpr;
    if (northArrowPos === "top-left") { arrowX = margin + 35 * dpr; arrowY = margin + 45 * dpr; }
    else if (northArrowPos === "bottom-left") { arrowX = margin + 35 * dpr; arrowY = currentHeight - margin - 55 * dpr; }
    else if (northArrowPos === "bottom-right") { arrowX = currentWidth - margin - 35 * dpr; arrowY = currentHeight - margin - 55 * dpr; }

    arrowX += northArrowOffsetX * dpr;
    arrowY += northArrowOffsetY * dpr;
    const arrowRad = (northArrowSize / 2) * dpr;
    if (Math.hypot(clickX - arrowX, clickY - arrowY) <= arrowRad) {
      setDraggedElement("northArrow");
      setDraggedPanelId(panelId);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startPanLat: panOffsetLat,
        startPanLng: panOffsetLng,
        startOffsetX: northArrowOffsetX,
        startOffsetY: northArrowOffsetY
      };
      return;
    }

    // 3. Check click on Title Frame
    if (titlePos !== "none") {
      const titleStr = panelId === "left"
        ? (customTitle || getMapDefaultTitleAndSubtitle("left").title)
        : (customTitle 
            ? `${customTitle} (Post-Monsoon)` 
            : (showDifferenceMap 
              ? `Seasonal Quality Difference Map (Post − Pre)`
              : getMapDefaultTitleAndSubtitle("right").title));
      
      const subtitleStr = panelId === "left"
        ? (customSubtitle || getMapDefaultTitleAndSubtitle("left").subtitle)
        : (customSubtitle || (showDifferenceMap
            ? `Chemical concentration change dynamics`
            : getMapDefaultTitleAndSubtitle("right").subtitle));

      const displaySubtitle = useSubtitleAsTitle ? "" : subtitleStr;

      const paddingY = 8;
      const titleHeight = mapTitleSize;
      const subtitleHeight = displaySubtitle ? mapSubtitleSize : 0;
      const spacing = displaySubtitle ? titleLineSpacing : 0;
      const tH = (paddingY * 2 + titleHeight + spacing + subtitleHeight) * dpr;

      let tW = mw - 20 * dpr;
      let tX = margin + 10 * dpr;
      let tY = margin + 10 * dpr;

      if (titlePos === "top-center") {
        tX = margin + 10 * dpr;
        tY = margin + 10 * dpr;
        tW = mw - 20 * dpr;
      } else if (titlePos === "top-left") {
        tX = margin + 10 * dpr;
        tY = margin + 10 * dpr;
        tW = mw * 0.6;
      } else if (titlePos === "top-right") {
        tX = currentWidth - margin - mw * 0.6 - 10 * dpr;
        tY = margin + 10 * dpr;
        tW = mw * 0.6;
      } else if (titlePos === "bottom-center") {
        tX = margin + 10 * dpr;
        tY = currentHeight - margin - tH - 10 * dpr;
        tW = mw - 20 * dpr;
      } else if (titlePos === "bottom-left") {
        tX = margin + 10 * dpr;
        tY = currentHeight - margin - tH - 10 * dpr;
        tW = mw * 0.6;
      } else if (titlePos === "bottom-right") {
        tX = currentWidth - margin - mw * 0.6 - 10 * dpr;
        tY = currentHeight - margin - tH - 10 * dpr;
        tW = mw * 0.6;
      }

      tX += titleOffsetX * dpr;
      tY += titleOffsetY * dpr;

      if (clickX >= tX && clickX <= tX + tW && clickY >= tY && clickY <= tY + tH) {
        setDraggedElement("title");
        setDraggedPanelId(panelId);
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          startPanLat: panOffsetLat,
          startPanLng: panOffsetLng,
          startOffsetX: titleOffsetX,
          startOffsetY: titleOffsetY
        };
        return;
      }
    }

    // 4. Check click on Legend
    let legendWidthVal = 155;
    const visibleLayersForLeg = layers.filter(l => l.visible);
    let shapefileItemCount = 0;
    if (showShapefile && showShapefileInLegend) {
      if (visibleLayersForLeg.length > 0) {
        visibleLayersForLeg.forEach(layer => {
          if (layer.showInLegend === false) return;
          if (layer.colorAttribute && layer.colorMapping && Object.keys(layer.colorMapping).length > 0) {
            shapefileItemCount += Object.keys(layer.colorMapping).length;
          } else {
            shapefileItemCount += 1;
          }
        });
      } else if (uploadedGeoJson) {
        shapefileItemCount += 1;
      }
    }
    const numShapefileRows = Math.ceil(shapefileItemCount / shapefileLegendColumns);
    const extraBoundaryHeight = numShapefileRows * shapefileLegendSpacing;
    if (showShapefile && showShapefileInLegend && shapefileLegendColumns > 1 && legendWidthVal < 240) {
      legendWidthVal = 240;
    }
    const legendHeight = (95 + extraBoundaryHeight) * dpr;
    const legendWidth = legendWidthVal * dpr;

    let legX = currentWidth - margin - (legendWidthVal + 15) * dpr;
    let legY = currentHeight - margin - 110 * dpr;
    if (legendPos === "top-left") { legX = margin + 15 * dpr; legY = margin + 15 * dpr; }
    else if (legendPos === "top-right") { legX = currentWidth - margin - (legendWidthVal + 15) * dpr; legY = margin + 15 * dpr; }
    else if (legendPos === "bottom-left") { legX = margin + 15 * dpr; legY = currentHeight - margin - 110 * dpr; }

    legX += legendOffsetX * dpr;
    legY += legendOffsetY * dpr;

    if (clickX >= legX && clickX <= legX + legendWidth && clickY >= legY && clickY <= legY + legendHeight) {
      setDraggedElement("legend");
      setDraggedPanelId(panelId);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startPanLat: panOffsetLat,
        startPanLng: panOffsetLng,
        startOffsetX: legendOffsetX,
        startOffsetY: legendOffsetY
      };
      return;
    }

    // 5. Check click on Stats Panel
    if (showStatsPanel) {
      let stX = margin + 15 * dpr;
      let stY = currentHeight - margin - 135 * dpr;
      if (statsPanelPos === "top-left") { stX = margin + 15 * dpr; stY = margin + 15 * dpr; }
      else if (statsPanelPos === "top-right") { stX = currentWidth - margin - 150 * dpr; stY = margin + 15 * dpr; }
      else if (statsPanelPos === "bottom-right") { stX = currentWidth - margin - 150 * dpr; stY = currentHeight - margin - 135 * dpr; }

      stX += statsOffsetX * dpr;
      stY += statsOffsetY * dpr;
      const statsW = 135 * dpr;
      const statsH = 120 * dpr;

      if (clickX >= stX && clickX <= stX + statsW && clickY >= stY && clickY <= stY + statsH) {
        setDraggedElement("stats");
        setDraggedPanelId(panelId);
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          startPanLat: panOffsetLat,
          startPanLng: panOffsetLng,
          startOffsetX: statsOffsetX,
          startOffsetY: statsOffsetY
        };
        return;
      }
    }

    // 6. Check if clicking close to a shapefile label in any visible layer
    if (showShapefileLabels) {
      const { mapMinLng, finalLngSpan, mapMinLat, finalLatSpan } = mapExtent;
      const getLabelX = (lng: number) => {
        const pct = (lng - mapMinLng) / finalLngSpan;
        return margin + pct * mw;
      };
      const getLabelY = (lat: number) => {
        const pct = (lat - mapMinLat) / finalLatSpan;
        return currentHeight - margin - pct * mh;
      };

      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (!layer.visible || !layer.showLabels) continue;

        const gj = layer.geoJson;
        if (!gj) continue;

        const features = gj.features || (gj.type === "Feature" ? [gj] : []);

        let foundIndex: number | null = null;
        let minDist = 25 * dpr;

        features.forEach((f: any, idx: number) => {
          if (!f || !f.properties) return;
          const textVal = String(f.properties[layer.labelKey] || "");
          if (!textVal) return;

          let lng = 0, lat = 0;
          const customPos = customLabelPositions[layer.id]?.[idx];
          if (customPos) {
            lng = customPos.lng;
            lat = customPos.lat;
          } else {
            const centroid = getPolygonCentroid(f.geometry?.coordinates);
            if (centroid) {
              lng = centroid.lng;
              lat = centroid.lat;
            } else {
              return;
            }
          }

          const lx = getLabelX(lng);
          const ly = getLabelY(lat);

          const dist = Math.hypot(clickX - lx, clickY - ly);
          if (dist < minDist) {
            minDist = dist;
            foundIndex = idx;
          }
        });

        if (foundIndex !== null) {
          setDraggedLabel({ layerId: layer.id, featureIndex: foundIndex });
          setDraggedPanelId(panelId);
          return;
        }
      }
    }

    // If nothing else was dragged, pan the map
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPanLat: panOffsetLat,
      startPanLng: panOffsetLng,
      startOffsetX: 0,
      startOffsetY: 0
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const isLeft = e.currentTarget === canvasRefLeft.current;
    const panelId: "left" | "right" = isLeft ? "left" : "right";

    // 1. Handle element dragging (Scale Bar, North Arrow, Title, Legend, Stats)
    if (draggedElement !== null && draggedPanelId === panelId) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      const newOffsetX = dragStartRef.current.startOffsetX + dx;
      const newOffsetY = dragStartRef.current.startOffsetY + dy;

      if (draggedElement === "scaleBar") {
        setScaleBarOffsetX(newOffsetX);
        setScaleBarOffsetY(newOffsetY);
      } else if (draggedElement === "northArrow") {
        setNorthArrowOffsetX(newOffsetX);
        setNorthArrowOffsetY(newOffsetY);
      } else if (draggedElement === "title") {
        setTitleOffsetX(newOffsetX);
        setTitleOffsetY(newOffsetY);
      } else if (draggedElement === "legend") {
        setLegendOffsetX(newOffsetX);
        setLegendOffsetY(newOffsetY);
      } else if (draggedElement === "stats") {
        setStatsOffsetX(newOffsetX);
        setStatsOffsetY(newOffsetY);
      }
      return;
    }

    // 2. Handle shapefile label dragging
    if (draggedLabel !== null && draggedPanelId === panelId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const dpr = getDpr();
      const currentWidth = canvasWidth * dpr;
      const currentHeight = canvasHeight * dpr;

      const clickX = mouseX * (currentWidth / rect.width);
      const clickY = mouseY * (currentHeight / rect.height);

      const margin = 55 * dpr;
      const mw = currentWidth - 2 * margin;
      const mh = currentHeight - 2 * margin;

      const { mapMinLng, finalLngSpan, mapMinLat, finalLatSpan } = mapExtent;
      const pctX = (clickX - margin) / mw;
      const targetLng = mapMinLng + pctX * finalLngSpan;

      const pctY = (currentHeight - margin - clickY) / mh;
      const targetLat = mapMinLat + pctY * finalLatSpan;

      setCustomLabelPositions(prev => {
        const layerPositions = prev[draggedLabel.layerId] || {};
        return {
          ...prev,
          [draggedLabel.layerId]: {
            ...layerPositions,
            [draggedLabel.featureIndex]: { lng: targetLng, lat: targetLat }
          }
        };
      });
      return;
    }

    // 3. Handle map panning
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    const { finalLngSpan, finalLatSpan } = mapExtent;
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width || 640;
    const height = rect.height || 480;

    const deltaLng = (dx / width) * finalLngSpan;
    const deltaLat = -(dy / height) * finalLatSpan;

    setPanOffsetLng(dragStartRef.current.startPanLng - deltaLng);
    setPanOffsetLat(dragStartRef.current.startPanLat - deltaLat);
  };

  const handleCanvasMouseUpOrLeave = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    setDraggedLabel(null);
    setDraggedElement(null);
    setDraggedPanelId(null);
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Zoom in on double click
    setZoomScaleFactor(z => Math.max(0.005, z * 0.7));
  };

  // Custom Title & Subtitle customizable strings
  const [customTitle, setCustomTitle] = useState<string>("");
  const [customSubtitle, setCustomSubtitle] = useState<string>("");
  const [useSubtitleAsTitle, setUseSubtitleAsTitle] = useState<boolean>(false);

  // Custom station map point color
  const [stationPointColor, setStationPointColor] = useState<string>("#00008b");

  // Custom colors for different ranges
  const [colorRange1, setColorRange1] = useState<string>("#005ce6"); // Acceptable (<= b1) - Default Blue (0, 92, 230)
  const [colorRange2, setColorRange2] = useState<string>("#ffff00"); // Permissible (> b1 and <= b2) - Default Yellow (255, 255, 0)
  const [colorRange3, setColorRange3] = useState<string>("#ff0000"); // Beyond permissible (> b2) - Default Red (255, 0, 0)

  // Point Map Range separate colors
  const [useCustomPointColors, setUseCustomPointColors] = useState<boolean>(true);
  const [pointColorRange1, setPointColorRange1] = useState<string>("#22c55e"); // Acceptable (<= b1) - Default Green
  const [pointColorRange2, setPointColorRange2] = useState<string>("#eab308"); // Permissible (> b1 and <= b2) - Default Yellow/Amber
  const [pointColorRange3, setPointColorRange3] = useState<string>("#ef4444"); // Beyond permissible (> b2) - Default Red

  // Interpolation class count
  const [interpolationClasses, setInterpolationClasses] = useState<number>(3); // Default 3 (Acceptable, Permissible, Exceeded)

  // 3D Effects for Title, Subtitle, Legend
  const [mapTitle3dEffect, setMapTitle3dEffect] = useState<"none" | "emboss" | "deboss">("none");
  const [mapSubtitle3dEffect, setMapSubtitle3dEffect] = useState<"none" | "emboss" | "deboss">("none");
  const [legend3dEffect, setLegend3dEffect] = useState<"none" | "emboss" | "deboss">("none");

  // Custom colors for difference map
  const [colorDiffImproved, setColorDiffImproved] = useState<string>("#22c55e"); // Improved (< -threshold)
  const [colorDiffStable, setColorDiffStable] = useState<string>("#94a3b8"); // Stable
  const [colorDiffDeteriorated, setColorDiffDeteriorated] = useState<string>("#ef4444"); // Deteriorated (> threshold)

  // Positionable title frame
  const [titlePos, setTitlePos] = useState<"top-center" | "top-left" | "top-right" | "bottom-center" | "bottom-left" | "bottom-right" | "none">("top-center");

  // Only Transparent Legend/Title/Stats toggle (defaults to true as requested)
  const [onlyTransparentPanels, setOnlyTransparentPanels] = useState<boolean>(true);

  // Map Border customization
  const [mapBorderType, setMapBorderType] = useState<"single" | "double">("double");
  const [mapBorderColor, setMapBorderColor] = useState<string>("#1e293b");

  // Shapefile legend font family
  const [shapefileLegendFontFamily, setShapefileLegendFontFamily] = useState<string>("Times New Roman");

  // Facility to extend interpolation to full shapefile boundary when points are missing
  const [extendInterpolationToBoundary, setExtendInterpolationToBoundary] = useState<boolean>(false);

  // Custom typography for cartography
  const [mapFontFamily, setMapFontFamily] = useState<string>("Times New Roman");
  const [mapTitleSize, setMapTitleSize] = useState<number>(16);
  const [mapTitleColor, setMapTitleColor] = useState<string>("#1e293b");
  const [mapSubtitleColor, setMapSubtitleColor] = useState<string>("#475569");
  const [legendTextColor, setLegendTextColor] = useState<string>("#475569");
  const [mapTitleBold, setMapTitleBold] = useState<boolean>(true);

  // Legend Sizing Customizations
  const [legendWidth, setLegendWidth] = useState<number>(155);
  const [legendRowSpacing, setLegendRowSpacing] = useState<number>(16);
  const [legendBoxWidth, setLegendBoxWidth] = useState<number>(12);
  const [legendBoxHeight, setLegendBoxHeight] = useState<number>(8);
  const [legendFontSize, setLegendFontSize] = useState<number>(7.5);
  const [legendTitleSize, setLegendTitleSize] = useState<number>(8.5);
  const [legendSubtitleSize, setLegendSubtitleSize] = useState<number>(7.5);

  // Fine-tuning position offsets for map elements (Title, Legend, Stats, North Arrow)
  const [titleOffsetX, setTitleOffsetX] = useState<number>(0);
  const [titleOffsetY, setTitleOffsetY] = useState<number>(0);
  const [legendOffsetX, setLegendOffsetX] = useState<number>(0);
  const [legendOffsetY, setLegendOffsetY] = useState<number>(0);
  const [statsOffsetX, setStatsOffsetX] = useState<number>(0);
  const [statsOffsetY, setStatsOffsetY] = useState<number>(0);
  const [northArrowOffsetX, setNorthArrowOffsetX] = useState<number>(0);
  const [northArrowOffsetY, setNorthArrowOffsetY] = useState<number>(0);
  const [scaleBarOffsetX, setScaleBarOffsetX] = useState<number>(0);
  const [scaleBarOffsetY, setScaleBarOffsetY] = useState<number>(0);
  const [mapSubtitleSize, setMapSubtitleSize] = useState<number>(11);
  const [titleLineSpacing, setTitleLineSpacing] = useState<number>(14);

  // Map Elements Customization
  const [northArrowType, setNorthArrowType] = useState<"classic" | "modern" | "simple">("classic");
  const [northArrowSize, setNorthArrowSize] = useState<number>(45);
  const [northArrowPos, setNorthArrowPos] = useState<"top-left" | "top-right" | "bottom-left" | "bottom-right">("top-right");
  
  const [showScaleBar, setShowScaleBar] = useState<boolean>(true);
  const [scaleBarUnit, setScaleBarUnit] = useState<"km" | "mi">("km");
  const [gridInterval, setGridInterval] = useState<number>(0.5); // degrees
  const [gridColor, setGridColor] = useState<string>("#cbd5e1");
  const [gridOpacity, setGridOpacity] = useState<number>(40);

  // Points Map exceeding-only features
  const [showOnlyExceedingPoints, setShowOnlyExceedingPoints] = useState<boolean>(true);
  const [exceedingPointSize, setExceedingPointSize] = useState<number>(0.5);
  const [showAs3dBubbles, setShowAs3dBubbles] = useState<boolean>(false);
  const [bubbleColor, setBubbleColor] = useState<string>("#ef4444");

  // Interpolation quality features
  const [useAllPoints, setUseAllPoints] = useState<boolean>(true);
  const [gridResolutionMultiplier, setGridResolutionMultiplier] = useState<number>(5);
  const [krigingModel, setKrigingModel] = useState<"spherical" | "exponential" | "gaussian">("spherical");
  const [krigingNugget, setKrigingNugget] = useState<number>(0.0);
  const [krigingSill, setKrigingSill] = useState<number>(1.0);
  const [krigingRange, setKrigingRange] = useState<number>(250); // in kilometers
  const [krigingNeighbors, setKrigingNeighbors] = useState<number>(12);
  const [rbfKernel, setRbfKernel] = useState<"multiquadric" | "inverse-multiquadric" | "thin-plate-spline" | "gaussian">("multiquadric");
  const [rbfParameter, setRbfParameter] = useState<number>(0.5); // smoothing / shape factor

  // Corner panels placements
  const [legendPos, setLegendPos] = useState<"top-left" | "top-right" | "bottom-left" | "bottom-right">("bottom-right");
  const [legendBgOpacity, setLegendBgOpacity] = useState<number>(95);
  
  const [showStatsPanel, setShowStatsPanel] = useState<boolean>(false);
  const [statsPanelPos, setStatsPanelPos] = useState<"top-left" | "top-right" | "bottom-left" | "bottom-right">("bottom-left");

  // Circular Agency Logo Option
  const [showAgencyLogo, setShowAgencyLogo] = useState<boolean>(false);
  const [agencyLogoType, setAgencyLogoType] = useState<"CGWB" | "MoJS" | "StateGWD" | "Custom">("CGWB");
  const [agencyLogoPos, setAgencyLogoPos] = useState<"top-left" | "top-right" | "bottom-left" | "bottom-right">("top-left");

  // Export Settings
  const [exportDpi, setExportDpi] = useState<number>(600);
  const [exportFormat, setExportFormat] = useState<"jpeg" | "png" | "tiff" | "svg" | "shapefile">("png");

  // Seasonal Comparison Toggles
  const [generateComparisonMode, setGenerateComparisonMode] = useState<boolean>(true);
  const [comparisonLayout, setComparisonLayout] = useState<"horizontal" | "vertical">("horizontal");
  const [sheetLayout, setSheetLayout] = useState<"landscape" | "a4-portrait">("a4-portrait");

  const canvasWidth = sheetLayout === "a4-portrait" ? 595 : 640;
  const canvasHeight = sheetLayout === "a4-portrait" ? 758 : 360;
  const canvasAspectClass = sheetLayout === "a4-portrait" ? "aspect-[595/758]" : "aspect-[640/360]";

  // Parse raw data into coordinates
  const parsedData = useMemo(() => {
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) return [];
    
    const latKey = (headerMap && headerMap["latitude"]) || (headers && headers.latitude) || "Latitude";
    const lngKey = (headerMap && headerMap["longitude"]) || (headers && headers.longitude) || "Longitude";
    const stateKey = (headerMap && headerMap["state"]) || (headers && headers.state) || "State";
    const districtKey = (headerMap && headerMap["district"]) || (headers && headers.district) || "District";
    
    const firstRow = rawData[0] || {};
    const seasonKey = (headers && headers.season) || Object.keys(firstRow).find(k => {
      const low = k.toLowerCase();
      return low.includes("season") || 
             low.includes("monsoon") || 
             low.includes("period") || 
             low.includes("pre") || 
             low.includes("post") || 
             low.includes("wet") || 
             low.includes("dry");
    }) || "Season";
    const yearKey = (headers && headers.year) || Object.keys(firstRow).find(k => k.toLowerCase().includes("year") || k.toLowerCase() === "date") || "Year";

    const findHeader = (id: string, keywords: string[]) => {
      if (headerMap && headerMap[id]) return headerMap[id];
      const keys = Object.keys(firstRow);
      return keys.find(k => {
        const l = k.toLowerCase().trim();
        return keywords.some(kw => l === kw.toLowerCase() || l.includes(kw.toLowerCase()));
      });
    };

    const caCol = findHeader("Ca", ["ca", "calcium"]);
    const mgCol = findHeader("Mg", ["mg", "magnesium"]);
    const naCol = findHeader("Na", ["na", "sodium"]);
    const kCol = findHeader("K", ["k", "potassium"]);
    const clCol = findHeader("Cl", ["cl", "chloride"]);
    const hco3Col = findHeader("HCO3", ["hco3", "bicarbonate"]);
    const co3Col = findHeader("CO3", ["co3", "carbonate"]);
    const so4Col = findHeader("SO4", ["so4", "sulphate", "sulfate"]);
    const ecCol = findHeader("EC", ["ec", "electrical conductivity", "conductivity"]);
    const tdsCol = findHeader("TDS", ["tds", "total dissolved solids"]);
    const alkCol = findHeader("Alkalinity", ["alkalinity", "total alkalinity", "alk"]);

    // Filter raw data by selected state and district if active
    let filteredRaw = rawData;
    if (!isStateAll(selectedState)) {
      const selVal = selectedState.trim().toLowerCase();
      filteredRaw = rawData.filter(d => {
        const stateVal = String(d[stateKey] || "").trim().toLowerCase();
        return stateVal === selVal || stateVal.includes(selVal) || selVal.includes(stateVal);
      });
    }
    if (!isDistrictAll(selectedDistrict)) {
      const selDist = selectedDistrict.trim().toLowerCase();
      filteredRaw = filteredRaw.filter(d => {
        const distVal = String(d[districtKey] || "").trim().toLowerCase();
        return distVal === selDist || distVal.includes(selDist) || selDist.includes(distVal);
      });
    }

    // Scan for unique non-empty season values
    const uniqueSeasons = Array.from(new Set(
      filteredRaw.map(row => String(row[seasonKey] || "").trim()).filter(Boolean)
    ));

    let preVal = uniqueSeasons.find(s => {
      const low = s.toLowerCase();
      return low.includes("pre") || low.includes("prm") || low === "before" || low.includes("wet") || low.includes("rabi");
    });
    let postVal = uniqueSeasons.find(s => {
      const low = s.toLowerCase();
      return low.includes("post") || low.includes("pom") || low === "after" || low.includes("dry") || low.includes("kharif");
    });

    if (!preVal && !postVal && uniqueSeasons.length === 2) {
      const sorted = [...uniqueSeasons].sort((a, b) => a.localeCompare(b));
      preVal = sorted[0];
      postVal = sorted[1];
    } else {
      if (!preVal && uniqueSeasons.length > 0) preVal = uniqueSeasons[0];
      if (!postVal && uniqueSeasons.length > 1) {
        postVal = uniqueSeasons[1] !== preVal ? uniqueSeasons[1] : uniqueSeasons[2];
      }
    }

    return filteredRaw.map(row => {
      const lat = parseFloat(row[latKey]);
      const lng = parseFloat(row[lngKey]);
      const rawSeason = String(row[seasonKey] || "Unknown").trim();
      
      let seasonGroup: "Pre-Monsoon" | "Post-Monsoon" | "Other" = "Other";
      if (preVal && rawSeason === preVal) {
        seasonGroup = "Pre-Monsoon";
      } else if (postVal && rawSeason === postVal) {
        seasonGroup = "Post-Monsoon";
      } else if (rawSeason.toLowerCase().includes("pre") || rawSeason.toLowerCase().includes("prm")) {
        seasonGroup = "Pre-Monsoon";
      } else if (rawSeason.toLowerCase().includes("post") || rawSeason.toLowerCase().includes("pom") || rawSeason.toLowerCase().includes("after")) {
        seasonGroup = "Post-Monsoon";
      }

      const year = parseInt(row[yearKey]) || 2025;

      const getNum = (col: string | undefined): number | null => {
        if (!col || row[col] === undefined || row[col] === null) return null;
        const val = parseFloat(row[col]);
        return isNaN(val) ? null : val;
      };

      const ca = getNum(caCol);
      const mg = getNum(mgCol);
      const na = getNum(naCol);
      const k = getNum(kCol);
      const cl = getNum(clCol);
      const hco3 = getNum(hco3Col);
      const co3 = getNum(co3Col);
      const so4 = getNum(so4Col);

      const safeVal = (v: number | null) => v === null ? 0 : v;

      const EQ_WEIGHTS = {
        Ca: 20.04,
        Mg: 12.16,
        Na: 23.0,
        K: 39.1,
        Cl: 35.45,
        SO4: 48.03,
        HCO3: 61.02,
        CO3: 30.0
      };

      const meq = {
        Ca: safeVal(ca) / EQ_WEIGHTS.Ca,
        Mg: safeVal(mg) / EQ_WEIGHTS.Mg,
        Na: safeVal(na) / EQ_WEIGHTS.Na,
        K: safeVal(k) / EQ_WEIGHTS.K,
        Cl: safeVal(cl) / EQ_WEIGHTS.Cl,
        SO4: safeVal(so4) / EQ_WEIGHTS.SO4,
        HCO3: safeVal(hco3) / EQ_WEIGHTS.HCO3,
        CO3: safeVal(co3) / EQ_WEIGHTS.CO3
      };

      let sarVal: number | null = null;
      if (ca !== null && mg !== null && na !== null) {
        const denom = Math.sqrt((meq.Ca + meq.Mg) / 2);
        if (denom > 0) {
          sarVal = meq.Na / denom;
        }
      }

      let rscVal: number | null = null;
      if (ca !== null && mg !== null && hco3 !== null) {
        rscVal = (meq.HCO3 + meq.CO3) - (meq.Ca + meq.Mg);
      }

      const directTds = getNum(tdsCol);
      const directEc = getNum(ecCol);
      const tdsVal = directTds !== null ? directTds : (directEc !== null ? directEc * 0.65 : 0);

      const directAlk = getNum(alkCol);
      const alkVal = directAlk !== null ? directAlk : (safeVal(hco3) / 61.02 + safeVal(co3) / 30.0) * 50;

      const naPercDenom = meq.Ca + meq.Mg + meq.Na + meq.K;
      const sspVal = naPercDenom > 0 ? ((meq.Na + meq.K) / naPercDenom) * 100 : 0;

      const piDenom = meq.Ca + meq.Mg + meq.Na;
      const piVal = piDenom > 0 ? ((meq.Na + Math.sqrt(meq.HCO3)) * 100) / piDenom : 0;

      const krDenom = meq.Ca + meq.Mg;
      const krVal = krDenom > 0 ? meq.Na / krDenom : 0;

      const mhDenom = meq.Ca + meq.Mg;
      const mhVal = mhDenom > 0 ? (meq.Mg * 100) / mhDenom : 0;

      return {
        ...row,
        lat,
        lng,
        state: row[stateKey] || "",
        district: row[districtKey] || "",
        seasonGroup,
        year,
        rawSeason,
        SAR: sarVal !== null ? parseFloat(sarVal.toFixed(2)) : undefined,
        RSC: rscVal !== null ? parseFloat(rscVal.toFixed(2)) : undefined,
        TDS: tdsVal !== null ? parseFloat(tdsVal.toFixed(2)) : undefined,
        Alkalinity: alkVal !== null ? parseFloat(alkVal.toFixed(2)) : undefined,
        SSP: sspVal !== null ? parseFloat(sspVal.toFixed(2)) : undefined,
        "Na%": sspVal !== null ? parseFloat(sspVal.toFixed(2)) : undefined,
        PI: piVal !== null ? parseFloat(piVal.toFixed(2)) : undefined,
        KR: krVal !== null ? parseFloat(krVal.toFixed(2)) : undefined,
        MH: mhVal !== null ? parseFloat(mhVal.toFixed(2)) : undefined,
      };
    }).filter(row => !isNaN(row.lat) && !isNaN(row.lng));
  }, [rawData, headers, headerMap, selectedState]);

  // Detected seasons
  const seasonalPresence = useMemo(() => {
    const seasons = new Set<string>();
    parsedData.forEach(p => {
      seasons.add(p.seasonGroup);
    });
    return {
      hasPre: seasons.has("Pre-Monsoon"),
      hasPost: seasons.has("Post-Monsoon"),
      totalCount: seasons.size
    };
  }, [parsedData]);

  const isComparisonActive = generateComparisonMode && seasonalPresence.hasPre && seasonalPresence.hasPost;

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.85 : 1.15;
      setZoomScaleFactor(z => {
        const newZ = z * zoomFactor;
        return Math.max(0.005, Math.min(20.0, newZ));
      });
    };

    const canvasLeft = canvasRefLeft.current;
    const canvasRight = canvasRefRight.current;

    if (canvasLeft) {
      canvasLeft.addEventListener("wheel", handleWheel, { passive: false });
    }
    if (canvasRight) {
      canvasRight.addEventListener("wheel", handleWheel, { passive: false });
    }

    return () => {
      if (canvasLeft) {
        canvasLeft.removeEventListener("wheel", handleWheel);
      }
      if (canvasRight) {
        canvasRight.removeEventListener("wheel", handleWheel);
      }
    };
  }, [isComparisonActive, isVisible, sheetLayout]);

  // Centroid/feature zooming helper
  const zoomToCentroid = useCallback((lng: number, lat: number, targetBounds?: { minLng: number; maxLng: number; minLat: number; maxLat: number }) => {
    let latitudes: number[] = [];
    let longitudes: number[] = [];
    if (fitToShapefile && shapefileBounds) {
      latitudes = [shapefileBounds.minLat, shapefileBounds.maxLat];
      longitudes = [shapefileBounds.minLng, shapefileBounds.maxLng];
    } else {
      const validPoints = isComparisonActive 
        ? (parsedData || []).filter(d => d.seasonGroup === "Pre-Monsoon" || d.seasonGroup === "Post-Monsoon")
        : (parsedData || []);
      if (validPoints.length > 0) {
        latitudes = validPoints.map(p => p.lat);
        longitudes = validPoints.map(p => p.lng);
      } else {
        latitudes = [8.4, 37.6];
        longitudes = [68.1, 97.4];
      }
    }
    const getMinVal = (arr: number[]) => arr.reduce((m, v) => (v < m ? v : m), Infinity);
    const getMaxVal = (arr: number[]) => arr.reduce((m, v) => (v > m ? v : m), -Infinity);

    const baseMinLat = getMinVal(latitudes);
    const baseMaxLat = getMaxVal(latitudes);
    const baseMinLng = getMinVal(longitudes);
    const baseMaxLng = getMaxVal(longitudes);
    const baseCenterLat = (baseMinLat + baseMaxLat) / 2;
    const baseCenterLng = (baseMinLng + baseMaxLng) / 2;

    setPanOffsetLat(lat - baseCenterLat);
    setPanOffsetLng(lng - baseCenterLng);

    if (targetBounds) {
      const targetdLat = targetBounds.maxLat - targetBounds.minLat || 0.1;
      const targetdLng = targetBounds.maxLng - targetBounds.minLng || 0.1;
      const basedLat = baseMaxLat - baseMinLat || 0.1;
      const basedLng = baseMaxLng - baseMinLng || 0.1;
      const scaleLat = targetdLat / basedLat;
      const scaleLng = targetdLng / basedLng;
      const idealZoom = Math.max(scaleLat, scaleLng) * 1.5;
      setZoomScaleFactor(Math.max(0.05, Math.min(idealZoom, 4.0)));
    } else {
      setZoomScaleFactor(0.2); // zoom in closely
    }
  }, [fitToShapefile, shapefileBounds, parsedData, isComparisonActive]);

  // Filter lists of parameters from PARAM_CONFIG that exist in data
  const availableParams = useMemo(() => {
    let params: string[] = [];
    if (parsedData.length === 0) {
      params = Object.keys(PARAM_CONFIG);
    } else {
      const rowKeys = Object.keys(parsedData[0]);
      params = Object.keys(PARAM_CONFIG).filter(p => {
        const config = PARAM_CONFIG[p];
        return rowKeys.some(rk => {
          const rkLower = rk.toLowerCase();
          return rkLower === p.toLowerCase() || config.keywords.some(kw => rkLower.includes(kw));
        });
      });
    }
    // Exclude parameters without BIS limits from GIS Map selection
    params = params.filter(p => hasBisLimit(p));

    // Ensure all calculated agricultural & hazard parameters are always listed
    const extraParams = ["SAR", "RSC", "TDS", "Alkalinity", "SSP", "Na%", "PI", "KR", "MH"];
    extraParams.forEach(ep => {
      if (!params.some(p => p.toLowerCase() === ep.toLowerCase())) {
        params.push(ep);
      }
    });

    const finalParams: string[] = [];
    const seen = new Set<string>();
    params.forEach(p => {
      const upper = p.toUpperCase();
      if (!seen.has(upper)) {
        seen.add(upper);
        finalParams.push(p);
      }
    });

    return [...finalParams, "STATIONS"];
  }, [parsedData]);

  useEffect(() => {
    if (availableParams.length > 0 && !availableParams.includes(selectedParam)) {
      setSelectedParam(availableParams[0]);
    }
  }, [availableParams, selectedParam]);

  const paramConfig = useMemo(() => {
    if (selectedParam === "STATIONS") {
      return { b1: 0, b2: 0, unit: "", name: "Ground Water Quality Monitoring Station", keywords: [] };
    }
    const virtualConfigs: Record<string, { b1: number; b2: number; unit: string; name: string; keywords: string[] }> = {
      SAR: { b1: 10, b2: 18, unit: "Ratio", name: "Sodium Adsorption Ratio (SAR)", keywords: [] },
      RSC: { b1: 1.25, b2: 2.5, unit: "meq/L", name: "Residual Sodium Carbonate (RSC)", keywords: [] },
      SSP: { b1: 40, b2: 60, unit: "%", name: "Soluble Sodium Percentage (SSP)", keywords: [] },
      "Na%": { b1: 40, b2: 60, unit: "%", name: "Sodium Percentage (%Na)", keywords: [] },
      PI: { b1: 25, b2: 75, unit: "%", name: "Permeability Index (PI)", keywords: [] },
      KR: { b1: 1.0, b2: 2.0, unit: "Ratio", name: "Kelly's Ratio (KR)", keywords: [] },
      MH: { b1: 50, b2: 50, unit: "%", name: "Magnesium Hazard (MH)", keywords: [] }
    };
    return PARAM_CONFIG[selectedParam] || virtualConfigs[selectedParam] || { b1: 1, b2: 10, unit: "mg/L", name: selectedParam, keywords: [] };
  }, [selectedParam]);

  const getMapDefaultTitleAndSubtitle = useCallback((side: "left" | "right") => {
    if (selectedParam === "STATIONS") {
      const title = "Ground Water Quality Monitoring Station";
      let year = "Year";
      let season = "Season";
      if (parsedData && parsedData.length > 0) {
        const firstRow = parsedData[0];
        if (firstRow.year) year = firstRow.year;
        if (firstRow.rawSeason && firstRow.rawSeason !== "Unknown") {
          season = firstRow.rawSeason;
        } else if (firstRow.seasonGroup) {
          season = firstRow.seasonGroup;
        }
      }
      const subtitle = `${season}-${year}`;
      return { title, subtitle };
    }
    const config = PARAM_CONFIG[selectedParam] || { name: selectedParam };
    const title = `Distribution of ${config.name}`;
    let year = 2025;
    let season = side === "left" ? "Pre-Monsoon" : "Post-Monsoon";

    if (parsedData && parsedData.length > 0) {
      const firstRow = parsedData[0];
      if (firstRow.year) {
        year = firstRow.year;
      }
      if (side === "left") {
        if (isComparisonActive) {
          season = "Pre-Monsoon";
        } else {
          season = firstRow.rawSeason && firstRow.rawSeason !== "Unknown" ? firstRow.rawSeason : (firstRow.seasonGroup || "Pre-Monsoon");
        }
      } else {
        if (showDifferenceMap) {
          season = "Difference (Post - Pre)";
        } else {
          season = "Post-Monsoon";
        }
      }
    }

    const subtitle = `${season} ${year}`;
    return { title, subtitle };
  }, [selectedParam, parsedData, isComparisonActive, showDifferenceMap]);

  const isInterpolatedType = useMemo(() => {
    return !!selectedParam;
  }, [selectedParam]);

  // Dynamic Geographic Centering & Scaling logic (70-80% India study area space occupancy)
  const mapExtent = useMemo(() => {
    let latitudes: number[] = [];
    let longitudes: number[] = [];

    if (fitToShapefile && shapefileBounds) {
      latitudes = [shapefileBounds.minLat, shapefileBounds.maxLat];
      longitudes = [shapefileBounds.minLng, shapefileBounds.maxLng];
    } else {
      const validPoints = isComparisonActive 
        ? parsedData.filter(d => d.seasonGroup === "Pre-Monsoon" || d.seasonGroup === "Post-Monsoon")
        : parsedData;

      if (validPoints.length === 0) {
        const defaultCenterLat = 23 + panOffsetLat;
        const defaultCenterLng = 82 + panOffsetLng;
        const defaultLngSpan = 29.3 * zoomScaleFactor;
        const defaultLatSpan = 29.2 * zoomScaleFactor;
        return {
          mapMinLng: defaultCenterLng - defaultLngSpan / 2,
          mapMaxLng: defaultCenterLng + defaultLngSpan / 2,
          mapMinLat: defaultCenterLat - defaultLatSpan / 2,
          mapMaxLat: defaultCenterLat + defaultLatSpan / 2,
          finalLngSpan: defaultLngSpan,
          finalLatSpan: defaultLatSpan,
          centerLat: defaultCenterLat,
          centerLng: defaultCenterLng
        };
      }

      latitudes = validPoints.map(p => p.lat);
      longitudes = validPoints.map(p => p.lng);
    }

    const getMinVal = (arr: number[]) => arr.reduce((m, v) => (v < m ? v : m), Infinity);
    const getMaxVal = (arr: number[]) => arr.reduce((m, v) => (v > m ? v : m), -Infinity);

    const minLat = getMinVal(latitudes);
    const maxLat = getMaxVal(latitudes);
    const minLng = getMinVal(longitudes);
    const maxLng = getMaxVal(longitudes);

    // Apply interactive panning
    const centerLat = ((minLat + maxLat) / 2) + panOffsetLat;
    const centerLng = ((minLng + maxLng) / 2) + panOffsetLng;
    const dLat = maxLat - minLat || 0.1;
    const dLng = maxLng - minLng || 0.1;

    // Physical distance factor for longitude scaling (mercator degree conversion at this latitude)
    const cosFactor = Math.cos(centerLat * Math.PI / 180);

    // Grid aspect ratio is dynamic based on sheet layout selection
    const mapBoxAspect = sheetLayout === "a4-portrait" ? (595 / 842) : 1.6;

    let finalLatSpan = dLat;
    let finalLngSpan = dLng;

    // Equalize margins on all sides & maximize canvas space (70-80% fill)
    const dataAspect = (dLng * cosFactor) / dLat;
    if (dataAspect > mapBoxAspect) {
      // Constrain by longitude width
      finalLngSpan = dLng / 0.75;
      finalLatSpan = (finalLngSpan * cosFactor) / mapBoxAspect;
    } else {
      // Constrain by latitude height
      finalLatSpan = dLat / 0.75;
      finalLngSpan = (finalLatSpan * mapBoxAspect) / cosFactor;
    }

    // Apply custom interactive zoom factor (+/- 10% per click facility)
    finalLatSpan *= zoomScaleFactor;
    finalLngSpan *= zoomScaleFactor;

    return {
      mapMinLng: centerLng - finalLngSpan / 2,
      mapMaxLng: centerLng + finalLngSpan / 2,
      mapMinLat: centerLat - finalLatSpan / 2,
      mapMaxLat: centerLat + finalLatSpan / 2,
      finalLngSpan,
      finalLatSpan,
      centerLat,
      centerLng
    };
  }, [parsedData, isComparisonActive, fitToShapefile, shapefileBounds, sheetLayout, zoomScaleFactor, panOffsetLat, panOffsetLng]);

  const baseMapExtent = mapExtent;

  // Filter datasets
  const leftPanelData = useMemo(() => {
    return parsedData.filter(d => d.seasonGroup === "Pre-Monsoon");
  }, [parsedData]);

  const rightPanelData = useMemo(() => {
    return parsedData.filter(d => d.seasonGroup === "Post-Monsoon");
  }, [parsedData]);

  // Helper conversion for colors
  const hexToRgb = (hex: string) => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 120, g: 120, b: 120 };
  };

  const interpolateColor = (colors: string[], t: number) => {
    const clampedT = Math.max(0, Math.min(1, t));
    const count = colors.length;
    const segment = 1 / (count - 1);
    const index = Math.floor(clampedT / segment);
    const tSegment = (clampedT - index * segment) / segment;
    
    const c1 = hexToRgb(colors[Math.min(index, count - 1)]);
    const c2 = hexToRgb(colors[Math.min(index + 1, count - 1)]);
    
    const r = Math.round(c1.r + tSegment * (c2.r - c1.r));
    const g = Math.round(c1.g + tSegment * (c2.g - c1.g));
    const b = Math.round(c1.b + tSegment * (c2.b - c1.b));
    
    return `rgb(${r}, ${g}, ${b})`;
  };

  const getClassColorsAndBreaks = useCallback((activeParamConfig: any) => {
    const b1 = activeParamConfig.b1;
    const b2 = activeParamConfig.b2;
    const K = interpolationClasses;

    if (K <= 2) {
      return {
        breaks: [b2],
        colors: [colorRange1, colorRange3],
        labels: [`≤ ${b2}`, `> ${b2}`]
      };
    }

    if (K === 3) {
      return {
        breaks: [b1, b2],
        colors: [colorRange1, colorRange2, colorRange3],
        labels: [`Acceptable (≤ ${b1})`, `Permissible (${b1} - ${b2})`, `Exceeded (> ${b2})`]
      };
    }

    const breaks: number[] = [];
    const colors: string[] = [];
    const labels: string[] = [];

    breaks.push(b1);
    for (let j = 1; j < K - 1; j++) {
      const val = b1 + j * (b2 - b1) / (K - 2);
      breaks.push(parseFloat(val.toFixed(2)));
    }
    breaks.push(b2);

    for (let i = 0; i < K; i++) {
      let t = i / (K - 1);
      let col = "";
      if (t <= 0.5) {
        col = interpolateColor([colorRange1, colorRange2], t * 2);
      } else {
        col = interpolateColor([colorRange2, colorRange3], (t - 0.5) * 2);
      }
      colors.push(col);
    }

    labels.push(`Acceptable (≤ ${b1})`);
    for (let i = 1; i < K - 1; i++) {
      labels.push(`Permissible (${breaks[i-1]} - ${breaks[i]})`);
    }
    labels.push(`Exceeded (> ${b2})`);

    return { breaks, colors, labels };
  }, [interpolationClasses, colorRange1, colorRange2, colorRange3]);

  const getBoundaryLegendLabel = (geoJson: any): string | null => {
    if (!geoJson) return null;
    const features = geoJson.features || (geoJson.type === "FeatureCollection" ? geoJson.features : []);
    if (!features || features.length === 0) {
      return "Boundary";
    }
    
    let hasDistrict = false;
    let hasState = false;
    
    const sampleFeatures = features.slice(0, Math.min(features.length, 10));
    for (const feature of sampleFeatures) {
      const props = feature.properties || {};
      const keys = Object.keys(props).map(k => k.toLowerCase());
      if (keys.some(k => k.includes("district") || k.includes("dist") || k === "dt_name" || k === "dist_name" || k === "district_n")) {
        hasDistrict = true;
      }
      if (keys.some(k => k.includes("state") || k === "st_name" || k === "state_name" || k === "st_nm")) {
        hasState = true;
      }
    }
    
    if (hasDistrict) {
      return "District Boundary";
    } else if (hasState) {
      return "State Boundary";
    }
    return "Boundary";
  };

  const getValueColor = (val: number, isDiffMode: boolean = false, paramOverride?: string, isPointMode: boolean = false) => {
    const activeParamName = paramOverride || selectedParam;
    const isStations = activeParamName === "STATIONS";
    if (isStations) {
      return stationPointColor; // monitoring stations custom color
    }
    const activeParamConfig = PARAM_CONFIG[activeParamName] || { b1: 1, b2: 10, unit: "mg/L", name: activeParamName };
    if (isDiffMode) {
      // Difference Map Color Coding: Post - Pre
      // Negative difference means improved concentration (Green/custom)
      // Positive difference means deteriorated concentration (Red/custom)
      // Near zero (+/- 5% of permissible limit) is stable (Gray/custom)
      const threshold = 0.05 * activeParamConfig.b2;
      if (val < -threshold) {
        return colorDiffImproved; // Improved
      } else if (val > threshold) {
        return colorDiffDeteriorated; // Deteriorated
      } else {
        return colorDiffStable; // Stable
      }
    }

    if (isPointMode && useCustomPointColors) {
      // Use Point-specific Colors
      const b1 = activeParamConfig.b1;
      const b2 = activeParamConfig.b2;
      if (val <= b1) return pointColorRange1;
      if (val <= b2) return pointColorRange2;
      return pointColorRange3;
    }

    // Otherwise, standard interpolation colors (supporting custom class count)
    const { breaks, colors } = getClassColorsAndBreaks(activeParamConfig);
    for (let i = 0; i < breaks.length; i++) {
      if (val <= breaks[i]) return colors[i];
    }
    return colors[colors.length - 1]; // last exceeded color
  };

  const getStats = (data: any[], paramKey: string) => {
    const isStations = paramKey === "STATIONS";
    const rawCol = headerMap[paramKey] || paramKey;
    let vals = data.map(d => parseFloat(d[rawCol])).filter(v => !isNaN(v));
    if (isStations) {
      vals = data.map(() => 1);
    }
    if (vals.length === 0) return null;

    vals.sort((a, b) => a - b);
    const total = vals.length;
    const min = vals[0];
    const max = vals[vals.length - 1];
    const sum = vals.reduce((a, b) => a + b, 0);
    const mean = sum / total;
    
    // Correct median calculation for even-numbered datasets
    let median = 0;
    if (total % 2 === 0) {
      const mid1 = vals[total / 2 - 1];
      const mid2 = vals[total / 2];
      median = (mid1 + mid2) / 2;
    } else {
      median = vals[Math.floor(total / 2)];
    }
    
    let variance = 0;
    vals.forEach(v => {
      variance += Math.pow(v - mean, 2);
    });
    // Use sample standard deviation (n - 1) instead of population standard deviation
    const stdDev = total > 1 ? Math.sqrt(variance / (total - 1)) : 0;

    const activeParamConfig = PARAM_CONFIG[paramKey] || { b1: 1, b2: 10, unit: "mg/L", name: paramKey };
    const exceedLimit = activeParamConfig.b2;
    const exceeding = vals.filter(v => v > exceedLimit).length;
    const percentage = ((exceeding / total) * 100).toFixed(2);

    // Determine the subgroup level (States/UTs or Districts)
    const stateKey = headerMap["state"] || headers.state || "State";
    const districtKey = headerMap["district"] || headers.district || "District";

    const uniqueStates = new Set<string>();
    const uniqueDistricts = new Set<string>();
    data.forEach(d => {
      const st = String(d[stateKey] || "").trim();
      const dt = String(d[districtKey] || "").trim();
      if (st) uniqueStates.add(st);
      if (dt) uniqueDistricts.add(st ? `${st}__${dt}` : dt);
    });

    const useDistricts = uniqueStates.size <= 1 && uniqueDistricts.size > 0;
    const subgroupKey = useDistricts ? districtKey : stateKey;
    const subgroupLabel = useDistricts ? "Districts" : "States/UTs";

    // Find partially affected subgroups
    const affectedSubgroups = new Set<string>();
    data.forEach(d => {
      const val = parseFloat(d[rawCol]);
      if (!isNaN(val) && val > exceedLimit) {
        const subName = d[subgroupKey] ? String(d[subgroupKey]).trim() : "";
        if (subName && subName !== "Unknown") {
          affectedSubgroups.add(subName);
        }
      }
    });

    const affectedCount = affectedSubgroups.size;
    const affectedNamesList = affectedCount > 0 ? Array.from(affectedSubgroups).sort().join(", ") : "-";

    return {
      total,
      exceeding,
      percentage,
      min: isStations ? "N/A" : min.toFixed(2),
      max: isStations ? "N/A" : max.toFixed(2),
      mean: isStations ? "N/A" : mean.toFixed(2),
      median: isStations ? "N/A" : median.toFixed(2),
      stdDev: isStations ? "N/A" : stdDev.toFixed(2),
      subgroupLabel,
      affectedCount,
      affectedNamesList
    };
  };

  const leftStats = useMemo(() => getStats(leftPanelData, selectedParam), [leftPanelData, selectedParam, paramConfig]);
  const rightStats = useMemo(() => getStats(rightPanelData, selectedParam), [rightPanelData, selectedParam, paramConfig]);

  // Master Vector & Raster GIS Drawer Function (Supports Vector-First High-DPI scaling)
  const drawMapInstance = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    scale: number, // Scale factor (e.g. 1 for screen, 6.25 for 600 DPI export)
    data: any[],
    titleStr: string,
    subtitleStr: string,
    stats: any,
    isDifference: boolean = false,
    diffMatrix: number[][] | null = null,
    panelId?: "left" | "right",
    paramOverride?: string,
    noBorder: boolean = false
  ) => {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Standard GIS margins suitable for Map neatline sheets
    const margin = 55 * scale;
    const mw = w - 2 * margin;
    const mh = h - 2 * margin;

    const baseMapExtent = mapExtent;
    const activeParamName = paramOverride || selectedParam;
    const activeParamConfig = activeParamName === "STATIONS"
      ? { b1: 0, b2: 0, unit: "", name: "Ground Water Quality Monitoring Station", keywords: [] }
      : (PARAM_CONFIG[activeParamName] || { b1: 1, b2: 10, unit: "mg/L", name: activeParamName, keywords: [] });
    const paramCol = headerMap[activeParamName] || activeParamName;
    const drawnAttributeLabelsAcrossLayers = new Set<string>();

    const draw3dText = (
      ctx: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      effect: "none" | "emboss" | "deboss",
      textColor: string,
      scale: number
    ) => {
      if (effect === "none") {
        ctx.fillStyle = textColor;
        ctx.fillText(text, x, y);
        return;
      }

      const isDark = textColor === "#ffffff" || textColor === "white" || textColor.toLowerCase().startsWith("rgba(255") || textColor.toLowerCase().startsWith("rgb(255");
      const highlightColor = isDark ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.85)";
      const shadowColor = isDark ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.45)";
      const offset = Math.max(0.6, 0.85 * scale);

      ctx.save();
      if (effect === "emboss") {
        ctx.fillStyle = shadowColor;
        ctx.fillText(text, x + offset, y + offset);
        ctx.fillStyle = highlightColor;
        ctx.fillText(text, x - offset, y - offset);
      } else if (effect === "deboss") {
        ctx.fillStyle = highlightColor;
        ctx.fillText(text, x + offset, y + offset);
        ctx.fillStyle = shadowColor;
        ctx.fillText(text, x - offset, y - offset);
      }
      ctx.fillStyle = textColor;
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    const { mapMinLng, mapMaxLng, mapMinLat, mapMaxLat, finalLngSpan, finalLatSpan, centerLat } = mapExtent;

    // Coordinate converters
    const getX = (lng: number) => {
      const pct = (lng - mapMinLng) / finalLngSpan;
      return margin + pct * mw;
    };
    const getY = (lat: number) => {
      const pct = (lat - mapMinLat) / finalLatSpan;
      return h - margin - pct * mh;
    };

    // Panels/cards styling theme helper
    const getPanelStyle = () => {
      if (onlyTransparentPanels) {
        const isDarkThemeText = mapTitleColor === "#ffffff" || panelBackgroundStyle.includes("dark");
        return {
          bg: "rgba(255, 255, 255, 0)",
          border: "rgba(255, 255, 255, 0)",
          text: isDarkThemeText ? "#f8fafc" : "#0f172a",
          muted: isDarkThemeText ? "#cbd5e1" : "#475569"
        };
      }
      switch (panelBackgroundStyle) {
        case "translucent-dark":
          return {
            bg: "rgba(15, 23, 42, 0.55)",
            border: "rgba(255, 255, 255, 0.25)",
            text: "#ffffff",
            muted: "#e2e8f0"
          };
        case "transparent-glass":
          return {
            bg: "rgba(255, 255, 255, 0.25)",
            border: "rgba(255, 255, 255, 0.5)",
            text: "#0f172a",
            muted: "#1e293b"
          };
        case "solid-light":
          return {
            bg: "#ffffff",
            border: "#cbd5e1",
            text: "#0f172a",
            muted: "#64748b"
          };
        case "solid-dark":
          return {
            bg: "#0f172a",
            border: "#334155",
            text: "#f8fafc",
            muted: "#94a3b8"
          };
        case "translucent-light":
        default:
          return {
            bg: "rgba(255, 255, 255, 0.55)",
            border: "rgba(148, 163, 184, 0.45)",
            text: "#0f172a",
            muted: "#334155"
          };
      }
    };

    const pStyle = getPanelStyle();

    const clipToShapefileGeom = (c2d: CanvasRenderingContext2D) => {
      if (!effectiveClipGeoJson) return false;
      
      c2d.beginPath();
      let pathCreated = false;

      const tracePolygonRing = (ring: number[][]) => {
        if (ring.length === 0) return;
        c2d.moveTo(getX(ring[0][0]), getY(ring[0][1]));
        for (let i = 1; i < ring.length; i++) {
          c2d.lineTo(getX(ring[i][0]), getY(ring[i][1]));
        }
        c2d.closePath();
        pathCreated = true;
      };

      const traceGeom = (geom: any) => {
        if (!geom) return;
        if (geom.type === "Polygon") {
          geom.coordinates.forEach((ring: number[][]) => tracePolygonRing(ring));
        } else if (geom.type === "MultiPolygon") {
          geom.coordinates.forEach((poly: number[][][]) => {
            poly.forEach((ring: number[][]) => tracePolygonRing(ring));
          });
        } else if (geom.type === "GeometryCollection") {
          geom.geometries?.forEach((g: any) => traceGeom(g));
        }
      };

      if (effectiveClipGeoJson.type === "FeatureCollection") {
        effectiveClipGeoJson.features?.forEach((f: any) => traceGeom(f.geometry));
      } else if (effectiveClipGeoJson.type === "Feature") {
        traceGeom(effectiveClipGeoJson.geometry);
      } else {
        traceGeom(effectiveClipGeoJson);
      }

      if (pathCreated) {
        c2d.clip("evenodd");
        return true;
      }
      return false;
    };

    // Adaptive zoom and tile ranges for current extent
    const calcOptimalZoom = () => {
      const span = Math.max(0.01, finalLngSpan);
      let z = Math.round(Math.log2(1440 / span));
      return Math.max(1, Math.min(18, z));
    };
    const zoom = calcOptimalZoom();

    let finalZoom = zoom;
    let xMin = Math.floor(lngToTileX(mapMinLng, finalZoom));
    let xMax = Math.floor(lngToTileX(mapMaxLng, finalZoom));
    let yMin = Math.floor(latToTileY(mapMaxLat, finalZoom));
    let yMax = Math.floor(latToTileY(mapMinLat, finalZoom));

    // Limit maximum number of tiles to draw to avoid heavy loading and crash
    while ((xMax - xMin + 1) * (yMax - yMin + 1) > 36 && finalZoom > 1) {
      finalZoom--;
      xMin = Math.floor(lngToTileX(mapMinLng, finalZoom));
      xMax = Math.floor(lngToTileX(mapMaxLng, finalZoom));
      yMin = Math.floor(latToTileY(mapMaxLat, finalZoom));
      yMax = Math.floor(latToTileY(mapMinLat, finalZoom));
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
      } else {
        // Default OpenStreetMap
        return `https://tile.openstreetmap.org/${tz}/${cleanX}/${cleanY}.png`;
      }
    };

    // 1. Clear background & draw Basemap Base
    ctx.clearRect(0, 0, w, h);
    const isTransparentBg = basemap === "Transparent (No Background)";
    const style = BASEMAP_STYLES[basemap as keyof typeof BASEMAP_STYLES] || BASEMAP_STYLES["No Basemap"];
    if (!isTransparentBg) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }

    // Render Tile-Based Basemap inside neatline boundaries
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin, margin, mw, mh);
    ctx.clip();

    if (!isTransparentBg && style.bg !== "transparent") {
      ctx.fillStyle = style.bg;
      ctx.fillRect(margin, margin, mw, mh);
    }

    if (basemap !== "No Basemap" && !isTransparentBg) {
      ctx.save();
      ctx.globalAlpha = basemapOpacity / 100;

      for (let tx = xMin; tx <= xMax; tx++) {
        for (let ty = yMin; ty <= yMax; ty++) {
          const tileLngLeft = tileXToLng(tx, finalZoom);
          const tileLngRight = tileXToLng(tx + 1, finalZoom);
          const tileLatTop = tileYToLat(ty, finalZoom);
          const tileLatBottom = tileYToLat(ty + 1, finalZoom);

          const tileCanvasXLeft = getX(tileLngLeft);
          const tileCanvasXRight = getX(tileLngRight);
          const tileCanvasYTop = getY(tileLatTop);
          const tileCanvasYBottom = getY(tileLatBottom);

          const tW = tileCanvasXRight - tileCanvasXLeft;
          const tH = tileCanvasYBottom - tileCanvasYTop;

          const url = getTileUrl(tx, ty, finalZoom);
          
          // LRU Cache Retrieval (refreshing key position to Most Recently Used)
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
                // LRU Cache Storage: Add and evict oldest key if size exceeds 128 items limit
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
            // subtle visual block background
            ctx.fillStyle = basemap.includes("Satellite") || basemap.includes("Dark") ? "#0c1524" : "#f1ebd9";
            ctx.fillRect(tileCanvasXLeft, tileCanvasYTop, tW, tH);
          } else {
            ctx.drawImage(tileImg, tileCanvasXLeft, tileCanvasYTop, tW, tH);
          }
        }
      }
      ctx.restore();
    }
    ctx.restore();

    // 2. Render Interpolation Raster Surface with pre-computed memoized grid
    if (showRaster && isInterpolatedType) {
      let cacheObj = (panelId === "left" && (!paramOverride || paramOverride === selectedParam))
        ? leftInterpolatedGrid
        : (panelId === "right" && (!paramOverride || paramOverride === selectedParam))
          ? rightInterpolatedGrid
          : null;

      if ((!cacheObj || (paramOverride && paramOverride !== selectedParam)) && data.length > 0) {
        // Build a high-density IDW grid on-the-fly (360x360 smooth raster)
        const syncColStep = 360;
        const syncRowStep = Math.max(60, Math.round(syncColStep * (finalLatSpan / finalLngSpan)));
        const syncGrid: number[][] = Array.from({ length: syncRowStep }, () => new Array(syncColStep).fill(NaN));
        
        const pts: { lat: number; lng: number; val: number }[] = [];
        data.forEach(d => {
          if (d.lat !== null && d.lng !== null && !isNaN(d.lat) && !isNaN(d.lng)) {
            const val = parseFloat(d[paramCol]);
            if (!isNaN(val)) {
              pts.push({ lat: d.lat, lng: d.lng, val });
            }
          }
        });
        
        if (pts.length > 0) {
          for (let r = 0; r < syncRowStep; r++) {
            const cellLat = mapMinLat + (r / syncRowStep) * finalLatSpan;
            for (let c = 0; c < syncColStep; c++) {
              const cellLng = mapMinLng + (c / syncColStep) * finalLngSpan;
              
              let exactVal: number | null = null;
              let numer = 0;
              let denom = 0;
              
              for (let i = 0; i < pts.length; i++) {
                const pt = pts[i];
                const dLat = cellLat - pt.lat;
                const dLng = cellLng - pt.lng;
                const distSq = dLat * dLat + dLng * dLng;
                if (distSq < 1e-10) {
                  exactVal = pt.val;
                  break;
                }
                const weight = 1 / Math.pow(distSq, (idwPower || 2) / 2);
                numer += weight * pt.val;
                denom += weight;
              }
              
              syncGrid[r][c] = exactVal !== null ? exactVal : (denom > 0 ? numer / denom : NaN);
            }
          }
        }
        
        cacheObj = { grid: syncGrid, colStep: syncColStep, rowStep: syncRowStep };
      }

      if (cacheObj) {
        const { grid, colStep, rowStep } = cacheObj;
        
        // Two-stage Rendering: First compute colored raster on mathCanvas, then upscale smoothly
        const mathCanvas = document.createElement("canvas");
        mathCanvas.width = colStep;
        mathCanvas.height = rowStep;
        const mathCtx = mathCanvas.getContext("2d");
        
        if (mathCtx) {
          const imgData = mathCtx.createImageData(colStep, rowStep);
          const data = imgData.data;
          
          for (let r = 0; r < rowStep; r++) {
            // Draw top-to-bottom: r=rowStep-1 is drawn at imgY=0 (top of canvas)
            const imgY = rowStep - 1 - r;
            for (let c = 0; c < colStep; c++) {
              const val = grid[r][c];
              const idx = (imgY * colStep + c) * 4;
              
              if (isNaN(val)) {
                data[idx] = 0;
                data[idx + 1] = 0;
                data[idx + 2] = 0;
                data[idx + 3] = 0;
                continue;
              }
              
              const colorStr = getValueColor(val, isDifference, activeParamName);
              let rVal = 0, gVal = 0, bVal = 0, aVal = 255;
              
              if (colorStr.startsWith("#")) {
                const hex = colorStr.replace("#", "");
                rVal = parseInt(hex.substring(0, 2), 16) || 0;
                gVal = parseInt(hex.substring(2, 4), 16) || 0;
                bVal = parseInt(hex.substring(4, 6), 16) || 0;
              } else if (colorStr.startsWith("rgb")) {
                const parts = colorStr.match(/\d+/g);
                if (parts) {
                  rVal = parseInt(parts[0]) || 0;
                  gVal = parseInt(parts[1]) || 0;
                  bVal = parseInt(parts[2]) || 0;
                  if (parts[3]) aVal = Math.round(parseFloat(parts[3]) * 255);
                }
              }
              
              data[idx] = rVal;
              data[idx + 1] = gVal;
              data[idx + 2] = bVal;
              data[idx + 3] = aVal;
            }
          }
          
          mathCtx.putImageData(imgData, 0, 0);
          
          ctx.save();
          if (effectiveClipGeoJson) {
            clipToShapefileGeom(ctx);
          }
          ctx.globalAlpha = rasterOpacity / 100;
          
          // Smooth bilinear rendering when drawing onto high-resolution raster
          ctx.imageSmoothingEnabled = smoothBlending;
          ctx.imageSmoothingQuality = "high";
          
          const xMin = getX(baseMapExtent.mapMinLng);
          const xMax = getX(baseMapExtent.mapMaxLng);
          const yMin = getY(baseMapExtent.mapMaxLat);
          const yMax = getY(baseMapExtent.mapMinLat);
          
          ctx.drawImage(mathCanvas, xMin - 0.2, yMin - 0.2, (xMax - xMin) + 0.4, (yMax - yMin) + 0.4);
          ctx.restore();
        }
      }
    }

    // 3. Draw Latitude and Longitude Grid & Topographic Neatline tickmarks
    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = gridColor;
      ctx.globalAlpha = gridOpacity / 100;
      ctx.lineWidth = 0.6 * scale;
      ctx.fillStyle = "#334155";
      ctx.font = `${8 * scale}px ${mapFontFamily}`;

      // Longitude ticks & lines
      const minLngInterval = Math.ceil(mapMinLng / gridInterval) * gridInterval;
      for (let lng = minLngInterval; lng <= mapMaxLng; lng += gridInterval) {
        const x = getX(lng);
        if (x < margin || x > w - margin) continue;

        // Draw grid vertical
        ctx.beginPath();
        ctx.moveTo(x, margin);
        ctx.lineTo(x, h - margin);
        ctx.stroke();

        // Draw tick marks inside top & bottom borders
        ctx.lineWidth = 1.2 * scale;
        ctx.beginPath();
        ctx.moveTo(x, margin);
        ctx.lineTo(x, margin - 6 * scale);
        ctx.moveTo(x, h - margin);
        ctx.lineTo(x, h - margin + 6 * scale);
        ctx.stroke();

        ctx.globalAlpha = 1.0;
        ctx.textAlign = "center";
        ctx.fillText(`${lng.toFixed(1)}°E`, x, h - margin + 16 * scale);
        ctx.globalAlpha = gridOpacity / 100;
      }

      // Latitude ticks & lines
      const minLatInterval = Math.ceil(mapMinLat / gridInterval) * gridInterval;
      for (let lat = minLatInterval; lat <= mapMaxLat; lat += gridInterval) {
        const y = getY(lat);
        if (y < margin || y > h - margin) continue;

        // Draw grid horizontal
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(w - margin, y);
        ctx.stroke();

        // Draw ticks on left & right
        ctx.lineWidth = 1.2 * scale;
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(margin - 6 * scale, y);
        ctx.moveTo(w - margin, y);
        ctx.lineTo(w - margin + 6 * scale, y);
        ctx.stroke();

        ctx.globalAlpha = 1.0;
        ctx.textAlign = "right";
        ctx.fillText(`${lat.toFixed(1)}°N`, margin - 10 * scale, y + 3 * scale);
        ctx.globalAlpha = gridOpacity / 100;
      }
      ctx.restore();
    }

    // 4. Neatline double-border frames (Professional publication standard)
    if (!noBorder) {
      ctx.strokeStyle = mapBorderColor;
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeRect(margin, margin, mw, mh); // Inner frame
      if (mapBorderType === "double" || (mapBorderType === undefined && showGrid)) {
        ctx.strokeRect(margin - 6 * scale, margin - 6 * scale, mw + 12 * scale, mh + 12 * scale); // Outer tick frame
      }
    }

    // 5b. Render Custom Shapefile / GeoJSON Boundaries (Drawn above base layers but below points)
    if (showShapefile) {
      drawnAttributeLabelsAcrossLayers.clear();
      const drawnLabelPixelPositions: { x: number; y: number }[] = [];

      if (layers && Array.isArray(layers) && layers.length > 0) {
        layers.forEach(layer => {
          try {
            if (!layer || !layer.visible) return;
            ctx.save();
            
            const drawPolygonRing = (ring: number[][], customFill: string) => {
              if (!ring || ring.length === 0) return;
              ctx.beginPath();
              const startX = getX(ring[0][0]);
              const startY = getY(ring[0][1]);
              ctx.moveTo(startX, startY);
              for (let i = 1; i < ring.length; i++) {
                ctx.lineTo(getX(ring[i][0]), getY(ring[i][1]));
              }
              ctx.closePath();
              ctx.fillStyle = customFill;
              ctx.globalAlpha = (layer.fillOpacity || 0) / 100;
              ctx.fill();
              if (layer.showStroke !== false) {
                ctx.strokeStyle = layer.strokeColor || "#3b82f6";
                ctx.lineWidth = (layer.strokeWidth || 1.0) * scale;
                ctx.globalAlpha = 1.0;
                ctx.stroke();
              }
            };

            const drawFeatureGeometry = (geom: any, f: any) => {
              if (!geom) return;
              const customFill = getFeatureFillColor(layer, f);

              if (geom.type === "Polygon" && geom.coordinates) {
                geom.coordinates.forEach((ring: number[][]) => drawPolygonRing(ring, customFill));
              } else if (geom.type === "MultiPolygon" && geom.coordinates) {
                geom.coordinates.forEach((poly: number[][][]) => {
                  poly.forEach((ring: number[][]) => drawPolygonRing(ring, customFill));
                });
              } else if (geom.type === "LineString" && geom.coordinates) {
                ctx.beginPath();
                if (geom.coordinates.length > 0) {
                  ctx.moveTo(getX(geom.coordinates[0][0]), getY(geom.coordinates[0][1]));
                  for (let i = 1; i < geom.coordinates.length; i++) {
                    ctx.lineTo(getX(geom.coordinates[i][0]), getY(geom.coordinates[i][1]));
                  }
                  if (layer.showStroke !== false) {
                    ctx.strokeStyle = layer.strokeColor || "#3b82f6";
                    ctx.lineWidth = (layer.strokeWidth || 1.0) * scale;
                    ctx.stroke();
                  }
                }
              } else if (geom.type === "MultiLineString" && geom.coordinates) {
                geom.coordinates.forEach((line: number[][]) => {
                  ctx.beginPath();
                  if (line.length > 0) {
                    ctx.moveTo(getX(line[0][0]), getY(line[0][1]));
                    for (let i = 1; i < line.length; i++) {
                      ctx.lineTo(getX(line[i][0]), getY(line[i][1]));
                    }
                    if (layer.showStroke !== false) {
                      ctx.strokeStyle = layer.strokeColor || "#3b82f6";
                      ctx.lineWidth = (layer.strokeWidth || 1.0) * scale;
                      ctx.stroke();
                    }
                  }
                });
              } else if (geom.type === "Point" && geom.coordinates) {
                const px = getX(geom.coordinates[0]);
                const py = getY(geom.coordinates[1]);
                ctx.beginPath();
                ctx.arc(px, py, 4 * scale, 0, Math.PI * 2);
                ctx.fillStyle = customFill;
                ctx.fill();
                ctx.strokeStyle = layer.strokeColor || "#3b82f6";
                ctx.lineWidth = (layer.strokeWidth || 1.0) * scale;
                ctx.stroke();
              } else if (geom.type === "GeometryCollection") {
                geom.geometries?.forEach((g: any) => drawFeatureGeometry(g, f));
              }
            };

            const gj = layer.geoJson;
            if (gj) {
              const shouldAutoCut = autoCutAdminToAoi && Boolean(aoiLayerId) && layer.id !== aoiLayerId;
              const allFeatures = gj.type === "FeatureCollection"
                ? (gj.features || [])
                : (gj.type === "Feature" ? [gj] : []);

              const featuresToRender: any[] = (shouldAutoCut && clippedFeaturesMap[layer.id])
                ? clippedFeaturesMap[layer.id]
                : allFeatures.filter((f: any) => featureMatchesSelection(f, selectedState, selectedDistrict, districtStateMap));

              // Draw polygon/polyline geometries
              featuresToRender.forEach((f: any) => {
                drawFeatureGeometry(f.geometry, f);
              });

              // Draw labels with state, district, or block names (Deduplicated to prevent doubling)
              const isLabelActive = shouldAutoCut 
                ? showAdminNamesOnMap 
                : (layer.showLabels && showShapefileLabels);
              if (isLabelActive) {
                const datasetDistrictSet = new Set(
                  data.map(d => norm(String(d[headerMap["district"] || "District"] || d.district || ""))).filter(Boolean)
                );
                const selStateNorm = !isStateAll(selectedState) ? norm(selectedState || "") : "";
                const aoiLayerObj = shouldAutoCut ? layers.find(l => l.id === aoiLayerId) : null;
                const aoiFeatures = aoiLayerObj?.geoJson
                  ? (aoiLayerObj.geoJson.features || (aoiLayerObj.geoJson.type === "Feature" ? [aoiLayerObj.geoJson] : []))
                  : [];

                const isFeatureInScope = (f: any): boolean => {
                  const p = f.properties || {};
                  const fState = String(
                    p.state || p.STATE || p.State || p.ST_NM || p.st_nm || p.NAME_1 || p.state_name || p.statename || p.st_name || ""
                  ).trim();
                  const fDist = String(
                    p.district || p.DISTRICT || p.District || p.NAME_2 || p.DT_NM || p.dist_name || p.DIST_NAME || p.district_name || ""
                  ).trim();

                  if (selStateNorm) {
                    if (fState) {
                      const fs = norm(fState);
                      if (fs !== selStateNorm && !fs.includes(selStateNorm) && !selStateNorm.includes(fs)) {
                        return false;
                      }
                    } else if (fDist) {
                      const fd = norm(fDist);
                      const mapped = districtStateMap[fDist.toLowerCase()] || districtStateMap[fd] || districtStateMap[fDist];
                      if (mapped) {
                        const ms = norm(mapped);
                        if (ms !== selStateNorm && !ms.includes(selStateNorm) && !selStateNorm.includes(ms)) {
                          return false;
                        }
                      } else if (datasetDistrictSet.size > 0 && !datasetDistrictSet.has(fd)) {
                        return false;
                      }
                    }
                  }

                  if (shouldAutoCut && aoiFeatures.length > 0 && layer.id !== aoiLayerId) {
                    try {
                      const pt = turf.pointOnFeature(f);
                      const insideAoi = aoiFeatures.some((af: any) => af?.geometry && turf.booleanPointInPolygon(pt, af));
                      if (!insideAoi) return false;
                    } catch {
                      // keep if topology check fails
                    }
                  }
                  return true;
                };

                // Group features by label text to eliminate duplicate/doubled names
                const featuresByLabelText: Record<string, { f: any; fIdx: number; rawLabel: string }[]> = {};

                featuresToRender.forEach((f: any, fIdx: number) => {
                  if (!f || !f.geometry) return;
                  if (!showNeighbourLabels && !isFeatureInScope(f)) return;

                  let labelText = "";
                  if (shouldAutoCut) {
                    labelText = getFeatureAttributeLabel(f, adminLabelAttribute, layer.labelKey);
                  } else if (layer.labelKey && f.properties && f.properties[layer.labelKey] !== undefined) {
                    labelText = String(f.properties[layer.labelKey]).trim();
                  } else {
                    const info = getAdminFeatureLabel(f);
                    labelText = info.name;
                  }

                  if (!labelText || labelText === "Unknown" || labelText === "Unit") return;

                  const normKey = norm(labelText);
                  if (!featuresByLabelText[normKey]) {
                    featuresByLabelText[normKey] = [];
                  }
                  featuresByLabelText[normKey].push({ f, fIdx, rawLabel: labelText });
                });

                // Render each unique label text EXACTLY ONCE
                Object.entries(featuresByLabelText).forEach(([normKey, items]) => {
                  // Prevent duplicate rendering across multiple shapefile layers
                  if (drawnAttributeLabelsAcrossLayers.has(normKey)) return;
                  drawnAttributeLabelsAcrossLayers.add(normKey);

                  // Pick custom dragged position if present, or feature with largest polygon area
                  let chosenItem = items[0];
                  const customItem = items.find(it => customLabelPositions[layer.id]?.[it.fIdx]);
                  if (customItem) {
                    chosenItem = customItem;
                  } else if (items.length > 1) {
                    let maxArea = -Infinity;
                    items.forEach(it => {
                      try {
                        const a = turf.area(it.f);
                        if (a > maxArea) {
                          maxArea = a;
                          chosenItem = it;
                        }
                      } catch {}
                    });
                  }

                  const { f, fIdx, rawLabel: labelText } = chosenItem;

                  let lng = 0, lat = 0;
                  const customPos = customLabelPositions[layer.id]?.[fIdx];
                  if (customPos) {
                    lng = customPos.lng;
                    lat = customPos.lat;
                  } else {
                    const c = getPolygonCentroid(f.geometry?.coordinates);
                    if (c) {
                      lng = c.lng;
                      lat = c.lat;
                    } else {
                      return;
                    }
                  }

                  const lx = getX(lng);
                  const ly = getY(lat);

                  if (lx < margin - 15 || lx > w - margin + 15 || ly < margin - 15 || ly > h - margin + 15) return;

                  // Collision detection: prevent overlapping text from different administrative units
                  const collides = drawnLabelPixelPositions.some(p => Math.hypot(p.x - lx, p.y - ly) < 18 * scale);
                  if (collides && !customPos) return;

                  ctx.save();
                  const targetSize = shouldAutoCut ? adminLabelSize : (layer.labelSize || 11);
                  const fontSize = Math.max(8, targetSize * scale);
                  const fontWeight = shouldAutoCut ? adminLabelWeight : "bold";
                  const fontStyle = (shouldAutoCut && adminLabelItalic) ? "italic " : "";
                  const fontFamily = shouldAutoCut ? adminLabelFontFamily : mapFontFamily;
                  ctx.font = `${fontStyle}${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";

                  // Text stroke / halo: only show if explicitly enabled by user
                  if (adminLabelShowHalo) {
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = Math.max(2, 2.5 * scale);
                    ctx.lineJoin = "round";
                    ctx.strokeText(labelText, lx, ly);
                  }

                  // Fill text color directly without background box/halo
                  ctx.fillStyle = shouldAutoCut ? adminLabelColor : (layer.labelColor || adminLabelColor || "#0f172a");
                  ctx.fillText(labelText, lx, ly);
                  ctx.restore();

                  drawnLabelPixelPositions.push({ x: lx, y: ly });
                });
              }
            }
            ctx.restore();
          } catch (err) {
            console.error("Error drawing custom layer:", err);
            try { ctx.restore(); } catch (_) {}
          }
        });
      } else if (effectiveClipGeoJson && uploadedGeoJson) {
        try {
          ctx.save();
          
          const drawPolygonRing = (ring: number[][]) => {
            if (!ring || ring.length === 0) return;
            ctx.beginPath();
            const startX = getX(ring[0][0]);
            const startY = getY(ring[0][1]);
            ctx.moveTo(startX, startY);
            for (let i = 1; i < ring.length; i++) {
              ctx.lineTo(getX(ring[i][0]), getY(ring[i][1]));
            }
            ctx.closePath();
            ctx.fillStyle = shapeFillColor;
            ctx.globalAlpha = shapeFillOpacity / 100;
            ctx.fill();
            if (showGlobalShapefileOutline !== false) {
              ctx.strokeStyle = shapeStrokeColor;
              ctx.lineWidth = shapeStrokeWidth * scale;
              ctx.globalAlpha = 1.0;
              ctx.stroke();
            }
          };

          const drawFeatureGeometry = (geom: any) => {
            if (!geom) return;
            if (geom.type === "Polygon" && geom.coordinates) {
              geom.coordinates.forEach((ring: number[][]) => drawPolygonRing(ring));
            } else if (geom.type === "MultiPolygon" && geom.coordinates) {
              geom.coordinates.forEach((poly: number[][][]) => {
                poly.forEach((ring: number[][]) => drawPolygonRing(ring));
              });
            } else if (geom.type === "LineString" && geom.coordinates) {
              ctx.beginPath();
              if (geom.coordinates.length > 0) {
                ctx.moveTo(getX(geom.coordinates[0][0]), getY(geom.coordinates[0][1]));
                for (let i = 1; i < geom.coordinates.length; i++) {
                  ctx.lineTo(getX(geom.coordinates[i][0]), getY(geom.coordinates[i][1]));
                }
                if (showGlobalShapefileOutline !== false) {
                  ctx.strokeStyle = shapeStrokeColor;
                  ctx.lineWidth = shapeStrokeWidth * scale;
                  ctx.stroke();
                }
              }
            } else if (geom.type === "MultiLineString" && geom.coordinates) {
              geom.coordinates.forEach((line: number[][]) => {
                ctx.beginPath();
                if (line.length > 0) {
                  ctx.moveTo(getX(line[0][0]), getY(line[0][1]));
                  for (let i = 1; i < line.length; i++) {
                    ctx.lineTo(getX(line[i][0]), getY(line[i][1]));
                  }
                  if (showGlobalShapefileOutline !== false) {
                    ctx.strokeStyle = shapeStrokeColor;
                    ctx.lineWidth = shapeStrokeWidth * scale;
                    ctx.stroke();
                  }
                }
              });
            } else if (geom.type === "Point" && geom.coordinates) {
              const px = getX(geom.coordinates[0]);
              const py = getY(geom.coordinates[1]);
              ctx.beginPath();
              ctx.arc(px, py, 4 * scale, 0, Math.PI * 2);
              ctx.fillStyle = shapeFillColor;
              ctx.fill();
              ctx.strokeStyle = shapeStrokeColor;
              ctx.lineWidth = shapeStrokeWidth * scale;
              ctx.stroke();
            } else if (geom.type === "GeometryCollection") {
              geom.geometries?.forEach((g: any) => drawFeatureGeometry(g));
            }
          };

          if (effectiveClipGeoJson.type === "FeatureCollection") {
            effectiveClipGeoJson.features?.forEach((f: any) => {
              try {
                if (f) drawFeatureGeometry(f.geometry);
              } catch (err) {
                console.error("Error drawing feature for uploadedGeoJson:", err);
              }
            });
          } else if (effectiveClipGeoJson.type === "Feature") {
            drawFeatureGeometry(effectiveClipGeoJson.geometry);
          } else {
            drawFeatureGeometry(effectiveClipGeoJson);
          }
          ctx.restore();
        } catch (err) {
          console.error("Error drawing uploadedGeoJson:", err);
          try { ctx.restore(); } catch (_) {}
        }
      }
    }

    // 5. Render Sampling Locations Points
    if (showPoints && !isDifference) {
      ctx.save();
      const isStations = activeParamName === "STATIONS";
      data.forEach(pt => {
        const val = isStations ? 1 : parseFloat(pt[paramCol]);
        if (isNaN(val)) return;

        // For Points Map, if showOnlyExceedingPoints is enabled, only show locations above permissible limit (b2)
        const exceedLimit = activeParamConfig.b2;
        if (!isStations && showOnlyExceedingPoints && val <= exceedLimit) {
          return;
        }

        const px = getX(pt.lng);
        const py = getY(pt.lat);
        if (px < margin || px > w - margin || py < margin || py > h - margin) return;

        let rad = (symbolSize / 2) * scale;

        if (showOnlyExceedingPoints) {
          // Exceeding point styling: red (or custom bubbleColor) without outer boundary
          rad = exceedingPointSize * 10 * scale; // Default size 0.5 becomes 5px, adjustable 0.1 to 3 becomes 1px to 30px
          ctx.globalAlpha = symbolOpacity / 100;

          if (showAs3dBubbles) {
            // 3D bubble with high-quality radial gradient shading
            const grad = ctx.createRadialGradient(
              px - rad * 0.3, py - rad * 0.3, rad * 0.1,
              px, py, rad
            );
            grad.addColorStop(0, "#ffffff");
            grad.addColorStop(0.35, bubbleColor);
            grad.addColorStop(1, darkenColor(bubbleColor, 0.45));
            ctx.fillStyle = grad;
          } else {
            ctx.fillStyle = bubbleColor;
          }

          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
          // NO outer boundary (stroke) as requested
        } else {
          // Standard points drawing logic
          ctx.fillStyle = isStations ? stationPointColor : getValueColor(val, false, activeParamName, true);
          ctx.strokeStyle = symbolBorderColor;
          ctx.lineWidth = symbolBorderSize * scale;
          ctx.globalAlpha = symbolOpacity / 100;

          ctx.beginPath();
          if (symbolType === "circle") {
            ctx.arc(px, py, rad, 0, Math.PI * 2);
          } else if (symbolType === "square") {
            ctx.rect(px - rad, py - rad, rad * 2, rad * 2);
          } else if (symbolType === "triangle") {
            ctx.moveTo(px, py - rad);
            ctx.lineTo(px - rad, py + rad);
            ctx.lineTo(px + rad, py + rad);
            ctx.closePath();
          } else if (symbolType === "diamond") {
            ctx.moveTo(px, py - rad);
            ctx.lineTo(px + rad, py);
            ctx.lineTo(px, py + rad);
            ctx.lineTo(px - rad, py);
            ctx.closePath();
          } else if (symbolType === "star") {
            for (let i = 0; i < 5; i++) {
              ctx.lineTo(px + Math.cos(((18 + i * 72) * Math.PI) / 180) * rad, py - Math.sin(((18 + i * 72) * Math.PI) / 180) * rad);
              ctx.lineTo(px + Math.cos(((54 + i * 72) * Math.PI) / 180) * (rad / 2.2), py - Math.sin(((54 + i * 72) * Math.PI) / 180) * (rad / 2.2));
            }
            ctx.closePath();
          }
          ctx.fill();
          ctx.stroke();
        }

        // Optional Point Labels (Station Name or Local attributes)
        if (showLabels) {
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = "#475569";
          ctx.font = `${6 * scale}px ${mapFontFamily}`;
          const isDistDrawn = pt.district && drawnAttributeLabelsAcrossLayers.has(norm(pt.district));
          const labelTxt = pt.location || pt["Well ID"] || pt.station || (isDistDrawn ? "" : pt.district) || "Pt";
          if (labelTxt && labelTxt !== "Pt") {
            ctx.fillText(labelTxt.substring(0, 10), px + rad + 2 * scale, py + 2 * scale);
          }
        }
      });
      ctx.restore();
    }

    // 6. Professional Scale Bar Calculation
    if (showScaleBar) {
      ctx.save();
      // Ground scale math
      const widthKm = finalLngSpan * 111 * Math.cos(centerLat * Math.PI / 180);
      const pxPerKm = mw / widthKm;
      
      // Select best rounded division dynamically
      const roundDivisions = [1, 2, 5, 10, 25, 50, 100, 200, 500];
      const targetKmRaw = (120 * scale) / pxPerKm;
      const targetKm = roundDivisions.reduce((prev, curr) => 
        Math.abs(curr - targetKmRaw) < Math.abs(prev - targetKmRaw) ? curr : prev
      );

      const scaleW = targetKm * pxPerKm;
      const scaleX = margin + 15 * scale + scaleBarOffsetX * scale;
      const scaleY = h - margin - 20 * scale + scaleBarOffsetY * scale;

      // Draw glassmorphic translucent background
      ctx.fillStyle = pStyle.bg;
      ctx.strokeStyle = pStyle.border;
      ctx.lineWidth = 1 * scale;
      ctx.fillRect(scaleX - 5 * scale, scaleY - 18 * scale, scaleW + 25 * scale, 30 * scale);
      ctx.strokeRect(scaleX - 5 * scale, scaleY - 18 * scale, scaleW + 25 * scale, 30 * scale);

      // Alternating black and white solid segments
      ctx.strokeStyle = pStyle.text;
      ctx.lineWidth = 1.2 * scale;
      ctx.fillStyle = pStyle.text === "#ffffff" ? "#cbd5e1" : "#000000";
      ctx.fillRect(scaleX, scaleY - 5 * scale, scaleW / 2, 5 * scale);
      ctx.fillStyle = pStyle.text === "#ffffff" ? "#334155" : "#ffffff";
      ctx.fillRect(scaleX + scaleW / 2, scaleY - 5 * scale, scaleW / 2, 5 * scale);
      ctx.strokeRect(scaleX, scaleY - 5 * scale, scaleW, 5 * scale);

      // Ticks and labels (High density crisp text)
      ctx.fillStyle = pStyle.text;
      ctx.font = `bold ${8 * scale}px ${mapFontFamily}`;
      ctx.textAlign = "center";
      ctx.fillText("0", scaleX, scaleY + 10 * scale);
      ctx.fillText(`${(targetKm / 2).toFixed(0)}`, scaleX + scaleW / 2, scaleY + 10 * scale);
      ctx.fillText(`${targetKm} ${scaleBarUnit.toUpperCase()}`, scaleX + scaleW, scaleY + 10 * scale);
      ctx.restore();
    }

    // 7. North Arrow decoration
    let arrowX = w - margin - 35 * scale;
    let arrowY = margin + 45 * scale;
    if (northArrowPos === "top-left") { arrowX = margin + 35 * scale; arrowY = margin + 45 * scale; }
    else if (northArrowPos === "bottom-left") { arrowX = margin + 35 * scale; arrowY = h - margin - 55 * scale; }
    else if (northArrowPos === "bottom-right") { arrowX = w - margin - 35 * scale; arrowY = h - margin - 55 * scale; }

    // Apply Precise Position Offsets (User adjustable fine element positioning)
    arrowX += northArrowOffsetX * scale;
    arrowY += northArrowOffsetY * scale;

    ctx.save();
    ctx.translate(arrowX, arrowY);
    ctx.strokeStyle = "#1e293b";
    ctx.fillStyle = "#1e293b";
    ctx.lineWidth = 1.5 * scale;

    const arrowRad = (northArrowSize / 2) * scale;

    if (northArrowType === "classic") {
      // Classic multi-point compass dial
      ctx.beginPath();
      ctx.arc(0, 0, arrowRad * 0.8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, -arrowRad);
      ctx.lineTo(4 * scale, 0);
      ctx.lineTo(0, -2 * scale);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.moveTo(0, -arrowRad);
      ctx.lineTo(-4 * scale, 0);
      ctx.lineTo(0, -2 * scale);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#0f172a";
      ctx.font = `bold ${9 * scale}px ${mapFontFamily}`;
      ctx.textAlign = "center";
      ctx.fillText("N", 0, -arrowRad - 4 * scale);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -arrowRad);
      ctx.lineTo(arrowRad * 0.4, arrowRad * 0.4);
      ctx.lineTo(0, 0);
      ctx.lineTo(-arrowRad * 0.4, arrowRad * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.font = `bold ${9 * scale}px ${mapFontFamily}`;
      ctx.textAlign = "center";
      ctx.fillText("N", 0, -arrowRad - 4 * scale);
    }
    ctx.restore();

    // 8. Custom Circular CGWB Vector Logo
    if (showAgencyLogo) {
      let logoX = margin + 30 * scale;
      let logoY = margin + 30 * scale;
      if (agencyLogoPos === "top-right") { logoX = w - margin - 35 * scale; logoY = margin + 30 * scale; }
      else if (agencyLogoPos === "bottom-left") { logoX = margin + 35 * scale; logoY = h - margin - 35 * scale; }
      else if (agencyLogoPos === "bottom-right") { logoX = w - margin - 35 * scale; logoY = h - margin - 35 * scale; }

      ctx.save();
      ctx.translate(logoX, logoY);
      
      // Draw Circular Shield
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, 16 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 1.5 * scale;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 14 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = "#0369a1";
      ctx.lineWidth = 0.5 * scale;
      ctx.stroke();

      // Procedural Water Droplet inside center
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.moveTo(0, -9 * scale);
      ctx.bezierCurveTo(4 * scale, -3 * scale, 5 * scale, 2 * scale, 5 * scale, 5 * scale);
      ctx.arc(0, 5 * scale, 5 * scale, 0, Math.PI);
      ctx.bezierCurveTo(-5 * scale, 2 * scale, -4 * scale, -3 * scale, 0, -9 * scale);
      ctx.fill();

      // Tiny green leaves / ears of wheat
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 1 * scale;
      ctx.beginPath();
      ctx.arc(-8 * scale, 2 * scale, 6 * scale, 0, Math.PI / 2);
      ctx.arc(8 * scale, 2 * scale, 6 * scale, Math.PI / 2, Math.PI);
      ctx.stroke();

      ctx.restore();
    }

    // Basemap Source Attribution (lower right corner of the active map surface)
    if (basemap !== "No Basemap") {
      let attribution = "Source: © OpenStreetMap contributors";
      if (basemap.startsWith("ESRI")) {
        attribution = "Source: Esri, Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN, and the GIS User Community";
      } else if (basemap.startsWith("Google")) {
        attribution = "Source: Map data ©2026 Google";
      }

      ctx.save();
      ctx.font = `${6.5 * scale}px ${mapFontFamily}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      
      // Draw small semi-translucent background for legibility
      const textWidth = ctx.measureText(attribution).width;
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.fillRect(
        w - margin - textWidth - 8 * scale,
        h - margin - 11 * scale,
        textWidth + 8 * scale,
        11 * scale
      );

      ctx.fillStyle = "#334155";
      ctx.fillText(
        attribution,
        w - margin - 4 * scale,
        h - margin - 3 * scale
      );
      ctx.restore();
    }
    let legendWidthVal = legendWidth;
    const visibleLayers = layers.filter(l => l.visible);

    const shapefileLegendItems: { color: string; label: string; fillOpacity: number; showStroke: boolean; strokeColor: string; strokeWidth: number }[] = [];
    if (showShapefile && showShapefileInLegend) {
      if (visibleLayers.length > 0) {
        visibleLayers.forEach((layer) => {
          if (layer.showInLegend === false) return;
          if (layer.colorAttribute && layer.colorMapping && Object.keys(layer.colorMapping).length > 0) {
            Object.keys(layer.colorMapping).forEach((attrValue) => {
              shapefileLegendItems.push({
                color: layer.colorMapping[attrValue],
                label: attrValue,
                fillOpacity: layer.fillOpacity || 15,
                showStroke: layer.showStroke !== false,
                strokeColor: layer.strokeColor,
                strokeWidth: layer.strokeWidth || 2.0,
              });
            });
          } else {
            const label = getBoundaryLegendLabel(layer.geoJson) || layer.name;
            shapefileLegendItems.push({
              color: layer.fillColor,
              label: label,
              fillOpacity: layer.fillOpacity || 15,
              showStroke: layer.showStroke !== false,
              strokeColor: layer.strokeColor,
              strokeWidth: layer.strokeWidth || 2.0,
            });
          }
        });
      } else if (uploadedGeoJson) {
        const label = getBoundaryLegendLabel(uploadedGeoJson) || "Boundary";
        shapefileLegendItems.push({
          color: shapeFillColor,
          label: label,
          fillOpacity: shapeFillOpacity || 15,
          showStroke: showGlobalShapefileOutline,
          strokeColor: shapeStrokeColor,
          strokeWidth: shapeStrokeWidth || 2.0,
        });
      }
    }

    let extraBoundaryHeight = 0;
    if (showShapefile && showShapefileInLegend && shapefileLegendItems.length > 0) {
      const numShapefileRows = Math.ceil(shapefileLegendItems.length / shapefileLegendColumns);
      extraBoundaryHeight = numShapefileRows * shapefileLegendSpacing;
    }

    if (showShapefile && showShapefileInLegend && shapefileLegendColumns > 1 && legendWidthVal < 240) {
      legendWidthVal = 240;
    }
    const legendWidthFinal = legendWidthVal;

    let classCount = 3;
    const isStations = activeParamName === "STATIONS";
    if (!isStations && !(showPoints && showOnlyExceedingPoints && !isDifference)) {
      if (isDifference) {
        classCount = 3;
      } else {
        classCount = interpolationClasses;
      }
    }
    const numClassRows = isStations || (showPoints && showOnlyExceedingPoints && !isDifference)
      ? 2
      : Math.ceil(classCount / legendColumns);

    const legendHeight = Math.max(95, 95 + (numClassRows - 3) * legendRowSpacing + extraBoundaryHeight + (isStations ? 10 : 0));

    let legX = w - margin - (legendWidthFinal + 15) * scale;
    let legY = h - margin - (legendHeight + 15) * scale;
    if (legendPos === "top-left") { legX = margin + 15 * scale; legY = margin + 15 * scale; }
    else if (legendPos === "top-right") { legX = w - margin - (legendWidthFinal + 15) * scale; legY = margin + 15 * scale; }
    else if (legendPos === "bottom-left") { legX = margin + 15 * scale; legY = h - margin - (legendHeight + 15) * scale; }

    // Apply Precise Position Offsets (User adjustable fine element positioning)
    legX += legendOffsetX * scale;
    legY += legendOffsetY * scale;

    ctx.save();
    // Glassmorphic shadow and layout for high density cards
    ctx.shadowColor = "rgba(0,0,0,0.06)";
    ctx.shadowBlur = 8 * scale;
    ctx.fillStyle = pStyle.bg;
    ctx.strokeStyle = pStyle.border;
    ctx.lineWidth = 1 * scale;
    ctx.fillRect(legX, legY, legendWidthFinal * scale, legendHeight * scale);
    ctx.strokeRect(legX, legY, legendWidthFinal * scale, legendHeight * scale);
    ctx.shadowColor = "transparent"; // Reset shadow

    ctx.fillStyle = legendTextColor;
    ctx.font = `bold ${legendTitleSize * scale}px ${mapFontFamily}`;

    if (isStations) {
      draw3dText(ctx, "Legend", legX + 8 * scale, legY + 14 * scale, legend3dEffect, legendTextColor, scale);
      ctx.save();
      ctx.fillStyle = legendTextColor;
      ctx.font = `italic ${legendSubtitleSize * scale}px ${mapFontFamily}`;
      ctx.fillText("Monitoring Stations", legX + 8 * scale, legY + 23 * scale);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = stationPointColor; // custom station point color glossy bead
      const legPtX = legX + 16 * scale;
      const legPtY = legY + 45 * scale;
      const legRad = 5.5 * scale;
      ctx.beginPath();
      ctx.arc(legPtX, legPtY, legRad, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.8 * scale;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = legendTextColor;
      ctx.font = `bold ${legendFontSize * scale}px ${mapFontFamily}`;
      ctx.fillText("Ground Water Sampling", legX + (10 + legendBoxWidth + 6) * scale, legY + 41 * scale);
      ctx.fillText(`Locations (N=${data.length})`, legX + (10 + legendBoxWidth + 6) * scale, legY + 51 * scale);
    } else if (showPoints && showOnlyExceedingPoints && !isDifference) {
      // 4. Custom legend for point maps: Locations with parameter above permissible limit (no different colors)
      draw3dText(ctx, "Legend", legX + 8 * scale, legY + 14 * scale, legend3dEffect, legendTextColor, scale);
      ctx.save();
      ctx.fillStyle = legendTextColor;
      ctx.font = `italic ${legendSubtitleSize * scale}px ${mapFontFamily}`;
      ctx.fillText(getParamDisplayName(activeParamName), legX + 8 * scale, legY + 23 * scale);
      ctx.restore();

      // Draw red/custom point (same style as exceeding points)
      ctx.save();
      ctx.fillStyle = bubbleColor;
      const legPtX = legX + 16 * scale;
      const legPtY = legY + 45 * scale;
      const legRad = 5.5 * scale;
      if (showAs3dBubbles) {
        const grad = ctx.createRadialGradient(
          legPtX - legRad * 0.3, legPtY - legRad * 0.3, legRad * 0.1,
          legPtX, legPtY, legRad
        );
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.35, bubbleColor);
        grad.addColorStop(1, darkenColor(bubbleColor, 0.45));
        ctx.fillStyle = grad;
      }
      ctx.beginPath();
      ctx.arc(legPtX, legPtY, legRad, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = legendTextColor;
      ctx.font = `bold ${legendFontSize * scale}px ${mapFontFamily}`;
      ctx.fillText(`Locations Above`, legX + (10 + legendBoxWidth + 6) * scale, legY + 41 * scale);
      ctx.fillText(`Permissible Limit`, legX + (10 + legendBoxWidth + 6) * scale, legY + 51 * scale);
      
      ctx.fillStyle = legendTextColor;
      ctx.font = `${legendFontSize * scale}px ${mapFontFamily}`;
      ctx.fillText(`(Value > ${activeParamConfig.b2} ${activeParamConfig.unit})`, legX + (10 + legendBoxWidth + 6) * scale, legY + 63 * scale);
    } else {
      draw3dText(ctx, "Legend", legX + 8 * scale, legY + 14 * scale, legend3dEffect, legendTextColor, scale);
      ctx.save();
      ctx.fillStyle = legendTextColor;
      ctx.font = `italic ${legendSubtitleSize * scale}px ${mapFontFamily}`;
      ctx.fillText(getParamDisplayName(activeParamName), legX + 8 * scale, legY + 23 * scale);
      ctx.restore();

      const colors = COLOR_SCHEMES[colorScheme as keyof typeof COLOR_SCHEMES] || COLOR_SCHEMES["Blue-Yellow-Red"];
      const colWidth = (legendWidthFinal - 16) / legendColumns;

      if (isDifference) {
        // Diff classes
        const diffClasses = [
          { label: "Improved (Post < Pre)", color: colorDiffImproved },
          { label: "No Change (Stable)", color: colorDiffStable },
          { label: "Deteriorated (Post > Pre)", color: colorDiffDeteriorated }
        ];
        diffClasses.forEach((cls, i) => {
          const colIndex = i % legendColumns;
          const rowIndex = Math.floor(i / legendColumns);
          const itemX = legX + (10 + colIndex * colWidth) * scale;
          const itemY = legY + (32 + rowIndex * legendRowSpacing) * scale;

          ctx.fillStyle = cls.color;
          ctx.fillRect(itemX, itemY, legendBoxWidth * scale, legendBoxHeight * scale);
          ctx.fillStyle = legendTextColor;
          ctx.font = `${legendFontSize * scale}px ${mapFontFamily}`;
          ctx.fillText(cls.label, itemX + (legendBoxWidth + 6) * scale, itemY + (legendBoxHeight - 0.5) * scale);
        });
      } else {
        // Standard dynamic classes
        const { colors: classColors, labels: classLabels } = getClassColorsAndBreaks(activeParamConfig);
        const classes = classLabels.map((lbl, idx) => ({
          label: lbl,
          color: classColors[idx]
        }));
        classes.forEach((cls, i) => {
          const colIndex = i % legendColumns;
          const rowIndex = Math.floor(i / legendColumns);
          const itemX = legX + (10 + colIndex * colWidth) * scale;
          const itemY = legY + (32 + rowIndex * legendRowSpacing) * scale;

          ctx.fillStyle = cls.color;
          ctx.fillRect(itemX, itemY, legendBoxWidth * scale, legendBoxHeight * scale);
          ctx.fillStyle = legendTextColor;
          ctx.font = `${legendFontSize * scale}px ${mapFontFamily}`;
          ctx.fillText(cls.label, itemX + (legendBoxWidth + 6) * scale, itemY + (legendBoxHeight - 0.5) * scale);
        });
      }
    }

    if (showShapefile && showShapefileInLegend && shapefileLegendItems.length > 0) {
      let startY = 32 + numClassRows * legendRowSpacing;
      
      // Determine Font Style
      let fontStyleStr = "";
      if (shapefileLegendFontStyle === "bold") fontStyleStr = "bold ";
      else if (shapefileLegendFontStyle === "italic") fontStyleStr = "italic ";
      else if (shapefileLegendFontStyle === "bold-italic") fontStyleStr = "bold italic ";
      
      const shapefileColWidth = (legendWidthFinal - 16) / shapefileLegendColumns;

      shapefileLegendItems.forEach((item, i) => {
        const colIndex = i % shapefileLegendColumns;
        const rowIndex = Math.floor(i / shapefileLegendColumns);
        const itemX = legX + (10 + colIndex * shapefileColWidth) * scale;
        const itemY = legY + (startY + rowIndex * shapefileLegendSpacing) * scale;

        // Draw fill
        ctx.save();
        ctx.fillStyle = item.color;
        ctx.globalAlpha = item.fillOpacity / 100;
        ctx.fillRect(itemX, itemY, legendBoxWidth * scale, legendBoxHeight * scale);
        ctx.restore();

        // Draw stroke
        if (item.showStroke) {
          ctx.save();
          ctx.strokeStyle = item.strokeColor;
          ctx.lineWidth = Math.max(1, item.strokeWidth * 0.5) * scale;
          ctx.strokeRect(itemX, itemY, legendBoxWidth * scale, legendBoxHeight * scale);
          ctx.restore();
        }

        // Draw text
        ctx.fillStyle = shapefileLegendTextColor;
        ctx.font = `${fontStyleStr}${shapefileLegendFontSize * scale}px ${shapefileLegendFontFamily}`;
        ctx.fillText(item.label, itemX + (legendBoxWidth + 6) * scale, itemY + (legendBoxHeight - 0.5) * scale);
      });
    }

    if (!isStations) {
      ctx.fillStyle = legendTextColor;
      ctx.font = `italic ${legendSubtitleSize * scale}px ${mapFontFamily}`;
      ctx.fillText(`Unit: ${activeParamConfig.unit || "N/A"}`, legX + 10 * scale, legY + (legendHeight - 9) * scale);
    }
    ctx.restore();

    // 10. Optional stats panel
    if (showStatsPanel && stats) {
      let stX = margin + 15 * scale;
      let stY = h - margin - 165 * scale;
      if (statsPanelPos === "top-left") { stX = margin + 15 * scale; stY = margin + 15 * scale; }
      else if (statsPanelPos === "top-right") { stX = w - margin - 200 * scale; stY = margin + 15 * scale; }
      else if (statsPanelPos === "bottom-right") { stX = w - margin - 200 * scale; stY = h - margin - 165 * scale; }

      // Apply Precise Position Offsets (User adjustable fine element positioning)
      stX += statsOffsetX * scale;
      stY += statsOffsetY * scale;

      ctx.save();
      ctx.fillStyle = pStyle.bg;
      ctx.strokeStyle = pStyle.border;
      ctx.lineWidth = 1 * scale;
      ctx.fillRect(stX, stY, 185 * scale, 150 * scale);
      ctx.strokeRect(stX, stY, 185 * scale, 150 * scale);

      ctx.fillStyle = pStyle.text === "#0f172a" ? "#0284c7" : "#38bdf8";
      ctx.font = `bold ${8.5 * scale}px ${mapFontFamily}`;
      ctx.fillText("MAP DESCRIPTIVE STATISTICS", stX + 8 * scale, stY + 14 * scale);

      ctx.fillStyle = pStyle.text;
      ctx.font = `${7.5 * scale}px ${mapFontFamily}`;
      ctx.fillText(`Total Samples (N): ${stats.total}`, stX + 8 * scale, stY + 28 * scale);
      ctx.fillText(`Above Permissible Limit: ${stats.exceeding}`, stX + 8 * scale, stY + 41 * scale);
      ctx.fillText(`% Above Permissible Limit: ${stats.percentage}%`, stX + 8 * scale, stY + 54 * scale);
      ctx.fillText(`Min Value: ${stats.min} ${activeParamConfig.unit}`, stX + 8 * scale, stY + 67 * scale);
      ctx.fillText(`Max Value: ${stats.max} ${activeParamConfig.unit}`, stX + 8 * scale, stY + 80 * scale);

      const subgroupLabel = stats.subgroupLabel || "States/UTs";
      ctx.fillText(`No. of Partially Affected ${subgroupLabel}: ${stats.affectedCount ?? 0}`, stX + 8 * scale, stY + 93 * scale);
      ctx.fillText(`Affected ${subgroupLabel}:`, stX + 8 * scale, stY + 106 * scale);

      ctx.font = `italic ${7.5 * scale}px ${mapFontFamily}`;
      const nameString = stats.affectedNamesList || "-";

      // Wrap nameString to fit within 170px width
      const maxWidth = 170 * scale;
      const words = nameString.split(", ");
      let line = "";
      let lineY = stY + 118 * scale;
      let lineCount = 0;

      for (let i = 0; i < words.length; i++) {
        const testLine = line + (line ? ", " : "") + words[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line, stX + 8 * scale, lineY);
          line = words[i];
          lineY += 11 * scale;
          lineCount++;
          if (lineCount >= 2) {
            ctx.fillText(line + "...", stX + 8 * scale, lineY);
            line = "";
            break;
          }
        } else {
          line = testLine;
        }
      }
      if (line) {
        ctx.fillText(line, stX + 8 * scale, lineY);
      }
      ctx.restore();
    }

    // 11. Header Title Frame suitable for official yearbooks (Positionable and Relocatable)
    if (titlePos !== "none") {
      const displayTitle = useSubtitleAsTitle ? subtitleStr : titleStr;
      const displaySubtitle = useSubtitleAsTitle ? "" : subtitleStr;

      const paddingY = 8;
      const titleHeight = mapTitleSize;
      const subtitleHeight = displaySubtitle ? mapSubtitleSize : 0;
      const spacing = displaySubtitle ? titleLineSpacing : 0;
      const tH = (paddingY * 2 + titleHeight + spacing + subtitleHeight) * scale;

      let tW = mw - 20 * scale;
      let tX = margin + 10 * scale;
      let tY = margin + 10 * scale;

      if (titlePos === "top-center") {
        tX = margin + 10 * scale;
        tY = margin + 10 * scale;
        tW = mw - 20 * scale;
      } else if (titlePos === "top-left") {
        tX = margin + 10 * scale;
        tY = margin + 10 * scale;
        tW = mw * 0.6;
      } else if (titlePos === "top-right") {
        tX = w - margin - mw * 0.6 - 10 * scale;
        tY = margin + 10 * scale;
        tW = mw * 0.6;
      } else if (titlePos === "bottom-center") {
        tX = margin + 10 * scale;
        tY = h - margin - tH - 10 * scale;
        tW = mw - 20 * scale;
      } else if (titlePos === "bottom-left") {
        tX = margin + 10 * scale;
        tY = h - margin - tH - 10 * scale;
        tW = mw * 0.6;
      } else if (titlePos === "bottom-right") {
        tX = w - margin - mw * 0.6 - 10 * scale;
        tY = h - margin - tH - 10 * scale;
        tW = mw * 0.6;
      }

      // Apply Precise Position Offsets (User adjustable fine element positioning)
      tX += titleOffsetX * scale;
      tY += titleOffsetY * scale;

      ctx.save();
      ctx.fillStyle = pStyle.bg;
      ctx.strokeStyle = pStyle.border;
      ctx.lineWidth = 1 * scale;
      ctx.fillRect(tX, tY, tW, tH);
      ctx.strokeRect(tX, tY, tW, tH);

      ctx.save();
      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      
      const titleDrawY = tY + paddingY * scale;
      ctx.font = `${mapTitleBold ? "bold" : "normal"} ${mapTitleSize * scale}px ${mapFontFamily}`;
      draw3dText(ctx, displayTitle, tX + tW / 2, titleDrawY, mapTitle3dEffect, mapTitleColor, scale);

      if (displaySubtitle) {
        const subtitleDrawY = titleDrawY + (mapTitleSize + titleLineSpacing) * scale;
        ctx.font = `${mapSubtitleSize * scale}px ${mapFontFamily}`;
        draw3dText(ctx, displaySubtitle, tX + tW / 2, subtitleDrawY, mapSubtitle3dEffect, mapSubtitleColor, scale);
      }
      ctx.restore();
      ctx.restore();
    }

    // 12. Render Shapefile / GeoJSON Feature Labels (Deduplicated - skip layers already labeled in Section 4)
    if (showShapefileLabels && layers.length === 0 && effectiveClipGeoJson) {
      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = shapefileLabelColor;
      ctx.font = `${adminLabelItalic ? "italic " : ""}${adminLabelWeight} ${shapefileLabelSize * scale}px "${adminLabelFontFamily}", sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      const features = effectiveClipGeoJson.features || 
                       (effectiveClipGeoJson.type === "Feature" ? [effectiveClipGeoJson] : []);

      features.forEach((f: any, idx: number) => {
        if (!f || !f.properties) return;
        if (!featureMatchesSelection(f, selectedState, selectedDistrict, districtStateMap)) return;
        if (!showNeighbourLabels && !isStateAll(selectedState)) {
          const p = f.properties;
          const fState = String(p.state || p.STATE || p.State || p.ST_NM || p.st_nm || p.NAME_1 || p.state_name || "").trim();
          const fDist = String(p.district || p.DISTRICT || p.District || p.NAME_2 || p.DT_NM || p.dist_name || "").trim();
          const selNorm = norm(selectedState || "");
          if (fState) {
            const fs = norm(fState);
            if (fs !== selNorm && !fs.includes(selNorm) && !selNorm.includes(fs)) return;
          } else if (fDist && districtStateMap) {
            const mapped = districtStateMap[fDist.toLowerCase()] || districtStateMap[norm(fDist)] || districtStateMap[fDist];
            if (mapped && norm(mapped) !== selNorm && !norm(mapped).includes(selNorm)) return;
          }
        }
        const textVal = String(f.properties[shapefileLabelKey] || "");
        if (!textVal || textVal.trim().toLowerCase() === "india") return;
        if (drawnAttributeLabelsAcrossLayers.has(norm(textVal))) return;
        drawnAttributeLabelsAcrossLayers.add(norm(textVal));

        let lng = 0, lat = 0;
        const customPos = (customLabelPositions as any)[idx];
        if (customPos) {
          lng = customPos.lng;
          lat = customPos.lat;
        } else {
          const centroid = getPolygonCentroid(f.geometry?.coordinates);
          if (centroid) {
            lng = centroid.lng;
            lat = centroid.lat;
          } else {
            return;
          }
        }

        const px = getX(lng);
        const py = getY(lat);

        if (px >= margin && px <= w - margin && py >= margin && py <= h - margin) {
          ctx.fillText(textVal, px, py);
        }
      });
      ctx.restore();
    }
  };

  // Fast linear solver for systems of equations (Gaussian Elimination with partial pivoting)
  const solveLinearSystem = (A: number[][], B: number[]): number[] | null => {
    const n = B.length;
    for (let i = 0; i < n; i++) {
      let maxEl = Math.abs(A[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > maxEl) {
          maxEl = Math.abs(A[k][i]);
          maxRow = k;
        }
      }
      for (let k = i; k < n; k++) {
        const tmp = A[maxRow][k];
        A[maxRow][k] = A[i][k];
        A[i][k] = tmp;
      }
      const tmp = B[maxRow];
      B[maxRow] = B[i];
      B[i] = tmp;

      if (Math.abs(A[i][i]) < 1e-12) {
        return null;
      }

      for (let k = i + 1; k < n; k++) {
        const c = -A[k][i] / A[i][i];
        for (let j = i; j < n; j++) {
          if (i === j) {
            A[k][j] = 0;
          } else {
            A[k][j] += c * A[i][j];
          }
        }
        B[k] += c * B[i];
      }
    }

    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = B[i] / A[i][i];
      for (let k = i - 1; k >= 0; k--) {
        B[k] -= A[k][i] * x[i];
      }
    }
    return x;
  };

  // Theoretical semivariogram modeling function matching ArcGIS Geostatistical Analyst formulations
  const evaluateSemivariogram = (
    d: number, 
    model: "spherical" | "exponential" | "gaussian", 
    nugget: number, 
    sill: number, 
    range: number
  ): number => {
    if (d <= 1e-6) return 0;
    const partialSill = Math.max(0, sill - nugget);
    if (model === "spherical") {
      if (d <= range) {
        return nugget + partialSill * (1.5 * (d / range) - 0.5 * Math.pow(d / range, 3));
      }
      return sill;
    } else if (model === "exponential") {
      return nugget + partialSill * (1 - Math.exp(-3 * d / range));
    } else { // gaussian
      return nugget + partialSill * (1 - Math.exp(-3 * Math.pow(d / range, 2)));
    }
  };

  // Radial Basis Function Kernel Evaluations
  const evaluateRbfKernel = (r: number, kernel: "multiquadric" | "inverse-multiquadric" | "thin-plate-spline" | "gaussian", c: number): number => {
    const eps = 1e-9;
    if (kernel === "multiquadric") {
      return Math.sqrt(r * r + c * c);
    } else if (kernel === "inverse-multiquadric") {
      return 1 / Math.sqrt(r * r + c * c);
    } else if (kernel === "thin-plate-spline") {
      if (r < eps) return 0;
      return r * r * Math.log(r);
    } else { // gaussian
      return Math.exp(- (r * r) / (c * c + eps));
    }
  };

  // Quick safety check to avoid division-by-zero or singular matrices if the point is co-located with a sample point
  const distsAndNeighborsFastCheck = (pts: { d: number; pt: { val: number } }[], lat: number, lng: number): boolean => {
    return pts.length > 0 && pts[0].d < 0.05;
  };  // Background-Worker Powered Left Panel Interpolation Grid
  useEffect(() => {
    if (!isInterpolatedType) {
      setLeftInterpolatedGrid(null);
      return;
    }

    const paramCol = headerMap[selectedParam] || selectedParam;
    const pts = (isComparisonActive ? leftPanelData : parsedData).map(d => {
      const val = parseFloat(d[paramCol]);
      return { lat: d.lat, lng: d.lng, val };
    }).filter(p => !isNaN(p.val));

    if (pts.length === 0) {
      setLeftInterpolatedGrid(null);
      return;
    }

    const rawColStep = gridSmoothingRes * gridResolutionMultiplier;
    let colStep = isDragging ? Math.min(25, Math.round(rawColStep / 6)) : rawColStep;
    const rowStep = Math.round(colStep * (baseMapExtent.finalLatSpan / baseMapExtent.finalLngSpan));

    const delay = isDragging ? 50 : 200;
    let activeWorker: Worker | null = null;
    let revokeWorkerUrl: (() => void) | null = null;

    const timer = setTimeout(() => {
      setIsLeftLoading(true);
      const { worker, revoke } = createInterpolationWorker();
      activeWorker = worker;
      revokeWorkerUrl = revoke;
      worker.onmessage = (e) => {
        setLeftInterpolatedGrid({ grid: e.data.grid, colStep, rowStep });
        setIsLeftLoading(false);
        worker.terminate();
        revoke();
        activeWorker = null;
      };
      worker.onerror = (err) => {
        console.error("Left Interpolation Worker failed:", err);
        setIsLeftLoading(false);
        worker.terminate();
        revoke();
        activeWorker = null;
      };
      worker.postMessage({
        validPoints: pts,
        rowStep,
        colStep,
        baseMapExtent,
        clippingRadius,
        extendInterpolationToBoundary,
        interpolationMethod,
        idwPower,
        useAllPoints,
        searchRadius,
        krigingModel,
        krigingNugget,
        krigingSill,
        krigingRange,
        krigingNeighbors,
        rbfKernel,
        rbfParameter,
        enableGaussianSmoothing,
        enableAnisotropy,
        anisotropyAngle,
        anisotropyRatio
      });
    }, delay);

    return () => {
      clearTimeout(timer);
      if (activeWorker) {
        activeWorker.terminate();
        activeWorker = null;
      }
      if (revokeWorkerUrl) {
        revokeWorkerUrl();
        revokeWorkerUrl = null;
      }
    };
  }, [
    selectedParam, parsedData, leftPanelData, isComparisonActive, isInterpolatedType,
    baseMapExtent, gridSmoothingRes, gridResolutionMultiplier, searchRadius, clippingRadius,
    idwPower, extendInterpolationToBoundary, interpolationMethod, isDragging, useAllPoints,
    krigingModel, krigingNugget, krigingSill, krigingRange, krigingNeighbors, rbfKernel, rbfParameter,
    enableGaussianSmoothing, enableAnisotropy, anisotropyAngle, anisotropyRatio,
    interpolationTrigger
  ]);

  // Background-Worker Powered Right Panel Interpolation Grid
  useEffect(() => {
    if (!isInterpolatedType || !isComparisonActive) {
      setRightInterpolatedGrid(null);
      return;
    }

    const paramCol = headerMap[selectedParam] || selectedParam;
    let validPoints: { lat: number; lng: number; val: number }[] = [];
    if (showDifferenceMap) {
      leftPanelData.forEach(postPt => {
        const postVal = parseFloat(postPt[paramCol]);
        if (isNaN(postVal)) return;

        let bestPre: typeof postPt | null = null;
        let minDist = Infinity;
        rightPanelData.forEach(prePt => {
          const preVal = parseFloat(prePt[paramCol]);
          if (isNaN(preVal)) return;

          const dist = Math.sqrt((prePt.lat - postPt.lat) ** 2 + (prePt.lng - postPt.lng) ** 2);
          if (dist < minDist) {
            minDist = dist;
            bestPre = prePt;
          }
        });

        if (bestPre) {
          const diffVal = postVal - parseFloat((bestPre as any)[paramCol]);
          if (!isNaN(diffVal)) {
            validPoints.push({ lat: postPt.lat, lng: postPt.lng, val: diffVal });
          }
        }
      });
    } else {
      validPoints = rightPanelData.map(d => {
        const val = parseFloat(d[paramCol]);
        return { lat: d.lat, lng: d.lng, val };
      }).filter(p => !isNaN(p.val));
    }

    if (validPoints.length === 0) {
      setRightInterpolatedGrid(null);
      return;
    }

    const rawColStep = gridSmoothingRes * gridResolutionMultiplier;
    let colStep = isDragging ? Math.min(25, Math.round(rawColStep / 6)) : rawColStep;
    const rowStep = Math.round(colStep * (baseMapExtent.finalLatSpan / baseMapExtent.finalLngSpan));

    const delay = isDragging ? 50 : 200;
    let activeWorker: Worker | null = null;
    let revokeWorkerUrl: (() => void) | null = null;

    const timer = setTimeout(() => {
      setIsRightLoading(true);
      const { worker, revoke } = createInterpolationWorker();
      activeWorker = worker;
      revokeWorkerUrl = revoke;
      worker.onmessage = (e) => {
        setRightInterpolatedGrid({ grid: e.data.grid, colStep, rowStep });
        setIsRightLoading(false);
        worker.terminate();
        revoke();
        activeWorker = null;
      };
      worker.onerror = (err) => {
        console.error("Right Interpolation Worker failed:", err);
        setIsRightLoading(false);
        worker.terminate();
        revoke();
        activeWorker = null;
      };
      worker.postMessage({
        validPoints,
        rowStep,
        colStep,
        baseMapExtent,
        clippingRadius,
        extendInterpolationToBoundary,
        interpolationMethod,
        idwPower,
        useAllPoints,
        searchRadius,
        krigingModel,
        krigingNugget,
        krigingSill,
        krigingRange,
        krigingNeighbors,
        rbfKernel,
        rbfParameter,
        enableGaussianSmoothing,
        enableAnisotropy,
        anisotropyAngle,
        anisotropyRatio
      });
    }, delay);

    return () => {
      clearTimeout(timer);
      if (activeWorker) {
        activeWorker.terminate();
        activeWorker = null;
      }
      if (revokeWorkerUrl) {
        revokeWorkerUrl();
        revokeWorkerUrl = null;
      }
    };
  }, [
    selectedParam, parsedData, rightPanelData, leftPanelData, isComparisonActive, showDifferenceMap, isInterpolatedType,
    baseMapExtent, gridSmoothingRes, gridResolutionMultiplier, searchRadius, clippingRadius,
    idwPower, extendInterpolationToBoundary, interpolationMethod, isDragging, useAllPoints,
    krigingModel, krigingNugget, krigingSill, krigingRange, krigingNeighbors, rbfKernel, rbfParameter,
    enableGaussianSmoothing, enableAnisotropy, anisotropyAngle, anisotropyRatio,
    interpolationTrigger
  ]);

  // Difference matrix mapping helper
  const differenceMatrix = useMemo(() => {
    if (!isComparisonActive) return null;
    return null; // Using direct point diffs or raster logic
  }, [isComparisonActive]);

  // Redraw hook
  useEffect(() => {
    if (!isVisible) return;

    const timeout = setTimeout(() => {
      // Use getDpr to dynamically balance crispness vs mobile memory constraints
      const dpr = getDpr();

      if (canvasRefLeft.current) {
        const canvas = canvasRefLeft.current;
        canvas.width = canvasWidth * dpr;
        canvas.height = canvasHeight * dpr;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const title = customTitle || getMapDefaultTitleAndSubtitle("left").title;
          const subtitle = customSubtitle || getMapDefaultTitleAndSubtitle("left").subtitle;
          drawMapInstance(
            ctx,
            canvas.width,
            canvas.height,
            dpr,
            isComparisonActive ? leftPanelData : parsedData,
            title,
            subtitle,
            isComparisonActive ? leftStats : (leftStats || rightStats),
            false,
            null,
            "left"
          );
        }
      }

      if (canvasRefRight.current && isComparisonActive) {
        const canvas = canvasRefRight.current;
        canvas.width = canvasWidth * dpr;
        canvas.height = canvasHeight * dpr;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const title = customTitle 
            ? `${customTitle} (Post-Monsoon)` 
            : (showDifferenceMap 
              ? `Seasonal Quality Difference Map (Post − Pre)`
              : getMapDefaultTitleAndSubtitle("right").title);
          const subtitle = customSubtitle || (showDifferenceMap
            ? `Chemical concentration change dynamics`
            : getMapDefaultTitleAndSubtitle("right").subtitle);

          drawMapInstance(
            ctx,
            canvas.width,
            canvas.height,
            dpr,
            rightPanelData,
            title,
            subtitle,
            rightStats,
            showDifferenceMap,
            differenceMatrix,
            "right"
          );
        }
      }
    }, 120);

    return () => clearTimeout(timeout);
  }, [
    isVisible,
    parsedData,
    selectedParam,
    basemap,
    projection,
    utmZone,
    canvasWidth,
    canvasHeight,
    sheetLayout,
    interpolationMethod,
    idwPower,
    gridSmoothingRes,
    searchRadius,
    clippingRadius,
    smoothBlending,
    classificationMode,
    colorScheme,
    symbolType,
    symbolSize,
    symbolBorderColor,
    symbolBorderSize,
    symbolOpacity,
    showRaster,
    showPoints,
    showGrid,
    showLabels,
    rasterOpacity,
    basemapOpacity,
    mapFontFamily,
    mapTitleSize,
    mapTitleColor,
    mapTitleBold,
    northArrowType,
    northArrowSize,
    northArrowPos,
    showScaleBar,
    scaleBarUnit,
    gridInterval,
    gridColor,
    gridOpacity,
    legendPos,
    legendBgOpacity,
    showStatsPanel,
    statsPanelPos,
    showAgencyLogo,
    agencyLogoType,
    agencyLogoPos,
    isComparisonActive,
    showDifferenceMap,
    differenceMatrix,
    redrawTilesTrigger,
    uploadedGeoJson,
    effectiveClipGeoJson,
    showShapefile,
    showShapefileInLegend,
    layers,
    shapeStrokeColor,
    shapeStrokeWidth,
    shapeFillColor,
    shapeFillOpacity,
    panelBackgroundStyle,
    zoomScaleFactor,
    customTitle,
    customSubtitle,
    titlePos,
    onlyTransparentPanels,
    extendInterpolationToBoundary,
    mapSubtitleColor,
    legendTextColor,
    titleOffsetX,
    titleOffsetY,
    legendOffsetX,
    legendOffsetY,
    statsOffsetX,
    statsOffsetY,
    northArrowOffsetX,
    northArrowOffsetY,
    fitToShapefile,
    shapefileBounds,
    panOffsetLat,
    panOffsetLng,
    showOnlyExceedingPoints,
    exceedingPointSize,
    showAs3dBubbles,
    bubbleColor,
    colorRange1,
    colorRange2,
    colorRange3,
    colorDiffImproved,
    colorDiffStable,
    colorDiffDeteriorated,
    useSubtitleAsTitle,
    showShapefileLabels,
    shapefileLabelKey,
    shapefileLabelColor,
    shapefileLabelSize,
    customLabelPositions,
    mapSubtitleSize,
    titleLineSpacing,
    scaleBarOffsetX,
    scaleBarOffsetY,
    stationPointColor,
    autoCutAdminToAoi,
    aoiLayerId,
    adminCutMode,
    showAdminNamesOnMap,
    showNeighbourLabels,
    adminLabelAttribute,
    adminLabelSize,
    adminLabelColor,
    adminLabelShowHalo,
    adminLabelFontFamily,
    adminLabelWeight,
    adminLabelItalic
  ]);

  // Fact Sheet map integration is powered directly by high-resolution exports and Fact Sheet's dedicated 2400x1400 engine

  // Vector SVG Exporter (Generates real, clean scalable vector graphic file!)
  const exportToSvgString = (side: "left" | "right") => {
    const { mapMinLng, mapMaxLng, mapMinLat, mapMaxLat, finalLngSpan, finalLatSpan, centerLat } = mapExtent;
    const w = canvasWidth;
    const h = canvasHeight;
    const margin = 55;
    const mw = w - 2 * margin;
    const mh = h - 2 * margin;
    const paramCol = headerMap[selectedParam] || selectedParam;

    // Coordinate converters
    const getX = (lng: number) => {
      const pct = (lng - mapMinLng) / finalLngSpan;
      return margin + pct * mw;
    };
    const getY = (lat: number) => {
      const pct = (lat - mapMinLat) / finalLatSpan;
      return h - margin - pct * mh;
    };

    let svgLabels = "";
    let svgShapefileBoundaries = "";

    if (showShapefile) {
      if (layers.length > 0) {
        layers.forEach(layer => {
          if (!layer.visible) return;
          
          const formatPolygonRing = (ring: number[][], customFill: string) => {
            if (ring.length === 0) return "";
            let d = `M ${getX(ring[0][0])} ${getY(ring[0][1])}`;
            for (let i = 1; i < ring.length; i++) {
              d += ` L ${getX(ring[i][0])} ${getY(ring[i][1])}`;
            }
            d += " Z";
            return `<path d="${d}" fill="${customFill}" fill-opacity="${layer.fillOpacity / 100}" stroke="${layer.strokeColor}" stroke-width="${layer.strokeWidth}" />\n`;
          };

          const formatFeatureGeometry = (geom: any, f: any): string => {
            if (!geom) return "";
            const customFill = getFeatureFillColor(layer, f);
            let paths = "";
            if (geom.type === "Polygon") {
              geom.coordinates.forEach((ring: number[][]) => {
                paths += formatPolygonRing(ring, customFill);
              });
            } else if (geom.type === "MultiPolygon") {
              geom.coordinates.forEach((poly: number[][][]) => {
                poly.forEach((ring: number[][]) => {
                  paths += formatPolygonRing(ring, customFill);
                });
              });
            } else if (geom.type === "GeometryCollection") {
              geom.geometries?.forEach((g: any) => {
                paths += formatFeatureGeometry(g, f);
              });
            }
            return paths;
          };

          const gj = layer.geoJson;
          if (gj) {
            svgShapefileBoundaries += `  <!-- Layer: ${layer.name} -->\n  <g id="layer-${layer.id}">\n`;
            if (gj.type === "FeatureCollection") {
              gj.features?.forEach((f: any) => {
                svgShapefileBoundaries += formatFeatureGeometry(f.geometry, f);
              });
            } else if (gj.type === "Feature") {
              svgShapefileBoundaries += formatFeatureGeometry(gj.geometry, gj);
            } else {
              svgShapefileBoundaries += formatFeatureGeometry(gj, null);
            }
            svgShapefileBoundaries += "  </g>\n";
          }
        });
      } else if (effectiveClipGeoJson && uploadedGeoJson) {
        // Fallback
        const formatPolygonRing = (ring: number[][]) => {
          if (ring.length === 0) return "";
          let d = `M ${getX(ring[0][0])} ${getY(ring[0][1])}`;
          for (let i = 1; i < ring.length; i++) {
            d += ` L ${getX(ring[i][0])} ${getY(ring[i][1])}`;
          }
          d += " Z";
          return `<path d="${d}" fill="${shapeFillColor}" fill-opacity="${shapeFillOpacity / 100}" stroke="${shapeStrokeColor}" stroke-width="${shapeStrokeWidth}" />\n`;
        };

        const formatFeatureGeometry = (geom: any): string => {
          if (!geom) return "";
          let paths = "";
          if (geom.type === "Polygon") {
            geom.coordinates.forEach((ring: number[][]) => {
              paths += formatPolygonRing(ring);
            });
          } else if (geom.type === "MultiPolygon") {
            geom.coordinates.forEach((poly: number[][][]) => {
              poly.forEach((ring: number[][]) => {
                paths += formatPolygonRing(ring);
              });
            });
          } else if (geom.type === "GeometryCollection") {
            geom.geometries?.forEach((g: any) => {
              paths += formatFeatureGeometry(g);
            });
          }
          return paths;
        };

        svgShapefileBoundaries += `  <g id="fallback-shapefile-boundaries">\n`;
        if (effectiveClipGeoJson.type === "FeatureCollection") {
          effectiveClipGeoJson.features?.forEach((f: any) => {
            svgShapefileBoundaries += formatFeatureGeometry(f.geometry);
          });
        } else if (effectiveClipGeoJson.type === "Feature") {
          svgShapefileBoundaries += formatFeatureGeometry(effectiveClipGeoJson.geometry);
        } else {
          svgShapefileBoundaries += formatFeatureGeometry(effectiveClipGeoJson);
        }
        svgShapefileBoundaries += "  </g>\n";
      }
    }

    if (showShapefileLabels || (autoCutAdminToAoi && aoiLayerId && showAdminNamesOnMap)) {
      if (layers.length > 0) {
        layers.forEach(layer => {
          const shouldAutoCut = autoCutAdminToAoi && Boolean(aoiLayerId) && layer.id !== aoiLayerId;
          const isLabelActive = shouldAutoCut ? showAdminNamesOnMap : (layer.showLabels && showShapefileLabels);
          if (!layer.visible || !isLabelActive) return;
          const gj = layer.geoJson;
          if (gj) {
            const features = (shouldAutoCut && clippedFeaturesMap[layer.id])
              ? clippedFeaturesMap[layer.id]
              : (gj.features || (gj.type === "Feature" ? [gj] : []));
            features.forEach((f: any, idx: number) => {
              if (!f || !f.properties) return;
              const textVal = shouldAutoCut 
                ? getFeatureAttributeLabel(f, adminLabelAttribute, layer.labelKey)
                : String(f.properties[layer.labelKey] || "");
              if (!textVal || textVal.trim().toLowerCase() === "india" || textVal === "Unit") return;

              let lng = 0, lat = 0;
              const customPos = customLabelPositions[layer.id]?.[idx];
              if (customPos) {
                lng = customPos.lng;
                lat = customPos.lat;
              } else {
                const centroid = getPolygonCentroid(f.geometry?.coordinates);
                if (centroid) {
                  lng = centroid.lng;
                  lat = centroid.lat;
                } else {
                  return;
                }
              }

              const px = getX(lng);
              const py = getY(lat);

              if (px >= margin && px <= w - margin && py >= margin && py <= h - margin) {
                const activeSize = shouldAutoCut ? adminLabelSize : (layer.labelSize || 11);
                const activeColor = shouldAutoCut ? adminLabelColor : (layer.labelColor || "#1e293b");
                const activeWeight = shouldAutoCut ? adminLabelWeight : "bold";
                svgLabels += `    <text x="${px}" y="${py}" font-size="${activeSize}" font-weight="${activeWeight}" fill="${activeColor}" text-anchor="middle" dominant-baseline="middle">${textVal}</text>\n`;
              }
            });
          }
        });
      } else if (effectiveClipGeoJson) {
        const features = effectiveClipGeoJson.features || 
                         (effectiveClipGeoJson.type === "Feature" ? [effectiveClipGeoJson] : []);
        features.forEach((f: any, idx: number) => {
          if (!f || !f.properties) return;
          const textVal = String(f.properties[shapefileLabelKey] || "");
          if (!textVal || textVal.trim().toLowerCase() === "india") return;

          let lng = 0, lat = 0;
          const customPos = (customLabelPositions as any)[idx];
          if (customPos) {
            lng = customPos.lng;
            lat = customPos.lat;
          } else {
            const centroid = getPolygonCentroid(f.geometry?.coordinates);
            if (centroid) {
              lng = centroid.lng;
              lat = centroid.lat;
            } else {
              return;
            }
          }

          const px = getX(lng);
          const py = getY(lat);

          if (px >= margin && px <= w - margin && py >= margin && py <= h - margin) {
            svgLabels += `    <text x="${px}" y="${py}" font-size="${shapefileLabelSize}" fill="${shapefileLabelColor}" text-anchor="middle" dominant-baseline="middle">${textVal}</text>\n`;
          }
        });
      }
    }

    const isDiff = side === "right" && showDifferenceMap;
    const data = side === "left" ? (isComparisonActive ? leftPanelData : parsedData) : rightPanelData;
    const titleStr = side === "left" 
      ? (customTitle || getMapDefaultTitleAndSubtitle("left").title) 
      : (showDifferenceMap ? "Seasonal Quality Difference (Post - Pre)" : (customTitle ? `${customTitle} (Post-Monsoon)` : getMapDefaultTitleAndSubtitle("right").title));
    const subtitleStr = side === "left"
      ? (customSubtitle || getMapDefaultTitleAndSubtitle("left").subtitle)
      : (showDifferenceMap ? "Seasonal concentration shift dynamics" : (customSubtitle || getMapDefaultTitleAndSubtitle("right").subtitle));

    let rasterRects = "";
    if (showRaster && isInterpolatedType) {
      const cacheObj = side === "left" ? leftInterpolatedGrid : rightInterpolatedGrid;
      if (cacheObj) {
        const { grid, colStep, rowStep } = cacheObj;
        for (let r = 0; r < rowStep; r++) {
          const cellLatMin = baseMapExtent.mapMinLat + (r / rowStep) * baseMapExtent.finalLatSpan;
          const cellLatMax = baseMapExtent.mapMinLat + ((r + 1) / rowStep) * baseMapExtent.finalLatSpan;
          for (let c = 0; c < colStep; c++) {
            const val = grid[r][c];
            if (isNaN(val)) continue;

            const cellLngMin = baseMapExtent.mapMinLng + (c / colStep) * baseMapExtent.finalLngSpan;
            const cellLngMax = baseMapExtent.mapMinLng + ((c + 1) / colStep) * baseMapExtent.finalLngSpan;

            const xMin = getX(cellLngMin);
            const xMax = getX(cellLngMax);
            const yMin = getY(cellLatMax);
            const yMax = getY(cellLatMin);

            const drawW = Math.max(0.1, xMax - xMin);
            const drawH = Math.max(0.1, yMax - yMin);

            const fill = getValueColor(val, isDiff);
            rasterRects += `    <rect x="${xMin - 0.2}" y="${yMin - 0.2}" width="${drawW + 0.4}" height="${drawH + 0.4}" fill="${fill}" />\n`;
          }
        }
      }
    }

    // Now, render the vector points as true SVG `<circle>` nodes!
    let pointElements = "";
    if (showPoints && !isDiff) {
      data.forEach(pt => {
        const val = parseFloat(pt[paramCol]);
        if (isNaN(val)) return;

        const exceedLimit = paramConfig.b2;
        if (showOnlyExceedingPoints && val <= exceedLimit) return;

        const px = getX(pt.lng);
        const py = getY(pt.lat);
        if (px < margin || px > w - margin || py < margin || py > h - margin) return;

        const rad = showOnlyExceedingPoints ? exceedingPointSize * 10 : symbolSize / 2;
        const fill = showOnlyExceedingPoints ? bubbleColor : getValueColor(val, false, undefined, true);
        const stroke = showOnlyExceedingPoints ? "none" : symbolBorderColor;
        const strokeW = showOnlyExceedingPoints ? "0" : symbolBorderSize;

        if (symbolType === "square") {
          pointElements += `    <rect x="${px - rad}" y="${py - rad}" width="${rad * 2}" height="${rad * 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" opacity="${symbolOpacity / 100}" />\n`;
        } else {
          pointElements += `    <circle cx="${px}" cy="${py}" r="${rad}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" opacity="${symbolOpacity / 100}" />\n`;
        }
      });
    }

    // Let's draw the grid lines as true vector elements!
    let gridLines = "";
    if (showGrid) {
      const minLngInterval = Math.ceil(mapMinLng / gridInterval) * gridInterval;
      for (let lng = minLngInterval; lng <= mapMaxLng; lng += gridInterval) {
        const x = getX(lng);
        if (x >= margin && x <= w - margin) {
          gridLines += `    <line x1="${x}" y1="${margin}" x2="${x}" y2="${h - margin}" stroke="${gridColor}" stroke-width="0.5" opacity="${gridOpacity / 100}" />\n`;
          gridLines += `    <text x="${x}" y="${h - margin + 14}" font-size="8" text-anchor="middle" fill="#334155">${lng.toFixed(1)}°E</text>\n`;
        }
      }
      const minLatInterval = Math.ceil(mapMinLat / gridInterval) * gridInterval;
      for (let lat = minLatInterval; lat <= mapMaxLat; lat += gridInterval) {
        const y = getY(lat);
        if (y >= margin && y <= h - margin) {
          gridLines += `    <line x1="${margin}" y1="${y}" x2="${w - margin}" y2="${y}" stroke="${gridColor}" stroke-width="0.5" opacity="${gridOpacity / 100}" />\n`;
          gridLines += `    <text x="${margin - 8}" y="${y + 3}" font-size="8" text-anchor="end" fill="#334155">${lat.toFixed(1)}°N</text>\n`;
        }
      }
    }

    const pStyle = {
      bg: panelBackgroundStyle.includes("transparent") ? "rgba(255, 255, 255, 0)" : (panelBackgroundStyle.includes("glass") ? "rgba(255, 255, 255, 0.82)" : "rgba(255, 255, 255, 0.98)"),
      border: panelBackgroundStyle.includes("transparent") ? "rgba(0,0,0,0)" : "#cbd5e1",
      text: legendTextColor
    };

    let legendWidthVal = legendWidth;
    const visibleLayers = layers.filter(l => l.visible);

    const shapefileLegendItems: { color: string; label: string; fillOpacity: number; showStroke: boolean; strokeColor: string; strokeWidth: number }[] = [];
    if (showShapefile && showShapefileInLegend) {
      if (visibleLayers.length > 0) {
        visibleLayers.forEach((layer) => {
          if (layer.showInLegend === false) return;
          if (layer.colorAttribute && layer.colorMapping && Object.keys(layer.colorMapping).length > 0) {
            Object.keys(layer.colorMapping).forEach((attrValue) => {
              shapefileLegendItems.push({
                color: layer.colorMapping[attrValue],
                label: attrValue,
                fillOpacity: layer.fillOpacity || 15,
                showStroke: layer.showStroke !== false,
                strokeColor: layer.strokeColor,
                strokeWidth: layer.strokeWidth || 2.0,
              });
            });
          } else {
            const label = getBoundaryLegendLabel(layer.geoJson) || layer.name;
            shapefileLegendItems.push({
              color: layer.fillColor,
              label: label,
              fillOpacity: layer.fillOpacity || 15,
              showStroke: layer.showStroke !== false,
              strokeColor: layer.strokeColor,
              strokeWidth: layer.strokeWidth || 2.0,
            });
          }
        });
      } else if (uploadedGeoJson) {
        const label = getBoundaryLegendLabel(uploadedGeoJson) || "Boundary";
        shapefileLegendItems.push({
          color: shapeFillColor,
          label: label,
          fillOpacity: shapeFillOpacity || 15,
          showStroke: showGlobalShapefileOutline,
          strokeColor: shapeStrokeColor,
          strokeWidth: shapeStrokeWidth || 2.0,
        });
      }
    }

    let extraBoundaryHeight = 0;
    if (showShapefile && showShapefileInLegend && shapefileLegendItems.length > 0) {
      const numShapefileRows = Math.ceil(shapefileLegendItems.length / shapefileLegendColumns);
      extraBoundaryHeight = numShapefileRows * shapefileLegendSpacing;
    }

    if (showShapefile && showShapefileInLegend && shapefileLegendColumns > 1 && legendWidthVal < 240) {
      legendWidthVal = 240;
    }
    const legendWidthFinal = legendWidthVal;

    const isStations = selectedParam === "STATIONS";

    let classCount = 3;
    if (!isStations && !(showPoints && showOnlyExceedingPoints && !isDiff)) {
      if (isDiff) {
        classCount = 3;
      } else {
        classCount = interpolationClasses;
      }
    }
    const numClassRows = isStations || (showPoints && showOnlyExceedingPoints && !isDiff)
      ? 2
      : Math.ceil(classCount / legendColumns);

    const legendHeight = Math.max(95, 95 + (numClassRows - 3) * legendRowSpacing + extraBoundaryHeight + (isStations ? 10 : 0));

    // Legend panel vector representation
    let legX = w - margin - (legendWidthFinal + 15);
    let legY = h - margin - (legendHeight + 15);
    if (legendPos === "top-left") { legX = margin + 15; legY = margin + 15; }
    else if (legendPos === "top-right") { legX = w - margin - (legendWidthFinal + 15); legY = margin + 15; }
    else if (legendPos === "bottom-left") { legX = margin + 15; legY = h - margin - (legendHeight + 15); }

    legX += legendOffsetX;
    legY += legendOffsetY;

    const displayParamName = getParamDisplayName(selectedParam);
    let legendSub = "";
    if (isStations) {
      legendSub = `<text x="${legX + 8}" y="${legY + 23}" font-size="${legendSubtitleSize}" font-style="italic" fill="${legendTextColor}">Monitoring Stations</text>`;
    } else {
      legendSub = `<text x="${legX + 8}" y="${legY + 23}" font-size="${legendSubtitleSize}" font-style="italic" fill="${legendTextColor}">${displayParamName}</text>`;
    }

    let legendItems = legendSub;
    if (isStations) {
      legendItems += `
        <circle cx="${legX + 16}" cy="${legY + 45}" r="5.5" fill="${stationPointColor}" stroke="#ffffff" stroke-width="0.8" />
        <text x="${legX + 10 + legendBoxWidth + 6}" y="${legY + 41}" font-size="${legendFontSize}" font-weight="bold" fill="${legendTextColor}">Ground Water Sampling</text>
        <text x="${legX + 10 + legendBoxWidth + 6}" y="${legY + 51}" font-size="${legendFontSize}" font-weight="bold" fill="${legendTextColor}">Locations (N=${data.length})</text>
      `;
    } else if (showPoints && showOnlyExceedingPoints && !isDiff) {
      legendItems += `
        <circle cx="${legX + 16}" cy="${legY + 45}" r="5.5" fill="${bubbleColor}" />
        <text x="${legX + 10 + legendBoxWidth + 6}" y="${legY + 41}" font-size="${legendFontSize}" font-weight="bold" fill="${legendTextColor}">Locations Above</text>
        <text x="${legX + 10 + legendBoxWidth + 6}" y="${legY + 51}" font-size="${legendFontSize}" font-weight="bold" fill="${legendTextColor}">Permissible Limit</text>
        <text x="${legX + 10 + legendBoxWidth + 6}" y="${legY + 63}" font-size="${legendFontSize}" fill="#64748b">(Value > ${paramConfig.b2} ${paramConfig.unit})</text>
      `;
    } else {
      const colWidth = (legendWidthFinal - 16) / legendColumns;
      if (isDiff) {
        const diffClasses = [
          { label: "Improved (Post < Pre)", color: colorDiffImproved },
          { label: "No Change (Stable)", color: colorDiffStable },
          { label: "Deteriorated (Post > Pre)", color: colorDiffDeteriorated }
        ];
        diffClasses.forEach((cls, i) => {
          const colIndex = i % legendColumns;
          const rowIndex = Math.floor(i / legendColumns);
          const itemX = legX + (10 + colIndex * colWidth);
          const itemY = legY + (32 + rowIndex * legendRowSpacing);
          legendItems += `
            <rect x="${itemX}" y="${itemY}" width="${legendBoxWidth}" height="${legendBoxHeight}" fill="${cls.color}" />
            <text x="${itemX + legendBoxWidth + 6}" y="${itemY + legendBoxHeight - 0.5}" font-size="${legendFontSize}" fill="${legendTextColor}">${cls.label}</text>
          `;
        });
      } else {
        const { colors: classColors, labels: classLabels } = getClassColorsAndBreaks(paramConfig);
        classLabels.forEach((lbl, i) => {
          const colIndex = i % legendColumns;
          const rowIndex = Math.floor(i / legendColumns);
          const itemX = legX + (10 + colIndex * colWidth);
          const itemY = legY + (32 + rowIndex * legendRowSpacing);
          legendItems += `
            <rect x="${itemX}" y="${itemY}" width="${legendBoxWidth}" height="${legendBoxHeight}" fill="${classColors[i]}" />
            <text x="${itemX + legendBoxWidth + 6}" y="${itemY + legendBoxHeight - 0.5}" font-size="${legendFontSize}" fill="${legendTextColor}">${lbl}</text>
          `;
        });
      }
    }

    if (showShapefile && showShapefileInLegend && shapefileLegendItems.length > 0) {
      let startY = 32 + numClassRows * legendRowSpacing;
      
      let fontStyleStr = "";
      if (shapefileLegendFontStyle === "bold") fontStyleStr = ' font-weight="bold"';
      else if (shapefileLegendFontStyle === "italic") fontStyleStr = ' font-style="italic"';
      else if (shapefileLegendFontStyle === "bold-italic") fontStyleStr = ' font-weight="bold" font-style="italic"';

      const shapefileColWidth = (legendWidthFinal - 16) / shapefileLegendColumns;

      shapefileLegendItems.forEach((item, i) => {
        const colIndex = i % shapefileLegendColumns;
        const rowIndex = Math.floor(i / shapefileLegendColumns);
        const itemX = legX + (10 + colIndex * shapefileColWidth);
        const itemY = legY + (startY + rowIndex * shapefileLegendSpacing);

        legendItems += `
          <rect x="${itemX}" y="${itemY}" width="${legendBoxWidth}" height="${legendBoxHeight}" fill="${item.color}" fill-opacity="${item.fillOpacity / 100}" stroke="${item.showStroke ? item.strokeColor : 'none'}" stroke-width="${item.showStroke ? Math.max(1, item.strokeWidth * 0.5) : 0}" />
          <text x="${itemX + legendBoxWidth + 6}" y="${itemY + legendBoxHeight - 0.5}" font-size="${shapefileLegendFontSize}" font-family="${shapefileLegendFontFamily}" fill="${shapefileLegendTextColor}"${fontStyleStr}>${item.label}</text>
        `;
      });
    }

    let scaleBarElement = "";
    if (showScaleBar) {
      const widthKm = finalLngSpan * 111 * Math.cos(centerLat * Math.PI / 180);
      const pxPerKm = mw / widthKm;
      const roundDivisions = [1, 2, 5, 10, 25, 50, 100, 200, 500];
      const targetKmRaw = 120 / pxPerKm;
      const targetKm = roundDivisions.reduce((prev, curr) => 
        Math.abs(curr - targetKmRaw) < Math.abs(prev - targetKmRaw) ? curr : prev
      );
      const scaleW = targetKm * pxPerKm;
      const scaleX = margin + 15 + scaleBarOffsetX;
      const scaleY = h - margin - 20 + scaleBarOffsetY;

      const bgStroke = pStyle.border;
      const bgFill = pStyle.bg;
      const textCol = pStyle.text;

      const segmentFill1 = textCol === "#ffffff" ? "#cbd5e1" : "#000000";
      const segmentFill2 = textCol === "#ffffff" ? "#334155" : "#ffffff";

      scaleBarElement = `
    <!-- Dynamic Positionable Scale Bar -->
    <g id="scale-bar">
      <rect x="${scaleX - 5}" y="${scaleY - 18}" width="${scaleW + 25}" height="30" fill="${bgFill}" stroke="${bgStroke}" stroke-width="1" rx="4" />
      <rect x="${scaleX}" y="${scaleY - 5}" width="${scaleW / 2}" height="5" fill="${segmentFill1}" stroke="${textCol}" stroke-width="1.2" />
      <rect x="${scaleX + scaleW / 2}" y="${scaleY - 5}" width="${scaleW / 2}" height="5" fill="${segmentFill2}" stroke="${textCol}" stroke-width="1.2" />
      <text x="${scaleX}" y="${scaleY + 10}" font-size="8" font-weight="bold" fill="${textCol}" text-anchor="middle">0</text>
      <text x="${scaleX + scaleW / 2}" y="${scaleY + 10}" font-size="8" font-weight="bold" fill="${textCol}" text-anchor="middle">${(targetKm / 2).toFixed(0)}</text>
      <text x="${scaleX + scaleW}" y="${scaleY + 10}" font-size="8" font-weight="bold" fill="${textCol}" text-anchor="middle">${targetKm} ${scaleBarUnit.toUpperCase()}</text>
    </g>
      `;
    }

    let northArrowElement = "";
    if (Boolean(northArrowType)) {
      let arrowX = w - margin - 35;
      let arrowY = margin + 45;
      if (northArrowPos === "top-left") { arrowX = margin + 35; arrowY = margin + 45; }
      else if (northArrowPos === "bottom-left") { arrowX = margin + 35; arrowY = h - margin - 55; }
      else if (northArrowPos === "bottom-right") { arrowX = w - margin - 35; arrowY = h - margin - 55; }

      arrowX += northArrowOffsetX;
      arrowY += northArrowOffsetY;
      const rad = northArrowSize / 2;

      northArrowElement = `
    <!-- Dynamic Positionable North Arrow -->
    <g id="north-arrow" transform="translate(${arrowX}, ${arrowY})">
      <circle cx="0" cy="0" r="${rad}" fill="${pStyle.bg}" stroke="${pStyle.border}" stroke-width="1" />
      <!-- Star / Pointer shape -->
      <polygon points="0,${-rad * 0.75} ${rad * 0.25},${rad * 0.25} 0,${rad * 0.1} ${-rad * 0.25},${rad * 0.25}" fill="#ef4444" stroke="#b91c1c" stroke-width="0.8" />
      <polygon points="0,${rad * 0.75} ${rad * 0.2},${-rad * 0.2} 0,${-rad * 0.05} ${-rad * 0.2},${-rad * 0.2}" fill="#cbd5e1" stroke="#475569" stroke-width="0.6" />
      <!-- Text N -->
      <text x="0" y="${-rad * 0.85}" font-size="9" font-weight="bold" fill="#ef4444" text-anchor="middle">N</text>
    </g>
      `;
    }

    const displayTitle = useSubtitleAsTitle ? subtitleStr : titleStr;
    const displaySubtitle = useSubtitleAsTitle ? "" : subtitleStr;

    const paddingY = 8;
    const titleHeight = mapTitleSize;
    const subtitleHeight = displaySubtitle ? mapSubtitleSize : 0;
    const spacing = displaySubtitle ? titleLineSpacing : 0;
    const tH = paddingY * 2 + titleHeight + spacing + subtitleHeight;

    let tW = mw - 20;
    let tX = margin + 10;
    let tY = margin + 10;

    if (titlePos === "bottom-center" || titlePos === "bottom-left" || titlePos === "bottom-right") {
      tY = h - margin - tH - 10;
    }
    if (titlePos === "top-left" || titlePos === "bottom-left") {
      tW = mw * 0.6;
    } else if (titlePos === "top-right" || titlePos === "bottom-right") {
      tX = w - margin - mw * 0.6 - 10;
      tW = mw * 0.6;
    }

    tX += titleOffsetX;
    tY += titleOffsetY;

    const titleTextY = tY + paddingY;
    const subtitleTextY = titleTextY + mapTitleSize + titleLineSpacing;

    const stats = side === "left" ? leftStats : rightStats;
    let svgStatsPanel = "";
    if (showStatsPanel && stats) {
      let stX = margin + 15;
      let stY = h - margin - 165;
      if (statsPanelPos === "top-left") { stX = margin + 15; stY = margin + 15; }
      else if (statsPanelPos === "top-right") { stX = w - margin - 200; stY = margin + 15; }
      else if (statsPanelPos === "bottom-right") { stX = w - margin - 200; stY = h - margin - 165; }

      stX += statsOffsetX;
      stY += statsOffsetY;

      const subgroupLabel = stats.subgroupLabel || "States/UTs";
      const words = (stats.affectedNamesList || "-").split(", ");
      let lines = [];
      let currentLine = "";
      for (let i = 0; i < words.length; i++) {
        const testLine = currentLine + (currentLine ? ", " : "") + words[i];
        if (testLine.length * 5 > 170 && i > 0) {
          lines.push(currentLine);
          currentLine = words[i];
          if (lines.length >= 2) {
            lines.push(currentLine + "...");
            currentLine = "";
            break;
          }
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }

      svgStatsPanel = `
  <!-- 10. Descriptive Statistics Panel -->
  <g id="map-stats-panel" opacity="0.95">
    <rect x="${stX}" y="${stY}" width="185" height="150" fill="${pStyle.bg}" stroke="${pStyle.border}" stroke-width="1" rx="4" />
    <text x="${stX + 8}" y="${stY + 14}" font-size="8" font-weight="bold" fill="${pStyle.text === "#0f172a" ? "#0284c7" : "#38bdf8"}">MAP DESCRIPTIVE STATISTICS</text>
    <text x="${stX + 8}" y="${stY + 28}" font-size="7.5" fill="${pStyle.text}">Total Samples (N): ${stats.total}</text>
    <text x="${stX + 8}" y="${stY + 41}" font-size="7.5" fill="${pStyle.text}">Above Permissible Limit: ${stats.exceeding}</text>
    <text x="${stX + 8}" y="${stY + 54}" font-size="7.5" fill="${pStyle.text}">% Above Permissible Limit: ${stats.percentage}%</text>
    <text x="${stX + 8}" y="${stY + 67}" font-size="7.5" fill="${pStyle.text}">Min Value: ${stats.min} ${paramConfig.unit}</text>
    <text x="${stX + 8}" y="${stY + 80}" font-size="7.5" fill="${pStyle.text}">Max Value: ${stats.max} ${paramConfig.unit}</text>
    <text x="${stX + 8}" y="${stY + 93}" font-size="7.5" fill="${pStyle.text}">No. of Partially Affected ${subgroupLabel}: ${stats.affectedCount ?? 0}</text>
    <text x="${stX + 8}" y="${stY + 106}" font-size="7.5" fill="${pStyle.text}">Affected ${subgroupLabel}:</text>
    ${lines.map((ln, idx) => `
    <text x="${stX + 8}" y="${stY + 118 + idx * 11}" font-size="7.5" font-style="italic" fill="${pStyle.text}">${ln}</text>
    `).join("")}
  </g>
      `;
    }

    const isSvgTransparent = basemap === "Transparent (No Background)";
    let svg = `<?xml version="1.0" encoding="utf-8"?>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}px" height="${h}px" style="background:${isSvgTransparent ? "none" : "#ffffff"}; font-family:${mapFontFamily};">
  <defs>
    <filter id="3d-emboss" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.6" result="blur" />
      <feSpecularLighting in="blur" surfaceScale="2" specularConstant="1.2" specularExponent="16" lighting-color="#ffffff" result="spec">
        <feDistantLight azimuth="225" elevation="45" />
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specOut" />
      <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit" />
    </filter>
    <filter id="3d-deboss" x="-20%" y="-20%" width="140%" height="140%">
      <feOffset dx="0.5" dy="0.5" />
      <feGaussianBlur stdDeviation="0.5" result="offset-blur" />
      <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
      <feFlood flood-color="#000000" flood-opacity="0.7" result="color" />
      <feComposite operator="in" in="color" in2="inverse" result="shadow" />
      <feComposite operator="over" in="shadow" in2="SourceGraphic" />
    </filter>
  </defs>
  
  <!-- 1. Background base layout -->
  ${isSvgTransparent ? "" : `<rect x="0" y="0" width="${w}" height="${h}" fill="#f8fafc" />
  <rect x="${margin}" y="${margin}" width="${mw}" height="${mh}" fill="#ffffff" />`}

  <!-- 2. True Scalable Vector Raster Surface -->
  <g id="vector-interpolation-raster" opacity="${rasterOpacity / 100}">
${rasterRects}  </g>

  <!-- 3. Coordinate Grid Lines -->
  <g id="grid-lines">
${gridLines}  </g>

  <!-- Custom Shapefile Boundaries Layer -->
  <g id="shapefile-boundaries">
${svgShapefileBoundaries}  </g>

  <!-- 4. Water Quality Wells (Vector points) -->
  <g id="groundwater-stations">
${pointElements}  </g>

  <!-- 5. Outer Neatline Borders (double-border frame) -->
  ${mapBorderType === "double" ? `<rect x="${margin - 6}" y="${margin - 6}" width="${mw + 12}" height="${mh + 12}" fill="none" stroke="${mapBorderColor}" stroke-width="1.5" />` : ""}
  <rect x="${margin}" y="${margin}" width="${mw}" height="${mh}" fill="none" stroke="${mapBorderColor}" stroke-width="1.5" />

  <!-- 6. Compact Positionable Legend -->
  <g id="map-legend">
    <rect x="${legX}" y="${legY}" width="${legendWidthFinal}" height="${legendHeight}" fill="${pStyle.bg}" stroke="${pStyle.border}" stroke-width="1" rx="4" />
    <text x="${legX + 8}" y="${legY + 16}" font-size="${legendTitleSize}" font-weight="bold" fill="${legendTextColor}" ${legend3dEffect !== "none" ? `filter="url(#3d-${legend3dEffect})"` : ""}>Legend</text>
${legendItems}    <text x="${legX + 10}" y="${legY + (legendHeight - 9)}" font-size="${legendSubtitleSize}" font-style="italic" fill="#64748b">Unit: ${paramConfig.unit || "N/A"}</text>
  </g>

  <!-- 7. Map Title Block -->
  <g id="map-title-block">
    <rect x="${tX}" y="${tY}" width="${tW}" height="${tH}" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" rx="4" opacity="0.95" />
    <text x="${tX + tW / 2}" y="${titleTextY}" font-size="${mapTitleSize}" font-weight="${mapTitleBold ? "bold" : "normal"}" fill="${mapTitleColor}" text-anchor="middle" dominant-baseline="hanging" ${mapTitle3dEffect !== "none" ? `filter="url(#3d-${mapTitle3dEffect})"` : ""}>${displayTitle}</text>
    ${displaySubtitle ? `<text x="${tX + tW / 2}" y="${subtitleTextY}" font-size="${mapSubtitleSize}" fill="${mapSubtitleColor}" text-anchor="middle" dominant-baseline="hanging" ${mapSubtitle3dEffect !== "none" ? `filter="url(#3d-${mapSubtitle3dEffect})"` : ""}>${displaySubtitle}</text>` : ""}
  </g>

  <!-- 8. Scale Bar and North Arrow -->
  <g id="map-decorations">
${scaleBarElement}
${northArrowElement}
  </g>

  <!-- 9. Boundary Labels -->
  <g id="shapefile-labels">
${svgLabels}  </g>

${svgStatsPanel}

</svg>`;

    return svg;
  };

  // Trigger downloads for High-DPI Lossless exports with adaptive canvas allocation guards
  const exportMap = () => {
    // Adaptive resolution capping to avoid exceeding browser canvas allocation limits (prevents silent crash at 1200/2400/4800 DPI)
    const MAX_CANVAS_AREA = 110000000; // ~110 Megapixels is highly safe and performant across Chrome, Safari, and Firefox
    let multiplier = exportDpi / 96;

    let singleW = canvasWidth;
    let singleH = canvasHeight;

    let w = Math.round(singleW * multiplier);
    let h = Math.round(singleH * multiplier);

    if (isComparisonActive) {
      if (comparisonLayout === "horizontal") {
        w = Math.round((singleW * 2 + 20) * multiplier);
        h = Math.round(singleH * multiplier);
      } else {
        w = Math.round(singleW * multiplier);
        h = Math.round((singleH * 2 + 20) * multiplier);
      }
    }

    if (w * h > MAX_CANVAS_AREA) {
      const scaleDown = Math.sqrt(MAX_CANVAS_AREA / (w * h));
      multiplier *= scaleDown;
      if (isComparisonActive) {
        if (comparisonLayout === "horizontal") {
          w = Math.round((singleW * 2 + 20) * multiplier);
          h = Math.round(singleH * multiplier);
        } else {
          w = Math.round(singleW * multiplier);
          h = Math.round((singleH * 2 + 20) * multiplier);
        }
      } else {
        w = Math.round(singleW * multiplier);
        h = Math.round(singleH * multiplier);
      }
      showToast(`Adjusted resolution to maximum safe browser allocation limit (~${Math.round(multiplier * 96)} DPI) to prevent allocation failure.`, "info");
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = w;
    tempCanvas.height = h;

    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = "high";

    // Fill white background for high quality raster print
    tempCtx.fillStyle = "#ffffff";
    tempCtx.fillRect(0, 0, w, h);

    if (isComparisonActive) {
      const pW = Math.round(singleW * multiplier);
      const pH = Math.round(singleH * multiplier);
      const gap = Math.round(20 * multiplier);

      // Render Pre-Monsoon Left Panel
      tempCtx.save();
      const titleL = customTitle || getMapDefaultTitleAndSubtitle("left").title;
      const subtitleL = customSubtitle || getMapDefaultTitleAndSubtitle("left").subtitle;
      drawMapInstance(
        tempCtx,
        pW,
        pH,
        multiplier,
        leftPanelData,
        titleL,
        subtitleL,
        leftStats,
        false,
        null,
        "left"
      );
      tempCtx.restore();

      // Render Post-Monsoon / Difference Right Panel
      tempCtx.save();
      if (comparisonLayout === "horizontal") {
        tempCtx.translate(pW + gap, 0);
      } else {
        tempCtx.translate(0, pH + gap);
      }

      const titleR = customTitle 
        ? `${customTitle} (Post-Monsoon)` 
        : (showDifferenceMap 
          ? `Seasonal Quality Difference Map (Post − Pre)`
          : getMapDefaultTitleAndSubtitle("right").title);
      const subtitleR = customSubtitle || (showDifferenceMap
        ? `Chemical concentration change dynamics`
        : getMapDefaultTitleAndSubtitle("right").subtitle);

      drawMapInstance(
        tempCtx,
        pW,
        pH,
        multiplier,
        rightPanelData,
        titleR,
        subtitleR,
        rightStats,
        showDifferenceMap,
        differenceMatrix,
        "right"
      );
      tempCtx.restore();
    } else {
      // Single map high-DPI export
      const title = customTitle || getMapDefaultTitleAndSubtitle("left").title;
      const subtitle = customSubtitle || getMapDefaultTitleAndSubtitle("left").subtitle;
      drawMapInstance(
        tempCtx,
        w,
        h,
        multiplier,
        parsedData,
        title,
        subtitle,
        leftStats || rightStats,
        false,
        null,
        "left"
      );
    }

    if (exportFormat === "svg") {
      const svgString = exportToSvgString("left");
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const svgUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = svgUrl;
      link.download = `${selectedParam}_HighRes_Map.svg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);
      showToast(`Exported vector ${selectedParam}_HighRes_Map.svg successfully!`, "success");
      return;
    }

    if (exportFormat === "tiff") {
      const tempCtxForTiff = tempCanvas.getContext("2d");
      if (tempCtxForTiff) {
        const imgData = tempCtxForTiff.getImageData(0, 0, w, h);
        const bounds = {
          minLng: mapExtent.mapMinLng,
          maxLng: mapExtent.mapMaxLng,
          minLat: mapExtent.mapMinLat,
          maxLat: mapExtent.mapMaxLat
        };
        
        // 1. Generate and download the GeoTIFF binary Blob
        const geoTiffBlob = createGeoTiffBlob(w, h, imgData.data, bounds);
        const geoTiffUrl = URL.createObjectURL(geoTiffBlob);
        const geoTiffLink = document.createElement("a");
        geoTiffLink.href = geoTiffUrl;
        geoTiffLink.download = `${selectedParam}_GroundwaterMap_Georeferenced.tif`;
        geoTiffLink.click();
        setTimeout(() => URL.revokeObjectURL(geoTiffUrl), 2000);

        // 2. Generate and download the companion Sidecar World File (.tfw)
        const scaleX = (bounds.maxLng - bounds.minLng) / w;
        const scaleY = -(bounds.maxLat - bounds.minLat) / h;
        const startLng = bounds.minLng + (scaleX / 2);
        const startLat = bounds.maxLat + (scaleY / 2);
        
        const tfwContent = [
          scaleX.toFixed(12),
          "0.000000000000",
          "0.000000000000",
          scaleY.toFixed(12),
          startLng.toFixed(12),
          startLat.toFixed(12)
        ].join("\n") + "\n";

        const tfwBlob = new Blob([tfwContent], { type: "text/plain" });
        const tfwUrl = URL.createObjectURL(tfwBlob);
        const tfwLink = document.createElement("a");
        tfwLink.href = tfwUrl;
        tfwLink.download = `${selectedParam}_GroundwaterMap_Georeferenced.tfw`;
        tfwLink.click();
        setTimeout(() => URL.revokeObjectURL(tfwUrl), 2000);

        showToast(`Successfully exported Georeferenced GeoTIFF and companion World File (.tfw)!`, "success");
        return;
      }
    }

    if (exportFormat === "shapefile") {
      exportMapAsShapefile("all");
      return;
    }

    // High quality raster format export
    const formatType = exportFormat === "jpeg" ? "image/jpeg" : "image/png";
    const extension = exportFormat;
    const dataUrl = tempCanvas.toDataURL(formatType, 1.0);
    
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${selectedParam}_GroundwaterMap_${Math.round(multiplier * 96)}DPI.${extension}`;
    link.click();
    showToast(`Successfully exported high-quality ${Math.round(multiplier * 96)} DPI map!`, "success");
  };

  // Helper: normalize CSS color (#hex or rgb(r,g,b)) to uppercase #RRGGBB and R,G,B
  const normalizeExportColor = (colorStr: string): { hex: string; rgb: string } => {
    const str = (colorStr || "#3b82f6").trim();
    if (str.startsWith("#")) {
      let h = str.slice(1);
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const r = parseInt(h.substring(0, 2), 16) || 0;
      const g = parseInt(h.substring(2, 4), 16) || 0;
      const b = parseInt(h.substring(4, 6), 16) || 0;
      return { hex: `#${h.toUpperCase().padEnd(6, "0").slice(0, 6)}`, rgb: `${r},${g},${b}` };
    }
    const nums = str.match(/\d+/g);
    if (nums && nums.length >= 3) {
      const r = Math.min(255, Math.max(0, parseInt(nums[0], 10) || 0));
      const g = Math.min(255, Math.max(0, parseInt(nums[1], 10) || 0));
      const b = Math.min(255, Math.max(0, parseInt(nums[2], 10) || 0));
      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
      return { hex, rgb: `${r},${g},${b}` };
    }
    return { hex: "#3B82F6", rgb: "59,130,246" };
  };

  // Helper: resolve clean station field value across raw columns and headerMap
  const getStationFieldValue = (row: any, canonicalKey: string, fallbacks: string[]): string => {
    if (!row) return "";
    const mapped = headerMap?.[canonicalKey] || headers?.[canonicalKey];
    if (mapped && row[mapped] !== undefined && row[mapped] !== null && String(row[mapped]).trim() !== "") {
      return String(row[mapped]).trim();
    }
    for (const k of Object.keys(row)) {
      const low = k.toLowerCase().trim();
      if (fallbacks.some((fb) => low === fb || low.includes(fb))) {
        const v = row[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          return String(v).trim();
        }
      }
    }
    return "";
  };

  // Helper: compute active interpolated grid synchronously if background grid is not yet populated
  const getActiveRasterGridForExport = (
    activeData: any[],
    activeParamName: string
  ): { grid: number[][]; colStep: number; rowStep: number } | null => {
    if (!activeParamName || activeParamName === "STATIONS") return null;

    if (!isComparisonActive && leftInterpolatedGrid && leftInterpolatedGrid.grid.length > 1) {
      return leftInterpolatedGrid;
    }
    if (isComparisonActive && leftInterpolatedGrid && leftInterpolatedGrid.grid.length > 1) {
      return leftInterpolatedGrid;
    }

    const paramCol = headerMap[activeParamName] || activeParamName;
    const pts = (activeData || [])
      .map((d) => ({ lat: d.lat, lng: d.lng, val: parseFloat(d[paramCol]) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.val));

    if (pts.length === 0) return null;

    const { mapMinLat, mapMinLng, finalLatSpan, finalLngSpan } = baseMapExtent;
    const colStep = 96;
    const rowStep = Math.max(36, Math.min(140, Math.round(colStep * (finalLatSpan / Math.max(1e-6, finalLngSpan)))));
    const grid: number[][] = Array.from({ length: rowStep }, () => new Array(colStep).fill(NaN));
    const power = idwPower || 2;

    for (let r = 0; r < rowStep; r++) {
      const cellLat = mapMinLat + ((r + 0.5) / rowStep) * finalLatSpan;
      for (let c = 0; c < colStep; c++) {
        const cellLng = mapMinLng + ((c + 0.5) / colStep) * finalLngSpan;
        let exactVal: number | null = null;
        let numer = 0;
        let denom = 0;

        for (let i = 0; i < pts.length; i++) {
          const pt = pts[i];
          const dLat = cellLat - pt.lat;
          const dLng = cellLng - pt.lng;
          const distSq = dLat * dLat + dLng * dLng;
          if (distSq < 1e-10) {
            exactVal = pt.val;
            break;
          }
          const w = 1 / Math.pow(distSq, power / 2);
          numer += w * pt.val;
          denom += w;
        }

        grid[r][c] = exactVal !== null ? exactVal : denom > 0 ? numer / denom : NaN;
      }
    }

    return { grid, colStep, rowStep };
  };

  // Helper: vectorize active interpolated raster into Polygon Classification Zones & PolyLine Contours
  const buildVectorizedZonesAndContours = (
    activeData: any[],
    activeParamName: string,
    clipGeoJson: any
  ): {
    zonesGeoJson: any | null;
    contoursGeoJson: any | null;
    classSummary: { zoneId: number; label: string; rangeText: string; hex: string; rgb: string; areaSqKm: number; areaPct: number }[];
  } => {
    const emptyRes = { zonesGeoJson: null, contoursGeoJson: null, classSummary: [] };
    if (!showRaster || !isInterpolatedType || activeParamName === "STATIONS") return emptyRes;

    const rasterObj = getActiveRasterGridForExport(activeData, activeParamName);
    if (!rasterObj || !rasterObj.grid || rasterObj.grid.length < 2 || rasterObj.colStep < 2) {
      return emptyRes;
    }

    const activeParamConfig = PARAM_CONFIG[activeParamName] || {
      b1: 1,
      b2: 10,
      unit: "mg/L",
      name: activeParamName
    };

    const { grid, colStep, rowStep } = rasterObj;
    const { mapMinLat, mapMinLng, finalLatSpan, finalLngSpan } = baseMapExtent;

    // Downsample grid smoothly for responsive marching-squares polygonization (<= 115 cols/rows)
    const maxDim = 115;
    const stride = Math.max(1, Math.ceil(Math.max(colStep, rowStep) / maxDim));
    const sampledRows: number[] = [];
    for (let r = 0; r < rowStep; r += stride) sampledRows.push(r);
    if (sampledRows[sampledRows.length - 1] !== rowStep - 1) sampledRows.push(rowStep - 1);

    const sampledCols: number[] = [];
    for (let c = 0; c < colStep; c += stride) sampledCols.push(c);
    if (sampledCols[sampledCols.length - 1] !== colStep - 1) sampledCols.push(colStep - 1);

    if (sampledRows.length < 2 || sampledCols.length < 2) return emptyRes;

    // Collect valid point fallback values for filling edge NaN cells prior to clipping
    let sumValid = 0;
    let countValid = 0;
    let gridMin = Infinity;
    let gridMax = -Infinity;
    const validGridCoords: { r: number; c: number; val: number }[] = [];

    for (let rIdx = 0; rIdx < sampledRows.length; rIdx++) {
      const r = sampledRows[rIdx];
      for (let cIdx = 0; cIdx < sampledCols.length; cIdx++) {
        const c = sampledCols[cIdx];
        const v = grid[r]?.[c];
        if (typeof v === "number" && Number.isFinite(v)) {
          sumValid += v;
          countValid++;
          if (v < gridMin) gridMin = v;
          if (v > gridMax) gridMax = v;
          validGridCoords.push({ r: rIdx, c: cIdx, val: v });
        }
      }
    }

    if (countValid === 0) return emptyRes;
    const fallbackMean = sumValid / countValid;

    // Build strictly rectangular Turf PointGrid with identical rounded latitude rows
    const gridPoints: any[] = [];
    for (let rIdx = 0; rIdx < sampledRows.length; rIdx++) {
      const r = sampledRows[rIdx];
      const lat = Number((mapMinLat + ((r + 0.5) / rowStep) * finalLatSpan).toFixed(7));
      for (let cIdx = 0; cIdx < sampledCols.length; cIdx++) {
        const c = sampledCols[cIdx];
        const lng = Number((mapMinLng + ((c + 0.5) / colStep) * finalLngSpan).toFixed(7));
        let val = grid[r]?.[c];
        if (typeof val !== "number" || !Number.isFinite(val)) {
          // Nearest valid neighbor in downsampled grid keeps boundary edges seamless
          let bestDist = Infinity;
          let nearestVal = fallbackMean;
          for (let k = 0; k < validGridCoords.length; k++) {
            const vc = validGridCoords[k];
            const d2 = (vc.r - rIdx) * (vc.r - rIdx) + (vc.c - cIdx) * (vc.c - cIdx);
            if (d2 < bestDist) {
              bestDist = d2;
              nearestVal = vc.val;
            }
          }
          val = nearestVal;
        }
        gridPoints.push(turf.point([lng, lat], { val }));
      }
    }

    const pointGrid = turf.featureCollection(gridPoints);

    // Prepare strictly increasing breaks and matching colors/labels
    const rawClass = getClassColorsAndBreaks(activeParamConfig);
    const cleanBreaks: number[] = [];
    const cleanColors: string[] = [];
    const cleanLabels: string[] = [];

    for (let i = 0; i < rawClass.breaks.length; i++) {
      const brk = rawClass.breaks[i];
      if (cleanBreaks.length === 0 || brk > cleanBreaks[cleanBreaks.length - 1]) {
        cleanBreaks.push(brk);
        cleanColors.push(rawClass.colors[i] || rawClass.colors[0]);
        cleanLabels.push(rawClass.labels[i] || `Class ${i + 1}`);
      }
    }
    cleanColors.push(rawClass.colors[rawClass.colors.length - 1] || "#ff0000");
    cleanLabels.push(rawClass.labels[rawClass.labels.length - 1] || "Exceeded");

    const firstBreak = cleanBreaks[0] ?? 0;
    const lastBreak = cleanBreaks[cleanBreaks.length - 1] ?? 1;
    const lowBound = Math.min(gridMin - Math.max(1, Math.abs(gridMin) * 0.25), firstBreak - Math.max(10, Math.abs(firstBreak) * 0.5));
    const highBound = Math.max(gridMax + Math.max(1, Math.abs(gridMax) * 0.25), lastBreak * 2 + 1000);
    const isoBreaks = [lowBound, ...cleanBreaks, highBound];

    const clipFeatures: any[] = [];
    const clipBboxes: ([number, number, number, number] | null)[] = [];
    if (clipGeoJson) {
      const rawClip = clipGeoJson.features || (clipGeoJson.type === "Feature" ? [clipGeoJson] : []);
      rawClip.forEach((cf: any) => {
        if (cf && cf.geometry && (cf.geometry.type === "Polygon" || cf.geometry.type === "MultiPolygon")) {
          clipFeatures.push(cf);
          clipBboxes.push(getFeatureBbox(cf));
        }
      });
    }

    // 1. Isobands -> Polygon Zones clipped to boundary
    let bandsFc: any = null;
    try {
      bandsFc = turf.isobands(pointGrid as any, isoBreaks, { zProperty: "val" });
    } catch (e) {
      console.warn("Isobands vectorization fallback:", e);
    }

    const zoneFeatures: any[] = [];
    const classSummary: { zoneId: number; label: string; rangeText: string; hex: string; rgb: string; areaSqKm: number; areaPct: number }[] = [];

    if (bandsFc && Array.isArray(bandsFc.features)) {
      let totalAreaSqKm = 0;

      bandsFc.features.forEach((bandFeat: any, bIdx: number) => {
        if (!bandFeat || !bandFeat.geometry) return;
        const coords = bandFeat.geometry.coordinates;
        if (!coords || coords.length === 0) return;

        const rMin = isoBreaks[bIdx];
        const rMax = isoBreaks[bIdx + 1];
        const colorMeta = normalizeExportColor(cleanColors[bIdx] || "#3b82f6");
        const label = cleanLabels[bIdx] || `Zone ${bIdx + 1}`;
        const rangeText = bIdx === 0
          ? `<= ${cleanBreaks[0] ?? rMax}`
          : bIdx >= cleanBreaks.length
            ? `> ${cleanBreaks[cleanBreaks.length - 1] ?? rMin}`
            : `${cleanBreaks[bIdx - 1]} - ${cleanBreaks[bIdx]}`;

        let finalGeom: any = bandFeat.geometry;

        if (clipFeatures.length > 0) {
          const bandBbox = getFeatureBbox(bandFeat);
          const clippedPolygons: number[][][][] = [];

          for (let ci = 0; ci < clipFeatures.length; ci++) {
            const cb = clipBboxes[ci];
            if (bandBbox && cb && !doBboxesOverlap(bandBbox, cb)) continue;
            try {
              const clipped = turf.intersect(turf.featureCollection([bandFeat, clipFeatures[ci]]) as any);
              if (clipped && clipped.geometry) {
                if (clipped.geometry.type === "Polygon") {
                  clippedPolygons.push(clipped.geometry.coordinates);
                } else if (clipped.geometry.type === "MultiPolygon") {
                  clipped.geometry.coordinates.forEach((polyCoords: any) => clippedPolygons.push(polyCoords));
                }
              }
            } catch {
              // Skip invalid degenerate ring intersections safely
            }
          }

          if (clippedPolygons.length === 0) return;
          finalGeom =
            clippedPolygons.length === 1
              ? { type: "Polygon", coordinates: clippedPolygons[0] }
              : { type: "MultiPolygon", coordinates: clippedPolygons };
        }

        let areaSqKm = 0;
        try {
          areaSqKm = turf.area({ type: "Feature", geometry: finalGeom, properties: {} } as any) / 1_000_000;
        } catch {}
        totalAreaSqKm += areaSqKm;

        const roundedArea = Number(areaSqKm.toFixed(2));
        zoneFeatures.push({
          type: "Feature",
          geometry: finalGeom,
          properties: {
            ZONE_ID: bIdx + 1,
            ZONE_NAME: label,
            RANGE_TXT: rangeText,
            RANGE_MIN: Number((bIdx === 0 ? gridMin : rMin).toFixed(4)),
            RANGE_MAX: Number((bIdx >= cleanBreaks.length ? gridMax : rMax).toFixed(4)),
            AREA_SQKM: roundedArea,
            AREA_PCT: 0,
            COLOR_HEX: colorMeta.hex,
            RGB_COLOR: colorMeta.rgb,
            PARAM: activeParamName,
            UNIT: activeParamConfig.unit || "",
            METHOD: interpolationMethod.toUpperCase()
          }
        });

        classSummary.push({
          zoneId: bIdx + 1,
          label,
          rangeText,
          hex: colorMeta.hex,
          rgb: colorMeta.rgb,
          areaSqKm: roundedArea,
          areaPct: 0
        });
      });

      if (totalAreaSqKm > 0) {
        zoneFeatures.forEach((zf, idx) => {
          const pct = Number(((zf.properties.AREA_SQKM / totalAreaSqKm) * 100).toFixed(2));
          zf.properties.AREA_PCT = pct;
          if (classSummary[idx]) classSummary[idx].areaPct = pct;
        });
      }
    }

    // 2. Isolines -> PolyLine Iso-Concentration Contours clipped to boundary
    const contourSet = new Set<number>(cleanBreaks.filter((b) => b >= gridMin && b <= gridMax));
    if (gridMax > gridMin) {
      const span = gridMax - gridMin;
      const numSteps = 8;
      for (let i = 1; i < numSteps; i++) {
        contourSet.add(Number((gridMin + (span * i) / numSteps).toFixed(2)));
      }
    }
    const contourBreaks = Array.from(contourSet).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);

    const contourFeatures: any[] = [];
    if (contourBreaks.length > 0) {
      try {
        const linesFc = turf.isolines(pointGrid as any, contourBreaks, { zProperty: "val" });
        (linesFc.features || []).forEach((lineFeat: any) => {
          if (!lineFeat || !lineFeat.geometry) return;
          const levelVal = Number(lineFeat.properties?.val);
          const colorMeta = normalizeExportColor(getValueColor(levelVal, false, activeParamName));
          const isBisThresh = cleanBreaks.some((b) => Math.abs(b - levelVal) < 1e-6);

          const rawParts: [number, number][][] =
            lineFeat.geometry.type === "LineString"
              ? [lineFeat.geometry.coordinates]
              : lineFeat.geometry.type === "MultiLineString"
                ? lineFeat.geometry.coordinates
                : [];

          let keptParts: [number, number][][] = [];
          if (clipFeatures.length > 0) {
            rawParts.forEach((part) => {
              let seg: [number, number][] = [];
              for (let pi = 0; pi < part.length; pi++) {
                const pt = part[pi];
                const inside = clipFeatures.some((cf) => {
                  try {
                    return turf.booleanPointInPolygon(pt as any, cf);
                  } catch {
                    return false;
                  }
                });
                if (inside) {
                  seg.push(pt);
                } else if (seg.length >= 2) {
                  keptParts.push(seg);
                  seg = [];
                } else {
                  seg = [];
                }
              }
              if (seg.length >= 2) keptParts.push(seg);
            });
          } else {
            keptParts = rawParts.filter((p) => p.length >= 2);
          }

          if (keptParts.length > 0) {
            contourFeatures.push({
              type: "Feature",
              geometry:
                keptParts.length === 1
                  ? { type: "LineString", coordinates: keptParts[0] }
                  : { type: "MultiLineString", coordinates: keptParts },
              properties: {
                CONTOUR: Number.isFinite(levelVal) ? levelVal : 0,
                IS_BIS_LMT: isBisThresh ? "Yes" : "No",
                COLOR_HEX: colorMeta.hex,
                PARAM: activeParamName,
                UNIT: activeParamConfig.unit || ""
              }
            });
          }
        });
      } catch (e) {
        console.warn("Isolines contour generation warning:", e);
      }
    }

    return {
      zonesGeoJson: zoneFeatures.length > 0 ? { type: "FeatureCollection", features: zoneFeatures } : null,
      contoursGeoJson: contourFeatures.length > 0 ? { type: "FeatureCollection", features: contourFeatures } : null,
      classSummary
    };
  };

  // Helper: render borderless WGS84 Georeferenced GeoTIFF + .tfw + .prj + MapInfo .tab aligned to baseMapExtent
  const buildGeoreferencedRasterFiles = (
    activeData: any[],
    activeParamName: string,
    filePrefix: string
  ): GisPackageExtraFile[] => {
    const files: GisPackageExtraFile[] = [];
    const { mapMinLng, mapMaxLng, mapMinLat, mapMaxLat, finalLngSpan, finalLatSpan, centerLat } = baseMapExtent;
    const cosLat = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
    const geoAspect = (finalLngSpan * cosLat) / Math.max(1e-6, finalLatSpan);

    const rasterW = 1400;
    const rasterH = Math.max(360, Math.min(2100, Math.round(rasterW / Math.max(0.25, geoAspect))));

    const offCanvas = document.createElement("canvas");
    offCanvas.width = rasterW;
    offCanvas.height = rasterH;
    const oCtx = offCanvas.getContext("2d");
    if (!oCtx) return files;

    oCtx.fillStyle = "#ffffff";
    oCtx.fillRect(0, 0, rasterW, rasterH);

    const getRx = (lng: number) => ((lng - mapMinLng) / finalLngSpan) * rasterW;
    const getRy = (lat: number) => ((mapMaxLat - lat) / finalLatSpan) * rasterH;

    // 1. Interpolated raster surface aligned pixel-for-pixel to WGS84 extent
    if (showRaster && isInterpolatedType && activeParamName !== "STATIONS") {
      const rasterObj = getActiveRasterGridForExport(activeData, activeParamName);
      if (rasterObj) {
        const { grid, colStep, rowStep } = rasterObj;
        const mathCanvas = document.createElement("canvas");
        mathCanvas.width = colStep;
        mathCanvas.height = rowStep;
        const mCtx = mathCanvas.getContext("2d");
        if (mCtx) {
          const imgData = mCtx.createImageData(colStep, rowStep);
          const buf = imgData.data;
          for (let r = 0; r < rowStep; r++) {
            const imgY = rowStep - 1 - r;
            for (let c = 0; c < colStep; c++) {
              const val = grid[r]?.[c];
              const idx = (imgY * colStep + c) * 4;
              if (val === undefined || isNaN(val)) {
                buf[idx + 3] = 0;
                continue;
              }
              const rgb = normalizeExportColor(getValueColor(val, false, activeParamName));
              const parts = rgb.rgb.split(",").map(Number);
              buf[idx] = parts[0] || 0;
              buf[idx + 1] = parts[1] || 0;
              buf[idx + 2] = parts[2] || 0;
              buf[idx + 3] = 255;
            }
          }
          mCtx.putImageData(imgData, 0, 0);

          oCtx.save();
          if (effectiveClipGeoJson) {
            oCtx.beginPath();
            const traceRing = (ring: number[][]) => {
              if (!ring || ring.length === 0) return;
              oCtx.moveTo(getRx(ring[0][0]), getRy(ring[0][1]));
              for (let i = 1; i < ring.length; i++) oCtx.lineTo(getRx(ring[i][0]), getRy(ring[i][1]));
              oCtx.closePath();
            };
            const traceGeom = (g: any) => {
              if (!g) return;
              if (g.type === "Polygon") g.coordinates.forEach(traceRing);
              else if (g.type === "MultiPolygon") g.coordinates.forEach((p: any) => p.forEach(traceRing));
            };
            const feats = effectiveClipGeoJson.features || (effectiveClipGeoJson.type === "Feature" ? [effectiveClipGeoJson] : []);
            feats.forEach((f: any) => traceGeom(f?.geometry));
            oCtx.clip();
          }
          oCtx.globalAlpha = Math.max(0.1, rasterOpacity / 100);
          oCtx.imageSmoothingEnabled = smoothBlending;
          oCtx.imageSmoothingQuality = "high";
          oCtx.drawImage(mathCanvas, 0, 0, rasterW, rasterH);
          oCtx.restore();
        }
      }
    }

    // 2. Crisp boundary strokes in borderless GeoTIFF
    const drawClipOutlines = (fc: any, stroke: string, lw: number) => {
      if (!fc) return;
      const feats = fc.features || (fc.type === "Feature" ? [fc] : []);
      oCtx.save();
      oCtx.strokeStyle = stroke;
      oCtx.lineWidth = lw;
      const strokeRing = (ring: number[][]) => {
        if (!ring || ring.length === 0) return;
        oCtx.beginPath();
        oCtx.moveTo(getRx(ring[0][0]), getRy(ring[0][1]));
        for (let i = 1; i < ring.length; i++) oCtx.lineTo(getRx(ring[i][0]), getRy(ring[i][1]));
        oCtx.closePath();
        oCtx.stroke();
      };
      feats.forEach((f: any) => {
        const g = f?.geometry;
        if (!g) return;
        if (g.type === "Polygon") g.coordinates.forEach(strokeRing);
        else if (g.type === "MultiPolygon") g.coordinates.forEach((p: any) => p.forEach(strokeRing));
      });
      oCtx.restore();
    };

    const visibleLayers = (layers || []).filter((l) => l.visible && l.geoJson);
    if (visibleLayers.length > 0) {
      visibleLayers.forEach((layer) => {
        const useClipped = autoCutAdminToAoi && Boolean(aoiLayerId) && layer.id !== aoiLayerId && clippedFeaturesMap[layer.id];
        const fc = useClipped
          ? { type: "FeatureCollection", features: clippedFeaturesMap[layer.id] }
          : layer.geoJson;
        drawClipOutlines(fc, layer.strokeColor || "#334155", Math.max(1.2, (layer.strokeWidth || 1) * 1.4));
      });
    } else if (effectiveClipGeoJson) {
      drawClipOutlines(effectiveClipGeoJson, "#334155", 1.5);
    }

    const imgData = oCtx.getImageData(0, 0, rasterW, rasterH);
    const bounds = { minLng: mapMinLng, maxLng: mapMaxLng, minLat: mapMinLat, maxLat: mapMaxLat };
    const tifName = `${filePrefix}.tif`;
    const geoTiffBlob = createGeoTiffBlob(rasterW, rasterH, imgData.data, bounds);

    const scaleX = (bounds.maxLng - bounds.minLng) / rasterW;
    const scaleY = -(bounds.maxLat - bounds.minLat) / rasterH;
    const tfwContent =
      [
        scaleX.toFixed(12),
        "0.000000000000",
        "0.000000000000",
        scaleY.toFixed(12),
        (bounds.minLng + scaleX / 2).toFixed(12),
        (bounds.maxLat + scaleY / 2).toFixed(12)
      ].join("\n") + "\n";

    files.push({ fileName: tifName, content: geoTiffBlob });
    files.push({ fileName: `${filePrefix}.tfw`, content: tfwContent });
    files.push({ fileName: `${filePrefix}.prj`, content: WGS84_PRJ });
    files.push({ fileName: `${filePrefix}.tab`, content: buildMapInfoRasterTab(tifName, rasterW, rasterH, bounds) });

    return files;
  };

  // Export current prepared map (Zones, Contours, Stations, Boundaries, GeoTIFF Raster) as ArcGIS & MapInfo Package (.zip)
  const exportMapAsShapefile = async (type: "stations" | "boundaries" | "zones" | "all" = "all") => {
    try {
      const labelMap: Record<string, string> = {
        all: "Full ArcGIS & MapInfo GIS Package (.zip)",
        zones: "Interpolated Zones & Contours Shapefile (.zip)",
        stations: "Monitoring Stations Point Shapefile (.zip)",
        boundaries: "Boundary Polygon Shapefile (.zip)"
      };
      showToast(`Preparing ${labelMap[type]}...`, "info");

      const activeData = isComparisonActive ? (leftPanelData || parsedData) : parsedData;
      const activeParamName = selectedParam;
      const paramCol = headerMap[activeParamName] || activeParamName;
      const activeParamConfig =
        activeParamName === "STATIONS"
          ? { b1: 0, b2: 0, unit: "", name: "Monitoring Stations" }
          : PARAM_CONFIG[activeParamName] || { b1: 1, b2: 10, unit: "mg/L", name: activeParamName };
      const { breaks, labels } = getClassColorsAndBreaks(activeParamConfig);

      const getZoneLabelForVal = (val: number): { zoneName: string; exceeds: string } => {
        if (activeParamName === "STATIONS") return { zoneName: "Monitoring Station", exceeds: "N/A" };
        for (let i = 0; i < breaks.length; i++) {
          if (val <= breaks[i]) {
            return {
              zoneName: labels[i] || `Class ${i + 1}`,
              exceeds: val > activeParamConfig.b2 ? "Yes" : "No"
            };
          }
        }
        return {
          zoneName: labels[labels.length - 1] || "Exceeded",
          exceeds: val > activeParamConfig.b2 ? "Yes" : "No"
        };
      };

      // Build clean station GeoJSON & raw point features
      const excludedStationKeys = new Set([
        "lat", "lng", "state", "district", "seasonGroup", "rawSeason", "year",
        "_raw", "__EMPTY", "geom", "geometry"
      ]);
      const stationGeoFeatures = (activeData || [])
        .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng))
        .map((d, idx) => {
          const numVal = activeParamName === "STATIONS" ? 1 : parseFloat(d[paramCol]);
          const hasNum = Number.isFinite(numVal);
          const colorMeta = normalizeExportColor(
            hasNum ? getValueColor(numVal, false, activeParamName, true) : stationPointColor
          );
          const { zoneName, exceeds } = hasNum
            ? getZoneLabelForVal(numVal)
            : { zoneName: "Unmeasured", exceeds: "N/A" };

          const props: Record<string, any> = {
            ID: idx + 1,
            WELL_ID: getStationFieldValue(d, "wellId", ["well_id", "well id", "well", "station_id", "site_id"]) || `STN_${idx + 1}`,
            LOCATION: getStationFieldValue(d, "location", ["location", "village", "site", "place", "station"]),
            BLOCK: getStationFieldValue(d, "block", ["block", "taluk", "tehsil", "mandal"]),
            DISTRICT: d.district || getStationFieldValue(d, "district", ["district", "dist"]),
            STATE: d.state || getStationFieldValue(d, "state", ["state", "st_nm"]),
            SEASON: d.rawSeason || d.seasonGroup || "",
            YEAR: d.year || "",
            PARAM: activeParamName,
            UNIT: activeParamConfig.unit || "",
            VALUE: hasNum ? Number(numVal.toFixed(4)) : "",
            ZONE_NAME: zoneName,
            EXCEEDS: exceeds,
            COLOR_HEX: colorMeta.hex,
            LATITUDE: Number(d.lat.toFixed(6)),
            LONGITUDE: Number(d.lng.toFixed(6))
          };

          // Append remaining clean primitive dataset attributes without overflowing DBF limits
          Object.keys(d).forEach((k) => {
            if (!excludedStationKeys.has(k) && !k.startsWith("_")) {
              const v = d[k];
              if (v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
                const up = k.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
                if (!(up in props)) {
                  props[k] = v;
                }
              }
            }
          });

          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [d.lng, d.lat] },
            properties: props
          };
        });

      const cleanParam = activeParamName.replace(/[^a-zA-Z0-9_-]/g, "_") || "Parameter";

      // 1. Stations-only export
      if (type === "stations") {
        if (stationGeoFeatures.length === 0) {
          showToast("No sample stations available on the map to export as Shapefile.", "info");
          return;
        }
        const pointFeatures = stationGeoFeatures.map((f) => ({
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          properties: f.properties
        }));
        const baseName = `${cleanParam}_Stations_Shapefile`;
        const blob = await createPointShapefileZip(pointFeatures, baseName);
        downloadBlob(blob, `${baseName}.zip`);
        showToast(`Exported ${pointFeatures.length} stations (.shp + MapInfo .tab + .prj) in ${baseName}.zip!`, "success");
        return;
      }

      // Helper to collect active boundary layers (custom uploaded layers OR effective built-in boundary)
      const getBoundaryExportLayers = (): GisPackageLayerInput[] => {
        const result: GisPackageLayerInput[] = [];
        const visibleLayers = (layers || []).filter((l) => l.visible && l.geoJson);
        const layersToUse = visibleLayers.length > 0 ? visibleLayers : (layers || []).filter((l) => l.geoJson);

        layersToUse.forEach((layer, idx) => {
          const shouldAutoCut = autoCutAdminToAoi && Boolean(aoiLayerId) && layer.id !== aoiLayerId;
          const allFeatures = layer.geoJson.features || (layer.geoJson.type === "Feature" ? [layer.geoJson] : []);
          const kept =
            shouldAutoCut && clippedFeaturesMap[layer.id]
              ? clippedFeaturesMap[layer.id]
              : allFeatures.filter((f: any) =>
                  featureMatchesSelection(f, selectedState, selectedDistrict, districtStateMap)
                );

          const finalFeats = kept.length > 0 ? kept : allFeatures;
          if (finalFeats.length > 0) {
            const safeLayerName = (layer.name || `Boundary_${idx + 1}`).replace(/\.[^/.]+$/, "");
            result.push({
              fileBaseName: `04_Boundary_${safeLayerName}`,
              geoJson: { type: "FeatureCollection", features: finalFeats }
            });
          }
        });

        // Fallback to active India / clipped State-District boundary if no custom boundary layers uploaded
        if (result.length === 0 && effectiveClipGeoJson) {
          const feats = effectiveClipGeoJson.features || (effectiveClipGeoJson.type === "Feature" ? [effectiveClipGeoJson] : []);
          if (feats.length > 0) {
            result.push({
              fileBaseName: "04_Active_Admin_Boundary",
              geoJson: { type: "FeatureCollection", features: feats }
            });
          }
        }
        return result;
      };

      // 2. Boundaries-only export
      if (type === "boundaries") {
        const bLayers = getBoundaryExportLayers();
        if (bLayers.length === 0) {
          showToast("No active boundary shapefile layer available to export.", "info");
          return;
        }
        if (bLayers.length === 1) {
          const baseName = `${bLayers[0].fileBaseName.replace(/^04_/, "")}_Shapefile`;
          const blob = await createShapefileFromGeoJson(bLayers[0].geoJson, baseName);
          downloadBlob(blob, `${baseName}.zip`);
          showToast(`Exported boundary shapefile + MapInfo .tab in ${baseName}.zip!`, "success");
        } else {
          const blob = await createGisPackageZip(bLayers, []);
          const baseName = `${cleanParam}_Boundaries_GIS_Package`;
          downloadBlob(blob, `${baseName}.zip`);
          showToast(`Exported ${bLayers.length} boundary layers (.shp + .tab) in ${baseName}.zip!`, "success");
        }
        return;
      }

      // Vectorize interpolated classification zones & contour lines
      const { zonesGeoJson, contoursGeoJson, classSummary } = buildVectorizedZonesAndContours(
        activeData,
        activeParamName,
        effectiveClipGeoJson
      );

      // 3. Interpolated Zones + Contours only export
      if (type === "zones") {
        const zLayers: GisPackageLayerInput[] = [];
        if (zonesGeoJson) zLayers.push({ fileBaseName: `${cleanParam}_Interpolated_Zones`, geoJson: zonesGeoJson });
        if (contoursGeoJson) zLayers.push({ fileBaseName: `${cleanParam}_Contours`, geoJson: contoursGeoJson });

        if (zLayers.length === 0) {
          showToast("Enable Interpolated Raster Surface with numeric parameter data to export Zone polygons.", "info");
          return;
        }

        const legendCsv = [
          "ZONE_ID,ZONE_NAME,RANGE,COLOR_HEX,RGB_COLOR,AREA_SQKM,AREA_PCT",
          ...classSummary.map(
            (c) => `${c.zoneId},"${c.label.replace(/"/g, '""')}","${c.rangeText}",${c.hex},"${c.rgb}",${c.areaSqKm},${c.areaPct}`
          )
        ].join("\r\n");

        const blob = await createGisPackageZip(zLayers, [
          { fileName: `00_${cleanParam}_Symbology_Legend.csv`, content: legendCsv }
        ]);
        const zipName = `${cleanParam}_Interpolated_Zones_Shapefile.zip`;
        downloadBlob(blob, zipName);
        showToast(`Exported vectorized Zone Polygons & Contours (.shp + MapInfo .tab) in ${zipName}!`, "success");
        return;
      }

      // 4. type === "all": Full Prepared GIS Package (.zip) for ArcGIS & MapInfo
      const packageLayers: GisPackageLayerInput[] = [];
      const extraFiles: GisPackageExtraFile[] = [];

      if (zonesGeoJson) {
        packageLayers.push({ fileBaseName: `01_${cleanParam}_Zones`, geoJson: zonesGeoJson });
      }
      if (contoursGeoJson) {
        packageLayers.push({ fileBaseName: `02_${cleanParam}_Contours`, geoJson: contoursGeoJson });
      }
      if (stationGeoFeatures.length > 0) {
        packageLayers.push({
          fileBaseName: `03_${cleanParam}_Stations`,
          geoJson: { type: "FeatureCollection", features: stationGeoFeatures }
        });
      }

      const boundaryLayers = getBoundaryExportLayers();
      boundaryLayers.forEach((bl) => packageLayers.push(bl));

      // Include borderless WGS84 GeoTIFF + World File (.tfw) + MapInfo Raster (.tab)
      const rasterPrefix = `05_${cleanParam}_Georef_Surface`;
      const rasterFiles = buildGeoreferencedRasterFiles(activeData, activeParamName, rasterPrefix);
      extraFiles.push(...rasterFiles);

      // Symbology reference CSV for exact color matching in ArcGIS / MapInfo
      const legendCsvLines = [
        "ZONE_ID,ZONE_NAME,RANGE,COLOR_HEX,RGB_COLOR,AREA_SQKM,AREA_PCT",
        ...classSummary.map(
          (c) => `${c.zoneId},"${c.label.replace(/"/g, '""')}","${c.rangeText}",${c.hex},"${c.rgb}",${c.areaSqKm},${c.areaPct}`
        )
      ];
      extraFiles.push({
        fileName: "00_Symbology_Legend.csv",
        content: legendCsvLines.join("\r\n")
      });

      const areaSuffix = !isStateAll(selectedState)
        ? `${selectedState}${!isDistrictAll(selectedDistrict) ? `_${selectedDistrict}` : ""}`
        : "India";
      const readmeText = [
        "======================================================================",
        `PREPARED GIS MAP PACKAGE - ${activeParamName} (${areaSuffix})`,
        "Compatible with ArcGIS Desktop / ArcGIS Pro, MapInfo Pro, and QGIS",
        "Coordinate Reference System: GCS_WGS_1984 (EPSG:4326)",
        `Interpolation Method: ${interpolationMethod.toUpperCase()}`,
        "======================================================================",
        "",
        "INCLUDED LAYERS:",
        zonesGeoJson ? `1. 01_${cleanParam}_Zones.shp/.tab       -> Polygon classification zones (symbolize by ZONE_NAME / COLOR_HEX)` : "1. (Interpolated Zone Polygons omitted for Station-only / non-raster mode)",
        contoursGeoJson ? `2. 02_${cleanParam}_Contours.shp/.tab    -> Iso-concentration PolyLine contours (attribute: CONTOUR)` : "",
        stationGeoFeatures.length > 0 ? `3. 03_${cleanParam}_Stations.shp/.tab    -> Sample stations Point layer (${stationGeoFeatures.length} wells)` : "",
        boundaryLayers.length > 0 ? `4. 04_Boundary_*.shp/.tab               -> Active administrative boundary polygons` : "",
        rasterFiles.length > 0 ? `5. ${rasterPrefix}.tif / .tfw / .tab     -> Borderless WGS84 Georeferenced GeoTIFF raster` : "",
        "6. 00_Symbology_Legend.csv              -> Exact class ranges, RGB/HEX colors & area sq.km breakdown",
        "",
        "HOW TO OPEN IN ARCGIS PRO / ARCMAP:",
        " - Extract this .zip folder completely.",
        " - Drag and drop the .shp files and .tif file into your Map view.",
        " - Open Symbology -> Unique Values -> select field 'ZONE_NAME' and match colors using 00_Symbology_Legend.csv (or COLOR_HEX / RGB_COLOR).",
        "",
        "HOW TO OPEN IN MAPINFO PROFESSIONAL:",
        " - Extract this .zip folder completely.",
        " - Use Home > Open > Table and select all .tab files directly (every .shp and .tif includes a native .tab file).",
        " - All layers share WGS84 (Earth Projection 1, 104) and stack with exact spatial alignment.",
        ""
      ]
        .filter(Boolean)
        .join("\r\n");

      extraFiles.push({
        fileName: "00_README_ArcGIS_MapInfo.txt",
        content: readmeText
      });

      if (packageLayers.length === 0 && extraFiles.length === 0) {
        showToast("No spatial layers or stations available to export.", "info");
        return;
      }

      const blob = await createGisPackageZip(packageLayers, extraFiles);
      const safeArea = areaSuffix.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
      const packageFileName = `${cleanParam}_${safeArea}_ArcGIS_MapInfo_Package.zip`;
      downloadBlob(blob, packageFileName);

      const summaryParts: string[] = [];
      if (zonesGeoJson) summaryParts.push(`${zonesGeoJson.features.length} Zone Polygons`);
      if (contoursGeoJson) summaryParts.push(`${contoursGeoJson.features.length} Contours`);
      if (stationGeoFeatures.length > 0) summaryParts.push(`${stationGeoFeatures.length} Stations`);
      if (boundaryLayers.length > 0) summaryParts.push(`${boundaryLayers.length} Boundary`);
      if (rasterFiles.length > 0) summaryParts.push("GeoTIFF+TAB");

      showToast(
        `Exported Full ArcGIS/MapInfo GIS Package (${summaryParts.join(" + ")}) in ${packageFileName}!`,
        "success"
      );
    } catch (err: any) {
      console.error("Shapefile export error:", err);
      showToast(err?.message || "Failed to export prepared map GIS package.", "error");
    }
  };

  // Spatial Intersection calculation: Intersecting administrative units for each layer against the AOI boundary (instant lookup)
  const intersectingAdminReport = useMemo(() => {
    if (!aoiLayerId) return null;
    const aoiLayer = layers.find(l => l.id === aoiLayerId);
    if (!aoiLayer || !aoiLayer.geoJson) return null;

    const report: Record<string, {
      layerName: string;
      totalFeatures: number;
      intersectingCount: number;
      names: Array<{ name: string; type: string }>;
    }> = {};

    layers.forEach(layer => {
      if (layer.id === aoiLayerId || !layer.geoJson) return;
      const fList = layer.geoJson.features || (layer.geoJson.type === "Feature" ? [layer.geoJson] : []);
      const clippedF = clippedFeaturesMap[layer.id] || [];
      const matchedNames: Array<{ name: string; type: string }> = [];

      clippedF.forEach((f: any) => {
        const textVal = getFeatureAttributeLabel(f, adminLabelAttribute);
        const info = getAdminFeatureLabel(f);
        const displayName = textVal || info.name;
        if (displayName && !matchedNames.some(m => m.name === displayName)) {
          matchedNames.push({ name: displayName, type: info.type || "Unit" });
        }
      });

      report[layer.id] = {
        layerName: layer.name,
        totalFeatures: fList.length,
        intersectingCount: clippedF.length,
        names: matchedNames
      };
    });

    return report;
  }, [aoiLayerId, layers, clippedFeaturesMap, adminLabelAttribute]);

  // Available DBF / GeoJSON attribute fields across all cut administrative layers
  const cutLayersAvailableAttributes = useMemo(() => {
    if (!aoiLayerId) return [];
    const attrSet = new Set<string>();
    layers.forEach(layer => {
      if (layer.id === aoiLayerId || !layer.geoJson) return;
      const feats = clippedFeaturesMap[layer.id] || layer.geoJson.features || (layer.geoJson.type === "Feature" ? [layer.geoJson] : []);
      const sampleSize = Math.min(feats.length, 100);
      for (let i = 0; i < sampleSize; i++) {
        if (feats[i]?.properties) {
          Object.keys(feats[i].properties).forEach(k => {
            if (k && !k.startsWith("_")) attrSet.add(k);
          });
        }
      }
    });
    return Array.from(attrSet).sort((a, b) => a.localeCompare(b));
  }, [aoiLayerId, layers, clippedFeaturesMap]);

  // Export clipped admin boundaries as ESRI Shapefile (.zip) - instant
  const exportClippedAdminShapefile = async (adminLId: string) => {
    try {
      const aoiLayer = layers.find(l => l.id === aoiLayerId);
      const adminLayer = layers.find(l => l.id === adminLId);
      if (!aoiLayer || !adminLayer) {
        showToast("Please ensure both the Area Shapefile and Admin Layer are selected.", "error");
        return;
      }

      showToast(`Generating clipped Shapefile for "${adminLayer.name}"...`, "info");
      const keptFeatures = clippedFeaturesMap[adminLId] || [];

      if (keptFeatures.length === 0) {
        showToast("No intersecting boundaries found to export.", "error");
        return;
      }

      const clippedGeoJson = {
        type: "FeatureCollection",
        features: keptFeatures
      };

      const baseName = `${adminLayer.name}_Clipped_to_${aoiLayer.name}`;
      const blob = await createShapefileFromGeoJson(clippedGeoJson, baseName);
      downloadBlob(blob, `${baseName}.zip`);
      showToast(`Exported ${keptFeatures.length} clipped administrative boundaries as Shapefile (.zip)!`, "success");
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || "Failed to export clipped shapefile.", "error");
    }
  };

  // Save clipped boundaries as a permanent new layer in the map - instant
  const createPermanentClippedLayer = (adminLId: string) => {
    try {
      const aoiLayer = layers.find(l => l.id === aoiLayerId);
      const adminLayer = layers.find(l => l.id === adminLId);
      if (!aoiLayer || !adminLayer) return;

      const keptFeatures = clippedFeaturesMap[adminLId] || [];
      if (keptFeatures.length === 0) {
        showToast("No intersecting boundaries found to create a layer.", "error");
        return;
      }

      const sampleProps = keptFeatures[0]?.properties || {};
      const propKeys = Object.keys(sampleProps);
      const defaultLabelKey = propKeys.find(k => {
        const l = k.toLowerCase();
        return l.includes("block") || l.includes("dt_nm") || l.includes("dist") || l.includes("st_nm") || l.includes("name");
      }) || propKeys[0] || "";

      const newLayer: ShapefileLayer = {
        id: `layer-clipped-${Date.now()}`,
        name: `${adminLayer.name} (Inside ${aoiLayer.name})`,
        visible: true,
        geoJson: { type: "FeatureCollection", features: keptFeatures },
        strokeColor: "#0f172a",
        strokeWidth: 2.2,
        fillColor: "#93c5fd",
        fillOpacity: 25,
        showLabels: showAdminNamesOnMap,
        labelKey: adminLabelAttribute !== "auto" ? adminLabelAttribute : defaultLabelKey,
        labelColor: adminLabelColor || "#0f172a",
        labelSize: adminLabelSize || 11,
        showStroke: true,
        showInLegend: true
      };

      setLayers(prev => [...prev.map(l => l.id === adminLayer.id ? { ...l, visible: false } : l), newLayer]);
      showToast(`Created clipped layer with ${keptFeatures.length} administrative boundaries!`, "success");
    } catch (err: any) {
      showToast(err?.message || "Failed to create clipped layer.", "error");
    }
  };

  // Requirement 2: Explicitly execute/refresh spatial interpolation on the map
  const handleRunInterpolation = useCallback(() => {
    setShowRaster(true);
    let targetParam = selectedParam;
    if (targetParam === "STATIONS" || !targetParam) {
      targetParam = "EC";
      setSelectedParam("EC");
    }
    setInterpolationTrigger(prev => prev + 1);
    if (showToast) {
      showToast(`Generating ${targetParam} spatial interpolation raster surface...`, "info");
    }
  }, [selectedParam, showToast]);

  // Capture current high-quality map rendering and send to Bulletin report section
  const sendToBulletin = () => {
    const canvas = canvasRefLeft.current;
    if (!canvas) {
      showToast("Could not find the map canvas to capture", "error");
      return;
    }
    try {
      // For ultra high professional grade report quality, we render at 600 DPI for the bulletin report integration
      const tempCanvas = document.createElement("canvas");
      const multiplier = 600 / 96; // 600 DPI pristine high resolution
      const w = Math.round(canvasWidth * multiplier);
      const h = Math.round(canvasHeight * multiplier);
      tempCanvas.width = w;
      tempCanvas.height = h;
      
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) {
        // Fallback to standard resolution capture if context cannot be allocated
        const standardUrl = canvas.toDataURL("image/png");
        if (setBulletinMaps) {
          setBulletinMaps(prev => ({
            ...prev,
            [selectedParam]: standardUrl,
            [selectedParam.toUpperCase()]: standardUrl,
            [selectedParam.toLowerCase()]: standardUrl,
            [paramConfig.name]: standardUrl,
            [paramConfig.name.toUpperCase()]: standardUrl,
            [paramConfig.name.toLowerCase()]: standardUrl,
          }));
          showToast(`Sent current "${selectedParam}" map directly to Annual Report!`, "success");
        } else {
          showToast("Annual Report system integration is currently inactive.", "error");
        }
        return;
      }

      // Render crisp high resolution representation for professional yearbook reports
      const title = customTitle || getMapDefaultTitleAndSubtitle("left").title;
      const subtitle = customSubtitle || getMapDefaultTitleAndSubtitle("left").subtitle;
      
      drawMapInstance(
        tempCtx,
        w,
        h,
        multiplier,
        isComparisonActive ? leftPanelData : parsedData,
        title,
        subtitle,
        isComparisonActive ? leftStats : (leftStats || rightStats),
        false,
        null,
        "left",
        undefined,
        false
      );

      const highResUrl = tempCanvas.toDataURL("image/png");
      if (setBulletinMaps) {
        setBulletinMaps(prev => ({
          ...prev,
          [selectedParam]: highResUrl,
          [selectedParam.toUpperCase()]: highResUrl,
          [selectedParam.toLowerCase()]: highResUrl,
          [paramConfig.name]: highResUrl,
          [paramConfig.name.toUpperCase()]: highResUrl,
          [paramConfig.name.toLowerCase()]: highResUrl,
        }));
        showToast(`Successfully generated and sent high-resolution "${selectedParam}" map to Annual Report section!`, "success");
      } else {
        showToast("Annual Report system integration is currently inactive.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast("Failed to compile map for Annual Report: " + err.message, "error");
    }
  };

  // Send high-density cropped map directly to State Fact Sheet dossier
  const sendToFactSheet = () => {
    try {
      const canvas = canvasRefLeft.current;
      if (!canvas) {
        showToast("Map canvas not ready.", "error");
        return;
      }

      const multiplier = 600 / 96;
      const w = Math.round(canvasWidth * multiplier);
      const h = Math.round(canvasHeight * multiplier);

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext("2d");

      let highResUrl = "";
      if (tempCtx) {
        const title = customTitle || `Distribution of ${paramConfig.name} in ${selectedState || "State"}`;
        const subtitle = customSubtitle || getMapDefaultTitleAndSubtitle("left").subtitle;
        drawMapInstance(
          tempCtx,
          w,
          h,
          multiplier,
          isComparisonActive ? leftPanelData : parsedData,
          title,
          subtitle,
          isComparisonActive ? leftStats : (leftStats || rightStats),
          false,
          null,
          "left",
          selectedParam,
          false
        );

        highResUrl = tempCanvas.toDataURL("image/png");
      } else {
        highResUrl = canvas.toDataURL("image/png");
      }

      if (setBulletinMaps) {
        const isAll = isStateAll(selectedState || "");
        setBulletinMaps(prev => ({
          ...prev,
          "FACT_SHEET_MAP": highResUrl,
          "FACT_SHEET_PARAM": selectedParam,
          "FACT_SHEET_STATE": selectedState || "",
          "FACT_SHEET_TIME": new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          ...(selectedParam.toUpperCase() === "EC" ? {
            "ALL_INDIA_EC": isAll ? highResUrl : (prev["ALL_INDIA_EC"] || highResUrl),
            [`${norm(selectedState || "")}_EC`]: highResUrl,
            "EC": highResUrl
          } : {})
        }));
        showToast(`High-density ${selectedParam} map successfully sent to State Fact Sheet!`, "success");
      } else {
        showToast("Fact Sheet integration is currently inactive.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast("Failed to send map to Fact Sheet: " + err.message, "error");
    }
  };

  // Automated batch generation of all maps using the current customized layout (excluding manual parameter overrides EC, TH, Cl)
  const autoGenerateAndSendAll = async () => {
    if (!setBulletinMaps) {
      showToast("Annual Report system integration is currently inactive.", "error");
      return;
    }

    const paramsToGen = availableParams.filter(p => {
      const norm = p.toUpperCase().trim();
      return norm !== "EC" && norm !== "TH" && norm !== "CL";
    });

    if (paramsToGen.length === 0) {
      showToast("No parameters available for auto-generation.", "error");
      return;
    }

    showToast(`Starting automated generation of ${paramsToGen.length} maps with current custom styles...`, "success");

    try {
      const multiplier = 600 / 96; // 600 DPI pristine high resolution
      const w = Math.round(canvasWidth * multiplier);
      const h = Math.round(canvasHeight * multiplier);

      const generatedMaps: Record<string, string> = {};

      for (const param of paramsToGen) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) continue;

        const config = PARAM_CONFIG[param] || { b1: 1, b2: 10, unit: "mg/L", name: param };
        
        // Compute default title or use custom template
        const title = customTitle 
          ? customTitle.replace(selectedParam, param).replace(selectedParam.toUpperCase(), param.toUpperCase())
          : `Distribution of ${config.name}`;
        const subtitle = customSubtitle || getMapDefaultTitleAndSubtitle("left").subtitle;

        const stats = getStats(isComparisonActive ? leftPanelData : parsedData, param);

        drawMapInstance(
          tempCtx,
          w,
          h,
          multiplier,
          isComparisonActive ? leftPanelData : parsedData,
          title,
          subtitle,
          stats,
          false,
          null,
          "left",
          param, // Pass param override!
          false
        );

        const highResUrl = tempCanvas.toDataURL("image/png");
        generatedMaps[param] = highResUrl;
        generatedMaps[param.toUpperCase()] = highResUrl;
        generatedMaps[param.toLowerCase()] = highResUrl;
        generatedMaps[config.name] = highResUrl;
        generatedMaps[config.name.toUpperCase()] = highResUrl;
        generatedMaps[config.name.toLowerCase()] = highResUrl;
      }

      setBulletinMaps(prev => ({
        ...prev,
        ...generatedMaps
      }));

      showToast(`Successfully generated and sent ${paramsToGen.length} maps (including SAR and RSC) with custom decorations and boundaries directly to the Annual Report!`, "success");
    } catch (err: any) {
      console.error(err);
      showToast("Failed to run automated map generator: " + err.message, "error");
    }
  };

  // Send BOTH Point Map (Monitoring Stations / Point Distribution) AND Parameter Maps simultaneously to Bulletin Report
  const sendPointAndParameterMapsToBulletin = async () => {
    if (!setBulletinMaps) {
      showToast("Annual Report system integration is currently inactive.", "error");
      return;
    }

    showToast("Formatting and generating Point Map & All Parameter Maps for Report...", "success");

    try {
      const multiplier = 600 / 96; // 600 DPI pristine high resolution
      const w = Math.round(canvasWidth * multiplier);
      const h = Math.round(canvasHeight * multiplier);
      const generatedMaps: Record<string, string> = {};

      // 1. Generate Point Map (Monitoring Stations / Sampling Locations)
      const stationCanvas = document.createElement("canvas");
      stationCanvas.width = w;
      stationCanvas.height = h;
      const stationCtx = stationCanvas.getContext("2d");
      if (stationCtx) {
        const stationTitle = customTitle || "Ground Water Quality Monitoring Stations";
        const stationSubtitle = customSubtitle || "Location distribution of water quality monitoring stations";
        const stationStats = getStats(isComparisonActive ? leftPanelData : parsedData, "STATIONS");

        drawMapInstance(
          stationCtx,
          w,
          h,
          multiplier,
          isComparisonActive ? leftPanelData : parsedData,
          stationTitle,
          stationSubtitle,
          stationStats,
          false,
          null,
          "left",
          "STATIONS",
          false // Include boundary & neatline
        );

        const stationUrl = stationCanvas.toDataURL("image/png");
        generatedMaps["STATIONS"] = stationUrl;
        generatedMaps["stations"] = stationUrl;
        generatedMaps["Stations"] = stationUrl;
        generatedMaps["POINT_MAP"] = stationUrl;
      }

      // 2. Generate Parameter Maps for ALL parameters in availableParams
      const paramsToGen = availableParams.filter(p => p.toUpperCase().trim() !== "STATIONS");
      for (const param of paramsToGen) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) continue;

        const config = PARAM_CONFIG[param] || { b1: 1, b2: 10, unit: "mg/L", name: param };
        const title = customTitle 
          ? customTitle.replace(selectedParam, param).replace(selectedParam.toUpperCase(), param.toUpperCase())
          : `Distribution of ${config.name}`;
        const subtitle = customSubtitle || getMapDefaultTitleAndSubtitle("left").subtitle;
        const stats = getStats(isComparisonActive ? leftPanelData : parsedData, param);

        drawMapInstance(
          tempCtx,
          w,
          h,
          multiplier,
          isComparisonActive ? leftPanelData : parsedData,
          title,
          subtitle,
          stats,
          false,
          null,
          "left",
          param,
          false // Include boundary & neatline
        );

        const highResUrl = tempCanvas.toDataURL("image/png");
        generatedMaps[param] = highResUrl;
        generatedMaps[param.toUpperCase()] = highResUrl;
        generatedMaps[param.toLowerCase()] = highResUrl;
        generatedMaps[config.name] = highResUrl;
        generatedMaps[config.name.toUpperCase()] = highResUrl;
        generatedMaps[config.name.toLowerCase()] = highResUrl;
      }

      setBulletinMaps(prev => ({
        ...prev,
        ...generatedMaps
      }));

      showToast(`Successfully generated and sent Point Map & ${paramsToGen.length} Parameter Maps simultaneously to Annual Report!`, "success");
    } catch (err: any) {
      console.error(err);
      showToast("Failed to run simultaneous map generator: " + err.message, "error");
    }
  };

  const downloadCombinedCanvas = () => {
    const canvasL = canvasRefLeft.current;
    const canvasR = canvasRefRight.current;
    if (!canvasL || !canvasR) return;

    const combined = document.createElement("canvas");
    const ctx = combined.getContext("2d");
    if (!ctx) return;

    if (comparisonLayout === "horizontal") {
      combined.width = canvasL.width + canvasR.width + 20;
      combined.height = canvasL.height;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, combined.width, combined.height);
      ctx.drawImage(canvasL, 0, 0);
      ctx.drawImage(canvasR, canvasL.width + 20, 0);
    } else {
      combined.width = canvasL.width;
      combined.height = canvasL.height + canvasR.height + 20;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, combined.width, combined.height);
      ctx.drawImage(canvasL, 0, 0);
      ctx.drawImage(canvasR, 0, canvasL.height + 20);
    }

    const dataUrl = combined.toDataURL("image/jpeg", 1.0);
    const link = document.createElement("a");
    const year = parsedData && parsedData.length > 0 ? (parsedData[0].year || 2025) : 2025;
    link.download = `${selectedParam}_Seasonal_Comparison_${year}.jpg`;
    link.href = dataUrl;
    link.click();
    showToast("Exported combined comparison sheet successfully!", "success");
  };

  return (
    <div className="flex flex-col gap-6 w-full items-stretch min-h-[780px]" id="professional-map-engine">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Interactive Configuration GUI Control Panel Sidebar */}
        <div className="lg:col-span-4 bg-gradient-to-b from-white/95 via-slate-50/90 to-slate-100/80 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/60 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.08),inset_0_1px_2px_rgba(255,255,255,0.85)] flex flex-col gap-5 max-h-[860px] overflow-y-auto custom-scrollbar relative">
          
          {/* Advanced Sober Glossy Header */}
          <div className="flex flex-col gap-1 border-b border-slate-200/60 pb-3">
            <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-700 animate-spin" style={{ animationDuration: "16s" }} />
              GIS CONTROL WORKSTATION
            </span>
            <p className="text-[9.5px] font-bold text-slate-400 leading-normal">
              Manage digital mapping projections, compliance location points, and spatial interpolation engines.
            </p>
          </div>
          
          {/* Settings Tab Navigation */}
          <div className="flex items-center gap-1 bg-slate-100/60 backdrop-blur-md p-1 rounded-2xl border border-slate-200/40 overflow-x-auto shrink-0 custom-scrollbar">
            {[
              { id: "layers", label: "Layers", icon: Layers },
              { id: "basemap", label: "Basemap", icon: MapIcon },
              { id: "shapefile", label: "Shapefile/GeoJSON", icon: Upload },
              { id: "interpolation", label: "Interpolate", icon: Sliders },
              { id: "styling", label: "Styling", icon: SlidersHorizontal },
              { id: "decorations", label: "Elements", icon: Compass }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as "layers" | "basemap" | "interpolation" | "classification" | "styling" | "decorations" | "batch" | "shapefile");
                    if (tab.id === "interpolation") {
                      setShowRaster(true);
                      setInterpolationTrigger(prev => prev + 1);
                    }
                  }}
                  className={`cursor-pointer px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-slate-900 to-slate-850 text-white shadow-[0_4px_12px_rgba(15,23,42,0.18),inset_0_1px_1px_rgba(255,255,255,0.2)] border border-slate-950 scale-[1.02]"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/40"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Active Config Tab Content */}
          <div className="flex-1 flex flex-col gap-4">
            
            {/* 1. Layers Panel */}
            {activeTab === "layers" && (
              <div className="flex flex-col gap-5">
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm">
                  <label className="block text-slate-700 text-xs font-bold mb-2 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                    Select Map Parameter
                  </label>
                  <select
                    value={selectedParam}
                    onChange={(e) => setSelectedParam(e.target.value)}
                    className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-3 shadow-sm hover:border-indigo-500/80 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800"
                  >
                    {availableParams.map(p => (
                      <option key={p} value={p}>
                        {p} - {PARAM_CONFIG[p]?.name || p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                  <span className="text-xs font-extrabold text-slate-800 tracking-wide uppercase text-[10px]">Layer Controls</span>
                  
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl bg-white/60 hover:bg-white hover:scale-[1.01] transition-all border border-slate-100 hover:border-indigo-100 shadow-sm group">
                      <span className="text-xs font-medium text-slate-700 flex items-center gap-2 group-hover:text-indigo-600 transition-colors">
                        <Layers className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition-transform" /> Raster Overlay (Interpolation)
                      </span>
                      <input
                        type="checkbox"
                        checked={showRaster}
                        onChange={(e) => setShowRaster(e.target.checked)}
                        className="cursor-pointer h-4 w-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl bg-white/60 hover:bg-white hover:scale-[1.01] transition-all border border-slate-100 hover:border-emerald-100 shadow-sm group">
                      <span className="text-xs font-medium text-slate-700 flex items-center gap-2 group-hover:text-emerald-600 transition-colors">
                        <CheckCircle className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" /> Sampling Location Points
                      </span>
                      <input
                        type="checkbox"
                        checked={showPoints}
                        onChange={(e) => setShowPoints(e.target.checked)}
                        className="cursor-pointer h-4 w-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl bg-white/60 hover:bg-white hover:scale-[1.01] transition-all border border-slate-100 hover:border-amber-100 shadow-sm group">
                      <span className="text-xs font-medium text-slate-700 flex items-center gap-2 group-hover:text-amber-600 transition-colors">
                        <Info className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" /> Feature Labels (Locations)
                      </span>
                      <input
                        type="checkbox"
                        checked={showLabels}
                        onChange={(e) => setShowLabels(e.target.checked)}
                        className="cursor-pointer h-4 w-4 rounded text-amber-600 border-slate-300 focus:ring-amber-500"
                      />
                    </label>
                  </div>
                </div>

                {/* Uploaded Shapefile Layers with tick and untick facility */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                  <span className="text-xs font-extrabold text-slate-800 tracking-wide uppercase text-[10px] flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-500" />
                      Uploaded Shapefiles (Layers)
                    </span>
                    {layers.length > 0 && (
                      <span className="bg-indigo-100 text-indigo-800 text-[9px] px-2 py-0.5 rounded-full font-bold">
                        {layers.length} {layers.length === 1 ? 'layer' : 'layers'}
                      </span>
                    )}
                  </span>

                  {layers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-5 bg-white/50 rounded-2xl border border-dashed border-slate-200 text-center">
                      <Layers className="w-7 h-7 text-slate-300 mb-1.5" />
                      <p className="text-[11px] text-slate-400 font-medium">No custom shapefiles uploaded yet</p>
                      <button
                        onClick={() => setActiveTab("shapefile")}
                        className="mt-2.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer"
                      >
                        Upload Shapefile
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl bg-white/60 hover:bg-white transition-all border border-slate-100 shadow-sm group">
                        <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-indigo-500" />
                          Master Boundaries Layer Toggle
                        </span>
                        <input
                          type="checkbox"
                          checked={showShapefile}
                          onChange={(e) => setShowShapefile(e.target.checked)}
                          className="cursor-pointer h-4 w-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                        />
                      </label>

                      <div className="border-t border-slate-100 my-0.5"></div>

                      {layers.map((layer) => (
                        <div
                          key={layer.id}
                          className={`flex items-center justify-between p-2 rounded-xl transition-all border shadow-sm ${
                            layer.visible
                              ? "bg-indigo-50/25 border-indigo-100/40 hover:bg-indigo-50/45"
                              : "bg-slate-50/50 border-slate-100/50 hover:bg-slate-50 opacity-70"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Color preview indicator */}
                            <div
                              className="w-2.5 h-2.5 rounded-md border shadow-sm shrink-0"
                              style={{
                                backgroundColor: layer.fillColor || "#cbd5e1",
                                borderColor: layer.strokeColor || "#94a3b8",
                                borderWidth: "1px",
                              }}
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-slate-700 truncate">
                                {layer.name}
                              </span>
                              <span className="text-[9px] font-semibold text-slate-400">
                                {layer.geoJson?.features?.length || 0} features
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setLayers(prev =>
                                  prev.map(l =>
                                    l.id === layer.id ? { ...l, visible: !l.visible } : l
                                  )
                                );
                              }}
                              title={layer.visible ? "Hide Layer" : "Show Layer"}
                              className={`p-1 rounded-lg cursor-pointer transition-colors ${
                                layer.visible
                                  ? "text-indigo-600 hover:bg-indigo-100/50"
                                  : "text-slate-400 hover:bg-slate-200"
                              }`}
                            >
                              {layer.visible ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>
                            
                            <input
                              type="checkbox"
                              checked={layer.visible}
                              onChange={() => {
                                setLayers(prev =>
                                  prev.map(l =>
                                    l.id === layer.id ? { ...l, visible: !l.visible } : l
                                  )
                                );
                              }}
                              className="cursor-pointer h-3.5 w-3.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3.5">
                  <span className="text-xs font-extrabold text-slate-800 tracking-wide uppercase text-[10px]">Transparency Control</span>
                  
                  <div className="flex flex-col gap-3">
                    <div className="bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                      <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
                        <span>RASTER OPACITY</span>
                        <span className="font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{rasterOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={rasterOpacity}
                        onChange={(e) => setRasterOpacity(parseInt(e.target.value))}
                        className="w-full cursor-pointer accent-indigo-600 mt-1"
                      />
                    </div>

                    <div className="bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                      <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
                        <span>BASEMAP OPACITY</span>
                        <span className="font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{basemapOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={basemapOpacity}
                        onChange={(e) => setBasemapOpacity(parseInt(e.target.value))}
                        className="w-full cursor-pointer accent-indigo-600 mt-1"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-50/80 to-violet-50/50 backdrop-blur-md p-4 rounded-3xl border border-indigo-100/60 shadow-sm flex flex-col gap-3">
                  <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5 uppercase text-[10px] tracking-wide">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Comparative Seasonal Setup
                  </span>
                  
                  <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl bg-white/70 hover:bg-white transition-all border border-indigo-100/30 shadow-sm group">
                    <span className="text-xs font-semibold text-indigo-900">Enable Side-by-Side Panels</span>
                    <input
                      type="checkbox"
                      checked={generateComparisonMode}
                      onChange={(e) => setGenerateComparisonMode(e.target.checked)}
                      className="cursor-pointer h-4 w-4 rounded text-indigo-600 border-indigo-300 focus:ring-indigo-500"
                    />
                  </label>

                  {isComparisonActive && (
                    <div className="flex flex-col gap-3 bg-white/50 p-3 rounded-2xl border border-indigo-100/30">
                      <div>
                        <label className="block text-[10px] text-indigo-900 font-extrabold mb-1.5 uppercase">LAYOUT STYLE</label>
                        <select
                          value={comparisonLayout}
                          onChange={(e) => setComparisonLayout(e.target.value as "horizontal" | "vertical")}
                          className="w-full text-xs font-bold bg-white border border-indigo-200/80 rounded-xl p-2 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800"
                        >
                          <option value="horizontal">Horizontal Split</option>
                          <option value="vertical">Vertical Split</option>
                        </select>
                      </div>

                      <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl bg-rose-50/50 hover:bg-rose-50 transition-all border border-rose-100/50 shadow-sm group">
                        <span className="text-xs font-semibold text-rose-900">Show Difference Map (Post − Pre)</span>
                        <input
                          type="checkbox"
                          checked={showDifferenceMap}
                          onChange={(e) => setShowDifferenceMap(e.target.checked)}
                          className="cursor-pointer h-4 w-4 rounded text-rose-600 border-rose-300 focus:ring-rose-500"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. Basemap Tab */}
            {activeTab === "basemap" && (
              <div className="flex flex-col gap-5">
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-2">
                  <label className="block text-slate-700 text-xs font-bold mb-0.5 flex items-center gap-1.5">
                    <MapIcon className="w-3.5 h-3.5 text-indigo-500" />
                    Select Map Background / Basemap
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 mb-1">
                    <button
                      type="button"
                      onClick={() => setBasemap("No Basemap")}
                      className={`py-2 px-2.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                        basemap === "No Basemap"
                          ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      Clean White
                    </button>
                    <button
                      type="button"
                      onClick={() => setBasemap("Transparent (No Background)")}
                      className={`py-2 px-2.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                        basemap === "Transparent (No Background)"
                          ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      Transparent BG
                    </button>
                  </div>
                  <select
                    value={basemap}
                    onChange={(e) => setBasemap(e.target.value)}
                    className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-3 shadow-sm hover:border-indigo-500/80 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800"
                  >
                    {Object.keys(BASEMAP_STYLES).map(k => (
                      <option key={k} value={k}>{k === "No Basemap" ? "Clean White (No Basemap)" : k}</option>
                    ))}
                  </select>
                </div>

                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-1.5">
                  <label className="block text-slate-700 text-xs font-bold mb-1 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-indigo-500" />
                    Georeference Projection
                  </label>
                  <select
                    value={projection}
                    onChange={(e) => setProjection(e.target.value as "wgs84" | "mercator" | "utm")}
                    className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-3 shadow-sm hover:border-indigo-500/80 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800"
                  >
                    <option value="wgs84">WGS 84 Geographic coordinate system</option>
                    <option value="mercator">Web Mercator projection</option>
                    <option value="utm">UTM projection (Universal Transverse Mercator)</option>
                  </select>
                </div>

                {projection === "utm" && (
                  <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-1.5">
                    <label className="block text-slate-700 text-xs font-bold mb-1">UTM Zone (India region: 44)</label>
                    <input
                      type="number"
                      value={utmZone}
                      onChange={(e) => setUtmZone(parseInt(e.target.value))}
                      className="w-full text-xs bg-white/95 border border-slate-200/80 rounded-xl p-3 shadow-inner hover:border-indigo-500/80 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-semibold text-slate-800"
                    />
                  </div>
                )}

                <div className="bg-gradient-to-br from-indigo-50/40 to-violet-50/20 backdrop-blur-md p-4.5 rounded-[2rem] border border-indigo-100/40 text-[11px] text-slate-600 flex flex-col gap-2 shadow-sm">
                  <span className="font-extrabold text-slate-800 flex items-center gap-1.5 text-xs">
                    <Info className="w-4 h-4 text-indigo-500" /> Geographic Bounds (India region)
                  </span>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="bg-white/60 p-2 rounded-xl border border-slate-100 flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Lattitude (N)</span>
                      <span className="font-mono text-slate-700 font-bold mt-0.5">
                        {mapExtent.mapMinLat.toFixed(2)}° to {mapExtent.mapMaxLat.toFixed(2)}°
                      </span>
                    </div>
                    <div className="bg-white/60 p-2 rounded-xl border border-slate-100 flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Longitude (E)</span>
                      <span className="font-mono text-slate-700 font-bold mt-0.5">
                        {mapExtent.mapMinLng.toFixed(2)}° to {mapExtent.mapMaxLng.toFixed(2)}°
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Shapefile/GeoJSON Tab */}
            {activeTab === "shapefile" && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-indigo-500" />
                    Multi-Layer Shapefiles & Boundaries
                  </span>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    Upload multiple <b>GeoJSON</b> or <b>Zipped Shapefiles</b> as vector layers. Toggle visibility, edit styles, select attribute-level labels, and set the raster clipping mask dynamically.
                  </p>
                </div>

                {/* Drag-and-drop file uploader */}
                <div
                  onClick={() => document.getElementById("geojson-file-input")?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-indigo-500/80 rounded-[2rem] p-6 text-center cursor-pointer bg-white/40 hover:bg-white hover:scale-[1.01] hover:shadow-[0_12px_24px_-10px_rgba(79,70,229,0.15)] transition-all duration-300 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
                >
                  <input
                    id="geojson-file-input"
                    type="file"
                    accept=".json,.geojson,.zip"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (files && files.length > 0) {
                        const fileList = Array.from(files);
                        for (const file of fileList) {
                          await new Promise<void>((resolve) => {
                            const fileObj = file as any;
                            if (fileObj.name.toLowerCase().endsWith(".zip")) {
                              const reader = new FileReader();
                              reader.onload = async (evt) => {
                                try {
                                  const buffer = evt.target?.result as ArrayBuffer;
                                  const geojson = (await shp(buffer)) as any;
                                  
                                  // Extract properties
                                  const keys = new Set<string>();
                                  const features = geojson.features || (geojson.type === "Feature" ? [geojson] : []);
                                  features.forEach((f: any) => {
                                    if (f && f.properties) {
                                      Object.keys(f.properties).forEach(k => keys.add(k));
                                    }
                                  });
                                  const propertyKeys = Array.from(keys);
                                  const defaultLabelKey = propertyKeys.find(k => {
                                    const l = k.toLowerCase();
                                    return l.includes("name") || l.includes("state") || l.includes("dist") || l.includes("st_nm") || l.includes("dt_nm");
                                  }) || propertyKeys[0] || "";

                                  const autoColorAttr = propertyKeys.find(k => {
                                    const l = k.toLowerCase();
                                    return l.includes("aquifer") || l.includes("aq_") || l.includes("aqtype") || l.includes("rock") || l.includes("litho");
                                  }) || "";

                                  const initialMapping = autoColorAttr ? getInitialColorMapping(geojson, autoColorAttr) : {};

                                  // Nice color combo
                                  const colors = [
                                    { stroke: "#2563eb", fill: "#60a5fa" }, // Blue
                                    { stroke: "#16a34a", fill: "#4ade80" }, // Green
                                    { stroke: "#dc2626", fill: "#fca5a5" }, // Red
                                    { stroke: "#d97706", fill: "#fcd34d" }, // Yellow/Amber
                                    { stroke: "#7c3aed", fill: "#c084fc" }, // Violet
                                    { stroke: "#0d9488", fill: "#2dd4bf" }, // Teal
                                    { stroke: "#db2777", fill: "#f472b6" }, // Pink
                                  ];
                                  const colorCombo = colors[Math.floor(Math.random() * colors.length)];

                                  const newLayer: ShapefileLayer = {
                                    id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                    name: fileObj.name.replace(/\.[^/.]+$/, ""), // remove extension
                                    visible: true,
                                    geoJson: geojson,
                                    strokeColor: colorCombo.stroke,
                                    strokeWidth: 2.0,
                                    fillColor: colorCombo.fill,
                                    fillOpacity: 45, // default opacity slightly higher for filled aquifers
                                    showLabels: true,
                                    labelKey: defaultLabelKey,
                                    labelColor: "#1e293b",
                                    labelSize: 11,
                                    colorAttribute: autoColorAttr,
                                    colorMapping: initialMapping,
                                    showStroke: true,
                                    showInLegend: true
                                  };
                                  setLayers(prev => [...prev, newLayer]);
                                  setUploadedGeoJson(geojson);
                                  setShapefileName(fileObj.name);
                                  showToast(`Zipped Shapefile "${fileObj.name}" loaded as layer!`, "success");
                                } catch (err) {
                                  console.error(err);
                                  showToast(`Error parsing zipped shapefile "${fileObj.name}". Verify .shp and .dbf files are present.`, "error");
                                }
                                resolve();
                              };
                              reader.readAsArrayBuffer(fileObj);
                            } else {
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                try {
                                  const parsed = JSON.parse(evt.target?.result as string);
                                  
                                  const keys = new Set<string>();
                                  const features = parsed.features || (parsed.type === "Feature" ? [parsed] : []);
                                  features.forEach((f: any) => {
                                    if (f && f.properties) {
                                      Object.keys(f.properties).forEach(k => keys.add(k));
                                    }
                                  });
                                  const propertyKeys = Array.from(keys);
                                  const defaultLabelKey = propertyKeys.find(k => {
                                    const l = k.toLowerCase();
                                    return l.includes("name") || l.includes("state") || l.includes("dist") || l.includes("st_nm") || l.includes("dt_nm");
                                  }) || propertyKeys[0] || "";

                                  const autoColorAttr = propertyKeys.find(k => {
                                    const l = k.toLowerCase();
                                    return l.includes("aquifer") || l.includes("aq_") || l.includes("aqtype") || l.includes("rock") || l.includes("litho");
                                  }) || "";

                                  const initialMapping = autoColorAttr ? getInitialColorMapping(parsed, autoColorAttr) : {};

                                  const colors = [
                                    { stroke: "#2563eb", fill: "#60a5fa" },
                                    { stroke: "#16a34a", fill: "#4ade80" },
                                    { stroke: "#dc2626", fill: "#fca5a5" },
                                    { stroke: "#d97706", fill: "#fcd34d" },
                                    { stroke: "#7c3aed", fill: "#c084fc" },
                                    { stroke: "#0d9488", fill: "#2dd4bf" },
                                    { stroke: "#db2777", fill: "#f472b6" },
                                  ];
                                  const colorCombo = colors[Math.floor(Math.random() * colors.length)];

                                  const newLayer: ShapefileLayer = {
                                    id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                    name: fileObj.name.replace(/\.[^/.]+$/, ""),
                                    visible: true,
                                    geoJson: parsed,
                                    strokeColor: colorCombo.stroke,
                                    strokeWidth: 2.0,
                                    fillColor: colorCombo.fill,
                                    fillOpacity: 45,
                                    showLabels: true,
                                    labelKey: defaultLabelKey,
                                    labelColor: "#1e293b",
                                    labelSize: 11,
                                    colorAttribute: autoColorAttr,
                                    colorMapping: initialMapping,
                                    showStroke: true,
                                    showInLegend: true
                                  };
                                  setLayers(prev => [...prev, newLayer]);
                                  setUploadedGeoJson(parsed);
                                  setShapefileName(fileObj.name);
                                  showToast(`Boundary "${fileObj.name}" loaded as layer!`, "success");
                                } catch (err) {
                                  showToast(`Invalid GeoJSON in "${fileObj.name}".`, "error");
                                }
                                resolve();
                              };
                              reader.readAsText(fileObj);
                            }
                          });
                        }
                      }
                    }}
                  />
                  <div className="p-3 bg-slate-100/80 rounded-full group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-inner group-hover:scale-110">
                    <Plus className="w-5 h-5 text-indigo-600 group-hover:text-white transition-colors" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">Add New Layer (GeoJSON / Zip)</span>
                  <span className="text-[10px] text-slate-400">Supports .json, .geojson, or zipped .shp files</span>
                </div>

                {/* Clip Target Selection Mask */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-indigo-500" /> Raster Interpolation Clip Mask
                  </span>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Select which boundary outline clips the spatial grid/raster interpolation surface.
                  </p>
                  <select
                    value={clipTarget}
                    onChange={(e) => setClipTarget(e.target.value)}
                    className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-3 shadow-sm hover:border-indigo-500/80 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800"
                  >
                    <option value="none">No Clipping (Rectangular Grid)</option>
                    <option value="india">India National Boundary</option>
                    {layers.map(l => (
                      <option key={l.id} value={l.id}>Clip to Layer: {l.name}</option>
                    ))}
                  </select>
                </div>

                {/* Area Shapefile Auto-Clip & Admin Boundary Intersection Tool */}
                {layers.length >= 1 && (
                  <div className="bg-gradient-to-br from-indigo-50/70 via-white/80 to-purple-50/60 backdrop-blur-md p-4 rounded-3xl border border-indigo-200/80 shadow-md flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-600 text-white rounded-xl shadow-sm">
                          <Scissors className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                            Area Shapefile Auto-Clip (State / District / Block)
                          </h4>
                          <span className="text-[10px] text-slate-500 font-medium">
                            Automatically cuts outer districts/blocks and shows only those within area
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full">
                        Spatial Cut
                      </span>
                    </div>

                    {/* Select AOI Layer */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                        <MapIcon className="w-3 h-3 text-indigo-600" /> Area of Interest (AOI / Project Shapefile)
                      </label>
                      <select
                        value={aoiLayerId}
                        onChange={(e) => setAoiLayerId(e.target.value)}
                        className="w-full text-xs font-bold bg-white border border-indigo-200 rounded-xl p-2.5 shadow-sm text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value="">-- Choose Area / Catchment Shapefile --</option>
                        {layers.map((l) => (
                          <option key={l.id} value={l.id}>
                            📍 {l.name} ({l.geoJson?.features ? `${l.geoJson.features.length} features` : "1 polygon"})
                          </option>
                        ))}
                      </select>
                    </div>

                    {aoiLayerId && (
                      <div className="flex flex-col gap-3 pt-2 border-t border-indigo-100">
                        {/* Auto-cut toggle */}
                        <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-indigo-100 cursor-pointer hover:bg-indigo-50/50 transition-colors shadow-xs">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-900">
                              ✂️ Auto-Cut Admin Layers to Area Shapefile
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Hides any districts, blocks, or states outside the area boundary
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={autoCutAdminToAoi}
                            onChange={(e) => setAutoCutAdminToAoi(e.target.checked)}
                            className="cursor-pointer h-4 w-4 text-indigo-600 rounded"
                          />
                        </label>

                        {/* Show Names on Map & Cutting Mode */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-indigo-100 cursor-pointer shadow-xs hover:border-indigo-300 transition-colors">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                <Tag className="w-3.5 h-3.5 text-indigo-600" /> Show Names on Map
                              </span>
                              <span className="text-[9.5px] text-slate-500">
                                Display District, Block, State, or custom labels
                              </span>
                            </div>
                            <input
                              type="checkbox"
                              checked={showAdminNamesOnMap}
                              onChange={(e) => setShowAdminNamesOnMap(e.target.checked)}
                              className="cursor-pointer h-4 w-4 text-indigo-600 rounded"
                            />
                          </label>

                          <label className="sm:col-span-2 flex items-center justify-between p-2.5 bg-white rounded-xl border border-indigo-100 cursor-pointer shadow-xs hover:border-indigo-300 transition-colors">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900">Show Neighbouring State / District Names</span>
                              <span className="text-[9.5px] text-slate-500">
                                Off by default — enable only when neighbouring units outside selected state are required
                              </span>
                            </div>
                            <input
                              type="checkbox"
                              checked={showNeighbourLabels}
                              onChange={(e) => setShowNeighbourLabels(e.target.checked)}
                              className="cursor-pointer h-4 w-4 text-indigo-600 rounded"
                            />
                          </label>

                          {/* Cutting Mode */}
                          <div className="flex flex-col justify-center p-2 bg-white rounded-xl border border-indigo-100 shadow-xs">
                            <span className="text-[9.5px] font-bold text-slate-500 uppercase mb-1">Cutting Mode</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setAdminCutMode("intersect")}
                                className={`flex-1 text-[10px] font-bold py-1 px-1.5 rounded-lg transition-all ${
                                  adminCutMode === "intersect"
                                    ? "bg-indigo-600 text-white shadow-xs"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                                title="Keep full boundaries of all districts/blocks that touch the area"
                              >
                                Whole Polygons
                              </button>
                              <button
                                type="button"
                                onClick={() => setAdminCutMode("exact")}
                                className={`flex-1 text-[10px] font-bold py-1 px-1.5 rounded-lg transition-all ${
                                  adminCutMode === "exact"
                                    ? "bg-indigo-600 text-white shadow-xs"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                                title="Slice district/block boundaries exactly along the area outline (Cookie-Cutter)"
                              >
                                Exact Slice
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Cut Administrative Labels Customizer */}
                        {showAdminNamesOnMap && (
                          <div className="p-3.5 bg-white/95 rounded-2xl border border-indigo-200 shadow-sm flex flex-col gap-3">
                            <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                              <div className="flex items-center gap-1.5">
                                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="text-[11px] font-black text-indigo-950 uppercase tracking-wider">
                                  Cut Boundary Label Configuration
                                </span>
                              </div>
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {adminLabelShowHalo ? "Outline Enabled" : "Simple Name (No Background)"}
                              </span>
                            </div>

                            {/* 1. What to show on map (District, Block, State, or custom attribute) */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                                <span>What to Show on Cut Map?</span>
                                <span className="text-[9px] font-semibold text-indigo-600">
                                  Active: <b>{adminLabelAttribute === "auto" ? "Smart Auto" : adminLabelAttribute === "district" ? "District Name" : adminLabelAttribute === "block" ? "Block Name" : adminLabelAttribute === "state" ? "State Name" : adminLabelAttribute}</b>
                                </span>
                              </label>

                              {/* Quick selection chips */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                {[
                                  { id: "auto", label: "Smart Auto", desc: "Auto detected" },
                                  { id: "district", label: "District Name", desc: "dt_nm / district" },
                                  { id: "block", label: "Block / Tehsil", desc: "block_name / tehsil" },
                                  { id: "state", label: "State Name", desc: "st_nm / state" }
                                ].map(opt => (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setAdminLabelAttribute(opt.id)}
                                    className={`py-1.5 px-2 rounded-xl text-left border transition-all cursor-pointer flex flex-col ${
                                      adminLabelAttribute === opt.id
                                        ? "bg-indigo-600 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-200"
                                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                                    }`}
                                  >
                                    <span className="text-[10.5px] font-bold">{opt.label}</span>
                                    <span className={`text-[8.5px] ${adminLabelAttribute === opt.id ? "text-indigo-100" : "text-slate-400"}`}>
                                      {opt.desc}
                                    </span>
                                  </button>
                                ))}
                              </div>

                              {/* Dropdown for any other DBF / GeoJSON attribute */}
                              <div className="flex flex-col gap-1 mt-1">
                                <span className="text-[9.5px] font-bold text-slate-500">
                                  Or choose any shapefile attribute field:
                                </span>
                                <select
                                  value={adminLabelAttribute}
                                  onChange={(e) => setAdminLabelAttribute(e.target.value)}
                                  className="w-full text-xs font-semibold bg-white border border-indigo-200 rounded-xl p-2 text-slate-800 cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                >
                                  <optgroup label="Standard Administrative Labels">
                                    <option value="auto">Smart Auto-Detect (Block &gt; District &gt; State)</option>
                                    <option value="district">District Name (Clean / No Suffix)</option>
                                    <option value="block">Block / Tehsil Name (Clean / No Suffix)</option>
                                    <option value="state">State Name</option>
                                  </optgroup>
                                  {cutLayersAvailableAttributes.length > 0 && (
                                    <optgroup label={`Shapefile DBF Attributes (${cutLayersAvailableAttributes.length} detected)`}>
                                      {cutLayersAvailableAttributes.map(attr => (
                                        <option key={attr} value={attr}>
                                          Attribute: {attr}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                              </div>
                            </div>

                            {/* 2. Font Size Control with presets */}
                            <div className="flex flex-col gap-1.5 pt-2 border-t border-indigo-50">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
                                  Label Font Size
                                </label>
                                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                                  {adminLabelSize} px
                                </span>
                              </div>
                              <input
                                type="range"
                                min={8}
                                max={32}
                                step={1}
                                value={adminLabelSize}
                                onChange={(e) => setAdminLabelSize(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                              />
                              <div className="flex items-center gap-1.5">
                                {[9, 11, 13, 16, 20, 24].map(sz => (
                                  <button
                                    key={sz}
                                    type="button"
                                    onClick={() => setAdminLabelSize(sz)}
                                    className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                                      adminLabelSize === sz
                                        ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                                        : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                                    }`}
                                  >
                                    {sz}px
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* 3. Text Color & Styling (Clean Simple Text - No White Halo by default) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-indigo-50">
                              {/* Color Picker & Swatches */}
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
                                  Text Color
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={adminLabelColor}
                                    onChange={(e) => setAdminLabelColor(e.target.value)}
                                    className="w-8 h-8 rounded-lg cursor-pointer border border-slate-300 p-0.5"
                                  />
                                  <div className="flex items-center gap-1 flex-1">
                                    {[
                                      { col: "#0f172a", name: "Black/Charcoal" },
                                      { col: "#1e3a8a", name: "Deep Navy" },
                                      { col: "#065f46", name: "Forest" },
                                      { col: "#831843", name: "Wine" },
                                      { col: "#b91c1c", name: "Crimson" },
                                      { col: "#ffffff", name: "White" }
                                    ].map(c => (
                                      <button
                                        key={c.col}
                                        type="button"
                                        onClick={() => setAdminLabelColor(c.col)}
                                        style={{ backgroundColor: c.col }}
                                        title={c.name}
                                        className={`w-5 h-5 rounded-md border transition-transform ${
                                          adminLabelColor.toLowerCase() === c.col.toLowerCase()
                                            ? "ring-2 ring-indigo-500 scale-110 border-white shadow-xs"
                                            : "border-slate-300 hover:scale-105"
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Font Family, Weight, Italic & Halo Option (User Requirements 1 & 3) */}
                              <div className="flex flex-col gap-2 justify-center">
                                {/* Font Family selector */}
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
                                    Label Font Family
                                  </label>
                                  <select
                                    value={adminLabelFontFamily}
                                    onChange={(e) => setAdminLabelFontFamily(e.target.value)}
                                    className="w-full text-xs font-semibold bg-white border border-indigo-200 rounded-xl p-2 text-slate-800 cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  >
                                    <option value="Times New Roman">Times New Roman (Standard)</option>
                                    <option value="Arial">Arial (Sans-Serif)</option>
                                    <option value="Calibri">Calibri</option>
                                    <option value="Georgia">Georgia (Serif)</option>
                                    <option value="Trebuchet MS">Trebuchet MS</option>
                                    <option value="Courier New">Courier Mono</option>
                                    <option value="Verdana">Verdana</option>
                                  </select>
                                </div>

                                <div className="flex items-center justify-between pt-1">
                                  <span className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
                                    Style & Weight
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setAdminLabelWeight(w => w === "bold" ? "normal" : "bold")}
                                      className={`px-3 py-1 text-[10.5px] font-black rounded-lg border transition-all cursor-pointer ${
                                        adminLabelWeight === "bold"
                                          ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                                          : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                                      }`}
                                      title="Toggle Bold attribute labels"
                                    >
                                      Bold
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setAdminLabelItalic(i => !i)}
                                      className={`px-3 py-1 text-[10.5px] font-bold italic rounded-lg border transition-all cursor-pointer ${
                                        adminLabelItalic
                                          ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                                          : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                                      }`}
                                      title="Toggle Italic attribute labels"
                                    >
                                      Italic
                                    </button>
                                  </div>
                                </div>

                                <label className="flex items-center gap-1.5 cursor-pointer mt-0.5">
                                  <input
                                    type="checkbox"
                                    checked={adminLabelShowHalo}
                                    onChange={(e) => setAdminLabelShowHalo(e.target.checked)}
                                    className="cursor-pointer h-3.5 w-3.5 text-indigo-600 rounded"
                                  />
                                  <span className="text-[9.5px] text-slate-600">
                                    Add white outline/halo (disabled for simple clean name)
                                  </span>
                                </label>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Intersecting Admin Units Report Banner */}
                        {intersectingAdminReport && Object.keys(intersectingAdminReport).length > 0 && (
                          <div className="flex flex-col gap-2 p-3 bg-white/90 rounded-2xl border border-indigo-200 shadow-xs">
                            <span className="text-[10px] font-extrabold text-indigo-900 uppercase tracking-wider flex items-center gap-1">
                              <Tag className="w-3.5 h-3.5 text-indigo-600" />
                              Detected Intersecting Administrative Units
                            </span>

                            {Object.entries(intersectingAdminReport).map(([layerId, rep]) => {
                              if (rep.intersectingCount === 0) return null;
                              return (
                                <div key={layerId} className="flex flex-col gap-1.5 pb-2 border-b border-indigo-50 last:border-none">
                                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                                    <span>Layer: {rep.layerName}</span>
                                    <span className="text-indigo-600 font-mono text-[10px]">
                                      {rep.intersectingCount} of {rep.totalFeatures} units inside
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
                                    {rep.names.map((item, nIdx) => (
                                      <span
                                        key={nIdx}
                                        className="inline-flex items-center gap-1 text-[9.5px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200/80 px-2 py-0.5 rounded-full"
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                                        {item.name}
                                      </span>
                                    ))}
                                  </div>

                                  <div className="flex items-center gap-2 mt-1">
                                    <button
                                      type="button"
                                      onClick={() => exportClippedAdminShapefile(layerId)}
                                      className="flex-1 cursor-pointer bg-slate-900 hover:bg-black text-white text-[10px] font-bold py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 shadow-sm transition-all"
                                      title="Download clipped district/block boundaries as ESRI Shapefile (.zip)"
                                    >
                                      <Download className="w-3 h-3 text-indigo-300" /> Download Clipped Shapefile (.zip)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => createPermanentClippedLayer(layerId)}
                                      className="flex-1 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 shadow-sm transition-all"
                                      title="Save these clipped boundaries as a standalone permanent map layer"
                                    >
                                      <Plus className="w-3 h-3" /> Save Clipped Layer
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Loaded Layers List */}
                {layers.length > 0 && (
                  <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                    <label className="flex items-center justify-between cursor-pointer p-2.5 bg-indigo-50/40 hover:bg-indigo-50/80 border border-indigo-100/30 rounded-xl transition-all shadow-sm">
                      <span className="text-[11px] font-bold text-indigo-950">Show Shapefiles in Legend Block</span>
                      <input
                        type="checkbox"
                        checked={showShapefileInLegend}
                        onChange={(e) => setShowShapefileInLegend(e.target.checked)}
                        className="cursor-pointer h-4 w-4 rounded text-indigo-600 border-indigo-300 focus:ring-indigo-500"
                      />
                    </label>
                    <span className="text-xs font-extrabold text-slate-800 tracking-wide uppercase text-[10px]">Active Map Layers ({layers.length})</span>
                    <div className="flex flex-col gap-2">
                      {layers.map((layer) => {
                        // Extract properties for this specific layer
                        const keys = new Set<string>();
                        const features = layer.geoJson.features || (layer.geoJson.type === "Feature" ? [layer.geoJson] : []);
                        features.forEach((f: any) => {
                          if (f && f.properties) {
                            Object.keys(f.properties).forEach(k => keys.add(k));
                          }
                        });
                        const propertyKeys = Array.from(keys);

                        return (
                          <div key={layer.id} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l));
                                  }}
                                  className="text-slate-500 hover:text-indigo-600 cursor-pointer shrink-0"
                                  title={layer.visible ? "Hide Layer" : "Show Layer"}
                                >
                                  {layer.visible ? <Eye className="w-4 h-4 text-indigo-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                                </button>
                                <span className="text-xs font-bold text-slate-800 truncate" title={layer.name}>
                                  {layer.name}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  setLayers(prev => prev.filter(l => l.id !== layer.id));
                                  if (clipTarget === layer.id) {
                                    setClipTarget("india");
                                  }
                                  showToast(`Layer "${layer.name}" removed`, "info");
                                }}
                                className="cursor-pointer text-slate-400 hover:text-red-500 transition-colors p-1"
                                title="Remove Layer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="text-[10px] text-slate-400 font-medium flex justify-between items-center px-1">
                              <span>Features: {layer.geoJson.features ? layer.geoJson.features.length : 1} items</span>
                            </div>

                            <div className="flex gap-2 mt-1 px-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const bounds = getLayerBounds(layer);
                                  if (bounds) {
                                    const centerLng = (bounds.minLng + bounds.maxLng) / 2;
                                    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
                                    zoomToCentroid(centerLng, centerLat, bounds);
                                    showToast(`Centered map on layer: ${layer.name}`, "info");
                                  } else {
                                    showToast("Could not determine layer bounds", "error");
                                  }
                                }}
                                className="flex-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 border border-indigo-100 transition-colors"
                                title="Center Map on this Layer"
                              >
                                <Maximize2 className="w-3.5 h-3.5" /> Zoom Layer
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAttributeLayerId(layer.id);
                                  setAttributeSearchQuery("");
                                  setAttributePage(1);
                                  // Scroll to attribute table view smoothly
                                  setTimeout(() => {
                                    document.getElementById("attribute-table-section")?.scrollIntoView({ behavior: "smooth" });
                                  }, 100);
                                  showToast(`Opened attribute table for ${layer.name}`, "success");
                                }}
                                className="flex-1 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 border border-slate-200 transition-colors"
                                title="Inspect Attribute Table"
                              >
                                <Table className="w-3.5 h-3.5 text-slate-500" /> Attributes
                              </button>
                            </div>

                            {/* Styling details */}
                            {layer.visible && (
                              <div className="mt-2 pt-2 border-t border-slate-200/60 flex flex-col gap-2.5">
                                <div className="flex items-center justify-between gap-2 p-1 bg-white border border-slate-100 rounded-xl">
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={layer.showInLegend !== false}
                                      onChange={(e) => {
                                        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, showInLegend: e.target.checked } : l));
                                      }}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-3.5 h-3.5"
                                    />
                                    <span className="text-[9px] font-bold text-slate-600 uppercase">Show in Legend</span>
                                  </label>
                                  
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={layer.showStroke !== false}
                                      onChange={(e) => {
                                        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, showStroke: e.target.checked } : l));
                                      }}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-3.5 h-3.5"
                                    />
                                    <span className="text-[9px] font-bold text-slate-600 uppercase">Outline</span>
                                  </label>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[9px] text-slate-500 font-bold mb-1">OUTLINE COLOR</label>
                                    <input
                                      type="color"
                                      value={layer.strokeColor}
                                      onChange={(e) => {
                                        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, strokeColor: e.target.value } : l));
                                      }}
                                      className="w-full h-6 cursor-pointer border border-slate-200 rounded p-0.5"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] text-slate-500 font-bold mb-1">FILL COLOR</label>
                                    <input
                                      type="color"
                                      value={layer.fillColor}
                                      onChange={(e) => {
                                        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, fillColor: e.target.value } : l));
                                      }}
                                      className="w-full h-6 cursor-pointer border border-slate-200 rounded p-0.5"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[9px] text-slate-500 font-bold mb-1">OUTLINE SIZE (px)</label>
                                    <input
                                      type="number"
                                      min="0.5"
                                      max="8"
                                      step="0.5"
                                      value={layer.strokeWidth}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 1.5;
                                        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, strokeWidth: val } : l));
                                      }}
                                      className="w-full text-[10px] bg-white border border-slate-200 rounded p-1"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] text-slate-500 font-bold mb-1">FILL OPACITY</label>
                                    <input
                                      type="range"
                                      min="0"
                                      max="80"
                                      value={layer.fillOpacity}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, fillOpacity: val } : l));
                                      }}
                                      className="w-full cursor-pointer accent-indigo-600 mt-1"
                                    />
                                  </div>
                                </div>

                                {/* Color By Attribute section */}
                                <div className="pt-2 border-t border-dashed border-slate-200 flex flex-col gap-1.5">
                                  <label className="block text-[9px] text-slate-500 font-bold">FILL BY ATTRIBUTE CATEGORY</label>
                                  <select
                                    value={layer.colorAttribute || ""}
                                    onChange={(e) => {
                                      const attr = e.target.value;
                                      const mapping = attr ? getInitialColorMapping(layer.geoJson, attr) : {};
                                      setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, colorAttribute: attr, colorMapping: mapping } : l));
                                    }}
                                    className="w-full text-[10px] font-medium bg-white border border-slate-200 rounded p-1 focus:outline-none"
                                  >
                                    <option value="">None (Use solid FILL COLOR above)</option>
                                    {propertyKeys.map((k) => (
                                      <option key={k} value={k}>
                                        {k}
                                      </option>
                                    ))}
                                  </select>

                                  {layer.colorAttribute && layer.colorMapping && (
                                    <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 max-h-48 overflow-y-auto flex flex-col gap-1.5">
                                      <div className="flex justify-between items-center pb-1 border-b border-slate-100">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase">Category Colors</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const mapping = getInitialColorMapping(layer.geoJson, layer.colorAttribute!);
                                            setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, colorMapping: mapping } : l));
                                            showToast("Reset to default color mapping", "success");
                                          }}
                                          className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold"
                                        >
                                          Reset Defaults
                                        </button>
                                      </div>
                                      {Object.keys(layer.colorMapping).length === 0 ? (
                                        <span className="text-[10px] text-slate-400 italic text-center py-1">No category values found</span>
                                      ) : (
                                        Object.keys(layer.colorMapping).map((val) => (
                                          <div key={val} className="flex items-center justify-between gap-2 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                                            <span className="text-[10px] font-medium text-slate-700 truncate max-w-[130px]" title={val}>
                                              {val || "(blank)"}
                                            </span>
                                            <input
                                              type="color"
                                              value={layer.colorMapping?.[val] || "#cccccc"}
                                              onChange={(e) => {
                                                const newColor = e.target.value;
                                                setLayers(prev => prev.map(l => {
                                                  if (l.id === layer.id) {
                                                    return {
                                                      ...l,
                                                      colorMapping: {
                                                        ...l.colorMapping,
                                                        [val]: newColor
                                                      }
                                                    };
                                                  }
                                                  return l;
                                                }));
                                              }}
                                              className="w-5 h-5 cursor-pointer border border-slate-200 rounded shrink-0 p-0"
                                            />
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Labels inside this Layer */}
                                <div className="pt-2 border-t border-dashed border-slate-200 flex flex-col gap-2">
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={layer.showLabels}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, showLabels: checked } : l));
                                      }}
                                      className="cursor-pointer"
                                    />
                                    <span className="text-[10px] font-bold text-slate-700">Display Attribute Labels</span>
                                  </label>

                                  {layer.showLabels && (
                                    <div className="flex flex-col gap-2">
                                      <div>
                                        <label className="block text-[9px] text-slate-500 font-bold mb-0.5">LABEL FIELD</label>
                                        <select
                                          value={layer.labelKey}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, labelKey: val } : l));
                                          }}
                                          className="w-full text-[10px] font-medium bg-white border border-slate-200 rounded p-1"
                                        >
                                          {propertyKeys.length === 0 ? (
                                            <option value="">(No properties detected)</option>
                                          ) : (
                                            propertyKeys.map((k) => (
                                              <option key={k} value={k}>
                                                {k}
                                              </option>
                                            ))
                                          )}
                                        </select>
                                      </div>

                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-[9px] text-slate-500 font-bold mb-0.5">TEXT COLOR</label>
                                          <input
                                            type="color"
                                            value={layer.labelColor}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, labelColor: val } : l));
                                            }}
                                            className="w-full h-6 cursor-pointer border border-slate-200 rounded p-0.5"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[9px] text-slate-500 font-bold mb-0.5">FONT SIZE</label>
                                          <input
                                            type="number"
                                            min="6"
                                            max="36"
                                            value={layer.labelSize}
                                            onChange={(e) => {
                                              const val = parseInt(e.target.value) || 11;
                                              setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, labelSize: val } : l));
                                            }}
                                            className="w-full text-[10px] bg-white border border-slate-200 rounded p-1"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Backwards compatible fallback style settings */}
                {layers.length === 0 && uploadedGeoJson && (
                  <div className="bg-emerald-50/50 border border-emerald-200/50 rounded-2xl p-4 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-xs font-bold text-slate-800 truncate">{shapefileName}</span>
                      </div>
                      <button
                        onClick={() => {
                          setUploadedGeoJson(null);
                          setShapefileName("");
                          setFitToShapefile(false);
                          showToast("Boundary layer removed", "info");
                        }}
                        className="cursor-pointer text-slate-400 hover:text-red-500 transition-colors p-1"
                        title="Remove Boundary"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-[10px] text-slate-500 font-medium">
                      Features Detected: {uploadedGeoJson.features ? uploadedGeoJson.features.length : 1} geometric units
                    </div>

                    <label className="flex items-center justify-between cursor-pointer mt-1 pt-2 border-t border-emerald-100">
                      <span className="text-[11px] font-bold text-slate-700">Display Boundary Layer</span>
                      <input
                        type="checkbox"
                        checked={showShapefile}
                        onChange={(e) => setShowShapefile(e.target.checked)}
                        className="cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-[11px] font-bold text-slate-700">Show Shapefiles in Legend Block</span>
                      <input
                        type="checkbox"
                        checked={showShapefileInLegend}
                        onChange={(e) => setShowShapefileInLegend(e.target.checked)}
                        className="cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-[11px] font-bold text-slate-700">Auto-Fit Map to Boundary</span>
                      <input
                        type="checkbox"
                        checked={fitToShapefile}
                        onChange={(e) => setFitToShapefile(e.target.checked)}
                        className="cursor-pointer"
                      />
                    </label>

                    {/* Formatting details */}
                    <div className="border-t border-slate-100 pt-3 flex flex-col gap-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">Boundary Cartographic Styling</span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showGlobalShapefileOutline}
                            onChange={(e) => setShowGlobalShapefileOutline(e.target.checked)}
                            className="cursor-pointer"
                          />
                          <span className="text-[11px] font-bold text-slate-700">Show Outline</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-1">STROKE OUTLINE</label>
                          <input
                            type="color"
                            value={shapeStrokeColor}
                            onChange={(e) => setShapeStrokeColor(e.target.value)}
                            className="w-full h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-1">FILL COLOR</label>
                          <input
                            type="color"
                            value={shapeFillColor}
                            onChange={(e) => setShapeFillColor(e.target.value)}
                            className="w-full h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-1">OUTLINE SIZE (px)</label>
                          <input
                            type="number"
                            min="0.5"
                            max="8"
                            step="0.5"
                            value={shapeStrokeWidth}
                            onChange={(e) => setShapeStrokeWidth(parseFloat(e.target.value) || 1.5)}
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-1">FILL OPACITY</label>
                          <input
                            type="range"
                            min="0"
                            max="80"
                            value={shapeFillOpacity}
                            onChange={(e) => setShapeFillOpacity(parseInt(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600 mt-1"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Shapefile Feature Labels Customizable Styling */}
                    <div className="border-t border-slate-100 pt-3 flex flex-col gap-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">Boundary Feature Labels</span>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer" title="Include labels for neighbouring states/districts outside selected state">
                            <input
                              type="checkbox"
                              checked={showNeighbourLabels}
                              onChange={(e) => setShowNeighbourLabels(e.target.checked)}
                              className="cursor-pointer"
                            />
                            <span className="text-[11px] font-bold text-slate-600">Neighbours</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showShapefileLabels}
                              onChange={(e) => setShowShapefileLabels(e.target.checked)}
                              className="cursor-pointer"
                            />
                            <span className="text-[11px] font-bold text-slate-700">Show Labels</span>
                          </label>
                        </div>
                      </div>

                      {showShapefileLabels && (
                        <div className="flex flex-col gap-3">
                          <div>
                            <label className="block text-[10px] text-slate-500 font-bold mb-1">LABEL PROPERTY KEY</label>
                            <select
                              value={shapefileLabelKey}
                              onChange={(e) => setShapefileLabelKey(e.target.value)}
                              className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl p-2 focus:outline-none"
                            >
                              {shapefilePropertyKeys.length === 0 ? (
                                <option value="">(No properties detected)</option>
                              ) : (
                                shapefilePropertyKeys.map((k) => (
                                  <option key={k} value={k}>
                                    {k}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] text-slate-500 font-bold mb-1">LABEL COLOR</label>
                              <input
                                type="color"
                                value={shapefileLabelColor}
                                onChange={(e) => setShapefileLabelColor(e.target.value)}
                                className="w-full h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 font-bold mb-1">FONT SIZE (px)</label>
                              <input
                                type="number"
                                min="6"
                                max="36"
                                value={shapefileLabelSize}
                                onChange={(e) => setShapefileLabelSize(parseInt(e.target.value) || 11)}
                                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Interactive labels dragging reset */}
                {Object.keys(customLabelPositions).length > 0 && (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-slate-500 text-[10px] leading-relaxed">
                    💡 <b>Interactive Dragging:</b> You can click and drag any label directly on the map using your mouse to relocate it! Click <b>Reset Positions</b> below to start over.
                  </div>
                )}


              </div>
            )}

            {/* 3. Interpolation Tab */}
            {activeTab === "interpolation" && (
              <div className="flex flex-col gap-4">
                {/* Hero Trigger Action Button for Interpolation (User Requirement 2) */}
                <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 p-4 rounded-3xl text-white shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-indigo-500/40">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-300" /> Spatial Interpolation Engine
                    </h4>
                    <p className="text-[10.5px] text-indigo-100 mt-0.5">
                      Compute continuous raster surface for <b>{selectedParam}</b>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunInterpolation}
                    className="cursor-pointer px-4 py-2 bg-white text-indigo-900 hover:bg-indigo-50 font-black text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-indigo-700 text-indigo-700" />
                    <span>Interpolate Now</span>
                  </button>
                </div>

                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-2">
                  <label className="block text-slate-700 text-xs font-bold mb-1 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                    Interpolation Algorithm
                  </label>
                  <select
                    value={interpolationMethod}
                    onChange={(e) => setInterpolationMethod(e.target.value as "idw" | "nearest" | "kriging" | "rbf" | "natural" | "spline" | "ordinary_kriging" | "universal_kriging" | "ebk")}
                    className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-3 shadow-sm hover:border-indigo-500/80 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800"
                  >
                    <option value="idw">Inverse Distance Weighting (IDW)</option>
                    <option value="nearest">Nearest Neighbor (Voronoi-tessellation)</option>
                    <option value="natural">Natural Neighbor</option>
                    <option value="kriging">Ordinary Kriging (ArcGIS-Level)</option>
                    <option value="rbf">Radial Basis Function (RBF)</option>
                  </select>
                </div>

                {/* IDW Specific Controls */}
                {interpolationMethod === "idw" && (
                  <div className="bg-gradient-to-br from-indigo-50/40 to-violet-50/20 backdrop-blur-md p-4 rounded-3xl border border-indigo-100/30 shadow-sm flex flex-col gap-3">
                    <span className="text-[10px] font-extrabold text-indigo-800 tracking-wider uppercase">IDW PARAMETERS</span>
                    <div className="bg-white/60 p-3 rounded-2xl border border-indigo-100/10">
                      <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1.5">
                        <span>Distance Power exponent (p)</span>
                        <span className="text-indigo-600 bg-indigo-50/80 px-2 py-0.5 rounded-full font-mono text-xs">p = {idwPower}</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="4.0"
                        step="0.5"
                        value={idwPower}
                        onChange={(e) => setIdwPower(parseFloat(e.target.value))}
                        className="w-full cursor-pointer accent-indigo-600"
                      />
                      <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                        Higher power results in more localized influence (peaks and troughs around individual sample points).
                      </p>
                    </div>
                  </div>
                )}

                {/* Kriging Controls */}
                {(interpolationMethod === "kriging" || interpolationMethod === "ordinary_kriging") && (
                  <div className="bg-gradient-to-br from-indigo-50/40 to-violet-50/20 backdrop-blur-md p-4 rounded-3xl border border-indigo-100/30 shadow-sm flex flex-col gap-3.5">
                    <div className="flex items-center gap-1.5 pb-2 border-b border-indigo-100/40">
                      <div className="w-1.5 h-3.5 bg-indigo-600 rounded-sm"></div>
                      <span className="text-[10px] font-extrabold text-indigo-800 tracking-wider uppercase">GEOSTATISTICAL KRIGING ENGINE</span>
                    </div>

                    <div>
                      <label className="block text-[10px] text-indigo-950 font-extrabold mb-1.5 uppercase">VARIOGRAM THEORETICAL MODEL</label>
                      <select
                        value={krigingModel}
                        onChange={(e) => setKrigingModel(e.target.value as "spherical" | "exponential" | "gaussian")}
                        className="w-full text-xs font-bold bg-white border border-indigo-100 rounded-xl p-2.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800"
                      >
                        <option value="spherical">Spherical Variogram (CGWB Publication Standard)</option>
                        <option value="exponential">Exponential (High Local Spatial Cohesion)</option>
                        <option value="gaussian">Gaussian (Very Smooth Spatial Transition)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/60 p-3 rounded-2xl border border-indigo-100/10">
                        <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                          <span>NUGGET (C₀)</span>
                          <span className="font-mono text-indigo-600 font-bold">{krigingNugget}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={krigingNugget}
                          onChange={(e) => setKrigingNugget(parseFloat(e.target.value))}
                          className="w-full cursor-pointer accent-indigo-600"
                        />
                      </div>

                      <div className="bg-white/60 p-3 rounded-2xl border border-indigo-100/10">
                        <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                          <span>SILL (C₀+C)</span>
                          <span className="font-mono text-indigo-600 font-bold">{krigingSill}</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="5"
                          step="0.1"
                          value={krigingSill}
                          onChange={(e) => setKrigingSill(parseFloat(e.target.value))}
                          className="w-full cursor-pointer accent-indigo-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/60 p-3 rounded-2xl border border-indigo-100/10">
                        <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                          <span>RANGE (km)</span>
                          <span className="font-mono text-indigo-600 font-bold">{krigingRange}km</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="800"
                          step="10"
                          value={krigingRange}
                          onChange={(e) => setKrigingRange(parseInt(e.target.value))}
                          className="w-full cursor-pointer accent-indigo-600"
                        />
                      </div>

                      <div className="bg-white/60 p-3 rounded-2xl border border-indigo-100/10">
                        <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                          <span>NEIGHBORS</span>
                          <span className="font-mono text-indigo-600 font-bold">{krigingNeighbors} pts</span>
                        </div>
                        <input
                          type="range"
                          min="4"
                          max="24"
                          step="1"
                          value={krigingNeighbors}
                          onChange={(e) => setKrigingNeighbors(parseInt(e.target.value))}
                          className="w-full cursor-pointer accent-indigo-600"
                        />
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-normal">
                      Solves localized systems of spatial auto-correlation linear equations to predict highly statistically-sound concentrations.
                    </p>
                  </div>
                )}

                {/* Radial Basis Function (RBF) Specific Controls */}
                {interpolationMethod === "rbf" && (
                  <div className="bg-gradient-to-br from-emerald-50/40 to-teal-50/20 backdrop-blur-md p-4 rounded-3xl border border-emerald-100/30 shadow-sm flex flex-col gap-3.5">
                    <div className="flex items-center gap-1.5 pb-2 border-b border-emerald-100/40">
                      <div className="w-1.5 h-3.5 bg-emerald-600 rounded-sm"></div>
                      <span className="text-[10px] font-extrabold text-emerald-800 tracking-wider uppercase">RADIAL BASIS FUNCTION SETTINGS</span>
                    </div>

                    <div>
                      <label className="block text-[10px] text-emerald-950 font-extrabold mb-1.5 uppercase">RBF BASIS KERNEL</label>
                      <select
                        value={rbfKernel}
                        onChange={(e) => setRbfKernel(e.target.value as "multiquadric" | "inverse-multiquadric" | "thin-plate-spline" | "gaussian")}
                        className="w-full text-xs font-bold bg-white border border-emerald-100 rounded-xl p-2.5 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all cursor-pointer text-slate-800"
                      >
                        <option value="multiquadric">Multiquadric (Robust Global Fitting)</option>
                        <option value="inverse-multiquadric">Inverse Multiquadric</option>
                        <option value="thin-plate-spline">Thin Plate Spline (Minimizes Bending Energy)</option>
                        <option value="gaussian">Gaussian RBF (Localized Smooth Shell)</option>
                      </select>
                    </div>

                    <div className="bg-white/60 p-3 rounded-2xl border border-emerald-100/10">
                      <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                        <span>SHAPE SMOOTHING PARAMETER (c)</span>
                        <span className="font-mono text-emerald-600 font-bold">{rbfParameter}</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="2.5"
                        step="0.05"
                        value={rbfParameter}
                        onChange={(e) => setRbfParameter(parseFloat(e.target.value))}
                        className="w-full cursor-pointer accent-emerald-600"
                      />
                      <p className="text-[9px] text-slate-400 mt-2 leading-relaxed">
                        Adjusts kernel stiffness. Smaller values yield tighter fitted surface curves.
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3.5">
                  <div className="bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>Grid Smoothing Resolution</span>
                      <span className="font-mono text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full text-[10px] font-bold">{gridSmoothingRes} cols</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="300"
                      step="10"
                      value={gridSmoothingRes}
                      onChange={(e) => setGridSmoothingRes(parseInt(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600 mt-1"
                    />
                  </div>

                  {!useAllPoints && (
                    <div className="bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                      <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                        <span>Search Radius (degrees)</span>
                        <span className="font-mono text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full text-[10px] font-bold">{searchRadius}°</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="4.0"
                        step="0.1"
                        value={searchRadius}
                        onChange={(e) => setSearchRadius(parseFloat(e.target.value))}
                        className="w-full cursor-pointer accent-indigo-600 mt-1"
                      />
                    </div>
                  )}

                  <div className="bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>Clip to Study Area Buffer</span>
                      <span className="font-mono text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full text-[10px] font-bold">{clippingRadius}°</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="3.0"
                      step="0.1"
                      value={clippingRadius}
                      onChange={(e) => setClippingRadius(parseFloat(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600 mt-1"
                    />
                  </div>

                  <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl bg-white/60 hover:bg-white transition-all border border-slate-100 hover:border-indigo-100 shadow-sm group">
                    <div className="pr-4">
                      <span className="text-xs font-bold text-slate-700 block group-hover:text-indigo-600 transition-colors">Use All Points for Interpolation</span>
                      <span className="text-[10px] text-slate-400 font-medium">Bypasses spatial radius limit to leverage global dataset</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={useAllPoints}
                      onChange={(e) => setUseAllPoints(e.target.checked)}
                      className="cursor-pointer h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>

                  <div className="bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>Grid Resolution Multiplier</span>
                      <span className="font-mono text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full text-[10px] font-bold">{gridResolutionMultiplier}x</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={gridResolutionMultiplier}
                      onChange={(e) => setGridResolutionMultiplier(parseInt(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600 mt-1"
                    />
                  </div>
                </div>

                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-2">
                  <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl bg-white/60 hover:bg-white transition-all border border-slate-100 hover:border-indigo-100 shadow-sm group">
                    <span className="text-xs font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">Extend Interpolation to Boundary</span>
                    <input
                      type="checkbox"
                      checked={extendInterpolationToBoundary}
                      onChange={(e) => setExtendInterpolationToBoundary(e.target.checked)}
                      className="cursor-pointer h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>
                  <p className="text-[10px] text-slate-400 pl-1.5">
                    Extends interpolation values throughout the full boundary region, even if there are no local sample points.
                  </p>
                </div>

                {/* ADVANCED RENDERING & ANISOTROPY CONTROLS */}
                <div className="border-t border-slate-100 pt-3 flex flex-col gap-3">
                  <span className="text-[10px] font-extrabold text-indigo-600 tracking-wider uppercase">ADVANCED RENDERING & GEOMETRY</span>
                  
                  <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-50">
                    <div>
                      <span className="text-xs font-medium text-slate-700 block">Gaussian Raster Smoothing</span>
                      <span className="text-[9px] text-slate-400">Applies a 3x3 kernel blur to reduce jagged edges</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableGaussianSmoothing}
                      onChange={(e) => setEnableGaussianSmoothing(e.target.checked)}
                      className="cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-50">
                    <div>
                      <span className="text-xs font-medium text-slate-700 block">Smooth Continuous Color Blending</span>
                      <span className="text-[9px] text-slate-400">Enables high-fidelity bilinear smoothing for map colors (disable for sharp grids)</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={smoothBlending}
                      onChange={(e) => setSmoothBlending(e.target.checked)}
                      className="cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-lg hover:bg-slate-50">
                    <div>
                      <span className="text-xs font-medium text-slate-700 block">Anisotropy Correction</span>
                      <span className="text-[9px] text-slate-400">Corrects for spatial directional trends or skewness</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableAnisotropy}
                      onChange={(e) => setEnableAnisotropy(e.target.checked)}
                      className="cursor-pointer"
                    />
                  </label>

                  {enableAnisotropy && (
                    <div className="pl-3 border-l-2 border-indigo-100 flex flex-col gap-3.5 pt-1">
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                          <span>Trend Direction (Angle)</span>
                          <span className="text-indigo-600 font-mono">{anisotropyAngle}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="180"
                          step="5"
                          value={anisotropyAngle}
                          onChange={(e) => setAnisotropyAngle(parseInt(e.target.value))}
                          className="w-full cursor-pointer accent-indigo-600"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                          <span>Anisotropy Ratio (Stretch)</span>
                          <span className="text-indigo-600 font-mono">{anisotropyRatio}x</span>
                        </div>
                        <input
                          type="range"
                          min="1.0"
                          max="3.0"
                          step="0.1"
                          value={anisotropyRatio}
                          onChange={(e) => setAnisotropyRatio(parseFloat(e.target.value))}
                          className="w-full cursor-pointer accent-indigo-600"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. Styling Tab */}
            {activeTab === "styling" && (
              <div className="flex flex-col gap-5">
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-1.5">
                  <label className="block text-slate-700 text-xs font-bold mb-1 flex items-center gap-1.5">
                    <LayoutGrid className="w-3.5 h-3.5 text-indigo-500" />
                    Map Sheet Layout
                  </label>
                  <select
                    value={sheetLayout}
                    onChange={(e) => setSheetLayout(e.target.value as "landscape" | "a4-portrait")}
                    className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-3 shadow-sm hover:border-indigo-500/80 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800"
                  >
                    <option value="a4-portrait">A4 Portrait Sheet (CGWB Publication Standard)</option>
                    <option value="landscape">Standard Landscape (Interactive Web)</option>
                  </select>
                </div>

                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                  <div>
                    <label className="block text-slate-700 text-xs font-bold mb-1.5 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-indigo-500" />
                      Color Scheme Palette
                    </label>
                    <select
                      value={colorScheme}
                      onChange={(e) => setColorScheme(e.target.value)}
                      className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-3 shadow-sm hover:border-indigo-500/80 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800"
                    >
                      {Object.keys(COLOR_SCHEMES).map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-slate-100/40 rounded-xl border border-slate-200/20 shadow-inner">
                    {(COLOR_SCHEMES[colorScheme as keyof typeof COLOR_SCHEMES] || COLOR_SCHEMES["Blue-Yellow-Red"]).map((c, i) => (
                      <div
                        key={i}
                        className="h-7 flex-1 first:rounded-l-lg last:rounded-r-lg shadow-inner border border-white/20 hover:scale-105 hover:z-10 transition-all duration-150 cursor-pointer"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3.5">
                  <div>
                    <label className="block text-slate-700 text-xs font-bold mb-1.5 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-indigo-500" />
                      Sampling Point Symbol
                    </label>
                    <select
                      value={symbolType}
                      onChange={(e) => setSymbolType(e.target.value as "circle" | "square" | "triangle" | "diamond" | "star")}
                      className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-3 shadow-sm hover:border-indigo-500/80 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800"
                    >
                      <option value="circle">Circle Symbol</option>
                      <option value="square">Square Symbol</option>
                      <option value="triangle">Triangle Symbol</option>
                      <option value="diamond">Diamond Symbol</option>
                      <option value="star">Star / Asterisk</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-white/50 p-3 rounded-2xl border border-slate-100 shadow-inner">
                    <div>
                      <label className="block text-[9px] text-slate-400 font-extrabold mb-1">SYMBOL SIZE (px)</label>
                      <input
                        type="number"
                        value={symbolSize}
                        onChange={(e) => setSymbolSize(parseInt(e.target.value) || 8)}
                        className="w-full text-xs font-bold bg-white border border-slate-200 rounded-lg p-2 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-extrabold mb-1">SYMBOL OPACITY</label>
                      <div className="flex flex-col gap-1">
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={symbolOpacity}
                          onChange={(e) => setSymbolOpacity(parseInt(e.target.value))}
                          className="w-full cursor-pointer accent-indigo-600 mt-1"
                        />
                        <span className="text-[9px] text-slate-500 font-mono text-right">{symbolOpacity}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Points Map Exceeding-Only View
                  </span>
                  
                  <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl bg-white/60 hover:bg-white border border-slate-100 hover:border-indigo-100 transition-all shadow-sm group">
                    <span className="text-xs font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">Show Exceeding Locations Only</span>
                    <input
                      type="checkbox"
                      checked={showOnlyExceedingPoints}
                      onChange={(e) => setShowOnlyExceedingPoints(e.target.checked)}
                      className="cursor-pointer h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>

                  {showOnlyExceedingPoints && (
                    <div className="bg-white/60 p-3.5 rounded-2xl border border-slate-100 shadow-inner flex flex-col gap-3">
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1.5">
                          <span>Exceeding Point Size Scale</span>
                          <span className="text-indigo-600 font-mono text-xs">{exceedingPointSize.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="3.0"
                          step="0.1"
                          value={exceedingPointSize}
                          onChange={(e) => setExceedingPointSize(parseFloat(e.target.value))}
                          className="w-full cursor-pointer accent-indigo-600"
                        />
                      </div>

                      <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl bg-white/80 hover:bg-white border border-slate-200/50 transition-all shadow-sm group">
                        <span className="text-xs font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">Display as 3D Bubbles</span>
                        <input
                          type="checkbox"
                          checked={showAs3dBubbles}
                          onChange={(e) => setShowAs3dBubbles(e.target.checked)}
                          className="cursor-pointer h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </label>

                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1.5 uppercase">BUBBLE/POINT COLOR</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={bubbleColor}
                            onChange={(e) => setBubbleColor(e.target.value)}
                            className="w-10 h-10 cursor-pointer border border-slate-200/80 rounded-xl p-0.5 shrink-0 transition-transform hover:scale-105"
                          />
                          <input
                            type="text"
                            value={bubbleColor}
                            onChange={(e) => setBubbleColor(e.target.value)}
                            className="w-full text-xs bg-white border border-slate-200/80 rounded-xl px-3 font-mono text-slate-800 font-bold shadow-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Dynamic Classification Class Count */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <LayoutGrid className="w-3.5 h-3.5 text-indigo-500" />
                    Dynamic Map Class Count
                  </span>
                  <div className="flex flex-col gap-2 bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                    <p className="text-[10px] text-slate-500 leading-relaxed mb-1">
                      Choose the number of classification ranges to group interpolated concentration values.
                    </p>
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100/60 pt-2">
                      <span className="text-xs font-medium text-slate-600">No. of Classes (2 - 10)</span>
                      <input
                        type="number"
                        min="2"
                        max="10"
                        value={interpolationClasses}
                        onChange={(e) => setInterpolationClasses(Math.max(2, Math.min(10, parseInt(e.target.value) || 3)))}
                        className="w-20 text-xs bg-white border border-slate-200/80 rounded-xl px-3 py-1.5 text-center font-extrabold text-slate-800 shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Custom Point Colors Selector */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-2">
                  <div className="flex flex-col gap-2 bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold text-indigo-950 uppercase tracking-wide flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-indigo-500" /> Separate Point Map Colors
                      </span>
                      <input
                        type="checkbox"
                        checked={useCustomPointColors}
                        onChange={(e) => setUseCustomPointColors(e.target.checked)}
                        className="cursor-pointer h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed mb-1">
                      Use separate colors for raw points map to make points stand out from background interpolation.
                    </p>
                    
                    {useCustomPointColors && (
                      <div className="flex flex-col gap-3.5 border-t border-slate-100/80 pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-600">Acceptable (≤ {paramConfig.b1})</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={pointColorRange1}
                              onChange={(e) => setPointColorRange1(e.target.value)}
                              className="w-8 h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5 shadow-sm transition-transform hover:scale-105"
                            />
                            <input
                              type="text"
                              value={pointColorRange1}
                              onChange={(e) => setPointColorRange1(e.target.value)}
                              className="w-20 text-[10px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold shadow-sm"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-600">Permissible (≤ {paramConfig.b2})</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={pointColorRange2}
                              onChange={(e) => setPointColorRange2(e.target.value)}
                              className="w-8 h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5 shadow-sm transition-transform hover:scale-105"
                            />
                            <input
                              type="text"
                              value={pointColorRange2}
                              onChange={(e) => setPointColorRange2(e.target.value)}
                              className="w-20 text-[10px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold shadow-sm"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-600">Beyond Permissible (&gt; {paramConfig.b2})</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={pointColorRange3}
                              onChange={(e) => setPointColorRange3(e.target.value)}
                              className="w-8 h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5 shadow-sm transition-transform hover:scale-105"
                            />
                            <input
                              type="text"
                              value={pointColorRange3}
                              onChange={(e) => setPointColorRange3(e.target.value)}
                              className="w-20 text-[10px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold shadow-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Custom Color Selector Ranges */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-indigo-500" />
                    Map Custom Classification Colors
                  </span>
                  
                  {/* Standard Ranges */}
                  <div className="flex flex-col gap-3.5 bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                    <span className="text-[10px] font-extrabold text-indigo-950 uppercase tracking-wide">Concentration Map Ranges</span>
                    
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-600">Acceptable (≤ {paramConfig.b1})</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={colorRange1}
                          onChange={(e) => setColorRange1(e.target.value)}
                          className="w-8 h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5 shadow-sm transition-transform hover:scale-105"
                        />
                        <input
                          type="text"
                          value={colorRange1}
                          onChange={(e) => setColorRange1(e.target.value)}
                          className="w-20 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold shadow-sm"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-600">Permissible (≤ {paramConfig.b2})</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={colorRange2}
                          onChange={(e) => setColorRange2(e.target.value)}
                          className="w-8 h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5 shadow-sm transition-transform hover:scale-105"
                        />
                        <input
                          type="text"
                          value={colorRange2}
                          onChange={(e) => setColorRange2(e.target.value)}
                          className="w-20 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold shadow-sm"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-600">Beyond Permissible (&gt; {paramConfig.b2})</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={colorRange3}
                          onChange={(e) => setColorRange3(e.target.value)}
                          className="w-8 h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5 shadow-sm transition-transform hover:scale-105"
                        />
                        <input
                          type="text"
                          value={colorRange3}
                          onChange={(e) => setColorRange3(e.target.value)}
                          className="w-20 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Station Location Custom Color */}
                  <div className="flex flex-col gap-2 bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                    <span className="text-[10px] font-extrabold text-indigo-950 uppercase tracking-wide">Station Locations Color</span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-600">Location Point Color</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={stationPointColor}
                          onChange={(e) => setStationPointColor(e.target.value)}
                          className="w-8 h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5 shadow-sm transition-transform hover:scale-105"
                        />
                        <input
                          type="text"
                          value={stationPointColor}
                          onChange={(e) => setStationPointColor(e.target.value)}
                          className="w-20 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Difference Map Ranges */}
                  {showDifferenceMap && (
                    <div className="flex flex-col gap-3.5 bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                      <span className="text-[10px] font-extrabold text-indigo-950 uppercase tracking-wide">Difference Map Ranges</span>
                      
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-600">Improved (Post &lt; Pre)</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={colorDiffImproved}
                            onChange={(e) => setColorDiffImproved(e.target.value)}
                            className="w-8 h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5 shadow-sm transition-transform hover:scale-105"
                          />
                          <input
                            type="text"
                            value={colorDiffImproved}
                            onChange={(e) => setColorDiffImproved(e.target.value)}
                            className="w-20 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold shadow-sm"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-600">Stable</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={colorDiffStable}
                            onChange={(e) => setColorDiffStable(e.target.value)}
                            className="w-8 h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5 shadow-sm transition-transform hover:scale-105"
                          />
                          <input
                            type="text"
                            value={colorDiffStable}
                            onChange={(e) => setColorDiffStable(e.target.value)}
                            className="w-20 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold shadow-sm"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-600">Deteriorated (Post &gt; Pre)</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={colorDiffDeteriorated}
                            onChange={(e) => setColorDiffDeteriorated(e.target.value)}
                            className="w-8 h-8 cursor-pointer border border-slate-200 rounded-lg p-0.5 shadow-sm transition-transform hover:scale-105"
                          />
                          <input
                            type="text"
                            value={colorDiffDeteriorated}
                            onChange={(e) => setColorDiffDeteriorated(e.target.value)}
                            className="w-20 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold shadow-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 6. Decorations Tab */}
            {activeTab === "decorations" && (
              <div className="flex flex-col gap-5">
                {/* Titles & Texts */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Type className="w-4 h-4 text-indigo-500" />
                    Map Title Customization
                  </span>
                  
                  <div className="flex flex-col gap-3.5 bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner">
                    <div>
                      <label className="block text-[10px] text-slate-500 font-bold mb-1 uppercase tracking-wide">MAP TITLE TEXT</label>
                      <input
                        type="text"
                        placeholder="Default Concentration Map"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all text-slate-800 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 font-bold mb-1 uppercase tracking-wide">MAP SUBTITLE TEXT</label>
                      <input
                        type="text"
                        placeholder="Default Survey & Dynamics"
                        value={customSubtitle}
                        onChange={(e) => setCustomSubtitle(e.target.value)}
                        className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all text-slate-800 shadow-sm"
                      />
                    </div>

                    <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl bg-white/80 hover:bg-white border border-slate-150 transition-all mt-1 group">
                      <span className="text-xs font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">Replace Main Title with Subtitle</span>
                      <input
                        type="checkbox"
                        checked={useSubtitleAsTitle}
                        onChange={(e) => setUseSubtitleAsTitle(e.target.checked)}
                        className="cursor-pointer h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>
                  </div>
                </div>

                {/* Placement & Directions */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-indigo-500" />
                    Layout Placements
                  </span>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-slate-600 text-xs font-bold mb-1">Map Title Placement</label>
                      <select
                        value={titlePos}
                        onChange={(e) => setTitlePos(e.target.value as "top-center" | "top-left" | "top-right" | "bottom-center" | "bottom-left" | "bottom-right" | "none")}
                        className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-2.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800 shadow-sm"
                      >
                        <option value="top-center">Top Center position</option>
                        <option value="top-left">Top Left corner</option>
                        <option value="top-right">Top Right corner</option>
                        <option value="bottom-center">Bottom Center position</option>
                        <option value="bottom-left">Bottom Left corner</option>
                        <option value="bottom-right">Bottom Right corner</option>
                        <option value="none">No Title Plate</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-slate-600 text-xs font-bold mb-1">North Arrow Type</label>
                        <select
                          value={northArrowType}
                          onChange={(e) => setNorthArrowType(e.target.value as "classic" | "modern" | "simple")}
                          className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-2.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800 shadow-sm"
                        >
                          <option value="classic">Classic Compass Needle</option>
                          <option value="modern">Modern Minimal Arrow</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 text-xs font-bold mb-1">North Arrow Position</label>
                        <select
                          value={northArrowPos}
                          onChange={(e) => setNorthArrowPos(e.target.value as "top-left" | "top-right" | "bottom-left" | "bottom-right")}
                          className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-2.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800 shadow-sm"
                        >
                          <option value="top-right">Top-Right corner</option>
                          <option value="top-left">Top-Left corner</option>
                          <option value="bottom-right">Bottom-Right corner</option>
                          <option value="bottom-left">Bottom-Left corner</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-600 text-xs font-bold mb-1">Legend Position Corner</label>
                      <select
                        value={legendPos}
                        onChange={(e) => setLegendPos(e.target.value as "top-left" | "top-right" | "bottom-left" | "bottom-right")}
                        className="w-full text-xs font-semibold bg-white/95 border border-slate-200/80 rounded-xl p-2.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800 shadow-sm"
                      >
                        <option value="bottom-right">Bottom-Right corner</option>
                        <option value="bottom-left">Bottom-Left corner</option>
                        <option value="top-right">Top-Right corner</option>
                        <option value="top-left">Top-Left corner</option>
                      </select>
                    </div>

                    <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl bg-white/60 hover:bg-white border border-slate-100 hover:border-indigo-100 transition-all mt-1 group">
                      <span className="text-xs font-medium text-slate-700 group-hover:text-indigo-600 transition-colors font-bold">Show Shapefiles in Legend</span>
                      <input
                        type="checkbox"
                        checked={showShapefileInLegend}
                        onChange={(e) => setShowShapefileInLegend(e.target.checked)}
                        className="cursor-pointer h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>
                  </div>
                </div>

                {/* Colors Customization */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-indigo-500" />
                    Element Color Customization
                  </span>

                  <div className="grid grid-cols-3 gap-2 bg-white/60 p-2.5 rounded-2xl border border-slate-100 shadow-inner">
                    <div className="flex flex-col items-center">
                      <label className="text-[9px] text-slate-400 font-bold mb-1 uppercase tracking-wide">Title</label>
                      <input
                        type="color"
                        value={mapTitleColor}
                        onChange={(e) => setMapTitleColor(e.target.value)}
                        className="w-9 h-9 cursor-pointer border border-slate-200 rounded-xl p-0.5 shadow-sm transition-transform hover:scale-105"
                      />
                    </div>
                    <div className="flex flex-col items-center">
                      <label className="text-[9px] text-slate-400 font-bold mb-1 uppercase tracking-wide">Subtitle</label>
                      <input
                        type="color"
                        value={mapSubtitleColor}
                        onChange={(e) => setMapSubtitleColor(e.target.value)}
                        className="w-9 h-9 cursor-pointer border border-slate-200 rounded-xl p-0.5 shadow-sm transition-transform hover:scale-105"
                      />
                    </div>
                    <div className="flex flex-col items-center">
                      <label className="text-[9px] text-slate-400 font-bold mb-1 uppercase tracking-wide">Legend</label>
                      <input
                        type="color"
                        value={legendTextColor}
                        onChange={(e) => setLegendTextColor(e.target.value)}
                        className="w-9 h-9 cursor-pointer border border-slate-200 rounded-xl p-0.5 shadow-sm transition-transform hover:scale-105"
                      />
                    </div>
                  </div>
                </div>

                {/* Precise Positioning Offsets */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-indigo-500" />
                    Precise Element Positioning (Offsets)
                  </span>
                  <p className="text-[10px] text-slate-500 leading-relaxed mb-1">
                    Precisely reposition individual map decorations relative to their anchor coordinates.
                  </p>

                  <div className="flex flex-col gap-3 bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner max-h-[250px] overflow-y-auto custom-scrollbar">
                    {/* Title Position Offset */}
                    <div className="bg-white/90 p-2.5 rounded-xl border border-slate-100 flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-slate-700 uppercase">Map Title Offsets</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[9px] text-slate-400 font-mono font-bold block mb-0.5">X: {titleOffsetX}px</span>
                          <input
                            type="range"
                            min="-400"
                            max="400"
                            value={titleOffsetX}
                            onChange={(e) => setTitleOffsetX(parseInt(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600 h-1.5"
                          />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 font-mono font-bold block mb-0.5">Y: {titleOffsetY}px</span>
                          <input
                            type="range"
                            min="-400"
                            max="400"
                            value={titleOffsetY}
                            onChange={(e) => setTitleOffsetY(parseInt(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600 h-1.5"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Legend Position Offset */}
                    <div className="bg-white/90 p-2.5 rounded-xl border border-slate-100 flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-slate-700 uppercase">Legend Offsets</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[9px] text-slate-400 font-mono font-bold block mb-0.5">X: {legendOffsetX}px</span>
                          <input
                            type="range"
                            min="-400"
                            max="400"
                            value={legendOffsetX}
                            onChange={(e) => setLegendOffsetX(parseInt(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600 h-1.5"
                          />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 font-mono font-bold block mb-0.5">Y: {legendOffsetY}px</span>
                          <input
                            type="range"
                            min="-400"
                            max="400"
                            value={legendOffsetY}
                            onChange={(e) => setLegendOffsetY(parseInt(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600 h-1.5"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Stats Table Position Offset */}
                    <div className="bg-white/90 p-2.5 rounded-xl border border-slate-100 flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-slate-700 uppercase">Stats Table Offsets</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[9px] text-slate-400 font-mono font-bold block mb-0.5">X: {statsOffsetX}px</span>
                          <input
                            type="range"
                            min="-400"
                            max="400"
                            value={statsOffsetX}
                            onChange={(e) => setStatsOffsetX(parseInt(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600 h-1.5"
                          />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 font-mono font-bold block mb-0.5">Y: {statsOffsetY}px</span>
                          <input
                            type="range"
                            min="-400"
                            max="400"
                            value={statsOffsetY}
                            onChange={(e) => setStatsOffsetY(parseInt(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600 h-1.5"
                          />
                        </div>
                      </div>
                    </div>

                    {/* North Arrow Position Offset */}
                    <div className="bg-white/90 p-2.5 rounded-xl border border-slate-100 flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-slate-700 uppercase">North Arrow Offsets</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[9px] text-slate-400 font-mono font-bold block mb-0.5">X: {northArrowOffsetX}px</span>
                          <input
                            type="range"
                            min="-400"
                            max="400"
                            value={northArrowOffsetX}
                            onChange={(e) => setNorthArrowOffsetX(parseInt(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600 h-1.5"
                          />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 font-mono font-bold block mb-0.5">Y: {northArrowOffsetY}px</span>
                          <input
                            type="range"
                            min="-400"
                            max="400"
                            value={northArrowOffsetY}
                            onChange={(e) => setNorthArrowOffsetY(parseInt(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600 h-1.5"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Scale Bar Position Offset */}
                    <div className="bg-white/90 p-2.5 rounded-xl border border-slate-100 flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-slate-700 uppercase">Scale Bar Offsets</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[9px] text-slate-400 font-mono font-bold block mb-0.5">X: {scaleBarOffsetX}px</span>
                          <input
                            type="range"
                            min="-400"
                            max="400"
                            value={scaleBarOffsetX}
                            onChange={(e) => setScaleBarOffsetX(parseInt(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600 h-1.5"
                          />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 font-mono font-bold block mb-0.5">Y: {scaleBarOffsetY}px</span>
                          <input
                            type="range"
                            min="-400"
                            max="400"
                            value={scaleBarOffsetY}
                            onChange={(e) => setScaleBarOffsetY(parseInt(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600 h-1.5"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Typography Settings */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-indigo-500" />
                    Typography Settings
                  </span>

                  <div className="bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner flex flex-col gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-wide">MAP FONT FAMILY</label>
                      <select
                        value={mapFontFamily}
                        onChange={(e) => setMapFontFamily(e.target.value)}
                        className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer text-slate-800"
                      >
                        <option value="Times New Roman">Times New Roman (Serif)</option>
                        <option value="Calibri">Calibri (Sans-Serif)</option>
                        <option value="sans-serif">Clean Sans-Serif (Inter)</option>
                        <option value="serif">Official Serif (Georgia)</option>
                        <option value="monospace">Mono Technical (Fira Code)</option>
                        <option value="cursive">Elegant Cursive</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1 text-center">TITLE (px)</label>
                        <input
                          type="number"
                          value={mapTitleSize}
                          onChange={(e) => setMapTitleSize(parseInt(e.target.value) || 15)}
                          className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2 text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1 text-center">SUBTITLE</label>
                        <input
                          type="number"
                          value={mapSubtitleSize}
                          onChange={(e) => setMapSubtitleSize(parseInt(e.target.value) || 11)}
                          className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2 text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1 text-center">SPACING</label>
                        <input
                          type="number"
                          value={titleLineSpacing}
                          onChange={(e) => setTitleLineSpacing(parseInt(e.target.value) || 0)}
                          className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2 text-center"
                          min="0"
                          max="100"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3D Text Effects */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    3D Text Effects (Emboss/Deboss)
                  </span>

                  <div className="bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner flex flex-col gap-3">
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold mb-1 uppercase tracking-wide">MAP TITLE 3D EFFECT</label>
                      <select
                        value={mapTitle3dEffect}
                        onChange={(e) => setMapTitle3dEffect(e.target.value as "none" | "emboss" | "deboss")}
                        className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2 focus:outline-none text-slate-800 cursor-pointer"
                      >
                        <option value="none">None (Standard Flat)</option>
                        <option value="emboss">3D Emboss (Raised Bevel)</option>
                        <option value="deboss">3D Deboss (Letterpress Inset)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold mb-1 uppercase tracking-wide">MAP SUBTITLE 3D EFFECT</label>
                      <select
                        value={mapSubtitle3dEffect}
                        onChange={(e) => setMapSubtitle3dEffect(e.target.value as "none" | "emboss" | "deboss")}
                        className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2 focus:outline-none text-slate-800 cursor-pointer"
                      >
                        <option value="none">None (Standard Flat)</option>
                        <option value="emboss">3D Emboss (Raised Bevel)</option>
                        <option value="deboss">3D Deboss (Letterpress Inset)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold mb-1 uppercase tracking-wide">MAP LEGEND 3D EFFECT</label>
                      <select
                        value={legend3dEffect}
                        onChange={(e) => setLegend3dEffect(e.target.value as "none" | "emboss" | "deboss")}
                        className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2 focus:outline-none text-slate-800 cursor-pointer"
                      >
                        <option value="none">None (Standard Flat)</option>
                        <option value="emboss">3D Emboss (Raised Bevel)</option>
                        <option value="deboss">3D Deboss (Letterpress Inset)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Legend Width & Rows */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Grid3X3 className="w-4 h-4 text-indigo-500" />
                    Legend & Classes Sizing
                  </span>

                  <div className="bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner flex flex-col gap-3.5">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1 text-center">WIDTH (px)</label>
                        <input
                          type="number"
                          value={legendWidth}
                          onChange={(e) => setLegendWidth(parseInt(e.target.value) || 155)}
                          className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl p-1.5 text-center text-slate-800"
                          min="100"
                          max="400"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1 text-center">SPACING</label>
                        <input
                          type="number"
                          value={legendRowSpacing}
                          onChange={(e) => setLegendRowSpacing(parseInt(e.target.value) || 16)}
                          className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl p-1.5 text-center text-slate-800"
                          min="10"
                          max="40"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1 text-center">COLUMNS</label>
                        <select
                          value={legendColumns}
                          onChange={(e) => setLegendColumns(parseInt(e.target.value) || 1)}
                          className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl p-1.5 text-slate-800 cursor-pointer"
                        >
                          <option value={1}>1 Col</option>
                          <option value={2}>2 Col</option>
                          <option value={3}>3 Col</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1">CLASS BOX WIDTH</label>
                        <input
                          type="number"
                          value={legendBoxWidth}
                          onChange={(e) => setLegendBoxWidth(parseInt(e.target.value) || 12)}
                          className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2 text-center text-slate-800"
                          min="4"
                          max="30"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1">CLASS BOX HEIGHT</label>
                        <input
                          type="number"
                          value={legendBoxHeight}
                          onChange={(e) => setLegendBoxHeight(parseInt(e.target.value) || 8)}
                          className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2 text-center text-slate-800"
                          min="4"
                          max="30"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t border-slate-100/60 pt-3">
                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1 text-center">TITLE SZ</label>
                        <input
                          type="number"
                          step="0.5"
                          value={legendTitleSize}
                          onChange={(e) => setLegendTitleSize(parseFloat(e.target.value) || 8.5)}
                          className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl p-1.5 text-center text-slate-800"
                          min="6"
                          max="18"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1 text-center">SUBTITLE</label>
                        <input
                          type="number"
                          step="0.5"
                          value={legendSubtitleSize}
                          onChange={(e) => setLegendSubtitleSize(parseFloat(e.target.value) || 7)}
                          className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl p-1.5 text-center text-slate-800"
                          min="5"
                          max="16"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold mb-1 text-center">LABELS</label>
                        <input
                          type="number"
                          step="0.5"
                          value={legendFontSize}
                          onChange={(e) => setLegendFontSize(parseFloat(e.target.value) || 7.5)}
                          className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl p-1.5 text-center text-slate-800"
                          min="5"
                          max="16"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shapefile Legend Customization */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileJson className="w-4 h-4 text-indigo-500" />
                    Shapefile Legend Customization
                  </span>

                  <div className="bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1">FONT SIZE</label>
                      <input
                        type="number"
                        step="0.5"
                        value={shapefileLegendFontSize}
                        onChange={(e) => setShapefileLegendFontSize(parseFloat(e.target.value) || 7.5)}
                        className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl p-2 text-center text-slate-800"
                        min="5"
                        max="16"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1">TEXT COLOR</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={shapefileLegendTextColor}
                          onChange={(e) => setShapefileLegendTextColor(e.target.value)}
                          className="w-9 h-9 cursor-pointer border border-slate-200 rounded-xl p-0.5 shadow-sm transition-transform hover:scale-105 shrink-0"
                        />
                        <span className="text-[10px] text-slate-600 font-mono font-bold block overflow-hidden text-ellipsis">{shapefileLegendTextColor}</span>
                      </div>
                    </div>

                    <div className="col-span-2 grid grid-cols-2 gap-2.5 mt-2 pt-2 border-t border-slate-100">
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold mb-1">COLUMNS</label>
                        <select
                          value={shapefileLegendColumns}
                          onChange={(e) => setShapefileLegendColumns(parseInt(e.target.value) || 1)}
                          className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl p-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 cursor-pointer"
                        >
                          <option value="1">1 Col</option>
                          <option value="2">2 Cols</option>
                          <option value="3">3 Cols</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold mb-1">FONT STYLE</label>
                        <select
                          value={shapefileLegendFontStyle}
                          onChange={(e) => setShapefileLegendFontStyle(e.target.value)}
                          className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl p-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 cursor-pointer"
                        >
                          <option value="normal">Regular</option>
                          <option value="bold">Bold</option>
                          <option value="italic">Italic</option>
                          <option value="bold-italic">Bold Italic</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold mb-1">FONT FAMILY</label>
                        <select
                          value={shapefileLegendFontFamily}
                          onChange={(e) => setShapefileLegendFontFamily(e.target.value)}
                          className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl p-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 cursor-pointer"
                        >
                          <option value="Times New Roman">Times New Roman</option>
                          <option value="Calibri">Calibri</option>
                          <option value="sans-serif">Clean Sans</option>
                          <option value="serif">Official Serif</option>
                          <option value="monospace">Mono Technical</option>
                          <option value="cursive">Elegant Cursive</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold mb-1">SPACING</label>
                        <input
                          type="number"
                          step="1"
                          value={shapefileLegendSpacing}
                          onChange={(e) => setShapefileLegendSpacing(parseInt(e.target.value) || 15)}
                          className="w-full text-xs font-bold bg-white border border-slate-200/80 rounded-xl p-1.5 text-center text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          min="10"
                          max="40"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Neatline Map Border Customization */}
                <div className="bg-white/40 backdrop-blur-md p-4 rounded-3xl border border-white/50 shadow-sm flex flex-col gap-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Grid3X3 className="w-4 h-4 text-indigo-500" />
                    Neatline Border Customization
                  </span>

                  <div className="bg-white/60 p-3 rounded-2xl border border-slate-100 shadow-inner flex flex-col gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-wide">BORDER STYLE</label>
                      <select
                        value={mapBorderType}
                        onChange={(e) => setMapBorderType(e.target.value as "single" | "double")}
                        className="w-full text-xs font-semibold bg-white border border-slate-200/80 rounded-xl p-2.5 focus:outline-none text-slate-800 cursor-pointer"
                      >
                        <option value="single">Single Neatline Border</option>
                        <option value="double">Double Neatline Border (Professional)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-wide">BORDER COLOR</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={mapBorderColor}
                          onChange={(e) => setMapBorderColor(e.target.value)}
                          className="w-10 h-10 cursor-pointer border border-slate-200 rounded-xl p-0.5"
                        />
                        <input
                          type="text"
                          value={mapBorderColor}
                          onChange={(e) => setMapBorderColor(e.target.value)}
                          className="flex-1 text-xs font-mono font-bold bg-white border border-slate-200/80 rounded-xl p-2.5 uppercase text-slate-800 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}



          </div>

        </div>

        {/* Map Panel View */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Controls bar for active rendering */}
          <div className="bg-gradient-to-r from-white/95 via-slate-50/90 to-slate-100/90 backdrop-blur-xl px-6 py-4 rounded-3xl border border-white/60 shadow-[0_16px_36px_rgba(15,23,42,0.05),inset_0_1px_2px_rgba(255,255,255,0.9)] flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <span className="text-slate-800 uppercase tracking-wider text-[10px] font-black">Active Map Parameter:</span>
                <span className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-3.5 py-1.5 rounded-xl border border-slate-950 shadow-[0_4px_12px_rgba(15,23,42,0.15),inset_0_1px_1px_rgba(255,255,255,0.2)] font-mono text-xs font-bold tracking-tight">
                  {selectedParam} ({paramConfig.unit})
                </span>
              </div>

              {/* Dynamic Zoom controls - 5% change per click */}
              <div className="flex items-center gap-1 bg-slate-200/40 backdrop-blur-md border border-slate-300/40 rounded-2xl p-1 shadow-inner">
                <button
                  onClick={() => setZoomScaleFactor(z => Math.max(0.005, z * 0.95))}
                  title="Zoom In 5%"
                  className="cursor-pointer bg-white hover:bg-slate-50 text-slate-800 hover:text-slate-900 font-extrabold px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider border border-slate-200 flex items-center gap-1 shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  <ZoomIn className="w-3.5 h-3.5 text-slate-700" /> Zoom In
                </button>
                <button
                  onClick={() => setZoomScaleFactor(z => Math.min(20.0, z * 1.05))}
                  title="Zoom Out 5%"
                  className="cursor-pointer bg-white hover:bg-slate-50 text-slate-800 hover:text-slate-900 font-extrabold px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider border border-slate-200 flex items-center gap-1 shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  <ZoomOut className="w-3.5 h-3.5 text-slate-700" /> Zoom Out
                </button>
                <button
                  onClick={() => setZoomScaleFactor(1.0)}
                  title="Reset Zoom to Fit Bounding Box"
                  className="cursor-pointer bg-white hover:bg-slate-50 text-slate-500 hover:text-indigo-600 font-semibold px-2.5 py-1.5 rounded-xl text-xs border border-slate-200/85 hover:border-indigo-200 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Reset
                </button>
              </div>


              {/* Spatial Interpolation Engine Action Button (User Requirement 2) */}
              <button
                type="button"
                onClick={handleRunInterpolation}
                className="cursor-pointer bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white px-3.5 py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 shadow-md border border-indigo-500/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                title="Run spatial interpolation engine and render continuous raster surface on map"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Run Interpolation
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 bg-slate-50/80 backdrop-blur-md border border-slate-200/60 rounded-xl p-1.5 hover:border-indigo-500/50 transition-all shadow-sm">
                  <select
                    value={exportDpi}
                    onChange={(e) => setExportDpi(parseInt(e.target.value))}
                    className="text-xs font-bold bg-transparent border-none text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="300">300 DPI (Standard)</option>
                    <option value="600">600 DPI (Report Publication)</option>
                    <option value="1200">1200 DPI (Ultra Lossless)</option>
                  </select>
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as "jpeg" | "png" | "tiff" | "svg" | "shapefile")}
                    className="text-xs font-bold bg-transparent border-none text-indigo-600 focus:outline-none cursor-pointer"
                  >
                    <option value="png">PNG (Lossless)</option>
                    <option value="jpeg">JPEG (High)</option>
                    <option value="tiff">TIFF (Georeferenced)</option>
                    <option value="svg">SVG (Vector First)</option>
                    <option value="shapefile">Shapefile (.zip ESRI)</option>
                  </select>
                </div>
                {exportDpi >= 1200 && (
                  <span className="text-[9px] text-amber-600 font-bold max-w-[200px] leading-tight">
                    ⚠️ Browser limit warning: 1200+ DPI may trigger adaptive resolution capping to prevent memory allocation crashes.
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={sendToBulletin}
                  className="cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md border border-emerald-600/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  title="Send current parameter map to Annual Report"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-100" /> Send Map to Report
                </button>

                <button
                  onClick={sendToFactSheet}
                  className="cursor-pointer bg-gradient-to-r from-teal-700 to-cyan-800 hover:from-teal-800 hover:to-cyan-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md border border-teal-600/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  title="Send current high-density cropped map directly to State Fact Sheet"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-200" /> Send to State Fact Sheet
                </button>

                <button
                  onClick={sendPointAndParameterMapsToBulletin}
                  className="cursor-pointer bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md border border-indigo-500/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  title="Send BOTH Point Map (Stations) AND All Parameter Maps simultaneously to Annual Report once formatted"
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-100" /> Send Point & Parameter Maps
                </button>

                <button
                  onClick={exportMap}
                  className="cursor-pointer bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-900 hover:to-black text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md border border-slate-800/80 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  title="Export rendered map image or shapefile"
                >
                  <FileDown className="w-3.5 h-3.5 text-slate-300" /> Export Map
                </button>

                <div className="inline-flex rounded-xl shadow-md border border-teal-600/40 overflow-hidden">
                  <button
                    onClick={() => exportMapAsShapefile("all")}
                    className="cursor-pointer bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white px-3 py-2 text-xs font-bold flex items-center gap-1.5 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                    title="Export complete ArcGIS & MapInfo GIS Package (.zip): Interpolated Zones, Contours, Stations, Boundaries, and Georeferenced GeoTIFF + .tab files"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-100" /> Full GIS Package (.zip)
                  </button>
                  <button
                    onClick={() => exportMapAsShapefile("zones")}
                    className="cursor-pointer bg-teal-700 hover:bg-teal-800 text-teal-100 hover:text-white px-2 py-2 text-[10px] font-bold border-l border-teal-500/40 transition-colors"
                    title="Export Interpolated Classification Zones & Contours as Shapefile + MapInfo .tab (.zip)"
                  >
                    Zones
                  </button>
                  <button
                    onClick={() => exportMapAsShapefile("stations")}
                    className="cursor-pointer bg-teal-700 hover:bg-teal-800 text-teal-100 hover:text-white px-2 py-2 text-[10px] font-bold border-l border-teal-500/40 transition-colors"
                    title="Export sample stations as Point Shapefile + MapInfo .tab (.zip)"
                  >
                    Stations
                  </button>
                  <button
                    onClick={() => exportMapAsShapefile("boundaries")}
                    className="cursor-pointer bg-teal-700 hover:bg-teal-800 text-teal-100 hover:text-white px-2 py-2 text-[10px] font-bold border-l border-teal-500/40 transition-colors"
                    title="Export active polygon boundaries as Polygon Shapefile + MapInfo .tab (.zip)"
                  >
                    Boundary
                  </button>
                </div>

                {isComparisonActive && (
                  <button
                    onClick={downloadCombinedCanvas}
                    className="cursor-pointer bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-[0_4px_12px_rgba(99,102,241,0.3),inset_0_1px_1px_rgba(255,255,255,0.4)] border border-indigo-500/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Printer className="w-4 h-4 text-indigo-200" /> Export Combined
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Linked extents / Dual Canvas Container */}
          <div className={`grid ${isComparisonActive && comparisonLayout === "horizontal" ? "grid-cols-2" : "grid-cols-1"} gap-4 w-full`}>
            
            {/* Left/Single Panel */}
            <div className="flex flex-col gap-3 bg-gradient-to-b from-slate-50 to-slate-100/85 p-5 rounded-[2.5rem] border border-slate-200/50 shadow-[0_16px_36px_rgba(15,23,42,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] items-stretch relative overflow-hidden group">
              <div className="flex justify-between items-center px-2">
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
                  </span>
                  {isComparisonActive ? "Panel A: Pre-Monsoon" : "Primary Output Map"}
                </span>
                <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50/80 px-2.5 py-0.5 rounded-full border border-indigo-100/50">
                  {interpolationMethod.toUpperCase()} | Sync Extent
                </span>
              </div>

              <div
                className={`relative ${canvasAspectClass} w-full rounded-3xl overflow-hidden border-2 border-slate-200/85 ring-4 ring-slate-100/50 shadow-md bg-white transition-all duration-300 group-hover:shadow-lg group-hover:border-slate-300`}
                style={
                  basemap === "Transparent (No Background)"
                    ? {
                        backgroundColor: "#f8fafc",
                        backgroundImage:
                          "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
                        backgroundSize: "16px 16px",
                        backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px"
                      }
                    : undefined
                }
              >
                <canvas
                  ref={canvasRefLeft}
                  width={canvasWidth * getDpr()}
                  height={canvasHeight * getDpr()}
                  className="w-full h-full block cursor-move"
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUpOrLeave}
                  onMouseLeave={handleCanvasMouseUpOrLeave}
                  onDoubleClick={handleCanvasDoubleClick}
                />
                {isLeftLoading && (
                  <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[1px] flex items-center justify-center transition-all">
                    <div className="bg-white/95 px-3.5 py-2 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-100 animate-pulse">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin"></div>
                      <span className="text-[10px] font-extrabold text-slate-700 tracking-wider uppercase">INTERPOLATING...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Comparison Panel */}
            {isComparisonActive && (
              <div className="flex flex-col gap-3 bg-gradient-to-b from-slate-50 to-slate-100/85 p-5 rounded-[2.5rem] border border-slate-200/50 shadow-[0_16px_36px_rgba(15,23,42,0.03),inset_0_1px_2px_rgba(255,255,255,0.9)] items-stretch relative overflow-hidden group">
                <div className="flex justify-between items-center px-2">
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    {showDifferenceMap ? "Panel B: Seasonal Change" : "Panel B: Post-Monsoon"}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50/80 px-2.5 py-0.5 rounded-full border border-emerald-100/50">
                    Scale Lock
                  </span>
                </div>

                <div
                  className={`relative ${canvasAspectClass} w-full rounded-3xl overflow-hidden border-2 border-slate-200/85 ring-4 ring-slate-100/50 shadow-md bg-white transition-all duration-300 group-hover:shadow-lg group-hover:border-slate-300`}
                  style={
                    basemap === "Transparent (No Background)"
                      ? {
                          backgroundColor: "#f8fafc",
                          backgroundImage:
                            "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
                          backgroundSize: "16px 16px",
                          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px"
                        }
                      : undefined
                  }
                >
                  <canvas
                    ref={canvasRefRight}
                    width={canvasWidth * getDpr()}
                    height={canvasHeight * getDpr()}
                    className="w-full h-full block cursor-move"
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUpOrLeave}
                    onMouseLeave={handleCanvasMouseUpOrLeave}
                    onDoubleClick={handleCanvasDoubleClick}
                  />
                  {isRightLoading && (
                    <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[1px] flex items-center justify-center transition-all">
                      <div className="bg-white/95 px-3.5 py-2 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-100 animate-pulse">
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin"></div>
                        <span className="text-[10px] font-extrabold text-slate-700 tracking-wider uppercase">INTERPOLATING...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* GIS Attribute Table Viewer */}
          <GisAttributeTable
            selectedAttributeLayerId={selectedAttributeLayerId}
            setSelectedAttributeLayerId={setSelectedAttributeLayerId}
            layers={layers}
            setLayers={setLayers}
            attributeSearchQuery={attributeSearchQuery}
            setAttributeSearchQuery={setAttributeSearchQuery}
            attributeSortKey={attributeSortKey}
            setAttributeSortKey={setAttributeSortKey}
            attributeSortDesc={attributeSortDesc}
            setAttributeSortDesc={setAttributeSortDesc}
            attributePage={attributePage}
            setAttributePage={setAttributePage}
            zoomToCentroid={zoomToCentroid}
            showToast={showToast}
          />

          {/* Quick interactive map key/guide */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Info className="w-4 h-4 text-indigo-500" />
              Dynamic ground scale and grid intervals are mathematically derived based on regional latitude projection.
            </span>
            <div className="flex gap-2 font-bold text-[10px]">
              <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-100">Survey Neatline Frame</span>
              <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-100">WGS84 Extent Fit</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
