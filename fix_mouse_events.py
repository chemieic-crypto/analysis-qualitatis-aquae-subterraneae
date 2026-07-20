import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Replace hardcoded canvasRef.current with e.currentTarget
code = code.replace(
    'const canvas = canvasRef.current;',
    'const canvas = e.currentTarget as HTMLCanvasElement;'
)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
