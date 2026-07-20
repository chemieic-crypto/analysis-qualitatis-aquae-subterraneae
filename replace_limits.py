import re

with open('src/App.tsx', 'r') as f:
    code = f.read()

bad_classes = '''  const [choroplethClasses, setChoroplethClasses] = useState<{ limit: number; color: string; label: string }[]>([
    { limit: 5, color: "#22c55e", label: ">0% - 5%" },
    { limit: 10, color: "#eab308", label: ">5% - 10%" },
    { limit: 15, color: "#f97316", label: ">10% - 15%" },
    { limit: 25, color: "#ef4444", label: ">15% - 25%" },
    { limit: 100, color: "#a855f7", label: ">25%" }
  ]);'''

good_classes = '''  const [choroplethClasses, setChoroplethClasses] = useState<{ limit: number; color: string; label: string }[]>([
    { limit: 0, color: "#38bdf8", label: "No Exceedance (0%)" },
    { limit: 5, color: "#22c55e", label: ">0% - 5%" },
    { limit: 10, color: "#eab308", label: ">5% - 10%" },
    { limit: 15, color: "#f97316", label: "10% - 15%" },
    { limit: 25, color: "#ef4444", label: "15% - 25%" },
    { limit: 100, color: "#a855f7", label: ">25%" }
  ]);'''

code = code.replace(bad_classes, good_classes)

# Also remove NEW from tab names
code = code.replace('"NEW! GIS Choropleth Map"', '"GIS Choropleth Map"')
code = code.replace('✨ NEW! GIS Choropleth Map', '✨ GIS Choropleth Map')

with open('src/App.tsx', 'w') as f:
    f.write(code)
