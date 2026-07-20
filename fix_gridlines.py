with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

code = code.replace("  const [showGridLines,\n    showGridLines, setShowGridLines] = useState(true);", "  const [showGridLines, setShowGridLines] = useState(true);")

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
