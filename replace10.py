import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Replace map centroid labels
label_orig = '''      const displayName = nameOverrides[g.name] || g.name;
      const shortName = displayName.length > 12 ? displayName.substring(0, 10) + ".." : displayName;
      ctx.fillText(shortName, sx, sy);'''

label_new = '''      let displayName = nameOverrides[g.name] || g.name;
      if (useShortNames) {
        displayName = getShortName(displayName, reportingLevel, useShortNames);
      }
      const shortName = displayName.length > 15 ? displayName.substring(0, 13) + ".." : displayName;
      ctx.fillText(shortName, sx, sy);'''

code = code.replace(label_orig, label_new)

# Replace shapefile labels
shp_label_orig = '''                  const labelText = f.properties && f.properties[labelField] ? String(f.properties[labelField]) : "";
                  if (labelText) {
                    ctx.font = `${stateFontStyle} ${stateFontSize || layer.labelSize || 9}px ${stateFontFamily || "sans-serif"}`;
                    ctx.fillStyle = stateFontColor || layer.labelColor || "#0f172a";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(labelText, sx, sy); // Render with transparent background, no white border strokeText
                  }'''

shp_label_new = '''                  let labelText = f.properties && f.properties[labelField] ? String(f.properties[labelField]) : "";
                  if (labelText && useShortNames) {
                    labelText = getShortName(labelText, reportingLevel, useShortNames);
                  }
                  if (labelText) {
                    ctx.font = `${stateFontStyle} ${stateFontSize || layer.labelSize || 9}px ${stateFontFamily || "sans-serif"}`;
                    ctx.fillStyle = stateFontColor || layer.labelColor || "#0f172a";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(labelText, sx, sy); // Render with transparent background, no white border strokeText
                  }'''

code = code.replace(shp_label_orig, shp_label_new)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
