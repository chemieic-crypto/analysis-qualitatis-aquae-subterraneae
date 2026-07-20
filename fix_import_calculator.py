import re
with open('src/App.tsx', 'r') as f:
    code = f.read()

code = code.replace('Map\n} from "lucide-react";', 'Map,\n  Calculator\n} from "lucide-react";')

with open('src/App.tsx', 'w') as f:
    f.write(code)
