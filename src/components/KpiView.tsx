import React, { useState, useMemo, useRef } from "react";
import { safeHtml2canvas } from "../utils/colorSanitizer";
import { DataHeaders, ShapefileLayer } from "../types";
import { PARAM_CONFIG } from "../data/config";
import { toProperCase } from "../utils/shapefileFilter";
import {
  Activity,
  Award,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BarChart3,
  Globe,
  Layers,
  MapPin,
  TrendingUp,
  Download,
  Copy,
  Search,
  PieChart as PieChartIcon,
  ShieldAlert,
  Info,
  Droplets,
  Calendar,
  Shield,
  FileText,
  Compass,
  SlidersHorizontal,
  ChevronDown,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Upload,
  Percent,
  Mountain
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import KpiChoroplethMap, { BaseMapType } from "./KpiChoroplethMap";

interface KpiViewProps {
  rawData: any[];
  setRawData?: React.Dispatch<React.SetStateAction<any[]>>;
  headers: DataHeaders;
  headerMap: Record<string, string>;
  selectedState: string;
  selectedDistrict: string;
  selectedYear?: string;
  selectedSeason?: string;
  reportingLevel?: "State" | "District" | "Block";
  sharedLayers?: ShapefileLayer[];
  setSharedLayers?: React.Dispatch<React.SetStateAction<ShapefileLayer[]>>;
  choroplethClasses?: { limit: number; color: string; label: string }[];
  setChoroplethClasses?: React.Dispatch<React.SetStateAction<{ limit: number; color: string; label: string }[]>>;
  showToast?: (message: string, type?: "success" | "error") => void;
}

interface Donut3DProps {
  withinCount: number;
  exceedCount: number;
  withinPct: number;
  exceedPct: number;
  b2: number;
  unit: string;
}

const Compliance3DDonutChart: React.FC<Donut3DProps> = ({
  withinCount,
  exceedCount,
  withinPct,
  exceedPct
}) => {
  const [hoveredSlice, setHoveredSlice] = useState<"within" | "exceed" | null>(null);

  const width = 210;
  const height = 165;
  const cx = 105;
  const cy = 76;
  const rx = 76;
  const ry = 42;
  const innerRx = 44;
  const innerRy = 24;
  const h = 18;

  const total = (withinCount + exceedCount) || 1;
  const wRatio = Math.max(0.001, Math.min(0.999, withinCount / total));
  const eRatio = 1 - wRatio;

  const startA = -Math.PI / 2;
  const midA = startA + wRatio * 2 * Math.PI;
  const endA = startA + 2 * Math.PI;

  const getPt = (angle: number, radX: number, radY: number, offsetY = 0) => ({
    x: cx + radX * Math.cos(angle),
    y: cy + radY * Math.sin(angle) + offsetY
  });

  const topRingPath = (a1: number, a2: number, liftY = 0) => {
    if (Math.abs(a2 - a1) < 0.001) return "";
    const p1 = getPt(a1, rx, ry, liftY);
    const p2 = getPt(a2, rx, ry, liftY);
    const p3 = getPt(a2, innerRx, innerRy, liftY);
    const p4 = getPt(a1, innerRx, innerRy, liftY);
    const largeArc = Math.abs(a2 - a1) > Math.PI ? 1 : 0;

    return `M ${p1.x.toFixed(2)},${p1.y.toFixed(2)} ` +
      `A ${rx} ${ry} 0 ${largeArc} 1 ${p2.x.toFixed(2)},${p2.y.toFixed(2)} ` +
      `L ${p3.x.toFixed(2)},${p3.y.toFixed(2)} ` +
      `A ${innerRx} ${innerRy} 0 ${largeArc} 0 ${p4.x.toFixed(2)},${p4.y.toFixed(2)} ` +
      `Z`;
  };

  const outerWallPath = (a1: number, a2: number, liftY = 0) => {
    const s = Math.max(a1, 0);
    const e = Math.min(a2, Math.PI);
    if (s >= e) return "";

    const p1 = getPt(s, rx, ry, liftY);
    const p2 = getPt(e, rx, ry, liftY);
    const p2b = getPt(e, rx, ry, liftY + h);
    const p1b = getPt(s, rx, ry, liftY + h);
    const largeArc = Math.abs(e - s) > Math.PI ? 1 : 0;

    return `M ${p1.x.toFixed(2)},${p1.y.toFixed(2)} ` +
      `A ${rx} ${ry} 0 ${largeArc} 1 ${p2.x.toFixed(2)},${p2.y.toFixed(2)} ` +
      `L ${p2b.x.toFixed(2)},${p2b.y.toFixed(2)} ` +
      `A ${rx} ${ry} 0 ${largeArc} 0 ${p1b.x.toFixed(2)},${p1b.y.toFixed(2)} ` +
      `Z`;
  };

  const innerWallPath = (a1: number, a2: number, liftY = 0) => {
    const s = Math.max(a1, 0);
    const e = Math.min(a2, Math.PI);
    if (s >= e) return "";

    const p1 = getPt(s, innerRx, innerRy, liftY);
    const p2 = getPt(e, innerRx, innerRy, liftY);
    const p2b = getPt(e, innerRx, innerRy, liftY + h);
    const p1b = getPt(s, innerRx, innerRy, liftY + h);
    const largeArc = Math.abs(e - s) > Math.PI ? 1 : 0;

    return `M ${p1.x.toFixed(2)},${p1.y.toFixed(2)} ` +
      `A ${innerRx} ${innerRy} 0 ${largeArc} 1 ${p2.x.toFixed(2)},${p2.y.toFixed(2)} ` +
      `L ${p2b.x.toFixed(2)},${p2b.y.toFixed(2)} ` +
      `A ${innerRx} ${innerRy} 0 ${largeArc} 0 ${p1b.x.toFixed(2)},${p1b.y.toFixed(2)} ` +
      `Z`;
  };

  const radialCutPath = (angle: number, liftY = 0) => {
    const p1 = getPt(angle, innerRx, innerRy, liftY);
    const p2 = getPt(angle, rx, ry, liftY);
    const p2b = getPt(angle, rx, ry, liftY + h);
    const p1b = getPt(angle, innerRx, innerRy, liftY + h);
    return `M ${p1.x.toFixed(2)},${p1.y.toFixed(2)} L ${p2.x.toFixed(2)},${p2.y.toFixed(2)} L ${p2b.x.toFixed(2)},${p2b.y.toFixed(2)} L ${p1b.x.toFixed(2)},${p1b.y.toFixed(2)} Z`;
  };

  const isWithinHover = hoveredSlice === "within";
  const isExceedHover = hoveredSlice === "exceed";

  const wLift = isWithinHover ? -5 : 0;
  const eLift = isExceedHover ? -5 : 0;

  return (
    <div className="relative flex flex-col items-center justify-center shrink-0">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="drop-shadow-md select-none overflow-visible">
        <defs>
          <linearGradient id="withinTopGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="withinWallGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="100%" stopColor="#064e3b" />
          </linearGradient>

          <linearGradient id="exceedTopGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
          <linearGradient id="exceedWallGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </linearGradient>

          <radialGradient id="donutShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(15, 23, 42, 0.28)" />
            <stop offset="70%" stopColor="rgba(15, 23, 42, 0.08)" />
            <stop offset="100%" stopColor="rgba(15, 23, 42, 0)" />
          </radialGradient>
        </defs>

        {/* 1. Ground Drop Shadow */}
        <ellipse cx={cx} cy={cy + h + 12} rx={rx + 6} ry={ry + 4} fill="url(#donutShadow)" />

        {/* 2. 3D Side Walls & Inner Cylinder */}
        {eRatio > 0 && (
          <g className="transition-transform duration-200 cursor-pointer" onMouseEnter={() => setHoveredSlice("exceed")} onMouseLeave={() => setHoveredSlice(null)}>
            <path d={outerWallPath(midA, endA, eLift)} fill="url(#exceedWallGrad)" />
            <path d={innerWallPath(midA, endA, eLift)} fill="#991b1b" opacity="0.9" />
            <path d={radialCutPath(midA, eLift)} fill="#7f1d1d" />
            <path d={radialCutPath(endA, eLift)} fill="#7f1d1d" />
          </g>
        )}

        {wRatio > 0 && (
          <g className="transition-transform duration-200 cursor-pointer" onMouseEnter={() => setHoveredSlice("within")} onMouseLeave={() => setHoveredSlice(null)}>
            <path d={outerWallPath(startA, midA, wLift)} fill="url(#withinWallGrad)" />
            <path d={innerWallPath(startA, midA, wLift)} fill="#065f46" opacity="0.9" />
            <path d={radialCutPath(startA, wLift)} fill="#064e3b" />
            <path d={radialCutPath(midA, wLift)} fill="#064e3b" />
          </g>
        )}

        {/* 3. Top Surface Rings */}
        {eRatio > 0 && (
          <path
            d={topRingPath(midA, endA, eLift)}
            fill="url(#exceedTopGrad)"
            stroke="#ffffff"
            strokeWidth="0.8"
            className="cursor-pointer transition-all duration-200 hover:brightness-110"
            onMouseEnter={() => setHoveredSlice("exceed")}
            onMouseLeave={() => setHoveredSlice(null)}
          />
        )}

        {wRatio > 0 && (
          <path
            d={topRingPath(startA, midA, wLift)}
            fill="url(#withinTopGrad)"
            stroke="#ffffff"
            strokeWidth="0.8"
            className="cursor-pointer transition-all duration-200 hover:brightness-110"
            onMouseEnter={() => setHoveredSlice("within")}
            onMouseLeave={() => setHoveredSlice(null)}
          />
        )}

        {/* 4. Elevated 3D Central Hole Badge */}
        <g transform={`translate(${cx}, ${cy - 2})`}>
          <ellipse rx={innerRx - 3} ry={innerRy - 2} fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
          <ellipse rx={innerRx - 5} ry={innerRy - 4} fill="#f8fafc" />
          <text textAnchor="middle" y="-2" dominantBaseline="central" className="fill-slate-900 font-black text-xs tracking-tight pointer-events-none">
            {withinPct.toFixed(1)}%
          </text>
          <text textAnchor="middle" y="8" dominantBaseline="central" className="fill-emerald-700 font-extrabold text-[8px] uppercase tracking-wider pointer-events-none">
            WITHIN LIMIT
          </text>
        </g>
      </svg>
    </div>
  );
};

export default function KpiView({
  rawData,
  setRawData,
  headers,
  headerMap,
  selectedState,
  selectedDistrict,
  selectedYear,
  selectedSeason,
  reportingLevel = "State",
  sharedLayers = [],
  setSharedLayers,
  choroplethClasses,
  setChoroplethClasses,
  showToast
}: KpiViewProps) {
  // 1. Available Mapped Parameters List
  const availableParams = useMemo(() => {
    if (!headers.params || headers.params.length === 0) {
      return ["EC", "pH", "TDS", "F", "NO3", "As", "Fe", "TH", "Ca", "Mg", "Cl", "SO4"];
    }
    return headers.params;
  }, [headers.params]);

  // Active Parameter selection (Default to EC or first available param)
  const [selectedParamKey, setSelectedParamKey] = useState<string>(() => {
    if (availableParams.includes("EC")) return "EC";
    if (availableParams.length > 0) return availableParams[0];
    return "EC";
  });

  // Map Controls State
  const [showGisAnalysis, setShowGisAnalysis] = useState<boolean>(true);
  const [showStateLabels, setShowStateLabels] = useState<boolean>(true);
  const [showExceedancePct, setShowExceedancePct] = useState<boolean>(true);
  const [baseMapType, setBaseMapType] = useState<BaseMapType>("vector");
  const [isRangeModalOpen, setIsRangeModalOpen] = useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // JPEG Download Ref & Handler
  const kpiSectionRef = useRef<HTMLDivElement | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const handleDownloadJpeg = async () => {
    if (!kpiSectionRef.current) return;
    setIsDownloading(true);
    try {
      if (showToast) {
        showToast("Generating high-density JPEG image...", "success");
      }
      
      // safeHtml2canvas with scale: 3 for high pixel density (3x ultra-sharp resolution) and oklab/oklch color sanitization
      const canvas = await safeHtml2canvas(kpiSectionRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#f8fafc",
        logging: false,
        imageTimeout: 15000,
        scrollX: 0,
        scrollY: 0,
      });

      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      const paramSlug = (selectedParamKey || "KPI").replace(/[^a-zA-Z0-9]/g, "_");
      link.download = `KPI_Section_${paramSlug}_${dateStr}.jpg`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (showToast) {
        showToast("KPI Section downloaded as High-Density JPEG!", "success");
      }
    } catch (err) {
      console.error("Error generating KPI Section JPEG:", err);
      if (showToast) {
        showToast("Failed to generate High-Res JPEG. Please try again.", "error");
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const mappedCol = headerMap[selectedParamKey] || selectedParamKey;
  const paramConfig = PARAM_CONFIG[mappedCol] || PARAM_CONFIG[selectedParamKey] || {
    b1: 750,
    b2: 3000,
    unit: "µS/cm at 25°C",
    name: selectedParamKey === "EC" ? "Electrical Conductivity (EC)" : selectedParamKey
  };

  const b1 = paramConfig.b1 || 0;
  const b2 = paramConfig.b2 || 0;
  const unit = paramConfig.unit || "";
  const paramName = paramConfig.name || selectedParamKey;

  // Helper to check selection levels
  const isStateSelected = Boolean(selectedState && selectedState !== "ALL" && selectedState !== "All States" && !selectedState.toLowerCase().includes("all state"));
  const isDistrictSelected = Boolean(selectedDistrict && selectedDistrict !== "ALL" && selectedDistrict !== "All Districts" && !selectedDistrict.toLowerCase().includes("all district"));

  const top5LevelLabel = isDistrictSelected ? "Block" : isStateSelected ? "District" : "State";
  const top5PluralLabel = isDistrictSelected ? "Blocks" : isStateSelected ? "Districts" : "States";

  // Derive effective reporting level dynamically based on main location selection
  const effectiveReportingLevel: "State" | "District" | "Block" = useMemo(() => {
    if (isDistrictSelected) return "Block";
    if (isStateSelected) return "District";
    return reportingLevel || "State";
  }, [isDistrictSelected, isStateSelected, reportingLevel]);

  // Derive Season and Year from uploaded data or props
  const derivedSeason = useMemo(() => {
    if (selectedSeason && selectedSeason !== "ALL" && selectedSeason !== "All Seasons" && !selectedSeason.toLowerCase().includes("all season")) {
      return selectedSeason;
    }
    const seasonCol = headers.season || "Season";
    const seasons = new Set<string>();
    rawData.forEach((r) => {
      const val = r[seasonCol] || r["SEASON"] || r["season"];
      if (val && String(val).trim()) seasons.add(String(val).trim());
    });
    if (seasons.size === 1) return Array.from(seasons)[0];
    if (seasons.size > 1) return Array.from(seasons).slice(0, 2).join("/");
    return "Pre-Monsoon";
  }, [selectedSeason, rawData, headers.season]);

  const derivedYear = useMemo(() => {
    if (selectedYear && selectedYear !== "ALL" && selectedYear !== "All Years" && !selectedYear.toLowerCase().includes("all year")) {
      return selectedYear;
    }
    const yearCol = headers.year || "Year";
    const years = new Set<string>();
    rawData.forEach((r) => {
      const val = r[yearCol] || r["YEAR"] || r["year"];
      if (val && String(val).trim()) years.add(String(val).trim());
    });
    if (years.size === 1) return Array.from(years)[0];
    if (years.size > 1) {
      const sorted = Array.from(years).sort();
      return `${sorted[0]}-${sorted[sorted.length - 1]}`;
    }
    return "2023-2024";
  }, [selectedYear, rawData, headers.year]);

  const assessmentPeriodText = `${derivedSeason} ${derivedYear}`.trim();

  // Helper to get row parameter numerical value
  const getRowVal = (row: any, pKey: string): number | null => {
    const colKey = headerMap[pKey] || pKey;
    if (row[colKey] !== undefined && row[colKey] !== null) {
      const v = parseFloat(row[colKey]);
      return isNaN(v) ? null : v;
    }
    return null;
  };

  // 2. Statistical Metrics Calculations for Selected Parameter
  const paramMetrics = useMemo(() => {
    const totalSamples = rawData.length;
    let validValues: number[] = [];
    let exceedanceCount = 0;
    let withinCount = 0;

    const districtCol = headers.district || "District";
    const stateCol = headers.state || "State";
    const blockCol = headers.block || "Block";

    const uniqueStates = new Set<string>();
    const uniqueDistricts = new Set<string>();

    const totalStatesSet = new Set<string>();
    const affectedStatesSet = new Set<string>();
    const totalDistrictsSet = new Set<string>();
    const affectedDistrictsSet = new Set<string>();
    const totalBlocksSet = new Set<string>();
    const affectedBlocksSet = new Set<string>();

    const regionExceedanceMap: Record<string, { total: number; exceed: number }> = {};

    rawData.forEach((row) => {
      const st = String(row[stateCol] || "").trim();
      const dt = String(row[districtCol] || "").trim();
      const blk = String(row[blockCol] || row["BLOCK"] || row["Block"] || "").trim();
      if (st) uniqueStates.add(st);
      if (dt) uniqueDistricts.add(dt);

      // Determine grouping key based on selection hierarchy: All States -> State, Selected State -> District, Selected District -> Block
      let regKey = "";
      if (isDistrictSelected) {
        regKey = blk || dt || st || "Unknown Block";
      } else if (isStateSelected) {
        regKey = dt || st || "Unknown District";
      } else {
        regKey = st || "Unknown State";
      }

      if (!regionExceedanceMap[regKey]) {
        regionExceedanceMap[regKey] = { total: 0, exceed: 0 };
      }

      const val = getRowVal(row, selectedParamKey);
      if (val !== null) {
        validValues.push(val);
        regionExceedanceMap[regKey].total++;

        if (st) totalStatesSet.add(st);
        if (dt) totalDistrictsSet.add(dt);
        if (blk) totalBlocksSet.add(blk);

        let isExceed = false;
        if (selectedParamKey === "pH") {
          isExceed = val < 6.5 || val > 8.5;
        } else {
          isExceed = b2 > 0 && val > b2;
        }

        if (isExceed) {
          exceedanceCount++;
          regionExceedanceMap[regKey].exceed++;
          if (st) affectedStatesSet.add(st);
          if (dt) affectedDistrictsSet.add(dt);
          if (blk) affectedBlocksSet.add(blk);
        } else {
          withinCount++;
        }
      }
    });

    const evaluatedCount = validValues.length;
    const exceedancePct = evaluatedCount > 0 ? (exceedanceCount / evaluatedCount) * 100 : 0;
    const withinPct = evaluatedCount > 0 ? (withinCount / evaluatedCount) * 100 : 100;

    // Find Region with Highest Exceedance Rate
    let topRegionName = "N/A";
    let topRegionPct = 0;

    // Calculate region rankings
    const regionRankingList: { name: string; exceedPct: number; total: number; exceed: number }[] = [];

    Object.entries(regionExceedanceMap).forEach(([regName, data]) => {
      if (data.total >= 1) {
        const pct = (data.exceed / data.total) * 100;
        regionRankingList.push({ name: regName, exceedPct: pct, total: data.total, exceed: data.exceed });
      }
    });

    regionRankingList.sort((a, b) => {
      if (b.exceedPct !== a.exceedPct) return b.exceedPct - a.exceedPct;
      return b.exceed - a.exceed;
    });

    if (regionRankingList.length > 0) {
      topRegionName = regionRankingList[0].name;
      topRegionPct = regionRankingList[0].exceedPct;
    }

    // Top 5 Regions / Districts / Blocks for Bar Chart
    const top5Regions = regionRankingList.slice(0, 5);

    // Color palette for top 5 bars (Red, Orange, Yellow, Teal, Blue)
    const barColors = ["#ef4444", "#f97316", "#f59e0b", "#14b8a6", "#3b82f6"];

    const top5ChartData = top5Regions.map((reg, idx) => ({
      name: reg.name,
      exceedPct: parseFloat(reg.exceedPct.toFixed(1)),
      fill: barColors[idx % barColors.length]
    }));

    // Exceedance Severity Legend Categories across all regions
    let count0 = 0;
    let count0to5 = 0;
    let count5to10 = 0;
    let count10to20 = 0;
    let countAbove20 = 0;

    regionRankingList.forEach((r) => {
      if (r.exceedPct === 0) count0++;
      else if (r.exceedPct <= 5) count0to5++;
      else if (r.exceedPct <= 10) count5to10++;
      else if (r.exceedPct <= 20) count10to20++;
      else countAbove20++;
    });

    return {
      totalSamples: evaluatedCount || totalSamples,
      exceedanceCount,
      withinCount,
      exceedancePct,
      withinPct,
      stateCount: uniqueStates.size,
      districtCount: uniqueDistricts.size,
      topRegionName,
      topRegionPct,
      top5ChartData,
      regionRankingList,
      severityCounts: {
        count0,
        count0to5,
        count5to10,
        count10to20,
        countAbove20,
        totalRegions: regionRankingList.length || uniqueStates.size
      },
      affectedUnits: {
        affectedStates: affectedStatesSet.size,
        totalStates: totalStatesSet.size || uniqueStates.size,
        affectedDistricts: affectedDistrictsSet.size,
        totalDistricts: totalDistrictsSet.size || uniqueDistricts.size,
        affectedBlocks: affectedBlocksSet.size,
        totalBlocks: totalBlocksSet.size
      }
    };
  }, [rawData, selectedParamKey, b2, headers, isStateSelected, isDistrictSelected]);

  // Donut Chart Data (Within Limit vs Exceeding)
  const donutPieData = useMemo(() => {
    return [
      {
        name: `Within Limit (≤${b2})`,
        value: paramMetrics.withinCount,
        pct: paramMetrics.withinPct,
        color: "#10b981"
      },
      {
        name: `Exceeding (>${b2})`,
        value: paramMetrics.exceedanceCount,
        pct: paramMetrics.exceedancePct,
        color: "#f59e0b"
      }
    ];
  }, [paramMetrics, b2]);

  // Location display text
  const locationScopeText = selectedState
    ? selectedDistrict
      ? `${selectedDistrict}, ${selectedState}`
      : selectedState
    : "across India";

  return (
    <div ref={kpiSectionRef} className="space-y-4 animate-fade-in pb-8 font-sans p-1 rounded-2xl bg-slate-50/50">
      {/* PARAMETER SELECTOR TOP BAR WITH MAP CONTROLS */}
      <div data-export-hide="true" className="bg-white rounded-2xl p-3 border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
            Select Parameter KPI:
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-1 justify-end">
          {/* PARAMETER DROPDOWN */}
          <div className="relative flex items-center">
            <select
              value={selectedParamKey}
              onChange={(e) => setSelectedParamKey(e.target.value)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-900 font-extrabold text-xs pl-3 pr-8 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs appearance-none"
            >
              {availableParams.map((pKey) => {
                const pName = PARAM_CONFIG[headerMap[pKey] || pKey]?.name || pKey;
                return (
                  <option key={pKey} value={pKey}>
                    {pKey} — {pName}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-600 absolute right-2.5 pointer-events-none" />
          </div>

          {/* TOGGLE STATE LABELS (LABEL OFF/ON) */}
          <button
            onClick={() => setShowStateLabels(!showStateLabels)}
            className={`text-xs px-3 py-1.5 rounded-xl font-extrabold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer border ${
              showStateLabels
                ? "bg-amber-400 text-slate-950 border-amber-500 hover:bg-amber-300"
                : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
            }`}
            title="Toggle state and region labels on Choropleth map"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{showStateLabels ? "Labels: ON" : "Labels: OFF"}</span>
          </button>

          {/* RANGE COLORS CONFIG BUTTON */}
          <button
            onClick={() => setIsRangeModalOpen(true)}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs px-3 py-1.5 rounded-xl border border-amber-600 flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title="Configure color ranges and thresholds"
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Range Colors</span>
          </button>

          {/* BASE MAP SELECTION PILL SELECTOR */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-300/80 shadow-2xs">
            <button
              onClick={() => setBaseMapType("vector")}
              className={`text-xs px-2.5 py-1 rounded-lg font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                baseMapType === "vector"
                  ? "bg-white text-indigo-950 shadow-xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Clean Vector Canvas"
            >
              <Globe className="w-3.5 h-3.5 text-indigo-600" />
              <span>Vector</span>
            </button>

            <button
              onClick={() => setBaseMapType("esri-terrain")}
              className={`text-xs px-2.5 py-1 rounded-lg font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                baseMapType === "esri-terrain"
                  ? "bg-amber-500 text-slate-950 shadow-xs border border-amber-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Esri World Terrain Relief Map"
            >
              <Mountain className="w-3.5 h-3.5 text-amber-900" />
              <span>Esri Terrain</span>
            </button>

            <button
              onClick={() => setBaseMapType("google-earth")}
              className={`text-xs px-2.5 py-1 rounded-lg font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                baseMapType === "google-earth"
                  ? "bg-emerald-700 text-white shadow-xs border border-emerald-800"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Google Earth / Satellite Imagery"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-300" />
              <span>Google Satellite</span>
            </button>
          </div>

          {/* TOGGLE % SAMPLES ABOVE PL ON MAP */}
          <button
            onClick={() => setShowExceedancePct(!showExceedancePct)}
            className={`text-xs px-3 py-1.5 rounded-xl font-extrabold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer border ${
              showExceedancePct
                ? "bg-rose-600 text-white border-rose-700 hover:bg-rose-700"
                : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
            }`}
            title="Toggle percentage of samples on choropleth map"
          >
            <Percent className="w-3.5 h-3.5" />
            <span>{showExceedancePct ? "% Samples: ON" : "% Samples: OFF"}</span>
          </button>

          {/* SHAPEFILE ACTIVE / UPLOAD BUTTON */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`text-xs px-3 py-1.5 rounded-xl font-extrabold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer border ${
              sharedLayers && sharedLayers.length > 0
                ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
                : "bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700"
            }`}
            title="Upload zipped shapefile (.zip)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{sharedLayers && sharedLayers.length > 0 ? "Shapefile Active" : "Upload Shapefile"}</span>
          </button>

          {/* FULL CANVAS MAP / SPLIT VIEW TOGGLE */}
          <button
            onClick={() => setShowGisAnalysis(!showGisAnalysis)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs border ${
              !showGisAnalysis
                ? "bg-indigo-900 text-amber-300 border-indigo-950 hover:bg-indigo-950"
                : "bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100"
            }`}
            title={showGisAnalysis ? "Hide left analysis panel to make Choropleth map occupy the entire canvas width" : "Show left side analysis panel"}
          >
            {!showGisAnalysis ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            <span>{showGisAnalysis ? "Full Canvas Map" : "Split View"}</span>
          </button>

          {/* DOWNLOAD HIGH-DENSITY JPEG BUTTON */}
          <button
            onClick={handleDownloadJpeg}
            disabled={isDownloading}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 text-white font-extrabold text-xs px-3 py-1.5 rounded-xl border border-emerald-800 flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title="Download entire KPI Section as high-density JPEG image (3x resolution)"
          >
            {isDownloading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download JPEG (3x HD)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* TOP DEEP BLUE HEADER BANNER */}
      <div className="bg-[#1e295d] text-white py-4 px-6 rounded-2xl shadow-md text-center flex items-center justify-center min-h-[56px] border border-indigo-900">
        <h1 className="text-lg sm:text-2xl font-black tracking-tight text-white text-center leading-snug">
          Key Indicators of {toProperCase(paramName)} ({selectedParamKey}) in Groundwater in {toProperCase(locationScopeText)} ({toProperCase(assessmentPeriodText)})
        </h1>
      </div>

      {/* TOP ROW - 7 KPI METRIC CARDS (ENHANCED HEIGHT & VISIBILITY) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
        {/* Card 1: Samples Analysed */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex flex-col justify-between min-h-[165px] sm:min-h-[180px] relative overflow-hidden border-b-4 border-b-blue-600 hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-700 mb-1">
              <span className="text-xs font-black uppercase tracking-wider">Samples Analysed</span>
              <Info className="w-4 h-4 text-slate-400" />
            </div>
            <div className="my-3 flex items-center gap-2.5">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shrink-0 shadow-2xs">
                <Droplets className="w-5 h-5" />
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight block leading-none">
                  {paramMetrics.totalSamples.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs font-extrabold text-slate-500 leading-tight pt-2 border-t border-slate-100">
            Background stations monitoring {paramName}
          </p>
        </div>

        {/* Card 2: Samples Above Permissible Limit */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex flex-col justify-between min-h-[165px] sm:min-h-[180px] relative overflow-hidden border-b-4 border-b-amber-500 hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-700 mb-1">
              <span className="text-xs font-black uppercase tracking-wider">Samples Above PL</span>
              <Info className="w-4 h-4 text-slate-400" />
            </div>
            <div className="my-3 flex items-center gap-2.5">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100 shrink-0 shadow-2xs">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-black text-amber-900 tracking-tight block leading-none">
                  {paramMetrics.exceedanceCount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs font-extrabold text-amber-800/80 leading-tight pt-2 border-t border-slate-100">
            Exceeding limit (&gt; {b2} {unit})
          </p>
        </div>

        {/* Card 3: Percent Exceedance */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex flex-col justify-between min-h-[165px] sm:min-h-[180px] relative overflow-hidden border-b-4 border-b-rose-600 hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-700 mb-1">
              <span className="text-xs font-black uppercase tracking-wider">% Exceedance</span>
              <Info className="w-4 h-4 text-slate-400" />
            </div>
            <div className="my-3 flex items-center gap-2.5">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 shrink-0 shadow-2xs">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-black text-rose-700 tracking-tight block leading-none">
                  {paramMetrics.exceedancePct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs font-extrabold text-slate-500 leading-tight pt-2 border-t border-slate-100">
            Overall non-compliance rate
          </p>
        </div>

        {/* Card 4: Partially Affected Admin Units (States, Districts, Blocks) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm flex flex-col justify-between min-h-[165px] sm:min-h-[180px] relative overflow-hidden border-b-4 border-b-purple-600 hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-700 mb-1">
              <span className="text-xs font-black uppercase tracking-wider text-purple-950">
                Partially Affected
              </span>
              <Info className="w-4 h-4 text-slate-400" />
            </div>
            <div className="my-1.5 space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 bg-purple-50/80 px-2 py-0.5 rounded-md border border-purple-100">
                <span>States:</span>
                <span className="font-black text-purple-950">
                  {paramMetrics.affectedUnits.affectedStates} <span className="text-[10px] text-slate-500 font-semibold">/ {paramMetrics.affectedUnits.totalStates}</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 bg-purple-50/80 px-2 py-0.5 rounded-md border border-purple-100">
                <span>Districts:</span>
                <span className="font-black text-purple-950">
                  {paramMetrics.affectedUnits.affectedDistricts} <span className="text-[10px] text-slate-500 font-semibold">/ {paramMetrics.affectedUnits.totalDistricts}</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 bg-purple-50/80 px-2 py-0.5 rounded-md border border-purple-100">
                <span>Blocks:</span>
                <span className="font-black text-purple-950">
                  {paramMetrics.affectedUnits.totalBlocks > 0
                    ? `${paramMetrics.affectedUnits.affectedBlocks} / ${paramMetrics.affectedUnits.totalBlocks}`
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] font-extrabold text-purple-900/80 leading-tight pt-1.5 border-t border-slate-100">
            Units with ≥1 sample &gt; PL
          </p>
        </div>

        {/* Card 5: Highest Exceedance State / District / Block */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex flex-col justify-between min-h-[165px] sm:min-h-[180px] relative overflow-hidden border-b-4 border-b-red-600 hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-700 mb-1">
              <span className="text-xs font-black uppercase tracking-wider">
                Highest {top5LevelLabel}
              </span>
              <Info className="w-4 h-4 text-slate-400" />
            </div>
            <div className="my-2 flex items-center gap-2.5">
              <div className="p-2.5 bg-red-50 text-red-600 rounded-2xl border border-red-100 shrink-0 shadow-2xs">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="overflow-hidden">
                <span className="text-base font-black text-slate-900 tracking-tight block break-words leading-tight">
                  {paramMetrics.topRegionName}
                </span>
                <span className="text-xs font-black text-red-600">
                  {paramMetrics.topRegionPct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs font-extrabold text-slate-500 leading-tight pt-2 border-t border-slate-100">
            Highest non-compliant area
          </p>
        </div>

        {/* Card 6: BIS Permissible Limit */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex flex-col justify-between min-h-[165px] sm:min-h-[180px] relative overflow-hidden border-b-4 border-b-emerald-600 hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-700 mb-1">
              <span className="text-xs font-black uppercase tracking-wider">BIS Permissible Limit</span>
              <Info className="w-4 h-4 text-slate-400" />
            </div>
            <div className="my-3 flex items-center gap-2.5">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 shrink-0 shadow-2xs">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight block leading-none">
                  {b2}
                </span>
                <span className="text-xs font-bold text-slate-500 block mt-1">
                  {unit}
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs font-extrabold text-slate-500 leading-tight pt-2 border-t border-slate-100">
            IS 10500:2012 Drinking Standard
          </p>
        </div>

        {/* Card 7: Geographical Coverage */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex flex-col justify-between min-h-[165px] sm:min-h-[180px] relative overflow-hidden border-b-4 border-b-teal-600 hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-700 mb-1">
              <span className="text-xs font-black uppercase tracking-wider">Geo Coverage</span>
              <Info className="w-4 h-4 text-slate-400" />
            </div>
            <div className="my-2 flex items-center gap-2.5">
              <div className="p-2.5 bg-teal-50 text-teal-600 rounded-2xl border border-teal-100 shrink-0 shadow-2xs">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-black text-slate-900 tracking-tight block leading-tight">
                  {paramMetrics.stateCount} States/UTs
                </span>
                <span className="text-xs font-bold text-slate-600">
                  {paramMetrics.districtCount} Districts
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs font-extrabold text-slate-500 leading-tight pt-2 border-t border-slate-100">
            Observation network
          </p>
        </div>
      </div>

      {/* MIDDLE SECTION GRID: LEFT CARDS (42%) & RIGHT SPATIAL MAP (58%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 transition-all">
        {/* LEFT COLUMN: 3 CARDS (Hidable) */}
        <div className={`${showGisAnalysis ? "lg:col-span-5" : "hidden"} space-y-4 flex flex-col justify-between transition-all`}>
          {/* CARD A: BIS STANDARD CARD */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
            <div className="bg-[#1a2356] text-white font-extrabold text-xs py-2 px-4 rounded-xl text-center shadow-xs tracking-wide mb-3">
              BIS Standard: {toProperCase(paramName)} ({selectedParamKey})
            </div>

            <div className="flex items-center justify-between gap-4 py-1">
              {/* Droplet Icon */}
              <div className="w-12 h-12 rounded-full bg-cyan-950/10 text-cyan-800 flex items-center justify-center border border-cyan-300 shrink-0">
                <Droplets className="w-6 h-6" />
              </div>

              {/* Acceptable & Permissible Limit Pills */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between bg-emerald-50/90 border border-emerald-300 rounded-xl px-3 py-1.5">
                  <span className="text-xs font-black text-slate-800">Acceptable</span>
                  <span className="text-xs font-black text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-lg border border-emerald-400">
                    {b1} {unit}
                  </span>
                </div>

                <div className="flex items-center justify-between bg-amber-50/90 border border-amber-300 rounded-xl px-3 py-1.5">
                  <span className="text-xs font-black text-slate-800">Permissible*</span>
                  <span className="text-xs font-black text-amber-800 bg-amber-100/80 px-2.5 py-0.5 rounded-lg border border-amber-400">
                    {b2} {unit}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic font-medium text-center mt-2">
              *Absence of alternate source (IS 10500:2012)
            </p>
          </div>

          {/* CARD B: DONUT 3D CHART CARD */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
            <div className="bg-[#1a2356] text-white font-extrabold text-xs py-2 px-4 rounded-xl text-center shadow-xs tracking-wide mb-2">
              Compliance Status: {toProperCase(paramName)} ({selectedParamKey})
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
              {/* 3D Donut Chart Component */}
              <Compliance3DDonutChart
                withinCount={paramMetrics.withinCount}
                exceedCount={paramMetrics.exceedanceCount}
                withinPct={paramMetrics.withinPct}
                exceedPct={paramMetrics.exceedancePct}
                b2={b2}
                unit={unit}
              />

              {/* Donut Legend */}
              <div className="space-y-3 flex-1 text-xs w-full">
                <div className="flex items-center justify-between font-bold border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-md bg-emerald-500 shadow-xs border border-emerald-600 shrink-0" />
                    <span className="text-slate-700">Within Limit (≤{b2})</span>
                  </div>
                  <span className="text-slate-900 font-black">
                    {paramMetrics.withinCount.toLocaleString()}{" "}
                    <span className="text-emerald-700 text-[11px]">({paramMetrics.withinPct.toFixed(2)}%)</span>
                  </span>
                </div>

                <div className="flex items-center justify-between font-bold">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-md bg-amber-500 shadow-xs border border-amber-600 shrink-0" />
                    <span className="text-slate-700">Exceeding (&gt;{b2})</span>
                  </div>
                  <span className="text-slate-900 font-black">
                    {paramMetrics.exceedanceCount.toLocaleString()}{" "}
                    <span className="text-amber-600 text-[11px]">({paramMetrics.exceedancePct.toFixed(2)}%)</span>
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 font-semibold flex items-center justify-between">
                  <span>Evaluated Samples:</span>
                  <span className="font-black text-slate-900">{(paramMetrics.withinCount + paramMetrics.exceedanceCount).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD C: TOP 5 STATES / DISTRICTS / BLOCKS BY EXCEEDANCE BAR CHART */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex-1 flex flex-col justify-between">
            <div className="bg-[#1a2356] text-white font-extrabold text-xs py-2 px-4 rounded-xl text-center shadow-xs tracking-wide mb-3">
              Top 5 {toProperCase(top5PluralLabel)} {isStateSelected ? (isDistrictSelected ? `in ${toProperCase(selectedDistrict)}` : `in ${toProperCase(selectedState)}`) : ""} by {selectedParamKey} Exceedance
            </div>

            <div className="space-y-3 py-1">
              {paramMetrics.top5ChartData.length > 0 ? (
                paramMetrics.top5ChartData.map((item) => (
                  <div key={item.name} className="space-y-1.5 overflow-visible">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 leading-normal py-0.5 overflow-visible">
                      <span className="truncate max-w-[170px] inline-block leading-normal py-0.5">{item.name}</span>
                      <span className="font-black text-slate-900 leading-normal shrink-0">{item.exceedPct}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-3 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, (item.exceedPct / (paramMetrics.topRegionPct || 100)) * 100)}%`,
                          backgroundColor: item.fill
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-xs text-slate-400 py-4">
                  No {top5LevelLabel.toLowerCase()} exceedances recorded
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-400 font-bold text-center mt-3 uppercase tracking-wider">
              Top {top5PluralLabel} non-compliant against BIS limits
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN: DEDICATED KPI CHOROPLETH SPATIAL MAP */}
        <div className={`${showGisAnalysis ? "lg:col-span-7" : "lg:col-span-12"} bg-amber-50/20 border border-amber-200/80 rounded-2xl p-3.5 shadow-sm transition-all duration-300`}>
          <KpiChoroplethMap
            rawData={rawData}
            setRawData={setRawData}
            headers={headers}
            headerMap={headerMap}
            activeParam={selectedParamKey}
            activeConfig={paramConfig}
            reportingLevel={effectiveReportingLevel}
            selectedState={selectedState}
            selectedDistrict={selectedDistrict}
            sharedLayers={sharedLayers}
            setSharedLayers={setSharedLayers}
            showGisAnalysis={showGisAnalysis}
            setShowGisAnalysis={setShowGisAnalysis}
            showToast={showToast}
            showStateLabels={showStateLabels}
            setShowStateLabels={setShowStateLabels}
            showExceedancePct={showExceedancePct}
            setShowExceedancePct={setShowExceedancePct}
            baseMapType={baseMapType}
            setBaseMapType={setBaseMapType}
            isRangeModalOpen={isRangeModalOpen}
            setIsRangeModalOpen={setIsRangeModalOpen}
            externalFileInputRef={fileInputRef}
          />
        </div>
      </div>

      {/* BOTTOM DARK NAVY FOOTER BANNER */}
      <div className="bg-[#19224d] text-white rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shadow-md border border-indigo-900">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/30 text-indigo-300 rounded-xl border border-indigo-500/30 shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assessment Period</span>
            <span className="text-sm font-black text-white">{assessmentPeriodText}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/30 text-blue-300 rounded-xl border border-blue-500/30 shrink-0">
            <Droplets className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Parameter Assessed</span>
            <span className="text-sm font-black text-white truncate max-w-[200px] block">{paramName}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-600/30 text-emerald-300 rounded-xl border border-emerald-500/30 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Standard Reference</span>
            <span className="text-sm font-black text-white">BIS IS 10500:2012</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-600/30 text-teal-300 rounded-xl border border-teal-500/30 shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Coverage</span>
            <span className="text-sm font-black text-white">{paramMetrics.stateCount} States/UTs | {paramMetrics.districtCount} Districts</span>
          </div>
        </div>
      </div>
    </div>
  );
}
