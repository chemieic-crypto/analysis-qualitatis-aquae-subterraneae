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

interface ChadhaDiagramProps {
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

export const ChadhaDiagram = React.memo(({
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
}: ChadhaDiagramProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [localPointSize, setLocalPointSize] = useState<number>(bubbleSizeMultiplier ?? 1.3);

  // Symbol management states
  const [localPointSymbols, setLocalPointSymbols] = useState<Record<string, PointSymbol>>({});
  const [localDefaultSymbol, setLocalDefaultSymbol] = useState<PointSymbol>(defaultSymbol);
  const [editingSymbols, setEditingSymbols] = useState(false);
  const [diagramPadding, setDiagramPadding] = useState<number>(25);
  const [outerLineWidth, setOuterLineWidth] = useState<number>(1.8);
  const [borderConfig, setBorderConfig] = useState<DiagramBorderConfig>(DEFAULT_PIPER_BORDER_CONFIG);
  const [editingBorder, setEditingBorder] = useState<boolean>(false);
  const [isAdjustingBorder, setIsAdjustingBorder] = useState<boolean>(false);

  // A4 Page Orientation (fit | a4_portrait | a4_landscape)
  const [pageOrientation, setPageOrientation] = useState<DiagramPageOrientation>("fit");
  const [showLegendTile, setShowLegendTile] = useState<boolean>(true);

  // 7 Base Line Color Templates (Monochrome, Cobalt, Indigo, Emerald, Crimson, Bronze, Slate)
  const [currentTheme, setCurrentTheme] = useState<DiagramLineTheme>(DEFAULT_DIAGRAM_TEMPLATE);

  // Formattable Simple Title (Crisp, flat typography without emboss/deboss)
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [simpleTitleConfig, setSimpleTitleConfig] = useState<TitleFormattingConfig>({
    text: customTitle || "Chadha's Diagram for Water Quality Classification",
    size: 10,
    color: "#0f172a",
    isBold: true,
    isItalic: false,
    fontFamily: "'Inter', system-ui, sans-serif",
    alignment: "center",
  });

  const DEFAULT_TITLE_POS = { x: 185, y: 18 };
  const [titlePos, setTitlePos] = useState<{ x: number; y: number }>(DEFAULT_TITLE_POS);
  const [isDraggingTitle, setIsDraggingTitle] = useState(false);
  const dragTitleOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (customTitle) {
      setSimpleTitleConfig((p) => ({ ...p, text: customTitle }));
    }
  }, [customTitle]);

  // Legend Box Config
  const [legendConfig, setLegendConfig] = useState<LegendConfig>({
    ...DEFAULT_USSL_LEGEND_CONFIG,
    columns: 1,
    fontSize: 5.2,
    borderColor: "#475569",
    borderThickness: 1.2,
    backgroundColor: "#ffffff",
    backgroundOpacity: 0.96,
  });
  const [editingLegend, setEditingLegend] = useState(false);
  const [legendPos, setLegendPos] = useState({ x: 335, y: 105 });
  const [isDraggingLegend, setIsDraggingLegend] = useState(false);
  const dragLegendOffset = useRef({ x: 0, y: 0 });

  // Axis Labels Configuration & Right-Click/Click Formatting
  const [labelsConfig, setLabelsConfig] = useState<Record<string, LabelConfig>>({
    xAxis: { text: "(Ca²⁺+Mg²⁺)-(Na⁺+K⁺) % meq/L", size: 6.8, color: "#475569", isBold: true, isItalic: false },
    yAxis: { text: "(HCO₃¹⁻)-(Cl¹⁻+SO₄²⁻) % meq/L", size: 6.8, color: "#475569", isBold: true, isItalic: false },
  });
  const [editingAxisKey, setEditingAxisKey] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const fullscreenSvgRef = useRef<SVGSVGElement | null>(null);

