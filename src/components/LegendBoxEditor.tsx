import React from "react";
import { PointSymbol, PointSymbolIcon } from "./PointSymbol";

export interface LegendConfig {
  show: boolean;
  style: "in-chart" | "bottom" | "none";
  columns: 1 | 2 | 3 | 4;
  fontSize: number; // e.g. 5.5 for SVG, 10-12 for HTML
  fontFamily: string;
  textColor: string;
  isBold: boolean;
  isItalic: boolean;
  isUppercase: boolean;
  showBorder: boolean; // "no boundary facility"
  borderColor: string;
  borderThickness: number; // 0 to 6
  borderStyle: "solid" | "dashed" | "dotted";
  borderRadius: number; // 0 to 12
  backgroundColor: string;
  backgroundOpacity: number; // 0 to 1
}

export const DEFAULT_PIPER_LEGEND_CONFIG: LegendConfig = {
  show: true,
  style: "in-chart",
  columns: 1,
  fontSize: 5.6,
  fontFamily: "'Inter', sans-serif",
  textColor: "#0f172a",
  isBold: true,
  isItalic: false,
  isUppercase: false,
  showBorder: true,
  borderColor: "#16a34a", // Vibrant Green from reference image
  borderThickness: 2.2,
  borderStyle: "solid",
  borderRadius: 2,
  backgroundColor: "#ffffff",
  backgroundOpacity: 0.98,
};

export const DEFAULT_USSL_LEGEND_CONFIG: LegendConfig = {
  show: true,
  style: "in-chart",
  columns: 2,
  fontSize: 5.4,
  fontFamily: "'Inter', sans-serif",
  textColor: "#0f172a",
  isBold: true,
  isItalic: false,
  isUppercase: false,
  showBorder: true,
  borderColor: "#cbd5e1",
  borderThickness: 1.5,
  borderStyle: "solid",
  borderRadius: 4,
  backgroundColor: "#ffffff",
  backgroundOpacity: 0.95,
};

export interface LegendSampleItem {
  label: string;
  color: string;
  symbol?: PointSymbol;
}

interface LegendBoxEditorProps {
  config: LegendConfig;
  onChange: (cfg: LegendConfig) => void;
  onClose: () => void;
  sampleItems?: LegendSampleItem[];
  title?: string;
}

