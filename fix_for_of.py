import re
with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad = r'''    for \(const g of groupList\) \{'''
good = '''    for (const g of gList) {'''

code = re.sub(bad, good, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
