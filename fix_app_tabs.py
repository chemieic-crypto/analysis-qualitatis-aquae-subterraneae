import re
with open('src/App.tsx', 'r') as f:
    code = f.read()

# 1. Add to the activeTab type definition
bad_type = r'''    "single" \| "master" \| "multi" \| "bar" \| "aisummary" \| "bulletin" \| "about" \| "guidelines" \| "ussl" \| "ranking" \| "monsoon" \| "gis" \| "choropleth" \| "hydrochemistry" \| "combination" \| "pca" \| "fortnightly" \| "limits" \| "advancedAnalysis"'''
good_type = '''    "single" | "master" | "multi" | "bar" | "aisummary" | "bulletin" | "about" | "guidelines" | "ussl" | "ranking" | "monsoon" | "gis" | "choropleth" | "hydrochemistry" | "combination" | "pca" | "fortnightly" | "limits" | "advancedAnalysis" | "calculatorius"'''
code = re.sub(bad_type, good_type, code)

# 2. Add to mobile dropdown
bad_select = r'''              <option value="gis">🌍 Geospatial Map Module</option>'''
good_select = '''              <option value="calculatorius">🧮 Calculatorius</option>\n              <option value="gis">🌍 Geospatial Map Module</option>'''
code = re.sub(bad_select, good_select, code)

# 3. Add to desktop tab array
bad_array = r'''            \{ id: "gis", label: "Geospatial Map Module", icon: Globe, baseColor: "teal" \},'''
good_array = '''            { id: "calculatorius", label: "Calculatorius", icon: Calculator, baseColor: "indigo" },\n            { id: "gis", label: "Geospatial Map Module", icon: Globe, baseColor: "teal" },'''
code = re.sub(bad_array, good_array, code)

with open('src/App.tsx', 'w') as f:
    f.write(code)
