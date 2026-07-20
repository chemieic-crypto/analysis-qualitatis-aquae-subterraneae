import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_tooltip_label = '<span className="text-slate-500">Exceedance Percentage:</span>'
good_tooltip_label = '<span className="text-slate-500">{metricType === "average" ? "Average Value:" : metricType === "count" ? "Exceeded Samples:" : "Exceedance Percentage:"}</span>'

code = code.replace(bad_tooltip_label, good_tooltip_label)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
