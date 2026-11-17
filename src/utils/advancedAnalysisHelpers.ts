import { DataHeaders } from "../types";
import { PARAM_CONFIG } from "../data/config";
import { safeMin, safeMax } from "./math";

export type AdvancedSubTab =
  | "frequency"
  | "depth"
  | "aquifer"
  | "aquiferTapped"
  | "stageExtraction"
  | "source"
  | "comparison"
  | "biplots"
  | "correlation";

export type AdvancedBiplotType = "na-cl" | "ca-so4" | "ec-nasratio" | "cams-hco3so4";
export type AdvancedBiplotColorBy = "district" | "block" | "season" | "aquifer";
export type AdvancedGroupLevel = "all" | "state" | "district" | "block";
export type AdvancedComparisonGroupLevel = "all" | "state" | "district" | "block" | "source" | "location";

export const VIRTUAL_PARAM_CONFIGS: Record<string, { b1: number; b2: number; unit: string; name: string }> = {
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

export const getRowStateValue = (row: Record<string, unknown>, headers: DataHeaders): string => {
  const col = headers.state;
  if (col && row[col] !== undefined && row[col] !== null) return String(row[col]).trim();
  const fallbackKey = Object.keys(row).find(k =>
    ["state", "st_name", "state_name", "state name"].includes(k.toLowerCase().trim())
  );
  return fallbackKey ? String(row[fallbackKey]).trim() : "";
};

export const getRowDistrictValue = (row: Record<string, unknown>, headers: DataHeaders): string => {
  const col = headers.district;
  if (col && row[col] !== undefined && row[col] !== null) return String(row[col]).trim();
  const fallbackKey = Object.keys(row).find(k =>
    ["district", "dist", "dst_name", "district_name", "district name"].includes(k.toLowerCase().trim())
  );
  return fallbackKey ? String(row[fallbackKey]).trim() : "";
};

export const getRowBlockValue = (row: Record<string, unknown>, headers: DataHeaders): string => {
  const col = headers.block;
  if (col && row[col] !== undefined && row[col] !== null) return String(row[col]).trim();
  const fallbackKey = Object.keys(row).find(k =>
    ["block", "tehsil", "taluk", "subdistrict", "sub-district", "block_name", "block name"].includes(k.toLowerCase().trim())
  );
  return fallbackKey ? String(row[fallbackKey]).trim() : "";
};

export const getSmartStepAndMax = (param: string): { step: string; max: string } => {
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

export interface CorrelationResultItem {
  paramCode: string;
  paramName: string;
  originalHeader: string;
  r: number;
  rSquared: number;
  count: number;
  direction: "positive" | "negative";
  strength: string;
}

export function computeCorrelationResults(
  analyzedData: Record<string, any>[],
  target: string,
  headers: DataHeaders,
  headerMap: Record<string, string>
): CorrelationResultItem[] {
  if (!analyzedData || analyzedData.length === 0 || !target) return [];

  const targetCol = headers.params.find(p => p === target || headerMap[p] === target) || target;
  const results: CorrelationResultItem[] = [];

  headers.params.forEach(col => {
    if (col === targetCol) return;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    let n = 0;

    analyzedData.forEach(row => {
      const xVal = row[targetCol];
      const yVal = row[col];
      if (xVal !== undefined && xVal !== null && yVal !== undefined && yVal !== null) {
        const x = parseFloat(xVal);
        const y = parseFloat(yVal);
        if (!isNaN(x) && !isNaN(y)) {
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumX2 += x * x;
          sumY2 += y * y;
          n++;
        }
      }
    });

    if (n >= 5) {
      const numerator = n * sumXY - sumX * sumY;
      const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
      if (denominator !== 0) {
        const r = numerator / denominator;
        const rSquared = r * r;
        const absR = Math.abs(r);

        let strength = "none";
        if (absR >= 0.8) strength = "very_strong";
        else if (absR >= 0.6) strength = "strong";
        else if (absR >= 0.4) strength = "moderate";
        else if (absR >= 0.2) strength = "weak";

        const standardCode = headerMap[col] || col;
        const conf = PARAM_CONFIG[standardCode] || VIRTUAL_PARAM_CONFIGS[standardCode] || { name: col };

        results.push({
          paramCode: standardCode,
          paramName: conf.name || col,
          originalHeader: col,
          r,
          rSquared,
          count: n,
          direction: r >= 0 ? "positive" : "negative",
          strength
        });
      }
    }
  });

  return results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

export interface RegressionDetailsResult {
  points: { x: number; y: number; wellId: string; block: string; district: string }[];
  slope: number;
  intercept: number;
  rSquared: number;
  regressionLine: number[][];
  n: number;
  minX: number;
  maxX: number;
}

export function computeRegressionDetails(
  analyzedData: Record<string, any>[],
  target: string,
  compareCol: string,
  headers: DataHeaders,
  headerMap: Record<string, string>
): RegressionDetailsResult | null {
  if (!compareCol || !analyzedData || analyzedData.length === 0) return null;

  const targetCol = headers.params.find(p => p === target || headerMap[p] === target) || target;
  const points: { x: number; y: number; wellId: string; block: string; district: string }[] = [];
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let n = 0;

  analyzedData.forEach(row => {
    const xValStr = row[targetCol];
    const yValStr = row[compareCol];
    if (xValStr !== undefined && xValStr !== null && yValStr !== undefined && yValStr !== null) {
      const x = parseFloat(xValStr);
      const y = parseFloat(yValStr);
      if (!isNaN(x) && !isNaN(y)) {
        points.push({
          x,
          y,
          wellId: row[headers.wellId || ""] || row["well_id"] || "N/A",
          block: getRowBlockValue(row, headers) || "N/A",
          district: getRowDistrictValue(row, headers) || "N/A"
        });
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        sumY2 += y * y;
        n++;
      }
    }
  });

  if (n < 3) return null;

  const meanX = sumX / n;
  const meanY = sumY / n;

  const numerator = n * sumXY - sumX * sumY;
  const denominatorX = n * sumX2 - sumX * sumX;

  let slope = 0;
  let intercept = 0;
  if (denominatorX !== 0) {
    slope = numerator / denominatorX;
    intercept = meanY - slope * meanX;
  }

  const denominatorY = n * sumY2 - sumY * sumY;
  let rSquared = 0;
  if (denominatorX !== 0 && denominatorY !== 0) {
    const r = numerator / Math.sqrt(denominatorX * denominatorY);
    rSquared = r * r;
  }

  const xValues = points.map(p => p.x);
  const minX = safeMin(xValues);
  const maxX = safeMax(xValues);
  const regressionLine = [
    [minX, slope * minX + intercept],
    [maxX, slope * maxX + intercept]
  ];

  return {
    points,
    slope,
    intercept,
    rSquared,
    regressionLine,
    n,
    minX,
    maxX
  };
}
