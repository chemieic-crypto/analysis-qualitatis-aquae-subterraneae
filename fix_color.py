import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad = r'    if \(metricType === "exceedance" && pct === 0\) return "#38bdf8"; // Special 0% category \(light sky blue\)\n'
code = re.sub(bad, '', code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
