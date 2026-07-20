import React, { useState } from "react";
import { 
  SlidersHorizontal, 
  CircleDot, 
  Type, 
  Grid3X3, 
  Layout, 
  Download, 
  Eye, 
  Flame, 
  Compass, 
  Palette,
  ChevronDown,
  ChevronRight,
  Sparkles
} from "lucide-react";

export interface GraphSettings {
  // Theme
  theme: "light" | "dark" | "journal" | "presentation";

  // Markers
  markerSize: number;
  markerShape: "circle" | "square" | "triangle" | "diamond" | "triangle-down";
  markerBorderColor: string;
  markerBorderWidth: number;
  markerAlpha: number;
  categorySizes: Record<string, number>;

  // 3D Bubble
  use3DBubbles: boolean;
  bubbleScaleParam: string;
  bubbleMinSize: number;
  bubbleMaxSize: number;

  // Titles & Fonts
  titleText: string;
  titleFontFamily: string;
  titleFontSize: number;
  titleFontColor: string;
  titleFontWeight: "normal" | "bold" | "bolder";
  titleFontStyle: "normal" | "italic";

  xTitleText: string;
  xTitleFontFamily: string;
  xTitleFontSize: number;
  xTitleFontColor: string;
  xTitleFontWeight: "normal" | "bold";
  xTitleFontStyle: "normal" | "italic";
  xTitleRotation: number;

  yTitleText: string;
  yTitleFontFamily: string;
  yTitleFontSize: number;
  yTitleFontColor: string;
  yTitleFontWeight: "normal" | "bold";
  yTitleFontStyle: "normal" | "italic";
  yTitleRotation: number;

  legendTitleText: string;
  legendFontFamily: string;
  legendFontSize: number;
  legendFontColor: string;
  legendFontWeight: "normal" | "bold";

  ticksFontFamily: string;
  ticksFontSize: number;
  ticksFontColor: string;
  ticksFontWeight: "normal" | "bold";
  ticksRotation: number;

  // Axis & Ticks
  axisLineColor: string;
  axisLineThickness: number;
  tickColor: string;
  tickLength: number;
  tickWidth: number;
  tickDirection: "inward" | "outward";
  showMinorTicks: boolean;
  minorTickColor: string;
  minorTickLength: number;
  minorTickWidth: number;

  // Grid & Background
  gridlineColor: string;
  gridlineStyle: "Solid" | "Dash" | "Dot";
  gridlineAlpha: number;
  plotBgColor: string;
  chartBorderColor: string;
  chartBorderWidth: number;

  // Legend
  legendPosition: "bottom" | "right" | "top" | "left";
  legendBgColor: string;
  legendBorderColor: string;
  legendBorderRadius: number;

  // Margins & Padding
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  theme: "light",
  markerSize: 5,
  markerShape: "circle",
  markerBorderColor: "#ffffff",
  markerBorderWidth: 1,
  markerAlpha: 0.85,
  categorySizes: {},
  use3DBubbles: false,
  bubbleScaleParam: "",
  bubbleMinSize: 6,
  bubbleMaxSize: 20,
  titleText: "",
  titleFontFamily: "Inter",
  titleFontSize: 13,
  titleFontColor: "#1e293b",
  titleFontWeight: "bold",
  titleFontStyle: "normal",
  xTitleText: "",
  xTitleFontFamily: "Inter",
  xTitleFontSize: 11,
  xTitleFontColor: "#334155",
  xTitleFontWeight: "bold",
  xTitleFontStyle: "normal",
  xTitleRotation: 0,
  yTitleText: "",
  yTitleFontFamily: "Inter",
  yTitleFontSize: 11,
  yTitleFontColor: "#334155",
  yTitleFontWeight: "bold",
  yTitleFontStyle: "normal",
  yTitleRotation: 270,
  legendTitleText: "Categories",
  legendFontFamily: "Inter",
  legendFontSize: 10,
  legendFontColor: "#334155",
  legendFontWeight: "bold",
  ticksFontFamily: "Inter",
  ticksFontSize: 9,
  ticksFontColor: "#475569",
  ticksFontWeight: "normal",
  ticksRotation: 0,
  axisLineColor: "#cbd5e1",
  axisLineThickness: 1,
  tickColor: "#cbd5e1",
  tickLength: 5,
  tickWidth: 1,
  tickDirection: "outward",
  showMinorTicks: true,
  minorTickColor: "#f1f5f9",
  minorTickLength: 3,
  minorTickWidth: 1,
  gridlineColor: "#f1f5f9",
  gridlineStyle: "Dash",
  gridlineAlpha: 0.8,
  plotBgColor: "transparent",
  chartBorderColor: "#cbd5e1",
  chartBorderWidth: 1,
  legendPosition: "bottom",
  legendBgColor: "rgba(255,255,255,0.9)",
  legendBorderColor: "#e2e8f0",
  legendBorderRadius: 8,
  marginLeft: 70,
  marginRight: 50,
  marginTop: 60,
  marginBottom: 70,
};

