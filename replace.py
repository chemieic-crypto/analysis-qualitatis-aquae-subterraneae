import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# 1. Remove 3D controls & Cinematic
code = re.sub(r'const \[isIsometric, setIsIsometric\] = useState\(false\);\n\s*const \[isCinematic, setIsCinematic\] = useState\(false\);\n\s*const \[cinematicAngle, setCinematicAngle\] = useState\(0\);', '', code)

# Remove animation frame for cinematic
code = re.sub(r'\s*useEffect\(\(\) => \{\n\s*let animationFrameId: number;.*?cancelAnimationFrame\(animationFrameId\);\n\s*};\n\s*\}, \[isCinematic\]\);', '', code, flags=re.DOTALL)

# Add metricType, useShortNames, pixelRatio constants near the top
code = code.replace(
    'const [mapTheme, setMapTheme] = useState<"light" | "dark" | "blueprint">("light");',
    'const [metricType, setMetricType] = useState<"exceedance" | "average" | "count">("exceedance");\n  const [useShortNames, setUseShortNames] = useState(false);\n  const pixelRatio = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) * 2 : 4; // High DPI\n  const [mapTheme, setMapTheme] = useState<"light" | "dark" | "blueprint">("light");'
)

# In handleMouseDown for map drag:
code = code.replace(
    'setDragStart({ x: e.clientX - panX, y: e.clientY - panY });',
    'setDragStart({ x: e.clientX * scaleX - panX, y: e.clientY * scaleY - panY });'
)

# In handleMouseMove for map drag:
code = code.replace(
    'setPanX(e.clientX - dragStart.x);\n      setPanY(e.clientY - dragStart.y);',
    'setPanX(e.clientX * scaleX - dragStart.x);\n      setPanY(e.clientY * scaleY - dragStart.y);'
)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
