import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Fix scaleX and scaleY in handleMouseDown
code = code.replace(
    'const scaleX = canvas.width / rect.width;\n    const scaleY = canvas.height / rect.height;',
    'const scaleX = (canvas.width / pixelRatio) / rect.width;\n    const scaleY = (canvas.height / pixelRatio) / rect.height;'
)

# And in handleCanvasClickEvent
code = code.replace(
    'const scaleX = canvas.width / rect.width;\n    const scaleY = canvas.height / rect.height;',
    'const scaleX = (canvas.width / pixelRatio) / rect.width;\n    const scaleY = (canvas.height / pixelRatio) / rect.height;'
)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
