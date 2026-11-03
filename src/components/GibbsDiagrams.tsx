import React, { useState, useMemo, useRef, useCallback } from "react";
import { ProcessedSample } from "../utils/usslMath";
import UsslLabelsEditor, { LabelConfig } from "./UsslLabelsEditor";
import { PointSymbol, PointSymbolShape, PointSymbolIcon } from "./PointSymbol";
import {
  DIAGRAM_LINE_TEMPLATES,
  DiagramLineTheme,
  DEFAULT_DIAGRAM_TEMPLATE,
  TitleFormattingConfig,
  DEFAULT_TITLE_CONFIG,
  DiagramPageOrientation,
  PAGE_ORIENTATION_CONFIGS,
} from "../types/diagramTemplates";
import { exportDiagram } from "../utils/diagramExport";
import { DiagramToolbarStudio, SimpleTitleEditorModal } from "./DiagramToolbarStudio";
import DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG, DiagramBorderFrame } from "./DiagramBorderEditor";
import { Move } from "lucide-react";

function darkenColor(hex: string, percent = 30): string {
  if (!hex || hex.length < 6) return "#1e293b";
  let cleanHex = hex.replace("#", "");
  if (cleanHex.length === 3) {
    cleanHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
  }
  const num = parseInt(cleanHex, 16);
  let r = (num >> 16);
  let g = ((num >> 8) & 0x00FF);
  let b = (num & 0x0000FF);

  r = Math.max(0, Math.min(255, Math.round(r * (1 - percent / 100))));
  g = Math.max(0, Math.min(255, Math.round(g * (1 - percent / 100))));
  b = Math.max(0, Math.min(255, Math.round(b * (1 - percent / 100))));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function formatAxisLabel(text: string): string {
  if (!text) return "";
  return text
    // Replace Na+ or Na++ with Na⁺
    .replace(/Na\s*\+\s*\+\s*/gi, "Na²⁺")
    .replace(/Na\s*\+/gi, "Na⁺")
    // Replace Ca2+ or Ca++ variations
    .replace(/Ca\s*2\s*\+/gi, "Ca²⁺")
    .replace(/Ca\s*\+\s*\+/gi, "Ca²⁺")
    // Replace Cl- variations
    .replace(/Cl\s*-/gi, "Cl⁻")
    // Replace HCO3- variations
    .replace(/HCO\s*3\s*-/gi, "HCO₃⁻")
    .replace(/HCO\s*3/gi, "HCO₃")
    // Replace CO32- variations
    .replace(/CO\s*3\s*2\s*-/gi, "CO₃²⁻")
    .replace(/CO\s*3/gi, "CO₃²⁻")
    // Replace SO42- variations
    .replace(/SO\s*4\s*2\s*-/gi, "SO₄²⁻")
    .replace(/SO\s*4/gi, "SO₄²⁻")
    // Replace Mg2+ variations
    .replace(/Mg\s*2\s*\+/gi, "Mg²⁺");
}

interface GibbsPlotProps {
  data: ProcessedSample[];
  type: "cation" | "anion";
  defaultTitle: string;
  pointColors: Record<string, string>;
  pointSizes: Record<string, number>;
  getPointKey: (d: ProcessedSample) => string;
  stateHeader: string;
  is3d?: boolean;
  bubbleSizeMultiplier?: number;
  onBubbleSizeMultiplierChange?: (size: number) => void;
  pointSymbols?: Record<string, PointSymbol>;
  onPointSymbolsChange?: (symbols: Record<string, PointSymbol>) => void;
  defaultSymbol?: PointSymbol;
  onDefaultSymbolChange?: (symbol: PointSymbol) => void;
  activeSpatialText?: string;
  customTitle?: string;
}

export const GibbsPlot = React.memo(({
  data,
  type,
  defaultTitle,
  pointColors,
  pointSizes,
  getPointKey,
  stateHeader,
  is3d = true,
  bubbleSizeMultiplier = 1.3,
  onBubbleSizeMultiplierChange,
  pointSymbols,
  defaultSymbol,
  activeSpatialText,
  customTitle,
}: GibbsPlotProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [diagramPadding, setDiagramPadding] = useState<number>(15);
  const [outerLineWidth, setOuterLineWidth] = useState<number>(1.8);
  const [borderConfig, setBorderConfig] = useState<DiagramBorderConfig>(DEFAULT_PIPER_BORDER_CONFIG);
  const [editingBorder, setEditingBorder] = useState<boolean>(false);
  const [isAdjustingBorder, setIsAdjustingBorder] = useState<boolean>(false);
  const margin = { top: 50, right: 30, bottom: 50, left: 60 };
  const width = 350;
  const height = 400;

  // 7 Base Line Color Templates (Monochrome, Cobalt, Indigo, Emerald, Crimson, Bronze, Slate)
  const [currentTheme, setCurrentTheme] = useState<DiagramLineTheme>(DEFAULT_DIAGRAM_TEMPLATE);

  // Formattable Simple Title (Crisp, flat typography without emboss/deboss)
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [simpleTitleConfig, setSimpleTitleConfig] = useState<TitleFormattingConfig>({
    text: customTitle || defaultTitle,
    size: 12,
    color: "#0f172a",
    isBold: true,
    isItalic: false,
    fontFamily: "'Inter', system-ui, sans-serif",
    alignment: "center",
  });

  React.useEffect(() => {
    if (customTitle || defaultTitle) {
      setSimpleTitleConfig((prev) => ({
        ...prev,
        text: customTitle || defaultTitle,
      }));
    }
  }, [customTitle, defaultTitle]);

  // Systematic Downsampling to prevent UI hanging under large datasets
  const maxSafePoints = 1200;
  const isDownsampled = data.length > maxSafePoints;
  const displayData = useMemo(() => {
    if (!isDownsampled) return data;
    const step = Math.ceil(data.length / maxSafePoints);
    return data.filter((_, idx) => idx % step === 0);
  }, [data, isDownsampled]);

  // A4 Page Orientation (fit | a4_portrait | a4_landscape)
  const [pageOrientation, setPageOrientation] = useState<DiagramPageOrientation>("fit");
  const [showLegendTile, setShowLegendTile] = useState<boolean>(true);

  // Active Visible Variables strictly filtered from displayData (Requirement #6: Cascading Spatial Filter sync)
  const activeLegendItems = useMemo(() => {
    const visibleKeys = new Set<string>();
    displayData.forEach((d) => {
      const hasValidPoint = type === "cation"
        ? (d._calc.hasGibbsCation ?? d._calc.hasGibbs)
        : (d._calc.hasGibbsAnion ?? d._calc.hasGibbs);
      if (!hasValidPoint) return;
      const k = getPointKey(d);
      if (k && k !== "Unknown" && k.trim() !== "") {
        visibleKeys.add(k);
      }
    });

    const keys = Array.from(visibleKeys).sort();
    return keys.map((key) => ({
      key,
      label: key,
      color: pointColors[key] || "#3b82f6",
      symbol: (pointSymbols && pointSymbols[key]) || defaultSymbol || "circle",
    }));
  }, [displayData, type, getPointKey, pointColors, pointSymbols, defaultSymbol]);

  const [labelsConfig, setLabelsConfig] = useState({
    title: { text: defaultTitle, size: 14, color: "#64748b", isBold: true, isItalic: false, fontFamily: "sans-serif" },
    xAxis: {
      text: type === "cation" ? "Na⁺ / (Na⁺ + Ca²⁺)" : "Cl⁻ / (Cl⁻ + HCO₃⁻)",
      size: 11,
      color: "#64748b",
      isBold: true,
      isItalic: false,
      fontFamily: "sans-serif",
    },
    yAxis: { text: "TDS (mg/L)", size: 12, color: "#64748b", isBold: true, isItalic: false, fontFamily: "sans-serif" },
  });

  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [localPointSize, setLocalPointSize] = useState<number>(bubbleSizeMultiplier ?? 1.3);
  React.useEffect(() => {
    if (bubbleSizeMultiplier !== undefined) {
      setLocalPointSize(bubbleSizeMultiplier);
    }
  }, [bubbleSizeMultiplier]);

  const handlePointSizeChange = (val: number) => {
    const clamped = Math.max(0.1, Math.min(3, Number(val.toFixed(1))));
    setLocalPointSize(clamped);
    onBubbleSizeMultiplierChange?.(clamped);
  };

  const DEFAULT_TITLE_POS = { x: width / 2, y: 25 };
  const [titlePos, setTitlePos] = useState<{ x: number; y: number }>(DEFAULT_TITLE_POS);
  const [isDraggingTitle, setIsDraggingTitle] = useState(false);
  const [titleDragOffset, setTitleDragOffset] = useState({ x: 0, y: 0 });
  const titleDragStartPos = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fullscreenSvgRef = useRef<SVGSVGElement>(null);

  const handleTitlePointerDown = (e: React.PointerEvent<any>, targetSvg: SVGSVGElement | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (!targetSvg) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startTitleX = titlePos.x;
    const startTitleY = titlePos.y;
    let hasMoved = false;

    const onPointerMove = (moveEv: PointerEvent) => {
      moveEv.preventDefault();
      const dx = moveEv.clientX - startClientX;
      const dy = moveEv.clientY - startClientY;
      if (Math.hypot(dx, dy) > 3) {
        hasMoved = true;
      }
      const ctm = targetSvg.getScreenCTM();
      if (!ctm) return;
      const svgDx = dx / ctm.a;
      const svgDy = dy / ctm.d;

      setTitlePos({
        x: Math.round(startTitleX + svgDx),
        y: Math.round(startTitleY + svgDy),
      });
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      setIsDraggingTitle(false);
      if (!hasMoved) {
        setEditingKey("title");
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    setIsDraggingTitle(true);
  };

  const getX = (val: number) => margin.left + val * (width - margin.left - margin.right);
  const getY = (val: number) => {
    const logMin = 1;
    const logMax = 4.5; // Log10 of ~31620 mg/L
    const logVal = Math.log10(Math.max(1, val));
    const normalized = (logVal - logMin) / (logMax - logMin);
    return height - margin.bottom - normalized * (height - margin.bottom - margin.top);
  };

  const polygonFill = currentTheme.primaryLine;
  const polygonStroke = currentTheme.primaryLine;
  const axisColor = currentTheme.axisColor;

  // Crop states
  const [isCropActive, setIsCropActive] = useState<boolean>(false);
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 40,
    y: 80,
    width: 270,
    height: 320,
  });

  const cropDraggingRef = useRef<{
    mode: "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
    startX: number;
    startY: number;
    startBox: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const handleCropDragStart = (e: React.MouseEvent | React.TouchEvent, mode: "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w") => {
    e.stopPropagation();
    let clientX = 0;
    let clientY = 0;
    if ("touches" in e && e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("clientX" in e) {
      clientX = (e as React.MouseEvent).clientX || 0;
      clientY = (e as React.MouseEvent).clientY || 0;
    }

    cropDraggingRef.current = {
      mode,
      startX: clientX,
      startY: clientY,
      startBox: { ...cropBox },
    };

    const onMove = (moveEvt: MouseEvent | TouchEvent) => {
      if (!cropDraggingRef.current) return;
      const drag = cropDraggingRef.current;
      
      let curX = 0;
      let curY = 0;
      if ("touches" in moveEvt && (moveEvt as TouchEvent).touches && (moveEvt as TouchEvent).touches.length > 0) {
        curX = (moveEvt as TouchEvent).touches[0].clientX;
        curY = (moveEvt as TouchEvent).touches[0].clientY;
      } else if ("changedTouches" in moveEvt && (moveEvt as TouchEvent).changedTouches && (moveEvt as TouchEvent).changedTouches.length > 0) {
        curX = (moveEvt as TouchEvent).changedTouches[0].clientX;
        curY = (moveEvt as TouchEvent).changedTouches[0].clientY;
      } else {
        curX = (moveEvt as MouseEvent).clientX || 0;
        curY = (moveEvt as MouseEvent).clientY || 0;
      }

      const dx = curX - drag.startX;
      const dy = curY - drag.startY;

      setCropBox((prev) => {
        let { x, y, width, height } = drag.startBox;
        const minSize = 50;

        if (drag.mode === "move") {
          x = x + dx;
          y = y + dy;
        } else {
          if (drag.mode.includes("n")) {
            const potentialY = y + dy;
            const potentialHeight = height - dy;
            if (potentialHeight >= minSize) {
              y = potentialY;
              height = potentialHeight;
            }
          }
          if (drag.mode.includes("s")) {
            const potentialHeight = height + dy;
            if (potentialHeight >= minSize) {
              height = potentialHeight;
            }
          }
          if (drag.mode.includes("e")) {
            const potentialWidth = width + dx;
            if (potentialWidth >= minSize) {
              width = potentialWidth;
            }
          }
          if (drag.mode.includes("w")) {
            const potentialX = x + dx;
            const potentialWidth = width - dx;
            if (potentialWidth >= minSize) {
              x = potentialX;
              width = potentialWidth;
            }
          }
        }

        return { x, y, width, height };
      });
    };

    const onEnd = () => {
      cropDraggingRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchend", onEnd);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchend", onEnd);
  };

  const exportId = `gibbs-${type}`;

  const handleExport = (format: "jpeg" | "png" | "svg", transparent: boolean, elementId = exportId) => {
    exportDiagram({
      elementId,
      filename: `Gibbs_${type === "cation" ? "Cation" : "Anion"}_Diagram`,
      format,
      transparent,
      scale: 3,
      isCropActive,
      cropBox,
      orientation: pageOrientation,
      svgElement: elementId.includes("fs") ? fullscreenSvgRef.current : svgRef.current,
    });
  };

  const renderPointList = useCallback((isFs: boolean) => {
    return displayData.map((d, i) => {
      const hasValidPoint = type === "cation" ? (d._calc.hasGibbsCation ?? d._calc.hasGibbs) : (d._calc.hasGibbsAnion ?? d._calc.hasGibbs);
      if (!hasValidPoint) return null;

      const key = getPointKey(d);
      const color = pointColors[key] || "#3b82f6";
      const baseMult = pointSizes && pointSizes[key] ? (pointSizes[key] / 1.3) : 1;
      const radius = Math.max(0.1, Math.min(6, Number((localPointSize * baseMult).toFixed(2))));
      const stateStr = stateHeader ? d[stateHeader] : d.State || d.STATE;
      const xVal = type === "cation" ? d._calc.gibbsCation : d._calc.gibbsAnion;
      const yVal = d._calc.tds;

      if (isNaN(xVal) || isNaN(yVal) || yVal <= 0) return null;

      const sym = (pointSymbols && pointSymbols[key]) || defaultSymbol || "circle";
      const bubbleId = isFs ? `bubble-fs-${String(color).replace(/#/g, "")}` : `bubble-${String(color).replace(/#/g, "")}`;
      const fillValue = is3d ? `url(#${bubbleId})` : color;

      return (
        <g key={i} className="cursor-pointer hover:opacity-80 transition-all duration-300">
          <title>{`${d._calc.locName}\nTDS: ${yVal.toFixed(1)}\nRatio: ${xVal.toFixed(2)}` + (stateStr ? `\nState: ${stateStr}` : "")}</title>
          <PointSymbolShape
            symbol={sym}
            cx={getX(xVal)}
            cy={getY(yVal)}
            r={radius}
            fill={fillValue}
            stroke={is3d ? "rgba(255,255,255,0.4)" : "#ffffff"}
            strokeWidth={is3d ? 0.3 : 0.5}
            opacity={0.95}
            is3d={is3d}
          />
        </g>
      );
    });
  }, [displayData, pointColors, pointSizes, getPointKey, stateHeader, type, is3d, localPointSize, pointSymbols, defaultSymbol]);

  return (
    <div className="bg-transparent p-4 sm:p-6 flex flex-col items-center w-full transition-colors duration-300 relative group">
      {/* Tile 1: Small Formatting Studio Toolbar */}
      <div className="w-full max-w-[650px] mb-3 relative z-30">
        <DiagramToolbarStudio
          currentTheme={currentTheme}
          onThemeChange={setCurrentTheme}
          onExport={handleExport}
          isCropActive={isCropActive}
          onToggleCrop={() => setIsCropActive(!isCropActive)}
          titleConfig={simpleTitleConfig}
          onOpenTitleEditor={() => setIsTitleModalOpen(true)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          activeSpatialText={activeSpatialText}
          pointSize={localPointSize}
          onPointSizeChange={handlePointSizeChange}
          orientation={pageOrientation}
          onOrientationChange={setPageOrientation}
          showLegendTile={showLegendTile}
          onToggleLegendTile={() => setShowLegendTile(!showLegendTile)}
          outerLineWidth={outerLineWidth}
          onOuterLineWidthChange={setOuterLineWidth}
          borderConfig={borderConfig}
          onBorderConfigChange={setBorderConfig}
          onOpenBorderEditor={() => setEditingBorder(true)}
          isAdjustingBorder={isAdjustingBorder}
          onToggleAdjustBorder={() => setIsAdjustingBorder((p) => !p)}
        >
          <div className="flex items-center gap-1 bg-white rounded-xl px-2 py-1 border border-slate-200 shadow-2xs" title="Adjust Chart Margin Space">
            <span className="text-[9px] font-black uppercase text-slate-400">Pad:</span>
            {[
              { label: "Normal", pad: 15 },
              { label: "Spacious", pad: 30 },
              { label: "Wide", pad: 50 },
            ].map((opt) => (
              <button
                key={opt.pad}
                onClick={() => setDiagramPadding(opt.pad)}
                className={`px-1.5 py-0.5 rounded-lg text-[9.5px] font-bold transition-all ${
                  diagramPadding === opt.pad
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </DiagramToolbarStudio>
      </div>

      <SimpleTitleEditorModal
        isOpen={isTitleModalOpen}
        config={simpleTitleConfig}
        onChange={setSimpleTitleConfig}
        onClose={() => setIsTitleModalOpen(false)}
      />

      {editingKey && labelsConfig[editingKey as keyof typeof labelsConfig] && (
        <UsslLabelsEditor
          config={labelsConfig[editingKey as keyof typeof labelsConfig]}
          onChange={(newConf) => setLabelsConfig((p) => ({ ...p, [editingKey]: newConf }))}
          onClose={() => setEditingKey(null)}
        />
      )}

      {/* Border Frame Studio Modal */}
      {editingBorder && (
        <DiagramBorderEditor
          config={borderConfig}
          onChange={setBorderConfig}
          onClose={() => setEditingBorder(false)}
          title="Gibbs Diagram Border Frame Studio"
          onStartInteractiveAdjust={() => setIsAdjustingBorder(true)}
        />
      )}

      {/* Move & Fit Border Mode Floating Banner */}
      {isAdjustingBorder && (
        <div className="w-full max-w-[1240px] mb-2 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-bold shadow-md animate-in slide-in-from-top-2 border border-amber-600 z-30">
          <div className="flex items-center gap-2">
            <Move className="w-4 h-4 animate-bounce" />
            <span>
              <strong>Move &amp; Fit Border Active:</strong> Drag handles or the frame directly on the diagram to fit content.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsAdjustingBorder(false)}
            className="bg-slate-900 text-white px-3 py-1 rounded-xl text-xs font-black shadow-xs hover:bg-black transition"
          >
            ✓ Done
          </button>
        </div>
      )}

      {/* Tile 2: Main Chart Tile (Pure white background, publication frame) */}
      <div
        id={exportId}
        className={`flex flex-col items-center justify-center bg-white p-3 sm:p-5 w-full rounded-3xl relative z-10 border border-slate-200/80 shadow-xs transition-all ${PAGE_ORIENTATION_CONFIGS[pageOrientation].className}`}
      >
        {/* Draggable/Resizable Crop Box overlay */}
        {isCropActive && (
          <div
            id="draggable-crop-box"
            className="absolute z-[1500] border-4 border-dashed border-amber-500 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)] pointer-events-auto cursor-move select-none"
            style={{
              left: `${cropBox.x}px`,
              top: `${cropBox.y}px`,
              width: `${cropBox.width}px`,
              height: `${cropBox.height}px`,
            }}
            onMouseDown={(e) => handleCropDragStart(e, "move")}
            onTouchStart={(e) => handleCropDragStart(e, "move")}
          >
            {/* Corner Resizing Handles */}
            <div
              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-amber-500 border border-white rounded-full cursor-nwse-resize z-[1510]"
              onMouseDown={(e) => { e.stopPropagation(); handleCropDragStart(e, "nw"); }}
              onTouchStart={(e) => { e.stopPropagation(); handleCropDragStart(e, "nw"); }}
            />
            <div
              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-500 border border-white rounded-full cursor-nesw-resize z-[1510]"
              onMouseDown={(e) => { e.stopPropagation(); handleCropDragStart(e, "ne"); }}
              onTouchStart={(e) => { e.stopPropagation(); handleCropDragStart(e, "ne"); }}
            />
            <div
              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-amber-500 border border-white rounded-full cursor-nesw-resize z-[1510]"
              onMouseDown={(e) => { e.stopPropagation(); handleCropDragStart(e, "sw"); }}
              onTouchStart={(e) => { e.stopPropagation(); handleCropDragStart(e, "sw"); }}
            />
            <div
              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-amber-500 border border-white rounded-full cursor-nwse-resize z-[1510]"
              onMouseDown={(e) => { e.stopPropagation(); handleCropDragStart(e, "se"); }}
              onTouchStart={(e) => { e.stopPropagation(); handleCropDragStart(e, "se"); }}
            />
            
            {/* Crop Box Label Overlay */}
            <div className="absolute top-2 left-2 bg-amber-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow uppercase tracking-wider">
              Crop Area: {Math.round(cropBox.width)} × {Math.round(cropBox.height)}
            </div>
          </div>
        )}
        <div className="flex flex-col items-center justify-center p-4 w-full">
        <svg
          ref={svgRef}
          viewBox={`${-diagramPadding} ${-diagramPadding} ${width + diagramPadding * 2} ${height + diagramPadding * 2}`}
          className="w-full h-auto max-w-[550px] overflow-visible"
          style={{ fontFamily: "'Inter', sans-serif", touchAction: "none" }}
          onClick={() => {
            if (!isDraggingTitle) setEditingKey(null);
          }}
        >
          {/* Pure White Diagram Canvas Background */}
          <rect
            id="diagram-base-canvas-bg"
            x={-diagramPadding}
            y={-diagramPadding}
            width={width + diagramPadding * 2}
            height={height + diagramPadding * 2}
            fill="#ffffff"
          />

          {/* Moveable & Customisable Outer Frame Border */}
          <DiagramBorderFrame
            baseX={-diagramPadding}
            baseY={-diagramPadding}
            baseWidth={width + diagramPadding * 2}
            baseHeight={height + diagramPadding * 2}
            config={borderConfig}
            isInteractive={isAdjustingBorder}
            onConfigChange={setBorderConfig}
            svgRef={svgRef}
            idPrefix="gibbs"
          />
          <defs>
            {is3d && (
              <>
                {Array.from(new Set(Object.values(pointColors || {})))
                  .filter((c): c is string => typeof c === "string" && !!c)
                  .map((color) => {
                    const id = `bubble-${color.replace(/#/g, "")}`;
                    const darker = darkenColor(color, 35);
                    return (
                      <radialGradient key={color} id={id} cx="35%" cy="35%" r="70%" fx="35%" fy="35%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                        <stop offset="25%" stopColor={color} stopOpacity="0.95" />
                        <stop offset="85%" stopColor={darker} stopOpacity="1" />
                        <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
                      </radialGradient>
                    );
                  })}
              </>
            )}
          </defs>

          {/* Simple Formattable Flat Title (No Emboss / Deboss) */}
          <text
            x={titlePos.x}
            y={titlePos.y}
            textAnchor={simpleTitleConfig.alignment === "left" ? "start" : simpleTitleConfig.alignment === "right" ? "end" : "middle"}
            fontSize={simpleTitleConfig.size}
            fill={simpleTitleConfig.color}
            fontWeight={simpleTitleConfig.isBold ? "700" : "400"}
            fontStyle={simpleTitleConfig.isItalic ? "italic" : "normal"}
            fontFamily={simpleTitleConfig.fontFamily || "'Inter', system-ui, sans-serif"}
            style={{
              cursor: isDraggingTitle ? "grabbing" : "grab",
              letterSpacing: "0.05em",
              userSelect: "none",
              touchAction: "none"
            }}
            onPointerDown={(e) => handleTitlePointerDown(e, svgRef.current)}
          >
            {(simpleTitleConfig.text || "").split("\n").map((line, idx) => (
              <tspan key={idx} x={titlePos.x} dy={idx === 0 ? 0 : simpleTitleConfig.size * 1.3}>
                {line}
              </tspan>
            ))}
          </text>

          <text
            transform={`translate(20, ${height / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={labelsConfig.yAxis.size}
            fill={labelsConfig.yAxis.color}
            fontWeight={labelsConfig.yAxis.isBold ? "900" : "400"}
            fontStyle={labelsConfig.yAxis.isItalic ? "italic" : "normal"}
            fontFamily={labelsConfig.yAxis.fontFamily || "sans-serif"}
            style={{ cursor: "pointer", letterSpacing: "0.1em" }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditingKey("yAxis");
            }}
            onClick={(e) => {
              e.stopPropagation();
              setEditingKey("yAxis");
            }}
          >
            {labelsConfig.yAxis.text}
          </text>

          <text
            x={width / 2}
            y={height - 10}
            textAnchor="middle"
            fontSize={labelsConfig.xAxis.size}
            fill={labelsConfig.xAxis.color}
            fontWeight={labelsConfig.xAxis.isBold ? "900" : "400"}
            fontStyle={labelsConfig.xAxis.isItalic ? "italic" : "normal"}
            fontFamily={labelsConfig.xAxis.fontFamily || "sans-serif"}
            style={{ cursor: "pointer", letterSpacing: "0.1em" }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditingKey("xAxis");
            }}
            onClick={(e) => {
              e.stopPropagation();
              setEditingKey("xAxis");
            }}
          >
            {formatAxisLabel(labelsConfig.xAxis.text)}
          </text>

          <path
            d={`M ${getX(0.1)} ${getY(5000)} L ${getX(0.9)} ${getY(10000)} L ${getX(0.9)} ${getY(1000)} L ${getX(0.1)} ${getY(10)} L ${getX(0.1)} ${getY(5000)}`}
            fill={polygonFill}
            fillOpacity="0.02"
            stroke={polygonStroke}
            strokeDasharray="4"
            strokeWidth={outerLineWidth}
          />

          <text x={getX(0.85)} y={getY(8000)} textAnchor="end" fontSize="9" fill="#64748b" fontWeight="bold" opacity="0.6">
            Evaporation
          </text>
          <text x={getX(0.5)} y={getY(500)} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="bold" opacity="0.6">
            Rock
          </text>
          <text x={getX(0.15)} y={getY(20)} textAnchor="start" fontSize="9" fill="#64748b" fontWeight="bold" opacity="0.6">
            Precipitation
          </text>

          <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke={axisColor} strokeWidth={outerLineWidth} />
          <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke={axisColor} strokeWidth={outerLineWidth} />

          {[10, 100, 1000, 10000].map((val) => (
            <g key={val}>
              <line x1={margin.left - 5} y1={getY(val)} x2={margin.left} y2={getY(val)} stroke={axisColor} />
              <text x={margin.left - 10} y={getY(val) + 3} textAnchor="end" fontSize="8" fill="#64748b" fontWeight="bold">
                {val}
              </text>
            </g>
          ))}

          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((val) => (
            <g key={val}>
              <line x1={getX(val)} y1={height - margin.bottom} x2={getX(val)} y2={height - margin.bottom + 5} stroke={axisColor} />
              <text x={getX(val)} y={height - margin.bottom + 15} textAnchor="middle" fontSize="8" fill="#64748b" fontWeight="bold">
                {val}
              </text>
            </g>
          ))}

          {renderPointList(false)}
        </svg>
        </div>
      </div>

      {/* Tile 3: Dedicated Publication Legend Tile (strictly displaying active variables from cascading filter) */}
      {showLegendTile && activeLegendItems.length > 0 && (
        <div className="w-full max-w-[650px] mt-3.5 bg-white border border-slate-200/80 shadow-xs rounded-2xl p-3.5 transition-all">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                Active Filter Variables Legend
              </span>
            </div>
            <span className="text-[9.5px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {activeLegendItems.length} {activeLegendItems.length === 1 ? "item" : "items"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {activeLegendItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700 text-[10.5px] font-bold shadow-2xs hover:bg-slate-100 transition-all min-w-0"
                title={item.label}
              >
                <PointSymbolIcon symbol={item.symbol} color={item.color} size={12} is3d={is3d} />
                <span className="truncate">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Screen Modal View */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-4xl max-h-[92vh] flex flex-col relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <i className="ph ph-corners-out text-lg text-indigo-600"></i>
                  {simpleTitleConfig.text} (Full Screen)
                </h3>
                {activeSpatialText && (
                  <p className="text-[10px] text-indigo-600 font-extrabold uppercase mt-0.5 flex items-center gap-1">
                    <i className="ph ph-map-pin text-xs"></i>
                    {activeSpatialText}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl px-2.5 py-1.5 border border-slate-200 shadow-sm" title="Point Size (0.1 to 3.0)">
                  <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider pl-1">Point Size:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.1"
                    value={localPointSize}
                    onChange={(e) => handlePointSizeChange(parseFloat(e.target.value))}
                    className="w-20 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="text-xs font-mono font-bold text-slate-800 w-7 text-center">
                    {localPointSize.toFixed(1)}
                  </span>
                </div>
                {/* Dedicated White Background vs Transparent PNG buttons */}
                <button
                  onClick={() => handleExport("jpeg", false, `${exportId}-fs`)}
                  className="bg-slate-900 text-white hover:bg-black px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                  title="Download JPEG with Pure White Background"
                >
                  <i className="ph ph-file-jpg text-base text-amber-300"></i>
                  <span>White JPEG</span>
                </button>
                <button
                  onClick={() => handleExport("png", true, `${exportId}-fs`)}
                  className="bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                  title="Download High-Res Transparent PNG"
                >
                  <i className="ph ph-image text-base text-cyan-300"></i>
                  <span>Transparent PNG</span>
                </button>
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="bg-slate-100 text-slate-600 hover:bg-rose-600 hover:text-white p-2 rounded-xl text-xs font-bold transition-all border-b-4 border-slate-200 hover:border-rose-800 active:border-b-0 active:translate-y-1"
                  title="Close Full Screen"
                >
                  <i className="ph ph-x text-lg font-bold"></i>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-[400px]">
              <div id={`${exportId}-fs`} className="flex flex-col items-center justify-center p-6 w-full max-w-[450px] bg-white rounded-2xl relative">
                <svg
                  ref={fullscreenSvgRef}
                  viewBox={`${-diagramPadding} ${-diagramPadding} ${width + diagramPadding * 2} ${height + diagramPadding * 2}`}
                  className="w-full h-auto max-h-[60vh] overflow-visible"
                  style={{ fontFamily: "'Inter', sans-serif", touchAction: "none" }}
                  onClick={() => {
                    if (!isDraggingTitle) setEditingKey(null);
                  }}
                >
                  {/* Pure White Background for Fullscreen Canvas */}
                  <rect
                    id="diagram-base-canvas-bg"
                    x={-diagramPadding}
                    y={-diagramPadding}
                    width={width + diagramPadding * 2}
                    height={height + diagramPadding * 2}
                    fill="#ffffff"
                  />
                  <defs>
                    {is3d && (
                      <>
                        {Array.from(new Set(Object.values(pointColors || {})))
                          .filter((c): c is string => typeof c === "string" && !!c)
                          .map((color) => {
                            const id = `bubble-fs-${color.replace(/#/g, "")}`;
                            const darker = darkenColor(color, 35);
                            return (
                              <radialGradient key={color} id={id} cx="35%" cy="35%" r="70%" fx="35%" fy="35%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                                <stop offset="25%" stopColor={color} stopOpacity="0.95" />
                                <stop offset="85%" stopColor={darker} stopOpacity="1" />
                                <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
                              </radialGradient>
                            );
                          })}
                      </>
                    )}
                  </defs>

                  <text
                    x={titlePos.x}
                    y={titlePos.y}
                    textAnchor={simpleTitleConfig.alignment === "left" ? "start" : simpleTitleConfig.alignment === "right" ? "end" : "middle"}
                    fontSize={simpleTitleConfig.size}
                    fill={simpleTitleConfig.color}
                    fontWeight={simpleTitleConfig.isBold ? "700" : "400"}
                    fontStyle={simpleTitleConfig.isItalic ? "italic" : "normal"}
                    fontFamily={simpleTitleConfig.fontFamily || "'Inter', system-ui, sans-serif"}
                    style={{
                      cursor: isDraggingTitle ? "grabbing" : "grab",
                      letterSpacing: "0.05em",
                      userSelect: "none",
                      touchAction: "none"
                    }}
                    onPointerDown={(e) => handleTitlePointerDown(e, fullscreenSvgRef.current)}
                  >
                    {(simpleTitleConfig.text || "").split("\n").map((line, idx) => (
                      <tspan key={idx} x={titlePos.x} dy={idx === 0 ? 0 : simpleTitleConfig.size * 1.3}>
                        {line}
                      </tspan>
                    ))}
                  </text>

                  <text
                    x={width / 2}
                    y={height - margin.bottom + 35}
                    textAnchor="middle"
                    fontSize={labelsConfig.xAxis.size}
                    fill={labelsConfig.xAxis.color}
                    fontWeight={labelsConfig.xAxis.isBold ? "900" : "400"}
                    fontStyle={labelsConfig.xAxis.isItalic ? "italic" : "normal"}
                    fontFamily={labelsConfig.xAxis.fontFamily || "sans-serif"}
                  >
                    {formatAxisLabel(labelsConfig.xAxis.text)}
                  </text>

                  <text
                    transform={`translate(${margin.left - 40}, ${height / 2}) rotate(-90)`}
                    textAnchor="middle"
                    fontSize={labelsConfig.yAxis.size}
                    fill={labelsConfig.yAxis.color}
                    fontWeight={labelsConfig.yAxis.isBold ? "900" : "400"}
                    fontStyle={labelsConfig.yAxis.isItalic ? "italic" : "normal"}
                    fontFamily={labelsConfig.yAxis.fontFamily || "sans-serif"}
                  >
                    {labelsConfig.yAxis.text}
                  </text>

                  {/* Envelope background polygons */}
                  {type === "cation" ? (
                    <>
                      <polygon points={`${getX(0.96)} ${getY(15000)} ${getX(0.7)} ${getY(1000)} ${getX(0.5)} ${getY(100)} ${getX(0.4)} ${getY(100)} ${getX(0.6)} ${getY(1000)} ${getX(0.99)} ${getY(15000)}`} fill={polygonFill} fillOpacity="0.05" stroke={polygonStroke} strokeWidth="1" />
                      <polygon points={`${getX(0.3)} ${getY(1000)} ${getX(0.5)} ${getY(250)} ${getX(0.5)} ${getY(70)} ${getX(0.35)} ${getY(70)} ${getX(0.35)} ${getY(250)} ${getX(0.18)} ${getY(1000)}`} fill={polygonFill} fillOpacity="0.05" stroke={polygonStroke} strokeWidth="1" />
                      <polygon points={`${getX(0.1)} ${getY(20)} ${getX(0.4)} ${getY(5)} ${getX(0.92)} ${getY(20)} ${getX(0.85)} ${getY(40)} ${getX(0.4)} ${getY(10)} ${getX(0.15)} ${getY(40)}`} fill={polygonFill} fillOpacity="0.05" stroke={polygonStroke} strokeWidth="1" />
                    </>
                  ) : (
                    <>
                      <polygon points={`${getX(0.98)} ${getY(15000)} ${getX(0.72)} ${getY(1000)} ${getX(0.45)} ${getY(100)} ${getX(0.35)} ${getY(100)} ${getX(0.6)} ${getY(1000)} ${getX(0.99)} ${getY(15000)}`} fill={polygonFill} fillOpacity="0.05" stroke={polygonStroke} strokeWidth="1" />
                      <polygon points={`${getX(0.28)} ${getY(1000)} ${getX(0.48)} ${getY(250)} ${getX(0.48)} ${getY(70)} ${getX(0.32)} ${getY(70)} ${getX(0.32)} ${getY(250)} ${getX(0.15)} ${getY(1000)}`} fill={polygonFill} fillOpacity="0.05" stroke={polygonStroke} strokeWidth="1" />
                      <polygon points={`${getX(0.08)} ${getY(20)} ${getX(0.38)} ${getY(5)} ${getX(0.9)} ${getY(20)} ${getX(0.82)} ${getY(40)} ${getX(0.38)} ${getY(10)} ${getX(0.12)} ${getY(40)}`} fill={polygonFill} fillOpacity="0.05" stroke={polygonStroke} strokeWidth="1" />
                    </>
                  )}

                  <text x={getX(0.85)} y={getY(5000)} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="bold" opacity="0.6">
                    Evaporation
                  </text>
                  <text x={getX(0.5)} y={getY(500)} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="bold" opacity="0.6">
                    Rock
                  </text>
                  <text x={getX(0.15)} y={getY(20)} textAnchor="start" fontSize="9" fill="#64748b" fontWeight="bold" opacity="0.6">
                    Precipitation
                  </text>

                  <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke={axisColor} strokeWidth={outerLineWidth} />
                  <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke={axisColor} strokeWidth={outerLineWidth} />

                  {[10, 100, 1000, 10000].map((val) => (
                    <g key={val}>
                      <line x1={margin.left - 5} y1={getY(val)} x2={margin.left} y2={getY(val)} stroke={axisColor} />
                      <text x={margin.left - 10} y={getY(val) + 3} textAnchor="end" fontSize="8" fill="#64748b" fontWeight="bold">
                        {val}
                      </text>
                    </g>
                  ))}

                  {[0, 0.2, 0.4, 0.6, 0.8, 1].map((val) => (
                    <g key={val}>
                      <line x1={getX(val)} y1={height - margin.bottom} x2={getX(val)} y2={height - margin.bottom + 5} stroke={axisColor} />
                      <text x={getX(val)} y={height - margin.bottom + 15} textAnchor="middle" fontSize="8" fill="#64748b" fontWeight="bold">
                        {val}
                      </text>
                    </g>
                  ))}

                  {renderPointList(true)}
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

GibbsPlot.displayName = "GibbsPlot";
export default GibbsPlot;
