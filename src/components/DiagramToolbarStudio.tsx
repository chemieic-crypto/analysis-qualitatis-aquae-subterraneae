import React, { useState, useRef, useEffect } from "react";
import {
  DIAGRAM_LINE_TEMPLATES,
  DiagramLineTheme,
  TitleFormattingConfig,
  DiagramPageOrientation,
  PAGE_ORIENTATION_CONFIGS
} from "../types/diagramTemplates";
import { DiagramBorderConfig } from "./DiagramBorderEditor";
import {
  Download,
  Image,
  FileImage,
  Layers,
  Palette,
  Sparkles,
  ChevronDown,
  Check,
  Crop,
  Maximize2,
  Minimize2,
  Sliders,
  SlidersHorizontal,
  Plus,
  Minus,
  RotateCcw,
  Type,
  MapPin,
  X,
  FileText,
  ListFilter,
  Square,
  Move
} from "lucide-react";

interface DiagramToolbarStudioProps {
  // Line Color Theme
  currentTheme: DiagramLineTheme;
  onThemeChange: (theme: DiagramLineTheme) => void;

  // Export handlers (format, transparent, scale or elementId)
  onExport: (format: "jpeg" | "png" | "svg", transparent: boolean, scaleOrElementId?: any) => void;

  // Crop facility
  isCropActive?: boolean;
  onToggleCrop?: () => void;

  // Title formatting modal trigger
  titleConfig: TitleFormattingConfig;
  onOpenTitleEditor: () => void;

  // Fullscreen toggle
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;

  // Active Cascading Spatial Filter info
  activeSpatialText?: string;

  // Point size slider
  pointSize?: number;
  onPointSizeChange?: (sz: number) => void;

  // Diagram on-screen scale zoom facility (e.g. 1.0, 1.25, 1.5, 1.75, 2.0)
  diagramScale?: number;
  onDiagramScaleChange?: (scale: number) => void;

  // A4 Size / Page Orientation facility (Requirement #2)
  orientation?: DiagramPageOrientation;
  onOrientationChange?: (orient: DiagramPageOrientation) => void;

  // Legend Tile Visibility (Requirement #3)
  showLegendTile?: boolean;
  onToggleLegendTile?: () => void;

  // Outer Lines & Frame Border facility
  outerLineWidth?: number;
  onOuterLineWidthChange?: (width: number) => void;
  borderConfig?: DiagramBorderConfig;
  onBorderConfigChange?: (cfg: DiagramBorderConfig) => void;
  onOpenBorderEditor?: () => void;
  isAdjustingBorder?: boolean;
  onToggleAdjustBorder?: () => void;
  // Extra buttons (e.g. Legend Box, Point Symbols)
  children?: React.ReactNode;
}

