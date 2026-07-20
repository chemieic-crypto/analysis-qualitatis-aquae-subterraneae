import re

with open('src/components/AdvancedAnalysisView.tsx', 'r') as f:
    code = f.read()

match = re.search(r'  const frequencyDistributionData = useMemo\(\(\) => \{[\s\S]*?  \}, \[analyzedData, selectedParam, freqBinMode, customRangesLabels, activeParamConfig\]\);', code)
if match:
    new_freq_data = '''  const frequencyDistributionData = useMemo(() => {
    if (!analyzedData || analyzedData.length === 0) return { categories: [], series: [], percentages: [], total: 0, isTruncated: false, totalGroupsCount: 0, isSeasonal: false };

    const samples: {value: number, season: string}[] = [];
    const seasonCol = activeHeaders.season;
    
    let hasPre = false;
    let hasPost = false;

    analyzedData.forEach(row => {
      const v = getParamNumericValue(row, selectedParam);
      if (v !== null) {
        const s = seasonCol ? String(row[seasonCol] || "").toLowerCase() : "";
        samples.push({ value: v, season: s });
        if (s.includes("pre") || s.includes("before")) hasPre = true;
        if (s.includes("post") || s.includes("after")) hasPost = true;
      }
    });

    if (samples.length === 0) return { categories: [], series: [], percentages: [], total: 0, isTruncated: false, totalGroupsCount: 0, isSeasonal: false };

    const b1 = activeParamConfig.b1;
    const b2 = activeParamConfig.b2;
    const unit = activeParamConfig.unit;
    const totalCount = samples.length;
    
    const isSeasonal = hasPre && hasPost;

    let categories: string[] = [];
    
    if (freqBinMode === "compliance") {
      if (selectedParam === "pH") {
        categories = ["Acidic (< 6.5)", "Acceptable (6.5 - 8.5)", "Alkaline (> 8.5)"];
      } else if (b1 === b2) {
        categories = [`Desirable (≤ ${b1} ${unit})`, `Exceeding (> ${b1} ${unit})`];
      } else {
        categories = [`Desirable (≤ ${b1} ${unit})`, `Permissible (${b1} - ${b2} ${unit})`, `Exceeding (> ${b2} ${unit})`];
      }
    } else {
      categories = customRangesLabels.map(r => `${r.label} ${unit}`.trim());
    }

    const getBinIdx = (value: number) => {
      if (freqBinMode === "compliance") {
        if (selectedParam === "pH") {
          if (value < 6.5) return 0;
          else if (value <= 8.5) return 1;
          else return 2;
        } else if (b1 === b2) {
          if (value <= b1) return 0;
          else return 1;
        } else {
          if (value <= b1) return 0;
          else if (value <= b2) return 1;
          else return 2;
        }
      } else {
        return customRangesLabels.findIndex(rng => rng.check(value));
      }
    };

    const series = [];
    const overallCounts = new Array(categories.length).fill(0);

    if (isSeasonal) {
      const preCounts = new Array(categories.length).fill(0);
      const postCounts = new Array(categories.length).fill(0);
      const otherCounts = new Array(categories.length).fill(0);

      samples.forEach(({ value, season }) => {
        const binIdx = getBinIdx(value);
        if (binIdx !== -1) {
          overallCounts[binIdx]++;
          if (season.includes("pre") || season.includes("before")) {
            preCounts[binIdx]++;
          } else if (season.includes("post") || season.includes("after")) {
            postCounts[binIdx]++;
          } else {
            otherCounts[binIdx]++;
          }
        }
      });

      series.push({ name: "Pre-Monsoon", data: preCounts, color: "#f59e0b" });
      series.push({ name: "Post-Monsoon", data: postCounts, color: "#3b82f6" });
      if (otherCounts.some(c => c > 0)) {
         series.push({ name: "Other Seasons", data: otherCounts, color: "#94a3b8" });
      }
    } else {
      samples.forEach(({ value }) => {
        const binIdx = getBinIdx(value);
        if (binIdx !== -1) overallCounts[binIdx]++;
      });
      series.push({ name: "Frequency Count", data: overallCounts });
    }

    const percentages = overallCounts.map(cnt => (cnt / totalCount) * 100);

    return { categories, series, percentages, total: totalCount, isTruncated: false, totalGroupsCount: 1, isSeasonal };
  }, [analyzedData, selectedParam, freqBinMode, customRangesLabels, activeParamConfig, activeHeaders]);'''
    code = code[:match.start()] + new_freq_data + code[match.end():]
    with open('src/components/AdvancedAnalysisView.tsx', 'w') as f:
        f.write(code)
    print("SUCCESS")
else:
    print("NO MATCH")
