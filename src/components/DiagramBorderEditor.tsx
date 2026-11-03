import React from "react";
import {
  Square,
  Check,
  X,
  Palette,
  Sliders,
  Sparkles,
  Move,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";

export interface DiagramBorderConfig {
  show: boolean; // "no border line" facility
  color: string;
  thickness: number; // 0.5 to 12 px
  style: "solid" | "dashed" | "dotted" | "double" | "none";
  radius: number; // 0 to 32 px (0 = sharp square like reference image)
  padding: number; // 4 to 32 px (fallback base padding)
  // Individual 4-side customizable insets to move border to fit content:
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  // Whole frame position translation:
  offsetX?: number;
  offsetY?: number;
}

export const DEFAULT_PIPER_BORDER_CONFIG: DiagramBorderConfig = {
  show: true,
  color: "#2d2711", // Deep bronze from user reference image image_bea40049.png
  thickness: 3.5,
  style: "solid",
  radius: 0,
  padding: 8,
  paddingTop: 8,
  paddingBottom: 8,
  paddingLeft: 8,
  paddingRight: 8,
  offsetX: 0,
  offsetY: 0,
};

export function computeBorderRect(
  baseX: number,
  baseY: number,
  baseWidth: number,
  baseHeight: number,
  config: DiagramBorderConfig
): { x: number; y: number; width: number; height: number } {
  const pTop = config.paddingTop !== undefined ? config.paddingTop : config.padding;
  const pBottom = config.paddingBottom !== undefined ? config.paddingBottom : config.padding;
  const pLeft = config.paddingLeft !== undefined ? config.paddingLeft : config.padding;
  const pRight = config.paddingRight !== undefined ? config.paddingRight : config.padding;
  const offX = config.offsetX || 0;
  const offY = config.offsetY || 0;

  const x = baseX + pLeft + offX;
  const y = baseY + pTop + offY;
  const width = Math.max(30, baseWidth - pLeft - pRight);
  const height = Math.max(30, baseHeight - pTop - pBottom);

  return { x, y, width, height };
}

// ============================================================================
// DIAGRAM BORDER FRAME COMPONENT (Native SVG with Interactive Drag Handles)
// ============================================================================
export interface DiagramBorderFrameProps {
  baseX: number;
  baseY: number;
  baseWidth: number;
  baseHeight: number;
  config: DiagramBorderConfig;
  isInteractive?: boolean;
  onConfigChange?: (cfg: DiagramBorderConfig) => void;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  idPrefix?: string;
}

export const DiagramBorderFrame: React.FC<DiagramBorderFrameProps> = ({
  baseX,
  baseY,
  baseWidth,
  baseHeight,
  config,
  isInteractive = false,
  onConfigChange,
  svgRef,
  idPrefix = "diagram",
}) => {
  if (!config.show || config.style === "none" || config.thickness <= 0) {
    return null;
  }

  const { x, y, width, height } = computeBorderRect(
    baseX,
    baseY,
    baseWidth,
    baseHeight,
    config
  );

  const handlePointerDown = (
    e: React.PointerEvent<any>,
    handle: "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se" | "move"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!svgRef?.current || !onConfigChange) return;

    const targetSvg = svgRef.current;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialCfg = { ...config };
    const initialTop =
      initialCfg.paddingTop !== undefined ? initialCfg.paddingTop : initialCfg.padding;
    const initialBottom =
      initialCfg.paddingBottom !== undefined ? initialCfg.paddingBottom : initialCfg.padding;
    const initialLeft =
      initialCfg.paddingLeft !== undefined ? initialCfg.paddingLeft : initialCfg.padding;
    const initialRight =
      initialCfg.paddingRight !== undefined ? initialCfg.paddingRight : initialCfg.padding;
    const initialOffX = initialCfg.offsetX || 0;
    const initialOffY = initialCfg.offsetY || 0;

    const onPointerMove = (moveEv: PointerEvent) => {
      moveEv.preventDefault();
      const ctm = targetSvg.getScreenCTM();
      if (!ctm) return;
      const dx = (moveEv.clientX - startClientX) / ctm.a;
      const dy = (moveEv.clientY - startClientY) / ctm.d;

      const newCfg: DiagramBorderConfig = { ...initialCfg };

      if (handle === "move") {
        newCfg.offsetX = Math.round(initialOffX + dx);
        newCfg.offsetY = Math.round(initialOffY + dy);
      } else {
        if (handle.includes("n")) {
          newCfg.paddingTop = Math.round(initialTop + dy);
        }
        if (handle.includes("s")) {
          newCfg.paddingBottom = Math.round(initialBottom - dy);
        }
        if (handle.includes("w")) {
          newCfg.paddingLeft = Math.round(initialLeft + dx);
        }
        if (handle.includes("e")) {
          newCfg.paddingRight = Math.round(initialRight - dx);
        }
      }
      onConfigChange(newCfg);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleSz = 6.0;

  return (
    <g id={`${idPrefix}-outer-frame-border-group`}>
      {/* Pristine Border Graphic */}
      {config.style === "double" ? (
        <g pointerEvents="none">
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="none"
            stroke={config.color}
            strokeWidth={Math.max(1, config.thickness * 0.45)}
            rx={config.radius}
          />
          <rect
            x={x + config.thickness * 1.4}
            y={y + config.thickness * 1.4}
            width={Math.max(0, width - config.thickness * 2.8)}
            height={Math.max(0, height - config.thickness * 2.8)}
            fill="none"
            stroke={config.color}
            strokeWidth={Math.max(0.8, config.thickness * 0.35)}
            rx={Math.max(0, config.radius - 2)}
          />
        </g>
      ) : (
        <rect
          id="diagram-outer-frame-border"
          x={x}
          y={y}
          width={width}
          height={height}
          fill="none"
          stroke={config.color}
          strokeWidth={config.thickness}
          strokeDasharray={
            config.style === "dashed"
              ? "7 4"
              : config.style === "dotted"
              ? "2.5 2.5"
              : undefined
          }
          rx={config.radius}
          pointerEvents="none"
        />
      )}

      {/* Interactive Drag & Resize Overlay (Active when user clicks "Move/Fit Border") */}
      {isInteractive && (
        <g className="border-drag-layer" style={{ touchAction: "none" }}>
          {/* Faint blue highlight guide */}
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="1.2"
            strokeDasharray="4 3"
            opacity="0.8"
            pointerEvents="none"
          />

          {/* Central Move Zone (Click anywhere near border edges to translate whole frame) */}
          <rect
            x={x + 10}
            y={y + 10}
            width={Math.max(10, width - 20)}
            height={Math.max(10, height - 20)}
            fill="transparent"
            cursor="move"
            onPointerDown={(e) => handlePointerDown(e, "move")}
          />

          {/* Top Center Move Pill Badge */}
          <g
            transform={`translate(${x + width / 2}, ${y - 4})`}
            cursor="move"
            onPointerDown={(e) => handlePointerDown(e, "move")}
          >
            <rect
              x="-48"
              y="-12"
              width="96"
              height="15"
              rx="4"
              fill="#1e293b"
              stroke="#ffffff"
              strokeWidth="0.8"
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
            />
            <text
              x="0"
              y="-2.5"
              fill="#ffffff"
              fontSize="6.5"
              fontWeight="bold"
              textAnchor="middle"
              pointerEvents="none"
            >
              ✥ Drag Frame
            </text>
          </g>

          {/* 8 Resizing Handles (NW, N, NE, E, SE, S, SW, W) */}
          {/* North (Top) */}
          <rect
            x={x + width / 2 - handleSz / 2}
            y={y - handleSz / 2}
            width={handleSz}
            height={handleSz}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="1.2"
            cursor="ns-resize"
            rx="1.5"
            onPointerDown={(e) => handlePointerDown(e, "n")}
          />
          {/* South (Bottom) */}
          <rect
            x={x + width / 2 - handleSz / 2}
            y={y + height - handleSz / 2}
            width={handleSz}
            height={handleSz}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="1.2"
            cursor="ns-resize"
            rx="1.5"
            onPointerDown={(e) => handlePointerDown(e, "s")}
          />
          {/* West (Left) */}
          <rect
            x={x - handleSz / 2}
            y={y + height / 2 - handleSz / 2}
            width={handleSz}
            height={handleSz}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="1.2"
            cursor="ew-resize"
            rx="1.5"
            onPointerDown={(e) => handlePointerDown(e, "w")}
          />
          {/* East (Right) */}
          <rect
            x={x + width - handleSz / 2}
            y={y + height / 2 - handleSz / 2}
            width={handleSz}
            height={handleSz}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="1.2"
            cursor="ew-resize"
            rx="1.5"
            onPointerDown={(e) => handlePointerDown(e, "e")}
          />
          {/* North-West (Top-Left) */}
          <rect
            x={x - handleSz / 2}
            y={y - handleSz / 2}
            width={handleSz}
            height={handleSz}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="1.4"
            cursor="nwse-resize"
            rx="1.5"
            onPointerDown={(e) => handlePointerDown(e, "nw")}
          />
          {/* North-East (Top-Right) */}
          <rect
            x={x + width - handleSz / 2}
            y={y - handleSz / 2}
            width={handleSz}
            height={handleSz}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="1.4"
            cursor="nesw-resize"
            rx="1.5"
            onPointerDown={(e) => handlePointerDown(e, "ne")}
          />
          {/* South-West (Bottom-Left) */}
          <rect
            x={x - handleSz / 2}
            y={y + height - handleSz / 2}
            width={handleSz}
            height={handleSz}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="1.4"
            cursor="nesw-resize"
            rx="1.5"
            onPointerDown={(e) => handlePointerDown(e, "sw")}
          />
          {/* South-East (Bottom-Right) */}
          <rect
            x={x + width - handleSz / 2}
            y={y + height - handleSz / 2}
            width={handleSz}
            height={handleSz}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="1.4"
            cursor="nwse-resize"
            rx="1.5"
            onPointerDown={(e) => handlePointerDown(e, "se")}
          />
        </g>
      )}
    </g>
  );
};

// ============================================================================
// DIAGRAM BORDER EDITOR MODAL
// ============================================================================
interface DiagramBorderEditorProps {
  config: DiagramBorderConfig;
  onChange: (cfg: DiagramBorderConfig) => void;
  onClose: () => void;
  title?: string;
  onStartInteractiveAdjust?: () => void;
}

export default function DiagramBorderEditor({
  config,
  onChange,
  onClose,
  title = "Diagram Border Frame Studio",
  onStartInteractiveAdjust,
}: DiagramBorderEditorProps) {
  const quickColors = [
    { name: "Reference Bronze", hex: "#2d2711" },
    { name: "Jet Black", hex: "#000000" },
    { name: "Charcoal Dark", hex: "#1e293b" },
    { name: "Publication Slate", hex: "#475569" },
    { name: "Royal Blue", hex: "#0000cc" },
    { name: "Crimson Maroon", hex: "#990000" },
    { name: "Forest Green", hex: "#16a34a" },
    { name: "Warm Amber", hex: "#d97706" },
    { name: "Legend Gold", hex: "#facc15" },
    { name: "Indigo Frame", hex: "#4f46e5" },
  ];

  const quickThicknesses = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0, 8.0, 10.0];

  const pTop = config.paddingTop !== undefined ? config.paddingTop : config.padding;
  const pBottom = config.paddingBottom !== undefined ? config.paddingBottom : config.padding;
  const pLeft = config.paddingLeft !== undefined ? config.paddingLeft : config.padding;
  const pRight = config.paddingRight !== undefined ? config.paddingRight : config.padding;
  const offX = config.offsetX || 0;
  const offY = config.offsetY || 0;

  const updateSide = (
    side: "top" | "bottom" | "left" | "right",
    val: number
  ) => {
    const clamped = Math.round(Math.max(-60, Math.min(180, val)));
    if (side === "top") onChange({ ...config, paddingTop: clamped });
    if (side === "bottom") onChange({ ...config, paddingBottom: clamped });
    if (side === "left") onChange({ ...config, paddingLeft: clamped });
    if (side === "right") onChange({ ...config, paddingRight: clamped });
  };

  const adjustSideDelta = (
    side: "top" | "bottom" | "left" | "right",
    delta: number
  ) => {
    if (side === "top") updateSide("top", pTop + delta);
    if (side === "bottom") updateSide("bottom", pBottom + delta);
    if (side === "left") updateSide("left", pLeft + delta);
    if (side === "right") updateSide("right", pRight + delta);
  };

  const applyPreset = (
    preset:
      | "reference"
      | "publication"
      | "double"
      | "rounded"
      | "dashed"
      | "none"
      | "fit_snug"
      | "fit_balanced"
      | "fit_spacious"
      | "reset_fit"
  ) => {
    switch (preset) {
      case "reference":
        onChange({
          ...config,
          show: true,
          style: "solid",
          thickness: 3.5,
          color: "#2d2711",
          radius: 0,
          padding: 8,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 8,
          paddingRight: 8,
          offsetX: 0,
          offsetY: 0,
        });
        break;
      case "publication":
        onChange({
          ...config,
          show: true,
          style: "solid",
          thickness: 2.0,
          color: "#000000",
          radius: 0,
          padding: 8,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 8,
          paddingRight: 8,
        });
        break;
      case "double":
        onChange({
          ...config,
          show: true,
          style: "double",
          thickness: 3.5,
          color: "#2d2711",
          radius: 0,
        });
        break;
      case "rounded":
        onChange({
          ...config,
          show: true,
          style: "solid",
          thickness: 2.0,
          color: "#1e293b",
          radius: 12,
        });
        break;
      case "dashed":
        onChange({
          ...config,
          show: true,
          style: "dashed",
          thickness: 2.0,
          color: "#2d2711",
          radius: 0,
        });
        break;
      case "none":
        onChange({
          ...config,
          show: false,
          style: "none",
          thickness: 0,
        });
        break;
      case "fit_snug":
        // Snugly hugs diagram content (triangles, diamond, title, legend)
        onChange({
          ...config,
          show: true,
          paddingTop: 18,
          paddingBottom: 20,
          paddingLeft: 18,
          paddingRight: 20,
          offsetX: 0,
          offsetY: 0,
        });
        break;
      case "fit_balanced":
        onChange({
          ...config,
          show: true,
          paddingTop: 26,
          paddingBottom: 28,
          paddingLeft: 26,
          paddingRight: 26,
          offsetX: 0,
          offsetY: 0,
        });
        break;
      case "fit_spacious":
        onChange({
          ...config,
          show: true,
          paddingTop: 36,
          paddingBottom: 36,
          paddingLeft: 36,
          paddingRight: 36,
          offsetX: 0,
          offsetY: 0,
        });
        break;
      case "reset_fit":
        onChange({
          ...config,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 8,
          paddingRight: 8,
          offsetX: 0,
          offsetY: 0,
        });
        break;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2500] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[94vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shadow-2xs border border-amber-300">
              <Square className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-800">{title}</h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Move, fit, and format border lines around diagram content
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Controls */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Toggle On / Off & Interactive Canvas Drag Button */}
          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200 gap-2">
            <div>
              <span className="font-extrabold text-xs text-slate-800 block">
                Outer Frame Border
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {config.show
                  ? `Active: ${config.thickness.toFixed(1)}px ${config.style} (${config.color})`
                  : "Border disabled"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {config.show && onStartInteractiveAdjust && (
                <button
                  type="button"
                  onClick={() => {
                    onStartInteractiveAdjust();
                    onClose();
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-all flex items-center gap-1"
                  title="Enable handles on canvas to drag corners and edges freely"
                >
                  <Move className="w-3.5 h-3.5" />
                  <span>Drag on Canvas</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onChange({ ...config, show: !config.show })}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${
                  config.show
                    ? "bg-amber-600 text-white border-amber-700 shadow-xs"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                }`}
              >
                {config.show ? "Border ON" : "Border OFF"}
              </button>
            </div>
          </div>

          {/* Quick Style Presets */}
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
              1-Click Style Presets:
            </span>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
              <button
                type="button"
                onClick={() => applyPreset("reference")}
                className="py-1.5 px-1.5 rounded-xl text-[10px] font-black border transition-all text-center bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100 shadow-2xs flex items-center justify-center gap-1"
                title="Exact Deep Bronze frame matching reference image (#2d2711, 3.5px)"
              >
                <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                <span>★ Image Ref</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset("publication")}
                className="py-1.5 px-1.5 rounded-xl text-[10px] font-bold border transition-all text-center bg-white text-slate-800 border-slate-200 hover:bg-slate-50 shadow-2xs"
                title="Clean Jet Black 2.0px publication standard"
              >
                Jet Black (2px)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("double")}
                className="py-1.5 px-1.5 rounded-xl text-[10px] font-bold border transition-all text-center bg-white text-slate-800 border-slate-200 hover:bg-slate-50 shadow-2xs"
                title="Double concentric frame line"
              >
                Double Frame
              </button>
              <button
                type="button"
                onClick={() => applyPreset("rounded")}
                className="py-1.5 px-1.5 rounded-xl text-[10px] font-bold border transition-all text-center bg-white text-slate-800 border-slate-200 hover:bg-slate-50 shadow-2xs"
                title="Modern Rounded Slate Frame"
              >
                Rounded (12px)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("dashed")}
                className="py-1.5 px-1.5 rounded-xl text-[10px] font-bold border transition-all text-center bg-white text-slate-800 border-slate-200 hover:bg-slate-50 shadow-2xs"
                title="Architectural dashed line"
              >
                Dashed Line
              </button>
              <button
                type="button"
                onClick={() => applyPreset("none")}
                className="py-1.5 px-1.5 rounded-xl text-[10px] font-bold border transition-all text-center bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                title="Remove border completely"
              >
                No Border
              </button>
            </div>
          </div>

          {config.show && (
            <>
              {/* SECTION: MOVE BORDER TO FIT CONTENT */}
              <div className="bg-amber-50/50 p-3.5 rounded-2xl border border-amber-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-1.5">
                    <Move className="w-4 h-4 text-amber-700" />
                    <span className="font-extrabold text-xs text-amber-950">
                      Move Border Edges to Fit Content
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => applyPreset("fit_snug")}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-600 text-white hover:bg-amber-700 shadow-2xs transition"
                      title="Automatically fit border snugly around diagram elements"
                    >
                      ★ Auto-Fit Snug
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("fit_balanced")}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition"
                      title="Balanced margins"
                    >
                      Balanced
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("reset_fit")}
                      className="px-1.5 py-0.5 rounded-lg text-[10px] font-bold text-slate-500 hover:text-slate-800 transition"
                      title="Reset insets to default"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* 4 Directional Sliders with Steppers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white p-3 rounded-xl border border-amber-200/60">
                  {/* Top Edge */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-0.5">
                      <span className="flex items-center gap-1">
                        <ChevronUp className="w-3 h-3 text-amber-600" />
                        <span>Top Edge:</span>
                      </span>
                      <span className="font-mono text-amber-800 font-extrabold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 text-[10px]">
                        {pTop}px
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("top", -5)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Top Edge UP (-5px)"
                      >
                        -5
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("top", -1)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Top Edge UP (-1px)"
                      >
                        -1
                      </button>
                      <input
                        type="range"
                        min="-20"
                        max="80"
                        step="1"
                        value={pTop}
                        onChange={(e) => updateSide("top", parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-amber-600"
                      />
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("top", 1)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Top Edge DOWN (+1px)"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("top", 5)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Top Edge DOWN (+5px)"
                      >
                        +5
                      </button>
                    </div>
                  </div>

                  {/* Bottom Edge */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-0.5">
                      <span className="flex items-center gap-1">
                        <ChevronDown className="w-3 h-3 text-amber-600" />
                        <span>Bottom Edge:</span>
                      </span>
                      <span className="font-mono text-amber-800 font-extrabold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 text-[10px]">
                        {pBottom}px
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("bottom", -5)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Bottom Edge DOWN (-5px)"
                      >
                        -5
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("bottom", -1)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Bottom Edge DOWN (-1px)"
                      >
                        -1
                      </button>
                      <input
                        type="range"
                        min="-20"
                        max="80"
                        step="1"
                        value={pBottom}
                        onChange={(e) => updateSide("bottom", parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-amber-600"
                      />
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("bottom", 1)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Bottom Edge UP (+1px)"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("bottom", 5)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Bottom Edge UP (+5px)"
                      >
                        +5
                      </button>
                    </div>
                  </div>

                  {/* Left Edge */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-0.5">
                      <span className="flex items-center gap-1">
                        <ChevronLeft className="w-3 h-3 text-amber-600" />
                        <span>Left Edge:</span>
                      </span>
                      <span className="font-mono text-amber-800 font-extrabold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 text-[10px]">
                        {pLeft}px
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("left", -5)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Left Edge LEFT (-5px)"
                      >
                        -5
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("left", -1)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Left Edge LEFT (-1px)"
                      >
                        -1
                      </button>
                      <input
                        type="range"
                        min="-20"
                        max="80"
                        step="1"
                        value={pLeft}
                        onChange={(e) => updateSide("left", parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-amber-600"
                      />
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("left", 1)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Left Edge RIGHT (+1px)"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("left", 5)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Left Edge RIGHT (+5px)"
                      >
                        +5
                      </button>
                    </div>
                  </div>

                  {/* Right Edge */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-0.5">
                      <span className="flex items-center gap-1">
                        <ChevronRight className="w-3 h-3 text-amber-600" />
                        <span>Right Edge:</span>
                      </span>
                      <span className="font-mono text-amber-800 font-extrabold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 text-[10px]">
                        {pRight}px
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("right", -5)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Right Edge RIGHT (-5px)"
                      >
                        -5
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("right", -1)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Right Edge RIGHT (-1px)"
                      >
                        -1
                      </button>
                      <input
                        type="range"
                        min="-20"
                        max="80"
                        step="1"
                        value={pRight}
                        onChange={(e) => updateSide("right", parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-amber-600"
                      />
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("right", 1)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Right Edge LEFT (+1px)"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustSideDelta("right", 5)}
                        className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Move Right Edge LEFT (+5px)"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                </div>

                {/* Move Entire Frame Position (X, Y Offset) */}
                <div className="flex items-center justify-between text-[11px] bg-white p-2.5 rounded-xl border border-amber-200/60 flex-wrap gap-2">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Move className="w-3.5 h-3.5 text-amber-600" />
                    <span>Shift Whole Frame:</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400 font-bold">X:</span>
                      <input
                        type="number"
                        value={offX}
                        onChange={(e) =>
                          onChange({ ...config, offsetX: parseInt(e.target.value) || 0 })
                        }
                        className="w-12 text-center text-[11px] font-mono font-bold border border-slate-300 rounded py-0.5"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400 font-bold">Y:</span>
                      <input
                        type="number"
                        value={offY}
                        onChange={(e) =>
                          onChange({ ...config, offsetY: parseInt(e.target.value) || 0 })
                        }
                        className="w-12 text-center text-[11px] font-mono font-bold border border-slate-300 rounded py-0.5"
                      />
                    </div>
                    {(offX !== 0 || offY !== 0) && (
                      <button
                        type="button"
                        onClick={() => onChange({ ...config, offsetX: 0, offsetY: 0 })}
                        className="text-[10px] font-bold text-amber-700 hover:underline flex items-center gap-0.5"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Center</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Color Selection */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Palette className="w-3.5 h-3.5 text-amber-600" />
                    <span>Border Colour</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.color}
                      onChange={(e) => onChange({ ...config, color: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer border border-slate-300"
                      title="Custom Color"
                    />
                    <input
                      type="text"
                      value={config.color}
                      onChange={(e) => onChange({ ...config, color: e.target.value })}
                      className="w-20 px-1.5 py-0.5 text-xs font-mono font-bold border border-slate-300 rounded text-center"
                    />
                  </div>
                </div>

                {/* Color Swatches */}
                <div className="grid grid-cols-5 gap-1.5">
                  {quickColors.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => onChange({ ...config, color: c.hex })}
                      className={`py-1 px-1 rounded-xl text-[10px] font-bold border transition-all flex flex-col items-center gap-0.5 ${
                        config.color.toLowerCase() === c.hex.toLowerCase()
                          ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                      title={c.name}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/80 shadow-2xs"
                        style={{ backgroundColor: c.hex }}
                      />
                      <span className="truncate max-w-full text-[9px]">{c.name.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Thickness Control */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <div className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-600" />
                    <span>Thickness (Stroke Width):</span>
                  </div>
                  <span className="font-mono text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-300 font-extrabold text-xs">
                    {config.thickness.toFixed(1)} px
                  </span>
                </div>

                {/* Quick Thickness Buttons */}
                <div className="grid grid-cols-6 gap-1">
                  {quickThicknesses.map((th) => (
                    <button
                      key={th}
                      type="button"
                      onClick={() => onChange({ ...config, thickness: th })}
                      className={`py-1 rounded-lg text-[10px] font-bold border transition-all ${
                        Math.abs(config.thickness - th) < 0.05
                          ? "bg-amber-600 text-white border-amber-700 shadow-2xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {th}px
                    </button>
                  ))}
                </div>

                {/* Slider */}
                <input
                  type="range"
                  min="0.5"
                  max="12.0"
                  step="0.5"
                  value={config.thickness}
                  onChange={(e) => onChange({ ...config, thickness: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                />
                <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold">
                  <span>Fine (0.5px)</span>
                  <span>Standard (3.5px)</span>
                  <span>Heavy (12.0px)</span>
                </div>
              </div>

              {/* Line Style & Corner Radius */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs grid grid-cols-2 gap-3.5">
                <div>
                  <span className="text-[11px] font-bold text-slate-600 block mb-1">
                    Line Style:
                  </span>
                  <div className="grid grid-cols-2 gap-1">
                    {(["solid", "dashed", "dotted", "double"] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => onChange({ ...config, style: st })}
                        className={`py-1 px-1 rounded-lg text-[11px] font-bold capitalize border transition-all text-center ${
                          config.style === st
                            ? "bg-amber-600 text-white border-amber-700 shadow-2xs"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
                    <span>Corners:</span>
                    <span className="font-mono text-slate-700">{config.radius}px</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[0, 6, 12, 16, 24, 32].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => onChange({ ...config, radius: r })}
                        className={`py-1 rounded-lg text-[10px] font-bold border transition-all ${
                          config.radius === r
                            ? "bg-slate-800 text-white border-slate-900"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {r === 0 ? "Sharp" : `${r}px`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-150 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => applyPreset("none")}
            className="text-xs font-bold text-slate-500 hover:text-rose-600 transition"
          >
            Clear Border
          </button>
          <div className="flex items-center gap-2">
            {config.show && onStartInteractiveAdjust && (
              <button
                type="button"
                onClick={() => {
                  onStartInteractiveAdjust();
                  onClose();
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition-all flex items-center gap-1.5"
              >
                <Move className="w-3.5 h-3.5 text-indigo-600" />
                <span>Move on Canvas</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-black bg-amber-600 hover:bg-amber-700 text-white shadow-md transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Apply & Done</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
