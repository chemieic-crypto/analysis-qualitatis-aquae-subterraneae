import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# 1. Update getColorForExceedance
old_color_fn = r'''  const getColorForExceedance = \(pct: number\): string => \{
    if \(activeClasses && activeClasses\.length > 0\) \{
      const matched = activeClasses\.find\(c => pct <= c\.limit\);
      if \(matched\) return matched\.color;
      return activeClasses\[activeClasses\.length - 1\]\.color;
    \}'''
new_color_fn = '''  const getColorForExceedance = (pct: number): string => {
    if (pct === 0) return "#38bdf8"; // Nil Exceedance color
    if (activeClasses && activeClasses.length > 0) {
      const matched = activeClasses.find(c => pct <= c.limit);
      if (matched) return matched.color;
      return activeClasses[activeClasses.length - 1].color;
    }'''
code = re.sub(old_color_fn, new_color_fn, code)

# 2. Add Nil Exceedance to on-canvas legend
old_legend_classes = r'''    const activeLegendClasses = \[\];

    
    activeClasses\.forEach\(\(cls, idx\) => \{'''
new_legend_classes = '''    const activeLegendClasses: {color: string, label: string}[] = [];
    activeLegendClasses.push({ color: "#38bdf8", label: "Nil Exceedance (0%)" });
    
    activeClasses.forEach((cls, idx) => {'''
code = re.sub(old_legend_classes, new_legend_classes, code)

# 3. Increase legend height to accommodate extra item
# Look for lH calculation
code = re.sub(r'const lH = Math\.min\(\(activeClasses\.length \* 13\) \+ 45, height - 24\);', 
              r'const lH = Math.min(((activeClasses.length + 1) * 13) + 45, height - 24);', code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
