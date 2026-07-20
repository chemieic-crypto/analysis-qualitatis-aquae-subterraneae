import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Replace getExceedanceValue or similar usages
code = code.replace(
    'const val = g.pctExceedance;',
    'const val = metricType === "average" ? g.avgValue : metricType === "count" ? g.failCount : g.pctExceedance;'
)

code = code.replace(
    'const finalFillColor = matchedGroup \n            ? getColorForExceedance(matchedGroup.pctExceedance)',
    'const finalFillColor = matchedGroup \n            ? getColorForExceedance(metricType === "average" ? matchedGroup.avgValue : metricType === "count" ? matchedGroup.failCount : matchedGroup.pctExceedance)'
)

code = code.replace(
    'const colorHex = getColorForExceedance(g.pctExceedance);',
    'const colorHex = getColorForExceedance(metricType === "average" ? g.avgValue : metricType === "count" ? g.failCount : g.pctExceedance);'
)

# Update the tooltip to show metricType
tooltip_pattern = r'backgroundColor: getColorForExceedance\(hoveredGroup\.pctExceedance\) \+ "15",\s*color: getColorForExceedance\(hoveredGroup\.pctExceedance\),\s*\}\}\s*>\s*\{hoveredGroup\.pctExceedance\.toFixed\(1\)\}%'
replacement = '''backgroundColor: getColorForExceedance(metricType === "average" ? hoveredGroup.avgValue : metricType === "count" ? hoveredGroup.failCount : hoveredGroup.pctExceedance) + "15",
                      color: getColorForExceedance(metricType === "average" ? hoveredGroup.avgValue : metricType === "count" ? hoveredGroup.failCount : hoveredGroup.pctExceedance),
                    }}
                  >
                    {metricType === "average" ? hoveredGroup.avgValue.toFixed(2) : metricType === "count" ? hoveredGroup.failCount : hoveredGroup.pctExceedance.toFixed(1) + "%"}'''
code = re.sub(tooltip_pattern, replacement, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
