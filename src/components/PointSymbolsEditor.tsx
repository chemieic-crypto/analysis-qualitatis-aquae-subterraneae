import React, { useState } from "react";
import {
  PointSymbol,
  AVAILABLE_POINT_SYMBOLS,
  PointSymbolIcon,
  getDistinctSymbol,
} from "./PointSymbol";

export interface SymbolItem {
  key: string;
  label: string;
  color: string;
  count?: number;
}

interface PointSymbolsEditorProps {
  items: SymbolItem[];
  pointSymbols: Record<string, PointSymbol>;
  onChangeSymbols: (nextSymbols: Record<string, PointSymbol>) => void;
  defaultSymbol: PointSymbol;
  onChangeDefaultSymbol: (sym: PointSymbol) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}

export default function PointSymbolsEditor({
  items,
  pointSymbols,
  onChangeSymbols,
  defaultSymbol,
  onChangeDefaultSymbol,
  onClose,
  title = "Point Symbol & Marker Studio",
  subtitle = "Customize point marker symbols for locations, districts, or categories",
}: PointSymbolsEditorProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredItems = items.filter((it) =>
    it.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSetAll = (symbol: PointSymbol) => {
    const next: Record<string, PointSymbol> = {};
    items.forEach((it) => {
      next[it.key] = symbol;
    });
    onChangeSymbols(next);
    onChangeDefaultSymbol(symbol);
  };

  const handleSetDistinct = () => {
    const next: Record<string, PointSymbol> = {};
    items.forEach((it, idx) => {
      next[it.key] = getDistinctSymbol(idx);
    });
    onChangeSymbols(next);
  };

  const handleItemSymbolChange = (key: string, symbol: PointSymbol) => {
    onChangeSymbols({
      ...pointSymbols,
      [key]: symbol,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-indigo-50/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
              <PointSymbolIcon symbol="diamond" color="#ffffff" size={18} stroke="#ffffff" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">{title}</h2>
              <p className="text-[11px] text-slate-500 font-medium">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm transition-all"
          >
            &times;
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-800">
          {/* Global Default Symbol Selection */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                Default Point Symbol
              </span>
              <span className="text-[10px] text-slate-500 font-bold">
                Applied to all unmatched markers
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {AVAILABLE_POINT_SYMBOLS.map((sym) => {
                const isSelected = defaultSymbol === sym.id;
                return (
                  <button
                    key={sym.id}
                    type="button"
                    onClick={() => {
                      onChangeDefaultSymbol(sym.id);
                    }}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border text-[10px] font-bold transition-all ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-400"
                        : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100"
                    }`}
                    title={sym.description}
                  >
                    <PointSymbolIcon
                      symbol={sym.id}
                      color={isSelected ? "#ffffff" : "#4f46e5"}
                      size={18}
                      stroke={isSelected ? "#ffffff" : "#4f46e5"}
                    />
                    <span className="mt-1 truncate max-w-full text-[9px]">{sym.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Presets:
            </span>
            <button
              type="button"
              onClick={handleSetDistinct}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black shadow-xs flex items-center gap-1.5 transition-all"
            >
              <span className="flex items-center gap-0.5">
                <PointSymbolIcon symbol="circle" color="#ffffff" size={10} stroke="#ffffff" />
                <PointSymbolIcon symbol="triangle" color="#ffffff" size={10} stroke="#ffffff" />
                <PointSymbolIcon symbol="square" color="#ffffff" size={10} stroke="#ffffff" />
                <PointSymbolIcon symbol="diamond" color="#ffffff" size={10} stroke="#ffffff" />
              </span>
              <span>Distinct Symbols for Locations</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetAll("circle")}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-200 transition-all"
            >
              All Circles
            </button>
            <button
              type="button"
              onClick={() => handleSetAll("triangle")}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-200 transition-all"
            >
              All Triangles
            </button>
            <button
              type="button"
              onClick={() => handleSetAll("diamond")}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-200 transition-all"
            >
              All Diamonds
            </button>
            <button
              type="button"
              onClick={() => handleSetAll("square")}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-200 transition-all"
            >
              All Squares
            </button>
            <button
              type="button"
              onClick={() => handleSetAll("star")}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-200 transition-all"
            >
              All Stars
            </button>
          </div>

          {/* Category / Location Symbol Mapping List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Active Filter Locations &amp; Categories ({items.length})
                </span>
                <p className="text-[10px] text-slate-400 font-medium">
                  Each location or category can have its own distinct symbol marker and color
                </p>
              </div>
              {items.length > 5 && (
                <input
                  type="text"
                  placeholder="Search locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-xs px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-44"
                />
              )}
            </div>

            {items.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No active locations or categories found for the selected filter.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 border border-slate-100 rounded-2xl p-2 bg-slate-50/50">
                {filteredItems.map((item) => {
                  const currentSym = pointSymbols[item.key] || defaultSymbol;
                  return (
                    <div
                      key={item.key}
                      className="pt-1.5 first:pt-0 flex items-center justify-between gap-3 px-2 py-1.5 hover:bg-white rounded-xl transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <PointSymbolIcon
                          symbol={currentSym}
                          color={item.color}
                          size={18}
                          stroke="#ffffff"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-800 break-words block leading-tight">
                            {item.label}
                          </span>
                          {item.count !== undefined && (
                            <span className="text-[9.5px] text-slate-400 font-medium">
                              {item.count} samples
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Symbol Picker Chips */}
                      <div className="flex items-center gap-1 shrink-0">
                        {AVAILABLE_POINT_SYMBOLS.map((s) => {
                          const isActive = currentSym === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleItemSymbolChange(item.key, s.id)}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                                isActive
                                  ? "bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300 scale-105"
                                  : "bg-white text-slate-500 hover:bg-slate-200 border border-slate-200"
                              }`}
                              title={`${item.label}: Set as ${s.label}`}
                            >
                              <PointSymbolIcon
                                symbol={s.id}
                                color={isActive ? "#ffffff" : item.color}
                                size={12}
                                stroke={isActive ? "#ffffff" : "#475569"}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium">
            Symbols apply to all diagram views and legend indicators.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md shadow-indigo-100 transition-all"
          >
            Apply &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}
