import React, { useState, useEffect, useMemo, useRef } from "react";
import Highcharts from "highcharts";
import Highcharts3D from "highcharts/highcharts-3d";
import ExcelJS from "exceljs";

// Initialize the 3D module
if (typeof Highcharts3D === "function") {
  (Highcharts3D as any)(Highcharts);
} else if (Highcharts3D && typeof (Highcharts3D as any).default === "function") {
  (Highcharts3D as any).default(Highcharts);
}
import { 
  GitMerge, 
  BarChart3, 
  Database, 
  Layers, 
  SlidersHorizontal, 
  Table2, 
  Download, 
  TrendingDown,
  Info,
  ArrowUpDown,
  Filter,
  Globe,
  MapPin,
  Settings2,
  Trash2,
  PlusCircle,
  Eye,
  Activity,
  ArrowRightLeft,
  Calendar,
  TrendingUp,
  RefreshCw
} from "lucide-react";
import { DataHeaders } from "../types";
import { PARAM_CONFIG } from "../data/config";
import { getPercentile } from "../utils/math";

const VIRTUAL_PARAM_CONFIGS: Record<string, { b1: number; b2: number; unit: string; name: string }> = {
  SAR: { b1: 10, b2: 18, unit: "Ratio", name: "Sodium Adsorption Ratio" },
  RSC: { b1: 1.25, b2: 2.5, unit: "meq/l", name: "Residual Sodium Carbonate" },
  TH: { b1: 200, b2: 600, unit: "mg/l", name: "Total Hardness (as CaCO3)" },
  SSP: { b1: 50, b2: 60, unit: "%", name: "Soluble Sodium Percentage" },
  PI: { b1: 25, b2: 75, unit: "%", name: "Permeability Index" },
  KR: { b1: 1.0, b2: 2.0, unit: "Ratio", name: "Kelly's Ratio" },
  MH: { b1: 50, b2: 50, unit: "%", name: "Magnesium Hazard" },
  USSL: { b1: 4, b2: 8, unit: "Class", name: "USSL Salinity-Sodium Class" },
  PIPER: { b1: 3, b2: 5, unit: "Facies", name: "Piper Hydrochemical Facies" }
};

interface AdvancedAnalysisViewProps {
  rawData: any[];
  headers: DataHeaders;
  headerMap: Record<string, string>;
  selectedState: string;
  selectedDistrict: string;
  showToast: (msg: string, type?: "success" | "error") => void;
  isVisible: boolean;
}

