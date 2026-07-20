import re

with open('src/components/DetailedView.tsx', 'r') as f:
    code = f.read()

old_season = r'''      let sName = "All Data";
      if \(headers\.season\) \{
        const rawS = String\(row\[headers\.season\] \|\| ""\)\.trim\(\);
        if \(rawS && rawS !== "Unknown"\) \{
          sName = rawS;
        \}
      \}'''

new_season = '''      let sName = "All Data";
      const rawS = headers.season ? String(row[headers.season] || "").trim() : "";
      const rawY = headers.year ? String(row[headers.year] || "").trim() : "";
      
      if (rawS && rawS !== "Unknown" && rawY && rawY !== "Unknown") {
        sName = `${rawS} ${rawY}`;
      } else if (rawS && rawS !== "Unknown") {
        sName = rawS;
      } else if (rawY && rawY !== "Unknown") {
        sName = rawY;
      }'''

code = re.sub(old_season, new_season, code)

with open('src/components/DetailedView.tsx', 'w') as f:
    f.write(code)
