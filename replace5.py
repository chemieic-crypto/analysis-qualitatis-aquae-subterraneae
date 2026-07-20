import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Add import
code = code.replace(
    'import { ShapefileLayer } from "../types";',
    'import { ShapefileLayer } from "../types";\nimport { getShortName } from "../utils/stateAbbreviations";'
)

# Add Metric Type and Short Names to UI
ui_insertion_point = r'(\s*)\{/\* Choropleth Mode Selector \*/\}'
ui_additions = r'''\1{/* Metric Type & Short Names */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-2">
            <label className="text-[9px] font-black uppercase text-indigo-950 tracking-wider block">
              Analysis Metric
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-200/50 p-0.5 rounded-lg">
              <button
                onClick={() => setMetricType("exceedance")}
                className={`py-1 rounded-md text-[9px] font-bold transition-all ${
                  metricType === "exceedance" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                % Exceedance
              </button>
              <button
                onClick={() => setMetricType("average")}
                className={`py-1 rounded-md text-[9px] font-bold transition-all ${
                  metricType === "average" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Average Val
              </button>
              <button
                onClick={() => setMetricType("count")}
                className={`py-1 rounded-md text-[9px] font-bold transition-all ${
                  metricType === "count" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Total Exceeded
              </button>
            </div>
            
            <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-100/50 transition-all mt-2">
              <input
                type="checkbox"
                checked={useShortNames}
                onChange={(e) => setUseShortNames(e.target.checked)}
                className="text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 w-3 h-3"
              />
              <span className="text-[10px] font-bold text-slate-800">Use Short Names (State/UT/Dist)</span>
            </label>
          </div>

\1{/* Choropleth Mode Selector */}'''

code = re.sub(ui_insertion_point, ui_additions, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
