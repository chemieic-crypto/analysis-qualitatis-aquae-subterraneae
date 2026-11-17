import { PARAM_CONFIG } from "../data/config";

export const getBulletinMonsoonPercentile = (sortedArr: number[], p: number): number => {
  if (!sortedArr.length) return 0;
  if (sortedArr.length === 1) return sortedArr[0];
  const idx = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight;
};

export const getBulletinMonsoonStats = (arr: number[]) => {
  if (!arr.length) return { min: 0, max: 0, mean: 0, median: 0, q1: 0, q3: 0, stdDev: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const median = getBulletinMonsoonPercentile(sorted, 50);
  const q1 = getBulletinMonsoonPercentile(sorted, 25);
  const q3 = getBulletinMonsoonPercentile(sorted, 75);
  const variance = sorted.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sorted.length;
  const stdDev = Math.sqrt(variance);
  return { min, max, mean, median, q1, q3, stdDev };
};

export const generateMonsoonDualOgiveSVG = (preVals: number[], postVals: number[], paramName: string, unit: string): string => {
  if (!preVals.length || !postVals.length) return "";
  const sortedPre = [...preVals].sort((a, b) => a - b);
  const sortedPost = [...postVals].sort((a, b) => a - b);

  const maxVal = Math.max(sortedPre[sortedPre.length - 1] ?? 0, sortedPost[sortedPost.length - 1] ?? 0, 0.001);
  const minVal = 0;

  const width = 720;
  const height = 400;
  const padLeft = 65;
  const padRight = 160;
  const padTop = 45;
  const padBottom = 55;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getX = (v: number) => padLeft + Math.min(1, Math.max(0, (v - minVal) / (maxVal - minVal))) * plotW;
  const getY = (pct: number) => padTop + plotH - (pct / 100) * plotH;

  let pathPre = "";
  sortedPre.forEach((val, i) => {
    const pct = ((i + 1) / sortedPre.length) * 100;
    const x = getX(val);
    const y = getY(pct);
    pathPre += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  let pathPost = "";
  sortedPost.forEach((val, i) => {
    const pct = ((i + 1) / sortedPost.length) * 100;
    const x = getX(val);
    const y = getY(pct);
    pathPost += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  const preMedian = getBulletinMonsoonPercentile(sortedPre, 50);
  const postMedian = getBulletinMonsoonPercentile(sortedPost, 50);
  const preP90 = getBulletinMonsoonPercentile(sortedPre, 90);
  const postP90 = getBulletinMonsoonPercentile(sortedPost, 90);

  let gridHTML = "";
  [0, 25, 50, 75, 90, 100].forEach((pct) => {
    const y = getY(pct);
    gridHTML += `<line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e2e8f0" stroke-width="${pct === 50 || pct === 90 ? 1.5 : 1}" stroke-dasharray="${pct === 50 || pct === 90 ? '4 4' : 'none'}" />`;
    gridHTML += `<text x="${padLeft - 10}" y="${y + 4}" text-anchor="end" font-size="10px" font-family="'Times New Roman', serif" fill="#64748b">${pct}%</text>`;
  });

  const numTicks = 5;
  for (let i = 0; i <= numTicks; i++) {
    const val = minVal + (i / numTicks) * (maxVal - minVal);
    const x = getX(val);
    gridHTML += `<line x1="${x}" y1="${padTop + plotH}" x2="${x}" y2="${padTop + plotH + 5}" stroke="#94a3b8" stroke-width="1" />`;
    gridHTML += `<text x="${x}" y="${padTop + plotH + 20}" text-anchor="middle" font-size="10px" font-family="'Times New Roman', serif" fill="#64748b">${val < 10 ? val.toFixed(2) : Math.round(val)}</text>`;
  }

  const unitLabel = unit ? ` (${unit})` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
          <text x="${width / 2}" y="25" text-anchor="middle" font-size="14px" font-weight="bold" fill="#1e3a8a">Pre-Monsoon vs Post-Monsoon Ogive Curves - ${paramName}</text>
          ${gridHTML}
          <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
          <line x1="${padLeft}" y1="${padTop + plotH}" x2="${padLeft + plotW}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
          <text x="${padLeft + plotW / 2}" y="${height - 12}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b">Concentration ${unitLabel}</text>
          <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${padTop + plotH / 2})">Cumulative Percentage (%)</text>
          <path d="${pathPre}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round" />
          <path d="${pathPost}" fill="none" stroke="#059669" stroke-width="2.5" stroke-linejoin="round" />
          <g transform="translate(${padLeft + plotW + 15}, ${padTop + 20})">
            <rect x="0" y="0" width="135" height="110" fill="#f8fafc" stroke="#cbd5e1" rx="6" />
            <text x="10" y="20" font-size="11px" font-weight="bold" fill="#1e293b">Legend</text>
            <line x1="10" y1="40" x2="35" y2="40" stroke="#2563eb" stroke-width="3" />
            <text x="42" y="44" font-size="10px" font-weight="bold" fill="#2563eb">Pre-Monsoon</text>
            <text x="42" y="56" font-size="9px" fill="#475569">Med: ${preMedian.toFixed(2)} | P90: ${preP90.toFixed(2)}</text>
            <line x1="10" y1="75" x2="35" y2="75" stroke="#059669" stroke-width="3" />
            <text x="42" y="79" font-size="10px" font-weight="bold" fill="#059669">Post-Monsoon</text>
            <text x="42" y="91" font-size="9px" fill="#475569">Med: ${postMedian.toFixed(2)} | P90: ${postP90.toFixed(2)}</text>
          </g>
        </svg>`;
};

export const generateMonsoonBoxPlotSVG = (preVals: number[], postVals: number[], paramName: string, unit: string): string => {
  if (!preVals.length || !postVals.length) return "";
  const preStats = getBulletinMonsoonStats(preVals);
  const postStats = getBulletinMonsoonStats(postVals);

  const maxVal = Math.max(preStats.max, postStats.max, 0.001);
  const minVal = 0;

  const width = 650;
  const height = 400;
  const padLeft = 70;
  const padRight = 40;
  const padTop = 45;
  const padBottom = 55;

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

  const renderBox = (stats: ReturnType<typeof getBulletinMonsoonStats>, cx: number, label: string, colorHex: string, borderHex: string) => {
    const yMin = getY(stats.min);
    const yQ1 = getY(stats.q1);
    const yMed = getY(stats.median);
    const yMean = getY(stats.mean);
    const yQ3 = getY(stats.q3);
    const yMax = getY(stats.max);

    const boxW = 100;
    const xLeft = cx - boxW / 2;

    return `
            <line x1="${cx}" y1="${yMax}" x2="${cx}" y2="${yQ3}" stroke="${borderHex}" stroke-width="2" />
            <line x1="${cx}" y1="${yQ1}" x2="${cx}" y2="${yMin}" stroke="${borderHex}" stroke-width="2" />
            <line x1="${cx - 20}" y1="${yMax}" x2="${cx + 20}" y2="${yMax}" stroke="${borderHex}" stroke-width="2" />
            <line x1="${cx - 20}" y1="${yMin}" x2="${cx + 20}" y2="${yMin}" stroke="${borderHex}" stroke-width="2" />
            <rect x="${xLeft}" y="${yQ3}" width="${boxW}" height="${Math.max(2, yQ1 - yQ3)}" fill="${colorHex}" fill-opacity="0.25" stroke="${borderHex}" stroke-width="2" rx="4" />
            <line x1="${xLeft}" y1="${yMed}" x2="${xLeft + boxW}" y2="${yMed}" stroke="${borderHex}" stroke-width="3.5" />
            <circle cx="${cx}" cy="${yMean}" r="4.5" fill="#dc2626" stroke="#ffffff" stroke-width="1.5" />
            <text x="${cx}" y="${height - padBottom + 20}" text-anchor="middle" font-size="12px" font-weight="bold" fill="${borderHex}">${label}</text>
            <text x="${xLeft + boxW + 8}" y="${yMed + 3}" font-size="9px" font-weight="bold" fill="${borderHex}">Med: ${stats.median.toFixed(2)}</text>
            <text x="${xLeft + boxW + 8}" y="${yMean + 3}" font-size="9px" fill="#dc2626">Mean: ${stats.mean.toFixed(2)}</text>
            <text x="${xLeft + boxW + 8}" y="${yQ3 + 3}" font-size="8.5px" fill="#64748b">Q3: ${stats.q3.toFixed(2)}</text>
            <text x="${xLeft + boxW + 8}" y="${yQ1 + 3}" font-size="8.5px" fill="#64748b">Q1: ${stats.q1.toFixed(2)}</text>
          `;
  };

  const unitLabel = unit ? ` (${unit})` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
          <text x="${width / 2}" y="25" text-anchor="middle" font-size="14px" font-weight="bold" fill="#1e3a8a">Pre vs Post Monsoon Box & Whisker Comparison - ${paramName}</text>
          ${gridHTML}
          <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
          <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
          <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${padTop + plotH / 2})">Concentration ${unitLabel}</text>
          ${renderBox(preStats, 210, "Pre-Monsoon", "#3b82f6", "#1d4ed8")}
          ${renderBox(postStats, 440, "Post-Monsoon", "#10b981", "#047857")}
        </svg>`;
};

export const generateMonsoonAveragePlotSVG = (groupList: any[], pairedList: any[], paramName: string, unit: string): string => {
  if (!pairedList.length) return "";
  const topGroups = groupList.slice(0, 8);
  const overallPreMean = pairedList.reduce((acc, p) => acc + p.preVal, 0) / pairedList.length;
  const overallPostMean = pairedList.reduce((acc, p) => acc + p.postVal, 0) / pairedList.length;

  const dataItems: Array<{ label: string; preMean: number; postMean: number }> = [
    { label: "Overall Average", preMean: overallPreMean, postMean: overallPostMean }
  ];

  topGroups.forEach((g) => {
    const items = pairedList.filter((p) => p.district === g.name || p.state === g.name);
    if (items.length > 0) {
      const preM = items.reduce((acc, p) => acc + p.preVal, 0) / items.length;
      const postM = items.reduce((acc, p) => acc + p.postVal, 0) / items.length;
      dataItems.push({ label: g.name, preMean: preM, postMean: postM });
    }
  });

  const maxVal = dataItems.reduce((m, d) => Math.max(m, d.preMean, d.postMean), 0.001) * 1.15;

  const width = 720;
  const height = 420;
  const padLeft = 65;
  const padRight = 30;
  const padTop = 45;
  const padBottom = 85;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getY = (v: number) => padTop + plotH - (v / maxVal) * plotH;

  let gridHTML = "";
  const numTicks = 5;
  for (let i = 0; i <= numTicks; i++) {
    const val = (i / numTicks) * maxVal;
    const y = getY(val);
    gridHTML += `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`;
    gridHTML += `<text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="10px" font-family="'Times New Roman', serif" fill="#64748b">${val < 10 ? val.toFixed(2) : Math.round(val)}</text>`;
  }

  const groupWidth = plotW / dataItems.length;
  const barWidth = Math.min(26, groupWidth * 0.35);

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
            <text x="${xPre + barWidth / 2}" y="${yPre - 4}" text-anchor="middle" font-size="8.5px" font-weight="bold" fill="#3730a3">${item.preMean.toFixed(1)}</text>
            <rect x="${xPost}" y="${yPost}" width="${barWidth}" height="${Math.max(1, hPost)}" fill="#10b981" rx="3" />
            <text x="${xPost + barWidth / 2}" y="${yPost - 4}" text-anchor="middle" font-size="8.5px" font-weight="bold" fill="#065f46">${item.postMean.toFixed(1)}</text>
            <text x="${cx}" y="${padTop + plotH + 18}" text-anchor="end" font-size="10px" font-weight="${idx === 0 ? 'bold' : 'normal'}" fill="${idx === 0 ? '#1e1b4b' : '#334155'}" transform="rotate(-30, ${cx}, ${padTop + plotH + 18})">${item.label}</text>
          `;
  });

  const unitLabel = unit ? ` (${unit})` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
          <text x="${width / 2}" y="25" text-anchor="middle" font-size="14px" font-weight="bold" fill="#1e3a8a">Average Concentration Comparison (Pre vs Post Monsoon) - ${paramName}</text>
          ${gridHTML}
          <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
          <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
          <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${padTop + plotH / 2})">Mean ${paramName}${unitLabel}</text>
          ${barsHTML}
          <g transform="translate(${width - 200}, 35)">
            <rect x="0" y="0" width="170" height="30" fill="#f8fafc" stroke="#cbd5e1" rx="4" />
            <rect x="10" y="9" width="12" height="12" fill="#4f46e5" rx="2" />
            <text x="26" y="19" font-size="9.5px" font-weight="bold" fill="#3730a3">Pre-Monsoon Mean</text>
            <rect x="95" y="9" width="12" height="12" fill="#10b981" rx="2" />
            <text x="111" y="19" font-size="9.5px" font-weight="bold" fill="#065f46">Post-Monsoon Mean</text>
          </g>
        </svg>`;
};

export const generateMonsoonViolinPlotSVG = (preVals: number[], postVals: number[], paramName: string, unit: string): string => {
  if (!preVals.length || !postVals.length) return "";
  const preStats = getBulletinMonsoonStats(preVals);
  const postStats = getBulletinMonsoonStats(postVals);

  const maxVal = Math.max(preStats.max, postStats.max, 0.001);
  const minVal = 0;

  const width = 650;
  const height = 400;
  const padLeft = 70;
  const padRight = 40;
  const padTop = 45;
  const padBottom = 55;

  const plotH = height - padTop - padBottom;
  const getY = (v: number) => padTop + plotH - (Math.min(1, Math.max(0, (v - minVal) / (maxVal - minVal)))) * plotH;

  const getDensity = (arr: number[]) => {
    const bins = 12;
    const counts = new Array(bins).fill(0);
    arr.forEach((v) => {
      const idx = Math.min(bins - 1, Math.floor(((v - minVal) / (maxVal - minVal)) * bins));
      counts[idx]++;
    });
    const maxCount = Math.max(...counts, 1);
    return counts.map((c) => c / maxCount);
  };

  const preDens = getDensity(preVals);
  const postDens = getDensity(postVals);

  const renderViolin = (stats: ReturnType<typeof getBulletinMonsoonStats>, dens: number[], cx: number, label: string, strokeHex: string, fillHex: string) => {
    const bins = dens.length;
    const maxWidth = 55;

    const rightPts: string[] = [];
    const leftPts: string[] = [];

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
            <text x="${cx}" y="${height - padBottom + 20}" text-anchor="middle" font-size="12px" font-weight="bold" fill="${strokeHex}">${label}</text>
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
          <text x="${width / 2}" y="25" text-anchor="middle" font-size="14px" font-weight="bold" fill="#1e3a8a">Pre vs Post Monsoon Kernel Density Violin Plot - ${paramName}</text>
          ${gridHTML}
          <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
          <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
          <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${padTop + plotH / 2})">Concentration ${unitLabel}</text>
          ${renderViolin(preStats, preDens, 210, "Pre-Monsoon Density", "#2563eb", "#3b82f6")}
          ${renderViolin(postStats, postDens, 440, "Post-Monsoon Density", "#059669", "#10b981")}
        </svg>`;
};

export const generateMonsoonDonutChartSVG = (
  totalSamples: number,
  totalImproved: number,
  totalDeteriorated: number,
  totalUnchanged: number,
  totalShiftedSafeToUnsafe: number,
  totalShiftedUnsafeToSafe: number,
  paramName: string
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
  const cy = 195;
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
  let legY = 70;
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 380" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
          <text x="300" y="25" text-anchor="middle" font-size="14px" font-weight="bold" fill="#1e3a8a">Monsoon Impact Status Distribution Donut Chart - ${paramName}</text>
          ${pathsHTML}
          <circle cx="${cx}" cy="${cy}" r="${innerR - 2}" fill="#ffffff" />
          <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="18px" font-weight="bold" fill="#1e3a8a">${totalSamples}</text>
          <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10px" font-weight="bold" fill="#64748b">Matched Sites</text>
          ${legendHTML}
        </svg>`;
};

export const generateMonsoonExceedanceBarSVG = (groupList: any[], pairedList: any[], paramName: string, unit: string, configKey: string): string => {
  if (!pairedList.length) return "";

  const config = PARAM_CONFIG[configKey];
  const isSingleLimit = config ? config.b1 === config.b2 && configKey !== "pH" : false;
  const limit = config ? (isSingleLimit ? config.b1 : config.b2) : 0;

  const topGroups = groupList.slice(0, 8);

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

  topGroups.forEach((g) => {
    const items = pairedList.filter((p) => p.district === g.name || p.state === g.name);
    if (items.length > 0) {
      const prePct = (getExceedCount(items, false) / items.length) * 100;
      const postPct = (getExceedCount(items, true) / items.length) * 100;
      dataItems.push({ label: g.name, preExc: prePct, postExc: postPct });
    }
  });

  const maxVal = dataItems.reduce((m, d) => Math.max(m, d.preExc, d.postExc), 10) * 1.15;

  const width = 720;
  const height = 420;
  const padLeft = 65;
  const padRight = 30;
  const padTop = 45;
  const padBottom = 85;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getY = (v: number) => padTop + plotH - (v / maxVal) * plotH;

  let gridHTML = "";
  [0, 20, 40, 60, 80, 100].forEach((pct) => {
    if (pct <= maxVal) {
      const y = getY(pct);
      gridHTML += `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`;
      gridHTML += `<text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="10px" font-family="'Times New Roman', serif" fill="#64748b">${pct}%</text>`;
    }
  });

  const groupWidth = plotW / dataItems.length;
  const barWidth = Math.min(26, groupWidth * 0.35);

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
            <text x="${xPre + barWidth / 2}" y="${yPre - 4}" text-anchor="middle" font-size="8.5px" font-weight="bold" fill="#4338ca">${item.preExc.toFixed(1)}%</text>
            <rect x="${xPost}" y="${yPost}" width="${barWidth}" height="${Math.max(1, hPost)}" fill="#059669" rx="3" />
            <text x="${xPost + barWidth / 2}" y="${yPost - 4}" text-anchor="middle" font-size="8.5px" font-weight="bold" fill="#047857">${item.postExc.toFixed(1)}%</text>
            <text x="${cx}" y="${padTop + plotH + 18}" text-anchor="end" font-size="10px" font-weight="${idx === 0 ? 'bold' : 'normal'}" fill="${idx === 0 ? '#1e1b4b' : '#334155'}" transform="rotate(-30, ${cx}, ${padTop + plotH + 18})">${item.label}</text>
          `;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
          <text x="${width / 2}" y="25" text-anchor="middle" font-size="14px" font-weight="bold" fill="#1e3a8a">Pre vs Post Monsoon Exceedance Rate Comparison (%) - ${paramName}</text>
          ${gridHTML}
          <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
          <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#334155" stroke-width="1.5" />
          <text x="18" y="${padTop + plotH / 2}" text-anchor="middle" font-size="11px" font-weight="bold" fill="#1e293b" transform="rotate(-90, 18, ${padTop + plotH / 2})">% Exceeding Permissible Limit</text>
          ${barsHTML}
          <g transform="translate(${width - 220}, 35)">
            <rect x="0" y="0" width="190" height="30" fill="#f8fafc" stroke="#cbd5e1" rx="4" />
            <rect x="10" y="9" width="12" height="12" fill="#6366f1" rx="2" />
            <text x="26" y="19" font-size="9.5px" font-weight="bold" fill="#4338ca">Pre-Monsoon Exceedance</text>
            <rect x="105" y="9" width="12" height="12" fill="#059669" rx="2" />
            <text x="121" y="19" font-size="9.5px" font-weight="bold" fill="#047857">Post-Monsoon Exceedance</text>
          </g>
        </svg>`;
};

export const generateMonsoonScatterBiPlotSVG = (pairedList: any[], paramName: string, unit: string, configKey: string): string => {
  if (!pairedList.length) return "";

  const config = PARAM_CONFIG[configKey];
  const isSingleLimit = config ? config.b1 === config.b2 && configKey !== "pH" : false;
  const limit = config ? (isSingleLimit ? config.b1 : config.b2) : 0;

  const maxVal = pairedList.reduce((m, p) => Math.max(m, p.preVal, p.postVal), limit || 1) * 1.1;

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
            <text x="36" y="127" font-size="9.5px" fill="#475569">Unchanged (±20%)</text>
          </g>
        </svg>`;
};

export const generateMonsoonSpatialMapSVG = (pairedList: any[], paramName: string, unit: string, configKey: string): string => {
  if (!pairedList.length) return "";

  const config = PARAM_CONFIG[configKey];
  const isSingleLimit = config ? config.b1 === config.b2 && configKey !== "pH" : false;
  const limit = config ? (isSingleLimit ? config.b1 : config.b2) : 0;

  let minLat = 999, maxLat = -999, minLng = 999, maxLng = -999;
  const processedPoints = pairedList.map((p, idx) => {
    let lat = parseFloat(p.lat || p.latitude);
    let lng = parseFloat(p.lng || p.longitude);

    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
      let hash = 0;
      const str = (p.district + p.block + p.location + p.key + idx);
      for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
      const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
      const dist = 0.15 + ((Math.abs(hash >> 3) % 100) / 100) * 1.5;
      lat = 20.5 + Math.sin(angle) * dist;
      lng = 78.9 + Math.cos(angle) * dist;
    }

    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;

    const pct = p.preVal === 0 ? (p.postVal === 0 ? 0 : 100) : ((p.postVal - p.preVal) / p.preVal) * 100;

    let status = "unchanged";
    let color = "#64748b";
    let label = "Unchanged (±20%)";

    if (configKey === "pH") {
      const preSafe = p.preVal >= (config?.b1 || 6.5) && p.preVal <= (config?.b2 || 8.5);
      const postSafe = p.postVal >= (config?.b1 || 6.5) && p.postVal <= (config?.b2 || 8.5);
      if (preSafe && !postSafe) { status = "safe_to_unsafe"; color = "#e11d48"; label = "Shifted Safe → Unsafe"; }
      else if (!preSafe && postSafe) { status = "unsafe_to_safe"; color = "#0d9488"; label = "Shifted Unsafe → Safe"; }
      else if (pct < -20) { status = "improved"; color = "#16a34a"; label = "Improved (>20% ↓)"; }
      else if (pct > 20) { status = "deteriorated"; color = "#dc2626"; label = "Deteriorated (>20% ↑)"; }
    } else if (limit > 0) {
      const preSafe = p.preVal <= limit;
      const postSafe = p.postVal <= limit;
      if (preSafe && !postSafe) { status = "safe_to_unsafe"; color = "#e11d48"; label = "Shifted Safe → Unsafe"; }
      else if (!preSafe && postSafe) { status = "unsafe_to_safe"; color = "#0d9488"; label = "Shifted Unsafe → Safe"; }
      else if (pct < -20) { status = "improved"; color = "#16a34a"; label = "Improved (>20% ↓)"; }
      else if (pct > 20) { status = "deteriorated"; color = "#dc2626"; label = "Deteriorated (>20% ↑)"; }
    } else {
      if (pct < -20) { status = "improved"; color = "#16a34a"; label = "Improved (>20% ↓)"; }
      else if (pct > 20) { status = "deteriorated"; color = "#dc2626"; label = "Deteriorated (>20% ↑)"; }
    }

    return { ...p, lat, lng, pct, status, color, label };
  });

  const latSpan = Math.max(0.2, maxLat - minLat);
  const lngSpan = Math.max(0.2, maxLng - minLng);

  minLat -= latSpan * 0.12;
  maxLat += latSpan * 0.12;
  minLng -= lngSpan * 0.12;
  maxLng += lngSpan * 0.12;

  const width = 740;
  const height = 480;
  const padLeft = 65;
  const padRight = 180;
  const padTop = 45;
  const padBottom = 50;

  const mapW = width - padLeft - padRight;
  const mapH = height - padTop - padBottom;

  const midLng = (minLng + maxLng) / 2;
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180) || 0.92;

  const spanXDeg = Math.max(0.001, (maxLng - minLng) * cosLat);
  const spanYDeg = Math.max(0.001, maxLat - minLat);

  const scaleX = mapW / spanXDeg;
  const scaleY = mapH / spanYDeg;
  const fitScale = Math.min(scaleX, scaleY) || 1;

  const mapCenterX = padLeft + mapW / 2;
  const mapCenterY = padTop + mapH / 2;

  const getX = (lngVal: number) => mapCenterX + (lngVal - midLng) * cosLat * fitScale;
  const getY = (latVal: number) => mapCenterY - (latVal - midLat) * fitScale;

  let gridHTML = "";
  const latSteps = 4;
  for (let i = 0; i <= latSteps; i++) {
    const lVal = minLat + (i / latSteps) * (maxLat - minLat);
    const y = getY(lVal);
    gridHTML += `<line x1="${padLeft}" y1="${y}" x2="${padLeft + mapW}" y2="${y}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3" />`;
    gridHTML += `<text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="9px" font-family="'Times New Roman', serif" fill="#64748b">${lVal.toFixed(2)}°N</text>`;
  }

  const lngSteps = 4;
  for (let i = 0; i <= lngSteps; i++) {
    const lgVal = minLng + (i / lngSteps) * (maxLng - minLng);
    const x = getX(lgVal);
    gridHTML += `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + mapH}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3" />`;
    gridHTML += `<text x="${x}" y="${padTop + mapH + 16}" text-anchor="middle" font-size="9px" font-family="'Times New Roman', serif" fill="#64748b">${lgVal.toFixed(2)}°E</text>`;
  }

  let pointsHTML = "";
  processedPoints.forEach((pt) => {
    const cx = getX(pt.lng);
    const cy = getY(pt.lat);
    pointsHTML += `
            <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.5" fill="${pt.color}" fill-opacity="0.85" stroke="#ffffff" stroke-width="1.2" />
          `;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: 'Times New Roman', serif;">
          <text x="${width / 2}" y="25" text-anchor="middle" font-size="13.5px" font-weight="bold" fill="#1e3a8a">GIS Spatial Distribution Map of Monsoon Hydrochemical Impact - ${paramName}</text>
          
          <rect x="${padLeft}" y="${padTop}" width="${mapW}" height="${mapH}" fill="#f8fafc" stroke="#64748b" stroke-width="1.5" />
          ${gridHTML}
          ${pointsHTML}

          <!-- Compass Rose -->
          <g transform="translate(${padLeft + mapW - 35}, ${padTop + 35})">
            <circle cx="0" cy="0" r="16" fill="#ffffff" stroke="#475569" stroke-width="1" />
            <polygon points="0,-14 4,-2 0,-5" fill="#dc2626" />
            <polygon points="0,-14 -4,-2 0,-5" fill="#1e293b" />
            <polygon points="0,14 4,2 0,5" fill="#94a3b8" />
            <polygon points="0,14 -4,2 0,5" fill="#475569" />
            <text x="0" y="-18" text-anchor="middle" font-size="9px" font-weight="bold" fill="#1e293b">N</text>
          </g>

          <!-- Scale Bar -->
          <g transform="translate(${padLeft + 15}, ${padTop + mapH - 25})">
            <rect x="0" y="0" width="100" height="18" fill="#ffffff" fill-opacity="0.9" stroke="#cbd5e1" rx="3" />
            <line x1="10" y1="12" x2="90" y2="12" stroke="#1e293b" stroke-width="2" />
            <line x1="10" y1="8" x2="10" y2="14" stroke="#1e293b" stroke-width="2" />
            <line x1="90" y1="8" x2="90" y2="14" stroke="#1e293b" stroke-width="2" />
            <text x="50" y="7" text-anchor="middle" font-size="8.5px" font-weight="bold" fill="#1e293b">GIS Spatial Bounds</text>
          </g>

          <!-- Legend -->
          <g transform="translate(${padLeft + mapW + 12}, ${padTop + 10})">
            <rect x="0" y="0" width="160" height="230" fill="#f8fafc" stroke="#cbd5e1" rx="6" />
            <text x="10" y="20" font-size="11px" font-weight="bold" fill="#1e293b">GIS Spatial Map Key</text>

            <circle cx="18" cy="42" r="5" fill="#16a34a" />
            <text x="32" y="45" font-size="9.5px" font-weight="bold" fill="#16a34a">Improved (&gt;20% ↓)</text>
            <text x="32" y="56" font-size="8.5px" fill="#64748b">(Concentration Decreased)</text>

            <circle cx="18" cy="80" r="5" fill="#dc2626" />
            <text x="32" y="83" font-size="9.5px" font-weight="bold" fill="#dc2626">Deteriorated (&gt;20% ↑)</text>
            <text x="32" y="94" font-size="8.5px" fill="#64748b">(Concentration Increased)</text>

            <circle cx="18" cy="118" r="5" fill="#64748b" />
            <text x="32" y="121" font-size="9.5px" fill="#475569">Unchanged (±20%)</text>
            <text x="32" y="132" font-size="8.5px" fill="#64748b">(Stable Concentration)</text>

            <circle cx="18" cy="156" r="5" fill="#e11d48" />
            <text x="32" y="159" font-size="9.5px" font-weight="bold" fill="#e11d48">Safe → Unsafe Shift</text>
            <text x="32" y="170" font-size="8.5px" fill="#64748b">(Exceeded Permissible Limit)</text>

            <circle cx="18" cy="194" r="5" fill="#0d9488" />
            <text x="32" y="197" font-size="9.5px" font-weight="bold" fill="#0d9488">Unsafe → Safe Shift</text>
            <text x="32" y="208" font-size="8.5px" fill="#64748b">(Returned to Safe Limit)</text>
          </g>
        </svg>`;
};
