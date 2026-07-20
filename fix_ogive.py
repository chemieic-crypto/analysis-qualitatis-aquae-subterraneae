import re

with open('src/components/DetailedView.tsx', 'r') as f:
    code = f.read()

# Replace percentile definitions
old_percentiles = r'''    const p50 = getPercentile\(allVals, 50\);
    const p90 = getPercentile\(allVals, 90\);
    const p95 = getPercentile\(allVals, 95\);'''

new_percentiles = '''    const p50 = getPercentile(allVals, 50);
    const p75 = getPercentile(allVals, 75);
    const p90 = getPercentile(allVals, 90);
    const p95 = getPercentile(allVals, 95);'''

code = re.sub(old_percentiles, new_percentiles, code)

# Replace plotLines
old_plotlines = r'''        plotLines: \[
          \{
            color: "#2563eb",
            dashStyle: "Dash",
            width: 1\.5,
            value: p50,
            zIndex: 4,
            label: \{
              text: `Median \(P50\) = \$\{p50\.toFixed\(1\)\}`,
              verticalAlign: "top",
              align: "left",
              rotation: 270,
              y: 8,
              x: 10,
              style: \{ color: "#2563eb", fontWeight: "bold", fontSize: "9px", fontFamily: chartFontFamily \}
            \}
          \},
          \{
            color: "#f97316",
            dashStyle: "Dash",
            width: 1\.5,
            value: p90,
            zIndex: 4,
            label: \{
              text: `P90 = \$\{p90\.toFixed\(1\)\}`,
              verticalAlign: "top",
              align: "left",
              rotation: 270,
              y: 8,
              x: 10,
              style: \{ color: "#f97316", fontWeight: "bold", fontSize: "9px", fontFamily: chartFontFamily \}
            \}
          \},
          \{
            color: "#dc2626",
            dashStyle: "Dash",
            width: 1\.5,
            value: p95,
            zIndex: 4,
            label: \{
              text: `P95 = \$\{p95\.toFixed\(1\)\}`,
              verticalAlign: "top",
              align: "left",
              rotation: 270,
              y: 8,
              x: 10,
              style: \{ color: "#dc2626", fontWeight: "bold", fontSize: "9px", fontFamily: chartFontFamily \}
            \}
          \}
        \]'''

new_plotlines = '''        plotLines: [
          {
            color: "#2563eb",
            dashStyle: "Dash",
            width: 1.5,
            value: p50,
            zIndex: 4,
            label: {
              text: `Median (P50) = ${p50.toFixed(1)}`,
              verticalAlign: "top",
              align: "left",
              rotation: 0,
              y: 15,
              x: 5,
              style: { color: "#2563eb", fontWeight: "bold", fontSize: "10px", fontFamily: chartFontFamily, backgroundColor: "rgba(255,255,255,0.7)" }
            }
          },
          {
            color: "#8b5cf6",
            dashStyle: "Dash",
            width: 1.5,
            value: p75,
            zIndex: 4,
            label: {
              text: `P75 = ${p75.toFixed(1)}`,
              verticalAlign: "top",
              align: "left",
              rotation: 0,
              y: 30,
              x: 5,
              style: { color: "#8b5cf6", fontWeight: "bold", fontSize: "10px", fontFamily: chartFontFamily, backgroundColor: "rgba(255,255,255,0.7)" }
            }
          },
          {
            color: "#f97316",
            dashStyle: "Dash",
            width: 1.5,
            value: p90,
            zIndex: 4,
            label: {
              text: `P90 = ${p90.toFixed(1)}`,
              verticalAlign: "top",
              align: "left",
              rotation: 0,
              y: 45,
              x: 5,
              style: { color: "#f97316", fontWeight: "bold", fontSize: "10px", fontFamily: chartFontFamily, backgroundColor: "rgba(255,255,255,0.7)" }
            }
          },
          {
            color: "#dc2626",
            dashStyle: "Dash",
            width: 1.5,
            value: p95,
            zIndex: 4,
            label: {
              text: `P95 = ${p95.toFixed(1)}`,
              verticalAlign: "top",
              align: "left",
              rotation: 0,
              y: 60,
              x: 5,
              style: { color: "#dc2626", fontWeight: "bold", fontSize: "10px", fontFamily: chartFontFamily, backgroundColor: "rgba(255,255,255,0.7)" }
            }
          }
        ]'''

code = re.sub(old_plotlines, new_plotlines, code)

with open('src/components/DetailedView.tsx', 'w') as f:
    f.write(code)