export default function LegendBoxEditor({
  config,
  onChange,
  onClose,
  sampleItems = [
    { label: "Bihar", color: "#2563eb", symbol: "circle" },
    { label: "Jharkhand", color: "#dc2626", symbol: "triangle" },
    { label: "Uttar Pradesh", color: "#16a34a", symbol: "square" },
    { label: "West Bengal", color: "#d97706", symbol: "diamond" },
  ],
  title = "Legend Box Formatting Studio",
}: LegendBoxEditorProps) {
  const fontFamilies = [
    { name: "Inter (Modern Sans)", value: "'Inter', sans-serif" },
    { name: "Playfair (Reference Serif)", value: "'Playfair Display', Georgia, serif" },
    { name: "Times New Roman (Academic)", value: "'Times New Roman', Times, serif" },
    { name: "Georgia (Editorial)", value: "Georgia, serif" },
    { name: "Arial (Standard)", value: "Arial, Helvetica, sans-serif" },
    { name: "Courier New (Monospace)", value: "'Courier New', Courier, monospace" },
    { name: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  ];

  const quickBorderColors = [
    { name: "Reference Green", hex: "#16a34a" },
    { name: "Dark Slate", hex: "#1e293b" },
    { name: "Classic Black", hex: "#000000" },
    { name: "Light Slate", hex: "#cbd5e1" },
    { name: "Royal Blue", hex: "#0000cc" },
    { name: "Crimson", hex: "#dc2626" },
    { name: "Amber", hex: "#d97706" },
    { name: "Indigo", hex: "#4f46e5" },
  ];

  const quickTextColors = [
    { name: "Charcoal", hex: "#0f172a" },
    { name: "Dark Slate", hex: "#334155" },
    { name: "Royal Blue", hex: "#0000cc" },
    { name: "Forest Green", hex: "#15803d" },
    { name: "Deep Red", hex: "#990000" },
    { name: "Pure Black", hex: "#000000" },
  ];

  // Helper for presets
  const applyPreset = (preset: "reference" | "borderless" | "academic" | "compact") => {
    switch (preset) {
      case "reference":
        onChange({
          ...config,
          style: "in-chart",
          showBorder: true,
          borderColor: "#16a34a",
          borderThickness: 2.2,
          borderStyle: "solid",
          borderRadius: 2,
          backgroundColor: "#ffffff",
          backgroundOpacity: 0.98,
          columns: 1,
          fontFamily: "'Inter', sans-serif",
          textColor: "#0f172a",
          isBold: true,
          isItalic: false,
          isUppercase: false,
        });
        break;
      case "borderless":
        onChange({
          ...config,
          showBorder: false,
          borderThickness: 0,
          backgroundColor: "#ffffff",
          backgroundOpacity: 0.85,
          fontFamily: "'Inter', sans-serif",
          textColor: "#1e293b",
          isBold: true,
        });
        break;
      case "academic":
        onChange({
          ...config,
          style: "in-chart",
          showBorder: true,
          borderColor: "#000000",
          borderThickness: 1.2,
          borderStyle: "solid",
          borderRadius: 0,
          backgroundColor: "#ffffff",
          backgroundOpacity: 1,
          columns: 2,
          fontFamily: "'Times New Roman', Times, serif",
          textColor: "#000000",
          isBold: true,
          isItalic: false,
        });
        break;
      case "compact":
        onChange({
          ...config,
          style: "in-chart",
          columns: 3,
          showBorder: true,
          borderColor: "#94a3b8",
          borderThickness: 1,
          borderStyle: "solid",
          borderRadius: 4,
          fontSize: 4.8,
          isBold: true,
        });
        break;
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-150 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold shadow-2xs">
              <i className="ph ph-squares-four"></i>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                {title}
              </h3>
              <p className="text-[10px] text-slate-500 font-medium">
                Customize column count (1-4), text typography, colors, and outer boundary
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <i className="ph ph-x text-base"></i>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(92vh-130px)]">
          {/* Quick Presets Bar */}
          <div className="flex items-center gap-1.5 flex-wrap bg-slate-100/90 p-2 rounded-2xl border border-slate-200">
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider px-1">Presets:</span>
            <button
              onClick={() => applyPreset("reference")}
              className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200 shadow-2xs transition-all flex items-center gap-1"
            >
              <span>★ Reference Green (1 Col)</span>
            </button>
            <button
              onClick={() => applyPreset("borderless")}
              className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 shadow-2xs transition-all flex items-center gap-1"
            >
              <i className="ph ph-frame-corners text-xs"></i>
              <span>No Boundary (Borderless)</span>
            </button>
            <button
              onClick={() => applyPreset("academic")}
              className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white text-slate-800 hover:bg-slate-50 border border-slate-200 shadow-2xs transition-all"
            >
              Academic (2 Col Serif)
            </button>
            <button
              onClick={() => applyPreset("compact")}
              className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 shadow-2xs transition-all"
            >
              Compact (3 Col)
            </button>
          </div>

          {/* Interactive Live Preview Box */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col items-center justify-center">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Live Preview (Rendered Appearance)
            </div>
            <div
              className="transition-all duration-200 p-2.5"
              style={{
                backgroundColor: config.backgroundColor,
                opacity: config.backgroundOpacity,
                border: config.showBorder
                  ? `${config.borderThickness}px ${config.borderStyle} ${config.borderColor}`
                  : "none",
                borderRadius: `${config.borderRadius}px`,
                boxShadow: config.showBorder ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
              }}
            >
              <div
                className="grid gap-x-4 gap-y-1.5"
                style={{
                  gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
                }}
              >
                {sampleItems.slice(0, 12).map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 min-w-[70px]">
                    <PointSymbolIcon
                      symbol={it.symbol || "circle"}
                      color={it.color}
                      size={13}
                      stroke="#ffffff"
                    />
                    <span
                      style={{
                        fontFamily: config.fontFamily,
                        color: config.textColor,
                        fontWeight: config.isBold ? 700 : 400,
                        fontStyle: config.isItalic ? "italic" : "normal",
                        textTransform: config.isUppercase ? "uppercase" : "none",
                        fontSize: "11px",
                      }}
                      className="break-words leading-tight"
                    >
                      {it.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {!config.showBorder && (
              <span className="text-[10px] font-bold text-amber-600 mt-1.5 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                Outer Boundary Disabled (Borderless Mode Active)
              </span>
            )}
          </div>

          {/* 1. COLUMN LAYOUT SELECTOR (1, 2, 3, 4 COLUMNS) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <i className="ph ph-columns text-emerald-600 text-sm"></i>
                1. Legend Columns Facility (1, 2, 3 or 4 Columns)
              </label>
              <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Current: {config.columns} Column{config.columns > 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {([1, 2, 3, 4] as const).map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => onChange({ ...config, columns: col })}
                  className={`py-2 px-3 rounded-xl border text-xs font-black flex flex-col items-center justify-center gap-1 transition-all ${
                    config.columns === col
                      ? "bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-400/40"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: col }).map((_, i) => (
                      <span
                        key={i}
                        className={`w-1.5 h-3.5 rounded-xs ${
                          config.columns === col ? "bg-white" : "bg-slate-400"
                        }`}
                      />
                    ))}
                  </div>
                  <span>{col} Column{col > 1 ? "s" : ""}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. OUTER BOUNDARY & THICKNESS & NO BOUNDARY FACILITY */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <i className="ph ph-bounding-box text-indigo-600 text-sm"></i>
                2. Outer Boundary & Thickness (or No Boundary)
              </label>
              {/* Toggle for No Boundary */}
              <button
                type="button"
                onClick={() => onChange({ ...config, showBorder: !config.showBorder })}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  !config.showBorder
                    ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200"
                }`}
                title="Toggle No Boundary mode"
              >
                <i className={`ph ${!config.showBorder ? "ph-eye-slash" : "ph-eye"} text-sm`}></i>
                <span>{!config.showBorder ? "No Boundary (Off)" : "Boundary Enabled"}</span>
              </button>
            </div>

            {config.showBorder && (
              <>
                {/* Border Color Quick Swatches & Custom Picker */}
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1.5">
                    Boundary Color:
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="color"
                      value={config.borderColor.startsWith("#") ? config.borderColor : "#16a34a"}
                      onChange={(e) => onChange({ ...config, borderColor: e.target.value })}
                      className="w-8 h-8 rounded-xl cursor-pointer border border-slate-300 p-0.5 shrink-0"
                      title="Choose custom boundary color"
                    />
                    {quickBorderColors.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => onChange({ ...config, borderColor: c.hex })}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 transition-all ${
                          config.borderColor.toLowerCase() === c.hex.toLowerCase()
                            ? "border-slate-800 bg-slate-900 text-white shadow-xs"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.hex }} />
                        <span>{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Boundary Thickness & Style Slider */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
                      <span>Thickness:</span>
                      <span className="font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                        {config.borderThickness.toFixed(1)} px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="6"
                      step="0.1"
                      value={config.borderThickness}
                      onChange={(e) => onChange({ ...config, borderThickness: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold mt-1">
                      <span>Hairline (0.5)</span>
                      <span>Medium (2.2)</span>
                      <span>Heavy (6.0)</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-600 block mb-1">Boundary Style:</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["solid", "dashed", "dotted"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => onChange({ ...config, borderStyle: st })}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold capitalize border transition-all ${
                            config.borderStyle === st
                              ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Corner Radius & Background Opacity */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
                      <span>Corner Radius:</span>
                      <span className="font-mono text-slate-700">{config.borderRadius} px</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {[0, 2, 4, 8, 12].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => onChange({ ...config, borderRadius: r })}
                          className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                            config.borderRadius === r
                              ? "bg-slate-800 text-white border-slate-900"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {r === 0 ? "Sharp" : `${r}px`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
                      <span>Background Opacity:</span>
                      <span className="font-mono text-slate-700">
                        {Math.round(config.backgroundOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={config.backgroundOpacity}
                      onChange={(e) => onChange({ ...config, backgroundOpacity: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold mt-1">
                      <span>Transparent (0%)</span>
                      <span>Semi (50%)</span>
                      <span>Solid (100%)</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 3. TEXT FONT, COLOR AND TYPE CHANGE FACILITY */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3.5">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <i className="ph ph-text-aa text-emerald-600 text-sm"></i>
              3. Text Font, Color & Type Change Facility
            </label>

            {/* Font Family */}
            <div>
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                Font Family:
              </span>
              <select
                value={config.fontFamily}
                onChange={(e) => onChange({ ...config, fontFamily: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-2 outline-hidden focus:ring-2 focus:ring-emerald-500 transition-all"
              >
                {fontFamilies.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Text Color */}
            <div>
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1.5">
                Text Color:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="color"
                  value={config.textColor.startsWith("#") ? config.textColor : "#0f172a"}
                  onChange={(e) => onChange({ ...config, textColor: e.target.value })}
                  className="w-8 h-8 rounded-xl cursor-pointer border border-slate-300 p-0.5 shrink-0"
                  title="Choose custom text color"
                />
                {quickTextColors.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => onChange({ ...config, textColor: c.hex })}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 transition-all ${
                      config.textColor.toLowerCase() === c.hex.toLowerCase()
                        ? "border-slate-800 bg-slate-900 text-white shadow-xs"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.hex }} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size & Type / Style Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
                  <span>Font Size:</span>
                  <span className="font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    {config.fontSize.toFixed(1)} pt
                  </span>
                </div>
                <input
                  type="range"
                  min="3.5"
                  max="10"
                  step="0.2"
                  value={config.fontSize}
                  onChange={(e) => onChange({ ...config, fontSize: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
                <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold mt-1">
                  <span>Small (3.5)</span>
                  <span>Medium (5.6)</span>
                  <span>Large (10.0)</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-600 block mb-1">
                  Font Type & Styling:
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChange({ ...config, isBold: !config.isBold })}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-black border transition-all ${
                      config.isBold
                        ? "bg-slate-800 text-white border-slate-900 shadow-xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                    title="Toggle Bold weight"
                  >
                    <span className="font-black">B</span> Bold
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ...config, isItalic: !config.isItalic })}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold italic border transition-all ${
                      config.isItalic
                        ? "bg-slate-800 text-white border-slate-900 shadow-xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                    title="Toggle Italic style"
                  >
                    <span className="font-serif italic font-bold">I</span> Italic
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ...config, isUppercase: !config.isUppercase })}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      config.isUppercase
                        ? "bg-slate-800 text-white border-slate-900 shadow-xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                    title="Toggle Uppercase"
                  >
                    <span className="font-mono text-[10px]">AA</span> Caps
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 4. LEGEND PLACEMENT STYLE */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">
              Legend Display Mode:
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...config, style: "in-chart", show: true })}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                  config.style === "in-chart"
                    ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <i className="ph ph-hand-grabbing text-sm"></i>
                <span>In-Chart Box (Draggable)</span>
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...config, style: "bottom", show: true })}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                  config.style === "bottom"
                    ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <i className="ph ph-layout text-sm"></i>
                <span>Bottom Docked Strip</span>
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...config, style: "none", show: false })}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                  config.style === "none" || !config.show
                    ? "bg-slate-800 text-white border-slate-900 shadow-xs"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <i className="ph ph-eye-slash text-sm"></i>
                <span>Hidden (Off)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-150 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => applyPreset("reference")}
            className="text-xs font-bold text-slate-600 hover:text-emerald-700 flex items-center gap-1"
          >
            <i className="ph ph-arrow-counter-clockwise"></i>
            <span>Reset to Reference Style</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all flex items-center gap-1.5"
          >
            <i className="ph ph-check-circle text-sm"></i>
            <span>Apply & Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}
