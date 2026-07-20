const fs = require('fs');
let code = fs.readFileSync('src/components/GisChoroplethMap.tsx', 'utf8');

// 1. Remove 3D controls & Cinematic
code = code.replace(/const \[isIsometric, setIsIsometric\] = useState\(false\);\n  const \[isCinematic, setIsCinematic\] = useState\(false\);\n  const \[cinematicAngle, setCinematicAngle\] = useState\(0\);/, '');

// Remove animation frame for cinematic
code = code.replace(/  useEffect\(\(\) => \{\n    let animationFrameId: number;\n    let lastTime = performance.now\(\);\n    const animate = \(time: number\) => \{\n      if \(isCinematic\) \{\n        const delta = time - lastTime;\n        setCinematicAngle\(\(prev\) => \(prev \+ \(delta \/ 1000\) \* 6\) % 360\);\n        lastTime = time;\n      \}\n      animationFrameId = requestAnimationFrame\(animate\);\n    \};\n    animationFrameId = requestAnimationFrame\(animate\);\n    return \(\) => \{\n      cancelAnimationFrame\(animationFrameId\);\n    \};\n  \}, \[isCinematic\]\);\n/, '');

// Add metricType, useShortNames, pixelRatio constants near the top
code = code.replace(/const \[mapTheme, setMapTheme\] = useState<"light" \| "dark" \| "blueprint">/, 
`const [metricType, setMetricType] = useState<"exceedance" | "average" | "count">("exceedance");
  const [useShortNames, setUseShortNames] = useState(false);
  const pixelRatio = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) * 2 : 4; // High DPI

  $&`);

fs.writeFileSync('src/components/GisChoroplethMap.tsx', code);
