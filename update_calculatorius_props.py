import re
with open('src/App.tsx', 'r') as f:
    code = f.read()

bad_call = r'''          <div className=\{activeTab === "calculatorius" \? "block" : "hidden"\}\>
            <CalculatoriusView />
          </div>'''
good_call = '''          <div className={activeTab === "calculatorius" ? "block" : "hidden"}>
            <CalculatoriusView rawData={rawData} headerMap={headerMap} />
          </div>'''
code = re.sub(bad_call, good_call, code)

with open('src/App.tsx', 'w') as f:
    f.write(code)
