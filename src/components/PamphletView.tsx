import React, { useState, useEffect } from "react";
import { DataHeaders, ExceedingLocationItem } from "../types";
import { PARAM_CONFIG, ALL_REMEDIAL_MEASURES } from "../data/config";
import { getStats } from "../utils/math";
import { generateParamDonutChart } from "../utils/chartHelpers";
import { downloadMhtmlWordDoc } from "../utils/export";
import {
  FileCheck2,
  FileDown,
  ChevronDown,
  LayoutTemplate,
  AlertCircle,
  Map,
  ShieldCheck,
  PlusCircle,
  Sparkles,
  Droplets,
  Sprout,
  Globe
} from "lucide-react";

function darkenColor(hex: string, percent = 30): string {
  if (!hex || hex.length < 6) return "#1e293b";
  let cleanHex = hex.replace("#", "");
  if (cleanHex.length === 3) {
    cleanHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
  }
  const num = parseInt(cleanHex, 16);
  let r = (num >> 16);
  let g = ((num >> 8) & 0x00FF);
  let b = (num & 0x0000FF);

  r = Math.max(0, Math.min(255, Math.round(r * (1 - percent / 100))));
  g = Math.max(0, Math.min(255, Math.round(g * (1 - percent / 100))));
  b = Math.max(0, Math.min(255, Math.round(b * (1 - percent / 100))));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

interface PamphletViewProps {
  rawData: any[];
  headers: DataHeaders;
  headerMap: Record<string, string>;
  selectedState: string;
  selectedDistrict: string;
}

export default function PamphletView({
  rawData,
  headers,
  headerMap,
  selectedState,
  selectedDistrict,
}: PamphletViewProps) {
  const [selectedPamphletParams, setSelectedPamphletParams] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Filter out Na, K, HCO3, CO3 from pamphlet parameter list (parameters without BIS limits)
  const availableParams = React.useMemo(() => {
    if (!headers || !headers.params) return [];
    return headers.params.filter(p => {
      const paramId = headerMap[p] || p;
      return !["Na", "K", "HCO3", "CO3"].includes(paramId);
    });
  }, [headers, headerMap]);

  // Custom uploaded maps
  const [ecMapBase64, setEcMapBase64] = useState<string | null>(null);
  const [summaryMapBase64, setSummaryMapBase64] = useState<string | null>(null);

  // Generated document state
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [pamphletHtml, setPamphletHtml] = useState("");

  useEffect(() => {
    if (availableParams.length > 0) {
      setSelectedPamphletParams([...availableParams]);
    } else {
      setSelectedPamphletParams([]);
    }
  }, [availableParams]);

  const handleSelectAll = () => {
    if (selectedPamphletParams.length === availableParams.length) {
      setSelectedPamphletParams([]);
    } else {
      setSelectedPamphletParams([...availableParams]);
    }
  };

  const handleToggleParam = (val: string) => {
    if (selectedPamphletParams.includes(val)) {
      setSelectedPamphletParams(selectedPamphletParams.filter((p) => p !== val));
    } else {
      setSelectedPamphletParams([...selectedPamphletParams, val]);
    }
  };

  const handleMapUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "ec" | "summary") => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          if (type === "ec") setEcMapBase64(evt.target.result as string);
          else setSummaryMapBase64(evt.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!rawData.length) return;
    if (selectedPamphletParams.length === 0) return;

    setIsGenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 100)); // allow spin lock

    try {
      // 1. Filter Data
      let filtered = rawData;
      let regionName = "India";
      let stateNameStr = "National Summary";

      if (selectedState) {
        filtered = filtered.filter(
          (d) => String(d[headers.state || ""] || "").trim() === selectedState
        );
        regionName = selectedState;
        stateNameStr = "State Analysis";
      }
      if (selectedDistrict) {
        filtered = filtered.filter(
          (d) => String(d[headers.district || ""] || "").trim() === selectedDistrict
        );
        regionName = selectedDistrict;
        stateNameStr = selectedState;
      }

      const districtRegionStr = regionName.toLowerCase().includes("district")
        ? regionName
        : `${regionName} District`;

      const totalSamples = filtered.length;
      const heavyMetalsList = ["Fe", "Mn", "As", "U", "Zn", "Cu", "Pb", "Cd", "Cr", "Hg", "Ni", "Se", "Ba", "Al", "B", "Mo"];

      // 2. Compute compliance metrics
      let safeSamplesCount = 0;
      let singleExceedanceCount = 0;
      let multiExceedanceCount = 0;
      
      interface LocalParamStat {
        key: string;
        name: string;
        count: number;
        total: number;
        pct: number;
        isHeavyMetal: boolean;
        minVal: number | null;
        maxVal: number | null;
        sumVal: number;
        avgVal: number | null;
      }

      const globalParamStats: LocalParamStat[] = selectedPamphletParams.map((paramCol) => {
        const configKey = headerMap[paramCol];
        return {
          key: configKey,
          name: PARAM_CONFIG[configKey]?.name || paramCol,
          count: 0,
          total: 0,
          pct: 0,
          isHeavyMetal: heavyMetalsList.includes(configKey),
          minVal: null,
          maxVal: null,
          sumVal: 0,
          avgVal: null,
        };
      });

      filtered.forEach((row) => {
        let exceedancesForThisSample = 0;

        globalParamStats.forEach((pStat) => {
          const originalHeader = Object.keys(headerMap).find(
            (k) => headerMap[k] === pStat.key && availableParams.includes(k)
          );
          if (!originalHeader) return;

          const val = parseFloat(row[originalHeader]);
          if (!isNaN(val)) {
            pStat.total++;
            pStat.minVal = pStat.minVal === null ? val : Math.min(pStat.minVal, val);
            pStat.maxVal = pStat.maxVal === null ? val : Math.max(pStat.maxVal, val);
            pStat.sumVal += val;

            const config = PARAM_CONFIG[pStat.key];
            const isSingleLimit = config.b1 === config.b2 && pStat.key !== "pH";
            const limit = pStat.key === "pH" ? null : isSingleLimit ? config.b1 : config.b2;

            if (pStat.key === "pH") {
              if (val < config.b1 || val > config.b2) {
                exceedancesForThisSample++;
                pStat.count++;
              }
            } else if (limit !== null) {
              if (val > limit) {
                exceedancesForThisSample++;
                pStat.count++;
              }
            }
          }
        });

        if (exceedancesForThisSample === 0) safeSamplesCount++;
        else if (exceedancesForThisSample === 1) singleExceedanceCount++;
        else multiExceedanceCount++;
      });

      // 3. Compile compliance pie donut
      const summaryChartData = [
        ...(safeSamplesCount > 0 ? [{ name: "All Parameters Within Safe Limits", y: safeSamplesCount, color: "#10b981" }] : []),
        ...(singleExceedanceCount > 0 ? [{ name: "One Parameter Exceeds Limit", y: singleExceedanceCount, color: "#f59e0b" }] : []),
        ...(multiExceedanceCount > 0 ? [{ name: "More Than One Parameter Exceeds Limit", y: multiExceedanceCount, color: "#f43f5e" }] : []),
      ];

      // Draw high resolution 3D Pie Donut chart inside memory with light theme styling (dark labels) for transparent background integration
      const summaryChartImageBase64 = await generateParamDonutChart(
        "Overall Sample Compliance Distribution",
        summaryChartData,
        false
      );

      globalParamStats.forEach((p) => {
        p.pct = p.total > 0 ? (p.count / p.total) * 100 : 0;
        p.avgVal = p.total > 0 ? p.sumVal / p.total : null;
      });

      globalParamStats.sort((a, b) => b.pct - a.pct);
      const exceedingParamsInfo = globalParamStats.filter((p) => p.count > 0);
      const topExceeding = exceedingParamsInfo.slice(0, 6);
      const topParamNamesStr = topExceeding.map((p) => `${p.name} (${p.key})`).join(", ");

      const formatStatVal = (v: number | null) => {
        if (v === null || isNaN(v)) return "-";
        if (Math.abs(v) < 0.001 && v !== 0) return v.toFixed(4);
        if (Math.abs(v) < 0.1 && v !== 0) return v.toFixed(3);
        return v.toFixed(2);
      };

      const parameterSummaryRowsHTML = globalParamStats
        .map((pStat, idx) => {
          const isExceeding = pStat.count > 0;
          const badgeBg = isExceeding ? "#fff1f2" : "#f0fdf4";
          const badgeText = isExceeding ? "#e11d48" : "#059669";
          const cfg = PARAM_CONFIG[pStat.key];
          const unitStr = cfg?.unit ? ` (${cfg.unit})` : "";

          return `
            <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px; line-height: 1.1;">
              <td style="padding: 3px 6px; text-align: center; color: #475569; font-weight: bold; border: 1px solid #cbd5e1; width: 35px;">${idx + 1}</td>
              <td style="padding: 3px 6px; color: #1e293b; font-weight: bold; border: 1px solid #cbd5e1;">${pStat.name} (${pStat.key})${unitStr}</td>
              <td style="padding: 3px 6px; text-align: center; color: #334155; font-weight: 600; border: 1px solid #cbd5e1;">${pStat.total}</td>
              <td style="padding: 3px 6px; text-align: center; color: #0f172a; font-weight: 600; border: 1px solid #cbd5e1; background-color: #f8fafc;">${formatStatVal(pStat.minVal)}</td>
              <td style="padding: 3px 6px; text-align: center; color: #0f172a; font-weight: 600; border: 1px solid #cbd5e1; background-color: #f8fafc;">${formatStatVal(pStat.maxVal)}</td>
              <td style="padding: 3px 6px; text-align: center; color: #0f172a; font-weight: 700; border: 1px solid #cbd5e1; background-color: #f1f5f9;">${formatStatVal(pStat.avgVal)}</td>
              <td style="padding: 3px 6px; text-align: center; color: ${badgeText}; font-weight: 800; border: 1px solid #cbd5e1; background-color: ${badgeBg};">${pStat.count}</td>
              <td style="padding: 3px 6px; text-align: center; color: ${badgeText}; font-weight: 800; border: 1px solid #cbd5e1; background-color: ${badgeBg};">${pStat.pct.toFixed(2)}%</td>
            </tr>
          `;
        })
        .join("");

      const parameterSummaryTableSectionHTML = `
        <div style="margin-bottom: 30px; page-break-inside: avoid;">
          <h3 style="font-size: 18px; font-weight: 900; color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin: 0 0 12px 0;">
            Parameter-Wise Groundwater Quality Compliance & Exceedance Summary
          </h3>

          <div style="overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 10px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);">
            <table style="width: 100%; border-collapse: collapse; text-align: left; background-color: #ffffff;">
              <thead style="background-color: #f1f5f9; color: #1e293b; font-weight: bold; font-size: 10.5px; text-transform: uppercase;">
                <tr>
                  <th style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center; width: 35px;">Sl. No.</th>
                  <th style="padding: 5px 6px; border: 1px solid #cbd5e1;">Parameters</th>
                  <th style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center;">Samples Analysed</th>
                  <th style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center; background-color: #e2e8f0;">Min</th>
                  <th style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center; background-color: #e2e8f0;">Max</th>
                  <th style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center; background-color: #cbd5e1;">Average</th>
                  <th style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center;">Samples Exceeding Limit</th>
                  <th style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center;">% Exceeding Limit</th>
                </tr>
              </thead>
              <tbody>
                ${parameterSummaryRowsHTML}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // 4. Construct descriptive executive templates
      const safePct = totalSamples > 0 ? ((safeSamplesCount / totalSamples) * 100).toFixed(2) : "0.00";
      const singlePct = totalSamples > 0 ? ((singleExceedanceCount / totalSamples) * 100).toFixed(2) : "0.00";
      const multiPct = totalSamples > 0 ? ((multiExceedanceCount / totalSamples) * 100).toFixed(2) : "0.00";

      let textPara1 = `A comprehensive groundwater quality assessment was carried out for <strong>${districtRegionStr}</strong> based on the analysis of <strong>${totalSamples}</strong> groundwater samples collected from various blocks and habitations. The study evaluated major physicochemical parameters and heavy metals to assess the suitability of groundwater for drinking purposes as per BIS IS 10500 standards. The results indicate that groundwater quality in the region is influenced by both natural geological conditions and anthropogenic activities such as intensive agriculture, excessive groundwater extraction, and improper waste disposal.`;

      let textParaCompliance = `Evaluating overall sample integrity against the selected parameters, <strong>${safeSamplesCount} out of ${totalSamples} samples (${safePct}%)</strong> were found to be completely safe, with all parameters remaining strictly within permissible limits. `;
      if (singleExceedanceCount > 0 || multiExceedanceCount > 0) {
        textParaCompliance += `Conversely, <strong>${singleExceedanceCount} samples (${singlePct}%)</strong> exceeded the limit for one water quality parameter, highlighting localized or parameter-specific issues. More critically, <strong>${multiExceedanceCount} samples (${multiPct}%)</strong> exhibited simultaneous exceedances in more than one parameter, indicating complex contamination profiles that require robust, holistic water treatment interventions.`;
      }

      let textPara2 = "A detailed evaluation of specific parameters reveals varying degrees of hydrochemical compliance. ";
      if (exceedingParamsInfo.length > 0) {
        textPara2 += `Specifically, <strong>${topParamNamesStr}</strong> exceeded permissible limits in multiple locations. `;
        const explanations: string[] = [];
        topExceeding.forEach((p) => {
          const reason =
            p.key === "NO3"
              ? "excessive fertilizer use, septic tank leakage, and organic waste infiltration"
              : p.key === "F" || p.key === "U" || p.key === "As"
              ? "natural geogenic sources and water-rock interactions"
              : ["EC", "TDS", "Cl", "TH", "Ca", "Mg", "Na"].includes(p.key)
              ? "salinity intrusion, mineral dissolution, and agricultural runoff"
              : "various geogenic and anthropogenic factors";
          explanations.push(
            `<strong>${p.name}</strong> was elevated in <strong>${p.pct.toFixed(1)}%</strong> of the samples (primarily linked to ${reason})`
          );
        });
        textPara2 += explanations.join("; ") + ". ";
      } else {
        textPara2 += "All analyzed physical and chemical parameters remained strictly within the safe permissible limits prescribed by BIS standards, indicating no specific single-parameter anomalies. ";
      }

      // Heavy metals
      const heavyMetalsAnalyzed = globalParamStats.filter((p) => p.isHeavyMetal);
      const exceedingHeavyMetals = heavyMetalsAnalyzed.filter((p) => p.count > 0);
      const safeHeavyMetals = heavyMetalsAnalyzed.filter((p) => p.count === 0);

      let textParaHeavy = "";
      if (heavyMetalsAnalyzed.length > 0) {
        if (exceedingHeavyMetals.length > 0) {
          const exMetalsStr = exceedingHeavyMetals.map((p) => `${p.name} (${p.pct.toFixed(1)}%)`).join(", ");
          textParaHeavy = `Regarding trace and heavy metal contamination, the analysis indicates significant concerns in specific areas. Toxic metals such as <strong>${exceedingHeavyMetals.map((p) => p.name).join(", ")}</strong> exceeded permissible limits. Specifically, exceedances were observed in ${exMetalsStr} of the analyzed samples. The presence of these heavy metals in groundwater is primarily attributed to geogenic processes, water-rock interactions, and potentially localized anthropogenic discharges. Prolonged consumption of such contaminated water poses severe public health risks, necessitating immediate intervention and the provision of alternate safe drinking water sources. `;
          if (safeHeavyMetals.length > 0) {
            textParaHeavy += `Conversely, other heavy metals including ${safeHeavyMetals
              .slice(0, 5)
              .map((p) => p.name)
              .join(", ")} were found to be safely within acceptable limits.`;
          }
        } else {
          textParaHeavy = `Regarding trace and heavy metal contamination, a comprehensive evaluation of toxic metals (including ${heavyMetalsAnalyzed
            .slice(0, 6)
            .map((p) => p.name)
            .join(", ")}) revealed that all analyzed samples remained well within the safe limits prescribed by the BIS standards. This indicates the absence of significant heavy metal pollution in the monitored locations, ensuring that the water is free from these specific toxicological health risks.`;
        }
      }

      // Single comprehensive paragraph summarizing all parameters
      const unifiedParametersParagraphHTML = `
        <div style="margin-bottom: 30px; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 16px; padding: 22px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);">
          <h3 style="font-size: 18px; font-weight: 900; color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin: 0 0 14px 0;">
            Comprehensive Parameter Hydrochemical & Heavy Metal Assessment
          </h3>
          <p style="color: #334155; font-size: 14px; line-height: 1.65; margin: 0; text-align: justify;">
            ${textPara1} ${textParaCompliance} ${textPara2} ${textParaHeavy}
          </p>
        </div>
      `;

      // 5. Build parameterized cards HTML
      let basicCardsHTML = "";
      let heavyCardsHTML = "";

      for (let i = 0; i < selectedPamphletParams.length; i++) {
        const paramCol = selectedPamphletParams[i];
        const configKey = headerMap[paramCol];
        const config = PARAM_CONFIG[configKey];
        if (!config) continue;

        const isSingleLimit = config.b1 === config.b2 && configKey !== "pH";
        const limitStr =
          configKey === "pH"
            ? `${config.b1}-${config.b2}`
            : `${isSingleLimit ? config.b1 : config.b2} ${config.unit}`;
        const checkLimit = configKey === "pH" ? null : isSingleLimit ? config.b1 : config.b2;

        const vals: number[] = [];
        let exceedCount = 0;
        const exceedingLocationsSet = new Set<string>();

        filtered.forEach((row) => {
          const v = parseFloat(row[paramCol]);
          if (!isNaN(v)) {
            vals.push(v);
            let isExceeding = false;
            if (configKey === "pH") {
              if (v < config.b1 || v > config.b2) isExceeding = true;
            } else if (checkLimit !== null) {
              if (v > checkLimit) isExceeding = true;
            }

            if (isExceeding) {
              exceedCount++;
              const blockName = String(row[headers.block || ""] || "").trim();
              const locName = String(row[headers.location || ""] || "").trim();
              
              let strVal = "";
              if (locName && locName !== "Unknown" && blockName && blockName !== "Unknown") {
                strVal = `${locName} (${blockName})`;
              } else if (locName && locName !== "Unknown") {
                strVal = locName;
              } else if (blockName && blockName !== "Unknown") {
                strVal = `${blockName} (Block)`;
              }

              if (strVal) exceedingLocationsSet.add(strVal);
            }
          }
        });

        if (vals.length === 0) continue;

        const stats = getStats(vals);
        const exceedPct = ((exceedCount / vals.length) * 100).toFixed(1);
        const isSafe = exceedCount === 0;

        let specificInsight = "";
        if (configKey === "pH") specificInsight = "suggesting potential acidic or alkaline concerns affecting water taste and pipe corrosion.";
        if (configKey === "EC" || configKey === "TDS") specificInsight = "indicating salinity buildup due to mineral dissolution, saline intrusion, agricultural runoff, and intensive exploitation.";
        if (configKey === "Cl") specificInsight = "Elevated chloride imparts a salty taste and indicates groundwater salinization.";
        if (configKey === "F") specificInsight = "Long-term consumption of excess fluoride may lead to dental and skeletal fluorosis.";
        if (configKey === "SO4") specificInsight = "High sulphate may cause laxative effects and impart a bitter taste to the water.";
        if (configKey === "NO3") specificInsight = "Elevated nitrate concentration mainly reflects agricultural contamination caused by excessive fertilizer use and sanitation seeps.";
        if (configKey === "TH") specificInsight = "Very hard groundwater is mainly caused by elevated calcium and magnesium concentrations resulting from dissolution of carbonate rocks.";
        if (configKey === "Ca" || configKey === "Mg") specificInsight = `Elevated ${config.name.toLowerCase()} contributes significantly to groundwater hardness in the district.`;
        if (configKey === "Mn") specificInsight = "Long-term manganese exposure may affect neurological health and water aesthetics.";
        if (configKey === "U") specificInsight = "Elevated uranium is generally associated with granitic rock formations, alkaline levels, and water-rock interactions.";
        if (configKey === "As") specificInsight = "Arsenic is highly toxic and its presence is mainly geogenic, requiring immediate remediation.";

        const exceedingList = Array.from(exceedingLocationsSet);
        let exceedingStr = exceedingList.slice(0, 15).join(", ");
        if (exceedingList.length > 15) {
          exceedingStr += `, and ${exceedingList.length - 15} more locations`;
        }

        let mapHtml = "";
        if (configKey === "EC" && ecMapBase64) {
          mapHtml = `
            <div style="margin-top: 15px; text-align: center; padding: 12px; background-color: transparent; border: 1px solid #cbd5e1; border-radius: 8px;">
              <img src="${ecMapBase64}" alt="EC IDW Map" style="max-height: 400px; display: block; margin: 0 auto; max-width: 100%; border-radius: 8px;" />
              <p style="font-size: 11px; font-weight: bold; color: #475569; margin-top: 8px; font-style: italic;">Spatial Distribution (IDW) Map of Electrical Conductivity</p>
            </div>
          `;
        }

        const cardHTML = `
          <div style="margin-bottom: 16px; background-color: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; border-left: 4px solid ${
            isSafe ? "#34d399" : "#fb7185"
          };">
            <h4 style="font-weight: bold; color: #1e293b; font-size: 16px; margin: 0 0 8px 0;">${config.name} (${configKey})</h4>
            <p style="color: #475569; line-height: 1.5; font-size: 13.5px; margin: 0;">
              Concentration ranges from <strong>${stats.min.toFixed(2)} ${config.unit}</strong> to <strong>${stats.max.toFixed(2)} ${config.unit}</strong> with an average value of nearly <strong>${stats.avg.toFixed(2)} ${config.unit}</strong>. 
              ${
                isSafe
                  ? `<span style="color: #059669; font-weight: bold;">All samples remain safely within limits.</span>`
                  : `<span style="color: #dc2626; font-weight: bold;">About ${exceedPct}% of the analyzed samples exceed the BIS ${
                      configKey === "pH" ? "acceptable range" : "permissible limit"
                    } of ${limitStr}.</span> Elevated levels are particularly observed in: <span style="font-weight: bold; color: #0f172a;">${exceedingStr}</span>. ${specificInsight}`
              }
            </p>
            ${mapHtml}
          </div>
        `;

        if (heavyMetalsList.includes(configKey)) heavyCardsHTML += cardHTML;
        else basicCardsHTML += cardHTML;
      }

      // 6. Multi-Parameter Exceedance Location Lists
      const exceedingLocationsList: ExceedingLocationItem[] = [];
      filtered.forEach((row) => {
        const exceededParams: string[] = [];
        const exceededDetails: string[] = [];
        let hasHeavyMetal = false;

        selectedPamphletParams.forEach((paramCol) => {
          const configKey = headerMap[paramCol];
          const config = PARAM_CONFIG[configKey];
          if (!config) return;

          const val = parseFloat(row[paramCol]);
          if (isNaN(val)) return;

          const isSingleLimit = config.b1 === config.b2 && configKey !== "pH";
          const checkLimit = configKey === "pH" ? null : isSingleLimit ? config.b1 : config.b2;

          let isExceeding = false;
          if (configKey === "pH") {
            if (val < config.b1 || val > config.b2) isExceeding = true;
          } else if (checkLimit !== null) {
            if (val > checkLimit) isExceeding = true;
          }

          if (isExceeding) {
            exceededParams.push(configKey);
            const wholeNumbers = ["EC", "NO3", "TH", "Ca", "SO4", "Mg", "Cl"];
            const decimalPlaces = wholeNumbers.includes(configKey) ? 0 : 4;
            exceededDetails.push(`${configKey} (${val.toFixed(decimalPlaces)} ${config.unit})`);
            if (heavyMetalsList.includes(configKey)) hasHeavyMetal = true;
          }
        });

        if (exceededParams.length > 1) {
          let contaminationType = "Multi Parameter Contamination";
          if (hasHeavyMetal && exceededParams.includes("EC")) {
            contaminationType = "Severe salinity & trace metal contamination";
          } else if (hasHeavyMetal) {
            contaminationType = "Heavy/Trace metal contamination";
          } else if (exceededParams.includes("NO3") && exceededParams.includes("TH")) {
            contaminationType = "Nutrient & hardness contamination";
          } else if (exceededParams.includes("EC") || exceededParams.includes("Cl")) {
            contaminationType = "Severe Salinity / Brackishness";
          }

          exceedingLocationsList.push({
            block: String(row[headers.block || ""] || "-").trim(),
            location: String(row[headers.location || ""] || "-").trim(),
            lat: String(row[headers.latitude || ""] || "-").trim(),
            lon: String(row[headers.longitude || ""] || "-").trim(),
            count: exceededParams.length,
            names: exceededParams.join(", "),
            details: exceededDetails.join(", "),
            type: contaminationType,
            rawParams: exceededParams,
          });
        }
      });

      exceedingLocationsList.sort((a, b) => b.count - a.count);

      const locationTableHTML = exceedingLocationsList
        .map(
          (item) => `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px; line-height: 1.1;">
            <td style="padding: 2px 6px; color: #334155; font-weight: 500; border: 1px solid #e2e8f0;">${item.block}</td>
            <td style="padding: 2px 6px; color: #1e293b; font-weight: bold; border: 1px solid #e2e8f0;">${item.location}</td>
            <td style="padding: 2px 6px; color: #64748b; font-size: 10px; border: 1px solid #e2e8f0;">${item.lat}</td>
            <td style="padding: 2px 6px; color: #64748b; font-size: 10px; border: 1px solid #e2e8f0;">${item.lon}</td>
            <td style="padding: 2px 6px; text-align: center; color: #e11d48; font-weight: 900; border: 1px solid #e2e8f0;">${item.count}</td>
            <td style="padding: 2px 6px; color: #475569; font-weight: 500; border: 1px solid #e2e8f0;">${item.names}</td>
            <td style="padding: 2px 6px; color: #64748b; font-size: 10px; border: 1px solid #e2e8f0;">${item.details}</td>
            <td style="padding: 2px 6px; color: #312e81; font-weight: 600; font-size: 10.5px; border: 1px solid #e2e8f0;">${item.type}</td>
          </tr>
        `
        )
        .join("");

      // 7. Remedial table mapper
      const remedialTableHTML = exceedingLocationsList
        .map((item) => {
          const remedies = new Set<string>();
          item.rawParams.forEach((pKey) => {
            const remediesArr = ALL_REMEDIAL_MEASURES[pKey] || ALL_REMEDIAL_MEASURES["default"];
            remediesArr.forEach((r) => remedies.add(r.method));
          });

          if (item.rawParams.includes("NO3")) remedies.add("Controlled fertilizer application");
          if (item.rawParams.includes("NO3") || item.rawParams.includes("Cl")) remedies.add("Sanitation improvement");
          if (item.count > 3) remedies.add("Alternate drinking water supply");
          remedies.add("Periodic WQ monitoring");

          if (item.rawParams.includes("EC") || item.rawParams.includes("TH")) {
            remedies.add("Artificial recharge structures");
            remedies.add("Domestic softening systems");
          }
          if (item.type.includes("metal")) {
            remedies.add("Specific media filtration");
          }

          const remedyArr = Array.from(remedies).filter((r) => r !== "Reverse Osmosis (RO)");
          if (Array.from(remedies).includes("Reverse Osmosis (RO)")) {
            remedyArr.unshift("RO treatment systems");
          }

          return `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
            <td style="padding: 10px; color: #1e293b; font-weight: bold; border: 1px solid #e2e8f0;">${item.block}</td>
            <td style="padding: 10px; color: #334155; font-weight: bold; border: 1px solid #e2e8f0;">${item.location}</td>
            <td style="padding: 10px; color: #64748b; font-size: 11px; border: 1px solid #e2e8f0;">${item.lat}</td>
            <td style="padding: 10px; color: #64748b; font-size: 11px; border: 1px solid #e2e8f0;">${item.lon}</td>
            <td style="padding: 10px; color: #e11d48; font-weight: 600; border: 1px solid #e2e8f0;">${item.names}</td>
            <td style="padding: 10px; color: #475569; border: 1px solid #e2e8f0;">${item.type.replace("Severe ", "")}</td>
            <td style="padding: 10px; color: #047857; font-weight: 500; border: 1px solid #e2e8f0;">${remedyArr.join(", ")}</td>
          </tr>
        `;
        })
        .join("");

      // Top blocks
      const blockCounts: Record<string, number> = {};
      exceedingLocationsList.forEach((item) => {
        if (item.block && item.block !== "-") {
          blockCounts[item.block] = (blockCounts[item.block] || 0) + 1;
        }
      });
      const topBlocksStr = Object.entries(blockCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map((e) => e[0])
        .join(", ");

      let textPara3 = "";
      if (exceedingLocationsList.length > 0) {
        const topLocs = exceedingLocationsList.slice(0, 5).map((l) => l.location).join(", ");
        textPara3 += `Among highly affected areas, <strong>${
          topBlocksStr || "several blocks"
        }</strong> were identified as priority hot-zones requiring urgent attention. Severe contamination elements were observed in locations like: <strong>${topLocs}</strong>. `;
      } else {
        textPara3 += "Overall, the examined region demonstrates excellent compliance with national drinking water standards across all monitored habitations, with zero significant multi-parameter exceedances. ";
      }

      let textPara4 = "The study recommends continuous groundwater quality monitoring, artificial recharge and rainwater harvesting, controlled fertilizer application, sanitation improvement, and installation of suitable treatment systems such as RO and softening units. Public awareness and sustainable groundwater management practices are essential to ensure long-term drinking water security in the district.";

      // --- Major Ion and Hydrogeochemical Facies (Piper Plot) Section ---
      const EQ_WEIGHTS = {
        Ca: 20.04,
        Mg: 12.15,
        Na: 22.99,
        K: 39.10,
        Cl: 35.45,
        SO4: 48.03,
        HCO3: 61.02,
        CO3: 30.00
      };

      const ION_ALIASES: Record<string, string[]> = {
        Ca: ["ca", "calcium"],
        Mg: ["mg", "magnesium"],
        Na: ["na", "sodium"],
        K: ["k", "potassium"],
        Cl: ["cl", "chloride"],
        SO4: ["so4", "sulphate", "sulfate"],
        HCO3: ["hco3", "bicarbonate"],
        CO3: ["co3", "carbonate"],
        EC: ["ec", "conductivity", "electrical conductivity", "electrical_conductivity"],
        TDS: ["tds", "total dissolved solids", "dissolved solids", "total_dissolved_solids"],
        Location: ["location", "village", "site", "name", "site name", "site_name"]
      };

      const localMapping: Record<string, string> = {};
      if (filtered.length > 0) {
        const rowHeaders = Object.keys(filtered[0]);
        Object.entries(ION_ALIASES).forEach(([colId, aliases]) => {
          if (colId === "Location" && headers.location) {
            localMapping.Location = headers.location;
            return;
          }
          const mappedCol = Object.keys(headerMap).find(k => headerMap[k] === colId);
          if (mappedCol) {
            localMapping[colId] = mappedCol;
            return;
          }

          const matched = rowHeaders.find(h => {
            return aliases.some(alias => {
              try {
                return new RegExp(`\\b${alias}\\b`, "i").test(h);
              } catch {
                return h.toLowerCase() === alias.toLowerCase();
              }
            });
          });
          if (matched) {
            localMapping[colId] = matched;
          }
        });
      }

      const processedFaciesSamples = filtered.map((row, index) => {
        const getMappedNum = (id: string): number | null => {
          const key = localMapping[id];
          if (key && row[key] !== undefined && row[key] !== null) {
            const textVal = String(row[key]).trim();
            if (textVal !== "" && textVal !== "-" && textVal !== "—") {
              const val = parseFloat(textVal);
              return isNaN(val) ? null : val;
            }
          }
          return null;
        };

        const ca = getMappedNum("Ca");
        const mg = getMappedNum("Mg");
        const na = getMappedNum("Na");
        const k = getMappedNum("K");
        const cl = getMappedNum("Cl");
        const so4 = getMappedNum("SO4");
        const hco3 = getMappedNum("HCO3");
        const co3 = getMappedNum("CO3");
        const ecVal = getMappedNum("EC");
        let tdsVal = getMappedNum("TDS");
        if (tdsVal === null && ecVal !== null) {
          tdsVal = ecVal * 0.65;
        }

        const locName = (localMapping.Location && row[localMapping.Location]) ? String(row[localMapping.Location]).trim() : `Site ${index + 1}`;
        const safeVal = (v: number | null) => v === null ? 0 : v;

        const meq = {
          Ca: safeVal(ca) / EQ_WEIGHTS.Ca,
          Mg: safeVal(mg) / EQ_WEIGHTS.Mg,
          Na: safeVal(na) / EQ_WEIGHTS.Na,
          K: safeVal(k) / EQ_WEIGHTS.K,
          Cl: safeVal(cl) / EQ_WEIGHTS.Cl,
          SO4: safeVal(so4) / EQ_WEIGHTS.SO4,
          HCO3: safeVal(hco3) / EQ_WEIGHTS.HCO3,
          CO3: safeVal(co3) / EQ_WEIGHTS.CO3
        };

        const catSumReal = meq.Ca + meq.Mg + meq.Na + meq.K;
        const anSumReal = meq.Cl + meq.SO4 + meq.HCO3 + meq.CO3;
        const catSum = catSumReal || 1;
        const anSum = anSumReal || 1;

        const meqPerc = {
          Ca: (meq.Ca / catSum) * 100,
          Mg: (meq.Mg / catSum) * 100,
          Na: (meq.Na / catSum) * 100,
          K: (meq.K / catSum) * 100,
          Cl: (meq.Cl / anSum) * 100,
          SO4: (meq.SO4 / anSum) * 100,
          HCO3: (meq.HCO3 / anSum) * 100,
          CO3: (meq.CO3 / anSum) * 100
        };

        let facies = "Unknown";
        let hasFacies = ca !== null && mg !== null && na !== null && cl !== null && so4 !== null && hco3 !== null;

        if (hasFacies && catSumReal > 0 && anSumReal > 0) {
          const c = meqPerc.Ca + meqPerc.Mg;
          const a = meqPerc.Cl + meqPerc.SO4;
          if (c >= 50 && a >= 50) {
            if (c + a >= 150) facies = "Ca-Cl Type";
            else facies = "Mixed Type A";
          } else if (c >= 50 && a < 50) {
            facies = "Ca-Mg-HCO3 Type";
          } else if (c < 50 && a >= 50) {
            facies = "Na-Cl Type";
          } else if (c < 50 && a < 50) {
            if (c + a >= 50) facies = "Mixed Type B";
            else facies = "Na-HCO3 Type";
          }
        } else {
          hasFacies = false;
        }

        const stateCol = headers && headers.state ? headers.state : null;
        const rawStateVal = stateCol && row[stateCol] !== undefined && row[stateCol] !== null ? String(row[stateCol]).trim() : "";

        const blockCol = headers && headers.block ? headers.block : null;
        const blockVal = blockCol && row[blockCol] !== undefined && row[blockCol] !== null ? String(row[blockCol]).trim() : "-";

        const aquiferCol = headers && headers.aquifer ? headers.aquifer : null;
        const aquiferVal = aquiferCol && row[aquiferCol] !== undefined && row[aquiferCol] !== null ? String(row[aquiferCol]).trim() : "-";

        const hasSAR = ca !== null && mg !== null && na !== null;
        const sar = hasSAR && (meq.Ca + meq.Mg > 0) ? (meq.Na / Math.sqrt((meq.Ca + meq.Mg) / 2)) : null;

        const hasRSC = ca !== null && mg !== null && hco3 !== null;
        const rsc = hasRSC ? ((meq.HCO3 + meq.CO3) - (meq.Ca + meq.Mg)) : null;

        const hasGibbs = tdsVal !== null && tdsVal > 0 && na !== null && ca !== null && cl !== null && hco3 !== null;
        const gibbsCation = hasGibbs ? (meq.Na + meq.K) / (meq.Na + meq.K + meq.Ca || 1) : null;
        const gibbsAnion = hasGibbs ? meq.Cl / (meq.Cl + meq.HCO3 || 1) : null;

        return {
          locName,
          block: blockVal,
          aquifer: aquiferVal,
          meqPerc,
          facies,
          hasFacies,
          stateVal: rawStateVal,
          sar,
          rsc,
          hasSAR,
          hasRSC,
          ecVal,
          tdsVal,
          hasGibbs,
          gibbsCation,
          gibbsAnion
        };
      });

      const validFaciesSamples = processedFaciesSamples.filter(s => s.hasFacies);
      const totalValidFacies = validFaciesSamples.length;

      const faciesCounts: Record<string, number> = {
        "Ca-Mg-HCO3 Type": 0,
        "Mixed Type A": 0,
        "Mixed Type B": 0,
        "Na-Cl Type": 0,
        "Na-HCO3 Type": 0,
        "Ca-Cl Type": 0,
        "Unknown": 0
      };

      validFaciesSamples.forEach(s => {
        if (faciesCounts[s.facies] !== undefined) {
          faciesCounts[s.facies]++;
        } else {
          faciesCounts["Unknown"]++;
        }
      });

      const getFaciesPct = (count: number) => totalValidFacies > 0 ? ((count / totalValidFacies) * 100).toFixed(2) : "0.00";

      const pCaHCO3Val = parseFloat(getFaciesPct(faciesCounts["Ca-Mg-HCO3 Type"]));
      const pMixedVal = parseFloat(getFaciesPct(faciesCounts["Mixed Type A"] + faciesCounts["Mixed Type B"]));
      const pNaClVal = parseFloat(getFaciesPct(faciesCounts["Na-Cl Type"]));
      const pNaHCO3Val = parseFloat(getFaciesPct(faciesCounts["Na-HCO3 Type"]));
      const pCaCl2Val = parseFloat(getFaciesPct(faciesCounts["Ca-Cl Type"]));

      const uniqueLocations = Array.from(
        new Set(validFaciesSamples.map(s => s.locName).filter(l => l && l !== "-" && l !== "Unknown"))
      );

      const locationColorPalette = [
        "#2563eb", // Blue
        "#dc2626", // Red
        "#16a34a", // Green
        "#9333ea", // Purple
        "#ea580c", // Orange
        "#0891b2", // Cyan
        "#db2777", // Pink
        "#ca8a04", // Dark Yellow
        "#059669", // Emerald
        "#4f46e5", // Indigo
        "#d97706", // Amber
        "#be123c", // Rose
        "#0284c7", // Sky Blue
        "#7c3aed", // Violet
        "#15803d", // Dark Green
        "#b91c1c", // Dark Red
        "#a21caf", // Fuchsia
        "#047857", // Teal Green
        "#c2410c", // Dark Orange
        "#1d4ed8"  // Royal Blue
      ];

      const SYMBOL_SHAPES = [
        "circle",
        "square",
        "diamond",
        "triangle-up",
        "triangle-down",
        "triangle-right",
        "triangle-left",
        "star",
        "star-4",
        "hexagon",
        "pentagon",
        "cross",
        "x-mark",
        "circle-dot",
        "square-dot",
        "diamond-dot"
      ];

      const locationColorMap: Record<string, string> = {};
      const locationShapeMap: Record<string, string> = {};

      uniqueLocations.forEach((loc, idx) => {
        locationColorMap[loc] = locationColorPalette[idx % locationColorPalette.length];
        locationShapeMap[loc] = SYMBOL_SHAPES[idx % SYMBOL_SHAPES.length];
      });

      const getLocId = (locName: string) => "loc-" + locName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const getDefsMarkup = () => "";

      const renderPointSymbol = (cx: number, cy: number, shape: string, color: string, locId: string, radius: number = 4.2) => {
        const stroke = `stroke="#0f172a" stroke-width="1.1"`;
        const r = radius;

        if (shape === "square") {
          return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="${color}" ${stroke} />`;
        } else if (shape === "diamond") {
          return `<polygon points="${cx},${cy - r * 1.35} ${cx + r * 1.2},${cy} ${cx},${cy + r * 1.35} ${cx - r * 1.2},${cy}" fill="${color}" ${stroke} />`;
        } else if (shape === "triangle-up") {
          return `<polygon points="${cx},${cy - r * 1.35} ${cx + r * 1.25},${cy + r * 0.95} ${cx - r * 1.25},${cy + r * 0.95}" fill="${color}" ${stroke} />`;
        } else if (shape === "triangle-down") {
          return `<polygon points="${cx - r * 1.25},${cy - r * 0.95} ${cx + r * 1.25},${cy - r * 0.95} ${cx},${cy + r * 1.35}" fill="${color}" ${stroke} />`;
        } else if (shape === "triangle-right") {
          return `<polygon points="${cx + r * 1.35},${cy} ${cx - r * 0.95},${cy - r * 1.25} ${cx - r * 0.95},${cy + r * 1.25}" fill="${color}" ${stroke} />`;
        } else if (shape === "triangle-left") {
          return `<polygon points="${cx - r * 1.35},${cy} ${cx + r * 0.95},${cy - r * 1.25} ${cx + r * 0.95},${cy + r * 1.25}" fill="${color}" ${stroke} />`;
        } else if (shape === "star") {
          let pts = "";
          for (let i = 0; i < 10; i++) {
            const dist = i % 2 === 0 ? r * 1.35 : r * 0.6;
            const rad = ((i * 36 - 90) * Math.PI) / 180;
            pts += `${(cx + dist * Math.cos(rad)).toFixed(2)},${(cy + dist * Math.sin(rad)).toFixed(2)} `;
          }
          return `<polygon points="${pts.trim()}" fill="${color}" ${stroke} />`;
        } else if (shape === "star-4") {
          let pts = "";
          for (let i = 0; i < 8; i++) {
            const dist = i % 2 === 0 ? r * 1.4 : r * 0.45;
            const rad = ((i * 45 - 90) * Math.PI) / 180;
            pts += `${(cx + dist * Math.cos(rad)).toFixed(2)},${(cy + dist * Math.sin(rad)).toFixed(2)} `;
          }
          return `<polygon points="${pts.trim()}" fill="${color}" ${stroke} />`;
        } else if (shape === "hexagon") {
          const pts = [0, 60, 120, 180, 240, 300].map(a => {
            const rad = (a * Math.PI) / 180;
            return `${(cx + r * 1.15 * Math.cos(rad)).toFixed(2)},${(cy + r * 1.15 * Math.sin(rad)).toFixed(2)}`;
          }).join(" ");
          return `<polygon points="${pts}" fill="${color}" ${stroke} />`;
        } else if (shape === "pentagon") {
          const pts = [0, 1, 2, 3, 4].map(i => {
            const rad = ((i * 72 - 90) * Math.PI) / 180;
            return `${(cx + r * 1.2 * Math.cos(rad)).toFixed(2)},${(cy + r * 1.2 * Math.sin(rad)).toFixed(2)}`;
          }).join(" ");
          return `<polygon points="${pts}" fill="${color}" ${stroke} />`;
        } else if (shape === "cross") {
          return `<path d="M ${cx - r * 1.1} ${cy - r * 0.38} h ${r * 0.72} v ${-r * 0.72} h ${r * 0.76} v ${r * 0.72} h ${r * 0.72} v ${r * 0.76} h ${-r * 0.72} v ${r * 0.72} h ${-r * 0.76} v ${-r * 0.72} h ${-r * 0.72} Z" fill="${color}" ${stroke} />`;
        } else if (shape === "x-mark") {
          const w = r * 0.38;
          const d = r * 1.15;
          const pts = `${cx},${cy - w} ${cx + d - w},${cy - d} ${cx + d},${cy - d + w} ${cx + w},${cy} ${cx + d},${cy + d - w} ${cx + d - w},${cy + d} ${cx},${cy + w} ${cx - d + w},${cy + d} ${cx - d},${cy + d - w} ${cx - w},${cy} ${cx - d},${cy - d + w} ${cx - d + w},${cy - d}`;
          return `<polygon points="${pts}" fill="${color}" ${stroke} />`;
        } else if (shape === "circle-dot") {
          return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" ${stroke} /><circle cx="${cx}" cy="${cy}" r="${r * 0.38}" fill="#ffffff" stroke="#0f172a" stroke-width="0.6" /></g>`;
        } else if (shape === "square-dot") {
          return `<g><rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="${color}" ${stroke} /><rect x="${cx - r * 0.38}" y="${cy - r * 0.38}" width="${r * 0.76}" height="${r * 0.76}" fill="#ffffff" stroke="#0f172a" stroke-width="0.6" /></g>`;
        } else if (shape === "diamond-dot") {
          return `<g><polygon points="${cx},${cy - r * 1.3} ${cx + r * 1.2},${cy} ${cx},${cy + r * 1.3} ${cx - r * 1.2},${cy}" fill="${color}" ${stroke} /><circle cx="${cx}" cy="${cy}" r="${r * 0.38}" fill="#ffffff" stroke="#0f172a" stroke-width="0.6" /></g>`;
        } else {
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" ${stroke} />`;
        }
      };

      const generateBlockLegendHTML = () => {
        if (uniqueLocations.length === 0) return "";

        const useTwoColumns = uniqueLocations.length >= 4;
        const numCols = useTwoColumns ? 2 : 1;
        const total = uniqueLocations.length;
        const numRows = Math.ceil(total / numCols);

        const rows: string[] = [];

        for (let r = 0; r < numRows; r++) {
          let rowCells = "";
          for (let c = 0; c < numCols; c++) {
            const idx = r + c * numRows;
            if (idx < total) {
              const locName = uniqueLocations[idx];
              const color = locationColorMap[locName] || "#2563eb";
              const shape = locationShapeMap[locName] || "circle";
              const locId = getLocId(locName);

              rowCells += `
                <td style="padding: 4px 6px; text-align: center; width: 36px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #f1f5f9; background-color: #f8fafc;">
                  <svg width="18" height="18" viewBox="0 0 20 20" style="vertical-align: middle; display: inline-block;">
                    ${renderPointSymbol(10, 10, shape, color, `leg-${locId}`, 5.5)}
                  </svg>
                </td>
                <td style="padding: 4px 8px; text-align: left; color: #1e293b; font-weight: 600; border-bottom: 1px solid #e2e8f0; ${c < numCols - 1 ? 'border-right: 1px solid #cbd5e1;' : ''}">
                  ${locName}
                </td>
              `;
            } else {
              rowCells += `
                <td style="padding: 4px 6px; border-bottom: 1px solid #e2e8f0; background-color: #f8fafc;"></td>
                <td style="padding: 4px 8px; border-bottom: 1px solid #e2e8f0; ${c < numCols - 1 ? 'border-right: 1px solid #cbd5e1;' : ''}"></td>
              `;
            }
          }
          rows.push(`<tr>${rowCells}</tr>`);
        }

        const tableHeader = useTwoColumns
          ? `
            <thead>
              <tr style="background-color: #f1f5f9; color: #334155; font-size: 10px; font-weight: 800; text-transform: uppercase; border-bottom: 1px solid #cbd5e1;">
                <th style="padding: 5px 6px; text-align: center; width: 36px; border-right: 1px solid #e2e8f0;">Shape</th>
                <th style="padding: 5px 8px; text-align: left; border-right: 1px solid #cbd5e1;">Location Name</th>
                <th style="padding: 5px 6px; text-align: center; width: 36px; border-right: 1px solid #e2e8f0;">Shape</th>
                <th style="padding: 5px 8px; text-align: left;">Location Name</th>
              </tr>
            </thead>
          `
          : `
            <thead>
              <tr style="background-color: #f1f5f9; color: #334155; font-size: 10px; font-weight: 800; text-transform: uppercase; border-bottom: 1px solid #cbd5e1;">
                <th style="padding: 5px 6px; text-align: center; width: 36px; border-right: 1px solid #e2e8f0;">Shape</th>
                <th style="padding: 5px 8px; text-align: left;">Location Name</th>
              </tr>
            </thead>
          `;

        return `
          <div style="margin: 14px auto; max-width: 650px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="background-color: #e2e8f0; padding: 6px 12px; text-align: center; border-bottom: 1px solid #cbd5e1;">
              <strong style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a8a;">Location Sample Symbol Legend</strong>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              ${tableHeader}
              <tbody>
                ${rows.join("")}
              </tbody>
            </table>
          </div>
        `;
      };

      const generatePiperDiagramHTML = (title: string, samples: typeof validFaciesSamples, includeLegend = true) => {
        // Validation check for Piper: cations > 0, anions > 0, non-negative percentages
        const validPiperSamples = samples.filter((d) => {
          const ca = d.meqPerc?.Ca ?? -1;
          const mg = d.meqPerc?.Mg ?? -1;
          const nak = (d.meqPerc?.Na ?? 0) + (d.meqPerc?.K ?? 0);
          const cl = d.meqPerc?.Cl ?? -1;
          const so4 = d.meqPerc?.SO4 ?? -1;
          const hco3 = (d.meqPerc?.HCO3 ?? 0) + (d.meqPerc?.CO3 ?? 0);

          if (ca < 0 || mg < 0 || nak < 0 || cl < 0 || so4 < 0 || hco3 < 0) return false;
          const catSum = ca + mg + nak;
          const anSum = cl + so4 + hco3;
          return catSum > 0 && anSum > 0 && Math.abs(catSum - 100) < 2.5 && Math.abs(anSum - 100) < 2.5;
        });

        if (validPiperSamples.length === 0) {
          return `
            <div style="background-color: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 12px; padding: 25px; text-align: center; margin: 20px 0; max-width: 500px; margin-left: auto; margin-right: auto;">
              <p style="font-weight: bold; font-size: 11pt; color: #475569; margin: 0 0 10px 0;">Piper Trilinear Diagram (No Valid Data)</p>
              <p style="font-size: 9.5pt; color: #64748b; line-height: 1.5; max-width: 400px; margin: 0 auto;">
                No samples with valid major ion balance were found in: <strong>${title}</strong>.
              </p>
            </div>
          `;
        }

        const SQRT3 = Math.sqrt(3);
        const H_val = (100 * SQRT3) / 2;
        const tx = (x: number) => x + 40;
        const ty = (y: number) => 230 - y;
        const gridLineColor = "#cbd5e1";
        const frameColor = "#0f172a";

        let gridLines = "";
        for (let i = 20; i < 100; i += 20) {
          const y = (i * SQRT3) / 2;
          const strokeProps = `stroke="${gridLineColor}" stroke-dasharray="2 2" stroke-width="0.8" fill="none"`;
          gridLines += `<line x1="${tx(0.5 * i)}" y1="${ty(y)}" x2="${tx(100 - 0.5 * i)}" y2="${ty(y)}" ${strokeProps} />`;
          gridLines += `<line x1="${tx(i)}" y1="${ty(0)}" x2="${tx(50 + 0.5 * i)}" y2="${ty(((100 - i) * SQRT3) / 2)}" ${strokeProps} />`;
          gridLines += `<line x1="${tx(100 - i)}" y1="${ty(0)}" x2="${tx(0.5 * (100 - i))}" y2="${ty(((100 - i) * SQRT3) / 2)}" ${strokeProps} />`;
          gridLines += `<line x1="${tx(120 + 0.5 * i)}" y1="${ty(y)}" x2="${tx(220 - 0.5 * i)}" y2="${ty(y)}" ${strokeProps} />`;
          gridLines += `<line x1="${tx(120 + i)}" y1="${ty(0)}" x2="${tx(170 + 0.5 * i)}" y2="${ty(((100 - i) * SQRT3) / 2)}" ${strokeProps} />`;
          gridLines += `<line x1="${tx(220 - i)}" y1="${ty(0)}" x2="${tx(120 + 0.5 * (100 - i))}" y2="${ty(((100 - i) * SQRT3) / 2)}" ${strokeProps} />`;
          gridLines += `<line x1="${tx(110 - 0.5 * i)}" y1="${ty(10 * SQRT3 + 0.5 * i * SQRT3)}" x2="${tx(160 - 0.5 * i)}" y2="${ty(60 * SQRT3 + 0.5 * i * SQRT3)}" ${strokeProps} />`;
          gridLines += `<line x1="${tx(110 + 0.5 * i)}" y1="${ty(10 * SQRT3 + 0.5 * i * SQRT3)}" x2="${tx(60 + 0.5 * i)}" y2="${ty(60 * SQRT3 + 0.5 * i * SQRT3)}" ${strokeProps} />`;
        }

        // Add 50% sub-field boundary lines for standard Piper hydrogeochemical facies classification
        let subfieldLines = `
          <!-- Cation Triangle 50% Lines -->
          <line x1="${tx(25)}" y1="${ty(H_val / 2)}" x2="${tx(75)}" y2="${ty(H_val / 2)}" stroke="#64748b" stroke-width="0.9" stroke-dasharray="3 3" />
          <line x1="${tx(25)}" y1="${ty(H_val / 2)}" x2="${tx(50)}" y2="${ty(0)}" stroke="#64748b" stroke-width="0.9" stroke-dasharray="3 3" />
          <line x1="${tx(75)}" y1="${ty(H_val / 2)}" x2="${tx(50)}" y2="${ty(0)}" stroke="#64748b" stroke-width="0.9" stroke-dasharray="3 3" />

          <!-- Anion Triangle 50% Lines -->
          <line x1="${tx(145)}" y1="${ty(H_val / 2)}" x2="${tx(195)}" y2="${ty(H_val / 2)}" stroke="#64748b" stroke-width="0.9" stroke-dasharray="3 3" />
          <line x1="${tx(145)}" y1="${ty(H_val / 2)}" x2="${tx(170)}" y2="${ty(0)}" stroke="#64748b" stroke-width="0.9" stroke-dasharray="3 3" />
          <line x1="${tx(195)}" y1="${ty(H_val / 2)}" x2="${tx(170)}" y2="${ty(0)}" stroke="#64748b" stroke-width="0.9" stroke-dasharray="3 3" />

          <!-- Central Diamond Hydrogeochemical Sub-field Divisions -->
          <line x1="${tx(85)}" y1="${ty(85 * SQRT3)}" x2="${tx(135)}" y2="${ty(85 * SQRT3)}" stroke="#475569" stroke-width="1.0" stroke-dasharray="3 3" />
          <line x1="${tx(85)}" y1="${ty(35 * SQRT3)}" x2="${tx(135)}" y2="${ty(35 * SQRT3)}" stroke="#475569" stroke-width="1.0" stroke-dasharray="3 3" />
          <line x1="${tx(85)}" y1="${ty(85 * SQRT3)}" x2="${tx(110)}" y2="${ty(60 * SQRT3)}" stroke="#475569" stroke-width="1.0" stroke-dasharray="3 3" />
          <line x1="${tx(135)}" y1="${ty(85 * SQRT3)}" x2="${tx(110)}" y2="${ty(60 * SQRT3)}" stroke="#475569" stroke-width="1.0" stroke-dasharray="3 3" />
          <line x1="${tx(85)}" y1="${ty(35 * SQRT3)}" x2="${tx(110)}" y2="${ty(60 * SQRT3)}" stroke="#475569" stroke-width="1.0" stroke-dasharray="3 3" />
          <line x1="${tx(135)}" y1="${ty(35 * SQRT3)}" x2="${tx(110)}" y2="${ty(60 * SQRT3)}" stroke="#475569" stroke-width="1.0" stroke-dasharray="3 3" />
          <line x1="${tx(60)}" y1="${ty(60 * SQRT3)}" x2="${tx(160)}" y2="${ty(60 * SQRT3)}" stroke="#334155" stroke-width="1.1" stroke-dasharray="4 2" opacity="0.8" />
          <line x1="${tx(110)}" y1="${ty(10 * SQRT3)}" x2="${tx(110)}" y2="${ty(110 * SQRT3)}" stroke="#334155" stroke-width="1.1" stroke-dasharray="4 2" opacity="0.8" />
        `;

        // Percentage Scale Ticks & Number Labels (0, 20, 40, 60, 80, 100)
        let axisTicks = "";
        for (let v = 0; v <= 100; v += 20) {
          // Bottom Cation axis (Ca -> Mg)
          axisTicks += `<text x="${tx(v)}" y="${ty(-7)}" text-anchor="middle" font-size="6.5" fill="#475569" font-weight="bold">${100 - v}</text>`;
          // Bottom Anion axis (HCO3 -> Cl)
          axisTicks += `<text x="${tx(120 + v)}" y="${ty(-7)}" text-anchor="middle" font-size="6.5" fill="#475569" font-weight="bold">${v}</text>`;
        }

        let pointsMarkup = "";
        const pointRadius = 3.8;

        validPiperSamples.forEach((d) => {
          const ca = d.meqPerc.Ca || 0;
          const mg = d.meqPerc.Mg || 0;
          const nak = (d.meqPerc.Na || 0) + (d.meqPerc.K || 0);
          const cl = d.meqPerc.Cl || 0;
          const so4 = d.meqPerc.SO4 || 0;
          const hco3 = (d.meqPerc.HCO3 || 0) + (d.meqPerc.CO3 || 0);

          if (ca + mg + nak === 0 || cl + so4 + hco3 === 0) return;

          // Standard Piper Coordinate Transformation:
          // Cation triangle: Ca²⁺ at lower-left (0,0), Mg²⁺ at lower-right (100,0), Na⁺+K⁺ at top (50, 50√3)
          const xc = mg + 0.5 * nak;
          const yc = (nak * SQRT3) / 2;

          // Anion triangle: HCO₃⁻+CO₃²⁻ at lower-left (120,0), Cl⁻ at lower-right (220,0), SO₄²⁻ at top (170, 50√3)
          const xa = 120 + cl + 0.5 * so4;
          const ya = (so4 * SQRT3) / 2;

          // Verified Central Diamond Coordinate Transformation:
          // Mathematically projected from Cation (Ca²⁺+Mg²⁺) and Anion (SO₄²⁻+Cl⁻) percentages:
          const pCat = ca + mg; // % (Ca²⁺ + Mg²⁺)
          const pAn = so4 + cl; // % (SO₄²⁻ + Cl⁻)
          const xd = 110 - 0.5 * pCat + 0.5 * pAn;
          const yd = 10 * SQRT3 + 0.5 * SQRT3 * pCat + 0.5 * SQRT3 * pAn;

          const groupVal = d.locName || "Unknown";
          const locId = getLocId(groupVal);
          const color = locationColorMap[groupVal] || "#2563eb";
          const shape = locationShapeMap[groupVal] || "circle";

          pointsMarkup += `
            ${renderPointSymbol(tx(xc), ty(yc), shape, color, locId, pointRadius)}
            ${renderPointSymbol(tx(xa), ty(ya), shape, color, locId, pointRadius)}
            ${renderPointSymbol(tx(xd), ty(yd), shape, color, locId, pointRadius)}
          `;
        });

        const svgMarkup = `
          <svg viewBox="-25 -32 350 325" width="100%" height="auto" style="background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border: 1.5px solid #cbd5e1; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); font-family: 'Times New Roman', Times, serif; margin: 0 auto; display: block; max-width: 395px; max-height: 288px; width: 100%; height: auto;" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
            <defs>
              <filter id="3d-emboss" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="0.4" result="blur" />
                <feSpecularLighting in="blur" surfaceScale="2" specularConstant="1.2" specularExponent="16" lighting-color="#ffffff" result="spec">
                  <feDistantLight azimuth="225" elevation="45" />
                </feSpecularLighting>
                <feComposite in="spec" in2="SourceAlpha" operator="in" result="specOut" />
                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit" />
              </filter>
              <filter id="bubble-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0.4" dy="0.8" stdDeviation="0.4" flood-opacity="0.3" />
              </filter>
              <filter id="glass-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="1.0" dy="2.0" stdDeviation="1.0" flood-color="#1e293b" flood-opacity="0.1" />
              </filter>
              <linearGradient id="cation-glass" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#eff6ff" stop-opacity="0.85" />
                <stop offset="50%" stop-color="#ffffff" stop-opacity="0.5" />
                <stop offset="100%" stop-color="#dbeafe" stop-opacity="0.85" />
              </linearGradient>
              <linearGradient id="anion-glass" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#fff1f2" stop-opacity="0.85" />
                <stop offset="50%" stop-color="#ffffff" stop-opacity="0.5" />
                <stop offset="100%" stop-color="#ffe4e6" stop-opacity="0.85" />
              </linearGradient>
              <linearGradient id="diamond-glass" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#f5f3ff" stop-opacity="0.85" />
                <stop offset="50%" stop-color="#ffffff" stop-opacity="0.5" />
                <stop offset="100%" stop-color="#e0e7ff" stop-opacity="0.85" />
              </linearGradient>
              ${getDefsMarkup()}
            </defs>

            <!-- Grid Lines & Triangle Frames -->
            <g>${gridLines}</g>
            <g>${subfieldLines}</g>

            <path d="M ${tx(0)} ${ty(0)} L ${tx(100)} ${ty(0)} L ${tx(50)} ${ty(H_val)} Z" stroke="${frameColor}" stroke-width="1.3" fill="url(#cation-glass)" filter="url(#glass-shadow)" stroke-linejoin="round" />
            <path d="M ${tx(120)} ${ty(0)} L ${tx(220)} ${ty(0)} L ${tx(170)} ${ty(H_val)} Z" stroke="${frameColor}" stroke-width="1.3" fill="url(#anion-glass)" filter="url(#glass-shadow)" stroke-linejoin="round" />
            <path d="M ${tx(110)} ${ty(10 * SQRT3)} L ${tx(160)} ${ty(60 * SQRT3)} L ${tx(110)} ${ty(110 * SQRT3)} L ${tx(60)} ${ty(60 * SQRT3)} Z" stroke="${frameColor}" stroke-width="1.3" fill="url(#diamond-glass)" filter="url(#glass-shadow)" stroke-linejoin="round" />

            <!-- Axis Ticks -->
            <g>${axisTicks}</g>

            <!-- Diagram Title Header -->
            <text x="${tx(110)}" y="-12" text-anchor="middle" font-size="11" font-weight="900" fill="#1e3a8a" letter-spacing="0.02em">${title || "Piper Trilinear Diagram"}</text>

            <!-- Cation Triangle Axis Labels (Matching USSL & Piper Analysis Template) -->
            <text transform="translate(${tx(50)}, ${ty(-14)})" text-anchor="middle" font-size="9.5" fill="#1e293b" font-weight="bold">Ca²⁺</text>
            <text transform="translate(${tx(82)}, ${ty(45)}) rotate(60)" text-anchor="middle" font-size="9.5" fill="#1e293b" font-weight="bold">Na⁺ + K⁺</text>
            <text transform="translate(${tx(18)}, ${ty(45)}) rotate(-60)" text-anchor="middle" font-size="9.5" fill="#1e293b" font-weight="bold">Mg²⁺</text>

            <!-- Anion Triangle Axis Labels (Matching USSL & Piper Analysis Template) -->
            <text transform="translate(${tx(170)}, ${ty(-14)})" text-anchor="middle" font-size="9.5" fill="#1e293b" font-weight="bold">Cl⁻</text>
            <text transform="translate(${tx(138)}, ${ty(45)}) rotate(-60)" text-anchor="middle" font-size="9.5" fill="#1e293b" font-weight="bold">HCO₃⁻ + CO₃²⁻</text>
            <text transform="translate(${tx(202)}, ${ty(45)}) rotate(60)" text-anchor="middle" font-size="9.5" fill="#1e293b" font-weight="bold">SO₄²⁻</text>

            <!-- Central Diamond Side Axis Labels (Matching USSL & Piper Analysis Template) -->
            <text transform="translate(${tx(75)}, ${ty(135)}) rotate(-60)" text-anchor="middle" font-size="9" fill="#1e293b" font-weight="bold">SO₄²⁻ + Cl⁻</text>
            <text transform="translate(${tx(145)}, ${ty(135)}) rotate(60)" text-anchor="middle" font-size="9" fill="#1e293b" font-weight="bold">Ca²⁺ + Mg²⁺</text>

            <!-- Hydrogeochemical Facies Field Labels inside Central Diamond -->
            <text x="${tx(110)}" y="${ty(88 * SQRT3)}" text-anchor="middle" font-size="7" font-weight="bold" fill="#1e3a8a" opacity="0.9">Ca²⁺-SO₄²⁻ / Ca-Cl Type</text>
            <text x="${tx(82)}" y="${ty(60 * SQRT3 + 2)}" text-anchor="middle" font-size="7" font-weight="bold" fill="#1e3a8a" opacity="0.9">Ca²⁺-HCO₃⁻ Type</text>
            <text x="${tx(138)}" y="${ty(60 * SQRT3 + 2)}" text-anchor="middle" font-size="7" font-weight="bold" fill="#1e3a8a" opacity="0.9">Na⁺-Cl⁻ Type</text>
            <text x="${tx(110)}" y="${ty(32 * SQRT3)}" text-anchor="middle" font-size="7" font-weight="bold" fill="#1e3a8a" opacity="0.9">Na⁺-HCO₃⁻ Type</text>
            <text x="${tx(110)}" y="${ty(60 * SQRT3 - 2)}" text-anchor="middle" font-size="6.5" font-weight="bold" fill="#475569" opacity="0.8">Mixed Type</text>

            <!-- Plotted Points -->
            <g>${pointsMarkup}</g>
          </svg>
        `;

        if (includeLegend) {
          return `
            <div style="text-align: center; margin-top: 15px; margin-bottom: 20px;">
              <div style="display: inline-block; padding: 15px; border: 1px solid #cbd5e1; border-radius: 16px; background: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                ${svgMarkup}
              </div>
              ${generateBlockLegendHTML()}
              <p style="text-align: center; font-style: italic; font-size: 11px; margin-top: 6px; color: #475569; font-weight: bold;">
                Figure 2a: Piper Hydrochemical Facies Diagram in ${title}
              </p>
            </div>
          `;
        }
        return svgMarkup;
      };

      const generateGibbsDiagramHTML = (type: "cation" | "anion", regionNameStr: string, samples: typeof validFaciesSamples) => {
        const isCation = type === "cation";
        const titleText = isCation ? "Gibbs Cation Ratio Diagram" : "Gibbs Anion Ratio Diagram";
        const xLabel = isCation ? "Na⁺ / (Na⁺ + Ca²⁺)" : "Cl⁻ / (Cl⁻ + HCO₃⁻)";
        const width = 480;
        const height = 390;
        const padding = { left: 65, right: 25, top: 38, bottom: 52 };

        // Filter valid samples for Gibbs diagram
        const validGibbsSamples = samples.filter((s: any) => {
          const tds = s._calc?.tds ?? s.tdsVal ?? s.tds;
          const ratio = isCation ? (s._calc?.gibbsCation ?? s.gibbsCation) : (s._calc?.gibbsAnion ?? s.gibbsAnion);
          return tds !== null && ratio !== null && !isNaN(tds) && !isNaN(ratio) && tds > 0 && ratio >= 0 && ratio <= 1.0;
        });

        const getX = (val: number) => {
          const w = width - padding.left - padding.right;
          const clamped = Math.max(0, Math.min(1, val || 0));
          return padding.left + clamped * w;
        };

        const getY = (tds: number) => {
          const h = height - padding.top - padding.bottom;
          const logMin = Math.log10(10);
          const logMax = Math.log10(30000);
          const logVal = Math.log10(Math.max(10, tds || 10));
          const normalized = (logVal - logMin) / (logMax - logMin);
          return padding.top + h - normalized * h;
        };

        // Standard Gibbs Boomerang Envelope Path (Gibbs 1970)
        const envelopePath = `
          M ${getX(0.85)} ${getY(30000)}
          C ${getX(0.60)} ${getY(10000)}, ${getX(0.40)} ${getY(3000)}, ${getX(0.08)} ${getY(800)}
          C ${getX(0.05)} ${getY(300)}, ${getX(0.12)} ${getY(100)}, ${getX(0.55)} ${getY(25)}
          C ${getX(0.80)} ${getY(12)}, ${getX(0.95)} ${getY(10)}, ${getX(0.95)} ${getY(25)}
          C ${getX(0.90)} ${getY(100)}, ${getX(0.42)} ${getY(300)}, ${getX(0.42)} ${getY(800)}
          C ${getX(0.55)} ${getY(3000)}, ${getX(0.80)} ${getY(10000)}, ${getX(0.95)} ${getY(30000)}
          Z
        `;

        // Major Y Ticks (Log scale 10 to 30,000)
        const ticksY = [10, 100, 1000, 10000, 30000];
        let gridYLines = "";
        
        let minorYTicks = "";
        const decades = [10, 100, 1000, 10000];
        decades.forEach(base => {
          [2, 3, 4, 5, 6, 7, 8, 9].forEach(mult => {
            const val = base * mult;
            if (val <= 30000) {
              const y = getY(val);
              minorYTicks += `
                <line x1="${padding.left}" y1="${y}" x2="${padding.left + 3}" y2="${y}" stroke="#94a3b8" stroke-width="0.8" />
                <line x1="${width - padding.right - 3}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#94a3b8" stroke-width="0.8" />
              `;
            }
          });
        });

        ticksY.forEach(val => {
          const y = getY(val);
          gridYLines += `
            <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3" />
            <line x1="${padding.left}" y1="${y}" x2="${padding.left + 5}" y2="${y}" stroke="#1e293b" stroke-width="1.5" />
            <line x1="${width - padding.right - 5}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#1e293b" stroke-width="1.5" />
            <text x="${padding.left - 8}" y="${y + 3.5}" font-size="9" fill="#1e293b" font-weight="bold" font-family="'Times New Roman', Times, serif" text-anchor="end">${val.toLocaleString()}</text>
          `;
        });

        // Major X Ticks
        const ticksX = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
        let gridXLines = "";
        ticksX.forEach(val => {
          const x = getX(val);
          gridXLines += `
            <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3" />
            <line x1="${x}" y1="${height - padding.bottom - 5}" x2="${x}" y2="${height - padding.bottom}" stroke="#1e293b" stroke-width="1.5" />
            <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + 5}" stroke="#1e293b" stroke-width="1.5" />
            <text x="${x}" y="${height - padding.bottom + 16}" font-size="9" fill="#1e293b" font-weight="bold" font-family="'Times New Roman', Times, serif" text-anchor="middle">${val.toFixed(1)}</text>
          `;
        });

        // Minor X Ticks
        const minorTicksX = [0.1, 0.3, 0.5, 0.7, 0.9];
        let minorXTicks = "";
        minorTicksX.forEach(val => {
          const x = getX(val);
          minorXTicks += `
            <line x1="${x}" y1="${height - padding.bottom - 3}" x2="${x}" y2="${height - padding.bottom}" stroke="#94a3b8" stroke-width="0.8" />
            <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + 3}" stroke="#94a3b8" stroke-width="0.8" />
          `;
        });

        let pointsSvg = "";
        const pointRadius = 4.2;

        validGibbsSamples.forEach(s => {
          const sAny = s as any;
          const tds = sAny._calc?.tds ?? sAny.tdsVal ?? sAny.tds;
          const xRatio = isCation
            ? (sAny._calc?.gibbsCation ?? sAny.gibbsCation)
            : (sAny._calc?.gibbsAnion ?? sAny.gibbsAnion);

          if (tds === null || xRatio === null || isNaN(tds) || isNaN(xRatio) || tds <= 0) return;

          const cx = getX(xRatio);
          const cy = getY(tds);
          const groupVal = s.locName || "Unknown";
          const locId = getLocId(groupVal);
          const color = locationColorMap[groupVal] || "#2563eb";
          const shape = locationShapeMap[groupVal] || "circle";

          pointsSvg += renderPointSymbol(cx, cy, shape, color, locId, pointRadius);
        });

        return `
          <svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" style="background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); margin: 0 auto; display: block; max-width: 395px; max-height: 288px; width: 100%; height: auto;" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
            <defs>
              <filter id="3d-emboss" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="0.4" result="blur" />
                <feSpecularLighting in="blur" surfaceScale="2" specularConstant="1.2" specularExponent="16" lighting-color="#ffffff" result="spec">
                  <feDistantLight azimuth="225" elevation="45" />
                </feSpecularLighting>
                <feComposite in="spec" in2="SourceAlpha" operator="in" result="specOut" />
                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit" />
              </filter>
              <filter id="bubble-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0.5" dy="1.0" stdDeviation="0.5" flood-color="#0f172a" flood-opacity="0.35" />
              </filter>
              ${getDefsMarkup()}
            </defs>

            <!-- Chart Header Title -->
            <text x="${width / 2}" y="22" font-size="11.5" font-weight="bold" fill="#1e3a8a" font-family="'Times New Roman', Times, serif" text-anchor="middle" style="letter-spacing: 0.04em;">${titleText.toUpperCase()}</text>

            <!-- Classic Gibbs Boomerang Envelope (Gibbs 1970) -->
            <path d="${envelopePath}" fill="#3b82f6" fill-opacity="0.08" stroke="#2563eb" stroke-width="1.4" stroke-dasharray="4 3" />

            <!-- Zone Badges / Text Labels -->
            <!-- Evaporation Zone -->
            <g transform="translate(${getX(0.55)}, ${getY(12000)})">
              <rect x="0" y="-13" width="128" height="18" rx="4" fill="#fff7ed" stroke="#f97316" stroke-width="1" opacity="0.95" />
              <text x="64" y="0" font-size="9" fill="#c2410c" font-weight="bold" font-family="'Times New Roman', Times, serif" text-anchor="middle">Evaporation Dominance</text>
            </g>

            <!-- Rock Weathering Zone -->
            <g transform="translate(${getX(0.08)}, ${getY(400)})">
              <rect x="0" y="-13" width="138" height="18" rx="4" fill="#ecfdf5" stroke="#10b981" stroke-width="1" opacity="0.95" />
              <text x="69" y="0" font-size="9" fill="#047857" font-weight="bold" font-family="'Times New Roman', Times, serif" text-anchor="middle">Rock-Water Interaction</text>
            </g>

            <!-- Precipitation Zone -->
            <g transform="translate(${getX(0.48)}, ${getY(25)})">
              <rect x="0" y="-13" width="138" height="18" rx="4" fill="#eff6ff" stroke="#3b82f6" stroke-width="1" opacity="0.95" />
              <text x="69" y="0" font-size="9" fill="#1d4ed8" font-weight="bold" font-family="'Times New Roman', Times, serif" text-anchor="middle">Precipitation Dominance</text>
            </g>

            <!-- Axes, Minor Ticks and Grids -->
            ${gridYLines}
            ${minorYTicks}
            ${gridXLines}
            ${minorXTicks}

            <!-- Bounding Box -->
            <rect x="${padding.left}" y="${padding.top}" width="${width - padding.left - padding.right}" height="${height - padding.top - padding.bottom}" fill="none" stroke="#1e293b" stroke-width="1.5" />

            <!-- Y Axis Label -->
            <text x="18" y="${(padding.top + height - padding.bottom) / 2}" font-size="10" font-weight="bold" fill="#1e293b" font-family="'Times New Roman', Times, serif" transform="rotate(-90 18 ${(padding.top + height - padding.bottom) / 2})" text-anchor="middle" style="letter-spacing: 0.05em;">TDS (mg/L)</text>

            <!-- X Axis Label -->
            <text x="${padding.left + (width - padding.left - padding.right) / 2}" y="${height - 12}" font-size="10" font-weight="bold" fill="#1e293b" font-family="'Times New Roman', Times, serif" text-anchor="middle" style="letter-spacing: 0.05em;">${xLabel}</text>

            <!-- Plotted Points -->
            ${pointsSvg}
          </svg>
        `;
      };

      const getSolidColor = (facies: string) => {
        if (facies === "Ca-Mg-HCO3 Type") return "#2563eb"; // Blue
        if (facies === "Mixed Type A") return "#ea580c"; // Orange
        if (facies === "Mixed Type B") return "#8b5cf6"; // Purple
        if (facies === "Na-Cl Type") return "#dc2626"; // Red
        if (facies === "Na-HCO3 Type") return "#ec4899"; // Pink
        if (facies === "Ca-Cl Type") return "#eab308"; // Yellow
        return "#475569"; // Slate
      };

      const generateUsslDiagramHTML = (samples: any[]): string => {
        const width = 450;
        const height = 360;
        const padding = { left: 45, right: 15, top: 25, bottom: 40 };

        // Filter valid samples for USSL diagram
        const validUsslSamples = samples.filter((s) => {
          const ec = s.ecVal ?? s.ec;
          const sar = s.sar;
          return ec !== null && sar !== null && !isNaN(ec) && !isNaN(sar) && ec > 0 && ec <= 50000 && sar >= 0 && sar <= 100;
        });

        const getX = (ec: number) => {
          const w = width - padding.left - padding.right;
          const logMin = Math.log10(100);
          const logMax = Math.log10(10000);
          const logVal = Math.log10(Math.max(100, Math.min(10000, ec || 100)));
          return padding.left + ((logVal - logMin) / (logMax - logMin)) * w;
        };

        const getY = (sar: number) => {
          const h = height - padding.top - padding.bottom;
          const maxSar = 32;
          const val = Math.min(maxSar, Math.max(0, sar || 0));
          return padding.top + h - (val / maxSar) * h;
        };

        // Standard USSL logarithmic sodium hazard boundary equations (Richards 1954)
        const s1s2 = (ec: number) => 18.8515824 - 4.4257912 * Math.log10(ec);
        const s2s3 = (ec: number) => 31.4031902 - 6.6827811 * Math.log10(ec);
        const s3s4 = (ec: number) => 43.675205 - 8.8394965 * Math.log10(ec);

        let gridLinesSvg = "";

        // Standard Salinity Hazard Classification Boundaries at EC 250, 750, 2250 µS/cm
        const ecBorders = [250, 750, 2250];
        ecBorders.forEach((border) => {
          const x = getX(border);
          gridLinesSvg += `
            <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3" />
          `;
        });

        // Sodium Hazard Boundary Curves
        const ecs = Array.from({ length: 100 }, (_, i) => 100 + i * 100);
        const curve1Path = ecs.map((ec, i) => `${i === 0 ? "M" : "L"} ${getX(ec)} ${getY(s1s2(ec))}`).join(" ");
        const curve2Path = ecs.map((ec, i) => `${i === 0 ? "M" : "L"} ${getX(ec)} ${getY(s2s3(ec))}`).join(" ");
        const curve3Path = ecs.map((ec, i) => `${i === 0 ? "M" : "L"} ${getX(ec)} ${getY(s3s4(ec))}`).join(" ");

        const curvesSvg = `
          <path d="${curve1Path}" fill="none" stroke="#2563eb" stroke-width="1.5" />
          <path d="${curve2Path}" fill="none" stroke="#2563eb" stroke-width="1.5" />
          <path d="${curve3Path}" fill="none" stroke="#2563eb" stroke-width="1.5" />
        `;

        // Standard 16 Category Labels (C1-S1 through C4-S4)
        const xCentroids = [
          { id: "C1", val: Math.pow(10, (Math.log10(100) + Math.log10(250)) / 2) },
          { id: "C2", val: Math.pow(10, (Math.log10(250) + Math.log10(750)) / 2) },
          { id: "C3", val: Math.pow(10, (Math.log10(750) + Math.log10(2250)) / 2) },
          { id: "C4", val: Math.pow(10, (Math.log10(2250) + Math.log10(10000)) / 2) },
        ];

        let labelsSvg = "";
        xCentroids.forEach((xC) => {
          labelsSvg += `
            <g opacity="0.65">
              <text x="${getX(xC.val)}" y="${getY(s1s2(xC.val) / 2)}" text-anchor="middle" font-size="8" fill="#475569" font-weight="bold">${xC.id}-S1</text>
              <text x="${getX(xC.val)}" y="${getY((s1s2(xC.val) + s2s3(xC.val)) / 2)}" text-anchor="middle" font-size="8" fill="#475569" font-weight="bold">${xC.id}-S2</text>
              <text x="${getX(xC.val)}" y="${getY((s2s3(xC.val) + s3s4(xC.val)) / 2)}" text-anchor="middle" font-size="8" fill="#475569" font-weight="bold">${xC.id}-S3</text>
              <text x="${getX(xC.val)}" y="${getY((s3s4(xC.val) + 32) / 2)}" text-anchor="middle" font-size="8" fill="#475569" font-weight="bold">${xC.id}-S4</text>
            </g>
          `;
        });

        // Grid ticks and values
        const ticksX = [100, 250, 750, 2250, 5000, 10000];
        ticksX.forEach(tick => {
          const x = getX(tick);
          gridLinesSvg += `
            <line x1="${x}" y1="${height - padding.bottom}" x2="${x}" y2="${height - padding.bottom + 5}" stroke="#1e293b" stroke-width="1.5" />
            <text x="${x}" y="${height - padding.bottom + 15}" font-size="8" fill="#1e293b" font-weight="bold" font-family="'Times New Roman', Times, serif" text-anchor="middle">${tick}</text>
          `;
        });

        const ticksY = [0, 10, 20, 30];
        ticksY.forEach(tick => {
          const y = getY(tick);
          gridLinesSvg += `
            <line x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="#1e293b" stroke-width="1.5" />
            <text x="${padding.left - 8}" y="${y + 3}" font-size="8" fill="#1e293b" font-weight="bold" font-family="'Times New Roman', Times, serif" text-anchor="end">${tick}</text>
          `;
        });

        // Plotted points
        let pointsSvg = "";
        const pointRadius = 3.8;
        validUsslSamples.forEach(s => {
          const ec = s.ecVal ?? s.ec;
          const sar = s.sar;
          if (ec === null || sar === null || isNaN(ec) || isNaN(sar)) return;

          const cx = getX(ec);
          const cy = getY(sar);
          const groupVal = s.locName || "Unknown";
          const locId = getLocId(groupVal);
          const color = locationColorMap[groupVal] || "#2563eb";
          const shape = locationShapeMap[groupVal] || "circle";

          pointsSvg += renderPointSymbol(cx, cy, shape, color, locId, pointRadius);
        });

        const svg = `
          <svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" style="background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border: 1.5px solid #cbd5e1; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); font-family: 'Times New Roman', Times, serif; margin: 0 auto; display: block; max-width: 395px; max-height: 288px; width: 100%; height: auto;" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
            <defs>
              <filter id="3d-emboss" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="0.4" result="blur" />
                <feSpecularLighting in="blur" surfaceScale="2" specularConstant="1.2" specularExponent="16" lighting-color="#ffffff" result="spec">
                  <feDistantLight azimuth="225" elevation="45" />
                </feSpecularLighting>
                <feComposite in="spec" in2="SourceAlpha" operator="in" result="specOut" />
                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit" />
              </filter>
              <filter id="bubble-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0.4" dy="0.8" stdDeviation="0.4" flood-opacity="0.3" />
              </filter>
              ${getDefsMarkup()}
            </defs>
            <text x="${width / 2}" y="15" font-size="9.5" font-weight="900" fill="#1e3a8a" text-anchor="middle" style="letter-spacing: 0.1em;">USSL IRRIGATION SUITABILITY MATRIX</text>
            
            <!-- Y-Axis Label -->
            <text x="12" y="${height / 2}" font-size="8" font-weight="900" fill="#1e293b" transform="rotate(-90 12 ${height / 2})" text-anchor="middle" style="letter-spacing: 0.08em;">SODIUM ADSORPTION RATIO (SAR)</text>
            
            <!-- X-Axis Label -->
            <text x="${width / 2}" y="${height - 12}" font-size="8" font-weight="900" fill="#1e293b" text-anchor="middle" style="letter-spacing: 0.08em;">ELECTRICAL CONDUCTIVITY (EC, &mu;S/cm)</text>
            
            <!-- Grid and curves -->
            ${gridLinesSvg}
            ${curvesSvg}
            ${labelsSvg}
            
            <!-- Axis Box -->
            <rect x="${padding.left}" y="${padding.top}" width="${width - padding.left - padding.right}" height="${height - padding.top - padding.bottom}" fill="none" stroke="#1e293b" stroke-width="1.5" />
            
            <!-- Plotted points -->
            ${pointsSvg}
          </svg>
        `;
        return svg;
      };

      const faciesSummaryList = [
        { name: "Ca-Mg-HCO₃ Type", count: faciesCounts["Ca-Mg-HCO3 Type"], pct: pCaHCO3Val },
        { name: "Mixed Type", count: faciesCounts["Mixed Type A"] + faciesCounts["Mixed Type B"], pct: pMixedVal },
        { name: "Na-Cl Type", count: faciesCounts["Na-Cl Type"], pct: pNaClVal },
        { name: "Na-HCO₃ Type", count: faciesCounts["Na-HCO3 Type"], pct: pNaHCO3Val },
        { name: "Ca-Cl Type", count: faciesCounts["Ca-Cl Type"], pct: pCaCl2Val }
      ].sort((a, b) => b.count - a.count || b.pct - a.pct);

      const dominantFaciesObj = faciesSummaryList[0] || { name: "Unknown", count: 0, pct: 0 };
      const dominantFaciesName = dominantFaciesObj.name;
      const dominantFaciesPct = dominantFaciesObj.pct;

      let faciesInterpretationText = "";
      if (dominantFaciesName === "Ca-Mg-HCO₃ Type") {
        faciesInterpretationText = `The dominant hydrochemical facies in ${regionName} is the <strong>Ca-Mg-HCO₃ Type</strong> (representing <strong>${dominantFaciesPct.toFixed(2)}%</strong> of samples). This indicates that groundwater in the region is primarily characterized by temporary hardness, which is typically associated with the dissolution of carbonate minerals (like calcite and dolomite) and is representative of active recharge zones containing fresh, young groundwater.`;
      } else if (dominantFaciesName === "Mixed Type") {
        faciesInterpretationText = `The dominant hydrochemical facies in ${regionName} is the <strong>Mixed Type</strong> (representing <strong>${dominantFaciesPct.toFixed(2)}%</strong> of samples). This represents a transitional groundwater zone where no single cation-anion pair is completely dominant. This mixed composition typically results from multiple geological processes including rock-water interaction, mineral dissolution, and mixing of fresh recharge with saline or agricultural runoff.`;
      } else if (dominantFaciesName === "Na-Cl Type") {
        faciesInterpretationText = `The dominant hydrochemical facies in ${regionName} is the <strong>Na-Cl Type</strong> (representing <strong>${dominantFaciesPct.toFixed(2)}%</strong> of samples). This signature is characteristic of permanent salinity and mineral dissolution. It indicates high sodium and chloride levels in groundwater, which usually points to salt-water intrusion, intense evaporation in arid/semi-arid regions, or long-term deep aquifer mineralization processes.`;
      } else if (dominantFaciesName === "Na-HCO₃ Type") {
        faciesInterpretationText = `The dominant hydrochemical facies in ${regionName} is the <strong>Na-HCO₃ Type</strong> (representing <strong>${dominantFaciesPct.toFixed(2)}%</strong> of samples). This alkali-bicarbonate signature indicates significant cation exchange processes where calcium and magnesium ions in groundwater have been replaced by sodium ions on clay minerals, typical of deeper aquifers or long residence-time water.`;
      } else if (dominantFaciesName === "Ca-Cl Type") {
        faciesInterpretationText = `The dominant hydrochemical facies in ${regionName} is the <strong>Ca-Cl Type</strong> (representing <strong>${dominantFaciesPct.toFixed(2)}%</strong> of samples). This reflects high permanent hardness and salinity, often arising from anthropogenic industrial effluents, sewage disposal, or advanced geological alteration in dry zones.`;
      } else {
        faciesInterpretationText = `A variety of hydrochemical signatures are active in ${regionName}, indicating a complex geological setting where multiple chemical facies coexist without a singular dominant profile.`;
      }

      // --- USSL Diagram Interpretation Calculation ---
      const usslValidSamples = processedFaciesSamples.filter((s) => {
        const ec = s.ecVal ?? (s as any).ec;
        const sar = s.sar;
        return ec !== null && sar !== null && !isNaN(ec) && !isNaN(sar) && ec > 0 && sar >= 0;
      });
      const totalUsslValid = usslValidSamples.length;

      let usslC1S1 = 0, usslC2S1 = 0, usslC3S1 = 0, usslC4S1 = 0;
      let usslC1S2 = 0, usslC2S2 = 0, usslC3S2 = 0, usslC4S2 = 0;
      let usslC1S3 = 0, usslC2S3 = 0, usslC3S3 = 0, usslC4S3 = 0;
      let usslC1S4 = 0, usslC2S4 = 0, usslC3S4 = 0, usslC4S4 = 0;

      usslValidSamples.forEach((s) => {
        const ec = s.ecVal ?? (s as any).ec;
        const sar = s.sar!;

        let cClass = "C1";
        if (ec < 250) cClass = "C1";
        else if (ec < 750) cClass = "C2";
        else if (ec < 2250) cClass = "C3";
        else cClass = "C4";

        let sClass = "S1";
        if (sar < 10) sClass = "S1";
        else if (sar < 18) sClass = "S2";
        else if (sar < 26) sClass = "S3";
        else sClass = "S4";

        const key = `${cClass}-${sClass}`;
        if (key === "C1-S1") usslC1S1++;
        else if (key === "C2-S1") usslC2S1++;
        else if (key === "C3-S1") usslC3S1++;
        else if (key === "C4-S1") usslC4S1++;
        else if (key === "C1-S2") usslC1S2++;
        else if (key === "C2-S2") usslC2S2++;
        else if (key === "C3-S2") usslC3S2++;
        else if (key === "C4-S2") usslC4S2++;
        else if (key === "C1-S3") usslC1S3++;
        else if (key === "C2-S3") usslC2S3++;
        else if (key === "C3-S3") usslC3S3++;
        else if (key === "C4-S3") usslC4S3++;
        else if (key === "C1-S4") usslC1S4++;
        else if (key === "C2-S4") usslC2S4++;
        else if (key === "C3-S4") usslC3S4++;
        else if (key === "C4-S4") usslC4S4++;
      });

      const safeUsslCount = usslC1S1 + usslC2S1 + usslC3S1;
      const safeUsslPct = totalUsslValid > 0 ? (safeUsslCount / totalUsslValid) * 100 : 0;
      const c2s1Pct = totalUsslValid > 0 ? (usslC2S1 / totalUsslValid) * 100 : 0;
      const c3s1Pct = totalUsslValid > 0 ? (usslC3S1 / totalUsslValid) * 100 : 0;
      const c4Count = usslC4S1 + usslC4S2 + usslC4S3 + usslC4S4;
      const c4Pct = totalUsslValid > 0 ? (c4Count / totalUsslValid) * 100 : 0;

      let usslInterpretationText = "";
      if (totalUsslValid > 0) {
        usslInterpretationText = `The United States Salinity Laboratory (USSL) diagram classifies groundwater for agricultural irrigation based on combined Electrical Conductivity (Salinity hazard) and Sodium Adsorption Ratio (Sodicity hazard). In <strong>${regionName}</strong>, <strong>${safeUsslCount} out of ${totalUsslValid} samples (${safeUsslPct.toFixed(1)}%)</strong> plot in low-sodium hazard fields (S1). Specifically, <strong>${c2s1Pct.toFixed(1)}%</strong> (${usslC2S1} samples) fall under <strong>C2-S1 (Medium Salinity – Low Sodium)</strong> and <strong>${c3s1Pct.toFixed(1)}%</strong> (${usslC3S1} samples) under <strong>C3-S1 (High Salinity – Low Sodium)</strong>. C2-S1 waters can be used for irrigation on almost all soil types without special salinity control, while C3-S1 waters require moderate soil drainage and selection of salt-tolerant crops. High-salinity C4 class waters account for <strong>${c4Pct.toFixed(1)}%</strong> (${c4Count} samples), necessitating controlled leaching and soil permeability management.`;
      } else {
        usslInterpretationText = `USSL diagram classification data is insufficient for detailed analysis in ${regionName}.`;
      }

      // --- Gibbs Cation Ratio Interpretation Calculation ---
      const gibbsValidSamples = processedFaciesSamples.filter((s) => {
        return s.hasGibbs && s.gibbsCation !== null && s.tdsVal !== null && s.tdsVal > 0;
      });
      const totalGibbsValid = gibbsValidSamples.length;

      let rockWeatheringCount = 0;
      let evaporationCount = 0;
      let precipitationCount = 0;

      gibbsValidSamples.forEach((s) => {
        const ratio = s.gibbsCation!;
        const tds = s.tdsVal!;

        if (tds < 100 && ratio > 0.5) {
          precipitationCount++;
        } else if (tds > 1000 || (tds > 500 && ratio > 0.6)) {
          evaporationCount++;
        } else {
          rockWeatheringCount++;
        }
      });

      const rockWeatheringPct = totalGibbsValid > 0 ? (rockWeatheringCount / totalGibbsValid) * 100 : 0;
      const evaporationPct = totalGibbsValid > 0 ? (evaporationCount / totalGibbsValid) * 100 : 0;
      const precipitationPct = totalGibbsValid > 0 ? (precipitationCount / totalGibbsValid) * 100 : 0;

      let gibbsInterpretationText = "";
      if (totalGibbsValid > 0) {
        gibbsInterpretationText = `The Gibbs Cation Ratio diagram [Na⁺ / (Na⁺ + Ca²⁺) vs. TDS] identifies the primary natural mechanisms controlling groundwater chemistry. In <strong>${regionName}</strong>, <strong>${rockWeatheringCount} out of ${totalGibbsValid} samples (${rockWeatheringPct.toFixed(1)}%)</strong> fall into the <strong>Rock-Water Interaction (Rock Weathering)</strong> domain. This demonstrates that chemical weathering of rock-forming minerals (silicate weathering and carbonate dissolution) is the dominant geochemical process controlling dissolved ions in groundwater. Additionally, <strong>${evaporationCount} samples (${evaporationPct.toFixed(1)}%)</strong> plot in the <strong>Evaporation-Crystallization</strong> domain, reflecting localized surface evaporation, shallow water table recycling, or extended water-rock contact times in semi-arid zones. ${precipitationCount > 0 ? `A small proportion of <strong>${precipitationPct.toFixed(1)}%</strong> (${precipitationCount} samples) is influenced by direct <strong>Precipitation / Atmospheric Recharge</strong>.` : ''}`;
      } else {
        gibbsInterpretationText = `Gibbs Cation Ratio diagram data is insufficient for process categorization in ${regionName}.`;
      }

      const sarSamples = processedFaciesSamples.filter((s) => s.hasSAR && s.sar !== null);
      const totalSARSamples = sarSamples.length;
      const rscSamples = processedFaciesSamples.filter((s) => s.hasRSC && s.rsc !== null);
      const totalRSCSamples = rscSamples.length;

      let sarHTML = "";
      if (totalSARSamples > 0) {
        let s1Count = 0;
        let s2Count = 0;
        let s3Count = 0;
        let s4Count = 0;
        sarSamples.forEach((s) => {
          const v = s.sar!;
          if (v < 10) s1Count++;
          else if (v <= 18) s2Count++;
          else if (v <= 26) s3Count++;
          else s4Count++;
        });

        const s1Pct = (s1Count / totalSARSamples) * 100;
        const s2Pct = (s2Count / totalSARSamples) * 100;
        const s3Pct = (s3Count / totalSARSamples) * 100;
        const s4Pct = (s4Count / totalSARSamples) * 100;

        sarHTML = `
          <div style="background-color: transparent; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <h4 style="font-weight: bold; color: #1e293b; font-size: 15px; margin: 0 0 10px 0;">Sodium Adsorption Ratio (SAR) Alkali Hazard</h4>
              <p style="color: #475569; line-height: 1.5; font-size: 13.5px; margin-bottom: 12px;">
                SAR assesses the sodium hazard of irrigation water. Water with high SAR can break down soil physical structure, restricting water infiltration and aeration.
                Based on the analysis of <strong>${totalSARSamples}</strong> samples:
              </p>
              <ul style="color: #475569; font-size: 12.5px; line-height: 1.5; padding-left: 18px; margin-bottom: 0;">
                <li><strong>S1 (Excellent: &lt;10)</strong>: <strong>${s1Count} samples (${s1Pct.toFixed(1)}%)</strong> - Completely safe.</li>
                <li><strong>S2 (Medium: 10-18)</strong>: <strong>${s2Count} samples (${s2Pct.toFixed(1)}%)</strong> - Appreciable hazard in clay soils.</li>
                <li><strong>S3 (High: 18-26)</strong>: <strong>${s3Count} samples (${s3Pct.toFixed(1)}%)</strong> - High risk, requires leaching.</li>
                <li><strong>S4 (Very High: &gt;26)</strong>: <strong>${s4Count} samples (${s4Pct.toFixed(1)}%)</strong> - Severely hazardous for crops.</li>
              </ul>
            </div>
          </div>
        `;
      }

      let rscHTML = "";
      if (totalRSCSamples > 0) {
        let rscExcellentCount = 0;
        let rscAcceptableCount = 0;
        let rscUnsuitableCount = 0;
        rscSamples.forEach((s) => {
          const v = s.rsc!;
          if (v < 1.25) rscExcellentCount++;
          else if (v <= 2.5) rscAcceptableCount++;
          else rscUnsuitableCount++;
        });

        const rscExPct = (rscExcellentCount / totalRSCSamples) * 100;
        const rscAcPct = (rscAcceptableCount / totalRSCSamples) * 100;
        const rscUnPct = (rscUnsuitableCount / totalRSCSamples) * 100;

        rscHTML = `
          <div style="background-color: transparent; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; border-left: 4px solid #06b6d4; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <h4 style="font-weight: bold; color: #1e293b; font-size: 15px; margin: 0 0 10px 0;">Residual Sodium Carbonate (RSC) Alkali Hazard</h4>
              <p style="color: #475569; line-height: 1.5; font-size: 13.5px; margin-bottom: 12px;">
                RSC measures excess carbonate and bicarbonate over Ca & Mg. High RSC causes Ca/Mg precipitation, enhancing sodium hazard and soil alkalization.
                Based on the analysis of <strong>${totalRSCSamples}</strong> samples:
              </p>
              <ul style="color: #475569; font-size: 12.5px; line-height: 1.5; padding-left: 18px; margin-bottom: 0;">
                <li><strong>Safe (&lt;1.25 meq/L)</strong>: <strong>${rscExcellentCount} samples (${rscExPct.toFixed(1)}%)</strong> - Suitable for irrigation.</li>
                <li><strong>Marginal (1.25 - 2.5 meq/L)</strong>: <strong>${rscAcceptableCount} samples (${rscAcPct.toFixed(1)}%)</strong> - Requires leaching and gypsum.</li>
                <li><strong>Unsuitable (&gt;2.5 meq/L)</strong>: <strong>${rscUnsuitableCount} samples (${rscUnPct.toFixed(1)}%)</strong> - Severe alkali threat to crops.</li>
              </ul>
            </div>
          </div>
        `;
      }

      let faciesAndSuitabilityHTML = "";
      if (totalValidFacies > 0) {
        faciesAndSuitabilityHTML = `
          <!-- Hydrochemical Facies & Agricultural Suitability Section -->
          <div style="margin-bottom: 40px;">
            <h3 style="font-size: 20px; font-weight: 900; color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin: 0 0 20px 0;">Hydrogeochemical Facies & Agricultural Suitability</h3>
            
            <p style="color: #475569; font-size: 14.5px; line-height: 1.6; margin-bottom: 20px;">
              Comprehensive hydrochemical evaluation combining Piper trilinear facies classification, U.S. Salinity Laboratory (USSL) irrigation hazard matrix, and Gibbs rock-water interaction mechanism plots for <strong>${districtRegionStr}</strong>.
            </p>

            <!-- COMPOSITE HYDROGEOCHEMICAL DIAGRAMS PANEL WITH COMMON LEGEND -->
            <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; margin-bottom: 25px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);">
              <h4 style="font-size: 15px; font-weight: 900; color: #1e3a8a; margin: 0 0 16px 0; text-align: center; letter-spacing: 0.01em;">
                Figure 3: Hydrogeochemical Facies & Classification Diagrams for ${districtRegionStr} Groundwater Samples
              </h4>

              <!-- 2x2 Grid Layout Table for the 4 Diagrams -->
              <table class="layout-table" style="width: 100%; border-collapse: separate; border-spacing: 16px; border: none; margin: 0 auto;">
                <tr>
                  <td style="width: 50%; vertical-align: top; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; background: #ffffff; text-align: center;">
                    <h5 style="font-size: 12.5px; font-weight: 900; color: #1e3a8a; margin: 0 0 10px 0;">(A) Piper Diagram – Hydrochemical Facies</h5>
                    <div style="width: 100%; max-width: 395px; height: 288px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                      ${generatePiperDiagramHTML(districtRegionStr, validFaciesSamples, false)}
                    </div>
                    <p style="text-align: center; font-style: italic; font-size: 11px; margin-top: 10px; margin-bottom: 0; color: #334155; font-weight: bold;">
                      Figure 3a: Piper Diagram – Hydrochemical Facies in ${districtRegionStr}
                    </p>
                  </td>
                  <td style="width: 50%; vertical-align: top; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; background: #ffffff; text-align: center;">
                    <h5 style="font-size: 12.5px; font-weight: 900; color: #1e3a8a; margin: 0 0 10px 0;">(B) USSL Diagram – Irrigation Water Classification</h5>
                    <div style="width: 100%; max-width: 395px; height: 288px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                      ${generateUsslDiagramHTML(validFaciesSamples)}
                    </div>
                    <p style="text-align: center; font-style: italic; font-size: 11px; margin-top: 10px; margin-bottom: 0; color: #334155; font-weight: bold;">
                      Figure 3b: USSL Diagram – Irrigation Water Classification in ${districtRegionStr}
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="width: 50%; vertical-align: top; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; background: #ffffff; text-align: center;">
                    <h5 style="font-size: 12.5px; font-weight: 900; color: #1e3a8a; margin: 0 0 10px 0;">(C1) Gibbs Cation Ratio Diagram</h5>
                    <div style="width: 100%; max-width: 395px; height: 288px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                      ${generateGibbsDiagramHTML("cation", districtRegionStr, validFaciesSamples)}
                    </div>
                    <p style="text-align: center; font-style: italic; font-size: 11px; margin-top: 10px; margin-bottom: 0; color: #334155; font-weight: bold;">
                      Figure 3c: Gibbs Cation Ratio Diagram in ${districtRegionStr}
                    </p>
                  </td>
                  <td style="width: 50%; vertical-align: top; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; background: #ffffff; text-align: center;">
                    <h5 style="font-size: 12.5px; font-weight: 900; color: #1e3a8a; margin: 0 0 10px 0;">(C2) Gibbs Anion Ratio Diagram</h5>
                    <div style="width: 100%; max-width: 395px; height: 288px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                      ${generateGibbsDiagramHTML("anion", districtRegionStr, validFaciesSamples)}
                    </div>
                    <p style="text-align: center; font-style: italic; font-size: 11px; margin-top: 10px; margin-bottom: 0; color: #334155; font-weight: bold;">
                      Figure 3d: Gibbs Anion Ratio Diagram in ${districtRegionStr}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Single Common Legend for All Three Diagram Types -->
              <div style="margin-top: 15px;">
                ${generateBlockLegendHTML()}
              </div>
            </div>

            <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 22px; margin-bottom: 25px; line-height: 1.6; font-size: 13.5px; text-align: justify; color: #334155; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
              <h4 style="font-weight: 900; color: #1e3a8a; margin-top: 0; margin-bottom: 16px; font-size: 15.5px; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 8px;">
                Hydrochemical & Classification Diagrams Interpretation
              </h4>

              <div style="margin-bottom: 16px;">
                <h5 style="font-weight: 800; color: #1e3a8a; font-size: 14px; margin: 0 0 6px 0;">(A) Piper Trilinear Diagram (Hydrochemical Facies)</h5>
                <p style="margin: 0; line-height: 1.6;">${faciesInterpretationText}</p>
              </div>

              <div style="margin-bottom: 16px;">
                <h5 style="font-weight: 800; color: #1e3a8a; font-size: 14px; margin: 0 0 6px 0;">(B) USSL Diagram (Irrigation Water Classification)</h5>
                <p style="margin: 0; line-height: 1.6;">${usslInterpretationText}</p>
              </div>

              <div>
                <h5 style="font-weight: 800; color: #1e3a8a; font-size: 14px; margin: 0 0 6px 0;">(C) Gibbs Cation Ratio Diagram (Governing Geochemical Processes)</h5>
                <p style="margin: 0; line-height: 1.6;">${gibbsInterpretationText}</p>
              </div>
            </div>

            <!-- Facies Distribution Table -->
            <div style="overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 10px; margin-bottom: 30px;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; background-color: #ffffff; font-size: 11px;">
                <thead style="background-color: #f1f5f9; color: #1e293b; font-weight: bold; font-size: 10.5px; text-transform: uppercase;">
                  <tr>
                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">Hydrochemical Facies (Water Type)</th>
                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">Environmental / Geochemical Significance</th>
                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center;">No. of Samples</th>
                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center;">Percentage (%)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="background-color: #f8fafc; line-height: 1.1;">
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; font-weight: bold; color: #4f46e5;">Ca-Mg-HCO₃ Type</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; font-style: italic;">Carbonate weathering / Active fresh recharge</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; text-align: center;">${faciesCounts["Ca-Mg-HCO3 Type"]}</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${pCaHCO3Val.toFixed(2)}%</td>
                  </tr>
                  <tr style="line-height: 1.1;">
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; font-weight: bold; color: #10b981;">Mixed Type</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; font-style: italic;">Lithological mixing / Transitional water characteristics</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; text-align: center;">${faciesCounts["Mixed Type A"] + faciesCounts["Mixed Type B"]}</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${pMixedVal.toFixed(2)}%</td>
                  </tr>
                  <tr style="background-color: #f8fafc; line-height: 1.1;">
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; font-weight: bold; color: #f43f5e;">Na-Cl Type</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; font-style: italic;">Arid salinization / Deep mineral dissolution / Marine mixing</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; text-align: center;">${faciesCounts["Na-Cl Type"]}</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${pNaClVal.toFixed(2)}%</td>
                  </tr>
                  <tr style="line-height: 1.1;">
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; font-weight: bold; color: #06b6d4;">Na-HCO₃ Type</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; font-style: italic;">Base ion exchange / Alkali-bicarbonate enrichment</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; text-align: center;">${faciesCounts["Na-HCO3 Type"]}</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${pNaHCO3Val.toFixed(2)}%</td>
                  </tr>
                  <tr style="background-color: #f8fafc; line-height: 1.1;">
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; font-weight: bold; color: #eab308;">Ca-Cl Type</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; font-style: italic;">Permanent hard-water signature / Anthropogenic leakage</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; text-align: center;">${faciesCounts["Ca-Cl Type"]}</td>
                    <td style="padding: 2px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${pCaCl2Val.toFixed(2)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4 style="font-weight: 900; color: #1e3a8a; font-size: 16px; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 5px; margin-top: 35px; margin-bottom: 15px;">Irrigation Water Suitability Index Assessments</h4>
            <p style="color: #475569; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">
              To evaluate suitability for agricultural and crop production, groundwater samples have been evaluated using the Sodium Adsorption Ratio (SAR) and Residual Sodium Carbonate (RSC) indexes. These metrics classify alkali hazards and sodium toxicity.
            </p>

            <div class="sar-rsc-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; align-items: stretch; margin-top: 15px;">
              ${sarHTML}
              ${rscHTML}
            </div>

          </div>
        `;
      }

      let summaryMapHtml = "";
      if (summaryMapBase64) {
        summaryMapHtml = `
          <div style="margin-top: 24px; margin-bottom: 28px; text-align: center; border: 1px solid #cbd5e1; border-radius: 12px; background-color: #ffffff; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
            <h4 style="color: #1e3b8a; font-weight: bold; margin-bottom: 12px; font-size: 15px;">Figure 2: Overall Groundwater Contamination Spatial Map of ${districtRegionStr}</h4>
            <img src="${summaryMapBase64}" alt="Overall Contamination Map" style="max-height: 480px; display: block; margin: 0 auto; max-width: 100%; border-radius: 8px;" />
          </div>
        `;
      }

      let textParaFaciesAgricultural = "";
      if (totalValidFacies > 0) {
        textParaFaciesAgricultural = `<strong>Hydrogeochemical Facies & Irrigation Water Quality Indices Analysis:</strong> Hydrogeochemical evaluation based on Piper trilinear facies classification identifies <strong>${dominantFaciesName}</strong> as the dominant groundwater type in <strong>${districtRegionStr}</strong>, accounting for <strong>${dominantFaciesPct.toFixed(2)}%</strong> (${dominantFaciesObj.count} samples) of analyzed locations. The distribution of hydrochemical facies is: <strong>Ca-Mg-HCO₃ Type</strong> (${pCaHCO3Val.toFixed(2)}%, ${faciesCounts["Ca-Mg-HCO3 Type"]} samples), <strong>Mixed Type</strong> (${pMixedVal.toFixed(2)}%, ${faciesCounts["Mixed Type A"] + faciesCounts["Mixed Type B"]} samples), <strong>Na-Cl Type</strong> (${pNaClVal.toFixed(2)}%, ${faciesCounts["Na-Cl Type"]} samples), <strong>Na-HCO₃ Type</strong> (${pNaHCO3Val.toFixed(2)}%, ${faciesCounts["Na-HCO3 Type"]} samples), and <strong>Ca-Cl Type</strong> (${pCaCl2Val.toFixed(2)}%, ${faciesCounts["Ca-Cl Type"]} samples). Classification via the <strong>USSL Diagram</strong> indicates that <strong>${safeUsslPct.toFixed(1)}%</strong> of samples fall into safe low-sodicity categories (C2-S1 & C3-S1). Furthermore, the <strong>Gibbs Cation Ratio Diagram</strong> reveals that <strong>${rockWeatheringPct.toFixed(1)}%</strong> of samples are governed by <strong>Rock-Water Interaction</strong> (mineral weathering). For agricultural application, assessment via the <strong>Sodium Adsorption Ratio (SAR)</strong> and <strong>Residual Sodium Carbonate (RSC)</strong> matrices demonstrates sodicity and alkalinity hazards, evaluating sodium toxicity and determining overall water suitability for crop irrigation.`;
      }

      // Assemble final HTML with mobile responsive stylesheet
      const finalHTML = `
        <style>
          @media (max-width: 768px) {
            .sar-rsc-grid {
              grid-template-columns: 1fr !important;
            }
            .pamphlet-outer-wrapper {
              padding: 12px !important;
              border-radius: 16px !important;
            }
            .pamphlet-header-block {
              padding: 18px 14px !important;
              border-radius: 14px !important;
              margin-bottom: 24px !important;
            }
            .pamphlet-header-block h1 {
              font-size: 18px !important;
              margin-bottom: 10px !important;
            }
            .pamphlet-header-block p {
              font-size: 12.5px !important;
            }
            .executive-summary-block {
              padding: 18px 14px !important;
              border-radius: 16px !important;
              margin-top: 25px !important;
            }
            .executive-summary-block h3 {
              font-size: 17px !important;
            }
            .layout-table, .layout-table tbody, .layout-table tr, .layout-table td {
              display: block !important;
              width: 100% !important;
              box-sizing: border-box !important;
            }
            .layout-table td {
              padding: 6px 0 !important;
            }
            table {
              font-size: 11px !important;
            }
            th, td {
              padding: 2px 6px !important;
              line-height: 1.1 !important;
              font-size: 10.5px !important;
            }
            svg {
              max-width: 100% !important;
              height: auto !important;
              width: 100% !important;
            }
          }
          .pamphlet-outer-wrapper table th {
            padding: 3px 6px !important;
            line-height: 1.1 !important;
            font-size: 10.5px !important;
            height: auto !important;
          }
          .pamphlet-outer-wrapper table td {
            padding: 2px 6px !important;
            line-height: 1.1 !important;
            font-size: 10.5px !important;
            height: auto !important;
          }
        </style>

        <div class="pamphlet-outer-wrapper" style="font-family: 'Times New Roman', Times, serif; max-width: 1000px; width: 100%; margin: 0 auto; background-color: #ffffff; padding: 25px; border-radius: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); box-sizing: border-box;">
          
          <!-- Pamphlet Header -->
          <div class="pamphlet-header-block" style="background: #ffffff; padding: 30px; border-radius: 20px; border: 1.5px solid #e2e8f0; text-align: center; margin-bottom: 40px;">
            <span style="display: inline-block; padding: 6px 16px; border-radius: 9999px; background-color: #d1fae5; color: #065f46; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px;">Official Assessment Pamphlet</span>
            <h1 style="font-size: 26px; font-weight: 900; color: #0f172a; margin: 0 0 15px 0;">Comprehensive Groundwater Quality Assessment of <span style="color: #4f46e5;">${districtRegionStr}</span>, ${stateNameStr}</h1>
            <p style="color: #475569; font-size: 14.5px; line-height: 1.6; max-width: 800px; margin: 0 auto;">
              A comprehensive groundwater quality assessment was carried out for <strong>${districtRegionStr}</strong> based on the analysis of <strong>${totalSamples}</strong> groundwater samples collected from various blocks and habitations. The assessment evaluated major physicochemical parameters and heavy/trace metals to determine groundwater suitability for drinking purposes as per Bureau of Indian Standards (BIS IS 10500).
            </p>
          </div>

          <!-- Consolidated Parameter Assessment Block (Single Paragraph for All Parameters) -->
          ${unifiedParametersParagraphHTML}

          <!-- Overall Parameter Compliance Distribution Chart Figure -->
          ${
            summaryChartImageBase64
              ? `
            <div style="margin: 25px auto 35px auto; text-align: center; border: 1px solid #cbd5e1; border-radius: 12px; background-color: #ffffff; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
              <h4 style="color: #1e3b8a; font-weight: bold; margin: 0 0 12px 0; font-size: 15px;">Figure 1: Overall Parameter Compliance Distribution in ${districtRegionStr}</h4>
              <img src="${summaryChartImageBase64}" alt="Overall Compliance Distribution" style="max-height: 420px; width: auto; max-width: 100%; display: block; margin: 0 auto; object-fit: contain;" />
            </div>
            `
              : ""
          }

          <!-- Contaminated Locations Data Grid -->
          ${
            locationTableHTML
              ? `
            <div style="margin-bottom: 35px;">
              <h3 style="font-size: 20px; font-weight: 900; color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin: 0 0 15px 0;">Locations Showing Multiple Parameter Exceedances</h3>
              <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid #cbd5e1; border-radius: 12px; width: 100%;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; background-color: #ffffff;">
                  <thead style="background-color: #f1f5f9; color: #1e293b; font-weight: bold; font-size: 11px; text-transform: uppercase;">
                    <tr>
                      <th style="padding: 12px; border: 1px solid #cbd5e1;">Block/Taluk</th>
                      <th style="padding: 12px; border: 1px solid #cbd5e1;">Location</th>
                      <th style="padding: 12px; border: 1px solid #cbd5e1;">Latitude</th>
                      <th style="padding: 12px; border: 1px solid #cbd5e1;">Longitude</th>
                      <th style="padding: 12px; border: 1px solid #cbd5e1; text-align: center;">Exceeding Params</th>
                      <th style="padding: 12px; border: 1px solid #cbd5e1;">Names</th>
                      <th style="padding: 12px; border: 1px solid #cbd5e1;">Values & Units</th>
                      <th style="padding: 12px; border: 1px solid #cbd5e1;">Contamination Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${locationTableHTML}
                  </tbody>
                </table>
              </div>
            </div>
            `
              : ""
          }

          <!-- Groundwater Contamination Spatial Map Figure -->
          ${summaryMapHtml}

          <!-- Remedial Measures section removed per user request -->

          <!-- Hydrochemical Facies and Agricultural Suitability -->
          ${faciesAndSuitabilityHTML}

          <!-- Executive summaries context block -->
          <div class="executive-summary-block" style="background-color: #ffffff; color: #1e293b; padding: 35px; border-radius: 24px; margin-top: 40px; position: relative; border: 1.5px solid #cbd5e1;">
            <h3 style="font-size: 22px; font-weight: 900; color: #1e3a8a; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 12px; margin: 0 0 20px 0;">Executive Summary & Interpretation</h3>
            
            <div style="color: #334155; line-height: 1.6; font-size: 14.5px; text-align: justify; margin-bottom: 30px;">
              <p style="margin-bottom: 16px;">${textPara1}</p>
              <p style="margin-bottom: 16px;">${textParaCompliance}</p>
              <p style="margin-bottom: 16px;">${textPara2}</p>
              ${textParaHeavy ? `<p style="margin-bottom: 16px;">${textParaHeavy}</p>` : ""}
              ${textParaFaciesAgricultural ? `<p style="margin-bottom: 16px;">${textParaFaciesAgricultural}</p>` : ""}
              <p style="margin-bottom: 16px;">${textPara3}</p>
              <p style="margin-bottom: 16px;">${textPara4}</p>
            </div>

            <!-- Parameter Summary Table Section -->
            ${parameterSummaryTableSectionHTML}

            <!-- Recommended management controls -->
            <div style="display: grid; grid-template-columns: 1fr; gap: 20px; font-size: 13.5px; margin-top: 30px;">
              <div style="background-color: #f8fafc; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; color: #1e293b;">
                <h4 style="color: #059669; font-weight: bold; font-size: 15px; margin: 0 0 10px 0;">Resource Management</h4>
                <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.5;">
                  <li style="margin-bottom: 5px;">Continuous seasonal groundwater quality monitoring metrics.</li>
                  <li style="margin-bottom: 5px;">Artificial groundwater recharge systems & rainwater harvesting.</li>
                  <li style="margin-bottom: 5px;">Regulation of excessive extraction volumes in vulnerable geogenic zones.</li>
                </ul>
              </div>
              <div style="background-color: #f8fafc; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; color: #1e293b;">
                <h4 style="color: #d97706; font-weight: bold; font-size: 15px; margin: 0 0 10px 0;">Resource Quality Remedies</h4>
                <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.5;">
                  <li style="margin-bottom: 5px;">Installation of suitable municipal filter channels (Softening, RO modules).</li>
                  <li style="margin-bottom: 5px;">Regulating intensive commercial agricultural pesticide/fertilizer use load.</li>
                  <li style="margin-bottom: 5px;">Fostering native public health awareness campaigns.</li>
                </ul>
              </div>
            </div>

          </div>

        </div>
      `;

      setPamphletHtml(finalHTML);
      setHasGenerated(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportWord = async (format: "doc" | "html" | "docx" = "doc") => {
    const titleVal = selectedDistrict || selectedState || "India";
    await downloadMhtmlWordDoc(pamphletHtml, `GWQ_Assessment_Pamphlet_${titleVal}`, format);
  };

  const selectSummaryOptionsLength = selectedPamphletParams.length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="glossy-panel p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl space-y-4 sm:space-y-6">
        
        {/* Heading */}
        <div className="border-b border-white/50 pb-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-indigo-900 flex items-center gap-2.5 sm:gap-3 drop-shadow-md">
              <LayoutTemplate className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 shrink-0" />
              District GWQ Assessment Report
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Generate a comprehensive, colorful official pamphlet summarizing water quality based on current filters.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full lg:w-auto">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || selectSummaryOptionsLength === 0}
              className="glossy-btn-indigo px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-50 flex-1 sm:flex-initial justify-center"
            >
              <FileCheck2 className="w-4 h-4 shrink-0" /> Generate Pamphlet
            </button>
            {hasGenerated && (
              <>
                <button
                  onClick={() => handleExportWord("docx")}
                  className="glossy-btn-emerald px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer flex-1 sm:flex-initial justify-center"
                  title="Best for modern Microsoft Word, Google Docs, and WPS Office."
                >
                  <FileDown className="w-4 h-4 shrink-0" /> Export DOCX (.docx)
                </button>
                <button
                  onClick={() => handleExportWord("doc")}
                  className="glossy-btn-emerald/80 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer flex-1 sm:flex-initial justify-center"
                  title="Legacy format for Microsoft Word."
                >
                  <FileDown className="w-4 h-4 shrink-0" /> Export Word (.doc)
                </button>
                <button
                  onClick={() => handleExportWord("html")}
                  className="glossy-btn-indigo px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer flex-1 sm:flex-initial justify-center"
                  title="Best for Google Docs, Google Drive, and Mobile WPS Office."
                >
                  <Globe className="w-4 h-4 shrink-0" /> Export Google Docs/WPS (.html)
                </button>
              </>
            )}
          </div>
        </div>

        {/* Parameter choose selector list specifically for pamphlet summary builder */}
        <div className="bg-white/40 shadow-inner p-4 sm:p-6 rounded-2xl border border-white/60 relative z-30">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 drop-shadow-sm">
            Select Parameters to Analyze in Pamphlet
          </label>
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full glossy-input rounded-xl p-3 font-bold text-slate-700 flex justify-between items-center text-left bg-white text-xs select-none"
            >
              <span className="truncate">
                {selectedPamphletParams.length === availableParams.length
                  ? "All Parameters Selected"
                  : `${selectedPamphletParams.length}/${availableParams.length} Selected`}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0ml-1.5" />
            </button>
            
            {dropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 shadow-2xl rounded-2xl z-[120] max-h-60 overflow-y-auto custom-scrollbar p-2">
                <label className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer border-b border-slate-100 font-bold text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedPamphletParams.length === availableParams.length}
                    onChange={handleSelectAll}
                    className="rounded text-indigo-600 w-4 h-4"
                  />
                  <span>Select All</span>
                </label>
                {availableParams.map((val) => (
                  <label key={val} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={selectedPamphletParams.includes(val)}
                      onChange={() => handleToggleParam(val)}
                      className="rounded text-indigo-600 w-4 h-4"
                    />
                    <span>{val}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Map uploading triggers */}
        <div className="bg-white/40 shadow-inner p-6 rounded-2xl border border-white/60">
          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3 drop-shadow-sm">
            Additional Map Uploads (Optional)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
              <label className="text-xs font-bold text-slate-700 block mb-2 flex items-center gap-2">
                <Map className="w-4 h-4 text-indigo-500" /> 1. Upload EC IDW Map (Displayed in EC Section)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleMapUpload(e, "ec")}
                className="text-xs w-full cursor-pointer file:mr-2 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
              <label className="text-xs font-bold text-slate-700 block mb-2 flex items-center gap-2">
                <Map className="w-4 h-4 text-emerald-500" /> 2. Upload Overall Contamination Map (Displayed in Summary)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleMapUpload(e, "summary")}
                className="text-xs w-full cursor-pointer file:mr-2 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
              />
            </div>
          </div>
        </div>

        {/* Real-time Generated preview document space */}
        <div className="bg-white/40 p-2 md:p-8 rounded-2xl shadow-inner border border-white/60 min-h-[400px]">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="font-bold text-indigo-600 animate-pulse drop-shadow-sm text-center">
                Analyzing comprehensive data variables...<br />
                <span className="text-xs text-slate-400 mt-2 block">Synthesizing executive assessment pamphlet...</span>
              </p>
            </div>
          ) : hasGenerated ? (
            <div 
              className="w-full h-full bg-white p-4 md:p-8 border border-slate-200 rounded-xl overflow-auto shadow-inner"
              dangerouslySetInnerHTML={{ __html: pamphletHtml }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-60">
              <LayoutTemplate className="w-16 h-16 text-slate-400" />
              <p className="font-bold text-slate-500 uppercase tracking-widest text-center text-xs">
                Click "Generate Pamphlet" to compile WQ metrics <br />
                and construct the official assessment pamphlet layout.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
