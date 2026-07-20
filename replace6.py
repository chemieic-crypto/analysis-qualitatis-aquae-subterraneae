import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Fix the Legend Title text
code = code.replace(
    'ctx.fillText("Exceedance Legend", lX + 12, lY + 20);',
    'ctx.fillText(metricType === "average" ? "Average Value Legend" : metricType === "count" ? "Total Exceeded Legend" : "% Exceedance Legend", lX + 12, lY + 20);'
)

# Fix the Legend class list text
legend_classes_orig = '''    const activeLegendClasses = [
      { color: "#38bdf8", label: "0%" },
      ...activeClasses.map((cls, idx) => {
        const prevLimit = idx === 0 ? 0 : activeClasses[idx - 1].limit;
        const rangeText = idx === 0 ? `>0% \u2013 ${cls.limit}%` : `>${prevLimit}% \u2013 ${cls.limit}%`;
        return { color: cls.color, label: rangeText };
      })
    ];'''

legend_classes_new = '''    const activeLegendClasses = [];
    if (metricType === "exceedance") activeLegendClasses.push({ color: "#38bdf8", label: "0%" });
    
    activeClasses.forEach((cls, idx) => {
      const prevLimit = idx === 0 ? 0 : activeClasses[idx - 1].limit;
      let rangeText = "";
      if (metricType === "exceedance") {
        rangeText = idx === 0 ? `>0% \u2013 ${cls.limit}%` : `>${prevLimit}% \u2013 ${cls.limit}%`;
      } else {
        rangeText = idx === 0 ? `\u2264 ${cls.limit}` : `>${prevLimit} \u2013 ${cls.limit}`;
      }
      activeLegendClasses.push({ color: cls.color, label: cls.label || rangeText });
    });'''

code = code.replace(legend_classes_orig, legend_classes_new)

# Also fix the rangeText in tableData to match this logic
table_data_orig_2 = '''      // Match groups belonging to this range
      const matched = groupList.filter((g) => {'''

table_data_new_2 = '''      let rangeText = "";
      if (metricType === "exceedance") {
        rangeText = idx === 0 ? `>0% \u2013 ${cls.limit}%` : `>${prevLimit}% \u2013 ${cls.limit}%`;
      } else {
        rangeText = idx === 0 ? `\u2264 ${cls.limit}` : `>${prevLimit} \u2013 ${cls.limit}`;
      }
      
      // Match groups belonging to this range
      const matched = groupList.filter((g) => {'''
      
code = code.replace(table_data_orig_2, table_data_new_2)

# Fix row mapping for standardRows
code = code.replace(
    'rangeText: idx === 0 ? `>0% – ${cls.limit}%` : `>${prevLimit}% – ${cls.limit}%`,',
    'rangeText,'
)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
