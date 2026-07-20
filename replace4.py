import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Fix getColorForExceedance 0% logic
code = code.replace(
    'if (pct === 0) return "#38bdf8";',
    'if (metricType === "exceedance" && pct === 0) return "#38bdf8";'
)

# Fix tableData
table_data_orig = '''  // Pre-calculate class statistics for the classification table
  const tableData = useMemo(() => {
    // 1. Special 0% category
    const zeroMatched = groupList.filter((g) => g.pctExceedance === 0);
    const zeroRow = {
      slNo: 0,
      rangeText: "0%",
      label: "Nil Exceedance",
      color: "#38bdf8",
      count: zeroMatched.length,
      items: zeroMatched.map(m => ({
        name: m.name,
        pct: m.pctExceedance,
        fail: m.failCount,
        total: m.totalSamples,
      })),
    };

    // 2. The standard customizable classes
    const classes = activeClasses;
    const standardRows = classes.map((cls, idx) => {
      const prevLimit = idx === 0 ? 0 : classes[idx - 1].limit;
      
      // Match groups belonging to this range (excluding 0)
      const matched = groupList.filter((g) => {
        const val = metricType === "average" ? g.avgValue : metricType === "count" ? g.failCount : g.pctExceedance;
        if (val === 0) return false; // Handled by zeroRow
        if (idx === 0) {
          return val > 0 && val <= cls.limit;
        } else {
          return val > prevLimit && val <= cls.limit;
        }
      });'''

table_data_new = '''  // Pre-calculate class statistics for the classification table
  const tableData = useMemo(() => {
    let rows = [];
    
    // 1. Special 0% category (ONLY FOR EXCEEDANCE)
    if (metricType === "exceedance") {
      const zeroMatched = groupList.filter((g) => g.pctExceedance === 0);
      rows.push({
        slNo: 0,
        rangeText: "0%",
        label: "Nil Exceedance",
        color: "#38bdf8",
        count: zeroMatched.length,
        items: zeroMatched.map(m => ({
          name: m.name,
          pct: m.pctExceedance,
          fail: m.failCount,
          total: m.totalSamples,
        })),
      });
    }

    // 2. The standard customizable classes
    const classes = activeClasses;
    const standardRows = classes.map((cls, idx) => {
      const prevLimit = idx === 0 ? 0 : classes[idx - 1].limit;
      
      // Match groups belonging to this range
      const matched = groupList.filter((g) => {
        const val = metricType === "average" ? g.avgValue : metricType === "count" ? g.failCount : g.pctExceedance;
        
        if (metricType === "exceedance") {
          if (val === 0) return false; // Handled by zeroRow
          if (idx === 0) return val > 0 && val <= cls.limit;
        } else {
          // For average or count, 0 is a valid number inside standard classes
          if (idx === 0) return val <= cls.limit;
        }
        return val > prevLimit && val <= cls.limit;
      });'''

code = code.replace(table_data_orig, table_data_new)

# And replace the return array of tableData
code = code.replace(
    'return [zeroRow, ...standardRows];\n  }, [groupList, activeClasses]);',
    'return [...rows, ...standardRows];\n  }, [groupList, activeClasses, metricType]);'
)

# Replace table body and header
table_orig = '''                  <tr className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 border-b border-slate-100 pb-2">
                    <th className="pb-2 px-1 w-16">Range</th>
                    <th className="pb-2 px-1 w-20">Legend</th>
                    <th className="pb-2 px-1 text-center w-10">Qty</th>
                    <th className="pb-2 px-1">{reportingLevel === "State" ? "States" : "Districts"}</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {tableData.map((row) => (
                    <tr key={row.slNo} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 px-1 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {row.rangeText}
                      </td>
                      <td className="py-2 px-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="text-[10px] truncate max-w-[110px]" title={row.label}>
                            {row.label}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-1 text-center">
                        <span className="font-semibold text-[10px] text-slate-900">
                          {row.count}
                        </span>
                      </td>
                      <td className="py-2 px-1">
                        {row.items.length > 0 ? (
                          <div className="text-[10px] text-slate-500 font-medium leading-relaxed max-h-[80px] overflow-y-auto pr-1">
                            {row.items.map(i => nameOverrides[i.name] || i.name).join(", ")}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[10px]">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>'''

table_new = '''                  <tr className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 border-b border-slate-100 pb-2">
                    <th className="pb-2 px-1 w-10">Sl. No.</th>
                    <th className="pb-2 px-1 w-16">Ranges</th>
                    <th className="pb-2 px-1 w-20">Colour</th>
                    <th className="pb-2 px-1 text-center w-16">No. {reportingLevel === "State" ? "State/UT" : "Districts"}</th>
                    <th className="pb-2 px-1">Name(s) of {reportingLevel === "State" ? "State/UT" : "Districts"}</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {tableData.map((row, i) => (
                    <tr key={row.slNo} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 px-1 font-mono font-medium text-slate-900 text-center">
                        {i + 1}
                      </td>
                      <td className="py-2 px-1 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {row.rangeText}
                      </td>
                      <td className="py-2 px-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="text-[10px] truncate max-w-[110px]" title={row.label}>
                            {row.label}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-1 text-center">
                        <span className="font-semibold text-[10px] text-slate-900">
                          {row.count}
                        </span>
                      </td>
                      <td className="py-2 px-1">
                        {row.items.length > 0 ? (
                          <div className="text-[10px] text-slate-500 font-medium leading-relaxed max-h-[80px] overflow-y-auto pr-1">
                            {row.items.map(i => {
                               let n = nameOverrides[i.name] || i.name;
                               if (useShortNames) n = getShortName(n, reportingLevel, useShortNames);
                               return n;
                            }).join(", ")}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[10px]">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>'''

code = code.replace(table_orig, table_new)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
