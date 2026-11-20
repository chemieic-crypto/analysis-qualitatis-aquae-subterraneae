import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { DataHeaders, ShapefileLayer } from "../types";
import { captureGlossyCanvas } from "../utils/colorSanitizer";
import { canvasToJpegBlobWithDpi, dpiToCaptureScale } from "../utils/jpegDpi";
import { buildDistrictStateMap, isStateAll, isDistrictAll, toProperCase } from "../utils/shapefileFilter";
import { INDIA_BOUNDARY } from "../data/india_boundary";
import { BaseMapType } from "./KpiChoroplethMap";
import {
  isEcParameter,
  buildSpatialSamplePoints,
  featureMatchesAdminSelection,
  selectBestAdminLayer,
  computeSpatialExtent,
  computeHighDensityIdwGrid,
  getEcColorRgba,
  extractIsoContourSegments,
  EC_CONTOUR_LEVELS,
  EC_ISO_THRESHOLDS,
  POINT_RANGE_COLORS,
  SpatialSamplePoint,
} from "../utils/kpiSpatialHelpers";
import {
  Layers,
  MapPin,
  Sparkles,
  FileImage,
  Loader2,
  SlidersHorizontal,
  Filter,
  Eye,
  EyeOff,
  AlertTriangle,
  Globe,
  Mountain,
  RotateCcw,
  X,
  Crosshair,
} from "lucide-react";

interface KpiSpatialSupplementMapProps {
  rawData: any[];
  headers: DataHeaders;
  headerMap: Record<string, string>;
  activeParam: string;
  activeConfig: { b1?: number; b2?: number; unit?: string; name?: string };
  reportingLevel: "State" | "District" | "Block";
  selectedState?: string;
  selectedDistrict?: string;
  sharedLayers?: ShapefileLayer[];
  showGisAnalysis?: boolean;
  baseMapType?: BaseMapType;
  setBaseMapType?: (val: BaseMapType) => void;
  showToast?: (message: string, type?: "success" | "error") => void;
}

type SpatialMapMode = "idw-contour" | "exceedance-points";