export const DiagramToolbarStudio: React.FC<DiagramToolbarStudioProps> = ({
  currentTheme,
  onThemeChange,
  onExport,
  isCropActive,
  onToggleCrop,
  titleConfig,
  onOpenTitleEditor,
  isFullscreen,
  onToggleFullscreen,
  activeSpatialText,
  pointSize,
  onPointSizeChange,
  diagramScale,
  onDiagramScaleChange,
  orientation = "fit",
  onOrientationChange,
  showLegendTile = true,
  onToggleLegendTile,
  outerLineWidth,
  onOuterLineWidthChange,
  borderConfig,
  onBorderConfigChange,
  onOpenBorderEditor,
  isAdjustingBorder,
  onToggleAdjustBorder,
  children
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showOrientationMenu, setShowOrientationMenu] = useState(false);
  const [showOuterLinesMenu, setShowOuterLinesMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const orientationMenuRef = useRef<HTMLDivElement>(null);
  const outerLinesMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false);
      }
      if (orientationMenuRef.current && !orientationMenuRef.current.contains(e.target as Node)) {
        setShowOrientationMenu(false);
      }
      if (outerLinesMenuRef.current && !outerLinesMenuRef.current.contains(e.target as Node)) {
        setShowOuterLinesMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div className="flex flex-col gap-2 w-full no-print relative z-40">
      {/* Top Main Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-50/90 backdrop-blur-md p-2 rounded-2xl border border-slate-200 shadow-2xs relative z-40">
        {/* Left Section: 7 Base Line Templates & Title Formatter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Base Diagram Line Templates Selector (7 Themes) */}
          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => setShowThemeMenu((p) => !p)}
              className="bg-white hover:bg-slate-50 text-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-black flex items-center gap-1.5 shadow-2xs transition-all"
              title="Select Base Diagram Line Color Template (7 styles)"
            >
              <Palette className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Lines:</span>
              <span
                className="w-2.5 h-2.5 rounded-full inline-block border border-white shadow-xs"
                style={{ backgroundColor: currentTheme.primaryLine }}
              />
              <span className="font-bold text-slate-700">{currentTheme.badge}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* 7 Themes Dropdown Menu */}
            {showThemeMenu && (
              <div className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-[200] animate-in fade-in zoom-in-95 duration-100">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1 mb-1 border-b border-slate-100 flex items-center justify-between">
                  <span>Base Line Color Templates</span>
                  <span className="font-mono text-[9px] text-indigo-600 bg-indigo-50 px-1 rounded">7 Styles</span>
                </div>
                <div className="space-y-1">
                  {DIAGRAM_LINE_TEMPLATES.map((tmpl) => {
                    const isSelected = tmpl.id === currentTheme.id;
                    return (
                      <button
                        key={tmpl.id}
                        onClick={() => {
                          onThemeChange(tmpl);
                          setShowThemeMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs text-left transition-all ${
                          isSelected
                            ? "bg-indigo-50 text-indigo-950 font-bold border border-indigo-200 shadow-2xs"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex items-center -space-x-1">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-white shadow-2xs"
                              style={{ backgroundColor: tmpl.primaryLine }}
                              title="Primary line"
                            />
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-white"
                              style={{ backgroundColor: tmpl.secondaryLine }}
                              title="Grid line"
                            />
                          </div>
                          <div>
                            <div className="font-extrabold text-[11px] leading-tight">{tmpl.name}</div>
                            <div className="text-[9px] text-slate-400 leading-tight">{tmpl.description}</div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Title Formatter Trigger */}
          <button
            onClick={onOpenTitleEditor}
            className="bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-black flex items-center gap-1.5 shadow-2xs transition-all"
            title="Format Title (Simple, flat, no emboss/deboss, font & color)"
          >
            <Type className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Format Title</span>
          </button>

          {/* Outer Lines & Boundaries Thickness Studio */}
          {outerLineWidth !== undefined && onOuterLineWidthChange && (
            <div className="relative" ref={outerLinesMenuRef}>
              <button
                onClick={() => setShowOuterLinesMenu((p) => !p)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 shadow-2xs transition-all ${
                  showOuterLinesMenu
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-white hover:bg-slate-50 text-slate-800 border-slate-200"
                }`}
                title="Modify thickness of diagram outer lines, boundary perimeters, and frame"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Outer Lines:</span>
                <span className="sm:hidden">Lines:</span>
                <span className="font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] font-black">
                  {outerLineWidth.toFixed(1)}px
                </span>
                {/* Visual stroke thickness bar */}
                <span
                  className="w-3.5 rounded-full bg-slate-700 inline-block shrink-0"
                  style={{ height: `${Math.max(1, Math.min(4.5, outerLineWidth))}px` }}
                />
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showOuterLinesMenu && (
                <div className="absolute left-0 top-full mt-1.5 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3.5 z-[210] animate-in fade-in zoom-in-95 duration-100">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 pb-2 mb-2.5 border-b border-slate-100 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-800 font-black">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                      Outer Lines Thickness
                    </span>
                    <button
                      type="button"
                      onClick={() => onOuterLineWidthChange(1.8)}
                      className="text-[9px] font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 bg-slate-50 hover:bg-indigo-50 px-1.5 py-0.5 rounded border border-slate-200"
                      title="Reset diagram outer lines to default 1.8px"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      Reset (1.8px)
                    </button>
                  </div>

                  {/* Section 1: Diagram Outer Geometry & Boundary Lines */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-extrabold text-slate-800">
                        Diagram Outer Boundaries:
                      </label>
                      <span className="text-xs font-mono font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                        {outerLineWidth.toFixed(1)} px
                      </span>
                    </div>
                    <p className="text-[9.5px] text-slate-500 leading-tight">
                      Modifies thickness of outer ternary triangles, diamond perimeter, USSL/Chadha grid frame, or Gibbs axes.
                    </p>

                    {/* Stepper Buttons & Live Range Slider */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onOuterLineWidthChange(Math.max(0.5, +(outerLineWidth - 0.2).toFixed(1)))}
                        className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all shadow-2xs"
                        title="Decrease outer line thickness by 0.2px"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="range"
                        min="0.5"
                        max="6.0"
                        step="0.1"
                        value={outerLineWidth}
                        onChange={(e) => onOuterLineWidthChange(parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <button
                        type="button"
                        onClick={() => onOuterLineWidthChange(Math.min(6.0, +(outerLineWidth + 0.2).toFixed(1)))}
                        className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all shadow-2xs"
                        title="Increase outer line thickness by 0.2px"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Live Visual Stroke Preview */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2 flex items-center justify-between mt-1.5">
                      <span className="text-[9.5px] font-bold text-slate-500">Live Stroke Width:</span>
                      <div className="w-36 h-5 flex items-center justify-center bg-white rounded-lg border border-slate-200/60 px-2">
                        <div
                          className="w-full rounded-full transition-all"
                          style={{
                            height: `${Math.max(1, outerLineWidth)}px`,
                            backgroundColor: currentTheme.primaryLine
                          }}
                        />
                      </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="grid grid-cols-6 gap-1 pt-1">
                      {[
                        { label: "0.8px", val: 0.8, name: "Fine" },
                        { label: "1.2px", val: 1.2, name: "Light" },
                        { label: "1.8px", val: 1.8, name: "Std" },
                        { label: "2.5px", val: 2.5, name: "Bold" },
                        { label: "3.5px", val: 3.5, name: "Heavy" },
                        { label: "5.0px", val: 5.0, name: "Thick" },
                      ].map((p) => {
                        const isSel = Math.abs(outerLineWidth - p.val) < 0.08;
                        return (
                          <button
                            key={p.val}
                            type="button"
                            onClick={() => onOuterLineWidthChange(p.val)}
                            className={`py-1 rounded-lg text-[9px] font-bold border transition-all ${
                              isSel
                                ? "bg-indigo-600 text-white border-indigo-700 shadow-2xs"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                            }`}
                            title={`${p.name} (${p.val}px)`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 2: Outer Frame Border (Canvas Perimeter Frame) */}
                  {borderConfig && (
                    <div className="pt-2.5 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Square className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-[11px] font-extrabold text-slate-800">
                            Outer Canvas Border Frame:
                          </span>
                        </div>
                        <span className="text-xs font-mono font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          {borderConfig.show ? `${borderConfig.thickness.toFixed(1)} px` : "Off"}
                        </span>
                      </div>

                      {onBorderConfigChange && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onBorderConfigChange({
                                ...borderConfig,
                                show: !borderConfig.show
                              })
                            }
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all shrink-0 ${
                              borderConfig.show
                                ? "bg-amber-600 text-white border-amber-700 shadow-2xs"
                                : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                            }`}
                          >
                            {borderConfig.show ? "Border ON" : "Border OFF"}
                          </button>
                          <input
                            type="range"
                            min="0.5"
                            max="10.0"
                            step="0.5"
                            value={borderConfig.thickness}
                            disabled={!borderConfig.show}
                            onChange={(e) =>
                              onBorderConfigChange({
                                ...borderConfig,
                                show: true,
                                thickness: parseFloat(e.target.value)
                              })
                            }
                            className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600 disabled:opacity-40"
                          />
                        </div>
                      )}

                      {/* Quick Presets for Border Frame */}
                      {onBorderConfigChange && (
                        <div className="grid grid-cols-5 gap-1">
                          {[1.0, 2.0, 3.5, 5.0, 8.0].map((th) => (
                            <button
                              key={th}
                              type="button"
                              onClick={() =>
                                onBorderConfigChange({
                                  ...borderConfig,
                                  show: true,
                                  thickness: th
                                })
                              }
                              className={`py-0.5 rounded text-[9px] font-bold border transition-all ${
                                borderConfig.show && Math.abs(borderConfig.thickness - th) < 0.1
                                  ? "bg-amber-600 text-white border-amber-700 shadow-2xs"
                                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {th}px
                            </button>
                          ))}
                        </div>
                      )}

                      {onOpenBorderEditor && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowOuterLinesMenu(false);
                            onOpenBorderEditor();
                          }}
                          className="w-full text-center py-1.5 text-[10.5px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all shadow-2xs mt-1"
                        >
                          Advanced Border Studio (Colors, Styles, Insets) &rarr;
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Border Frame Studio Trigger & Interactive Move/Fit Toggle */}
          {onOpenBorderEditor && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={onOpenBorderEditor}
                className={`px-2.5 py-1.5 ${
                  borderConfig?.show && onToggleAdjustBorder ? "rounded-l-xl" : "rounded-xl"
                } border text-xs font-black flex items-center gap-1.5 shadow-2xs transition-all ${
                  borderConfig?.show
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
                title="Outer Border Studio (Colour, Thickness, Move sides, Fit to Content)"
              >
                <Square className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Border Frame</span>
                <span className="sm:hidden">Border</span>
                {borderConfig?.show ? (
                  <span className="flex items-center gap-1">
                    <span
                      className="w-2.5 h-2.5 rounded-xs inline-block border border-white/60 shadow-2xs"
                      style={{ backgroundColor: borderConfig.color }}
                    />
                    <span className="text-[10px] font-bold text-amber-300">
                      {borderConfig.thickness.toFixed(1)}px
                    </span>
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-bold">Off</span>
                )}
              </button>
              {borderConfig?.show && onToggleAdjustBorder && (
                <button
                  type="button"
                  onClick={onToggleAdjustBorder}
                  className={`px-2 py-1.5 rounded-r-xl border text-xs font-black transition-all flex items-center gap-1 border-l-0 ${
                    isAdjustingBorder
                      ? "bg-amber-500 text-slate-950 border-amber-600 shadow-xs ring-1 ring-amber-400"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                  title={
                    isAdjustingBorder
                      ? "Finish moving border (hide drag handles)"
                      : "Show on-canvas drag handles to move and fit border freely"
                  }
                >
                  <Move className={`w-3.5 h-3.5 ${isAdjustingBorder ? "text-slate-950 animate-pulse" : "text-amber-600"}`} />
                  <span className="text-[10.5px]">
                    {isAdjustingBorder ? "Done" : "Move/Fit"}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* A4 Sheet & Page Orientation Selector (Requirement #2) */}
          {onOrientationChange && (
            <div className="relative" ref={orientationMenuRef}>
              <button
                onClick={() => setShowOrientationMenu((p) => !p)}
                className="bg-white hover:bg-slate-50 text-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-black flex items-center gap-1.5 shadow-2xs transition-all"
                title="Select Sheet Size & Orientation: Standard, A4 Portrait, A4 Landscape"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Sheet:</span>
                <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">
                  {PAGE_ORIENTATION_CONFIGS[orientation].badge}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showOrientationMenu && (
                <div className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-[200] animate-in fade-in zoom-in-95 duration-100">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1 mb-1 border-b border-slate-100 flex items-center justify-between">
                    <span>Sheet Size & Orientation</span>
                    <span className="text-[9px] font-mono text-indigo-600 bg-indigo-50 px-1 rounded">A4 Print</span>
                  </div>
                  <div className="space-y-1">
                    {(["fit", "a4_portrait", "a4_landscape"] as DiagramPageOrientation[]).map((orientKey) => {
                      const cfg = PAGE_ORIENTATION_CONFIGS[orientKey];
                      const isSel = orientKey === orientation;
                      return (
                        <button
                          key={orientKey}
                          onClick={() => {
                            onOrientationChange(orientKey);
                            setShowOrientationMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs text-left transition-all ${
                            isSel
                              ? "bg-indigo-50 text-indigo-950 font-bold border border-indigo-200 shadow-2xs"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <div>
                            <div className="font-extrabold text-[11px] flex items-center gap-1">
                              <span>{cfg.label}</span>
                              {cfg.widthMm > 0 && (
                                <span className="text-[9px] text-slate-400 font-mono">({cfg.widthMm}×{cfg.heightMm}mm)</span>
                              )}
                            </div>
                            <div className="text-[9px] text-slate-400">{cfg.description}</div>
                          </div>
                          {isSel && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Legend Tile Toggle (Requirement #3) */}
          {onToggleLegendTile && (
            <button
              onClick={onToggleLegendTile}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 border transition-all shadow-2xs ${
                showLegendTile
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
              title="Toggle Tile 3 (Dedicated Publication Legend Card)"
            >
              <ListFilter className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Legend Tile:</span>
              <span className={`text-[10px] font-bold ${showLegendTile ? "text-emerald-700 font-black" : "text-slate-400"}`}>
                {showLegendTile ? "ON" : "OFF"}
              </span>
            </button>
          )}

          {/* Injected buttons (e.g. Legend Box, Point Symbols) */}
          {children}
        </div>

        {/* Right Section: Diagram Size Zoom, Point Size, Crop, Download Options, Fullscreen */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Diagram Size Zoom Controller (+50% by default) */}
          {diagramScale !== undefined && onDiagramScaleChange && (
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-indigo-200 text-xs font-bold text-slate-700 shadow-2xs" title="Diagram Size Zoom (+50% Enlarged by Default)">
              <span className="text-[9px] font-black uppercase text-indigo-600 flex items-center gap-0.5">
                <Sparkles className="w-2.5 h-2.5 text-indigo-500" />
                Zoom:
              </span>
              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
                {[
                  { label: "100%", val: 1.0 },
                  { label: "125%", val: 1.25 },
                  { label: "150% ★", val: 1.5 },
                  { label: "175%", val: 1.75 },
                  { label: "200%", val: 2.0 },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => onDiagramScaleChange(opt.val)}
                    className={`px-1.5 py-0.5 text-[9.5px] font-black rounded transition-all cursor-pointer ${
                      Math.abs(diagramScale - opt.val) < 0.05
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                    }`}
                    title={`Set diagram size to ${opt.label}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Point Size Control if provided */}
          {pointSize !== undefined && onPointSizeChange && (
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
              <span className="text-[9px] font-black uppercase text-slate-400">Pt Size:</span>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.1"
                value={pointSize}
                onChange={(e) => onPointSizeChange(parseFloat(e.target.value))}
                className="w-14 h-1 bg-slate-200 rounded-lg cursor-pointer accent-indigo-600"
              />
              <span className="font-mono text-[10px] text-indigo-600 min-w-[24px] text-center">
                {pointSize.toFixed(1)}
              </span>
            </div>
          )}

          {/* Crop Area Toggle if provided */}
          {onToggleCrop && (
            <button
              onClick={onToggleCrop}
              className={`p-1.5 rounded-xl text-xs font-bold transition-all border ${
                isCropActive
                  ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-2xs"
              }`}
              title="Crop Custom Box before Export"
            >
              <Crop className="w-4 h-4" />
            </button>
          )}

          {/* DOWNLOAD MENU (Ultra HD 4K / 8K / Pure White Background vs Without Background / Transparent) */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((p) => !p)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98]"
              title="Download Ultra HD 4K Diagram (Pure White Background or Transparent)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Ultra HD</span>
              <span className="bg-amber-400 text-slate-950 text-[8.5px] font-black px-1 rounded-xs uppercase tracking-tight shadow-2xs">
                4K
              </span>
              <ChevronDown className="w-3 h-3 text-indigo-200" />
            </button>

            {/* Export Dropdown */}
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-[200] animate-in fade-in zoom-in-95 duration-100">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1 mb-1 border-b border-slate-100 flex items-center justify-between">
                  <span>Ultra HD Export Options</span>
                  <span className="text-[9px] font-mono text-emerald-600 bg-emerald-50 px-1 rounded font-bold">4K UHD &bull; 600 DPI</span>
                </div>

                <div className="space-y-1">
                  {/* Option 1: Ultra HD 4K JPEG (Pure White Background) */}
                  <button
                    onClick={() => {
                      onExport("jpeg", false, 6.0);
                      setShowExportMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-left hover:bg-slate-50 text-slate-700 transition-all group cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 shrink-0">
                      <FileImage className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-[11px] text-slate-900 flex items-center gap-1">
                        <span>Ultra HD 4K JPEG</span>
                        <span className="text-[8px] bg-slate-800 text-white px-1 py-0.2 rounded font-mono font-bold">WHITE BG</span>
                      </div>
                      <div className="text-[9.5px] text-slate-400">Crystal clear 4000+ px, pure #FFFFFF background</div>
                    </div>
                  </button>

                  {/* Option 2: Ultra HD 4K PNG (Without Background / Transparent) */}
                  <button
                    onClick={() => {
                      onExport("png", true, 6.0);
                      setShowExportMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-left hover:bg-emerald-50 text-slate-700 transition-all group cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-emerald-100/70 border border-emerald-200 flex items-center justify-center text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white shrink-0">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-[11px] text-emerald-950 flex items-center gap-1">
                        <span>Ultra HD 4K PNG</span>
                        <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 py-0.2 rounded font-mono font-bold">TRANSPARENT</span>
                      </div>
                      <div className="text-[9.5px] text-slate-400">Crystal clear 4000+ px without background</div>
                    </div>
                  </button>

                  {/* Option 3: Ultra HD 4K PNG (Pure White Background) */}
                  <button
                    onClick={() => {
                      onExport("png", false, 6.0);
                      setShowExportMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-left hover:bg-slate-50 text-slate-700 transition-all group cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 shrink-0">
                      <Image className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-[11px] text-slate-900 flex items-center gap-1">
                        <span>Ultra HD 4K PNG</span>
                        <span className="text-[8px] bg-indigo-50 text-indigo-700 px-1 py-0.2 rounded font-mono font-bold">LOSSLESS WHITE</span>
                      </div>
                      <div className="text-[9.5px] text-slate-400">Lossless 4000+ px PNG with solid white background</div>
                    </div>
                  </button>

                  {/* Option 4: Ultra HD 8K Poster Export (Extreme 8000+ px) */}
                  <button
                    onClick={() => {
                      onExport("png", false, 10.0);
                      setShowExportMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-left hover:bg-amber-50 text-slate-700 transition-all group cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 group-hover:bg-amber-600 group-hover:text-white shrink-0">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-[11px] text-amber-950 flex items-center gap-1">
                        <span>Ultra HD 8K Extreme Poster</span>
                        <span className="text-[8px] bg-amber-200 text-amber-900 px-1 py-0.2 rounded font-mono font-bold">8K UHD</span>
                      </div>
                      <div className="text-[9.5px] text-slate-400">Massive 8000+ px for large poster prints & thesis</div>
                    </div>
                  </button>

                  {/* Option 5: SVG (Vector Graphic) */}
                  <button
                    onClick={() => {
                      onExport("svg", false);
                      setShowExportMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-left hover:bg-purple-50 text-slate-700 transition-all group border-t border-slate-100 mt-1 pt-1.5 cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-purple-100/70 border border-purple-200 flex items-center justify-center text-purple-700 group-hover:bg-purple-600 group-hover:text-white shrink-0">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-[11px] text-purple-950 flex items-center gap-1">
                        <span>SVG Vector Graphic</span>
                        <span className="text-[8px] bg-purple-100 text-purple-700 px-1 py-0.2 rounded font-mono font-bold">INFINITE HD</span>
                      </div>
                      <div className="text-[9.5px] text-slate-400">Pure mathematical vectors, zero rasterization loss</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen Toggle */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 rounded-xl bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs transition-all"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Active Cascading Spatial Selection Filter Badge */}
      {activeSpatialText && (
        <div className="flex items-center justify-between bg-white px-3 py-1 rounded-xl border border-slate-200 text-[10px] shadow-2xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-bold truncate">
            <MapPin className="w-3 h-3 text-indigo-600 shrink-0" />
            <span className="text-slate-400 uppercase text-[9px] font-black">Active Spatial Filter:</span>
            <span className="text-slate-900 truncate">{activeSpatialText}</span>
          </div>
          <span className="text-[8.5px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-bold shrink-0 border border-emerald-200">
            Legend Synced
          </span>
        </div>
      )}
    </div>
  );
};

// Modal for Simple, Flat Title Formatting (NO Emboss / NO Deboss)
interface SimpleTitleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TitleFormattingConfig;
  onChange: (cfg: TitleFormattingConfig) => void;
  diagramName?: string;
  title?: string;
}

export const SimpleTitleEditorModal: React.FC<SimpleTitleEditorModalProps> = ({
  isOpen,
  onClose,
  config,
  onChange,
  diagramName,
  title,
}) => {
  if (!isOpen) return null;
  const displayName = diagramName || title || "Diagram";

  const fontOptions = [
    { label: "Modern Sans-Serif (Inter)", value: "'Inter', system-ui, sans-serif" },
    { label: "Plus Jakarta Sans", value: "'Plus Jakarta Sans', system-ui, sans-serif" },
    { label: "Editorial Serif (Playfair)", value: "'Playfair Display', Georgia, serif" },
    { label: "Academic Serif (Times)", value: "'Times New Roman', Times, serif" },
    { label: "Monospace (Courier)", value: "'Courier New', monospace" },
  ];

  const quickColors = [
    { name: "Charcoal Black", hex: "#0f172a" },
    { name: "Royal Blue", hex: "#1e40af" },
    { name: "Deep Navy", hex: "#0f4c81" },
    { name: "Emerald Green", hex: "#065f46" },
    { name: "Crimson Red", hex: "#991b1b" },
    { name: "Earth Bronze", hex: "#78350f" },
  ];

  return (
    <div className="fixed inset-0 z-[3000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-black text-slate-900">{displayName} Title Formatter</div>
              <div className="text-[10px] text-slate-400 font-bold">Simple, crisp typography (no emboss/deboss)</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Title Text input (supports multiline) */}
        <div className="space-y-1.5">
          <label className="text-[10.5px] font-black uppercase text-slate-500 tracking-wider">
            Title Text:
          </label>
          <textarea
            rows={2}
            value={config.text}
            onChange={(e) => onChange({ ...config, text: e.target.value })}
            placeholder="Enter diagram title (e.g. USSL Classification Matrix)..."
            className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
          />
        </div>

        {/* Font Size & Weight & Style */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
              Font Size: {config.size}px
            </label>
            <input
              type="range"
              min="9"
              max="24"
              step="0.5"
              value={config.size}
              onChange={(e) => onChange({ ...config, size: parseFloat(e.target.value) || 12 })}
              className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
              Font Style:
            </label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => onChange({ ...config, isBold: !config.isBold })}
                className={`flex-1 py-1 rounded-xl text-xs font-black transition-all border ${
                  config.isBold ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                Bold
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...config, isItalic: !config.isItalic })}
                className={`flex-1 py-1 rounded-xl text-xs font-black italic transition-all border ${
                  config.isItalic ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                Italic
              </button>
            </div>
          </div>
        </div>

        {/* Font Family */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
            Font Family:
          </label>
          <select
            value={config.fontFamily}
            onChange={(e) => onChange({ ...config, fontFamily: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none"
          >
            {fontOptions.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* Color Palette */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-500 tracking-wider">
            <span>Title Color:</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9.5px] text-slate-700">{config.color}</span>
              <input
                type="color"
                value={config.color}
                onChange={(e) => onChange({ ...config, color: e.target.value })}
                className="w-5 h-5 rounded cursor-pointer border-none bg-transparent p-0"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {quickColors.map((qc) => (
              <button
                key={qc.hex}
                type="button"
                onClick={() => onChange({ ...config, color: qc.hex })}
                className={`flex-1 h-6 rounded-lg transition-transform ${
                  config.color === qc.hex ? "ring-2 ring-indigo-600 ring-offset-1 scale-105" : "hover:scale-105"
                }`}
                style={{ backgroundColor: qc.hex }}
                title={qc.name}
              />
            ))}
          </div>
        </div>

        {/* Live Preview Box */}
        <div className="p-3 bg-white rounded-2xl border border-dashed border-slate-300 text-center">
          <div className="text-[8px] font-black uppercase text-slate-400 mb-1">Live Flat Text Preview</div>
          <div
            style={{
              fontSize: `${config.size}px`,
              color: config.color,
              fontWeight: config.isBold ? 900 : 400,
              fontStyle: config.isItalic ? "italic" : "normal",
              fontFamily: config.fontFamily
            }}
            className="truncate"
          >
            {config.text || diagramName}
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md active:scale-[0.99]"
        >
          Apply & Close
        </button>
      </div>
    </div>
  );
};
