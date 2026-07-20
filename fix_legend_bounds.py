import re
with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Replace hardcoded 110 for legend interactions
code = re.sub(
    r'y <= legendPos\.y \+ 110', 
    r'y <= legendPos.y + Math.max(110, (activeClasses.length + 2) * 15 + 30)', 
    code
)
code = re.sub(
    r'canvas\.height - 110', 
    r'canvas.height - Math.max(110, (activeClasses.length + 2) * 15 + 30)', 
    code
)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
