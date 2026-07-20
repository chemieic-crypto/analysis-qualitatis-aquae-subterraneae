import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Fix bounds checks
bounds_checks_orig = '''    if (isDraggingNorthArrow) {
      setNorthArrowPos({
        x: Math.max(10, Math.min(canvas.width - 10, x - dragElementStartOffset.current.x)),
        y: Math.max(10, Math.min(canvas.height - 10, y - dragElementStartOffset.current.y))
      });
    } else if (isDraggingLegend) {
      setLegendPos({
        x: Math.max(10, Math.min(canvas.width - 160, x - dragElementStartOffset.current.x)),
        y: Math.max(10, Math.min(canvas.height - 110, y - dragElementStartOffset.current.y))
      });
    } else if (isDraggingTitle) {
      setTitlePos({
        x: Math.max(10, Math.min(canvas.width - 250, x - dragElementStartOffset.current.x)),
        y: Math.max(10, Math.min(canvas.height - 30, y - dragElementStartOffset.current.y))
      });
    }'''

bounds_checks_new = '''    if (isDraggingNorthArrow) {
      setNorthArrowPos({
        x: Math.max(10, Math.min((canvas.width / pixelRatio) - 10, x - dragElementStartOffset.current.x)),
        y: Math.max(10, Math.min((canvas.height / pixelRatio) - 10, y - dragElementStartOffset.current.y))
      });
    } else if (isDraggingLegend) {
      setLegendPos({
        x: Math.max(10, Math.min((canvas.width / pixelRatio) - 160, x - dragElementStartOffset.current.x)),
        y: Math.max(10, Math.min((canvas.height / pixelRatio) - 110, y - dragElementStartOffset.current.y))
      });
    } else if (isDraggingTitle) {
      setTitlePos({
        x: Math.max(10, Math.min((canvas.width / pixelRatio) - 250, x - dragElementStartOffset.current.x)),
        y: Math.max(10, Math.min((canvas.height / pixelRatio) - 30, y - dragElementStartOffset.current.y))
      });
    }'''

code = code.replace(bounds_checks_orig, bounds_checks_new)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
