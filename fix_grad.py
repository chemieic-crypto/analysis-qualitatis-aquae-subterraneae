import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Match the first gradient block
code = re.sub(r'              // Very high-gloss modern glassy gradient overlay\s+const glossGrad = ctx\.createLinearGradient[\s\S]*?ctx\.restore\(\);', '', code)

# Match the second gradient block
code = re.sub(r'        // Apply a high-gloss glassy sheen overlay clipped to the Voronoi boundaries\s+const glossGrad = ctx\.createLinearGradient[\s\S]*?ctx\.restore\(\);', '', code)

# Match the third gradient block
code = re.sub(r'    // Draw premium glossy reflections on entire map area \(Rule 3 & 7\)\s+ctx\.save\(\);\s+const globalGlossGrad = ctx\.createLinearGradient[\s\S]*?ctx\.restore\(\);', '', code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
