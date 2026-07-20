import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Remove metricType state
code = re.sub(r'  const \[metricType, setMetricType\] = useState<"exceedance" \| "average" \| "count">.*', '', code)

# Replace metricType logic
code = re.sub(r'if \(metricType === "exceedance"\) \{', 'if (true) {', code)
code = re.sub(r'\} else if \(metricType === "average"\) \{[\s\S]*?\} else if \(metricType === "count"\) \{[\s\S]*?\}', '}', code)

# Remove the metricType UI
metric_ui = r'''            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-widest flex items-center gap-1 mt-4 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              Analysis Metric
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-200/50 p-0.5 rounded-lg">
              <button
                onClick=\{\(\) => setMetricType\("exceedance"\)\}
                className=\{`py-1 rounded-md text-\[9px\] font-bold transition-all \$\{
                  metricType === "exceedance" \? "bg-white text-indigo-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                \}`\}
              >
                % Exceedance
              </button>
              <button
                onClick=\{\(\) => setMetricType\("average"\)\}
                className=\{`py-1 rounded-md text-\[9px\] font-bold transition-all \$\{
                  metricType === "average" \? "bg-white text-indigo-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                \}`\}
              >
                Average Val
              </button>
              <button
                onClick=\{\(\) => setMetricType\("count"\)\}
                className=\{`py-1 rounded-md text-\[9px\] font-bold transition-all \$\{
                  metricType === "count" \? "bg-white text-indigo-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                \}`\}
              >
                Affected Regions
              </button>
            </div>'''
code = re.sub(metric_ui, '', code)

# Replace inline metricType conditionals
code = re.sub(r'metricType === "average" \? matchedGroup\.avgValue : metricType === "count" \? matchedGroup\.failCount : matchedGroup\.pctExceedance', 'matchedGroup.pctExceedance', code)
code = re.sub(r'metricType === "average" \? g\.avgValue : metricType === "count" \? g\.failCount : g\.pctExceedance', 'g.pctExceedance', code)
code = re.sub(r'metricType === "average" \? hoveredGroup\.avgValue : metricType === "count" \? hoveredGroup\.failCount : hoveredGroup\.pctExceedance', 'hoveredGroup.pctExceedance', code)
code = re.sub(r'metricType === "average" \? "Average Value Legend" : metricType === "count" \? "Affected Regions Legend" : "% Exceedance Legend"', '"% Exceedance Legend"', code)
code = re.sub(r'metricType === "average" \? "Average Value:" : metricType === "count" \? "Affected Sub-Regions:" : "Exceedance Percentage:"', '"Exceedance Percentage:"', code)
code = re.sub(r'metricType === "average" \? hoveredGroup\.avgValue\.toFixed\(2\) : metricType === "count" \? hoveredGroup\.failCount : hoveredGroup\.pctExceedance\.toFixed\(1\) \+ "%"', 'hoveredGroup.pctExceedance.toFixed(1) + "%"', code)

# Remove dependency from useEffect
code = re.sub(r', metricType', '', code)
code = re.sub(r'metricType, ', '', code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
