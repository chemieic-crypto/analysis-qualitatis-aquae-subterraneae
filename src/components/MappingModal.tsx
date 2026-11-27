import React, { useState, useEffect, useMemo } from "react";
import { DataHeaders } from "../types";
import { PARAM_CONFIG } from "../data/config";
import { GitMerge, X, CheckCircle, MapPin, FlaskConical, Download, Sparkles } from "lucide-react";
import { downloadWaterQualityTemplate } from "../utils/templateGenerator";
import { previewCaseDuplicates } from "../utils/textNormalization";

interface MappingModalProps {
  isOpen: boolean;
  uploadedHeaders: string[];
  initialHeaders: DataHeaders;
  initialHeaderMap: Record<string, string>;
  previewRows?: Record<string, any>[];
  onSave: (mappedHeaders: DataHeaders, headerMap: Record<string, string>, autoProperCase?: boolean) => void;
  onCancel: () => void;
}

export default function MappingModal({
  isOpen,
  uploadedHeaders,
  initialHeaders,
  initialHeaderMap,
  previewRows = [],
  onSave,
  onCancel,
}: MappingModalProps) {
  const [stateCol, setStateCol] = useState("");
  const [districtCol, setDistrictCol] = useState("");
  const [blockCol, setBlockCol] = useState("");
  const [wellIdCol, setWellIdCol] = useState("");
  const [locationCol, setLocationCol] = useState("");
  const [lonCol, setLonCol] = useState("");
  const [latCol, setLatCol] = useState("");
  const [yearCol, setYearCol] = useState("");
  const [seasonCol, setSeasonCol] = useState("");
  const [aquiferCol, setAquiferCol] = useState("");
  const [sourceCol, setSourceCol] = useState("");
  const [depthCol, setDepthCol] = useState("");
  const [autoProperCase, setAutoProperCase] = useState(true);

  // Parameter mappings: key is PARAM_CONFIG key, value is uploaded Excel header
  const [paramMappings, setParamMappings] = useState<Record<string, string>>({});

  const casePreview = useMemo(() => {
    if (!isOpen || !previewRows.length) {
      return { mergedCaseVariantsCount: 0, cellsToNormalizeCount: 0, affectedColumns: [] as string[], mergedExamples: [] as Array<{ column: string; variants: string[]; mergedTo: string }> };
    }
    return previewCaseDuplicates(previewRows, {
      state: stateCol || undefined,
      district: districtCol || undefined,
      block: blockCol || undefined,
      wellId: wellIdCol || undefined,
      location: locationCol || undefined,
      longitude: lonCol || undefined,
      latitude: latCol || undefined,
      year: yearCol || undefined,
      season: seasonCol || undefined,
      aquifer: aquiferCol || undefined,
      source: sourceCol || undefined,
      depth: depthCol || undefined,
      params: Object.values(paramMappings).filter(Boolean)
    });
  }, [isOpen, previewRows, stateCol, districtCol, blockCol, wellIdCol, locationCol, lonCol, latCol, yearCol, seasonCol, aquiferCol, sourceCol, depthCol, paramMappings]);

  useEffect(() => {
    if (isOpen) {
      setAutoProperCase(true);
      setStateCol(initialHeaders.state || "");
      setDistrictCol(initialHeaders.district || "");
      setBlockCol(initialHeaders.block || "");
      setWellIdCol(initialHeaders.wellId || "");
      setLocationCol(initialHeaders.location || "");
      setLonCol(initialHeaders.longitude || "");
      setLatCol(initialHeaders.latitude || "");
      setYearCol(initialHeaders.year || "");
      setSeasonCol(initialHeaders.season || "");
      setAquiferCol(initialHeaders.aquifer || "");
      setSourceCol(initialHeaders.source || "");
      setDepthCol(initialHeaders.depth || "");

      // Invert initialHeaderMap to match param keys
      const mapping: Record<string, string> = {};
      Object.keys(PARAM_CONFIG).forEach((paramKey) => {
        const foundExcelHeader = Object.keys(initialHeaderMap).find(
          (k) => initialHeaderMap[k] === paramKey
        );
        mapping[paramKey] = foundExcelHeader || "";
      });
      setParamMappings(mapping);
    }
  }, [isOpen, initialHeaders, initialHeaderMap]);

  if (!isOpen) return null;

  const handleParamChange = (paramKey: string, excelHeader: string) => {
    setParamMappings((prev) => ({
      ...prev,
      [paramKey]: excelHeader,
    }));
  };

  const handleConfirm = () => {
    const finalHeaders: DataHeaders = {
      state: stateCol || undefined,
      district: districtCol || undefined,
      block: blockCol || undefined,
      wellId: wellIdCol || undefined,
      location: locationCol || undefined,
      longitude: lonCol || undefined,
      latitude: latCol || undefined,
      year: yearCol || undefined,
      season: seasonCol || undefined,
      aquifer: aquiferCol || undefined,
      source: sourceCol || undefined,
      depth: depthCol || undefined,
      params: [],
    };

    const finalHeaderMap: Record<string, string> = {};

    Object.entries(paramMappings).forEach(([paramKey, excelHeader]) => {
      const headerStr = excelHeader as string;
      if (headerStr) {
        if (!finalHeaders.params.includes(paramKey)) {
          finalHeaders.params.push(paramKey);
        }
        if (!finalHeaders.params.includes(headerStr)) {
          finalHeaders.params.push(headerStr);
        }
        finalHeaderMap[headerStr] = paramKey;
        finalHeaderMap[paramKey] = headerStr;
      }
    });

    onSave(finalHeaders, finalHeaderMap, autoProperCase);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="glossy-panel rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-white/50 bg-emerald-50/50 backdrop-blur flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-bold text-emerald-900 flex items-center gap-2 drop-shadow-md">
              <GitMerge className="text-emerald-600 w-5 h-5" /> Map Excel Columns
            </h2>
            <p className="text-xs font-bold text-emerald-700 mt-1 opacity-80">
              Verify how your uploaded spreadsheet columns match our hydrochemical compliance parameters
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadWaterQualityTemplate}
              className="px-3 py-1.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm transition-all"
              title="Download standard Excel template with static details & units"
            >
              <Download className="w-3.5 h-3.5 text-white" /> Download Template (.xlsx)
            </button>
            <button onClick={onCancel} className="text-slate-400 hover:text-rose-500 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Mappings Form */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">

          {/* Auto Proper Case & Case-Insensitive Merging Option (Enabled by Default) */}
          <div className="bg-emerald-50/85 border border-emerald-200/80 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-start gap-3 cursor-pointer select-none flex-1">
              <input
                type="checkbox"
                checked={autoProperCase}
                onChange={(e) => setAutoProperCase(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-emerald-600 cursor-pointer shrink-0"
              />
              <div>
                <div className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Auto-Merge UPPER / lower Case Duplicates into Proper Case
                </div>
                <p className="text-[11px] font-medium text-emerald-800/90 mt-0.5 leading-relaxed">
                  Automatically combines entries with identical spelling regardless of letter case (e.g.{" "}
                  <span className="font-mono font-bold">RAJASTHAN</span>,{" "}
                  <span className="font-mono font-bold">rajasthan</span> →{" "}
                  <span className="font-bold">Rajasthan</span>) across State, District, Block, Location, Source, Aquifer &amp; Season so tables never split duplicates.
                </p>
                {casePreview.mergedExamples.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {casePreview.mergedExamples.slice(0, 4).map((ex, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/90 border border-emerald-200 text-[10px] font-semibold text-emerald-900"
                      >
                        <span className="text-slate-500">{ex.column}:</span>
                        <span className="line-through text-rose-600/80">{ex.variants.join(" / ")}</span>
                        <span>→</span>
                        <span className="font-extrabold text-emerald-700">{ex.mergedTo}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <div className="shrink-0 text-right">
              {casePreview.mergedCaseVariantsCount > 0 ? (
                <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-extrabold shadow-sm">
                  {casePreview.mergedCaseVariantsCount} Case Duplicate{casePreview.mergedCaseVariantsCount === 1 ? "" : "s"} Ready to Merge
                </span>
              ) : casePreview.cellsToNormalizeCount > 0 ? (
                <span className="inline-block px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[10px] font-extrabold shadow-sm">
                  {casePreview.cellsToNormalizeCount.toLocaleString()} Cells → Proper Case
                </span>
              ) : (
                <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-extrabold border border-emerald-200">
                  Auto-Enabled
                </span>
              )}
            </div>
          </div>

          {/* Geographical & Coordinate Identifiers */}
          <div className="bg-white/40 p-5 rounded-2xl shadow-inner border border-white/60 backdrop-blur-sm">
            <h3 className="font-bold text-slate-700 mb-4 uppercase text-xs tracking-widest border-b border-white/60 pb-3 flex items-center gap-2 drop-shadow-sm">
              <MapPin className="w-4 h-4 text-indigo-500" /> Base Information (Optional but recommended)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              
              {/* State */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">State</label>
                <select
                  value={stateCol}
                  onChange={(e) => setStateCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* District */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">District</label>
                <select
                  value={districtCol}
                  onChange={(e) => setDistrictCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Block */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">Block / Tehsil</label>
                <select
                  value={blockCol}
                  onChange={(e) => setBlockCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Station Id */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">Well / Station ID</label>
                <select
                  value={wellIdCol}
                  onChange={(e) => setWellIdCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Location */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">Location / Village</label>
                <select
                  value={locationCol}
                  onChange={(e) => setLocationCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Longitude */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">Longitude</label>
                <select
                  value={lonCol}
                  onChange={(e) => setLonCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Latitude */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">Latitude</label>
                <select
                  value={latCol}
                  onChange={(e) => setLatCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">Year</label>
                <select
                  value={yearCol}
                  onChange={(e) => setYearCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Season */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">Season</label>
                <select
                  value={seasonCol}
                  onChange={(e) => setSeasonCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Aquifer */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">Aquifer Type</label>
                <select
                  value={aquiferCol}
                  onChange={(e) => setAquiferCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Source */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">Source (e.g. Well, Handpump)</label>
                <select
                  value={sourceCol}
                  onChange={(e) => setSourceCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Depth */}
              <div className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate">Depth (m bgl)</label>
                <select
                  value={depthCol}
                  onChange={(e) => setDepthCol(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                >
                  <option value="">-- None / Ignore --</option>
                  {uploadedHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          {/* Chemical Water Quality Parameters */}
          <div className="bg-white/40 p-5 rounded-2xl shadow-inner border border-white/60 backdrop-blur-sm">
            <h3 className="font-bold text-slate-700 mb-4 uppercase text-xs tracking-widest border-b border-white/60 pb-3 flex items-center gap-2 drop-shadow-sm">
              <FlaskConical className="w-4 h-4 text-emerald-500" /> Water Quality Parameters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              
              {Object.entries(PARAM_CONFIG).map(([paramKey, configItem]) => (
                <div key={paramKey} className="flex flex-col gap-1.5 bg-white/50 p-2.5 rounded-xl border border-white/60 shadow-inner">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate" title={configItem.name}>
                    {configItem.name} ({paramKey})
                  </label>
                  <select
                    value={paramMappings[paramKey] || ""}
                    onChange={(e) => handleParamChange(paramKey, e.target.value)}
                    className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 font-bold text-slate-700"
                  >
                    <option value="">-- None / Ignore --</option>
                    {uploadedHeaders.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}

            </div>
          </div>

        </div>

        {/* Footer controls */}
        <div className="p-5 border-t border-white/50 flex justify-between items-center gap-3 bg-white/30 backdrop-blur shrink-0">
          <p className="text-xs font-bold text-slate-500 hidden sm:block">
            Columns left unmapped will be ignored in output compliance tables.
          </p>
          <div className="flex gap-3 justify-end w-full sm:w-auto">
            <button
              onClick={onCancel}
              className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel Upload
            </button>
            <button
              onClick={handleConfirm}
              className="glossy-btn-emerald px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" /> Confirm Mapping
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
