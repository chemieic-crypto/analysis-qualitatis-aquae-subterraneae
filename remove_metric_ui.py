import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Just look for 'Analysis Metric' label and remove it and the next div
lines = code.split('\n')
new_lines = []
skip = 0
for line in lines:
    if 'Analysis Metric' in line:
        skip = 25
    if skip > 0:
        skip -= 1
        continue
    new_lines.append(line)

code = '\n'.join(new_lines)

# Also fix the `if (metricType === "exceedance")` if any
code = re.sub(r'if \(metricType === "exceedance"\) \{', 'if (true) {', code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
