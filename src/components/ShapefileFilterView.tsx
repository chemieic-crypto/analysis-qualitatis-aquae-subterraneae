import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import L from "leaflet";
import shp from "shpjs";
import * as turf from "@turf/turf";
import * as XLSX from "xlsx";
import { ensureSheetJSNumbers, isNumericString } from "../utils/excelFormatter";
import {
  MapPin,
  Filter,
  Download,
  FileSpreadsheet,
  Layers,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  RefreshCw,
  Upload,
  Eye,
  EyeOff,
  Globe,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Check,
  Info,
  Sparkles,
  Sliders,
  Database,
  TableProperties,
  Compass
} from "lucide-react";
import { PARAM_CONFIG, hasBisLimit } from "../data/config";
import {
  createPointShapefileZip,
  createPolygonShapefileZip,
  createShapefileFromGeoJson,
  downloadBlob,
  ShapefilePointFeature,
  ShapefilePolygonFeature
} from "../utils/shapefileWriter";
import { ShapefileLayer } from "./GisMapView";

interface ShapefileFilterViewProps {
  rawData: any[];
  headers: any;
  headerMap: Record<string, string>;
  selectedState?: string;
  selectedDistrict?: string;
  showToast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
  isVisible: boolean;
  sharedLayers: ShapefileLayer[];
  setSharedLayers: React.Dispatch<React.SetStateAction<ShapefileLayer[]>>;
  setGlobalRawData?: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function ShapefileFilterView({
  rawData = [],
  headers,
  headerMap,
  selectedState,
  selectedDistrict,
  showToast,
  isVisible,
  sharedLayers = [],
  setSharedLayers,
  setGlobalRawData
}: ShapefileFilterViewProps) {
  // Active shapefile geometry state
  const [activeGeoJson, setActiveGeoJson] = useState<any | null>(null);
  const [shapefileName, setShapefileName] = useState<string>("");
  const [selectedLayerId, setSelectedLayerId] = useState<string>("custom");
  const [selectedFeatureIndex, setSelectedFeatureIndex] = useState<number>(-1); // -1 = All features combined
  const [isParsingShapefile, setIsParsingShapefile] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Map & Visual states
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const pointsLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [basemap, setBasemap] = useState<"osm" | "topo" | "satellite">("osm");
  const [showOutsidePoints, setShowOutsidePoints] = useState<boolean>(true);
  const [polygonColor, setPolygonColor] = useState<string>("#2563eb");
  const [polygonFillOpacity, setPolygonFillOpacity] = useState<number>(0.15);
  const [selectedParamFilter, setSelectedParamFilter] = useState<string>("TDS");

  // Table & Search states
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [complianceFilter, setComplianceFilter] = useState<"all" | "safe" | "permissible" | "exceeded">("all");
  const [sortColumn, setSortColumn] = useState<string>("wellId");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(20);
  const [hideEmptyParams, setHideEmptyParams] = useState<boolean>(true);

  // Backup of original rawData for resetting global dataset
  const [originalDatasetBackup, setOriginalDatasetBackup] = useState<any[] | null>(null);
  const [isFilteredAppliedGlobally, setIsFilteredAppliedGlobally] = useState<boolean>(false);

  // Auto-detect coordinate field keys
  const { latKey, lngKey, wellIdKey, locationKey, districtKey, blockKey, stateKey } = useMemo(() => {
    if (!rawData || rawData.length === 0) {
      return {
        latKey: "Latitude",
        lngKey: "Longitude",
        wellIdKey: "Well ID",
        locationKey: "Location",
        districtKey: "District",
        blockKey: "Block",
        stateKey: "State"
      };
    }
    const sample = rawData[0] || {};
    const keys = Object.keys(sample);

    const findKey = (candidates: string[], fallback: string) => {
      const match = keys.find((k) =>
        candidates.some((c) => k.trim().toLowerCase() === c.toLowerCase())
      );
      return match || fallback;
    };

    return {
      latKey: findKey(["latitude", "lat", "y", "lat_dd", "y_coord"], headers?.latitude || "Latitude"),
      lngKey: findKey(["longitude", "long", "lng", "lon", "x", "long_dd", "x_coord"], headers?.longitude || "Longitude"),
      wellIdKey: findKey(["well id", "well_id", "wellid", "station", "station_id", "id", "site_id"], headers?.wellId || "Well ID"),
      locationKey: findKey(["location", "village", "site", "site_name", "location_name"], headers?.location || "Location"),
      districtKey: findKey(["district", "dist", "district_name"], headers?.district || "District"),
      blockKey: findKey(["block", "tehsil", "taluk", "sub_district"], headers?.block || "Block"),
      stateKey: findKey(["state", "st", "state_name"], headers?.state || "State")
    };
  }, [rawData, headers]);

  // Standardize samples with parsed numeric coordinates
  const standardizedSamples = useMemo(() => {
    return rawData.map((row, idx) => {
      const rawLat = row[latKey];
      const rawLng = row[lngKey];
      const lat = typeof rawLat === "number" ? rawLat : parseFloat(String(rawLat || ""));
      const lng = typeof rawLng === "number" ? rawLng : parseFloat(String(rawLng || ""));
      const hasValidCoords = !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

      return {
        id: row[wellIdKey] || `S_${idx + 1}`,
        wellId: row[wellIdKey] || `W-${idx + 1}`,
        location: row[locationKey] || "Unknown Site",
        block: row[blockKey] || "-",
        district: row[districtKey] || "-",
        state: row[stateKey] || "-",
        lat,
        lng,
        hasValidCoords,
        raw: row
      };
    });
  }, [rawData, latKey, lngKey, wellIdKey, locationKey, districtKey, blockKey, stateKey]);

  // Handle Shapefile Upload (.zip, .shp, .geojson, .json)
  const handleShapefileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingShapefile(true);
    try {
      const fileName = file.name.toLowerCase();
      let geojson: any = null;

      if (fileName.endsWith(".zip")) {
        const buffer = await file.arrayBuffer();
        geojson = await shp(buffer);
      } else if (fileName.endsWith(".geojson") || fileName.endsWith(".json")) {
        const text = await file.text();
        geojson = JSON.parse(text);
      } else {
        showToast("Please upload a zipped shapefile (.zip containing .shp, .shx, .dbf) or a GeoJSON file.", "warning");
        setIsParsingShapefile(false);
        return;
      }

      // If shpjs returns array of GeoJSONs (e.g. multi-layer zip)
      if (Array.isArray(geojson)) {
        geojson = geojson[0];
      }

      if (!geojson || (!geojson.features && geojson.type !== "Feature" && geojson.type !== "Polygon" && geojson.type !== "MultiPolygon")) {
        throw new Error("Invalid geometry found in uploaded file.");
      }

      // Standardize to FeatureCollection
      let featureCollection: any = geojson;
      if (geojson.type === "Feature") {
        featureCollection = { type: "FeatureCollection", features: [geojson] };
      } else if (geojson.type === "Polygon" || geojson.type === "MultiPolygon") {
        featureCollection = {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: { Name: file.name }, geometry: geojson }]
        };
      }

