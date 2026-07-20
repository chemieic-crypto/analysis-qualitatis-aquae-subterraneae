import re
with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_lh = r'''    const lW = 160;
    const lH = 110;'''
good_lh = '''    const lW = 160;
    const lH = Math.max(110, (activeClasses.length + 2) * 15 + 30);'''
code = re.sub(bad_lh, good_lh, code)
with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
