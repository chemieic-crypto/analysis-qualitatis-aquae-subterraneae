import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# For exceedance
old_exceedance = r'''      setChoroplethClasses\(\[
        \{ limit: 0, color: "#38bdf8", label: "No Exceedance \(0%\)" \},
        \{ limit: 5, color: "#22c55e", label: ">0% - 5%" \},'''
new_exceedance = '''      setChoroplethClasses([
        { limit: 5, color: "#22c55e", label: "0% - 5%" },'''
code = re.sub(old_exceedance, new_exceedance, code)

# For App.tsx
with open('src/App.tsx', 'r') as f:
    app_code = f.read()

old_app = r'''  const \[choroplethClasses, setChoroplethClasses\] = useState<\{ limit: number; color: string; label: string \}\[\]>\(\[
    \{ limit: 0, color: "#38bdf8", label: "No Exceedance \(0%\)" \},
    \{ limit: 5, color: "#22c55e", label: ">0% - 5%" \},'''
new_app = '''  const [choroplethClasses, setChoroplethClasses] = useState<{ limit: number; color: string; label: string }[]>([
    { limit: 5, color: "#22c55e", label: "0% - 5%" },'''
app_code = re.sub(old_app, new_app, app_code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)

with open('src/App.tsx', 'w') as f:
    f.write(app_code)
