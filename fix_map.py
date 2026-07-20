import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Add showRegionNames state
state_font = r'  const \[stateFontSize, setStateFontSize\] = useState<number>\(10\);'
new_state = '''  const [stateFontSize, setStateFontSize] = useState<number>(10);
  const [showRegionNames, setShowRegionNames] = useState<boolean>(true);
  const [drawnNames] = useState<Set<string>>(new Set());'''

code = re.sub(state_font, new_state, code)

# Update getFuzzyScore
old_norm = r'\.replace\(/\\b\(state\|ut\|union territory\|islands\?\|and\)\\b/g, ""\)'
new_norm = r'.replace(/\\b(state|ut|union territory|islands?|and|district|dist|city)\\b/g, "")'
code = code.replace(old_norm, new_norm)

# Update threshold to 0.45
old_thresh = r'if \(bestScore >= 0\.55\) \{'
new_thresh = r'if (bestScore >= 0.45) {'
code = code.replace(old_thresh, new_thresh)

# In the render Map function, clear drawnNames
old_render_start = r'    ctx\.clearRect\(0, 0, width, height\);'
new_render_start = '''    ctx.clearRect(0, 0, width, height);
    drawnNames.clear();'''
code = code.replace(old_render_start, new_render_start)

# In the GeoJSON drawing loop
old_geojson_text = r'''                if \(baseLabel\) \{
                  const labelText = nameOverrides\[baseLabel\] \|\| baseLabel;
                  ctx\.font = `\$\{stateFontStyle\} \$\{stateFontSize \|\| layer\.labelSize \|\| 9\}px \$\{stateFontFamily \|\| "sans-serif"\}`;
                  ctx\.fillStyle = stateFontColor \|\| layer\.labelColor \|\| "#0f172a";
                  ctx\.textAlign = "center";
                  ctx\.textBaseline = "middle";
                  ctx\.fillText\(labelText, sx, sy\); // Render with transparent background, no white border strokeText
                \}'''
new_geojson_text = '''                if (showRegionNames && baseLabel) {
                  const labelText = nameOverrides[baseLabel] || baseLabel;
                  const labelLower = labelText.trim().toLowerCase();
                  if (!drawnNames.has(labelLower)) {
                    drawnNames.add(labelLower);
                    ctx.font = `${stateFontStyle} ${stateFontSize || layer.labelSize || 9}px ${stateFontFamily || "sans-serif"}`;
                    ctx.fillStyle = stateFontColor || layer.labelColor || "#0f172a";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(labelText, sx, sy);
                  }
                }'''
code = re.sub(old_geojson_text, new_geojson_text, code)

# In the Centroid drawing loop
old_centroid_text = r'''    // Draw Centroids as text labels \(Rule 11: Just show only state name, do not show any stats or circles on map!\)
    screenCentroids\.forEach\(\(\{ sx, sy, g \}\) => \{
      if \(sx < -20 \|\| sx > width \+ 20 \|\| sy < -20 \|\| sy > height \+ 20\) return;

      ctx\.save\(\);
      ctx\.font = `\$\{stateFontStyle\} \$\{stateFontSize\}px \$\{stateFontFamily\}`;
      ctx\.fillStyle = stateFontColor;
      ctx\.textAlign = "center";
      
      let displayName = nameOverrides\[g\.name\] \|\| g\.name;
      if \(useShortNames\) \{
        displayName = getShortName\(displayName, reportingLevel, useShortNames\);
      \}
      const shortName = displayName\.length > 15 \? displayName\.substring\(0, 13\) \+ "\.\." : displayName;
      ctx\.fillText\(shortName, sx, sy\);
      ctx\.restore\(\);
    \}\);'''

new_centroid_text = '''    // Draw Centroids as text labels
    if (showRegionNames) {
      screenCentroids.forEach(({ sx, sy, g }) => {
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) return;
        
        let displayName = nameOverrides[g.name] || g.name;
        if (useShortNames) {
          displayName = getShortName(displayName, reportingLevel, useShortNames);
        }
        const shortName = displayName.length > 15 ? displayName.substring(0, 13) + ".." : displayName;
        const labelLower = displayName.trim().toLowerCase();
        
        if (!drawnNames.has(labelLower)) {
          drawnNames.add(labelLower);
          ctx.save();
          ctx.font = `${stateFontStyle} ${stateFontSize}px ${stateFontFamily}`;
          ctx.fillStyle = stateFontColor;
          ctx.textAlign = "center";
          ctx.fillText(shortName, sx, sy);
          ctx.restore();
        }
      });
    }'''
code = re.sub(old_centroid_text, new_centroid_text, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
