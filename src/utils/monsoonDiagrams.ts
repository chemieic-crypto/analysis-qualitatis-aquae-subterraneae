import { PARAM_CONFIG } from "../data/config";
import { ShapefileLayer } from "../types";
import { featureMatchesSelection, isStateAll, isDistrictAll, norm } from "./shapefileFilter";
import { INDIA_BOUNDARY } from "../data/india_boundary";
import { safeMin, safeMax } from "./math";

export const getMonsoonPercentile = (sortedArr: number[], p: number): number => {
  if (!sortedArr.length) return 0;
  if (sortedArr.length === 1) return sortedArr[0];
  const idx = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight;
};

export interface MonsoonStats {
  min: number;
  q1: number;
  median: number;
  mean: number;
  q3: number;
  max: number;
}

export const getMonsoonStats = (arr: number[]): MonsoonStats => {
  if (!arr.length) return { min: 0, q1: 0, median: 0, mean: 0, q3: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const median = getMonsoonPercentile(sorted, 50);
  const q1 = getMonsoonPercentile(sorted, 25);
  const q3 = getMonsoonPercentile(sorted, 75);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { min, q1, median, mean, q3, max };
};

export const generateMonsoonDualOgiveSVG = (
  preVals: number[], 
  postVals: number[], 
  paramName: string, 
  unit: string,
  basePeriodName: string = "Pre-Monsoon",
  compPeriodName: string = "Post-Monsoon"
): string => {
  if (!preVals.length || !postVals.length) return "";
  const sortedPre = [...preVals].sort((a, b) => a - b);
  const sortedPost = [...postVals].sort((a, b) => a - b);

  const maxVal = safeMax(sortedPre, sortedPost, 0.001);
  const minVal = 0;

  const width = 960;
  const height = 520;
  const topPad = 130; // Increased top padding to place stats boxes cleanly above curve area
  const botPad = 55;
  const panelW = 410;
  const panelH = height - topPad - botPad;

  const p1Left = 60;
  const p2Left = p1Left + panelW + 60;

  const getX = (v: number, leftOffset: number) => 
    leftOffset + Math.min(1, Math.max(0, (v - minVal) / (maxVal - minVal))) * (panelW - 20);

  const getY = (pct: number) => topPad + panelH - (pct / 100) * panelH;

  const preStats = getMonsoonStats(sortedPre);
  const postStats = getMonsoonStats(sortedPost);

  // Pre-Monsoon Path & Points
  let pathPre = "";
  sortedPre.forEach((val, i) => {
    const pct = ((i + 1) / sortedPre.length) * 100;
    const x = getX(val, p1Left + 10);
    const y = getY(pct);
    pathPre += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  // Post-Monsoon Path & Points
  let pathPost = "";
  sortedPost.forEach((val, i) => {
    const pct = ((i + 1) / sortedPost.length) * 100;
    const x = getX(val, p2Left + 10);
    const y = getY(pct);
    pathPost += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  let gridP1 = "";
  let gridP2 = "";

  [0, 25, 50, 75, 90, 100].forEach((pct) => {
    const y = getY(pct);
    const isMajor = pct === 50 || pct === 90;

    gridP1 += `<line x1="${p1Left}" y1="${y}" x2="${p1Left + panelW}" y2="${y}" stroke="#e2e8f0" stroke-width="${isMajor ? 1.5 : 1}" stroke-dasharray="${isMajor ? '4 4' : 'none'}" />`;
    gridP1 += `<text x="${p1Left - 8}" y="${y + 4}" text-anchor="end" font-size="9.5px" fill="#64748b">${pct}%</text>`;

    gridP2 += `<line x1="${p2Left}" y1="${y}" x2="${p2Left + panelW}" y2="${y}" stroke="#e2e8f0" stroke-width="${isMajor ? 1.5 : 1}" stroke-dasharray="${isMajor ? '4 4' : 'none'}" />`;
    gridP2 += `<text x="${p2Left - 8}" y="${y + 4}" text-anchor="end" font-size="9.5px" fill="#64748b">${pct}%</text>`;
  });

  const numTicks = 4;
  for (let i = 0; i <= numTicks; i++) {
    const val = minVal + (i / numTicks) * (maxVal - minVal);
    const x1 = getX(val, p1Left + 10);
    const x2 = getX(val, p2Left + 10);

    gridP1 += `<line x1="${x1}" y1="${topPad + panelH}" x2="${x1}" y2="${topPad + panelH + 5}" stroke="#94a3b8" stroke-width="1" />`;
    gridP1 += `<text x="${x1}" y="${topPad + panelH + 18}" text-anchor="middle" font-size="9.5px" fill="#64748b">${val < 10 ? val.toFixed(1) : Math.round(val)}</text>`;

    gridP2 += `<line x1="${x2}" y1="${topPad + panelH}" x2="${x2}" y2="${topPad + panelH + 5}" stroke="#94a3b8" stroke-width="1" />`;
    gridP2 += `<text x="${x2}" y="${topPad + panelH + 18}" text-anchor="middle" font-size="9.5px" fill="#64748b">${val < 10 ? val.toFixed(1) : Math.round(val)}</text>`;
  }

  const unitLabel = unit ? ` (${unit})` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
    <text x="${width / 2}" y="24" text-anchor="middle" font-size="15px" font-weight="bold" fill="#1e3a8a">Pre-Monsoon vs Post-Monsoon Cumulative Frequency (Ogive) Curves - ${paramName}</text>
    <text x="${width / 2}" y="42" text-anchor="middle" font-size="11.5px" font-weight="bold" fill="#64748b">Individual Period Percentile Distributions (${basePeriodName} vs ${compPeriodName})</text>

    <!-- PANEL 1: PRE-MONSOON OGIVE CURVE -->
    <!-- Header Stats Banner (Positioned Above Curve Canvas to Prevent Line Overlap) -->
    <g transform="translate(${p1Left}, 52)">
      <rect x="0" y="0" width="${panelW}" height="42" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1" rx="6" />
      <text x="10" y="16" font-size="10.5px" font-weight="bold" fill="#1d4ed8">1. PRE-MONSOON STATS (${basePeriodName})</text>
      <text x="10" y="32" font-size="9.5px" font-weight="bold" fill="#1e293b">Min: ${preStats.min.toFixed(2)} | Q1: ${preStats.q1.toFixed(2)} | Med: ${preStats.median.toFixed(2)} | Mean: ${preStats.mean.toFixed(2)} | Q3: ${preStats.q3.toFixed(2)} | Max: ${preStats.max.toFixed(2)} ${unitLabel}</text>
    </g>
    <rect x="${p1Left}" y="${topPad}" width="${panelW}" height="${panelH}" fill="#f8fafc" stroke="#cbd5e1" rx="6" />
    ${gridP1}
    <path d="${pathPre}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linejoin="round" />
    <text x="${p1Left + panelW / 2}" y="${height - 14}" text-anchor="middle" font-size="10.5px" font-weight="bold" fill="#1e293b">Concentration ${unitLabel}</text>
    <text x="18" y="${topPad + panelH / 2}" text-anchor="middle" font-size="10px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${topPad + panelH / 2})">Cumulative %</text>

    <!-- PANEL 2: POST-MONSOON OGIVE CURVE -->
    <!-- Header Stats Banner (Positioned Above Curve Canvas to Prevent Line Overlap) -->
    <g transform="translate(${p2Left}, 52)">
      <rect x="0" y="0" width="${panelW}" height="42" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1" rx="6" />
      <text x="10" y="16" font-size="10.5px" font-weight="bold" fill="#047857">2. POST-MONSOON STATS (${compPeriodName})</text>
      <text x="10" y="32" font-size="9.5px" font-weight="bold" fill="#1e293b">Min: ${postStats.min.toFixed(2)} | Q1: ${postStats.q1.toFixed(2)} | Med: ${postStats.median.toFixed(2)} | Mean: ${postStats.mean.toFixed(2)} | Q3: ${postStats.q3.toFixed(2)} | Max: ${postStats.max.toFixed(2)} ${unitLabel}</text>
    </g>
    <rect x="${p2Left}" y="${topPad}" width="${panelW}" height="${panelH}" fill="#f8fafc" stroke="#cbd5e1" rx="6" />
    ${gridP2}
    <path d="${pathPost}" fill="none" stroke="#059669" stroke-width="3" stroke-linejoin="round" />
    <text x="${p2Left + panelW / 2}" y="${height - 14}" text-anchor="middle" font-size="10.5px" font-weight="bold" fill="#1e293b">Concentration ${unitLabel}</text>
    <text x="${p2Left - 42}" y="${topPad + panelH / 2}" text-anchor="middle" font-size="10px" font-weight="bold" fill="#1e293b" transform="rotate(-90, ${p2Left - 42}, ${topPad + panelH / 2})">Cumulative %</text>
  </svg>`;
};

export const generateMonsoonBoxPlotSVG = (
  preVals: number[], 
  postVals: number[], 
  paramName: string, 
  unit: string,
  basePeriodName: string = "Pre-Monsoon",
  compPeriodName: string = "Post-Monsoon"
): string => {
  if (!preVals.length || !postVals.length) return "";
  const preStats = getMonsoonStats(preVals);
  const postStats = getMonsoonStats(postVals);

  // AUTO-ADJUSTED AXIS CALCULATION
  const dataMin = Math.min(preStats.min, postStats.min);
  const dataMax = Math.max(preStats.max, postStats.max);
  const range = Math.max(0.001, dataMax - dataMin);
  const pad = range * 0.12;

  let minVal = dataMin - pad;
  if (dataMin >= 0 && minVal < 0) {
    minVal = 0;
  } else {
    minVal = Math.floor(minVal * 10) / 10;
  }

  let maxVal = Math.ceil((dataMax + pad) * 10) / 10;
  if (maxVal <= minVal) maxVal = minVal + 1;

  const width = 680;
  const height = 430;
  const padLeft = 75;
  const padRight = 40;
  const padTop = 50;
  const padBottom = 60;

  const plotH = height - padTop - padBottom;
  const getY = (v: number) => padTop + plotH - (Math.min(1, Math.max(0, (v - minVal) / (maxVal - minVal)))) * plotH;

  let gridHTML = "";
  const numTicks = 5;
  for (let i = 0; i <= numTicks; i++) {
    const val = minVal + (i / numTicks) * (maxVal - minVal);
    const y = getY(val);
    gridHTML += `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`;
    gridHTML += `<text x="${padLeft - 10}" y="${y + 4}" text-anchor="end" font-size="10px" font-family="'Times New Roman', serif" fill="#64748b">${val < 10 ? val.toFixed(2) : Math.round(val)}</text>`;
  }

  const renderBox = (stats: MonsoonStats, cx: number, label: string, colorHex: string, borderHex: string) => {
    const yMin = getY(stats.min);
    const yQ1 = getY(stats.q1);
    const yMed = getY(stats.median);
    const yMean = getY(stats.mean);
    const yQ3 = getY(stats.q3);
    const yMax = getY(stats.max);

    const boxW = 110;
    const xLeft = cx - boxW / 2;

    return `
      <line x1="${cx}" y1="${yMax}" x2="${cx}" y2="${yQ3}" stroke="${borderHex}" stroke-width="2" />
      <line x1="${cx}" y1="${yQ1}" x2="${cx}" y2="${yMin}" stroke="${borderHex}" stroke-width="2" />
      <line x1="${cx - 22}" y1="${yMax}" x2="${cx + 22}" y2="${yMax}" stroke="${borderHex}" stroke-width="2" />
      <line x1="${cx - 22}" y1="${yMin}" x2="${cx + 22}" y2="${yMin}" stroke="${borderHex}" stroke-width="2" />
      <rect x="${xLeft}" y="${yQ3}" width="${boxW}" height="${Math.max(2, yQ1 - yQ3)}" fill="${colorHex}" fill-opacity="0.25" stroke="${borderHex}" stroke-width="2" rx="4" />
      <line x1="${xLeft}" y1="${yMed}" x2="${xLeft + boxW}" y2="${yMed}" stroke="${borderHex}" stroke-width="3.5" />
      <circle cx="${cx}" cy="${yMean}" r="4.5" fill="#dc2626" stroke="#ffffff" stroke-width="1.5" />
      <text x="${cx}" y="${height - padBottom + 22}" text-anchor="middle" font-size="12px" font-weight="bold" fill="${borderHex}">${label}</text>
      <text x="${xLeft + boxW + 8}" y="${yMed + 3}" font-size="9px" font-weight="bold" fill="${borderHex}">Med: ${stats.median.toFixed(2)}</text>
      <text x="${xLeft + boxW + 8}" y="${yMean + 3}" font-size="9px" fill="#dc2626">Mean: ${stats.mean.toFixed(2)}</text>
      <text x="${xLeft + boxW + 8}" y="${yQ3 + 3}" font-size="8.5px" fill="#64748b">Q3: ${stats.q3.toFixed(2)}</text>
      <text x="${xLeft + boxW + 8}" y="${yQ1 + 3}" font-size="8.5px" fill="#64748b">Q1: ${stats.q1.toFixed(2)}</text>
    `;
  };

  const unitLabel = unit ? ` (${unit})` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
    <text x="${width / 2}" y="24" text-anchor="middle" font-size="14.5px" font-weight="bold" fill="#1e3a8a">Box & Whisker Comparison - ${paramName}</text>
    <text x="${width / 2}" y="42" text-anchor="middle" font-size="11px" font-weight="bold" fill="#64748b">Year / Period: ${basePeriodName} vs ${compPeriodName} (Auto-Adjusted Axis)</text>
    ${gridHTML}
    <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
    <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
    <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${padTop + plotH / 2})">Concentration ${unitLabel}</text>
    ${renderBox(preStats, 220, `Pre: ${basePeriodName}`, "#3b82f6", "#1d4ed8")}
    ${renderBox(postStats, 460, `Post: ${compPeriodName}`, "#10b981", "#047857")}
  </svg>`;
};

export const generateMonsoonAveragePlotSVG = (
  groupList: { name: string }[], 
  pairedList: { district: string; state: string; preVal: number; postVal: number }[], 
  paramName: string, 
  unit: string,
  basePeriodName: string = "Pre-Monsoon",
  compPeriodName: string = "Post-Monsoon"
): string => {
  if (!pairedList.length) return "";
  const overallPreMean = pairedList.reduce((acc, p) => acc + p.preVal, 0) / pairedList.length;
  const overallPostMean = pairedList.reduce((acc, p) => acc + p.postVal, 0) / pairedList.length;

  const dataItems: Array<{ label: string; preMean: number; postMean: number }> = [
    { label: "Overall Average", preMean: overallPreMean, postMean: overallPostMean }
  ];

  groupList.forEach((g) => {
    const items = pairedList.filter((p) => p.district === g.name || p.state === g.name);
    if (items.length > 0) {
      const preM = items.reduce((acc, p) => acc + p.preVal, 0) / items.length;
      const postM = items.reduce((acc, p) => acc + p.postVal, 0) / items.length;
      dataItems.push({ label: g.name, preMean: preM, postMean: postM });
    }
  });

  const maxVal = safeMax(dataItems.map((d) => safeMax(d.preMean, d.postMean)), 0.001) * 1.15;

  const padLeft = 65;
  const padRight = 30;
  const padTop = 50;
  const padBottom = 125;
  const itemWidth = 68;

  const width = Math.max(760, padLeft + padRight + dataItems.length * itemWidth);
  const height = 480;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getY = (v: number) => padTop + plotH - (v / maxVal) * plotH;

  let gridHTML = "";
  const numTicks = 5;
  for (let i = 0; i <= numTicks; i++) {
    const val = (i / numTicks) * maxVal;
    const y = getY(val);
    gridHTML += `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`;
    gridHTML += `<text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="10.5px" font-family="'Times New Roman', serif" font-weight="bold" fill="#0f172a">${val < 10 ? val.toFixed(2) : Math.round(val)}</text>`;
  }

  const groupWidth = plotW / dataItems.length;
  const barWidth = Math.min(26, groupWidth * 0.38);

  let barsHTML = "";
  dataItems.forEach((item, idx) => {
    const cx = padLeft + idx * groupWidth + groupWidth / 2;
    const xPre = cx - barWidth - 2;
    const xPost = cx + 2;

    const yPre = getY(item.preMean);
    const hPre = padTop + plotH - yPre;

    const yPost = getY(item.postMean);
    const hPost = padTop + plotH - yPost;

    barsHTML += `
      <rect x="${xPre}" y="${yPre}" width="${barWidth}" height="${Math.max(1, hPre)}" fill="#4f46e5" rx="3" />
      <text x="${xPre + barWidth / 2}" y="${yPre - 5}" text-anchor="middle" font-size="9.5px" font-weight="extrabold" fill="#0f172a" stroke="#ffffff" stroke-width="2.2" paint-order="stroke fill">${item.preMean.toFixed(1)}</text>
      <rect x="${xPost}" y="${yPost}" width="${barWidth}" height="${Math.max(1, hPost)}" fill="#10b981" rx="3" />
      <text x="${xPost + barWidth / 2}" y="${yPost - 5}" text-anchor="middle" font-size="9.5px" font-weight="extrabold" fill="#0f172a" stroke="#ffffff" stroke-width="2.2" paint-order="stroke fill">${item.postMean.toFixed(1)}</text>
      <text x="${cx - 2}" y="${padTop + plotH + 14}" text-anchor="end" font-size="10.5px" font-weight="bold" fill="${idx === 0 ? '#1e1b4b' : '#0f172a'}" stroke="#ffffff" stroke-width="1.8" paint-order="stroke fill" transform="rotate(-40, ${cx - 2}, ${padTop + plotH + 14})">${item.label}</text>
    `;
  });

  const unitLabel = unit ? ` (${unit})` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
    <text x="${width / 2}" y="22" text-anchor="middle" font-size="14.5px" font-weight="bold" fill="#1e3a8a">Average Concentration Comparison Across All Districts - ${paramName}</text>
    <text x="${width / 2}" y="38" text-anchor="middle" font-size="11px" font-weight="bold" fill="#64748b">Year / Period: ${basePeriodName} vs ${compPeriodName}</text>
    ${gridHTML}
    <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
    <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
    <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${padTop + plotH / 2})">Mean ${paramName}${unitLabel}</text>
    ${barsHTML}
    <g transform="translate(${width - 250}, 12)">
      <rect x="0" y="0" width="220" height="28" fill="#f8fafc" stroke="#cbd5e1" rx="4" />
      <rect x="8" y="8" width="12" height="12" fill="#4f46e5" rx="2" />
      <text x="24" y="18" font-size="9px" font-weight="bold" fill="#3730a3">Pre: ${basePeriodName}</text>
      <rect x="115" y="8" width="12" height="12" fill="#10b981" rx="2" />
      <text x="131" y="18" font-size="9px" font-weight="bold" fill="#065f46">Post: ${compPeriodName}</text>
    </g>
  </svg>`;
};

export const generateMonsoonViolinPlotSVG = (
  preVals: number[], 
  postVals: number[], 
  paramName: string, 
  unit: string,
  basePeriodName: string = "Pre-Monsoon",
  compPeriodName: string = "Post-Monsoon"
): string => {
  if (!preVals.length || !postVals.length) return "";
  const preStats = getMonsoonStats(preVals);
  const postStats = getMonsoonStats(postVals);

  // AUTO-ADJUSTED AXIS CALCULATION
  const dataMin = Math.min(preStats.min, postStats.min);
  const dataMax = Math.max(preStats.max, postStats.max);
  const range = Math.max(0.001, dataMax - dataMin);
  const pad = range * 0.12;

  let minVal = dataMin - pad;
  if (dataMin >= 0 && minVal < 0) {
    minVal = 0;
  } else {
    minVal = Math.floor(minVal * 10) / 10;
  }

  let maxVal = Math.ceil((dataMax + pad) * 10) / 10;
  if (maxVal <= minVal) maxVal = minVal + 1;

  const width = 680;
  const height = 430;
  const padLeft = 75;
  const padRight = 40;
  const padTop = 50;
  const padBottom = 60;

  const plotH = height - padTop - padBottom;
  const getY = (v: number) => padTop + plotH - (Math.min(1, Math.max(0, (v - minVal) / (maxVal - minVal)))) * plotH;

  const getDensity = (arr: number[]) => {
    const bins = 12;
    const counts = new Array(bins).fill(0);
    arr.forEach((v) => {
      const idx = Math.min(bins - 1, Math.max(0, Math.floor(((v - minVal) / Math.max(0.0001, maxVal - minVal)) * bins)));
      counts[idx]++;
    });
    const maxCount = safeMax(counts, 1);
    return counts.map((c) => c / maxCount);
  };

  const preDens = getDensity(preVals);
  const postDens = getDensity(postVals);

  const renderViolin = (stats: MonsoonStats, dens: number[], cx: number, label: string, strokeHex: string, fillHex: string) => {
    const bins = dens.length;
    const maxWidth = 55;

    let rightPts: string[] = [];
    let leftPts: string[] = [];

    for (let i = 0; i < bins; i++) {
      const val = minVal + (i + 0.5) * ((maxVal - minVal) / bins);
      const y = getY(val);
      const w = dens[i] * maxWidth;
      rightPts.push(`${(cx + w).toFixed(1)},${y.toFixed(1)}`);
      leftPts.unshift(`${(cx - w).toFixed(1)},${y.toFixed(1)}`);
    }

    const polyPts = [...rightPts, ...leftPts].join(" ");

    const yQ1 = getY(stats.q1);
    const yMed = getY(stats.median);
    const yQ3 = getY(stats.q3);

    return `
      <polygon points="${polyPts}" fill="${fillHex}" fill-opacity="0.3" stroke="${strokeHex}" stroke-width="2" />
      <line x1="${cx}" y1="${yQ1}" x2="${cx}" y2="${yQ3}" stroke="#1e293b" stroke-width="5" stroke-linecap="round" />
      <circle cx="${cx}" cy="${yMed}" r="3.5" fill="#ffffff" stroke="#1e293b" stroke-width="1.5" />
      <text x="${cx}" y="${height - padBottom + 22}" text-anchor="middle" font-size="12px" font-weight="bold" fill="${strokeHex}">${label}</text>
      <text x="${cx}" y="${yMed - 8}" text-anchor="middle" font-size="9px" font-weight="bold" fill="#1e293b">Med: ${stats.median.toFixed(2)}</text>
    `;
  };

  let gridHTML = "";
  const numTicks = 5;
  for (let i = 0; i <= numTicks; i++) {
    const val = minVal + (i / numTicks) * (maxVal - minVal);
    const y = getY(val);
    gridHTML += `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`;
    gridHTML += `<text x="${padLeft - 10}" y="${y + 4}" text-anchor="end" font-size="10px" font-family="'Times New Roman', serif" fill="#64748b">${val < 10 ? val.toFixed(2) : Math.round(val)}</text>`;
  }

  const unitLabel = unit ? ` (${unit})` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
    <text x="${width / 2}" y="24" text-anchor="middle" font-size="14.5px" font-weight="bold" fill="#1e3a8a">Kernel Density Violin Plot - ${paramName}</text>
    <text x="${width / 2}" y="42" text-anchor="middle" font-size="11px" font-weight="bold" fill="#64748b">Year / Period: ${basePeriodName} vs ${compPeriodName} (Auto-Adjusted Axis)</text>
    ${gridHTML}
    <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
    <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
    <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${padTop + plotH / 2})">Concentration ${unitLabel}</text>
    ${renderViolin(preStats, preDens, 220, `Pre: ${basePeriodName}`, "#2563eb", "#3b82f6")}
    ${renderViolin(postStats, postDens, 460, `Post: ${compPeriodName}`, "#059669", "#10b981")}
  </svg>`;
};

export const generateMonsoonDonutChartSVG = (
  totalSamples: number,
  totalImproved: number,
  totalDeteriorated: number,
  totalUnchanged: number,
  totalShiftedSafeToUnsafe: number,
  totalShiftedUnsafeToSafe: number,
  paramName: string,
  basePeriodName: string = "Pre-Monsoon",
  compPeriodName: string = "Post-Monsoon"
): string => {
  if (totalSamples === 0) return "";

  const data = [
    { label: "Improved (>20% ↓)", count: totalImproved, color: "#16a34a" },
    { label: "Deteriorated (>20% ↑)", count: totalDeteriorated, color: "#dc2626" },
    { label: "No Change (±20%)", count: totalUnchanged, color: "#64748b" },
    { label: "Shifted Safe → Unsafe", count: totalShiftedSafeToUnsafe, color: "#e11d48" },
    { label: "Shifted Unsafe → Safe", count: totalShiftedUnsafeToSafe, color: "#0d9488" }
  ].filter((d) => d.count > 0);

  const cx = 190;
  const cy = 205;
  const outerR = 120;
  const innerR = 68;

  let startAngle = -Math.PI / 2;
  let pathsHTML = "";

  data.forEach((item) => {
    const angle = (item.count / totalSamples) * 2 * Math.PI;
    const endAngle = startAngle + angle;

    const x1Out = cx + outerR * Math.cos(startAngle);
    const y1Out = cy + outerR * Math.sin(startAngle);
    const x2Out = cx + outerR * Math.cos(endAngle);
    const y2Out = cy + outerR * Math.sin(endAngle);

    const x1In = cx + innerR * Math.cos(endAngle);
    const y1In = cy + innerR * Math.sin(endAngle);
    const x2In = cx + innerR * Math.cos(startAngle);
    const y2In = cy + innerR * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    const pathData = [
      `M ${x1Out.toFixed(1)} ${y1Out.toFixed(1)}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Out.toFixed(1)} ${y2Out.toFixed(1)}`,
      `L ${x1In.toFixed(1)} ${y1In.toFixed(1)}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2In.toFixed(1)} ${y2In.toFixed(1)}`,
      `Z`
    ].join(" ");

    pathsHTML += `<path d="${pathData}" fill="${item.color}" stroke="#ffffff" stroke-width="2" />`;
    startAngle = endAngle;
  });

  let legendHTML = "";
  let legY = 75;
  data.forEach((item) => {
    const pct = ((item.count / totalSamples) * 100).toFixed(1);
    legendHTML += `
      <g transform="translate(340, ${legY})">
        <rect x="0" y="0" width="16" height="16" fill="${item.color}" rx="3" />
        <text x="24" y="12" font-size="11px" font-weight="bold" fill="#1e293b">${item.label}</text>
        <text x="24" y="26" font-size="10px" fill="#64748b">${item.count} samples (${pct}%)</text>
      </g>
    `;
    legY += 45;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 395" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
    <text x="310" y="22" text-anchor="middle" font-size="14.5px" font-weight="bold" fill="#1e3a8a">Impact Status Distribution Donut Chart - ${paramName}</text>
    <text x="310" y="38" text-anchor="middle" font-size="11px" font-weight="bold" fill="#64748b">Year / Period Shift: ${basePeriodName} → ${compPeriodName}</text>
    ${pathsHTML}
    <circle cx="${cx}" cy="${cy}" r="${innerR - 2}" fill="#ffffff" />
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="18px" font-weight="bold" fill="#1e3a8a">${totalSamples}</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10px" font-weight="bold" fill="#64748b">Matched Sites</text>
    ${legendHTML}
  </svg>`;
};

export const generateMonsoonExceedanceBarSVG = (
  groupList: { name: string }[], 
  pairedList: { district: string; state: string; preVal: number; postVal: number }[], 
  paramName: string, 
  unit: string, 
  configKey: string,
  basePeriodName: string = "Pre-Monsoon",
  compPeriodName: string = "Post-Monsoon"
): string => {
  if (!pairedList.length) return "";

  const config = PARAM_CONFIG[configKey];
  const isSingleLimit = config ? config.b1 === config.b2 && configKey !== "pH" : false;
  const limit = config ? (isSingleLimit ? config.b1 : config.b2) : 0;

  const getExceedCount = (items: typeof pairedList, isPost: boolean) => {
    return items.filter((item) => {
      const v = isPost ? item.postVal : item.preVal;
      if (configKey === "pH") return v < (config?.b1 || 6.5) || v > (config?.b2 || 8.5);
      return v > limit;
    }).length;
  };

  const overallPreExcPct = (getExceedCount(pairedList, false) / pairedList.length) * 100;
  const overallPostExcPct = (getExceedCount(pairedList, true) / pairedList.length) * 100;

  const dataItems: Array<{ label: string; preExc: number; postExc: number }> = [
    { label: "Overall Average", preExc: overallPreExcPct, postExc: overallPostExcPct }
  ];

  groupList.forEach((g) => {
    const items = pairedList.filter((p) => p.district === g.name || p.state === g.name);
    if (items.length > 0) {
      const prePct = (getExceedCount(items, false) / items.length) * 100;
      const postPct = (getExceedCount(items, true) / items.length) * 100;
      dataItems.push({ label: g.name, preExc: prePct, postExc: postPct });
    }
  });

  const maxVal = safeMax(dataItems.map((d) => safeMax(d.preExc, d.postExc)), 10) * 1.15;

  const padLeft = 65;
  const padRight = 30;
  const padTop = 45;
  const padBottom = 125;
  const itemWidth = 68;

  const width = Math.max(760, padLeft + padRight + dataItems.length * itemWidth);
  const height = 480;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getY = (v: number) => padTop + plotH - (v / maxVal) * plotH;

  let gridHTML = "";
  [0, 20, 40, 60, 80, 100].forEach((pct) => {
    if (pct <= maxVal) {
      const y = getY(pct);
      gridHTML += `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`;
      gridHTML += `<text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="10.5px" font-family="'Times New Roman', serif" font-weight="bold" fill="#0f172a">${pct}%</text>`;
    }
  });

  const groupWidth = plotW / dataItems.length;
  const barWidth = Math.min(26, groupWidth * 0.38);

  let barsHTML = "";
  dataItems.forEach((item, idx) => {
    const cx = padLeft + idx * groupWidth + groupWidth / 2;
    const xPre = cx - barWidth - 2;
    const xPost = cx + 2;

    const yPre = getY(item.preExc);
    const hPre = padTop + plotH - yPre;

    const yPost = getY(item.postExc);
    const hPost = padTop + plotH - yPost;

    barsHTML += `
      <rect x="${xPre}" y="${yPre}" width="${barWidth}" height="${Math.max(1, hPre)}" fill="#6366f1" rx="3" />
      <text x="${xPre + barWidth / 2}" y="${yPre - 5}" text-anchor="middle" font-size="9.5px" font-weight="extrabold" fill="#0f172a" stroke="#ffffff" stroke-width="2.2" paint-order="stroke fill">${item.preExc.toFixed(1)}%</text>
      <rect x="${xPost}" y="${yPost}" width="${barWidth}" height="${Math.max(1, hPost)}" fill="#059669" rx="3" />
      <text x="${xPost + barWidth / 2}" y="${yPost - 5}" text-anchor="middle" font-size="9.5px" font-weight="extrabold" fill="#0f172a" stroke="#ffffff" stroke-width="2.2" paint-order="stroke fill">${item.postExc.toFixed(1)}%</text>
      <text x="${cx - 2}" y="${padTop + plotH + 14}" text-anchor="end" font-size="10.5px" font-weight="bold" fill="${idx === 0 ? '#1e1b4b' : '#0f172a'}" stroke="#ffffff" stroke-width="1.8" paint-order="stroke fill" transform="rotate(-40, ${cx - 2}, ${padTop + plotH + 14})">${item.label}</text>
    `;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
    <text x="${width / 2}" y="22" text-anchor="middle" font-size="14.5px" font-weight="bold" fill="#1e3a8a">Exceedance Rate Comparison Across All Districts (%) - ${paramName}</text>
    <text x="${width / 2}" y="38" text-anchor="middle" font-size="11px" font-weight="bold" fill="#64748b">Year / Period: ${basePeriodName} vs ${compPeriodName}</text>
    ${gridHTML}
    <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
    <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
    <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${padTop + plotH / 2})">% Exceeding Permissible Limit</text>
    ${barsHTML}
    <g transform="translate(${width - 250}, 12)">
      <rect x="0" y="0" width="220" height="28" fill="#f8fafc" stroke="#cbd5e1" rx="4" />
      <rect x="8" y="8" width="12" height="12" fill="#6366f1" rx="2" />
      <text x="24" y="18" font-size="9px" font-weight="bold" fill="#4338ca">Pre: ${basePeriodName}</text>
      <rect x="115" y="8" width="12" height="12" fill="#059669" rx="2" />
      <text x="131" y="18" font-size="9px" font-weight="bold" fill="#047857">Post: ${compPeriodName}</text>
    </g>
  </svg>`;
};

export const generateMonsoonScatterBiPlotSVG = (
  pairedList: { preVal: number; postVal: number }[], 
  paramName: string, 
  unit: string, 
  configKey: string
): string => {
  if (!pairedList.length) return "";

  const config = PARAM_CONFIG[configKey];
  const isSingleLimit = config ? config.b1 === config.b2 && configKey !== "pH" : false;
  const limit = config ? (isSingleLimit ? config.b1 : config.b2) : 0;

  const maxVal = safeMax(pairedList.map((p) => safeMax(p.preVal, p.postVal)), limit || 1) * 1.1;

  const width = 650;
  const height = 520;
  const padLeft = 65;
  const padRight = 140;
  const padTop = 45;
  const padBottom = 60;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getX = (v: number) => padLeft + (v / maxVal) * plotW;
  const getY = (v: number) => padTop + plotH - (v / maxVal) * plotH;

  let gridHTML = "";
  const numTicks = 5;
  for (let i = 0; i <= numTicks; i++) {
    const val = (i / numTicks) * maxVal;
    const x = getX(val);
    const y = getY(val);

    gridHTML += `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + plotH}" stroke="#f1f5f9" stroke-width="1" />`;
    gridHTML += `<line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#f1f5f9" stroke-width="1" />`;

    gridHTML += `<text x="${x}" y="${padTop + plotH + 18}" text-anchor="middle" font-size="10px" font-family="'Times New Roman', serif" fill="#64748b">${val < 10 ? val.toFixed(2) : Math.round(val)}</text>`;
    gridHTML += `<text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="10px" font-family="'Times New Roman', serif" fill="#64748b">${val < 10 ? val.toFixed(2) : Math.round(val)}</text>`;
  }

  const x0 = getX(0);
  const y0 = getY(0);
  const xMax = getX(maxVal);
  const yMax = getY(maxVal);

  const line1to1 = `<line x1="${x0}" y1="${y0}" x2="${xMax}" y2="${yMax}" stroke="#475569" stroke-width="2" stroke-dasharray="6 4" />`;

  let limitLinesHTML = "";
  if (limit > 0 && limit < maxVal) {
    const xLim = getX(limit);
    const yLim = getY(limit);
    limitLinesHTML += `<line x1="${xLim}" y1="${padTop}" x2="${xLim}" y2="${padTop + plotH}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4 3" />`;
    limitLinesHTML += `<line x1="${padLeft}" y1="${yLim}" x2="${padLeft + plotW}" y2="${yLim}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4 3" />`;
    limitLinesHTML += `<text x="${xLim + 4}" y="${padTop + 15}" font-size="9px" font-weight="bold" fill="#dc2626">Limit (${limit})</text>`;
  }

  let dotsHTML = "";
  pairedList.forEach((p) => {
    const cx = getX(p.preVal);
    const cy = getY(p.postVal);

    const pct = p.preVal === 0 ? (p.postVal === 0 ? 0 : 100) : ((p.postVal - p.preVal) / p.preVal) * 100;
    let dotColor = "#64748b";
    if (pct < -20) dotColor = "#16a34a";
    else if (pct > 20) dotColor = "#dc2626";

    dotsHTML += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="${dotColor}" fill-opacity="0.7" stroke="#ffffff" stroke-width="1" />`;
  });

  const unitLabel = unit ? ` (${unit})` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
    <text x="${width / 2}" y="25" text-anchor="middle" font-size="14px" font-weight="bold" fill="#1e3a8a">Pre vs Post Monsoon 1:1 Scatter Bi-Plot - ${paramName}</text>
    ${gridHTML}
    ${line1to1}
    ${limitLinesHTML}
    ${dotsHTML}
    <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
    <line x1="${padLeft}" y1="${padTop + plotH}" x2="${padLeft + plotW}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
    <text x="${padLeft + plotW / 2}" y="${height - 15}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b">Pre-Monsoon Concentration ${unitLabel}</text>
    <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${padTop + plotH / 2})">Post-Monsoon Concentration ${unitLabel}</text>
    <g transform="translate(${padLeft + plotW + 10}, ${padTop + 20})">
      <rect x="0" y="0" width="125" height="150" fill="#f8fafc" stroke="#cbd5e1" rx="6" />
      <text x="10" y="18" font-size="11px" font-weight="bold" fill="#1e293b">1:1 Bi-Plot Key</text>
      <line x1="10" y1="35" x2="30" y2="35" stroke="#475569" stroke-width="2" stroke-dasharray="4 3" />
      <text x="36" y="38" font-size="9px" fill="#334155">1:1 Line (No Change)</text>
      <circle cx="18" cy="58" r="4.5" fill="#16a34a" />
      <text x="36" y="61" font-size="9.5px" font-weight="bold" fill="#16a34a">Improved (&gt;20% ↓)</text>
      <text x="36" y="71" font-size="8.5px" fill="#64748b">(Below 1:1 Line)</text>
      <circle cx="18" cy="91" r="4.5" fill="#dc2626" />
      <text x="36" y="94" font-size="9.5px" font-weight="bold" fill="#dc2626">Deteriorated (&gt;20% ↑)</text>
      <text x="36" y="104" font-size="8.5px" fill="#64748b">(Above 1:1 Line)</text>
      <circle cx="18" cy="124" r="4.5" fill="#64748b" />
      <text x="36" y="127" font-size="9.5px" fill="#475569">Unchanged (&plusmn;20%)</text>
    </g>
  </svg>`;
};

// Spatial Point-in-Polygon & String Matching Utilities
function isPointInPolygon(pt: [number, number], polygon: any[]): boolean {
  let inside = false;
  const x = pt[0], y = pt[1];
  if (!Array.isArray(polygon) || !polygon.length) return false;
  const outerRing = Array.isArray(polygon[0]) && Array.isArray(polygon[0][0]) ? polygon[0] : polygon;

  for (let i = 0, j = outerRing.length - 1; i < outerRing.length; j = i++) {
    const xi = outerRing[i][0], yi = outerRing[i][1];
    const xj = outerRing[j][0], yj = outerRing[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointInFeature(lon: number, lat: number, f: any): boolean {
  if (!f || !f.geometry) return false;
  const geom = f.geometry;
  if (geom.type === "Polygon") {
    return isPointInPolygon([lon, lat], geom.coordinates);
  } else if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((poly: any) => isPointInPolygon([lon, lat], poly));
  }
  return false;
}

function getLevenshteinDistance(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = getLevenshteinDistance(a, b);
  return 1 - dist / maxLen;
}

function getGeoFeatureName(props: any, granularity: "district" | "state" = "district"): string {
  if (!props) return "";
  const candidateKeys = granularity === "state" 
    ? ["statename", "state_name", "state_nam", "st_name", "st_nm", "stname", "stnm", "state", "st", "name1", "adm1", "admin1", "state_n"]
    : ["districtname", "district_name", "dist_name", "dist_nm", "dt_name", "district_n", "distname", "dtname", "distnm", "district", "dt", "name2", "adm2", "admin2", "name", "shape_name"];
  
  // Pass 1: candidate keys with non-numeric string values
  for (const ck of candidateKeys) {
    for (const k of Object.keys(props)) {
      const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (kClean === ck || (kClean.includes(ck) && !kClean.includes("code") && !kClean.includes("id") && !kClean.includes("num"))) {
        const val = String(props[k] || "").trim();
        if (val && !/^\d+$/.test(val)) return val;
      }
    }
  }

  // Pass 2: any candidate key
  for (const ck of candidateKeys) {
    for (const k of Object.keys(props)) {
      const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (kClean === ck || kClean.includes(ck)) {
        const val = String(props[k] || "").trim();
        if (val && !/^\d+$/.test(val)) return val;
      }
    }
  }

  // Pass 3: fallback to any non-numeric string property with length > 1
  for (const k of Object.keys(props)) {
    if (typeof props[k] === "string") {
      const val = props[k].trim();
      if (val && !/^\d+$/.test(val) && val.length > 1) return val;
    }
  }

  // Pass 4: last resort (numeric string if nothing else exists)
  for (const k of Object.keys(props)) {
    const val = String(props[k] || "").trim();
    if (val) return val;
  }

  return "";
}

function convertGeoJsonCoordsToSvgPath(
  coords: any,
  geomType: string,
  projectFn: (lon: number, lat: number) => [number, number]
): { path: string; bbox: [number, number, number, number]; ptsCount: number } {
  let pathStr = "";
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let ptsCount = 0;

  const processRing = (ring: any[]) => {
    let sub = "";
    ring.forEach((pt, i) => {
      if (!Array.isArray(pt) || pt.length < 2) return;
      const lon = parseFloat(pt[0]);
      const lat = parseFloat(pt[1]);
      if (isNaN(lon) || isNaN(lat)) return;

      const [x, y] = projectFn(lon, lat);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      ptsCount++;

      sub += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    if (sub) sub += " Z";
    return sub;
  };

  if (geomType === "Polygon" && Array.isArray(coords)) {
    coords.forEach(ring => {
      if (Array.isArray(ring)) pathStr += processRing(ring) + " ";
    });
  } else if (geomType === "MultiPolygon" && Array.isArray(coords)) {
    coords.forEach(polygon => {
      if (Array.isArray(polygon)) {
        polygon.forEach(ring => {
          if (Array.isArray(ring)) pathStr += processRing(ring) + " ";
        });
      }
    });
  }

  return {
    path: pathStr.trim(),
    bbox: [minX, maxX, minY, maxY],
    ptsCount
  };
}

export const generateMonsoonChoroplethMapSVG = (
  pairedList: { district: string; state: string; block?: string; location?: string; key?: string; preVal: number; postVal: number; lat?: string | number; lng?: string | number }[], 
  paramName: string, 
  unit: string, 
  configKey: string,
  granularity: "district" | "state" = "district",
  basePeriodName: string = "Pre-Monsoon",
  compPeriodName: string = "Post-Monsoon",
  sharedLayers?: ShapefileLayer[],
  orientation: "portrait" | "landscape" = "portrait",
  mapBgColor: string = "transparent",
  selectedState?: string,
  selectedDistrict?: string,
  districtStateMap?: Record<string, string>,
  showDataPoints: boolean = true
): string => {
  const isPortrait = orientation === "portrait";
  const width = isPortrait ? 680 : 960;
  const height = isPortrait ? 880 : 540;

  if (!pairedList.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 220" style="width: 100%; height: auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; font-family: sans-serif;">
      <rect width="100%" height="100%" fill="#f8fafc" rx="12" />
      <text x="${width / 2}" y="100" text-anchor="middle" font-size="14px" font-weight="bold" fill="#1e293b">No Matched Paired Sampling Locations Found</text>
      <text x="${width / 2}" y="125" text-anchor="middle" font-size="11px" font-weight="medium" fill="#64748b">Please select valid Base and Compare periods or adjust your region filter criteria.</text>
    </svg>`;
  }

  // Group paired items by region (State or District)
  const regionMap: Record<string, {
    name: string;
    preVals: number[];
    postVals: number[];
    itemsCount: number;
    detCount: number;
    impCount: number;
    unChgCount: number;
    lats: number[];
    lngs: number[];
  }> = {};

  pairedList.forEach((item) => {
    let regionKey = granularity === "state" 
      ? (item.state || "State Level") 
      : (item.district || item.state || "District Level");
    regionKey = regionKey.trim();
    if (!regionKey) regionKey = granularity === "state" ? "Unspecified State" : "Unspecified District";

    if (!regionMap[regionKey]) {
      regionMap[regionKey] = {
        name: regionKey,
        preVals: [],
        postVals: [],
        itemsCount: 0,
        detCount: 0,
        impCount: 0,
        unChgCount: 0,
        lats: [],
        lngs: []
      };
    }

    regionMap[regionKey].preVals.push(item.preVal);
    regionMap[regionKey].postVals.push(item.postVal);
    regionMap[regionKey].itemsCount++;

    const latRaw = item.lat ?? (item as any).latitude ?? (item as any).baseRow?.Latitude ?? (item as any).baseRow?.latitude;
    const lonRaw = item.lng ?? (item as any).longitude ?? (item as any).baseRow?.Longitude ?? (item as any).baseRow?.longitude;
    const lat = typeof latRaw === "number" ? latRaw : parseFloat(String(latRaw || ""));
    const lon = typeof lonRaw === "number" ? lonRaw : parseFloat(String(lonRaw || ""));
    if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0 && Number.isFinite(lat) && Number.isFinite(lon)) {
      regionMap[regionKey].lats.push(lat);
      regionMap[regionKey].lngs.push(lon);
    }

    const pct = item.preVal === 0 ? (item.postVal === 0 ? 0 : 100) : ((item.postVal - item.preVal) / item.preVal) * 100;
    if (pct > 20) regionMap[regionKey].detCount++;
    else if (pct < -20) regionMap[regionKey].impCount++;
    else regionMap[regionKey].unChgCount++;
  });

  const regions = Object.values(regionMap).map((r) => {
    const preMean = r.preVals.reduce((a, b) => a + b, 0) / r.preVals.length;
    const postMean = r.postVals.reduce((a, b) => a + b, 0) / r.postVals.length;
    const pctChange = preMean === 0 ? (postMean === 0 ? 0 : 100) : ((postMean - preMean) / preMean) * 100;

    let color = "#eab308"; // Stable
    let category = "Stable / Minor Shift";
    if (pctChange > 20) { color = "#dc2626"; category = "Severe Deterioration (>+20%)"; }
    else if (pctChange > 5) { color = "#ea580c"; category = "Moderate Deterioration (+5% to +20%)"; }
    else if (pctChange >= -5) { color = "#eab308"; category = "Stable / Neutral (±5%)"; }
    else if (pctChange >= -20) { color = "#16a34a"; category = "Moderate Improvement (-5% to -20%)"; }
    else { color = "#15803d"; category = "Significant Improvement (<-20%)"; }

    const meanLat = r.lats.length ? r.lats.reduce((a, b) => a + b, 0) / r.lats.length : undefined;
    const meanLng = r.lngs.length ? r.lngs.reduce((a, b) => a + b, 0) / r.lngs.length : undefined;

    return {
      ...r,
      preMean,
      postMean,
      pctChange,
      color,
      category,
      meanLat,
      meanLng
    };
  });

  // Sort regions by % change descending (highest deterioration first)
  regions.sort((a, b) => b.pctChange - a.pctChange);

  const mapW = isPortrait ? 640 : 680;
  const mapH = isPortrait ? 660 : 430;
  const padLeft = 20;
  const padTop = 55;

  const isTransparent = mapBgColor === "transparent" || mapBgColor === "none";
  const isDarkBg = !isTransparent && (mapBgColor.toLowerCase().startsWith("#0") || mapBgColor.toLowerCase().startsWith("#1") || mapBgColor.toLowerCase().startsWith("#2"));
  const titleColor = isDarkBg ? "#60a5fa" : "#1e3a8a";
  const subtitleColor = isDarkBg ? "#94a3b8" : "#64748b";
  const frameBg = isTransparent ? "none" : (isDarkBg ? "#1e293b" : "#f8fafc");
  const cardBg = isTransparent ? "rgba(255, 255, 255, 0.94)" : (isDarkBg ? "#1e293b" : "#ffffff");
  const frameStroke = isDarkBg ? "#334155" : "#cbd5e1";

  // Filter shapefile features matching selected state/district
  let rawShapeFeatures: any[] = [];
  let layerStrokeColor = "#1e293b";
  let layerStrokeWidth = 1.1;
  let layerFillColor = "#e2e8f0";
  let layerFillOpacity = 0.5;

  if (sharedLayers && sharedLayers.length > 0) {
    const targetLayer = sharedLayers.find((l) => {
      if (!l.visible || !l.geoJson) return false;
      const lname = (l.name || "").toLowerCase();
      if (granularity === "state") return lname.includes("state");
      return lname.includes("district");
    }) || sharedLayers.find((l) => l.visible && l.geoJson);

    if (targetLayer && targetLayer.geoJson) {
      if (targetLayer.strokeColor) layerStrokeColor = targetLayer.strokeColor;
      if (typeof targetLayer.strokeWidth === "number") layerStrokeWidth = targetLayer.strokeWidth;
      if (targetLayer.fillColor) layerFillColor = targetLayer.fillColor;
      if (typeof targetLayer.fillOpacity === "number") layerFillOpacity = targetLayer.fillOpacity;

      if (targetLayer.geoJson.type === "FeatureCollection" && Array.isArray(targetLayer.geoJson.features)) {
        rawShapeFeatures = targetLayer.geoJson.features;
      } else if (targetLayer.geoJson.type === "Feature") {
        rawShapeFeatures = [targetLayer.geoJson];
      }

      if ((selectedState && !isStateAll(selectedState)) || (selectedDistrict && !isDistrictAll(selectedDistrict))) {
        const filtered = rawShapeFeatures.filter((f) =>
          featureMatchesSelection(f, selectedState, selectedDistrict, districtStateMap)
        );
        if (filtered.length > 0) rawShapeFeatures = filtered;
      }
    }
  }

  // Count how many features in rawShapeFeatures match at least one region
  let matchedFeaturesCount = 0;
  rawShapeFeatures.forEach((f) => {
    if (!f.geometry) return;
    const fName = getGeoFeatureName(f.properties, granularity);
    const fNorm = norm(fName);
    let matchedRegion = regions.find((r) => {
      const rNorm = norm(r.name);
      return rNorm === fNorm || (rNorm && fNorm && (fNorm.includes(rNorm) || rNorm.includes(fNorm)));
    });
    if (!matchedRegion && districtStateMap && fName) {
      const mappedSt = districtStateMap[fName.toLowerCase()] || districtStateMap[fNorm] || districtStateMap[fName];
      if (mappedSt) {
        const mNorm = norm(mappedSt);
        matchedRegion = regions.find((r) => {
          const rNorm = norm(r.name);
          return rNorm === mNorm || (rNorm && mNorm && (mNorm.includes(rNorm) || rNorm.includes(mNorm)));
        });
      }
    }
    if (!matchedRegion && fNorm) {
      let bestScore = 0;
      let bestR: any = null;
      regions.forEach((r) => {
        const rNorm = norm(r.name);
        if (!rNorm) return;
        const sim = similarityRatio(fNorm, rNorm);
        if (sim > bestScore && sim >= 0.65) {
          bestScore = sim;
          bestR = r;
        }
      });
      if (bestR) matchedRegion = bestR;
    }
    if (matchedRegion) matchedFeaturesCount++;
  });

  const shapeFeatures = rawShapeFeatures.length > 0 ? rawShapeFeatures : [INDIA_BOUNDARY];
  let mapCanvasHTML = "";

  // Render Base Vector Geometry Bounds
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;

  const scanCoords = (coords: any) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const lon = coords[0];
      const lat = coords[1];
      if (!isNaN(lon) && !isNaN(lat)) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    } else {
      coords.forEach((sub) => scanCoords(sub));
    }
  };

  shapeFeatures.forEach((f) => {
    if (f.geometry && f.geometry.coordinates) {
      scanCoords(f.geometry.coordinates);
    }
  });

  pairedList.forEach((pt: any) => {
    const latRaw = pt.lat ?? pt.latitude ?? pt.baseRow?.Latitude ?? pt.baseRow?.latitude;
    const lonRaw = pt.lng ?? pt.longitude ?? pt.baseRow?.Longitude ?? pt.baseRow?.longitude;
    const lat = typeof latRaw === "number" ? latRaw : parseFloat(String(latRaw || ""));
    const lon = typeof lonRaw === "number" ? lonRaw : parseFloat(String(lonRaw || ""));
    if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0 && Number.isFinite(lat) && Number.isFinite(lon)) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  });

  if (minLon === Infinity || maxLon === -Infinity) {
    minLon = 68.0; maxLon = 97.0; minLat = 8.0; maxLat = 37.0;
  }

  const lonSpan = Math.max(0.1, maxLon - minLon);
  const latSpan = Math.max(0.1, maxLat - minLat);
  minLon -= lonSpan * 0.08;
  maxLon += lonSpan * 0.08;
  minLat -= latSpan * 0.08;
  maxLat += latSpan * 0.08;

  const midLon = (minLon + maxLon) / 2;
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180) || 0.92;

  const spanXDeg = Math.max(0.001, (maxLon - minLon) * cosLat);
  const spanYDeg = Math.max(0.001, maxLat - minLat);

  // Uniform scale to preserve true geographic shape without stretching or compressing
  const scaleX = mapW / spanXDeg;
  const scaleY = mapH / spanYDeg;
  const fitScale = Math.min(scaleX, scaleY) || 1;

  const mapCenterX = padLeft + mapW / 2;
  const mapCenterY = padTop + mapH / 2;

  const project = (lon: number, lat: number): [number, number] => {
    const x = mapCenterX + (lon - midLon) * cosLat * fitScale;
    const y = mapCenterY - (lat - midLat) * fitScale;
    return [x, y];
  };

  let shapePathsHTML = "";
  let labelsHTML = "";

  shapeFeatures.forEach((f) => {
    if (!f.geometry) return;
    const fName = getGeoFeatureName(f.properties, granularity);
    const fNorm = norm(fName);

    let matchedRegion = regions.find((r) => {
      const rNorm = norm(r.name);
      return rNorm === fNorm || (rNorm && fNorm && (fNorm.includes(rNorm) || rNorm.includes(fNorm)));
    });

    if (!matchedRegion && districtStateMap && fName) {
      const mappedSt = districtStateMap[fName.toLowerCase()] || districtStateMap[fNorm] || districtStateMap[fName];
      if (mappedSt) {
        const mNorm = norm(mappedSt);
        matchedRegion = regions.find((r) => {
          const rNorm = norm(r.name);
          return rNorm === mNorm || (rNorm && mNorm && (mNorm.includes(rNorm) || rNorm.includes(mNorm)));
        });
      }
    }

    if (!matchedRegion && fNorm) {
      let bestScore = 0;
      let bestR: any = null;
      regions.forEach((r) => {
        const rNorm = norm(r.name);
        if (!rNorm) return;
        const sim = similarityRatio(fNorm, rNorm);
        if (sim > bestScore && sim >= 0.65) {
          bestScore = sim;
          bestR = r;
        }
      });
      if (bestR) matchedRegion = bestR;
    }

    if (!matchedRegion && f.geometry && rawShapeFeatures.length > 1) {
      for (const r of regions) {
        const regionPoints = pairedList.filter((pt: any) => {
          const rKey = granularity === "state" ? (pt.state || "") : (pt.district || pt.state || "");
          return rKey.trim().toLowerCase() === r.name.toLowerCase();
        });
        const insidePt = regionPoints.find((pt: any) => {
          const latRaw = pt.lat ?? pt.latitude ?? pt.baseRow?.Latitude ?? pt.baseRow?.latitude;
          const lonRaw = pt.lng ?? pt.longitude ?? pt.baseRow?.Longitude ?? pt.baseRow?.longitude;
          const lat = typeof latRaw === "number" ? latRaw : parseFloat(String(latRaw || ""));
          const lon = typeof lonRaw === "number" ? lonRaw : parseFloat(String(lonRaw || ""));
          return !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0 && isPointInFeature(lon, lat, f);
        });
        if (insidePt) {
          matchedRegion = r;
          break;
        }
      }
    }

    if (!matchedRegion && regions.length === 1) {
      matchedRegion = regions[0];
    }

    const fillColor = matchedRegion ? matchedRegion.color : layerFillColor;
    const fillOpacity = matchedRegion ? 0.78 : Math.max(0.15, layerFillOpacity * 0.4);

    const { path, bbox } = convertGeoJsonCoordsToSvgPath(f.geometry.coordinates, f.geometry.type, project);

    if (path) {
      const strokeColor = layerStrokeColor || (isDarkBg ? "#f8fafc" : "#0f172a");
      const strokeWidth = layerStrokeWidth || 1.2;
      shapePathsHTML += `<path d="${path}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`;

      if (matchedRegion && bbox[0] < Infinity) {
        const cx = (bbox[0] + bbox[1]) / 2;
        const cy = (bbox[2] + bbox[3]) / 2;
        const sign = matchedRegion.pctChange > 0 ? "+" : "";
        labelsHTML += `
          <g transform="translate(${cx.toFixed(1)}, ${cy.toFixed(1)})">
            <text x="0" y="-2" text-anchor="middle" font-size="8.5px" font-weight="bold" fill="#0f172a" stroke="#ffffff" stroke-width="2.5" paint-order="stroke fill">${matchedRegion.name}</text>
            <text x="0" y="7" text-anchor="middle" font-size="8px" font-weight="extrabold" fill="#0f172a" stroke="#ffffff" stroke-width="2.5" paint-order="stroke fill">${sign}${matchedRegion.pctChange.toFixed(1)}%</text>
          </g>
        `;
      }
    }
  });

  // Overlay well points as 3D Glossy Bubbles (if showDataPoints is enabled)
  let pointsHTML = "";
  if (showDataPoints) {
    pairedList.forEach((pt: any) => {
      const latRaw = pt.lat ?? pt.latitude ?? pt.baseRow?.Latitude ?? pt.baseRow?.latitude;
      const lonRaw = pt.lng ?? pt.longitude ?? pt.baseRow?.Longitude ?? pt.baseRow?.longitude;
      const lat = typeof latRaw === "number" ? latRaw : parseFloat(String(latRaw || ""));
      const lon = typeof lonRaw === "number" ? lonRaw : parseFloat(String(lonRaw || ""));
      if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
        const [px, py] = project(lon, lat);
        const pct = pt.preVal === 0 ? (pt.postVal === 0 ? 0 : 100) : ((pt.postVal - pt.preVal) / pt.preVal) * 100;
        let gradId = "bubble3d-yellow";
        let r = 3.6;
        if (pct > 20) { gradId = "bubble3d-red"; r = 4.4; }
        else if (pct > 5) { gradId = "bubble3d-orange"; r = 3.8; }
        else if (pct < -20) { gradId = "bubble3d-darkgreen"; r = 4.4; }
        else if (pct < -5) { gradId = "bubble3d-green"; r = 3.8; }

        pointsHTML += `
          <g transform="translate(${px.toFixed(1)}, ${py.toFixed(1)})">
            <circle cx="0" cy="0" r="${r.toFixed(1)}" fill="url(#${gradId})" stroke="#ffffff" stroke-width="0.7" filter="url(#bubble-drop-shadow)" />
            <circle cx="-${(r * 0.3).toFixed(1)}" cy="-${(r * 0.3).toFixed(1)}" r="${(r * 0.28).toFixed(1)}" fill="#ffffff" fill-opacity="0.85" />
          </g>
        `;
      }
    });
  }

  // Region Centroid Badges if lat/lng are present
  let centroidBadgesHTML = "";
  regions.forEach((reg) => {
    if (reg.meanLat !== undefined && reg.meanLng !== undefined) {
      const [cx, cy] = project(reg.meanLng, reg.meanLat);
      const sign = reg.pctChange > 0 ? "+" : "";
      centroidBadgesHTML += `
        <g transform="translate(${cx.toFixed(1)}, ${cy.toFixed(1)})">
          <circle cx="0" cy="0" r="14" fill="${reg.color}" fill-opacity="0.85" stroke="#ffffff" stroke-width="1.8" filter="url(#bubble-drop-shadow)" />
          <text x="0" y="3" text-anchor="middle" font-size="7.5px" font-weight="extrabold" fill="#ffffff">${sign}${reg.pctChange.toFixed(0)}%</text>
          <text x="0" y="-18" text-anchor="middle" font-size="8px" font-weight="extrabold" fill="#0f172a" stroke="#ffffff" stroke-width="2" paint-order="stroke fill">${reg.name}</text>
        </g>
      `;
    }
  });

  if (matchedFeaturesCount > 0) {
    mapCanvasHTML = `${shapePathsHTML}${labelsHTML}${pointsHTML}`;
  } else {
    // Render Hybrid Canvas: Map Outline Frame on Left/Top + Choropleth Region Cards Grid
    const cols = isPortrait ? Math.min(3, Math.max(2, Math.ceil(Math.sqrt(regions.length)))) : Math.min(4, Math.max(2, Math.ceil(Math.sqrt(regions.length))));
    const rows = Math.ceil(regions.length / cols);

    const tileW = Math.max(130, (mapW - (cols + 1) * 12) / cols);
    const tileH = Math.max(75, Math.min(95, (mapH - (rows + 1) * 12) / rows));

    let tilesHTML = "";
    regions.forEach((reg, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);

      const x = padLeft + 12 + c * (tileW + 12);
      const y = padTop + 12 + r * (tileH + 12);

      const sign = reg.pctChange > 0 ? "+" : "";

      tilesHTML += `
        <g transform="translate(${x.toFixed(1)}, ${y.toFixed(1)})">
          <rect x="0" y="0" width="${tileW.toFixed(1)}" height="${tileH.toFixed(1)}" fill="${reg.color}" fill-opacity="0.18" stroke="${reg.color}" stroke-width="2" rx="8" />
          <rect x="0" y="0" width="${tileW.toFixed(1)}" height="22" fill="${reg.color}" fill-opacity="0.9" rx="6" />
          <text x="8" y="15" font-size="10px" font-weight="bold" fill="#ffffff">
            ${reg.name.length > 18 ? reg.name.substring(0, 16) + "…" : reg.name}
          </text>
          <text x="${(tileW - 8).toFixed(1)}" y="15" text-anchor="end" font-size="8.5px" font-weight="bold" fill="#ffffff">
            n=${reg.itemsCount}
          </text>
          <text x="8" y="38" font-size="9px" fill="#334155" font-weight="bold">Pre (${basePeriodName}):</text>
          <text x="${(tileW - 8).toFixed(1)}" y="38" text-anchor="end" font-size="9px" fill="#1e293b" font-weight="bold">${reg.preMean.toFixed(1)} ${unit}</text>
          <text x="8" y="52" font-size="9px" fill="#334155" font-weight="bold">Post (${compPeriodName}):</text>
          <text x="${(tileW - 8).toFixed(1)}" y="52" text-anchor="end" font-size="9px" fill="#1e293b" font-weight="bold">${reg.postMean.toFixed(1)} ${unit}</text>
          <rect x="8" y="${(tileH - 20).toFixed(1)}" width="${(tileW - 16).toFixed(1)}" height="16" fill="#ffffff" stroke="${reg.color}" stroke-width="1" rx="4" />
          <text x="${(tileW / 2).toFixed(1)}" y="${(tileH - 8).toFixed(1)}" text-anchor="middle" font-size="9px" font-weight="bold" fill="${reg.color}">
            SHIFT: ${sign}${reg.pctChange.toFixed(1)}%
          </text>
        </g>
      `;
    });

    mapCanvasHTML = `${shapePathsHTML}${centroidBadgesHTML}${pointsHTML}<g>${tilesHTML}</g>`;
  }

  const detRegionsCount = regions.filter((r) => r.pctChange > 5).length;
  const impRegionsCount = regions.filter((r) => r.pctChange < -5).length;
  const stableRegionsCount = regions.length - detRegionsCount - impRegionsCount;

  // Render Compact Legend & Summary Blocks
  let legendAndSummaryHTML = "";

  if (isPortrait) {
    // Bottom Stacked Cards for Portrait View (Compact side-by-side layout)
    const legendY = padTop + mapH + 12;
    legendAndSummaryHTML = `
      <g transform="translate(${padLeft}, ${legendY})">
        <!-- Card 1: Legend Ramp & Evaluated Regions -->
        <rect x="0" y="0" width="310" height="125" fill="${cardBg}" stroke="${frameStroke}" rx="6" />
        <text x="10" y="16" font-size="9.5px" font-weight="bold" fill="${isDarkBg ? '#f1f5f9' : '#0f172a'}">CHOROPLETH LEGEND (${granularity.toUpperCase()})</text>
        <text x="10" y="29" font-size="8px" fill="${subtitleColor}">${regions.length} ${granularity}s evaluated across ${pairedList.length} sites</text>

        <rect x="10" y="38" width="10" height="10" fill="#dc2626" rx="2" />
        <text x="24" y="46" font-size="8.5px" font-weight="bold" fill="#dc2626">Severe Deterioration (&gt;+20%)</text>

        <rect x="10" y="52" width="10" height="10" fill="#ea580c" rx="2" />
        <text x="24" y="60" font-size="8.5px" font-weight="bold" fill="#ea580c">Moderate Deterioration (+5 to 20%)</text>

        <rect x="10" y="66" width="10" height="10" fill="#eab308" rx="2" />
        <text x="24" y="74" font-size="8.5px" font-weight="bold" fill="#ca8a04">Stable / Minor Shift (&plusmn;5%)</text>

        <rect x="10" y="80" width="10" height="10" fill="#16a34a" rx="2" />
        <text x="24" y="88" font-size="8.5px" font-weight="bold" fill="#16a34a">Moderate Improvement (-5 to -20%)</text>

        <rect x="10" y="94" width="10" height="10" fill="#15803d" rx="2" />
        <text x="24" y="102" font-size="8.5px" font-weight="bold" fill="#15803d">Significant Improvement (&lt;-20%)</text>

        <text x="10" y="117" font-size="8px" font-weight="bold" fill="${subtitleColor}">Periods: ${basePeriodName} → ${compPeriodName}</text>
      </g>

      <g transform="translate(${padLeft + 320}, ${legendY})">
        <!-- Card 2: Regional Stats & Highest Shift Region -->
        <rect x="0" y="0" width="320" height="125" fill="${cardBg}" stroke="${frameStroke}" rx="6" />
        <text x="10" y="16" font-size="9.5px" font-weight="bold" fill="${isDarkBg ? '#f1f5f9' : '#0f172a'}">REGIONAL STATS SUMMARY</text>

        <!-- Compact stats badges -->
        <rect x="10" y="26" width="94" height="34" fill="${isDarkBg ? '#0f172a' : '#fef2f2'}" stroke="#fecaca" rx="4" />
        <text x="14" y="38" font-size="8px" font-weight="bold" fill="#dc2626">Deteriorated</text>
        <text x="14" y="52" font-size="10px" font-weight="extrabold" fill="#dc2626">${detRegionsCount} (${((detRegionsCount / (regions.length || 1)) * 100).toFixed(0)}%)</text>

        <rect x="112" y="26" width="94" height="34" fill="${isDarkBg ? '#0f172a' : '#f0fdf4'}" stroke="#bbf7d0" rx="4" />
        <text x="116" y="38" font-size="8px" font-weight="bold" fill="#16a34a">Improved</text>
        <text x="116" y="52" font-size="10px" font-weight="extrabold" fill="#16a34a">${impRegionsCount} (${((impRegionsCount / (regions.length || 1)) * 100).toFixed(0)}%)</text>

        <rect x="214" y="26" width="96" height="34" fill="${isDarkBg ? '#0f172a' : '#fefce8'}" stroke="#fef08a" rx="4" />
        <text x="218" y="38" font-size="8px" font-weight="bold" fill="#ca8a04">Stable</text>
        <text x="218" y="52" font-size="10px" font-weight="extrabold" fill="#ca8a04">${stableRegionsCount} (${((stableRegionsCount / (regions.length || 1)) * 100).toFixed(0)}%)</text>

        ${regions.length > 0 ? `
          <rect x="10" y="66" width="300" height="48" fill="${isDarkBg ? '#0f172a' : '#f8fafc'}" stroke="${frameStroke}" rx="4" />
          <text x="16" y="79" font-size="8px" font-weight="bold" fill="${subtitleColor}">HIGHEST SHIFT REGION:</text>
          <text x="16" y="93" font-size="10px" font-weight="extrabold" fill="${isDarkBg ? '#f1f5f9' : '#0f172a'}">${regions[0].name}</text>
          <text x="16" y="106" font-size="8.5px" font-weight="bold" fill="${regions[0].color}">
            Pre: ${regions[0].preMean.toFixed(1)} → Post: ${regions[0].postMean.toFixed(1)} (${regions[0].pctChange > 0 ? '+' : ''}${regions[0].pctChange.toFixed(1)}%)
          </text>
        ` : ''}
      </g>
    `;
  } else {
    // Right Sidebar for Landscape View (Compact W=200)
    legendAndSummaryHTML = `
      <g transform="translate(${padLeft + mapW + 12}, ${padTop})">
        <rect x="0" y="0" width="208" height="${mapH}" fill="${cardBg}" stroke="${frameStroke}" rx="6" />
        <text x="10" y="18" font-size="9.5px" font-weight="bold" fill="${isDarkBg ? '#f1f5f9' : '#0f172a'}">CHOROPLETH LEGEND</text>

        <rect x="10" y="28" width="10" height="10" fill="#dc2626" rx="2" />
        <text x="24" y="36" font-size="8.5px" font-weight="bold" fill="#dc2626">Severe Deterioration (&gt;+20%)</text>

        <rect x="10" y="42" width="10" height="10" fill="#ea580c" rx="2" />
        <text x="24" y="50" font-size="8.5px" font-weight="bold" fill="#ea580c">Moderate Deterioration (+5 to 20%)</text>

        <rect x="10" y="56" width="10" height="10" fill="#eab308" rx="2" />
        <text x="24" y="64" font-size="8.5px" font-weight="bold" fill="#ca8a04">Stable / Minor Shift (&plusmn;5%)</text>

        <rect x="10" y="70" width="10" height="10" fill="#16a34a" rx="2" />
        <text x="24" y="78" font-size="8.5px" font-weight="bold" fill="#16a34a">Moderate Improvement (-5 to -20%)</text>

        <rect x="10" y="84" width="10" height="10" fill="#15803d" rx="2" />
        <text x="24" y="92" font-size="8.5px" font-weight="bold" fill="#15803d">Significant Improvement (&lt;-20%)</text>

        <line x1="10" y1="102" x2="198" y2="102" stroke="${frameStroke}" stroke-width="1" />

        <text x="10" y="116" font-size="9.5px" font-weight="bold" fill="${isDarkBg ? '#f1f5f9' : '#0f172a'}">EVALUATED REGIONS SUMMARY</text>
        <text x="10" y="130" font-size="8.5px" font-weight="bold" fill="${isDarkBg ? '#f1f5f9' : '#0f172a'}">${regions.length} ${granularity}s (${pairedList.length} Wells)</text>

        <line x1="10" y1="140" x2="198" y2="140" stroke="${frameStroke}" stroke-width="1" />

        <text x="10" y="154" font-size="9.5px" font-weight="bold" fill="${isDarkBg ? '#f1f5f9' : '#0f172a'}">REGIONAL STATS SUMMARY</text>
        <text x="10" y="170" font-size="8.5px" font-weight="bold" fill="#dc2626">Deteriorated: ${detRegionsCount} (${((detRegionsCount / (regions.length || 1)) * 100).toFixed(0)}%)</text>
        <text x="10" y="186" font-size="8.5px" font-weight="bold" fill="#16a34a">Improved: ${impRegionsCount} (${((impRegionsCount / (regions.length || 1)) * 100).toFixed(0)}%)</text>
        <text x="10" y="202" font-size="8.5px" font-weight="bold" fill="#ca8a04">Stable: ${stableRegionsCount} (${((stableRegionsCount / (regions.length || 1)) * 100).toFixed(0)}%)</text>

        ${regions.length > 0 ? `
          <rect x="10" y="220" width="188" height="52" fill="${isDarkBg ? '#0f172a' : '#f8fafc'}" stroke="${frameStroke}" rx="4" />
          <text x="16" y="234" font-size="8px" font-weight="bold" fill="${subtitleColor}">HIGHEST SHIFT REGION:</text>
          <text x="16" y="248" font-size="9.5px" font-weight="bold" fill="${isDarkBg ? '#f1f5f9' : '#0f172a'}">${regions[0].name}</text>
          <text x="16" y="262" font-size="8.5px" font-weight="bold" fill="${regions[0].color}">
            Pre: ${regions[0].preMean.toFixed(1)} → Post: ${regions[0].postMean.toFixed(1)} (${regions[0].pctChange > 0 ? '+' : ''}${regions[0].pctChange.toFixed(1)}%)
          </text>
        ` : ''}
      </g>
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: ${isTransparent ? 'transparent' : mapBgColor}; border-radius: 8px; border: ${isTransparent ? 'none' : '1px solid #cbd5e1'}; font-family: 'Times New Roman', serif;">
    <defs>
      <radialGradient id="bubble3d-red" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#fca5a5"/>
        <stop offset="40%" stop-color="#dc2626"/>
        <stop offset="100%" stop-color="#7f1d1d"/>
      </radialGradient>
      <radialGradient id="bubble3d-orange" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#fed7aa"/>
        <stop offset="40%" stop-color="#ea580c"/>
        <stop offset="100%" stop-color="#7c2d12"/>
      </radialGradient>
      <radialGradient id="bubble3d-green" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#86efac"/>
        <stop offset="40%" stop-color="#16a34a"/>
        <stop offset="100%" stop-color="#14532d"/>
      </radialGradient>
      <radialGradient id="bubble3d-darkgreen" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#4ade80"/>
        <stop offset="40%" stop-color="#15803d"/>
        <stop offset="100%" stop-color="#052e16"/>
      </radialGradient>
      <radialGradient id="bubble3d-yellow" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#fef08a"/>
        <stop offset="40%" stop-color="#ca8a04"/>
        <stop offset="100%" stop-color="#713f12"/>
      </radialGradient>
      <filter id="bubble-drop-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0.5" dy="1" stdDeviation="0.8" flood-color="#000000" flood-opacity="0.4" />
      </filter>
    </defs>
    <!-- Title Section -->
    <text x="${width / 2}" y="20" text-anchor="middle" font-size="14px" font-weight="bold" fill="${titleColor}">GIS Choropleth Map of Monsoon Hydrochemical Impact - ${paramName}</text>
    <text x="${width / 2}" y="36" text-anchor="middle" font-size="10.5px" font-weight="bold" fill="${subtitleColor}">${granularity.toUpperCase()}-WISE HYDROCHEMICAL IMPACT CHOROPLETH MAP (${basePeriodName} → ${compPeriodName}) [Unit: ${unit || 'mg/L'}]</text>

    <!-- Map Canvas Outer Frame -->
    <rect x="${padLeft}" y="${padTop}" width="${mapW}" height="${mapH}" fill="${frameBg}" stroke="${frameStroke}" stroke-width="1.2" rx="6" />
    ${mapCanvasHTML}

    <!-- Legend & Summary Section -->
    ${legendAndSummaryHTML}
  </svg>`;
};

// Helper to extract chemical ion concentrations (mg/L)
export const getIonVal = (row: any, ionName: string): number => {
  if (!row) return NaN;
  if (row[ionName] !== undefined && row[ionName] !== null && row[ionName] !== "") {
    const v = parseFloat(String(row[ionName]));
    if (!isNaN(v)) return v;
  }
  const aliasesMap: Record<string, string[]> = {
    Na: ["na", "sodium", "na+", "na_mg"],
    Cl: ["cl", "chloride", "cl-", "chlorine", "cl_mg"],
    Ca: ["ca", "calcium", "ca++", "ca2+", "ca_mg"],
    SO4: ["so4", "sulphate", "sulfate", "so4--", "so4_mg"],
    Mg: ["mg", "magnesium", "mg++", "mg2+", "mg_mg"],
    HCO3: ["hco3", "bicarbonate", "hco3-", "hco3_mg"],
    CO3: ["co3", "carbonate", "co3--", "co3_mg"],
    EC: ["ec", "conductivity", "electrical conductivity", "cond", "ec_us"]
  };
  const aliases = aliasesMap[ionName] || [ionName];
  const keys = Object.keys(row);
  for (const key of keys) {
    const kClean = key.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    for (const alias of aliases) {
      if (kClean === alias.toLowerCase().trim().replace(/[^a-z0-9]/g, "")) {
        const v = parseFloat(String(row[key]));
        if (!isNaN(v)) return v;
      }
    }
  }
  return NaN;
};

export type IonicBiplotType = "na-cl" | "ca-so4" | "ec-nasratio" | "cams-hco3so4";

interface BiplotPoint {
  x: number;
  y: number;
  label: string;
}

export const getBiplotXY = (row: any, type: IonicBiplotType): { x: number; y: number } | null => {
  const na = getIonVal(row, "Na") / 22.99;
  const cl = getIonVal(row, "Cl") / 35.45;
  const ca = getIonVal(row, "Ca") / 20.04;
  const so4 = getIonVal(row, "SO4") / 48.03;
  const mg = getIonVal(row, "Mg") / 12.15;
  const hco3 = getIonVal(row, "HCO3") / 61.02;
  const co3Raw = getIonVal(row, "CO3");
  const co3 = isNaN(co3Raw) ? 0 : co3Raw / 30.04;
  const ec = getIonVal(row, "EC");

  if (type === "na-cl") {
    if (!isNaN(cl) && !isNaN(na)) return { x: cl, y: na };
  } else if (type === "ca-so4") {
    if (!isNaN(so4) && !isNaN(ca)) return { x: so4, y: ca };
  } else if (type === "ec-nasratio") {
    if (!isNaN(ec) && !isNaN(na) && !isNaN(cl) && cl > 0) return { x: ec, y: na / cl };
  } else if (type === "cams-hco3so4") {
    const caMg = (isNaN(ca) ? 0 : ca) + (isNaN(mg) ? 0 : mg);
    const anions = (isNaN(hco3) ? 0 : hco3) + co3 + (isNaN(so4) ? 0 : so4);
    if (caMg > 0 && anions > 0) return { x: anions, y: caMg };
  }
  return null;
};

export const getBiplotMeta = (type: IonicBiplotType) => {
  switch (type) {
    case "na-cl":
      return {
        title: "Sodium (Na⁺) vs. Chloride (Cl⁻) Milliequivalent Bi-Plot",
        sub: "Halite Dissolution & Weathering (1:1 Equiline)",
        xTitle: "Chloride (Cl⁻) [meq/L]",
        yTitle: "Sodium (Na⁺) [meq/L]",
        hasEquiline: true
      };
    case "ca-so4":
      return {
        title: "Calcium (Ca²⁺) vs. Sulfate (SO₄²⁻) Milliequivalent Bi-Plot",
        sub: "Gypsum Dissolution & Sourcing (1:1 Equiline)",
        xTitle: "Sulfate (SO₄²⁻) [meq/L]",
        yTitle: "Calcium (Ca²⁺) [meq/L]",
        hasEquiline: true
      };
    case "ec-nasratio":
      return {
        title: "Na⁺/Cl⁻ Ratio vs. Electrical Conductivity (EC) Salinity Bi-Plot",
        sub: "Salinity Sourcing & Evaporation Controls",
        xTitle: "Electrical Conductivity (EC) [µS/cm]",
        yTitle: "Sodium/Chloride Ratio (Na⁺/Cl⁻) [meq ratio]",
        hasEquiline: false
      };
    case "cams-hco3so4":
      return {
        title: "(Ca²⁺ + Mg²⁺) vs. (HCO₃⁻ + SO₄²⁻) Milliequivalent Bi-Plot",
        sub: "Carbonate Weathering Controls (1:1 Equiline)",
        xTitle: "Bicarbonate + Sulfate (HCO₃⁻ + CO₃²⁻ + SO₄²⁻) [meq/L]",
        yTitle: "Calcium + Magnesium (Ca²⁺ + Mg²⁺) [meq/L]",
        hasEquiline: true
      };
  }
};

/**
 * Generates Side-by-Side SVG Hydrochemical Bi-Plots for Matched Locations
 * Panel 1 (Left): Pre-Monsoon (Base Period) Bi-Plot
 * Panel 2 (Right): Post-Monsoon (Compare Period) Bi-Plot
 */
export const generateSideBySideIonicBiPlotSVG = (
  pairedList: any[],
  type: IonicBiplotType,
  basePeriodName: string,
  compPeriodName: string
): string => {
  if (!pairedList.length) return "";

  const meta = getBiplotMeta(type);

  const prePts: BiplotPoint[] = [];
  const postPts: BiplotPoint[] = [];

  pairedList.forEach((item, idx) => {
    const locLabel = item.location || item.wellId || `Sample ${idx + 1}`;
    const preXY = getBiplotXY(item.baseRow, type);
    const postXY = getBiplotXY(item.compRow, type);

    if (preXY) prePts.push({ x: preXY.x, y: preXY.y, label: locLabel });
    if (postXY) postPts.push({ x: postXY.x, y: postXY.y, label: locLabel });
  });

  if (!prePts.length && !postPts.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" style="width:100%;height:auto;background:#fff;border:1px solid #cbd5e1;border-radius:12px;font-family:'Times New Roman',serif;">
      <text x="480" y="150" text-anchor="middle" font-size="14px" font-weight="bold" fill="#64748b">Insufficient ionic chemical data (Na, Cl, Ca, SO4, Mg, HCO3, EC) found for ${meta.title}</text>
    </svg>`;
  }

  const allX = [...prePts.map(p => p.x), ...postPts.map(p => p.x)];
  const allY = [...prePts.map(p => p.y), ...postPts.map(p => p.y)];

  const maxX = safeMax(allX, 0.1) * 1.15;
  const maxY = safeMax(allY, 0.1) * 1.15;
  const maxAxis = meta.hasEquiline ? Math.max(maxX, maxY) : 0;

  const width = 960;
  const height = 530;
  const topPad = 80;
  const botPad = 60;
  const panelW = 410;
  const panelH = height - topPad - botPad;

  const p1Left = 60;
  const p2Left = 510;

  const getPxX = (v: number, pLeft: number) => {
    const lim = meta.hasEquiline ? maxAxis : maxX;
    return pLeft + Math.min(1, Math.max(0, v / lim)) * panelW;
  };

  const getPxY = (v: number) => {
    const lim = meta.hasEquiline ? maxAxis : maxY;
    return topPad + panelH - Math.min(1, Math.max(0, v / lim)) * panelH;
  };

  const renderPanelGrid = (pLeft: number, title: string, colorHex: string) => {
    let html = `
      <rect x="${pLeft}" y="${topPad}" width="${panelW}" height="${panelH}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" rx="4" />
      <text x="${pLeft + panelW / 2}" y="${topPad - 12}" text-anchor="middle" font-size="12.5px" font-weight="bold" fill="${colorHex}">${title}</text>
    `;

    const numTicks = 5;
    const xLim = meta.hasEquiline ? maxAxis : maxX;
    const yLim = meta.hasEquiline ? maxAxis : maxY;

    for (let i = 0; i <= numTicks; i++) {
      const xVal = (i / numTicks) * xLim;
      const px = getPxX(xVal, pLeft);
      html += `<line x1="${px}" y1="${topPad}" x2="${px}" y2="${topPad + panelH}" stroke="#e2e8f0" stroke-width="1" />`;
      html += `<text x="${px}" y="${topPad + panelH + 18}" text-anchor="middle" font-size="9.5px" fill="#64748b">${xVal < 10 ? xVal.toFixed(1) : Math.round(xVal)}</text>`;

      const yVal = (i / numTicks) * yLim;
      const py = getPxY(yVal);
      html += `<line x1="${pLeft}" y1="${py}" x2="${pLeft + panelW}" y2="${py}" stroke="#e2e8f0" stroke-width="1" />`;
      html += `<text x="${pLeft - 8}" y="${py + 3}" text-anchor="end" font-size="9.5px" fill="#64748b">${yVal < 10 ? yVal.toFixed(1) : Math.round(yVal)}</text>`;
    }

    if (meta.hasEquiline) {
      const x0 = getPxX(0, pLeft);
      const y0 = getPxY(0);
      const x1 = getPxX(maxAxis, pLeft);
      const y1 = getPxY(maxAxis);
      html += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#94a3b8" stroke-width="1.8" stroke-dasharray="5 4" />`;
      html += `<text x="${x1 - 40}" y="${y1 + 18}" font-size="9.5px" font-weight="bold" fill="#475569">1:1 Equiline</text>`;
    }

    return html;
  };

  let prePointsHTML = "";
  let preMeanX = 0, preMeanY = 0;
  if (prePts.length) {
    prePts.forEach((pt) => {
      const cx = getPxX(pt.x, p1Left);
      const cy = getPxY(pt.y);
      prePointsHTML += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="#2563eb" fill-opacity="0.8" stroke="#1e3a8a" stroke-width="1" />`;
    });
    preMeanX = prePts.reduce((a, b) => a + b.x, 0) / prePts.length;
    preMeanY = prePts.reduce((a, b) => a + b.y, 0) / prePts.length;
    const mcx = getPxX(preMeanX, p1Left);
    const mcy = getPxY(preMeanY);
    prePointsHTML += `
      <circle cx="${mcx.toFixed(1)}" cy="${mcy.toFixed(1)}" r="8" fill="none" stroke="#dc2626" stroke-width="2" />
      <line x1="${mcx - 10}" y1="${mcy}" x2="${mcx + 10}" y2="${mcy}" stroke="#dc2626" stroke-width="2" />
      <line x1="${mcx}" y1="${mcy - 10}" x2="${mcx}" y2="${mcy + 10}" stroke="#dc2626" stroke-width="2" />
      <text x="${mcx + 10}" y="${mcy - 8}" font-size="9.5px" font-weight="bold" fill="#dc2626">Pre Mean (${preMeanX.toFixed(2)}, ${preMeanY.toFixed(2)})</text>
    `;
  }

  let postPointsHTML = "";
  let postMeanX = 0, postMeanY = 0;
  if (postPts.length) {
    postPts.forEach((pt) => {
      const cx = getPxX(pt.x, p2Left);
      const cy = getPxY(pt.y);
      postPointsHTML += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="#d97706" fill-opacity="0.8" stroke="#78350f" stroke-width="1" />`;
    });
    postMeanX = postPts.reduce((a, b) => a + b.x, 0) / postPts.length;
    postMeanY = postPts.reduce((a, b) => a + b.y, 0) / postPts.length;
    const mcx = getPxX(postMeanX, p2Left);
    const mcy = getPxY(postMeanY);
    postPointsHTML += `
      <circle cx="${mcx.toFixed(1)}" cy="${mcy.toFixed(1)}" r="8" fill="none" stroke="#dc2626" stroke-width="2" />
      <line x1="${mcx - 10}" y1="${mcy}" x2="${mcx + 10}" y2="${mcy}" stroke="#dc2626" stroke-width="2" />
      <line x1="${mcx}" y1="${mcy - 10}" x2="${mcx}" y2="${mcy + 10}" stroke="#dc2626" stroke-width="2" />
      <text x="${mcx + 10}" y="${mcy - 8}" font-size="9.5px" font-weight="bold" fill="#dc2626">Post Mean (${postMeanX.toFixed(2)}, ${postMeanY.toFixed(2)})</text>
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
    <text x="${width / 2}" y="28" text-anchor="middle" font-size="15px" font-weight="bold" fill="#1e3a8a">Matched Locations Side-by-Side Bi-Plot: ${meta.title}</text>
    <text x="${width / 2}" y="48" text-anchor="middle" font-size="11.5px" font-weight="bold" fill="#64748b">${meta.sub}</text>

    <!-- Panel 1: Pre-Monsoon -->
    ${renderPanelGrid(p1Left, `PRE-MONSOON (${basePeriodName}) [N = ${prePts.length}]`, "#1d4ed8")}
    ${prePointsHTML}
    <text x="${p1Left + panelW / 2}" y="${height - 14}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b">${meta.xTitle}</text>
    <text x="18" y="${topPad + panelH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${topPad + panelH / 2})">${meta.yTitle}</text>

    <!-- Panel 2: Post-Monsoon -->
    ${renderPanelGrid(p2Left, `POST-MONSOON (${compPeriodName}) [N = ${postPts.length}]`, "#b45309")}
    ${postPointsHTML}
    <text x="${p2Left + panelW / 2}" y="${height - 14}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b">${meta.xTitle}</text>
  </svg>`;
};

/**
 * Generates Shift Vector Bi-Plot showing Pre -> Post Monsoon directional movement for each matched location
 */
export const generateMonsoonShiftVectorBiPlotSVG = (
  pairedList: any[],
  type: IonicBiplotType,
  basePeriodName: string,
  compPeriodName: string
): string => {
  if (!pairedList.length) return "";

  const meta = getBiplotMeta(type);

  const vectors: { label: string; preX: number; preY: number; postX: number; postY: number }[] = [];

  pairedList.forEach((item, idx) => {
    const locLabel = item.location || item.wellId || `Sample ${idx + 1}`;
    const preXY = getBiplotXY(item.baseRow, type);
    const postXY = getBiplotXY(item.compRow, type);

    if (preXY && postXY) {
      vectors.push({
        label: locLabel,
        preX: preXY.x,
        preY: preXY.y,
        postX: postXY.x,
        postY: postXY.y
      });
    }
  });

  if (!vectors.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 300" style="width:100%;height:auto;background:#fff;border:1px solid #cbd5e1;border-radius:12px;font-family:'Times New Roman',serif;">
      <text x="460" y="150" text-anchor="middle" font-size="14px" font-weight="bold" fill="#64748b">No complete paired chemical data found for ${meta.title}</text>
    </svg>`;
  }

  const allX = [...vectors.map(v => v.preX), ...vectors.map(v => v.postX)];
  const allY = [...vectors.map(v => v.preY), ...vectors.map(v => v.postY)];

  const maxX = safeMax(allX, 0.1) * 1.15;
  const maxY = safeMax(allY, 0.1) * 1.15;
  const maxAxis = meta.hasEquiline ? Math.max(maxX, maxY) : 0;

  const width = 920;
  const height = 530;
  const padLeft = 65;
  const padRight = 170;
  const padTop = 80;
  const padBottom = 60;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getX = (v: number) => {
    const lim = meta.hasEquiline ? maxAxis : maxX;
    return padLeft + Math.min(1, Math.max(0, v / lim)) * plotW;
  };

  const getY = (v: number) => {
    const lim = meta.hasEquiline ? maxAxis : maxY;
    return padTop + plotH - Math.min(1, Math.max(0, v / lim)) * plotH;
  };

  let gridHTML = "";
  const numTicks = 6;
  const xLim = meta.hasEquiline ? maxAxis : maxX;
  const yLim = meta.hasEquiline ? maxAxis : maxY;

  for (let i = 0; i <= numTicks; i++) {
    const xVal = (i / numTicks) * xLim;
    const px = getX(xVal);
    gridHTML += `<line x1="${px}" y1="${padTop}" x2="${px}" y2="${padTop + plotH}" stroke="#e2e8f0" stroke-width="1" />`;
    gridHTML += `<text x="${px}" y="${padTop + plotH + 18}" text-anchor="middle" font-size="9.5px" fill="#64748b">${xVal < 10 ? xVal.toFixed(1) : Math.round(xVal)}</text>`;

    const yVal = (i / numTicks) * yLim;
    const py = getY(yVal);
    gridHTML += `<line x1="${padLeft}" y1="${py}" x2="${padLeft + plotW}" y2="${py}" stroke="#e2e8f0" stroke-width="1" />`;
    gridHTML += `<text x="${padLeft - 8}" y="${py + 3}" text-anchor="end" font-size="9.5px" fill="#64748b">${yVal < 10 ? yVal.toFixed(1) : Math.round(yVal)}</text>`;
  }

  if (meta.hasEquiline) {
    const x0 = getX(0);
    const y0 = getY(0);
    const x1 = getX(maxAxis);
    const y1 = getY(maxAxis);
    gridHTML += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 4" />`;
    gridHTML += `<text x="${x1 - 45}" y="${y1 + 18}" font-size="10px" font-weight="bold" fill="#475569">1:1 Equiline</text>`;
  }

  let vectorHTML = "";
  vectors.forEach((v) => {
    const x1 = getX(v.preX);
    const y1 = getY(v.preY);
    const x2 = getX(v.postX);
    const y2 = getY(v.postY);

    vectorHTML += `
      <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="2 2" marker-end="url(#arrowhead)" />
      <circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="4" fill="#2563eb" stroke="#ffffff" stroke-width="1" />
      <circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="4.5" fill="#d97706" stroke="#ffffff" stroke-width="1" />
    `;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
    <defs>
      <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <polygon points="0 0, 6 3, 0 6" fill="#6366f1" />
      </marker>
    </defs>

    <text x="${width / 2}" y="28" text-anchor="middle" font-size="15px" font-weight="bold" fill="#1e3a8a">Matched Locations Hydrochemical Shift Vectors Bi-Plot</text>
    <text x="${width / 2}" y="48" text-anchor="middle" font-size="11.5px" font-weight="bold" fill="#64748b">${meta.title} (${basePeriodName} → ${compPeriodName})</text>

    <rect x="${padLeft}" y="${padTop}" width="${plotW}" height="${plotH}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" rx="4" />
    ${gridHTML}
    ${vectorHTML}

    <text x="${padLeft + plotW / 2}" y="${height - 14}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b">${meta.xTitle}</text>
    <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${padTop + plotH / 2})">${meta.yTitle}</text>

    <!-- Legend -->
    <g transform="translate(${padLeft + plotW + 12}, ${padTop + 10})">
      <rect x="0" y="0" width="150" height="150" fill="#f8fafc" stroke="#cbd5e1" rx="6" />
      <text x="10" y="20" font-size="11px" font-weight="bold" fill="#1e293b">Vector Legend</text>

      <circle cx="18" cy="42" r="5" fill="#2563eb" />
      <text x="32" y="45" font-size="10px" font-weight="bold" fill="#2563eb">Pre-Monsoon</text>
      <text x="32" y="56" font-size="8.5px" fill="#64748b">(${basePeriodName})</text>

      <circle cx="18" cy="80" r="5" fill="#d97706" />
      <text x="32" y="83" font-size="10px" font-weight="bold" fill="#d97706">Post-Monsoon</text>
      <text x="32" y="94" font-size="8.5px" fill="#64748b">(${compPeriodName})</text>

      <line x1="12" y1="120" x2="28" y2="120" stroke="#6366f1" stroke-width="2" stroke-dasharray="2 2" />
      <text x="34" y="123" font-size="9.5px" font-weight="bold" fill="#6366f1">Shift Vector</text>
    </g>
  </svg>`;
};

/**
 * Generates Side-by-Side Parameter Concentration Comparison Charts for Matched Locations
 */
export const generateSideBySideParamChartSVG = (
  pairedList: any[],
  paramName: string,
  unit: string,
  basePeriodName: string,
  compPeriodName: string
): string => {
  if (!pairedList.length) return "";

  const data = pairedList.map((item, idx) => {
    const locLabel = item.location || item.wellId || item.district || `Site ${idx + 1}`;
    const preVal = item.preVal;
    const postVal = item.postVal;
    return { label: locLabel, preVal, postVal };
  }).filter(d => !isNaN(d.preVal) && !isNaN(d.postVal));

  if (!data.length) return "";

  const maxVal = safeMax(data.map(d => safeMax(d.preVal, d.postVal)), 0.1) * 1.15;

  const width = 960;
  const topPad = 80;
  const botPad = 50;
  const barH = 18;
  const rowGap = 5;
  const panelH = Math.max(400, data.length * (barH + rowGap) + 30);
  const height = topPad + botPad + panelH;

  const panelW = 410;

  const p1Left = 60;
  const p2Left = 510;

  const getPxW = (v: number) => (v / maxVal) * (panelW - 100);

  let p1Bars = "";
  let p2Bars = "";

  data.forEach((d, i) => {
    const y = topPad + 15 + i * (barH + rowGap);

    // Pre Bar
    const w1 = getPxW(d.preVal);
    p1Bars += `
      <text x="${p1Left + 85}" y="${y + barH - 4}" text-anchor="end" font-size="8.5px" fill="#334155">${d.label.length > 15 ? d.label.substring(0, 14) + '…' : d.label}</text>
      <rect x="${p1Left + 90}" y="${y}" width="${w1}" height="${barH - 2}" fill="#3b82f6" rx="2" />
      <text x="${p1Left + 95 + w1}" y="${y + barH - 4}" font-size="8px" font-weight="bold" fill="#1e293b">${d.preVal.toFixed(1)}</text>
    `;

    // Post Bar
    const w2 = getPxW(d.postVal);
    p2Bars += `
      <text x="${p2Left + 85}" y="${y + barH - 4}" text-anchor="end" font-size="8.5px" fill="#334155">${d.label.length > 15 ? d.label.substring(0, 14) + '…' : d.label}</text>
      <rect x="${p2Left + 90}" y="${y}" width="${w2}" height="${barH - 2}" fill="#f59e0b" rx="2" />
      <text x="${p2Left + 95 + w2}" y="${y + barH - 4}" font-size="8px" font-weight="bold" fill="#1e293b">${d.postVal.toFixed(1)}</text>
    `;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
    <text x="${width / 2}" y="28" text-anchor="middle" font-size="15px" font-weight="bold" fill="#1e3a8a">Matched Locations Side-by-Side Concentration Comparison - ${paramName}</text>
    <text x="${width / 2}" y="48" text-anchor="middle" font-size="11.5px" font-weight="bold" fill="#64748b">Pre-Monsoon (${basePeriodName}) vs Post-Monsoon (${compPeriodName}) [Unit: ${unit || 'mg/L'}]</text>

    <!-- Panel 1: Pre-Monsoon -->
    <rect x="${p1Left}" y="${topPad}" width="${panelW}" height="${panelH}" fill="#f8fafc" stroke="#cbd5e1" rx="6" />
    <text x="${p1Left + panelW / 2}" y="${topPad - 12}" text-anchor="middle" font-size="12.5px" font-weight="bold" fill="#1d4ed8">PRE-MONSOON (${basePeriodName})</text>
    ${p1Bars}

    <!-- Panel 2: Post-Monsoon -->
    <rect x="${p2Left}" y="${topPad}" width="${panelW}" height="${panelH}" fill="#f8fafc" stroke="#cbd5e1" rx="6" />
    <text x="${p2Left + panelW / 2}" y="${topPad - 12}" text-anchor="middle" font-size="12.5px" font-weight="bold" fill="#b45309">POST-MONSOON (${compPeriodName})</text>
    ${p2Bars}
  </svg>`;
};

