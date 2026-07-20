import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_toggles = '''                <div className="flex gap-2">
                  <label className="flex-1 flex items-center gap-1.5 cursor-pointer bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={isIsometric}
                      onChange={(e) => setIsIsometric(e.target.checked)}
                      className="rounded text-indigo-600 w-3.5 h-3.5"
                    />
                    <span className="text-[10px] font-extrabold text-indigo-900 tracking-tight">3D Tilt</span>
                  </label>
                  <label className="flex-1 flex items-center gap-1.5 cursor-pointer bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={isCinematic}
                      onChange={(e) => { setIsCinematic(e.target.checked); if(e.target.checked) setIsIsometric(true); }}
                      className="rounded text-indigo-600 w-3.5 h-3.5"
                    />
                    <span className="text-[10px] font-extrabold text-indigo-900 tracking-tight">Cinematic</span>
                  </label>
                  <button'''

good_toggles = '''                <div className="flex gap-2">
                  <button'''

code = code.replace(bad_toggles, good_toggles)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
