import re

with open('src/components/AdvancedAnalysisView.tsx', 'r') as f:
    code = f.read()

bad_tabs = r'''          \{\/\* SECTION 3: SUB NAVIGATION TABS BAR \*\/\}
          <div className="flex items-center justify-start border-b border-slate-250 gap-2 pb-px select-none">[\s\S]*?<\/button>
          <\/div>'''

good_tabs = '''          {/* SECTION 3: ANALYSIS SELECTION DROPDOWN */}
          <div className="flex items-center justify-start border-b border-slate-250 pb-4 select-none">
            <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm w-full max-w-lg">
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest whitespace-nowrap pl-2">Analysis View:</span>
              <select
                value={activeSubTab}
                onChange={(e) => setActiveSubTab(e.target.value as any)}
                className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 font-bold cursor-pointer"
              >
                <option value="frequency">📊 Frequency Distribution</option>
                <option value="depth" disabled={!depthColumn}>📉 Depth to Concentration Chart {!depthColumn ? "(Disabled: Map Depth Col)" : ""}</option>
                <option value="aquifer">🗄️ Principal Aquifer Table</option>
                <option value="aquiferTapped">🔀 Aquifer Tapped Table</option>
                <option value="stageExtraction">📈 Stage of Extraction Table</option>
                <option value="source">🛢️ Source Table</option>
                <option value="biplots">🔄 Bi-Plots</option>
                <option value="correlation">🧬 Correlation Analysis</option>
              </select>
            </div>
          </div>'''

code = re.sub(bad_tabs, good_tabs, code)

with open('src/components/AdvancedAnalysisView.tsx', 'w') as f:
    f.write(code)
