import React, { useState, useMemo, useRef, useEffect } from "react";
import { ProcessedSample } from "../utils/usslMath";
import UsslLabelsEditor, { LabelConfig } from "./UsslLabelsEditor";
import LegendBoxEditor, { LegendConfig, DEFAULT_USSL_LEGEND_CONFIG } from "./LegendBoxEditor";
import {
  PointSymbol,
  PointSymbolShape,
  PointSymbolIcon,
} from "./PointSymbol";
import PointSymbolsEditor from "./PointSymbolsEditor";
import {
  DIAGRAM_LINE_TEMPLATES,
  DiagramLineTheme,
  DEFAULT_DIAGRAM_TEMPLATE,
  TitleFormattingConfig,
  DEFAULT_TITLE_CONFIG,
  DiagramPageOrientation,
  PAGE_ORIENTATION_CONFIGS
} from "../types/diagramTemplates";
import { exportDiagram, CropBoxDimensions } from "../utils/diagramExport";
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

interface UsslDiagramProps {
  data: ProcessedSample[];
  pointColors: Record<string, string>;
  pointSizes: Record<string, number>;
  getPointKey: (d: ProcessedSample) => string;
  stateHeader: string;
  is3d?: boolean;
  bubbleSizeMultiplier?: number;
  onBubbleSizeMultiplierChange?: (size: number) => void;
  customTitle?: string;
  showLocationLabels?: boolean;
  showAllPoints?: boolean;
  pointSymbols?: Record<string, PointSymbol>;
  onPointSymbolsChange?: (symbols: Record<string, PointSymbol>) => void;
  defaultSymbol?: PointSymbol;
  onDefaultSymbolChange?: (sym: PointSymbol) => void;
  activeSpatialText?: string;
}

