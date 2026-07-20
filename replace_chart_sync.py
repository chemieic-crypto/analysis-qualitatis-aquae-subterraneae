import re

with open('src/components/AdvancedAnalysisView.tsx', 'r') as f:
    code = f.read()

old_chart_config = r'''      const seriesFormatted = frequencyDistributionData\.series\.map\(s => \(\{
        name: "Samples Count",
        data: s\.data,
        type: "column" as const,
        colorByPoint: true,
        colors: seriesColors
      \}\)\);

      Highcharts\.chart\(freqChartRef\.current, \{
        chart: \{
          type: "column",
          options3d: \{
            enabled: true,
            alpha: 15,
            beta: 15,
            depth: 60,
            viewDistance: 25
          \},
          backgroundColor: "rgba\(255, 255, 255, 0\)",
          style: \{ fontFamily: "Inter, sans-serif" \},
          height: 420
        \},
        title: \{
          text: `Frequency Distribution of Parameter`,
          align: "left",
          style: \{ fontSize: "14px", fontWeight: "bold", color: "#1e293b" \}
        \},
        subtitle: \{
          text: "",
          align: "left",
          style: \{ fontSize: "11px", color: "#64748b" \}
        \},
        xAxis: \{
          categories: frequencyDistributionData\.categories,
          crosshair: true,
          labels: \{ style: \{ fontSize: "10px", color: "#475569", fontWeight: "bold" \} \}
        \},
        yAxis: \{
          min: 0,
          title: \{
            text: "Frequency Count",
            style: \{ fontSize: "11px", fontWeight: "bold" \}
          \},'''

new_chart_config = '''      const isSeasonal = frequencyDistributionData.isSeasonal;
      const seriesFormatted = frequencyDistributionData.series.map(s => ({
        name: s.name,
        data: s.data,
        type: "column" as const,
        colorByPoint: !isSeasonal,
        colors: !isSeasonal ? seriesColors : undefined,
        color: s.color
      }));

      // Gather season and year for subtitle
      const uniqueYears = Array.from(new Set(analyzedData.map(r => String(r[activeHeaders.year || "Year"] || "")).filter(Boolean)));
      const uniqueSeasons = Array.from(new Set(analyzedData.map(r => String(r[activeHeaders.season || "Season"] || "")).filter(Boolean)));
      
      let subtitleParts = [];
      if (uniqueSeasons.length > 0) subtitleParts.push(uniqueSeasons.join(", "));
      if (uniqueYears.length > 0) subtitleParts.push(uniqueYears.join(", "));
      const subTitleStr = subtitleParts.join(" | ");

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
          text: `Frequency Distribution of ${label}`,
          align: "left",
          style: { fontSize: "14px", fontWeight: "bold", color: "#1e293b" }
        },
        subtitle: {
          text: subTitleStr || "",
          align: "left",
          style: { fontSize: "11px", color: "#64748b" }
        },
        xAxis: {
          categories: frequencyDistributionData.categories,
          crosshair: true,
          labels: { style: { fontSize: "10px", color: "#475569", fontWeight: "bold" } },
          title: {
            text: `${label} (${unit})`,
            style: { fontSize: "12px", fontWeight: "bold", color: "#475569", margin: 10 }
          }
        },
        yAxis: {
          min: 0,
          title: {
            text: "Frequency (No. of Locations)",
            style: { fontSize: "12px", fontWeight: "bold", color: "#475569", margin: 10 }
          },'''

match = re.search(old_chart_config, code)
if match:
    code = code[:match.start()] + new_chart_config + code[match.end():]
    with open('src/components/AdvancedAnalysisView.tsx', 'w') as f:
        f.write(code)
    print("SUCCESS")
else:
    print("NO MATCH")
