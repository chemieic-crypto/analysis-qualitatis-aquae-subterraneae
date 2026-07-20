with open('src/components/AdvancedAnalysisView.tsx', 'r') as f:
    lines = f.readlines()

start = -1
end = -1
for i, l in enumerate(lines):
    if "const seriesFormatted = frequencyDistributionData.series.map(s => ({" in l:
        start = i
    if start != -1 and "          title: { text: \"Frequency" in l:
        end = i
        break

if start != -1 and end != -1:
    new_code = '''      const isSeasonal = frequencyDistributionData.isSeasonal;
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
          title: { text: "Frequency (No. of Locations)", style: { fontSize: "12px", color: "#475569", fontWeight: "bold", margin: 10 } },
'''
    new_lines = lines[:start] + [new_code] + lines[end+1:]
    with open('src/components/AdvancedAnalysisView.tsx', 'w') as f:
        f.writelines(new_lines)
    print("SUCCESS")
else:
    print(f"NO MATCH start={start} end={end}")