// Unified 4:3 Height:Width (3:4 Portrait) Frame Geometry (identical to Choropleth Map)
const PORTRAIT_W = 600;
const PORTRAIT_H = 800;
const INNER_LEFT = 42;
const INNER_TOP = 46;
const INNER_W = 544;
const INNER_H = 724;
const PLOT_PAD = 6;

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom));
}
function tileXToLon(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}
function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export default function KpiSpatialSupplementMap({
  rawData,
  headers,
  headerMap,
  activeParam,
  activeConfig,
  reportingLevel,
  selectedState,
  selectedDistrict,
  sharedLayers = [],
  baseMapType = "vector",
  setBaseMapType,
  showToast,
}: KpiSpatialSupplementMapProps) {
  const paramName = activeConfig?.name || activeParam;
  const b1 = activeConfig?.b1 ?? 0;
  const b2 = activeConfig?.b2 ?? 0;
  const unit = activeConfig?.unit || "";

  const isEcDefault = isEcParameter(activeParam, headerMap, paramName);

  // Automatic mode: IDW High Density Contour for EC; Exceedance Point Map for other parameters
  const [mapMode, setMapMode] = useState<SpatialMapMode>(isEcDefault ? "idw-contour" : "exceedance-points");
  useEffect(() => {
    setMapMode(isEcDefault ? "idw-contour" : "exceedance-points");
  }, [activeParam, isEcDefault]);

  // Block filter inside KPI spatial view for India / State / District / Block drilldown
  const [selectedBlock, setSelectedBlock] = useState<string>("ALL");
  useEffect(() => {
    setSelectedBlock("ALL");
  }, [selectedState, selectedDistrict]);

  // IDW Contour Controls (default classified Blue-Yellow-Red ranges from Geospatial Map Module)
  const [idwPower, setIdwPower] = useState<number>(2);
  const [smoothBlend, setSmoothBlend] = useState<boolean>(false);
  const [showIsoContours, setShowIsoContours] = useState<boolean>(true);
  const [showStationOverlayOnIdw, setShowStationOverlayOnIdw] = useState<boolean>(false);

  // Exceedance Point Map Controls (default point size = 0.3 matching Geospatial Map Module)
  const [exceedingOnly, setExceedingOnly] = useState<boolean>(false);
  const [showPointLabels, setShowPointLabels] = useState<boolean>(false);
  const [pointSizeScale, setPointSizeScale] = useState<number>(0.3);

  // Interactive Click-Selected Point Facility
  const [selectedPoint, setSelectedPoint] = useState<SpatialSamplePoint | null>(null);
  useEffect(() => {
    setSelectedPoint(null);
  }, [activeParam, selectedState, selectedDistrict, selectedBlock, rawData]);

  // Export & Canvas Refs
  const exportContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tileCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [tileTick, setTileTick] = useState<number>(0);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Hover State
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    lng: number;
    lat: number;
    interpVal?: number;
    point?: SpatialSamplePoint;
  } | null>(null);

  // Available Blocks list from current filtered rawData
  const availableBlocks = useMemo(() => {
    const blockCol = headers.block || "Block";
    const set = new Set<string>();
    rawData.forEach((row) => {
      const b = String(row[blockCol] || row["BLOCK"] || row["Block"] || row["Tehsil"] || "").trim();
      if (b && b.toLowerCase() !== "unknown") set.add(b);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawData, headers.block]);

  // District -> State helper map for shapefile matching
  const districtStateMap = useMemo(
    () => buildDistrictStateMap(rawData, headerMap, headers),
    [rawData, headerMap, headers]
  );

  // Geocoded sample points matching India / State / District / Block & selected parameter
  const { points: samplePoints, nonGeocodedCount } = useMemo(() => {
    return buildSpatialSamplePoints({
      rawData,
      headers,
      headerMap,
      paramKey: activeParam,
      b1,
      b2,
      selectedBlock,
    });
  }, [rawData, headers, headerMap, activeParam, b1, b2, selectedBlock]);

  // Select best admin boundary layer & filter features to India / State / District / Block
  const boundaryFeatures = useMemo(() => {
    const bestLayer = selectBestAdminLayer(
      sharedLayers,
      selectedState,
      selectedDistrict,
      selectedBlock,
      reportingLevel
    );
    if (bestLayer?.geoJson) {
      const rawFeatures =
        bestLayer.geoJson.type === "FeatureCollection"
          ? bestLayer.geoJson.features || []
          : bestLayer.geoJson.type === "Feature"
          ? [bestLayer.geoJson]
          : [];
      const matched = rawFeatures.filter((f: any) =>
        featureMatchesAdminSelection(f, selectedState, selectedDistrict, selectedBlock, districtStateMap)
      );
      if (matched.length > 0) return matched;
      if (isStateAll(selectedState) && isDistrictAll(selectedDistrict) && selectedBlock === "ALL") {
        return rawFeatures;
      }
    }
    if (isStateAll(selectedState) && isDistrictAll(selectedDistrict) && selectedBlock === "ALL") {
      return [INDIA_BOUNDARY];
    }
    return [];
  }, [sharedLayers, selectedState, selectedDistrict, selectedBlock, reportingLevel, districtStateMap]);

  // Tight Spatial bounding box: zero extra padding when boundaryFeatures exist so shapefile area matches Choropleth identically
  const bounds = useMemo(
    () => computeSpatialExtent(boundaryFeatures, samplePoints, boundaryFeatures.length > 0 ? 0 : 0.04),
    [boundaryFeatures, samplePoints]
  );

  // Active EC BIS thresholds (defaulting to 750 and 3000)
  const ecB1 = isEcDefault && b1 > 0 ? b1 : 750;
  const ecB2 = isEcDefault && b2 > 0 ? b2 : 3000;

  const ecContourLevels = useMemo(
    () => [
      { max: ecB1, color: EC_CONTOUR_LEVELS[0].color, label: `Acceptable (≤ ${ecB1} µS/cm)` },
      { max: ecB2, color: EC_CONTOUR_LEVELS[1].color, label: `Permissible (${ecB1} – ${ecB2} µS/cm)` },
      { max: Infinity, color: EC_CONTOUR_LEVELS[2].color, label: `Exceeded (> ${ecB2} µS/cm)` },
    ],
    [ecB1, ecB2]
  );

  // Ultra-High-Density IDW Raster & Marching Squares Iso-Contour computation
  const idwGridSize = 360;
  const idwData = useMemo(() => {
    if (mapMode !== "idw-contour" || samplePoints.length === 0) return null;
    const lngSpan = Math.max(0.001, bounds.maxLng - bounds.minLng);
    const latSpan = Math.max(0.001, bounds.maxLat - bounds.minLat);
    const aspect = lngSpan / latSpan;
    const cols = aspect >= 1 ? idwGridSize : Math.max(120, Math.round(idwGridSize * aspect));
    const rows = aspect >= 1 ? Math.max(120, Math.round(idwGridSize / aspect)) : idwGridSize;

    const grid = computeHighDensityIdwGrid({
      points: samplePoints,
      bounds,
      cols,
      rows,
      power: idwPower,
    });

    const thresholds = isEcDefault
      ? [ecB1, Math.round((ecB1 + ecB2) * 0.5), ecB2]
      : EC_ISO_THRESHOLDS;
    const segments = showIsoContours
      ? extractIsoContourSegments(grid, cols, rows, thresholds)
      : [];

    const mathCanvas = document.createElement("canvas");
    mathCanvas.width = cols;
    mathCanvas.height = rows;
    const mathCtx = mathCanvas.getContext("2d");
    if (mathCtx) {
      const imgData = mathCtx.createImageData(cols, rows);
      const buf = imgData.data;
      for (let r = 0; r < rows; r++) {
        const imgY = rows - 1 - r;
        for (let c = 0; c < cols; c++) {
          const val = grid[r * cols + c];
          const [rr, gg, bb, aa] = getEcColorRgba(val, smoothBlend, ecB1, ecB2);
          const idx = (imgY * cols + c) * 4;
          buf[idx] = rr;
          buf[idx + 1] = gg;
          buf[idx + 2] = bb;
          buf[idx + 3] = aa;
        }
      }
      mathCtx.putImageData(imgData, 0, 0);
    }

    return { grid, cols, rows, segments, mathCanvas };
  }, [mapMode, samplePoints, bounds, idwPower, smoothBlend, showIsoContours, ecB1, ecB2, isEcDefault]);

  // Compliance / EC Zone Statistics for Legend
  const spatialSummary = useMemo(() => {
    const exceedPts = samplePoints.filter((p) => p.isExceed);
    const acceptableToPermPts = samplePoints.filter((p) => !p.isExceed && p.isAboveAcceptable);
    const withinAccPts = samplePoints.filter((p) => !p.isExceed && !p.isAboveAcceptable);

    const ecZoneCounts = ecContourLevels.map((z) => ({ ...z, count: 0 }));
    for (const p of samplePoints) {
      for (let i = 0; i < ecContourLevels.length; i++) {
        if (p.val <= ecContourLevels[i].max) {
          ecZoneCounts[i].count++;
          break;
        }
      }
    }

    return {
      total: samplePoints.length,
      exceedCount: exceedPts.length,
      permWarnCount: acceptableToPermPts.length,
      withinAccCount: withinAccPts.length,
      ecZoneCounts,
    };
  }, [samplePoints, ecContourLevels]);

  // Human-readable active scope label
  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (selectedBlock && selectedBlock !== "ALL") parts.push(`${toProperCase(selectedBlock)} Block`);
    if (!isDistrictAll(selectedDistrict)) parts.push(`${toProperCase(selectedDistrict!)} District`);
    if (!isStateAll(selectedState)) parts.push(toProperCase(selectedState!));
    return parts.length > 0 ? parts.join(", ") : "All India";
  }, [selectedState, selectedDistrict, selectedBlock]);

  // Portrait 9:16 Coordinate Mapper (Exact match to Choropleth SVG frame)
  const getMapTransform = useCallback(() => {
    const plotW = INNER_W - PLOT_PAD * 2;
    const plotH = INNER_H - PLOT_PAD * 2;
    const midLatRad = (((bounds.minLat + bounds.maxLat) / 2) * Math.PI) / 180;
    const cosLat = Math.max(0.25, Math.cos(midLatRad));
    const dLngKm = (bounds.maxLng - bounds.minLng) * cosLat || 0.01;
    const dLat = bounds.maxLat - bounds.minLat || 0.01;

    const scale = Math.min(plotW / dLngKm, plotH / dLat);
    const drawnW = dLngKm * scale;
    const drawnH = dLat * scale;
    const offsetX = INNER_LEFT + PLOT_PAD + (plotW - drawnW) / 2;
    const offsetY = INNER_TOP + PLOT_PAD + (plotH - drawnH) / 2;

    const toX = (lng: number) => offsetX + (lng - bounds.minLng) * cosLat * scale;
    const toY = (lat: number) => offsetY + drawnH - (lat - bounds.minLat) * scale;
    const toLng = (px: number) => bounds.minLng + (px - offsetX) / (cosLat * scale);
    const toLat = (py: number) => bounds.maxLat - (py - offsetY) / scale;

    return { toX, toY, toLng, toLat, offsetX, offsetY, drawnW, drawnH, cosLat, scale };
  }, [bounds]);

  // Main Ultra-HD Portrait 4:3 H:W Canvas Render Loop (4x DPR = 2400x3200 px for glossy crisp output)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.max(window.devicePixelRatio || 1, 4);
    canvas.width = PORTRAIT_W * dpr;
    canvas.height = PORTRAIT_H * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    const MODERN_SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    // Helper: trace rounded rectangle path
    const traceRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    // 1. Strict Pure White Publication Background + Subtle Glossy Frame Fill
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PORTRAIT_W, PORTRAIT_H);

    const frameBgGrad = ctx.createLinearGradient(0, INNER_TOP, 0, INNER_TOP + INNER_H);
    frameBgGrad.addColorStop(0, "rgba(248, 250, 252, 0.7)");
    frameBgGrad.addColorStop(0.18, "rgba(255, 255, 255, 1)");
    frameBgGrad.addColorStop(1, "rgba(248, 250, 252, 0.5)");
    traceRoundedRect(INNER_LEFT, INNER_TOP, INNER_W, INNER_H, 6);
    ctx.fillStyle = frameBgGrad;
    ctx.fill();

    const { toX, toY, offsetX, offsetY, drawnW, drawnH, cosLat, scale } = getMapTransform();

    // 1b. Modern Ultra-HD Map Header Strip (Identical positioning to Choropleth SVG)
    ctx.fillStyle = "#0f172a";
    ctx.font = `800 12.8px ${MODERN_SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const pubTitle =
      mapMode === "idw-contour"
        ? `IDW Contour Map of ${toProperCase(paramName)} (${activeParam}) — ${scopeLabel}`
        : `Spatial Exceedance Point Map of ${toProperCase(paramName)} (${activeParam}) — ${scopeLabel}`;
    ctx.fillText(pubTitle, PORTRAIT_W / 2, 16, PORTRAIT_W - 24);

    ctx.fillStyle = "#475569";
    ctx.font = `600 9.8px ${MODERN_SANS}`;
    const subTitle =
      mapMode === "idw-contour"
        ? `BIS IS 10500:2012 (Acc. ≤ ${ecB1}, Perm. ${ecB1}–${ecB2}, Exc. > ${ecB2} ${unit})  •  n = ${samplePoints.length}`
        : `BIS IS 10500:2012 (PL: ${activeParam.toLowerCase() === "ph" ? "6.5–8.5" : `${b2} ${unit}`})  •  Exceeding: ${spatialSummary.exceedCount} / ${spatialSummary.total}`;
    ctx.fillText(subTitle, PORTRAIT_W / 2, 31.5, PORTRAIT_W - 24);

    // Subtle Gradient Accent Hairline Under Subtitle
    const hdrLineGrad = ctx.createLinearGradient(INNER_LEFT + 28, 0, INNER_LEFT + INNER_W - 28, 0);
    hdrLineGrad.addColorStop(0, "rgba(30, 58, 138, 0)");
    hdrLineGrad.addColorStop(0.2, "rgba(37, 99, 235, 0.85)");
    hdrLineGrad.addColorStop(0.5, "rgba(6, 182, 212, 0.95)");
    hdrLineGrad.addColorStop(0.8, "rgba(37, 99, 235, 0.85)");
    hdrLineGrad.addColorStop(1, "rgba(30, 58, 138, 0)");
    ctx.fillStyle = hdrLineGrad;
    ctx.fillRect(INNER_LEFT + 28, 40, INNER_W - 56, 1.2);

    // Helper: trace boundary polygons into current path
    const traceBoundaryPath = () => {
      ctx.beginPath();
      const traceRing = (ring: number[][]) => {
        if (!ring || ring.length < 2) return;
        for (let i = 0; i < ring.length; i++) {
          const x = toX(ring[i][0]);
          const y = toY(ring[i][1]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      };
      boundaryFeatures.forEach((f: any) => {
        const g = f?.geometry;
        if (!g) return;
        if (g.type === "Polygon") {
          g.coordinates.forEach((r: number[][]) => traceRing(r));
        } else if (g.type === "MultiPolygon") {
          g.coordinates.forEach((poly: number[][][]) => poly.forEach((r) => traceRing(r)));
        }
      });
    };

    // Clip map interior inside rounded modern frame
    ctx.save();
    traceRoundedRect(INNER_LEFT, INNER_TOP, INNER_W, INNER_H, 6);
    ctx.clip();

    // 2. Optional Raster Base Map Tiles
    if (baseMapType !== "vector") {
      const lonSpan = Math.max(0.1, bounds.maxLng - bounds.minLng);
      let z = 5;
      if (lonSpan < 0.6) z = 11;
      else if (lonSpan < 1.5) z = 10;
      else if (lonSpan < 3.5) z = 9;
      else if (lonSpan < 7) z = 8;
      else if (lonSpan < 14) z = 7;
      else if (lonSpan < 24) z = 6;

      const minTx = Math.max(0, lonToTileX(bounds.minLng, z));
      const maxTx = Math.min(Math.pow(2, z) - 1, lonToTileX(bounds.maxLng, z));
      const minTy = Math.max(0, latToTileY(bounds.maxLat, z));
      const maxTy = Math.min(Math.pow(2, z) - 1, latToTileY(bounds.minLat, z));

      let count = 0;
      for (let tx = minTx; tx <= maxTx && count < 80; tx++) {
        for (let ty = minTy; ty <= maxTy && count < 80; ty++) {
          count++;
          let url = "";
          if (baseMapType === "esri-terrain") {
            url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/${z}/${ty}/${tx}`;
          } else if (baseMapType === "esri-topo") {
            url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${ty}/${tx}`;
          } else if (baseMapType === "google-earth") {
            url = `https://mt1.google.com/vt/lyrs=s&x=${tx}&y=${ty}&z=${z}`;
          } else if (baseMapType === "google-hybrid") {
            url = `https://mt1.google.com/vt/lyrs=y&x=${tx}&y=${ty}&z=${z}`;
          }
          if (!url) continue;

          const cached = tileCacheRef.current.get(url);
          if (cached && cached.complete && cached.naturalWidth > 0) {
            const x0 = toX(tileXToLon(tx, z));
            const x1 = toX(tileXToLon(tx + 1, z));
            const y0 = toY(tileYToLat(ty, z));
            const y1 = toY(tileYToLat(ty + 1, z));
            try {
              ctx.drawImage(cached, x0, y0, Math.abs(x1 - x0) + 0.5, Math.abs(y1 - y0) + 0.5);
            } catch {
              // ignore tile draw error
            }
          } else if (!cached) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            tileCacheRef.current.set(url, img);
            img.onload = () => setTileTick((t) => t + 1);
            img.src = url;
          }
        }
      }
    }

    // 3. Subtle Modern Dashed Graticule Lines inside map frame
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.24)";
    ctx.lineWidth = 0.45;
    ctx.setLineDash([3, 3]);
    const numGrid = 4;
    for (let i = 1; i < numGrid; i++) {
      const gx = INNER_LEFT + (i / numGrid) * INNER_W;
      const gy = INNER_TOP + (i / numGrid) * INNER_H;
      ctx.beginPath();
      ctx.moveTo(gx, INNER_TOP);
      ctx.lineTo(gx, INNER_TOP + INNER_H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(INNER_LEFT, gy);
      ctx.lineTo(INNER_LEFT + INNER_W, gy);
      ctx.stroke();
    }
    ctx.restore();

    // 4. Elevated Glossy Vector Boundary Silhouette (Soft 3D Drop Shadow)
    if (boundaryFeatures.length > 0 && baseMapType === "vector") {
      ctx.save();
      traceBoundaryPath();
      ctx.shadowColor = "rgba(15, 23, 42, 0.16)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3.5;
      ctx.fillStyle = mapMode === "exceedance-points" ? "#f8fafc" : "#ffffff";
      ctx.fill("evenodd");
      ctx.restore();
    }

    // 5A. MODE 1: ULTRA-HD IDW CONTOUR MAP (EC — Geospatial Map Module Colors + Glossy Sheen)
    if (mapMode === "idw-contour" && idwData && samplePoints.length > 0) {
      const { cols, rows, segments, mathCanvas } = idwData;
      const xMin = toX(bounds.minLng);
      const xMax = toX(bounds.maxLng);
      const yTop = toY(bounds.maxLat);
      const yBottom = toY(bounds.minLat);

      ctx.save();
      if (boundaryFeatures.length > 0) {
        traceBoundaryPath();
        ctx.clip("evenodd");
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = baseMapType === "vector" ? 0.94 : 0.78;
      ctx.drawImage(mathCanvas, xMin, yTop, xMax - xMin, yBottom - yTop);
      ctx.globalAlpha = 1;

      // Subtle Glossy Enamel Specular Highlight Clipped Inside Boundary
      if (baseMapType === "vector") {
        const glossGrad = ctx.createLinearGradient(INNER_LEFT, INNER_TOP, INNER_LEFT + INNER_W, INNER_TOP + INNER_H);
        glossGrad.addColorStop(0, "rgba(255, 255, 255, 0.24)");
        glossGrad.addColorStop(0.38, "rgba(255, 255, 255, 0.06)");
        glossGrad.addColorStop(0.7, "rgba(255, 255, 255, 0)");
        glossGrad.addColorStop(1, "rgba(15, 23, 42, 0.05)");
        ctx.fillStyle = glossGrad;
        ctx.fillRect(INNER_LEFT, INNER_TOP, INNER_W, INNER_H);
      }

      // Sleek Marching Squares Iso-Contour Lines with Ultra-Crisp Labels
      if (showIsoContours && segments.length > 0) {
        const cellW = (xMax - xMin) / Math.max(1, cols - 1);
        const cellH = (yBottom - yTop) / Math.max(1, rows - 1);

        const byLevel = new Map<number, typeof segments>();
        segments.forEach((s) => {
          const arr = byLevel.get(s.level);
          if (arr) arr.push(s);
          else byLevel.set(s.level, [s]);
        });

        byLevel.forEach((segs, lvl) => {
          const isBisLimit = lvl === ecB1 || lvl === ecB2;
          ctx.beginPath();
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.strokeStyle = isBisLimit ? "rgba(15, 23, 42, 0.88)" : "rgba(15, 23, 42, 0.42)";
          ctx.lineWidth = isBisLimit ? 0.9 : 0.5;
          if (lvl === ecB2) ctx.setLineDash([4, 3]);
          else ctx.setLineDash([]);

          for (const s of segs) {
            ctx.moveTo(xMin + s.x1 * cellW, yBottom - s.y1 * cellH);
            ctx.lineTo(xMin + s.x2 * cellW, yBottom - s.y2 * cellH);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          if (segs.length >= 4) {
            const rep = segs[Math.floor(segs.length / 2)];
            const lx = xMin + ((rep.x1 + rep.x2) * 0.5) * cellW;
            const ly = yBottom - ((rep.y1 + rep.y2) * 0.5) * cellH;
            ctx.font = `800 9.5px ${MODERN_SANS}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineWidth = 2.8;
            ctx.lineJoin = "round";
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.strokeText(String(lvl), lx, ly);
            ctx.fillStyle = "#0f172a";
            ctx.fillText(String(lvl), lx, ly);
          }
        });
      }

      if (showStationOverlayOnIdw) {
        const ptRad = Math.max(2.2, pointSizeScale * 8.5);
        samplePoints.forEach((p) => {
          const px = toX(p.lng);
          const py = toY(p.lat);
          ctx.save();
          const grad = ctx.createRadialGradient(
            px - ptRad * 0.32,
            py - ptRad * 0.32,
            ptRad * 0.08,
            px,
            py,
            ptRad
          );
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.35, p.isExceed ? "#ef4444" : "#334155");
          grad.addColorStop(1, p.isExceed ? "#991b1b" : "#0f172a");
          ctx.beginPath();
          ctx.arc(px, py, ptRad, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.lineWidth = 0.5;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
          ctx.restore();
        });
      }

      ctx.restore();
    }

    // 6. Ultra-Crisp 0.5px HD Boundary Outlines
    if (boundaryFeatures.length > 0) {
      ctx.save();
      traceBoundaryPath();
      ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
      ctx.lineWidth = 0.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }

    // Helper: Glossy 3D Spherical Dot Renderer
    const drawGlossySpherePoint = (
      px: number,
      py: number,
      rad: number,
      coreColor: string,
      edgeColor: string
    ) => {
      ctx.save();
      ctx.shadowColor = "rgba(15, 23, 42, 0.25)";
      ctx.shadowBlur = Math.max(2, rad * 0.9);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.max(0.8, rad * 0.28);

      const grad = ctx.createRadialGradient(
        px - rad * 0.34,
        py - rad * 0.34,
        rad * 0.06,
        px,
        py,
        rad
      );
      grad.addColorStop(0, "rgba(255, 255, 255, 0.96)");
      grad.addColorStop(0.28, coreColor);
      grad.addColorStop(1, edgeColor);

      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Clear shadow before crisp 0.5px white rim stroke
      ctx.shadowColor = "transparent";
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.stroke();
      ctx.restore();
    };

    // 5B. MODE 2: GLOSSY HD EXCEEDANCE POINT MAP (Default Point Size = 0.3)
    if (mapMode === "exceedance-points" && samplePoints.length > 0) {
      const compliantPts = samplePoints.filter((p) => !p.isExceed && !p.isAboveAcceptable);
      const warnPts = samplePoints.filter((p) => !p.isExceed && p.isAboveAcceptable);
      const exceedPts = samplePoints.filter((p) => p.isExceed);

      const baseRad = pointSizeScale * 10.5;

      if (!exceedingOnly) {
        compliantPts.forEach((p) => {
          drawGlossySpherePoint(
            toX(p.lng),
            toY(p.lat),
            baseRad * 0.88,
            POINT_RANGE_COLORS.acceptable,
            "#15803d"
          );
        });

        warnPts.forEach((p) => {
          drawGlossySpherePoint(
            toX(p.lng),
            toY(p.lat),
            baseRad * 0.98,
            POINT_RANGE_COLORS.permissible,
            "#b45309"
          );
        });
      }

      exceedPts.forEach((p) => {
        drawGlossySpherePoint(
          toX(p.lng),
          toY(p.lat),
          baseRad * 1.18,
          POINT_RANGE_COLORS.exceeded,
          "#991b1b"
        );
      });

      if (showPointLabels) {
        const labeled = exceedPts.slice().sort((a, b) => b.val - a.val).slice(0, 28);
        ctx.font = `800 9.8px ${MODERN_SANS}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        labeled.forEach((p) => {
          const px = toX(p.lng);
          const py = toY(p.lat);
          const text = `${p.location} (${p.val})`;
          ctx.lineWidth = 3.2;
          ctx.strokeStyle = "rgba(255,255,255,0.96)";
          ctx.strokeText(text, px + baseRad + 4.5, py);
          ctx.fillStyle = "#b91c1c";
          ctx.fillText(text, px + baseRad + 4.5, py);
        });
      }
    }

    // 6b. Highlight Click-Selected Station Point on Canvas (if selected)
    if (selectedPoint) {
      const sx = toX(selectedPoint.lng);
      const sy = toY(selectedPoint.lat);
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, 9.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(245, 158, 11, 0.28)";
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "#0f172a";
      ctx.stroke();

      drawGlossySpherePoint(sx, sy, 4.6, "#fbbf24", "#d97706");

      // Clear High-Density Label near Selected Point
      const tag = `${selectedPoint.location}: ${selectedPoint.val} ${unit}`.trim();
      ctx.font = `800 10px ${MODERN_SANS}`;
      const alignRight = sx > INNER_LEFT + INNER_W * 0.65;
      ctx.textAlign = alignRight ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      const tx = alignRight ? sx - 12 : sx + 12;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText(tag, tx, sy);
      ctx.fillStyle = "#0f172a";
      ctx.fillText(tag, tx, sy);
      ctx.restore();
    }

    // 7. Sleek Modern Glossy North Compass Badge (Top-Right inside frame)
    {
      const nx = INNER_LEFT + INNER_W - 26;
      const ny = INNER_TOP + 26;
      ctx.save();
      ctx.shadowColor = "rgba(15, 23, 42, 0.14)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1.8;

      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(nx, ny, 15.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.stroke();

      ctx.strokeStyle = "rgba(148,163,184,0.35)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(nx, ny, 13.2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = `800 8.5px ${MODERN_SANS}`;
      ctx.fillStyle = "#e11d48";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("N", nx, ny - 8.2);

      ctx.beginPath();
      ctx.moveTo(nx, ny - 3.5);
      ctx.lineTo(nx + 3.6, ny + 7.2);
      ctx.lineTo(nx, ny + 4.2);
      ctx.closePath();
      ctx.fillStyle = "#0f172a";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(nx, ny - 3.5);
      ctx.lineTo(nx - 3.6, ny + 7.2);
      ctx.lineTo(nx, ny + 4.2);
      ctx.closePath();
      ctx.fillStyle = "#f1f5f9";
      ctx.fill();
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 0.55;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();
    }

    // 8. Sleek Modern Glossy Scale Pill (Bottom-Left inside frame)
    {
      const kmPerDeg = 111.32;
      const degPer90Px = 90 / (cosLat * scale || 1);
      const rawKm = degPer90Px * cosLat * kmPerDeg;
      const niceSteps = [5, 10, 25, 50, 100, 200, 500, 1000];
      const barKm = niceSteps.find((s) => s >= rawKm * 0.65) || niceSteps[niceSteps.length - 1];
      const barDegLng = barKm / (kmPerDeg * cosLat || 1);
      const barPx = Math.max(36, Math.min(115, barDegLng * cosLat * scale));

      const bx = INNER_LEFT + 14;
      const by = INNER_TOP + INNER_H - 18;
      ctx.save();
      ctx.shadowColor = "rgba(15, 23, 42, 0.12)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1.6;
      traceRoundedRect(bx - 6, by - 15, barPx + 30, 23, 5);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 0.6;
      ctx.stroke();

      ctx.fillStyle = "#0f172a";
      ctx.fillRect(bx, by, barPx / 2, 4);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 0.6;
      ctx.strokeRect(bx, by, barPx, 4);

      ctx.font = `700 8.5px ${MODERN_SANS}`;
      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("0", bx, by - 2.5);
      ctx.textAlign = "right";
      ctx.fillText(`${barKm} km`, bx + barPx + 17, by - 2.5);
      ctx.restore();
    }

    ctx.restore(); // end inner clip

    // 9. Sleek Modern Hairline Plot Border & Clean Coordinate Ticks
    ctx.save();
    traceRoundedRect(INNER_LEFT, INNER_TOP, INNER_W, INNER_H, 6);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 0.65;
    ctx.stroke();

    ctx.font = `700 8.8px ${MODERN_SANS}`;
    ctx.fillStyle = "#475569";
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 0.7;

    const numTicks = 4;
    for (let i = 0; i <= numTicks; i++) {
      const frac = i / numTicks;
      const lngVal = bounds.minLng + frac * (bounds.maxLng - bounds.minLng);
      const tx = offsetX + frac * drawnW;
      if (tx >= INNER_LEFT && tx <= INNER_LEFT + INNER_W) {
        ctx.beginPath();
        ctx.moveTo(tx, INNER_TOP + INNER_H);
        ctx.lineTo(tx, INNER_TOP + INNER_H + 4);
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`${lngVal.toFixed(1)}°E`, tx, INNER_TOP + INNER_H + 6);
      }

      const latVal = bounds.minLat + frac * (bounds.maxLat - bounds.minLat);
      const ty = offsetY + (1 - frac) * drawnH;
      if (ty >= INNER_TOP && ty <= INNER_TOP + INNER_H) {
        ctx.beginPath();
        ctx.moveTo(INNER_LEFT - 4, ty);
        ctx.lineTo(INNER_LEFT, ty);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(`${latVal.toFixed(1)}°N`, INNER_LEFT - 7, ty);
      }
    }
    ctx.restore();

    // 10. Empty / Non-Geocoded Notice
    if (samplePoints.length === 0) {
      ctx.save();
      traceRoundedRect(PORTRAIT_W / 2 - 180, PORTRAIT_H / 2 - 36, 360, 72, 10);
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.fill();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = "#0f172a";
      ctx.font = `700 12px ${MODERN_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("No geocoded stations found for this selection", PORTRAIT_W / 2, PORTRAIT_H / 2 - 6);
      ctx.fillStyle = "#475569";
      ctx.font = `500 11px ${MODERN_SANS}`;
      ctx.fillText("Ensure Latitude & Longitude columns are mapped.", PORTRAIT_W / 2, PORTRAIT_H / 2 + 14);
      ctx.restore();
    }

    ctx.restore();
  }, [
    bounds,
    boundaryFeatures,
    baseMapType,
    mapMode,
    idwData,
    samplePoints,
    showIsoContours,
    showStationOverlayOnIdw,
    exceedingOnly,
    showPointLabels,
    pointSizeScale,
    selectedPoint,
    getMapTransform,
    tileTick,
    activeParam,
    paramName,
    scopeLabel,
    ecB1,
    ecB2,
    b2,
    unit,
    spatialSummary.exceedCount,
    spatialSummary.total,
  ]);

  // Helper: Find nearest sample point from canvas client coordinates
  const findNearestPointAtEvent = (e: React.MouseEvent<HTMLCanvasElement>, maxPxDist: number) => {
    const canvas = canvasRef.current;
    if (!canvas || samplePoints.length === 0) return null;

    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * PORTRAIT_W;
    const my = ((e.clientY - rect.top) / rect.height) * PORTRAIT_H;

    const { toX, toY, toLng, toLat } = getMapTransform();
    const lng = toLng(mx);
    const lat = toLat(my);

    let nearest: SpatialSamplePoint | undefined;
    let bestPxDist = maxPxDist;
    for (const p of samplePoints) {
      if (mapMode === "exceedance-points" && exceedingOnly && !p.isExceed) continue;
      const d = Math.hypot(toX(p.lng) - mx, toY(p.lat) - my);
      if (d < bestPxDist) {
        bestPxDist = d;
        nearest = p;
      }
    }

    return { nearest, lng, lat };
  };

  // Interactive Hover Handler
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const res = findNearestPointAtEvent(e, 14);
    if (!res) {
      setHoverInfo(null);
      return;
    }

    let interpVal: number | undefined;
    if (mapMode === "idw-contour" && idwData) {
      const colFrac = (res.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1);
      const rowFrac = (res.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1);
      if (colFrac >= 0 && colFrac <= 1 && rowFrac >= 0 && rowFrac <= 1) {
        const c = Math.min(idwData.cols - 1, Math.max(0, Math.round(colFrac * (idwData.cols - 1))));
        const r = Math.min(idwData.rows - 1, Math.max(0, Math.round(rowFrac * (idwData.rows - 1))));
        const v = idwData.grid[r * idwData.cols + c];
        if (Number.isFinite(v)) interpVal = v;
      }
    }

    if (res.nearest || interpVal !== undefined) {
      setHoverInfo({
        x: e.clientX,
        y: e.clientY,
        lng: res.lng,
        lat: res.lat,
        interpVal,
        point: res.nearest,
      });
    } else {
      setHoverInfo(null);
    }
  };

  // Interactive Click Handler to Select Station Point
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const res = findNearestPointAtEvent(e, 20);
    if (res?.nearest) {
      setSelectedPoint(res.nearest);
    } else {
      setSelectedPoint(null);
    }
  };

  // High-Density 600 DPI JPEG Export
  const handleExportJpeg = async () => {
    if (!exportContainerRef.current) return;
    setIsExporting(true);
    try {
      if (showToast) showToast("Rendering Publication 600 DPI Spatial Map JPEG...", "success");
      const canvas = await captureGlossyCanvas(exportContainerRef.current, {
        scale: dpiToCaptureScale(600),
        backgroundColor: "#ffffff",
      });

      const modeTag = mapMode === "idw-contour" ? "IDW_Contour" : "Exceedance_Points";
      const scopeTag = scopeLabel.replace(/[^a-zA-Z0-9]+/g, "_");
      const filename = `${modeTag}_${activeParam}_${scopeTag}_600DPI.jpg`;

      const blob = await canvasToJpegBlobWithDpi(canvas, 600, 0.96);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = filename;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      if (showToast) showToast("Publication Map downloaded successfully!", "success");
    } catch (err) {
      console.error("Failed to export KPI spatial map:", err);
      if (showToast) showToast("Export failed. Switch to Vector base map for offline capture.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const headerTitle =
    mapMode === "idw-contour"
      ? `IDW Contour Map: ${toProperCase(paramName)} (${scopeLabel})`
      : `Exceedance Point Map: ${toProperCase(paramName)} (${scopeLabel})`;

  return (
    <div
      ref={exportContainerRef}
      className="flex flex-col space-y-2.5 font-sans relative bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs h-full"
    >
      {/* MAP HEADER BANNER (IDENTICAL HEIGHT TO CHOROPLETH MAP) */}
      <div className="min-h-[54px] flex items-center justify-between gap-2 bg-gradient-to-r from-[#17204e] via-[#1a2356] to-[#233175] text-white py-2 px-4 rounded-2xl shadow-[0_6px_16px_-4px_rgba(26,35,86,0.35),inset_0_1px_0_rgba(255,255,255,0.22)] relative overflow-hidden">
        <div className="flex items-center gap-2 min-w-0 relative z-10">
          {mapMode === "idw-contour" ? (
            <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
          ) : (
            <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="font-extrabold text-xs sm:text-sm tracking-wide text-white leading-normal py-0.5 break-words">
            {headerTitle}
          </span>
        </div>

        <div data-export-hide="true" className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center bg-slate-950/50 p-0.5 rounded-xl border border-white/15">
            <button
              onClick={() => setMapMode("idw-contour")}
              className={`px-2 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                mapMode === "idw-contour"
                  ? "bg-amber-400 text-slate-950 shadow-xs"
                  : "text-slate-200 hover:text-white"
              }`}
            >
              IDW
            </button>
            <button
              onClick={() => setMapMode("exceedance-points")}
              className={`px-2 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                mapMode === "exceedance-points"
                  ? "bg-rose-500 text-white shadow-xs"
                  : "text-slate-200 hover:text-white"
              }`}
            >
              Points
            </button>
          </div>

          <button
            onClick={handleExportJpeg}
            disabled={isExporting}
            className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shrink-0"
            title="Save Publication Map as High-Density 600 DPI JPEG"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileImage className="w-3.5 h-3.5" />}
            <span>{isExporting ? "Exporting..." : "Save 600 DPI JPEG"}</span>
          </button>
        </div>
      </div>

      {/* COMPACT CONTROLS BAR (IDENTICAL HEIGHT TO CHOROPLETH MAP) */}
      <div
        data-export-hide="true"
        className="h-[46px] flex items-center justify-between gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1 text-xs overflow-x-auto scrollbar-none"
      >
        <div className="flex items-center gap-1.5 shrink-0">
          {availableBlocks.length > 0 && (
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-1.5 py-0.5">
              <Filter className="w-3 h-3 text-indigo-600 shrink-0" />
              <select
                value={selectedBlock}
                onChange={(e) => setSelectedBlock(e.target.value)}
                className="bg-transparent text-slate-800 text-[10px] font-extrabold focus:outline-none cursor-pointer max-w-[95px]"
                title="Filter by Block"
              >
                <option value="ALL">All Blocks ({availableBlocks.length})</option>
                {availableBlocks.map((blk) => (
                  <option key={blk} value={blk}>
                    {blk}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mapMode === "idw-contour" ? (
            <>
              <div className="flex items-center gap-0.5 font-bold text-slate-700">
                <SlidersHorizontal className="w-3 h-3 text-indigo-600 mr-0.5" />
                {[1.5, 2, 2.5, 3].map((p) => (
                  <button
                    key={p}
                    onClick={() => setIdwPower(p)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold cursor-pointer border ${
                      idwPower === p
                        ? "bg-indigo-600 text-white border-indigo-700"
                        : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSmoothBlend(!smoothBlend)}
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold cursor-pointer border ${
                  smoothBlend ? "bg-cyan-600 text-white border-cyan-700" : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                {smoothBlend ? "Smooth" : "GIS Classes"}
              </button>
              <button
                onClick={() => setShowIsoContours(!showIsoContours)}
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold cursor-pointer border ${
                  showIsoContours ? "bg-slate-800 text-amber-300 border-slate-900" : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                Contours
              </button>
              <button
                onClick={() => setShowStationOverlayOnIdw(!showStationOverlayOnIdw)}
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold cursor-pointer border flex items-center gap-1 ${
                  showStationOverlayOnIdw ? "bg-emerald-600 text-white border-emerald-700" : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                {showStationOverlayOnIdw ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>Wells</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setExceedingOnly(!exceedingOnly)}
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold cursor-pointer border flex items-center gap-1 ${
                  exceedingOnly ? "bg-rose-600 text-white border-rose-700" : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>{exceedingOnly ? "> PL Only" : "All Points"}</span>
              </button>

              <button
                onClick={() => setShowPointLabels(!showPointLabels)}
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold cursor-pointer border ${
                  showPointLabels ? "bg-indigo-600 text-white border-indigo-700" : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                Labels
              </button>

              <div className="flex items-center gap-0.5 font-bold text-slate-700">
                <span className="text-[10px] mr-0.5">Size:</span>
                {[0.2, 0.3, 0.5, 0.8, 1.0].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setPointSizeScale(sz)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold cursor-pointer border ${
                      pointSizeScale === sz
                        ? "bg-slate-900 text-amber-300 border-slate-950"
                        : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {setBaseMapType && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setBaseMapType("vector")}
              className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer border flex items-center gap-1 ${
                baseMapType === "vector" ? "bg-indigo-900 text-white border-indigo-950" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>Vector</span>
            </button>
            <button
              onClick={() => setBaseMapType("esri-terrain")}
              className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer border flex items-center gap-1 ${
                baseMapType === "esri-terrain" ? "bg-amber-500 text-slate-950 border-amber-600" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              <Mountain className="w-3 h-3" />
              <span>Terrain</span>
            </button>
            <button
              onClick={() => setBaseMapType("google-earth")}
              className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer border flex items-center gap-1 ${
                baseMapType === "google-earth" ? "bg-emerald-700 text-white border-emerald-800" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Sat</span>
            </button>
            {selectedBlock !== "ALL" && (
              <button
                onClick={() => setSelectedBlock("ALL")}
                className="p-1 rounded text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 cursor-pointer"
                title="Reset Block Filter"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* PORTRAIT 3:4 (4:3 H:W) ULTRA-HD GLOSSY MAP CANVAS (IDENTICAL TO CHOROPLETH MAP) */}
      <div className="w-full aspect-[3/4] bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-md ring-1 ring-slate-900/5 relative flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={() => setHoverInfo(null)}
          onClick={handleCanvasClick}
          className="w-full h-full block cursor-crosshair bg-white"
        />

        {/* Interactive Hover Readout Tooltip */}
        {hoverInfo && (
          <div
            className="fixed z-50 bg-slate-900/95 text-white border border-slate-700 rounded-xl p-2.5 shadow-2xl pointer-events-none transform -translate-x-1/2 -translate-y-full min-w-[215px] text-xs"
            style={{ left: `${hoverInfo.x}px`, top: `${hoverInfo.y - 10}px` }}
          >
            {hoverInfo.point ? (
              <div className="space-y-1">
                <div className="font-extrabold text-amber-300 border-b border-slate-700 pb-1">
                  {hoverInfo.point.location}
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                  <span className="text-slate-400">Value:</span>
                  <span className={`font-black text-right ${hoverInfo.point.isExceed ? "text-rose-400" : "text-emerald-400"}`}>
                    {hoverInfo.point.val} {unit}
                  </span>
                  <span className="text-slate-400">Lat/Long:</span>
                  <span className="font-bold text-slate-100 text-right">
                    {hoverInfo.point.lat.toFixed(4)}°N, {hoverInfo.point.lng.toFixed(4)}°E
                  </span>
                  <span className="text-slate-400">State:</span>
                  <span className="font-semibold text-white text-right">{hoverInfo.point.state || "—"}</span>
                  <span className="text-slate-400">District:</span>
                  <span className="font-semibold text-white text-right">{hoverInfo.point.district || "—"}</span>
                  <span className="text-slate-400">Block:</span>
                  <span className="font-semibold text-white text-right">{hoverInfo.point.block || "—"}</span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-center pt-1 border-t border-slate-800">
                  {hoverInfo.point.isExceed ? (
                    <span className="text-rose-400">Exceeds BIS PL ({activeParam.toLowerCase() === "ph" ? "6.5–8.5" : b2})</span>
                  ) : hoverInfo.point.isAboveAcceptable ? (
                    <span className="text-amber-400">Permissible (&gt; {b1}, ≤ {b2})</span>
                  ) : (
                    <span className="text-emerald-400">Within Acceptable Limit</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-0.5">
                <div className="font-extrabold text-cyan-300">IDW Interpolated EC</div>
                <div className="font-black text-white text-sm">
                  {hoverInfo.interpVal !== undefined ? `${hoverInfo.interpVal.toFixed(1)} µS/cm` : "—"}
                </div>
                <div className="text-[10px] text-slate-400">
                  {hoverInfo.lat.toFixed(3)}°N, {hoverInfo.lng.toFixed(3)}°E
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PUBLICATION LEGEND & SELECTED STATION POINT INSPECTOR (NO HOTSPOTS) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
            {mapMode === "idw-contour"
              ? "EC Contour Legend (Geospatial Module Defaults)"
              : `BIS IS 10500:2012 Point Legend (${activeParam})`}
          </span>
          <span className="text-[11px] font-bold text-slate-500">
            {spatialSummary.total} Mapped Stations{nonGeocodedCount > 0 ? ` (${nonGeocodedCount} w/o coords)` : ""}
          </span>
        </div>

        {mapMode === "idw-contour" ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-xs font-bold">
            {spatialSummary.ecZoneCounts.map((z) => (
              <div key={z.label} className="bg-white border border-slate-300 rounded-xl p-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-4 h-3.5 rounded-xs border border-slate-400 shrink-0"
                    style={{ backgroundColor: z.color }}
                  />
                  <span className="font-extrabold text-slate-800 text-[11px] truncate">{z.label}</span>
                </div>
                <span className="text-[11px] font-black text-slate-700 shrink-0">{z.count} pts</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-xs font-bold">
            <div className="bg-white border border-slate-300 rounded-xl p-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full border border-slate-400 shrink-0"
                  style={{ backgroundColor: POINT_RANGE_COLORS.acceptable }}
                />
                <span className="text-[11px] font-extrabold text-slate-800">
                  Acceptable ({activeParam.toLowerCase() === "ph" ? "6.5–8.5" : `≤ ${b1 || b2}`})
                </span>
              </div>
              <span className="text-[11px] font-black text-emerald-700">{spatialSummary.withinAccCount}</span>
            </div>

            <div className="bg-white border border-slate-300 rounded-xl p-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full border border-slate-400 shrink-0"
                  style={{ backgroundColor: POINT_RANGE_COLORS.permissible }}
                />
                <span className="text-[11px] font-extrabold text-slate-800">
                  Permissible ({activeParam.toLowerCase() === "ph" ? "—" : `${b1}–${b2}`})
                </span>
              </div>
              <span className="text-[11px] font-black text-amber-700">{spatialSummary.permWarnCount}</span>
            </div>

            <div className="bg-white border border-rose-300 rounded-xl p-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full border border-white ring-1 ring-rose-500 shrink-0"
                  style={{ backgroundColor: POINT_RANGE_COLORS.exceeded }}
                />
                <span className="text-[11px] font-extrabold text-rose-950">
                  Exceeded ({activeParam.toLowerCase() === "ph" ? "<6.5 or >8.5" : `> ${b2}`})
                </span>
              </div>
              <span className="text-[11px] font-black text-rose-700">{spatialSummary.exceedCount}</span>
            </div>
          </div>
        )}

        {/* SELECTED POINT DETAILS FACILITY (Click any station on the map) */}
        {selectedPoint ? (
          <div className="border-t border-slate-200 pt-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-black text-[#1a2356]">
                <Crosshair className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Selected Station Details</span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    selectedPoint.isExceed
                      ? "bg-rose-100 text-rose-800 border border-rose-300"
                      : selectedPoint.isAboveAcceptable
                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                      : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  }`}
                >
                  {selectedPoint.isExceed
                    ? "Exceeds PL"
                    : selectedPoint.isAboveAcceptable
                    ? "Permissible"
                    : "Acceptable"}
                </span>
              </div>
              <button
                data-export-hide="true"
                onClick={() => setSelectedPoint(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 cursor-pointer"
                title="Clear selected point"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Value ({activeParam})</span>
                <span className={`font-black text-xs ${selectedPoint.isExceed ? "text-rose-700" : "text-slate-900"}`}>
                  {selectedPoint.val} {unit}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Lat / Long</span>
                <span className="font-bold text-slate-900 text-[11px]">
                  {selectedPoint.lat.toFixed(5)}°N, {selectedPoint.lng.toFixed(5)}°E
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Location</span>
                <span className="font-bold text-slate-900 text-[11px] break-words">
                  {selectedPoint.location || "—"}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">State</span>
                <span className="font-bold text-slate-900 text-[11px] break-words">
                  {selectedPoint.state || "—"}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">District</span>
                <span className="font-bold text-slate-900 text-[11px] break-words">
                  {selectedPoint.district || "—"}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Block</span>
                <span className="font-bold text-slate-900 text-[11px] break-words">
                  {selectedPoint.block || "—"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div
            data-export-hide="true"
            className="flex items-center gap-1.5 pt-2 border-t border-slate-100 text-[11px] font-bold text-slate-600"
          >
            <Crosshair className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Click any point on the map to view Value, Lat/Long, State, District, Block &amp; Location.</span>
          </div>
        )}
      </div>
    </div>
  );
}