export const UsslDiagram = React.memo(({
  data,
  pointColors,
  pointSizes,
  getPointKey,
  stateHeader,
  is3d = true,
  bubbleSizeMultiplier = 1.3,
  onBubbleSizeMultiplierChange,
  customTitle,
  showLocationLabels = false,
  showAllPoints = true,
  pointSymbols,
  onPointSymbolsChange,
  defaultSymbol = "circle",
  onDefaultSymbolChange,
  activeSpatialText,
}: UsslDiagramProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const margin = { top: 50, right: 30, bottom: 50, left: 60 };
  const width = 500;
  const height = 400;

  // 7 Base Line Color Templates (Monochrome, Cobalt, Indigo, Emerald, Crimson, Bronze, Slate)
  const [currentTheme, setCurrentTheme] = useState<DiagramLineTheme>(DEFAULT_DIAGRAM_TEMPLATE);

  // Formattable Simple Title (Crisp, flat typography without emboss/deboss)
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [titleConfig, setTitleConfig] = useState<TitleFormattingConfig>({
    text: customTitle || "USSL Classification Matrix",
    size: 13.5,
    color: "#0f172a",
    isBold: true,
    isItalic: false,
    fontFamily: "'Inter', system-ui, sans-serif",
    alignment: "center"
  });

  useEffect(() => {
    if (customTitle) {
      setTitleConfig((p) => ({ ...p, text: customTitle }));
    }
  }, [customTitle]);

  // Symbol management states
  const [localPointSymbols, setLocalPointSymbols] = useState<Record<string, PointSymbol>>({});
  const [localDefaultSymbol, setLocalDefaultSymbol] = useState<PointSymbol>(defaultSymbol);
  const [editingSymbols, setEditingSymbols] = useState(false);

  useEffect(() => {
    if (defaultSymbol) setLocalDefaultSymbol(defaultSymbol);
  }, [defaultSymbol]);

  useEffect(() => {
    if (pointSymbols) setLocalPointSymbols(pointSymbols);
  }, [pointSymbols]);

  const [labelsConfig, setLabelsConfig] = useState<Record<string, LabelConfig>>({
    title: { text: customTitle || "USSL Classification Matrix", size: 14, color: "#1e293b", isBold: true, isItalic: false },
    xAxis: { text: "EC (μS/cm)", size: 12, color: "#475569", isBold: true, isItalic: false },
    yAxis: { text: "SAR", size: 12, color: "#475569", isBold: true, isItalic: false },
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

  // Legend Box Config (1, 2, 3, 4 cols, outer boundary color/thickness, no boundary, fonts)
  const [legendConfig, setLegendConfig] = useState<LegendConfig>(DEFAULT_USSL_LEGEND_CONFIG);
  const [editingLegend, setEditingLegend] = useState(false);
  const [diagramPadding, setDiagramPadding] = useState<number>(20);
  const [outerLineWidth, setOuterLineWidth] = useState<number>(1.8);
  const [borderConfig, setBorderConfig] = useState<DiagramBorderConfig>(DEFAULT_PIPER_BORDER_CONFIG);
  const [editingBorder, setEditingBorder] = useState<boolean>(false);
  const [isAdjustingBorder, setIsAdjustingBorder] = useState<boolean>(false); // 10: Normal, 25: Spacious, 50: Wide, 80: Max
  const DEFAULT_LEGEND_POS = { x: 250, y: 48 };
  const [legendPos, setLegendPos] = useState<{ x: number; y: number }>(DEFAULT_LEGEND_POS);
  const [isDraggingLegend, setIsDraggingLegend] = useState(false);

  const handleLegendPointerDown = (e: React.PointerEvent<any>, targetSvg: SVGSVGElement | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (!targetSvg) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startLegendX = legendPos.x;
    const startLegendY = legendPos.y;

    const onPointerMove = (moveEv: PointerEvent) => {
      moveEv.preventDefault();
      const dx = moveEv.clientX - startClientX;
      const dy = moveEv.clientY - startClientY;
      const ctm = targetSvg.getScreenCTM();
      if (!ctm) return;
      const svgDx = dx / ctm.a;
      const svgDy = dy / ctm.d;

      setLegendPos({
        x: Math.round(startLegendX + svgDx),
        y: Math.round(startLegendY + svgDy),
      });
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      setIsDraggingLegend(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    setIsDraggingLegend(true);
  };

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

  // Downsampling logic (allows plotting up to 50,000 points without dropping locations)
  const maxSafePoints = showAllPoints ? 50000 : 25000;
  const isDownsampled = data.length > maxSafePoints;
  const displayData = useMemo(() => {
    if (!isDownsampled) return data;
    const step = Math.ceil(data.length / maxSafePoints);
    return data.filter((_, idx) => idx % step === 0);
  }, [data, isDownsampled, maxSafePoints]);

  const getX = (ec: number) => {
    const logMin = Math.log10(100);
    const logMax = Math.log10(10000);
    const logVal = Math.log10(Math.max(100, Math.min(10000, ec)));
    return margin.left + ((logVal - logMin) / (logMax - logMin)) * (width - margin.left - margin.right);
  };

  const getY = (sar: number) => {
    const maxSar = 32;
    const val = Math.min(maxSar, Math.max(0, sar));
    return height - margin.bottom - (val / maxSar) * (height - margin.bottom - margin.top);
  };

  const ecs = Array.from({ length: 100 }, (_, i) => 100 + i * 100);
  const s1s2 = (ec: number) => 18.8515824 - 4.4257912 * Math.log10(ec);
  const s2s3 = (ec: number) => 31.4031902 - 6.6827811 * Math.log10(ec);
  const s3s4 = (ec: number) => 43.675205 - 8.8394965 * Math.log10(ec);

  const xCentroids = [
    { id: "C1", val: Math.pow(10, (Math.log10(100) + Math.log10(250)) / 2) },
    { id: "C2", val: Math.pow(10, (Math.log10(250) + Math.log10(750)) / 2) },
    { id: "C3", val: Math.pow(10, (Math.log10(750) + Math.log10(2250)) / 2) },
    { id: "C4", val: Math.pow(10, (Math.log10(2250) + Math.log10(10000)) / 2) },
  ];

  const gridLineColor = "rgba(100, 116, 139, 0.15)"; // slate-500 with 15% opacity
  const axisPathColor = "#0891b2"; // slightly darker cyan boundary lines
  const axisColor = "#64748b"; // dark slate for crisp lines

  // Crop states
  const [isCropActive, setIsCropActive] = useState<boolean>(false);
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 40,
    y: 80,
    width: 320,
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
    if ("touches" in e && (e as React.TouchEvent).touches && (e as React.TouchEvent).touches.length > 0) {
      clientX = (e as React.TouchEvent).touches[0].clientX;
      clientY = (e as React.TouchEvent).touches[0].clientY;
    } else {
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

  // A4 Page Orientation (fit | a4_portrait | a4_landscape)
  const [pageOrientation, setPageOrientation] = useState<DiagramPageOrientation>("fit");
  const [showLegendTile, setShowLegendTile] = useState<boolean>(true);

  const handleExport = (format: "jpeg" | "png" | "svg", transparent: boolean, elementId = "ussl-chart-export") => {
    exportDiagram({
      elementId,
      filename: "USSL_Classification_Matrix",
      format,
      transparent,
      scale: 3,
      isCropActive,
      cropBox,
      orientation: pageOrientation,
      svgElement: elementId.includes("fs") ? fullscreenSvgRef.current : svgRef.current
    });
  };

  // Active Legend Items computed strictly from the filtered data samples!
  // This guarantees only states, districts, blocks, and locations present in the active filter are shown.
  const activeLegendItems = useMemo(() => {
    const keysInFilteredData = new Set<string>();
    data.forEach((d) => {
      const k = getPointKey(d);
      if (k && k !== "Unknown" && k.trim() !== "") {
        keysInFilteredData.add(k);
      }
    });

    const keys = keysInFilteredData.size > 0
      ? Array.from(keysInFilteredData).sort()
      : Object.keys(pointColors || {});

    const curSymbols = pointSymbols || localPointSymbols;
    const curDefSym = defaultSymbol || localDefaultSymbol;

    return keys.map((key) => ({
      key,
      label: key, // Full name without any truncation!
      color: pointColors[key] || "#3b82f6",
      symbol: curSymbols[key] || curDefSym,
    }));
  }, [data, getPointKey, pointColors, pointSymbols, localPointSymbols, defaultSymbol, localDefaultSymbol]);

  const renderedPoints = useMemo(() => {
    const curSymbols = pointSymbols || localPointSymbols;
    const curDefSym = defaultSymbol || localDefaultSymbol;

    return displayData.map((d, i) => {
      if (d._calc.ussl === "Unknown" || !d._calc.hasUSSL) return null;
      const key = getPointKey(d);
      const color = pointColors[key] || "#3b82f6";
      const sym = curSymbols[key] || curDefSym;
      const baseMult = pointSizes && pointSizes[key] ? (pointSizes[key] / 1.3) : 1;
      const radius = Math.max(0.1, Math.min(6, Number((localPointSize * baseMult).toFixed(2))));
      const stateStr = stateHeader ? d[stateHeader] : d.State || d.STATE;
      const locNameStr = d._calc?.locName || d.Location || d.LOCATION || d.Site || `Loc #${i + 1}`;
      const bubbleId = `bubble-${String(color).replace(/#/g, "")}`;
      const fillValue = is3d ? `url(#${bubbleId})` : color;
      const strokeVal = is3d ? "rgba(255,255,255,0.4)" : darkenColor(color, 25);
      const strokeW = is3d ? 0.2 : 0.35;
      const cx = getX(d._calc.ecVal || 0);
      const cy = getY(d._calc.sar);

      return (
        <g key={i} className="cursor-pointer">
          <PointSymbolShape
            cx={cx}
            cy={cy}
            r={radius}
            symbol={sym}
            fill={fillValue}
            stroke={strokeVal}
            strokeWidth={strokeW}
            opacity={0.92}
            is3d={is3d}
            className="transition-all duration-300 hover:opacity-100 cursor-pointer"
            title={`${locNameStr}\nEC: ${d._calc.ecVal}\nSAR: ${d._calc.sar.toFixed(2)}` + (stateStr ? `\nState: ${stateStr}` : "")}
          />
          {showLocationLabels && (
            <text
              x={cx + radius + 1.2}
              y={cy + 1.2}
              fontSize={4.2}
              fontWeight="600"
              fill="#1e293b"
              pointerEvents="none"
              opacity={0.85}
            >
              {locNameStr}
            </text>
          )}
        </g>
      );
    });
  }, [displayData, pointColors, pointSizes, getPointKey, stateHeader, is3d, localPointSize, showLocationLabels, pointSymbols, localPointSymbols, defaultSymbol, localDefaultSymbol]);

  // Render In-Chart Legend Box (1, 2, 3, 4 columns, outer boundary color/thickness, no boundary, fonts, and full names without truncation)
  const renderInChartLegend = (targetSvg: SVGSVGElement | null) => {
    if (!legendConfig.show || legendConfig.style !== "in-chart" || activeLegendItems.length === 0) return null;
    const cols = legendConfig.columns || 1;
    
    // Dynamic column width calculation to display FULL names without truncation
    const maxTextLen = Math.max(...activeLegendItems.map((it) => it.label.length), 6);
    const charWidth = legendConfig.fontSize * 0.58;
    const symbolSpace = Math.max(7, legendConfig.fontSize * 1.5) + 3;
    const neededColWidth = Math.ceil(maxTextLen * charWidth + symbolSpace + 5);
    const minColWidth = cols === 1 ? 84 : cols === 2 ? 62 : cols === 3 ? 50 : 42;
    const colWidth = Math.max(minColWidth, neededColWidth);
    const itemHeight = Math.max(8.5, legendConfig.fontSize * 1.6);
    const numRows = Math.ceil(activeLegendItems.length / cols);
    const padX = 6;
    const padY = 5;
    const boxWidth = padX * 2 + cols * colWidth;
    const boxHeight = padY * 2 + numRows * itemHeight;

    return (
      <g
        transform={`translate(${legendPos.x}, ${legendPos.y})`}
        style={{
          cursor: isDraggingLegend ? "grabbing" : "grab",
          userSelect: "none",
        }}
        onPointerDown={(e) => handleLegendPointerDown(e, targetSvg)}
      >
        <rect
          x={0}
          y={0}
          width={boxWidth}
          height={boxHeight}
          fill={legendConfig.backgroundColor}
          fillOpacity={legendConfig.backgroundOpacity}
          stroke={legendConfig.showBorder ? legendConfig.borderColor : "none"}
          strokeWidth={legendConfig.showBorder ? legendConfig.borderThickness : 0}
          strokeDasharray={
            legendConfig.showBorder && legendConfig.borderStyle === "dashed"
              ? "3 1.5"
              : legendConfig.showBorder && legendConfig.borderStyle === "dotted"
              ? "1 1"
              : undefined
          }
          rx={legendConfig.borderRadius}
        />
        {activeLegendItems.map((it, idx) => {
          const colIdx = idx % cols;
          const rowIdx = Math.floor(idx / cols);
          const itemX = padX + colIdx * colWidth;
          const itemY = padY + rowIdx * itemHeight + itemHeight * 0.65;
          const displayLabel = it.label; // Full name, no dots!
          const bubbleId = `bubble-${String(it.color).replace(/#/g, "")}`;
          const fillVal = is3d ? `url(#${bubbleId})` : it.color;

          return (
            <g key={it.key}>
              <PointSymbolShape
                cx={itemX + 3.5}
                cy={itemY - itemHeight * 0.28}
                r={Math.max(1.8, legendConfig.fontSize * 0.42)}
                symbol={it.symbol}
                fill={fillVal}
                stroke={is3d ? "rgba(255,255,255,0.7)" : "#ffffff"}
                strokeWidth={0.4}
                is3d={is3d}
              />
              <text
                x={itemX + symbolSpace}
                y={itemY}
                fontSize={legendConfig.fontSize}
                fontWeight={legendConfig.isBold ? "bold" : "normal"}
                fontStyle={legendConfig.isItalic ? "italic" : "normal"}
                fontFamily={legendConfig.fontFamily}
                fill={legendConfig.textColor}
              >
                {displayLabel}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div className="bg-transparent p-6 flex flex-col items-center w-full transition-colors duration-300 relative group">
      {/* Legend & Display Toolbar Bar */}
      <div className="w-full max-w-[720px] mb-3 relative z-30">
        <DiagramToolbarStudio
          currentTheme={currentTheme}
          onThemeChange={setCurrentTheme}
          onExport={handleExport}
          isCropActive={isCropActive}
          onToggleCrop={() => setIsCropActive(!isCropActive)}
          titleConfig={titleConfig}
          onOpenTitleEditor={() => setIsTitleModalOpen(true)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(true)}
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
          {/* Format Legend Studio */}
          <button
            onClick={() => setEditingLegend(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-black flex items-center gap-1 shadow-2xs transition-all"
            title="Format Legend Box (Border, Fonts, Columns)"
          >
            <span>Legend Box</span>
          </button>

          {/* Toggle Legend Position */}
          <button
            onClick={() =>
              setLegendConfig((prev) => ({
                ...prev,
                style: prev.style === "in-chart" ? "bottom" : prev.style === "bottom" ? "none" : "in-chart",
                show: prev.style === "none" ? true : prev.show,
              }))
            }
            className="bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold shadow-2xs"
          >
            {legendConfig.style === "in-chart" ? "In-Chart" : legendConfig.style === "bottom" ? "Bottom" : "Legend Off"}
          </button>

          {/* Point Symbols Button */}
          <button
            onClick={() => setEditingSymbols(true)}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all shadow-2xs"
            title="Point Symbols & Shapes Formatting"
          >
            <PointSymbolIcon
              symbol={defaultSymbol || localDefaultSymbol}
              color="#4f46e5"
              size={12}
              stroke="#ffffff"
            />
            <span>Symbols</span>
          </button>

          {/* Diagram Area Margin */}
          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-2xs" title="Adjust Chart Margin Space">
            <span className="text-[9px] font-black uppercase text-slate-400">Pad:</span>
            {[
              { label: "Normal", pad: 15 },
              { label: "Spacious", pad: 30 },
              { label: "Wide", pad: 55 }
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

      <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3 py-1 rounded-xl border border-emerald-200 text-[10px] font-extrabold mb-1">
        <i className="ph ph-hand-grabbing text-sm"></i>
        <span>Mouse Drag Active: Click & drag Title or Legend box anywhere on the USSL diagram</span>
      </div>

      {/* Legend Box Formatting Studio Modal */}
      {editingLegend && (
        <LegendBoxEditor
          config={legendConfig}
          onChange={setLegendConfig}
          onClose={() => setEditingLegend(false)}
          sampleItems={activeLegendItems.map((it) => ({
            label: it.label,
            color: it.color,
            symbol: it.symbol,
          }))}
          title="USSL Legend Box Formatting Studio"
        />
      )}

      {/* Point Symbols Studio Modal */}
      {editingSymbols && (
        <PointSymbolsEditor
          items={activeLegendItems.map((it) => ({
            key: it.key,
            label: it.label,
            color: it.color,
          }))}
          pointSymbols={pointSymbols || localPointSymbols}
          onChangeSymbols={(syms) => {
            setLocalPointSymbols(syms);
            if (onPointSymbolsChange) onPointSymbolsChange(syms);
          }}
          defaultSymbol={defaultSymbol || localDefaultSymbol}
          onChangeDefaultSymbol={(sym) => {
            setLocalDefaultSymbol(sym);
            if (onDefaultSymbolChange) onDefaultSymbolChange(sym);
          }}
          onClose={() => setEditingSymbols(false)}
          title="USSL Point Symbol & Marker Studio"
          subtitle="Configure distinct shapes for locations, districts, or categories for the selected filter"
        />
      )}

      {editingKey && labelsConfig[editingKey] && (
        <UsslLabelsEditor
          config={labelsConfig[editingKey]}
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
          title="USSL Diagram Border Frame Studio"
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

      {/* Tile 2: Main Chart Tile (Pure white background, clean publication frame) */}
      <div
        id="ussl-chart-export"
        className={`flex flex-col items-center justify-center p-3 sm:p-5 w-full bg-white rounded-3xl relative z-10 border border-slate-200/80 shadow-xs transition-all ${PAGE_ORIENTATION_CONFIGS[pageOrientation].className}`}
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
          className="w-full h-auto max-w-full overflow-visible"
          style={{ fontFamily: "'Inter', sans-serif", touchAction: "none" }}
          onClick={() => {
            if (!isDraggingTitle) setEditingKey(null);
          }}
        >
          {/* Pure White Background */}
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
            idPrefix="ussl"
          />
          <defs>
            {is3d && (
              <>
                {Array.from(new Set([...Object.values(pointColors || {}), ...activeLegendItems.map((it) => it.color), "#2563eb", "#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"]))
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

          {/* Pure White Background for the plot area */}
          <rect
            className="diagram-bg-rect"
            data-bg="true"
            x={margin.left}
            y={margin.top}
            width={width - margin.left - margin.right}
            height={height - margin.top - margin.bottom}
            rx="8"
            fill="#ffffff"
            stroke={currentTheme.primaryLine}
            strokeWidth={outerLineWidth}
          />

          {/* Simple, Crisp, Formattable Title (NO emboss / NO deboss) */}
          <text
            x={titlePos.x}
            y={titlePos.y}
            textAnchor={titleConfig.alignment === "left" ? "start" : titleConfig.alignment === "right" ? "end" : "middle"}
            fontSize={titleConfig.size}
            fill={titleConfig.color}
            fontWeight={titleConfig.isBold ? 900 : 500}
            fontStyle={titleConfig.isItalic ? "italic" : "normal"}
            fontFamily={titleConfig.fontFamily}
            style={{
              cursor: isDraggingTitle ? "grabbing" : "grab",
              letterSpacing: "0.03em",
              userSelect: "none",
              touchAction: "none"
            }}
            onPointerDown={(e) => handleTitlePointerDown(e, svgRef.current)}
            onClick={(e) => {
              if (!isDraggingTitle) {
                e.stopPropagation();
                setIsTitleModalOpen(true);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsTitleModalOpen(true);
            }}
          >
            {(titleConfig.text || "USSL Classification Matrix").split("\n").map((line, idx) => (
              <tspan key={idx} x={titlePos.x} dy={idx === 0 ? 0 : titleConfig.size * 1.3}>
                {line}
              </tspan>
            ))}
          </text>

          <text
            transform={`translate(20, ${height / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={labelsConfig.yAxis.size}
            fill={currentTheme.axisColor}
            fontWeight={labelsConfig.yAxis.isBold ? "900" : "400"}
            fontStyle={labelsConfig.yAxis.isItalic ? "italic" : "normal"}
            fontFamily={labelsConfig.yAxis.fontFamily || "sans-serif"}
            style={{ cursor: "pointer", letterSpacing: "0.1em" }}
            onClick={(e) => {
              e.stopPropagation();
              setEditingKey("yAxis");
            }}
            onContextMenu={(e) => {
              e.preventDefault();
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
            fill={currentTheme.axisColor}
            fontWeight={labelsConfig.xAxis.isBold ? "900" : "400"}
            fontStyle={labelsConfig.xAxis.isItalic ? "italic" : "normal"}
            fontFamily={labelsConfig.xAxis.fontFamily || "sans-serif"}
            style={{ cursor: "pointer", letterSpacing: "0.1em" }}
            onClick={(e) => {
              e.stopPropagation();
              setEditingKey("xAxis");
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditingKey("xAxis");
            }}
          >
            {labelsConfig.xAxis.text}
          </text>

          {/* Vertical Division Lines for C1, C2, C3, C4 */}
          <line x1={getX(250)} y1={margin.top} x2={getX(250)} y2={height - margin.bottom} stroke={currentTheme.secondaryLine} strokeWidth="1.2" strokeDasharray={currentTheme.gridDash} />
          <line x1={getX(750)} y1={margin.top} x2={getX(750)} y2={height - margin.bottom} stroke={currentTheme.secondaryLine} strokeWidth="1.2" strokeDasharray={currentTheme.gridDash} />
          <line x1={getX(2250)} y1={margin.top} x2={getX(2250)} y2={height - margin.bottom} stroke={currentTheme.secondaryLine} strokeWidth="1.2" strokeDasharray={currentTheme.gridDash} />

          {/* S1, S2, S3 Division Curves */}
          <path d={ecs.map((ec, i) => `${i === 0 ? "M" : "L"} ${getX(ec)} ${getY(s1s2(ec))}`).join(" ")} fill="none" stroke={currentTheme.primaryLine} strokeWidth={Math.max(1.2, +(outerLineWidth * 1.1).toFixed(2))} />
          <path d={ecs.map((ec, i) => `${i === 0 ? "M" : "L"} ${getX(ec)} ${getY(s2s3(ec))}`).join(" ")} fill="none" stroke={currentTheme.primaryLine} strokeWidth={Math.max(1.2, +(outerLineWidth * 1.1).toFixed(2))} />
          <path d={ecs.map((ec, i) => `${i === 0 ? "M" : "L"} ${getX(ec)} ${getY(s3s4(ec))}`).join(" ")} fill="none" stroke={currentTheme.primaryLine} strokeWidth={Math.max(1.2, +(outerLineWidth * 1.1).toFixed(2))} />

          {/* Zone Centroid Text */}
          {xCentroids.map((xC) => (
            <g key={xC.id} opacity="0.95">
              <text x={getX(xC.val)} y={getY(s1s2(xC.val) / 2)} textAnchor="middle" fontSize="8.5" fill={currentTheme.zoneTextColor} fontWeight="bold">
                {xC.id}-S1
              </text>
              <text x={getX(xC.val)} y={getY((s1s2(xC.val) + s2s3(xC.val)) / 2)} textAnchor="middle" fontSize="8.5" fill={currentTheme.zoneTextColor} fontWeight="bold">
                {xC.id}-S2
              </text>
              <text x={getX(xC.val)} y={getY((s2s3(xC.val) + s3s4(xC.val)) / 2)} textAnchor="middle" fontSize="8.5" fill={currentTheme.zoneTextColor} fontWeight="bold">
                {xC.id}-S3
              </text>
              <text x={getX(xC.val)} y={getY((s3s4(xC.val) + 32) / 2)} textAnchor="middle" fontSize="8.5" fill={currentTheme.primaryLine} fontWeight="900">
                {xC.id}-S4
              </text>
            </g>
          ))}

          {/* Plot Axes */}
          <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke={currentTheme.primaryLine} strokeWidth={outerLineWidth} />
          <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke={currentTheme.primaryLine} strokeWidth={outerLineWidth} />

          {[100, 250, 750, 2250, 5000, 10000].map((v) => (
            <g key={v}>
              <line x1={getX(v)} y1={height - margin.bottom} x2={getX(v)} y2={height - margin.bottom + 5} stroke={currentTheme.primaryLine} />
              <text x={getX(v)} y={height - margin.bottom + 15} textAnchor="middle" fontSize="8" fill={currentTheme.axisColor} fontWeight="bold">
                {v}
              </text>
            </g>
          ))}
          {[0, 10, 20, 30].map((v) => (
            <g key={v}>
              <line x1={margin.left - 5} y1={getY(v)} x2={margin.left} y2={getY(v)} stroke={currentTheme.primaryLine} />
              <text x={margin.left - 10} y={getY(v) + 3} textAnchor="end" fontSize="8" fill={currentTheme.axisColor} fontWeight="bold">
                {v}
              </text>
            </g>
          ))}

          {renderedPoints}
          {renderInChartLegend(svgRef.current)}
        </svg>
        </div>
      </div>

      {/* Simple Title Editor Modal */}
      <SimpleTitleEditorModal
        isOpen={isTitleModalOpen}
        onClose={() => setIsTitleModalOpen(false)}
        config={titleConfig}
        onChange={setTitleConfig}
        diagramName="USSL Diagram"
      />

      {/* Tile 3: Dedicated Publication Legend Tile (if legend is selected) */}
      {showLegendTile && activeLegendItems.length > 0 && (
        <div
          className="w-full max-w-[720px] mt-3.5 bg-white border border-slate-200/80 shadow-xs rounded-2xl p-4 transition-all"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                USSL Active Variables Legend
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {activeLegendItems.length} {activeLegendItems.length === 1 ? "variable" : "variables"}
            </span>
          </div>
          <div
            className="grid gap-x-3 gap-y-2"
            style={{
              gridTemplateColumns: `repeat(${legendConfig.columns || (activeLegendItems.length > 6 ? 3 : 2)}, minmax(0, 1fr))`,
            }}
          >
            {activeLegendItems.map((it) => (
              <div key={it.key} className="flex items-center gap-2 min-w-0 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/70 shadow-2xs hover:bg-slate-100 transition-all">
                <PointSymbolIcon
                  symbol={it.symbol}
                  color={it.color}
                  size={13}
                  stroke="#ffffff"
                  is3d={is3d}
                />
                <span
                  style={{
                    fontFamily: legendConfig.fontFamily,
                    color: legendConfig.textColor,
                    fontWeight: legendConfig.isBold ? 700 : 500,
                    fontStyle: legendConfig.isItalic ? "italic" : "normal",
                    fontSize: "11px",
                  }}
                  className="truncate"
                  title={it.label}
                >
                  {it.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Screen Modal View */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 md:p-8">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-4xl max-h-[92vh] flex flex-col relative border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-150 pb-4 mb-4">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <i className="ph ph-corners-out text-lg text-indigo-600 animate-pulse"></i>
                  USSL Classification Matrix (Full Screen)
                </h3>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase mt-0.5">
                  Full interactive explorer mode with high-resolution scaling
                </p>
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
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleExport("jpeg", false, "ussl-chart-export-fs")}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs"
                    title="Download with Pure White Background"
                  >
                    JPEG (White Bg)
                  </button>
                  <button
                    onClick={() => handleExport("png", true, "ussl-chart-export-fs")}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs"
                    title="Download without Background (Transparent)"
                  >
                    PNG (Transparent)
                  </button>
                  <button
                    onClick={() => handleExport("svg", false, "ussl-chart-export-fs")}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs"
                    title="Download Vector SVG"
                  >
                    SVG
                  </button>
                </div>
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="bg-slate-100 text-slate-600 hover:bg-rose-600 hover:text-white p-2 rounded-xl text-xs font-bold transition-all border border-slate-200"
                  title="Close Full Screen"
                >
                  <i className="ph ph-x text-lg font-bold"></i>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-[400px]">
              <div id="ussl-chart-export-fs" className="flex flex-col items-center justify-center p-6 w-full max-w-[650px] bg-white rounded-2xl relative">
                <svg
                  ref={fullscreenSvgRef}
                  viewBox={`0 0 ${width} ${height}`}
                  className="w-full h-auto max-h-[60vh] overflow-visible"
                  style={{ fontFamily: "'Inter', sans-serif", touchAction: "none" }}
                  onClick={() => {
                    if (!isDraggingTitle) setEditingKey(null);
                  }}
                >
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

                  {/* Pure White background for the plot area */}
                  <rect
                    className="diagram-bg-rect"
                    data-bg="true"
                    x={margin.left}
                    y={margin.top}
                    width={width - margin.left - margin.right}
                    height={height - margin.top - margin.bottom}
                    rx="8"
                    fill="#ffffff"
                    stroke={currentTheme.primaryLine}
                    strokeWidth={outerLineWidth}
                  />

                  {/* Simple Flat Title (NO emboss / NO deboss) */}
                  <text
                    x={titlePos.x}
                    y={titlePos.y}
                    textAnchor={titleConfig.alignment === "left" ? "start" : titleConfig.alignment === "right" ? "end" : "middle"}
                    fontSize={titleConfig.size}
                    fill={titleConfig.color}
                    fontWeight={titleConfig.isBold ? 900 : 500}
                    fontStyle={titleConfig.isItalic ? "italic" : "normal"}
                    fontFamily={titleConfig.fontFamily}
                    style={{
                      cursor: isDraggingTitle ? "grabbing" : "grab",
                      letterSpacing: "0.03em",
                      userSelect: "none",
                      touchAction: "none"
                    }}
                    onPointerDown={(e) => handleTitlePointerDown(e, fullscreenSvgRef.current)}
                  >
                    {(titleConfig.text || "USSL Classification Matrix").split("\n").map((line, idx) => (
                      <tspan key={idx} x={titlePos.x} dy={idx === 0 ? 0 : titleConfig.size * 1.3}>
                        {line}
                      </tspan>
                    ))}
                  </text>

                  <text
                    x={width / 2}
                    y={height - margin.bottom + 35}
                    textAnchor="middle"
                    fontSize={labelsConfig.xAxis.size}
                    fill={currentTheme.axisColor}
                    fontWeight={labelsConfig.xAxis.isBold ? "900" : "400"}
                    fontStyle={labelsConfig.xAxis.isItalic ? "italic" : "normal"}
                    fontFamily={labelsConfig.xAxis.fontFamily || "sans-serif"}
                  >
                    {labelsConfig.xAxis.text}
                  </text>

                  {/* Grid Lines */}
                  <line x1={getX(250)} y1={margin.top} x2={getX(250)} y2={height - margin.bottom} stroke={currentTheme.secondaryLine} strokeWidth="1.2" strokeDasharray={currentTheme.gridDash} />
                  <line x1={getX(750)} y1={margin.top} x2={getX(750)} y2={height - margin.bottom} stroke={currentTheme.secondaryLine} strokeWidth="1.2" strokeDasharray={currentTheme.gridDash} />
                  <line x1={getX(2250)} y1={margin.top} x2={getX(2250)} y2={height - margin.bottom} stroke={currentTheme.secondaryLine} strokeWidth="1.2" strokeDasharray={currentTheme.gridDash} />

                  {/* S1, S2, S3 Curves */}
                  <path d={ecs.map((ec, i) => `${i === 0 ? "M" : "L"} ${getX(ec)} ${getY(s1s2(ec))}`).join(" ")} fill="none" stroke={currentTheme.primaryLine} strokeWidth={Math.max(1.2, +(outerLineWidth * 1.1).toFixed(2))} />
                  <path d={ecs.map((ec, i) => `${i === 0 ? "M" : "L"} ${getX(ec)} ${getY(s2s3(ec))}`).join(" ")} fill="none" stroke={currentTheme.primaryLine} strokeWidth={Math.max(1.2, +(outerLineWidth * 1.1).toFixed(2))} />
                  <path d={ecs.map((ec, i) => `${i === 0 ? "M" : "L"} ${getX(ec)} ${getY(s3s4(ec))}`).join(" ")} fill="none" stroke={currentTheme.primaryLine} strokeWidth={Math.max(1.2, +(outerLineWidth * 1.1).toFixed(2))} />

                  {xCentroids.map((xC) => (
                    <g key={xC.id} opacity="0.95">
                      <text x={getX(xC.val)} y={getY(s1s2(xC.val) / 2)} textAnchor="middle" fontSize="8.5" fill={currentTheme.zoneTextColor} fontWeight="bold">
                        {xC.id}-S1
                      </text>
                      <text x={getX(xC.val)} y={getY((s1s2(xC.val) + s2s3(xC.val)) / 2)} textAnchor="middle" fontSize="8.5" fill={currentTheme.zoneTextColor} fontWeight="bold">
                        {xC.id}-S2
                      </text>
                      <text x={getX(xC.val)} y={getY((s2s3(xC.val) + s3s4(xC.val)) / 2)} textAnchor="middle" fontSize="8.5" fill={currentTheme.zoneTextColor} fontWeight="bold">
                        {xC.id}-S3
                      </text>
                      <text x={getX(xC.val)} y={getY((s3s4(xC.val) + 32) / 2)} textAnchor="middle" fontSize="8.5" fill={currentTheme.primaryLine} fontWeight="900">
                        {xC.id}-S4
                      </text>
                    </g>
                  ))}

                  <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke={currentTheme.primaryLine} strokeWidth={outerLineWidth} />
                  <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke={currentTheme.primaryLine} strokeWidth={outerLineWidth} />

                  {[100, 250, 750, 2250, 5000, 10000].map((v) => (
                    <g key={v}>
                      <line x1={getX(v)} y1={height - margin.bottom} x2={getX(v)} y2={height - margin.bottom + 5} stroke={currentTheme.primaryLine} />
                      <text x={getX(v)} y={height - margin.bottom + 15} textAnchor="middle" fontSize="8" fill={currentTheme.axisColor} fontWeight="bold">
                        {v}
                      </text>
                    </g>
                  ))}
                  {[0, 10, 20, 30].map((v) => (
                    <g key={v}>
                      <line x1={margin.left - 5} y1={getY(v)} x2={margin.left} y2={getY(v)} stroke={currentTheme.primaryLine} />
                      <text x={margin.left - 10} y={getY(v) + 3} textAnchor="end" fontSize="8" fill={currentTheme.axisColor} fontWeight="bold">
                        {v}
                      </text>
                    </g>
                  ))}

                  {renderedPoints.map((p: any) => {
                    if (is3d && p?.props?.fill && p.props.fill.startsWith("url(#bubble-")) {
                      const cleanCol = p.props.fill.replace("url(#bubble-", "").replace(")", "");
                      return React.cloneElement(p, { fill: `url(#bubble-fs-${cleanCol})` });
                    }
                    return p;
                  })}
                  {renderInChartLegend(fullscreenSvgRef.current)}
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

UsslDiagram.displayName = "UsslDiagram";
export default UsslDiagram;