export default function AdvancedAnalysisView({
  rawData,
  headers,
  headerMap,
  selectedState,
  selectedDistrict,
  showToast,
  isVisible
}: AdvancedAnalysisViewProps) {
  // GUI Sub Tabs: "frequency" | "depth" | "aquifer" | "aquiferTapped" | "stageExtraction" | "source" | "comparison"
  const [activeSubTab, setActiveSubTab] = useState<"frequency" | "depth" | "aquifer" | "aquiferTapped" | "stageExtraction" | "source" | "comparison">("frequency");

  // Local column matching overrides (with fallback to uploaded headers)
  const [aquiferColumn, setAquiferColumn] = useState<string>("");
  const [aquiferTappedColumn, setAquiferTappedColumn] = useState<string>("");
  const [stageExtractionColumn, setStageExtractionColumn] = useState<string>("");
  const [sourceColumn, setSourceColumn] = useState<string>("");
  const [depthColumn, setDepthColumn] = useState<string>("");

  // Parameter selection
  const [selectedParam, setSelectedParam] = useState<string>("F"); // Default to Fluoride

  // --- SUB TAB 1: FREQUENCY DISTRIBUTION CONFIG ---
  const [freqGeographicLevel, setFreqGeographicLevel] = useState<"national" | "state" | "district" | "block">("national");
  const [freqBinMode, setFreqBinMode] = useState<"compliance" | "intervals" | "custom">("compliance");
  const [customNumBins, setCustomNumBins] = useState<number>(5);

  // --- CLASS RANGE GENERATOR ---
  const [rangeStepInput, setRangeStepInput] = useState<string>("0.5");
  const [rangeMaxInput, setRangeMaxInput] = useState<string>("3.0");

  // --- SUB TAB 2: DEPTH TO CONCENTRATION CONFIG ---
  const [depthColorMode, setDepthColorMode] = useState<"uniform" | "compliance" | "source">("compliance");

  // --- SUB TAB 3: PRINCIPAL AQUIFER DATA TABLE CONFIG ---
  // Customizable Ranges (Thresholds list)
  const [customThresholds, setCustomThresholds] = useState<number[]>([1.0, 1.5]); // e.g. <=1.0, 1.0-1.5, >1.5
  const [newThresholdInput, setNewThresholdInput] = useState<string>("");
  const [aquiferTableGroupLevel, setAquiferTableGroupLevel] = useState<"all" | "state" | "district" | "block">("all");
  const [aquiferSearchText, setAquiferSearchText] = useState("");
  const [sortField, setSortField] = useState<string>("aquiferName");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // --- SUB TAB 4: AQUIFER TAPPED DATA TABLE CONFIG ---
  const [aquiferTappedTableGroupLevel, setAquiferTappedTableGroupLevel] = useState<"all" | "state" | "district" | "block">("all");
  const [aquiferTappedSearchText, setAquiferTappedSearchText] = useState("");
  const [sortFieldTapped, setSortFieldTapped] = useState<string>("aquiferName");
  const [sortAscTapped, setSortAscTapped] = useState<boolean>(true);

  // --- SUB TAB 5: STAGE OF EXTRACTION DATA TABLE CONFIG ---
  const [stageExtractionTableGroupLevel, setStageExtractionTableGroupLevel] = useState<"all" | "state" | "district" | "block">("all");
  const [stageExtractionSearchText, setStageExtractionSearchText] = useState("");
  const [sortFieldStage, setSortFieldStage] = useState<string>("aquiferName");
  const [sortAscStage, setSortAscStage] = useState<boolean>(true);

  // --- SUB TAB 6: SOURCE DATA TABLE CONFIG ---
  const [sourceTableGroupLevel, setSourceTableGroupLevel] = useState<"all" | "state" | "district" | "block">("all");
  const [sourceSearchText, setSourceSearchText] = useState("");
  const [sortFieldSource, setSortFieldSource] = useState<string>("aquiferName");
  const [sortAscSource, setSortAscSource] = useState<boolean>(true);

  // --- SUB TAB 7: COMPARISON DATA TABLE CONFIG ---
  const [comparisonMode, setComparisonMode] = useState<"seasonal" | "multiyear">("seasonal");
  const [comparisonBasePeriod, setComparisonBasePeriod] = useState<string>("");
  const [comparisonCompPeriod, setComparisonCompPeriod] = useState<string>("");
  const [comparisonGroupLevel, setComparisonGroupLevel] = useState<"all" | "state" | "district" | "block" | "source" | "location">("all");
  const [comparisonSearchText, setComparisonSearchText] = useState<string>("");
  const [sortFieldComparison, setSortFieldComparison] = useState<string>("name");
  const [sortAscComparison, setSortAscComparison] = useState<boolean>(true);

  // Refs for chart target containers
  const freqChartRef = useRef<HTMLDivElement>(null);
  const depthChartRef = useRef<HTMLDivElement>(null);

  // Get list of all available keys in the uploaded data
  const availableHeaders = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    return Object.keys(rawData[0]);
  }, [rawData]);

  // Geographical Helpers to extract fields safely
  const getStateValue = (row: any): string => {
    const col = headers.state;
    if (col && row[col] !== undefined && row[col] !== null) return String(row[col]).trim();
    const fallbackKey = Object.keys(row).find(k => ["state", "st_name", "state_name", "state name"].includes(k.toLowerCase().trim()));
    return fallbackKey ? String(row[fallbackKey]).trim() : "";
  };

  const getDistrictValue = (row: any): string => {
    const col = headers.district;
    if (col && row[col] !== undefined && row[col] !== null) return String(row[col]).trim();
    const fallbackKey = Object.keys(row).find(k => ["district", "dist", "dst_name", "district_name", "district name"].includes(k.toLowerCase().trim()));
    return fallbackKey ? String(row[fallbackKey]).trim() : "";
  };

  const getBlockValue = (row: any): string => {
    const col = headers.block;
    if (col && row[col] !== undefined && row[col] !== null) return String(row[col]).trim();
    const fallbackKey = Object.keys(row).find(k => ["block", "tehsil", "taluk", "subdistrict", "sub-district", "block_name", "block name"].includes(k.toLowerCase().trim()));
    return fallbackKey ? String(row[fallbackKey]).trim() : "";
  };

  // Local geographical filter states
  const [localStateFilter, setLocalStateFilter] = useState<string>("");
  const [localDistrictFilter, setLocalDistrictFilter] = useState<string>("");
  const [localBlockFilter, setLocalBlockFilter] = useState<string>("");

  useEffect(() => {
    if (selectedState) {
      setLocalStateFilter(selectedState);
    } else {
      setLocalStateFilter("");
    }
    setLocalDistrictFilter("");
    setLocalBlockFilter("");
  }, [selectedState]);

  useEffect(() => {
    if (selectedDistrict) {
      setLocalDistrictFilter(selectedDistrict);
    } else {
      setLocalDistrictFilter("");
    }
    setLocalBlockFilter("");
  }, [selectedDistrict]);

  // Derive available States, Districts, and Blocks dynamically
  const localStates = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    const set = new Set<string>();
    rawData.forEach(row => {
      const s = getStateValue(row);
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  }, [rawData, headers]);

  const localDistricts = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    const set = new Set<string>();
    rawData.forEach(row => {
      const s = getStateValue(row);
      const d = getDistrictValue(row);
      if (d && (!localStateFilter || s === localStateFilter)) {
        set.add(d);
      }
    });
    return Array.from(set).sort();
  }, [rawData, localStateFilter, headers]);

  const localBlocks = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    const set = new Set<string>();
    rawData.forEach(row => {
      const s = getStateValue(row);
      const d = getDistrictValue(row);
      const b = getBlockValue(row);
      if (b && (!localStateFilter || s === localStateFilter) && (!localDistrictFilter || d === localDistrictFilter)) {
        set.add(b);
      }
    });
    return Array.from(set).sort();
  }, [rawData, localStateFilter, localDistrictFilter, headers]);

  // Filter rawData to build analyzedData
  const analyzedData = useMemo(() => {
    let data = rawData;
    if (localStateFilter) {
      data = data.filter(row => getStateValue(row) === localStateFilter);
    }
    if (localDistrictFilter) {
      data = data.filter(row => getDistrictValue(row) === localDistrictFilter);
    }
    if (localBlockFilter) {
      data = data.filter(row => getBlockValue(row) === localBlockFilter);
    }
    return data;
  }, [rawData, localStateFilter, localDistrictFilter, localBlockFilter, headers]);

  // Guess and synchronize columns initially
  useEffect(() => {
    if (rawData && rawData.length > 0) {
      const keys = Object.keys(rawData[0]);
      
      const guessedAquifer = headers.aquifer || keys.find(k => 
        ["aquifer", "aquifer type", "principal aquifer", "aquifer_type", "formation", "aquifer name", "principal_aquifer"].includes(k.toLowerCase().trim())
      ) || "";
      setAquiferColumn(guessedAquifer);

      const guessedAquiferTapped = keys.find(k => 
        ["aquifer tapped", "aquifer_tapped", "tapped aquifer", "tapped_aquifer", "aquifer tapped type", "aquifer tapped name"].includes(k.toLowerCase().trim())
      ) || "";
      setAquiferTappedColumn(guessedAquiferTapped);

      const guessedStageExtraction = keys.find(k => 
        ["stage of extraction", "stage_of_extraction", "extraction category", "stage", "category", "extraction", "stage of ground water extraction", "stage of groundwater extraction", "stage of gw extraction", "gw extraction stage", "stage of gw"].includes(k.toLowerCase().trim())
      ) || "";
      setStageExtractionColumn(guessedStageExtraction);

      const guessedSource = headers.source || keys.find(k => 
        ["source", "well type", "well_type", "source type", "source_type", "water source"].includes(k.toLowerCase().trim())
      ) || "";
      setSourceColumn(guessedSource);

      const guessedDepth = headers.depth || keys.find(k => 
        ["depth", "well depth", "depth bgl", "well_depth", "casing depth", "drill depth", "depth(m)", "depth (m)", "bgl", "depth_m"].includes(k.toLowerCase().trim())
      ) || "";
      setDepthColumn(guessedDepth);
    }
  }, [rawData, headers]);

  // Set default thresholds on parameter change to match its compliance thresholds
  const activeParamConfig = useMemo(() => {
    if (VIRTUAL_PARAM_CONFIGS[selectedParam]) {
      return VIRTUAL_PARAM_CONFIGS[selectedParam];
    }
    const defaultConf = { b1: 0, b2: 0, unit: "mg/l", name: selectedParam };
    return PARAM_CONFIG[selectedParam] || defaultConf;
  }, [selectedParam]);

  useEffect(() => {
    const b1 = activeParamConfig.b1;
    const b2 = activeParamConfig.b2;
    if (b1 > 0 && b2 > 0) {
      if (b1 === b2) {
        setCustomThresholds([b1]);
      } else {
        setCustomThresholds([b1, b2].sort((a, b) => a - b));
      }
    } else {
      setCustomThresholds([1.0, 1.5]);
    }

    // Set smart defaults for class range builder
    const getSmartStepAndMax = (param: string) => {
      switch (param) {
        case "pH": return { step: "1.0", max: "14.0" };
        case "TDS": return { step: "500", max: "3000" };
        case "TH": return { step: "100", max: "1000" };
        case "EC": return { step: "500", max: "5000" };
        case "Cl": return { step: "250", max: "1500" };
        case "NO3": return { step: "10", max: "100" };
        case "F": return { step: "0.5", max: "3.0" };
        case "Fe": return { step: "0.2", max: "2.0" };
        case "As": return { step: "5.0", max: "30.0" };
        case "U": return { step: "10.0", max: "60.0" };
        default: return { step: "1.0", max: "10.0" };
      }
    };
    const smartVal = getSmartStepAndMax(selectedParam);
    setRangeStepInput(smartVal.step);
    setRangeMaxInput(smartVal.max);
  }, [selectedParam, activeParamConfig]);

  // Extract list of all unique States available in the data
  const uniqueStatesList = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    const set = new Set<string>();
    rawData.forEach(row => {
      const s = getStateValue(row);
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  }, [rawData, headers]);

  // Extract uniquely available periods for comparisons
  const comparisonPeriods = useMemo(() => {
    if (!rawData || !rawData.length) return [];
    const periods = new Set<string>();
    rawData.forEach(row => {
      const y = headers.year ? String(row[headers.year] || "").trim() : "";
      const s = headers.season ? String(row[headers.season] || "").trim() : "";
      if (y && s) {
        periods.add(`${y} | ${s}`);
      } else if (y) {
        periods.add(y);
      } else if (s) {
        periods.add(s);
      }
    });
    return Array.from(periods).sort();
  }, [rawData, headers.year, headers.season]);

  // Extract uniquely available years for Multi-Year columns
  const comparisonYearsList = useMemo(() => {
    if (!rawData || !rawData.length) return [];
    const years = new Set<string>();
    rawData.forEach(row => {
      const y = headers.year ? String(row[headers.year] || "").trim() : "";
      if (y) years.add(y);
    });
    return Array.from(years).sort();
  }, [rawData, headers.year]);

  // Pre-guess default Pre/Post monsoon or years comparison periods
  useEffect(() => {
    if (comparisonPeriods.length >= 2) {
      const pre = comparisonPeriods.find(p => p.toLowerCase().includes("pre"));
      const post = comparisonPeriods.find(p => p.toLowerCase().includes("post"));
      if (pre && post) {
        setComparisonBasePeriod(pre);
        setComparisonCompPeriod(post);
      } else {
        setComparisonBasePeriod(comparisonPeriods[0]);
        setComparisonCompPeriod(comparisonPeriods[1]);
      }
    } else if (comparisonPeriods.length === 1) {
      setComparisonBasePeriod(comparisonPeriods[0]);
      setComparisonCompPeriod(comparisonPeriods[0]);
    }
  }, [comparisonPeriods]);

  // --- SUB TAB 7: ADVANCED PRE- vs POST-MONSOON AND MULTI-YEAR COMPARISON MATRIX ---
  const comparisonStatsData = useMemo(() => {
    if (!rawData || rawData.length === 0 || !selectedParam) {
      return { list: [], grandTotal: null };
    }

    const paramColName = headers.params.find(p => headerMap[p] === selectedParam) || selectedParam;
    const config = PARAM_CONFIG[selectedParam] || { b1: 0, b2: 1000, unit: "mg/l" };
    const b2Limit = config.b2 || config.b1;

    // Helper to check if value exceeds limits
    const checkExceeds = (v: number) => {
      if (selectedParam === "pH") {
        return v < config.b1 || v > config.b2;
      }
      return v > b2Limit;
    };

    // Filter rawData by global selections first
    let filtered = rawData;
    if (selectedState) {
      filtered = filtered.filter(row => getStateValue(row) === selectedState);
    }
    if (selectedDistrict) {
      filtered = filtered.filter(row => getDistrictValue(row) === selectedDistrict);
    }

    // Apply subtab search filter
    if (comparisonSearchText) {
      const q = comparisonSearchText.toLowerCase();
      filtered = filtered.filter(row => {
        const s = getStateValue(row).toLowerCase();
        const d = getDistrictValue(row).toLowerCase();
        const b = getBlockValue(row).toLowerCase();
        const loc = (headers.location ? String(row[headers.location] || "") : "").toLowerCase();
        const well = (headers.wellId ? String(row[headers.wellId] || "") : "").toLowerCase();
        const src = (sourceColumn ? String(row[sourceColumn] || "") : "").toLowerCase();
        return s.includes(q) || d.includes(q) || b.includes(q) || loc.includes(q) || well.includes(q) || src.includes(q);
      });
    }

    // Build geographic/source groups
    const groups: Record<string, any[]> = {};

    filtered.forEach(row => {
      let groupKey = "Consolidated";
      const state = getStateValue(row);
      const district = getDistrictValue(row);
      const block = getBlockValue(row);
      const source = sourceColumn ? String(row[sourceColumn] || "Unspecified").trim() : "Unspecified";
      const location = headers.location ? String(row[headers.location] || "Unknown").trim() : "Unknown";
      const wellId = headers.wellId ? String(row[headers.wellId] || "Unknown").trim() : "Unknown";

      if (comparisonGroupLevel === "state") {
        groupKey = state || "Unknown State";
      } else if (comparisonGroupLevel === "district") {
        groupKey = `${state} | ${district}`;
      } else if (comparisonGroupLevel === "block") {
        groupKey = `${state} | ${district} | ${block}`;
      } else if (comparisonGroupLevel === "source") {
        groupKey = source;
      } else if (comparisonGroupLevel === "location") {
        groupKey = `${state} | ${district} | ${block} | ${location} (${wellId})`;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(row);
    });

    const list: any[] = [];

    // Process each group
    Object.keys(groups).forEach(groupKey => {
      const rows = groups[groupKey];
      const firstRow = rows[0];
      const state = getStateValue(firstRow);
      const district = getDistrictValue(firstRow);
      const block = getBlockValue(firstRow);
      const source = sourceColumn ? String(firstRow[sourceColumn] || "Unspecified").trim() : "Unspecified";
      const location = headers.location ? String(firstRow[headers.location] || "Unknown").trim() : "Unknown";
      const wellId = headers.wellId ? String(firstRow[headers.wellId] || "Unknown").trim() : "Unknown";

      let displayName = groupKey;
      if (comparisonGroupLevel === "district") displayName = district;
      else if (comparisonGroupLevel === "block") displayName = block;
      else if (comparisonGroupLevel === "location") displayName = `${location} [${wellId}]`;

      // Seasonal mode calculations
      let baseCount = 0;
      let baseSum = 0;
      let baseExceedCount = 0;
      let compCount = 0;
      let compSum = 0;
      let compExceedCount = 0;

      // Multi-year mode calculations (columns for each year)
      const yearlyStats: Record<string, { count: number; sum: number; exceedCount: number; avg: number; exceedPct: number }> = {};
      comparisonYearsList.forEach(year => {
        yearlyStats[year] = { count: 0, sum: 0, exceedCount: 0, avg: 0, exceedPct: 0 };
      });

      rows.forEach(row => {
        const rawVal = parseFloat(row[paramColName]);
        if (isNaN(rawVal)) return;

        const y = headers.year ? String(row[headers.year] || "").trim() : "";
        const s = headers.season ? String(row[headers.season] || "").trim() : "";
        const period = (y && s) ? `${y} | ${s}` : (y || s);

        const isExceed = checkExceeds(rawVal);

        // Seasonal accumulation
        if (period === comparisonBasePeriod) {
          baseCount++;
          baseSum += rawVal;
          if (isExceed) baseExceedCount++;
        }
        if (period === comparisonCompPeriod) {
          compCount++;
          compSum += rawVal;
          if (isExceed) compExceedCount++;
        }

        // Yearly accumulation
        if (y && yearlyStats[y]) {
          yearlyStats[y].count++;
          yearlyStats[y].sum += rawVal;
          if (isExceed) yearlyStats[y].exceedCount++;
        }
      });

      const baseAvg = baseCount > 0 ? baseSum / baseCount : 0;
      const baseExceedPct = baseCount > 0 ? (baseExceedCount / baseCount) * 100 : 0;
      const compAvg = compCount > 0 ? compSum / compCount : 0;
      const compExceedPct = compCount > 0 ? (compExceedCount / compCount) * 100 : 0;

      const diffAvg = compAvg - baseAvg;
      const diffExceed = compExceedPct - baseExceedPct;
      const pctChangeAvg = baseAvg > 0 ? (diffAvg / baseAvg) * 100 : 0;

      // Classify trend
      let trendClass: "improved" | "deteriorated" | "stable" = "stable";
      if (selectedParam === "pH") {
        const baseDist = Math.abs(baseAvg - 7.0);
        const compDist = Math.abs(compAvg - 7.0);
        if (baseCount > 0 && compCount > 0) {
          if (compDist < baseDist - 0.1) trendClass = "improved";
          else if (compDist > baseDist + 0.1) trendClass = "deteriorated";
        }
      } else {
        if (baseCount > 0 && compCount > 0) {
          if (pctChangeAvg < -5) trendClass = "improved";
          else if (pctChangeAvg > 5) trendClass = "deteriorated";
        }
      }

      // Compute averages and exceedance % for each year
      comparisonYearsList.forEach(year => {
        const ys = yearlyStats[year];
        if (ys.count > 0) {
          ys.avg = ys.sum / ys.count;
          ys.exceedPct = (ys.exceedCount / ys.count) * 100;
        }
      });

      // Simple Year-Over-Year trend for multi-year mode
      let multiYearTrend: "improving" | "deteriorating" | "stable" | "insufficient" = "insufficient";
      const validYears = comparisonYearsList.filter(yr => yearlyStats[yr].count > 0);
      if (validYears.length >= 2) {
        const firstYear = validYears[0];
        const lastYear = validYears[validYears.length - 1];
        const firstAvg = yearlyStats[firstYear].avg;
        const lastAvg = yearlyStats[lastYear].avg;
        if (firstAvg > 0) {
          const trendPct = ((lastAvg - firstAvg) / firstAvg) * 100;
          if (selectedParam === "pH") {
            const firstDist = Math.abs(firstAvg - 7.0);
            const lastDist = Math.abs(lastAvg - 7.0);
            if (lastDist < firstDist - 0.15) multiYearTrend = "improving";
            else if (lastDist > firstDist + 0.15) multiYearTrend = "deteriorating";
            else multiYearTrend = "stable";
          } else {
            if (trendPct < -7) multiYearTrend = "improving";
            else if (trendPct > 7) multiYearTrend = "deteriorating";
            else multiYearTrend = "stable";
          }
        }
      }

      list.push({
        groupKey,
        name: displayName,
        state,
        district,
        block,
        source,
        location,
        wellId,
        baseCount,
        baseAvg,
        baseExceedPct,
        compCount,
        compAvg,
        compExceedPct,
        diffAvg,
        diffExceed,
        pctChangeAvg,
        trendClass,
        yearlyStats,
        multiYearTrend,
        validYearsCount: validYears.length
      });
    });

    // Compute Grand Total Row (Scientifically Combined)
    let totalBaseCount = 0;
    let totalBaseSum = 0;
    let totalBaseExceed = 0;
    let totalCompCount = 0;
    let totalCompSum = 0;
    let totalCompExceed = 0;

    const totalYearlyStats: Record<string, { count: number; sum: number; exceedCount: number; avg: number; exceedPct: number }> = {};
    comparisonYearsList.forEach(year => {
      totalYearlyStats[year] = { count: 0, sum: 0, exceedCount: 0, avg: 0, exceedPct: 0 };
    });

    filtered.forEach(row => {
      const rawVal = parseFloat(row[paramColName]);
      if (isNaN(rawVal)) return;

      const y = headers.year ? String(row[headers.year] || "").trim() : "";
      const s = headers.season ? String(row[headers.season] || "").trim() : "";
      const period = (y && s) ? `${y} | ${s}` : (y || s);

      const isExceed = checkExceeds(rawVal);

      if (period === comparisonBasePeriod) {
        totalBaseCount++;
        totalBaseSum += rawVal;
        if (isExceed) totalBaseExceed++;
      }
      if (period === comparisonCompPeriod) {
        totalCompCount++;
        totalCompSum += rawVal;
        if (isExceed) totalCompExceed++;
      }

      if (y && totalYearlyStats[y]) {
        totalYearlyStats[y].count++;
        totalYearlyStats[y].sum += rawVal;
        if (isExceed) totalYearlyStats[y].exceedCount++;
      }
    });

    const totalBaseAvg = totalBaseCount > 0 ? totalBaseSum / totalBaseCount : 0;
    const totalBaseExceedPct = totalBaseCount > 0 ? (totalBaseExceed / totalBaseCount) * 100 : 0;
    const totalCompAvg = totalCompCount > 0 ? totalCompSum / totalCompCount : 0;
    const totalCompExceedPct = totalCompCount > 0 ? (totalCompExceed / totalCompCount) * 100 : 0;

    comparisonYearsList.forEach(year => {
      const tys = totalYearlyStats[year];
      if (tys.count > 0) {
        tys.avg = tys.sum / tys.count;
        tys.exceedPct = (tys.exceedCount / tys.count) * 100;
      }
    });

    const grandTotal = {
      baseCount: totalBaseCount,
      baseAvg: totalBaseAvg,
      baseExceedPct: totalBaseExceedPct,
      compCount: totalCompCount,
      compAvg: totalCompAvg,
      compExceedPct: totalCompExceedPct,
      diffAvg: totalCompAvg - totalBaseAvg,
      diffExceed: totalCompExceedPct - totalBaseExceedPct,
      pctChangeAvg: totalBaseAvg > 0 ? ((totalCompAvg - totalBaseAvg) / totalBaseAvg) * 100 : 0,
      yearlyStats: totalYearlyStats
    };

    return { list, grandTotal };
  }, [rawData, selectedParam, headers, headerMap, sourceColumn, comparisonBasePeriod, comparisonCompPeriod, comparisonGroupLevel, comparisonSearchText, comparisonYearsList, selectedState, selectedDistrict]);

  const processedComparisonList = useMemo(() => {
    const list = [...comparisonStatsData.list];

    // Sort list
    list.sort((a, b) => {
      let aVal: any = a[sortFieldComparison];
      let bVal: any = b[sortFieldComparison];

      // Handle custom fields
      if (sortFieldComparison === "baseAvg") { aVal = a.baseAvg; bVal = b.baseAvg; }
      else if (sortFieldComparison === "compAvg") { aVal = a.compAvg; bVal = b.compAvg; }
      else if (sortFieldComparison === "diffAvg") { aVal = a.diffAvg; bVal = b.diffAvg; }
      else if (sortFieldComparison === "pctChangeAvg") { aVal = a.pctChangeAvg; bVal = b.pctChangeAvg; }
      else if (sortFieldComparison.startsWith("year_avg_")) {
        const yr = sortFieldComparison.replace("year_avg_", "");
        aVal = a.yearlyStats[yr]?.avg || 0;
        bVal = b.yearlyStats[yr]?.avg || 0;
      }
      else if (sortFieldComparison.startsWith("year_exceed_")) {
        const yr = sortFieldComparison.replace("year_exceed_", "");
        aVal = a.yearlyStats[yr]?.exceedPct || 0;
        bVal = b.yearlyStats[yr]?.exceedPct || 0;
      }

      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      if (typeof aVal === "string") {
        return sortAscComparison 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      } else {
        return sortAscComparison 
          ? aVal - bVal 
          : bVal - aVal;
      }
    });

    return list;
  }, [comparisonStatsData, sortFieldComparison, sortAscComparison]);

  const requestSortComparison = (field: string) => {
    if (sortFieldComparison === field) {
      setSortAscComparison(!sortAscComparison);
    } else {
      setSortFieldComparison(field);
      setSortAscComparison(true);
    }
  };

  const handleExportComparisonExcel = () => {
    if (processedComparisonList.length === 0) {
      showToast("No comparison data available to export", "error");
      return;
    }
    showToast("Generating custom comparison report...", "success");

    try {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet(
        comparisonMode === "seasonal" ? "Seasonal Comparison" : "Multi-Year Comparison"
      );

      const columns: any[] = [];
      
      // Determine columns based on selection
      if (comparisonGroupLevel === "state" || comparisonGroupLevel === "district" || comparisonGroupLevel === "block" || comparisonGroupLevel === "location") {
        columns.push({ header: "State / UT", key: "state", width: 20 });
      }
      if (comparisonGroupLevel === "district" || comparisonGroupLevel === "block" || comparisonGroupLevel === "location") {
        columns.push({ header: "District", key: "district", width: 20 });
      }
      if (comparisonGroupLevel === "block" || comparisonGroupLevel === "location") {
        columns.push({ header: "Block", key: "block", width: 20 });
      }
      if (comparisonGroupLevel === "location") {
        columns.push({ header: "Location Name", key: "location", width: 25 });
        columns.push({ header: "Well ID", key: "wellId", width: 15 });
      }
      if (comparisonGroupLevel === "source") {
        columns.push({ header: "Water Source", key: "source", width: 25 });
      }
      if (comparisonGroupLevel === "all") {
        columns.push({ header: "Reporting Region", key: "name", width: 30 });
      } else {
        columns.push({ header: "Group Name", key: "name", width: 25 });
      }

      if (comparisonMode === "seasonal") {
        columns.push(
          { header: `Base Period Count (${comparisonBasePeriod})`, key: "baseCount", width: 18 },
          { header: `Base Avg Conc (${activeParamConfig.unit})`, key: "baseAvg", width: 20 },
          { header: "Base Exceedance %", key: "baseExceedPct", width: 18 },
          { header: `Compare Period Count (${comparisonCompPeriod})`, key: "compCount", width: 18 },
          { header: `Compare Avg Conc (${activeParamConfig.unit})`, key: "compAvg", width: 20 },
          { header: "Compare Exceedance %", key: "compExceedPct", width: 18 },
          { header: `Absolute Difference (${activeParamConfig.unit})`, key: "diffAvg", width: 20 },
          { header: "Percentage Shift (%)", key: "pctChangeAvg", width: 18 },
          { header: "Trend Assessment", key: "trend", width: 20 }
        );
      } else {
        comparisonYearsList.forEach(year => {
          columns.push(
            { header: `${year} Samples Count`, key: `cnt_${year}`, width: 15 },
            { header: `${year} Avg (${activeParamConfig.unit})`, key: `avg_${year}`, width: 18 },
            { header: `${year} Exceed %`, key: `exceed_${year}`, width: 15 }
          );
        });
        columns.push({ header: "Long-term Trend Assessment", key: "multiYearTrend", width: 25 });
      }

      ws.columns = columns;

      // Header row styling
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: comparisonMode === "seasonal" ? "1E1B4B" : "311042" }
      };

      // Add Data Rows
      processedComparisonList.forEach(item => {
        const rData: any = {
          state: item.state,
          district: item.district,
          block: item.block,
          location: item.location,
          wellId: item.wellId,
          source: item.source,
          name: item.name,
        };

        if (comparisonMode === "seasonal") {
          rData.baseCount = item.baseCount;
          rData.baseAvg = item.baseCount > 0 ? parseFloat(item.baseAvg.toFixed(4)) : null;
          rData.baseExceedPct = item.baseCount > 0 ? parseFloat(item.baseExceedPct.toFixed(2)) : null;
          rData.compCount = item.compCount;
          rData.compAvg = item.compCount > 0 ? parseFloat(item.compAvg.toFixed(4)) : null;
          rData.compExceedPct = item.compCount > 0 ? parseFloat(item.compExceedPct.toFixed(2)) : null;
          rData.diffAvg = item.baseCount > 0 && item.compCount > 0 ? parseFloat(item.diffAvg.toFixed(4)) : null;
          rData.pctChangeAvg = item.baseCount > 0 && item.compCount > 0 ? parseFloat(item.pctChangeAvg.toFixed(2)) : null;
          rData.trend = item.trendClass === "improved" ? "Improved" : item.trendClass === "deteriorated" ? "Deteriorated" : "No Significant Change";
        } else {
          comparisonYearsList.forEach(year => {
            const ys = item.yearlyStats[year];
            rData[`cnt_${year}`] = ys?.count || 0;
            rData[`avg_${year}`] = ys?.count > 0 ? parseFloat((ys.avg).toFixed(4)) : null;
            rData[`exceed_${year}`] = ys?.count > 0 ? parseFloat((ys.exceedPct).toFixed(2)) : null;
          });
          rData.multiYearTrend = item.multiYearTrend === "improving" ? "Improving" : item.multiYearTrend === "deteriorating" ? "Deteriorating" : item.multiYearTrend === "stable" ? "Stable" : "Insufficient Data";
        }

        ws.addRow(rData);
      });

      // Add Grand Total Row
      if (comparisonStatsData.grandTotal) {
        const gt = comparisonStatsData.grandTotal;
        const gtData: any = {
          name: "GRAND TOTAL / CONSOLIDATED",
          state: "-",
          district: "-",
          block: "-",
          location: "-",
          wellId: "-",
          source: "-"
        };

        if (comparisonMode === "seasonal") {
          gtData.baseCount = gt.baseCount;
          gtData.baseAvg = gt.baseCount > 0 ? parseFloat(gt.baseAvg.toFixed(4)) : null;
          gtData.baseExceedPct = gt.baseCount > 0 ? parseFloat(gt.baseExceedPct.toFixed(2)) : null;
          gtData.compCount = gt.compCount;
          gtData.compAvg = gt.compCount > 0 ? parseFloat(gt.compAvg.toFixed(4)) : null;
          gtData.compExceedPct = gt.compCount > 0 ? parseFloat(gt.compExceedPct.toFixed(2)) : null;
          gtData.diffAvg = gt.baseCount > 0 && gt.compCount > 0 ? parseFloat(gt.diffAvg.toFixed(4)) : null;
          gtData.pctChangeAvg = gt.baseCount > 0 && gt.compCount > 0 ? parseFloat(gt.pctChangeAvg.toFixed(2)) : null;
          gtData.trend = gt.pctChangeAvg < -5 ? "Improved" : gt.pctChangeAvg > 5 ? "Deteriorated" : "Stable";
        } else {
          comparisonYearsList.forEach(year => {
            const tys = gt.yearlyStats[year];
            gtData[`cnt_${year}`] = tys?.count || 0;
            gtData[`avg_${year}`] = tys?.count > 0 ? parseFloat((tys.avg).toFixed(4)) : null;
            gtData[`exceed_${year}`] = tys?.count > 0 ? parseFloat((tys.exceedPct).toFixed(2)) : null;
          });
          gtData.multiYearTrend = "-";
        }

        const addedRow = ws.addRow(gtData);
        addedRow.font = { bold: true };
        
        for (let i = 1; i <= columns.length; i++) {
          addedRow.getCell(i).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "F1F5F9" }
          };
        }
      }

      workbook.xlsx.writeBuffer().then((buffer: any) => {
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const prefix = comparisonMode === "seasonal" ? "Seasonal_Comparison" : "Multi_Year_Comparison";
        link.download = `${prefix}_${selectedParam}_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
        showToast("Comparative analytics report downloaded!", "success");
      });

    } catch (err) {
      console.error(err);
      showToast("Excel compilation failed", "error");
    }
  };

  // Get active parameters listed in uploaded data
  const activeParameters = useMemo(() => {
    const list: { key: string; name: string; unit: string }[] = [];
    Object.keys(PARAM_CONFIG).forEach(key => {
      const isMapped = Object.keys(headerMap).some(k => headerMap[k] === key) || availableHeaders.includes(key);
      if (isMapped) {
        list.push({
          key,
          name: PARAM_CONFIG[key].name,
          unit: PARAM_CONFIG[key].unit
        });
      }
    });
    if (list.length === 0) {
      Object.keys(PARAM_CONFIG).slice(0, 8).forEach(key => {
        list.push({
          key,
          name: PARAM_CONFIG[key].name,
          unit: PARAM_CONFIG[key].unit
        });
      });
    }
    // Append virtual/calculated agricultural and class parameters
    const virtuals = [
      { key: "SAR", name: "Sodium Adsorption Ratio (SAR)", unit: "Ratio" },
      { key: "RSC", name: "Residual Sodium Carbonate (RSC)", unit: "meq/l" },
      { key: "TH", name: "Total Hardness (TH)", unit: "mg/l" },
      { key: "SSP", name: "Soluble Sodium Percentage (SSP)", unit: "%" },
      { key: "PI", name: "Permeability Index (PI)", unit: "%" },
      { key: "KR", name: "Kelly's Ratio (KR)", unit: "Ratio" },
      { key: "MH", name: "Magnesium Hazard (MH)", unit: "%" }
    ];
    virtuals.forEach(v => {
      if (!list.some(item => item.key === v.key)) {
        list.push(v);
      }
    });
    return list;
  }, [headerMap, availableHeaders]);

  // Helper to parse standard major ions from a row and return as milli-equivalents (meq)
  const getRowMeq = (row: any) => {
    const getVal = (param: string): number => {
      const excelHeader = Object.keys(headerMap).find(key => headerMap[key] === param);
      const rawVal = excelHeader ? row[excelHeader] : row[param];
      if (rawVal === undefined || rawVal === null || rawVal === "") return 0;
      const cleaned = String(rawVal).replace(/[^0-9.-]/g, "");
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    const ca = getVal("Ca");
    const mg = getVal("Mg");
    const na = getVal("Na");
    const k = getVal("K");
    const cl = getVal("Cl");
    const so4 = getVal("SO4");
    const hco3 = getVal("HCO3");
    const co3 = getVal("CO3");
    const ec = getVal("EC") || getVal("TDS") / 0.65 || 0;
    const tds = getVal("TDS") || ec * 0.65 || 0;

    return {
      Ca: ca / 20.04,
      Mg: mg / 12.15,
      Na: na / 22.99,
      K: k / 39.10,
      Cl: cl / 35.45,
      SO4: so4 / 48.03,
      HCO3: hco3 / 61.02,
      CO3: co3 / 30.00,
      EC: ec,
      TDS: tds
    };
  };

  // Helper to extract numeric parameter value (now supporting virtual/calculated parameters)
  const getParamNumericValue = (row: any, paramKey: string): number | null => {
    if (["SAR", "RSC", "TH", "SSP", "PI", "KR", "MH", "USSL", "PIPER"].includes(paramKey)) {
      const meq = getRowMeq(row);
      if (paramKey === "SAR") {
        const denom = Math.sqrt((meq.Ca + meq.Mg) / 2);
        return denom > 0 ? meq.Na / denom : 0;
      }
      if (paramKey === "RSC") {
        return (meq.HCO3 + meq.CO3) - (meq.Ca + meq.Mg);
      }
      if (paramKey === "TH") {
        return (meq.Ca + meq.Mg) * 50;
      }
      if (paramKey === "SSP") {
        const sum = meq.Ca + meq.Mg + meq.Na + meq.K;
        return sum > 0 ? ((meq.Na + meq.K) * 100) / sum : 0;
      }
      if (paramKey === "PI") {
        const denom = meq.Ca + meq.Mg + meq.Na;
        return denom > 0 ? ((meq.Na + Math.sqrt(meq.HCO3)) * 100) / denom : 0;
      }
      if (paramKey === "KR") {
        const denom = meq.Ca + meq.Mg;
        return denom > 0 ? meq.Na / denom : 0;
      }
      if (paramKey === "MH") {
        const denom = meq.Ca + meq.Mg;
        return denom > 0 ? (meq.Mg * 100) / denom : 0;
      }
      if (paramKey === "USSL") {
        const denom = Math.sqrt((meq.Ca + meq.Mg) / 2);
        const sar = denom > 0 ? meq.Na / denom : 0;
        const ec = meq.EC;
        if (!ec || ec <= 0) return 1;
        
        let salIdx = 1;
        if (ec < 250) salIdx = 1;
        else if (ec < 750) salIdx = 2;
        else if (ec < 2250) salIdx = 3;
        else salIdx = 4;

        let sodIdx = 1;
        const logEC = Math.log10(ec);
        const s1s2 = 18.8515824 - 4.4257912 * logEC;
        const s2s3 = 31.4031902 - 6.6827811 * logEC;
        const s3s4 = 43.675205 - 8.8394965 * logEC;
        if (sar < s1s2) sodIdx = 1;
        else if (sar < s2s3) sodIdx = 2;
        else if (sar < s3s4) sodIdx = 3;
        else sodIdx = 4;

        return (sodIdx - 1) * 4 + salIdx;
      }
      if (paramKey === "PIPER") {
        const meqSumCat = meq.Ca + meq.Mg + meq.Na + meq.K;
        const meqSumAn = meq.Cl + meq.SO4 + meq.HCO3 + meq.CO3;
        if (meqSumCat <= 0 || meqSumAn <= 0) return 2;

        const catSum = meqSumCat || 1;
        const anSum = meqSumAn || 1;
        const caP = (meq.Ca / catSum) * 100;
        const mgP = (meq.Mg / catSum) * 100;
        const clP = (meq.Cl / anSum) * 100;
        const so4P = (meq.SO4 / anSum) * 100;

        const c = caP + mgP;
        const a = clP + so4P;
        if (c >= 50 && a >= 50) {
          if (c + a >= 150) return 1;
          return 5;
        } else if (c >= 50 && a < 50) {
          return 2;
        } else if (c < 50 && a >= 50) {
          return 3;
        } else {
          if (c + a >= 50) return 6;
          return 4;
        }
      }
    }

    const excelHeader = Object.keys(headerMap).find(key => headerMap[key] === paramKey);
    const rawVal = excelHeader ? row[excelHeader] : row[paramKey];
    if (rawVal === undefined || rawVal === null || rawVal === "") return null;
    const cleaned = String(rawVal).replace(/[^0-9.-]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  // Helper to format parameter value, converting numeric USSL/Piper classes back to name
  const formatParamValue = (val: number | null, paramKey: string): string => {
    if (val === null || isNaN(val)) return "-";
    if (paramKey === "USSL") {
      const mapping: Record<number, string> = {
        1: "C1-S1", 2: "C2-S1", 3: "C3-S1", 4: "C4-S1",
        5: "C1-S2", 6: "C2-S2", 7: "C3-S2", 8: "C4-S2",
        9: "C1-S3", 10: "C2-S3", 11: "C3-S3", 12: "C4-S3",
        13: "C1-S4", 14: "C2-S4", 15: "C3-S4", 16: "C4-S4"
      };
      return mapping[Math.round(val)] || "Unknown";
    }
    if (paramKey === "PIPER") {
      const mapping: Record<number, string> = {
        1: "Ca-Cl Type",
        2: "Ca-Mg-HCO3 Type",
        3: "Na-Cl Type",
        4: "Na-HCO3 Type",
        5: "Mixed Type A",
        6: "Mixed Type B"
      };
      return mapping[Math.round(val)] || "Unknown";
    }
    return val.toFixed(3);
  };

  // Helper to check depth numeric value
  const getDepthNumericValue = (row: any, col: string): number | null => {
    if (!col) return null;
    const rawVal = row[col];
    if (rawVal === undefined || rawVal === null || rawVal === "") return null;
    const cleaned = String(rawVal).replace(/[^0-9.-]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  // Process compliance category for standard plotting
  const getComplianceCategory = (val: number, b1: number, b2: number) => {
    if (selectedParam === "pH") {
      if (val >= 6.5 && val <= 8.5) return "desirable";
      return "exceeding";
    }
    if (b1 === b2) {
      if (val <= b1) return "desirable";
      return "exceeding";
    }
    if (val <= b1) return "desirable";
    if (val <= b2) return "permissible";
    return "exceeding";
  };

  // Custom Threshold Ranges list builder
  const customRangesLabels = useMemo(() => {
    const sorted = [...customThresholds].sort((a, b) => a - b);
    const labels: { label: string; check: (v: number) => boolean }[] = [];
    
    if (sorted.length === 0) {
      labels.push({
        label: "All Values",
        check: (v) => true
      });
      return labels;
    }

    // First range: 0 - sorted[0]
    labels.push({
      label: `0 - ${sorted[0]}`,
      check: (v) => v <= sorted[0]
    });

    // Middle ranges: sorted[i] to sorted[i+1]
    for (let i = 0; i < sorted.length - 1; i++) {
      const lower = sorted[i];
      const upper = sorted[i + 1];
      labels.push({
        label: `> ${lower} - ${upper}`,
        check: (v) => v > lower && v <= upper
      });
    }

    // Last range: > last threshold
    labels.push({
      label: `> ${sorted[sorted.length - 1]}`,
      check: (v) => v > sorted[sorted.length - 1]
    });

    return labels;
  }, [customThresholds]);

  // Manage custom thresholds
  const handleAddThreshold = () => {
    const val = parseFloat(newThresholdInput);
    if (isNaN(val) || val <= 0) {
      showToast("Please enter a valid positive numeric threshold", "error");
      return;
    }
    if (customThresholds.includes(val)) {
      showToast("Threshold value already exists", "error");
      return;
    }
    setCustomThresholds([...customThresholds, val].sort((a, b) => a - b));
    setNewThresholdInput("");
    showToast(`Threshold ${val} added successfully`, "success");
  };

  const handleGenerateClassRanges = () => {
    const step = parseFloat(rangeStepInput);
    const maxVal = parseFloat(rangeMaxInput);
    if (isNaN(step) || step <= 0 || isNaN(maxVal) || maxVal <= 0) {
      showToast("Please enter valid positive numbers for step and max limit.", "error");
      return;
    }
    if (step > maxVal) {
      showToast("Step size cannot be larger than the maximum limit.", "error");
      return;
    }
    const newThresholds: number[] = [];
    for (let val = step; val <= maxVal; val += step) {
      newThresholds.push(parseFloat(val.toFixed(4)));
    }
    const uniqueSorted = Array.from(new Set(newThresholds)).sort((a, b) => a - b);
    setCustomThresholds(uniqueSorted);
    showToast(`Successfully generated ${uniqueSorted.length} class ranges up to ${maxVal}!`, "success");
  };

  const handleRemoveThreshold = (idx: number) => {
    const updated = customThresholds.filter((_, i) => i !== idx);
    setCustomThresholds(updated);
    showToast("Threshold removed", "success");
  };

  const handleResetToStandard = () => {
    const b1 = activeParamConfig.b1;
    const b2 = activeParamConfig.b2;
    if (b1 > 0 && b2 > 0) {
      if (b1 === b2) {
        setCustomThresholds([b1]);
      } else {
        setCustomThresholds([b1, b2].sort((a, b) => a - b));
      }
      showToast("Reset to BIS standard limits successfully", "success");
    } else {
      setCustomThresholds([1.0, 1.5]);
      showToast("No standard limits found. Applied default (1.0, 1.5)", "success");
    }
  };


  // ==========================================
  // DATA COMPUTATIONS
  // ==========================================

  // --- SUB TAB 1: FREQUENCY DISTRIBUTION DATA ---
  const frequencyDistributionData = useMemo(() => {
    if (!analyzedData || analyzedData.length === 0) return { categories: [], series: [], percentages: [], total: 0, isTruncated: false, totalGroupsCount: 0 };

    const samples = analyzedData.map(row => {
      const v = getParamNumericValue(row, selectedParam);
      return { value: v };
    }).filter((x): x is { value: number } => x.value !== null);

    if (samples.length === 0) return { categories: [], series: [], percentages: [], total: 0, isTruncated: false, totalGroupsCount: 0 };

    const b1 = activeParamConfig.b1;
    const b2 = activeParamConfig.b2;
    const unit = activeParamConfig.unit;
    const totalCount = samples.length;

    if (freqBinMode === "compliance") {
      let categories: string[] = [];
      if (selectedParam === "pH") {
        categories = ["Acidic (< 6.5)", "Acceptable (6.5 - 8.5)", "Alkaline (> 8.5)"];
      } else if (b1 === b2) {
        categories = [`Desirable (≤ ${b1} ${unit})`, `Exceeding (> ${b1} ${unit})`];
      } else {
        categories = [
          `Desirable (≤ ${b1} ${unit})`,
          `Permissible (${b1} - ${b2} ${unit})`,
          `Non-Potable (> ${b2} ${unit})`
        ];
      }

      const dataCounts = new Array(categories.length).fill(0);

      samples.forEach(({ value }) => {
        let binIdx = 0;
        if (selectedParam === "pH") {
          if (value < 6.5) binIdx = 0;
          else if (value <= 8.5) binIdx = 1;
          else binIdx = 2;
        } else if (b1 === b2) {
          if (value <= b1) binIdx = 0;
          else binIdx = 1;
        } else {
          if (value <= b1) binIdx = 0;
          else if (value <= b2) binIdx = 1;
          else binIdx = 2;
        }
        dataCounts[binIdx]++;
      });

      const percentages = dataCounts.map(cnt => (cnt / totalCount) * 100);
      const series = [{
        name: "Frequency Count",
        data: dataCounts
      }];

      return { categories, series, percentages, total: totalCount, isTruncated: false, totalGroupsCount: 1 };

    } else if (freqBinMode === "custom") {
      const categories = customRangesLabels.map(r => `${r.label} ${unit}`.trim());
      const dataCounts = new Array(categories.length).fill(0);

      samples.forEach(({ value }) => {
        const binIdx = customRangesLabels.findIndex(rng => rng.check(value));
        if (binIdx !== -1) {
          dataCounts[binIdx]++;
        }
      });

      const percentages = dataCounts.map(cnt => (cnt / totalCount) * 100);
      const series = [{
        name: "Frequency Count",
        data: dataCounts
      }];

      return { categories, series, percentages, total: totalCount, isTruncated: false, totalGroupsCount: 1 };

    } else {
      // Equal numerical intervals histogram
      const valuesOnly = samples.map(x => x.value);
      const minVal = Math.min(...valuesOnly);
      const maxVal = Math.max(...valuesOnly);
      
      const numBins = Math.max(2, Math.min(20, customNumBins));
      const range = maxVal - minVal;
      const binWidth = range === 0 ? 1 : range / numBins;

      const categories: string[] = [];
      const binsLimits: { min: number; max: number }[] = [];

      for (let i = 0; i < numBins; i++) {
        const minL = minVal + i * binWidth;
        const maxL = minVal + (i + 1) * binWidth;
        binsLimits.push({ min: minL, max: maxL });
        categories.push(`${minL.toFixed(2)} - ${maxL.toFixed(2)} ${unit}`);
      }

      const dataCounts = new Array(numBins).fill(0);

      samples.forEach(({ value }) => {
        let binIdx = binsLimits.findIndex(b => value >= b.min && value <= b.max);
        if (binIdx === -1) {
          if (value < minVal) binIdx = 0;
          if (value > maxVal) binIdx = numBins - 1;
        }
        if (binIdx !== -1) {
          dataCounts[binIdx]++;
        }
      });

      const percentages = dataCounts.map(cnt => (cnt / totalCount) * 100);
      const series = [{
        name: "Frequency Count",
        data: dataCounts
      }];

      return { categories, series, percentages, total: totalCount, isTruncated: false, totalGroupsCount: 1 };
    }
  }, [analyzedData, freqBinMode, selectedParam, activeParamConfig, customNumBins, customRangesLabels]);


  // --- SUB TAB 2: DEPTH SCATTER POINTS ---
  const depthScatterPoints = useMemo(() => {
    if (!analyzedData || analyzedData.length === 0 || !depthColumn) return [];

    const b1 = activeParamConfig.b1;
    const b2 = activeParamConfig.b2;

    const points = analyzedData.map(row => {
      const depth = getDepthNumericValue(row, depthColumn);
      const paramVal = getParamNumericValue(row, selectedParam);
      const siteName = String(row[headers.location || ""] || row["Location"] || row["Location Name"] || "Unknown Site");
      const wellID = String(row[headers.wellId || ""] || row["Well ID"] || row["WellID"] || "N/A");
      const state = getStateValue(row);
      const district = getDistrictValue(row);
      const aquifer = String(row[aquiferColumn] || "Unspecified").trim();
      const source = String(row[sourceColumn] || "Unspecified").trim();

      return {
        x: paramVal,
        y: depth,
        wellID,
        siteName,
        state,
        district,
        aquifer,
        source
      };
    }).filter((p): p is { x: number; y: number; wellID: string; siteName: string; state: string; district: string; aquifer: string; source: string } => 
      p.x !== null && p.y !== null && p.y > 0
    );

    if (depthColorMode === "uniform") {
      return [{
        name: "All Samples",
        color: "#0f766e", // Teal
        data: points
      }];
    } else if (depthColorMode === "source") {
      // Split series by source value
      const groupMap: Record<string, any[]> = {};
      points.forEach(p => {
        if (!groupMap[p.source]) groupMap[p.source] = [];
        groupMap[p.source].push(p);
      });
      return Object.entries(groupMap).map(([src, pts]) => ({
        name: src,
        data: pts
      }));
    } else {
      // compliance split
      const desirablePoints = points.filter(p => getComplianceCategory(p.x, b1, b2) === "desirable");
      const permissiblePoints = points.filter(p => getComplianceCategory(p.x, b1, b2) === "permissible");
      const exceedingPoints = points.filter(p => getComplianceCategory(p.x, b1, b2) === "exceeding");

      const series = [];
      if (desirablePoints.length > 0) {
        series.push({
          name: "Desirable Limit",
          color: "#10b981", // Emerald
          data: desirablePoints
        });
      }
      if (permissiblePoints.length > 0) {
        series.push({
          name: "Permissible Limit",
          color: "#f59e0b", // Amber
          data: permissiblePoints
        });
      }
      if (exceedingPoints.length > 0) {
        series.push({
          name: "Exceeding Limit",
          color: "#ef4444", // Red
          data: exceedingPoints
        });
      }
      return series;
    }
  }, [analyzedData, depthColumn, selectedParam, activeParamConfig, depthColorMode, aquiferColumn, sourceColumn, headers]);


  // --- SUB TAB 3: PRINCIPAL AQUIFER STATS AND DYNAMIC RANGES TABLE ---
  const aquiferStatsData = useMemo(() => {
    if (!analyzedData || analyzedData.length === 0) return [];

    const keyToUse = aquiferColumn || "Aquifer Type";

    // Build geographic key extractor
    const getGeoGroup = (row: any): string => {
      if (aquiferTableGroupLevel === "state") {
        return getStateValue(row) || "Unspecified State";
      } else if (aquiferTableGroupLevel === "district") {
        const s = getStateValue(row);
        const d = getDistrictValue(row);
        return [s, d].filter(Boolean).join(" / ") || "Unspecified District";
      } else if (aquiferTableGroupLevel === "block") {
        const s = getStateValue(row);
        const d = getDistrictValue(row);
        const b = getBlockValue(row);
        return [s, d, b].filter(Boolean).join(" / ") || "Unspecified Block";
      }
      return "Consolidated";
    };

    // Group rows by geo group + principal aquifer
    const groups: Record<string, { 
      geo: string; 
      state: string; 
      district: string; 
      block: string; 
      aquifer: string; 
      rows: any[] 
    }> = {};

    analyzedData.forEach(row => {
      const geo = getGeoGroup(row);
      const state = getStateValue(row) || "Unspecified State";
      const district = getDistrictValue(row) || "Unspecified District";
      const block = getBlockValue(row) || "Unspecified Block";
      const aquifer = String(row[keyToUse] || "").trim() || "Unspecified Aquifer";
      const combKey = `${geo}::${aquifer}`;
      
      if (!groups[combKey]) {
        groups[combKey] = { 
          geo, 
          state, 
          district, 
          block, 
          aquifer, 
          rows: [] 
        };
      }
      groups[combKey].rows.push(row);
    });

    const list = Object.entries(groups).map(([combKey, item], index) => {
      const { geo, state, district, block, aquifer, rows } = item;
      const values = rows
        .map(r => getParamNumericValue(r, selectedParam))
        .filter((v): v is number => v !== null);

      const count = values.length;
      if (count === 0) {
        return {
          geo,
          state,
          district,
          block,
          aquiferName: aquifer,
          count: 0,
          min: 0,
          max: 0,
          avg: 0,
          p75: 0,
          p90: 0,
          p95: 0,
          rangesCount: customRangesLabels.map(() => 0),
          rangesPct: customRangesLabels.map(() => 0),
          values: [] as number[]
        };
      }

      const min = Math.min(...values);
      const max = Math.max(...values);
      const sum = values.reduce((acc, curr) => acc + curr, 0);
      const avg = sum / count;
      const p75 = getPercentile(values, 75);
      const p90 = getPercentile(values, 90);
      const p95 = getPercentile(values, 95);

      // Dynamic customizable range distribution counts
      const rangesCount = customRangesLabels.map(range => {
        let matched = 0;
        values.forEach(v => {
          if (range.check(v)) matched++;
        });
        return matched;
      });

      const rangesPct = rangesCount.map(cnt => (cnt / count) * 100);

      return {
        geo,
        state,
        district,
        block,
        aquiferName: aquifer,
        count,
        min,
        max,
        avg,
        p75,
        p90,
        p95,
        rangesCount,
        rangesPct,
        values
      };
    });

    return list;
  }, [analyzedData, aquiferColumn, selectedParam, aquiferTableGroupLevel, customRangesLabels, headers]);


  // Sort and Filter of Aquifer Table data
  const processedAquiferList = useMemo(() => {
    let list = [...aquiferStatsData];

    // 1. Search filter
    if (aquiferSearchText) {
      const q = aquiferSearchText.toLowerCase();
      list = list.filter(item => 
        item.aquiferName.toLowerCase().includes(q) || 
        item.geo.toLowerCase().includes(q) ||
        item.state.toLowerCase().includes(q) ||
        item.district.toLowerCase().includes(q) ||
        item.block.toLowerCase().includes(q)
      );
    }

    // 2. Sorting
    list.sort((a: any, b: any) => {
      let valA = a[sortField];
      let valB = b[sortField];

      // Handle custom range sorting if sorting by ranges index
      if (sortField.startsWith("range_")) {
        const rangeIdx = parseInt(sortField.replace("range_", ""));
        valA = a.rangesPct[rangeIdx] || 0;
        valB = b.rangesPct[rangeIdx] || 0;
      }

      if (typeof valA === "string") {
        return sortAsc 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        return sortAsc 
          ? (valA - valB) 
          : (valB - valA);
      }
    });

    return list;
  }, [aquiferStatsData, aquiferSearchText, sortField, sortAsc]);


  // --- SUB TAB 4: AQUIFER TAPPED STATS AND DYNAMIC RANGES TABLE ---
  const aquiferTappedStatsData = useMemo(() => {
    if (!analyzedData || analyzedData.length === 0) return [];

    const keyToUse = aquiferTappedColumn || "Aquifer Tapped";

    // Build geographic key extractor
    const getGeoGroup = (row: any): string => {
      if (aquiferTappedTableGroupLevel === "state") {
        return getStateValue(row) || "Unspecified State";
      } else if (aquiferTappedTableGroupLevel === "district") {
        const s = getStateValue(row);
        const d = getDistrictValue(row);
        return [s, d].filter(Boolean).join(" / ") || "Unspecified District";
      } else if (aquiferTappedTableGroupLevel === "block") {
        const s = getStateValue(row);
        const d = getDistrictValue(row);
        const b = getBlockValue(row);
        return [s, d, b].filter(Boolean).join(" / ") || "Unspecified Block";
      }
      return "Consolidated";
    };

    // Group rows by geo group + aquifer tapped
    const groups: Record<string, { 
      geo: string; 
      state: string; 
      district: string; 
      block: string; 
      aquifer: string; 
      rows: any[] 
    }> = {};

    analyzedData.forEach(row => {
      const geo = getGeoGroup(row);
      const state = getStateValue(row) || "Unspecified State";
      const district = getDistrictValue(row) || "Unspecified District";
      const block = getBlockValue(row) || "Unspecified Block";
      const aquifer = String(row[keyToUse] || "").trim() || "Unspecified Aquifer";
      const combKey = `${geo}::${aquifer}`;
      
      if (!groups[combKey]) {
        groups[combKey] = { 
          geo, 
          state, 
          district, 
          block, 
          aquifer, 
          rows: [] 
        };
      }
      groups[combKey].rows.push(row);
    });

    const list = Object.entries(groups).map(([combKey, item], index) => {
      const { geo, state, district, block, aquifer, rows } = item;
      const values = rows
        .map(r => getParamNumericValue(r, selectedParam))
        .filter((v): v is number => v !== null);

      const count = values.length;
      if (count === 0) {
        return {
          geo,
          state,
          district,
          block,
          aquiferName: aquifer,
          count: 0,
          min: 0,
          max: 0,
          avg: 0,
          p75: 0,
          p90: 0,
          p95: 0,
          rangesCount: customRangesLabels.map(() => 0),
          rangesPct: customRangesLabels.map(() => 0),
          values: [] as number[]
        };
      }

      const min = Math.min(...values);
      const max = Math.max(...values);
      const sum = values.reduce((acc, curr) => acc + curr, 0);
      const avg = sum / count;
      const p75 = getPercentile(values, 75);
      const p90 = getPercentile(values, 90);
      const p95 = getPercentile(values, 95);

      // Dynamic customizable range distribution counts
      const rangesCount = customRangesLabels.map(range => {
        let matched = 0;
        values.forEach(v => {
          if (range.check(v)) matched++;
        });
        return matched;
      });

      const rangesPct = rangesCount.map(cnt => (cnt / count) * 100);

      return {
        geo,
        state,
        district,
        block,
        aquiferName: aquifer,
        count,
        min,
        max,
        avg,
        p75,
        p90,
        p95,
        rangesCount,
        rangesPct,
        values
      };
    });

    return list;
  }, [analyzedData, aquiferTappedColumn, selectedParam, aquiferTappedTableGroupLevel, customRangesLabels, headers]);


  // Sort and Filter of Aquifer Tapped Table data
  const processedAquiferTappedList = useMemo(() => {
    let list = [...aquiferTappedStatsData];

    // 1. Search filter
    if (aquiferTappedSearchText) {
      const q = aquiferTappedSearchText.toLowerCase();
      list = list.filter(item => 
        item.aquiferName.toLowerCase().includes(q) || 
        item.geo.toLowerCase().includes(q) ||
        item.state.toLowerCase().includes(q) ||
        item.district.toLowerCase().includes(q) ||
        item.block.toLowerCase().includes(q)
      );
    }

    // 2. Sorting
    list.sort((a: any, b: any) => {
      let valA = a[sortFieldTapped];
      let valB = b[sortFieldTapped];

      // Handle custom range sorting if sorting by ranges index
      if (sortFieldTapped.startsWith("range_")) {
        const rangeIdx = parseInt(sortFieldTapped.replace("range_", ""));
        valA = a.rangesPct[rangeIdx] || 0;
        valB = b.rangesPct[rangeIdx] || 0;
      }

      if (typeof valA === "string") {
        return sortAscTapped 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        return sortAscTapped 
          ? (valA - valB) 
          : (valB - valA);
      }
    });

    return list;
  }, [aquiferTappedStatsData, aquiferTappedSearchText, sortFieldTapped, sortAscTapped]);

  const requestSortTapped = (field: string) => {
    if (sortFieldTapped === field) {
      setSortAscTapped(!sortAscTapped);
    } else {
      setSortFieldTapped(field);
      setSortAscTapped(true);
    }
  };

  // --- SUB TAB 5: STAGE OF EXTRACTION STATS AND DYNAMIC RANGES TABLE ---
  const stageExtractionStatsData = useMemo(() => {
    if (!analyzedData || analyzedData.length === 0) return [];

    const keyToUse = stageExtractionColumn || "Stage of GW Extraction";

    // Build geographic key extractor
    const getGeoGroup = (row: any): string => {
      if (stageExtractionTableGroupLevel === "state") {
        return getStateValue(row) || "Unspecified State";
      } else if (stageExtractionTableGroupLevel === "district") {
        const s = getStateValue(row);
        const d = getDistrictValue(row);
        return [s, d].filter(Boolean).join(" / ") || "Unspecified District";
      } else if (stageExtractionTableGroupLevel === "block") {
        const s = getStateValue(row);
        const d = getDistrictValue(row);
        const b = getBlockValue(row);
        return [s, d, b].filter(Boolean).join(" / ") || "Unspecified Block";
      }
      return "Consolidated";
    };

    // Group rows by geo group + stage of extraction
    const groups: Record<string, { 
      geo: string; 
      state: string; 
      district: string; 
      block: string; 
      aquifer: string; 
      rows: any[] 
    }> = {};

    analyzedData.forEach(row => {
      const geo = getGeoGroup(row);
      const state = getStateValue(row) || "Unspecified State";
      const district = getDistrictValue(row) || "Unspecified District";
      const block = getBlockValue(row) || "Unspecified Block";
      const aquifer = String(row[keyToUse] || "").trim() || "Unspecified Category";
      const combKey = `${geo}::${aquifer}`;
      
      if (!groups[combKey]) {
        groups[combKey] = { 
          geo, 
          state, 
          district, 
          block, 
          aquifer, 
          rows: [] 
        };
      }
      groups[combKey].rows.push(row);
    });

    const list = Object.entries(groups).map(([combKey, item], index) => {
      const { geo, state, district, block, aquifer, rows } = item;
      const values = rows
        .map(r => getParamNumericValue(r, selectedParam))
        .filter((v): v is number => v !== null);

      const count = values.length;
      if (count === 0) {
        return {
          geo,
          state,
          district,
          block,
          aquiferName: aquifer,
          count: 0,
          min: 0,
          max: 0,
          avg: 0,
          p75: 0,
          p90: 0,
          p95: 0,
          rangesCount: customRangesLabels.map(() => 0),
          rangesPct: customRangesLabels.map(() => 0),
          values: [] as number[]
        };
      }

      const min = Math.min(...values);
      const max = Math.max(...values);
      const sum = values.reduce((acc, curr) => acc + curr, 0);
      const avg = sum / count;
      const p75 = getPercentile(values, 75);
      const p90 = getPercentile(values, 90);
      const p95 = getPercentile(values, 95);

      // Dynamic customizable range distribution counts
      const rangesCount = customRangesLabels.map(range => {
        let matched = 0;
        values.forEach(v => {
          if (range.check(v)) matched++;
        });
        return matched;
      });

      const rangesPct = rangesCount.map(cnt => (cnt / count) * 100);

      return {
        geo,
        state,
        district,
        block,
        aquiferName: aquifer,
        count,
        min,
        max,
        avg,
        p75,
        p90,
        p95,
        rangesCount,
        rangesPct,
        values
      };
    });

    return list;
  }, [analyzedData, stageExtractionColumn, selectedParam, stageExtractionTableGroupLevel, customRangesLabels, headers]);

  // Sort and Filter of Stage of Extraction Table data
  const processedStageExtractionList = useMemo(() => {
    let list = [...stageExtractionStatsData];

    // 1. Search filter
    if (stageExtractionSearchText) {
      const q = stageExtractionSearchText.toLowerCase();
      list = list.filter(item => 
        item.aquiferName.toLowerCase().includes(q) || 
        item.geo.toLowerCase().includes(q) ||
        item.state.toLowerCase().includes(q) ||
        item.district.toLowerCase().includes(q) ||
        item.block.toLowerCase().includes(q)
      );
    }

    // 2. Sorting
    list.sort((a: any, b: any) => {
      let valA = a[sortFieldStage];
      let valB = b[sortFieldStage];

      // Handle custom range sorting if sorting by ranges index
      if (sortFieldStage.startsWith("range_")) {
        const rangeIdx = parseInt(sortFieldStage.replace("range_", ""));
        valA = a.rangesPct[rangeIdx] || 0;
        valB = b.rangesPct[rangeIdx] || 0;
      }

      if (typeof valA === "string") {
        return sortAscStage 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        return sortAscStage 
          ? (valA - valB) 
          : (valB - valA);
      }
    });

    return list;
  }, [stageExtractionStatsData, stageExtractionSearchText, sortFieldStage, sortAscStage]);

  const requestSortStage = (field: string) => {
    if (sortFieldStage === field) {
      setSortAscStage(!sortAscStage);
    } else {
      setSortFieldStage(field);
      setSortAscStage(true);
    }
  };

  // --- SUB TAB 6: SOURCE STATS AND DYNAMIC RANGES TABLE ---
  const sourceStatsData = useMemo(() => {
    if (!analyzedData || analyzedData.length === 0) return [];

    const keyToUse = sourceColumn || "Source";

    // Build geographic key extractor
    const getGeoGroup = (row: any): string => {
      if (sourceTableGroupLevel === "state") {
        return getStateValue(row) || "Unspecified State";
      } else if (sourceTableGroupLevel === "district") {
        const s = getStateValue(row);
        const d = getDistrictValue(row);
        return [s, d].filter(Boolean).join(" / ") || "Unspecified District";
      } else if (sourceTableGroupLevel === "block") {
        const s = getStateValue(row);
        const d = getDistrictValue(row);
        const b = getBlockValue(row);
        return [s, d, b].filter(Boolean).join(" / ") || "Unspecified Block";
      }
      return "Consolidated";
    };

    // Group rows by geo group + source
    const groups: Record<string, { 
      geo: string; 
      state: string; 
      district: string; 
      block: string; 
      aquifer: string; 
      rows: any[] 
    }> = {};

    analyzedData.forEach(row => {
      const geo = getGeoGroup(row);
      const state = getStateValue(row) || "Unspecified State";
      const district = getDistrictValue(row) || "Unspecified District";
      const block = getBlockValue(row) || "Unspecified Block";
      const aquifer = String(row[keyToUse] || "").trim() || "Unspecified Source";
      const combKey = `${geo}::${aquifer}`;
      
      if (!groups[combKey]) {
        groups[combKey] = { 
          geo, 
          state, 
          district, 
          block, 
          aquifer, 
          rows: [] 
        };
      }
      groups[combKey].rows.push(row);
    });

    const list = Object.entries(groups).map(([combKey, item]) => {
      const { geo, state, district, block, aquifer, rows } = item;
      const values = rows
        .map(r => getParamNumericValue(r, selectedParam))
        .filter((v): v is number => v !== null);

      const count = values.length;
      if (count === 0) {
        return {
          geo,
          state,
          district,
          block,
          aquiferName: aquifer,
          count: 0,
          min: 0,
          max: 0,
          avg: 0,
          p75: 0,
          p90: 0,
          p95: 0,
          rangesCount: customRangesLabels.map(() => 0),
          rangesPct: customRangesLabels.map(() => 0),
          values: [] as number[]
        };
      }

      const min = Math.min(...values);
      const max = Math.max(...values);
      const sum = values.reduce((acc, curr) => acc + curr, 0);
      const avg = sum / count;
      const p75 = getPercentile(values, 75);
      const p90 = getPercentile(values, 90);
      const p95 = getPercentile(values, 95);

      // Dynamic customizable range distribution counts
      const rangesCount = customRangesLabels.map(range => {
        let matched = 0;
        values.forEach(v => {
          if (range.check(v)) matched++;
        });
        return matched;
      });

      const rangesPct = rangesCount.map(cnt => (cnt / count) * 100);

      return {
        geo,
        state,
        district,
        block,
        aquiferName: aquifer,
        count,
        min,
        max,
        avg,
        p75,
        p90,
        p95,
        rangesCount,
        rangesPct,
        values
      };
    });

    return list;
  }, [analyzedData, sourceColumn, selectedParam, sourceTableGroupLevel, customRangesLabels, headers]);

  // Sort and Filter of Source Table data
  const processedSourceList = useMemo(() => {
    let list = [...sourceStatsData];

    // 1. Search filter
    if (sourceSearchText) {
      const q = sourceSearchText.toLowerCase();
      list = list.filter(item => 
        item.aquiferName.toLowerCase().includes(q) || 
        item.geo.toLowerCase().includes(q) ||
        item.state.toLowerCase().includes(q) ||
        item.district.toLowerCase().includes(q) ||
        item.block.toLowerCase().includes(q)
      );
    }

    // 2. Sorting
    list.sort((a: any, b: any) => {
      let valA = a[sortFieldSource];
      let valB = b[sortFieldSource];

      // Handle custom range sorting if sorting by ranges index
      if (sortFieldSource.startsWith("range_")) {
        const rangeIdx = parseInt(sortFieldSource.replace("range_", ""));
        valA = a.rangesPct[rangeIdx] || 0;
        valB = b.rangesPct[rangeIdx] || 0;
      }

      if (typeof valA === "string") {
        return sortAscSource 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        return sortAscSource 
          ? (valA - valB) 
          : (valB - valA);
      }
    });

    return list;
  }, [sourceStatsData, sourceSearchText, sortFieldSource, sortAscSource]);

  const requestSortSource = (field: string) => {
    if (sortFieldSource === field) {
      setSortAscSource(!sortAscSource);
    } else {
      setSortFieldSource(field);
      setSortAscSource(true);
    }
  };

  // --- SCIENTIFIC GRAND TOTALS ---
  const aquiferTotalRow = useMemo(() => {
    if (!processedAquiferList || processedAquiferList.length === 0) return null;
    const allVals = processedAquiferList.flatMap(item => item.values || []);
    if (allVals.length === 0) return null;
    const count = allVals.length;
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const avg = allVals.reduce((a, b) => a + b, 0) / count;
    const p75 = getPercentile(allVals, 75);
    const p90 = getPercentile(allVals, 90);
    const p95 = getPercentile(allVals, 95);
    const rangesCount = customRangesLabels.map(range => allVals.filter(v => range.check(v)).length);
    const rangesPct = rangesCount.map(cnt => (cnt / count) * 100);
    return { count, min, max, avg, p75, p90, p95, rangesCount, rangesPct };
  }, [processedAquiferList, customRangesLabels]);

  const aquiferTappedTotalRow = useMemo(() => {
    if (!processedAquiferTappedList || processedAquiferTappedList.length === 0) return null;
    const allVals = processedAquiferTappedList.flatMap(item => item.values || []);
    if (allVals.length === 0) return null;
    const count = allVals.length;
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const avg = allVals.reduce((a, b) => a + b, 0) / count;
    const p75 = getPercentile(allVals, 75);
    const p90 = getPercentile(allVals, 90);
    const p95 = getPercentile(allVals, 95);
    const rangesCount = customRangesLabels.map(range => allVals.filter(v => range.check(v)).length);
    const rangesPct = rangesCount.map(cnt => (cnt / count) * 100);
    return { count, min, max, avg, p75, p90, p95, rangesCount, rangesPct };
  }, [processedAquiferTappedList, customRangesLabels]);

  const stageExtractionTotalRow = useMemo(() => {
    if (!processedStageExtractionList || processedStageExtractionList.length === 0) return null;
    const allVals = processedStageExtractionList.flatMap(item => item.values || []);
    if (allVals.length === 0) return null;
    const count = allVals.length;
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const avg = allVals.reduce((a, b) => a + b, 0) / count;
    const p75 = getPercentile(allVals, 75);
    const p90 = getPercentile(allVals, 90);
    const p95 = getPercentile(allVals, 95);
    const rangesCount = customRangesLabels.map(range => allVals.filter(v => range.check(v)).length);
    const rangesPct = rangesCount.map(cnt => (cnt / count) * 100);
    return { count, min, max, avg, p75, p90, p95, rangesCount, rangesPct };
  }, [processedStageExtractionList, customRangesLabels]);

  const sourceTotalRow = useMemo(() => {
    if (!processedSourceList || processedSourceList.length === 0) return null;
    const allVals = processedSourceList.flatMap(item => item.values || []);
    if (allVals.length === 0) return null;
    const count = allVals.length;
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const avg = allVals.reduce((a, b) => a + b, 0) / count;
    const p75 = getPercentile(allVals, 75);
    const p90 = getPercentile(allVals, 90);
    const p95 = getPercentile(allVals, 95);
    const rangesCount = customRangesLabels.map(range => allVals.filter(v => range.check(v)).length);
    const rangesPct = rangesCount.map(cnt => (cnt / count) * 100);
    return { count, min, max, avg, p75, p90, p95, rangesCount, rangesPct };
  }, [processedSourceList, customRangesLabels]);

  const requestSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };


  // ==========================================
  // HIGHCHARTS RENDERING EFFECTS
  // ==========================================
  useEffect(() => {
    if (!isVisible || rawData.length === 0) return;

    // Rendering Tab 1: Frequency distribution
    if (activeSubTab === "frequency" && freqChartRef.current && frequencyDistributionData.categories.length > 0) {
      const b1 = activeParamConfig.b1;
      const b2 = activeParamConfig.b2;
      const label = activeParamConfig.name;
      const unit = activeParamConfig.unit;

      const seriesColors = freqBinMode === "compliance"
        ? (selectedParam === "pH"
          ? ["#3b82f6", "#22c55e", "#f59e0b"]
          : b1 === b2
            ? ["#22c55e", "#ef4444"]
            : ["#22c55e", "#f59e0b", "#ef4444"]
          )
        : ["#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

      const seriesFormatted = frequencyDistributionData.series.map(s => ({
        name: "Samples Count",
        data: s.data,
        type: "column" as const,
        colorByPoint: true,
        colors: seriesColors
      }));

      Highcharts.chart(freqChartRef.current, {
        chart: {
          type: "column",
          options3d: {
            enabled: true,
            alpha: 15,
            beta: 15,
            depth: 60,
            viewDistance: 25
          },
          backgroundColor: "rgba(255, 255, 255, 0)",
          style: { fontFamily: "Inter, sans-serif" },
          height: 420
        },
        title: {
          text: `Frequency Distribution of Parameter`,
          align: "left",
          style: { fontSize: "14px", fontWeight: "bold", color: "#1e293b" }
        },
        subtitle: {
          text: "",
          align: "left",
          style: { fontSize: "11px", color: "#64748b" }
        },
        xAxis: {
          categories: frequencyDistributionData.categories,
          crosshair: true,
          labels: { style: { fontSize: "10px", color: "#475569", fontWeight: "bold" } }
        },
        yAxis: {
          min: 0,
          title: { text: "Frequency (Count of Wells)", style: { fontSize: "11px", color: "#475569", fontWeight: "bold" } },
          gridLineDashStyle: "Dash",
          gridLineColor: "#e2e8f0"
        },
        tooltip: {
          formatter: function(this: any) {
            const val = this.y;
            const total = frequencyDistributionData.total;
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
            return `<span style="font-size:10px; font-weight:bold; color:#475569">${this.key}</span><table>` +
              `<tr><td style="color:${this.point.color};padding:0;font-weight:bold">Wells: </td>` +
              `<td style="padding:0"><b>${val} samples (${pct}%)</b></td></tr>` +
              `</table>`;
          },
          shared: false,
          useHTML: true,
          backgroundColor: "#ffffff",
          borderColor: "#e2e8f0",
          borderRadius: 8
        },
        plotOptions: {
          column: {
            depth: 45,
            pointPadding: 0.2,
            borderWidth: 0,
            colorByPoint: true,
            colors: seriesColors,
            dataLabels: {
              enabled: true,
              color: "#1e293b",
              style: {
                fontSize: "11px",
                fontWeight: "black",
                textOutline: "none"
              },
              inside: false,
              y: -15,
              formatter: function(this: any) {
                const val = this.y;
                const total = frequencyDistributionData.total;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
                return `${val} (${pct}%)`;
              }
            }
          }
        },
        legend: { enabled: false }, // Legend is obsolete because we have colorByPoint categories labeled directly on X-axis
        credits: { enabled: false },
        series: seriesFormatted
      });
    }

    // Rendering Tab 2: Depth concentration
    if (activeSubTab === "depth" && depthChartRef.current && depthColumn) {
      const b1 = activeParamConfig.b1;
      const b2 = activeParamConfig.b2;
      const label = activeParamConfig.name;
      const unit = activeParamConfig.unit;

      const seriesFormatted = depthScatterPoints.map(s => ({
        name: s.name,
        color: (s as any).color || undefined,
        data: s.data.map((p: any) => ({
          x: p.x,
          y: p.y,
          wellID: p.wellID,
          siteName: p.siteName,
          state: p.state,
          district: p.district,
          aquifer: p.aquifer,
          source: p.source
        })),
        type: "scatter" as const,
        marker: { radius: 6, symbol: "circle" }
      }));

      // PlotLines to draw threshold limits
      const plotLines: any[] = [];
      if (b2 > 0) {
        plotLines.push({
          color: "#ef4444", 
          dashStyle: "ShortDash",
          value: b2,
          width: 2,
          zIndex: 5,
          label: {
            text: `Permissible Limit (${b2})`,
            align: "right",
            y: 15,
            style: { color: "#ef4444", fontWeight: "bold", fontSize: "10px" }
          }
        });
      }
      if (b1 > 0 && b1 !== b2) {
        plotLines.push({
          color: "#f59e0b", 
          dashStyle: "ShortDash",
          value: b1,
          width: 1.5,
          zIndex: 5,
          label: {
            text: `Desirable Limit (${b1})`,
            align: "right",
            y: 35,
            style: { color: "#f59e0b", fontWeight: "bold", fontSize: "10px" }
          }
        });
      }

      Highcharts.chart(depthChartRef.current, {
        chart: {
          type: "scatter",
          zoomType: "xy",
          backgroundColor: "rgba(255, 255, 255, 0)",
          style: { fontFamily: "Inter, sans-serif" },
          height: 480
        },
        title: {
          text: `Groundwater Depth vs. ${label} Concentration Chart`,
          align: "left",
          style: { fontSize: "14px", fontWeight: "bold", color: "#1e293b" }
        },
        subtitle: {
          text: `Y-Axis Reversed representing vertical subterranean depth profile below ground level (m bgl)`,
          align: "left",
          style: { fontSize: "11px", color: "#64748b" }
        },
        xAxis: {
          title: {
            enabled: true,
            text: `${label} Concentration (${unit})`,
            style: { fontWeight: "bold", color: "#475569" }
          },
          startOnTick: true,
          endOnTick: true,
          showLastLabel: true,
          gridLineDashStyle: "Dash",
          gridLineColor: "#f1f5f9",
          plotLines: plotLines
        },
        yAxis: {
          title: { text: "Depth of Well below ground level (m bgl)", style: { fontWeight: "bold", color: "#475569" } },
          reversed: true, // Standard Reversed Y-Axis
          gridLineDashStyle: "Dash",
          gridLineColor: "#e2e8f0",
          min: 0
        },
        legend: {
          itemStyle: { fontSize: "10px", color: "#475569" }
        },
        plotOptions: {
          scatter: {
            marker: {
              radius: 6,
              states: { hover: { enabled: true, lineColor: "rgb(100,100,100)" } }
            }
          }
        },
        tooltip: {
          useHTML: true,
          headerFormat: '<span style="font-size: 11px; font-weight: bold; color: #1e293b">{series.name}</span><br/>',
          pointFormat: `<div style="padding: 4px; font-size: 11px; line-height: 1.4">
            <b>Well ID:</b> {point.wellID}<br/>
            <b>Location:</b> {point.siteName}<br/>
            <b>State/District:</b> {point.state} / {point.district}<br/>
            <b>Aquifer:</b> {point.aquifer}<br/>
            <b>Source:</b> {point.source}<br/>
            <b>Depth:</b> <span style="font-family: monospace; color:#2563eb; font-weight: bold">{point.y} m bgl</span><br/>
            <b>${selectedParam}:</b> <span style="font-family: monospace; color:#dc2626; font-weight:bold">{point.x} ${unit}</span>
          </div>`,
          backgroundColor: "#ffffff",
          borderColor: "#e2e8f0",
          borderRadius: 10,
          shadow: true
        },
        credits: { enabled: false },
        series: seriesFormatted
      });
    }

  }, [isVisible, analyzedData, activeSubTab, selectedParam, activeParamConfig, frequencyDistributionData, depthScatterPoints, depthColumn, freqGeographicLevel, freqBinMode, depthColorMode]);


  // ==========================================
  // EXCEL EXPORT HANDLER
  // ==========================================
  const handleExportAdvancedStats = () => {
    if (aquiferStatsData.length === 0) {
      showToast("No data available to export", "error");
      return;
    }
    showToast("Compiling and generating Advanced Analysis Excel report...", "success");

    try {
      const workbook = new ExcelJS.Workbook();
      
      // Sheet 1: Aquifer Stats & Dynamic Ranges
      const ws1 = workbook.addWorksheet("Aquifer Quality Summary");
      
      const columns1: any[] = [];
      if (aquiferTableGroupLevel === "state" || aquiferTableGroupLevel === "district" || aquiferTableGroupLevel === "block") {
        columns1.push({ header: "State / UT", key: "state", width: 20 });
      }
      if (aquiferTableGroupLevel === "district" || aquiferTableGroupLevel === "block") {
        columns1.push({ header: "District", key: "district", width: 20 });
      }
      if (aquiferTableGroupLevel === "block") {
        columns1.push({ header: "Block / Tehsil", key: "block", width: 20 });
      }
      
      columns1.push(
        { header: "Principal Aquifer Type", key: "aquiferName", width: 30 },
        { header: "Samples Count", key: "count", width: 15 },
        { header: `Min ${selectedParam} (${activeParamConfig.unit})`, key: "min", width: 15 },
        { header: `Max ${selectedParam} (${activeParamConfig.unit})`, key: "max", width: 15 },
        { header: `75%ile ${selectedParam} (${activeParamConfig.unit})`, key: "p75", width: 15 },
        { header: `90%ile ${selectedParam} (${activeParamConfig.unit})`, key: "p90", width: 15 },
        { header: `95%ile ${selectedParam} (${activeParamConfig.unit})`, key: "p95", width: 15 },
        { header: `Average ${selectedParam} (${activeParamConfig.unit})`, key: "avg", width: 15 }
      );

      // Add customizable dynamic range headers
      customRangesLabels.forEach((rng, idx) => {
        columns1.push({
          header: `% locations falling: ${rng.label}`,
          key: `range_col_${idx}`,
          width: 25
        });
      });

      ws1.columns = columns1;

      // Header row style
      ws1.getRow(1).font = { bold: true, color: { argb: "FFFFFF" } };
      ws1.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "1E293B" } // Slate 800
      };

      aquiferStatsData.forEach(item => {
        const rowData: any = {
          state: item.state,
          district: item.district,
          block: item.block,
          aquiferName: item.aquiferName,
          count: item.count,
          min: item.min ? parseFloat(item.min.toFixed(4)) : 0,
          max: item.max ? parseFloat(item.max.toFixed(4)) : 0,
          p75: item.p75 ? parseFloat(item.p75.toFixed(4)) : 0,
          p90: item.p90 ? parseFloat(item.p90.toFixed(4)) : 0,
          p95: item.p95 ? parseFloat(item.p95.toFixed(4)) : 0,
          avg: item.avg ? parseFloat(item.avg.toFixed(4)) : 0,
        };
        item.rangesPct.forEach((pct, idx) => {
          rowData[`range_col_${idx}`] = parseFloat(pct.toFixed(2));
        });
        ws1.addRow(rowData);
      });

      // Sheet 1B: Aquifer Tapped Stats & Dynamic Ranges
      if (aquiferTappedStatsData.length > 0) {
        const ws1b = workbook.addWorksheet("Aquifer Tapped Summary");
        const columns1b: any[] = [];
        if (aquiferTappedTableGroupLevel === "state" || aquiferTappedTableGroupLevel === "district" || aquiferTappedTableGroupLevel === "block") {
          columns1b.push({ header: "State / UT", key: "state", width: 20 });
        }
        if (aquiferTappedTableGroupLevel === "district" || aquiferTappedTableGroupLevel === "block") {
          columns1b.push({ header: "District", key: "district", width: 20 });
        }
        if (aquiferTappedTableGroupLevel === "block") {
          columns1b.push({ header: "Block / Tehsil", key: "block", width: 20 });
        }
        
        columns1b.push(
          { header: "Aquifer Tapped Type", key: "aquiferName", width: 30 },
          { header: "Samples Count", key: "count", width: 15 },
          { header: `Min ${selectedParam} (${activeParamConfig.unit})`, key: "min", width: 15 },
          { header: `Max ${selectedParam} (${activeParamConfig.unit})`, key: "max", width: 15 },
          { header: `75%ile ${selectedParam} (${activeParamConfig.unit})`, key: "p75", width: 15 },
          { header: `90%ile ${selectedParam} (${activeParamConfig.unit})`, key: "p90", width: 15 },
          { header: `95%ile ${selectedParam} (${activeParamConfig.unit})`, key: "p95", width: 15 },
          { header: `Average ${selectedParam} (${activeParamConfig.unit})`, key: "avg", width: 15 }
        );

        // Add customizable dynamic range headers
        customRangesLabels.forEach((rng, idx) => {
          columns1b.push({
            header: `% locations falling: ${rng.label}`,
            key: `range_col_${idx}`,
            width: 25
          });
        });

        ws1b.columns = columns1b;

        // Header row style
        ws1b.getRow(1).font = { bold: true, color: { argb: "FFFFFF" } };
        ws1b.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "4C1D95" } // Violet 900
        };

        aquiferTappedStatsData.forEach(item => {
          const rowData: any = {
            state: item.state,
            district: item.district,
            block: item.block,
            aquiferName: item.aquiferName,
            count: item.count,
            min: item.min ? parseFloat(item.min.toFixed(4)) : 0,
            max: item.max ? parseFloat(item.max.toFixed(4)) : 0,
            p75: item.p75 ? parseFloat(item.p75.toFixed(4)) : 0,
            p90: item.p90 ? parseFloat(item.p90.toFixed(4)) : 0,
            p95: item.p95 ? parseFloat(item.p95.toFixed(4)) : 0,
            avg: item.avg ? parseFloat(item.avg.toFixed(4)) : 0,
          };
          item.rangesPct.forEach((pct, idx) => {
            rowData[`range_col_${idx}`] = parseFloat(pct.toFixed(2));
          });
          ws1b.addRow(rowData);
        });
      }

      // Sheet 1C: Stage of Extraction Stats & Dynamic Ranges
      if (stageExtractionStatsData.length > 0) {
        const ws1c = workbook.addWorksheet("Stage of Extraction Summary");
        const columns1c: any[] = [];
        if (stageExtractionTableGroupLevel === "state" || stageExtractionTableGroupLevel === "district" || stageExtractionTableGroupLevel === "block") {
          columns1c.push({ header: "State / UT", key: "state", width: 20 });
        }
        if (stageExtractionTableGroupLevel === "district" || stageExtractionTableGroupLevel === "block") {
          columns1c.push({ header: "District", key: "district", width: 20 });
        }
        if (stageExtractionTableGroupLevel === "block") {
          columns1c.push({ header: "Block / Tehsil", key: "block", width: 20 });
        }
        
        columns1c.push(
          { header: "Stage of Extraction", key: "aquiferName", width: 30 },
          { header: "Samples Count", key: "count", width: 15 },
          { header: `Min ${selectedParam} (${activeParamConfig.unit})`, key: "min", width: 15 },
          { header: `Max ${selectedParam} (${activeParamConfig.unit})`, key: "max", width: 15 },
          { header: `75%ile ${selectedParam} (${activeParamConfig.unit})`, key: "p75", width: 15 },
          { header: `90%ile ${selectedParam} (${activeParamConfig.unit})`, key: "p90", width: 15 },
          { header: `95%ile ${selectedParam} (${activeParamConfig.unit})`, key: "p95", width: 15 },
          { header: `Average ${selectedParam} (${activeParamConfig.unit})`, key: "avg", width: 15 }
        );

        // Add customizable dynamic range headers
        customRangesLabels.forEach((rng, idx) => {
          columns1c.push({
            header: `% locations falling: ${rng.label}`,
            key: `range_col_${idx}`,
            width: 25
          });
        });

        ws1c.columns = columns1c;

        // Header row style
        ws1c.getRow(1).font = { bold: true, color: { argb: "FFFFFF" } };
        ws1c.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "065F46" } // Emerald 800
        };

        stageExtractionStatsData.forEach(item => {
          const rowData: any = {
            state: item.state,
            district: item.district,
            block: item.block,
            aquiferName: item.aquiferName,
            count: item.count,
            min: item.min ? parseFloat(item.min.toFixed(4)) : 0,
            max: item.max ? parseFloat(item.max.toFixed(4)) : 0,
            p75: item.p75 ? parseFloat(item.p75.toFixed(4)) : 0,
            p90: item.p90 ? parseFloat(item.p90.toFixed(4)) : 0,
            p95: item.p95 ? parseFloat(item.p95.toFixed(4)) : 0,
            avg: item.avg ? parseFloat(item.avg.toFixed(4)) : 0,
          };
          item.rangesPct.forEach((pct, idx) => {
            rowData[`range_col_${idx}`] = parseFloat(pct.toFixed(2));
          });
          ws1c.addRow(rowData);
        });
      }

      // Sheet 2: Frequency distribution list
      const ws2 = workbook.addWorksheet("Frequency Histogram Summary");
      ws2.columns = [
        { header: "Geographic Level", key: "group", width: 30 },
        ...frequencyDistributionData.categories.map((cat, idx) => ({
          header: cat,
          key: `bin_${idx}`,
          width: 22
        }))
      ];

      ws2.getRow(1).font = { bold: true, color: { argb: "FFFFFF" } };
      ws2.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "0F766E" } // Teal-700
      };

      frequencyDistributionData.series.forEach(ser => {
        const rowObj: any = { group: ser.name };
        ser.data.forEach((val, idx) => {
          rowObj[`bin_${idx}`] = val;
        });
        ws2.addRow(rowObj);
      });

      // Export Action
      workbook.xlsx.writeBuffer().then((buffer: any) => {
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Advanced_Analysis_${selectedParam}_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
        showToast("Advanced Quality Report downloaded successfully!", "success");
      });

    } catch (err) {
      console.error(err);
      showToast("Excel sheet compiling failed", "error");
    }
  };


  if (!isVisible) return null;
  
  return (
    <div className="space-y-8 animate-fade-in" id="advanced-analysis-suite-root">

      {rawData.length === 0 ? (
        <div className="glossy-panel rounded-3xl p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[300px] border border-slate-200">
          <Database className="w-12 h-12 text-slate-300 animate-pulse mb-4" />
          <p className="font-extrabold text-slate-700 text-sm uppercase tracking-wider">No Active Spreadsheet Data Imported</p>
          <p className="text-xs text-slate-400 max-w-sm mt-1 uppercase tracking-wide">
            Please upload your water chemistry Excel or CSV worksheet in the control panel to activate Advanced Data Analysis.
          </p>
        </div>
      ) : (
        <>
          {/* SECTION 2: LIVE COLUMN MATCH & WORKSPACE CONFIGURATION */}
          <div className="glossy-panel rounded-3xl p-6 border border-slate-200 shadow-md bg-white">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
              <GitMerge className="w-4 h-4 text-indigo-600" /> Ground Water Parameters & Column Match Workspace
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              
              {/* Select Parameter */}
              <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 shadow-inner">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" /> Selected Parameter
                </label>
                <select
                  value={selectedParam}
                  onChange={(e) => setSelectedParam(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {activeParameters.map(p => (
                    <option key={p.key} value={p.key}>
                      {p.name} ({p.key})
                    </option>
                  ))}
                </select>
              </div>

              {/* Match Column: Aquifer */}
              <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 shadow-inner">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-teal-600" /> Principal Aquifer Column
                </label>
                <select
                  value={aquiferColumn}
                  onChange={(e) => setAquiferColumn(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                >
                  <option value="">-- None / Select Column --</option>
                  {availableHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Match Column: Aquifer Tapped */}
              <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 shadow-inner">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <GitMerge className="w-3.5 h-3.5 text-violet-600" /> Aquifer Tapped Column
                </label>
                <select
                  value={aquiferTappedColumn}
                  onChange={(e) => setAquiferTappedColumn(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
                >
                  <option value="">-- None / Select Column --</option>
                  {availableHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Match Column: Stage of Extraction */}
              <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 shadow-inner">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-emerald-600" /> Stage of Extraction Column
                </label>
                <select
                  value={stageExtractionColumn}
                  onChange={(e) => setStageExtractionColumn(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="">-- None / Select Column --</option>
                  {availableHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Match Column: Source */}
              <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 shadow-inner">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-emerald-600" /> Source Type Column
                </label>
                <select
                  value={sourceColumn}
                  onChange={(e) => setSourceColumn(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="">-- None / Select Column --</option>
                  {availableHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Match Column: Depth */}
              <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 shadow-inner">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5 text-rose-500" /> Depth (m bgl) Column
                </label>
                <select
                  value={depthColumn}
                  onChange={(e) => setDepthColumn(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                >
                  <option value="">-- None / Select Column --</option>
                  {availableHeaders.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>


          {/* GEOGRAPHICAL FOCUS FILTERS PANEL */}
          <div className="bg-slate-50/75 rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Filter className="w-4 h-4 text-indigo-600 animate-pulse" /> Advanced Geographical Scope Filters
                </h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                  Filters applied exclusively to the Advanced Analysis tabs to prevent browser lag and focus analysis
                </p>
              </div>
              <div className="flex items-center gap-2.5 self-start sm:self-center shrink-0">
                {rawData.length > 0 && (
                  <button
                    onClick={handleExportAdvancedStats}
                    className="text-[10px] font-black text-teal-600 hover:text-teal-700 uppercase tracking-widest transition-all cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Advanced Sheet
                  </button>
                )}
                <button 
                  onClick={() => {
                    setLocalStateFilter("");
                    setLocalDistrictFilter("");
                    setLocalBlockFilter("");
                  }}
                  className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-widest transition-all cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300"
                >
                  Reset Tab Filters
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Local State Selector */}
              <div className="flex flex-col gap-1.5 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-indigo-550" /> State / UT Wise
                </label>
                <select
                  value={localStateFilter}
                  onChange={(e) => {
                    setLocalStateFilter(e.target.value);
                    setLocalDistrictFilter("");
                    setLocalBlockFilter("");
                  }}
                  className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">All States / UTs ({localStates.length})</option>
                  {localStates.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              {/* Local District Selector */}
              <div className="flex flex-col gap-1.5 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-teal-600" /> District Wise
                </label>
                <select
                  value={localDistrictFilter}
                  onChange={(e) => {
                    setLocalDistrictFilter(e.target.value);
                    setLocalBlockFilter("");
                  }}
                  disabled={!localStateFilter && localStates.length > 1}
                  className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {!localStateFilter && localStates.length > 1 ? "Select State first" : `All Districts (${localDistricts.length})`}
                  </option>
                  {localDistricts.map(dist => (
                    <option key={dist} value={dist}>{dist}</option>
                  ))}
                </select>
              </div>

              {/* Local Block Selector */}
              <div className="flex flex-col gap-1.5 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" /> Block / Tehsil Wise
                </label>
                <select
                  value={localBlockFilter}
                  onChange={(e) => setLocalBlockFilter(e.target.value)}
                  disabled={!localDistrictFilter}
                  className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {!localDistrictFilter ? "Select District first" : `All Blocks (${localBlocks.length})`}
                  </option>
                  {localBlocks.map(blk => (
                    <option key={blk} value={blk}>{blk}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 pl-1 pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Currently displaying <strong className="text-slate-600 font-black">{analyzedData.length}</strong> of <strong className="text-slate-600 font-black">{rawData.length}</strong> samples filtered dynamically.
            </div>
          </div>


          {/* SECTION 3: SUB NAVIGATION TABS BAR */}
          <div className="flex items-center justify-start border-b border-slate-250 gap-2 pb-px select-none">
            <button
              onClick={() => setActiveSubTab("frequency")}
              className={`pb-4 px-6 text-xs uppercase tracking-widest font-black transition-all flex items-center gap-2 border-b-2 relative ${
                activeSubTab === "frequency" 
                  ? "border-indigo-650 text-indigo-900" 
                  : "border-transparent text-slate-600 hover:text-indigo-950 hover:border-slate-300"
              }`}
            >
              <BarChart3 className="w-4 h-4" /> Frequency Distribution
            </button>
            <button
              onClick={() => setActiveSubTab("depth")}
              className={`pb-4 px-6 text-xs uppercase tracking-widest font-black transition-all flex items-center gap-2 border-b-2 relative ${
                activeSubTab === "depth" 
                  ? "border-indigo-650 text-indigo-900" 
                  : "border-transparent text-slate-600 hover:text-indigo-950 hover:border-slate-300"
              }`}
              disabled={!depthColumn}
              title={!depthColumn ? "Match a Depth column first in the configuration workspace to activate this subtab" : ""}
            >
              <TrendingDown className="w-4 h-4" /> Depth to Concentration Chart
              {!depthColumn && (
                <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-normal">Disabled</span>
              )}
            </button>
            <button
              onClick={() => setActiveSubTab("aquifer")}
              className={`pb-4 px-6 text-xs uppercase tracking-widest font-black transition-all flex items-center gap-2 border-b-2 relative ${
                activeSubTab === "aquifer" 
                  ? "border-indigo-650 text-indigo-900" 
                  : "border-transparent text-slate-600 hover:text-indigo-950 hover:border-slate-300"
              }`}
            >
              <Table2 className="w-4 h-4" /> Principal Aquifer Table
            </button>
            <button
              onClick={() => setActiveSubTab("aquiferTapped")}
              className={`pb-4 px-6 text-xs uppercase tracking-widest font-black transition-all flex items-center gap-2 border-b-2 relative ${
                activeSubTab === "aquiferTapped" 
                  ? "border-indigo-650 text-indigo-900" 
                  : "border-transparent text-slate-600 hover:text-indigo-950 hover:border-slate-300"
              }`}
            >
              <GitMerge className="w-4 h-4" /> Aquifer Tapped Table
            </button>
            <button
              onClick={() => setActiveSubTab("stageExtraction")}
              className={`pb-4 px-6 text-xs uppercase tracking-widest font-black transition-all flex items-center gap-2 border-b-2 relative ${
                activeSubTab === "stageExtraction" 
                  ? "border-indigo-650 text-indigo-900" 
                  : "border-transparent text-slate-600 hover:text-indigo-950 hover:border-slate-300"
              }`}
            >
              <Activity className="w-4 h-4" /> Stage of Extraction Table
            </button>
            <button
              onClick={() => setActiveSubTab("source")}
              className={`pb-4 px-6 text-xs uppercase tracking-widest font-black transition-all flex items-center gap-2 border-b-2 relative ${
                activeSubTab === "source" 
                  ? "border-indigo-650 text-indigo-900" 
                  : "border-transparent text-slate-600 hover:text-indigo-950 hover:border-slate-300"
              }`}
            >
              <Database className="w-4 h-4" /> Source Table
            </button>
            <button
              onClick={() => setActiveSubTab("comparison")}
              className={`pb-4 px-6 text-xs uppercase tracking-widest font-black transition-all flex items-center gap-2 border-b-2 relative ${
                activeSubTab === "comparison" 
                  ? "border-indigo-650 text-indigo-900" 
                  : "border-transparent text-slate-600 hover:text-indigo-950 hover:border-slate-300"
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" /> Seasonal & YoY Comparison
            </button>
          </div>


          {/* SUBTAB CONTENT 1: FREQUENCY DISTRIBUTION */}
          {activeSubTab === "frequency" && (
            <div className="glossy-panel rounded-3xl p-6 bg-white border border-slate-200 shadow-md space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <BarChart3 className="w-4.5 h-4.5 text-indigo-600" /> Parameter Frequency Distribution Plot
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                    Categorized simple frequency distribution of the selected chemical parameter
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  
                  {/* Bin mode selection */}
                  <div className="flex items-center bg-slate-100 rounded-xl p-1 select-none border border-slate-200 text-[10px] font-bold">
                    <button
                      onClick={() => setFreqBinMode("compliance")}
                      className={`px-3 py-1 rounded-lg transition-all uppercase tracking-wide ${
                        freqBinMode === "compliance" ? "bg-slate-800 text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Compliance Bounds
                    </button>
                    <button
                      onClick={() => setFreqBinMode("intervals")}
                      className={`px-3 py-1 rounded-lg transition-all uppercase tracking-wide ${
                        freqBinMode === "intervals" ? "bg-slate-800 text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Equal Intervals
                    </button>
                    <button
                      onClick={() => setFreqBinMode("custom")}
                      className={`px-3 py-1 rounded-lg transition-all uppercase tracking-wide ${
                        freqBinMode === "custom" ? "bg-slate-800 text-white shadow-sm font-black" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Customizable Ranges
                    </button>
                  </div>

                  {/* Number of bins input (if in interval mode) */}
                  {freqBinMode === "intervals" && (
                    <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-[10px] font-bold">
                      <span className="text-slate-500 uppercase">Bins:</span>
                      <input
                        type="number"
                        min="2"
                        max="20"
                        value={customNumBins}
                        onChange={(e) => setCustomNumBins(parseInt(e.target.value) || 5)}
                        className="w-12 text-center bg-white border border-slate-350 p-0.5 rounded font-bold text-slate-800"
                      />
                    </div>
                  )}

                </div>
              </div>

              {/* Customizable ranges config workspace inside Frequency Distribution */}
              {freqBinMode === "custom" && (
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-3">
                    <div>
                      <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                        <Settings2 className="w-4 h-4 text-indigo-600" /> Customize Ranges & Thresholds Workspace
                      </h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                        Add, delete, or reset thresholds to dynamically re-calculate and partition the histogram bins
                      </p>
                    </div>
                    <button
                      onClick={handleResetToStandard}
                      className="glossy-btn-indigo px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-white bg-indigo-700 hover:bg-indigo-800"
                    >
                      Reset to BIS Limits
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Current Thresholds Pills */}
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Thresholds:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {customThresholds.map((val, idx) => (
                        <span 
                          key={idx} 
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                        >
                          {val} {activeParamConfig.unit}
                          <button 
                            onClick={() => handleRemoveThreshold(idx)} 
                            className="hover:text-red-500 focus:outline-none"
                            title="Remove threshold"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-indigo-600" />
                          </button>
                        </span>
                      ))}
                      {customThresholds.length === 0 && (
                        <span className="text-[10px] font-bold text-slate-400 italic">No custom thresholds. All samples lumped.</span>
                      )}
                    </div>

                    {/* Add New Threshold */}
                    <div className="flex items-center gap-2 ml-auto">
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 1.5"
                        value={newThresholdInput}
                        onChange={(e) => setNewThresholdInput(e.target.value)}
                        className="w-24 text-xs p-1.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none"
                      />
                      <button
                        onClick={handleAddThreshold}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-750 text-white hover:bg-indigo-850"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Add Limit
                      </button>
                    </div>
                  </div>

                  {/* Decide Class Ranges (Quick Class Range Generator) */}
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 bg-indigo-50/20 rounded-2xl border border-indigo-150/40">
                    <div className="shrink-0">
                      <span className="text-[10px] font-black text-indigo-900 uppercase tracking-widest flex items-center gap-1">
                        <Settings2 className="w-4 h-4 text-indigo-700" /> Decide Class Ranges Generator
                      </span>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Generate regular step-wise intervals (e.g. 0-0.5, &gt;0.5-1.0, &gt;1.0-1.5)</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2 text-[10px] font-bold">
                        <span className="text-slate-500 uppercase tracking-wider">Interval Step:</span>
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          value={rangeStepInput}
                          onChange={(e) => setRangeStepInput(e.target.value)}
                          className="w-20 p-1.5 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-700 text-center focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          placeholder="e.g. 0.5"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold">
                        <span className="text-slate-500 uppercase tracking-wider">Maximum Limit:</span>
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          value={rangeMaxInput}
                          onChange={(e) => setRangeMaxInput(e.target.value)}
                          className="w-20 p-1.5 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-700 text-center focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          placeholder="e.g. 3.0"
                        />
                      </div>
                      <button
                        onClick={handleGenerateClassRanges}
                        className="px-4 py-1.5 bg-indigo-750 hover:bg-indigo-850 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-sm flex items-center gap-1"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Generate Classes
                      </button>
                    </div>
                  </div>

                  {/* Range Labels Preview */}
                  <div className="p-2.5 bg-indigo-50/40 rounded-xl border border-indigo-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-black text-indigo-850 uppercase tracking-wider">
                    <span>Histogram Bins mapped:</span>
                    <div className="flex flex-wrap gap-3">
                      {customRangesLabels.map((rng, idx) => (
                        <span key={idx} className="bg-indigo-100/55 px-2 py-0.5 rounded border border-indigo-200/40">
                          Bin {idx + 1}: <strong className="text-indigo-900">{rng.label} {activeParamConfig.unit}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Chart Target Container */}
              <div className="bg-slate-50/50 p-4 rounded-3xl border border-slate-200/60 shadow-inner">
                <div ref={freqChartRef} className="w-full" />
              </div>

              {/* Tabular View of Frequency Distribution */}
              {frequencyDistributionData.categories.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5 mt-4">
                    <Table2 className="w-4 h-4 text-indigo-600" /> Tabular Frequency Distribution of Parameter
                  </h4>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200 text-left font-sans text-xs">
                      <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="p-3 px-4 border-b border-slate-200">Category / Range</th>
                          <th className="p-3 px-4 border-b border-slate-200 text-right">Sample Count (Wells)</th>
                          <th className="p-3 px-4 border-b border-slate-200 text-right">Percentage Level</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white font-semibold text-slate-800">
                        {frequencyDistributionData.categories.map((cat, catIdx) => {
                          const count = frequencyDistributionData.series[0]?.data[catIdx] ?? 0;
                          const pct = frequencyDistributionData.percentages[catIdx] ?? 0;
                          return (
                            <tr key={catIdx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-3 px-4 border-r border-slate-100 font-bold text-slate-900">{cat}</td>
                              <td className="p-3 px-4 text-right border-r border-slate-100 font-sans text-slate-700 font-bold">{count}</td>
                              <td className="p-3 px-4 text-right font-sans text-indigo-950 bg-indigo-50/20 font-black">{pct.toFixed(2)}%</td>
                            </tr>
                          );
                        })}
                        {/* Total Row */}
                        <tr className="bg-slate-50/80 font-black text-slate-900">
                          <td className="p-3 px-4 border-t-2 border-slate-300">Total Samples Evaluated</td>
                          <td className="p-3 px-4 text-right border-t-2 border-slate-300 font-sans text-slate-900">{frequencyDistributionData.total}</td>
                          <td className="p-3 px-4 text-right border-t-2 border-slate-300 font-sans text-indigo-950 bg-indigo-50/40">100.00%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {frequencyDistributionData.isTruncated && (
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex items-start gap-2.5 shadow-xs">
                  <span className="text-amber-600 font-bold text-sm animate-bounce shrink-0">⚠️</span>
                  <div>
                    <h5 className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Performance Optimization Active</h5>
                    <p className="text-[9px] font-semibold text-amber-700 uppercase tracking-wider leading-relaxed mt-0.5">
                      Showing top 20 groups out of {frequencyDistributionData.totalGroupsCount} total groups by sample count to keep the chart fluid and highly responsive. Please use the Geographical Scope filters above to select specific States or Districts and focus your view.
                    </p>
                  </div>
                </div>
              )}

              <div className="p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-start gap-2">
                <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold text-indigo-800 uppercase tracking-wider leading-relaxed">
                  Toggle geographical levels and compliance thresholds to see how samples cluster. Equal Intervals mode distributes values linearly from minimum to maximum recorded data values.
                </p>
              </div>
            </div>
          )}


          {/* SUBTAB CONTENT 2: DEPTH TO CONCENTRATION PROFILE */}
          {activeSubTab === "depth" && depthColumn && (
            <div className="glossy-panel rounded-3xl p-6 bg-white border border-slate-200 shadow-md space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <TrendingDown className="w-4.5 h-4.5 text-rose-600" /> Vertical Subterranean Concentration Profile
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                    Plotting well depth (m below ground level) on the Y-Axis to track parameter variation across depth bands
                  </p>
                </div>

                {/* Color-coding options */}
                <div className="flex items-center gap-2 bg-slate-150 p-1.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                  <span className="pl-1">Coloring Mode:</span>
                  <div className="flex items-center bg-slate-100 rounded-lg p-0.5 select-none border border-slate-200">
                    <button
                      onClick={() => setDepthColorMode("compliance")}
                      className={`px-2.5 py-1 rounded transition-all ${
                        depthColorMode === "compliance" ? "bg-indigo-700 text-white font-bold" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Compliance
                    </button>
                    {sourceColumn && (
                      <button
                        onClick={() => setDepthColorMode("source")}
                        className={`px-2.5 py-1 rounded transition-all ${
                          depthColorMode === "source" ? "bg-indigo-700 text-white font-bold" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Source Type
                      </button>
                    )}
                    <button
                      onClick={() => setDepthColorMode("uniform")}
                      className={`px-2.5 py-1 rounded transition-all ${
                        depthColorMode === "uniform" ? "bg-indigo-700 text-white font-bold" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Uniform
                    </button>
                  </div>
                </div>
              </div>

              {/* Chart Target Container */}
              <div className="bg-slate-50/50 p-4 rounded-3xl border border-slate-200/60 shadow-inner">
                <div ref={depthChartRef} className="w-full" />
              </div>

              <div className="p-3 bg-teal-50/50 rounded-2xl border border-teal-100 flex items-start gap-2">
                <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold text-teal-800 uppercase tracking-wider leading-relaxed">
                  Standard hydrochemical plots reverse the vertical Y-Axis (0 at surface, increasing downwards) to represent the actual subsurface profile. This allows immediate visual verification of whether contamination is confined to shallow aquifers or deeper horizons.
                </p>
              </div>
            </div>
          )}


          {/* SUBTAB CONTENT 3: PRINCIPAL AQUIFER DATA TABLE WITH DYNAMIC RANGES */}
          {activeSubTab === "aquifer" && (
            <div className="glossy-panel rounded-3xl p-6 bg-white border border-slate-200 shadow-md space-y-6">
              
              {/* Customizable ranges config workspace */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                      <Settings2 className="w-4 h-4 text-indigo-600" /> Customize Ranges & Thresholds Workspace
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                      Add, delete, or reset the thresholds to dynamically re-calculate the percentage of locations column ranges
                    </p>
                  </div>
                  <button
                    onClick={handleResetToStandard}
                    className="glossy-btn-indigo px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-white"
                  >
                    Reset to BIS Limits
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Current Thresholds Pills */}
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Thresholds:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {customThresholds.map((val, idx) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                      >
                        {val} {activeParamConfig.unit}
                        <button 
                          onClick={() => handleRemoveThreshold(idx)} 
                          className="hover:text-red-500 focus:outline-none"
                          title="Remove threshold"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {customThresholds.length === 0 && (
                      <span className="text-[10px] font-bold text-slate-400 italic">No custom thresholds. All samples lumped.</span>
                    )}
                  </div>

                  {/* Add New Threshold */}
                  <div className="flex items-center gap-2 ml-auto">
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 1.5"
                      value={newThresholdInput}
                      onChange={(e) => setNewThresholdInput(e.target.value)}
                      className="w-24 text-xs p-1.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none"
                    />
                    <button
                      onClick={handleAddThreshold}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-750 text-white hover:bg-indigo-850"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Add Limit
                    </button>
                  </div>
                </div>

                {/* Range Labels Preview */}
                <div className="p-2.5 bg-indigo-50/40 rounded-xl border border-indigo-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-black text-indigo-850 uppercase tracking-wider">
                  <span>Ranges mapped in table:</span>
                  <div className="flex flex-wrap gap-3">
                    {customRangesLabels.map((rng, idx) => (
                      <span key={idx} className="bg-indigo-100/55 px-2 py-0.5 rounded border border-indigo-200/40">
                        Range {idx + 1}: <strong className="text-indigo-900">{rng.label} {activeParamConfig.unit}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Layers className="w-4.5 h-4.5 text-indigo-600" /> Module 3: Principal Aquifer Wise Quality Profile
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                    Analyzed groundwater chemical variation stratified by geographic groups and hydrogeological formations
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Table geographic grouping selection */}
                  <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                    <span className="px-1">Group By:</span>
                    <select
                      value={aquiferTableGroupLevel}
                      onChange={(e) => setAquiferTableGroupLevel(e.target.value as any)}
                      className="text-xs p-1 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 cursor-pointer"
                    >
                      <option value="all">None (National Consolidated)</option>
                      <option value="state">State</option>
                      <option value="district">State / District</option>
                      <option value="block">State / District / Block</option>
                    </select>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search aquifer / state..."
                      value={aquiferSearchText}
                      onChange={(e) => setAquiferSearchText(e.target.value)}
                      className="w-48 text-xs p-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700"
                    />
                  </div>
                </div>
              </div>

              {/* Principal Aquifers Quality Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm max-h-[500px] overflow-y-auto custom-scrollbar">
                <table className="table-auto w-auto min-w-full text-left border-collapse text-xs select-none">
                  <thead className="bg-slate-900 text-white sticky top-0 z-10 font-bold tracking-wider text-[9px]">
                    <tr>
                      <th className="p-1.5 px-2 text-center w-12 border border-slate-700 sticky top-0 bg-slate-900 text-white z-10">Sl. No.</th>
                      
                      {/* State column */}
                      {(aquiferTableGroupLevel === "state" || aquiferTableGroupLevel === "district" || aquiferTableGroupLevel === "block") && (
                        <th className="p-1.5 px-2 border border-slate-700 cursor-pointer hover:bg-slate-800 sticky top-0 bg-slate-900 text-white z-10" onClick={() => requestSort("state")}>
                          <div className="flex items-center gap-1">
                            State / UT <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                      )}

                      {/* District column */}
                      {(aquiferTableGroupLevel === "district" || aquiferTableGroupLevel === "block") && (
                        <th className="p-1.5 px-2 border border-slate-700 cursor-pointer hover:bg-slate-800 sticky top-0 bg-slate-900 text-white z-10" onClick={() => requestSort("district")}>
                          <div className="flex items-center gap-1">
                            District <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                      )}

                      {/* Block column */}
                      {(aquiferTableGroupLevel === "block") && (
                        <th className="p-1.5 px-2 border border-slate-700 cursor-pointer hover:bg-slate-800 sticky top-0 bg-slate-900 text-white z-10" onClick={() => requestSort("block")}>
                          <div className="flex items-center gap-1">
                            Block / Tehsil <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                      )}

                      <th className="p-1.5 px-2 border border-slate-700 cursor-pointer hover:bg-slate-800 sticky top-0 bg-slate-900 text-white z-10" onClick={() => requestSort("aquiferName")}>
                        <div className="flex items-center gap-1">
                          Principal Aquifers <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="p-1.5 px-2 text-center w-20 border border-slate-700 cursor-pointer hover:bg-slate-800 sticky top-0 bg-slate-900 text-white z-10" onClick={() => requestSort("count")}>
                        <div className="flex items-center justify-center gap-1">
                          No. <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="p-1.5 px-2 text-right border border-slate-700 cursor-pointer hover:bg-slate-800 sticky top-0 bg-slate-900 text-white z-10" onClick={() => requestSort("min")}>
                        <div className="flex items-center justify-end gap-1">
                          Min ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="p-1.5 px-2 text-right border border-slate-700 cursor-pointer hover:bg-slate-800 sticky top-0 bg-slate-900 text-white z-10" onClick={() => requestSort("p75")}>
                        <div className="flex items-center justify-end gap-1">
                          75%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="p-1.5 px-2 text-right border border-slate-700 cursor-pointer hover:bg-slate-800 sticky top-0 bg-slate-900 text-white z-10" onClick={() => requestSort("p90")}>
                        <div className="flex items-center justify-end gap-1">
                          90%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="p-1.5 px-2 text-right border border-slate-700 cursor-pointer hover:bg-slate-800 sticky top-0 bg-slate-900 text-white z-10" onClick={() => requestSort("p95")}>
                        <div className="flex items-center justify-end gap-1">
                          95%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="p-1.5 px-2 text-right border border-slate-700 cursor-pointer hover:bg-slate-800 sticky top-0 bg-slate-900 text-white z-10" onClick={() => requestSort("max")}>
                        <div className="flex items-center justify-end gap-1">
                          Max ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="p-1.5 px-2 text-right border border-slate-700 cursor-pointer hover:bg-slate-800 sticky top-0 bg-slate-900 text-white z-10" onClick={() => requestSort("avg")}>
                        <div className="flex items-center justify-end gap-1">
                          Average ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      
                      {/* Dynamic columns representing Customizable Ranges */}
                      {customRangesLabels.map((rng, idx) => (
                        <th 
                          key={idx} 
                          className="p-1.5 px-2 text-center border border-slate-700 cursor-pointer hover:bg-slate-800 w-24 bg-slate-900 sticky top-0 text-white z-10"
                          onClick={() => requestSort(`range_${idx}`)}
                        >
                          <div className="flex items-center justify-center gap-1">
                            No. (%) ({rng.label}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white font-semibold text-slate-800">
                    {processedAquiferList.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-[11px]">
                        <td className="p-1.5 px-2 text-center bg-slate-50/50 font-bold border border-slate-200 text-slate-800">{idx + 1}</td>
                        
                        {/* State cell */}
                        {(aquiferTableGroupLevel === "state" || aquiferTableGroupLevel === "district" || aquiferTableGroupLevel === "block") && (
                          <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.state}</td>
                        )}

                        {/* District cell */}
                        {(aquiferTableGroupLevel === "district" || aquiferTableGroupLevel === "block") && (
                          <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.district}</td>
                        )}

                        {/* Block cell */}
                        {(aquiferTableGroupLevel === "block") && (
                          <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.block}</td>
                        )}

                        <td className="p-1.5 px-2 border border-slate-200 font-black text-indigo-900">{row.aquiferName}</td>
                        <td className="p-1.5 px-2 text-center font-bold border border-slate-200 text-slate-850">{row.count}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.min, selectedParam) : "-"}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p75, selectedParam) : "-"}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p90, selectedParam) : "-"}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p95, selectedParam) : "-"}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.max, selectedParam) : "-"}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-indigo-950 bg-indigo-50/30 font-bold">{row.count > 0 ? formatParamValue(row.avg, selectedParam) : "-"}</td>
                        
                        {/* Dynamic range columns rendering */}
                        {row.rangesPct.map((pct, rIdx) => {
                          // Highlight depending on threshold hazard or safety
                          let colorClass = "text-slate-800";
                          if (pct > 0) {
                            if (rIdx === 0) colorClass = "text-emerald-850 bg-emerald-50/30 font-bold"; // safe <= first threshold
                            else if (rIdx === row.rangesPct.length - 1) colorClass = "text-rose-850 bg-rose-50/30 font-black"; // hazard > last threshold
                            else colorClass = "text-amber-850 bg-amber-50/30 font-bold";
                          }
                          return (
                            <td key={rIdx} className={`p-1.5 px-2 text-center border border-slate-200 font-sans ${colorClass}`}>
                              {row.count > 0 ? `${row.rangesCount[rIdx]} (${pct.toFixed(1)}%)` : "-"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    {/* Grand Total Row */}
                    {aquiferTotalRow && processedAquiferList.length > 0 && (
                      <tr className="bg-slate-100/90 font-black text-slate-900 text-[11px] border-t-2 border-slate-300">
                        <td className="p-1.5 px-2 text-center bg-slate-150 border border-slate-200 font-bold">∑</td>
                        {(aquiferTableGroupLevel === "state" || aquiferTableGroupLevel === "district" || aquiferTableGroupLevel === "block") && (
                          <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                        )}
                        {(aquiferTableGroupLevel === "district" || aquiferTableGroupLevel === "block") && (
                          <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                        )}
                        {(aquiferTableGroupLevel === "block") && (
                          <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                        )}
                        <td className="p-1.5 px-2 border border-slate-200 text-indigo-950 font-bold uppercase">Grand Total (Scientifically Combined)</td>
                        <td className="p-1.5 px-2 text-center border border-slate-200 font-bold">{aquiferTotalRow.count}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(aquiferTotalRow.min, selectedParam)}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(aquiferTotalRow.p75, selectedParam)}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(aquiferTotalRow.p90, selectedParam)}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(aquiferTotalRow.p95, selectedParam)}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(aquiferTotalRow.max, selectedParam)}</td>
                        <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-indigo-950 bg-indigo-50 font-bold">{formatParamValue(aquiferTotalRow.avg, selectedParam)}</td>
                        {aquiferTotalRow.rangesPct.map((pct, rIdx) => {
                          let colorClass = "text-slate-800";
                          if (pct > 0) {
                            if (rIdx === 0) colorClass = "text-emerald-850 bg-emerald-50/30 font-bold";
                            else if (rIdx === aquiferTotalRow.rangesPct.length - 1) colorClass = "text-rose-850 bg-rose-50/30 font-black";
                            else colorClass = "text-amber-850 bg-amber-50/30 font-bold";
                          }
                          return (
                            <td key={rIdx} className={`p-1.5 px-2 text-center border border-slate-200 font-sans ${colorClass}`}>
                              {aquiferTotalRow.rangesCount[rIdx]} ({pct.toFixed(1)}%)
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {processedAquiferList.length === 0 && (
                      <tr>
                        <td colSpan={10 + customRangesLabels.length + (aquiferTableGroupLevel === "state" ? 1 : aquiferTableGroupLevel === "district" ? 2 : aquiferTableGroupLevel === "block" ? 3 : 0)} className="p-8 text-center text-slate-600 font-black bg-slate-50 uppercase tracking-widest text-[10px]">
                          No records matched search string or column settings.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}


          {/* SUBTAB CONTENT 4: AQUIFER TAPPED DATA TABLE WITH DYNAMIC RANGES */}
          {activeSubTab === "aquiferTapped" && (
            <div className="glossy-panel rounded-3xl p-6 bg-white border border-slate-200 shadow-md space-y-6">
              
              {/* Customizable ranges config workspace (shared) */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                      <Settings2 className="w-4 h-4 text-violet-600" /> Customize Ranges & Thresholds Workspace
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                      Add, delete, or reset the thresholds to dynamically re-calculate the percentage of locations column ranges
                    </p>
                  </div>
                  <button
                    onClick={handleResetToStandard}
                    className="glossy-btn-indigo px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-white"
                  >
                    Reset to BIS Limits
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Current Thresholds Pills */}
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Thresholds:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {customThresholds.map((val, idx) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                      >
                        {val} {activeParamConfig.unit}
                        <button 
                          onClick={() => handleRemoveThreshold(idx)} 
                          className="hover:text-red-500 focus:outline-none"
                          title="Remove threshold"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {customThresholds.length === 0 && (
                      <span className="text-[10px] font-bold text-slate-400 italic">No custom thresholds. All samples lumped.</span>
                    )}
                  </div>

                  {/* Add New Threshold */}
                  <div className="flex items-center gap-2 ml-auto">
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 1.5"
                      value={newThresholdInput}
                      onChange={(e) => setNewThresholdInput(e.target.value)}
                      className="w-24 text-xs p-1.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none"
                    />
                    <button
                      onClick={handleAddThreshold}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-750 text-white hover:bg-indigo-850"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Add Limit
                    </button>
                  </div>
                </div>

                {/* Range Labels Preview */}
                <div className="p-2.5 bg-indigo-50/40 rounded-xl border border-indigo-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-black text-indigo-850 uppercase tracking-wider">
                  <span>Ranges mapped in table:</span>
                  <div className="flex flex-wrap gap-3">
                    {customRangesLabels.map((rng, idx) => (
                      <span key={idx} className="bg-indigo-100/55 px-2 py-0.5 rounded border border-indigo-200/40">
                        Range {idx + 1}: <strong className="text-indigo-900">{rng.label} {activeParamConfig.unit}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <GitMerge className="w-4.5 h-4.5 text-violet-600" /> Module 4: Aquifer Tapped Wise Quality Profile
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                    Analyzed groundwater chemical variation stratified by geographic groups and matched tapped aquifer horizons
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Table geographic grouping selection */}
                  <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                    <span className="px-1">Group By:</span>
                    <select
                      value={aquiferTappedTableGroupLevel}
                      onChange={(e) => setAquiferTappedTableGroupLevel(e.target.value as any)}
                      className="text-xs p-1 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 cursor-pointer"
                    >
                      <option value="all">None (National Consolidated)</option>
                      <option value="state">State</option>
                      <option value="district">State / District</option>
                      <option value="block">State / District / Block</option>
                    </select>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search aquifer / state..."
                      value={aquiferTappedSearchText}
                      onChange={(e) => setAquiferTappedSearchText(e.target.value)}
                      className="w-48 text-xs p-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700"
                    />
                  </div>
                </div>
              </div>

              {!aquiferTappedColumn ? (
                <div className="p-8 text-center bg-violet-50/50 rounded-2xl border border-violet-100 border-dashed text-slate-500 font-bold text-xs flex flex-col items-center gap-2">
                  <GitMerge className="w-8 h-8 text-violet-400 animate-pulse" />
                  <span>No column matched for "Aquifer Tapped". Please select the correct column from the column mapping overrides in the top configuration panel to load the Aquifer Tapped data.</span>
                </div>
              ) : (
                /* Aquifer Tapped Quality Table */
                <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm max-h-[500px] overflow-y-auto custom-scrollbar">
                  <table className="table-auto w-auto min-w-full text-left border-collapse text-xs select-none">
                    <thead className="bg-violet-950 text-white sticky top-0 z-10 font-bold tracking-wider text-[9px]">
                      <tr>
                        <th className="p-1.5 px-2 text-center w-12 border border-violet-900 sticky top-0 bg-violet-950 text-white z-10">Sl. No.</th>
                        
                        {/* State column */}
                        {(aquiferTappedTableGroupLevel === "state" || aquiferTappedTableGroupLevel === "district" || aquiferTappedTableGroupLevel === "block") && (
                          <th className="p-1.5 px-2 border border-violet-900 cursor-pointer hover:bg-violet-900 sticky top-0 bg-violet-950 text-white z-10" onClick={() => requestSortTapped("state")}>
                            <div className="flex items-center gap-1">
                              State / UT <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        )}

                        {/* District column */}
                        {(aquiferTappedTableGroupLevel === "district" || aquiferTappedTableGroupLevel === "block") && (
                          <th className="p-1.5 px-2 border border-violet-900 cursor-pointer hover:bg-violet-900 sticky top-0 bg-violet-950 text-white z-10" onClick={() => requestSortTapped("district")}>
                            <div className="flex items-center gap-1">
                              District <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        )}

                        {/* Block column */}
                        {(aquiferTappedTableGroupLevel === "block") && (
                          <th className="p-1.5 px-2 border border-violet-900 cursor-pointer hover:bg-violet-900 sticky top-0 bg-violet-950 text-white z-10" onClick={() => requestSortTapped("block")}>
                            <div className="flex items-center gap-1">
                              Block / Tehsil <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        )}

                        <th className="p-1.5 px-2 border border-violet-900 cursor-pointer hover:bg-violet-900 sticky top-0 bg-violet-950 text-white z-10" onClick={() => requestSortTapped("aquiferName")}>
                          <div className="flex items-center gap-1">
                            Aquifers Tapped <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-center w-20 border border-violet-900 cursor-pointer hover:bg-violet-900 sticky top-0 bg-violet-950 text-white z-10" onClick={() => requestSortTapped("count")}>
                          <div className="flex items-center justify-center gap-1">
                            No. <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-violet-900 cursor-pointer hover:bg-violet-900 sticky top-0 bg-violet-950 text-white z-10" onClick={() => requestSortTapped("min")}>
                          <div className="flex items-center justify-end gap-1">
                            Min ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-violet-900 cursor-pointer hover:bg-violet-900 sticky top-0 bg-violet-950 text-white z-10" onClick={() => requestSortTapped("p75")}>
                          <div className="flex items-center justify-end gap-1">
                            75%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-violet-900 cursor-pointer hover:bg-violet-900 sticky top-0 bg-violet-950 text-white z-10" onClick={() => requestSortTapped("p90")}>
                          <div className="flex items-center justify-end gap-1">
                            90%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-violet-900 cursor-pointer hover:bg-violet-900 sticky top-0 bg-violet-950 text-white z-10" onClick={() => requestSortTapped("p95")}>
                          <div className="flex items-center justify-end gap-1">
                            95%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-violet-900 cursor-pointer hover:bg-violet-900 sticky top-0 bg-violet-950 text-white z-10" onClick={() => requestSortTapped("max")}>
                          <div className="flex items-center justify-end gap-1">
                            Max ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-violet-900 cursor-pointer hover:bg-violet-900 sticky top-0 bg-violet-950 text-white z-10" onClick={() => requestSortTapped("avg")}>
                          <div className="flex items-center justify-end gap-1">
                            Average ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        
                        {/* Dynamic columns representing Customizable Ranges */}
                        {customRangesLabels.map((rng, idx) => (
                          <th 
                            key={idx} 
                            className="p-1.5 px-2 text-center border border-violet-900 cursor-pointer hover:bg-violet-900 w-24 bg-violet-950 sticky top-0 text-white z-10"
                            onClick={() => requestSortTapped(`range_${idx}`)}
                          >
                            <div className="flex items-center justify-center gap-1">
                              No. (%) ({rng.label}) <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white font-semibold text-slate-800">
                      {processedAquiferTappedList.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-[11px]">
                          <td className="p-1.5 px-2 text-center bg-slate-50/50 font-bold border border-slate-200 text-slate-800">{idx + 1}</td>
                          
                          {/* State cell */}
                          {(aquiferTappedTableGroupLevel === "state" || aquiferTappedTableGroupLevel === "district" || aquiferTappedTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.state}</td>
                          )}

                          {/* District cell */}
                          {(aquiferTappedTableGroupLevel === "district" || aquiferTappedTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.district}</td>
                          )}

                          {/* Block cell */}
                          {(aquiferTappedTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.block}</td>
                          )}

                          <td className="p-1.5 px-2 border border-slate-200 font-black text-violet-900">{row.aquiferName}</td>
                          <td className="p-1.5 px-2 text-center font-bold border border-slate-200 text-slate-850">{row.count}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.min, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p75, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p90, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p95, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.max, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-violet-950 bg-violet-50/30 font-bold">{row.count > 0 ? formatParamValue(row.avg, selectedParam) : "-"}</td>
                          
                          {/* Dynamic range columns rendering */}
                          {row.rangesPct.map((pct, rIdx) => {
                            // Highlight depending on threshold hazard or safety
                            let colorClass = "text-slate-800";
                            if (pct > 0) {
                              if (rIdx === 0) colorClass = "text-emerald-850 bg-emerald-50/30 font-bold"; // safe <= first threshold
                              else if (rIdx === row.rangesPct.length - 1) colorClass = "text-rose-850 bg-rose-50/30 font-black"; // hazard > last threshold
                              else colorClass = "text-amber-850 bg-amber-50/30 font-bold";
                            }
                            return (
                              <td key={rIdx} className={`p-1.5 px-2 text-center border border-slate-200 font-sans ${colorClass}`}>
                                {row.count > 0 ? `${row.rangesCount[rIdx]} (${pct.toFixed(1)}%)` : "-"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Grand Total Row */}
                      {aquiferTappedTotalRow && processedAquiferTappedList.length > 0 && (
                        <tr className="bg-slate-100/90 font-black text-slate-900 text-[11px] border-t-2 border-slate-300">
                          <td className="p-1.5 px-2 text-center bg-slate-150 border border-slate-200 font-bold">∑</td>
                          {(aquiferTappedTableGroupLevel === "state" || aquiferTappedTableGroupLevel === "district" || aquiferTappedTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                          )}
                          {(aquiferTappedTableGroupLevel === "district" || aquiferTappedTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                          )}
                          {(aquiferTappedTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                          )}
                          <td className="p-1.5 px-2 border border-slate-200 text-violet-950 font-bold uppercase">Grand Total (Scientifically Combined)</td>
                          <td className="p-1.5 px-2 text-center border border-slate-200 font-bold">{aquiferTappedTotalRow.count}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(aquiferTappedTotalRow.min, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(aquiferTappedTotalRow.p75, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(aquiferTappedTotalRow.p90, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(aquiferTappedTotalRow.p95, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(aquiferTappedTotalRow.max, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-violet-950 bg-violet-50 font-bold">{formatParamValue(aquiferTappedTotalRow.avg, selectedParam)}</td>
                          {aquiferTappedTotalRow.rangesPct.map((pct, rIdx) => {
                            let colorClass = "text-slate-800";
                            if (pct > 0) {
                              if (rIdx === 0) colorClass = "text-emerald-850 bg-emerald-50/30 font-bold";
                              else if (rIdx === aquiferTappedTotalRow.rangesPct.length - 1) colorClass = "text-rose-850 bg-rose-50/30 font-black";
                              else colorClass = "text-amber-850 bg-amber-50/30 font-bold";
                            }
                            return (
                              <td key={rIdx} className={`p-1.5 px-2 text-center border border-slate-200 font-sans ${colorClass}`}>
                                {aquiferTappedTotalRow.rangesCount[rIdx]} ({pct.toFixed(1)}%)
                              </td>
                            );
                          })}
                        </tr>
                      )}
                      {processedAquiferTappedList.length === 0 && (
                        <tr>
                          <td colSpan={10 + customRangesLabels.length + (aquiferTappedTableGroupLevel === "state" ? 1 : aquiferTappedTableGroupLevel === "district" ? 2 : aquiferTappedTableGroupLevel === "block" ? 3 : 0)} className="p-8 text-center text-slate-600 font-black bg-slate-50 uppercase tracking-widest text-[10px]">
                            No records matched search string or column settings.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          )}

          {/* SUBTAB CONTENT 5: STAGE OF EXTRACTION DATA TABLE WITH DYNAMIC RANGES */}
          {activeSubTab === "stageExtraction" && (
            <div className="glossy-panel rounded-3xl p-6 bg-white border border-slate-200 shadow-md space-y-6">
              
              {/* Customizable ranges config workspace (shared) */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                      <Settings2 className="w-4 h-4 text-emerald-600" /> Customize Ranges & Thresholds Workspace
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                      Add, delete, or reset the thresholds to dynamically re-calculate the percentage of locations column ranges
                    </p>
                  </div>
                  <button
                    onClick={handleResetToStandard}
                    className="glossy-btn-indigo px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-white bg-indigo-750 hover:bg-indigo-850"
                  >
                    Reset to BIS Limits
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Current Thresholds Pills */}
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Thresholds:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {customThresholds.map((val, idx) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                      >
                        {val} {activeParamConfig.unit}
                        <button 
                          onClick={() => handleRemoveThreshold(idx)} 
                          className="hover:text-red-500 focus:outline-none"
                          title="Remove threshold"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {customThresholds.length === 0 && (
                      <span className="text-[10px] font-bold text-slate-400 italic">No custom thresholds. All samples lumped.</span>
                    )}
                  </div>

                  {/* Add New Threshold */}
                  <div className="flex items-center gap-2 ml-auto">
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 1.5"
                      value={newThresholdInput}
                      onChange={(e) => setNewThresholdInput(e.target.value)}
                      className="w-24 text-xs p-1.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none"
                    />
                    <button
                      onClick={handleAddThreshold}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-750 text-white hover:bg-indigo-850"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Add Limit
                    </button>
                  </div>
                </div>

                {/* Range Labels Preview */}
                <div className="p-2.5 bg-indigo-50/40 rounded-xl border border-indigo-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-black text-indigo-850 uppercase tracking-wider">
                  <span>Ranges mapped in table:</span>
                  <div className="flex flex-wrap gap-3">
                    {customRangesLabels.map((rng, idx) => (
                      <span key={idx} className="bg-indigo-100/55 px-2 py-0.5 rounded border border-indigo-200/40">
                        Range {idx + 1}: <strong className="text-indigo-900">{rng.label} {activeParamConfig.unit}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4.5 h-4.5 text-emerald-650 animate-pulse" /> Module 5: Stage of Extraction Wise Quality Profile
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                    Analyzed groundwater chemical variation stratified by geographic groups and groundwater extraction stages
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Table geographic grouping selection */}
                  <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                    <span className="px-1">Group By:</span>
                    <select
                      value={stageExtractionTableGroupLevel}
                      onChange={(e) => setStageExtractionTableGroupLevel(e.target.value as any)}
                      className="text-xs p-1 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 cursor-pointer focus:outline-none"
                    >
                      <option value="all">None (National Consolidated)</option>
                      <option value="state">State</option>
                      <option value="district">State / District</option>
                      <option value="block">State / District / Block</option>
                    </select>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search stage / state..."
                      value={stageExtractionSearchText}
                      onChange={(e) => setStageExtractionSearchText(e.target.value)}
                      className="w-48 text-xs p-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {!stageExtractionColumn ? (
                <div className="p-8 text-center bg-emerald-50/50 rounded-2xl border border-emerald-100 border-dashed text-slate-500 font-bold text-xs flex flex-col items-center gap-2">
                  <Activity className="w-8 h-8 text-emerald-400 animate-pulse" />
                  <span>No column matched for "Stage of Extraction". Please select the correct column from the column mapping overrides in the top configuration panel to load the Stage of Extraction data.</span>
                </div>
              ) : (
                /* Stage of Extraction Quality Table */
                <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm max-h-[500px] overflow-y-auto custom-scrollbar">
                  <table className="table-auto w-auto min-w-full text-left border-collapse text-xs select-none">
                    <thead className="bg-emerald-950 text-white sticky top-0 z-10 font-bold tracking-wider text-[9px]">
                      <tr>
                        <th className="p-1.5 px-2 text-center w-12 border border-emerald-900 sticky top-0 bg-emerald-950 text-white z-10">Sl. No.</th>
                        
                        {/* State column */}
                        {(stageExtractionTableGroupLevel === "state" || stageExtractionTableGroupLevel === "district" || stageExtractionTableGroupLevel === "block") && (
                          <th className="p-1.5 px-2 border border-emerald-900 cursor-pointer hover:bg-emerald-900 sticky top-0 bg-emerald-950 text-white z-10" onClick={() => requestSortStage("state")}>
                            <div className="flex items-center gap-1">
                              State / UT <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        )}

                        {/* District column */}
                        {(stageExtractionTableGroupLevel === "district" || stageExtractionTableGroupLevel === "block") && (
                          <th className="p-1.5 px-2 border border-emerald-900 cursor-pointer hover:bg-emerald-900 sticky top-0 bg-emerald-950 text-white z-10" onClick={() => requestSortStage("district")}>
                            <div className="flex items-center gap-1">
                              District <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        )}

                        {/* Block column */}
                        {(stageExtractionTableGroupLevel === "block") && (
                          <th className="p-1.5 px-2 border border-emerald-900 cursor-pointer hover:bg-emerald-900 sticky top-0 bg-emerald-950 text-white z-10" onClick={() => requestSortStage("block")}>
                            <div className="flex items-center gap-1">
                              Block / Tehsil <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        )}

                        <th className="p-1.5 px-2 border border-emerald-900 cursor-pointer hover:bg-emerald-950 sticky top-0 bg-emerald-950 text-white z-10" onClick={() => requestSortStage("aquiferName")}>
                          <div className="flex items-center gap-1">
                            Stage of Extraction <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-center w-20 border border-emerald-900 cursor-pointer hover:bg-emerald-900 sticky top-0 bg-emerald-950 text-white z-10" onClick={() => requestSortStage("count")}>
                          <div className="flex items-center justify-center gap-1">
                            No. <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-emerald-900 cursor-pointer hover:bg-emerald-900 sticky top-0 bg-emerald-950 text-white z-10" onClick={() => requestSortStage("min")}>
                          <div className="flex items-center justify-end gap-1">
                            Min ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-emerald-900 cursor-pointer hover:bg-emerald-900 sticky top-0 bg-emerald-950 text-white z-10" onClick={() => requestSortStage("p75")}>
                          <div className="flex items-center justify-end gap-1">
                            75%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-emerald-900 cursor-pointer hover:bg-emerald-900 sticky top-0 bg-emerald-950 text-white z-10" onClick={() => requestSortStage("p90")}>
                          <div className="flex items-center justify-end gap-1">
                            90%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-emerald-900 cursor-pointer hover:bg-emerald-900 sticky top-0 bg-emerald-950 text-white z-10" onClick={() => requestSortStage("p95")}>
                          <div className="flex items-center justify-end gap-1">
                            95%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-emerald-900 cursor-pointer hover:bg-emerald-900 sticky top-0 bg-emerald-950 text-white z-10" onClick={() => requestSortStage("max")}>
                          <div className="flex items-center justify-end gap-1">
                            Max ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-emerald-900 cursor-pointer hover:bg-emerald-900 sticky top-0 bg-emerald-950 text-white z-10" onClick={() => requestSortStage("avg")}>
                          <div className="flex items-center justify-end gap-1">
                            Average ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        
                        {/* Dynamic columns representing Customizable Ranges */}
                        {customRangesLabels.map((rng, idx) => (
                          <th 
                            key={idx} 
                            className="p-1.5 px-2 text-center border border-emerald-900 cursor-pointer hover:bg-emerald-900 w-24 bg-emerald-950 sticky top-0 text-white z-10"
                            onClick={() => requestSortStage(`range_${idx}`)}
                          >
                            <div className="flex items-center justify-center gap-1">
                              No. (%) ({rng.label}) <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white font-semibold text-slate-800">
                      {processedStageExtractionList.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-[11px]">
                          <td className="p-1.5 px-2 text-center bg-slate-50/50 font-bold border border-slate-200 text-slate-800">{idx + 1}</td>
                          
                          {/* State cell */}
                          {(stageExtractionTableGroupLevel === "state" || stageExtractionTableGroupLevel === "district" || stageExtractionTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.state}</td>
                          )}

                          {/* District cell */}
                          {(stageExtractionTableGroupLevel === "district" || stageExtractionTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.district}</td>
                          )}

                          {/* Block cell */}
                          {(stageExtractionTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.block}</td>
                          )}

                          <td className="p-1.5 px-2 border border-slate-200 font-black text-emerald-900">{row.aquiferName}</td>
                          <td className="p-1.5 px-2 text-center font-bold border border-slate-200 text-slate-850">{row.count}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.min, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p75, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p90, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p95, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.max, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-emerald-950 bg-emerald-50/30 font-bold">{row.count > 0 ? formatParamValue(row.avg, selectedParam) : "-"}</td>
                          
                          {/* Dynamic range columns rendering */}
                          {row.rangesPct.map((pct, rIdx) => {
                            // Highlight depending on threshold hazard or safety
                            let colorClass = "text-slate-800";
                            if (pct > 0) {
                              if (rIdx === 0) colorClass = "text-emerald-850 bg-emerald-50/30 font-bold"; // safe <= first threshold
                              else if (rIdx === row.rangesPct.length - 1) colorClass = "text-rose-850 bg-rose-50/30 font-black"; // hazard > last threshold
                              else colorClass = "text-amber-850 bg-amber-50/30 font-bold";
                            }
                            return (
                              <td key={rIdx} className={`p-1.5 px-2 text-center border border-slate-200 font-sans ${colorClass}`}>
                                {row.count > 0 ? `${row.rangesCount[rIdx]} (${pct.toFixed(1)}%)` : "-"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Grand Total Row */}
                      {stageExtractionTotalRow && processedStageExtractionList.length > 0 && (
                        <tr className="bg-slate-100/90 font-black text-slate-900 text-[11px] border-t-2 border-slate-300">
                          <td className="p-1.5 px-2 text-center bg-slate-150 border border-slate-200 font-bold">∑</td>
                          {(stageExtractionTableGroupLevel === "state" || stageExtractionTableGroupLevel === "district" || stageExtractionTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                          )}
                          {(stageExtractionTableGroupLevel === "district" || stageExtractionTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                          )}
                          {(stageExtractionTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                          )}
                          <td className="p-1.5 px-2 border border-slate-200 text-emerald-950 font-bold uppercase">Grand Total (Scientifically Combined)</td>
                          <td className="p-1.5 px-2 text-center border border-slate-200 font-bold">{stageExtractionTotalRow.count}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(stageExtractionTotalRow.min, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(stageExtractionTotalRow.p75, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(stageExtractionTotalRow.p90, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(stageExtractionTotalRow.p95, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(stageExtractionTotalRow.max, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-emerald-950 bg-emerald-50 font-bold">{formatParamValue(stageExtractionTotalRow.avg, selectedParam)}</td>
                          {stageExtractionTotalRow.rangesPct.map((pct, rIdx) => {
                            let colorClass = "text-slate-800";
                            if (pct > 0) {
                              if (rIdx === 0) colorClass = "text-emerald-850 bg-emerald-50/30 font-bold";
                              else if (rIdx === stageExtractionTotalRow.rangesPct.length - 1) colorClass = "text-rose-850 bg-rose-50/30 font-black";
                              else colorClass = "text-amber-850 bg-amber-50/30 font-bold";
                            }
                            return (
                              <td key={rIdx} className={`p-1.5 px-2 text-center border border-slate-200 font-sans ${colorClass}`}>
                                {stageExtractionTotalRow.rangesCount[rIdx]} ({pct.toFixed(1)}%)
                              </td>
                            );
                          })}
                        </tr>
                      )}
                      {processedStageExtractionList.length === 0 && (
                        <tr>
                          <td colSpan={10 + customRangesLabels.length + (stageExtractionTableGroupLevel === "state" ? 1 : stageExtractionTableGroupLevel === "district" ? 2 : stageExtractionTableGroupLevel === "block" ? 3 : 0)} className="p-8 text-center text-slate-600 font-black bg-slate-50 uppercase tracking-widest text-[10px]">
                            No records matched search string or column settings.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          )}

          {/* SUBTAB CONTENT 6: SOURCE DATA TABLE WITH DYNAMIC RANGES */}
          {activeSubTab === "source" && (
            <div className="glossy-panel rounded-3xl p-6 bg-white border border-slate-200 shadow-md space-y-6">
              
              {/* Customizable ranges config workspace (shared) */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                      <Settings2 className="w-4 h-4 text-indigo-600" /> Customize Ranges & Thresholds Workspace
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                      Add, delete, or reset the thresholds to dynamically re-calculate the percentage of locations column ranges
                    </p>
                  </div>
                  <button
                    onClick={handleResetToStandard}
                    className="glossy-btn-indigo px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-white bg-indigo-750 hover:bg-indigo-850"
                  >
                    Reset to BIS Limits
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Current Thresholds Pills */}
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Thresholds:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {customThresholds.map((val, idx) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                      >
                        {val} {activeParamConfig.unit}
                        <button 
                          onClick={() => handleRemoveThreshold(idx)} 
                          className="hover:text-red-500 focus:outline-none"
                          title="Remove threshold"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {customThresholds.length === 0 && (
                      <span className="text-[10px] font-bold text-slate-400 italic">No custom thresholds. All samples lumped.</span>
                    )}
                  </div>

                  {/* Add New Threshold */}
                  <div className="flex items-center gap-2 ml-auto">
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 1.5"
                      value={newThresholdInput}
                      onChange={(e) => setNewThresholdInput(e.target.value)}
                      className="w-24 text-xs p-1.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none"
                    />
                    <button
                      onClick={handleAddThreshold}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-750 text-white hover:bg-indigo-850"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Add Limit
                    </button>
                  </div>
                </div>

                {/* Range Labels Preview */}
                <div className="p-2.5 bg-indigo-50/40 rounded-xl border border-indigo-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-black text-indigo-850 uppercase tracking-wider">
                  <span>Ranges mapped in table:</span>
                  <div className="flex flex-wrap gap-3">
                    {customRangesLabels.map((rng, idx) => (
                      <span key={idx} className="bg-indigo-100/55 px-2 py-0.5 rounded border border-indigo-200/40">
                        Range {idx + 1}: <strong className="text-indigo-900">{rng.label} {activeParamConfig.unit}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Database className="w-4.5 h-4.5 text-indigo-650 animate-pulse" /> Module 6: Source-Wise Quality Profile and Classification
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                    Analyzed groundwater chemical variation stratified by geographic groups and water sources
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Table geographic grouping selection */}
                  <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                    <span className="px-1">Group By:</span>
                    <select
                      value={sourceTableGroupLevel}
                      onChange={(e) => setSourceTableGroupLevel(e.target.value as any)}
                      className="text-xs p-1 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 cursor-pointer focus:outline-none"
                    >
                      <option value="all">None (Consolidated)</option>
                      <option value="state">State</option>
                      <option value="district">State / District</option>
                      <option value="block">State / District / Block</option>
                    </select>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search source / state..."
                      value={sourceSearchText}
                      onChange={(e) => setSourceSearchText(e.target.value)}
                      className="w-48 text-xs p-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {!sourceColumn ? (
                <div className="p-8 text-center bg-indigo-50/50 rounded-2xl border border-indigo-100 border-dashed text-slate-500 font-bold text-xs flex flex-col items-center gap-2">
                  <Database className="w-8 h-8 text-indigo-400 animate-pulse" />
                  <span>No column matched for "Source". Please select the correct column from the column mapping overrides in the top configuration panel to load the Source data.</span>
                </div>
              ) : (
                /* Source Quality Table */
                <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm max-h-[500px] overflow-y-auto custom-scrollbar">
                  <table className="table-auto w-auto min-w-full text-left border-collapse text-xs select-none">
                    <thead className="bg-indigo-950 text-white sticky top-0 z-10 font-bold tracking-wider text-[9px]">
                      <tr>
                        <th className="p-1.5 px-2 text-center w-12 border border-indigo-900 sticky top-0 bg-indigo-950 text-white z-10">Sl. No.</th>
                        
                        {/* State column */}
                        {(sourceTableGroupLevel === "state" || sourceTableGroupLevel === "district" || sourceTableGroupLevel === "block") && (
                          <th className="p-1.5 px-2 border border-indigo-900 cursor-pointer hover:bg-indigo-900 sticky top-0 bg-indigo-950 text-white z-10" onClick={() => requestSortSource("state")}>
                            <div className="flex items-center gap-1">
                              State <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        )}

                        {/* District column */}
                        {(sourceTableGroupLevel === "district" || sourceTableGroupLevel === "block") && (
                          <th className="p-1.5 px-2 border border-indigo-900 cursor-pointer hover:bg-indigo-900 sticky top-0 bg-indigo-950 text-white z-10" onClick={() => requestSortSource("district")}>
                            <div className="flex items-center gap-1">
                              District <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        )}

                        {/* Block column */}
                        {(sourceTableGroupLevel === "block") && (
                          <th className="p-1.5 px-2 border border-indigo-900 cursor-pointer hover:bg-indigo-900 sticky top-0 bg-indigo-950 text-white z-10" onClick={() => requestSortSource("block")}>
                            <div className="flex items-center gap-1">
                              Block / Tehsil <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        )}

                        <th className="p-1.5 px-2 border border-indigo-900 cursor-pointer hover:bg-indigo-950 sticky top-0 bg-indigo-950 text-white z-10" onClick={() => requestSortSource("aquiferName")}>
                          <div className="flex items-center gap-1">
                            Water Source <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-center w-20 border border-indigo-900 cursor-pointer hover:bg-indigo-900 sticky top-0 bg-indigo-950 text-white z-10" onClick={() => requestSortSource("count")}>
                          <div className="flex items-center justify-center gap-1">
                            No. <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-indigo-900 cursor-pointer hover:bg-indigo-900 sticky top-0 bg-indigo-950 text-white z-10" onClick={() => requestSortSource("min")}>
                          <div className="flex items-center justify-end gap-1">
                            Min ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-indigo-900 cursor-pointer hover:bg-indigo-900 sticky top-0 bg-indigo-950 text-white z-10" onClick={() => requestSortSource("p75")}>
                          <div className="flex items-center justify-end gap-1">
                            75%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-indigo-900 cursor-pointer hover:bg-indigo-900 sticky top-0 bg-indigo-950 text-white z-10" onClick={() => requestSortSource("p90")}>
                          <div className="flex items-center justify-end gap-1">
                            90%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-indigo-900 cursor-pointer hover:bg-indigo-900 sticky top-0 bg-indigo-950 text-white z-10" onClick={() => requestSortSource("p95")}>
                          <div className="flex items-center justify-end gap-1">
                            95%ile ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-indigo-900 cursor-pointer hover:bg-indigo-900 sticky top-0 bg-indigo-950 text-white z-10" onClick={() => requestSortSource("max")}>
                          <div className="flex items-center justify-end gap-1">
                            Max ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="p-1.5 px-2 text-right border border-indigo-900 cursor-pointer hover:bg-indigo-900 sticky top-0 bg-indigo-950 text-white z-10" onClick={() => requestSortSource("avg")}>
                          <div className="flex items-center justify-end gap-1">
                            Average ({activeParamConfig.unit}) <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        
                        {/* Dynamic columns representing Customizable Ranges */}
                        {customRangesLabels.map((rng, idx) => (
                          <th 
                            key={idx} 
                            className="p-1.5 px-2 text-center border border-indigo-900 cursor-pointer hover:bg-indigo-900 w-24 bg-indigo-950 sticky top-0 text-white z-10"
                            onClick={() => requestSortSource(`range_${idx}`)}
                          >
                            <div className="flex items-center justify-center gap-1">
                              No. (%) ({rng.label}) <ArrowUpDown className="w-3 h-3" />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white font-semibold text-slate-800">
                      {processedSourceList.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-[11px]">
                          <td className="p-1.5 px-2 text-center bg-slate-50/50 font-bold border border-slate-200 text-slate-800">{idx + 1}</td>
                          
                          {/* State cell */}
                          {(sourceTableGroupLevel === "state" || sourceTableGroupLevel === "district" || sourceTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.state}</td>
                          )}

                          {/* District cell */}
                          {(sourceTableGroupLevel === "district" || sourceTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.district}</td>
                          )}

                          {/* Block cell */}
                          {(sourceTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 text-slate-900 font-bold">{row.block}</td>
                          )}

                          <td className="p-1.5 px-2 border border-slate-200 font-black text-indigo-900">{row.aquiferName}</td>
                          <td className="p-1.5 px-2 text-center font-bold border border-slate-200 text-slate-850">{row.count}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.min, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p75, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p90, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.p95, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{row.count > 0 ? formatParamValue(row.max, selectedParam) : "-"}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-indigo-950 bg-indigo-50/30 font-bold">{row.count > 0 ? formatParamValue(row.avg, selectedParam) : "-"}</td>
                          
                          {/* Dynamic range columns rendering */}
                          {row.rangesPct.map((pct, rIdx) => {
                            // Highlight depending on threshold hazard or safety
                            let colorClass = "text-slate-800";
                            if (pct > 0) {
                              if (rIdx === 0) colorClass = "text-emerald-850 bg-emerald-50/30 font-bold"; // safe <= first threshold
                              else if (rIdx === row.rangesPct.length - 1) colorClass = "text-rose-850 bg-rose-50/30 font-black"; // hazard > last threshold
                              else colorClass = "text-amber-850 bg-amber-50/30 font-bold";
                            }
                            return (
                              <td key={rIdx} className={`p-1.5 px-2 text-center border border-slate-200 font-sans ${colorClass}`}>
                                {row.count > 0 ? `${row.rangesCount[rIdx]} (${pct.toFixed(1)}%)` : "-"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Grand Total Row */}
                      {sourceTotalRow && processedSourceList.length > 0 && (
                        <tr className="bg-slate-100/90 font-black text-slate-900 text-[11px] border-t-2 border-slate-300">
                          <td className="p-1.5 px-2 text-center bg-slate-150 border border-slate-200 font-bold">∑</td>
                          {(sourceTableGroupLevel === "state" || sourceTableGroupLevel === "district" || sourceTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                          )}
                          {(sourceTableGroupLevel === "district" || sourceTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                          )}
                          {(sourceTableGroupLevel === "block") && (
                            <td className="p-1.5 px-2 border border-slate-200 font-bold">-</td>
                          )}
                          <td className="p-1.5 px-2 border border-slate-200 text-indigo-950 font-bold uppercase">Grand Total (Scientifically Combined)</td>
                          <td className="p-1.5 px-2 text-center border border-slate-200 font-bold">{sourceTotalRow.count}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(sourceTotalRow.min, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(sourceTotalRow.p75, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(sourceTotalRow.p90, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(sourceTotalRow.p95, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-slate-800">{formatParamValue(sourceTotalRow.max, selectedParam)}</td>
                          <td className="p-1.5 px-2 text-right border border-slate-200 font-sans text-indigo-950 bg-indigo-50 font-bold">{formatParamValue(sourceTotalRow.avg, selectedParam)}</td>
                          {sourceTotalRow.rangesPct.map((pct, rIdx) => {
                            let colorClass = "text-slate-800";
                            if (pct > 0) {
                              if (rIdx === 0) colorClass = "text-emerald-850 bg-emerald-50/30 font-bold";
                              else if (rIdx === sourceTotalRow.rangesPct.length - 1) colorClass = "text-rose-850 bg-rose-50/30 font-black";
                              else colorClass = "text-amber-850 bg-amber-50/30 font-bold";
                            }
                            return (
                              <td key={rIdx} className={`p-1.5 px-2 text-center border border-slate-200 font-sans ${colorClass}`}>
                                {sourceTotalRow.rangesCount[rIdx]} ({pct.toFixed(1)}%)
                              </td>
                            );
                          })}
                        </tr>
                      )}
                      {processedSourceList.length === 0 && (
                        <tr>
                          <td colSpan={10 + customRangesLabels.length + (sourceTableGroupLevel === "state" ? 1 : sourceTableGroupLevel === "district" ? 2 : sourceTableGroupLevel === "block" ? 3 : 0)} className="p-8 text-center text-slate-600 font-black bg-slate-50 uppercase tracking-widest text-[10px]">
                            No records matched search string or column settings.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          )}


          {/* SUBTAB CONTENT 7: SEASONAL & MULTI-YEAR COMPARISON */}
          {activeSubTab === "comparison" && (
            <div className="glossy-panel rounded-3xl p-6 bg-white border border-slate-200 shadow-md space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <ArrowRightLeft className="w-4.5 h-4.5 text-indigo-600" /> Seasonal & YoY Trend Comparison Matrix
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 uppercase tracking-wide">
                    Compare Pre vs Post Monsoon groundwater profiles, or visualize long-term multi-year quality trends.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportComparisonExcel}
                    className="glossy-btn-indigo px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 text-white"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Comparison Excel
                  </button>
                </div>
              </div>

              {/* CONFIGURATION BAR */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-150 shadow-inner">
                {/* Mode Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-600" /> Analysis Mode
                  </label>
                  <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                    <button
                      onClick={() => setComparisonMode("seasonal")}
                      className={`flex-1 py-1 px-3 text-center text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                        comparisonMode === "seasonal"
                          ? "bg-white text-indigo-900 shadow-sm"
                          : "text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      Pre vs Post
                    </button>
                    <button
                      onClick={() => setComparisonMode("multiyear")}
                      className={`flex-1 py-1 px-3 text-center text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                        comparisonMode === "multiyear"
                          ? "bg-white text-indigo-900 shadow-sm"
                          : "text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      Multi-Year
                    </button>
                  </div>
                </div>

                {/* Grouping Level Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-emerald-600" /> Grouping Level
                  </label>
                  <select
                    value={comparisonGroupLevel}
                    onChange={(e) => setComparisonGroupLevel(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="all">Consolidated (All Combined)</option>
                    <option value="state">Group by State</option>
                    <option value="district">Group by District</option>
                    <option value="block">Group by Block / Tehsil</option>
                    <option value="source">Group by Water Source Type</option>
                    <option value="location">Individual Wells (Location Name)</option>
                  </select>
                </div>

                {/* Dynamic Period Selectors (Visible only in seasonal mode) */}
                {comparisonMode === "seasonal" ? (
                  <div className="flex gap-2 md:col-span-2">
                    <div className="flex-1 flex flex-col gap-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" /> Base Period (Pre)
                      </label>
                      <select
                        value={comparisonBasePeriod}
                        onChange={(e) => setComparisonBasePeriod(e.target.value)}
                        className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none"
                      >
                        {comparisonPeriods.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" /> Compare Period (Post)
                      </label>
                      <select
                        value={comparisonCompPeriod}
                        onChange={(e) => setComparisonCompPeriod(e.target.value)}
                        className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none"
                      >
                        {comparisonPeriods.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  /* Search Input in multiyear mode */
                  <div className="md:col-span-2 flex flex-col gap-1.5">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                      <Filter className="w-3.5 h-3.5 text-slate-500" /> Filter Locations
                    </label>
                    <input
                      type="text"
                      value={comparisonSearchText}
                      onChange={(e) => setComparisonSearchText(e.target.value)}
                      placeholder="Search state, district, block, location or source..."
                      className="w-full text-xs p-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* SEARCH BAR (For Seasonal mode only since config space is free) */}
              {comparisonMode === "seasonal" && (
                <div className="relative">
                  <input
                    type="text"
                    value={comparisonSearchText}
                    onChange={(e) => setComparisonSearchText(e.target.value)}
                    placeholder="Search state, district, block, location or source..."
                    className="w-full text-xs p-3 pl-10 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="absolute left-3.5 top-3.5 text-slate-400">
                    <Filter className="w-4 h-4" />
                  </div>
                </div>
              )}

              {/* STATS HIGHLIGHTS GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Card 1 */}
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 pointer-events-none">
                    <Calendar className="w-24 h-24 text-slate-900" />
                  </div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    {comparisonMode === "seasonal" ? `Base Period (${comparisonBasePeriod})` : "Total Time Series Years"}
                  </p>
                  <p className="text-xl font-sans font-black text-slate-700 mt-1 flex items-baseline gap-1.5">
                    {comparisonMode === "seasonal" ? (
                      <>
                        {comparisonStatsData.grandTotal?.baseAvg.toFixed(3)}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-normal">{activeParamConfig.unit}</span>
                      </>
                    ) : (
                      `${comparisonYearsList.length} Years`
                    )}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1.5 uppercase font-bold tracking-wide">
                    {comparisonMode === "seasonal" ? (
                      <>Exceedance Rate: <strong className="text-slate-700 font-black">{comparisonStatsData.grandTotal?.baseExceedPct.toFixed(1)}%</strong></>
                    ) : (
                      <>From {comparisonYearsList[0] || "N/A"} to {comparisonYearsList[comparisonYearsList.length - 1] || "N/A"}</>
                    )}
                  </p>
                </div>

                {/* Card 2 */}
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 pointer-events-none">
                    <Calendar className="w-24 h-24 text-slate-900" />
                  </div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    {comparisonMode === "seasonal" ? `Compare Period (${comparisonCompPeriod})` : "Dynamic Parameter Limit"}
                  </p>
                  <p className="text-xl font-sans font-black text-slate-700 mt-1 flex items-baseline gap-1.5">
                    {comparisonMode === "seasonal" ? (
                      <>
                        {comparisonStatsData.grandTotal?.compAvg.toFixed(3)}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-normal">{activeParamConfig.unit}</span>
                      </>
                    ) : (
                      <>
                        {activeParamConfig.b2 || activeParamConfig.b1}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-normal">{activeParamConfig.unit}</span>
                      </>
                    )}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1.5 uppercase font-bold tracking-wide">
                    {comparisonMode === "seasonal" ? (
                      <>Exceedance Rate: <strong className="text-slate-700 font-black">{comparisonStatsData.grandTotal?.compExceedPct.toFixed(1)}%</strong></>
                    ) : (
                      <>Standard limits configured by limits manager</>
                    )}
                  </p>
                </div>

                {/* Card 3 */}
                <div className={`border rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden transition-all duration-300 ${
                  comparisonMode === "seasonal"
                    ? (comparisonStatsData.grandTotal && comparisonStatsData.grandTotal.diffAvg < 0
                        ? "bg-emerald-50/55 border-emerald-200"
                        : "bg-rose-50/55 border-rose-200")
                    : "bg-indigo-50/55 border-indigo-200"
                }`}>
                  <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 pointer-events-none">
                    <TrendingUp className="w-24 h-24 text-slate-900" />
                  </div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    {comparisonMode === "seasonal" ? "Consolidated Shift Trend" : "Comparison Group Count"}
                  </p>
                  <p className="text-xl font-sans font-black text-slate-700 mt-1 flex items-baseline gap-1.5">
                    {comparisonMode === "seasonal" ? (
                      <>
                        {comparisonStatsData.grandTotal && comparisonStatsData.grandTotal.diffAvg > 0 ? "+" : ""}
                        {comparisonStatsData.grandTotal?.diffAvg.toFixed(3)}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-normal">({comparisonStatsData.grandTotal?.pctChangeAvg.toFixed(1)}%)</span>
                      </>
                    ) : (
                      `${processedComparisonList.length} Groups`
                    )}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1.5 uppercase font-bold tracking-wide">
                    {comparisonMode === "seasonal" ? (
                      comparisonStatsData.grandTotal && comparisonStatsData.grandTotal.diffAvg < 0 ? (
                        <span className="text-emerald-700 font-extrabold">Overall Quality Improved (Concentration Down)</span>
                      ) : (
                        <span className="text-rose-700 font-extrabold">Overall Quality Deteriorated (Concentration Up)</span>
                      )
                    ) : (
                      <>Grouped and calculated at {comparisonGroupLevel} level</>
                    )}
                  </p>
                </div>
              </div>

              {/* DATA TABLE WRAPPER */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-widest font-black select-none">
                      <th 
                        onClick={() => requestSortComparison("name")}
                        className="p-3 border-b border-slate-850 cursor-pointer hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          Region / Group Name
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>

                      {comparisonMode === "seasonal" ? (
                        <>
                          <th onClick={() => requestSortComparison("baseAvg")} className="p-3 border-b border-slate-850 text-right cursor-pointer hover:bg-slate-800 transition-colors">
                            <div className="flex items-center justify-end gap-1">Base Avg ({comparisonBasePeriod}) <ArrowUpDown className="w-3 h-3" /></div>
                          </th>
                          <th className="p-3 border-b border-slate-850 text-center">Base Exceed %</th>
                          <th onClick={() => requestSortComparison("compAvg")} className="p-3 border-b border-slate-850 text-right cursor-pointer hover:bg-slate-800 transition-colors">
                            <div className="flex items-center justify-end gap-1 font-black">Comp Avg ({comparisonCompPeriod}) <ArrowUpDown className="w-3 h-3" /></div>
                          </th>
                          <th className="p-3 border-b border-slate-850 text-center">Comp Exceed %</th>
                          <th onClick={() => requestSortComparison("diffAvg")} className="p-3 border-b border-slate-850 text-right cursor-pointer hover:bg-slate-800 transition-colors">
                            <div className="flex items-center justify-end gap-1">Absolute Diff <ArrowUpDown className="w-3 h-3" /></div>
                          </th>
                          <th onClick={() => requestSortComparison("pctChangeAvg")} className="p-3 border-b border-slate-850 text-center cursor-pointer hover:bg-slate-800 transition-colors">
                            <div className="flex items-center justify-center gap-1">% Change <ArrowUpDown className="w-3 h-3" /></div>
                          </th>
                          <th className="p-3 border-b border-slate-850 text-center">Trend Indicator</th>
                        </>
                      ) : (
                        <>
                          {comparisonYearsList.map(year => (
                            <React.Fragment key={year}>
                              <th onClick={() => requestSortComparison(`year_avg_${year}`)} className="p-3 border-b border-slate-850 text-right border-l border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors">
                                <div className="flex items-center justify-end gap-1">{year} Avg <ArrowUpDown className="w-3 h-3" /></div>
                              </th>
                              <th onClick={() => requestSortComparison(`year_exceed_${year}`)} className="p-3 border-b border-slate-850 text-center cursor-pointer hover:bg-slate-800 transition-colors">
                                <div className="flex items-center justify-center gap-1">{year} Exceed % <ArrowUpDown className="w-3 h-3" /></div>
                              </th>
                            </React.Fragment>
                          ))}
                          <th className="p-3 border-b border-slate-850 text-center border-l border-slate-800">YoY Trend Profile</th>
                        </>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {/* Render Group Rows */}
                    {processedComparisonList.map((row, idx) => {
                      const trendColorClass = row.trendClass === "improved" 
                        ? "bg-emerald-50/40 text-emerald-800 font-bold border-l-4 border-emerald-500" 
                        : row.trendClass === "deteriorated"
                        ? "bg-rose-50/40 text-rose-800 font-bold border-l-4 border-rose-500" 
                        : "text-slate-700 border-l-4 border-slate-200";

                      return (
                        <tr key={idx} className="hover:bg-slate-50 border-b border-slate-150 transition-all">
                          {/* Group Name */}
                          <td className={`p-2.5 px-3 text-xs font-black ${trendColorClass}`}>
                            {row.name}
                            <span className="block text-[8.5px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                              {comparisonGroupLevel === "district" && row.state}
                              {comparisonGroupLevel === "block" && `${row.state} › ${row.district}`}
                              {comparisonGroupLevel === "location" && `${row.state} › ${row.district} › ${row.block}`}
                              {comparisonGroupLevel === "source" && "Chemical Grouping"}
                              {comparisonGroupLevel === "state" && "Regional Boundary"}
                              {comparisonGroupLevel === "all" && "All Samples Consolidated"}
                            </span>
                          </td>

                          {comparisonMode === "seasonal" ? (
                            <>
                              {/* Base Average */}
                              <td className="p-2.5 px-3 text-right font-sans text-xs text-slate-800">
                                {row.baseCount > 0 ? formatParamValue(row.baseAvg, selectedParam) : "-"}
                                <span className="block text-[8px] text-slate-400 font-bold uppercase">{row.baseCount} samples</span>
                              </td>
                              {/* Base Exceedance */}
                              <td className="p-2.5 px-3 text-center font-sans text-xs font-bold text-slate-600">
                                {row.baseCount > 0 ? `${row.baseExceedPct.toFixed(1)}%` : "-"}
                              </td>
                              {/* Compare Average */}
                              <td className="p-2.5 px-3 text-right font-sans text-xs text-slate-900 bg-indigo-50/15">
                                {row.compCount > 0 ? formatParamValue(row.compAvg, selectedParam) : "-"}
                                <span className="block text-[8px] text-slate-400 font-bold uppercase">{row.compCount} samples</span>
                              </td>
                              {/* Compare Exceedance */}
                              <td className="p-2.5 px-3 text-center font-sans text-xs font-black text-slate-800 bg-indigo-50/15">
                                {row.compCount > 0 ? `${row.compExceedPct.toFixed(1)}%` : "-"}
                              </td>
                              {/* Absolute Difference */}
                              <td className={`p-2.5 px-3 text-right font-sans text-xs font-extrabold ${row.diffAvg < 0 ? "text-emerald-700" : row.diffAvg > 0 ? "text-rose-700" : "text-slate-500"}`}>
                                {row.baseCount > 0 && row.compCount > 0 ? (row.diffAvg > 0 ? `+${formatParamValue(row.diffAvg, selectedParam)}` : formatParamValue(row.diffAvg, selectedParam)) : "-"}
                              </td>
                              {/* % Change */}
                              <td className={`p-2.5 px-3 text-center font-sans text-xs font-black ${row.pctChangeAvg < 0 ? "text-emerald-700 bg-emerald-50/10" : row.pctChangeAvg > 0 ? "text-rose-700 bg-rose-50/10" : "text-slate-500"}`}>
                                {row.baseCount > 0 && row.compCount > 0 ? `${row.pctChangeAvg > 0 ? "+" : ""}${row.pctChangeAvg.toFixed(1)}%` : "-"}
                              </td>
                              {/* Trend Indicator badge */}
                              <td className="p-2.5 px-3 text-center">
                                {row.baseCount > 0 && row.compCount > 0 ? (
                                  row.trendClass === "improved" ? (
                                    <span className="inline-block text-[8.5px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">Improved</span>
                                  ) : row.trendClass === "deteriorated" ? (
                                    <span className="inline-block text-[8.5px] bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">Deteriorated</span>
                                  ) : (
                                    <span className="inline-block text-[8.5px] bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">Stable</span>
                                  )
                                ) : (
                                  <span className="inline-block text-[8px] bg-slate-50 text-slate-400 px-2 py-0.5 rounded font-bold uppercase">No Pairs</span>
                                )}
                              </td>
                            </>
                          ) : (
                            <>
                              {comparisonYearsList.map(year => {
                                const ys = row.yearlyStats[year];
                                return (
                                  <React.Fragment key={year}>
                                    {/* Year Average */}
                                    <td className="p-2.5 px-3 text-right font-sans text-xs border-l border-slate-100 text-slate-850">
                                      {ys?.count > 0 ? formatParamValue(ys.avg, selectedParam) : "-"}
                                      <span className="block text-[7.5px] text-slate-400 font-bold uppercase">{ys?.count || 0} spls</span>
                                    </td>
                                    {/* Year Exceedance */}
                                    <td className="p-2.5 px-3 text-center font-sans text-xs text-slate-600 font-bold">
                                      {ys?.count > 0 ? `${ys.exceedPct.toFixed(1)}%` : "-"}
                                    </td>
                                  </React.Fragment>
                                );
                              })}
                              {/* Multi-Year Trend assessment badge */}
                              <td className="p-2.5 px-3 text-center border-l border-slate-100">
                                {row.multiYearTrend === "improving" ? (
                                  <span className="inline-block text-[8.5px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">Improving</span>
                                ) : row.multiYearTrend === "deteriorating" ? (
                                  <span className="inline-block text-[8.5px] bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">Deteriorating</span>
                                ) : row.multiYearTrend === "stable" ? (
                                  <span className="inline-block text-[8.5px] bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">Stable</span>
                                ) : (
                                  <span className="inline-block text-[8.5px] bg-slate-50 text-slate-400 px-2 py-1 rounded font-black uppercase tracking-wider">No Trend</span>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}

                    {/* Scientific Grand Total Row */}
                    {processedComparisonList.length > 0 && comparisonStatsData.grandTotal && (
                      <tr className="bg-slate-50 border-t border-slate-200 font-black">
                        <td className="p-3 text-xs font-black text-slate-800 uppercase tracking-widest border-l-4 border-indigo-650">
                          Consolidated Grand Total
                          <span className="block text-[8px] text-slate-400 font-black tracking-normal uppercase mt-0.5">Weighted Chemical Analytics</span>
                        </td>

                        {comparisonMode === "seasonal" ? (
                          <>
                            {/* Base Average */}
                            <td className="p-3 text-right font-sans text-xs text-indigo-950">
                              {formatParamValue(comparisonStatsData.grandTotal.baseAvg, selectedParam)}
                              <span className="block text-[7.5px] text-slate-400 font-black uppercase">{comparisonStatsData.grandTotal.baseCount} samples</span>
                            </td>
                            {/* Base Exceedance */}
                            <td className="p-3 text-center font-sans text-xs text-slate-800">
                              {comparisonStatsData.grandTotal.baseExceedPct.toFixed(1)}%
                            </td>
                            {/* Compare Average */}
                            <td className="p-3 text-right font-sans text-xs text-indigo-950 bg-indigo-50/20">
                              {formatParamValue(comparisonStatsData.grandTotal.compAvg, selectedParam)}
                              <span className="block text-[7.5px] text-slate-400 font-black uppercase">{comparisonStatsData.grandTotal.compCount} samples</span>
                            </td>
                            {/* Compare Exceedance */}
                            <td className="p-3 text-center font-sans text-xs text-slate-800 bg-indigo-50/20">
                              {comparisonStatsData.grandTotal.compExceedPct.toFixed(1)}%
                            </td>
                            {/* Absolute Difference */}
                            <td className={`p-3 text-right font-sans text-xs font-extrabold ${comparisonStatsData.grandTotal.diffAvg < 0 ? "text-emerald-850" : "text-rose-800"}`}>
                              {comparisonStatsData.grandTotal.diffAvg > 0 ? "+" : ""}{formatParamValue(comparisonStatsData.grandTotal.diffAvg, selectedParam)}
                            </td>
                            {/* % Change */}
                            <td className={`p-3 text-center font-sans text-xs font-black ${comparisonStatsData.grandTotal.pctChangeAvg < 0 ? "text-emerald-800 bg-emerald-50/10" : "text-rose-800 bg-rose-50/10"}`}>
                              {comparisonStatsData.grandTotal.pctChangeAvg > 0 ? "+" : ""}{comparisonStatsData.grandTotal.pctChangeAvg.toFixed(1)}%
                            </td>
                            {/* Overall classification badge */}
                            <td className="p-3 text-center">
                              {comparisonStatsData.grandTotal.pctChangeAvg < -5 ? (
                                <span className="inline-block text-[8.5px] bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-black uppercase tracking-wider">Improved</span>
                              ) : comparisonStatsData.grandTotal.pctChangeAvg > 5 ? (
                                <span className="inline-block text-[8.5px] bg-rose-100 text-rose-800 px-3 py-1 rounded-full font-black uppercase tracking-wider">Deteriorated</span>
                              ) : (
                                <span className="inline-block text-[8.5px] bg-slate-150 text-slate-600 px-3 py-1 rounded-full font-black uppercase tracking-wider">Stable</span>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            {comparisonYearsList.map(year => {
                              const tys = comparisonStatsData.grandTotal?.yearlyStats[year];
                              return (
                                <React.Fragment key={year}>
                                  {/* Year Average */}
                                  <td className="p-3 text-right font-sans text-xs border-l border-slate-100 text-slate-900">
                                    {tys && tys.count > 0 ? formatParamValue(tys.avg, selectedParam) : "-"}
                                    <span className="block text-[7px] text-slate-400 font-bold uppercase">{tys?.count || 0} spls</span>
                                  </td>
                                  {/* Year Exceedance */}
                                  <td className="p-3 text-center font-sans text-xs text-slate-700">
                                    {tys && tys.count > 0 ? `${tys.exceedPct.toFixed(1)}%` : "-"}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                            <td className="p-3 text-center border-l border-slate-100 text-slate-400 text-[10px]">-</td>
                          </>
                        )}
                      </tr>
                    )}

                    {processedComparisonList.length === 0 && (
                      <tr>
                        <td colSpan={25} className="p-12 text-center text-slate-450 bg-slate-50 uppercase tracking-widest text-xs font-black">
                          No analytical comparison available. Please upload records with Year/Season values in the workspace.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </>
      )}

    </div>
  );
}