  const handleTitlePointerDown = (e: React.PointerEvent, targetSvg: SVGSVGElement | null) => {
    e.stopPropagation();
    if (!targetSvg) return;
    const pt = targetSvg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = targetSvg.getScreenCTM();
    if (!ctm) return;
    const cursorSvg = pt.matrixTransform(ctm.inverse());
    dragTitleOffset.current = {
      x: cursorSvg.x - titlePos.x,
      y: cursorSvg.y - titlePos.y,
    };
    setIsDraggingTitle(true);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handleLegendPointerDown = (e: React.PointerEvent, targetSvg: SVGSVGElement | null) => {
    e.stopPropagation();
    if (!targetSvg) return;
    const pt = targetSvg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = targetSvg.getScreenCTM();
    if (!ctm) return;
    const cursorSvg = pt.matrixTransform(ctm.inverse());
    dragLegendOffset.current = {
      x: cursorSvg.x - legendPos.x,
      y: cursorSvg.y - legendPos.y,
    };
    setIsDraggingLegend(true);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingTitle && svgRef.current) {
      const pt = svgRef.current.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svgRef.current.getScreenCTM();
      if (ctm) {
        const cursorSvg = pt.matrixTransform(ctm.inverse());
        setTitlePos({
          x: Math.round(cursorSvg.x - dragTitleOffset.current.x),
          y: Math.round(cursorSvg.y - dragTitleOffset.current.y),
        });
      }
      return;
    }

    if (!isDraggingLegend || !svgRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const cursorSvg = pt.matrixTransform(ctm.inverse());
    setLegendPos({
      x: Math.round(cursorSvg.x - dragLegendOffset.current.x),
      y: Math.round(cursorSvg.y - dragLegendOffset.current.y),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingTitle) {
      setIsDraggingTitle(false);
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {}
    }
    if (isDraggingLegend) {
      setIsDraggingLegend(false);
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Dimensions of the main chart plot area in SVG coordinates:
  // Chart box: X from 60 to 320 (width 260), Y from 35 to 295 (height 260)
  // Center is at X = 190, Y = 165
  const boxLeft = 60;
  const boxTop = 35;
  const boxSize = 250;
  const boxRight = boxLeft + boxSize; // 310
  const boxBottom = boxTop + boxSize; // 285
  const centerX = boxLeft + boxSize / 2; // 185
  const centerY = boxTop + boxSize / 2; // 160

  // Coordinate transforms:
  // Math: X from -100 to +100 -> boxLeft to boxRight
  // Math: Y from -100 to +100 -> boxBottom to boxTop (SVG Y increases downwards)
  const mapX = (val: number) => {
    const clamped = Math.max(-100, Math.min(100, val));
    return centerX + (clamped / 100) * (boxSize / 2);
  };

  const mapY = (val: number) => {
    const clamped = Math.max(-100, Math.min(100, val));
    return centerY - (clamped / 100) * (boxSize / 2);
  };

  // Plottable data: samples having valid meq values
  const plottableData = useMemo(() => {
    return data.filter((d) => {
      const c = (d._calc?.meqPerc?.Ca ?? 0) + (d._calc?.meqPerc?.Mg ?? 0) + (d._calc?.meqPerc?.Na ?? 0) + (d._calc?.meqPerc?.K ?? 0);
      const a = (d._calc?.meqPerc?.Cl ?? 0) + (d._calc?.meqPerc?.SO4 ?? 0) + (d._calc?.meqPerc?.HCO3 ?? 0) + (d._calc?.meqPerc?.CO3 ?? 0);
      return c > 0 && a > 0;
    });
  }, [data]);

  // Field distribution counts
  const fieldStats = useMemo(() => {
    const counts = { f5: 0, f6: 0, f7: 0, f8: 0, total: 0 };
    plottableData.forEach((d) => {
      const x = (d._calc?.meqPerc?.Ca ?? 0) + (d._calc?.meqPerc?.Mg ?? 0) - ((d._calc?.meqPerc?.Na ?? 0) + (d._calc?.meqPerc?.K ?? 0));
      const y = (d._calc?.meqPerc?.HCO3 ?? 0) + (d._calc?.meqPerc?.CO3 ?? 0) - ((d._calc?.meqPerc?.Cl ?? 0) + (d._calc?.meqPerc?.SO4 ?? 0));
      counts.total++;
      if (x >= 0 && y >= 0) counts.f5++;
      else if (x < 0 && y >= 0) counts.f8++;
      else if (x < 0 && y < 0) counts.f7++;
      else counts.f6++;
    });
    return counts;
  }, [plottableData]);

  // Active legend items strictly from filtered data
  const activeLegendItems = useMemo(() => {
    const keysInFilteredData = new Set<string>();
    plottableData.forEach((d) => {
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
      label: key,
      color: pointColors[key] || "#2563eb",
      symbol: curSymbols[key] || curDefSym,
    }));
  }, [plottableData, getPointKey, pointColors, pointSymbols, localPointSymbols, defaultSymbol, localDefaultSymbol]);

  // Render Data Points with 3D Glossy Sphere and PointSymbolShape
  const renderedPoints = useMemo(() => {
    const curSymbols = pointSymbols || localPointSymbols;
    const curDefSym = defaultSymbol || localDefaultSymbol;

    return plottableData.map((d, i) => {
      const cTotal = (d._calc?.meqPerc?.Ca ?? 0) + (d._calc?.meqPerc?.Mg ?? 0);
      const aTotal = (d._calc?.meqPerc?.Na ?? 0) + (d._calc?.meqPerc?.K ?? 0);
      const wTotal = (d._calc?.meqPerc?.HCO3 ?? 0) + (d._calc?.meqPerc?.CO3 ?? 0);
      const sTotal = (d._calc?.meqPerc?.Cl ?? 0) + (d._calc?.meqPerc?.SO4 ?? 0);

      const xVal = cTotal - aTotal;
      const yVal = wTotal - sTotal;

      const px = mapX(xVal);
      const py = mapY(yVal);

      const key = getPointKey(d);
      const color = pointColors[key] || "#2563eb";
      const sym = curSymbols[key] || curDefSym;

      const baseMult = pointSizes && pointSizes[key] ? (pointSizes[key] / 1.3) : 1;
      const radius = Math.max(1.8, Math.min(8, Number((localPointSize * 3.6 * baseMult).toFixed(2))));

      const stateStr = stateHeader ? d[stateHeader] : d.State || d.STATE;
      const locNameStr = d._calc?.locName || d.Location || d.LOCATION || d.Site || `Loc #${i + 1}`;
      const fieldDesc =
        xVal >= 0 && yVal >= 0
          ? "Field 5: Weathering and Recharge (Ca-Mg-HCO3)"
          : xVal < 0 && yVal >= 0
          ? "Field 8: Base Ion Exchange (NaHCO3)"
          : xVal < 0 && yVal < 0
          ? "Field 7: Saline Water/Evaporation (NaCl)"
          : "Field 6: Reverse Ion Exchange (Ca-Mg-Cl-SO4)";

      const tip = `${locNameStr}\n${fieldDesc}\n(Ca+Mg)-(Na+K): ${xVal.toFixed(1)}%\n(HCO3)-(Cl+SO4): ${yVal.toFixed(1)}%` + (stateStr ? `\nState: ${stateStr}` : "");

      const bubbleId = `chadha-bubble-${String(color).replace(/#/g, "")}`;
      const fillValue = is3d ? `url(#${bubbleId})` : color;
      const strokeVal = is3d ? "rgba(255,255,255,0.7)" : darkenColor(color, 25);
      const strokeW = is3d ? 0.35 : 0.45;

      return (
        <g key={i} className="cursor-pointer">
          <PointSymbolShape
            cx={px}
            cy={py}
            r={radius}
            symbol={sym}
            fill={fillValue}
            stroke={strokeVal}
            strokeWidth={strokeW}
            opacity={0.92}
            is3d={is3d}
            title={tip}
          />
          {showLocationLabels && (
            <text
              x={px + radius + 1.5}
              y={py + 1.2}
              fontSize={4.2}
              fontWeight="700"
              fill="#1e293b"
              pointerEvents="none"
              opacity={0.9}
            >
              {locNameStr}
            </text>
          )}
        </g>
      );
    });
  }, [plottableData, pointColors, pointSizes, getPointKey, stateHeader, is3d, localPointSize, showLocationLabels, pointSymbols, localPointSymbols, defaultSymbol, localDefaultSymbol]);

  // Render Title (Flat, crisp typography without emboss/deboss)
  const renderTitle = (targetSvg: SVGSVGElement | null) => {
    if (!simpleTitleConfig.text) return null;
    const lines = simpleTitleConfig.text.split("\n");
    const anchor = simpleTitleConfig.alignment === "left" ? "start" : simpleTitleConfig.alignment === "right" ? "end" : "middle";
    return (
      <g
        transform={`translate(${titlePos.x}, ${titlePos.y})`}
        style={{ cursor: isDraggingTitle ? "grabbing" : "grab", userSelect: "none" }}
        onPointerDown={(e) => handleTitlePointerDown(e, targetSvg)}
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
        <text
          x={0}
          y={0}
          textAnchor={anchor}
          fontSize={simpleTitleConfig.size}
          fill={simpleTitleConfig.color}
          fontWeight={simpleTitleConfig.isBold ? "900" : "400"}
          fontStyle={simpleTitleConfig.isItalic ? "italic" : "normal"}
          fontFamily={simpleTitleConfig.fontFamily || "'Inter', system-ui, sans-serif"}
          style={{ cursor: "pointer" }}
        >
          {lines.map((l, i) => (
            <tspan key={i} x={0} dy={i === 0 ? 0 : simpleTitleConfig.size * 1.3}>
              {l}
            </tspan>
          ))}
        </text>
      </g>
    );
  };

  // Render In-Chart Legend Box
  const renderInChartLegend = (targetSvg: SVGSVGElement | null) => {
    if (!legendConfig.show || legendConfig.style !== "in-chart" || activeLegendItems.length === 0) return null;
    const cols = legendConfig.columns || 1;

    const maxTextLen = Math.max(...activeLegendItems.map((it) => it.label.length), 6);
    const charWidth = legendConfig.fontSize * 0.58;
    const symbolSpace = Math.max(7, legendConfig.fontSize * 1.5) + 3;
    const neededColWidth = Math.ceil(maxTextLen * charWidth + symbolSpace + 5);
    const minColWidth = cols === 1 ? 84 : cols === 2 ? 62 : cols === 3 ? 50 : 42;
    const colWidth = Math.max(minColWidth, neededColWidth);
    const itemHeight = Math.max(9.5, legendConfig.fontSize * 1.8);
    const numRows = Math.ceil(activeLegendItems.length / cols);
    const padX = 7;
    const padY = 6;
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
          const displayLabel = it.label;
          const formattedLabel = legendConfig.isUppercase ? displayLabel.toUpperCase() : displayLabel;
          const bubbleId = `chadha-bubble-${String(it.color).replace(/#/g, "")}`;
          const fillVal = is3d ? `url(#${bubbleId})` : it.color;

          return (
            <g key={it.key}>
              <PointSymbolShape
                cx={itemX + 4}
                cy={itemY - itemHeight * 0.28}
                r={Math.max(1.8, legendConfig.fontSize * 0.45)}
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
                {formattedLabel}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  const handleExport = (format: "jpeg" | "png" | "svg", transparent: boolean, elementId = "chadha-chart-export") => {
    exportDiagram({
      elementId,
      filename: "Chadha_Diagram",
      format,
      transparent,
      scale: 3,
      isCropActive: false,
      orientation: pageOrientation,
      svgElement: elementId.includes("fs") ? fullscreenSvgRef.current : svgRef.current,
    });
  };

  return (
    <div className="bg-transparent p-4 sm:p-6 flex flex-col items-center w-full transition-colors duration-300 relative group">
      {/* Studio Unified Toolbar (Tile 1: elevated z-index so dropdowns float cleanly above Tile 2) */}
      <div className="w-full max-w-[1100px] mb-3 relative z-30">
        <DiagramToolbarStudio
          currentTheme={currentTheme}
          onThemeChange={setCurrentTheme}
          onExport={handleExport}
          isCropActive={false}
          onToggleCrop={() => {}}
          titleConfig={simpleTitleConfig}
          onOpenTitleEditor={() => setIsTitleModalOpen(true)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(true)}
          activeSpatialText={activeSpatialText}
          pointSize={localPointSize}
          onPointSizeChange={(val) => {
            setLocalPointSize(val);
            if (onBubbleSizeMultiplierChange) onBubbleSizeMultiplierChange(val);
          }}
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
            title="Format Legend Box"
          >
            <i className="ph ph-paint-brush-broad text-xs"></i>
            <span>Legend Box</span>
          </button>

          {/* Quick 1, 2, 3, 4 Columns */}
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-0.5 border border-slate-200">
            {([1, 2, 3, 4] as const).map((col) => (
              <button
                key={col}
                onClick={() => setLegendConfig((prev) => ({ ...prev, columns: col, show: true }))}
                className={`px-1.5 py-0.5 text-[10px] font-black rounded-lg transition-all ${
                  legendConfig.columns === col && legendConfig.show
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
                title={`${col} Column${col > 1 ? "s" : ""}`}
              >
                {col}C
              </button>
            ))}
          </div>

          {/* Quick No Boundary / Boundary Toggle */}
          <button
            onClick={() => setLegendConfig((prev) => ({ ...prev, showBorder: !prev.showBorder }))}
            className={`px-2 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 ${
              !legendConfig.showBorder
                ? "bg-amber-100 text-amber-800 border-amber-300"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span>{!legendConfig.showBorder ? "No Boundary" : "Boundary: ON"}</span>
          </button>

          {/* Point Symbols Button */}
          <button
            onClick={() => setEditingSymbols(true)}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs"
          >
            <PointSymbolIcon symbol={defaultSymbol || localDefaultSymbol} color="#4f46e5" size={13} stroke="#ffffff" />
            <span>Point Symbols</span>
          </button>

          {/* Toggle Legend Mode */}
          <button
            onClick={() =>
              setLegendConfig((prev) => ({
                ...prev,
                style: prev.style === "in-chart" ? "bottom" : prev.style === "bottom" ? "none" : "in-chart",
                show: prev.style === "none" ? true : prev.show,
              }))
            }
            className="bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 shadow-2xs transition-all"
          >
            {legendConfig.style === "in-chart" ? "In-Chart" : legendConfig.style === "bottom" ? "Bottom" : "Legend Off"}
          </button>

          {/* Diagram Area Margin */}
          <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-xl border border-slate-200 shadow-2xs" title="Adjust Map/Chart Area Space">
            <span className="text-[9.5px] font-black uppercase text-slate-500 tracking-wider">Area:</span>
            {[
              { label: "Normal", pad: 15 },
              { label: "Spacious", pad: 30 },
              { label: "Wide", pad: 55 },
              { label: "Max", pad: 85 }
            ].map((opt) => (
              <button
                key={opt.pad}
                onClick={() => setDiagramPadding(opt.pad)}
                className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                  diagramPadding === opt.pad
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {(titlePos.x !== DEFAULT_TITLE_POS.x || titlePos.y !== DEFAULT_TITLE_POS.y) && (
            <button
              onClick={() => setTitlePos(DEFAULT_TITLE_POS)}
              className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
              title="Reset title position"
            >
              <i className="ph ph-arrow-counter-clockwise"></i>
              <span>Reset Pos</span>
            </button>
          )}
        </DiagramToolbarStudio>
      </div>

      {/* Geochemical Field Distribution Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full max-w-[1100px] mb-3">
        <div className="bg-emerald-50/90 border border-emerald-200/80 rounded-2xl p-2.5 flex items-center justify-between">
          <div>
            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-800 block">Field 5: Weathering</span>
            <span className="text-[10px] font-medium text-emerald-600">Ca-Mg-HCO3</span>
          </div>
          <span className="text-xs font-black text-emerald-800 bg-white px-2 py-0.5 rounded-lg border border-emerald-200 shadow-2xs">
            {fieldStats.f5} ({fieldStats.total > 0 ? ((fieldStats.f5 / fieldStats.total) * 100).toFixed(0) : 0}%)
          </span>
        </div>
        <div className="bg-sky-50/90 border border-sky-200/80 rounded-2xl p-2.5 flex items-center justify-between">
          <div>
            <span className="text-[9px] font-black uppercase tracking-wider text-sky-800 block">Field 8: Base Exchange</span>
            <span className="text-[10px] font-medium text-sky-600">NaHCO3</span>
          </div>
          <span className="text-xs font-black text-sky-800 bg-white px-2 py-0.5 rounded-lg border border-sky-200 shadow-2xs">
            {fieldStats.f8} ({fieldStats.total > 0 ? ((fieldStats.f8 / fieldStats.total) * 100).toFixed(0) : 0}%)
          </span>
        </div>
        <div className="bg-rose-50/90 border border-rose-200/80 rounded-2xl p-2.5 flex items-center justify-between">
          <div>
            <span className="text-[9px] font-black uppercase tracking-wider text-rose-800 block">Field 7: Saline / Evap</span>
            <span className="text-[10px] font-medium text-rose-600">NaCl</span>
          </div>
          <span className="text-xs font-black text-rose-800 bg-white px-2 py-0.5 rounded-lg border border-rose-200 shadow-2xs">
            {fieldStats.f7} ({fieldStats.total > 0 ? ((fieldStats.f7 / fieldStats.total) * 100).toFixed(0) : 0}%)
          </span>
        </div>
        <div className="bg-purple-50/90 border border-purple-200/80 rounded-2xl p-2.5 flex items-center justify-between">
          <div>
            <span className="text-[9px] font-black uppercase tracking-wider text-purple-800 block">Field 6: Reverse Exch</span>
            <span className="text-[10px] font-medium text-purple-600">Ca-Mg-Cl-SO4</span>
          </div>
          <span className="text-xs font-black text-purple-800 bg-white px-2 py-0.5 rounded-lg border border-purple-200 shadow-2xs">
            {fieldStats.f6} ({fieldStats.total > 0 ? ((fieldStats.f6 / fieldStats.total) * 100).toFixed(0) : 0}%)
          </span>
        </div>
      </div>

      {/* Axis Label Formatting Modal */}
      {editingAxisKey && labelsConfig[editingAxisKey] && (
        <UsslLabelsEditor
          config={labelsConfig[editingAxisKey]}
          onChange={(newConf) => setLabelsConfig((p) => ({ ...p, [editingAxisKey]: newConf }))}
          onClose={() => setEditingAxisKey(null)}
          title={`Edit Chadha ${editingAxisKey === "xAxis" ? "X-Axis" : "Y-Axis"} Label`}
        />
      )}

      {/* Border Frame Studio Modal */}
      {editingBorder && (
        <DiagramBorderEditor
          config={borderConfig}
          onChange={setBorderConfig}
          onClose={() => setEditingBorder(false)}
          title="Chadha Diagram Border Frame Studio"
          onStartInteractiveAdjust={() => setIsAdjustingBorder(true)}
        />
      )}

      {/* Move & Fit Border Mode Floating Banner */}
      {isAdjustingBorder && (
        <div className="w-full max-w-[1100px] mb-2 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-bold shadow-md animate-in slide-in-from-top-2 border border-amber-600 z-30">
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
        id="chadha-chart-export"
        className={`flex flex-col items-center justify-center w-full max-w-[1100px] bg-white transition-all relative z-10 rounded-3xl p-4 shadow-sm border border-slate-100 ${PAGE_ORIENTATION_CONFIGS[pageOrientation].className}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <svg
          ref={svgRef}
          viewBox={`${-diagramPadding} ${-diagramPadding} ${510 + diagramPadding * 2} ${350 + diagramPadding * 2}`}
          className="w-full h-auto max-h-[80vh] overflow-visible select-none"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {/* Defs for 3D Specular Lighting / Glossy Bubble Effects */}
          <defs>
            <filter id="chadha-point-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0.6" dy="0.9" stdDeviation="0.6" floodOpacity="0.25" />
            </filter>
            {is3d && (
              <>
                {Array.from(new Set([...Object.values(pointColors || {}), ...activeLegendItems.map((it) => it.color), "#2563eb", "#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"]))
                  .filter((c): c is string => typeof c === "string" && !!c)
                  .map((color) => {
                    const id = `chadha-bubble-${color.replace(/#/g, "")}`;
                    const darker = darkenColor(color, 35);
                    return (
                      <radialGradient key={id} id={id} cx="35%" cy="30%" r="70%" fx="30%" fy="25%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                        <stop offset="25%" stopColor={color} stopOpacity="1" />
                        <stop offset="85%" stopColor={darker} stopOpacity="1" />
                        <stop offset="100%" stopColor="#0f172a" stopOpacity="0.85" />
                      </radialGradient>
                    );
                  })}
              </>
            )}
          </defs>

          {/* Pure White Background on SVG Canvas */}
          <rect
            id="diagram-base-canvas-bg"
            x={-diagramPadding}
            y={-diagramPadding}
            width={510 + diagramPadding * 2}
            height={350 + diagramPadding * 2}
            fill="#ffffff"
          />

          {/* Moveable & Customisable Outer Frame Border */}
          <DiagramBorderFrame
            baseX={-diagramPadding}
            baseY={-diagramPadding}
            baseWidth={510 + diagramPadding * 2}
            baseHeight={350 + diagramPadding * 2}
            config={borderConfig}
            isInteractive={isAdjustingBorder}
            onConfigChange={setBorderConfig}
            svgRef={svgRef}
            idPrefix="chadha"
          />

          {/* Chart Background (Pure White Background) */}
          <rect
            x={boxLeft}
            y={boxTop}
            width={boxSize}
            height={boxSize}
            fill="#ffffff"
            stroke={currentTheme.primaryLine}
            strokeWidth={outerLineWidth}
          />

          {/* Grid lines (-50, +50) */}
          <line x1={mapX(-50)} y1={boxTop} x2={mapX(-50)} y2={boxBottom} stroke={currentTheme.secondaryLine} strokeWidth="0.75" strokeDasharray={currentTheme.gridDash} />
          <line x1={mapX(50)} y1={boxTop} x2={mapX(50)} y2={boxBottom} stroke={currentTheme.secondaryLine} strokeWidth="0.75" strokeDasharray={currentTheme.gridDash} />
          <line x1={boxLeft} y1={mapY(-50)} x2={boxRight} y2={mapY(-50)} stroke={currentTheme.secondaryLine} strokeWidth="0.75" strokeDasharray={currentTheme.gridDash} />
          <line x1={boxLeft} y1={mapY(50)} x2={boxRight} y2={mapY(50)} stroke={currentTheme.secondaryLine} strokeWidth="0.75" strokeDasharray={currentTheme.gridDash} />

          {/* Main Central Cross Axis Lines (X = 0, Y = 0) */}
          <line x1={centerX} y1={boxTop} x2={centerX} y2={boxBottom} stroke={currentTheme.primaryLine} strokeWidth={Math.max(1.0, +(outerLineWidth * 0.9).toFixed(2))} />
          <line x1={boxLeft} y1={centerY} x2={boxRight} y2={centerY} stroke={currentTheme.primaryLine} strokeWidth={Math.max(1.0, +(outerLineWidth * 0.9).toFixed(2))} />

          {/* Quadrant Field Headers & Chemistry Descriptions */}
          {/* Quadrant 5: Top-Right (Weathering & Recharge) */}
          <g>
            <text x={centerX + 6} y={boxTop + 14} fontSize="6.8" fontWeight="800" fontStyle="italic" fill="#0f172a">
              5: Weathering and Recharge
            </text>
            <text x={centerX + 6} y={boxTop + 24} fontSize="6.2" fontWeight="700" fill="#334155">
              Ca-Mg-HCO3
            </text>
          </g>

          {/* Quadrant 8: Top-Left (Base Ion Exchange) */}
          <g>
            <text x={boxLeft + 6} y={boxTop + 14} fontSize="6.8" fontWeight="800" fontStyle="italic" fill="#0f172a">
              8: Base Ion Exchange
            </text>
            <text x={boxLeft + 6} y={boxTop + 24} fontSize="6.2" fontWeight="700" fill="#334155">
              NaHCO3
            </text>
          </g>

          {/* Quadrant 7: Bottom-Left (Saline Water / Evaporation) */}
          <g>
            <text x={boxLeft + 6} y={boxBottom - 16} fontSize="6.8" fontWeight="800" fontStyle="italic" fill="#0f172a">
              7: Saline Water/ Evaporation
            </text>
            <text x={boxLeft + 6} y={boxBottom - 6} fontSize="6.2" fontWeight="700" fill="#334155">
              NaCl
            </text>
          </g>

          {/* Quadrant 6: Bottom-Right (Reverse Ion Exchange) */}
          <g>
            <text x={centerX + 6} y={boxBottom - 16} fontSize="6.8" fontWeight="800" fontStyle="italic" fill="#0f172a">
              6: Reverse Ion Exchange
            </text>
            <text x={centerX + 6} y={boxBottom - 6} fontSize="6.2" fontWeight="700" fill="#334155">
              Ca-Mg-Cl-SO4
            </text>
          </g>

          {/* Red Axis Quadrant Designators (1, 2, 3, 4) from attached photo */}
          {/* 1 on right horizontal axis */}
          <text x={boxRight - 28} y={centerY - 2.5} fontSize="9" fontWeight="900" fill="#dc2626" textAnchor="middle">
            1
          </text>
          {/* 2 on top vertical axis */}
          <text x={centerX - 4} y={boxTop + 48} fontSize="9" fontWeight="900" fill="#dc2626" textAnchor="end">
            2
          </text>
          {/* 3 on left horizontal axis */}
          <text x={boxLeft + 28} y={centerY - 2.5} fontSize="9" fontWeight="900" fill="#dc2626" textAnchor="middle">
            3
          </text>
          {/* 4 on bottom vertical axis */}
          <text x={centerX - 4} y={boxBottom - 48} fontSize="9" fontWeight="900" fill="#dc2626" textAnchor="end">
            4
          </text>

          {/* Ticks and Numerical Labels on Axes */}
          {[-100, -50, 0, 50, 100].map((val) => {
            const x = mapX(val);
            const y = mapY(val);
            return (
              <g key={`tick-${val}`}>
                {/* X axis ticks at bottom of box */}
                <line x1={x} y1={boxBottom} x2={x} y2={boxBottom + 3} stroke={currentTheme.axisColor} strokeWidth="1" />
                <text x={x} y={boxBottom + 9} fontSize="5" fontWeight="700" textAnchor="middle" fill={currentTheme.axisColor}>
                  {val}
                </text>

                {/* Y axis ticks at left of box */}
                <line x1={boxLeft - 3} y1={y} x2={boxLeft} y2={y} stroke={currentTheme.axisColor} strokeWidth="1" />
                <text x={boxLeft - 5} y={y + 1.8} fontSize="5" fontWeight="700" textAnchor="end" fill={currentTheme.axisColor}>
                  {val}
                </text>
              </g>
            );
          })}

          {/* Axis Labels */}
          {/* X Axis Label */}
          <text
            x={centerX}
            y={boxBottom + 22}
            textAnchor="middle"
            fontSize={labelsConfig.xAxis.size}
            fontWeight={labelsConfig.xAxis.isBold ? "900" : "500"}
            fontStyle={labelsConfig.xAxis.isItalic ? "italic" : "normal"}
            fontFamily={labelsConfig.xAxis.fontFamily || "sans-serif"}
            fill={labelsConfig.xAxis.color || currentTheme.axisColor}
            style={{ cursor: "pointer", letterSpacing: "0.05em" }}
            onClick={(e) => {
              e.stopPropagation();
              setEditingAxisKey("xAxis");
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditingAxisKey("xAxis");
            }}
          >
            {labelsConfig.xAxis.text}
          </text>

          {/* Y Axis Label */}
          <text
            transform={`translate(${boxLeft - 22}, ${centerY}) rotate(-90)`}
            textAnchor="middle"
            fontSize={labelsConfig.yAxis.size}
            fontWeight={labelsConfig.yAxis.isBold ? "900" : "500"}
            fontStyle={labelsConfig.yAxis.isItalic ? "italic" : "normal"}
            fontFamily={labelsConfig.yAxis.fontFamily || "sans-serif"}
            fill={labelsConfig.yAxis.color || currentTheme.axisColor}
            style={{ cursor: "pointer", letterSpacing: "0.05em" }}
            onClick={(e) => {
              e.stopPropagation();
              setEditingAxisKey("yAxis");
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditingAxisKey("yAxis");
            }}
          >
            {labelsConfig.yAxis.text}
          </text>

          {/* Reference Key Table on Right Side (As seen in the uploaded reference photo) */}
          <g transform={`translate(${335}, 35)`}>
            <rect
              x={0}
              y={0}
              width={160}
              height={55}
              fill="#ffffff"
              stroke={currentTheme.primaryLine}
              strokeWidth="1.2"
              rx={2}
            />
            <text x={8} y={13} fontSize="5.4" fontWeight="800" fill="#0f172a">
              1 : Ca²⁺+Mg²⁺ &gt; Na¹⁺+K¹⁺
            </text>
            <text x={8} y={25} fontSize="5.4" fontWeight="800" fill="#0f172a">
              2 : HCO₃¹⁻ &gt; Cl ¹⁻+SO₄ ²⁻
            </text>
            <text x={8} y={37} fontSize="5.4" fontWeight="800" fill="#0f172a">
              3 : Ca²⁺+Mg²⁺ &lt; Na¹⁺+K¹⁺
            </text>
            <text x={8} y={49} fontSize="5.4" fontWeight="800" fill="#0f172a">
              4 : HCO₃¹⁻ &lt; Cl¹⁻+SO₄²⁻
            </text>
          </g>

          {/* Plotted Water Sample Points with 3D Glossy Effect */}
          <g filter={is3d ? "url(#chadha-point-shadow)" : undefined}>{renderedPoints}</g>

          {/* Movable In-Chart Legend Box */}
          {renderInChartLegend(svgRef.current)}

          {/* Formattable Title (Draggable by Mouse) */}
          {renderTitle(svgRef.current)}
        </svg>
      </div>

      {/* Simple Title Editor Modal */}
      <SimpleTitleEditorModal
        isOpen={isTitleModalOpen}
        config={simpleTitleConfig}
        onChange={setSimpleTitleConfig}
        onClose={() => setIsTitleModalOpen(false)}
        title="Format Chadha Diagram Title"
      />

      {/* Tile 3: Dedicated Publication Legend Tile (if legend is selected) */}
      {showLegendTile && activeLegendItems.length > 0 && (
        <div className="w-full max-w-[1100px] mt-4 bg-white border border-slate-200/80 shadow-xs rounded-2xl p-4 transition-all">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                Chadha Diagram Active Variables Legend
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {activeLegendItems.length} {activeLegendItems.length === 1 ? "variable" : "variables"}
            </span>
          </div>
          <div
            className="grid gap-x-4 gap-y-2"
            style={{
              gridTemplateColumns: `repeat(${legendConfig.columns || (activeLegendItems.length > 8 ? 4 : activeLegendItems.length > 4 ? 3 : 2)}, minmax(0, 1fr))`,
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
          title="Chadha Legend Box Formatting Studio"
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
          title="Chadha Diagram Point Symbol Studio"
          subtitle="Configure marker symbols for selected locations and categories"
        />
      )}

      {/* Fullscreen View */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-6xl max-h-[94vh] flex flex-col relative">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 mb-3 gap-2">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <i className="ph ph-corners-out text-lg text-indigo-600 animate-pulse"></i>
                  Chadha Geochemical Classification Diagram (Full Screen Explorer)
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Expanded geochemical plotting of Alkaline Earths vs Alkali Metals &amp; Weak vs Strong Acidic Anions
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport("jpeg", false, "chadha-chart-export-fs")}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                  title="Download HD JPEG with pure white background"
                >
                  <i className="ph ph-camera text-base"></i>
                  <span>White Bg JPEG</span>
                </button>
                <button
                  onClick={() => handleExport("png", true, "chadha-chart-export-fs")}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-200"
                  title="Download Transparent HD PNG without background"
                >
                  <i className="ph ph-image text-base"></i>
                  <span>Transparent PNG</span>
                </button>
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <i className="ph ph-x text-sm"></i>
                  <span>Close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-2 min-h-[460px]">
              <svg
                ref={fullscreenSvgRef}
                viewBox={`${-diagramPadding} ${-diagramPadding} ${510 + diagramPadding * 2} ${350 + diagramPadding * 2}`}
                className="w-full h-auto max-h-[75vh] overflow-visible select-none"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {/* Pure White Background Rect */}
                <rect
                  id="diagram-base-canvas-bg"
                  x={-diagramPadding}
                  y={-diagramPadding}
                  width={510 + diagramPadding * 2}
                  height={350 + diagramPadding * 2}
                  fill="#ffffff"
                />

                <defs>
                  {is3d && (
                    <>
                      {Array.from(new Set([...Object.values(pointColors || {}), ...activeLegendItems.map((it) => it.color), "#2563eb", "#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6"]))
                        .filter((c): c is string => typeof c === "string" && !!c)
                        .map((color) => {
                          const id = `chadha-bubble-${color.replace(/#/g, "")}`;
                          const darker = darkenColor(color, 35);
                          return (
                            <radialGradient key={`fs-${id}`} id={id} cx="35%" cy="30%" r="70%" fx="30%" fy="25%">
                              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                              <stop offset="25%" stopColor={color} stopOpacity="1" />
                              <stop offset="85%" stopColor={darker} stopOpacity="1" />
                              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.85" />
                            </radialGradient>
                          );
                        })}
                    </>
                  )}
                </defs>

                {/* Pure White Background */}
                <rect x={boxLeft} y={boxTop} width={boxSize} height={boxSize} fill="#ffffff" stroke={currentTheme.primaryLine} strokeWidth={outerLineWidth} />
                <line x1={mapX(-50)} y1={boxTop} x2={mapX(-50)} y2={boxBottom} stroke={currentTheme.secondaryLine} strokeWidth="0.75" strokeDasharray={currentTheme.gridDash} />
                <line x1={mapX(50)} y1={boxTop} x2={mapX(50)} y2={boxBottom} stroke={currentTheme.secondaryLine} strokeWidth="0.75" strokeDasharray={currentTheme.gridDash} />
                <line x1={boxLeft} y1={mapY(-50)} x2={boxRight} y2={mapY(-50)} stroke={currentTheme.secondaryLine} strokeWidth="0.75" strokeDasharray={currentTheme.gridDash} />
                <line x1={boxLeft} y1={mapY(50)} x2={boxRight} y2={mapY(50)} stroke={currentTheme.secondaryLine} strokeWidth="0.75" strokeDasharray={currentTheme.gridDash} />
                <line x1={centerX} y1={boxTop} x2={centerX} y2={boxBottom} stroke={currentTheme.primaryLine} strokeWidth={Math.max(1.0, +(outerLineWidth * 0.9).toFixed(2))} />
                <line x1={boxLeft} y1={centerY} x2={boxRight} y2={centerY} stroke={currentTheme.primaryLine} strokeWidth={Math.max(1.0, +(outerLineWidth * 0.9).toFixed(2))} />

                {/* Quadrants */}
                <text x={centerX + 6} y={boxTop + 14} fontSize="6.8" fontWeight="800" fontStyle="italic" fill="#0f172a">
                  5: Weathering and Recharge
                </text>
                <text x={centerX + 6} y={boxTop + 24} fontSize="6.2" fontWeight="700" fill="#334155">
                  Ca-Mg-HCO3
                </text>
                <text x={boxLeft + 6} y={boxTop + 14} fontSize="6.8" fontWeight="800" fontStyle="italic" fill="#0f172a">
                  8: Base Ion Exchange
                </text>
                <text x={boxLeft + 6} y={boxTop + 24} fontSize="6.2" fontWeight="700" fill="#334155">
                  NaHCO3
                </text>
                <text x={boxLeft + 6} y={boxBottom - 16} fontSize="6.8" fontWeight="800" fontStyle="italic" fill="#0f172a">
                  7: Saline Water/ Evaporation
                </text>
                <text x={boxLeft + 6} y={boxBottom - 6} fontSize="6.2" fontWeight="700" fill="#334155">
                  NaCl
                </text>
                <text x={centerX + 6} y={boxBottom - 16} fontSize="6.8" fontWeight="800" fontStyle="italic" fill="#0f172a">
                  6: Reverse Ion Exchange
                </text>
                <text x={centerX + 6} y={boxBottom - 6} fontSize="6.2" fontWeight="700" fill="#334155">
                  Ca-Mg-Cl-SO4
                </text>

                {/* Red numbers */}
                <text x={boxRight - 28} y={centerY - 2.5} fontSize="9" fontWeight="900" fill="#dc2626" textAnchor="middle">1</text>
                <text x={centerX - 4} y={boxTop + 48} fontSize="9" fontWeight="900" fill="#dc2626" textAnchor="end">2</text>
                <text x={boxLeft + 28} y={centerY - 2.5} fontSize="9" fontWeight="900" fill="#dc2626" textAnchor="middle">3</text>
                <text x={centerX - 4} y={boxBottom - 48} fontSize="9" fontWeight="900" fill="#dc2626" textAnchor="end">4</text>

                {/* Ticks */}
                {[-100, -50, 0, 50, 100].map((val) => {
                  const x = mapX(val);
                  const y = mapY(val);
                  return (
                    <g key={`fs-tick-${val}`}>
                      <line x1={x} y1={boxBottom} x2={x} y2={boxBottom + 3} stroke={currentTheme.axisColor} strokeWidth="1" />
                      <text x={x} y={boxBottom + 9} fontSize="5" fontWeight="700" textAnchor="middle" fill={currentTheme.axisColor}>{val}</text>
                      <line x1={boxLeft - 3} y1={y} x2={boxLeft} y2={y} stroke={currentTheme.axisColor} strokeWidth="1" />
                      <text x={boxLeft - 5} y={y + 1.8} fontSize="5" fontWeight="700" textAnchor="end" fill={currentTheme.axisColor}>{val}</text>
                    </g>
                  );
                })}

                <text
                  x={centerX}
                  y={boxBottom + 22}
                  textAnchor="middle"
                  fontSize={labelsConfig.xAxis.size}
                  fontWeight={labelsConfig.xAxis.isBold ? "900" : "500"}
                  fontStyle={labelsConfig.xAxis.isItalic ? "italic" : "normal"}
                  fontFamily={labelsConfig.xAxis.fontFamily || "sans-serif"}
                  fill={labelsConfig.xAxis.color || currentTheme.axisColor}
                >
                  {labelsConfig.xAxis.text}
                </text>
                <text
                  transform={`translate(${boxLeft - 22}, ${centerY}) rotate(-90)`}
                  textAnchor="middle"
                  fontSize={labelsConfig.yAxis.size}
                  fontWeight={labelsConfig.yAxis.isBold ? "900" : "500"}
                  fontStyle={labelsConfig.yAxis.isItalic ? "italic" : "normal"}
                  fontFamily={labelsConfig.yAxis.fontFamily || "sans-serif"}
                  fill={labelsConfig.yAxis.color || currentTheme.axisColor}
                >
                  {labelsConfig.yAxis.text}
                </text>

                <g transform={`translate(${335}, 35)`}>
                  <rect x={0} y={0} width={160} height={55} fill="#ffffff" stroke={currentTheme.primaryLine} strokeWidth="1.2" rx={2} />
                  <text x={8} y={13} fontSize="5.4" fontWeight="800" fill="#0f172a">1 : Ca²⁺+Mg²⁺ &gt; Na¹⁺+K¹⁺</text>
                  <text x={8} y={25} fontSize="5.4" fontWeight="800" fill="#0f172a">2 : HCO₃¹⁻ &gt; Cl ¹⁻+SO₄ ²⁻</text>
                  <text x={8} y={37} fontSize="5.4" fontWeight="800" fill="#0f172a">3 : Ca²⁺+Mg²⁺ &lt; Na¹⁺+K¹⁺</text>
                  <text x={8} y={49} fontSize="5.4" fontWeight="800" fill="#0f172a">4 : HCO₃¹⁻ &lt; Cl¹⁻+SO₄²⁻</text>
                </g>

                {renderedPoints}
                {renderInChartLegend(fullscreenSvgRef.current)}
                {renderTitle(fullscreenSvgRef.current)}
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

ChadhaDiagram.displayName = "ChadhaDiagram";
export default ChadhaDiagram;
