import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# 1. Remove glossary flat sheen overlay
gloss1 = r'''            // Guard against divide by zero, infinite values, or extreme shapes
            if \(Number\.isFinite\(minY\) && Number\.isFinite\(maxY\) && maxY > minY\) \{
              // Apply a premium flat glossy sheen overlay clipped to the polygon ring bounds
              ctx\.save\(\);
              ctx\.clip\(\);
              
              // Very high-gloss modern glassy gradient overlay
              const glossGrad = ctx\.createLinearGradient\(0, minY, 0, maxY\);
              glossGrad\.addColorStop\(0, "rgba\(255, 255, 255, 0\.4\)"\);
              glossGrad\.addColorStop\(0\.15, "rgba\(255, 255, 255, 0\.1\)"\);
              glossGrad\.addColorStop\(0\.5, "rgba\(0, 0, 0, 0\.0\)"\);
              glossGrad\.addColorStop\(0\.8, "rgba\(0, 0, 0, 0\.05\)"\);
              glossGrad\.addColorStop\(1, "rgba\(0, 0, 0, 0\.2\)"\);
              
              ctx\.fillStyle = glossGrad;
              ctx\.fill\(\);
              ctx\.restore\(\);
            \}'''

code = re.sub(gloss1, '', code)

# 2. Remove bounding box 3D glass sheen 
gloss2 = r'''                // Fill with a premium glossy/glassy translucent gradient overlay to create a 3D glass sheen
                const glossGrad = ctx\.createLinearGradient\(0, 0, width, height\);
                glossGrad\.addColorStop\(0, "rgba\(245, 158, 11, 0\.22\)"\); // Soft Amber
                glossGrad\.addColorStop\(0\.35, "rgba\(255, 255, 255, 0\.45\)"\); // High-reflection glossy white sheen
                glossGrad\.addColorStop\(0\.37, "rgba\(255, 255, 255, 0\.05\)"\); // Crisp sheen boundary
                glossGrad\.addColorStop\(1, "rgba\(217, 119, 6, 0\.12\)"\);   // Rich Golden Amber
                ctx\.fillStyle = glossGrad;
                ctx\.fill\(\);'''
code = re.sub(gloss2, '', code)

# 3. Remove bright highlight stroke for neon glow
gloss3 = r'''                // Second pass: vibrant highlight stroke with high-end glossy neon glow
                ctx\.save\(\);
                ctx\.strokeStyle = "#fbbf24"; // Bright Amber Gold
                ctx\.lineWidth = 2\.8;
                ctx\.lineJoin = "round";
                ctx\.shadowColor = "#f59e0b";
                ctx\.shadowBlur = 12;
                ctx\.stroke\(\);
                ctx\.restore\(\);'''
code = re.sub(gloss3, '', code)

# 4. Remove legend legSheen
gloss4 = r'''      // Shiny glossy light overlay on legend
      const legSheen = ctx\.createLinearGradient\(lX, lY, lX \+ lW, lY \+ lH\);
      legSheen\.addColorStop\(0, "rgba\(255, 255, 255, 0\.2\)"\);
      legSheen\.addColorStop\(0\.5, "rgba\(255, 255, 255, 0\)"\);
      ctx\.fillStyle = legSheen;
      ctx\.beginPath\(\);
      ctx\.roundRect\(lX, lY, lW, lH, 12\);
      ctx\.fill\(\);'''
code = re.sub(gloss4, '', code)

# 5. Remove glossy sheen overlay on squares
gloss5 = r'''        // Glossy sheen overlay on squares
        const sqGrad = ctx\.createLinearGradient\(lX \+ 12, itemY - 8, lX \+ 21, itemY \+ 1\);
        sqGrad\.addColorStop\(0, "rgba\(255, 255, 255, 0\.35\)"\);
        sqGrad\.addColorStop\(1, "rgba\(0, 0, 0, 0\.08\)"\);
        ctx\.fillStyle = sqGrad;
        ctx\.fill\(\);'''
code = re.sub(gloss5, '', code)

# 6. Remove premium glossy reflections on entire map area (Rule 3 & 7)
gloss6 = r'''    // Draw premium glossy reflections on entire map area \(Rule 3 & 7\)
    ctx\.save\(\);
    const globalGlossGrad = ctx\.createLinearGradient\(0, 0, width, height\);
    globalGlossGrad\.addColorStop\(0, "rgba\(255, 255, 255, 0\.09\)"\);
    globalGlossGrad\.addColorStop\(0\.4, "rgba\(255, 255, 255, 0\.04\)"\);
    globalGlossGrad\.addColorStop\(0\.41, "rgba\(255, 255, 255, 0\)"\);
    ctx\.fillStyle = globalGlossGrad;
    ctx\.fillRect\(0, 0, width, height\);
    ctx\.restore\(\);'''
code = re.sub(gloss6, '', code)

# 7. Remove the manual exceedance 0 push in legend 
# (Since it's now dynamically pulled from activeClasses)
legend_push = r'''    if \(metricType === "exceedance"\) activeLegendClasses\.push\(\{ color: "#38bdf8", label: "0%" \}\);'''
code = re.sub(legend_push, '', code)

# 8. Legend label logic: it overrides with rangeText. We should only use rangeText if cls.label is not provided or is very default. Wait!
# Actually, since we want the users to see exactly what they enter, we should always prefer cls.label!
# But the previous code had: `activeLegendClasses.push({ color: cls.color, label: cls.label || rangeText });`
# Which already prefers cls.label. However, earlier in the code there's rangeText generation. Let's make sure it doesn't break anything.

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
