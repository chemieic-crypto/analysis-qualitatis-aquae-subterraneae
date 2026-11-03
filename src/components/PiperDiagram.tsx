import React, { useState, useMemo, useRef, useEffect } from "react";
import { ProcessedSample } from "../utils/usslMath";
import UsslLabelsEditor, { LabelConfig } from "./UsslLabelsEditor";
import LegendBoxEditor, { LegendConfig, DEFAULT_PIPER_LEGEND_CONFIG } from "./LegendBoxEditor";
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

interface PiperDiagramProps {
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

export const PiperDiagram = React.memo(({
  data,
  pointColors,
  pointSizes,
  getPointKey,
  stateHeader,
  is3d = false,
  bubbleSizeMultiplier = 0.8,
  onBubbleSizeMultiplierChange,
  customTitle,
  showLocationLabels = false,
  showAllPoints = true,
  pointSymbols,
  onPointSymbolsChange,
  defaultSymbol = "circle",
  onDefaultSymbolChange,
  activeSpatialText,
}: PiperDiagramProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [diagramScale, setDiagramScale] = useState<number>(1.5); // Default +50% Enlarged Ultra HD Size

  // 7 Base Line Color Templates (Monochrome, Cobalt, Indigo, Emerald, Crimson, Bronze, Slate)
  const [currentTheme, setCurrentTheme] = useState<DiagramLineTheme>(DEFAULT_DIAGRAM_TEMPLATE);

  // Symbol management states
  const [localPointSymbols, setLocalPointSymbols] = useState<Record<string, PointSymbol>>({});
  const [localDefaultSymbol, setLocalDefaultSymbol] = useState<PointSymbol>(defaultSymbol);
  const [editingSymbols, setEditingSymbols] = useState(false);
  const [diagramPadding, setDiagramPadding] = useState<number>(30); // 15: Normal, 35: Spacious, 65: Wide, 95: Max
  const [showProjectionLines, setShowProjectionLines] = useState<boolean>(false);
  const [outerLineWidth, setOuterLineWidth] = useState<number>(1.8);
  const [borderConfig, setBorderConfig] = useState<DiagramBorderConfig>(DEFAULT_PIPER_BORDER_CONFIG);
  const [editingBorder, setEditingBorder] = useState<boolean>(false);
  const [isAdjustingBorder, setIsAdjustingBorder] = useState<boolean>(false);
  const [activeHoverPoint, setActiveHoverPoint] = useState<number | null>(null);

  // A4 Page Orientation (fit | a4_portrait | a4_landscape)
  const [pageOrientation, setPageOrientation] = useState<DiagramPageOrientation>("fit");
  const [showLegendTile, setShowLegendTile] = useState<boolean>(true);

  useEffect(() => {
    if (defaultSymbol) setLocalDefaultSymbol(defaultSymbol);
  }, [defaultSymbol]);

  useEffect(() => {
    if (pointSymbols) setLocalPointSymbols(pointSymbols);
  }, [pointSymbols]);

  // Extract detected states and season for reference template title suggestion
  const { defaultLine1, defaultLine2 } = useMemo(() => {
    const sSet = new Set<string>();
    let ssn = "";
    let yr = "";
    data.forEach((d) => {
      const st = stateHeader ? d[stateHeader] : d.State || d.STATE;
      if (st && typeof st === "string") sSet.add(st.trim());
      if (!ssn && (d.Season || d.SEASON || d.season)) ssn = String(d.Season || d.SEASON || d.season);
      if (!yr && (d.Year || d.YEAR || d.year)) yr = String(d.Year || d.YEAR || d.year);
    });
    const statesArr = Array.from(sSet);
    const l1 = statesArr.length > 0 && statesArr.length <= 4
      ? `Piper Diagram for Ground Water of ${statesArr.join(", ")}`
      : statesArr.length > 4
      ? `Piper Diagram for Ground Water of ${statesArr.slice(0, 3).join(", ")} & Others`
      : "Piper Diagram for Ground Water Quality";
    const l2 = ssn && yr ? `(${ssn} ${yr})` : ssn ? `(${ssn})` : "(Pre-Monsoon 2025)";
    return { defaultLine1: l1, defaultLine2: l2 };
  }, [data, stateHeader]);

  // Formattable Simple Title (Crisp, flat typography without emboss/deboss)
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [simpleTitleConfig, setSimpleTitleConfig] = useState<TitleFormattingConfig>({
    text: customTitle || `${defaultLine1}\n${defaultLine2}`,
    size: 9.5,
    color: "#0000cc", // Royal Blue
    isBold: true,
    isItalic: false,
    fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
    alignment: "center",
  });

  useEffect(() => {
    if (customTitle) {
      setSimpleTitleConfig((prev) => ({
        ...prev,
        text: customTitle,
      }));
    }
  }, [customTitle]);

  // Template layout state: reference template has title at bottom & in-chart green legend box
  const [activeTemplate, setActiveTemplate] = useState<"reference" | "modern" | "glass">("reference");
  const [showTicks, setShowTicks] = useState(true);

  // Legend Box Config (1, 2, 3, 4 cols, outer boundary color/thickness or no boundary, fonts)
  const [legendConfig, setLegendConfig] = useState<LegendConfig>(DEFAULT_PIPER_LEGEND_CONFIG);
  const [editingLegend, setEditingLegend] = useState(false);

  // Point size state (0.1 to 3.0)
  const [localPointSize, setLocalPointSize] = useState<number>(bubbleSizeMultiplier ?? 0.8);
  useEffect(() => {
    if (bubbleSizeMultiplier !== undefined) {
      setLocalPointSize(bubbleSizeMultiplier);
    }
  }, [bubbleSizeMultiplier]);

  const handlePointSizeChange = (val: number) => {
    const clamped = Math.max(0.1, Math.min(3, Number(val.toFixed(1))));
    setLocalPointSize(clamped);
    onBubbleSizeMultiplierChange?.(clamped);
  };

  // Downsampling logic
  const maxSafePoints = showAllPoints ? 50000 : 25000;
  const isDownsampled = data.length > maxSafePoints;
  const displayData = useMemo(() => {
    if (!isDownsampled) return data;
    const step = Math.ceil(data.length / maxSafePoints);
    return data.filter((_, idx) => idx % step === 0);
  }, [data, isDownsampled, maxSafePoints]);

  const SQRT3 = Math.sqrt(3);
  const H = (100 * SQRT3) / 2;

  const tx = (x: number) => x + 40;
  const ty = (y: number) => 230 - y;

  const gridLineColor = currentTheme.secondaryLine;
  const frameColor = currentTheme.primaryLine;

  interface LabelItem {
    text: string;
    x: number;
    y: number;
    align: "start" | "middle" | "end";
    rotate: number;
    color: string;
    isBold: boolean;
    isItalic: boolean;
    fontSize: number;
    fontFamily?: string;
  }

  // Exact color-coded chemical labels matching user reference image
  const defaultLabels: Record<string, LabelItem> = {
    ca: { text: "Ca²⁺", x: tx(50), y: ty(-15), align: "middle", rotate: 0, color: "#990000", isBold: true, isItalic: true, fontSize: 6.8 },
    nak: { text: "(Na¹⁺ + K¹⁺)", x: tx(88), y: ty(44), align: "middle", rotate: 60, color: "#990000", isBold: true, isItalic: true, fontSize: 6.8 },
    mg: { text: "Mg²⁺", x: tx(12), y: ty(44), align: "middle", rotate: -60, color: "#990000", isBold: true, isItalic: true, fontSize: 6.8 },
    so4: { text: "SO₄²⁻", x: tx(208), y: ty(44), align: "middle", rotate: 60, color: "#0000cc", isBold: true, isItalic: true, fontSize: 6.8 },
    hco3: { text: "(CO₃²⁻ + HCO₃¹⁻)", x: tx(132), y: ty(44), align: "middle", rotate: -60, color: "#0000cc", isBold: true, isItalic: true, fontSize: 6.8 },
    cl: { text: "Cl¹⁻", x: tx(170), y: ty(-15), align: "middle", rotate: 0, color: "#0000cc", isBold: true, isItalic: true, fontSize: 6.8 },
    diamondL: { text: "(SO₄²⁻ + Cl¹⁻)", x: tx(72), y: ty(136), align: "middle", rotate: -60, color: "#cc0000", isBold: true, isItalic: true, fontSize: 6.8 },
    diamondR: { text: "(Ca²⁺ + Mg²⁺)", x: tx(148), y: ty(136), align: "middle", rotate: 60, color: "#cc0000", isBold: true, isItalic: true, fontSize: 6.8 },
  };

  const [labels, setLabels] = useState<Record<string, LabelItem>>(defaultLabels);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const fullscreenSvgRef = useRef<SVGSVGElement>(null);

  // Draggable Title State (Default at bottom y: 260 like reference image)
  const DEFAULT_TITLE_POS = { x: 150, y: 260 };
  const [titlePos, setTitlePos] = useState<{ x: number; y: number }>(DEFAULT_TITLE_POS);
  const [isDraggingTitle, setIsDraggingTitle] = useState(false);

  // Draggable In-Chart Legend Box State (Default at top-right x: 280, y: 15 with dedicated space)
  const DEFAULT_LEGEND_POS = { x: 280, y: 15 };
  const [legendPos, setLegendPos] = useState<{ x: number; y: number }>(DEFAULT_LEGEND_POS);
  const [isDraggingLegend, setIsDraggingLegend] = useState(false);

  // Draggable Axis Labels
  const [draggedLabel, setDraggedLabel] = useState<string | null>(null);

  // Rock-solid mouse drag handler for Title
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
        setIsTitleModalOpen(true);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    setIsDraggingTitle(true);
  };

  // Rock-solid mouse drag handler for In-Chart Legend Box
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

  // Drag handler for Axis Labels
  const handleLabelPointerDown = (e: React.PointerEvent<any>, key: string, targetSvg: SVGSVGElement | null) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedLabel(key);
    if (!targetSvg || !labels[key]) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startLabelX = labels[key]!.x;
    const startLabelY = labels[key]!.y;

    const onPointerMove = (moveEv: PointerEvent) => {
      moveEv.preventDefault();
      const dx = moveEv.clientX - startClientX;
      const dy = moveEv.clientY - startClientY;
      const ctm = targetSvg.getScreenCTM();
      if (!ctm) return;
      const svgDx = dx / ctm.a;
      const svgDy = dy / ctm.d;

      setLabels((prev) => ({
        ...prev,
        [key]: {
          ...prev[key]!,
          x: Math.round(startLabelX + svgDx),
          y: Math.round(startLabelY + svgDy),
        },
      }));
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      setDraggedLabel(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    setDraggedLabel(key);
  };

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

  const handleExport = (format: "jpeg" | "png" | "svg", transparent: boolean, scale = 6.0, elementId = "piper-chart-export") => {
    exportDiagram({
      elementId,
      filename: "Piper_Diagram",
      format,
      transparent,
      scale: scale || 6.0,
      isCropActive,
      cropBox,
      orientation: pageOrientation,
      svgElement: elementId.includes("fs") ? fullscreenSvgRef.current : svgRef.current,
    });
  };

  // Interior Grid Lines (Ultra HD geometricPrecision)
  const grids = useMemo(() => {
    const list = [];
    for (let i = 20; i < 100; i += 20) {
      const y = (i * SQRT3) / 2;
      const strokeProps = { stroke: currentTheme.secondaryLine, strokeDasharray: currentTheme.gridDash, strokeWidth: "0.75", fill: "none", shapeRendering: "geometricPrecision" };
      list.push(<line key={`c1-${i}`} x1={tx(0.5 * i)} y1={ty(y)} x2={tx(100 - 0.5 * i)} y2={ty(y)} {...strokeProps} />);
      list.push(<line key={`c2-${i}`} x1={tx(i)} y1={ty(0)} x2={tx(50 + 0.5 * i)} y2={ty(((100 - i) * SQRT3) / 2)} {...strokeProps} />);
      list.push(<line key={`c3-${i}`} x1={tx(100 - i)} y1={ty(0)} x2={tx(0.5 * (100 - i))} y2={ty(((100 - i) * SQRT3) / 2)} {...strokeProps} />);
      list.push(<line key={`a1-${i}`} x1={tx(120 + 0.5 * i)} y1={ty(y)} x2={tx(220 - 0.5 * i)} y2={ty(y)} {...strokeProps} />);
      list.push(<line key={`a2-${i}`} x1={tx(120 + i)} y1={ty(0)} x2={tx(170 + 0.5 * i)} y2={ty(((100 - i) * SQRT3) / 2)} {...strokeProps} />);
      list.push(<line key={`a3-${i}`} x1={tx(220 - i)} y1={ty(0)} x2={tx(120 + 0.5 * (100 - i))} y2={ty(((100 - i) * SQRT3) / 2)} {...strokeProps} />);
      list.push(<line key={`d1-${i}`} x1={tx(110 - 0.5 * i)} y1={ty(10 * SQRT3 + 0.5 * i * SQRT3)} x2={tx(160 - 0.5 * i)} y2={ty(60 * SQRT3 + 0.5 * i * SQRT3)} {...strokeProps} />);
      list.push(<line key={`d2-${i}`} x1={tx(110 + 0.5 * i)} y1={ty(10 * SQRT3 + 0.5 * i * SQRT3)} x2={tx(60 + 0.5 * i)} y2={ty(60 * SQRT3 + 0.5 * i * SQRT3)} {...strokeProps} />);
    }
    return list;
  }, [SQRT3, currentTheme]);

  // Outward Ticks and Numbers exactly like user reference image (Ultra HD)
  const ticks = useMemo(() => {
    if (!showTicks) return null;
    const list = [];
    const tickLen = 2.2;
    const tickStroke = currentTheme.axisColor;
    const textFill = currentTheme.axisColor;
    const fontSz = 3.9;

    // 1. Cation bottom: Ca2+ axis (100 at left corner to 0 at right corner)
    for (let val = 0; val <= 100; val += 20) {
      list.push(
        <g key={`c-bot-${val}`} shapeRendering="geometricPrecision">
          <line x1={tx(val)} y1={ty(0)} x2={tx(val)} y2={ty(-tickLen)} stroke={tickStroke} strokeWidth="1.0" />
          <text x={tx(val)} y={ty(-tickLen - 2.2)} fontSize={fontSz} fill={textFill} textAnchor="middle" fontWeight="700" textRendering="geometricPrecision">
            {100 - val}
          </text>
        </g>
      );
    }

    // 2. Cation left: Mg2+ axis (0 at bottom-left to 100 at top apex)
    for (let val = 0; val <= 100; val += 20) {
      const px = 0.5 * val;
      const py = (val * SQRT3) / 2;
      const nx = (-tickLen * SQRT3) / 2;
      const ny = tickLen * 0.5;
      list.push(
        <g key={`c-left-${val}`} shapeRendering="geometricPrecision">
          <line x1={tx(px)} y1={ty(py)} x2={tx(px + nx)} y2={ty(py + ny)} stroke={tickStroke} strokeWidth="1.0" />
          <text x={tx(px + nx * 1.5)} y={ty(py + ny * 1.5) + 1.2} fontSize={fontSz} fill={textFill} textAnchor="end" fontWeight="700" textRendering="geometricPrecision">
            {val}
          </text>
        </g>
      );
    }

    // 3. Cation right: (Na+ + K+) axis (0 at top apex to 100 at bottom-right)
    for (let val = 0; val <= 100; val += 20) {
      const px = 50 + 0.5 * val;
      const py = ((100 - val) * SQRT3) / 2;
      const nx = (tickLen * SQRT3) / 2;
      const ny = tickLen * 0.5;
      // At val === 100, ensure clean separation from the anion triangle's 100 mark so they never coincide
      const textX = val === 100 ? px + nx + 0.6 : px + nx * 1.5;
      const textY = val === 100 ? py + ny + 0.2 : py + ny * 1.5;
      list.push(
        <g key={`c-right-${val}`} shapeRendering="geometricPrecision">
          <line x1={tx(px)} y1={ty(py)} x2={tx(px + nx)} y2={ty(py + ny)} stroke={tickStroke} strokeWidth="1.0" />
          <text x={tx(textX)} y={ty(textY) + 1.2} fontSize={fontSz} fill={textFill} textAnchor="start" fontWeight="700" textRendering="geometricPrecision">
            {val}
          </text>
        </g>
      );
    }

    // 4. Anion bottom: Cl- axis (0 at left corner to 100 at right corner)
    for (let val = 0; val <= 100; val += 20) {
      list.push(
        <g key={`a-bot-${val}`} shapeRendering="geometricPrecision">
          <line x1={tx(120 + val)} y1={ty(0)} x2={tx(120 + val)} y2={ty(-tickLen)} stroke={tickStroke} strokeWidth="1.0" />
          <text x={tx(120 + val)} y={ty(-tickLen - 2.2)} fontSize={fontSz} fill={textFill} textAnchor="middle" fontWeight="700" textRendering="geometricPrecision">
            {val}
          </text>
        </g>
      );
    }

    // 5. Anion left: (CO3 + HCO3) axis (0 at top apex to 100 at bottom-left)
    for (let val = 0; val <= 100; val += 20) {
      const px = 170 - 0.5 * val;
      const py = ((100 - val) * SQRT3) / 2;
      const nx = (-tickLen * SQRT3) / 2;
      const ny = tickLen * 0.5;
      // At val === 100, ensure clean separation from the cation triangle's 100 mark so they never coincide
      const textX = val === 100 ? px + nx - 0.6 : px + nx * 1.5;
      const textY = val === 100 ? py + ny + 0.2 : py + ny * 1.5;
      list.push(
        <g key={`a-left-${val}`} shapeRendering="geometricPrecision">
          <line x1={tx(px)} y1={ty(py)} x2={tx(px + nx)} y2={ty(py + ny)} stroke={tickStroke} strokeWidth="1.0" />
          <text x={tx(textX)} y={ty(textY) + 1.2} fontSize={fontSz} fill={textFill} textAnchor="end" fontWeight="700" textRendering="geometricPrecision">
            {val}
          </text>
        </g>
      );
    }

    // 6. Anion right: SO4 axis (0 at bottom-right to 100 at top apex)
    for (let val = 0; val <= 100; val += 20) {
      const px = 220 - 0.5 * val;
      const py = (val * SQRT3) / 2;
      const nx = (tickLen * SQRT3) / 2;
      const ny = tickLen * 0.5;
      list.push(
        <g key={`a-right-${val}`} shapeRendering="geometricPrecision">
          <line x1={tx(px)} y1={ty(py)} x2={tx(px + nx)} y2={ty(py + ny)} stroke={tickStroke} strokeWidth="1.0" />
          <text x={tx(px + nx * 1.5)} y={ty(py + ny * 1.5) + 1.2} fontSize={fontSz} fill={textFill} textAnchor="start" fontWeight="700" textRendering="geometricPrecision">
            {val}
          </text>
        </g>
      );
    }

    // 7. Diamond upper-left edge: (SO4+Cl) axis (0 at lower-left to 100 at top apex)
    for (let val = 0; val <= 100; val += 20) {
      const px = 60 + 0.5 * val;
      const py = (60 + 0.5 * val) * SQRT3;
      const nx = (-tickLen * SQRT3) / 2;
      const ny = tickLen * 0.5;
      list.push(
        <g key={`d-ul-${val}`} shapeRendering="geometricPrecision">
          <line x1={tx(px)} y1={ty(py)} x2={tx(px + nx)} y2={ty(py + ny)} stroke={tickStroke} strokeWidth="1.0" />
          <text x={tx(px + nx * 1.5)} y={ty(py + ny * 1.5) + 1.2} fontSize={fontSz} fill={textFill} textAnchor="end" fontWeight="700" textRendering="geometricPrecision">
            {val}
          </text>
        </g>
      );
    }

    // 8. Diamond upper-right edge: (Ca+Mg) axis (0 at lower-right to 100 at top apex)
    for (let val = 0; val <= 100; val += 20) {
      const px = 160 - 0.5 * val;
      const py = (60 + 0.5 * val) * SQRT3;
      const nx = (tickLen * SQRT3) / 2;
      const ny = tickLen * 0.5;
      list.push(
        <g key={`d-ur-${val}`} shapeRendering="geometricPrecision">
          <line x1={tx(px)} y1={ty(py)} x2={tx(px + nx)} y2={ty(py + ny)} stroke={tickStroke} strokeWidth="1.0" />
          <text x={tx(px + nx * 1.5)} y={ty(py + ny * 1.5) + 1.2} fontSize={fontSz} fill={textFill} textAnchor="start" fontWeight="700" textRendering="geometricPrecision">
            {val}
          </text>
        </g>
      );
    }

    return list;
  }, [showTicks, SQRT3, currentTheme]);

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
      color: pointColors[key] || "#2563eb",
      symbol: curSymbols[key] || curDefSym,
    }));
  }, [data, getPointKey, pointColors, pointSymbols, localPointSymbols, defaultSymbol, localDefaultSymbol]);

  // Points rendering with accurate 0.1 to 3.0 scale and customizable Point Symbols
  const renderedPoints = useMemo(() => {
    const curSymbols = pointSymbols || localPointSymbols;
    const curDefSym = defaultSymbol || localDefaultSymbol;

    return displayData.map((d, i) => {
      const ca = d._calc?.meqPerc?.Ca ?? 0;
      const mg = d._calc?.meqPerc?.Mg ?? 0;
      const nak = (d._calc?.meqPerc?.Na ?? 0) + (d._calc?.meqPerc?.K ?? 0);
      const cl = d._calc?.meqPerc?.Cl ?? 0;
      const so4 = d._calc?.meqPerc?.SO4 ?? 0;
      const hco3 = (d._calc?.meqPerc?.HCO3 ?? 0) + (d._calc?.meqPerc?.CO3 ?? 0);

      if (ca + mg + nak === 0 || cl + so4 + hco3 === 0) return null;

      // Correct Standard Arthur M. Piper (1944) Coordinates:
      // Cation Triangle:
      // Bottom-Left (0, 0) = 100% Ca
      // Top Apex (50, 50*SQRT3) = 100% Mg
      // Bottom-Right (100, 0) = 100% (Na+K)
      const xc = 0.5 * mg + nak;
      const yc = (mg * SQRT3) / 2;

      // Anion Triangle:
      // Bottom-Left (120, 0) = 100% (CO3+HCO3)
      // Top Apex (170, 50*SQRT3) = 100% SO4
      // Bottom-Right (220, 0) = 100% Cl
      const xa = 120 + cl + 0.5 * so4;
      const ya = (so4 * SQRT3) / 2;

      // Central Diamond:
      // Ray from Cations (slope +SQRT3 through (xc, yc)) meets
      // Ray from Anions (slope -SQRT3 through (xa, ya))
      const pCat = ca + mg;
      const pAn = so4 + cl;
      const xd = 110 - 0.5 * pCat + 0.5 * pAn;
      const yd = 10 * SQRT3 + 0.5 * SQRT3 * pCat + 0.5 * SQRT3 * pAn;

      const key = getPointKey(d);
      const color = pointColors[key] || "#2563eb";
      const sym = curSymbols[key] || curDefSym;

      // Radius directly obeys localPointSize (0.1 to 3.0)
      const baseMult = pointSizes && pointSizes[key] ? (pointSizes[key] / 1.3) : 1;
      const radius = Math.max(0.1, Math.min(5, Number((localPointSize * baseMult).toFixed(2))));

      const stateStr = stateHeader ? d[stateHeader] : d.State || d.STATE;
      const locNameStr = d._calc?.locName || d.Location || d.LOCATION || d.Site || `Loc #${i + 1}`;
      const tip = `${locNameStr}\nFacies: ${d._calc.facies}` + (stateStr ? `\nState: ${stateStr}` : "");

      const bubbleId = `bubble-${String(color).replace(/#/g, "")}`;
      const fillValue = is3d ? `url(#${bubbleId})` : color;
      const strokeVal = is3d ? "rgba(255,255,255,0.4)" : darkenColor(color, 25);
      const strokeW = radius < 0.6 ? 0.15 : 0.28;

      const isHighlighted = activeHoverPoint === i || showProjectionLines;

      return (
        <g
          key={i}
          className="cursor-pointer transition-opacity"
          onPointerEnter={() => setActiveHoverPoint(i)}
          onPointerLeave={() => setActiveHoverPoint(null)}
        >
          {/* Exact Piper Projection Rays into Central Diamond */}
          {isHighlighted && (
            <g className="projection-rays" pointerEvents="none">
              <line
                x1={tx(xc)}
                y1={ty(yc)}
                x2={tx(xd)}
                y2={ty(yd)}
                stroke={color}
                strokeWidth={activeHoverPoint === i ? "1.2" : "0.75"}
                strokeDasharray="2 1.5"
                opacity={activeHoverPoint === i ? 0.95 : 0.45}
              />
              <line
                x1={tx(xa)}
                y1={ty(ya)}
                x2={tx(xd)}
                y2={ty(yd)}
                stroke={color}
                strokeWidth={activeHoverPoint === i ? "1.2" : "0.75"}
                strokeDasharray="2 1.5"
                opacity={activeHoverPoint === i ? 0.95 : 0.45}
              />
            </g>
          )}
          <PointSymbolShape
            cx={tx(xc)}
            cy={ty(yc)}
            r={activeHoverPoint === i ? radius * 1.35 : radius}
            symbol={sym}
            fill={fillValue}
            stroke={strokeVal}
            strokeWidth={strokeW}
            is3d={is3d}
            title={tip}
          />
          <PointSymbolShape
            cx={tx(xa)}
            cy={ty(ya)}
            r={activeHoverPoint === i ? radius * 1.35 : radius}
            symbol={sym}
            fill={fillValue}
            stroke={strokeVal}
            strokeWidth={strokeW}
            is3d={is3d}
            title={tip}
          />
          <PointSymbolShape
            cx={tx(xd)}
            cy={ty(yd)}
            r={activeHoverPoint === i ? radius * 1.35 : radius}
            symbol={sym}
            fill={fillValue}
            stroke={strokeVal}
            strokeWidth={strokeW}
            is3d={is3d}
            title={tip}
          />
          {showLocationLabels && (
            <text
              x={tx(xd) + radius + 1.2}
              y={ty(yd) + 1.2}
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
  }, [displayData, pointColors, pointSizes, getPointKey, stateHeader, SQRT3, is3d, localPointSize, showLocationLabels, pointSymbols, localPointSymbols, defaultSymbol, localDefaultSymbol, activeHoverPoint, showProjectionLines]);

  // Apply Reference Template Preset from Attached Image
  const applyReferenceTemplate = () => {
    setActiveTemplate("reference");
    setLegendConfig(DEFAULT_PIPER_LEGEND_CONFIG);
    setLegendPos(DEFAULT_LEGEND_POS);
    setBorderConfig({
      show: true,
      color: "#2d2711",
      thickness: 3.5,
      style: "solid",
      radius: 0,
      padding: 8
    });
    setTitlePos(DEFAULT_TITLE_POS);
    setShowTicks(true);
    handlePointSizeChange(0.8);
    setSimpleTitleConfig({
      text: `${defaultLine1}\n${defaultLine2}`,
      size: 9.5,
      color: "#0000cc",
      isBold: true,
      isItalic: false,
      fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
      alignment: "center",
    });
    setLabels(defaultLabels);
  };

  // Render Title Element (Supports 1 line or 2 lines using <tspan>, flat crisp typography)
  const renderTitle = (targetSvg: SVGSVGElement | null) => {
    const lines = (simpleTitleConfig.text || "").split("\n");
    const anchor = simpleTitleConfig.alignment === "left" ? "start" : simpleTitleConfig.alignment === "right" ? "end" : "middle";
    return (
      <g
        transform={`translate(${titlePos.x}, ${titlePos.y})`}
        style={{
          cursor: isDraggingTitle ? "grabbing" : "grab",
          userSelect: "none",
        }}
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
          fontFamily={simpleTitleConfig.fontFamily || "'Playfair Display', Georgia, serif"}
          style={{ cursor: "pointer" }}
        >
          {lines.map((line, idx) => (
            <tspan
              key={idx}
              x={0}
              dy={idx === 0 ? 0 : simpleTitleConfig.size * 1.3}
            >
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  };

  // Render In-Chart Legend Box (Supports 1, 2, 3, 4 columns, outer boundary color/thickness, no boundary, fonts, and full names without truncation)
  const renderInChartLegend = (targetSvg: SVGSVGElement | null) => {
    if (!legendConfig.show || legendConfig.style !== "in-chart" || activeLegendItems.length === 0) return null;
    const cols = legendConfig.columns || 1;
    
    // Dynamic column width calculation to display FULL names without truncation
    const maxTextLen = Math.max(...activeLegendItems.map((it) => it.label.length), 6);
    const charWidth = legendConfig.fontSize * 0.58;
    const symbolSpace = Math.max(7, legendConfig.fontSize * 1.5) + 3;
    const neededColWidth = Math.ceil(maxTextLen * charWidth + symbolSpace + 5);
    const minColWidth = cols === 1 ? 88 : cols === 2 ? 65 : cols === 3 ? 52 : 44;
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
          const displayLabel = it.label; // Full name, no dots!
          const bubbleId = `bubble-${String(it.color).replace(/#/g, "")}`;
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
                {displayLabel}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div className="bg-transparent p-2 sm:p-5 flex flex-col items-center w-full transition-colors duration-300 relative group">
      {/* Unified Studio Toolbar with 7 templates, white bg / transparent download options, title editor */}
      <div className="w-full max-w-[1860px] mb-3 relative z-30">
        <DiagramToolbarStudio
          currentTheme={currentTheme}
          onThemeChange={setCurrentTheme}
          onExport={handleExport}
          isCropActive={isCropActive}
          onToggleCrop={() => setIsCropActive(!isCropActive)}
          titleConfig={simpleTitleConfig}
          onOpenTitleEditor={() => setIsTitleModalOpen(true)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(true)}
          activeSpatialText={activeSpatialText}
          pointSize={localPointSize}
          onPointSizeChange={handlePointSizeChange}
          diagramScale={diagramScale}
          onDiagramScaleChange={setDiagramScale}
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
          {/* Ultra HD Indicator Badge */}
          <div className="flex items-center gap-1 bg-gradient-to-r from-amber-500/10 to-indigo-500/10 px-2 py-1 rounded-xl border border-indigo-200 text-indigo-900 shadow-2xs text-xs font-black">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-xs" />
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-950">Ultra HD (4K)</span>
          </div>
          {/* Projection Rays (Interpolation) Toggle */}
          <button
            onClick={() => setShowProjectionLines((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-2xs ${
              showProjectionLines
                ? "bg-purple-600 text-white border-purple-700 shadow-md"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
            title="Toggle Arthur M. Piper Geometric Projection Rays from Lower Triangles to Central Diamond"
          >
            <i className="ph ph-git-merge text-xs"></i>
            <span>Projection Rays: {showProjectionLines ? "ON" : "OFF"}</span>
          </button>

          {/* Reference Template Preset */}
          <button
            onClick={applyReferenceTemplate}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs border ${
              activeTemplate === "reference"
                ? "bg-emerald-600 text-white border-emerald-700"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
            title="Publication Standard Template matching reference image"
          >
            <span>★ Image Reference</span>
          </button>

          {/* Format Legend Studio */}
          <button
            onClick={() => setEditingLegend(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-black flex items-center gap-1 shadow-2xs transition-all"
            title="Format Legend Box (Border, Fonts, Columns)"
          >
            <i className="ph ph-paint-brush-broad text-xs"></i>
            <span>Legend Box</span>
          </button>

          {/* Quick 1, 2, 3, 4 Columns */}
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-0.5 border border-slate-200" title="Legend in 1, 2, 3 or 4 Columns">
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
            title="Toggle Legend Box Outer Boundary (None / Borderless)"
          >
            <span>{!legendConfig.showBorder ? "No Boundary" : "Boundary: ON"}</span>
          </button>

          {/* Point Symbols Button */}
          <button
            onClick={() => setEditingSymbols(true)}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs"
            title="Point Symbols & Shapes Formatting"
          >
            <PointSymbolIcon
              symbol={defaultSymbol || localDefaultSymbol}
              color="#4f46e5"
              size={13}
              stroke="#ffffff"
            />
            <span>Point Symbols</span>
          </button>

          {/* Cycle Legend Style */}
          <button
            onClick={() =>
              setLegendConfig((prev) => ({
                ...prev,
                style: prev.style === "in-chart" ? "bottom" : prev.style === "bottom" ? "none" : "in-chart",
                show: prev.style === "none" ? true : prev.show,
              }))
            }
            className="bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 shadow-2xs transition-all"
            title="Switch Legend Position: In-Chart Box -> Bottom Strip -> Off"
          >
            {legendConfig.style === "in-chart" ? "In-Chart" : legendConfig.style === "bottom" ? "Bottom" : "Legend Off"}
          </button>

          {/* Diagram Area Margin / Legend Room controller */}
          <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-xl border border-slate-200 shadow-2xs" title="Adjust Map/Chart Area Space">
            <span className="text-[9.5px] font-black uppercase text-slate-500 tracking-wider">Area:</span>
            {[
              { label: "Normal", pad: 15 },
              { label: "Spacious", pad: 35 },
              { label: "Wide", pad: 65 },
              { label: "Max", pad: 95 }
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

      {/* Mouse Drag Hint Badge */}
      <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3 py-1 rounded-xl border border-emerald-200 text-[10px] font-extrabold mb-1">
        <i className="ph ph-hand-grabbing text-sm"></i>
        <span>Mouse Drag Active: Click & drag Title, Legend box, or Axis labels anywhere on the chart</span>
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
          title="Piper Legend Box Formatting Studio"
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
          title="Piper Point Symbol & Marker Studio"
          subtitle="Configure distinct shapes for locations, districts, or categories for the selected filter"
        />
      )}

      {/* Simple Title Editor Modal */}
      <SimpleTitleEditorModal
        isOpen={isTitleModalOpen}
        config={simpleTitleConfig}
        onChange={setSimpleTitleConfig}
        onClose={() => setIsTitleModalOpen(false)}
        title="Format Piper Diagram Title"
      />

      {/* Axis Label Editor Modal */}
      {selectedLabel && labels[selectedLabel] && (
        <UsslLabelsEditor
          config={{
            text: labels[selectedLabel]!.text,
            size: labels[selectedLabel]!.fontSize,
            color: labels[selectedLabel]!.color || "#64748b",
            isBold: labels[selectedLabel]!.isBold,
            isItalic: labels[selectedLabel]!.isItalic,
            fontFamily: labels[selectedLabel]!.fontFamily || "sans-serif",
          }}
          onChange={(newConf) =>
            setLabels((p) => ({
              ...p,
              [selectedLabel]: {
                ...p[selectedLabel]!,
                text: newConf.text,
                fontSize: newConf.size,
                color: newConf.color,
                isBold: newConf.isBold,
                isItalic: newConf.isItalic,
                fontFamily: newConf.fontFamily,
              },
            }))
          }
          onClose={() => setSelectedLabel(null)}
        />
      )}

      {/* Border Frame Studio Modal */}
      {editingBorder && (
        <DiagramBorderEditor
          config={borderConfig}
          onChange={setBorderConfig}
          onClose={() => setEditingBorder(false)}
          title="Piper Diagram Border Frame Studio"
          onStartInteractiveAdjust={() => setIsAdjustingBorder(true)}
        />
      )}

      {/* Move & Fit Border Mode Floating Banner */}
      {isAdjustingBorder && (
        <div className="w-full max-w-[1860px] mb-2 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-bold shadow-md animate-in slide-in-from-top-2 border border-amber-600 z-30">
          <div className="flex items-center gap-2">
            <Move className="w-4 h-4 animate-bounce" />
            <span>
              <strong>Move &amp; Fit Border Active:</strong> Drag corners, edges, or the frame on the diagram to fit content.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsAdjustingBorder(false)}
            className="bg-slate-900 text-white px-3 py-1 rounded-xl text-xs font-black shadow-xs hover:bg-black transition cursor-pointer"
          >
            ✓ Done
          </button>
        </div>
      )}

      {/* Tile 2: Main Chart Tile (Pure white background, 50% enlarged Ultra HD canvas) */}
      <div
        id="piper-chart-export"
        className={`flex flex-col items-center justify-center w-full max-w-[1860px] bg-white transition-all relative z-10 rounded-3xl p-3 sm:p-6 shadow-xs border border-slate-200/70 ${PAGE_ORIENTATION_CONFIGS[pageOrientation].className}`}
        style={{
          minHeight: `${Math.round(620 * (diagramScale || 1.5))}px`,
        }}
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
            <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-amber-500 border border-white rounded-full cursor-nwse-resize z-[1510]" />
            <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-500 border border-white rounded-full cursor-nesw-resize z-[1510]" />
            <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-amber-500 border border-white rounded-full cursor-nesw-resize z-[1510]" />
            <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-amber-500 border border-white rounded-full cursor-nwse-resize z-[1510]" />
            <div className="absolute top-2 left-2 bg-amber-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow uppercase tracking-wider">
              Crop Area: {Math.round(cropBox.width)} × {Math.round(cropBox.height)}
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`${-25 - diagramPadding} ${-25 - diagramPadding} ${540 + diagramPadding * 2} ${315 + diagramPadding * 2}`}
          className="w-full h-auto overflow-visible transition-all duration-200"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
          style={{
            width: `${Math.round((diagramScale || 1.5) * 100)}%`,
            maxWidth: "100%",
            maxHeight: `${Math.round(960 * (diagramScale || 1.5))}px`,
            minHeight: "560px",
            fontFamily: "'Inter', sans-serif",
            touchAction: "none",
            textRendering: "geometricPrecision",
            shapeRendering: "geometricPrecision",
          }}
          onClick={() => {
            if (!isDraggingTitle && !isDraggingLegend && !draggedLabel) {
              setSelectedLabel(null);
            }
          }}
        >
          {/* Pure White SVG Background Rect */}
          <rect
            id="diagram-base-canvas-bg"
            x={-25 - diagramPadding}
            y={-25 - diagramPadding}
            width={540 + diagramPadding * 2}
            height={315 + diagramPadding * 2}
            fill="#ffffff"
          />

          {/* Moveable & Customisable Outer Frame Border */}
          <DiagramBorderFrame
            baseX={-25 - diagramPadding}
            baseY={-25 - diagramPadding}
            baseWidth={540 + diagramPadding * 2}
            baseHeight={315 + diagramPadding * 2}
            config={borderConfig}
            isInteractive={isAdjustingBorder}
            onConfigChange={setBorderConfig}
            svgRef={svgRef}
            idPrefix="piper"
          />

          <defs>
            <filter id="glass-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="1.5" dy="3.5" stdDeviation="2" floodColor="#1e293b" floodOpacity="0.16" />
            </filter>
            <linearGradient id="cation-glass" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#eff6ff" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="anion-glass" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fff1f2" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ffe4e6" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="diamond-glass" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f5f3ff" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#e0e7ff" stopOpacity="0.8" />
            </linearGradient>

            {/* Dynamic 3D Spherical Radial Gradients for Point Colors */}
            {Array.from(new Set([...Object.values(pointColors || {}), ...activeLegendItems.map((it) => it.color), "#2563eb", "#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b", "#059669", "#dc2626"]))
              .filter((c): c is string => typeof c === "string" && !!c)
              .map((color) => {
                const id = `bubble-${color.replace(/#/g, "")}`;
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
          </defs>

          {/* Sub-facies zones divider lines (matching standard hydrochemistry & reference image) */}
          <line x1={tx(25)} y1={ty(H / 2)} x2={tx(75)} y2={ty(H / 2)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />
          <line x1={tx(25)} y1={ty(H / 2)} x2={tx(50)} y2={ty(0)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />
          <line x1={tx(75)} y1={ty(H / 2)} x2={tx(50)} y2={ty(0)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />

          <line x1={tx(145)} y1={ty(H / 2)} x2={tx(195)} y2={ty(H / 2)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />
          <line x1={tx(145)} y1={ty(H / 2)} x2={tx(170)} y2={ty(0)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />
          <line x1={tx(195)} y1={ty(H / 2)} x2={tx(170)} y2={ty(0)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />

          <line x1={tx(85)} y1={ty(85 * SQRT3)} x2={tx(135)} y2={ty(85 * SQRT3)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />
          <line x1={tx(85)} y1={ty(35 * SQRT3)} x2={tx(135)} y2={ty(35 * SQRT3)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />
          <line x1={tx(85)} y1={ty(85 * SQRT3)} x2={tx(110)} y2={ty(60 * SQRT3)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />
          <line x1={tx(135)} y1={ty(85 * SQRT3)} x2={tx(110)} y2={ty(60 * SQRT3)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />
          <line x1={tx(85)} y1={ty(35 * SQRT3)} x2={tx(110)} y2={ty(60 * SQRT3)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />
          <line x1={tx(135)} y1={ty(35 * SQRT3)} x2={tx(110)} y2={ty(60 * SQRT3)} stroke={frameColor} strokeWidth="1.2" opacity="0.5" shapeRendering="geometricPrecision" />

          {/* Grids */}
          <g>{grids}</g>

          {/* Boundaries */}
          <path 
            d={`M ${tx(0)} ${ty(0)} L ${tx(100)} ${ty(0)} L ${tx(50)} ${ty(H)} Z`} 
            stroke={frameColor} 
            strokeWidth={outerLineWidth} 
            fill={is3d ? "url(#cation-glass)" : "none"} 
            filter={is3d ? "url(#glass-shadow)" : undefined}
            strokeLinejoin="round" 
            shapeRendering="geometricPrecision"
          />
          <path 
            d={`M ${tx(120)} ${ty(0)} L ${tx(220)} ${ty(0)} L ${tx(170)} ${ty(H)} Z`} 
            stroke={frameColor} 
            strokeWidth={outerLineWidth} 
            fill={is3d ? "url(#anion-glass)" : "none"} 
            filter={is3d ? "url(#glass-shadow)" : undefined}
            strokeLinejoin="round" 
            shapeRendering="geometricPrecision"
          />
          <path 
            d={`M ${tx(110)} ${ty(10 * SQRT3)} L ${tx(160)} ${ty(60 * SQRT3)} L ${tx(110)} ${ty(110 * SQRT3)} L ${tx(60)} ${ty(60 * SQRT3)} Z`} 
            stroke={frameColor} 
            strokeWidth={outerLineWidth} 
            fill={is3d ? "url(#diamond-glass)" : "none"} 
            filter={is3d ? "url(#glass-shadow)" : undefined}
            strokeLinejoin="round" 
            shapeRendering="geometricPrecision"
          />

          {/* Ticks and Scale Numbers */}
          {ticks}

          {/* Chemical Axis Labels (Movable by mouse) */}
          {(Object.entries(labels) as [string, LabelItem][]).map(([key, l]) => (
            <text
              key={key}
              transform={`translate(${l.x}, ${l.y}) rotate(${l.rotate})`}
              textAnchor={l.align}
              fontSize={l.fontSize || 6.5}
              fontWeight={l.isBold ? "bold" : "normal"}
              fontStyle={l.isItalic ? "italic" : "normal"}
              fontFamily={l.fontFamily || "'Playfair Display', Georgia, serif"}
              fill={selectedLabel === key ? "#2563eb" : l.color || "#1e293b"}
              onPointerDown={(e) => handleLabelPointerDown(e, key, svgRef.current)}
              onClick={(e) => {
                if (!draggedLabel) {
                  e.stopPropagation();
                  setSelectedLabel(key);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedLabel(key);
              }}
              style={{
                cursor: draggedLabel === key ? "grabbing" : "pointer",
                userSelect: "none",
                touchAction: "none"
              }}
            >
              {l.text}
            </text>
          ))}

          {/* Plotted Data Points */}
          {renderedPoints}

          {/* In-Chart Legend Box (Movable by mouse) */}
          {renderInChartLegend(svgRef.current)}

          {/* Chart Title (1 or 2 lines, Movable by mouse) */}
          {renderTitle(svgRef.current)}
        </svg>
      </div>

      {/* Tile 3: Dedicated Publication Legend Tile (if legend is selected) */}
      {showLegendTile && activeLegendItems.length > 0 && (
        <div className="w-full max-w-[1860px] mt-4 bg-white border border-slate-200/80 shadow-xs rounded-2xl p-4 transition-all">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                Piper Diagram Active Variables Legend
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

      {/* Full Screen Modal View */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-7xl max-h-[94vh] flex flex-col relative">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 mb-3 gap-2">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <i className="ph ph-corners-out text-lg text-indigo-600 animate-pulse"></i>
                  Piper Trilinear Diagram (Full Screen Ultra HD Explorer)
                </h3>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase mt-0.5">
                  Ultra HD Presentation Mode &bull; Drag Title and Legend Anywhere by Mouse
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl px-2.5 py-1.5 border border-slate-200 shadow-2xs">
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
                    onClick={() => handleExport("jpeg", false, 6.0, "piper-chart-export-fs")}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                    title="Download Ultra HD 4K JPEG with pure white background"
                  >
                    <i className="ph ph-camera text-base"></i>
                    <span>Ultra HD JPEG</span>
                  </button>
                  <button
                    onClick={() => handleExport("png", true, 6.0, "piper-chart-export-fs")}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border border-slate-200 cursor-pointer"
                    title="Download Transparent Ultra HD 4K PNG without background"
                  >
                    <i className="ph ph-image text-base"></i>
                    <span>Ultra HD PNG</span>
                  </button>
                </div>
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="bg-slate-100 text-slate-600 hover:bg-rose-600 hover:text-white p-2 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer"
                  title="Close Full Screen"
                >
                  <i className="ph ph-x text-lg font-bold"></i>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-2 min-h-[420px]">
              <div
                id="piper-chart-export-fs"
                className="flex flex-col items-center justify-center w-full max-w-[1860px] bg-white transition-all relative rounded-3xl p-4 shadow-sm"
              >
                <svg
                  ref={fullscreenSvgRef}
                  viewBox={`${-25 - diagramPadding} ${-25 - diagramPadding} ${540 + diagramPadding * 2} ${315 + diagramPadding * 2}`}
                  className="w-full h-auto max-h-[82vh] overflow-visible"
                  shapeRendering="geometricPrecision"
                  textRendering="geometricPrecision"
                  style={{ fontFamily: "'Inter', sans-serif", touchAction: "none", textRendering: "geometricPrecision", shapeRendering: "geometricPrecision" }}
                >
                  {/* Pure White Base Background Rect */}
                  <rect
                    id="diagram-base-canvas-bg"
                    x={-25 - diagramPadding}
                    y={-25 - diagramPadding}
                    width={540 + diagramPadding * 2}
                    height={315 + diagramPadding * 2}
                    fill="#ffffff"
                  />
                  {borderConfig.show && borderConfig.style !== "none" && borderConfig.thickness > 0 && (
                    <rect
                      x={-25 - diagramPadding + borderConfig.padding}
                      y={-25 - diagramPadding + borderConfig.padding}
                      width={540 + diagramPadding * 2 - borderConfig.padding * 2}
                      height={315 + diagramPadding * 2 - borderConfig.padding * 2}
                      fill="none"
                      stroke={borderConfig.color}
                      strokeWidth={borderConfig.thickness}
                      strokeDasharray={
                        borderConfig.style === "dashed"
                          ? "7 4"
                          : borderConfig.style === "dotted"
                          ? "2.5 2.5"
                          : undefined
                      }
                      rx={borderConfig.radius}
                      pointerEvents="none"
                    />
                  )}

                  <defs>
                    {is3d && (
                      <>
                        <filter id="glass-shadow-fs" x="-20%" y="-20%" width="140%" height="140%">
                          <feDropShadow dx="1.5" dy="3.5" stdDeviation="2" floodColor="#1e293b" floodOpacity="0.16" />
                        </filter>
                        {Array.from(new Set([...Object.values(pointColors || {}), ...activeLegendItems.map((it) => it.color), "#2563eb", "#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"]))
                          .filter((c): c is string => typeof c === "string" && !!c)
                          .map((color) => {
                            const id = `bubble-${color.replace(/#/g, "")}`;
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
                  <line x1={tx(25)} y1={ty(H / 2)} x2={tx(75)} y2={ty(H / 2)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />
                  <line x1={tx(25)} y1={ty(H / 2)} x2={tx(50)} y2={ty(0)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />
                  <line x1={tx(75)} y1={ty(H / 2)} x2={tx(50)} y2={ty(0)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />

                  <line x1={tx(145)} y1={ty(H / 2)} x2={tx(195)} y2={ty(H / 2)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />
                  <line x1={tx(145)} y1={ty(H / 2)} x2={tx(170)} y2={ty(0)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />
                  <line x1={tx(195)} y1={ty(H / 2)} x2={tx(170)} y2={ty(0)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />

                  <line x1={tx(85)} y1={ty(85 * SQRT3)} x2={tx(135)} y2={ty(85 * SQRT3)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />
                  <line x1={tx(85)} y1={ty(35 * SQRT3)} x2={tx(135)} y2={ty(35 * SQRT3)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />
                  <line x1={tx(85)} y1={ty(85 * SQRT3)} x2={tx(110)} y2={ty(60 * SQRT3)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />
                  <line x1={tx(135)} y1={ty(85 * SQRT3)} x2={tx(110)} y2={ty(60 * SQRT3)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />
                  <line x1={tx(85)} y1={ty(35 * SQRT3)} x2={tx(110)} y2={ty(60 * SQRT3)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />
                  <line x1={tx(135)} y1={ty(35 * SQRT3)} x2={tx(110)} y2={ty(60 * SQRT3)} stroke={frameColor} strokeWidth="1.1" opacity="0.45" />

                  <g>{grids}</g>

                  <path d={`M ${tx(0)} ${ty(0)} L ${tx(100)} ${ty(0)} L ${tx(50)} ${ty(H)} Z`} stroke={frameColor} strokeWidth={outerLineWidth} fill="none" strokeLinejoin="round" shapeRendering="geometricPrecision" />
                  <path d={`M ${tx(120)} ${ty(0)} L ${tx(220)} ${ty(0)} L ${tx(170)} ${ty(H)} Z`} stroke={frameColor} strokeWidth={outerLineWidth} fill="none" strokeLinejoin="round" shapeRendering="geometricPrecision" />
                  <path d={`M ${tx(110)} ${ty(10 * SQRT3)} L ${tx(160)} ${ty(60 * SQRT3)} L ${tx(110)} ${ty(110 * SQRT3)} L ${tx(60)} ${ty(60 * SQRT3)} Z`} stroke={frameColor} strokeWidth={outerLineWidth} fill="none" strokeLinejoin="round" shapeRendering="geometricPrecision" />

                  {ticks}

                  {(Object.entries(labels) as [string, LabelItem][]).map(([key, l]) => (
                    <text
                      key={key}
                      transform={`translate(${l.x}, ${l.y}) rotate(${l.rotate})`}
                      textAnchor={l.align}
                      fontSize={l.fontSize || 6.5}
                      fontWeight={l.isBold ? "bold" : "normal"}
                      fontStyle={l.isItalic ? "italic" : "normal"}
                      fontFamily={l.fontFamily || "'Playfair Display', Georgia, serif"}
                      fill={l.color || "#1e293b"}
                    >
                      {l.text}
                    </text>
                  ))}

                  {renderedPoints}
                  {renderInChartLegend(fullscreenSvgRef.current)}
                  {renderTitle(fullscreenSvgRef.current)}
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default PiperDiagram;
