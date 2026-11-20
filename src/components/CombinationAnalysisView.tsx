import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import { DataHeaders, ShapefileLayer } from "../types";
import { PARAM_CONFIG, hasBisLimit } from "../data/config";
import {
  Layers,
  Compass,
  Table,
  MapPin,
  Info,
  FileSpreadsheet,
  FileText,
  Search,
  Grid,
  AlertTriangle,
  FilterX,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Maximize2,
  SlidersHorizontal,
  RotateCcw
} from "lucide-react";
import ExcelJS from "exceljs";
import { downloadExcelJSWorkbook } from "../utils/excelFormatter";

interface CombinationAnalysisViewProps {
  rawData: any[];
  headers: DataHeaders;
  headerMap: Record<string, string>;
  selectedState?: string;
  selectedDistrict?: string;
  selectedYear?: string;
  selectedSeason?: string;
  layers?: ShapefileLayer[];
}

type ComboMapTheme = "osm" | "topo" | "physical" | "terrain" | "satellite" | "hybrid";

const BASEMAP_SPECS: Record<ComboMapTheme, { label: string; url: string; options: L.TileLayerOptions }> = {
  osm: {
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { subdomains: ["a", "b", "c"], maxZoom: 19, attribution: "© OpenStreetMap" }
  },
  topo: {
    label: "ESRI Topo",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    options: { maxNativeZoom: 18, maxZoom: 18, attribution: "© Esri Topo" }
  },
  physical: {
    label: "ESRI Physical",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
    options: { maxNativeZoom: 8, maxZoom: 18, attribution: "© Esri Physical" }
  },
  terrain: {
    label: "ESRI Terrain",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
    options: { maxNativeZoom: 13, maxZoom: 18, attribution: "© Esri Terrain" }
  },
  satellite: {
    label: "ESRI Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: { maxNativeZoom: 18, maxZoom: 18, attribution: "© Esri Imagery" }
  },
  hybrid: {
    label: "Google Hybrid",
    url: "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    options: { subdomains: ["mt0", "mt1", "mt2", "mt3"], maxZoom: 19, attribution: "© Google" }
  }
};

