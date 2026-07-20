import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Replace Isometric and Cinematic toggles UI
pattern = r'''\s*<label className="flex items-center gap-2 cursor-pointer p-1\.5 rounded-lg hover:bg-slate-100/50 transition-all border border-transparent hover:border-slate-200/50">\s*<input\s*type="checkbox"\s*checked=\{isIsometric\}\s*onChange=\{\(e\) => setIsIsometric\(e\.target\.checked\)\}\s*className="text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 w-3\.5 h-3\.5"\s*/>\s*<span className="text-\[11px\] font-bold text-slate-800">Isometric 3D Tilt</span>\s*</label>\s*<label className="flex items-center gap-2 cursor-pointer p-1\.5 rounded-lg hover:bg-slate-100/50 transition-all border border-transparent hover:border-slate-200/50">\s*<input\s*type="checkbox"\s*checked=\{isCinematic\}\s*onChange=\{\(e\) => \{\s*setIsCinematic\(e\.target\.checked\);\s*if \(e\.target\.checked\) setIsIsometric\(true\);\s*\}\}\s*className="text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 w-3\.5 h-3\.5"\s*/>\s*<div className="flex flex-col">\s*<span className="text-\[11px\] font-bold text-slate-800">Cinematic Orbit</span>\s*<span className="text-\[9px\] text-slate-400">Auto-rotates the map in 3D</span>\s*</div>\s*</label>'''

code = re.sub(pattern, '', code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