const FONT_FAMILIES = [
  "Inter",
  "Arial",
  "Times New Roman",
  "Calibri",
  "Cambria",
  "Helvetica",
  "Georgia",
  "JetBrains Mono"
];

interface GraphSettingsPanelProps {
  settings: GraphSettings;
  onChange: (updater: (prev: GraphSettings) => GraphSettings) => void;
  availableBubbleParams: string[];
  categories: string[];
  onExport: (format: "png300" | "png600" | "svg" | "pdf") => void;
}

export default function GraphSettingsPanel({
  settings,
  onChange,
  availableBubbleParams,
  categories,
  onExport
}: GraphSettingsPanelProps) {
  // Collapsible sections state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    theme: true,
    markers: false,
    bubbles: false,
    axisTicks: false,
    titlesFonts: false,
    gridBg: false,
    legend: false,
    export: true
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const updateSetting = <K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) => {
    onChange(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleResetCategorySizes = () => {
    onChange(prev => ({
      ...prev,
      categorySizes: {}
    }));
  };

  return (
    <div className="space-y-4">
      {/* SECTION: PUBLICATION THEME */}
      <div className="glossy-panel rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("theme")}
          className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors text-left cursor-pointer border-b border-slate-100"
        >
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-indigo-600" />
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Publication Theme</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Preset designs for papers</p>
            </div>
          </div>
          {openSections.theme ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </button>

        {openSections.theme && (
          <div className="p-4 grid grid-cols-2 gap-2">
            {[
              { id: "light", name: "☀️ Light", desc: "Clean modern gray/white" },
              { id: "dark", name: "🌙 Dark", desc: "Sleek glowing presentation" },
              { id: "journal", name: "📄 Journal", desc: "B&W high-contrast serif" },
              { id: "presentation", name: "✨ Presentation", desc: "Bold, colorful, oversized" }
            ].map(themeOpt => (
              <button
                key={themeOpt.id}
                onClick={() => updateSetting("theme", themeOpt.id as any)}
                className={`text-left p-3 rounded-xl border transition-all text-[11px] font-bold ${
                  settings.theme === themeOpt.id
                    ? "bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-200"
                    : "bg-white border-slate-250 hover:border-slate-350 text-slate-700"
                }`}
              >
                <div className="font-extrabold">{themeOpt.name}</div>
                <div className="text-[9px] text-slate-400 font-medium leading-tight mt-0.5">{themeOpt.desc}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SECTION: MARKERS */}
      <div className="glossy-panel rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("markers")}
          className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors text-left cursor-pointer border-b border-slate-100"
        >
          <div className="flex items-center gap-2">
            <CircleDot className="w-4 h-4 text-amber-600" />
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Point & Marker Styling</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 font-sans">Shape, border, size and opacity</p>
            </div>
          </div>
          {openSections.markers ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </button>

        {openSections.markers && (
          <div className="p-4 space-y-4">
            {/* SHAPE */}
            <div className="space-y-1">
              <label className="text-[9.5px] font-black text-slate-500 uppercase block">Marker Shape</label>
              <select
                value={settings.markerShape}
                onChange={(e) => updateSetting("markerShape", e.target.value as any)}
                className="w-full text-xs p-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="circle">● Circle</option>
                <option value="square">■ Square</option>
                <option value="triangle">▲ Triangle Up</option>
                <option value="triangle-down">▼ Triangle Down</option>
                <option value="diamond">◆ Diamond</option>
              </select>
            </div>

            {/* GLOBAL SIZE */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9.5px] font-black text-slate-500 uppercase">
                <span>Base Marker Size</span>
                <span className="font-mono text-slate-700">{settings.markerSize}px</span>
              </div>
              <input
                type="range"
                min="2"
                max="16"
                step="1"
                value={settings.markerSize}
                onChange={(e) => updateSetting("markerSize", parseInt(e.target.value))}
                className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-100"
              />
            </div>

            {/* TRANSPARENCY */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9.5px] font-black text-slate-500 uppercase">
                <span>Marker Opacity (Alpha)</span>
                <span className="font-mono text-slate-700">{Math.round(settings.markerAlpha * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={settings.markerAlpha}
                onChange={(e) => updateSetting("markerAlpha", parseFloat(e.target.value))}
                className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-100"
              />
            </div>

            {/* BORDERS */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Border Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={settings.markerBorderColor}
                    onChange={(e) => updateSetting("markerBorderColor", e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                  />
                  <input
                    type="text"
                    value={settings.markerBorderColor}
                    onChange={(e) => updateSetting("markerBorderColor", e.target.value)}
                    className="w-full text-xs font-mono px-2 py-1 bg-slate-50 rounded-lg border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[9.5px] font-black text-slate-500 uppercase">
                  <span>Border Width</span>
                  <span className="font-mono text-slate-700">{settings.markerBorderWidth}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="1"
                  value={settings.markerBorderWidth}
                  onChange={(e) => updateSetting("markerBorderWidth", parseInt(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-100 mt-2"
                />
              </div>
            </div>

            {/* CATEGORY SPECIFIC SIZES */}
            {categories.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider block">
                    Category Size Overrides
                  </label>
                  {Object.keys(settings.categorySizes).length > 0 && (
                    <button
                      onClick={handleResetCategorySizes}
                      className="text-[8.5px] text-rose-600 hover:text-rose-800 font-black uppercase tracking-wider"
                    >
                      Reset All
                    </button>
                  )}
                </div>

                <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1">
                  {categories.map(cat => {
                    const currentVal = settings.categorySizes[cat] ?? settings.markerSize;
                    return (
                      <div key={cat} className="flex items-center justify-between gap-3 bg-slate-50/70 p-2 rounded-xl border border-slate-150">
                        <span className="text-[9.5px] font-black text-slate-600 truncate max-w-[130px]" title={cat}>
                          {cat}
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="2"
                            max="18"
                            step="1"
                            value={currentVal}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              onChange(prev => ({
                                ...prev,
                                categorySizes: {
                                  ...prev.categorySizes,
                                  [cat]: val
                                }
                              }));
                            }}
                            className="w-20 accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-200"
                          />
                          <span className="text-[9.5px] font-mono font-black text-slate-700 w-4 text-right">
                            {currentVal}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION: 3D BUBBLE */}
      <div className="glossy-panel rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("bubbles")}
          className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors text-left cursor-pointer border-b border-slate-100"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>3D Bubble & Gradings</span>
                <span className="bg-indigo-100 text-indigo-700 text-[8px] px-1.5 py-0.5 rounded-full font-extrabold uppercase tracking-wide">Glossy</span>
              </h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Scale size based on chemistry</p>
            </div>
          </div>
          {openSections.bubbles ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </button>

        {openSections.bubbles && (
          <div className="p-4 space-y-4">
            {/* ENABLE/DISABLE */}
            <div className="flex items-center justify-between bg-indigo-50/40 p-3 rounded-xl border border-indigo-100">
              <div className="space-y-0.5">
                <span className="text-[10px] font-black text-slate-800 uppercase">Glossy 3D Bubbles</span>
                <p className="text-[8.5px] text-slate-500 font-bold leading-tight">Apply radial highlights and scaling</p>
              </div>
              <input
                type="checkbox"
                checked={settings.use3DBubbles}
                onChange={(e) => updateSetting("use3DBubbles", e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            {settings.use3DBubbles && (
              <>
                {/* PARAMETER SCALING */}
                <div className="space-y-1">
                  <label className="text-[9.5px] font-black text-slate-500 uppercase block">Bubble Size Source Column</label>
                  <select
                    value={settings.bubbleScaleParam}
                    onChange={(e) => updateSetting("bubbleScaleParam", e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">-- Select Chemistry Column --</option>
                    {availableBubbleParams.map(p => (
                      <option key={p} value={p}>🧪 {p}</option>
                    ))}
                  </select>
                  <p className="text-[8.5px] text-slate-400 font-bold uppercase mt-1">Bubble sizes will scale linearly with this column's values</p>
                </div>

                {/* BUBBLE SIZE RANGE */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9.5px] font-black text-slate-500 uppercase">
                      <span>Min Size</span>
                      <span className="font-mono text-slate-700">{settings.bubbleMinSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="16"
                      step="1"
                      value={settings.bubbleMinSize}
                      onChange={(e) => updateSetting("bubbleMinSize", parseInt(e.target.value))}
                      className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-100"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[9.5px] font-black text-slate-500 uppercase">
                      <span>Max Size</span>
                      <span className="font-mono text-slate-700">{settings.bubbleMaxSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="12"
                      max="32"
                      step="1"
                      value={settings.bubbleMaxSize}
                      onChange={(e) => updateSetting("bubbleMaxSize", parseInt(e.target.value))}
                      className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-100"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* SECTION: AXIS & TICKS */}
      <div className="glossy-panel rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("axisTicks")}
          className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors text-left cursor-pointer border-b border-slate-100"
        >
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-indigo-600" />
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Axis Lines & Ticks</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Color, thickness, major & minor ticks</p>
            </div>
          </div>
          {openSections.axisTicks ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </button>

        {openSections.axisTicks && (
          <div className="p-4 space-y-4 text-slate-700">
            {/* AXIS LINES */}
            <div className="grid grid-cols-2 gap-3 border-b border-slate-100 pb-3">
              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Axis Line Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={settings.axisLineColor}
                    onChange={(e) => updateSetting("axisLineColor", e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                  />
                  <input
                    type="text"
                    value={settings.axisLineColor}
                    onChange={(e) => updateSetting("axisLineColor", e.target.value)}
                    className="w-full text-xs font-mono px-2 py-1 bg-slate-50 rounded-lg border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[9.5px] font-black text-slate-500 uppercase">
                  <span>Axis Thickness</span>
                  <span className="font-mono text-slate-700">{settings.axisLineThickness}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="0.5"
                  value={settings.axisLineThickness}
                  onChange={(e) => updateSetting("axisLineThickness", parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-100 mt-2"
                />
              </div>
            </div>

            {/* TICK CONFIGURATION */}
            <div className="grid grid-cols-2 gap-3 border-b border-slate-100 pb-3">
              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Tick Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={settings.tickColor}
                    onChange={(e) => updateSetting("tickColor", e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                  />
                  <input
                    type="text"
                    value={settings.tickColor}
                    onChange={(e) => updateSetting("tickColor", e.target.value)}
                    className="w-full text-xs font-mono px-2 py-1 bg-slate-50 rounded-lg border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Tick Direction</label>
                <select
                  value={settings.tickDirection}
                  onChange={(e) => updateSetting("tickDirection", e.target.value as any)}
                  className="w-full text-xs p-2 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                >
                  <option value="outward">↗ Outward</option>
                  <option value="inward">↙ Inward</option>
                </select>
              </div>
            </div>

            {/* TICK DIMENSIONS */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[9.5px] font-black text-slate-500 uppercase">
                  <span>Tick Length</span>
                  <span className="font-mono text-slate-700">{settings.tickLength}px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="12"
                  step="1"
                  value={settings.tickLength}
                  onChange={(e) => updateSetting("tickLength", parseInt(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-100"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[9.5px] font-black text-slate-500 uppercase">
                  <span>Tick Width</span>
                  <span className="font-mono text-slate-700">{settings.tickWidth}px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.5"
                  value={settings.tickWidth}
                  onChange={(e) => updateSetting("tickWidth", parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-100"
                />
              </div>
            </div>

            {/* MINOR TICKS toggle */}
            <div className="border-t border-slate-100 pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-800 uppercase">Show Minor Ticks</span>
                <input
                  type="checkbox"
                  checked={settings.showMinorTicks}
                  onChange={(e) => updateSetting("showMinorTicks", e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              {settings.showMinorTicks && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-150">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase block">Minor Tick Color</label>
                    <input
                      type="color"
                      value={settings.minorTickColor}
                      onChange={(e) => updateSetting("minorTickColor", e.target.value)}
                      className="w-full h-8 rounded-lg cursor-pointer border border-slate-200"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase">
                      <span>Length</span>
                      <span className="font-mono">{settings.minorTickLength}px</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="6"
                      step="1"
                      value={settings.minorTickLength}
                      onChange={(e) => updateSetting("minorTickLength", parseInt(e.target.value))}
                      className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-200"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION: TITLES & FONTS */}
      <div className="glossy-panel rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("titlesFonts")}
          className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors text-left cursor-pointer border-b border-slate-100"
        >
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-indigo-600" />
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Titles, Fonts & Labels</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Axis/plot titles and typography options</p>
            </div>
          </div>
          {openSections.titlesFonts ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </button>

        {openSections.titlesFonts && (
          <div className="p-4 space-y-4">
            {/* CORE FONT FAMILY SELECTION */}
            <div className="bg-indigo-50/20 p-3 rounded-xl border border-indigo-50 space-y-1">
              <label className="text-[9.5px] font-black text-slate-500 uppercase block">Global Font Pair Override</label>
              <select
                value={settings.titleFontFamily}
                onChange={(e) => {
                  const f = e.target.value;
                  onChange(prev => ({
                    ...prev,
                    titleFontFamily: f,
                    xTitleFontFamily: f,
                    yTitleFontFamily: f,
                    legendFontFamily: f,
                    ticksFontFamily: f
                  }));
                }}
                className="w-full text-xs p-2 rounded-xl bg-white border border-slate-200 font-bold"
              >
                {FONT_FAMILIES.map(font => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
            </div>

            {/* ACCORDION/TAB FOR DIFFERENT TEXT BLOCKS */}
            <div className="space-y-4 border-t border-slate-100 pt-3">
              {/* PLOT TITLE */}
              <div className="space-y-2 bg-slate-50/50 p-3 rounded-xl border border-slate-150">
                <span className="text-[10px] font-black text-slate-700 uppercase block">Main Plot Title</span>
                <input
                  type="text"
                  placeholder="Leave empty for auto-generated title"
                  value={settings.titleText}
                  onChange={(e) => updateSetting("titleText", e.target.value)}
                  className="w-full text-xs px-2.5 py-2 bg-white rounded-xl border border-slate-200 font-bold text-slate-800 placeholder-slate-400"
                />
                <div className="grid grid-cols-2 gap-2 text-[9.5px]">
                  <div>
                    <label className="text-slate-500 uppercase font-black block mb-0.5">Font Size</label>
                    <input
                      type="number"
                      value={settings.titleFontSize}
                      onChange={(e) => updateSetting("titleFontSize", parseInt(e.target.value) || 12)}
                      className="w-full px-2 py-1 bg-white rounded-lg border border-slate-200 font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 uppercase font-black block mb-0.5">Font Color</label>
                    <input
                      type="color"
                      value={settings.titleFontColor}
                      onChange={(e) => updateSetting("titleFontColor", e.target.value)}
                      className="w-full h-7 rounded-lg cursor-pointer border border-slate-250"
                    />
                  </div>
                </div>
              </div>

              {/* X-AXIS TITLE */}
              <div className="space-y-2 bg-slate-50/50 p-3 rounded-xl border border-slate-150">
                <span className="text-[10px] font-black text-slate-700 uppercase block">X-Axis Label Customization</span>
                <input
                  type="text"
                  placeholder="Leave empty for default parameter"
                  value={settings.xTitleText}
                  onChange={(e) => updateSetting("xTitleText", e.target.value)}
                  className="w-full text-xs px-2.5 py-2 bg-white rounded-xl border border-slate-200 font-bold text-slate-800 placeholder-slate-400"
                />
                <div className="grid grid-cols-2 gap-2 text-[9.5px]">
                  <div>
                    <label className="text-slate-500 uppercase font-black block mb-0.5">Font Size</label>
                    <input
                      type="number"
                      value={settings.xTitleFontSize}
                      onChange={(e) => updateSetting("xTitleFontSize", parseInt(e.target.value) || 10)}
                      className="w-full px-2 py-1 bg-white rounded-lg border border-slate-200 font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 uppercase font-black block mb-0.5">Text Rotation</label>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      step="15"
                      value={settings.xTitleRotation}
                      onChange={(e) => updateSetting("xTitleRotation", parseInt(e.target.value))}
                      className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-200 mt-2"
                    />
                  </div>
                </div>
              </div>

              {/* Y-AXIS TITLE */}
              <div className="space-y-2 bg-slate-50/50 p-3 rounded-xl border border-slate-150">
                <span className="text-[10px] font-black text-slate-700 uppercase block">Y-Axis Label Customization</span>
                <input
                  type="text"
                  placeholder="Leave empty for default parameter"
                  value={settings.yTitleText}
                  onChange={(e) => updateSetting("yTitleText", e.target.value)}
                  className="w-full text-xs px-2.5 py-2 bg-white rounded-xl border border-slate-200 font-bold text-slate-800 placeholder-slate-400"
                />
                <div className="grid grid-cols-2 gap-2 text-[9.5px]">
                  <div>
                    <label className="text-slate-500 uppercase font-black block mb-0.5">Font Size</label>
                    <input
                      type="number"
                      value={settings.yTitleFontSize}
                      onChange={(e) => updateSetting("yTitleFontSize", parseInt(e.target.value) || 10)}
                      className="w-full px-2 py-1 bg-white rounded-lg border border-slate-200 font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 uppercase font-black block mb-0.5">Text Rotation</label>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="45"
                      value={settings.yTitleRotation}
                      onChange={(e) => updateSetting("yTitleRotation", parseInt(e.target.value))}
                      className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-200 mt-2"
                    />
                  </div>
                </div>
              </div>

              {/* TICK LABELS */}
              <div className="space-y-2 bg-slate-50/50 p-3 rounded-xl border border-slate-150">
                <span className="text-[10px] font-black text-slate-700 uppercase block">Tick Value Labels</span>
                <div className="grid grid-cols-2 gap-2 text-[9.5px]">
                  <div>
                    <label className="text-slate-500 uppercase font-black block mb-0.5">Font Size</label>
                    <input
                      type="number"
                      value={settings.ticksFontSize}
                      onChange={(e) => updateSetting("ticksFontSize", parseInt(e.target.value) || 8)}
                      className="w-full px-2 py-1 bg-white rounded-lg border border-slate-200 font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 uppercase font-black block mb-0.5">Label Rotation</label>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      step="15"
                      value={settings.ticksRotation}
                      onChange={(e) => updateSetting("ticksRotation", parseInt(e.target.value))}
                      className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-200 mt-2"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION: GRID & BACKGROUND */}
      <div className="glossy-panel rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("gridBg")}
          className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors text-left cursor-pointer border-b border-slate-100"
        >
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-4 h-4 text-indigo-600" />
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Grid, Margins & Background</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Plot bounds, margins, and gridlines</p>
            </div>
          </div>
          {openSections.gridBg ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </button>

        {openSections.gridBg && (
          <div className="p-4 space-y-4">
            {/* GRIDLINE COLOR & STYLE */}
            <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Gridline Color</label>
                <input
                  type="color"
                  value={settings.gridlineColor}
                  onChange={(e) => updateSetting("gridlineColor", e.target.value)}
                  className="w-full h-8 rounded-lg cursor-pointer border border-slate-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Gridline Style</label>
                <select
                  value={settings.gridlineStyle}
                  onChange={(e) => updateSetting("gridlineStyle", e.target.value as any)}
                  className="w-full text-xs p-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700"
                >
                  <option value="Solid">─ Solid</option>
                  <option value="Dash">╌ Dashed</option>
                  <option value="Dot">… Dotted</option>
                </select>
              </div>
            </div>

            {/* GRID OPACITY */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9.5px] font-black text-slate-500 uppercase">
                <span>Gridline Opacity</span>
                <span className="font-mono text-slate-700">{Math.round(settings.gridlineAlpha * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={settings.gridlineAlpha}
                onChange={(e) => updateSetting("gridlineAlpha", parseFloat(e.target.value))}
                className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-100"
              />
            </div>

            {/* CHART BACKGROUND & BORDER */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100 pt-3">
              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Chart BG Color</label>
                <select
                  value={settings.plotBgColor === "transparent" ? "transparent" : settings.plotBgColor}
                  onChange={(e) => updateSetting("plotBgColor", e.target.value)}
                  className="w-full text-xs p-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700"
                >
                  <option value="transparent">⚪ Transparent</option>
                  <option value="#ffffff">⬜ Pure White</option>
                  <option value="#fafafa">🌫️ Soft Off-White</option>
                  <option value="#f8fafc">🌊 Light Slate</option>
                  <option value="#0f172a">🌑 Cosmic Dark</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Border Color</label>
                <input
                  type="color"
                  value={settings.chartBorderColor}
                  onChange={(e) => updateSetting("chartBorderColor", e.target.value)}
                  className="w-full h-8 rounded-lg cursor-pointer border border-slate-200"
                />
              </div>
            </div>

            {/* MARGIN CONTROLS (BENTO GRID STYLE) */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <span className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider block">
                Plot Padding & Margins (px)
              </span>
              <div className="grid grid-cols-4 gap-2 text-center text-[9.5px] font-bold">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-150">
                  <span className="text-slate-450 uppercase text-[8px] block">Top</span>
                  <input
                    type="number"
                    value={settings.marginTop}
                    onChange={(e) => updateSetting("marginTop", parseInt(e.target.value) || 0)}
                    className="w-full text-center bg-white border border-slate-200 rounded font-mono font-black py-0.5 mt-1"
                  />
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-150">
                  <span className="text-slate-450 uppercase text-[8px] block">Right</span>
                  <input
                    type="number"
                    value={settings.marginRight}
                    onChange={(e) => updateSetting("marginRight", parseInt(e.target.value) || 0)}
                    className="w-full text-center bg-white border border-slate-200 rounded font-mono font-black py-0.5 mt-1"
                  />
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-150">
                  <span className="text-slate-450 uppercase text-[8px] block">Bottom</span>
                  <input
                    type="number"
                    value={settings.marginBottom}
                    onChange={(e) => updateSetting("marginBottom", parseInt(e.target.value) || 0)}
                    className="w-full text-center bg-white border border-slate-200 rounded font-mono font-black py-0.5 mt-1"
                  />
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-150">
                  <span className="text-slate-450 uppercase text-[8px] block">Left</span>
                  <input
                    type="number"
                    value={settings.marginLeft}
                    onChange={(e) => updateSetting("marginLeft", parseInt(e.target.value) || 0)}
                    className="w-full text-center bg-white border border-slate-200 rounded font-mono font-black py-0.5 mt-1"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION: LEGEND */}
      <div className="glossy-panel rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("legend")}
          className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors text-left cursor-pointer border-b border-slate-100"
        >
          <div className="flex items-center gap-2">
            <Layout className="w-4 h-4 text-indigo-600" />
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Legend Style</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Placement, outline, background</p>
            </div>
          </div>
          {openSections.legend ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </button>

        {openSections.legend && (
          <div className="p-4 space-y-4">
            {/* POSITION & TITLE */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Legend Position</label>
                <select
                  value={settings.legendPosition}
                  onChange={(e) => updateSetting("legendPosition", e.target.value as any)}
                  className="w-full text-xs p-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700"
                >
                  <option value="bottom">⬇️ Bottom</option>
                  <option value="right">➡️ Right</option>
                  <option value="top">⬆️ Top</option>
                  <option value="left">⬅️ Left</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Legend Header</label>
                <input
                  type="text"
                  value={settings.legendTitleText}
                  onChange={(e) => updateSetting("legendTitleText", e.target.value)}
                  className="w-full text-xs px-2 py-1.5 bg-slate-50 rounded-xl border border-slate-200 font-bold text-slate-800"
                />
              </div>
            </div>

            {/* STYLE DETAILS */}
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Legend BG</label>
                <input
                  type="color"
                  value={settings.legendBgColor.startsWith("rgba") ? "#ffffff" : settings.legendBgColor}
                  onChange={(e) => updateSetting("legendBgColor", e.target.value)}
                  className="w-full h-8 rounded-lg cursor-pointer border border-slate-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-500 uppercase block">Border Color</label>
                <input
                  type="color"
                  value={settings.legendBorderColor}
                  onChange={(e) => updateSetting("legendBorderColor", e.target.value)}
                  className="w-full h-8 rounded-lg cursor-pointer border border-slate-200"
                />
              </div>
            </div>

            {/* BORDER RADIUS */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9.5px] font-black text-slate-500 uppercase">
                <span>Legend Rounded Corners</span>
                <span className="font-mono text-slate-700">{settings.legendBorderRadius}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="16"
                step="2"
                value={settings.legendBorderRadius}
                onChange={(e) => updateSetting("legendBorderRadius", parseInt(e.target.value))}
                className="w-full accent-indigo-600 h-1.5 rounded-full cursor-pointer bg-slate-100"
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION: EXPORT */}
      <div className="glossy-panel rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("export")}
          className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors text-left cursor-pointer border-b border-slate-100"
        >
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-emerald-600" />
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">High-Resolution Export</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">PNG, SVG & PDF publication formats</p>
            </div>
          </div>
          {openSections.export ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </button>

        {openSections.export && (
          <div className="p-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onExport("png300")}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
              >
                <Download className="w-3.5 h-3.5" /> PNG 300 DPI
              </button>
              <button
                onClick={() => onExport("png600")}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
              >
                <Download className="w-3.5 h-3.5" /> PNG 600 DPI
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => onExport("svg")}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
              >
                <Download className="w-3.5 h-3.5" /> Vector SVG
              </button>
              <button
                onClick={() => onExport("pdf")}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
              >
                <Download className="w-3.5 h-3.5" /> Vector PDF
              </button>
            </div>

            <p className="text-[8px] text-slate-400 font-bold uppercase text-center mt-2">
              ⚠️ Vector exports preserve crystal-clear text sharpness when scaled indefinitely.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