export function CombinationAnalysisView({
  rawData,
  headers,
  headerMap,
  selectedState = "",
  selectedDistrict = "",
  selectedYear = "",
  selectedSeason = "",
  layers
}: CombinationAnalysisViewProps) {
  // Active analytics tab
  const [activeTab, setActiveTab] = useState<"overview" | "pairwise" | "bganalysis" | "state" | "district">("overview");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  // Local metadata filters
  const [localState, setLocalState] = useState<string>("All");
  const [localDistrict, setLocalDistrict] = useState<string>("All");
  const [localBlock, setLocalBlock] = useState<string>("All");
  const [localSource, setLocalSource] = useState<string>("All");
  const [localAquifer, setLocalAquifer] = useState<string>("All");
  const [localYear, setLocalYear] = useState<string>("All");
  const [localSeason, setLocalSeason] = useState<string>("All");

  const [activeParams, setActiveParams] = useState<Record<string, boolean>>({});
  const [strictData, setStrictData] = useState<boolean>(false);

  // Combination & Pairwise interactive filter + Search + Pagination
  const [selectedComboFilter, setSelectedComboFilter] = useState<string>("");
  const [selectedPairFilter, setSelectedPairFilter] = useState<[string, string] | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Synchronize local filter state with globally passed selected props
  useEffect(() => {
    setLocalState(selectedState || "All");
  }, [selectedState]);

  useEffect(() => {
    setLocalDistrict(selectedDistrict || "All");
  }, [selectedDistrict]);

  useEffect(() => {
    setLocalYear(selectedYear || "All");
  }, [selectedYear]);

  useEffect(() => {
    setLocalSeason(selectedSeason || "All");
  }, [selectedSeason]);

  // Map controls
  const [mapTheme, setMapTheme] = useState<ComboMapTheme>("topo");
  const [pointSize, setPointSize] = useState<number>(6);
  const [mapStatusFilters, setMapStatusFilters] = useState({ clean: true, single: true, multi: true });

  // Decimal precision rules
  const [decSettings] = useState({
    group1: 0, // EC, NO3, TH, Cl
    group2: 2, // F
    group3: 1, // As, U
    group4: 3, // Heavy metals
    default: 2
  });

  // Map refs
  const mapFrameRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const geojsonLayersRef = useRef<L.GeoJSON[]>([]);
  const lastBoundsRef = useRef<L.LatLngBoundsExpression | null>(null);

  // Column mapping helper
  const columnMapping = useMemo(() => {
    const mapping: Record<string, string> = {};
    if (headers) {
      mapping["State"] = headers.state || "";
      mapping["District"] = headers.district || "";
      mapping["Block"] = headers.block || "";
      mapping["Station"] = headers.location || "";
      mapping["latitude"] = headers.latitude || "";
      mapping["longitude"] = headers.longitude || "";
      mapping["Season"] = headers.season || "";
      mapping["Year"] = headers.year || "";
      mapping["Aquifer"] = headers.aquifer || "";
    }
    if (headerMap) {
      Object.entries(headerMap).forEach(([excelHeader, paramKey]) => {
        if (paramKey && paramKey !== "Mo") {
          mapping[paramKey] = excelHeader;
        }
      });
    }

    const keys = rawData && rawData.length > 0 ? Object.keys(rawData[0]) : [];
    const sourceKey = keys.find(
      (k) => k && ["source", "type", "source type", "source_type", "well type", "well_type"].includes(k.toLowerCase().trim())
    );
    mapping["Source"] = sourceKey || "";

    return mapping;
  }, [headers, headerMap, rawData]);

  // Available mapped parameters (excluding Molybdenum)
  const mappedParamKeys = useMemo(() => {
    return Object.keys(PARAM_CONFIG).filter((p) => p !== "Mo" && !!columnMapping[p]);
  }, [columnMapping]);

  const activeSet = useMemo(() => {
    const explicitlySelected = Object.keys(activeParams).filter((k) => activeParams[k] && k !== "Mo" && !!columnMapping[k]);
    if (explicitlySelected.length > 0) return explicitlySelected;
    return mappedParamKeys.filter((p) => hasBisLimit(p));
  }, [activeParams, columnMapping, mappedParamKeys]);

  // Decimal helper
  const getDecimalForParam = useCallback(
    (paramName: string) => {
      const group1 = ["EC", "NO3", "TH", "Cl"];
      const group2 = ["F"];
      const group3 = ["As", "U"];
      const group4 = ["Fe", "Zn", "Cu", "Pb", "Cd", "Cr", "Hg", "Ni", "Se", "Mn", "Al", "Ba"];

      if (group1.includes(paramName)) return decSettings.group1;
      if (group2.includes(paramName)) return decSettings.group2;
      if (group3.includes(paramName)) return decSettings.group3;
      if (group4.includes(paramName)) return decSettings.group4;
      return decSettings.default;
    },
    [decSettings]
  );

  // Cascading metadata filter options
  const filterOptions = useMemo(() => {
    const states = new Set<string>();
    const districts = new Set<string>();
    const blocks = new Set<string>();
    const sources = new Set<string>();
    const aquifers = new Set<string>();
    const years = new Set<string>();
    const seasons = new Set<string>();

    const stateCol = columnMapping["State"];
    const distCol = columnMapping["District"];
    const blockCol = columnMapping["Block"];
    const sourceCol = columnMapping["Source"];
    const aquiferCol = columnMapping["Aquifer"];
    const yearCol = columnMapping["Year"];
    const seasonCol = columnMapping["Season"];

    rawData.forEach((d) => {
      const sVal = stateCol && d[stateCol] ? String(d[stateCol]).trim() : "";
      const dVal = distCol && d[distCol] ? String(d[distCol]).trim() : "";
      const bVal = blockCol && d[blockCol] ? String(d[blockCol]).trim() : "";
      const srcVal = sourceCol && d[sourceCol] ? String(d[sourceCol]).trim() : "";
      const aqVal = aquiferCol && d[aquiferCol] ? String(d[aquiferCol]).trim() : "";
      const yVal = yearCol && d[yearCol] ? String(d[yearCol]).trim() : "";
      const seasVal = seasonCol && d[seasonCol] ? String(d[seasonCol]).trim() : "";

      if (sVal) states.add(sVal);
      if (localState === "All" || sVal === localState) {
        if (dVal) districts.add(dVal);
      }
      if ((localState === "All" || sVal === localState) && (localDistrict === "All" || dVal === localDistrict)) {
        if (bVal) blocks.add(bVal);
      }
      if (srcVal) sources.add(srcVal);
      if (aqVal) aquifers.add(aqVal);
      if (yVal) years.add(yVal);
      if (seasVal) seasons.add(seasVal);
    });

    return {
      states: Array.from(states).sort(),
      districts: Array.from(districts).sort(),
      blocks: Array.from(blocks).sort(),
      sources: Array.from(sources).sort(),
      aquifers: Array.from(aquifers).sort(),
      years: Array.from(years).sort(),
      seasons: Array.from(seasons).sort()
    };
  }, [rawData, columnMapping, localState, localDistrict]);

  // Filter rows and compute BIS exceedances + MPR score
  const currentFilteredData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];

    const stateCol = columnMapping["State"];
    const districtCol = columnMapping["District"];
    const blockCol = columnMapping["Block"];
    const sourceCol = columnMapping["Source"];
    const aquiferCol = columnMapping["Aquifer"];
    const yearCol = columnMapping["Year"];
    const seasonCol = columnMapping["Season"];
    const latCol = columnMapping["latitude"];
    const lonCol = columnMapping["longitude"];

    return rawData
      .filter((d) => {
        if (localState !== "All" && stateCol && String(d[stateCol] || "").trim() !== localState) return false;
        if (localDistrict !== "All" && districtCol && String(d[districtCol] || "").trim() !== localDistrict) return false;
        if (localBlock !== "All" && blockCol && String(d[blockCol] || "").trim() !== localBlock) return false;
        if (localSource !== "All" && sourceCol && String(d[sourceCol] || "").trim() !== localSource) return false;
        if (localAquifer !== "All" && aquiferCol && String(d[aquiferCol] || "").trim() !== localAquifer) return false;
        if (localYear !== "All" && yearCol && String(d[yearCol] || "").trim() !== localYear) return false;
        if (localSeason !== "All" && seasonCol && String(d[seasonCol] || "").trim() !== localSeason) return false;

        if (strictData) {
          return activeSet.every((p) => {
            const col = columnMapping[p];
            return col ? !isNaN(parseFloat(d[col])) : false;
          });
        }
        return true;
      })
      .map((d) => {
        let failCount = 0;
        const failedParams: Array<{ name: string; val: number; limit: string | number; unit: string }> = [];

        activeSet.forEach((p) => {
          const col = columnMapping[p];
          if (!col || !hasBisLimit(p)) return;
          const val = parseFloat(d[col]);
          if (isNaN(val)) return;
          const conf = PARAM_CONFIG[p];
          if (!conf) return;
          const fail = p === "pH" ? val < conf.b1 || val > conf.b2 : val > conf.b2;
          if (fail) {
            const limitDisplay = p === "pH" ? `${conf.b1}–${conf.b2}` : conf.b2;
            failCount++;
            failedParams.push({ name: p, val, limit: limitDisplay, unit: conf.unit });
          }
        });

        let sumRatio = 0;
        let ratioTerms = 0;
        activeSet.forEach((p) => {
          const col = columnMapping[p];
          const conf = PARAM_CONFIG[p];
          if (col && conf && conf.b2 > 0) {
            const val = parseFloat(d[col]);
            if (!isNaN(val)) {
              sumRatio += val / conf.b2;
              ratioTerms++;
            }
          }
        });
        const mprScore = ratioTerms > 0 ? sumRatio / ratioTerms : 0;

        return {
          ...d,
          failCount,
          failedParams,
          _latNum: latCol ? parseFloat(d[latCol]) : NaN,
          _lonNum: lonCol ? parseFloat(d[lonCol]) : NaN,
          _mprScoreNum: mprScore
        };
      });
  }, [
    rawData,
    columnMapping,
    localState,
    localDistrict,
    localBlock,
    localSource,
    localAquifer,
    localYear,
    localSeason,
    activeSet,
    strictData
  ]);

  // Donut chart distribution
  const chartData = useMemo(() => {
    const total = currentFilteredData.length;
    let clean = 0;
    let single = 0;
    let multi = 0;
    for (let i = 0; i < total; i++) {
      const fc = currentFilteredData[i].failCount;
      if (fc === 0) clean++;
      else if (fc === 1) single++;
      else multi++;
    }

    const donut = [
      {
        name: "Compliant (Within BIS Limits)",
        short: "Compliant",
        color: "#10b981",
        value: clean,
        pctNum: total > 0 ? (clean / total) * 100 : 0,
        percentage: total > 0 ? ((clean / total) * 100).toFixed(2) : "0.00"
      },
      {
        name: "Single Parameter Exceedance",
        short: "Single Fail",
        color: "#f59e0b",
        value: single,
        pctNum: total > 0 ? (single / total) * 100 : 0,
        percentage: total > 0 ? ((single / total) * 100).toFixed(2) : "0.00"
      },
      {
        name: "Multiple Parameter Exceedances",
        short: "Multi Fail (≥2)",
        color: "#ef4444",
        value: multi,
        pctNum: total > 0 ? (multi / total) * 100 : 0,
        percentage: total > 0 ? ((multi / total) * 100).toFixed(2) : "0.00"
      }
    ];

    return { donut };
  }, [currentFilteredData]);

  // Specific exceedance combinations
  const comboAnalysis = useMemo(() => {
    const combos: Record<string, number> = {};
    currentFilteredData.forEach((r) => {
      if (r.failCount > 0) {
        const key = r.failedParams
          .map((p: any) => p.name)
          .sort()
          .join(" + ");
        combos[key] = (combos[key] || 0) + 1;
      }
    });

    return Object.entries(combos)
      .map(([key, count]) => ({
        key,
        count,
        paramCount: key.split(" + ").length,
        pctNum: currentFilteredData.length > 0 ? (count / currentFilteredData.length) * 100 : 0,
        percentage: currentFilteredData.length > 0 ? ((count / currentFilteredData.length) * 100).toFixed(2) : "0.00"
      }))
      .sort((a, b) => b.count - a.count);
  }, [currentFilteredData]);

  // Pairwise Co-Occurrence Matrix
  const pairwiseMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    activeSet.forEach((p1) => {
      matrix[p1] = {};
      activeSet.forEach((p2) => {
        matrix[p1][p2] = 0;
      });
    });

    currentFilteredData.forEach((r) => {
      if (r.failCount <= 1) return;
      const failedNames = r.failedParams.map((fp: any) => fp.name);
      for (let i = 0; i < failedNames.length; i++) {
        for (let j = 0; j < failedNames.length; j++) {
          const p1 = failedNames[i];
          const p2 = failedNames[j];
          if (matrix[p1] && matrix[p1][p2] !== undefined) {
            matrix[p1][p2]++;
          }
        }
      }
    });

    return matrix;
  }, [currentFilteredData, activeSet]);

  const pairwiseMaxVal = useMemo(() => {
    let maxVal = 1;
    for (const p1 of activeSet) {
      for (const p2 of activeSet) {
        if (p1 === p2) continue;
        const c = pairwiseMatrix[p1]?.[p2] || 0;
        if (c > maxVal) maxVal = c;
      }
    }
    return maxVal;
  }, [activeSet, pairwiseMatrix]);

  // Filtered dataset honoring selected combination or pairwise cell (used by BOTH map and table)
  const comboScopedData = useMemo(() => {
    let result = currentFilteredData;

    if (selectedComboFilter) {
      result = result.filter((r) => {
        const comboKey = r.failedParams
          .map((p: any) => p.name)
          .sort()
          .join(" + ");
        return comboKey === selectedComboFilter;
      });
    } else if (selectedPairFilter) {
      const [pA, pB] = selectedPairFilter;
      result = result.filter((r) => {
        const names = new Set(r.failedParams.map((p: any) => p.name));
        return names.has(pA) && names.has(pB);
      });
    }

    return result;
  }, [currentFilteredData, selectedComboFilter, selectedPairFilter]);

  // Further filtered by search query for the table
  const displayFilteredData = useMemo(() => {
    if (!searchQuery.trim()) return comboScopedData;
    const q = searchQuery.toLowerCase().trim();
    return comboScopedData.filter((r) => {
      const station = String(r[columnMapping["Station"]] || "").toLowerCase();
      const state = String(r[columnMapping["State"]] || "").toLowerCase();
      const district = String(r[columnMapping["District"]] || "").toLowerCase();
      const block = String(r[columnMapping["Block"]] || "").toLowerCase();
      const failedStr = r.failedParams.map((fp: any) => fp.name).join(" ").toLowerCase();
      return station.includes(q) || state.includes(q) || district.includes(q) || block.includes(q) || failedStr.includes(q);
    });
  }, [comboScopedData, searchQuery, columnMapping]);

  // Reset pagination when filtered list shrinks
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedComboFilter, selectedPairFilter, localState, localDistrict, localBlock, localSource, localAquifer, localYear, localSeason]);

  // KPI summary
  const kpiStats = useMemo(() => {
    const total = currentFilteredData.length;
    let clean = 0;
    let single = 0;
    let multi = 0;
    let maxFail = 0;

    for (let i = 0; i < total; i++) {
      const fc = currentFilteredData[i].failCount;
      if (fc === 0) clean++;
      else if (fc === 1) single++;
      else multi++;
      if (fc > maxFail) maxFail = fc;
    }

    const topCombo = comboAnalysis.length > 0 ? comboAnalysis[0] : null;
    return { total, clean, single, multi, maxFail, topCombo };
  }, [currentFilteredData, comboAnalysis]);

  // Leaflet map instance setup + ResizeObserver for exact 4:3 responsiveness
  useEffect(() => {
    const container = mapRef.current;
    if (!container) return;

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch {
        // ignore cleanup
      }
      mapInstanceRef.current = null;
    }

    if ((container as any)._leaflet_id) {
      delete (container as any)._leaflet_id;
    }
    container.innerHTML = "";

    const canvasRenderer = L.canvas({ padding: 0.4 });
    canvasRendererRef.current = canvasRenderer;

    const map = L.map(container, {
      preferCanvas: true,
      renderer: canvasRenderer,
      zoomControl: false,
      attributionControl: true,
      fadeAnimation: false,
      minZoom: 2,
      maxZoom: 18
    }).setView([22.5, 82.5], 5);

    L.control.zoom({ position: "topright" }).addTo(map);

    mapInstanceRef.current = map;
    markerGroupRef.current = L.layerGroup().addTo(map);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && mapFrameRef.current) {
      ro = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize({ animate: false });
        }
      });
      ro.observe(mapFrameRef.current);
    }

    const t = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 60);

    return () => {
      window.clearTimeout(t);
      if (ro) ro.disconnect();
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // ignore cleanup
        }
        mapInstanceRef.current = null;
      }
      tileLayerRef.current = null;
      markerGroupRef.current = null;
      canvasRendererRef.current = null;
    };
  }, []);

  // Basemap tile management with automatic fallback
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    let cancelled = false;

    if (tileLayerRef.current) {
      try {
        map.removeLayer(tileLayerRef.current);
      } catch {
        // ignore
      }
      tileLayerRef.current = null;
    }

    const spec = BASEMAP_SPECS[mapTheme] || BASEMAP_SPECS.osm;
    const tl = L.tileLayer(spec.url, {
      ...spec.options,
      pane: "tilePane",
      zIndex: 1,
      keepBuffer: 4,
      updateWhenIdle: false
    });

    let loaded = 0;
    let errors = 0;
    tl.on("tileload", () => {
      loaded++;
    });
    tl.on("tileerror", () => {
      if (cancelled) return;
      errors++;
      if (errors >= 4 && loaded === 0) {
        if (mapTheme === "topo") setMapTheme("hybrid");
        else if (mapTheme === "hybrid") setMapTheme("osm");
        else if (mapTheme !== "osm") setMapTheme("topo");
      }
    });

    tl.addTo(map);
    tl.bringToBack();
    tileLayerRef.current = tl;
    map.invalidateSize({ animate: false });

    return () => {
      cancelled = true;
      tl.off("tileload");
      tl.off("tileerror");
      if (mapInstanceRef.current && tileLayerRef.current === tl) {
        try {
          mapInstanceRef.current.removeLayer(tl);
        } catch {
          // ignore
        }
        tileLayerRef.current = null;
      }
    };
  }, [mapTheme]);

  // Synchronize GeoJSON shapefile boundary overlays
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    geojsonLayersRef.current.forEach((l) => {
      try {
        map.removeLayer(l);
      } catch {
        // ignore
      }
    });
    geojsonLayersRef.current = [];

    if (layers && layers.length > 0) {
      const renderer = canvasRendererRef.current || undefined;
      layers.forEach((layer) => {
        if (!layer.visible || !layer.geoJson) return;

        const strokeColor = layer.strokeColor || "#3b82f6";
        const strokeWidth = layer.strokeWidth || 1.5;
        const fillColor = layer.fillColor || "#3b82f6";
        const fillOpacity = (layer.fillOpacity !== undefined ? layer.fillOpacity : 10) / 100;

        try {
          const geojsonLayer = L.geoJSON(layer.geoJson, {
            style: () => ({
              renderer,
              color: strokeColor,
              weight: strokeWidth,
              fillColor,
              fillOpacity: layer.showStroke === false ? 0 : fillOpacity,
              opacity: layer.showStroke === false ? 0 : 1
            }),
            onEachFeature: (feature: any, leafletLayer: any) => {
              if (layer.showLabels && layer.labelKey && feature.properties?.[layer.labelKey]) {
                const labelText = String(feature.properties[layer.labelKey]);
                leafletLayer.bindTooltip(labelText, {
                  permanent: true,
                  direction: "center",
                  className: "custom-map-label"
                });
              }
            }
          }).addTo(map);

          geojsonLayersRef.current.push(geojsonLayer);
        } catch (e) {
          console.error("Error drawing GeoJSON layer in Combination Analysis:", e);
        }
      });
    }
  }, [layers, mapTheme]);

  // Marker rendering (strictly honors active combination/pairwise filter + status filters)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markerGroup = markerGroupRef.current;
    if (!map || !markerGroup || !comboScopedData) return;

    markerGroup.clearLayers();
    const bounds: [number, number][] = [];
    const renderer = canvasRendererRef.current || undefined;

    comboScopedData.forEach((r) => {
      const lat = r._latNum;
      const lon = r._lonNum;
      if (isNaN(lat) || isNaN(lon)) return;

      let col = "#10b981";
      let isVisible = false;

      if (r.failCount === 0 && mapStatusFilters.clean) {
        isVisible = true;
        col = "#10b981";
      } else if (r.failCount === 1 && mapStatusFilters.single) {
        isVisible = true;
        col = "#f59e0b";
      } else if (r.failCount > 1 && mapStatusFilters.multi) {
        isVisible = true;
        col = "#ef4444";
      }

      if (!isVisible) return;

      const marker = L.circleMarker([lat, lon], {
        renderer,
        radius: pointSize,
        fillColor: col,
        color: "#ffffff",
        weight: 1.25,
        fillOpacity: 0.9
      });

      marker.bindPopup(() => {
        const failHtml =
          r.failCount > 0
            ? r.failedParams
                .map(
                  (p: any) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;background:#fff1f2;padding:4px 8px;border-radius:4px;margin-top:4px;border:1px solid #fecdd3;gap:10px;">
                    <span style="font-weight:700;font-size:10.5px;color:#9f1239;">${p.name}</span>
                    <span style="font-weight:600;font-size:10.5px;color:#be123c;font-variant-numeric:tabular-nums;">${Number(p.val).toFixed(getDecimalForParam(p.name))} / ${p.limit} ${p.unit || ""}</span>
                  </div>
                `
                )
                .join("")
            : '<div style="font-size:11px;color:#047857;font-weight:700;padding:6px 8px;background:#ecfdf5;border-radius:6px;border:1px solid #a7f3d0;">Within BIS Permissible Limits</div>';

        const locParts = [r[columnMapping["Block"]], r[columnMapping["District"]], r[columnMapping["State"]]].filter(Boolean);
        const locInfo = locParts.length
          ? `<div style="font-size:10.5px;color:#475569;margin:2px 0 8px 0;">${locParts.join(", ")}</div>`
          : "";

        return `
          <div style="font-family:'Plus Jakarta Sans',sans-serif;padding:10px 12px;min-width:210px;background:#ffffff;">
            <div style="font-size:12px;font-weight:800;color:#0f172a;">${r[columnMapping["Station"]] || "Monitoring Well"}</div>
            ${locInfo}
            <div style="font-size:9.5px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:0.04em;margin-bottom:4px;">Compliance Status (${r.failCount} ${r.failCount === 1 ? "Exceedance" : "Exceedances"})</div>
            ${failHtml}
          </div>
        `;
      });

      marker.addTo(markerGroup);
      bounds.push([lat, lon]);
    });

    if (bounds.length > 0) {
      lastBoundsRef.current = bounds;
      try {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 });
      } catch {
        // ignore bounds error
      }
    } else {
      lastBoundsRef.current = null;
    }
  }, [comboScopedData, pointSize, mapStatusFilters, columnMapping, getDecimalForParam]);

  // Fit extent button handler
  const handleFitBounds = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.invalidateSize({ animate: false });
    if (lastBoundsRef.current) {
      try {
        map.fitBounds(lastBoundsRef.current, { padding: [36, 36], maxZoom: 13 });
      } catch {
        // ignore
      }
    } else {
      map.setView([22.5, 82.5], 5);
    }
  }, []);

  // Re-measure map when sidebar toggles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const t = window.setTimeout(() => map.invalidateSize({ animate: false }), 80);
    return () => window.clearTimeout(t);
  }, [sidebarOpen]);

  // Parameter toggle presets
  const selectAllMappedParams = () => {
    const obj: Record<string, boolean> = {};
    mappedParamKeys.forEach((p) => {
      obj[p] = true;
    });
    setActiveParams(obj);
  };

  const selectBisParamsOnly = () => {
    const obj: Record<string, boolean> = {};
    mappedParamKeys.forEach((p) => {
      if (hasBisLimit(p)) obj[p] = true;
    });
    setActiveParams(obj);
  };

  const clearParamSelection = () => {
    setActiveParams({});
  };

  const resetAllFilters = () => {
    setLocalState("All");
    setLocalDistrict("All");
    setLocalBlock("All");
    setLocalSource("All");
    setLocalAquifer("All");
    setLocalYear("All");
    setLocalSeason("All");
    setActiveParams({});
    setStrictData(false);
    setSelectedComboFilter("");
    setSelectedPairFilter(null);
    setSearchQuery("");
    setMapStatusFilters({ clean: true, single: true, multi: true });
  };

  // State stats breakdown
  const stateStats = useMemo(() => {
    const col = columnMapping["State"];
    if (!col) return [];

    const groups: Record<string, any> = {};
    currentFilteredData.forEach((r) => {
      const s = String(r[col] || "Unknown");
      if (!groups[s]) {
        groups[s] = { state: s, total: 0, clean: 0, one: 0, two: 0, three: 0, fourPlus: 0, params: new Set<string>() };
      }
      const g = groups[s];
      g.total++;
      if (r.failCount === 0) g.clean++;
      else if (r.failCount === 1) g.one++;
      else if (r.failCount === 2) g.two++;
      else if (r.failCount === 3) g.three++;
      else g.fourPlus++;

      r.failedParams.forEach((fp: any) => g.params.add(fp.name));
    });

    return Object.values(groups).sort((a: any, b: any) => b.total - a.total);
  }, [currentFilteredData, columnMapping]);

  // District stats breakdown
  const districtStats = useMemo(() => {
    const dCol = columnMapping["District"];
    const sCol = columnMapping["State"];
    if (!dCol) return [];

    const groups: Record<string, any> = {};
    currentFilteredData.forEach((r) => {
      const d = String(r[dCol] || "Unknown");
      const s = sCol ? String(r[sCol] || "Unknown") : "Unknown";
      const key = `${d}||${s}`;
      if (!groups[key]) {
        groups[key] = { district: d, state: s, total: 0, clean: 0, one: 0, two: 0, three: 0, fourPlus: 0, params: new Set<string>() };
      }
      const g = groups[key];
      g.total++;
      if (r.failCount === 0) g.clean++;
      else if (r.failCount === 1) g.one++;
      else if (r.failCount === 2) g.two++;
      else if (r.failCount === 3) g.three++;
      else g.fourPlus++;

      r.failedParams.forEach((fp: any) => g.params.add(fp.name));
    });

    return Object.values(groups).sort((a: any, b: any) => b.total - a.total);
  }, [currentFilteredData, columnMapping]);

  // Multi-sheet Excel export
  const exportMultiSheet = async () => {
    const wb = new ExcelJS.Workbook();

    const addJsonSheet = (sheetName: string, jsonRows: any[]) => {
      const ws = wb.addWorksheet(sheetName);
      if (jsonRows.length > 0) {
        const hdrs = Object.keys(jsonRows[0]);
        ws.addRow(hdrs);
        jsonRows.forEach((row) => ws.addRow(hdrs.map((h) => row[h])));
      }
    };

    const summaryData = [
      { Metric: "Total Matched Monitoring Wells", Value: kpiStats.total },
      {
        Metric: "Compliant Wells (0 Exceedances)",
        Value: `${kpiStats.clean} (${kpiStats.total > 0 ? ((kpiStats.clean / kpiStats.total) * 100).toFixed(2) : 0}%)`
      },
      {
        Metric: "Single Parameter Exceedances",
        Value: `${kpiStats.single} (${kpiStats.total > 0 ? ((kpiStats.single / kpiStats.total) * 100).toFixed(2) : 0}%)`
      },
      {
        Metric: "Multiple Parameter Exceedances",
        Value: `${kpiStats.multi} (${kpiStats.total > 0 ? ((kpiStats.multi / kpiStats.total) * 100).toFixed(2) : 0}%)`
      },
      { Metric: "Maximum Co-Occurring Exceedances", Value: kpiStats.maxFail },
      {
        Metric: "Most Frequent Parameter Combination",
        Value: kpiStats.topCombo ? `${kpiStats.topCombo.key} (${kpiStats.topCombo.count} sites)` : "None"
      }
    ];
    addJsonSheet("Executive Summary", summaryData);

    const rawExport = currentFilteredData.map((r) => {
      const res: Record<string, any> = {
        "Station Name": r[columnMapping["Station"]] || "Well",
        State: r[columnMapping["State"]] || "",
        District: r[columnMapping["District"]] || "",
        Block: r[columnMapping["Block"]] || "",
        Latitude: r[columnMapping["latitude"]] || "",
        Longitude: r[columnMapping["longitude"]] || "",
        "Failed Count": r.failCount,
        "Failed Parameters": r.failedParams.map((p: any) => p.name).join(", "),
        "Multi-Param Ratio (MPR)": r._mprScoreNum ? Number(r._mprScoreNum.toFixed(4)) : 0
      };

      activeSet.forEach((p) => {
        const col = columnMapping[p];
        if (col) {
          const val = parseFloat(r[col]);
          res[p] = isNaN(val) ? r[col] || "" : val;
        }
      });

      return res;
    });
    addJsonSheet("Detailed Well Log", rawExport);

    const comboExport = comboAnalysis.map((c) => ({
      "Combination of Exceeded Parameters": c.key,
      "Number of Wells": c.count,
      "Percentage (%)": Number(c.percentage)
    }));
    addJsonSheet("Combination Matrix", comboExport);

    const pairwiseRows: any[] = [];
    activeSet.forEach((p1) => {
      const row: Record<string, any> = { Parameter: p1 };
      activeSet.forEach((p2) => {
        row[p2] = pairwiseMatrix[p1]?.[p2] || 0;
      });
      pairwiseRows.push(row);
    });
    addJsonSheet("Pairwise Co-Occurrence", pairwiseRows);

    await downloadExcelJSWorkbook(wb, "Water_Quality_Combination_Report.xlsx");
  };

  // Word Document Export (.doc)
  const exportDocxReport = () => {
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Water Quality Combination Analysis Report</title>
        <style>
          body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; margin: 20px; color: #1e293b; }
          h1 { font-size: 18pt; font-weight: bold; color: #0f172a; text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 20px; }
          h2 { font-size: 14pt; font-weight: bold; color: #0f172a; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 20px; font-size: 10pt; }
          th { background-color: #0f172a; color: #ffffff; font-weight: bold; padding: 8px; border: 1px solid #334155; text-align: left; }
          td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .summary-card { background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <h1>Water Quality Combination Analysis Report</h1>
        <p><strong>Generated On:</strong> ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
        <p><strong>Scope:</strong> Multi-Parameter Hydrochemical Overlap Analysis (${localState === "All" ? "All States" : localState})</p>

        <div class="summary-card">
          <h2>Executive Summary</h2>
          <ul>
            <li><strong>Total Monitoring Stations Evaluated:</strong> ${kpiStats.total}</li>
            <li><strong>Compliant Stations (0 Exceedances):</strong> ${kpiStats.clean} (${kpiStats.total > 0 ? ((kpiStats.clean / kpiStats.total) * 100).toFixed(2) : "0.00"}%)</li>
            <li><strong>Single Parameter Exceedances:</strong> ${kpiStats.single} (${kpiStats.total > 0 ? ((kpiStats.single / kpiStats.total) * 100).toFixed(2) : "0.00"}%)</li>
            <li><strong>Multiple Parameter Exceedances:</strong> ${kpiStats.multi} (${kpiStats.total > 0 ? ((kpiStats.multi / kpiStats.total) * 100).toFixed(2) : "0.00"}%)</li>
            <li><strong>Maximum Simultaneous Exceedances:</strong> ${kpiStats.maxFail} parameters at a single site</li>
            <li><strong>Top Exceedance Combination:</strong> ${kpiStats.topCombo ? `${kpiStats.topCombo.key} (${kpiStats.topCombo.count} stations, ${kpiStats.topCombo.percentage}%)` : "None"}</li>
          </ul>
        </div>

        <h2>Parameter Combination Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Exceeded Parameter Combination</th>
              <th>Number of Stations</th>
              <th>Percentage (%)</th>
            </tr>
          </thead>
          <tbody>
            ${comboAnalysis
              .map(
                (c, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><strong>${c.key}</strong></td>
                <td>${c.count}</td>
                <td>${c.percentage}%</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>

        <h2>State-Level Severity Distribution</h2>
        <table>
          <thead>
            <tr>
              <th>State / UT</th>
              <th>Total Stations</th>
              <th>Clean</th>
              <th>1 Exceedance</th>
              <th>2 Exceedances</th>
              <th>3+ Exceedances</th>
            </tr>
          </thead>
          <tbody>
            ${stateStats
              .map(
                (st) => `
              <tr>
                <td><strong>${st.state}</strong></td>
                <td>${st.total}</td>
                <td>${st.clean}</td>
                <td>${st.one}</td>
                <td>${st.two}</td>
                <td>${st.three + st.fourPlus}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(["\ufeff" + htmlContent], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Water_Quality_Combination_Analysis_Report.doc";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Pure CSS conic gradient donut
  const donutGradientString = useMemo(() => {
    const total = currentFilteredData.length;
    if (total === 0) return "#e2e8f0";
    let accum = 0;
    const parts = chartData.donut.map((item) => {
      const start = accum;
      accum += (item.value / total) * 100;
      return `${item.color} ${start}% ${accum}%`;
    });
    return `conic-gradient(${parts.join(", ")})`;
  }, [chartData.donut, currentFilteredData.length]);

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    parts.push(localState === "All" ? "All States" : localState);
    if (localDistrict !== "All") parts.push(localDistrict);
    if (localBlock !== "All") parts.push(localBlock);
    if (localSource !== "All") parts.push(localSource);
    parts.push(`${activeSet.length} Parameters`);
    parts.push(`${currentFilteredData.length.toLocaleString()} Wells`);
    return parts;
  }, [localState, localDistrict, localBlock, localSource, activeSet.length, currentFilteredData.length]);

  const activeSubFilterLabel = selectedComboFilter
    ? `Combination: ${selectedComboFilter}`
    : selectedPairFilter
    ? `Co-Occurring Pair: ${selectedPairFilter[0]} + ${selectedPairFilter[1]}`
    : "";

  const totalPages = Math.max(1, Math.ceil(displayFilteredData.length / pageSize));
  const exceedingTotal = currentFilteredData.length - kpiStats.clean;

  return (
    <div className="combination-console w-full space-y-5 text-slate-800">
      {/* 1. Workspace Header Bar */}
      <header className="bg-white border border-slate-200 rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
            <Compass className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight text-slate-900 leading-tight truncate">
              Combination &amp; Multi-Parameter Overlap Analysis
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5 tabular-nums">
              {activeFilterSummary.map((part, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span aria-hidden="true" className="text-slate-300">·</span>}
                  <span className={idx === activeFilterSummary.length - 1 ? "font-semibold text-slate-700" : ""}>{part}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-teal-700" />
            <span>{sidebarOpen ? "Hide Filters" : "Show Filters"}</span>
          </button>

          <button
            onClick={resetAllFilters}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            title="Reset all filters and selections"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <button
            onClick={exportDocxReport}
            className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            title="Download formatted Word Document report"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-600" />
            <span>Word (.doc)</span>
          </button>

          <button
            onClick={exportMultiSheet}
            className="h-9 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            title="Download multi-sheet Excel workbook"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
        </div>
      </header>

      {/* 2. Flat Single-Elevation KPI Strip */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-slate-200 tabular-nums">
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-medium text-slate-500">Matched Sites</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-900">{kpiStats.total.toLocaleString()}</span>
              <span className="text-xs text-slate-400">/ {rawData.length.toLocaleString()}</span>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-[11px] font-medium text-emerald-700">Compliant (0 Fail)</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-emerald-700">{kpiStats.clean.toLocaleString()}</span>
              <span className="text-xs font-medium text-slate-500">
                {kpiStats.total > 0 ? ((kpiStats.clean / kpiStats.total) * 100).toFixed(1) : "0.0"}%
              </span>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-[11px] font-medium text-amber-700">Single Fail (1)</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-amber-600">{kpiStats.single.toLocaleString()}</span>
              <span className="text-xs font-medium text-slate-500">
                {kpiStats.total > 0 ? ((kpiStats.single / kpiStats.total) * 100).toFixed(1) : "0.0"}%
              </span>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-[11px] font-medium text-rose-700">Multi Fail (≥ 2)</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-rose-600">{kpiStats.multi.toLocaleString()}</span>
              <span className="text-xs font-medium text-slate-500">
                {kpiStats.total > 0 ? ((kpiStats.multi / kpiStats.total) * 100).toFixed(1) : "0.0"}%
              </span>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-[11px] font-medium text-slate-500">Max Co-Exceedances</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-indigo-700">{kpiStats.maxFail}</span>
              <span className="text-xs text-slate-500">params / site</span>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-[11px] font-medium text-slate-500">Top Combination</div>
            <div className="mt-1 truncate" title={kpiStats.topCombo ? kpiStats.topCombo.key : "None"}>
              <div className="text-sm font-bold text-slate-900 truncate">
                {kpiStats.topCombo ? kpiStats.topCombo.key : "None"}
              </div>
              <div className="text-[11px] text-slate-500">
                {kpiStats.topCombo ? `${kpiStats.topCombo.count.toLocaleString()} sites (${kpiStats.topCombo.percentage}%)` : "All compliant"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Active Combination / Pairwise Filter Notice */}
      {activeSubFilterLabel && (
        <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Filtering 4:3 Map &amp; Well Log for <strong className="text-teal-300">{activeSubFilterLabel}</strong>{" "}
              <span className="text-slate-300 tabular-nums">({comboScopedData.length.toLocaleString()} matching sites)</span>
            </span>
          </div>
          <button
            onClick={() => {
              setSelectedComboFilter("");
              setSelectedPairFilter(null);
            }}
            className="h-7 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>Clear Filter</span>
          </button>
        </div>
      )}

      {/* 3. Primary Spatial Workbench: Docked Control Rail + Exact 4:3 Map Stage */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Docked Light Architectural Control Rail */}
        {sidebarOpen && (
          <aside className="w-full lg:w-[328px] xl:w-[356px] shrink-0 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">Filter &amp; Parameter Controls</span>
              <span className="text-[11px] text-slate-500 font-medium tabular-nums">
                {currentFilteredData.length.toLocaleString()} sites
              </span>
            </div>

            <div className="p-4 space-y-5">
              {/* Geographic & Source Filters */}
              <div className="space-y-3">
                <div className="text-[11px] font-semibold text-slate-500">Region &amp; Source Scope</div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">State / UT</label>
                    <select
                      value={localState}
                      onChange={(e) => {
                        setLocalState(e.target.value);
                        setLocalDistrict("All");
                        setLocalBlock("All");
                      }}
                      className="w-full h-9 bg-slate-50 hover:bg-white border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-teal-600 cursor-pointer transition-colors"
                    >
                      <option value="All">All States</option>
                      {filterOptions.states.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">District</label>
                      <select
                        value={localDistrict}
                        onChange={(e) => {
                          setLocalDistrict(e.target.value);
                          setLocalBlock("All");
                        }}
                        disabled={localState === "All"}
                        className="w-full h-9 bg-slate-50 hover:bg-white disabled:opacity-50 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-teal-600 cursor-pointer transition-colors"
                      >
                        <option value="All">All Districts</option>
                        {filterOptions.districts.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Block</label>
                      <select
                        value={localBlock}
                        onChange={(e) => setLocalBlock(e.target.value)}
                        disabled={localDistrict === "All"}
                        className="w-full h-9 bg-slate-50 hover:bg-white disabled:opacity-50 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-teal-600 cursor-pointer transition-colors"
                      >
                        <option value="All">All Blocks</option>
                        {filterOptions.blocks.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Source Type</label>
                      <select
                        value={localSource}
                        onChange={(e) => setLocalSource(e.target.value)}
                        disabled={!columnMapping["Source"]}
                        className="w-full h-9 bg-slate-50 hover:bg-white disabled:opacity-50 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-teal-600 cursor-pointer transition-colors"
                      >
                        <option value="All">{columnMapping["Source"] ? "All Sources" : "Not Mapped"}</option>
                        {filterOptions.sources.map((src) => (
                          <option key={src} value={src}>
                            {src}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Aquifer</label>
                      <select
                        value={localAquifer}
                        onChange={(e) => setLocalAquifer(e.target.value)}
                        disabled={!columnMapping["Aquifer"]}
                        className="w-full h-9 bg-slate-50 hover:bg-white disabled:opacity-50 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-teal-600 cursor-pointer transition-colors"
                      >
                        <option value="All">{columnMapping["Aquifer"] ? "All Aquifers" : "Not Mapped"}</option>
                        {filterOptions.aquifers.map((aq) => (
                          <option key={aq} value={aq}>
                            {aq}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Year</label>
                      <select
                        value={localYear}
                        onChange={(e) => setLocalYear(e.target.value)}
                        disabled={!columnMapping["Year"]}
                        className="w-full h-9 bg-slate-50 hover:bg-white disabled:opacity-50 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-teal-600 cursor-pointer transition-colors"
                      >
                        <option value="All">{columnMapping["Year"] ? "All Years" : "Not Mapped"}</option>
                        {filterOptions.years.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Season</label>
                      <select
                        value={localSeason}
                        onChange={(e) => setLocalSeason(e.target.value)}
                        disabled={!columnMapping["Season"]}
                        className="w-full h-9 bg-slate-50 hover:bg-white disabled:opacity-50 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-teal-600 cursor-pointer transition-colors"
                      >
                        <option value="All">{columnMapping["Season"] ? "All Seasons" : "Not Mapped"}</option>
                        {filterOptions.seasons.map((seas) => (
                          <option key={seas} value={seas}>
                            {seas}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-200" />

              {/* Parameter Selection Controls */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">Parameters ({activeSet.length} active)</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={selectAllMappedParams}
                      className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                    >
                      All
                    </button>
                    <button
                      onClick={selectBisParamsOnly}
                      className="px-2 py-1 text-[11px] font-medium text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                    >
                      BIS
                    </button>
                    <button
                      onClick={clearParamSelection}
                      className="px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                    >
                      Default
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto pr-0.5 custom-scrollbar">
                  {mappedParamKeys.map((p) => {
                    const isChecked = !!activeParams[p];
                    const isDefaultIncluded = Object.keys(activeParams).every((k) => !activeParams[k]) && hasBisLimit(p);
                    return (
                      <button
                        key={p}
                        onClick={() => setActiveParams((prev) => ({ ...prev, [p]: !prev[p] }))}
                        className={`h-7 px-1.5 text-[11px] font-semibold rounded-md border transition-colors truncate cursor-pointer ${
                          isChecked
                            ? "bg-teal-700 text-white border-teal-700"
                            : isDefaultIncluded
                            ? "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                        title={PARAM_CONFIG[p]?.name || p}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={strictData}
                    onChange={(e) => setStrictData(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-teal-700 accent-teal-700 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-slate-600">Strict mode (require all active parameters)</span>
                </label>
              </div>
            </div>
          </aside>
        )}

        {/* Right Primary Stage: Dedicated 4:3 Ratio Interactive Map Card */}
        <section className="flex-1 min-w-0 w-full bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
          {/* Map Toolbar */}
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <MapPin className="w-4 h-4 text-teal-700 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 truncate">Spatial Overlap &amp; Exceedance Map</h3>
              <span className="text-xs text-slate-400 font-mono tabular-nums whitespace-nowrap">· 4:3 View</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Point size control */}
              <div className="flex items-center gap-2 h-8 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-600">
                <span className="whitespace-nowrap font-medium">Size</span>
                <input
                  type="range"
                  min={3}
                  max={14}
                  value={pointSize}
                  onChange={(e) => setPointSize(parseInt(e.target.value, 10))}
                  className="w-16 accent-teal-700 cursor-pointer"
                />
                <span className="font-mono text-[11px] text-slate-700 tabular-nums w-4 text-right">{pointSize}</span>
              </div>

              {/* Basemap selector */}
              <select
                value={mapTheme}
                onChange={(e) => setMapTheme(e.target.value as ComboMapTheme)}
                aria-label="Basemap Theme"
                className="h-8 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg px-2.5 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
              >
                {(Object.keys(BASEMAP_SPECS) as ComboMapTheme[]).map((key) => (
                  <option key={key} value={key}>
                    {BASEMAP_SPECS[key].label}
                  </option>
                ))}
              </select>

              {/* Fit extent */}
              <button
                onClick={handleFitBounds}
                className="h-8 px-2.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                title="Fit map to active stations"
              >
                <Maximize2 className="w-3.5 h-3.5 text-teal-700" />
                <span>Fit</span>
              </button>
            </div>
          </div>

          {/* 4:3 Ratio Map Frame */}
          <div className="p-4 bg-slate-50/50">
            <div
              ref={mapFrameRef}
              className="w-full max-w-[960px] mx-auto aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 bg-slate-200 relative"
            >
              <div ref={mapRef} className="absolute inset-0 w-full h-full z-10" />
            </div>
          </div>

          {/* Interactive Legend & Layer Filter Bar */}
          <div className="px-4 py-3 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={mapStatusFilters.clean}
                  onChange={(e) => setMapStatusFilters((prev) => ({ ...prev, clean: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-emerald-600 rounded cursor-pointer"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] shrink-0" />
                <span>Compliant ({kpiStats.clean.toLocaleString()})</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={mapStatusFilters.single}
                  onChange={(e) => setMapStatusFilters((prev) => ({ ...prev, single: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shrink-0" />
                <span>Single Fail ({kpiStats.single.toLocaleString()})</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={mapStatusFilters.multi}
                  onChange={(e) => setMapStatusFilters((prev) => ({ ...prev, multi: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-rose-600 rounded cursor-pointer"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] shrink-0" />
                <span>Multi Fail ≥ 2 ({kpiStats.multi.toLocaleString()})</span>
              </label>
            </div>

            <div className="text-[11px] text-slate-500 font-medium">
              Click any station marker to inspect BIS limits and observed values
            </div>
          </div>
        </section>
      </div>

      {/* 4. Detailed Analytics Section */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
        {/* Segmented Tab Bar */}
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {[
              { id: "overview" as const, label: "Overview & Well Log", icon: Table },
              { id: "pairwise" as const, label: "Pairwise Co-Occurrence", icon: Grid },
              { id: "bganalysis" as const, label: "Exceedance Analysis", icon: Info },
              { id: "state" as const, label: "States Severity", icon: Layers },
              { id: "district" as const, label: "Districts Severity", icon: Layers }
            ].map((t) => {
              const TabIcon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    isActive
                      ? "bg-white text-teal-800 border border-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-xs text-slate-500 tabular-nums hidden md:block">
            {comboAnalysis.length} distinct exceedance {comboAnalysis.length === 1 ? "combination" : "combinations"}
          </div>
        </div>

        <div className="p-5">
          {/* TAB 1: OVERVIEW & WELL LOG */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Severity Distribution Donut */}
                <div className="lg:col-span-5 border border-slate-200 rounded-xl p-5 flex flex-col justify-between bg-white">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-900">Severity Distribution</h4>
                    <span className="text-xs text-slate-500 tabular-nums">{kpiStats.total.toLocaleString()} total sites</span>
                  </div>

                  <div className="flex justify-center py-3">
                    <div
                      className="w-40 h-40 rounded-full flex items-center justify-center relative"
                      style={{ background: donutGradientString }}
                    >
                      <div className="w-26 h-26 rounded-full bg-white flex flex-col items-center justify-center border border-slate-100">
                        <span className="text-2xl font-bold text-slate-900 tabular-nums">{kpiStats.total.toLocaleString()}</span>
                        <span className="text-[11px] font-medium text-slate-500">Stations</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 tabular-nums">
                    {chartData.donut.map((item) => (
                      <div key={item.name} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-2 text-slate-700 font-medium min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="truncate">{item.name}</span>
                        </span>
                        <span className="font-semibold text-slate-900 whitespace-nowrap shrink-0">
                          {item.value.toLocaleString()}{" "}
                          <span className="text-slate-500 font-normal">({item.percentage}%)</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Interactive Top Parameter Combinations */}
                <div className="lg:col-span-7 border border-slate-200 rounded-xl p-5 flex flex-col bg-white">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Exceedance Combination Breakdown</h4>
                      <p className="text-xs text-slate-500">Click any combination row to isolate those sites on the 4:3 map and table</p>
                    </div>
                    {selectedComboFilter && (
                      <button
                        onClick={() => setSelectedComboFilter("")}
                        className="text-xs font-semibold text-teal-700 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Show all
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pr-1 custom-scrollbar">
                    {comboAnalysis.length > 0 ? (
                      comboAnalysis.map((c) => {
                        const isSelected = selectedComboFilter === c.key;
                        const maxComboCount = comboAnalysis[0]?.count || 1;
                        const barWidthPct = Math.max(4, (c.count / maxComboCount) * 100);
                        return (
                          <button
                            key={c.key}
                            onClick={() => {
                              setSelectedPairFilter(null);
                              setSelectedComboFilter(isSelected ? "" : c.key);
                            }}
                            className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                              isSelected
                                ? "border-teal-600 bg-teal-50/70"
                                : "border-slate-200 bg-slate-50/60 hover:bg-slate-100/80"
                            }`}
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-slate-900 block truncate">{c.key}</span>
                                <span className="text-[11px] text-slate-500">
                                  {c.paramCount} {c.paramCount === 1 ? "parameter" : "parameters"} exceeding BIS limit
                                </span>
                              </div>
                              <div className="text-right shrink-0 tabular-nums">
                                <span className="text-xs font-bold text-slate-900">{c.count.toLocaleString()} sites</span>
                                <span className="text-[11px] text-slate-500 ml-1.5">({c.percentage}%)</span>
                              </div>
                            </div>
                            <div className="mt-2 h-1.5 w-full bg-slate-200/80 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${c.paramCount > 1 ? "bg-rose-500" : "bg-amber-500"}`}
                                style={{ width: `${barWidthPct}%` }}
                              />
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="py-12 text-center text-xs text-slate-500">
                        No parameter exceedances detected under the current filter scope.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Searchable & Paginated Matched Well Records */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Matched Monitoring Well Records</h4>
                    <p className="text-xs text-slate-500 tabular-nums">
                      Showing {displayFilteredData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                      {Math.min(currentPage * pageSize, displayFilteredData.length)} of{" "}
                      {displayFilteredData.length.toLocaleString()} records
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search station, state, block, parameter..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="h-8 bg-white border border-slate-200 rounded-lg pl-8 pr-7 text-xs text-slate-700 outline-none w-60 focus:border-teal-600 transition-colors"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
                          aria-label="Clear search"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="h-8 bg-white border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-700 outline-none cursor-pointer"
                    >
                      <option value={10}>10 / page</option>
                      <option value={25}>25 / page</option>
                      <option value={50}>50 / page</option>
                      <option value={100}>100 / page</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-900 text-white text-[11px] font-semibold">
                      <tr>
                        <th className="px-3.5 py-2.5 text-right w-12">#</th>
                        <th className="px-3.5 py-2.5">Station Location</th>
                        <th className="px-3.5 py-2.5">State</th>
                        <th className="px-3.5 py-2.5">District</th>
                        <th className="px-3.5 py-2.5">Block</th>
                        <th className="px-3.5 py-2.5 text-right">Exceedances</th>
                        <th className="px-3.5 py-2.5">Failed Parameters</th>
                        <th className="px-3.5 py-2.5 text-right">MPR Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 tabular-nums">
                      {displayFilteredData.length > 0 ? (
                        displayFilteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((r, i) => {
                          const globalIdx = (currentPage - 1) * pageSize + i + 1;
                          const comboKey = r.failedParams
                            .map((p: any) => p.name)
                            .sort()
                            .join(" + ");
                          return (
                            <tr key={globalIdx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3.5 py-2.5 text-right text-slate-400 font-mono">{globalIdx}</td>
                              <td className="px-3.5 py-2.5 font-semibold text-slate-900">{r[columnMapping["Station"]] || "Well Site"}</td>
                              <td className="px-3.5 py-2.5">{r[columnMapping["State"]] || "—"}</td>
                              <td className="px-3.5 py-2.5">{r[columnMapping["District"]] || "—"}</td>
                              <td className="px-3.5 py-2.5">{r[columnMapping["Block"]] || "—"}</td>
                              <td className="px-3.5 py-2.5 text-right font-semibold">
                                <span
                                  className={
                                    r.failCount === 0
                                      ? "text-emerald-700"
                                      : r.failCount === 1
                                      ? "text-amber-700"
                                      : "text-rose-700"
                                  }
                                >
                                  {r.failCount} {r.failCount === 1 ? "Fail" : "Fails"}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5">
                                {r.failedParams.length > 0 ? (
                                  <button
                                    onClick={() => {
                                      setSelectedPairFilter(null);
                                      setSelectedComboFilter(selectedComboFilter === comboKey ? "" : comboKey);
                                    }}
                                    className="text-left font-semibold text-rose-700 hover:underline cursor-pointer max-w-[260px] truncate block"
                                    title={`Filter map and table for: ${comboKey}`}
                                  >
                                    {comboKey}
                                  </button>
                                ) : (
                                  <span className="text-emerald-700 font-medium">Compliant</span>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-slate-900">
                                {r._mprScoreNum.toFixed(4)}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={8} className="p-10 text-center text-slate-500 text-xs">
                            No monitoring well records matched the active search query or combination filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {displayFilteredData.length > pageSize && (
                  <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200 flex items-center justify-between text-xs tabular-nums">
                    <span className="text-slate-600 font-medium">
                      Page {currentPage} of {totalPages}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="h-7 px-2 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="px-2.5 py-1 bg-white rounded-md border border-slate-200 font-semibold text-slate-800">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={currentPage >= totalPages}
                        className="h-7 px-2 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PAIRWISE CO-OCCURRENCE MATRIX */}
          {activeTab === "pairwise" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Pairwise Co-Occurrence Matrix</h4>
                  <p className="text-xs text-slate-500">
                    Number of monitoring wells simultaneously exceeding BIS permissible limits for each parameter pair. Click any highlighted cell to filter the 4:3 map.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedComboFilter("");
                    setSelectedPairFilter(null);
                  }}
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Selection</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto custom-scrollbar">
                <table className="w-full text-center text-xs border-collapse tabular-nums">
                  <thead>
                    <tr>
                      <th className="px-3.5 py-2.5 border-b border-r border-slate-200 bg-slate-900 text-white text-left font-semibold whitespace-nowrap">
                        Parameter
                      </th>
                      {activeSet.map((p) => (
                        <th
                          key={p}
                          className="px-2.5 py-2.5 border-b border-r border-slate-700 bg-slate-800 text-slate-100 font-semibold min-w-[66px] whitespace-nowrap"
                        >
                          {p}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeSet.map((p1) => (
                      <tr key={p1} className="hover:bg-slate-50/70">
                        <td className="px-3.5 py-2.5 border-b border-r border-slate-200 bg-slate-50 font-semibold text-slate-900 text-left whitespace-nowrap">
                          {p1}
                        </td>
                        {activeSet.map((p2) => {
                          const count = pairwiseMatrix[p1]?.[p2] || 0;
                          const isSelf = p1 === p2;
                          const ratio = isSelf ? 0 : count / pairwiseMaxVal;
                          const isSelectedPair =
                            selectedPairFilter &&
                            ((selectedPairFilter[0] === p1 && selectedPairFilter[1] === p2) ||
                              (selectedPairFilter[0] === p2 && selectedPairFilter[1] === p1));

                          let bgStyle: React.CSSProperties = {};
                          if (isSelf) {
                            bgStyle = { backgroundColor: "#f1f5f9", color: "#94a3b8" };
                          } else if (count > 0) {
                            const alpha = Math.max(0.14, Math.min(0.88, ratio));
                            bgStyle = {
                              backgroundColor: `rgba(190, 18, 60, ${alpha})`,
                              color: ratio > 0.42 ? "#ffffff" : "#881337"
                            };
                          } else {
                            bgStyle = { backgroundColor: "#ffffff", color: "#cbd5e1" };
                          }

                          return (
                            <td
                              key={p2}
                              style={bgStyle}
                              className={`px-2.5 py-2.5 border-b border-r border-slate-200 font-mono font-semibold transition-colors ${
                                !isSelf && count > 0 ? "cursor-pointer hover:ring-2 hover:ring-inset hover:ring-slate-900" : ""
                              } ${isSelectedPair ? "ring-2 ring-inset ring-slate-900" : ""}`}
                              title={isSelf ? `${p1}` : `${count.toLocaleString()} wells exceed both ${p1} and ${p2}`}
                              onClick={() => {
                                if (!isSelf && count > 0) {
                                  setSelectedComboFilter("");
                                  setSelectedPairFilter(isSelectedPair ? null : [p1, p2]);
                                }
                              }}
                            >
                              {isSelf ? "—" : count}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-700">Co-Occurrence Intensity:</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-rose-100 border border-rose-200 inline-block" /> Low
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-rose-700 inline-block" /> High
                  </span>
                </div>
                <span>Diagonal cells represent single parameters and are excluded from co-occurrence counts.</span>
              </div>
            </div>
          )}

          {/* TAB 3: EXCEEDANCE ANALYSIS */}
          {activeTab === "bganalysis" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-8 border border-slate-200 rounded-xl overflow-hidden overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse tabular-nums">
                  <thead className="bg-slate-900 text-white text-[11px] font-semibold">
                    <tr>
                      <th className="px-3.5 py-2.5 text-right w-12">Sl.</th>
                      <th className="px-3.5 py-2.5">State / UT Name</th>
                      <th className="px-3.5 py-2.5 text-right">Total Stations</th>
                      <th className="px-3.5 py-2.5 text-right">Exceeding</th>
                      <th className="px-3.5 py-2.5 text-right">Within Limits</th>
                      <th className="px-3.5 py-2.5 text-right">% Exceeding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {stateStats.map((st, idx) => {
                      const contam = st.total - st.clean;
                      const perc = st.total > 0 ? ((contam / st.total) * 100).toFixed(2) : "0.00";
                      return (
                        <tr key={st.state} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3.5 py-2.5 text-right text-slate-400 font-mono">{idx + 1}</td>
                          <td className="px-3.5 py-2.5 font-semibold text-slate-900">{st.state}</td>
                          <td className="px-3.5 py-2.5 text-right font-medium">{st.total.toLocaleString()}</td>
                          <td className="px-3.5 py-2.5 text-right font-semibold text-rose-700">{contam.toLocaleString()}</td>
                          <td className="px-3.5 py-2.5 text-right font-semibold text-emerald-700">{st.clean.toLocaleString()}</td>
                          <td className="px-3.5 py-2.5 text-right font-semibold text-slate-900">{perc}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 text-slate-900 font-bold text-xs border-t-2 border-slate-300">
                    <tr>
                      <td className="px-3.5 py-3" colSpan={2}>
                        All States Total
                      </td>
                      <td className="px-3.5 py-3 text-right">{currentFilteredData.length.toLocaleString()}</td>
                      <td className="px-3.5 py-3 text-right text-rose-700">{exceedingTotal.toLocaleString()}</td>
                      <td className="px-3.5 py-3 text-right text-emerald-700">{kpiStats.clean.toLocaleString()}</td>
                      <td className="px-3.5 py-3 text-right">
                        {currentFilteredData.length > 0
                          ? ((exceedingTotal / currentFilteredData.length) * 100).toFixed(2)
                          : "0.00"}
                        %
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 text-xs leading-relaxed text-slate-700 self-start">
                <h5 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2.5">Selection Insight</h5>
                <p>
                  <strong className="text-rose-700 tabular-nums">{exceedingTotal.toLocaleString()} stations</strong> (
                  {currentFilteredData.length > 0 ? ((exceedingTotal / currentFilteredData.length) * 100).toFixed(1) : "0.0"}%) exceed at
                  least one active parameter above BIS permissible limits.
                </p>
                <p>
                  <strong className="text-emerald-700 tabular-nums">{kpiStats.clean.toLocaleString()} stations</strong> remain within
                  permissible limits across all {activeSet.length} active parameters.
                </p>
                <p>
                  Among affected sites,{" "}
                  <strong className="text-slate-900 tabular-nums">{kpiStats.multi.toLocaleString()}</strong> exhibit simultaneous
                  multi-parameter exceedances (≥ 2 parameters), requiring prioritized source remediation.
                </p>
                <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                  Evaluated against BIS IS 10500 permissible limits across {activeSet.length} active parameters.
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: STATES SEVERITY */}
          {activeTab === "state" && (
            <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse tabular-nums">
                <thead className="bg-slate-900 text-white text-[11px] font-semibold">
                  <tr>
                    <th className="px-3.5 py-2.5">State / UT</th>
                    <th className="px-3.5 py-2.5 text-right">Total</th>
                    <th className="px-3.5 py-2.5 text-right text-emerald-300">Clean (0)</th>
                    <th className="px-3.5 py-2.5 text-right text-amber-300">1 Param</th>
                    <th className="px-3.5 py-2.5 text-right text-orange-300">2 Params</th>
                    <th className="px-3.5 py-2.5 text-right text-rose-300">3 Params</th>
                    <th className="px-3.5 py-2.5 text-right text-red-300">4+ Params</th>
                    <th className="px-3.5 py-2.5">Exceeding Parameters</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {stateStats.map((st) => (
                    <tr key={st.state} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3.5 py-2.5 font-semibold text-slate-900 whitespace-nowrap">{st.state}</td>
                      <td className="px-3.5 py-2.5 text-right font-semibold text-slate-900">{st.total.toLocaleString()}</td>
                      <td className="px-3.5 py-2.5 text-right text-emerald-700 whitespace-nowrap">
                        {st.clean.toLocaleString()}{" "}
                        <span className="text-slate-400">({st.total > 0 ? ((st.clean / st.total) * 100).toFixed(1) : "0.0"}%)</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-amber-700 whitespace-nowrap">
                        {st.one.toLocaleString()}{" "}
                        <span className="text-slate-400">({st.total > 0 ? ((st.one / st.total) * 100).toFixed(1) : "0.0"}%)</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-orange-700 whitespace-nowrap">
                        {st.two.toLocaleString()}{" "}
                        <span className="text-slate-400">({st.total > 0 ? ((st.two / st.total) * 100).toFixed(1) : "0.0"}%)</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-rose-700 whitespace-nowrap">
                        {st.three.toLocaleString()}{" "}
                        <span className="text-slate-400">({st.total > 0 ? ((st.three / st.total) * 100).toFixed(1) : "0.0"}%)</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-red-700 whitespace-nowrap">
                        {st.fourPlus.toLocaleString()}{" "}
                        <span className="text-slate-400">({st.total > 0 ? ((st.fourPlus / st.total) * 100).toFixed(1) : "0.0"}%)</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600 max-w-[260px] truncate" title={Array.from(st.params).join(", ")}>
                        {Array.from(st.params).join(", ") || "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 5: DISTRICTS SEVERITY */}
          {activeTab === "district" && (
            <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse tabular-nums">
                <thead className="bg-slate-900 text-white text-[11px] font-semibold">
                  <tr>
                    <th className="px-3.5 py-2.5">State / UT</th>
                    <th className="px-3.5 py-2.5">District</th>
                    <th className="px-3.5 py-2.5 text-right">Total</th>
                    <th className="px-3.5 py-2.5 text-right text-emerald-300">Clean (0)</th>
                    <th className="px-3.5 py-2.5 text-right text-amber-300">1 Param</th>
                    <th className="px-3.5 py-2.5 text-right text-orange-300">2 Params</th>
                    <th className="px-3.5 py-2.5 text-right text-rose-300">3 Params</th>
                    <th className="px-3.5 py-2.5 text-right text-red-300">4+ Params</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {districtStats.map((dt, i) => (
                    <tr key={`${dt.state}-${dt.district}-${i}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3.5 py-2.5 text-slate-500 whitespace-nowrap">{dt.state}</td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-900 whitespace-nowrap">{dt.district}</td>
                      <td className="px-3.5 py-2.5 text-right font-semibold text-slate-900">{dt.total.toLocaleString()}</td>
                      <td className="px-3.5 py-2.5 text-right text-emerald-700">{dt.clean.toLocaleString()}</td>
                      <td className="px-3.5 py-2.5 text-right text-amber-700">{dt.one.toLocaleString()}</td>
                      <td className="px-3.5 py-2.5 text-right text-orange-700">{dt.two.toLocaleString()}</td>
                      <td className="px-3.5 py-2.5 text-right text-rose-700">{dt.three.toLocaleString()}</td>
                      <td className="px-3.5 py-2.5 text-right text-red-700">{dt.fourPlus.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
