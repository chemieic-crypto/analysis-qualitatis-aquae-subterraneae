import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_html = r'''          \{\/\* Metric Type & Short Names \*\/\}
          <div className="bg-slate-50\/50 p-2\.5 rounded-xl border border-slate-200\/50 space-y-2">
            <label className="text-\[9px\] font-black uppercase text-indigo-950 tracking-wider block">
                Affected Regions
              </button>
            </div>'''
new_html = '''          {/* Options */}
          <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 space-y-2">'''
code = re.sub(bad_html, new_html, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
