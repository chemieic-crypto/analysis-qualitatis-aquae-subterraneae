import re
with open('src/App.tsx', 'r') as f:
    code = f.read()

# Add import
import_statement = 'import CalculatoriusView from "./components/CalculatoriusView";\nimport GisChoroplethMap from "./components/GisChoroplethMap";'
code = code.replace('import GisChoroplethMap from "./components/GisChoroplethMap";', import_statement)

# Add tab button
bad_tab = r'''              <button
                onClick=\{\(\) => setActiveTab\("gis"\)\}
                className=\{`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 \$\{'''

good_tab = '''              <button
                onClick={() => setActiveTab("calculatorius")}
                className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${
                  activeTab === "calculatorius"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                    : "bg-white text-slate-500 hover:bg-indigo-50 border border-slate-100"
                }`}
              >
                <Calculator className="w-4 h-4" />
                Calculatorius
              </button>
              <button
                onClick={() => setActiveTab("gis")}
                className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${'''
code = re.sub(bad_tab, good_tab, code)

# Add tab content
bad_content = r'''          <div className=\{activeTab === "gis" \? "block" : "hidden"\}\>'''
good_content = '''          <div className={activeTab === "calculatorius" ? "block" : "hidden"}>
            <CalculatoriusView />
          </div>

          <div className={activeTab === "gis" ? "block" : "hidden"}>'''
code = re.sub(bad_content, good_content, code)

with open('src/App.tsx', 'w') as f:
    f.write(code)
