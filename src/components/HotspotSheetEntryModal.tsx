import React, { useState } from "react";
import { X, Plus, Trash2, Target, MapPin } from "lucide-react";
import { SECTOR_PARAM_CONFIG } from "../utils/sectorAnalysisEngine";
import type { HotspotGroup, HotspotSampleRecord } from "../utils/hotspotSheetParser";

interface GridSampleDraft {
  id: string;
  identificationNo: string;
  location: string;
  lon: string;
  lat: string;
  source: string;
  value: string;
}

interface HotspotSheetEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeParam: string;
  nextHotspotNo: string;
  onSaveGroup: (group: HotspotGroup, paramKey: string) => void;
}

const createEmptyGridRow = (idx: number): GridSampleDraft => ({
  id: `gs-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
  identificationNo: "",
  location: "",
  lon: "",
  lat: "",
  source: "Dug Well",
  value: ""
});

export const HotspotSheetEntryModal: React.FC<HotspotSheetEntryModalProps> = ({
  isOpen,
  onClose,
  activeParam,
  nextHotspotNo,
  onSaveGroup
}) => {
  const [paramKey, setParamKey] = useState<string>(activeParam || "NO3");
  const [hotspotNo, setHotspotNo] = useState<string>(nextHotspotNo);
  const [identificationNo, setIdentificationNo] = useState<string>("");
  const [stateName, setStateName] = useState<string>("");
  const [district, setDistrict] = useState<string>("");
  const [block, setBlock] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [lon, setLon] = useState<string>("");
  const [lat, setLat] = useState<string>("");
  const [source, setSource] = useState<string>("Dug Well");
  const [hsValue, setHsValue] = useState<string>("");
  const [gridRows, setGridRows] = useState<GridSampleDraft[]>([
    createEmptyGridRow(1),
    createEmptyGridRow(2),
    createEmptyGridRow(3),
    createEmptyGridRow(4)
  ]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  if (!isOpen) return null;

  const paramUnit = SECTOR_PARAM_CONFIG[paramKey]?.unit || "mg/L";

  const updateGridRow = (id: string, field: keyof GridSampleDraft, val: string) => {
    setGridRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const addGridRow = () => {
    setGridRows((prev) => [...prev, createEmptyGridRow(prev.length + 1)]);
  };

  const removeGridRow = (id: string) => {
    setGridRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    if (isNaN(parsedLat) || isNaN(parsedLon) || parsedLat < -90 || parsedLat > 90 || parsedLon < -180 || parsedLon > 180) {
      setErrorMsg("Enter valid decimal Latitude (-90 to 90) and Longitude (-180 to 180) for the Identified Hot Spot.");
      return;
    }

    const parsedHsVal = parseFloat(hsValue);
    const cleanNo = hotspotNo.trim() || nextHotspotNo;
    const hsLoc = location.trim() || identificationNo.trim() || `Hot Spot ${cleanNo}`;

    const hsRecord: HotspotSampleRecord = {
      hotspotNo: cleanNo,
      sampleType: "identified_hotspot",
      rawSampleType: "Identified Hot Spot",
      identificationNo: identificationNo.trim() || `HS-${cleanNo}`,
      state: stateName.trim(),
      district: district.trim(),
      block: block.trim(),
      location: hsLoc,
      lat: parsedLat,
      lon: parsedLon,
      source: source.trim(),
      primaryParam: paramKey,
      paramUnit,
      values: !isNaN(parsedHsVal) ? { [paramKey]: parsedHsVal } : {},
      raw: {
        "Hot Spot No.": cleanNo,
        "Type of Sample in grid (Identified hot spot/Grid Sample)": "Identified Hot Spot",
        "Identification No.": identificationNo.trim() || `HS-${cleanNo}`,
        "State/ UT": stateName.trim(),
        District: district.trim(),
        "Block/ Taluka": block.trim(),
        Location: hsLoc,
        "Longitude (DD)": parsedLon,
        "Latitude (DD)": parsedLat,
        "Source of Sample": source.trim(),
        [paramKey]: !isNaN(parsedHsVal) ? parsedHsVal : ""
      },
      rowIndex: 0
    };

    const parsedGridSamples: HotspotSampleRecord[] = [];
    for (let i = 0; i < gridRows.length; i++) {
      const row = gridRows[i];
      const hasAny = row.lat.trim() || row.lon.trim() || row.location.trim() || row.identificationNo.trim() || row.value.trim();
      if (!hasAny) continue;

      const gLat = parseFloat(row.lat);
      const gLon = parseFloat(row.lon);
      if (isNaN(gLat) || isNaN(gLon) || gLat < -90 || gLat > 90 || gLon < -180 || gLon > 180) {
        setErrorMsg(`Grid Sample row #${i + 1} has invalid Latitude or Longitude.`);
        return;
      }
      const gVal = parseFloat(row.value);
      const gLoc = row.location.trim() || row.identificationNo.trim() || `${hsLoc} Grid ${i + 1}`;
      const gId = row.identificationNo.trim() || `${hsRecord.identificationNo}/${i + 1}`;

      parsedGridSamples.push({
        hotspotNo: cleanNo,
        sampleType: "grid_sample",
        rawSampleType: "Grid Sample",
        identificationNo: gId,
        state: stateName.trim(),
        district: district.trim(),
        block: block.trim(),
        location: gLoc,
        lat: gLat,
        lon: gLon,
        source: row.source.trim(),
        primaryParam: paramKey,
        paramUnit,
        values: !isNaN(gVal) ? { [paramKey]: gVal } : {},
        raw: {
          "Hot Spot No.": cleanNo,
          "Type of Sample in grid (Identified hot spot/Grid Sample)": "Grid Sample",
          "Identification No.": gId,
          "State/ UT": stateName.trim(),
          District: district.trim(),
          "Block/ Taluka": block.trim(),
          Location: gLoc,
          "Longitude (DD)": gLon,
          "Latitude (DD)": gLat,
          "Source of Sample": row.source.trim(),
          [paramKey]: !isNaN(gVal) ? gVal : ""
        },
        rowIndex: i + 1
      });
    }

    if (parsedGridSamples.length === 0) {
      setErrorMsg("Add at least one surrounding Grid Sample with valid Longitude and Latitude.");
      return;
    }

    const group: HotspotGroup = {
      id: `hs-manual-${cleanNo}-${Date.now()}`,
      hotspotNo: cleanNo,
      identifiedHotspot: hsRecord,
      gridSamples: parsedGridSamples,
      state: stateName.trim(),
      district: district.trim(),
      block: block.trim(),
      location: hsLoc,
      identificationNo: hsRecord.identificationNo,
      source: hsRecord.source,
      primaryParam: paramKey,
      paramUnit
    };

    onSaveGroup(group, paramKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <header className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Add Hot Spot & Surrounding Grid Samples</h3>
              <p className="text-[11px] text-slate-500">
                Enter the Identified Hot Spot center and its surrounding Grid Samples for plume &amp; 4×4 grid analysis.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200/70 text-slate-500 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {errorMsg && (
            <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* Identified Hot Spot Section */}
          <section className="rounded-xl border border-amber-300 bg-amber-50/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wider">
                <MapPin className="w-3.5 h-3.5 text-rose-600" />
                <span>Identified Hot Spot (Center Point)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600 font-medium">Parameter:</span>
                <select
                  value={paramKey}
                  onChange={(e) => setParamKey(e.target.value)}
                  className="h-7 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800"
                >
                  {Object.keys(SECTOR_PARAM_CONFIG).map((pk) => (
                    <option key={pk} value={pk}>
                      {pk} ({SECTOR_PARAM_CONFIG[pk].unit || "unitless"})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 text-xs">
              <label className="space-y-1">
                <span className="text-[10.5px] font-semibold text-slate-600">Hot Spot No.</span>
                <input
                  value={hotspotNo}
                  onChange={(e) => setHotspotNo(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs tabular-nums"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10.5px] font-semibold text-slate-600">Identification No.</span>
                <input
                  value={identificationNo}
                  onChange={(e) => setIdentificationNo(e.target.value)}
                  placeholder="e.g. RJ/2024/NO3/1"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10.5px] font-semibold text-slate-600">State / UT</span>
                <input
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  placeholder="Rajasthan"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10.5px] font-semibold text-slate-600">District</span>
                <input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Karauli"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10.5px] font-semibold text-slate-600">Block / Taluka</span>
                <input
                  value={block}
                  onChange={(e) => setBlock(e.target.value)}
                  placeholder="Karauli"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="text-[10.5px] font-semibold text-slate-600">Hot Spot Location *</span>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Karauli"
                  required
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10.5px] font-semibold text-slate-600">Longitude (DD) *</span>
                <input
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                  placeholder="77.01720"
                  required
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs tabular-nums"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10.5px] font-semibold text-slate-600">Latitude (DD) *</span>
                <input
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="26.50140"
                  required
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs tabular-nums"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10.5px] font-semibold text-slate-600">
                  {paramKey} ({paramUnit})
                </span>
                <input
                  value={hsValue}
                  onChange={(e) => setHsValue(e.target.value)}
                  placeholder="226"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs tabular-nums font-semibold"
                />
              </label>
              <label className="space-y-1 sm:col-span-2 md:col-span-2">
                <span className="text-[10.5px] font-semibold text-slate-600">Source of Sample</span>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="DW / TW / Dug Well / Hand Pump"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </label>
            </div>
          </section>

          {/* Surrounding Grid Samples Section */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Surrounding Grid Samples ({gridRows.length} rows)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Samples collected around the Identified Hot Spot. Blank rows are ignored automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={addGridRow}
                className="h-7 px-2.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Grid Sample</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold w-8">#</th>
                    <th className="px-2 py-2 text-left font-semibold">Identification No.</th>
                    <th className="px-2 py-2 text-left font-semibold">Sample Location</th>
                    <th className="px-2 py-2 text-left font-semibold">Longitude (DD)</th>
                    <th className="px-2 py-2 text-left font-semibold">Latitude (DD)</th>
                    <th className="px-2 py-2 text-left font-semibold">Source</th>
                    <th className="px-2 py-2 text-right font-semibold">
                      {paramKey} ({paramUnit})
                    </th>
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gridRows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-2 py-1.5 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="px-1.5 py-1.5">
                        <input
                          value={row.identificationNo}
                          onChange={(e) => updateGridRow(row.id, "identificationNo", e.target.value)}
                          placeholder={`ID/${idx + 1}`}
                          className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-[11px]"
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          value={row.location}
                          onChange={(e) => updateGridRow(row.id, "location", e.target.value)}
                          placeholder="Location around hot spot"
                          className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-[11px]"
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          value={row.lon}
                          onChange={(e) => updateGridRow(row.id, "lon", e.target.value)}
                          placeholder="77.01980"
                          className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-[11px] tabular-nums"
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          value={row.lat}
                          onChange={(e) => updateGridRow(row.id, "lat", e.target.value)}
                          placeholder="26.51830"
                          className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-[11px] tabular-nums"
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          value={row.source}
                          onChange={(e) => updateGridRow(row.id, "source", e.target.value)}
                          placeholder="TW / DW"
                          className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-[11px]"
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          value={row.value}
                          onChange={(e) => updateGridRow(row.id, "value", e.target.value)}
                          placeholder="190"
                          className="w-full h-7 px-2 rounded border border-slate-200 bg-white text-[11px] tabular-nums text-right font-semibold"
                        />
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeGridRow(row.id)}
                          disabled={gridRows.length <= 1}
                          className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                          title="Remove row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-8 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Target className="w-3.5 h-3.5" />
              <span>Save &amp; Analyze Hot Spot</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
