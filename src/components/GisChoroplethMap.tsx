import React, { useState, useMemo, useEffect, useRef } from "react";
import { INDIA_BOUNDARY } from "../data/india_boundary";
import { Plus, Minus, RotateCcw, Info, Globe, Calendar, Send } from "lucide-react";

interface GisChoroplethMapProps {
  rawData: any[];
  headers: any;
  headerMap: Record<string, string>;
  activeParam: string;
  activeConfig: any;
  reportingLevel: "State" | "District" | "Block";
  selectedState?: string;
  selectedDistrict?: string;
  showToast?: (msg: string, type: "success" | "error") => void;
  sendToBulletin?: (title: string, svgOrImageBase64: string) => void;
}

interface GroupData {
  name: string;
  centroidLon: number;
  centroidLat: number;
  totalSamples: number;
  failCount: number;
  pctExceedance: number;
  avgValue: number;
}

export default function GisChoroplethMap({
  rawData,
  headers,
  headerMap,
  activeParam,
  activeConfig,
  reportingLevel,
  selectedState,
  selectedDistrict,
  showToast,
  sendToBulletin,
}: GisChoroplethMapProps) {
  // Local toast message state
  const [localToast, setLocalToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const triggerToast = (msg: string, type: "success" | "error") => {
    if (showToast) {
      showToast(msg, type);
    } else {
      setLocalToast({ message: msg, type });
      setTimeout(() => setLocalToast(null), 3000);
    }
  };

  // Local season toggle state: "pre" | "post" | "both"
  const [seasonFilter, setSeasonFilter] = useState<"pre" | "post" | "both">("both");

  // Map interactive state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Tooltip state
  const [hoveredGroup, setHoveredGroup] = useState<GroupData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Helper to parse coordinates safely
  const parseCoordinate = (val: any): number | null => {
    if (val === undefined || val === null) return null;
    const num = Number(val);
    if (!isNaN(num) && num !== 0) return num;
    return null;
  };

  // 1. Filter rawData based on season filter
  const seasonalFilteredData = useMemo(() => {
    return rawData.filter((row) => {
      const rowSeason = String(row[headers.season || "Season"] || "").toLowerCase();
      if (seasonFilter === "pre") {
        return rowSeason.includes("pre") || rowSeason.includes("before");
      }
      if (seasonFilter === "post") {
        return rowSeason.includes("post") || rowSeason.includes("after");
      }
      return true;
    });
  }, [rawData, seasonFilter, headers.season]);

  // 2. Group samples and calculate exceedance metrics
  const groupList = useMemo<GroupData[]>(() => {
    const groupKey =
      reportingLevel === "State"
        ? headers.state
        : reportingLevel === "District"
        ? headers.district
        : headers.block;

    if (!groupKey) return [];

    const groups: Record<string, { lats: number[]; lons: number[]; vals: number[] }> = {};

    seasonalFilteredData.forEach((row) => {
      const gName = String(row[groupKey] || "Unknown").trim();
      const lat = parseCoordinate(row[headers.latitude]);
      const lon = parseCoordinate(row[headers.longitude]);

      let val = NaN;
      if (activeParam === "SAR" || activeParam === "RSC") {
        const caCol = Object.keys(headerMap).find((k) => headerMap[k] === "Ca") || "Ca";
        const mgCol = Object.keys(headerMap).find((k) => headerMap[k] === "Mg") || "Mg";
        const naCol = Object.keys(headerMap).find((k) => headerMap[k] === "Na") || "Na";
        const hco3Col = Object.keys(headerMap).find((k) => headerMap[k] === "HCO3") || "HCO3";
        const co3Col = Object.keys(headerMap).find((k) => headerMap[k] === "CO3") || "CO3";

        const caVal = parseFloat(row[caCol]);
        const mgVal = parseFloat(row[mgCol]);
        const naVal = parseFloat(row[naCol]);
        const hco3Val = parseFloat(row[hco3Col]);
        const co3Val = parseFloat(row[co3Col]) || 0;

        const caMeq = !isNaN(caVal) ? caVal / 20.04 : 0;
        const mgMeq = !isNaN(mgVal) ? mgVal / 12.15 : 0;
        const naMeq = !isNaN(naVal) ? naVal / 22.99 : 0;
        const hco3Meq = !isNaN(hco3Val) ? hco3Val / 61.02 : 0;
        const co3Meq = co3Val / 30.00;

        if (!isNaN(caVal) && !isNaN(mgVal) && !isNaN(naVal)) {
          if (activeParam === "SAR") {
            const denom = Math.sqrt((caMeq + mgMeq) / 2);
            if (denom > 0) val = naMeq / denom;
          } else {
            val = hco3Meq + co3Meq - (caMeq + mgMeq);
          }
        }
      } else {
        val = parseFloat(row[activeParam]);
      }

      if (!isNaN(val)) {
        if (!groups[gName]) {
          groups[gName] = { lats: [], lons: [], vals: [] };
        }
        if (lat !== null && lon !== null) {
          groups[gName].lats.push(lat);
          groups[gName].lons.push(lon);
        }
        groups[gName].vals.push(val);
      }
    });

    const list: GroupData[] = [];
    Object.entries(groups).forEach(([name, data]) => {
      if (data.vals.length === 0) return;

      // Calculate centroid of coordinates
      let centroidLon = 78.96;
      let centroidLat = 20.59;
      if (data.lons.length > 0 && data.lats.length > 0) {
        centroidLon = data.lons.reduce((a, b) => a + b, 0) / data.lons.length;
        centroidLat = data.lats.reduce((a, b) => a + b, 0) / data.lats.length;
      }

      // Calculate exceedance rate
      let failCount = 0;
      let sum = 0;
      data.vals.forEach((v) => {
        sum += v;
        if (activeParam === "SAR") {
          if (v > 26) failCount++;
        } else if (activeParam === "pH") {
          if (v < activeConfig.b1 || v > activeConfig.b2) failCount++;
        } else if (activeConfig.b1 === activeConfig.b2) {
          if (v > activeConfig.b1) failCount++;
        } else {
          if (v > activeConfig.b2) failCount++;
        }
      });

      const pctExceedance = (failCount / data.vals.length) * 100;
      const avgValue = sum / data.vals.length;

      list.push({
        name,
        centroidLon,
        centroidLat,
        totalSamples: data.vals.length,
        failCount,
        pctExceedance,
        avgValue,
      });
    });

    return list;
  }, [seasonalFilteredData, headers, activeParam, activeConfig, headerMap, reportingLevel]);

  // 3. Determine map bounding box dynamically based on active centroids
  const mapBounds = useMemo(() => {
    // Default bounding box for India
    const defaultBounds = {
      minLon: 68.1,
      maxLon: 97.4,
      minLat: 8.0,
      maxLat: 36.0,
    };

    if (groupList.length === 0) return defaultBounds;

    // If state/district filter is applied, crop the bounds to fit our active points perfectly
    const validCoords = groupList.filter((g) => g.centroidLon !== 78.96 || g.centroidLat !== 20.59);
    if (validCoords.length === 0) return defaultBounds;

    const lons = validCoords.map((g) => g.centroidLon);
    const lats = validCoords.map((g) => g.centroidLat);

    let minLon = Math.min(...lons);
    let maxLon = Math.max(...lons);
    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);

    // If single point, expand bounds slightly
    if (minLon === maxLon) {
      minLon -= 1.0;
      maxLon += 1.0;
    }
    if (minLat === maxLat) {
      minLat -= 1.0;
      maxLat += 1.0;
    }

    // Add 15% padding to bounds so centroids are not right on the border
    const lonPadding = (maxLon - minLon) * 0.15;
    const latPadding = (maxLat - minLat) * 0.15;

    return {
      minLon: Math.max(65.0, minLon - lonPadding),
      maxLon: Math.min(99.0, maxLon + lonPadding),
      minLat: Math.max(5.0, minLat - latPadding),
      maxLat: Math.min(39.0, maxLat + latPadding),
    };
  }, [groupList]);

  // Five-color gradient for groundwater parameter exceedance percentage
  const getColorForExceedance = (pct: number): string => {
    if (pct <= 10) return "#22c55e"; // Green (Low)
    if (pct <= 25) return "#eab308"; // Yellow (Moderate)
    if (pct <= 50) return "#f97316"; // Orange (High)
    if (pct <= 75) return "#ef4444"; // Red (Very High)
    return "#a855f7"; // Purple (Severe)
  };

  // Projection coordinate helpers
  const project = (lon: number, lat: number, width: number, height: number) => {
    const { minLon, maxLon, minLat, maxLat } = mapBounds;

    // standard linear mapping inside bounds
    const pctX = (lon - minLon) / (maxLon - minLon);
    const pctY = (lat - minLat) / (maxLat - minLat);

    // Apply interactive zoom and pan
    const midX = width / 2;
    const midY = height / 2;

    const x = (pctX * width - midX) * zoom + midX + panX;
    // Invert Y coordinate since canvas runs 0 top to height bottom
    const y = ((1 - pctY) * height - midY) * zoom + midY + panY;

    return [x, y];
  };

  const unproject = (x: number, y: number, width: number, height: number) => {
    const { minLon, maxLon, minLat, maxLat } = mapBounds;

    const midX = width / 2;
    const midY = height / 2;

    const basePctX = (x - panX - midX) / zoom + midX;
    const basePctY = (y - panY - midY) / zoom + midY;

    const pctX = basePctX / width;
    const pctY = 1 - basePctY / height;

    const lon = pctX * (maxLon - minLon) + minLon;
    const lat = pctY * (maxLat - minLat) + minLat;

    return [lon, lat];
  };

  // 4. Draw Map using discrete Voronoi algorithm with smooth cell boundaries & India clipping
  const renderMap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid background
    ctx.strokeStyle = "rgba(0, 0, 0, 0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (groupList.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 14px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No spatial data available to plot.", width / 2, height / 2);
      return;
    }

    // Map screen coordinates for active centroids
    const screenCentroids = groupList.map((g) => {
      const [sx, sy] = project(g.centroidLon, g.centroidLat, width, height);
      return { sx, sy, g };
    });

    // We render a downscaled discrete Voronoi canvas to make nearest-neighbor search blindingly fast
    const offW = 150;
    const offH = 125;
    const offCanvas = document.createElement("canvas");
    offCanvas.width = offW;
    offCanvas.height = offH;
    const offCtx = offCanvas.getContext("2d");

    if (offCtx) {
      const imgData = offCtx.createImageData(offW, offH);
      const data = imgData.data;

      // Project centroids to offscreen space
      const offCentroids = groupList.map((g) => {
        const [osx, osy] = project(g.centroidLon, g.centroidLat, offW, offH);
        return { osx, osy, g };
      });

      for (let y = 0; y < offH; y++) {
        for (let x = 0; x < offW; x++) {
          let minDist = Infinity;
          let nearestIdx = -1;

          for (let i = 0; i < offCentroids.length; i++) {
            const dx = x - offCentroids[i].osx;
            const dy = y - offCentroids[i].osy;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) {
              minDist = dist;
              nearestIdx = i;
            }
          }

          if (nearestIdx !== -1) {
            const g = offCentroids[nearestIdx].g;
            const colorHex = getColorForExceedance(g.pctExceedance);

            const r = parseInt(colorHex.substring(1, 3), 16);
            const g_val = parseInt(colorHex.substring(3, 5), 16);
            const b = parseInt(colorHex.substring(5, 7), 16);

            const idx = (y * offW + x) * 4;
            data[idx] = r;
            data[idx + 1] = g_val;
            data[idx + 2] = b;
            data[idx + 3] = 230; // 90% opacity for elegant layer blending
          }
        }
      }

      offCtx.putImageData(imgData, 0, 0);

      // Now we draw the choropleth map on main canvas clipped to the India Boundary path!
      ctx.save();
      ctx.beginPath();
      
      const coords = INDIA_BOUNDARY.geometry.coordinates[0];
      coords.forEach((pt: any, idx: number) => {
        const [lon, lat] = pt;
        const [sx, sy] = project(lon, lat, width, height);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.clip();

      // Render the Voronoi cells stretched to full dimensions
      ctx.drawImage(offCanvas, 0, 0, width, height);

      ctx.restore();
    }

    // Draw India Border on top of cells for high-end professional GIS look
    ctx.beginPath();
    const coords = INDIA_BOUNDARY.geometry.coordinates[0];
    coords.forEach((pt: any, idx: number) => {
      const [lon, lat] = pt;
      const [sx, sy] = project(lon, lat, width, height);
      if (idx === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Centroids as glowing dots and text labels
    screenCentroids.forEach(({ sx, sy, g }) => {
      // Don't draw if centroid is outside the canvas bounding box
      if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) return;

      const color = getColorForExceedance(g.pctExceedance);

      // Radial outer glow
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fill();

      // Solid inner colored circle
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // Highlight on hover
      if (hoveredGroup && hoveredGroup.name === g.name) {
        ctx.beginPath();
        ctx.arc(sx, sy, 12, 0, 2 * Math.PI);
        ctx.strokeStyle = "#4f46e5";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Draw Group text labels beautifully
      ctx.font = "bold 9px Inter, sans-serif";
      ctx.fillStyle = "#1e293b";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.textAlign = "center";
      
      const shortName = g.name.length > 12 ? g.name.substring(0, 10) + ".." : g.name;
      ctx.strokeText(shortName, sx, sy - 11);
      ctx.fillText(shortName, sx, sy - 11);
    });
  };

  useEffect(() => {
    renderMap();
  }, [groupList, zoom, panX, panY, hoveredGroup, mapBounds]);

  // Drag to pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging) {
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    } else {
      // Find nearest centroid in screen coordinates to trigger interactive tooltips
      const width = canvas.width;
      const height = canvas.height;

      let nearest: GroupData | null = null;
      let minDist = 35; // Maximum distance to trigger tooltip (in pixels)

      groupList.forEach((g) => {
        const [sx, sy] = project(g.centroidLon, g.centroidLat, width, height);
        const dx = x - sx;
        const dy = y - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDist) {
          minDist = dist;
          nearest = g;
        }
      });

      setHoveredGroup(nearest);
      if (nearest) {
        setTooltipPos({ x: x + 15, y: y + 15 });
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom helpers
  const handleZoomIn = () => setZoom((z) => Math.min(10, z + 0.4));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, z - 0.4));
  const handleReset = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setHoveredGroup(null);
  };

  // Function to send Map Image to Bulletin Report
  const handleSendToBulletin = () => {
    const canvas = canvasRef.current;
    if (!canvas || !sendToBulletin) return;

    try {
      const dataUrl = canvas.toDataURL("image/png");
      sendToBulletin(`Spatial Exceedance Map (${seasonFilter === "both" ? "All Seasons" : seasonFilter === "pre" ? "Pre-Monsoon" : "Post-Monsoon"})`, dataUrl);
      triggerToast("GIS Exceedance Map sent to report successfully!", "success");
    } catch (err) {
      console.error(err);
      triggerToast("Failed to compile spatial map image.", "error");
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-md p-5 flex flex-col lg:flex-row gap-6 relative">
      {/* Local Toast Alert */}
      {localToast && (
        <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold text-white transition-all flex items-center gap-2 ${
          localToast.type === "success" ? "bg-emerald-500 shadow-emerald-100" : "bg-rose-500 shadow-rose-100"
        }`}>
          <span>{localToast.message}</span>
        </div>
      )}
      {/* Sidebar Controls Panel */}
      <div className="w-full lg:w-1/3 flex flex-col justify-between gap-5 border-r border-slate-100 lg:pr-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-5 h-5 text-indigo-600" />
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">
              GIS Choropleth Analysis
            </h4>
          </div>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed font-medium">
            Dynamic Voronoi choropleth map plotting compliance and permissible limit exceedance rates for{" "}
            <span className="text-indigo-600 font-bold">{activeParam}</span> across reporting centers.
          </p>

          {/* Season Selector */}
          <div className="mb-5 bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-2 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              Temporal Filter (Season)
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-1 rounded-xl">
              <button
                onClick={() => setSeasonFilter("pre")}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                  seasonFilter === "pre"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Pre-Monsoon
              </button>
              <button
                onClick={() => setSeasonFilter("post")}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                  seasonFilter === "post"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Post-Monsoon
              </button>
              <button
                onClick={() => setSeasonFilter("both")}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                  seasonFilter === "both"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Both
              </button>
            </div>
          </div>

          {/* Color Gradient Legend */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 space-y-2.5">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
              Exceedance Rate Legend
            </span>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-500 border border-white shadow-sm shrink-0" />
                <span className="text-xs text-slate-700 font-bold">≤ 10% (Low Exceedance)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-yellow-500 border border-white shadow-sm shrink-0" />
                <span className="text-xs text-slate-700 font-bold">&gt;10% – 25% (Moderate)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-orange-500 border border-white shadow-sm shrink-0" />
                <span className="text-xs text-slate-700 font-bold">&gt;25% – 50% (High)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-red-500 border border-white shadow-sm shrink-0" />
                <span className="text-xs text-slate-700 font-bold">&gt;50% – 75% (Very High)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-purple-500 border border-white shadow-sm shrink-0" />
                <span className="text-xs text-slate-700 font-bold">&gt;75% (Severe Exceedance)</span>
              </div>
            </div>
          </div>
        </div>

        {/* GIS Metadata / Controls */}
        <div className="space-y-3">
          <div className="text-[10px] text-slate-400 leading-relaxed bg-indigo-50/50 p-2.5 border border-indigo-100 rounded-xl flex gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
            <span>
              <strong>GIS Tip:</strong> Double-click or scroll on the map to zoom. Drag with your mouse cursor to pan around the boundaries freely.
            </span>
          </div>

          {sendToBulletin && (
            <button
              onClick={handleSendToBulletin}
              className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold text-xs hover:from-indigo-700 hover:to-indigo-800 transition-all flex items-center justify-center gap-2 shadow-sm shadow-indigo-200"
            >
              <Send className="w-3.5 h-3.5" />
              Export Map to Report
            </button>
          )}
        </div>
      </div>

      {/* Main Map Interactive Viewport */}
      <div className="w-full lg:w-2/3 relative border border-slate-100 rounded-2xl bg-slate-50/30 overflow-hidden min-h-[420px] select-none">
        {/* Absolute Floating Navigation Controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5 bg-white/95 backdrop-blur border border-slate-200/80 p-1.5 rounded-xl shadow-md shadow-slate-100/80">
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-600 hover:text-indigo-600 transition-all"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-600 hover:text-indigo-600 transition-all"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            title="Reset View"
            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-600 hover:text-indigo-600 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Canvas Map Layer */}
        <canvas
          ref={canvasRef}
          width={600}
          height={420}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`w-full h-full block bg-transparent transition-transform cursor-grab ${
            isDragging ? "cursor-grabbing" : ""
          }`}
        />

        {/* Hover Information Tooltip */}
        {hoveredGroup && (
          <div
            className="absolute z-20 pointer-events-none bg-white/95 backdrop-blur border border-indigo-100 p-3 rounded-xl shadow-xl max-w-xs transition-all duration-75 text-xs text-slate-700 font-medium"
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
          >
            <div className="border-b border-slate-100 pb-1.5 mb-2">
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-wider block">
                {reportingLevel} Center
              </span>
              <strong className="text-slate-800 text-sm font-extrabold">{hoveredGroup.name}</strong>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center gap-6">
                <span className="text-slate-500">Exceedance Percentage:</span>
                <span
                  className="font-extrabold px-1.5 py-0.5 rounded text-[11px]"
                  style={{
                    backgroundColor: getColorForExceedance(hoveredGroup.pctExceedance) + "15",
                    color: getColorForExceedance(hoveredGroup.pctExceedance),
                  }}
                >
                  {hoveredGroup.pctExceedance.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Total Samples:</span>
                <span className="font-bold text-slate-800">{hoveredGroup.totalSamples}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Exceeded Samples:</span>
                <span className="font-bold text-rose-600">{hoveredGroup.failCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Average Value:</span>
                <span className="font-extrabold text-slate-800">
                  {hoveredGroup.avgValue.toFixed(2)}{" "}
                  <span className="text-[10px] text-slate-400 font-medium font-mono">
                    {activeConfig.unit}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
