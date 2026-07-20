import re
with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_def = r'''  const findGroupForFeature = \(f: any\) => \{'''
good_def = '''  const findGroupForFeature = (f: any, gList: any[]) => {'''
code = re.sub(bad_def, good_def, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
