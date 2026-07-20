import re
with open('src/App.tsx', 'r') as f:
    code = f.read()

bad_call = r'''                  \{rawData\.length > 0 \? \(
                    <GisChoroplethMap
                      rawData=\{yearSeasonFilteredData\}'''
good_call = '''                  {rawData.length > 0 ? (
                    <GisChoroplethMap
                      rawData={yearFilteredData}'''
code = re.sub(bad_call, good_call, code)

with open('src/App.tsx', 'w') as f:
    f.write(code)
