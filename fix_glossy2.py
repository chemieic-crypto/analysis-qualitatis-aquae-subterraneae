import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# 1. First glossGrad in drawPolygonRing
gloss1 = r'''              // Very high-gloss modern glassy gradient overlay
              const glossGrad = ctx\.createLinearGradient\(0, minY, 0, maxY\);
              glossGrad\.addColorStop\(0, "rgba\(255, 255, 255, 0\.55\)"\); // Bright top reflection
              glossGrad\.addColorStop\(0\.20, "rgba\(255, 255, 255, 0\.15\)"\); // Smooth fade
              glossGrad\.addColorStop\(0\.50, "rgba\(0, 0, 0, 0\.0\)"\); // Neutral middle
              glossGrad\.addColorStop\(0\.85, "rgba\(0, 0, 0, 0\.08\)"\); // Soft shadow
              glossGrad\.addColorStop\(1, "rgba\(0, 0, 0, 0\.25\)"\); // Deep base shadow
              
              ctx\.fillStyle = glossGrad;
              ctx\.fill\(\);
              ctx\.restore\(\);'''
code = re.sub(gloss1, '', code)
code = re.sub(r'ctx\.clip\(\);\s*', '', code)

# 2. Second glossGrad in Voronoi
gloss2 = r'''        // Apply a high-gloss glassy sheen overlay clipped to the Voronoi boundaries
        const glossGrad = ctx\.createLinearGradient\(0, 0, 0, height\);
        glossGrad\.addColorStop\(0, "rgba\(255, 255, 255, 0\.55\)"\); // Bright top
        glossGrad\.addColorStop\(0\.25, "rgba\(255, 255, 255, 0\.15\)"\);
        glossGrad\.addColorStop\(0\.50, "rgba\(0, 0, 0, 0\.0\)"\);
        glossGrad\.addColorStop\(0\.80, "rgba\(0, 0, 0, 0\.08\)"\);
        glossGrad\.addColorStop\(1, "rgba\(0, 0, 0, 0\.25\)"\);
        ctx\.fillStyle = glossGrad;
        ctx\.fill\(\);
        ctx\.restore\(\);'''
code = re.sub(gloss2, '', code)

# 3. Third globalGlossGrad
gloss3 = r'''    // Draw premium glossy reflections on entire map area \(Rule 3 & 7\)
    ctx\.save\(\);
    const globalGlossGrad = ctx\.createLinearGradient\(0, 0, width, height\);
    globalGlossGrad\.addColorStop\(0, "rgba\(255, 255, 255, 0\.09\)"\);
    globalGlossGrad\.addColorStop\(0\.4, "rgba\(255, 255, 255, 0\.04\)"\);
    globalGlossGrad\.addColorStop\(0\.41, "rgba\(255, 255, 255, 0\)"\);
    ctx\.fillStyle = globalGlossGrad;
    ctx\.fillRect\(0, 0, width, height\);
    ctx\.restore\(\);'''
code = re.sub(gloss3, '', code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
