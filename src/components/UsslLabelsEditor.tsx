import React, { useState } from "react";

export interface LabelConfig {
  text: string;
  size: number;
  color: string;
  isBold: boolean;
  isItalic: boolean;
  fontFamily?: string;
  lineSpacing?: number;
}

interface UsslLabelsEditorProps {
  config: LabelConfig;
  onChange: (cfg: LabelConfig) => void;
  onClose: () => void;
  titleSuggestion?: { line1: string; line2: string };
  title?: string;
}

export default function UsslLabelsEditor({ config, onChange, onClose, titleSuggestion, title }: UsslLabelsEditorProps) {
  if (!config) return null;

  const lines = (config.text || "").split("\n");
  const isMultiLine = lines.length > 1;
  const [line1, setLine1] = useState(lines[0] || "");
  const [line2, setLine2] = useState(lines.slice(1).join(" ") || "");
  const [mode, setMode] = useState<"1line" | "2lines">(isMultiLine ? "2lines" : "1line");

  const quickColors = [
    { name: "Royal Blue (Publication)", hex: "#0000cc" },
    { name: "Deep Navy", hex: "#1e3a8a" },
    { name: "Crimson", hex: "#c00000" },
    { name: "Forest Green", hex: "#16a34a" },
    { name: "Dark Slate", hex: "#1e293b" },
    { name: "Charcoal", hex: "#0f172a" },
  ];

  const handleUpdate1Line = (val: string) => {
    setLine1(val);
    onChange({ ...config, text: val.replace(/\n+/g, " ").trim() });
  };

  const handleUpdate2Lines = (l1: string, l2: string) => {
    setLine1(l1);
    setLine2(l2);
    const combined = l2.trim() ? `${l1.trim()}\n${l2.trim()}` : l1.trim();
    onChange({ ...config, text: combined });
  };

  const handleSwitchTo1Line = () => {
    setMode("1line");
    const merged = `${line1} ${line2}`.replace(/\s+/g, " ").trim();
    setLine1(merged);
    setLine2("");
    onChange({ ...config, text: merged });
  };

  const handleSwitchTo2Lines = () => {
    setMode("2lines");
    if (!line2) {
      if (line1.includes(" (")) {
        const parts = line1.split(" (");
        const newL1 = parts[0].trim();
        const newL2 = `(${parts.slice(1).join(" (")}`.trim();
        setLine1(newL1);
        setLine2(newL2);
        onChange({ ...config, text: `${newL1}\n${newL2}` });
        return;
      }
      const words = line1.split(" ");
      if (words.length > 3) {
        const mid = Math.ceil(words.length / 2);
        const newL1 = words.slice(0, mid).join(" ");
        const newL2 = words.slice(mid).join(" ");
        setLine1(newL1);
        setLine2(newL2);
        onChange({ ...config, text: `${newL1}\n${newL2}` });
      } else {
        const newL2 = "(Pre-Monsoon 2025)";
        setLine2(newL2);
        onChange({ ...config, text: `${line1}\n${newL2}` });
      }
    } else {
      onChange({ ...config, text: `${line1}\n${line2}` });
    }
  };

  const handleApplyPublicationTemplate = () => {
    const l1 = titleSuggestion?.line1 || "Piper Diagram for Ground Water Quality Assessment";
    const l2 = titleSuggestion?.line2 || "(Pre-Monsoon 2025)";
    setMode("2lines");
    setLine1(l1);
    setLine2(l2);
    onChange({
      ...config,
      text: `${l1}\n${l2}`,
      color: "#0000cc",
      fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
      size: 13,
      isBold: true,
      isItalic: false,
    });
  };

  return (
    <div
      className="absolute z-[200] flex flex-col gap-3 bg-white/98 backdrop-blur-md p-4 rounded-2xl border-2 border-indigo-200/90 shadow-2xl shadow-slate-900/20 animate-fade-in max-w-xl w-[95%] sm:w-[540px]"
      style={{ top: "16px", left: "50%", transform: "translateX(-50%)" }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
          <span className="text-xs font-black uppercase tracking-wider text-slate-800">
            {title || "Chart Title Formatting Studio"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApplyPublicationTemplate}
            className="text-[10px] font-extrabold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
            title="Apply 2-line Royal Blue publication style from reference template"
          >
            <span>★ Image Template Preset</span>
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-rose-600 transition-colors p-1"
            title="Close Editor"
          >
            <span className="text-2xl font-bold leading-none">&times;</span>
          </button>
        </div>
      </div>

      {/* 1 Line or 2 Lines Toggle */}
      <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-xl border border-slate-200">
        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider pl-1">
          Title Layout:
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSwitchTo1Line}
            className={`text-xs font-bold px-3 py-1 rounded-lg transition-all ${
              mode === "1line"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            1 Line
          </button>
          <button
            type="button"
            onClick={handleSwitchTo2Lines}
            className={`text-xs font-bold px-3 py-1 rounded-lg transition-all ${
              mode === "2lines"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            2 Lines (Subtitled)
          </button>
        </div>
      </div>

      {/* Inputs */}
      {mode === "1line" ? (
        <div className="flex flex-col gap-1">
          <label className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest pl-1">
            Title Text (Single Line)
          </label>
          <input
            type="text"
            value={line1}
            onChange={(e) => handleUpdate1Line(e.target.value)}
            placeholder="Enter chart title..."
            className="text-xs font-bold text-slate-800 px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-col gap-1">
            <label className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest pl-1">
              Line 1 (Main Header)
            </label>
            <input
              type="text"
              value={line1}
              onChange={(e) => handleUpdate2Lines(e.target.value, line2)}
              placeholder="e.g. Piper Diagram for Ground Water of Uttar Pradesh, Bihar & Jharkhand"
              className="text-xs font-bold text-slate-800 px-3 py-1.5 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest pl-1">
              Line 2 (Subtitle / Season / Year)
            </label>
            <input
              type="text"
              value={line2}
              onChange={(e) => handleUpdate2Lines(line1, e.target.value)}
              placeholder="e.g. (Pre-Monsoon 2025)"
              className="text-xs font-bold text-slate-800 px-3 py-1.5 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
            />
          </div>
        </div>
      )}

      {/* Formatting Controls Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-end pt-1 border-t border-slate-100">
        <div className="flex flex-col gap-1">
          <label className="text-[9px] text-slate-500 uppercase font-black tracking-widest pl-1">
            Font Family
          </label>
          <select
            value={config.fontFamily || "sans-serif"}
            onChange={(e) => onChange({ ...config, fontFamily: e.target.value })}
            className="text-xs font-bold text-slate-700 px-2 py-1.5 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 bg-white"
          >
            <option value="'Playfair Display', Georgia, 'Times New Roman', serif">Serif (Publication)</option>
            <option value="sans-serif">Sans-Serif (Modern)</option>
            <option value="'Fira Code', monospace">Monospace</option>
            <option value="'Cabinet Grotesk', sans-serif">Cabinet Grotesk</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[9px] text-slate-500 uppercase font-black tracking-widest pl-1">
            Size (pt)
          </label>
          <input
            type="number"
            step="0.5"
            min="6"
            max="32"
            value={config.size}
            onChange={(e) => onChange({ ...config, size: parseFloat(e.target.value) || 12 })}
            className="text-xs font-bold text-slate-700 px-2 py-1.5 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 bg-white"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[9px] text-slate-500 uppercase font-black tracking-widest pl-1">
            Color
          </label>
          <div className="flex items-center gap-1.5">
            <div className="w-[30px] h-[30px] rounded-xl border border-slate-200 overflow-hidden relative shadow-2xs shrink-0">
              <input
                type="color"
                value={config.color}
                onChange={(e) => onChange({ ...config, color: e.target.value })}
                className="absolute -inset-4 w-20 h-20 cursor-pointer"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {quickColors.slice(0, 4).map((qc) => (
                <button
                  key={qc.hex}
                  type="button"
                  onClick={() => onChange({ ...config, color: qc.hex })}
                  className="w-4 h-4 rounded-full border border-slate-300 hover:scale-125 transition-transform shrink-0"
                  style={{ backgroundColor: qc.hex }}
                  title={qc.name}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pb-0.5">
          <button
            type="button"
            onClick={() => onChange({ ...config, isBold: !config.isBold })}
            className={`flex-1 h-[32px] flex items-center justify-center rounded-xl text-xs font-bold transition-all ${
              config.isBold
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
            title="Toggle Bold"
          >
            <b>B</b>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...config, isItalic: !config.isItalic })}
            className={`flex-1 h-[32px] flex items-center justify-center rounded-xl text-xs font-bold transition-all ${
              config.isItalic
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
            title="Toggle Italic"
          >
            <i>I</i>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
        <span>💡 Drag title on chart area with mouse anytime to reposition</span>
        <button
          type="button"
          onClick={onClose}
          className="text-indigo-600 font-bold hover:underline"
        >
          Done
        </button>
      </div>
    </div>
  );
}
