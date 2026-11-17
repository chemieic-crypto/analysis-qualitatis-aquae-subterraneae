import React from "react";
import { Table, Search, Download, ArrowUpDown, Maximize2 } from "lucide-react";
import type { ShapefileLayer } from "../../utils/gisMapHelpers";

interface GisAttributeTableProps {
  selectedAttributeLayerId: string;
  setSelectedAttributeLayerId: (id: string) => void;
  layers: ShapefileLayer[];
  setLayers: React.Dispatch<React.SetStateAction<ShapefileLayer[]>>;
  attributeSearchQuery: string;
  setAttributeSearchQuery: (q: string) => void;
  attributeSortKey: string;
  setAttributeSortKey: (k: string) => void;
  attributeSortDesc: boolean;
  setAttributeSortDesc: (d: boolean) => void;
  attributePage: number;
  setAttributePage: React.Dispatch<React.SetStateAction<number>>;
  zoomToCentroid: (
    lng: number,
    lat: number,
    targetBounds?: { minLng: number; maxLng: number; minLat: number; maxLat: number }
  ) => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

export default function GisAttributeTable({
  selectedAttributeLayerId,
  setSelectedAttributeLayerId,
  layers,
  setLayers,
  attributeSearchQuery,
  setAttributeSearchQuery,
  attributeSortKey,
  setAttributeSortKey,
  attributeSortDesc,
  setAttributeSortDesc,
  attributePage,
  setAttributePage,
  zoomToCentroid,
  showToast
}: GisAttributeTableProps) {
  if (!selectedAttributeLayerId) return null;
  const activeLayer = layers.find(l => l.id === selectedAttributeLayerId);
  if (!activeLayer) return null;

  const features = activeLayer.geoJson.features || (activeLayer.geoJson.type === "Feature" ? [activeLayer.geoJson] : []);
  const allKeys = new Set<string>();
  features.forEach((f: any) => {
    if (f && f.properties) {
      Object.keys(f.properties).forEach(k => allKeys.add(k));
    }
  });
  const propertyHeaders = Array.from(allKeys);

  const filteredFeatures = features.filter((f: any) => {
    if (!attributeSearchQuery) return true;
    if (!f || !f.properties) return false;
    const q = attributeSearchQuery.toLowerCase();
    return Object.values(f.properties).some(val =>
      val !== null && val !== undefined && String(val).toLowerCase().includes(q)
    );
  });

  if (attributeSortKey) {
    filteredFeatures.sort((a: any, b: any) => {
      const valA = a?.properties?.[attributeSortKey];
      const valB = b?.properties?.[attributeSortKey];
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      const isNum = typeof valA === "number" && typeof valB === "number";
      if (isNum) {
        return attributeSortDesc ? (valB - valA) : (valA - valB);
      }
      return attributeSortDesc
        ? String(valB).localeCompare(String(valA))
        : String(valA).localeCompare(String(valB));
    });
  }

  const itemsPerPage = 8;
  const totalItems = filteredFeatures.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const currentPage = Math.min(attributePage, totalPages);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedFeatures = filteredFeatures.slice(startIndex, startIndex + itemsPerPage);

  const handleHeaderClick = (key: string) => {
    if (attributeSortKey === key) {
      setAttributeSortDesc(!attributeSortDesc);
    } else {
      setAttributeSortKey(key);
      setAttributeSortDesc(false);
    }
    setAttributePage(1);
  };

  const downloadCsv = () => {
    if (features.length === 0) return;
    const headersRow = propertyHeaders.join(",");
    const rows = features.map((f: any) =>
      propertyHeaders.map(h => {
        const val = f?.properties?.[h];
        if (val === undefined || val === null) return "";
        const str = String(val).replace(/"/g, '""');
        return str.includes(",") || str.includes("\n") || str.includes('"') ? `"${str}"` : str;
      }).join(",")
    );
    const csvContent = [headersRow, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeLayer.name}_attributes.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${features.length} attribute rows to CSV`, "success");
  };

  return (
    <div
      id="attribute-table-section"
      className="bg-white rounded-[2rem] border border-slate-200 shadow-md p-6 flex flex-col gap-4 w-full transition-all duration-300 scroll-mt-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 rounded-2xl">
            <Table className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-slate-800">
              Attribute Table: <span className="text-indigo-600">{activeLayer.name}</span>
            </h4>
            <p className="text-[11px] text-slate-500 font-medium">
              Showing {startIndex + 1}–{Math.min(startIndex + itemsPerPage, totalItems)} of {totalItems} features ({features.length} total)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search attributes..."
              value={attributeSearchQuery}
              onChange={(e) => {
                setAttributeSearchQuery(e.target.value);
                setAttributePage(1);
              }}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="button"
            onClick={downloadCsv}
            className="cursor-pointer bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold py-2 px-3 rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors"
            title="Download as CSV Spreadsheet"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" /> Export CSV
          </button>

          <button
            type="button"
            onClick={() => setSelectedAttributeLayerId("")}
            className="cursor-pointer text-slate-400 hover:text-red-500 hover:bg-red-50/50 p-2 rounded-xl text-xs transition-colors font-bold"
          >
            Close Table
          </button>
        </div>
      </div>

      <div className="w-full overflow-x-auto border border-slate-150 rounded-2xl max-h-[360px] custom-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <th className="py-3 px-4 font-extrabold text-slate-500 text-[10px] uppercase tracking-wider w-16 text-center">
                Actions
              </th>
              <th className="py-3 px-2 font-extrabold text-slate-500 text-[10px] uppercase tracking-wider w-12 text-center">
                FID
              </th>
              {propertyHeaders.map(key => (
                <th
                  key={key}
                  onClick={() => handleHeaderClick(key)}
                  className="py-3 px-4 font-extrabold text-slate-600 text-[10px] uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{key}</span>
                    <ArrowUpDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ${attributeSortKey === key ? "text-indigo-600" : ""}`} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150">
            {paginatedFeatures.length === 0 ? (
              <tr>
                <td colSpan={propertyHeaders.length + 2} className="py-12 text-center text-slate-400 font-medium">
                  No features found matching "{attributeSearchQuery}"
                </td>
              </tr>
            ) : (
              paginatedFeatures.map((f: any, idx: number) => {
                const fid = startIndex + idx + 1;
                const properties = f.properties || {};

                let featureCentroid: [number, number] | null = null;
                let featureBounds: { minLng: number; maxLng: number; minLat: number; maxLat: number } | null = null;

                if (f.geometry && f.geometry.coordinates) {
                  let minLng = Infinity, maxLng = -Infinity;
                  let minLat = Infinity, maxLat = -Infinity;
                  let sumLng = 0, sumLat = 0, count = 0;

                  const traverseCoords = (coords: any) => {
                    if (Array.isArray(coords) && typeof coords[0] === "number") {
                      const [lng, lat] = coords;
                      if (lng < minLng) minLng = lng;
                      if (lng > maxLng) maxLng = lng;
                      if (lat < minLat) minLat = lat;
                      if (lat > maxLat) maxLat = lat;
                      sumLng += lng;
                      sumLat += lat;
                      count++;
                    } else if (Array.isArray(coords)) {
                      coords.forEach(traverseCoords);
                    }
                  };

                  traverseCoords(f.geometry.coordinates);
                  if (count > 0) {
                    featureCentroid = [sumLng / count, sumLat / count];
                    featureBounds = { minLng, maxLng, minLat, maxLat };
                  }
                }

                return (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 text-center">
                      {featureCentroid ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (featureCentroid && featureBounds) {
                              zoomToCentroid(featureCentroid[0], featureCentroid[1], featureBounds);
                              showToast(`Zoomed map to feature FID ${fid}`, "info");
                            }
                          }}
                          className="cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold py-1 px-2.5 rounded-lg border border-indigo-100 transition-colors inline-flex items-center gap-1"
                          title="Center and Zoom to Feature Boundary"
                        >
                          <Maximize2 className="w-3 h-3" /> Zoom
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-400 font-mono text-[10px] font-medium">
                      {fid}
                    </td>
                    {propertyHeaders.map(key => {
                      const val = properties[key];
                      return (
                        <td key={key} className="py-1 px-2 text-slate-700 font-medium whitespace-nowrap overflow-hidden max-w-[200px]" title={String(val ?? "")}>
                          <input
                            type="text"
                            value={val === undefined || val === null ? "" : String(val)}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              const updatedLayers = layers.map(layer => {
                                if (layer.id === selectedAttributeLayerId) {
                                  const updatedFeatures = (layer.geoJson.features || []).map((feature: any, fIdx: number) => {
                                    if (fIdx === (startIndex + idx)) {
                                      return {
                                        ...feature,
                                        properties: {
                                          ...feature.properties,
                                          [key]: newValue
                                        }
                                      };
                                    }
                                    return feature;
                                  });
                                  return {
                                    ...layer,
                                    geoJson: {
                                      ...layer.geoJson,
                                      features: updatedFeatures
                                    }
                                  };
                                }
                                return layer;
                              });
                              setLayers(updatedLayers);
                            }}
                            className="bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1.5 py-0.5 text-xs font-semibold text-slate-700 w-full focus:outline-none transition-all"
                            placeholder="null"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
          <span className="text-slate-500 font-medium">
            Page <strong className="text-slate-800">{currentPage}</strong> of <strong className="text-slate-800">{totalPages}</strong>
          </span>

          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setAttributePage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="cursor-pointer bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-200 transition-all shadow-sm"
            >
              Prev
            </button>

            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              let pageNum = currentPage;
              if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              if (pageNum < 1 || pageNum > totalPages) return null;

              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setAttributePage(pageNum)}
                  className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    currentPage === pageNum
                      ? "bg-slate-950 text-white shadow-md"
                      : "text-slate-600 hover:bg-slate-150"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setAttributePage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="cursor-pointer bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-200 transition-all shadow-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
