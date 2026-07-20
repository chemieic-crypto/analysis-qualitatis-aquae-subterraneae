import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Insert useEffect after groupList is defined (around line 580)
# We can just put it after metricType definition or groupListPost
insertion_point = r'  const groupListPost = useMemo\(\(\) => \{\n    return computeGroupList\(postDataSubset\);\n  \}, \[postDataSubset, headers, activeParam, activeConfig, headerMap, reportingLevel\]\);'

use_effect_code = '''
  useEffect(() => {
    if (metricType === "exceedance") {
      setChoroplethClasses([
        { limit: 5, color: "#22c55e", label: ">0% - 5%" },
        { limit: 10, color: "#eab308", label: ">5% - 10%" },
        { limit: 15, color: "#f97316", label: ">10% - 15%" },
        { limit: 25, color: "#ef4444", label: ">15% - 25%" },
        { limit: 100, color: "#a855f7", label: ">25%" }
      ]);
    } else if (metricType === "average") {
      let maxVal = Math.max(...groupList.map(g => g.avgValue));
      if (maxVal === -Infinity || isNaN(maxVal)) maxVal = activeConfig.b2 * 1.5 || 10;
      const step = parseFloat((maxVal / 5).toFixed(2));
      setChoroplethClasses([
        { limit: step, color: "#38bdf8", label: `\u2264 ${step}` },
        { limit: step * 2, color: "#22c55e", label: `> ${step} - ${step * 2}` },
        { limit: step * 3, color: "#eab308", label: `> ${step * 2} - ${step * 3}` },
        { limit: step * 4, color: "#f97316", label: `> ${step * 3} - ${step * 4}` },
        { limit: 999999, color: "#ef4444", label: `> ${step * 4}` }
      ]);
    } else if (metricType === "count") {
      let maxCount = Math.max(...groupList.map(g => g.failCount));
      if (maxCount === -Infinity || maxCount === 0) maxCount = 5;
      const step = Math.max(1, Math.ceil(maxCount / 4));
      setChoroplethClasses([
        { limit: 0, color: "#38bdf8", label: "0" },
        { limit: step, color: "#22c55e", label: `1 - ${step}` },
        { limit: step * 2, color: "#eab308", label: `> ${step} - ${step * 2}` },
        { limit: step * 3, color: "#f97316", label: `> ${step * 2} - ${step * 3}` },
        { limit: 999999, color: "#ef4444", label: `> ${step * 3}` }
      ]);
    }
  }, [metricType, activeParam]);'''

code = re.sub(insertion_point, insertion_point + use_effect_code, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