      setActiveGeoJson(featureCollection);
      setShapefileName(file.name.replace(/\.[^/.]+$/, ""));
      setSelectedLayerId("custom");
      setSelectedFeatureIndex(-1);

      // Register into sharedLayers for app-wide reuse
      const newLayer: ShapefileLayer = {
        id: `layer-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        geoJson: featureCollection,
        visible: true,
        strokeColor: polygonColor,
        strokeWidth: 2,
        fillColor: polygonColor,
        fillOpacity: polygonFillOpacity,
        showLabels: false,
        labelKey: "",
        labelColor: "#0f172a",
        labelSize: 11
      };
      setSharedLayers((prev) => [newLayer, ...prev]);

      showToast(`Successfully loaded shapefile: ${file.name} (${featureCollection.features?.length || 1} feature(s))`, "success");
    } catch (err: any) {
      console.error("Shapefile parsing error:", err);
      showToast(err?.message || "Failed to parse shapefile. Ensure .shp, .shx, and .dbf are included inside the .zip.", "error");
    } finally {
      setIsParsingShapefile(false);
      if (e.target) e.target.value = "";
    }
  };

  // Switch to an existing shared layer
  const handleSelectSharedLayer = (layerId: string) => {
    setSelectedLayerId(layerId);
    if (layerId === "custom") return;

    const layer = sharedLayers.find((l) => l.id === layerId);
    if (layer && layer.geoJson) {
      setActiveGeoJson(layer.geoJson);
      setShapefileName(layer.name);
      setSelectedFeatureIndex(-1);
      showToast(`Selected boundary layer: ${layer.name}`, "info");
    }
  };

  // Compute active target geometry for point-in-polygon testing
  const activeGeometry = useMemo(() => {
    if (!activeGeoJson) return null;

    const features = activeGeoJson.features || (activeGeoJson.type === "Feature" ? [activeGeoJson] : []);
    if (features.length === 0) return null;

    if (selectedFeatureIndex >= 0 && features[selectedFeatureIndex]) {
      return features[selectedFeatureIndex];
    }

    // Combine all polygons into a single MultiPolygon or check each
    return activeGeoJson;
  }, [activeGeoJson, selectedFeatureIndex]);

  // Available sub-features for the dropdown
  const subFeatures = useMemo(() => {
    if (!activeGeoJson || !activeGeoJson.features) return [];
    return activeGeoJson.features.map((feat: any, idx: number) => {
      const props = feat.properties || {};
      const name = props.Name || props.NAME || props.District || props.DISTRICT || props.Block || props.BLOCK || props.State || props.STATE || `Feature ${idx + 1}`;
      return { index: idx, name: String(name), properties: props };
    });
  }, [activeGeoJson]);

  // Spatial Point-in-Polygon Filtering Execution
  const { insideSamples, outsideSamples, invalidSamples } = useMemo(() => {
    if (!activeGeometry) {
      return { insideSamples: [], outsideSamples: standardizedSamples, invalidSamples: [] };
    }

    const inside: typeof standardizedSamples = [];
    const outside: typeof standardizedSamples = [];
    const invalid: typeof standardizedSamples = [];

    const features = activeGeometry.type === "FeatureCollection"
      ? activeGeometry.features
      : [activeGeometry];

    standardizedSamples.forEach((sample) => {
      if (!sample.hasValidCoords) {
        invalid.push(sample);
        return;
      }

      const pt = turf.point([sample.lng, sample.lat]);
      let isInside = false;

      for (let i = 0; i < features.length; i++) {
        const feat = features[i];
        if (!feat || !feat.geometry) continue;

        try {
          if (turf.booleanPointInPolygon(pt, feat)) {
            isInside = true;
            break;
          }
        } catch (e) {
          // Fallback if geometry is complex/multipolygon
          try {
            if (feat.geometry.type === "MultiPolygon") {
              for (const polyCoords of feat.geometry.coordinates) {
                const poly = turf.polygon(polyCoords);
                if (turf.booleanPointInPolygon(pt, poly)) {
                  isInside = true;
                  break;
                }
              }
              if (isInside) break;
            }
          } catch {
            // ignore
          }
        }
      }

      if (isInside) {
        inside.push(sample);
      } else {
        outside.push(sample);
      }
    });

    return { insideSamples: inside, outsideSamples: outside, invalidSamples: invalid };
  }, [activeGeometry, standardizedSamples]);

  // Compute BIS Compliance statistics for the filtered samples
  const complianceStats = useMemo(() => {
    const list = insideSamples;
    const total = list.length;
    if (total === 0) {
      return { safe: 0, permissible: 0, exceeded: 0, safePct: 0, permPct: 0, excPct: 0 };
    }

    let safeCount = 0;
    let permCount = 0;
    let excCount = 0;

    list.forEach((s) => {
      // Evaluate overall sample potability against all available parameters in row
      let sampleStatus: "safe" | "permissible" | "exceeded" = "safe";

      Object.entries(PARAM_CONFIG).forEach(([param, cfg]) => {
        if (!hasBisLimit(param)) return;
        const key = headerMap[param] || param;
        const rawVal = s.raw[key];
        if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
          const val = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal));
          if (!isNaN(val)) {
            if (param === "pH") {
              if (val < (cfg.b1 || 6.5) || val > (cfg.b2 || 8.5)) {
                sampleStatus = "exceeded";
              }
            } else if (cfg.b1 === cfg.b2) {
              if (val > cfg.b1) {
                sampleStatus = "exceeded";
              }
            } else {
              if (val > cfg.b2) {
                sampleStatus = "exceeded";
              } else if (val > cfg.b1 && sampleStatus !== "exceeded") {
                sampleStatus = "permissible";
              }
            }
          }
        }
      });

      if (sampleStatus === "safe") safeCount++;
      else if (sampleStatus === "permissible") permCount++;
      else excCount++;
    });

    return {
      safe: safeCount,
      permissible: permCount,
      exceeded: excCount,
      safePct: ((safeCount / total) * 100).toFixed(1),
      permPct: ((permCount / total) * 100).toFixed(1),
      excPct: ((excCount / total) * 100).toFixed(1)
    };
  }, [insideSamples, headerMap]);

  // Parameter-wise Spatial Statistics for the filtered samples
  const parameterStats = useMemo(() => {
    return Object.entries(PARAM_CONFIG).map(([param, cfg]) => {
      const key = headerMap[param] || param;
      const values: number[] = [];
      let excCount = 0; // Exceeded Permissible Limit (> b2, or outside 6.5-8.5 for pH, or > b1 if single limit)
      let aboveAcceptCount = 0; // Above Acceptable Limit (> b1)
      const paramHasLimit = hasBisLimit(param);

      insideSamples.forEach((s) => {
        const rawVal = s.raw[key];
        if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
          const v = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal));
          if (!isNaN(v)) {
            values.push(v);
            if (paramHasLimit) {
              if (param === "pH") {
                const isExceed = v < (cfg.b1 || 6.5) || v > (cfg.b2 || 8.5);
                if (isExceed) {
                  excCount++;
                  aboveAcceptCount++;
                }
              } else if (cfg.b1 === cfg.b2) {
                if (v > cfg.b1) {
                  excCount++;
                  aboveAcceptCount++;
                }
              } else {
                if (v > cfg.b1) aboveAcceptCount++;
                if (v > cfg.b2) excCount++;
              }
            }
          }
        }
      });

      const count = values.length;
      const acceptableLabel = paramHasLimit ? (param === "pH" ? `${cfg.b1} - ${cfg.b2}` : cfg.b1) : "-";
      const permissibleLabel = paramHasLimit
        ? (param === "pH" ? "No Relaxation" : (cfg.b1 === cfg.b2 ? "No Relaxation" : cfg.b2))
        : "-";

      if (count === 0) {
        return {
          param,
          unit: cfg.unit,
          acceptable: acceptableLabel,
          permissible: permissibleLabel,
          count: 0,
          min: "-",
          max: "-",
          mean: "-",
          aboveAcceptCount: 0,
          aboveAcceptPct: "0.0%",
          excCount: 0,
          excPct: paramHasLimit ? "0.0%" : "N/A"
        };
      }

      const min = Math.min(...values);
      const max = Math.max(...values);
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / count;

      return {
        param,
        unit: cfg.unit,
        acceptable: acceptableLabel,
        permissible: permissibleLabel,
        count,
        min: min.toFixed(2),
        max: max.toFixed(2),
        mean: mean.toFixed(2),
        aboveAcceptCount,
        aboveAcceptPct: paramHasLimit ? `${((aboveAcceptCount / count) * 100).toFixed(1)}%` : "N/A",
        excCount,
        excPct: paramHasLimit ? `${((excCount / count) * 100).toFixed(1)}%` : "N/A"
      };
    });
  }, [insideSamples, headerMap]);

  // Displayed Parameter Statistics (optionally filtering out parameters not measured in dataset)
  const displayedParamStats = useMemo(() => {
    if (hideEmptyParams) {
      return parameterStats.filter((p) => p.count > 0);
    }
    return parameterStats;
  }, [parameterStats, hideEmptyParams]);

  // Filtered & Sorted Samples for the interactive table
  const displayedTableSamples = useMemo(() => {
    let result = [...insideSamples];

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          s.wellId.toLowerCase().includes(q) ||
          s.location.toLowerCase().includes(q) ||
          s.district.toLowerCase().includes(q) ||
          s.block.toLowerCase().includes(q)
      );
    }

    // Compliance filter
    if (complianceFilter !== "all") {
      result = result.filter((s) => {
        const key = headerMap[selectedParamFilter] || selectedParamFilter;
        const cfg = PARAM_CONFIG[selectedParamFilter];
        const val = parseFloat(String(s.raw[key] || ""));
        if (isNaN(val) || !cfg) return false;
        if (!hasBisLimit(selectedParamFilter)) return true;

        let isExceed = false;
        let isPermissible = false;
        let isSafe = false;

        if (selectedParamFilter === "pH") {
          if (val < (cfg.b1 || 6.5) || val > (cfg.b2 || 8.5)) {
            isExceed = true;
          } else {
            isSafe = true;
          }
        } else if (cfg.b1 === cfg.b2) {
          if (val > cfg.b1) {
            isExceed = true;
          } else {
            isSafe = true;
          }
        } else {
          if (val > cfg.b2) {
            isExceed = true;
          } else if (val > cfg.b1) {
            isPermissible = true;
          } else {
            isSafe = true;
          }
        }

        if (complianceFilter === "safe") return isSafe;
        if (complianceFilter === "permissible") return isPermissible;
        if (complianceFilter === "exceeded") return isExceed;
        return true;
      });
    }

    // Sorting
    result.sort((a, b) => {
      let aVal = a[sortColumn as keyof typeof a] ?? a.raw[sortColumn];
      let bVal = b[sortColumn as keyof typeof b] ?? b.raw[sortColumn];

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDirection === "asc"
        ? String(aVal || "").localeCompare(String(bVal || ""))
        : String(bVal || "").localeCompare(String(aVal || ""));
    });

    return result;
  }, [insideSamples, searchTerm, complianceFilter, sortColumn, sortDirection, headerMap, selectedParamFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(displayedTableSamples.length / rowsPerPage));
  const paginatedSamples = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return displayedTableSamples.slice(start, start + rowsPerPage);
  }, [displayedTableSamples, currentPage, rowsPerPage]);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!isVisible || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      if ((mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        preferCanvas: true
      }).setView([22.5, 78.5], 5);

      mapInstanceRef.current = map;
      pointsLayerGroupRef.current = L.layerGroup().addTo(map);
    }

    const map = mapInstanceRef.current;
    if (!map) return;

    // Basemap URLs
    const basemaps: Record<string, { url: string; attr: string }> = {
      osm: {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attr: "© OpenStreetMap contributors"
      },
      topo: {
        url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        attr: "© OpenTopoMap contributors"
      },
      satellite: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attr: "Tiles © Esri"
      }
    };

    // Remove existing tile layers
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    const activeBase = basemaps[basemap] || basemaps.osm;
    L.tileLayer(activeBase.url, { attribution: activeBase.attr, maxZoom: 19 }).addTo(map);

    // Render / Update Polygon GeoJSON Layer
    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    if (activeGeometry) {
      const geoLayer = L.geoJSON(activeGeometry, {
        style: {
          color: polygonColor,
          weight: 2.5,
          opacity: 0.9,
          fillColor: polygonColor,
          fillOpacity: polygonFillOpacity
        }
      }).addTo(map);
      geoJsonLayerRef.current = geoLayer;

      try {
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30] });
        }
      } catch (e) {
        console.warn("Bounds error:", e);
      }
    }

    // Render Sample Points
    if (pointsLayerGroupRef.current) {
      pointsLayerGroupRef.current.clearLayers();

      // Outside points (rendered first so inside points appear on top)
      if (showOutsidePoints) {
        outsideSamples.forEach((s) => {
          if (!s.hasValidCoords) return;
          const marker = L.circleMarker([s.lat, s.lng], {
            radius: 4,
            fillColor: "#94a3b8",
            fillOpacity: 0.4,
            color: "#64748b",
            weight: 1
          });
          marker.bindPopup(`
            <div style="font-family: system-ui; font-size: 11px; line-height: 1.4;">
              <b style="color: #64748b;">[Outside Boundary]</b><br/>
              <b>Well ID:</b> ${s.wellId}<br/>
              <b>Location:</b> ${s.location}<br/>
              <b>District:</b> ${s.district}<br/>
              <b>Coords:</b> ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}
            </div>
          `);
          pointsLayerGroupRef.current?.addLayer(marker);
        });
      }

      // Inside points (highlighted by compliance with selectedParamFilter)
      insideSamples.forEach((s) => {
        if (!s.hasValidCoords) return;

        const cfg = PARAM_CONFIG[selectedParamFilter];
        const rawVal = s.raw[headerMap[selectedParamFilter] || selectedParamFilter];

        let pointColor = "#10b981"; // Emerald / Safe
        let complianceTag = "Safe (≤ Acceptable)";
        let tagBg = "#ecfdf5";
        let tagColor = "#047857";

        if (cfg && hasBisLimit(selectedParamFilter) && rawVal !== undefined && rawVal !== null && rawVal !== "") {
          const numVal = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal));
          if (!isNaN(numVal)) {
            if (selectedParamFilter === "pH") {
              if (numVal < (cfg.b1 || 6.5) || numVal > (cfg.b2 || 8.5)) {
                pointColor = "#ef4444";
                complianceTag = "Exceeded (Outside 6.5 - 8.5)";
                tagBg = "#fef2f2";
                tagColor = "#b91c1c";
              }
            } else if (cfg.b1 === cfg.b2) {
              if (numVal > cfg.b1) {
                pointColor = "#ef4444";
                complianceTag = `Exceeded (> ${cfg.b1})`;
                tagBg = "#fef2f2";
                tagColor = "#b91c1c";
              }
            } else {
              if (numVal > cfg.b2) {
                pointColor = "#ef4444";
                complianceTag = `Exceeded Permissible (> ${cfg.b2})`;
                tagBg = "#fef2f2";
                tagColor = "#b91c1c";
              } else if (numVal > cfg.b1) {
                pointColor = "#f59e0b";
                complianceTag = `Permissible (${cfg.b1} - ${cfg.b2})`;
                tagBg = "#fffbeb";
                tagColor = "#b45309";
              }
            }
          }
        }

        const marker = L.circleMarker([s.lat, s.lng], {
          radius: 6,
          fillColor: pointColor,
          fillOpacity: 0.9,
          color: "#ffffff",
          weight: 2
        });

        marker.bindPopup(`
          <div style="font-family: system-ui; font-size: 11.5px; line-height: 1.5; min-width: 175px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 4px;">
              <span style="font-weight: 900; color: #0f172a;">${s.wellId}</span>
              <span style="background: ${tagBg}; color: ${tagColor}; font-size: 9.5px; font-weight: bold; padding: 1px 6px; border-radius: 99px;">${complianceTag}</span>
            </div>
            <b>Location:</b> ${s.location}<br/>
            <b>Block:</b> ${s.block} | <b>District:</b> ${s.district}<br/>
            <b>Lat/Lng:</b> ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}<br/>
            ${
              cfg && rawVal !== undefined
                ? `<div style="margin-top: 4px; padding: 4px 6px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <b>${selectedParamFilter}:</b> <span style="font-weight: 800; color: ${pointColor};">${rawVal} ${cfg.unit}</span>
                   </div>`
                : ""
            }
          </div>
        `);
        pointsLayerGroupRef.current?.addLayer(marker);
      });
    }

    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 200);
  }, [isVisible, basemap, activeGeometry, insideSamples, outsideSamples, showOutsidePoints, polygonColor, polygonFillOpacity, selectedParamFilter, headerMap]);

  // Overall unmount cleanup for Shapefile filter map
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {}
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Zoom to polygon bounds
  const handleZoomToShapefile = () => {
    if (!mapInstanceRef.current || !geoJsonLayerRef.current) return;
    try {
      const bounds = geoJsonLayerRef.current.getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
      }
    } catch (e) {
      console.warn("Zoom error:", e);
    }
  };

  // Download filtered points as Shapefile (.zip)
  const handleDownloadPointsShapefile = async () => {
    if (insideSamples.length === 0) {
      showToast("No sample points found inside the shapefile to export.", "warning");
      return;
    }

    setIsExporting(true);
    try {
      const pointFeatures: ShapefilePointFeature[] = insideSamples.map((s) => ({
        lng: s.lng,
        lat: s.lat,
        properties: {
          WELL_ID: s.wellId,
          LOCATION: s.location,
          BLOCK: s.block,
          DISTRICT: s.district,
          STATE: s.state,
          LATITUDE: s.lat,
          LONGITUDE: s.lng,
          ...s.raw
        }
      }));

      const baseName = `${shapefileName || "Filtered"}_Inside_Stations`;
      const zipBlob = await createPointShapefileZip(pointFeatures, baseName);
      downloadBlob(zipBlob, `${baseName}.zip`);
      showToast(`Exported ${insideSamples.length} filtered stations as Shapefile (.zip)!`, "success");
    } catch (err: any) {
      console.error("Shapefile export error:", err);
      showToast(err?.message || "Failed to generate point shapefile.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  // Download boundary polygon as Shapefile (.zip)
  const handleDownloadBoundaryShapefile = async () => {
    if (!activeGeoJson) {
      showToast("No active shapefile boundary loaded.", "warning");
      return;
    }

    setIsExporting(true);
    try {
      const baseName = `${shapefileName || "Boundary"}_Polygon`;
      const zipBlob = await createShapefileFromGeoJson(activeGeometry, baseName);
      downloadBlob(zipBlob, `${baseName}.zip`);
      showToast("Exported boundary polygon as Shapefile (.zip)!", "success");
    } catch (err: any) {
      console.error("Polygon shapefile export error:", err);
      showToast(err?.message || "Failed to generate polygon shapefile.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  // Download combined package (Both boundary and filtered points)
  const handleDownloadCombinedShapefile = async () => {
    if (!activeGeoJson || insideSamples.length === 0) {
      showToast("Please ensure both a shapefile boundary and filtered points are present.", "warning");
      return;
    }

    setIsExporting(true);
    try {
      const baseName = `${shapefileName || "Extracted"}_GIS_Package`;
      // Convert points to GeoJSON features
      const ptFeatures = insideSamples.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        properties: {
          WELL_ID: s.wellId,
          LOCATION: s.location,
          DISTRICT: s.district,
          BLOCK: s.block,
          ...s.raw
        }
      }));

      const polyFeatures = activeGeometry.type === "FeatureCollection"
        ? activeGeometry.features
        : [activeGeometry];

      const combinedGeoJson = {
        type: "FeatureCollection",
        features: [...polyFeatures, ...ptFeatures]
      };

      const zipBlob = await createShapefileFromGeoJson(combinedGeoJson, baseName);
      downloadBlob(zipBlob, `${baseName}.zip`);
      showToast(`Exported complete GIS package (${insideSamples.length} stations + boundaries)!`, "success");
    } catch (err: any) {
      console.error("Combined export error:", err);
      showToast(err?.message || "Failed to generate combined shapefile package.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  // Download filtered points as Excel (.xlsx)
  const handleDownloadExcel = () => {
    if (insideSamples.length === 0) {
      showToast("No sample points to export.", "warning");
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary Statistics
      const summaryData: any[][] = [
        ["CENTRAL GROUND WATER BOARD / GROUNDWATER COMPLIANCE ENGINE"],
        ["SHAPEFILE SPATIAL EXTRACTION REPORT"],
        [],
        ["Shapefile Boundary Name", shapefileName || "User Shapefile"],
        ["Selected Feature", selectedFeatureIndex === -1 ? "All Features Combined" : subFeatures[selectedFeatureIndex]?.name || "Feature"],
        ["Total Dataset Samples", standardizedSamples.length],
        ["Extracted Stations Inside Shapefile", insideSamples.length],
        ["Coverage Ratio (%)", `${((insideSamples.length / Math.max(1, standardizedSamples.length)) * 100).toFixed(1)}%`],
        ["Export Date & Time", new Date().toLocaleString()],
        [],
        ["BIS IS 10500 POTABILITY CLASSIFICATION (INSIDE WELLS)"],
        ["Classification", "Station Count", "Percentage (%)"],
        ["Safe / Desirable", Number(complianceStats.safe) || 0, `${complianceStats.safePct}%`],
        ["Permissible Limit", Number(complianceStats.permissible) || 0, `${complianceStats.permPct}%`],
        ["Exceeded / Non-Potable", Number(complianceStats.exceeded) || 0, `${complianceStats.excPct}%`],
        [],
        ["PARAMETER-WISE SPATIAL EXCEEDANCE BREAKDOWN (BIS IS 10500)"],
        ["Parameter", "Unit", "Acceptable Limit", "Permissible Limit", "Sample Count", "Min", "Max", "Mean", "Above Acceptable", "% Above Acceptable", "Exceeded Permissible", "% Exceedance Rate"]
      ];

      parameterStats.forEach((p) => {
        const cleanAccept = typeof p.acceptable === "number" ? p.acceptable : (parseFloat(String(p.acceptable).replace(/,/g, "")) || p.acceptable);
        const cleanPerm = typeof p.permissible === "number" ? p.permissible : (parseFloat(String(p.permissible).replace(/,/g, "")) || p.permissible);
        const cleanMin = typeof p.min === "number" ? p.min : (parseFloat(String(p.min).replace(/,/g, "")) || p.min);
        const cleanMax = typeof p.max === "number" ? p.max : (parseFloat(String(p.max).replace(/,/g, "")) || p.max);
        const cleanMean = typeof p.mean === "number" ? p.mean : (parseFloat(String(p.mean).replace(/,/g, "")) || p.mean);

        summaryData.push([
          p.param,
          p.unit,
          cleanAccept,
          cleanPerm,
          Number(p.count) || 0,
          cleanMin,
          cleanMax,
          cleanMean,
          Number(p.aboveAcceptCount) || 0,
          typeof p.aboveAcceptPct === "number" ? p.aboveAcceptPct : (parseFloat(String(p.aboveAcceptPct).replace(/%/g, "")) || p.aboveAcceptPct),
          Number(p.excCount) || 0,
          typeof p.excPct === "number" ? p.excPct : (parseFloat(String(p.excPct).replace(/%/g, "")) || p.excPct)
        ]);
      });

      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      ensureSheetJSNumbers(summaryWs, 12);
      XLSX.utils.book_append_sheet(wb, summaryWs, "Spatial_Summary");

      // Sheet 2: Extracted Stations Data
      const stationsData = insideSamples.map((s, idx) => {
        const rowObj: any = {
          "Sl. No": idx + 1,
          "Well ID": s.wellId,
          "Location / Site": s.location,
          "Block / Tehsil": s.block,
          "District": s.district,
          "State": s.state,
          "Latitude": typeof s.lat === "number" ? s.lat : (parseFloat(String(s.lat)) || s.lat),
          "Longitude": typeof s.lng === "number" ? s.lng : (parseFloat(String(s.lng)) || s.lng),
        };

        if (s.raw && typeof s.raw === "object") {
          Object.keys(s.raw).forEach(key => {
            const val = s.raw[key];
            if (typeof val === "number") {
              rowObj[key] = val;
            } else if (typeof val === "string") {
              const trimmed = val.trim();
              if (isNumericString(trimmed)) {
                rowObj[key] = Number(trimmed.replace(/,/g, ""));
              } else {
                rowObj[key] = val;
              }
            } else {
              rowObj[key] = val;
            }
          });
        }
        return rowObj;
      });

      const stationsWs = XLSX.utils.json_to_sheet(stationsData);
      ensureSheetJSNumbers(stationsWs, 1);
      XLSX.utils.book_append_sheet(wb, stationsWs, "Extracted_Wells");

      const baseName = `${shapefileName || "Filtered"}_Wells_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, baseName);
      showToast(`Downloaded Excel report with ${insideSamples.length} wells!`, "success");
    } catch (err: any) {
      console.error("Excel download error:", err);
      showToast("Failed to generate Excel file.", "error");
    }
  };

  // Download filtered points as CSV (.csv)
  const handleDownloadCsv = () => {
    if (insideSamples.length === 0) {
      showToast("No sample points to export.", "warning");
      return;
    }
    try {
      const exportRows = insideSamples.map((s, idx) => ({
        "Sl_No": idx + 1,
        "Well_ID": s.wellId,
        "Location": s.location,
        "Block": s.block,
        "District": s.district,
        "State": s.state,
        "Latitude": s.lat,
        "Longitude": s.lng,
        ...s.raw
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      downloadBlob(blob, `${shapefileName || "Filtered"}_Wells.csv`);
      showToast("Downloaded CSV file successfully!", "success");
    } catch (err: any) {
      console.error("CSV download error:", err);
      showToast("Failed to generate CSV file.", "error");
    }
  };

  // Download filtered points as GeoJSON (.geojson)
  const handleDownloadGeoJson = () => {
    if (insideSamples.length === 0) {
      showToast("No sample points to export.", "warning");
      return;
    }
    try {
      const geojson = {
        type: "FeatureCollection",
        features: insideSamples.map((s) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [s.lng, s.lat]
          },
          properties: {
            wellId: s.wellId,
            location: s.location,
            block: s.block,
            district: s.district,
            state: s.state,
            ...s.raw
          }
        }))
      };

      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
      downloadBlob(blob, `${shapefileName || "Filtered"}_Wells.geojson`);
      showToast("Downloaded GeoJSON file successfully!", "success");
    } catch (err: any) {
      console.error("GeoJSON download error:", err);
      showToast("Failed to generate GeoJSON file.", "error");
    }
  };

  // Apply filtered samples to global application dataset
  const handleApplyToGlobalDataset = () => {
    if (!setGlobalRawData || insideSamples.length === 0) return;

    if (!originalDatasetBackup) {
      setOriginalDatasetBackup([...rawData]);
    }

    const filteredRawRows = insideSamples.map((s) => s.raw);
    setGlobalRawData(filteredRawRows);
    setIsFilteredAppliedGlobally(true);
    showToast(`Applied ${insideSamples.length} shapefile-filtered samples to entire application workspace!`, "success");
  };

  // Restore original dataset
  const handleRestoreOriginalDataset = () => {
    if (!setGlobalRawData || !originalDatasetBackup) return;
    setGlobalRawData(originalDatasetBackup);
    setIsFilteredAppliedGlobally(false);
    showToast("Restored original complete dataset across application workspace.", "info");
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1880px] mx-auto pb-16 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 p-6 sm:p-8 rounded-3xl text-white shadow-xl border border-indigo-900/50 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-blue-500/20 rounded-2xl border border-blue-400/30 text-blue-300">
                <MapPin className="w-6 h-6" />
              </span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                Shapefile Spatial Filter & Station Extractor
              </h1>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10.5px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                GIS Point-in-Polygon Engine
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              Upload any ESRI Shapefile (<span className="font-mono text-blue-300">.zip</span> with <span className="font-mono text-blue-300">.shp, .shx, .dbf</span>) or GeoJSON.
              Instantly filter and extract water quality stations that fall within the boundary polygon with spatial statistics, compliance analysis, and multi-format Shapefile/Excel downloads.
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/15 shrink-0">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-slate-300">Filtered Status</div>
              <div className="text-sm font-black text-emerald-400">
                {insideSamples.length} of {standardizedSamples.length} Wells
              </div>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm" />
          </div>
        </div>
      </div>

      {/* Main Top Control Panel (Upload, Sub-Feature, Layer Selection) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Card 1: Shapefile Upload & Selection */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900">1. Upload Boundary Shapefile</h3>
              </div>
              {isParsingShapefile && (
                <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1 animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Parsing...
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Select a zipped shapefile archive (.zip) containing .shp, .shx, and .dbf, or a GeoJSON file.
            </p>

            {/* Upload Dropzone */}
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50/70 p-4 rounded-2xl cursor-pointer transition-all duration-200 group">
              <Upload className="w-6 h-6 text-indigo-600 mb-1.5 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-black text-slate-800">
                {shapefileName ? `Loaded: ${shapefileName}` : "Click to Upload Shapefile (.zip / .geojson)"}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">Supports ESRI Shapefile ZIP, GeoJSON & JSON</span>
              <input
                type="file"
                accept=".zip,.geojson,.json"
                onChange={handleShapefileUpload}
                className="hidden"
                disabled={isParsingShapefile}
              />
            </label>
          </div>

          {/* Select from existing layers */}
          {sharedLayers.length > 0 && (
            <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                <span>Or select from active map layers:</span>
                <span className="font-mono text-[10px] text-indigo-600 font-bold">{sharedLayers.length} Layers</span>
              </label>
              <select
                value={selectedLayerId}
                onChange={(e) => handleSelectSharedLayer(e.target.value)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="custom">-- Select Active Map Layer --</option>
                {sharedLayers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Card 2: Feature & Sub-Polygon Selector */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-black text-slate-900">2. Boundary & Feature Filter</h3>
              </div>
              <span className="text-[10.5px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {subFeatures.length} Feature(s)
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Filter by all boundary features combined, or select an individual block / district sub-polygon.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600">Active Boundary Selection:</label>
              <select
                value={selectedFeatureIndex}
                onChange={(e) => setSelectedFeatureIndex(parseInt(e.target.value))}
                disabled={!activeGeoJson || subFeatures.length === 0}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value={-1}>All Features Combined (Full Shapefile Perimeter)</option>
                {subFeatures.map((f) => (
                  <option key={f.index} value={f.index}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Polygon styling & visibility options */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <div>
              <label className="text-[10px] font-bold text-slate-500 block mb-1">Boundary Color:</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={polygonColor}
                  onChange={(e) => setPolygonColor(e.target.value)}
                  className="w-7 h-7 rounded-lg cursor-pointer border border-slate-200"
                />
                <span className="text-xs font-mono font-bold text-slate-700">{polygonColor}</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 block mb-1">Outside Points:</label>
              <button
                type="button"
                onClick={() => setShowOutsidePoints((prev) => !prev)}
                className={`w-full py-1.5 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                  showOutsidePoints
                    ? "bg-slate-100 text-slate-700 border-slate-300"
                    : "bg-white text-slate-400 border-slate-200"
                }`}
              >
                {showOutsidePoints ? <Eye className="w-3.5 h-3.5 text-blue-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                {showOutsidePoints ? "Showing" : "Hidden"}
              </button>
            </div>
          </div>
        </div>

        {/* Card 3: Global Dataset Integration Actions */}
        <div className="bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/70 p-5 rounded-3xl border border-indigo-100 shadow-md flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-700" />
              <h3 className="text-sm font-black text-slate-900">3. Workspace Data Sync</h3>
            </div>
            <p className="text-xs text-slate-600">
              Apply extracted stations to the active application workspace to analyze them in Piper, USSL, Detailed Analysis, and Reports.
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleApplyToGlobalDataset}
              disabled={insideSamples.length === 0}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md disabled:opacity-40 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Apply Filtered Stations ({insideSamples.length}) to Whole App
            </button>

            {isFilteredAppliedGlobally && (
              <button
                onClick={handleRestoreOriginalDataset}
                className="w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm transition-all cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 text-slate-500" />
                Restore Full Original Dataset ({originalDatasetBackup?.length || standardizedSamples.length})
              </button>
            )}
          </div>

          <div className="text-[10.5px] text-slate-500 font-medium">
            Detected coordinate fields: <span className="font-mono text-indigo-700 font-bold">{latKey}</span>, <span className="font-mono text-indigo-700 font-bold">{lngKey}</span>
          </div>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">
            <span>Total Dataset Stations</span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">{standardizedSamples.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Available in loaded file</div>
        </div>

        <div className="bg-emerald-50/70 p-5 rounded-3xl border border-emerald-200/80 shadow-md">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-bold uppercase tracking-wider mb-1">
            <span>Inside Shapefile</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-900">{insideSamples.length}</div>
          <div className="text-[11px] text-emerald-700 font-bold mt-1">
            {((insideSamples.length / Math.max(1, standardizedSamples.length)) * 100).toFixed(1)}% of total stations
          </div>
        </div>

        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200/80 shadow-md">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">
            <span>Outside Shapefile</span>
            <XCircle className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-700">{outsideSamples.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            {((outsideSamples.length / Math.max(1, standardizedSamples.length)) * 100).toFixed(1)}% excluded
          </div>
        </div>

        <div className="bg-blue-50/70 p-5 rounded-3xl border border-blue-200/80 shadow-md">
          <div className="flex items-center justify-between text-blue-800 text-xs font-bold uppercase tracking-wider mb-1">
            <span>BIS Safe / Potable</span>
            <Sparkles className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-900">{complianceStats.safe}</div>
          <div className="text-[11px] text-blue-700 font-bold mt-1">
            {complianceStats.safePct}% desirable potability
          </div>
        </div>
      </div>

      {/* Main Section: Interactive Leaflet Map & Spatial Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col (8 cols): Interactive Map */}
        <div className="lg:col-span-8 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md flex flex-col space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-black text-slate-900">Interactive Spatial Filter Map</h3>
                <span className="text-[11px] text-slate-500">
                  {shapefileName ? `Boundary: ${shapefileName}` : "Upload a shapefile to display boundary polygon"}
                </span>
              </div>
            </div>

            {/* Map Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Basemap Selector */}
              <select
                value={basemap}
                onChange={(e) => setBasemap(e.target.value as any)}
                className="text-xs font-bold bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="osm">OpenStreetMap</option>
                <option value="topo">Topographic</option>
                <option value="satellite">Satellite / Hybrid</option>
              </select>

              {/* Parameter Preview Selector for popups */}
              <select
                value={selectedParamFilter}
                onChange={(e) => setSelectedParamFilter(e.target.value)}
                className="text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer"
              >
                {Object.keys(PARAM_CONFIG).map((p) => (
                  <option key={p} value={p}>
                    {p} ({PARAM_CONFIG[p].unit})
                  </option>
                ))}
              </select>

              {/* Zoom Button */}
              <button
                type="button"
                onClick={handleZoomToShapefile}
                className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm transition-all"
                title="Zoom to shapefile boundary"
              >
                <Compass className="w-3.5 h-3.5 text-blue-400" />
                Zoom to Extent
              </button>
            </div>
          </div>

          {/* Leaflet Map Canvas */}
          <div className="w-full h-[520px] rounded-2xl overflow-hidden border border-slate-200 relative">
            <div ref={mapContainerRef} className="w-full h-full z-10" />

            {/* Map Legend Overlay */}
            <div className="absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200/90 shadow-xl text-xs space-y-1.5 pointer-events-auto">
              <div className="font-extrabold text-[11px] text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1">
                Map Legend
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-xs inline-block" />
                <span className="font-bold text-slate-700">Inside Stations ({insideSamples.length})</span>
              </div>
              {showOutsidePoints && (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-slate-400 border-2 border-white shadow-xs inline-block" />
                  <span className="text-slate-500">Outside Stations ({outsideSamples.length})</span>
                </div>
              )}
              {activeGeometry && (
                <div className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-2.5 rounded-xs border-2 inline-block"
                    style={{ borderColor: polygonColor, backgroundColor: polygonColor, opacity: 0.5 }}
                  />
                  <span className="text-slate-700 font-semibold truncate max-w-[130px]">
                    {shapefileName || "Shapefile"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Col (4 cols): Download Suite & Compliance Breakdown */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          {/* Export & Download Hub Card */}
          <div className="bg-gradient-to-br from-white to-slate-50 p-5 rounded-3xl border border-slate-200/90 shadow-md space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Download className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-black text-slate-900">Download & Export Hub</h3>
            </div>
            <p className="text-xs text-slate-500">
              Download the filtered stations in GIS Shapefile, Excel, CSV, or GeoJSON formats.
            </p>

            <div className="space-y-2.5">
              {/* Primary Action: Download Filtered Points Shapefile */}
              <button
                type="button"
                onClick={handleDownloadPointsShapefile}
                disabled={isExporting || insideSamples.length === 0}
                className="w-full py-3 px-4 rounded-2xl text-xs font-black flex items-center justify-between bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-40"
              >
                <div className="flex items-center gap-2.5">
                  <FileDown className="w-4 h-4 text-blue-200" />
                  <span>Download Stations Shapefile (.zip)</span>
                </div>
                <span className="bg-white/20 px-2 py-0.5 rounded-lg text-[10.5px] font-mono">
                  {insideSamples.length} pts
                </span>
              </button>

              {/* Download Combined Package (Points + Boundary Shapefile) */}
              <button
                type="button"
                onClick={handleDownloadCombinedShapefile}
                disabled={isExporting || insideSamples.length === 0 || !activeGeoJson}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-between bg-slate-900 hover:bg-black text-white shadow-sm transition-all cursor-pointer disabled:opacity-40"
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Download Full GIS Package (.zip)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Pts + Poly</span>
              </button>

              {/* Download Boundary Shapefile */}
              <button
                type="button"
                onClick={handleDownloadBoundaryShapefile}
                disabled={isExporting || !activeGeoJson}
                className="w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-between bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-all cursor-pointer disabled:opacity-40"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>Download Boundary Shapefile (.zip)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Poly only</span>
              </button>

              {/* Download Excel */}
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={insideSamples.length === 0}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-between bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/80 shadow-2xs transition-all cursor-pointer disabled:opacity-40"
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  <span>Download Filtered Excel (.xlsx)</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-700 font-bold">2 Sheets</span>
              </button>

              {/* Download CSV & GeoJSON */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  disabled={insideSamples.length === 0}
                  className="py-2 px-3 rounded-xl text-xs font-bold text-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-all cursor-pointer disabled:opacity-40"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={handleDownloadGeoJson}
                  disabled={insideSamples.length === 0}
                  className="py-2 px-3 rounded-xl text-xs font-bold text-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-all cursor-pointer disabled:opacity-40"
                >
                  Download GeoJSON
                </button>
              </div>
            </div>
          </div>

          {/* BIS IS 10500 Potability Breakdown Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              BIS IS 10500 Compliance in Boundary
            </h4>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-emerald-700">Safe / Desirable Potable</span>
                  <span className="font-mono">{complianceStats.safe} ({complianceStats.safePct}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${complianceStats.safePct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-amber-700">Permissible Limit (No Alt Source)</span>
                  <span className="font-mono">{complianceStats.permissible} ({complianceStats.permPct}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${complianceStats.permPct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-rose-700">Exceeded / Non-Potable</span>
                  <span className="font-mono">{complianceStats.exceeded} ({complianceStats.excPct}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-rose-500 h-2 rounded-full" style={{ width: `${complianceStats.excPct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Parameter-wise Spatial Statistics Table */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <TableProperties className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                Chemical Parameters Spatial Statistics (Inside Boundary)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Computed across all {insideSamples.length} filtered sample stations per BIS IS 10500 standards
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 transition-colors">
              <input
                type="checkbox"
                checked={hideEmptyParams}
                onChange={(e) => setHideEmptyParams(e.target.checked)}
                className="cursor-pointer text-indigo-600 rounded"
              />
              <span>Only parameters in data ({displayedParamStats.length})</span>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider text-[10px]">
                <th className="p-3">Parameter</th>
                <th className="p-3">Unit</th>
                <th className="p-3">BIS Acceptable</th>
                <th className="p-3">BIS Permissible</th>
                <th className="p-3">Samples</th>
                <th className="p-3">Min</th>
                <th className="p-3">Max</th>
                <th className="p-3">Mean</th>
                <th className="p-3" title="Samples exceeding BIS Acceptable / Desirable Limit (> b1)">Above Acceptable</th>
                <th className="p-3" title="Samples exceeding BIS Permissible Limit (> b2 or outside 6.5-8.5 for pH)">Exceeded Permissible</th>
                <th className="p-3" title="True Non-Potable Exceedance Rate against Permissible Limit (% > Permissible)">% Exceedance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium font-mono">
              {displayedParamStats.map((p) => {
                const excValue = parseFloat(p.excPct);
                const isHighExceedance = !isNaN(excValue) && excValue > 0;
                return (
                  <tr key={p.param} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3 font-bold text-slate-900 font-sans">{p.param}</td>
                    <td className="p-3 text-slate-500">{p.unit}</td>
                    <td className="p-3">{p.acceptable}</td>
                    <td className="p-3">{p.permissible}</td>
                    <td className="p-3">{p.count}</td>
                    <td className="p-3">{p.min}</td>
                    <td className="p-3">{p.max}</td>
                    <td className="p-3 font-bold text-blue-600">{p.mean}</td>
                    <td className="p-3">
                      {p.aboveAcceptCount > 0 ? (
                        <span className="text-amber-700 font-bold">
                          {p.aboveAcceptCount} <span className="text-[10px] font-normal text-amber-600">({p.aboveAcceptPct})</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">0 (0.0%)</span>
                      )}
                    </td>
                    <td className="p-3 font-bold text-slate-800">
                      {p.excCount}
                    </td>
                    <td className="p-3">
                      {p.excPct === "N/A" ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                          No BIS Limit
                        </span>
                      ) : (
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isHighExceedance
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {p.excPct}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extracted Stations Interactive Data Table */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm sm:text-base font-black text-slate-900">
              Extracted Sample Stations Table ({displayedTableSamples.length})
            </h3>
          </div>

          {/* Table Filters & Search */}
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search well, location, district..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>

            {/* Compliance Filter */}
            <select
              value={complianceFilter}
              onChange={(e) => {
                setComplianceFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="safe">Safe Only (≤ Acceptable)</option>
              <option value="permissible">Permissible Only</option>
              <option value="exceeded">Exceeded Only (&gt; Permissible)</option>
            </select>

            {/* Rows Per Page */}
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(parseInt(e.target.value));
                setCurrentPage(1);
              }}
              className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="10">10 / page</option>
              <option value="20">20 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider text-[10px]">
                <th className="p-3">#</th>
                <th className="p-3 cursor-pointer select-none" onClick={() => setSortColumn("wellId")}>
                  <div className="flex items-center gap-1">
                    <span>Well ID</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="p-3">Location</th>
                <th className="p-3">Block</th>
                <th className="p-3">District</th>
                <th className="p-3">Latitude</th>
                <th className="p-3">Longitude</th>
                <th className="p-3">TDS (mg/L)</th>
                <th className="p-3">EC (μS/cm)</th>
                <th className="p-3">Fluoride (mg/L)</th>
                <th className="p-3">Nitrate (mg/L)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {paginatedSamples.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400 font-bold">
                    No stations found inside the selected shapefile or matching the filter.
                  </td>
                </tr>
              ) : (
                paginatedSamples.map((s, idx) => {
                  const globalIdx = (currentPage - 1) * rowsPerPage + idx + 1;
                  const tdsVal = s.raw[headerMap["TDS"] || "TDS"];
                  const ecVal = s.raw[headerMap["EC"] || "EC"];
                  const fVal = s.raw[headerMap["F"] || "F"];
                  const no3Val = s.raw[headerMap["NO3"] || "NO3"];

                  return (
                    <tr key={s.id + idx} className="hover:bg-indigo-50/40 transition-colors">
                      <td className="p-3 text-slate-400 font-mono text-[11px]">{globalIdx}</td>
                      <td className="p-3 font-bold text-slate-900 font-mono">{s.wellId}</td>
                      <td className="p-3">{s.location}</td>
                      <td className="p-3 text-slate-600">{s.block}</td>
                      <td className="p-3 text-slate-600">{s.district}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-500">{s.lat.toFixed(4)}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-500">{s.lng.toFixed(4)}</td>
                      <td className="p-3 font-mono font-semibold">{tdsVal !== undefined ? tdsVal : "-"}</td>
                      <td className="p-3 font-mono font-semibold">{ecVal !== undefined ? ecVal : "-"}</td>
                      <td className="p-3 font-mono font-semibold">{fVal !== undefined ? fVal : "-"}</td>
                      <td className="p-3 font-mono font-semibold">{no3Val !== undefined ? no3Val : "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {displayedTableSamples.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Showing {(currentPage - 1) * rowsPerPage + 1} to{" "}
              {Math.min(currentPage * rowsPerPage, displayedTableSamples.length)} of{" "}
              {displayedTableSamples.length} stations
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 font-mono font-bold text-slate-700 bg-slate-100 rounded-lg">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
