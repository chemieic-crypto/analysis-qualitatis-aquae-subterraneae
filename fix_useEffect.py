import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_chunk = r'''    if \(true\) \{
      setChoroplethClasses\(\[
        \{ limit: 5, color: "#22c55e", label: "0% - 5%" \},
        \{ limit: 10, color: "#eab308", label: ">5% - 10%" \},
        \{ limit: 15, color: "#f97316", label: "10% - 15%" \},
        \{ limit: 25, color: "#ef4444", label: "15% - 25%" \},
        \{ limit: 100, color: "#a855f7", label: ">25%" \}
      \]\);
    \},
        \{ limit: step, color: "#22c55e", label: `1 - \$\{step\}` \},
        \{ limit: step \* 2, color: "#eab308", label: `> \$\{step\} - \$\{step \* 2\}` \},
        \{ limit: step \* 3, color: "#f97316", label: `> \$\{step \* 2\} - \$\{step \* 3\}` \},
        \{ limit: 999999, color: "#ef4444", label: `> \$\{step \* 3\}` \}
      \]\);
    \}
  \}, \[activeParam, groupList\]\);'''

good_chunk = '''    // Defaults only run if classes were reset (already removed from metric switch)
  }, [activeParam, groupList]);'''

code = re.sub(bad_chunk, good_chunk, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
